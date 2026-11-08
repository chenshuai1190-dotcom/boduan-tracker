import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildReviewJournalWrite, mapReviewJournalRow, isReviewJournalDate,
  reviewJournalImagePathBelongsToUser, validateReviewJournalImageFile,
} from '../src/lib/reviewJournalModel.js';
import { createReviewJournalRepository } from '../src/lib/reviewJournalRepository.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const UUID = '33333333-3333-4333-8333-333333333333';
const IMAGE = Object.freeze({ path: `${USER}/${UUID}.jpg`, name: '图.jpg', mimeType: 'image/jpeg', size: 1024 });
const entry = overrides => ({ type: 'log', date: '2026-11-06', text: '保留自己的判断', mood: '冷静', level: '🟢',
  pinned: false, stocks: [], market: null, images: [], replies: [], revision: 0, operationId: UUID, ...overrides });
function clientFixture({ response, users = [USER], storageError = null } = {}) {
  const operations = []; const storageOperations = []; let authCalls = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: users[Math.min(authCalls++, users.length - 1)] } }, error: null }) },
    from(table) {
      const operation = { table, filters: [] }; operations.push(operation);
      const resolve = () => typeof response === 'function' ? response(operation, operations.length)
        : response ?? { data: operation.action ? { id: 'saved', created_at: '2026-11-06T00:00:00Z', ...operation.value } : null, error: null };
      const query = {
        insert(value) { operation.action = 'insert'; operation.value = value; return query; },
        update(value) { operation.action = 'update'; operation.value = value; return query; },
        delete() { operation.action = 'delete'; return query; },
        eq(key, value) { operation.filters.push([key, value]); return query; },
        select(columns) { operation.select = columns; return query; },
        async single() { return resolve(); },
        async maybeSingle() { return resolve(); },
      };
      return query;
    },
    storage: { from(bucket) { return {
      async upload(path, file, options) { storageOperations.push({ action: 'upload', bucket, path, file, options }); return { error: storageError }; },
      async createSignedUrl(path, seconds) { storageOperations.push({ action: 'sign', bucket, path, seconds }); return { data: { signedUrl: 'https://example.test/private/signed' }, error: storageError }; },
      async remove(paths) { storageOperations.push({ action: 'remove', bucket, paths }); return { error: storageError }; },
    }; } },
  };
  return { client, operations, storageOperations, authCalls: () => authCalls,
    repository: createReviewJournalRepository(client, { now: () => '2026-11-06T01:00:00Z', randomUUID: () => UUID }) };
}

test('legacy notes retain original fields while rich metadata defaults safely', () => {
  const note = mapReviewJournalRow({ id: 23, user_id: USER, text: '原文', level: '🔺', pinned: true,
    sort_order: 7, created_at: '2020-01-02T23:45:00Z' }, 'insight', USER);
  assert.equal(note.id, 23); assert.equal(note.date, '2020-01-02'); assert.equal(note.text, '原文');
  assert.equal(note.level, '🔺'); assert.equal(note.pinned, true); assert.equal(note.sortOrder, 7);
  assert.equal(note.revision, 0); assert.deepEqual(note.stocks, []); assert.deepEqual(note.images, []); assert.deepEqual(note.replies, []);
  const log = mapReviewJournalRow({ id: 'a', user_id: USER, log_date: '2021-12-03', mood: '平静', text: '日志' }, 'log', USER);
  assert.equal(log.date, '2021-12-03'); assert.equal(log.mood, '平静'); assert.equal(log.pinned, false);
  assert.equal(note.visibility, 'private'); assert.equal(log.visibility, 'private');
});

test('visibility defaults private, persists explicit publication and rejects unknown write values', () => {
  for (const type of ['log', 'insight']) {
    assert.equal(buildReviewJournalWrite(entry({ type }), USER).review_data.visibility, 'private');
    const payload = buildReviewJournalWrite(entry({ type, visibility: 'public' }), USER);
    assert.equal(payload.review_data.visibility, 'public');
    assert.equal(mapReviewJournalRow(payload, type, USER).visibility, 'public');
    assert.equal(mapReviewJournalRow({ ...payload, review_data: { visibility: 'friends' } }, type, USER).visibility, 'private');
    for (const visibility of ['friends', '', true, {}]) {
      assert.throws(() => buildReviewJournalWrite(entry({ type, visibility }), USER), { code: 'REVIEW_INVALID_VISIBILITY' });
    }
  }
  const timelineEvent = { version: 1, id: 'high:net_assets:2026-11-06', kind: 'high', metric: 'net_assets', date: '2026-11-06', title: '示例新高' };
  const payload = buildReviewJournalWrite(entry({ visibility: 'public', timelineEvent }), USER);
  assert.equal(payload.review_data.visibility, 'private');
  assert.equal(mapReviewJournalRow({ ...payload, review_data: { ...payload.review_data, visibility: 'public' } }, 'log', USER).visibility, 'private');
});

test('public saves require the public schema before any write, while private saves remain compatible', async () => {
  const missing = clientFixture();
  await assert.rejects(missing.repository.save(entry({ visibility: 'public' }), USER), { code: 'REVIEW_PUBLIC_NOT_CONFIGURED' });
  assert.equal(missing.operations.length, 0);
  await missing.repository.save(entry(), USER);
  assert.equal(missing.operations.filter(operation => operation.action === 'insert').length, 1);

  const valid = clientFixture(); const calls = [];
  valid.client.rpc = async (name, args) => { calls.push({ name, args }); return { data: { posts: [], hasMore: false, nextCursor: null }, error: null }; };
  const saved = await valid.repository.save(entry({ id: 42, revision: 7, visibility: 'public' }), USER);
  assert.equal(saved.visibility, 'public'); assert.equal(saved.revision, 8);
  assert.deepEqual(calls, [{ name: 'fetch_review_public_feed_v2', args: { p_limit: 1, p_before_date: null, p_before: null, p_before_id: null, p_query: '', p_symbol: '', p_expected_user_id: USER } }]);
  assert.deepEqual(valid.operations[0].filters, [['id', 42], ['user_id', USER], ['review_revision', 7]]);
  assert.equal(valid.authCalls(), 3);

  const switched = clientFixture({ users: [USER, OTHER_USER] });
  switched.client.rpc = valid.client.rpc;
  await assert.rejects(switched.repository.save(entry({ visibility: 'public' }), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.equal(switched.operations.length, 0);

  const denied = clientFixture();
  denied.client.rpc = async () => ({ data: null, error: { code: 'PGRST202' } });
  await assert.rejects(denied.repository.save(entry({ visibility: 'public' }), USER), { code: 'REVIEW_PUBLIC_NOT_CONFIGURED' });
  assert.equal(denied.operations.length, 0);
});

test('a public post can be retracted through the same scoped revision write', async () => {
  const f = clientFixture();
  const saved = await f.repository.save(entry({ id: 42, revision: 7, visibility: 'private' }), USER);
  assert.equal(saved.visibility, 'private');
  assert.equal(f.operations[0].value.review_data.visibility, 'private');
  assert.deepEqual(f.operations[0].filters, [['id', 42], ['user_id', USER], ['review_revision', 7]]);
  assert.equal(f.operations.length, 1, 'the database trigger retracts the projection atomically with this write');
});

test('rich note dates and log pins map without replacing legacy authoritative text fields', () => {
  const data = { date: '2024-12-01', pinned: true, mood: '开心', stocks: [' nvda ', 'NVDA'], images: [IMAGE],
    market: { vix: 0, ratio: null }, replies: [{ id: 'r1', date: '2024-12-03', text: '后来补记' }] };
  const note = mapReviewJournalRow({ user_id: USER, text: '原文', level: '❗', pinned: false, review_data: data, review_revision: 3 }, 'insight', USER);
  assert.equal(note.date, '2024-12-01'); assert.equal(note.pinned, false); assert.equal(note.revision, 3); assert.equal(note.mood, '开心');
  assert.deepEqual(note.stocks, ['NVDA']); assert.deepEqual(note.images, [IMAGE]); assert.deepEqual(note.market, { vix: 0, ratio: null });
  const log = mapReviewJournalRow({ user_id: USER, log_date: '2025-01-02', text: '旧正文', mood: '原心情', review_data: data }, 'log', USER);
  assert.equal(log.date, '2025-01-02'); assert.equal(log.pinned, true); assert.equal(log.mood, '原心情');
  assert.equal(log.replies[0].text, '后来补记');
});

test('write metadata is JSON-only, independent of input and does not store preview URLs', () => {
  const input = entry({ type: 'insight', stocks: ['NVDA'], images: [{ ...IMAGE, url: 'blob:preview', signedUrl: 'secret-url' }],
    market: { version: 1, rows: [{ close: 0, previous: null }] },
    replies: [{ id: 'r1', date: '2026-11-06', text: '补记', images: [IMAGE] }], level: '重要' });
  const before = JSON.stringify(input);
  const payload = buildReviewJournalWrite(input, USER);
  assert.equal(JSON.stringify(input), before); assert.equal(payload.level, '🔺'); assert.equal(payload.user_id, USER);
  assert.deepEqual(payload.review_data.images, [IMAGE]); assert.equal(payload.review_data.market.rows[0].close, 0);
  input.market.rows[0].close = 99;
  assert.equal(payload.review_data.market.rows[0].close, 0);
  assert.throws(() => buildReviewJournalWrite(entry({ market: { invalid: NaN } }), USER), { code: 'REVIEW_INVALID_MARKET' });
  assert.throws(() => buildReviewJournalWrite(entry({ market: { fn: () => 1 } }), USER), { code: 'REVIEW_INVALID_MARKET' });
});

test('images reject foreign owners, traversal, invalid formats, huge files and five attachments', () => {
  assert.equal(reviewJournalImagePathBelongsToUser(IMAGE.path, USER), true);
  for (const path of [`${OTHER_USER}/${UUID}.jpg`, `${USER}/../${UUID}.jpg`, `https://site/${IMAGE.path}`, `${USER}/x.svg`]) {
    assert.equal(reviewJournalImagePathBelongsToUser(path, USER), false);
  }
  assert.throws(() => buildReviewJournalWrite(entry({ images: [{ ...IMAGE, path: `${OTHER_USER}/${UUID}.jpg` }] }), USER), { code: 'REVIEW_INVALID_IMAGE' });
  assert.throws(() => buildReviewJournalWrite(entry({ images: Array(5).fill(IMAGE) }), USER), { code: 'REVIEW_IMAGES_LIMIT' });
  assert.throws(() => validateReviewJournalImageFile({ type: 'image/svg+xml', size: 100 }), { code: 'REVIEW_IMAGE_TYPE' });
  assert.throws(() => validateReviewJournalImageFile({ type: 'image/jpeg', size: 10485761 }), { code: 'REVIEW_IMAGE_SIZE' });
  assert.throws(() => validateReviewJournalImageFile({ type: 'image/png', size: 0 }), { code: 'REVIEW_IMAGE_SIZE' });
  assert.equal(validateReviewJournalImageFile({ type: 'image/webp', size: 10485760 }).extension, 'webp');
});

test('validation rejects bad dates and duplicate/empty replies while supporting image-only records', () => {
  assert.equal(isReviewJournalDate('2024-02-29'), true); assert.equal(isReviewJournalDate('2025-02-29'), false);
  assert.throws(() => buildReviewJournalWrite(entry({ date: '2026-02-31' }), USER), { code: 'REVIEW_INVALID_DATE' });
  assert.throws(() => buildReviewJournalWrite(entry({ text: ' ' }), USER), { code: 'REVIEW_EMPTY_ENTRY' });
  assert.equal(buildReviewJournalWrite(entry({ text: '', images: [IMAGE] }), USER).text, '');
  assert.deepEqual(buildReviewJournalWrite(entry({ text: '', stocks: ['NVDA'] }), USER).review_data.stocks, ['NVDA']);
  assert.deepEqual(buildReviewJournalWrite(entry({ text: '', market: { asOfDate: '2026-11-06', vix: 15 } }), USER).review_data.market,
    { asOfDate: '2026-11-06', vix: 15 });
  assert.throws(() => buildReviewJournalWrite(entry({ text: '', market: {} }), USER), { code: 'REVIEW_EMPTY_ENTRY' });
  assert.throws(() => buildReviewJournalWrite(entry({ replies: [{ id: 'r1', date: '2026-11-06', text: '' }] }), USER), { code: 'REVIEW_EMPTY_REPLY' });
  const r = { id: 'r1', date: '2026-11-06', text: '补记' };
  assert.throws(() => buildReviewJournalWrite(entry({ replies: [r, r] }), USER), { code: 'REVIEW_INVALID_REPLY' });
});

test('modern saves perform scoped revision CAS and inserts preserve rich columns', async () => {
  const f = clientFixture();
  const saved = await f.repository.save(entry({ id: 42, revision: 7, pinned: true }), USER);
  assert.equal(saved.type, 'log'); assert.equal(saved.revision, 8); assert.equal(saved.pinned, true);
  assert.deepEqual(f.operations[0].filters, [['id', 42], ['user_id', USER], ['review_revision', 7]]);
  assert.equal(f.operations[0].value.review_revision, 8); assert.equal(f.authCalls(), 2);
  const created = await f.repository.save(entry({ type: 'insight', images: [IMAGE] }), USER);
  assert.equal(created.revision, 0); assert.equal(f.operations[1].table, 'disciplines');
  assert.deepEqual(f.operations[1].filters, [['user_id', USER], ['review_data->>operationId', UUID]]);
  assert.equal(f.operations[2].action, 'insert'); assert.deepEqual(created.images, [IMAGE]);
  assert.equal(created.operationId, UUID);
});

test('stale save/delete and missing schema are explicit failures, never partial fallbacks', async () => {
  const empty = clientFixture({ response: { data: null, error: null } });
  await assert.rejects(empty.repository.save(entry({ id: 'old', revision: 2 }), USER), { code: 'REVIEW_REVISION_CONFLICT' });
  await assert.rejects(empty.repository.remove(entry({ id: 'old', revision: 2 }), USER), { code: 'REVIEW_REVISION_CONFLICT' });
  assert.deepEqual(empty.operations[1].filters, [['id', 'old'], ['user_id', USER], ['review_revision', 2]]);
  const missing = clientFixture({ response: { data: null, error: { code: 'PGRST204', message: 'review_data not in schema cache' } } });
  await assert.rejects(missing.repository.save(entry(), USER), { code: 'REVIEW_SCHEMA_NOT_CONFIGURED' });
  assert.equal(missing.operations.length, 1, 'must not retry with metadata removed');
  await assert.rejects(empty.repository.save(entry({ id: 'old', revision: undefined }), USER), { code: 'REVIEW_REVISION_REQUIRED' });
});

test('mismatched or switched accounts fail without returning another account result', async () => {
  const wrong = clientFixture({ users: [OTHER_USER] });
  await assert.rejects(wrong.repository.save(entry(), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.equal(wrong.operations.length, 0);
  const switched = clientFixture({ users: [USER, OTHER_USER] });
  await assert.rejects(switched.repository.save(entry(), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  const wrongRow = clientFixture({ response: { data: { user_id: OTHER_USER, review_data: {}, review_revision: 0 }, error: null } });
  await assert.rejects(wrongRow.repository.save(entry(), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('private image upload/sign/delete use the authenticated path and short-lived signatures', async () => {
  const f = clientFixture();
  const image = await f.repository.uploadImage({ name: '我的截图.jpg', type: 'image/jpeg', size: 512 }, USER);
  assert.deepEqual(image, { path: IMAGE.path, name: '我的截图.jpg', mimeType: 'image/jpeg', size: 512 });
  assert.deepEqual(f.storageOperations[0].options, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
  assert.equal(f.storageOperations[0].bucket, 'review-journal-images');
  assert.equal(await f.repository.resolveImage(image.path, USER), 'https://example.test/private/signed');
  assert.equal(f.storageOperations[1].seconds, 600);
  await f.repository.removeImage(image.path, USER);
  assert.deepEqual(f.storageOperations[2].paths, [image.path]);
  await assert.rejects(f.repository.resolveImage(`${OTHER_USER}/${UUID}.jpg`, USER), { code: 'REVIEW_INVALID_IMAGE' });
  assert.equal(f.storageOperations.length, 3);
});

test('missing bucket and failed uploads do not report successful metadata', async () => {
  const missing = clientFixture({ storageError: { message: 'Bucket not found' } });
  await assert.rejects(missing.repository.uploadImage({ name: 'a.png', type: 'image/png', size: 2 }, USER), { code: 'REVIEW_STORAGE_NOT_CONFIGURED' });
  const denied = clientFixture({ storageError: { message: 'Permission denied', code: '403' } });
  await assert.rejects(denied.repository.uploadImage({ name: 'a.png', type: 'image/png', size: 2 }, USER), { code: '403' });
});

test('the same new draft is recovered after an uncertain insert without duplicate writes', async () => {
  for (const type of ['insight', 'log']) {
    let persisted = null;
    const f = clientFixture({ response: operation => {
      if (operation.action === 'insert') {
        persisted = { id: 'persisted', created_at: '2026-11-06T00:00:00Z', ...operation.value };
        return { data: null, error: { code: 'NETWORK_ERROR', message: 'connection interrupted' } };
      }
      return { data: persisted, error: null };
    } });
    const draft = entry({ type, images: [IMAGE] });
    await assert.rejects(f.repository.save(draft, USER), { code: 'NETWORK_ERROR' });
    const recovered = await f.repository.save(draft, USER);
    assert.equal(recovered.id, 'persisted'); assert.equal(recovered.operationId, UUID);
    assert.deepEqual(recovered.images, [IMAGE]);
    assert.equal(f.operations.filter(op => op.action === 'insert').length, 1);
    assert.ok(f.operations.every(op => op.table === (type === 'insight' ? 'disciplines' : 'review_logs')));
  }
});

test('concurrent insert uniqueness recovers own operation, but modified drafts do not pretend to save', async () => {
  let persisted = null;
  const f = clientFixture({ response: operation => {
    if (operation.action === 'insert') {
      persisted = { id: 'once', ...operation.value };
      return { data: null, error: { code: '23505', message: 'duplicate operation' } };
    }
    return { data: persisted, error: null };
  } });
  assert.equal((await f.repository.save(entry(), USER)).id, 'once');
  await assert.rejects(f.repository.save(entry({ text: '同一草稿标识，但正文已改' }), USER), { code: 'REVIEW_OPERATION_CONFLICT' });
  assert.equal(f.operations.filter(op => op.action === 'insert').length, 1);
  const missingId = clientFixture();
  await assert.rejects(missingId.repository.save(entry({ operationId: null }), USER), { code: 'REVIEW_OPERATION_REQUIRED' });
  assert.equal(missingId.operations.length, 0);
});

test('migration keeps legacy tables, advances legacy revisions and isolates private storage', () => {
  const sql = readFileSync(new URL('../supabase/review-journal.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists review_data jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /new\.review_revision := old\.review_revision \+ 1/);
  assert.match(sql, /new\.review_revision <> old\.review_revision \+ 1/);
  assert.match(sql, /create unique index if not exists disciplines_review_operation_uidx/);
  assert.match(sql, /create unique index if not exists review_logs_review_operation_uidx/);
  assert.match(sql, /\(user_id, \(review_data ->> 'operationId'\)\)/);
  assert.equal((sql.match(/auth\.uid\(\) = user_id/g) || []).length, 4);
  assert.match(sql, /'review-journal-images', 'review-journal-images', false, 10485760/);
  assert.equal((sql.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g) || []).length, 5);
  assert.equal(/drop table|delete from|truncate|disable row level security/i.test(sql), false);
});
