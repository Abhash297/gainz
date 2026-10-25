// Renders the per-lift progress chart via Chart.js. Recorded PRs are drawn as
// full-width dotted red reference lines at their weight (not per-session
// estimates) so the trend line can be read against actual PR levels.
let activeChart = null;

const SERIES_DEFS = {
  topWeight: { label: 'Top set (kg)', color: '#1f6feb', yAxisID: 'y' },
  workingWeight: { label: 'Working set (kg)', color: '#2dd4bf', yAxisID: 'y' },
  volume: { label: 'Volume (kg)', color: '#3fb950', yAxisID: 'y1' },
  pctPR: { label: '% of PR', color: '#a371f7', yAxisID: 'y2' },
};

function shortDate(dateStr) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${months[m - 1]} ${d}`;
}

// Draws a dashed horizontal line + label at each PR weight, spanning the full chart width.
const prLinesPlugin = {
  id: 'prLines',
  afterDatasetsDraw(chart, args, options) {
    const lines = (options && options.lines) || [];
    if (lines.length === 0) return;
    const { ctx, chartArea, scales } = chart;
    const yScale = scales.y;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 1.5;
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = '#f85149';
    ctx.textAlign = 'right';
    lines.forEach((line) => {
      const y = yScale.getPixelForValue(line.weight);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.fillText(line.label, chartArea.right - 4, y - 4);
    });
    ctx.restore();
  },
};
Chart.register(prLinesPlugin);

function renderChart(canvas, sets, prs, period, activeSeries, referencePR) {
  const buckets = Stats.series(sets, period, referencePR);
  // With no training sets yet (PR recorded but nothing logged), there are no
  // buckets to derive an x-axis from — fall back to the PR dates themselves
  // so the reference line still has an axis to draw across instead of an
  // empty/degenerate chart.
  const labels =
    buckets.length > 0
      ? buckets.map((d) => d.anchor)
      : [...new Set(prs.map((pr) => Stats.bucketAnchor(pr.date, period)))].sort();

  const datasets = activeSeries
    .filter((key) => key !== 'pctPR' || referencePR) // no PR recorded yet -> can't compute %, skip silently
    .map((key) => {
      const def = SERIES_DEFS[key];
      return {
        label: def.label,
        data: buckets.map((d) => Math.round(d[key] * 10) / 10),
        borderColor: def.color,
        backgroundColor: def.color,
        yAxisID: def.yAxisID,
        tension: 0.25,
        pointRadius: 3,
        spanGaps: true,
      };
    });

  const prLines = prs.map((pr) => ({ weight: pr.weight, label: `PR ${pr.weight}kg · ${shortDate(pr.date)}` }));

  // The kg axis must stay scaled to fit every PR line even when "Top set" is
  // toggled off (otherwise a PR line can fall outside the auto-ranged axis
  // and get silently clipped instead of drawn).
  const topValues = buckets.flatMap((d) => [d.topWeight, d.workingWeight]).filter((v) => v > 0);
  const kgValues = [...topValues, ...prLines.map((l) => l.weight)];
  const maxValue = Math.max(0, ...kgValues);
  const minValue = kgValues.length ? Math.min(...kgValues) : 0;

  if (activeChart) activeChart.destroy();
  activeChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'kg' },
          suggestedMin: minValue > 0 ? minValue * 0.92 : undefined,
          suggestedMax: maxValue > 0 ? maxValue * 1.08 : undefined,
        },
        y1: {
          position: 'right',
          display: activeSeries.includes('volume'),
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'volume (kg)' },
        },
        y2: {
          position: 'right',
          display: activeSeries.includes('pctPR') && !!referencePR,
          grid: { drawOnChartArea: false },
          title: { display: true, text: '% of PR' },
          suggestedMin: 0,
          suggestedMax: 110,
        },
      },
      plugins: {
        legend: { labels: { color: getComputedStyle(document.body).color } },
        prLines: { lines: prLines },
      },
    },
  });
}
