import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchCommunityCompetition,
  fetchCommunityCompetitionSnapshotStatus,
  recalculateSelfCommunityCompetition,
} from '../src/lib/communityCompetitionApi.js';

function supabaseWithToken(token = 'access-token') {
  return { auth: { getSession: async () => ({ data: { session: { access_token: token } }, error: null }) } };
}

test('snapshot status uses the existing authenticated competition endpoint', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url), 'https://bottomline.test');
    assert.equal(requestUrl.pathname, '/api/community-competition');
    assert.equal(requestUrl.searchParams.get('operation'), 'snapshot-status');
    assert.match(requestUrl.searchParams.get('__competition_read') || '', /^[a-z0-9]+-[a-z0-9]+$/);
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer access-token');
    assert.equal(options.headers['Cache-Control'], 'no-cache');
    assert.equal(options.headers.Pragma, 'no-cache');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        state: 'snapshot_status',
        channel: 'competition',
        snapshotDate: '2026-07-15',
        version: 'snapshot_20260715_v1',
        completedAt: '2026-07-15T22:04:05Z',
      }),
    };
  };
  try {
    const result = await fetchCommunityCompetitionSnapshotStatus({ supabase: supabaseWithToken() });
    assert.equal(result.version, 'snapshot_20260715_v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('leaderboard GET also bypasses the iOS WebKit response cache', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url), 'https://bottomline.test');
    assert.equal(requestUrl.pathname, '/api/community-competition');
    assert.equal(requestUrl.searchParams.get('period'), 'week');
    assert.ok(requestUrl.searchParams.has('__competition_read'));
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['Cache-Control'], 'no-cache');
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, state: 'waiting_snapshot', period: 'week' }),
    };
  };
  try {
    const result = await fetchCommunityCompetition({
      supabase: supabaseWithToken(),
      period: 'week',
    });
    assert.equal(result.period, 'week');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('self recalculation sends only an authenticated empty POST and accepts a complete publication', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url), 'https://bottomline.test');
    assert.equal(requestUrl.pathname, '/api/community-competition');
    assert.equal(requestUrl.searchParams.get('operation'), 'recalculate-self');
    assert.equal(requestUrl.searchParams.has('__competition_read'), false);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer access-token');
    assert.equal(options.body, '{}');
    for (const forbidden of ['userId', 'trade', 'holding', 'quote', 'price', 'shares', 'symbol']) {
      assert.equal(String(options.body).includes(forbidden), false);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        state: 'recalculated',
        snapshotDate: '2026-07-31',
        version: 'snapshot_20260731_recalculated_v1',
        completedAt: '2026-08-01T04:05:06.123456Z',
      }),
    };
  };
  try {
    const result = await recalculateSelfCommunityCompetition({ supabase: supabaseWithToken() });
    assert.equal(result.state, 'recalculated');
    assert.equal(result.version, 'snapshot_20260731_recalculated_v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('self recalculation accepts null publication only for non-ranked no-op states', async () => {
  const originalFetch = globalThis.fetch;
  let state = 'not_joined';
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      state,
      snapshotDate: null,
      version: null,
      completedAt: null,
    }),
  });
  try {
    assert.equal((await recalculateSelfCommunityCompetition({ supabase: supabaseWithToken() })).state, 'not_joined');
    state = 'waiting_snapshot';
    assert.equal((await recalculateSelfCommunityCompetition({ supabase: supabaseWithToken() })).state, 'waiting_snapshot');
    state = 'recalculated';
    await assert.rejects(
      recalculateSelfCommunityCompetition({ supabase: supabaseWithToken() }),
      /INVALID_COMPETITION_STATE/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a suspended iOS request times out and the next read starts a fresh fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    if (calls === 1) {
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        state: 'snapshot_status',
        channel: 'competition',
        snapshotDate: '2026-07-17',
        version: 'snapshot_20260717_v1',
        completedAt: '2026-07-17T22:04:05Z',
      }),
    };
  };
  try {
    await assert.rejects(
      fetchCommunityCompetitionSnapshotStatus({
        supabase: supabaseWithToken(),
        timeoutMs: 5,
      }),
      (error) => error?.name === 'AbortError' && error?.code === 'COMPETITION_REQUEST_TIMEOUT',
    );
    const result = await fetchCommunityCompetitionSnapshotStatus({
      supabase: supabaseWithToken(),
      timeoutMs: 100,
    });
    assert.equal(calls, 2);
    assert.equal(result.snapshotDate, '2026-07-17');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('snapshot status rejects malformed or user-bearing response shapes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      state: 'snapshot_status',
      channel: 'competition',
      snapshotDate: '2026-07-15',
      version: 'snapshot_20260715_v1',
      completedAt: '2026-07-15T22:04:05Z',
      userId: 'must-not-be-accepted',
    }),
  });
  try {
    await assert.rejects(
      fetchCommunityCompetitionSnapshotStatus({ supabase: supabaseWithToken() }),
      /INVALID_COMPETITION_STATE/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
