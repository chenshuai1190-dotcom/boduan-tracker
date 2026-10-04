import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { buildInvestmentDrawdownModel } from '../lib/investmentDrawdownModel.js';
import {
  formatInvestmentAmount,
  formatInvestmentPercent,
  investmentChangeColor,
  INVESTMENT_LEADING_COLOR,
  INVESTMENT_TRAILING_COLOR,
  INVESTMENT_NEUTRAL_COLOR,
} from './InvestmentComparisonChart.jsx';
import './InvestmentDrawdown.css';

const SPEEDS = [0.1, 0.2, 0.4, 0.8, 1];
const HISTORY_MIN_DRAWDOWN_PCT = 10;
const dayCount = (value, englishMode) => Number.isFinite(value)
  ? `${value.toLocaleString('en-US')} ${englishMode ? 'days' : '天'}` : '—';
const calendarDays = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
const linePath = (points, x, y) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point).toFixed(2)},${y(point).toFixed(2)}`).join(' ');

// Stock prices always retain their verified USD adjusted-close basis.
function formatDrawdownPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `$${value.toLocaleString('en-US', value < 1
    ? { minimumSignificantDigits: 3, maximumSignificantDigits: 4 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

const DrawdownOverview = React.memo(function DrawdownOverview({ data, active, colors, onActivate, englishMode, marketColorMode = 'redUpGreenDown' }) {
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
  React.useEffect(() => {
    if (currentInspection.selectedIndex === null || typeof document === 'undefined') return undefined;
    // A completed outside click dismisses inspection; pointerdown/scroll must
    // not, since they can be the beginning of a native vertical swipe.
    const dismissOutside = event => {
      const chart = containerRef.current;
      if (!chart || chart.contains(event.target)) return;
      gestureRef.current = null;
      setInspection({ data, selectedIndex: null, hoverIndex: null });
    };
    document.addEventListener('click', dismissOutside, true);
    return () => document.removeEventListener('click', dismissOutside, true);
  }, [containerRef, data, currentInspection.selectedIndex]);
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
        <text className="ic-dd-value-label" x={x(lowest) + (selectedAnchor === 'end' ? -8 : 8)} y={Math.max(32, y(lowest.drawdownPct) - 12)} textAnchor={selectedAnchor}>{active} <tspan fill={investmentChangeColor(lowest.drawdownPct, marketColorMode)}>{formatInvestmentPercent(lowest.drawdownPct)}</tspan></text>
        {inspecting && <g><line x1={x(points[readoutIndex])} x2={x(points[readoutIndex])} y1={top} y2={height - bottom} className="ic-dd-inspection-line" strokeDasharray="3 4" />{symbols.map(symbol => <circle key={symbol} cx={x(points[readoutIndex])} cy={y(analyses[symbol].points[readoutIndex].drawdownPct)} r="3" fill={colors[symbol]} />)}</g>}
      </svg>
    </div>
    <div className="ic-dd-overview-readout">
      <span>{points[readoutIndex].date}</span><small>{englishMode ? 'Adjusted close · USD' : '复权收盘价 · USD'}</small>
      <div className="ic-dd-price-comparison">{symbols.map(symbol => {
        const observed = analyses[symbol].points[readoutIndex];
        return <div className="ic-dd-price-card" data-symbol={symbol} key={symbol}>
          <div className="ic-dd-price-identity">{symbol}</div>
          <strong data-adjusted-price="current">{formatDrawdownPrice(observed.adjustedCloseUsd)}</strong>
          <dl>
            <div><dt>{englishMode ? 'Previous high' : '对应前高'}</dt><dd data-adjusted-price="peak">{formatDrawdownPrice(observed.peakAdjustedCloseUsd)}</dd></div>
            <div><dt>{englishMode ? 'High date' : '前高日期'}</dt><dd>{observed.peakDate ?? '—'}</dd></div>
            <div><dt>{englishMode ? 'Drawdown' : '当前回撤'}</dt><dd style={{ color: investmentChangeColor(observed.drawdownPct, marketColorMode) }}>{formatInvestmentPercent(observed.drawdownPct)}</dd></div>
            <div><dt>{englishMode ? 'Gain to high' : '修复所需涨幅'}</dt><dd style={{ color: investmentChangeColor(observed.recoveryGainPct, marketColorMode) }}>{formatInvestmentPercent(observed.recoveryGainPct)}</dd></div>
          </dl>
        </div>;
      })}</div>
    </div>
  </section>;
});

function JourneyChart({ analysis, episode, symbol, index, onSelect, englishMode, marketColorMode = 'redUpGreenDown' }) {
  const [containerRef, width] = useChartWidth();
  const gestureRef = React.useRef(null);
  const clipId = React.useId().replace(/:/g, '');
  const endIndex = episode.recoveryIndex ?? analysis.points.length - 1;
  const point = analysis.points[index];
  const peak = analysis.points[episode.peakIndex];
  const visible = analysis.points.slice(episode.peakIndex, index + 1);
  const prices = visible.map(row => row.adjustedCloseUsd).filter(value => Number.isFinite(value) && value > 0);
  const hasPrices = prices.length > 0 && Number.isFinite(peak.adjustedCloseUsd) && peak.adjustedCloseUsd > 0;
  const minPrice = hasPrices ? Math.min(...prices) : 0;
  const maxPrice = hasPrices ? Math.max(...prices) : 1;
  const spread = Math.max(maxPrice - minPrice, maxPrice * .15);
  const minimum = Math.max(0, minPrice - spread * .18);
  const maximum = maxPrice + spread * .24;
  const ticks = [maximum, (maximum + minimum) / 2, minimum];
  const axisPrice = value => value < 1 ? value.toLocaleString('en-US', { maximumSignificantDigits: 3 }) : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const height = 310, left = Math.max(48, Math.min(94, Math.max(...ticks.map(value => axisPrice(value).length)) * 6 + 10)), right = 12, top = 26, bottom = 31;
  const x = row => left + (row.index - episode.peakIndex) / Math.max(1, endIndex - episode.peakIndex) * (width - left - right);
  const y = value => top + (maximum - value) / (maximum - minimum) * (height - top - bottom);
  let connected = false;
  const path = visible.map(row => {
    if (!Number.isFinite(row.adjustedCloseUsd) || row.adjustedCloseUsd <= 0) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return `${command}${x(row).toFixed(2)},${y(row.adjustedCloseUsd).toFixed(2)}`;
  }).join(' ');
  const baseY = hasPrices ? y(peak.adjustedCloseUsd) : top;
  const positiveColor = investmentChangeColor(1, marketColorMode);
  const negativeColor = investmentChangeColor(-1, marketColorMode);
  const relative = (point.value / episode.peakValue - 1) * 100;
  const currentColor = investmentChangeColor(relative, marketColorMode);
  const markerDefinitions = [
    { kind: 'peak', at: episode.peakIndex, label: englishMode ? 'High' : '前高' },
    { kind: 'trough', at: episode.troughIndex, label: episode.troughIndex === endIndex ? (englishMode ? 'Low · latest' : '谷底 · 最新') : (englishMode ? 'Low' : '谷底') },
    { kind: 'end', at: endIndex, label: episode.recovered ? (englishMode ? 'Recovered' : '修复') : (englishMode ? 'Latest' : '最新') },
  ];
  const markers = markerDefinitions.filter(marker => !(marker.kind === 'end' && episode.troughIndex === endIndex) && marker.at <= index && Number.isFinite(analysis.points[marker.at].adjustedCloseUsd) && analysis.points[marker.at].adjustedCloseUsd > 0);
  const selectAt = event => {
    if (!onSelect) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const chartX = (event.clientX - bounds.left) / Math.max(1, bounds.width) * width;
    const ratio = Math.max(0, Math.min(1, (chartX - left) / Math.max(1, width - left - right)));
    onSelect(Math.round(episode.peakIndex + ratio * (endIndex - episode.peakIndex)));
  };
  return <div ref={containerRef} className="ic-dd-chart ic-dd-journey-chart" role="slider" tabIndex={0}
    aria-label={englishMode ? 'Inspect drawdown share prices' : '查看回撤股价'} aria-valuemin={episode.peakIndex} aria-valuemax={endIndex} aria-valuenow={index}
    aria-valuetext={`${point.date}, ${formatDrawdownPrice(point.adjustedCloseUsd)} USD, ${formatInvestmentPercent(relative)}`}
    onPointerDown={event => {
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: null };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }}
    onPointerMove={event => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
      if (!gesture.direction && Math.max(dx, dy) > 8) gesture.direction = dy > dx ? 'vertical' : 'horizontal';
      if (gesture.direction === 'horizontal') selectAt(event);
    }}
    onPointerUp={event => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      if (gesture.direction !== 'vertical') selectAt(event);
      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { gestureRef.current = null; }} onLostPointerCapture={() => { gestureRef.current = null; }}
    onKeyDown={event => {
      if (!onSelect || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      onSelect(event.key === 'Home' ? episode.peakIndex : event.key === 'End' ? endIndex : Math.max(episode.peakIndex, Math.min(endIndex, index + (event.key === 'ArrowLeft' ? -1 : 1))));
    }}>
    {hasPrices ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={englishMode ? `${symbol} adjusted close in USD from ${episode.peakDate}` : `${symbol} 从 ${episode.peakDate} 开始的美元复权股价走势`}>
      {ticks.map((value, tick) => <g key={tick}><line className="ic-dd-grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 7} y={y(value) + 4} textAnchor="end">{axisPrice(value)}</text></g>)}
      <line className="ic-dd-baseline" x1={left} x2={width - right} y1={baseY} y2={baseY} strokeDasharray="4 5" />
      <defs><clipPath id={`ic-dd-above-${clipId}`}><rect x={left - 3} y="0" width={width - left + 3} height={Math.max(0, baseY)} /></clipPath></defs>
      <path d={path} fill="none" stroke={negativeColor} strokeWidth="2" strokeLinejoin="round" />
      <path d={path} fill="none" stroke={positiveColor} strokeWidth="2" strokeLinejoin="round" clipPath={`url(#ic-dd-above-${clipId})`} />
      {markers.map(marker => {
        const row = analysis.points[marker.at], px = x(row), py = y(row.adjustedCloseUsd);
        const anchor = px > width * .7 ? 'end' : px < width * .3 ? 'start' : 'middle';
        const color = investmentChangeColor((row.value / episode.peakValue - 1) * 100, marketColorMode);
        const labelY = Math.max(16, Math.min(height - bottom - 2, py + (marker.kind === 'trough' ? 21 : -13)));
        return <g key={marker.kind} data-drawdown-marker={marker.kind}>
          <circle cx={px} cy={py} r="3.5" fill={color} />
          <text className="ic-dd-value-label" x={px} y={labelY} textAnchor={anchor}>{marker.label} <tspan>{formatDrawdownPrice(row.adjustedCloseUsd)}</tspan></text>
        </g>;
      })}
      {Number.isFinite(point.adjustedCloseUsd) && point.adjustedCloseUsd > 0 && <g>
        <line x1={x(point)} x2={x(point)} y1={top} y2={height - bottom} className="ic-dd-inspection-line" strokeDasharray="3 4" />
        <circle cx={x(point)} cy={y(point.adjustedCloseUsd)} r="8" fill={currentColor} opacity=".12" /><circle cx={x(point)} cy={y(point.adjustedCloseUsd)} r="4" fill={currentColor} />
      </g>}
      {[...new Set([episode.peakIndex, Math.floor((episode.peakIndex + endIndex) / 2), endIndex])].map(pointIndex => <text key={pointIndex} x={x(analysis.points[pointIndex])} y={height - 7} textAnchor={pointIndex === episode.peakIndex ? 'start' : pointIndex === endIndex ? 'end' : 'middle'}>{analysis.points[pointIndex].date.slice(0, 7)}</text>)}
    </svg> : <div className="ic-dd-price-unavailable">{englishMode ? 'Adjusted share prices unavailable' : '复权股价暂不可用'}</div>}
  </div>;
}

function DrawdownJourney({ analysis, episode, symbol, englishMode, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', displayRate = 1 }) {
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
    ['peak', englishMode ? 'Previous high' : '前期高点', episode.peakIndex],
    ['trough', englishMode ? 'Trough' : '区间谷底', episode.troughIndex],
    ['end', episode.recovered ? (englishMode ? 'First recovery' : '首次修复') : (englishMode ? 'Latest price' : '最新价'), endIndex],
  ];
  const seek = nextIndex => setPlayback({ analysis, episode, cursor: nextIndex, playing });
  return <>
    <div className="ic-dd-price-basis">{englishMode ? 'Adjusted close · USD' : '复权收盘价 · USD'}</div>
    <div className="ic-dd-journey-head"><div><span className="ic-dd-eyebrow">{point.date}</span><strong data-adjusted-price="journey">{formatDrawdownPrice(point.adjustedCloseUsd)}</strong><small className="ic-dd-portfolio-value">{englishMode ? 'Portfolio ' : '模拟资产 '}{formatInvestmentAmount(point.value, englishMode, { displayCurrency, displayRate })}</small></div><div className="ic-dd-journey-change"><span className="ic-dd-eyebrow">{englishMode ? 'From this previous high' : '相对这次前高'}</span><strong style={{ color: investmentChangeColor(relative, marketColorMode) }}>{formatInvestmentPercent(relative)}</strong></div></div>
    <JourneyChart analysis={analysis} episode={episode} symbol={symbol} index={index} onSelect={seek} englishMode={englishMode} marketColorMode={marketColorMode} />
    <div className="ic-dd-player"><button type="button" className="ic-dd-play" aria-pressed={playing} onClick={togglePlayback}><PlayIcon size={15} aria-hidden="true" />{playLabel}</button><select className="ic-dd-speed" aria-label={englishMode ? 'Replay speed' : '播放速度'} value={speed} onChange={event => setSpeed(Number(event.target.value))}>{SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}</select><span>{phase}</span></div>
    <input className="ic-dd-scrubber" type="range" aria-label={englishMode ? 'Drawdown replay progress' : '回撤回放进度'} aria-valuetext={`${point.date}, ${formatInvestmentPercent(relative)}, ${formatDrawdownPrice(point.adjustedCloseUsd)} USD`} min={episode.peakIndex} max={endIndex} step="1" value={index} onChange={event => seek(Number(event.target.value))} />
    <div className="ic-dd-milestones">{milestones.map(([kind, label, pointIndex]) => {
      const row = analysis.points[pointIndex];
      const reached = pointIndex <= index;
      const change = (row.value / episode.peakValue - 1) * 100;
      return <button type="button" className="ic-dd-milestone" data-drawdown-milestone={kind} key={kind} onClick={() => seek(pointIndex)} aria-label={englishMode ? `Inspect ${label.toLowerCase()} on ${row.date}` : `查看${label} ${row.date}`}>
        <span>{label}</span><strong data-adjusted-price={kind}>{reached ? formatDrawdownPrice(row.adjustedCloseUsd) : '—'}</strong><time>{row.date}</time>
        <b style={{ color: investmentChangeColor(reached ? change : null, marketColorMode) }}>{reached ? formatInvestmentPercent(change) : (englishMode ? 'Not replayed' : '尚未回放')}</b>
      </button>;
    })}</div>
    <div className="ic-dd-duration">
      <div><span>{englishMode ? 'High → trough' : '高点 → 谷底'}</span><strong>{dayCount(episode.declineDays, englishMode)}</strong></div>
      <div><span>{episode.recovered ? (englishMode ? 'Trough → recovery' : '谷底 → 修复') : (englishMode ? 'Waiting since trough' : '谷底后已等待')}</span><strong>{dayCount(episode.reboundDays ?? calendarDays(episode.troughDate, analysis.asOfDate), englishMode)}</strong></div>
      <div className="ic-dd-total"><span>{episode.recovered ? (englishMode ? 'Total time to recover the high' : '重回前高，共经历') : (englishMode ? 'Unrecovered, elapsed so far' : '尚未修复，已经历')}</span><strong>{dayCount(episode.underwaterDays, englishMode)}</strong></div>
      <div><span>{englishMode ? 'Maximum decline' : '最大跌幅'}</span><strong style={{ color: investmentChangeColor(episode.drawdownPct, marketColorMode) }}>{formatInvestmentPercent(episode.drawdownPct)}</strong></div>
      <div><span>{englishMode ? 'Gain needed from trough to high' : '谷底修复前高所需涨幅'}</span><strong style={{ color: investmentChangeColor(episode.recoveryGainPct, marketColorMode) }}>{formatInvestmentPercent(episode.recoveryGainPct)}</strong></div>
    </div>
  </>;
}

function PrincipalRisk({ analysis, symbol, englishMode, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', displayRate = 1 }) {
  const stats = analysis.principalStats;
  const recovery = !stats.everBelowPrincipal ? (englishMode ? 'Never below principal' : '未跌破本金') : stats.minimumRecoveryDate ?? (englishMode ? 'Not recovered' : '尚未回本');
  const recoveryDetail = stats.minimumRecoveryDays !== null
    ? `${englishMode ? 'From the lowest point: ' : '从最低点起 '}${dayCount(stats.minimumRecoveryDays, englishMode)}`
    : stats.currentlyBelowPrincipal ? (englishMode ? 'Still below principal at the last observation' : '截至数据末日仍低于本金')
      : (englishMode ? 'Never fell below principal during this period' : '整个区间未跌破本金');
  return <section className="ic-dd-principal-section">
    <div className="ic-dd-section-head"><h2>{englishMode ? 'Looking only at the initial principal' : '如果只看投入本金'}</h2><span>{symbol} · {englishMode ? 'Invested ' : '投入 '}{formatInvestmentAmount(analysis.principal, englishMode, { displayCurrency, displayRate })}</span></div>
    <div className="ic-dd-principal-stats"><div><span>{englishMode ? 'Lowest portfolio value' : '期间最低资产'}</span><strong style={stats.maximumLossPct < 0 ? { color: investmentChangeColor(stats.maximumLossPct, marketColorMode) } : undefined}>{formatInvestmentAmount(stats.minimumValue, englishMode, { displayCurrency, displayRate })}</strong><small>{stats.minimumDate} · <span style={{ color: investmentChangeColor(stats.maximumLossPct, marketColorMode) }}>{formatInvestmentPercent(stats.maximumLossPct)}</span></small></div><div><span>{englishMode ? 'Principal recovery after the low' : '最低点后回到本金'}</span><strong>{recovery}</strong><small>{recoveryDetail}</small></div></div>
  </section>;
}

function DrawdownAnalysis({ data, englishMode, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', displayRate = 1 }) {
  const { symbols, analyses } = data;
  const [selection, setSelection] = React.useState({ data, symbol: symbols[0], kind: 'max', episodeId: null });
  const current = selection.data === data ? selection : { data, symbol: symbols[0], kind: 'max', episodeId: null };
  const active = current.symbol;
  const analysis = analyses[active];
  const journeyRef = React.useRef(null);
  const difference = analyses[symbols[0]].maxDrawdownPct - analyses[symbols[1]].maxDrawdownPct;
  const colors = React.useMemo(() => Object.fromEntries(symbols.map((symbol, index) => [symbol, Math.abs(difference) < 1e-10 ? INVESTMENT_NEUTRAL_COLOR : ((index === 0 ? difference : -difference) > 0 ? INVESTMENT_LEADING_COLOR : INVESTMENT_TRAILING_COLOR)])), [symbols, difference]);
  const activate = React.useCallback(symbol => setSelection({ data, symbol, kind: 'max', episodeId: null }), [data]);
  // Latest and the history list share the episode-depth threshold. Keep all
  // observations for the overview, deepest drawdown and longest waiting period.
  // Allow arithmetic noise at exactly 10%, not display-rounded percentages.
  const episodes = React.useMemo(() => analysis.episodes
    .filter(item => item.drawdownPct <= -HISTORY_MIN_DRAWDOWN_PCT + Number.EPSILON * 100)
    .sort((a, b) => b.peakDate.localeCompare(a.peakDate)), [analysis]);
  const episode = current.kind === 'custom' ? analysis.episodes.find(item => item.id === current.episodeId) ?? analysis.maxDrawdownEpisode
    : current.kind === 'longest' ? analysis.longestEpisode : current.kind === 'latest' ? episodes[0] ?? null : analysis.maxDrawdownEpisode;
  return <div className="ic-dd-body" style={{ '--ic-dd-positive': investmentChangeColor(1, marketColorMode), '--ic-dd-negative': investmentChangeColor(-1, marketColorMode) }}>
    <section className="ic-dd-comparison" aria-label={englishMode ? 'Drawdown comparison' : '回撤体检'}>{symbols.map(symbol => {
      const item = analyses[symbol], maximum = item.maxDrawdownEpisode;
      return <button type="button" className="ic-dd-metric" key={symbol} aria-pressed={symbol === active} aria-label={englishMode ? `Select ${symbol} drawdown details` : `选择 ${symbol} 回撤详情`} onClick={() => activate(symbol)}>
        <div className="ic-dd-identity"><span style={{ color: colors[symbol] }}>{symbol}</span><small className={symbol === active ? 'ic-dd-selected' : undefined}>{symbol === active ? (englishMode ? 'Selected' : '查看中') : (englishMode ? 'View details' : '查看详情')}</small></div>
        <div className="ic-dd-label">{englishMode ? 'Maximum drawdown' : '区间最大回撤'}</div><div className="ic-dd-depth" style={{ color: investmentChangeColor(item.maxDrawdownPct, marketColorMode) }}>{formatInvestmentPercent(item.maxDrawdownPct)}</div>
        <div className="ic-dd-wait"><span>{maximum && !maximum.recovered ? (englishMode ? 'Unrecovered · elapsed' : '未修复 · 已历时') : (englishMode ? 'High → recovery' : '前高 → 修复')}</span><strong>{maximum ? dayCount(maximum.underwaterDays, englishMode) : (englishMode ? 'No drawdown' : '无回撤')}</strong></div>
      </button>;
    })}</section>
    <DrawdownOverview data={data} active={active} colors={colors} onActivate={activate} englishMode={englishMode} marketColorMode={marketColorMode} />
    <section className="ic-dd-journey" ref={journeyRef}>
      <div className="ic-dd-section-head"><h2>{active} · {englishMode ? 'A drawdown, from high to recovery' : '一段回撤的全过程'}</h2><span>{episode ? (episode.recovered ? (englishMode ? 'High recovered' : '已修复前高') : (englishMode ? 'Unrecovered' : '尚未修复')) : current.kind === 'latest' ? (englishMode ? 'No qualifying episode' : '暂无符合区间') : (englishMode ? 'No drawdown' : '无回撤')}</span></div>
      <div className="ic-dd-episode-tabs" role="group" aria-label={englishMode ? 'Drawdown episode' : '回撤区间'}>{[['max', englishMode ? 'Deepest' : '最大回撤'], ['longest', englishMode ? 'Longest wait' : '最长等待'], ['latest', englishMode ? 'Latest' : '最近一次']].map(([kind, label]) => <button type="button" key={kind} aria-pressed={current.kind === kind} onClick={() => setSelection({ ...current, kind, episodeId: null })}>{label}</button>)}</div>
      {episode ? <DrawdownJourney key={`${active}:${current.kind}:${episode.id}`} analysis={analysis} episode={episode} symbol={active} englishMode={englishMode} marketColorMode={marketColorMode} displayCurrency={displayCurrency} displayRate={displayRate} /> : <p className="ic-dd-empty">{current.kind === 'latest' ? (englishMode ? 'No drawdown episodes reached 10% in this period.' : '暂无达到 10% 的回撤。') : (englishMode ? 'No drawdown occurred in this observed period.' : '这个观察区间尚未发生回撤。')}</p>}
    </section>
    <PrincipalRisk analysis={analysis} symbol={active} englishMode={englishMode} marketColorMode={marketColorMode} displayCurrency={displayCurrency} displayRate={displayRate} />
    <details className="ic-dd-history"><summary>{englishMode ? 'Other drawdown episodes' : '其他回撤区间'}<span>≥{HISTORY_MIN_DRAWDOWN_PCT}% · {episodes.length} {englishMode ? 'episodes' : '段'}</span></summary>
      {episodes.slice(0, 8).map(item => <button type="button" className="ic-dd-history-row" key={item.id} aria-label={englishMode ? `Replay drawdown from ${item.peakDate}` : `重播 ${item.peakDate} 开始的回撤`} onClick={() => { setSelection({ ...current, kind: 'custom', episodeId: item.id }); journeyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><div><strong>{item.peakDate} → {item.recoveryDate ?? (englishMode ? 'Unrecovered' : '尚未修复')}</strong><small>{englishMode ? 'Trough ' : '谷底 '}{item.troughDate} · {dayCount(item.underwaterDays, englishMode)}</small></div><div><strong style={{ color: investmentChangeColor(item.drawdownPct, marketColorMode) }}>{formatInvestmentPercent(item.drawdownPct)}</strong><small>{englishMode ? 'View episode ›' : '查看过程 ›'}</small></div></button>)}
      {episodes.length > 8 && <p className="ic-dd-empty">{englishMode ? 'The latest eight episodes are shown by starting date.' : '按开始日期展示最近 8 段。'}</p>}
      {episodes.length === 0 && <p className="ic-dd-empty">{englishMode ? 'No drawdown episodes reached 10% in this period.' : '这个区间没有达到 10% 的回撤记录。'}</p>}
    </details>
  </div>;
}

export default function InvestmentDrawdownView({ model, englishMode = false, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', displayRate = 1 }) {
  const result = React.useMemo(() => {
    try { return { data: buildInvestmentDrawdownModel(model), error: null }; }
    catch (error) { return { data: null, error }; }
  }, [model]);
  if (!result.data) return <p className="ic-feedback ic-invalid" role="alert">{englishMode ? 'Drawdown analysis is unavailable for this history. Please refresh the historical data.' : '这段历史数据暂时无法计算回撤，请刷新历史数据后重试。'}</p>;
  return <DrawdownAnalysis data={result.data} englishMode={englishMode} marketColorMode={marketColorMode} displayCurrency={displayCurrency} displayRate={displayRate} />;
}
