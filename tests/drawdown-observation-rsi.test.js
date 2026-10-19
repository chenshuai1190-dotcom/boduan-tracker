import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveObservation } from '../src/lib/drawdownObservationModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';
import { wilderRsiSeries } from '../src/lib/wilderRsi.js';
import { buildStockRsi } from '../server/quote/stockRsi.js';

const DAY = 86400000;
const EMPTY = { value: null, asOf: null, previousValue: null, previousAsOf: null };

function history({ count = 80, end = '2026-10-16', close = i => 150 + Math.sin(i * 0.57) * 18 + i * 0.09 } = {}) {
  const dates = [], cursor = new Date(`${end}T00:00:00Z`);
  while (dates.length < count) {
    const date = cursor.toISOString().slice(0, 10);
    if (![0, 6].includes(cursor.getUTCDay()) && !isRegularNyseHoliday(date)) dates.unshift(date);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.map((date, i) => ({ date, close: close(i) }));
}

function observation(points, overrides = {}) {
  const asOfDate = points.at(-1)?.date;
  return { symbol: 'TEST', status: 'ready', source: 'EODHD_EOD', priceBasis: 'adjusted_close',
    points, asOfDate, expectedAsOfDate: asOfDate, ...overrides };
}

function quoteRsi(points, completedCutoffDate = points.at(-1).date) {
  return buildStockRsi(points.map(point => ({ date: point.date, adjusted_close: point.close })), { completedCutoffDate });
}

function rsiFields(result) {
  return { value: result.value, asOf: result.asOf, previousValue: result.previousValue, previousAsOf: result.previousAsOf };
}

// A separately evaluated weighted sum, rather than a second iterative copy of
// the production recurrence, checks Wilder smoothing of the final observation.
function weightedRsi(points) {
  const n = points.length - 1, period = 6, decay = 5 / 6;
  let gain = 0, loss = 0;
  for (let index = 1; index <= n; index += 1) {
    const delta = points[index].close - points[index - 1].close;
    const weight = index <= period ? decay ** (n - period) / period : decay ** (n - index) / period;
    gain += Math.max(0, delta) * weight;
    loss += Math.max(0, -delta) * weight;
  }
  return gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : gain === 0 ? 0 : 100 * gain / (gain + loss);
}

test('completed-close RSI6 uses the same unchanged quote recurrence and independently checked Wilder weighting', () => {
  for (const count of [60, 61, 80, 120, 250]) {
    const points = history({ count });
    const input = observation(points);
    const before = structuredClone(input);
    const actual = deriveObservation(input).rsi;
    assert.deepEqual(actual, rsiFields(quoteRsi(points)));
    assert.ok(Math.abs(actual.value - weightedRsi(points)) < 1e-10);
    assert.deepEqual(input, before);
  }
});

test('Wilder zero, flat and all-gain histories are genuine numbers and never unavailable coercions', () => {
  for (const [close, expected] of [[i => 300 - i, 0], [() => 100, 50], [i => 100 + i, 100]]) {
    const points = history({ close });
    const result = deriveObservation(observation(points)).rsi;
    assert.equal(result.value, expected);
    assert.equal(result.previousValue, expected);
    assert.equal(result.asOf, points.at(-1).date);
    assert.deepEqual(result, rsiFields(quoteRsi(points)));
  }
  const seed = [100, 102, 101, 105, 104, 106, 104].map(close => ({ close }));
  assert.deepEqual(wilderRsiSeries(seed, 6).slice(0, 6), [null, null, null, null, null, null]);
  assert.ok(Math.abs(wilderRsiSeries(seed, 6).at(-1) - 100 * 8 / 12) < 1e-12);
});

test('60-close warmup is required independently for current and preceding RSI', () => {
  for (const count of [1, 6, 7, 59]) {
    assert.deepEqual(deriveObservation(observation(history({ count }))).rsi, EMPTY);
  }
  const points = history({ count: 60 });
  const actual = deriveObservation(observation(points)).rsi;
  assert.ok(Number.isFinite(actual.value));
  assert.equal(actual.previousValue, null);
  assert.equal(actual.previousAsOf, null);
  assert.deepEqual(actual, rsiFields(quoteRsi(points)));
});

test('future prices never enter current RSI and stale dates never masquerade as the latest completed session', () => {
  const points = history();
  const baseline = deriveObservation(observation(points));
  const future = deriveObservation(observation([...points, { date: '2026-10-19', close: 1e9 }], {
    asOfDate: '2026-10-16', expectedAsOfDate: '2026-10-16',
  }));
  assert.deepEqual(future.rsi, baseline.rsi);
  assert.equal(future.price, baseline.price);
  const stale = deriveObservation(observation(points, { expectedAsOfDate: '2026-10-19', stale: true }));
  assert.deepEqual(stale.rsi, EMPTY);
  assert.equal(stale.price, baseline.price);
  assert.equal(stale.asOfDate, '2026-10-16');
  for (const expectedAsOfDate of ['', '2026-02-30', '2026-10-17', '2026-10-15']) {
    assert.deepEqual(deriveObservation(observation(points, { expectedAsOfDate })).rsi, EMPTY);
  }
  const { expectedAsOfDate, ...withoutExpected } = observation(points);
  assert.deepEqual(deriveObservation(withoutExpected).rsi, baseline.rsi);
});

test('missing or corrupt closes clear carried RSI metadata instead of publishing zero or an older value', () => {
  const points = history();
  const carried = { value: 12, asOf: points.at(-1).date, previousValue: 20, previousAsOf: points.at(-2).date };
  for (const status of ['loading', 'error']) {
    assert.deepEqual(deriveObservation(observation(points, { status, rsi: carried })).rsi, EMPTY);
  }
  for (const close of [null, undefined, 0, -1, '100', NaN, Infinity]) {
    const bad = points.map(point => ({ ...point }));
    bad[10].close = close;
    assert.deepEqual(deriveObservation(observation(bad, { rsi: carried })).rsi, EMPTY);
  }
  assert.deepEqual(deriveObservation(observation([...points, points.at(-1)], { rsi: carried })).rsi, EMPTY);
});

test('preceding RSI is published only for the actual prior exchange session, including holiday weekends', () => {
  const points = history({ end: '2026-09-08' });
  const result = deriveObservation(observation(points)).rsi;
  assert.equal(result.previousAsOf, '2026-09-04');
  assert.deepEqual(result, rsiFields(quoteRsi(points)));
  const missingPrevious = points.filter(point => point.date !== '2026-09-04');
  const actual = deriveObservation(observation(missingPrevious)).rsi;
  assert.ok(Number.isFinite(actual.value));
  assert.equal(actual.previousValue, null);
  assert.equal(actual.previousAsOf, null);
  assert.deepEqual(actual, rsiFields(quoteRsi(missingPrevious)));
});

test('fixed 380-day RSI history gives identical first-load and persisted 400-day-cache results', () => {
  const points = history({ count: 600 });
  for (const fetchedAt of [undefined, '2026-10-16T23:00:00Z', '2026-10-19T12:00:00Z', '2026-10-18T23:30:00-04:00']) {
    const input = observation(points, { fetchedAt });
    const compactCutoff = new Date(Date.parse(`${input.asOfDate}T00:00:00Z`) - 400 * DAY).toISOString().slice(0, 10);
    const compact = points.filter(point => point.date >= compactCutoff).slice(-320);
    const actual = deriveObservation(input).rsi;
    assert.deepEqual(actual, deriveObservation({ ...input, points: compact }).rsi);
    const anchor = fetchedAt ? new Date(fetchedAt).toISOString().slice(0, 10) : input.asOfDate;
    const quoteFrom = new Date(Date.parse(`${anchor}T00:00:00Z`) - 380 * DAY).toISOString().slice(0, 10);
    const quoteRows = points.filter(point => point.date >= quoteFrom);
    assert.deepEqual(actual, rsiFields(quoteRsi(quoteRows)), 'same provider window must exactly match trade RSI');
  }
});

test('warmup must fit the recent window rather than using remote ancient prices to fill missing recent history', () => {
  const recent = history({ count: 59 });
  const ancient = history({ count: 80, end: '2020-10-16' });
  assert.deepEqual(deriveObservation(observation([...ancient, ...recent])).rsi, EMPTY);
});
