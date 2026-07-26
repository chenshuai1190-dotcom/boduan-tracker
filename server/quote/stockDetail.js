const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMA_30_ALPHA = 2 / 31;
const TRADING_DAYS_PER_YEAR = 252;
const FIFTY_TWO_WEEKS_IN_DAYS = 52 * 7;
const DAILY_HISTORY_DAYS = 380;
const DAILY_MA_WINDOW = 200;
const WEEKLY_MA_WINDOW = 200;
const WEEKLY_MA_TREND_WEEKS = 4;
const WEEKLY_HISTORY_YEARS = 5;
const STOCK_DETAIL_PRICE_BASIS = 'split_adjusted_close';
const STOCK_DETAIL_SOURCE = 'EODHD_EOD_SPLITS';
const MA200_RETEST_ALGORITHM_VERSION = 'daily-ma200-retest-v5';
const MA200_RETEST_LOOKBACK_YEARS = 5;
const MA200_RETEST_PREPARE_DAYS = 5;
const MA200_RETEST_PREPARE_DISTANCE = 0.03;
const MA200_RETEST_QUALIFICATION_VALID_DAYS = 60;
const MA200_RETEST_OBSERVATION_DAYS = 60;
const MA200_RETEST_RECENT_REBOUND_DAYS = 20;
const MA200_RETEST_RESOLVED_LIMIT = 5;
const MA200_COMPARISON_EPSILON = 1e-12;

function positiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function splitRatio(value) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const numerator = positiveNumber(match[1]);
  const denominator = positiveNumber(match[2]);
  if (numerator === null || denominator === null) return null;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function validDateKey(value) {
  const dateKey = String(value || '').trim();
  if (!ISO_DATE_RE.test(dateKey)) return '';
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === dateKey ? dateKey : '';
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOrNull(values) {
  return values.length > 0 ? mean(values) : null;
}

function shiftYearKey(dateKey, years) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function weekStartKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return shiftDateKey(dateKey, -daysSinceMonday);
}

function weeklySide(close, movingAverage) {
  if (!Number.isFinite(close) || !Number.isFinite(movingAverage)) return null;
  if (close > movingAverage) return 'above';
  if (close < movingAverage) return 'below';
  return 'equal';
}

function emptyWeeklyIndicators() {
  return {
    ma200Weekly: null,
    ma200WeeklyClose: null,
    ma200WeeklyDistancePct: null,
    ma200WeeklyChange4WeekPct: null,
    ma200WeeklySide: null,
    ma200WeeklyStreakWeeks: null,
    ma200WeeklyAvailableWeeks: 0,
    ma200WeeklyRequiredWeeks: WEEKLY_MA_WINDOW,
    ma200WeeklyAsOfDate: '',
    ma200WeeklyStatus: 'insufficient_data',
  };
}

function buildWeeklyDetail(normalizedRows, cutoffDate) {
  const byWeek = new Map();
  for (const row of normalizedRows) {
    const weekStartDate = weekStartKey(row.date);
    if (!weekStartDate) continue;
    byWeek.set(weekStartDate, {
      weekStartDate,
      weekEndDate: shiftDateKey(weekStartDate, 4),
      date: row.date,
      close: row.close,
    });
  }

  const completedPoints = [];
  const orderedWeeks = Array.from(byWeek.values())
    .sort((left, right) => left.weekStartDate.localeCompare(right.weekStartDate));
  const weeklyRows = orderedWeeks.map((row, index) => {
    const hasLaterWeek = index < orderedWeeks.length - 1;
    const completed = row.weekEndDate <= cutoffDate
      && (row.date === row.weekEndDate || hasLaterWeek);
    if (!completed) return { ...row, ma200: null, completed: false };
    completedPoints.push(row);
    const maWindow = completedPoints.slice(-WEEKLY_MA_WINDOW).map((point) => point.close);
    const ma200 = maWindow.length === WEEKLY_MA_WINDOW ? mean(maWindow) : null;
    return {
      ...row,
      ma200: Number.isFinite(ma200) ? ma200 : null,
      completed: true,
    };
  });

  const latestDate = weeklyRows.at(-1)?.date || '';
  const visibleFrom = latestDate ? shiftYearKey(latestDate, -WEEKLY_HISTORY_YEARS) : '';
  const weeklyHistory = visibleFrom
    ? weeklyRows.filter((row) => row.date >= visibleFrom)
    : [];
  const completedWithMa = weeklyRows.filter((row) => row.completed && Number.isFinite(row.ma200));
  const latest = completedWithMa.at(-1) || null;

  if (!latest) {
    return {
      weeklyHistory,
      indicators: {
        ...emptyWeeklyIndicators(),
        ma200WeeklyAvailableWeeks: completedPoints.length,
        ma200WeeklyAsOfDate: completedPoints.at(-1)?.date || '',
      },
    };
  }

  const comparison = completedWithMa.at(-(WEEKLY_MA_TREND_WEEKS + 1)) || null;
  const change4WeekPct = comparison?.ma200 > 0
    ? ((latest.ma200 / comparison.ma200) - 1) * 100
    : null;
  const side = weeklySide(latest.close, latest.ma200);
  let streakWeeks = 0;
  for (let index = completedWithMa.length - 1; index >= 0; index -= 1) {
    if (weeklySide(completedWithMa[index].close, completedWithMa[index].ma200) !== side) break;
    streakWeeks += 1;
  }

  return {
    weeklyHistory,
    indicators: {
      ma200Weekly: latest.ma200,
      ma200WeeklyClose: latest.close,
      ma200WeeklyDistancePct: latest.ma200 > 0
        ? ((latest.close / latest.ma200) - 1) * 100
        : null,
      ma200WeeklyChange4WeekPct: Number.isFinite(change4WeekPct) ? change4WeekPct : null,
      ma200WeeklySide: side,
      ma200WeeklyStreakWeeks: streakWeeks,
      ma200WeeklyAvailableWeeks: completedPoints.length,
      ma200WeeklyRequiredWeeks: WEEKLY_MA_WINDOW,
      ma200WeeklyAsOfDate: latest.date,
      ma200WeeklyStatus: 'ready',
    },
  };
}

function calculateEma30(closes) {
  if (closes.length < 30) return null;
  let ema = mean(closes.slice(0, 30));
  for (let index = 30; index < closes.length; index += 1) {
    ema += EMA_30_ALPHA * (closes[index] - ema);
  }
  return Number.isFinite(ema) ? ema : null;
}

function calculateAnnualizedVolatility20(closes) {
  if (closes.length < 21) return null;
  const window = closes.slice(-21);
  const logReturns = [];
  for (let index = 1; index < window.length; index += 1) {
    const dailyReturn = Math.log(window[index] / window[index - 1]);
    if (!Number.isFinite(dailyReturn)) return null;
    logReturns.push(dailyReturn);
  }
  const averageReturn = mean(logReturns);
  const sampleVariance = logReturns.reduce(
    (sum, value) => sum + ((value - averageReturn) ** 2),
    0,
  ) / (logReturns.length - 1);
  const annualizedPercent = Math.sqrt(sampleVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  return Number.isFinite(annualizedPercent) ? annualizedPercent : null;
}

function normalizeSplitActions(actions, asOfDate) {
  if (!Array.isArray(actions)) return null;

  const byDate = new Map();
  for (const action of actions) {
    const date = validDateKey(action?.date);
    const ratio = splitRatio(action?.split);
    if (!date || ratio === null) return null;
    if (date > asOfDate) continue;

    if (byDate.has(date)) return null;
    byDate.set(date, ratio);
  }

  return Array.from(byDate, ([date, ratio]) => ({ date, ratio }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeRows(rows, splitActions, asOfDate) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validDateKey(row?.date);
    if (!date || date > asOfDate) continue;

    const rawClose = positiveNumber(row?.close);
    const rawHigh = positiveNumber(row?.high);
    const totalReturnClose = positiveNumber(row?.adjusted_close);
    if (rawClose === null) continue;

    const futureSplitFactor = splitActions.reduce(
      (factor, action) => (action.date > date ? factor * action.ratio : factor),
      1,
    );
    if (!Number.isFinite(futureSplitFactor) || futureSplitFactor <= 0) continue;

    const splitAdjustedClose = rawClose / futureSplitFactor;
    const splitAdjustedHigh = rawHigh === null ? null : rawHigh / futureSplitFactor;
    if (!Number.isFinite(splitAdjustedClose) || splitAdjustedClose <= 0) continue;

    // EODHD rows should be unique by date. If duplicates arrive, the last valid
    // provider row wins; an invalid duplicate never erases an earlier valid row.
    byDate.set(date, {
      date,
      close: splitAdjustedClose,
      totalReturnClose,
      high: splitAdjustedHigh !== null
        && Number.isFinite(splitAdjustedHigh)
        && splitAdjustedHigh > 0
        ? Math.max(splitAdjustedHigh, splitAdjustedClose)
        : splitAdjustedClose,
    });
  }

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function buildDailyHistory(normalizedRows) {
  let rollingSum = 0;
  return normalizedRows.map((row, index) => {
    rollingSum += row.close;
    if (index >= DAILY_MA_WINDOW) rollingSum -= normalizedRows[index - DAILY_MA_WINDOW].close;
    const ma200 = index >= DAILY_MA_WINDOW - 1
      ? rollingSum / DAILY_MA_WINDOW
      : null;
    return {
      date: row.date,
      close: row.close,
      ma200: Number.isFinite(ma200) ? ma200 : null,
    };
  });
}

function emptyMa200RetestHistory(asOfDate = '', status = 'insufficient_data') {
  return {
    algorithmVersion: MA200_RETEST_ALGORITHM_VERSION,
    asOfDate,
    status,
    basis: STOCK_DETAIL_PRICE_BASIS,
    maWindowTradingDays: DAILY_MA_WINDOW,
    triggerBasis: 'daily_close_at_or_below_ma200',
    prepareTradingDays: MA200_RETEST_PREPARE_DAYS,
    prepareDistancePct: MA200_RETEST_PREPARE_DISTANCE * 100,
    qualificationValidTradingDays: MA200_RETEST_QUALIFICATION_VALID_DAYS,
    recoveryConfirmationTradingDays: 2,
    observationTradingDays: MA200_RETEST_OBSERVATION_DAYS,
    recentReboundTradingDays: MA200_RETEST_RECENT_REBOUND_DAYS,
    lookbackYears: MA200_RETEST_LOOKBACK_YEARS,
    summary: {
      resolvedSampleSize: 0,
      recoveredCount: 0,
      recoveryRatePct: null,
      averageRetestDepthPct: null,
      averageMaxReboundPct: null,
      maxReboundSampleSize: 0,
      averageRecoveryTradingDays: null,
    },
    events: [],
  };
}

function isPreparedAboveMa200(row) {
  return Number.isFinite(row?.ma200)
    && row.ma200 > 0
    && (row.close / row.ma200) >= (1 + MA200_RETEST_PREPARE_DISTANCE - MA200_COMPARISON_EPSILON);
}

function isAboveMa200(row) {
  return Number.isFinite(row?.ma200)
    && row.ma200 > 0
    && (row.close / row.ma200) > (1 + MA200_COMPARISON_EPSILON);
}

function findMa200RetestTriggerIndexes(allHistory) {
  const triggerIndexes = [];
  let preparedStreak = 0;
  let latestQualificationIndex = -1;

  for (let index = 0; index < allHistory.length; index += 1) {
    const row = allHistory[index];
    if (!Number.isFinite(row?.ma200) || row.ma200 <= 0) {
      preparedStreak = 0;
      latestQualificationIndex = -1;
      continue;
    }

    if (isPreparedAboveMa200(row)) {
      preparedStreak += 1;
      if (preparedStreak >= MA200_RETEST_PREPARE_DAYS) {
        latestQualificationIndex = index;
      }
      continue;
    }

    preparedStreak = 0;
    const qualificationAge = latestQualificationIndex >= 0
      ? index - latestQualificationIndex
      : Number.POSITIVE_INFINITY;
    if (qualificationAge > MA200_RETEST_QUALIFICATION_VALID_DAYS) {
      latestQualificationIndex = -1;
      continue;
    }

    if (
      latestQualificationIndex >= 0
      && (row.close / row.ma200) <= (1 + MA200_COMPARISON_EPSILON)
    ) {
      triggerIndexes.push(index);
      latestQualificationIndex = -1;
    }
  }

  return triggerIndexes;
}

function findRecoveryConfirmationIndex(allHistory, triggerIndex, observedTradingDays) {
  const observationEndIndex = triggerIndex + observedTradingDays;
  for (let index = triggerIndex + 2; index <= observationEndIndex; index += 1) {
    if (isAboveMa200(allHistory[index - 1]) && isAboveMa200(allHistory[index])) {
      return index;
    }
  }
  return -1;
}

function analyzeMa200RetestWindow(allHistory, triggerIndex, observationTradingDays) {
  const trigger = allHistory[triggerIndex];
  const observedTradingDays = Math.min(
    observationTradingDays,
    allHistory.length - triggerIndex - 1,
  );
  const complete = observedTradingDays === observationTradingDays;
  const observationEndIndex = triggerIndex + observedTradingDays;
  const recoveryConfirmationIndex = findRecoveryConfirmationIndex(
    allHistory,
    triggerIndex,
    observedTradingDays,
  );
  const recovered = recoveryConfirmationIndex >= 0;
  let lowIndex = triggerIndex;
  let lowestDistance = (trigger.close / trigger.ma200) - 1;

  for (let index = triggerIndex + 1; index <= observationEndIndex; index += 1) {
    const row = allHistory[index];
    const distance = (row.close / row.ma200) - 1;
    if (distance < lowestDistance) {
      lowestDistance = distance;
      lowIndex = index;
    }
  }

  const lowRow = allHistory[lowIndex];
  let reboundHigh = lowRow.close;
  for (let index = lowIndex + 1; index <= observationEndIndex; index += 1) {
    reboundHigh = Math.max(reboundHigh, allHistory[index].close);
  }

  return {
    complete,
    observedTradingDays,
    observationEndIndex,
    recoveryConfirmationIndex,
    recovered,
    lowIndex,
    retestDepthPct: lowestDistance * 100,
    maxReboundPct: ((reboundHigh / lowRow.close) - 1) * 100,
  };
}

function buildMa200RetestEvent(allHistory, triggerIndex) {
  const trigger = allHistory[triggerIndex];
  const summaryWindow = analyzeMa200RetestWindow(
    allHistory,
    triggerIndex,
    MA200_RETEST_OBSERVATION_DAYS,
  );
  const recentWindow = analyzeMa200RetestWindow(
    allHistory,
    triggerIndex,
    MA200_RETEST_RECENT_REBOUND_DAYS,
  );
  const forwardReturnEndRow = summaryWindow.complete
    ? allHistory[summaryWindow.observationEndIndex]
    : null;
  const seriesStartIndex = Math.max(0, triggerIndex - MA200_RETEST_PREPARE_DAYS);
  const series = allHistory
    .slice(seriesStartIndex, recentWindow.observationEndIndex + 1)
    .map((row) => ({
      date: row.date,
      close: row.close,
      ma200: row.ma200,
    }));

  return {
    triggerDate: trigger.date,
    status: summaryWindow.complete
      ? (summaryWindow.recovered ? 'recovered' : 'failed')
      : 'observing',
    recentReboundStatus: recentWindow.complete
      ? (recentWindow.recovered ? 'recovered' : 'failed')
      : 'observing',
    triggerClose: trigger.close,
    triggerMa200: trigger.ma200,
    retestDepthPct: summaryWindow.retestDepthPct,
    maxReboundPct: summaryWindow.maxReboundPct,
    forwardReturnPct: forwardReturnEndRow
      ? ((forwardReturnEndRow.close / trigger.close) - 1) * 100
      : null,
    forwardReturnEndDate: forwardReturnEndRow?.date || '',
    recoveryTradingDays: summaryWindow.recovered
      ? summaryWindow.recoveryConfirmationIndex - triggerIndex
      : null,
    recoveryDate: summaryWindow.recovered
      ? allHistory[summaryWindow.recoveryConfirmationIndex].date
      : '',
    lowDate: allHistory[summaryWindow.lowIndex].date,
    observedTradingDays: summaryWindow.observedTradingDays,
    observationEndDate: allHistory[summaryWindow.observationEndIndex].date,
    recentObservedTradingDays: recentWindow.observedTradingDays,
    recentReboundComplete: recentWindow.complete,
    recentRecoveryTradingDays: recentWindow.recovered
      ? recentWindow.recoveryConfirmationIndex - triggerIndex
      : null,
    recentRecoveryDate: recentWindow.recovered
      ? allHistory[recentWindow.recoveryConfirmationIndex].date
      : '',
    recentRetestDepthPct: recentWindow.complete ? recentWindow.retestDepthPct : null,
    recentMaxReboundPct: recentWindow.complete ? recentWindow.maxReboundPct : null,
    recentReboundEndDate: recentWindow.complete
      ? allHistory[recentWindow.observationEndIndex].date
      : '',
    recentLowDate: allHistory[recentWindow.lowIndex].date,
    series,
  };
}

function buildMa200RetestHistory(allHistory, latestDate) {
  const availableMaRows = allHistory.filter((row) => Number.isFinite(row.ma200));
  if (!latestDate || availableMaRows.length < MA200_RETEST_PREPARE_DAYS + 1) {
    return emptyMa200RetestHistory(latestDate);
  }

  const lookbackStart = shiftYearKey(latestDate, -MA200_RETEST_LOOKBACK_YEARS);
  const recentEvents = findMa200RetestTriggerIndexes(allHistory)
    .filter((index) => allHistory[index].date >= lookbackStart)
    .map((index) => buildMa200RetestEvent(allHistory, index));

  if (recentEvents.length === 0) {
    return emptyMa200RetestHistory(latestDate, 'no_events');
  }

  const events = recentEvents
    .slice(-MA200_RETEST_RESOLVED_LIMIT)
    .reverse();
  // Keep every summary metric on the visible latest-five cohort. Recovery,
  // depth, and recovery time use the actionable recent window; only the
  // medium-term maximum rebound waits for the full 60-session window.
  const recentResolvedEvents = events.filter((event) => event.recentReboundComplete);
  const recentRecoveredEvents = recentResolvedEvents
    .filter((event) => event.recentReboundStatus === 'recovered');
  const maxReboundEvents = events.filter((event) => event.status !== 'observing');
  const resolvedSampleSize = recentResolvedEvents.length;

  return {
    algorithmVersion: MA200_RETEST_ALGORITHM_VERSION,
    asOfDate: latestDate,
    status: 'ready',
    basis: STOCK_DETAIL_PRICE_BASIS,
    maWindowTradingDays: DAILY_MA_WINDOW,
    triggerBasis: 'daily_close_at_or_below_ma200',
    prepareTradingDays: MA200_RETEST_PREPARE_DAYS,
    prepareDistancePct: MA200_RETEST_PREPARE_DISTANCE * 100,
    qualificationValidTradingDays: MA200_RETEST_QUALIFICATION_VALID_DAYS,
    recoveryConfirmationTradingDays: 2,
    observationTradingDays: MA200_RETEST_OBSERVATION_DAYS,
    recentReboundTradingDays: MA200_RETEST_RECENT_REBOUND_DAYS,
    lookbackYears: MA200_RETEST_LOOKBACK_YEARS,
    summary: {
      resolvedSampleSize,
      recoveredCount: recentRecoveredEvents.length,
      recoveryRatePct: resolvedSampleSize > 0
        ? (recentRecoveredEvents.length / resolvedSampleSize) * 100
        : null,
      averageRetestDepthPct: averageOrNull(
        recentResolvedEvents.map((event) => event.recentRetestDepthPct),
      ),
      averageMaxReboundPct: averageOrNull(
        maxReboundEvents.map((event) => event.maxReboundPct),
      ),
      maxReboundSampleSize: maxReboundEvents.length,
      averageRecoveryTradingDays: averageOrNull(
        recentRecoveredEvents.map((event) => event.recentRecoveryTradingDays),
      ),
    },
    events,
  };
}

export function buildEodhdStockDetail(rows = [], { asOfDate, splitActions } = {}) {
  const cutoffDate = validDateKey(asOfDate);
  const normalizedSplitActions = cutoffDate
    ? normalizeSplitActions(splitActions, cutoffDate)
    : null;
  if (!cutoffDate || normalizedSplitActions === null) {
    const unavailable = Boolean(cutoffDate);
    return {
      source: STOCK_DETAIL_SOURCE,
      priceBasis: STOCK_DETAIL_PRICE_BASIS,
      relativeReturnPriceBasis: 'adjusted_close',
      splitActionCount: 0,
      currency: 'USD',
      asOfDate: '',
      history: [],
      relativeReturnHistory: [],
      weeklyHistory: [],
      ma200RetestHistory: emptyMa200RetestHistory(
        '',
        unavailable ? 'unavailable' : 'insufficient_data',
      ),
      indicators: {
        week52High: null,
        ma200: null,
        ema30: null,
        volatility20AnnualizedPct: null,
        ...(
          unavailable
            ? { ...emptyWeeklyIndicators(), ma200WeeklyStatus: 'unavailable' }
            : emptyWeeklyIndicators()
        ),
      },
    };
  }

  const normalizedRows = normalizeRows(rows, normalizedSplitActions, cutoffDate);
  // Build the rolling daily MA from the full provider history before trimming
  // the response window, so the first visible point still has a real warmup.
  const allHistory = buildDailyHistory(normalizedRows);
  const latestDate = allHistory.at(-1)?.date || '';
  const dailyHistoryFrom = latestDate ? shiftDateKey(latestDate, -DAILY_HISTORY_DAYS) : '';
  const history = dailyHistoryFrom
    ? allHistory.filter((row) => row.date >= dailyHistoryFrom)
    : [];
  const relativeReturnHistoryCandidate = dailyHistoryFrom
    ? normalizedRows
      .filter((row) => row.date >= dailyHistoryFrom && Number.isFinite(row.totalReturnClose))
      .map((row) => ({ date: row.date, close: row.totalReturnClose }))
    : [];
  const relativeReturnHistory = relativeReturnHistoryCandidate.at(-1)?.date === latestDate
    ? relativeReturnHistoryCandidate
    : [];
  const closes = history.map((row) => row.close);
  const week52Start = latestDate
    ? shiftDateKey(latestDate, -FIFTY_TWO_WEEKS_IN_DAYS)
    : '';
  const week52Rows = week52Start
    ? normalizedRows.filter((row) => row.date >= week52Start && row.date <= latestDate)
    : [];
  const week52High = week52Rows.length > 0
    ? Math.max(...week52Rows.map((row) => row.high))
    : null;
  const ma200 = allHistory.at(-1)?.ma200 ?? null;
  const weeklyDetail = buildWeeklyDetail(normalizedRows, cutoffDate);
  const ma200RetestHistory = buildMa200RetestHistory(allHistory, latestDate);

  return {
    source: STOCK_DETAIL_SOURCE,
    priceBasis: STOCK_DETAIL_PRICE_BASIS,
    relativeReturnPriceBasis: 'adjusted_close',
    splitActionCount: normalizedSplitActions.length,
    currency: 'USD',
    asOfDate: latestDate,
    history,
    relativeReturnHistory,
    weeklyHistory: weeklyDetail.weeklyHistory,
    ma200RetestHistory,
    indicators: {
      week52High: Number.isFinite(week52High) ? week52High : null,
      ma200: Number.isFinite(ma200) ? ma200 : null,
      ema30: calculateEma30(closes),
      volatility20AnnualizedPct: calculateAnnualizedVolatility20(closes),
      ...weeklyDetail.indicators,
    },
  };
}
