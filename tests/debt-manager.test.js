import test from 'node:test';
import assert from 'node:assert/strict';
import { DEBT_CYCLES, parseMoney, validateDebt, validateRepayment, deriveDebt, buildDebtOverview } from '../src/lib/debtManager.js';

const debt = fields => ({ id: 'a', name: '测试欠款', creditor: '', originalAmount: 1000, debtDate: '2026-01-31', dueDate: null,
  repaymentCycle: 'MONTHLY', plannedPayment: 100, customIntervalDays: null, interestRate: null, note: '', currency: 'CNY', ...fields });
const payment = (amount, repaymentDate = '2026-02-28', fields = {}) => ({ id: 'p', debtId: 'a', amount, repaymentDate, note: '', ...fields });

test('money parsing produces exact safe integer cents and rejects rounding, coercion and excess decimals', () => {
  for (const [input, expected] of [['0.01', 1], [0.29, 29], ['+12.30', 1230], ['-2.05', -205], ['.5', 50], [' 1.20 ', 120], [0, 0], ['-0', 0]]) {
    assert.equal(parseMoney(input), expected);
  }
  for (const value of [null, undefined, '', ' ', true, false, {}, NaN, Infinity, '1,000', '￥20', '1e2', '1.', '1.001', 0.1 + 0.2, '90071992547409.92']) {
    assert.equal(parseMoney(value), null, `${String(value)} must not become a rounded or fabricated amount`);
  }
  assert.equal(parseMoney('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  assert.equal(parseMoney('-90071992547409.91'), -Number.MAX_SAFE_INTEGER);
});

test('debt validation normalizes CNY fields while preserving optional cycle and informational interest', () => {
  const result = validateDebt({ ...debt({}), name: '  房贷  ', creditor: ' 银行 ', originalAmount: '1000.25', plannedPayment: '', interestRate: '3.75', note: ' 备注 ' }, '2026-02-01');
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, { name: '房贷', creditor: '银行', originalAmount: 1000.25, debtDate: '2026-01-31', dueDate: null,
    repaymentCycle: 'MONTHLY', plannedPayment: null, customIntervalDays: null, interestRate: 3.75, note: '备注', currency: 'CNY' });
  assert.deepEqual(DEBT_CYCLES.map(item => item.value), ['NONE', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']);
  assert.ok(DEBT_CYCLES.every(item => typeof item.label === 'string' && /[\u4e00-\u9fff]/.test(item.label)));
});

test('debt validation rejects invalid dates, future origin, unsupported currencies and invalid money or intervals', () => {
  const result = validateDebt(debt({ name: ' ', originalAmount: '-1', debtDate: '2026-02-29', dueDate: '2026-04-31',
    repaymentCycle: 'CUSTOM', plannedPayment: '10.001', customIntervalDays: '1.5', interestRate: '-0.1', currency: 'USD' }), '2026-03-01');
  for (const key of ['name', 'originalAmount', 'debtDate', 'dueDate', 'plannedPayment', 'customIntervalDays', 'interestRate', 'currency']) assert.ok(result.errors[key], key);
  assert.ok(validateDebt(debt({ debtDate: '2026-03-02' }), '2026-03-01').errors.debtDate);
  assert.ok(validateDebt(debt({ dueDate: '2026-01-30' }), '2026-03-01').errors.dueDate);
  assert.ok(validateDebt(debt({ repaymentCycle: 'WEEKLY' }), '2026-03-01').errors.repaymentCycle);
  assert.ok(validateDebt(debt({ originalAmount: '90071992547409.91' }), '2026-03-01').errors.originalAmount, 'normalization to yuan must not lose one cent at extreme magnitudes');
  assert.ok(validateDebt(debt({}), '2026-13-01').errors.today);
});

test('repayment validation permits actual overpayment but requires valid positive money and chronological dates', () => {
  const item = debt({});
  assert.deepEqual(validateRepayment({ amount: '1500.25', repaymentDate: '2026-02-28', note: ' 已付 ' }, item, '2026-03-01'),
    { errors: {}, value: { amount: 1500.25, repaymentDate: '2026-02-28', note: '已付' } });
  for (const amount of [0, -1, '1.001', null]) assert.ok(validateRepayment({ amount, repaymentDate: '2026-02-28' }, item, '2026-03-01').errors.amount);
  for (const repaymentDate of ['2026-01-30', '2026-03-02', '2026-02-29', '2026-02-28T00:00:00Z']) {
    assert.ok(validateRepayment({ amount: 1, repaymentDate }, item, '2026-03-01').errors.repaymentDate);
  }
  assert.ok(validateRepayment(payment(1), { ...item, currency: 'USD' }, '2026-03-01').errors.currency);
});

test('adding, editing and deleting repayments recomputes debt totals from source records without mutation', () => {
  const item = Object.freeze(debt({ originalAmount: 1, repaymentCycle: 'NONE', dueDate: '2026-03-01' }));
  const first = Object.freeze(payment(0.1));
  const second = Object.freeze(payment(0.2, '2026-02-28', { id: 'p2' }));
  const records = Object.freeze([first, second]);
  const derived = deriveDebt(item, records, '2026-03-01');
  assert.equal(derived.totalPaid, 0.3);
  assert.equal(derived.remainingAmount, 0.7);
  assert.equal(derived.progress, 0.3);
  const edited = deriveDebt(item, [first, { ...second, amount: 0.4 }], '2026-03-01');
  assert.equal(edited.totalPaid, 0.5);
  assert.equal(edited.remainingAmount, 0.5);
  assert.equal(deriveDebt(item, [first], '2026-03-01').totalPaid, 0.1);
  assert.equal(deriveDebt(item, [], '2026-03-01').remainingAmount, 1);
  assert.deepEqual(records, [first, second]);
  assert.equal(second.amount, 0.2);
});

test('overpayment remains visible without clearing another debt, while total progress uses cumulative payments', () => {
  const a = debt({ originalAmount: 100 });
  const b = debt({ id: 'b', originalAmount: 100 });
  const records = [payment(150)];
  const result = deriveDebt(a, records, '2026-03-01');
  assert.equal(result.totalPaid, 150);
  assert.equal(result.overpaymentAmount, 50);
  assert.equal(result.remainingAmount, 0);
  assert.equal(result.progress, 1);
  assert.equal(result.status, 'SETTLED');
  assert.equal(result.nextPaymentDate, null);
  assert.equal(result.monthlyDue, 0);
  const overview = buildDebtOverview([a, b], records, '2026-03-01');
  assert.equal(overview.originalTotal, 200);
  assert.equal(overview.totalPaid, 150);
  assert.equal(overview.remainingTotal, 100);
  assert.equal(overview.progress, 0.75, 'the specified formula is cumulative repayments divided by original principal');
  assert.equal(overview.activeCount, 1);
  assert.equal(overview.settledCount, 1);
  const fullyProgressed = buildDebtOverview([a, b], [payment(250)], '2026-03-01');
  assert.equal(fullyProgressed.progress, 1, 'display progress caps at 100%');
  assert.equal(fullyProgressed.remainingTotal, 100, '100% progress must not conceal another debt’s unpaid principal');
  assert.equal(fullyProgressed.totalPaid, 250);
  assert.equal(fullyProgressed.debts.find(item => item.id === 'a').overpaymentAmount, 150);
});

test('monthly plans clamp each occurrence to month length and then recover the original anchor day', () => {
  const item = debt({});
  assert.equal(deriveDebt(item, [], '2026-02-28').nextPaymentDate, '2026-02-28');
  for (const [paid, paymentDate, today, expected] of [
    [100, '2026-02-28', '2026-03-01', '2026-03-31'],
    [200, '2026-03-31', '2026-04-01', '2026-04-30'],
    [300, '2026-04-30', '2026-05-01', '2026-05-31'],
  ]) assert.equal(deriveDebt(item, [payment(paid, paymentDate)], today).nextPaymentDate, expected);
  assert.equal(deriveDebt(debt({ debtDate: '2024-01-31' }), [], '2024-02-01').nextPaymentDate, '2024-02-29');
});

test('quarterly, yearly and custom plans preserve calendar anchors and exact day intervals', () => {
  const quarterly = debt({ debtDate: '2025-11-30', repaymentCycle: 'QUARTERLY' });
  assert.equal(deriveDebt(quarterly, [], '2026-02-01').nextPaymentDate, '2026-02-28');
  assert.equal(deriveDebt(quarterly, [payment(100)], '2026-03-01').nextPaymentDate, '2026-05-30');
  const yearly = debt({ originalAmount: 5000, debtDate: '2024-02-29', repaymentCycle: 'YEARLY', plannedPayment: 1000 });
  assert.equal(deriveDebt(yearly, [], '2025-01-01').nextPaymentDate, '2025-02-28');
  assert.equal(deriveDebt(yearly, [payment(3000, '2027-02-28')], '2027-03-01').nextPaymentDate, '2028-02-29');
  assert.equal(deriveDebt(debt({ repaymentCycle: 'CUSTOM', customIntervalDays: 30 }), [], '2026-02-01').nextPaymentDate, '2026-03-02');
});

test('fixed installments end in the exact residual cents and interest does not change principal planning', () => {
  const item = debt({ originalAmount: 1, debtDate: '2026-01-01', plannedPayment: 0.3, interestRate: 99.99 });
  const repayments = [payment(0.9, '2026-04-01')];
  const result = deriveDebt(item, repayments, '2026-05-01');
  assert.equal(result.remainingAmount, 0.1);
  assert.equal(result.nextPaymentDate, '2026-05-01');
  assert.equal(result.monthlyDue, 0.1);
  assert.equal(result.monthlyDue, deriveDebt({ ...item, interestRate: null }, repayments, '2026-05-01').monthlyDue);
});

test('an earlier final due date accelerates all remaining principal, including before the first installment', () => {
  const item = debt({ dueDate: '2026-04-15' });
  const result = deriveDebt(item, [payment(200, '2026-03-31')], '2026-04-10');
  assert.equal(result.nextPaymentDate, '2026-04-15');
  assert.equal(result.monthlyDue, 800);
  assert.equal(result.status, 'DUE_SOON');
  const first = deriveDebt(debt({ dueDate: '2026-02-15' }), [], '2026-02-01');
  assert.equal(first.nextPaymentDate, '2026-02-15');
  assert.equal(first.monthlyDue, 1000);
});

test('absent or ineffective periodic payment amounts use a due-date lump sum without manufacturing zero installments', () => {
  for (const plannedPayment of [null, undefined, 0, '', 'invalid', -1]) {
    const result = deriveDebt(debt({ plannedPayment, dueDate: '2026-03-15' }), [], '2026-03-01');
    assert.equal(result.nextPaymentDate, '2026-03-15');
    assert.equal(result.monthlyDue, 1000);
  }
  const undated = deriveDebt(debt({ repaymentCycle: 'NONE' }), [], '2026-09-23');
  assert.equal(undated.nextPaymentDate, null);
  assert.equal(undated.monthlyDue, 0);
  assert.equal(undated.status, 'NORMAL');
});

test('FIFO settles earlier arrears before current-month installments and supports prepayments', () => {
  const item = debt({ originalAmount: 500, debtDate: '2026-01-01' });
  for (const [paid, nextDate, monthlyDue] of [[50, '2026-02-01', 100], [150, '2026-03-01', 50], [200, '2026-04-01', 0], [250, '2026-04-01', 0]]) {
    const result = deriveDebt(item, [payment(paid, '2026-02-15')], '2026-03-15');
    assert.equal(result.nextPaymentDate, nextDate);
    assert.equal(result.monthlyDue, monthlyDue);
  }
  const shuffled = [payment(100, '2026-03-05', { id: 'p2' }), payment(50, '2026-02-05')];
  assert.deepEqual(deriveDebt(item, shuffled, '2026-03-15'), deriveDebt(item, [...shuffled].reverse(), '2026-03-15'));
});

test('due status includes today and the seventh day, and overdue dates remain the next payment date', () => {
  for (const [dueDate, status] of [['2026-09-22', 'OVERDUE'], ['2026-09-23', 'DUE_SOON'], ['2026-09-30', 'DUE_SOON'], ['2026-10-01', 'NORMAL']]) {
    const result = deriveDebt(debt({ repaymentCycle: 'NONE', dueDate }), [], '2026-09-23');
    assert.equal(result.status, status);
    assert.equal(result.nextPaymentDate, dueDate);
    assert.equal(result.monthlyDue, dueDate < '2026-10-01' ? 1000 : 0);
  }
});

test('only this debt’s valid CNY repayments within the as-of date contribute to its totals', () => {
  const records = [payment(100), payment(999, '2026-03-02'), payment(999, '2026-01-30'), payment(999, '2026-02-30'),
    payment(999, '2026-02-28', { debtId: 'other' }), payment(999, '2026-02-28', { currency: 'USD' }), payment(-100), payment('1.001')];
  const result = deriveDebt(debt({}), records, '2026-03-01');
  assert.equal(result.totalPaid, 100);
  assert.equal(result.remainingAmount, 900);
});

test('overview sorts by urgency and date, excludes foreign currencies, and keeps empty totals explicit', () => {
  const items = [debt({ id: 'undated', repaymentCycle: 'NONE' }), debt({ id: 'settled' }),
    debt({ id: 'normal', repaymentCycle: 'NONE', dueDate: '2026-10-01' }),
    debt({ id: 'soon', repaymentCycle: 'NONE', dueDate: '2026-09-25' }),
    debt({ id: 'overdue', repaymentCycle: 'NONE', dueDate: '2026-09-01' }), debt({ id: 'usd', currency: 'USD' })];
  const result = buildDebtOverview(items, [payment(1000, '2026-09-01', { debtId: 'settled' })], '2026-09-23');
  assert.deepEqual(result.debts.map(item => item.id), ['overdue', 'soon', 'normal', 'undated', 'settled']);
  assert.equal(result.originalTotal, 5000);
  assert.equal(result.remainingTotal, 4000);
  assert.equal(result.monthlyDue, 2000);
  assert.equal(result.excludedCurrencyCount, 1);
  assert.equal(items[0].id, 'undated', 'sorting must not mutate source order');
  const tied = buildDebtOverview([
    debt({ id: 'first', originalAmount: 100, repaymentCycle: 'NONE' }),
    debt({ id: 'second', originalAmount: 1000, repaymentCycle: 'NONE' }),
  ], [], '2026-09-23');
  assert.deepEqual(tied.debts.map(item => item.id), ['first', 'second'], 'equal dates retain input order rather than adding an amount-based ranking');
  assert.throws(() => deriveDebt(items.at(-1), [], '2026-09-23'), /人民币/);
  assert.deepEqual(buildDebtOverview([], [], '2026-09-23'), { debts: [], originalTotal: 0, totalPaid: 0, remainingTotal: 0,
    monthlyDue: 0, progress: 0, activeCount: 0, settledCount: 0, excludedCurrencyCount: 0 });
});

test('very large installment counts use arithmetic without materializing schedules or overflowing dates', () => {
  const item = debt({ originalAmount: 1_000_000_000, plannedPayment: 0.01 });
  const result = deriveDebt(item, [], '2026-02-01');
  assert.equal(result.nextPaymentDate, '2026-02-28');
  assert.equal(result.monthlyDue, 0.01);
  const farAhead = deriveDebt(item, [payment(999_999_999.99, '2026-02-01')], '2026-02-01');
  assert.equal(farAhead.remainingAmount, 0.01);
  assert.equal(farAhead.nextPaymentDate, null);
  assert.match(farAhead.scheduleWarning, /超出支持范围/);
  assert.throws(() => deriveDebt(debt({}), [payment('90071992547409.90'), payment('90071992547409.90')], '2026-03-01'), /安全范围/);
  assert.throws(() => deriveDebt(debt({}), [], '2026-02-30'), /日期无效/);
});
