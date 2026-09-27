import { buildVixRiskModel } from './vixRiskModel.js';
import { getVixSessionStatus, isVixComparisonSession } from './vixComparisonSession.js';

const SYMBOLS = ['SPY', 'QQQ'];
const RISK_LEVELS = new Set(['LOW_VOLATILITY', 'NORMAL', 'ELEVATED', 'HIGH_STRESS', 'EXTREME_STRESS']);
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const validDate = (date) => getVixSessionStatus(date).kind !== 'invalid_date';
const validMonth = (month) => typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) && validDate(`${month}-01`);
const percent = (close, base) => positive(close) !== null && positive(base) !== null ? (close / base - 1) * 100 : null;
const monthLabel = (month) => `${month.slice(0, 4)}年${Number(month.slice(5))}月`;
const shift = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

function previousSession(date) {
  let cursor = shift(date, -1);
  while (!isVixComparisonSession(cursor)) cursor = shift(cursor, -1);
  return cursor;
}

function nextMonth(month) {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  return value.toISOString().slice(0, 7);
}

function monthSessions(month) {
  const dates = [];
  const limit = `${nextMonth(month)}-01`;
  for (let date = `${month}-01`; date < limit; date = shift(date, 1)) {
    if (isVixComparisonSession(date)) dates.push(date);
  }
  return dates;
}

function expectedDate(data, requested) {
  const date = requested ?? data?.expectedAsOfDate;
  return isVixComparisonSession(date) ? date : null;
}

function earliestDate(data, cutoff) {
  const dates = [data?.termStructure?.rows, ...['VIX', ...SYMBOLS].map((symbol) => data?.series?.[symbol]?.rows)]
    .flatMap((rows) => Array.isArray(rows) ? rows.map((row) => row?.date) : [])
    .filter((date) => isVixComparisonSession(date) && date <= cutoff);
  return dates.sort()[0] ?? null;
}

/** Month navigation only: no model replay and no fixed year/month fixture. */
export function listVixMonthlyReports(data, { expectedAsOfDate } = {}) {
  const cutoff = expectedDate(data, expectedAsOfDate);
  if (!cutoff) return [];
  const first = earliestDate(data, cutoff);
  if (!first) return [];
  const result = [];
  for (let month = first.slice(0, 7); month <= cutoff.slice(0, 7); month = nextMonth(month)) {
    result.push({ month, monthLabel: monthLabel(month) });
  }
  return result;
}

function priceIndex(rows) {
  const values = new Map();
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isVixComparisonSession(row?.date)) continue;
    values.set(row.date, seen.has(row.date) ? null : positive(row.close));
    seen.add(row.date);
  }
  return values;
}

function appendIssue(issues, code, dimension, date) {
  if (!issues.some((issue) => issue.code === code && issue.dimension === dimension && issue.dates?.includes(date))) {
    issues.push({ code, dimension, dates: [date] });
  }
}

/**
 * Replay only the selected month plus its preceding session. Each model call
 * sees full preceding history and an explicit daily cutoff. Current fetch/cache
 * staleness is not a claim that an already recorded historical close is absent.
 * Missing current closes are instead represented by exact calendar placeholders.
 */
export function buildVixMonthlyReport(data, { month, expectedAsOfDate } = {}) {
  const expected = expectedDate(data, expectedAsOfDate);
  const selectedMonth = month ?? expected?.slice(0, 7);
  if (!expected || !validMonth(selectedMonth) || selectedMonth > expected.slice(0, 7)) return null;
  const firstAvailable = earliestDate(data, expected);
  if (!firstAvailable || selectedMonth < firstAvailable.slice(0, 7)) return null;
  const fullDates = monthSessions(selectedMonth);
  const dates = fullDates.filter((date) => date <= expected);
  if (!dates.length) return null;
  const cutoffDate = dates.at(-1);
  const baselineDate = previousSession(fullDates[0]);
  const independentVix = priceIndex(data?.series?.VIX?.rows);
  const market = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, priceIndex(data?.series?.[symbol]?.rows)]));
  const baselines = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, market[symbol].get(baselineDate) ?? null]));
  const termRows = Array.isArray(data?.termStructure?.rows) ? data.termStructure.rows : [];
  const benchmarks = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, data?.series?.[symbol]?.rows ?? []]));

  const modelOn = (date) => {
    const availableTermDates = termRows.map((row) => row?.date)
      .filter((value) => isVixComparisonSession(value) && value <= date).sort();
    return buildVixRiskModel({
      termStructure: { ...data?.termStructure, rows: termRows, stale: false,
        asOfDate: availableTermDates.at(-1) ?? null, expectedAsOfDate: date },
      benchmarks, expectedAsOfDate: date, stale: false, benchmarkStale: false,
    });
  };

  const rowOn = (date) => {
    const model = modelOn(date);
    const latest = model.latest?.date === date && RISK_LEVELS.has(model.currentRiskLevel) ? model.latest : null;
    const issues = structuredClone(model.dataQuality.issues);
    const previousDate = previousSession(date);
    const prices = Object.fromEntries(SYMBOLS.map((symbol) => {
      const adjustedClose = market[symbol].get(date) ?? null;
      const previousClose = market[symbol].get(previousDate) ?? null;
      const action = model.priceAction[symbol];
      if (adjustedClose === null) appendIssue(issues, 'provider_missing', symbol, date);
      if (previousClose === null) appendIssue(issues, 'provider_missing', symbol, previousDate);
      if (baselines[symbol] === null) appendIssue(issues, 'provider_missing', symbol, baselineDate);
      return [symbol, { adjustedClose,
        dailyChangePct: percent(adjustedClose, previousClose),
        cumulativeChangePct: percent(adjustedClose, baselines[symbol]),
        priceAction: adjustedClose === null ? null : action.status,
        daysSinceLow: adjustedClose === null ? null : finite(action.daysSinceLow),
        lowDate: adjustedClose === null ? null : action.lowDate ?? null,
      }];
    }));
    // The VIX/price charts are independently useful when the VIX3M provider is
    // unavailable. Preserve the existing validated VIX series; risk stays unknown.
    return { date, VIX: latest?.vix ?? independentVix.get(date) ?? null, VIX3M: latest?.vix3m ?? null, ratio: latest?.ratio ?? null,
      currentRiskLevel: model.currentRiskLevel, termStructure: model.termStructure, riskDirection: model.riskDirection,
      currentRiskDuration: model.currentRiskDuration, inversionDays: model.currentInversionDays,
      highStressDays: model.highStressDays, extremeStressDays: model.extremeStressDays,
      durationExact: structuredClone(model.durationExact), durationTags: structuredClone(model.durationTags),
      prices, eventFlags: structuredClone(model.eventFlags), ready: model.ready,
      dataQuality: { ...structuredClone(model.dataQuality),
        status: model.dataQuality.status === 'unavailable' ? 'unavailable' : issues.length ? 'partial' : 'complete', issues },
    };
  };

  const rows = dates.map(rowOn);
  const preceding = rowOn(baselineDate);
  const priorSession = { date: preceding.date, VIX: preceding.VIX, VIX3M: preceding.VIX3M, ratio: preceding.ratio,
    inversionDays: preceding.inversionDays, durationExact: preceding.durationExact, dataQuality: preceding.dataQuality };
  const allVixKnown = rows.every((row) => positive(row.VIX) !== null);
  const allRiskKnown = rows.every((row) => RISK_LEVELS.has(row.currentRiskLevel));
  const allRatioKnown = rows.every((row) => positive(row.ratio) !== null);
  const maximum = allVixKnown ? rows.reduce((max, row) => row.VIX > max.VIX ? row : max) : null;
  const summary = {
    ...Object.fromEntries(SYMBOLS.map((symbol) => [symbol, {
      monthlyChangePct: percent(market[symbol].get(cutoffDate), baselines[symbol]),
      baselineClose: baselines[symbol], baselineDate,
    }])),
    vixMax: { value: maximum?.VIX ?? null, date: maximum?.date ?? null },
    highStressDays: allRiskKnown ? rows.filter((row) => ['HIGH_STRESS', 'EXTREME_STRESS'].includes(row.currentRiskLevel)).length : null,
    inversionDays: allRatioKnown ? rows.filter((row) => row.ratio >= 1).length : null,
  };
  const completeObservation = (row) => positive(row.VIX) !== null && positive(row.VIX3M) !== null
    && SYMBOLS.every((symbol) => positive(row.prices[symbol].adjustedClose) !== null);
  const observedSessions = rows.filter(completeObservation).length;
  const relevantIssue = (issue) => !Array.isArray(issue.dates)
    || issue.dates.some((date) => date >= baselineDate && date <= cutoffDate);
  const partial = observedSessions !== dates.length || !allRiskKnown || !allRatioKnown
    || rows.some((row) => !row.ready || row.dataQuality.issues.some(relevantIssue)
      || SYMBOLS.some((symbol) => row.prices[symbol].priceAction === 'UNKNOWN'))
    || SYMBOLS.some((symbol) => summary[symbol].monthlyChangePct === null);
  const asOfDate = rows.filter((row) => positive(row.VIX) !== null
    || SYMBOLS.some((symbol) => positive(row.prices[symbol].adjustedClose) !== null)).at(-1)?.date ?? null;
  return { month: selectedMonth, monthLabel: monthLabel(selectedMonth),
    status: partial ? 'partial' : cutoffDate < fullDates.at(-1) ? 'in_progress' : 'complete',
    asOfDate, cutoffDate, expectedAsOfDate: expected, expectedSessions: dates.length, observedSessions,
    source: data?.source ?? null, fetchedAt: data?.fetchedAt ?? null,
    priorSession, summary, rows };
}
