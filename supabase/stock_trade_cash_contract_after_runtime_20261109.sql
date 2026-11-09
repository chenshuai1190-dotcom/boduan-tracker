-- Run only after the runtime supports stock_trade_cash_contract_ready and RPC.
-- One atomic cutover: old direct-write clients fail closed rather than bypassing
-- settlement; manual-mode accounts still use the same RPC with unchanged cash.
begin;
set local lock_timeout='5s';
do $$begin
 if to_regprocedure('public.stock_trade_cash(text,jsonb,uuid)') is null then raise exception 'stock cash foundation missing';end if;
end$$;
revoke insert,update,delete on public.stock_trades from authenticated;
do $$begin
 if has_any_column_privilege('authenticated','public.stock_trades','INSERT') or has_any_column_privilege('authenticated','public.stock_trades','UPDATE') then raise exception 'unexpected stock trade column write grants';end if;
end$$;
grant execute on function public.stock_trade_cash(text,jsonb,uuid) to authenticated;
update public.stock_trade_cash_release set enabled=true where singleton;
notify pgrst,'reload schema';
commit;
