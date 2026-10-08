import assert from 'node:assert/strict';
import test from 'node:test';
import { createDcaMoneyFormatter, dcaAmountDraft, dcaAmountInput, normalizeDcaPlanUsd } from '../src/lib/dcaCurrency.js';
import { buildDcaModel } from '../src/lib/dcaLabModel.js';

const BASE_PLAN = { symbol: 'QQQ', startYear: 2025, endYear: 2026, initial: 1000, amount: 100, frequency: 'monthly' };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
const history = {
  version: 1, source: 'EODHD_EOD', symbol: 'QQQ', name: 'QQQ fixture', type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close',
  rows: [{ date: '2025-12-22', close: 100 }, { date: '2025-12-29', close: 120 }, { date: '2026-01-05', close: 80 }, { date: '2026-01-12', close: 90 }],
  availableFromDate: '2025-12-22', asOfDate: '2026-01-12', expectedAsOfDate: '2026-01-12', stale: false,
  staleReason: '', fetchedAt: '2026-01-12T22:00:00.000Z',
};

test('legacy plans stay USD while explicit CNY plan amounts normalize once at full precision', () => {
  const legacy = normalizeDcaPlanUsd(BASE_PLAN);
  assert.deepEqual(legacy, { ...BASE_PLAN, inputCurrency: 'USD', inputRate: 1 });
  const input = { ...BASE_PLAN, initial: 1000000.123456, amount: 987.654321, inputCurrency: 'CNY', inputRate: 6.77 };
  const original = structuredClone(input);
  const normalized = normalizeDcaPlanUsd(input);
  near(normalized.initial, 1000000.123456 / 6.77);
  near(normalized.amount, 987.654321 / 6.77);
  assert.deepEqual(normalized, { ...input, initial: input.initial / 6.77, amount: input.amount / 6.77, inputCurrency: 'USD', inputRate: 1 });
  assert.deepEqual(normalizeDcaPlanUsd(normalized), normalized);
  assert.deepEqual(input, original);
});

test('absent or invalid CNY rates and malformed amounts cannot become zero or a fallback exchange rate', () => {
  for (const inputRate of [undefined, null, 0, -1, NaN, Infinity, '6.77']) {
    assert.equal(normalizeDcaPlanUsd({ ...BASE_PLAN, inputCurrency: 'CNY', inputRate }), null);
    assert.equal(normalizeDcaPlanUsd({ ...BASE_PLAN, inputCurrency: 'USD', inputRate }).initial, 1000);
  }
  for (const value of [undefined, null, '', '100', NaN, Infinity, -1]) {
    assert.equal(normalizeDcaPlanUsd({ ...BASE_PLAN, initial: value }), null);
    assert.equal(normalizeDcaPlanUsd({ ...BASE_PLAN, amount: value }), null);
  }
  for (const plan of [null, undefined, [], 'plan', { ...BASE_PLAN, inputCurrency: 'EUR' }]) {
    assert.equal(normalizeDcaPlanUsd(plan), null);
  }
  assert.equal(normalizeDcaPlanUsd({ ...BASE_PLAN, initial: 0, amount: 0, inputCurrency: 'CNY', inputRate: 7 }).initial, 0);
  assert.equal(normalizeDcaPlanUsd({ ...BASE_PLAN, initial: 1e300, inputCurrency: 'CNY', inputRate: 1e-300 }), null);
});

test('amount drafts preserve typed precision and USD meaning across rate changes and repeated display switches', () => {
  const draft = dcaAmountDraft(1000000.123456, 'CNY', 6.77);
  const original = structuredClone(draft);
  assert.deepEqual(dcaAmountDraft(0), { text: '0', currency: 'USD', rate: 1 });
  assert.equal(dcaAmountInput(draft, 'CNY', 6.77), '1000000.123456');
  assert.equal(dcaAmountInput(draft, 'USD', 6.77), '147710.51');
  assert.equal(dcaAmountInput(dcaAmountDraft(7200, 'CNY', 7.2), 'CNY', 6.77), '6770');
  assert.equal(dcaAmountInput(dcaAmountDraft(1.23456789), 'CNY', 6.77), '8.36');
  for (let index = 0; index < 100; index += 1) {
    dcaAmountInput(draft, 'USD', 7.2);
    dcaAmountInput(draft, 'CNY', 7.2);
  }
  assert.deepEqual(draft, original);
});

test('missing and late rates preserve same-currency edits but never relabel unconvertible amounts', () => {
  for (const missing of [undefined, null, 0, -1, NaN, Infinity]) {
    const pending = { text: '1000.00', currency: 'CNY', rate: missing };
    assert.equal(dcaAmountInput(pending, 'CNY', missing), '1000.00');
    assert.equal(dcaAmountInput(pending, 'CNY', 6.77), '1000.00');
    assert.equal(dcaAmountInput(pending, 'USD', 6.77), '');
    assert.equal(dcaAmountInput(dcaAmountDraft(1000), 'CNY', missing), '');
  }
  const pendingPlan = { ...BASE_PLAN, inputCurrency: 'CNY', inputRate: null };
  assert.equal(normalizeDcaPlanUsd(pendingPlan), null);
  near(normalizeDcaPlanUsd({ ...pendingPlan, inputRate: 6.77 }).initial, 1000 / 6.77);
  for (const text of ['', '.', ' ', 'invalid', 'Infinity']) {
    assert.equal(dcaAmountInput({ text, currency: 'USD', rate: 1 }, 'USD', 6.77), text);
    assert.equal(dcaAmountInput({ text, currency: 'USD', rate: 1 }, 'CNY', 6.77), '');
  }
  assert.equal(dcaAmountInput(null, 'CNY', 6.77), '');
});

test('display formatters convert USD exactly once and distinguish currency, precision, signs and magnitude', () => {
  const usd = createDcaMoneyFormatter();
  const cny = createDcaMoneyFormatter('CNY', 6.77);
  assert.equal(usd.displayCurrency, 'USD');
  assert.equal(usd.displayRate, 1);
  assert.equal(cny.displayRate, 6.77);
  assert.equal(usd.money(1234.56), '$1,235');
  assert.equal(cny.money(1000), '¥6,770');
  assert.equal(cny.assetMoney(1.23456789), '¥8.36');
  assert.equal(usd.signed(-1234.56), '−$1,235');
  assert.equal(cny.signed(1000), '+¥6,770');
  assert.equal(cny.signed(0), '¥0');
  assert.equal(cny.assetMoney(0), '¥0.00');
  assert.equal(usd.headlineMoney(9999999.5), '$9,999,999.50');
  assert.equal(usd.headlineMoney(10000000), '$1000.00万');
  assert.equal(usd.headlineMoney(100000000), '$1.00亿');
  assert.equal(usd.headlineMoney(-123456789), '$-1.23亿');
  assert.equal(cny.headlineMoney(20000000), '¥1.35亿');
  assert.equal(usd.short(9999), '9,999');
  assert.equal(usd.short(12345), '1.2万');
  assert.equal(usd.short(-123456789), '-1.23亿');
  assert.equal(cny.short(10000), '6.8万');
});

test('all formatters fail closed for missing prices or exchange rates, including zero with an unknown rate', () => {
  const methods = ['money', 'assetMoney', 'headlineMoney', 'signed', 'short'];
  for (const currency of ['USD', 'CNY']) {
    const formatter = createDcaMoneyFormatter(currency, 6.77);
    for (const method of methods) {
      for (const missing of [null, undefined, '', '1000', NaN, Infinity]) assert.equal(formatter[method](missing), '—');
    }
  }
  for (const rate of [undefined, null, 0, -1, NaN, Infinity, '6.77']) {
    const formatter = createDcaMoneyFormatter('CNY', rate);
    assert.equal(formatter.displayRate, null);
    for (const method of methods) {
      assert.equal(formatter[method](1000), '—');
      assert.equal(formatter[method](0), '—');
    }
  }
  assert.equal(createDcaMoneyFormatter('CNY', 1e300).money(1e300), '—');
});

test('changing display currency or current FX cannot change normalized plans, market prices or model returns', () => {
  const plan = normalizeDcaPlanUsd({ ...BASE_PLAN, initial: 6770, amount: 677, inputCurrency: 'CNY', inputRate: 6.77 });
  const originalPlan = structuredClone(plan), originalData = structuredClone(history);
  const model = buildDcaModel({ data: history, plan });
  near(model.summary.returnPct, -8.125);
  near(model.summary.lumpReturnPct, -10);
  const modelBefore = structuredClone(model);
  for (const [currency, rate] of [['USD', 6.77], ['CNY', 6.77], ['CNY', 7.2], ['CNY', null], ['USD', null]]) {
    const formatter = createDcaMoneyFormatter(currency, rate);
    for (const row of model.rows) {
      formatter.assetMoney(row.value);
      formatter.assetMoney(row.lumpValue);
      formatter.signed(row.advantage);
    }
    dcaAmountInput(dcaAmountDraft(plan.initial), currency, rate);
  }
  assert.deepEqual(plan, originalPlan);
  assert.deepEqual(history, originalData);
  assert.deepEqual(model, modelBefore);
  assert.deepEqual(buildDcaModel({ data: history, plan }), modelBefore);
});
