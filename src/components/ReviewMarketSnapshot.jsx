import React from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { loadVixComparison, getVixComparisonExpectedCloseDate } from '../lib/vixComparison.js';
import { loadFearGreed } from '../lib/fearGreed.js';
import {
  REVIEW_MARKET_KEYS, createReviewMarketSnapshot, normalizeReviewMarketSnapshot,
  readReviewMarketDate, reviewMarketItemLabel, reviewMarketItemState, formatReviewMarketItem,
  validReviewMarketDate,
} from '../lib/reviewMarketSnapshot.js';
import './ReviewMarketSnapshot.css';

const isEnglish = language => String(language).toLowerCase().startsWith('en');

export function SnapshotCard({ value, language = 'zh', className = '' }) {
  const snapshot = normalizeReviewMarketSnapshot(value);
  const en = isEnglish(language);
  if (!snapshot) return null;
  return <section className={`review-market-card ${className}`} aria-label={en ? 'Saved market snapshot' : '已保存的市场快照'}>
    <div className="review-market-card-heading"><span>{snapshot.example ? (en ? 'Example market snapshot' : '示例市场快照') : (en ? 'Market snapshot' : '市场快照')}</span><time dateTime={snapshot.asOfDate}>{snapshot.asOfDate}</time></div>
    <div className="review-market-values" style={{ '--review-market-count': snapshot.items.length }}>
      {snapshot.items.map(item => <div className="review-market-value" key={item.key}>
        <span>{reviewMarketItemLabel(item.key, language)}</span>
        <strong>{formatReviewMarketItem(item, language)}</strong>
        <small>{reviewMarketItemState(item, language)}</small>
      </div>)}
    </div>
    <div className="review-market-card-footer"><span>{en ? 'Daily close' : '日线收盘'} · {snapshot.example ? (en ? 'Example' : '示例') : snapshot.source}</span><span>{en ? 'Saved values' : '保存时快照'}</span></div>
    {snapshot.asOfDate !== snapshot.recordDate && <p className="review-market-date-difference">{en ? 'Record date' : '记录日期'} {snapshot.recordDate} · {en ? 'Source date differs' : '与来源日期不同'}</p>}
  </section>;
}

const DATE_MESSAGES = {
  invalid_date: ['请选择有效的来源日期。', 'Choose a valid source date.'],
  after_record: ['来源日期不能晚于记录日期。', 'The source date cannot follow the record date.'],
  incomplete_close: ['该日尚未完成收盘，请选择已完成的来源日期。', 'This session is not complete. Choose a completed source date.'],
  not_session: ['该日非交易日，请选择有收盘数据的来源日期。', 'This is not a trading session. Choose a source date with closing data.'],
};

/** Mount only while composing. Explicit previewData bypasses both APIs. */
export function SnapshotPicker({ open = true, userId, language = 'zh', recordDate, value,
  onChange, onClose, previewData }) {
  const en = isEnglish(language);
  const existing = normalizeReviewMarketSnapshot(value);
  const [date, setDate] = React.useState(() => existing?.asOfDate || recordDate || '');
  const [selectedKeys, setSelectedKeys] = React.useState(() => existing?.items.map(item => item.key) || [...REVIEW_MARKET_KEYS]);
  const [request, setRequest] = React.useState({ owner: null, preview: null, vix: null, fear: null, vixState: 'loading', fearState: 'loading' });
  const [retry, setRetry] = React.useState(0);
  const dialogRef = React.useRef(null);
  const titleId = React.useId();
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const now = previewData?.now ?? Date.now();
  const lastClose = getVixComparisonExpectedCloseDate(now);
  const maxDate = validReviewMarketDate(recordDate) && recordDate < lastClose ? recordDate : lastClose;
  const latestForRecord = validReviewMarketDate(recordDate)
    ? getVixComparisonExpectedCloseDate(Math.min(now, Date.parse(`${recordDate}T23:59:59Z`))) : lastClose;

  React.useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const saved = normalizeReviewMarketSnapshot(value);
    setDate(saved?.asOfDate || recordDate || '');
    setSelectedKeys(saved?.items.map(item => item.key) || [...REVIEW_MARKET_KEYS]);
  }, [open, userId, recordDate, value]);

  React.useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const controller = new AbortController();
    const initial = { owner: userId, preview: previewData, vix: null, fear: null, vixState: 'loading', fearState: 'loading' };
    if (previewData) {
      setRequest({ ...initial, vix: previewData.vixComparison || null, fear: previewData.fearGreed || null,
        vixState: previewData.vixComparison ? 'ready' : 'unavailable', fearState: previewData.fearGreed ? 'ready' : 'unavailable' });
      return () => { active = false; controller.abort(); };
    }
    if (!userId) {
      setRequest({ ...initial, vixState: 'auth', fearState: 'auth' });
      return () => { active = false; controller.abort(); };
    }
    setRequest(initial);
    const settle = (key, result, error) => {
      if (!active) return;
      setRequest(previous => previous.owner === userId && previous.preview === previewData ? {
        ...previous, [key]: result, [`${key}State`]: error ? (error.code === 'AUTH_REQUIRED' ? 'auth' : 'error') : 'ready',
      } : previous);
    };
    // Both loaders validate the authenticated user, including cache hits. VIX
    // owns a bounded shared request; ignore its result after close/account swap.
    loadVixComparison({ userId, force: retry > 0 }).then(data => settle('vix', data), error => settle('vix', null, error));
    loadFearGreed({ userId, signal: controller.signal, force: retry > 0 }).then(data => settle('fear', data), error => settle('fear', null, error));
    return () => { active = false; controller.abort(); };
  }, [open, userId, previewData, retry]);

  if (!open || typeof document === 'undefined') return null;
  const visible = request.owner === userId && request.preview === previewData ? request
    : { vix: null, fear: null, vixState: 'loading', fearState: 'loading' };
  const readings = readReviewMarketDate({ date, recordDate, vixComparison: visible.vix, fearGreed: visible.fear, now });
  const available = new Map(readings.items.map(item => [item.key, item]));
  const snapshot = createReviewMarketSnapshot({ date, recordDate, items: readings.items, selectedKeys, example: Boolean(previewData), now });
  const message = DATE_MESSAGES[readings.status]?.[en ? 1 : 0];
  const sourceFailed = ['error', 'auth'].includes(visible.vixState) || ['error', 'auth'].includes(visible.fearState);
  const busy = visible.vixState === 'loading' || visible.fearState === 'loading';
  const toggle = key => setSelectedKeys(keys => keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key]);
  const close = () => closeRef.current?.();
  return createPortal(<dialog ref={dialogRef} tabIndex={-1} className="review-market-dialog"
    aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === dialogRef.current) close(); }}>
    <div className="review-market-sheet">
      <header className="review-market-header"><div><h2 id={titleId}>{en ? 'Insert market snapshot' : '插入市场快照'}</h2><p>{en ? 'Choose the closing context for this review' : '选择这条复盘对应的收盘环境'}</p></div><button type="button" className="review-market-close" onClick={close} aria-label={en ? 'Close' : '关闭'}><X size={20} /></button></header>
      <div className="review-market-body">
        <label className="review-market-date"><span>{en ? 'Source date' : '来源日期'}</span><input type="date" value={date} max={maxDate} onChange={event => setDate(event.target.value)} /></label>
        <div className="review-market-date-note"><span>{en ? 'Record date' : '记录日期'} {recordDate || '—'}</span><button type="button" onClick={() => setDate(latestForRecord)}>{en ? 'Latest completed close' : '最近已完成收盘日'}</button></div>
        {message && <p className="review-market-status" role="status">{message}</p>}
        {!message && date !== recordDate && <p className="review-market-status">{en ? 'This snapshot references a different date from the record.' : '本次引用日期与记录日期不同，将保留实际来源日期。'}</p>}
        <div className="review-market-options" aria-label={en ? 'Indicators' : '选择指标'}>
          {REVIEW_MARKET_KEYS.map(key => {
            const item = available.get(key);
            const state = key === 'fearGreed' ? visible.fearState : visible.vixState;
            const detail = state === 'loading' ? (en ? 'Loading…' : '正在读取…') : state === 'auth'
              ? (en ? 'Sign in to view' : '登录后可读取') : state === 'error'
                ? (en ? 'Source unavailable' : '来源暂不可用') : (en ? 'No close for this date' : '该日暂无收盘数据');
            return <label className="review-market-option" key={key} data-unavailable={!item}>
              <input type="checkbox" checked={Boolean(item && selectedKeys.includes(key))} disabled={!item} onChange={() => toggle(key)} />
              <span className="review-market-checkbox" aria-hidden="true">{item && selectedKeys.includes(key) && <Check size={14} strokeWidth={2.6} />}</span>
              <span className="review-market-option-name"><strong>{reviewMarketItemLabel(key, language)}</strong><small>{key === 'fearGreed' ? 'CNN' : key === 'ratio' ? 'Cboe · VIX / VIX3M' : 'Cboe · VIX'} · {en ? 'Daily close' : '日线收盘'}</small></span>
              <span className="review-market-option-reading"><strong>{item ? formatReviewMarketItem(item, language) : '—'}</strong><small>{item ? reviewMarketItemState(item, language) : detail}</small></span>
            </label>;
          })}
        </div>
        {sourceFailed && <div className="review-market-retry"><span>{en ? 'Available indicators can still be inserted.' : '已读取的指标仍可单独插入。'}</span><button type="button" disabled={busy} onClick={() => setRetry(count => count + 1)}>{en ? 'Retry' : '重试'}</button></div>}
        <div className="review-market-preview-heading">{en ? 'Snapshot preview' : '快照预览'}</div>
        {snapshot ? <SnapshotCard value={snapshot} language={language} /> : <div className="review-market-empty">{en ? 'Select at least one available indicator.' : '选择至少一项有数据的指标。'}</div>}
        <p className="review-market-note">{previewData
          ? (en ? 'Example data only. No live API request.' : '本地示例数据，未请求实时接口。')
          : (en ? 'Saved readings stay unchanged. Missing dates are never replaced automatically.' : '保存后数值保持不变，缺失日期不会自动替换。')}</p>
      </div>
      <footer className="review-market-actions"><button type="button" onClick={close}>{en ? 'Cancel' : '取消'}</button><button type="button" disabled={!snapshot} onClick={() => { if (snapshot) { onChange?.(JSON.parse(JSON.stringify(snapshot))); close(); } }}>{en ? 'Insert snapshot' : '插入快照'}</button></footer>
    </div>
  </dialog>, document.body);
}

export default SnapshotCard;
