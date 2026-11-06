-- Additive custom-avatar migration; independent of private review attachments.
-- Preflight: inspect existing community_profiles columns, all Storage policies,
-- and any pre-existing bucket named community-avatars before applying.
-- Preserve avatar_key as the old-client/preset fallback. Do not store signed URLs.
begin;

alter table public.community_profiles
  add column if not exists avatar_path text;

alter table public.community_profiles
  drop constraint if exists community_profiles_avatar_path_check;
alter table public.community_profiles
  add constraint community_profiles_avatar_path_check check (
    avatar_path is null or avatar_path ~ (
      '^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$'
    )
  );

-- Profile RLS/grants remain unchanged: direct browser reads and writes are owner-only.
-- Existing authenticated competition APIs may sign another participant's image
-- server-side only when returning that participant's already-authorized identity.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "community avatar own read" on storage.objects;
create policy "community avatar own read" on storage.objects for select to authenticated
  using (bucket_id = 'community-avatars'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$'));

drop policy if exists "community avatar own insert" on storage.objects;
create policy "community avatar own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-avatars'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$'));

drop policy if exists "community avatar own update" on storage.objects;
create policy "community avatar own update" on storage.objects for update to authenticated
  using (bucket_id = 'community-avatars'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$'))
  with check (bucket_id = 'community-avatars'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$'));

drop policy if exists "community avatar own delete" on storage.objects;
create policy "community avatar own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'community-avatars'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$'));

commit;
