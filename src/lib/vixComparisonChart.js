import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export const VIX_COMPARISON_RANGES = Object.freeze(['1m', '3m', '6m', '1y', '5y']);

export function formatVixComparisonChangePercent(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(2));
  if (rounded === 0) return '0.00%';
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

export function formatVixComparisonAxisValue(value) {
  if (!Number.isFinite(value)) return '—';
  const compact = Math.abs(value) >= 10000;
  return `${(compact ? value / 1000 : value).toLocaleString('en-US', { maximumFractionDigits: 2 })}${compact ? 'k' : ''}`;
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeVixComparisonRows(rows) {
  const dates = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!validDateKey(row?.date) || !['number', 'string'].includes(typeof row.close) || row.close === '') continue;
    const close = Number(row.close);
    if (Number.isFinite(close) && close > 0) dates.set(row.date, { date: row.date, close });
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function rangeStartDate(endDate, range) {
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60 }[range] || 12;
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(end.getUTCDate(), lastDay));
  return first.toISOString().slice(0, 10);
}

function isRegularUsSessionDate(dateKey) {
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(dateKey);
}

function previousRegularUsSessionDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  for (let index = 0; index < 10; index += 1) {
    date.setUTCDate(date.getUTCDate() - 1);
    const candidate = date.toISOString().slice(0, 10);
    if (isRegularUsSessionDate(candidate)) return candidate;
  }
  return null;
}

export function buildVixComparisonModel({ vixRows = [], benchmarkRows = [], range = '1y' } = {}) {
  const benchmarkByDate = new Map(normalizeVixComparisonRows(benchmarkRows).map(row => [row.date, row.close]));
  const aligned = normalizeVixComparisonRows(vixRows)
    .filter(row => benchmarkByDate.has(row.date))
    .map(row => ({ date: row.date, vix: row.close, price: benchmarkByDate.get(row.date) }))
    .map((row, index, allRows) => {
      const previous = allRows[index - 1];
      // A missing common trading date must not turn a multi-day move into a daily move.
      const hasPreviousSession = Boolean(previous && isRegularUsSessionDate(row.date)
        && previous.date === previousRegularUsSessionDate(row.date));
      return {
        ...row,
        priceDayChangePct: hasPreviousSession ? ((row.price - previous.price) / previous.price) * 100 : null,
        vixDayChangePct: hasPreviousSession ? ((row.vix - previous.vix) / previous.vix) * 100 : null,
      };
    });
  const requestedFrom = aligned.length ? rangeStartDate(aligned.at(-1).date, range) : '';
  const rows = aligned.filter(row => row.date >= requestedFrom);
  const first = rows[0] || null;
  const last = rows.at(-1) || null;
  return {
    rows,
    requestedFrom,
    from: first?.date || '',
    to: last?.date || '',
    first,
    last,
    hasComparison: rows.length >= 2,
    priceChangePct: rows.length >= 2 ? ((last.price / first.price) - 1) * 100 : null,
    vixLow: rows.length ? Math.min(...rows.map(row => row.vix)) : null,
    vixHigh: rows.length ? Math.max(...rows.map(row => row.vix)) : null,
  };
}

function axisScale(values, top, bottom) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(rawMax - rawMin, rawMax * 0.08, 1);
  const target = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].find(candidate => candidate >= target / magnitude) * magnitude;
  const min = Math.max(0, Math.floor((rawMin - span * 0.08) / step) * step);
  const max = Math.max(min + step, Math.ceil((rawMax + span * 0.08) / step) * step);
  return {
    min,
    max,
    ticks: Array.from({ length: 5 }, (_, i) => max - ((max - min) * i / 4)),
    y: value => bottom - ((value - min) / (max - min)) * (bottom - top),
  };
}

export function buildVixComparisonGeometry(rows, {
  width = 380, height = 252, left = 38, right = 336, top = 24, bottom = 218,
} = {}) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const vixAxis = axisScale(rows.map(row => row.vix), top, bottom);
  const priceAxis = axisScale(rows.map(row => row.price), top, bottom);
  const points = rows.map((row, index) => ({
    ...row,
    x: left + (index / (rows.length - 1)) * (right - left),
    vixY: vixAxis.y(row.vix),
    priceY: priceAxis.y(row.price),
  }));
  const path = field => points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point[field].toFixed(2)}`).join(' ');
  return { width, height, left, right, top, bottom, points, vixAxis, priceAxis, vixPath: path('vixY'), pricePath: path('priceY') };
}

export function nearestVixComparisonIndex(points, viewX) {
  if (!Array.isArray(points) || !points.length || !Number.isFinite(viewX)) return null;
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const current = Math.abs(point.x - viewX);
    if (current < distance) { distance = current; nearest = index; }
  });
  return nearest;
}
