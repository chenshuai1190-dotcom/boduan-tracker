import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDebtCloudStore } from '../src/lib/debtManagerCloudStore.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const DEBT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPAYMENT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const stamp = '2026-01-02T00:00:00.000Z';

const debtRow = (fields = {}) => ({
  id: DEBT_A, user_id: USER_A, name: '供应商欠款', creditor: '', original_amount: '2000000.00',
  debt_date: '2025-01-01', due_date: '2028-12-31', repayment_cycle: 'NONE',
  planned_payment: null, custom_interval_days: null, interest_rate: null,
  note: '', currency: 'CNY', created_at: stamp, updated_at: stamp,
  personal_debt_repayments: [], ...fields,
});

function mockClient({ rows = [debtRow()], signedInUser = USER_A, failLoad = false, rpcUserId = null } = {}) {
  let currentUser = signedInUser;
  const calls = [];
  let nextId = 0;
  const stored = rows.map(row => ({ ...row, personal_debt_repayments: row.personal_debt_repayments.map(child => ({ ...child })) }));

  function execute(query, single = false) {
    calls.push({ table: query.table, operation: query.operation, filters: { ...query.filters }, values: query.values, select: query.columns });
    const owner = row => row.user_id === currentUser && Object.entries(query.filters).every(([key, value]) => row[key] === value);
    let tableRows = query.table === 'personal_debts' ? stored : stored.flatMap(row => row.personal_debt_repayments);
    let data;
    if (query.operation === 'select') {
      data = tableRows.filter(owner).map(row => ({ ...row, personal_debt_repayments: row.personal_debt_repayments?.map(child => ({ ...child })) }));
    } else if (query.operation === 'insert') {
      const input = Array.isArray(query.values) ? query.values : [query.values];
      if (input.some(row => row.user_id !== currentUser)) return { data: null, error: { message: 'RLS violation' } };
      data = input.map(row => ({ ...row, id: row.id || `generated-${++nextId}`, created_at: stamp, updated_at: stamp }));
      if (query.table === 'personal_debts') data.forEach(row => stored.push({ ...row, personal_debt_repayments: [] }));
      else data.forEach(child => stored.find(parent => parent.id === child.debt_id)?.personal_debt_repayments.push(child));
    } else if (query.operation === 'update') {
      data = tableRows.filter(owner).map(row => Object.assign(row, query.values));
    } else if (query.operation === 'delete') {
      data = tableRows.filter(owner);
      if (query.table === 'personal_debts') data.forEach(row => stored.splice(stored.indexOf(row), 1));
      else data.forEach(row => {
        const parent = stored.find(item => item.id === row.debt_id);
        parent?.personal_debt_repayments.splice(parent.personal_debt_repayments.indexOf(row), 1);
      });
    }
    if (single) return { data: data[0] || null, error: null };
    return { data, error: null };
  }

  const from = table => ({
    table, operation: null, filters: {}, values: null, columns: '',
    select(columns) { if (!this.operation) this.operation = 'select'; this.columns = columns; return this; },
    eq(column, value) { this.filters[column] = value; return this; },
    order() { return this; },
    insert(values) { this.operation = 'insert'; this.values = values; return this; },
    update(values) { this.operation = 'update'; this.values = values; return this; },
    delete() { this.operation = 'delete'; return this; },
    maybeSingle() { return Promise.resolve(execute(this, true)); },
    then(resolve, reject) { return Promise.resolve(execute(this)).then(resolve, reject); },
  });

  return {
    client: {
      auth: { getUser: async () => ({ data: { user: currentUser ? { id: currentUser } : null }, error: null }) },
      from,
      rpc: async name => {
        calls.push({ table: 'rpc', operation: name });
        if (failLoad) return { data: null, error: { message: 'database unavailable' } };
        const owner = rpcUserId || currentUser;
        const owned = stored.filter(row => row.user_id === owner);
        return {
          data: {
            user_id: owner,
            debts: owned.map(({ personal_debt_repayments, user_id, ...row }) => row),
            repayments: owned.flatMap(row => row.personal_debt_repayments.map(({ user_id, ...child }) => child)),
          },
          error: null,
        };
      },
    },
    calls, stored,
    switchUser(id) { currentUser = id; },
  };
}

const newDebt = fields => ({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: '装修借款', creditor: '',
  originalAmount: 400000, debtDate: '2025-01-01', dueDate: null,
  repaymentCycle: 'NONE', plannedPayment: null, customIntervalDays: null,
  interestRate: null, note: '', currency: 'CNY', ...fields,
});
const newPayment = fields => ({
  id: REPAYMENT_A, debtId: DEBT_A, amount: 100000,
  repaymentDate: '2025-02-01', note: '', ...fields,
});

test('single owner-scoped snapshot returns source debts and repayment rows, never a stored balance', async () => {
  const fixture = mockClient({ rows: [debtRow({ personal_debt_repayments: [{
    id: REPAYMENT_A, debt_id: DEBT_A, user_id: USER_A, amount: '500000.00',
    repayment_date: '2025-02-01', note: '转账', created_at: stamp, updated_at: stamp,
  }] }), debtRow({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', user_id: USER_B })] });
  const result = await createDebtCloudStore(fixture.client, USER_A).load();
  assert.equal(result.error, null);
  assert.equal(result.data.debts.length, 1);
  assert.equal(result.data.repayments[0].amount, 500000);
  assert.equal(result.data.repayments[0].debtId, DEBT_A);
  assert.equal(Object.hasOwn(result.data.debts[0], 'remainingAmount'), false);
  assert.deepEqual(fixture.calls, [{ table: 'rpc', operation: 'read_personal_debt_ledger' }],
    'parent and child rows must share one database snapshot');
});

test('cloud errors and account switches fail closed instead of showing zero debts or writing under a stale account', async () => {
  const broken = mockClient({ failLoad: true });
  const store = createDebtCloudStore(broken.client, USER_A);
  assert.deepEqual(await store.load(), { data: null, error: 'database unavailable' });
  assert.equal((await store.saveDebt(newDebt())).ok, false);
  assert.equal(broken.calls.filter(call => call.operation !== 'read_personal_debt_ledger').length, 0);

  const fixture = mockClient();
  const scoped = createDebtCloudStore(fixture.client, USER_A);
  assert.equal((await scoped.load()).error, null);
  fixture.switchUser(USER_B);
  assert.equal((await scoped.load()).data, null);
  assert.equal((await scoped.saveDebt(newDebt())).ok, false);
  assert.equal(fixture.calls.filter(call => call.operation !== 'read_personal_debt_ledger').length, 0);

  const raced = mockClient({ rpcUserId: USER_B });
  const mismatched = await createDebtCloudStore(raced.client, USER_A).load();
  assert.equal(mismatched.data, null, 'response from a newly switched session cannot be shown under the old account');
});

test('new debt and repayment insert once; edits target only the loaded owner row; delete is scoped', async () => {
  const fixture = mockClient();
  const store = createDebtCloudStore(fixture.client, USER_A);
  assert.equal((await store.load()).error, null);
  assert.equal((await store.saveDebt(newDebt())).ok, true);
  assert.equal((await store.saveDebt(newDebt({ name: '装修款修正' }))).ok, true);
  assert.equal((await store.saveRepayment(newPayment())).ok, true);
  assert.equal((await store.saveRepayment(newPayment({ amount: 80000 }))).ok, true);
  assert.equal((await store.deleteRepayment(REPAYMENT_A)).ok, true);
  assert.equal((await store.deleteDebt(DEBT_A)).ok, true);
  const writes = fixture.calls.filter(call => !['select', 'read_personal_debt_ledger'].includes(call.operation));
  assert.deepEqual(writes.map(call => [call.table, call.operation]), [
    ['personal_debts', 'insert'], ['personal_debts', 'update'],
    ['personal_debt_repayments', 'insert'], ['personal_debt_repayments', 'update'],
    ['personal_debt_repayments', 'delete'], ['personal_debts', 'delete'],
  ]);
  for (const write of writes) {
    assert.equal(write.values?.user_id || write.filters.user_id, USER_A);
    assert.equal(Object.hasOwn(write.values || {}, 'remaining_amount'), false);
  }
  assert.deepEqual(writes[1].filters, { id: newDebt().id, user_id: USER_A });
  assert.deepEqual(writes[3].filters, { id: REPAYMENT_A, debt_id: DEBT_A, user_id: USER_A });
});

test('bulk import validates every row before one atomic INSERT and rejects mixed parents or invalid dates', async () => {
  const fixture = mockClient();
  const store = createDebtCloudStore(fixture.client, USER_A);
  await store.load();
  const rows = [newPayment(), newPayment({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', amount: 20000 })];
  assert.equal((await store.saveBulkRepayments(rows)).ok, true);
  const inserts = fixture.calls.filter(call => call.table === 'personal_debt_repayments' && call.operation === 'insert');
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].values.length, 2);

  assert.equal((await store.saveBulkRepayments([newPayment({ repaymentDate: '2024-12-31' })])).ok, false);
  assert.equal((await store.saveBulkRepayments([newPayment({ debtId: 'other' }), rows[1]])).ok, false);
  assert.equal(fixture.calls.filter(call => call.table === 'personal_debt_repayments' && call.operation === 'insert').length, 1);
});

test('ledger snapshot includes more than 1000 repayments without a REST row-limit truncation', async () => {
  const repayments = Array.from({ length: 1001 }, (_, index) => ({
    id: `payment-${index}`, debt_id: DEBT_A, user_id: USER_A, amount: '1.00',
    repayment_date: '2025-02-01', note: '', created_at: stamp, updated_at: stamp,
  }));
  const fixture = mockClient({ rows: [debtRow({ personal_debt_repayments: repayments })] });
  const result = await createDebtCloudStore(fixture.client, USER_A).load();
  assert.equal(result.error, null);
  assert.equal(result.data.repayments.length, 1001);
  assert.equal(result.data.repayments.reduce((sum, row) => sum + row.amount, 0), 1001);
  assert.equal(fixture.calls.filter(call => call.operation === 'read_personal_debt_ledger').length, 1);
});

test('migration keeps debt money independent, owner-only and denies anonymous table access', () => {
  const sql = readFileSync(new URL('../supabase/personal_debt_manager_20260926.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.personal_debts[\s\S]*?original_amount numeric\(15, 2\)/);
  assert.match(sql, /create table if not exists public\.personal_debt_repayments[\s\S]*?amount numeric\(15, 2\)/);
  assert.match(sql, /foreign key \(debt_id, user_id\)[\s\S]*?references public\.personal_debts \(id, user_id\)[\s\S]*?on delete cascade/);
  assert.equal((sql.match(/alter table public\.personal_debts enable row level security/g) || []).length, 1);
  assert.equal((sql.match(/alter table public\.personal_debt_repayments enable row level security/g) || []).length, 1);
  assert.match(sql, /revoke all privileges on table public\.personal_debts,[\s\S]*?from public, anon, authenticated/);
  assert.equal((sql.match(/using \(auth\.uid\(\) = user_id\)/g) || []).length, 2);
  assert.equal((sql.match(/with check \(auth\.uid\(\) = user_id\)/g) || []).length, 2);
  assert.match(sql, /create or replace function public\.read_personal_debt_ledger\(\)[\s\S]*?stable[\s\S]*?security invoker/);
  assert.match(sql, /where debt\.user_id = caller_id[\s\S]*?where repayment\.user_id = caller_id/);
  assert.match(sql, /revoke execute on function public\.read_personal_debt_ledger\(\)[\s\S]*?from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.read_personal_debt_ledger\(\)[\s\S]*?to authenticated/);
  assert.doesNotMatch(sql, /remaining_amount|asset_accounts|investment_summary|stock_trades/);
});
