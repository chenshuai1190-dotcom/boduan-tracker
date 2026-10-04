import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvestmentComparisonLead } from '../src/lib/investmentComparisonLead.js';

const symbols = ['QQQ', 'TQQQ'];
const point = (qqq, tqqq, qqqReturn, tqqqReturn) => ({
  values: { QQQ: qqq, TQQQ: tqqq },
  returns: { QQQ: qqqReturn, TQQQ: tqqqReturn },
});
const tied = { leader: null, trailing: null, amountUsd: 0, tied: true, returnGapPoints: null };

test('lead compares full precision assets and follows the winning symbol on either side', () => {
  const expected = { leader: 'QQQ', trailing: 'TQQQ', amountUsd: 12000.125 - 10000.0625, tied: false, returnGapPoints: null };
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(12000.125, 10000.0625)), expected);
  assert.deepEqual(getInvestmentComparisonLead([...symbols].reverse(), point(12000.125, 10000.0625)), expected);
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(10000.0625, 12000.125)), {
    ...expected, leader: 'TQQQ', trailing: 'QQQ',
  });
});

test('equal principal at the initial replay point is tied, including known zero assets', () => {
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(1000000, 1000000)), tied);
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(0, 0)), tied);
});

test('floating point noise uses the same scale-sensitive tolerance as the chart', () => {
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(0.1 + 0.2, 0.3)), tied);
  const base = 1e12;
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(base + 0.001, base)), tied);
  const meaningful = getInvestmentComparisonLead(symbols, point(base + 0.01, base));
  assert.equal(meaningful.tied, false);
  assert.equal(meaningful.amountUsd, (base + 0.01) - base);
});

test('a less negative outcome leads even when both asset values are below principal', () => {
  const principal = 10000;
  const values = [principal * 0.8, principal * 0.6];
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(...values)), {
    leader: 'QQQ', trailing: 'TQQQ', amountUsd: 2000, tied: false, returnGapPoints: null,
  });
});

test('unavailable or nonnumeric values never become a zero asset or a tie', () => {
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, '100', '', false]) {
    assert.equal(getInvestmentComparisonLead(symbols, point(invalid, 100)), null);
    assert.equal(getInvestmentComparisonLead(symbols, point(100, invalid)), null);
  }
  for (const invalidPoint of [null, undefined, {}, { values: {} }, { values: { QQQ: 0 } }]) {
    assert.equal(getInvestmentComparisonLead(symbols, invalidPoint), null);
  }
});

test('invalid pairs cannot produce a comparison', () => {
  for (const invalid of [null, undefined, 'QQQ', [], ['QQQ'], ['QQQ', 'TQQQ', 'SPY'], ['QQQ', 'QQQ'], ['', 'TQQQ'], [' ', 'TQQQ'], [null, 'TQQQ'], [1, 'TQQQ']]) {
    assert.equal(getInvestmentComparisonLead(invalid, point(100, 200)), null);
  }
});

test('selected point alone determines leadership and gap as playback changes', () => {
  const history = [point(100, 100), point(120, 110), point(125, 150)];
  assert.deepEqual(history.map(value => getInvestmentComparisonLead(symbols, value)), [
    tied,
    { leader: 'QQQ', trailing: 'TQQQ', amountUsd: 10, tied: false, returnGapPoints: null },
    { leader: 'TQQQ', trailing: 'QQQ', amountUsd: 25, tied: false, returnGapPoints: null },
  ]);
});

test('very large and fractional gaps retain canonical precision before any display conversion', () => {
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(1e100, 9e100)), {
    leader: 'TQQQ', trailing: 'QQQ', amountUsd: 9e100 - 1e100, tied: false, returnGapPoints: null,
  });
  assert.deepEqual(getInvestmentComparisonLead(symbols, point(1, 1.0000001)), {
    leader: 'TQQQ', trailing: 'QQQ', amountUsd: 1.0000001 - 1, tied: false, returnGapPoints: null,
  });
  assert.equal(getInvestmentComparisonLead(symbols, point(Number.MAX_VALUE, -Number.MAX_VALUE)), null);
});

test('computing a gap does not mutate symbols or financial point values', () => {
  const originalSymbols = Object.freeze([...symbols]);
  const originalPoint = Object.freeze({ date: '2026-10-02', values: Object.freeze({ QQQ: 125, TQQQ: 150 }) });
  const before = structuredClone(originalPoint);
  getInvestmentComparisonLead(originalSymbols, originalPoint);
  assert.deepEqual(originalSymbols, symbols);
  assert.deepEqual(originalPoint, before);
});

test('return leads subtract raw percentage values as percentage points before rounding', () => {
  const historical = point(13000.1234, 11000.5678, 30.001234, 10.005678);
  const lead = getInvestmentComparisonLead(symbols, historical);
  assert.equal(lead.returnGapPoints, 30.001234 - 10.005678);
  assert.notEqual(lead.returnGapPoints, 20);
  assert.deepEqual(getInvestmentComparisonLead([...symbols].reverse(), historical), lead);
  assert.equal(getInvestmentComparisonLead(symbols, point(8000, 6000, -20, -40)).returnGapPoints, 20);
  assert.equal(getInvestmentComparisonLead(symbols, point(10000, 20000, 0, 100)).returnGapPoints, 100);
});

test('missing, invalid or contradictory returns never become a zero return lead', () => {
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, '30', '', false]) {
    assert.equal(getInvestmentComparisonLead(symbols, point(13000, 11000, invalid, 10)).returnGapPoints, null);
    assert.equal(getInvestmentComparisonLead(symbols, point(13000, 11000, 30, invalid)).returnGapPoints, null);
  }
  assert.equal(getInvestmentComparisonLead(symbols, point(13000, 11000, 10, 30)).returnGapPoints, null);
  assert.equal(getInvestmentComparisonLead(symbols, point(13000, 11000, Number.MAX_VALUE, -Number.MAX_VALUE)).returnGapPoints, null);
  assert.equal(getInvestmentComparisonLead(symbols, point(13000, 11000)).amountUsd, 2000);
});

test('tied assets show zero percentage points only when known returns agree within tolerance', () => {
  assert.equal(getInvestmentComparisonLead(symbols, point(10000, 10000, 0, 0)).returnGapPoints, 0);
  assert.equal(getInvestmentComparisonLead(symbols, point(10000, 10000, 0.1 + 0.2, 0.3)).returnGapPoints, 0);
  assert.equal(getInvestmentComparisonLead(symbols, point(10000, 10000, 30, 20)).returnGapPoints, null);
  assert.equal(getInvestmentComparisonLead(symbols, point(10000, 10000, null, null)).returnGapPoints, null);
  assert.equal(getInvestmentComparisonLead(symbols, point(10000, 10000, Number.MAX_VALUE, -Number.MAX_VALUE)).returnGapPoints, null);
});

test('display currency metadata cannot change the canonical asset or return gaps', () => {
  const historical = point(15125.25, 12123.125, 51.2525, 21.23125);
  const expected = getInvestmentComparisonLead(symbols, historical);
  for (const [displayCurrency, displayRate] of [['USD', 1], ['CNY', 6.7048], ['CNY', null]]) {
    assert.deepEqual(getInvestmentComparisonLead(symbols, { ...historical, displayCurrency, displayRate }), expected);
  }
});
