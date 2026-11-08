// Isolated PostgreSQL execution only. This test never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { mapReviewCommunityEvaluation, mapReviewCommunityEvaluations } from '../src/lib/reviewCommunityEvaluationModel.js';

const migration = await readFile(new URL('../supabase/review_community_evaluations_20261108.sql', import.meta.url), 'utf8');
const foundation = await readFile(new URL('../supabase/review_public_activity_20261108.sql', import.meta.url), 'utf8');
const authorReplies = await readFile(new URL('../supabase/review_public_replies_20261108.sql', import.meta.url), 'utf8');
const moduleFile = process.env.PGLITE_MODULE_FILE;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const IMAGE = '44444444-4444-4444-8444-444444444444.png';
const AVATAR = '55555555-5555-4555-8555-555555555555.webp';
let nextId = 0;
const id = () => `66666666-6666-4666-8666-${String(++nextId).padStart(12, '0')}`;
const draft = (extra = {}) => ({ date: '2026-11-08', text: '', score: 8, images: [], ...extra });

test('community evaluations use a separate closed table and serialize against parent writes', () => {
  assert.match(migration, /alter table public\.review_community_evaluations enable row level security/);
  assert.match(migration, /revoke all on public\.review_community_evaluations from public,anon,authenticated/);
  assert.doesNotMatch(migration, /alter\s+table\s+public\.(review_logs|disciplines|community_profiles)/i);
  assert.doesNotMatch(migration, /update\s+public\.(review_logs|disciplines|community_profiles)\s/i);
  assert.match(migration, /from public\.review_logs where id::text=substring\(p_post_id from 5\) for update/);
  assert.match(migration, /from public\.disciplines where id::text=substring\(p_post_id from 9\) for update/);
  assert.doesNotMatch(migration, /references public\.review_public_posts/);
});

test('community evaluation RPCs preserve source isolation, ownership, CAS and privacy across three users', {
  skip: !moduleFile && 'Set PGLITE_MODULE_FILE to a local PGlite install for isolated SQL execution.',
}, async t => {
  assert.ok(isAbsolute(moduleFile));
  const { PGlite } = await import(pathToFileURL(moduleFile).href);
  const db = await PGlite.create();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const denied = (fn, code = '42501') => assert.rejects(fn, error => error.code === code);
  async function as(user, sql, args = [], role = 'authenticated') {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
      return await rows(sql, args);
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub','',false)");
    }
  }
  const rawRpc = async (user, name, args) => (await as(user, `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args))[0].value;
  const rpc = (user, name, args) => rawRpc(user, name, [...args, user]);
  const save = (user, postId, evaluationId, revision = 0, value = draft()) => rpc(user, 'save_review_community_evaluation', [postId, evaluationId, revision, JSON.stringify(value)]);
  const list = (user, postId, limit = 20, cursor = null) => rpc(user, 'fetch_review_community_evaluations', [postId, limit, cursor?.createdAt || null, cursor?.id || null]);
  const remove = (user, postId, reply) => rpc(user, 'delete_review_community_evaluation', [postId, reply.id, reply.revision]);
  const metadata = (extra = {}) => ({ version: 1, date: '2026-11-08', visibility: 'public', replies: [], ...extra });
  const insert = async (user = A, type = 'log', data = metadata()) => {
    const table = type === 'log' ? 'review_logs' : 'disciplines';
    const [row] = await as(user, `insert into public.${table}(user_id,text,review_data${type === 'log' ? ',log_date' : ''}) values($1,'Private source body',$2${type === 'log' ? ",'2026-11-08'" : ''}) returning id`, [user, JSON.stringify(data)]);
    return { table, id: row.id, postId: `${type}:${row.id}`, user };
  };
  const visibility = (post, value) => as(post.user, `update public.${post.table} set review_data=jsonb_set(review_data,'{visibility}',to_jsonb($2::text)) where id=$1`, [post.id, value]);
  const publicPost = (user, postId) => rpc(user, 'read_review_public_post', [postId]);
  let source, evaluation;
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${A}'),('${B}'),('${C}');
      create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',review_revision integer not null default 0,created_at timestamptz not null default now());
      create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',review_revision integer not null default 0,log_date date not null,created_at timestamptz not null default now());
      create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
      alter table public.disciplines enable row level security; alter table public.review_logs enable row level security; alter table public.community_profiles enable row level security;
      create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      insert into public.community_profiles values('${A}','Post Author','fox',null,'private-a@example.invalid'),('${B}','Reviewer','gold','${B}/${AVATAR}','private-b@example.invalid'),('${C}','Third Viewer','gold',null,'private-c@example.invalid');
      create schema storage; create table storage.buckets(id text primary key,public boolean not null default false);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      insert into storage.buckets values('review-journal-images',false),('community-avatars',false),('unrelated',false);
      insert into storage.objects(bucket_id,name) values('review-journal-images','${B}/${IMAGE}'),('review-journal-images','${C}/${IMAGE}'),('community-avatars','${B}/${AVATAR}'),('unrelated','${B}/${IMAGE}');
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
    `);
    await db.exec(foundation); await db.exec(authorReplies);
    source = await insert(A, 'log', metadata({ replies: [{ id: 'self-review', date: '2026-11-08', text: 'Existing self-review', score: 7 }] }));
    const before = await rows('select id,user_id,text,review_data,review_revision from public.review_logs');
    await db.exec(migration); await db.exec(migration);

    await t.test('additive migration leaves original author reviews and private source rows unchanged', async () => {
      assert.deepEqual(await rows('select id,user_id,text,review_data,review_revision from public.review_logs'), before);
      assert.equal((await publicPost(B, source.postId)).replies[0].text, 'Existing self-review');
      assert.equal((await publicPost(B, source.postId)).commentCount, 1);
      assert.deepEqual(await as(B, 'select * from public.review_logs'), []);
      assert.deepEqual(await as(C, 'select * from public.community_profiles'), [{ user_id: C, nickname: 'Third Viewer', avatar_key: 'gold', avatar_path: null, private_email: 'private-c@example.invalid' }]);
      await denied(() => as(B, 'select * from public.review_community_evaluations'));
      await denied(() => as(B, 'delete from public.review_community_evaluations'));
      await denied(() => as(B, "insert into public.review_community_evaluations(id,post_id,author_id,payload) values(gen_random_uuid(),'log:fake',$1,'{}')", [B]));
      for (const name of ['review_community_parent', 'review_community_lock_parent']) await denied(() => rawRpc(B, name, [source.postId]));
    });

    await t.test('every authenticated viewer can submit a score-only evaluation with truthful author identity', async () => {
      evaluation = await save(B, source.postId, id());
      assert.equal(mapReviewCommunityEvaluation(evaluation, source.postId).score, 8);
      assert.equal(evaluation.authorId, B); assert.equal(evaluation.author.nickname, 'Reviewer');
      assert.equal(evaluation.author.avatarPath, `${B}/${AVATAR}`); assert.equal(evaluation.score, 8);
      assert.equal(evaluation.text, ''); assert.equal(evaluation.revision, 1); assert.equal(evaluation.postId, source.postId);
      assert.ok(evaluation.createdAt); assert.equal(evaluation.updatedAt.slice(0, 10), evaluation.createdAt.slice(0, 10));
      const page = await list(C, source.postId);
      assert.equal(mapReviewCommunityEvaluations(page, source.postId).evaluations[0].id, evaluation.id);
      assert.equal(page.totalCount, 1); assert.equal(page.evaluations[0].id, evaluation.id);
      assert.equal((await publicPost(C, source.postId)).commentCount, 2);
      assert.doesNotMatch(JSON.stringify(page), /private_email|example.invalid|review_revision/);
      assert.deepEqual(await rows('select id,user_id,text,review_data,review_revision from public.review_logs'), before, 'community writes never modify another user source');
    });

    await t.test('missing and switched expected accounts, anonymous calls and forged authors are rejected', async () => {
      const calls = [
        ['fetch_review_community_evaluations', [source.postId, 20, null, null]],
        ['save_review_community_evaluation', [source.postId, id(), 0, JSON.stringify(draft())]],
        ['delete_review_community_evaluation', [source.postId, evaluation.id, 1]],
      ];
      for (const [name, args] of calls) {
        await denied(() => rawRpc(B, name, args));
        await denied(() => rawRpc(B, name, [...args, A]));
        await denied(() => as(null, `select public.${name}(${[...args, B].map((_, i) => `$${i + 1}`).join(',')})`, [...args, B], 'anon'));
      }
      await denied(() => save(B, source.postId, id(), 0, draft({ authorId: A })));
      await denied(() => save(B, source.postId, id(), 0, draft({ author_id: A })));
      for (const score of [0, 11, -1, 1.5, '8', true]) await denied(() => save(B, source.postId, id(), 0, draft({ score })), '22023');
      await denied(() => save(B, source.postId, id(), 0, draft({ score: null })), '22023');
      await denied(() => save(B, source.postId, id(), 0, draft({ date: '2026-02-30' })), '22023');
      await denied(() => save(B, source.postId, id(), 0, draft({ text: 'a'.repeat(50001) })), '22023');
      await denied(() => save(B, source.postId, id(), 0, draft({ images: [{ path: `${C}/${IMAGE}`, mimeType: 'image/png', size: 10 }] })), '22023');
    });

    await t.test('CAS prevents overwrites, retries are idempotent, and nobody can edit or delete another reviewer', async () => {
      const parentBefore = await publicPost(C, source.postId);
      assert.deepEqual(await save(B, source.postId, evaluation.id), evaluation);
      assert.equal((await publicPost(C, source.postId)).updatedAt, parentBefore.updatedAt);
      const changed = await save(B, source.postId, evaluation.id, evaluation.revision, draft({ text: 'Updated review', score: 9 }));
      assert.equal(changed.revision, 2); assert.equal(changed.createdAt, evaluation.createdAt);
      const parentAfter = await publicPost(C, source.postId);
      assert.notEqual(parentAfter.updatedAt, parentBefore.updatedAt);
      assert.equal(parentAfter.publishedAt, parentBefore.publishedAt);
      assert.deepEqual(await save(B, source.postId, evaluation.id, 1, draft({ text: 'Updated review', score: 9 })), changed);
      assert.equal((await publicPost(C, source.postId)).updatedAt, parentAfter.updatedAt);
      await denied(() => save(B, source.postId, evaluation.id, 1, draft({ score: 3 })), '40001');
      await denied(() => remove(B, source.postId, evaluation), '40001');
      for (const user of [A, C]) {
        await denied(() => save(user, source.postId, evaluation.id, 2, draft({ score: 1 })));
        await denied(() => remove(user, source.postId, changed));
      }
      evaluation = changed;
    });

    await t.test('safe saved attachments and exact reviewer avatar are public without raw finance or foreign image leakage', async () => {
      const rich = draft({ text: 'Public review', score: 10, tags: ['按计划执行', '自定义'], mood: '冷静', stocks: ['NVDA'],
        images: [{ path: `${B}/${IMAGE}`, name: 'own.png', mimeType: 'image/png', size: 128, token: 'secret-image-token' }],
        market: { kind: 'market_snapshot', basis: 'close', asOfDate: '2026-11-06', recordDate: '2026-11-08', accountId: 'secret-market-account', items: [{ key: 'vix', value: 25 }] },
        account: { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report', asOfDate: '2026-11-06', recordDate: '2026-11-08', sourceSnapshotId: 'secret-source-id', capturedAt: '2026-11-08T01:00:00Z', rawCash: 999999, items: [{ key: 'cumulativeReturnPct', value: 3.39, asOfDate: '2026-11-06', basis: 'close', source: 'pnl_report' }] },
        trades: [{ id: 12, symbol: 'NVDA', date: '2026-11-06', side: 'buy', price: 187.5, shares: 2, accountId: 'secret-trade-account' }],
        privateCredential: 'secret-credential', author: { nickname: 'Impersonation' }, createdAt: '1999-01-01T00:00:00Z',
      });
      evaluation = await save(B, source.postId, evaluation.id, evaluation.revision, rich);
      const mapped = mapReviewCommunityEvaluation(evaluation, source.postId);
      assert.equal(mapped.account.items[0].value, 3.39); assert.equal(mapped.trades[0].shares, 2);
      assert.equal(mapped.market.items[0].value, 25); assert.equal(mapped.images[0].path, `${B}/${IMAGE}`);
      assert.equal(evaluation.author.nickname, 'Reviewer'); assert.notEqual(evaluation.createdAt, rich.createdAt);
      assert.equal(evaluation.account.items[0].value, 3.39); assert.equal(evaluation.trades[0].shares, 2);
      assert.equal(evaluation.market.items[0].value, 25); assert.equal(evaluation.images[0].path, `${B}/${IMAGE}`);
      assert.doesNotMatch(JSON.stringify(evaluation), /secret-|rawCash|Impersonation|sourceSnapshotId|capturedAt/);
      assert.deepEqual((await as(C, 'select bucket_id,name from storage.objects order by bucket_id,name')).map(row => row.name).sort(), [`${B}/${AVATAR}`, `${B}/${IMAGE}`, `${C}/${IMAGE}`].sort());
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['review-journal-images', `${C}/${IMAGE}`]), false, 'viewer own storage access is separate from public attachment authorization');
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['unrelated', `${B}/${IMAGE}`]), false);
    });

    await t.test('withdrawal keeps evaluations privately for the post author and re-publication restores them', async () => {
      await visibility(source, 'private');
      assert.equal(await publicPost(B, source.postId), null);
      const own = await list(A, source.postId); assert.equal(own.evaluations[0].id, evaluation.id);
      assert.equal(own.evaluations[0].account.items[0].value, 3.39);
      for (const user of [B, C]) {
        await denied(() => list(user, source.postId), 'P0002');
        await denied(() => save(user, source.postId, id()), 'P0002');
        await denied(() => save(user, source.postId, evaluation.id, evaluation.revision, draft()), 'P0002');
        await denied(() => remove(user, source.postId, evaluation), 'P0002');
      }
      assert.equal(await rawRpc(A, 'review_public_asset_visible', ['review-journal-images', `${B}/${IMAGE}`]), true);
      assert.equal(await rawRpc(A, 'review_public_asset_visible', ['community-avatars', `${B}/${AVATAR}`]), true);
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['review-journal-images', `${B}/${IMAGE}`]), false);
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['community-avatars', `${B}/${AVATAR}`]), false);
      assert.deepEqual((await as(C, 'select name from storage.objects')).map(row => row.name), [`${C}/${IMAGE}`]);
      const authorOwn = await save(A, source.postId, id(), 0, draft({ text: 'Private author evaluation' }));
      await remove(A, source.postId, authorOwn);
      await visibility(source, 'public');
      assert.equal((await list(C, source.postId)).evaluations[0].id, evaluation.id);
      assert.equal((await publicPost(C, source.postId)).commentCount, 2);
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['review-journal-images', `${B}/${IMAGE}`]), true);
    });

    await t.test('deletion clears payload and permissions, is idempotent, and old creates cannot resurrect it', async () => {
      const removed = await remove(B, source.postId, evaluation);
      assert.deepEqual(removed, { id: evaluation.id, postId: source.postId, deleted: true });
      const parentAfter = await publicPost(C, source.postId);
      assert.deepEqual(await remove(B, source.postId, evaluation), removed);
      assert.equal((await publicPost(C, source.postId)).updatedAt, parentAfter.updatedAt);
      assert.equal((await list(C, source.postId)).totalCount, 0);
      assert.equal((await publicPost(C, source.postId)).commentCount, 1);
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['review-journal-images', `${B}/${IMAGE}`]), false);
      assert.equal(await rawRpc(C, 'review_public_asset_visible', ['community-avatars', `${B}/${AVATAR}`]), false);
      const [internal] = await rows('select payload,deleted_at from public.review_community_evaluations where id=$1', [evaluation.id]);
      assert.deepEqual(internal.payload, {}); assert.ok(internal.deleted_at);
      await denied(() => save(B, source.postId, evaluation.id), 'P0002');
    });

    await t.test('keyset pagination preserves microseconds and works for numeric insight IDs', async () => {
      const insight = await insert(A, 'insight');
      const first = await save(B, insight.postId, id(), 0, draft({ text: 'first' }));
      const second = await save(C, insight.postId, id(), 0, draft({ text: 'second' }));
      await rows("update public.review_community_evaluations set created_at='2026-11-08T01:02:03.123456Z' where id=any($1::uuid[])", [[first.id, second.id]]);
      const page = await list(A, insight.postId, 1); assert.equal(page.hasMore, true); assert.equal(page.totalCount, 2);
      assert.equal(mapReviewCommunityEvaluations(page, insight.postId).evaluations[0].postId, insight.postId);
      assert.match(page.nextCursor.createdAt, /123456/);
      const next = await list(A, insight.postId, 1, page.nextCursor); assert.equal(next.hasMore, false); assert.notEqual(next.evaluations[0].id, page.evaluations[0].id);
      for (let index = 0; index < 20; index++) await save(B, insight.postId, id());
      const bounded = await list(A, insight.postId, 999);
      assert.equal(bounded.evaluations.length, 20); assert.equal(bounded.hasMore, true);
      assert.equal(mapReviewCommunityEvaluations(bounded, insight.postId).totalCount, 22);
      await denied(() => rpc(A, 'fetch_review_community_evaluations', [insight.postId, 20, null, first.id]), '22023');
      await as(A, 'delete from public.disciplines where id=$1', [insight.id]);
      assert.equal((await rows('select count(*)::int as n from public.review_community_evaluations where post_id=$1', [insight.postId]))[0].n, 0);
      await denied(() => list(A, insight.postId), 'P0002');
    });

    await t.test('source deletion removes live rows and retry tombstones, and timeline containers stay private', async () => {
      await save(C, source.postId, id());
      await as(A, 'delete from public.review_logs where id=$1', [source.id]);
      assert.equal((await rows('select count(*)::int as n from public.review_community_evaluations where post_id=$1', [source.postId]))[0].n, 0);
      for (const user of [A, B, C]) await denied(() => list(user, source.postId), 'P0002');
      const timeline = await insert(A, 'log', metadata({ timelineEvent: { id: 'private-event' } }));
      for (const user of [A, B, C]) await denied(() => save(user, timeline.postId, id()), 'P0002');
      assert.deepEqual((await rows('select public from storage.buckets')).map(row => row.public), [false, false, false]);
    });
  } finally { await db.close(); }
});
