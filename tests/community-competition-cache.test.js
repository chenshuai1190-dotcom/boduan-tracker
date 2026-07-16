import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearCommunityCompetitionCache,
  commitCommunityCompetitionCache,
  COMMUNITY_COMPETITION_CACHE_VERSION,
  getCommunityCompetitionCacheGeneration,
  getCommunityCompetitionRefreshDecision,
  getCommunityCompetitionSnapshotStatusDecision,
  invalidateCommunityCompetitionRequests,
  nextCommunityCompetitionPrimaryRefreshAt,
  readCommunityCompetitionCache,
  recordCommunityCompetitionObservedPublication,
  recordCommunityCompetitionStatusCheck,
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
  snapshotVersion: `snapshot_${asOfDate.replaceAll('-', '')}`,
  snapshotUpdatedAt: `${asOfDate}T21:18:00.000Z`,
  leaders: [],
  self: { rank: 1, avatarKey: 'cyber-cyan' },
});

const waiting = (period, snapshotDate, version, completedAt) => ({
  success: true,
  state: 'waiting_snapshot',
  period,
  publishedSnapshotDate: snapshotDate,
  snapshotVersion: version,
  snapshotUpdatedAt: completedAt,
});

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('cache is isolated by user and period and only persists snapshot states', () => {
  writeCommunityCompetitionCache({ userId: 'user-a', period: 'day', data: ready('day') });
  writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'week',
    data: {
      success: true,
      state: 'waiting_snapshot',
      period: 'week',
      publishedSnapshotDate: '2026-07-13',
      snapshotVersion: 'snapshot_20260713',
      snapshotUpdatedAt: '2026-07-13T21:18:00.000Z',
    },
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

test('same-date responses cannot roll a repaired snapshot back across tabs', () => {
  const repaired = {
    ...ready('day', '2026-07-14'),
    snapshotVersion: 'snapshot_20260714_repaired',
    snapshotUpdatedAt: '2026-07-14T23:00:00.000Z',
  };
  writeCommunityCompetitionCache({ userId: 'user-a', period: 'day', data: repaired });
  const stale = {
    ...ready('day', '2026-07-14'),
    snapshotVersion: 'snapshot_20260714_original',
    snapshotUpdatedAt: '2026-07-14T22:00:00.000Z',
  };
  const preserved = writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: stale,
  });
  assert.equal(preserved.data.snapshotVersion, repaired.snapshotVersion);
  assert.equal(
    getCommunityCompetitionSnapshotStatusDecision({
      entry: preserved,
      status: {
        state: 'snapshot_status',
        channel: 'competition',
        snapshotDate: '2026-07-14',
        version: stale.snapshotVersion,
        completedAt: stale.snapshotUpdatedAt,
      },
    }).reason,
    'stale_snapshot_status',
  );
});

test('a globally observed publication makes every older period immediately refreshable', async () => {
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-14'),
  });
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'week', data: ready('week', '2026-07-14'),
  });
  await recordCommunityCompetitionObservedPublication({
    userId: 'user-a',
    publication: {
      snapshotDate: '2026-07-15',
      version: 'snapshot_20260715_v2',
      completedAt: '2026-07-15T22:00:00.123456Z',
    },
  });

  for (const period of ['day', 'week']) {
    const entry = readCommunityCompetitionCache({ userId: 'user-a', period });
    const decision = getCommunityCompetitionRefreshDecision({
      entry,
      now: new Date('2026-07-15T22:01:00Z'),
    });
    assert.equal(decision.shouldRefresh, true);
    assert.equal(decision.reason, 'observed_publication_advanced');
    assert.equal(decision.version, 'snapshot_20260715_v2');
  }
});

test('a newly joined waiting member does not loop on its ineligible publication', async () => {
  writeCommunityCompetitionCache({
    userId: 'user-b',
    period: 'day',
    now: new Date('2026-07-14T22:00:00Z'),
    data: {
      ...waiting('day', '2026-07-14', 'snapshot_20260714_v1', '2026-07-14T22:00:00.100456Z'),
      eligibleAfterSnapshotDate: '2026-07-14',
    },
  });
  const nextWindow = getCommunityCompetitionRefreshDecision({
    entry: readCommunityCompetitionCache({ userId: 'user-b', period: 'day' }),
    now: new Date('2026-07-15T22:01:00Z'),
  });
  assert.equal(nextWindow.shouldRefresh, true);
  assert.equal(nextWindow.reason, 'new_refresh_window');

  writeCommunityCompetitionCache({
    userId: 'user-a',
    period: 'day',
    data: {
      ...waiting('day', '2026-07-14', 'snapshot_20260714_v1', '2026-07-14T22:00:00.100456Z'),
      eligibleAfterSnapshotDate: '2026-07-15',
    },
  });
  await recordCommunityCompetitionObservedPublication({
    userId: 'user-a',
    publication: {
      snapshotDate: '2026-07-15',
      version: 'snapshot_20260715_v1',
      completedAt: '2026-07-15T22:00:00.200456Z',
    },
  });
  const ineligible = getCommunityCompetitionRefreshDecision({
    entry: readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }),
    now: new Date('2026-07-15T22:01:00Z'),
  });
  assert.equal(ineligible.shouldRefresh, false);
  assert.equal(ineligible.reason, 'waiting_for_eligible_close');

  recordCommunityCompetitionStatusCheck({
    userId: 'user-a', period: 'day', now: new Date('2026-07-16T22:01:00Z'),
  });
  const coolingDown = getCommunityCompetitionRefreshDecision({
    entry: readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }),
    now: new Date('2026-07-16T22:01:30Z'),
  });
  assert.equal(coolingDown.shouldRefresh, false);
  assert.equal(coolingDown.reason, 'status_poll_wait');

  const statusDue = getCommunityCompetitionRefreshDecision({
    entry: readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }),
    now: new Date('2026-07-16T22:02:00Z'),
  });
  assert.equal(statusDue.shouldRefresh, true);
  assert.equal(statusDue.reason, 'status_poll_due');
});

test('cache commits are monotonic across ready and waiting states', async () => {
  const generation = getCommunityCompetitionCacheGeneration('user-a');
  const repaired = {
    ...ready('day', '2026-07-14'),
    snapshotVersion: 'snapshot_20260714_v2',
    snapshotUpdatedAt: '2026-07-14T22:00:00.200456Z',
  };
  assert.equal((await commitCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: repaired, expectedGeneration: generation,
  })).accepted, true);

  const old = {
    ...ready('day', '2026-07-14'),
    snapshotVersion: 'snapshot_20260714_v1',
    snapshotUpdatedAt: '2026-07-14T22:00:00.100456Z',
  };
  const rolledBack = await commitCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: old, expectedGeneration: generation,
  });
  assert.equal(rolledBack.accepted, false);
  assert.equal(rolledBack.entry.data.snapshotVersion, repaired.snapshotVersion);

  const sameMarkerWaiting = waiting(
    'day', repaired.asOfDate, repaired.snapshotVersion, repaired.snapshotUpdatedAt,
  );
  assert.equal((await commitCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: sameMarkerWaiting, expectedGeneration: generation,
  })).entry.data.state, 'ready');

  const nextMarkerWaiting = waiting(
    'day', '2026-07-15', 'snapshot_20260715_v1', '2026-07-15T22:00:00.300456Z',
  );
  const excluded = await commitCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: nextMarkerWaiting, expectedGeneration: generation,
  });
  assert.equal(excluded.accepted, true);
  assert.equal(excluded.entry.data.state, 'waiting_snapshot');
  assert.equal(excluded.entry.data.publishedSnapshotDate, '2026-07-15');
});

test('a cross-tab invalidation token rejects a response started before cache clear', async () => {
  const staleGeneration = getCommunityCompetitionCacheGeneration('user-a');
  await clearCommunityCompetitionCache('user-a');
  const result = await commitCommunityCompetitionCache({
    userId: 'user-a',
    period: 'day',
    data: ready('day', '2026-07-15'),
    expectedGeneration: staleGeneration,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'invalidated');
  assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }), null);
});

test('two tabs observing the same publication do not invalidate each other persistently', async () => {
  const generation = getCommunityCompetitionCacheGeneration('user-a');
  invalidateCommunityCompetitionRequests('user-a');
  invalidateCommunityCompetitionRequests('user-a');
  const next = {
    ...ready('day', '2026-07-15'),
    snapshotVersion: 'snapshot_20260715_v2',
    snapshotUpdatedAt: '2026-07-15T22:00:00.400456Z',
  };
  const results = await Promise.all([
    commitCommunityCompetitionCache({
      userId: 'user-a', period: 'day', data: next, expectedGeneration: generation,
    }),
    commitCommunityCompetitionCache({
      userId: 'user-a', period: 'day', data: next, expectedGeneration: generation,
    }),
  ]);
  assert.equal(results.some((result) => result.accepted), true);
  assert.equal(
    readCommunityCompetitionCache({ userId: 'user-a', period: 'day' }).data.snapshotVersion,
    next.snapshotVersion,
  );
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
  await clearCommunityCompetitionCache('user-a');
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

test('clearing a user removes every cached competition period', async () => {
  ['day', 'week', 'month', 'year'].forEach((period) => {
    writeCommunityCompetitionCache({ userId: 'user-a', period, data: ready(period) });
  });
  await clearCommunityCompetitionCache('user-a');
  ['day', 'week', 'month', 'year'].forEach((period) => {
    assert.equal(readCommunityCompetitionCache({ userId: 'user-a', period }), null);
  });
});

test('completion status refreshes only for a newer date or changed opaque version', () => {
  const entry = writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-15'),
  });
  const baseStatus = {
    success: true,
    state: 'snapshot_status',
    channel: 'competition',
    snapshotDate: '2026-07-15',
    version: entry.data.snapshotVersion,
    completedAt: '2026-07-15T22:04:05Z',
  };
  assert.equal(getCommunityCompetitionSnapshotStatusDecision({ entry, status: baseStatus }).shouldRefresh, false);
  assert.equal(getCommunityCompetitionSnapshotStatusDecision({
    entry,
    status: { ...baseStatus, snapshotDate: '2026-07-16', version: 'snapshot_20260716_v1' },
  }).reason, 'new_snapshot_date');
  assert.equal(getCommunityCompetitionSnapshotStatusDecision({
    entry,
    status: { ...baseStatus, version: 'snapshot_20260715_repair' },
  }).reason, 'snapshot_republished');
});

test('lightweight status checks poll globally across cached periods without consuming full-refresh attempts', () => {
  const entry = writeCommunityCompetitionCache({
    userId: 'user-a', period: 'day', data: ready('day', '2026-07-13'),
    now: new Date('2026-07-14T14:00:00Z'),
  });
  writeCommunityCompetitionCache({
    userId: 'user-a', period: 'week', data: ready('week', '2026-07-13'),
    now: new Date('2026-07-14T14:00:00Z'),
  });
  const fullRefreshAttempts = entry.refresh.attempts;
  const checked = recordCommunityCompetitionStatusCheck({
    userId: 'user-a', period: 'day', now: new Date('2026-07-14T21:10:00Z'),
  });
  const checkedWeek = readCommunityCompetitionCache({ userId: 'user-a', period: 'week' });
  assert.equal(checked.refresh.attempts, fullRefreshAttempts);
  assert.deepEqual(checkedWeek.statusCheck, checked.statusCheck);
  const wait = getCommunityCompetitionRefreshDecision({
    entry: checked, now: new Date('2026-07-14T21:10:30Z'),
  });
  const due = getCommunityCompetitionRefreshDecision({
    entry: checked, now: new Date('2026-07-14T21:11:00Z'),
  });
  assert.equal(wait.reason, 'status_poll_wait');
  assert.equal(due.reason, 'status_poll_due');
  assert.equal(due.shouldRefresh, true);
  assert.equal(getCommunityCompetitionRefreshDecision({
    entry: checkedWeek, now: new Date('2026-07-14T21:10:30Z'),
  }).reason, 'status_poll_wait');
});
