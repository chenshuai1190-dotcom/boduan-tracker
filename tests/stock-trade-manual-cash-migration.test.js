import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const moduleFile = process.env.PGLITE_MODULE_FILE;
const read = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const names = ['stock_trades.sql', 'available_cash_foundation_20260805.sql', 'available_cash_movements_foundation_20260904.sql',
  'available_cash_movement_reversal_foundation_20260904.sql', 'stock_trade_cash_foundation_20261109.sql',
  'stock_trade_cash_contract_after_runtime_20261109.sql', 'stock_trade_cash_manual_default_20261117.sql'];
const [stock, cash, movement, reversal, foundation, contract, manualDefault] = await Promise.all(names.map(read));

test('PostgreSQL unfunded manual entry, funded automatic entry, and explicit cash enrollment',
  { skip: !moduleFile && 'Set PGLITE_MODULE_FILE to run local PostgreSQL' }, async t => {
    const { PGlite } = await import(pathToFileURL(moduleFile).href);
    const db = await PGlite.create();
    const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
    const one = async (sql, args = []) => (await rows(sql, args))[0];
    async function as(owner, sql, args = [], role = 'authenticated') {
      await db.exec(`set role ${role}`);
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner || '']);
        return await rows(sql, args);
      } finally {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub','',false)");
      }
    }
    const rpc = async (owner, action, payload = {}, expected = owner) =>
      (await as(owner, 'select public.stock_trade_cash($1,$2,$3) value', [action, payload, expected]))[0].value;
    const accounts = Object.fromEntries(['auto', 'legacy', 'none', 'zero', 'funded', 'financed', 'unreviewed', 'invalid'].map(key => [key, randomUUID()]));
    let dates;
    const buy = (overrides = {}) => ({ symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: dates.today,
      price: 100, shares: 2, fee: 0, currency: 'USD', note: '', recordKind: 'trade', ...overrides });
    const create = (owner, trade = buy()) => rpc(owner, 'create', { operationKey: randomUUID(), trade });
    async function fund(owner, amount = 1000, date = dates.opening) {
      await db.query('insert into public.available_cash_status(user_id,available_cash_usd) values($1,$2)', [owner, amount]);
      // Only the isolated fixture sets an earlier source date; production data is never contacted.
      await db.query("update public.available_cash_events set effective_at=($2::date+time '08:00') at time zone 'America/New_York' where user_id=$1", [owner, date]);
    }
    async function financialState(owner) {
      const state = {};
      for (const table of ['available_cash_status', 'available_cash_events', 'available_cash_movements', 'margin_status', 'stock_trade_cash_entries']) {
        state[table] = await rows(`select to_jsonb(t) value from public.${table} t where user_id=$1 order by to_jsonb(t)::text`, [owner]);
      }
      return state;
    }
    try {
      await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
        create schema auth; create table auth.users(id uuid primary key,created_at timestamptz not null);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema auth to anon,authenticated,service_role;
        grant execute on function auth.uid() to anon,authenticated,service_role;
        create table public.margin_status(user_id uuid primary key,current_margin numeric);
        create table public.pnl_report_snapshots(id bigint generated always as identity primary key,user_id uuid,snapshot_date date,cash_usd numeric,market_value_usd numeric,total_assets_usd numeric);
        create table public.pnl_report_rebuild_state(user_id uuid primary key,dirty_from_date date,ledger_revision bigint,generation bigint,reason text,source_trade_id uuid,updated_at timestamptz);
        grant usage on schema public to anon,authenticated,service_role;`);
      for (const [name, owner] of Object.entries(accounts)) {
        await db.query('insert into auth.users values($1,$2)', [owner, name === 'legacy' ? '2026-10-01' : '2026-11-08']);
      }
      dates = await one("select to_char(d,'YYYY-MM-DD') today,to_char(d-1,'YYYY-MM-DD') yesterday,to_char(d-2,'YYYY-MM-DD') earlier,to_char(d-3,'YYYY-MM-DD') opening from (select (clock_timestamp() at time zone 'America/New_York')::date d) q");
      await db.exec(stock);
      await db.exec('grant select,insert,update,delete on public.stock_trades to authenticated');
      for (const sql of [cash, movement, reversal, foundation, contract]) await db.exec(sql);
      await fund(accounts.auto);
      const originalOperation = { operationKey: randomUUID(), trade: buy() };
      const originalAuto = await rpc(accounts.auto, 'create', originalOperation);
      assert.equal(originalAuto.settlement.mode, 'auto');
      assert.equal(originalAuto.cashStatus.availableCashUsd, 800);
      await fund(accounts.legacy);
      const legacyTrade = await create(accounts.legacy);
      await fund(accounts.unreviewed);
      await db.query("insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','buy',$2,10,1)", [accounts.unreviewed, dates.today]);

      await t.test('forward migration is repeatable and does not rewrite business records or grants', async () => {
        const tables = ['stock_trades', 'available_cash_status', 'available_cash_events', 'available_cash_movements',
          'stock_trade_cash_accounts', 'stock_trade_cash_entries', 'stock_trade_cash_operations', 'pnl_report_snapshots'];
        const inventory = async () => Promise.all(tables.map(table => rows(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`)));
        const before = await inventory();
        await db.exec(manualDefault);
        await db.exec(manualDefault);
        assert.deepEqual(await inventory(), before);
        assert.equal((await rpc(accounts.auto, 'state')).settlement.mode, 'auto');
        assert.equal((await rpc(accounts.legacy, 'state')).settlement.mode, 'manual');
        await assert.rejects(as(accounts.none, "insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','buy',current_date,1,1)", [accounts.none]), { code: '42501' });
        await assert.rejects(rpc(accounts.none, 'state', {}, accounts.auto), { code: '42501' });
        await assert.rejects(as(null, "select public.stock_trade_cash('state','{}',$1)", [accounts.none], 'anon'), { code: '42501' });
        for (const helper of ['stock_trade_cash_state(uuid)', 'stock_trade_cash_preview(uuid,text,bigint)', 'stock_trade_cash_apply(uuid,date)']) {
          assert.equal((await one("select has_function_privilege('authenticated',$1,'EXECUTE') allowed", [helper])).allowed, false);
        }
      });

      await t.test('unfunded and zero-cash first trades persist manual recording with legacy CRUD semantics', async () => {
        await fund(accounts.zero, 0);
        for (const owner of [accounts.none, accounts.zero]) {
          const beforeCash = await financialState(owner);
          const payload = { operationKey: randomUUID(), trade: buy({ date: dates.earlier, fee: 5 }) };
          const first = await rpc(owner, 'create', payload);
          assert.equal(first.settlement.mode, 'manual');
          assert.equal(first.cashStatus.isSet, owner === accounts.zero);
          assert.equal(first.cashStatus.availableCashUsd, 0);
          assert.equal((await one('select mode from public.stock_trade_cash_accounts where user_id=$1', [owner])).mode, 'manual');
          const retry = await rpc(owner, 'create', payload);
          assert.equal(retry.tradeId, first.tradeId);
          await assert.rejects(rpc(owner, 'create', { ...payload, trade: buy({ shares: 4 }) }), { code: '22023' });
          await assert.rejects(rpc(accounts.auto, 'delete', { operationKey: randomUUID(), tradeId: first.tradeId, expectedUpdatedAt: first.trade.updated_at }), { code: '42501' });
          await assert.rejects(rpc(owner, 'update', { operationKey: randomUUID(), tradeId: first.tradeId, expectedUpdatedAt: '2020-01-01Z', trade: buy() }), { code: '40001' });
          const edited = await rpc(owner, 'update', { operationKey: randomUUID(), tradeId: first.tradeId, expectedUpdatedAt: first.trade.updated_at, trade: buy({ date: dates.earlier, shares: 1, fee: 7 }) });
          // Manual bookkeeping intentionally keeps the existing legacy short/partial-ledger behavior.
          const sale = await create(owner, buy({ side: 'sell', shares: 3, price: 120, fee: 2 }));
          await rpc(owner, 'delete', { operationKey: randomUUID(), tradeId: edited.tradeId, expectedUpdatedAt: edited.trade.updated_at });
          await rpc(owner, 'delete', { operationKey: randomUUID(), tradeId: sale.tradeId, expectedUpdatedAt: sale.trade.updated_at });
          assert.deepEqual(await financialState(owner), beforeCash);
          assert.equal((await one('select count(*)::int n from public.stock_trades where user_id=$1', [owner])).n, 0);
          assert.equal((await rpc(owner, 'state')).settlement.mode, 'manual');
        }
        await assert.rejects(create(accounts.invalid, buy({ shares: 0 })), /stock_cash_trade_invalid/);
        assert.equal((await one('select count(*)::int n from public.stock_trade_cash_accounts where user_id=$1', [accounts.invalid])).n, 0);
        assert.equal((await one('select count(*)::int n from public.stock_trades where user_id=$1', [accounts.invalid])).n, 0);
      });

      await t.test('later cash only enables explicitly from current balance and cannot repair-debit old manual trades', async () => {
        const owner = accounts.none;
        const oldTrade = await create(owner, buy({ date: dates.earlier, shares: 1 }));
        await fund(owner, 900, dates.yesterday);
        let state = await rpc(owner, 'state');
        assert.equal(state.settlement.mode, 'manual');
        assert.equal(state.settlement.canEnable, true);
        assert.equal(state.settlement.canRepair, false);
        const cashAfterFunding = await financialState(owner);
        const sameDay = await create(owner, buy({ shares: 1, price: 50 }));
        assert.equal(sameDay.cashStatus.availableCashUsd, 900);
        assert.equal(sameDay.settlement.mode, 'manual');
        assert.deepEqual(await financialState(owner), cashAfterFunding);
        const openingEventId = state.openingCandidates[0].eventId;
        await assert.rejects(rpc(owner, 'preview_repair', { openingEventId }), /stock_cash_mode_not_eligible/);
        await assert.rejects(rpc(owner, 'repair', { operationKey: randomUUID(), openingEventId, planToken: 'not-a-plan' }), /stock_cash_mode_not_eligible/);
        const preview = await rpc(owner, 'preview_enable');
        assert.equal(preview.plan.beforeCashUsd, 900);
        assert.equal(preview.plan.afterCashUsd, 900);
        assert.equal(preview.plan.affectedTradeCount, 0);
        const confirm = { operationKey: randomUUID(), planToken: preview.plan.token };
        await assert.rejects(rpc(owner, 'enable', { ...confirm, planToken: 'stale' }), /stock_cash_plan_stale/);
        const enabled = await rpc(owner, 'enable', confirm);
        assert.equal(enabled.settlement.mode, 'auto');
        assert.equal(enabled.cashStatus.availableCashUsd, 900);
        const excluded = await rows('select trade_id,baseline_excluded from public.stock_trade_cash_entries where user_id=$1 order by trade_id', [owner]);
        assert.deepEqual(excluded.map(row => row.trade_id).sort(), [oldTrade.tradeId, sameDay.tradeId].sort());
        assert.ok(excluded.every(row => row.baseline_excluded));
        const next = await create(owner, buy({ price: 10, shares: 1, fee: 2 }));
        assert.equal(next.cashStatus.availableCashUsd, 888);
        assert.equal((await rpc(owner, 'enable', confirm)).cashStatus.availableCashUsd, 888);
      });

      await t.test('positive-cash new accounts and already-auto zero balances retain settlement safeguards', async () => {
        await fund(accounts.funded);
        const funded = await create(accounts.funded, buy({ fee: 5 }));
        assert.equal(funded.settlement.mode, 'auto');
        assert.equal(funded.cashStatus.availableCashUsd, 795);
        const exhausted = await create(accounts.auto, buy({ price: 800, shares: 1 }));
        assert.equal(exhausted.cashStatus.availableCashUsd, 0);
        assert.equal(exhausted.settlement.mode, 'auto');
        const atZero = await financialState(accounts.auto);
        await assert.rejects(create(accounts.auto, buy({ price: 1, shares: 1 })), /stock_cash_insufficient_at_date/);
        await assert.rejects(create(accounts.auto, buy({ side: 'sell', shares: 100 })), /stock_cash_oversell/);
        assert.deepEqual(await financialState(accounts.auto), atZero);
        const replay = await rpc(accounts.auto, 'create', originalOperation);
        assert.equal(replay.tradeId, originalAuto.tradeId);
        assert.equal(replay.cashStatus.availableCashUsd, 0);
        const sold = await create(accounts.auto, buy({ side: 'sell', price: 20, shares: 1, fee: 1 }));
        assert.equal(sold.cashStatus.availableCashUsd, 19);
        const edited = await rpc(accounts.auto, 'update', { operationKey: randomUUID(), tradeId: sold.tradeId, expectedUpdatedAt: sold.trade.updated_at, trade: buy({ side: 'sell', price: 25, shares: 1, fee: 1 }) });
        assert.equal(edited.cashStatus.availableCashUsd, 24);
        const deleted = await rpc(accounts.auto, 'delete', { operationKey: randomUUID(), tradeId: edited.tradeId, expectedUpdatedAt: edited.trade.updated_at });
        assert.equal(deleted.cashStatus.availableCashUsd, 0);
        assert.equal(deleted.settlement.mode, 'auto');
      });

      await t.test('first financed recording is manual, old manual behavior stays, and unreviewed funded history remains protected', async () => {
        await fund(accounts.financed);
        await db.query('insert into public.margin_status values($1,500)', [accounts.financed]);
        const before = await financialState(accounts.financed);
        const financed = await create(accounts.financed);
        assert.equal(financed.settlement.mode, 'manual');
        assert.equal(financed.settlement.canEnable, false);
        assert.equal(financed.settlement.canRepair, false);
        assert.deepEqual(await financialState(accounts.financed), before);
        const legacy = await rpc(accounts.legacy, 'update', { operationKey: randomUUID(), tradeId: legacyTrade.tradeId, expectedUpdatedAt: legacyTrade.trade.updated_at, trade: buy({ shares: 4 }) });
        assert.equal(legacy.settlement.mode, 'manual');
        assert.equal(legacy.cashStatus.availableCashUsd, 1000);
        const unreviewed = await rpc(accounts.unreviewed, 'state');
        assert.equal(unreviewed.settlement.canRepair, true);
        await assert.rejects(create(accounts.unreviewed), /stock_cash_reconciliation_required/);
        const openingEventId = unreviewed.openingCandidates[0].eventId;
        const preview = await rpc(accounts.unreviewed, 'preview_repair', { openingEventId });
        assert.equal(preview.plan.afterCashUsd, 990);
        const repaired = await rpc(accounts.unreviewed, 'repair', { operationKey: randomUUID(), openingEventId, planToken: preview.plan.token });
        assert.equal(repaired.cashStatus.availableCashUsd, 990);
        assert.equal(repaired.settlement.mode, 'auto');
      });
    } finally {
      await db.close();
    }
  });
