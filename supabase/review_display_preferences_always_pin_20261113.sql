-- Apply after the existing owner-only review display preferences migrations.
-- These two selections are independent of ordinary post pins and the timeline.
begin;
set local lock_timeout = '5s';

alter table public.review_display_preferences
  add column if not exists always_pinned_log_id text default null,
  add column if not exists always_pinned_insight_id text default null;

do $migration$
declare
  preference_table regclass := 'public.review_display_preferences'::regclass;
  column_name text;
begin
  foreach column_name in array array['always_pinned_log_id', 'always_pinned_insight_id'] loop
    if not exists (
      select 1 from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = preference_table and a.attname = column_name and a.atttypid = 'text'::regtype
        and not a.attnotnull and not a.attisdropped and a.attacl is null
        and (d.oid is null or pg_get_expr(d.adbin, d.adrelid) = 'NULL::text')
    ) then
      raise exception 'review preference % must be nullable text with NULL default and no column grants', column_name;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = preference_table)
    or has_table_privilege('anon', preference_table, 'SELECT,INSERT,UPDATE,DELETE')
    or not has_table_privilege('authenticated', preference_table, 'SELECT')
    or not has_table_privilege('authenticated', preference_table, 'INSERT')
    or not has_table_privilege('authenticated', preference_table, 'UPDATE')
    or has_table_privilege('authenticated', preference_table, 'DELETE') then
    raise exception 'review display preferences must retain their owner-only RLS and grants';
  end if;
end;
$migration$;

-- Source IDs support numeric legacy IDs and UUIDs without precision loss.
alter table public.review_display_preferences
  drop constraint if exists review_display_preferences_always_pinned_log_id_check,
  add constraint review_display_preferences_always_pinned_log_id_check check (
    length(always_pinned_log_id) between 1 and 100
    and always_pinned_log_id collate "C" !~ '[^A-Za-z0-9_-]'
  ),
  drop constraint if exists review_display_preferences_always_pinned_insight_id_check,
  add constraint review_display_preferences_always_pinned_insight_id_check check (
    length(always_pinned_insight_id) between 1 and 100
    and always_pinned_insight_id collate "C" !~ '[^A-Za-z0-9_-]'
  );

comment on column public.review_display_preferences.always_pinned_log_id is
  'Owner-selected source ID first in Review Journals; NULL disables this selection. Older clients need not write this column.';
comment on column public.review_display_preferences.always_pinned_insight_id is
  'Owner-selected source ID first in Investment Insights; NULL disables this selection. Older clients need not write this column.';

notify pgrst, 'reload schema';
commit;

-- Privacy-safe postflight. No user identifiers or preference values.
select a.attname as preference_column,
  a.atttypid = 'text'::regtype and not a.attnotnull and a.attacl is null as owner_nullable_text,
  c.relrowsecurity as owner_rls_enabled,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'review_display_preferences') as owner_policy_count,
  has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_read,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_can_delete,
  exists(select 1 from pg_constraint k where k.conrelid = c.oid and k.conname = 'review_display_preferences_' || a.attname || '_check'
    and k.contype = 'c' and k.convalidated) as source_id_check_valid
from pg_attribute a join pg_class c on c.oid = a.attrelid
where a.attrelid = 'public.review_display_preferences'::regclass
  and a.attname in ('always_pinned_log_id', 'always_pinned_insight_id') and not a.attisdropped
order by a.attname;
