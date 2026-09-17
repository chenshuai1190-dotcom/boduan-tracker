const REVIEW_RANGES = Object.freeze(['1m', '3m', '6m', 'all']);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function validSeries(points, field) {
  if (!Array.isArray(points) || !points.length) return false;
  return points.every((point, index) => dateKey(point?.date)
    && (index === 0 || point.date > points[index - 1].date)
    && finite(point?.[field]) !== null);
}

export function calculateTotalPnL(realizedPnlUsd, unrealizedPnlUsd) {
  if (finite(realizedPnlUsd) === null || finite(unrealizedPnlUsd) === null) return null;
  return finite(realizedPnlUsd + unrealizedPnlUsd);
}

function excursion(points, direction) {
  if (!validSeries(points, 'totalPnlUsd')) return null;
  const selected = points.reduce((best, point) => direction * point.totalPnlUsd > direction * best.totalPnlUsd ? point : best);
  const hasExcursion = direction * selected.totalPnlUsd > 0;
  return {
    valueUsd: hasExcursion ? selected.totalPnlUsd : 0,
    date: hasExcursion ? selected.date : null,
    observedValue: selected.totalPnlUsd,
    observedDate: selected.date,
  };
}

// Zero means valid observations contain no favorable/adverse excursion; missing
// observations still return null. Preserve the actual extrema separately.
export function calculateMFE(points) { return excursion(points, 1); }
export function calculateMAE(points) { return excursion(points, -1); }

export function calculateProfitCapture(currentTotalPnlUsd, peakPnlUsd) {
  if (finite(currentTotalPnlUsd) === null || finite(peakPnlUsd) === null || peakPnlUsd <= 0) return null;
  return finite(currentTotalPnlUsd / peakPnlUsd);
}

/** Explicit nonnegative equity with a positive starting peak only.
 * The caller owns its cash-flow/price basis.
 * Select the largest percentage loss, not the largest dollar decline.
 */
export function calculateMaxDrawdown(points) {
  if (!validSeries(points, 'equity') || points[0].equity <= 0 || points.some(point => point.equity < 0)) return null;
  let peak = points[0];
  let result = { drawdownPct: 0, drawdownUsd: 0, peakDate: peak.date, troughDate: peak.date };
  for (const point of points) {
    if (point.equity > peak.equity) peak = point;
    const drawdownPct = point.equity / peak.equity - 1;
    if (drawdownPct < result.drawdownPct) result = {
      drawdownPct,
      drawdownUsd: point.equity - peak.equity,
      peakDate: peak.date,
      troughDate: point.date,
    };
  }
  return result;
}

export function buildTradeMarkers(records, trend) {
  const dates = new Set((Array.isArray(trend) ? trend : []).map(point => dateKey(point?.date)).filter(Boolean));
  const groups = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const date = dateKey(record?.date);
    if (!date || !['buy', 'sell'].includes(record?.side)) continue;
    if (finite(record?.shares) === null || record.shares <= 0 || finite(record?.price) === null || record.price <= 0) continue;
    const amountUsd = record.shares * record.price;
    if (!Number.isFinite(amountUsd)) continue;
    if (!groups.has(date)) groups.set(date, {
      date, markerDate: dates.has(date) ? date : null, side: record.side,
      records: [], buyCount: 0, sellCount: 0, buyAmountUsd: 0, sellAmountUsd: 0,
    });
    const group = groups.get(date);
    group.records.push(record);
    group[`${record.side}Count`] += 1;
    group[`${record.side}AmountUsd`] += amountUsd;
    if (group.side !== record.side) group.side = 'mixed';
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function subtractMonths(date, months) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  parsed.setUTCDate(Math.min(day, lastDay));
  return parsed.toISOString().slice(0, 10);
}

function datedSeries(points) {
  return Array.isArray(points) && points.every((point, index) => dateKey(point?.date)
    && (index === 0 || point.date > points[index - 1].date));
}

export function filterReviewRange(points, range = 'all') {
  if (!datedSeries(points) || !REVIEW_RANGES.includes(range)) return [];
  if (!points.length || range === 'all') return [...points];
  const start = subtractMonths(points.at(-1).date, Number.parseInt(range, 10));
  return points.filter(point => point.date >= start);
}

export function defaultReviewRange(points) {
  if (!datedSeries(points) || !points.length) return 'all';
  for (const range of REVIEW_RANGES.slice(0, -1)) {
    if (points[0].date >= subtractMonths(points.at(-1).date, Number.parseInt(range, 10))) return range;
  }
  return 'all';
}
