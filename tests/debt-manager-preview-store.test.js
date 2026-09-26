import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebtPreviewSeed, createDebtPreviewStore, DEBT_PREVIEW_STORAGE_KEY } from '../src/dev/debtManagerPreviewStore.js';

const seed = () => createDebtPreviewSeed('2026-09-23');
const persisted = data => JSON.stringify({ schemaVersion: 1, ...data });
function memoryStorage(initial = []) {
  const values = new Map(initial);
  const calls = [];
  return {
    values, calls,
    getItem(key) { calls.push(['get', key]); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(['set', key]); values.set(key, value); },
    removeItem() { throw new Error('Preview must not remove unrelated keys'); },
    clear() { throw new Error('Preview must not clear storage'); },
  };
}

test('the independent seed has 250万 borrowed, 65万 repaid, past repayments and a 28th monthly anchor', () => {
  for (const today of ['2026-09-23', '2027-01-01', '2028-03-01', '2026-12-31']) {
    const data = createDebtPreviewSeed(today);
    assert.equal(data.debts.length, 3);
    assert.equal(data.repayments.length, 3);
    assert.equal(data.debts.reduce((sum, debt) => sum + debt.originalAmount, 0), 2500000);
    assert.equal(data.repayments.reduce((sum, repayment) => sum + repayment.amount, 0), 650000);
    const expectedBalances = [1500000, 300000, 50000];
    for (const [index, debt] of data.debts.entries()) {
      const repayments = data.repayments.filter(row => row.debtId === debt.id);
      assert.equal(debt.originalAmount - repayments.reduce((sum, row) => sum + row.amount, 0), expectedBalances[index]);
      assert.equal(debt.currency, 'CNY');
      assert.ok(!Object.hasOwn(debt, 'remaining'), 'balances must be derived from the two arrays');
      assert.ok(repayments.every(row => row.repaymentDate >= debt.debtDate && row.repaymentDate < today));
    }
    const [supplier, renovation, friend] = data.debts;
    assert.equal(supplier.dueDate, `${today.slice(0, 4)}-12-31`);
    assert.equal(renovation.repaymentCycle, 'MONTHLY');
    assert.equal(renovation.plannedPayment, 80000);
    assert.equal(renovation.debtDate.slice(-2), '28');
    assert.ok(data.repayments.filter(row => row.debtId === renovation.id).every(row => row.repaymentDate.slice(0, 7) < today.slice(0, 7)));
    assert.equal(Date.parse(`${friend.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`), 5 * 86400000);
  }
  assert.deepEqual(createDebtPreviewSeed(new Date(2026, 8, 23, 23, 30)), seed(), 'Date input uses the local calendar day');
  assert.throws(() => createDebtPreviewSeed('2026-02-30'), TypeError);
});

test('first load reads only the demo namespace, returns fresh examples, and does not implicitly save', () => {
  assert.equal(DEBT_PREVIEW_STORAGE_KEY, 'quote:debt-manager:preview:v1');
  const storage = memoryStorage([['user', 'private'], ['accounts', 'private'], ['ledger', 'private']]);
  const store = createDebtPreviewStore(storage);
  const first = store.load();
  assert.equal(first.error, null);
  assert.equal(first.data.debts.length, 3);
  first.data.debts[0].name = 'local edit';
  assert.equal(store.load().data.debts[0].name, '供应商借款');
  assert.deepEqual(storage.calls, [['get', DEBT_PREVIEW_STORAGE_KEY], ['get', DEBT_PREVIEW_STORAGE_KEY]]);
  assert.equal(storage.values.has(DEBT_PREVIEW_STORAGE_KEY), false);
});

test('save and load round-trip independent debts and repayments without storing derived balances', () => {
  const storage = memoryStorage();
  const store = createDebtPreviewStore(storage);
  const data = seed();
  data.debts[0].name = '更新的欠款';
  data.debts[0].note = '保留备注';
  data.debts[0].remaining = 123;
  data.repayments.push({ ...data.repayments[0], id: 'new-repayment', amount: 12.34, repaymentDate: '2026-09-22', note: '小额还款' });
  assert.deepEqual(store.save(data), { ok: true, error: null });
  const stored = JSON.parse(storage.values.get(DEBT_PREVIEW_STORAGE_KEY));
  assert.equal(stored.schemaVersion, 1);
  assert.equal(Object.hasOwn(stored.debts[0], 'remaining'), false);
  delete data.debts[0].remaining;
  assert.deepEqual(store.load(), { data, error: null });
  assert.ok(storage.calls.every(([, key]) => key === DEBT_PREVIEW_STORAGE_KEY));
});

test('explicitly saved empty arrays stay empty instead of resurrecting the seed', () => {
  const storage = memoryStorage([[DEBT_PREVIEW_STORAGE_KEY, persisted(seed())]]);
  const store = createDebtPreviewStore(storage);
  const empty = { debts: [], repayments: [] };
  assert.deepEqual(store.save(empty), { ok: true, error: null });
  assert.deepEqual(store.load(), { data: empty, error: null });
  assert.deepEqual(createDebtPreviewStore(storage).load(), { data: empty, error: null });
});

test('corrupt JSON, unsupported versions and broken references are reported and never overwritten by load or save', () => {
  const duplicate = seed();
  duplicate.debts.push({ ...duplicate.debts[0] });
  const orphan = seed();
  orphan.repayments[0].debtId = 'missing';
  const badDate = seed();
  badDate.debts[0].debtDate = '2026-02-30';
  const cases = ['{', '', 'null', '[]', '{}', JSON.stringify({ schemaVersion: 2, ...seed() }), persisted(duplicate), persisted(orphan), persisted(badDate)];
  for (const raw of cases) {
    const storage = memoryStorage([[DEBT_PREVIEW_STORAGE_KEY, raw]]);
    const store = createDebtPreviewStore(storage);
    const loaded = store.load();
    assert.equal(loaded.data, null);
    assert.match(loaded.error, /损坏或版本不兼容/);
    const saved = store.save(seed());
    assert.equal(saved.ok, false);
    assert.match(saved.error, /未自动覆盖/);
    assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), raw);
    assert.ok(storage.calls.every(([operation]) => operation === 'get'));
  }
});

test('invalid fields, duplicate IDs and orphan repayments cannot overwrite a valid saved snapshot', () => {
  const mutations = [
    data => { data.debts[0].name = ' '; },
    data => { data.debts[0].originalAmount = '2000000'; },
    data => { data.debts[0].originalAmount = Infinity; },
    data => { data.debts[0].currency = 'USD'; },
    data => { data.debts[0].repaymentCycle = 'WEEKLY'; },
    data => { data.debts[0].repaymentCycle = 'CUSTOM'; data.debts[0].customIntervalDays = null; },
    data => { data.debts[0].plannedPayment = -1; },
    data => { data.debts[0].interestRate = NaN; },
    data => { data.debts[0].createdAt = 'yesterday'; },
    data => { data.debts[0].dueDate = '2020-01-01'; },
    data => { data.debts[1].id = data.debts[0].id; },
    data => { data.repayments[1].id = data.repayments[0].id; },
    data => { data.repayments[0].debtId = 'missing'; },
    data => { data.repayments[0].repaymentDate = '2026-02-30'; },
    data => { data.repayments[0].amount = 0; },
    data => { data.repayments[0].amount = 0.001; },
    data => { delete data.repayments[0].note; },
  ];
  for (const mutate of mutations) {
    const original = persisted(seed());
    const storage = memoryStorage([[DEBT_PREVIEW_STORAGE_KEY, original]]);
    const data = seed();
    mutate(data);
    assert.deepEqual(createDebtPreviewStore(storage).save(data), { ok: false, error: '欠款或还款记录格式不正确，未保存。' });
    assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), original);
    assert.equal(storage.calls.length, 0);
  }
  const store = createDebtPreviewStore(memoryStorage());
  for (const cycle of ['NONE', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']) {
    const data = seed();
    data.debts[0].repaymentCycle = cycle;
    data.debts[0].customIntervalDays = cycle === 'CUSTOM' ? 14 : null;
    assert.equal(store.save(data).ok, true);
  }
});

test('missing storage, throwing getters and read denial become explicit errors without escaping the interface', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('must not write'); } };
  for (const storage of [null, {}, denied]) {
    const store = createDebtPreviewStore(storage);
    assert.match(store.load().error, /无法读取/);
    assert.equal(store.load().data, null);
    assert.equal(store.save(seed()).ok, false);
    assert.equal(store.reset().ok, false);
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    const store = createDebtPreviewStore();
    assert.match(store.load().error, /无法读取/);
    assert.equal(store.save(seed()).ok, false);
    assert.deepEqual(store.reset(), { ok: false, data: null, error: '本地演示数据未保存，请检查浏览器存储权限或剩余空间。' });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    assert.match(createDebtPreviewStore().load().error, /无法读取/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('quota or write rejection preserves saved data and never reports a successful save or reset', () => {
  const previous = persisted({ debts: [], repayments: [] });
  const storage = memoryStorage([[DEBT_PREVIEW_STORAGE_KEY, previous]]);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const store = createDebtPreviewStore(storage);
  assert.equal(store.save(seed()).ok, false);
  assert.match(store.save(seed()).error, /未保存/);
  assert.deepEqual(store.reset(), { ok: false, data: null, error: '本地演示数据未保存，请检查浏览器存储权限或剩余空间。' });
  assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), previous);
});

test('explicit reset recovers only the demo key and returns exactly the newly persisted examples', () => {
  const storage = memoryStorage([[DEBT_PREVIEW_STORAGE_KEY, '{broken'], ['accounts', 'do not touch'], ['another-preview', 'do not touch']]);
  const store = createDebtPreviewStore(storage);
  const reset = store.reset();
  assert.equal(reset.ok, true);
  assert.equal(reset.error, null);
  assert.equal(reset.data.debts.length, 3);
  assert.deepEqual(store.load(), { data: reset.data, error: null });
  assert.equal(storage.values.get('accounts'), 'do not touch');
  assert.equal(storage.values.get('another-preview'), 'do not touch');
  assert.ok(storage.calls.every(([, key]) => key === DEBT_PREVIEW_STORAGE_KEY));
});
