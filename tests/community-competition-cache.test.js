import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearCommunityCompetitionCache,
  COMMUNITY_COMPETITION_CACHE_VERSION,
  getCommunityCompetitionRefreshDecision,
  nextCommunityCompetitionPrimaryRefreshAt,
  readCommunityCompetitionCache,
  requestCommunityCompetitionRefresh,
  resolveCommunityCompetitionRefreshWindow,
  shouldRecordCommunityCompetitionRefreshFailure,
  writeCommunityCompetitionCache,
} from '../src/lib/communityCompetitionCache.js';
import { userScopedStorageKey } from '../src/lib/userScopedStorage.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

const ready = (period = 'day', asOfDate = '2026-07-13') => ({
  success: true,
  state: 'ready',
  period,
  asOfDate,
  snapshotUpdatedAt: `${asOfDate}T21:18:00.000Z`,
  leaders: [],
  self: { rank: 1, avatarKey: 'cyber-cyan' },
});

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('cache is isolated by user and period and only persists snapshot states', () => {
  writeCommunityCompetitionCache({ userId: 'user-a', period: 'day', data: ready('day') });
  writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'week',
    data: { success: true, state: 'waiting_snapshot', period: 'week' },
  });

  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' })?.data?.state, 'ready');
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'week' })?.data?.state, 'waiting_snapshot');
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'month' }), null);
  assert.equal(readCommunityCompetitionCache({ userId: 'user-b', period: 'day' }), null);

  writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'day',
    data: { success: true, state: 'join_required', period: 'day' },
  });
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }), null);
});

test('damaged, old-version, and mismatched-period entries are ignored', () => {
  const key = userScopedStorageKey('bottomline_community_competition_cache_v1_day', 'user-a');
  localStorage.setItem(key, '{not-json');
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }), null);

  localStorage.setItem(key, JSON.stringify({
    version: COMMUNITY_COMPETITION_CACHE_VERSION - 1,
    period: 'day',
    savedAt: Date.now(),
    data: ready('day'),
  }));
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }), null);

  localStorage.setItem(key, JSON.stringify({
    version: COMMUNITY_COMPETITION_CACHE_VERSION,
    period: 'day',
    savedAt: Date.now(),
    data: ready('week'),
  }));
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }), null);
});

test('ready cache entries require the authoritative snapshot lock timestamp', () => {
  const data = ready('day');
  delete data.snapshotUpdatedAt;
  assert.equal(writeCommunityCompetitionCache({ userId: 'user-a', period: 'day', data }), null);
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }), null);
});

test('New York refresh windows are DST-safe and skip weekends', () => {
  const summerBefore = resolveCommunityCompetitionRefreshWindow(new Date('2026-07-14T21:09:59Z'));
  const summerOpen = resolveCommunityCompetitionRefreshWindow(new Date('2026-07-14T21:10:00Z'));
  const summerRetry = resolveCommunityCompetitionRefreshWindow(new Date('2026-07-14T23:10:00Z'));
  assert.equal(summerBefore.targetDate, '2026-07-13');
  assert.equal(summerOpen.targetDate, '2026-07-14');
  assert.equal(summerOpen.stage, 1);
  assert.equal(summerRetry.stage, 2);

  const winterBefore = resolveCommunityCompetitionRefreshWindow(new Date('2026-01-14T22:09:59Z'));
  const winterOpen = resolveCommunityCompetitionRefreshWindow(new Date('2026-01-14T22:10:00Z'));
  assert.equal(winterBefore.targetDate, '2026-01-13');
  assert.equal(winterOpen.targetDate, '2026-01-14');

  const fridayAfterWindow = new Date('2026-07-17T23:30:00Z');
  const nextRefresh = nextCommunityCompetitionPrimaryRefreshAt(fridayAfterWindow);
  assert.equal(new Date(nextRefresh).toISOString(), '2026-07-20T21:10:00.000Z');
  assert.equal(resolveCommunityCompetitionRefreshWindow(new Date('2026-07-18T16:00:00Z')).targetDate, '2026-07-17');
});

test('a current cached snapshot avoids entry reads until the next New York close window', () => {
  const entry = writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'day',
    data: ready('day', '2026-07-13'),
    now: new Date('2026-07-14T14:00:00Z'),
  });
  const before = getCommunityCompetitionRefreshDecision({ entry, now: new Date('2026-07-14T21:09:59Z') });
  const after = getCommunityCompetitionRefreshDecision({ entry, now: new Date('2026-07-14T21:10:00Z') });
  assert.equal(before.shouldRefresh, false);
  assert.equal(before.reason, 'snapshot_current');
  assert.equal(after.shouldRefresh, true);
  assert.equal(after.reason, 'new_refresh_window');
});

test('stale snapshots get one primary read and only one bounded late retry', async () => {
  writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'day',
    data: ready('day', '2026-07-13'),
    now: new Date('2026-07-14T14:00:00Z'),
  });
  let calls = 0;
  await requestCommunityCompetitionRefresh({
    userId: 'user-a',
    period: 'day',
    now: new Date('2026-07-14T21:10:00Z'),
    fetcher: async () => {
      calls += 1;
      return ready('day', '2026-07-13');
    },
  });
  const afterFirst = readCommunityCompetitionCache({ userId: 'user-a', period: 'day' });
  assert.equal(afterFirst.refresh.attempts, 1);
  assert.equal(getCommunityCompetitionRefreshDecision({ entry: afterFirst, now: new Date('2026-07-14T22:30:00Z') }).shouldRefresh, false);
  assert.equal(getCommunityCompetitionRefreshDecision({ entry: afterFirst, now: new Date('2026-07-14T23:10:00Z') }).shouldRefresh, true);

  await requestCommunityCompetitionRefresh({
    userId: 'user-a',
    period: 'day',
    now: new Date('2026-07-14T23:10:00Z'),
    fetcher: async () => {
      calls += 1;
      return ready('day', '2026-07-13');
    },
  });
  const afterSecond = readCommunityCompetitionCache({ userId: 'user-a', period: 'day' });
  assert.equal(calls, 2);
  assert.equal(afterSecond.refresh.attempts, 2);
  assert.equal(getCommunityCompetitionRefreshDecision({ entry: afterSecond, now: new Date('2026-07-15T00:00:00Z') }).shouldRefresh, false);
});

test('a newly joined member waits for a strictly later eligible close', () => {
  const entry = writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'day',
    data: {
      success: true,
      state: 'waiting_snapshot',
      period: 'day',
      eligibleAfterSnapshotDate: '2026-07-14',
    },
    now: new Date('2026-07-14T21:15:00Z'),
  });
  const sameClose = getCommunityCompetitionRefreshDecision({ entry, now: new Date('2026-07-14T23:10:00Z') });
  const nextClose = getCommunityCompetitionRefreshDecision({ entry, now: new Date('2026-07-15T21:10:00Z') });
  assert.equal(sameClose.shouldRefresh, false);
  assert.equal(sameClose.reason, 'waiting_for_eligible_close');
  assert.equal(new Date(sameClose.nextCheckAt).toISOString(), '2026-07-15T21:10:00.000Z');
  assert.equal(nextClose.shouldRefresh, true);
  assert.equal(nextClose.reason, 'new_refresh_window');
});

test('failed refreshes preserve the last snapshot and count toward the daily limit', async () => {
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-13'),
    now: new Date('2026-07-14T14:00:00Z'),
  });
  await assert.rejects(
    requestCommunityCompetitionRefresh({
      userId: 'user-a', period: 'day', now: new Date('2026-07-14T21:10:00Z'),
      fetcher: async () => { throw new Error('network down'); },
    }),
    /network down/,
  );
  const cached = readCommunityCompetitionCache({ userId: 'user-a', period: 'day' });
  assert.equal(cached.data.asOfDate, '2026-07-13');
  assert.equal(cached.refresh.attempts, 1);
});

test('offline, authentication, and aborted resume failures do not consume a snapshot read', async () => {
  const staleAt = new Date('2026-07-14T14:00:00Z');
  const refreshAt = new Date('2026-07-14T21:10:00Z');
  const initial = writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-13'), now: staleAt,
  });

  const failures = [
    new TypeError('Load failed'),
    Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' }),
    Object.assign(new Error('aborted'), { name: 'AbortError' }),
    Object.assign(new Error('unauthorized'), { status: 401 }),
  ];
  for (const failure of failures) {
    await assert.rejects(requestCommunityCompetitionRefresh({
      userId: 'user-a', period: 'day', now: refreshAt,
      fetcher: async () => { throw failure; },
    }));
    assert.deepEqual(
      readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }).refresh,
      initial.refresh,
    );
  }
  assert.equal(getCommunityCompetitionRefreshDecision({
    entry: readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }),
    now: refreshAt,
  }).reason, 'new_refresh_window');
  assert.equal(shouldRecordCommunityCompetitionRefreshFailure(new Error('server failed')), true);
  assert.equal(shouldRecordCommunityCompetitionRefreshFailure(new TypeError('Load failed')), false);
});

test('a resume event burst shares one failed read and never advances another period', async () => {
  const staleAt = new Date('2026-07-14T14:00:00Z');
  const refreshAt = new Date('2026-07-14T21:10:00Z');
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-13'), now: staleAt,
  });
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'week', data: ready('week', '2026-07-13'), now: staleAt,
  });
  const weekBefore = readCommunityCompetitionCache({ userId: 'user-a', period: 'week' });

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    throw new Error('network down');
  };
  const requests = Array.from({ length: 5 }, () => requestCommunityCompetitionRefresh({
    userId: 'user-a', period: 'day', now: refreshAt, fetcher,
  }));
  const results = await Promise.allSettled(requests);

  assert.equal(results.every((result) => result.status === 'rejected'), true);
  assert.equal(calls, 1);
  const day = readCommunityCompetitionCache({ userId: 'user-a', period: 'day' });
  const week = readCommunityCompetitionCache({ userId: 'user-a', period: 'week' });
  assert.equal(day.data.asOfDate, '2026-07-13');
  assert.equal(day.refresh.attempts, 1);
  assert.equal(getCommunityCompetitionRefreshDecision({ entry: day, now: refreshAt }).reason, 'retry_wait');
  assert.equal(week.data.asOfDate, '2026-07-13');
  assert.deepEqual(week.refresh, weekBefore.refresh);
});

test('older ready responses cannot replace a newer authoritative snapshot', async () => {
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-14'),
    now: new Date('2026-07-14T22:00:00Z'),
  });
  const result = await requestCommunityCompetitionRefresh({
    userId: 'user-a', period: 'day', now: new Date('2026-07-14T23:10:00Z'),
    fetcher: async () => ready('day', '2026-07-13'),
  });
  assert.equal(result.data.asOfDate, '2026-07-14');
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }).data.asOfDate, '2026-07-14');
});

test('concurrent refresh checks share one generation and clearing starts a fresh request', async () => {
  let calls = 0;
  const resolvers = [];
  const fetcher = () => {
    calls += 1;
    return new Promise((resolve) => { resolvers.push(resolve); });
  };
  const first = requestCommunityCompetitionRefresh({ userId: 'user-a', period: 'day', fetcher });
  const second = requestCommunityCompetitionRefresh({ userId: 'user-a', period: 'day', fetcher });
  await Promise.resolve();
  assert.equal(calls, 1);
  clearCommunityCompetitionCache('user-a');
  const fresh = requestCommunityCompetitionRefresh({ userId: 'user-a', period: 'day', fetcher });
  await Promise.resolve();
  assert.equal(calls, 2);
  resolvers[1](ready('day', '2026-07-15'));
  assert.equal((await fresh).data.asOfDate, '2026-07-15');
  resolvers[0](ready('day', '2026-07-14'));
  await assert.rejects(first, { code: 'COMPETITION_CACHE_INVALIDATED' });
  await assert.rejects(second, { code: 'COMPETITION_CACHE_INVALIDATED' });
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }).data.asOfDate, '2026-07-15');
});

test('clearing a user removes every cached competition period', () => {
  ['day', 'week', 'month', 'year'].forEach((period) => {
    writeCommunityCompetitionCache({ userId: 'user-a', period, data: ready(period) });
  });
  clearCommunityCompetitionCache('user-a');
  ['day', 'week', 'month', 'year'].forEach((period) => {
    assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period }), null);
  });
});
