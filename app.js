/* =========================================================
   FPL Command Center — app.js
   Per-user data stored in localStorage (keyed by Team ID)
   ========================================================= */

const POS_MAP = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

let state = null;   // active state object for the logged-in user
let teamId = null;  // current team ID

/* ============ STORAGE ============ */
function storageKey(id) { return `fpl-cc-v1:${id}`; }

function emptyState() {
  return {
    players: [],
    plans: [],
    budget: 100,
    bank: 0,
    freeTransfers: 1,
    managerName: '',
    pendingPicks: null,
    bootstrap: null,
  };
}

function loadFor(id) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (raw) return { ...emptyState(), ...JSON.parse(raw) };
  } catch (e) { console.warn(e); }
  return emptyState();
}

function saveState() {
  if (!teamId) return;
  const toSave = {
    players: state.players,
    plans: state.plans,
    budget: state.budget,
    bank: state.bank,
    freeTransfers: state.freeTransfers,
    managerName: state.managerName,
    bootstrap: state.bootstrap,
  };
  localStorage.setItem(storageKey(teamId), JSON.stringify(toSave));
}

/* ============ UTILS ============ */
function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(n) { return '£' + Number(n || 0).toFixed(1) + 'm'; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============ LOGIN / LOGOUT ============ */
function startApp() {
  const id = document.getElementById('welcome-team-id').value.trim();
  const name = document.getElementById('welcome-name').value.trim();
  if (!id) return toast('Enter your FPL Team ID', true);
  if (!/^\d+$/.test(id)) return toast('Team ID must be numbers only', true);

  teamId = id;
  state = loadFor(id);
  if (name) { state.managerName = name; saveState(); }

  localStorage.setItem('fpl-cc-last-team', id);

  document.getElementById('welcome').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('help-link').href = `https://fantasy.premierleague.com/en/entry/${id}/event/1`;
  renderConsoleSnippet();
  render();
  window.scrollTo(0, 0);
}

function logout() {
  if (!confirm('Switch to a different team? Your current data stays saved in this browser.')) return;
  saveState();
  teamId = null;
  state = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('welcome-team-id').value = '';
  document.getElementById('welcome-name').value = '';
  localStorage.removeItem('fpl-cc-last-team');
}

function showHelp() { document.getElementById('help-modal').classList.add('active'); }

/* ============ CONSOLE SNIPPET ============ */
function renderConsoleSnippet() {
  const snippet = `(async()=>{const id='${teamId}',gw=1;const[p,b]=await Promise.all([fetch(\`/api/entry/\${id}/event/\${gw}/picks/\`).then(r=>r.json()),fetch('/api/bootstrap-static/').then(r=>r.json())]);const blob=new Blob([JSON.stringify({picks:p.picks,entry_history:p.entry_history,bootstrap:b})],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=\`fpl-squad-gw\${gw}.json\`;a.click();console.log('✅ Downloaded fpl-squad-gw'+gw+'.json');})();`;
  document.getElementById('console-snippet').textContent = snippet;
}

function copySnippet() {
  const txt = document.getElementById('console-snippet').textContent;
  navigator.clipboard.writeText(txt).then(
    () => toast('✅ Snippet copied'),
    () => toast('Copy failed — select manually', true)
  );
}

/* ============ TABS ============ */
function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  const target = document.getElementById('tab-' + name);
  if (target) target.style.display = 'block';
}

/* ============ IMPORT ============ */
function importFromPaste() {
  const raw = document.getElementById('paste-area').value.trim();
  if (!raw) return toast('Paste something first', true);
  try { processImport(JSON.parse(raw)); }
  catch (e) { toast('Invalid JSON: ' + e.message, true); }
}

function importFromFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  readFile(f);
  e.target.value = '';
}

function importPlanFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  readFile(f);
  e.target.value = '';
}

function readFile(file) {
  const r = new FileReader();
  r.onload = ev => {
    try { processImport(JSON.parse(ev.target.result)); }
    catch (err) { toast('Invalid JSON: ' + err.message, true); }
  };
  r.readAsText(file);
}

function processImport(data) {
  // Combined import (picks + bootstrap together)
  if (data.picks && Array.isArray(data.picks) && data.bootstrap) {
    state.bootstrap = data.bootstrap;
    state.pendingPicks = { picks: data.picks, entry_history: data.entry_history };
    mergePicks();
    return;
  }

  // Bootstrap only
  if (data.elements && data.teams && Array.isArray(data.elements)) {
    state.bootstrap = { elements: data.elements, teams: data.teams };
    saveState();
    toast('✅ Player database loaded');
    if (state.pendingPicks) { mergePicks(); state.pendingPicks = null; }
    return;
  }

  // Picks only
  if (data.picks && Array.isArray(data.picks)) {
    state.pendingPicks = data;
    if (state.bootstrap) { mergePicks(); state.pendingPicks = null; }
    else { toast('Picks loaded — now load bootstrap', true); return; }
    return;
  }

  // Our own export/backup
  if (data.players && Array.isArray(data.players) && data.players[0]?.name) {
    state.players = data.players;
    state.plans = data.plans || [];
    state.budget = data.budget ?? 100;
    state.bank = data.bank ?? 0;
    state.freeTransfers = data.freeTransfers ?? 1;
    saveState(); render();
    toast('✅ Backup restored');
    return;
  }

  toast('Unrecognized data format', true);
}

function mergePicks() {
  const picks = state.pendingPicks.picks;
  const bp = state.bootstrap;
  const teamMap = {};
  bp.teams.forEach(t => teamMap[t.id] = t.short_name);

  state.players = picks.map(p => {
    const el = bp.elements.find(x => x.id === p.element);
    if (!el) return null;
    return {
      id: uid(),
      fplId: el.id,
      name: el.web_name,
      fullName: `${el.first_name} ${el.second_name}`,
      pos: POS_MAP[el.element_type],
      price: el.now_cost / 10,
      team: teamMap[el.team] || '?',
      captain: p.is_captain,
      vice: p.is_vice_captain,
      multiplier: p.multiplier,
      bench: p.position > 11,
      order: p.position,
    };
  }).filter(Boolean);

  const hist = state.pendingPicks.entry_history;
  if (hist) {
    state.bank = (hist.bank || 0) / 10;
    state.budget = state.bank + state.players.reduce((s, p) => s + p.price, 0);
  }

  saveState();
  render();
  toast('✅ Squad loaded — ' + state.players.length + ' players');
}

/* ============ RENDER ============ */
function render() {
  renderHeader();
  renderSquad();
  renderStats();
  renderTimeline();
  renderPlans();
}

function renderHeader() {
  const squadValue = state.players.reduce((s, p) => s + Number(p.price || 0), 0);
  document.getElementById('hdr-manager').textContent = state.managerName || '—';
  document.getElementById('hdr-teamid').textContent = teamId;
  document.getElementById('hdr-bank').textContent = fmt(state.bank);
  document.getElementById('hdr-value').textContent = fmt(squadValue);
  document.getElementById('hdr-ft').textContent = state.freeTransfers;
}

function renderStats() {
  const size = state.players.length;
  document.getElementById('stat-size').textContent = size + '/15';
  const subs = { 0: 'Add players to begin', 15: '✅ Squad complete' };
  document.getElementById('stat-size-sub').textContent = subs[size] || (15 - size) + ' spots left';

  document.getElementById('stat-gws').textContent = state.plans.length;

  const transfers = state.plans.filter(p => p.outName && p.inName).length;
  document.getElementById('stat-hits').textContent = '0';
  document.getElementById('stat-hits-sub').textContent = transfers ? transfers + ' planned transfer(s)' : 'No hits taken';

  const chipsUsed = state.plans.filter(p => p.chip).length;
  document.getElementById('stat-chips').textContent = chipsUsed + '/4';
}

function renderSquad() {
  const grid = document.getElementById('squad-grid');
  if (state.players.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="emoji">👥</span>No squad loaded yet — import from FPL above or add players manually.</div>';
    return;
  }
  const hasOrder = state.players.some(p => typeof p.order === 'number' && p.order < 99);
  const sorted = hasOrder
    ? [...state.players].sort((a,b) => (a.order ?? 99) - (b.order ?? 99))
    : [...state.players].sort((a,b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.price - a.price);

  grid.innerHTML = sorted.map(p => `
    <div class="player-card ${p.bench ? 'bench' : ''}" data-pos="${p.pos}" onclick="openPlayerModal('${p.id}')">
      ${p.captain ? '<div class="captain-badge">C</div>' : ''}
      ${p.vice ? '<div class="vc-badge">V</div>' : ''}
      <div class="name"><span>${escapeHtml(p.name)}</span><span class="pos-badge" data-pos="${p.pos}">${p.pos}</span></div>
      <div class="meta"><span class="price-tag">${fmt(p.price)}</span>${p.team ? '<span>· ' + escapeHtml(p.team) + '</span>' : ''}</div>
      ${p.bench ? '<div class="bench-label">Bench</div>' : ''}
      <button class="remove-btn" onclick="event.stopPropagation(); removePlayer('${p.id}')">✕</button>
    </div>
  `).join('');
}

function renderTimeline() {
  const t = document.getElementById('timeline');
  const planMap = {};
  state.plans.forEach(p => {
    planMap[p.gw] = planMap[p.gw] || { count: 0, chip: '' };
    planMap[p.gw].count++;
    if (p.chip) planMap[p.gw].chip = p.chip;
  });
  const chips = { WC: '🃏', BB: '🎲', TC: '⚡', FH: '🏠' };
  let html = '';
  for (let gw = 1; gw <= 38; gw++) {
    const plan = planMap[gw];
    const cls = ['gw-chip'];
    if (plan) cls.push('has-plan');
    if (plan && plan.chip) cls.push('has-chip');
    html += `<div class="${cls.join(' ')}" onclick="openPlanModal(null, ${gw})">
      ${plan && plan.chip ? '<div class="chip-icon">' + chips[plan.chip] + '</div>' : ''}
      <div class="gw-num">GW${gw}</div>
      <div class="gw-plan">${plan ? plan.count + ' plan' + (plan.count>1?'s':'') : '—'}</div>
    </div>`;
  }
  t.innerHTML = html;
}

function renderPlans() {
  const list = document.getElementById('plans-list');
  if (state.plans.length === 0) {
    list.innerHTML = '<div class="empty"><span class="emoji">🔄</span>No transfer plans yet — tap a gameweek above to start planning.</div>';
    return;
  }
  const chips = { WC: '🃏 Wildcard', BB: '🎲 Bench Boost', TC: '⚡ Triple Captain', FH: '🏠 Free Hit' };
  const sorted = [...state.plans].sort((a,b) => a.gw - b.gw);
  list.innerHTML = sorted.map(p => {
    const net = (Number(p.inPrice) || 0) - (Number(p.outPrice) || 0);
    const netStr = net === 0 ? '£0.0m' : (net > 0 ? '+' : '') + fmt(net);
    return `<div class="plan-card ${p.chip ? 'chip' : ''}">
      <div class="plan-header">
        <div class="gw-label">GW${p.gw}${p.chip ? ' · ' + chips[p.chip] : ''}</div>
        <div class="plan-actions">
          <button class="btn small" onclick="openPlanModal('${p.id}')">Edit</button>
          <button class="btn small danger" onclick="removePlan('${p.id}')">Delete</button>
        </div>
      </div>
      <div class="plan-body">
        <div class="transfer-side out"><div class="side-label">⬆ Out</div><div class="transfer-player">${escapeHtml(p.outName || '—')}</div><div class="transfer-price">${fmt(p.outPrice)}</div></div>
        <div class="transfer-side in"><div class="side-label">⬇ In</div><div class="transfer-player">${escapeHtml(p.inName || '—')}</div><div class="transfer-price">${fmt(p.inPrice)}</div></div>
      </div>
      <div class="plan-footer"><span>Net cost: <strong>${netStr}</strong></span></div>
    </div>`;
  }).join('');
}

/* ============ PLAYER MODAL ============ */
let editingPlayerId = null;
let editingPlanId = null;

function openPlayerModal(id = null) {
  editingPlayerId = id;
  const title = document.getElementById('player-modal-title');
  const nameEl = document.getElementById('p-name');
  const posEl = document.getElementById('p-pos');
  const priceEl = document.getElementById('p-price');
  const teamEl = document.getElementById('p-team');

  if (id) {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    title.textContent = 'Edit Player';
    nameEl.value = p.name; posEl.value = p.pos; priceEl.value = p.price; teamEl.value = p.team || '';
  } else {
    title.textContent = 'Add Player';
    nameEl.value = ''; posEl.value = 'MID'; priceEl.value = ''; teamEl.value = '';
  }
  document.getElementById('player-modal').classList.add('active');
  setTimeout(() => nameEl.focus(), 100);
}

function savePlayer() {
  const name = document.getElementById('p-name').value.trim();
  const pos = document.getElementById('p-pos').value;
  const price = parseFloat(document.getElementById('p-price').value);
  const team = document.getElementById('p-team').value.trim().toUpperCase();
  if (!name) return toast('Enter a name', true);
  if (!price || price <= 0) return toast('Enter a valid price', true);

  if (editingPlayerId) {
    Object.assign(state.players.find(x => x.id === editingPlayerId), { name, pos, price, team });
    toast('Player updated ✏️');
  } else {
    state.players.push({ id: uid(), name, pos, price, team, captain: false, multiplier: 0, bench: true, order: 99 });
    toast('Player added ✅');
  }
  saveState(); render(); closeModal('player-modal');
}

function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  saveState(); render(); toast('Removed');
}

/* ============ BUDGET / FT ============ */
function openBudgetModal() {
  document.getElementById('b-budget').value = state.budget;
  document.getElementById('b-bank').value = state.bank;
  document.getElementById('budget-modal').classList.add('active');
}
function saveBudget() {
  state.budget = parseFloat(document.getElementById('b-budget').value) || 0;
  state.bank = parseFloat(document.getElementById('b-bank').value) || 0;
  saveState(); render(); closeModal('budget-modal'); toast('Budget saved 💰');
}
function openFTModal() {
  document.getElementById('ft-value').value = state.freeTransfers;
  document.getElementById('ft-modal').classList.add('active');
}
function saveFT() {
  state.freeTransfers = parseInt(document.getElementById('ft-value').value) || 0;
  saveState(); render(); closeModal('ft-modal'); toast('FT saved 🔄');
}

/* ============ PLAN ============ */
function openPlanModal(id = null, gw = null) {
  editingPlanId = id;
  const title = document.getElementById('plan-modal-title');
  const gwEl = document.getElementById('pl-gw');
  const outEl = document.getElementById('pl-out');
  const outPEl = document.getElementById('pl-out-price');
  const inEl = document.getElementById('pl-in');
  const inPEl = document.getElementById('pl-in-price');
  const chipEl = document.getElementById('pl-chip');

  if (id) {
    const p = state.plans.find(x => x.id === id);
    title.textContent = 'Edit Plan';
    gwEl.value = p.gw; outEl.value = p.outName || ''; outPEl.value = p.outPrice || '';
    inEl.value = p.inName || ''; inPEl.value = p.inPrice || ''; chipEl.value = p.chip || '';
  } else {
    title.textContent = 'Add Plan';
    gwEl.value = gw || 1;
    outEl.value = ''; outPEl.value = ''; inEl.value = ''; inPEl.value = ''; chipEl.value = '';
  }
  document.getElementById('plan-modal').classList.add('active');
}

function savePlan() {
  const gw = parseInt(document.getElementById('pl-gw').value);
  const outName = document.getElementById('pl-out').value.trim();
  const outPrice = parseFloat(document.getElementById('pl-out-price').value) || 0;
  const inName = document.getElementById('pl-in').value.trim();
  const inPrice = parseFloat(document.getElementById('pl-in-price').value) || 0;
  const chip = document.getElementById('pl-chip').value;
  if (!gw || gw < 1 || gw > 38) return toast('GW must be 1-38', true);

  if (editingPlanId) {
    Object.assign(state.plans.find(x => x.id === editingPlanId), { gw, outName, outPrice, inName, inPrice, chip });
    toast('Plan updated ✏️');
  } else {
    state.plans.push({ id: uid(), gw, outName, outPrice, inName, inPrice, chip });
    toast('Plan added ✅');
  }
  saveState(); render(); closeModal('plan-modal');
}

function removePlan(id) {
  state.plans = state.plans.filter(p => p.id !== id);
  saveState(); render(); toast('Removed');
}

/* ============ MODAL HELPERS ============ */
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
});

/* ============ EXPORT / RESET ============ */
function exportData() {
  const data = JSON.stringify({
    teamId,
    players: state.players, plans: state.plans,
    budget: state.budget, bank: state.bank,
    freeTransfers: state.freeTransfers,
    managerName: state.managerName,
  }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fpl-plan-${teamId}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported 📦');
}

function resetAll() {
  if (!confirm('Reset your squad and plans? Your Team ID stays saved.')) return;
  state = emptyState();
  localStorage.removeItem(storageKey(teamId));
  render();
  toast('Reset complete 🗑');
}

/* ============ DROP ZONE ============ */
const dz = document.getElementById('drop-zone');
if (dz) {
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.remove('drag-over');
  }));
  dz.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
}

/* ============ AUTO-LOGIN ============ */
window.addEventListener('DOMContentLoaded', () => {
  const last = localStorage.getItem('fpl-cc-last-team');
  if (last) {
    // Prefill the welcome form — user still needs to press the button
    document.getElementById('welcome-team-id').value = last;
    document.getElementById('welcome-name').focus();
  } else {
    document.getElementById('welcome-team-id').focus();
  }
});