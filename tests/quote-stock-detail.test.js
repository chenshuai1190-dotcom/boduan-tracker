import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/quote.js';
import { fetchStockQuote } from '../server/quote/providers/eodhd.js';
import { buildEodhdStockDetail } from '../server/quote/stockDetail.js';

function buildStockDetail(rows, options = {}) {
  return buildEodhdStockDetail(rows, {
    ...options,
    splitActions: options.splitActions ?? [],
  });
}

function dateKeyFrom(startDate, offsetDays) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function weeklyRows(count, { startDate = '2022-01-07', close = (index) => index + 1 } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const value = close(index);
    return {
      date: dateKeyFrom(startDate, index * 7),
      close: value,
      adjusted_close: value,
      high: value + 1,
    };
  });
}

function ma200RatioFixture({ startDate = '2024-01-02', dividendAdjustmentFactor = 1 } = {}) {
  const splitAdjustedCloses = Array.from({ length: 199 }, () => 100);
  const triggerIndexes = [];

  const appendAtMaRatio = (ratio) => {
    const priorWindowSum = splitAdjustedCloses
      .slice(-(200 - 1))
      .reduce((sum, value) => sum + value, 0);
    const close = (ratio * priorWindowSum) / (200 - ratio);
    splitAdjustedCloses.push(close);
    return splitAdjustedCloses.length - 1;
  };

  const appendEvent = ({ recovered = true, observedDays = 60 } = {}) => {
    for (let index = 0; index < 5; index += 1) appendAtMaRatio(1.05);
    triggerIndexes.push(appendAtMaRatio(0.95));
    for (let index = 0; index < observedDays; index += 1) {
      if (recovered && (index === 1 || index === 2)) appendAtMaRatio(1.01);
      else if (recovered && index > 2) appendAtMaRatio(1.01);
      else appendAtMaRatio(0.98);
    }
  };

  const rows = () => splitAdjustedCloses.map((splitAdjustedClose, index) => ({
    date: dateKeyFrom(startDate, index),
    close: splitAdjustedClose,
    adjusted_close: splitAdjustedClose / dividendAdjustmentFactor,
    high: splitAdjustedClose * 1.01,
  }));

  return {
    appendAtMaRatio,
    appendEvent,
    triggerIndexes,
    rows,
  };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function createRequest(symbols, view) {
  return {
    method: 'GET',
    headers: {},
    query: {
      symbols,
      ...(view ? { view } : {}),
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('stock detail strictly keeps valid raw closes, ignores dividend adjustments, sorts dates, deduplicates, and drops future rows', () => {
  const detail = buildStockDetail([
    { date: '2026-07-18', close: 1000, adjusted_close: 1000, high: 1001 },
    { date: '2026-07-16', close: 10, adjusted_close: 20, high: 12 },
    { date: '2026-07-14', close: 9, adjusted_close: 9, high: 10 },
    { date: '2026-07-15', close: 10, adjusted_close: 10, high: 11 },
    { date: '2026-07-14', close: 11, adjusted_close: 11, high: 13 },
    { date: '2026-07-15', close: 0, adjusted_close: 999, high: 999 },
    { date: '2026-07-13', close: -1, adjusted_close: 999, high: 999 },
    { date: '2026-07-12', close: null, adjusted_close: 999, high: 999 },
    { date: '2026-02-30', close: 999, adjusted_close: 999, high: 999 },
    { date: 'invalid', close: 999, adjusted_close: 999, high: 999 },
  ], { asOfDate: '2026-07-17' });

  assert.deepEqual(detail.history, [
    { date: '2026-07-14', close: 11, ma200: null },
    { date: '2026-07-15', close: 10, ma200: null },
    { date: '2026-07-16', close: 10, ma200: null },
  ]);
  assert.equal(detail.asOfDate, '2026-07-16');
  assert.equal(detail.indicators.week52High, 13);
  assert.equal(detail.indicators.ma200, null);
  assert.equal(detail.indicators.ema30, null);
  assert.equal(detail.indicators.volatility20AnnualizedPct, null);
  assert.equal(detail.indicators.ma200Weekly, null);
  assert.equal(detail.indicators.ma200WeeklyAvailableWeeks, 0);
  assert.equal(detail.indicators.ma200WeeklyStatus, 'insufficient_data');
  assert.equal(detail.weeklyHistory.length, 1);
  assert.equal(detail.weeklyHistory[0].completed, false);
});

test('stock detail calculates MA200, seeded EMA30, and 20-return sample annualized volatility', () => {
  const rows = Array.from({ length: 201 }, (_, index) => {
    const close = index + 1;
    return {
      date: dateKeyFrom('2025-12-01', index),
      close,
      adjusted_close: close,
      high: close + 1,
    };
  });
  const detail = buildStockDetail(rows, { asOfDate: '2026-07-17' });
  const last21 = Array.from({ length: 21 }, (_, index) => 181 + index);
  const logReturns = last21.slice(1).map((close, index) => Math.log(close / last21[index]));
  const averageReturn = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
  const sampleVariance = logReturns.reduce(
    (sum, value) => sum + ((value - averageReturn) ** 2),
    0,
  ) / (logReturns.length - 1);
  const expectedVolatility = Math.sqrt(sampleVariance) * Math.sqrt(252) * 100;

  assert.equal(detail.history.length, 201);
  assert.equal(detail.history[198].ma200, null);
  assert.equal(detail.history[199].ma200, 100.5);
  assert.equal(detail.history[200].ma200, 101.5);
  assert.equal(detail.indicators.week52High, 202);
  assert.equal(detail.indicators.ma200, 101.5);
  assert.equal(detail.indicators.ema30, 186.5);
  assert.ok(Math.abs(detail.indicators.volatility20AnnualizedPct - expectedVolatility) < 1e-12);
});

test('stock detail derives split-only prices from raw EOD rows and applies a split only to earlier sessions', () => {
  const detail = buildStockDetail([
    { date: '2024-01-02', close: 400, adjusted_close: 95, high: 408 },
    { date: '2024-01-03', close: 102, adjusted_close: 24, high: 104 },
    { date: '2024-01-04', close: 105, adjusted_close: 25, high: 107 },
  ], {
    asOfDate: '2024-01-04',
    splitActions: [{ date: '2024-01-03', split: '4.000000/1.000000' }],
  });

  assert.equal(detail.source, 'EODHD_EOD_SPLITS');
  assert.equal(detail.priceBasis, 'split_adjusted_close');
  assert.equal(detail.relativeReturnPriceBasis, 'adjusted_close');
  assert.equal(detail.splitActionCount, 1);
  assert.deepEqual(detail.history, [
    { date: '2024-01-02', close: 100, ma200: null },
    { date: '2024-01-03', close: 102, ma200: null },
    { date: '2024-01-04', close: 105, ma200: null },
  ]);
  assert.deepEqual(detail.relativeReturnHistory, [
    { date: '2024-01-02', close: 95 },
    { date: '2024-01-03', close: 24 },
    { date: '2024-01-04', close: 25 },
  ]);
  assert.equal(detail.indicators.week52High, 107);
});

test('stock detail supports cumulative forward and reverse split factors', () => {
  const detail = buildStockDetail([
    { date: '2021-01-04', close: 100, adjusted_close: 1, high: 110 },
    { date: '2021-03-01', close: 60, adjusted_close: 1, high: 66 },
    { date: '2021-05-03', close: 300, adjusted_close: 1, high: 330 },
  ], {
    asOfDate: '2021-05-03',
    splitActions: [
      { date: '2021-03-01', split: '2/1' },
      { date: '2021-05-03', split: '1/5' },
    ],
  });

  assert.deepEqual(detail.history.map((row) => row.close), [250, 300, 300]);
  assert.equal(detail.indicators.week52High, 330);
});

test('stock detail ignores split actions after the requested cutoff date', () => {
  const detail = buildStockDetail([
    { date: '2024-01-02', close: 100, adjusted_close: 99, high: 101 },
    { date: '2024-01-03', close: 102, adjusted_close: 101, high: 103 },
  ], {
    asOfDate: '2024-01-03',
    splitActions: [{ date: '2024-02-01', split: '4/1' }],
  });

  assert.equal(detail.splitActionCount, 0);
  assert.deepEqual(detail.history.map((row) => row.close), [100, 102]);
});

test('stock detail fails closed when split metadata is missing or malformed', () => {
  const rows = [{ date: '2026-07-17', close: 100, adjusted_close: 99, high: 101 }];
  for (const options of [
    { asOfDate: '2026-07-17' },
    { asOfDate: '2026-07-17', splitActions: [{ date: '2026-01-01', split: 'bad' }] },
    {
      asOfDate: '2026-07-17',
      splitActions: [
        { date: '2026-01-01', split: '2/1' },
        { date: '2026-01-01', split: '3/1' },
      ],
    },
  ]) {
    const detail = buildEodhdStockDetail(rows, options);
    assert.equal(detail.priceBasis, 'split_adjusted_close');
    assert.equal(detail.ma200RetestHistory.status, 'unavailable');
    assert.equal(detail.indicators.ma200WeeklyStatus, 'unavailable');
    assert.deepEqual(detail.history, []);
  }
});

test('daily MA200 uses hidden ten-year warmup before the bounded history payload', () => {
  const rows = Array.from({ length: 600 }, (_, index) => {
    const close = index + 1;
    return {
      date: dateKeyFrom('2024-01-01', index),
      close,
      adjusted_close: close,
      high: close + 1,
    };
  });
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const firstVisible = detail.history[0];
  const sourceIndex = rows.findIndex((row) => row.date === firstVisible.date);
  const expectedMa = rows
    .slice(sourceIndex - 199, sourceIndex + 1)
    .reduce((sum, row) => sum + row.close, 0) / 200;

  assert.ok(detail.history.length < rows.length, 'the response should keep its existing bounded daily payload');
  assert.ok(sourceIndex >= 199, 'the hidden provider rows should be available as warmup');
  assert.equal(firstVisible.ma200, expectedMa);
  assert.equal(detail.history.at(-1).ma200, detail.indicators.ma200);
});

test('daily MA200 retest uses split-adjusted closes without dividends, a 60-session outcome window, and a separate 20-session recent window', () => {
  const fixture = ma200RatioFixture({ dividendAdjustmentFactor: 2 });
  fixture.appendEvent({ recovered: true });
  fixture.appendAtMaRatio(1.01);
  const rows = fixture.rows();
  const triggerIndex = fixture.triggerIndexes[0];
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const history = detail.ma200RetestHistory;
  const event = history.events[0];

  assert.equal(history.algorithmVersion, 'daily-ma200-retest-v4');
  assert.equal(history.basis, 'split_adjusted_close');
  assert.equal(history.maWindowTradingDays, 200);
  assert.equal(history.triggerBasis, 'daily_close_at_or_below_ma200');
  assert.equal(history.prepareTradingDays, 5);
  assert.equal(history.prepareDistancePct, 3);
  assert.equal(history.recoveryConfirmationTradingDays, 2);
  assert.equal(history.observationTradingDays, 60);
  assert.equal(history.recentReboundTradingDays, 20);
  assert.equal(history.lookbackYears, 5);
  assert.equal(history.status, 'ready');
  assert.equal(history.summary.resolvedSampleSize, 1);
  assert.equal(history.summary.recoveredCount, 1);
  assert.equal(history.summary.recoveryRatePct, 100);
  assert.equal(history.summary.maxReboundSampleSize, 1);

  assert.equal(event.triggerDate, rows[triggerIndex].date);
  assert.equal(event.status, 'recovered');
  assert.equal(event.recoveryTradingDays, 3);
  assert.equal(event.recoveryDate, rows[triggerIndex + 3].date);
  assert.equal(event.observedTradingDays, 60);
  assert.equal(event.observationEndDate, rows[triggerIndex + 60].date);
  assert.equal(event.recentObservedTradingDays, 20);
  assert.equal(event.recentReboundComplete, true);
  assert.equal(event.recentReboundStatus, 'recovered');
  assert.equal(event.recentRecoveryTradingDays, 3);
  assert.equal(event.recentRecoveryDate, rows[triggerIndex + 3].date);
  assert.equal(event.recentReboundEndDate, rows[triggerIndex + 20].date);
  assert.ok(Number.isFinite(event.recentRetestDepthPct));
  assert.ok(Number.isFinite(event.recentMaxReboundPct));
  assert.equal(history.summary.averageRetestDepthPct, event.recentRetestDepthPct);
  assert.equal(history.summary.averageMaxReboundPct, event.maxReboundPct);
  assert.equal(history.summary.averageRecoveryTradingDays, event.recentRecoveryTradingDays);
  assert.ok(Math.abs(event.triggerClose / event.triggerMa200 - 0.95) < 1e-12);
  assert.ok(Math.abs(event.retestDepthPct - (-5)) < 1e-10);
  assert.equal(event.series.length, 26);
  assert.equal(event.series[0].date, rows[triggerIndex - 5].date);
  assert.equal(event.series.at(-1).date, rows[triggerIndex + 20].date);
  assert.notEqual(event.series.at(-1).date, rows.at(-1).date);
  assert.equal(event.series[5].close, rows[triggerIndex].close);
  assert.notEqual(event.series[5].close, rows[triggerIndex].adjusted_close);
});

test('daily MA200 retest keeps its summary on completed outcomes from the same latest-five trigger cohort', () => {
  const fixture = ma200RatioFixture();
  const recoveredByCycle = [true, false, true, false, true, false, true];
  for (const recovered of recoveredByCycle) fixture.appendEvent({ recovered });
  fixture.appendEvent({ recovered: false, observedDays: 4 });
  const rows = fixture.rows();
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const history = detail.ma200RetestHistory;
  const resolvedEvents = history.events.filter((event) => event.status !== 'observing');

  assert.equal(history.status, 'ready');
  assert.equal(history.summary.resolvedSampleSize, 4);
  assert.equal(history.summary.recoveredCount, 2);
  assert.equal(history.summary.recoveryRatePct, 50);
  assert.equal(history.summary.averageRecoveryTradingDays, 3);
  assert.equal(history.events.length, 5);
  assert.equal(history.events[0].status, 'observing');
  assert.equal(history.events[0].observedTradingDays, 4);
  assert.equal(history.events[0].observationEndDate, rows.at(-1).date);
  assert.equal(history.events[0].recentObservedTradingDays, 4);
  assert.equal(history.events[0].recentReboundComplete, false);
  assert.equal(history.events[0].recentReboundStatus, 'observing');
  assert.equal(history.events[0].recentRecoveryTradingDays, null);
  assert.equal(history.events[0].recentRecoveryDate, '');
  assert.equal(history.events[0].recentRetestDepthPct, null);
  assert.equal(history.events[0].recentMaxReboundPct, null);
  assert.equal(history.events[0].recentReboundEndDate, '');
  assert.equal(history.events[0].series.length, 10);
  assert.deepEqual(
    resolvedEvents.map((event) => event.status),
    ['recovered', 'failed', 'recovered', 'failed'],
  );
  assert.deepEqual(
    resolvedEvents.map((event) => event.triggerDate),
    fixture.triggerIndexes.slice(3, 7).reverse().map((index) => rows[index].date),
  );
  assert.ok(Number.isFinite(history.summary.averageRetestDepthPct));
  assert.ok(Number.isFinite(history.summary.averageMaxReboundPct));
});

test('daily MA200 retest excludes triggers older than five years without losing MA200 warmup rows', () => {
  const fixture = ma200RatioFixture({ startDate: '2019-01-02' });
  fixture.appendEvent({ recovered: true });
  fixture.appendEvent({ recovered: false });
  const secondCycleStart = fixture.triggerIndexes[1] - 5;
  const rows = fixture.rows().map((row, index) => ({
    ...row,
    date: index < secondCycleStart
      ? dateKeyFrom('2019-01-02', index)
      : dateKeyFrom('2026-01-02', index - secondCycleStart),
  }));
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const history = detail.ma200RetestHistory;

  assert.equal(history.summary.resolvedSampleSize, 1);
  assert.equal(history.summary.recoveredCount, 0);
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].triggerDate, rows[fixture.triggerIndexes[1]].date);
  assert.equal(history.events[0].status, 'failed');
});

test('daily MA200 retest requires two consecutive closes above their own daily MA200 to recover', () => {
  const fixture = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) fixture.appendAtMaRatio(1.05);
  fixture.triggerIndexes.push(fixture.appendAtMaRatio(0.95));
  for (let index = 0; index < 60; index += 1) {
    fixture.appendAtMaRatio(index % 2 === 0 ? 1.01 : 0.99);
  }
  const rows = fixture.rows();
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const history = detail.ma200RetestHistory;

  assert.equal(history.summary.resolvedSampleSize, 1);
  assert.equal(history.summary.recoveredCount, 0);
  assert.equal(history.summary.averageRecoveryTradingDays, null);
  assert.equal(history.events[0].status, 'failed');
  assert.equal(history.events[0].recoveryTradingDays, null);
});

test('daily MA200 retest accepts recovery on session 60 but rejects recovery completed on session 61', () => {
  const onTime = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) onTime.appendAtMaRatio(1.05);
  onTime.triggerIndexes.push(onTime.appendAtMaRatio(0.95));
  for (let index = 1; index <= 60; index += 1) {
    onTime.appendAtMaRatio(index >= 59 ? 1.01 : 0.98);
  }
  const onTimeRows = onTime.rows();
  const onTimeDetail = buildStockDetail(onTimeRows, { asOfDate: onTimeRows.at(-1).date });

  assert.equal(onTimeDetail.ma200RetestHistory.events[0].status, 'recovered');
  assert.equal(onTimeDetail.ma200RetestHistory.events[0].recoveryTradingDays, 60);

  const tooLate = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) tooLate.appendAtMaRatio(1.05);
  tooLate.triggerIndexes.push(tooLate.appendAtMaRatio(0.95));
  for (let index = 1; index <= 61; index += 1) {
    tooLate.appendAtMaRatio(index >= 60 ? 1.01 : 0.98);
  }
  const tooLateRows = tooLate.rows();
  const tooLateDetail = buildStockDetail(tooLateRows, { asOfDate: tooLateRows.at(-1).date });

  assert.equal(tooLateDetail.ma200RetestHistory.events[0].status, 'failed');
  assert.equal(tooLateDetail.ma200RetestHistory.events[0].recoveryTradingDays, null);
  assert.equal(
    tooLateDetail.ma200RetestHistory.events[0].observationEndDate,
    tooLateRows[tooLate.triggerIndexes[0] + 60].date,
  );
});

test('latest-five details accept recovery on session 20 but reject recovery completed on session 21', () => {
  const onTime = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) onTime.appendAtMaRatio(1.05);
  onTime.triggerIndexes.push(onTime.appendAtMaRatio(0.95));
  for (let index = 1; index <= 20; index += 1) {
    onTime.appendAtMaRatio(index >= 19 ? 1.01 : 0.98);
  }
  const onTimeRows = onTime.rows();
  const onTimeEvent = buildStockDetail(
    onTimeRows,
    { asOfDate: onTimeRows.at(-1).date },
  ).ma200RetestHistory.events[0];

  assert.equal(onTimeEvent.recentReboundStatus, 'recovered');
  assert.equal(onTimeEvent.recentRecoveryTradingDays, 20);

  const tooLate = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) tooLate.appendAtMaRatio(1.05);
  tooLate.triggerIndexes.push(tooLate.appendAtMaRatio(0.95));
  for (let index = 1; index <= 21; index += 1) {
    tooLate.appendAtMaRatio(index >= 20 ? 1.01 : 0.98);
  }
  const tooLateRows = tooLate.rows();
  const tooLateEvent = buildStockDetail(
    tooLateRows,
    { asOfDate: tooLateRows.at(-1).date },
  ).ma200RetestHistory.events[0];

  assert.equal(tooLateEvent.recentReboundStatus, 'failed');
  assert.equal(tooLateEvent.recentRecoveryTradingDays, null);
  assert.equal(tooLateEvent.status, 'observing');
  assert.equal(tooLateEvent.recoveryTradingDays, 21);
});

test('daily MA200 retest keeps every latest observing trigger instead of dropping overlapping events', () => {
  const fixture = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) fixture.appendAtMaRatio(1.05);
  fixture.triggerIndexes.push(fixture.appendAtMaRatio(0.95));
  for (let index = 0; index < 5; index += 1) fixture.appendAtMaRatio(1.05);
  fixture.triggerIndexes.push(fixture.appendAtMaRatio(0.95));
  for (let index = 0; index < 4; index += 1) fixture.appendAtMaRatio(0.98);
  const rows = fixture.rows();
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const history = detail.ma200RetestHistory;

  assert.equal(history.summary.resolvedSampleSize, 0);
  assert.equal(history.events.length, 2);
  assert.deepEqual(
    history.events.map((event) => event.triggerDate),
    fixture.triggerIndexes.slice().reverse().map((index) => rows[index].date),
  );
  assert.ok(history.events.every((event) => event.status === 'observing'));
});

test('daily MA200 retest keeps the 20-session rebound independent from its 60-session summary rebound', () => {
  const fixture = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) fixture.appendAtMaRatio(1.05);
  fixture.triggerIndexes.push(fixture.appendAtMaRatio(0.95));
  for (let day = 1; day <= 60; day += 1) {
    if (day === 1) fixture.appendAtMaRatio(0.90);
    else if (day >= 59) fixture.appendAtMaRatio(1.10);
    else fixture.appendAtMaRatio(0.99);
  }
  const rows = fixture.rows();
  const triggerIndex = fixture.triggerIndexes[0];
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const history = detail.ma200RetestHistory;
  const event = history.events[0];

  assert.equal(event.status, 'recovered');
  assert.equal(event.recoveryTradingDays, 60);
  assert.equal(event.recentReboundComplete, true);
  assert.equal(event.recentReboundStatus, 'failed');
  assert.equal(event.recentRecoveryTradingDays, null);
  assert.equal(event.recentRecoveryDate, '');
  assert.equal(event.recentReboundEndDate, rows[triggerIndex + 20].date);
  assert.equal(event.series.at(-1).date, rows[triggerIndex + 20].date);
  assert.ok(event.maxReboundPct > event.recentMaxReboundPct);
  assert.equal(history.summary.resolvedSampleSize, 1);
  assert.equal(history.summary.recoveredCount, 0);
  assert.equal(history.summary.recoveryRatePct, 0);
  assert.equal(history.summary.averageRecoveryTradingDays, null);
  assert.equal(history.summary.averageRetestDepthPct, event.recentRetestDepthPct);
  assert.equal(history.summary.maxReboundSampleSize, 1);
  assert.equal(history.summary.averageMaxReboundPct, event.maxReboundPct);
  assert.notEqual(history.summary.averageMaxReboundPct, event.recentMaxReboundPct);
});

test('daily MA200 retest leaves the 20-session display metrics empty until session 20 closes', () => {
  const fixture = ma200RatioFixture();
  fixture.appendEvent({ recovered: false, observedDays: 19 });
  const beforeRows = fixture.rows();
  const triggerIndex = fixture.triggerIndexes[0];
  const before = buildStockDetail(beforeRows, { asOfDate: beforeRows.at(-1).date });
  const beforeEvent = before.ma200RetestHistory.events[0];

  assert.equal(beforeEvent.status, 'observing');
  assert.equal(beforeEvent.observedTradingDays, 19);
  assert.equal(beforeEvent.recentObservedTradingDays, 19);
  assert.equal(beforeEvent.recentReboundComplete, false);
  assert.equal(beforeEvent.recentReboundStatus, 'observing');
  assert.equal(beforeEvent.recentRetestDepthPct, null);
  assert.equal(beforeEvent.recentMaxReboundPct, null);
  assert.equal(beforeEvent.recentReboundEndDate, '');
  assert.equal(beforeEvent.series.at(-1).date, beforeRows.at(-1).date);

  fixture.appendAtMaRatio(0.98);
  const completeRows = fixture.rows();
  const complete = buildStockDetail(completeRows, { asOfDate: completeRows.at(-1).date });
  const completeEvent = complete.ma200RetestHistory.events[0];

  assert.equal(completeEvent.status, 'observing');
  assert.equal(completeEvent.observedTradingDays, 20);
  assert.equal(completeEvent.recentObservedTradingDays, 20);
  assert.equal(completeEvent.recentReboundComplete, true);
  assert.equal(completeEvent.recentReboundStatus, 'failed');
  assert.ok(Number.isFinite(completeEvent.recentRetestDepthPct));
  assert.ok(Number.isFinite(completeEvent.recentMaxReboundPct));
  assert.equal(completeEvent.recentReboundEndDate, completeRows[triggerIndex + 20].date);
  assert.equal(completeEvent.series.at(-1).date, completeRows[triggerIndex + 20].date);
  assert.equal(complete.ma200RetestHistory.summary.resolvedSampleSize, 1);
  assert.equal(complete.ma200RetestHistory.summary.recoveredCount, 0);
  assert.equal(complete.ma200RetestHistory.summary.recoveryRatePct, 0);
  assert.equal(complete.ma200RetestHistory.summary.maxReboundSampleSize, 0);
  assert.equal(complete.ma200RetestHistory.summary.averageMaxReboundPct, null);
});

test('daily MA200 retest keeps its trigger date stable as later sessions resolve the event', () => {
  const fixture = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) fixture.appendAtMaRatio(1.05);
  fixture.triggerIndexes.push(fixture.appendAtMaRatio(0.95));
  for (let index = 0; index < 4; index += 1) fixture.appendAtMaRatio(0.98);

  const observingRows = fixture.rows();
  const observing = buildStockDetail(observingRows, { asOfDate: observingRows.at(-1).date });
  const triggerDate = observing.ma200RetestHistory.events[0].triggerDate;
  assert.equal(observing.ma200RetestHistory.events[0].status, 'observing');

  for (let index = 4; index < 60; index += 1) fixture.appendAtMaRatio(0.98);
  const resolvedRows = fixture.rows();
  const resolved = buildStockDetail(resolvedRows, { asOfDate: resolvedRows.at(-1).date });

  assert.equal(resolved.ma200RetestHistory.events[0].status, 'failed');
  assert.equal(resolved.ma200RetestHistory.events[0].triggerDate, triggerDate);
});

test('daily MA200 retest requires five consecutive closes at least 3% above MA200 before arming', () => {
  const fixture = ma200RatioFixture();
  for (let index = 0; index < 4; index += 1) fixture.appendAtMaRatio(1.05);
  fixture.appendAtMaRatio(1.02);
  fixture.appendAtMaRatio(0.95);
  for (let index = 0; index < 60; index += 1) fixture.appendAtMaRatio(1.01);
  const rows = fixture.rows();
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });

  assert.equal(detail.ma200RetestHistory.status, 'no_events');
  assert.equal(detail.ma200RetestHistory.summary.resolvedSampleSize, 0);
  assert.deepEqual(detail.ma200RetestHistory.events, []);
});

test('daily MA200 retest includes exact 3% preparation and exact MA200 touch boundaries', () => {
  const fixture = ma200RatioFixture();
  for (let index = 0; index < 5; index += 1) fixture.appendAtMaRatio(1.03);
  const triggerIndex = fixture.appendAtMaRatio(1);
  for (let index = 0; index < 60; index += 1) fixture.appendAtMaRatio(0.98);
  const rows = fixture.rows();
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });
  const event = detail.ma200RetestHistory.events[0];

  assert.equal(detail.ma200RetestHistory.events.length, 1);
  assert.equal(event.triggerDate, rows[triggerIndex].date);
  assert.equal(event.status, 'failed');
  assert.ok(Math.abs((event.triggerClose / event.triggerMa200) - 1) < 1e-12);
});

test('stock detail returns null for insufficient windows and preserves zero volatility', () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    date: dateKeyFrom('2026-01-01', index),
    close: 100,
    adjusted_close: 100,
    high: 101,
  }));

  const twenty = buildStockDetail(rows.slice(0, 20), { asOfDate: '2026-02-20' });
  assert.equal(twenty.indicators.ma200, null);
  assert.equal(twenty.indicators.ema30, null);
  assert.equal(twenty.indicators.volatility20AnnualizedPct, null);
  assert.equal(twenty.ma200RetestHistory.status, 'insufficient_data');

  const twentyOne = buildStockDetail(rows.slice(0, 21), { asOfDate: '2026-02-20' });
  assert.equal(twentyOne.indicators.volatility20AnnualizedPct, 0);

  const thirty = buildStockDetail(rows, { asOfDate: '2026-02-20' });
  assert.equal(thirty.indicators.ema30, 100);
});

test('stock detail 52-week split-adjusted high includes exactly 364 days back and excludes older rows', () => {
  const detail = buildStockDetail([
    { date: '2025-07-17', close: 100, adjusted_close: 100, high: 999 },
    { date: '2025-07-18', close: 100, adjusted_close: 200, high: 150 },
    { date: '2026-07-17', close: 200, adjusted_close: 200, high: 220 },
  ], { asOfDate: '2026-07-17' });

  assert.equal(detail.indicators.week52High, 220);
});

test('stock detail builds a locked 200-week MA from real weekly closes and exposes factual trend fields', () => {
  const rows = weeklyRows(204);
  const asOfDate = rows.at(-1).date;
  const detail = buildStockDetail(rows, { asOfDate });

  assert.equal(detail.indicators.ma200Weekly, 104.5);
  assert.equal(detail.indicators.ma200WeeklyClose, 204);
  assert.equal(detail.indicators.ma200WeeklyDistancePct, ((204 / 104.5) - 1) * 100);
  assert.equal(detail.indicators.ma200WeeklyChange4WeekPct, ((104.5 / 100.5) - 1) * 100);
  assert.equal(detail.indicators.ma200WeeklySide, 'above');
  assert.equal(detail.indicators.ma200WeeklyStreakWeeks, 5);
  assert.equal(detail.indicators.ma200WeeklyAvailableWeeks, 204);
  assert.equal(detail.indicators.ma200WeeklyRequiredWeeks, 200);
  assert.equal(detail.indicators.ma200WeeklyAsOfDate, asOfDate);
  assert.equal(detail.indicators.ma200WeeklyStatus, 'ready');
  assert.equal(detail.weeklyHistory.at(-1).ma200, 104.5);
  assert.equal(detail.weeklyHistory.at(-1).completed, true);
});

test('an in-progress trading week updates the green weekly close but never advances the locked MA200', () => {
  const completedRows = weeklyRows(204);
  const lastCompleted = completedRows.at(-1);
  const inProgressDate = dateKeyFrom(lastCompleted.date, 5);
  const detail = buildStockDetail([
    ...completedRows,
    { date: inProgressDate, close: 999, adjusted_close: 999, high: 1000 },
  ], { asOfDate: inProgressDate });

  assert.equal(detail.weeklyHistory.at(-1).date, inProgressDate);
  assert.equal(detail.weeklyHistory.at(-1).close, 999);
  assert.equal(detail.weeklyHistory.at(-1).ma200, null);
  assert.equal(detail.weeklyHistory.at(-1).completed, false);
  assert.equal(detail.indicators.ma200Weekly, 104.5);
  assert.equal(detail.indicators.ma200WeeklyClose, 204);
  assert.equal(detail.indicators.ma200WeeklyAsOfDate, lastCompleted.date);
});

test('five-year weekly output keeps hidden warmup data out of the payload while the MA line starts fully formed', () => {
  const rows = weeklyRows(470, { startDate: '2017-07-07', close: (index) => 50 + index * 0.5 });
  const detail = buildStockDetail(rows, { asOfDate: rows.at(-1).date });

  assert.ok(detail.weeklyHistory.length >= 260 && detail.weeklyHistory.length <= 263);
  assert.ok(detail.weeklyHistory.every((row) => Number.isFinite(row.ma200)));
  assert.ok(detail.history.length < rows.length, 'daily payload should stay bounded even when the provider supplies ten years');
});

test('stock-detail view is opt-in, returns real EOD calculations, and does not expose the provider key', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 10);
  const endDateKey = endDate.toISOString().slice(0, 10);
  const startDate = new Date(`${endDateKey}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 219);
  const startDateKey = startDate.toISOString().slice(0, 10);
  const eodRows = Array.from({ length: 220 }, (_, index) => {
    const close = 100 + index;
    return {
      date: dateKeyFrom(startDateKey, index),
      close,
      adjusted_close: close,
      high: close + 2,
      low: close - 2,
    };
  });
  const oldExtremeRow = {
    date: '2018-01-05',
    close: 10_000,
    adjusted_close: 10_000,
    high: 20_000,
    low: 9_000,
  };
  const requestedEodFrom = [];
  const requestedSplits = [];

  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      return jsonResponse({
        data: {
          'NVDA.US': {
            ethPrice: null,
            lastTradePrice: '325',
            previousClosePrice: '319',
            high: '326',
            low: '316',
            open: '320',
            timestamp: 1783000000,
            change: '6',
            changePercent: '1.88',
          },
        },
      });
    }
    if (parsed.pathname.includes('/api/eod/')) {
      const requestedFrom = parsed.searchParams.get('from');
      requestedEodFrom.push(requestedFrom);
      return jsonResponse([oldExtremeRow, ...eodRows].filter((row) => row.date >= requestedFrom));
    }
    if (parsed.pathname.includes('/api/splits/')) {
      requestedSplits.push({
        pathname: parsed.pathname,
        from: parsed.searchParams.get('from'),
        to: parsed.searchParams.get('to'),
      });
      return jsonResponse([]);
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({
        chart: {
          result: [{
            meta: {
              currentTradingPeriod: {
                regular: { start: 1782970200, end: 1782993600 },
              },
            },
            timestamp: [1782970200, 1782970500],
            indicators: { quote: [{ close: [320, 325] }] },
          }],
        },
      });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const defaultResponse = createResponse();
    await handler(createRequest('NVDA'), defaultResponse);
    assert.equal(defaultResponse.statusCode, 200);
    assert.equal(Object.hasOwn(defaultResponse.body.data[0], 'stockDetail'), false);
    assert.equal(requestedSplits.length, 0, 'ordinary quotes must not request split metadata');

    const detailResponse = createResponse();
    await handler(createRequest('NVDA', 'stock-detail'), detailResponse);
    assert.equal(detailResponse.statusCode, 200);
    const quote = detailResponse.body.data[0];
    assert.equal(quote.stockDetail.source, 'EODHD_EOD_SPLITS');
    assert.equal(quote.stockDetail.priceBasis, 'split_adjusted_close');
    assert.equal(quote.stockDetail.relativeReturnPriceBasis, 'adjusted_close');
    assert.equal(quote.stockDetail.splitActionCount, 0);
    assert.equal(quote.stockDetail.currency, 'USD');
    assert.equal(quote.stockDetail.asOfDate, endDateKey);
    assert.equal(quote.stockDetail.history.length, 220);
    assert.equal(quote.stockDetail.relativeReturnHistory.length, 220);
    assert.equal(quote.stockDetail.history.at(-1).ma200, 219.5);
    assert.equal(quote.stockDetail.indicators.ma200, 219.5);
    assert.equal(quote.stockDetail.indicators.ema30, 304.5);
    assert.equal(typeof quote.stockDetail.indicators.volatility20AnnualizedPct, 'number');
    assert.equal(quote.stockDetail.indicators.ma200WeeklyStatus, 'insufficient_data');
    assert.ok(Array.isArray(quote.stockDetail.weeklyHistory));
    assert.equal(requestedEodFrom.length, 2);
    assert.equal(requestedSplits.length, 1);
    assert.equal(requestedSplits[0].pathname, '/api/splits/NVDA.US');
    assert.equal(requestedSplits[0].from, requestedEodFrom[1]);
    assert.match(requestedSplits[0].to, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(requestedEodFrom[1] < requestedEodFrom[0], 'stock-detail must request the longer history window without slowing the default quote path');
    assert.equal(Number(requestedEodFrom[1].slice(0, 4)), new Date().getUTCFullYear() - 10);
    assert.equal(quote.week52High, 325, 'ten-year detail warmup must not leak into the ordinary quote high');
    assert.doesNotMatch(JSON.stringify(detailResponse.body), /test-eodhd-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('stock-detail provider passes non-empty split actions through the complete provider calculation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      return jsonResponse({
        data: {
          'NVDA.US': {
            ethPrice: null,
            lastTradePrice: '105',
            previousClosePrice: '102',
            high: '107',
            low: '100',
            open: '102',
            timestamp: 1704412800,
            change: '3',
            changePercent: '2.94',
          },
        },
      });
    }
    if (parsed.pathname.includes('/api/eod/')) {
      return jsonResponse([
        { date: '2024-01-02', close: 400, adjusted_close: 95, high: 408, low: 392 },
        { date: '2024-01-03', close: 102, adjusted_close: 24, high: 104, low: 99 },
        { date: '2024-01-04', close: 105, adjusted_close: 25, high: 107, low: 101 },
      ]);
    }
    if (parsed.pathname.includes('/api/splits/')) {
      assert.equal(parsed.pathname, '/api/splits/NVDA.US');
      return jsonResponse([
        { date: '2024-01-03', split: '4.000000/1.000000' },
      ]);
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({ chart: { result: [] } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const quote = await fetchStockQuote('NVDA', {
      eodhdKey: 'test-eodhd-key',
      includeStockDetail: true,
    });

    assert.equal(quote.error, undefined);
    assert.equal(quote.stockDetail.splitActionCount, 1);
    assert.deepEqual(quote.stockDetail.history, [
      { date: '2024-01-02', close: 100, ma200: null },
      { date: '2024-01-03', close: 102, ma200: null },
      { date: '2024-01-04', close: 105, ma200: null },
    ]);
    assert.deepEqual(quote.stockDetail.relativeReturnHistory, [
      { date: '2024-01-02', close: 95 },
      { date: '2024-01-03', close: 24 },
      { date: '2024-01-04', close: 25 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stock-detail view rejects multi-symbol and special-provider requests before provider access', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  delete process.env.EODHD_API_KEY;

  try {
    for (const symbols of ['NVDA,MSFT', 'VIX', 'FGI', 'INDICES', 'ANALYST:NVDA']) {
      const response = createResponse();
      await handler(createRequest(symbols, 'stock-detail'), response);
      assert.equal(response.statusCode, 400, symbols);
      assert.match(response.body.error, /仅支持单只普通美股/, symbols);
    }
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('stock-detail provider keeps invalid EOD payloads unavailable instead of claiming short history', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      return jsonResponse({
        data: {
          'MSFT.US': {
            ethPrice: null,
            lastTradePrice: '500',
            previousClosePrice: '495',
            high: '502',
            low: '493',
            open: '496',
            timestamp: 1783000000,
            change: '5',
            changePercent: '1.01',
          },
        },
      });
    }
    if (parsed.pathname.includes('/api/eod/')) {
      return jsonResponse([
        { date: 'invalid', close: 500, adjusted_close: 500, high: 501, low: 499 },
        { date: '2026-07-17', close: 0, adjusted_close: 0, high: 0, low: 0 },
      ]);
    }
    if (parsed.pathname.includes('/api/splits/')) {
      return jsonResponse([]);
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({ chart: { result: [] } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const quote = await fetchStockQuote('MSFT', { eodhdKey: 'test-eodhd-key', includeStockDetail: true });
    assert.equal(quote.stockDetail.indicators.ma200WeeklyStatus, 'unavailable');
    assert.deepEqual(quote.stockDetail.history, []);
    assert.deepEqual(quote.stockDetail.weeklyHistory, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stock-detail provider fails closed when split metadata is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      return jsonResponse({
        data: {
          'MSFT.US': {
            ethPrice: null,
            lastTradePrice: '500',
            previousClosePrice: '495',
            high: '502',
            low: '493',
            open: '496',
            timestamp: 1783000000,
            change: '5',
            changePercent: '1.01',
          },
        },
      });
    }
    if (parsed.pathname.includes('/api/eod/')) {
      return jsonResponse(Array.from({ length: 220 }, (_, index) => ({
        date: dateKeyFrom('2025-12-01', index),
        close: 300 + index,
        adjusted_close: 250 + index,
        high: 301 + index,
        low: 299 + index,
      })));
    }
    if (parsed.pathname.includes('/api/splits/')) {
      return jsonResponse({ error: 'temporarily unavailable' }, 503);
    }
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({ chart: { result: [] } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const quote = await fetchStockQuote('MSFT', {
      eodhdKey: 'test-eodhd-key',
      includeStockDetail: true,
    });
    assert.equal(quote.error, undefined);
    assert.equal(quote.stockDetail.priceBasis, 'split_adjusted_close');
    assert.equal(quote.stockDetail.ma200RetestHistory.status, 'unavailable');
    assert.equal(quote.stockDetail.indicators.ma200WeeklyStatus, 'unavailable');
    assert.deepEqual(quote.stockDetail.history, []);
    assert.deepEqual(quote.stockDetail.relativeReturnHistory, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
