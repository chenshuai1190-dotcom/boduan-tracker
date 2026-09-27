import { getVixSessionStatus, isVixComparisonSession, nextVixComparisonSession } from './vixComparisonSession.js';

// Frozen observation parameters: docs/vix-risk-model-v2.md. No return fitting.
export const VIX_RISK_THRESHOLDS = Object.freeze({
  calmVix: 16, calmRatio: 0.90, elevatedVix: 22, stressVix: 25, extremeVix: 30,
  inversionRatio: 1, deepInversionRatio: 1.10,
  minimumHistorySessions: 7, directionLookbackSessions: 3,
  directionConfirmationSessions: 2, directionHoldSessions: 2,
  directionRisePct: 10, directionStrongRisePct: 20, directionEasePct: -10,
  directionRatioChange: 0.02, directionStrongRiseRatioMin: -0.02,
  persistentSessions: 15, recentEventSessions: 3,
  priceWindowSessions: 20, priceRecoverySessions: 5,
  priceEarlyStabilizationSessions: 3, priceMovingAverageSessions: 5,
});
const T = VIX_RISK_THRESHOLDS;
const RATIO_TOLERANCE = 0.000001;
const validDate = (value) => getVixSessionStatus(value).kind !== 'invalid_date';
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
function calendarNext(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
function issue(code, dimension, dates = []) {
  return { code, dimension, ...(dates.length ? { dates: [...new Set(dates)].sort() } : {}) };
}
function parseVolatility(row) {
  if (!positive(row?.vix) || !positive(row?.vix3m) || !positive(row?.ratio)) return null;
  const ratio = row.vix / row.vix3m;
  if (!positive(ratio) || Math.abs(ratio - row.ratio) > RATIO_TOLERANCE) return null;
  // Raw quotient is authoritative; never round or snap classification inputs.
  return { date: row.date, vix: row.vix, vix3m: row.vix3m, ratio };
}
const parsePrice = (row) => positive(row?.close) ? { date: row.date, close: row.close } : null;

// Invalid observations break sessions instead of concatenating neighbours.
// Old breaks remain diagnostic after the required current window recovers.
function readSeries(input, cutoff, dimension, parse) {
  const issues = [];
  const byDate = new Map();
  const observedDates = new Set();
  const invalidDates = new Set();
  const missingSessions = [];
  const officialClosures = [];
  let invalidUndated = false;
  if (!Array.isArray(input)) issues.push(issue('provider_missing', dimension));
  for (const row of Array.isArray(input) ? input : []) {
    // No future numeric value or duplicate can affect a historical cutoff.
    if (typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date > cutoff) continue;
    if (!validDate(row?.date)) { invalidUndated = true; continue; }
    if (row.date > cutoff) continue;
    if (!isVixComparisonSession(row.date)) { invalidDates.add(row.date); continue; }
    const duplicate = observedDates.has(row.date);
    observedDates.add(row.date);
    const parsed = parse(row);
    if (!parsed || duplicate) { invalidDates.add(row.date); byDate.delete(row.date); }
    else if (!invalidDates.has(row.date)) byDate.set(row.date, parsed);
  }
  const dates = [...observedDates].sort();
  if (dates.length) {
    for (let date = dates[0]; date <= cutoff; date = calendarNext(date)) {
      const status = getVixSessionStatus(date);
      if (status.kind === 'official_closure') officialClosures.push({ date, reason: status.reason });
      else if (status.kind === 'session' && !observedDates.has(date)) missingSessions.push(date);
    }
  }
  if (invalidUndated || invalidDates.size) issues.push(issue('invalid_data', dimension, [...invalidDates]));
  if (missingSessions.length) issues.push(issue('provider_missing', dimension, missingSessions));
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const suffix = [];
  if (rows.at(-1)?.date === cutoff) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (suffix.length && nextVixComparisonSession(rows[index].date) !== suffix.at(-1).date) break;
      suffix.push(rows[index]);
    }
  }
  suffix.reverse();
  return { rows, suffix, byDate, observedCount: observedDates.size, invalidDates, missingSessions, officialClosures, issues };
}

export function classifyCurrentRiskLevel({ vix, ratio } = {}) {
  if (!positive(vix) || !positive(ratio)) return 'UNKNOWN';
  if (vix >= T.extremeVix && ratio >= T.inversionRatio) return 'EXTREME_STRESS';
  if (vix > T.stressVix && ratio >= T.inversionRatio) return 'HIGH_STRESS';
  if (vix > T.elevatedVix || ratio >= T.inversionRatio) return 'ELEVATED';
  if (vix < T.calmVix && ratio < T.calmRatio) return 'LOW_VOLATILITY';
  return 'NORMAL';
}
export function classifyTermStructure(ratio) {
  if (!positive(ratio)) return 'UNKNOWN';
  if (ratio >= T.deepInversionRatio) return 'DEEP_INVERTED';
  if (ratio >= T.inversionRatio) return 'INVERTED';
  return ratio >= T.calmRatio ? 'NEAR_FLAT' : 'NORMAL_TERM_STRUCTURE';
}
function directionEvidence() {
  return { vixChange3Pct: null, ratioChange3: null, risingCandidate: false, easingCandidate: false,
    risingStreak: 0, easingStreak: 0, confirmedAt: null, lastConfirmedAt: null,
    carriedSessions: 0, basis: 'insufficient_history' };
}
function directionFromRows(rows) {
  const evidence = directionEvidence();
  let status = 'UNKNOWN';
  for (let index = T.directionLookbackSessions; index < rows.length; index += 1) {
    const current = rows[index];
    const previous = rows[index - 1];
    const earlier = rows[index - T.directionLookbackSessions];
    const vixChange3Pct = (current.vix / earlier.vix - 1) * 100;
    const ratioChange3 = current.ratio - earlier.ratio;
    const risingCandidate = ((vixChange3Pct >= T.directionRisePct && ratioChange3 >= T.directionRatioChange)
      || (vixChange3Pct >= T.directionStrongRisePct && ratioChange3 >= T.directionStrongRiseRatioMin))
      && current.vix >= previous.vix;
    const easingCandidate = vixChange3Pct <= T.directionEasePct && ratioChange3 <= -T.directionRatioChange
      && current.vix < previous.vix;
    Object.assign(evidence, { vixChange3Pct, ratioChange3, risingCandidate, easingCandidate,
      risingStreak: risingCandidate ? evidence.risingStreak + 1 : 0,
      easingStreak: easingCandidate ? evidence.easingStreak + 1 : 0 });
    if (index + 1 < T.minimumHistorySessions) continue;
    let confirmed = null;
    if (evidence.risingStreak >= T.directionConfirmationSessions) confirmed = 'RISING';
    else if (evidence.easingStreak >= T.directionConfirmationSessions) confirmed = 'EASING';
    if (confirmed) {
      if (status !== confirmed) evidence.confirmedAt = current.date;
      status = confirmed;
      evidence.lastConfirmedAt = current.date;
      evidence.carriedSessions = 0;
      evidence.basis = 'two_day_confirmation';
      continue;
    }
    const agrees = status === 'RISING'
      ? vixChange3Pct > 0 && ratioChange3 > 0 && current.vix >= previous.vix
      : status === 'EASING' ? vixChange3Pct < 0 && ratioChange3 < 0 && current.vix <= previous.vix : false;
    if (agrees && evidence.carriedSessions < T.directionHoldSessions) {
      evidence.carriedSessions += 1;
      evidence.basis = 'carry_forward';
      continue;
    }
    status = (current.vix > T.stressVix || current.ratio >= T.inversionRatio)
      && (previous.vix > T.stressVix || previous.ratio >= T.inversionRatio) ? 'HIGH_HOLD' : 'STABLE';
    evidence.confirmedAt = null;
    evidence.lastConfirmedAt = null;
    evidence.carriedSessions = 0;
    evidence.basis = status === 'HIGH_HOLD' ? 'high_hold' : 'stable';
  }
  const ready = rows.length >= T.minimumHistorySessions;
  return { status: ready ? status : 'UNKNOWN', ready, reason: ready ? '' : 'insufficient_history', evidence };
}
export function buildRiskDirection(rows, { expectedAsOfDate } = {}) {
  const cutoff = expectedAsOfDate ?? (Array.isArray(rows) ? rows.map((row) => row?.date).filter(validDate).sort().at(-1) : null);
  if (!isVixComparisonSession(cutoff)) return { status: 'UNKNOWN', ready: false, reason: 'invalid_data', evidence: directionEvidence() };
  const suffix = readSeries(rows, cutoff, 'volatility', parseVolatility).suffix;
  const result = directionFromRows(suffix);
  result.evidence.recentEvents = recentEvents(suffix);
  return result;
}
function priceEmpty(reason, status = 'UNKNOWN') {
  return { status, ready: false, reason, asOfDate: null, latestClose: null,
    daysSinceLow: null, lowDate: null, lowClose: null, windowStart: null,
    movingAverage5: null, previousMovingAverage5: null, close3SessionsAgo: null,
    dataQuality: { issues: [], missingSessions: [], officialClosures: [] } };
}
export function buildPriceAction({ rows, expectedAsOfDate, stale = false, dimension = 'price' } = {}) {
  if (!isVixComparisonSession(expectedAsOfDate)) return priceEmpty('invalid_data');
  const series = readSeries(rows, expectedAsOfDate, dimension, parsePrice);
  const latest = series.rows.at(-1);
  const result = { ...priceEmpty(''), asOfDate: latest?.date ?? null, latestClose: latest?.close ?? null,
    dataQuality: { issues: series.issues, missingSessions: series.missingSessions, officialClosures: series.officialClosures } };
  const unavailable = (reason, status = 'UNKNOWN') => {
    if (!result.dataQuality.issues.some((item) => item.code === reason)) result.dataQuality.issues.push(issue(reason, dimension));
    return { ...result, reason, status };
  };
  if (stale) return unavailable('stale_data');
  if (!Array.isArray(rows)) return unavailable('provider_missing');
  const invalidInput = series.issues.some((item) => item.code === 'invalid_data');
  if (!series.observedCount && !invalidInput) return unavailable('insufficient_history', 'INSUFFICIENT_DATA');
  if (!latest || latest.date !== expectedAsOfDate) {
    return unavailable(series.invalidDates.has(expectedAsOfDate) || (!latest && invalidInput) ? 'invalid_data' : 'provider_missing');
  }
  if (series.suffix.length < T.priceWindowSessions) {
    const breakDate = series.suffix[0]?.date;
    if ([...series.invalidDates].some((date) => date < breakDate)) return unavailable('invalid_data');
    if (series.missingSessions.length) return unavailable('provider_missing');
    return unavailable('insufficient_history', 'INSUFFICIENT_DATA');
  }
  const window = series.suffix.slice(-T.priceWindowSessions);
  let lowIndex = 0;
  window.forEach((row, index) => { if (row.close <= window[lowIndex].close) lowIndex = index; });
  const low = window[lowIndex];
  const daysSinceLow = window.length - 1 - lowIndex;
  const mean = (values) => values.reduce((sum, row) => sum + row.close / values.length, 0);
  const movingAverage5 = mean(window.slice(-T.priceMovingAverageSessions));
  const previousMovingAverage5 = mean(window.slice(-T.priceMovingAverageSessions - 1, -1));
  const previous = window.at(-2);
  const close3SessionsAgo = window.at(-4).close;
  let status = 'NO_STABILIZATION';
  if (latest.close < Math.min(...window.slice(0, -1).map((row) => row.close))) status = 'NEW_LOW';
  else if (daysSinceLow >= T.priceRecoverySessions && latest.close > movingAverage5
    && previous.close > previousMovingAverage5 && latest.close > close3SessionsAgo) status = 'RECOVERY';
  else if (daysSinceLow >= T.priceEarlyStabilizationSessions && latest.close > previous.close) status = 'EARLY_STABILIZATION';
  return { ...result, status, ready: true, reason: '', daysSinceLow, lowDate: low.date, lowClose: low.close,
    windowStart: window[0].date, movingAverage5, previousMovingAverage5, close3SessionsAgo };
}
function countStreak(rows, predicate) {
  let days = 0;
  for (let index = rows.length - 1; index >= 0 && predicate(rows[index]); index -= 1) days += 1;
  return { days, exact: days < rows.length || days === 0 };
}
function recentEvents(rows) {
  const flags = [];
  let inverted = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    inverted = row.ratio >= T.inversionRatio ? inverted + 1 : 0;
    if (rows.length - 1 - index >= T.recentEventSessions) continue;
    const previous = rows[index - 1];
    const add = (type) => flags.push({ type, date: row.date, sessionsAgo: rows.length - 1 - index });
    if (previous) {
      if (previous.vix <= T.stressVix && row.vix > T.stressVix) add('VIX_CROSS_25');
      if (previous.vix < T.extremeVix && row.vix >= T.extremeVix) add('VIX_CROSS_30');
      if (previous.ratio < T.inversionRatio && row.ratio >= T.inversionRatio) add('RATIO_CROSS_1');
      if (previous.ratio < T.deepInversionRatio && row.ratio >= T.deepInversionRatio) add('RATIO_CROSS_1_10');
      if (previous.ratio >= T.inversionRatio && row.ratio < T.inversionRatio) add('TERM_STRUCTURE_NORMALIZED');
    }
    // Unknown left boundary supports an at-least duration, not a first crossing.
    if (inverted === T.persistentSessions && index - inverted >= 0) add('INVERSION_15D');
  }
  return flags;
}
function uniqueClosures(values) {
  return [...new Map(values.map((value) => [value.date, value])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Pure point-in-time model. Price conclusions are independent of volatility.
export function buildVixRiskModel({ termStructure: input, benchmarkRows, benchmarks, expectedAsOfDate, stale = false, benchmarkStale = false } = {}) {
  const cutoff = expectedAsOfDate ?? input?.expectedAsOfDate ?? input?.asOfDate;
  const validCutoff = isVixComparisonSession(cutoff);
  const series = validCutoff ? readSeries(input?.rows, cutoff, 'volatility', parseVolatility)
    : { rows: [], suffix: [], byDate: new Map(), invalidDates: new Set(), missingSessions: [], officialClosures: [], issues: [issue('invalid_data', 'volatility')] };
  const issues = [...series.issues];
  const latest = series.rows.at(-1) ?? null;
  let reason = '';
  if (!validCutoff || !input || input.source !== 'CBOE' || !isVixComparisonSession(input.asOfDate)
    || (latest && latest.date > input.asOfDate)) reason = input ? 'invalid_data' : 'provider_missing';
  else if (stale || input.stale) reason = 'stale_data';
  else if (!latest || latest.date !== cutoff) reason = series.invalidDates.has(cutoff) ? 'invalid_data' : 'provider_missing';
  const currentAvailable = !reason;
  const currentRiskLevel = currentAvailable ? classifyCurrentRiskLevel(latest) : 'UNKNOWN';
  const termStructure = currentAvailable ? classifyTermStructure(latest.ratio) : 'UNKNOWN';
  const direction = currentAvailable ? directionFromRows(series.suffix)
    : { status: 'UNKNOWN', ready: false, reason, evidence: directionEvidence() };
  const ready = currentAvailable && direction.ready;
  if (currentAvailable && !ready) reason = 'insufficient_history';
  if (reason && !issues.some((item) => item.code === reason)) issues.push(issue(reason, 'volatility'));
  const current = currentAvailable ? countStreak(series.suffix, (row) => classifyCurrentRiskLevel(row) === currentRiskLevel) : null;
  const inversion = currentAvailable ? countStreak(series.suffix, (row) => row.ratio >= T.inversionRatio) : null;
  const high = currentAvailable ? countStreak(series.suffix, (row) => row.vix > T.stressVix && row.ratio >= T.inversionRatio) : null;
  const extreme = currentAvailable ? countStreak(series.suffix, (row) => row.vix >= T.extremeVix && row.ratio >= T.inversionRatio) : null;
  const priceAction = {
    SPY: buildPriceAction({ rows: benchmarks?.SPY ?? benchmarkRows, expectedAsOfDate: cutoff, stale: benchmarkStale, dimension: 'SPY' }),
    QQQ: buildPriceAction({ rows: benchmarks?.QQQ, expectedAsOfDate: cutoff, stale: benchmarkStale, dimension: 'QQQ' }),
  };
  const qualityParts = [series, ...Object.values(priceAction).map((price) => price.dataQuality)];
  issues.push(...priceAction.SPY.dataQuality.issues, ...priceAction.QQQ.dataQuality.issues);
  const anyAvailable = currentAvailable || Object.values(priceAction).some((price) => price.ready);
  const dataQuality = { status: !anyAvailable ? 'unavailable' : issues.length ? 'partial' : 'complete', issues,
    missingSessions: [...new Set(qualityParts.flatMap((part) => part.missingSessions))].sort(),
    officialClosures: uniqueClosures(qualityParts.flatMap((part) => part.officialClosures)) };
  const result = {
    schemaVersion: 2, currentRiskLevel, termStructure, riskDirection: direction.status,
    currentRiskDuration: current?.days ?? null, currentInversionDays: inversion?.days ?? null,
    highStressDays: high?.days ?? null, extremeStressDays: extreme?.days ?? null,
    durationExact: { currentRisk: current?.exact ?? false, inversion: inversion?.exact ?? false, highStress: high?.exact ?? false, extremeStress: extreme?.exact ?? false },
    durationTags: inversion?.days >= T.persistentSessions ? ['PROLONGED_INVERSION'] : [],
    priceAction, eventFlags: currentAvailable ? recentEvents(series.suffix) : [],
    ready, reason, asOfDate: latest?.date ?? null, latest, dataQuality,
    facts: { contiguousSessions: series.suffix.length, direction: direction.evidence }, thresholds: T,
  };
  result.facts.direction.recentEvents = result.eventFlags;
  // Deprecated V1 mapping only; never drive the V2 UI or say "confirmed".
  result.phase = ({ LOW_VOLATILITY: 'calm', NORMAL: 'caution', ELEVATED: 'mixed', HIGH_STRESS: 'stress', EXTREME_STRESS: 'stress', UNKNOWN: 'unavailable' })[currentRiskLevel];
  result.duration = result.currentRiskDuration;
  result.invertedDays = result.currentInversionDays;
  result.priceConfirmation = { deprecated: true,
    status: ['EARLY_STABILIZATION', 'RECOVERY'].includes(priceAction.SPY.status) ? 'early_stabilization' : priceAction.SPY.ready ? 'pending' : 'unavailable',
    reason: priceAction.SPY.reason, daysSinceLow: priceAction.SPY.daysSinceLow, lowDate: priceAction.SPY.lowDate, lowClose: priceAction.SPY.lowClose };
  return result;
}
