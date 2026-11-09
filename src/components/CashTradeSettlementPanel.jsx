import React from 'react';
import './CashTradeSettlementPanel.css';

const copy = (en, zh, english) => en ? english : zh;
const money = value => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const finiteAmount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

function validPlan(plan, kind, openingEventId) {
  return plan?.kind === kind && typeof plan.token === 'string' && plan.token.length > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(plan.baselineDate || '')
    && finiteAmount(plan.beforeCashUsd) && finiteAmount(plan.afterCashUsd)
    && finiteAmount(plan.affectedTradeCount) && Number.isInteger(Number(plan.affectedTradeCount))
    && (kind !== 'repair' || String(plan.openingEventId) === String(openingEventId));
}

function requestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const text = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

export default function CashTradeSettlementPanel({ api, revision, language = 'zh', onBusyChange }) {
  const en = language === 'en';
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [attempt, setAttempt] = React.useState(0);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [openingId, setOpeningId] = React.useState('');
  const [plan, setPlan] = React.useState(null);
  const generation = React.useRef(0);
  const busyRef = React.useRef(false);
  const operation = React.useRef(null);

  React.useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    setData(null);
    setPlan(null);
    setBusy('');
    operation.current = null;
    if (typeof api?.load === 'function') {
      Promise.resolve().then(() => api.load()).then(result => {
        if (generation.current !== current) return;
        if (!['manual', 'auto'].includes(result?.settlement?.mode)) throw new Error(copy(en, '交易现金设置暂不可用。', 'Trade cash settings are unavailable.'));
        setData(result);
        setOpeningId(previous => result.openingCandidates?.some(item => String(item.eventId) === previous)
          ? previous : String(result.openingCandidates?.[0]?.eventId || ''));
      }).catch(failure => {
        if (generation.current === current) setError(failure?.message || copy(en, '交易现金设置读取失败。', 'Could not load trade cash settings.'));
      }).finally(() => { if (generation.current === current) setLoading(false); });
    } else setLoading(false);
    return () => { generation.current += 1; };
  }, [api, revision, attempt, en]);

  React.useEffect(() => {
    onBusyChange?.(busy === 'confirm');
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  async function preview(kind) {
    if (busyRef.current || !data || typeof api?.preview !== 'function') return;
    const candidate = data.openingCandidates?.find(item => String(item.eventId) === openingId);
    if (kind === 'repair' && !candidate) return;
    const current = generation.current;
    busyRef.current = true;
    setBusy(kind); setError(''); setSuccess(''); setPlan(null); operation.current = null;
    try {
      const result = await api.preview({ kind, ...(kind === 'repair' ? { openingEventId: candidate.eventId } : {}) });
      if (generation.current !== current) return;
      if (!validPlan(result?.plan, kind, candidate?.eventId)) throw new Error(copy(en, '核对结果不完整，请重新读取。', 'The reconciliation is incomplete. Please reload.'));
      setPlan(result.plan);
    } catch (failure) {
      if (generation.current === current) setError(failure?.message || copy(en, '暂时无法核对，请重试。', 'Could not reconcile. Please retry.'));
    } finally {
      busyRef.current = false;
      if (generation.current === current) setBusy('');
    }
  }

  async function confirm() {
    if (busyRef.current || !plan || typeof api?.confirm !== 'function') return;
    const current = generation.current;
    busyRef.current = true;
    setBusy('confirm'); setError('');
    try {
      if (operation.current?.token !== plan.token) operation.current = { token: plan.token, key: requestId() };
      if (!operation.current.key) throw new Error(copy(en, '无法创建安全操作标识，请重新打开后重试。', 'Could not create a secure operation ID. Reopen and try again.'));
      const result = await api.confirm({ kind: plan.kind, operationKey: operation.current.key, planToken: plan.token,
        ...(plan.kind === 'repair' ? { openingEventId: plan.openingEventId } : {}) });
      if (generation.current !== current) return;
      if (result?.settlement?.mode !== 'auto') throw new Error(copy(en, '结果尚未确认，请重新读取。', 'The result is not confirmed. Please reload.'));
      setData(result); setPlan(null); operation.current = null;
      setSuccess(copy(en, '已启用交易自动结算。', 'Automatic trade settlement is enabled.'));
    } catch (failure) {
      if (generation.current === current) setError(failure?.message || copy(en, '操作未确认，请重试。', 'The operation is not confirmed. Please retry.'));
    } finally {
      busyRef.current = false;
      if (generation.current === current) setBusy('');
    }
  }

  if (typeof api?.load !== 'function') return null;
  const auto = data?.settlement?.mode === 'auto';
  const candidates = (data?.openingCandidates || []).filter(item => item?.eventId && finiteAmount(item.cashUsd));
  const needsOpeningReview = data?.settlement?.eligibleNewAccount === true && data?.settlement?.canRepair === true && candidates.length > 0;
  return <section className="cash-settlement" aria-label={copy(en, '交易现金结算', 'Trade cash settlement')}>
    <div className="cash-settlement-heading"><h3>{copy(en, '交易现金结算', 'Trade cash settlement')}</h3>{data && <span>{auto ? copy(en, '自动结算', 'Automatic') : copy(en, '手动余额', 'Manual balance')}</span>}</div>
    {loading && <p role="status">{copy(en, '正在读取结算方式…', 'Loading settlement settings…')}</p>}
    {!loading && auto && <p>{copy(en, '买入扣减现金，卖出增加现金，交易修改或删除后同步核对。', 'Purchases reduce cash, sales add cash, and edits or deletions reconcile the balance.')}</p>}
    {!loading && data && !auto && !plan && <>
      <p>{needsOpeningReview ? copy(en, '先核对开户资金与已发生交易，确认后补记交易现金并启用自动结算。', 'Review opening funds and existing trades before reconciling cash and enabling automatic settlement.') : copy(en, '核对现金后启用自动结算。已有历史持仓不会再次扣款。', 'Confirm your cash balance before enabling automatic settlement. Existing holdings will not be charged again.')}</p>
      {data.settlement.canEnable && !needsOpeningReview && <button type="button" disabled={Boolean(busy)} onClick={() => preview('enable')}>{busy === 'enable' ? copy(en, '正在核对…', 'Checking…') : copy(en, '从当前余额启用', 'Start from current balance')}</button>}
      {data.settlement.canRepair && candidates.length > 0 && <div className="cash-settlement-opening">
        <label>{copy(en, '开户资金记录', 'Opening cash record')}<select aria-label={copy(en, '开户资金记录', 'Opening cash record')} value={openingId} disabled={Boolean(busy)} onChange={event => setOpeningId(event.target.value)}>
          {candidates.map(item => <option key={item.eventId} value={String(item.eventId)}>{String(item.effectiveAt || '').slice(0, 10)} · {money(item.cashUsd)} USD</option>)}
        </select></label>
        <button type="button" disabled={Boolean(busy) || !openingId} onClick={() => preview('repair')}>{busy === 'repair' ? copy(en, '正在核对…', 'Checking…') : copy(en, '核对遗漏的交易扣款', 'Review unsettled trades')}</button>
      </div>}
    </>}
    {!loading && plan && <div className="cash-settlement-plan">
      <h4>{plan.kind === 'repair' ? copy(en, '确认交易现金核对', 'Confirm cash reconciliation') : copy(en, '确认启用自动结算', 'Confirm automatic settlement')}</h4>
      <dl><div><dt>{copy(en, '当前现金', 'Current cash')}</dt><dd>{money(plan.beforeCashUsd)} USD</dd></div>
        <div><dt>{copy(en, '核对后现金', 'Reconciled cash')}</dt><dd>{money(plan.afterCashUsd)} USD</dd></div>
        <div><dt>{copy(en, '基准日期', 'Baseline date')}</dt><dd>{plan.baselineDate}</dd></div>
        <div><dt>{copy(en, '本次结算交易', 'Trades to settle')}</dt><dd>{plan.affectedTradeCount}{copy(en, ' 笔', '')}</dd></div></dl>
      <p>{plan.kind === 'repair' ? copy(en, '按所选开户资金核对以上交易，并从此自动结算。', 'Reconcile these trades against the selected opening cash record and enable automatic settlement.') : copy(en, '请确认当前现金已包含已有交易的收支；已有历史持仓不再扣款。', 'Confirm that the current cash balance already includes existing trades. Existing holdings will not be charged again.')}</p>
      <div className="cash-settlement-actions"><button type="button" className="cash-settlement-confirm" disabled={Boolean(busy)} onClick={confirm}>{busy === 'confirm' ? copy(en, '正在保存…', 'Saving…') : copy(en, '确认并启用', 'Confirm and enable')}</button><button type="button" disabled={Boolean(busy)} onClick={() => { setPlan(null); setError(''); operation.current = null; }}>{copy(en, '取消', 'Cancel')}</button></div>
    </div>}
    {error && <div className="cash-settlement-error" role="alert"><p>{error}</p>{!data && !loading && <button type="button" onClick={() => setAttempt(value => value + 1)}>{copy(en, '重试', 'Retry')}</button>}</div>}
    {success && <p role="status">{success}</p>}
  </section>;
}
