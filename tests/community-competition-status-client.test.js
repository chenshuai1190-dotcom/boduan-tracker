import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchCommunityCompetitionSnapshotStatus } from '../src/lib/communityCompetitionApi.js';

function supabaseWithToken(token = 'access-token') {
  return { auth: { getSession: async () => ({ data: { session: { access_token: token } }, error: null }) } };
}

test('snapshot status uses the existing authenticated competition endpoint', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), '/api/community-competition?operation=snapshot-status');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer access-token');
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
