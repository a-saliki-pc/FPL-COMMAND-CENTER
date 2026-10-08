/* =========================================================
   FPL Command Center v3 — Auto-Sync Edition
   Proxy: https://fplworker.adyb-saliki.workers.dev
   ========================================================= */

const PROXY = 'https://fplworker.adyb-saliki.workers.dev/?url=';

const FAMILY = [
  { id: '1115676', name: 'Adyb Saliki' },
  { id: '3719511', name: 'Yassine Saied' },
  { id: '3844150', name: 'Ismail Saliki' },
  { id: '1115993', name: 'Youssef Said' },
  { id: '6849321', name: 'Zakaria Said' },
];

const POS_MAP = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const FPL_API = 'https://fantasy.premierleague.com/api';

let state = null;
let teamId = null;

/* ========== STORAGE ========== */
function storageKey(id) { return `fpl-cc-v3:${id}`; }
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
  catch (e) { toast('Save failed — storage full', true); }
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

/* ========== PROXY FETCH ========== */
async function fpl(path) {
  const url = PROXY + encodeURIComponent(FPL_API + path);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ========== SYNC ========== */
async function syncAll(showToast = true) {
  if (showToast) toast('🔄 Syncing from FPL...');
  try {
    // 1. Bootstrap (players + events + teams)
    const boot = await fpl('/bootstrap-static/');
    state.bootstrap = {
      elements: boot.elements,
      teams: boot.teams,
      events: boot.events,
    };

    // Find current GW
    const currentGW = boot.events.find(e => e.is_current)?.id
      || boot.events.find(e => e.is_next)?.id
      || 1;
    state.currentGW = currentGW;

    // 2. Fetch every family member's picks + history
    const familyData = [];
    for (const m of FAMILY) {
      try {
        const [picksRes, historyRes, entryRes] = await Promise.all([
          fpl(`/entry/${m.id}/event/${currentGW}/picks/`).catch(() => null),
          fpl(`/entry/${m.id}/history/`).catch(() => null),
          fpl(`/entry/${m.id}/`).catch(() => null),
        ]);
        familyData.push({
          id: m.id,
          name: m.name,
          picks: picksRes,
          history: historyRes,
          entry: entryRes,
        });
      } catch (e) {
        console.warn('Failed to fetch for', m.name, e);
        familyData.push({ id: m.id, name: m.name, picks: null, history: null, entry: null });
      }
    }
    state.familyData = familyData;

    // 3. Load MY squad from my family data
    const mine = familyData.find(f => f.id === teamId);
    if (mine && mine.picks && mine.picks.picks) {
      mergeMySquad(mine.picks);
    }

    state.lastSync = Date.now();
    saveState();
    renderAll();
    if (showToast) toast('✅ Synced! All 5 managers loaded');
  } catch (e) {
    console.error(e);
    if (showToast) toast('Sync failed: ' + e.message, true);
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
      captain: p.is_captain,
      vice: p.is_vice_captain,
      multiplier: p.multiplier,
      bench: p.position > 11,
      order: p.position,
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
      ${escapeHtml(m.name)}<small>Team ID ${m.id}</small>
    </button>
  `).join('');
}

let pickedId = null;
function pickManager(id, el) {
  pickedId = id;
  document.querySelectorAll('.manager-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('welcome-team-id').value = id;
}

function startApp() {
  const id = (pickedId || document.getElementById('welcome-team-id').value.trim());
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
  window.scrollTo(0, 0);

  // Auto-sync if data is stale (>30min old) or missing
  const stale = !state.lastSync || (Date.now() - state.lastSync > 30 * 60 * 1000);
  if (stale) {
    setTimeout(() => syncAll(true), 500);
  }
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
  el.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const v = document.getElementById('view-' + name);
  if (v) v.style.display = 'block';
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'history') renderHistory();
  if (name === 'players') renderPlayers();
}

function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  const target = document.getElementById('tab-' + name);
  if (target) target.style.display = 'block';
}

/* ========== RENDER ALL ========== */
function renderAll() {
  renderHeader();
  renderSquad();
  renderStats();
  renderTimeline();
  renderPlans();
  renderLeaderboard();
  renderHistory();
  renderPlayers();
}

function renderHeader() {
  const squadValue = state.players.reduce((s, p) => s + Number(p.price || 0), 0);
  document.getElementById('hdr-manager').textContent = state.managerName || '—';
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
  document.getElementById('stat-gws').textContent = state.plans.length;
  const transfers = state.plans.filter(p => p.outName && p.inName).length;
  document.getElementById('stat-hits').textContent = '0';
  document.getElementById('stat-hits-sub').textContent = transfers ? transfers + ' planned transfer(s)' : 'No hits taken';
  const chipsUsed = state.plans.filter(p => p.chip).length;
  document.getElementById('stat-chips').textContent = chipsUsed + '/4';
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

/* ========== LEADERBOARD ========== */
function renderLeaderboard() {
  const card = document.getElementById('leaderboard-card');
  const glance = document.getElementById('weekly-glance');
  if (!card) return;

  if (!state.familyData || state.familyData.length === 0) {
    card.innerHTML = '<div class="empty"><span class="emoji">🏆</span>Click <strong>🔄 Sync All</strong> on the Dashboard to load standings</div>';
    if (glance) glance.innerHTML = '<div class="empty"><span class="emoji">📅</span>Sync to see stats</div>';
    return;
  }

  // Build leaderboard from history (total points)
  const rows = state.familyData.map(m => {
    const totalPts = m.history?.current?.[0]?.total_points || 0;
    const overallRank = m.history?.current?.[0]?.overall_rank || 0;
    const gwPoints = m.history?.current?.[0]?.points || 0;
    const teamName = m.entry?.name || m.name;
    return { ...m, totalPts, overallRank, gwPoints, teamName };
  }).sort((a, b) => b.totalPts - a.totalPts);

  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);

  card.innerHTML = rows.map((r, i) => `
    <div class="lb-row ${r.id === teamId ? 'me' : ''}">
      <div class="lb-rank ${rankClass(i)}">${medal(i)}</div>
      <div>
        <div class="lb-name">${escapeHtml(r.name)} ${r.id === teamId ? '<span style="color:var(--mint);font-size:0.7rem">(YOU)</span>' : ''}</div>
        <div class="lb-teamname">${escapeHtml(r.teamName)}</div>
      </div>
      <div class="lb-stat">${r.totalPts}<small>Total</small></div>
      <div class="lb-stat">${r.gwPoints}<small>This GW</small></div>
      <div class="lb-stat">${r.overallRank ? '#' + r.overallRank.toLocaleString() : '—'}<small>Rank</small></div>
    </div>
  `).join('');

  // Weekly glance
  if (glance) {
    const bestGW = [...rows].sort((a,b) => b.gwPoints - a.gwPoints)[0];
    const worstGW = [...rows].sort((a,b) => a.gwPoints - b.gwPoints)[0];
    const avg = Math.round(rows.reduce((s, r) => s + r.gwPoints, 0) / rows.length);
    const leader = rows[0];
    glance.innerHTML = `
      <div class="glance-grid">
        <div class="glance-card">
          <div class="label">🏆 Leader</div>
          <div class="value">${leader.totalPts}</div>
          <div class="sub">${escapeHtml(leader.name)}</div>
        </div>
        <div class="glance-card">
          <div class="label">⚡ Best This GW</div>
          <div class="value">${bestGW.gwPoints}</div>
          <div class="sub">${escapeHtml(bestGW.name)}</div>
        </div>
        <div class="glance-card">
          <div class="label">📊 Family Average</div>
          <div class="value">${avg}</div>
          <div class="sub">points this GW</div>
        </div>
        <div class="glance-card">
          <div class="label">😅 Worst This GW</div>
          <div class="value">${worstGW.gwPoints}</div>
          <div class="sub">${escapeHtml(worstGW.name)}</div>
        </div>
      </div>
    `;
  }
}

/* ========== HISTORY ========== */
function renderHistory() {
  const mine = state.familyData?.find(f => f.id === teamId);
  if (!mine || !mine.history || !mine.history.current) {
    document.getElementById('chart-points').innerHTML = '<div class="empty"><span class="emoji">📈</span>Sync to see your chart</div>';
    document.getElementById('chart-rank').innerHTML = '<div class="empty"><span class="emoji">🏅</span>Sync to see your rank</div>';
    document.querySelector('#gw-table tbody').innerHTML = '';
    return;
  }

  const gws = mine.history.current;

  // Points bar chart
  const maxPts = Math.max(...gws.map(g => g.points), 1);
  document.getElementById('chart-points').innerHTML = `
    <div class="chart-bars">
      ${gws.map(g => `
        <div class="chart-bar" style="height:${(g.points / maxPts) * 180}px" title="GW${g.event}: ${g.points} pts">
          <div class="bar-value">${g.points}</div>
          <div class="bar-label">${g.event}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Rank chart (line via inline SVG)
  const ranks = gws.map(g => g.overall_rank).filter(r => r > 0);
  if (ranks.length > 1) {
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const w = 900;
    const h = 200;
    const step = w / (ranks.length - 1);
    const points = ranks.map((r, i) => {
      const x = i * step;
      const y = ((r - minRank) / (maxRank - minRank || 1)) * (h - 40) + 20;
      return `${x},${y}`;
    }).join(' ');
    document.getElementById('chart-rank').innerHTML = `
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
            return `<circle cx="${x}" cy="${y}" r="3" fill="#00ff87"><title>GW${gws[i].event}: #${r.toLocaleString()}</title></circle>`;
          }).join('')}
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--muted);padding:4px 8px">
          <span>Best: #${minRank.toLocaleString()}</span>
          <span>Worst: #${maxRank.toLocaleString()}</span>
        </div>
      </div>
    `;
  } else {
    document.getElementById('chart-rank').innerHTML = '<div class="empty">Not enough data yet</div>';
  }

  // GW table
  document.querySelector('#gw-table tbody').innerHTML = gws.map(g => `
    <tr>
      <td>GW${g.event}</td>
      <td>${g.points}</td>
      <td>#${g.overall_rank?.toLocaleString() || '—'}</td>
      <td>${fmt((g.bank || 0) / 10)}</td>
      <td>${fmt((g.value || 0) / 10)}</td>
      <td>${g.event_transfers || 0}${g.event_transfers_cost ? ' (-' + g.event_transfers_cost + ')' : ''}</td>
    </tr>
  `).reverse().join('');
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

  grid.innerHTML = list.map(p => {
    const posClass = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' }[p.pos];
    const statusWarn = p.status !== 'a' ? '⚠️ ' : '';
    return `<div class="player-result">
      <div class="name">
        <span>${statusWarn}${escapeHtml(p.name)}</span>
        <span class="pos-badge" data-pos="${posClass}">${p.pos}</span>
      </div>
      <div class="meta">
        <span class="price-tag">${fmt(p.price)}</span>
        <span>· ${escapeHtml(p.team)}</span>
      </div>
      <div class="stat-line"><span>Points</span><strong>${p.points}</strong></div>
      <div class="stat-line"><span>Form</span><strong>${p.form.toFixed(1)}</strong></div>
      <div class="stat-line"><span>Owned</span><strong>${p.ownership.toFixed(1)}%</strong></div>
    </div>`;
  }).join('');

  if (list.length === 0) grid.innerHTML = '<div class="empty">No players found</div>';
}

/* ========== OPTIMIZER ========== */
function optimizeLineup() {
  if (!state.bootstrap || state.players.length !== 15) {
    return toast('Sync first to optimize', true);
  }
  const bp = state.bootstrap;
  const elementsMap = {};
  bp.elements.forEach(e => elementsMap[e.id] = e);

  // Calculate score per player: form * 2 + points/10
  const scored = state.players.map(p => {
    const el = elementsMap[p.fplId];
    const form = el ? parseFloat(el.form) || 0 : 0;
    const pts = el ? el.total_points : 0;
    const score = form * 2 + pts / 10;
    return { ...p, score, form, pts };
  });

  // Group by position
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  scored.forEach(p => byPos[p.pos].push(p));
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => b.score - a.score));

  // Build best XI: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD
  const xi = [];
  xi.push(byPos.GK[0]);
  byPos.DEF.slice(0, 3).forEach(p => xi.push(p));
  byPos.MID.slice(0, 4).forEach(p => xi.push(p));
  byPos.FWD.slice(0, 3).forEach(p => xi.push(p));

  // Check formation: if 3-4-3 → OK, need at least 1 GK + 3 DEF + 2 MID + 1 FWD = 7, XI = 11
  // Fill remaining 0 by upgrading from bench with best balance
  // (Simplified: use 3-4-3, then swap in top bench if better)
  const usedIds = new Set(xi.map(p => p.id));
  const bench = scored.filter(p => !usedIds.has(p.id)).sort((a, b) => b.score - a.score);

  // Captain
  const sortedXI = [...xi].sort((a, b) => b.score - a.score);
  const captain = sortedXI[0];
  const vice = sortedXI[1];

  // Update state
  state.players.forEach(p => {
    p.bench = !usedIds.has(p.id);
    p.captain = p.id === captain.id;
    p.vice = p.id === vice.id;
    p.order = p.bench ? 99 : 0;
  });

  // Re-order XI by position
  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  let pos = 1;
  ['GK', 'DEF', 'MID', 'FWD'].forEach(p => {
    xi.filter(x => x.pos === p).sort((a, b) => b.score - a.score).forEach(x => {
      const pl = state.players.find(pp => pp.id === x.id);
      if (pl) pl.order = pos++;
    });
  });
  let benchPos = 12;
  bench.forEach(x => {
    const pl = state.players.find(pp => pp.id === x.id);
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
    state.players.push({ id: uid(), name, pos, price, team, captain: false, multiplier: 0, bench: true, order: 99 });
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

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
});

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
});

// Expose syncAll globally for buttons
window.syncAll = syncAll;
