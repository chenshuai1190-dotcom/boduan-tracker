-- Apply before the runtime with independent return drawdown and annual high/low visibility.
-- Keep the original event_types contract compatible with installed older clients.
begin;
set local lock_timeout = '5s';

alter table public.review_display_preferences
  add column if not exists show_return_drawdown boolean default null,
  add column if not exists show_annual_return_high boolean default null,
  add column if not exists show_annual_return_low boolean default null,
  add column if not exists show_annual_pnl_high boolean default null,
  add column if not exists show_annual_pnl_low boolean default null;

do $$
declare
  column_name text;
begin
  foreach column_name in array array['show_return_drawdown','show_annual_return_high','show_annual_return_low','show_annual_pnl_high','show_annual_pnl_low'] loop
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.review_display_preferences'::regclass
        and attname = column_name and atttypid = 'boolean'::regtype
        and not attnotnull and not attisdropped
    ) then
      raise exception 'preference % must be a nullable boolean', column_name;
    end if;
    if exists (
      select 1 from pg_attrdef d join pg_attribute a
        on a.attrelid=d.adrelid and a.attnum=d.adnum
      where a.attrelid='public.review_display_preferences'::regclass
        and a.attname=column_name
        and pg_get_expr(d.adbin,d.adrelid) <> 'NULL::boolean'
    ) then
      raise exception 'preference % must default to NULL for older clients', column_name;
    end if;
  end loop;
end;
$$;

comment on column public.review_display_preferences.show_return_drawdown is
  'NULL inherits the legacy drawdown category; true/false independently controls return-peak declines. Old clients omit this column and preserve explicit selections.';
comment on column public.review_display_preferences.show_annual_return_high is
  'NULL enables year-to-date return highs by default; true/false records an explicit independent selection.';
comment on column public.review_display_preferences.show_annual_return_low is
  'NULL enables year-to-date return lows by default; true/false records an explicit independent selection.';
comment on column public.review_display_preferences.show_annual_pnl_high is
  'NULL enables year-to-date profit highs by default; true/false records an explicit independent selection.';
comment on column public.review_display_preferences.show_annual_pnl_low is
  'NULL enables year-to-date profit lows by default; true/false records an explicit independent selection.';

-- No row backfill, revision reset, business-data write, grant or policy change.
notify pgrst, 'reload schema';
commit;

-- Privacy-safe schema and permissions postflight.
select a.attname as preference_column, a.atttypid='boolean'::regtype and not a.attnotnull as nullable_boolean,
  c.relrowsecurity as owner_rls_enabled,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename='review_display_preferences') as owner_policy_count,
  has_table_privilege('anon','public.review_display_preferences','select') as anonymous_can_read,
  has_table_privilege('authenticated','public.review_display_preferences','delete') as authenticated_can_delete
from pg_attribute a join pg_class c on c.oid=a.attrelid
where a.attrelid='public.review_display_preferences'::regclass
  and a.attname in ('show_return_drawdown','show_annual_return_high','show_annual_return_low','show_annual_pnl_high','show_annual_pnl_low') and not a.attisdropped
order by a.attname;
