import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewIdentityLoader } from '../src/lib/reviewIdentityLoader.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const firstPath = `${owner}/33333333-3333-4333-8333-333333333333.png`;
const secondPath = `${owner}/44444444-4444-4444-8444-444444444444.png`;
const origin = 'https://identity-loader.test';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS4sAAAAASUVORK5CYII=';
const previous = () => ({ nickname: '旧昵称', avatarKey: 'fox', avatarPath: firstPath, avatarDataUrl: png });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function fixture(options = {}) {
  const state = {
    owner,
    identity: { nickname: '新昵称', avatar_key: 'blue' },
    path: firstPath,
    profileError: null,
    signError: null,
    downloadError: null,
    downloadValue: png,
    ...options,
  };
  const calls = { auth: 0, queries: [], signatures: [], downloads: [] };
  const client = {
    auth: { async getUser() { calls.auth++; return { data: { user: state.owner ? { id: state.owner } : null }, error: null }; } },
    from(table) {
      const request = { table, columns: '', filters: [] };
      const query = {
        select(columns) { request.columns = columns; return query; },
        eq(key, value) { request.filters.push([key, value]); return query; },
        async maybeSingle() {
          calls.queries.push(request);
          if (request.columns === 'nickname,avatar_key') return { data: state.identity, error: state.profileError };
          return { data: { user_id: owner, avatar_path: state.path }, error: null };
        },
      };
      return query;
    },
    storage: { from(bucket) { return {
      async createSignedUrl(path, seconds) {
        calls.signatures.push({ bucket, path, seconds });
        return { data: state.signError ? null : { signedUrl: `${origin}/storage/v1/object/sign/community-avatars/${path}?token=test-signature` }, error: state.signError };
      },
    }; } },
  };
  const load = createReviewIdentityLoader(client, {
    supabaseUrl: origin,
    async download(url, context) {
      calls.downloads.push({ url, ...context });
      if (state.downloadStarted) state.downloadStarted.resolve();
      if (state.downloadWait) await state.downloadWait;
      if (state.downloadError) throw state.downloadError;
      return state.downloadValue;
    },
  });
  return { state, calls, load };
}

test('same immutable avatar path reuses local image bytes while refreshing nickname and preset metadata', async () => {
  const f = fixture(); const cached = previous();
  assert.deepEqual(await f.load(owner, cached), {
    nickname: '新昵称', avatarKey: 'blue', avatarPath: firstPath, avatarDataUrl: png,
  });
  assert.equal(cached.nickname, '旧昵称');
  assert.equal(f.calls.signatures.length, 0);
  assert.equal(f.calls.downloads.length, 0);
  assert.equal(f.calls.queries.length, 2);
  for (const query of f.calls.queries) {
    assert.equal(query.table, 'community_profiles');
    assert.deepEqual(query.filters, [['user_id', owner]]);
  }
});

test('a new avatar path downloads once and returns image bytes without a signed URL or token', async () => {
  const f = fixture({ path: secondPath });
  const result = await f.load(owner, previous());
  assert.equal(result.avatarPath, secondPath);
  assert.equal(result.avatarDataUrl, png);
  assert.deepEqual(f.calls.signatures, [{ bucket: 'community-avatars', path: secondPath, seconds: 600 }]);
  assert.equal(f.calls.downloads.length, 1);
  assert.equal(f.calls.downloads[0].path, secondPath);
  assert.equal(f.calls.downloads[0].supabaseUrl, origin);
  assert.doesNotMatch(JSON.stringify(result), /token=|test-signature|object\/sign/);
  assert.equal(Object.hasOwn(result, 'avatarUrl'), false);
});

test('same path with missing or invalid image bytes is downloaded again', async () => {
  for (const avatarDataUrl of ['', 'data:image/svg+xml;base64,PHN2Zy8+', 'https://foreign.test/avatar.png']) {
    const f = fixture();
    const result = await f.load(owner, { ...previous(), avatarDataUrl });
    assert.equal(result.avatarDataUrl, png);
    assert.equal(f.calls.signatures.length, 1);
    assert.equal(f.calls.downloads.length, 1);
  }
});

test('confirmed preset selection clears an earlier custom image without signing or downloading', async () => {
  const f = fixture({ path: null });
  assert.deepEqual(await f.load(owner, previous()), {
    nickname: '新昵称', avatarKey: 'blue', avatarPath: null, avatarDataUrl: '',
  });
  assert.equal(f.calls.signatures.length, 0);
  assert.equal(f.calls.downloads.length, 0);
});

test('missing profile remains missing and never manufactures a default identity', async () => {
  const f = fixture({ identity: null });
  assert.equal(await f.load(owner, previous()), null);
  assert.equal(f.calls.signatures.length, 0);
  assert.equal(f.calls.downloads.length, 0);
});

test('another or signed-out account is rejected before profile or image I/O', async () => {
  for (const current of [other, null]) {
    const f = fixture({ owner: current });
    await assert.rejects(f.load(owner, previous()), { code: 'AVATAR_ACCOUNT_CHANGED' });
    assert.equal(f.calls.queries.length, 0);
    assert.equal(f.calls.signatures.length, 0);
    assert.equal(f.calls.downloads.length, 0);
  }
});

test('account switch during avatar download rejects the late result', async () => {
  const started = deferred(), image = deferred();
  const f = fixture({ path: secondPath, downloadStarted: started, downloadWait: image.promise });
  const cached = previous(), pending = f.load(owner, cached);
  await started.promise;
  f.state.owner = other; image.resolve();
  await assert.rejects(pending, { code: 'AVATAR_ACCOUNT_CHANGED' });
  assert.equal(cached.avatarPath, firstPath);
  assert.equal(cached.avatarDataUrl, png);
});

test('metadata, signature, download and image-validation failures do not report a completed identity', async () => {
  const failureCases = [
    { profileError: new Error('profile unavailable') },
    { signError: new Error('signature unavailable') },
    { downloadError: new Error('image unavailable') },
    { downloadValue: 'data:image/png;base64,bm90LWEtcG5n' },
  ];
  for (const failure of failureCases) {
    const f = fixture({ path: secondPath, ...failure });
    const cached = previous(), before = { ...cached };
    await assert.rejects(f.load(owner, cached));
    assert.deepEqual(cached, before);
  }
});
