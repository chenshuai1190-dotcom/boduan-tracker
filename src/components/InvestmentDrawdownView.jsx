import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { buildInvestmentDrawdownModel } from '../lib/investmentDrawdownModel.js';
import {
  formatInvestmentAmount,
  formatInvestmentPercent,
  INVESTMENT_LEADING_COLOR,
  INVESTMENT_TRAILING_COLOR,
  INVESTMENT_NEUTRAL_COLOR,
} from './InvestmentComparisonChart.jsx';
import './InvestmentDrawdown.css';

const RED = INVESTMENT_LEADING_COLOR;
const GREEN = INVESTMENT_TRAILING_COLOR;
const SPEEDS = [0.1, 0.2, 0.4, 0.8, 1];
const dayCount = (value, englishMode) => Number.isFinite(value)
  ? `${value.toLocaleString('en-US')} ${englishMode ? 'days' : '天'}` : '—';
const calendarDays = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
const linePath = (points, x, y) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point).toFixed(2)},${y(point).toFixed(2)}`).join(' ');

function useChartWidth() {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(360);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setWidth(Math.max(240, Math.round(node.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const DrawdownOverview = React.memo(function DrawdownOverview({ data, active, colors, onActivate, englishMode }) {
  const [containerRef, width] = useChartWidth();
  const [inspection, setInspection] = React.useState({ data, selectedIndex: null, hoverIndex: null });
  const gestureRef = React.useRef(null);
  const currentInspection = inspection.data === data ? inspection : { data, selectedIndex: null, hoverIndex: null };
  const { symbols, analyses } = data;
  const points = analyses[symbols[0]].points;
  const lastIndex = points.length - 1;
  const height = 270;
  const left = 39, right = 8, top = 18, bottom = 32;
  const floor = Math.min(-10, Math.floor(Math.min(...symbols.map(symbol => analyses[symbol].maxDrawdownPct)) / 10) * 10);
  const x = point => left + point.index / Math.max(1, lastIndex) * (width - left - right);
  const y = value => top + value / floor * (height - top - bottom);
  const selected = analyses[active];
  const lowest = selected.points.reduce((best, point) => point.drawdownPct < best.drawdownPct ? point : best, selected.points[0]);
  const selectedAnchor = x(lowest) > width * 0.7 ? 'end' : 'start';
  const inspecting = currentInspection.hoverIndex !== null || currentInspection.selectedIndex !== null;
  const readoutIndex = Math.max(0, Math.min(lastIndex, currentInspection.hoverIndex ?? currentInspection.selectedIndex ?? lastIndex));
  const updateInspection = patch => setInspection(current => ({ ...(current.data === data ? current : { data, selectedIndex: null, hoverIndex: null }), ...patch }));
  const indexAtPointer = event => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - box.left - left) / Math.max(1, box.width - left - right)));
    return Math.round(ratio * lastIndex);
  };
  const clearPreview = () => updateInspection({ hoverIndex: null });
  const cancelGesture = () => { gestureRef.current = null; clearPreview(); };
  const resetInspection = () => { gestureRef.current = null; updateInspection({ selectedIndex: null, hoverIndex: null }); };
  const pointerDown = event => {
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    gestureRef.current = { data, pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, direction: null };
    updateInspection({ hoverIndex: indexAtPointer(event) });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = event => {
    const gesture = gestureRef.current;
    if (gesture?.data === data && gesture.pointerId === event.pointerId) {
      if (gesture.pointerType !== 'mouse' && !gesture.direction) {
        const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
        if (Math.max(dx, dy) > 8) gesture.direction = dy > dx ? 'vertical' : 'horizontal';
      }
      if (gesture.direction === 'vertical') { clearPreview(); return; }
      updateInspection({ hoverIndex: indexAtPointer(event) });
    } else if (event.pointerType === 'mouse' && currentInspection.selectedIndex === null) {
      updateInspection({ hoverIndex: indexAtPointer(event) });
    }
  };
  const pointerUp = event => {
    const gesture = gestureRef.current;
    if (gesture?.data !== data || gesture.pointerId !== event.pointerId) return;
    if (gesture.direction !== 'vertical') updateInspection({ selectedIndex: indexAtPointer(event), hoverIndex: null });
    else clearPreview();
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const inspectKey = event => {
    let next;
    if (event.key === 'ArrowLeft') next = readoutIndex - 1;
    else if (event.key === 'ArrowRight') next = readoutIndex + 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lastIndex;
    else if (event.key === 'Escape') { event.preventDefault(); resetInspection(); return; }
    else return;
    event.preventDefault();
    gestureRef.current = null;
    updateInspection({ selectedIndex: Math.max(0, Math.min(lastIndex, next)), hoverIndex: null });
  };
  return <section className="ic-dd-overview-section" aria-label={englishMode ? 'Drawdown history' : '回撤历史'}>
    <div className="ic-dd-section-head"><h2>{englishMode ? 'Distance from the previous high' : '离前高还有多远'}</h2>{currentInspection.selectedIndex !== null ? <button type="button" className="ic-dd-reset-inspection" onClick={resetInspection}>{englishMode ? 'Back to latest' : '回到最新'}</button> : <span>{englishMode ? 'Drawdown %' : '回撤 %'}</span>}</div>
    <div className="ic-dd-legend">{symbols.map(symbol => <button key={symbol} type="button" onClick={() => onActivate(symbol)} aria-pressed={active === symbol} aria-label={englishMode ? `View ${symbol} drawdown details` : `查看 ${symbol} 回撤详情`}><i style={{ background: colors[symbol] }} />{symbol}</button>)}</div>
    <div ref={containerRef} className="ic-dd-chart ic-dd-overview" role="slider" aria-valuemin={0} aria-valuemax={lastIndex} aria-valuenow={readoutIndex} aria-valuetext={`${points[readoutIndex].date}, ${symbols.map(symbol => `${symbol} ${formatInvestmentPercent(analyses[symbol].points[readoutIndex].drawdownPct)}`).join(', ')}`} tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} onPointerLeave={clearPreview} onBlur={cancelGesture} onKeyDown={inspectKey} aria-label={englishMode ? 'Inspect daily drawdowns with left and right arrow keys' : '使用左右方向键查看每日回撤'}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={englishMode ? `${symbols.join(' and ')} drawdown history; zero represents a previous high` : `${symbols.join(' 与 ')} 回撤曲线，零线代表此前最高值`}>
        {[0, floor / 2, floor].map(value => <g key={value}><line className="ic-dd-grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 6} y={y(value) + 4} textAnchor="end">{Math.round(value)}%</text></g>)}
        {symbols.map(symbol => {
          const series = analyses[symbol].points;
          const path = linePath(series, x, point => y(point.drawdownPct));
          return <g key={symbol}>{symbol === active && <path d={`${path} L${x(series.at(-1))},${y(0)} L${x(series[0])},${y(0)} Z`} fill={colors[symbol]} opacity=".07" />}<path d={path} fill="none" stroke={colors[symbol]} strokeWidth={symbol === active ? 1.8 : 1.25} opacity={symbol === active ? 1 : 0.7} strokeLinejoin="round" /></g>;
        })}
        {[...new Set([0, Math.round(lastIndex / 2), lastIndex])].map(pointIndex => {
          const point = points[pointIndex];
          return <text key={pointIndex} x={x(point)} y={height - 8} textAnchor={pointIndex === 0 ? 'start' : pointIndex === lastIndex ? 'end' : 'middle'}>{point.date.slice(0, 7)}</text>;
        })}
        <circle cx={x(lowest)} cy={y(lowest.drawdownPct)} r="4" fill={colors[active]} />
        <text className="ic-dd-value-label" x={x(lowest) + (selectedAnchor === 'end' ? -8 : 8)} y={Math.max(32, y(lowest.drawdownPct) - 12)} textAnchor={selectedAnchor}>{active} {formatInvestmentPercent(lowest.drawdownPct)}</text>
        {inspecting && <g><line x1={x(points[readoutIndex])} x2={x(points[readoutIndex])} y1={top} y2={height - bottom} className="ic-dd-inspection-line" strokeDasharray="3 4" />{symbols.map(symbol => <circle key={symbol} cx={x(points[readoutIndex])} cy={y(analyses[symbol].points[readoutIndex].drawdownPct)} r="3" fill={colors[symbol]} />)}</g>}
      </svg>
    </div>
    <div className="ic-dd-overview-readout"><span>{points[readoutIndex].date}</span>{symbols.map(symbol => <span key={symbol}>{symbol} <b style={{ color: colors[symbol] }}>{formatInvestmentPercent(analyses[symbol].points[readoutIndex].drawdownPct)}</b></span>)}</div>
  </section>;
});

function JourneyChart({ analysis, episode, symbol, index, englishMode }) {
  const [containerRef, width] = useChartWidth();
  const clipId = React.useId().replace(/:/g, '');
  const height = 290, left = 39, right = 9, top = 35, bottom = 30;
  const endIndex = episode.recoveryIndex ?? analysis.points.length - 1;
  const point = analysis.points[index];
  const last = analysis.points[endIndex];
  const minimum = Math.floor(episode.troughValue / episode.peakValue * 10) * 10 - 3;
  const maximum = Math.max(105, Math.ceil(last.value / episode.peakValue * 100) + 3);
  const x = row => left + (row.index - episode.peakIndex) / Math.max(1, endIndex - episode.peakIndex) * (width - left - right);
  const y = value => top + (maximum - value) / (maximum - minimum) * (height - top - bottom);
  const visible = analysis.points.slice(episode.peakIndex, index + 1);
  const path = linePath(visible, x, row => y(row.value / episode.peakValue * 100));
  const baseY = y(100);
  const relative = (point.value / episode.peakValue - 1) * 100;
  const currentColor = relative >= 0 ? RED : GREEN;
  const xp = x(point), yp = y(point.value / episode.peakValue * 100);
  const anchor = xp > width * 0.64 ? 'end' : 'start';
  const trough = analysis.points[episode.troughIndex];
  return <div ref={containerRef} className="ic-dd-chart ic-dd-journey-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={englishMode ? `${symbol} drawdown replay from ${episode.peakDate}; previous high equals 100` : `${symbol} 从 ${episode.peakDate} 开始的回撤重播，前高归一为 100`}>
      <text x={left} y={14}>{englishMode ? 'Previous high = 100' : '前高 = 100'}</text>
      <line className="ic-dd-baseline" x1={left} x2={width - right} y1={baseY} y2={baseY} strokeDasharray="4 5" />
      {[100, Math.round((minimum + 100) / 2), Math.ceil(minimum)].map(value => <text key={value} x={left - 6} y={y(value) + 4} textAnchor="end">{value}</text>)}
      <defs><clipPath id={`ic-dd-above-${clipId}`}><rect x={left - 3} y="0" width={width - left + 3} height={baseY} /></clipPath></defs>
      <path d={`${path} L${xp},${baseY} L${left},${baseY} Z`} fill={GREEN} opacity=".08" />
      <path d={path} fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      <path d={path} fill="none" stroke={RED} strokeWidth="2" strokeLinejoin="round" clipPath={`url(#ic-dd-above-${clipId})`} />
      <circle cx={xp} cy={yp} r="9" fill={currentColor} opacity=".12" /><circle cx={xp} cy={yp} r="4" fill={currentColor} />
      <text className="ic-dd-value-label" x={xp + (anchor === 'end' ? -8 : 8)} y={Math.max(32, yp - 13)} textAnchor={anchor}>{symbol} {formatInvestmentPercent(relative)}</text>
      {index >= episode.troughIndex && Math.abs(x(trough) - xp) > 65 && <g><circle cx={x(trough)} cy={y(trough.value / episode.peakValue * 100)} r="3" fill={GREEN} /><text x={x(trough)} y={y(trough.value / episode.peakValue * 100) + 21} textAnchor="middle">{formatInvestmentPercent(episode.drawdownPct)}</text></g>}
      {[...new Set([episode.peakIndex, Math.floor((episode.peakIndex + endIndex) / 2), endIndex])].map(pointIndex => <text key={pointIndex} x={x(analysis.points[pointIndex])} y={height - 7} textAnchor={pointIndex === episode.peakIndex ? 'start' : pointIndex === endIndex ? 'end' : 'middle'}>{analysis.points[pointIndex].date.slice(0, 7)}</text>)}
    </svg>
  </div>;
}

function DrawdownJourney({ analysis, episode, symbol, englishMode }) {
  const endIndex = episode.recoveryIndex ?? analysis.points.length - 1;
  const [playback, setPlayback] = React.useState({ analysis, episode, cursor: endIndex, playing: false });
  const [speed, setSpeed] = React.useState(0.2);
  // A refreshed model may reuse dates while changing prices. Never combine its
  // points with playback state belonging to the old analysis or episode.
  const isCurrent = playback.analysis === analysis && playback.episode === episode;
  const cursor = isCurrent ? Math.max(episode.peakIndex, Math.min(endIndex, playback.cursor)) : endIndex;
  const playing = isCurrent && playback.playing;
  const index = Math.floor(cursor);
  const point = analysis.points[index];
  const relative = (point.value / episode.peakValue - 1) * 100;
  React.useEffect(() => {
    if (!playing) return undefined;
    let frame;
    let lastFrame = null;
    const tick = now => {
      const elapsed = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      setPlayback(previous => {
        if (previous.analysis !== analysis || previous.episode !== episode || !previous.playing) return previous;
        const next = Math.min(endIndex, previous.cursor + elapsed * 125 * speed);
        return { ...previous, cursor: next, playing: next < endIndex };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analysis, episode, endIndex, playing, speed]);
  const togglePlayback = () => setPlayback({ analysis, episode, cursor: !playing && cursor >= endIndex ? episode.peakIndex : cursor, playing: !playing });
  const phase = index === episode.peakIndex ? (englishMode ? 'Previous high' : '前期高点')
    : index === episode.troughIndex ? (englishMode ? 'Trough' : '区间谷底')
      : episode.recovered && index >= episode.recoveryIndex ? (englishMode ? 'High recovered' : '重回前高')
        : index < episode.troughIndex ? (englishMode ? 'Declining' : '下跌途中') : (englishMode ? 'Recovering' : '修复途中');
  const playLabel = playing ? (englishMode ? 'Pause replay' : '暂停播放') : index >= endIndex ? (englishMode ? 'Replay episode' : '重播这段') : (englishMode ? 'Continue replay' : '继续播放');
  const PlayIcon = playing ? Pause : index >= endIndex ? RotateCcw : Play;
  const milestones = [
    [englishMode ? 'Previous high' : '前期高点', episode.peakDate, episode.peakValue],
    [englishMode ? 'Trough' : '区间谷底', episode.troughDate, episode.troughValue],
    [episode.recovered ? (englishMode ? 'First recovery' : '首次修复') : (englishMode ? 'Observed through' : '观察截止'), episode.recoveryDate ?? analysis.asOfDate, analysis.points[endIndex].value],
  ];
  return <>
    <div className="ic-dd-journey-head"><div><span className="ic-dd-eyebrow">{point.date}</span><strong>{formatInvestmentAmount(point.value, englishMode)}</strong></div><div className="ic-dd-journey-change"><span className="ic-dd-eyebrow">{englishMode ? 'From this previous high' : '相对这次前高'}</span><strong style={{ color: relative < 0 ? GREEN : RED }}>{formatInvestmentPercent(relative)}</strong></div></div>
    <JourneyChart analysis={analysis} episode={episode} symbol={symbol} index={index} englishMode={englishMode} />
    <div className="ic-dd-player"><button type="button" className="ic-dd-play" aria-pressed={playing} onClick={togglePlayback}><PlayIcon size={15} aria-hidden="true" />{playLabel}</button><select className="ic-dd-speed" aria-label={englishMode ? 'Replay speed' : '播放速度'} value={speed} onChange={event => setSpeed(Number(event.target.value))}>{SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}</select><span>{phase}</span></div>
    <input className="ic-dd-scrubber" type="range" aria-label={englishMode ? 'Drawdown replay progress' : '回撤回放进度'} aria-valuetext={`${point.date}, ${formatInvestmentPercent(relative)}`} min={episode.peakIndex} max={endIndex} step="1" value={index} onChange={event => setPlayback({ analysis, episode, cursor: Number(event.target.value), playing })} />
    <div className="ic-dd-milestones">{milestones.map(([label, date, value]) => <div className="ic-dd-milestone" key={label}><span>{label}</span><strong>{date}</strong><b>{formatInvestmentAmount(value, englishMode)}</b></div>)}</div>
    <div className="ic-dd-duration">
      <div><span>{englishMode ? 'High → trough' : '高点 → 谷底'}</span><strong>{dayCount(episode.declineDays, englishMode)}</strong></div>
      <div><span>{episode.recovered ? (englishMode ? 'Trough → recovery' : '谷底 → 修复') : (englishMode ? 'Waiting since trough' : '谷底后已等待')}</span><strong>{dayCount(episode.reboundDays ?? calendarDays(episode.troughDate, analysis.asOfDate), englishMode)}</strong></div>
      <div className="ic-dd-total"><span>{episode.recovered ? (englishMode ? 'Total time to recover the high' : '重回前高，共经历') : (englishMode ? 'Unrecovered, elapsed so far' : '尚未修复，已经历')}</span><strong>{dayCount(episode.underwaterDays, englishMode)}</strong></div>
      <div><span>{englishMode ? 'Maximum decline' : '最大跌幅'}</span><strong className="ic-dd-green">{formatInvestmentPercent(episode.drawdownPct)}</strong></div>
      <div><span>{englishMode ? 'Gain needed from trough to high' : '谷底修复前高所需涨幅'}</span><strong className="ic-dd-red">{formatInvestmentPercent(episode.recoveryGainPct)}</strong></div>
    </div>
  </>;
}

function PrincipalRisk({ analysis, symbol, englishMode }) {
  const stats = analysis.principalStats;
  const recovery = !stats.everBelowPrincipal ? (englishMode ? 'Never below principal' : '未跌破本金') : stats.minimumRecoveryDate ?? (englishMode ? 'Not recovered' : '尚未回本');
  const recoveryDetail = stats.minimumRecoveryDays !== null
    ? `${englishMode ? 'From the lowest point: ' : '从最低点起 '}${dayCount(stats.minimumRecoveryDays, englishMode)}`
    : stats.currentlyBelowPrincipal ? (englishMode ? 'Still below principal at the last observation' : '截至数据末日仍低于本金')
      : (englishMode ? 'Never fell below principal during this period' : '整个区间未跌破本金');
  return <section className="ic-dd-principal-section">
    <div className="ic-dd-section-head"><h2>{englishMode ? 'Looking only at the initial principal' : '如果只看投入本金'}</h2><span>{symbol} · {englishMode ? 'Invested ' : '投入 '}{formatInvestmentAmount(analysis.principal, englishMode)}</span></div>
    <div className="ic-dd-principal-stats"><div><span>{englishMode ? 'Lowest portfolio value' : '期间最低资产'}</span><strong className={stats.maximumLossPct < 0 ? 'ic-dd-green' : undefined}>{formatInvestmentAmount(stats.minimumValue, englishMode)}</strong><small>{stats.minimumDate} · {formatInvestmentPercent(stats.maximumLossPct)}</small></div><div><span>{englishMode ? 'Principal recovery after the low' : '最低点后回到本金'}</span><strong>{recovery}</strong><small>{recoveryDetail}</small></div></div>
  </section>;
}

function DrawdownAnalysis({ data, englishMode }) {
  const { symbols, analyses } = data;
  const [selection, setSelection] = React.useState({ data, symbol: symbols[0], kind: 'max', episodeId: null });
  const current = selection.data === data ? selection : { data, symbol: symbols[0], kind: 'max', episodeId: null };
  const active = current.symbol;
  const analysis = analyses[active];
  const journeyRef = React.useRef(null);
  const difference = analyses[symbols[0]].maxDrawdownPct - analyses[symbols[1]].maxDrawdownPct;
  const colors = React.useMemo(() => Object.fromEntries(symbols.map((symbol, index) => [symbol, Math.abs(difference) < 1e-10 ? INVESTMENT_NEUTRAL_COLOR : ((index === 0 ? difference : -difference) > 0 ? RED : GREEN)])), [symbols, difference]);
  const activate = React.useCallback(symbol => setSelection({ data, symbol, kind: 'max', episodeId: null }), [data]);
  const episode = current.kind === 'custom' ? analysis.episodes.find(item => item.id === current.episodeId) ?? analysis.maxDrawdownEpisode
    : current.kind === 'longest' ? analysis.longestEpisode : current.kind === 'latest' ? analysis.episodes.at(-1) : analysis.maxDrawdownEpisode;
  const episodes = React.useMemo(() => [...analysis.episodes].sort((a, b) => b.peakDate.localeCompare(a.peakDate)), [analysis]);
  return <div className="ic-dd-body">
    <section className="ic-dd-comparison" aria-label={englishMode ? 'Drawdown comparison' : '回撤体检'}>{symbols.map(symbol => {
      const item = analyses[symbol], maximum = item.maxDrawdownEpisode;
      return <button type="button" className="ic-dd-metric" key={symbol} aria-pressed={symbol === active} aria-label={englishMode ? `Select ${symbol} drawdown details` : `选择 ${symbol} 回撤详情`} onClick={() => activate(symbol)}>
        <div className="ic-dd-identity"><span style={{ color: colors[symbol] }}>{symbol}</span><small className={symbol === active ? 'ic-dd-selected' : undefined}>{symbol === active ? (englishMode ? 'Selected' : '查看中') : (englishMode ? 'View details' : '查看详情')}</small></div>
        <div className="ic-dd-label">{englishMode ? 'Maximum drawdown' : '区间最大回撤'}</div><div className="ic-dd-depth ic-dd-green">{formatInvestmentPercent(item.maxDrawdownPct)}</div>
        <div className="ic-dd-wait"><span>{maximum && !maximum.recovered ? (englishMode ? 'Unrecovered · elapsed' : '未修复 · 已历时') : (englishMode ? 'High → recovery' : '前高 → 修复')}</span><strong>{maximum ? dayCount(maximum.underwaterDays, englishMode) : (englishMode ? 'No drawdown' : '无回撤')}</strong></div>
      </button>;
    })}</section>
    <DrawdownOverview data={data} active={active} colors={colors} onActivate={activate} englishMode={englishMode} />
    <section className="ic-dd-journey" ref={journeyRef}>
      <div className="ic-dd-section-head"><h2>{active} · {englishMode ? 'A drawdown, from high to recovery' : '一段回撤的全过程'}</h2><span>{episode ? (episode.recovered ? (englishMode ? 'High recovered' : '已修复前高') : (englishMode ? 'Unrecovered' : '尚未修复')) : (englishMode ? 'No drawdown' : '无回撤')}</span></div>
      <div className="ic-dd-episode-tabs" role="group" aria-label={englishMode ? 'Drawdown episode' : '回撤区间'}>{[['max', englishMode ? 'Deepest' : '最大回撤'], ['longest', englishMode ? 'Longest wait' : '最长等待'], ['latest', englishMode ? 'Latest' : '最近一次']].map(([kind, label]) => <button type="button" key={kind} aria-pressed={current.kind === kind} onClick={() => setSelection({ ...current, kind, episodeId: null })}>{label}</button>)}</div>
      {episode ? <DrawdownJourney key={`${active}:${current.kind}:${episode.id}`} analysis={analysis} episode={episode} symbol={active} englishMode={englishMode} /> : <p className="ic-dd-empty">{englishMode ? 'No drawdown occurred in this observed period.' : '这个观察区间尚未发生回撤。'}</p>}
    </section>
    <PrincipalRisk analysis={analysis} symbol={active} englishMode={englishMode} />
    <details className="ic-dd-history"><summary>{englishMode ? 'Other drawdown episodes' : '其他回撤区间'}<span>{episodes.length} {englishMode ? 'episodes' : '段'}</span></summary>
      {episodes.slice(0, 8).map(item => <button type="button" className="ic-dd-history-row" key={item.id} aria-label={englishMode ? `Replay drawdown from ${item.peakDate}` : `重播 ${item.peakDate} 开始的回撤`} onClick={() => { setSelection({ ...current, kind: 'custom', episodeId: item.id }); journeyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><div><strong>{item.peakDate} → {item.recoveryDate ?? (englishMode ? 'Unrecovered' : '尚未修复')}</strong><small>{englishMode ? 'Trough ' : '谷底 '}{item.troughDate} · {dayCount(item.underwaterDays, englishMode)}</small></div><div><strong className="ic-dd-green">{formatInvestmentPercent(item.drawdownPct)}</strong><small>{englishMode ? 'View episode ›' : '查看过程 ›'}</small></div></button>)}
      {episodes.length > 8 && <p className="ic-dd-empty">{englishMode ? 'The latest eight episodes are shown by starting date.' : '按开始日期展示最近 8 段。'}</p>}
      {episodes.length === 0 && <p className="ic-dd-empty">{englishMode ? 'No drawdown episodes in this period.' : '这个区间没有回撤记录。'}</p>}
    </details>
    <details className="ic-dd-method"><summary>{englishMode ? 'Drawdown calculation methodology' : '回撤计算口径'}</summary>
      <p>{englishMode ? 'Drawdown is the decline from a previous high in adjusted daily closing prices within the selected period. Recovery means reaching that high again, not merely recovering the original principal. These are shown separately.' : '回撤是相对所选区间内此前最高复权收盘价的跌幅；修复指重新达到该高点，不等于回到最初投入本金。这里分别展示两种口径。'}</p>
      <p>{englishMode ? 'Durations use calendar days: high to trough is the decline, trough to first recovery is the rebound, and high to recovery is the total elapsed time. Unrecovered episodes are measured only through the last observed date; future recovery dates are not predicted.' : '等待按日历天计算：高点到谷底为下跌期，谷底到首次修复为反弹期；高点到修复为完整历时。未修复只计算到数据截止日，不预测未来日期。'}</p>
      <p>{englishMode ? 'Both views reuse the same adjusted daily history and common trading days. Portfolio values include the initial principal; returns are measured against principal, while drawdowns are measured against the previous high. This is a one-time investment with fractional shares, excluding taxes, fees and exchange-rate changes. Missing and pre-listing prices are not fabricated.' : '两个视图复用同一份复权日线和共同交易日。资产金额包含投入本金；收益以本金为基准，回撤以此前高点为基准。按等额一次投入、允许碎股计算，不计税费与汇率；上市前及缺失数据不补造。'}</p>
    </details>
  </div>;
}

export default function InvestmentDrawdownView({ model, englishMode = false }) {
  const result = React.useMemo(() => {
    try { return { data: buildInvestmentDrawdownModel(model), error: null }; }
    catch (error) { return { data: null, error }; }
  }, [model]);
  if (!result.data) return <p className="ic-feedback ic-invalid" role="alert">{englishMode ? 'Drawdown analysis is unavailable for this history. Please refresh the historical data.' : '这段历史数据暂时无法计算回撤，请刷新历史数据后重试。'}</p>;
  return <DrawdownAnalysis data={result.data} englishMode={englishMode} />;
}
