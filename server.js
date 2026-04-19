
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(v => v.trim()) : '*'
}));

const PORT = process.env.PORT || 3000;
const LOG_LIMIT = 300;
const state = {
  logs: [],
  frontendPing: null,
  firebaseConnected: false,
  firebaseError: null,
  serviceAccountLoaded: false,
  lastWorkerRunAt: null
};

function addLog(message, type='info'){
  const entry = { message, type, time: new Date().toISOString() };
  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, LOG_LIMIT);
  console.log(`[${type}] ${message}`);
}

let admin = null;
let db = null;
try{
  const servicePath = path.join(__dirname, 'serviceAccount.json');
  if (fs.existsSync(servicePath)) {
    state.serviceAccountLoaded = true;
    admin = require('firebase-admin');
    const serviceAccount = require(servicePath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DB || serviceAccount.databaseURL
    });
    db = admin.database();
    state.firebaseConnected = true;
    addLog('Firebase Admin conectado com sucesso.');
  } else {
    state.firebaseError = 'serviceAccount.json não encontrado';
    addLog('Firebase Admin não carregado: serviceAccount.json não encontrado.', 'warn');
  }
}catch(err){
  state.firebaseError = err.message;
  addLog(`Erro ao conectar Firebase Admin: ${err.message}`, 'error');
}

function buildPixPayload(order){
  const amount = Number(order?.totals?.total || order?.total || 0).toFixed(2);
  const orderId = order?.orderId || order?.id || 'SEM-ID';
  const gameId = order?.gameId || 'SEM-GAME-ID';
  const payer = order?.email || order?.user?.name || 'cliente';
  // payload textual interno/simulado para QR local via backend
  return [
    'ARGOSRJ',
    `ORDER:${orderId}`,
    `TOTAL:${amount}`,
    `GAME:${gameId}`,
    `PAYER:${payer}`,
    `CREATED:${new Date().toISOString()}`
  ].join('|');
}

async function generatePaymentForOrder(userId, order){
  const orderId = order.orderId || order.id;
  const pixCode = buildPixPayload(order);
  const qrImage = await QRCode.toDataURL(pixCode, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320
  });
  const payment = {
    method: order.method || 'pix',
    status: 'waiting_payment',
    provider: 'firebase-backend',
    pixCode,
    qrImage,
    qrText: 'Escaneie o QR Code ou copie o código PIX abaixo para concluir o pagamento.',
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    approvedAt: '',
    deliveredAt: ''
  };
  await db.ref(`siteOrders/${userId}/${orderId}/payment`).set(payment);
  await db.ref(`siteOrders/${userId}/${orderId}/status`).set('waiting_payment');
  await db.ref(`siteOrders/${userId}/${orderId}/updatedAt`).set(new Date().toISOString());
  addLog(`Pagamento gerado para o pedido ${orderId} do usuário ${userId}.`);
}

async function deliverOrder(userId, orderId){
  const orderSnap = await db.ref(`siteOrders/${userId}/${orderId}`).get();
  if(!orderSnap.exists()) throw new Error('Pedido não encontrado.');
  const order = orderSnap.val();
  if(order.delivered) return;
  const items = Array.isArray(order.items) ? order.items : [];
  const userRef = db.ref(`siteUsers/${userId}`);
  const userSnap = await userRef.get();
  const userData = userSnap.exists() ? userSnap.val() : {};
  const inventory = Array.isArray(userData.inventory) ? userData.inventory : [];
  const currentBoxes = Number(userData.boxes?.owned || 0);
  const currentBalance = Number(userData.checkout?.balance || 0);

  let addBoxes = 0;
  let addBalance = 0;
  items.forEach(item => {
    const type = String(item.type || '').toLowerCase();
    const name = String(item.name || '').toLowerCase();
    if(type === 'caixa' || name.includes('caixa')) addBoxes += 1;
    if(type === 'coins') {
      const match = name.match(/(\d+)/);
      addBalance += match ? Number(match[1]) : 0;
    }
  });

  await userRef.update({
    boxes: { owned: currentBoxes + addBoxes },
    checkout: {
      ...(userData.checkout || {}),
      balance: currentBalance + addBalance
    },
    updatedAt: new Date().toISOString()
  });

  await db.ref(`siteOrders/${userId}/${orderId}/delivered`).set(true);
  await db.ref(`siteOrders/${userId}/${orderId}/payment/deliveredAt`).set(new Date().toISOString());
  addLog(`Entrega aplicada no usuário ${userId} para o pedido ${orderId}. Boxes +${addBoxes}, Coins +${addBalance}.`, 'info');
}

async function workerCycle(){
  if(!db) return;
  state.lastWorkerRunAt = new Date().toISOString();

  const ordersSnap = await db.ref('siteOrders').get();
  const orders = ordersSnap.val() || {};
  for (const [userId, userOrders] of Object.entries(orders)) {
    for (const [orderId, order] of Object.entries(userOrders || {})) {
      const payment = order.payment || {};
      if ((order.status === 'queued' || payment.status === 'queued') && !payment.qrImage) {
        try {
          await generatePaymentForOrder(userId, order);
        } catch(err){
          addLog(`Falha ao gerar pagamento do pedido ${orderId}: ${err.message}`, 'error');
        }
      }
      if (order.status === 'approved' && !order.delivered) {
        try {
          await deliverOrder(userId, orderId);
        } catch(err){
          addLog(`Falha ao entregar pedido ${orderId}: ${err.message}`, 'error');
        }
      }
    }
  }

  // confirmar vínculos feitos no backend/jogo
  const linkSnap = await db.ref('linkRequests').get();
  const linkRequests = linkSnap.val() || {};
  for (const [discordId, reqData] of Object.entries(linkRequests)) {
    if (reqData.status === 'confirmed') {
      await db.ref(`siteUsers/${discordId}/gameLink`).update({
        gameId: reqData.gameId || '',
        code: reqData.code || '',
        status: 'confirmed',
        confirmed: true,
        requestedAt: reqData.createdAt || '',
        confirmedAt: reqData.confirmedAt || new Date().toISOString()
      });
    }
  }
}

app.get('/api/health', async (req, res) => {
  let databaseReadable = false;
  let databaseMessage = state.firebaseError || null;
  if (db){
    try{
      await db.ref('/').child('siteUsers').limitToFirst(1).get();
      databaseReadable = true;
      databaseMessage = 'ok';
    }catch(err){
      databaseMessage = err.message;
    }
  }
  res.json({
    ok: true,
    backend: true,
    firebaseConnected: state.firebaseConnected,
    databaseReadable,
    databaseMessage,
    serviceAccountLoaded: state.serviceAccountLoaded,
    frontendPing: state.frontendPing,
    lastWorkerRunAt: state.lastWorkerRunAt
  });
});

app.post('/api/front-ping', (req, res) => {
  state.frontendPing = {
    origin: req.body.origin || null,
    page: req.body.page || null,
    userId: req.body.userId || null,
    time: req.body.time || Date.now()
  };
  addLog(`Ping do frontend recebido de ${state.frontendPing.origin || 'origem desconhecida'}.`);
  res.json({ ok:true });
});

app.get('/api/logs', (req, res) => res.json({ ok:true, logs: state.logs }));

app.get('/api/summary', async (req, res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const [users, orders, links] = await Promise.all([
      db.ref('siteUsers').get(),
      db.ref('siteOrders').get(),
      db.ref('linkRequests').get()
    ]);
    const usersVal = users.val() || {};
    const ordersVal = orders.val() || {};
    const linksVal = links.val() || {};
    const totalUsers = Object.keys(usersVal).length;
    const totalLinks = Object.keys(linksVal).length;
    let totalOrders = 0;
    let waitingPayment = 0;
    let approved = 0;
    Object.values(ordersVal).forEach(playerOrders => Object.values(playerOrders || {}).forEach(order => {
      totalOrders += 1;
      if(order.status === 'waiting_payment') waitingPayment += 1;
      if(order.status === 'approved') approved += 1;
    }));
    res.json({ ok:true, totalUsers, totalOrders, totalLinks, waitingPayment, approved });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.get('/api/users', async (req,res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const snap = await db.ref('siteUsers').get();
    const val = snap.val() || {};
    const items = Object.entries(val).map(([id, data]) => ({
      discordId: id,
      name: data.profile?.name || '-',
      username: data.profile?.discordUser || '-',
      gameId: data.gameLink?.gameId || '-',
      linkStatus: data.gameLink?.status || 'pending',
      skins: Array.isArray(data.inventory) ? data.inventory.length : Object.keys(data.inventory || {}).length,
      boxes: Number(data.boxes?.owned || 0)
    }));
    res.json({ ok:true, items });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.get('/api/orders', async (req,res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const snap = await db.ref('siteOrders').get();
    const val = snap.val() || {};
    const items = [];
    Object.entries(val).forEach(([userId, orders]) => {
      Object.values(orders || {}).forEach(order => items.push({ userId, ...order }));
    });
    items.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ ok:true, items });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.post('/api/orders/:userId/:orderId/approve', async (req,res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const { userId, orderId } = req.params;
    await db.ref(`siteOrders/${userId}/${orderId}`).update({
      status: 'approved',
      updatedAt: new Date().toISOString()
    });
    await db.ref(`siteOrders/${userId}/${orderId}/payment`).update({
      status: 'approved',
      approvedAt: new Date().toISOString()
    });
    addLog(`Pedido ${orderId} aprovado manualmente pelo painel.`);
    res.json({ ok:true });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.post('/api/orders/:userId/:orderId/reject', async (req,res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const { userId, orderId } = req.params;
    await db.ref(`siteOrders/${userId}/${orderId}`).update({
      status: 'rejected',
      updatedAt: new Date().toISOString()
    });
    await db.ref(`siteOrders/${userId}/${orderId}/payment`).update({
      status: 'rejected'
    });
    addLog(`Pedido ${orderId} rejeitado manualmente pelo painel.`, 'warn');
    res.json({ ok:true });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.post('/api/links/:discordId/confirm', async (req,res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const { discordId } = req.params;
    const snap = await db.ref(`linkRequests/${discordId}`).get();
    if(!snap.exists()) return res.status(404).json({ ok:false, message:'Pedido de vínculo não encontrado.' });
    const val = snap.val();
    await db.ref(`linkRequests/${discordId}`).update({
      status: 'confirmed',
      confirmedAt: new Date().toISOString()
    });
    await db.ref(`siteUsers/${discordId}/gameLink`).update({
      gameId: val.gameId || '',
      code: val.code || '',
      status: 'confirmed',
      confirmed: true,
      requestedAt: val.createdAt || '',
      confirmedAt: new Date().toISOString()
    });
    addLog(`Vínculo do usuário ${discordId} confirmado pelo painel.`);
    res.json({ ok:true });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.get('/api/link-requests', async (req,res) => {
  try{
    if (!db) return res.status(500).json({ ok:false, message:'Firebase Admin não configurado.' });
    const snap = await db.ref('linkRequests').get();
    const val = snap.val() || {};
    const items = Object.entries(val).map(([discordId, item]) => ({ discordId, ...item }));
    items.sort((a,b)=> String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ ok:true, items });
  }catch(err){
    res.status(500).json({ ok:false, message: err.message });
  }
});

app.get('/admin', (req,res) => {
  res.send(`<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Argos RJ • Backend Admin</title>
    <style>
      :root{--bg:#0b1017;--panel:#121a25;--stroke:rgba(255,255,255,.08);--text:#ecf2ff;--muted:#9fb0ca;--gold:#d7a64a;--ok:#3ddc97;--warn:#ffb020;--danger:#ff6b6b}
      *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#091019,#0c121c);color:var(--text);font-family:Inter,Arial,sans-serif}
      .container{width:min(1220px,calc(100% - 32px));margin:0 auto}.hero{padding:30px 0}.grid{display:grid;gap:16px}.g4{grid-template-columns:repeat(4,1fr)}.g2{grid-template-columns:repeat(2,1fr)}
      .card{background:rgba(255,255,255,.03);border:1px solid var(--stroke);border-radius:20px;padding:20px}
      h1,h2,h3{margin:0 0 12px}.muted{color:var(--muted)} .k{font-size:28px;font-weight:900}
      table{width:100%;border-collapse:separate;border-spacing:0 10px}th,td{text-align:left;padding:12px 10px}tr{background:rgba(255,255,255,.03)}
      .pill{display:inline-block;padding:7px 10px;border-radius:999px;border:1px solid var(--stroke)}
      pre{white-space:pre-wrap;background:#0f1722;padding:14px;border-radius:16px;border:1px solid var(--stroke);max-height:340px;overflow:auto}
      button{padding:9px 12px;border-radius:10px;border:0;cursor:pointer;font-weight:700}
      .okb{background:#2f9e62;color:#fff}.warnb{background:#c48b24;color:#111}.dangerb{background:#c44a4a;color:#fff}
      @media(max-width:980px){.g4,.g2{grid-template-columns:1fr}}
    </style>
  </head>
  <body>
    <section class="hero"><div class="container grid">
      <div class="card">
        <h1>Painel backend • Argos RJ</h1>
        <div class="muted">Backend conectado ao mesmo Firebase do site. Ele lê pedidos do checkout, gera QR Code, confirma vínculos e permite aprovar pedidos pelo painel.</div>
      </div>
      <div class="grid g4">
        <div class="card"><div class="muted">Backend</div><div class="k" id="kBackend">--</div></div>
        <div class="card"><div class="muted">Firebase</div><div class="k" id="kFirebase">--</div></div>
        <div class="card"><div class="muted">Frontend</div><div class="k" id="kFrontend">--</div></div>
        <div class="card"><div class="muted">Usuários</div><div class="k" id="kUsers">--</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>Resumo</h2><div id="summaryWrap" class="muted">Carregando...</div></div>
        <div class="card"><h2>Último ping do frontend</h2><pre id="pingBox">Carregando...</pre></div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>Pedidos</h2><div style="overflow:auto"><table><thead><tr><th>Pedido</th><th>User</th><th>Status</th><th>Total</th><th>Ação</th></tr></thead><tbody id="ordersBody"></tbody></table></div></div>
        <div class="card"><h2>Pedidos de vínculo</h2><div style="overflow:auto"><table><thead><tr><th>Discord</th><th>ID do jogo</th><th>Status</th><th>Ação</th></tr></thead><tbody id="linksBody"></tbody></table></div></div>
      </div>
      <div class="card"><h2>Usuários</h2><div style="overflow:auto"><table><thead><tr><th>Nome</th><th>Discord</th><th>Game ID</th><th>Vínculo</th><th>Skins</th><th>Caixas</th></tr></thead><tbody id="usersBody"></tbody></table></div></div>
      <div class="card"><h2>Logs</h2><pre id="logsBox">Carregando...</pre></div>
    </div></section>
    <script>
      async function j(u, opts){ const r = await fetch(u, opts); return r.json(); }
      async function act(url){ await j(url, {method:'POST'}); init(); }
      async function init(){
        const health = await j('/api/health');
        const summary = await j('/api/summary').catch(()=>({}));
        const users = await j('/api/users').catch(()=>({items:[]}));
        const orders = await j('/api/orders').catch(()=>({items:[]}));
        const links = await j('/api/link-requests').catch(()=>({items:[]}));
        const logs = await j('/api/logs').catch(()=>({logs:[]}));

        document.getElementById('kBackend').textContent = health.backend ? 'OK' : 'OFF';
        document.getElementById('kFirebase').textContent = health.firebaseConnected ? 'OK' : 'OFF';
        document.getElementById('kFrontend').textContent = health.frontendPing ? 'ON' : 'OFF';
        document.getElementById('kUsers').textContent = summary.totalUsers ?? '--';
        document.getElementById('summaryWrap').innerHTML =
          'Usuários: <strong>'+(summary.totalUsers ?? 0)+'</strong><br>' +
          'Pedidos: <strong>'+(summary.totalOrders ?? 0)+'</strong><br>' +
          'Aguardando pagamento: <strong>'+(summary.waitingPayment ?? 0)+'</strong><br>' +
          'Aprovados: <strong>'+(summary.approved ?? 0)+'</strong><br>' +
          'Vínculos: <strong>'+(summary.totalLinks ?? 0)+'</strong><br>' +
          '<span class="muted">Leitura do banco: '+(health.databaseReadable ? 'ok' : (health.databaseMessage || 'sem leitura'))+'</span>';
        document.getElementById('pingBox').textContent = JSON.stringify(health.frontendPing, null, 2);

        document.getElementById('usersBody').innerHTML = (users.items || []).map(u => '<tr><td>'+u.name+'</td><td>'+u.username+'</td><td>'+u.gameId+'</td><td>'+u.linkStatus+'</td><td>'+u.skins+'</td><td>'+u.boxes+'</td></tr>').join('') || '<tr><td colspan="6">Nenhum usuário.</td></tr>';
        document.getElementById('ordersBody').innerHTML = (orders.items || []).slice(0,30).map(o => {
          return '<tr><td>'+o.id+'</td><td>'+o.userId+'</td><td>'+o.status+'</td><td>R$ '+Number(o.totals?.total || 0).toFixed(2)+'</td><td>' +
            '<button class="okb" onclick="act(\\'/api/orders/'+o.userId+'/'+o.id+'/approve\\')">Aprovar</button> '+
            '<button class="dangerb" onclick="act(\\'/api/orders/'+o.userId+'/'+o.id+'/reject\\')">Rejeitar</button></td></tr>';
        }).join('') || '<tr><td colspan="5">Nenhum pedido.</td></tr>';
        document.getElementById('linksBody').innerHTML = (links.items || []).slice(0,30).map(l => '<tr><td>'+l.discordUser+'</td><td>'+l.gameId+'</td><td>'+l.status+'</td><td><button class="warnb" onclick="act(\\'/api/links/'+l.discordId+'/confirm\\')">Confirmar</button></td></tr>').join('') || '<tr><td colspan="4">Nenhum vínculo.</td></tr>';
        document.getElementById('logsBox').textContent = (logs.logs || []).map(l => '['+l.time+'] '+l.message).join('\\n') || 'Sem logs.';
      }
      init();
      setInterval(init, 12000);
    </script>
  </body></html>`);
});

setInterval(() => {
  workerCycle().catch(err => addLog(`Erro no worker: ${err.message}`, 'error'));
}, Number(process.env.WORKER_INTERVAL_MS || 12000));

workerCycle().catch(err => addLog(`Erro no worker inicial: ${err.message}`, 'error'));

app.listen(PORT, () => addLog(`Backend iniciado na porta ${PORT}.`));
