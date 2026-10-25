// App shell: routing + view rendering.
const root = document.getElementById('view-root');
const tabbarEl = document.getElementById('tabbar');
const modeSwitchEl = document.getElementById('mode-switch');

const TAB_ICONS = {
  log: 'M12 5v14M5 12h14',
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  prs: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  graphs: 'M3 17l5-6 4 3 8-9M3 21h18',
  history: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const TABS = {
  lifting: [
    { id: 'log', label: 'Log', icon: TAB_ICONS.log },
    { id: 'dashboard', label: 'Dashboard', icon: TAB_ICONS.dashboard },
    { id: 'prs', label: 'PRs', icon: TAB_ICONS.prs },
    { id: 'graphs', label: 'Graphs', icon: TAB_ICONS.graphs },
    { id: 'history', label: 'History', icon: TAB_ICONS.history },
  ],
  nutrition: [
    { id: 'food-log', label: 'Log', icon: TAB_ICONS.log },
    { id: 'food-dashboard', label: 'Dashboard', icon: TAB_ICONS.dashboard },
    { id: 'food-graphs', label: 'Graphs', icon: TAB_ICONS.graphs },
    { id: 'food-history', label: 'History', icon: TAB_ICONS.history },
  ],
};

const state = {
  mode: 'lifting',
  view: 'log',
  viewBeforeSettings: null,
  allSets: [],
  allPRs: [],
  allFoodLog: [],
  allCustomFoods: [],
  log: {
    lift: 'squat',
    date: new Date().toISOString().slice(0, 10),
    editingId: null,
  },
  pr: {
    lift: 'squat',
    date: new Date().toISOString().slice(0, 10),
    editingId: null,
  },
  graphs: {
    lift: 'squat',
    period: 'day',
    series: ['topWeight'],
  },
  history: {
    liftFilter: 'all',
  },
  foodLog: {
    date: new Date().toISOString().slice(0, 10),
    editingId: null,
  },
  foodGraphs: {
    period: 'day',
    series: ['kcal', 'protein'],
  },
  foodHistory: {},
};

function fmt(n) {
  return Math.round(n * 10) / 10;
}

function liftLabel(id) {
  return LIFTS.find((l) => l.id === id)?.label || id;
}

function csvEscape(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One combined CSV (lifting sets/PRs + nutrition log, tagged by type) for
// viewing/sharing — not meant for re-import; JSON export/import remains the
// full-fidelity backup path. Inapplicable columns per row type are left blank.
function buildCSV() {
  const header = ['type', 'date', 'lift_or_food', 'weight', 'reps', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'notes'];
  const rows = [
    ...state.allSets.map((s) => ['set', s.date, liftLabel(s.lift), s.weight, s.reps, '', '', '', '', '', s.notes || '']),
    ...state.allPRs.map((p) => ['pr', p.date, liftLabel(p.lift), p.weight, p.reps, '', '', '', '', '', p.notes || '']),
    ...state.allFoodLog.map((e) => [
      'food',
      e.date,
      e.name,
      '',
      '',
      e.grams ?? '',
      e.kcal ?? '',
      e.protein ?? '',
      e.carbs ?? '',
      e.fat ?? '',
      e.notes || '',
    ]),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Groups a list of {date,...} items into [date, items[]] pairs, preserving
// the input's date ordering (callers pass already-sorted arrays).
function groupByDate(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
  }
  return [...map.entries()];
}

function formatDayLabel(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function allFoods() {
  return [...FOODS_DATA, ...state.allCustomFoods];
}

function findFoodMatch(name) {
  const lower = (name || '').trim().toLowerCase();
  if (!lower) return null;
  const foods = allFoods();
  return foods.find((f) => f.name.toLowerCase() === lower) || foods.find((f) => f.name.toLowerCase().includes(lower));
}

function foodMacroMeta(e) {
  if (e.kcal == null && e.protein == null && e.carbs == null && e.fat == null) return 'No macros recorded';
  const parts = [e.kcal != null ? `${fmt(e.kcal)} kcal` : null];
  if (e.protein != null) parts.push(`P${fmt(e.protein)}`);
  if (e.carbs != null) parts.push(`C${fmt(e.carbs)}`);
  if (e.fat != null) parts.push(`F${fmt(e.fat)}`);
  return parts.filter(Boolean).join(' · ');
}

// Stacked card row for a logged set / PR — replaces a table row so Edit/Delete
// stay full 44pt tap targets and text doesn't get crushed on a phone-width screen.
function setRowHTML({ primary, meta, notes, editAttr, deleteAttr, isTopSet }) {
  return `
    <div class="set-row">
      <div class="set-row-info">
        <span class="set-row-weight">${primary}${isTopSet ? ' <span class="top-set-badge">TOP</span>' : ''}</span>
        <span class="set-row-meta">${meta}</span>
        ${notes ? `<span class="set-row-notes">${escapeHtml(notes)}</span>` : ''}
      </div>
      <div class="set-row-actions">
        <button class="link" ${editAttr}>Edit</button>
        <button class="icon-delete-btn" ${deleteAttr} aria-label="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
      </div>
    </div>`;
}

async function reload() {
  state.allSets = await DB.getAll();
  state.allPRs = await DB.getAllPRs();
  state.allFoodLog = await DB.getAllFoodLog();
  state.allCustomFoods = await DB.getAllCustomFoods();
}

function renderTabBar() {
  const tabs = TABS[state.mode];
  tabbarEl.innerHTML = tabs
    .map((t) => {
      const active = t.id === state.view;
      return `<button class="tab-btn ${active ? 'active' : ''}" data-view="${t.id}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${active ? 2.4 : 1.9}" stroke-linecap="round" stroke-linejoin="round"><path d="${t.icon}"></path></svg>
        ${t.label}
      </button>`;
    })
    .join('');
  tabbarEl.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
}

function setMode(mode) {
  state.mode = mode;
  setView(TABS[mode][0].id);
}

function setView(view) {
  state.view = view;
  modeSwitchEl.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
  document.getElementById('mode-thumb').classList.toggle('right', state.mode === 'nutrition');
  renderTabBar();
  render();
}

modeSwitchEl.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

// Theme toggle — explicit choice (localStorage) always wins over OS
// preference; icon shows the theme tapping it would switch TO (sun while
// dark is active, moon while light is active). index.html applies a saved
// choice before first paint to avoid a flash of the wrong theme.
const themeBtn = document.getElementById('theme-btn');
const SUN_PATH =
  'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
const MOON_PATH = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z';

function effectiveTheme() {
  const saved = localStorage.getItem('gainz-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeIcon() {
  const path = effectiveTheme() === 'dark' ? SUN_PATH : MOON_PATH;
  themeBtn.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
}

themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('gainz-theme', next);
  document.documentElement.setAttribute('data-theme', next);
  updateThemeIcon();
});

updateThemeIcon();

document.getElementById('settings-btn').addEventListener('click', () => {
  if (state.view === 'settings') {
    setView(state.viewBeforeSettings || TABS[state.mode][0].id);
  } else {
    state.viewBeforeSettings = state.view;
    state.view = 'settings';
    render();
  }
});

// isError gives a longer-lived, red-tinted toast — non-blocking (unlike
// alert()), which also means it can't freeze the page on a native dialog.
function showToast(msg, isError) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('toast-error', !!isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), isError ? 4000 : 1600);
}

// ---------- Log view ----------

function renderLog() {
  const { lift, date, editingId } = state.log;
  const todaysSets = state.allSets.filter((s) => s.lift === lift && s.date === date);

  root.innerHTML = `
    <h2>${editingId ? 'Edit set' : 'Log a set'}</h2>
    <div class="card">
      <form class="log-form" id="log-form">
        <div class="field">
          <label for="f-lift">Lift</label>
          <select id="f-lift">
            ${LIFTS.map((l) => `<option value="${l.id}" ${l.id === lift ? 'selected' : ''}>${l.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-date">Date</label>
          <input type="date" id="f-date" value="${date}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="f-weight">Weight (kg)</label>
            <input type="number" id="f-weight" step="0.5" min="0" inputmode="decimal" required />
          </div>
          <div class="field">
            <label for="f-reps">Reps</label>
            <input type="number" id="f-reps" step="1" min="1" inputmode="numeric" required />
          </div>
        </div>
        <label class="top-toggle">
          <input type="checkbox" id="f-top-set" />
          <span class="top-toggle-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg></span>
          Top set
          <span class="top-toggle-hint">counts toward PR &amp; 1RM</span>
        </label>
        <div class="field">
          <label for="f-notes">Notes (optional)</label>
          <input type="text" id="f-notes" placeholder="e.g. RPE 8, belt" />
        </div>
        <button type="submit" class="primary">${editingId ? 'Save changes' : 'Add set'}</button>
        ${editingId ? '<button type="button" class="secondary" id="cancel-edit">Cancel edit</button>' : ''}
      </form>
    </div>

    <h2>${liftLabel(lift)} — ${date}</h2>
    <div class="card">
      ${
        todaysSets.length === 0
          ? '<div class="empty-state">No sets logged yet for this lift/date.</div>'
          : `<div class="set-list">${todaysSets
              .map((s, i) =>
                setRowHTML({
                  primary: `${s.weight}kg × ${s.reps}`,
                  meta: `Set ${i + 1}`,
                  notes: s.notes,
                  editAttr: `data-edit="${s.id}"`,
                  deleteAttr: `data-delete="${s.id}"`,
                  isTopSet: s.isTopSet,
                })
              )
              .join('')}</div>`
      }
    </div>
  `;

  document.getElementById('f-lift').addEventListener('change', (e) => {
    state.log.lift = e.target.value;
    render();
  });
  document.getElementById('f-date').addEventListener('change', (e) => {
    state.log.date = e.target.value;
    render();
  });

  document.getElementById('log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weight = document.getElementById('f-weight').value;
    const reps = document.getElementById('f-reps').value;
    const notes = document.getElementById('f-notes').value;
    const isTopSet = document.getElementById('f-top-set').checked;
    const curLift = document.getElementById('f-lift').value;
    const curDate = document.getElementById('f-date').value;

    if (state.log.editingId) {
      const existing = state.allSets.find((s) => s.id === state.log.editingId);
      await DB.updateSet({ ...existing, lift: curLift, date: curDate, weight: Number(weight), reps: Number(reps), notes, isTopSet });
      state.log.editingId = null;
      showToast('Set updated');
    } else {
      await DB.addSet({ lift: curLift, date: curDate, weight, reps, notes, isTopSet });
      showToast('Set added');
    }
    state.log.lift = curLift;
    state.log.date = curDate;
    await reload();
    render();
  });

  const cancelBtn = document.getElementById('cancel-edit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.log.editingId = null;
      render();
    });
  }

  root.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const s = state.allSets.find((x) => x.id === btn.dataset.edit);
      state.log.editingId = s.id;
      state.log.lift = s.lift;
      state.log.date = s.date;
      render();
      document.getElementById('f-weight').value = s.weight;
      document.getElementById('f-reps').value = s.reps;
      document.getElementById('f-notes').value = s.notes || '';
      document.getElementById('f-top-set').checked = !!s.isTopSet;
    })
  );

  root.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this set?')) return;
      await DB.deleteSet(btn.dataset.delete);
      await reload();
      render();
    })
  );
}

// ---------- Dashboard view ----------

const STAR_PATH = 'M12 2l3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9z';

const LIFT_HUES = { squat: 255, bench: 200, deadlift: 300, ohp: 150 };

function sparklineSVG(values, color) {
  if (values.length < 2) return '<div style="height:34px"></div>';
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  const pts = values.map((v, i) => [4 + i * (112 / (values.length - 1)), 30 - 26 * ((v - mn) / range)]);
  const points = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  const c = color || 'var(--accent-bright)';
  return `<svg class="sparkline" viewBox="0 0 120 34" width="100%" height="34">
    <polyline points="${points}" fill="none" style="stroke:${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <circle cx="${lx}" cy="${ly}" r="3.4" style="fill:${c};stroke:var(--surface)" stroke-width="2"></circle>
  </svg>`;
}

function renderDashboard() {
  root.innerHTML = `
    <h2>Dashboard</h2>
    <div class="lift-grid">
      ${LIFTS.map((l) => {
        const sets = state.allSets.filter((s) => s.lift === l.id);
        const prs = state.allPRs.filter((p) => p.lift === l.id);
        // Current working weight comes from the training log only (most recent
        // session). PR stats are drawn from training sets + manually-recorded
        // PRs combined, since a recorded PR is a real/estimated max regardless
        // of whether it was logged as part of regular training.
        const allTimeBest = [...sets, ...prs];
        if (sets.length === 0 && prs.length === 0) {
          return `<div class="card lift-card"><div class="lift-card-label">${l.label}</div><div class="empty-state">No data yet</div></div>`;
        }
        const current = Stats.current(sets);
        const { best } = Stats.actualPRs(allTimeBest);
        const last4 = sets.slice(-4).map((s) => s.weight);
        const delta = last4.length >= 2 ? last4[last4.length - 1] - last4[0] : 0;
        const hue = LIFT_HUES[l.id];
        const color = `oklch(0.72 0.15 ${hue})`;
        const tint = `oklch(0.7 0.14 ${hue} / 0.14)`;
        return `
          <div class="card lift-card" style="background-image:linear-gradient(160deg,${tint},transparent 60%)">
            <div class="lift-card-top">
              <span class="lift-card-label">${l.label}</span>
              <span class="delta-badge ${delta > 0 ? 'pos' : 'flat'}">${delta >= 0 ? '+' : ''}${fmt(delta)}kg</span>
            </div>
            <div>
              <div class="lift-card-figure">${current ? fmt(current.weight) : '—'}<span class="unit">kg</span></div>
              <div class="lift-card-sub">working weight</div>
            </div>
            ${sparklineSVG(last4, color)}
            <div class="lift-card-range"><span>last 4 sessions</span><span>${last4.length ? `${fmt(last4[0])} → ${fmt(last4[last4.length - 1])}` : '—'}</span></div>
            <div class="lift-card-footer">
              <div>
                <div class="stat-mini-label"><span class="pr-star"><svg width="11" height="11" viewBox="0 0 24 24" style="fill:var(--gold)"><path d="${STAR_PATH}"></path></svg></span>PR</div>
                <div class="stat-mini-value">${best.weight}kg</div>
              </div>
              <div>
                <div class="stat-mini-label">at reps</div>
                <div class="stat-mini-value">${best.reps}</div>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// ---------- Graphs view ----------

function renderGraphs() {
  const { lift, period, series } = state.graphs;
  const sets = state.allSets.filter((s) => s.lift === lift);
  const prs = state.allPRs.filter((p) => p.lift === lift);
  // % of PR and the chart's PR reference line must use only what's deliberately
  // recorded in the PRs tab — not whatever happens to be the heaviest training
  // entry ever logged (a one-off heavy single isn't a "PR" until you record it).
  const referencePR = Stats.actualPRs(prs).best?.weight;

  // Latest-value + delta header above the chart, shown only when exactly one
  // metric is active (unambiguous to summarize; skipped when overlaying more).
  let chartHeaderHTML = '';
  if (series.length === 1) {
    const buckets = Stats.series(sets, period, referencePR);
    if (buckets.length > 0) {
      const key = series[0];
      const def = SERIES_DEFS[key];
      const vals = buckets.map((d) => d[key]);
      const latest = vals[vals.length - 1];
      const delta = vals.length >= 2 ? latest - vals[0] : 0;
      const unit = key === 'pctPR' ? '%' : 'kg';
      chartHeaderHTML = `
        <div class="chart-header">
          <div><div class="chart-header-title">${def.label}</div><div class="chart-header-value">${fmt(latest)}${unit}</div></div>
          <span class="delta-badge ${delta > 0 ? 'pos' : 'flat'}">${delta >= 0 ? '+' : ''}${fmt(delta)}${unit}</span>
        </div>`;
    }
  }

  root.innerHTML = `
    <h2>Graphs</h2>
    <div class="chip-row">
      ${LIFTS.map((l) => `<button class="chip ${l.id === lift ? 'active' : ''}" data-lift="${l.id}">${l.label}</button>`).join('')}
    </div>
    <div class="segmented">
      <button data-period="day" class="${period === 'day' ? 'active' : ''}">Daily</button>
      <button data-period="week" class="${period === 'week' ? 'active' : ''}">Weekly</button>
      <button data-period="month" class="${period === 'month' ? 'active' : ''}">Monthly</button>
    </div>
    <div class="chip-row">
      <button class="chip ${series.includes('topWeight') ? 'active' : ''}" data-series="topWeight">Top set</button>
      <button class="chip ${series.includes('workingWeight') ? 'active' : ''}" data-series="workingWeight">Working set</button>
      <button class="chip ${series.includes('volume') ? 'active' : ''}" data-series="volume">Volume</button>
      <button class="chip ${series.includes('pctPR') ? 'active' : ''}" data-series="pctPR" ${referencePR ? '' : 'disabled title="Record a PR first"'}>% of PR</button>
    </div>
    <div class="chart-wrap">
      ${chartHeaderHTML}
      <div class="chart-canvas-box">
        ${sets.length === 0 && prs.length === 0 ? '<div class="empty-state">No data yet for this lift.</div>' : '<canvas id="chart-canvas"></canvas>'}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-lift]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.graphs.lift = btn.dataset.lift;
      render();
    })
  );
  root.querySelectorAll('[data-period]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.graphs.period = btn.dataset.period;
      render();
    })
  );
  root.querySelectorAll('[data-series]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.series;
      const idx = state.graphs.series.indexOf(key);
      if (idx >= 0) {
        if (state.graphs.series.length > 1) state.graphs.series.splice(idx, 1);
      } else {
        state.graphs.series.push(key);
      }
      render();
    })
  );

  if (sets.length > 0 || prs.length > 0) {
    const canvas = document.getElementById('chart-canvas');
    renderChart(canvas, sets, prs, period, series, referencePR);
  }
}

// ---------- History view ----------

function renderHistory() {
  const { liftFilter } = state.history;
  const sets = (liftFilter === 'all' ? state.allSets : state.allSets.filter((s) => s.lift === liftFilter))
    .slice()
    .reverse();

  root.innerHTML = `
    <h2>History</h2>
    <div class="chip-row">
      <button class="chip ${liftFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
      ${LIFTS.map((l) => `<button class="chip ${liftFilter === l.id ? 'active' : ''}" data-filter="${l.id}">${l.label}</button>`).join('')}
    </div>
    ${
      sets.length === 0
        ? '<div class="card"><div class="empty-state">No sets logged yet.</div></div>'
        : groupByDate(sets)
            .map(
              ([date, dayItems]) => `
          <div class="history-day">
            <div class="history-day-header"><span>${formatDayLabel(date)}</span><span>${dayItems.length} set${dayItems.length === 1 ? '' : 's'}</span></div>
            <div class="set-list">${dayItems
              .map((s) =>
                setRowHTML({
                  primary: `${s.weight}kg × ${s.reps}`,
                  meta: liftLabel(s.lift),
                  notes: s.notes,
                  editAttr: `data-edit="${s.id}"`,
                  deleteAttr: `data-delete="${s.id}"`,
                  isTopSet: s.isTopSet,
                })
              )
              .join('')}</div>
          </div>`
            )
            .join('')
    }

    <h2>Backup</h2>
    <div class="card">
      <div class="settings-row">
        <button class="secondary" id="export-btn">Export JSON</button>
        <button class="secondary" id="import-btn">Import JSON</button>
        <input type="file" id="import-file" accept="application/json" style="display:none" />
      </div>
      <div class="settings-row">
        <button class="secondary" id="export-csv-btn">Export CSV</button>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-filter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.history.liftFilter = btn.dataset.filter;
      render();
    })
  );

  root.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const s = state.allSets.find((x) => x.id === btn.dataset.edit);
      state.log.editingId = s.id;
      state.log.lift = s.lift;
      state.log.date = s.date;
      setView('log');
      document.getElementById('f-weight').value = s.weight;
      document.getElementById('f-reps').value = s.reps;
      document.getElementById('f-notes').value = s.notes || '';
      document.getElementById('f-top-set').checked = !!s.isTopSet;
    })
  );

  root.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this set?')) return;
      await DB.deleteSet(btn.dataset.delete);
      await reload();
      render();
    })
  );

  document.getElementById('export-btn').addEventListener('click', () => {
    const payload = {
      sets: state.allSets,
      prs: state.allPRs,
      foodLog: state.allFoodLog,
      customFoods: state.allCustomFoods,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gainz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const blob = new Blob([buildCSV()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gainz-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      const sets = Array.isArray(payload) ? payload : payload.sets; // back-compat with v1 exports (plain array)
      const prs = Array.isArray(payload) ? [] : payload.prs || [];
      const foodLog = Array.isArray(payload) ? [] : payload.foodLog || [];
      const customFoods = Array.isArray(payload) ? [] : payload.customFoods || [];
      if (!Array.isArray(sets)) throw new Error('missing sets array');
      if (!confirm(`Import ${sets.length} sets, ${prs.length} PRs, ${foodLog.length} food entries? This replaces all current data.`)) return;
      await DB.replaceAll(sets);
      await DB.replaceAllPRs(prs);
      await DB.replaceAllFoodLog(foodLog);
      await DB.replaceAllCustomFoods(customFoods);
      await reload();
      showToast('Import complete');
      render();
    } catch (err) {
      showToast('Invalid backup file: ' + err.message, true);
    }
  });
}

// ---------- PRs view ----------

function renderPRs() {
  const { lift, date, editingId } = state.pr;
  const liftPRs = state.allPRs.filter((p) => p.lift === lift).slice().reverse();

  root.innerHTML = `
    <h2>${editingId ? 'Edit PR' : 'Record a PR'}</h2>
    <div class="card">
      <form class="log-form" id="pr-form">
        <div class="field">
          <label for="pr-lift">Lift</label>
          <select id="pr-lift">
            ${LIFTS.map((l) => `<option value="${l.id}" ${l.id === lift ? 'selected' : ''}>${l.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="pr-date">Date achieved</label>
          <input type="date" id="pr-date" value="${date}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="pr-weight">Weight (kg)</label>
            <input type="number" id="pr-weight" step="0.5" min="0" inputmode="decimal" required />
          </div>
          <div class="field">
            <label for="pr-reps">Reps</label>
            <input type="number" id="pr-reps" step="1" min="1" inputmode="numeric" required />
          </div>
        </div>
        <div class="field">
          <label for="pr-notes">Notes (optional)</label>
          <input type="text" id="pr-notes" placeholder="e.g. meet lift, gym PR" />
        </div>
        <button type="submit" class="primary">${editingId ? 'Save changes' : 'Save PR'}</button>
        ${editingId ? '<button type="button" class="secondary" id="pr-cancel-edit">Cancel edit</button>' : ''}
      </form>
    </div>

    <h2>${liftLabel(lift)} — recorded PRs</h2>
    ${
      liftPRs.length === 0
        ? '<div class="card"><div class="empty-state">No PRs recorded yet for this lift.</div></div>'
        : liftPRs
            .map(
              (p) => `
          <div class="card pr-card">
            <div class="pr-card-top">
              <span class="pr-card-name"><span class="pr-star"><svg width="14" height="14" viewBox="0 0 24 24" style="fill:var(--gold)"><path d="${STAR_PATH}"></path></svg></span>${p.weight}kg × ${p.reps}</span>
              <span class="pr-card-date">${p.date}</span>
            </div>
            <div class="pr-stat-grid">
              <div class="pr-stat"><div class="pr-stat-label">Weight</div><div class="pr-stat-value">${p.weight}kg</div></div>
              <div class="pr-stat"><div class="pr-stat-label">Reps</div><div class="pr-stat-value">${p.reps}</div></div>
            </div>
            ${p.notes ? `<div class="set-row-notes" style="margin-top:10px">${escapeHtml(p.notes)}</div>` : ''}
            <div class="set-row-actions" style="justify-content:flex-end;margin-top:8px">
              <button class="link" data-pr-edit="${p.id}">Edit</button>
              <button class="icon-delete-btn" data-pr-delete="${p.id}" aria-label="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
            </div>
          </div>`
            )
            .join('')
    }
  `;

  document.getElementById('pr-lift').addEventListener('change', (e) => {
    state.pr.lift = e.target.value;
    render();
  });
  document.getElementById('pr-date').addEventListener('change', (e) => {
    state.pr.date = e.target.value;
  });

  document.getElementById('pr-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weight = document.getElementById('pr-weight').value;
    const reps = document.getElementById('pr-reps').value;
    const notes = document.getElementById('pr-notes').value;
    const curLift = document.getElementById('pr-lift').value;
    const curDate = document.getElementById('pr-date').value;

    if (state.pr.editingId) {
      const existing = state.allPRs.find((p) => p.id === state.pr.editingId);
      await DB.updatePR({ ...existing, lift: curLift, date: curDate, weight: Number(weight), reps: Number(reps), notes });
      state.pr.editingId = null;
      showToast('PR updated');
    } else {
      await DB.addPR({ lift: curLift, date: curDate, weight, reps, notes });
      showToast('PR saved');
    }
    state.pr.lift = curLift;
    state.pr.date = curDate;
    await reload();
    render();
  });

  const cancelBtn = document.getElementById('pr-cancel-edit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.pr.editingId = null;
      render();
    });
  }

  root.querySelectorAll('[data-pr-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = state.allPRs.find((x) => x.id === btn.dataset.prEdit);
      state.pr.editingId = p.id;
      state.pr.lift = p.lift;
      state.pr.date = p.date;
      render();
      document.getElementById('pr-weight').value = p.weight;
      document.getElementById('pr-reps').value = p.reps;
      document.getElementById('pr-notes').value = p.notes || '';
    })
  );

  root.querySelectorAll('[data-pr-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this PR?')) return;
      await DB.deletePR(btn.dataset.prDelete);
      await reload();
      render();
    })
  );
}

// ---------- Nutrition: Log view ----------

function renderFoodLog() {
  const { date, editingId } = state.foodLog;
  const todaysFood = state.allFoodLog.filter((e) => e.date === date);
  const totals = NutritionStats.totalsForDay(state.allFoodLog, date);
  const suggestions = allFoods();

  root.innerHTML = `
    <h2>${editingId ? 'Edit food entry' : 'Log food'}</h2>
    <div class="card">
      <form class="log-form" id="food-form">
        <div class="field">
          <label for="ff-date">Date</label>
          <input type="date" id="ff-date" value="${date}" />
        </div>
        <div class="field">
          <label for="ff-name">Food</label>
          <input type="text" id="ff-name" list="food-suggestions" placeholder="e.g. Chicken breast, cooked" />
          <datalist id="food-suggestions">
            ${suggestions.map((f) => `<option value="${escapeHtml(f.name)}"></option>`).join('')}
          </datalist>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ff-grams">Amount (g, optional)</label>
            <input type="number" id="ff-grams" step="1" min="0" inputmode="numeric" />
          </div>
          <div class="field" style="justify-content:flex-end">
            <button type="button" class="secondary" id="ff-autofill-btn">Autofill from list</button>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ff-kcal">Calories</label>
            <input type="number" id="ff-kcal" step="1" min="0" inputmode="numeric" />
          </div>
          <div class="field">
            <label for="ff-protein">Protein (g)</label>
            <input type="number" id="ff-protein" step="0.1" min="0" inputmode="decimal" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ff-carbs">Carbs (g)</label>
            <input type="number" id="ff-carbs" step="0.1" min="0" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="ff-fat">Fat (g)</label>
            <input type="number" id="ff-fat" step="0.1" min="0" inputmode="decimal" />
          </div>
        </div>

        <div class="card" style="background:var(--surface-2)">
          <div class="field">
            <label for="ff-ai-desc">Can't find it? Describe it and estimate with AI</label>
            <input type="text" id="ff-ai-desc" placeholder="e.g. large slice of pepperoni pizza" />
          </div>
          <button type="button" class="secondary" id="ff-ai-btn">Estimate with AI</button>
        </div>

        <label class="field-checkbox">
          <input type="checkbox" id="ff-save-custom" />
          Save this as a reusable food (needs amount + calories filled in)
        </label>

        <div class="field">
          <label for="ff-notes">Notes (optional)</label>
          <input type="text" id="ff-notes" placeholder="e.g. homemade, restaurant" />
        </div>
        <button type="submit" class="primary">${editingId ? 'Save changes' : 'Add food'}</button>
        ${editingId ? '<button type="button" class="secondary" id="ff-cancel-edit">Cancel edit</button>' : ''}
      </form>
    </div>

    <h2>${date} — totals</h2>
    <div class="card">
      <div class="stat-row"><span class="stat-label">Calories</span><span class="stat-value">${fmt(totals.kcal)} kcal</span></div>
      <div class="stat-row"><span class="stat-label">Protein</span><span class="stat-value">${fmt(totals.protein)}g</span></div>
      <div class="stat-row"><span class="stat-label">Carbs</span><span class="stat-value">${fmt(totals.carbs)}g</span></div>
      <div class="stat-row"><span class="stat-label">Fat</span><span class="stat-value">${fmt(totals.fat)}g</span></div>
    </div>

    <h2>Today's entries</h2>
    <div class="card">
      ${
        todaysFood.length === 0
          ? '<div class="empty-state">No food logged yet for this date.</div>'
          : `<div class="set-list">${todaysFood
              .map((e) =>
                setRowHTML({
                  primary: `${escapeHtml(e.name)}${e.grams != null ? ` (${e.grams}g)` : ''}`,
                  meta: foodMacroMeta(e),
                  notes: e.notes,
                  editAttr: `data-food-edit="${e.id}"`,
                  deleteAttr: `data-food-delete="${e.id}"`,
                })
              )
              .join('')}</div>`
      }
    </div>
  `;

  document.getElementById('ff-date').addEventListener('change', (e) => {
    state.foodLog.date = e.target.value;
    render();
  });

  document.getElementById('ff-autofill-btn').addEventListener('click', () => {
    const name = document.getElementById('ff-name').value;
    const match = findFoodMatch(name);
    if (!match) {
      showToast('No match found in food list');
      return;
    }
    let grams = Number(document.getElementById('ff-grams').value);
    if (!grams) {
      grams = 100;
      document.getElementById('ff-grams').value = 100;
    }
    const factor = grams / 100;
    document.getElementById('ff-kcal').value = fmt(match.kcal * factor);
    document.getElementById('ff-protein').value = fmt(match.protein * factor);
    document.getElementById('ff-carbs').value = fmt(match.carbs * factor);
    document.getElementById('ff-fat').value = fmt(match.fat * factor);
    showToast(`Filled from "${match.name}"`);
  });

  document.getElementById('ff-ai-btn').addEventListener('click', async () => {
    const desc = document.getElementById('ff-ai-desc').value.trim();
    if (!desc) {
      showToast('Describe the food first');
      return;
    }
    const btn = document.getElementById('ff-ai-btn');
    btn.disabled = true;
    btn.textContent = 'Estimating…';
    try {
      const result = await AIEstimate.estimate(desc);
      document.getElementById('ff-kcal').value = result.kcal;
      document.getElementById('ff-protein').value = result.protein;
      document.getElementById('ff-carbs').value = result.carbs;
      document.getElementById('ff-fat').value = result.fat;
      if (!document.getElementById('ff-name').value) document.getElementById('ff-name').value = desc;
      showToast('AI estimate filled in');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Estimate with AI';
    }
  });

  document.getElementById('food-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const curDate = document.getElementById('ff-date').value;
    const name = document.getElementById('ff-name').value.trim();
    const grams = document.getElementById('ff-grams').value;
    const kcal = document.getElementById('ff-kcal').value;
    const protein = document.getElementById('ff-protein').value;
    const carbs = document.getElementById('ff-carbs').value;
    const fat = document.getElementById('ff-fat').value;
    const notes = document.getElementById('ff-notes').value;
    const saveCustom = document.getElementById('ff-save-custom').checked;

    if (!name) {
      showToast('Food name is required');
      return;
    }

    if (saveCustom && grams && kcal) {
      const factor = 100 / Number(grams);
      await DB.addCustomFood({
        name,
        kcal: Number(kcal) * factor,
        protein: (Number(protein) || 0) * factor,
        carbs: (Number(carbs) || 0) * factor,
        fat: (Number(fat) || 0) * factor,
      });
    }

    if (state.foodLog.editingId) {
      const existing = state.allFoodLog.find((x) => x.id === state.foodLog.editingId);
      await DB.updateFoodLogEntry({ ...existing, date: curDate, name, grams, kcal, protein, carbs, fat, notes });
      state.foodLog.editingId = null;
      showToast('Entry updated');
    } else {
      await DB.addFoodLogEntry({ date: curDate, name, grams, kcal, protein, carbs, fat, notes });
      showToast('Food added');
    }
    state.foodLog.date = curDate;
    await reload();
    render();
  });

  const cancelBtn = document.getElementById('ff-cancel-edit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.foodLog.editingId = null;
      render();
    });
  }

  root.querySelectorAll('[data-food-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const e = state.allFoodLog.find((x) => x.id === btn.dataset.foodEdit);
      state.foodLog.editingId = e.id;
      state.foodLog.date = e.date;
      render();
      document.getElementById('ff-name').value = e.name;
      if (e.grams != null) document.getElementById('ff-grams').value = e.grams;
      if (e.kcal != null) document.getElementById('ff-kcal').value = e.kcal;
      if (e.protein != null) document.getElementById('ff-protein').value = e.protein;
      if (e.carbs != null) document.getElementById('ff-carbs').value = e.carbs;
      if (e.fat != null) document.getElementById('ff-fat').value = e.fat;
      document.getElementById('ff-notes').value = e.notes || '';
    })
  );

  root.querySelectorAll('[data-food-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      await DB.deleteFoodLogEntry(btn.dataset.foodDelete);
      await reload();
      render();
    })
  );
}

// ---------- Nutrition: Dashboard view ----------

function renderFoodDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const totals = NutritionStats.totalsForDay(state.allFoodLog, today);
  const settings = Settings.get();
  const targets = {
    kcal: settings.calorieTarget,
    protein: settings.proteinTarget,
    carbs: settings.carbsTarget,
    fat: settings.fatTarget,
  };
  const hasAnyTarget = targets.kcal || targets.protein || targets.carbs || targets.fat;
  const calLeft = targets.kcal ? targets.kcal - totals.kcal : null;

  function macroCard(name, color, value, target) {
    const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
    return `
      <div class="card macro-card">
        <div class="macro-card-top">
          <span class="macro-card-name"><span class="macro-dot" style="background:${color}"></span>${name}</span>
          <span class="macro-card-value"><b>${fmt(value)}</b>${target ? ` / ${target}g` : 'g'}</span>
        </div>
        ${
          target
            ? `<div class="progress-bar thin"><div class="progress-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="macro-card-footer"><span>${pct}% of target</span><span>${Math.max(0, target - value)}g left</span></div>`
            : ''
        }
      </div>`;
  }

  root.innerHTML = `
    <h2>Today — ${today}</h2>
    <div class="card cal-card">
      ${
        targets.kcal
          ? `<div class="cal-ring-wrap">
        <div class="cal-ring">
          <svg viewBox="0 0 120 120" width="176" height="176" style="transform:rotate(-90deg)">
            <defs><linearGradient id="calRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent-bright)"></stop><stop offset="1" stop-color="var(--accent)"></stop></linearGradient></defs>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="10"></circle>
            <circle cx="60" cy="60" r="52" fill="none" stroke="url(#calRingGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(Math.min(1, totals.kcal / targets.kcal) * 326.7).toFixed(1)} 326.7"></circle>
          </svg>
          <div class="cal-ring-center">
            <div class="cal-ring-pct">${Math.round(Math.min(100, (totals.kcal / targets.kcal) * 100))}%</div>
            <div class="cal-ring-label">of daily target</div>
          </div>
        </div>
      </div>`
          : ''
      }
      <div class="cal-card-top">
        <div>
          <div class="cal-card-label">Calories</div>
          <div class="cal-card-value">${fmt(totals.kcal)}${targets.kcal ? `<span class="unit"> / ${targets.kcal}</span>` : ''}</div>
        </div>
        ${
          targets.kcal
            ? `<div class="cal-card-remaining">
          <div class="cal-card-remaining-value" style="${calLeft < 0 ? 'color:var(--danger)' : ''}">${fmt(Math.abs(calLeft))}</div>
          <div class="cal-card-remaining-label">kcal ${calLeft >= 0 ? 'remaining' : 'over'}</div>
        </div>`
            : ''
        }
      </div>
      ${targets.kcal ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.min(100, Math.round((totals.kcal / targets.kcal) * 100))}%;background:linear-gradient(90deg,var(--accent),var(--accent-bright))"></div></div>` : ''}
    </div>
    ${macroCard('Protein', 'var(--macro-protein)', totals.protein, targets.protein)}
    ${macroCard('Carbs', 'var(--macro-carbs)', totals.carbs, targets.carbs)}
    ${macroCard('Fat', 'var(--macro-fat)', totals.fat, targets.fat)}
    ${hasAnyTarget ? '' : '<div class="empty-state">Set daily targets in Settings (gear icon) to see progress bars.</div>'}
  `;
}

// ---------- Nutrition: Graphs view ----------

function renderFoodGraphs() {
  const { period, series } = state.foodGraphs;

  let chartHeaderHTML = '';
  if (series.length === 1) {
    const buckets = NutritionStats.series(state.allFoodLog, period);
    if (buckets.length > 0) {
      const key = series[0];
      const def = FOOD_SERIES_DEFS[key];
      const vals = buckets.map((d) => d[key]);
      const latest = vals[vals.length - 1];
      const delta = vals.length >= 2 ? latest - vals[0] : 0;
      const unit = key === 'kcal' ? '' : 'g';
      chartHeaderHTML = `
        <div class="chart-header">
          <div><div class="chart-header-title">${def.label}</div><div class="chart-header-value">${fmt(latest)}${unit}</div></div>
          <span class="delta-badge ${delta > 0 ? 'pos' : 'flat'}">${delta >= 0 ? '+' : ''}${fmt(delta)}${unit}</span>
        </div>`;
    }
  }

  root.innerHTML = `
    <h2>Nutrition Graphs</h2>
    <div class="segmented">
      <button data-period="day" class="${period === 'day' ? 'active' : ''}">Daily</button>
      <button data-period="week" class="${period === 'week' ? 'active' : ''}">Weekly</button>
      <button data-period="month" class="${period === 'month' ? 'active' : ''}">Monthly</button>
    </div>
    <div class="chip-row">
      <button class="chip ${series.includes('kcal') ? 'active' : ''}" data-series="kcal">Calories</button>
      <button class="chip ${series.includes('protein') ? 'active' : ''}" data-series="protein">Protein</button>
      <button class="chip ${series.includes('carbs') ? 'active' : ''}" data-series="carbs">Carbs</button>
      <button class="chip ${series.includes('fat') ? 'active' : ''}" data-series="fat">Fat</button>
    </div>
    <div class="chart-wrap">
      ${chartHeaderHTML}
      <div class="chart-canvas-box">
        ${state.allFoodLog.length === 0 ? '<div class="empty-state">No food logged yet.</div>' : '<canvas id="food-chart-canvas"></canvas>'}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-period]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.foodGraphs.period = btn.dataset.period;
      render();
    })
  );
  root.querySelectorAll('[data-series]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.series;
      const idx = state.foodGraphs.series.indexOf(key);
      if (idx >= 0) {
        if (state.foodGraphs.series.length > 1) state.foodGraphs.series.splice(idx, 1);
      } else {
        state.foodGraphs.series.push(key);
      }
      render();
    })
  );

  if (state.allFoodLog.length > 0) {
    const canvas = document.getElementById('food-chart-canvas');
    renderFoodChart(canvas, state.allFoodLog, period, series);
  }
}

// ---------- Nutrition: History view ----------

function renderFoodHistory() {
  const entries = state.allFoodLog.slice().reverse();

  root.innerHTML = `
    <h2>Nutrition History</h2>
    ${
      entries.length === 0
        ? '<div class="card"><div class="empty-state">No food logged yet.</div></div>'
        : groupByDate(entries)
            .map(([date, dayItems]) => {
              const dayTotal = NutritionStats.totals(dayItems);
              return `
          <div class="history-day">
            <div class="history-day-header"><span>${formatDayLabel(date)}</span><span>${fmt(dayTotal.kcal)} kcal</span></div>
            <div class="set-list">${dayItems
              .map((e) =>
                setRowHTML({
                  primary: `${escapeHtml(e.name)}${e.grams != null ? ` (${e.grams}g)` : ''}`,
                  meta: foodMacroMeta(e),
                  notes: e.notes,
                  editAttr: `data-food-edit="${e.id}"`,
                  deleteAttr: `data-food-delete="${e.id}"`,
                })
              )
              .join('')}</div>
          </div>`;
            })
            .join('')
    }
  `;

  root.querySelectorAll('[data-food-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const e = state.allFoodLog.find((x) => x.id === btn.dataset.foodEdit);
      state.foodLog.editingId = e.id;
      state.foodLog.date = e.date;
      setView('food-log');
      document.getElementById('ff-name').value = e.name;
      if (e.grams != null) document.getElementById('ff-grams').value = e.grams;
      if (e.kcal != null) document.getElementById('ff-kcal').value = e.kcal;
      if (e.protein != null) document.getElementById('ff-protein').value = e.protein;
      if (e.carbs != null) document.getElementById('ff-carbs').value = e.carbs;
      if (e.fat != null) document.getElementById('ff-fat').value = e.fat;
      document.getElementById('ff-notes').value = e.notes || '';
    })
  );

  root.querySelectorAll('[data-food-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      await DB.deleteFoodLogEntry(btn.dataset.foodDelete);
      await reload();
      render();
    })
  );
}

// ---------- Settings view ----------

function renderSettings() {
  const s = Settings.get();

  root.innerHTML = `
    <div class="settings-header">
      <h2>Settings</h2>
      <button class="secondary" id="settings-done-btn">Done</button>
    </div>
    <div class="card">
      <form class="log-form" id="settings-form">
        <div class="field">
          <label for="set-api-key">Anthropic API key (for AI food estimates, optional)</label>
          <input type="password" id="set-api-key" placeholder="sk-ant-..." value="${escapeHtml(s.anthropicApiKey || '')}" autocomplete="off" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="set-cal">Daily calorie target</label>
            <input type="number" id="set-cal" min="0" step="10" value="${s.calorieTarget || ''}" />
          </div>
          <div class="field">
            <label for="set-protein">Daily protein target (g)</label>
            <input type="number" id="set-protein" min="0" step="1" value="${s.proteinTarget || ''}" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="set-carbs">Daily carbs target (g)</label>
            <input type="number" id="set-carbs" min="0" step="1" value="${s.carbsTarget || ''}" />
          </div>
          <div class="field">
            <label for="set-fat">Daily fat target (g)</label>
            <input type="number" id="set-fat" min="0" step="1" value="${s.fatTarget || ''}" />
          </div>
        </div>
        <button type="submit" class="primary">Save settings</button>
      </form>
    </div>

    <h2>My Foods</h2>
    <div class="card">
      ${
        state.allCustomFoods.length === 0
          ? '<div class="empty-state">No custom foods saved yet — check "Save this as a reusable food" when logging one.</div>'
          : `<div class="set-list">${state.allCustomFoods
              .map(
                (f) => `
            <div class="set-row">
              <div class="set-row-info">
                <span class="set-row-weight">${escapeHtml(f.name)}</span>
                <span class="set-row-meta">per 100g: ${fmt(f.kcal)} kcal · P${fmt(f.protein)} C${fmt(f.carbs)} F${fmt(f.fat)}</span>
              </div>
              <div class="set-row-actions">
                <button class="danger-link" data-customfood-delete="${f.id}">Delete</button>
              </div>
            </div>`
              )
              .join('')}</div>`
      }
    </div>
  `;

  document.getElementById('settings-done-btn').addEventListener('click', () => {
    setView(state.viewBeforeSettings || TABS[state.mode][0].id);
  });

  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    Settings.set({
      anthropicApiKey: document.getElementById('set-api-key').value.trim(),
      calorieTarget: Number(document.getElementById('set-cal').value) || null,
      proteinTarget: Number(document.getElementById('set-protein').value) || null,
      carbsTarget: Number(document.getElementById('set-carbs').value) || null,
      fatTarget: Number(document.getElementById('set-fat').value) || null,
    });
    showToast('Settings saved');
  });

  root.querySelectorAll('[data-customfood-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this custom food?')) return;
      await DB.deleteCustomFood(btn.dataset.customfoodDelete);
      await reload();
      render();
    })
  );
}

// ---------- Router ----------

function render() {
  if (state.view === 'log') renderLog();
  else if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'prs') renderPRs();
  else if (state.view === 'graphs') renderGraphs();
  else if (state.view === 'history') renderHistory();
  else if (state.view === 'food-log') renderFoodLog();
  else if (state.view === 'food-dashboard') renderFoodDashboard();
  else if (state.view === 'food-graphs') renderFoodGraphs();
  else if (state.view === 'food-history') renderFoodHistory();
  else if (state.view === 'settings') renderSettings();
}

(async function init() {
  await reload();
  setView('log');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
