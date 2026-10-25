// App shell: routing + view rendering.
const root = document.getElementById('view-root');
const tabbarEl = document.getElementById('tabbar');
const modeSwitchEl = document.getElementById('mode-switch');

const TABS = {
  lifting: [
    { id: 'log', label: 'Log' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'prs', label: 'PRs' },
    { id: 'graphs', label: 'Graphs' },
    { id: 'history', label: 'History' },
  ],
  nutrition: [
    { id: 'food-log', label: 'Log' },
    { id: 'food-dashboard', label: 'Dashboard' },
    { id: 'food-graphs', label: 'Graphs' },
    { id: 'food-history', label: 'History' },
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
        <button class="danger-link" ${deleteAttr}>Delete</button>
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
    .map((t) => `<button class="tab-btn ${t.id === state.view ? 'active' : ''}" data-view="${t.id}">${t.label}</button>`)
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
  renderTabBar();
  render();
}

modeSwitchEl.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

// Theme toggle — explicit choice (localStorage) always wins over OS
// preference; icon reflects the CURRENTLY active theme, not the one you'd
// switch to. index.html applies a saved choice before first paint to avoid
// a flash of the wrong theme.
const themeBtn = document.getElementById('theme-btn');

function effectiveTheme() {
  const saved = localStorage.getItem('gainz-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeIcon() {
  themeBtn.textContent = effectiveTheme() === 'dark' ? '🌙' : '☀️';
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
        <label class="field-checkbox">
          <input type="checkbox" id="f-top-set" />
          This is my top set for the session
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
                  meta: `Set ${i + 1} · Est 1RM ${fmt(Stats.est1RM(s.weight, s.reps))}kg`,
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
          return `<div class="card lift-card"><h3>${l.label}</h3><div class="empty-state">No data yet</div></div>`;
        }
        const current = Stats.current(sets);
        const { best } = Stats.actualPRs(allTimeBest);
        const estPR = Stats.estimatedPR(allTimeBest);
        const last4 = sets.slice(-4).map((s) => s.weight);
        return `
          <div class="card lift-card">
            <h3>${l.label}</h3>
            <div class="stat-row"><span class="stat-label">Current</span><span class="stat-value">${current ? `${current.weight}kg × ${current.reps}` : '—'}</span></div>
            <div class="stat-row"><span class="stat-label">Actual PR</span><span class="stat-value">${best.weight}kg × ${best.reps} <span class="pr-star">★</span></span></div>
            <div class="stat-row"><span class="stat-label">Est. PR</span><span class="stat-value">${fmt(estPR.est)}kg</span></div>
            <div class="stat-row"><span class="stat-label">Last 4</span><span class="stat-value">${last4.length ? last4.join(' → ') : '—'}</span></div>
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
      ${sets.length === 0 && prs.length === 0 ? '<div class="empty-state">No data yet for this lift.</div>' : '<canvas id="chart-canvas"></canvas>'}
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
    <div class="card">
      ${
        sets.length === 0
          ? '<div class="empty-state">No sets logged yet.</div>'
          : `<div class="set-list">${sets
              .map((s) =>
                setRowHTML({
                  primary: `${s.weight}kg × ${s.reps}`,
                  meta: `${liftLabel(s.lift)} · ${s.date}`,
                  notes: s.notes,
                  editAttr: `data-edit="${s.id}"`,
                  deleteAttr: `data-delete="${s.id}"`,
                  isTopSet: s.isTopSet,
                })
              )
              .join('')}</div>`
      }
    </div>

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
    <div class="card">
      ${
        liftPRs.length === 0
          ? '<div class="empty-state">No PRs recorded yet for this lift.</div>'
          : `<div class="set-list">${liftPRs
              .map((p) =>
                setRowHTML({
                  primary: `${p.weight}kg × ${p.reps}`,
                  meta: `${p.date} · Est 1RM ${fmt(Stats.est1RM(p.weight, p.reps))}kg`,
                  notes: p.notes,
                  editAttr: `data-pr-edit="${p.id}"`,
                  deleteAttr: `data-pr-delete="${p.id}"`,
                })
              )
              .join('')}</div>`
      }
    </div>
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

  function macroRow(label, value, target, unit) {
    const pct = target ? Math.min(100, Math.round((value / target) * 100)) : null;
    return `
      <div class="macro-row">
        <div class="macro-row-label">
          <span>${label}</span>
          <span>${fmt(value)}${unit}${target ? ` / ${target}${unit}` : ''}</span>
        </div>
        ${target ? `<div class="macro-bar"><div class="macro-bar-fill" style="width:${pct}%"></div></div>` : ''}
      </div>`;
  }

  root.innerHTML = `
    <h2>Today — ${today}</h2>
    <div class="card">
      ${macroRow('Calories', totals.kcal, targets.kcal, ' kcal')}
      ${macroRow('Protein', totals.protein, targets.protein, 'g')}
      ${macroRow('Carbs', totals.carbs, targets.carbs, 'g')}
      ${macroRow('Fat', totals.fat, targets.fat, 'g')}
      ${hasAnyTarget ? '' : '<div class="empty-state">Set daily targets in Settings (gear icon) to see progress bars.</div>'}
    </div>
  `;
}

// ---------- Nutrition: Graphs view ----------

function renderFoodGraphs() {
  const { period, series } = state.foodGraphs;

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
      ${state.allFoodLog.length === 0 ? '<div class="empty-state">No food logged yet.</div>' : '<canvas id="food-chart-canvas"></canvas>'}
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
    <div class="card">
      ${
        entries.length === 0
          ? '<div class="empty-state">No food logged yet.</div>'
          : `<div class="set-list">${entries
              .map((e) =>
                setRowHTML({
                  primary: `${escapeHtml(e.name)}${e.grams != null ? ` (${e.grams}g)` : ''}`,
                  meta: `${e.date} · ${foodMacroMeta(e)}`,
                  notes: e.notes,
                  editAttr: `data-food-edit="${e.id}"`,
                  deleteAttr: `data-food-delete="${e.id}"`,
                })
              )
              .join('')}</div>`
      }
    </div>
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
