// Standalone, fixed-principal planning only. Interest is descriptive metadata.
// Callers supply today so these functions do not depend on a clock or timezone.
export const DEBT_CYCLES = Object.freeze([
  { value: 'NONE', label: '不设周期' },
  { value: 'MONTHLY', label: '每月' },
  { value: 'QUARTERLY', label: '每季度' },
  { value: 'YEARLY', label: '每年' },
  { value: 'CUSTOM', label: '自定义天数' },
].map(Object.freeze));

const DAY_MS = 86400000;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const MONTH_STEPS = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };
const text = value => typeof value === 'string' ? value.trim() : '';
const empty = value => value == null || (typeof value === 'string' && value.trim() === '');
const currencyOf = item => empty(item?.currency) ? 'CNY' : text(item.currency).toUpperCase();

export function parseMoney(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const raw = String(value).trim();
  if (!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) return null;
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace(/^[+-]/, '').split('.');
  const cents = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  if (cents > MAX_CENTS) return null;
  return Number(negative ? -cents : cents);
}

function dateKey(value) {
  const date = text(value);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

const dayNumber = date => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const LAST_DAY = dayNumber('9999-12-31');
const fromDay = day => Number.isSafeInteger(day) && day <= LAST_DAY
  ? new Date(day * DAY_MS).toISOString().slice(0, 10) : null;

function positiveInteger(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\d+$/.test(String(value).trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonnegativeNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\+?(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(value).trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function validateDebt(input = {}, today) {
  const errors = {};
  const currentDate = dateKey(today);
  const originalCents = parseMoney(input.originalAmount);
  const plannedCents = empty(input.plannedPayment) ? null : parseMoney(input.plannedPayment);
  const cycle = text(input.repaymentCycle) || 'NONE';
  const interval = empty(input.customIntervalDays) ? null : positiveInteger(input.customIntervalDays);
  const interestRate = empty(input.interestRate) ? null : nonnegativeNumber(input.interestRate);
  const value = {
    name: text(input.name), creditor: text(input.creditor),
    originalAmount: originalCents === null ? null : originalCents / 100,
    debtDate: dateKey(input.debtDate), dueDate: empty(input.dueDate) ? null : dateKey(input.dueDate),
    repaymentCycle: cycle, plannedPayment: plannedCents === null ? null : plannedCents / 100,
    customIntervalDays: cycle === 'CUSTOM' ? interval : null,
    interestRate, note: text(input.note), currency: currencyOf(input),
  };
  if (!currentDate) errors.today = '当前日期无效';
  if (!value.name) errors.name = '请输入欠款名称';
  if (originalCents === null || originalCents <= 0) errors.originalAmount = '请输入大于零、最多两位小数的本金';
  else if (parseMoney(value.originalAmount) !== originalCents) errors.originalAmount = '本金金额超出可精确表示的范围';
  if (!value.debtDate) errors.debtDate = '请输入有效的欠款日期';
  else if (currentDate && value.debtDate > currentDate) errors.debtDate = '欠款日期不能晚于今天';
  if (!empty(input.dueDate) && !value.dueDate) errors.dueDate = '请输入有效的到期日期';
  else if (value.dueDate && value.debtDate && value.dueDate < value.debtDate) errors.dueDate = '到期日期不能早于欠款日期';
  if (!DEBT_CYCLES.some(item => item.value === cycle)) errors.repaymentCycle = '请选择有效的还款周期';
  if (!empty(input.plannedPayment) && (plannedCents === null || plannedCents <= 0)) errors.plannedPayment = '计划还款须大于零且最多两位小数';
  else if (plannedCents !== null && parseMoney(value.plannedPayment) !== plannedCents) errors.plannedPayment = '计划金额超出可精确表示的范围';
  if (cycle === 'CUSTOM' && interval === null) errors.customIntervalDays = '请输入大于零的整数天数';
  if (!empty(input.interestRate) && interestRate === null) errors.interestRate = '利率须为不小于零的有效数值';
  if (value.currency !== 'CNY') errors.currency = '本轮仅支持人民币欠款';
  return { errors, value };
}

export function validateRepayment(input = {}, debt = {}, today) {
  const errors = {};
  const currentDate = dateKey(today);
  const debtDate = dateKey(debt.debtDate);
  const cents = parseMoney(input.amount);
  const value = { amount: cents === null ? null : cents / 100, repaymentDate: dateKey(input.repaymentDate), note: text(input.note) };
  if (!currentDate) errors.today = '当前日期无效';
  if (cents === null || cents <= 0) errors.amount = '请输入大于零、最多两位小数的还款金额';
  else if (parseMoney(value.amount) !== cents) errors.amount = '还款金额超出可精确表示的范围';
  if (!value.repaymentDate) errors.repaymentDate = '请输入有效的还款日期';
  else if (!debtDate) errors.repaymentDate = '请先设置有效的欠款日期';
  else if (value.repaymentDate < debtDate) errors.repaymentDate = '还款日期不能早于欠款日期';
  else if (currentDate && value.repaymentDate > currentDate) errors.repaymentDate = '还款日期不能晚于今天';
  if (currencyOf(debt) !== 'CNY' || currencyOf(input) !== 'CNY') errors.currency = '本轮仅支持人民币还款';
  return { errors, value };
}

function addCents(left, right) {
  const sum = BigInt(left) + BigInt(right);
  if (sum > MAX_CENTS || sum < -MAX_CENTS) throw new RangeError('金额合计超出安全范围');
  return Number(sum);
}

function yuan(cents) {
  const amount = cents / 100;
  if (parseMoney(amount) !== cents) throw new RangeError('金额超出可精确表示的范围');
  return amount;
}

function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function anchoredMonthDate(start, offset) {
  const [year, month, day] = start.split('-').map(Number);
  const absoluteMonth = (year - 1) * 12 + month - 1;
  if (offset > 9999 * 12 - 1 - absoluteMonth) return null;
  const resultMonth = absoluteMonth + offset;
  const resultYear = Math.floor(resultMonth / 12) + 1;
  const resultMonthOfYear = resultMonth % 12 + 1;
  return `${String(resultYear).padStart(4, '0')}-${String(resultMonthOfYear).padStart(2, '0')}-${String(Math.min(day, daysInMonth(resultYear, resultMonthOfYear))).padStart(2, '0')}`;
}

function buildPlan(debt, principal) {
  const start = dateKey(debt.debtDate);
  const parsedDue = dateKey(debt.dueDate);
  const due = parsedDue && parsedDue >= start ? parsedDue : null;
  const amount = parseMoney(debt.plannedPayment);
  const step = MONTH_STEPS[debt.repaymentCycle];
  const interval = debt.repaymentCycle === 'CUSTOM' ? positiveInteger(debt.customIntervalDays) : null;
  const regular = amount !== null && amount > 0 && Boolean(step || interval);
  const startDay = dayNumber(start);
  const nthDate = index => {
    if (!regular) return null;
    if (step) return index > Math.floor((9999 * 12) / step) ? null : anchoredMonthDate(start, index * step);
    return index > Math.floor((LAST_DAY - startDay) / interval) ? null : fromDay(startDay + index * interval);
  };
  const countThrough = date => {
    if (!regular || date < start) return 0;
    if (interval) return Math.floor((dayNumber(date) - startDay) / interval);
    const [year, month] = date.split('-').map(Number);
    const [startYear, startMonth] = start.split('-').map(Number);
    let count = Math.floor(((year - startYear) * 12 + month - startMonth) / step);
    if (count > 0 && nthDate(count) > date) count -= 1;
    return Math.max(0, count);
  };
  return {
    scheduledThrough(date) {
      if (due && date >= due) return principal;
      if (!regular) return 0;
      const total = BigInt(countThrough(date)) * BigInt(amount);
      return total >= BigInt(principal) ? principal : Number(total);
    },
    nextDate(paid) {
      if (paid >= principal) return null;
      if (!regular) return due;
      const next = nthDate(Number(BigInt(paid) / BigInt(amount) + 1n));
      return due && (!next || due < next) ? due : next;
    },
    regular,
  };
}

function calculateDebt(debt, repayments, today) {
  if (currencyOf(debt) !== 'CNY') throw new RangeError('本轮仅支持人民币欠款');
  const principal = parseMoney(debt.originalAmount);
  const start = dateKey(debt.debtDate);
  if (principal === null || principal <= 0 || !start || start > today) throw new RangeError('欠款本金或日期无效');
  let paid = 0;
  for (const repayment of Array.isArray(repayments) ? repayments : []) {
    if (debt.id == null || repayment?.debtId !== debt.id || currencyOf(repayment) !== 'CNY') continue;
    const date = dateKey(repayment.repaymentDate);
    const cents = parseMoney(repayment.amount);
    if (!date || date < start || date > today || cents === null || cents <= 0) continue;
    paid = addCents(paid, cents);
  }
  const remaining = Math.max(0, principal - paid);
  const plan = buildPlan(debt, principal);
  const nextPaymentDate = remaining ? plan.nextDate(paid) : null;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split('-').map(Number);
  const monthEnd = `${today.slice(0, 7)}-${daysInMonth(year, month)}`;
  const beforeMonth = fromDay(dayNumber(monthStart) - 1);
  const before = beforeMonth ? plan.scheduledThrough(beforeMonth) : 0;
  // FIFO: today's cumulative repayments retire the earliest scheduled principal.
  // Only the unpaid portion in this month is counted; earlier arrears stay separate.
  const monthly = Math.max(0, plan.scheduledThrough(monthEnd) - Math.max(paid, before));
  const status = !remaining ? 'SETTLED' : !nextPaymentDate ? 'NORMAL'
    : nextPaymentDate < today ? 'OVERDUE'
      : dayNumber(nextPaymentDate) - dayNumber(today) <= 7 ? 'DUE_SOON' : 'NORMAL';
  return { principal, paid, remaining, monthly, value: {
    ...debt, currency: 'CNY', totalPaid: yuan(paid), remainingAmount: yuan(remaining),
    progress: Math.min(1, paid / principal), status, nextPaymentDate,
    monthlyDue: yuan(monthly), overpaymentAmount: yuan(Math.max(0, paid - principal)),
    ...(remaining && plan.regular && !nextPaymentDate ? { scheduleWarning: '下一期日期超出支持范围' } : {}),
  } };
}

export function deriveDebt(debt, repayments = [], today) {
  const currentDate = dateKey(today);
  if (!currentDate) throw new RangeError('当前日期无效');
  return calculateDebt(debt, repayments, currentDate).value;
}

export function buildDebtOverview(debts = [], repayments = [], today) {
  const currentDate = dateKey(today);
  if (!currentDate) throw new RangeError('当前日期无效');
  const all = Array.isArray(debts) ? debts : [];
  const included = all.filter(debt => currencyOf(debt) === 'CNY');
  const rows = included.map(debt => calculateDebt(debt, repayments, currentDate));
  const total = field => rows.reduce((sum, row) => addCents(sum, row[field]), 0);
  const original = total('principal');
  const paid = total('paid');
  const remaining = total('remaining');
  const sorted = rows.map((row, index) => ({ ...row, index })).sort((left, right) => (
    Number(left.remaining === 0) - Number(right.remaining === 0)
    || (left.value.nextPaymentDate || '9999-99-99').localeCompare(right.value.nextPaymentDate || '9999-99-99')
    || left.index - right.index
  ));
  return {
    debts: sorted.map(row => row.value), originalTotal: yuan(original), totalPaid: yuan(paid),
    remainingTotal: yuan(remaining), monthlyDue: yuan(total('monthly')),
    progress: original ? Math.min(paid / original, 1) : 0,
    activeCount: rows.filter(row => row.remaining > 0).length,
    settledCount: rows.filter(row => row.remaining === 0).length,
    excludedCurrencyCount: all.length - included.length,
  };
}
