-- Staged foundation: no authenticated trade mutation is exposed until the
-- after-runtime contract. Existing ledgers remain manual until reviewed.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

alter table public.stock_trades add column if not exists record_kind text
  check(record_kind is null or record_kind in ('trade','historical_holding'));
alter table public.available_cash_events add column if not exists settlement_baseline_event_id bigint;
alter table public.available_cash_events add column if not exists settlement_trade_delta_usd numeric(18,6);
alter table public.pnl_report_snapshots add column if not exists cash_settlement_baseline_event_id bigint;
alter table public.pnl_report_snapshots add column if not exists cash_settlement_trade_delta_usd numeric(18,6);
alter table public.available_cash_events drop constraint if exists available_cash_events_source_check;
alter table public.available_cash_events add constraint available_cash_events_source_check
  check(source in ('status_activation','status_change','stock_trade_settlement'));

create table if not exists public.stock_trade_cash_accounts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null check(mode in ('auto','manual')),
 baseline_event_id bigint references public.available_cash_events(id),
 enabled_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check((mode='auto' and baseline_event_id is not null and enabled_at is not null) or mode='manual')
);
-- Entries are a current projection, while operations preserve every before/after.
-- A baseline-excluded old trade stays excluded even if its date is edited.
create table if not exists public.stock_trade_cash_entries(
 user_id uuid not null references auth.users(id) on delete cascade,
 trade_id uuid primary key references public.stock_trades(id) on delete cascade,
 baseline_excluded boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists stock_trade_cash_entries_owner on public.stock_trade_cash_entries(user_id);
create table if not exists public.stock_trade_cash_operations(
 user_id uuid not null references auth.users(id) on delete cascade,
 operation_key uuid not null,
 action text not null,
 actor_kind text not null default case when session_user in ('postgres','supabase_admin') then 'database_admin' else 'owner' end check(actor_kind in ('owner','database_admin')),
 actor_database_role text not null default session_user,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,operation_key)
);
create table if not exists public.stock_trade_cash_release(singleton boolean primary key default true check(singleton), enabled boolean not null default false);
insert into public.stock_trade_cash_release(singleton,enabled) values(true,false) on conflict do nothing;

alter table public.stock_trade_cash_accounts enable row level security;
alter table public.stock_trade_cash_entries enable row level security;
alter table public.stock_trade_cash_operations enable row level security;
alter table public.stock_trade_cash_release enable row level security;
revoke all on public.stock_trade_cash_accounts,public.stock_trade_cash_entries,public.stock_trade_cash_operations,public.stock_trade_cash_release from public,anon,authenticated,service_role;

create or replace function public.stock_trade_cash_contract_ready() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select enabled from public.stock_trade_cash_release where singleton),false)
$$;
revoke all on function public.stock_trade_cash_contract_ready() from public,anon,authenticated,service_role;
grant execute on function public.stock_trade_cash_contract_ready() to authenticated;

create or replace function public.stock_trade_cash_kind(p_trade public.stock_trades) returns text
language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(p_trade.record_kind,case when '[[quote:stock-trade:record-kind=historical_holding:v1]]'=any(regexp_split_to_array(coalesce(p_trade.note,''),E'\\r?\\n')) then 'historical_holding' else 'trade' end)
$$;
revoke all on function public.stock_trade_cash_kind(public.stock_trades) from public,anon,authenticated,service_role;

-- A recorded execution on its entry day retains the real server entry time.
-- A date-only historical entry is attributed immediately before that day's
-- formal close; dates earlier than the confirmed cash baseline are rejected.
create or replace function public.stock_trade_cash_effective_at(p_trade public.stock_trades,p_baseline timestamptz) returns timestamptz
language sql immutable set search_path=pg_catalog,public as $$
 select greatest(p_baseline,case when p_trade.trade_date=(p_trade.created_at at time zone 'America/New_York')::date
 then least(p_trade.created_at,(p_trade.trade_date+time '16:59:59.999999') at time zone 'America/New_York') else (p_trade.trade_date+time '16:59:59.999999') at time zone 'America/New_York' end)
$$;
revoke all on function public.stock_trade_cash_effective_at(public.stock_trades,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.stock_trade_cash_state(p_owner uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 with cash as(select * from public.available_cash_status where user_id=p_owner),
 account as(select * from public.stock_trade_cash_accounts where user_id=p_owner),
 eligibility as(select created_at>=timestamptz '2026-10-31 16:00:00+00' eligible from auth.users where id=p_owner),
 openings as(select e.id,e.effective_at,e.cash_usd from public.available_cash_events e where e.user_id=p_owner
 and e.source='status_activation' and e.cash_usd>0 and not exists(select 1 from public.available_cash_events older where older.user_id=p_owner and older.id<e.id))
 select jsonb_build_object(
 'cashStatus',jsonb_build_object('availableCashUsd',coalesce((select available_cash_usd from cash),0),'updatedAt',(select updated_at from cash),'isSet',exists(select 1 from cash)),
 'settlement',jsonb_build_object('mode',coalesce((select mode from account),'manual'),
 'baselineDate',(select (e.effective_at at time zone 'America/New_York')::date from account a join public.available_cash_events e on e.id=a.baseline_event_id),
 'eligibleNewAccount',coalesce((select eligible from eligibility),false),
 'canEnable',exists(select 1 from cash) and not exists(select 1 from account where mode='auto') and not exists(select 1 from public.margin_status where user_id=p_owner and current_margin>0),
 'canRepair',coalesce((select eligible from eligibility),false) and exists(select 1 from openings) and not exists(select 1 from account where mode='auto') and not exists(select 1 from public.margin_status where user_id=p_owner and current_margin>0)),
 'openingCandidates',coalesce((select jsonb_agg(jsonb_build_object('eventId',id,'effectiveAt',effective_at,'cashUsd',cash_usd) order by id) from openings),'[]'::jsonb))
$$;
revoke all on function public.stock_trade_cash_state(uuid) from public,anon,authenticated,service_role;

-- Replays internal cash settlement and external cash movements separately.
-- A balance adjustment is an explicit anchor; it is never treated as trading P&L.
create or replace function public.stock_trade_cash_projection(p_owner uuid,p_baseline_id bigint,p_all_trades boolean default false)
returns table(effective_at timestamptz,order_key text,cash_usd numeric,trade_delta_usd numeric)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.available_cash_events%rowtype;r record;balance numeric;trade_total numeric:=0;
begin
 select * into b from public.available_cash_events where id=p_baseline_id and user_id=p_owner;
 if not found then raise exception 'stock_cash_baseline_missing' using errcode='22023';end if;
 if exists(select 1 from public.stock_trades t where t.user_id=p_owner and public.stock_trade_cash_kind(t)='trade'
   and (p_all_trades or exists(select 1 from public.stock_trade_cash_entries e where e.trade_id=t.id and e.user_id=p_owner and not e.baseline_excluded))
   and (t.currency<>'USD' or t.price in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or t.shares in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or t.fee in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or b.effective_at>=((t.trade_date+time '17:00') at time zone 'America/New_York') or t.trade_date<(b.effective_at at time zone 'America/New_York')::date or t.trade_date>(clock_timestamp() at time zone 'America/New_York')::date))
 then raise exception 'stock_cash_trade_outside_supported_baseline' using errcode='22023';end if;
 balance:=b.cash_usd;effective_at:=b.effective_at;order_key:='0:baseline';cash_usd:=balance;trade_delta_usd:=0;return next;
 for r in
   select * from (
    select public.stock_trade_cash_effective_at(t,b.effective_at) at_time,'1:'||t.created_at::text||':'||t.id::text k,
      case when t.side='buy' then -(t.price*t.shares+t.fee) else t.price*t.shares-t.fee end::numeric delta,
      null::numeric anchor,true is_trade
    from public.stock_trades t where t.user_id=p_owner and public.stock_trade_cash_kind(t)='trade'
      and (p_all_trades or exists(select 1 from public.stock_trade_cash_entries e where e.trade_id=t.id and e.user_id=p_owner and not e.baseline_excluded))
    union all
    select m.occurred_at,'2:'||lpad(m.cash_event_id::text,20,'0'),m.delta_usd,
      case when m.kind='balance_adjustment' then m.balance_after_usd else null end,false
    from public.available_cash_movements m where m.user_id=p_owner and m.cash_event_id>p_baseline_id and m.occurred_at>=b.effective_at
   ) items order by at_time,k
 loop
   if r.anchor is not null then balance:=r.anchor;else balance:=balance+r.delta;end if;
   if r.is_trade then trade_total:=trade_total+r.delta;end if;
   balance:=round(balance,6);trade_total:=round(trade_total,6);
   if balance<0 or balance='NaN'::numeric then raise exception 'stock_cash_insufficient_at_date' using errcode='23514',detail=r.at_time::text;end if;
   effective_at:=r.at_time;order_key:=r.k;cash_usd:=balance;trade_delta_usd:=trade_total;return next;
 end loop;
end
$$;
revoke all on function public.stock_trade_cash_projection(uuid,bigint,boolean) from public,anon,authenticated,service_role;

create or replace function public.stock_trade_cash_validate_positions(p_owner uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from(select sum(case when side='sell' then -shares else shares end) over(partition by symbol,currency order by trade_date,created_at,id rows unbounded preceding) held from public.stock_trades where user_id=p_owner) q where q.held<0)
 then raise exception 'stock_cash_oversell' using errcode='23514';end if;
end
$$;
revoke all on function public.stock_trade_cash_validate_positions(uuid) from public,anon,authenticated,service_role;

create or replace function public.stock_trade_cash_preview(p_owner uuid,p_kind text,p_opening bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.available_cash_events%rowtype;s public.available_cash_status%rowtype;v_after numeric;v_count integer;v_revision bigint;v_token text;v_state jsonb;
begin
 v_state:=public.stock_trade_cash_state(p_owner);
 perform public.stock_trade_cash_validate_positions(p_owner);
 if p_kind not in ('enable','repair') then raise exception 'stock_cash_plan_invalid' using errcode='22023';end if;
 if not coalesce((v_state#>>array['settlement',case when p_kind='repair' then 'canRepair' else 'canEnable' end])::boolean,false)
 then raise exception 'stock_cash_mode_not_eligible' using errcode='22023';end if;
 select * into s from public.available_cash_status where user_id=p_owner;
 if p_kind='repair' then
  select * into b from public.available_cash_events where user_id=p_owner and id=p_opening and source='status_activation'
   and cash_usd>0 and not exists(select 1 from public.available_cash_events e where e.user_id=p_owner and e.id<p_opening);
  if not found then raise exception 'stock_cash_opening_not_verified' using errcode='22023';end if;
  -- A later manual calibration may already include executed trades. Never debit twice.
  if exists(select 1 from public.available_cash_movements where user_id=p_owner and cash_event_id>b.id and kind not in ('transfer_in','transfer_out'))
   or exists(select 1 from public.available_cash_events e where e.user_id=p_owner and e.id>b.id and not exists(select 1 from public.available_cash_movements m where m.user_id=p_owner and m.cash_event_id=e.id))
  then raise exception 'stock_cash_history_requires_manual_reconciliation' using errcode='22023';end if;
  select p.cash_usd into v_after from public.stock_trade_cash_projection(p_owner,b.id,true) p order by p.effective_at desc,p.order_key desc limit 1;
  select count(*) into v_count from public.stock_trades t where user_id=p_owner and public.stock_trade_cash_kind(t)='trade';
 else
  select * into b from public.available_cash_events where user_id=p_owner and source_updated_at=s.updated_at and cash_usd=s.available_cash_usd order by id desc limit 1;
  if not found then raise exception 'stock_cash_current_baseline_not_verified' using errcode='22023';end if;
  v_after:=s.available_cash_usd;v_count:=0;
 end if;
 select coalesce(revision,0) into v_revision from public.stock_trade_ledger_revisions where user_id=p_owner;
 v_token:=md5(jsonb_build_object('owner',p_owner,'kind',p_kind,'baseline',b.id,'cashVersion',s.updated_at,'cash',s.available_cash_usd,
  'revision',coalesce(v_revision,0),'trades',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.stock_trades t where t.user_id=p_owner),
  'movementWatermark',(select max(cash_event_id) from public.available_cash_movements where user_id=p_owner),'after',v_after)::text);
 return jsonb_build_object('kind',p_kind,'token',v_token,'openingEventId',b.id,'baselineDate',(b.effective_at at time zone 'America/New_York')::date,
 'beforeCashUsd',s.available_cash_usd,'afterCashUsd',v_after,'affectedTradeCount',v_count);
end
$$;
revoke all on function public.stock_trade_cash_preview(uuid,text,bigint) from public,anon,authenticated,service_role;

-- Capture authoritative settlement metadata on ordinary manual cash changes too.
create or replace function public.stock_trade_cash_event_metadata() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare baseline bigint;total numeric;
begin
 select baseline_event_id into baseline from public.stock_trade_cash_accounts where user_id=new.user_id and mode='auto';
 if baseline is not null and new.source<>'stock_trade_settlement' then
  select coalesce(sum(case when t.side='buy' then -(t.price*t.shares+t.fee) else t.price*t.shares-t.fee end),0)
  into total from public.stock_trade_cash_entries e join public.stock_trades t on t.id=e.trade_id
  join public.available_cash_events b on b.id=baseline
  where e.user_id=new.user_id and not e.baseline_excluded and public.stock_trade_cash_kind(t)='trade'
   and public.stock_trade_cash_effective_at(t,b.effective_at)<=new.effective_at;
  new.settlement_baseline_event_id:=baseline;new.settlement_trade_delta_usd:=round(total,6);
 end if;
 return new;
end
$$;
revoke all on function public.stock_trade_cash_event_metadata() from public,anon,authenticated,service_role;
drop trigger if exists stock_trade_cash_event_metadata on public.available_cash_events;
create trigger stock_trade_cash_event_metadata before insert on public.available_cash_events for each row execute function public.stock_trade_cash_event_metadata();

create or replace function public.stock_trade_cash_dirty(p_owner uuid,p_from date,p_bump boolean default false) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare revision_value bigint;
begin
 insert into public.stock_trade_ledger_revisions(user_id,revision,last_mutated_at) values(p_owner,case when p_bump then 1 else 0 end,case when p_bump then clock_timestamp() else null end)
 on conflict(user_id) do update set revision=public.stock_trade_ledger_revisions.revision+case when p_bump then 1 else 0 end,
 last_mutated_at=case when p_bump then clock_timestamp() else public.stock_trade_ledger_revisions.last_mutated_at end returning revision into revision_value;
 insert into public.pnl_report_rebuild_state(user_id,dirty_from_date,ledger_revision,generation,reason,source_trade_id,updated_at)
 values(p_owner,p_from,revision_value,1,'stock_cash_settled',null,clock_timestamp())
 on conflict(user_id) do update set dirty_from_date=least(public.pnl_report_rebuild_state.dirty_from_date,excluded.dirty_from_date),ledger_revision=excluded.ledger_revision,
 generation=public.pnl_report_rebuild_state.generation+1,reason=excluded.reason,source_trade_id=null,updated_at=excluded.updated_at;
 if p_bump and to_regclass('public.community_competition_rebuild_state') is not null and to_regclass('public.community_competition_members') is not null then
  if exists(select 1 from public.community_competition_members where user_id=p_owner and status='active') then
   insert into public.community_competition_rebuild_state(user_id,dirty_from_date,ledger_revision,requested_at,updated_at)
   values(p_owner,p_from,revision_value,clock_timestamp(),clock_timestamp()) on conflict(user_id) do update set
   dirty_from_date=least(public.community_competition_rebuild_state.dirty_from_date,excluded.dirty_from_date),ledger_revision=excluded.ledger_revision,updated_at=excluded.updated_at;
  end if;
 end if;
end
$$;
revoke all on function public.stock_trade_cash_dirty(uuid,date,boolean) from public,anon,authenticated,service_role;

-- Append corrected formal-close cash events. Existing source events are retained.
-- Replaying every affected completed day also replaces old values after a deleted
-- trade, without leaving an obsolete absolute cash event authoritative.
create or replace function public.stock_trade_cash_apply(p_owner uuid,p_from date) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare baseline bigint;b public.available_cash_events%rowtype;points jsonb;last_point jsonb;point jsonb;d date;last_day date;cutoff timestamptz;amount numeric;delta numeric;current_amount numeric;updated timestamptz;
begin
 select baseline_event_id into baseline from public.stock_trade_cash_accounts where user_id=p_owner and mode='auto';
 if baseline is null then return;end if;
 select * into b from public.available_cash_events where id=baseline and user_id=p_owner;
 select jsonb_agg(to_jsonb(p) order by p.effective_at,p.order_key) into points from public.stock_trade_cash_projection(p_owner,baseline,false) p;
 last_point:=points->(jsonb_array_length(points)-1);amount:=(last_point->>'cash_usd')::numeric;
 select available_cash_usd into current_amount from public.available_cash_status where user_id=p_owner for update;
 if current_amount is distinct from amount then
  update public.available_cash_status set available_cash_usd=amount,logic_version=1 where user_id=p_owner returning updated_at into updated;
 else select updated_at into updated from public.available_cash_status where user_id=p_owner;end if;
 -- Always append a current authoritative point, including zero-net edits/deletes.
 insert into public.available_cash_events(user_id,cash_usd,effective_at,source,logic_version,source_updated_at,settlement_baseline_event_id,settlement_trade_delta_usd)
 values(p_owner,amount,clock_timestamp(),'stock_trade_settlement',1,updated,baseline,(last_point->>'trade_delta_usd')::numeric);
 last_day:=(clock_timestamp() at time zone 'America/New_York')::date;
 if (clock_timestamp() at time zone 'America/New_York')::time<time '17:00' then last_day:=last_day-1;end if;
 d:=greatest(p_from,(b.effective_at at time zone 'America/New_York')::date);
 if last_day-d>4000 then raise exception 'stock_cash_history_range_too_large' using errcode='22023';end if;
 while d<=last_day loop
  cutoff:=(d+time '17:00') at time zone 'America/New_York';
  if cutoff>=b.effective_at then
   select v.value into point from jsonb_array_elements(points) with ordinality v(value,n)
    where (v.value->>'effective_at')::timestamptz<=cutoff order by v.n desc limit 1;
   if point is not null then
    insert into public.available_cash_events(user_id,cash_usd,effective_at,source,logic_version,source_updated_at,settlement_baseline_event_id,settlement_trade_delta_usd)
    values(p_owner,(point->>'cash_usd')::numeric,cutoff,'stock_trade_settlement',1,updated,baseline,(point->>'trade_delta_usd')::numeric);
   end if;
  end if;
  d:=d+1;
 end loop;
 perform public.stock_trade_cash_dirty(p_owner,p_from,false);
end
$$;
revoke all on function public.stock_trade_cash_apply(uuid,date) from public,anon,authenticated,service_role;

-- Preserve the live snapshot validator except for filling the two new server
-- provenance fields. Fail closed if its known assignment point has changed.
do $patch$
declare definition text;needle text:='  new.cash_basis := resolved.cash_basis;';addition text;
begin
 select pg_get_functiondef('public.enforce_pnl_report_available_cash_snapshot()'::regprocedure) into definition;
 addition:=needle||E'\n  select e.settlement_baseline_event_id,e.settlement_trade_delta_usd into new.cash_settlement_baseline_event_id,new.cash_settlement_trade_delta_usd from public.available_cash_events e where e.id=resolved.cash_event_id and e.user_id=new.user_id;';
 if strpos(definition,'new.cash_settlement_baseline_event_id')=0 then
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'stock_cash_snapshot_validator_changed';end if;
  execute replace(definition,needle,addition);
 end if;
end
$patch$;

create or replace function public.stock_trade_cash(p_action text,p_payload jsonb,p_expected_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid();action text:=lower(coalesce(p_action,''));payload jsonb:=coalesce(p_payload,'{}');
 op uuid;stored public.stock_trade_cash_operations%rowtype;old_trade public.stock_trades%rowtype;new_trade public.stock_trades%rowtype;
 state jsonb;plan jsonb;result jsonb;trade_input jsonb;target_trade_id uuid;baseline bigint;from_date date;cash_time timestamptz;
 baseline_time timestamptz;affected_time timestamptz;
 kind text;side_value text;symbol_value text;date_value date;price_value numeric;shares_value numeric;fee_value numeric;currency_value text;note_value text;mode_value text;excluded boolean;financial_changed boolean;
begin
 if owner_id is null or p_expected_user_id is distinct from owner_id then raise exception 'stock_cash_owner_mismatch' using errcode='42501';end if;
 if not public.stock_trade_cash_contract_ready() then raise exception 'stock_cash_contract_not_ready' using errcode='55000';end if;
 if action not in ('state','preview_enable','preview_repair','enable','repair','create','update','delete') or jsonb_typeof(payload)<>'object' then raise exception 'stock_cash_action_invalid' using errcode='22023';end if;
 if action='state' then return public.stock_trade_cash_state(owner_id);end if;
 -- Lock order matches mutate_available_cash and reverse_available_cash_movement.
 perform pg_advisory_xact_lock(hashtextextended('available_cash:'||owner_id::text,0));
 perform 1 from public.available_cash_status where user_id=owner_id for update;
 if action in ('preview_enable','preview_repair') then
  plan:=public.stock_trade_cash_preview(owner_id,replace(action,'preview_',''),nullif(payload->>'openingEventId','')::bigint);
  return jsonb_build_object('plan',plan);
 end if;
 op:=nullif(payload->>'operationKey','')::uuid;
 if op is null then raise exception 'stock_cash_operation_required' using errcode='22023';end if;
 select * into stored from public.stock_trade_cash_operations where user_id=owner_id and operation_key=op;
 if found then
  if stored.action is distinct from action or stored.request is distinct from payload then raise exception 'stock_cash_operation_reused' using errcode='22023';end if;
  result:=stored.result||public.stock_trade_cash_state(owner_id);
  if result ? 'tradeId' then select to_jsonb(t) into trade_input from public.stock_trades t where t.id=(result->>'tradeId')::uuid and user_id=owner_id;result:=result||jsonb_build_object('trade',trade_input);end if;
  return result;
 end if;
 if action in ('enable','repair') then
  plan:=public.stock_trade_cash_preview(owner_id,action,nullif(payload->>'openingEventId','')::bigint);
  if payload->>'planToken' is distinct from plan->>'token' then raise exception 'stock_cash_plan_stale' using errcode='40001';end if;
  baseline:=(plan->>'openingEventId')::bigint;
  insert into public.stock_trade_cash_accounts(user_id,mode,baseline_event_id,enabled_at) values(owner_id,'auto',baseline,clock_timestamp())
   on conflict(user_id) do update set mode='auto',baseline_event_id=excluded.baseline_event_id,enabled_at=excluded.enabled_at;
  insert into public.stock_trade_cash_entries(user_id,trade_id,baseline_excluded)
   select owner_id,id,action='enable' from public.stock_trades where user_id=owner_id on conflict(trade_id) do nothing;
  from_date:=(plan->>'baselineDate')::date;
  perform public.stock_trade_cash_apply(owner_id,from_date);
  result:=public.stock_trade_cash_state(owner_id)||jsonb_build_object('plan',plan);
 else
  select coalesce(mode,'manual') into mode_value from public.stock_trade_cash_accounts where user_id=owner_id;
  mode_value:=coalesce(mode_value,'manual');
  if action='create' and mode_value='manual' and not exists(select 1 from public.stock_trade_cash_accounts where user_id=owner_id)
   and not exists(select 1 from public.stock_trades t where t.user_id=owner_id and public.stock_trade_cash_kind(t)='trade')
   and exists(select 1 from auth.users where id=owner_id and created_at>=timestamptz '2026-10-31 16:00:00+00')
   and exists(select 1 from public.available_cash_status where user_id=owner_id)
   and not exists(select 1 from public.margin_status where user_id=owner_id and current_margin>0) then
   plan:=public.stock_trade_cash_preview(owner_id,'enable',null);baseline:=(plan->>'openingEventId')::bigint;
   insert into public.stock_trade_cash_accounts(user_id,mode,baseline_event_id,enabled_at) values(owner_id,'auto',baseline,clock_timestamp());
   insert into public.stock_trade_cash_entries(user_id,trade_id,baseline_excluded) select owner_id,t.id,true from public.stock_trades t where t.user_id=owner_id on conflict(trade_id) do nothing;
   mode_value:='auto';
  end if;
  if action in ('update','delete') then
   target_trade_id:=nullif(payload->>'tradeId','')::uuid;
   select * into old_trade from public.stock_trades where id=target_trade_id and user_id=owner_id for update;
   if not found then raise exception 'stock_cash_trade_not_found' using errcode='42501';end if;
   if nullif(payload->>'expectedUpdatedAt','')::timestamptz is distinct from old_trade.updated_at then raise exception 'stock_cash_trade_stale' using errcode='40001';end if;
   from_date:=old_trade.trade_date;
   select e.baseline_excluded into excluded from public.stock_trade_cash_entries e where e.trade_id=target_trade_id and e.user_id=owner_id;
  end if;
  if mode_value='manual' and exists(select 1 from auth.users where id=owner_id and created_at>=timestamptz '2026-10-31 16:00:00+00')
   and (action<>'create' or coalesce(payload#>>'{trade,recordKind}','trade')='trade')
  then raise exception 'stock_cash_reconciliation_required' using errcode='55000';end if;
  if action<>'delete' then
   trade_input:=payload->'trade';
   symbol_value:=upper(btrim(trade_input->>'symbol'));side_value:=trade_input->>'side';kind:=coalesce(trade_input->>'recordKind','trade');
   date_value:=(trade_input->>'date')::date;price_value:=(trade_input->>'price')::numeric;shares_value:=(trade_input->>'shares')::numeric;fee_value:=coalesce(nullif(trade_input->>'fee','')::numeric,0);currency_value:=coalesce(trade_input->>'currency','USD');note_value:=coalesce(trade_input->>'note','');
   if symbol_value is null or symbol_value!~'^[A-Z0-9][A-Z0-9.-]{0,14}$' or side_value not in ('buy','sell') or side_value is null
    or kind not in ('trade','historical_holding') or (kind='historical_holding' and side_value<>'buy')
    or date_value is null or price_value is null or price_value<=0 or price_value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or shares_value is null or shares_value<=0 or shares_value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or fee_value<0 or fee_value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or currency_value not in ('USD','CNY','HKD') or length(note_value)>10000 then raise exception 'stock_cash_trade_invalid' using errcode='22023';end if;
   from_date:=least(coalesce(from_date,date_value),date_value);
   if action='create' then
    insert into public.stock_trades(user_id,symbol,name,side,trade_date,price,shares,fee,currency,note,record_kind)
     values(owner_id,symbol_value,coalesce(trade_input->>'name',symbol_value),side_value,date_value,price_value,shares_value,fee_value,currency_value,note_value,kind) returning * into new_trade;
    target_trade_id:=new_trade.id;
    if mode_value='auto' then insert into public.stock_trade_cash_entries(user_id,trade_id) values(owner_id,target_trade_id);end if;
    financial_changed:=true;
   else
    financial_changed:=row(old_trade.symbol,old_trade.side,old_trade.trade_date,old_trade.price,old_trade.shares,old_trade.fee,old_trade.currency,public.stock_trade_cash_kind(old_trade)) is distinct from row(symbol_value,side_value,date_value,price_value,shares_value,fee_value,currency_value,kind);
    update public.stock_trades set symbol=symbol_value,name=coalesce(trade_input->>'name',symbol_value),side=side_value,trade_date=date_value,price=price_value,shares=shares_value,fee=fee_value,currency=currency_value,note=note_value,record_kind=kind
     where id=target_trade_id and user_id=owner_id returning * into new_trade;
    if public.stock_trade_cash_kind(old_trade) is distinct from kind then perform public.stock_trade_cash_dirty(owner_id,from_date,true);end if;
   end if;
  else
   delete from public.stock_trades where id=target_trade_id and user_id=owner_id;financial_changed:=true;
  end if;
  if mode_value='auto' and financial_changed then
   if exists(select 1 from public.margin_status where user_id=owner_id and current_margin>0) then raise exception 'stock_cash_margin_requires_manual_mode' using errcode='22023';end if;
   -- A later manually reconciled balance may already include the historical
   -- trade. Rewriting across that anchor must never silently swallow a refund.
   select a.baseline_event_id,e.effective_at into baseline,baseline_time from public.stock_trade_cash_accounts a join public.available_cash_events e on e.id=a.baseline_event_id where a.user_id=owner_id;
   if not coalesce(excluded,false) then
    affected_time:=least(case when old_trade.id is not null and public.stock_trade_cash_kind(old_trade)='trade' then public.stock_trade_cash_effective_at(old_trade,baseline_time) end,
      case when new_trade.id is not null and public.stock_trade_cash_kind(new_trade)='trade' then public.stock_trade_cash_effective_at(new_trade,baseline_time) end);
    if affected_time is not null and exists(select 1 from public.available_cash_movements m where m.user_id=owner_id and m.cash_event_id>baseline and m.kind in ('balance_adjustment','reversal') and m.occurred_at>=affected_time)
    then raise exception 'stock_cash_manual_anchor_conflict' using errcode='40001';end if;
   end if;
   perform public.stock_trade_cash_validate_positions(owner_id);
   perform public.stock_trade_cash_apply(owner_id,from_date);
  end if;
  result:=public.stock_trade_cash_state(owner_id)||jsonb_build_object('tradeId',target_trade_id,'trade',case when action='delete' then null else to_jsonb(new_trade) end);
 end if;
 insert into public.stock_trade_cash_operations(user_id,operation_key,action,request,result) values(owner_id,op,action,payload,result);
 return result;
end
$$;
revoke all on function public.stock_trade_cash(text,jsonb,uuid) from public,anon,authenticated,service_role;
comment on column public.stock_trades.record_kind is 'Settlement contract: historical_holding is an opening position, not a cash purchase. NULL preserves legacy display metadata until explicit reconciliation.';
notify pgrst,'reload schema';
commit;
