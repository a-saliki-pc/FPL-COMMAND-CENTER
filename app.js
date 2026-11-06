/* =========================================================
   FPL Command Center v14 — app.js
   ========================================================= */
const PROXY = 'https://fplworker.adyb-saliki.workers.dev/?url=';
const FPL_API = 'https://fantasy.premierleague.com/api';
const IMG_BASE = 'https://resources.premierleague.com/premierleague/photos/players/110x140';

const FAMILY = [
  { id: '1115676', name: 'Adyb Saliki',   emoji: '🧠', nick: 'The Tactician 🧠' },
  { id: '3719511', name: 'Yassine Saied', emoji: '🚀', nick: 'The Rocket 🚀' },
  { id: '3844150', name: 'Ismail Saliki', emoji: '🎲', nick: 'The Gambler 🎲' },
  { id: '1115993', name: 'Youssef Said',  emoji: '🐢', nick: 'The Turtle 🐢' },
  { id: '6849321', name: 'Zakaria Said',  emoji: '😎', nick: 'The Vibes Merchant 😎' },
];
const COLORS = ['#00ff87', '#04f5ff', '#ff2882', '#ffb92e', '#a78bfa', '#f97316'];
const RANK_EMOJI = ['👑', '🐐', '🥉', '😴', '🐌'];
const POS_MAP = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const CHIPS = { wildcard: '🃏 Wildcard', freehit: '🏠 Free Hit', bboost: '🎲 Bench Boost', '3xc': '⚡ Triple Captain' };
const BURNS_TOP = ['Enjoying the view from the summit. For now.', 'Top of the pile. Don’t let it slip.'];
const BURNS_LOW = ['The wooden spoon is warming up.', 'Statistically the worst. Emotionally too.', 'The bin is calling.'];

const $ = id => document.getElementById(id);
const fmt = n => '£' + Number(n || 0).toFixed(1) + 'm';
const fmtRank = r => (!r || r <= 0) ? '—' : '#' + r.toLocaleString();
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = null, teamId = null, pickedId = null, currentView = 'dashboard';
let squadView = localStorage.getItem('fpl-cc-squad-view') || 'pitch';

function emptyState() {
  return { players: [], plans: {}, bank: 0, ft: 1, currentGW: null, nextGW: null, nextDeadline: null, lastSync: 0,
           bootstrap: null, familyData: null, fixtures: [], teamShort: {}, livePts: {}, chipsUsed: [] };
}
function loadFor(id) {
  try {
    const raw = localStorage.getItem('fpl-cc-v14:' + id);
    if (raw) { const s = JSON.parse(raw); return { ...emptyState(), plans: s.plans || {}, ft: s.ft || 1 }; }
  } catch (e) {}
  return emptyState();
}
function saveState() {
  if (!teamId) return;
  try { localStorage.setItem('fpl-cc-v14:' + teamId, JSON.stringify({ plans: state.plans, ft: state.ft })); } catch (e) {}
}

function toast(msg, isError = false) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast' + (isError ? ' error' : '');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ---------- theme ---------- */
function applyTheme(mode) {
  const light = mode === 'light';
  document.documentElement.classList.toggle('light-mode', light);
  document.body.classList.toggle('light-mode', light);
  ['theme-toggle-welcome', 'theme-toggle-app'].forEach(id => { const el = $(id); if (el) el.textContent = light ? '☀️' : '🌙'; });
}
function toggleTheme() {
  const next = document.body.classList.contains('light-mode') ? 'dark' : 'light';
  localStorage.setItem('fpl-cc-theme', next); applyTheme(next);
}
applyTheme(localStorage.getItem('fpl-cc-theme') || 'dark');

/* ---------- API + sync ---------- */
async function fpl(path) {
  const res = await fetch(PROXY + encodeURIComponent(FPL_API + path));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function setSync(kind) { const d = $('sync-dot'); if (d) d.className = 'sync-dot ' + kind; }
function updateSyncDot() {
  if (!state || !state.lastSync) return setSync('old');
  const mins = (Date.now() - state.lastSync) / 60000;
  setSync(mins < 6 ? 'fresh' : mins < 30 ? 'stale' : 'old');
  const s = $('sync-status'); if (s) s.textContent = 'Last sync ' + (mins < 1 ? 'just now' : Math.round(mins) + ' min ago') + ' · press S to sync';
}

async function syncAll(show = true) {
  if (!state) return;
  setSync('syncing'); if (show) toast('🔄 Syncing…');
  try {
    const boot = await fpl('/bootstrap-static/');
    state.bootstrap = { elements: boot.elements, teams: boot.teams, events: boot.events };
    state.teamShort = {}; boot.teams.forEach(t => state.teamShort[t.id] = t.short_name);
    const cur = boot.events.find(e => e.is_current), nxt = boot.events.find(e => e.is_next);
    state.currentGW = cur?.id || (nxt ? Math.max(1, nxt.id - 1) : 1);
    state.nextGW = nxt?.id || Math.min(38, state.currentGW + 1);
    state.nextDeadline = (nxt || cur)?.deadline_time || null;

    const roster = FAMILY.some(m => m.id === teamId) ? FAMILY : [...FAMILY, { id: teamId, name: 'You', emoji: '⚽', nick: 'Guest' }];
    const [fixtures, live, fam] = await Promise.all([
      fpl('/fixtures/?future=1').catch(() => []),
      fpl(`/event/${state.currentGW}/live/`).catch(() => null),
      Promise.all(roster.map(async m => {
        const [picks, history] = await Promise.all([
          fpl(`/entry/${m.id}/event/${state.currentGW}/picks/`).catch(() => null),
          fpl(`/entry/${m.id}/history/`).catch(() => null)]);
        return { ...m, picks, history };
      }))
    ]);
    state.fixtures = fixtures;
    state.livePts = {}; (live?.elements || []).forEach(e => state.livePts[e.id] = e.stats.total_points);
    state.familyData = fam;
    const mine = fam.find(f => f.id === teamId);
    if (mine?.picks) mergeMySquad(mine.picks);
    state.chipsUsed = mine?.history?.chips || [];
    state.lastSync = Date.now();
    $('all-players').innerHTML = boot.elements.map(e => `<option value="${esc(e.web_name)}">`).join('');
    renderAll(); updateSyncDot();
    if (show) toast('✅ Synced');
  } catch (e) { console.error(e); setSync('old'); toast('Sync failed. Check your connection and try again.', true); }
}

function mergeMySquad(pd) {
  const bp = state.bootstrap;
  state.players = pd.picks.map(p => {
    const el = bp.elements.find(x => x.id === p.element); if (!el) return null;
    return { id: 'p' + el.id, fplId: el.id, name: el.web_name, pos: POS_MAP[el.element_type], price: el.now_cost / 10,
      team: state.teamShort[el.team] || '?', teamId: el.team, captain: p.is_captain, vice: p.is_vice_captain,
      bench: p.position > 11, order: p.position, photo: `${IMG_BASE}/p${el.code}.png`, status: el.status,
      form: parseFloat(el.form) || 0, totalPoints: el.total_points, costChange: (el.cost_change_event || 0) / 10,
      gwPts: state.livePts[el.id] ?? null };
  }).filter(Boolean);
  if (pd.entry_history) state.bank = (pd.entry_history.bank || 0) / 10;
}

/* ---------- helpers ---------- */
const myFam = () => state.familyData?.find(f => f.id === teamId);
const lastGW = f => f?.history?.current?.slice(-1)[0];
const sortedPlayers = () => [...state.players].sort((a, b) => a.order - b.order);
function teamFixtures(tid, gw) {
  return (state.fixtures || []).filter(f => f.event === gw && (f.team_h === tid || f.team_a === tid)).map(f => {
    const home = f.team_h === tid;
    return { opp: state.teamShort[home ? f.team_a : f.team_h], home, diff: home ? f.team_h_difficulty : f.team_a_difficulty };
  });
}
const fxChips = (tid, gw) => {
  const fx = teamFixtures(tid, gw);
  return fx.length ? fx.map(f => `<span class="fixture-diff" data-diff="${f.diff}">${f.opp} ${f.home ? 'H' : 'A'}</span>`).join(' ') : '<span class="fixture-diff" data-diff="5">BLANK</span>';
};
const emptyBox = msg => `<div class="empty">${msg}</div>`;

/* ---------- render: everything ---------- */
function renderAll() {
  renderHeader(); renderGlance(); renderCaptain(); renderPrices(); renderMini(); renderStats();
  renderSquad(); renderTeamView(); renderPlanner(); renderLeaderboard(); renderRoast(); renderHistory(); renderPlayers();
  updateViewToggleButtons();
}

function renderHeader() {
  const me = myFam(), l = lastGW(me);
  $('hdr-manager').textContent = me ? me.name.split(' ')[0] : '—';
  $('hdr-points').textContent = l ? l.total_points : '—';
  $('hdr-rank').textContent = l ? fmtRank(l.overall_rank) : '—';
  $('hdr-bank').textContent = fmt(state.bank);
  $('hdr-value').textContent = l ? fmt(l.value / 10) : '—';
  $('hdr-ft').textContent = state.ft;
  tickDeadline();
}
function cycleFT() { state.ft = state.ft >= 5 ? 1 : state.ft + 1; saveState(); $('hdr-ft').textContent = state.ft; renderPlanner(); }
function tickDeadline() {
  const el = $('hdr-deadline'); if (!el || !state?.nextDeadline) return;
  const ms = new Date(state.nextDeadline) - Date.now();
  if (ms <= 0) { el.textContent = 'Passed'; return; }
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  el.textContent = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
  $('hdr-deadline-wrap').classList.toggle('urgent', ms < 864e5);
}

function renderGlance() {
  const el = $('gw-glance-banner'), me = myFam(), l = lastGW(me);
  if (!l) { el.innerHTML = emptyBox('Sync to load'); return; }
  const ev = state.bootstrap.events.find(e => e.id === state.currentGW);
  const avg = ev?.average_entry_score || 0, net = l.points - l.event_transfers_cost;
  const rankInFam = [...state.familyData].filter(f => lastGW(f)).sort((a, b) => lastGW(b).points - lastGW(a).points).findIndex(f => f.id === teamId) + 1;
  const card = (label, value, sub, cls = '') => `<div class="glance-stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
  el.innerHTML =
    card(`GW${state.currentGW} points`, net, l.event_transfers_cost ? `after −${l.event_transfers_cost} hit` : 'no hit', avg && net >= avg ? 'good' : 'bad') +
    card('GW average', avg || '—', avg ? `${net >= avg ? '+' : ''}${net - avg} vs you` : '') +
    card('Family rank', rankInFam ? `${rankInFam}/${state.familyData.length}` : '—', 'this week') +
    card('Bench points', l.points_on_bench, l.points_on_bench >= 8 ? 'ouch' : 'left behind', l.points_on_bench >= 8 ? 'bad' : '');
}

function renderCaptain() {
  const el = $('captain-suggestion');
  if (!state.players.length) { el.innerHTML = emptyBox('Sync to load'); return; }
  const gw = state.nextGW;
  const rows = state.players.filter(p => !p.bench && p.pos !== 'GK').map(p => {
    const fx = teamFixtures(p.teamId, gw);
    const ease = fx.reduce((s, f) => s + (5 - f.diff), 0);
    const score = p.form * 1.5 + ease * 0.8 - (p.status !== 'a' ? 10 : 0);
    return { p, score };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  el.innerHTML = rows.map((r, i) => `
    <div class="lb-row mini" onclick="openActionModal('${r.p.id}')">
      <div class="lb-rank">${['🥇', '🥈', '🥉'][i]}</div>
      <div><div class="lb-name">${esc(r.p.name)} <span class="pos-badge" data-pos="${r.p.pos}">${r.p.pos}</span></div><div class="lb-teamname">GW${gw}: ${fxChips(r.p.teamId, gw)}</div></div>
      <div class="lb-stat lb-primary">${r.p.form.toFixed(1)}<small>form</small></div>
      <div class="lb-stat">${r.score.toFixed(1)}<small>score</small></div>
    </div>`).join('') + '<div class="lb-note">Score blends recent form with next-GW fixture ease. A starting point, not a verdict.</div>';
}

function renderPrices() {
  const el = $('price-changes');
  if (!state.bootstrap) { el.innerHTML = emptyBox('Sync to load'); return; }
  const mine = state.players.filter(p => p.costChange !== 0);
  const watch = [...state.bootstrap.elements].filter(e => e.status === 'a' && !state.players.some(p => p.fplId === e.id))
    .sort((a, b) => b.transfers_in_event - a.transfers_in_event).slice(0, 3);
  const row = (icon, name, sub, val, cls) => `<div class="lb-row mini"><div class="lb-rank">${icon}</div><div><div class="lb-name">${esc(name)}</div><div class="lb-teamname">${sub}</div></div><div class="lb-stat lb-primary ${cls}">${val}</div></div>`;
  el.innerHTML =
    (mine.length ? mine.map(p => row(p.costChange > 0 ? '📈' : '📉', p.name, 'In your squad', (p.costChange > 0 ? '+' : '') + fmt(p.costChange), p.costChange > 0 ? '' : 'neg')).join('')
      : '<div class="lb-note">No price moves in your squad this GW.</div>') +
    '<div class="lb-subhead">Most transferred in (rise watch)</div>' +
    watch.map(e => row('🔥', e.web_name, `${state.teamShort[e.team]} · ${fmt(e.now_cost / 10)}`, (e.transfers_in_event / 1000).toFixed(0) + 'k', '')).join('');
}

function renderMini() {
  const el = $('mini-leaderboard');
  if (!state.familyData) { el.innerHTML = emptyBox('Sync to load'); return; }
  const rows = [...state.familyData].filter(f => lastGW(f)).sort((a, b) => lastGW(b).total_points - lastGW(a).total_points);
  el.innerHTML = rows.map((f, i) => `<div class="lb-row mini ${f.id === teamId ? 'me' : ''}"><div class="lb-rank">${RANK_EMOJI[i] || i + 1}</div>
    <div><div class="lb-name">${f.emoji} ${esc(f.name)}</div></div>
    <div class="lb-stat lb-primary">${lastGW(f).total_points}<small>total</small></div><div class="lb-stat">${lastGW(f).points}<small>GW</small></div></div>`).join('');
}

function renderStats() {
  const cur = myFam()?.history?.current || [];
  $('stat-size').textContent = state.players.length + '/15';
  $('stat-size-sub').textContent = state.players.length ? fmt(state.players.reduce((s, p) => s + p.price, 0)) + ' squad value' : 'Sync to load';
  if (!cur.length) return;
  const l = cur[cur.length - 1], best = cur.reduce((a, b) => b.points > a.points ? b : a), worst = cur.reduce((a, b) => b.points < a.points ? b : a);
  $('stat-gwpts').textContent = l.points; $('stat-gwpts-sub').textContent = 'GW' + l.event;
  $('stat-best').textContent = best.points; $('stat-best-sub').textContent = 'GW' + best.event;
  $('stat-worst').textContent = worst.points; $('stat-worst-sub').textContent = 'GW' + worst.event;
}

/* ---------- squad views ---------- */
function toggleSquadView() {
  const order = ['pitch', 'list', '3d'];
  squadView = order[(order.indexOf(squadView) + 1) % 3];
  localStorage.setItem('fpl-cc-squad-view', squadView);
  renderSquad(); renderTeamView(); updateViewToggleButtons();
}
function updateViewToggleButtons() {
  const next = squadView === 'pitch' ? '📋 List' : squadView === 'list' ? '🎲 3D' : '⚽ Pitch';
  ['view-toggle-dashboard', 'view-toggle-team'].forEach(id => { const el = $(id); if (el) el.textContent = next; });
}
function renderSquad() {
  const grid = $('squad-grid'), pitch = $('pitch-view-dashboard'); if (!grid || !pitch) return;
  const list = squadView === 'list';
  grid.style.display = list ? 'grid' : 'none'; pitch.style.display = list ? 'none' : 'block';
  if (list) {
    grid.innerHTML = state.players.length ? sortedPlayers().map(p => `
      <div class="player-card ${p.bench ? 'bench' : ''} ${p.captain ? 'captain-card' : ''}" data-pos="${p.pos}" onclick="openActionModal('${p.id}')">
        <img class="player-headshot" src="${p.photo}" alt="" loading="lazy">
        ${p.captain ? '<div class="captain-badge">C</div>' : ''}
        <div class="name">${esc(p.name)} <span class="pos-badge" data-pos="${p.pos}">${p.pos}</span></div>
        <div class="meta">${fmt(p.price)} · ${esc(p.team)}${p.status !== 'a' ? ' · ⚠️' : ''}</div>
        <div class="player-stats"><div class="player-stat"><div class="stat-val">${p.form}</div><div class="stat-lbl">Form</div></div>
        <div class="player-stat"><div class="stat-val">${p.gwPts ?? '–'}</div><div class="stat-lbl">GW</div></div>
        <div class="player-stat"><div class="stat-val">${p.totalPoints}</div><div class="stat-lbl">Total</div></div></div>
      </div>`).join('') : emptyBox('Sync to load');
  } else if (squadView === '3d' && currentView === 'dashboard') renderPitch3D(pitch);
  else renderPitchView(pitch);
}
function renderTeamView() {
  const pitch = $('pitch-view-team'); if (!pitch) return;
  if (squadView === '3d' && currentView === 'team') renderPitch3D(pitch); else renderPitchView(pitch);
}
function renderPitchView(c) {
  if (!state.players.length) { c.innerHTML = emptyBox('Sync to load'); return; }
  const st = sortedPlayers().filter(p => !p.bench), bench = sortedPlayers().filter(p => p.bench);
  const row = pos => st.filter(p => p.pos === pos);
  const card = p => `<div class="pitch-card ${p.captain ? 'captain' : ''} ${p.vice ? 'vice' : ''}" onclick="openActionModal('${p.id}')">
    ${p.captain ? '<div class="pitch-badge-c">C</div>' : p.vice ? '<div class="pitch-badge-v">V</div>' : ''}
    ${p.status !== 'a' ? `<div class="pitch-badge-inj">${p.status === 'd' ? '🟡' : '🔴'}</div>` : ''}
    <img src="${p.photo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="pitch-name">${esc(p.name)}</div>
    <div class="pitch-pts ${p.gwPts === 0 ? 'blank' : ''}">${p.gwPts ?? fmt(p.price)}</div></div>`;
  c.innerHTML = `<div class="pitch-formation">${row('DEF').length}-${row('MID').length}-${row('FWD').length} · GW${state.currentGW}</div>
    <div class="pitch-row fwd">${row('FWD').map(card).join('')}</div><div class="pitch-row mid">${row('MID').map(card).join('')}</div>
    <div class="pitch-row def">${row('DEF').map(card).join('')}</div><div class="pitch-row gk">${row('GK').map(card).join('')}</div>
    <div class="pitch-bench"><div class="pitch-bench-label">Bench</div><div class="pitch-bench-row">${bench.map(card).join('')}</div></div>`;
}

/* ---------- 3D pitch (rebuilt each render; no leaks, no hidden-canvas loops) ---------- */
let T = {};
const PW = 68, PH = 105, POS_COLOR = { GK: 0xffb92e, DEF: 0x3b82f6, MID: 0x00ff87, FWD: 0xff2882 };
const zFor = pos => ({ GK: 42, DEF: 20, MID: -8, FWD: -34 }[pos]);
const xFor = (i, n) => n === 1 ? 0 : -((n - 1) * 14) / 2 + i * 14;

function dispose3D() {
  if (T.raf) cancelAnimationFrame(T.raf);
  try { T.controls?.dispose(); T.renderer?.dispose(); } catch (e) {}
  T = {};
}
function renderPitch3D(container) {
  if (!state.players.length) { container.innerHTML = emptyBox('Sync to load'); return; }
  if (typeof THREE === 'undefined' || !THREE.OrbitControls) { container.innerHTML = emptyBox('3D engine failed to load. Check your connection.'); return; }
  container.innerHTML = '<div class="pitch-3d-wrap"><canvas id="pitch-3d-canvas"></canvas><div class="pitch-3d-hint">🖱️ Drag to orbit · pinch to zoom</div></div>';
  draw3D($('pitch-3d-canvas'), state.players.filter(p => !p.bench), 0);
}
function playerBlock(p) {
  const g = new THREE.Group(), s = 3.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(s, s * 2.2, s), new THREE.MeshLambertMaterial({ color: POS_COLOR[p.pos] }));
  body.position.y = s * 1.1; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(s * .85, s * .85, s * .85), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  head.position.y = s * 2.6; g.add(head);
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  loader.load(p.photo, t => { t.encoding = THREE.sRGBEncoding; const w = head.material; head.material = [w, w, w, w, new THREE.MeshLambertMaterial({ map: t }), w]; }, undefined, () => {});
  if (p.captain) { const b = new THREE.Mesh(new THREE.OctahedronGeometry(s * .35), new THREE.MeshBasicMaterial({ color: 0xffb92e })); b.position.y = s * 3.7; b.userData.spin = true; g.add(b); }
  return g;
}
function draw3D(canvas, players, tries) {
  if (!canvas) return;
  if (!canvas.clientWidth) { if (tries < 20) setTimeout(() => draw3D(canvas, players, tries + 1), 60); return; }
  dispose3D();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0221);
  const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000); cam.position.set(0, 85, 105);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, h, false);
  scene.add(new THREE.AmbientLight(0xffffff, .8)); const sun = new THREE.DirectionalLight(0xffffff, .8); sun.position.set(30, 80, 40); scene.add(sun);
  const controls = new THREE.OrbitControls(cam, canvas); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.1;
  const turf = new THREE.Mesh(new THREE.BoxGeometry(PW + 8, .6, PH + 8), new THREE.MeshLambertMaterial({ color: 0x0d7a3d })); turf.position.y = -.3; scene.add(turf);
  const lm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [[PW, .4, 0, -PH / 2], [PW, .4, 0, PH / 2], [.4, PH, -PW / 2, 0], [.4, PH, PW / 2, 0], [PW, .4, 0, 0]].forEach(([lw, lh, x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lw, .08, lh), lm); m.position.set(x, .06, z); scene.add(m); });
  const by = {}; players.forEach(p => (by[p.pos] = by[p.pos] || []).push(p));
  Object.entries(by).forEach(([pos, list]) => list.forEach((p, i) => { const b = playerBlock(p); b.position.set(xFor(i, list.length), 0, zFor(pos)); scene.add(b); }));
  const loop = () => { T.raf = requestAnimationFrame(loop); controls.update();
    scene.traverse(o => { if (o.userData.spin) o.rotation.y += .03; }); renderer.render(scene, cam); };
  T = { renderer, controls }; loop();
}
let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (state && squadView === '3d') { renderSquad(); renderTeamView(); } }, 250); });

/* ---------- player modal ---------- */
function closeModal() { $('modal').classList.remove('active'); }
function openModal(html) { $('modal-body').innerHTML = '<div class="modal-handle"></div>' + html; $('modal').classList.add('active'); }
function openActionModal(id) {
  const p = state.players.find(x => x.id === id); if (!p) return;
  const gw = state.nextGW;
  openModal(`<div class="action-player-info"><img src="${p.photo}" alt="" onerror="this.style.visibility='hidden'">
    <div class="info-text"><div class="info-name">${esc(p.name)} <span class="pos-badge" data-pos="${p.pos}">${p.pos}</span></div>
    <div class="info-meta">${esc(p.team)} · ${fmt(p.price)} · form ${p.form} · ${p.totalPoints} pts</div>
    <div class="info-meta" style="margin-top:6px">GW${gw}: ${fxChips(p.teamId, gw)}</div></div></div>
    <div class="action-list">
      <button class="action-btn primary-action" onclick="planOut('${p.id}')"><span class="action-icon">🔄</span><span class="action-info">Plan transfer out<div class="action-sub">Add to the GW${gw} plan</div></span></button>
      <button class="action-btn" onclick="setRole('${p.id}','captain')"><span class="action-icon">©️</span><span class="action-info">Make captain<div class="action-sub">What-if only. Resets on next sync.</div></span></button>
      <button class="action-btn" onclick="setRole('${p.id}','vice')"><span class="action-icon">🅥</span><span class="action-info">Make vice-captain</span></button>
    </div>
    ${p.status !== 'a' ? '<div class="perf-injury-note">⚠️ Flagged by FPL as a doubt or unavailable. Check the news before the deadline.</div>' : ''}
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Close</button></div>`);
}
function setRole(id, role) {
  state.players.forEach(p => { if (role === 'captain') { p.captain = p.id === id; if (p.captain) p.vice = false; } else { p.vice = p.id === id; if (p.vice) p.captain = false; } });
  closeModal(); renderSquad(); renderTeamView(); renderCaptain(); toast(role === 'captain' ? '©️ Captain updated' : '🅥 Vice-captain updated');
}
function planOut(id) { const p = state.players.find(x => x.id === id); closeModal(); savePlan(state.nextGW, 'out', String(p.fplId)); goPlanner(); }
function showHelp() {
  openModal(`<h3>How it works</h3><p style="line-height:1.7;font-size:.9rem">Pick your name and the app pulls your squad and your family league rivals live from FPL. Use <b>Planner</b> to line up transfers, captains and chips for the next six gameweeks. It warns you about blank and double gameweeks and tracks your bank. Plans stay on the device you make them on.</p><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Got it</button></div>`);
}

/* ---------- planner ---------- */
const findEl = t => { t = (t || '').toLowerCase().trim(); return t ? state.bootstrap?.elements.find(e => e.web_name.toLowerCase() === t) : null; };
function savePlan(gw, key, val) { state.plans[gw] = { ...(state.plans[gw] || {}), [key]: val }; saveState(); renderPlanner(); }
function goPlanner() { switchView('planner', document.querySelectorAll('.main-tab')[2]); }
function quickPlanIn(name) { savePlan(state.nextGW, 'in', name); toast(`➕ ${name} added to GW${state.nextGW} plan`); }

function renderPlanner() {
  const el = $('season-planner'); if (!el) return;
  if (!state.players.length || !state.bootstrap) { el.innerHTML = emptyBox('Sync to load your squad, then plan ahead.'); return; }
  let bank = state.bank;
  const used = Object.fromEntries((state.chipsUsed || []).map(c => [c.name, c.event]));
  const html = [];
  for (let gw = state.nextGW; gw < state.nextGW + 6 && gw <= 38; gw++) {
    const pl = state.plans[gw] || {}, outP = state.players.find(p => String(p.fplId) === pl.out), inE = findEl(pl.in);
    const blank = state.players.filter(p => !p.bench && !teamFixtures(p.teamId, gw).length).length;
    const dbl = state.players.filter(p => teamFixtures(p.teamId, gw).length > 1).length;
    let impact = '';
    if (outP && inE) {
      bank += outP.price - inE.now_cost / 10;
      const bad = POS_MAP[inE.element_type] !== outP.pos;
      impact = `<div class="plan-bank-impact ${bank < 0 || bad ? 'negative' : ''}">${bad ? `⚠️ Position mismatch (${outP.pos} → ${POS_MAP[inE.element_type]}). ` : ''}Bank after: ${fmt(bank)}${bank < 0 ? ' · over budget' : ''}${gw === state.nextGW && state.ft < 1 ? ' · −4 hit' : ''}</div>`;
    }
    html.push(`<div class="plan-card ${pl.chip ? 'chip' : ''}">
      <div class="plan-header"><div class="gw-label">GW${gw}</div>
        <div class="gw-acc-summary">${blank ? `<span class="gw-acc-pill chip">🚫 ${blank} starter${blank > 1 ? 's' : ''} blank</span>` : ''}${dbl ? `<span class="gw-acc-pill captain">✌️ ${dbl} double${dbl > 1 ? 's' : ''}</span>` : ''}${!blank && !dbl ? '<span class="gw-acc-pill">Normal week</span>' : ''}</div></div>
      <div class="plan-grid">
        <div class="field"><label>Transfer out</label><select onchange="savePlan(${gw},'out',this.value)"><option value="">—</option>${sortedPlayers().map(p => `<option value="${p.fplId}" ${String(p.fplId) === pl.out ? 'selected' : ''}>${esc(p.name)} (${p.pos}, ${fmt(p.price)})</option>`).join('')}</select></div>
        <div class="field"><label>Transfer in</label><input list="all-players" value="${esc(pl.in || '')}" placeholder="Type a player…" onchange="savePlan(${gw},'in',this.value)"></div>
        <div class="field"><label>Captain</label><select onchange="savePlan(${gw},'cap',this.value)"><option value="">—</option>${state.players.filter(p => !p.bench).map(p => `<option value="${p.fplId}" ${String(p.fplId) === pl.cap ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Chip</label><select onchange="savePlan(${gw},'chip',this.value)"><option value="">None</option>${Object.entries(CHIPS).map(([k, v]) => `<option value="${k}" ${k === pl.chip ? 'selected' : ''}>${v}${used[k] ? ` (used GW${used[k]})` : ''}</option>`).join('')}</select></div>
      </div>
      ${impact}
      <div class="field" style="margin-top:12px"><label>Notes for the family chat</label><textarea onchange="savePlan(${gw},'note',this.value)" placeholder="Why this move?">${esc(pl.note || '')}</textarea></div>
    </div>`);
  }
  el.innerHTML = html.join('');
}

/* ---------- league, roast, history ---------- */
function renderLeaderboard() {
  const el = $('leaderboard-card'); if (!el) return;
  if (!state.familyData) { el.innerHTML = emptyBox('Sync to load'); return; }
  const rows = [...state.familyData].filter(f => lastGW(f)).sort((a, b) => lastGW(b).total_points - lastGW(a).total_points);
  el.innerHTML = rows.map((f, i) => {
    const l = lastGW(f), last = i === rows.length - 1;
    return `<div class="lb-row ${f.id === teamId ? 'me' : ''}"><div class="lb-rank">${RANK_EMOJI[i] || i + 1}</div>
      <div><div class="lb-name">${f.emoji} ${esc(f.name)}</div><div class="lb-teamname">${esc(f.nick)}</div></div>
      <div class="lb-stat">${l.points}<small>GW</small></div><div class="lb-stat">${fmtRank(l.overall_rank)}<small>rank</small></div>
      <div class="lb-stat lb-primary">${l.total_points}<small>total</small></div>
      <div class="lb-quote">${i === 0 ? pick(BURNS_TOP) : last ? pick(BURNS_LOW) : ''}</div></div>`;
  }).join('');
}

let roastText = '';
function renderRoast() {
  const el = $('weekly-roast'); if (!el) return;
  const rows = (state.familyData || []).filter(f => lastGW(f)).map(f => { const l = lastGW(f); return { ...f, net: l.points - l.event_transfers_cost, hit: l.event_transfers_cost, bench: l.points_on_bench }; }).sort((a, b) => b.net - a.net);
  if (rows.length < 2) { el.innerHTML = emptyBox('Sync to load'); return; }
  const top = rows[0], bot = rows[rows.length - 1], benchKing = [...rows].sort((a, b) => b.bench - a.bench)[0], hitter = [...rows].sort((a, b) => b.hit - a.hit)[0];
  const lines = [
    `${top.emoji} ${top.name} (${top.nick}) won GW${state.currentGW} with ${top.net} pts. Insufferable already.`,
    `${bot.emoji} ${bot.name} finished last on ${bot.net} pts, ${top.net - bot.net} behind the winner.`,
    benchKing.bench >= 6 ? `🪑 ${benchKing.name} left ${benchKing.bench} points rotting on the bench.` : '',
    hitter.hit > 0 ? `💸 ${hitter.name} paid ${hitter.hit} points in hits. Bold.` : ''].filter(Boolean);
  roastText = `🔥 FPL FAMILY ROAST · GW${state.currentGW}\n\n` + lines.join('\n');
  el.innerHTML = `<div class="roast-header-row"><div class="roast-title">Gameweek ${state.currentGW}</div><div class="roast-btn-row"><button class="btn small" onclick="copyRoast()">📋 Copy for WhatsApp</button></div></div>` + lines.map(l => `<div class="roast-line">${esc(l)}</div>`).join('');
}
function copyRoast() { navigator.clipboard?.writeText(roastText).then(() => toast('📋 Copied. Paste it in the group chat.'), () => toast('Copy failed', true)); }

function renderHistory() {
  const el = $('chart-points'), chips = $('chip-tracker'); if (!el) return;
  const series = (state.familyData || []).filter(f => f.history?.current?.length).map((f, i) => ({ name: f.name, color: COLORS[i % COLORS.length], pts: f.history.current.map(e => e.total_points) }));
  if (!series.length) { el.innerHTML = emptyBox('Sync to load'); return; }
  const n = Math.max(...series.map(s => s.pts.length)), maxV = Math.max(...series.map(s => Math.max(...s.pts))) || 1;
  const W = 700, H = 280, P = 36, x = i => P + (n < 2 ? 0 : i * (W - P * 1.5) / (n - 1)), y = v => H - P - v / maxV * (H - P * 1.6);
  el.innerHTML = `<div class="rank-svg-wrap"><svg viewBox="0 0 ${W} ${H}" style="min-width:520px;width:100%" role="img" aria-label="Total points per gameweek for each family manager">
    ${[0, .5, 1].map(f => `<line x1="${P}" x2="${W - 10}" y1="${y(maxV * f)}" y2="${y(maxV * f)}" stroke="currentColor" opacity=".12"/><text x="4" y="${y(maxV * f) + 4}" font-size="11" fill="currentColor" opacity=".6">${Math.round(maxV * f)}</text>`).join('')}
    ${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${s.pts.map((v, i) => x(i) + ',' + y(v)).join(' ')}"/>`).join('')}
    <text x="${W - 10}" y="${H - 8}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">GW${n}</text></svg></div>
    <div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)} · ${s.pts[s.pts.length - 1]}</span>`).join('')}</div>`;
  const used = Object.fromEntries((state.chipsUsed || []).map(c => [c.name, c.event]));
  chips.innerHTML = Object.entries(CHIPS).map(([k, v]) => `<div class="chip-card ${used[k] ? 'used' : ''}"><div class="chip-icon">${v.split(' ')[0]}</div><div class="chip-name">${v.slice(3)}</div><div class="chip-status">${used[k] ? 'Used GW' + used[k] : 'Available'}</div></div>`).join('');
}

/* ---------- players ---------- */
function renderPlayers() {
  const el = $('players-grid'); if (!el) return;
  if (!state?.bootstrap) { el.innerHTML = emptyBox('Sync to search every FPL player.'); return; }
  const q = $('p-search').value.toLowerCase().trim(), pos = $('p-pos').value, sort = $('p-sort').value;
  const list = state.bootstrap.elements.filter(e => (!q || e.web_name.toLowerCase().includes(q)) && (!pos || String(e.element_type) === pos))
    .sort((a, b) => parseFloat(b[sort]) - parseFloat(a[sort])).slice(0, 48);
  el.innerHTML = list.length ? list.map(e => `<div class="player-result" style="cursor:pointer" onclick="quickPlanIn('${esc(e.web_name).replace(/'/g, '&#39;')}')">
    <div class="name">${esc(e.web_name)} <span class="pos-badge" data-pos="${POS_MAP[e.element_type]}">${POS_MAP[e.element_type]}</span></div>
    <div class="meta"><span>${state.teamShort[e.team]}</span><span class="price-tag">${fmt(e.now_cost / 10)}</span><span>${e.selected_by_percent}% owned</span></div>
    <div class="stat-line"><span>Form <strong>${e.form}</strong></span><span>Pts <strong>${e.total_points}</strong></span><span>Next ${fxChips(e.team, state.nextGW)}</span></div></div>`).join('') : emptyBox('No players match.');
}

/* ---------- navigation + boot ---------- */
function switchView(name, el) {
  if (name !== currentView) dispose3D();
  currentView = name;
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  (el || document.querySelectorAll('.main-tab')[['dashboard', 'team', 'planner', 'leaderboard', 'history', 'players'].indexOf(name)])?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const v = $('view-' + name); if (v) v.style.display = 'block';
  if (name === 'team') renderTeamView(); if (name === 'dashboard') renderSquad();
  scrollTo({ top: 0, behavior: 'smooth' });
}
function pickManager(id, el) {
  pickedId = id; document.querySelectorAll('.manager-pill').forEach(p => p.classList.remove('selected'));
  el?.classList.add('selected'); $('welcome-team-id').value = id;
}
function startApp() {
  const id = $('welcome-team-id').value.trim() || pickedId;
  if (!id) return toast('Pick a manager first', true);
  teamId = String(id); state = loadFor(teamId); localStorage.setItem('fpl-cc-last', teamId);
  $('welcome').style.display = 'none'; $('app').style.display = 'block';
  renderAll(); syncAll(false);
}
function logout() { dispose3D(); localStorage.removeItem('fpl-cc-last'); state = null; teamId = null; $('app').style.display = 'none'; $('welcome').style.display = 'flex'; }

document.addEventListener('DOMContentLoaded', () => {
  $('manager-picker').innerHTML = FAMILY.map(m => `<button class="manager-pill" onclick="pickManager('${m.id}', this)">${m.emoji} ${m.name}<small>${m.nick}</small></button>`).join('');
  const last = localStorage.getItem('fpl-cc-last');
  if (last) { $('welcome-team-id').value = last; startApp(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.key === 's' || e.key === 'S') && state && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !e.metaKey && !e.ctrlKey) syncAll(true);
});
setInterval(tickDeadline, 1000);
setInterval(() => { if (state) updateSyncDot(); }, 15000);
setInterval(() => { if (state && !document.hidden && Date.now() - state.lastSync > 5 * 60000) syncAll(false); }, 60000);
