const debtFields = ['name', 'creditor', 'originalAmount', 'debtDate', 'dueDate', 'repaymentCycle', 'plannedPayment', 'customIntervalDays', 'interestRate', 'note', 'currency'];
const repaymentFields = ['debtId', 'amount', 'repaymentDate', 'note'];

const matches = (actual, expected, fields) => Boolean(actual) && fields.every(field => (actual[field] ?? null) === (expected[field] ?? null));

// A timed-out request may already have committed. Only an authoritative reload
// can confirm the requested final state; a transport error alone cannot.
export function debtMutationReflected(method, payload, data) {
  if (!data || !Array.isArray(data.debts) || !Array.isArray(data.repayments)) return false;
  if (method === 'saveDebt') return matches(data.debts.find(row => row.id === payload.id), payload, debtFields);
  if (method === 'deleteDebt') return !data.debts.some(row => row.id === payload);
  if (method === 'saveRepayment') return matches(data.repayments.find(row => row.id === payload.id), payload, repaymentFields);
  if (method === 'deleteRepayment') return !data.repayments.some(row => row.id === payload);
  if (method === 'saveBulkRepayments') return Array.isArray(payload) && payload.length > 0
    && payload.every(expected => matches(data.repayments.find(row => row.id === expected.id), expected, repaymentFields));
  return false;
}
