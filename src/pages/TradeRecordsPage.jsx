import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpDown, CalendarDays, Check, ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import CurrencyToggle from '../components/CurrencyToggle.jsx';
import TradeOutcomeReview from '../components/TradeOutcomeReview.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import { stripStockTradeRecordKind } from '../lib/stockTradeRecordKind.js';
import { buildTradeRecordsView, getTradeRecordDateRange, isValidTradeRecordDate } from '../lib/tradeRecordsModel.js';
import './TradeRecordsPage.css';

const EMPTY_FILTERS = Object.freeze({ symbols: [], period: 'all', fromDate: '', toDate: '', side: 'all', sort: 'newest' });
const PERIODS = [['all', '全部时间', 'All dates'], ['month', '本月', 'This month'], ['lastMonth', '上个月', 'Last month'], ['year', '今年', 'This year'], ['custom', '自定义', 'Custom']];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cloneFilters = value => ({ ...value, symbols: [...value.symbols] });
const quantity = value => finite(Number(value)) && value !== null && value !== '' ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
function SymbolMark({ symbol = '' }) {
  const key = String(symbol).toUpperCase();
  return <span className={`trp-symbol-mark${key === 'MSFT' ? ' trp-msft' : ''}`} aria-hidden="true">{key === 'MSFT' ? <><i/><i/><i/><i/></> : <span>{key.length > 4 ? key.slice(0, 3) : key}</span>}</span>;
}

export function TradeRecordsPageContent({
  trades = [], userId, language = 'zh', marketColorMode, displayCurrency = 'USD', usdRate,
  loading = false, error = '', onBack, onAdd, onEdit, onDelete, onCurrencyChange,
  tradeId = null, onSelectTrade, now, active = true, pending = false, historyLoader, logoCache = {}, cacheStockLogo, stockDisplayName,
}) {
  const en = language.startsWith('en');
  const tr = (zh, english) => en ? english : zh;
  const [filters, setFilters] = React.useState(() => cloneFilters(EMPTY_FILTERS));
  const [sheet, setSheet] = React.useState(null);
  const [draft, setDraft] = React.useState(() => cloneFilters(EMPTY_FILTERS));
  const [search, setSearch] = React.useState('');
  const [dateError, setDateError] = React.useState('');
  const dialogRef = React.useRef(null);
  const listScroll = React.useRef(0);
  const previousSelection = React.useRef(tradeId);
  const previousActive = React.useRef(active);
  const pageScroll = React.useRef(0);
  const returningToList = previousSelection.current != null && tradeId == null;
  const missingSelection = React.useRef(null);
  const dateKey = getTradeRecordDateRange('today', { now }).fromDate;
  const all = React.useMemo(() => buildTradeRecordsView({ trades, filters: EMPTY_FILTERS, now }), [trades, now, dateKey]);
  const view = React.useMemo(() => buildTradeRecordsView({ trades, filters, now }), [trades, filters, now, dateKey]);
  const selected = tradeId == null ? null : all.rows.find(row => String(row.id) === String(tradeId));
  const currency = displayCurrency === 'CNY' ? 'CNY' : 'USD';
  const factor = currency === 'CNY' ? Number(usdRate) > 0 && Number.isFinite(Number(usdRate)) ? Number(usdRate) : null : 1;
  const money = (value, nativeUsd = false) => !finite(value) || (!nativeUsd && factor === null) ? '—'
    : `${nativeUsd || currency === 'USD' ? '$' : '¥'}${(value * (nativeUsd ? 1 : factor)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signedMoney = value => !finite(value) || factor === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
  const splitMoney = value => { const text = money(value), split = text.lastIndexOf('.'); return split < 0 ? text : <>{text.slice(0, split)}<small>{text.slice(split)}</small></>; };
  const displayName = row => typeof stockDisplayName === 'function' ? stockDisplayName(row.symbol, row.name) : row.name || row.symbol;
  const sideText = side => side === 'buy' ? tr('买入', 'Buy') : side === 'sell' ? tr('卖出', 'Sell') : '—';
  const periodText = period => PERIODS.find(item => item[0] === period)?.[en ? 2 : 1] || tr('全部时间', 'All dates');
  const hasFilters = filters.symbols.length > 0 || filters.period !== 'all' || filters.side !== 'all';
  const range = filters.period === 'custom' ? filters : getTradeRecordDateRange(filters.period, { now });
  const selectedDateLabel = `${range.fromDate || '—'} — ${range.toDate || '—'}`;
  const controlsDisabled = Boolean((loading || error) && all.rows.length === 0);

  React.useLayoutEffect(() => {
    if (previousSelection.current === tradeId) return;
    const wasDetail = previousSelection.current != null;
    if (!wasDetail && tradeId != null) listScroll.current = window.scrollY || 0;
    previousSelection.current = tradeId;
    if (active) window.scrollTo({ top: tradeId == null ? listScroll.current : 0, left: 0, behavior: 'instant' });
    pageScroll.current = tradeId == null ? listScroll.current : 0;
    setSheet(null);
  }, [tradeId, active]);
  React.useLayoutEffect(() => {
    if (previousActive.current === active) return;
    previousActive.current = active;
    if (active) window.scrollTo({ top: pageScroll.current, left: 0, behavior: 'instant' });
    else {
      // App may clear the selected trade and hide this page in the same render.
      // The selection effect has already restored the saved list position.
      if (!returningToList) pageScroll.current = window.scrollY || 0;
      setSheet(null);
    }
  }, [active, returningToList]);
  React.useEffect(() => {
    if (tradeId == null || selected || loading || error) { missingSelection.current = null; return; }
    if (missingSelection.current === tradeId) return;
    missingSelection.current = tradeId;
    onSelectTrade?.(null);
  }, [tradeId, selected, loading, error, onSelectTrade]);
  React.useEffect(() => {
    if (!active || !sheet || typeof document === 'undefined') return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); setSheet(null); return; }
      if (event.key !== 'Tab') return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || [])];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [sheet, active]);

  const openSheet = kind => { setDraft(cloneFilters(filters)); setSearch(''); setDateError(''); setSheet(kind); };
  const applyFilters = () => {
    if (sheet === 'date' && draft.period === 'custom' && (!isValidTradeRecordDate(draft.fromDate) || !isValidTradeRecordDate(draft.toDate) || draft.fromDate > draft.toDate)) {
      setDateError(tr('请选择有效日期，开始日期应早于或等于结束日期。', 'Choose valid dates, with the start on or before the end.')); return;
    }
    setFilters(cloneFilters(draft)); setSheet(null); listScroll.current = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  const resetFilters = () => { setFilters(current => ({ ...cloneFilters(EMPTY_FILTERS), sort: current.sort })); listScroll.current = 0; window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); };
  const selectPeriod = period => {
    const bounds = period === 'custom' ? getTradeRecordDateRange('month', { now }) : getTradeRecordDateRange(period, { now });
    setDraft(current => ({ ...current, period, fromDate: period === 'custom' ? current.fromDate || bounds.fromDate : bounds.fromDate, toDate: period === 'custom' ? current.toDate || bounds.toDate : bounds.toDate })); setDateError('');
  };
  const openTrade = row => { listScroll.current = window.scrollY || 0; onSelectTrade?.(row.id); };
  const note = selected ? stripStockTradeRecordKind(selected.note) : '';
  const original = selected?.sourceTrade || selected;
  const cashFlow = selected && !selected.isHistoricalHolding && finite(selected.amountUsd) && finite(selected.feeUsd)
    ? selected.side === 'buy' ? -(selected.amountUsd + selected.feeUsd) : selected.side === 'sell' ? selected.amountUsd - selected.feeUsd : null : null;
  const nativePrice = row => row.currency !== 'USD' ? null : Number.isFinite(Number(row.price)) && row.price !== null && row.price !== '' ? Number(row.price) : null;
  const stockOptions = all.stockOptions.filter(stock => !search.trim() || `${stock.symbol} ${stock.name} ${displayName(stock)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <main className="trade-records-page" hidden={!active}>
    <header className="trp-header"><button type="button" className="trp-icon-button" onClick={tradeId != null ? () => onSelectTrade?.(null) : onBack} aria-label={tradeId != null ? tr('返回交易记录', 'Back to trade records') : tr('返回交易页', 'Back to Trades')}><ArrowLeft size={22}/></button><h1>{tradeId != null ? tr('交易详情', 'Trade details') : tr('交易记录', 'Trade records')}</h1>{tradeId == null ? <button type="button" className="trp-icon-button trp-add" onClick={onAdd} disabled={pending || !onAdd} aria-label={tr('新增交易', 'Add trade')}><Plus size={20}/></button> : <span/>}</header>
    {tradeId != null ? selected ? <article className="trp-detail">
      <div className="trp-detail-identity"><div className="trp-detail-company"><StockLogo symbol={selected.symbol} urls={stockLogoCandidates(selected.symbol, logoCache?.[selected.symbol]?.url)} onLogoLoad={cacheStockLogo} className="trp-detail-logo"/><div><h2>{selected.symbol}</h2><p>{displayName(selected)}</p></div></div><span className={`trp-detail-side trp-${selected.side}`}>{selected.isHistoricalHolding ? tr('历史持仓', 'Historical holding') : sideText(selected.side)}</span></div>
      <div className="trp-detail-amount"><span>{selected.isHistoricalHolding ? tr('记录成本', 'Recorded cost') : tr('成交金额', 'Trade amount')} <small>{currency}</small></span><strong>{money(selected.amountUsd)}</strong></div>
      <dl className="trp-detail-facts"><div><dt>{selected.isHistoricalHolding ? tr('记录日期', 'Record date') : tr('交易日期', 'Trade date')}</dt><dd>{selected.date || '—'}</dd></div><div><dt>{selected.isHistoricalHolding ? tr('平均成本 · USD', 'Average cost · USD') : tr('成交价 · USD', 'Price · USD')}</dt><dd>{money(nativePrice(selected), true)}</dd></div><div><dt>{tr('股数', 'Shares')}</dt><dd>{quantity(selected.shares)}</dd></div><div><dt>{tr('手续费', 'Fees')}</dt><dd>{money(selected.feeUsd)}</dd></div><div className="trp-cash-flow"><dt>{tr('含费收支', 'Cash flow incl. fees')}</dt><dd>{signedMoney(cashFlow)}</dd></div></dl>
      <section className="trp-note-section"><h2>{tr('交易备注', 'Trade note')}</h2><p className={note.trim() ? '' : 'trp-muted'}>{note.trim() ? note : tr('未填写备注', 'No note')}</p></section>
      {active && <TradeOutcomeReview key={`${userId || ''}:${selected.id}`} trade={original} userId={userId} language={language} marketColorMode={marketColorMode} showNote={false} historyLoader={historyLoader}/>}
      <div className="trp-detail-actions"><button type="button" onClick={() => onEdit?.(original)} disabled={pending || !onEdit}><Pencil size={17}/>{tr('修改交易', 'Edit trade')}</button><button type="button" className="trp-delete" onClick={() => onDelete?.(original)} disabled={pending || !onDelete}><Trash2 size={17}/>{tr('删除', 'Delete')}</button></div>
    </article> : <p className="trp-feedback" role="status">{loading ? tr('正在读取交易记录…', 'Loading trade records…') : error ? tr('暂时无法读取这笔交易。', 'This trade is unavailable right now.') : tr('这笔记录已删除，正在返回列表。', 'This record was deleted. Returning to the list.')}</p> : <>
      <div className="trp-filters-wrap"><div className="trp-filter-bar"><button type="button" className={filters.symbols.length ? 'trp-filter selected' : 'trp-filter'} onClick={() => openSheet('stock')} disabled={controlsDisabled}><Search size={14}/><span>{filters.symbols.length === 1 ? filters.symbols[0] : filters.symbols.length ? tr(`${filters.symbols.length} 只股票`, `${filters.symbols.length} stocks`) : tr('股票代码', 'Stocks')}</span><ChevronDown size={13}/></button><button type="button" className={filters.period !== 'all' ? 'trp-filter selected' : 'trp-filter'} onClick={() => openSheet('date')}><CalendarDays size={14}/><span>{periodText(filters.period)}</span><ChevronDown size={13}/></button><button type="button" className={filters.side !== 'all' ? 'trp-filter selected' : 'trp-filter'} onClick={() => openSheet('side')}><span>{filters.side === 'all' ? tr('买卖方向', 'Buy / Sell') : sideText(filters.side)}</span><ChevronDown size={13}/></button></div>
        {hasFilters && <div className="trp-chips">{filters.symbols.map(symbol => <button key={symbol} type="button" onClick={() => setFilters(current => ({ ...current, symbols: current.symbols.filter(value => value !== symbol) }))} aria-label={tr(`移除股票筛选 ${symbol}`, `Remove stock filter ${symbol}`)}>{symbol}<X size={12}/></button>)}{filters.period !== 'all' && <button type="button" onClick={() => setFilters(current => ({ ...current, period: 'all', fromDate: '', toDate: '' }))} aria-label={tr('清除日期筛选', 'Clear date filter')}>{selectedDateLabel}<X size={12}/></button>}{filters.side !== 'all' && <button type="button" onClick={() => setFilters(current => ({ ...current, side: 'all' }))} aria-label={tr('清除买卖方向筛选', 'Clear side filter')}>{sideText(filters.side)}<X size={12}/></button>}<button type="button" className="trp-reset" onClick={resetFilters}>{tr('清空筛选', 'Clear filters')}</button></div>}
      </div>
      {(loading || error) && <p className="trp-load-status" role="status">{error ? tr('交易记录暂未读取完整。', 'Trade records could not be loaded completely.') : tr('正在更新交易记录…', 'Updating trade records…')}</p>}
      <section className="trp-summary" aria-label={tr('筛选结果汇总', 'Filtered trade summary')}><div className="trp-summary-currency"><span>{hasFilters ? tr('当前筛选结果', 'Current results') : tr('全部交易汇总', 'All trades')}</span>{onCurrencyChange ? <CurrencyToggle value={currency} onChange={onCurrencyChange} label={tr('显示币种', 'Display currency')}/> : <span>{currency}</span>}</div><div className="trp-summary-grid"><div><span className="trp-summary-label"><i/>{tr('买入金额', 'Buy amount')}</span><strong>{controlsDisabled ? '—' : splitMoney(view.summary.buyAmountUsd)}</strong></div><div><span className="trp-summary-label trp-sell-label"><i/>{tr('卖出金额', 'Sell amount')}</span><strong>{controlsDisabled ? '—' : splitMoney(view.summary.sellAmountUsd)}</strong></div></div><div className="trp-summary-foot"><span>{tr('交易笔数', 'Trades')} <b>{controlsDisabled ? '—' : view.summary.tradeCount}</b></span><span>{tr('手续费', 'Fees')} <b>{controlsDisabled ? '—' : money(view.summary.feeUsd)}</b></span></div>{view.summary.holdingCount > 0 && <p className="trp-summary-note">{tr(`另有 ${view.summary.holdingCount} 条历史持仓，未计入成交汇总。`, `${view.summary.holdingCount} historical holdings excluded from trade totals.`)}</p>}{!controlsDisabled && (!view.summary.amountsComplete || !view.summary.feesComplete) && <p className="trp-summary-note">{tr('部分金额或手续费待核对。', 'Some amounts or fees need verification.')}</p>}</section>
      <section className="trp-records"><div className="trp-section-header"><h2>{tr('交易明细', 'Records')} <small>{view.rows.length}{tr(' 笔', ' records')}</small></h2><button type="button" onClick={() => setFilters(current => ({ ...current, sort: current.sort === 'newest' ? 'oldest' : 'newest' }))} aria-label={tr('切换日期排序', 'Change date order')}>{filters.sort === 'newest' ? tr('最新优先', 'Newest first') : tr('最早优先', 'Oldest first')}<ArrowUpDown size={13}/></button></div>
        {view.groups.map(group => <section key={group.date || 'undated'} className="trp-day-group" aria-label={group.date || tr('日期待核对', 'Date unverified')}><div className="trp-date-heading"><span>{group.date ? group.date.replaceAll('-', '.') : tr('日期待核对', 'Date unverified')}</span><span>{group.rows.length}{tr(' 笔', ' records')}</span></div>{group.rows.map(row => <button key={row.id} type="button" className="trp-row" onClick={() => openTrade(row)} aria-label={tr(`查看 ${row.symbol} ${row.date || ''} ${row.isHistoricalHolding ? '历史持仓' : sideText(row.side)}`, `View ${row.symbol} ${row.date || ''} ${row.isHistoricalHolding ? 'historical holding' : sideText(row.side)}`)}><SymbolMark symbol={row.symbol}/><span className="trp-row-main"><span className="trp-row-title"><strong>{row.symbol}</strong><span className={`trp-side trp-${row.side}`}>{row.isHistoricalHolding ? tr('历史持仓', 'Holding') : sideText(row.side)}</span></span><span className="trp-row-facts"><span>{quantity(row.shares)}{tr(' 股', ' sh')}</span><span>·</span><span>{money(nativePrice(row), true)}</span></span></span><span className="trp-row-end"><strong>{money(row.amountUsd)}</strong><span>{displayName(row)}</span></span><ChevronRight className="trp-row-chevron" size={13}/></button>)}</section>)}
        {!view.rows.length && !loading && !error && <div className="trp-empty"><Search size={29}/><strong>{all.rows.length ? tr('没有符合条件的交易', 'No matching trades') : tr('还没有交易记录', 'No trade records yet')}</strong><p>{all.rows.length ? tr('试试调整股票、日期或买卖方向', 'Try different stocks, dates or directions.') : tr('新增一笔交易，开始记录。', 'Add a trade to start your record.')}</p>{hasFilters ? <button type="button" onClick={resetFilters}>{tr('清空筛选', 'Clear filters')}</button> : <button type="button" onClick={onAdd} disabled={pending || !onAdd}>{tr('新增交易', 'Add trade')}</button>}</div>}
      </section>{view.rows.length > 0 && <p className="trp-end">{tr('已显示全部记录', 'All records shown')}</p>}
    </>}
    {active && sheet && typeof document !== 'undefined' && createPortal(<div className="trp-sheet-shade" onClick={event => { if (event.target === event.currentTarget) setSheet(null); }}><section className="trp-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-label={sheet === 'stock' ? tr('选择股票', 'Choose stocks') : sheet === 'date' ? tr('交易日期', 'Trade dates') : tr('买卖方向', 'Trade direction')} tabIndex={-1}><div className="trp-sheet-handle"/><div className="trp-sheet-heading"><h2>{sheet === 'stock' ? tr('选择股票', 'Choose stocks') : sheet === 'date' ? tr('交易日期', 'Trade dates') : tr('买卖方向', 'Trade direction')}</h2><button type="button" onClick={() => setSheet(null)}>{tr('取消', 'Cancel')}</button></div>
      {sheet === 'stock' && <><label className="trp-search"><Search size={17}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('搜索股票代码或公司名称', 'Search symbol or company')} aria-label={tr('搜索股票代码或公司名称', 'Search symbol or company')}/></label><div className="trp-stock-options">{stockOptions.map(stock => <button key={stock.symbol} type="button" aria-pressed={draft.symbols.includes(stock.symbol)} onClick={() => setDraft(current => ({ ...current, symbols: current.symbols.includes(stock.symbol) ? current.symbols.filter(value => value !== stock.symbol) : [...current.symbols, stock.symbol] }))}><SymbolMark symbol={stock.symbol}/><span><strong>{stock.symbol}</strong><small>{displayName(stock)}</small></span><span className="trp-check"><Check size={13}/></span></button>)}{!stockOptions.length && <p>{tr('没有匹配的股票', 'No matching stocks')}</p>}</div></>}
      {sheet === 'date' && <><div className="trp-date-options">{PERIODS.map(([value, zh, english]) => <button key={value} type="button" aria-pressed={draft.period === value} onClick={() => selectPeriod(value)}>{en ? english : zh}</button>)}</div>{draft.period === 'custom' && <div className="trp-custom-dates"><label><span>{tr('开始日期', 'Start date')}</span><input type="date" value={draft.fromDate} onChange={event => { setDraft(current => ({ ...current, fromDate: event.target.value })); setDateError(''); }}/></label><label><span>{tr('结束日期', 'End date')}</span><input type="date" value={draft.toDate} onChange={event => { setDraft(current => ({ ...current, toDate: event.target.value })); setDateError(''); }}/></label></div>}{dateError && <p className="trp-field-error" role="alert">{dateError}</p>}</>}
      {sheet === 'side' && <div className="trp-side-options">{['all', 'buy', 'sell'].map(side => <button key={side} type="button" aria-pressed={draft.side === side} onClick={() => setDraft(current => ({ ...current, side }))}><span className={`trp-${side}`}>{side === 'all' ? tr('全部交易', 'All trades') : sideText(side)}</span>{draft.side === side && <Check size={17}/>}</button>)}</div>}
      <div className="trp-sheet-actions"><button type="button" onClick={() => { setDateError(''); setDraft(current => sheet === 'stock' ? { ...current, symbols: [] } : sheet === 'side' ? { ...current, side: 'all' } : { ...current, period: 'all', fromDate: '', toDate: '' }); }}>{tr('重置', 'Reset')}</button><button type="button" className="trp-apply" onClick={applyFilters}>{tr('确定', 'Apply')}{sheet === 'stock' && draft.symbols.length ? ` · ${draft.symbols.length}` : ''}</button></div>
    </section></div>, document.body)}
  </main>;
}

export default function TradeRecordsPage(props) {
  return <TradeRecordsPageContent key={props.userId || 'signed-out'} {...props}/>;
}
