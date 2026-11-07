import React from 'react';
import { History, MessageCircle } from 'lucide-react';
import { marketHexColor } from '../lib/marketColorMode.js';
import { reviewTimelineFeedDate } from '../lib/reviewTimelineFeed.js';
import { isReviewEarningsEvent, reviewEarningsScope, reviewEarningsRecordLabel } from '../lib/reviewTimelineEarnings.js';
import { formatReviewMoney, reviewDisplayCurrency } from '../lib/reviewDisplayCurrency.js';
import { TimelineChart } from './ReviewTimeline.jsx';
import './ReviewTimelinePost.css';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const percent = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
const decline = value => finite(value) ? `${Math.abs(value).toFixed(2)}%` : '—';
const isReturnDrawdown = event => event.kind === 'drawdown' && event.metric === 'cumulative_return';
const label = (en, zh, english) => en ? english : zh;
const shortDate = (value, en) => en ? value : `${value.slice(5, 7)}月${value.slice(8, 10)}日`;
const style = (value, mode) => finite(value) && value !== 0 ? { color: marketHexColor(value, mode) } : undefined;

export function reviewTimelinePostSummary(event, en = false) {
  if (event.status === 'archived') return label(en, '来源数据已更新，保留此前写下的评价。', 'Source data changed; your previous reflection is preserved.');
  if (isReviewEarningsEvent(event)) return `${event.title} · ${reviewEarningsRecordLabel(event, en)}`;
  if (event.kind === 'drawdown') {
    if (isReturnDrawdown(event)) {
      if (event.status === 'recovered') return label(en, '收益率已回到年内高点，这一轮回落记录完成。', 'The return is back at its yearly high; this decline cycle is complete.');
      if (event.status === 'interrupted') {
        if (event.interruptionReason === 'year_boundary') return label(en, '本年度收益率回落跟踪已结束，保留本轮回落记录。', 'Tracking of this year’s return decline has ended; the recorded decline is preserved.');
        return ['missing_return', 'missing_session'].includes(event.interruptionReason)
          ? label(en, '本轮收益率比较因数据缺失已中断，保留此前的回落记录。', 'Return comparison was interrupted by missing data; the recorded decline is preserved.')
          : label(en, '本轮收益率比较已中断，保留此前的回落记录。', 'Return comparison was interrupted; the recorded decline is preserved.');
      }
      if (!finite(event.drawdownPct)) return label(en, '本轮收益率回落仍在持续追踪，当前回落数据暂不可用。', 'This return decline is still being tracked; the current decline is unavailable.');
      const peak = event.peak?.cumulativeReturnPct, current = event.current?.cumulativeReturnPct;
      return finite(peak) && finite(current)
        ? label(en, `收益率从年内高点${percent(peak)}回落至${percent(current)}，较高点回落${decline(event.drawdownPct)}，本轮仍在持续追踪。`, `The return fell from its yearly high of ${percent(peak)} to ${percent(current)}, a decline of ${decline(event.drawdownPct)}; this cycle is still being tracked.`)
        : label(en, `收益率较年内高点回落${decline(event.drawdownPct)}，本轮仍在持续追踪。`, `The return declined ${decline(event.drawdownPct)} from its yearly high; this cycle is still being tracked.`);
    }
    if (event.status === 'recovered') return label(en, '账户已回到前高，这一轮回撤记录完成。', 'The account is back at its previous peak; this drawdown cycle is complete.');
    if (event.status === 'interrupted') return label(en, '本轮净资产比较已中断，保留此前的回撤记录。', 'Comparison was interrupted; the recorded drawdown is preserved.');
    if (!finite(event.drawdownPct)) return label(en, '本轮回撤仍在持续追踪，当前回撤数据暂不可用。', 'This drawdown is still being tracked; the current drawdown is unavailable.');
    const currentDrawdown = Math.abs(event.drawdownPct).toFixed(2);
    return label(en, `账户较前高回落达到${currentDrawdown}%，本轮回撤仍在持续追踪。`, `The account is ${currentDrawdown}% below its peak; this drawdown is still being tracked.`);
  }
  if (event.kind === 'high') return label(en, `${event.title}，记录这个新的高点。`, `${event.title}. A new high in the recorded closing history.`);
  if (event.kind === 'low') return label(en, `${event.title}，记录这个新的低点。`, `${event.title}. A new low in the recorded closing history.`);
  if (event.kind === 'record') return label(en, `${event.title}，留下这一天的账户变化。`, `${event.title}. Keeping a record of this trading day.`);
  return label(en, `${event.title}，记录这一段的收益表现。`, `${event.title}. The performance of this completed period.`);
}

function readings(event, currency, en) {
  if (isReturnDrawdown(event)) return {
    title: label(en, '较年内高点回落', 'Decline from yearly high'), value: decline(event.drawdownPct), direction: event.drawdownPct,
    secondaryTitle: label(en, '本轮最大回落', 'Maximum decline'), secondary: decline(event.maxDrawdownPct), secondaryDirection: event.maxDrawdownPct,
  };
  if (event.kind === 'drawdown') return {
    title: label(en, '当前回撤', 'Current drawdown'), value: percent(event.drawdownPct), direction: event.drawdownPct,
    secondaryTitle: label(en, '本轮最大回撤', 'Maximum drawdown'), secondary: percent(event.maxDrawdownPct), secondaryDirection: event.maxDrawdownPct,
  };
  if (['high', 'low'].includes(event.kind)) {
    if (isReviewEarningsEvent(event)) {
      // Compare the metric that actually broke its record on this date. The
      // large money reading and companion rate always belong to the same close.
      const amountRecord = event.recordMetrics.includes('amount');
      const field = amountRecord ? event.metric === 'annual_pnl' ? 'annualPnlUsd' : 'cumulativePnlUsd' : event.returnField;
      const source = event.sourceEvents?.find(item => item.date === event.date
        && item.metric === (amountRecord ? event.metric : event.metric === 'annual_pnl' ? 'annual_return' : 'cumulative_return'));
      const before = source?.nodes?.find(node => node.key === 'start')?.point?.[field];
      const now = event.current?.[field];
      const delta = finite(before) && finite(now) ? now - before : null;
      return { title: `${reviewEarningsScope(event, en)}${en ? ' P&L' : '收益金额'}`,
        value: formatReviewMoney(event.value, currency), direction: event.value,
        secondaryTitle: `${amountRecord ? '' : label(en, '收益率', 'Return ')}${event.kind === 'low' ? label(en, '较此前低点', 'below prior low') : label(en, '较此前高点', 'above prior high')}`,
        secondary: finite(delta) ? amountRecord ? formatReviewMoney(delta, { ...currency, signed: true }) : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${label(en, '个百分点', 'pp')}` : '', secondaryDirection: delta };
    }
    const previous = event.nodes?.find(node => node.key === 'start')?.point || event.points?.[0];
    const titles = { net_assets: label(en, '收盘净资产', 'Closing net assets'), cumulative_return: label(en, '累计收益率', 'Cumulative return'), cumulative_pnl: label(en, '累计盈利金额', 'Cumulative P&L'), annual_return: label(en, '年内收益率', 'Annual return'), annual_pnl: label(en, '年内收益金额', 'Annual P&L') };
    const before = previous?.[{ net_assets: 'netAssetsUsd', cumulative_return: 'cumulativeReturnPct', cumulative_pnl: 'cumulativePnlUsd', annual_return: 'annualReturnPct', annual_pnl: 'annualPnlUsd' }[event.metric]];
    const delta = finite(before) && finite(event.value) ? event.value - before : null;
    const gain = finite(before) && before > 0 && finite(event.value) ? (event.value / before - 1) * 100 : null;
    return { title: titles[event.metric], value: event.valueType === 'money' ? formatReviewMoney(event.value, currency) : percent(event.value),
      direction: event.metric === 'net_assets' ? null : event.value,
      secondaryTitle: event.kind === 'low' ? label(en, '较此前低点', 'Below prior low') : label(en, '较此前高点', 'Above prior high'),
      secondary: event.metric === 'net_assets' ? finite(gain) ? percent(gain) : ''
        : finite(delta) ? ['cumulative_pnl', 'annual_pnl'].includes(event.metric) ? formatReviewMoney(delta, { ...currency, signed: true }) : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${label(en, '个百分点', 'pp')}` : '',
      secondaryDirection: event.metric === 'net_assets' ? gain : delta,
    };
  }
  const pnl = event.kind === 'record' ? event.current?.dailyPnlUsd : event.periodPnlUsd;
  return { title: event.kind === 'record' ? label(en, '单日收益率', 'Daily return') : label(en, '区间收益率', 'Period return'),
    value: percent(event.value), direction: event.value,
    secondaryTitle: event.kind === 'record' ? label(en, '当日盈亏', 'Daily P&L') : label(en, '期间盈亏', 'Period P&L'),
    secondary: finite(pnl) ? formatReviewMoney(pnl, { ...currency, signed: true }) : '', secondaryDirection: pnl,
  };
}

export default function ReviewTimelinePost({ event, avatarNode, authorNode, commentCount = 0, onOpen,
  displayCurrency = 'USD', usdCny = null, fxDate = '', marketColorMode, language = 'zh' }) {
  const en = String(language).toLowerCase().startsWith('en');
  const currency = { displayCurrency, usdCny, fxDate }, info = reviewDisplayCurrency(currency);
  const feedDate = reviewTimelineFeedDate(event), archived = event.status === 'archived';
  const returnDrawdown = isReturnDrawdown(event);
  const extrema = ['high', 'low'].includes(event.kind);
  const earnings = isReviewEarningsEvent(event);
  const percentChart = returnDrawdown || extrema && ['cumulative_return', 'annual_return'].includes(event.metric);
  const field = (extrema || returnDrawdown) && ({ cumulative_return: 'cumulativeReturnPct', cumulative_pnl: 'cumulativePnlUsd', annual_return: 'annualReturnPct', annual_pnl: 'annualPnlUsd' })[event.metric];
  const metric = readings(event, currency, en);
  const showChart = !archived && ['high', 'low', 'drawdown', 'period'].includes(event.kind)
    && (event.points || []).filter(point => finite(field ? point[field] : point.chartValue ?? point.netAssetsUsd)).length > 1;
  const open = click => onOpen?.(event.id, click);
  const clickPost = click => {
    if (click.defaultPrevented || !click.currentTarget.contains(click.target)
      || click.target.closest('button,a,input,textarea,select,[data-rj-interactive]') || window.getSelection?.()?.toString()) return;
    open(click);
  };
  const status = event.status === 'recovered' ? label(en, '已恢复', 'Recovered')
    : event.status === 'interrupted' ? returnDrawdown && event.interruptionReason === 'year_boundary'
      ? label(en, '本年度跟踪结束', 'Year tracking ended') : label(en, '比较已中断', 'Interrupted')
      : event.kind === 'drawdown' ? label(en, '持续跟踪', 'Tracking') : '';
  const peakCaption = !returnDrawdown && event.kind === 'drawdown' && event.peak?.date
    ? `${label(en, '较', 'From ')} ${shortDate(event.peak.date, en)} ${label(en, '前高', 'peak')}` : '';
  const showCurrencyState = info.converted && !percentChart;
  return <article className="rj-post rj-post-link rj-timeline-post" data-rj-entry-key={`timeline:${event.id}`}
    role="link" tabIndex={0} aria-label={`${label(en, '查看', 'View ')}${event.title}`} onClick={clickPost}
    onKeyDown={click => { if (click.target === click.currentTarget && (click.key === 'Enter' || click.key === ' ')) { click.preventDefault(); open(click); } }}>
    {avatarNode}<div className="rj-post-main">
      <div className="rj-post-heading rj-timeline-byline">{authorNode}<span>·</span><time dateTime={feedDate}>{shortDate(feedDate, en)}</time><span className="rj-auto-label"><History size={11} />{label(en, '自动记录', 'Automatic')}</span></div>
      <p className="rj-post-text rj-timeline-copy">{reviewTimelinePostSummary(event, en)}</p>
      {!archived && <div className={`rj-system-summary${earnings ? ' rj-system-earnings' : ''}`}><div className="rj-system-label"><span>{metric.title}</span>{status && <span className="rj-system-status">{status}</span>}</div>
        <div className="rj-system-values"><strong className="rj-system-primary" style={style(metric.direction, marketColorMode)}>{metric.value}</strong>
          {earnings && <div className="rj-system-return"><strong style={style(event.returnValue, marketColorMode)}>{percent(event.returnValue)}</strong><span>{reviewEarningsScope(event, en)}{en ? ' return' : '收益率'}</span></div>}
          {metric.secondary && <div className="rj-system-secondary"><span>{metric.secondaryTitle}</span><strong style={style(metric.secondaryDirection, marketColorMode)}>{metric.secondary}</strong></div>}
        </div>
        {showChart && <TimelineChart event={event} marketColorMode={marketColorMode} language={language} {...currency} />}
        {(peakCaption || showCurrencyState) && <div className="rj-system-caption">{peakCaption && <span>{peakCaption}</span>}{showCurrencyState && <span>{info.available ? label(en, '人民币折算', 'CNY conversion') : label(en, '汇率暂不可用', 'FX unavailable')}</span>}</div>}
      </div>}
      <div className="rj-post-actions"><button type="button" onClick={open} aria-label={`${label(en, '查看', 'View ')}${event.title}${label(en, '的评论', ' comments')}`}><MessageCircle size={18}/><span>{commentCount || label(en, '评论', 'Comment')}</span></button></div>
    </div>
  </article>;
}
