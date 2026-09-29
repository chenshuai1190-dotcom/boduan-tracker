import React from 'react';
import { ArrowLeft, ChevronDown, Circle, RefreshCw } from 'lucide-react';
import VixRiskChart from '../components/VixRiskChart.jsx';
import { getVixComparisonExpectedCloseDate, loadVixComparison } from '../lib/vixComparison.js';
import { buildVixComparisonModel, formatVixComparisonChangePercent, VIX_COMPARISON_RANGES } from '../lib/vixComparisonChart.js';
import { buildVixRiskModel } from '../lib/vixRiskModel.js';
import { getVixRiskAccentStyle, getVixRiskDirectionColor } from '../lib/vixRiskPalette.js';
import './VixComparisonPage.css';

const VixMonthlyReportPage = React.lazy(() => import('./VixMonthlyReportPage.jsx'));

const RANGE_LABELS = { '1m': '1月', '3m': '3月', '6m': '6月', '1y': '1年', '5y': '5年' };
const LEVELS = {
  LOW_VOLATILITY: { label: ['低波动', 'Low volatility'], tone: 'calm' },
  NORMAL: { label: ['常态波动', 'Normal volatility'], tone: 'normal' },
  ELEVATED: { label: ['波动升高', 'Elevated volatility'], tone: 'caution' },
  HIGH_STRESS: { label: ['高压状态', 'High stress'], tone: 'stress' },
  EXTREME_STRESS: { label: ['极端压力', 'Extreme stress'], tone: 'persistent' },
  UNKNOWN: { label: ['当前风险暂不可判断', 'Current risk unavailable'], tone: 'muted' },
};
const TERMS = {
  NORMAL_TERM_STRUCTURE: ['明显正向结构', 'Upward term structure'],
  NEAR_FLAT: ['接近平坦，尚未倒挂', 'Near flat, not inverted'],
  INVERTED: ['期限倒挂', 'Inverted'],
  DEEP_INVERTED: ['深度倒挂', 'Deeply inverted'],
  UNKNOWN: ['暂不可判断', 'Unavailable'],
};
const DIRECTIONS = {
  RISING: ['风险升温', 'Risk is rising'],
  EASING: ['风险缓解', 'Risk is easing'],
  HIGH_HOLD: ['高位维持', 'Holding at high levels'],
  STABLE: ['基本稳定', 'Stable'],
  UNKNOWN: ['变化暂不可判断', 'Direction unavailable'],
};
const PRICES = {
  NEW_LOW: ['创 20 日收盘新低', 'New 20-session closing low'],
  RECOVERY: ['反弹延续', 'Price recovery'],
  EARLY_STABILIZATION: ['短期止跌迹象', 'Early stabilization'],
  NO_STABILIZATION: ['尚未止跌', 'No stabilization signal'],
  INSUFFICIENT_DATA: ['价格历史不足', 'Insufficient price history'],
  UNKNOWN: ['价格状态暂不可判断', 'Price status unavailable'],
};
const EVENTS = {
  VIX_CROSS_25: ['VIX 上穿 25', 'VIX crossed above 25'],
  VIX_CROSS_30: ['VIX 达到或上穿 30', 'VIX reached or crossed 30'],
  RATIO_CROSS_1: ['期限结构进入倒挂', 'Term structure became inverted'],
  RATIO_CROSS_1_10: ['比率达到或上穿 1.10', 'Ratio reached or crossed 1.10'],
  INVERSION_15D: ['连续倒挂达到 15 日', 'Inversion reached 15 sessions'],
  TERM_STRUCTURE_NORMALIZED: ['期限结构恢复正向', 'Term structure returned below 1'],
};
const RULES = [
  ['当前风险水平', 'Current risk level', '极端压力：VIX ≥ 30 且比率 ≥ 1；高压状态：VIX > 25 且比率 ≥ 1；波动升高：VIX > 22 或比率 ≥ 1；低波动：VIX < 16 且比率 < 0.90；其余为常态波动。按此顺序判断。', 'In order: extreme stress at VIX ≥ 30 and ratio ≥ 1; high stress at VIX > 25 and ratio ≥ 1; elevated at VIX > 22 or ratio ≥ 1; low volatility at VIX < 16 and ratio < 0.90; otherwise normal.'],
  ['期限结构', 'Term structure', '比率 < 0.90 为明显正向；0.90 ≤ 比率 < 1 为接近平坦；1 ≤ 比率 < 1.10 为倒挂；比率 ≥ 1.10 为深度倒挂。', 'Ratio < 0.90: upward; 0.90 to below 1: near flat; 1 to below 1.10: inverted; ≥ 1.10: deeply inverted.'],
  ['风险变化', 'Risk direction', '至少需要 7 个连续收盘。升温：连续两日满足 VIX 三日涨幅 ≥ 10% 且比率增加 ≥ 0.02，或涨幅 ≥ 20% 且比率变化 ≥ −0.02；两日当日 VIX 均未下降。缓解：连续两日 VIX 三日跌幅 ≤ −10%、比率变化 ≤ −0.02，且当日 VIX 均下降。', 'Requires 7 consecutive closes. Rising: on 2 consecutive days, VIX is up ≥ 10% over 3 sessions with ratio up ≥ 0.02, or VIX is up ≥ 20% with ratio change ≥ −0.02; neither day has a falling VIX. Easing: on 2 consecutive days, 3-session VIX change ≤ −10%, ratio change ≤ −0.02, and VIX falls each day.'],
  ['变化维持与持续时间', 'Direction persistence and durations', '已进入的升温或缓解，在三日变化仍同向且当日 VIX 未反向时最多维持 2 日，否则回到高位维持或基本稳定。当前与前一日都满足 VIX > 25 或比率 ≥ 1 为高位维持。各持续日数独立累计；倒挂达到 15 日仅增加持续倒挂标签。', 'A direction may persist for up to 2 sessions while 3-session changes remain aligned and VIX does not reverse that day. Otherwise it becomes high hold when both current and previous sessions have VIX > 25 or ratio ≥ 1, or stable. Durations are separate; 15 inverted sessions add a prolonged-inversion tag.'],
  ['价格行为', 'Price behavior', 'SPY、QQQ 各自使用最近 20 个连续交易日。严格低于前 19 日收盘为创新低；距最近窗口低点 ≥ 5 日、连续两日高于各自 5 日均价且当前高于 3 日前为价格反弹；否则，距低点 ≥ 3 日且最新收盘上涨为短期止跌迹象。相同低点重置计数。', 'SPY and QQQ each use their own latest 20 consecutive sessions. A close strictly below the prior 19 is a new low. Recovery requires ≥ 5 sessions since the latest window low, 2 closes above their 5-session averages, and a close above 3 sessions earlier. Otherwise ≥ 3 sessions since the low and a higher latest close indicate early stabilization. Equal lows restart the count.'],
  ['近期事件与数据', 'Recent events and data', '仅记录近 3 个连续交易日内的上穿、恢复正向或倒挂满 15 日事件。事件过期不改变当前风险。缺失数据中断连续计数；无完整前序时日数显示“至少”。周末与官方休市不算缺口。', 'Crossings, term normalization and the first 15-session inversion milestone are shown for 3 consecutive sessions. Expired events do not change current risk. Missing data breaks continuity; unknown preceding history gives a lower-bound count. Weekends and official closures are not gaps.'],
];

const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pick = (values, en) => values[en ? 1 : 0];
const duration = (days, exact, en) => !Number.isFinite(days) ? '—'
  : `${exact === false && days > 0 ? (en ? 'At least ' : '至少 ') : ''}${number(days, 0)} ${en ? 'sessions' : '个交易日'}`;
const priceLabel = (price, en) => pick(PRICES[price?.status] || PRICES.UNKNOWN, en);
const dateList = values => (Array.isArray(values) ? values : []).map(value => typeof value === 'string' ? value : value?.date).filter(Boolean).join(' · ');

function currentDescription(risk, level, en, loading, error, riskStale, expectedDate) {
  if (error) return en ? 'The refresh failed. Earlier history remains visible; current observations are unavailable.' : '本次刷新失败，保留此前历史，暂不沿用为当前判断。';
  if (riskStale) return en ? `The latest paired closes are not yet available${expectedDate ? ` (${expectedDate})` : ''}.` : `最近完成交易日${expectedDate ? `（${expectedDate}）` : ''}的配对收盘数据尚未齐全。`;
  if (level === 'UNKNOWN') return loading ? (en ? 'Loading completed daily closes…' : '正在读取完成收盘数据…') : (en ? 'A valid same-session VIX and VIX3M pair is required.' : '需要同一交易日有效的 VIX 与 VIX3M 收盘数据。');
  if (level === 'EXTREME_STRESS') return en ? 'VIX is at least 30 and near-term volatility expectations exceed or match the three-month level.' : 'VIX 已达到 30，近期波动预期高于或等于三个月水平。';
  if (level === 'HIGH_STRESS') return en ? 'VIX is above 25 and the term structure remains inverted.' : 'VIX 高于 25，期限结构仍处于倒挂。';
  if (level === 'ELEVATED') return risk.latest?.vix >= 30
    ? (en ? 'Volatility is substantially elevated. The term structure is shown separately below.' : '波动显著升高。期限结构是否倒挂在下方独立展示。')
    : (en ? 'VIX is above 22 or the term structure is inverted.' : 'VIX 高于 22，或期限结构已进入倒挂。');
  if (level === 'LOW_VOLATILITY') return en ? 'VIX is below 16 and the term ratio is below 0.90.' : 'VIX 低于 16，期限比率低于 0.90。';
  return en ? 'Current readings fall within the normal range of these candidate rules.' : '当前读数处于这组候选规则定义的常态区间。';
}

function focusText(risk, level, direction, en) {
  if (level === 'UNKNOWN') return en ? 'Current paired closes are unavailable. Missing values remain blank; previous history is labeled by its original date.' : '当前配对数据不可用。缺失值保留为空，此前历史按原始日期展示。';
  const levelText = pick(LEVELS[level].label, en);
  if (direction === 'EASING' && ['HIGH_STRESS', 'EXTREME_STRESS'].includes(level)) return en
    ? `Risk is easing, while the current level remains ${levelText.toLowerCase()}. A change in direction does not remove the existing pressure.`
    : `风险正在缓解，但当前水平仍为${levelText}。变化方向与当前压力分别反映不同事实。`;
  if (level === 'ELEVATED' && risk.latest?.vix >= 30) return en
    ? 'VIX remains at least 30, even though the term ratio is below 1. Returning below 1 does not by itself establish easing.'
    : 'VIX 仍不低于 30，即使期限比率已低于 1，也不单凭恢复正向判断风险缓解。';
  if (direction === 'UNKNOWN') return en
    ? 'The latest paired closes identify the current level and term structure. More continuous history is needed to assess direction.'
    : '最新同日配对可以识别当前水平与期限结构；变化方向仍需补齐连续历史。';
  return en
    ? `${levelText}; ${pick(DIRECTIONS[direction] || DIRECTIONS.UNKNOWN, true).toLowerCase()}. SPY and QQQ price behavior is assessed separately below.`
    : `当前为${levelText}，${pick(DIRECTIONS[direction] || DIRECTIONS.UNKNOWN, false)}。SPY 与 QQQ 的价格行为在下方分别观察。`;
}

function PriceObservation({ symbol, value, en }) {
  const unavailable = !value?.ready;
  return <div className="vcr-price-observation" data-vix-price-symbol={symbol} data-vix-price-status={value?.status || 'UNKNOWN'}>
    <div><span className="vcr-price-symbol">{symbol}</span><span className={`vcr-price-state ${unavailable ? 'is-unavailable' : ''}`}>{priceLabel(value, en)}</span></div>
    <p>{unavailable ? (value?.status === 'INSUFFICIENT_DATA'
      ? (en ? 'Needs 20 consecutive completed trading sessions.' : '需要最近 20 个连续完成交易日。')
      : (en ? 'Latest prices or continuous history are unavailable.' : '最新价格或连续历史暂不可用。'))
      : `${en ? 'Since the latest 20-session low: ' : '距最近 20 日窗口低点：'}${duration(value.daysSinceLow, true, en)}`}</p>
    {value?.ready && value.lowDate && <small>{en ? 'Window low' : '窗口低点'} {value.lowDate} · ${number(value.lowClose)}</small>}
  </div>;
}

export default function VixComparisonPage({ ctx = {}, previewData }) {
  const { closeVixComparison, userId = '' } = ctx;
  const englishMode = ctx.englishMode ?? ctx.language === 'en';
  const demoData = import.meta.env.DEV ? previewData : null;
  const [symbol, setSymbol] = React.useState('SPY');
  const [range, setRange] = React.useState('1y');
  const [selectedDate, setSelectedDate] = React.useState(null);
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const [state, setState] = React.useState({ userId, data: demoData || null, loading: !demoData, error: false });
  const requestRef = React.useRef(0);
  const [monthlyOpen, setMonthlyOpen] = React.useState(false);
  const [monthlyVisited, setMonthlyVisited] = React.useState(false);
  const reportScrollRef = React.useRef({ risk: 0, report: 0 });
  const openMonthlyReport = () => {
    if (import.meta.env.DEV && typeof ctx.openVixMonthlyReport === 'function') {
      ctx.openVixMonthlyReport();
      return;
    }
    reportScrollRef.current.risk = window.scrollY;
    setMonthlyVisited(true);
    setMonthlyOpen(true);
    requestAnimationFrame(() => window.scrollTo(0, reportScrollRef.current.report));
  };
  const closeMonthlyReport = () => {
    reportScrollRef.current.report = window.scrollY;
    setMonthlyOpen(false);
    requestAnimationFrame(() => window.scrollTo(0, reportScrollRef.current.risk));
  };

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    if (demoData) {
      setState({ userId, data: demoData, loading: false, error: false });
      return () => { if (requestRef.current === requestId) requestRef.current += 1; };
    }
    setState(current => ({ userId, data: current.userId === userId ? current.data : null, loading: true, error: current.userId === userId ? current.error : false }));
    loadVixComparison({ userId, force: refreshVersion > 0 })
      .then(data => {
        if (requestRef.current === requestId) setState({ userId, data, loading: false, error: false });
      })
      .catch(error => {
        if (requestRef.current !== requestId) return;
        setState(current => ({ userId, data: error?.code !== 'AUTH_REQUIRED' && current.userId === userId ? current.data : null, loading: false, error: true }));
      });
    return () => { if (requestRef.current === requestId) requestRef.current += 1; };
  }, [demoData, refreshVersion, userId]);

  const data = state.userId === userId ? state.data : null;
  const expectedAsOfDate = demoData ? data?.expectedAsOfDate : getVixComparisonExpectedCloseDate();
  const model = React.useMemo(() => buildVixComparisonModel({
    vixRows: data?.series?.VIX?.rows,
    benchmarkRows: data?.series?.[symbol]?.rows,
    range,
  }), [data, range, symbol]);
  const chartStale = Boolean(data?.stale || (expectedAsOfDate && model.to && model.to < expectedAsOfDate));
  const riskStale = Boolean(data?.termStructure?.stale || (expectedAsOfDate && data?.termStructure?.asOfDate && data.termStructure.asOfDate < expectedAsOfDate));
  // Every dimension uses complete histories, independently of chart selection.
  // A market-series gap must not erase a valid current volatility observation.
  const risk = React.useMemo(() => buildVixRiskModel({
    termStructure: data?.termStructure,
    benchmarks: { SPY: data?.series?.SPY?.rows, QQQ: data?.series?.QQQ?.rows },
    expectedAsOfDate,
    stale: riskStale || state.error,
    benchmarkStale: Boolean(data?.stale || state.error),
  }), [data, riskStale, state.error, expectedAsOfDate]);
  const blocked = riskStale || state.error;
  const currentRiskLevel = !blocked && LEVELS[risk.currentRiskLevel] ? risk.currentRiskLevel : 'UNKNOWN';
  const level = LEVELS[currentRiskLevel];
  const term = !blocked && TERMS[risk.termStructure] ? risk.termStructure : 'UNKNOWN';
  const direction = !blocked && DIRECTIONS[risk.riskDirection] ? risk.riskDirection : 'UNKNOWN';
  // A short history does not suppress valid same-session VIX / VIX3M values.
  const latest = !blocked && currentRiskLevel !== 'UNKNOWN' && risk.latest?.date === expectedAsOfDate ? risk.latest : null;
  const exact = risk.durationExact || {};
  const partialHistory = model.hasComparison && data?.availableFromDate > model.requestedFrom
    && (new Date(`${data.availableFromDate}T00:00:00Z`) - new Date(`${model.requestedFrom}T00:00:00Z`)) > 7 * 86400000;
  const priceAction = risk.priceAction || {};
  const events = blocked ? [] : (risk.eventFlags || []).filter(event => EVENTS[event.type]);
  const missingDates = dateList(risk.dataQuality?.missingSessions);
  const closureDates = dateList(risk.dataQuality?.officialClosures);
  const changeLabel = formatVixComparisonChangePercent(model.priceChangePct);
  const directionFacts = risk.facts?.direction;
  const levelTitle = currentRiskLevel === 'ELEVATED' && latest?.vix >= 30
    ? (englishMode ? 'Substantially elevated volatility' : '波动显著升高') : pick(level.label, englishMode);

  const refreshControl = <button type="button" className="vcr-refresh" disabled={state.loading || Boolean(demoData)} aria-label={englishMode ? 'Refresh daily data' : '刷新日线数据'} onClick={() => setRefreshVersion(value => value + 1)}><RefreshCw size={16} strokeWidth={1.6} className={state.loading ? 'animate-spin' : ''} /></button>;

  return <><div hidden={monthlyOpen}><main className={`vcr-page vcr-tone-${level.tone}`} data-vix-comparison-page="true" data-vix-risk-level={currentRiskLevel} style={getVixRiskAccentStyle(currentRiskLevel)} aria-busy={state.loading}>
    <header className="vcr-header vcr-header-has-report">
      <button type="button" aria-label={englishMode ? 'Back to Home' : '返回首页'} onClick={closeVixComparison}><ArrowLeft size={20} strokeWidth={1.6} /></button>
      <h1>{englishMode ? 'VIX & Market Trends' : 'VIX 与市场走势'}</h1>
      <div className="vcr-header-actions"><button type="button" onClick={openMonthlyReport}>{englishMode ? 'Report' : '月报'}</button>{refreshControl}</div>
    </header>
    {demoData && <div className="vcr-demo-label">{demoData.source === 'CBOE_EODHD_EOD'
      ? (englishMode ? 'Local verification · captured official closes' : '本地验收 · 官方收盘快照')
      : (englishMode ? 'Local preview · simulated data' : '本地效果预览 · 模拟数据')}{demoData.previewCutoff && <span> · {englishMode ? 'Replay through' : '历史截断至'} {demoData.previewCutoff}</span>}</div>}
    {state.error && <div className="vcr-alert" role="alert"><span>{data ? (englishMode ? 'Refresh failed. Showing the previous data.' : '刷新失败，暂时保留上次数据。') : (englishMode ? 'Daily data could not be loaded.' : '日线数据暂时无法读取。')}</span><button type="button" onClick={() => setRefreshVersion(value => value + 1)}>{englishMode ? 'Retry' : '重试'}</button></div>}

    <section className="vcr-overview">
      <div className="vcr-eyebrow"><span>{englishMode ? 'MARKET RISK OBSERVATION' : '市场风险观察'}</span><span>{risk.asOfDate?.replaceAll('-', '.') || '—'}<span className="vcr-date-dot">·</span>{latest ? (englishMode ? 'Close' : '收盘') : (englishMode ? 'Pending' : '待齐')}</span></div>
      <div className="vcr-title-row"><h2>{levelTitle}</h2></div>
      <p className="vcr-description">{currentDescription(risk, currentRiskLevel, englishMode, state.loading, state.error, riskStale, expectedAsOfDate)}</p>
      <div className="vcr-risk-duration">{englishMode ? 'Current level' : '当前等级持续'} <strong>{duration(blocked ? null : risk.currentRiskDuration, exact.currentRisk, englishMode)}</strong></div>
      <div className="vcr-metrics">
        <div><span>VIX</span><strong>{number(latest?.vix)}</strong><small>{englishMode ? '30-day volatility' : '30 天预期波动'}</small></div>
        <div><span>VIX3M</span><strong>{number(latest?.vix3m)}</strong><small>{englishMode ? '3-month volatility' : '3 个月预期波动'}</small></div>
        <div className="vcr-ratio-metric"><span>{englishMode ? 'Term ratio' : '期限比率'}</span><strong>{number(latest?.ratio, 3)}</strong><small>VIX / VIX3M</small></div>
      </div>
      <div className="vcr-environment">
        <div className="vcr-environment-row" data-vix-term-structure={term}><span>{englishMode ? 'Term structure' : '期限结构'}</span><div><strong>{pick(TERMS[term], englishMode)}</strong><small>{englishMode ? 'Consecutive inversion: ' : '连续倒挂：'}{duration(blocked ? null : risk.currentInversionDays, exact.inversion, englishMode)}</small></div></div>
        <div className="vcr-environment-row" data-vix-risk-direction={direction}><span>{englishMode ? 'Risk direction' : '风险变化'}</span><div><strong className={`vcr-direction-${direction}`} style={{ color: getVixRiskDirectionColor(direction) }}>{pick(DIRECTIONS[direction], englishMode)}</strong><small>{!blocked && Number.isFinite(directionFacts?.vixChange3Pct) && Number.isFinite(directionFacts?.ratioChange3)
          ? `${englishMode ? '3-session VIX' : 'VIX 三日'} ${formatVixComparisonChangePercent(directionFacts.vixChange3Pct)} · ${englishMode ? 'ratio' : '比率'} ${directionFacts.ratioChange3 > 0 ? '+' : ''}${number(directionFacts.ratioChange3, 3)}`
          : (englishMode ? 'Needs 7 continuous completed sessions' : '需 7 个连续完成交易日')}</small></div></div>
      </div>
      <div className="vcr-stress-durations"><span>{englishMode ? 'High stress or above' : '高压及以上'} <strong>{duration(blocked ? null : risk.highStressDays, exact.highStress, englishMode)}</strong></span><span>{englishMode ? 'Extreme stress' : '极端压力'} <strong>{duration(blocked ? null : risk.extremeStressDays, exact.extremeStress, englishMode)}</strong></span></div>
      {!blocked && risk.durationTags?.includes('PROLONGED_INVERSION') && <div className="vcr-duration-tag">{englishMode ? 'Prolonged inversion · at least 15 sessions' : '持续倒挂 · 已达 15 个交易日'}</div>}
      <div className="vcr-guidance"><span className="vcr-guidance-line" /><div><span className="vcr-guidance-label">{englishMode ? 'CURRENT OBSERVATIONS' : '当前关注'}</span><p>{focusText(risk, currentRiskLevel, direction, englishMode)}</p></div></div>
      {!blocked && latest && !risk.ready && <p className="vcr-chart-stale" data-vix-partial-history="true">{englishMode ? 'Current level and term structure are available. Dimensions needing more continuous history remain unavailable.' : '当前风险与期限结构已有有效读数；依赖更多连续历史的维度暂不可用。'}</p>}
    </section>

    <section className="vcr-price-actions"><div className="vcr-section-heading"><h3>{englishMode ? 'Price behavior' : '价格行为'}</h3><span>{englishMode ? 'Separate 20-session windows' : '各自最近 20 个交易日'}</span></div><div className="vcr-price-grid">{['SPY', 'QQQ'].map(item => <PriceObservation key={item} symbol={item} value={priceAction[item]} en={englishMode} />)}</div><p className="vcr-price-note">{englishMode ? '“Early stabilization” and “Price recovery” only describe the absence of a recent new low and a price rebound; neither means a market bottom has formed.' : '“短期止跌迹象”与“反弹延续”仅表示近期未创新低且价格出现回升，不代表市场底部已经形成。'}</p></section>

    <section className="vcr-history" data-vix-risk-history="true">
      <div className="vcr-section-heading"><h3>{englishMode ? 'Volatility & market' : '波动与市场'}</h3><div className="vcr-symbol-switch" role="group" aria-label={englishMode ? 'Comparison ETF' : '选择对比 ETF'}>{['SPY', 'QQQ'].map(item => <button type="button" key={item} aria-pressed={symbol === item} onClick={() => { setSymbol(item); setSelectedDate(null); }}>{item}</button>)}</div></div>
      {state.loading && !data ? <div className="vcr-chart-empty" role="status"><RefreshCw size={15} className="animate-spin" />{englishMode ? 'Loading daily history…' : '正在读取历史日线…'}</div>
        : <VixRiskChart model={model} termRows={data?.termStructure?.rows} symbol={symbol} englishMode={englishMode} marketColorMode={ctx.marketColorMode} selectedDate={selectedDate} onSelect={setSelectedDate} />}
      <div className="vcr-periods" role="group" aria-label={englishMode ? 'Chart period' : '走势时间范围'}>{VIX_COMPARISON_RANGES.map(item => <button type="button" key={item} aria-pressed={range === item} onClick={() => { setRange(item); setSelectedDate(null); }}>{englishMode ? item.toUpperCase() : RANGE_LABELS[item]}</button>)}<button type="button" className="vcr-reset-date" onClick={() => setSelectedDate(null)}>{englishMode ? 'Latest' : '回到最新'}</button></div>
      <div className="vcr-period-summary" aria-label={englishMode ? 'Selected period summary' : '所选区间摘要'}>
        <div><span>{symbol} {englishMode ? 'return' : '区间涨跌'}</span><strong>{changeLabel}</strong></div>
        <div><span>VIX {englishMode ? 'low' : '区间最低'}</span><strong>{number(model.vixLow)}</strong></div>
        <div><span>VIX {englishMode ? 'high' : '区间最高'}</span><strong>{number(model.vixHigh)}</strong></div>
      </div>
      {model.hasComparison && <p className="vcr-data-note">{model.from} — {model.to} · {model.rows.length} {englishMode ? 'matched trading days' : '个共同交易日'}</p>}
      {partialHistory && <p className="vcr-chart-stale">{englishMode ? `Available history starts ${model.from}; the selected period is not fully covered.` : `可用历史始于 ${model.from}，未覆盖完整所选区间。`}</p>}
      {chartStale && data?.expectedAsOfDate && <p className="vcr-chart-stale">{englishMode ? `Latest expected trading date: ${expectedAsOfDate}.` : `最近应有交易日：${expectedAsOfDate}。`}</p>}
      {riskStale && <p className="vcr-chart-stale">{englishMode ? 'Term structure update pending; previous observations are not current conclusions.' : '期限结构数据待更新，不把此前观察作为当前结论。'}</p>}
    </section>

    <section className="vcr-events"><div className="vcr-section-heading"><h3>{englishMode ? 'Recent events' : '近期事件'}</h3><span>{englishMode ? 'Last 3 sessions' : '最近 3 个交易日'}</span></div>{events.length ? <ul>{events.map(event => <li key={`${event.type}-${event.date}`}><span>{pick(EVENTS[event.type], englishMode)}</span><small>{event.date}<span>{event.sessionsAgo === 0 ? (englishMode ? 'Latest session' : '当日') : `${event.sessionsAgo} ${englishMode ? 'sessions ago' : '个交易日前'}`}</span></small></li>)}</ul> : <p className="vcr-event-empty">{!blocked && risk.facts?.contiguousSessions >= 4
      ? (englishMode ? 'No new threshold event in the last 3 sessions.' : '最近 3 个交易日无新增跨阈值事件。')
      : (englishMode ? 'Continuous history is insufficient to assess recent events.' : '连续历史尚不足以判断近期事件。')}</p>}</section>
    {(missingDates || closureDates) && <details className="vcr-data-quality"><summary>{englishMode ? 'Data continuity' : '数据连续性'}<ChevronDown size={13} /></summary>{missingDates && <p>{englishMode ? 'Missing provider sessions: ' : '数据缺失交易日：'}{missingDates}</p>}{closureDates && <p>{englishMode ? 'Official closures, not data gaps: ' : '官方休市，不计为数据缺口：'}{closureDates}</p>}</details>}
    <details className="vcr-rules"><summary><span><Circle size={13} />{englishMode ? 'How observations are defined' : '如何理解这些观察'}</span><ChevronDown size={14} /></summary><div>{RULES.map((rule, index) => <p key={rule[0]}><strong>{String(index + 1).padStart(2, '0')} · {englishMode ? rule[1] : rule[0]}</strong><span>{englishMode ? rule[3] : rule[2]}</span></p>)}<p className="vcr-rule-note">{englishMode ? 'Candidate rules with empirical thresholds. Their investment-prediction ability has not been established. Same-day valid readings can identify the current level even when longer history is incomplete.' : '以上为使用经验阈值的候选规则，尚未证明具有投资预测能力。同日有效读数可识别当前水平，历史不足仅影响依赖历史的维度。'}</p></div></details>
    <p className="vcr-source-note">{englishMode ? 'VIX / VIX3M: Cboe · SPY / QQQ: EODHD · Daily closes' : 'VIX / VIX3M：Cboe · SPY / QQQ：EODHD · 日线收盘'}</p>
    <p className="vcr-footnote">{englishMode ? 'Describes market risk and price behavior; not a standalone trading condition.' : '描述市场风险与价格行为，不作为单一买卖条件。'}</p>
  </main></div>
    <div hidden={!monthlyOpen} className="vcr-monthly-host" data-vix-monthly-active={monthlyOpen ? 'true' : 'false'}>
      {monthlyVisited && <React.Suspense fallback={<div className="vcr-report-loading"><button type="button" onClick={closeMonthlyReport}>{englishMode ? 'Back' : '返回'}</button><p role="status">{englishMode ? 'Preparing report…' : '正在准备月报…'}</p></div>}>
        <VixMonthlyReportPage key={userId} userId={userId} data={data} expectedAsOfDate={expectedAsOfDate}
          loading={state.loading} error={state.error} englishMode={englishMode} marketColorMode={ctx.marketColorMode}
          onBack={closeMonthlyReport} onRefresh={() => setRefreshVersion(value => value + 1)} />
      </React.Suspense>}
    </div>
  </>;
}
