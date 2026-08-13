import React from 'react';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const CHART_COLOR = '#50d0a2';
const CHART_LATEST_COLOR = '#f6c56f';

export const MONTHLY_ASSET_CHART_WIDTH = 370;
export const MONTHLY_ASSET_CHART_HEIGHT = 206;
export const MONTHLY_ASSET_CHART_BOUNDS = Object.freeze({ left: 48, right: 362, top: 22, bottom: 169 });

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatWan(value, language, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  if (language === 'zh') return `${formatNumber(value / 10000, digits)}万`;
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, digits)}M`;
  if (absolute >= 1_000) return `${formatNumber(value / 1_000, digits)}K`;
  return formatNumber(value, digits);
}

function formatMonthAxis(month, language, first = false) {
  const [year, rawMonth] = String(month || '').split('-');
  if (!year || !rawMonth) return '--';
  if (first) return language === 'zh' ? `${year}-${rawMonth}` : `${rawMonth}/${year.slice(-2)}`;
  return language === 'zh' ? `${rawMonth}月` : rawMonth;
}

export function smoothMonthlyAssetTrendPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

export function buildMonthlyAssetTrendChartScale(model, monthCount) {
  const values = model.points.map(point => point.balance);
  const rawMin = values.length > 0 ? Math.min(...values) : 0;
  const rawMax = values.length > 0 ? Math.max(...values) : 1;
  const rawRange = Math.max(rawMax - rawMin, rawMax * 0.08, 1);
  const stepMagnitude = 10 ** Math.floor(Math.log10(rawRange / 4));
  const normalizedStep = rawRange / 4 / stepMagnitude;
  const roundedStep = (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10) * stepMagnitude;
  const min = Math.max(0, Math.floor((rawMin - rawRange * 0.15) / roundedStep) * roundedStep);
  const max = Math.max(min + roundedStep, Math.ceil((rawMax + rawRange * 0.12) / roundedStep) * roundedStep);
  const range = max - min;
  const xForIndex = index => MONTHLY_ASSET_CHART_BOUNDS.left
    + (index / Math.max(monthCount - 1, 1)) * (MONTHLY_ASSET_CHART_BOUNDS.right - MONTHLY_ASSET_CHART_BOUNDS.left);
  const yForValue = value => MONTHLY_ASSET_CHART_BOUNDS.bottom
    - ((value - min) / range) * (MONTHLY_ASSET_CHART_BOUNDS.bottom - MONTHLY_ASSET_CHART_BOUNDS.top);
  const pointsByIndex = new Map(model.points.map(point => [point.index, {
    ...point,
    x: xForIndex(point.index),
    y: yForValue(point.balance),
  }]));

  return {
    min,
    max,
    range,
    xForIndex,
    yForValue,
    pointsByIndex,
    ticks: Array.from({ length: 5 }, (_, index) => max - (range / 4) * index),
  };
}

function TrendValueLabel({ x, y, width, children }) {
  const boxX = Math.max(2, Math.min(MONTHLY_ASSET_CHART_WIDTH - 2 - width, x - width / 2));
  return (
    <g pointerEvents="none">
      <rect x={boxX} y={y} width={width} height="24" rx="7" fill="#101318" stroke="rgba(246,197,111,.42)" />
      <text
        x={boxX + width / 2}
        y={y + 15.5}
        textAnchor="middle"
        fill="rgba(255,255,255,.90)"
        fontSize="10"
        fontFamily={NUMBER_FONT}
      >
        {children}
      </text>
    </g>
  );
}

function chartLabelIndexes(monthCount) {
  const last = monthCount - 1;
  const candidates = last >= 12 ? [0, 2, 4, 6, 8, 10, last] : [0, 2, 4, 6, 8, last];
  return new Set(candidates.filter(index => index >= 0 && index < monthCount));
}

export default function MonthlyAssetTrendChart({
  language = 'zh',
  months = [],
  model,
  scale,
  selectedIndex = null,
  latestPointIndex = null,
  maxPointIndex = null,
  connectGaps = false,
  showSelectedLabel = true,
  animate = false,
  latestPointDelayMs = 0,
  onPointClick,
  ariaLabel,
  className = 'block h-full w-full overflow-visible',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}) {
  const idBase = React.useId().replace(/:/g, '');
  const areaId = `monthlyAssetTrendArea-${idBase}`;
  const latestGlowId = `monthlyAssetLatestGlow-${idBase}`;
  const selectedPoint = selectedIndex === null ? null : scale.pointsByIndex.get(selectedIndex);
  const latestPoint = latestPointIndex === null ? null : scale.pointsByIndex.get(latestPointIndex);
  const maxPoint = maxPointIndex === null ? null : scale.pointsByIndex.get(maxPointIndex);
  const rawSegments = connectGaps ? [model.points] : model.segments;
  const lineSegments = rawSegments
    .map(segment => segment.map(point => scale.pointsByIndex.get(point.index)).filter(Boolean))
    .filter(segment => segment.length > 0);
  const labelIndexes = chartLabelIndexes(months.length);

  return (
    <svg
      viewBox={`0 0 ${MONTHLY_ASSET_CHART_WIDTH} ${MONTHLY_ASSET_CHART_HEIGHT}`}
      className={className}
      data-monthly-asset-trend-chart="true"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      style={{ touchAction: 'pan-y' }}
    >
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART_COLOR} stopOpacity="0.28" />
          <stop offset="100%" stopColor={CHART_COLOR} stopOpacity="0.015" />
        </linearGradient>
        <filter id={latestGlowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {animate && (
        <style>{`
          @keyframes monthlyAssetLineDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          @keyframes monthlyAssetAreaFade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes monthlyAssetPointPop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
          .monthly-asset-line-animated { animation: monthlyAssetLineDraw 760ms ease-out both; stroke-dasharray: 1; stroke-dashoffset: 1; }
          .monthly-asset-area-animated { animation: monthlyAssetAreaFade 620ms ease-out both; }
          .monthly-asset-point-animated { animation: monthlyAssetPointPop 360ms ease-out both; transform-box: fill-box; transform-origin: center; }
        `}</style>
      )}

      {scale.ticks.map((tick, index) => {
        const y = MONTHLY_ASSET_CHART_BOUNDS.top
          + ((MONTHLY_ASSET_CHART_BOUNDS.bottom - MONTHLY_ASSET_CHART_BOUNDS.top) / 4) * index;
        return (
          <g key={`${tick}-${index}`}>
            <line
              x1={MONTHLY_ASSET_CHART_BOUNDS.left}
              x2={MONTHLY_ASSET_CHART_BOUNDS.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x="0" y={y + 3.5} textAnchor="start" fill="rgba(255,255,255,0.48)" fontSize="10" fontFamily={NUMBER_FONT}>
              {formatWan(tick, language, 0)}
            </text>
          </g>
        );
      })}

      {lineSegments.map((points, index) => {
        if (points.length < 2) return null;
        const path = smoothMonthlyAssetTrendPath(points);
        return (
          <React.Fragment key={`segment-${index}`}>
            <path
              d={`${path} L ${points.at(-1).x} ${MONTHLY_ASSET_CHART_BOUNDS.bottom} L ${points[0].x} ${MONTHLY_ASSET_CHART_BOUNDS.bottom} Z`}
              fill={`url(#${areaId})`}
              className={animate ? 'monthly-asset-area-animated' : undefined}
            />
            <path
              d={path}
              fill="none"
              stroke={CHART_COLOR}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              className={animate ? 'monthly-asset-line-animated' : undefined}
            />
          </React.Fragment>
        );
      })}

      {lineSegments.filter(segment => segment.length === 1).map((segment) => (
        <circle key={`single-${segment[0].index}`} cx={segment[0].x} cy={segment[0].y} r="2.4" fill={CHART_COLOR} />
      ))}

      {maxPoint && maxPoint.index !== latestPoint?.index && (
        <circle cx={maxPoint.x} cy={maxPoint.y} r="5.3" fill="#101318" stroke={CHART_COLOR} strokeWidth="2" />
      )}

      {latestPoint && (
        <g className={animate ? 'monthly-asset-point-animated' : undefined} style={animate ? { animationDelay: `${latestPointDelayMs}ms` } : undefined}>
          <circle cx={latestPoint.x} cy={latestPoint.y} r="8" fill={CHART_LATEST_COLOR} opacity="0.18" filter={`url(#${latestGlowId})`} />
          <circle cx={latestPoint.x} cy={latestPoint.y} r="4.5" fill="#f5f7fb" stroke={CHART_LATEST_COLOR} strokeWidth="2" />
        </g>
      )}

      {selectedPoint && (
        <>
          <line
            x1={selectedPoint.x}
            x2={selectedPoint.x}
            y1={MONTHLY_ASSET_CHART_BOUNDS.top}
            y2={MONTHLY_ASSET_CHART_BOUNDS.bottom}
            stroke="rgba(255,255,255,.16)"
            strokeDasharray="3 4"
          />
          <circle cx={selectedPoint.x} cy={selectedPoint.y} r="4" fill="#f5f7fb" stroke={CHART_COLOR} strokeWidth="2" />
          {showSelectedLabel && (
            <TrendValueLabel x={selectedPoint.x} y={Math.max(1, selectedPoint.y - 31)} width={language === 'zh' ? 112 : 118}>
              {`${selectedPoint.month} · ${formatWan(selectedPoint.balance, language)}`}
            </TrendValueLabel>
          )}
        </>
      )}

      {typeof onPointClick === 'function' && model.points.map((point) => {
        const scaledPoint = scale.pointsByIndex.get(point.index);
        return (
          <circle
            key={`hit-${point.index}`}
            cx={scaledPoint.x}
            cy={scaledPoint.y}
            r="13"
            fill="transparent"
            onClick={() => onPointClick(point.index)}
            style={{ cursor: 'pointer' }}
          />
        );
      })}

      {months.map((month, index) => {
        if (!labelIndexes.has(index)) return null;
        const first = index === 0;
        const last = index === months.length - 1;
        const labelX = last ? MONTHLY_ASSET_CHART_WIDTH : scale.xForIndex(index) + (index === 2 ? 8 : 0);
        return (
          <text
            key={month}
            x={labelX}
            y={MONTHLY_ASSET_CHART_HEIGHT - 12}
            textAnchor={first ? 'start' : last ? 'end' : 'middle'}
            fill="rgba(255,255,255,0.43)"
            fontSize="10"
            fontFamily={NUMBER_FONT}
          >
            {formatMonthAxis(month, language, first)}
          </text>
        );
      })}
    </svg>
  );
}
