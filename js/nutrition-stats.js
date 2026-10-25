// Derived nutrition stats. Reuses Stats.bucketKey/bucketAnchor from stats.js
// (lift-agnostic date bucketing) so weekly/monthly grouping stays consistent
// with the lifting graphs.
function foodTotals(entries) {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const e of entries) {
    if (e.kcal != null) kcal += e.kcal;
    if (e.protein != null) protein += e.protein;
    if (e.carbs != null) carbs += e.carbs;
    if (e.fat != null) fat += e.fat;
  }
  return { kcal, protein, carbs, fat };
}

const NutritionStats = {
  totals: foodTotals,

  totalsForDay(foodLog, date) {
    return foodTotals(foodLog.filter((e) => e.date === date));
  },

  // [{key, anchor, kcal, protein, carbs, fat}] — for 'day' this is just each
  // day's totals; for week/month it's the AVERAGE per-day totals across days
  // that have entries in that bucket (a summed month of calories isn't a
  // meaningful axis to plot against a single day's intake).
  series(foodLog, period) {
    const byDate = new Map();
    for (const e of foodLog) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    }
    const dailyTotals = [...byDate.entries()]
      .map(([date, entries]) => ({ date, ...foodTotals(entries) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (period === 'day') {
      return dailyTotals.map((d) => ({ key: d.date, anchor: d.date, kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat }));
    }

    const buckets = new Map();
    for (const d of dailyTotals) {
      const key = Stats.bucketKey(d.date, period);
      if (!buckets.has(key)) buckets.set(key, { key, anchor: Stats.bucketAnchor(d.date, period), days: [] });
      buckets.get(key).days.push(d);
    }
    return [...buckets.values()]
      .map((b) => {
        const n = b.days.length;
        const avg = (field) => b.days.reduce((sum, d) => sum + d[field], 0) / n;
        return { key: b.key, anchor: b.anchor, kcal: avg('kcal'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') };
      })
      .sort((a, b) => a.anchor.localeCompare(b.anchor));
  },
};
