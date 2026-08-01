-- Contract phase for the P&L report immediate-rebuild rollout.
--
-- DO NOT apply this file before the runtime using
-- write_pnl_report_snapshot_if_current / replace_pnl_report_dirty_range is
-- deployed and verified. The additive foundation migration must be applied
-- first so the previous browser and scheduled writer remain compatible during
-- the application rollout.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Once the new runtime is active, live P&L destinations become owner-scoped
-- read models. All writes are then performed by guarded SECURITY DEFINER RPCs.
revoke all privileges on table public.pnl_report_snapshots
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_symbol_snapshots
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_rebuild_state
from public, anon, authenticated, service_role;

grant select on table public.pnl_report_snapshots
to authenticated, service_role;

grant select on table public.pnl_report_symbol_snapshots
to authenticated, service_role;

grant select on table public.pnl_report_rebuild_state
to authenticated, service_role;

drop policy if exists "users can manage own pnl report snapshots"
on public.pnl_report_snapshots;
drop policy if exists "users can read own pnl report snapshots"
on public.pnl_report_snapshots;
create policy "users can read own pnl report snapshots"
on public.pnl_report_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots;
drop policy if exists "users can read own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots;
create policy "users can read own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report rebuild state"
on public.pnl_report_rebuild_state;
drop policy if exists "users can read own pnl report rebuild state"
on public.pnl_report_rebuild_state;
create policy "users can read own pnl report rebuild state"
on public.pnl_report_rebuild_state
for select
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
