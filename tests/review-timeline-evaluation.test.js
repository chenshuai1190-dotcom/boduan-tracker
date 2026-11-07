import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildReviewJournalWrite, mapReviewJournalRow } from '../src/lib/reviewJournalModel.js';
import { createReviewJournalRepository } from '../src/lib/reviewJournalRepository.js';
import { reviewJournalFeed, restoreReviewDraft } from '../src/lib/reviewJournalFeed.js';
import { normalizeReviewTimelineReference, reviewTimelineOperationId } from '../src/lib/reviewTimelineReference.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const IMAGE_ID = '33333333-3333-4333-8333-333333333333';
const digest = bytes => createHash('sha256').update(bytes).digest();
const event = (overrides = {}) => ({ version: 1, id: 'drawdown:net_assets:2026-10-06', kind: 'drawdown',
  metric: 'net_assets', date: '2026-10-06', title: '净资产从前高回撤 10%', ...overrides });
const entry = (overrides = {}) => ({ type: 'log', date: '2026-10-06', text: '净资产从前高回撤 10%',
  revision: 0, timelineEvent: event(), replies: [], ...overrides });
const reply = (overrides = {}) => ({ id: 'reply-1', date: '2026-11-07', text: '应该更早控制杠杆',
  score: 6, tags: ['买入过急'], createdAt: '2026-11-07T01:00:00.000Z', ...overrides });

function fixture({ initial = [], afterInsert, beforeUpdate, readResult } = {}) {
  const rows = structuredClone(initial), operations = [];
  let nextId = 1, updateCount = 0;
  const value = (row, key) => key === 'review_data->>operationId' ? row.review_data?.operationId : row[key];
  function repository(userId = USER, users = [userId]) {
    let authCount = 0;
    const client = {
      auth: { async getUser() {
        const id = users[Math.min(authCount++, users.length - 1)];
        return { data: { user: id ? { id } : null }, error: null };
      } },
      from(table) {
        const operation = { table, action: 'read', filters: [] }; operations.push(operation);
        const query = {
          select() { return query; },
          eq(key, item) { operation.filters.push([key, item]); return query; },
          insert(payload) { operation.action = 'insert'; operation.payload = structuredClone(payload); return query; },
          update(payload) { operation.action = 'update'; operation.payload = structuredClone(payload); return query; },
          async maybeSingle() {
            if (operation.action === 'read' && readResult) {
              const result = readResult({ operation, rows });
              if (result) return result;
            }
            if (operation.action === 'update') beforeUpdate?.({ operation, rows, updateCount: ++updateCount });
            const found = rows.find(row => operation.filters.every(([key, item]) => value(row, key) === item));
            if (!found) return { data: null, error: null };
            if (operation.action === 'update') Object.assign(found, operation.payload);
            return { data: structuredClone(found), error: null };
          },
          async single() {
            const payload = operation.payload;
            if (rows.some(row => row.user_id === payload.user_id && row.review_data.operationId === payload.review_data.operationId)) {
              return { data: null, error: { code: '23505', message: 'duplicate operation' } };
            }
            const row = { id: nextId++, created_at: '2026-11-07T01:00:00.000Z', ...payload };
            rows.push(row);
            const result = afterInsert?.({ operation, row, rows });
            return result || { data: structuredClone(row), error: null };
          },
        };
        return query;
      },
    };
    return createReviewJournalRepository(client, { timelineDigest: digest, now: () => '2026-11-07T02:00:00.000Z' });
  }
  return { rows, operations, repository };
}

test('timeline references validate the contract and round trip only valid log metadata', () => {
  const reference = event();
  const payload = buildReviewJournalWrite(entry(), USER);
  assert.deepEqual(payload.review_data.timelineEvent, reference);
  const mapped = mapReviewJournalRow({ ...payload, id: 1, review_revision: 0 }, 'log', USER);
  assert.deepEqual(mapped.timelineEvent, reference);
  assert.deepEqual(buildReviewJournalWrite(mapped, USER).review_data.timelineEvent, reference);
  for (const invalid of [event({ version: 2 }), event({ id: 'foreign/path' }), event({ id: 'a'.repeat(161) }),
    event({ kind: 'unknown' }), event({ metric: 'cash' }), event({ date: '2026-02-30' }),
    event({ title: '' }), event({ title: 'x\ny' }), []]) {
    assert.equal(normalizeReviewTimelineReference(invalid), null);
    assert.throws(() => buildReviewJournalWrite(entry({ timelineEvent: invalid }), USER), { code: 'REVIEW_INVALID_TIMELINE' });
    assert.equal(mapReviewJournalRow({ ...payload, review_data: { ...payload.review_data, timelineEvent: invalid } }, 'log', USER).timelineEvent, undefined);
  }
  assert.throws(() => buildReviewJournalWrite(entry({ type: 'insight' }), USER), { code: 'REVIEW_INVALID_TIMELINE' });
  assert.throws(() => buildReviewJournalWrite(entry({ date: '2026-11-07' }), USER), { code: 'REVIEW_INVALID_TIMELINE' });
});

test('stable operation ids include owner and event, and can use native Web Crypto', async () => {
  const one = await reviewTimelineOperationId(USER, event().id, { digest });
  assert.match(one, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(await reviewTimelineOperationId(USER, event().id, { digest }), one);
  assert.notEqual(await reviewTimelineOperationId(OTHER, event().id, { digest }), one);
  assert.notEqual(await reviewTimelineOperationId(USER, 'high:net_assets:2026-10-06', { digest }), one);
  assert.equal(await reviewTimelineOperationId(USER, event().id), one);
  await assert.rejects(reviewTimelineOperationId('', event().id, { digest }), { code: 'REVIEW_INVALID_TIMELINE' });
  await assert.rejects(reviewTimelineOperationId(USER, event().id, { digest: () => new Uint8Array(4) }), { code: 'REVIEW_TIMELINE_ID_UNAVAILABLE' });
});

test('first evaluation atomically creates one container and no ordinary feed item', async () => {
  const f = fixture(), repo = f.repository();
  assert.equal(f.operations.length, 0);
  const saved = await repo.appendTimelineReply(entry(), reply(), USER);
  assert.equal(saved.id, 1); assert.equal(saved.revision, 0); assert.equal(saved.replies.length, 1);
  assert.deepEqual(saved.timelineEvent, event());
  assert.equal(saved.date, event().date); assert.equal(saved.text, event().title);
  assert.equal(f.rows.length, 1);
  const inserts = f.operations.filter(item => item.action === 'insert');
  assert.equal(inserts.length, 1); assert.equal(inserts[0].payload.review_data.replies.length, 1);
  assert.ok(f.operations.every(item => item.table === 'review_logs'));
  assert.deepEqual(reviewJournalFeed([], [saved]), []);
  assert.deepEqual(reviewJournalFeed([], [saved], 'log'), []);
  const ordinary = { id: 2, date: '2026-10-06', text: '普通博文', type: 'log' };
  assert.deepEqual(reviewJournalFeed([], [saved, ordinary]).map(item => item.id), [2]);
  assert.equal(restoreReviewDraft({ ...saved }, USER).timelineEvent, undefined);
});

test('return drawdown evaluations retain their own stable container independently of net-asset drawdowns', async () => {
  const f = fixture(), repo = f.repository();
  const reference = event({ id: 'drawdown:cumulative_return:2026-10-06', metric: 'cumulative_return', title: '收益率回落' });
  const returns = entry({ text: reference.title, timelineEvent: reference });
  const assetSaved = await repo.appendTimelineReply(entry(), reply(), USER);
  const saved = await repo.appendTimelineReply(returns, reply(), USER);
  const retried = await repo.appendTimelineReply(returns, reply(), USER);
  assert.notEqual(saved.id, assetSaved.id);
  assert.notEqual(saved.operationId, assetSaved.operationId);
  assert.equal(saved.id, retried.id);
  assert.equal(retried.replies.length, 1);
  assert.deepEqual(saved.timelineEvent, reference);
  assert.equal(saved.date, reference.date);
  assert.equal(f.rows.length, 2);
  assert.deepEqual(reviewJournalFeed([], [assetSaved, saved]), []);
  const edited = await repo.updateReply(saved, saved.replies[0], { ...saved.replies[0], text: '收益率从年内高点回落', score: 4 }, USER);
  assert.deepEqual(edited.timelineEvent, reference);
  assert.equal(edited.replies[0].score, 4);
});

test('same-event submissions merge, retry idempotently and never overwrite the original event title', async () => {
  const f = fixture(), repo = f.repository();
  const first = await repo.appendTimelineReply(entry(), reply(), USER);
  f.rows[0].review_data.futureField = { preserve: true };
  const changedLabel = entry({ date: '2026-11-07', text: '最新事件标题', timelineEvent: event({ title: '回撤已扩大至 20%' }) });
  const second = await repo.appendTimelineReply(changedLabel, reply({ id: 'reply-2', text: '后续补充' }), USER);
  const repeated = await repo.appendTimelineReply(entry(), reply(), USER);
  assert.equal(second.id, first.id); assert.equal(f.rows.length, 1);
  assert.equal(second.replies.length, 2); assert.equal(repeated.revision, second.revision);
  assert.equal(second.text, event().title); assert.deepEqual(second.timelineEvent, event());
  assert.equal(second.date, event().date); assert.deepEqual(f.rows[0].review_data.futureField, { preserve: true });
  assert.equal(f.operations.filter(item => item.action === 'update').length, 1);
  await assert.rejects(repo.appendTimelineReply(entry(), reply({ text: '同 id 不同内容' }), USER), { code: 'REVIEW_REPLY_CONFLICT' });
  assert.equal(f.rows[0].review_data.replies.length, 2);
});

test('annual high and low evaluations round trip separately and retry without ordinary feed duplicates', async () => {
  const f = fixture(), repo = f.repository(), saved = [];
  for (const metric of ['annual_return', 'annual_pnl']) {
    for (const kind of ['high', 'low']) {
      const reference = event({ id: `${kind}:${metric}:2026-10-06`, kind, metric,
        title: `年内${metric === 'annual_return' ? '收益率' : '收益金额'}${kind === 'high' ? '新高' : '新低'}` });
      const source = entry({ text: reference.title, timelineEvent: reference });
      const one = await repo.appendTimelineReply(source, reply(), USER);
      const retried = await repo.appendTimelineReply(source, reply(), USER);
      assert.equal(one.id, retried.id);
      assert.equal(retried.replies.length, 1);
      assert.deepEqual(one.timelineEvent, reference);
      const payload = buildReviewJournalWrite(one, USER);
      assert.deepEqual(mapReviewJournalRow(payload, 'log', USER).timelineEvent, reference);
      saved.push(one);
    }
  }
  assert.equal(new Set(saved.map(value => value.operationId)).size, 4);
  assert.equal(f.rows.length, 4);
  assert.deepEqual(reviewJournalFeed([], saved), []);
});

test('simultaneous first submissions converge on one container and preserve both evaluations', async () => {
  const f = fixture(), a = f.repository(), b = f.repository();
  const results = await Promise.all([
    a.appendTimelineReply(entry(), reply({ id: 'a' }), USER),
    b.appendTimelineReply(entry(), reply({ id: 'b' }), USER),
  ]);
  assert.equal(f.rows.length, 1); assert.equal(results[0].id, results[1].id);
  assert.deepEqual(f.rows[0].review_data.replies.map(item => item.id).sort(), ['a', 'b']);
  assert.equal(f.operations.filter(item => item.action === 'insert').length, 2);
});

test('simultaneous duplicate evaluations save once, while a conflicting reused id fails', async () => {
  for (const conflicting of [false, true]) {
    const f = fixture();
    const results = await Promise.allSettled([
      f.repository().appendTimelineReply(entry(), reply(), USER),
      f.repository().appendTimelineReply(entry(), reply({ text: conflicting ? '不同内容' : reply().text }), USER),
    ]);
    assert.equal(f.rows.length, 1); assert.equal(f.rows[0].review_data.replies.length, 1);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, conflicting ? 1 : 2);
    if (conflicting) assert.equal(results.find(result => result.status === 'rejected').reason.code, 'REVIEW_REPLY_CONFLICT');
  }
});

test('lost insert responses, including thrown transport errors, recover without duplicate writes', async () => {
  for (const thrown of [false, true]) {
    const f = fixture({ afterInsert() {
      const error = Object.assign(new Error('response lost'), { code: 'NETWORK_ERROR' });
      if (thrown) throw error;
      return { data: null, error };
    } });
    const repo = f.repository();
    const saved = await repo.appendTimelineReply(entry(), reply(), USER);
    const retried = await repo.appendTimelineReply(entry(), reply(), USER);
    assert.equal(saved.id, retried.id); assert.equal(f.rows.length, 1); assert.equal(retried.replies.length, 1);
    assert.equal(f.operations.filter(item => item.action === 'insert').length, 1);
    assert.equal(f.operations.filter(item => item.action === 'update').length, 0);
  }
});

test('concurrent existing-container replies retry CAS without dropping another evaluation', async () => {
  const f = fixture({ beforeUpdate({ rows, updateCount }) {
    if (updateCount !== 1) return;
    rows[0].review_revision++;
    rows[0].review_data.replies.push(reply({ id: 'competitor', text: '同时写入' }));
  } });
  const repo = f.repository();
  await repo.appendTimelineReply(entry(), reply(), USER);
  const saved = await repo.appendTimelineReply(entry(), reply({ id: 'second', text: '第二条' }), USER);
  assert.deepEqual(saved.replies.map(item => item.id), ['reply-1', 'competitor', 'second']);
  assert.equal(saved.revision, 2); assert.equal(f.operations.filter(item => item.action === 'update').length, 2);
});

test('editing and deleting evaluations preserve event references and do not delete the container', async () => {
  const f = fixture(), repo = f.repository();
  const saved = await repo.appendTimelineReply(entry(), reply(), USER);
  f.rows[0].review_data.futureField = 'preserved';
  const edited = await repo.updateReply(saved, saved.replies[0], { ...saved.replies[0], text: '调整后的评价', score: 8 }, USER);
  assert.deepEqual(edited.timelineEvent, event()); assert.equal(edited.replies[0].score, 8);
  const removed = await repo.removeReply(edited, edited.replies[0], USER);
  assert.equal(removed.replies.length, 0); assert.deepEqual(removed.timelineEvent, event());
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].review_data.futureField, 'preserved');
  assert.deepEqual(reviewJournalFeed([], [removed]), []);
  const again = await repo.appendTimelineReply(entry(), reply({ id: 'new' }), USER);
  assert.equal(again.id, saved.id); assert.equal(again.replies.length, 1);
});

test('different owners cannot share containers and account switches fail before cross-account writes', async () => {
  const f = fixture();
  const one = await f.repository(USER).appendTimelineReply(entry(), reply(), USER);
  const two = await f.repository(OTHER).appendTimelineReply(entry(), reply(), OTHER);
  assert.equal(f.rows.length, 2); assert.notEqual(one.id, two.id); assert.notEqual(one.operationId, two.operationId);
  for (const switchAt of [0, 1, 2, 3, 4]) {
    const isolated = fixture();
    await assert.rejects(isolated.repository(USER, [...Array(switchAt).fill(USER), OTHER]).appendTimelineReply(entry(), reply(), USER),
      { code: 'REVIEW_ACCOUNT_CHANGED' });
    if (switchAt < 4) assert.equal(isolated.rows.length, 0);
  }
  const foreign = fixture({ readResult: ({ operation }) => operation.action === 'read'
    ? { data: { ...f.rows[0], user_id: OTHER }, error: null } : null });
  await assert.rejects(foreign.repository().appendTimelineReply(entry(), reply(), USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('malformed or retargeted containers fail closed before existing evaluations can be changed', async () => {
  const seed = fixture();
  const saved = await seed.repository().appendTimelineReply(entry(), reply(), USER);
  const corruptions = [
    [row => { row.review_revision = null; }, 'REVIEW_SCHEMA_NOT_CONFIGURED'],
    [row => { row.review_data.version = 2; }, 'REVIEW_SCHEMA_NOT_CONFIGURED'],
    [row => { row.review_data.timelineEvent.version = 2; }, 'REVIEW_INVALID_TIMELINE'],
    [row => { row.review_data.timelineEvent.id = 'other'; }, 'REVIEW_TIMELINE_CONFLICT'],
    [row => { row.log_date = '2026-10-07'; }, 'REVIEW_TIMELINE_CONFLICT'],
    [row => { row.review_data.date = '2026-10-07'; }, 'REVIEW_TIMELINE_CONFLICT'],
    [row => { row.review_data.replies[0].images = [{ path: `${OTHER}/${IMAGE_ID}.jpg`, mimeType: 'image/jpeg', size: 1 }]; }, 'REVIEW_INVALID_IMAGE'],
  ];
  for (const [corrupt, code] of corruptions) {
    const row = structuredClone(seed.rows[0]); corrupt(row);
    const f = fixture({ initial: [row] });
    await assert.rejects(f.repository().appendTimelineReply(entry(), reply({ id: 'new' }), USER), { code });
    assert.equal(f.operations.filter(item => item.action !== 'read').length, 0);
  }
  const changed = structuredClone(seed.rows[0]); changed.review_data.timelineEvent.id = 'other';
  const f = fixture({ initial: [changed] });
  await assert.rejects(f.repository().updateReply(saved, saved.replies[0], { ...saved.replies[0], text: 'edit' }, USER), { code: 'REVIEW_TIMELINE_CONFLICT' });
  await assert.rejects(f.repository().removeReply(saved, saved.replies[0], USER), { code: 'REVIEW_TIMELINE_CONFLICT' });
});
