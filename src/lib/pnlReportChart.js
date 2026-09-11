export function isRenderableChartValue(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value));
}

export function buildChartDomain(points = [], keys = [], kind = 'percentage') {
  const valueKeys = Array.isArray(keys) ? keys : [keys];
  const values = points.flatMap(point => valueKeys
    .filter(key => isRenderableChartValue(point?.[key]))
    .map(key => Number(point[key])));
  if (!values.length) return null;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const min = kind === 'percentage' ? Math.min(0, rawMin) : rawMin;
  const max = kind === 'percentage' ? Math.max(0, rawMax) : rawMax;
  const padding = kind === 'percentage'
    ? Math.max((max - min) * 0.08, 0.001)
    : Math.max((max - min) * 0.1, Math.abs(max) * 0.01, 1);
  return { min: min - padding, max: max + padding };
}

export function chartX(index, total, width = 310, pad = 8) {
  if (total === 1) return width / 2;
  return pad + (index / Math.max(total - 1, 1)) * (width - pad * 2);
}

export function buildLinePoints(points = [], key, domain, width = 310, height = 210, pad = 8) {
  if (!domain || !Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return [];
  const span = domain.max - domain.min;
  return points.flatMap((point, index) => {
    if (!isRenderableChartValue(point?.[key])) return [];
    const value = Number(point[key]);
    return [{ point, index, value, x: chartX(index, points.length, width, pad),
      y: pad + (1 - ((value - domain.min) / span)) * (height - pad * 2) }];
  });
}

export function isExplicitUnknownNetAssetPoint(point) {
  return isRenderableChartValue(point?.totalAssetUsd)
    && !isRenderableChartValue(point?.netAssetUsd);
}

export function splitChartPointSegments(data = [], plottedPoints = [], isGap = () => false) {
  const plottedByIndex = new Map(
    (Array.isArray(plottedPoints) ? plottedPoints : [])
      .map((point) => [point?.index, point])
      .filter(([index, point]) => Number.isInteger(index) && point),
  );
  const segments = [];
  let current = [];

  (Array.isArray(data) ? data : []).forEach((point, index) => {
    const plotted = plottedByIndex.get(index);
    if (plotted) {
      current.push(plotted);
      return;
    }
    if (!isGap(point, index)) return;
    if (current.length > 0) segments.push(current);
    current = [];
  });

  if (current.length > 0) segments.push(current);
  return segments;
}

export function buildLinePathFromPoints(points = []) {
  return (Array.isArray(points) ? points : []).map(({ x, y }, pathIndex) => (
    `${pathIndex === 0 ? 'M' : 'L'}${Number(x).toFixed(2)} ${Number(y).toFixed(2)}`
  )).join(' ');
}

export function buildAreaPathFromPoints(points = [], height = 150, pad = 10) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const linePath = buildLinePathFromPoints(points);
  return `${linePath} L${Number(points.at(-1).x).toFixed(2)} ${height - pad} L${Number(points[0].x).toFixed(2)} ${height - pad} Z`;
}
