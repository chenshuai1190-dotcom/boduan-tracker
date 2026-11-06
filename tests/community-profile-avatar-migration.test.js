// Optional in-memory PostgreSQL verification. No .env, network or production data.
// PGLITE_MODULE_FILE=/absolute/path/to/pglite/dist/index.js node --test tests/community-profile-avatar-migration.test.js
// Storage service and auth.uid() are local schema fixtures, not HTTP verification.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleFile = process.env.PGLITE_MODULE_FILE;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const IMAGE = '33333333-3333-4333-8333-333333333333';

test('custom avatar migration preserves profile compatibility and private owner isolation', {
  skip: !moduleFile && 'Set PGLITE_MODULE_FILE to a local PGlite install; no server is contacted.',
}, async t => {
  assert.ok(isAbsolute(moduleFile));
  const { PGlite } = await import(pathToFileURL(moduleFile).href);
  const db = await PGlite.create();
  const sql = await readFile(new URL('../supabase/community-profile-avatar.sql', import.meta.url), 'utf8');
  const rows = async (query, params = []) => (await db.query(query, params)).rows;
  const denied = (fn, code = '42501') => assert.rejects(fn, error => error.code === code);
  async function asUser(userId, query, params = [], role = 'authenticated') {
    assert.ok(['authenticated', 'anon'].includes(role));
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || '']);
      return await rows(query, params);
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub','',false)");
    }
  }
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create table public.community_profiles (
        user_id uuid primary key, nickname text not null, avatar_key text not null default 'gold',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        profile_completed_at timestamptz,
        constraint community_profiles_avatar_key_check check (avatar_key in ('gold', 'blue'))
      );
      alter table public.community_profiles enable row level security;
      grant select, insert, update on public.community_profiles to anon, authenticated;
      create policy "authenticated can read community profiles" on public.community_profiles for select to authenticated using(auth.uid()=user_id);
      create policy "users can insert own community profile" on public.community_profiles for insert to authenticated with check(auth.uid()=user_id);
      create policy "users can update own community profile" on public.community_profiles for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create schema storage;
      create table storage.buckets(id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id), name text not null, unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      insert into storage.buckets(id,name,public) values('review-journal-images','review-journal-images',false);
    `);
    await db.query("insert into public.community_profiles(user_id,nickname,avatar_key) values($1,'测试用户甲','blue'),($2,'测试用户乙','gold')", [A, B]);
    const before = await rows('select * from public.community_profiles order by user_id');
    const policiesBefore = await rows("select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='community_profiles' order by policyname");

    await t.test('migration is additive, repeatable and retains all profile policies and preset constraints', async () => {
      await db.exec(sql);
      await db.exec(sql);
      const after = await rows('select * from public.community_profiles order by user_id');
      assert.deepEqual(after.map(({ avatar_path, ...rest }) => { assert.equal(avatar_path, null); return rest; }), before);
      assert.deepEqual(await rows("select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='community_profiles' order by policyname"), policiesBefore);
      await denied(() => asUser(A, "update public.community_profiles set avatar_key='custom' where user_id=$1", [A]), '23514');
      const [bucket] = await rows("select * from storage.buckets where id='community-avatars'");
      assert.equal(bucket.public, false);
      assert.equal(Number(bucket.file_size_limit), 2097152);
      assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp']);
    });

    await t.test('avatar_path admits only owner UUID objects and retains old-client text updates', async () => {
      const path = `${A}/${IMAGE}.webp`;
      const [saved] = await asUser(A, 'update public.community_profiles set avatar_path=$2 where user_id=$1 returning *', [A, path]);
      assert.equal(saved.avatar_key, 'blue');
      for (const invalid of [`${B}/${IMAGE}.webp`, `https://invalid.example/${path}`, `${A}/nested/${IMAGE}.webp`, `${A}/${IMAGE}.svg`, '']) {
        await denied(() => asUser(A, 'update public.community_profiles set avatar_path=$2 where user_id=$1', [A, invalid]), '23514');
      }
      const [legacy] = await asUser(A, "update public.community_profiles set nickname='旧版昵称' where user_id=$1 returning avatar_path", [A]);
      assert.equal(legacy.avatar_path, path);
      const snapshot = await rows('select * from public.community_profiles order by user_id');
      await db.exec(sql);
      assert.deepEqual(await rows('select * from public.community_profiles order by user_id'), snapshot);
      assert.equal((await asUser(A, 'select user_id from public.community_profiles')).length, 1);
      assert.deepEqual(await asUser(B, 'update public.community_profiles set avatar_path=null where user_id=$1 returning user_id', [A]), []);
      assert.deepEqual(await asUser(null, 'select * from public.community_profiles', [], 'anon'), []);
    });

    await t.test('avatar Storage prevents foreign, nested, anonymous and other-bucket writes', async () => {
      const pathA = `${A}/${IMAGE}.webp`;
      const pathB = `${B}/${IMAGE}.jpg`;
      const put = (user, path, bucket = 'community-avatars', role = 'authenticated') => asUser(user,
        'insert into storage.objects(bucket_id,name) values($1,$2) returning name', [bucket, path], role);
      await put(A, pathA); await put(B, pathB);
      assert.deepEqual(await asUser(A, 'select name from storage.objects'), [{ name: pathA }]);
      assert.deepEqual(await asUser(B, 'select name from storage.objects'), [{ name: pathB }]);
      for (const badPath of [`${B}/${A}.webp`, `${A}/nested/${IMAGE}.webp`, `${A}/photo.svg`, `${A}/${IMAGE}.webp/extra`]) {
        await denied(() => put(A, badPath));
      }
      await denied(() => put(A, `${A}/${B}.webp`, 'review-journal-images'));
      await denied(() => put(null, `${A}/${B}.webp`, 'community-avatars', 'anon'));
      await denied(() => asUser(A, 'update storage.objects set name=$2 where name=$1', [pathA, `${B}/${A}.webp`]));
      assert.deepEqual(await asUser(A, 'delete from storage.objects where name=$1 returning name', [pathB]), []);
      assert.deepEqual(await asUser(null, 'select name from storage.objects', [], 'anon'), []);
      assert.deepEqual(await asUser(A, 'delete from storage.objects where name=$1 returning name', [pathA]), [{ name: pathA }]);
      assert.deepEqual(await asUser(B, 'select name from storage.objects'), [{ name: pathB }]);
      assert.equal((await asUser(A, 'update public.community_profiles set avatar_path=null where user_id=$1 returning avatar_path', [A]))[0].avatar_path, null);
    });
  } finally {
    await db.close();
  }
});
