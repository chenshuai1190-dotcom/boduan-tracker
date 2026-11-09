import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStockDailyHistoryRequests, loadReviewStockDailyHistory } from '../src/lib/reviewStockDailyRecordHistory.js';

const range = (symbol, year = 2026) => ({ symbol, year, startDate: `${year - 1}-12-31`, endDate: `${year}-11-06` });

test('one batch covers multiple years for a symbol; padding never replaces its data', () => {
  assert.deepEqual(reviewStockDailyHistoryRequests([range('NVDA'), range('NVDA', 2025)]),
    [{ symbols: ['NVDA', 'QQQ'], startDate: '2024-12-31', endDate: '2026-11-06' }]);
  assert.deepEqual(reviewStockDailyHistoryRequests([range('QQQ')])[0].symbols, ['QQQ', 'SPY']);
  assert.deepEqual(reviewStockDailyHistoryRequests([]), []);
});

test('market requests stay at two in flight; a failed group stays a reported failure', async () => {
  const ranges = Array.from({ length: 13 }, (_, index) => range(`S${index}`));
  let active = 0, maximum = 0, calls = 0;
  const result = await loadReviewStockDailyHistory({ ranges, userId: 'owner', loadHistory: async request => {
    active++; maximum = Math.max(maximum, active); const call = calls++;
    await new Promise(resolve => setImmediate(resolve)); active--;
    if (call === 1) throw new Error('provider unavailable');
    return { symbols: request.symbols };
  } });
  assert.equal(maximum, 2);
  assert.equal(calls, 4);
  assert.equal(result.histories.length, 3);
  assert.equal(result.failures, 1);
});

test('identity failures and bounds never masquerade as a successful empty year', async () => {
  await assert.rejects(loadReviewStockDailyHistory({ ranges: [range('NVDA')], userId: 'owner',
    loadHistory: async () => { throw Object.assign(new Error('changed'), { code: 'AUTH_REQUIRED' }); } }), { code: 'AUTH_REQUIRED' });
  assert.throws(() => reviewStockDailyHistoryRequests(Array.from({ length: 129 }, (_, index) => range(`S${index}`))),
    { code: 'REVIEW_STOCK_HISTORY_LIMIT' });
});
