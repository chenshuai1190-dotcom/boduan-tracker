import { parseMoney, validateDebt, validateRepayment } from './debtManager.js';

const DEBTS = 'personal_debts';
const REPAYMENTS = 'personal_debt_repayments';
const READ_RPC = 'read_personal_debt_ledger';

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function failure(error, fallback) {
  return typeof error === 'string' && error ? error : error?.message || fallback;
}

function validMoney(value) {
  const cents = parseMoney(value);
  if (cents === null || cents <= 0) throw new Error('云端欠款金额无效，请暂勿修改并联系支持。');
  const amount = cents / 100;
  if (parseMoney(amount) !== cents) throw new Error('云端欠款金额超出安全范围。');
  return amount;
}

function mapDebt(row) {
  return {
    id: row.id,
    name: row.name,
    creditor: row.creditor,
    originalAmount: validMoney(row.original_amount),
    debtDate: row.debt_date,
    dueDate: row.due_date,
    repaymentCycle: row.repayment_cycle,
    plannedPayment: row.planned_payment == null ? null : validMoney(row.planned_payment),
    customIntervalDays: row.custom_interval_days,
    interestRate: row.interest_rate == null ? null : Number(row.interest_rate),
    note: row.note,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRepayment(row) {
  return {
    id: row.id,
    debtId: row.debt_id,
    amount: validMoney(row.amount),
    repaymentDate: row.repayment_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function debtWriteRow(value, userId, id) {
  return {
    ...(id ? { id } : {}),
    user_id: userId,
    name: value.name,
    creditor: value.creditor,
    original_amount: value.originalAmount,
    debt_date: value.debtDate,
    due_date: value.dueDate,
    repayment_cycle: value.repaymentCycle,
    planned_payment: value.plannedPayment,
    custom_interval_days: value.customIntervalDays,
    interest_rate: value.interestRate,
    note: value.note,
    currency: value.currency,
  };
}

function repaymentWriteRow(value, userId, debtId, id) {
  return {
    ...(id ? { id } : {}),
    user_id: userId,
    debt_id: debtId,
    amount: value.amount,
    repayment_date: value.repaymentDate,
    note: value.note,
  };
}

function firstError(errors) {
  return Object.values(errors)[0] || null;
}

// This store deliberately has no localStorage fallback: an unavailable or
// unreadable cloud ledger must never look like an empty or settled ledger.
export function createDebtCloudStore(client, userId) {
  const knownDebtIds = new Set();
  const knownRepaymentIds = new Set();
  let loaded = false;

  async function requireOwner() {
    if (!client?.from || !client?.rpc || !client?.auth?.getUser || !userId) throw new Error('欠款记录尚未连接到登录账户。');
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id || data.user.id !== userId) throw new Error('登录账户已切换，请重新打开欠款工具。');
  }

  async function requireLoadedOwner() {
    await requireOwner();
    if (!loaded) throw new Error('请先重新读取云端欠款记录。');
  }

  async function findDebt(debtId) {
    if (!debtId) throw new Error('请选择欠款记录。');
    const { data, error } = await client.from(DEBTS)
      .select('id,debt_date,currency')
      .eq('id', debtId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('欠款已被删除或当前账户无权访问，请刷新。');
    return { id: data.id, debtDate: data.debt_date, currency: data.currency };
  }

  return {
    async load() {
      try {
        await requireOwner();
        const { data, error } = await client.rpc(READ_RPC);
        if (error) throw error;
        if (data?.user_id !== userId || !Array.isArray(data?.debts) || !Array.isArray(data?.repayments)) {
          throw new Error('云端欠款记录不完整或登录账户已切换。');
        }
        const debts = data.debts.map(mapDebt);
        const repayments = data.repayments.map(mapRepayment);
        const debtIds = new Set(debts.map(row => row.id));
        if (repayments.some(row => !debtIds.has(row.debtId))) throw new Error('云端还款流水与欠款记录不一致。');
        knownDebtIds.clear();
        knownRepaymentIds.clear();
        debts.forEach(row => knownDebtIds.add(row.id));
        repayments.forEach(row => knownRepaymentIds.add(row.id));
        loaded = true;
        return { data: { debts, repayments }, error: null };
      } catch (error) {
        loaded = false;
        knownDebtIds.clear();
        knownRepaymentIds.clear();
        return { data: null, error: failure(error, '无法读取云端欠款记录。') };
      }
    },

    async saveDebt(debt) {
      try {
        await requireLoadedOwner();
        const checked = validateDebt(debt, localToday());
        const validationError = firstError(checked.errors);
        if (validationError) throw new Error(validationError);
        const id = debt?.id || null;
        const row = debtWriteRow(checked.value, userId, id);
        const isUpdate = id && knownDebtIds.has(id);
        const query = isUpdate
          ? client.from(DEBTS).update(row).eq('id', id).eq('user_id', userId)
          : client.from(DEBTS).insert(row);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('欠款已被其他设备修改或删除，请刷新后重试。');
        knownDebtIds.add(data.id);
        return { ok: true, error: null, id: data.id };
      } catch (error) {
        return { ok: false, error: failure(error, '欠款未保存，请重试。') };
      }
    },

    async deleteDebt(id) {
      try {
        await requireLoadedOwner();
        if (!id || !knownDebtIds.has(id)) throw new Error('欠款不存在，请刷新后重试。');
        const { data, error } = await client.from(DEBTS)
          .delete()
          .eq('id', id)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('欠款已被其他设备删除，请刷新后重试。');
        knownDebtIds.delete(id);
        return { ok: true, error: null };
      } catch (error) {
        return { ok: false, error: failure(error, '欠款未删除，请重试。') };
      }
    },

    async saveRepayment(repayment) {
      try {
        await requireLoadedOwner();
        const parent = await findDebt(repayment?.debtId);
        const checked = validateRepayment(repayment, parent, localToday());
        const validationError = firstError(checked.errors);
        if (validationError) throw new Error(validationError);
        const id = repayment?.id || null;
        const row = repaymentWriteRow(checked.value, userId, parent.id, id);
        const isUpdate = id && knownRepaymentIds.has(id);
        const query = isUpdate
          ? client.from(REPAYMENTS).update(row).eq('id', id).eq('debt_id', parent.id).eq('user_id', userId)
          : client.from(REPAYMENTS).insert(row);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('还款已被其他设备修改或删除，请刷新后重试。');
        knownRepaymentIds.add(data.id);
        return { ok: true, error: null, id: data.id };
      } catch (error) {
        return { ok: false, error: failure(error, '还款未保存，请重试。') };
      }
    },

    async deleteRepayment(id) {
      try {
        await requireLoadedOwner();
        if (!id || !knownRepaymentIds.has(id)) throw new Error('还款不存在，请刷新后重试。');
        const { data, error } = await client.from(REPAYMENTS)
          .delete()
          .eq('id', id)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('还款已被其他设备删除，请刷新后重试。');
        knownRepaymentIds.delete(id);
        return { ok: true, error: null };
      } catch (error) {
        return { ok: false, error: failure(error, '还款未删除，请重试。') };
      }
    },

    async saveBulkRepayments(repayments) {
      try {
        await requireLoadedOwner();
        if (!Array.isArray(repayments) || repayments.length === 0) throw new Error('请选择至少一笔有效还款。');
        const debtIds = [...new Set(repayments.map(row => row?.debtId))];
        if (debtIds.length !== 1) throw new Error('批量还款只能属于同一笔欠款。');
        const parent = await findDebt(debtIds[0]);
        const rows = repayments.map(repayment => {
          if (repayment?.id && knownRepaymentIds.has(repayment.id)) throw new Error('批量录入中包含已有还款，请先检查。');
          const checked = validateRepayment(repayment, parent, localToday());
          const validationError = firstError(checked.errors);
          if (validationError) throw new Error(validationError);
          return repaymentWriteRow(checked.value, userId, parent.id, repayment?.id);
        });
        // One Postgres INSERT makes the whole reviewed batch succeed or fail together.
        const { data, error } = await client.from(REPAYMENTS).insert(rows).select('id');
        if (error) throw error;
        if (!Array.isArray(data) || data.length !== rows.length) throw new Error('批量还款结果不完整，请重新读取后核对。');
        data.forEach(row => knownRepaymentIds.add(row.id));
        return { ok: true, error: null };
      } catch (error) {
        return { ok: false, error: failure(error, '批量还款未保存，请重试。') };
      }
    },
  };
}
