-- Apply before deploying the investment-dynamic display preferences runtime.
-- Additive, owner-only display preferences; no account values or journal data.
begin;
set local lock_timeout = '5s';

create table if not exists public.review_display_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_timeline boolean not null default true,
  currency text not null default 'USD' check (currency in ('USD', 'CNY')),
  event_types text[] not null default array['net_assets_high','return_high','pnl_high','drawdown','daily_record','month','quarter','year']::text[],
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_display_preferences_event_types_valid check (
    cardinality(event_types) <= 8
    and array_position(event_types, null) is null
    and event_types <@ array['net_assets_high','return_high','pnl_high','drawdown','daily_record','month','quarter','year']::text[]
  )
);

-- IF NOT EXISTS must not silently accept a different pre-existing table.
do $$
declare
  matching_columns integer;
  owner_column smallint;
  auth_id_column smallint;
begin
  select count(*) into matching_columns
  from (values
    ('user_id', 'uuid'::regtype), ('show_timeline', 'boolean'::regtype),
    ('currency', 'text'::regtype), ('event_types', 'text[]'::regtype),
    ('revision', 'integer'::regtype), ('created_at', 'timestamptz'::regtype),
    ('updated_at', 'timestamptz'::regtype)
  ) as expected(name, type_oid)
  join pg_attribute a on a.attrelid = 'public.review_display_preferences'::regclass
    and a.attname = expected.name and a.atttypid = expected.type_oid
    and a.attnotnull and not a.attisdropped;
  if matching_columns <> 7 then
    raise exception 'review display preferences schema differs from the expected owner preference contract';
  end if;
  select attnum into owner_column from pg_attribute
    where attrelid = 'public.review_display_preferences'::regclass and attname = 'user_id';
  select attnum into auth_id_column from pg_attribute
    where attrelid = 'auth.users'::regclass and attname = 'id';
  if not exists (select 1 from pg_constraint where conrelid = 'public.review_display_preferences'::regclass
    and contype = 'p' and conkey = array[owner_column]) then
    raise exception 'review display preferences must have exactly one row per owner';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.review_display_preferences'::regclass
    and contype = 'f' and conkey = array[owner_column] and confrelid = 'auth.users'::regclass
    and confkey = array[auth_id_column] and confdeltype = 'c' and convalidated) then
    raise exception 'review display preferences owner must reference auth.users with cascading account removal';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.review_display_preferences'::regclass
    and attacl is not null and not attisdropped) then
    raise exception 'review display preferences has unexpected column grants; inspect before applying';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.review_display_preferences'::regclass
    and polname not in ('users can read own review display preferences',
      'users can insert own review display preferences', 'users can update own review display preferences')) then
    raise exception 'review display preferences has unexpected policies; inspect before applying';
  end if;
end;
$$;

-- Reassert value checks on a repeated application as well as a fresh table.
alter table public.review_display_preferences
  drop constraint if exists review_display_preferences_currency_check,
  add constraint review_display_preferences_currency_check check (currency in ('USD', 'CNY')),
  drop constraint if exists review_display_preferences_revision_check,
  add constraint review_display_preferences_revision_check check (revision >= 0),
  drop constraint if exists review_display_preferences_event_types_valid,
  add constraint review_display_preferences_event_types_valid check (
    cardinality(event_types) <= 8
    and coalesce(array_ndims(event_types), 1) = 1
    and coalesce(array_lower(event_types, 1), 1) = 1
    and array_position(event_types, null) is null
    and event_types <@ array['net_assets_high','return_high','pnl_high','drawdown','daily_record','month','quarter','year']::text[]
  );
alter table public.review_display_preferences enable row level security;
revoke all privileges on table public.review_display_preferences from public, anon, authenticated;
grant select, insert, update on table public.review_display_preferences to authenticated;

drop policy if exists "users can read own review display preferences" on public.review_display_preferences;
create policy "users can read own review display preferences"
on public.review_display_preferences for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can insert own review display preferences" on public.review_display_preferences;
create policy "users can insert own review display preferences"
on public.review_display_preferences for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users can update own review display preferences" on public.review_display_preferences;
create policy "users can update own review display preferences"
on public.review_display_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.review_display_preferences is 'Account-scoped display preferences for investment dynamics; independent of legacy user_settings replacement writes.';
comment on column public.review_display_preferences.revision is 'Optimistic concurrency revision. Clients compare before updating.';
notify pgrst, 'reload schema';
commit;

-- Privacy-safe postflight. No user identifiers or preferences are selected.
select c.relrowsecurity as owner_rls_enabled,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename='review_display_preferences') as owner_policy_count,
  has_table_privilege('anon','public.review_display_preferences','select') as anonymous_can_read,
  has_table_privilege('authenticated','public.review_display_preferences','delete') as authenticated_can_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='review_display_preferences';
