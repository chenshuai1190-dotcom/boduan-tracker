-- Durable, privacy-safe publication boundary for completed server snapshots.
-- Browsers cannot read this table directly; authenticated clients use the
-- existing protected API, which returns only these four non-user fields.

begin;

create table if not exists public.snapshot_publication_markers (
  channel text not null,
  snapshot_date date not null,
  version text not null,
  completed_at timestamptz not null,

  constraint snapshot_publication_markers_pkey
    primary key (channel, snapshot_date),
  constraint snapshot_publication_markers_channel_check
    check (channel = 'competition'),
  constraint snapshot_publication_markers_version_check
    check (version ~ '^[A-Za-z0-9_-]{16,128}$')
);

create index if not exists snapshot_publication_markers_latest_idx
on public.snapshot_publication_markers (channel, snapshot_date desc);

create or replace function public.set_snapshot_publication_marker_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- Database time is the ordering authority for same-day republishes. This
  -- prevents two concurrent workers from writing timestamps out of order.
  new.completed_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_snapshot_publication_marker_completed_at()
from public, anon, authenticated, service_role;

drop trigger if exists set_snapshot_publication_marker_completed_at
on public.snapshot_publication_markers;

create trigger set_snapshot_publication_marker_completed_at
before insert or update on public.snapshot_publication_markers
for each row execute function public.set_snapshot_publication_marker_completed_at();

alter table public.snapshot_publication_markers enable row level security;
alter table public.snapshot_publication_markers force row level security;

revoke all privileges on table public.snapshot_publication_markers
from public, anon, authenticated, service_role;

grant select, insert, update
on table public.snapshot_publication_markers
to service_role;

notify pgrst, 'reload schema';

commit;
