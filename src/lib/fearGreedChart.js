const DAY = 86_400_000;
const RANGE_DAYS = { '1m': 30, '3m': 90, '1y': 365 };
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Display geometry only. Raw indicator values and separate series remain intact. */
export function buildFearGreedChart(series = [], { range = '1y', fixedDomain = null } = {}) {
  const width = 360;
  const height = 224;
  const padding = { left: 38, right: 10, top: 10, bottom: 28 };
  const normalized = (Array.isArray(series) ? series : []).map(item => {
    const points = new Map();
    for (const point of Array.isArray(item?.points) ? item.points : []) {
      if (finite(point?.timestamp) && point.timestamp > 0 && finite(point?.value)) {
        points.set(point.timestamp, { timestamp: point.timestamp, value: point.value });
      }
    }
    return { id: item?.id || '', points: [...points.values()].sort((a, b) => a.timestamp - b.timestamp) };
  });
  const latest = normalized.flatMap(item => item.points.map(point => point.timestamp));
  const latestTimestamp = latest.length ? Math.max(...latest) : null;
  const cutoff = latestTimestamp === null ? null : latestTimestamp - (RANGE_DAYS[range] || RANGE_DAYS['1y']) * DAY;
  const visible = normalized.map(item => ({ ...item, points: item.points.filter(point => point.timestamp >= cutoff) }));
  const timestamps = [...new Set(visible.flatMap(item => item.points.map(point => point.timestamp)))].sort((a, b) => a - b);
  const startTimestamp = timestamps[0] ?? null;
  const endTimestamp = timestamps.at(-1) ?? null;
  const values = visible.flatMap(item => item.points.map(point => point.value));
  let domain = Array.isArray(fixedDomain) && fixedDomain.length === 2 && fixedDomain.every(finite) && fixedDomain[1] > fixedDomain[0]
    ? [...fixedDomain]
    : values.length ? [Math.min(...values), Math.max(...values)] : [0, 1];
  if (domain[0] === domain[1]) {
    const margin = Math.max(1, Math.abs(domain[0]) * .04);
    domain = [domain[0] - margin, domain[1] + margin];
  } else if (!fixedDomain && values.length) {
    const margin = (domain[1] - domain[0]) * .08;
    domain = [domain[0] - margin, domain[1] + margin];
  }
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = timestamp => padding.left + (endTimestamp === startTimestamp ? .5 : (timestamp - startTimestamp) / (endTimestamp - startTimestamp)) * plotWidth;
  const y = value => padding.top + (domain[1] - value) / (domain[1] - domain[0]) * plotHeight;
  return {
    width, height, padding, domain, timestamps, latestTimestamp, startTimestamp, endTimestamp,
    series: visible.map(item => {
      const points = item.points.map(point => ({ ...point, x: x(point.timestamp), y: y(point.value) }));
      return { id: item.id, points, path: points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ') };
    }),
  };
}

export function nearestFearGreedTimestamp(timestamps, ratio) {
  if (!Array.isArray(timestamps) || !timestamps.length || !finite(ratio)) return null;
  const target = timestamps[0] + Math.min(1, Math.max(0, ratio)) * (timestamps.at(-1) - timestamps[0]);
  let left = 0;
  let right = timestamps.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (timestamps[middle] < target) left = middle + 1;
    else right = middle;
  }
  if (left > 0 && target - timestamps[left - 1] <= timestamps[left] - target) return timestamps[left - 1];
  return timestamps[left];
}
