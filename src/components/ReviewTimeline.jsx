import React from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, Flag, History, Info, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { marketHexColor } from '../lib/marketColorMode.js';
import { normalizeReviewMarketSnapshot } from '../lib/reviewMarketSnapshot.js';
import { isReviewEarningsEvent, reviewEarningsScope, reviewEarningsRecordLabel } from '../lib/reviewTimelineEarnings.js';
import { getStockTradeRecordKind } from '../lib/stockTradeRecordKind.js';
import { convertReviewMoney, formatReviewMoney, reviewCurrencyNotice, reviewDisplayCurrency } from '../lib/reviewDisplayCurrency.js';
import { SnapshotCard } from './ReviewMarketSnapshot.jsx';
import './ReviewTimeline.css';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const isEnglish = language => String(language).toLowerCase().startsWith('en');
const label = (en, zh, english) => en ? english : zh;
const money = (value, currency) => formatReviewMoney(value, currency);
const percent = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
const shortDate = value => typeof value === 'string' ? value.slice(5).replace('-', '.') : '—';
const eventStyle = (value, mode) => finite(value) && value !== 0 ? { color: marketHexColor(value, mode) } : undefined;
const metricLabel = (metric, en) => ({
  net_assets: label(en, '收盘净资产', 'Closing net assets'),
  cumulative_return: label(en, '报表累计收益率', 'Report cumulative return'),
  cumulative_pnl: label(en, '累计盈利金额', 'Cumulative P&L'),
  annual_return: label(en, '年内收益率', 'Annual return'),
  annual_pnl: label(en, '年内收益金额', 'Annual P&L'),
  daily_return: label(en, '报表单日收益率', 'Report daily return'),
  stock_daily_return: label(en, '个股单日跌幅', 'Stock one-day decline'),
  period_return: label(en, '报表区间收益率', 'Report period return'),
}[metric] || label(en, '收盘记录', 'Closing record'));
const isStockDailyRecord = event => event.kind === 'record' && event.metric === 'stock_daily_return';
const stockSymbol = event => event.symbol || /^record:stock_daily_return:([^:]+):/.exec(event.id || '')?.[1] || '';
const eventTitle = (event, en) => isStockDailyRecord(event) && en ? `${stockSymbol(event)} · Largest one-day decline of the year` : event.title;
const isReturnDrawdown = event => event.kind === 'drawdown' && event.metric === 'cumulative_return';
const seriesMetric = event => ['high', 'low'].includes(event.kind) || isReturnDrawdown(event) ? event.metric : 'net_assets';
const isReturnSeries = event => ['cumulative_return', 'annual_return'].includes(seriesMetric(event));
const isPnlSeries = event => ['cumulative_pnl', 'annual_pnl'].includes(seriesMetric(event));
const pointValue = (event, point) => point?.[({ cumulative_return: 'cumulativeReturnPct', cumulative_pnl: 'cumulativePnlUsd', annual_return: 'annualReturnPct', annual_pnl: 'annualPnlUsd' })[seriesMetric(event)] || 'netAssetsUsd'];
const seriesLabel = (event, en) => ({
  cumulative_return: label(en, '累计收益率', 'Cumulative return'),
  cumulative_pnl: label(en, '累计盈利金额', 'Cumulative P&L'),
  annual_return: label(en, '年内收益率', 'Annual return'),
  annual_pnl: label(en, '年内收益金额', 'Annual P&L'),
}[seriesMetric(event)] || label(en, '净资产', 'Net assets'));
const declineReading = (event, value) => isReturnDrawdown(event) ? finite(value) ? `${Math.abs(value).toFixed(2)}%` : '—' : percent(value);
const pointReading = (event, point, currency) => isReturnSeries(event) ? percent(pointValue(event, point)) : money(pointValue(event, point), currency);
const drawdownLabel = (event, en, maximum = false) => isReturnDrawdown(event)
  ? label(en, maximum ? '本轮最大回落' : '较年内高点回落', maximum ? 'Maximum return decline' : 'Decline from yearly high')
  : label(en, maximum ? '本轮最大回撤' : '当前回撤', maximum ? 'Maximum drawdown' : 'Current drawdown');
const statusLabel = (event, en) => event.status === 'interrupted' && event.interruptionReason === 'year_boundary'
  ? label(en, '本年度已结束', 'Year ended') : ({
  active: label(en, '恢复中', 'Recovering'),
  recovered: label(en, '已恢复', 'Recovered'),
  interrupted: label(en, '数据待核对', 'Needs review'),
  archived: label(en, '保留的评价', 'Saved reflection'),
}[event.status] || '');
const nodeLabel = (node, en, event) => !en ? node.label : ['high', 'low'].includes(event?.kind) && ['start', 'current'].includes(node.key)
  ? node.key === 'start' ? event.kind === 'low' ? 'Prior low' : 'Prior high' : event.kind === 'low' ? 'New low' : 'New high'
  : ({ peak: 'Peak', trigger: 'First 10%', trough: 'Low', current: 'Latest', recovery: 'Recovered' }[node.key] || node.label);
const iconFor = event => event.kind === 'drawdown' ? (event.status === 'recovered' ? History : ArrowDownRight)
  : event.kind === 'high' ? ArrowUpRight : event.kind === 'low' ? ArrowDownRight : event.kind === 'period' ? CalendarDays : event.value < 0 ? ArrowDownRight : Flag;
const displayValue = event => event.kind === 'drawdown' ? event.maxDrawdownPct : event.value;
const reading = (event, currency) => event.valueType === 'money' ? money(displayValue(event), currency) : declineReading(event, displayValue(event));
const directional = event => event.kind === 'drawdown' || event.valueType === 'percent' || ['cumulative_pnl', 'annual_pnl'].includes(event.metric);

function interruptionText(event, en) {
  if (event.interruptionReason === 'year_boundary') return label(en, '本年度跟踪已结束，尚未回到年内高点。', 'Tracking ended with the year; the yearly high was not recovered.');
  const reasons = {
    external_cash_flow: label(en, '发生转入或转出', 'a deposit or withdrawal'),
    cash_adjustment: label(en, '现金余额调整或冲正', 'a cash adjustment or reversal'),
    cash_source_changed: label(en, '现金数据来源变化', 'a change in the cash data source'),
    missing_session: label(en, '收盘记录缺失', 'missing closing records'),
    missing_net_assets: label(en, '净资产数据缺失', 'missing net-asset data'),
    missing_return: label(en, '收益率数据缺失', 'missing return data'),
  };
  const reason = reasons[event.interruptionReason] || label(en, '资金或数据变化', 'a cash or data change');
  const date = event.interruptedAt ? `${event.interruptedAt} · ` : '';
  return `${date}${en ? `Comparison stopped due to ${reason}; recovery is unconfirmed.` : `因${reason}停止比较，未判定为恢复。`}`;
}

function eventSummary(event, en) {
  if (event.status === 'archived') return event.description || label(en, '来源数据已更新，保留此前写下的评价。', 'Source data changed; your previous reflection is preserved.');
  if (isReviewEarningsEvent(event)) return reviewEarningsRecordLabel(event, en);
  if (event.kind === 'drawdown') {
    if (event.status === 'interrupted') return interruptionText(event, en);
    const days = finite(event.durationDays) ? ` · ${event.durationDays} ${label(en, '天', 'days')}` : '';
    return event.status === 'recovered'
      ? `${label(en, '已回到前高', 'Back at the peak')}${days}`
      : `${drawdownLabel(event, en)} ${declineReading(event, event.drawdownPct)}${days}`;
  }
  return '';
}

/** Both views consume model-owned dates and amounts; missing values never become zeroes. */
export function TimelineChart({ event, selectedPoint, detail = false, marketColorMode, language = 'zh', displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), currency = { displayCurrency, usdCny, fxDate };
  if (isStockDailyRecord(event)) return null;
  const currencyInfo = reviewDisplayCurrency(currency), returnSeries = isReturnSeries(event), pnlSeries = isPnlSeries(event);
  if (!returnSeries && !currencyInfo.available) return <p className="rjt-chart-empty">{pnlSeries ? label(en, '人民币汇率暂不可用，收益金额曲线待更新。', 'The P&L chart will be available when the CNY exchange rate is available.') : label(en, '人民币汇率暂不可用，净资产曲线待更新。', 'The net-asset chart will be available when the CNY exchange rate is available.')}</p>;
  const plottedValue = point => returnSeries ? pointValue(event, point) : convertReviewMoney(pnlSeries ? pointValue(event, point) : point?.chartValue ?? point?.netAssetsUsd, currency);
  const source = Array.isArray(event.points) ? event.points : [];
  const points = source.filter(point => finite(plottedValue(point)) && Number.isFinite(Date.parse(point.date)));
  if (points.length < 2) return <p className="rjt-chart-empty">{returnSeries ? label(en, '这一时刻暂无可展示的连续收益率曲线。', 'A continuous return series is not available for this event.') : pnlSeries ? label(en, '这一时刻暂无可展示的连续收益金额曲线。', 'A continuous P&L series is not available for this event.') : label(en, '这一时刻暂无可展示的连续净资产曲线。', 'A continuous net-asset series is not available for this event.')}</p>;
  if ((returnSeries || pnlSeries) && selectedPoint && !points.some(point => point.date === selectedPoint.date)) return <p className="rjt-chart-empty">{label(en, '所选节点不在当前连续数据区间。', 'The selected milestone is outside the current continuous series.')}</p>;
  const width = 360, height = detail ? 192 : 105;
  const left = 6, right = detail && event.kind === 'drawdown' ? 43 : 6, top = detail ? 18 : 9, bottom = detail ? 22 : 9;
  const values = points.map(plottedValue);
  const peakValue = event.kind === 'drawdown' ? plottedValue(event.peak) : null;
  const allValues = finite(peakValue) ? [...values, peakValue] : values;
  const low = Math.min(...allValues), high = Math.max(...allValues);
  const extent = Math.max(high - low, Math.abs(high) * .015, returnSeries ? 1 : currencyInfo.rate);
  const minimum = low - extent * .08, maximum = high + extent * .12;
  const firstTime = Date.parse(points[0].date), lastTime = Date.parse(points.at(-1).date);
  const position = point => ({
    x: left + (Date.parse(point.date) - firstTime) / Math.max(lastTime - firstTime, 1) * (width - left - right),
    y: top + (maximum - plottedValue(point)) / (maximum - minimum) * (height - top - bottom),
  });
  const plotted = points.map(position);
  const path = plotted.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const current = selectedPoint && points.find(point => point.date === selectedPoint.date) || points.at(-1);
  const selected = position(current);
  const minimumIndex = values.indexOf(Math.min(...values)), trough = plotted[minimumIndex];
  const yFor = value => top + (maximum - value) / (maximum - minimum) * (height - top - bottom);
  const peakY = finite(peakValue) ? yFor(peakValue) : null;
  const thresholdY = finite(peakValue) && (returnSeries || peakValue > 0) ? yFor(returnSeries ? peakValue - 10 : peakValue * .9) : null;
  const showThreshold = finite(thresholdY) && thresholdY >= top && thresholdY <= height - bottom;
  return <div className={`rjt-chart ${detail ? 'rjt-chart-detail' : ''}`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={returnSeries || pnlSeries ? `${en ? `Historical ${seriesLabel(event, en).toLowerCase()}` : `${seriesLabel(event, en)}历史走势`} · ${returnSeries ? '%' : currencyInfo.currency}` : `${label(en, '账户净资产历史走势', 'Historical net assets')} · ${currencyInfo.currency}`}>
      {finite(peakY) && <><line x1={left} x2={width - right} y1={peakY} y2={peakY} className="rjt-chart-reference" />{detail && <text x={width - right + 7} y={peakY + 4}>{returnSeries ? label(en, '高点', 'Peak') : label(en, '前高', 'Peak')}</text>}</>}
      {showThreshold && <><line x1={left} x2={width - right} y1={thresholdY} y2={thresholdY} className="rjt-chart-threshold" />{detail && <text x={width - right + 7} y={thresholdY + 4}>−10%</text>}</>}
      <path className="rjt-chart-area" d={`${path} L${plotted.at(-1).x},${height - bottom} L${left},${height - bottom} Z`} />
      <path className="rjt-chart-line" d={path} />
      {event.kind === 'drawdown' && <circle cx={trough.x} cy={trough.y} r={detail ? 3.7 : 2.8} fill={marketHexColor(-1, marketColorMode)} className="rjt-chart-dot" />}
      {detail && <line x1={selected.x} x2={selected.x} y1={top} y2={height - bottom} className="rjt-chart-cursor" />}
      <circle cx={selected.x} cy={selected.y} r={detail ? 5 : 3.2} className="rjt-chart-selected" />
    </svg>
    {detail && <div className="rjt-chart-dates"><time dateTime={points[0].date}>{shortDate(points[0].date)}</time><time dateTime={points.at(-1).date}>{shortDate(points.at(-1).date)}</time></div>}
  </div>;
}

function TimelineEvent({ event, onSelectEvent, commentCount = 0, marketColorMode, language, displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), Icon = iconFor(event), currency = { displayCurrency, usdCny, fxDate };
  const archived = event.status === 'archived';
  const summary = eventSummary(event, en);
  const numericStyle = directional(event) ? eventStyle(displayValue(event), marketColorMode) : undefined;
  const stops = !archived && event.kind === 'drawdown' ? [['peak', isReturnDrawdown(event) ? label(en, '年内高点', 'Year high') : label(en, '前高', 'Peak')], ['trough', label(en, '最低', 'Low')], ['current', event.status === 'recovered' ? label(en, '恢复', 'Recovered') : label(en, '最新', 'Latest')]].filter(([key]) => event[key]) : [];
  return <article className="rjt-event">
    <div className="rjt-event-rail"><span className="rjt-event-icon"><Icon size={19} /></span></div>
    <div className="rjt-event-content">
      <div className="rjt-event-meta"><time dateTime={event.date}>{shortDate(event.date)}</time>{statusLabel(event, en) && <span className="rjt-status">{statusLabel(event, en)}</span>}</div>
      <button type="button" className="rjt-event-open" aria-label={`${label(en, '查看', 'View ')}${eventTitle(event, en)}`} onClick={click => onSelectEvent?.(event.id, click)}>
        <span className="rjt-event-heading"><strong>{eventTitle(event, en)}</strong><ChevronRight size={16} /></span>
        {!archived && <span className={`rjt-event-primary${isReviewEarningsEvent(event) ? ' rjt-earnings-primary' : ''}`}><strong style={numericStyle}>{reading(event, currency)}</strong><span>{event.kind === 'drawdown' ? drawdownLabel(event, en, true) : metricLabel(event.metric, en)}</span></span>}
        {!archived && isReviewEarningsEvent(event) && <span className="rjt-earnings-return"><strong style={eventStyle(event.returnValue, marketColorMode)}>{percent(event.returnValue)}</strong><span>{reviewEarningsScope(event, en)}{en ? ' return' : '收益率'}</span></span>}
        {!archived && isStockDailyRecord(event) && finite(event.previousRecordPct) && <span className="rjt-stock-prior"><span>{label(en, '此前纪录', 'Prior record')}</span><strong style={eventStyle(event.previousRecordPct, marketColorMode)}>{percent(event.previousRecordPct)}</strong>{event.previousRecordDate && <time dateTime={event.previousRecordDate}>{shortDate(event.previousRecordDate)}</time>}</span>}
        {summary && <span className="rjt-event-description">{summary}</span>}
        {!archived && event.kind === 'drawdown' && <TimelineChart event={event} marketColorMode={marketColorMode} language={language} {...currency} />}
        {stops.length > 0 && <span className="rjt-three-values">{stops.map(([key, title]) => <span key={key}><span>{shortDate(event[key]?.date)} {title}</span><strong style={isReturnDrawdown(event) ? eventStyle(event[key]?.cumulativeReturnPct, marketColorMode) : undefined}>{pointReading(event, event[key], currency)}</strong></span>)}</span>}
      </button>
      {onSelectEvent && <div className="rjt-event-footer"><button type="button" onClick={click => onSelectEvent(event.id, click)} aria-label={`${label(en, '查看', 'View ')}${event.title}${label(en, '的评论', ' comments')}`}><MessageCircle size={18} /><span>{commentCount || label(en, '评论', 'Comment')}</span></button></div>}
    </div>
  </article>;
}

function ArchivedDetail({ event, language, renderEvaluations, onEvaluate }) {
  const en = isEnglish(language);
  return <div className="rjt-detail" data-rjt-event={event.id}>
    <section className="rjt-detail-intro"><div className="rjt-detail-eyebrow"><History size={17} /><span>{statusLabel(event, en)}</span></div><h2>{eventTitle(event, en)}</h2><p className="rjt-detail-date"><time dateTime={event.date}>{event.date}</time></p><p className="rjt-detail-description">{eventSummary(event, en)}</p></section>
    {renderEvaluations ? renderEvaluations(event) : onEvaluate && <section className="rjt-section rjt-evaluations"><button type="button" className="rjt-evaluate" onClick={() => onEvaluate(event)}>{label(en, '写评价', 'Evaluate')}</button></section>}
  </div>;
}

function metricReadings(point, mode, en, currency) {
  if (!point) return [];
  const leverage = finite(point.totalAssetsUsd) && finite(point.netAssetsUsd) && point.netAssetsUsd > 0 ? point.totalAssetsUsd / point.netAssetsUsd : null;
  return [
    { key: 'cumulative', title: label(en, '累计收益率', 'Cumulative return'), value: point.cumulativeReturnPct, text: percent(point.cumulativeReturnPct), directional: true },
    { key: 'daily', title: label(en, '当日收益率', 'Daily return'), value: point.dailyReturnPct, text: percent(point.dailyReturnPct), directional: true },
    { key: 'leverage', title: label(en, '账户杠杆', 'Leverage'), value: leverage, text: finite(leverage) ? `${leverage.toFixed(2)}×` : '—' },
    { key: 'net', title: label(en, '净资产', 'Net assets'), value: point.netAssetsUsd, text: money(point.netAssetsUsd, currency) },
    { key: 'debt', title: label(en, '融资负债', 'Margin debt'), value: point.marginDebtUsd, text: money(point.marginDebtUsd, currency) },
    { key: 'cash', title: label(en, '现金', 'Cash'), value: point.cashUsd, text: money(point.cashUsd, currency) },
  ].filter(item => finite(item.value)).map(item => ({ ...item, style: item.directional ? eventStyle(item.value, mode) : undefined }));
}

function TimelineDetail({ event, marketColorMode, entries, stockTrades, onOpenEntry, onEvaluate, renderEvaluations, language, displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), Icon = iconFor(event), currency = { displayCurrency, usdCny, fxDate };
  const currencyInfo = reviewDisplayCurrency(currency);
  const stockRecord = isStockDailyRecord(event);
  const currencyNotice = currencyInfo.available || stockRecord ? '' : reviewCurrencyNotice(currency, language);
  const summary = eventSummary(event, en);
  const [selection, setSelection] = React.useState(null);
  const nodes = Array.isArray(event.nodes) ? event.nodes.filter(node => node.point) : [];
  const selected = selection?.id === event.id && nodes.find(node => node.key === selection.key) || nodes.at(-1);
  const point = selected?.point || event.current || event.points?.at(-1);
  // A combined annual/cumulative record may retain an older cumulative-only
  // milestone. Show that node and its chart in its original scope explicitly.
  const nodeEvent = isReviewEarningsEvent(event) && !finite(pointValue(event, point))
    && selected?.sourceNodes?.some(node => node.scopeKey === 'cumulative')
    ? { ...event, metric: 'cumulative_pnl', returnField: 'cumulativeReturnPct', scopeKeys: ['cumulative'] }
    : event.scopeKeys?.length > 1 && (point?.annualPnlUsd !== point?.cumulativePnlUsd || point?.annualReturnPct !== point?.cumulativeReturnPct)
      ? { ...event, scopeKeys: ['annual'] } : event;
  const cycle = event.kind === 'drawdown', returnCycle = isReturnDrawdown(event);
  const returnSeries = isReturnSeries(event), pnlSeries = isPnlSeries(event);
  const currentReading = pointReading(event, event.current, currency);
  const readings = stockRecord ? [] : metricReadings(point, marketColorMode, en, currency);
  const selectedDrawdown = returnCycle
    ? finite(point?.cumulativeReturnPct) && finite(event.peak?.cumulativeReturnPct) ? Math.min(0, point.cumulativeReturnPct - event.peak.cumulativeReturnPct) : null
    : cycle && finite(point?.netAssetsUsd) && finite(event.peak?.netAssetsUsd) && event.peak.netAssetsUsd > 0
      ? (point.netAssetsUsd / event.peak.netAssetsUsd - 1) * 100 : null;
  const startDate = event.startDate || event.peak?.date || event.date, endDate = event.endDate || event.current?.date || event.date;
  const relatedEntries = entries.filter(entry => entry.date >= startDate && entry.date <= endDate && !entry.timelineEvent).slice(0, 5);
  const relatedTrades = stockTrades.filter(trade => trade.date >= startDate && trade.date <= endDate
    && (!stockRecord || String(trade.symbol || '').trim().toUpperCase() === stockSymbol(event) && getStockTradeRecordKind(trade.note) !== 'historical_holding')
    && ['buy', 'sell'].includes(trade.side) && finite(Number(trade.price)) && Number(trade.price) > 0
    && finite(Number(trade.shares)) && Number(trade.shares) > 0).sort((a, b) => b.date.localeCompare(a.date));
  const [allTrades, setAllTrades] = React.useState(false);
  const visibleTrades = allTrades ? relatedTrades : relatedTrades.slice(0, 5);
  const savedMarket = [point?.market, ...entries.flatMap(entry => [entry.market, ...(entry.replies || []).map(reply => reply.market)])]
    .map(value => normalizeReviewMarketSnapshot(value)).find(value => value?.asOfDate === point?.date);
  return <div className="rjt-detail" data-rjt-event={event.id}>
    <section className="rjt-detail-intro">
      <div className="rjt-detail-eyebrow"><Icon size={17} />{statusLabel(event, en) && <span>{statusLabel(event, en)}</span>}</div>
      <h2>{eventTitle(event, en)}</h2><p className="rjt-detail-date"><time dateTime={startDate}>{startDate}</time>{endDate !== startDate && <> — <time dateTime={endDate}>{endDate}</time></>}</p>
      <div className={`rjt-detail-metric${isReviewEarningsEvent(event) ? ' rjt-earnings-primary' : ''}`}><strong style={directional(event) ? eventStyle(displayValue(event), marketColorMode) : undefined}>{reading(event, currency)}</strong><span>{cycle ? drawdownLabel(event, en, true) : metricLabel(event.metric, en)}</span></div>
      {isReviewEarningsEvent(event) && <div className="rjt-earnings-return"><strong style={eventStyle(event.returnValue, marketColorMode)}>{percent(event.returnValue)}</strong><span>{reviewEarningsScope(event, en)}{en ? ' return' : '收益率'}</span></div>}
      {cycle ? <div className="rjt-detail-stats"><div><span>{drawdownLabel(event, en)}</span><strong style={eventStyle(event.drawdownPct, marketColorMode)}>{declineReading(event, event.drawdownPct)}</strong></div><div><span>{event.status === 'recovered' ? label(en, '恢复用时', 'Time to recover') : label(en, '距前高', 'Since peak')}</span><strong>{finite(event.durationDays) ? event.durationDays : '—'} <small>{label(en, '天', 'days')}</small></strong></div><div className="rjt-detail-net" style={{ '--rjt-number-units': Math.max(1, currentReading.length * .6) }}><span>{returnCycle ? label(en, '当前收益率', 'Current return') : label(en, '当前净资产', 'Latest net assets')}</span><strong style={returnCycle ? eventStyle(event.current?.cumulativeReturnPct, marketColorMode) : undefined}>{currentReading}</strong></div></div>
        : summary && <p className="rjt-detail-description">{summary}</p>}
      {cycle && event.status === 'interrupted' && <p className="rjt-interrupted"><Info size={15} />{interruptionText(event, en)}</p>}
    </section>
    {currencyNotice && <p className="rjt-currency-note">{currencyNotice}</p>}
    {stockRecord && <section className="rjt-section rjt-stock-record"><div className="rjt-section-heading"><h3>{label(en, '纪录节点', 'Record milestones')}</h3>{point?.date && <time dateTime={point.date}>{point.date}</time>}</div>
      {nodes.length > 1 && <div className="rjt-node-tabs rjt-stock-node-tabs" aria-label={label(en, '关键节点', 'Milestones')}>{nodes.map(node => <button type="button" key={node.key} aria-pressed={node.key === selected?.key} onClick={() => setSelection({ id: event.id, key: node.key })}><strong style={eventStyle(node.point.stockDailyReturnPct, marketColorMode)}>{percent(node.point.stockDailyReturnPct)}</strong><time dateTime={node.point.date}>{shortDate(node.point.date)}</time></button>)}</div>}
      {point && <div className="rjt-stock-record-readings"><div className="rjt-node-value"><strong style={eventStyle(point.stockDailyReturnPct, marketColorMode)}>{percent(point.stockDailyReturnPct)}</strong><span>{label(en, '当日跌幅', 'One-day decline')}</span></div><div className="rjt-metric-grid rjt-stock-metrics"><div><span>{label(en, '复权收盘价 · USD', 'Split-adjusted close · USD')}</span><strong>{money(point.stockCloseUsd, { displayCurrency: 'USD' })}</strong></div><div><span>{label(en, '前日复权收盘价 · USD', 'Previous adjusted close · USD')}</span><strong>{money(point.previousCloseUsd, { displayCurrency: 'USD' })}</strong></div></div>
        {finite(point.previousRecordPct) && <div className="rjt-stock-prior"><span>{label(en, '此前纪录', 'Prior record')}</span><strong style={eventStyle(point.previousRecordPct, marketColorMode)}>{percent(point.previousRecordPct)}</strong>{point.previousRecordDate && <time dateTime={point.previousRecordDate}>{point.previousRecordDate}</time>}</div>}
      </div>}
    </section>}
    {!stockRecord && (nodes.length > 0 || event.points?.length > 1) && <section className="rjt-chart-section"><div className="rjt-chart-heading"><span>{`${seriesLabel(nodeEvent, en)}${en ? '' : '走势'} · ${returnSeries ? '%' : currencyInfo.currency}`}</span>{selected && <span>{nodeLabel(selected, en, event)} / {shortDate(point.date)}</span>}</div><TimelineChart event={nodeEvent} selectedPoint={point} detail marketColorMode={marketColorMode} language={language} {...currency} />
      {nodes.length > 0 && <div className="rjt-node-tabs" aria-label={label(en, '关键节点', 'Milestones')}>{nodes.map(node => <button type="button" key={node.key} aria-pressed={node.key === selected?.key} onClick={() => setSelection({ id: event.id, key: node.key })}>{nodeLabel(node, en, event)}<time dateTime={node.point.date}>{shortDate(node.point.date)}</time></button>)}</div>}
      {point && <div className="rjt-node-detail"><div><span>{selected ? nodeLabel(selected, en, event) : label(en, '账户', 'Account')} · {returnSeries || pnlSeries ? seriesLabel(nodeEvent, en) : label(en, '收盘净资产', 'Closing net assets')}</span><time dateTime={point.date}>{point.date}</time></div><div className="rjt-node-value"><strong style={returnSeries || pnlSeries ? eventStyle(pointValue(nodeEvent, point), marketColorMode) : undefined}>{pointReading(nodeEvent, point, currency)}</strong><span style={eventStyle(selectedDrawdown, marketColorMode)}>{cycle ? declineReading(event, selectedDrawdown) : null}</span></div>{isReviewEarningsEvent(event) && <div className="rjt-earnings-return"><strong style={eventStyle(point[nodeEvent.returnField], marketColorMode)}>{percent(point[nodeEvent.returnField])}</strong><span>{reviewEarningsScope(nodeEvent, en)}{en ? ' return' : '收益率'}</span></div>}</div>}
    </section>}
    {readings.length > 0 && <section className="rjt-section"><div className="rjt-section-heading"><h3>{label(en, '当时的账户', 'Account at this point')}</h3><time dateTime={point.date}>{point.date}</time></div><div className="rjt-metric-grid">{readings.map(item => <div key={item.key} className={`rjt-metric-${item.key}`} style={{ '--rjt-number-units': Math.max(1, item.text.length * .6) }}><span>{item.title}</span><strong style={item.style}>{item.text}</strong></div>)}</div></section>}
    {savedMarket && <section className="rjt-section rjt-market-section"><SnapshotCard value={savedMarket} language={language} /></section>}
    {relatedTrades.length > 0 && <section className="rjt-section"><h3>{label(en, '期间的交易', 'Trades in this period')}</h3>{visibleTrades.map((trade, index) => <div className="rjt-trade" key={`${trade.id || index}:${trade.date}`}><div><strong>{trade.symbol}</strong><span className="rjt-trade-side">{trade.side === 'buy' ? label(en, '买入', 'Buy') : label(en, '卖出', 'Sell')}</span><small>{trade.date} · {Number(trade.shares).toLocaleString('en-US')} {label(en, '股', 'shares')}</small></div><span>${Number(trade.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span></div>)}{relatedTrades.length > 5 && <button type="button" className="rjt-text-button" onClick={() => setAllTrades(value => !value)}>{allTrades ? label(en, '收起', 'Show less') : label(en, `查看全部 ${relatedTrades.length} 笔交易`, `View all ${relatedTrades.length} trades`)}</button>}</section>}
    {relatedEntries.length > 0 && <section className="rjt-section"><h3>{label(en, '当时写下的想法', 'What you wrote then')}</h3>{relatedEntries.map(entry => <button type="button" className="rjt-related-entry" key={`${entry.type}:${entry.id}`} onClick={click => onOpenEntry?.(entry, click)} disabled={!onOpenEntry}><time dateTime={entry.date}>{entry.date}</time><p>{entry.text}</p><ChevronRight size={17} /></button>)}</section>}
    {renderEvaluations ? renderEvaluations(event) : onEvaluate && <section className="rjt-section rjt-evaluations"><div className="rjt-section-heading"><h3>{label(en, '评价', 'Evaluations')}</h3><button type="button" className="rjt-evaluate" onClick={() => onEvaluate(event)}>{label(en, '写评价', 'Evaluate')}</button></div><p className="rjt-muted">{label(en, '数据留下当时，也留一点今天的想法。', 'Keep today’s reflection alongside the recorded facts.')}</p></section>}
  </div>;
}

export default function ReviewTimeline({ data, loading = false, error, onRetry, selectedEventId, onSelectEvent, onBack,
  marketColorMode, stockTrades = [], entries = [], onOpenEntry, onEvaluate, renderEvaluations, getCommentCount, language = 'zh', displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), currency = { displayCurrency, usdCny, fxDate };
  const currencyNotice = reviewDisplayCurrency(currency).available ? '' : reviewCurrencyNotice(currency, language);
  const [year, setYear] = React.useState('all');
  const [filter, setFilter] = React.useState('all');
  const events = Array.isArray(data?.events) ? data.events : [];
  const selected = events.find(event => event.id === selectedEventId);
  const years = [...new Set((Array.isArray(data?.years) ? data.years : events.map(event => event.date?.slice(0, 4))).map(String))].filter(value => /^\d{4}$/.test(value)).sort().reverse();
  if (loading) return <div className="rjt-state" role="status"><Loader2 className="rj-spin" size={24} /><h2>{label(en, '正在整理投资时间线', 'Preparing your timeline')}</h2><p>{label(en, '读取已完成的收益报表记录。', 'Reading completed P&L report records.')}</p></div>;
  if (error) return <div className="rjt-state" role="alert"><Info size={26} /><h2>{label(en, '时间线暂时无法读取', 'Timeline is unavailable')}</h2><p>{typeof error === 'string' ? error : label(en, '请稍后重试。', 'Please try again.')}</p>{onRetry && <button type="button" onClick={onRetry}><RefreshCw size={16} />{label(en, '重新读取', 'Retry')}</button>}</div>;
  if (selected?.status === 'archived') return <ArchivedDetail event={selected} {...{ language, renderEvaluations, onEvaluate }} />;
  if (selected) return <TimelineDetail key={selected.id} event={selected} {...{ marketColorMode, stockTrades, entries, onOpenEntry, onEvaluate, renderEvaluations, language, ...currency }} />;
  const stockStatus = data?.stockRecordStatus;
  const stockPending = stockStatus === 'loading';
  const stockProblem = ['incomplete', 'error'].includes(stockStatus);
  if (selectedEventId?.startsWith('record:stock_daily_return:') && (stockPending || stockProblem)) return <div className="rjt-state" role={stockPending ? 'status' : 'alert'}><History size={26} /><h2>{stockPending ? label(en, '正在核对个股纪录', 'Checking stock records') : label(en, '个股纪录暂未核对完整', 'Stock records are incomplete')}</h2>{stockProblem && onRetry && <button type="button" onClick={onRetry}>{label(en, '重新读取', 'Retry')}</button>}</div>;
  if (selectedEventId) return <div className="rjt-state"><History size={26} /><h2>{label(en, '这条记录已重新核对', 'This event has been rechecked')}</h2><p>{label(en, '收益报表更新后，事件可能发生变化。', 'An updated P&L report may change the event.')}</p><button type="button" onClick={onBack}>{label(en, '返回时间线', 'Back to timeline')}</button></div>;
  const shown = events.filter(event => (year === 'all' || event.date?.startsWith(year))
    && (filter === 'all' || (filter === 'stock' ? isStockDailyRecord(event) : filter === 'period' ? ['record', 'period'].includes(event.kind) && !isStockDailyRecord(event) : event.kind === filter)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
  let currentMonth = '';
  return <section className="rjt-timeline" aria-label={label(en, '投资时间线', 'Investment timeline')}>
    <div className="rjt-heading"><h2>{label(en, '账户的关键时刻', 'Your account milestones')}</h2><label className="rjt-year"><span className="rj-visually-hidden">{label(en, '时间线年份', 'Timeline year')}</span><select value={year} onChange={event => setYear(event.target.value)} aria-label={label(en, '时间线年份', 'Timeline year')}><option value="all">{label(en, '全部年份', 'All years')}</option>{years.map(value => <option value={value} key={value}>{value}</option>)}</select><ChevronDown size={15} /></label></div>
    <div className="rjt-filters" aria-label={label(en, '时间线事件类型', 'Timeline event type')}>{[['all', '全部事件', 'All events'], ['high', '新高', 'New highs'], ['low', '新低', 'New lows'], ['drawdown', '回撤与恢复', 'Drawdowns'], ['period', '周期纪录', 'Period records'], ['stock', '个股跌幅', 'Stock declines']].map(([id, zh, english]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label(en, zh, english)}</button>)}</div>
    {currencyNotice && filter !== 'stock' && (!events.length || events.some(event => !isStockDailyRecord(event))) && <p className="rjt-currency-note">{currencyNotice}</p>}
    {(filter === 'all' || filter === 'stock') && (stockPending || stockProblem) && <div className="rjt-stock-state" role={stockPending ? 'status' : 'alert'}><span>{stockPending ? label(en, '正在核对个股纪录…', 'Checking stock records…') : label(en, data?.stockRecordWarning || '部分个股纪录暂未核对完整。', 'Some stock records could not be verified.')}</span>{stockProblem && onRetry && <button type="button" className="rjt-text-button" onClick={onRetry}>{label(en, '重试', 'Retry')}</button>}</div>}
    {data?.status === 'pending' ? <div className="rjt-state"><History size={26} /><h2>{label(en, '收益报表正在更新', 'P&L report is updating')}</h2><p>{label(en, '完成收盘核对后，时间线会同步更新。', 'The timeline will update after closing data is reconciled.')}</p>{onRetry && <button type="button" onClick={onRetry}>{label(en, '重新读取', 'Retry')}</button>}</div>
      : shown.length ? shown.map(event => {
        const month = event.date?.slice(0, 7) || '';
        const showMonth = month !== currentMonth; currentMonth = month;
        return <React.Fragment key={event.id}>{showMonth && <div className="rjt-month"><span>{en ? month : `${Number(month.slice(5))} 月`}</span>{!en && <span>{month.slice(0, 4)}</span>}</div>}<TimelineEvent event={event} commentCount={getCommentCount?.(event) ?? 0} {...{ onSelectEvent, marketColorMode, language, ...currency }} /></React.Fragment>;
      }) : (filter === 'all' || filter === 'stock') && (stockPending || stockProblem) ? null : <div className="rjt-state"><History size={26} /><h2>{label(en, '暂时没有符合条件的记录', 'No matching events yet')}</h2><p>{events.length ? label(en, '试试其他年份或事件类型。', 'Try a different year or event type.') : label(en, '有可核对的收盘历史后，新高和回撤会自动呈现。', 'Highs and drawdowns appear as verifiable closing history becomes available.')}</p></div>}
    {events.length > 0 && <p className="rjt-history-end">{label(en, '基于已有收盘历史', 'Based on available closing history')}{data?.coverage?.startDate ? ` · ${data.coverage.startDate} — ${data.coverage.endDate}` : ''}</p>}
  </section>;
}
