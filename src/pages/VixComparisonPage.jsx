import React from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Circle, Minus, RefreshCw } from 'lucide-react';
import VixRiskChart from '../components/VixRiskChart.jsx';
import { getVixComparisonExpectedCloseDate, loadVixComparison } from '../lib/vixComparison.js';
import { buildVixComparisonModel, formatVixComparisonChangePercent, VIX_COMPARISON_RANGES } from '../lib/vixComparisonChart.js';
import { buildVixRiskModel } from '../lib/vixRiskModel.js';
import './VixComparisonPage.css';

const RANGE_LABELS = { '1m': '1月', '3m': '3月', '6m': '6月', '1y': '1年', '5y': '5年' };
const PHASES = {
  calm: { label: ['低波动', 'Low volatility'], title: ['低波动，保持节奏', 'Volatility is calm'], tone: 'calm', guidance: ['关注仓位是否偏离原定计划。低波动本身不代表价格便宜，也不意味着风险消失。', 'Review whether exposure still fits your plan. Low volatility alone does not imply attractive prices or an absence of risk.'] },
  caution: { label: ['常态偏谨慎', 'Cautious'], title: ['压力抬升，保持谨慎', 'Pressure is rising'], tone: 'caution', guidance: ['检查集中持仓与近期新增风险敞口，结合价格结构评估后续调整。', 'Review concentration and recently added exposure, using price structure to inform any adjustment.'] },
  stress: { label: ['恐慌升温', 'Rising stress'], title: ['短期恐慌升温', 'Short-term stress is rising'], tone: 'stress', guidance: ['优先检查高波动持仓与集中风险，观察价格能否形成稳定结构。', 'Review volatile positions and concentration first, then watch for a more stable price structure.'] },
  persistent: { label: ['持续压力', 'Persistent stress'], title: ['压力仍在持续', 'Pressure persists'], tone: 'persistent', guidance: ['评估现有风险承受范围，关注重要价格位置与持续止跌迹象，避免把单日反弹视为趋势反转。', 'Review risk tolerance and key price levels. Look for sustained stabilization before interpreting a one-day bounce as a reversal.'] },
  recovery: { label: ['恐慌缓解', 'Easing stress'], title: ['恐慌缓解，观察价格', 'Stress is easing'], tone: 'recovery', guidance: ['情绪缓解与价格止跌分别确认。继续观察近期低点是否守住，再结合原定计划评估调整。', 'Easing sentiment and price stabilization are assessed separately. Watch whether recent lows hold and reassess within your existing plan.'] },
  mixed: { label: ['信号分歧', 'Mixed signals'], title: ['信号分歧，继续观察', 'Signals are mixed'], tone: 'muted', guidance: ['当前波动水平与期限结构未形成一致阶段。保留观察，结合价格变化与既定计划评估风险。', 'Volatility and the term structure do not identify a single phase. Monitor prices and assess risk within your existing plan.'] },
  unavailable: { label: ['暂不可判断', 'Unavailable'], title: ['数据待齐，暂不判断', 'Awaiting complete data'], tone: 'muted', guidance: ['等待同日收盘数据与所需历史齐全后再判断。缺失数据不计为 0，也不沿用旧阶段作为最新结论。', 'Wait for aligned closing data and sufficient history. Missing readings are not zero, and an earlier phase is not a current conclusion.'] },
};
const STAGE_IDS = ['calm', 'caution', 'stress', 'persistent', 'recovery'];
const RULES = [
  ['低波动', 'Low volatility', 'VIX < 16 · VIX / VIX3M < 0.90'],
  ['常态偏谨慎', 'Cautious', 'VIX 16–22 · 比率 0.90–1.00', 'VIX 16–22 · ratio 0.90–1.00'],
  ['恐慌升温', 'Rising stress', '最近 3 个完成交易日内，比率上穿 1.00 且 VIX 上穿 25', 'Ratio crosses above 1.00 and VIX above 25 within the last 3 completed sessions'],
  ['持续压力', 'Persistent stress', '比率 > 1.00，连续至少 15 个交易日', 'Ratio > 1.00 for at least 15 consecutive sessions'],
  ['恐慌缓解', 'Easing stress', '本轮曾 ≥ 1.10，随后连续 2 日 < 1.00；确认后观察 5 个交易日，重回 ≥ 1 则重置', 'Episode peak ≥ 1.10, then 2 closes below 1.00; a 5-session window starts on confirmation and resets at ≥ 1'],
];

const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pick = (values, en) => values[en ? 1 : 0];
const streak = (days, exact, en) => `${exact === false ? (en ? 'at least ' : '至少 ') : ''}${number(days, 0)}`;

function description(risk, en, loading, error, expectedDate) {
  if (!risk.ready) {
    if (loading && !risk.latest) return en ? 'Loading completed daily closes and term structure…' : '正在读取完成收盘数据与期限结构…';
    if (error) return en ? 'The refresh failed. Earlier history remains visible; the current phase is unavailable.' : '本次刷新失败，保留此前历史，当前风险阶段暂不判断。';
    if (risk.reason === 'stale' || risk.reason?.includes('stale')) return en ? `The latest completed session is not fully available${expectedDate ? ` (${expectedDate})` : ''}. The current phase is unavailable.` : `最近完成交易日${expectedDate ? `（${expectedDate}）` : ''}的数据尚未齐全，当前阶段暂不判断。`;
    return en ? 'Aligned VIX and VIX3M closes or sufficient continuous history are not yet available.' : '同日 VIX 与 VIX3M 收盘数据或所需连续历史尚未齐全。';
  }
  const latest = risk.latest;
  if (risk.phase === 'persistent') return en
    ? `The ratio has stayed above 1 for ${streak(risk.invertedDays, risk.facts?.invertedDaysExact, true)} sessions. VIX is ${number(latest?.vix)}; short-term pressure remains.`
    : `比率连续${streak(risk.invertedDays, risk.facts?.invertedDaysExact, false)} 个交易日高于 1。VIX ${number(latest?.vix)}，短期压力仍未解除。`;
  if (risk.phase === 'recovery') return en
    ? `The episode ratio peaked at ${number(risk.episodePeakRatio, 3)} and has now stayed below 1 for ${risk.ratioBelowDays} sessions.`
    : `本轮比率曾升至 ${number(risk.episodePeakRatio, 3)}，现已连续 ${risk.ratioBelowDays} 个交易日低于 1。`;
  const context = risk.phase === 'calm'
    ? ['近期波动预期低于三个月水平，市场压力较低。', 'Near-term volatility expectations are below the three-month level.']
    : risk.phase === 'stress'
      ? ['近期波动预期已高于三个月水平。', 'Near-term volatility expectations now exceed the three-month level.']
      : risk.phase === 'caution'
        ? ['短期压力有所上升，期限结构尚未倒挂。', 'Short-term pressure is rising, while the term structure is not inverted.']
        : ['波动水平与期限结构未同时满足同一阶段条件。', 'Volatility and the term structure do not meet the same phase conditions.'];
  return `${en ? 'VIX is' : 'VIX'} ${number(latest?.vix)}${en ? ' and the ratio is' : '，比率'} ${number(latest?.ratio, 3)}${en ? '. ' : '。'}${pick(context, en)}`;
}

function evidenceRows(risk, symbol, en) {
  if (!risk.ready) return [
    { label: en ? 'Paired closes' : '同日收盘', value: en ? 'Latest assessment unavailable' : '最新判断暂不可用', status: 'pending' },
    { label: en ? 'Continuous history' : '连续历史', value: risk.facts?.historyComplete ? (en ? 'History retained' : '保留已有历史') : (en ? 'Awaiting sufficient observations' : '等待所需连续记录'), status: 'neutral' },
    { label: en ? 'Risk phase' : '风险阶段', value: en ? 'No current conclusion' : '暂不输出当前结论', status: 'pending' },
  ];
  const price = risk.priceConfirmation;
  const priceValue = price?.status === 'confirmed'
    ? (en ? `${price.daysSinceLow} sessions without a new closing low` : `低点后 ${price.daysSinceLow} 日未创新收盘低点`)
    : price?.status === 'pending' && Number.isFinite(price.daysSinceLow)
      ? (en ? `${price.daysSinceLow} sessions since the low; awaiting confirmation` : `低点后 ${price.daysSinceLow} 日，等待确认`)
      : (en ? 'No complete confirmation window' : '暂无完整价格确认窗口');
  const first = risk.phase === 'stress'
    ? { label: en ? 'Stress acceleration' : '恐慌加速', value: en ? `VIX crossed 25 on ${risk.stressDates.vixCrossedAt}` : `VIX 于 ${risk.stressDates.vixCrossedAt} 上穿 25`, status: 'met' }
    : risk.phase === 'recovery'
    ? { label: en ? 'Episode peak' : '压力峰值', value: `${en ? 'Ratio' : '本轮比率最高'} ${number(risk.episodePeakRatio, 3)}`, status: 'met' }
    : { label: en ? 'Volatility level' : '波动水平', value: `VIX ${number(risk.latest?.vix)}`, status: risk.phase === 'mixed' ? 'neutral' : 'met' };
  const ratioText = risk.phase === 'recovery'
    ? (en ? `${risk.ratioBelowDays} closes below 1.00` : `连续 ${risk.ratioBelowDays} 日低于 1.00`)
    : risk.invertedDays > 0
      ? (en ? `${streak(risk.invertedDays, risk.facts?.invertedDaysExact, true)} closes above 1.00` : `连续${streak(risk.invertedDays, risk.facts?.invertedDaysExact, false)} 日高于 1.00`)
      : `${en ? 'Ratio' : '当前比率'} ${number(risk.latest?.ratio, 3)}`;
  return [first,
    { label: en ? 'Term structure' : '期限结构', value: ratioText, status: risk.phase === 'mixed' ? 'neutral' : 'met' },
    { label: `${symbol} ${en ? 'price' : '价格确认'}`, value: priceValue, status: price?.status === 'confirmed' ? 'met' : 'pending' },
  ];
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
  const stale = Boolean(data?.stale || (expectedAsOfDate && model.to && model.to < expectedAsOfDate));
  // Assessment always uses full histories; chart range and historical selection
  // affect presentation only. Failed refreshes must not expose a current phase.
  const risk = React.useMemo(() => buildVixRiskModel({
    termStructure: data?.termStructure,
    benchmarkRows: data?.series?.[symbol]?.rows,
    expectedAsOfDate,
    stale: stale || state.error,
  }), [data, symbol, stale, state.error, expectedAsOfDate]);
  const phaseId = risk.ready && PHASES[risk.phase] ? risk.phase : 'unavailable';
  const phase = PHASES[phaseId];
  const latest = risk.ready ? risk.latest : null;
  const partialHistory = model.hasComparison && data?.availableFromDate > model.requestedFrom
    && (new Date(`${data.availableFromDate}T00:00:00Z`) - new Date(`${model.requestedFrom}T00:00:00Z`)) > 7 * 86400000;
  const evidence = evidenceRows(risk, symbol, englishMode);
  const changeLabel = formatVixComparisonChangePercent(model.priceChangePct);

  return <main className={`vcr-page vcr-tone-${phase.tone}`} data-vix-comparison-page="true" data-vix-risk-phase={phaseId} aria-busy={state.loading}>
    <header className="vcr-header">
      <button type="button" aria-label={englishMode ? 'Back to Home' : '返回首页'} onClick={closeVixComparison}><ArrowLeft size={20} strokeWidth={1.6} /></button>
      <h1>{englishMode ? 'VIX & Market Trends' : 'VIX 与市场走势'}</h1>
      <button type="button" className="vcr-refresh" disabled={state.loading || Boolean(demoData)} aria-label={englishMode ? 'Refresh daily data' : '刷新日线数据'} onClick={() => setRefreshVersion(value => value + 1)}><RefreshCw size={16} strokeWidth={1.6} className={state.loading ? 'animate-spin' : ''} /></button>
    </header>
    {demoData && <div className="vcr-demo-label">{demoData.source === 'CBOE_EODHD_EOD'
      ? (englishMode ? 'Local verification · captured official closes' : '本地验收 · 官方收盘快照')
      : (englishMode ? 'Local preview · simulated data' : '本地效果预览 · 模拟数据')}</div>}
    {state.error && <div className="vcr-alert" role="alert"><span>{data ? (englishMode ? 'Refresh failed. Showing the previous data.' : '刷新失败，暂时保留上次数据。') : (englishMode ? 'Daily data could not be loaded.' : '日线数据暂时无法读取。')}</span><button type="button" onClick={() => setRefreshVersion(value => value + 1)}>{englishMode ? 'Retry' : '重试'}</button></div>}

    <section className="vcr-overview">
      <div className="vcr-eyebrow"><span>{englishMode ? 'MARKET ENVIRONMENT' : '市场风险观察'}</span><span>{risk.asOfDate?.replaceAll('-', '.') || '—'}<span className="vcr-date-dot">·</span>{risk.ready ? (englishMode ? 'Close' : '收盘') : (englishMode ? 'Pending' : '待齐')}</span></div>
      <div className="vcr-title-row"><h2>{pick(phase.title, englishMode)}</h2><span className="vcr-stage-icon"><ArrowUpRight size={23} strokeWidth={1.4} /></span></div>
      <p className="vcr-description">{description(risk, englishMode, state.loading, state.error, expectedAsOfDate)}</p>
      {risk.ready && Number.isFinite(risk.duration) && <div className="vcr-phase-duration">{englishMode ? `${pick(phase.label, true)} · ${risk.duration} completed sessions` : `${pick(phase.label, false)} · 阶段持续 ${risk.duration} 个交易日`}</div>}
      <div className="vcr-stage-track" aria-label={englishMode ? 'Risk phase' : '风险阶段'}>{STAGE_IDS.map(id => <div key={id} className={id === phaseId ? 'active' : ''}><i /><span>{pick(PHASES[id].label, englishMode)}</span></div>)}</div>
      <div className="vcr-metrics">
        <div><span>VIX</span><strong>{number(latest?.vix)}</strong><small>{englishMode ? '30-day volatility' : '30 天预期波动'}</small></div>
        <div><span>VIX3M</span><strong>{number(latest?.vix3m)}</strong><small>{englishMode ? '3-month volatility' : '3 个月预期波动'}</small></div>
        <div className="vcr-ratio-metric"><span>{englishMode ? 'Term ratio' : '期限比率'}</span><strong>{number(latest?.ratio, 3)}</strong><small>VIX / VIX3M</small></div>
      </div>
      <div className="vcr-guidance"><span className="vcr-guidance-line" /><div><span className="vcr-guidance-label">{englishMode ? 'WHAT TO WATCH' : '当前关注'}</span><p>{pick(phase.guidance, englishMode)}</p></div></div>
    </section>

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
      {stale && data?.expectedAsOfDate && <p className="vcr-chart-stale">{englishMode ? `Latest expected trading date: ${expectedAsOfDate}.` : `最近应有交易日：${expectedAsOfDate}。`}</p>}
      {data?.termStructure?.stale && !stale && <p className="vcr-chart-stale">{englishMode ? 'Term structure update pending; the current phase is unavailable.' : '期限结构数据待更新，当前风险阶段暂不可判断。'}</p>}
    </section>

    <section className="vcr-evidence"><div className="vcr-section-heading"><h3>{englishMode ? 'Why this phase' : '判断依据'}</h3><span>{englishMode ? 'Completed closes' : '按完成收盘确认'}</span></div>{evidence.map((item, index) => <div className="vcr-evidence-row" key={index}><span className={`vcr-evidence-icon vcr-evidence-${item.status}`}>{item.status === 'met' ? <Check size={13} /> : item.status === 'pending' ? <Circle size={11} /> : <Minus size={12} />}</span><span>{item.label}</span><strong>{item.value}</strong></div>)}</section>
    <details className="vcr-rules"><summary><span><Circle size={13} />{englishMode ? 'How phases are defined' : '如何判断风险阶段'}</span><ChevronDown size={14} /></summary><div>{RULES.map((rule, index) => <p key={rule[0]}><strong>{String(index + 1).padStart(2, '0')} · {englishMode ? rule[1] : rule[0]}</strong><span>{englishMode ? rule[3] || rule[2] : rule[2]}</span></p>)}<p><strong>{englishMode ? 'Price confirmation' : '价格单独确认'}</strong><span>{englishMode ? 'After the stress-episode closing low: at least 3 sessions without a new low, with the latest close above the previous close.' : '本轮压力期最低收盘之后，至少 3 个交易日未创新低，且最新收盘高于前一日。'}</span></p><p className="vcr-rule-note">{englishMode ? 'Observation rules, not a historically validated forecast. Mixed conditions stay unclassified. Missing sessions interrupt consecutive-day counts.' : '观察规则尚未经历史回测验证。条件不一致时保留信号分歧；数据缺口会中断连续日计数。'}</p></div></details>
    <p className="vcr-source-note">{englishMode ? 'VIX / VIX3M: Cboe · SPY / QQQ: EODHD · Daily closes' : 'VIX / VIX3M：Cboe · SPY / QQQ：EODHD · 日线收盘'}</p>
    <p className="vcr-footnote">{englishMode ? 'For risk awareness. A phase alone does not determine a trade.' : '用于观察风险与仓位环境，不作为单一买卖条件。'}</p>
  </main>;
}
