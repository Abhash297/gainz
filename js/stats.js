// Derived stats: Epley est1RM, PRs, current weight, weekly/monthly aggregation.
const LIFTS = [
  { id: 'squat', label: 'Squat' },
  { id: 'bench', label: 'Bench Press' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead Press' },
];

function est1RM(weight, reps) {
  return weight * (1 + reps / 30);
}

// Parse a YYYY-MM-DD string as a UTC midnight instant, ignoring local timezone
// (plain `new Date(str)` / `new Date(str+'T00:00:00')` parse as local time and
// then get read back with getUTC*, which shifts the date by a day for any
// timezone east of UTC).
function parseUTCDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoWeekKey(dateStr) {
  const d = parseUTCDate(dateStr);
  // ISO week: Monday-based, week 1 contains first Thursday of the year.
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.round((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000));
  const year = new Date(firstThursday).getUTCFullYear();
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

// Monday of the ISO week containing dateStr — used as the sortable/display anchor for a week bucket.
function weekStartDate(dateStr) {
  const d = parseUTCDate(dateStr);
  const dayNr = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNr);
  return d.toISOString().slice(0, 10);
}

const identity = (dateStr) => dateStr;

function keyFnFor(period) {
  if (period === 'week') return isoWeekKey;
  if (period === 'month') return monthKey;
  return identity; // 'day': one bucket per actual logged date
}

function anchorFnFor(period) {
  if (period === 'week') return weekStartDate;
  if (period === 'month') return monthAnchor;
  return identity; // 'day'
}

function groupBy(sets, period) {
  const keyFn = keyFnFor(period);
  const anchorFn = anchorFnFor(period);
  const buckets = new Map();
  for (const s of sets) {
    const key = keyFn(s.date);
    if (!buckets.has(key)) {
      buckets.set(key, { key, anchor: anchorFn(s.date), sets: [] });
    }
    buckets.get(key).sets.push(s);
  }
  return [...buckets.values()].sort((a, b) => a.anchor.localeCompare(b.anchor));
}

function monthAnchor(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

const Stats = {
  est1RM,

  // Bucket key/anchor for a single date — used by charts.js to place PR markers
  // on the same week/month axis as the aggregated training series.
  bucketKey(dateStr, period) {
    return keyFnFor(period)(dateStr);
  },
  bucketAnchor(dateStr, period) {
    return anchorFnFor(period)(dateStr);
  },

  // Series for graphing: [{key, anchor, topWeight, workingWeight, volume, estMax, pctPR}]
  // prWeight is optional — when given, each bucket's pctPR = topWeight/prWeight*100,
  // i.e. what % of the all-time PR that session's top set represents (intensity).
  //
  // topWeight: the set explicitly flagged isTopSet (heaviest among flagged, if
  // more than one), falling back to the heaviest set of the day when nothing
  // was flagged — so untagged sessions behave exactly as before.
  // workingWeight: average weight of the OTHER sets that day (excluding
  // whichever specific set instance was chosen as top). If that was the only
  // set logged, workingWeight equals topWeight — same point, lines coincide,
  // which is correct when the working set and the top set are the same set.
  series(sets, period, prWeight) {
    return groupBy(sets, period).map((bucket) => {
      let estMax = 0;
      let volume = 0;
      for (const s of bucket.sets) {
        estMax = Math.max(estMax, est1RM(s.weight, s.reps));
        volume += s.weight * s.reps;
      }

      const flagged = bucket.sets.filter((s) => s.isTopSet);
      const topCandidates = flagged.length > 0 ? flagged : bucket.sets;
      const chosenTop = topCandidates.reduce((best, s) => (s.weight > best.weight ? s : best), topCandidates[0]);
      const topWeight = chosenTop.weight;

      const others = bucket.sets.filter((s) => s.id !== chosenTop.id);
      const workingWeight = others.length > 0 ? others.reduce((sum, s) => sum + s.weight, 0) / others.length : topWeight;

      const result = { key: bucket.key, anchor: bucket.anchor, topWeight, workingWeight, volume, estMax };
      if (prWeight) result.pctPR = (topWeight / prWeight) * 100;
      return result;
    });
  },

  current(sets) {
    if (sets.length === 0) return null;
    return sets[sets.length - 1]; // sets pre-sorted by date ascending
  },

  // Heaviest weight ever actually lifted, and best weight per distinct rep count.
  actualPRs(sets) {
    if (sets.length === 0) return { best: null, byReps: {} };
    let best = sets[0];
    const byReps = {};
    for (const s of sets) {
      if (s.weight > best.weight) best = s;
      const prev = byReps[s.reps];
      if (!prev || s.weight > prev.weight) byReps[s.reps] = s;
    }
    return { best, byReps };
  },

  estimatedPR(sets) {
    if (sets.length === 0) return null;
    let best = sets[0];
    let bestEst = est1RM(best.weight, best.reps);
    for (const s of sets) {
      const e = est1RM(s.weight, s.reps);
      if (e > bestEst) {
        bestEst = e;
        best = s;
      }
    }
    return { set: best, est: bestEst };
  },
};
