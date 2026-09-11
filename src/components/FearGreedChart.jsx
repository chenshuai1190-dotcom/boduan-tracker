import React from 'react';
import { buildFearGreedChart, nearestFearGreedTimestamp } from '../lib/fearGreedChart.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const formatValue = (value, english, suffix) => finite(value)
  ? `${value.toLocaleString(english ? 'en-US' : 'zh-CN', { maximumFractionDigits: 2 })}${suffix}` : '—';
const formatDate = (value, english, full = false) => finite(value)
  ? new Intl.DateTimeFormat(english ? 'en-US' : 'zh-CN', {
    timeZone: 'UTC', ...(full ? { year: 'numeric' } : {}), month: 'short', day: 'numeric',
  }).format(value) : '—';

export default function FearGreedChart({ series = [], range = '1y', scoreChart = false, english = false, labels = {}, suffix = '' }) {
  const model = React.useMemo(() => buildFearGreedChart(series, { range, fixedDomain: scoreChart ? [0, 100] : null }), [series, range, scoreChart]);
  const [selected, setSelected] = React.useState(null);
  const rootRef = React.useRef(null);
  const svgRef = React.useRef(null);
  const trackingRef = React.useRef(null);
  const clipId = `fg-clip-${React.useId().replace(/:/g, '')}`;
  const selectedTimestamp = model.timestamps.includes(selected) ? selected : null;
  const plotWidth = model.width - model.padding.left - model.padding.right;
  const plotHeight = model.height - model.padding.top - model.padding.bottom;
  const y = value => model.padding.top + (model.domain[1] - value) / (model.domain[1] - model.domain[0]) * plotHeight;
  const x = timestamp => model.padding.left + (model.endTimestamp === model.startTimestamp ? .5
    : (timestamp - model.startTimestamp) / (model.endTimestamp - model.startTimestamp)) * plotWidth;
  const selection = selectedTimestamp === null ? [] : model.series.map(item => ({
    id: item.id, point: item.points.find(point => point.timestamp === selectedTimestamp),
  }));
  const ticks = scoreChart ? [0, 25, 50, 75, 100]
    : [model.domain[0], (model.domain[0] + model.domain[1]) / 2, model.domain[1]];
  const dates = [...new Set([model.startTimestamp, model.timestamps[Math.floor((model.timestamps.length - 1) / 2)], model.endTimestamp])].filter(finite);

  React.useEffect(() => {
    if (selectedTimestamp === null) return undefined;
    const onOutside = event => { if (!rootRef.current?.contains(event.target)) setSelected(null); };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  }, [selectedTimestamp]);

  const selectAt = clientX => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const viewX = (clientX - bounds.left) / bounds.width * model.width;
    setSelected(nearestFearGreedTimestamp(model.timestamps, (viewX - model.padding.left) / plotWidth));
  };
  const finish = event => {
    const pointer = trackingRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    trackingRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onPointerDown = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    trackingRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, intent: event.pointerType === 'mouse' ? 'horizontal' : null };
    if (event.pointerType === 'mouse') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      selectAt(event.clientX);
    }
  };
  const onPointerMove = event => {
    const pointer = trackingRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.intent) {
      const dx = Math.abs(event.clientX - pointer.x);
      const dy = Math.abs(event.clientY - pointer.y);
      if (dy > 6 && dy > dx * 1.15) pointer.intent = 'vertical';
      else if (dx > 6 && dx > dy * 1.15) {
        pointer.intent = 'horizontal';
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    }
    if (pointer.intent === 'horizontal') selectAt(event.clientX);
  };
  const onPointerUp = event => {
    const pointer = trackingRef.current;
    if (pointer?.id === event.pointerId && pointer.intent !== 'vertical') selectAt(event.clientX);
    finish(event);
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') { setSelected(null); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !model.timestamps.length) return;
    event.preventDefault();
    const index = selectedTimestamp === null ? model.timestamps.length - 1 : model.timestamps.indexOf(selectedTimestamp);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? model.timestamps.length - 1
      : Math.max(0, Math.min(model.timestamps.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
    setSelected(model.timestamps[next]);
  };

  return <div ref={rootRef} className="fg-chart">
    <div className="fg-chart-reading" aria-live="polite">
      {selectedTimestamp !== null && <>
        <time>{formatDate(selectedTimestamp, english, true)}</time>
        <div className="fg-chart-reading-values">{selection.map((item, index) => <span key={item.id} data-secondary={index > 0}>
          {selection.length > 1 && <span className="fg-chart-reading-name">{labels[item.id] || item.id} </span>}
          {formatValue(item.point?.value, english, suffix)}
        </span>)}</div>
      </>}
    </div>
    {!model.timestamps.length ? <div className="fg-chart-empty">{english ? 'No data' : '暂无数据'}</div> : <svg
      ref={svgRef} className="fg-chart-svg" viewBox={`0 0 ${model.width} ${model.height}`} role="img" tabIndex={0}
      aria-label={english ? 'Historical chart' : '历史走势图'}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={onKeyDown}
    >
      <defs><clipPath id={clipId}><rect x={model.padding.left} y={model.padding.top} width={plotWidth} height={plotHeight} /></clipPath></defs>
      {scoreChart && <g className="fg-chart-extremes">
        <rect x={model.padding.left} y={y(100)} width={plotWidth} height={y(75) - y(100)} />
        <rect x={model.padding.left} y={y(25)} width={plotWidth} height={y(0) - y(25)} />
      </g>}
      {ticks.map(tick => <g key={tick}>
        <line className="fg-chart-grid" x1={model.padding.left} x2={model.width - model.padding.right} y1={y(tick)} y2={y(tick)} />
        <text className="fg-chart-axis" x={model.padding.left - 7} y={y(tick) + 4} textAnchor="end">
          {scoreChart ? tick : `${new Intl.NumberFormat(english ? 'en-US' : 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(tick)}${suffix}`}
        </text>
      </g>)}
      <g clipPath={`url(#${clipId})`}>{model.series.map((item, index) => <g key={item.id} className="fg-chart-series" data-secondary={index > 0}>
        <path d={item.path} />
        {item.points.length === 1 && <circle cx={item.points[0].x} cy={item.points[0].y} r="2.8" />}
      </g>)}</g>
      {selectedTimestamp !== null && <g>
        <line className="fg-chart-crosshair" x1={x(selectedTimestamp)} x2={x(selectedTimestamp)} y1={model.padding.top} y2={model.height - model.padding.bottom} />
        {selection.map((item, index) => item.point && <circle key={item.id} className="fg-chart-selected" data-secondary={index > 0} cx={item.point.x} cy={item.point.y} r="3.5" />)}
      </g>}
      {dates.map((timestamp, index) => <text key={timestamp} className="fg-chart-axis" x={x(timestamp)} y={model.height - 5}
        textAnchor={index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle'}>{formatDate(timestamp, english)}</text>)}
    </svg>}
  </div>;
}
