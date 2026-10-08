/* =========================================================
   FPL Command Center v4 — app.js
   Full Roast Mode · Family League Edition
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
const RANK_EMOJI = ['👑', '🐐', '🥉', '😴', '🐌', '🧹', '🗑️', '💀'];
const SHAME_EMOJI = (pts) => {
  if (pts >= 70) return '🤩';
  if (pts >= 60) return '😎';
  if (pts >= 50) return '😊';
  if (pts >= 45) return '😬';
  if (pts >= 40) return '😅';
  if (pts >= 35) return '🤡';
  if (pts >= 30) return '💀';
  if (pts >= 20) return '🗑️';
  return '☠️';
};
const CHIP_EMOJI = { wildcard: '🃏', bboost: '🎲', '3xc': '⚡', freehit: '🏠' };
const CHIP_NAME = { wildcard: 'Wildcard', bboost: 'Bench Boost', '3xc': 'Triple Captain', freehit: 'Free Hit' };
const MOOD_EMOJI = {
  hot: '🔥',
  climbing: '📈',
  steady: '➡️',
  slipping: '📉',
  dead: '💀',
};

/* ========== ROAST QUOTES LIBRARY ========== */
const ROAST_BEST = [
  "Peaked early. Enjoy it while it lasts.",
  "Wildcard magic or pure luck? We'll never know.",
  "The differentials finally paid off.",
  "Captained the right guy for once.",
  "Even a broken clock is right twice a day.",
  "Bench boost finally justified its existence.",
  "Putting the family on notice.",
  "This is what happens when the picks work.",
  "Somebody call Guinness — this was elite.",
  "The template delivered. Fair play.",
];

const ROAST_WORST = [
  "Could have been worse. It wasn't much better.",
  "Even the bench outscored him this week.",
  "Sweating through a premium pick that blanked.",
  "Started the season in clown mode. Legendary.",
  "Died on the pitch. RIP his GW.",
  "Straight to the bin. Nothing saved.",
  "At least the app didn't crash. Silver linings.",
  "Someone check on him.",
  "The wooden spoon is calling.",
  "Trusted his gut. His gut was wrong. Again.",
  "FPL is not for everyone. Exhibit A.",
  "The differential didn't differential.",
];

const ROAST_WEEKLY = [
  "Family group chat is going to be spicy this week.",
  "Somebody's getting roasted in the WhatsApp group.",
  "Rivalries intensifying. Popcorn ready.",
  "Nobody wants to be last. Yet here we are.",
  "Peak drama. Peak FPL. Peak family.",
  "Remember: it's just a game. (It's not.)",
  "Screenshots incoming. Defend yourselves.",
];

/* ========== STATE ========== */
let state = null;
let teamId = null;
let pickedId = null;

function storageKey(id) { return `fpl-cc-v4:${id}`; }
function emptyState() {
  return {
    players: [], plans: [], budget: 100, bank: 0, freeTransfers: 1,
    managerName: '', bootstrap: null, familyData: null,
    currentGW: null, lastSync: 0,
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
    players: state.players, plans: state.plans,
    budget: state.budget, bank: state.bank,
    freeTransfers: state.freeTransfers, managerName: state.managerName,
    bootstrap: state.bootstrap, familyData: state.familyData,
    currentGW: state.currentGW, lastSync: state.lastSync,
  };
  try { localStorage.setItem(storageKey(teamId), JSON.stringify(toSave)); }
  catch (e) { toast('Storage full — export a backup', true); }
}

/* ========== UTILS ========== */
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
  setTimeout(() => t.classList.remove('show'), 3000);
}
function getFamInfo(id) {
  return FAMILY.find(f => f.id === id) || { name: 'Unknown', emoji: '👤' };
}
function randomQuote(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function fmtRank(r) {
  if (!r || r <= 0) return '—';
  return '#' + r.toLocaleString();
}

/* ========== THEME ========== */
function applyTheme(mode) {
  document.body.classList.toggle('light-mode', mode === 'light');
  const emoji = mode === 'light' ? '☀️' : '🌙';
  ['theme-toggle-welcome', 'theme-toggle-app'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = emoji;
  });
}
function toggleTheme() {
  const current = document.body.classList.contains('light-mode') ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('fpl-cc-theme', next);
  applyTheme(next);
  toast(next === 'light' ? '☀️ Light mode' : '🌙 Dark mode');
}
(function initTheme() {
  const saved = localStorage.getItem('fpl-cc-theme');
  const mode = saved || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(mode);
})();

/* ========== PROXY FETCH ========== */
async function fpl(path) {
  const url = PROXY + encodeURIComponent(FPL_API + path);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ========== PLAYER IMAGE ========== */
function playerImgUrl(el) {
  if (!el || !el.photo) return '';
  // FPL stores "p123456.jpg" — swap extension and prepend code
  const code = el.code || 0;
  const ext = el.photo.replace(/^\D+/, '').replace('.jpg', '');
  return `${IMG_BASE}/${ext}.png`;
}

/* ========== SYNC ========== */
async function syncAll(showToast = true) {
  const btn = document.getElementById('sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing...'; }
  if (showToast) toast('🔄 Syncing from FPL...');

  try {
    // 1. Bootstrap
    const boot = await fpl('/bootstrap-static/');
    state.bootstrap = {
      elements: boot.elements,
      teams: boot.teams,
      events: boot.events,
    };

    const currentGW = boot.events.find(e => e.is_current)?.id
      || boot.events.find(e => e.is_next)?.id
      || 1;
    state.currentGW = currentGW;

    // 2. Family data
    const familyData = [];
    for (const m of FAMILY) {
      try {
        const [picks, history, entry] = await Promise.all([
          fpl(`/entry/${m.id}/event/${currentGW}/picks/`).catch(() => null),
          fpl(`/entry/${m.id}/history/`).catch(() => null),
          fpl(`/entry/${m.id}/`).catch(() => null),
        ]);
        familyData.push({ ...m, picks, history, entry });
      } catch (e) {
        familyData.push({ ...m, picks: null, history: null, entry: null });
      }
    }
    state.familyData = familyData;

    // 3. My squad
    const mine = familyData.find(f => f.id === teamId);
    if (mine && mine.picks) mergeMySquad(mine.picks);

    state.lastSync = Date.now();
    saveState();
    renderAll();
    if (showToast) toast('✅ Synced — all 5 managers loaded');
  } catch (e) {
    console.error(e);
    if (showToast) toast('Sync failed: ' + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync All from FPL'; }
  }
}

function mergeMySquad(picksData) {
  const bp = state.bootstrap;
  const teamMap = {};
  bp.teams.forEach(t => teamMap[t.id] = t.short_name);

  state.players = picksData.picks.map(p => {
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
      teamId: el.team,
      captain: p.is_captain,
      vice: p.is_vice_captain,
      multiplier: p.multiplier,
      bench: p.position > 11,
      order: p.position,
      gwPoints: p.points || 0,
      photo: playerImgUrl(el),
      status: el.status,
      news: el.news,
      form: parseFloat(el.form) || 0,
      totalPoints: el.total_points,
      chanceOfPlaying: el.chance_of_playing_next_round,
    };
  }).filter(Boolean);

  const hist = picksData.entry_history;
  if (hist) {
    state.bank = (hist.bank || 0) / 10;
    state.budget = state.bank + state.players.reduce((s, p) => s + p.price, 0);
  }
}

/* ========== WELCOME ========== */
function renderManagerPicker() {
  const wrap = document.getElementById('manager-picker');
  wrap.innerHTML = FAMILY.map(m => `
    <button class="manager-pill" data-id="${m.id}" onclick="pickManager('${m.id}', this)">
      ${m.emoji} ${escapeHtml(m.name)}<small>Team ID ${m.id}</small>
    </button>
  `).join('');
}
function pickManager(id, el) {
  pickedId = id;
  document.querySelectorAll('.manager-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  document.getElementById('welcome-team-id').value = id;
}
function startApp() {
  const id = pickedId || document.getElementById('welcome-team-id').value.trim();
  if (!id) return toast('Pick a manager or enter a Team ID', true);
  if (!/^\d+$/.test(id)) return toast('Team ID must be numbers only', true);
  teamId = id;
  state = loadFor(id);
  const fam = getFamInfo(id);
  if (!state.managerName) state.managerName = fam.name;
  localStorage.setItem('fpl-cc-last-team', id);
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderAll();
  window.scrollTo(0, 0);
  const stale = !state.lastSync || (Date.now() - state.lastSync > 30 * 60 * 1000);
  if (stale) setTimeout(() => syncAll(false), 400);
}
function logout() {
  if (!confirm('Switch manager? Your data stays saved.')) return;
  saveState();
  teamId = null; state = null; pickedId = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('welcome-team-id').value = '';
  document.querySelectorAll('.manager-pill').forEach(p => p.classList.remove('selected'));
}
function showHelp() { document.getElementById('help-modal').classList.add('active'); }

/* ========== NAVIGATION ========== */
function switchView(name, el) {
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const v = document.getElementById('view-' + name);
  if (v) v.style.display = 'block';
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'history') renderHistory();
  if (name === 'players') renderPlayers();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ========== COUNTDOWN ========== */
function startCountdown() {
  const el = document.getElementById('hdr-deadline');
  const wrap = document.getElementById('hdr-deadline-wrap');
  if (!el) return;
  function tick() {
    const next = state?.bootstrap?.events?.find(e => e.is_next);
    if (!next || !next.deadline_time) { el.textContent = '—'; return; }
    const diff = new Date(next.deadline_time) - new Date();
    if (diff <= 0) { el.textContent = 'LIVE'; return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (d > 0) el.textContent = `${d}d ${h}h ${m}m`;
    else if (h > 0) el.textContent = `${h}h ${m}m ${s}s`;
    else el.textContent = `${m}m ${s}s`;
    if (wrap) wrap.classList.toggle('urgent', diff < 6 * 3600000);
  }
  tick();
  setInterval(tick, 1000);
}

/* ========== RENDER ALL ========== */
function renderAll() {
  renderHeader();
  renderSquad();
  renderStats();
  renderMiniLeaderboard();
  renderLeaderboard();
  renderTimeline();
  renderPlans();
  renderHistory();
  renderPlayers();
}

function renderHeader() {
  const squadValue = state.players.reduce((s, p) => s + Number(p.price || 0), 0);
  const mine = state.familyData?.find(f => f.id === teamId);
  const histCurrent = mine?.history?.current?.[0];
  const totalPts = histCurrent?.total_points || 0;
  const overallRank = histCurrent?.overall_rank || 0;

  document.getElementById('hdr-manager').textContent = state.managerName || '—';
  document.getElementById('hdr-points').textContent = totalPts || '—';
  document.getElementById('hdr-rank').textContent = fmtRank(overallRank);
  document.getElementById('hdr-bank').textContent = fmt(state.bank);
  document.getElementById('hdr-value').textContent = fmt(squadValue);
  document.getElementById('hdr-ft').textContent = state.freeTransfers;
}

function renderStats() {
  const size = state.players.length;
  const el = document.getElementById('stat-size');
  if (!el) return;
  el.textContent = size + '/15';
  const subs = { 0: 'Sync to load', 15: '✅ Squad complete' };
  document.getElementById('stat-size-sub').textContent = subs[size] || (15 - size) + ' spots left';

  const mine = state.familyData?.find(f => f.id === teamId);
  const current = mine?.history?.current || [];

  // GW points (latest)
  const gwPts = current[current.length - 1]?.points || 0;
  document.getElementById('stat-gwpts').textContent = gwPts || '—';
  document.getElementById('stat-gwpts-sub').textContent = state.currentGW ? `GW${state.currentGW}` : 'This week';

  // Best/Worst
  if (current.length > 0) {
    const best = current.reduce((m, g) => g.points > m.points ? g : m, current[0]);
    const worst = current.reduce((m, g) => g.points < m.points ? g : m, current[0]);
    document.getElementById('stat-best').textContent = best.points;
    document.getElementById('stat-best-sub').textContent = `GW${best.event}`;
    document.getElementById('stat-worst').textContent = worst.points;
    document.getElementById('stat-worst-sub').textContent = `GW${worst.event}`;
  } else {
    document.getElementById('stat-best').textContent = '—';
    document.getElementById('stat-best-sub').textContent = 'Season best';
    document.getElementById('stat-worst').textContent = '—';
    document.getElementById('stat-worst-sub').textContent = 'Season worst';
  }
}

function renderSquad() {
  const grid = document.getElementById('squad-grid');
  if (!grid) return;
  if (state.players.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="emoji">👥</span>Click <strong>🔄 Sync All</strong> to load your squad</div>';
    return;
  }
  const hasOrder = state.players.some(p => typeof p.order === 'number' && p.order < 99);
  const sorted = hasOrder
    ? [...state.players].sort((a,b) => (a.order ?? 99) - (b.order ?? 99))
    : [...state.players].sort((a,b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.price - a.price);

  // Get best captain option
  const bp = state.bootstrap;
  const elementsMap = {};
  if (bp) bp.elements.forEach(e => elementsMap[e.id] = e);
  const bestCap = [...state.players]
    .filter(p => !p.bench)
    .map(p => {
      const el = elementsMap[p.fplId];
      const form = el ? parseFloat(el.form) || 0 : 0;
      return { ...p, score: form };
    })
    .sort((a, b) => b.score - a.score)[0];

  grid.innerHTML = sorted.map(p => {
    const el = elementsMap[p.fplId];
    const fixture = el ? getNextFixture(el.team) : null;
    const isRecommendedCap = bestCap && p.id === bestCap.id;
    const teamBadge = p.teamId ? `https://resources.premierleague.com/premierleague25/badges/${p.teamId}.svg` : '';
    const injury = p.status && p.status !== 'a';
    return `
      <div class="player-card ${p.bench ? 'bench' : ''} ${p.captain ? 'captain-card' : ''}" data-pos="${p.pos}" onclick="openPlayerModal('${p.id}')">
        ${p.captain ? '<div class="captain-badge">C</div>' : ''}
        ${p.vice ? '<div class="vc-badge">V</div>' : ''}
        ${injury ? '<div class="injury-warn" title="' + escapeHtml(p.news || 'Injury doubt') + '">⚠️</div>' : ''}
        ${p.photo ? `<img class="player-headshot" src="${p.photo}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="name">
          <span>${escapeHtml(p.name)}</span>
          <span class="pos-badge" data-pos="${p.pos}">${p.pos}</span>
        </div>
        <div class="meta">
          <span class="price-tag">${fmt(p.price)}</span>
          <span style="display:flex;align-items:center;gap:4px">
            ${teamBadge ? `<img src="${teamBadge}" style="width:14px;height:14px" onerror="this.style.display='none'">` : ''}
            ${escapeHtml(p.team)}
          </span>
        </div>
        <div class="player-stats">
          <div class="player-stat">
            <div class="stat-val">${p.gwPoints || 0}</div>
            <div class="stat-lbl">GW</div>
          </div>
          <div class="player-stat">
            <div class="stat-val">${p.totalPoints || 0}</div>
            <div class="stat-lbl">Total</div>
          </div>
          <div class="player-stat">
            <div class="stat-val">${(p.form || 0).toFixed(1)}</div>
            <div class="stat-lbl">Form</div>
          </div>
        </div>
        ${fixture ? `<div class="fixture-box" data-diff="${fixture.diff}">⚽ ${fixture.team} (${fixture.diff})</div>` : ''}
        ${isRecommendedCap && !p.captain ? '<div style="font-size:0.6rem;color:var(--gold);margin-top:6px;font-weight:800">⭐ Cap pick</div>' : ''}
        ${p.bench ? '<div class="bench-label">Bench</div>' : ''}
        <button class="remove-btn" onclick="event.stopPropagation(); removePlayer('${p.id}')">✕</button>
      </div>
    `;
  }).join('');
}

function getNextFixture(teamId) {
  if (!state.bootstrap) return null;
  const fixtures = state.bootstrap.elements; // placeholder, real fixtures need separate call
  return null;
}

function renderTimeline() {
  const t = document.getElementById('timeline');
  if (!t) return;
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
    if (state.currentGW === gw) cls.push('current');
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
  if (!list) return;
  if (state.plans.length === 0) {
    list.innerHTML = '<div class="empty"><span class="emoji">🔄</span>No transfer plans yet — tap a gameweek above</div>';
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

/* ========== MINI LEADERBOARD (Dashboard) ========== */
function renderMiniLeaderboard() {
  const wrap = document.getElementById('mini-leaderboard');
  if (!wrap) return;

  if (!state.familyData || state.familyData.length === 0) {
    wrap.innerHTML = '<div class="empty" style="padding:16px;font-size:0.8rem"><span class="emoji" style="font-size:1.5rem">🏆</span>Sync to load family standings</div>';
    return;
  }

  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    const totalPts = hist[0]?.total_points || 0;
    const gwPts = hist[hist.length - 1]?.points || 0;
    return {
      id: m.id,
      name: m.name,
      emoji: m.emoji || '',
      teamName: m.entry?.name || '',
      totalPts,
      gwPts,
    };
  }).sort((a, b) => b.totalPts - a.totalPts);

  wrap.innerHTML = rows.map((r, i) => `
    <div class="lb-row mini ${r.id === teamId ? 'me' : ''}" onclick="switchView('leaderboard', document.querySelector('[data-view=leaderboard]'))">
      <div class="lb-rank">${RANK_EMOJI[i] || (i + 1)}</div>
      <div>
        <div class="lb-name">${r.emoji} ${escapeHtml(r.name)} ${r.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div>
        <div class="lb-teamname">${escapeHtml(r.teamName)}</div>
      </div>
      <div class="lb-stat">${r.totalPts}<small>Total</small></div>
      <div class="lb-stat">${r.gwPts}<small>GW</small></div>
    </div>
  `).join('');
}

/* ========== FULL FAMILY LEAGUE ========== */
function renderLeaderboard() {
  renderWeeklyRoast();
  renderMainLeaderboard();
  renderBestGW();
  renderWorstGW();
  renderTrophyCabinet();
  renderHallOfShame();
  renderGlance();
}

function renderWeeklyRoast() {
  const el = document.getElementById('weekly-roast');
  if (!el) return;
  if (!state.familyData || !state.familyData.length) {
    el.innerHTML = '<div class="empty" style="padding:20px"><span class="emoji">🔥</span>Sync to see this week\'s roast</div>';
    return;
  }
  const lines = buildRoastLines();
  el.innerHTML = `
    <div class="roast-title">🔥 WEEKLY ROAST — GW${state.currentGW || '?'}</div>
    ${lines.map(l => `<div class="roast-line">${l}</div>`).join('')}
  `;
}

function buildRoastLines() {
  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    return {
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      teamName: m.entry?.name || '',
      totalPts: hist[0]?.total_points || 0,
      gwPts: hist[hist.length - 1]?.points || 0,
      gwList: hist,
    };
  }).sort((a, b) => b.totalPts - a.totalPts);

  if (!rows.length) return ['Sync to load data.'];

  const leader = rows[0];
  const last = rows[rows.length - 1];
  const bestGW = [...rows].sort((a, b) => b.gwPts - a.gwPts)[0];
  const worstGW = [...rows].sort((a, b) => a.gwPts - b.gwPts)[0];
  const gap = leader.totalPts - rows[1]?.totalPts || 0;

  const lines = [
    `👑 <strong>${leader.emoji} ${leader.name}</strong> sits on top with <strong>${leader.totalPts} pts</strong>.`,
    gap > 0 && gap < 10 ? `🔥 Only <strong>${gap} pts</strong> separate top from 2nd. Tense.` : '',
    gap >= 10 ? `📈 The gap at the top is <strong>${gap} pts</strong>. ${leader.name} is running away.` : '',
    bestGW.gwPts > 0 ? `⚡ <strong>${bestGW.emoji} ${bestGW.name}</strong> top-scored this week with <strong>${bestGW.gwPts} pts</strong>.` : '',
    worstGW.gwPts >= 0 && worstGW.id !== bestGW.id ? `💀 <strong>${worstGW.emoji} ${worstGW.name}</strong> had a rough one — only <strong>${worstGW.gwPts} pts</strong>.` : '',
    `🐌 <strong>${last.emoji} ${last.name}</strong> props up the table with <strong>${last.totalPts} pts</strong>.`,
    `_ ${randomQuote(ROAST_WEEKLY)} _`,
  ].filter(Boolean);

  return lines;
}

function renderMainLeaderboard() {
  const card = document.getElementById('leaderboard-card');
  if (!card) return;
  if (!state.familyData || !state.familyData.length) {
    card.innerHTML = '<div class="empty"><span class="emoji">🏆</span>Sync to load standings</div>';
    return;
  }

  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    const totalPts = hist[0]?.total_points || 0;
    const gwPts = hist[hist.length - 1]?.points || 0;
    const overallRank = hist[0]?.overall_rank || 0;
    return { ...m, totalPts, gwPts, overallRank };
  }).sort((a, b) => b.totalPts - a.totalPts);

  card.innerHTML = rows.map((r, i) => {
    const mood = calcMood(r, rows);
    return `
      <div class="lb-row ${r.id === teamId ? 'me' : ''}">
        <div class="lb-rank">${RANK_EMOJI[i] || (i + 1)}</div>
        <div>
          <div class="lb-name">${r.emoji || ''} ${escapeHtml(r.name)} ${r.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''} ${MOOD_EMOJI[mood] || ''}</div>
          <div class="lb-teamname">${escapeHtml(r.entry?.name || '')}</div>
        </div>
        <div class="lb-stat">${r.totalPts}<small>Total</small></div>
        <div class="lb-stat">${r.gwPts}<small>GW</small></div>
        <div class="lb-stat">${fmtRank(r.overallRank)}<small>Rank</small></div>
      </div>
    `;
  }).join('');
}

function calcMood(row, allRows) {
  const hist = row.history?.current || [];
  if (hist.length < 2) return 'steady';
  const gw = hist[hist.length - 1]?.points || 0;
  const avg = hist.reduce((s, g) => s + g.points, 0) / hist.length;
  const best = Math.max(...hist.map(g => g.points));
  if (gw === best) return 'hot';
  if (gw > avg + 5) return 'climbing';
  if (gw < avg - 5) return 'slipping';
  if (gw < avg - 15) return 'dead';
  return 'steady';
}

/* ========== BEST GW ========== */
function renderBestGW() {
  const card = document.getElementById('best-gw-card');
  if (!card) return;
  if (!state.familyData || !state.familyData.length) {
    card.innerHTML = '<div class="empty"><span class="emoji">🔥</span>Sync to load</div>';
    return;
  }

  const entries = state.familyData.map(m => {
    const hist = m.history?.current || [];
    if (!hist.length) return null;
    const best = hist.reduce((mx, g) => g.points > mx.points ? g : mx, hist[0]);
    return {
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      teamName: m.entry?.name || '',
      points: best.points,
      gw: best.event,
      chip: best.active_chip || best.chip || null,
    };
  }).filter(Boolean).sort((a, b) => b.points - a.points);

  const medals = ['🥇', '🥈', '🥉'];
  const tailEmoji = ['😴', '🐌'];

  card.innerHTML = entries.map((e, i) => {
    const medal = medals[i] || tailEmoji[i - 3] || '·';
    const chipLabel = e.chip ? `${CHIP_EMOJI[e.chip] || ''} ${CHIP_NAME[e.chip] || e.chip}` : '— no chip';
    const quote = e.points >= 60 ? randomQuote(ROAST_BEST) : '';
    return `
      <div class="lb-row ${e.id === teamId ? 'me' : ''}">
        <div class="lb-rank">${medal}</div>
        <div>
          <div class="lb-name">${e.emoji || ''} ${escapeHtml(e.name)} ${e.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div>
          <div class="lb-teamname">${escapeHtml(e.teamName)}</div>
          ${quote ? `<div class="lb-quote">"${quote}"</div>` : ''}
        </div>
        <div class="lb-stat">${e.points} pts<small>Best</small></div>
        <div class="lb-stat">GW${e.gw}<small>When</small></div>
        <div class="lb-stat" style="font-size:0.72rem">${chipLabel}<small>Chip</small></div>
      </div>
    `;
  }).join('');
}

/* ========== WORST GW ========== */
function renderWorstGW() {
  const card = document.getElementById('worst-gw-card');
  if (!card) return;
  if (!state.familyData || !state.familyData.length) {
    card.innerHTML = '<div class="empty"><span class="emoji">❄️</span>Sync to load</div>';
    return;
  }

  const entries = state.familyData.map(m => {
    const hist = m.history?.current || [];
    if (!hist.length) return null;
    const worst = hist.reduce((mn, g) => g.points < mn.points ? g : mn, hist[0]);
    return {
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      teamName: m.entry?.name || '',
      points: worst.points,
      gw: worst.event,
    };
  }).filter(Boolean).sort((a, b) => b.points - a.points);

  const medals = ['🥇', '🥈', '🥉'];

  card.innerHTML = entries.map((e, i) => {
    const medal = medals[i] || (i === entries.length - 1 ? '🗑️' : '·');
    const shame = SHAME_EMOJI(e.points);
    const quote = randomQuote(ROAST_WORST);
    return `
      <div class="lb-row ${e.id === teamId ? 'me' : ''}">
        <div class="lb-rank">${medal}</div>
        <div>
          <div class="lb-name">${e.emoji || ''} ${escapeHtml(e.name)} ${e.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div>
          <div class="lb-teamname">${escapeHtml(e.teamName)}</div>
          <div class="lb-quote">"${quote}"</div>
        </div>
        <div class="lb-stat">${e.points} pts<small>Worst</small></div>
        <div class="lb-stat">GW${e.gw}<small>When</small></div>
        <div class="lb-stat">${shame}<small>Shame</small></div>
      </div>
    `;
  }).join('');
}

/* ========== TROPHY CABINET ========== */
function renderTrophyCabinet() {
  const el = document.getElementById('trophy-cabinet');
  if (!el) return;
  if (!state.familyData || !state.familyData.length) {
    el.innerHTML = '<div class="empty"><span class="emoji">🏅</span>Sync to load</div>';
    return;
  }

  // For each GW, find the highest scorer
  const gwWinners = {};
  state.familyData.forEach(m => {
    const hist = m.history?.current || [];
    hist.forEach(g => {
      if (!gwWinners[g.event] || g.points > gwWinners[g.event].points) {
        gwWinners[g.event] = {
          event: g.event,
          points: g.points,
          id: m.id,
          name: m.name,
          emoji: m.emoji,
          chip: g.active_chip || null,
        };
      }
    });
  });

  const list = Object.values(gwWinners).sort((a, b) => b.event - a.event).slice(0, 20);
  if (!list.length) { el.innerHTML = '<div class="empty">No GWs played yet</div>'; return; }

  el.innerHTML = `<div class="trophy-grid">${list.map(w => `
    <div class="trophy-item">
      <div class="trophy-gw">GW${w.event}</div>
      <div class="trophy-info">
        <div class="trophy-name">👑 ${w.emoji || ''} ${escapeHtml(w.name.split(' ')[0])}</div>
        <div class="trophy-detail">${w.points} pts${w.chip ? ' · ' + (CHIP_EMOJI[w.chip] || '') : ''}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

/* ========== HALL OF SHAME ========== */
function renderHallOfShame() {
  const el = document.getElementById('hall-of-shame');
  if (!el) return;
  if (!state.familyData || !state.familyData.length || !state.bootstrap) {
    el.innerHTML = '<div class="empty"><span class="emoji">💀</span>Sync to load</div>';
    return;
  }

  const bp = state.bootstrap;
  const elementsMap = {};
  bp.elements.forEach(e => elementsMap[e.id] = e);

  // For each GW, find the worst captain pick across family
  const worstCaps = {};

  state.familyData.forEach(m => {
    const hist = m.history?.current || [];
    if (!m.picks || !m.picks.picks) return;

    // Current GW captain (we only have latest picks)
    const capPick = m.picks.picks.find(p => p.is_captain);
    if (!capPick) return;
    const el2 = elementsMap[capPick.element];
    if (!el2) return;
    const capPts = capPick.points || 0;
    const gw = state.currentGW || 0;

    if (!worstCaps[gw] || capPts < worstCaps[gw].points) {
      worstCaps[gw] = {
        gw,
        points: capPts,
        player: el2.web_name,
        id: m.id,
        name: m.name,
        emoji: m.emoji,
      };
    }
  });

  const list = Object.values(worstCaps).sort((a, b) => b.gw - a.gw).slice(0, 10);
  if (!list.length) { el.innerHTML = '<div class="empty">No data yet</div>'; return; }

  el.innerHTML = list.map(w => `
    <div class="shame-item">
      <div class="shame-gw">GW${w.gw}</div>
      <div class="shame-player">© ${escapeHtml(w.player)}</div>
      <div class="shame-pts">${w.points} pts ${SHAME_EMOJI(w.points)}</div>
      <div class="shame-manager">${w.emoji || ''} ${escapeHtml(w.name.split(' ')[0])}</div>
    </div>
  `).join('');
}

/* ========== GLANCE ========== */
function renderGlance() {
  const el = document.getElementById('weekly-glance');
  if (!el) return;
  if (!state.familyData || !state.familyData.length) {
    el.innerHTML = '<div class="empty"><span class="emoji">📅</span>Sync to see stats</div>';
    return;
  }
  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    return {
      name: m.name,
      emoji: m.emoji,
      gwPts: hist[hist.length - 1]?.points || 0,
      totalPts: hist[0]?.total_points || 0,
    };
  }).filter(r => r.totalPts > 0);

  if (!rows.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

  const best = [...rows].sort((a, b) => b.gwPts - a.gwPts)[0];
  const worst = [...rows].sort((a, b) => a.gwPts - b.gwPts)[0];
  const avg = Math.round(rows.reduce((s, r) => s + r.gwPts, 0) / rows.length);
  const leader = [...rows].sort((a, b) => b.totalPts - a.totalPts)[0];

  el.innerHTML = `
    <div class="glance-grid" style="padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
      <div class="glance-card">
        <div class="label">🏆 Leader</div>
        <div class="value">${leader.totalPts}</div>
        <div class="sub">${leader.emoji} ${escapeHtml(leader.name.split(' ')[0])}</div>
      </div>
      <div class="glance-card">
        <div class="label">⚡ Best GW</div>
        <div class="value">${best.gwPts}</div>
        <div class="sub">${best.emoji} ${escapeHtml(best.name.split(' ')[0])}</div>
      </div>
      <div class="glance-card">
        <div class="label">📊 Family Avg</div>
        <div class="value">${avg}</div>
        <div class="sub">this GW</div>
      </div>
      <div class="glance-card">
        <div class="label">😅 Worst GW</div>
        <div class="value">${worst.gwPts}</div>
        <div class="sub">${worst.emoji} ${escapeHtml(worst.name.split(' ')[0])}</div>
      </div>
    </div>
  `;
}

/* ========== HISTORY ========== */
function renderHistory() {
  const mine = state.familyData?.find(f => f.id === teamId);
  const gws = mine?.history?.current || [];
  const chartPoints = document.getElementById('chart-points');
  const chartRank = document.getElementById('chart-rank');
  const chartAverage = document.getElementById('chart-average');
  const chipTracker = document.getElementById('chip-tracker');
  const tbody = document.querySelector('#gw-table tbody');

  if (!gws.length) {
    if (chartPoints) chartPoints.innerHTML = '<div class="empty"><span class="emoji">📈</span>Sync to see your chart</div>';
    if (chartRank) chartRank.innerHTML = '<div class="empty"><span class="emoji">🏅</span>Sync to see your rank</div>';
    if (chartAverage) chartAverage.innerHTML = '<div class="empty"><span class="emoji">⚖️</span>Sync to compare</div>';
    if (chipTracker) chipTracker.innerHTML = '<div class="empty"><span class="emoji">🃏</span>Sync to see chips</div>';
    if (tbody) tbody.innerHTML = '';
    return;
  }

  // Points bar chart
  const maxPts = Math.max(...gws.map(g => g.points), 1);
  chartPoints.innerHTML = `
    <div class="chart-bars">
      ${gws.map(g => `
        <div class="chart-bar me" style="height:${(g.points / maxPts) * 180}px" title="GW${g.event}: ${g.points} pts">
          <div class="bar-value">${g.points}</div>
          <div class="bar-label">${g.event}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Rank chart
  const ranks = gws.map(g => g.overall_rank).filter(r => r > 0);
  if (ranks.length > 1) {
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const w = 900; const h = 200;
    const step = w / (ranks.length - 1);
    const points = ranks.map((r, i) => {
      const x = i * step;
      const y = ((r - minRank) / (maxRank - minRank || 1)) * (h - 40) + 20;
      return `${x},${y}`;
    }).join(' ');
    chartRank.innerHTML = `
      <div class="rank-svg-wrap">
        <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;max-width:100%">
          <defs>
            <linearGradient id="rankLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#00ff87"/>
              <stop offset="100%" stop-color="#04f5ff"/>
            </linearGradient>
          </defs>
          <polyline fill="none" stroke="url(#rankLine)" stroke-width="3" points="${points}" stroke-linejoin="round" stroke-linecap="round"/>
          ${ranks.map((r, i) => {
            const x = i * step;
            const y = ((r - minRank) / (maxRank - minRank || 1)) * (h - 40) + 20;
            return `<circle cx="${x}" cy="${y}" r="4" fill="#00ff87"><title>GW${gws[i].event}: #${r.toLocaleString()}</title></circle>`;
          }).join('')}
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--muted);padding:4px 8px">
          <span>Best: #${minRank.toLocaleString()}</span>
          <span>Worst: #${maxRank.toLocaleString()}</span>
        </div>
      </div>
    `;
  } else {
    chartRank.innerHTML = '<div class="empty">Not enough data yet</div>';
  }

  // You vs Average
  const maxBoth = Math.max(...gws.map(g => Math.max(g.points, g.average_entry_score || 0)), 1);
  chartAverage.innerHTML = `
    <div class="chart-bars">
      ${gws.map(g => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="display:flex;gap:2px;align-items:flex-end">
            <div class="chart-bar me" style="height:${(g.points / maxBoth) * 140}px;width:18px" title="You: ${g.points}"></div>
            <div class="chart-bar avg" style="height:${((g.average_entry_score || 0) / maxBoth) * 140}px;width:18px" title="Avg: ${g.average_entry_score || 0}"></div>
          </div>
          <div class="bar-label">${g.event}</div>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center;font-size:0.7rem;color:var(--muted);padding-top:8px">
      <span>🟢 You</span><span>🟣 Average</span>
    </div>
  `;

  // Chips
  const usedChips = {};
  gws.forEach(g => { if (g.active_chip) usedChips[g.active_chip] = g.event; });
  const allChips = ['wildcard', 'bboost', '3xc', 'freehit'];
  chipTracker.innerHTML = `<div class="chip-tracker">${allChips.map(c => {
    const used = usedChips[c];
    return `
      <div class="chip-card ${used ? 'used' : ''}">
        <div class="chip-icon">${CHIP_EMOJI[c]}</div>
        <div class="chip-name">${CHIP_NAME[c]}</div>
        <div class="chip-status">${used ? 'Used GW' + used : 'Available'}</div>
      </div>
    `;
  }).join('')}</div>`;

  // GW table
  tbody.innerHTML = [...gws].reverse().map(g => `
    <tr>
      <td>GW${g.event}</td>
      <td>${g.points}</td>
      <td>${fmtRank(g.overall_rank)}</td>
      <td>${fmt((g.bank || 0) / 10)}</td>
      <td>${fmt((g.value || 0) / 10)}</td>
      <td>${g.event_transfers || 0}${g.event_transfers_cost ? ' (-' + g.event_transfers_cost + ')' : ''}</td>
    </tr>
  `).join('');
}

/* ========== PLAYERS ========== */
function renderPlayers() {
  const grid = document.getElementById('players-grid');
  if (!grid) return;
  if (!state.bootstrap) {
    grid.innerHTML = '<div class="empty"><span class="emoji">🔍</span>Sync to search players</div>';
    return;
  }

  const q = (document.getElementById('player-search')?.value || '').toLowerCase();
  const posFilter = document.getElementById('player-filter-pos')?.value || '';
  const sortBy = document.getElementById('player-sort')?.value || 'total_points';

  const teamMap = {};
  state.bootstrap.teams.forEach(t => teamMap[t.id] = t.short_name);

  let list = state.bootstrap.elements.map(el => ({
    id: el.id,
    name: el.web_name,
    fullName: `${el.first_name} ${el.second_name}`,
    pos: POS_MAP[el.element_type],
    price: el.now_cost / 10,
    team: teamMap[el.team] || '?',
    teamId: el.team,
    form: parseFloat(el.form) || 0,
    points: el.total_points,
    ownership: parseFloat(el.selected_by_percent) || 0,
    status: el.status,
    news: el.news,
  }));

  if (q) list = list.filter(p => p.fullName.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
  if (posFilter) list = list.filter(p => p.pos === posFilter);

  list.sort((a, b) => {
    if (sortBy === 'now_cost') return b.price - a.price;
    if (sortBy === 'form') return b.form - a.form;
    if (sortBy === 'selected_by_percent') return b.ownership - a.ownership;
    return b.points - a.points;
  });

  list = list.slice(0, 100);

  if (list.length === 0) { grid.innerHTML = '<div class="empty">No players found</div>'; return; }

  grid.innerHTML = list.map(p => {
    const statusWarn = p.status !== 'a' ? '⚠️ ' : '';
    const badge = `https://resources.premierleague.com/premierleague25/badges/${p.teamId}.svg`;
    return `<div class="player-result">
      <div class="name">
        <span>${statusWarn}${escapeHtml(p.name)}</span>
        <span class="pos-badge" data-pos="${p.pos}">${p.pos}</span>
      </div>
      <div class="meta">
        <span class="price-tag">${fmt(p.price)}</span>
        <span style="display:flex;align-items:center;gap:4px">
          <img src="${badge}" style="width:12px;height:12px" onerror="this.style.display='none'">
          ${escapeHtml(p.team)}
        </span>
      </div>
      <div class="stat-line"><span>Points</span><strong>${p.points}</strong></div>
      <div class="stat-line"><span>Form</span><strong>${p.form.toFixed(1)}</strong></div>
      <div class="stat-line"><span>Owned</span><strong>${p.ownership.toFixed(1)}%</strong></div>
    </div>`;
  }).join('');
}

/* ========== OPTIMIZER ========== */
function optimizeLineup() {
  if (!state.bootstrap || state.players.length !== 15) return toast('Sync first to optimize', true);
  const bp = state.bootstrap;
  const elementsMap = {};
  bp.elements.forEach(e => elementsMap[e.id] = e);

  const scored = state.players.map(p => {
    const el = elementsMap[p.fplId];
    const form = el ? parseFloat(el.form) || 0 : 0;
    const pts = el ? el.total_points : 0;
    const score = form * 2 + pts / 10;
    return { ...p, score };
  });

  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  scored.forEach(p => byPos[p.pos].push(p));
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => b.score - a.score));

  // Best XI: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD — use 3-4-3 as default
  const xi = [byPos.GK[0]];
  byPos.DEF.slice(0, 3).forEach(p => xi.push(p));
  byPos.MID.slice(0, 4).forEach(p => xi.push(p));
  byPos.FWD.slice(0, 3).forEach(p => xi.push(p));

  const usedIds = new Set(xi.map(p => p.id));
  const bench = scored.filter(p => !usedIds.has(p.id)).sort((a, b) => b.score - a.score);
  const sortedXI = [...xi].sort((a, b) => b.score - a.score);
  const captain = sortedXI[0];
  const vice = sortedXI[1];

  state.players.forEach(p => {
    p.bench = !usedIds.has(p.id);
    p.captain = p.id === captain.id;
    p.vice = p.id === vice.id;
  });

  let pos = 1;
  ['GK', 'DEF', 'MID', 'FWD'].forEach(pp => {
    xi.filter(x => x.pos === pp).sort((a, b) => b.score - a.score).forEach(x => {
      const pl = state.players.find(pp2 => pp2.id === x.id);
      if (pl) pl.order = pos++;
    });
  });
  let benchPos = 12;
  bench.forEach(x => {
    const pl = state.players.find(pp2 => pp2.id === x.id);
    if (pl) pl.order = benchPos++;
  });

  saveState();
  renderSquad();
  toast(`🤖 Optimized — Captain: ${captain.name}`);
}

/* ========== PLAYER MODAL ========== */
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
    state.players.push({ id: uid(), name, pos, price, team, captain: false, multiplier: 0, bench: true, order: 99, gwPoints: 0, totalPoints: 0, form: 0 });
    toast('Player added ✅');
  }
  saveState(); renderAll(); closeModal('player-modal');
}

function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  saveState(); renderAll(); toast('Removed');
}

function openBudgetModal() {
  document.getElementById('b-budget').value = state.budget;
  document.getElementById('b-bank').value = state.bank;
  document.getElementById('budget-modal').classList.add('active');
}
function saveBudget() {
  state.budget = parseFloat(document.getElementById('b-budget').value) || 0;
  state.bank = parseFloat(document.getElementById('b-bank').value) || 0;
  saveState(); renderAll(); closeModal('budget-modal'); toast('Budget saved 💰');
}
function openFTModal() {
  document.getElementById('ft-value').value = state.freeTransfers;
  document.getElementById('ft-modal').classList.add('active');
}
function saveFT() {
  state.freeTransfers = parseInt(document.getElementById('ft-value').value) || 0;
  saveState(); renderAll(); closeModal('ft-modal'); toast('FT saved 🔄');
}

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
  saveState(); renderAll(); closeModal('plan-modal');
}
function removePlan(id) {
  state.plans = state.plans.filter(p => p.id !== id);
  saveState(); renderAll(); toast('Removed');
}

/* ========== MODAL HELPERS ========== */
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
});

/* ========== EXPORT / RESET ========== */
function exportData() {
  const data = JSON.stringify({
    teamId,
    players: state.players, plans: state.plans,
    budget: state.budget, bank: state.bank,
    freeTransfers: state.freeTransfers, managerName: state.managerName,
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
  const keep = { managerName: state.managerName, lastSync: state.lastSync };
  state = { ...emptyState(), ...keep };
  saveState();
  renderAll();
  toast('Reset complete 🗑');
}

/* ========== BOOT ========== */
window.addEventListener('DOMContentLoaded', () => {
  renderManagerPicker();
  const last = localStorage.getItem('fpl-cc-last-team');
  if (last) {
    document.getElementById('welcome-team-id').value = last;
    pickManager(last, document.querySelector(`.manager-pill[data-id="${last}"]`));
  }
  startCountdown();
});

window.syncAll = syncAll;
window.toggleTheme = toggleTheme;
window.switchView = switchView;
window.pickManager = pickManager;
window.startApp = startApp;
window.logout = logout;
window.showHelp = showHelp;
window.openPlayerModal = openPlayerModal;
window.savePlayer = savePlayer;
window.removePlayer = removePlayer;
window.openBudgetModal = openBudgetModal;
window.saveBudget = saveBudget;
window.openFTModal = openFTModal;
window.saveFT = saveFT;
window.openPlanModal = openPlanModal;
window.savePlan = savePlan;
window.removePlan = removePlan;
window.closeModal = closeModal;
window.exportData = exportData;
window.resetAll = resetAll;
window.optimizeLineup = optimizeLineup;
window.renderPlayers = renderPlayers;
window.renderHistory = renderHistory;
