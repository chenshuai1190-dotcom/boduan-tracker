import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompetitionLeaderboard } from '../server/communityCompetitionModel.js';
import { attachCompetitionAvatars, COMPETITION_AVATAR_URL_SECONDS } from '../server/communityCompetitionAvatars.js';
import { createPnlShareIdentity, loadPnlShareAvatarImage, pnlShareAvatarSource } from '../src/lib/pnlShareIdentity.js';
import { getCommunityCompetitionSnapshotStatusDecision, COMMUNITY_COMPETITION_CACHE_VERSION } from '../src/lib/communityCompetitionCache.js';

const owners = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'];
const object = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp';
const supabaseUrl = 'https://avatar.test';
const path = `${owners[0]}/${object}`;
const signedUrl = `${supabaseUrl}/storage/v1/object/sign/community-avatars/${path}?token=short-lived`;
const now = Date.parse('2026-11-06T10:00:00Z');

function leaderboardFixture() {
  const visibleOwners = new Map();
  const board = buildCompetitionLeaderboard({
    members: owners.map(user_id => ({ user_id, status: 'active', ranking_start_snapshot_date: '2026-11-05', ranking_baseline_return_pct: 0 })),
    profiles: owners.map((user_id, index) => ({ user_id, nickname: `Member ${index}`, avatar_key: 'gold', profile_completed_at: '2026-11-01T00:00Z' })),
    snapshots: owners.map((user_id, index) => ({ user_id, snapshot_date: '2026-11-05', daily_return_pct: [0.2, 0.3, 0.1][index], cumulative_return_pct: [0.2, 0.3, 0.1][index], locked_at: '2026-11-05T22:00Z' })),
    benchmarkRows: [{ date: '2026-11-04', close: 100 }, { date: '2026-11-05', close: 101 }],
    period: 'day', asOfDate: '2026-11-05', selfUserId: owners[0], leadersLimit: 1,
    onVisibleEntry: (entry, owner) => visibleOwners.set(entry, owner),
  });
  return { board, visibleOwners };
}

test('competition signs only already returned ranked rows and self, not all profiles', async () => {
  const { board, visibleOwners } = leaderboardFixture();
  assert.deepEqual([...visibleOwners.values()], [owners[1], owners[0]]);
  const calls = [];
  const output = await attachCompetitionAvatars({ ...board, visibleOwners, supabaseUrl, now,
    readProfiles: async ids => {
      calls.push(ids);
      return owners.map(user_id => ({ user_id, avatar_path: `${user_id}/${object}` }));
    },
    signPaths: async (paths, expiresIn) => {
      calls.push(paths); assert.equal(expiresIn, 600);
      return paths.map(path => ({ path, signedURL: `/object/sign/community-avatars/${path}?token=short-lived` }));
    },
  });
  assert.deepEqual(calls[0], [owners[1], owners[0]]);
  assert.equal(calls[1].length, 2);
  assert.equal(calls[1].some(value => value.startsWith(owners[2])), false);
  assert.equal(output.leaders[0].returnPct, board.leaders[0].returnPct);
  assert.equal(output.self.avatarUrl, signedUrl);
  assert.equal(output.self.avatarExpiresAt, new Date(now + COMPETITION_AVATAR_URL_SECONDS * 1000).toISOString());
  assert.equal('avatarPath' in output.self, false);
  assert.equal('userId' in output.self, false);
  assert.equal('avatarUrl' in board.self, false, 'do not mutate calculated leaderboard');
});

test('cross-owner avatar paths, foreign signatures and signing errors retain preset fallback', async () => {
  const { board, visibleOwners } = leaderboardFixture();
  let signed = 0;
  let result = await attachCompetitionAvatars({ ...board, visibleOwners, supabaseUrl, now,
    readProfiles: async () => [{ user_id: owners[0], avatar_path: `${owners[2]}/${object}` }],
    signPaths: async () => { signed++; return []; },
  });
  assert.equal(signed, 0);
  assert.equal(result.self, board.self);
  for (const signPaths of [async () => { throw new Error('unavailable'); }, async () => [{ path, signedURL: `https://evil.test/${path}?token=fake` }]]) {
    result = await attachCompetitionAvatars({ ...board, visibleOwners, supabaseUrl, now,
      readProfiles: async () => [{ user_id: owners[0], avatar_path: path }], signPaths,
    });
    assert.equal(result.self.avatarKey, 'gold');
    assert.equal(result.self.avatarUrl, undefined);
  }
  const none = await attachCompetitionAvatars({ leaders: [], visibleOwners: new Map(),
    readProfiles: () => { throw new Error('must not enumerate profiles'); } });
  assert.deepEqual(none, { leaders: [], self: null });
});

test('share identity keeps only owner-path signed image URLs from the configured bucket origin', () => {
  const identity = createPnlShareIdentity({ nickname: '测试用户', avatarKey: 'gold', avatarPath: path, avatarUrl: signedUrl }, { supabaseUrl });
  assert.equal(identity.avatarUrl, signedUrl);
  assert.equal(pnlShareAvatarSource(identity, { supabaseUrl }), signedUrl);
  for (const avatarUrl of [signedUrl.replace('avatar.test', 'evil.test'), signedUrl.replace('/sign/', '/public/'), signedUrl.replace(`/${path}`, `/other/${object}`), signedUrl.split('?')[0]]) {
    const rejected = createPnlShareIdentity({ nickname: '测试用户', avatarKey: 'gold', avatarPath: path, avatarUrl }, { supabaseUrl });
    assert.deepEqual(rejected, { nickname: '测试用户', avatarKey: 'gold' });
  }
});

test('custom avatars load with CORS before src and preserve crop; failed image falls back for canvas export', async () => {
  const sources = [];
  class ImageSuccess {
    set src(value) { sources.push([value, this.crossOrigin]); queueMicrotask(() => this.onload?.()); }
  }
  const identity = { avatarKey: 'gold', avatarPath: path, avatarUrl: signedUrl };
  const custom = await loadPnlShareAvatarImage(identity, { ImageCtor: ImageSuccess, supabaseUrl });
  assert.deepEqual(sources[0], [signedUrl, 'anonymous']);
  assert.equal(custom.pnlShareCropScale, 1);
  class ImageFailure {
    set src(value) { sources.push([value, this.crossOrigin]); queueMicrotask(() => value.startsWith('https:') ? this.onerror?.() : this.onload?.()); }
  }
  const fallback = await loadPnlShareAvatarImage(identity, { ImageCtor: ImageFailure, supabaseUrl });
  assert.equal(fallback.pnlShareCropScale, 1.15);
  assert.equal(sources.at(-1)[0], '/community-avatars/avatar-human-gold.jpg');
});

test('signed avatar expiry refreshes authorized cached ranks without requiring a new return publication', () => {
  const publication = { snapshotDate: '2026-11-05', version: 'abcdefghijklmnop', completedAt: '2026-11-05T22:00:00Z' };
  const status = { ...publication, state: 'snapshot_status', channel: 'competition' };
  const entry = { version: COMMUNITY_COMPETITION_CACHE_VERSION, period: 'day', savedAt: now,
    data: { state: 'ready', period: 'day', asOfDate: publication.snapshotDate, snapshotVersion: publication.version,
      snapshotUpdatedAt: publication.completedAt, self: { avatarUrl: signedUrl, avatarExpiresAt: new Date(now + 600000).toISOString() } } };
  assert.equal(getCommunityCompetitionSnapshotStatusDecision({ entry, status, now }).shouldRefresh, false);
  const decision = getCommunityCompetitionSnapshotStatusDecision({ entry, status, now: now + 541000 });
  assert.equal(decision.shouldRefresh, true);
  assert.equal(decision.reason, 'avatar_signature_expiring');
  assert.equal(decision.version, publication.version);
  const oldStatus = { ...status, version: 'oldpublicationxx', completedAt: '2026-11-05T21:00:00Z' };
  assert.equal(getCommunityCompetitionSnapshotStatusDecision({ entry, status: oldStatus, now: now + 700000 }).shouldRefresh, false, 'avatar expiry cannot bypass publication ordering');
});
