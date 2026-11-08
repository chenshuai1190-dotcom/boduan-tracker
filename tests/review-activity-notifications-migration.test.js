// Executes deployed SQL contracts in isolated PostgreSQL; never accesses production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { mapReviewNotificationsPage, mapReviewNotificationCount, mapReviewNotificationTarget } from '../src/lib/reviewNotificationModel.js';

const files = ['review_public_activity_20261108.sql', 'review_public_replies_20261108.sql', 'review_community_evaluations_20261108.sql', 'review_public_chronology_replies_20261108.sql', 'review_activity_notifications_20261108.sql'];
const migrations = await Promise.all(files.map(file => readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8')));
const migration = migrations.at(-1);
const moduleFile = process.env.PGLITE_MODULE_FILE;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444', E = '55555555-5555-4555-8555-555555555555';
let nextId = 0;
const id = () => `88888888-8888-4888-8888-${String(++nextId).padStart(12, '0')}`;
const draft = (extra = {}) => ({ date: '2026-11-08', text: '', score: 8, images: [], ...extra });

test('notification migration is additive, reference-only and deferred until final reply target exists', () => {
  assert.doesNotMatch(migration, /update\s+public\.(review_logs|disciplines|review_public_posts|review_public_likes|review_community_evaluations)\s|alter\s+table\s+public\.(review_logs|disciplines)/i);
  assert.equal((migration.match(/deferrable initially deferred/g) || []).length, 4);
  assert.match(migration, /on conflict\(recipient_id,event_key\) do nothing/);
  assert.match(migration, /if TG_OP='INSERT' then/);
  assert.match(migration, /event_revision<v_evaluation.revision/);
});

test('transactional notification privacy, deduplication and paginated reads across five users', {
  skip: !moduleFile && 'Set PGLITE_MODULE_FILE to a local PGlite install for isolated SQL execution.',
}, async t => {
  assert.ok(isAbsolute(moduleFile));
  const { PGlite } = await import(pathToFileURL(moduleFile).href);
  const db = await PGlite.create();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const denied = (fn, code = '42501') => assert.rejects(fn, error => error.code === code);
  async function as(user, sql, args = [], role = 'authenticated') {
    await db.exec(`set role ${role}`);
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']); return await rows(sql, args); }
    finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
  }
  const rawRpc = async (user, name, args) => (await as(user, `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args))[0].value;
  const rpc = (user, name, args = []) => rawRpc(user, name, [...args, user]);
  const list = async (user, limit = 20, cursor = null, filter = 'all') => mapReviewNotificationsPage(await rpc(user, 'fetch_review_activity_notifications', [limit, cursor?.createdAt || null, cursor?.id || null, filter]), Math.min(limit, 20));
  const count = async user => mapReviewNotificationCount(await rpc(user, 'fetch_review_activity_notification_count')).unreadCount;
  const target = (user, notificationId) => rpc(user, 'read_review_activity_notification_target', [notificationId]);
  const mark = (user, ids, boundary = null) => rpc(user, 'mark_review_activity_notifications_read', [ids, boundary?.createdAt || null, boundary?.id || null]);
  const save = (user, source, evaluationId = id(), revision = 0, payload = draft(), replyTo = null) => rpc(user, 'save_review_community_evaluation_v2', [source.postId, evaluationId, revision, JSON.stringify(payload), replyTo && JSON.stringify(replyTo)]);
  const oldSave = (user, source, evaluationId, revision, payload) => rpc(user, 'save_review_community_evaluation', [source.postId, evaluationId, revision, JSON.stringify(payload)]);
  const remove = (user, source, evaluation) => rpc(user, 'delete_review_community_evaluation', [source.postId, evaluation.id, evaluation.revision]);
  const like = (user, source, desired = true) => rpc(user, 'set_review_public_like', [source.postId, desired]);
  const insert = async (user = A, type = 'log', replies = []) => {
    const table = type === 'log' ? 'review_logs' : 'disciplines';
    const [row] = await as(user, `insert into public.${table}(user_id,text,review_data${type === 'log' ? ',log_date' : ''}) values($1,$2,$3${type === 'log' ? ",'2026-11-08'" : ''}) returning id`, [user, 'Public post body ' + '😀'.repeat(170), JSON.stringify({ version: 1, visibility: 'public', date: '2026-11-08', replies })]);
    return { id: row.id, table, postId: `${type}:${row.id}`, user };
  };
  const visibility = (source, value) => as(source.user, `update public.${source.table} set review_data=jsonb_set(review_data,'{visibility}',to_jsonb($2::text)) where id=$1`, [source.id, value]);
  const dropSource = source => as(source.user, `delete from public.${source.table} where id=$1`, [source.id]);
  const notificationsFor = async (user, source) => (await list(user)).notifications.filter(n => n.postId === source.postId);
  const fingerprint = async () => (await rows(`select jsonb_build_object(
    'sources',(select md5(coalesce(string_agg(x::text,'' order by x->>'id'),'')) from (select to_jsonb(r) x from public.review_logs r union all select to_jsonb(d) from public.disciplines d) sources),
    'posts',(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by id),'')) from public.review_public_posts p),
    'likes',(select md5(coalesce(string_agg(to_jsonb(l)::text,'' order by post_id,user_id),'')) from public.review_public_likes l),
    'evaluations',(select md5(coalesce(string_agg(to_jsonb(e)::text,'' order by id),'')) from public.review_community_evaluations e)
  ) value`))[0].value;
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}'),('${E}');
      create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',created_at timestamptz default now());
      create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',log_date date not null,created_at timestamptz default now());
      create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
      alter table public.disciplines enable row level security; alter table public.review_logs enable row level security; alter table public.community_profiles enable row level security;
      create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      insert into public.community_profiles values('${A}','Post Author','fox',null,'secret-a'),('${B}','Reviewer B','gold',null,'secret-b'),('${C}','Reviewer C','gold',null,'secret-c'),('${D}','Liker D','gold',null,'secret-d'),('${E}','Recipient E','gold',null,'secret-e');
      create schema storage; create table storage.buckets(id text primary key,public boolean not null default false);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      insert into storage.buckets values('review-journal-images',false),('community-avatars',false);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
    `);
    for (const prior of migrations.slice(0, -1)) await db.exec(prior);
    const legacy = await insert();
    let legacyEvaluation = await save(B, legacy);
    await like(B, legacy);
    const before = await fingerprint();
    await db.exec(migration); await db.exec(migration);

    await t.test('migration preserves all original business rows and does not backfill old interactions on edits', async () => {
      assert.deepEqual(await fingerprint(), before);
      assert.equal(await count(A), 0); assert.deepEqual((await list(A)).notifications, []);
      legacyEvaluation = await oldSave(B, legacy, legacyEvaluation.id, 1, draft({ text: 'Edited legacy interaction' }));
      await like(B, legacy);
      assert.equal(await count(A), 0);
      const columns = (await rows("select column_name from information_schema.columns where table_name='review_activity_notifications'")).map(row => row.column_name);
      assert.deepEqual(columns.sort(), ['id','recipient_id','actor_id','post_id','event_type','event_key','evaluation_id','event_revision','created_at','read_at'].sort());
    });

    await t.test('likes deduplicate, do not notify self, and use current safe actor/post data', async () => {
      const source = await insert(); const initial = await count(A);
      await like(B, source); await like(B, source); await like(A, source);
      const [item] = await notificationsFor(A, source);
      assert.equal(await count(A), initial + 1); assert.equal(item.kind, 'like'); assert.equal(item.actorId, B);
      assert.equal(item.commentId, null); assert.equal(item.score, null); assert.equal(item.excerpt, '');
      assert.equal(Array.from(item.postExcerpt).length, 160); assert.doesNotMatch(JSON.stringify(item), /secret-/);
      const value = mapReviewNotificationTarget(await target(A, item.id), item.id);
      assert.equal(value.evaluation, null); assert.equal(value.postId, source.postId);
      assert.equal(await target(B, item.id), null);
      await as(B, 'update public.community_profiles set nickname=$1 where user_id=$2', ['New Nickname', B]);
      assert.equal((await notificationsFor(A, source))[0].actor.nickname, 'New Nickname');
      await like(B, source, false);
      assert.deepEqual(await notificationsFor(A, source), []); assert.equal(await target(A, item.id), null);
      const [tombstone] = await rows('select read_at from public.review_activity_notifications where id=$1', [item.id]);
      assert.ok(tombstone.read_at);
      await like(B, source);
      const [again] = await notificationsFor(A, source);
      assert.equal(again.id, item.id); assert.equal(again.createdAt, item.createdAt); assert.ok(again.readAt);
      assert.equal(await count(A), initial);
    });

    await t.test('one evaluation produces one live comment/rating message; edits preserve original read state and date', async () => {
      const source = await insert(); const initial = await count(A);
      const payload = draft({ text: '😀'.repeat(175), score: 9 });
      let review = await save(B, source, id(), 0, payload);
      await save(B, source, review.id, 0, payload);
      let [item] = await notificationsFor(A, source);
      assert.equal(await count(A), initial + 1); assert.equal(item.kind, 'rating'); assert.equal(item.score, 9);
      assert.equal(Array.from(item.excerpt).length, 160);
      const safeTarget = mapReviewNotificationTarget(await target(A, item.id), item.id);
      assert.equal(safeTarget.evaluation.id, review.id); assert.equal(safeTarget.evaluation.score, 9);
      await mark(A, [item.id]); const readAt = (await notificationsFor(A, source))[0].readAt;
      review = await oldSave(B, source, review.id, review.revision, draft({ score: null, text: 'Edited into a comment' }));
      const [edited] = await notificationsFor(A, source);
      assert.equal(edited.kind, 'comment'); assert.equal(edited.score, null); assert.equal(edited.excerpt, 'Edited into a comment');
      assert.equal(edited.id, item.id); assert.equal(edited.createdAt, item.createdAt); assert.equal(edited.readAt, readAt);
      assert.equal((await rows('select event_revision from public.review_activity_notifications where id=$1', [item.id]))[0].event_revision, review.revision);
      assert.equal((await list(A, 20, null, 'ratings')).notifications.some(n => n.id === item.id), false);
      assert.equal((await list(A, 20, null, 'comments')).notifications.some(n => n.id === item.id), true);
      await remove(B, source, review);
      assert.equal(await target(A, item.id), null); assert.deepEqual(await notificationsFor(A, source), []);
      assert.equal(await count(A), initial);
    });

    await t.test('deferred reply notifications reach the actual target author, never the parent as a side effect', async () => {
      const source = await insert(A, 'log', [{ id: 'author-target', date: '2026-11-08', score: 7, text: 'Source review' }]);
      const base = await save(B, source, id(), 0, draft({ text: 'Community target' }));
      const aCount = await count(A), bCount = await count(B);
      const reply = await save(C, source, id(), 0, draft({ score: 10, text: 'Reply with score' }), { kind: 'community', id: base.id });
      assert.equal(await count(A), aCount); assert.equal(await count(B), bCount + 1);
      const [item] = await notificationsFor(B, source);
      assert.equal(item.kind, 'reply'); assert.equal(item.score, 10); assert.equal(item.commentId, reply.id);
      assert.equal(mapReviewNotificationTarget(await target(B, item.id), item.id).evaluation.replyTo.authorId, B);
      assert.equal((await list(B, 20, null, 'comments')).notifications.some(n => n.id === item.id), true);
      assert.equal((await list(B, 20, null, 'ratings')).notifications.some(n => n.id === item.id), false);
      const authorReply = await save(C, source, id(), 0, draft(), { kind: 'author', id: 'author-target' });
      assert.equal((await notificationsFor(A, source)).find(n => n.commentId === authorReply.id).kind, 'reply');
      await save(B, source, id(), 0, draft(), { kind: 'community', id: base.id });
      await save(A, source); // own direct evaluation
      assert.equal(await count(B), bCount + 1); assert.equal(await count(A), aCount + 1);
      await remove(B, source, base);
      assert.equal(await target(B, item.id), null); assert.equal(await count(B), bCount);
      assert.ok((await rows('select read_at from public.review_activity_notifications where id=$1', [item.id]))[0].read_at);
      await as(A, "update public.review_logs set review_data=jsonb_set(review_data,'{replies}','[]'::jsonb) where id=$1", [source.id]);
      assert.deepEqual(await notificationsFor(A, source), []);
    });

    await t.test('deep links return current safe full attachments without copying them into notification rows', async () => {
      const source = await insert(); const imagePath = `${B}/${id()}.png`;
      const rich = draft({ text: 'Review with attachments', score: 10, tags: ['按计划执行'], stocks: ['NVDA'],
        images: [{ path: imagePath, name: 'own.png', mimeType: 'image/png', size: 128, token: 'secret-token' }],
        market: { kind: 'market_snapshot', basis: 'close', asOfDate: '2026-11-06', recordDate: '2026-11-08', items: [{ key: 'vix', value: 25 }] },
        account: { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report', asOfDate: '2026-11-06', recordDate: '2026-11-08', sourceSnapshotId: 'secret-source', rawCash: 999999, items: [{ key: 'cumulativeReturnPct', value: 3.39, asOfDate: '2026-11-06', basis: 'close', source: 'pnl_report' }] },
        trades: [{ id: 12, symbol: 'NVDA', date: '2026-11-06', side: 'buy', price: 187.5, shares: 2, accountId: 'secret-account' }],
      });
      await save(B, source, id(), 0, rich); const [item] = await notificationsFor(A, source);
      const linked = mapReviewNotificationTarget(await target(A, item.id), item.id).evaluation;
      assert.equal(linked.images[0].path, imagePath); assert.equal(linked.account.items[0].value, 3.39);
      assert.equal(linked.market.items[0].value, 25); assert.equal(linked.trades[0].shares, 2);
      assert.doesNotMatch(JSON.stringify(linked), /secret-|rawCash/);
      assert.doesNotMatch(JSON.stringify((await rows('select to_jsonb(n) value from public.review_activity_notifications n where id=$1', [item.id]))[0]), /Review with|account_snapshot|NVDA|png|score/);
    });

    await t.test('only final committed interactions notify; aborted and transient states create no phantom messages', async () => {
      const source = await insert(); const initial = await count(A);
      await db.exec('begin');
      const removed = await save(B, source); await remove(B, source, removed);
      await like(C, source); await like(C, source, false);
      await db.exec('commit');
      assert.equal(await count(A), initial); assert.deepEqual(await notificationsFor(A, source), []);
      await db.exec('begin'); await save(B, source); await db.exec('rollback');
      assert.equal(await count(A), initial);
      const review = await save(B, source); const [item] = await notificationsFor(A, source);
      await db.exec('begin'); await visibility(source, 'private'); await visibility(source, 'public'); await db.exec('commit');
      const [stillUnread] = await notificationsFor(A, source);
      assert.equal(stillUnread.id, item.id); assert.equal(stillUnread.readAt, null);
      assert.equal(mapReviewNotificationTarget(await target(A, item.id), item.id).evaluation.id, review.id);
    });

    await t.test('private posts hide all notification content and counts, then restore only already-read history', async () => {
      const source = await insert(A, 'insight'); await save(B, source); await like(C, source);
      const items = await notificationsFor(A, source); assert.equal(items.length, 2);
      const initial = await count(A);
      await visibility(source, 'private');
      assert.equal(await count(A), initial - 2); assert.deepEqual(await notificationsFor(A, source), []);
      for (const item of items) assert.equal(await target(A, item.id), null);
      assert.equal((await rpc(A, 'fetch_review_community_evaluations', [source.postId, 20, null, null])).evaluations.length, 1, 'private original author can still review existing comments');
      await visibility(source, 'public'); await like(C, source);
      const restored = await notificationsFor(A, source);
      assert.deepEqual(restored.map(n => n.id).sort(), items.map(n => n.id).sort()); assert.ok(restored.every(n => n.readAt));
      assert.equal(await count(A), initial - 2);
      await dropSource(source);
      assert.deepEqual(await notificationsFor(A, source), []); for (const item of items) assert.equal(await target(A, item.id), null);
      assert.equal((await rows('select count(*)::integer value from public.review_community_evaluations where post_id=$1', [source.postId]))[0].value, 0);
    });

    await t.test('notification-only liker avatars grant exact recipient reads and withdraw with current visibility', async () => {
      const source = await insert(); const avatar = `${D}/${id()}.webp`, unreferenced = `${D}/${id()}.webp`;
      await as(D, 'update public.community_profiles set avatar_path=$1 where user_id=$2', [avatar, D]);
      await as(D, "insert into storage.objects(bucket_id,name) values('community-avatars',$1),('community-avatars',$2),('review-journal-images',$1)", [avatar, unreferenced]);
      const visible = user => as(user, 'select bucket_id,name from storage.objects where name=any($1::text[])', [[avatar, unreferenced]]);
      assert.deepEqual(await visible(A), []); await like(D, source);
      assert.deepEqual(await visible(A), [{ bucket_id: 'community-avatars', name: avatar }]); assert.deepEqual(await visible(C), []);
      assert.equal((await notificationsFor(A, source))[0].actor.avatarPath, avatar);
      await visibility(source, 'private'); assert.deepEqual(await visible(A), []);
      await visibility(source, 'public'); await like(D, source); assert.equal((await visible(A)).length, 1);
      await like(D, source, false); assert.deepEqual(await visible(A), []);
      await like(D, source); await as(D, 'update public.community_profiles set avatar_path=$1 where user_id=$2', [unreferenced, D]);
      assert.deepEqual(await visible(A), [{ bucket_id: 'community-avatars', name: unreferenced }]);
    });

    await t.test('anonymous, forged accounts and direct table/helper reads/writes are denied', async () => {
      const signatures = [
        ['fetch_review_activity_notifications', [20, null, null, 'all']], ['fetch_review_activity_notification_count', []],
        ['mark_review_activity_notifications_read', [[id()], null, null]], ['read_review_activity_notification_target', [id()]],
      ];
      for (const [name, args] of signatures) {
        await denied(() => rawRpc(A, name, [...args, B])); await denied(() => rawRpc(null, name, [...args, null]));
        await denied(() => as(null, `select public.${name}(${[...args, null].map((_, i) => `$${i + 1}`).join(',')})`, [...args, null], 'anon'));
      }
      for (const user of [A, B]) {
        await denied(() => as(user, 'select * from public.review_activity_notifications'));
        await denied(() => as(user, 'delete from public.review_activity_notifications'));
        await denied(() => as(user, "select public.review_activity_notification_kind(null::public.review_activity_notifications)"));
        await denied(() => as(user, "select public.review_activity_notification_json(null::public.review_activity_notifications)"));
        await denied(() => as(user, "select public.review_activity_notification_visible(null::public.review_activity_notifications,$1)", [user]));
      }
      assert.equal((await as(null, "select public.review_activity_notification_avatar_visible('bad') value"))[0].value, false);
      assert.deepEqual(await as(B, 'select id from public.review_logs where user_id=$1', [A]), []);
      await denied(() => rpc(A, 'fetch_review_activity_notifications', [20, null, id(), 'all']), '22023');
      await denied(() => rpc(A, 'fetch_review_activity_notifications', [20, null, null, 'bad']), '22023');
      await denied(() => rpc(A, 'fetch_review_activity_notifications', [20, 'infinity', id(), 'all']), '22023');
    });

    await t.test('bounded pages preserve microseconds and tied IDs, filter counts stay global, target bypasses page 20', async () => {
      const source = await insert(E); const comments = [];
      for (let index = 0; index < 25; index++) comments.push(await save(B, source, id(), 0, draft({ score: index % 2 ? null : 8, text: `Comment ${index}` })));
      await like(C, source);
      await rows("update public.review_activity_notifications set created_at=case when evaluation_id=$1 then '2026-11-08T06:00:00.123455Z'::timestamptz else '2026-11-08T06:00:00.123456Z'::timestamptz end where recipient_id=$2", [comments[0].id, E]);
      const expected = (await rows('select id from public.review_activity_notifications where recipient_id=$1 order by created_at desc,id desc', [E])).map(n => n.id);
      const cap = await list(E, 100); assert.equal(cap.notifications.length, 20); assert.equal(cap.hasMore, true); assert.equal(cap.unreadCount, 26);
      const actual = []; let cursor = null;
      do { const page = await list(E, 3, cursor); actual.push(...page.notifications.map(n => n.id)); cursor = page.nextCursor; if (cursor) assert.match(cursor.createdAt, /12345[56]/); } while (cursor);
      assert.deepEqual(actual, expected); assert.equal(new Set(actual).size, 26);
      const ratings = await list(E, 20, null, 'ratings'), plainComments = await list(E, 20, null, 'comments'), likes = await list(E, 20, null, 'likes');
      assert.equal(ratings.notifications.length, 13); assert.equal(plainComments.notifications.length, 12); assert.equal(likes.notifications.length, 1);
      for (const page of [ratings, plainComments, likes]) assert.equal(page.unreadCount, 26);
      const [oldest] = await rows('select id from public.review_activity_notifications where evaluation_id=$1', [comments[0].id]);
      assert.equal(mapReviewNotificationTarget(await target(E, oldest.id), oldest.id).evaluation.id, comments[0].id);
    });

    await t.test('mark specific IDs and observed tuple boundaries never consume newer notifications', async () => {
      const page = await list(E); const head = { createdAt: page.notifications[0].createdAt, id: page.notifications[0].id };
      const ownId = page.notifications.at(-1).id, foreignId = (await list(A)).notifications[0].id;
      assert.equal((await mark(E, [ownId, foreignId])).unreadCount, 25);
      const firstReadAt = (await rows('select read_at from public.review_activity_notifications where id=$1', [ownId]))[0].read_at;
      await mark(E, [ownId]); assert.deepEqual((await rows('select read_at from public.review_activity_notifications where id=$1', [ownId]))[0].read_at, firstReadAt);
      for (const args of [[[], null, null], [[null], null, null], [[[ownId]], null, null], [Array(101).fill(ownId), null, null], [[ownId], head.createdAt, head.id], [null, null, null], [null, head.createdAt, foreignId], [null, '2099-01-01T00:00:00Z', head.id]]) {
        await denied(() => rpc(E, 'mark_review_activity_notifications_read', args), '22023');
      }
      const middle = { createdAt: page.notifications[10].createdAt, id: page.notifications[10].id };
      assert.equal((await mark(E, null, middle)).unreadCount, 10, 'same timestamp greater IDs stay unread above the observed boundary');
      const laterSource = await insert(E); const laterReview = await save(C, laterSource);
      assert.equal((await mark(E, null, head)).unreadCount, 1);
      const remaining = (await list(E)).notifications.filter(n => !n.readAt);
      assert.deepEqual(remaining.map(n => n.commentId), [laterReview.id]);
      assert.equal((await mark(E, [remaining[0].id])).unreadCount, 0);
    });
  } finally { await db.close(); }
});
