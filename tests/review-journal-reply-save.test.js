import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewJournalWrite, mapReviewJournalRow } from '../src/lib/reviewJournalModel.js';
import { createReviewJournalRepository } from '../src/lib/reviewJournalRepository.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const UUID = '33333333-3333-4333-8333-333333333333';
const IMAGE = { path: `${USER}/${UUID}.jpg`, name: '图.jpg', mimeType: 'image/jpeg', size: 1024 };
const reply = (overrides = {}) => ({ id: 'reply-1', date: '2026-11-07', text: '后来想法',
  createdAt: '2026-11-07T01:00:00.000Z', ...overrides });
const record = (type = 'log') => ({ id: 42, review_revision: 4,
  created_at: '2026-11-06T01:00:00.000Z', updated_at: '2026-11-07T00:00:00.000Z', sort_order: 9,
  ...buildReviewJournalWrite({ type, date: '2026-11-06', text: '最新正文', mood: '冷静', level: '🔺',
    pinned: true, operationId: UUID, stocks: ['NVDA'], images: [IMAGE], market: { ratio: 1.2 },
    replies: [reply({ id: 'old-reply', text: '已有评论' })] }, USER) });

function fixture({ type = 'log', users = [USER], initial = record(type), beforeUpdate, afterUpdate, readResult } = {}) {
  let stored = structuredClone(initial), authCount = 0, updateCount = 0;
  const operations = [], removedImages = [];
  const client = {
    auth: { async getUser() { const id = users[Math.min(authCount++, users.length - 1)];
      return { data: { user: id ? { id } : null }, error: null }; } },
    storage: { from: () => ({ async remove(paths) { removedImages.push(...paths); return { error: null }; } }) },
    from(table) {
      const operation = { table, filters: [], action: 'read' }; operations.push(operation);
      const query = {
        select(value) { operation.select = value; return query; },
        eq(key, value) { operation.filters.push([key, value]); return query; },
        update(value) { operation.action = 'update'; operation.value = structuredClone(value); return query; },
        async maybeSingle() {
          if (operation.action === 'read' && readResult) return readResult(operation, stored);
          if (operation.action === 'update') { updateCount++; beforeUpdate?.({ operation, get: () => stored, set: value => { stored = value; }, updateCount }); }
          const matches = stored && operation.filters.every(([key, value]) => stored[key] === value);
          if (!matches) return { data: null, error: null };
          if (operation.action === 'update') {
            stored = { ...stored, ...operation.value };
            const result = afterUpdate?.({ operation, stored, updateCount });
            if (result) return result;
          }
          return { data: structuredClone(stored), error: null };
        },
      };
      return query;
    },
  };
  return { repository: createReviewJournalRepository(client, { now: () => '2026-11-07T02:00:00.000Z' }),
    operations, removedImages, get: () => stored, authCount: () => authCount,
    input: () => ({ ...mapReviewJournalRow(record(type), type, USER), revision: 0, text: '陈旧正文', replies: [] }) };
}

test('append rebases a stale entry on the current row and preserves every existing metadata field', async () => {
  for (const type of ['log', 'insight']) {
    const initial = record(type);
    initial.text = '  最新原文保持空格  ';
    initial.review_data.futureField = { nested: ['preserve', 0] };
    initial.review_data.replies[0].futureReplyField = { untouched: true };
    const f = fixture({ type, initial });
    const saved = await f.repository.appendReply(f.input(), reply({ images: [IMAGE] }), USER);
    assert.equal(saved.revision, 5); assert.equal(saved.text, initial.text);
    assert.equal(saved.replies.length, 2); assert.equal(saved.replies[1].text, '后来想法');
    assert.deepEqual(saved.replies[1].images, [IMAGE]);
    const { replies: beforeReplies, ...beforeMetadata } = initial.review_data;
    const { replies: afterReplies, ...afterMetadata } = f.get().review_data;
    assert.deepEqual(afterMetadata, beforeMetadata);
    assert.deepEqual(afterReplies[0], beforeReplies[0]);
    assert.equal(f.get().sort_order, 9);
    assert.ok(f.operations.every(operation => operation.table === (type === 'log' ? 'review_logs' : 'disciplines')));
    assert.deepEqual(f.operations[0].filters, [['user_id', USER], ['id', 42]]);
    assert.deepEqual(f.operations[1].filters, [['id', 42], ['user_id', USER], ['review_revision', 4]]);
    assert.deepEqual(Object.keys(f.operations[1].value).sort(), ['review_data', 'review_revision', 'updated_at']);
    assert.equal(f.authCount(), 4);
  }
});

test('a concurrent edit and comment survive a CAS retry that reads the new revision', async () => {
  const f = fixture({ beforeUpdate({ get, set, updateCount }) {
    if (updateCount !== 1) return;
    const row = get(); set({ ...row, text: '并发修改后的正文', review_revision: row.review_revision + 1,
      review_data: { ...row.review_data, newField: 'new', replies: [...row.review_data.replies, reply({ id: 'other-reply', text: '另一窗口的评论' })] } });
  } });
  const saved = await f.repository.appendReply(f.input(), reply(), USER);
  assert.equal(saved.text, '并发修改后的正文'); assert.equal(saved.revision, 6);
  assert.deepEqual(saved.replies.map(item => item.id), ['old-reply', 'other-reply', 'reply-1']);
  assert.equal(f.get().review_data.newField, 'new');
  assert.deepEqual(f.operations.filter(item => item.action === 'update').map(item => item.filters.at(-1)), [['review_revision', 4], ['review_revision', 5]]);
});

test('continuous competing writes stop after two CAS retries', async () => {
  const f = fixture({ beforeUpdate({ get, set }) { const row = get(); set({ ...row, review_revision: row.review_revision + 1 }); } });
  await assert.rejects(f.repository.appendReply(f.input(), reply(), USER), { code: 'REVIEW_REVISION_CONFLICT' });
  assert.equal(f.operations.filter(item => item.action === 'update').length, 3);
  assert.equal(f.get().review_data.replies.length, 1);
});

test('a retry after an unknown successful write recovers the same reply without writing twice', async () => {
  const f = fixture({ afterUpdate() { return { data: null, error: { code: 'NETWORK_ERROR', message: 'response lost' } }; } });
  const incoming = reply({ text: ' 同一评论 ', images: [IMAGE] });
  await assert.rejects(f.repository.appendReply(f.input(), incoming, USER), { code: 'NETWORK_ERROR' });
  const saved = await f.repository.appendReply(f.input(), incoming, USER);
  assert.equal(saved.replies.length, 2); assert.equal(saved.replies[1].text, '同一评论');
  assert.equal(saved.revision, 5);
  assert.equal(f.operations.filter(item => item.action === 'update').length, 1);
});

test('an equivalent concurrent reply is idempotent, while a reused id with different content conflicts', async () => {
  for (const same of [true, false]) {
    const f = fixture({ beforeUpdate({ get, set, updateCount }) {
      if (updateCount !== 1) return;
      const row = get(); set({ ...row, review_revision: row.review_revision + 1,
        review_data: { ...row.review_data, replies: [...row.review_data.replies, reply({ text: same ? '后来想法' : '不同内容' })] } });
    } });
    if (same) assert.equal((await f.repository.appendReply(f.input(), reply(), USER)).replies.length, 2);
    else await assert.rejects(f.repository.appendReply(f.input(), reply(), USER), { code: 'REVIEW_REPLY_CONFLICT' });
    assert.equal(f.operations.filter(item => item.action === 'update').length, 1);
  }
});

test('changed account before read, after read or after write never returns another account result', async () => {
  for (const users of [[OTHER], [USER, OTHER], [USER, USER, OTHER], [USER, USER, USER, OTHER]]) {
    const f = fixture({ users });
    await assert.rejects(f.repository.appendReply(f.input(), reply(), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
    if (users.length < 4) assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
  }
});

test('foreign row ownership and private image ownership fail closed', async () => {
  const foreignRow = fixture({ readResult: () => ({ data: { ...record(), user_id: OTHER }, error: null }) });
  await assert.rejects(foreignRow.repository.appendReply(foreignRow.input(), reply(), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  const foreignImage = { ...IMAGE, path: `${OTHER}/${UUID}.jpg` };
  const incoming = fixture();
  await assert.rejects(incoming.repository.appendReply(incoming.input(), reply({ images: [foreignImage] }), USER), { code: 'REVIEW_INVALID_IMAGE' });
  for (const inReply of [false, true]) {
    const initial = record();
    if (inReply) initial.review_data.replies[0].images = [foreignImage];
    else initial.review_data.images = [foreignImage];
    const existing = fixture({ initial });
    await assert.rejects(existing.repository.appendReply(existing.input(), reply(), USER), { code: 'REVIEW_INVALID_IMAGE' });
    assert.equal(existing.operations.filter(item => item.action === 'update').length, 0);
  }
});

test('invalid identity, revision, missing row and schema do not fall back to stale client content', async () => {
  for (const [overrides, code] of [[{ type: 'unknown' }, 'REVIEW_INVALID_TYPE'], [{ id: null }, 'REVIEW_INVALID_ID'], [{ revision: undefined }, 'REVIEW_REVISION_REQUIRED']]) {
    const f = fixture();
    await assert.rejects(f.repository.appendReply({ ...f.input(), ...overrides }, reply(), USER), { code });
    assert.equal(f.operations.length, 0);
  }
  for (const initial of [null, { ...record(), review_revision: null }, { ...record(), review_data: null }]) {
    const f = fixture({ initial });
    await assert.rejects(f.repository.appendReply(f.input(), reply(), USER), { code: initial ? 'REVIEW_SCHEMA_NOT_CONFIGURED' : 'REVIEW_REVISION_CONFLICT' });
    assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
  }
  const wrongId = fixture({ readResult: () => ({ data: { ...record(), id: 43 }, error: null }) });
  await assert.rejects(wrongId.repository.appendReply(wrongId.input(), reply(), USER), { code: 'REVIEW_REVISION_CONFLICT' });
});

test('reply limits and preserved metadata size remain enforced', async () => {
  const initial = record(); initial.review_data.replies = Array.from({ length: 500 }, (_, index) => reply({ id: `r-${index}` }));
  const full = fixture({ initial });
  await assert.rejects(full.repository.appendReply(full.input(), reply(), USER), { code: 'REVIEW_REPLIES_LIMIT' });
  const huge = record(); huge.review_data.futureField = 'x'.repeat(2 * 1024 * 1024);
  const f = fixture({ initial: huge });
  await assert.rejects(f.repository.appendReply(f.input(), reply(), USER), { code: 'REVIEW_METADATA_LIMIT' });
  assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
});

const originalReply = (row = record(), type = 'log') => mapReviewJournalRow(row, type, USER).replies[0];
const changeReply = (f, mode, original = originalReply(), replacement = { ...original, text: '修改后的评论' }) => mode === 'update'
  ? f.repository.updateReply(f.input(), original, replacement, USER)
  : f.repository.removeReply(f.input(), original, USER);

test('updating one reply rebases on latest entry, preserves immutable identity and unknown snapshot metadata', async () => {
  for (const type of ['log', 'insight']) {
    const initial = record(type);
    initial.text = '  最新正文与空格  ';
    initial.review_data.futureField = { keep: true };
    const target = initial.review_data.replies[0];
    target.images = [IMAGE];
    target.futureReplyField = { nested: [1, 2] };
    target.market = { ratio: 1.1, futureMarketField: { keep: true } };
    target.account = { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report',
      asOfDate: '2026-11-06', recordDate: '2026-11-06', futureAccountField: 'keep',
      items: [{ key: 'leverage', value: 1.2, asOfDate: '2026-11-06', basis: 'close', source: 'pnl_report', futureItemField: true }] };
    target.trades = [{ id: 'trade-1', symbol: 'NVDA', date: '2026-11-06', side: 'buy', price: 200, shares: 2, futureTradeField: true }];
    initial.review_data.replies.push(reply({ id: 'other', text: '另一条评论', futureReplyField: true }));
    const original = originalReply(initial, type);
    const f = fixture({ type, initial });
    const saved = await changeReply(f, 'update', original, { ...original, text: ' 新的判断 ', score: 9,
      id: 'must-not-change', date: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' });
    assert.equal(saved.revision, 5); assert.equal(saved.text, initial.text);
    assert.equal(saved.replies[0].text, '新的判断'); assert.equal(saved.replies[0].score, 9);
    assert.equal(saved.replies[0].id, original.id); assert.equal(saved.replies[0].date, original.date);
    assert.equal(saved.replies[0].createdAt, original.createdAt);
    const expected = structuredClone(initial);
    expected.review_data.replies[0].text = '新的判断'; expected.review_data.replies[0].score = 9;
    expected.review_revision = 5; expected.updated_at = '2026-11-07T02:00:00.000Z';
    assert.deepEqual(f.get(), expected);
    assert.deepEqual(Object.keys(f.operations[1].value).sort(), ['review_data', 'review_revision', 'updated_at']);
    assert.deepEqual(f.operations[1].filters, [['id', 42], ['user_id', USER], ['review_revision', 4]]);
    assert.ok(f.operations.every(item => item.table === (type === 'log' ? 'review_logs' : 'disciplines')));
    assert.deepEqual(f.removedImages, []);
  }
});

test('deleting only the selected reply preserves the current entry and never hard deletes shared images', async () => {
  for (const type of ['log', 'insight']) {
    const initial = record(type);
    initial.review_data.replies[0].images = [IMAGE];
    initial.review_data.futureField = { untouched: true };
    initial.review_data.replies.push(reply({ id: 'other', images: [IMAGE], futureReplyField: true }));
    const f = fixture({ type, initial });
    const saved = await changeReply(f, 'remove', originalReply(initial, type));
    const expected = structuredClone(initial);
    expected.review_data.replies.shift(); expected.review_revision = 5; expected.updated_at = '2026-11-07T02:00:00.000Z';
    assert.deepEqual(f.get(), expected);
    assert.deepEqual(saved.replies.map(item => item.id), ['other']);
    assert.deepEqual(saved.images, [IMAGE]); assert.deepEqual(f.removedImages, []);
  }
});

test('reply updates and deletions retry CAS conflicts without losing concurrent body or other reply edits', async () => {
  for (const mode of ['update', 'remove']) {
    const f = fixture({ beforeUpdate({ get, set, updateCount }) {
      if (updateCount !== 1) return;
      const row = get();
      set({ ...row, text: '并发的新正文', review_revision: row.review_revision + 1,
        review_data: { ...row.review_data, futureField: 'new',
          replies: [...row.review_data.replies, reply({ id: 'other', text: '同时新增的评论', futureField: true })] } });
    } });
    const saved = await changeReply(f, mode);
    assert.equal(saved.text, '并发的新正文'); assert.equal(saved.revision, 6);
    assert.deepEqual(saved.replies.map(item => item.id), mode === 'update' ? ['old-reply', 'other'] : ['other']);
    if (mode === 'update') assert.equal(saved.replies[0].text, '修改后的评论');
    assert.equal(f.get().review_data.replies.at(-1).futureField, true);
    assert.equal(f.get().review_data.futureField, 'new');
    assert.deepEqual(f.operations.filter(item => item.action === 'update').map(item => item.filters.at(-1)), [['review_revision', 4], ['review_revision', 5]]);
  }
});

test('a concurrent change to the same reply conflicts instead of being overwritten or deleted', async () => {
  for (const mode of ['update', 'remove']) {
    const f = fixture({ beforeUpdate({ get, set, updateCount }) {
      if (updateCount !== 1) return;
      const row = get();
      set({ ...row, review_revision: row.review_revision + 1,
        review_data: { ...row.review_data, replies: [{ ...row.review_data.replies[0], text: '另一端修改的评价', score: 6 }] } });
    } });
    await assert.rejects(changeReply(f, mode), { code: 'REVIEW_REPLY_CONFLICT' });
    assert.equal(f.get().review_data.replies[0].text, '另一端修改的评价');
    assert.equal(f.get().review_data.replies[0].score, 6);
    assert.equal(f.operations.filter(item => item.action === 'update').length, 1);
  }
});

test('unknown successful update and delete responses can be retried without a second write', async () => {
  for (const mode of ['update', 'remove']) {
    const f = fixture({ afterUpdate() { return { data: null, error: { code: 'NETWORK_ERROR', message: 'response lost' } }; } });
    await assert.rejects(changeReply(f, mode), { code: 'NETWORK_ERROR' });
    const saved = await changeReply(f, mode);
    assert.equal(saved.revision, 5);
    if (mode === 'update') assert.equal(saved.replies[0].text, '修改后的评论');
    else assert.deepEqual(saved.replies, []);
    assert.equal(f.operations.filter(item => item.action === 'update').length, 1);
  }
});

test('an equivalent concurrent update is idempotent; a deleted reply is not recreated', async () => {
  const equivalent = fixture({ beforeUpdate({ get, set, updateCount }) {
    if (updateCount !== 1) return;
    const row = get();
    set({ ...row, review_revision: row.review_revision + 1,
      review_data: { ...row.review_data, replies: [{ ...row.review_data.replies[0], text: '修改后的评论' }] } });
  } });
  const saved = await changeReply(equivalent, 'update');
  assert.equal(saved.revision, 5); assert.equal(saved.replies[0].text, '修改后的评论');
  assert.equal(equivalent.operations.filter(item => item.action === 'update').length, 1);
  for (const mode of ['update', 'remove']) {
    const initial = record(); initial.review_data.replies = [];
    const f = fixture({ initial });
    if (mode === 'update') await assert.rejects(changeReply(f, mode), { code: 'REVIEW_REPLY_CONFLICT' });
    else assert.deepEqual((await changeReply(f, mode)).replies, []);
    assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
  }
});

test('repeated unrelated revision races stop after two retries for update and delete', async () => {
  for (const mode of ['update', 'remove']) {
    const f = fixture({ beforeUpdate({ get, set }) { const row = get(); set({ ...row, review_revision: row.review_revision + 1 }); } });
    await assert.rejects(changeReply(f, mode), { code: 'REVIEW_REVISION_CONFLICT' });
    assert.equal(f.operations.filter(item => item.action === 'update').length, 3);
    assert.equal(f.get().review_data.replies[0].text, '已有评论');
  }
});

test('reply update and delete verify account ownership before and after reads and writes', async () => {
  for (const mode of ['update', 'remove']) {
    for (const users of [[OTHER], [USER, OTHER], [USER, USER, OTHER], [USER, USER, USER, OTHER]]) {
      const f = fixture({ users });
      await assert.rejects(changeReply(f, mode), { code: 'REVIEW_ACCOUNT_CHANGED' });
      if (users.length < 4) assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
    }
    const foreignRow = fixture({ readResult: () => ({ data: { ...record(), user_id: OTHER }, error: null }) });
    await assert.rejects(changeReply(foreignRow, mode), { code: 'REVIEW_ACCOUNT_CHANGED' });
    assert.equal(foreignRow.operations.filter(item => item.action === 'update').length, 0);
  }
});

test('private images in original, replacement and preserved replies remain owner validated', async () => {
  const foreignImage = { ...IMAGE, path: `${OTHER}/${UUID}.jpg` };
  const incoming = fixture();
  await assert.rejects(changeReply(incoming, 'update', originalReply(), { ...originalReply(), images: [foreignImage] }), { code: 'REVIEW_INVALID_IMAGE' });
  for (const mode of ['update', 'remove']) {
    const badOriginal = fixture();
    await assert.rejects(changeReply(badOriginal, mode, { ...originalReply(), images: [foreignImage] }), { code: 'REVIEW_INVALID_IMAGE' });
    const initial = record(); initial.review_data.replies.push(reply({ id: 'other', images: [foreignImage] }));
    const badExisting = fixture({ initial });
    await assert.rejects(changeReply(badExisting, mode), { code: 'REVIEW_INVALID_IMAGE' });
    assert.equal(badExisting.operations.filter(item => item.action === 'update').length, 0);
    assert.deepEqual(badExisting.removedImages, []);
  }
});

test('invalid reply identities, blank replacements and oversized preserved metadata are rejected', async () => {
  for (const mode of ['update', 'remove']) {
    const f = fixture();
    await assert.rejects(changeReply(f, mode, { ...originalReply(), id: '' }), { code: 'REVIEW_INVALID_REPLY' });
    assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
  }
  const empty = fixture();
  await assert.rejects(changeReply(empty, 'update', originalReply(), { text: '', mood: '  ' }), { code: 'REVIEW_EMPTY_REPLY' });
  const initial = record(); initial.review_data.replies[0].futureField = 'x'.repeat(2 * 1024 * 1024);
  const huge = fixture({ initial });
  await assert.rejects(changeReply(huge, 'update'), { code: 'REVIEW_METADATA_LIMIT' });
  assert.equal(huge.operations.filter(item => item.action === 'update').length, 0);
});

test('legacy stock-only and mood-only replies survive mapping, update and delete', async () => {
  for (const attachment of [{ stocks: ['NVDA'] }, { mood: '冷静' }]) {
    const initial = record();
    initial.review_data.replies = [reply({ id: 'old-reply', text: '', ...attachment })];
    const original = originalReply(initial);
    assert.equal(original.id, 'old-reply'); assert.equal(original.text, '');
    const f = fixture({ initial });
    const edited = await changeReply(f, 'update', original, { ...original, score: 8 });
    assert.equal(edited.replies[0].score, 8);
    for (const [key, value] of Object.entries(attachment)) assert.deepEqual(edited.replies[0][key], value);
    const removed = await f.repository.removeReply(edited, edited.replies[0], USER);
    assert.deepEqual(removed.replies, []);
    const added = await f.repository.appendReply(removed, reply({ text: '', ...attachment }), USER);
    assert.equal(added.replies.length, 1);
    for (const [key, value] of Object.entries(attachment)) assert.deepEqual(added.replies[0][key], value);
  }
});
