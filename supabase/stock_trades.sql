-- Create the independent main stock trading ledger.
-- Apply this in the production Supabase SQL editor before deploying the app
-- version that reads/writes stock_trades.

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

alter table public.stock_trades enable row level security;

drop policy if exists "users can manage own stock trades" on public.stock_trades;
create policy "users can manage own stock trades"
on public.stock_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
