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

export function buildChartRecordHighs(points = []) {
  const records = [];
  let peak = null;
  for (const point of Array.isArray(points) ? points : []) {
    if (!isRenderableChartValue(point?.value)) continue;
    const value = Number(point.value);
    if (peak === null) {
      peak = value;
      continue;
    }
    // Ignore rounding dust while preserving meaningful advances at any scale.
    const epsilon = Number.EPSILON * Math.max(1, Math.abs(peak), Math.abs(value)) * 8;
    if (value - peak <= epsilon) continue;
    records.push(point);
    peak = value;
  }
  return records;
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

// Keep the previous observation until the next observation's x coordinate.
// Call separately for each known-data segment; this does not fill missing dates.
export function buildStepLinePathFromPoints(points = []) {
  return (Array.isArray(points) ? points : []).map(({ x, y }, pathIndex) => (
    pathIndex === 0
      ? `M${Number(x).toFixed(2)} ${Number(y).toFixed(2)}`
      : `H${Number(x).toFixed(2)} V${Number(y).toFixed(2)}`
  )).join(' ');
}

// Split only drawing geometry; synthetic zero crossings have no date/index and
// must not be used as report observations, selections, or record-high inputs.
export function splitChartLineBySign(points = []) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  const samePosition = (first, second) => first.x === second.x && first.y === second.y;
  const appendEdge = (sign, first, second) => {
    if (samePosition(first, second)) return;
    const previous = segments.at(-1);
    if (previous?.sign === sign && samePosition(previous.points.at(-1), first)) {
      previous.points.push(second);
    } else {
      segments.push({ sign, points: [first, second] });
    }
  };

  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const firstValue = Number(first.value);
    const secondValue = Number(second.value);
    const crossesZero = (firstValue < 0 && secondValue > 0)
      || (firstValue > 0 && secondValue < 0);
    if (crossesZero) {
      // Scale magnitudes before adding to keep finite large values finite.
      const scale = Math.max(Math.abs(firstValue), Math.abs(secondValue));
      const firstMagnitude = Math.abs(firstValue) / scale;
      const secondMagnitude = Math.abs(secondValue) / scale;
      const fraction = firstMagnitude / (firstMagnitude + secondMagnitude);
      const crossing = {
        x: first.x + (second.x - first.x) * fraction,
        y: first.y + (second.y - first.y) * fraction,
        value: 0,
      };
      appendEdge(firstValue < 0 ? -1 : 1, first, crossing);
      appendEdge(secondValue < 0 ? -1 : 1, crossing, second);
    } else {
      // An edge touching zero takes its nonzero endpoint's color. A flat zero
      // edge follows the market convention that zero is nonnegative.
      appendEdge(firstValue < 0 || secondValue < 0 ? -1 : 1, first, second);
    }
  }
  return segments;
}

export function buildAreaPathFromPoints(points = [], height = 150, pad = 10) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const linePath = buildLinePathFromPoints(points);
  return `${linePath} L${Number(points.at(-1).x).toFixed(2)} ${height - pad} L${Number(points[0].x).toFixed(2)} ${height - pad} Z`;
}
