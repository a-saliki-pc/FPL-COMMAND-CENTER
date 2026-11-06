/* =========================================================
   FPL Command Center v13 — app.js
   ========================================================= */

const PROXY = 'https://fplworker.adyb-saliki.workers.dev/?url=';
const FPL_API = 'https://fantasy.premierleague.com/api';
const IMG_BASE = 'https://resources.premierleague.com/premierleague/photos/players/110x140';

const FAMILY = [
  { id: '1115676', name: 'Adyb Saliki',    emoji: '🧠' },
  { id: '3719511', name: 'Yassine Saied',  emoji: '🚀' },
  { id: '3844150', name: 'Ismail Saliki',  emoji: '🎲' },
  { id: '1115993', name: 'Youssef Said',   emoji: '🐢' },
  { id: '6849321', name: 'Zakaria Said',   emoji: '😎' },
];

const POS_MAP = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const RANK_EMOJI = ['👑', '🐐', '🥉', '😴', '🐌'];

let state = null;
let teamId = null;
let pickedId = null;
let squadView = localStorage.getItem('fpl-cc-squad-view') || 'pitch';
let planningMode = false;

function emptyState() {
  return { players: [], plans: [], budget: 100, bank: 0, freeTransfers: 1, managerName: '', bootstrap: null, familyData: null, currentGW: null };
}
function loadFor(id) {
  try {
    const raw = localStorage.getItem(`fpl-cc-v6:${id}`);
    if (raw) return { ...emptyState(), ...JSON.parse(raw), bootstrap: null, familyData: null };
  } catch (e) {}
  return emptyState();
}
function saveState() {
  if (!teamId) return;
  try { localStorage.setItem(`fpl-cc-v6:${teamId}`, JSON.stringify({ players: state.players, plans: state.plans, bank: state.bank, currentGW: state.currentGW })); } catch(e) {}
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(n) { return '£' + Number(n || 0).toFixed(1) + 'm'; }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.className = 'toast' + (isError ? ' error' : '');
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.classList.remove('show'), 3200);
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  document.documentElement.classList.toggle('light-mode', isLight);
  localStorage.setItem('fpl-cc-theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle-app').textContent = isLight ? '☀️' : '🌙';
}
if (localStorage.getItem('fpl-cc-theme') === 'light') { document.body.classList.add('light-mode'); document.documentElement.classList.add('light-mode'); }

function toggleSquadView() {
  const order = ['pitch', 'list', '3d'];
  squadView = order[(order.indexOf(squadView) + 1) % order.length];
  localStorage.setItem('fpl-cc-squad-view', squadView);
  renderSquad(); renderTeamView(); updateViewToggleButtons();
  toast({ pitch: '⚽ Pitch view', list: '📋 List view', '3d': '🎲 3D view' }[squadView]);
}
function updateViewToggleButtons() {
  const next = squadView === 'pitch' ? '📋 List' : squadView === 'list' ? '🎲 3D' : '⚽ Pitch';
  ['view-toggle-dashboard', 'view-toggle-team'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = next; });
}

async function fpl(path) {
  const res = await fetch(PROXY + encodeURIComponent(FPL_API + path));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function syncAll(showToast = true) {
  if (showToast) toast('🔄 Syncing...');
  try {
    const boot = await fpl('/bootstrap-static/');
    state.bootstrap = { elements: boot.elements, teams: boot.teams, events: boot.events };
    const currentGW = boot.events.find(e => e.is_current)?.id || Math.max(1, boot.events.find(e => e.is_next)?.id - 1 || 1);
    state.currentGW = currentGW;
    
    const familyData = [];
    for (const m of FAMILY) {
      const picks = await fpl(`/entry/${m.id}/event/${currentGW}/picks/`).catch(() => null);
      const history = await fpl(`/entry/${m.id}/history/`).catch(() => null);
      familyData.push({ ...m, picks, history });
    }
    state.familyData = familyData;
    const mine = familyData.find(f => f.id === teamId);
    if (mine && mine.picks) mergeMySquad(mine.picks);

    renderAll();
    if (showToast) toast('✅ Synced!');
  } catch (e) { if (showToast) toast('Sync failed: ' + e.message, true); }
}

function mergeMySquad(picksData) {
  const bp = state.bootstrap;
  const teamMap = {};
  bp.teams.forEach(t => teamMap[t.id] = t.short_name);
  state.players = picksData.picks.map(p => {
    const el = bp.elements.find(x => x.id === p.element);
    if (!el) return null;
    return {
      id: uid(), fplId: el.id, name: el.web_name, pos: POS_MAP[el.element_type], price: el.now_cost / 10, team: teamMap[el.team] || '?', teamId: el.team,
      captain: p.is_captain, vice: p.is_vice_captain, bench: p.position > 11, order: p.position, photo: `${IMG_BASE}/p${el.code}.png`, status: el.status
    };
  }).filter(Boolean);
  if (picksData.entry_history) state.bank = (picksData.entry_history.bank || 0) / 10;
}

function renderAll() {
  document.getElementById('hdr-manager').textContent = state.managerName || '—';
  document.getElementById('hdr-points').textContent = state.familyData?.find(f => f.id === teamId)?.history?.current?.slice(-1)[0]?.total_points || '—';
  document.getElementById('hdr-bank').textContent = fmt(state.bank);
  renderSquad();
  renderTeamView();
  updateViewToggleButtons();
  renderLeaderboard();
}

function getSortedPlayers() { return [...state.players].sort((a,b) => (a.order ?? 99) - (b.order ?? 99)); }

function renderSquad() {
  const grid = document.getElementById('squad-grid');
  const dashPitch = document.getElementById('pitch-view-dashboard');
  if (!grid || !dashPitch) return;
  if (squadView === 'list') {
    grid.style.display = 'grid'; dashPitch.style.display = 'none'; 
    grid.innerHTML = getSortedPlayers().map(p => `
      <div class="player-card ${p.bench ? 'bench' : ''}" data-pos="${p.pos}">
        ${p.photo ? `<img class="player-headshot" src="${p.photo}" alt="">` : ''}
        <div class="name">${escapeHtml(p.name)} <span class="pos-badge" data-pos="${p.pos}">${p.pos}</span></div>
        <div class="meta">${fmt(p.price)} · ${escapeHtml(p.team)}</div>
      </div>`).join('');
  } else if (squadView === '3d') {
    grid.style.display = 'none'; dashPitch.style.display = 'block'; renderPitch3D(dashPitch, false);
  } else {
    grid.style.display = 'none'; dashPitch.style.display = 'block'; renderPitchView(dashPitch, false);
  }
}

function renderPitchView(container, planning) {
  if (!state.players.length) { container.innerHTML = '<div class="empty">Sync to load</div>'; return; }
  let starters = state.players.filter(p => !p.bench);
  let bench = state.players.filter(p => p.bench);
  const gk = starters.filter(p => p.pos === 'GK'), def = starters.filter(p => p.pos === 'DEF'), mid = starters.filter(p => p.pos === 'MID'), fwd = starters.filter(p => p.pos === 'FWD');
  const capId = state.players.find(p => p.captain)?.id;
  
  const card = (p, isBench) => `
    <div class="pitch-card ${p.id === capId ? 'captain' : ''} ${isBench ? 'bench' : ''}">
      ${p.id === capId ? '<div class="pitch-badge-c">C</div>' : ''}
      ${p.photo ? `<img src="${p.photo}" alt="">` : ''}
      <div class="pitch-name">${escapeHtml(p.name.split(' ').slice(-1)[0])}</div>
    </div>`;

  container.innerHTML = `
    <div class="pitch-formation">${def.length}-${mid.length}-${fwd.length} · GW${state.currentGW}</div>
    <div class="pitch-row fwd">${fwd.map(p => card(p, false)).join('')}</div>
    <div class="pitch-row mid">${mid.map(p => card(p, false)).join('')}</div>
    <div class="pitch-row def">${def.map(p => card(p, false)).join('')}</div>
    <div class="pitch-row gk">${gk.map(p => card(p, false)).join('')}</div>
    <div class="pitch-bench"><div class="pitch-bench-label">Bench</div><div class="pitch-bench-row">${bench.map(p => card(p, true)).join('')}</div></div>
  `;
}

function renderPitch3D(container, planning) {
  if (!state.players.length) { container.innerHTML = '<div class="empty">Sync to load</div>'; return; }
  container.innerHTML = `<div class="pitch-3d-wrap"><canvas id="pitch-3d-canvas"></canvas><div class="pitch-3d-hint">🖱️ Drag to orbit</div></div>`;
  setTimeout(() => {
    if (typeof window.renderSquad3D === 'function') window.renderSquad3D('pitch-3d-canvas', state.players.filter(p => !p.bench));
  }, 200);
}

function renderTeamView() {
  const pitch = document.getElementById('pitch-view-team');
  if (!pitch) return;
  if (!state.players.length) { pitch.innerHTML = '<div class="empty">Sync to load</div>'; return; }
  if (squadView === '3d') renderPitch3D(pitch, false); else renderPitchView(pitch, false);
}

function switchView(name, el) {
  if (name !== 'dashboard' && name !== 'team' && typeof window.disposeSquad3D === 'function') window.disposeSquad3D();
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const v = document.getElementById('view-' + name);
  if (v) v.style.display = 'block';
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'team') renderTeamView();
}

function pickManager(id, el) {
  pickedId = id;
  document.querySelectorAll('.manager-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  document.getElementById('welcome-team-id').value = id;
}

function startApp() {
  const id = pickedId || document.getElementById('welcome-team-id').value.trim();
  if (!id) return toast('Pick a manager', true);
  teamId = id; state = loadFor(id);
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderAll(); syncAll(false);
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard-card');
  const miniEl = document.getElementById('mini-leaderboard');
  if (!state.familyData) return;
  const html = state.familyData.map((m, i) => `
    <div class="lb-row">
      <div class="lb-rank">${RANK_EMOJI[i] || i+1}</div>
      <div><div class="lb-name">${m.name}</div></div>
      <div class="lb-stat">${m.history?.current?.slice(-1)[0]?.total_points || 0} pts</div>
    </div>`).join('');
  if (el) el.innerHTML = html;
  if (miniEl) miniEl.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('manager-picker').innerHTML = FAMILY.map(m => `<button class="manager-pill" data-id="${m.id}" onclick="pickManager('${m.id}', this)">${m.emoji} ${m.name}</button>`).join('');
});

/* =========================================================
   3D ENGINE (Fixed)
   ========================================================= */
let scene3d, camera3d, renderer3d, controls3d, pitchGroup, playersGroup;
let animationId = null, currentCanvasId = null;
const PITCH_W = 68, PITCH_H = 105;
const POS_COLOR = { GK: 0xffb92e, DEF: 0x3b82f6, MID: 0x00ff87, FWD: 0xff2882 };

function zForPos(pos) { return pos==='GK' ? -42 : pos==='DEF' ? -21 : pos==='MID' ? 10 : 35; }
function xForIndex(i, total) { return total===1 ? 0 : -((total-1)*14)/2 + i*14; }

function makePlayerBlock(player, isCap) {
  const g = new THREE.Group(), size = 3.2;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size, size*2.2, size), new THREE.MeshLambertMaterial({ color: POS_COLOR[player.pos] || 0xffffff }))).position.y = size*1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(size*0.85, size*0.85, size*0.85), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  head.position.y = size*2.6; g.add(head);
  if (player.photo) {
    new THREE.TextureLoader().load(player.photo, (t) => { t.colorSpace = THREE.SRGBColorSpace; head.material = [head.material, head.material, head.material, head.material, new THREE.MeshLambertMaterial({ map: t }), head.material]; }, undefined, () => {});
  }
  if (isCap) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(size*0.5, size*0.5, size*0.5), new THREE.MeshBasicMaterial({ color: 0xffb92e }));
    b.position.y = size*3.6; g.add(b);
  }
  return g;
}

function makePitch() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(PITCH_W + 8, 0.6, PITCH_H + 8), new THREE.MeshLambertMaterial({ color: 0x0d7a3d }))).position.y = -0.3;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const addLine = (w, h, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), lineMat); m.position.set(x, 0.06, z); g.add(m); };
  addLine(PITCH_W, 0.4, 0, -PITCH_H/2); addLine(PITCH_W, 0.4, 0, PITCH_H/2);
  addLine(0.4, PITCH_H, -PITCH_W/2, 0); addLine(0.4, PITCH_H, PITCH_W/2, 0); addLine(PITCH_W, 0.4, 0, 0);
  return g;
}

function dispose3D() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  if (controls3d) controls3d.dispose();
  if (renderer3d) renderer3d.dispose();
  scene3d = camera3d = renderer3d = controls3d = pitchGroup = playersGroup = null;
}

function loop3D() {
  animationId = requestAnimationFrame(loop3D);
  if (controls3d) controls3d.update();
  if (renderer3d && scene3d && camera3d) renderer3d.render(scene3d, camera3d);
}

window.renderSquad3D = function(canvasId, players) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas.clientWidth === 0) return setTimeout(() => window.renderSquad3D(canvasId, players), 50);

  if (!scene3d || currentCanvasId !== canvasId) {
    dispose3D(); currentCanvasId = canvasId;
    scene3d = new THREE.Scene(); scene3d.background = new THREE.Color(0x0d0221);
    camera3d = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera3d.position.set(0, 90, 90); 
    renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer3d.setSize(canvas.clientWidth, canvas.clientHeight);
    
    scene3d.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(30, 80, 40); scene3d.add(sun);

    controls3d = new THREE.OrbitControls(camera3d, canvas);
    controls3d.enableDamping = true; controls3d.target.set(0, 0, 0);
    
    pitchGroup = new THREE.Group(); pitchGroup.add(makePitch()); scene3d.add(pitchGroup);
    playersGroup = new THREE.Group(); scene3d.add(playersGroup);
  }

  while(playersGroup.children.length > 0) playersGroup.remove(playersGroup.children[0]);

  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach(p => byPos[p.pos]?.push(p));
  Object.entries(byPos).forEach(([pos, list]) => {
    list.forEach((player, i) => {
      const b = makePlayerBlock(player, player.captain);
      b.position.set(xForIndex(i, list.length), 0, zForPos(pos));
      playersGroup.add(b);
    });
  });

  if (!animationId) loop3D();
  renderer3d.setSize(canvas.clientWidth, canvas.clientHeight);
  camera3d.aspect = canvas.clientWidth / canvas.clientHeight; camera3d.updateProjectionMatrix();
};

window.disposeSquad3D = function() { if (animationId) cancelAnimationFrame(animationId); animationId = null; };
