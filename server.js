require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ links: {}, orders: [] }, null, 2));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
const writeDb = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

async function fetchCompat(...args) {
  if (typeof fetch === 'function') return fetch(...args);
  const mod = await import('node-fetch');
  return mod.default(...args);
}

function inferBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${req.get('host')}`.replace(/\/$/, '');
}

function getBaseUrl(req) {
  const raw = String(process.env.APP_BASE_URL || '').trim();
  return raw ? raw.replace(/\/$/, '') : inferBaseUrl(req);
}

function getRedirectUri(req) {
  const raw = String(process.env.DISCORD_REDIRECT_URI || '').trim();
  return raw ? raw.replace(/\/$/, '') : `${getBaseUrl(req)}/auth/discord/callback`;
}

function secureCookies(req) {
  const base = String(process.env.APP_BASE_URL || '').trim();
  if (base.startsWith('http://')) return false;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').split(',')[0].trim();
  return proto === 'https';
}

function html(title, message, detail = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
  body{margin:0;font-family:Inter,Arial,sans-serif;background:#0c1019;color:#eef2ff;display:grid;place-items:center;min-height:100vh;padding:24px}
  .box{width:min(760px,100%);background:#151b28;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  h1{margin:0 0 12px;font-size:28px}.muted{color:#b9c1d9;line-height:1.6}.code{margin-top:16px;padding:14px;border-radius:14px;background:#0c111a;border:1px solid rgba(255,255,255,.08);white-space:pre-wrap;word-break:break-word;color:#ffd5aa}
  a.btn{display:inline-block;margin-top:18px;padding:12px 16px;border-radius:12px;background:#ff8c2f;color:#121212;text-decoration:none;font-weight:800}
  </style></head><body><div class="box"><h1>${title}</h1><div class="muted">${message}</div>${detail ? `<div class="code">${detail}</div>` : ''}<a class="btn" href="/login.html">Voltar ao login</a></div></body></html>`;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    host: req.get('host'),
    baseUrl: getBaseUrl(req),
    redirectUri: getRedirectUri(req),
    hasClientId: !!String(process.env.DISCORD_CLIENT_ID || '').trim(),
    hasClientSecret: !!String(process.env.DISCORD_CLIENT_SECRET || '').trim(),
    secureCookies: secureCookies(req)
  });
});

app.get('/auth/discord/login', (req, res) => {
  const clientId = String(process.env.DISCORD_CLIENT_ID || '').trim();
  if (!clientId) {
    return res.status(500).send(html('Discord não configurado', 'Falta DISCORD_CLIENT_ID no ambiente.'));
  }

  const state = crypto.randomBytes(16).toString('hex');
  const next = String(req.query.next || '/dashboard.html');
  res.cookie('argos_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(req),
    maxAge: 10 * 60 * 1000
  });
  res.cookie('argos_oauth_next', next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(req),
    maxAge: 10 * 60 * 1000
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(req),
    scope: 'identify email',
    state,
    prompt: 'consent'
  });

  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback.html', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/auth/discord/callback${qs}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      return res.status(400).send(html('Falha ao concluir login', `${error}${error_description ? ` - ${error_description}` : ''}`));
    }
    if (!code) {
      return res.status(400).send(html('Falha ao concluir login', 'O Discord não retornou o parâmetro code.'));
    }

    const cookieState = req.cookies.argos_oauth_state;
    if (!cookieState || cookieState !== state) {
      return res.status(400).send(html('Falha ao concluir login', 'State inválido ou expirado.'));
    }

    const body = new URLSearchParams({
      client_id: String(process.env.DISCORD_CLIENT_ID || '').trim(),
      client_secret: String(process.env.DISCORD_CLIENT_SECRET || '').trim(),
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: getRedirectUri(req)
    });

    const tokenResp = await fetchCompat('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'ArgosRJ/1.0'
      },
      body
    });

    const tokenText = await tokenResp.text();
    let tokenJson;
    try { tokenJson = JSON.parse(tokenText); } catch {}

    if (!tokenResp.ok) {
      return res.status(tokenResp.status).send(
        html(
          'Falha ao concluir login',
          'O Discord rejeitou a troca do código por token.',
          tokenJson ? JSON.stringify(tokenJson, null, 2) : tokenText.slice(0, 500)
        )
      );
    }

    const meResp = await fetchCompat('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': `Bearer ${tokenJson.access_token}`,
        'Accept': 'application/json',
        'User-Agent': 'ArgosRJ/1.0'
      }
    });

    const meText = await meResp.text();
    let meJson;
    try { meJson = JSON.parse(meText); } catch {}

    if (!meResp.ok || !meJson) {
      return res.status(meResp.status || 500).send(
        html(
          'Falha ao buscar usuário',
          'Não foi possível obter os dados do usuário no Discord.',
          meJson ? JSON.stringify(meJson, null, 2) : meText.slice(0, 500)
        )
      );
    }

    const db = readDb();
    db.lastLogin = {
      id: meJson.id,
      username: meJson.username,
      global_name: meJson.global_name || '',
      avatar: meJson.avatar || '',
      email: meJson.email || ''
    };
    writeDb(db);

    const next = req.cookies.argos_oauth_next || '/dashboard.html';
    const payload = {
      name: meJson.global_name || meJson.username || 'Player Argos',
      discordUser: meJson.username || 'discord',
      discordTag: meJson.discriminator && meJson.discriminator !== '0' ? `${meJson.username}#${meJson.discriminator}` : meJson.username,
      role: 'Player Argos',
      joined: '2026',
      avatar: meJson.avatar ? `https://cdn.discordapp.com/avatars/${meJson.id}/${meJson.avatar}.png?size=256` : ''
    };

    const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');

    res.clearCookie('argos_oauth_state');
    res.clearCookie('argos_oauth_next');
    return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Login concluído</title></head><body><script>
      localStorage.setItem('argos_user', JSON.stringify(${safeJson}));
      window.location.replace(${JSON.stringify(next)});
    </script></body></html>`);
  } catch (err) {
    return res.status(500).send(html('Falha ao concluir login', err.message || 'Erro interno no callback.'));
  }
});

app.get('/api/server/status', async (req, res) => {
  return res.json({ online: true, players: 0, maxPlayers: 1024, message: 'Configure STATUS_API_URL para status real.' });
});

app.listen(PORT, () => {
  console.log(`Argos RJ online em http://localhost:${PORT}`);
});
