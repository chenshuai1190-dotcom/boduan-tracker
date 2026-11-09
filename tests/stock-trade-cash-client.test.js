import assert from 'node:assert/strict';
import test from 'node:test';
import { createStockTradeCashRepository, normalizeSettledStockTrade, stockTradeCashOperation } from '../src/lib/stockTradeCashDb.js';

const operationKey = '11111111-1111-4111-8111-111111111111';
const tradeId = '22222222-2222-4222-8222-222222222222';
const trade = { symbol: 'MSFT', side: 'buy', date: '2026-11-09', price: '540.58', shares: '295', fee: 0 };
const committed = { trade: { id: tradeId, ...trade }, cashStatus: { availableCashUsd: 1840528.9, isSet: true, updatedAt: '2026-11-09T15:09:35Z' }, settlement: { mode: 'auto' } };
function harness(handler = async () => ({ data: committed, error: null })) {
  let user = 'owner'; let notify; const calls = [];
  const client = { auth: {
    getSession: async () => ({ data: { session: user ? { user: { id: user }, access_token: 'local-test-session' } : null } }),
    onAuthStateChange: callback => { notify = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  }, rpc: async (name, payload) => { calls.push({ name, payload }); return handler(name, payload); } };
  return { repo: createStockTradeCashRepository(client), calls, switchUser(id) { user = id; notify('SIGNED_IN', { user: { id } }); } };
}

test('formal trade and cash use one owner-bound atomic RPC result', async () => {
  const h = harness();
  const result = await h.repo.mutate('create', { operationKey, trade }, 'owner');
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], { name: 'stock_trade_cash', payload: { p_action: 'create', p_expected_user_id: 'owner', p_payload: { operationKey, trade: {
    symbol: 'MSFT', name: 'MSFT', side: 'buy', date: '2026-11-09', price: 540.58, shares: 295, fee: 0, currency: 'USD', note: '', recordKind: 'trade',
  } } } });
  assert.equal(result, committed);
});

test('edit and delete require original row version; a missing version never writes', async () => {
  const h = harness();
  assert.throws(() => h.repo.mutate('update', { tradeId, operationKey, trade }, 'owner'), /原交易已更新/);
  assert.equal(h.calls.length, 0);
  await h.repo.mutate('delete', { tradeId, operationKey, expectedUpdatedAt: 'original-version' }, 'owner');
  assert.deepEqual(h.calls[0].payload.p_payload, { tradeId, operationKey, expectedUpdatedAt: 'original-version' });
});

test('unknown commit failures retain caller operation identity for a safe retry', async () => {
  let attempt = 0;
  const h = harness(async () => ++attempt === 1 ? { error: new Error('network interrupted') } : { data: committed });
  const intent = { user: 'owner', trade };
  const first = stockTradeCashOperation(null, intent, () => operationKey);
  await assert.rejects(h.repo.mutate('create', { operationKey: first.operationKey, trade }, 'owner'), /network interrupted/);
  const retry = stockTradeCashOperation(first, intent, () => { throw new Error('must not generate a new key'); });
  await h.repo.mutate('create', { operationKey: retry.operationKey, trade }, 'owner');
  assert.equal(h.calls[0].payload.p_payload.operationKey, h.calls[1].payload.p_payload.operationKey);
  assert.notEqual(stockTradeCashOperation(null, intent, () => tradeId).operationKey, first.operationKey);
});

test('wrong account and an account switch during a response cannot deliver cash or trade data', async () => {
  const h = harness();
  await assert.rejects(h.repo.load('other-owner'), /账户已切换/);
  assert.equal(h.calls.length, 0);
  const switched = harness(async () => { switched.switchUser('other'); switched.switchUser('owner'); return { data: committed }; });
  await assert.rejects(switched.repo.mutate('create', { operationKey, trade }, 'owner'), /账户已切换/);
});

test('opening repair confirmation sends the exact reviewed token and never confirms a missing plan', async () => {
  const h = harness();
  await h.repo.preview({ kind: 'repair', openingEventId: 34 }, 'owner');
  assert.equal(h.calls[0].payload.p_action, 'preview_repair');
  assert.throws(() => h.repo.confirm({ kind: 'repair', operationKey, openingEventId: 34 }, 'owner'), /重新核对/);
  await h.repo.confirm({ kind: 'repair', operationKey, planToken: 'reviewed-plan', openingEventId: 34 }, 'owner');
  assert.deepEqual(h.calls[1].payload.p_payload, { operationKey, planToken: 'reviewed-plan', openingEventId: 34 });
});

test('historical holding is explicit while ordinary wording never changes settlement type', () => {
  assert.equal(normalizeSettledStockTrade({ ...trade, note: '这是历史平均价' }).recordKind, 'trade');
  assert.equal(normalizeSettledStockTrade({ ...trade, note: '[[quote:stock-trade:record-kind=historical_holding:v1]]' }).recordKind, 'historical_holding');
  assert.equal(normalizeSettledStockTrade({ ...trade, side: 'sell', note: '[[quote:stock-trade:record-kind=historical_holding:v1]]' }).recordKind, 'trade');
  assert.throws(() => normalizeSettledStockTrade({ ...trade, fee: -2 }), /无效/);
});

test('invalid cash response cannot masquerade as a confirmed settlement', async () => {
  const h = harness(async () => ({ data: { ...committed, cashStatus: { ...committed.cashStatus, availableCashUsd: -1 } } }));
  await assert.rejects(h.repo.mutate('create', { operationKey, trade }, 'owner'), /格式无效/);
});
