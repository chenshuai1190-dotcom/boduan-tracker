import React from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import FearGreedChart from '../components/FearGreedChart.jsx';
import { loadFearGreed } from '../lib/fearGreed.js';
import './FearGreedPage.css';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const RATINGS = ['extreme fear', 'fear', 'neutral', 'greed', 'extreme greed'];
const RATING_ZH = ['极度恐慌', '恐慌', '中性', '贪婪', '极度贪婪'];
// Sentiment categories have their own colors, independent of profit/loss settings.
const SENTIMENT_COLORS = ['#e56b64', '#e6a15b', '#a6abb2', '#81be92', '#37af8b'];
const ratingIndex = rating => RATINGS.indexOf(String(rating || '').toLowerCase().replace(/_/g, ' ').trim());
const sentimentColor = rating => SENTIMENT_COLORS[ratingIndex(rating)] || '#898992';
const ratingLabel = (rating, english) => {
  const index = ratingIndex(rating);
  return index < 0 ? '—' : english ? RATINGS[index].replace(/\b\w/g, letter => letter.toUpperCase()) : RATING_ZH[index];
};
const scoreLabel = (score, english, rounded = false) => finite(score)
  ? score.toLocaleString(english ? 'en-US' : 'zh-CN', { maximumFractionDigits: rounded ? 0 : 1 }) : '—';

const INDICATORS = [
  { id: 'momentum', name: ['市场动量', 'Market momentum'], measure: ['标普 500 · 125 日均线', 'S&P 500 · 125-day average'], labels: { market_momentum_sp500: ['标普 500', 'S&P 500'], market_momentum_sp125: ['125 日均线', '125-day average'] } },
  { id: 'strength', name: ['股价强度', 'Stock price strength'], measure: ['纽约证交所 52 周新高与新低净值', 'NYSE net new 52-week highs and lows'], suffix: '%' },
  { id: 'breadth', name: ['市场广度', 'Stock price breadth'], measure: ['McClellan 成交量累加指数', 'McClellan Volume Summation Index'] },
  { id: 'options', name: ['期权情绪', 'Put and call options'], measure: ['5 日平均看跌 / 看涨比率', '5-day average put/call ratio'] },
  { id: 'volatility', name: ['市场波动', 'Market volatility'], measure: ['VIX · 50 日均线', 'VIX · 50-day average'], labels: { market_volatility_vix: ['VIX', 'VIX'], market_volatility_vix_50: ['50 日均线', '50-day average'] } },
  { id: 'safeHaven', name: ['避险需求', 'Safe haven demand'], measure: ['股票与债券 20 日收益差', '20-day stock and bond return difference'], suffix: '%' },
  { id: 'junkBonds', name: ['高收益债需求', 'Junk bond demand'], measure: ['高收益债与投资级债利差', 'Junk and investment-grade bond yield spread'], suffix: '%' },
];

function RangeControl({ value, onChange, english }) {
  return <div className="fg-range" aria-label={english ? 'Chart range' : '图表区间'}>{[
    ['1m', english ? '1M' : '1月'], ['3m', english ? '3M' : '3月'], ['1y', english ? '1Y' : '1年'],
  ].map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}</div>;
}

function Gauge({ current, english }) {
  const value = finite(current?.score) && current.score >= 0 && current.score <= 100 ? current.score : null;
  const active = ratingIndex(current?.rating);
  const point = (score, radius) => {
    const angle = Math.PI * (1 - score / 100);
    return [180 + radius * Math.cos(angle), 183 - radius * Math.sin(angle)];
  };
  // Arc lengths reproduce the five visual bands; displayed sentiment comes only from CNN's rating.
  const stops = [0, 25, 45, 55, 75, 100];
  const arc = (start, end) => {
    const a = point(start, 150), b = point(end, 150), c = point(end, 129), d = point(start, 129);
    return `M${a.join(',')} A150,150 0 0 1 ${b.join(',')} L${c.join(',')} A129,129 0 0 0 ${d.join(',')} Z`;
  };
  const needleStart = value === null ? null : point(value, 120);
  const needleEnd = value === null ? null : point(value, 157);
  return <div className="fg-gauge" style={{ '--fg-current-color': sentimentColor(current?.rating) }}>
    <svg viewBox="0 0 360 218" role="img" aria-label={`${english ? 'Fear and Greed Index' : '恐慌与贪婪指数'} ${scoreLabel(value, english, true)} ${ratingLabel(current?.rating, english)}`}>
      {RATINGS.map((rating, index) => <path key={rating} className="fg-gauge-band" data-active={active === index && value !== null} data-band={index}
        style={{ fill: SENTIMENT_COLORS[index] }} d={arc(stops[index] + .6, stops[index + 1] - .6)} />)}
      {value !== null && <line className="fg-gauge-needle" x1={needleStart[0]} y1={needleStart[1]} x2={needleEnd[0]} y2={needleEnd[1]} />}
      <text className="fg-gauge-score" x="180" y="151" textAnchor="middle">{scoreLabel(value, english, true)}</text>
      <text className="fg-gauge-rating" x="180" y="182" textAnchor="middle">{ratingLabel(current?.rating, english)}</text>
      <text className="fg-gauge-limit" x="29" y="210" textAnchor="middle">0</text>
      <text className="fg-gauge-limit" x="331" y="210" textAnchor="middle">100</text>
    </svg>
    <div className="fg-gauge-labels">{RATINGS.map((rating, index) => <span key={rating} data-active={active === index}>
      {english ? ['Extreme fear', 'Fear', 'Neutral', 'Greed', 'Extreme greed'][index] : RATING_ZH[index]}
    </span>)}</div>
  </div>;
}

function Indicator({ definition, data, english }) {
  const [expanded, setExpanded] = React.useState(false);
  const [range, setRange] = React.useState('1y');
  const labelIndex = english ? 1 : 0;
  const labels = Object.fromEntries(Object.entries(definition.labels || {}).map(([id, names]) => [id, names[labelIndex]]));
  return <section className="fg-indicator">
    <button type="button" className="fg-indicator-toggle" aria-expanded={expanded} aria-controls={`fg-indicator-${definition.id}`} onClick={() => setExpanded(value => !value)}>
      <span className="fg-indicator-name">{definition.name[labelIndex]}</span>
      <span className="fg-indicator-summary"><span style={{ color: sentimentColor(data?.rating) }}>{ratingLabel(data?.rating, english)}</span>{finite(data?.score) && <span className="fg-indicator-score">{scoreLabel(data.score, english)}</span>}</span>
      <ChevronDown size={16} className="fg-indicator-chevron" aria-hidden="true" />
    </button>
    {expanded && <div id={`fg-indicator-${definition.id}`} className="fg-indicator-detail">
      <div className="fg-indicator-chart-head"><span>{definition.measure[labelIndex]}</span><RangeControl value={range} onChange={setRange} english={english} /></div>
      {Object.keys(labels).length > 1 && <div className="fg-chart-legend">{Object.entries(labels).map(([id, text], index) => <span key={id} data-secondary={index > 0}><i />{text}</span>)}</div>}
      <FearGreedChart key={range} series={data?.series || []} range={range} english={english} labels={labels} suffix={definition.suffix || ''} />
    </div>}
  </section>;
}

export default function FearGreedPage({ ctx = {}, previewData = null }) {
  const { language = 'zh', userId = '', closeFearGreed } = ctx;
  const english = String(language).toLowerCase().startsWith('en');
  const preview = import.meta.env.DEV ? previewData : null;
  const [state, setState] = React.useState({ userId: '', data: null, busy: true, error: false });
  const [retry, setRetry] = React.useState(0);
  const [range, setRange] = React.useState('1y');
  const renderUserRef = React.useRef(userId);
  renderUserRef.current = userId;

  React.useEffect(() => {
    if (preview) return undefined;
    const controller = new AbortController();
    let active = true;
    setState(previous => ({ userId, data: previous.userId === userId ? previous.data : null, busy: true, error: false }));
    Promise.resolve().then(() => loadFearGreed({ userId, signal: controller.signal, force: retry > 0 })).then(data => {
      if (active && !controller.signal.aborted && renderUserRef.current === userId) setState({ userId, data, busy: false, error: false });
    }).catch(cause => {
      if (!active || controller.signal.aborted || renderUserRef.current !== userId || cause?.name === 'AbortError') return;
      setState(previous => ({ userId, data: cause?.code === 'AUTH_REQUIRED' ? null : previous.userId === userId ? previous.data : null, busy: false, error: true }));
    });
    return () => { active = false; controller.abort(); };
  }, [userId, preview, retry]);

  const visible = state.userId === userId ? state : { data: null, busy: true, error: false };
  const data = preview || visible.data;
  const historySeries = React.useMemo(() => [{ id: 'fearGreed', points: data?.history || [] }], [data?.history]);
  const sourceDate = Number.isFinite(Date.parse(data?.asOf)) ? new Date(data.asOf).toISOString().slice(0, 10) : '—';
  return <main className="fear-greed-page">
    <header className="fg-header">
      <button type="button" className="fg-back" aria-label={english ? 'Back' : '返回'} onClick={closeFearGreed}><ArrowLeft size={20} /></button>
      <h1>{english ? 'Fear & Greed' : '恐慌与贪婪'}</h1><span className="fg-source">CNN</span>
    </header>
    {!data ? <div className="fg-status" role="status">
      <span>{visible.error ? (english ? 'Unable to load' : '暂时无法加载') : (english ? 'Loading…' : '加载中…')}</span>
      {visible.error && <button type="button" onClick={() => setRetry(value => value + 1)} disabled={visible.busy}>{english ? 'Retry' : '重试'}</button>}
    </div> : <>
      {visible.error && !preview && <div className="fg-retry" role="status"><span>{english ? 'Unable to update' : '更新失败'}</span><button type="button" disabled={visible.busy} onClick={() => setRetry(value => value + 1)}>{english ? 'Retry' : '重试'}</button></div>}
      <Gauge current={data.current} english={english} />
      <div className="fg-snapshot-meta">
        <time dateTime={data.asOf}>{sourceDate}</time>
        {preview && <span>{english ? 'Local snapshot' : '本地快照'}</span>}
        {data.stale && <><span>{english ? 'Update pending' : '待更新'}</span>{!preview && <button type="button" disabled={visible.busy} onClick={() => setRetry(value => value + 1)}>{english ? 'Retry' : '重试'}</button>}</>}
      </div>
      <div className="fg-comparisons">{[
        ['previousClose', '上次收盘', 'Previous close'], ['weekAgo', '一周前', '1 week ago'], ['monthAgo', '一月前', '1 month ago'], ['yearAgo', '一年前', '1 year ago'],
      ].map(([id, zh, en]) => <div key={id}><span>{english ? en : zh}</span><strong>{scoreLabel(data.comparisons?.[id], english, true)}</strong></div>)}</div>
      <section className="fg-history">
        <div className="fg-section-heading"><h2>{english ? 'Sentiment history' : '情绪变化'}</h2><RangeControl value={range} onChange={setRange} english={english} /></div>
        <FearGreedChart key={range} series={historySeries} range={range} scoreChart english={english} />
      </section>
      <section className="fg-indicators" aria-label={english ? 'Seven sentiment indicators' : '七项情绪指标'}>
        <h2>{english ? 'Seven indicators' : '七项情绪指标'}</h2>
        {INDICATORS.map(definition => <Indicator key={definition.id} definition={definition} data={data.indicators?.find(item => item.id === definition.id)} english={english} />)}
      </section>
    </>}
  </main>;
}
