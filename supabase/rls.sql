-- Apply in the Supabase SQL editor after verifying these are the production tables.
-- Every user-owned table must have a user_id column containing auth.uid().

begin;

create table if not exists public.stock_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null default '',
  side text not null check (side in ('buy', 'sell')),
  trade_date date not null,
  price numeric(18, 6) not null check (price > 0),
  shares numeric(18, 6) not null check (shares > 0),
  fee numeric(18, 6) not null default 0 check (fee >= 0),
  currency text not null default 'USD',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_trades_user_date_idx
on public.stock_trades (user_id, trade_date, created_at);

create index if not exists stock_trades_user_symbol_idx
on public.stock_trades (user_id, symbol);

alter table public.trades enable row level security;
alter table public.stock_trades enable row level security;
alter table public.watchlist enable row level security;
alter table public.wave_notes enable row level security;
alter table public.user_settings enable row level security;
alter table public.accounts enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.investment_plan enable row level security;
alter table public.margin_status enable row level security;
alter table public.disciplines enable row level security;
alter table public.review_logs enable row level security;
alter table public.yearly_actuals enable row level security;
alter table public.cost_basis_trades enable row level security;

drop policy if exists "users can manage own trades" on public.trades;
create policy "users can manage own trades"
on public.trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own stock trades" on public.stock_trades;
create policy "users can manage own stock trades"
on public.stock_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own watchlist" on public.watchlist;
create policy "users can manage own watchlist"
on public.watchlist
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own wave notes" on public.wave_notes;
create policy "users can manage own wave notes"
on public.wave_notes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own settings" on public.user_settings;
create policy "users can manage own settings"
on public.user_settings
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own accounts" on public.accounts;
create policy "users can manage own accounts"
on public.accounts
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own balance snapshots" on public.balance_snapshots;
create policy "users can manage own balance snapshots"
on public.balance_snapshots
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own investment plan" on public.investment_plan;
create policy "users can manage own investment plan"
on public.investment_plan
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own margin status" on public.margin_status;
create policy "users can manage own margin status"
on public.margin_status
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own disciplines" on public.disciplines;
create policy "users can manage own disciplines"
on public.disciplines
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own review logs" on public.review_logs;
create policy "users can manage own review logs"
on public.review_logs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own yearly actuals" on public.yearly_actuals;
create policy "users can manage own yearly actuals"
on public.yearly_actuals
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own cost basis trades" on public.cost_basis_trades;
create policy "users can manage own cost basis trades"
on public.cost_basis_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
