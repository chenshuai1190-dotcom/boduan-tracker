import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import MacroHistoryChart from '../components/MacroHistoryChart.jsx';
import { MACRO_MOCK_SNAPSHOT } from '../macro/macroMockData.js';
import { formatMacroValue, formatMacroChange, formatMacroEventTime, formatMacroCountdown } from '../macro/macroFormat.js';
import { MACRO_RANGE_LABELS, macroMetricLabel as metricLabel, macroMetricDescription as metricDescription, macroEventLabel as eventLabel, macroChangeColor, formatMacroDate, macroDisplayText } from '../macro/macroPresentation.js';
import './MacroPage.css';

const PAGES = ['overview', 'rates', 'inflation', 'stress', 'liquidity', 'calendar', 'growth'];
const RANGES = ['1w', '1m', '3m', '1y', '5y'];
const TITLES = { overview: 'Macro', rates: '利率环境', inflation: '通胀 & 能源', stress: '市场压力', liquidity: '流动性', calendar: 'Macro Calendar', growth: '成长股压力' };
const TAB_LABELS = { energy: '能源', expectations: '通胀预期', dollarGold: '美元 / 黄金' };
const METRIC_GROUPS = ['rates', 'energy', 'expectations', 'dollarGold', 'stress', 'liquidity'];
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const present = metric => metric && finite(metric.value);
const number = value => finite(value) ? value.toFixed(0) : '—';
const signed = value => finite(value) ? `${value > 0 ? '+' : ''}${value}` : '—';
const isLive = data => data?.simulated === false;
const observationUnit = (_metric, live) => live ? '个观测期' : '日';
const freshnessLabel = metric => !present(metric) || metric?.freshness === 'unavailable' ? '数据缺失' : metric?.freshness === 'stale' ? '数据待更新' : metric?.freshness === 'fresh' ? '已更新' : '时效未知';
const sectionLabel = (data, section) => data.sections?.[section]?.label || '待评估';
const sectionSummary = (data, section) => macroDisplayText(data.sections?.[section]?.summary) || '综合模型尚未启用，可查看各项真实观测数据。';
function MetricSource({ metric }) {
  return <span className="macro-source" data-freshness={metric?.freshness || 'unavailable'}>{metric?.asOf ? formatMacroDate(metric.asOf) : '日期未知'} · {metric?.frequency || '频率未知'} · {freshnessLabel(metric)}{metric?.error && <span className="macro-source-error">部分数据暂未更新，请稍后重试。</span>}</span>;
}
function Tone({ children, tone = 'neutral' }) { return <span className={`macro-tone macro-tone-${tone}`}>{children}</span>; }
function MetricValue({ metric }) { return <>{present(metric) ? formatMacroValue(metric.value, metric.unit) : '—'}</>; }
function MetricChange({ metric, period = 'change1d' }) {
  const change = present(metric) && finite(metric[period]) ? metric[period] : null;
  return <span className="macro-change" style={{ color: macroChangeColor(change) }}>{formatMacroChange(change, metric?.changeUnit)}</span>;
}
function DataStamp({ metric, live = false }) { return <p className="macro-data-stamp">{live ? <MetricSource metric={metric} /> : <>模拟数据 · {formatMacroDate(metric?.asOf)} · {metric?.frequency || '日频'}</>}</p>; }
function Section({ title, children, className = '' }) { return <section className={`macro-section ${className}`}><h2>{title}</h2>{children}</section>; }
function Insight({ title, children }) { return <Section title={title} className="macro-insight"><p>{children}</p></Section>; }
function EmptyMetrics() { return <p className="macro-empty-copy" role="status">本页暂无可用数据。</p>; }
function PeriodControl({ range, onChange }) { return <div className="macro-ranges" role="group" aria-label="历史周期">{RANGES.map(id => <button key={id} type="button" className="stock-report-range" aria-pressed={range === id} onClick={() => onChange(id)}>{MACRO_RANGE_LABELS[id]}</button>)}</div>; }
function MetricRows({ ids, metrics, selected, onSelect, live = false }) {
  return <div className="macro-metric-list">{ids.map(id => {
    const metric = metrics[id];
    return <button key={id} type="button" className="macro-metric-row" aria-pressed={selected === id} onClick={() => onSelect(id)}>
      <span className="macro-metric-name">{metricLabel(metric)}{metric.derived && <small>派生指标</small>}{live && <MetricSource metric={metric} />}</span>
      <span className="macro-metric-reading"><strong><MetricValue metric={metric} /></strong><small><MetricChange metric={metric} /></small></span>
    </button>;
  })}</div>;
}
function MetricHistory({ metric, range, setRange, live = false }) {
  return <div className="macro-history">
    <div className="macro-hero-label">{metricLabel(metric)}</div>
    <p className="macro-metric-definition">{metricDescription(metric)}</p>
    {live && metric.basis && <p className="macro-metric-definition macro-metric-basis">{macroDisplayText(metric.basis)}</p>}
    <div className="macro-hero-value"><MetricValue metric={metric} /></div>
    <div className="macro-hero-change"><span>{live ? '较前次数据' : metric.frequency === '周度' ? '较上期' : '今日'}</span><MetricChange metric={metric} /></div>
    <PeriodControl range={range} onChange={setRange} />
    <MacroHistoryChart metric={metric} range={range} />
    <DataStamp metric={metric} live={live} />
    {live && metric.historyNote && <p className="macro-observation-note">{macroDisplayText(metric.historyNote)}</p>}
    <div className="macro-history-context"><span>5{observationUnit(metric, live)}变化<strong><MetricChange metric={metric} period="change5d" /></strong></span><span>20{observationUnit(metric, live)}变化<strong><MetricChange metric={metric} period="change20d" /></strong></span><span>20{observationUnit(metric, live)}位置<strong>{present(metric) && finite(metric.percentile20d) ? `${number(metric.percentile20d)}%` : '—'}</strong></span></div>
    {live && <p className="macro-observation-note">变化按有效观测期计算，不代表自然日涨跌。</p>}
  </div>;
}
function EventTime({ event, local = false }) {
  const time = formatMacroEventTime(event.time, LOCAL_TIME_ZONE);
  return <span>{local ? `${formatMacroDate(time.localDate)} · ${time.localTime} 本地时间` : `${formatMacroDate(time.date)} · ${time.time} 美东时间`}</span>;
}
function EventValue({ value, unit }) {
  if (!finite(value)) return <>—</>;
  return <>{value.toLocaleString('en-US', { maximumFractionDigits: 2 })}{unit === '%' || unit === 'percent' ? '%' : unit === 'K' ? 'K' : unit && unit !== 'index' ? ` ${unit}` : ''}</>;
}
function Overview({ data, onOpen, partial, stale }) {
  const live = isLive(data);
  const scored = !live && !partial && finite(data.growth.score);
  const calendarUnavailable = live && !['available', 'partial'].includes(data.calendarStatus);
  const moduleMetrics = {
    inflation: [...data.groups.energy, ...data.groups.expectations, ...data.groups.dollarGold],
    stress: data.groups.stress,
    liquidity: data.groups.liquidity,
  };
  const rateId = live && !data.groups.rates.includes('us10y') ? data.groups.rates[0] : 'us10y';
  const rate = data.metrics[rateId];
  const cards = [
    { id: 'inflation', title: '通胀', metric: 'wti', status: '压力上升', tone: 'warning' },
    { id: 'stress', title: '市场压力', metric: 'vix', status: partial ? '部分数据待补全' : '正常', tone: 'neutral' },
    { id: 'liquidity', title: '流动性', metric: 'netLiquidity', status: partial ? '数据不足' : '中性', tone: 'neutral' },
  ].filter(card => !live || moduleMetrics[card.id].length > 0).map(card => ({
    ...card, preferredMetric: card.metric, metric: live && !moduleMetrics[card.id].includes(card.metric) ? moduleMetrics[card.id][0] : card.metric,
  }));
  const next = !calendarUnavailable && data.events.filter(event => event.importance === 'high' && Date.parse(event.time) > Date.parse(data.now) && Date.parse(event.time) <= Date.parse(data.now) + 7 * 86400000).sort((a, b) => a.time.localeCompare(b.time))[0];
  const urgent = next && Date.parse(next.time) - Date.parse(data.now) <= 86400000;
  return <>
    {!live && <div className="macro-summary-grid" aria-label="宏观环境概览">
    <section className="macro-regime macro-card" aria-label="当前环境">
      <div className="macro-eyebrow">{stale ? '上次环境' : '当前环境'}</div>
      <div className="macro-regime-title"><span>{partial ? '暂不可判定' : data.regime.label}</span></div>
      <p>{partial ? '实际利率与流动性数据缺失，暂不生成综合判断。其余已知指标仍可查看。' : data.regime.summary}</p>
    </section>
    <button type="button" className="macro-pressure macro-card" onClick={() => onOpen('growth')} aria-label="查看成长股压力解释">
      <div className="macro-card-heading"><span>成长股压力</span><ChevronRight size={14} /></div>
      <div className="macro-score-row"><strong>{scored ? data.growth.score : '—'}<small> / 100</small></strong><Tone tone={scored ? 'warning' : 'neutral'}>{live ? '待评估' : partial ? '数据不足' : data.growth.label}</Tone></div>
      <div className="macro-pressure-bar" aria-hidden="true">{scored && <i style={{ width: `${data.growth.score}%` }} />}</div>
      <div className="macro-pressure-foot"><span>{live ? '模型尚未启用' : <>较昨日 {scored && finite(data.growth.previous) ? signed(data.growth.score - data.growth.previous) : '—'}</>}</span><span>查看构成</span></div>
    </button>
    </div>}
    {live && !rate && cards.length === 0 && <EmptyMetrics />}
    {(!live || rate) && <button type="button" className="macro-rate-card macro-card macro-core-card" onClick={() => onOpen('rates')}>
      <div className="macro-card-heading"><span>利率</span><ChevronRight size={14} /></div>
      <div className="macro-core-symbol">{metricLabel(rate)}</div>
      <div className="macro-rate-card-bottom"><div className="macro-core-value"><MetricValue metric={rate} /><small><MetricChange metric={rate} /></small></div><Tone tone={live ? 'neutral' : 'warning'}>{live ? rateId === 'us10y' ? sectionLabel(data, 'rates') : rate.status || '数据已更新' : partial ? '实际利率待补全' : '压力上升'}</Tone></div>
      {live && <MetricSource metric={rate} />}
    </button>}
    {cards.length > 0 && <div className="macro-core-grid" aria-label="通胀、市场压力与流动性">{cards.map(card => <button type="button" key={card.id} className={`macro-core-card${card.id === 'liquidity' ? ' macro-liquidity-entry' : ''}`} onClick={() => onOpen(card.id)}>
      <div className="macro-card-heading"><span>{card.title}</span><ChevronRight size={14} /></div>
      <div className="macro-core-symbol">{metricLabel(data.metrics[card.metric])}</div>
      {card.id !== 'liquidity' && <div className="macro-core-value"><MetricValue metric={data.metrics[card.metric]} /><small><MetricChange metric={data.metrics[card.metric]} /></small></div>}
      <Tone tone={live ? 'neutral' : card.tone}>{live ? card.metric === card.preferredMetric ? sectionLabel(data, card.id) : data.metrics[card.metric].status || '数据已更新' : card.status}</Tone>
      {card.id === 'liquidity' && <div className="macro-derived-caption">{!live || data.metrics[card.metric]?.derived ? '派生指标 · 查看分项' : '查看可用指标'}</div>}
      {live && <MetricSource metric={data.metrics[card.metric]} />}
    </button>)}</div>}
    <section className={`macro-focus macro-section ${urgent ? 'macro-focus-soon' : ''}`}>
      <div className="macro-section-heading"><h2>重点关注</h2><button type="button" onClick={() => onOpen('calendar')}>7天日历 <ChevronRight size={13} /></button></div>
      {next ? <button type="button" className="macro-event-preview" onClick={() => onOpen('calendar')}>
        <span><strong>{next.code}</strong><span className="macro-event-name">{eventLabel(next)}</span><small><EventTime event={next} /></small></span>
        <span className="macro-event-countdown"><Tone tone={urgent ? 'warning' : 'neutral'}>{urgent ? '24小时内' : '高重要性'}</Tone><strong>{formatMacroCountdown(next.time, data.now)}</strong><small>{live ? '距离公布' : '距离公布 · 演示时钟'}</small></span>
      </button> : <p className="macro-secondary">{calendarUnavailable ? '未能读取经济日历，请稍后重试。' : live && data.calendarStatus === 'partial' ? '经济日历数据不完整，暂不能确认未来事件。' : '未来7天暂无高重要性事件。'}</p>}
      {live && next && data.calendarStatus === 'partial' && <p className="macro-secondary">经济日历数据不完整，仅显示已读取事件。</p>}
    </section>
    <Insight title="宏观解读">{partial ? '核心数据尚未补全，当前不输出综合宏观解读。' : macroDisplayText(data.interpretation)}</Insight>
  </>;
}
function Rates({ data, selected, setSelected, range, setRange }) {
  const ids = data.groups.rates;
  const metric = data.metrics[ids.includes(selected) ? selected : ids.includes('us10y') ? 'us10y' : ids[0]];
  if (!metric) return <EmptyMetrics />;
  return <><MetricHistory metric={metric} range={range} setRange={setRange} live={isLive(data)} />
    <MetricRows ids={data.groups.rates} metrics={data.metrics} selected={metric.id} onSelect={setSelected} live={isLive(data)} />
    <Insight title="利率解读">{isLive(data) ? sectionSummary(data, 'rates') : present(data.metrics.real10y) ? '长端收益率与实际利率近5日走高，估值折现压力有所增加。关注变化速度，不以单一利率点位判断股票方向。' : '实际利率数据缺失，利率环境暂不作完整判断。已知国债收益率仍可单独查看。'}</Insight>
  </>;
}
function Inflation({ data, tab, setTab, selected, setSelected, range, setRange }) {
  const tabs = Object.entries(TAB_LABELS).filter(([id]) => data.groups[id]?.length > 0);
  const activeTab = tabs.some(([id]) => id === tab) ? tab : tabs[0]?.[0];
  const ids = data.groups[activeTab] || [];
  const metric = data.metrics[ids.includes(selected) ? selected : ids[0]];
  if (!metric) return <EmptyMetrics />;
  return <>
    <div className="macro-tabs" role="tablist" aria-label="通胀指标分组">{tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => { setTab(id); setSelected(data.groups[id][0]); }}>{label}</button>)}</div>
    <MetricHistory metric={metric} range={range} setRange={setRange} live={isLive(data)} />
    <MetricRows ids={ids} metrics={data.metrics} selected={metric.id} onSelect={setSelected} live={isLive(data)} />
    <Section title="通胀压力"><div className="macro-section-state"><Tone tone={isLive(data) ? 'neutral' : 'warning'}>{isLive(data) ? sectionLabel(data, 'inflation') : '上升'}</Tone></div><p className="macro-body-copy">{isLive(data) ? sectionSummary(data, 'inflation') : '能源价格近期上涨，通胀预期温和抬升。美元与黄金单独观察，不将其涨跌直接等同于通胀变化。'}</p></Section>
  </>;
}
function Stress({ data }) {
  const [expanded, setExpanded] = React.useState(null);
  const live = isLive(data);
  if (data.groups.stress.length === 0) return <EmptyMetrics />;
  return <><p className="macro-page-intro">一起观察绝对水平、变化方向和速度。</p><div className="macro-stress-list">{data.groups.stress.map(id => {
    const metric = data.metrics[id];
    const isOpen = expanded === id;
    return <section key={id} className="macro-stress-item">
      <button type="button" className="macro-stress-trigger" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : id)}>
        <div className="macro-card-heading"><span>{metricLabel(metric)}</span><Tone>{metric.status}</Tone></div>
        <div className="macro-stress-numbers"><strong><MetricValue metric={metric} /></strong><span><small>{live ? '较前次数据' : '1日变化'}</small><MetricChange metric={metric} /></span><span><small>20{observationUnit(metric, live)}位置</small>{present(metric) && finite(metric.percentile20d) ? `${number(metric.percentile20d)}%` : '—'}</span></div>
        <div className="macro-percentile" aria-hidden="true">{present(metric) && finite(metric.percentile20d) && <i style={{ left: `${Math.min(100, Math.max(0, metric.percentile20d))}%` }} />}</div>
        {live && <MetricSource metric={metric} />}
      </button>
      {isOpen && <div className="macro-stress-expanded"><div><span>5{observationUnit(metric, live)}变化</span><MetricChange metric={metric} period="change5d" /></div><div><span>20{observationUnit(metric, live)}变化</span><MetricChange metric={metric} period="change20d" /></div><p>{metricDescription(metric)}</p><p>{present(metric) ? macroDisplayText(metric.explanation) : '此指标数据缺失，暂不描述其变化方向与速度。'}</p>{!live && <DataStamp metric={metric} />}</div>}
    </section>;
  })}</div><Insight title="压力解读">{live ? sectionSummary(data, 'stress') : data.groups.stress.every(id => present(data.metrics[id])) ? '波动率与信用利差处于近期中段，短期变化暂未显示广泛升温。20日位置仅描述近期分布，不代表下跌概率。' : '部分压力指标缺失，暂不生成完整判断。20日位置仅描述已知指标的近期分布。'}</Insight></>;
}
function Liquidity({ data }) {
  const [expanded, setExpanded] = React.useState(null);
  const metric = data.metrics.netLiquidity;
  const live = isLive(data);
  if (data.groups.liquidity.length === 0) return <EmptyMetrics />;
  return <>
    {(!live || present(metric)) && <section className="macro-liquidity-hero"><div className="macro-card-heading"><span>{metricLabel(metric)}</span><span className="macro-derived-badge">派生指标</span></div><div className="macro-hero-value"><MetricValue metric={metric} /></div><div className="macro-derived-caption">派生指标 · 美元十亿</div><p className="macro-formula">美联储总资产 − 财政部一般账户 − 隔夜逆回购</p><DataStamp metric={metric} live={live} /></section>}
    <div className="macro-liquidity-list">{data.groups.liquidity.filter(id => id !== 'netLiquidity').map(id => {
      const item = data.metrics[id];
      return <section key={id}><button type="button" className="macro-metric-row" aria-expanded={expanded === id} onClick={() => setExpanded(expanded === id ? null : id)}><span className="macro-metric-name">{metricLabel(item)}{live ? <MetricSource metric={item} /> : <small>{formatMacroDate(item.asOf)} · {item.frequency}</small>}</span><span className="macro-metric-reading"><strong><MetricValue metric={item} /></strong><small><MetricChange metric={item} /></small></span></button>{expanded === id && <p className="macro-body-copy macro-row-explanation">{metricDescription(item)}{macroDisplayText(item.explanation)}</p>}</section>;
    })}</div>
    <Section title="流动性环境"><div className="macro-section-state">{live ? sectionLabel(data, 'liquidity') : present(metric) ? '中性' : '数据不足'}</div><p className="macro-body-copy">{live ? sectionSummary(data, 'liquidity') : present(metric) ? '净流动性近20日温和收缩，短端融资利率保持平稳。分项频率不同；净流动性是简化派生量，不是官方金融条件指数。' : '派生指标缺少完整分项，暂不判断流动性环境。'}</p></Section>
  </>;
}
function Growth({ data, onOpen, partial }) {
  if (isLive(data)) return <p className="macro-empty-copy" role="status">暂无评分，成长股压力模型尚未启用。</p>;
  return <>
    <div className="macro-growth-hero"><div className="macro-eyebrow">成长资产宏观压力</div><div className="macro-score-row"><strong>{partial ? '—' : data.growth.score}<small> / 100</small></strong><Tone tone={partial ? 'neutral' : 'warning'}>{partial ? '数据不足' : data.growth.label}</Tone></div><div className="macro-pressure-bar" aria-hidden="true"><i style={{ width: partial ? '0%' : `${data.growth.score}%` }} /></div><p className="macro-body-copy">描述成长资产面对的宏观压力。不是市场涨跌概率，也不生成买卖建议。</p></div>
    <Section title="压力来自哪里"><div className="macro-factor-head"><span>维度 / 权重</span><span>贡献分</span></div>{data.growth.factors.map(factor => <button key={factor.id} type="button" className="macro-factor" onClick={() => onOpen(factor.id === 'rates' ? 'rates' : factor.id === 'inflation' ? 'inflation' : factor.id === 'stress' ? 'stress' : 'liquidity')}><span><span>{factor.label}<small>权重 {factor.weight}%</small></span><p>{factor.reason}</p></span><strong>{partial ? '—' : number(factor.contribution)}<ChevronRight size={14} /></strong></button>)}<div className="macro-total"><span>合计</span><strong>{partial ? '—' : data.growth.score}</strong></div></Section>
    <Insight title="如何理解">同一利率水平，上升与下降的环境不同。后续模型将同时观察水平、短期变化和中期趋势；本页为模拟分解，尚未校准或回测。</Insight>
  </>;
}
function Calendar({ data }) {
  const [local, setLocal] = React.useState(false);
  const [released, setReleased] = React.useState(false);
  const live = isLive(data);
  const unavailable = live && !['available', 'partial'].includes(data.calendarStatus);
  const partial = live && data.calendarStatus === 'partial';
  const now = Date.parse(data.now);
  const events = unavailable ? [] : data.events.filter(event => released ? Date.parse(event.time) <= now : Date.parse(event.time) > now && Date.parse(event.time) <= now + 7 * 86400000).sort((a, b) => released ? b.time.localeCompare(a.time) : a.time.localeCompare(b.time));
  return <><div className="macro-calendar-controls"><div className="macro-tabs" role="tablist" aria-label="日历范围"><button type="button" role="tab" aria-selected={!released} onClick={() => setReleased(false)}>未来7天</button><button type="button" role="tab" aria-selected={released} onClick={() => setReleased(true)}>{live ? '近期发布' : '已公布'}</button></div><button type="button" className="macro-time-switch" aria-pressed={local} onClick={() => setLocal(!local)}>{local ? '本地时间' : '美东时间'}</button></div>
    <p className="macro-calendar-clock">{live ? '截至' : '演示时钟'} {formatMacroDate(formatMacroEventTime(data.now).date)} · {formatMacroEventTime(data.now).time} 美东时间</p>
    {partial && <p className="macro-notice" role="status">经济日历数据不完整，仅显示已读取事件。</p>}
    <div className="macro-calendar-list">{unavailable ? <p className="macro-empty-copy" role="status">未能读取经济日历，请稍后重试。</p> : events.length === 0 ? <p className="macro-empty-copy">{partial ? '暂不能确认此范围内是否存在事件。' : '暂无符合条件的事件。'}</p> : events.map(event => {
      const isDue = Date.parse(event.time) <= now;
      const isReleased = isDue && (!live || finite(event.actual));
      const unit = event.code === 'NFP' && event.unit === '千人' ? '千个岗位' : event.unit;
      const upcoming = !isDue && Date.parse(event.time) - now < 86400000 && event.importance === 'high';
      return <article key={event.id} className={`macro-calendar-event ${upcoming ? 'is-upcoming' : ''}`} data-release-state={isReleased ? 'released' : isDue ? 'awaiting' : 'upcoming'}><div className="macro-event-meta"><EventTime event={event} local={local} /><Tone tone={event.importance === 'high' ? 'warning' : 'neutral'}>{event.importance === 'high' ? '高重要性' : '中重要性'}</Tone></div><h2>{event.code}</h2><p className="macro-event-name">{eventLabel(event)}</p>{live && isDue && !isReleased && <p className="macro-release-state">等待公布值</p>}<div className={`macro-event-values ${isDue ? 'has-actual' : ''}`}>{isDue && <div><span>公布值</span><strong><EventValue value={event.actual} unit={unit} /></strong></div>}<div><span>预测值</span><strong><EventValue value={event.forecast} unit={unit} /></strong></div><div><span>前值</span><strong><EventValue value={event.previous} unit={unit} /></strong></div></div>{isReleased && finite(event.actual) && finite(event.forecast) && <p className="macro-surprise">{event.actual === event.forecast ? '符合预期' : event.actual > event.forecast ? '高于预期' : '低于预期'} · 仅描述数据差异</p>}</article>;
    })}</div><p className="macro-footnote">{!live && '全部日期与数值均为演示。'}公布值高于或低于预期，不直接对应利多或利空。</p></>;
}
export default function MacroPage({ initialPage = 'overview', initialInflationTab = 'energy', previewState = 'ready', onBack = () => {}, snapshot: providedSnapshot, fetchState, onRetry }) {
  const snapshot = providedSnapshot || (fetchState === undefined ? MACRO_MOCK_SNAPSHOT : { simulated: false, metrics: {}, asOf: null, fetchedAt: null });
  const [routes, setRoutes] = React.useState([PAGES.includes(initialPage) ? initialPage : 'overview']);
  const page = routes.at(-1);
  const [previewStatus, setPreviewStatus] = React.useState(previewState);
  const live = isLive(snapshot);
  const state = live ? !providedSnapshot && !['loading', 'error'].includes(fetchState) ? 'empty' : fetchState || 'ready' : previewStatus;
  const [range, setRange] = React.useState('1m');
  const [selectedRate, setSelectedRate] = React.useState('us10y');
  const [inflationTab, setInflationTab] = React.useState(Object.hasOwn(TAB_LABELS, initialInflationTab) ? initialInflationTab : 'energy');
  const [selectedInflation, setSelectedInflation] = React.useState(null);
  const partial = !live && state === 'partial';
  const data = React.useMemo(() => {
    if (live) return {
      ...snapshot,
      groups: Object.fromEntries(METRIC_GROUPS.map(group => [group,
        (snapshot.groups?.[group] || []).filter(id => present(snapshot.metrics?.[id])),
      ])),
    };
    return !partial ? snapshot : { ...snapshot, metrics: { ...snapshot.metrics, real10y: { ...snapshot.metrics.real10y, value: null, history: [] }, netLiquidity: { ...snapshot.metrics.netLiquidity, value: null, history: [] }, move: { ...snapshot.metrics.move, value: null, change1d: null, percentile20d: null, status: '数据缺失' } } };
  }, [snapshot, partial, live]);
  const onOpen = target => { setRoutes(current => [...current, target]); setRange('1m'); };
  const back = () => page === 'overview' ? onBack() : setRoutes(current => current.length > 1 ? current.slice(0, -1) : ['overview']);
  React.useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const loading = state === 'loading';
  const unavailable = state === 'error' || state === 'empty';
  const fetched = live && snapshot.fetchedAt ? formatMacroEventTime(snapshot.fetchedAt, LOCAL_TIME_ZONE) : null;
  const staleLive = live && !loading && !unavailable && Object.values(data.metrics).some(metric => metric.freshness === 'stale' && present(metric));
  return <main className="macro-page" data-macro-page={page} data-macro-state={state} data-macro-mode={live ? 'live' : 'mock'}>
    <header className="macro-header"><div className="macro-title-row"><button type="button" className="macro-back" onClick={back} aria-label={page === 'overview' ? '返回' : '返回上一级'}><ArrowLeft size={20} strokeWidth={1.6} /></button><div><h1>{TITLES[page]}</h1>{page === 'overview' && <p>宏观环境</p>}</div><span className="macro-demo-label">{live ? '真实数据' : '模拟数据'}</span>{live && <button type="button" className="macro-refresh" onClick={onRetry} disabled={loading || typeof onRetry !== 'function'}>刷新</button>}</div><div className="macro-snapshot">{live ? '最新观测日' : '演示快照'} · {snapshot.asOf ? formatMacroDate(snapshot.asOf) : '—'}{live && fetched ? <span>读取于 {formatMacroDate(fetched.localDate)} {fetched.localTime}</span> : !live && page !== 'overview' && <span>仅作界面预览</span>}</div></header>
    {state === 'stale' && <p className="macro-notice" role="status">数据待更新 · 以下显示上次快照，不能代表当前环境。</p>}
    {partial && <p className="macro-notice" role="status">部分数据缺失 · 综合评分暂不可用。</p>}
    {staleLive && <p className="macro-notice" role="status">部分数据待更新，请查看各指标的数据日期。</p>}
    {loading ? <div className="macro-loading" role="status" aria-label="宏观数据加载中"><span>正在加载宏观数据…</span>{[1, 2, 3].map(id => <div key={id} className="macro-skeleton" />)}</div> : unavailable ? <div className="macro-unavailable" role="status"><h2>{state === 'error' ? '暂时无法读取宏观数据' : '暂无宏观数据'}</h2><p>{state === 'error' ? '环境与评分保持为空，请稍后重试。' : live ? '尚未取得可用观测值，请稍后重试。' : '数据接入后将在这里显示环境与指标。'}</p><button type="button" disabled={live && typeof onRetry !== 'function'} onClick={live ? onRetry : () => setPreviewStatus('ready')}>{live ? '重新读取' : '重新加载演示'}</button></div> : <>
      {page === 'overview' && <Overview data={data} onOpen={onOpen} partial={partial} stale={state === 'stale'} />}
      {page === 'rates' && <Rates data={data} selected={selectedRate} setSelected={setSelectedRate} range={range} setRange={setRange} />}
      {page === 'inflation' && <Inflation data={data} tab={inflationTab} setTab={setInflationTab} selected={selectedInflation} setSelected={setSelectedInflation} range={range} setRange={setRange} />}
      {page === 'stress' && <Stress data={data} />}
      {page === 'liquidity' && <Liquidity data={data} />}
      {page === 'growth' && <Growth data={data} onOpen={onOpen} partial={partial} />}
      {page === 'calendar' && <Calendar data={data} />}
    </>}
  </main>;
}
