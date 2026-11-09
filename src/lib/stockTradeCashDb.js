import { createReviewSessionGuard } from './reviewSessionGuard.js';
import { normalizeStrictUserStockSymbol } from './symbols.js';
import { getStockTradeRecordKind } from './stockTradeRecordKind.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const invalid = message => Object.assign(new Error(message), { code: 'STOCK_CASH_INVALID' });

const settlementMessages = {
  stock_cash_owner_mismatch: '账户已切换，请重新打开交易。',
  stock_cash_contract_not_ready: '交易结算正在更新，请稍后重试。',
  stock_cash_operation_required: '交易操作标识无效，请重新打开交易。',
  stock_cash_operation_reused: '交易请求已变化，请重新打开并核对。',
  stock_cash_trade_not_found: '原交易不存在或已删除，请刷新后核对。',
  stock_cash_trade_stale: '原交易已被修改，请刷新后重新打开。',
  stock_cash_trade_invalid: '交易金额、股数或日期无效，请重新核对。',
  stock_cash_mode_not_eligible: '该账户暂不满足自动结算条件，请先核对现金记录。',
  stock_cash_baseline_missing: '缺少可核对的现金基准，请先设置并核对现金。',
  stock_cash_opening_not_verified: '开户资金尚未核对完整，不能自动补扣。',
  stock_cash_current_baseline_not_verified: '当前现金来源尚未核对完整，请先校准余额。',
  stock_cash_history_requires_manual_reconciliation: '历史现金曾经手工校准，请先人工核对，避免重复扣款。',
  stock_cash_plan_stale: '现金或交易记录已变化，请重新预览核对结果。',
  stock_cash_trade_outside_supported_baseline: '交易日期早于现金基准、尚未发生或币种不支持，无法自动结算。',
  stock_cash_insufficient_at_date: '这笔操作会导致现金不足，交易和现金均未修改。',
  stock_cash_margin_requires_manual_mode: '融资账户需先核对融资与现金，暂不能使用现金账户自动结算。',
  stock_cash_oversell: '这笔操作会导致卖出超过当时持仓，交易和现金均未修改。',
  stock_cash_history_range_too_large: '历史跨度过大，需要分段核对后再结算。',
  stock_cash_needs_reconciliation: '请先在现金管理中核对开户资金与已有交易，再继续交易。',
  stock_cash_reconciliation_required: '请先在现金管理中核对开户资金与已有交易，再继续交易。',
  stock_cash_manual_anchor_conflict: '这笔交易之后已有手工现金校准，请先核对该段现金，避免重复扣款或退款。',
};

export function stockTradeCashError(error) {
  const message = settlementMessages[error?.message]
    || (/stock_trade_cash/.test(error?.message || '') && ['42501', 'PGRST202'].includes(error?.code)
      ? '交易结算正在更新，请稍后刷新重试。' : null);
  return message ? Object.assign(new Error(message), { code: error.code, settlementCode: error.message }) : error;
}

export function normalizeSettledStockTrade(trade) {
  const symbol = normalizeStrictUserStockSymbol(trade?.symbol);
  const side = trade?.side;
  const date = trade?.date || trade?.tradeDate;
  const price = Number(trade?.price), shares = Number(trade?.shares), fee = Number(trade?.fee ?? 0);
  if (!symbol || !['buy', 'sell'].includes(side) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')
    || !Number.isFinite(price) || price <= 0 || !Number.isFinite(shares) || shares <= 0
    || !Number.isFinite(fee) || fee < 0) throw invalid('交易金额、股数或日期无效，请重新核对。');
  const note = String(trade?.note || '');
  return { symbol, name: String(trade?.name || symbol), side, date, price, shares, fee,
    currency: String(trade?.currency || 'USD').toUpperCase(), note,
    // The form's explicit holding choice is sent as a separate financial field.
    // SQL never infers settlement behavior from a later free-text note edit.
    recordKind: side === 'buy' ? getStockTradeRecordKind(note) : 'trade' };
}

export function createStockTradeCashRepository(client) {
  const guard = createReviewSessionGuard(client);
  async function request(action, payload, expectedUserId) {
    const ticket = await guard.begin(expectedUserId);
    const { data, error } = await client.rpc('stock_trade_cash', {
      p_action: action, p_payload: payload, p_expected_user_id: expectedUserId,
    });
    await guard.verify(ticket);
    if (error) throw stockTradeCashError(error);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== 'object') throw invalid('交易结算未返回确认结果，请重试核对。');
    const cash = result.cashStatus;
    if (cash && (!Number.isFinite(Number(cash.availableCashUsd)) || Number(cash.availableCashUsd) < 0
      || typeof cash.isSet !== 'boolean' || cash.isSet && !cash.updatedAt)) {
      throw invalid('现金结算返回格式无效，请刷新后核对。');
    }
    return result;
  }
  return {
    load: expectedUserId => request('state', {}, expectedUserId),
    preview: ({ kind, openingEventId } = {}, expectedUserId) => {
      if (!['enable', 'repair'].includes(kind)) throw invalid('结算方式无效。');
      return request(`preview_${kind}`, kind === 'repair' ? { openingEventId } : {}, expectedUserId);
    },
    confirm: ({ kind, operationKey, planToken, openingEventId } = {}, expectedUserId) => {
      if (!['enable', 'repair'].includes(kind) || !uuid(operationKey) || !planToken) throw invalid('请重新核对结算方案。');
      return request(kind, { operationKey, planToken, ...(kind === 'repair' ? { openingEventId } : {}) }, expectedUserId);
    },
    mutate: (action, { trade, tradeId, operationKey, expectedUpdatedAt } = {}, expectedUserId) => {
      if (!['create', 'update', 'delete'].includes(action) || !uuid(operationKey)) throw invalid('交易操作标识无效，请重新打开交易。');
      if (action !== 'create' && (!uuid(tradeId) || !expectedUpdatedAt)) throw invalid('原交易已更新，请刷新后重新打开。');
      return request(action, { operationKey, ...(action !== 'create' ? { tradeId, expectedUpdatedAt } : {}),
        ...(action !== 'delete' ? { trade: normalizeSettledStockTrade(trade) } : {}) }, expectedUserId);
    },
  };
}

/** Keep the operation identity across ambiguous failures; reset only after a
 * confirmed commit or a different intent. Identical intentional new orders get
 * a fresh key after success, so legitimate repeated fills are never deduped.
 */
export function stockTradeCashOperation(previous, intent, randomUUID = () => crypto.randomUUID()) {
  const signature = JSON.stringify(intent);
  return previous?.signature === signature ? previous : { signature, operationKey: randomUUID() };
}
