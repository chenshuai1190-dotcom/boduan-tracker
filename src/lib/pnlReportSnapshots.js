export const PNL_REPORT_SNAPSHOT_VERSION = 'pnl_snapshot_v2';

const EPSILON = 0.0000001;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

export function normalizePnlMarginDebtUsd(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function unknownCashSnapshot() {
  return {
    cashUsd: 0,
    cashEventId: null,
    cashEffectiveAt: null,
    cashBasis: null,
    cashKnown: false,
  };
}

function normalizeCashSnapshot({
  cashUsd,
  cashEventId,
  cashEffectiveAt,
  cashBasis,
} = {}) {
  if (
    cashUsd === null
    || cashUsd === undefined
    || (typeof cashUsd === 'string' && cashUsd.trim() === '')
  ) {
    return unknownCashSnapshot();
  }
  const amount = Number(cashUsd);
  const eventId = String(cashEventId ?? '');
  const effectiveAt = String(cashEffectiveAt ?? '');
  if (
    !Number.isFinite(amount)
    || amount < 0
    || cashBasis !== 'event'
    || !/^[1-9]\d*$/.test(eventId)
    || !effectiveAt
    || !Number.isFinite(Date.parse(effectiveAt))
  ) {
    return unknownCashSnapshot();
  }
  return {
    cashUsd: amount,
    cashEventId: eventId,
    cashEffectiveAt: effectiveAt,
    cashBasis: 'event',
    cashKnown: true,
  };
}

function cashSnapshotForDate(cashByDate, snapshotDate) {
  let raw = null;
  if (cashByDate instanceof Map) {
    raw = cashByDate.get(snapshotDate);
  } else if (typeof cashByDate === 'function') {
    raw = cashByDate(snapshotDate);
  } else if (hasOwn(cashByDate, snapshotDate)) {
    raw = cashByDate[snapshotDate];
  }
  if (!raw || typeof raw !== 'object') return unknownCashSnapshot();
  return normalizeCashSnapshot({
    cashUsd: raw.cashUsd ?? raw.cash_usd,
    cashEventId: raw.cashEventId ?? raw.cash_event_id,
    cashEffectiveAt: raw.cashEffectiveAt ?? raw.cash_effective_at,
    cashBasis: raw.cashBasis ?? raw.cash_basis,
  });
}

function marginDebtSnapshotForDate(marginDebtByDate, snapshotDate) {
  let raw = null;
  if (marginDebtByDate instanceof Map) {
    raw = marginDebtByDate.get(snapshotDate);
  } else if (typeof marginDebtByDate === 'function') {
    raw = marginDebtByDate(snapshotDate);
  } else if (hasOwn(marginDebtByDate, snapshotDate)) {
    raw = marginDebtByDate[snapshotDate];
  }
  const source = raw && typeof raw === 'object' ? raw : { marginDebtUsd: raw };
  const marginDebtUsd = normalizePnlMarginDebtUsd(
    source.marginDebtUsd ?? source.margin_debt_usd
  );
  return {
    marginDebtUsd,
    marginDebtEventId: marginDebtUsd == null
      ? null
      : (source.marginDebtEventId ?? source.margin_debt_event_id ?? source.id ?? null),
    marginDebtEffectiveAt: marginDebtUsd == null
      ? null
      : (source.marginDebtEffectiveAt ?? source.margin_debt_effective_at ?? source.effectiveAt ?? source.effective_at ?? null),
    marginDebtBasis: marginDebtUsd == null
      ? null
      : (source.marginDebtBasis ?? source.margin_debt_basis ?? source.basis ?? null),
  };
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeHistoricalCloseRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = dateKeyOrNull(row?.date || row?.snapshotDate);
      const adjustedClose = toNumber(row?.adjustedClose ?? row?.adjusted_close);
      const rawClose = toNumber(row?.close);
      const close = adjustedClose > 0 ? adjustedClose : rawClose;
      return date && close > 0 ? { date, close } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeReportDate(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dateKeyOrNull(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getNewYorkDateParts(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now instanceof Date ? now : new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    return {
      dateKey: year && month && day ? `${year}-${month}-${day}` : normalizeReportDate(now),
      weekday: getPart('weekday'),
      minutes: Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0,
    };
  } catch {
    return { dateKey: normalizeReportDate(now), weekday: '', minutes: 0 };
  }
}

export function currentNewYorkDate(now = new Date()) {
  return getNewYorkDateParts(now).dateKey;
}

export function isNewYorkSnapshotWindowOpen(now = new Date()) {
  const parts = getNewYorkDateParts(now);
  return Boolean(parts.weekday) && parts.minutes >= 17 * 60;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return normalizeReportDate();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOfDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return -1;
  return date.getUTCDay();
}

function previousBusinessDate(dateKey) {
  let cursor = shiftDate(dateKey, -1);
  while ([0, 6].includes(weekdayOfDateKey(cursor))) {
    cursor = shiftDate(cursor, -1);
  }
  return cursor;
}

export function latestCompletedUsTradingDate(now = new Date()) {
  const parts = getNewYorkDateParts(now);
  if (parts.weekday === 'Sat') return previousBusinessDate(parts.dateKey);
  if (parts.weekday === 'Sun') return previousBusinessDate(parts.dateKey);
  return parts.minutes >= 16 * 60 ? parts.dateKey : previousBusinessDate(parts.dateKey);
}

export function resolveScheduledUsSnapshotDate(now = new Date()) {
  const parts = getNewYorkDateParts(now);
  if (parts.weekday === 'Sat') return previousBusinessDate(parts.dateKey);
  if (parts.weekday === 'Sun') return previousBusinessDate(parts.dateKey);
  if (!isNewYorkSnapshotWindowOpen(now)) return null;
  return parts.dateKey;
}

function latestDateKey(values = []) {
  return values
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()
    .at(-1) || null;
}

export function resolvePnlReportSnapshotDate(quoteRows = [], now = new Date()) {
  const rows = Array.isArray(quoteRows) ? quoteRows : [];
  const lockedDate = latestDateKey(rows
    .filter((quote) => Boolean(quote?.dailyPnlLocked) && toNumber(quote?.dailyPnlPrice) > 0)
    .map((quote) => dateKeyOrNull(quote?.dailyPnlPriceDate)));
  if (lockedDate) return lockedDate;

  const baselineDate = latestDateKey(rows
    .filter((quote) => toNumber(quote?.dailyPnlBaselineClose) > 0 || toNumber(quote?.dailyBaselineClose) > 0)
    .map((quote) => dateKeyOrNull(quote?.dailyPnlBaselineDate || quote?.dailyBaselineDate)));
  return baselineDate || latestCompletedUsTradingDate(now);
}

function projectQuoteForReportSnapshot(quote, snapshotDate) {
  const lockedDate = dateKeyOrNull(quote?.dailyPnlPriceDate);
  const lockedPrice = toNumber(quote?.dailyPnlPrice);
  const lockedBaselineClose = toNumber(quote?.dailyPnlBaselineClose || quote?.dailyBaselineClose || quote?.previousClose);
  if (quote?.dailyPnlLocked && lockedPrice > 0 && lockedDate && lockedDate <= snapshotDate) {
    return {
      ...quote,
      price: lockedPrice,
      previousClose: lockedBaselineClose > 0 ? lockedBaselineClose : 0,
      dailyPnlPrice: lockedPrice,
      dailyPnlBaselineClose: lockedBaselineClose > 0 ? lockedBaselineClose : 0,
    };
  }

  const closePrice = toNumber(quote?.dailyPnlBaselineClose)
    || toNumber(quote?.dailyBaselineClose)
    || toNumber(quote?.previousClose)
    || 0;
  if (closePrice > 0) {
    return {
      ...quote,
      price: closePrice,
      previousClose: 0,
      change: 0,
      changePercent: 0,
      dailyPnlPrice: 0,
      dailyPnlBaselineClose: 0,
      dailyBaselineClose: 0,
    };
  }

  return quote;
}

export function buildPnlReportCloseSnapshotInput({
  quoteRows = [],
  snapshotDate = null,
  now = new Date(),
} = {}) {
  const date = snapshotDate ? normalizeReportDate(snapshotDate) : resolvePnlReportSnapshotDate(quoteRows, now);
  return {
    snapshotDate: date,
    quoteRows: (Array.isArray(quoteRows) ? quoteRows : []).map((quote) => projectQuoteForReportSnapshot(quote, date)),
  };
}

function readTradeDate(trade) {
  return String(trade?.trade_date || trade?.tradeDate || trade?.date || '').slice(0, 10);
}

function isTradeOnOrBefore(trade, snapshotDate) {
  const date = readTradeDate(trade);
  return Boolean(date && date <= snapshotDate);
}

function sortTradesAsc(a, b) {
  const dateCompare = readTradeDate(a).localeCompare(readTradeDate(b));
  if (dateCompare !== 0) return dateCompare;
  const createdCompare = String(a?.created_at || a?.createdAt || '').localeCompare(String(b?.created_at || b?.createdAt || ''));
  if (createdCompare !== 0) return createdCompare;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function buildQuoteMap(quoteRows = []) {
  const map = new Map();
  quoteRows.forEach((quote) => {
    const symbol = normalizeSymbol(quote?.symbol);
    if (symbol) map.set(symbol, quote);
  });
  return map;
}

function buildQuoteMetaMap(quoteRows = [], stockTrades = []) {
  const map = new Map();
  (Array.isArray(quoteRows) ? quoteRows : []).forEach((quote) => {
    const symbol = normalizeSymbol(quote?.symbol);
    if (!symbol) return;
    map.set(symbol, { symbol, name: quote?.name || symbol });
  });
  (Array.isArray(stockTrades) ? stockTrades : []).forEach((trade) => {
    const symbol = normalizeSymbol(trade?.symbol);
    if (!symbol) return;
    const current = map.get(symbol);
    if (!current || current.name === symbol) {
      map.set(symbol, { symbol, name: trade?.name || symbol });
    }
  });
  return map;
}

function exactCloseOnDate(rows, date) {
  return rows.find((row) => row.date === date) || null;
}

function previousCloseBeforeDate(rows, date) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date < date) return rows[index];
  }
  return null;
}

function normalizeHistoricalCloseMap(historicalClosesBySymbol = {}) {
  const entries = historicalClosesBySymbol instanceof Map
    ? [...historicalClosesBySymbol.entries()]
    : Object.entries(historicalClosesBySymbol || {});
  const map = new Map();
  entries.forEach(([symbol, rows]) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol) return;
    map.set(normalizedSymbol, normalizeHistoricalCloseRows(rows));
  });
  return map;
}

function uniqueTradeSymbols(stockTrades = []) {
  return [...new Set((Array.isArray(stockTrades) ? stockTrades : [])
    .map((trade) => normalizeSymbol(trade?.symbol))
    .filter(Boolean))].sort();
}

function buildCurrentPositionBackfillTrades(stockTrades = [], effectiveDate, asOfDate = null) {
  const positions = new Map();
  const sellSymbols = new Set();
  const scopedTrades = (Array.isArray(stockTrades) ? stockTrades : [])
    .filter((trade) => !asOfDate || isTradeOnOrBefore(trade, asOfDate))
    .sort(sortTradesAsc);

  scopedTrades.forEach((trade) => {
    const symbol = normalizeSymbol(trade?.symbol);
    if (symbol && trade?.side === 'sell') sellSymbols.add(symbol);
  });

  scopedTrades.forEach((trade) => {
    const symbol = normalizeSymbol(trade?.symbol);
    const shares = toNumber(trade?.shares);
    const price = toNumber(trade?.price);
    if (!symbol || shares <= 0 || price <= 0) return;
    if (!positions.has(symbol)) {
      positions.set(symbol, {
        symbol,
        name: trade?.name || symbol,
        heldShares: 0,
        remainingCostUsd: 0,
      });
    }
    const position = positions.get(symbol);
    if (trade?.name && (!position.name || position.name === symbol)) position.name = trade.name;

    if (trade?.side === 'sell') {
      if (position.heldShares <= EPSILON) return;
      const closedShares = Math.min(shares, position.heldShares);
      const avgCost = position.heldShares > EPSILON ? position.remainingCostUsd / position.heldShares : 0;
      position.remainingCostUsd -= closedShares * avgCost;
      position.heldShares -= closedShares;
      if (position.heldShares <= EPSILON) {
        position.heldShares = 0;
        position.remainingCostUsd = 0;
      }
      return;
    }

    position.heldShares += shares;
    position.remainingCostUsd += shares * price;
  });

  const syntheticOpenPositionTrades = [...positions.values()]
    .filter((position) => position.heldShares > EPSILON && position.remainingCostUsd > EPSILON)
    .filter((position) => !sellSymbols.has(position.symbol))
    .map((position) => ({
      id: `pnl-backfill-current-${position.symbol}`,
      symbol: position.symbol,
      name: position.name || position.symbol,
      side: 'buy',
      date: effectiveDate,
      price: position.remainingCostUsd / position.heldShares,
      shares: position.heldShares,
    }));

  const ledgerTradesForSoldSymbols = scopedTrades.filter((trade) => sellSymbols.has(normalizeSymbol(trade?.symbol)));
  return [...ledgerTradesForSoldSymbols, ...syntheticOpenPositionTrades];
}

function inferPreviousClose(quote, currentPrice) {
  const dailyPnlBaselineClose = toNumber(quote?.dailyPnlBaselineClose);
  if (dailyPnlBaselineClose > 0) return dailyPnlBaselineClose;
  const dailyBaselineClose = toNumber(quote?.dailyBaselineClose);
  if (dailyBaselineClose > 0) return dailyBaselineClose;
  const explicitPreviousClose = toNumber(quote?.previousClose);
  if (explicitPreviousClose > 0) return explicitPreviousClose;
  const change = toNumber(quote?.change);
  if (change !== 0 && currentPrice - change > 0) return currentPrice - change;
  const changePercent = toNumber(quote?.changePercent);
  if (changePercent !== 0 && changePercent > -100) return currentPrice / (1 + changePercent / 100);
  return 0;
}

function inferDailyPnlPrice(quote, currentPrice) {
  if (hasOwn(quote, 'dailyPnlPrice')) {
    const dailyPnlPrice = toNumber(quote?.dailyPnlPrice);
    return dailyPnlPrice > 0 ? dailyPnlPrice : 0;
  }
  return currentPrice;
}

function roundTiny(value) {
  return Math.abs(value) <= EPSILON ? 0 : value;
}

function groupTrades(stockTrades, quoteMap, snapshotDate) {
  const groups = new Map();
  stockTrades
    .filter((trade) => isTradeOnOrBefore(trade, snapshotDate))
    .forEach((trade) => {
      const symbol = normalizeSymbol(trade?.symbol);
      if (!symbol) return;
      if (!groups.has(symbol)) {
        const quote = quoteMap.get(symbol);
        groups.set(symbol, {
          symbol,
          name: trade?.name || quote?.name || symbol,
          trades: [],
        });
      }
      const group = groups.get(symbol);
      if (trade?.name && (!group.name || group.name === symbol)) group.name = trade.name;
      group.trades.push(trade);
    });
  return groups;
}

function buildSymbolSnapshot(group, quote, snapshotDate) {
  let heldShares = 0;
  let remainingCostUsd = 0;
  let realizedPnlUsd = 0;
  let totalBuyCostUsd = 0;
  let sellProceedsUsd = 0;
  let soldCostUsd = 0;
  let totalBuyShares = 0;
  let totalSellShares = 0;

  [...group.trades].sort(sortTradesAsc).forEach((trade) => {
    const shares = toNumber(trade?.shares);
    const price = toNumber(trade?.price);
    if (shares <= 0 || price <= 0) return;

    if (trade?.side === 'sell') {
      if (heldShares <= EPSILON) return;
      const closedShares = Math.min(shares, heldShares);
      const avgCost = heldShares > EPSILON ? remainingCostUsd / heldShares : 0;
      const closeCost = closedShares * avgCost;
      const closeProceeds = closedShares * price;
      totalSellShares += closedShares;
      sellProceedsUsd += closeProceeds;
      soldCostUsd += closeCost;
      realizedPnlUsd += closeProceeds - closeCost;
      remainingCostUsd -= closeCost;
      heldShares -= closedShares;
      if (heldShares <= EPSILON) {
        heldShares = 0;
        remainingCostUsd = 0;
      }
      return;
    }

    heldShares += shares;
    remainingCostUsd += shares * price;
    totalBuyShares += shares;
    totalBuyCostUsd += shares * price;
  });

  const currentPriceUsd = toNumber(quote?.price);
  const previousCloseUsd = inferPreviousClose(quote, currentPriceUsd);
  const dailyPnlPriceUsd = inferDailyPnlPrice(quote, currentPriceUsd);
  const isOpen = heldShares > EPSILON;
  const avgCostUsd = isOpen ? remainingCostUsd / heldShares : 0;
  const marketValueUsd = isOpen ? heldShares * currentPriceUsd : 0;
  const unrealizedPnlUsd = isOpen ? marketValueUsd - remainingCostUsd : 0;
  const cumulativePnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const canComputeDailyPnl = isOpen && previousCloseUsd > 0 && dailyPnlPriceUsd > 0;
  const dailyPnlUsd = canComputeDailyPnl ? heldShares * (dailyPnlPriceUsd - previousCloseUsd) : null;
  const previousMarketValueUsd = canComputeDailyPnl ? heldShares * previousCloseUsd : 0;

  return {
    snapshotDate,
    symbol: group.symbol,
    name: group.name || quote?.name || group.symbol,
    currency: 'USD',
    heldShares: roundTiny(heldShares),
    avgCostUsd,
    remainingCostUsd: roundTiny(remainingCostUsd),
    currentPriceUsd,
    previousCloseUsd,
    marketValueUsd,
    previousMarketValueUsd,
    realizedPnlUsd: roundTiny(realizedPnlUsd),
    unrealizedPnlUsd: roundTiny(unrealizedPnlUsd),
    cumulativePnlUsd: roundTiny(cumulativePnlUsd),
    dailyPnlUsd: dailyPnlUsd == null ? null : roundTiny(dailyPnlUsd),
    dailyPnlPct: canComputeDailyPnl ? (dailyPnlPriceUsd - previousCloseUsd) / previousCloseUsd : null,
    totalBuyCostUsd: roundTiny(totalBuyCostUsd),
    sellProceedsUsd: roundTiny(sellProceedsUsd),
    soldCostUsd: roundTiny(soldCostUsd),
    totalBuyShares: roundTiny(totalBuyShares),
    totalSellShares: roundTiny(totalSellShares),
    tradeCount: group.trades.length,
    isOpen,
    sourceVersion: PNL_REPORT_SNAPSHOT_VERSION,
  };
}

export function buildPnlReportSnapshots({
  stockTrades = [],
  quoteRows = [],
  snapshotDate = new Date(),
  cashUsd = 0,
  cashEventId = null,
  cashEffectiveAt = null,
  cashBasis = null,
  marginDebtUsd = null,
  marginDebtEventId = null,
  marginDebtEffectiveAt = null,
  marginDebtBasis = null,
  lockedAt = null,
} = {}) {
  const date = normalizeReportDate(snapshotDate);
  const quoteMap = buildQuoteMap(quoteRows);
  const groups = groupTrades(Array.isArray(stockTrades) ? stockTrades : [], quoteMap, date);
  const symbolSnapshots = Array.from(groups.values())
    .map((group) => buildSymbolSnapshot(group, quoteMap.get(group.symbol), date))
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || b.marketValueUsd - a.marketValueUsd || a.symbol.localeCompare(b.symbol));

  const openSnapshots = symbolSnapshots.filter((snapshot) => snapshot.isOpen);
  const marketValueUsd = openSnapshots.reduce((sum, snapshot) => sum + snapshot.marketValueUsd, 0);
  const realizedPnlUsd = symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.realizedPnlUsd, 0);
  const unrealizedPnlUsd = openSnapshots.reduce((sum, snapshot) => sum + snapshot.unrealizedPnlUsd, 0);
  const cumulativePnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const totalBuyCostUsd = symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.totalBuyCostUsd, 0);
  const sellProceedsUsd = symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.sellProceedsUsd, 0);
  const previousMarketValueUsd = openSnapshots.reduce((sum, snapshot) => sum + snapshot.previousMarketValueUsd, 0);
  const dailyPnlUnavailableCount = openSnapshots.reduce((sum, snapshot) => sum + (snapshot.dailyPnlUsd == null ? 1 : 0), 0);
  const dailyPnlUsd = dailyPnlUnavailableCount === 0
    ? openSnapshots.reduce((sum, snapshot) => sum + toNumber(snapshot.dailyPnlUsd), 0)
    : null;
  const returnCostBasisUsd = marketValueUsd - cumulativePnlUsd;
  const positiveCostBasisUsd = returnCostBasisUsd > EPSILON
    ? returnCostBasisUsd
    : openSnapshots.reduce((sum, snapshot) => sum + snapshot.remainingCostUsd, 0);
  const cashSnapshot = normalizeCashSnapshot({
    cashUsd,
    cashEventId,
    cashEffectiveAt,
    cashBasis,
  });
  const totalAssetsUsd = marketValueUsd + cashSnapshot.cashUsd;
  const normalizedMarginDebtUsd = normalizePnlMarginDebtUsd(marginDebtUsd);

  return {
    portfolioSnapshot: {
      snapshotDate: date,
      currency: 'USD',
      ...cashSnapshot,
      marketValueUsd,
      totalAssetsUsd,
      marginDebtUsd: normalizedMarginDebtUsd,
      marginDebtEventId: normalizedMarginDebtUsd == null ? null : marginDebtEventId,
      marginDebtEffectiveAt: normalizedMarginDebtUsd == null ? null : marginDebtEffectiveAt,
      marginDebtBasis: normalizedMarginDebtUsd == null ? null : marginDebtBasis,
      netAssetsUsd: normalizedMarginDebtUsd == null
        ? null
        : totalAssetsUsd - normalizedMarginDebtUsd,
      realizedPnlUsd: roundTiny(realizedPnlUsd),
      unrealizedPnlUsd: roundTiny(unrealizedPnlUsd),
      cumulativePnlUsd: roundTiny(cumulativePnlUsd),
      cumulativePnlPct: positiveCostBasisUsd > EPSILON ? cumulativePnlUsd / positiveCostBasisUsd : 0,
      dailyPnlUsd: dailyPnlUsd == null ? null : roundTiny(dailyPnlUsd),
      dailyPnlPct: dailyPnlUsd != null && previousMarketValueUsd > EPSILON ? dailyPnlUsd / previousMarketValueUsd : null,
      totalBuyCostUsd: roundTiny(totalBuyCostUsd),
      sellProceedsUsd: roundTiny(sellProceedsUsd),
      tradeCount: symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.tradeCount, 0),
      holdingCount: openSnapshots.length,
      sourceVersion: PNL_REPORT_SNAPSHOT_VERSION,
      lockedAt,
    },
    symbolSnapshots,
  };
}

export function buildPnlReportHistoricalSnapshots({
  stockTrades = [],
  historicalClosesBySymbol = {},
  quoteRows = [],
  snapshotDates = null,
  maxSnapshots = 7,
  toDate = null,
  cashByDate = null,
  marginDebtByDate = null,
  lockedAt = null,
  backfillMode = 'ledger',
} = {}) {
  const symbols = uniqueTradeSymbols(stockTrades);
  const closeMap = normalizeHistoricalCloseMap(historicalClosesBySymbol);
  const metaMap = buildQuoteMetaMap(quoteRows, stockTrades);
  const dateLimit = toDate ? normalizeReportDate(toDate) : null;
  const explicitDates = Array.isArray(snapshotDates)
    ? snapshotDates.map(dateKeyOrNull).filter(Boolean)
    : null;
  const targetDates = explicitDates || [...new Set(
    symbols.flatMap((symbol) => (closeMap.get(symbol) || [])
      .map((row) => row.date)
      .filter((date) => !dateLimit || date <= dateLimit))
  )]
    .sort()
    .slice(-Math.max(1, Number(maxSnapshots) || 7));
  const effectiveStockTrades = backfillMode === 'currentPositions'
    ? buildCurrentPositionBackfillTrades(
      stockTrades,
      targetDates[0] || dateLimit || normalizeReportDate(),
      dateLimit || targetDates.at(-1) || null
    )
    : stockTrades;

  const skippedDates = [];
  const snapshots = [];

  targetDates.forEach((date) => {
    const cashSnapshot = cashSnapshotForDate(cashByDate, date);
    const marginDebtSnapshot = marginDebtSnapshotForDate(marginDebtByDate, date);
    const historicalQuoteRows = symbols.map((symbol) => {
      const rows = closeMap.get(symbol) || [];
      const current = exactCloseOnDate(rows, date);
      const previous = previousCloseBeforeDate(rows, date);
      const meta = metaMap.get(symbol) || { symbol, name: symbol };
      return {
        symbol,
        name: meta.name || symbol,
        price: current?.close || 0,
        previousClose: previous?.close || 0,
        dailyPnlPrice: current?.close || 0,
        dailyPnlPriceDate: current?.date || null,
        dailyPnlBaselineClose: previous?.close || 0,
        dailyPnlBaselineDate: previous?.date || null,
        dailyPnlLocked: Boolean(current?.close && previous?.close),
      };
    });
    const built = buildPnlReportSnapshots({
      stockTrades: effectiveStockTrades,
      quoteRows: historicalQuoteRows,
      snapshotDate: date,
      ...cashSnapshot,
      ...marginDebtSnapshot,
      lockedAt,
    });
    const missingSymbols = built.symbolSnapshots
      .filter((snapshot) => snapshot.isOpen && !(toNumber(snapshot.currentPriceUsd) > 0))
      .map((snapshot) => snapshot.symbol);
    if (missingSymbols.length > 0) {
      skippedDates.push({ date, reason: 'missing_close', symbols: missingSymbols });
      return;
    }
    snapshots.push(built);
  });

  return { snapshots, skippedDates };
}
