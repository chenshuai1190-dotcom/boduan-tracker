import React from 'react';
import { ArrowLeft, Plus, ChevronRight, ChevronDown, Check, Pencil, Trash2, ReceiptText } from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import { DEBT_CYCLES, buildDebtOverview, parseMoney, validateDebt, validateRepayment } from '../lib/debtManager.js';
import { parseBulkRepaymentText } from '../lib/debtRepaymentImport.js';
import { createDebtPreviewStore } from '../dev/debtManagerPreviewStore.js';
import { createDebtCloudStore } from '../lib/debtManagerCloudStore.js';
import { debtMutationReflected } from '../lib/debtMutationReconciliation.js';
import { debtText, debtErrorText } from '../lib/debtManagerI18n.js';
import './DebtManagerPage.css';

const STATUS = { NORMAL: '正常', DUE_SOON: '即将到期', OVERDUE: '已逾期', SETTLED: '已结清' };
const money = value => Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (value, language = 'zh') => value ? value.replaceAll('-', '/') : debtText(language, '未设置');
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const percent = value => `${(value * 100).toFixed(2).replace(/\.00$/, '')}%`;
const newId = () => globalThis.crypto.randomUUID();
const emptyDebt = today => ({ name: '', originalAmount: '', debtDate: today, creditor: '', dueDate: '', repaymentCycle: 'NONE', plannedPayment: '', customIntervalDays: '', interestRate: '', note: '', currency: 'CNY' });

function Progress({ value, label, language = 'zh' }) {
  return <div className="dm-progress" role="progressbar" aria-label={label || debtText(language, '还款进度')} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value * 100}%` }} /></div>;
}
function Status({ value, language = 'zh' }) { return <span className="dm-status" data-status={value}>{debtText(language, STATUS[value])}</span>; }

function Sheet({ title, onClose, children, footer, language = 'zh' }) {
  const root = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = root.current?.querySelector('[role="dialog"]');
    dialog?.setAttribute('tabindex', '-1');
    dialog?.focus({ preventScroll: true });
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || [])].filter(item => item.getClientRects().length);
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previousOverflow; dialog?.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div ref={root} className="dm-sheet-root"><ActionModalCard title={debtText(language, title)} closeLabel={debtText(language, '关闭')} onClose={onClose} showGrabber
    widthClassName="w-full max-w-[520px]" overlayClassName="dm-sheet-overlay" panelClassName="dm-sheet" contentClassName="dm-sheet-content"
    footerContent={footer}>{children}</ActionModalCard></div>;
}

function Field({ name, label, draft, onChange, errors, type = 'text', inputMode, required = false, placeholder, maxLength, max, min, language = 'zh' }) {
  const id = React.useId();
  return <label className="dm-field" htmlFor={id}><span>{debtText(language, label)}{required && <small>{debtText(language, '必填')}</small>}</span>
    <input id={id} name={name} value={draft[name] ?? ''} onChange={event => onChange(name, event.target.value)} type={type} inputMode={inputMode}
      placeholder={placeholder ? debtText(language, placeholder) : undefined} maxLength={maxLength} max={max} min={min} required={required} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${id}-error` : undefined} />
    {errors[name] && <em id={`${id}-error`}>{debtErrorText(language, errors[name])}</em>}
  </label>;
}

function DebtEditor({ debt, today, onSave, onDelete, repaymentCount = 0, onClose, saveError, pending = false, language = 'zh' }) {
  const tx = (source, values) => debtText(language, source, values);
  const [draft, setDraft] = React.useState(() => debt ? { ...debt } : emptyDebt(today));
  const [errors, setErrors] = React.useState({});
  const [optionalOpen, setOptionalOpen] = React.useState(Boolean(debt));
  const [deleting, setDeleting] = React.useState(false);
  const form = React.useRef(null);
  const update = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: undefined })); };
  const submit = event => {
    event.preventDefault();
    const result = validateDebt(draft, today);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) return;
    onSave(result.value, debt?.id);
  };
  const field = (name, label, extra = {}) => <Field name={name} label={label} draft={draft} onChange={update} errors={errors} language={language} {...extra} />;
  return <Sheet title={deleting ? '删除欠款？' : debt ? '编辑欠款' : '新增欠款'} language={language} onClose={onClose} footer={<div className="dm-sheet-footer">
    {saveError && <p className="dm-error" role="alert">{debtErrorText(language, saveError)}</p>}
    {deleting ? <><p className="dm-delete-question">{tx('删除「{{name}}」及其 {{count}} 笔还款记录？删除后无法恢复。', { name: debt.name, count: repaymentCount })}</p><div className="dm-two-actions"><button type="button" className="dm-secondary" disabled={pending} onClick={() => setDeleting(false)}>{tx('保留欠款')}</button><button type="button" className="dm-danger-button" disabled={pending} onClick={() => onDelete(debt.id)}>{tx(pending ? '正在删除…' : '确认删除')}</button></div></>
      : <><button type="button" className="dm-primary" disabled={pending} onClick={() => form.current?.requestSubmit()}>{tx(pending ? '正在保存…' : debt ? '保存修改' : '添加欠款')}</button>{debt && <button type="button" className="dm-delete-link" disabled={pending} onClick={() => setDeleting(true)}><Trash2 size={14} />{tx('删除这笔欠款')}</button>}</>}
  </div>}>
    {!deleting && <form ref={form} onSubmit={submit} noValidate className="dm-form">
      {field('name', '欠款名称', { required: true, maxLength: 80, placeholder: '例如：供应商欠款' })}
      {field('originalAmount', '原始金额 · 人民币 ¥', { required: true, inputMode: 'decimal', placeholder: '0.00' })}
      {field('debtDate', '欠款日期', { required: true, type: 'date', max: today })}
      <button type="button" className="dm-optional-toggle" onClick={() => setOptionalOpen(value => !value)} aria-expanded={optionalOpen}>{tx('更多信息')} <span>{tx('选填')} <ChevronDown size={15} style={{ transform: optionalOpen ? 'rotate(180deg)' : undefined }} /></span></button>
      {optionalOpen && <div className="dm-optional-fields">
        {field('creditor', '债权人', { placeholder: '个人或公司名称', maxLength: 100 })}
        {field('dueDate', '到期日期', { type: 'date', min: draft.debtDate })}
        <label className="dm-field"><span>{tx('还款周期')}</span><select name="repaymentCycle" value={draft.repaymentCycle} onChange={event => update('repaymentCycle', event.target.value)}>{DEBT_CYCLES.map(cycle => <option key={cycle.value} value={cycle.value}>{tx(cycle.label)}</option>)}</select>{errors.repaymentCycle && <em>{debtErrorText(language, errors.repaymentCycle)}</em>}</label>
        {draft.repaymentCycle === 'CUSTOM' && field('customIntervalDays', '每隔多少天还款', { inputMode: 'numeric', placeholder: '例如：15' })}
        {field('plannedPayment', '每期计划还款 · ¥', { inputMode: 'decimal', placeholder: '未设置' })}
        {draft.repaymentCycle !== 'NONE' && <p className="dm-form-hint">{tx('从欠款日期起，下一个周期开始还款；到期日结清剩余本金。')}</p>}
        {field('interestRate', '年利率 · %', { inputMode: 'decimal', placeholder: '仅作记录，不计算利息' })}
        <label className="dm-field"><span>{tx('备注')}</span><textarea name="note" value={draft.note} onChange={event => update('note', event.target.value)} placeholder={tx('补充约定或说明')} maxLength={1000} rows={3} /></label>
      </div>}
      {errors.note && <p className="dm-error">{debtErrorText(language, errors.note)}</p>}
    </form>}
  </Sheet>;
}

function RepaymentEditor({ debt, repayment, today, onSave, onDelete, onClose, saveError, pending = false, language = 'zh' }) {
  const tx = (source, values) => debtText(language, source, values);
  const [draft, setDraft] = React.useState(() => repayment ? { ...repayment } : { amount: '', repaymentDate: today, note: '' });
  const [errors, setErrors] = React.useState({});
  const [deleting, setDeleting] = React.useState(false);
  const form = React.useRef(null);
  const update = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: undefined })); };
  const submit = event => {
    event.preventDefault();
    const result = validateRepayment(draft, debt, today);
    setErrors(result.errors);
    if (!Object.keys(result.errors).length) onSave(result.value, repayment?.id);
  };
  const availableMinor = Math.round(debt.originalAmount * 100) - Math.round(debt.totalPaid * 100) + Math.round((repayment?.amount || 0) * 100);
  const amountMinor = parseMoney(draft.amount);
  const after = amountMinor === null ? null : Math.max(0, availableMinor - amountMinor) / 100;
  return <Sheet title={repayment ? '编辑还款' : '记一笔还款'} language={language} onClose={onClose} footer={<div className="dm-sheet-footer">
    {saveError && <p className="dm-error" role="alert">{debtErrorText(language, saveError)}</p>}
    {deleting ? <><p className="dm-delete-question">{tx('删除这笔还款后，剩余本金将重新计算。')}</p><div className="dm-two-actions"><button className="dm-secondary" disabled={pending} onClick={() => setDeleting(false)}>{tx('保留记录')}</button><button className="dm-danger-button" disabled={pending} onClick={() => onDelete(repayment.id)}>{tx(pending ? '正在删除…' : '确认删除')}</button></div></>
      : <><button type="button" className="dm-primary" disabled={pending} onClick={() => form.current?.requestSubmit()}>{tx(pending ? '正在保存…' : repayment ? '保存修改' : '确认还款')}</button>{repayment && <button type="button" className="dm-delete-link" disabled={pending} onClick={() => setDeleting(true)}><Trash2 size={14} />{tx('删除这笔还款')}</button>}</>}
  </div>}>
    <div className="dm-payment-context"><strong>{debt.name}</strong><span>{tx('剩余本金')} <b>¥{money(debt.remainingAmount)}</b></span></div>
    <form ref={form} onSubmit={submit} noValidate className="dm-form">
      <Field name="amount" label="还款金额 · ¥" language={language} draft={draft} onChange={update} errors={errors} inputMode="decimal" placeholder="0.00" required />
      {!repayment && <button className="dm-fill-remaining" type="button" onClick={() => update('amount', debt.remainingAmount.toFixed(2))}>{tx('全部结清')} <span>¥{money(debt.remainingAmount)}</span></button>}
      <Field name="repaymentDate" label="还款日期" language={language} draft={draft} onChange={update} errors={errors} type="date" min={debt.debtDate} max={today} required />
      <label className="dm-field"><span>{tx('备注')} <small>{tx('选填')}</small></span><textarea name="note" value={draft.note} onChange={event => update('note', event.target.value)} placeholder={tx('例如：银行转账')} maxLength={1000} rows={2} /></label>
      {after !== null && amountMinor > 0 && <div className="dm-after-payment"><span>{tx('还款后剩余')}</span><strong>¥{money(after)}</strong></div>}
      {amountMinor !== null && amountMinor > availableMinor && <p className="dm-form-hint">{tx('本次超过剩余本金。会保留实际还款金额，剩余欠款记为 ¥0.00。')}</p>}
      {errors.note && <p className="dm-error">{debtErrorText(language, errors.note)}</p>}
    </form>
  </Sheet>;
}

const importFingerprint = (date, amount, note) => `${date}|${parseMoney(amount)}|${note.trim()}`;
const importNote = row => row.raw.trim().slice(0, 1000);
const IMPORT_LABELS = { READY: '可录入', REVIEW: '待确认', EXCLUDED: '合同外', INVALID: '需修正' };

function BulkRepaymentEditor({ debt, today, existingRepayments, onSave, onClose, saveError, pending = false, language = 'zh' }) {
  const tx = (source, values) => debtText(language, source, values);
  const [text, setText] = React.useState('');
  const [parsed, setParsed] = React.useState(null);
  const [selectedLines, setSelectedLines] = React.useState(new Set());
  const [duplicateLines, setDuplicateLines] = React.useState(new Set());
  const [overrides, setOverrides] = React.useState({});
  const [localError, setLocalError] = React.useState('');
  const selectedRows = parsed?.rows.filter(row => selectedLines.has(row.lineNumber)) || [];
  const selectedCents = selectedRows.reduce((total, row) => total + BigInt(parseMoney(overrides[row.lineNumber]?.amount ?? row.amount) || 0), 0n);
  const selectedAmount = selectedCents <= BigInt(Number.MAX_SAFE_INTEGER) ? money(Number(selectedCents) / 100) : tx('金额超限');
  const review = () => {
    setLocalError('');
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) { setLocalError('先粘贴还款记录。'); return; }
    if (lines.length > 200) { setLocalError('每次最多核对 200 行，请分批粘贴。'); return; }
    const result = parseBulkRepaymentText(text, { targetName: debt.name, debtDate: debt.debtDate, today });
    if (!result.rows.length) { setLocalError('没有识别到还款记录，请检查粘贴内容。'); return; }
    const seen = new Set(existingRepayments.map(item => importFingerprint(item.repaymentDate, item.amount, item.note)));
    const nextSelected = new Set();
    const duplicates = new Set();
    for (const row of result.rows) {
      if (row.date && row.amount != null) {
        const fingerprint = importFingerprint(row.date, row.amount, importNote(row));
        if (seen.has(fingerprint)) duplicates.add(row.lineNumber);
        seen.add(fingerprint);
      }
      if (row.status === 'READY' && !duplicates.has(row.lineNumber)) nextSelected.add(row.lineNumber);
    }
    setParsed(result);
    setSelectedLines(nextSelected);
    setDuplicateLines(duplicates);
    setOverrides({});
  };
  const update = (lineNumber, field, value) => {
    setOverrides(previous => ({ ...previous, [lineNumber]: { ...previous[lineNumber], [field]: value } }));
    setLocalError('');
  };
  const toggle = lineNumber => {
    setSelectedLines(previous => {
      const next = new Set(previous);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
    setLocalError('');
  };
  const save = () => {
    if (!selectedRows.length) { setLocalError('请至少勾选一笔有效还款。'); return; }
    const values = [];
    const seen = new Set(existingRepayments.map(item => importFingerprint(item.repaymentDate, item.amount, item.note)));
    for (const row of selectedRows) {
      const edit = overrides[row.lineNumber] || {};
      const result = validateRepayment({ repaymentDate: edit.date ?? row.date ?? '', amount: edit.amount ?? row.amount ?? '', note: importNote(row) }, debt, today);
      if (Object.keys(result.errors).length) { setLocalError(tx('第 {{line}} 行日期或金额无效，请核对后再保存。', { line: row.lineNumber })); return; }
      const fingerprint = importFingerprint(result.value.repaymentDate, result.value.amount, result.value.note);
      if (seen.has(fingerprint)) { setLocalError(tx('第 {{line}} 行与已有或本次记录重复，请修改原文以区分，或取消勾选。', { line: row.lineNumber })); return; }
      seen.add(fingerprint);
      values.push(result.value);
    }
    if (selectedCents > BigInt(Number.MAX_SAFE_INTEGER)) { setLocalError('所选金额合计超限，请分批录入。'); return; }
    onSave(values);
  };
  return <Sheet title="批量录入还款" language={language} onClose={onClose} footer={<div className="dm-sheet-footer">
    {(localError || saveError) && <p className="dm-error" role="alert">{localError ? tx(localError) : debtErrorText(language, saveError)}</p>}
    {parsed ? <><div className="dm-import-total"><span>{tx('已选 {{count}} 笔', { count: selectedRows.length })}</span><strong>¥{selectedAmount}</strong></div><button type="button" className="dm-primary" disabled={pending} onClick={save}>{pending ? tx('正在录入…') : tx('确认录入 {{count}} 笔', { count: selectedRows.length })}</button><button type="button" className="dm-import-back" disabled={pending} onClick={() => { setParsed(null); setLocalError(''); }}>{tx('修改粘贴内容')}</button></>
      : <button type="button" className="dm-primary" onClick={review}>{tx('解析并核对')}</button>}
  </div>}>
    {!parsed ? <div className="dm-import-intro"><p>{tx('把同一笔欠款的历史还款逐行粘贴。系统先识别日期、金额和用途，核对后才会保存。')}</p><label className="dm-field"><span>{tx('还款记录')}</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={50000} rows={9} placeholder={tx('例如：家庭还款 2025.1.25 招商银行 100000\n其他费用 2025.2.1 20000（不在合同内）')} /></label><small>{tx('没有具体日期或未写明属于「{{name}}」的记录，默认不勾选；合同外记录不会计入此欠款。', { name: debt.name })}</small></div>
      : <div className="dm-import-review"><div className="dm-import-summary"><span>{tx('可录入 {{count}}', { count: parsed.summary.readyCount })}</span><span>{tx('待确认 {{count}}', { count: parsed.summary.reviewCount })}</span><span>{tx('合同外 {{count}}', { count: parsed.summary.excludedCount })}</span>{parsed.summary.invalidCount > 0 && <span>{tx('需修正 {{count}}', { count: parsed.summary.invalidCount })}</span>}</div><p className="dm-import-hint">{tx('仅勾选的记录会保存。请核对同日多笔及括号中的中文金额；已有相同记录默认不勾选。')}</p>
        <div className="dm-import-rows">{parsed.rows.map(row => {
          const edit = overrides[row.lineNumber] || {};
          const date = edit.date ?? row.date ?? '';
          const amount = edit.amount ?? row.amount ?? '';
          const excluded = row.status === 'EXCLUDED';
          return <div key={row.lineNumber} className="dm-import-row" data-import-status={row.status}>
            <div className="dm-import-row-head"><label><input type="checkbox" checked={selectedLines.has(row.lineNumber)} disabled={excluded} onChange={() => toggle(row.lineNumber)} /><span>{tx('第 {{line}} 行', { line: row.lineNumber })}</span></label><em>{tx(IMPORT_LABELS[row.status])}</em></div>
            <p className="dm-import-original">{row.raw}</p>
            {row.reason && <p className="dm-import-reason">{debtErrorText(language, row.reason)}</p>}
            {duplicateLines.has(row.lineNumber) && <p className="dm-import-reason">{tx('与已有或本次记录相同，默认未勾选。')}</p>}
            {!excluded && <div className="dm-import-fields"><label>{tx('还款日期')}<input type="date" value={date} onChange={event => update(row.lineNumber, 'date', event.target.value)} /></label><label>{tx('金额 · ¥')}<input inputMode="decimal" value={amount} onChange={event => update(row.lineNumber, 'amount', event.target.value)} placeholder={tx('待补充')} /></label></div>}
          </div>;
        })}</div>
      </div>}
  </Sheet>;
}

function DebtCard({ debt, onOpen, language = 'zh' }) {
  const tx = (source, values) => debtText(language, source, values);
  return <button type="button" className="dm-debt-card" onClick={() => onOpen(debt.id)} data-debt-id={debt.id} data-status={debt.status}>
    <div className="dm-card-heading"><h3>{debt.name}</h3><Status value={debt.status} language={language} /></div>
    <div className="dm-card-amount"><span>{tx('剩余')}</span><strong><small>¥</small>{money(debt.remainingAmount)}</strong></div>
    <div className="dm-card-facts"><span>{tx('原始欠款')} <b>¥{money(debt.originalAmount)}</b></span><span>{tx('累计已还')} <b>¥{money(debt.totalPaid)}</b></span></div>
    <Progress value={debt.progress} label={tx('{{name}}还款进度', { name: debt.name })} language={language} />
    <div className="dm-card-bottom"><span>{tx('已还')} <b>{percent(debt.progress)}</b></span><span>{debt.status === 'SETTLED' ? tx('查看还款记录') : tx('下次还款 {{date}}', { date: dateText(debt.nextPaymentDate, language) })}<ChevronRight size={13} /></span></div>
  </button>;
}

export default function DebtManagerPage({ onBack, supabase, userId, preview = false, language = 'zh' }) {
  const tx = (source, values) => debtText(language, source, values);
  const [previewStore] = React.useState(() => preview ? createDebtPreviewStore() : null);
  const cloudStore = React.useMemo(() => !preview && supabase && userId ? createDebtCloudStore(supabase, userId) : null, [preview, supabase, userId]);
  const store = preview ? previewStore : cloudStore;
  const [loaded, setLoaded] = React.useState(() => preview ? store.load() : { data: null, error: null });
  const [loading, setLoading] = React.useState(!preview);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const submissionIds = React.useRef([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [editor, setEditor] = React.useState(null);
  const [saveError, setSaveError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [dataAction, setDataAction] = React.useState(null);
  React.useEffect(() => {
    if (preview) return undefined;
    let active = true;
    setLoaded({ data: null, error: null });
    setLoading(true);
    if (!store) {
      setLoaded({ data: null, error: '账户尚未就绪，请稍后重试。' });
      setLoading(false);
      return undefined;
    }
    store.load().then(result => {
      if (!active) return;
      setLoaded(result);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setLoaded({ data: null, error: '暂时无法读取欠款记录，请重试。' });
      setLoading(false);
    });
    return () => { active = false; };
  }, [preview, store]);
  const today = localToday();
  const data = loaded.data;
  const derived = React.useMemo(() => {
    if (!data) return { overview: null, error: null };
    try { return { overview: buildDebtOverview(data.debts, data.repayments, today), error: null }; }
    catch { return { overview: null, error: preview ? '本地记录的金额或日期异常，请检查记录或恢复示例。' : '欠款记录的金额或日期异常，请检查记录。' }; }
  }, [data, today]);
  const overview = derived.overview;
  const readError = loaded.error || derived.error;
  const selected = overview?.debts.find(debt => debt.id === selectedId) || null;
  const payments = React.useMemo(() => data && selected ? data.repayments.filter(item => item.debtId === selected.id).sort((a, b) => b.repaymentDate.localeCompare(a.repaymentDate) || b.createdAt.localeCompare(a.createdAt)) : [], [data, selected]);
  const closeEditor = () => { if (pendingRef.current) return; submissionIds.current = []; setEditor(null); setSaveError(''); };
  const openEditor = value => { submissionIds.current = []; setSaveError(''); setNotice(''); setEditor(value); };
  const submissionId = index => {
    if (!submissionIds.current[index]) submissionIds.current[index] = newId();
    return submissionIds.current[index];
  };
  const selectDebt = id => { setSelectedId(id); setNotice(''); window.scrollTo(0, 0); };
  const commit = (nextData, message) => {
    try { buildDebtOverview(nextData.debts, nextData.repayments, today); }
    catch { setSaveError('金额合计超出可计算范围，本次未保存。'); return false; }
    const result = store.save(nextData);
    if (!result.ok) { setSaveError(result.error || '未保存，请重试。'); return false; }
    setLoaded({ data: nextData, error: null }); setNotice(message); closeEditor(); return true;
  };
  const mutate = async (method, payload, message, nextData) => {
    if (!store || pendingRef.current) return false;
    try { buildDebtOverview(nextData.debts, nextData.repayments, today); }
    catch { setSaveError('金额合计超出可计算范围，本次未保存。'); return false; }
    pendingRef.current = true;
    setPending(true);
    setSaveError('');
    try {
      const result = await store[method](payload);
      const refreshed = await store.load();
      if (!refreshed.data || refreshed.error) {
        setLoaded({ data: null, error: refreshed.error || '操作结果尚未确认，暂时无法读取最新数据，请重试。' });
        setEditor(null);
        return false;
      }
      setLoaded(refreshed);
      if (!debtMutationReflected(method, payload, refreshed.data)) {
        setSaveError(result.error || '尚未在云端记录中确认本次操作，请核对后重试。');
        return false;
      }
      setNotice(message);
      setEditor(null);
      return true;
    } catch {
      setLoaded({ data: null, error: '操作结果尚未确认，请重新读取云端记录后核对，避免重复录入。' });
      setEditor(null);
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const reload = async () => {
    if (preview) { setLoaded(store.load()); return; }
    if (!store) { setLoaded({ data: null, error: '账户尚未就绪，请稍后重试。' }); return; }
    setLoading(true);
    try { setLoaded(await store.load()); }
    catch { setLoaded({ data: null, error: '暂时无法读取欠款记录，请重试。' }); }
    finally { setLoading(false); }
  };
  const saveDebt = async (value, id) => {
    if (id && data.repayments.some(item => item.debtId === id && item.repaymentDate < value.debtDate)) { setSaveError('欠款日期不能晚于已有还款记录。'); return; }
    const now = new Date().toISOString();
    const saved = { ...value, id: id || (preview ? newId() : submissionId(0)), createdAt: id ? data.debts.find(item => item.id === id).createdAt : now, updatedAt: now };
    const nextData = { ...data, debts: id ? data.debts.map(item => item.id === id ? saved : item) : [...data.debts, saved] };
    const didSave = preview ? commit(nextData, id ? '欠款信息已保存' : '欠款已添加') : await mutate('saveDebt', saved, id ? '欠款信息已保存' : '欠款已添加', nextData);
    if (didSave) { setSelectedId(saved.id); window.scrollTo(0, 0); }
  };
  const saveRepayment = async (value, id) => {
    const now = new Date().toISOString();
    const saved = { ...value, id: id || (preview ? newId() : submissionId(0)), debtId: selected.id, createdAt: id ? data.repayments.find(item => item.id === id).createdAt : now, updatedAt: now };
    const nextData = { ...data, repayments: id ? data.repayments.map(item => item.id === id ? saved : item) : [...data.repayments, saved] };
    if (preview) commit(nextData, id ? '还款已修改，剩余本金已重新计算' : '还款已保存，剩余本金已更新');
    else await mutate('saveRepayment', saved, id ? '还款已修改，剩余本金已重新计算' : '还款已保存，剩余本金已更新', nextData);
  };
  const saveBulkRepayments = async values => {
    const now = new Date().toISOString();
    const imported = values.map((value, index) => ({ ...value, id: preview ? newId() : submissionId(index), debtId: selected.id, createdAt: now, updatedAt: now }));
    const nextData = { ...data, repayments: [...data.repayments, ...imported] };
    const message = tx('已录入 {{count}} 笔还款，剩余本金已重新计算', { count: imported.length });
    if (preview) commit(nextData, message);
    else await mutate('saveBulkRepayments', imported, message, nextData);
  };
  const deleteDebt = async id => {
    const nextData = { debts: data.debts.filter(item => item.id !== id), repayments: data.repayments.filter(item => item.debtId !== id) };
    const didDelete = preview ? commit(nextData, '欠款及关联还款记录已删除') : await mutate('deleteDebt', id, '欠款及关联还款记录已删除', nextData);
    if (didDelete) {
      setSelectedId(null);
      window.scrollTo(0, 0);
    }
  };
  const deleteRepayment = id => {
    const nextData = { ...data, repayments: data.repayments.filter(item => item.id !== id) };
    if (preview) commit(nextData, '还款已删除，剩余本金已重新计算');
    else void mutate('deleteRepayment', id, '还款已删除，剩余本金已重新计算', nextData);
  };
  const resetData = () => {
    const result = dataAction === 'reset' ? store.reset() : store.save({ debts: [], repayments: [] });
    if (!result.ok) { setSaveError(result.error); return; }
    setLoaded({ data: dataAction === 'reset' ? result.data : { debts: [], repayments: [] }, error: null }); setSelectedId(null); setDataAction(null); setSaveError(''); setNotice(dataAction === 'reset' ? '已恢复示例数据' : '示例已清空，可以添加第一笔欠款');
  };
  return <main className="debt-manager" data-debt-manager={preview ? 'local-preview' : 'cloud'}>
    <header className="dm-header"><button type="button" className="dm-icon-button" aria-label={tx(selected ? '返回欠款列表' : '返回全部功能')} onClick={() => selected ? selectDebt(null) : onBack?.()}><ArrowLeft size={20} strokeWidth={1.7} /></button><h1>{tx(selected ? '欠款详情' : '资产负债')}</h1><button type="button" className="dm-icon-button" aria-label={tx(selected ? '编辑欠款' : '新增欠款')} disabled={!overview} onClick={() => openEditor({ type: 'debt', debt: selected || undefined })}>{selected ? <Pencil size={18} strokeWidth={1.7} /> : <Plus size={23} strokeWidth={1.6} />}</button></header>
    <div className="dm-body">
      <div className="dm-preview-label"><span>{tx(preview ? '本地预览 · 示例数据' : '独立欠款记录')}</span><span>{tx('人民币 CNY')}</span></div>
      {loading ? <section className="dm-empty" role="status"><ReceiptText size={30} strokeWidth={1.2} /><h2>{tx('正在读取欠款记录')}</h2></section> : readError ? <section className="dm-empty"><ReceiptText size={30} strokeWidth={1.2} /><h2>{tx(preview ? '暂时无法读取本地数据' : '暂时无法读取欠款记录')}</h2><p role="alert">{debtErrorText(language, readError)}</p><button className="dm-secondary" onClick={reload}>{tx('重新读取')}</button></section> : selected ? <>
        <section className="dm-detail-hero" data-status={selected.status}><div className="dm-detail-title"><h2>{selected.name}</h2><Status value={selected.status} language={language} /></div><p className="dm-eyebrow">{tx('剩余本金')}</p><div className="dm-hero-amount"><span>¥</span>{money(selected.remainingAmount)}</div>
          <div className="dm-detail-summary"><div><span>{tx('原始欠款')}</span><strong>¥{money(selected.originalAmount)}</strong></div><div><span>{tx('累计已还')}</span><strong>¥{money(selected.totalPaid)}</strong></div></div>
          <div className="dm-progress-caption"><span>{tx('还款进度')}</span><strong>{percent(selected.progress)}</strong></div><Progress value={selected.progress} language={language} />
          {selected.overpaymentAmount > 0 && <p className="dm-form-hint">{tx('已超额还款 ¥{{amount}}，流水按实际金额保留。', { amount: money(selected.overpaymentAmount) })}</p>}
        </section>
        <dl className="dm-details"><div><dt>{tx('债权人')}</dt><dd>{selected.creditor || tx('未填写')}</dd></div><div><dt>{tx('欠款日期')}</dt><dd>{dateText(selected.debtDate, language)}</dd></div><div><dt>{tx('到期日期')}</dt><dd>{dateText(selected.dueDate, language)}</dd></div><div><dt>{tx('下次还款')}</dt><dd>{selected.status === 'SETTLED' ? tx('已结清') : dateText(selected.nextPaymentDate, language)}</dd></div><div><dt>{tx('还款周期')}</dt><dd>{tx(DEBT_CYCLES.find(cycle => cycle.value === selected.repaymentCycle)?.label)}{selected.repaymentCycle === 'CUSTOM' ? ` · ${tx('每 {{days}} 天', { days: selected.customIntervalDays })}` : ''}</dd></div>{selected.plannedPayment != null && <div><dt>{tx('每期计划')}</dt><dd>¥{money(selected.plannedPayment)}</dd></div>}{selected.interestRate != null && <div><dt>{tx('年利率')} <small>{tx('仅记录')}</small></dt><dd>{selected.interestRate}%</dd></div>}{selected.note && <div className="dm-detail-note"><dt>{tx('备注')}</dt><dd>{selected.note}</dd></div>}</dl>
        <section className="dm-payment-history"><div className="dm-section-heading"><h2>{tx('还款记录')}</h2><div className="dm-section-actions"><span>{tx('{{count}} 笔', { count: payments.length })}</span><button type="button" onClick={() => openEditor({ type: 'bulk-repayment' })}>{tx('批量录入')}</button></div></div>{payments.length ? payments.map(payment => <button type="button" className="dm-payment-row" key={payment.id} aria-label={tx('编辑 {{date}} 还款 {{amount}} 元', { date: dateText(payment.repaymentDate, language), amount: money(payment.amount) })} onClick={() => openEditor({ type: 'repayment', repayment: payment })}><span><time>{dateText(payment.repaymentDate, language)}</time><small>{payment.note || tx('还款')}</small></span><strong>−¥{money(payment.amount)}</strong><ChevronRight size={14} /></button>) : <p className="dm-empty-history">{tx('还没有还款记录。每次还款都会单独保留。')}</p>}</section>
        <div className="dm-detail-action"><button className="dm-primary" disabled={selected.status === 'SETTLED'} onClick={() => openEditor({ type: 'repayment' })}>{selected.status === 'SETTLED' ? <><Check size={17} />{tx('已全部结清')}</> : <><Plus size={18} />{tx('记一笔还款')}</>}</button></div>
      </> : overview && <>
        <section className="dm-overview-hero"><p className="dm-eyebrow">{tx('剩余总欠款')}</p><div className="dm-hero-amount"><span>¥</span>{money(overview.remainingTotal)}</div>
          <div className="dm-overview-stats"><div><span>{tx('原始欠款')}</span><strong>¥{money(overview.originalTotal)}</strong></div><div><span>{tx('累计已还')}</span><strong>¥{money(overview.totalPaid)}</strong></div><div><span>{tx('本月应还')}</span><strong>¥{money(overview.monthlyDue)}</strong></div></div>
          <div className="dm-progress-caption"><span>{tx('已还')} <strong>{percent(overview.progress)}</strong></span><span>{tx('{{count}} 笔未结清', { count: overview.activeCount })}</span></div><Progress value={overview.progress} language={language} />
        </section>
        <div className="dm-section-heading"><h2>{tx('欠款')}</h2><span>{tx('按下次还款时间')}</span></div>
        {overview.debts.length ? <div className="dm-debt-list">{overview.debts.filter(debt => debt.status !== 'SETTLED').map(debt => <DebtCard key={debt.id} debt={debt} onOpen={selectDebt} language={language} />)}{overview.settledCount > 0 && <details className="dm-settled"><summary><span><Check size={15} />{tx('已结清')} <b>{overview.settledCount}</b></span><ChevronDown size={16} /></summary><div className="dm-settled-list">{overview.debts.filter(debt => debt.status === 'SETTLED').map(debt => <DebtCard key={debt.id} debt={debt} onOpen={selectDebt} language={language} />)}</div></details>}</div> : <section className="dm-empty"><ReceiptText size={32} strokeWidth={1.2} /><h2>{tx('从第一笔欠款开始')}</h2><p>{tx('记录欠款，再逐笔记下还款。')}<br />{tx('每次归还，剩余本金都会自动减少。')}</p><button className="dm-secondary" onClick={() => openEditor({ type: 'debt' })}><Plus size={16} />{tx('添加欠款')}</button></section>}
        <p className="dm-footnote">{tx('独立记录欠款，不计入 Quote 净资产。')}<br />{tx('本月应还按本金计划计算，不含往期逾期。')}</p>
      </>}
      <p className="dm-notice" aria-live="polite" role="status">{notice ? tx(notice) : ''}</p>
      {preview && !selected && <details className="dm-preview-settings"><summary>{tx('预览数据')} <ChevronDown size={13} /></summary><p>{tx('仅保存在当前浏览器，不同步真实账户。')}</p><div><button onClick={() => { setSaveError(''); setDataAction('clear'); }}>{tx('清空示例')}</button><button onClick={() => { setSaveError(''); setDataAction('reset'); }}>{tx('恢复示例')}</button></div></details>}
    </div>
    {editor?.type === 'debt' && data && <DebtEditor debt={editor.debt} today={today} onSave={saveDebt} onDelete={deleteDebt} repaymentCount={editor.debt ? data.repayments.filter(item => item.debtId === editor.debt.id).length : 0} onClose={closeEditor} saveError={saveError} pending={pending} language={language} />}
    {editor?.type === 'repayment' && selected && <RepaymentEditor debt={selected} repayment={editor.repayment} today={today} onSave={saveRepayment} onDelete={deleteRepayment} onClose={closeEditor} saveError={saveError} pending={pending} language={language} />}
    {editor?.type === 'bulk-repayment' && selected && <BulkRepaymentEditor debt={selected} today={today} existingRepayments={data.repayments.filter(item => item.debtId === selected.id)} onSave={saveBulkRepayments} onClose={closeEditor} saveError={saveError} pending={pending} language={language} />}
    {preview && dataAction && <Sheet title={dataAction === 'reset' ? '恢复示例数据？' : '清空本地示例？'} language={language} onClose={() => { setDataAction(null); setSaveError(''); }} footer={<div className="dm-sheet-footer">{saveError && <p role="alert" className="dm-error">{debtErrorText(language, saveError)}</p>}<div className="dm-two-actions"><button className="dm-secondary" onClick={() => setDataAction(null)}>{tx('取消')}</button><button className="dm-danger-button" onClick={resetData}>{tx(dataAction === 'reset' ? '恢复示例' : '确认清空')}</button></div></div>}><p className="dm-confirm-copy">{tx('这会替换本工具中已试填的欠款和还款记录，不影响 Quote 的任何真实账户。')}</p></Sheet>}
  </main>;
}
