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

function readTradeDate(trade) {
  return String(trade?.trade_date || trade?.tradeDate || trade?.date || '').slice(0, 10);
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
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

function firstDate(values) {
  const sorted = values
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return sorted[0] || null;
}

function getFirstTradeDate(stockTrades = []) {
  return firstDate((Array.isArray(stockTrades) ? stockTrades : []).map(readTradeDate));
}

function getRangeStartDate(range, endDate, firstAvailableDate) {
  const fallback = firstAvailableDate || endDate;
  if (range === 'all') return fallback;
  const start = {
    month: `${String(endDate).slice(0, 7)}-01`,
    '1m': addMonths(endDate, -1),
    '6m': addMonths(endDate, -6),
    ytd: startOfYear(endDate),
    '1y': addDays(endDate, -365),
  }[range];
  return start || fallback;
}

export function getPnlReportRangeBounds({
  portfolioSnapshots = [],
  stockTrades = [],
  range = 'all',
  now = new Date(),
} = {}) {
  const snapshots = (Array.isArray(portfolioSnapshots) ? portfolioSnapshots : [])
    .filter((snapshot) => snapshot?.snapshotDate)
    .sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  const endDate = snapshots[snapshots.length - 1]?.snapshotDate || normalizeDate(now);
  const startDate = getRangeStartDate(
    range,
    endDate,
    firstDate([snapshots[0]?.snapshotDate, getFirstTradeDate(stockTrades)])
  );
  return { startDate, endDate };
}

function filterSnapshotsByBounds(snapshots, range, startDate) {
  if (range === 'all') return snapshots;
  return snapshots.filter((snapshot) => String(snapshot.snapshotDate) >= startDate);
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

function getPeriodBaseline(chronological, range, startDate, trendSource) {
  if (range === 'all') return null;
  const prior = chronological
    .filter((snapshot) => String(snapshot.snapshotDate) < startDate)
    .at(-1);
  return prior || trendSource[0] || null;
}

function computePeriodValues(latest, trendSource, baseline, range) {
  if (!latest) return { pnlUsd: 0, pnlPct: 0, baselinePct: 0 };
  const latestPnlUsd = toNumber(latest.cumulativePnlUsd);
  const latestPnlPct = toNumber(latest.cumulativePnlPct);
  if (range === 'all' || !baseline) {
    return { pnlUsd: latestPnlUsd, pnlPct: latestPnlPct, baselinePct: 0 };
  }

  if (String(baseline.snapshotDate) < String(latest.snapshotDate)) {
    const pnlUsd = latestPnlUsd - toNumber(baseline.cumulativePnlUsd);
    const pnlPct = latestPnlPct - toNumber(baseline.cumulativePnlPct);
    return {
      pnlUsd,
      pnlPct,
      baselinePct: toNumber(baseline.cumulativePnlPct),
    };
  }

  const dailyPnlUsd = trendSource.reduce((sum, snapshot) => {
    const value = snapshot.dailyPnlUsd == null ? 0 : toNumber(snapshot.dailyPnlUsd);
    return sum + value;
  }, 0);
  const startAssetsUsd = Math.max(toNumber(latest.totalAssetsUsd) - dailyPnlUsd, 1);
  return {
    pnlUsd: dailyPnlUsd,
    pnlPct: dailyPnlUsd / startAssetsUsd,
    baselinePct: latestPnlPct,
  };
}

function computeTradeStats(stockTrades, range, startDate, endDate, fallbackLatest, fallbackSymbolSnapshots) {
  const rows = Array.isArray(stockTrades) ? stockTrades : [];
  if (rows.length === 0) {
    return {
      turnoverUsd: toNumber(fallbackLatest?.totalBuyCostUsd) + toNumber(fallbackLatest?.sellProceedsUsd),
      tradeStockCount: new Set((Array.isArray(fallbackSymbolSnapshots) ? fallbackSymbolSnapshots : [])
        .map((row) => row.symbol)
        .filter(Boolean)).size,
    };
  }

  let turnoverUsd = 0;
  const symbols = new Set();
  rows.forEach((trade) => {
    const date = readTradeDate(trade);
    if (!date || date > endDate) return;
    if (range !== 'all' && date < startDate) return;
    const symbol = normalizeSymbol(trade?.symbol);
    const shares = Math.abs(toNumber(trade?.shares));
    const price = toNumber(trade?.price);
    if (!symbol || shares <= 0 || price <= 0) return;
    symbols.add(symbol);
    turnoverUsd += shares * price;
  });

  return {
    turnoverUsd,
    tradeStockCount: symbols.size,
  };
}

function normalizeBenchmarkRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = String(row?.date || row?.snapshotDate || '').slice(0, 10);
      const adjustedClose = toNumber(row?.adjustedClose ?? row?.adjusted_close);
      const close = adjustedClose > 0 ? adjustedClose : toNumber(row?.close);
      return date && close > 0 ? { date, close } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function findCloseOnOrAfter(rows, dateKey) {
  return rows.find((row) => row.date >= dateKey) || null;
}

function findCloseOnOrBefore(rows, dateKey) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= dateKey) return rows[index];
  }
  return null;
}

function buildBenchmarkContext(rows, startDate, endDate) {
  const normalized = normalizeBenchmarkRows(rows);
  const start = findCloseOnOrAfter(normalized, startDate);
  const end = findCloseOnOrBefore(normalized, endDate);
  if (!start?.close || !end?.close) {
    return {
      rows: normalized,
      start,
      end,
      returnPct: null,
    };
  }
  return {
    rows: normalized,
    start,
    end,
    returnPct: end.close / start.close - 1,
  };
}

export function buildPnlReportViewModel({
  portfolioSnapshots = [],
  symbolSnapshots = [],
  stockTrades = [],
  benchmarkRows = [],
  benchmarkSymbol = 'QQQ',
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
      benchmarkSymbol,
      benchmarkStartDate: normalizeDate(now),
      benchmarkEndDate: normalizeDate(now),
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
  const { startDate: rangeStartDate, endDate: rangeEndDate } = getPnlReportRangeBounds({
    portfolioSnapshots: chronological,
    stockTrades,
    range,
    now: latestDate,
  });
  const bounded = filterSnapshotsByBounds(chronological, range, rangeStartDate);
  const boundedTrendSource = bounded.length > 0 ? bounded : trendSource;
  const baseline = getPeriodBaseline(chronological, range, rangeStartDate, boundedTrendSource);
  const periodValues = computePeriodValues(latest, boundedTrendSource, baseline, range);
  const tradeStats = computeTradeStats(stockTrades, range, rangeStartDate, rangeEndDate, latest, symbolSnapshots);
  const benchmark = buildBenchmarkContext(benchmarkRows, rangeStartDate, rangeEndDate);
  const benchmarkStartClose = benchmark.start?.close || null;
  const trend = boundedTrendSource.map((snapshot) => {
    const benchmarkPoint = benchmarkStartClose
      ? findCloseOnOrBefore(benchmark.rows, snapshot.snapshotDate)
      : null;
    return {
      label: monthLabel(snapshot.snapshotDate),
      pnlPct: range === 'all'
        ? toNumber(snapshot.cumulativePnlPct)
        : toNumber(snapshot.cumulativePnlPct) - periodValues.baselinePct,
      benchmarkPct: benchmarkPoint?.close && benchmarkStartClose
        ? benchmarkPoint.close / benchmarkStartClose - 1
        : (isFiniteNumber(snapshot.benchmarkPct) ? toNumber(snapshot.benchmarkPct) : null),
      assetUsd: toNumber(snapshot.totalAssetsUsd),
    };
  });
  const outperformPct = benchmark.returnPct == null ? null : periodValues.pnlPct - benchmark.returnPct;

  return {
    hasData: true,
    startDate: displayDate((boundedTrendSource[0] || latest).snapshotDate),
    endDate: displayDate(latestDate),
    selectedMonth: monthLabel(latestDate),
    updatedAt: displayUpdatedAt(latest.updatedAt, latestDate),
    totalPnlUsd: periodValues.pnlUsd,
    totalPnlPct: periodValues.pnlPct,
    turnoverUsd: tradeStats.turnoverUsd,
    tradeStockCount: tradeStats.tradeStockCount,
    outperformPct,
    benchmarkSymbol,
    benchmarkStartDate: rangeStartDate,
    benchmarkEndDate: rangeEndDate,
    benchmarkReturnPct: benchmark.returnPct,
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
