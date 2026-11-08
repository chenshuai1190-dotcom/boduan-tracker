// Real SQL in an isolated in-process PostgreSQL fixture. No production access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { mapReviewPublicFeed } from '../src/lib/reviewPublicModel.js';
import { mapReviewCommunityEvaluation, mapReviewCommunityEvaluations } from '../src/lib/reviewCommunityEvaluationModel.js';

const files = ['review_public_activity_20261108.sql', 'review_public_replies_20261108.sql', 'review_community_evaluations_20261108.sql', 'review_public_chronology_replies_20261108.sql'];
const migrations = await Promise.all(files.map(file => readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8')));
const migration = migrations.at(-1);
const moduleFile = process.env.PGLITE_MODULE_FILE;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
let nextId = 0;
const id = () => `77777777-7777-4777-8777-${String(++nextId).padStart(12, '0')}`;
const draft = (extra = {}) => ({ date: '2026-11-08', text: '', score: 8, images: [], ...extra });

test('chronology and reply migration is additive and keeps both v1 RPC contracts', () => {
  assert.match(migration, /record_date desc,published_at desc,id desc/);
  assert.match(migration, /published_at=source\.created_at,updated_at=clock_timestamp\(\)/);
  assert.doesNotMatch(migration, /drop function|update\s+public\.(review_logs|disciplines)\s|alter\s+table\s+public\.(review_logs|disciplines)/i);
  assert.match(migration, /p_before_date date default null/);
  assert.match(migration, /p_reply_to jsonb default null,p_expected_user_id uuid default null/);
});

test('original chronology, precise paging and same-post replies work across three authenticated users', {
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
  const rpc = (user, name, args) => rawRpc(user, name, [...args, user]);
  const feed = (user = C, limit = 20, cursor = null, query = '', symbol = '') => rpc(user, 'fetch_review_public_feed_v2', [limit, cursor?.recordDate || null, cursor?.publishedAt || null, cursor?.id || null, query, symbol]);
  const list = (user, postId) => rpc(user, 'fetch_review_community_evaluations', [postId, 20, null, null]);
  const save = (user, postId, evaluationId, revision = 0, value = draft(), replyTo = null) => rpc(user, 'save_review_community_evaluation_v2', [postId, evaluationId, revision, JSON.stringify(value), replyTo && JSON.stringify(replyTo)]);
  const oldSave = (user, postId, evaluationId, revision = 0, value = draft()) => rpc(user, 'save_review_community_evaluation', [postId, evaluationId, revision, JSON.stringify(value)]);
  const remove = (user, postId, reply) => rpc(user, 'delete_review_community_evaluation', [postId, reply.id, reply.revision]);
  const post = (user, postId) => rpc(user, 'read_review_public_post', [postId]);
  const insert = async (type = 'log', date = '2026-03-01', createdAt = '2026-11-01T09:30:00.123456Z', visible = 'public', replies = []) => {
    const table = type === 'log' ? 'review_logs' : 'disciplines';
    const data = { version: 1, visibility: visible, date, stocks: ['NVDA'], replies };
    const [row] = await as(A, `insert into public.${table}(user_id,text,review_data,created_at${type === 'log' ? ',log_date' : ''}) values($1,'Chronology sample',$2,$3${type === 'log' ? ',$4' : ''}) returning id`, [A, JSON.stringify(data), createdAt, ...(type === 'log' ? [date] : [])]);
    return { id: row.id, table, postId: `${type}:${row.id}`, date, createdAt };
  };
  const visibility = (source, value) => as(A, `update public.${source.table} set review_data=jsonb_set(review_data,'{visibility}',to_jsonb($2::text)) where id=$1`, [source.id, value]);
  const sourceRows = () => rows("select 'log:'||id::text as id,user_id,text,review_data,created_at from public.review_logs union all select 'insight:'||id::text,user_id,text,review_data,created_at from public.disciplines order by id");
  let historical, newerDate, privateSource, target, authorReply, communityReply;
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${A}'),('${B}'),('${C}');
      create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',created_at timestamptz default now());
      create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',log_date date not null,created_at timestamptz default now());
      create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
      alter table public.disciplines enable row level security; alter table public.review_logs enable row level security; alter table public.community_profiles enable row level security;
      create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      insert into public.community_profiles values('${A}','Post Author','fox',null,'secret-a'),('${B}','Reviewer B','gold',null,'secret-b'),('${C}','Reviewer C','gold',null,'secret-c');
      create schema storage; create table storage.buckets(id text primary key,public boolean not null default false);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      insert into storage.buckets values('review-journal-images',false),('community-avatars',false);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
    `);
    for (const oldMigration of migrations.slice(0, -1)) await db.exec(oldMigration);
    historical = await insert('log', '2026-03-01', '2026-11-01T09:30:00.123456Z', 'public', [{ id: 'author-review-one', date: '2026-03-02', text: 'Original author target text', score: 7 }]);
    newerDate = await insert('insight', '2026-11-05', '2026-09-01T09:30:00.123456Z');
    privateSource = await insert('log', '2026-04-01', '2026-04-02T01:30:00+08:00', 'private');
    target = await oldSave(B, historical.postId, id(), 0, draft({ text: 'Original community target text' }));
    await rpc(B, 'set_review_public_like', [historical.postId, true]);
    const beforeSources = await sourceRows(), beforePost = await post(C, historical.postId);
    const beforeEvaluations = await rows('select id,post_id,author_id,payload,revision,created_at,updated_at,deleted_at from public.review_community_evaluations');
    await db.exec(migration); await db.exec(migration);

    await t.test('backfill touches only public projection chronology and keeps original journals, evaluations and likes', async () => {
      assert.deepEqual(await sourceRows(), beforeSources);
      assert.deepEqual(await rows('select id,post_id,author_id,payload,revision,created_at,updated_at,deleted_at from public.review_community_evaluations'), beforeEvaluations);
      const after = await post(C, historical.postId);
      assert.equal(Date.parse(after.publishedAt), Date.parse(historical.createdAt));
      assert.match(after.publishedAt, /123456/); assert.notEqual(after.publishedAt, beforePost.publishedAt);
      assert.deepEqual(after.replies, beforePost.replies); assert.equal(after.likeCount, 1); assert.equal(after.commentCount, 2);
      assert.equal(after.date, '2026-03-01'); assert.equal(await post(C, privateSource.postId), null);
      const oldFeed = await rpc(C, 'fetch_review_public_feed', [20, null, null, '', '']);
      assert.equal(oldFeed.posts.length, 2, 'older runtimes retain their existing RPC');
    });

    await t.test('record date sorts first and cursor contains independent date, exact creation instant and ID', async () => {
      const first = await feed(C, 1); assert.equal(first.posts[0].id, newerDate.postId);
      assert.equal(first.nextCursor.recordDate, '2026-11-05'); assert.match(first.nextCursor.publishedAt, /123456/);
      assert.equal(mapReviewPublicFeed(first).nextCursor.recordDate, '2026-11-05');
      const second = await feed(C, 1, first.nextCursor); assert.equal(second.posts[0].id, historical.postId); assert.equal(second.hasMore, false);
      for (const cursor of [ ['2026-11-05', null, null], [null, first.nextCursor.publishedAt, first.nextCursor.id], ['2026-11-05', first.nextCursor.publishedAt, null] ]) {
        await denied(() => rpc(C, 'fetch_review_public_feed_v2', [20, ...cursor, '', '']), '22023');
      }
      assert.equal((await feed(C, 20, null, '2026-03-01')).posts[0].id, historical.postId);
      assert.equal((await feed(C, 20, null, '', 'NVDA')).posts.length, 2);
      assert.equal((await feed(C, 20, null, '', 'MSFT')).posts.length, 0);
    });

    await t.test('same-day microseconds and tied IDs paginate without omissions even if the cursor row is later removed', async () => {
      const samples = [];
      for (const fraction of ['123455', '123456', '123456', '123457']) {
        const item = await insert('log', '2026-11-05', `2026-09-01T09:30:00.${fraction}Z`);
        await as(A, 'update public.review_logs set text=$2 where id=$1', [item.id, 'Pagination ordering fixture']);
        samples.push(item);
      }
      const expected = samples.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.postId.localeCompare(a.postId)).map(item => item.postId);
      const actual = []; let cursor = null, firstCursor;
      do {
        const page = mapReviewPublicFeed(await feed(C, 1, cursor, 'Pagination ordering fixture'));
        actual.push(...page.posts.map(item => item.id));
        cursor = page.nextCursor; firstCursor ||= cursor;
      } while (cursor);
      assert.deepEqual(actual, expected); assert.equal(new Set(actual).size, 4);
      await as(A, 'delete from public.review_logs where id=$1', [samples[0].id]);
      const remainder = await feed(C, 20, firstCursor, 'Pagination ordering fixture');
      assert.deepEqual(remainder.posts.map(item => item.id), expected.slice(1));
    });

    await t.test('visibility round trips, body edits and both evaluation writers retain original publication time', async () => {
      await visibility(privateSource, 'public');
      const original = await post(C, privateSource.postId);
      assert.equal(original.date, '2026-04-01'); assert.equal(Date.parse(original.publishedAt), Date.parse('2026-04-01T17:30:00Z'));
      await visibility(privateSource, 'private'); await visibility(privateSource, 'public');
      assert.equal((await post(C, privateSource.postId)).publishedAt, original.publishedAt);
      await as(A, 'update public.review_logs set text=$2 where id=$1', [privateSource.id, 'Edited original post']);
      await oldSave(C, privateSource.postId, id());
      assert.equal((await post(C, privateSource.postId)).publishedAt, original.publishedAt);
      const absentTime = await insert('log', '2026-01-02', null, 'private');
      await denied(() => visibility(absentTime, 'public'), '22023');
      assert.equal(await post(C, absentTime.postId), null, 'missing creation timestamps must not be invented');
    });

    await t.test('reply creation derives the exact same-post target author without storing target contents', async () => {
      authorReply = await save(B, historical.postId, id(), 0, draft({ score: 9 }), { kind: 'author', id: 'author-review-one' });
      assert.deepEqual(authorReply.replyTo, { kind: 'author', id: 'author-review-one', authorId: A, nickname: 'Post Author', available: true });
      assert.equal(mapReviewCommunityEvaluation(authorReply, historical.postId).replyTo.authorId, A);
      communityReply = await save(C, historical.postId, id(), 0, draft({ text: 'Reply from another reader', score: 10 }), { kind: 'community', id: target.id });
      assert.deepEqual(communityReply.replyTo, { kind: 'community', id: target.id, authorId: B, nickname: 'Reviewer B', available: true });
      const page = mapReviewCommunityEvaluations(await list(A, historical.postId), historical.postId);
      assert.equal(page.evaluations.length, 3); assert.equal((await post(C, historical.postId)).commentCount, 4);
      assert.doesNotMatch(JSON.stringify(communityReply), /Original community target text|secret-/);
      const [stored] = await rows('select payload,reply_to_kind,reply_to_id,reply_to_author_id from public.review_community_evaluations where id=$1', [communityReply.id]);
      assert.equal(stored.reply_to_author_id, B); assert.doesNotMatch(JSON.stringify(stored), /Original community target text|Original author target text|nickname/);
      const direct = await save(C, historical.postId, id()); assert.equal(direct.replyTo, null);
      await remove(C, historical.postId, direct);
    });

    await t.test('cross-post targets, forged target metadata and unauthorized writes are rejected', async () => {
      for (const reference of [{ kind: 'community', id: target.id }, { kind: 'author', id: 'author-review-one' }]) {
        await denied(() => save(C, newerDate.postId, id(), 0, draft(), reference), 'P0002');
      }
      for (const reference of [{ kind: 'other', id: target.id }, { kind: 'community', id: 'not-a-uuid' }, { kind: 'author', id: 'author-review-one', authorId: C }, { kind: 'author', id: '\nforged' }]) {
        await denied(() => save(C, historical.postId, id(), 0, draft(), reference), '22023');
      }
      await denied(() => save(B, historical.postId, communityReply.id, communityReply.revision, draft(), communityReply.replyTo && { kind: 'community', id: target.id }));
      await denied(() => rawRpc(C, 'review_community_reply_target', [historical.postId, 'community', target.id]));
      await denied(() => as(C, 'update public.review_community_evaluations set reply_to_author_id=$1 where id=$2', [C, authorReply.id]));
      await denied(() => rows('update public.review_community_evaluations set reply_to_kind=null where id=$1', [authorReply.id]), '23514');
    });

    await t.test('reply identity is immutable across v1/v2 edits and uncertain-create retries', async () => {
      assert.deepEqual(await save(B, historical.postId, authorReply.id, 0, draft({ score: 9 }), { kind: 'author', id: 'author-review-one' }), authorReply);
      authorReply = await oldSave(B, historical.postId, authorReply.id, 1, draft({ text: 'Old client edited this reply', score: 8 }));
      assert.equal(authorReply.replyTo.id, 'author-review-one');
      authorReply = await save(B, historical.postId, authorReply.id, authorReply.revision, draft({ text: 'New client edited this reply', score: 7 }), null);
      assert.equal(authorReply.replyTo.id, 'author-review-one');
      await denied(() => save(B, historical.postId, authorReply.id, authorReply.revision, draft(), { kind: 'community', id: target.id }), '22023');
      await denied(() => save(B, historical.postId, target.id, target.revision, draft(), { kind: 'author', id: 'author-review-one' }), '22023');
      const after = await post(C, historical.postId);
      assert.equal(Date.parse(after.publishedAt), Date.parse(historical.createdAt));
    });

    await t.test('removed targets retain their replies with unavailable pointers and current profile names', async () => {
      await remove(B, historical.postId, target);
      await as(A, "update public.review_logs set review_data=jsonb_set(review_data,'{replies}','[]'::jsonb) where id=$1", [historical.id]);
      await as(B, 'update public.community_profiles set nickname=$2 where user_id=$1', [B, 'Updated Reviewer']);
      const remaining = (await list(A, historical.postId)).evaluations;
      const toCommunity = remaining.find(row => row.id === communityReply.id);
      const toAuthor = remaining.find(row => row.id === authorReply.id);
      assert.equal(toCommunity.replyTo.available, false); assert.equal(toCommunity.replyTo.nickname, 'Updated Reviewer'); assert.equal(toCommunity.replyTo.authorId, B);
      assert.equal(toAuthor.replyTo.available, false); assert.equal(toAuthor.replyTo.authorId, A);
      assert.equal(mapReviewCommunityEvaluation(toCommunity, historical.postId).replyTo.available, false);
      assert.deepEqual((await save(C, historical.postId, communityReply.id, 0, draft({ text: 'Reply from another reader', score: 10 }), { kind: 'community', id: target.id })).replyTo, toCommunity.replyTo);
      communityReply = await save(C, historical.postId, communityReply.id, communityReply.revision, draft({ text: 'Edited after the target disappeared', score: 6 }), { kind: 'community', id: target.id });
      assert.equal(communityReply.revision, 2); assert.equal(communityReply.replyTo.available, false);
      await denied(() => save(C, historical.postId, id(), 0, draft(), { kind: 'community', id: target.id }), 'P0002');
      await denied(() => save(C, historical.postId, id(), 0, draft(), { kind: 'author', id: 'author-review-one' }), 'P0002');
    });

    await t.test('parent privacy and deletion govern replies, and anonymous or switched sessions cannot use v2 RPCs', async () => {
      await visibility(historical, 'private');
      assert.equal((await list(A, historical.postId)).evaluations.length, 2);
      for (const user of [B, C]) {
        await denied(() => list(user, historical.postId), 'P0002');
        await denied(() => save(user, historical.postId, id(), 0, draft(), { kind: 'community', id: communityReply.id }), 'P0002');
      }
      await visibility(historical, 'public'); assert.equal((await list(C, historical.postId)).evaluations.length, 2);
      const calls = [['fetch_review_public_feed_v2', [20, null, null, null, '', '']], ['save_review_community_evaluation_v2', [historical.postId, id(), 0, JSON.stringify(draft()), null]]];
      for (const [name, args] of calls) {
        await denied(() => rawRpc(B, name, args)); await denied(() => rawRpc(B, name, [...args, C]));
        await denied(() => as(null, `select public.${name}(${[...args, B].map((_, i) => `$${i + 1}`).join(',')})`, [...args, B], 'anon'));
      }
      await as(A, 'delete from public.review_logs where id=$1', [historical.id]);
      assert.equal((await rows('select count(*)::int as n from public.review_community_evaluations where post_id=$1', [historical.postId]))[0].n, 0);
    });
  } finally { await db.close(); }
});
