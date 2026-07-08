function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizeDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dateFromKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateKey, months) {
  const date = dateFromKey(dateKey);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function startOfYear(dateKey) {
  return `${String(dateKey).slice(0, 4)}-01-01`;
}

function monthLabel(dateKey) {
  const [year, month] = String(dateKey || '').split('-');
  return year && month ? `${year}/${month}` : '--';
}

function displayDate(dateKey) {
  return String(dateKey || '').replaceAll('-', '/');
}

function displayUpdatedAt(value, fallbackDate) {
  const raw = value || fallbackDate;
  if (!raw) return '--';
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }
  const [, month, day] = String(raw).split('-');
  return month && day ? `${month}.${day}` : '--';
}

export function filterPnlSnapshotsByRange(snapshots = [], range = 'all', now = new Date()) {
  const normalized = (Array.isArray(snapshots) ? snapshots : [])
    .filter((snapshot) => snapshot?.snapshotDate)
    .sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  if (range === 'all' || normalized.length === 0) return normalized;

  const today = normalizeDate(now);
  const start = {
    month: `${today.slice(0, 7)}-01`,
    '1m': addMonths(today, -1),
    '6m': addMonths(today, -6),
    ytd: startOfYear(today),
    '1y': addDays(today, -365),
  }[range];
  if (!start) return normalized;
  return normalized.filter((snapshot) => String(snapshot.snapshotDate) >= start);
}

function buildCalendar(snapshots, selectedDate) {
  const monthKey = String(selectedDate || '').slice(0, 7);
  return snapshots
    .filter((snapshot) => String(snapshot.snapshotDate || '').startsWith(monthKey))
    .map((snapshot) => ({
      day: Number(String(snapshot.snapshotDate).slice(8, 10)),
      valueUsd: snapshot.dailyPnlUsd == null ? null : toNumber(snapshot.dailyPnlUsd),
      rate: snapshot.dailyPnlPct == null ? null : toNumber(snapshot.dailyPnlPct),
    }))
    .filter((item) => item.day > 0);
}

function rankSymbols(symbolSnapshots, direction) {
  const rows = (Array.isArray(symbolSnapshots) ? symbolSnapshots : [])
    .filter((row) => row?.symbol)
    .map((row) => ({
      symbol: row.symbol,
      name: row.name || row.symbol,
      pnlUsd: toNumber(row.cumulativePnlUsd),
    }));

  return rows
    .filter((row) => direction === 'gain' ? row.pnlUsd >= 0 : row.pnlUsd < 0)
    .sort((a, b) => direction === 'gain'
      ? b.pnlUsd - a.pnlUsd || a.symbol.localeCompare(b.symbol)
      : a.pnlUsd - b.pnlUsd || a.symbol.localeCompare(b.symbol))
    .slice(0, 5);
}

export function buildPnlReportViewModel({
  portfolioSnapshots = [],
  symbolSnapshots = [],
  range = 'all',
  now = new Date(),
} = {}) {
  const sortedDesc = (Array.isArray(portfolioSnapshots) ? portfolioSnapshots : [])
    .filter((snapshot) => snapshot?.snapshotDate)
    .sort((a, b) => String(b.snapshotDate).localeCompare(String(a.snapshotDate)));
  const latest = sortedDesc[0] || null;
  const chronological = [...sortedDesc].reverse();
  const ranged = filterPnlSnapshotsByRange(chronological, range, now);
  const trendSource = ranged.length > 0 ? ranged : chronological;

  if (!latest) {
    return {
      hasData: false,
      startDate: '--',
      endDate: '--',
      selectedMonth: monthLabel(normalizeDate(now)),
      updatedAt: '--',
      totalPnlUsd: 0,
      totalPnlPct: 0,
      turnoverUsd: 0,
      tradeStockCount: 0,
      outperformPct: null,
      trend: [],
      calendar: [],
      summary: {
        stockPnlUsd: 0,
        best: null,
        worst: null,
      },
      rankings: {
        gain: [],
        loss: [],
      },
    };
  }

  const gainRows = rankSymbols(symbolSnapshots, 'gain');
  const lossRows = rankSymbols(symbolSnapshots, 'loss');
  const latestDate = latest.snapshotDate;
  const trend = trendSource.map((snapshot) => ({
    label: monthLabel(snapshot.snapshotDate),
    pnlPct: toNumber(snapshot.cumulativePnlPct),
    benchmarkPct: isFiniteNumber(snapshot.benchmarkPct) ? toNumber(snapshot.benchmarkPct) : null,
    assetUsd: toNumber(snapshot.totalAssetsUsd),
  }));

  return {
    hasData: true,
    startDate: displayDate((trendSource[0] || latest).snapshotDate),
    endDate: displayDate(latestDate),
    selectedMonth: monthLabel(latestDate),
    updatedAt: displayUpdatedAt(latest.updatedAt, latestDate),
    totalPnlUsd: toNumber(latest.cumulativePnlUsd),
    totalPnlPct: toNumber(latest.cumulativePnlPct),
    turnoverUsd: toNumber(latest.totalBuyCostUsd) + toNumber(latest.sellProceedsUsd),
    tradeStockCount: new Set((Array.isArray(symbolSnapshots) ? symbolSnapshots : []).map((row) => row.symbol).filter(Boolean)).size,
    outperformPct: null,
    trend,
    calendar: buildCalendar(chronological, latestDate),
    summary: {
      stockPnlUsd: toNumber(latest.cumulativePnlUsd),
      best: gainRows[0] || null,
      worst: lossRows[0] || null,
    },
    rankings: {
      gain: gainRows,
      loss: lossRows,
    },
  };
}
