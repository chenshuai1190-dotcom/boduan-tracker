import React from 'react';
import { formatVixComparisonChangePercent } from '../lib/vixComparisonChart.js';
import { isVixComparisonSession } from '../lib/vixComparisonSession.js';
import { getVixObservationColor, VIX_TERM_CHART_COLORS } from '../lib/vixRiskPalette.js';
import { marketTextClass } from '../lib/marketColorMode.js';

const COLORS = { vix: '#dda36b', market: '#91a9c2', ratio: VIX_TERM_CHART_COLORS.line };
const WIDTH = 360;
const LEFT = 31;
const RIGHT = 324;
const MAIN_TOP = 18;
const MAIN_BOTTOM = 164;
const RATIO_TOP = 215;
const RATIO_BOTTOM = 302;
const fmt = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

function chartRows(model, termRows) {
  const marketByDate = new Map(model.rows.map(row => [row.date, row]));
  const termByDate = new Map((Array.isArray(termRows) ? termRows : [])
    .filter(row => typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .map(row => [row.date, row]));
  const dates = [...new Set([...marketByDate.keys(), ...termByDate.keys()])]
    .filter(date => !model.requestedFrom || date >= model.requestedFrom).sort();
  if (!dates.length) return [];
  const rows = [];
  const lastDate = dates.at(-1);
  const cursor = new Date(`${dates[0]}T00:00:00Z`);
  // Insert absent sessions explicitly. A missing ratio breaks its line rather
  // than connecting two valid observations across a data gap.
  while (cursor.toISOString().slice(0, 10) <= lastDate) {
    const date = cursor.toISOString().slice(0, 10);
    if (isVixComparisonSession(date)) {
      const market = marketByDate.get(date);
      const term = termByDate.get(date);
      rows.push({
        date,
        vix: market?.vix ?? (Number.isFinite(term?.vix) ? term.vix : null),
        price: market?.price ?? null,
        ratio: Number.isFinite(term?.ratio) && Number.isFinite(term?.vix) && Number.isFinite(term?.vix3m) ? term.ratio : null,
        vixDayChangePct: market?.vixDayChangePct ?? null,
        priceDayChangePct: market?.priceDayChangePct ?? null,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function bounds(rows, field, interval, fallback) {
  const values = rows.map(row => row[field]).filter(Number.isFinite);
  if (!values.length) return fallback;
  const min = Math.floor(Math.min(...values) / interval) * interval;
  const max = Math.max(min + interval * 2, Math.ceil(Math.max(...values) / interval) * interval);
  return [min, max];
}

function DailyChange({ value, englishMode, marketColorMode }) {
  return <small className="vcr-day-change" data-vix-daily-change="true">
    <span>{englishMode ? 'Day' : '当日涨跌'}</span>
    <span className={Number.isFinite(value) && value !== 0 ? marketTextClass(value, marketColorMode) : ''}>{formatVixComparisonChangePercent(value)}</span>
  </small>;
}

export default function VixRiskChart({ model, termRows = [], riskLevels = new Map(), symbol, englishMode = false, marketColorMode, selectedDate, onSelect }) {
  const vixGradientId = `vix-history-risk-${React.useId().replace(/:/g, '')}`;
  const boxRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  const rows = React.useMemo(() => chartRows(model, termRows), [model, termRows]);
  const lastIndex = rows.length - 1;
  const selectedIndex = selectedDate ? rows.findIndex(row => row.date === selectedDate) : -1;
  const current = selectedIndex < 0 ? lastIndex : selectedIndex;
  const selected = rows[current];
  const vixColorForDate = date => getVixObservationColor(riskLevels.get(date), COLORS.vix);
  const selectedVixColor = vixColorForDate(selected?.date);
  // Historical colors belong to the paired observations for each date. The
  // selected date changes the reading, never the colors of the history.
  const vixColorStops = [{ offset: 0, color: vixColorForDate(rows[0]?.date) }];
  rows.forEach((row, index) => {
    if (!index) return;
    const previousColor = vixColorForDate(rows[index - 1].date);
    const color = vixColorForDate(row.date);
    if (previousColor !== color) {
      const offset = (index - .5) / Math.max(1, lastIndex) * 100;
      vixColorStops.push({ offset, color: previousColor }, { offset, color });
    }
  });
  vixColorStops.push({ offset: 100, color: vixColorForDate(rows.at(-1)?.date) });
  const [vMin, vMax] = bounds(rows, 'vix', 5, [10, 30]);
  const [pMin, pMax] = bounds(rows, 'price', 10, [0, 100]);
  const ratioValues = rows.map(row => row.ratio).filter(Number.isFinite);
  const rMin = Math.min(0.8, ...(ratioValues.length ? ratioValues.map(value => Math.floor(value * 10) / 10) : [0.8]));
  const rMax = Math.max(1.2, ...(ratioValues.length ? ratioValues.map(value => Math.ceil(value * 10) / 10) : [1.2]));
  const x = index => LEFT + index / Math.max(1, lastIndex) * (RIGHT - LEFT);
  const scale = (value, min, max, top, bottom) => bottom - (value - min) / (max - min) * (bottom - top);
  const vy = value => scale(value, vMin, vMax, MAIN_TOP, MAIN_BOTTOM);
  const py = value => scale(value, pMin, pMax, MAIN_TOP, MAIN_BOTTOM);
  const ry = value => scale(value, rMin, rMax, RATIO_TOP, RATIO_BOTTOM);
  const path = (field, y) => {
    let penDown = false;
    return rows.map((row, index) => {
      if (!Number.isFinite(row[field])) { penDown = false; return ''; }
      const command = `${penDown ? 'L' : 'M'}${x(index).toFixed(2)},${y(row[field]).toFixed(2)}`;
      penDown = true;
      return command;
    }).filter(Boolean).join(' ');
  };
  const selectAt = event => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect?.width || !rows.length) return;
    const unit = ((event.clientX - rect.left) / rect.width * WIDTH - LEFT) / (RIGHT - LEFT);
    onSelect(rows[Math.max(0, Math.min(lastIndex, Math.round(unit * lastIndex)))].date);
  };

  React.useEffect(() => {
    if (!selectedDate) return undefined;
    const clearOutside = event => {
      if (!boxRef.current?.contains(event.target)) onSelect(null);
    };
    document.addEventListener('pointerdown', clearOutside, true);
    return () => document.removeEventListener('pointerdown', clearOutside, true);
  }, [selectedDate, onSelect]);

  if (!selected || rows.length < 2) return <div className="vcr-chart-empty" role="status">
    {englishMode ? 'Not enough daily closes for this period.' : '这段时间暂无足够的日线收盘数据。'}
  </div>;

  const labelIndexes = [...new Set([0, Math.floor(lastIndex / 2), lastIndex])];
  const spansYears = rows[0].date.slice(0, 4) !== rows.at(-1).date.slice(0, 4);
  const hasRatio = ratioValues.length > 0;

  return <div className="vcr-chart" data-vix-comparison-chart="true" data-vix-risk-chart="true">
    <div className="vcr-chart-quotes" aria-live="polite">
      <div data-vix-history-reading="vix"><span><i style={{ background: selectedVixColor }} />VIX</span><strong style={{ color: selectedVixColor }}>{fmt(selected.vix)}</strong><DailyChange value={selected.vixDayChangePct} englishMode={englishMode} marketColorMode={marketColorMode} /></div>
      <div><span><i style={{ background: COLORS.market }} />{symbol} <small>{englishMode ? 'Adj. USD' : '复权 USD'}</small></span><strong style={{ color: COLORS.market }}>{fmt(selected.price)}</strong><DailyChange value={selected.priceDayChangePct} englishMode={englishMode} marketColorMode={marketColorMode} /></div>
      <span className="vcr-chart-date">{selected.date.slice(5).replace('-', '/')}<small>{selectedIndex < 0 ? (englishMode ? 'Latest close' : '最新收盘') : (englishMode ? 'Historical close' : '历史收盘')}</small></span>
    </div>
    <div ref={boxRef} className="vcr-chart-touch" role="slider" tabIndex={0}
      aria-label={englishMode ? 'Select date in linked charts' : '选择两图联动日期'} aria-valuemin={0} aria-valuemax={lastIndex} aria-valuenow={current}
      aria-valuetext={`${selected.date}, VIX ${fmt(selected.vix)}, ${formatVixComparisonChangePercent(selected.vixDayChangePct)}, ${symbol} ${fmt(selected.price)} USD, ${formatVixComparisonChangePercent(selected.priceDayChangePct)}, ${englishMode ? 'ratio' : '比率'} ${fmt(selected.ratio, 3)}`}
      onPointerDown={event => {
        gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, intent: 'pending' };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        selectAt(event);
      }}
      onPointerMove={event => {
        const gesture = gestureRef.current;
        if (event.pointerType === 'mouse' && !gesture) { selectAt(event); return; }
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - gesture.x);
        const dy = Math.abs(event.clientY - gesture.y);
        if (gesture.intent === 'pending' && Math.max(dx, dy) >= 7) gesture.intent = dy > dx ? 'vertical' : 'horizontal';
        if (gesture.intent === 'vertical') { onSelect(null); return; }
        if (gesture.intent === 'horizontal' || event.pointerType === 'mouse') selectAt(event);
      }}
      onPointerUp={event => {
        gestureRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { gestureRef.current = null; onSelect(null); }}
      onLostPointerCapture={() => { gestureRef.current = null; }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && !gestureRef.current) onSelect(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { onSelect(null); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : ['End', 'Enter', ' '].includes(event.key) ? lastIndex
          : Math.max(0, Math.min(lastIndex, current + (event.key === 'ArrowLeft' ? -1 : 1)));
        onSelect(rows[index].date);
      }}>
      <svg viewBox={`0 0 ${WIDTH} 332`} role="img" aria-label={englishMode ? `VIX points on the left axis, ${symbol} adjusted USD price on the right axis; VIX / VIX3M below` : `左轴 VIX 点位，右轴 ${symbol} 美元复权价；下方为 VIX / VIX3M`}>
        <defs><linearGradient id={vixGradientId} gradientUnits="userSpaceOnUse" x1={LEFT} x2={RIGHT} y1="0" y2="0">
          {vixColorStops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />)}
        </linearGradient></defs>
        {[0, 0.5, 1].map(step => <g key={step}>
          <line x1={LEFT} x2={RIGHT} y1={MAIN_TOP + step * (MAIN_BOTTOM - MAIN_TOP)} y2={MAIN_TOP + step * (MAIN_BOTTOM - MAIN_TOP)} stroke="#fff" strokeOpacity=".055" />
          <text x={LEFT - 8} y={MAIN_TOP + step * (MAIN_BOTTOM - MAIN_TOP) + 3} textAnchor="end" fill={COLORS.vix}>{fmt(vMax - step * (vMax - vMin), 0)}</text>
          <text x={RIGHT + 8} y={MAIN_TOP + step * (MAIN_BOTTOM - MAIN_TOP) + 3} fill={COLORS.market}>{fmt(pMax - step * (pMax - pMin), 0)}</text>
        </g>)}
        <path data-vix-history-series="price" d={path('price', py)} fill="none" stroke={COLORS.market} strokeWidth="1.65" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path data-vix-history-series="vix" d={path('vix', vy)} fill="none" stroke={`url(#${vixGradientId})`} strokeWidth="1.65" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <text x={LEFT} y="198" fill="#80818b">VIX / VIX3M</text>
        <text x={RIGHT} y="198" textAnchor="end" fill={COLORS.ratio}>{fmt(selected.ratio, 3)}</text>
        <rect x={LEFT} y={ry(rMax)} width={RIGHT - LEFT} height={ry(1) - ry(rMax)} fill={VIX_TERM_CHART_COLORS.band} />
        {[0.9, 1, 1.1].map(value => <g key={value}>
          <line x1={LEFT} x2={RIGHT} y1={ry(value)} y2={ry(value)} stroke={value === 1 ? VIX_TERM_CHART_COLORS.threshold : '#fff'} strokeOpacity={value === 1 ? '.35' : '.07'} strokeDasharray="3 4" />
          <text x={LEFT - 8} y={ry(value) + 3} textAnchor="end" fill={value === 1 ? VIX_TERM_CHART_COLORS.threshold : '#707782'}>{fmt(value, 1)}</text>
        </g>)}
        <path data-vix-history-series="ratio" d={path('ratio', ry)} fill="none" stroke={COLORS.ratio} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {!hasRatio && <text x={(LEFT + RIGHT) / 2} y={(RATIO_TOP + RATIO_BOTTOM) / 2} textAnchor="middle" fill="#858b96">{englishMode ? 'Term data unavailable' : '期限结构数据暂缺'}</text>}
        {selectedIndex >= 0 && <line x1={x(current)} x2={x(current)} y1={MAIN_TOP} y2={RATIO_BOTTOM} stroke="#e5e5ee" strokeOpacity=".3" strokeDasharray="3 3" />}
        {[['vix', vy, selectedVixColor], ['price', py, COLORS.market], ['ratio', ry, COLORS.ratio]].map(([field, y, color]) => Number.isFinite(selected[field])
          ? <circle key={field} data-vix-history-selected-series={field} cx={x(current)} cy={y(selected[field])} r="2.6" fill={color} stroke="#0a0d12" strokeWidth="1.5" /> : null)}
        {labelIndexes.map((index, position) => <text key={index} x={x(index)} y="327" textAnchor={position === 0 ? 'start' : position === labelIndexes.length - 1 ? 'end' : 'middle'} fill="#737c89">
          {spansYears ? rows[index].date.slice(2, 7).replace('-', '/') : rows[index].date.slice(5).replace('-', '/')}
        </text>)}
      </svg>
    </div>
  </div>;
}
