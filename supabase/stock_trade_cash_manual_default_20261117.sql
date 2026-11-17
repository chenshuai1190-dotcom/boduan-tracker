-- Forward-only policy update after the 2026-11-09 foundation and RPC cutover.
-- No existing account, cash balance, trade, event, or settlement entry is rewritten.
-- Positive-cash first trades without financing keep automatic settlement.
-- Unfunded or financed first trades explicitly choose manual recording;
-- adding cash later never silently enrolls.
-- CREATE OR REPLACE preserves all existing function ACLs and direct-write bans.
begin;
set local lock_timeout='5s';
do $$begin
 if to_regprocedure('public.stock_trade_cash(text,jsonb,uuid)') is null
  or to_regprocedure('public.stock_trade_cash_state(uuid)') is null
 then raise exception 'stock cash foundation missing';end if;
end$$;

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
 'canRepair',coalesce((select eligible from eligibility),false) and exists(select 1 from openings) and not exists(select 1 from account) and not exists(select 1 from public.margin_status where user_id=p_owner and current_margin>0)),
 'openingCandidates',coalesce((select jsonb_agg(jsonb_build_object('eventId',id,'effectiveAt',effective_at,'cashUsd',cash_usd) order by id) from openings),'[]'::jsonb))
$$;

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
   and exists(select 1 from auth.users where id=owner_id and created_at>=timestamptz '2026-10-31 16:00:00+00') then
   if exists(select 1 from public.available_cash_status where user_id=owner_id and available_cash_usd>0)
    and not exists(select 1 from public.margin_status where user_id=owner_id and current_margin>0) then
    plan:=public.stock_trade_cash_preview(owner_id,'enable',null);baseline:=(plan->>'openingEventId')::bigint;
    insert into public.stock_trade_cash_accounts(user_id,mode,baseline_event_id,enabled_at) values(owner_id,'auto',baseline,clock_timestamp());
    insert into public.stock_trade_cash_entries(user_id,trade_id,baseline_excluded) select owner_id,t.id,true from public.stock_trades t where t.user_id=owner_id on conflict(trade_id) do nothing;
    mode_value:='auto';
   elsif coalesce(payload#>>'{trade,recordKind}','trade')='trade' then
    -- This choice survives later cash entry, preventing retroactive enrollment.
    insert into public.stock_trade_cash_accounts(user_id,mode) values(owner_id,'manual');
   end if;
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
   and not exists(select 1 from public.stock_trade_cash_accounts where user_id=owner_id and mode='manual')
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

notify pgrst,'reload schema';
commit;
