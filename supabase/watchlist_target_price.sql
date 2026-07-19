-- Add one canonical USD target price to each user-owned watchlist row.
-- Apply this migration before deploying code that reads target_price_usd.
-- Existing watchlist owner RLS remains the only browser access boundary.

begin;

alter table public.watchlist
add column if not exists target_price_usd numeric(18, 6);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watchlist_target_price_usd_positive_check'
      and conrelid = 'public.watchlist'::regclass
  ) then
    alter table public.watchlist
    add constraint watchlist_target_price_usd_positive_check
    check (target_price_usd is null or target_price_usd > 0);
  end if;
end;
$$;

comment on column public.watchlist.target_price_usd is
'User-authored watchlist target in canonical USD; never a trade-ledger input.';

notify pgrst, 'reload schema';

commit;
