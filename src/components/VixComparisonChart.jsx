import React from 'react';
import { buildVixComparisonGeometry, formatVixComparisonAxisValue, formatVixComparisonChangePercent, nearestVixComparisonIndex } from '../lib/vixComparisonChart.js';
import { marketTextClass } from '../lib/marketColorMode.js';

export const VIX_LINE_COLOR = '#f6ad55';
export const ETF_LINE_COLOR = '#7ca9f5';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
}

export default function VixComparisonChart({ model, symbol, englishMode = false, marketColorMode }) {
  const chartRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const geometry = React.useMemo(() => buildVixComparisonGeometry(model.rows), [model.rows]);
  const selected = geometry?.points[selectedIndex] || null;

  React.useEffect(() => {
    setSelectedIndex(null);
    gestureRef.current = null;
  }, [model.rows, symbol]);

  React.useEffect(() => {
    if (selectedIndex === null) return undefined;
    const clearOutside = event => {
      if (chartRef.current?.contains(event.target)) return;
      gestureRef.current = null;
      setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', clearOutside, true);
    return () => document.removeEventListener('pointerdown', clearOutside, true);
  }, [selectedIndex]);

  const selectAt = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!geometry || !bounds.width) return;
    setSelectedIndex(nearestVixComparisonIndex(geometry.points, ((event.clientX - bounds.left) / bounds.width) * geometry.width));
  };

  if (!geometry) return (
    <div className="flex min-h-[252px] items-center justify-center px-5 text-center text-[13px] text-white/45" role="status">
      {englishMode ? 'Not enough overlapping daily closes for this period.' : '这段时间暂无足够的共同交易日收盘数据。'}
    </div>
  );

  const labelIndexes = [...new Set([0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round(ratio * (geometry.points.length - 1))))];
  const spansYears = model.from.slice(0, 4) !== model.to.slice(0, 4);

  return (
    <div ref={chartRef} className="relative mt-6 min-w-0" data-vix-comparison-chart="true">
      {selected && (
          <div className="pointer-events-none absolute inset-x-3 top-6 z-10 rounded-xl border border-white/[0.08] bg-[#0b0c0e]/95 px-3 py-2.5 text-[11px] tabular-nums shadow-lg" style={{ fontFamily: NUMBER_FONT }} aria-live="polite">
            <div className="mb-2 flex justify-between gap-2 text-white/45"><span>{selected.date}</span><span>{englishMode ? 'Daily change' : '当日涨跌'}</span></div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { label: `VIX ${number(selected.vix)}`, value: selected.vixDayChangePct, color: VIX_LINE_COLOR },
                { label: `${symbol} $${number(selected.price)}`, value: selected.priceDayChangePct, color: ETF_LINE_COLOR },
              ].map(item => <div key={item.label}>
                <div style={{ color: item.color }}>{item.label}</div>
                <div className={`mt-1 text-[12px] ${Number.isFinite(item.value) && item.value !== 0 ? marketTextClass(item.value, marketColorMode) : 'text-white/45'}`}>{formatVixComparisonChangePercent(item.value)}</div>
              </div>)}
            </div>
          </div>
      )}
      <div
        role="slider"
        tabIndex={0}
        aria-label={englishMode ? `Compare VIX and ${symbol} daily closes` : `查看 VIX 与 ${symbol} 同日收盘走势`}
        aria-valuemin={0}
        aria-valuemax={geometry.points.length - 1}
        aria-valuenow={selectedIndex ?? geometry.points.length - 1}
        aria-valuetext={selected ? `${selected.date}, VIX ${number(selected.vix)}, ${formatVixComparisonChangePercent(selected.vixDayChangePct)}, ${symbol} ${number(selected.price)} USD, ${formatVixComparisonChangePercent(selected.priceDayChangePct)}` : undefined}
        className="cursor-crosshair select-none rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-white/25"
        style={{ touchAction: 'pan-y', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
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
          if (gesture.intent === 'vertical') { setSelectedIndex(null); return; }
          if (gesture.intent === 'horizontal' || event.pointerType === 'mouse') selectAt(event);
        }}
        onPointerUp={event => {
          gestureRef.current = null;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { gestureRef.current = null; setSelectedIndex(null); }}
        onLostPointerCapture={() => { gestureRef.current = null; }}
        onPointerLeave={event => { if (event.pointerType === 'mouse' && !gestureRef.current) setSelectedIndex(null); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setSelectedIndex(null); return; }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          const last = geometry.points.length - 1;
          setSelectedIndex(current => event.key === 'Home' ? 0 : ['End', 'Enter', ' '].includes(event.key) ? last : Math.max(0, Math.min(last, (current ?? last) + (event.key === 'ArrowLeft' ? -1 : 1))));
        }}
      >
        <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="block w-full overflow-visible" role="img" aria-label={englishMode ? `VIX points on the left axis, ${symbol} adjusted USD price on the right axis` : `左轴 VIX 点位，右轴 ${symbol} 美元复权价`}>
          <text x={geometry.left} y="11" fill={VIX_LINE_COLOR} fontSize="12">VIX</text>
          <text x={geometry.right} y="11" textAnchor="end" fill={ETF_LINE_COLOR} fontSize="12">{symbol} · {englishMode ? 'Adj. USD' : '复权 USD'}</text>
          {geometry.vixAxis.ticks.map((value, index) => {
            const y = geometry.top + index * (geometry.bottom - geometry.top) / 4;
            return <g key={index}>
              <line x1={geometry.left} x2={geometry.right} y1={y} y2={y} stroke="rgba(255,255,255,.065)" strokeDasharray="2 4" />
              <text x={geometry.left - 8} y={y + 3.5} textAnchor="end" fill={VIX_LINE_COLOR} fillOpacity=".72" fontSize="12" fontFamily={NUMBER_FONT}>{formatVixComparisonAxisValue(value)}</text>
              <text x={geometry.right + 8} y={y + 3.5} fill={ETF_LINE_COLOR} fillOpacity=".72" fontSize="12" fontFamily={NUMBER_FONT}>{formatVixComparisonAxisValue(geometry.priceAxis.ticks[index])}</text>
            </g>;
          })}
          <path d={geometry.pricePath} fill="none" stroke={ETF_LINE_COLOR} strokeWidth="1.55" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={geometry.vixPath} fill="none" stroke={VIX_LINE_COLOR} strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {selected && <g pointerEvents="none">
            <line x1={selected.x} x2={selected.x} y1={geometry.top} y2={geometry.bottom} stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />
            <circle cx={selected.x} cy={selected.vixY} r="3.2" fill={VIX_LINE_COLOR} stroke="#0b0c0e" strokeWidth="1.5" />
            <circle cx={selected.x} cy={selected.priceY} r="3.2" fill={ETF_LINE_COLOR} stroke="#0b0c0e" strokeWidth="1.5" />
          </g>}
          {labelIndexes.map((index, position) => {
            const point = geometry.points[index];
            return <text key={index} x={point.x} y={geometry.height - 10} textAnchor={position === 0 ? 'start' : position === labelIndexes.length - 1 ? 'end' : 'middle'} fill="rgba(255,255,255,.4)" fontSize="12" fontFamily={NUMBER_FONT}>{spansYears ? point.date.slice(2, 7).replace('-', '/') : point.date.slice(5).replace('-', '/')}</text>;
          })}
        </svg>
      </div>
    </div>
  );
}
