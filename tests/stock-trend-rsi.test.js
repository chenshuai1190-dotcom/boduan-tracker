import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStockRsi as buildRsi } from '../server/quote/stockRsi.js';
import { buildStockTrendMomentum } from '../server/quote/stockTrendRsi.js';
import { compareStockTrendPeaks, hasStockTrendRsiSignal, stockTrendRsiState } from '../src/lib/stockTrendRsiSignal.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/stock-rsi/META-2026-09-17.json', import.meta.url)));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const buildStockRsi = (rows, options) => buildRsi(rows, { ...options, includeTrendMomentum: true });

function series(tail, rsis, monotonicHighs = false) {
  const prices = [...Array(130).fill(100), ...tail];
  const values = [...Array(130).fill(50), ...rsis];
  const day = new Date('2025-01-02T00:00:00Z');
  const rows = prices.map((close, index) => {
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return { date, close, high: monotonicHighs ? 300 + index : close };
  });
  return { rows, values };
}
function evaluate(data, length = data.rows.length) {
  return buildStockTrendMomentum(data.rows.slice(0, length), data.values.slice(0, length));
}
const base = () => series([110, 120, 115, 110, 116, 119, 121, 120.7, 120.5, 120.3],
  [85, 90, 82, 75, 81, 84, 88.5, 87, 85, 84]);

test('RSI state has inclusive 70/80 boundaries without rounding or changing Wilder', () => {
  for (const [value, expected] of [[0, 'NORMAL'], [69.9999, 'NORMAL'], [70, 'OVERBOUGHT'],
    [79.9999, 'OVERBOUGHT'], [80, 'STRONGLY_OVERBOUGHT'], [100, 'STRONGLY_OVERBOUGHT'], [null, null]]) {
    assert.equal(stockTrendRsiState(value), expected);
  }
  const signal = buildStockRsi(fixture.rows, { completedCutoffDate: fixture.completedCutoffDate });
  near(signal.value, 87.77178025015014); // Captured before modifying the production function.
  assert.equal(signal.trendMomentum.currentRSI6, signal.value);
  assert.equal(signal.divergenceState, 'NONE', 'legacy stock-decision lifecycle remains unchanged');
  const { trendMomentum, ...legacy } = signal;
  assert.deepEqual(buildRsi(fixture.rows, { completedCutoffDate: fixture.completedCutoffDate }), legacy,
    'ordinary consumers retain their exact original contract unless trend metadata is requested');
});

test('direction and both inclusive filters separate NONE, WATCH and POTENTIAL', () => {
  const previous = { price: 100, rsi6: 90 };
  for (const [price, rsi, expected] of [[100, 87, 'NONE'], [99, 80, 'NONE'], [110, 90, 'NONE'], [110, 91, 'NONE'],
    [104, 88.24, 'WATCH'], [100.49, 87, 'WATCH'], [100.5, 87.0001, 'WATCH'],
    [100.5, 87, 'POTENTIAL'], [100.5001, 86.9999, 'POTENTIAL']]) {
    assert.equal(compareStockTrendPeaks(previous, price, rsi).divergenceState, expected);
  }
  const example = compareStockTrendPeaks({ price: 653.69, rsi6: 89.56 }, 682.31, 87.8);
  assert.equal(example.divergenceState, 'WATCH', 'user-supplied example is not hardcoded by symbol/date');
  near(example.rsiDivergenceDelta, 1.76);
  near(example.priceBreakoutPct, 4.378222093041018);
});

test('the current day can WATCH/POTENTIAL without right bars; confirmation is observed only after three', () => {
  const data = base();
  const current = evaluate(data, 137);
  assert.equal(current.divergenceState, 'WATCH');
  assert.equal(current.chaseBuyBlocked, false);
  assert.equal(current.previousPeak.date, data.rows[131].date);
  assert.equal(current.previousPeak.confirmedAt, data.rows[133].date);
  for (const length of [137, 138, 139]) assert.notEqual(evaluate(data, length).divergenceState, 'CONFIRMED');
  const confirmed = evaluate(data);
  assert.equal(confirmed.divergenceState, 'CONFIRMED');
  assert.equal(confirmed.chaseBuyBlocked, true);
  assert.equal(confirmed.confirmation.peak.date, data.rows[136].date);
  assert.equal(confirmed.divergenceDate, data.rows[139].date);
  assert.equal(confirmed.previousPeak.date, data.rows[131].date, 'P2 becoming a reference cannot erase its confirmation');
  data.values[136] = 86;
  const potential = evaluate(data, 137);
  assert.equal(potential.divergenceState, 'POTENTIAL');
  assert.equal(potential.chaseBuyBlocked, true);
  data.values[136] = 79;
  assert.equal(evaluate(data, 137).chaseBuyBlocked, false, 'valid divergence alone cannot block chasing');
});

test('reference selection stays on a confirmed swing, never yesterday or an older more convenient peak', () => {
  const data = series([110, 120, 115, 110, 116, 119, 121, 122, 123], [85, 90, 82, 75, 81, 84, 86, 87, 88]);
  for (const length of [137, 138, 139]) {
    assert.equal(evaluate(data, length).previousPeak.date, data.rows[131].date);
  }
  const recent = series([110, 120, 115, 110, 116, 119, 121, 118, 117, 119, 120, 122],
    [85, 95, 82, 75, 80, 82, 85, 80, 78, 81, 84, 90], true);
  const signal = evaluate(recent);
  assert.equal(signal.previousPeak.date, recent.rows[136].date);
  assert.equal(signal.divergenceState, 'NONE', 'do not backtrack to older RSI95 to invent divergence');
});

test('unconfirmed, plateau and weak-momentum reference highs are excluded', () => {
  for (const rsis of [[50, 65, 50, 50, 55, 60, 62], [80, 88, 82, 89, 84, 85, 86]]) {
    const data = series([110, 120, 115, 110, 116, 119, 121], rsis);
    assert.equal(evaluate(data).previousPeak, null);
  }
  const plateau = series([110, 120, 120, 110, 116, 119, 121], [85, 90, 90, 75, 81, 84, 88]);
  assert.equal(evaluate(plateau).previousPeak, null);
  assert.equal(evaluate(base(), 133).previousPeak, null, 'one right bar cannot identify the reference');
});

test('WATCH/POTENTIAL cancel on renewed RSI highs or a return below the reference', () => {
  const data = base();
  for (const rsi of [90, 91]) {
    data.values[136] = rsi;
    assert.equal(evaluate(data, 137).divergenceState, 'NONE');
    assert.equal(evaluate(data, 137).chaseBuyBlocked, false);
  }
  data.values[136] = 85;
  data.rows[136].close = 120;
  assert.equal(evaluate(data, 137).divergenceState, 'NONE');
});

test('confirmed events preserve normal pullbacks but terminate on recovery, realization or expiry', () => {
  const data = base();
  const nextDate = '2025-07-17';
  assert.ok(nextDate > data.rows.at(-1).date);
  data.rows.push({ date: nextDate, close: 123, high: 123 });
  data.values.push(91);
  assert.equal(evaluate(data).divergenceState, 'NONE');
  for (const [close, rsi] of [[110, 70], [120, 40]]) {
    data.rows.at(-1).close = close;
    data.rows.at(-1).high = Math.max(123, close);
    data.values[data.values.length - 1] = rsi;
    assert.notEqual(evaluate(data).divergenceState, 'CONFIRMED');
  }
  const expired = series([...base().rows.slice(130).map(row => row.close), ...Array(20).fill(120)],
    [...base().values.slice(130), ...Array(20).fill(83)]);
  assert.equal(evaluate(expired, 159).divergenceState, 'CONFIRMED');
  assert.notEqual(evaluate(expired).divergenceState, 'CONFIRMED');
  assert.equal(evaluate(expired).confirmation, null);
});

test('real META September 17 replay selects the September 9 close/RSI swing and returns WATCH', () => {
  const signal = buildStockRsi(fixture.rows, { completedCutoffDate: '2026-09-17' });
  const trend = signal.trendMomentum;
  assert.equal(hasStockTrendRsiSignal(signal), true);
  assert.equal(trend.rsiState, 'STRONGLY_OVERBOUGHT');
  assert.equal(trend.divergenceState, 'WATCH');
  assert.equal(trend.currentPrice, 682.31);
  assert.equal(trend.previousPeak.date, '2026-09-09');
  assert.equal(trend.previousPeak.price, 653.69);
  near(trend.previousPeak.rsi6, 87.83704550365046);
  near(trend.priceBreakoutPct, 4.378222093041018);
  near(trend.rsiDivergenceDelta, 0.0652652535003142);
  assert.equal(trend.priceHigherHigh, true);
  assert.equal(trend.rsiLowerHigh, true);
  assert.equal(trend.chaseBuyBlocked, false);
  for (const row of fixture.rows.filter(row => row.date >= '2026-09-01')) {
    const prefix = fixture.rows.filter(item => item.date <= row.date);
    assert.deepEqual(buildStockRsi(fixture.rows, { completedCutoffDate: row.date }),
      buildStockRsi(prefix, { completedCutoffDate: row.date }), row.date);
  }
});

test('trend metadata fails closed independently of a valid RSI number', () => {
  const signal = buildStockRsi(fixture.rows, { completedCutoffDate: '2026-09-17' });
  for (const mutate of [s => { delete s.trendMomentum; }, s => { s.trendMomentum.version = 'old'; },
    s => { s.trendMomentum.asOf = '2026-09-18'; }, s => { s.trendMomentum.previousPeak.confirmedAt = '2026-09-18'; },
    s => { s.trendMomentum.currentRSI6 = 90; }, s => { s.trendMomentum.chaseBuyBlocked = true; },
    s => { s.trendMomentum.divergenceState = 'POTENTIAL'; }, s => { s.trendMomentum.rsiDivergenceDelta = 3; }]) {
    const malformed = structuredClone(signal);
    mutate(malformed);
    assert.equal(hasStockTrendRsiSignal(malformed), false);
  }
  const short = buildStockRsi(fixture.rows.slice(0, 60), { completedCutoffDate: '2026-09-17' });
  assert.equal(short.trendMomentum.divergenceState, null);
  assert.equal(short.trendMomentum.chaseBuyBlocked, null);
  assert.equal(hasStockTrendRsiSignal(short), true);
});
