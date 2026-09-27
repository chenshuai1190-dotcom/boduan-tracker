import React from 'react';
import { ArrowLeft, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LineChart, Loader2, Share2, Table2, RefreshCw, X } from 'lucide-react';
import { buildInversionAnnotations, getInversionSegmentLabel, getInversionNormalizationLabel, normalizeVixMonthlyRows } from '../lib/vixMonthlyInversion.js';
import './VixMonthlyReportView.css';

const COLORS = { SPY: '#78ace8', QQQ: '#b79be5', VIX: '#dba77b', VIX3M: '#8fa1b6', ratio: '#d98282' };
const RISKS = {
  LOW_VOLATILITY: ['低波动', '#9ab5aa'], NORMAL: ['常态波动', '#c8bfb2'], ELEVATED: ['波动升高', '#d1b889'],
  HIGH_STRESS: ['高压状态', '#dba77b'], EXTREME_STRESS: ['极端压力', '#d98282'], UNKNOWN: ['待补齐', '#87909e'],
};
const TERMS = { NORMAL_TERM_STRUCTURE: '明显正向结构', NEAR_FLAT: '接近平坦', INVERTED: '期限倒挂', DEEP_INVERTED: '深度倒挂', UNKNOWN: '暂不可判断' };
const DIRECTIONS = { RISING: '风险升温', EASING: '风险缓解', HIGH_HOLD: '高位维持', STABLE: '基本稳定', UNKNOWN: '暂不可判断' };
const PRICE_ACTIONS = { NEW_LOW: '创 20 日收盘新低', RECOVERY: '反弹延续', EARLY_STABILIZATION: '短期止跌迹象', NO_STABILIZATION: '尚未止跌', INSUFFICIENT_DATA: '历史不足', UNKNOWN: '暂不可判断' };
const EVENTS = { VIX_CROSS_25: 'VIX 上穿 25', VIX_CROSS_30: 'VIX 达到 30', RATIO_CROSS_1: '期限结构进入倒挂', RATIO_CROSS_1_10: '比率达到 1.10', INVERSION_15D: '连续倒挂达到 15 日', TERM_STRUCTURE_NORMALIZED: '期限结构恢复正向' };
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pct = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmt(value)}%` : '—';
const day = value => typeof value === 'string' ? value.slice(5).replace('-', '/') : '—';
const monthLabel = value => /^\d{4}-\d{2}$/.test(value || '') ? `${value.slice(0, 4)} 年 ${Number(value.slice(5))} 月` : '选择月份';
const riskOf = row => RISKS[row?.currentRiskLevel] || RISKS.UNKNOWN;
const changeClass = value => Number.isFinite(value) ? (value > 0 ? 'vmr-positive' : value < 0 ? 'vmr-negative' : '') : 'vmr-missing';
const count = value => Number.isFinite(value) ? `${value} 日` : '—';

function Sheet({ title, subtitle, onClose, children, className = '' }) {
  const dialogRef = React.useRef(null);
  const titleId = React.useId();
  React.useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('[data-sheet-close]')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); };
  }, []);
  return <div className="vmr-overlay">
    <button type="button" tabIndex={-1} className="vmr-backdrop" aria-label="关闭弹窗" onClick={onClose} />
    <section ref={dialogRef} className={`vmr-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')];
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="vmr-sheet-handle" />
      <header className="vmr-sheet-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" data-sheet-close aria-label="关闭" onClick={onClose}><X size={19} strokeWidth={1.6} /></button></header>
      <div className="vmr-sheet-content">{children}</div>
    </section>
  </div>;
}

function scaleBounds(values, type) {
  if (type === 'ratio') return [Math.min(0.9, ...values.map(value => Math.floor(value * 10) / 10)), Math.max(1.1, ...values.map(value => Math.ceil(value * 10) / 10))];
  if (!values.length) return type === 'return' ? [-5, 5] : [10, 40];
  const lo = type === 'return' ? Math.min(0, ...values) : Math.min(...values);
  const hi = type === 'return' ? Math.max(0, ...values) : Math.max(...values);
  const span = Math.max(hi - lo, type === 'return' ? 2 : 10);
  const target = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].find(item => item >= target / magnitude) * magnitude;
  return [Math.floor((lo - span * 0.06) / step) * step, Math.ceil((hi + span * 0.06) / step) * step];
}

function LinkedChart({ report, rows, type, number, title, subtitle, selectedIndex, onSelect }) {
  const touchRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  const [normalizationDate, setNormalizationDate] = React.useState(null);
  const w = 360; const left = 35; const right = 348; const top = 14; const bottom = 145;
  const series = type === 'return' ? ['SPY', 'QQQ'] : type === 'volatility' ? ['VIX', 'VIX3M'] : ['ratio'];
  const value = (row, key) => type === 'return' ? row?.prices?.[key]?.cumulativeChangePct : row?.[key];
  const values = rows.flatMap(row => series.map(key => value(row, key))).filter(Number.isFinite);
  const [min, max] = scaleBounds(values, type);
  const x = index => left + index / Math.max(rows.length - 1, 1) * (right - left);
  const y = reading => bottom - (reading - min) / Math.max(max - min, 0.01) * (bottom - top);
  const current = selectedIndex === null ? rows.length - 1 : Math.min(selectedIndex, rows.length - 1);
  const focused = rows[current];
  const inversion = React.useMemo(() => type === 'ratio'
    ? buildInversionAnnotations({ ...report, rows }, { throughDate: focused?.date }) : null,
  [report, rows, type, focused?.date]);
  const featured = inversion?.current || inversion?.primarySegment;
  const primaryNormalization = featured
    ? inversion?.normalizations.find(event => event.date === featured.normalizedDate)
    : inversion?.normalizations.at(-1);
  const selectedNormalization = inversion?.normalizations.find(event => event.date === normalizationDate);
  const bandLeft = index => Math.max(left, x(index) - (right - left) / Math.max(rows.length - 1, 1) / 2);
  const bandRight = index => Math.min(right, x(index) + (right - left) / Math.max(rows.length - 1, 1) / 2);
  const ticks = type === 'ratio' ? Array.from({ length: Math.round((max - min) / 0.1) + 1 }, (_, i) => Math.round((min + i * 0.1) * 10) / 10)
    : Array.from({ length: 5 }, (_, i) => min + i / 4 * (max - min));
  const drawPath = key => {
    let pen = false;
    return rows.map((row, index) => {
      const reading = value(row, key);
      if (!Number.isFinite(reading)) { pen = false; return ''; }
      const command = `${pen ? 'L' : 'M'}${x(index).toFixed(2)},${y(reading).toFixed(2)}`;
      pen = true;
      return command;
    }).filter(Boolean).join(' ');
  };
  const selectAt = event => {
    const bounds = touchRef.current?.getBoundingClientRect();
    if (!bounds?.width || !rows.length) return;
    const unit = ((event.clientX - bounds.left) / bounds.width * w - left) / (right - left);
    onSelect(Math.max(0, Math.min(rows.length - 1, Math.round(unit * (rows.length - 1)))));
  };
  const labels = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].filter(index => index >= 0);
  return <section className="vmr-chart-panel">
    <div className="vmr-chart-heading"><h3><span>{number}</span>{title}</h3><div className="vmr-chart-legend">{series.map(key => <span key={key}><i style={{ backgroundColor: COLORS[key] }} />{key === 'ratio' ? 'VIX / VIX3M' : key}</span>)}</div></div>
    <div className="vmr-chart-subtitle">{subtitle}</div>
    <div className="vmr-chart-reading" aria-live="polite">{series.map(key => <span key={key} style={{ color: COLORS[key] }}>{key === 'ratio' ? '比率' : key}<strong>{type === 'return' ? pct(value(focused, key)) : fmt(value(focused, key), type === 'ratio' ? 4 : 2)}</strong></span>)}<small>{focused ? day(focused.date) : '—'}{selectedIndex === null ? ' 收盘' : ' 选中'}</small></div>
    {featured && <div className="vmr-inversion-summary" aria-live="polite">
      <strong>{getInversionSegmentLabel(featured, { includeStatus: false })}</strong>
      <span>{featured.carriedIn ? '承接上月 · ' : ''}{day(featured.startDate)}—{day(featured.endDate)}{featured.status === 'ongoing' ? ' · 仍在持续' : featured.status === 'interrupted' ? ' · 连续数据中断' : ''}</span>
    </div>}
    {rows.length ? <div ref={touchRef} className="vmr-chart-touch" role="slider" tabIndex={0}
      aria-label={`${title}，选择交易日期`} aria-valuemin={0} aria-valuemax={rows.length - 1} aria-valuenow={current}
      aria-valuetext={`${focused?.date || ''}，${series.map(key => `${key} ${type === 'return' ? pct(value(focused, key)) : fmt(value(focused, key), type === 'ratio' ? 4 : 2)}`).join('，')}`}
      onPointerDown={event => { gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: null }; event.currentTarget.setPointerCapture?.(event.pointerId); selectAt(event); }}
      onPointerMove={event => {
        const gesture = gestureRef.current;
        if (event.pointerType === 'mouse' && !gesture) { selectAt(event); return; }
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - gesture.x); const dy = Math.abs(event.clientY - gesture.y);
        if (!gesture.direction && Math.max(dx, dy) > 7) gesture.direction = dy > dx ? 'vertical' : 'horizontal';
        if (gesture.direction === 'vertical') { onSelect(null); return; }
        if (gesture.direction === 'horizontal' || event.pointerType === 'mouse') selectAt(event);
      }}
      onPointerUp={event => { gestureRef.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { gestureRef.current = null; onSelect(null); }} onLostPointerCapture={() => { gestureRef.current = null; }}
      onKeyDown={event => {
        if (event.key === 'Escape') { onSelect(null); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        onSelect(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}>
      <svg viewBox={`0 0 ${w} 173`} role="img" aria-label={`${title}，横轴按交易日对齐，数据缺失处断线`}>
        {inversion?.segments.map(segment => <rect key={segment.startDate} data-inversion-band={segment.startDate}
          x={bandLeft(segment.startIndex)} y={top} width={Math.max(1, bandRight(segment.endIndex) - bandLeft(segment.startIndex))}
          height={bottom - top} fill={COLORS.ratio} fillOpacity=".065" />)}
        {ticks.map(tick => <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={type === 'ratio' && tick === 1 ? COLORS.ratio : '#758298'} strokeOpacity={type === 'ratio' && tick === 1 ? '.55' : type === 'return' && tick === 0 ? '.38' : '.13'} strokeDasharray={type === 'ratio' && [1, 1.1].includes(tick) ? '3 4' : undefined} /><text x={left - 8} y={y(tick) + 3} textAnchor="end" fill="#778293">{type === 'return' ? `${tick > 0 ? '+' : ''}${fmt(tick, Number.isInteger(tick) ? 0 : 1)}%` : fmt(tick, type === 'ratio' ? 1 : 0)}</text></g>)}
        {series.map(key => <path key={key} d={drawPath(key)} fill="none" stroke={COLORS[key]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        {inversion?.normalizations.map(event => <g key={event.date} data-normalization-marker={event.date}>
          <circle cx={x(event.index)} cy={y(event.ratio)} r="3.5" fill="#0a0d12" stroke="#b3c4d7" strokeWidth="1.4" />
          {event === primaryNormalization && <>
            <path d={`M${x(event.index)},${y(event.ratio) - 6} L${Math.max(left + 95, Math.min(right - 3, x(event.index) - 14))},${top + 33}`} fill="none" stroke="#8796aa" strokeWidth=".8" />
            <text x={Math.max(left + 95, Math.min(right - 3, x(event.index) - 14))} y={top + 26} textAnchor="end" fill="#bdc9d9">{getInversionNormalizationLabel(event)}</text>
          </>}
        </g>)}
        {selectedIndex !== null && <line x1={x(current)} x2={x(current)} y1={top} y2={bottom} stroke="#aab3c2" strokeOpacity=".48" strokeDasharray="3 3" />}
        {series.map(key => Number.isFinite(value(focused, key)) && <circle key={key} cx={x(current)} cy={y(value(focused, key))} r="2.8" fill={COLORS[key]} stroke="#0a0d12" strokeWidth="1.3" />)}
        {labels.map((index, position) => <text key={index} x={x(index)} y="168" fill="#778293" textAnchor={position === 0 ? 'start' : position === labels.length - 1 ? 'end' : 'middle'}>{day(rows[index].date)}</text>)}
      </svg>
    </div> : <div className="vmr-chart-empty">这个月暂无可绘制的数据</div>}
    {inversion && <div className="vmr-inversion-events">
      {inversion.normalizations.map(event => <button key={event.date} type="button" onClick={() => setNormalizationDate(event.date)}
        aria-label={`查看 ${event.date} 倒挂解除详情`}><i /><span>{getInversionNormalizationLabel(event)}</span><ChevronRight size={13} /></button>)}
      {!featured && !inversion.normalizations.length && <p>{Number.isFinite(focused?.ratio) ? '截至选定收盘，暂无可标注的倒挂区间。' : '期限数据待补齐，暂不判断倒挂是否结束。'}</p>}
    </div>}
    {selectedNormalization && <Sheet title={getInversionNormalizationLabel(selectedNormalization)} subtitle="收盘期限结构事件" onClose={() => setNormalizationDate(null)}>
      <div className="vmr-normalization-values"><div><span>{day(selectedNormalization.previousDate)} · 前一交易日</span><strong>{fmt(selectedNormalization.previousRatio, 4)}</strong></div><span>→</span><div><span>{day(selectedNormalization.date)} · 解除当日</span><strong>{fmt(selectedNormalization.ratio, 4)}</strong></div></div>
      <p className="vmr-normalization-duration">此前连续倒挂{selectedNormalization.exact ? '' : '至少'} {selectedNormalization.days} 个交易日{selectedNormalization.carriedIn ? '，包含上月延续天数' : ''}。</p>
      <p className="vmr-muted-copy">期限比率从 ≥ 1 降至 &lt; 1。倒挂解除只描述期限结构变化，不等于风险已缓解或市场底部已经形成。</p>
    </Sheet>}
  </section>;
}

function DailyDetail({ row, onClose }) {
  const risk = riskOf(row);
  const currentEvents = (row.eventFlags || []).filter(event => EVENTS[event.type]);
  return <Sheet title={`${row.date.slice(0, 4)} 年 ${Number(row.date.slice(5, 7))} 月 ${Number(row.date.slice(8))} 日`} subtitle="当日收盘 · 六维风险观察" onClose={onClose} className="vmr-detail-sheet">
    <div className="vmr-detail-metrics"><div><span>VIX</span><strong>{fmt(row.VIX)}</strong></div><div><span>VIX3M</span><strong>{fmt(row.VIX3M)}</strong></div><div><span>期限比率</span><strong>{fmt(row.ratio, 4)}</strong></div></div>
    <dl className="vmr-detail-facts"><div><dt><span>01</span>当前风险</dt><dd style={{ color: risk[1] }}>{risk[0]}</dd></div><div><dt><span>02</span>期限结构</dt><dd>{TERMS[row.termStructure] || TERMS.UNKNOWN}</dd></div><div><dt><span>03</span>风险变化</dt><dd style={{ color: row.riskDirection === 'EASING' ? '#a8b7d2' : undefined }}>{DIRECTIONS[row.riskDirection] || DIRECTIONS.UNKNOWN}</dd></div></dl>
    <section className="vmr-detail-section"><h3><span>04</span>持续时间</h3><div className="vmr-detail-durations">{[['当前等级', row.currentRiskDuration, 'currentRisk'], ['连续倒挂', row.inversionDays, 'inversion'], ['高压及以上', row.highStressDays, 'highStress'], ['极端压力', row.extremeStressDays, 'extremeStress']].map(([label, value, key]) => <div key={label}><span>{label}</span><strong>{Number.isFinite(value) && value > 0 && row.durationExact?.[key] !== true ? '至少 ' : ''}{count(value)}</strong></div>)}</div>{row.durationTags?.includes('PROLONGED_INVERSION') && <p className="vmr-detail-tag">连续倒挂已达 15 个交易日</p>}</section>
    <section className="vmr-detail-section"><h3><span>05</span>价格行为</h3><div className="vmr-detail-prices">{['SPY', 'QQQ'].map(symbol => {
      const price = row.prices?.[symbol]; const action = typeof price?.priceAction === 'string' ? price.priceAction : price?.priceAction?.status;
      return <div key={symbol}><div><span style={{ color: COLORS[symbol] }}>{symbol}</span><strong className={changeClass(price?.dailyChangePct)}>{pct(price?.dailyChangePct)}</strong></div><p>{PRICE_ACTIONS[action] || PRICE_ACTIONS.UNKNOWN}</p><small>复权收盘 ${fmt(price?.adjustedClose)}</small></div>;
    })}</div></section>
    <section className="vmr-detail-section"><h3><span>06</span>近期事件</h3>{currentEvents.length ? <ul className="vmr-detail-events">{currentEvents.map(event => <li key={`${event.type}-${event.date}`}><span>{EVENTS[event.type]}</span><small>{day(event.date)}{event.date === row.date ? ' · 当日' : ''}</small></li>)}</ul> : <p className="vmr-muted-copy">{row.ready ? '最近 3 个交易日无新增阈值事件。' : '连续数据不足，事件信息待补齐。'}</p>}</section>
    <p className="vmr-detail-disclaimer">风险水平与当日股价涨跌分别观察。“短期止跌迹象”与“反弹延续”不代表市场底部已经形成。</p>
  </Sheet>;
}

export default function VixMonthlyReportView({
  report: suppliedReport, reports = [], month: controlledMonth, onMonthChange, availableMonths,
  initialMonth = '2025-04', onBack, onShare, preview = false, loading = false, notice, onRefresh,
}) {
  const pageRef = React.useRef(null);
  const orderedReports = React.useMemo(() => [...reports].sort((a, b) => a.month.localeCompare(b.month)), [reports]);
  const months = React.useMemo(() => [...(availableMonths ?? orderedReports)]
    .map(item => typeof item === 'string' ? { month: item } : item)
    .filter(item => /^\d{4}-\d{2}$/.test(item?.month || ''))
    .sort((a, b) => a.month.localeCompare(b.month)), [availableMonths, orderedReports]);
  const [chosenMonth, setChosenMonth] = React.useState(initialMonth);
  const [tab, setTab] = React.useState('overview');
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const [monthSheet, setMonthSheet] = React.useState(false);
  const [shareSheet, setShareSheet] = React.useState(false);
  const [detailDate, setDetailDate] = React.useState(null);
  const [pickerYear, setPickerYear] = React.useState(Number(initialMonth.slice(0, 4)));
  const [sharing, setSharing] = React.useState(null);
  const [shareError, setShareError] = React.useState('');
  const isControlled = controlledMonth !== undefined;
  const visibleMonth = isControlled ? controlledMonth
    : months.some(item => item.month === chosenMonth) ? chosenMonth : months.at(-1)?.month;
  // A new controlled month must never fall back to the previous month's report.
  const report = suppliedReport?.month === visibleMonth ? suppliedReport
    : orderedReports.find(item => item.month === visibleMonth);
  const index = months.findIndex(item => item.month === visibleMonth);
  const rows = React.useMemo(() => normalizeVixMonthlyRows(report), [report]);
  const selected = rows[selectedIndex === null ? rows.length - 1 : selectedIndex];
  const detail = rows.find(row => row.date === detailDate);
  const years = [...new Set(months.map(item => Number(item.month.slice(0, 4))))].sort((a, b) => a - b);
  React.useEffect(() => { setSelectedIndex(null); setDetailDate(null); setMonthSheet(false); setShareSheet(false); }, [visibleMonth]);
  React.useEffect(() => {
    if (selectedIndex === null) return undefined;
    const clearOutside = event => {
      // All three plots share one selection. Keep chart gestures and event
      // details intact; a press on the surrounding page restores month-end.
      const control = event.target.closest?.('.vmr-chart-touch, button, .vmr-overlay');
      if (control && pageRef.current?.contains(control)) return;
      setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', clearOutside, true);
    return () => document.removeEventListener('pointerdown', clearOutside, true);
  }, [selectedIndex]);
  const chooseMonth = nextMonth => {
    if (!isControlled) setChosenMonth(nextMonth);
    onMonthChange?.(nextMonth);
    setSelectedIndex(null); setDetailDate(null); setMonthSheet(false);
  };
  const share = async type => {
    if (!onShare || !report || sharing) return;
    setSharing(type); setShareError(''); setShareSheet(false);
    // Let this sheet unmount and release its body lock before the parent opens
    // its native sharing dialog. The parent owns generation and failure UI.
    await new Promise(resolve => requestAnimationFrame(resolve));
    try { await onShare(type, report); }
    catch { setShareError('图片暂时未能准备好，请重试。'); }
    finally { setSharing(null); }
  };
  const complete = report?.status === 'complete';
  const summary = report?.summary || {};

  return <main ref={pageRef} className="vmr-page" data-vix-monthly-report="true" data-vix-monthly-report-preview={preview ? 'true' : undefined} aria-busy={loading}>
    <header className="vmr-header"><button type="button" onClick={onBack} aria-label="返回 VIX 与市场走势"><ArrowLeft size={20} strokeWidth={1.7} /></button><h1>市场月报</h1><button type="button" aria-label="分享月报" disabled={!report || loading || !onShare} onClick={() => { setShareError(''); setShareSheet(true); }}><Share2 size={18} strokeWidth={1.6} /></button></header>
    <div className="vmr-preview-label"><i />{preview ? '本地设计预览' : '日线收盘 · 历史回放'}{preview && <span>日线收盘 · 历史回放</span>}{onRefresh && <button type="button" onClick={onRefresh} disabled={loading} aria-label="刷新月报数据"><RefreshCw size={12} className={loading ? 'vmr-spin' : undefined} />{loading ? '刷新中' : '刷新'}</button>}</div>
    {notice && <p className="vmr-data-notice" role="status">{notice}</p>}
    <div className="vmr-month-nav"><button type="button" aria-label="上一个可用月份" disabled={index <= 0} onClick={() => chooseMonth(months[index - 1].month)}><ChevronLeft size={20} strokeWidth={1.6} /></button><button type="button" className="vmr-month-title" disabled={!months.length} onClick={() => { setPickerYear(Number(visibleMonth?.slice(0, 4) || years.at(-1))); setMonthSheet(true); }}><span>{visibleMonth ? monthLabel(visibleMonth) : '市场月报'}</span><ChevronDown size={16} strokeWidth={1.5} /></button><button type="button" aria-label="下一个可用月份" disabled={index < 0 || index >= months.length - 1} onClick={() => chooseMonth(months[index + 1].month)}><ChevronRight size={20} strokeWidth={1.6} /></button></div>
    {report && <div className="vmr-month-status"><span>{complete ? '完整月份' : report.status === 'in_progress' ? '本月进行中' : '部分数据'}<i />{report.observedSessions} / {report.expectedSessions} 个交易日</span><span>截至 {day(report.asOfDate)}</span></div>}
    {!report ? <div className="vmr-empty"><CalendarDays size={27} strokeWidth={1.2} /><p>{loading ? '正在读取月度历史数据' : '月度历史数据尚未载入'}</p><small>{loading ? '请稍候' : '可刷新数据后查看'}</small></div> : <>
      <div className="vmr-tabs" role="tablist" aria-label="月报视图"><button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>总览</button><button type="button" role="tab" aria-selected={tab === 'daily'} onClick={() => setTab('daily')}>每日明细</button></div>
      <section className="vmr-summary" aria-label="月份摘要"><div><span>SPY {complete ? '月涨跌' : '月内涨跌'}</span><strong style={{ color: COLORS.SPY }}>{pct(summary.SPY?.monthlyChangePct)}</strong></div><div><span>QQQ {complete ? '月涨跌' : '月内涨跌'}</span><strong style={{ color: COLORS.QQQ }}>{pct(summary.QQQ?.monthlyChangePct)}</strong></div><div><span>VIX 最高收盘</span><strong style={{ color: COLORS.VIX }}>{fmt(summary.vixMax?.value)}</strong><small>{day(summary.vixMax?.date)}</small></div></section>
      {report.status === 'partial' && <p className="vmr-coverage-note">这个月的数据尚未完整。缺失读数保留为空，无法完整计算的统计显示 —。{report.cutoffDate && (!report.asOfDate || report.asOfDate < report.cutoffDate) ? `待补齐至 ${report.cutoffDate}。` : ''}</p>}
      {tab === 'overview' ? <div className="vmr-overview" role="tabpanel" aria-label="总览">
        <div className="vmr-history-toolbar"><span>{selectedIndex === null ? '全月走势' : `${selected?.date || ''} · 联动读数`}</span><button type="button" disabled={selectedIndex === null} onClick={() => setSelectedIndex(null)}>回到月末</button></div>
        <LinkedChart key={`${report.month}-return`} rows={rows} type="return" number="01" title="股价累计涨跌" subtitle={`相对 ${summary.SPY?.baselineDate || '上月末'} 复权收盘`} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
        <LinkedChart key={`${report.month}-volatility`} rows={rows} type="volatility" number="02" title="波动率水平" subtitle="VIX 与 VIX3M 同日收盘" selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
        <LinkedChart key={`${report.month}-ratio`} report={report} rows={rows} type="ratio" number="03" title="期限比率" subtitle="≥ 1.00 倒挂 · ≥ 1.10 深度倒挂" selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
        <section className="vmr-month-observations"><div><span>高压及以上</span><strong>{count(summary.highStressDays)}<small>/ 应有 {Number.isFinite(report.expectedSessions) ? report.expectedSessions : '—'} 日</small></strong></div><div><span>倒挂交易日</span><strong>{count(summary.inversionDays)}<small>/ 应有 {Number.isFinite(report.expectedSessions) ? report.expectedSessions : '—'} 日</small></strong></div></section>
        <button type="button" className="vmr-details-entry" onClick={() => { setTab('daily'); setSelectedIndex(null); }}><span>查看每日涨跌与风险<small>{Number.isFinite(report.expectedSessions) ? report.expectedSessions : '—'} 个应有交易日，点选查看六维观察</small></span><ChevronRight size={18} strokeWidth={1.5} /></button>
      </div> : <div className="vmr-daily" role="tabpanel" aria-label="每日明细">
        <div className="vmr-daily-caption"><span>当日涨跌 · 相对上一交易日</span><span>点行查看详情</span></div>
        <div className="vmr-table" role="table" aria-label="每日涨跌与风险"><div className="vmr-table-header vmr-table-grid" role="row"><span role="columnheader">日期</span><span role="columnheader">VIX</span><span role="columnheader">比率</span><span role="columnheader">SPY<small>日涨跌</small></span><span role="columnheader">QQQ<small>日涨跌</small></span><span role="columnheader">风险</span></div><div role="rowgroup">{rows.map(row => <button type="button" key={row.date} className="vmr-table-row vmr-table-grid" role="row" aria-label={`${row.date}，${riskOf(row)[0]}，查看六维详情`} onClick={() => setDetailDate(row.date)}><span role="cell" className="vmr-table-date">{day(row.date)}</span><span role="cell">{fmt(row.VIX)}</span><span role="cell">{fmt(row.ratio, 3)}</span><span role="cell" className={changeClass(row.prices?.SPY?.dailyChangePct)}>{pct(row.prices?.SPY?.dailyChangePct)}</span><span role="cell" className={changeClass(row.prices?.QQQ?.dailyChangePct)}>{pct(row.prices?.QQQ?.dailyChangePct)}</span><span role="cell" className="vmr-table-risk" style={{ color: riskOf(row)[1] }}>{riskOf(row)[0]}</span></button>)}</div></div>
        <p className="vmr-table-note">比率显示至小数点后三位，风险等级使用原始精度。VIX3M 与完整六维观察可在单日详情中查看。</p>
      </div>}
      <footer className="vmr-footer"><p>SPY / QQQ 使用复权收盘；横轴按交易日排列。</p><p>按当日收盘回放当前候选规则，不代表当时信号，也不证明预测能力。</p><span>Cboe · EODHD<span>QUOTE / 市场观察</span></span></footer>
    </>}
    {monthSheet && <Sheet title="选择月份" subtitle="仅显示已有历史数据的月份" onClose={() => setMonthSheet(false)}><div className="vmr-year-picker"><button type="button" aria-label="上一年" disabled={years.indexOf(pickerYear) <= 0} onClick={() => setPickerYear(years[years.indexOf(pickerYear) - 1])}><ChevronLeft size={20} /></button><strong>{pickerYear} 年</strong><button type="button" aria-label="下一年" disabled={years.indexOf(pickerYear) >= years.length - 1} onClick={() => setPickerYear(years[years.indexOf(pickerYear) + 1])}><ChevronRight size={20} /></button></div><div className="vmr-month-grid">{Array.from({ length: 12 }, (_, i) => {
      const month = `${pickerYear}-${String(i + 1).padStart(2, '0')}`; const available = months.find(item => item.month === month);
      return <button key={month} type="button" disabled={!available} aria-pressed={visibleMonth === month} onClick={() => chooseMonth(month)}>{i + 1} 月{available?.status === 'in_progress' && <small>进行中</small>}</button>;
    })}</div><p className="vmr-month-range">可用范围 {months[0]?.month} — {months.at(-1)?.month}</p></Sheet>}
    {detail && <DailyDetail row={detail} onClose={() => setDetailDate(null)} />}
    {shareSheet && <Sheet title="分享月报" subtitle={`${monthLabel(report?.month)} · 选择分享内容`} onClose={() => { if (!sharing) setShareSheet(false); }}><div className="vmr-share-options">{[['overview', LineChart, '市场走势总览', '累计涨跌、波动率与期限结构'], ['daily', Table2, '每日涨跌与风险', '全月交易日数据与风险观察']].map(([type, Icon, title, description]) => <button key={type} type="button" disabled={!onShare || Boolean(sharing)} onClick={() => share(type)}><span className={`vmr-share-icon vmr-share-${type}`}><Icon size={28} strokeWidth={1.3} /></span><span><strong>{title}</strong><small>{description}</small></span>{sharing === type ? <Loader2 size={18} className="vmr-spin" /> : <ChevronRight size={18} strokeWidth={1.5} />}</button>)}</div>{!onShare && <p className="vmr-muted-copy">图片分享正在接入，此处先预览内容选项。</p>}{shareError && <p className="vmr-share-error" role="alert">{shareError}</p>}<p className="vmr-share-note">分享内容仅包含市场数据，不包含个人账户或持仓。</p></Sheet>}
  </main>;
}
