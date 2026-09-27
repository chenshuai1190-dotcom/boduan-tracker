import assert from 'node:assert/strict';
import test from 'node:test';
import { getCompletedMarketCloseDate } from '../server/quote/completedSession.js';
import { getVixComparisonExpectedCloseDate } from '../src/lib/vixComparisonSession.js';

test('ordinary market tools keep the 16:00 close while only VIX waits until 16:30 ET', () => {
  const cases = [
    ['2026-09-08T19:59:59Z', '2026-09-04', '2026-09-04'],
    ['2026-09-08T20:00:00Z', '2026-09-08', '2026-09-04'],
    ['2026-09-08T20:01:00Z', '2026-09-08', '2026-09-04'],
    ['2026-09-08T20:30:00Z', '2026-09-08', '2026-09-08'],
    ['2026-01-05T21:01:00Z', '2026-01-05', '2026-01-02'],
    ['2026-01-05T21:30:00Z', '2026-01-05', '2026-01-05'],
    ['2026-09-07T23:00:00Z', '2026-09-04', '2026-09-04'],
    ['2026-09-06T21:00:00Z', '2026-09-04', '2026-09-04'],
    ['2026-04-03T21:00:00Z', '2026-04-02', '2026-04-02'],
    ['2022-01-01T03:00:00Z', '2021-12-31', '2021-12-31'],
  ];
  for (const [time, market, vix] of cases) {
    assert.equal(getCompletedMarketCloseDate(Date.parse(time)), market, time);
    assert.equal(getVixComparisonExpectedCloseDate(Date.parse(time)), vix, time);
  }
  assert.throws(() => getCompletedMarketCloseDate(NaN), /time is invalid/);
});
