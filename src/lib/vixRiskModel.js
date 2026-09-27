import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

// Interpretation parameters, not backtested return or drawdown forecasts.
// Every duration counts completed exchange sessions, never array positions
// spanning a missing session. The confirmation day is recovery window day 1.
export const VIX_RISK_THRESHOLDS = Object.freeze({
  calmVix: 16,
  calmRatio: 0.90,
  cautionVixMax: 22,
  inversionRatio: 1,
  stressVix: 25,
  recentCrossingSessions: 3,
  persistentSessions: 15,
  recoveryPeakRatio: 1.10,
  recoveryBelowSessions: 2,
  recoveryWindowSessions: 5,
  priceStabilizationSessions: 3,
  minimumHistorySessions: 7,
});

const T = VIX_RISK_THRESHOLDS;
const RATIO_TOLERANCE = 0.000001;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tradingDate(value) {
  return validDate(value)
    && ![0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay())
    && !isRegularNyseHoliday(value);
}

function nextSession(value) {
  const date = new Date(`${value}T00:00:00Z`);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (!tradingDate(date.toISOString().slice(0, 10)));
  return date.toISOString().slice(0, 10);
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function canonicalRatio(value) {
  // Division can land one floating-point ULP below an exact boundary (for
  // example 16 / (16 / .9)). Only remove that machine rounding ambiguity.
  return [T.calmRatio, T.inversionRatio, T.recoveryPeakRatio].find((boundary) => (
    Math.abs(value - boundary) <= Number.EPSILON * Math.max(1, value) * 4
  )) ?? value;
}

function priceUnavailable(reason) {
  return { status: 'unavailable', reason, daysSinceLow: null, lowDate: null, lowClose: null };
}

function emptyResult(reason) {
  return {
    phase: 'unavailable', ready: false, reason, asOfDate: null, latest: null,
    duration: null, invertedDays: null, ratioBelowDays: null, episodePeakRatio: null,
    stressDates: { ratioCrossedAt: null, vixCrossedAt: null },
    priceConfirmation: priceUnavailable('no_pressure_episode'),
    facts: {
      recentStress: false, historyComplete: false, contiguousSessions: 0,
      gapDetected: false, invertedDaysExact: false, ratioBelowDaysExact: false,
      episodeStartedAt: null, recoveryConfirmedAt: null, recoveryWindowDay: null,
    },
    thresholds: T,
  };
}

// The complete benchmark history is supplied independently of the chart's
// visible range. A missing session must not turn three observations into
// three consecutive completed sessions or move the episode's true low.
function confirmPrice(benchmarkRows, episode, asOfDate) {
  if (!episode?.startKnown) return priceUnavailable('no_pressure_episode');
  if (!Array.isArray(benchmarkRows) || !benchmarkRows.length) return priceUnavailable('missing_benchmark');
  const byDate = new Map();
  for (const row of benchmarkRows) {
    if (!validDate(row?.date)) return priceUnavailable('invalid_benchmark');
    if (row.date < episode.startedAt || row.date > asOfDate) continue;
    if (!tradingDate(row.date) || !positive(row.close) || byDate.has(row.date)) {
      return priceUnavailable('invalid_benchmark');
    }
    byDate.set(row.date, row.close);
  }
  let lowDate = null;
  let lowClose = null;
  let daysSinceLow = 0;
  let previousClose = null;
  let latestClose = null;
  for (let date = episode.startedAt; date <= asOfDate; date = nextSession(date)) {
    if (!byDate.has(date)) return priceUnavailable('benchmark_gap');
    previousClose = latestClose;
    latestClose = byDate.get(date);
    if (lowClose === null || latestClose < lowClose) {
      lowClose = latestClose;
      lowDate = date;
      daysSinceLow = 0;
    } else {
      daysSinceLow += 1;
    }
  }
  const confirmed = daysSinceLow >= T.priceStabilizationSessions
    && previousClose !== null && latestClose > previousClose;
  return {
    status: confirmed ? 'confirmed' : 'pending',
    reason: confirmed ? '' : 'stabilization_pending',
    daysSinceLow, lowDate, lowClose,
  };
}

/**
 * Pure, point-in-time interpretation of aligned Cboe daily closes.
 * expectedAsOfDate is also the historical cutoff: future rows are ignored
 * before value validation, and this function never consults today's clock.
 * unavailable has null metrics; mixed retains valid readings but no single
 * supported phase. Price confirmation never upgrades the volatility phase.
 */
export function buildVixRiskModel({ termStructure, benchmarkRows, expectedAsOfDate, stale = false } = {}) {
  if (!termStructure || !Array.isArray(termStructure.rows) || !termStructure.rows.length) {
    return emptyResult('missing_data');
  }
  const cutoff = expectedAsOfDate ?? termStructure.expectedAsOfDate ?? termStructure.asOfDate;
  if (termStructure.source !== 'CBOE' || !tradingDate(cutoff)
    || !tradingDate(termStructure.asOfDate)) return emptyResult('invalid_data');
  const rows = [];
  const seen = new Set();
  for (const row of termStructure.rows) {
    if (!validDate(row?.date)) return emptyResult('invalid_data');
    if (row.date > cutoff) continue;
    if (!tradingDate(row.date) || !positive(row.vix) || !positive(row.vix3m)
      || !positive(row.ratio) || seen.has(row.date)) return emptyResult('invalid_data');
    const quotient = row.vix / row.vix3m;
    if (!positive(quotient)) return emptyResult('invalid_data');
    const ratio = canonicalRatio(quotient);
    if (Math.abs(row.ratio - ratio) > RATIO_TOLERANCE) {
      return emptyResult('invalid_data');
    }
    seen.add(row.date);
    rows.push({ date: row.date, vix: row.vix, vix3m: row.vix3m, ratio });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return emptyResult('missing_data');
  const latest = rows.at(-1);
  if (latest.date > termStructure.asOfDate) return emptyResult('invalid_data');
  if (latest.date !== cutoff) {
    return { ...emptyResult('missing_latest'), asOfDate: latest.date, latest };
  }
  if (stale || termStructure.stale) {
    return { ...emptyResult('stale_data'), asOfDate: latest.date, latest };
  }

  let previous = null;
  let episode = null;
  let invertedDays = 0;
  let ratioBelowDays = 0;
  let invertedDaysExact = false;
  let ratioBelowDaysExact = false;
  let contiguousSessions = 0;
  let gapDetected = false;
  let ratioCrossIndex = null;
  let vixCrossIndex = null;
  let ratioCrossedAt = null;
  let vixCrossedAt = null;
  let phase = 'mixed';
  let duration = 0;
  let recentStress = false;
  let recoveryWindowDay = null;

  for (const [index, row] of rows.entries()) {
    if (previous && nextSession(previous.date) !== row.date) {
      gapDetected = true;
      previous = null;
      episode = null;
      invertedDays = 0;
      ratioBelowDays = 0;
      invertedDaysExact = false;
      ratioBelowDaysExact = false;
      contiguousSessions = 0;
      ratioCrossIndex = null;
      vixCrossIndex = null;
      ratioCrossedAt = null;
      vixCrossedAt = null;
      phase = 'mixed';
      duration = 0;
    }
    contiguousSessions += 1;
    if (previous && previous.ratio <= T.inversionRatio && row.ratio > T.inversionRatio) {
      ratioCrossIndex = index;
      ratioCrossedAt = row.date;
    }
    if (previous && previous.vix <= T.stressVix && row.vix > T.stressVix) {
      vixCrossIndex = index;
      vixCrossedAt = row.date;
    }

    // Any rebound to >= 1 after a below-1 observation ends that recovery
    // candidate. A later inversion must earn its own peak and price low.
    if (previous?.ratio < T.inversionRatio && row.ratio >= T.inversionRatio) episode = null;
    if (row.ratio > T.inversionRatio) {
      if (!episode) {
        episode = { startedAt: row.date, peakRatio: row.ratio, startKnown: Boolean(previous), confirmedAt: null, confirmedIndex: null };
      }
      episode.peakRatio = Math.max(episode.peakRatio, row.ratio);
      if (!previous || previous.ratio <= T.inversionRatio) {
        invertedDays = 0;
        invertedDaysExact = Boolean(previous);
      }
      invertedDays += 1;
      ratioBelowDays = 0;
      ratioBelowDaysExact = true;
    } else if (row.ratio < T.inversionRatio) {
      invertedDays = 0;
      invertedDaysExact = true;
      if (!previous || previous.ratio >= T.inversionRatio) {
        ratioBelowDays = 0;
        ratioBelowDaysExact = Boolean(previous);
      }
      ratioBelowDays += 1;
      if (episode?.startKnown && episode.peakRatio >= T.recoveryPeakRatio
        && ratioBelowDays === T.recoveryBelowSessions) {
        episode.confirmedAt = row.date;
        episode.confirmedIndex = index;
      }
    } else {
      invertedDays = 0;
      ratioBelowDays = 0;
      invertedDaysExact = true;
      ratioBelowDaysExact = true;
    }

    recoveryWindowDay = episode?.confirmedIndex != null ? index - episode.confirmedIndex + 1 : null;
    if (recoveryWindowDay > T.recoveryWindowSessions) {
      episode = null;
      recoveryWindowDay = null;
    }
    // A mild event cannot authorize a recovery state weeks or months later.
    if (episode && row.ratio < 1 && ratioBelowDays > T.recoveryBelowSessions + T.recoveryWindowSessions - 1) episode = null;

    const ratioCrossRecent = ratioCrossIndex != null && index - ratioCrossIndex < T.recentCrossingSessions;
    const vixCrossRecent = vixCrossIndex != null && index - vixCrossIndex < T.recentCrossingSessions;
    recentStress = row.ratio > T.inversionRatio && row.vix > T.stressVix && ratioCrossRecent && vixCrossRecent;
    let nextPhase = 'mixed';
    const unknownRecoveryHistory = row.ratio < T.inversionRatio && episode && !episode.startKnown;
    if (!unknownRecoveryHistory) {
      if (invertedDays >= T.persistentSessions) nextPhase = 'persistent';
      else if (recentStress) nextPhase = 'stress';
      else if (episode?.confirmedAt && recoveryWindowDay <= T.recoveryWindowSessions && row.ratio < 1) nextPhase = 'recovery';
      else if (row.vix < T.calmVix && row.ratio < T.calmRatio) nextPhase = 'calm';
      else if (row.vix >= T.calmVix && row.vix <= T.cautionVixMax
        && row.ratio >= T.calmRatio && row.ratio <= T.inversionRatio) nextPhase = 'caution';
    }
    duration = nextPhase === phase ? duration + 1 : 1;
    phase = nextPhase;
    previous = row;
  }

  const historyComplete = contiguousSessions >= T.minimumHistorySessions
    && !(latest.ratio < T.inversionRatio && episode && !episode.startKnown);
  if (!historyComplete) phase = 'mixed';
  const ratioCrossRecent = ratioCrossIndex != null && rows.length - 1 - ratioCrossIndex < T.recentCrossingSessions;
  const vixCrossRecent = vixCrossIndex != null && rows.length - 1 - vixCrossIndex < T.recentCrossingSessions;
  return {
    phase, ready: historyComplete, reason: historyComplete ? (phase === 'mixed' ? 'signal_mismatch' : '') : 'insufficient_history',
    asOfDate: latest.date, latest,
    duration: phase === 'mixed' ? null : duration,
    invertedDays, ratioBelowDays, episodePeakRatio: episode?.peakRatio ?? null,
    stressDates: { ratioCrossedAt: ratioCrossRecent ? ratioCrossedAt : null, vixCrossedAt: vixCrossRecent ? vixCrossedAt : null },
    priceConfirmation: historyComplete ? confirmPrice(benchmarkRows, episode, latest.date) : priceUnavailable('no_pressure_episode'),
    facts: {
      recentStress, historyComplete, contiguousSessions, gapDetected,
      invertedDaysExact, ratioBelowDaysExact,
      episodeStartedAt: episode?.startKnown ? episode.startedAt : null,
      recoveryConfirmedAt: episode?.confirmedAt ?? null, recoveryWindowDay,
    },
    thresholds: T,
  };
}
