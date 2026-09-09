import { normalizeInvestmentSymbol } from './investmentComparisonModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 52 * 7;

function dateTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function positivePrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function percentageChange(value, baseline) {
  if (positivePrice(value) === null || positivePrice(baseline) === null) return null;
  const result = ((value / baseline) - 1) * 100;
  return Number.isFinite(result) ? result : null;
}

function observationSymbol(value) {
  if (typeof value !== 'string') return null;
  return normalizeInvestmentSymbol(value.trim().toUpperCase().replace(/\.US$/, ''));
}

function nameOf(value, symbol) {
  return typeof value === 'string' && value.trim() && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim() : symbol;
}

/** Current user scopes only; this tool never inserts a default personal holding. */
export function buildObservationUniverse({ watchlist = [], positions = [] } = {}) {
  const bySymbol = new Map([
    ['SPY', { symbol: 'SPY', name: '标普 500 ETF', kind: 'etf', isBenchmark: true, inWatchlist: false, inHoldings: false }],
    ['QQQ', { symbol: 'QQQ', name: '纳斯达克 100 ETF', kind: 'etf', isBenchmark: true, inWatchlist: false, inHoldings: false }],
  ]);
  const add = (raw, scope) => {
    const item = typeof raw === 'string' ? { symbol: raw } : raw;
    const symbol = observationSymbol(item?.symbol);
    if (!symbol) return;
    const previous = bySymbol.get(symbol);
    const name = nameOf(item.name, symbol);
    bySymbol.set(symbol, {
      symbol,
      name: previous && previous.name !== symbol ? previous.name : name,
      kind: previous?.kind || (item.kind === 'etf' || item.type === 'ETF' ? 'etf' : 'stock'),
      isBenchmark: previous?.isBenchmark === true,
      inWatchlist: scope === 'watchlist' || previous?.inWatchlist === true,
      inHoldings: scope === 'holdings' || previous?.inHoldings === true,
    });
  };
  for (const item of Array.isArray(watchlist) ? watchlist : []) add(item, 'watchlist');
  for (const item of Array.isArray(positions) ? positions : []) {
    if (typeof item?.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0) add(item, 'holdings');
  }
  return [...bySymbol.values()];
}

function emptyObservation(instrument) {
  return {
    ...instrument,
    price: null, previousClose: null, todayPct: null, high: null, highDate: null,
    drawdownPct: null, trough: null, troughDate: null, reboundPct: null,
    recoveryPct: null, elapsedDays: null, historySufficient: false, pointsSinceHigh: [],
  };
}

function observedPoints(instrument, asOfDate) {
  if (!Array.isArray(instrument?.points)) return null;
  const rows = [], seen = new Set();
  for (const point of instrument.points) {
    if (dateTimestamp(point?.date) === null) return null;
    if (point.date > asOfDate) continue;
    if (positivePrice(point.close) === null || seen.has(point.date)) return null;
    seen.add(point.date);
    rows.push({ date: point.date, close: point.close });
  }
  return rows.sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Percentages are percentage points, e.g. -25. The high is the latest highest
 * adjusted close in [last observed close date - 364 calendar days, that date].
 * Stale histories retain their actual asOfDate, not the expected market date.
 * historySufficient means supplied history covers the window start; it does not
 * certify exchange-calendar completeness. recoveryPct is gain needed to the
 * reference high, never gain needed to recover an investor's purchase cost.
 */
export function deriveObservation(instrument, asOfDate = instrument?.asOfDate) {
  const raw = instrument && typeof instrument === 'object' && !Array.isArray(instrument) ? instrument : {};
  const empty = emptyObservation(raw);
  if (dateTimestamp(asOfDate) === null || ['loading', 'error'].includes(raw.status)) return empty;
  const points = observedPoints(raw, asOfDate);
  if (!points?.length) return empty;
  const current = points.at(-1);
  const currentTimestamp = dateTimestamp(current.date);
  const windowStart = new Date(currentTimestamp - LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const windowPoints = points.filter((point) => point.date >= windowStart);
  const previous = points.at(-2) || null;
  const peak = windowPoints.reduce((highest, point) => point.close >= highest.close ? point : highest);
  const pointsSinceHigh = windowPoints.filter((point) => point.date >= peak.date)
    .map((point) => ({ ...point, drawdownPct: percentageChange(point.close, peak.close) }));
  // A newly established high has no subsequent trough; do not fabricate one.
  const subsequentPoints = pointsSinceHigh.filter((point) => point.date > peak.date);
  const trough = subsequentPoints.reduce((lowest, point) => !lowest || point.close <= lowest.close ? point : lowest, null);
  return {
    ...raw,
    asOfDate: current.date,
    price: current.close,
    previousClose: previous?.close ?? null,
    todayPct: percentageChange(current.close, previous?.close),
    high: peak.close,
    highDate: peak.date,
    drawdownPct: percentageChange(current.close, peak.close),
    trough: trough?.close ?? null,
    troughDate: trough?.date ?? null,
    reboundPct: percentageChange(current.close, trough?.close),
    recoveryPct: percentageChange(peak.close, current.close),
    elapsedDays: (currentTimestamp - dateTimestamp(peak.date)) / DAY_MS,
    historySufficient: points[0].date <= windowStart,
    pointsSinceHigh,
  };
}

export function selectObservationRows(rows, { scope = 'watchlist', minDepth = 0, order = 'deepest' } = {}) {
  const depth = [0, 10, 20].includes(minDepth) ? minDepth : 0;
  const scopeField = scope === 'holdings' ? 'inHoldings' : 'inWatchlist';
  const hasDepth = (row) => typeof row?.drawdownPct === 'number' && Number.isFinite(row.drawdownPct);
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({ row, index }))
    .filter(({ row }) => row?.[scopeField] === true && (depth === 0 || (hasDepth(row) && row.drawdownPct <= -depth)))
    .sort((left, right) => {
      const leftKnown = hasDepth(left.row), rightKnown = hasDepth(right.row);
      if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
      if (!leftKnown) return left.index - right.index;
      const difference = order === 'shallowest'
        ? right.row.drawdownPct - left.row.drawdownPct : left.row.drawdownPct - right.row.drawdownPct;
      return difference || left.index - right.index;
    }).map(({ row }) => row);
}

// Both dates must exist exactly; missing sessions never shift to a nearby date.
export function getSamePeriodReturn(instrument, startDate, endDate) {
  if (dateTimestamp(startDate) === null || dateTimestamp(endDate) === null || startDate > endDate) return null;
  if (!Array.isArray(instrument?.points) || ['loading', 'error'].includes(instrument.status)) return null;
  const starts = instrument.points.filter((point) => point?.date === startDate);
  const ends = instrument.points.filter((point) => point?.date === endDate);
  if (starts.length !== 1 || ends.length !== 1) return null;
  return percentageChange(ends[0].close, starts[0].close);
}
