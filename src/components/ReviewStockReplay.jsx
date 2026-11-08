import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { loadReviewStockReplayHistory } from '../lib/reviewStockReplayHistory.js';
import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';
import { normalizeInvestmentSymbol } from '../lib/investmentComparisonModel.js';
import { stockDetailChartDragIntent } from '../lib/watchlistStockDetail.js';
import { buildReviewStockReplay, collectReviewReplayTrades, isReviewReplayBuyHighlight, reviewReplayRequestRange, reviewReplayVisibleRows } from '../lib/reviewStockReplayModel.js';
import './ReviewStockReplay.css';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const price = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const W = 360, H = 200, LEFT = 52, RIGHT = 344, TOP = 18, BOTTOM = 166;
function chartGeometry(rows, mini = false) {
  const values = rows.map(row => row.close), low = Math.min(...values), high = Math.max(...values);
  const spread = Math.max(high - low, high * .035), min = Math.max(0, low - spread * .18), max = high + spread * .18;
  // Cards have no price axis; reserve only equal margins for endpoint markers.
  const left = mini ? W - RIGHT : LEFT;
  return { min, max, x: index => left + index / Math.max(1, rows.length - 1) * (RIGHT - left), y: value => BOTTOM - (value - min) / (max - min) * (BOTTOM - TOP) };
}
function pathFor(rows, geometry) { return rows.map((row, index) => `${index && !row.gapBefore ? 'L' : 'M'}${geometry.x(index).toFixed(2)} ${geometry.y(row.close).toFixed(2)}`).join(' '); }

function ReplayChart({ rows, trades, selectedTrade, selectedDate, onSelectDate, onSelectTrade, english, recordDate, mini = false }) {
  const gesture = React.useRef(null);
  if (!rows.length) return null;
  const geometry = chartGeometry(rows, mini), index = rows.findIndex(row => row.date === selectedDate), row = rows[index];
  const selectAt = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = clamp(((event.clientX - bounds.left) / bounds.width * W - LEFT) / (RIGHT - LEFT), 0, 1);
    onSelectDate?.(rows[Math.round(fraction * (rows.length - 1))].date);
  };
  const clear = event => { gesture.current = null; if (event?.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const marks = trades.flatMap((trade, tradeIndex) => {
    if (trade.recordKind === 'historical_holding') return [];
    const rowIndex = rows.findIndex(item => item.date === trade.markerDate);
    if (rowIndex < 0) {
      // A recorded date can lack a close (for example a weekend import).
      // Locate it on a separate date rail, never on a substituted price point.
      if (trade.markerDate || trade.date <= rows[0].date || trade.date >= rows.at(-1).date) return [];
      const next = rows.findIndex(item => item.date > trade.date);
      if (next < 1) return [];
      const before = Date.parse(rows[next - 1].date), after = Date.parse(rows[next].date);
      const fraction = (Date.parse(trade.date) - before) / (after - before);
      if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) return [];
      const separateSell = trade.side === 'sell' && trades.some(other => other.date === trade.date && other.side === 'buy' && other.recordKind !== 'historical_holding' && !other.markerDate);
      return [{ trade, tradeIndex, x: geometry.x(next - 1 + fraction), markerY: BOTTOM + (separateSell ? 46 : 22), unpriced: true }];
    }
    const x = geometry.x(rowIndex), y = geometry.y(rows[rowIndex].close);
    // Multiple executions remain separate ledger cards. Same-date marks share a
    // date coordinate; the selected execution is always drawn above its peers.
    const markerY = clamp(y + (trade.side === 'buy' ? 22 : -22), 20, H - 38);
    return [{ trade, tradeIndex, x, y, markerY }];
  }).sort((a, b) => Number(isReviewReplayBuyHighlight(a.trade, recordDate)) - Number(isReviewReplayBuyHighlight(b.trade, recordDate)) || Number(a.trade.key === selectedTrade?.key) - Number(b.trade.key === selectedTrade?.key));
  const dateRails = [...new Set(marks.filter(mark => mark.unpriced).map(mark => mark.markerY))];
  const height = H + dateRails.length * 24;
  return <div className={`rsr-chart${mini ? ' rsr-chart-mini' : ''}`}>
    <div className="rsr-chart-touch" role={mini ? undefined : 'slider'} tabIndex={mini ? undefined : 0}
      aria-label={mini ? undefined : english ? 'Drag horizontally or use arrow keys to inspect daily closes' : '左右拖动或使用方向键查看逐日收盘'}
      aria-valuemin={mini ? undefined : 0} aria-valuemax={mini ? undefined : rows.length - 1} aria-valuenow={mini ? undefined : Math.max(0, index)}
      aria-valuetext={mini ? undefined : row ? `${row.date} ${price(row.close)}` : english ? 'No close for the selected trade date' : '选中交易日没有收盘行情'}
      onPointerDown={mini ? undefined : event => {
        if (event.button > 0 || event.target.closest('button')) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: 'pending' };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        if (event.pointerType === 'mouse') selectAt(event);
      }} onPointerMove={mini ? undefined : event => {
        const current = gesture.current; if (!current || current.id !== event.pointerId) return;
        if (current.direction === 'pending') current.direction = stockDetailChartDragIntent(event.clientX - current.x, event.clientY - current.y);
        if (current.direction === 'horizontal') selectAt(event);
      }} onPointerUp={mini ? undefined : event => {
        if (gesture.current?.id === event.pointerId && gesture.current.direction !== 'vertical') selectAt(event); clear(event);
      }} onPointerCancel={clear} onLostPointerCapture={() => { gesture.current = null; }} onKeyDown={mini ? undefined : event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : clamp(Math.max(0, index) + (event.key === 'ArrowLeft' ? -1 : 1), 0, rows.length - 1);
        onSelectDate?.(rows[next].date);
      }}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={english ? 'Split-adjusted daily closes and trade dates' : '拆股复权日线与买卖日期'}>
        {!mini && [0, 1, 2, 3].map(tick => { const value = geometry.min + (geometry.max - geometry.min) * tick / 3; return <g key={tick}>
          <line className="rsr-grid" x1={LEFT} x2={RIGHT} y1={geometry.y(value)} y2={geometry.y(value)} />
          <text className="rsr-axis" x={LEFT - 8} y={geometry.y(value) + 4} textAnchor="end">{value.toFixed(value < 100 ? 1 : 0)}</text>
        </g>; })}
        <path className="rsr-price-path" d={pathFor(rows, geometry)} />
        {dateRails.map(y => <line key={y} className="rsr-date-rail" x1={geometry.x(0)} x2={geometry.x(rows.length - 1)} y1={y} y2={y} />)}
        {marks.map(({ trade, x, y, markerY, unpriced }) => <g className={`rsr-${trade.side}${unpriced ? ' rsr-unpriced' : ''}${isReviewReplayBuyHighlight(trade, recordDate) ? ' rsr-review-buy' : ''}`} key={trade.key} data-review-buy={isReviewReplayBuyHighlight(trade, recordDate) || undefined}>
          {unpriced ? <title>{trade.date} · {english ? 'Recorded date; no daily close' : '账本记录日期，当日无收盘行情'}</title> : <><line className="rsr-node-stem" x1={x} x2={x} y1={y} y2={markerY} /><circle className="rsr-node-anchor" cx={x} cy={y} r="2.5" /></>}
          {mini && <><circle className="rsr-mini-dot" cx={x} cy={markerY} r="8" /><text className="rsr-mini-label" x={x} y={markerY + 3.5} textAnchor="middle">{trade.side === 'buy' ? 'B' : 'S'}</text></>}
        </g>)}
        {!mini && row && <g className="rsr-inspection"><line x1={geometry.x(index)} x2={geometry.x(index)} y1={TOP} y2={BOTTOM} /><circle cx={geometry.x(index)} cy={geometry.y(row.close)} r="4" /></g>}
        {[0, rows.length - 1].map((i, n) => <text key={`${i}-${n}`} className="rsr-axis" x={geometry.x(i)} y={height - 8} textAnchor={n ? 'end' : 'start'}>{(rows[0].date.slice(0, 4) === rows.at(-1).date.slice(0, 4) ? rows[i].date.slice(5) : rows[i].date).replaceAll('-', '/')}</text>)}
      </svg>
      {!mini && marks.map(({ trade, tradeIndex, x, markerY, unpriced }) => <button key={trade.key} type="button"
        className={`rsr-node rsr-${trade.side}${unpriced ? ' rsr-unpriced' : ''}${isReviewReplayBuyHighlight(trade, recordDate) ? ' rsr-review-buy' : ''}${trade.key === selectedTrade?.key ? ' rsr-node-selected' : ''}`}
        data-review-buy={isReviewReplayBuyHighlight(trade, recordDate) || undefined}
        style={{ left: `${x / W * 100}%`, top: `${markerY / height * 100}%` }}
        aria-label={`${trade.date} ${trade.side === 'buy' ? english ? 'Buy' : '买入' : english ? 'Sell' : '卖出'} ${trade.sameDayOrder}/${trade.sameDayCount}${unpriced ? english ? ' · No daily close' : ' · 当日无收盘行情' : ''}`}
        aria-pressed={trade.key === selectedTrade?.key} onClick={() => onSelectTrade(tradeIndex)}><span>{trade.side === 'buy' ? english ? 'B' : '买' : english ? 'S' : '卖'}</span></button>)}
    </div>
  </div>;
}

function ReplayDialog({ symbol, model, loading, error, onRetry, onClose, english, preview, recordDate }) {
  const dialogRef = React.useRef(null), trackRef = React.useRef(null), closeRef = React.useRef(onClose), scrollTimer = React.useRef(null), scrollLockUntil = React.useRef(0);
  const [selected, setSelected] = React.useState(() => { const matching = model.trades.findLastIndex(trade => isReviewReplayBuyHighlight(trade, recordDate)); return matching >= 0 ? matching : Math.max(0, model.trades.length - 1); }), [range, setRange] = React.useState('all'), [inspection, setInspection] = React.useState(null);
  closeRef.current = onClose;
  const selectedIndex = clamp(selected, 0, Math.max(0, model.trades.length - 1)), trade = model.trades[selectedIndex];
  const visible = React.useMemo(() => reviewReplayVisibleRows(model.rows, trade?.date, range), [model.rows, trade?.date, range]);
  const validInspection = inspection && visible.some(row => row.date === inspection) ? inspection : null;
  const holdingSelected = trade?.recordKind === 'historical_holding' && !validInspection;
  const selectedDate = validInspection || (holdingSelected ? null : trade?.date || visible.at(-1)?.date);
  const selectedRow = visible.find(row => row.date === selectedDate);
  const tr = (zh, en) => english ? en : zh;
  React.useEffect(() => {
    const node = dialogRef.current, trigger = document.activeElement, overflow = document.body.style.overflow;
    // A parent composer/detail sheet may already own the lock. On a whole-tree
    // unmount, restoring its old `hidden` value would re-lock the page after the
    // parent released it; only restore a lock acquired by this replay.
    const ownsScrollLock = overflow !== 'hidden';
    if (ownsScrollLock) document.body.style.overflow = 'hidden';
    node.showModal(); node.focus({ preventScroll: true });
    const cancel = event => { event.preventDefault(); closeRef.current(); }; node.addEventListener('cancel', cancel);
    return () => { clearTimeout(scrollTimer.current); node.removeEventListener('cancel', cancel); if (node.open) node.close(); if (ownsScrollLock) document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  const selectTrade = React.useCallback((index, scroll = true) => {
    const next = clamp(index, 0, Math.max(0, model.trades.length - 1)); setSelected(next); setInspection(null);
    if (scroll && trackRef.current?.children[next]) {
      const track = trackRef.current; scrollLockUntil.current = performance.now() + 500;
      track.scrollTo({ left: track.children[next].offsetLeft - parseFloat(getComputedStyle(track).paddingLeft || 0), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, [model.trades.length]);
  React.useEffect(() => {
    const track = trackRef.current; if (!track?.children[selectedIndex]) return;
    track.scrollTo({ left: track.children[selectedIndex].offsetLeft - parseFloat(getComputedStyle(track).paddingLeft || 0), behavior: 'auto' });
  }, [model.trades.length]); // Initial newest transaction; no extra network request.
  return createPortal(<dialog ref={dialogRef} tabIndex={-1} className="rsr-dialog" aria-label={`${symbol} ${tr('交易回放', 'trade replay')}`}>
    <header className="rsr-header"><button type="button" onClick={onClose} aria-label={tr('返回投资动态', 'Back to Investment Activity')}><ArrowLeft size={22} /></button><div><strong>{symbol}</strong><span>{tr('交易回放', 'Trade replay')}</span></div><span className="rsr-header-kind">{preview ? tr('示例', 'Demo') : 'USD'}</span></header>
    <div className="rsr-scroll">
      <div className="rsr-readout"><span>{holdingSelected ? tr('历史持仓 · 平均成本', 'Historical holding · Average cost') : `${selectedDate || '—'} · ${tr('拆股复权收盘', 'Split-adjusted close')}`}</span><strong>{price(holdingSelected ? trade.price : selectedRow?.close)}</strong></div>
      <nav className="rsr-ranges" aria-label={tr('走势范围', 'Chart range')}>{[['stage', '本次交易', 'Trade'], ['1m', '1个月', '1M'], ['3m', '3个月', '3M'], ['6m', '6个月', '6M'], ['1y', '1年', '1Y'], ['all', '全部', 'All']].map(([value, zh, en]) => <button type="button" key={value} aria-pressed={range === value} onClick={() => { setRange(value); setInspection(null); }}>{tr(zh, en)}</button>)}</nav>
      {loading && !model.rows.length ? <div className="rsr-status" role="status"><RefreshCw size={17} className="ic-spin" />{tr('正在读取历史行情…', 'Loading history…')}</div> : error && !model.rows.length ? <div className="rsr-status" role="status"><p>{error === 'AUTH_REQUIRED' ? tr('请重新登录后读取行情。', 'Please sign in again.') : tr('历史行情暂不可用，交易记录仍可查看。', 'History is unavailable; trade records remain visible.')}</p><button type="button" onClick={onRetry}>{tr('重试', 'Retry')}</button></div>
        : visible.length ? <ReplayChart rows={visible} trades={model.trades} selectedTrade={trade} selectedDate={selectedDate} onSelectDate={setInspection} onSelectTrade={selectTrade} english={english} recordDate={recordDate} />
          : <div className="rsr-status" role="status">{tr('这个阶段没有有效日线。', 'No valid daily history for this period.')}</div>}
      {error && model.rows.length > 0 && <div className="rsr-refresh-note" role="status">{tr('更新暂未完成，正在显示已缓存的历史行情。', 'Refresh failed; showing cached history.')}<button type="button" onClick={onRetry}>{tr('重试', 'Retry')}</button></div>}
      <div className="rsr-chart-caption"><span>{visible.length ? `${visible[0].date} — ${visible.at(-1).date}` : '—'}</span><button type="button" disabled={!trade} onClick={() => setInspection(null)}>{trade?.recordKind === 'historical_holding' ? tr('查看持仓记录', 'View holding record') : tr('定位交易', 'Locate trade')}</button></div>
      <p className="rsr-marker-note">{holdingSelected ? tr('历史持仓按平均成本汇总，录入日期不代表实际买入日', 'Historical holdings use an average cost; entry dates are not execution dates') : model.trades.some(record => record.recordKind !== 'historical_holding' && !record.markerDate && record.date > visible[0]?.date && record.date < visible.at(-1)?.date) ? tr('空心节点表示该日无收盘行情，成交价见下方', 'Hollow markers have no daily close; execution prices appear below') : tr('节点仅标记交易日，实际成交价见下方', 'Markers show trade dates; execution prices appear below')}</p>
      <div className="rsr-trades-heading"><h2>{tr('我的交易', 'My trades')}</h2><div><button type="button" disabled={!model.trades.length || selectedIndex === 0} onClick={() => selectTrade(selectedIndex - 1)} aria-label={tr('上一笔', 'Previous trade')}><ChevronLeft size={18} /></button><span>{model.trades.length ? selectedIndex + 1 : 0} / {model.trades.length}</span><button type="button" disabled={!model.trades.length || selectedIndex >= model.trades.length - 1} onClick={() => selectTrade(selectedIndex + 1)} aria-label={tr('下一笔', 'Next trade')}><ChevronRight size={18} /></button></div></div>
      <div className="rsr-trade-track" ref={trackRef} onPointerDown={() => { scrollLockUntil.current = 0; }} onScroll={() => {
        clearTimeout(scrollTimer.current); scrollTimer.current = setTimeout(() => {
          const track = trackRef.current; if (!track || performance.now() < scrollLockUntil.current) return;
          const padding = parseFloat(getComputedStyle(track).paddingLeft || 0), cards = [...track.children]; if (!cards.length) return;
          const closest = cards.reduce((best, card, index) => Math.abs(card.offsetLeft - padding - track.scrollLeft) < Math.abs(cards[best].offsetLeft - padding - track.scrollLeft) ? index : best, 0); selectTrade(closest, false);
        }, 110);
      }}>
        {model.trades.map((record, index) => <article className={`rsr-trade${index === selectedIndex ? ' rsr-trade-selected' : ''}`} key={record.key} tabIndex={0} role="button" aria-pressed={index === selectedIndex} onClick={() => selectTrade(index)} onKeyDown={event => {
          if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectTrade(index); }
          else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); selectTrade(index + (event.key === 'ArrowLeft' ? -1 : 1)); }
        }}><header><span className={`rsr-side rsr-${record.recordKind === 'historical_holding' ? 'holding' : record.side}`}>{record.recordKind === 'historical_holding' ? tr('历史持仓', 'Historical holding') : record.side === 'buy' ? tr('买入', 'Buy') : tr('卖出', 'Sell')}</span><time>{record.recordKind === 'historical_holding' ? tr('录入于 ', 'Entered ') : ''}{record.date}</time>{record.sameDayCount > 1 && <small>{tr('同日', 'Same date')} {record.sameDayOrder}/{record.sameDayCount}</small>}</header>
          <dl className={record.recordKind === 'historical_holding' ? 'rsr-holding-values' : undefined}><div><dt>{record.recordKind === 'historical_holding' ? tr('平均成本', 'Average cost') : tr('实际成交价', 'Execution price')}</dt><dd>{price(record.price)}</dd></div><div><dt>{record.recordKind === 'historical_holding' ? tr('持仓数量', 'Recorded shares') : tr('股数', 'Shares')}</dt><dd>{record.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</dd></div>{record.recordKind !== 'historical_holding' && <div><dt>{tr('当日复权收盘', 'Adjusted close')}</dt><dd>{price(record.close)}</dd></div>}</dl>
          <p>{record.recordKind === 'historical_holding' ? tr('历史买入汇总，不作为当天买入节点', 'Aggregated prior purchases; not a buy on the entry date') : record.markerDate ? tr('记录仅含成交日期，无成交时分秒', 'Recorded date only; execution time is unavailable') : tr('当日无收盘行情，保留账本原始日期', 'No daily close; the original recorded date is retained')}</p>
        </article>)}
      </div>
      {!model.trades.length && <p className="rsr-empty-trades">{tr('尚无该股票的正式交易记录', 'No recorded trades for this stock')}</p>}
      <p className="rsr-source">{preview ? tr('本地示例交易／示意走势', 'Local demo trades / illustrative prices') : 'EODHD · ' + tr('拆股复权日线', 'Split-adjusted daily closes')}{model.splitBasisDate ? ` · ${model.splitBasisDate}` : ''}<br />{tr('成交价保留账本原值，不与复权曲线直接计算盈亏。', 'Execution prices retain ledger values; no P&L is derived against adjusted history.')}</p>
    </div>
  </dialog>, document.body);
}

function ScopedReplay({ symbol, stockTrades, userId, language, previewHistory, companionSymbol, recordDate, previewHistoryLoader }) {
  const english = language?.startsWith('en'), preview = import.meta.env.DEV && previewHistory?.synthetic === true ? previewHistory : null;
  const historyLoader = import.meta.env.DEV && previewHistoryLoader || loadReviewStockReplayHistory;
  const example = Boolean(preview || import.meta.env.DEV && previewHistoryLoader);
  const cardRef = React.useRef(null);
  const [visible, setVisible] = React.useState(false);
  const [open, setOpen] = React.useState(false), [attempt, setAttempt] = React.useState(0), [loaded, setLoaded] = React.useState({ key: '', data: null, error: '', loading: false });
  const endDate = preview?.asOfDate || getInvestmentComparisonExpectedCloseDate();
  const records = React.useMemo(() => collectReviewReplayTrades({ stockTrades, symbol, userId }), [stockTrades, symbol, userId]);
  const dates = reviewReplayRequestRange(records, endDate), companion = normalizeInvestmentSymbol(companionSymbol) || (symbol === 'QQQ' ? 'SPY' : 'QQQ');
  const effectiveCompanion = companion === symbol ? symbol === 'QQQ' ? 'SPY' : 'QQQ' : companion;
  const historyArgs = { userId, symbols: [symbol, effectiveCompanion], ...dates };
  const key = JSON.stringify([userId, symbol, effectiveCompanion, dates?.startDate, dates?.endDate, endDate, attempt]);
  const shouldLoad = visible || open;
  React.useEffect(() => historyLoader.subscribe(() => setLoaded({ key, data: null, error: 'AUTH_REQUIRED', loading: false })), [historyLoader, key]);
  React.useEffect(() => {
    if (preview) return undefined;
    if (!window.IntersectionObserver) { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [preview]);
  React.useEffect(() => {
    if (!shouldLoad || preview || !userId || !dates) return undefined;
    const controller = new AbortController(); setLoaded({ key, data: historyLoader.peek(historyArgs), error: '', loading: true });
    // Existing authenticated stock-comparison contract needs 2–4 symbols. The
    // companion only satisfies that contract and is never included in the chart.
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      return historyLoader({ ...historyArgs, force: attempt > 0, signal: controller.signal });
    }).then(data => { if (!controller.signal.aborted) setLoaded({ key, data, error: '', loading: false }); })
      .catch(error => { if (!controller.signal.aborted) setLoaded({ key, data: historyLoader.peek(historyArgs), error: error?.code?.startsWith('REVIEW_') ? 'AUTH_REQUIRED' : error?.code || 'NETWORK_ERROR', loading: false }); });
    return () => controller.abort();
  }, [shouldLoad, key, preview, historyLoader]);
  const current = loaded.key === key ? loaded : null;
  // Peek on every render, not only initialization: the session epoch may have
  // changed while this card remained mounted. Never restore revoked local data.
  const history = preview || historyLoader.peek(historyArgs) || (historyLoader.isCurrent(historyArgs, current?.data) ? current.data : null);
  const model = React.useMemo(() => buildReviewStockReplay({ stockTrades, symbol, userId, history, endDate, allowSynthetic: Boolean(preview) }), [stockTrades, symbol, userId, history, endDate, preview]);
  const miniRows = model.rows;
  const loading = Boolean(!history && shouldLoad && !preview && userId && (!current || current.loading));
  const error = !userId ? 'AUTH_REQUIRED' : current?.error || (history && !model.validHistory ? 'INVALID_DATA' : '');
  return <section ref={cardRef} className="rsr-card" data-review-stock-replay={symbol}>
    <button type="button" className="rsr-card-open" onClick={() => setOpen(true)} aria-label={`${symbol} ${english ? 'trade replay' : '交易回放'}`}>
      <header><strong>{symbol}</strong><span>{example ? english ? 'Demo trades' : '示例交易' : english ? 'My trade dates' : '我的买卖节点'}</span><ChevronRight size={17} /></header>
      {miniRows.length ? <ReplayChart rows={miniRows} trades={model.trades} selectedTrade={null} english={english} recordDate={recordDate} mini /> : <div className="rsr-card-chart-status" role="status">{error ? english ? 'History unavailable · open to retry' : '历史行情暂不可用 · 点击重试' : loading || !shouldLoad ? english ? 'Loading chart…' : '正在读取走势…' : english ? 'No historical prices available' : '暂无可用历史行情'}</div>}
      {model.trades.some(trade => trade.recordKind === 'historical_holding') && <span className="rsr-holding-caption">{english ? 'Includes historical holdings' : '含历史持仓记录'}</span>}
      {error && miniRows.length > 0 && <span className="rsr-holding-caption">{english ? 'Cached history · open to retry refresh' : '已缓存走势 · 点击重试更新'}</span>}
    </button>
    {open && <ReplayDialog symbol={symbol} model={model} loading={loading} error={error} onRetry={() => setAttempt(value => value + 1)} onClose={() => setOpen(false)} english={english} preview={example} recordDate={recordDate} />}
  </section>;
}

/** Visible cards load automatically through a shared, bounded request pool.
 * Owner-scoped mapped stock_trades are required;
 * DevVisualPreview alone may supply an explicitly synthetic previewHistory. */
export default function ReviewStockReplay({ symbol, stockTrades = [], userId = '', language = 'zh', previewHistory, companionSymbol, recordDate, previewHistoryLoader }) {
  const ticker = normalizeInvestmentSymbol(symbol); if (!ticker) return null;
  return <ScopedReplay key={`${userId}:${ticker}`} symbol={ticker} stockTrades={stockTrades} userId={userId} language={language} previewHistory={previewHistory} companionSymbol={companionSymbol} recordDate={recordDate} previewHistoryLoader={previewHistoryLoader} />;
}
