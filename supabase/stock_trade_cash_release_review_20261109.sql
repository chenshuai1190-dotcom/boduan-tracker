-- READ ONLY release review. Run after the foundation, before changing accounts.
-- Registration scope is fixed, NOT the month in which this query is rerun.
-- Set quote.review_target_email transaction-locally in an untracked deployment
-- artifact before the named-account section. Never commit customer identifiers.
begin isolation level repeatable read read only;
select jsonb_build_object(
 'registrationCutoff','2026-10-31T16:00:00Z',
 'registeredSinceCutoff',count(*),
 'autoAccounts',count(*) filter(where a.mode='auto'),
 'cashNotConfigured',count(*) filter(where c.user_id is null),
 'emptyFormalLedgers',count(*) filter(where not exists(select 1 from public.stock_trades t where t.user_id=u.id and public.stock_trade_cash_kind(t)='trade')),
 'existingFormalLedgersRequiringPreview',count(*) filter(where a.mode is distinct from 'auto' and exists(select 1 from public.stock_trades t where t.user_id=u.id and public.stock_trade_cash_kind(t)='trade')),
 'financedAccountsRequireManualReview',count(*) filter(where exists(select 1 from public.margin_status m where m.user_id=u.id and m.current_margin>0))
) as november_account_summary
from auth.users u left join public.stock_trade_cash_accounts a on a.user_id=u.id left join public.available_cash_status c on c.user_id=u.id
where u.created_at>=timestamptz '2026-10-31 16:00:00+00';

do $$begin
 if (select count(*) from auth.users where lower(email)=lower(nullif(current_setting('quote.review_target_email',true),'')))<>1 then raise exception 'named repair target must resolve uniquely';end if;
end$$;
select public.stock_trade_cash_preview(u.id,'repair',e.id) as named_account_review_plan
from auth.users u join public.available_cash_events e on e.user_id=u.id
where lower(u.email)=lower(nullif(current_setting('quote.review_target_email',true),'')) and e.source='status_activation'
 and not exists(select 1 from public.available_cash_events earlier where earlier.user_id=u.id and earlier.id<e.id);
rollback;

-- Reviewed one-account apply TEMPLATE (do not run until separately approved).
-- Copy this block to a deployment artifact and replace REVIEWED_PLAN_TOKEN with
-- the exact preview token. Set the private reviewed-state JSON below to the
-- verified cash, opening, and exact trade values. Keep it out of source control. The
-- transaction-local claim only scopes the existing owner RPC; it does not edit
-- auth.users, issue a token, grant access, or persist an impersonation session.
-- stock_trade_cash_operations records actor_kind=database_admin plus actual
-- session_user, so the audit does not misrepresent this as user interaction.
/*
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create temporary table reviewed_stock_cash_target on commit drop as
 select id from auth.users where lower(email)=lower(nullif(current_setting('quote.review_target_email',true),'')) and created_at>=timestamptz '2026-10-31 16:00:00+00';
do $$declare target uuid;expected jsonb:=nullif(current_setting('quote.review_expected_state',true),'')::jsonb;begin
 if expected is null then raise exception 'private reviewed-state JSON is required';end if;
 if (select count(*) from reviewed_stock_cash_target)<>1 then raise exception 'named target changed';end if;
 select id into target from reviewed_stock_cash_target;
 perform pg_advisory_xact_lock(hashtextextended('available_cash:'||target::text,0));
 perform 1 from public.available_cash_status where user_id=target and available_cash_usd=(expected->>'beforeCashUsd')::numeric for update;
 if not found then raise exception 'reviewed cash balance changed';end if;
 if (select count(*) from public.stock_trades where user_id=target)<>1 or not exists(
  select 1 from public.stock_trades t where t.user_id=target and t.id=(expected#>>'{trade,id}')::uuid and t.symbol=expected#>>'{trade,symbol}' and t.side=expected#>>'{trade,side}' and t.trade_date=(expected#>>'{trade,date}')::date
   and t.price=(expected#>>'{trade,price}')::numeric and t.shares=(expected#>>'{trade,shares}')::numeric and t.fee=(expected#>>'{trade,fee}')::numeric and t.currency=expected#>>'{trade,currency}' and public.stock_trade_cash_kind(t)='trade')
 then raise exception 'reviewed trade ledger changed';end if;
 if (select count(*) from public.available_cash_events where user_id=target)<>1 or not exists(
  select 1 from public.available_cash_events where user_id=target and id=(expected->>'openingEventId')::bigint and source='status_activation' and cash_usd=(expected->>'openingCashUsd')::numeric
   and effective_at=(expected->>'openingEffectiveAt')::timestamptz) then raise exception 'reviewed opening event changed';end if;
 if exists(select 1 from public.margin_status where user_id=target and current_margin>0)
  or exists(select 1 from public.pnl_report_snapshots where user_id=target) then raise exception 'reviewed account boundary changed';end if;
 perform set_config('request.jwt.claim.sub',target::text,true);
end$$;
create temporary table reviewed_stock_cash_result on commit drop as
 select public.stock_trade_cash('repair',jsonb_build_object('operationKey','3f934d31-5ee8-4e92-a534-9ef874b9e72a','openingEventId',(current_setting('quote.review_expected_state')::jsonb->>'openingEventId')::bigint,'planToken','REVIEWED_PLAN_TOKEN'),id) value
 from reviewed_stock_cash_target;
do $$declare result jsonb;begin
 select value into result from reviewed_stock_cash_result;
 if (result#>>'{cashStatus,availableCashUsd}')::numeric<>(current_setting('quote.review_expected_state')::jsonb->>'afterCashUsd')::numeric or result#>>'{settlement,mode}'<>'auto'
  or (result#>>'{plan,affectedTradeCount}')::integer<>1 then raise exception 'named repair postcondition failed';end if;
end$$;
select value from reviewed_stock_cash_result;
commit;
*/
