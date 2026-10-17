import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockBuyReference, STOCK_BUY_REFERENCE_VERSION } from '../src/lib/stockBuyReference.js';

function fixture(prices = [], rsis = []) {
  const closes = [...Array(10).fill(110), ...prices];
  const values = [...Array(10).fill(50), ...rsis];
  const date = new Date('2026-01-02T00:00:00Z');
  const history = closes.map(close => {
    while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
    const key = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 1);
    return { date: key, close, ma60: 105, ma200: 90 };
  });
  const rsiObservations = history.map((row, index) => ({ date: row.date, value: values[index] }));
  return { history, rsiObservations, asOfDate: history.at(-1).date, chaseBuyBlocked: false };
}

const evaluate = (input, end = input.history.length - 1) => buildStockBuyReference({ ...input, asOfDate: input.history[end].date });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const ready = () => fixture([103, 104, 106, 111], [30, 32, 34, 40]);

test('idle and RSI 30 inclusive establish observation without fabricating a recovery', () => {
  const idle = evaluate(fixture());
  assert.equal(idle.version, STOCK_BUY_REFERENCE_VERSION);
  assert.equal(idle.state, 'idle');
  assert.equal(idle.event, null);
  for (const [rsi, expected] of [[0, 'watch'], [29.99, 'watch'], [30, 'watch'], [30.01, 'idle']]) {
    const result = evaluate(fixture([103], [rsi]));
    assert.equal(result.state, expected);
    assert.equal(result.conditions.rsiRecovered, false, 'without a prior oversold setup there is no recovery');
  }
});

test('confirmation uses the previous three closes excluding today, and requires a strict breakout', () => {
  const input = fixture([103, 104, 106, 106, 107], [29, 32, 34, 40, 41]);
  const equal = evaluate(input, 13);
  assert.equal(equal.state, 'watch');
  assert.equal(equal.confirmationPrice, 106);
  assert.equal(equal.conditions.priceConfirmed, false);
  const result = evaluate(input);
  assert.equal(result.state, 'triggered');
  assert.equal(result.confirmationPrice, 106);
  assert.equal(result.event.lowPrice, 103);
  assert.equal(result.event.triggeredAt, input.history[14].date);
  assert.equal(result.event.remainingTradingDays, 5);
  assert.equal(result.event.ageTradingDays, 0);
});

test('trigger freezes confirmation and close-based low, and cannot re-trigger the same setup', () => {
  const input = fixture([103, 104, 106, 111, 113, 112, 114], [30, 32, 34, 40, 45, 42, 48]);
  const trigger = evaluate(input, 13);
  const later = evaluate(input);
  assert.equal(later.state, 'triggered');
  assert.equal(later.confirmationPrice, trigger.confirmationPrice);
  assert.equal(later.event.lowPrice, trigger.event.lowPrice);
  assert.equal(later.event.triggeredAt, trigger.event.triggeredAt);
  assert.equal(later.event.ageTradingDays, 3);
  assert.equal(later.event.remainingTradingDays, 2);
});

test('a strict close below the frozen pullback low invalidates; equality does not', () => {
  const input = fixture([103, 104, 106, 111, 103, 102, 104], [30, 32, 34, 40, 35, 29, 32]);
  assert.equal(evaluate(input, 14).state, 'triggered');
  const failure = evaluate(input, 15);
  assert.equal(failure.state, 'invalidated');
  assert.equal(failure.reason, 'below_pullback_low');
  assert.equal(failure.event.lowPrice, 103);
  assert.equal(failure.event.invalidatedAt, input.history[15].date);
  assert.equal(failure.event.remainingTradingDays, 0);
  assert.equal(evaluate(input).state, 'invalidated', 'rebound without a new observation cannot revive a failed setup');
});

test('watch is valid through session 5 after latest oversold and expires on session 6', () => {
  const input = fixture([103, 104, 104, 104, 104, 104, 105], [30, 31, 32, 33, 34, 35, 36]);
  const lastWatch = evaluate(input, 15);
  assert.equal(lastWatch.state, 'watch');
  assert.equal(lastWatch.event.ageTradingDays, 5);
  assert.equal(lastWatch.event.remainingTradingDays, 1, 'the final eligible confirmation session counts as one remaining day');
  const expired = evaluate(input);
  assert.equal(expired.state, 'expired');
  assert.equal(expired.reason, 'observation_expired');
  assert.equal(expired.event.triggeredAt, null);
  input.history[15].close = 105;
  assert.equal(evaluate(input, 15).state, 'triggered', 'session 5 is still allowed to confirm');
});

test('consecutive oversold readings renew observation time without discarding the lowest close', () => {
  const input = fixture([103, 101, 104, 104, 104, 104, 104, 105], [30, 29, 28, 32, 33, 34, 35, 36]);
  const result = evaluate(input);
  assert.equal(result.state, 'triggered');
  assert.equal(result.event.startedAt, input.history[10].date);
  assert.equal(result.event.lowPrice, 101);
});

test('trigger lasts five sessions including trigger day and expires without repeating the signal', () => {
  const input = fixture([103, 104, 106, 111, 112, 113, 114, 115, 116, 117], [30, 32, 34, 40, 41, 42, 43, 44, 45, 46]);
  const fifth = evaluate(input, 17);
  assert.equal(fifth.state, 'triggered');
  assert.equal(fifth.event.ageTradingDays, 4);
  assert.equal(fifth.event.remainingTradingDays, 1);
  const sixth = evaluate(input, 18);
  assert.equal(sixth.state, 'expired');
  assert.equal(sixth.reason, 'signal_expired');
  assert.equal(sixth.event.ageTradingDays, 5);
  assert.equal(evaluate(input).event.triggeredAt, input.history[13].date);
  input.history[18].close = 102;
  assert.equal(evaluate(input, 18).state, 'expired', 'a breach after the five-session lifetime cannot invalidate an expired signal');
});

test('loss of the trend gate cannot hide an actual failure below the pullback low', () => {
  const input = fixture([103, 104, 106, 111, 89], [30, 32, 34, 40, 20]);
  const result = evaluate(input);
  assert.equal(result.state, 'invalidated');
  assert.equal(result.reason, 'below_pullback_low');
  assert.equal(result.conditions.trend, false);
  assert.equal(evaluate({ ...input, chaseBuyBlocked: true }).state, 'invalidated');
  assert.equal(evaluate({ ...input, chaseBuyBlocked: null }).state, 'unavailable', 'missing input still cannot claim a fully available reference');
});

test('a subsequent oversold pullback starts a new independent observation', () => {
  const input = fixture([103, 104, 106, 111, 107, 108, 112], [30, 32, 34, 40, 29, 32, 40]);
  assert.equal(evaluate(input, 14).state, 'watch');
  const result = evaluate(input);
  assert.equal(result.state, 'triggered');
  assert.equal(result.event.startedAt, input.history[14].date);
  assert.equal(result.event.lowPrice, 107);
  assert.equal(result.event.triggeredAt, input.history[16].date);
});

test('MA200 must be strictly below close and five-session MA60 slope includes -0.1%', () => {
  const input = fixture([110], [30]);
  input.history.at(-1).ma200 = 110;
  assert.equal(evaluate(input).state, 'paused');
  input.history.at(-1).ma200 = 109;
  input.history.at(-1).ma60 = 105 * 0.999;
  const boundary = evaluate(input);
  assert.equal(boundary.state, 'watch');
  near(boundary.ma60SlopePct, -0.1);
  input.history.at(-1).ma60 = 105 * 0.99899;
  assert.equal(evaluate(input).reason, 'trend_not_eligible');
});

test('current divergence blocks pause; unknown divergence cannot count as an open gate', () => {
  const input = ready();
  assert.equal(evaluate({ ...input, chaseBuyBlocked: true }).reason, 'chase_buy_blocked');
  assert.equal(evaluate({ ...input, chaseBuyBlocked: true }).state, 'paused');
  for (const value of [null, undefined, 'false', 0]) {
    const result = evaluate({ ...input, chaseBuyBlocked: value });
    assert.equal(result.state, 'unavailable');
    assert.equal(result.reason, 'missing_divergence_data');
  }
});

test('invalid and missing numeric inputs stay unknown instead of being coerced to zero', () => {
  for (const value of [null, undefined, NaN, Infinity, '103', 0, -1]) {
    const input = ready();
    input.history.at(-1).close = value;
    const result = evaluate(input);
    assert.equal(result.state, 'unavailable');
    assert.equal(result.close, null);
    assert.equal(result.conditions.priceConfirmed, null);
  }
  for (const value of [null, undefined, NaN, Infinity, '30', -1, 101]) {
    const input = ready();
    input.rsiObservations.at(-1).value = value;
    assert.equal(evaluate(input).reason, 'missing_rsi_data');
  }
  const missingMa = ready();
  missingMa.history.at(-1).ma200 = null;
  assert.equal(evaluate(missingMa).reason, 'insufficient_indicator_history');
  const missingPrevious = ready();
  missingPrevious.rsiObservations.splice(-2, 1);
  assert.equal(evaluate(missingPrevious).state, 'unavailable');
  const missingPriceRow = ready();
  missingPriceRow.history.splice(-2, 1);
  assert.equal(evaluate(missingPriceRow).state, 'unavailable', 'an RSI session without a matching price cannot be skipped');
});

test('dates must be valid, unique, ordered and current across both sequences', () => {
  assert.equal(buildStockBuyReference().reason, 'invalid_as_of_date');
  assert.equal(buildStockBuyReference({ asOfDate: '2026-02-30' }).reason, 'invalid_as_of_date');
  for (const field of ['history', 'rsiObservations']) {
    const input = ready();
    [input[field][1], input[field][2]] = [input[field][2], input[field][1]];
    assert.equal(evaluate(input).state, 'unavailable');
    const duplicate = ready();
    duplicate[field][2].date = duplicate[field][1].date;
    assert.equal(evaluate(duplicate).state, 'unavailable');
  }
  const mismatch = ready();
  mismatch.rsiObservations.pop();
  assert.equal(evaluate(mismatch).reason, 'date_mismatch');
  const short = fixture();
  short.history = short.history.slice(-5);
  assert.equal(evaluate(short).state, 'unavailable');
});

test('future records never affect historical evaluation or leak into event dates', () => {
  const input = fixture([103, 104, 106, 111, 112, 102], [30, 32, 34, 40, 41, 20]);
  const asOfDate = input.history[13].date;
  const prefix = { ...input, history: input.history.slice(0, 14), rsiObservations: input.rsiObservations.slice(0, 14), asOfDate };
  assert.deepEqual(buildStockBuyReference({ ...input, asOfDate }), buildStockBuyReference(prefix));
  input.history.at(-1).close = null;
  input.rsiObservations.at(-1).value = null;
  assert.deepEqual(buildStockBuyReference({ ...input, asOfDate }), buildStockBuyReference(prefix));
});

test('warmup nulls and older missing RSI reset tracking without poisoning a later complete window', () => {
  const input = ready();
  input.history[0].ma200 = null;
  input.rsiObservations[0].value = null;
  input.rsiObservations.splice(1, 1);
  assert.equal(evaluate(input).state, 'triggered');
  const interrupted = fixture([103, 104, 104, 104, 104, 104, 104, 111], [30, 32, 33, 34, 35, 36, 37, 40]);
  interrupted.rsiObservations[11].value = null;
  assert.equal(evaluate(interrupted).state, 'idle', 'no trigger may bridge missing data from the old observation');
});

test('price scaling preserves lifecycle and ratios, with no mutation of either input sequence', () => {
  const input = ready();
  const original = structuredClone(input);
  Object.freeze(input.history);
  Object.freeze(input.rsiObservations);
  for (const row of [...input.history, ...input.rsiObservations]) Object.freeze(row);
  const expected = evaluate(input);
  for (const factor of [0.01, 3, 100]) {
    const scaled = { ...input, history: input.history.map(row => ({ ...row, close: row.close * factor, ma60: row.ma60 * factor, ma200: row.ma200 * factor })) };
    const result = evaluate(scaled);
    assert.equal(result.state, expected.state);
    assert.equal(result.reason, expected.reason);
    assert.deepEqual(result.conditions, expected.conditions);
    assert.equal(result.event.triggeredAt, expected.event.triggeredAt);
    near(result.close / factor, expected.close);
    near(result.confirmationPrice / factor, expected.confirmationPrice);
    near(result.event.lowPrice / factor, expected.event.lowPrice);
    near(result.distanceMa200Pct, expected.distanceMa200Pct);
    near(result.ma60SlopePct, expected.ma60SlopePct);
  }
  assert.deepEqual(input, original);
});
