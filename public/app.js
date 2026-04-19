function tryDiscordOAuthCallback(){ return; }
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];

const state = {
  user: JSON.parse(localStorage.getItem('argos_user') || 'null'),
  cart: JSON.parse(localStorage.getItem('argos_cart_v6') || localStorage.getItem('argos_cart_v4') || '[]'),
  balance: Number(localStorage.getItem('argos_balance') || 0),
  boxesOwned: Number(localStorage.getItem('argos_boxes_owned') || 0),
  inventory: JSON.parse(localStorage.getItem('argos_inventory') || '[]')
};

const skinPool = [
  { id:'ak-dragao', name:'AK Dragão', rarity:'mythic', weapon:'AK-47', image:'assets/ak-dragao-mythica.png', desc:'Skin mythica inspirada em dragão roxo com visual agressivo e acabamento premium.' },
  { id:'ak-neon', name:'AK-47 Neon District', rarity:'rare', weapon:'AK-47', desc:'Acabamento urbano limpo com brilho azul sutil.' },
  { id:'m4-carbon', name:'M4 Carbon Veil', rarity:'rare', weapon:'M4', desc:'Skin escura com linhas de carbono e contraste frio.' },
  { id:'deagle-royal', name:'Desert Eagle Royal Trace', rarity:'epic', weapon:'Desert Eagle', desc:'Traços roxos e detalhes premium para destaque nas trocas.' },
  { id:'mp5-orbit', name:'MP5 Orbit Pulse', rarity:'epic', weapon:'MP5', desc:'Textura pulsante com acabamento holográfico discreto.' },
  { id:'awp-crown', name:'AWP Crownline', rarity:'legendary', weapon:'AWP', desc:'Visual dourado refinado para skin de presença rara.' },
  { id:'shot-ember', name:'Shotgun Ember Lord', rarity:'legendary', weapon:'Shotgun', desc:'Chamuscado metálico com base escura e brilho quente.' },
  { id:'ak-myth', name:'AK-47 Mythic Revenant', rarity:'mythic', weapon:'AK-47', desc:'Skin topo de linha com identidade agressiva e rara.' },
  { id:'sniper-void', name:'Sniper Void Seraph', rarity:'mythic', weapon:'Sniper', desc:'Acabamento mythica com contraste profundo e brilho rubro.' }
];

const weightedPool = ['rare','rare','rare','rare','epic','epic','epic','legendary','legendary','mythic'];

const APP_CONFIG = window.CONFIG || {};
const MERCADO_PAGO_CONFIG = APP_CONFIG.mercadopago || {};
const FIREBASE_CONFIG = APP_CONFIG.firebase || {};
const SERVER_BASE_URL = (APP_CONFIG.app?.serverBaseUrl && !/localhost/i.test(APP_CONFIG.app.serverBaseUrl) ? APP_CONFIG.app.serverBaseUrl : location.origin);
const DISCORD_INVITE = APP_CONFIG.links?.discordInvite || 'https://discord.gg/mtzEFsTJYw';


function ensureUserShape(){
  if(!state.user) return;
  state.user = {
    name: state.user.name || 'Player Argos',
    discordUser: state.user.discordUser || state.user.name || 'discordplayer',
    discordTag: state.user.discordTag || '000000000',
    role: state.user.role || 'Player Argos',
    joined: state.user.joined || '2026',
    avatar: state.user.avatar || buildInitials(state.user.name || 'Argos'),
    gameLink: {
      gameId: state.user.gameLink?.gameId || '',
      code: state.user.gameLink?.code || '',
      status: state.user.gameLink?.status || 'idle',
      confirmed: !!state.user.gameLink?.confirmed,
      requestedAt: state.user.gameLink?.requestedAt || '',
      confirmedAt: state.user.gameLink?.confirmedAt || ''
    }
  };
}
ensureUserShape();

function saveState(){
  ensureUserShape();
  localStorage.setItem('argos_user', JSON.stringify(state.user));
  localStorage.setItem('argos_cart_v6', JSON.stringify(state.cart));
  localStorage.setItem('argos_balance', String(state.balance));
  localStorage.setItem('argos_boxes_owned', String(state.boxesOwned));
  localStorage.setItem('argos_inventory', JSON.stringify(state.inventory));
}

function money(v){ return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function isLogged(){ return !!state.user; }
function requireLogin(){
  if(!isLogged()){
    localStorage.setItem('argos_redirect_after_login', location.pathname.split('/').pop() + (location.hash || ''));
    location.href = 'login.html';
    return false;
  }
  return true;
}
function buildInitials(name='Argos'){
  return name.split(' ').filter(Boolean).slice(0,2).map(s => s[0]?.toUpperCase()).join('') || 'AR';
}
function getLinkStatus(){
  const link = state.user?.gameLink;
  if(!link || !link.gameId) return { key:'idle', label:'ID não vinculado', className:'idle' };
  if(link.confirmed) return { key:'confirmed', label:'ID confirmado', className:'success' };
  return { key:'pending', label:'Confirmação pendente', className:'warning' };
}
function isGameConfirmed(){
  return !!state.user?.gameLink?.confirmed;
}
function setText(selector, value){
  $$(selector).forEach(el => el.textContent = value);
}
function setClassAndText(el, className, text){
  if(!el) return;
  el.className = `status-pill ${className}`;
  el.textContent = text;
}

function setHeader(){
  const authArea = $('#authArea');
  const lockEls = $$('[data-login-required]');
  lockEls.forEach(el => { if(!isLogged()) el.classList.add('locked'); else el.classList.remove('locked'); });

  if(authArea){
    if(isLogged()){
      authArea.innerHTML = `
        <button class="btn-soft mobile-toggle" id="mobileToggle">Menu</button>
        <a class="account-chip" href="dashboard.html">
          <span class="mini-avatar">${buildInitials(state.user.name)}</span>
          <span>${state.user.name}</span>
        </a>
        <button class="btn" id="logoutBtn">Sair</button>
      `;
      $('#logoutBtn')?.addEventListener('click', ()=>{
        state.user = null;
        saveState();
        location.href = 'index.html';
      });
    } else {
      authArea.innerHTML = `
        <button class="btn-soft mobile-toggle" id="mobileToggle">Menu</button>
        <a class="btn-soft" href="login.html">Entrar</a>
        <a class="btn" href="login.html">Login Discord</a>
      `;
    }
  }

  const mobileToggle = $('#mobileToggle');
  const nav = $('#siteNav');
  if(mobileToggle && nav){
    mobileToggle.addEventListener('click', ()=> nav.classList.toggle('open'));
    $$('.nav a').forEach(a => a.addEventListener('click', ()=> nav.classList.remove('open')));
  }
  $$('.nav a').forEach(a => { if(a.getAttribute('href') === location.pathname.split('/').pop()) a.classList.add('active'); });
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold:.12 });
function bindReveals(root=document){ $$('.reveal', root).forEach(el => observer.observe(el)); }
bindReveals();

function renderQuickData(){
  $('#year') && ($('#year').textContent = new Date().getFullYear());
  setText('.js-balance', money(state.balance));
  setText('.js-boxes', String(state.boxesOwned));
  setText('.js-skins', String(state.inventory.length));
  setText('.js-user', state.user?.name || 'Visitante');
  setText('.js-avatar', buildInitials(state.user?.name || 'Argos'));
  setText('.js-discord-user', isLogged() ? `@${state.user.discordUser} • ${state.user.discordTag}` : 'Discord não conectado');

  const linkStatus = getLinkStatus();
  setClassAndText($('#discordStatusBadge'), isLogged() ? 'success' : 'idle', isLogged() ? 'Discord conectado' : 'Discord desconectado');
  setClassAndText($('#linkStatusBadgeHero'), linkStatus.className, linkStatus.label);
  setClassAndText($('#shopDiscordStatus'), isLogged() ? 'success' : 'idle', isLogged() ? 'Discord conectado' : 'Discord desconectado');
  setClassAndText($('#shopLinkStatus'), linkStatus.className, linkStatus.label);
  $('#summaryLinkState') && ($('#summaryLinkState').textContent = linkStatus.label);
  $('#cartLoginState') && ($('#cartLoginState').textContent = isLogged() ? `Conectado como ${state.user.name}` : 'Conecte o Discord para continuar');
  $('#cartLinkState') && ($('#cartLinkState').textContent = isGameConfirmed() ? `ID ${state.user.gameLink.gameId} confirmado` : 'Confirme seu ID no dashboard antes do checkout');

  const notice = $('#checkoutNotice');
  if(notice){
    if(!isLogged()) notice.textContent = 'Faça login com Discord para comprar.';
    else if(!isGameConfirmed()) notice.textContent = 'Vá ao dashboard e confirme o ID do jogo para liberar o checkout.';
    else notice.textContent = `Conta pronta para comprar com ID ${state.user.gameLink.gameId} confirmado.`;
  }

  const checkoutBtn = $('#checkoutBtn');
  if(checkoutBtn){
    const disabled = !isLogged() || !isGameConfirmed();
    checkoutBtn.disabled = disabled;
    checkoutBtn.classList.toggle('is-disabled', disabled);
  }
}

function setupLogin(){
  const oauthBtn = $('#discordOauthBtn');
  if(!oauthBtn) return;
  const target = `${SERVER_BASE_URL}/auth/discord/login?next=` + encodeURIComponent('/dashboard.html');
  oauthBtn.setAttribute('href', target);
  oauthBtn.onclick = function(e){
    e.preventDefault();
    window.location.assign(target);
    return false;
  };
}


function setupShop(){
  const shop = $('#shopGrid');
  if(!shop) return;
  const search = $('#shopSearch');
  const type = $('#shopType');
  const cartList = $('#cartList');
  const cartTotal = $('#cartTotal');
  const cartCount = $('#cartCount');
  const products = [
    {id:'box-urban', name:'Caixa Urban Ops', type:'caixa', price:79.9, img:'assets/VipArgos.png', desc:'Caixa com foco em skins urbanas e visuais discretos.', meta:'1 caixa enviada ao inventário de caixas', details:'Ao comprar, a caixa não abre na hora. Ela vai direto para o seu estoque dentro do dashboard, onde você decide quando abrir. Pool com chances de raras, épicas, lendárias e mythicas.'},
    {id:'box-night', name:'Caixa Night Signal', type:'caixa', price:129.9, img:'assets/VipImperial.png', desc:'Caixa premium com melhor percepção de valor e drops altos.', meta:'1 caixa premium para o estoque', details:'Modelo visual premium para jogadores que querem caixas separadas no inventário antes de abrir. Ideal para guardar, abrir depois e acompanhar tudo pelo dashboard.'},
    {id:'coins500', name:'Pacote 500 Coins', type:'coins', price:34.9, img:'assets/Coins500.png', desc:'Recarga para comprar caixas, passes e upgrades.', meta:'uso rápido no servidor', details:'Pacote visual de coins para reforçar saldo da conta no modelo do site. Depois pode ser ligado a backend real.'},
    {id:'coins1000', name:'Pacote 1000 Coins', type:'coins', price:59.9, img:'assets/Coins1000.png', desc:'Melhor custo para manter saldo no ecossistema.', meta:'mais vantagem na loja', details:'Recarga maior para jogadores que compram com mais frequência e querem manter saldo pronto para novas caixas.'},
    {id:'tag-prime', name:'Tag Prime', type:'extra', price:24.9, img:'assets/TagPrivada.png', desc:'Destaque visual no servidor com identidade exclusiva.', meta:'benefício visual', details:'Item visual pensado para mostrar status e personalização dentro do servidor.'},
    {id:'skin-slot', name:'Slot Extra de Skin', type:'extra', price:42.9, img:'assets/SkinAdicional.png', desc:'Mais espaço para organizar seu inventário de armas.', meta:'expansão do inventário', details:'Expansão visual de inventário preparada para uma futura integração real com backend e banco.'},
    {id:'id3d', name:'ID Exclusivo 3 Dígitos', type:'extra', price:149.9, img:'assets/IDsExclusivos3D#U00edgitos.png', desc:'Personalização avançada para conta de alto destaque.', meta:'estoque limitado', details:'Produto visual premium de identidade. No sistema final, pode depender de verificação de disponibilidade.'},
    {id:'level25', name:'Boost de Level 25', type:'boost', price:89.9, img:'assets/Level25.png', desc:'Aceleração visual do progresso com foco em status.', meta:'upgrade instantâneo', details:'Boost visual para dar noção de progressão e produto de vantagem controlada no painel.'}
  ];

  shop.innerHTML = products.map(p => `
    <article class="item-card reveal" data-name="${p.name.toLowerCase()}" data-type="${p.type}">
      <div class="item-media"><img src="${p.img}" alt="${p.name}"></div>
      <div class="item-body">
        <div class="price-row"><span class="chip">${p.type}</span><span class="price">${money(p.price)}</span></div>
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        <div class="meta">${p.meta}</div>
        <div class="actions compact-actions">
          <button class="icon-btn" data-details='${JSON.stringify(p)}' aria-label="Ver detalhes">$</button>
          <button class="btn" data-add='${JSON.stringify(p)}'>Adicionar</button>
        </div>
      </div>
    </article>
  `).join('');
  bindReveals(shop);

  function apply(){
    const q = (search?.value || '').trim().toLowerCase();
    const t = type?.value || 'all';
    $$('.item-card', shop).forEach(card => {
      const okName = !q || card.dataset.name.includes(q);
      const okType = t === 'all' || card.dataset.type === t;
      card.classList.toggle('is-hidden', !(okName && okType));
    });
  }
  search?.addEventListener('input', apply);
  type?.addEventListener('change', apply);

  function renderCart(){
    if(!cartList) return;
    cartList.innerHTML = '';
    if(!state.cart.length){
      cartList.innerHTML = '<div class="empty">Seu carrinho está vazio.</div>';
    } else {
      state.cart.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div><strong>${item.name}</strong><div class="muted">${money(item.price)}</div></div>
          <button class="btn-soft" data-remove="${i}">Remover</button>
        `;
        cartList.appendChild(row);
      });
    }
    cartTotal && (cartTotal.textContent = money(state.cart.reduce((s,i)=>s+i.price,0)));
    cartCount && (cartCount.textContent = String(state.cart.length));
    saveState();
    renderQuickData();
    $$('[data-remove]').forEach(btn => btn.addEventListener('click', ()=> { state.cart.splice(Number(btn.dataset.remove),1); renderCart(); }));
  }

  shop.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-add]');
    if(addBtn){
      if(!requireLogin()) return;
      state.cart.push(JSON.parse(addBtn.dataset.add));
      renderCart();
      return;
    }
    const detailBtn = e.target.closest('[data-details]');
    if(detailBtn){
      openProductModal(JSON.parse(detailBtn.dataset.details));
    }
  });

  $('#clearCart')?.addEventListener('click', ()=> { state.cart = []; renderCart(); });

  $('#checkoutBtn')?.addEventListener('click', ()=> {
    if(!requireLogin()) return;
    if(!state.cart.length){ alert('Adicione algo ao carrinho primeiro.'); return; }
    if(!isGameConfirmed()){
      alert('Você precisa confirmar o ID do jogo no dashboard antes de finalizar a compra.');
      location.href = 'dashboard.html#vinculo';
      return;
    }
    location.href = 'checkout.html';
  });

  renderCart();
}

function setupInventory(){
  const grid = $('#inventoryGrid');
  if(!grid) return;
  if(!state.inventory.length){
    state.inventory = [skinPool[0], skinPool[2], skinPool[4]];
    saveState();
  }
  const search = $('#inventorySearch');
  const rarity = $('#inventoryRarity');
  const boxList = $('#inventoryBoxList');
  const boxSummary = $('#inventoryBoxSummary');

  function renderBoxes(){
    if(!boxList) return;
    boxSummary && (boxSummary.textContent = `${state.boxesOwned} caixa${state.boxesOwned === 1 ? '' : 's'} no inventário`);
    if(state.boxesOwned <= 0){
      boxList.innerHTML = '<div class="empty">Nenhuma caixa no inventário. Compre na loja para receber novas caixas aqui.</div>';
      return;
    }
    boxList.innerHTML = Array.from({length: state.boxesOwned}).map((_,i)=> `
      <article class="inventory-box-card reveal">
        <div class="inventory-box-head">
          <span class="chip">Caixa</span>
          <span class="muted">Estoque #${i+1}</span>
        </div>
        <h3>Caixa Argos #${i+1}</h3>
        <p>Essa caixa já está no seu inventário. Clique no botão abaixo para abrir em uma janela modal sem sair do dashboard.</p>
        <div class="foot"><span class="muted">Drops: rara, épica, lendária e mythica</span><button class="btn" data-open-box="${i+1}">Abrir caixa</button></div>
      </article>
    `).join('');
    $$('[data-open-box]', boxList).forEach(btn => btn.addEventListener('click', ()=> openCaseModal(btn.dataset.openBox)));
    bindReveals(boxList);
  }

  function render(){
    const q = (search?.value || '').trim().toLowerCase();
    const r = rarity?.value || 'all';
    const list = state.inventory.filter(item => (!q || item.name.toLowerCase().includes(q) || item.weapon.toLowerCase().includes(q)) && (r === 'all' || item.rarity === r));
    grid.innerHTML = list.length ? list.map(item => `
      <article class="inventory-item reveal">
        <span class="rarity ${item.rarity}">${item.rarity}</span>
        <div class="skin-thumb">${item.weapon.slice(0,2).toUpperCase()}</div>
        <h3>${item.name}</h3>
        <p>${item.desc}</p>
        <div class="foot"><span class="muted">Arma: ${item.weapon}</span><button class="btn-soft">Equipar</button></div>
      </article>
    `).join('') : '<div class="empty">Nenhuma skin encontrada com esse filtro.</div>';
    bindReveals(grid);
    const counts = {rare:0, epic:0, legendary:0, mythic:0};
    state.inventory.forEach(item => counts[item.rarity]++);
    $('#countRare') && ($('#countRare').textContent = counts.rare);
    $('#countEpic') && ($('#countEpic').textContent = counts.epic);
    $('#countLegendary') && ($('#countLegendary').textContent = counts.legendary);
    $('#countMythic') && ($('#countMythic').textContent = counts.mythic);
    renderBoxes();
    renderQuickData();
  }
  search?.addEventListener('input', render);
  rarity?.addEventListener('change', render);
  render();
}

function openCaseModal(boxId){
  if(!requireLogin()) return;
  if(state.boxesOwned <= 0){
    alert('Você não tem caixas no inventário.');
    return;
  }
  let modal = $('#caseOpenModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'caseOpenModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card case-modal-card">
        <button class="modal-close" id="closeCaseModal" aria-label="Fechar">×</button>
        <div class="case-modal-head">
          <div>
            <span class="chip">Abertura de caixa</span>
            <h2 id="caseModalTitle">Abrindo caixa</h2>
            <p class="muted">A abertura acontece numa janela em cima do painel, sem redirecionar o jogador.</p>
          </div>
          <div class="status-pill warning" id="caseModalStock"></div>
        </div>
        <div class="case-window modal-case-window">
          <div class="case-pointer"></div>
          <div class="case-track" id="caseModalTrack"></div>
        </div>
        <div class="case-actions">
          <button class="btn" id="caseModalSpinBtn">Abrir agora</button>
          <button class="btn-soft" id="caseModalCloseBtn">Fechar</button>
        </div>
        <div class="result-card" id="caseModalResult"><span class="muted">Clique em abrir agora para consumir a caixa e receber a skin.</span></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => {
      if(e.target === modal || e.target.id === 'closeCaseModal' || e.target.id === 'caseModalCloseBtn') modal.classList.remove('open');
    });
  }

  const title = $('#caseModalTitle');
  const stock = $('#caseModalStock');
  const track = $('#caseModalTrack');
  const result = $('#caseModalResult');
  const spinBtn = $('#caseModalSpinBtn');
  let spinning = false;

  title.textContent = `Abrir Caixa Argos #${boxId}`;
  stock.textContent = `${state.boxesOwned} caixa${state.boxesOwned === 1 ? '' : 's'} no inventário`;
  result.innerHTML = '<span class="muted">Clique em abrir agora para consumir a caixa e receber a skin.</span>';
  buildCaseTrack(track);
  modal.classList.add('open');

  spinBtn.onclick = () => {
    if(spinning) return;
    spinning = true;
    const items = buildCaseTrack(track);
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';
    void track.offsetWidth;
    const targetIndex = 18 + Math.floor(Math.random()*4);
    const selected = items[targetIndex];
    const offset = targetIndex * 194 - (track.parentElement.clientWidth / 2) + 90;
    track.style.transition = 'transform 5.2s cubic-bezier(.07,.78,.09,.99)';
    track.style.transform = `translateX(-${offset}px)`;
    result.innerHTML = '<span class="muted">Abrindo sua caixa...</span>';
    setTimeout(() => {
      state.boxesOwned = Math.max(0, state.boxesOwned - 1);
      state.inventory.unshift(selected);
      saveState();
      setupInventory();
      result.innerHTML = `<strong>Você recebeu:</strong> ${selected.name} <span class="rarity ${selected.rarity}">${selected.rarity}</span><div class="muted">A skin foi enviada ao inventário e a caixa foi consumida.</div>`;
      stock.textContent = `${state.boxesOwned} caixa${state.boxesOwned === 1 ? '' : 's'} no inventário`;
      spinning = false;
    }, 5400);
  };
}

function buildCaseTrack(container){
  if(!container) return [];
  const items = [];
  for(let i=0;i<26;i++){
    const rarity = weightedPool[Math.floor(Math.random()*weightedPool.length)];
    const pool = skinPool.filter(s=>s.rarity===rarity);
    items.push(pool[Math.floor(Math.random()*pool.length)]);
  }
  container.innerHTML = items.map(item => `
    <div class="case-skin ${item.rarity}">
      <span class="rarity ${item.rarity}">${item.rarity}</span>
      <strong>${item.name}</strong>
      <div class="muted">${item.weapon}</div>
    </div>
  `).join('');
  return items;
}

function setupCases(){
  const stock = $('#boxStockList');
  const track = $('#caseTrack');
  if(!stock || !track) return;
  const result = $('#caseResult');
  const openBtn = $('#openCaseBtn');
  const rebuild = $('#rebuildCaseBtn');
  const selectedLabel = $('#selectedBoxLabel');
  let selectedBox = null;
  let spinning = false;
  let currentItems = [];

  function renderStock(){
    if(selectedLabel) selectedLabel.textContent = selectedBox ? selectedBox : 'Nenhuma caixa selecionada';
    if(state.boxesOwned <= 0){
      stock.innerHTML = '<div class="empty">Você ainda não tem caixas. Compre na loja para enviar caixas ao inventário.</div>';
      openBtn.disabled = true;
      openBtn.classList.add('is-disabled');
      selectedBox = null;
      if(selectedLabel) selectedLabel.textContent = 'Nenhuma caixa selecionada';
      return;
    }
    openBtn.disabled = !selectedBox;
    openBtn.classList.toggle('is-disabled', !selectedBox);
    stock.innerHTML = Array.from({length: state.boxesOwned}).map((_,i)=> `
      <button class="box-stock-item ${selectedBox === `Caixa #${i+1}` ? 'active' : ''}" data-box="Caixa #${i+1}">
        <span class="chip">Caixa</span>
        <strong>Caixa #${i+1}</strong>
        <small>Pronta para abrir</small>
      </button>
    `).join('');
    $$('[data-box]', stock).forEach(btn => btn.addEventListener('click', ()=>{
      selectedBox = btn.dataset.box;
      renderStock();
      result.innerHTML = `<span class="muted">${selectedBox} selecionada. Agora clique em abrir para iniciar a rolagem.</span>`;
    }));
  }

  function roll(){
    const items = [];
    for(let i=0;i<26;i++){
      const rarity = weightedPool[Math.floor(Math.random()*weightedPool.length)];
      const pool = skinPool.filter(s=>s.rarity===rarity);
      items.push(pool[Math.floor(Math.random()*pool.length)]);
    }
    track.innerHTML = items.map(item => `
      <div class="case-skin ${item.rarity}">
        <span class="rarity ${item.rarity}">${item.rarity}</span>
        <strong>${item.name}</strong>
        <div class="muted">${item.weapon}</div>
      </div>
    `).join('');
    return items;
  }

  function spin(){
    if(spinning) return;
    if(!requireLogin()) return;
    if(state.boxesOwned <= 0){ alert('Você não tem caixas suficientes.'); return; }
    if(!selectedBox){ alert('Selecione uma caixa do inventário antes de abrir.'); return; }
    spinning = true;
    currentItems = roll();
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';
    void track.offsetWidth;
    const targetIndex = 18 + Math.floor(Math.random()*4);
    const selected = currentItems[targetIndex];
    const offset = targetIndex * 194 - (track.parentElement.clientWidth / 2) + 90;
    track.style.transition = 'transform 5.2s cubic-bezier(.07,.78,.09,.99)';
    track.style.transform = `translateX(-${offset}px)`;
    result.innerHTML = `<span class="muted">Abrindo ${selectedBox}...</span>`;
    setTimeout(() => {
      state.boxesOwned -= 1;
      state.inventory.unshift(selected);
      selectedBox = null;
      saveState();
      renderQuickData();
      setupInventory();
      renderStock();
      result.innerHTML = `<strong>Você recebeu:</strong> ${selected.name} <span class="rarity ${selected.rarity}">${selected.rarity}</span><div class="muted">A skin foi enviada para o inventário. A caixa aberta foi consumida do seu estoque.</div>`;
      spinning = false;
    }, 5400);
  }

  rebuild?.addEventListener('click', ()=>{
    currentItems = roll();
    result.innerHTML = '<span class="muted">Prévia atualizada. Selecione uma caixa para abrir.</span>';
  });
  openBtn?.addEventListener('click', spin);
  currentItems = roll();
  renderStock();
}

function setupLinking(){
  const form = $('#linkGameForm');
  if(!form) return;
  if(!requireLogin()) return;

  const input = $('#gameIdInput');
  const codeBox = $('#linkCodeBox');
  const instruction = $('#linkInstruction');
  const statusText = $('#linkStatusText');
  const simulateBtn = $('#simulateConfirmBtn');
  const resetBtn = $('#resetLinkBtn');

  function render(){
    ensureUserShape();
    const link = state.user.gameLink;
    const status = getLinkStatus();
    if(input) input.value = link.gameId || '';
    if(statusText) statusText.textContent = status.label;
    if(codeBox) codeBox.textContent = link.code || 'Aguardando criação de código';

    if(!link.gameId){
      instruction.textContent = 'Digite seu ID acima para preparar a vinculação da conta.';
      simulateBtn.disabled = true;
      simulateBtn.classList.add('is-disabled');
    } else if(link.confirmed){
      instruction.textContent = `ID ${link.gameId} confirmado. Compras já podem ser finalizadas por essa conta.`;
      simulateBtn.disabled = false;
      simulateBtn.classList.remove('is-disabled');
    } else {
      instruction.textContent = `Use o código ${link.code} no fluxo futuro do jogo para concluir a vinculação do ID ${link.gameId}.`;
      simulateBtn.disabled = false;
      simulateBtn.classList.remove('is-disabled');
    }

    renderQuickData();
    saveState();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const gameId = input?.value.trim() || '';
    if(gameId.length < 1){
      alert('Digite um ID válido do jogo.');
      return;
    }
    fetch(`${SERVER_BASE_URL}/api/game-link/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId: state.user.discordId, discordUser: state.user.discordUser, gameId })
    })
      .then(async res => {
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Falha ao solicitar vínculo.');
        state.user.gameLink = data.link;
        render();
        alert('Solicitação de vínculo enviada. Use o código exibido no jogo quando a integração estiver conectada.');
      })
      .catch(err => alert(err.message || 'Não foi possível solicitar o vínculo.'));
    return;
  });

  simulateBtn?.addEventListener('click', async ()=> {
    if(!state.user?.gameLink?.gameId || !state.user?.discordId) return;
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/game-link/status?discordId=${encodeURIComponent(state.user.discordId)}`);
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Falha ao consultar vínculo.');
      if(data.link){
        state.user.gameLink = data.link;
        render();
        alert(data.link.confirmed ? 'ID confirmado pelo backend.' : 'Seu vínculo ainda está pendente no backend.');
      }
    } catch(err){
      alert(err.message || 'Não foi possível consultar o vínculo agora.');
    }
  });

  resetBtn?.addEventListener('click', ()=> {
    state.user.gameLink = { gameId:'', code:'', status:'idle', confirmed:false, requestedAt:'', confirmedAt:'' };
    render();
  });

  render();
}

function openProductModal(product){
  let modal = $('#productModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'productModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <button class="modal-close" id="closeProductModal" aria-label="Fechar">×</button>
        <div class="modal-grid">
          <div class="modal-media"><img id="modalProductImg" alt=""></div>
          <div class="modal-content">
            <span class="chip" id="modalProductType"></span>
            <h2 id="modalProductName"></h2>
            <div class="modal-price" id="modalProductPrice"></div>
            <p id="modalProductDesc"></p>
            <div class="tiny-note" id="modalProductDetails"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => {
      if(e.target === modal || e.target.id === 'closeProductModal') modal.classList.remove('open');
    });
  }
  $('#modalProductImg').src = product.img;
  $('#modalProductImg').alt = product.name;
  $('#modalProductType').textContent = product.type;
  $('#modalProductName').textContent = product.name;
  $('#modalProductPrice').textContent = money(product.price);
  $('#modalProductDesc').textContent = product.desc;
  $('#modalProductDetails').textContent = product.details || product.meta || '';
  modal.classList.add('open');
}


function setupServerStatus(){
  const statusText = $('#serverStatusText');
  if(!statusText) return;
  $('#discordInviteText') && ($('#discordInviteText').textContent = 'Discord oficial');
  $('#discordInviteSub') && ($('#discordInviteSub').textContent = DISCORD_INVITE.replace(/^https?:\/\//,''));
  fetch(`${SERVER_BASE_URL}/api/server/status`)
    .then(async res => {
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Falha ao carregar status.');
      statusText.textContent = data.online ? 'Servidor online' : 'Servidor offline';
      $('#serverStatusSub') && ($('#serverStatusSub').textContent = data.players?.max ? `${data.players.current}/${data.players.max} players online` : (data.message || 'Status recebido da API.'));
    })
    .catch(() => {
      statusText.textContent = 'Status indisponível';
      $('#serverStatusSub') && ($('#serverStatusSub').textContent = 'Configure STATUS_API_URL ou ajuste /api/server/status no backend.');
    });
}

function calculateCartTotals(){
  const subtotal = state.cart.reduce((s,i)=>s+Number(i.price||0),0);
  const coupon = JSON.parse(localStorage.getItem('argos_coupon') || 'null');
  const discount = coupon?.code === 'ARGOS50' ? subtotal * 0.5 : 0;
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total, coupon };
}

function setupCheckout(){
  if(!$('#checkoutConfirmForm')) return;
  if(!requireLogin()) return;
  if(!state.cart.length){ alert('Seu carrinho está vazio.'); location.href = 'loja.html'; return; }
  if(!isGameConfirmed()){ alert('Confirme seu ID no dashboard antes de continuar.'); location.href = 'dashboard.html#vinculo'; return; }

  const tabs = $$('.dash-tab');
  const panels = $$('[data-panel]');
  const openPanelButtons = $$('[data-open-panel]');
  function syncTab(){
    const validIds = panels.map(panel => `#${panel.id}`);
    const hash = validIds.includes(location.hash) ? location.hash : '#confirmacao';
    tabs.forEach(tab => tab.classList.toggle('active', tab.getAttribute('href') === hash));
    panels.forEach(panel => panel.classList.toggle('is-active', `#${panel.id}` === hash));
  }
  tabs.forEach(tab => tab.addEventListener('click', (e) => { e.preventDefault(); const target = tab.getAttribute('href'); window.history.pushState(null, '', target); syncTab(); }));
  openPanelButtons.forEach(btn => btn.addEventListener('click', () => { const target = btn.dataset.openPanel; window.history.pushState(null, '', `#${target}`); syncTab(); }));
  window.addEventListener('hashchange', syncTab); syncTab();

  const emailInput = $('#checkoutEmail');
  const discordInput = $('#checkoutDiscord');
  const gameIdInput = $('#checkoutGameId');
  const cartList = $('#checkoutCartList');
  const couponInput = $('#couponInput');
  const couponMessage = $('#couponMessage');
  const methodGrid = $('#paymentMethodGrid');
  const paymentMethodLabel = $('#paymentMethodLabel');
  let selectedMethod = 'mercadopago';

  discordInput.value = `${state.user.discordUser || state.user.name} • ${state.user.discordTag || state.user.discordId || ''}`;
  gameIdInput.value = state.user.gameLink.gameId || '';
  emailInput.value = localStorage.getItem('argos_checkout_email') || state.user.email || '';

  function renderCheckout(){
    const { subtotal, discount, total, coupon } = calculateCartTotals();
    cartList.innerHTML = state.cart.map(item => `<div class="cart-item"><div><strong>${item.name}</strong><div class="muted">${money(item.price)}</div></div><span class="chip">${item.type}</span></div>`).join('');
    $('#checkoutSubtotal').textContent = money(subtotal);
    $('#checkoutDiscount').textContent = `- ${money(discount)}`;
    $('#checkoutTotal').textContent = money(total);
    $('#checkoutSubtotalHero').textContent = money(total);
    $('#checkoutConfirmedId').textContent = state.user.gameLink.gameId;
    $('#couponSidebarStatus').textContent = coupon ? coupon.code : 'Nenhum';
    $('#finalEmailLabel').textContent = emailInput.value || 'Não informado';
    $('#finalGameIdLabel').textContent = state.user.gameLink.gameId || 'Não confirmado';
    $('#finalTotalLabel').textContent = money(total);
    couponMessage.textContent = coupon ? `Cupom ${coupon.code} aplicado com sucesso.` : 'Cupom disponível: ARGOS50.';
  }

  $('#applyCouponBtn')?.addEventListener('click', () => {
    const code = (couponInput.value || '').trim().toUpperCase();
    if(code === 'ARGOS50') localStorage.setItem('argos_coupon', JSON.stringify({ code }));
    else { localStorage.removeItem('argos_coupon'); alert('Cupom inválido.'); }
    renderCheckout();
  });

  $('#checkoutConfirmForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if(!email){ alert('Informe o e-mail de confirmação.'); return; }
    localStorage.setItem('argos_checkout_email', email);
    renderCheckout();
    window.history.pushState(null, '', '#pagamento');
    syncTab();
  });

  methodGrid?.addEventListener('click', (e) => {
    const card = e.target.closest('.payment-method');
    if(!card) return;
    selectedMethod = card.dataset.method;
    $$('.payment-method', methodGrid).forEach(el => el.classList.toggle('active', el === card));
    paymentMethodLabel.textContent = selectedMethod;
  });

  $('#createPaymentBtn')?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if(!email){ alert('Volte e informe o e-mail de confirmação.'); return; }
    const payload = { user: state.user, email, coupon: JSON.parse(localStorage.getItem('argos_coupon') || 'null'), items: state.cart, method: selectedMethod };
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/payments/create-preference`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Falha ao iniciar pagamento.');
      window.history.pushState(null, '', '#resumo-final'); syncTab();
      if(data.init_point) location.href = data.init_point;
      else if(data.message) alert(data.message);
    } catch(err){ alert(err.message || 'Não foi possível iniciar o pagamento.'); }
  });

  renderCheckout();
}

function setupDashboard(){
  if(!$('#dashboardHome')) return;
  if(!isLogged()) { requireLogin(); return; }
  const historyRows = $('#historyRows');
  if(historyRows){
    const linkStatus = getLinkStatus();
    const rows = [
      ['Login com Discord', 'Atual', 'Concluído'],
      [`Vínculo do ID ${state.user.gameLink?.gameId || '—'}`, state.user.gameLink?.requestedAt ? new Date(state.user.gameLink.requestedAt).toLocaleString('pt-BR') : '—', linkStatus.label],
      ['Itens no carrinho', 'Atual', state.cart.length ? `${state.cart.length} item(ns)` : 'Sem itens'],
      ['Caixas no inventário', 'Atual', state.boxesOwned > 0 ? `${state.boxesOwned} disponível(is)` : 'Sem caixas']
    ];
    historyRows.innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><span class="rarity ${r[2].includes('confirmado') || r[2] === 'Concluído' || r[2] === 'Disponível' ? 'rare' : r[2] === 'Bloqueado' ? 'legendary' : 'epic'}">${r[2]}</span></td></tr>`).join('');
  }

  const tabs = $$('.dash-tab');
  const panels = $$('[data-panel]');
  const openPanelButtons = $$('[data-open-panel]');

  function syncTab(){
    const validIds = panels.map(panel => `#${panel.id}`);
    const hash = validIds.includes(location.hash) ? location.hash : '#resumo';
    tabs.forEach(tab => tab.classList.toggle('active', tab.getAttribute('href') === hash));
    panels.forEach(panel => panel.classList.toggle('is-active', `#${panel.id}` === hash));
    const summary = $('#summaryLinkStateCard');
    const sidebar = $('#summaryLinkState');
    if(summary && sidebar) summary.textContent = sidebar.textContent;
  }

  tabs.forEach(tab => tab.addEventListener('click', (e) => {
    e.preventDefault();
    const target = tab.getAttribute('href');
    window.history.pushState(null, '', target);
    syncTab();
  }));

  openPanelButtons.forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.openPanel;
    if(!target) return;
    window.history.pushState(null, '', `#${target}`);
    syncTab();
  }));

  window.addEventListener('hashchange', syncTab);
  syncTab();
}

if(document.body.dataset.private === 'true' && !isLogged()){
  localStorage.setItem('argos_redirect_after_login', location.pathname.split('/').pop() + (location.hash || ''));
  location.href = 'login.html';
}

function safeInit(fn){
  try { fn(); } catch (err) { console.error('Argos init error:', err); }
}
safeInit(setHeader);
safeInit(renderQuickData);
safeInit(tryDiscordOAuthCallback);
safeInit(setupServerStatus);
safeInit(setupLogin);
safeInit(setupShop);
safeInit(setupInventory);
safeInit(setupCases);
safeInit(setupLinking);
safeInit(setupCheckout);
safeInit(setupDashboard);
