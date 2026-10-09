/* =========================================================
   FPL Command Center v8 — app.js
   Planning Mode Edition
   ========================================================= */

const PROXY = 'https://fplworker.adyb-saliki.workers.dev/?url=';
const FPL_API = 'https://fantasy.premierleague.com/api';
const IMG_BASE = 'https://resources.premierleague.com/premierleague/photos/players/110x140';
const BADGE_BASE = 'https://resources.premierleague.com/premierleague25/badges';

const FAMILY = [
  { id: '1115676', name: 'Adyb Saliki',   emoji: '🧠' },
  { id: '3719511', name: 'Yassine Saied', emoji: '🚀' },
  { id: '3844150', name: 'Ismail Saliki', emoji: '🎲' },
  { id: '1115993', name: 'Youssef Said',  emoji: '🐢' },
  { id: '6849321', name: 'Zakaria Said',  emoji: '😎' },
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
const CHIP_EMOJI_SHORT = { WC: '🃏', BB: '🎲', TC: '⚡', FH: '🏠' };
const CHIP_NAME_SHORT = { WC: 'Wildcard', BB: 'Bench Boost', TC: 'Triple Captain', FH: 'Free Hit' };
const MOOD_EMOJI = { hot: '🔥', climbing: '📈', steady: '➡️', slipping: '📉', dead: '💀' };

const ROAST_BEST = ["Peaked early. Enjoy it while it lasts.", "Wildcard magic or pure luck? We'll never know.", "The differentials finally paid off.", "Captained the right guy for once.", "Even a broken clock is right twice a day.", "Bench boost finally justified its existence.", "Putting the family on notice.", "This is what happens when the picks work.", "Somebody call Guinness — this was elite.", "The template delivered. Fair play."];
const ROAST_WORST = ["Could have been worse. It wasn't much better.", "Even the bench outscored him this week.", "Sweating through a premium pick that blanked.", "Started the season in clown mode. Legendary.", "Died on the pitch. RIP his GW.", "Straight to the bin. Nothing saved.", "At least the app didn't crash. Silver linings.", "Someone check on him.", "The wooden spoon is calling.", "Trusted his gut. His gut was wrong. Again."];
const ROAST_WEEKLY = ["Family group chat is going to be spicy this week.", "Somebody's getting roasted in the WhatsApp group.", "Rivalries intensifying. Popcorn ready.", "Nobody wants to be last. Yet here we are.", "Peak drama. Peak FPL. Peak family.", "Remember: it's just a game. (It's not.)", "Screenshots incoming. Defend yourselves."];

/* ========== STATE ========== */
let state = null;
let teamId = null;
let pickedId = null;
let liveDataCache = {};
let captainHistoryCache = null;
let fixturesCache = {};
let gwResultCache = {};
let openAccordions = {};
let syncTimer = null;
let isSyncing = false;
let squadView = localStorage.getItem('fpl-cc-squad-view') || 'pitch';

// Planning mode state
let planningMode = false;
let planningGW = null;
let plannedTeam = null; // { starters: [playerIds], bench: [playerIds], captain: id, vice: id }
let actionPlayerId = null;
let swapTargetId = null;
let swapIsBench = false;

function storageKey(id) { return `fpl-cc-v6:${id}`; }
function emptyState() {
  return {
    players: [], plans: [], budget: 100, bank: 0, freeTransfers: 1,
    managerName: '', bootstrap: null, familyData: null,
    currentGW: null, nextGW: null, nextDeadline: null, lastSync: 0,
    priceRisers: [], priceFallers: [],
    plannedTeams: {}, // { gw: { starters, bench, captain, vice } }
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
    currentGW: state.currentGW, nextGW: state.nextGW, nextDeadline: state.nextDeadline,
    lastSync: state.lastSync,
    priceRisers: state.priceRisers, priceFallers: state.priceFallers,
    plannedTeams: state.plannedTeams || {},
  };
  try { localStorage.setItem(storageKey(teamId), JSON.stringify(toSave)); }
  catch (e) { toast('Storage full — export a backup', true); }
}

/* ========== UTILS ========== */
function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(n) { return '£' + Number(n || 0).toFixed(1) + 'm'; }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.classList.remove('show'), 3000);
}
function randomQuote(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtRank(r) { if (!r || r <= 0) return '—'; return '#' + r.toLocaleString(); }
function formatTransfers(n) {
  const abs = Math.abs(n || 0);
  const sign = n < 0 ? '-' : '+';
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return sign + Math.round(abs / 1000) + 'k';
  return sign + abs;
}
function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min ago';
  const h = Math.floor(min / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

/* ========== THEME ========== */
function applyTheme(mode) {
  const isLight = mode === 'light';
  document.documentElement.classList.toggle('light-mode', isLight);
  document.body.classList.toggle('light-mode', isLight);
  const emoji = isLight ? '☀️' : '🌙';
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

/* ========== SQUAD VIEW TOGGLE ========== */
function toggleSquadView() {
  squadView = squadView === 'pitch' ? 'list' : 'pitch';
  localStorage.setItem('fpl-cc-squad-view', squadView);
  renderSquad();
  renderTeamView();
  updateViewToggleButtons();
  toast(squadView === 'pitch' ? '⚽ Pitch view' : '📋 List view');
}
function updateViewToggleButtons() {
  const label = squadView === 'pitch' ? '📋 List' : '⚽ Pitch';
  ['view-toggle-dashboard', 'view-toggle-team'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

/* ========== SYNC DOT ========== */
function updateSyncDot() {
  const dot = document.getElementById('sync-dot');
  const wrap = document.getElementById('sync-dot-wrap');
  if (!dot || !wrap) return;
  if (isSyncing) {
    dot.className = 'sync-dot syncing';
    wrap.title = 'Syncing now...';
    return;
  }
  const last = state?.lastSync || 0;
  const age = Date.now() - last;
  if (!last) { dot.className = 'sync-dot old'; wrap.title = 'Never synced'; return; }
  if (age < 30 * 60 * 1000) { dot.className = 'sync-dot fresh'; wrap.title = 'Fresh · synced ' + timeAgo(last); }
  else if (age < 6 * 60 * 60 * 1000) { dot.className = 'sync-dot stale'; wrap.title = 'Stale · synced ' + timeAgo(last); }
  else { dot.className = 'sync-dot old'; wrap.title = 'Old · synced ' + timeAgo(last); }
}

/* ========== PROXY ========== */
async function fpl(path) {
  const url = PROXY + encodeURIComponent(FPL_API + path);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function playerImgUrl(el) {
  if (!el || !el.photo) return '';
  const ext = el.photo.replace(/^\D+/, '').replace('.jpg', '');
  return `${IMG_BASE}/${ext}.png`;
}
function getTeamInfo(teamIdNum) {
  if (!state.bootstrap) return { name: '?', short: '?', badge: '' };
  const t = state.bootstrap.teams.find(x => x.id === teamIdNum);
  if (!t) return { name: '?', short: '?', badge: '' };
  return { name: t.name, short: t.short_name, badge: `${BADGE_BASE}/${t.id}.svg` };
}

/* ========== LIVE DATA ========== */
async function fetchLiveGW(gw) {
  if (liveDataCache[gw]) return liveDataCache[gw];
  try {
    const data = await fpl(`/event/${gw}/live/`);
    const map = {};
    (data.elements || []).forEach(el => { map[el.id] = el; });
    liveDataCache[gw] = map;
    return map;
  } catch (e) { liveDataCache[gw] = {}; return {}; }
}

/* ========== FIXTURES ========== */
async function fetchFixturesForGW(gw) {
  if (fixturesCache[gw]) return fixturesCache[gw];
  try {
    const data = await fpl(`/fixtures/?event=${gw}`);
    fixturesCache[gw] = data || [];
    return fixturesCache[gw];
  } catch (e) { fixturesCache[gw] = []; return []; }
}
async function fetchTeamFixtures(teamId, count = 3) {
  try {
    const data = await fpl(`/fixtures/?team=${teamId}`);
    return (data || []).filter(f => !f.finished).slice(0, count);
  } catch (e) { return []; }
}
function formatFixtureDay(iso) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}
function myPlayersInFixtures(fixtures) {
  if (!state.players || !state.players.length) return [];
  const involved = [];
  state.players.forEach(p => {
    const fix = fixtures.find(f => f.team_h === p.teamId || f.team_a === p.teamId);
    if (!fix) return;
    const isHome = fix.team_h === p.teamId;
    const opp = isHome ? fix.team_a : fix.team_h;
    const diff = isHome ? fix.team_h_difficulty : fix.team_a_difficulty;
    involved.push({ player: p.name, pos: p.pos, team: p.team, teamId: p.teamId, opp: getTeamInfo(opp), home: isHome, difficulty: diff || 3 });
  });
  return involved;
}
function sortFixtures(list) { return [...list].sort((a, b) => new Date(a.kickoff_time || 0) - new Date(b.kickoff_time || 0)); }
function groupFixturesByDay(fixtures) {
  const groups = {};
  fixtures.forEach(f => {
    const day = formatFixtureDay(f.kickoff_time);
    if (!groups[day]) groups[day] = [];
    groups[day].push(f);
  });
  return groups;
}

/* ========== GW STATUS ========== */
function getGWStatus(gw) {
  const current = state.currentGW || 1;
  if (gw < current) return 'past';
  if (gw === current) return 'current';
  return 'upcoming';
}

/* ========== GW RESULT ========== */
async function fetchGWResult(gw) {
  if (gwResultCache[gw]) return gwResultCache[gw];
  const mine = state.familyData?.find(f => f.id === teamId);
  const hist = mine?.history?.current?.find(g => g.event === gw);
  if (!hist) return null;
  let captain = '?';
  let chip = hist.active_chip || null;
  try {
    const picks = await fpl(`/entry/${teamId}/event/${gw}/picks/`).catch(() => null);
    if (picks && picks.picks) {
      const cap = picks.picks.find(p => p.is_captain);
      if (cap) {
        const el2 = state.bootstrap?.elements?.find(x => x.id === cap.element);
        if (el2) captain = el2.web_name;
      }
    }
  } catch (e) {}
  const result = {
    points: hist.points || 0, rank: hist.overall_rank || 0,
    transfers: hist.event_transfers || 0, transferCost: hist.event_transfers_cost || 0,
    bank: (hist.bank || 0) / 10, value: (hist.value || 0) / 10, chip, captain,
  };
  gwResultCache[gw] = result;
  return result;
}

/* ========== SYNC ========== */
async function syncAll(showToast = true) {
  if (isSyncing) return;
  isSyncing = true;
  const btn = document.getElementById('sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing...'; }
  updateSyncDot();
  if (showToast) toast('🔄 Syncing from FPL...');
  try {
    const boot = await fpl('/bootstrap-static/');
    state.bootstrap = { elements: boot.elements, teams: boot.teams, events: boot.events };
    const finished = boot.events.filter(e => e.finished);
    let currentGW;
    if (finished.length > 0) currentGW = Math.max(...finished.map(e => e.id));
    else currentGW = boot.events.find(e => e.is_next)?.id || 1;
    state.currentGW = currentGW;
    const nextEv = boot.events.find(e => e.is_next) || boot.events.find(e => !e.finished);
    state.nextGW = nextEv?.id || null;
    state.nextDeadline = nextEv?.deadline_time || null;

    const familyData = [];
    for (const m of FAMILY) {
      try {
        const [picks, history, entry] = await Promise.all([
          fpl(`/entry/${m.id}/event/${currentGW}/picks/`).catch(() => null),
          fpl(`/entry/${m.id}/history/`).catch(() => null),
          fpl(`/entry/${m.id}/`).catch(() => null),
        ]);
        familyData.push({ ...m, picks, history, entry });
      } catch (e) { familyData.push({ ...m, picks: null, history: null, entry: null }); }
    }
    state.familyData = familyData;
    const mine = familyData.find(f => f.id === teamId);
    if (mine && mine.picks) mergeMySquad(mine.picks);

    fetchPriceChanges(boot.elements);
    liveDataCache = {};
    captainHistoryCache = null;
    fixturesCache = {};
    gwResultCache = {};

    const prefetchGws = [];
    for (let i = 0; i < 5; i++) {
      const gw = currentGW + i;
      if (gw <= 38) prefetchGws.push(gw);
    }
    await Promise.all([
      ...prefetchGws.map(gw => fetchLiveGW(gw)),
      ...prefetchGws.map(gw => fetchFixturesForGW(gw)),
    ]);

    archiveOldPlans();
    state.lastSync = Date.now();
    saveState();
    renderAll();
    setTimeout(() => renderSeasonPlanner(), 100);
    if (showToast) toast(`✅ Synced — GW${currentGW} loaded`);
  } catch (e) {
    console.error(e);
    if (showToast) toast('Sync failed: ' + e.message, true);
  } finally {
    isSyncing = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync All from FPL'; }
    updateSyncDot();
  }
}

function archiveOldPlans() {
  const current = state.currentGW || 1;
  state.plans = state.plans.filter(p => {
    if (p.gw >= current) return true;
    return p.outName || p.inName || p.captain || p.chip || p.note;
  });
}

function fetchPriceChanges(elements) {
  if (!elements) return;
  const withData = elements.filter(e => e.minutes > 0);
  state.priceRisers = withData.filter(e => e.cost_change_event > 0 || (e.transfers_in_event - e.transfers_out_event) > 50000)
    .sort((a, b) => (b.cost_change_event * 1e6 + (b.transfers_in_event - b.transfers_out_event)) - (a.cost_change_event * 1e6 + (a.transfers_in_event - a.transfers_out_event)))
    .slice(0, 5).map(e => ({ name: e.web_name, price: e.now_cost / 10, change: e.cost_change_event / 10, netTransfers: (e.transfers_in_event || 0) - (e.transfers_out_event || 0) }));
  state.priceFallers = withData.filter(e => e.cost_change_event < 0 || (e.transfers_out_event - e.transfers_in_event) > 50000)
    .sort((a, b) => (a.cost_change_event * 1e6 + (a.transfers_out_event - a.transfers_in_event)) - (b.cost_change_event * 1e6 + (b.transfers_out_event - b.transfers_in_event)))
    .slice(0, 5).map(e => ({ name: e.web_name, price: e.now_cost / 10, change: e.cost_change_event / 10, netTransfers: (e.transfers_in_event || 0) - (e.transfers_out_event || 0) }));
}

function mergeMySquad(picksData) {
  const bp = state.bootstrap;
  const teamMap = {};
  bp.teams.forEach(t => teamMap[t.id] = t.short_name);
  state.players = picksData.picks.map(p => {
    const el = bp.elements.find(x => x.id === p.element);
    if (!el) return null;
    return {
      id: uid(), fplId: el.id,
      name: el.web_name, fullName: `${el.first_name} ${el.second_name}`,
      pos: POS_MAP[el.element_type], price: el.now_cost / 10,
      team: teamMap[el.team] || '?', teamId: el.team,
      captain: p.is_captain, vice: p.is_vice_captain, multiplier: p.multiplier,
      bench: p.position > 11, order: p.position, gwPoints: p.points || 0,
      photo: playerImgUrl(el), status: el.status, news: el.news,
      form: parseFloat(el.form) || 0, totalPoints: el.total_points,
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
    </button>`).join('');
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
  const fam = FAMILY.find(f => f.id === id);
  if (fam && !state.managerName) state.managerName = fam.name;
  localStorage.setItem('fpl-cc-last-team', id);
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderAll();
  updateSyncDot();
  updateViewToggleButtons();
  window.scrollTo(0, 0);
  startAutoSync();
  const stale = !state.lastSync || (Date.now() - state.lastSync > 30 * 60 * 1000);
  if (stale) setTimeout(() => syncAll(false), 400);
}
function logout() {
  if (!confirm('Switch manager? Your data stays saved.')) return;
  saveState();
  teamId = null; state = null; pickedId = null;
  planningMode = false; plannedTeam = null; planningGW = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('welcome-team-id').value = '';
  document.querySelectorAll('.manager-pill').forEach(p => p.classList.remove('selected'));
}
function showHelp() { document.getElementById('help-modal').classList.add('active'); }
function showShortcuts() { document.getElementById('shortcuts-modal').classList.add('active'); }

/* ========== AUTO-SYNC ========== */
function startAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (isSyncing) return;
    const age = Date.now() - (state?.lastSync || 0);
    if (age > 30 * 60 * 1000) syncAll(false);
  }, 5 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state && teamId) {
    const age = Date.now() - (state.lastSync || 0);
    if (age > 30 * 60 * 1000 && !isSyncing) syncAll(false);
    updateSyncDot();
  }
});

/* ========== NAV ========== */
function switchView(name, el) {
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const v = document.getElementById('view-' + name);
  if (v) v.style.display = 'block';
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'history') renderHistory();
  if (name === 'players') renderPlayers();
  if (name === 'team') renderTeamView();
  if (name === 'planner') {
    if (!state?.currentGW && state?.lastSync === 0) {
      const el2 = document.getElementById('season-planner');
      if (el2) el2.innerHTML = '<div class="empty"><span class="emoji">⏳</span>Syncing... please wait</div>';
      setTimeout(() => switchView('planner', document.querySelector('[data-view="planner"]')), 800);
      return;
    }
    renderSeasonPlanner();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ========== COUNTDOWN ========== */
function startCountdown() {
  const el = document.getElementById('hdr-deadline');
  const wrap = document.getElementById('hdr-deadline-wrap');
  if (!el) return;
  function tick() {
    let deadline = state?.nextDeadline;
    if (!deadline && state?.bootstrap?.events) {
      const next = state.bootstrap.events.find(e => e.is_next) || state.bootstrap.events.find(e => !e.finished);
      deadline = next?.deadline_time;
    }
    if (!deadline) { el.textContent = '—'; return; }
    const diff = new Date(deadline) - new Date();
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
  renderGWGlanceBanner();
  renderSquad();
  renderStats();
  renderCaptainSuggestion();
  renderPriceChanges();
  renderMiniLeaderboard();
  renderLeaderboard();
  renderTimeline();
  renderMiniPlans();
  renderSeasonPlanner();
  renderTeamView();
  renderHistory();
  renderPlayers();
  updateSyncDot();
  updateViewToggleButtons();
  updateTabBadges();
}

function updateTabBadges() {
  const teamTab = document.querySelector('[data-view="team"]');
  if (!teamTab) return;
  const planned = state.plannedTeams?.[state.nextGW] || state.plannedTeams?.[state.currentGW];
  teamTab.classList.toggle('has-plan', !!planned);
}

function renderHeader() {
  const squadValue = state.players.reduce((s, p) => s + Number(p.price || 0), 0);
  const mine = state.familyData?.find(f => f.id === teamId);
  const histCurrent = mine?.history?.current || [];
  const latest = histCurrent[histCurrent.length - 1];
  document.getElementById('hdr-manager').textContent = state.managerName || '—';
  document.getElementById('hdr-points').textContent = latest?.total_points || '—';
  document.getElementById('hdr-rank').textContent = fmtRank(latest?.overall_rank || 0);
  document.getElementById('hdr-bank').textContent = fmt(state.bank);
  document.getElementById('hdr-value').textContent = fmt(squadValue);
  document.getElementById('hdr-ft').textContent = state.freeTransfers;
}

function renderGWGlanceBanner() {
  const el = document.getElementById('gw-glance-banner');
  if (!el) return;
  const mine = state.familyData?.find(f => f.id === teamId);
  const current = mine?.history?.current || [];
  if (!current.length) { el.innerHTML = ''; return; }
  const latest = current[current.length - 1];
  const withLive = state.players.map(p => {
    const live = liveDataCache[state.currentGW]?.[p.fplId];
    const pts = live?.stats?.total_points ?? p.gwPoints ?? 0;
    return { name: p.name, pts };
  });
  withLive.sort((a, b) => b.pts - a.pts);
  const best = withLive[0];
  const worst = withLive[withLive.length - 1];
  const capPts = state.players.find(p => p.captain);
  el.innerHTML = `
    <div class="gw-glance-banner">
      <div class="glance-stat"><div class="label">This GW</div><div class="value good">${latest.points} pts</div><div class="sub">Rank ${fmtRank(latest.overall_rank)}</div></div>
      <div class="glance-stat"><div class="label">🔥 Best Player</div><div class="value good">${best ? best.pts : 0}</div><div class="sub">${best ? escapeHtml(best.name) : '—'}</div></div>
      <div class="glance-stat"><div class="label">💀 Worst Player</div><div class="value bad">${worst ? worst.pts : 0}</div><div class="sub">${worst ? escapeHtml(worst.name) : '—'}</div></div>
      <div class="glance-stat"><div class="label">©️ Captain</div><div class="value">${capPts ? capPts.gwPoints || 0 : '—'}</div><div class="sub">${capPts ? escapeHtml(capPts.name) : 'Not set'}</div></div>
    </div>`;
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
  const latest = current[current.length - 1];
  document.getElementById('stat-gwpts').textContent = latest?.points || '—';
  document.getElementById('stat-gwpts-sub').textContent = state.currentGW ? `GW${state.currentGW}` : 'This week';
  if (current.length > 0) {
    const best = current.reduce((m, g) => g.points > m.points ? g : m, current[0]);
    const worst = current.reduce((m, g) => g.points < m.points ? g : m, current[0]);
    document.getElementById('stat-best').textContent = best.points;
    document.getElementById('stat-best-sub').textContent = `GW${best.event}`;
    document.getElementById('stat-worst').textContent = worst.points;
    document.getElementById('stat-worst-sub').textContent = `GW${worst.event}`;
  }
}

function renderCaptainSuggestion() {
  const el = document.getElementById('captain-suggestion');
  if (!el) return;
  if (!state.bootstrap || !state.players.length) {
    el.innerHTML = '<div class="empty"><span class="emoji">©️</span>Sync to see captain suggestions</div>';
    return;
  }
  const bp = state.bootstrap;
  const elementsMap = {};
  bp.elements.forEach(e => elementsMap[e.id] = e);
  const candidates = state.players.map(p => {
    const el2 = elementsMap[p.fplId];
    if (!el2) return null;
    const form = parseFloat(el2.form) || 0;
    const pts = el2.total_points || 0;
    const ict = parseFloat(el2.ict_index) || 0;
    const minutes = el2.minutes || 0;
    const score = form * 3 + pts * 0.1 + ict * 0.05 + (minutes > 500 ? 5 : 0);
    return { name: p.name, team: p.team, pos: p.pos, price: p.price, form, pts, score, ownership: parseFloat(el2.selected_by_percent) || 0 };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!candidates.length) return;
  const medals = ['🥇', '🥈', '🥉'];
  el.innerHTML = candidates.map((c, i) => `
    <div class="lb-row">
      <div class="lb-rank">${medals[i]}</div>
      <div><div class="lb-name">${escapeHtml(c.name)} <span class="pos-badge" data-pos="${c.pos}">${c.pos}</span></div><div class="lb-teamname">${escapeHtml(c.team)} · ${fmt(c.price)} · ${c.ownership.toFixed(1)}% owned</div></div>
      <div class="lb-stat">${c.form.toFixed(1)}<small>Form</small></div>
      <div class="lb-stat">${c.pts}<small>Pts</small></div>
      <div class="lb-stat">${Math.round(c.score)}<small>Score</small></div>
    </div>`).join('');
}

function renderPriceChanges() {
  const el = document.getElementById('price-changes');
  if (!el) return;
  const risers = state.priceRisers || [];
  const fallers = state.priceFallers || [];
  if (!risers.length && !fallers.length) {
    el.innerHTML = '<div class="empty"><span class="emoji">💹</span>Sync to see price changes</div>';
    return;
  }
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px">
      <div>
        <div style="font-weight:800;font-size:0.75rem;color:var(--mint);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">📈 Rising</div>
        ${risers.map(r => `<div class="lb-row" style="grid-template-columns:1fr 70px 80px;padding:8px 10px">
          <div><div class="lb-name" style="font-size:0.85rem">${escapeHtml(r.name)}</div><div class="lb-teamname">${fmt(r.price)}</div></div>
          <div class="lb-stat" style="color:var(--mint);font-size:0.8rem">${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}</div>
          <div class="lb-stat" style="font-size:0.72rem">${formatTransfers(r.netTransfers)}<small>Net</small></div>
        </div>`).join('') || '<div style="padding:8px;color:var(--muted);font-size:0.75rem">No risers today</div>'}
      </div>
      <div>
        <div style="font-weight:800;font-size:0.75rem;color:var(--red);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">📉 Falling</div>
        ${fallers.map(r => `<div class="lb-row" style="grid-template-columns:1fr 70px 80px;padding:8px 10px">
          <div><div class="lb-name" style="font-size:0.85rem">${escapeHtml(r.name)}</div><div class="lb-teamname">${fmt(r.price)}</div></div>
          <div class="lb-stat" style="color:var(--red);font-size:0.8rem">${r.change.toFixed(1)}</div>
          <div class="lb-stat" style="font-size:0.72rem">${formatTransfers(r.netTransfers)}<small>Net</small></div>
        </div>`).join('') || '<div style="padding:8px;color:var(--muted);font-size:0.75rem">No fallers today</div>'}
      </div>
    </div>`;
}

function renderPlayerMarks(p) {
  const live = liveDataCache[state.currentGW]?.[p.fplId];
  if (!live || !live.stats) return '';
  const s = live.stats;
  const marks = [];
  if (s.goals_scored) marks.push(`<span class="player-mark">⚽ ${s.goals_scored}</span>`);
  if (s.assists) marks.push(`<span class="player-mark">👟 ${s.assists}</span>`);
  if (s.bonus) marks.push(`<span class="player-mark neutral">🅱️ ${s.bonus}</span>`);
  if (s.clean_sheets && (p.pos === 'GK' || p.pos === 'DEF')) marks.push(`<span class="player-mark">🛡️</span>`);
  if (s.yellow_cards) marks.push(`<span class="player-mark neg">🟨</span>`);
  if (s.red_cards) marks.push(`<span class="player-mark neg">🟥</span>`);
  if (s.saves >= 3) marks.push(`<span class="player-mark neutral">🧤 ${s.saves}</span>`);
  if (s.defensive_contribution && s.defensive_contribution >= 10) marks.push(`<span class="player-mark">🛡️ DC</span>`);
  if (!marks.length) return '';
  return `<div class="player-marks">${marks.join('')}</div>`;
}

/* ========== SQUAD RENDERER ========== */
function renderSquad() {
  const grid = document.getElementById('squad-grid');
  const dashPitch = document.getElementById('pitch-view-dashboard');
  if (!grid || !dashPitch) return;
  if (squadView === 'list') {
    grid.style.display = 'grid';
    dashPitch.style.display = 'none';
    renderSquadList(grid);
  } else {
    grid.style.display = 'none';
    dashPitch.style.display = 'block';
    renderPitchView(dashPitch, false);
  }
}

function renderSquadList(grid) {
  if (state.players.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="emoji">👥</span>Click <strong>🔄 Sync All</strong> to load your squad</div>';
    return;
  }
  const sorted = getSortedPlayers();
  const bp = state.bootstrap;
  const elementsMap = {};
  if (bp) bp.elements.forEach(e => elementsMap[e.id] = e);
  const bestCap = [...state.players].filter(p => !p.bench)
    .map(p => {
      const el2 = elementsMap[p.fplId];
      const form = el2 ? parseFloat(el2.form) || 0 : 0;
      return { ...p, score: form };
    }).sort((a, b) => b.score - a.score)[0];

  grid.innerHTML = sorted.map(p => {
    const isRecommendedCap = bestCap && p.id === bestCap.id;
    const teamBadge = p.teamId ? `${BADGE_BASE}/${p.teamId}.svg` : '';
    const injury = p.status && p.status !== 'a';
    const live = liveDataCache[state.currentGW]?.[p.fplId];
    const livePts = live?.stats?.total_points ?? p.gwPoints ?? 0;
    return `
      <div class="player-card ${p.bench ? 'bench' : ''} ${p.captain ? 'captain-card' : ''}" data-pos="${p.pos}" onclick="openPerfModal('${p.id}')">
        ${p.captain ? '<div class="captain-badge">C</div>' : ''}
        ${p.vice ? '<div class="vc-badge">V</div>' : ''}
        ${injury ? '<div class="injury-warn" title="' + escapeHtml(p.news || 'Injury doubt') + '">⚠️</div>' : ''}
        ${p.photo ? `<img class="player-headshot" src="${p.photo}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="name"><span>${escapeHtml(p.name)}</span><span class="pos-badge" data-pos="${p.pos}">${p.pos}</span></div>
        <div class="meta"><span class="price-tag">${fmt(p.price)}</span><span style="display:flex;align-items:center;gap:4px">${teamBadge ? `<img src="${teamBadge}" style="width:14px;height:14px" onerror="this.style.display='none'">` : ''}${escapeHtml(p.team)}</span></div>
        <div class="player-stats">
          <div class="player-stat"><div class="stat-val">${livePts}</div><div class="stat-lbl">GW</div></div>
          <div class="player-stat"><div class="stat-val">${p.totalPoints || 0}</div><div class="stat-lbl">Total</div></div>
          <div class="player-stat"><div class="stat-val">${(p.form || 0).toFixed(1)}</div><div class="stat-lbl">Form</div></div>
        </div>
        ${renderPlayerMarks(p)}
        ${isRecommendedCap && !p.captain ? '<div style="font-size:0.6rem;color:var(--gold);margin-top:6px;font-weight:800">⭐ Cap pick</div>' : ''}
        ${p.bench ? '<div class="bench-label">Bench</div>' : ''}
        <button class="remove-btn" onclick="event.stopPropagation(); removePlayer('${p.id}')">✕</button>
      </div>`;
  }).join('');
}

function getSortedPlayers() {
  const hasOrder = state.players.some(p => typeof p.order === 'number' && p.order < 99);
  if (hasOrder) return [...state.players].sort((a,b) => (a.order ?? 99) - (b.order ?? 99));
  return [...state.players].sort((a,b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.price - a.price);
}

/* ========== PITCH VIEW (FACES) ========== */
function renderPitchView(container, planning) {
  if (state.players.length === 0) {
    container.innerHTML = '<div class="empty"><span class="emoji">⚽</span>Sync to load your pitch</div>';
    return;
  }

  let starters, bench;

  if (planning && plannedTeam) {
    // Use planned team
    const startersIds = plannedTeam.starters;
    const benchIds = plannedTeam.bench;
    starters = startersIds.map(id => state.players.find(p => p.id === id)).filter(Boolean);
    bench = benchIds.map(id => state.players.find(p => p.id === id)).filter(Boolean);
  } else {
    // Use current team
    starters = state.players.filter(p => !p.bench);
    bench = state.players.filter(p => p.bench);
  }

  const gk = starters.filter(p => p.pos === 'GK');
  const def = starters.filter(p => p.pos === 'DEF');
  const mid = starters.filter(p => p.pos === 'MID');
  const fwd = starters.filter(p => p.pos === 'FWD');
  const formation = `${def.length}-${mid.length}-${fwd.length}`;

  const capId = planning && plannedTeam ? plannedTeam.captain : (state.players.find(p => p.captain)?.id);
  const vcId = planning && plannedTeam ? plannedTeam.vice : (state.players.find(p => p.vice)?.id);

  const renderPlayerCard = (p, isBench, benchNum) => {
    const live = liveDataCache[state.currentGW]?.[p.fplId];
    const livePts = live?.stats?.total_points ?? p.gwPoints ?? 0;
    const injury = p.status && p.status !== 'a';
    const isCap = p.id === capId;
    const isVC = p.id === vcId;
    let badge = '';
    if (isCap) badge = '<div class="pitch-badge-c">C</div>';
    else if (isVC) badge = '<div class="pitch-badge-v">V</div>';
    const injuryBadge = injury ? '<div class="pitch-badge-inj">⚠️</div>' : '';
    const numBadge = isBench && benchNum ? `<div class="pitch-badge-num">${benchNum}</div>` : '';
    const ptsClass = livePts > 2 ? '' : 'blank';
    const onClick = planning ? `openActionModal('${p.id}')` : `openPerfModal('${p.id}')`;
    return `
      <div class="pitch-card ${isCap ? 'captain' : ''} ${isVC ? 'vice' : ''} ${injury ? 'injured' : ''} ${isBench ? 'bench' : ''}" onclick="${onClick}">
        ${badge}
        ${injuryBadge}
        ${numBadge}
        ${p.photo ? `<img src="${p.photo}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="pitch-name">${escapeHtml(p.name.split(' ').slice(-1)[0])}</div>
        <div class="pitch-pts ${ptsClass}">${livePts}</div>
      </div>`;
  };

  const html = `
    <div class="pitch-formation">${formation} · GW${planning && planningGW ? planningGW : (state.currentGW || '?')}${planning ? ' · PLANNING' : ''}</div>
    <div class="pitch-row fwd">${fwd.map(p => renderPlayerCard(p, false)).join('')}</div>
    <div class="pitch-row mid">${mid.map(p => renderPlayerCard(p, false)).join('')}</div>
    <div class="pitch-row def">${def.map(p => renderPlayerCard(p, false)).join('')}</div>
    <div class="pitch-row gk">${gk.map(p => renderPlayerCard(p, false)).join('')}</div>
    <div class="pitch-bench">
      <div class="pitch-bench-label">Bench</div>
      <div class="pitch-bench-row">${bench.map((p, i) => renderPlayerCard(p, true, 12 + i)).join('')}</div>
    </div>
  `;
  container.innerHTML = html;
}

/* ========== TEAM VIEW ========== */
function renderTeamView() {
  const pitch = document.getElementById('pitch-view-team');
  const banner = document.getElementById('team-summary-banner');
  const planBanner = document.getElementById('planning-banner');
  const planCompare = document.getElementById('plan-compare');
  const planBtn = document.getElementById('plan-next-gw-btn');

  if (!pitch) return;

  if (planningMode && planBanner) {
    planBanner.style.display = 'block';
    document.getElementById('planning-gw').textContent = planningGW;
    document.body.classList.add('planning-active');
  } else if (planBanner) {
    planBanner.style.display = 'none';
    document.body.classList.remove('planning-active');
  }

  if (!state.players.length) {
    pitch.innerHTML = '<div class="empty"><span class="emoji">⚽</span>Sync to load your pitch</div>';
    if (banner) banner.innerHTML = '';
    if (planCompare) planCompare.style.display = 'none';
    return;
  }

  // Summary banner
  const mine = state.familyData?.find(f => f.id === teamId);
  const current = mine?.history?.current || [];
  const latest = current[current.length - 1];

  const useTeam = planningMode && plannedTeam;
  const starters = useTeam
    ? plannedTeam.starters.map(id => state.players.find(p => p.id === id)).filter(Boolean)
    : state.players.filter(p => !p.bench);

  const defCount = starters.filter(p => p.pos === 'DEF').length;
  const midCount = starters.filter(p => p.pos === 'MID').length;
  const fwdCount = starters.filter(p => p.pos === 'FWD').length;
  const formation = `${defCount}-${midCount}-${fwdCount}`;
  const capId = useTeam ? plannedTeam.captain : state.players.find(p => p.captain)?.id;
  const vcId = useTeam ? plannedTeam.vice : state.players.find(p => p.vice)?.id;
  const cap = state.players.find(p => p.id === capId);
  const vc = state.players.find(p => p.id === vcId);

  if (banner) {
    banner.innerHTML = `
      <div class="team-summary-item">
        <div class="label">${planningMode ? 'Planning' : 'This GW'}</div>
        <div class="value">${planningMode ? 'GW' + planningGW : (latest?.points || 0) + ' pts'}</div>
        <div class="sub">${planningMode ? 'Draft team' : (latest ? 'Rank ' + fmtRank(latest.overall_rank) : '—')}</div>
      </div>
      <div class="team-summary-item">
        <div class="label">Formation</div>
        <div class="value">${formation}</div>
        <div class="sub">${starters.length} starters</div>
      </div>
      <div class="team-summary-item">
        <div class="label">©️ Captain</div>
        <div class="value">${cap ? escapeHtml(cap.name.split(' ').slice(-1)[0]) : '—'}</div>
        <div class="sub">${cap ? fmt(cap.price) : 'Not set'}</div>
      </div>
      <div class="team-summary-item">
        <div class="label">🎗️ Vice</div>
        <div class="value">${vc ? escapeHtml(vc.name.split(' ').slice(-1)[0]) : '—'}</div>
        <div class="sub">${vc ? fmt(vc.price) : 'Not set'}</div>
      </div>
    `;
  }

  renderPitchView(pitch, planningMode);

  // Plan button state
  if (planBtn) {
    if (planningMode) {
      planBtn.style.display = 'none';
    } else {
      planBtn.style.display = 'inline-flex';
      const nextGW = state.nextGW || state.currentGW + 1;
      planBtn.textContent = `🗓 Plan GW${nextGW}`;
    }
  }

  // Plan comparison view
  if (planCompare) {
    const nextGW = state.nextGW || state.currentGW + 1;
    const savedPlan = state.plannedTeams?.[nextGW];
    if (savedPlan && !planningMode) {
      planCompare.style.display = 'block';
      renderPlanCompare(nextGW, savedPlan);
    } else {
      planCompare.style.display = 'none';
    }
  }
}

function renderPlanCompare(gw, plan) {
  const el = document.getElementById('plan-compare-content');
  if (!el) return;

  const currentStarters = state.players.filter(p => !p.bench).map(p => p.id);
  const currentBench = state.players.filter(p => p.bench).map(p => p.id);
  const currentCap = state.players.find(p => p.captain)?.id;
  const currentVC = state.players.find(p => p.vice)?.id;

  const changes = [];

  // Captain change
  if (plan.captain !== currentCap) {
    const from = state.players.find(p => p.id === currentCap);
    const to = state.players.find(p => p.id === plan.captain);
    if (to) {
      changes.push({
        label: 'Captain',
        from: from ? from.name : 'None',
        to: to.name,
      });
    }
  }

  // Vice change
  if (plan.vice !== currentVC) {
    const from = state.players.find(p => p.id === currentVC);
    const to = state.players.find(p => p.id === plan.vice);
    if (to) {
      changes.push({
        label: 'Vice',
        from: from ? from.name : 'None',
        to: to.name,
      });
    }
  }

  // Starting XI changes
  const movedToBench = currentStarters.filter(id => !plan.starters.includes(id));
  const movedToStart = currentBench.filter(id => plan.starters.includes(id));

  movedToBench.forEach(id => {
    const p = state.players.find(x => x.id === id);
    if (p) changes.push({ label: '⬇ Bench', from: p.name, to: 'Bench' });
  });
  movedToStart.forEach(id => {
    const p = state.players.find(x => x.id === id);
    if (p) changes.push({ label: '⬆ Start', from: 'Bench', to: p.name });
  });

  // Bench order changes
  const benchChanged = currentBench.some((id, i) => plan.bench[i] !== id);
  if (benchChanged && !movedToBench.length && !movedToStart.length) {
    changes.push({ label: 'Bench order', from: 'Changed', to: 'Reordered' });
  }

  if (!changes.length) {
    el.innerHTML = '<div class="plan-compare-empty">No changes — your plan matches your current team for GW' + gw + '.</div>';
    return;
  }

  el.innerHTML = `
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px">
      Saved plan for GW${gw} — ${changes.length} change${changes.length !== 1 ? 's' : ''}
    </div>
    ${changes.map(c => `
      <div class="plan-compare-row">
        <span class="label">${c.label}</span>
        <span class="from">${escapeHtml(c.from)}</span>
        <span class="arrow">→</span>
        <span class="to">${escapeHtml(c.to)}</span>
      </div>
    `).join('')}
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small primary" onclick="enterPlanningMode()">✏️ Edit Plan</button>
      <button class="btn small danger" onclick="deletePlannedTeam(${gw})">🗑 Delete Plan</button>
    </div>
  `;
}

/* ========== PLANNING MODE ========== */
function enterPlanningMode() {
  if (!state.players.length) return toast('Sync first', true);

  const nextGW = state.nextGW || state.currentGW + 1;
  planningMode = true;
  planningGW = nextGW;

  // Load saved plan or init from current team
  const saved = state.plannedTeams?.[nextGW];
  if (saved) {
    plannedTeam = { ...saved };
  } else {
    plannedTeam = {
      starters: state.players.filter(p => !p.bench).map(p => p.id),
      bench: state.players.filter(p => p.bench).map(p => p.id),
      captain: state.players.find(p => p.captain)?.id || null,
      vice: state.players.find(p => p.vice)?.id || null,
    };
  }

  renderTeamView();
  toast(`🗓 Planning mode — GW${nextGW}`);
}

function exitPlanningMode() {
  if (plannedTeam) {
    const changed = JSON.stringify(plannedTeam) !== JSON.stringify({
      starters: state.players.filter(p => !p.bench).map(p => p.id),
      bench: state.players.filter(p => p.bench).map(p => p.id),
      captain: state.players.find(p => p.captain)?.id || null,
      vice: state.players.find(p => p.vice)?.id || null,
    });
    if (changed && !confirm('Discard changes to your planned team?')) return;
  }
  planningMode = false;
  plannedTeam = null;
  planningGW = null;
  renderTeamView();
}

function resetPlanningToCurrent() {
  if (!confirm('Reset plan to your current team?')) return;
  plannedTeam = {
    starters: state.players.filter(p => !p.bench).map(p => p.id),
    bench: state.players.filter(p => p.bench).map(p => p.id),
    captain: state.players.find(p => p.captain)?.id || null,
    vice: state.players.find(p => p.vice)?.id || null,
  };
  renderTeamView();
  toast('↺ Reset to current team');
}

function savePlannedTeam() {
  if (!planningMode || !plannedTeam || !planningGW) return;
  if (!state.plannedTeams) state.plannedTeams = {};
  state.plannedTeams[planningGW] = { ...plannedTeam };
  saveState();
  updateTabBadges();
  toast(`💾 Saved plan for GW${planningGW}`);
  planningMode = false;
  plannedTeam = null;
  planningGW = null;
  renderTeamView();
}

function deletePlannedTeam(gw) {
  if (!confirm(`Delete your plan for GW${gw}?`)) return;
  if (state.plannedTeams) {
    delete state.plannedTeams[gw];
    saveState();
    updateTabBadges();
    renderTeamView();
    toast('Plan deleted');
  }
}

/* ========== ACTION MODAL ========== */
function openActionModal(playerId) {
  actionPlayerId = playerId;
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;

  const inStarters = plannedTeam?.starters.includes(p.id);
  const isCap = plannedTeam?.captain === p.id;
  const isVC = plannedTeam?.vice === p.id;

  const title = document.getElementById('action-modal-title');
  const content = document.getElementById('action-modal-content');
  title.textContent = `Actions — ${p.name}`;

  const live = liveDataCache[state.currentGW]?.[p.fplId];
  const livePts = live?.stats?.total_points ?? p.gwPoints ?? 0;

  content.innerHTML = `
    <div class="action-player-info">
      ${p.photo ? `<img src="${p.photo}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="info-text">
        <div class="info-name">${escapeHtml(p.name)}</div>
        <div class="info-meta">${escapeHtml(p.team)} · ${p.pos} · ${fmt(p.price)} · ${livePts} pts</div>
      </div>
    </div>
    <div class="action-list">
      ${!isCap ? `
        <button class="action-btn primary-action" onclick="setCaptainFromAction('${p.id}')">
          <span class="action-icon">👑</span>
          <span class="action-info">Make Captain<span class="action-sub">Gets 2× points this GW</span></span>
        </button>
      ` : `
        <button class="action-btn primary-action" onclick="setCaptainFromAction(null)">
          <span class="action-icon">👑</span>
          <span class="action-info">Remove Captain<span class="action-sub">Currently ©️</span></span>
        </button>
      `}
      ${!isVC && !isCap ? `
        <button class="action-btn" onclick="setViceFromAction('${p.id}')">
          <span class="action-icon">🎗️</span>
          <span class="action-info">Make Vice-Captain<span class="action-sub">Backup if captain blanks</span></span>
        </button>
      ` : ''}
      ${inStarters ? `
        <button class="action-btn" onclick="moveToBench('${p.id}')">
          <span class="action-icon">⬇️</span>
          <span class="action-info">Move to Bench<span class="action-sub">Sends to bench, auto-swap</span></span>
        </button>
      ` : `
        <button class="action-btn" onclick="moveToStarters('${p.id}')">
          <span class="action-icon">⬆️</span>
          <span class="action-info">Move to Starting XI<span class="action-sub">Swap with a starter</span></span>
        </button>
      `}
      <button class="action-btn" onclick="openSwapModal('${p.id}')">
        <span class="action-icon">🔄</span>
        <span class="action-info">Swap with...<span class="action-sub">Pick a specific player</span></span>
      </button>
      <button class="action-btn" onclick="openPerfModal('${p.id}');closeModal('action-modal')">
        <span class="action-icon">📊</span>
        <span class="action-info">View Performance<span class="action-sub">Full stats breakdown</span></span>
      </button>
      <button class="action-btn danger-action" onclick="transferOutFromAction('${p.id}')">
        <span class="action-icon">💸</span>
        <span class="action-info">Transfer Out<span class="action-sub">Plan a transfer</span></span>
      </button>
    </div>
  `;
  document.getElementById('action-modal').classList.add('active');
}

function setCaptainFromAction(playerId) {
  if (!plannedTeam) return;
  plannedTeam.captain = playerId;
  if (playerId && plannedTeam.vice === playerId) plannedTeam.vice = null;
  closeModal('action-modal');
  renderTeamView();
  toast(playerId ? '👑 Captain set' : '👑 Captain removed');
}

function setViceFromAction(playerId) {
  if (!plannedTeam) return;
  plannedTeam.vice = playerId;
  if (playerId && plannedTeam.captain === playerId) plannedTeam.captain = null;
  closeModal('action-modal');
  renderTeamView();
  toast('🎗️ Vice set');
}

function moveToBench(playerId) {
  if (!plannedTeam) return;
  // Find 1st sub (index 0 in bench) to swap with
  if (plannedTeam.bench.length === 0) return;
  const firstSub = plannedTeam.bench[0];
  // If moving GK to bench, need to swap with bench GK (index 3)
  const p = state.players.find(x => x.id === playerId);
  let swapIdx = 0;
  if (p.pos === 'GK') {
    swapIdx = plannedTeam.bench.findIndex(id => state.players.find(x => x.id === id)?.pos === 'GK');
    if (swapIdx === -1) return toast('No bench GK to swap', true);
  }
  const swapId = plannedTeam.bench[swapIdx];
  plannedTeam.starters = plannedTeam.starters.filter(id => id !== playerId);
  plannedTeam.starters.push(swapId);
  plannedTeam.bench[swapIdx] = playerId;
  // Clear captain/vice if they were moved to bench
  if (plannedTeam.captain === playerId) plannedTeam.captain = null;
  if (plannedTeam.vice === playerId) plannedTeam.vice = null;
  closeModal('action-modal');
  renderTeamView();
  toast('⬇️ Moved to bench');
}

function moveToStarters(playerId) {
  if (!plannedTeam) return;
  const p = state.players.find(x => x.id === playerId);
  // Find a starter to swap with (same position ideally)
  const starterIds = plannedTeam.starters;
  const samePos = starterIds.find(id => state.players.find(x => x.id === id)?.pos === p.pos);
  const target = samePos || starterIds[starterIds.length - 1];
  if (!target) return;

  const benchIdx = plannedTeam.bench.indexOf(playerId);
  const targetIdx = plannedTeam.starters.indexOf(target);
  if (benchIdx === -1 || targetIdx === -1) return;

  plannedTeam.bench[benchIdx] = target;
  plannedTeam.starters[targetIdx] = playerId;

  if (plannedTeam.captain === target) plannedTeam.captain = null;
  if (plannedTeam.vice === target) plannedTeam.vice = null;

  closeModal('action-modal');
  renderTeamView();
  toast('⬆️ Moved to starting XI');
}

function openSwapModal(playerId) {
  actionPlayerId = playerId;
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;

  const inStarters = plannedTeam?.starters.includes(p.id);
  // Show opposite side
  const candidates = inStarters
    ? plannedTeam.bench.map(id => state.players.find(x => x.id === id)).filter(Boolean)
    : plannedTeam.starters.map(id => state.players.find(x => x.id === id)).filter(Boolean);

  swapTargetId = null;

  const title = document.getElementById('swap-modal-title');
  const sub = document.getElementById('swap-modal-sub');
  const content = document.getElementById('swap-modal-content');

  title.textContent = `Swap ${p.name}`;
  sub.textContent = inStarters
    ? 'Choose a bench player to swap in:'
    : 'Choose a starter to swap out:';

  if (!candidates.length) {
    content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">No players available to swap with.</div>';
    document.getElementById('swap-modal').classList.add('active');
    return;
  }

  content.innerHTML = `<div class="swap-grid">${candidates.map(c => {
    // Check validity: must maintain 1 GK in XI, 3 DEF, 2 MID, 1 FWD
    const isValid = canSwap(p, c, inStarters);
    return `
      <button class="swap-option ${isValid ? '' : 'disabled'}" ${isValid ? `onclick="doSwap('${c.id}')"` : 'disabled'}>
        ${c.photo ? `<img src="${c.photo}" alt="" onerror="this.style.display='none'">` : ''}
        <div>
          <div class="swap-name">${escapeHtml(c.name.split(' ').slice(-1)[0])}</div>
          <div class="swap-meta">${c.pos} · ${fmt(c.price)}</div>
        </div>
      </button>
    `;
  }).join('')}</div>`;

  document.getElementById('swap-modal').classList.add('active');
}

function canSwap(p1, p2, p1InStarters) {
  // If both same position, always OK (swap within formation)
  if (p1.pos === p2.pos) return true;

  // If p1 is going to bench and p2 comes in, need to check formation validity
  const tempStarters = [...plannedTeam.starters];
  const tempBench = [...plannedTeam.bench];

  if (p1InStarters) {
    // p1 out, p2 in
    const i1 = tempStarters.indexOf(p1.id);
    const i2 = tempBench.indexOf(p2.id);
    if (i1 === -1 || i2 === -1) return false;
    tempStarters[i1] = p2.id;
    tempBench[i2] = p1.id;
  } else {
    // p1 in, p2 out
    const i1 = tempBench.indexOf(p1.id);
    const i2 = tempStarters.indexOf(p2.id);
    if (i1 === -1 || i2 === -1) return false;
    tempBench[i1] = p2.id;
    tempStarters[i2] = p1.id;
  }

  const starters = tempStarters.map(id => state.players.find(x => x.id === id)).filter(Boolean);
  const gk = starters.filter(p => p.pos === 'GK').length;
  const def = starters.filter(p => p.pos === 'DEF').length;
  const mid = starters.filter(p => p.pos === 'MID').length;
  const fwd = starters.filter(p => p.pos === 'FWD').length;

  // FPL rules: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD
  if (gk !== 1) return false;
  if (def < 3 || def > 5) return false;
  if (mid < 2 || mid > 5) return false;
  if (fwd < 1 || fwd > 3) return false;

  return true;
}

function doSwap(targetId) {
  if (!plannedTeam || !actionPlayerId || !targetId) return;
  const p1 = actionPlayerId;
  const p2 = targetId;
  const p1InStarters = plannedTeam.starters.includes(p1);

  if (p1InStarters) {
    const i1 = plannedTeam.starters.indexOf(p1);
    const i2 = plannedTeam.bench.indexOf(p2);
    if (i1 === -1 || i2 === -1) return;
    plannedTeam.starters[i1] = p2;
    plannedTeam.bench[i2] = p1;
  } else {
    const i1 = plannedTeam.bench.indexOf(p1);
    const i2 = plannedTeam.starters.indexOf(p2);
    if (i1 === -1 || i2 === -1) return;
    plannedTeam.bench[i1] = p2;
    plannedTeam.starters[i2] = p1;
  }

  // Clear captain/vice if moved to bench
  if (plannedTeam.bench.includes(plannedTeam.captain)) plannedTeam.captain = null;
  if (plannedTeam.bench.includes(plannedTeam.vice)) plannedTeam.vice = null;

  closeModal('swap-modal');
  closeModal('action-modal');
  renderTeamView();
  toast('🔄 Swapped');
}

function transferOutFromAction(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;
  closeModal('action-modal');
  planningMode = false;
  plannedTeam = null;
  renderTeamView();
  openPlanModal(null, state.nextGW || state.currentGW + 1);
  setTimeout(() => {
    document.getElementById('pl-out').value = p.name;
    document.getElementById('pl-out-price').value = p.price;
    onOutPlayerChange();
  }, 100);
}

/* ========== TIMELINE ========== */
function renderTimeline() {
  const t = document.getElementById('timeline');
  if (!t) return;
  const planMap = {};
  state.plans.forEach(p => {
    planMap[p.gw] = planMap[p.gw] || { count: 0, chip: '' };
    planMap[p.gw].count++;
    if (p.chip) planMap[p.gw].chip = p.chip;
  });
  let html = '';
  for (let gw = 1; gw <= 38; gw++) {
    const plan = planMap[gw];
    const status = getGWStatus(gw);
    const cls = ['gw-chip'];
    if (plan) cls.push('has-plan');
    if (plan && plan.chip) cls.push('has-chip');
    if (status === 'current') cls.push('current');
    if (status === 'past') cls.push('past');
    html += `<div class="${cls.join(' ')}" onclick="openPlanModal(null, ${gw})">
      ${plan && plan.chip ? '<div class="chip-icon">' + CHIP_EMOJI_SHORT[plan.chip] + '</div>' : ''}
      <div class="gw-num">GW${gw}</div>
      <div class="gw-plan">${status === 'past' ? '✅' : plan ? plan.count + ' plan' + (plan.count>1?'s':'') : '—'}</div>
    </div>`;
  }
  t.innerHTML = html;
}

/* ========== MINI PLANNER ========== */
function renderMiniPlans() {
  const el = document.getElementById('mini-plans');
  if (!el) return;
  if (!state.currentGW) {
    el.innerHTML = '<div class="empty"><span class="emoji">🔄</span>Sync to load your planner</div>';
    return;
  }
  const current = state.currentGW;
  const gwsToShow = [current, current + 1, current + 2].filter(gw => gw <= 38);
  el.innerHTML = gwsToShow.map(gw => {
    const plan = state.plans.find(p => p.gw === gw);
    const status = getGWStatus(gw);
    const summary = buildGWSummary(plan, status);
    const statusLabel = status === 'past' ? '✅ Done' : status === 'current' ? '🔥 Now' : '⏳ Next';
    return `
      <div class="mini-plan-row ${status}" onclick="openPlanModal('${plan?.id || ''}', ${gw})">
        <div class="mini-plan-gw">GW${gw}</div>
        <div class="mini-plan-info">${summary}</div>
        <div class="mini-plan-status ${status}">${statusLabel}</div>
      </div>`;
  }).join('');
}
function buildGWSummary(plan) {
  const parts = [];
  if (plan) {
    if (plan.outName || plan.inName) parts.push(`<span class="mini-plan-tag transfer">⬆${escapeHtml(plan.outName || '?')} ⬇${escapeHtml(plan.inName || '?')}</span>`);
    if (plan.captain) parts.push(`<span class="mini-plan-tag captain">👑 ${escapeHtml(plan.captain)}</span>`);
    if (plan.chip) parts.push(`<span class="mini-plan-tag chip">${CHIP_EMOJI_SHORT[plan.chip]} ${CHIP_NAME_SHORT[plan.chip]}</span>`);
  }
  if (!parts.length) return '<span style="color:var(--muted);font-size:0.75rem;font-style:italic">No plan yet</span>';
  return parts.join('');
}

/* ========== SEASON PLANNER ========== */
function renderSeasonPlanner(retryCount = 0) {
  const el = document.getElementById('season-planner');
  if (!el) return;
  if (!state.currentGW) {
    if (retryCount < 5) {
      el.innerHTML = '<div class="empty"><span class="emoji">⏳</span>Syncing... please wait (' + (retryCount + 1) + '/5)</div>';
      setTimeout(() => renderSeasonPlanner(retryCount + 1), 1500);
    } else {
      el.innerHTML = '<div class="empty"><span class="emoji">🗓</span>Sync from Dashboard to load the season planner</div>';
    }
    return;
  }
  const chipsUsed = (state.familyData?.find(f => f.id === teamId)?.history?.current || []).filter(g => g.active_chip).length || 0;
  const plannedTransfers = state.plans.filter(p => (p.outName && p.inName) && p.gw >= state.currentGW).length;
  document.getElementById('pl-status-bank').textContent = fmt(state.bank);
  document.getElementById('pl-status-value').textContent = fmt(state.players.reduce((s, p) => s + p.price, 0));
  document.getElementById('pl-status-chips').textContent = (4 - chipsUsed) + ' / 4';
  document.getElementById('pl-status-transfers').textContent = plannedTransfers;

  const current = state.currentGW;
  let html = '';
  for (let gw = 1; gw <= 38; gw++) {
    const status = getGWStatus(gw);
    const plan = state.plans.find(p => p.gw === gw);
    const isOpen = openAccordions[gw] || false;
    const summaryParts = buildGWSummary(plan, status);
    const statusLabel = status === 'past' ? '✅ Done' : status === 'current' ? '🔥 This Week' : '⏳ Upcoming';
    const result = gwResultCache[gw];
    const pastSummary = status === 'past' && result ? `<span class="gw-acc-pill captain">${result.points} pts</span>` : '';
    html += `
      <div class="gw-accordion ${status} ${isOpen ? 'open' : ''}" data-gw="${gw}">
        <div class="gw-accordion-header" onclick="toggleAccordion(${gw})">
          <div class="gw-acc-gwnum">GW${gw}</div>
          <div class="gw-acc-summary">
            ${pastSummary}
            ${summaryParts}
            <span class="gw-acc-status ${status}">${statusLabel}</span>
          </div>
          <div class="gw-acc-chevron">▼</div>
        </div>
        <div class="gw-accordion-body">
          <div class="gw-accordion-body-inner" id="gw-body-${gw}">
            ${renderGWAccordionBody(gw, plan, status)}
          </div>
        </div>
      </div>`;
  }
  el.innerHTML = html;
  if (state.familyData) {
    for (let gw = 1; gw < current; gw++) {
      if (!gwResultCache[gw]) {
        fetchGWResult(gw).then(r => { if (r) updateGWPastSummary(gw, r); });
      }
    }
  }
}
async function updateGWPastSummary(gw, result) {
  const el = document.querySelector(`.gw-accordion[data-gw="${gw}"] .gw-accordion-header`);
  if (!el) return;
  const summaryBox = el.querySelector('.gw-acc-summary');
  if (!summaryBox) return;
  const existing = summaryBox.querySelector('.gw-acc-pill.captain.result');
  if (existing) existing.remove();
  const newPill = document.createElement('span');
  newPill.className = 'gw-acc-pill captain result';
  newPill.innerHTML = `${result.points} pts`;
  summaryBox.insertBefore(newPill, summaryBox.firstChild);
  if (openAccordions[gw]) {
    const bodyEl = document.getElementById(`gw-body-${gw}`);
    if (bodyEl) bodyEl.innerHTML = renderGWAccordionBody(gw, state.plans.find(p => p.gw === gw), 'past');
  }
}
function renderGWAccordionBody(gw, plan, status) {
  const isPast = status === 'past';
  const result = gwResultCache[gw];
  if (isPast) return renderPastGWBody(gw, plan, result);
  const fixtures = fixturesCache[gw] || [];
  const myPlayers = myPlayersInFixtures(fixtures);
  let planHtml = '';
  if (plan && (plan.outName || plan.inName || plan.captain || plan.chip || plan.note)) {
    const net = (Number(plan.inPrice) || 0) - (Number(plan.outPrice) || 0);
    const netStr = net === 0 ? '£0.0m' : (net > 0 ? '+' : '') + fmt(net);
    const hasTransfer = plan.outName || plan.inName;
    planHtml = `
      <div class="gw-plan-content">
        ${hasTransfer ? `<div class="plan-body">
          <div class="transfer-side out"><div class="side-label">⬆ Out</div><div class="transfer-player">${escapeHtml(plan.outName || '—')}</div><div class="transfer-price">${fmt(plan.outPrice)}</div></div>
          <div class="transfer-side in"><div class="side-label">⬇ In</div><div class="transfer-player">${escapeHtml(plan.inName || '—')}</div><div class="transfer-price">${fmt(plan.inPrice)}</div></div>
        </div>` : ''}
        <div class="plan-extras">
          ${plan.captain ? `<div class="plan-extra"><span class="extra-label">👑 Captain</span><span class="extra-value">${escapeHtml(plan.captain)}</span></div>` : ''}
          ${plan.vice ? `<div class="plan-extra"><span class="extra-label">🎗️ Vice</span><span class="extra-value">${escapeHtml(plan.vice)}</span></div>` : ''}
          ${plan.chip ? `<div class="plan-extra"><span class="extra-label">Chip</span><span class="extra-value">${CHIP_EMOJI_SHORT[plan.chip]} ${CHIP_NAME_SHORT[plan.chip]}</span></div>` : ''}
          ${plan.ftAfter !== null && plan.ftAfter !== undefined && plan.ftAfter !== '' ? `<div class="plan-extra"><span class="extra-label">🔄 FT after</span><span class="extra-value">${plan.ftAfter}</span></div>` : ''}
        </div>
        ${plan.note ? `<div class="plan-note">📝 ${escapeHtml(plan.note)}</div>` : ''}
        ${hasTransfer ? `<div class="plan-footer"><span>Net cost: <strong>${netStr}</strong></span></div>` : ''}
      </div>`;
  } else {
    planHtml = `<div class="gw-empty-plan">No plan yet for GW${gw}.<br><button class="btn small primary" style="margin-top:10px" onclick="openPlanModal(null, ${gw})">＋ Add Plan</button></div>`;
  }
  let fixturesHtml = '';
  if (myPlayers.length) {
    fixturesHtml = `<div class="plan-fixtures"><div class="plan-fixtures-title">⚽ Your players this GW</div>
      ${myPlayers.slice(0, 12).map(mp => `<div class="plan-fixture-row">
        <img src="${BADGE_BASE}/${mp.teamId}.svg" onerror="this.style.display='none'">
        <span class="opp">${escapeHtml(mp.player)}</span>
        <span style="color:var(--muted);font-size:0.72rem">${mp.home ? 'vs' : '@'} ${escapeHtml(mp.opp.short)}</span>
        <span class="fixture-diff diff" data-diff="${mp.difficulty}">${mp.difficulty}</span>
      </div>`).join('')}</div>`;
  }
  const actionsHtml = `<div class="gw-plan-actions">
    ${plan ? `<button class="btn small" onclick="openPlanModal('${plan.id}')">✏️ Edit</button>` : ''}
    ${plan ? `<button class="btn small danger" onclick="removePlan('${plan.id}')">🗑 Delete</button>` : ''}
    ${!plan ? `<button class="btn small primary" onclick="openPlanModal(null, ${gw})">＋ Add Plan</button>` : ''}
  </div>`;
  return planHtml + fixturesHtml + actionsHtml;
}
function renderPastGWBody(gw, plan, result) {
  const pred = plan ? `<div class="gw-compare-col predicted">
    <h5>📋 You Planned</h5>
    ${plan.outName || plan.inName ? `<div class="gw-compare-line"><span class="label">Transfer</span><span class="value">⬆${escapeHtml(plan.outName || '?')} ⬇${escapeHtml(plan.inName || '?')}</span></div>` : ''}
    ${plan.captain ? `<div class="gw-compare-line"><span class="label">Captain</span><span class="value">👑 ${escapeHtml(plan.captain)}</span></div>` : ''}
    ${plan.vice ? `<div class="gw-compare-line"><span class="label">Vice</span><span class="value">🎗️ ${escapeHtml(plan.vice)}</span></div>` : ''}
    ${plan.chip ? `<div class="gw-compare-line"><span class="label">Chip</span><span class="value">${CHIP_EMOJI_SHORT[plan.chip]} ${CHIP_NAME_SHORT[plan.chip]}</span></div>` : ''}
    ${plan.note ? `<div class="gw-compare-line"><span class="label">Note</span><span class="value" style="font-style:italic">${escapeHtml(plan.note)}</span></div>` : ''}
    ${!plan.outName && !plan.inName && !plan.captain && !plan.chip ? '<div style="color:var(--muted);font-size:0.75rem;font-style:italic">No plan recorded</div>' : ''}
  </div>` : `<div class="gw-compare-col predicted"><h5>📋 You Planned</h5><div style="color:var(--muted);font-size:0.75rem;font-style:italic">No plan recorded for GW${gw}</div></div>`;
  const actual = result ? `<div class="gw-compare-col actual">
    <h5>✅ Actual Result</h5>
    <div class="gw-compare-line"><span class="label">Points</span><span class="value" style="color:var(--mint)">${result.points}</span></div>
    <div class="gw-compare-line"><span class="label">Overall Rank</span><span class="value">${fmtRank(result.rank)}</span></div>
    <div class="gw-compare-line"><span class="label">Captain</span><span class="value">👑 ${escapeHtml(result.captain)}</span></div>
    <div class="gw-compare-line"><span class="label">Transfers</span><span class="value">${result.transfers}${result.transferCost ? ` (-${result.transferCost} pts)` : ''}</span></div>
    ${result.chip ? `<div class="gw-compare-line"><span class="label">Chip</span><span class="value">${CHIP_EMOJI[result.chip]} ${CHIP_NAME[result.chip]}</span></div>` : ''}
    <div class="gw-compare-line"><span class="label">Bank</span><span class="value">${fmt(result.bank)}</span></div>
    <div class="gw-compare-line"><span class="label">Value</span><span class="value">${fmt(result.value)}</span></div>
  </div>` : `<div class="gw-compare-col actual"><h5>✅ Actual Result</h5><div style="color:var(--muted);font-size:0.75rem;font-style:italic">Loading...</div></div>`;
  return `<div class="gw-compare">${pred}${actual}</div>`;
}
function toggleAccordion(gw) {
  openAccordions[gw] = !openAccordions[gw];
  const el = document.querySelector(`.gw-accordion[data-gw="${gw}"]`);
  if (el) el.classList.toggle('open', openAccordions[gw]);
  if (openAccordions[gw] && getGWStatus(gw) === 'past' && !gwResultCache[gw]) {
    const bodyEl = document.getElementById(`gw-body-${gw}`);
    if (bodyEl) bodyEl.innerHTML = renderPastGWBody(gw, state.plans.find(p => p.gw === gw), null);
    fetchGWResult(gw).then(r => {
      if (r && bodyEl) bodyEl.innerHTML = renderPastGWBody(gw, state.plans.find(p => p.gw === gw), r);
    });
  }
}
function expandAllPlans() {
  for (let gw = 1; gw <= 38; gw++) openAccordions[gw] = true;
  document.querySelectorAll('.gw-accordion').forEach(el => el.classList.add('open'));
}
function collapseAllPlans() {
  openAccordions = {};
  document.querySelectorAll('.gw-accordion').forEach(el => el.classList.remove('open'));
}

/* ========== MINI LEADERBOARD ========== */
function renderMiniLeaderboard() {
  const wrap = document.getElementById('mini-leaderboard');
  if (!wrap) return;
  if (!state.familyData || state.familyData.length === 0) {
    wrap.innerHTML = '<div class="empty" style="padding:16px;font-size:0.8rem"><span class="emoji" style="font-size:1.5rem">🏆</span>Sync to load family standings</div>';
    return;
  }
  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    const latest = hist[hist.length - 1];
    return { id: m.id, name: m.name, emoji: m.emoji || '', teamName: m.entry?.name || '', totalPts: latest?.total_points || 0, gwPts: latest?.points || 0 };
  }).sort((a, b) => b.totalPts - a.totalPts);
  wrap.innerHTML = rows.map((r, i) => `
    <div class="lb-row mini ${r.id === teamId ? 'me' : ''}" onclick="switchView('leaderboard', document.querySelector('[data-view=leaderboard]'))">
      <div class="lb-rank">${RANK_EMOJI[i] || (i + 1)}</div>
      <div><div class="lb-name">${r.emoji} ${escapeHtml(r.name)} ${r.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div><div class="lb-teamname">${escapeHtml(r.teamName)}</div></div>
      <div class="lb-stat">${r.totalPts}<small>Total</small></div>
      <div class="lb-stat">${r.gwPts}<small>GW</small></div>
    </div>`).join('');
}

/* ========== FAMILY LEAGUE ========== */
function renderLeaderboard() {
  renderWeeklyRoast();
  renderMainLeaderboard();
  renderBestGW();
  renderWorstGW();
  renderTrophyCabinet();
  renderGlance();
  renderCaptainPicks().catch(e => console.warn('Captain picks failed', e));
}
function renderWeeklyRoast() {
  const el = document.getElementById('weekly-roast');
  if (!el) return;
  if (!state.familyData || !state.familyData.length) {
    el.innerHTML = '<div class="empty" style="padding:20px"><span class="emoji">🔥</span>Sync to see this week\'s roast</div>';
    return;
  }
  const lines = buildRoastLines();
  el.innerHTML = `<div class="roast-title">🔥 WEEKLY ROAST — GW${state.currentGW || '?'}</div>${lines.map(l => `<div class="roast-line">${l}</div>`).join('')}`;
}
function buildRoastLines() {
  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    const latest = hist[hist.length - 1];
    return { id: m.id, name: m.name, emoji: m.emoji, teamName: m.entry?.name || '', totalPts: latest?.total_points || 0, gwPts: latest?.points || 0 };
  }).sort((a, b) => b.totalPts - a.totalPts);
  if (!rows.length) return ['Sync to load data.'];
  const leader = rows[0];
  const last = rows[rows.length - 1];
  const bestGW = [...rows].sort((a, b) => b.gwPts - a.gwPts)[0];
  const worstGW = [...rows].sort((a, b) => a.gwPts - b.gwPts)[0];
  const gap = leader.totalPts - (rows[1]?.totalPts || 0);
  return [
    `👑 <strong>${leader.emoji} ${leader.name}</strong> sits on top with <strong>${leader.totalPts} pts</strong>.`,
    gap > 0 && gap < 10 ? `🔥 Only <strong>${gap} pts</strong> separate top from 2nd. Tense.` : '',
    gap >= 10 ? `📈 The gap at the top is <strong>${gap} pts</strong>. ${leader.name.split(' ')[0]} is running away.` : '',
    bestGW.gwPts > 0 ? `⚡ <strong>${bestGW.emoji} ${bestGW.name}</strong> top-scored this week with <strong>${bestGW.gwPts} pts</strong>.` : '',
    worstGW.id !== bestGW.id ? `💀 <strong>${worstGW.emoji} ${worstGW.name}</strong> had a rough one — only <strong>${worstGW.gwPts} pts</strong>.` : '',
    `🐌 <strong>${last.emoji} ${last.name}</strong> props up the table with <strong>${last.totalPts} pts</strong>.`,
    `_ ${randomQuote(ROAST_WEEKLY)} _`,
  ].filter(Boolean);
}
function renderMainLeaderboard() {
  const card = document.getElementById('leaderboard-card');
  if (!card) return;
  if (!state.familyData || !state.familyData.length) { card.innerHTML = '<div class="empty"><span class="emoji">🏆</span>Sync to load standings</div>'; return; }
  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    const latest = hist[hist.length - 1];
    return { ...m, totalPts: latest?.total_points || 0, gwPts: latest?.points || 0, overallRank: latest?.overall_rank || 0 };
  }).sort((a, b) => b.totalPts - a.totalPts);
  card.innerHTML = rows.map((r, i) => {
    const mood = calcMood(r);
    return `<div class="lb-row ${r.id === teamId ? 'me' : ''}">
      <div class="lb-rank">${RANK_EMOJI[i] || (i + 1)}</div>
      <div><div class="lb-name">${r.emoji || ''} ${escapeHtml(r.name)} ${r.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''} ${MOOD_EMOJI[mood] || ''}</div><div class="lb-teamname">${escapeHtml(r.entry?.name || '')}</div></div>
      <div class="lb-stat">${r.totalPts}<small>Total</small></div>
      <div class="lb-stat">${r.gwPts}<small>GW</small></div>
      <div class="lb-stat">${fmtRank(r.overallRank)}<small>Rank</small></div>
    </div>`;
  }).join('');
}
function calcMood(row) {
  const hist = row.history?.current || [];
  if (hist.length < 2) return 'steady';
  const gw = hist[hist.length - 1]?.points || 0;
  const avg = hist.reduce((s, g) => s + g.points, 0) / hist.length;
  const best = Math.max(...hist.map(g => g.points));
  if (gw === best) return 'hot';
  if (gw > avg + 5) return 'climbing';
  if (gw < avg - 15) return 'dead';
  if (gw < avg - 5) return 'slipping';
  return 'steady';
}
function renderBestGW() {
  const card = document.getElementById('best-gw-card');
  if (!card) return;
  if (!state.familyData || !state.familyData.length) { card.innerHTML = '<div class="empty"><span class="emoji">🔥</span>Sync to load</div>'; return; }
  const entries = state.familyData.map(m => {
    const hist = m.history?.current || [];
    if (!hist.length) return null;
    const best = hist.reduce((mx, g) => g.points > mx.points ? g : mx, hist[0]);
    return { id: m.id, name: m.name, emoji: m.emoji, teamName: m.entry?.name || '', points: best.points, gw: best.event, chip: best.active_chip || null };
  }).filter(Boolean).sort((a, b) => b.points - a.points);
  const medals = ['🥇', '🥈', '🥉'];
  const tailEmoji = ['😴', '🐌'];
  card.innerHTML = entries.map((e, i) => {
    const medal = medals[i] || tailEmoji[i - 3] || '·';
    const chipLabel = e.chip ? `${CHIP_EMOJI[e.chip] || ''} ${CHIP_NAME[e.chip] || e.chip}` : '— no chip';
    const quote = e.points >= 60 ? randomQuote(ROAST_BEST) : '';
    return `<div class="lb-row ${e.id === teamId ? 'me' : ''}">
      <div class="lb-rank">${medal}</div>
      <div><div class="lb-name">${e.emoji || ''} ${escapeHtml(e.name)} ${e.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div><div class="lb-teamname">${escapeHtml(e.teamName)}</div>${quote ? `<div class="lb-quote">"${quote}"</div>` : ''}</div>
      <div class="lb-stat">${e.points} pts<small>Best</small></div>
      <div class="lb-stat">GW${e.gw}<small>When</small></div>
      <div class="lb-stat" style="font-size:0.72rem">${chipLabel}<small>Chip</small></div>
    </div>`;
  }).join('');
}
function renderWorstGW() {
  const card = document.getElementById('worst-gw-card');
  if (!card) return;
  if (!state.familyData || !state.familyData.length) { card.innerHTML = '<div class="empty"><span class="emoji">❄️</span>Sync to load</div>'; return; }
  const entries = state.familyData.map(m => {
    const hist = m.history?.current || [];
    if (!hist.length) return null;
    const worst = hist.reduce((mn, g) => g.points < mn.points ? g : mn, hist[0]);
    return { id: m.id, name: m.name, emoji: m.emoji, teamName: m.entry?.name || '', points: worst.points, gw: worst.event };
  }).filter(Boolean).sort((a, b) => b.points - a.points);
  const medals = ['🥇', '🥈', '🥉'];
  card.innerHTML = entries.map((e, i) => {
    const medal = medals[i] || (i === entries.length - 1 ? '🗑️' : '·');
    const shame = SHAME_EMOJI(e.points);
    const quote = randomQuote(ROAST_WORST);
    return `<div class="lb-row ${e.id === teamId ? 'me' : ''}">
      <div class="lb-rank">${medal}</div>
      <div><div class="lb-name">${e.emoji || ''} ${escapeHtml(e.name)} ${e.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div><div class="lb-teamname">${escapeHtml(e.teamName)}</div><div class="lb-quote">"${quote}"</div></div>
      <div class="lb-stat">${e.points} pts<small>Worst</small></div>
      <div class="lb-stat">GW${e.gw}<small>When</small></div>
      <div class="lb-stat">${shame}<small>Shame</small></div>
    </div>`;
  }).join('');
}
function renderTrophyCabinet() {
  const el = document.getElementById('trophy-cabinet');
  if (!el) return;
  if (!state.familyData || !state.familyData.length) { el.innerHTML = '<div class="empty"><span class="emoji">🏅</span>Sync to load</div>'; return; }
  const gwWinners = {};
  state.familyData.forEach(m => {
    const hist = m.history?.current || [];
    hist.forEach(g => {
      if (!gwWinners[g.event] || g.points > gwWinners[g.event].points) {
        gwWinners[g.event] = { event: g.event, points: g.points, id: m.id, name: m.name, emoji: m.emoji, chip: g.active_chip || null };
      }
    });
  });
  const list = Object.values(gwWinners).sort((a, b) => b.event - a.event).slice(0, 20);
  if (!list.length) { el.innerHTML = '<div class="empty">No GWs played yet</div>'; return; }
  el.innerHTML = `<div class="trophy-grid">${list.map(w => `
    <div class="trophy-item">
      <div class="trophy-gw">GW${w.event}</div>
      <div class="trophy-info"><div class="trophy-name">👑 ${w.emoji || ''} ${escapeHtml(w.name.split(' ')[0])}</div><div class="trophy-detail">${w.points} pts${w.chip ? ' · ' + (CHIP_EMOJI[w.chip] || '') : ''}</div></div>
    </div>`).join('')}</div>`;
}
async function fetchAllCaptainPicks() {
  if (captainHistoryCache) return captainHistoryCache;
  const bp = state.bootstrap;
  if (!bp) return [];
  const elementsMap = {};
  bp.elements.forEach(e => elementsMap[e.id] = e);
  const currentGW = state.currentGW || 1;
  const result = [];
  const gwNums = [];
  for (let gw = 1; gw <= currentGW; gw++) gwNums.push(gw);
  await Promise.all(gwNums.map(gw => fetchLiveGW(gw)));
  for (const m of FAMILY) {
    const seasonPicks = [];
    const picksByGW = await Promise.all(gwNums.map(gw => fpl(`/entry/${m.id}/event/${gw}/picks/`).catch(() => null)));
    gwNums.forEach((gw, i) => {
      const picksData = picksByGW[i];
      if (!picksData || !picksData.picks) return;
      const cap = picksData.picks.find(p => p.is_captain);
      if (!cap) return;
      const el2 = elementsMap[cap.element];
      if (!el2) return;
      const liveMap = liveDataCache[gw] || {};
      const live = liveMap[cap.element];
      let pts = 0;
      if (live && live.stats) pts = (live.stats.total_points || 0) * 2;
      else if (cap.points) pts = cap.points * 2;
      seasonPicks.push({ gw, player: el2.web_name, pos: POS_MAP[el2.element_type], points: pts });
    });
    result.push({ id: m.id, name: m.name, emoji: m.emoji, seasonPicks });
  }
  captainHistoryCache = result;
  return result;
}
async function renderCaptainPicks() {
  const worstEl = document.getElementById('worst-captain-card');
  const bestEl = document.getElementById('best-captain-card');
  if (!worstEl || !bestEl) return;
  if (!state.familyData || !state.familyData.length || !state.bootstrap) {
    worstEl.innerHTML = '<div class="empty"><span class="emoji">💀</span>Sync to load</div>';
    bestEl.innerHTML = '<div class="empty"><span class="emoji">👑</span>Sync to load</div>';
    return;
  }
  worstEl.innerHTML = '<div class="empty" style="padding:16px;font-size:0.75rem"><span class="emoji">⏳</span>Scanning...</div>';
  bestEl.innerHTML = '<div class="empty" style="padding:16px;font-size:0.75rem"><span class="emoji">⏳</span>Scanning...</div>';
  let allCaptains;
  try { allCaptains = await fetchAllCaptainPicks(); } catch (e) { return; }
  const perManager = allCaptains.map(m => {
    if (!m.seasonPicks.length) return null;
    const sorted = [...m.seasonPicks].sort((a, b) => b.points - a.points);
    return { id: m.id, name: m.name, emoji: m.emoji, best: sorted[0], worst: sorted[sorted.length - 1] };
  }).filter(Boolean);
  if (!perManager.length) return;
  const worstList = [...perManager].sort((a, b) => a.worst.points - b.worst.points);
  const bestList = [...perManager].sort((a, b) => b.best.points - a.best.points);
  const renderRow = (row, pick, type) => {
    const emoji = type === 'worst' ? SHAME_EMOJI(pick.points) : (pick.points >= 20 ? '🚀' : pick.points >= 14 ? '🔥' : pick.points >= 10 ? '📈' : '👍');
    const color = type === 'worst' ? 'var(--red)' : 'var(--gold)';
    return `<div class="shame-item">
      <div class="shame-gw" style="${type === 'best' ? 'color:var(--gold)' : ''}">GW${pick.gw}</div>
      <div class="shame-player">© ${escapeHtml(pick.player)} <span class="pos-badge" data-pos="${pick.pos}" style="font-size:0.5rem">${pick.pos}</span></div>
      <div class="shame-pts" style="color:${color}">${pick.points} pts ${emoji}</div>
      <div class="shame-manager">${row.emoji || ''} ${escapeHtml(row.name.split(' ')[0])}</div>
    </div>`;
  };
  worstEl.innerHTML = worstList.map(r => renderRow(r, r.worst, 'worst')).join('');
  bestEl.innerHTML = bestList.map(r => renderRow(r, r.best, 'best')).join('');
}
function renderGlance() {
  const el = document.getElementById('weekly-glance');
  if (!el) return;
  if (!state.familyData || !state.familyData.length) { el.innerHTML = '<div class="empty"><span class="emoji">📅</span>Sync to see stats</div>'; return; }
  const rows = state.familyData.map(m => {
    const hist = m.history?.current || [];
    const latest = hist[hist.length - 1];
    return { name: m.name, emoji: m.emoji, gwPts: latest?.points || 0, totalPts: latest?.total_points || 0 };
  }).filter(r => r.totalPts > 0);
  if (!rows.length) return;
  const best = [...rows].sort((a, b) => b.gwPts - a.gwPts)[0];
  const worst = [...rows].sort((a, b) => a.gwPts - b.gwPts)[0];
  const avg = Math.round(rows.reduce((s, r) => s + r.gwPts, 0) / rows.length);
  const leader = [...rows].sort((a, b) => b.totalPts - a.totalPts)[0];
  el.innerHTML = `<div class="glance-grid" style="padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
    <div class="glance-card"><div class="label">🏆 Leader</div><div class="value">${leader.totalPts}</div><div class="sub">${leader.emoji} ${escapeHtml(leader.name.split(' ')[0])}</div></div>
    <div class="glance-card"><div class="label">⚡ Best GW</div><div class="value">${best.gwPts}</div><div class="sub">${best.emoji} ${escapeHtml(best.name.split(' ')[0])}</div></div>
    <div class="glance-card"><div class="label">📊 Family Avg</div><div class="value">${avg}</div><div class="sub">this GW</div></div>
    <div class="glance-card"><div class="label">😅 Worst GW</div><div class="value">${worst.gwPts}</div><div class="sub">${worst.emoji} ${escapeHtml(worst.name.split(' ')[0])}</div></div>
  </div>`;
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
  const maxPts = Math.max(...gws.map(g => g.points), 1);
  chartPoints.innerHTML = `<div class="chart-bars">${gws.map(g => `
    <div class="chart-bar me" style="height:${(g.points / maxPts) * 180}px" title="GW${g.event}: ${g.points} pts">
      <div class="bar-value">${g.points}</div>
      <div class="bar-label">${g.event}</div>
    </div>`).join('')}</div>`;
  const ranks = gws.map(g => g.overall_rank).filter(r => r > 0);
  if (ranks.length > 1) {
    const minRank = Math.min(...ranks), maxRank = Math.max(...ranks);
    const w = 900, h = 200, step = w / (ranks.length - 1);
    const points = ranks.map((r, i) => `${i * step},${((r - minRank) / (maxRank - minRank || 1)) * (h - 40) + 20}`).join(' ');
    chartRank.innerHTML = `<div class="rank-svg-wrap"><svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">
      <defs><linearGradient id="rankLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#00ff87"/><stop offset="100%" stop-color="#04f5ff"/></linearGradient></defs>
      <polyline fill="none" stroke="url(#rankLine)" stroke-width="3" points="${points}" stroke-linejoin="round" stroke-linecap="round"/>
      ${ranks.map((r, i) => { const y = ((r - minRank) / (maxRank - minRank || 1)) * (h - 40) + 20; return `<circle cx="${i * step}" cy="${y}" r="4" fill="#00ff87"><title>GW${gws[i].event}: #${r.toLocaleString()}</title></circle>`; }).join('')}
    </svg></div>`;
  } else chartRank.innerHTML = '<div class="empty">Not enough data yet</div>';
  const maxBoth = Math.max(...gws.map(g => Math.max(g.points, g.average_entry_score || 0)), 1);
  chartAverage.innerHTML = `<div class="chart-bars">${gws.map(g => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="display:flex;gap:2px;align-items:flex-end">
        <div class="chart-bar me" style="height:${(g.points / maxBoth) * 140}px;width:18px" title="You: ${g.points}"></div>
        <div class="chart-bar avg" style="height:${((g.average_entry_score || 0) / maxBoth) * 140}px;width:18px" title="Avg: ${g.average_entry_score || 0}"></div>
      </div>
      <div class="bar-label">${g.event}</div>
    </div>`).join('')}</div>
    <div style="display:flex;gap:16px;justify-content:center;font-size:0.7rem;color:var(--muted);padding-top:8px"><span>🟢 You</span><span>🟣 Average</span></div>`;
  const usedChips = {};
  gws.forEach(g => { if (g.active_chip) usedChips[g.active_chip] = g.event; });
  const allChips = ['wildcard', 'bboost', '3xc', 'freehit'];
  chipTracker.innerHTML = `<div class="chip-tracker">${allChips.map(c => {
    const used = usedChips[c];
    return `<div class="chip-card ${used ? 'used' : ''}"><div class="chip-icon">${CHIP_EMOJI[c]}</div><div class="chip-name">${CHIP_NAME[c]}</div><div class="chip-status">${used ? 'Used GW' + used : 'Available'}</div></div>`;
  }).join('')}</div>`;
  tbody.innerHTML = [...gws].reverse().map(g => `
    <tr><td>GW${g.event}</td><td>${g.points}</td><td>${fmtRank(g.overall_rank)}</td><td>${fmt((g.bank || 0) / 10)}</td><td>${fmt((g.value || 0) / 10)}</td><td>${g.event_transfers || 0}${g.event_transfers_cost ? ' (-' + g.event_transfers_cost + ')' : ''}</td></tr>`).join('');
}

/* ========== PLAYERS ========== */
function renderPlayers() {
  const grid = document.getElementById('players-grid');
  if (!grid) return;
  if (!state.bootstrap) { grid.innerHTML = '<div class="empty"><span class="emoji">🔍</span>Sync to search players</div>'; return; }
  const q = (document.getElementById('player-search')?.value || '').toLowerCase();
  const posFilter = document.getElementById('player-filter-pos')?.value || '';
  const sortBy = document.getElementById('player-sort')?.value || 'total_points';
  const teamMap = {};
  state.bootstrap.teams.forEach(t => teamMap[t.id] = t.short_name);
  let list = state.bootstrap.elements.map(el => ({
    id: el.id, name: el.web_name, fullName: `${el.first_name} ${el.second_name}`,
    pos: POS_MAP[el.element_type], price: el.now_cost / 10,
    team: teamMap[el.team] || '?', teamId: el.team,
    form: parseFloat(el.form) || 0, points: el.total_points,
    ownership: parseFloat(el.selected_by_percent) || 0, status: el.status, news: el.news,
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
  if (!list.length) { grid.innerHTML = '<div class="empty">No players found</div>'; return; }
  grid.innerHTML = list.map(p => {
    const statusWarn = p.status !== 'a' ? '⚠️ ' : '';
    const badge = `${BADGE_BASE}/${p.teamId}.svg`;
    return `<div class="player-result">
      <div class="name"><span>${statusWarn}${escapeHtml(p.name)}</span><span class="pos-badge" data-pos="${p.pos}">${p.pos}</span></div>
      <div class="meta"><span class="price-tag">${fmt(p.price)}</span><span style="display:flex;align-items:center;gap:4px"><img src="${badge}" style="width:12px;height:12px" onerror="this.style.display='none'">${escapeHtml(p.team)}</span></div>
      <div class="stat-line"><span>Points</span><strong>${p.points}</strong></div>
      <div class="stat-line"><span>Form</span><strong>${p.form.toFixed(1)}</strong></div>
      <div class="stat-line"><span>Owned</span><strong>${p.ownership.toFixed(1)}%</strong></div>
    </div>`;
  }).join('');
}

/* ========== PERFORMANCE MODAL ========== */
async function openPerfModal(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;
  const bp = state.bootstrap;
  const el2 = bp?.elements?.find(x => x.id === p.fplId);
  if (!el2) return;
  const currentGW = state.currentGW;
  const liveMap = currentGW ? await fetchLiveGW(currentGW) : {};
  const live = liveMap[p.fplId];
  const stats = live?.stats || {};
  const nextFixtures = await fetchTeamFixtures(p.teamId, 3);
  const goals = stats.goals_scored || 0;
  const assists = stats.assists || 0;
  const bonus = stats.bonus || 0;
  const cleanSheets = stats.clean_sheets || 0;
  const yellow = stats.yellow_cards || 0;
  const red = stats.red_cards || 0;
  const saves = stats.saves || 0;
  const minutes = stats.minutes || 0;
  const defcon = stats.defensive_contribution || 0;
  const totalPts = stats.total_points || 0;
  const goalPts = goals * (p.pos === 'FWD' ? 4 : p.pos === 'MID' ? 5 : 6);
  const assistPts = assists * 3;
  const csPts = cleanSheets ? (p.pos === 'GK' || p.pos === 'DEF' ? 6 : p.pos === 'MID' ? 1 : 0) : 0;
  const bonusPts = bonus;
  const cardPts = yellow * -1 + red * -3;
  const savePts = Math.floor(saves / 3);
  const minutesPts = minutes >= 60 ? 2 : minutes > 0 ? 1 : 0;
  const defconPts = (p.pos === 'DEF' && defcon >= 10) ? 2 : (p.pos === 'MID' && defcon >= 12) ? 2 : 0;
  const otherPts = totalPts - goalPts - assistPts - csPts - bonusPts - cardPts - savePts - minutesPts - defconPts;
  const barData = [
    { label: '⚽ Goals', value: goalPts, cls: 'mint' },
    { label: '👟 Assists', value: assistPts, cls: 'mint' },
    { label: '🅱️ Bonus', value: bonusPts, cls: 'gold' },
    { label: '🛡️ Clean Sheet', value: csPts, cls: 'blue' },
    { label: '⏱️ Minutes', value: minutesPts, cls: 'neutral' },
    { label: '🧤 Saves', value: savePts, cls: 'blue' },
    { label: '🎯 DEFCON', value: defconPts, cls: 'mint' },
  ].filter(b => b.value !== 0);
  const maxBar = Math.max(...barData.map(b => b.value), 1);

  const html = `
    <div class="perf-header">
      ${p.photo ? `<img src="${p.photo}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="perf-header-info">
        <h2>${escapeHtml(p.name)}</h2>
        <div class="perf-team-info">
          <span>${escapeHtml(p.team)}</span>
          <span class="pos-badge" data-pos="${p.pos}">${p.pos}</span>
          <span>${fmt(p.price)}</span>
          <span>${(parseFloat(el2.selected_by_percent) || 0).toFixed(1)}% owned</span>
        </div>
      </div>
    </div>
    <div class="perf-section">
      <div class="perf-section-title">🎯 This GW — ${totalPts} pts</div>
      <div class="perf-breakdown">
        ${goals ? `<div class="perf-line"><span class="perf-stat">⚽ Goals (×${goals})</span><span>${goals} × ${p.pos === 'FWD' ? 4 : p.pos === 'MID' ? 5 : 6}</span><span class="perf-points">+${goalPts}</span></div>` : ''}
        ${assists ? `<div class="perf-line"><span class="perf-stat">👟 Assists (×${assists})</span><span>${assists} × 3</span><span class="perf-points">+${assistPts}</span></div>` : ''}
        ${bonus ? `<div class="perf-line"><span class="perf-stat">🅱️ Bonus Points</span><span>${bonus} BPS</span><span class="perf-points">+${bonusPts}</span></div>` : ''}
        ${cleanSheets ? `<div class="perf-line"><span class="perf-stat">🛡️ Clean Sheet</span><span>${p.pos} bonus</span><span class="perf-points">+${csPts}</span></div>` : ''}
        ${minutesPts ? `<div class="perf-line"><span class="perf-stat">⏱️ Minutes</span><span>${minutes} mins</span><span class="perf-points">+${minutesPts}</span></div>` : ''}
        ${savePts ? `<div class="perf-line"><span class="perf-stat">🧤 Saves</span><span>${saves} saves</span><span class="perf-points">+${savePts}</span></div>` : ''}
        ${defconPts ? `<div class="perf-line"><span class="perf-stat">🎯 DEFCON</span><span>${defcon}</span><span class="perf-points">+${defconPts}</span></div>` : ''}
        ${cardPts < 0 ? `<div class="perf-line dim"><span class="perf-stat">⚠️ Cards</span><span>${yellow}Y ${red}R</span><span class="perf-points">${cardPts}</span></div>` : ''}
        ${otherPts !== 0 ? `<div class="perf-line dim"><span class="perf-stat">🎁 Other</span><span>—</span><span class="perf-points">${otherPts > 0 ? '+' : ''}${otherPts}</span></div>` : ''}
        <div class="perf-total"><span>Total</span><span class="perf-points">${totalPts} pts</span></div>
      </div>
    </div>
    ${barData.length > 1 ? `
      <div class="perf-section">
        <div class="perf-section-title">📊 Contribution Breakdown</div>
        <div class="perf-bar-chart">
          ${barData.map(b => `<div class="perf-bar-row"><span>${b.label}</span><div class="perf-bar-track"><div class="perf-bar-fill ${b.cls}" style="width:${(b.value / maxBar) * 100}%"></div></div><span style="text-align:right;font-weight:800;color:var(--mint)">+${b.value}</span></div>`).join('')}
        </div>
      </div>` : ''}
    <div class="perf-section">
      <div class="perf-section-title">📊 Season Overview</div>
      <div class="perf-info-grid">
        <div class="perf-info-card"><div class="label">Total Pts</div><div class="value">${p.totalPoints}</div></div>
        <div class="perf-info-card"><div class="label">Form</div><div class="value">${(p.form || 0).toFixed(1)}</div></div>
        <div class="perf-info-card"><div class="label">Goals</div><div class="value">${el2.goals_scored || 0}</div></div>
        <div class="perf-info-card"><div class="label">Assists</div><div class="value">${el2.assists || 0}</div></div>
        <div class="perf-info-card"><div class="label">Bonus</div><div class="value">${el2.bonus || 0}</div></div>
        <div class="perf-info-card"><div class="label">Minutes</div><div class="value">${el2.minutes || 0}</div></div>
      </div>
    </div>
    ${nextFixtures.length ? `
      <div class="perf-section">
        <div class="perf-section-title">📅 Next Fixtures</div>
        <div class="perf-fixtures">
          ${nextFixtures.map(f => {
            const isHome = f.team_h === p.teamId;
            const opp = isHome ? f.team_a : f.team_h;
            const diff = isHome ? f.team_h_difficulty : f.team_a_difficulty;
            const oppInfo = getTeamInfo(opp);
            return `<div class="perf-fixture">
              <span class="fixture-gw">GW${f.event}</span>
              <img src="${oppInfo.badge}" onerror="this.style.display='none'">
              <span style="flex:1;font-weight:700">${isHome ? 'vs' : '@'} ${escapeHtml(oppInfo.short)}</span>
              <span class="fixture-diff" data-diff="${diff}">${diff}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    ${p.news ? `<div class="perf-injury-note">⚠️ ${escapeHtml(p.news)}</div>` : ''}
    <div class="modal-actions">
      <button class="btn" onclick="quickTransferOut('${p.id}')">🔄 Transfer Out</button>
      <button class="btn primary" onclick="closeModal('perf-modal')">Close</button>
    </div>
  `;
  document.getElementById('perf-modal-content').innerHTML = html;
  document.getElementById('perf-modal').classList.add('active');
}

function quickTransferOut(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;
  closeModal('perf-modal');
  openPlanModal(null, state.nextGW || state.currentGW + 1);
  setTimeout(() => {
    document.getElementById('pl-out').value = p.name;
    document.getElementById('pl-out-price').value = p.price;
    onOutPlayerChange();
  }, 100);
}

/* ========== AUTOCOMPLETE ========== */
function fillDatalists() {
  const bp = state.bootstrap;
  if (!bp) return;
  const allPlayersDl = document.getElementById('all-players-list');
  const allPlayersDl2 = document.getElementById('all-players-list2');
  const teamMap = {};
  bp.teams.forEach(t => teamMap[t.id] = t.short_name);
  const allOpts = bp.elements.sort((a, b) => b.total_points - a.total_points).slice(0, 300)
    .map(el => `<option value="${escapeHtml(el.web_name)}">${teamMap[el.team] || '?'} · ${fmt(el.now_cost / 10)} · ${POS_MAP[el.element_type]}</option>`).join('');
  if (allPlayersDl) allPlayersDl.innerHTML = allOpts;
  if (allPlayersDl2) allPlayersDl2.innerHTML = allOpts;
  const squadDl = document.getElementById('squad-players-list');
  const captainDl = document.getElementById('captain-options');
  const captainDl2 = document.getElementById('captain-options-2');
  const squadOpts = (state.players || []).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    .map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.team)} · ${fmt(p.price)} · ${p.pos}</option>`).join('');
  const capOpts = (state.players || []).filter(p => !p.bench)
    .map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.team)} · ${p.pos}</option>`).join('');
  if (squadDl) squadDl.innerHTML = squadOpts;
  if (captainDl) captainDl.innerHTML = capOpts;
  if (captainDl2) captainDl2.innerHTML = capOpts;
}
function onOutPlayerChange() {
  const name = document.getElementById('pl-out').value.trim();
  if (!name) return;
  const p = state.players.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (p) {
    document.getElementById('pl-out-price').value = p.price;
    updateBankImpact();
  }
}
function onInPlayerChange() {
  const name = document.getElementById('pl-in').value.trim();
  if (!name) return;
  const bp = state.bootstrap;
  if (!bp) return;
  const el = bp.elements.find(e => e.web_name.toLowerCase() === name.toLowerCase() || e.second_name.toLowerCase() === name.toLowerCase());
  if (el) {
    document.getElementById('pl-in-price').value = (el.now_cost / 10).toFixed(1);
    updateBankImpact();
  }
}
function updateBankImpact() {
  const outP = parseFloat(document.getElementById('pl-out-price').value) || 0;
  const inP = parseFloat(document.getElementById('pl-in-price').value) || 0;
  const impact = document.getElementById('pl-bank-impact');
  if (!impact) return;
  if (!outP && !inP) { impact.style.display = 'none'; return; }
  const newBank = state.bank + outP - inP;
  impact.className = 'plan-bank-impact' + (newBank < 0 ? ' negative' : '');
  impact.innerHTML = `💰 Bank after: <strong>${fmt(newBank)}</strong> ${newBank < 0 ? '⚠️ Not enough funds!' : ''}`;
  impact.style.display = 'block';
}

/* ========== OPTIMIZER ========== */
function optimizeLineup() {
  if (!state.bootstrap || state.players.length !== 15) return toast('Sync first to optimize', true);
  const bp = state.bootstrap;
  const elementsMap = {};
  bp.elements.forEach(e => elementsMap[e.id] = e);
  const scored = state.players.map(p => {
    const el2 = elementsMap[p.fplId];
    const form = el2 ? parseFloat(el2.form) || 0 : 0;
    const pts = el2 ? el2.total_points : 0;
    return { ...p, score: form * 2 + pts / 10 };
  });
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  scored.forEach(p => byPos[p.pos].push(p));
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => b.score - a.score));
  const xi = [byPos.GK[0]];
  byPos.DEF.slice(0, 3).forEach(p => xi.push(p));
  byPos.MID.slice(0, 4).forEach(p => xi.push(p));
  byPos.FWD.slice(0, 3).forEach(p => xi.push(p));
  const usedIds = new Set(xi.map(p => p.id));
  const bench = scored.filter(p => !usedIds.has(p.id)).sort((a, b) => b.score - a.score);
  const sortedXI = [...xi].sort((a, b) => b.score - a.score);
  state.players.forEach(p => {
    p.bench = !usedIds.has(p.id);
    p.captain = p.id === sortedXI[0].id;
    p.vice = p.id === sortedXI[1].id;
  });
  let pos = 1;
  ['GK', 'DEF', 'MID', 'FWD'].forEach(pp => {
    xi.filter(x => x.pos === pp).sort((a, b) => b.score - a.score).forEach(x => {
      const pl = state.players.find(pp2 => pp2.id === x.id);
      if (pl) pl.order = pos++;
    });
  });
  let bp2 = 12;
  bench.forEach(x => {
    const pl = state.players.find(pp2 => pp2.id === x.id);
    if (pl) pl.order = bp2++;
  });
  saveState();
  renderSquad(); renderTeamView();
  toast(`🤖 Optimized — Captain: ${sortedXI[0].name}`);
}

/* ========== MODALS ========== */
let editingPlayerId = null;
let editingPlanId = null;

function openPlayerModal(id = null) {
  editingPlayerId = id;
  fillDatalists();
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
  fillDatalists();
  const title = document.getElementById('plan-modal-title');
  const gwEl = document.getElementById('pl-gw');
  const outEl = document.getElementById('pl-out');
  const outPEl = document.getElementById('pl-out-price');
  const inEl = document.getElementById('pl-in');
  const inPEl = document.getElementById('pl-in-price');
  const chipEl = document.getElementById('pl-chip');
  const capEl = document.getElementById('pl-captain');
  const viceEl = document.getElementById('pl-vice');
  const noteEl = document.getElementById('pl-note');
  const ftEl = document.getElementById('pl-ft-after');
  const delBtn = document.getElementById('pl-delete-btn');
  const bankImpact = document.getElementById('pl-bank-impact');
  const hitWarning = document.getElementById('pl-hit-warning');
  if (bankImpact) bankImpact.style.display = 'none';
  if (hitWarning) hitWarning.style.display = 'none';
  if (id) {
    const p = state.plans.find(x => x.id === id);
    if (p) {
      title.textContent = 'Edit Plan';
      gwEl.value = p.gw;
      outEl.value = p.outName || '';
      outPEl.value = p.outPrice || '';
      inEl.value = p.inName || '';
      inPEl.value = p.inPrice || '';
      chipEl.value = p.chip || '';
      capEl.value = p.captain || '';
      viceEl.value = p.vice || '';
      noteEl.value = p.note || '';
      ftEl.value = p.ftAfter ?? '';
      delBtn.style.display = 'inline-flex';
      const isPast = getGWStatus(p.gw) === 'past';
      [gwEl, outEl, outPEl, inEl, inPEl, chipEl, capEl, viceEl, noteEl, ftEl].forEach(el => el.disabled = isPast);
      if (isPast) toast('Past GW — read-only', false);
    }
  } else {
    title.textContent = 'Add Plan';
    gwEl.value = gw || state.nextGW || state.currentGW || 1;
    outEl.value = ''; outPEl.value = ''; inEl.value = ''; inPEl.value = '';
    chipEl.value = ''; capEl.value = ''; viceEl.value = '';
    noteEl.value = ''; ftEl.value = '';
    delBtn.style.display = 'none';
    [gwEl, outEl, outPEl, inEl, inPEl, chipEl, capEl, viceEl, noteEl, ftEl].forEach(el => el.disabled = false);
  }
  document.getElementById('plan-modal').classList.add('active');
  const gwVal = parseInt(gwEl.value) || 1;
  renderPlanFixtures(gwVal);
  updateBankImpact();
  gwEl.oninput = () => {
    const v = parseInt(gwEl.value) || 1;
    renderPlanFixtures(v);
    const isPast = getGWStatus(v) === 'past';
    [gwEl, outEl, outPEl, inEl, inPEl, chipEl, capEl, viceEl, noteEl, ftEl].forEach(el => el.disabled = isPast);
  };
}
function deletePlanFromModal() {
  if (!editingPlanId) return;
  if (!confirm('Delete this plan?')) return;
  removePlan(editingPlanId);
  closeModal('plan-modal');
}
async function renderPlanFixtures(gw) {
  const preview = document.getElementById('pl-fixtures-preview');
  if (!preview) return;
  preview.innerHTML = '<div class="fixture-loading">⏳ Loading GW' + gw + ' fixtures...</div>';
  const fixtures = await fetchFixturesForGW(gw);
  if (!fixtures.length) { preview.innerHTML = '<div class="fixture-loading">No fixtures available for GW' + gw + '</div>'; return; }
  const sorted = sortFixtures(fixtures);
  const groups = groupFixturesByDay(sorted);
  const myPlayers = myPlayersInFixtures(fixtures);
  const myTeamIds = new Set(myPlayers.map(p => p.teamId));
  let html = `<div class="fixtures-header">📅 GW${gw} Matches</div>`;
  Object.entries(groups).forEach(([day, list]) => {
    html += `<div class="fixture-day-group"><div class="fixture-day-label">${escapeHtml(day)}</div>`;
    list.forEach(f => {
      const home = getTeamInfo(f.team_h);
      const away = getTeamInfo(f.team_a);
      const isMine = myTeamIds.has(f.team_h) || myTeamIds.has(f.team_a);
      html += `<div class="fixture-row ${isMine ? 'mine' : ''}">
        <div class="fixture-team"><img src="${home.badge}" onerror="this.style.display='none'"><span>${escapeHtml(home.short)}</span></div>
        <div class="fixture-vs">${f.finished ? `${f.team_h_score}-${f.team_a_score}` : 'vs'}</div>
        <div class="fixture-team away"><span>${escapeHtml(away.short)}</span><img src="${away.badge}" onerror="this.style.display='none'"></div>
        <div style="display:flex;gap:4px"><span class="fixture-diff" data-diff="${f.team_h_difficulty}">${f.team_h_difficulty}</span><span class="fixture-diff" data-diff="${f.team_a_difficulty}">${f.team_a_difficulty}</span></div>
      </div>`;
    });
    html += `</div>`;
  });
  if (myPlayers.length) {
    html += `<div class="fixtures-header" style="margin-top:14px">👥 Your players this GW</div>`;
    myPlayers.forEach(mp => {
      html += `<div class="fixture-row mine">
        <div class="fixture-team"><span>${escapeHtml(mp.player)}</span></div>
        <div class="fixture-vs">${mp.home ? 'vs' : '@'}</div>
        <div class="fixture-team away"><img src="${mp.opp.badge}" onerror="this.style.display='none'"><span>${escapeHtml(mp.opp.short)}</span></div>
        <span class="fixture-diff" data-diff="${mp.difficulty}">${mp.difficulty}</span>
      </div>`;
    });
  }
  preview.innerHTML = html;
}
function savePlan() {
  const gw = parseInt(document.getElementById('pl-gw').value);
  const outName = document.getElementById('pl-out').value.trim();
  const outPrice = parseFloat(document.getElementById('pl-out-price').value) || 0;
  const inName = document.getElementById('pl-in').value.trim();
  const inPrice = parseFloat(document.getElementById('pl-in-price').value) || 0;
  const chip = document.getElementById('pl-chip').value;
  const captain = document.getElementById('pl-captain').value.trim();
  const vice = document.getElementById('pl-vice').value.trim();
  const note = document.getElementById('pl-note').value.trim();
  const ftAfterRaw = document.getElementById('pl-ft-after').value;
  const ftAfter = ftAfterRaw === '' ? null : parseInt(ftAfterRaw);
  if (!gw || gw < 1 || gw > 38) return toast('GW must be 1-38', true);
  if (getGWStatus(gw) === 'past') return toast('Cannot plan for a past GW', true);
  const sameGWPlans = state.plans.filter(p => p.gw === gw && p.id !== editingPlanId && p.outName && p.inName);
  if (outName && inName && sameGWPlans.length >= state.freeTransfers) {
    const warning = document.getElementById('pl-hit-warning');
    if (warning && warning.style.display === 'none') {
      warning.innerHTML = `⚠️ This may cost <strong>-4 pts</strong> (extra transfer). Click Save again to confirm.`;
      warning.style.display = 'block';
      return;
    }
  }
  const payload = { gw, outName, outPrice, inName, inPrice, chip, captain, vice, note, ftAfter };
  if (editingPlanId) {
    Object.assign(state.plans.find(x => x.id === editingPlanId), payload);
    toast('Plan updated ✏️');
  } else {
    state.plans.push({ id: uid(), ...payload });
    toast('Plan added ✅');
  }
  saveState(); renderAll(); closeModal('plan-modal');
}
function removePlan(id) {
  state.plans = state.plans.filter(p => p.id !== id);
  saveState(); renderAll(); toast('Removed');
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
    return;
  }
  if (document.querySelector('.modal-overlay.active')) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const key = e.key.toLowerCase();
  if (key === 'n') { e.preventDefault(); openPlanModal(); }
  if (key === 's') { e.preventDefault(); syncAll(true); }
  if (key === 'd') { e.preventDefault(); switchView('dashboard', document.querySelector('[data-view="dashboard"]')); }
  if (key === 't') { e.preventDefault(); switchView('team', document.querySelector('[data-view="team"]')); }
  if (key === 'p') { e.preventDefault(); switchView('planner', document.querySelector('[data-view="planner"]')); }
  if (key === 'l') { e.preventDefault(); switchView('leaderboard', document.querySelector('[data-view="leaderboard"]')); }
  if (key === 'h') { e.preventDefault(); switchView('history', document.querySelector('[data-view="history"]')); }
  if (key === 'v') { e.preventDefault(); toggleSquadView(); }
});
function exportData() {
  const data = JSON.stringify({
    teamId, players: state.players, plans: state.plans,
    budget: state.budget, bank: state.bank,
    freeTransfers: state.freeTransfers, managerName: state.managerName,
    plannedTeams: state.plannedTeams || {},
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
  updateSyncDot();
  updateViewToggleButtons();
  setInterval(updateSyncDot, 60000);
});

window.syncAll = syncAll;
window.toggleTheme = toggleTheme;
window.switchView = switchView;
window.pickManager = pickManager;
window.startApp = startApp;
window.logout = logout;
window.showHelp = showHelp;
window.showShortcuts = showShortcuts;
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
window.deletePlanFromModal = deletePlanFromModal;
window.closeModal = closeModal;
window.exportData = exportData;
window.resetAll = resetAll;
window.optimizeLineup = optimizeLineup;
window.renderPlayers = renderPlayers;
window.renderHistory = renderHistory;
window.renderSeasonPlanner = renderSeasonPlanner;
window.toggleAccordion = toggleAccordion;
window.expandAllPlans = expandAllPlans;
window.collapseAllPlans = collapseAllPlans;
window.openPerfModal = openPerfModal;
window.quickTransferOut = quickTransferOut;
window.onOutPlayerChange = onOutPlayerChange;
window.onInPlayerChange = onInPlayerChange;
window.updateBankImpact = updateBankImpact;
window.toggleSquadView = toggleSquadView;
window.renderTeamView = renderTeamView;
window.enterPlanningMode = enterPlanningMode;
window.exitPlanningMode = exitPlanningMode;
window.resetPlanningToCurrent = resetPlanningToCurrent;
window.savePlannedTeam = savePlannedTeam;
window.deletePlannedTeam = deletePlannedTeam;
window.openActionModal = openActionModal;
window.setCaptainFromAction = setCaptainFromAction;
window.setViceFromAction = setViceFromAction;
window.moveToBench = moveToBench;
window.moveToStarters = moveToStarters;
window.openSwapModal = openSwapModal;
window.doSwap = doSwap;
window.transferOutFromAction = transferOutFromAction;
