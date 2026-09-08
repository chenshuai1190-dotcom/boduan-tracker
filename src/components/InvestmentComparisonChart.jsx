import React from 'react';

export const INVESTMENT_LEADING_COLOR = '#ff655e';
export const INVESTMENT_TRAILING_COLOR = '#4fd0a1';
export const INVESTMENT_NEUTRAL_COLOR = '#969faf';

export function investmentRank(symbol, symbols, point) {
  const values = symbols.map(item => point?.values?.[item]);
  if (values.length !== 2 || !values.every(Number.isFinite)) return 'tied';
  const tolerance = Number.EPSILON * Math.max(1, ...values.map(Math.abs)) * 8;
  if (Math.abs(values[0] - values[1]) <= tolerance) return 'tied';
  return symbol === symbols[values[0] > values[1] ? 0 : 1] ? 'leading' : 'trailing';
}

export function investmentRankColor(rank) {
  return rank === 'leading' ? INVESTMENT_LEADING_COLOR : rank === 'trailing' ? INVESTMENT_TRAILING_COLOR : INVESTMENT_NEUTRAL_COLOR;
}

export function investmentChangeColor(value) {
  return value > 0 ? INVESTMENT_LEADING_COLOR : value < 0 ? INVESTMENT_TRAILING_COLOR : INVESTMENT_NEUTRAL_COLOR;
}

export function formatInvestmentAmount(value, englishMode = false, { signed = false, currency = true, digits = 1 } = {}) {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const divisor = englishMode ? (absolute >= 1e9 ? 1e9 : absolute >= 1e6 ? 1e6 : absolute >= 1e3 ? 1e3 : 1) : (absolute >= 1e8 ? 1e8 : absolute >= 1e4 ? 1e4 : 1);
  const unit = englishMode ? ({ 1000000000: 'B', 1000000: 'M', 1000: 'K' }[divisor] || '') : ({ 100000000: '亿', 10000: '万' }[divisor] || '');
  const precision = divisor === 1 ? (absolute > 0 && absolute < 100 ? 2 : 0) : digits;
  const rounded = Number((absolute / divisor).toFixed(precision));
  const sign = rounded === 0 ? '' : value < 0 ? '−' : signed ? '+' : '';
  return `${sign}${currency ? '$' : ''}${rounded.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })}${unit}`;
}

export function formatInvestmentPercent(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded === 0 ? '0.0' : rounded.toFixed(1)}%`;
}

function linePath(points, symbol, x, y) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(point.values[symbol]).toFixed(2)}`).join(' ');
}

export default function InvestmentComparisonChart({ model, snapshot, hiddenSymbols = [], scale = 'linear', englishMode = false, onPause }) {
  const containerRef = React.useRef(null);
  const axisRefs = React.useRef([]);
  const labelRefs = React.useRef({});
  const gestureRef = React.useRef(null);
  const [width, setWidth] = React.useState(360);
  const [leftGutter, setLeftGutter] = React.useState(38);
  const [labelWidths, setLabelWidths] = React.useState({});
  const [hoverIndex, setHoverIndex] = React.useState(null);
  const uniqueId = React.useId().replace(/:/g, '');
  const height = width < 520 ? 440 : 480;
  const symbols = model.symbols;
  const visibleSymbols = symbols.filter(symbol => !hiddenSymbols.includes(symbol));
  const currentPoint = snapshot.point;
  const past = React.useMemo(() => model.points.slice(0, snapshot.index + 1), [model.points, snapshot.index]);

  React.useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const update = () => setWidth(Math.max(240, Math.round(node.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => { setHoverIndex(null); gestureRef.current = null; }, [model, snapshot.index]);
  React.useEffect(() => {
    if (hoverIndex === null) return undefined;
    const closeOutside = event => { if (!containerRef.current?.contains(event.target)) setHoverIndex(null); };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [hoverIndex]);

  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  past.forEach(point => visibleSymbols.forEach(symbol => { min = Math.min(min, point.values[symbol]); max = Math.max(max, point.values[symbol]); }));
  const spread = Math.max(max - min, model.principal * 0.45);
  let low = scale === 'log' ? min / 1.18 : Math.max(0, min - spread * 0.14);
  let high = scale === 'log' ? max * 1.18 : max + spread * 0.16;
  if (scale !== 'log') {
    const target = (high - low) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = ([1, 2, 2.5, 5, 10].find(value => value >= target / magnitude) || 10) * magnitude;
    low = Math.max(0, Math.floor(low / step) * step);
    high = Math.ceil(high / step) * step;
  }
  const ticks = Array.from({ length: 5 }, (_, index) => scale === 'log'
    ? Math.exp(Math.log(low) + ((Math.log(high) - Math.log(low)) * index / 4))
    : low + ((high - low) * index / 4));
  const tickLabels = ticks.map(value => formatInvestmentAmount(value, englishMode, { currency: false, digits: 1 }));
  const tickKey = tickLabels.join('|');

  React.useLayoutEffect(() => {
    const measured = axisRefs.current.map(node => node?.getComputedTextLength?.() || 0);
    const next = Math.max(28, Math.ceil(Math.max(0, ...measured)) + 9);
    setLeftGutter(current => Math.abs(current - next) > 1 ? next : current);
  }, [tickKey, englishMode, width]);

  const frame = { left: leftGutter, right: width - 10, top: 27, bottom: height - 42 };
  const inner = { left: frame.left + 5, right: frame.right - 8, top: frame.top + 11, bottom: frame.bottom - 8 };
  const firstTime = model.points[0].time;
  const endTime = Math.max(Date.UTC(Number(model.actualStartDate.slice(0, 4)) + 1, 0, 1), currentPoint.time);
  const x = time => inner.left + ((time - firstTime) / Math.max(1, endTime - firstTime)) * (inner.right - inner.left);
  const y = value => inner.bottom - (scale === 'log'
    ? (Math.log(value) - Math.log(low)) / Math.max(Number.EPSILON, Math.log(high) - Math.log(low))
    : (value - low) / Math.max(Number.EPSILON, high - low)) * (inner.bottom - inner.top);
  const endpoints = visibleSymbols.map(symbol => ({ symbol, x: x(currentPoint.time), y: y(currentPoint.values[symbol]), profit: currentPoint.profits[symbol] }));
  const labels = endpoints.map(point => ({ ...point, labelY: point.y - 12 })).sort((a, b) => a.labelY - b.labelY);
  labels.forEach((label, index) => { label.labelY = Math.max(inner.top + 14, label.labelY, index ? labels[index - 1].labelY + 23 : 0); });
  const overflow = labels.length ? Math.max(0, labels.at(-1).labelY - (inner.bottom - 6)) : 0;
  labels.forEach(label => { label.labelY -= overflow; });
  const labelKey = labels.map(label => `${label.symbol}:${formatInvestmentAmount(label.profit, englishMode, { signed: true })}`).join('|');

  React.useLayoutEffect(() => {
    const next = Object.fromEntries(symbols.map(symbol => [symbol, Math.ceil(labelRefs.current[symbol]?.getComputedTextLength?.() || 110)]));
    setLabelWidths(current => symbols.some(symbol => current[symbol] !== next[symbol]) ? next : current);
  }, [labelKey, symbols, englishMode]);

  const hover = hoverIndex === null ? null : past[hoverIndex];
  const hoverX = hover ? x(hover.time) : 0;
  const selectAt = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clientX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * width;
    const time = firstTime + (Math.max(inner.left, Math.min(x(currentPoint.time), clientX)) - inner.left) / Math.max(1, inner.right - inner.left) * (endTime - firstTime);
    let lo = 0;
    let hi = past.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (past[mid].time < time) lo = mid + 1; else hi = mid; }
    const nearest = lo > 0 && Math.abs(past[lo - 1].time - time) <= Math.abs(past[lo].time - time) ? lo - 1 : lo;
    setHoverIndex(nearest);
  };
  const tickCount = width < 400 ? 3 : 4;

  return <div ref={containerRef} className="ic-chart" data-investment-comparison-chart="true">
    <div className="ic-chart-touch" tabIndex={0} role="slider" aria-label={englishMode ? 'Inspect historical portfolio values' : '查看历史投资总资产'} aria-valuemin={0} aria-valuemax={snapshot.index} aria-valuenow={hoverIndex ?? snapshot.index}
      aria-valuetext={`${(hover || currentPoint).date}, ${symbols.map(symbol => `${symbol} ${formatInvestmentAmount((hover || currentPoint).values[symbol], englishMode)} USD`).join(', ')}`}
      onPointerDown={event => { onPause?.(); gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, intent: 'pending' }; event.currentTarget.setPointerCapture?.(event.pointerId); selectAt(event); }}
      onPointerMove={event => {
        const gesture = gestureRef.current;
        if (!gesture) { if (event.pointerType === 'mouse') selectAt(event); return; }
        if (gesture.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
        if (gesture.intent === 'pending' && Math.max(dx, dy) >= 7) gesture.intent = dy > dx ? 'vertical' : 'horizontal';
        if (gesture.intent === 'vertical') setHoverIndex(null); else if (gesture.intent === 'horizontal' || event.pointerType === 'mouse') selectAt(event);
      }}
      onPointerUp={event => { gestureRef.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { gestureRef.current = null; setHoverIndex(null); }}
      onLostPointerCapture={() => { gestureRef.current = null; }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && !gestureRef.current) setHoverIndex(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setHoverIndex(null); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); onPause?.();
        setHoverIndex(current => event.key === 'Home' ? 0 : event.key === 'End' ? snapshot.index : Math.max(0, Math.min(snapshot.index, (current ?? snapshot.index) + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={englishMode ? 'Total assets including principal, based on actual adjusted daily closes' : '包含本金的总资产走势，使用真实复权日线'}>
        <defs>
          <clipPath id={`ic-clip-${uniqueId}`}><rect x={frame.left} y={frame.top} width={frame.right - frame.left} height={frame.bottom - frame.top} /></clipPath>
          {visibleSymbols.map(symbol => <linearGradient id={`ic-area-${uniqueId}-${symbol}`} key={symbol} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={investmentRankColor(investmentRank(symbol, symbols, currentPoint))} stopOpacity=".12" /><stop offset="100%" stopColor={investmentRankColor(investmentRank(symbol, symbols, currentPoint))} stopOpacity="0" /></linearGradient>)}
        </defs>
        <text x={frame.left} y="13" className="ic-axis-title">{englishMode ? 'Assets · USD' : '资产 · USD'}{scale === 'log' ? (englishMode ? ' · Log' : ' · 对数') : ''}</text>
        {ticks.map((value, index) => <g key={index}><line x1={frame.left} x2={frame.right} y1={y(value)} y2={y(value)} className="ic-grid-line" /><text ref={node => { axisRefs.current[index] = node; }} x={frame.left - 6} y={y(value) + 4} textAnchor="end" className="ic-axis-label">{tickLabels[index]}</text></g>)}
        <g clipPath={`url(#ic-clip-${uniqueId})`}>
          {visibleSymbols.map((symbol, index) => {
            const path = linePath(past, symbol, x, y);
            const endpoint = endpoints.find(item => item.symbol === symbol);
            const color = investmentRankColor(investmentRank(symbol, symbols, currentPoint));
            return <g key={symbol} data-investment-series={symbol} data-rank={investmentRank(symbol, symbols, currentPoint)}>
              <path d={`${path} L${endpoint.x},${inner.bottom} L${x(past[0].time)},${inner.bottom} Z`} fill={`url(#ic-area-${uniqueId}-${symbol})`} />
              <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={endpoint.x} cy={endpoint.y} r="8" fill={color} opacity=".15" />
              {index === 0 ? <circle cx={endpoint.x} cy={endpoint.y} r="3.5" fill={color} /> : <rect x={endpoint.x - 3.5} y={endpoint.y - 3.5} width="7" height="7" rx="1.5" fill={color} />}
            </g>;
          })}
          {labels.map(label => {
            const measuredWidth = labelWidths[label.symbol] || 110;
            const desired = label.x - measuredWidth - 9 >= frame.left + 4 ? label.x - measuredWidth - 9 : label.x + 10;
            const labelX = Math.max(frame.left + 4, Math.min(frame.right - measuredWidth - 4, desired));
            return <text key={label.symbol} ref={node => { labelRefs.current[label.symbol] = node; }} x={labelX} y={label.labelY} className="ic-direct-label" data-investment-profit-label={label.symbol} aria-label={`${label.symbol} ${englishMode ? 'cumulative profit' : '累计盈亏'} ${formatInvestmentAmount(label.profit, englishMode, { signed: true })}`}><tspan>{label.symbol} </tspan><tspan fill={investmentChangeColor(label.profit)}>{formatInvestmentAmount(label.profit, englishMode, { signed: true })}</tspan></text>;
          })}
          {hover && <g pointerEvents="none"><line x1={hoverX} x2={hoverX} y1={frame.top} y2={frame.bottom} stroke="#969faf" strokeWidth="1" strokeDasharray="3 3" />{visibleSymbols.map(symbol => <circle key={symbol} cx={hoverX} cy={y(hover.values[symbol])} r="4" fill={investmentRankColor(investmentRank(symbol, symbols, currentPoint))} stroke="#0b0e14" strokeWidth="2" />)}</g>}
        </g>
        {Array.from({ length: tickCount }, (_, index) => {
          const time = firstTime + ((endTime - firstTime) * index / (tickCount - 1));
          const date = new Date(time).toISOString().slice(0, 10);
          return <text key={index} x={inner.left + (inner.right - inner.left) * index / (tickCount - 1)} y={frame.bottom + 22} textAnchor={index === 0 ? 'start' : index === tickCount - 1 ? 'end' : 'middle'} className="ic-axis-label">{endTime - firstTime > 63072000000 ? date.slice(0, 4) : date.slice(2, 7).replace('-', '.')}</text>;
        })}
        <text x={frame.right} y={height - 2} textAnchor="end" className="ic-axis-title">{englishMode ? 'Year' : '年份'}</text>
      </svg>
    </div>
    {hover && <div className="ic-tooltip" role="tooltip" style={{ left: Math.max(0, Math.min(width - 192, hoverX + 12 > width - 192 ? hoverX - 204 : hoverX + 12)), top: frame.top + 5 }}><div className="ic-tooltip-date">{hover.date}</div>{visibleSymbols.map(symbol => <div className="ic-tooltip-line" key={symbol}><span>{symbol}</span><span>{formatInvestmentAmount(hover.values[symbol], englishMode)}</span></div>)}</div>}
  </div>;
}
