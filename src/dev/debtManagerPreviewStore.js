export const DEBT_PREVIEW_STORAGE_KEY = 'quote:debt-manager:preview:v1';

const SCHEMA_VERSION = 1;
const CYCLES = new Set(['NONE', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']);
const DEBT_FIELDS = ['id', 'name', 'creditor', 'originalAmount', 'debtDate', 'dueDate', 'repaymentCycle', 'plannedPayment', 'customIntervalDays', 'interestRate', 'note', 'currency', 'createdAt', 'updatedAt'];
const REPAYMENT_FIELDS = ['id', 'debtId', 'amount', 'repaymentDate', 'note', 'createdAt', 'updatedAt'];
const READ_ERROR = '无法读取本地演示数据，请检查浏览器存储权限。';
const WRITE_ERROR = '本地演示数据未保存，请检查浏览器存储权限或剩余空间。';
const CORRUPT_ERROR = '本地演示数据已损坏或版本不兼容，未自动覆盖；请检查后再选择重置示例。';
const INVALID_ERROR = '欠款或还款记录格式不正确，未保存。';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const nonempty = value => text(value) && value.trim().length > 0;
const positiveMoney = value => typeof value === 'number' && Number.isFinite(value) && value > 0
  && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const timestamp = value => nonempty(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const isoDate = value => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const pick = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]));

function validData(data) {
  if (!record(data) || !Array.isArray(data.debts) || !Array.isArray(data.repayments)) return false;
  const debtIds = new Set();
  const repaymentIds = new Set();
  for (const debt of data.debts) {
    if (!record(debt) || !nonempty(debt.id) || debtIds.has(debt.id)
      || !nonempty(debt.name) || !text(debt.creditor) || !positiveMoney(debt.originalAmount)
      || !isoDate(debt.debtDate) || !(debt.dueDate === null || isoDate(debt.dueDate))
      || (debt.dueDate !== null && debt.dueDate < debt.debtDate)
      || !CYCLES.has(debt.repaymentCycle)
      || !(debt.plannedPayment === null || positiveMoney(debt.plannedPayment))
      || !(debt.customIntervalDays === null || (Number.isSafeInteger(debt.customIntervalDays) && debt.customIntervalDays > 0))
      || (debt.repaymentCycle === 'CUSTOM' && debt.customIntervalDays === null)
      || !(debt.interestRate === null || (typeof debt.interestRate === 'number' && Number.isFinite(debt.interestRate) && debt.interestRate >= 0))
      || !text(debt.note) || debt.currency !== 'CNY' || !timestamp(debt.createdAt) || !timestamp(debt.updatedAt)) return false;
    debtIds.add(debt.id);
  }
  for (const repayment of data.repayments) {
    if (!record(repayment) || !nonempty(repayment.id) || repaymentIds.has(repayment.id)
      || !debtIds.has(repayment.debtId) || !positiveMoney(repayment.amount)
      || !isoDate(repayment.repaymentDate) || !text(repayment.note)
      || !timestamp(repayment.createdAt) || !timestamp(repayment.updatedAt)) return false;
    repaymentIds.add(repayment.id);
  }
  return true;
}

function cleanData(data) {
  return {
    debts: data.debts.map(debt => pick(debt, DEBT_FIELDS)),
    repayments: data.repayments.map(repayment => pick(repayment, REPAYMENT_FIELDS)),
  };
}

function decode(raw) {
  try {
    const stored = JSON.parse(raw);
    return record(stored) && stored.schemaVersion === SCHEMA_VERSION && validData(stored) ? cleanData(stored) : null;
  } catch {
    return null;
  }
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function createDebtPreviewSeed(today = new Date()) {
  const day = today instanceof Date && Number.isFinite(today.getTime()) ? localDate(today) : today;
  if (!isoDate(day)) throw new TypeError('示例日期必须是有效日期。');
  const [year, month] = day.split('-').map(Number);
  const shiftDays = amount => new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
  const priorMonth28 = amount => new Date(Date.UTC(year, month - 1 - amount, 28)).toISOString().slice(0, 10);
  const stamp = date => `${date}T00:00:00.000Z`;
  const updatedAt = stamp(day);
  const debt = values => ({
    creditor: '', dueDate: null, repaymentCycle: 'NONE', plannedPayment: null,
    customIntervalDays: null, interestRate: null, note: '仅供本地交互演示', currency: 'CNY',
    ...values, createdAt: stamp(values.debtDate), updatedAt,
  });
  const repayment = (id, debtId, amount, repaymentDate) => ({
    id, debtId, amount, repaymentDate, note: '示例已还记录', createdAt: stamp(repaymentDate), updatedAt: stamp(repaymentDate),
  });
  return {
    debts: [
      debt({ id: 'demo-debt-supplier', name: '供应商借款', creditor: '示例供应商', originalAmount: 2000000, debtDate: `${year - 1}-01-15`, dueDate: `${year}-12-31` }),
      debt({ id: 'demo-debt-renovation', name: '装修借款', creditor: '示例装修方', originalAmount: 400000, debtDate: priorMonth28(4), repaymentCycle: 'MONTHLY', plannedPayment: 80000 }),
      debt({ id: 'demo-debt-friend', name: '亲友周转', creditor: '示例亲友', originalAmount: 100000, debtDate: shiftDays(-60), dueDate: shiftDays(5) }),
    ],
    repayments: [
      repayment('demo-repayment-supplier', 'demo-debt-supplier', 500000, shiftDays(-90)),
      repayment('demo-repayment-renovation', 'demo-debt-renovation', 100000, priorMonth28(1)),
      repayment('demo-repayment-friend', 'demo-debt-friend', 50000, shiftDays(-20)),
    ],
  };
}

// Resolve browser storage inside each guarded operation: some browsers throw
// SecurityError while merely accessing localStorage. No other key is inspected.
export function createDebtPreviewStore(storage) {
  const resolveStorage = () => {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') throw new Error('Storage unavailable');
    return target;
  };
  const load = () => {
    let raw;
    try {
      raw = resolveStorage().getItem(DEBT_PREVIEW_STORAGE_KEY);
    } catch {
      return { data: null, error: READ_ERROR };
    }
    if (raw === null) return { data: createDebtPreviewSeed(), error: null };
    const data = decode(raw);
    return data ? { data, error: null } : { data: null, error: CORRUPT_ERROR };
  };
  const save = data => {
    if (!validData(data)) return { ok: false, error: INVALID_ERROR };
    let target;
    try {
      target = resolveStorage();
      const raw = target.getItem(DEBT_PREVIEW_STORAGE_KEY);
      if (raw !== null && !decode(raw)) return { ok: false, error: CORRUPT_ERROR };
    } catch {
      return { ok: false, error: READ_ERROR };
    }
    try {
      target.setItem(DEBT_PREVIEW_STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...cleanData(data) }));
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: WRITE_ERROR };
    }
  };
  const reset = () => {
    const data = createDebtPreviewSeed();
    try {
      resolveStorage().setItem(DEBT_PREVIEW_STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...data }));
      return { ok: true, data, error: null };
    } catch {
      return { ok: false, data: null, error: WRITE_ERROR };
    }
  };
  return { load, save, reset };
}
