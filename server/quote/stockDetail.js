const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMA_30_ALPHA = 2 / 31;
const TRADING_DAYS_PER_YEAR = 252;
const FIFTY_TWO_WEEKS_IN_DAYS = 52 * 7;
const DAILY_HISTORY_DAYS = 380;
const DAILY_MA_WINDOW = 200;
const WEEKLY_MA_WINDOW = 200;
const WEEKLY_MA_TREND_WEEKS = 4;
const WEEKLY_HISTORY_YEARS = 5;
const MA200_RETEST_ALGORITHM_VERSION = 'daily-ma200-retest-v1';
const MA200_RETEST_LOOKBACK_YEARS = 5;
const MA200_RETEST_PREPARE_DAYS = 5;
const MA200_RETEST_PREPARE_DISTANCE = 0.03;
const MA200_RETEST_OBSERVATION_DAYS = 20;
const MA200_RETEST_RESOLVED_LIMIT = 5;

function positiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
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

function normalizeRows(rows, asOfDate) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validDateKey(row?.date);
    if (!date || date > asOfDate) continue;

    const adjustedClose = positiveNumber(row?.adjusted_close);
    if (adjustedClose === null) continue;

    const rawClose = positiveNumber(row?.close);
    const rawHigh = positiveNumber(row?.high);
    const adjustedHigh = rawClose !== null && rawHigh !== null
      ? rawHigh * (adjustedClose / rawClose)
      : null;

    // EODHD rows should be unique by date. If duplicates arrive, the last valid
    // provider row wins; an invalid duplicate never erases an earlier valid row.
    byDate.set(date, {
      date,
      close: adjustedClose,
      adjustedHigh: adjustedHigh !== null && Number.isFinite(adjustedHigh) && adjustedHigh > 0
        ? Math.max(adjustedHigh, adjustedClose)
        : adjustedClose,
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
    basis: 'adjusted_close',
    maWindowTradingDays: DAILY_MA_WINDOW,
    observationTradingDays: MA200_RETEST_OBSERVATION_DAYS,
    lookbackYears: MA200_RETEST_LOOKBACK_YEARS,
    summary: {
      resolvedSampleSize: 0,
      recoveredCount: 0,
      recoveryRatePct: null,
      averageRetestDepthPct: null,
      averageMaxReboundPct: null,
      averageRecoveryTradingDays: null,
    },
    events: [],
  };
}

function isPreparedAboveMa200(row) {
  return Number.isFinite(row?.ma200)
    && row.ma200 > 0
    && row.close >= row.ma200 * (1 + MA200_RETEST_PREPARE_DISTANCE);
}

function isAboveMa200(row) {
  return Number.isFinite(row?.ma200)
    && row.ma200 > 0
    && row.close > row.ma200;
}

function findMa200RetestTriggerIndexes(allHistory) {
  const triggerIndexes = [];
  let preparedStreak = 0;
  let armed = false;

  for (let index = 0; index < allHistory.length; index += 1) {
    const row = allHistory[index];
    if (!Number.isFinite(row?.ma200) || row.ma200 <= 0) {
      preparedStreak = 0;
      armed = false;
      continue;
    }

    if (armed && row.close <= row.ma200) {
      triggerIndexes.push(index);
      preparedStreak = 0;
      armed = false;
      continue;
    }

    if (isPreparedAboveMa200(row)) {
      preparedStreak += 1;
      if (preparedStreak >= MA200_RETEST_PREPARE_DAYS) armed = true;
    } else if (!armed) {
      preparedStreak = 0;
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

function buildMa200RetestEvent(allHistory, triggerIndex) {
  const trigger = allHistory[triggerIndex];
  const observedTradingDays = Math.min(
    MA200_RETEST_OBSERVATION_DAYS,
    allHistory.length - triggerIndex - 1,
  );
  const complete = observedTradingDays === MA200_RETEST_OBSERVATION_DAYS;
  const observationEndIndex = triggerIndex + observedTradingDays;
  const recoveryConfirmationIndex = findRecoveryConfirmationIndex(
    allHistory,
    triggerIndex,
    observedTradingDays,
  );
  const recovered = recoveryConfirmationIndex >= 0;
  const depthEndIndex = recovered ? recoveryConfirmationIndex : observationEndIndex;
  let lowIndex = triggerIndex;
  let lowestDistance = (trigger.close / trigger.ma200) - 1;

  for (let index = triggerIndex + 1; index <= depthEndIndex; index += 1) {
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

  const seriesStartIndex = Math.max(0, triggerIndex - MA200_RETEST_PREPARE_DAYS);
  const series = allHistory
    .slice(seriesStartIndex, observationEndIndex + 1)
    .map((row) => ({
      date: row.date,
      close: row.close,
      ma200: row.ma200,
    }));

  return {
    triggerDate: trigger.date,
    status: complete ? (recovered ? 'recovered' : 'failed') : 'observing',
    triggerClose: trigger.close,
    triggerMa200: trigger.ma200,
    retestDepthPct: lowestDistance * 100,
    maxReboundPct: ((reboundHigh / lowRow.close) - 1) * 100,
    recoveryTradingDays: recovered ? recoveryConfirmationIndex - triggerIndex : null,
    recoveryDate: recovered ? allHistory[recoveryConfirmationIndex].date : '',
    lowDate: lowRow.date,
    observedTradingDays,
    observationEndDate: allHistory[observationEndIndex].date,
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

  const resolvedEvents = recentEvents
    .filter((event) => event.status !== 'observing')
    .slice(-MA200_RETEST_RESOLVED_LIMIT);
  const latestObservingEvent = recentEvents
    .filter((event) => event.status === 'observing')
    .at(-1);
  const recoveredEvents = resolvedEvents.filter((event) => event.status === 'recovered');
  const resolvedSampleSize = resolvedEvents.length;
  const events = [
    ...(latestObservingEvent ? [latestObservingEvent] : []),
    ...resolvedEvents.slice().reverse(),
  ].sort((left, right) => right.triggerDate.localeCompare(left.triggerDate));

  return {
    algorithmVersion: MA200_RETEST_ALGORITHM_VERSION,
    asOfDate: latestDate,
    status: 'ready',
    basis: 'adjusted_close',
    maWindowTradingDays: DAILY_MA_WINDOW,
    observationTradingDays: MA200_RETEST_OBSERVATION_DAYS,
    lookbackYears: MA200_RETEST_LOOKBACK_YEARS,
    summary: {
      resolvedSampleSize,
      recoveredCount: recoveredEvents.length,
      recoveryRatePct: resolvedSampleSize > 0
        ? (recoveredEvents.length / resolvedSampleSize) * 100
        : null,
      averageRetestDepthPct: averageOrNull(
        resolvedEvents.map((event) => event.retestDepthPct),
      ),
      averageMaxReboundPct: averageOrNull(
        resolvedEvents.map((event) => event.maxReboundPct),
      ),
      averageRecoveryTradingDays: averageOrNull(
        recoveredEvents.map((event) => event.recoveryTradingDays),
      ),
    },
    events,
  };
}

export function buildEodhdStockDetail(rows = [], { asOfDate } = {}) {
  const cutoffDate = validDateKey(asOfDate);
  if (!cutoffDate) {
    return {
      source: 'EODHD_EOD',
      priceBasis: 'adjusted_close',
      currency: 'USD',
      asOfDate: '',
      history: [],
      weeklyHistory: [],
      ma200RetestHistory: emptyMa200RetestHistory(),
      indicators: {
        week52High: null,
        ma200: null,
        ema30: null,
        volatility20AnnualizedPct: null,
        ...emptyWeeklyIndicators(),
      },
    };
  }

  const normalizedRows = normalizeRows(rows, cutoffDate);
  // Build the rolling daily MA from the full provider history before trimming
  // the response window, so the first visible point still has a real warmup.
  const allHistory = buildDailyHistory(normalizedRows);
  const latestDate = allHistory.at(-1)?.date || '';
  const dailyHistoryFrom = latestDate ? shiftDateKey(latestDate, -DAILY_HISTORY_DAYS) : '';
  const history = dailyHistoryFrom
    ? allHistory.filter((row) => row.date >= dailyHistoryFrom)
    : [];
  const closes = history.map((row) => row.close);
  const week52Start = latestDate
    ? shiftDateKey(latestDate, -FIFTY_TWO_WEEKS_IN_DAYS)
    : '';
  const week52Rows = week52Start
    ? normalizedRows.filter((row) => row.date >= week52Start && row.date <= latestDate)
    : [];
  const week52High = week52Rows.length > 0
    ? Math.max(...week52Rows.map((row) => row.adjustedHigh))
    : null;
  const ma200 = allHistory.at(-1)?.ma200 ?? null;
  const weeklyDetail = buildWeeklyDetail(normalizedRows, cutoffDate);
  const ma200RetestHistory = buildMa200RetestHistory(allHistory, latestDate);

  return {
    source: 'EODHD_EOD',
    priceBasis: 'adjusted_close',
    currency: 'USD',
    asOfDate: latestDate,
    history,
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
