import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { buildInvestmentDrawdownModel } from '../lib/investmentDrawdownModel.js';
import { fullStockDetailChartWindow, normalizeStockDetailChartWindow, transformStockDetailChartWindow, stockDetailChartDragIntent, deriveStockDetailReturnToLatest } from '../lib/watchlistStockDetail.js';
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
const OVERVIEW_MIN_POINTS = 20;
const dayCount = (value, englishMode) => Number.isFinite(value)
  ? `${value.toLocaleString('en-US')} ${englishMode ? 'days' : '天'}` : '—';
const calendarDays = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

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

const DrawdownOverview = React.memo(function DrawdownOverview({ data, active, colors, onActivate, focusVersion = 0, englishMode, marketColorMode = 'redUpGreenDown' }) {
  const [containerRef, width] = useChartWidth();
  const initialInspection = { data, active, focusVersion, selectedIndex: data.analyses[active].maxDrawdownEpisode?.troughIndex ?? null, hoverIndex: null };
  const [inspection, setInspection] = React.useState(initialInspection);
  const gestureRef = React.useRef(null);
  const pointersRef = React.useRef(new Map());
  const resetZoomRef = React.useRef(null);
  const [viewport, setViewport] = React.useState({ data, active, focusVersion, window: fullStockDetailChartWindow(data.analyses[active].points.length) });
  const matchesFocus = value => value.data === data && value.active === active && value.focusVersion === focusVersion;
  const currentInspection = matchesFocus(inspection) ? inspection : initialInspection;
  const { symbols, analyses } = data;
  const points = analyses[symbols[0]].points;
  const lastIndex = points.length - 1;
  const selected = analyses[active];
  const chartWindow = normalizeStockDetailChartWindow(matchesFocus(viewport) ? viewport.window : null, points.length);
  const zoomed = chartWindow.start > 0 || chartWindow.end < lastIndex;
  const visiblePoints = selected.points.slice(chartWindow.start, chartWindow.end + 1);
  const inWindow = index => index >= chartWindow.start && index <= chartWindow.end;
  const validPrice = row => Number.isFinite(row?.adjustedCloseUsd) && row.adjustedCloseUsd > 0;
  const prices = visiblePoints.filter(validPrice).map(row => row.adjustedCloseUsd);
  const hasPrices = prices.length > 0;
  const minPrice = hasPrices ? Math.min(...prices) : 0;
  const maxPrice = hasPrices ? Math.max(...prices) : 1;
  const spread = Math.max(maxPrice - minPrice, maxPrice * .15);
  const minimum = Math.max(0, minPrice - spread * .2);
  const maximum = maxPrice + spread * .18;
  const ticks = [maximum, (maximum + minimum) / 2, minimum];
  const axisPrice = value => value === 0 ? '$0.00' : formatDrawdownPrice(value);
  const height = 290, left = Math.max(48, Math.min(96, Math.max(...ticks.map(value => axisPrice(value).length)) * 6 + 10)), right = 8, top = 26, bottom = 32;
  const x = point => left + (point.index - chartWindow.start) / Math.max(1, chartWindow.end - chartWindow.start) * (width - left - right);
  const y = value => top + (maximum - value) / (maximum - minimum) * (height - top - bottom);
  let connected = false;
  const pricePath = visiblePoints.map(row => {
    if (!validPrice(row)) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return `${command}${x(row).toFixed(2)},${y(row.adjustedCloseUsd).toFixed(2)}`;
  }).join(' ');
  const maximumEpisode = selected.maxDrawdownEpisode;
  const markers = maximumEpisode ? [
    { kind: 'peak', point: selected.points[maximumEpisode.peakIndex], label: englishMode ? 'Episode high' : '本段前高' },
    { kind: 'trough', point: selected.points[maximumEpisode.troughIndex], label: englishMode ? 'Drawdown low' : '回撤谷底' },
    ...(maximumEpisode.recoveryIndex === null ? [] : [{ kind: 'recovery', point: selected.points[maximumEpisode.recoveryIndex], label: englishMode ? 'First recovery' : '首次修复' }]),
  ].filter(marker => validPrice(marker.point) && inWindow(marker.point.index)) : [];
  const inspecting = currentInspection.hoverIndex !== null || currentInspection.selectedIndex !== null;
  const readoutIndex = Math.max(0, Math.min(lastIndex, currentInspection.hoverIndex ?? currentInspection.selectedIndex ?? lastIndex));
  React.useEffect(() => {
    if (currentInspection.selectedIndex === null || typeof document === 'undefined') return undefined;
    // A completed outside click dismisses inspection; pointerdown/scroll must
    // not, since they can be the beginning of a native vertical swipe.
    const dismissOutside = event => {
      const chart = containerRef.current;
      if (!chart || chart.contains(event.target) || resetZoomRef.current?.contains(event.target)) return;
      clearPointers();
      setInspection({ data, active, focusVersion, selectedIndex: null, hoverIndex: null });
    };
    document.addEventListener('click', dismissOutside, true);
    return () => document.removeEventListener('click', dismissOutside, true);
  }, [containerRef, data, active, focusVersion, currentInspection.selectedIndex]);
  const updateInspection = patch => setInspection(current => ({ ...(matchesFocus(current) ? current : initialInspection), ...patch }));
  const updateWindow = window => setViewport({ data, active, focusVersion, window });
  const pointerGeometry = event => {
    const box = event.currentTarget.getBoundingClientRect();
    return { left: box.left + left / width * box.width, width: Math.max(1, (width - left - right) / width * box.width) };
  };
  const ratioAt = (clientX, geometry) => Math.max(0, Math.min(1, (clientX - geometry.left) / geometry.width));
  const indexAtPointer = event => Math.round(chartWindow.start + ratioAt(event.clientX, pointerGeometry(event)) * (chartWindow.end - chartWindow.start));
  const clearPreview = () => updateInspection({ hoverIndex: null });
  const clearPointers = () => {
    const pointers = [...pointersRef.current.entries()];
    pointersRef.current.clear();
    gestureRef.current = null;
    for (const [id, pointer] of pointers) {
      if (pointer.target?.hasPointerCapture?.(id)) pointer.target.releasePointerCapture(id);
    }
  };
  // Data/stock/card-focus replacement invalidates every outstanding gesture.
  // Cleanup also releases captures when this view unmounts.
  React.useEffect(() => {
    // Commit the new focus key, so switching away and back cannot revive a
    // previous stock's viewport even when a caller reuses its focusVersion.
    setViewport(current => matchesFocus(current) ? current : { data, active, focusVersion, window: fullStockDetailChartWindow(points.length) });
    setInspection(current => matchesFocus(current) ? current : initialInspection);
    return () => clearPointers();
  }, [data, active, focusVersion]);
  const cancelGesture = event => {
    if (event?.type === 'lostpointercapture' && !pointersRef.current.has(event.pointerId)) return;
    clearPointers();
    clearPreview();
  };
  const resetZoom = () => { clearPointers(); updateWindow(fullStockDetailChartWindow(points.length)); clearPreview(); };
  const resetInspection = () => { resetZoom(); updateInspection({ selectedIndex: null, hoverIndex: null }); };
  const pointerDown = event => {
    const pointers = pointersRef.current;
    const touch = event.pointerType === 'touch';
    if ((!touch && event.isPrimary === false) || (event.button !== undefined && event.button !== 0)) return;
    if (gestureRef.current && !matchesFocus(gestureRef.current)) clearPointers();
    // An isolated secondary touch can be left over after native vertical pan
    // cancellation; it must not start a fresh selection or pinch.
    if (touch && event.isPrimary === false && pointers.size === 0) return;
    if (pointers.has(event.pointerId)) return;
    if (pointers.size && (!touch || [...pointers.values()].some(pointer => pointer.type !== 'touch'))) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType, target: event.currentTarget });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.size === 1) {
      gestureRef.current = { data, active, focusVersion, kind: 'single', pointerId: event.pointerId, pointerType: event.pointerType,
        x: event.clientX, y: event.clientY, direction: 'pending', window: chartWindow, zoomed, geometry: pointerGeometry(event) };
      if (!zoomed || !touch) updateInspection({ hoverIndex: indexAtPointer(event) });
      return;
    }
    clearPreview();
    if (pointers.size !== 2 || gestureRef.current?.kind === 'blocked' || gestureRef.current?.direction === 'vertical') {
      gestureRef.current = { data, active, focusVersion, kind: 'blocked' };
      return;
    }
    const [a, b] = [...pointers.values()];
    const geometry = pointerGeometry(event);
    gestureRef.current = { data, active, focusVersion, kind: 'pinch', window: chartWindow, geometry,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), centerRatio: ratioAt((a.x + b.x) / 2, geometry) };
  };
  const pointerMove = event => {
    const pointers = pointersRef.current;
    const gesture = gestureRef.current;
    const pointer = pointers.get(event.pointerId);
    if (pointer && gesture && matchesFocus(gesture)) {
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (gesture.kind === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        updateWindow(transformStockDetailChartWindow(gesture.window, { pointCount: points.length, minPointCount: OVERVIEW_MIN_POINTS,
          scale: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) / gesture.distance,
          startCenterRatio: gesture.centerRatio, currentCenterRatio: ratioAt((a.x + b.x) / 2, gesture.geometry) }));
        clearPreview();
        return;
      }
      if (gesture.kind !== 'single' || gesture.pointerId !== event.pointerId) return;
      if (gesture.pointerType !== 'mouse' && gesture.direction === 'pending') {
        gesture.direction = stockDetailChartDragIntent(event.clientX - gesture.x, event.clientY - gesture.y);
      }
      if (gesture.direction === 'vertical') { clearPreview(); return; }
      if (gesture.zoomed && gesture.pointerType !== 'mouse') {
        if (gesture.direction === 'horizontal') {
          updateWindow(transformStockDetailChartWindow(gesture.window, { pointCount: points.length, minPointCount: OVERVIEW_MIN_POINTS,
            startCenterRatio: ratioAt(gesture.x, gesture.geometry), currentCenterRatio: ratioAt(event.clientX, gesture.geometry) }));
          clearPreview();
        }
      } else updateInspection({ hoverIndex: indexAtPointer(event) });
    } else if (!gesture && event.pointerType === 'mouse' && currentInspection.selectedIndex === null) {
      updateInspection({ hoverIndex: indexAtPointer(event) });
    }
  };
  const pointerUp = event => {
    const pointers = pointersRef.current;
    const gesture = gestureRef.current;
    if (!pointers.has(event.pointerId) || !gesture || !matchesFocus(gesture)) return;
    if (gesture.kind === 'single' && gesture.pointerId === event.pointerId) {
      if (gesture.pointerType !== 'mouse' && gesture.direction === 'pending') gesture.direction = stockDetailChartDragIntent(event.clientX - gesture.x, event.clientY - gesture.y);
      const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      const zoomedTouchDrag = gesture.zoomed && gesture.pointerType !== 'mouse' && (gesture.direction === 'horizontal' || moved >= 8);
      if (gesture.direction !== 'vertical' && !zoomedTouchDrag) {
        updateInspection({ selectedIndex: indexAtPointer(event), hoverIndex: null });
      } else clearPreview();
    }
    pointers.delete(event.pointerId);
    // Once multiple fingers participated, lifting one never turns the remaining
    // finger into a tap. Wait for a fresh gesture after all fingers are released.
    gestureRef.current = pointers.size ? { data, active, focusVersion, kind: 'blocked' } : null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const inspectKey = event => {
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      clearPointers();
      if (event.key === '0') { resetZoom(); return; }
      const anchor = inWindow(readoutIndex) ? (readoutIndex - chartWindow.start) / Math.max(1, chartWindow.end - chartWindow.start) : .5;
      updateWindow(transformStockDetailChartWindow(chartWindow, { pointCount: points.length, minPointCount: OVERVIEW_MIN_POINTS,
        scale: event.key === '-' ? 1 / 1.5 : 1.5, startCenterRatio: anchor }));
      clearPreview();
      return;
    }
    let next;
    if (event.key === 'ArrowLeft') next = readoutIndex - 1;
    else if (event.key === 'ArrowRight') next = readoutIndex + 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lastIndex;
    else if (event.key === 'Escape') { event.preventDefault(); resetInspection(); return; }
    else return;
    event.preventDefault();
    clearPointers();
    next = Math.max(0, Math.min(lastIndex, next));
    if (!inWindow(next)) updateWindow(fullStockDetailChartWindow(points.length));
    updateInspection({ selectedIndex: next, hoverIndex: null });
  };
  return <section className="ic-dd-overview-section" aria-label={englishMode ? 'Drawdown history' : '回撤历史'}>
    <div className="ic-dd-section-head"><h2>{active} · {englishMode ? 'Price history' : '股价走势'}</h2>{currentInspection.selectedIndex !== null ? <button type="button" className="ic-dd-reset-inspection" onClick={resetInspection}>{englishMode ? 'Back to latest' : '回到最新'}</button> : <span>USD</span>}</div>
    <div className="ic-dd-legend">{symbols.map(symbol => <button key={symbol} type="button" onClick={() => onActivate(symbol)} aria-pressed={active === symbol} aria-label={englishMode ? `View ${symbol} drawdown details` : `查看 ${symbol} 回撤详情`}><i style={{ background: colors[symbol] }} />{symbol}</button>)}</div>
    <div ref={containerRef} className="ic-dd-chart ic-dd-overview" data-window-start={chartWindow.start} data-window-end={chartWindow.end} data-zoomed={zoomed} role="slider" aria-valuemin={0} aria-valuemax={lastIndex} aria-valuenow={readoutIndex} aria-valuetext={`${points[readoutIndex].date}, ${active} ${formatDrawdownPrice(selected.points[readoutIndex].adjustedCloseUsd)} USD, ${formatInvestmentPercent(selected.points[readoutIndex].drawdownPct)}`} tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={event => { if (pointersRef.current.has(event.pointerId)) cancelGesture(event); }} onPointerLeave={clearPreview} onBlur={cancelGesture} onKeyDown={inspectKey} aria-label={englishMode ? 'Inspect daily share prices with left and right arrow keys; pinch or use plus and minus to zoom, zero to reset' : '使用左右方向键查看每日股价；双指或加减键缩放，0键重置'}>
      {hasPrices ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={englishMode ? `${active} adjusted share price history in USD` : `${active} 美元复权股价走势`}>
        {ticks.map((value, tick) => <g key={tick}><line className="ic-dd-grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 6} y={y(value) + 4} textAnchor="end">{axisPrice(value)}</text></g>)}
        <path data-overview-series={active} d={pricePath} fill="none" stroke={colors[active]} strokeWidth="2" strokeLinejoin="round" />
        {visiblePoints.filter((row, index) => validPrice(row) && !validPrice(visiblePoints[index - 1]) && !validPrice(visiblePoints[index + 1])).map(row => <circle key={row.index} data-overview-isolated={active} cx={x(row)} cy={y(row.adjustedCloseUsd)} r="3" fill={colors[active]} />)}
        {[...new Set([chartWindow.start, Math.round((chartWindow.start + chartWindow.end) / 2), chartWindow.end])].map(pointIndex => {
          const point = points[pointIndex];
          return <text key={pointIndex} x={x(point)} y={height - 8} textAnchor={pointIndex === chartWindow.start ? 'start' : pointIndex === chartWindow.end ? 'end' : 'middle'}>{zoomed ? point.date.slice(5) : point.date.slice(0, 7)}</text>;
        })}
        {markers.map(({ kind, point, label }) => {
          const px = x(point), py = y(point.adjustedCloseUsd);
          const anchor = kind === 'trough' ? (px > width * .55 ? 'end' : 'start')
            : px > width * .7 ? 'end' : px < width * .4 ? 'start' : 'middle';
          const labelX = kind === 'trough' ? px + (anchor === 'end' ? -18 : 18) : px;
          // Stagger recovery below its point; equal-price peak/recovery labels
          // otherwise collide when a long history is compressed on a phone.
          const labelY = kind === 'peak' ? Math.max(15, py - 27) : Math.min(height - bottom - (kind === 'trough' ? 42 : 26), py + 20);
          return <g key={kind} data-overview-marker={kind}>
            <g className="ic-dd-marker-node" aria-hidden="true">
              <circle className="ic-dd-marker-halo" cx={px} cy={py} r="7" fill={colors[active]} stroke={colors[active]} />
              <circle className="ic-dd-marker-core" cx={px} cy={py} r="4" fill={colors[active]} />
            </g>
            <text className="ic-dd-value-label" x={labelX} y={labelY} textAnchor={anchor}>{label} {formatDrawdownPrice(point.adjustedCloseUsd)}<tspan x={labelX} dy="14">{point.date}</tspan>{kind === 'trough' && <tspan x={labelX} dy="14" fill={investmentChangeColor(maximumEpisode.drawdownPct, marketColorMode)}>{formatInvestmentPercent(maximumEpisode.drawdownPct)}</tspan>}</text>
          </g>;
        })}
        {inspecting && inWindow(readoutIndex) && <g><line x1={x(points[readoutIndex])} x2={x(points[readoutIndex])} y1={top} y2={height - bottom} className="ic-dd-inspection-line" strokeDasharray="3 4" />{validPrice(selected.points[readoutIndex]) && <circle data-overview-current={active} cx={x(points[readoutIndex])} cy={y(selected.points[readoutIndex].adjustedCloseUsd)} r="4" fill={colors[active]} />}</g>}
      </svg> : <div className="ic-dd-price-unavailable">{englishMode ? 'Adjusted share prices unavailable' : '复权股价暂不可用'}</div>}
    </div>
    {zoomed && <div className="ic-dd-zoom-range"><span>{points[chartWindow.start].date} — {points[chartWindow.end].date}</span><button ref={resetZoomRef} type="button" className="ic-dd-reset-zoom" onClick={resetZoom}>{englishMode ? 'Reset zoom' : '重置缩放'}</button></div>}
    <div className="ic-dd-overview-readout">
      <span>{points[readoutIndex].date}</span><small>{englishMode ? 'Adjusted close · USD' : '复权收盘价 · USD'}</small>
      <div className="ic-dd-price-comparison">{symbols.map(symbol => {
        const observed = analyses[symbol].points[readoutIndex];
        const latest = analyses[symbol].points.at(-1);
        const returnToLatest = deriveStockDetailReturnToLatest(
          { date: observed.date, close: observed.adjustedCloseUsd },
          { date: latest.date, close: latest.adjustedCloseUsd },
        );
        // Qualify this episode only from observations available on the selected
        // date. A later trough must not turn an earlier small pullback into a
        // triggered drawdown. Once qualified, keep its retrospective outcome.
        const observedEpisode = analyses[symbol].episodes.find(episode => readoutIndex > episode.peakIndex && readoutIndex <= (episode.recoveryIndex ?? lastIndex));
        const triggered = observedEpisode && analyses[symbol].points
          .slice(observedEpisode.peakIndex + 1, readoutIndex + 1)
          .some(point => Number.isFinite(point.drawdownPct) && point.drawdownPct <= -HISTORY_MIN_DRAWDOWN_PCT + Number.EPSILON * 100);
        const recoveryDate = triggered ? observedEpisode.recoveryDate : null;
        const recoveryStatus = recoveryDate ?? (triggered ? (englishMode ? 'Unrecovered' : '尚未修复')
          : observed.drawdownPct === 0 ? (englishMode ? 'At high' : '处于新高')
            : observedEpisode ? (englishMode ? 'Below 10%' : '未达 10%') : '—');
        return <div className="ic-dd-price-card" data-symbol={symbol} key={symbol}>
          <div className="ic-dd-price-identity">{symbol}</div>
          <time className="ic-dd-price-date" dateTime={observed.date} aria-label={englishMode ? `Price date ${observed.date}` : `股价日期 ${observed.date}`}>{observed.date}</time>
          <strong data-adjusted-price="current">{formatDrawdownPrice(observed.adjustedCloseUsd)}</strong>
          <dl>
            <div><dt>{englishMode ? 'Previous high' : '对应前高'}</dt><dd data-adjusted-price="peak">{formatDrawdownPrice(observed.peakAdjustedCloseUsd)}</dd></div>
            <div><dt>{englishMode ? 'High date' : '前高日期'}</dt><dd>{observed.peakDate ?? '—'}</dd></div>
            <div><dt>{englishMode ? 'Drawdown' : '当前回撤'}</dt><dd style={{ color: investmentChangeColor(observed.drawdownPct, marketColorMode) }}>{formatInvestmentPercent(observed.drawdownPct)}</dd></div>
            <div><dt>{englishMode ? 'Gain to high' : '修复所需涨幅'}</dt><dd style={{ color: investmentChangeColor(observed.recoveryGainPct, marketColorMode) }}>{formatInvestmentPercent(observed.recoveryGainPct)}</dd></div>
            <div><dt>{recoveryDate ? (englishMode ? 'Episode recovery' : '本段修复日') : (englishMode ? 'Drawdown status' : '回撤状态')}</dt><dd data-episode-recovery={symbol}>{recoveryStatus}</dd></div>
            <div><dt>{englishMode ? 'Change to latest' : '至今涨跌幅'}</dt><dd data-return-to-latest={symbol} style={{ color: investmentChangeColor(returnToLatest?.changePercent, marketColorMode) }}>{formatInvestmentPercent(returnToLatest?.changePercent)}</dd></div>
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
  const trough = analysis.points[episode.troughIndex];
  const troughReached = episode.troughIndex <= index;
  const troughReturn = troughReached && Number.isFinite(trough.returnPct) ? trough.returnPct : null;
  const principalReturnLabel = troughReturn === null ? '—' : `${Number(troughReturn.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero', useGrouping: false })}%`;
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
      <div className="ic-dd-trough-assets"><span>{englishMode ? 'Portfolio at this trough' : '本次谷底资产'}</span><strong>{formatInvestmentAmount(troughReached ? trough.value : null, englishMode, { displayCurrency, displayRate, digits: 2 })}</strong>{!troughReached && <small>{englishMode ? 'Not replayed' : '尚未回放'}</small>}</div>
      <div className="ic-dd-trough-principal-return"><span>{englishMode ? 'Return on initial principal' : '相对初始本金'}</span><strong style={{ color: investmentChangeColor(troughReturn, marketColorMode) }}>{principalReturnLabel}</strong>{!troughReached && <small>{englishMode ? 'Not replayed' : '尚未回放'}</small>}</div>
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
    <div className="ic-dd-section-head"><h2>{englishMode ? 'Principal risk since investment' : '自起投以来的本金风险'}</h2><span>{symbol} · {englishMode ? 'Invested ' : '投入 '}{formatInvestmentAmount(analysis.principal, englishMode, { displayCurrency, displayRate })}</span></div>
    <p className="ic-dd-principal-period">{englishMode ? 'From ' : '起投 '}<time dateTime={analysis.startDate}>{analysis.startDate}</time>{englishMode ? ' · Through ' : ' · 截至 '}<time dateTime={analysis.asOfDate}>{analysis.asOfDate}</time></p>
    <div className="ic-dd-principal-stats"><div><span>{englishMode ? 'Lowest value since investment' : '起投以来最低资产'}</span><strong style={stats.maximumLossPct < 0 ? { color: investmentChangeColor(stats.maximumLossPct, marketColorMode) } : undefined}>{formatInvestmentAmount(stats.minimumValue, englishMode, { displayCurrency, displayRate })}</strong><small>{stats.minimumDate} · <span style={{ color: investmentChangeColor(stats.maximumLossPct, marketColorMode) }}>{formatInvestmentPercent(stats.maximumLossPct)}</span></small></div><div><span>{englishMode ? 'Principal recovery after the low' : '最低点后回到本金'}</span><strong>{recovery}</strong><small>{recoveryDetail}</small></div></div>
  </section>;
}

function DrawdownAnalysis({ data, englishMode, marketColorMode = 'redUpGreenDown', displayCurrency = 'USD', displayRate = 1 }) {
  const { symbols, analyses } = data;
  const [selection, setSelection] = React.useState({ data, symbol: symbols[0], kind: 'max', episodeId: null, overviewFocusVersion: 0 });
  const current = selection.data === data ? selection : { data, symbol: symbols[0], kind: 'max', episodeId: null, overviewFocusVersion: 0 };
  const active = current.symbol;
  const analysis = analyses[active];
  const journeyRef = React.useRef(null);
  const difference = analyses[symbols[0]].maxDrawdownPct - analyses[symbols[1]].maxDrawdownPct;
  const colors = React.useMemo(() => Object.fromEntries(symbols.map((symbol, index) => [symbol, Math.abs(difference) < 1e-10 ? INVESTMENT_NEUTRAL_COLOR : ((index === 0 ? difference : -difference) > 0 ? INVESTMENT_LEADING_COLOR : INVESTMENT_TRAILING_COLOR)])), [symbols, difference]);
  // Each activation also reselects the trough after manual chart inspection or
  // returning to the latest day, including another click on the active card.
  const activate = React.useCallback(symbol => setSelection(previous => ({ data, symbol, kind: 'max', episodeId: null, overviewFocusVersion: (previous.data === data ? previous.overviewFocusVersion : 0) + 1 })), [data]);
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
    <DrawdownOverview data={data} active={active} colors={colors} onActivate={activate} focusVersion={current.overviewFocusVersion} englishMode={englishMode} marketColorMode={marketColorMode} />
    <section className="ic-dd-journey" ref={journeyRef}>
      <div className="ic-dd-section-head"><h2>{active} · {englishMode ? 'A drawdown, from high to recovery' : '一段回撤的全过程'}</h2><span>{episode ? (episode.recovered ? (englishMode ? 'High recovered' : '已修复前高') : (englishMode ? 'Unrecovered' : '尚未修复')) : current.kind === 'latest' ? (englishMode ? 'No qualifying episode' : '暂无符合区间') : (englishMode ? 'No drawdown' : '无回撤')}</span></div>
      <div className="ic-dd-episode-tabs" role="group" aria-label={englishMode ? 'Drawdown episode' : '回撤区间'}>{[['max', englishMode ? 'Deepest' : '最大回撤'], ['longest', englishMode ? 'Longest wait' : '最长等待'], ['latest', englishMode ? 'Latest' : '最近一次']].map(([kind, label]) => <button type="button" key={kind} aria-pressed={current.kind === kind} onClick={() => kind === 'max' ? activate(active) : setSelection({ ...current, kind, episodeId: null })}>{label}</button>)}</div>
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
