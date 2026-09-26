import test from 'node:test';
import assert from 'node:assert/strict';
import { debtMutationReflected } from '../src/lib/debtMutationReconciliation.js';

const debt = {
  id: 'debt-1', name: '借款', creditor: '', originalAmount: 1000, debtDate: '2026-09-01',
  dueDate: null, repaymentCycle: 'NONE', plannedPayment: null, customIntervalDays: null,
  interestRate: null, note: '', currency: 'CNY',
};
const repayment = { id: 'repayment-1', debtId: debt.id, amount: 200, repaymentDate: '2026-09-20', note: '银行转账' };

test('an uncertain bulk response counts as committed only after every stable row ID and value is reread', () => {
  const second = { ...repayment, id: 'repayment-2', amount: 300 };
  assert.equal(debtMutationReflected('saveBulkRepayments', [repayment, second], { debts: [debt], repayments: [repayment] }), false);
  assert.equal(debtMutationReflected('saveBulkRepayments', [repayment, second], { debts: [debt], repayments: [repayment, second] }), true);
  assert.equal(debtMutationReflected('saveBulkRepayments', [repayment, second], { debts: [debt], repayments: [repayment, { ...second, amount: 301 }] }), false);
  assert.equal(debtMutationReflected('saveBulkRepayments', [repayment, second], null), false);
});

test('edits and deletes are confirmed against reread source rows, not a transport response', () => {
  assert.equal(debtMutationReflected('saveDebt', debt, { debts: [debt], repayments: [] }), true);
  assert.equal(debtMutationReflected('saveDebt', debt, { debts: [{ ...debt, originalAmount: 999 }], repayments: [] }), false);
  assert.equal(debtMutationReflected('saveRepayment', repayment, { debts: [debt], repayments: [repayment] }), true);
  assert.equal(debtMutationReflected('deleteRepayment', repayment.id, { debts: [debt], repayments: [repayment] }), false);
  assert.equal(debtMutationReflected('deleteRepayment', repayment.id, { debts: [debt], repayments: [] }), true);
  assert.equal(debtMutationReflected('deleteDebt', debt.id, { debts: [], repayments: [] }), true);
});
