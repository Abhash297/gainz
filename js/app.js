// App shell: routing + view rendering.
const root = document.getElementById('view-root');
const tabButtons = document.querySelectorAll('.tab-btn');

const state = {
  view: 'log',
  allSets: [],
  allPRs: [],
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
};

function fmt(n) {
  return Math.round(n * 10) / 10;
}

function liftLabel(id) {
  return LIFTS.find((l) => l.id === id)?.label || id;
}

async function reload() {
  state.allSets = await DB.getAll();
  state.allPRs = await DB.getAllPRs();
}

function setView(view) {
  state.view = view;
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
}

tabButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function showToast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1600);
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
          : `<table class="history-table">
              <thead><tr><th>#</th><th>Weight</th><th>Reps</th><th>Est 1RM</th><th></th></tr></thead>
              <tbody>
                ${todaysSets
                  .map(
                    (s, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${s.weight}</td>
                    <td>${s.reps}</td>
                    <td>${fmt(Stats.est1RM(s.weight, s.reps))}</td>
                    <td class="row-actions">
                      <button class="link" data-edit="${s.id}">Edit</button>
                      <button class="danger-link" data-delete="${s.id}">Delete</button>
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
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
    const curLift = document.getElementById('f-lift').value;
    const curDate = document.getElementById('f-date').value;

    if (state.log.editingId) {
      const existing = state.allSets.find((s) => s.id === state.log.editingId);
      await DB.updateSet({ ...existing, lift: curLift, date: curDate, weight: Number(weight), reps: Number(reps), notes });
      state.log.editingId = null;
      showToast('Set updated');
    } else {
      await DB.addSet({ lift: curLift, date: curDate, weight, reps, notes });
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
  const referencePR = Stats.actualPRs([...sets, ...prs]).best?.weight;

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
          : `<table class="history-table">
              <thead><tr><th>Date</th><th>Lift</th><th>Weight</th><th>Reps</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                ${sets
                  .map(
                    (s) => `
                  <tr>
                    <td>${s.date}</td>
                    <td>${liftLabel(s.lift)}</td>
                    <td>${s.weight}</td>
                    <td>${s.reps}</td>
                    <td>${s.notes || ''}</td>
                    <td class="row-actions">
                      <button class="link" data-edit="${s.id}">Edit</button>
                      <button class="danger-link" data-delete="${s.id}">Delete</button>
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </div>

    <h2>Backup</h2>
    <div class="card">
      <div class="settings-row">
        <button class="secondary" id="export-btn">Export JSON</button>
        <button class="secondary" id="import-btn">Import JSON</button>
        <input type="file" id="import-file" accept="application/json" style="display:none" />
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
    const payload = { sets: state.allSets, prs: state.allPRs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gainz-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      if (!Array.isArray(sets)) throw new Error('missing sets array');
      if (!confirm(`Import ${sets.length} sets and ${prs.length} PRs? This replaces all current data.`)) return;
      await DB.replaceAll(sets);
      await DB.replaceAllPRs(prs);
      await reload();
      showToast('Import complete');
      render();
    } catch (err) {
      alert('Invalid backup file: ' + err.message);
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
          : `<table class="history-table">
              <thead><tr><th>Date</th><th>Weight</th><th>Reps</th><th>Est 1RM</th><th></th></tr></thead>
              <tbody>
                ${liftPRs
                  .map(
                    (p) => `
                  <tr>
                    <td>${p.date}</td>
                    <td>${p.weight}</td>
                    <td>${p.reps}</td>
                    <td>${fmt(Stats.est1RM(p.weight, p.reps))}</td>
                    <td class="row-actions">
                      <button class="link" data-pr-edit="${p.id}">Edit</button>
                      <button class="danger-link" data-pr-delete="${p.id}">Delete</button>
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
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

// ---------- Router ----------

function render() {
  if (state.view === 'log') renderLog();
  else if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'prs') renderPRs();
  else if (state.view === 'graphs') renderGraphs();
  else if (state.view === 'history') renderHistory();
}

(async function init() {
  await reload();
  setView('log');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
