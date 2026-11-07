import React from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, Flag, History, Info, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { marketHexColor } from '../lib/marketColorMode.js';
import { normalizeReviewMarketSnapshot } from '../lib/reviewMarketSnapshot.js';
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
  daily_return: label(en, '报表单日收益率', 'Report daily return'),
  period_return: label(en, '报表区间收益率', 'Report period return'),
}[metric] || label(en, '收盘记录', 'Closing record'));
const statusLabel = (status, en) => ({
  active: label(en, '恢复中', 'Recovering'),
  recovered: label(en, '已恢复', 'Recovered'),
  interrupted: label(en, '数据待核对', 'Needs review'),
  archived: label(en, '保留的评价', 'Saved reflection'),
}[status] || '');
const nodeLabel = (node, en) => en ? ({ peak: 'Peak', trigger: 'First 10%', trough: 'Low', current: 'Latest', recovery: 'Recovered' }[node.key] || node.label) : node.label;
const iconFor = event => event.kind === 'drawdown' ? (event.status === 'recovered' ? History : ArrowDownRight)
  : event.kind === 'high' ? ArrowUpRight : event.kind === 'period' ? CalendarDays : event.value < 0 ? ArrowDownRight : Flag;
const displayValue = event => event.kind === 'drawdown' ? event.maxDrawdownPct : event.value;
const reading = (event, currency) => event.valueType === 'money' ? money(displayValue(event), currency) : percent(displayValue(event));
const directional = event => event.kind === 'drawdown' || event.valueType === 'percent' || event.metric === 'cumulative_pnl';

function interruptionText(event, en) {
  const reasons = {
    external_cash_flow: label(en, '发生转入或转出', 'a deposit or withdrawal'),
    cash_adjustment: label(en, '现金余额调整或冲正', 'a cash adjustment or reversal'),
    cash_source_changed: label(en, '现金数据来源变化', 'a change in the cash data source'),
    missing_session: label(en, '收盘记录缺失', 'missing closing records'),
    missing_net_assets: label(en, '净资产数据缺失', 'missing net-asset data'),
  };
  const reason = reasons[event.interruptionReason] || label(en, '资金或数据变化', 'a cash or data change');
  const date = event.interruptedAt ? `${event.interruptedAt} · ` : '';
  return `${date}${en ? `Comparison stopped due to ${reason}; recovery is unconfirmed.` : `因${reason}停止比较，未判定为恢复。`}`;
}

function eventSummary(event, en) {
  if (event.status === 'archived') return event.description || label(en, '来源数据已更新，保留此前写下的评价。', 'Source data changed; your previous reflection is preserved.');
  if (event.kind === 'drawdown') {
    if (event.status === 'interrupted') return interruptionText(event, en);
    const days = finite(event.durationDays) ? ` · ${event.durationDays} ${label(en, '天', 'days')}` : '';
    return event.status === 'recovered'
      ? `${label(en, '已回到前高', 'Back at the peak')}${days}`
      : `${label(en, '当前回撤', 'Current drawdown')} ${percent(event.drawdownPct)}${days}`;
  }
  if (event.kind === 'high') return label(en, '在可核对的历史收盘记录中创新高。', 'A new high within the verifiable closing history.');
  if (event.kind === 'record') return event.comparisonScope || label(en, '截至当日已记录交易日的纪录。', 'A record among available trading days as known on this date.');
  return label(en, '已完成周期，沿用收益报表口径。', 'Completed period using the P&L report basis.');
}

/** Both views consume model-owned dates and amounts; missing values never become zeroes. */
export function TimelineChart({ event, selectedPoint, detail = false, marketColorMode, language = 'zh', displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), currency = { displayCurrency, usdCny, fxDate };
  const currencyInfo = reviewDisplayCurrency(currency);
  if (!currencyInfo.available) return <p className="rjt-chart-empty">{label(en, '人民币汇率暂不可用，净资产曲线待更新。', 'The net-asset chart will be available when the CNY exchange rate is available.')}</p>;
  const plottedValue = point => convertReviewMoney(point?.chartValue ?? point?.netAssetsUsd, currency);
  const source = Array.isArray(event.points) ? event.points : [];
  const points = source.filter(point => finite(plottedValue(point)) && Number.isFinite(Date.parse(point.date)));
  if (points.length < 2) return <p className="rjt-chart-empty">{label(en, '这一时刻暂无可展示的连续净资产曲线。', 'A continuous net-asset series is not available for this event.')}</p>;
  const width = 360, height = detail ? 192 : 105;
  const left = 6, right = detail ? 43 : 6, top = detail ? 18 : 9, bottom = detail ? 22 : 9;
  const values = points.map(plottedValue);
  const peakValue = plottedValue(event.peak);
  const allValues = finite(peakValue) ? [...values, peakValue] : values;
  const low = Math.min(...allValues), high = Math.max(...allValues);
  const extent = Math.max(high - low, Math.abs(high) * .015, currencyInfo.rate);
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
  const thresholdY = finite(peakValue) && peakValue > 0 ? yFor(peakValue * .9) : null;
  const showThreshold = finite(thresholdY) && thresholdY >= top && thresholdY <= height - bottom;
  return <div className={`rjt-chart ${detail ? 'rjt-chart-detail' : ''}`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label(en, '账户净资产历史走势', 'Historical net assets')} · ${currencyInfo.currency}`}>
      {finite(peakY) && <><line x1={left} x2={width - right} y1={peakY} y2={peakY} className="rjt-chart-reference" />{detail && <text x={width - right + 7} y={peakY + 4}>{label(en, '前高', 'Peak')}</text>}</>}
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

function TimelineEvent({ event, onSelectEvent, onEvaluate, marketColorMode, language, displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), Icon = iconFor(event), currency = { displayCurrency, usdCny, fxDate };
  const archived = event.status === 'archived';
  const numericStyle = directional(event) ? eventStyle(displayValue(event), marketColorMode) : undefined;
  const stops = !archived && event.kind === 'drawdown' ? [['peak', label(en, '前高', 'Peak')], ['trough', label(en, '最低', 'Low')], ['current', event.status === 'recovered' ? label(en, '恢复', 'Recovered') : label(en, '最新', 'Latest')]].filter(([key]) => event[key]) : [];
  return <article className="rjt-event">
    <div className="rjt-event-rail"><span className="rjt-event-icon"><Icon size={19} /></span></div>
    <div className="rjt-event-content">
      <div className="rjt-event-meta"><time dateTime={event.date}>{shortDate(event.date)}</time><span>· {label(en, '系统记录', 'System record')}</span>{statusLabel(event.status, en) && <span className="rjt-status">{statusLabel(event.status, en)}</span>}</div>
      <button type="button" className="rjt-event-open" aria-label={`${label(en, '查看', 'View ')}${event.title}`} onClick={click => onSelectEvent?.(event.id, click)}>
        <span className="rjt-event-heading"><strong>{event.title}</strong><ChevronRight size={16} /></span>
        {!archived && <span className="rjt-event-primary"><strong style={numericStyle}>{reading(event, currency)}</strong><span>{event.kind === 'drawdown' ? label(en, '本轮最大回撤', 'Maximum drawdown') : metricLabel(event.metric, en)}</span></span>}
        <span className="rjt-event-description">{eventSummary(event, en)}</span>
        {!archived && event.kind === 'drawdown' && <TimelineChart event={event} marketColorMode={marketColorMode} language={language} {...currency} />}
        {stops.length > 0 && <span className="rjt-three-values">{stops.map(([key, title]) => <span key={key}><span>{shortDate(event[key]?.date)} {title}</span><strong>{money(event[key]?.netAssetsUsd, currency)}</strong></span>)}</span>}
      </button>
      <div className="rjt-event-footer">{onEvaluate ? <button type="button" onClick={() => onEvaluate(event)}><MessageCircle size={17} /><span>{label(en, '写评价', 'Evaluate')}</span></button> : <span />}
        <span>{archived ? '' : event.comparisonScope || (event.kind === 'drawdown' ? label(en, '同一周期持续跟踪', 'One continuous cycle') : label(en, '正式收盘', 'Confirmed close'))}</span>
      </div>
    </div>
  </article>;
}

function ArchivedDetail({ event, language, renderEvaluations, onEvaluate }) {
  const en = isEnglish(language);
  return <div className="rjt-detail" data-rjt-event={event.id}>
    <section className="rjt-detail-intro"><div className="rjt-detail-eyebrow"><History size={17} /><span>{statusLabel(event.status, en)}</span></div><h2>{event.title}</h2><p className="rjt-detail-date"><time dateTime={event.date}>{event.date}</time></p><p className="rjt-detail-description">{eventSummary(event, en)}</p></section>
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

function nodeDescription(event, node, en) {
  if (event.kind !== 'drawdown') return label(en, '查看该节点对应的正式收盘账户记录。', 'The account record from this confirmed close.');
  if (node?.key === 'trigger') return label(en, '首次达到 10%，开始跟踪本轮回撤。', 'First reached 10%; tracking begins for this cycle.');
  if (node?.key === 'recovery') return label(en, '收盘已回到原高点，本轮恢复完成。', 'The close reached the original peak; recovery is complete.');
  if (node?.key === 'trough') return label(en, '这是本轮已记录的最低收盘点。', 'The lowest recorded close in this cycle.');
  if (node?.key === 'peak') return label(en, '这个收盘高点是本轮比较的基准。', 'This closing peak is the baseline for this cycle.');
  if (event.status === 'interrupted') return label(en, '这是中断前最后一条可比较的收盘记录。', 'The last comparable closing record before the interruption.');
  return label(en, '持续跟踪，直到收盘净资产恢复前高。', 'Tracking continues until closing net assets return to the peak.');
}

function TimelineDetail({ event, marketColorMode, entries, stockTrades, onOpenEntry, onEvaluate, renderEvaluations, language, displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), Icon = iconFor(event), currency = { displayCurrency, usdCny, fxDate };
  const currencyInfo = reviewDisplayCurrency(currency), currencyNotice = reviewCurrencyNotice(currency, language);
  const [selection, setSelection] = React.useState(null);
  const nodes = Array.isArray(event.nodes) ? event.nodes.filter(node => node.point) : [];
  const selected = selection?.id === event.id && nodes.find(node => node.key === selection.key) || nodes.at(-1);
  const point = selected?.point || event.current || event.points?.at(-1);
  const cycle = event.kind === 'drawdown';
  const readings = metricReadings(point, marketColorMode, en, currency);
  const selectedDrawdown = cycle && finite(point?.netAssetsUsd) && finite(event.peak?.netAssetsUsd) && event.peak.netAssetsUsd > 0
    ? (point.netAssetsUsd / event.peak.netAssetsUsd - 1) * 100 : null;
  const startDate = event.startDate || event.peak?.date || event.date, endDate = event.endDate || event.current?.date || event.date;
  const relatedEntries = entries.filter(entry => entry.date >= startDate && entry.date <= endDate && !entry.timelineEvent).slice(0, 5);
  const relatedTrades = stockTrades.filter(trade => trade.date >= startDate && trade.date <= endDate
    && ['buy', 'sell'].includes(trade.side) && finite(Number(trade.price)) && Number(trade.price) > 0
    && finite(Number(trade.shares)) && Number(trade.shares) > 0).sort((a, b) => b.date.localeCompare(a.date));
  const [allTrades, setAllTrades] = React.useState(false);
  const visibleTrades = allTrades ? relatedTrades : relatedTrades.slice(0, 5);
  const savedMarket = [point?.market, ...entries.flatMap(entry => [entry.market, ...(entry.replies || []).map(reply => reply.market)])]
    .map(value => normalizeReviewMarketSnapshot(value)).find(value => value?.asOfDate === point?.date);
  return <div className="rjt-detail" data-rjt-event={event.id}>
    <section className="rjt-detail-intro">
      <div className="rjt-detail-eyebrow"><Icon size={17} /><span>{label(en, '系统记录', 'System record')}{statusLabel(event.status, en) ? ` · ${statusLabel(event.status, en)}` : ''}</span></div>
      <h2>{event.title}</h2><p className="rjt-detail-date"><time dateTime={startDate}>{startDate}</time>{endDate !== startDate && <> — <time dateTime={endDate}>{endDate}</time></>}</p>
      <div className="rjt-detail-metric"><strong style={directional(event) ? eventStyle(displayValue(event), marketColorMode) : undefined}>{reading(event, currency)}</strong><span>{cycle ? label(en, '本轮最大回撤', 'Maximum drawdown') : metricLabel(event.metric, en)}</span></div>
      {cycle ? <div className="rjt-detail-stats"><div><span>{label(en, '当前回撤', 'Current drawdown')}</span><strong style={eventStyle(event.drawdownPct, marketColorMode)}>{percent(event.drawdownPct)}</strong></div><div><span>{event.status === 'recovered' ? label(en, '恢复用时', 'Time to recover') : label(en, '距前高', 'Since peak')}</span><strong>{finite(event.durationDays) ? event.durationDays : '—'} <small>{label(en, '天', 'days')}</small></strong></div><div><span>{label(en, '当前净资产', 'Latest net assets')}</span><strong>{money(event.current?.netAssetsUsd, currency)}</strong></div></div>
        : <p className="rjt-detail-description">{eventSummary(event, en)}</p>}
      {cycle && event.status === 'interrupted' && <p className="rjt-interrupted"><Info size={15} />{interruptionText(event, en)}</p>}
    </section>
    {currencyNotice && <p className="rjt-currency-note">{currencyNotice}</p>}
    {(nodes.length > 0 || event.points?.length > 1) && <section className="rjt-chart-section"><div className="rjt-chart-heading"><span>{`${label(en, '净资产走势', 'Net assets')} · ${currencyInfo.currency}`}</span>{selected && <span>{nodeLabel(selected, en)} / {shortDate(point.date)}</span>}</div><TimelineChart event={event} selectedPoint={point} detail marketColorMode={marketColorMode} language={language} {...currency} />
      {nodes.length > 0 && <div className="rjt-node-tabs" aria-label={label(en, '关键节点', 'Milestones')}>{nodes.map(node => <button type="button" key={node.key} aria-pressed={node.key === selected?.key} onClick={() => setSelection({ id: event.id, key: node.key })}>{nodeLabel(node, en)}<time dateTime={node.point.date}>{shortDate(node.point.date)}</time></button>)}</div>}
      {point && <div className="rjt-node-detail"><div><span>{selected ? nodeLabel(selected, en) : label(en, '账户', 'Account')} · {label(en, '收盘净资产', 'Closing net assets')}</span><time dateTime={point.date}>{point.date}</time></div><div className="rjt-node-value"><strong>{money(point.netAssetsUsd, currency)}</strong><span style={eventStyle(selectedDrawdown, marketColorMode)}>{cycle ? percent(selectedDrawdown) : null}</span></div><p>{nodeDescription(event, selected, en)}</p></div>}
    </section>}
    {readings.length > 0 && <section className="rjt-section"><div className="rjt-section-heading"><h3>{label(en, '当时的账户', 'Account at this point')}</h3><time dateTime={point.date}>{point.date}</time></div><div className="rjt-metric-grid">{readings.map(item => <div key={item.key} className={`rjt-metric-${item.key}`} style={{ '--rjt-number-units': Math.max(1, item.text.length * .6) }}><span>{item.title}</span><strong style={item.style}>{item.text}</strong></div>)}</div></section>}
    {savedMarket && <section className="rjt-section rjt-market-section"><SnapshotCard value={savedMarket} language={language} /></section>}
    {relatedTrades.length > 0 && <section className="rjt-section"><h3>{label(en, '期间的交易', 'Trades in this period')}</h3>{visibleTrades.map((trade, index) => <div className="rjt-trade" key={`${trade.id || index}:${trade.date}`}><div><strong>{trade.symbol}</strong><span className="rjt-trade-side">{trade.side === 'buy' ? label(en, '买入', 'Buy') : label(en, '卖出', 'Sell')}</span><small>{trade.date} · {Number(trade.shares).toLocaleString('en-US')} {label(en, '股', 'shares')}</small></div><span>${Number(trade.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span></div>)}{relatedTrades.length > 5 && <button type="button" className="rjt-text-button" onClick={() => setAllTrades(value => !value)}>{allTrades ? label(en, '收起', 'Show less') : label(en, `查看全部 ${relatedTrades.length} 笔交易`, `View all ${relatedTrades.length} trades`)}</button>}</section>}
    {relatedEntries.length > 0 && <section className="rjt-section"><h3>{label(en, '当时写下的想法', 'What you wrote then')}</h3>{relatedEntries.map(entry => <button type="button" className="rjt-related-entry" key={`${entry.type}:${entry.id}`} onClick={click => onOpenEntry?.(entry, click)} disabled={!onOpenEntry}><time dateTime={entry.date}>{entry.date}</time><p>{entry.text}</p><ChevronRight size={17} /></button>)}</section>}
    <p className="rjt-detail-footnote">{label(en, '来源于正式收盘快照 · 天数按自然日计算', 'From confirmed closing snapshots · Calendar-day durations')}</p>
    {renderEvaluations ? renderEvaluations(event) : onEvaluate && <section className="rjt-section rjt-evaluations"><div className="rjt-section-heading"><h3>{label(en, '评价', 'Evaluations')}</h3><button type="button" className="rjt-evaluate" onClick={() => onEvaluate(event)}>{label(en, '写评价', 'Evaluate')}</button></div><p className="rjt-muted">{label(en, '数据留下当时，也留一点今天的想法。', 'Keep today’s reflection alongside the recorded facts.')}</p></section>}
  </div>;
}

export default function ReviewTimeline({ data, loading = false, error, onRetry, selectedEventId, onSelectEvent, onBack,
  marketColorMode, stockTrades = [], entries = [], onOpenEntry, onEvaluate, renderEvaluations, language = 'zh', displayCurrency = 'USD', usdCny = null, fxDate = '' }) {
  const en = isEnglish(language), currency = { displayCurrency, usdCny, fxDate };
  const currencyNotice = reviewCurrencyNotice(currency, language);
  const [year, setYear] = React.useState('all');
  const [filter, setFilter] = React.useState('all');
  const events = Array.isArray(data?.events) ? data.events : [];
  const selected = events.find(event => event.id === selectedEventId);
  const years = [...new Set((Array.isArray(data?.years) ? data.years : events.map(event => event.date?.slice(0, 4))).map(String))].filter(value => /^\d{4}$/.test(value)).sort().reverse();
  const warnings = Array.isArray(data?.warnings) ? data.warnings.filter(value => typeof value === 'string' && value) : [];
  if (loading) return <div className="rjt-state" role="status"><Loader2 className="rj-spin" size={24} /><h2>{label(en, '正在整理投资时间线', 'Preparing your timeline')}</h2><p>{label(en, '读取已完成的收益报表记录。', 'Reading completed P&L report records.')}</p></div>;
  if (error) return <div className="rjt-state" role="alert"><Info size={26} /><h2>{label(en, '时间线暂时无法读取', 'Timeline is unavailable')}</h2><p>{typeof error === 'string' ? error : label(en, '请稍后重试。', 'Please try again.')}</p>{onRetry && <button type="button" onClick={onRetry}><RefreshCw size={16} />{label(en, '重新读取', 'Retry')}</button>}</div>;
  if (selected?.status === 'archived') return <ArchivedDetail event={selected} {...{ language, renderEvaluations, onEvaluate }} />;
  if (selected) return <TimelineDetail key={selected.id} event={selected} {...{ marketColorMode, stockTrades, entries, onOpenEntry, onEvaluate, renderEvaluations, language, ...currency }} />;
  if (selectedEventId) return <div className="rjt-state"><History size={26} /><h2>{label(en, '这条记录已重新核对', 'This event has been rechecked')}</h2><p>{label(en, '收益报表更新后，事件可能发生变化。', 'An updated P&L report may change the event.')}</p><button type="button" onClick={onBack}>{label(en, '返回时间线', 'Back to timeline')}</button></div>;
  const shown = events.filter(event => (year === 'all' || event.date?.startsWith(year))
    && (filter === 'all' || (filter === 'period' ? ['record', 'period'].includes(event.kind) : event.kind === filter)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
  let currentMonth = '';
  return <section className="rjt-timeline" aria-label={label(en, '投资时间线', 'Investment timeline')}>
    <div className="rjt-heading"><h2>{label(en, '账户的关键时刻', 'Your account milestones')}</h2><label className="rjt-year"><span className="rj-visually-hidden">{label(en, '时间线年份', 'Timeline year')}</span><select value={year} onChange={event => setYear(event.target.value)} aria-label={label(en, '时间线年份', 'Timeline year')}><option value="all">{label(en, '全部年份', 'All years')}</option>{years.map(value => <option value={value} key={value}>{value}</option>)}</select><ChevronDown size={15} /></label></div>
    <div className="rjt-filters" aria-label={label(en, '时间线事件类型', 'Timeline event type')}>{[['all', '全部事件', 'All events'], ['high', '新高', 'New highs'], ['drawdown', '回撤与恢复', 'Drawdowns'], ['period', '周期纪录', 'Period records']].map(([id, zh, english]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label(en, zh, english)}</button>)}</div>
    {currencyNotice && <p className="rjt-currency-note">{currencyNotice}</p>}
    {warnings.length > 0 && <details className="rjt-data-notice"><summary><Info size={14} />{label(en, '数据说明', 'Data notes')}</summary>{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
    {data?.status === 'pending' ? <div className="rjt-state"><History size={26} /><h2>{label(en, '收益报表正在更新', 'P&L report is updating')}</h2><p>{label(en, '完成收盘核对后，时间线会同步更新。', 'The timeline will update after closing data is reconciled.')}</p>{onRetry && <button type="button" onClick={onRetry}>{label(en, '重新读取', 'Retry')}</button>}</div>
      : shown.length ? shown.map(event => {
        const month = event.date?.slice(0, 7) || '';
        const showMonth = month !== currentMonth; currentMonth = month;
        return <React.Fragment key={event.id}>{showMonth && <div className="rjt-month"><span>{en ? month : `${Number(month.slice(5))} 月`}</span>{!en && <span>{month.slice(0, 4)}</span>}</div>}<TimelineEvent event={event} {...{ onSelectEvent, onEvaluate, marketColorMode, language, ...currency }} /></React.Fragment>;
      }) : <div className="rjt-state"><History size={26} /><h2>{label(en, '暂时没有符合条件的记录', 'No matching events yet')}</h2><p>{events.length ? label(en, '试试其他年份或事件类型。', 'Try a different year or event type.') : label(en, '有可核对的收盘历史后，新高和回撤会自动呈现。', 'Highs and drawdowns appear as verifiable closing history becomes available.')}</p></div>}
    {events.length > 0 && <p className="rjt-history-end">{label(en, '基于已有收盘历史', 'Based on available closing history')}{data?.coverage?.startDate ? ` · ${data.coverage.startDate} — ${data.coverage.endDate}` : ''}</p>}
  </section>;
}
