-- Local migration proposal. Apply deliberately before enabling rich review writes.
-- Existing tables and primary-key types remain unchanged; no historical rows move.
begin;

alter table public.disciplines
  add column if not exists review_data jsonb not null default '{}'::jsonb,
  add column if not exists review_revision integer not null default 0;
alter table public.review_logs
  add column if not exists review_data jsonb not null default '{}'::jsonb,
  add column if not exists review_revision integer not null default 0;

alter table public.disciplines drop constraint if exists disciplines_review_data_check;
alter table public.disciplines add constraint disciplines_review_data_check
  check (jsonb_typeof(review_data) = 'object' and octet_length(review_data::text) < 2097152);
alter table public.disciplines drop constraint if exists disciplines_review_revision_check;
alter table public.disciplines add constraint disciplines_review_revision_check check (review_revision >= 0);
alter table public.review_logs drop constraint if exists review_logs_review_data_check;
alter table public.review_logs add constraint review_logs_review_data_check
  check (jsonb_typeof(review_data) = 'object' and octet_length(review_data::text) < 2097152);
alter table public.review_logs drop constraint if exists review_logs_review_revision_check;
alter table public.review_logs add constraint review_logs_review_revision_check check (review_revision >= 0);

-- The same draft retains its operationId through an uncertain network result.
-- Existing rows have no operationId and are unaffected by these partial indexes.
create unique index if not exists disciplines_review_operation_uidx
  on public.disciplines (user_id, (review_data ->> 'operationId'))
  where review_data ->> 'operationId' is not null;
create unique index if not exists review_logs_review_operation_uidx
  on public.review_logs (user_id, (review_data ->> 'operationId'))
  where review_data ->> 'operationId' is not null;

-- Legacy plain-text updates also advance the revision, so a newer rich editor
-- cannot silently overwrite an intervening save from an older app version.
create or replace function public.bump_review_journal_revision()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if (old.review_data ->> 'operationId') is not null
     and (new.review_data ->> 'operationId') is distinct from (old.review_data ->> 'operationId') then
    raise exception 'review operation identity cannot change' using errcode = '23514';
  end if;
  if old.review_revision = 2147483647 then
    raise exception 'review revision exhausted' using errcode = '22003';
  end if;
  if new.review_revision = old.review_revision then
    new.review_revision := old.review_revision + 1;
  elsif new.review_revision <> old.review_revision + 1 then
    raise exception 'invalid review revision' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.bump_review_journal_revision() from public, anon, authenticated;

drop trigger if exists disciplines_review_revision on public.disciplines;
create trigger disciplines_review_revision before update on public.disciplines
  for each row execute function public.bump_review_journal_revision();
drop trigger if exists review_logs_review_revision on public.review_logs;
create trigger review_logs_review_revision before update on public.review_logs
  for each row execute function public.bump_review_journal_revision();

alter table public.disciplines enable row level security;
alter table public.review_logs enable row level security;
drop policy if exists "users can manage own disciplines" on public.disciplines;
create policy "users can manage own disciplines" on public.disciplines for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users can manage own review logs" on public.review_logs;
create policy "users can manage own review logs" on public.review_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private attachments, owned by their authenticated user's first path segment.
-- Signed URLs are short-lived UI results, never values stored in review_data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-journal-images', 'review-journal-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "review journal own image read" on storage.objects;
create policy "review journal own image read" on storage.objects for select to authenticated
  using (bucket_id = 'review-journal-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1);
drop policy if exists "review journal own image insert" on storage.objects;
create policy "review journal own image insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-journal-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1);
drop policy if exists "review journal own image update" on storage.objects;
create policy "review journal own image update" on storage.objects for update to authenticated
  using (bucket_id = 'review-journal-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1)
  with check (bucket_id = 'review-journal-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1);
drop policy if exists "review journal own image delete" on storage.objects;
create policy "review journal own image delete" on storage.objects for delete to authenticated
  using (bucket_id = 'review-journal-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1);

commit;
