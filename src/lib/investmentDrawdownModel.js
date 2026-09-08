import { normalizeInvestmentSymbols } from './investmentComparisonModel.js';

const DAY_MS = 86_400_000;

function parseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${label} must be a valid YYYY-MM-DD date`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${label} must be a valid YYYY-MM-DD date`);
  }
  return timestamp;
}

function positiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number`);
  }
}

function calendarDays(from, to) {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS;
}

function percentage(ratio) {
  const result = (ratio - 1) * 100;
  if (!Number.isFinite(result)) throw new RangeError('Price ratio is outside the supported numeric range');
  return Object.is(result, -0) ? 0 : result;
}

function finalizeEpisode(episode, points, recoveryIndex = null) {
  const peak = points[episode.peakIndex];
  const trough = points[episode.troughIndex];
  const end = points[recoveryIndex ?? points.length - 1];
  return {
    id: `drawdown-${peak.date}`,
    peakIndex: peak.index,
    troughIndex: trough.index,
    recoveryIndex,
    peakDate: peak.date,
    troughDate: trough.date,
    recoveryDate: recoveryIndex === null ? null : end.date,
    peakValue: peak.value,
    troughValue: trough.value,
    drawdownPct: percentage(trough.close / peak.close),
    declineDays: calendarDays(peak.date, trough.date),
    reboundDays: recoveryIndex === null ? null : calendarDays(trough.date, end.date),
    underwaterDays: calendarDays(peak.date, end.date),
    recovered: recoveryIndex !== null,
    // Required gain back to the previous peak, not the recovery-day overshoot.
    recoveryGainPct: percentage(peak.close / trough.close),
  };
}

/**
 * Analyze adjusted daily closes without interpolation or future-data leakage.
 * All percentages are percentage points (e.g. -25), all durations calendar days.
 * A recovery matches or exceeds its old peak; equal highs use the last date
 * before a subsequent decline. Principal recovery is a separate concept.
 */
export function analyzeDrawdowns(rows, {
  principal = 1_000_000,
  startDate = '2011-01-01',
  asOfDate,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('rows must contain at least one observed price');
  }
  positiveNumber(principal, 'principal');
  parseDate(startDate, 'startDate');
  if (asOfDate !== undefined) parseDate(asOfDate, 'asOfDate');
  if (asOfDate !== undefined && asOfDate < startDate) {
    throw new RangeError('asOfDate must not precede startDate');
  }

  let previousDate = null;
  for (const [index, row] of rows.entries()) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`rows[${index}] must be a price record`);
    }
    parseDate(row.date, `rows[${index}].date`);
    positiveNumber(row.close, `rows[${index}].close`);
    if (previousDate !== null && row.date <= previousDate) {
      throw new RangeError('rows must be strictly ascending with no duplicate dates');
    }
    previousDate = row.date;
  }

  const selected = rows.filter(row => row.date >= startDate && (asOfDate === undefined || row.date <= asOfDate));
  if (selected.length === 0) {
    throw new RangeError('No observed prices in the selected date window');
  }
  const baseClose = selected[0].close;
  const points = [];
  const episodes = [];
  let peakIndex = 0;
  let pendingEpisode = null;
  let minimumIndex = 0;
  let firstUnderwaterDate = null;
  let firstRecoveryDate = null;

  for (const [index, row] of selected.entries()) {
    const value = principal * (row.close / baseClose);
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Portfolio value is outside the supported numeric range');
    }
    if (index === 0 || row.close >= selected[peakIndex].close) {
      peakIndex = index;
    }
    const peakValue = principal * (selected[peakIndex].close / baseClose);
    points.push({
      index,
      date: row.date,
      close: row.close,
      value,
      peakValue,
      drawdownPct: percentage(row.close / selected[peakIndex].close),
      profit: value - principal,
      returnPct: percentage(row.close / baseClose),
    });

    if (row.close < selected[minimumIndex].close) minimumIndex = index;
    if (firstUnderwaterDate === null && row.close < baseClose) firstUnderwaterDate = row.date;
    if (firstUnderwaterDate !== null && firstRecoveryDate === null && row.close >= baseClose) {
      firstRecoveryDate = row.date;
    }

    if (pendingEpisode !== null) {
      if (row.close >= selected[pendingEpisode.peakIndex].close) {
        episodes.push(finalizeEpisode(pendingEpisode, points, index));
        pendingEpisode = null;
      } else if (row.close < selected[pendingEpisode.troughIndex].close) {
        pendingEpisode.troughIndex = index;
      }
    } else if (row.close < selected[peakIndex].close) {
      pendingEpisode = { peakIndex, troughIndex: index };
    }
  }

  const currentEpisode = pendingEpisode === null ? null : finalizeEpisode(pendingEpisode, points);
  if (currentEpisode !== null) episodes.push(currentEpisode);
  const maxDrawdownEpisode = episodes.reduce((maximum, episode) => (
    maximum === null || episode.drawdownPct < maximum.drawdownPct ? episode : maximum
  ), null);
  const longestEpisode = episodes.reduce((longest, episode) => (
    longest === null || episode.underwaterDays > longest.underwaterDays ? episode : longest
  ), null);
  const minimumPoint = points[minimumIndex];
  const lastPoint = points.at(-1);
  const minimumRecoveryPoint = firstUnderwaterDate === null ? null : (
    points.slice(minimumIndex + 1).find(point => point.close >= baseClose) ?? null
  );

  return {
    points,
    episodes,
    maxDrawdownEpisode,
    longestEpisode,
    currentEpisode,
    principalStats: {
      everBelowPrincipal: firstUnderwaterDate !== null,
      minimumValue: minimumPoint.value,
      minimumDate: minimumPoint.date,
      maximumLossPct: minimumPoint.returnPct,
      firstUnderwaterDate,
      firstRecoveryDate,
      minimumRecoveryDate: minimumRecoveryPoint?.date ?? null,
      minimumRecoveryDays: minimumRecoveryPoint === null ? null : calendarDays(minimumPoint.date, minimumRecoveryPoint.date),
      currentlyBelowPrincipal: lastPoint.close < baseClose,
    },
    startDate: points[0].date,
    asOfDate: lastPoint.date,
    principal,
    maxDrawdownPct: maxDrawdownEpisode?.drawdownPct ?? 0,
    currentDrawdownPct: lastPoint.drawdownPct,
  };
}

/** Reuse the validated, common-session investment model; never fetch another series. */
export function buildInvestmentDrawdownModel(comparisonModel) {
  if (!comparisonModel || typeof comparisonModel !== 'object' || Array.isArray(comparisonModel)) {
    throw new TypeError('A valid comparison model is required');
  }
  const { principal, points, actualStartDate, asOfDate } = comparisonModel;
  if (!Array.isArray(comparisonModel.symbols)) {
    throw new TypeError('Comparison symbols must contain two instruments');
  }
  const symbols = normalizeInvestmentSymbols(comparisonModel.symbols);
  if (symbols.some((symbol, index) => symbol !== comparisonModel.symbols[index])) {
    throw new TypeError('Comparison symbols must be normalized');
  }
  positiveNumber(principal, 'principal');
  if (principal < 1 || principal > 1_000_000_000) {
    throw new RangeError('Comparison principal must be between 1 and 1000000000 USD');
  }
  parseDate(actualStartDate, 'actualStartDate');
  parseDate(asOfDate, 'asOfDate');
  if (!Array.isArray(points) || points.length < 2 || points.length > 25000) {
    throw new TypeError('Comparison points must contain 2 to 25000 observations');
  }
  if (asOfDate < actualStartDate || points[0]?.date !== actualStartDate || points.at(-1)?.date !== asOfDate) {
    throw new RangeError('Comparison date bounds must match observed points');
  }
  let previousDate = null;
  for (const [index, point] of points.entries()) {
    if (!point || typeof point !== 'object' || Array.isArray(point)
      || !point.values || typeof point.values !== 'object' || Array.isArray(point.values)) {
      throw new TypeError(`points[${index}] must contain observed values`);
    }
    parseDate(point.date, `points[${index}].date`);
    if (point.date < actualStartDate || point.date > asOfDate
      || (previousDate !== null && point.date <= previousDate)) {
      throw new RangeError('Comparison points must be strictly ascending within observed date bounds');
    }
    previousDate = point.date;
    for (const symbol of symbols) {
      positiveNumber(point.values[symbol], `points[${index}].values.${symbol}`);
      if (index === 0 && point.values[symbol] !== principal) {
        throw new RangeError('Comparison series must start at the shared principal');
      }
    }
  }
  return {
    symbols,
    analyses: Object.fromEntries(symbols.map(symbol => [symbol, analyzeDrawdowns(
      points.map(point => ({ date: point.date, close: point.values[symbol] })),
      { principal, startDate: actualStartDate, asOfDate },
    )])),
    startDate: actualStartDate,
    asOfDate,
  };
}
