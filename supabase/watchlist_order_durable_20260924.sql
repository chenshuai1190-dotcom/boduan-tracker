-- Keep each user's watchlist order independent from whole-document settings writes.
-- Existing user_settings owner RLS applies to this column.

begin;

alter table public.user_settings
add column if not exists watchlist_order text[];

-- Migrate only valid arrays of strings, retaining their original positions.
-- Rows already holding a durable order are never overwritten on a rerun.
update public.user_settings as settings
set watchlist_order = array(
  select item.value #>> '{}'
  from jsonb_array_elements(settings.data -> 'watchlistOrder')
    with ordinality as item(value, position)
  order by item.position
)
where settings.watchlist_order is null
  and jsonb_typeof(settings.data -> 'watchlistOrder') = 'array'
  and not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(settings.data -> 'watchlistOrder') = 'array'
          then settings.data -> 'watchlistOrder'
        else '[]'::jsonb
      end
    ) as item(value)
    where jsonb_typeof(item.value) <> 'string'
  );

comment on column public.user_settings.watchlist_order is
'User-authored watchlist symbol order; separate from JSON settings to prevent unrelated saves from overwriting it.';

notify pgrst, 'reload schema';

commit;
