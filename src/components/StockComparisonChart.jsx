import React from 'react';
import {
  fullStockDetailChartWindow,
  normalizeStockDetailChartWindow,
  stockDetailChartDragIntent,
  transformStockDetailChartWindow,
} from '../lib/watchlistStockDetail.js';
import './StockComparisonChart.css';

const MIN_VISIBLE_POINTS = 12;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const colorFor = (colors, symbol) => colors?.[symbol] || '#a6abb5';

function axisValue(value, priceMode) {
  if (priceMode) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const precision = Math.abs(value) < 10 && value !== 0 ? 1 : 0;
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: precision })}%`;
}

function readableScale(values, priceMode) {
  if (!values.length) return { low: 0, high: 100, ticks: [0, 25, 50, 75, 100] };
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (!priceMode) { low = Math.min(low, 0); high = Math.max(high, 0); }
  const spread = Math.max(high - low, priceMode ? Math.abs(high) * 0.06 : 2, 0.1);
  const targetStep = spread * 1.16 / 4;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = ([1, 2, 2.5, 5, 10].find(item => item * magnitude >= targetStep) || 10) * magnitude;
  low = Math.floor((low - spread * 0.08) / step) * step;
  high = Math.ceil((high + spread * 0.08) / step) * step;
  if (priceMode) low = Math.max(0, low);
  if (high <= low) high = low + step;
  const ticks = [];
  for (let value = low; value <= high + step * 0.01; value += step) ticks.push(Math.abs(value) < step * 1e-8 ? 0 : value);
  return { low, high, ticks };
}

function seriesPath(rows, symbol, field, x, y, firstIndex) {
  let continuing = false;
  return rows.map((row, offset) => {
    const value = row?.[field]?.[symbol];
    if (!Number.isFinite(value)) { continuing = false; return ''; }
    const command = continuing ? 'L' : 'M';
    continuing = true;
    return `${command}${x(firstIndex + offset).toFixed(2)},${y(value).toFixed(2)}`;
  }).join(' ');
}

/** Values are supplied by the comparison model. Zoom never changes their baseline. */
export default function StockComparisonChart({
  rows = [], symbols = [], colors = {}, mode = 'return', activeSymbol,
  selectedDate, onSelectDate, englishMode = false,
}) {
  const containerRef = React.useRef(null);
  const pointersRef = React.useRef(new Map());
  const gestureRef = React.useRef(null);
  const [width, setWidth] = React.useState(360);
  const dataKey = `${symbols.join('|')}:${rows.length}:${rows[0]?.date || ''}:${rows.at(-1)?.date || ''}`;
  const [viewport, setViewport] = React.useState(() => ({ key: dataKey, window: fullStockDetailChartWindow(rows.length) }));
  const chartWindow = viewport.key === dataKey
    ? normalizeStockDetailChartWindow(viewport.window, rows.length)
    : fullStockDetailChartWindow(rows.length);
  const priceMode = mode === 'price';
  const visibleSymbols = priceMode ? [symbols.includes(activeSymbol) ? activeSymbol : symbols[0]].filter(Boolean) : symbols;
  const field = priceMode ? 'prices' : 'returns';
  const visibleRows = rows.slice(chartWindow.start, chartWindow.end + 1);
  const values = visibleRows.flatMap(row => visibleSymbols.map(symbol => row?.[field]?.[symbol]).filter(Number.isFinite));
  const scale = readableScale(values, priceMode);
  const tickLabels = scale.ticks.map(value => axisValue(value, priceMode));
  const left = Math.max(43, Math.min(width * 0.27, Math.max(...tickLabels.map(label => label.length), 4) * 6.6 + 10));
  const height = width < 520 ? 340 : 390;
  const frame = { left, right: width - 12, top: 18, bottom: height - 34 };
  const plotWidth = Math.max(1, frame.right - frame.left);
  const x = index => frame.left + (index - chartWindow.start) / Math.max(1, chartWindow.end - chartWindow.start) * plotWidth;
  const y = value => frame.bottom - (value - scale.low) / (scale.high - scale.low) * (frame.bottom - frame.top);
  const requestedIndex = selectedDate ? rows.findIndex(row => row.date === selectedDate) : -1;
  const selectedIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, rows.length - 1);
  const selectedRow = rows[selectedIndex];
  const selectedVisible = selectedIndex >= chartWindow.start && selectedIndex <= chartWindow.end;
  const zoomed = chartWindow.start > 0 || chartWindow.end < rows.length - 1;
  const uniqueId = React.useId().replace(/:/g, '');
  const clipId = `stock-comparison-clip-${uniqueId}`;

  const clearPointers = React.useCallback(() => {
    const pointers = [...pointersRef.current.entries()];
    pointersRef.current.clear();
    gestureRef.current = null;
    for (const [id, pointer] of pointers) {
      if (pointer.target?.hasPointerCapture?.(id)) pointer.target.releasePointerCapture(id);
    }
  }, []);

  React.useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const measure = () => setWidth(Math.max(220, Math.round(node.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    clearPointers();
    setViewport(current => current.key === dataKey ? current : { key: dataKey, window: fullStockDetailChartWindow(rows.length) });
    return clearPointers;
  }, [clearPointers, dataKey, rows.length]);

  const updateWindow = next => setViewport(current => current.key === dataKey && current.window.start === next.start && current.window.end === next.end
    ? current : { key: dataKey, window: next });
  const geometryFor = target => {
    const bounds = target.getBoundingClientRect();
    return { left: bounds.left + frame.left / width * bounds.width, width: Math.max(1, plotWidth / width * bounds.width) };
  };
  const ratioFor = (clientX, geometry) => clamp((clientX - geometry.left) / geometry.width, 0, 1);
  const selectAt = (clientX, target) => {
    if (!rows.length) return;
    const index = Math.round(chartWindow.start + ratioFor(clientX, geometryFor(target)) * (chartWindow.end - chartWindow.start));
    if (rows[index]?.date !== selectedDate) onSelectDate?.(rows[index].date);
  };
  const transform = (window, options) => transformStockDetailChartWindow(window, {
    pointCount: rows.length, minPointCount: MIN_VISIBLE_POINTS, ...options,
  });
  const resetZoom = () => { clearPointers(); updateWindow(fullStockDetailChartWindow(rows.length)); };
  const changeZoom = factor => {
    clearPointers();
    const anchor = selectedVisible ? (selectedIndex - chartWindow.start) / Math.max(1, chartWindow.end - chartWindow.start) : 0.5;
    updateWindow(transform(chartWindow, { scale: factor, startCenterRatio: anchor }));
  };

  const pointerDown = event => {
    if (!rows.length || (event.button !== undefined && event.button !== 0)) return;
    const pointers = pointersRef.current;
    const touch = event.pointerType === 'touch';
    if (event.isPrimary === false && (!touch || pointers.size === 0)) return;
    if (pointers.has(event.pointerId)) return;
    if (pointers.size && (!touch || [...pointers.values()].some(pointer => pointer.type !== 'touch'))) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType, target: event.currentTarget });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const geometry = geometryFor(event.currentTarget);
    if (pointers.size === 1) {
      gestureRef.current = { kind: 'single', id: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY,
        direction: 'pending', window: chartWindow, geometry, zoomed };
      if (!touch) selectAt(event.clientX, event.currentTarget);
      return;
    }
    if (pointers.size !== 2 || gestureRef.current?.kind === 'blocked' || gestureRef.current?.direction === 'vertical') {
      gestureRef.current = { kind: 'blocked' };
      return;
    }
    const [first, second] = [...pointers.values()];
    gestureRef.current = { kind: 'pinch', window: chartWindow, geometry,
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      center: ratioFor((first.x + second.x) / 2, geometry) };
  };

  const pointerMove = event => {
    const gesture = gestureRef.current;
    const pointer = pointersRef.current.get(event.pointerId);
    if (!gesture || !pointer) {
      if (!gesture && event.pointerType === 'mouse') selectAt(event.clientX, event.currentTarget);
      return;
    }
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (gesture.kind === 'pinch' && pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      updateWindow(transform(gesture.window, {
        scale: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)) / gesture.distance,
        startCenterRatio: gesture.center, currentCenterRatio: ratioFor((first.x + second.x) / 2, gesture.geometry),
      }));
      return;
    }
    if (gesture.kind !== 'single' || gesture.id !== event.pointerId) return;
    if (gesture.direction === 'pending') gesture.direction = stockDetailChartDragIntent(event.clientX - gesture.x, event.clientY - gesture.y);
    if (gesture.direction === 'vertical') return;
    if (gesture.zoomed && gesture.type === 'touch') {
      if (gesture.direction === 'horizontal') updateWindow(transform(gesture.window, {
        startCenterRatio: ratioFor(gesture.x, gesture.geometry), currentCenterRatio: ratioFor(event.clientX, gesture.geometry),
      }));
    } else if (gesture.direction === 'horizontal' || gesture.type === 'mouse') selectAt(event.clientX, event.currentTarget);
  };

  const pointerUp = event => {
    const pointers = pointersRef.current;
    const gesture = gestureRef.current;
    if (!pointers.has(event.pointerId)) return;
    if (gesture?.kind === 'single' && gesture.id === event.pointerId) {
      const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      const direction = gesture.direction === 'pending' ? stockDetailChartDragIntent(event.clientX - gesture.x, event.clientY - gesture.y) : gesture.direction;
      if (direction !== 'vertical' && !(gesture.zoomed && gesture.type === 'touch' && moved >= 8)) selectAt(event.clientX, event.currentTarget);
    }
    pointers.delete(event.pointerId);
    // A remaining finger after a pinch cannot become an accidental tap.
    gestureRef.current = pointers.size ? { kind: 'blocked' } : null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const inspectKey = event => {
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') resetZoom(); else changeZoom(event.key === '-' ? 1 / 1.5 : 1.5);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !rows.length) return;
    event.preventDefault(); clearPointers();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : clamp(selectedIndex + (event.key === 'ArrowLeft' ? -1 : 1), 0, rows.length - 1);
    if (next < chartWindow.start || next > chartWindow.end) {
      const count = chartWindow.end - chartWindow.start;
      const start = clamp(next < chartWindow.start ? next : next - count, 0, rows.length - count - 1);
      updateWindow({ start, end: start + count });
    }
    onSelectDate?.(rows[next].date);
  };

  const dateTicks = [...new Set([chartWindow.start, Math.round((chartWindow.start + chartWindow.end) / 2), chartWindow.end])].filter(index => rows[index]);
  const sameYear = visibleRows[0]?.date.slice(0, 4) === visibleRows.at(-1)?.date.slice(0, 4);

  return <div className="scc-chart" ref={containerRef} data-stock-comparison-chart="true">
    <div className="scc-touch" role="slider" tabIndex={0} aria-label={englishMode ? 'Inspect dates with arrow keys; pinch or use plus and minus to zoom' : '使用左右方向键查看日期，双指或加减按钮缩放'}
      aria-valuemin={0} aria-valuemax={Math.max(0, rows.length - 1)} aria-valuenow={selectedIndex}
      aria-valuetext={selectedRow ? `${selectedRow.date}, ${visibleSymbols.map(symbol => `${symbol} ${Number.isFinite(selectedRow?.[field]?.[symbol]) ? axisValue(selectedRow[field][symbol], priceMode) : '—'}`).join(', ')}` : (englishMode ? 'No data' : '暂无数据')}
      data-window-start={chartWindow.start} data-window-end={chartWindow.end} data-zoomed={zoomed}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={clearPointers}
      onLostPointerCapture={event => { if (pointersRef.current.has(event.pointerId)) clearPointers(); }} onBlur={clearPointers} onKeyDown={inspectKey}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={priceMode ? (englishMode ? `${visibleSymbols[0] || ''} share price in USD` : `${visibleSymbols[0] || ''} 美元股价走势`) : (englishMode ? 'Stock return comparison from the same start date' : '相同起始日期的股票涨跌对比')}>
        <defs><clipPath id={clipId}><rect x={frame.left - 4} y={frame.top - 4} width={plotWidth + 8} height={frame.bottom - frame.top + 8} /></clipPath></defs>
        {scale.ticks.map((value, index) => <g key={value}>
          <line className={`scc-grid${!priceMode && value === 0 ? ' scc-zero' : ''}`} x1={frame.left} x2={frame.right} y1={y(value)} y2={y(value)} />
          <text className="scc-axis" x={frame.left - 9} y={y(value) + 4} textAnchor="end">{tickLabels[index]}</text>
        </g>)}
        <g clipPath={`url(#${clipId})`}>
          {visibleSymbols.map(symbol => <g key={symbol} data-comparison-series={symbol}>
            <path d={seriesPath(visibleRows, symbol, field, x, y, chartWindow.start)} fill="none" stroke={colorFor(colors, symbol)} strokeWidth={priceMode ? 2.5 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
            {visibleRows.map((row, offset) => {
              const value = row?.[field]?.[symbol];
              if (!Number.isFinite(value)) return null;
              const isolated = !Number.isFinite(visibleRows[offset - 1]?.[field]?.[symbol]) && !Number.isFinite(visibleRows[offset + 1]?.[field]?.[symbol]);
              if (!isolated && offset !== visibleRows.length - 1) return null;
              return <circle key={row.date} cx={x(chartWindow.start + offset)} cy={y(value)} r={isolated ? 2.8 : 3.2} fill={colorFor(colors, symbol)} />;
            })}
          </g>)}
          {selectedRow && selectedVisible && <g pointerEvents="none">
            <line className="scc-crosshair" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={frame.top} y2={frame.bottom} />
            {visibleSymbols.map(symbol => Number.isFinite(selectedRow?.[field]?.[symbol]) && <g key={symbol}>
              <circle cx={x(selectedIndex)} cy={y(selectedRow[field][symbol])} r="8" fill={colorFor(colors, symbol)} opacity=".16" />
              <circle cx={x(selectedIndex)} cy={y(selectedRow[field][symbol])} r="4" fill={colorFor(colors, symbol)} />
            </g>)}
          </g>}
        </g>
        {dateTicks.map((index, position) => <text key={index} className="scc-axis" x={x(index)} y={height - 9} textAnchor={position === 0 ? 'start' : position === dateTicks.length - 1 ? 'end' : 'middle'}>{sameYear ? rows[index].date.slice(5) : rows[index].date.slice(0, 7)}</text>)}
        {!values.length && <text className="scc-empty" x={(frame.left + frame.right) / 2} y={height / 2} textAnchor="middle">{englishMode ? 'No prices in this period' : '此区间暂无行情'}</text>}
      </svg>
    </div>
    <div className="scc-tools">
      <span className="scc-window-label">{zoomed && visibleRows.length ? `${visibleRows[0].date} — ${visibleRows.at(-1).date}` : (englishMode ? 'Pinch to zoom' : '双指缩放')}</span>
      <div className="scc-zoom-buttons">
        <button type="button" onClick={() => changeZoom(1 / 1.5)} disabled={!zoomed} aria-label={englishMode ? 'Zoom out' : '缩小图表'}>−</button>
        <button type="button" className="scc-reset" onClick={resetZoom} disabled={!zoomed}>{englishMode ? 'Reset' : '还原'}</button>
        <button type="button" onClick={() => changeZoom(1.5)} disabled={visibleRows.length <= MIN_VISIBLE_POINTS} aria-label={englishMode ? 'Zoom in' : '放大图表'}>+</button>
      </div>
    </div>
  </div>;
}
