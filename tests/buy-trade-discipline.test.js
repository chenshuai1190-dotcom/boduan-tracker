import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveBuyTradeDiscipline } from '../src/lib/buyTradeDiscipline.js';
import { getInvestmentComparisonExpectedCloseDate } from '../src/lib/investmentComparison.js';
import { stockRsiLocalDateKey } from '../src/lib/stockRsiReference.js';
import { getVixComparisonExpectedCloseDate } from '../src/lib/vixComparisonSession.js';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = stockRsiLocalDateKey(NOW);
const RSI_DATE = getInvestmentComparisonExpectedCloseDate(NOW);
const VIX_DATE = getVixComparisonExpectedCloseDate(NOW);
const rsiReference = (value = 78.2, patch = {}) => ({ status: 'ready', reason: '',
  observation: { value, asOf: RSI_DATE }, ...patch });
const vixReference = (value = 0.89, patch = {}) => ({ vixRatioReady: true,
  vixRatioValue: value, vixRatioDataDate: VIX_DATE, vixRatioBuySignal: value > 1, ...patch });
const derive = (patch = {}) => deriveBuyTradeDiscipline({ tradeDate: TODAY,
  rsiReference: rsiReference(), vixReference: vixReference(), now: NOW, ...patch });

test('new formal buy reports both known non-qualifying conditions with dated values', () => {
  const result = derive();
  assert.equal(result.applies, true);
  assert.equal(result.status, 'unmet');
  assert.equal(result.reason, 'conditions-not-met');
  assert.deepEqual(result.rsi, { ready: true, value: 78.2, asOf: RSI_DATE, met: false, zone: 'overbought' });
  assert.deepEqual(result.vix, { ready: true, value: 0.89, asOf: VIX_DATE, met: false });
});

test('RSI inclusive 20 and VIX strictly above 1 are compared before presentation rounding', () => {
  for (const [value, qualifies] of [[0, true], [19.99999, true], [20, true], [20.00001, false], [100, false]]) {
    const result = derive({ rsiReference: rsiReference(value), vixReference: vixReference(1) });
    assert.equal(result.rsi.value, value);
    assert.equal(result.rsi.met, qualifies);
    assert.equal(result.status, qualifies ? 'met' : 'unmet');
  }
  for (const [value, qualifies] of [[0.89, false], [0.999999, false], [1, false], [1.0000000001, true], [1.2, true]]) {
    const result = derive({ vixReference: vixReference(value, { vixRatioBuySignal: !qualifies }) });
    assert.equal(result.vix.value, value);
    assert.equal(result.vix.met, qualifies, 'a possibly rounded flag never overrides the validated numeric ratio');
    assert.equal(result.status, qualifies ? 'met' : 'unmet');
  }
});

test('OR rule allows either known condition while unavailable alternatives remain unknown individually', () => {
  const fromRsi = derive({ rsiReference: rsiReference(18.6), vixReference: null });
  assert.equal(fromRsi.status, 'met');
  assert.equal(fromRsi.reason, 'rsi-extreme-oversold');
  assert.equal(fromRsi.vix.ready, false);
  const fromVix = derive({ rsiReference: { status: 'loading', observation: null }, vixReference: vixReference(1.1) });
  assert.equal(fromVix.status, 'met');
  assert.equal(fromVix.reason, 'vix-inversion');
  assert.equal(fromVix.rsi.ready, false);
  assert.equal(derive({ rsiReference: rsiReference(18), vixReference: vixReference(1.1) }).reason, 'both-conditions');
  for (const patch of [{ rsiReference: null }, { vixReference: null }, { rsiReference: null, vixReference: null }]) {
    assert.equal(derive(patch).status, 'unknown', 'missing observations cannot prove both conditions failed');
  }
});

test('invalid numeric types and ranges never become qualifying zero values', () => {
  for (const value of [undefined, null, '', '18', NaN, Infinity, -Infinity, -1, 101]) {
    const result = derive({ rsiReference: rsiReference(78.2, { observation: { value, asOf: RSI_DATE } }) });
    assert.equal(result.status, 'unknown');
    assert.equal(result.rsi.ready, false);
    assert.equal(result.rsi.value, null);
    assert.equal(result.rsi.met, false);
  }
  for (const value of [undefined, null, '', '1.1', NaN, Infinity, -Infinity, -1, 0]) {
    const result = derive({ vixReference: vixReference(0.89, { vixRatioValue: value }) });
    assert.equal(result.status, 'unknown');
    assert.equal(result.vix.ready, false);
    assert.equal(result.vix.value, null);
    assert.equal(result.vix.met, false);
  }
});

test('unavailable, stale and incorrect-session references cannot qualify a current confirmation', () => {
  for (const reference of [rsiReference(18, { status: 'loading' }), rsiReference(18, { status: 'unavailable' }),
    rsiReference(18, { stale: true }), rsiReference(18, { observation: { value: 18, asOf: '2026-10-01' } }),
    rsiReference(18, { observation: { value: 18, asOf: '2026-10-05' } }),
    rsiReference(18, { observation: { value: 18, asOf: '2026-02-30' } })]) {
    const result = derive({ rsiReference: reference });
    assert.equal(result.status, 'unknown');
    assert.equal(result.rsi.value, null);
    assert.equal(result.rsi.asOf, '');
  }
  for (const reference of [vixReference(1.1, { vixRatioReady: false }), vixReference(1.1, { stale: true }),
    vixReference(1.1, { vixRatioDataDate: '2026-10-01' }), vixReference(1.1, { vixRatioDataDate: '2026-10-05' }),
    vixReference(1.1, { vixRatioDataDate: '' })]) {
    const result = derive({ vixReference: reference });
    assert.equal(result.status, 'unknown');
    assert.equal(result.vix.value, null);
    assert.equal(result.vix.asOf, '');
  }
  const laterDay = NOW + 24 * 60 * 60 * 1000;
  assert.equal(derive({ now: laterDay, tradeDate: stockRsiLocalDateKey(laterDay),
    rsiReference: rsiReference(18), vixReference: vixReference(1.1) }).status, 'unknown');
});

test('past trades and any edit stay neutral instead of being judged using current signals', () => {
  for (const patch of [{ tradeDate: '2026-10-02' }, { editingId: 'trade-123' }, { editingId: 0 }]) {
    const result = derive({ ...patch, rsiReference: rsiReference(18), vixReference: vixReference(1.1) });
    assert.equal(result.applies, false);
    assert.equal(result.status, 'historical');
    assert.equal(result.rsi.value, null);
    assert.equal(result.vix.value, null);
  }
  const afterClose = Date.parse('2026-10-05T21:00:00Z');
  const completedDate = getInvestmentComparisonExpectedCloseDate(afterClose);
  const result = derive({ now: afterClose, tradeDate: completedDate,
    rsiReference: rsiReference(18, { observation: { value: 18, asOf: completedDate } }),
    vixReference: vixReference(1.1, { vixRatioDataDate: completedDate }) });
  assert.equal(result.status, 'historical', 'a date-only trade cannot prove execution followed that same-day close');
});

test('other scopes, sells, malformed dates and invalid clock do not apply buy discipline', () => {
  for (const patch of [{ side: 'sell' }, { scope: 'wave' }, { scope: '' }, { side: '' },
    { tradeDate: undefined }, { tradeDate: '' }, { tradeDate: '2026-02-30' },
    { tradeDate: '2999-01-01' }, { tradeDate: '2026-10-05T12:00:00Z' },
    ...[NaN, Infinity, null, '', '2026-10-05T12:00:00Z', new Date(NaN)].map(now => ({ now }))]) {
    const result = derive(patch);
    assert.equal(result.applies, false);
    assert.equal(result.status, 'not-applicable');
    assert.equal(result.rsi.ready, false);
    assert.equal(result.vix.ready, false);
  }
});

test('RSI status preserves existing panic, extreme, oversold and overbought boundaries', () => {
  for (const [value, zone] of [[15, 'panic-oversold'], [15.00001, 'extremely-oversold'],
    [20, 'extremely-oversold'], [20.00001, 'oversold'], [30, 'oversold'], [30.00001, 'neutral'],
    [69.99999, 'neutral'], [70, 'overbought'], [79.99999, 'overbought'], [80, 'strongly-overbought']]) {
    assert.equal(derive({ rsiReference: rsiReference(value) }).rsi.zone, zone);
  }
});

test('evaluation is pure and does not mutate references or author a trade payload', () => {
  const input = { tradeDate: TODAY, side: 'buy', scope: 'ledger', now: NOW,
    rsiReference: rsiReference(20), vixReference: vixReference(1.1) };
  const before = structuredClone(input);
  const result = deriveBuyTradeDiscipline(input);
  assert.deepEqual(input, before);
  assert.equal(Object.hasOwn(result, 'payload'), false);
  assert.equal(Object.hasOwn(result, 'hardBlocked'), false);
});
