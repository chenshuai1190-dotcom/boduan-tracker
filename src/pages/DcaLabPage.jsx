import React from 'react';
import { MARKET_RED_HEX, MARKET_GREEN_HEX, marketTextClass, marketTextHexColor } from '../lib/marketColorMode.js';
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { buildDcaModel } from '../lib/dcaLabModel.js';
import { createDcaMoneyFormatter, dcaAmountDraft, dcaAmountInput, normalizeDcaPlanUsd } from '../lib/dcaCurrency.js';
import { investmentPrincipalUsd, resolveInvestmentDisplayRate } from '../lib/investmentComparisonCurrency.js';
import DcaSymbolPicker from '../components/DcaSymbolPicker.jsx';
import { loadDcaHistory } from '../lib/dcaHistory.js';
import { getInvestmentComparisonExpectedCloseDate, searchInvestmentSymbols } from '../lib/investmentComparison.js';
import '../components/InvestmentComparison.css';
import '../components/DcaLab.css';

const DEFAULT_PLAN = { symbol: 'QQQ', startYear: 2020, endYear: Number(getInvestmentComparisonExpectedCloseDate(Date.now()).slice(0, 4)), initial: 10000, amount: 10000, frequency: 'monthly' };
const pct = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '—';
const tone = (value, marketColorMode) => Number.isFinite(value) && value !== 0 ? marketTextClass(value, marketColorMode) : '';
const frequencyLabel = value => value === 'monthly' ? '每月' : '每周';

function DcaChart({ rows, index, compare, onSelect, onClear, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', usdRate }) {
  const { money, assetMoney, short } = createDcaMoneyFormatter(displayCurrency, usdRate);
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(360);
  const chartId = React.useId().replace(/:/g, '');
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const height = 318, left = 43, right = width - 14, top = 24, bottom = height - 31;
  const active = rows[index];
  const max = Math.max(...rows.map(row => Math.max(row.value, row.invested, compare ? row.lumpValue : 0))) * 1.1;
  const x = i => left + i / Math.max(1, rows.length - 1) * (right - left);
  const y = value => bottom - value / max * (bottom - top);
  const visible = rows.slice(0, index + 1);
  const path = key => visible.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' ');
  const ahead = active.value >= active.lumpValue;
  const color = compare ? (ahead ? MARKET_RED_HEX : MARKET_GREEN_HEX) : marketTextHexColor(active.profit, marketColorMode);
  const other = ahead ? MARKET_GREEN_HEX : MARKET_RED_HEX;
  const handlePointer = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSelect(Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - left) / (right - left))) * (rows.length - 1)));
  };
  return <div className="dl-chart" ref={ref}>
    <svg viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={`定投模拟资产走势，${rows[0].date}至${active.date}，当前资产${assetMoney(active.value)}，累计投入${money(active.invested)}`}>
      <defs><linearGradient id={`dl-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <text x={left} y="12" className="dl-axis">{displayCurrency}</text>
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} className="dl-grid" /><text x={left - 8} y={y(max * fraction) + 4} textAnchor="end" className="dl-axis">{short(max * fraction)}</text></g>)}
      <path d={`${path('value')} L${x(index)},${bottom} L${left},${bottom} Z`} fill={`url(#dl-fill-${chartId})`} />
      <path d={path('invested')} stroke="#77818f" strokeDasharray="4 5" fill="none" strokeWidth="1.3" />
      {compare && <path d={path('lumpValue')} stroke={other} fill="none" strokeWidth="1.8" />}
      <path d={path('value')} stroke={color} fill="none" strokeWidth="2.2" strokeLinejoin="round" />
      <line x1={x(index)} x2={x(index)} y1={top} y2={bottom} stroke="#667181" strokeDasharray="3 5" opacity=".6" />
      <circle cx={x(index)} cy={y(active.value)} r="4" fill={color} />
      {compare && <circle cx={x(index)} cy={y(active.lumpValue)} r="3" fill={other} />}
      {[0, Math.round((rows.length - 1) / 2), rows.length - 1].map((i, tick) => <text key={i} x={x(i)} y={height - 7} textAnchor={tick === 0 ? 'start' : tick === 2 ? 'end' : 'middle'} className="dl-axis">{rows[i].date.slice(0, 7)}</text>)}
      <rect x="0" y="0" width={width} height={height} fill="transparent" onPointerDown={handlePointer} onPointerMove={event => { if (event.buttons === 1) handlePointer(event); }} style={{ touchAction: 'pan-y' }} />
    </svg>
    <div className="dl-selected"><span>{active.date}</span><button type="button" onClick={onClear} disabled={index === rows.length - 1}>回到期末</button></div>
  </div>;
}

function PlanEditor({ plan, maxYear, onApply, onCancel, displayCurrency, usdRate }) {
  const [draft, setDraft] = React.useState(() => ({
    ...plan,
    initial: dcaAmountDraft(plan.initial, plan.inputCurrency ?? 'USD', plan.inputRate ?? (plan.inputCurrency === 'CNY' ? null : 1)),
    amount: dcaAmountDraft(plan.amount, plan.inputCurrency ?? 'USD', plan.inputRate ?? (plan.inputCurrency === 'CNY' ? null : 1)),
  }));
  const displayRate = resolveInvestmentDisplayRate(displayCurrency, usdRate);
  const cnyRate = resolveInvestmentDisplayRate('CNY', usdRate);
  React.useEffect(() => {
    if (cnyRate === null) return;
    setDraft(current => {
      const resolve = value => value.currency === 'CNY' && value.rate === null ? { ...value, rate: cnyRate } : value;
      const initial = resolve(current.initial), amount = resolve(current.amount);
      return initial === current.initial && amount === current.amount ? current : { ...current, initial, amount };
    });
  }, [cnyRate]);
  const [error, setError] = React.useState('');
  const change = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setError(''); };
  const submit = event => {
    event.preventDefault();
    if (['initial', 'amount'].some(key => draft[key].text.trim() === '')) { setError('请填写投入金额；不投入可填 0。'); return; }
    const parsed = { ...draft, startYear: Number(draft.startYear), endYear: Number(draft.endYear), initial: investmentPrincipalUsd(draft.initial), amount: investmentPrincipalUsd(draft.amount), inputCurrency: 'USD', inputRate: 1 };
    if (parsed.startYear > parsed.endYear) { setError('开始年份不能晚于结束年份。'); return; }
    if (![parsed.initial, parsed.amount].every(value => Number.isFinite(value) && value >= 0 && value <= 100000000) || parsed.initial + parsed.amount <= 0) { setError('金额须为有效的非负数字且不超过等值 1 亿美元，至少有一项投入。'); return; }
    onApply(parsed);
  };
  return <form className="dl-editor" onSubmit={submit}>
    <div className="dl-form-grid">
      <label className="ic-field">开始年份<select value={draft.startYear} onChange={event => change('startYear', event.target.value)}>{Array.from({ length: maxYear - 1999 }, (_, i) => 2000 + i).map(year => <option key={year} value={year}>{year} 年</option>)}</select></label>
      <label className="ic-field">结束年份<select value={draft.endYear} onChange={event => change('endYear', event.target.value)}>{Array.from({ length: maxYear - 1999 }, (_, i) => 2000 + i).map(year => <option key={year} value={year}>{year} 年</option>)}</select></label>
      <label className="ic-field">起始投入 · {displayCurrency}<input inputMode="decimal" type="number" min="0" max={displayRate === null ? undefined : 100000000 * displayRate} disabled={displayRate === null} step="any" value={dcaAmountInput(draft.initial, displayCurrency, usdRate)} onChange={event => change('initial', { text: event.target.value, currency: displayCurrency, rate: displayRate })} /></label>
      <label className="ic-field">每次投入 · {displayCurrency}<input inputMode="decimal" type="number" min="0" max={displayRate === null ? undefined : 100000000 * displayRate} disabled={displayRate === null} step="any" value={dcaAmountInput(draft.amount, displayCurrency, usdRate)} onChange={event => change('amount', { text: event.target.value, currency: displayCurrency, rate: displayRate })} /></label>
    </div>
    <label className="dl-frequency">投入频率<select aria-label="投入频率" value={draft.frequency} onChange={event => change('frequency', event.target.value)}><option value="monthly">每月 · 首个交易日</option><option value="weekly">每周 · 首个交易日</option></select></label>
    {error && <p className="dl-error" role="alert">{error}</p>}
    <div className="dl-form-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit" disabled={displayRate === null}>更新实验<ArrowUpRight size={15} /></button></div>
  </form>;
}

function DcaComparisonValues({ value, lumpValue, returnPct, lumpReturnPct, advantage, profit, lumpProfit, annual = false, marketColorMode, colors = [], displayCurrency = 'USD', usdRate }) {
  const { headlineMoney, signed, assetMoney, displayRate } = createDcaMoneyFormatter(displayCurrency, usdRate);
  const comparable = Number.isFinite(advantage) && displayRate !== null;
  const tied = comparable && Math.abs(advantage * displayRate) < .005;
  return <>
    <div className="dl-comparison-grid">
      {[
        { label: '定投', value, returnPct, profit },
        { label: '一次投入', value: lumpValue, returnPct: lumpReturnPct, profit: lumpProfit },
      ].map((item, index) => <div className="dl-comparison-side" key={item.label}>
        <span className="dl-comparison-label">{item.label}{annual ? '期末资产' : ''}</span>
        <strong className="dl-comparison-asset" style={colors[index] ? { color: colors[index] } : undefined}>{headlineMoney(item.value)}</strong>
        <div className="dl-comparison-return"><b className={tone(item.returnPct, marketColorMode)}>{pct(item.returnPct)}</b><span>累计收益率</span></div>
        {annual && <div className="dl-annual-profit"><span>本年盈亏</span><b className={tone(item.profit, marketColorMode)}>{signed(item.profit)}</b></div>}
      </div>)}
    </div>
    <div className="dl-compare-conclusion">
      <span>{!comparable ? '领先金额' : tied ? '两种方案持平' : advantage > 0 ? '定投领先一次投入' : '一次投入领先定投'}</span>
      {!tied && <strong className={comparable ? tone(1, marketColorMode) : ''}>{assetMoney(Math.abs(advantage))}</strong>}
    </div>
  </>;
}

export function DcaLabResults({ model, plan, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', usdRate }) {
  const { money, headlineMoney, signed } = createDcaMoneyFormatter(displayCurrency, usdRate);
  const [compare, setCompare] = React.useState(false);
  const [index, setIndex] = React.useState(null);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(.2);
  const cursor = index === null ? model.rows.length - 1 : Math.min(index, model.rows.length - 1);
  const row = model.rows[cursor];
  const summary = model.summary;
  React.useEffect(() => {
    if (!playing) return undefined;
    let previous = null, accrued = 0, frame;
    const tick = time => {
      if (previous !== null) accrued += Math.min(time - previous, 100) / 1000 * 60 * speed;
      previous = time;
      if (accrued >= 1) {
        const steps = Math.floor(accrued); accrued -= steps;
        setIndex(current => Math.min((current ?? 0) + steps, model.rows.length - 1));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, model]);
  React.useEffect(() => { if (index === model.rows.length - 1) setPlaying(false); }, [index, model.rows.length]);
  const togglePlay = () => { if (!playing && cursor === model.rows.length - 1) setIndex(0); setPlaying(value => !value); };
  const colors = compare ? [row.value >= row.lumpValue ? MARKET_RED_HEX : MARKET_GREEN_HEX, row.value >= row.lumpValue ? MARKET_GREEN_HEX : MARKET_RED_HEX] : [marketTextHexColor(row.profit, marketColorMode), '#77818f'];
  return <>
      <section className="dl-hero" aria-label="模拟结果">
        <div className="dl-hero-label"><span className="dl-hero-date">{cursor === model.rows.length - 1 ? '期末定投资产' : '当时定投资产'}<time dateTime={row.date}>{row.date}</time></span><span>{plan.symbol} · {displayCurrency}</span></div>
        <div className="dl-total">{headlineMoney(row.value)}</div>
        <div className={`dl-profit ${tone(row.profit, marketColorMode)}`}><span>累计收益 {signed(row.profit)}</span><span>{pct(row.returnPct)}</span></div>
        <div className="dl-hero-bottom"><div><span>累计投入</span><strong>{money(row.invested)}</strong></div><div><span>已定投</span><strong>{model.purchases.filter(purchase => purchase.date <= row.date).length}<small> 次</small></strong></div><div><span>复权成本</span><strong>{money(row.shares > 0 ? row.invested / row.shares : NaN)}</strong></div></div>
      </section>
      <div className="dl-mode" role="group" aria-label="图表视图"><button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>投入与收益</button><button type="button" aria-pressed={compare} onClick={() => setCompare(true)}>对比一次投入</button></div>
      <div className="dl-legend"><span><i style={{ background: colors[0] }} />定投资产</span>{compare && <span><i style={{ background: colors[1] }} />一次投入</span>}<span><i className="dl-dash" />累计投入</span></div>
      {compare && <div className="dl-chart-comparison"><DcaComparisonValues {...row} marketColorMode={marketColorMode} colors={colors} displayCurrency={displayCurrency} usdRate={usdRate} /></div>}
      <DcaChart rows={model.rows} index={cursor} compare={compare} marketColorMode={marketColorMode} displayCurrency={displayCurrency} usdRate={usdRate} onSelect={setIndex} onClear={() => setIndex(model.rows.length - 1)} />
      <div className="dl-playback"><input type="range" aria-label="查看模拟日期" min="0" max={model.rows.length - 1} value={cursor} onChange={event => setIndex(Number(event.target.value))} /><div className="dl-player"><button type="button" className="dl-restart" aria-label="回到起点" onClick={() => setIndex(0)}><RotateCcw size={18} /></button><button type="button" className="dl-play" onClick={togglePlay}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}{playing ? '暂停回放' : '回放定投过程'}</button><select aria-label="回放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[.1, .2, .4, .8, 1].map(value => <option key={value} value={value}>{value}×</option>)}</select></div></div>
      <section className="dl-comparison" aria-label="同等本金比较">
        <div className="dl-section-heading"><h2>期末对比</h2><span>{model.endDate}</span></div>
        <DcaComparisonValues {...summary} marketColorMode={marketColorMode} displayCurrency={displayCurrency} usdRate={usdRate} />
        <p>同等最终本金 {money(summary.invested)}；一次投入假设首日已有全部资金，资金到位时间不同。</p>
      </section>
      <section className="dl-details" aria-label="年度结果">
        <div className="dl-section-heading"><h2>年度结果</h2><span>{displayCurrency}</span></div>
        <p className="dl-annual-basis">一次投入本金 {money(summary.invested)} · 首日投入</p>
        {[...model.years].reverse().map(year => <article className="dl-year" key={year.year} aria-label={`${year.year} 年度对比`}>
          <header><h3>{year.year}</h3><time dateTime={year.throughDate}>{year.partial ? '截至' : '年末'} {year.throughDate}</time></header>
          <DcaComparisonValues {...year} annual marketColorMode={marketColorMode} displayCurrency={displayCurrency} usdRate={usdRate} />
          <p className="dl-year-capital">定投本年投入 {money(year.contribution)}<span>累计投入 {money(year.invested)}</span></p>
        </article>)}
        <p className="dl-table-unit">收益率为截至各年末的累计收益率，非当年收益率。年度盈亏已扣除本年新增投入；一次投入始终按首日投入全期本金计算。</p>
      </section>
      <details className="dl-method"><summary>实验口径<ChevronRight size={15} /></summary><p>使用 EODHD 真实历史日线复权收盘价，包含拆股、分红调整。复权份额仅用于回测试算，不代表当时实际买入股数；历史结果不代表未来收益。</p><p>按周期内首个有行情的交易日收盘价投入，节假日顺延；起始投入与首笔定投同日发生。不计税费和现金利息；人民币金额按系统当前汇率换算，不计历史汇率收益。</p><p>累计收益＝资产总额－累计投入，不包含本金；收益率＝累计收益÷累计投入，非年化收益率。一次投入与定投只保证期末累计本金相同，不代表相同现金流条件。</p></details>
      <p className="dl-footer">独立试算 · 不读取持仓 · 不产生交易</p>
  </>;
}

export default function DcaLabPage({ ctx = {}, previewSource = null }) {
  const { userId = '', closeDcaLab, marketColorMode = 'redUpGreenDown', usdRate } = ctx;
  const [plan, setPlan] = React.useState(() => ({ ...DEFAULT_PLAN, inputCurrency: 'CNY', inputRate: resolveInvestmentDisplayRate('CNY', usdRate) }));
  const [editing, setEditing] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const [state, setState] = React.useState({ key: '', data: null, loading: true, error: '' });
  const [displayCurrency, setDisplayCurrency] = React.useState('CNY');
  const cnyRate = resolveInvestmentDisplayRate('CNY', usdRate);
  const displayRate = resolveInvestmentDisplayRate(displayCurrency, usdRate);
  const usdPlan = React.useMemo(() => normalizeDcaPlanUsd(plan), [plan]);
  const { money } = createDcaMoneyFormatter(displayCurrency, usdRate);
  const planMoney = key => usdPlan ? money(usdPlan[key])
    : displayCurrency === 'CNY' && plan.inputCurrency === 'CNY' && Number.isFinite(plan[key])
      ? `¥${plan[key].toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
  React.useEffect(() => {
    if (cnyRate === null) return;
    // Pin unresolved initial CNY inputs once. Later rates only change display.
    setPlan(current => current.inputCurrency === 'CNY' && current.inputRate === null ? { ...current, inputRate: cnyRate } : current);
  }, [cnyRate]);
  const requestRef = React.useRef(0);
  const source = import.meta.env.DEV && previewSource?.load ? previewSource.load : loadDcaHistory;
  const searchSource = import.meta.env.DEV && previewSource?.search ? previewSource.search : searchInvestmentSymbols;
  const key = `${userId}:${plan.symbol}`;
  React.useEffect(() => {
    const sequence = ++requestRef.current;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: '' });
    Promise.resolve().then(() => source({ userId, symbol: plan.symbol, force: refresh > 0, signal: controller.signal }))
      .then(data => {
        if (sequence === requestRef.current && !controller.signal.aborted) setState({ key, data, loading: false, error: '' });
      })
      .catch(() => {
        if (sequence === requestRef.current && !controller.signal.aborted) setState({ key, data: null, loading: false, error: '暂时无法读取历史行情，请稍后重试。' });
      });
    return () => { requestRef.current += 1; controller.abort(); };
  }, [key, userId, plan.symbol, refresh, source]);
  const data = state.key === key ? state.data : null;
  const result = React.useMemo(() => {
    if (!data || !usdPlan) return { model: null, error: '' };
    try { return { model: buildDcaModel({ data, plan: usdPlan }), error: '' }; }
    catch { return { model: null, error: '所选区间没有足够、连续的有效历史行情，请调整年份或更换标的。' }; }
  }, [data, usdPlan]);
  const maxYear = data?.expectedAsOfDate ? Number(data.expectedAsOfDate.slice(0, 4)) : new Date().getUTCFullYear();
  const apply = next => {
    if (next.symbol !== plan.symbol) setRefresh(0);
    setPlan(next);
    setEditing(false);
  };
  const loading = state.key !== key || state.loading;
  return <main className="investment-comparison ic-page dca-lab">
    <header className="ic-header"><button type="button" className="ic-icon-button ic-back" onClick={closeDcaLab} aria-label="返回交易"><ArrowLeft size={21} /></button><div><h1>定投实验室</h1><p>把时间变成投资的一部分</p></div><label className="ic-currency-control"><select value={displayCurrency} aria-label="显示币种" onChange={event => { const next = event.target.value; if (resolveInvestmentDisplayRate(next, usdRate) !== null) setDisplayCurrency(next); }}><option value="USD">USD</option><option value="CNY" disabled={cnyRate === null}>CNY</option></select><ChevronDown size={13} aria-hidden="true" /></label></header>
    <section className="dl-plan" aria-label="定投方案">
      <div className="dl-plan-top"><DcaSymbolPicker value={plan.symbol} userId={userId} englishMode={ctx.englishMode ?? (ctx.language === 'en')} searchSource={searchSource} onChange={symbol => apply({ ...plan, symbol })} /><button className="dl-edit-button" aria-label="调整定投计划" type="button" aria-expanded={editing} onClick={() => setEditing(value => !value)}><SlidersHorizontal size={16} /><span>调整计划</span></button></div>
      <div className="dl-plan-summary"><span><CalendarDays size={13} />{plan.startYear} — {plan.endYear}</span><span>{frequencyLabel(plan.frequency)} {planMoney('amount')}</span><span>起投 {planMoney('initial')}</span></div>
      {editing && <PlanEditor plan={plan} maxYear={maxYear} displayCurrency={displayCurrency} usdRate={usdRate} onApply={apply} onCancel={() => setEditing(false)} />}
    </section>
    {!usdPlan ? <p className="dl-data-note" role="status">等待汇率，投入金额保留为人民币。</p> : displayRate === null && <p className="dl-data-note" role="status">人民币换算暂不可用，请切换 USD。</p>}
    {loading && <p className="dl-status" role="status">正在读取 {plan.symbol} 真实历史行情…</p>}
    {!loading && (state.error || result.error) && <div className="dl-status" role="alert"><p>{state.error || result.error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>重试行情</button></div>}
    {!loading && result.model && <>
      {data.stale && <p className="dl-data-note" role="status">行情暂截至 {data.asOfDate}，最新应为 {data.expectedAsOfDate}。<button type="button" onClick={() => setRefresh(value => value + 1)}>刷新数据</button></p>}
      {result.model.period.startAdjusted && <p className="dl-data-note">可用历史始于 {result.model.startDate}，已从该交易日开始计算。</p>}
      <DcaLabResults key={`${key}:${JSON.stringify(usdPlan)}:${data.asOfDate}`} model={result.model} plan={usdPlan} marketColorMode={marketColorMode} displayCurrency={displayCurrency} usdRate={usdRate} />
    </>}
  </main>;
}
