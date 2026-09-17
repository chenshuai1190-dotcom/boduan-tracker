import React from 'react';
import { createPortal } from 'react-dom';
import { marketHexColor, MARKET_COLOR_MODES } from '../lib/marketColorMode.js';
import StockReportModal from './StockReportModal.jsx';
import { attachTechnicalExplanationAccess } from './TechnicalExplanationSheet.jsx';
import './StockTradeEvents.css';

function number(value) {
  if (!['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quantity(value) {
  const parsed = number(value);
  return parsed === null ? '--' : parsed.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function money(value, currency = 'USD', rate = 1, signed = false) {
  const parsed = number(value), conversion = currency === 'USD' ? 1 : number(rate);
  if (parsed === null || conversion === null || conversion <= 0) return '--';
  const amount = parsed * conversion;
  if (!Number.isFinite(amount)) return '--';
  return `${amount < 0 ? '−' : signed && amount > 0 ? '+' : ''}${currency === 'CNY' ? '¥' : '$'}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sideLabel(side, english) {
  if (side === 'buy') return english ? 'Buy' : '买入';
  if (side === 'sell') return english ? 'Sell' : '卖出';
  return '--';
}

function sideColor(side, mode) {
  return side === 'buy' || side === 'sell' ? marketHexColor(side === 'buy' ? -1 : 1, mode) : '#85858d';
}

function TradeDetailsSheet({ event, onClose, english, displayCurrency, displayRate, marketColorMode }) {
  const rootRef = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const dialog = rootRef.current?.querySelector('[role="dialog"]');
    if (!dialog) return undefined;
    return attachTechnicalExplanationAccess(dialog, () => closeRef.current?.());
  }, []);
  if (typeof document === 'undefined') return null;
  const records = Array.isArray(event?.records) ? event.records.filter(Boolean) : event ? [event] : [];
  return createPortal(<div className="ste-sheet-root" ref={rootRef}>
    <StockReportModal title={english ? 'Trade details' : '成交详情'} closeLabel={english ? 'Close trade details' : '关闭成交详情'}
      onClose={onClose} widthClassName="" panelClassName="ste-sheet-panel">
      <div className="ste-sheet-trades">
        {records.map((record, index) => {
          const fields = [
            [english ? 'Trade date' : '成交日期', record.date || '--'],
            [english ? 'Side' : '方向', sideLabel(record.side, english)],
            [english ? 'Shares' : '数量', quantity(record.shares)],
            [english ? 'Execution price · USD' : '成交价 · USD', money(record.price)],
            [english ? `Amount · ${displayCurrency}` : `成交金额 · ${displayCurrency}`, money(record.amountUsd, displayCurrency, displayRate)],
            [english ? 'Shares after trade' : '交易后持仓', quantity(record.heldSharesAfter)],
          ];
          if (record.side === 'sell') fields.push([english ? 'Realized P&L' : '已实现盈亏', money(record.realizedPnlUsd, displayCurrency, displayRate, true), number(record.realizedPnlUsd) === null ? undefined : marketHexColor(record.realizedPnlUsd, marketColorMode)]);
          return <section className="ste-detail" key={record.id || `${record.date}-${index}`}>
            <div className="ste-detail-heading"><span style={{ color: sideColor(record.side, marketColorMode) }}>{record.side === 'buy' ? 'B' : record.side === 'sell' ? 'S' : '—'}</span><span>{sideLabel(record.side, english)}</span></div>
            <dl>{fields.map(([label, value, color]) => <div key={label}><dt>{label}</dt><dd style={color ? { color } : undefined}>{value}</dd></div>)}</dl>
          </section>;
        })}
        {records.length === 0 && <p className="ste-empty">{english ? 'No trade records' : '暂无交易记录'}</p>}
      </div>
    </StockReportModal>
  </div>, document.body);
}

/** Read-only presentation of supplied ledger facts. No position or P&L replay. */
export default function StockTradeEvents({
  records = [], selectedEvent = null, onSelectEvent, onCloseEvent, language = 'zh',
  displayCurrency = 'CNY', displayRate = 1,
  marketColorMode = MARKET_COLOR_MODES.RED_UP_GREEN_DOWN, holdingDetails = [], initialTab = 'events',
}) {
  const [tab, setTab] = React.useState(initialTab === 'holdings' ? 'holdings' : 'events');
  const english = language === 'en';
  const sorted = (Array.isArray(records) ? records : []).filter(Boolean)
    .map((record, index) => ({ record, index }))
    .sort((a, b) => String(b.record.date || '').localeCompare(String(a.record.date || '')) || a.index - b.index)
    .map(({ record }) => record);
  const stats = ['buy', 'sell'].map(side => {
    const trades = sorted.filter(record => record.side === side);
    const amounts = trades.map(record => number(record.amountUsd));
    return { side, count: trades.length, amount: amounts.some(value => value === null) ? null : amounts.reduce((total, value) => total + value, 0) };
  });
  return <div className="stock-trade-events">
    <div className="ste-tabs" role="tablist" aria-label={english ? 'Trade review details' : '交易复盘明细'}>
      {['events', 'holdings'].map(value => <button type="button" role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>
        {value === 'events' ? english ? 'Trade events' : '交易事件' : english ? 'Position details' : '持仓明细'}
      </button>)}
    </div>
    {tab === 'events' ? <div className="ste-events" role="tabpanel">
      {sorted.length === 0 && <p className="ste-empty">{english ? 'No trade records in this period' : '当前周期暂无交易记录'}</p>}
      {sorted.map((record, index) => <button type="button" className="ste-event" key={record.id || `${record.date}-${index}`}
        onClick={() => onSelectEvent?.(record)} aria-label={`${record.date || '--'} ${sideLabel(record.side, english)} ${english ? 'trade details' : '成交详情'}`}>
        <span className="ste-marker" style={{ color: sideColor(record.side, marketColorMode) }} aria-hidden="true">{record.side === 'buy' ? 'B' : record.side === 'sell' ? 'S' : '—'}</span>
        <span className="ste-event-description"><span>{record.date || '--'} <small>{sideLabel(record.side, english)}</small></span><span className="ste-event-secondary">{quantity(record.shares)} {english ? 'shares' : '股'} · {money(record.price)}</span></span>
        <span className="ste-event-amount"><span className="ste-event-amount-content">
          <span>{money(record.amountUsd, displayCurrency, displayRate)}</span>
          {record.side === 'sell' && <span className="ste-event-realized" style={{ color: number(record.realizedPnlUsd) === null ? '#82828d' : marketHexColor(record.realizedPnlUsd, marketColorMode) }}>
            {english ? 'Realized ' : '已实现 '}{money(record.realizedPnlUsd, displayCurrency, displayRate, true)}
          </span>}
        </span><span className="ste-event-chevron" aria-hidden="true">›</span></span>
      </button>)}
    </div> : <div className="ste-holdings" role="tabpanel">
      <dl className="ste-facts">{(Array.isArray(holdingDetails) ? holdingDetails : []).map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value ?? '--'}</dd></div>)}</dl>
      <div className="ste-summary-label">{english ? 'Trade summary' : '交易汇总'}</div>
      <dl className="ste-facts ste-summary">{stats.map(stat => <React.Fragment key={stat.side}>
        <div><dt>{stat.side === 'buy' ? english ? 'Buy amount' : '买入金额' : english ? 'Sell amount' : '卖出金额'}</dt><dd>{money(stat.amount, displayCurrency, displayRate)}</dd></div>
        <div><dt>{stat.side === 'buy' ? english ? 'Buy trades' : '买入次数' : english ? 'Sell trades' : '卖出次数'}</dt><dd>{stat.count}</dd></div>
      </React.Fragment>)}</dl>
    </div>}
    {selectedEvent && <TradeDetailsSheet event={selectedEvent} onClose={onCloseEvent} english={english} displayCurrency={displayCurrency} displayRate={displayRate} marketColorMode={marketColorMode} />}
  </div>;
}
