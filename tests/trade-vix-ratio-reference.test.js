import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTradeVixRatioReference } from '../src/lib/tradeVixRatioReference.js';
import { stockRsiLocalDateKey } from '../src/lib/stockRsiReference.js';
import { getVixComparisonExpectedCloseDate } from '../src/lib/vixComparisonSession.js';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = stockRsiLocalDateKey(NOW);
const CLOSE_DATE = getVixComparisonExpectedCloseDate(NOW);
const UNAVAILABLE = Object.freeze({ vixRatioReady: false, vixRatioValue: null,
  vixRatioDataDate: '', vixRatioBuySignal: false });
const row = (patch = {}) => ({ date: CLOSE_DATE, vix: 22, vix3m: 20, ratio: 1.1, ...patch });
const data = (patch = {}) => ({ termStructure: { source: 'CBOE', stale: false,
  asOfDate: CLOSE_DATE, expectedAsOfDate: CLOSE_DATE, rows: [row()], ...patch } });
const derive = (value, options = {}) => deriveTradeVixRatioReference({
  data: value, tradeDate: TODAY, now: NOW, ...options,
});

test('buy reference uses the current completed Cboe same-session ratio independently of ETF freshness', () => {
  assert.deepEqual(derive({ ...data(), stale: true, asOfDate: '2026-10-01',
    staleReason: 'provider_unavailable' }), {
    vixRatioReady: true, vixRatioValue: 1.1, vixRatioDataDate: CLOSE_DATE, vixRatioBuySignal: true,
  });
  const value = data();
  const snapshot = structuredClone(value);
  derive(value);
  assert.deepEqual(value, snapshot, 'a display reference must not change provider observations');
});

test('only an unrounded ratio strictly above one triggers buying', () => {
  for (const ratio of [0.9, 0.999999, 1, 1.000001, 1.1]) {
    const result = derive(data({ rows: [row({ vix: ratio * 20, vix3m: 20, ratio })] }));
    assert.equal(result.vixRatioReady, true);
    assert.equal(result.vixRatioBuySignal, ratio > 1);
    assert.equal(result.vixRatioValue, ratio * 20 / 20);
  }
  const nearlyOne = 1.0000000001;
  const result = derive(data({ rows: [row({ vix: nearlyOne, vix3m: 1, ratio: 1 })] }));
  assert.equal(result.vixRatioBuySignal, true, 'the source closes decide the threshold within the wire validation tolerance');
  assert.equal(result.vixRatioValue, nearlyOne);
});

test('missing, stale, mismatched and incomplete term observations never become a signal', () => {
  for (const value of [undefined, null, {}, { termStructure: null },
    data({ source: 'FRED' }), data({ source: undefined }),
    data({ stale: true }), data({ stale: undefined }),
    data({ asOfDate: '2026-10-01' }), data({ asOfDate: undefined }),
    data({ expectedAsOfDate: '2026-10-01' }), data({ expectedAsOfDate: '2026-10-05' }),
    data({ expectedAsOfDate: undefined }), data({ rows: [] }), data({ rows: null }),
    data({ rows: [row({ date: '2026-10-01' })] }),
    data({ rows: [row(), row({ date: '2026-10-05' })] }),
    data({ rows: [row({ ratio: 1.2 })] })]) {
    assert.deepEqual(derive(value), UNAVAILABLE);
  }
});

test('each close and ratio must be a finite positive number', () => {
  for (const key of ['vix', 'vix3m', 'ratio']) {
    for (const value of [undefined, null, '', '22', 0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(derive(data({ rows: [row({ [key]: value })] })), UNAVAILABLE, `${key}: ${value}`);
    }
  }
});

test('historical, future, malformed and invalid-clock trade entries cannot reuse the current ratio', () => {
  for (const tradeDate of ['2026-10-02', '2999-01-01', undefined, '', '2026-02-30', '2026-10-05T12:00:00Z']) {
    assert.deepEqual(derive(data(), { tradeDate }), UNAVAILABLE);
  }
  assert.deepEqual(derive(data(), { now: NaN }), UNAVAILABLE);
  const afterClose = Date.parse('2026-10-05T20:30:00Z');
  const completedDate = getVixComparisonExpectedCloseDate(afterClose);
  const completed = data({ asOfDate: completedDate, expectedAsOfDate: completedDate,
    rows: [row({ date: completedDate })] });
  assert.deepEqual(derive(completed, { now: afterClose, tradeDate: completedDate }), UNAVAILABLE,
    'a date-only entry cannot prove its execution occurred after that same-day close');
});
