-- Foundation only. This file has NOT been applied to production.
-- Apply only after explicit migration approval and aggregate preflight checks.
-- Public SEC information is shared internally; user watchlist membership,
-- credentials, positions, balances and transaction data are never copied here.
-- Runtime must remain fail-closed / use its existing on-demand path until ready.
begin;

create table if not exists public.sec_earnings_watch_jobs (
  symbol text primary key check (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$' and symbol !~ '\.US$'),
  next_scan_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  lease_revision bigint,
  wake_revision bigint not null default 0 check (wake_revision >= 0),
  last_checked_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'partial', 'unavailable', 'unsupported', 'error', 'idle')),
  reason text check (reason is null or reason ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000000),
  check ((lease_token is null and lease_until is null and lease_revision is null)
    or (lease_token is not null and lease_until is not null and lease_revision is not null))
);

create index if not exists sec_earnings_watch_jobs_due_idx
  on public.sec_earnings_watch_jobs (next_scan_at, symbol);

create table if not exists public.sec_earnings_requested_events (
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$' and symbol !~ '\.US$'),
  provider_fiscal_date date not null,
  report_date date not null,
  parser_version text not null check (parser_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  official_fiscal_date date,
  status text not null default 'pending' check (status in ('pending', 'complete', 'partial', 'unavailable', 'unsupported', 'error')),
  reason text check (reason is null or reason ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  registered_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_attempt_at timestamptz,
  primary key (symbol, provider_fiscal_date, report_date, parser_version),
  check (provider_fiscal_date >= date '2000-01-01'
    and report_date between provider_fiscal_date - 31 and provider_fiscal_date + 180),
  check (official_fiscal_date is null or (official_fiscal_date >= date '2000-01-01'
    and report_date between official_fiscal_date and official_fiscal_date + 180))
);

create index if not exists sec_earnings_requested_events_recent_idx
  on public.sec_earnings_requested_events (symbol, parser_version, report_date desc);

create table if not exists public.sec_earnings_shared_results (
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$' and symbol !~ '\.US$'),
  official_fiscal_date date not null check (official_fiscal_date >= date '2000-01-01'),
  cik text not null check (cik ~ '^[0-9]{10}$' and cik <> '0000000000'),
  accession text not null check (accession ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  document_type text not null check (document_type in ('PRIMARY', 'EX-99.1', 'EX-99.2')),
  parser_version text not null check (parser_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 1048576
    and payload ->> 'status' in ('complete', 'partial')),
  checked_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  primary key (symbol, official_fiscal_date, accession, document_type, parser_version),
  -- Invalidating an older accession may expire it at the same clock instant
  -- it was checked; the payload remains intact for dated stale presentation.
  check (expires_at >= checked_at)
);

create index if not exists sec_earnings_shared_results_recent_idx
  on public.sec_earnings_shared_results (symbol, parser_version, official_fiscal_date desc, checked_at desc);

alter table public.sec_earnings_watch_jobs enable row level security;
alter table public.sec_earnings_requested_events enable row level security;
alter table public.sec_earnings_shared_results enable row level security;
revoke all on table public.sec_earnings_watch_jobs,
  public.sec_earnings_requested_events, public.sec_earnings_shared_results
  from public, anon, authenticated, service_role;
-- Only bounded, symbol-filtered service reads; all writes go through the RPCs.
grant select on table public.sec_earnings_watch_jobs,
  public.sec_earnings_requested_events, public.sec_earnings_shared_results to service_role;

-- Private validation helper; no direct EXECUTE grant, including service_role.
create or replace function public.sec_earnings_normalize_event(p_event jsonb, p_symbol text default null)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  event_symbol text;
  provider_date date;
  event_report_date date;
  official_date date;
begin
  if jsonb_typeof(p_event) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_event) as k(key)
      where k.key not in ('symbol', 'provider_fiscal_date', 'report_date', 'official_fiscal_date', 'status', 'reason', 'expected_accession')) then
    raise exception 'invalid earnings event shape' using errcode = '22023';
  end if;
  event_symbol := regexp_replace(upper(btrim(coalesce(p_event ->> 'symbol', p_symbol))), '\.US$', '');
  if event_symbol is null or event_symbol !~ '^[A-Z][A-Z0-9.-]{0,14}$'
    or (p_symbol is not null and event_symbol <> p_symbol)
    or coalesce(p_event ->> 'provider_fiscal_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_event ->> 'report_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_event ->> 'official_fiscal_date' is not null
      and p_event ->> 'official_fiscal_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or (p_event ->> 'expected_accession' is not null
      and (p_event ->> 'official_fiscal_date' is null
        or p_event ->> 'expected_accession' !~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$')) then
    raise exception 'invalid earnings event identity' using errcode = '22023';
  end if;
  provider_date := (p_event ->> 'provider_fiscal_date')::date;
  event_report_date := (p_event ->> 'report_date')::date;
  official_date := (p_event ->> 'official_fiscal_date')::date;
  if provider_date < date '2000-01-01' or provider_date > current_date + 45
    or event_report_date > current_date + 45
    or event_report_date < provider_date - 31 or event_report_date > provider_date + 180
    or (official_date is not null and (official_date < date '2000-01-01'
      or official_date > current_date or event_report_date < official_date or event_report_date > official_date + 180))
    or coalesce(p_event ->> 'status', 'pending') not in ('pending', 'complete', 'partial', 'unavailable', 'unsupported', 'error')
    or (p_event ->> 'reason' is not null and p_event ->> 'reason' !~ '^[a-z0-9][a-z0-9-]{0,119}$') then
    raise exception 'invalid earnings event period or state' using errcode = '22023';
  end if;
  return jsonb_build_object('symbol', event_symbol, 'provider_fiscal_date', provider_date,
    'report_date', event_report_date, 'official_fiscal_date', official_date,
    'status', coalesce(p_event ->> 'status', 'pending'), 'reason', p_event ->> 'reason',
    'expected_accession', p_event ->> 'expected_accession');
end;
$$;
revoke all on function public.sec_earnings_normalize_event(jsonb, text) from public, anon, authenticated, service_role;

create or replace function public.register_sec_earnings_requested_events(
  p_user_id uuid, p_events jsonb, p_parser_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate jsonb;
  event_row jsonb;
  changed integer;
  registered integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_parser_version is null
    or p_parser_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    or jsonb_typeof(p_events) is distinct from 'array'
    or jsonb_array_length(p_events) > 100 or octet_length(p_events::text) > 131072 then
    raise exception 'invalid earnings registration batch' using errcode = '22023';
  end if;
  -- Lock jobs in symbol order before event rows, matching the worker order.
  -- This avoids registration(event -> job) vs completion(job -> event) deadlocks.
  for candidate in select value from jsonb_array_elements(p_events)
    order by regexp_replace(upper(btrim(value ->> 'symbol')), '\.US$', ''),
      value ->> 'provider_fiscal_date', value ->> 'report_date' loop
    event_row := public.sec_earnings_normalize_event(candidate);
    if not exists (select 1 from public.watchlist as w
      where w.user_id = p_user_id
        and regexp_replace(upper(btrim(w.symbol)), '\.US$', '') = event_row ->> 'symbol') then
      continue;
    end if;
    insert into public.sec_earnings_watch_jobs (symbol)
      values (event_row ->> 'symbol') on conflict (symbol) do nothing;
    perform 1 from public.sec_earnings_watch_jobs as job
      where job.symbol = event_row ->> 'symbol' for update;
    insert into public.sec_earnings_requested_events as saved
      (symbol, provider_fiscal_date, report_date, parser_version, official_fiscal_date)
    values (event_row ->> 'symbol', (event_row ->> 'provider_fiscal_date')::date,
      (event_row ->> 'report_date')::date, p_parser_version, (event_row ->> 'official_fiscal_date')::date)
    on conflict (symbol, provider_fiscal_date, report_date, parser_version) do update
      set official_fiscal_date = excluded.official_fiscal_date, status = 'pending', reason = null,
        last_attempt_at = null, updated_at = clock_timestamp()
      where excluded.official_fiscal_date is not null
        and saved.official_fiscal_date is distinct from excluded.official_fiscal_date;
    get diagnostics changed = row_count;
    registered := registered + changed;
    if changed > 0 then
      insert into public.sec_earnings_watch_jobs as job (symbol, next_scan_at, wake_revision)
      values (event_row ->> 'symbol', clock_timestamp(), 1)
      on conflict (symbol) do update set next_scan_at = least(job.next_scan_at, excluded.next_scan_at),
        wake_revision = job.wake_revision + 1;
    end if;
  end loop;
  -- Counts only: never return cross-user membership or user identifiers.
  return jsonb_build_object('registered', registered);
end;
$$;
revoke all on function public.register_sec_earnings_requested_events(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.register_sec_earnings_requested_events(uuid, jsonb, text) to service_role;

create or replace function public.claim_sec_earnings_watch_jobs(
  p_limit integer default 6, p_lease_seconds integer default 75
)
returns table (symbol text, lease_token uuid, lease_until timestamptz, attempt_count integer, last_checked_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 12
    or p_lease_seconds is null or p_lease_seconds < 10 or p_lease_seconds > 90 then
    raise exception 'invalid earnings lease limits' using errcode = '22023';
  end if;
  -- No watchlist writes, triggers, user IDs or financial columns are used.
  insert into public.sec_earnings_watch_jobs (symbol)
  select distinct normalized.symbol from public.watchlist as w
    cross join lateral (select regexp_replace(upper(btrim(w.symbol)), '\.US$', '') as symbol) as normalized
  where normalized.symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'
  on conflict on constraint sec_earnings_watch_jobs_pkey do nothing;

  return query
  with due as (
    select job.symbol from public.sec_earnings_watch_jobs as job
    where job.next_scan_at <= clock_timestamp()
      and (job.lease_until is null or job.lease_until <= clock_timestamp())
      and exists (select 1 from public.watchlist as w
        where regexp_replace(upper(btrim(w.symbol)), '\.US$', '') = job.symbol)
    order by job.next_scan_at, job.symbol
    for update of job skip locked
    limit p_limit
  )
  update public.sec_earnings_watch_jobs as job
  set lease_token = gen_random_uuid(), lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
    lease_revision = job.wake_revision, status = 'processing',
    attempt_count = least(job.attempt_count + 1, 1000000)
  from due where job.symbol = due.symbol
  returning job.symbol, job.lease_token, job.lease_until, job.attempt_count, job.last_checked_at;
end;
$$;
revoke all on function public.claim_sec_earnings_watch_jobs(integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_sec_earnings_watch_jobs(integer, integer) to service_role;

create or replace function public.complete_sec_earnings_watch_job(
  p_symbol text, p_lease_token uuid, p_parser_version text, p_status text,
  p_reason text default null, p_next_delay_seconds integer default 900,
  p_results jsonb default '[]'::jsonb, p_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_symbol text := regexp_replace(upper(btrim(p_symbol)), '\.US$', '');
  job public.sec_earnings_watch_jobs%rowtype;
  result_row jsonb;
  result_payload jsonb;
  event_row jsonb;
  result_date date;
  result_start date;
  result_ttl integer;
  changed integer;
  stored integer := 0;
  registered integer := 0;
  checked_at_value timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if normalized_symbol is null or normalized_symbol !~ '^[A-Z][A-Z0-9.-]{0,14}$'
    or p_lease_token is null or p_parser_version is null
    or p_parser_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    or p_status is null or p_status not in ('pending', 'complete', 'partial', 'unavailable', 'unsupported', 'error', 'idle')
    or (p_reason is not null and p_reason !~ '^[a-z0-9][a-z0-9-]{0,119}$')
    or p_next_delay_seconds is null or p_next_delay_seconds < 60 or p_next_delay_seconds > 604800
    or jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 2
    or octet_length(p_results::text) > 2105344
    or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) > 16
    or octet_length(p_events::text) > 32768 then
    raise exception 'invalid earnings completion batch' using errcode = '22023';
  end if;
  select * into job from public.sec_earnings_watch_jobs as current_job
    where current_job.symbol = normalized_symbol and current_job.lease_token = p_lease_token
      and current_job.lease_until > clock_timestamp() for update;
  if not found then
    return jsonb_build_object('outcome', 'stale', 'stored', 0, 'registered', 0);
  end if;

  for result_row in select value from jsonb_array_elements(p_results) loop
    result_payload := result_row -> 'payload';
    if jsonb_typeof(result_row) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(result_row) as k(key)
        where k.key not in ('official_fiscal_date', 'accession', 'document_type', 'cik', 'payload', 'ttl_seconds'))
      or coalesce(result_row ->> 'official_fiscal_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(result_row ->> 'accession', '') !~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'
      or coalesce(result_row ->> 'document_type', '') not in ('PRIMARY', 'EX-99.1', 'EX-99.2')
      or coalesce(result_row ->> 'cik', '') !~ '^[0-9]{10}$' or result_row ->> 'cik' = '0000000000'
      or jsonb_typeof(result_payload) is distinct from 'object' or octet_length(result_payload::text) > 1048576
      or coalesce(result_payload #>> '{period,start}', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid verified SEC result envelope' using errcode = '22023';
    end if;
    result_date := (result_row ->> 'official_fiscal_date')::date;
    result_start := (result_payload #>> '{period,start}')::date;
    result_ttl := coalesce((result_row ->> 'ttl_seconds')::integer, 21600);
    if result_date < date '2000-01-01' or result_date > current_date
      or result_date - result_start < 70 or result_date - result_start > 105
      or result_ttl < 60 or result_ttl > 604800
      or result_payload ->> 'symbol' is distinct from normalized_symbol
      or result_payload ->> 'parserVersion' is distinct from p_parser_version
      or coalesce(result_payload ->> 'status', '') not in ('complete', 'partial')
      or coalesce(result_payload ->> 'currency', '') !~ '^[A-Z]{3}$'
      or result_payload #>> '{source,provider}' is distinct from 'SEC'
      or result_payload #>> '{source,cik}' is distinct from result_row ->> 'cik'
      or result_payload #>> '{source,accession}' is distinct from result_row ->> 'accession'
      or result_payload #>> '{source,documentType}' is distinct from result_row ->> 'document_type'
      or coalesce(result_payload #>> '{source,form}', '') !~ '^(10-Q|10-K|8-K|6-K|20-F)(/A)?$'
      or coalesce(result_payload #>> '{source,primaryDocumentUrl}', '') !~ '^https://www\.sec\.gov/Archives/edgar/data/[0-9]+/[0-9]+/[A-Za-z0-9._-]+$'
      or coalesce(result_payload #>> '{source,filingUrl}', '') !~ '^https://www\.sec\.gov/Archives/edgar/data/[0-9]+/[0-9]+/[A-Za-z0-9._-]+$'
      or result_payload #>> '{period,end}' is distinct from result_date::text
      or (result_payload #>> '{period,fiscalDate}' is not null
        and result_payload #>> '{period,fiscalDate}' is distinct from result_date::text)
      or (result_payload #>> '{period,officialFiscalDate}' is not null
        and result_payload #>> '{period,officialFiscalDate}' is distinct from result_date::text)
      or jsonb_typeof(result_payload -> 'sections') is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(result_payload) as k(key)
        where k.key not in ('schemaVersion', 'parserVersion', 'status', 'reason', 'failureReason', 'symbol',
          'currency', 'period', 'source', 'sections', 'supplemental', 'summaryActuals', 'totalRevenue'))
      or jsonb_path_exists(result_payload, '$.** ? (@.type() == "object").keyvalue() ? (@.key == "user_id" || @.key == "userId" || @.key == "email" || @.key == "access_token" || @.key == "refresh_token" || @.key == "authorization" || @.key == "api_key" || @.key == "holdings" || @.key == "quantity")') then
      raise exception 'SEC result identity, privacy or period mismatch' using errcode = '22023';
    end if;
    if not exists (
      select 1 from jsonb_each(result_payload -> 'sections') as section(key, value)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(section.value -> 'items') = 'array'
        then section.value -> 'items' else '[]'::jsonb end) as item(value)
      where section.key in ('reportSegments', 'revenueBreakdown', 'geographies')
        and section.value ->> 'status' = 'complete'
        and jsonb_typeof(item.value) = 'object'
        and length(coalesce(item.value ->> 'id', '')) between 1 and 120
        and jsonb_typeof(item.value -> 'revenue') = 'number'
    ) then
      raise exception 'SEC result has no verified revenue items' using errcode = '22023';
    end if;
    checked_at_value := clock_timestamp();
    insert into public.sec_earnings_shared_results as saved
      (symbol, official_fiscal_date, cik, accession, document_type, parser_version, payload, checked_at, expires_at)
    values (normalized_symbol, result_date, result_row ->> 'cik', result_row ->> 'accession', result_row ->> 'document_type',
      p_parser_version, result_payload, checked_at_value, checked_at_value + make_interval(secs => result_ttl))
    on conflict (symbol, official_fiscal_date, accession, document_type, parser_version) do update
      set payload = excluded.payload, checked_at = excluded.checked_at, expires_at = excluded.expires_at
      -- CIK is immutable for an existing filing key, including service retries.
      where (saved.payload ->> 'status' <> 'complete' or excluded.payload ->> 'status' = 'complete')
        and saved.cik = excluded.cik
        and not exists (select 1 from jsonb_each(saved.payload -> 'sections') as previous_section(key, value)
          where previous_section.value ->> 'status' = 'complete'
            and excluded.payload #>> array['sections', previous_section.key, 'status'] is distinct from 'complete');
    get diagnostics changed = row_count;
    stored := stored + changed;
  end loop;

  for event_row in select value from jsonb_array_elements(p_events) loop
    event_row := public.sec_earnings_normalize_event(event_row, normalized_symbol);
    -- A newer official filing supersedes an older release even when parsing
    -- the newer document failed. Do not let a still-fresh 8-K mask a discovered
    -- 10-Q. Scope strictly to this leased symbol, fiscal period and parser.
    -- Keep the old payload and checked_at; only freshness is invalidated.
    if event_row ->> 'expected_accession' is not null then
      update public.sec_earnings_shared_results as older_result
        set expires_at = least(older_result.expires_at, clock_timestamp())
        where older_result.symbol = normalized_symbol
          and older_result.official_fiscal_date = (event_row ->> 'official_fiscal_date')::date
          and older_result.parser_version = p_parser_version
          and older_result.accession <> event_row ->> 'expected_accession';
    end if;
    insert into public.sec_earnings_requested_events as saved
      (symbol, provider_fiscal_date, report_date, parser_version, official_fiscal_date, status, reason, last_attempt_at)
    values (normalized_symbol, (event_row ->> 'provider_fiscal_date')::date, (event_row ->> 'report_date')::date,
      p_parser_version, (event_row ->> 'official_fiscal_date')::date,
      event_row ->> 'status', event_row ->> 'reason', clock_timestamp())
    on conflict (symbol, provider_fiscal_date, report_date, parser_version) do update
      set official_fiscal_date = coalesce(excluded.official_fiscal_date, saved.official_fiscal_date),
        -- Event state describes this latest attempt, not the retained history.
        -- Only the shared payload table preserves a previously verified result.
        status = excluded.status, reason = excluded.reason,
        last_attempt_at = excluded.last_attempt_at, updated_at = clock_timestamp();
    get diagnostics changed = row_count;
    registered := registered + changed;
  end loop;

  -- One transaction: expiry while validating/storing rolls back ALL writes.
  if job.lease_until <= clock_timestamp() then
    raise exception 'earnings lease expired before completion' using errcode = '40001';
  end if;
  update public.sec_earnings_watch_jobs as current_job
    set lease_token = null, lease_until = null, lease_revision = null,
      next_scan_at = case when current_job.wake_revision > job.lease_revision then clock_timestamp()
        else clock_timestamp() + make_interval(secs => p_next_delay_seconds) end,
      last_checked_at = clock_timestamp(), status = p_status, reason = p_reason,
      attempt_count = case when p_status in ('complete', 'partial', 'idle') then 0 else current_job.attempt_count end
    where current_job.symbol = normalized_symbol and current_job.lease_token = p_lease_token
      and current_job.lease_until > clock_timestamp();
  if not found then
    raise exception 'earnings lease expired before completion' using errcode = '40001';
  end if;
  return jsonb_build_object('outcome', 'completed', 'stored', stored, 'registered', registered);
end;
$$;
revoke all on function public.complete_sec_earnings_watch_job(text, uuid, text, text, text, integer, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.complete_sec_earnings_watch_job(text, uuid, text, text, text, integer, jsonb, jsonb) to service_role;

comment on table public.sec_earnings_shared_results is 'Service-only verified public SEC payloads; no per-user data. Only leased completion RPC may write.';
comment on table public.sec_earnings_requested_events is 'Shared public event keys only. Registration checks the caller user watchlist without persisting membership.';
commit;
