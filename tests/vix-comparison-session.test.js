import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getVixComparisonExpectedCloseDate,
  getVixSessionStatus,
  isVixComparisonSession,
  nextVixComparisonSession,
} from '../src/lib/vixComparisonSession.js';
import { buildVixComparisonData } from '../server/quote/vixComparison.js';

function rawRows(dates) {
  return Object.fromEntries(['VIX', 'VIX3M', 'SPY', 'QQQ'].map((symbol, index) => [symbol,
    dates.map(date => ({ date, close: 20 + index, adjusted_close: 100 + index })),
  ]));
}

test('VIX calendar classifies documented official closures separately from weekends and sessions', () => {
  assert.deepEqual(getVixSessionStatus('2025-01-09'), {
    kind: 'official_closure', reason: 'national_day_of_mourning_jimmy_carter',
  });
  assert.deepEqual(getVixSessionStatus('2018-12-05'), {
    kind: 'official_closure', reason: 'national_day_of_mourning_george_h_w_bush',
  });
  assert.deepEqual(getVixSessionStatus('2025-01-01'), { kind: 'official_closure', reason: 'regular_exchange_holiday' });
  assert.deepEqual(getVixSessionStatus('2025-01-11'), { kind: 'weekend', reason: 'weekend' });
  assert.deepEqual(getVixSessionStatus('2025-01-10'), { kind: 'session', reason: '' });
  assert.equal(isVixComparisonSession('2025-01-09'), false);
  assert.equal(isVixComparisonSession('2018-12-05'), false);
  assert.equal(isVixComparisonSession('2025-01-10'), true);
});

test('adjacent sessions bridge official closures while a missing ordinary provider day remains a real gap', () => {
  assert.equal(nextVixComparisonSession('2025-01-08'), '2025-01-10');
  assert.equal(nextVixComparisonSession('2025-01-09'), '2025-01-10');
  assert.equal(nextVixComparisonSession('2025-01-10'), '2025-01-13');
  assert.equal(nextVixComparisonSession('2018-12-04'), '2018-12-06');
  assert.equal(nextVixComparisonSession('2025-01-17'), '2025-01-21', 'skip weekend and MLK Day');
  const provided = new Set(['2025-01-08', '2025-01-13']);
  const expectedNext = nextVixComparisonSession('2025-01-08');
  assert.equal(getVixSessionStatus(expectedNext).kind, 'session');
  assert.equal(provided.has(expectedNext), false, 'Jan 10 absence is provider data loss, not an official closure');
});

test('special closure and following pre-close windows expect the last actual completed session', () => {
  for (const [timestamp, date] of [
    ['2025-01-09T15:00:00Z', '2025-01-08'],
    ['2025-01-09T21:30:00Z', '2025-01-08'],
    ['2025-01-10T21:29:59Z', '2025-01-08'],
    ['2025-01-10T21:30:00Z', '2025-01-10'],
    ['2018-12-05T22:00:00Z', '2018-12-04'],
    ['2018-12-06T21:29:59Z', '2018-12-04'],
    ['2018-12-06T21:30:00Z', '2018-12-06'],
  ]) assert.equal(getVixComparisonExpectedCloseDate(Date.parse(timestamp)), date, timestamp);
});

test('calendar rejects coercion and normalized invalid dates instead of treating them as missing sessions', () => {
  for (const value of [undefined, null, '', '2025-1-09', '2025-01-9', '2025-02-29', '2024-02-30',
    '2025-01-09T00:00:00Z', ' 2025-01-09', '2025-01-09 ', '0000-01-01', '10000-01-01',
    20250109, new Date('2025-01-09T00:00:00Z'), {}, []]) {
    assert.deepEqual(getVixSessionStatus(value), { kind: 'invalid_date', reason: 'invalid_date' });
    assert.equal(isVixComparisonSession(value), false);
    assert.equal(nextVixComparisonSession(value), null);
  }
  assert.deepEqual(getVixSessionStatus('2024-02-29'), { kind: 'session', reason: '' });
  assert.equal(nextVixComparisonSession('9999-12-31'), null);
});

test('server VIX history excludes fabricated special-closure rows but never forward-fills a missing session', () => {
  const expectedAsOfDate = '2025-01-13';
  const now = Date.parse('2025-01-13T22:00:00Z');
  const complete = buildVixComparisonData(rawRows(['2025-01-08', '2025-01-09', '2025-01-10', '2025-01-13']), { expectedAsOfDate, now });
  assert.deepEqual(complete.series.VIX.rows.map(row => row.date), ['2025-01-08', '2025-01-10', '2025-01-13']);
  assert.deepEqual(complete.termStructure.rows.map(row => row.date), ['2025-01-08', '2025-01-10', '2025-01-13']);
  const absent = buildVixComparisonData(rawRows(['2025-01-08', '2025-01-13']), { expectedAsOfDate, now });
  assert.deepEqual(absent.termStructure.rows.map(row => row.date), ['2025-01-08', '2025-01-13']);
  assert.equal(nextVixComparisonSession(absent.termStructure.rows[0].date), '2025-01-10');
  assert.throws(() => buildVixComparisonData(rawRows(['2025-01-07', '2025-01-08']), {
    expectedAsOfDate: '2025-01-09', now,
  }), /completed date is invalid/);
});
