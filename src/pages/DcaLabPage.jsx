import React from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, FlaskConical, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { DCA_SYMBOLS, buildDcaModel } from '../lib/dcaLabModel.js';
import { loadDcaHistory } from '../lib/dcaHistory.js';
import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';
import '../components/InvestmentComparison.css';
import '../components/DcaLab.css';

const DEFAULT_PLAN = { symbol: 'QQQ', startYear: 2020, endYear: Number(getInvestmentComparisonExpectedCloseDate(Date.now()).slice(0, 4)), initial: 10000, amount: 1000, frequency: 'monthly' };
const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
const short = value => Math.abs(value) >= 100000000 ? `${(value / 100000000).toFixed(2)}亿` : Math.abs(value) >= 10000 ? `${(value / 10000).toFixed(1)}万` : Math.round(value).toLocaleString('en-US');
const headlineMoney = value => Math.abs(value) >= 10000000 ? `$${short(value)}` : money(value);
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
const pct = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const tone = value => value > 0 ? 'dl-up' : value < 0 ? 'dl-down' : '';
const frequencyLabel = value => value === 'monthly' ? '每月' : '每周';

function DcaChart({ rows, index, compare, onSelect, onClear }) {
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
  const color = compare ? (ahead ? '#ff655e' : '#4fd0a1') : (active.profit >= 0 ? '#ff655e' : '#4fd0a1');
  const other = ahead ? '#4fd0a1' : '#ff655e';
  const handlePointer = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSelect(Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - left) / (right - left))) * (rows.length - 1)));
  };
  return <div className="dl-chart" ref={ref}>
    <svg viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={`定投模拟资产走势，${rows[0].date}至${active.date}，当前资产${money(active.value)}，累计投入${money(active.invested)}`}>
      <defs><linearGradient id={`dl-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <text x={left} y="12" className="dl-axis">USD</text>
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

function PlanEditor({ plan, maxYear, onApply, onCancel }) {
  const [draft, setDraft] = React.useState(plan);
  const [error, setError] = React.useState('');
  const change = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setError(''); };
  const submit = event => {
    event.preventDefault();
    if (['initial', 'amount'].some(key => String(draft[key]).trim() === '')) { setError('请填写投入金额；不投入可填 0。'); return; }
    const parsed = { ...draft, startYear: Number(draft.startYear), endYear: Number(draft.endYear), initial: Number(draft.initial), amount: Number(draft.amount) };
    if (parsed.startYear > parsed.endYear) { setError('开始年份不能晚于结束年份。'); return; }
    if (![parsed.initial, parsed.amount].every(value => Number.isFinite(value) && value >= 0 && value <= 100000000) || parsed.initial + parsed.amount <= 0) { setError('金额须为 0 至 1 亿之间的数字，且至少有一项投入。'); return; }
    onApply(parsed);
  };
  return <form className="dl-editor" onSubmit={submit}>
    <div className="dl-form-grid">
      <label className="ic-field">开始年份<select value={draft.startYear} onChange={event => change('startYear', event.target.value)}>{Array.from({ length: maxYear - 1999 }, (_, i) => 2000 + i).map(year => <option key={year} value={year}>{year} 年</option>)}</select></label>
      <label className="ic-field">结束年份<select value={draft.endYear} onChange={event => change('endYear', event.target.value)}>{Array.from({ length: maxYear - 1999 }, (_, i) => 2000 + i).map(year => <option key={year} value={year}>{year} 年</option>)}</select></label>
      <label className="ic-field">起始投入 · USD<input inputMode="decimal" type="number" min="0" max="100000000" step="any" value={draft.initial} onChange={event => change('initial', event.target.value)} /></label>
      <label className="ic-field">每次投入 · USD<input inputMode="decimal" type="number" min="0" max="100000000" step="any" value={draft.amount} onChange={event => change('amount', event.target.value)} /></label>
    </div>
    <label className="dl-frequency">投入频率<select aria-label="投入频率" value={draft.frequency} onChange={event => change('frequency', event.target.value)}><option value="monthly">每月 · 首个交易日</option><option value="weekly">每周 · 首个交易日</option></select></label>
    {error && <p className="dl-error" role="alert">{error}</p>}
    <div className="dl-form-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">更新实验<ArrowUpRight size={15} /></button></div>
  </form>;
}

export function DcaLabResults({ model, plan }) {
  const [compare, setCompare] = React.useState(false);
  const [index, setIndex] = React.useState(null);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(.2);
  const [records, setRecords] = React.useState(false);
  const [expandedRecords, setExpandedRecords] = React.useState(false);
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
  const lead = summary.advantage >= 0;
  const colors = compare ? [row.value >= row.lumpValue ? '#ff655e' : '#4fd0a1', row.value >= row.lumpValue ? '#4fd0a1' : '#ff655e'] : [row.profit >= 0 ? '#ff655e' : '#4fd0a1', '#77818f'];
  return <>
      <section className="dl-hero" aria-label="模拟结果">
        <div className="dl-hero-label"><span className="dl-hero-date">{cursor === model.rows.length - 1 ? '期末定投资产' : '当时定投资产'}<time dateTime={row.date}>{row.date}</time></span><span>{plan.symbol} · USD</span></div>
        <div className="dl-total">{headlineMoney(row.value)}</div>
        <div className={`dl-profit ${tone(row.profit)}`}><span>累计收益 {signed(row.profit)}</span><span>{pct(row.returnPct)}</span></div>
        <div className="dl-hero-bottom"><div><span>累计投入</span><strong>{money(row.invested)}</strong></div><div><span>已定投</span><strong>{model.purchases.filter(purchase => purchase.date <= row.date).length}<small> 次</small></strong></div><div><span>复权成本</span><strong>{money(row.shares > 0 ? row.invested / row.shares : NaN)}</strong></div></div>
      </section>
      <div className="dl-mode" role="group" aria-label="图表视图"><button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>投入与收益</button><button type="button" aria-pressed={compare} onClick={() => setCompare(true)}>对比一次投入</button></div>
      <div className="dl-legend"><span><i style={{ background: colors[0] }} />定投资产</span>{compare && <span><i style={{ background: colors[1] }} />一次投入</span>}<span><i className="dl-dash" />累计投入</span></div>
      {compare && <div className="dl-chart-comparison"><span>定投 <b style={{ color: colors[0] }}>{money(row.value)}</b></span><span>一次投入 <b style={{ color: colors[1] }}>{money(row.lumpValue)}</b></span></div>}
      <DcaChart rows={model.rows} index={cursor} compare={compare} onSelect={setIndex} onClear={() => setIndex(model.rows.length - 1)} />
      <div className="dl-playback"><input type="range" aria-label="查看模拟日期" min="0" max={model.rows.length - 1} value={cursor} onChange={event => setIndex(Number(event.target.value))} /><div className="dl-player"><button type="button" className="dl-restart" aria-label="回到起点" onClick={() => setIndex(0)}><RotateCcw size={18} /></button><button type="button" className="dl-play" onClick={togglePlay}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}{playing ? '暂停回放' : '回放定投过程'}</button><select aria-label="回放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[.1, .2, .4, .8, 1].map(value => <option key={value} value={value}>{value}×</option>)}</select></div></div>
      <section className="dl-comparison" aria-label="同等本金比较"><div className="dl-section-heading"><h2>分批投入，结果有什么不同？</h2><ArrowUpRight size={17} aria-hidden="true" /></div><div className="dl-compare-row"><span>定投期末资产</span><strong className={lead ? 'dl-up' : 'dl-down'}>{money(summary.value)}</strong></div><div className="dl-compare-row"><span>一次投入期末资产</span><strong className={lead ? 'dl-down' : 'dl-up'}>{money(summary.lumpValue)}</strong></div><div className="dl-compare-conclusion">本次模拟，定投{lead ? '多' : '少'}获得 <strong className={tone(summary.advantage)}>{money(Math.abs(summary.advantage))}</strong></div><p>同等最终本金 {money(summary.invested)}；一次投入假设首日已有全部资金，资金到位时间不同。</p></section>
      <section className="dl-details" aria-label="定投明细"><div className="dl-detail-tabs" role="group" aria-label="明细视图"><button aria-pressed={!records} type="button" onClick={() => setRecords(false)}>年度结果</button><button aria-pressed={records} type="button" onClick={() => setRecords(true)}>每笔定投 <span>{model.purchases.length}</span></button></div>
        {!records ? <table><thead><tr><th>年份</th><th>本年投入</th><th>本年盈亏</th><th>期末资产</th></tr></thead><tbody>{[...model.years].reverse().map(year => <tr key={year.year}><th>{year.year}{year.partial && <small className="dl-partial">截至 {year.throughDate.slice(5)}</small>}</th><td>{short(year.contribution)}</td><td className={tone(year.profit)}>{year.profit > 0 ? '+' : ''}{short(year.profit)}</td><td>{short(year.value)}</td></tr>)}</tbody></table> : <><table><thead><tr><th>日期</th><th>投入金额</th><th>复权价</th><th>复权份额</th></tr></thead><tbody>{[...model.purchases].reverse().slice(0, expandedRecords ? undefined : 8).map(purchase => <tr key={purchase.date}><th>{purchase.date.slice(2)}</th><td>{short(purchase.amount)}</td><td>{purchase.price.toFixed(2)}</td><td>{purchase.shares.toFixed(2)}</td></tr>)}</tbody></table>{model.purchases.length > 8 && <button type="button" className="dl-more" onClick={() => setExpandedRecords(value => !value)}>{expandedRecords ? '收起记录' : `展开全部 ${model.purchases.length} 笔`}<ChevronDown size={14} /></button>}</>}
        <p className="dl-table-unit">{records ? '金额、复权价格单位：USD · 复权份额非实际持股数' : '金额单位：USD · 年度盈亏已扣除本年新增投入'}</p>
      </section>
      <details className="dl-method"><summary>实验口径<ChevronRight size={15} /></summary><p>使用 EODHD 真实历史日线复权收盘价，包含拆股、分红调整。复权份额仅用于回测试算，不代表当时实际买入股数；历史结果不代表未来收益。</p><p>按周期内首个有行情的交易日收盘价投入，节假日顺延；起始投入与首笔定投同日发生。不计税费、现金利息和汇率变化。</p><p>累计收益＝资产总额－累计投入，不包含本金；收益率＝累计收益÷累计投入，非年化收益率。一次投入与定投只保证期末累计本金相同，不代表相同现金流条件。</p></details>
      <p className="dl-footer">独立试算 · 不读取持仓 · 不产生交易</p>
  </>;
}

export default function DcaLabPage({ ctx = {}, previewSource = null }) {
  const { userId = '', closeDcaLab } = ctx;
  const [plan, setPlan] = React.useState(DEFAULT_PLAN);
  const [editing, setEditing] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const [state, setState] = React.useState({ key: '', data: null, loading: true, error: '' });
  const requestRef = React.useRef(0);
  const source = import.meta.env.DEV && previewSource?.load ? previewSource.load : loadDcaHistory;
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
    if (!data) return { model: null, error: '' };
    try { return { model: buildDcaModel({ data, plan }), error: '' }; }
    catch { return { model: null, error: '所选区间没有足够、连续的有效历史行情，请调整年份或更换标的。' }; }
  }, [data, plan]);
  const maxYear = data?.expectedAsOfDate ? Number(data.expectedAsOfDate.slice(0, 4)) : new Date().getUTCFullYear();
  const apply = next => {
    if (next.symbol !== plan.symbol) setRefresh(0);
    setPlan(next);
    setEditing(false);
  };
  const loading = state.key !== key || state.loading;
  return <main className="investment-comparison ic-page dca-lab">
    <header className="ic-header"><button type="button" className="ic-icon-button ic-back" onClick={closeDcaLab} aria-label="返回交易"><ArrowLeft size={21} /></button><div><h1>定投实验室</h1><p>把时间变成投资的一部分</p></div><FlaskConical className="dl-header-icon" size={20} aria-hidden="true" /></header>
    <div className="dl-preview-label"><span />历史回测 · EODHD</div>
    <section className="dl-plan" aria-label="定投方案">
      <div className="dl-plan-top"><label className="dl-symbol"><span>投资标的</span><select aria-label="投资标的" value={plan.symbol} onChange={event => apply({ ...plan, symbol: event.target.value })}>{DCA_SYMBOLS.map(item => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label><button className="dl-edit-button" aria-label="调整定投计划" type="button" aria-expanded={editing} onClick={() => setEditing(value => !value)}><SlidersHorizontal size={16} /><span>调整计划</span></button></div>
      <div className="dl-plan-summary"><span><CalendarDays size={13} />{plan.startYear} — {plan.endYear}</span><span>{frequencyLabel(plan.frequency)} {money(plan.amount)}</span><span>起投 {money(plan.initial)}</span></div>
      {editing && <PlanEditor plan={plan} maxYear={maxYear} onApply={apply} onCancel={() => setEditing(false)} />}
    </section>
    {loading && <p className="dl-status" role="status">正在读取 {plan.symbol} 真实历史行情…</p>}
    {!loading && (state.error || result.error) && <div className="dl-status" role="alert"><p>{state.error || result.error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>重试行情</button></div>}
    {!loading && result.model && <>
      {data.stale && <p className="dl-data-note" role="status">行情暂截至 {data.asOfDate}，最新应为 {data.expectedAsOfDate}。<button type="button" onClick={() => setRefresh(value => value + 1)}>刷新数据</button></p>}
      {result.model.period.startAdjusted && <p className="dl-data-note">可用历史始于 {result.model.startDate}，已从该交易日开始计算。</p>}
      <DcaLabResults key={`${key}:${JSON.stringify(plan)}:${data.asOfDate}`} model={result.model} plan={plan} />
    </>}
  </main>;
}
