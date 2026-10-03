import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInvestmentDisplayRate, investmentPrincipalUsd, investmentPrincipalInput } from '../src/lib/investmentComparisonCurrency.js';

test('currency conversion preserves canonical USD principal through repeated display switches', () => {
  for (const draft of [
    { text: '1000000.123456', currency: 'USD', rate: 1 },
    { text: '1000000.12', currency: 'CNY', rate: 6.77 },
  ]) {
    const original = structuredClone(draft);
    const expected = draft.currency === 'USD' ? 1000000.123456 : 1000000.12 / 6.77;
    for (let i = 0; i < 100; i++) {
      investmentPrincipalInput(draft, 'USD', 6.77);
      investmentPrincipalInput(draft, 'CNY', 6.77);
      assert.equal(investmentPrincipalUsd(draft), expected);
    }
    assert.deepEqual(draft, original);
    assert.equal(investmentPrincipalInput(draft, draft.currency, draft.rate), draft.text);
  }
});

test('new display exchange rate changes equivalent input without changing invested USD', () => {
  const draft = { text: '7200', currency: 'CNY', rate: 7.2 };
  assert.equal(investmentPrincipalUsd(draft), 1000);
  assert.equal(investmentPrincipalInput(draft, 'USD', 6.77), '1000');
  assert.equal(investmentPrincipalInput(draft, 'CNY', 6.77), '6770');
  assert.equal(investmentPrincipalUsd(draft), 1000);
  assert.equal(investmentPrincipalInput({ text: '1.23456789', currency: 'USD', rate: 1 }, 'CNY', 6.77), '8.36');
});

test('invalid rates and unfinished input never create a zero investment or fallback rate', () => {
  for (const rate of [null, undefined, 0, -1, NaN, Infinity, '7.2']) {
    assert.equal(resolveInvestmentDisplayRate('CNY', rate), null);
    assert.equal(resolveInvestmentDisplayRate('USD', rate), 1);
    assert.ok(Number.isNaN(investmentPrincipalUsd({ text: '7200', currency: 'CNY', rate })));
    assert.equal(investmentPrincipalInput({ text: '1000', currency: 'USD', rate: 1 }, 'CNY', rate), '');
  }
  assert.equal(resolveInvestmentDisplayRate('EUR', 7.2), null);
  for (const text of ['', ' ', 'bad', 'Infinity']) {
    const draft = { text, currency: 'USD', rate: 1 };
    assert.ok(Number.isNaN(investmentPrincipalUsd(draft)));
    assert.equal(investmentPrincipalInput(draft, 'CNY', 7.2), text);
  }
  assert.equal(investmentPrincipalUsd({ text: '0', currency: 'USD', rate: 1 }), 0, 'recorded zero is distinct and rejected by principal limits');
});
