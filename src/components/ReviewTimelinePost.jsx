import React from 'react';
import { History, MessageCircle } from 'lucide-react';
import { marketHexColor } from '../lib/marketColorMode.js';
import { reviewTimelineFeedDate } from '../lib/reviewTimelineFeed.js';
import { formatReviewMoney, reviewDisplayCurrency } from '../lib/reviewDisplayCurrency.js';
import { TimelineChart } from './ReviewTimeline.jsx';
import './ReviewTimelinePost.css';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const percent = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
const label = (en, zh, english) => en ? english : zh;
const shortDate = (value, en) => en ? value : `${value.slice(5, 7)}月${value.slice(8, 10)}日`;
const style = (value, mode) => finite(value) && value !== 0 ? { color: marketHexColor(value, mode) } : undefined;

export function reviewTimelinePostSummary(event, en = false) {
  if (event.status === 'archived') return label(en, '来源数据已更新，保留此前写下的评价。', 'Source data changed; your previous reflection is preserved.');
  if (event.kind === 'drawdown') {
    if (event.status === 'recovered') return label(en, '账户已回到前高，这一轮回撤记录完成。', 'The account is back at its previous peak; this drawdown cycle is complete.');
    if (event.status === 'interrupted') return label(en, '本轮净资产比较已中断，保留此前的回撤记录。', 'Comparison was interrupted; the recorded drawdown is preserved.');
    return label(en, '账户较前高回落达到 10%，本轮回撤仍在持续。', 'The account fell at least 10% from its peak; this drawdown is still being tracked.');
  }
  if (event.kind === 'high') return label(en, `${event.title}，记录这个新的高点。`, `${event.title}. A new high in the recorded closing history.`);
  if (event.kind === 'record') return label(en, `${event.title}，留下这一天的账户变化。`, `${event.title}. Keeping a record of this trading day.`);
  return label(en, `${event.title}，记录这一段的收益表现。`, `${event.title}. The performance of this completed period.`);
}

function readings(event, currency, en) {
  if (event.kind === 'drawdown') return {
    title: label(en, '当前回撤', 'Current drawdown'), value: percent(event.drawdownPct), direction: event.drawdownPct,
    secondaryTitle: label(en, '本轮最大回撤', 'Maximum drawdown'), secondary: percent(event.maxDrawdownPct), secondaryDirection: event.maxDrawdownPct,
  };
  if (event.kind === 'high') {
    const previous = event.nodes?.find(node => node.key === 'start')?.point || event.points?.[0];
    const titles = { net_assets: label(en, '收盘净资产', 'Closing net assets'), cumulative_return: label(en, '累计收益率', 'Cumulative return'), cumulative_pnl: label(en, '累计盈利金额', 'Cumulative P&L') };
    const before = previous?.[{ net_assets: 'netAssetsUsd', cumulative_return: 'cumulativeReturnPct', cumulative_pnl: 'cumulativePnlUsd' }[event.metric]];
    const delta = finite(before) && finite(event.value) ? event.value - before : null;
    const gain = finite(before) && before > 0 && finite(event.value) ? (event.value / before - 1) * 100 : null;
    return { title: titles[event.metric], value: event.valueType === 'money' ? formatReviewMoney(event.value, currency) : percent(event.value),
      direction: event.metric === 'net_assets' ? null : event.value,
      secondaryTitle: label(en, '较此前高点', 'Above prior high'),
      secondary: event.metric === 'net_assets' ? finite(gain) ? percent(gain) : ''
        : finite(delta) ? event.metric === 'cumulative_pnl' ? formatReviewMoney(delta, { ...currency, signed: true }) : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${label(en, '个百分点', 'pp')}` : '',
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
  const metric = readings(event, currency, en);
  const showChart = !archived && ['high', 'drawdown', 'period'].includes(event.kind)
    && (event.points || []).filter(point => finite(point.chartValue ?? point.netAssetsUsd)).length > 1;
  const open = click => onOpen?.(event.id, click);
  const clickPost = click => {
    if (click.defaultPrevented || !click.currentTarget.contains(click.target)
      || click.target.closest('button,a,input,textarea,select,[data-rj-interactive]') || window.getSelection?.()?.toString()) return;
    open(click);
  };
  const status = event.status === 'recovered' ? label(en, '已恢复', 'Recovered')
    : event.status === 'interrupted' ? label(en, '比较已中断', 'Interrupted')
      : event.kind === 'drawdown' ? label(en, '持续跟踪', 'Tracking') : '';
  const peakCaption = event.kind === 'drawdown' && event.peak?.date
    ? `${label(en, '较', 'From ')} ${shortDate(event.peak.date, en)} ${label(en, '前高', 'peak')}` : '';
  return <article className="rj-post rj-post-link rj-timeline-post" data-rj-entry-key={`timeline:${event.id}`}
    role="link" tabIndex={0} aria-label={`${label(en, '查看', 'View ')}${event.title}`} onClick={clickPost}
    onKeyDown={click => { if (click.target === click.currentTarget && (click.key === 'Enter' || click.key === ' ')) { click.preventDefault(); open(click); } }}>
    {avatarNode}<div className="rj-post-main">
      <div className="rj-post-heading rj-timeline-byline">{authorNode}<span>·</span><time dateTime={feedDate}>{shortDate(feedDate, en)}</time><span className="rj-auto-label"><History size={11} />{label(en, '自动记录', 'Automatic')}</span></div>
      <p className="rj-post-text rj-timeline-copy">{reviewTimelinePostSummary(event, en)}</p>
      {!archived && <div className="rj-system-summary"><div className="rj-system-label"><span>{metric.title}</span>{status && <span className="rj-system-status">{status}</span>}</div>
        <div className="rj-system-values"><strong className="rj-system-primary" style={style(metric.direction, marketColorMode)}>{metric.value}</strong>
          {metric.secondary && <div className="rj-system-secondary"><span>{metric.secondaryTitle}</span><strong style={style(metric.secondaryDirection, marketColorMode)}>{metric.secondary}</strong></div>}
        </div>
        {showChart && <TimelineChart event={event} marketColorMode={marketColorMode} language={language} {...currency} />}
        {(peakCaption || info.converted) && <div className="rj-system-caption">{peakCaption && <span>{peakCaption}</span>}{info.converted && <span>{info.available ? label(en, '人民币折算', 'CNY conversion') : label(en, '汇率暂不可用', 'FX unavailable')}</span>}</div>}
      </div>}
      <div className="rj-post-actions"><button type="button" onClick={open} aria-label={`${label(en, '查看', 'View ')}${event.title}${label(en, '的评论', ' comments')}`}><MessageCircle size={18}/><span>{commentCount || label(en, '评论', 'Comment')}</span></button></div>
    </div>
  </article>;
}
