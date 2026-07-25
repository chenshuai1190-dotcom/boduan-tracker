function isRenderableNumber(value) {
  return value !== null
    && value !== undefined
    && value !== ''
    && Number.isFinite(Number(value));
}

export function isExplicitUnknownNetAssetPoint(point) {
  return isRenderableNumber(point?.totalAssetUsd)
    && !isRenderableNumber(point?.netAssetUsd);
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
