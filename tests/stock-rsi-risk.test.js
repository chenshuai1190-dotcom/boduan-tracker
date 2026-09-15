import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockRsiRisk } from '../server/quote/stockRsiRisk.js';
import { STOCK_RSI_DIVERGENCE_VERSION } from '../src/lib/stockRsiConfig.js';
import { STOCK_RSI_RISK_RULES, resolveStockRsiRiskRules } from '../src/lib/stockRsiRiskConfig.js';
import { deriveStockMaStructure, deriveStockMaTrend } from '../src/lib/stockMaStructure.js';

function fixture({ age = 11, state = 'CONFIRMED', price = 98.5, rsi = 60, low = 95.5, high1Price = 98.5, high1Rsi = 86, high2Rsi = 76 } = {}) {
  const day = new Date('2026-01-02T00:00:00Z');
  const rows = Array.from({ length: 11 + age }, (_, i) => {
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return { date, adjusted_close: i <= 7 ? 99.5 : i <= 10 ? 96.5 : i === 11 ? low : price };
  });
  rows.at(-1).adjusted_close = price;
  const asOf = rows.at(-1).date;
  const event = {
    high1: { date: rows[0].date, price: high1Price, rsi: high1Rsi },
    high2: { date: rows[7].date, price: 100, rsi: high2Rsi },
    formedAt: rows[10].date,
    confirmedAt: state === 'FORMING' ? null : rows[10].date,
    realizedAt: null, invalidatedAt: null,
    maxDrawdownPct: 100 - Math.min(...rows.slice(7).map(row => row.adjusted_close)),
  };
  if (state === 'FORMING') {
    rows.forEach(row => { row.adjusted_close = price; });
    event.maxDrawdownPct = Math.max(0, 100 - price);
  }
  rows.forEach(row => { row.close = row.adjusted_close; });
  if (state === 'REALIZED') event.realizedAt = asOf;
  if (state === 'INVALIDATED') event.invalidatedAt = asOf;
  const signal = {
    period: 6, value: rsi, asOf, priceBasis: 'adjusted_close', divergenceVersion: STOCK_RSI_DIVERGENCE_VERSION,
    divergenceState: state, divergenceEvent: ['NONE', null].includes(state) ? null : event,
    divergenceDate: ['NONE', null].includes(state) ? null : state === 'FORMING' ? event.formedAt
      : state === 'CONFIRMED' ? event.confirmedAt : asOf,
    divergenceConfirmationStrength: ['NONE', 'FORMING', null].includes(state) ? null : 'BASIC',
  };
  const stockDetail = {
    priceBasis: 'split_adjusted_close', asOfDate: asOf,
    history: rows.map(row => ({ date: row.date, close: row.adjusted_close, ma30: 90, ma60: 80, ma200: 70 })),
  };
  return { signal, eodRows: rows, stockDetail, completedCutoffDate: asOf };
}

function calculate(f, config) {
  return buildStockRsiRisk(f.signal, { eodRows: f.eodRows, stockDetail: f.stockDetail, completedCutoffDate: f.completedCutoffDate, config });
}
function setCloses(f, values) {
  for (const [index, close] of values) {
    f.eodRows[index].adjusted_close = close;
    f.eodRows[index].close = close;
    f.stockDetail.history[index].close = close;
  }
  f.signal.divergenceEvent.maxDrawdownPct = 100 - Math.min(...f.eodRows.slice(7).map(row => row.adjusted_close));
}

test('confirmed risk reports every contribution and preserves the event and MA inputs', () => {
  const f = fixture();
  const before = structuredClone(f);
  const result = calculate(f);
  assert.equal(result.divergenceRiskScore, 40);
  assert.equal(result.divergenceRiskLevel, 'LOW');
  assert.deepEqual(result.divergenceDebug.riskContributions, {
    stateBase: 45, divergenceStrength: 10, ma30Adjustment: 0,
    trendAdjustment: 0, recoveryAdjustment: -5, timeDecay: -10,
  });
  assert.equal(result.divergenceDebug.confirmedAge, 11);
  assert.equal(result.divergenceDebug.timeDecayEligible, true);
  assert.ok(Math.abs(result.divergenceDebug.drawdownFromHigh2 + 0.015) < 1e-12);
  assert.ok(Math.abs(result.divergenceDebug.maxDrawdownFromHigh2 - 0.045) < 1e-12);
  assert.ok(Math.abs(result.divergenceDebug.priceRecoveryRatio - 2 / 3) < 1e-12);
  assert.deepEqual(f, before);
  assert.equal(result.divergenceDebug.state, 'CONFIRMED');
});

test('forming has an independent base and never receives confirmed time decay', () => {
  const result = calculate(fixture({ state: 'FORMING', price: 99.5 }));
  assert.equal(result.divergenceRiskScore, 40);
  assert.equal(result.divergenceRiskLevel, 'LOW');
  assert.equal(result.divergenceDebug.riskContributions.stateBase, 30);
  assert.equal(result.divergenceDebug.confirmedAge, null);
  assert.equal(result.divergenceDebug.riskContributions.timeDecay, 0);
});

test('inactive states always have zero current risk, while unknown lifecycle stays unknown', () => {
  for (const state of ['NONE', 'REALIZED', 'INVALIDATED']) {
    const f = fixture({ state });
    const withContext = calculate(f);
    assert.equal(withContext.divergenceRiskScore, 0);
    assert.equal(withContext.divergenceRiskLevel, 'NONE');
    assert.equal(withContext.divergenceDebug.currentPrice, 98.5);
    assert.equal(withContext.divergenceDebug.trendStructure, 'bullish');
    assert.equal(Object.values(withContext.divergenceDebug.riskContributions).every(value => value === 0), true);
    f.eodRows = null; f.stockDetail = null;
    assert.equal(calculate(f).divergenceRiskScore, 0);
  }
  const unknown = calculate(fixture({ state: null }));
  assert.equal(unknown.divergenceRiskScore, null);
  assert.equal(unknown.divergenceRiskLevel, null);
});

test('active missing, stale or wrong-basis MA context never fabricates NONE risk', () => {
  for (const mutate of [
    f => { f.stockDetail = null; },
    f => { f.stockDetail.priceBasis = 'adjusted_close'; },
    f => { f.stockDetail.asOfDate = f.eodRows.at(-2).date; },
    f => { f.stockDetail.history = f.stockDetail.history.slice(-5); },
    f => { f.stockDetail.history.at(-1).ma200 = null; },
  ]) {
    const f = fixture(); mutate(f);
    const result = calculate(f);
    assert.equal(result.divergenceRiskScore, null);
    assert.equal(result.divergenceRiskLevel, null);
    assert.equal(result.divergenceDebug.status, 'unavailable');
  }
});

test('RSI strength uses continuous boundaries and the 2 percent higher-high bonus', () => {
  for (const [difference, expected] of [[4.99, 0], [5, 5], [7.99, 5], [8, 10], [11.99, 10], [12, 15], [15.99, 15], [16, 20]]) {
    const result = calculate(fixture({ high1Rsi: 90, high2Rsi: 90 - difference }));
    assert.equal(result.divergenceDebug.riskContributions.divergenceStrength, expected, `difference ${difference}`);
  }
  const f = fixture({ high1Price: 100 / 1.02 });
  assert.equal(calculate(f).divergenceDebug.riskContributions.divergenceStrength, 15);
  f.signal.divergenceEvent.high1.price = 100 / 1.01999;
  assert.equal(calculate(f).divergenceDebug.riskContributions.divergenceStrength, 10);
  f.signal.divergenceEvent.high1.price = 90;
  f.signal.divergenceEvent.high1.rsi = 99;
  f.signal.divergenceEvent.high2.rsi = 70;
  assert.equal(calculate(f).divergenceDebug.riskContributions.divergenceStrength, 25, 'combined strength cannot exceed 25');
  assert.equal(calculate(f, { HIGHER_HIGH_BONUS: 20 }).divergenceDebug.riskContributions.divergenceStrength, 25, 'tuning a component must still respect the contribution cap');
});

test('drawdown stays visible in debug without being counted again after the confirmed state base', () => {
  for (const price of [97.01, 97, 95.01, 95, 92.01]) {
    const f = fixture({ age: 5, price, low: Math.min(95.5, price) });
    setCloses(f, f.eodRows.slice(8).map((_, index) => [index + 8, price]));
    const result = calculate(f);
    assert.equal(result.divergenceRiskScore, 55, `price ${price} must not add a second confirmation score`);
    assert.equal(result.divergenceDebug.riskContributions.stateBase, 45);
    assert.equal(Object.hasOwn(result.divergenceDebug.riskContributions, 'priceConfirmation'), false);
    assert.ok(Math.abs(result.divergenceDebug.drawdownFromHigh2 - (price - 100) / 100) < 1e-12);
  }
});

test('terminal lifecycle outcomes must be applied before risk scoring', () => {
  for (const f of [fixture({ price: 92, low: 92 }), fixture({ rsi: 40 }), fixture({ age: 20 }), fixture({ price: 101, rsi: 85 })]) {
    const before = structuredClone(f.signal);
    const result = calculate(f);
    assert.equal(result.divergenceRiskScore, null);
    assert.equal(result.divergenceDebug.reason, 'lifecycle_requires_transition');
    assert.deepEqual(f.signal, before);
  }
  const staleForming = fixture({ state: 'FORMING', price: 96 });
  assert.equal(calculate(staleForming).divergenceDebug.reason, 'lifecycle_requires_transition');
});

test('price recovery has precise boundaries and is capped at one', () => {
  for (const [ratio, expected] of [[0.2999, 0], [0.3, -3], [0.4999, -3], [0.5, -5], [0.6999, -5], [0.7, -10], [0.7999, -10], [0.8, -15], [1.1, -15]]) {
    const f = fixture({ low: 94, price: 94 + ratio * 6 });
    const result = calculate(f);
    assert.equal(result.divergenceDebug.priceRecoveryAdjustment, expected, `ratio ${ratio}`);
    assert.equal(result.divergenceDebug.riskContributions.recoveryAdjustment, expected, `ratio ${ratio}`);
    assert.ok(result.divergenceDebug.priceRecoveryRatio >= 0 && result.divergenceDebug.priceRecoveryRatio <= 1);
  }
});

test('RSI recovery tiers are mutually exclusive and do not invalidate price below High2', () => {
  for (const [rsi, expected] of [[75.99, 0], [76, -3], [80.99, -3], [81, -5], [83.99, -5], [84, -10], [86, -10]]) {
    const f = fixture({ rsi });
    const result = calculate(f);
    assert.equal(result.divergenceDebug.rsiRecoveryAdjustment, expected);
    assert.equal(result.divergenceDebug.state, 'CONFIRMED');
    assert.equal(result.divergenceDebug.rsiRecoveryGap, 86 - rsi);
  }
});

test('price and RSI recovery form one capped contribution instead of unbounded duplicate discounts', () => {
  const f = fixture({ low: 94, price: 99, rsi: 85 });
  const result = calculate(f);
  assert.equal(result.divergenceDebug.priceRecoveryAdjustment, -15);
  assert.equal(result.divergenceDebug.rsiRecoveryAdjustment, -10);
  assert.equal(result.divergenceDebug.riskContributions.recoveryAdjustment, -20);
  assert.equal(result.divergenceDebug.riskContributions.priceRecoveryAdjustment, undefined);
  assert.equal(result.divergenceDebug.riskContributions.rsiRecoveryAdjustment, undefined);
  assert.equal(result.divergenceDebug.state, 'CONFIRMED');
});

test('time decay uses elapsed completed records and requires no recent structural deterioration', () => {
  for (const [age, expected] of [[5, 0], [6, -5], [10, -5], [11, -10], [15, -10], [16, -15], [19, -15]]) {
    const result = calculate(fixture({ age }));
    assert.equal(result.divergenceDebug.riskContributions.timeDecay, expected, `age ${age}`);
  }
  const decline = fixture();
  setCloses(decline, [[decline.eodRows.length - 6, 99]]);
  assert.equal(calculate(decline).divergenceDebug.riskContributions.timeDecay, -10, 'a small five-day price decline alone is not an extra deterioration criterion');
  assert.equal(calculate(decline).divergenceDebug.hasRecentDeterioration, false);
  const freshLow = fixture();
  setCloses(freshLow, [[freshLow.eodRows.length - 3, 95]]);
  const result = calculate(freshLow);
  assert.equal(result.divergenceDebug.riskContributions.timeDecay, 0);
  assert.equal(result.divergenceDebug.hasRecentDeterioration, true);
  assert.ok(result.divergenceDebug.timeDecayBlockedReasons.includes('recent_post_high2_closing_low'));
});

test('a recent below-MA30 observation blocks time decay even when today is back above it', () => {
  const f = fixture();
  const index = f.stockDetail.history.length - 3;
  setCloses(f, [[index, 96]]);
  f.stockDetail.history[index].ma30 = 97;
  const result = calculate(f);
  assert.equal(result.divergenceDebug.riskContributions.ma30Adjustment, 0, 'the current MA penalty remains based on today');
  assert.equal(result.divergenceDebug.trendChange, 'stable');
  assert.equal(result.divergenceDebug.hasRecentDeterioration, true);
  assert.equal(result.divergenceDebug.riskContributions.timeDecay, 0);
});

test('material MA30 decline at the threshold blocks decay without inventing a new MA trend state', () => {
  const f = fixture();
  const first = f.stockDetail.history.length - 6;
  f.stockDetail.history.forEach((row, index) => {
    const factor = index < first ? 1 : 1 - (index - first) * 0.0002;
    row.close = 120; row.ma30 = 100 * factor; row.ma60 = 90 * factor;
  });
  f.eodRows.at(-1).close = 120;
  const result = calculate(f);
  assert.equal(result.divergenceDebug.trendChange, 'stable', 'existing MA trend thresholds remain independent');
  assert.equal(result.divergenceDebug.hasRecentDeterioration, true);
  assert.equal(result.divergenceDebug.riskContributions.timeDecay, 0);
});

test('a weakening trend within the window blocks decay despite current strengthening and expires outside the window', () => {
  function example(dipOffset) {
    const f = fixture();
    f.stockDetail.history.forEach((row, index) => { row.ma30 = 90 + index * 0.1; });
    f.stockDetail.history.at(-dipOffset).ma30 = 90;
    return calculate(f);
  }
  const recent = example(3);
  assert.equal(recent.divergenceDebug.trendChange, 'bullish_strengthening');
  assert.equal(recent.divergenceDebug.hasRecentDeterioration, true);
  assert.equal(recent.divergenceDebug.riskContributions.timeDecay, 0);
  const outside = example(6);
  assert.equal(outside.divergenceDebug.trendChange, 'bullish_strengthening');
  assert.equal(outside.divergenceDebug.hasRecentDeterioration, false);
  assert.equal(outside.divergenceDebug.riskContributions.timeDecay, -10);
});

test('risk reads the actual MA system without changing its output or mixing dividend-adjusted prices', () => {
  const f = fixture();
  f.stockDetail.history.forEach((row, i) => { row.close = 120; row.ma30 = 100 - i * 0.1; row.ma60 = 80; });
  f.eodRows.at(-1).close = 120;
  const beforeStructure = deriveStockMaStructure(f.stockDetail.history.at(-1), { asOfDate: f.signal.asOf });
  const beforeTrend = deriveStockMaTrend(f.stockDetail.history, { asOfDate: f.signal.asOf });
  const result = calculate(f);
  assert.equal(result.divergenceDebug.trendChange, 'bullish_weakening');
  assert.equal(result.divergenceDebug.riskContributions.trendAdjustment, 10);
  assert.equal(result.divergenceDebug.riskContributions.ma30Adjustment, 0, 'uses split-adjusted price 120, not RSI price 98.5');
  assert.equal(result.divergenceDebug.riskContributions.timeDecay, 0);
  assert.equal(result.divergenceDebug.hasRecentDeterioration, true);
  assert.deepEqual(deriveStockMaStructure(f.stockDetail.history.at(-1), { asOfDate: f.signal.asOf }), beforeStructure);
  assert.deepEqual(deriveStockMaTrend(f.stockDetail.history, { asOfDate: f.signal.asOf }), beforeTrend);
  f.stockDetail.history.at(-1).close = 90;
  f.eodRows.at(-1).close = 90;
  assert.equal(calculate(f).divergenceDebug.riskContributions.ma30Adjustment, 15);
  assert.equal(calculate(f, { BELOW_MA30_PENALTY: 20, FALLING_MA30_PENALTY: 20 }).divergenceDebug.riskContributions.ma30Adjustment, 15);
});

test('same-date MA prices and comparison windows must belong to the supplied EOD history', () => {
  const priceMismatch = fixture();
  priceMismatch.stockDetail.history.at(-1).close += 1;
  assert.equal(calculate(priceMismatch).divergenceDebug.reason, 'ma_price_history_mismatch');
  const datesMismatch = fixture();
  datesMismatch.stockDetail.history.splice(-3, 1);
  assert.equal(calculate(datesMismatch).divergenceDebug.reason, 'ma_date_window_mismatch');
  const tooShortForHistoricalSlopes = fixture();
  tooShortForHistoricalSlopes.stockDetail.history = tooShortForHistoricalSlopes.stockDetail.history.slice(-9);
  assert.equal(calculate(tooShortForHistoricalSlopes).divergenceRiskScore, null, 'all five historical MA-slope observations need ten matching completed records');
  const missingRawPrice = fixture();
  delete missingRawPrice.eodRows.at(-1).close;
  assert.equal(calculate(missingRawPrice).divergenceDebug.reason, 'ma_price_history_mismatch');
});

test('unfinished daily records cannot affect risk; malformed completed records fail closed', () => {
  const f = fixture();
  const expected = calculate(f);
  f.eodRows.push({ date: '2027-01-01', adjusted_close: 1 });
  f.stockDetail.history.push({ date: '2027-01-01', close: 1, ma30: 1, ma60: 2, ma200: 3 });
  assert.deepEqual(calculate(f), expected);
  f.eodRows[3].adjusted_close = null;
  assert.equal(calculate(f).divergenceRiskScore, null);
});

test('a lifecycle signal and different event price history cannot silently yield a score', () => {
  const f = fixture();
  f.eodRows[11].adjusted_close = 94;
  assert.equal(calculate(f).divergenceDebug.reason, 'event_price_history_mismatch');
  f.eodRows = f.eodRows.slice(8);
  assert.equal(calculate(f).divergenceDebug.reason, 'incomplete_event_history');
});

test('config is centralized, accepts intentional tuning and rejects malformed thresholds', () => {
  assert.equal(Object.isFrozen(STOCK_RSI_RISK_RULES), true);
  for (const config of [null, [], { typo: 1 }, { BASE_FORMING: NaN }, { DETERIORATION_LOOKBACK: 1.5 },
    { RISK_LOW_MIN: 70 }, { PRICE_RECOVERY_HIGH: 0.5 }, { TIME_DECAY_FIRST_AGE: 12 }]) {
    assert.equal(resolveStockRsiRiskRules(config), null);
    assert.equal(calculate(fixture(), config).divergenceRiskScore, null);
  }
  assert.equal(calculate(fixture(), { BASE_CONFIRMED: 55 }).divergenceRiskScore, 50);
});

test('active floor and level thresholds retain the confirmed lifecycle while exposing the raw score', () => {
  for (const [rawScore, score, level] of [[0, 25, 'LOW'], [24, 25, 'LOW'], [25, 25, 'LOW'], [44, 44, 'LOW'], [45, 45, 'MEDIUM'], [69, 69, 'MEDIUM'], [70, 70, 'HIGH'], [100, 100, 'HIGH']]) {
    // The stable fixture contributes -5 beyond its base (10 - 5 - 10).
    const result = calculate(fixture(), { BASE_CONFIRMED: rawScore + 5 });
    assert.equal(result.divergenceRiskScore, score);
    assert.equal(result.divergenceRiskLevel, level);
    assert.equal(result.divergenceDebug.state, 'CONFIRMED');
    assert.equal(result.divergenceDebug.rawRiskScore, rawScore);
    assert.equal(result.divergenceDebug.activeFloorApplied, rawScore < 25);
  }
  assert.equal(calculate(fixture(), { BASE_CONFIRMED: -100 }).divergenceRiskScore, 25);
  assert.equal(calculate(fixture(), { BASE_CONFIRMED: 200 }).divergenceRiskScore, 100);
  const recoveringForming = fixture({ state: 'FORMING', price: 99.5, rsi: 86 });
  recoveringForming.stockDetail.history.forEach((row, index) => { row.ma30 = 85 + index * 0.1; });
  const forming = calculate(recoveringForming);
  assert.equal(forming.divergenceDebug.state, 'FORMING');
  assert.equal(forming.divergenceRiskScore, 25);
  assert.equal(forming.divergenceRiskLevel, 'LOW');
  assert.equal(forming.divergenceDebug.activeFloorApplied, true);
});
