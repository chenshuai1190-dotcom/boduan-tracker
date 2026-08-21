const DAY_MS = 86_400_000;
const REALTIME_QUOTE_FRESH_MS = 5 * 60_000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function dateMs(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function swingWaveInclusiveDays(startDate, endDate) {
  const start = dateMs(startDate);
  const end = dateMs(endDate);
  if (start == null || end == null || end < start) return null;
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

export function swingWaveCompletedDays(startDate, endDate) {
  const start = dateMs(startDate);
  const end = dateMs(endDate);
  if (start == null || end == null || end < start) return null;
  return Math.max(1, Math.round((end - start) / DAY_MS));
}

export function calculateSwingWaveForecast({
  buyPriceUsd,
  currentPriceUsd,
  shares,
  targetPriceUsd,
} = {}) {
  const buyPrice = positiveNumber(buyPriceUsd);
  const currentPrice = positiveNumber(currentPriceUsd);
  const shareCount = positiveNumber(shares);
  const targetPrice = positiveNumber(targetPriceUsd);
  const hasHolding = buyPrice != null && shareCount != null;
  const currentPnlUsd = hasHolding && currentPrice != null
    ? (currentPrice - buyPrice) * shareCount
    : null;
  const forecastPnlUsd = hasHolding && targetPrice != null
    ? (targetPrice - buyPrice) * shareCount
    : null;
  const rawProgress = currentPrice != null && targetPrice != null && targetPrice !== buyPrice
    ? Math.abs((currentPrice - buyPrice) / (targetPrice - buyPrice))
    : 0;

  return {
    currentPnlUsd,
    currentReturnPct: currentPnlUsd == null ? null : (currentPrice - buyPrice) / buyPrice,
    forecastPnlUsd,
    forecastReturnPct: forecastPnlUsd == null ? null : (targetPrice - buyPrice) / buyPrice,
    progressPct: Math.max(0, Math.min(1, rawProgress)),
    targetPriceUsd: targetPrice,
  };
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeTimestampMs(value) {
  if (typeof value === 'string' && value.trim() && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const number = finiteNumber(value);
  if (number == null || number <= 0) return 0;
  return number < 1_000_000_000_000 ? Math.round(number * 1000) : Math.round(number);
}

function quoteFreshness(row = {}) {
  return Math.max(
    normalizeTimestampMs(row?.clientReceivedAt),
    normalizeTimestampMs(row?.receivedAt),
    normalizeTimestampMs(row?.realtimeAt),
    normalizeTimestampMs(row?.waveFetchedAt),
    normalizeTimestampMs(row?.timestamp),
  );
}

function isRealtimeQuote(row = {}) {
  return Boolean(row?.realtime || row?.realtimeStatus === 'live' || /_WS(?:_|$)/.test(String(row?.source || '')));
}

function isFreshRealtimeQuote(row = {}, now = Date.now()) {
  if (!isRealtimeQuote(row)) return false;
  const receivedAt = normalizeTimestampMs(row?.clientReceivedAt)
    || normalizeTimestampMs(row?.receivedAt)
    || normalizeTimestampMs(row?.realtimeAt);
  return Boolean(
    receivedAt
    && now - receivedAt <= REALTIME_QUOTE_FRESH_MS
    && receivedAt - now < 60_000
  );
}

export function mergeSwingWaveQuoteRows(baseRows = [], incomingRows = []) {
  const bySymbol = new Map();
  for (const row of [...(baseRows || []), ...(incomingRows || [])]) {
    const symbol = normalizeSymbol(row?.symbol);
    const price = positiveNumber(row?.price);
    if (!symbol || price == null) continue;
    const normalized = { ...row, symbol, price };
    const existing = bySymbol.get(symbol);
    if (!existing) {
      bySymbol.set(symbol, normalized);
      continue;
    }

    const existingAt = quoteFreshness(existing);
    const incomingAt = quoteFreshness(normalized);
    const keepExistingRealtime = isFreshRealtimeQuote(existing) && !isRealtimeQuote(normalized);
    const preferIncomingRealtime = isFreshRealtimeQuote(normalized) && !isRealtimeQuote(existing);
    const preferIncoming = preferIncomingRealtime
      || (!keepExistingRealtime && incomingAt >= existingAt);
    const preferred = preferIncoming ? normalized : existing;
    const fallback = preferIncoming ? existing : normalized;
    bySymbol.set(symbol, { ...fallback, ...preferred, symbol, price: preferred.price });
  }
  return Array.from(bySymbol.values());
}

function buildQuoteMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const symbol = normalizeSymbol(row?.symbol);
    const price = positiveNumber(row?.price);
    if (!symbol || price == null) continue;
    map.set(symbol, { ...row, symbol, price });
  }
  return map;
}

function compareStableWaves(left, right) {
  return String(left?.buyDate || '').localeCompare(String(right?.buyDate || ''))
    || String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''))
    || String(left?.id || '').localeCompare(String(right?.id || ''));
}

function compareStableExits(left, right) {
  return String(left?.sellDate || '').localeCompare(String(right?.sellDate || ''))
    || String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''))
    || String(left?.id || '').localeCompare(String(right?.id || ''))
    || (left?.sourceIndex || 0) - (right?.sourceIndex || 0);
}

function projectLegacySwingWave(wave) {
  const recordId = wave.id;
  const originalShares = positiveNumber(wave?.shares) || 0;
  const completed = wave?.status === 'completed';
  const id = completed ? `legacy:${recordId}` : recordId;

  return [{
    ...wave,
    id,
    segmentId: id,
    recordId,
    exitId: null,
    exitSequence: completed ? 1 : null,
    legacyExit: completed,
    originalShares,
    parentShares: originalShares,
    remainingShares: completed ? 0 : originalShares,
    soldShares: completed ? originalShares : 0,
    status: completed ? 'completed' : 'active',
    shares: originalShares,
  }];
}

/**
 * Project one persisted swing-wave record into independently valued display
 * segments. The parent remains one numbered wave while each sell is an
 * independently selectable completed segment and any unsold quantity remains
 * one active segment.
 */
export function projectSwingWaveSegments(wave) {
  if (!wave?.id) return [];
  if (!Array.isArray(wave.exits)) return projectLegacySwingWave(wave);

  const recordId = wave.id;
  const originalShares = positiveNumber(wave?.shares) || 0;
  const orderedExits = wave.exits
    .map((exit, sourceIndex) => ({ ...exit, sourceIndex }))
    .sort(compareStableExits);
  const exitShares = orderedExits.reduce((sum, exit) => (
    sum + (positiveNumber(exit?.shares) || 0)
  ), 0);
  const soldShares = nonNegativeNumber(wave?.soldShares) ?? exitShares;
  const remainingShares = nonNegativeNumber(wave?.remainingShares)
    ?? Math.max(0, originalShares - soldShares);
  const common = {
    ...wave,
    recordId,
    originalShares,
    parentShares: originalShares,
    remainingShares,
    soldShares,
  };
  delete common.exits;

  const segments = [];
  if (remainingShares > 0) {
    segments.push({
      ...common,
      id: recordId,
      segmentId: recordId,
      exitId: null,
      exitSequence: null,
      legacyExit: false,
      status: 'active',
      shares: remainingShares,
      sellDate: null,
      sellPriceUsd: null,
    });
  }

  orderedExits.forEach((exit, index) => {
    const exitId = exit?.id || null;
    const segmentId = exitId || `${recordId}:exit:${index + 1}`;
    segments.push({
      ...common,
      id: segmentId,
      segmentId,
      exitId,
      exitSequence: index + 1,
      legacyExit: exit?.legacy === true,
      exitCreatedAt: exit?.createdAt || null,
      exitUpdatedAt: exit?.updatedAt || null,
      status: 'completed',
      shares: positiveNumber(exit?.shares) || 0,
      sellDate: exit?.sellDate || null,
      sellPriceUsd: positiveNumber(exit?.sellPriceUsd),
    });
  });

  return segments;
}

function enrichWave(wave, quote, todayKey) {
  const status = wave?.status === 'completed' ? 'completed' : 'active';
  const buyPriceUsd = positiveNumber(wave?.buyPriceUsd) || 0;
  const shares = positiveNumber(wave?.shares) || 0;
  const currentPriceUsd = status === 'active' ? positiveNumber(quote?.price) : null;
  const sellPriceUsd = status === 'completed' ? positiveNumber(wave?.sellPriceUsd) : null;
  const exitPriceUsd = status === 'active' ? currentPriceUsd : sellPriceUsd;
  const hasValuation = buyPriceUsd > 0 && shares > 0 && exitPriceUsd != null;
  const pnlUsd = hasValuation ? (exitPriceUsd - buyPriceUsd) * shares : null;
  const returnPct = hasValuation ? (exitPriceUsd - buyPriceUsd) / buyPriceUsd : null;
  const endDate = status === 'completed' ? wave?.sellDate : todayKey;

  return {
    ...wave,
    status,
    buyPriceUsd,
    shares,
    sellPriceUsd,
    currentPriceUsd,
    exitPriceUsd,
    pnlUsd,
    returnPct,
    heldDays: status === 'completed'
      ? swingWaveCompletedDays(wave?.buyDate, endDate)
      : swingWaveInclusiveDays(wave?.buyDate, endDate),
  };
}

export function summarizeSwingWaveGroup(group, filter = 'all', todayKey = '') {
  const visibleWaves = filter === 'active'
    ? group.waves.filter((wave) => wave.status === 'active')
    : filter === 'completed'
      ? group.waves.filter((wave) => wave.status === 'completed')
      : group.waves;
  const activeWaves = visibleWaves.filter((wave) => wave.status === 'active');
  const positionWaves = activeWaves.length > 0 ? activeWaves : visibleWaves;
  const shares = positionWaves.reduce((sum, wave) => sum + (positiveNumber(wave.shares) || 0), 0);
  const positionCostUsd = positionWaves.reduce((sum, wave) => (
    sum + (positiveNumber(wave.buyPriceUsd) || 0) * (positiveNumber(wave.shares) || 0)
  ), 0);
  const performanceCostUsd = visibleWaves.reduce((sum, wave) => (
    sum + (positiveNumber(wave.buyPriceUsd) || 0) * (positiveNumber(wave.shares) || 0)
  ), 0);
  const weightedExitUsd = positionWaves.reduce((sum, wave) => (
    sum + (positiveNumber(wave.exitPriceUsd) || 0) * (positiveNumber(wave.shares) || 0)
  ), 0);
  const positionFullyValued = positionWaves.length > 0 && positionWaves.every((wave) => finiteNumber(wave.pnlUsd) != null);
  const positionPnlUsd = positionFullyValued
    ? positionWaves.reduce((sum, wave) => sum + Number(wave.pnlUsd), 0)
    : null;
  const performanceFullyValued = visibleWaves.length > 0 && visibleWaves.every((wave) => finiteNumber(wave.pnlUsd) != null);
  const performancePnlUsd = performanceFullyValued
    ? visibleWaves.reduce((sum, wave) => sum + Number(wave.pnlUsd), 0)
    : null;
  const firstDate = positionWaves.reduce((earliest, wave) => (
    !earliest || String(wave.buyDate) < earliest ? String(wave.buyDate || '') : earliest
  ), '');
  const completedEndDate = positionWaves.reduce((latest, wave) => (
    String(wave.sellDate || '') > latest ? String(wave.sellDate || '') : latest
  ), '');
  const status = activeWaves.length > 0 ? 'active' : 'completed';
  const endDate = status === 'active' ? todayKey : completedEndDate;

  return {
    activeCount: activeWaves.length,
    averageBuyPriceUsd: shares > 0 ? positionCostUsd / shares : null,
    endDate,
    firstDate,
    heldDays: status === 'completed'
      ? swingWaveCompletedDays(firstDate, endDate)
      : swingWaveInclusiveDays(firstDate, endDate),
    performanceCostUsd,
    performancePnlUsd,
    performanceReturnPct: performancePnlUsd != null && performanceCostUsd > 0
      ? performancePnlUsd / performanceCostUsd
      : null,
    positionCostUsd,
    positionPnlUsd,
    positionReturnPct: positionPnlUsd != null && positionCostUsd > 0
      ? positionPnlUsd / positionCostUsd
      : null,
    referencePriceUsd: status === 'active'
      ? positiveNumber(group.currentPriceUsd)
      : (shares > 0 ? weightedExitUsd / shares : null),
    shares,
    status,
    visibleWaves,
  };
}

export function buildSwingWaveDashboard(waves = [], quoteRows = [], { todayKey = '' } = {}) {
  const quotes = buildQuoteMap(quoteRows);
  const grouped = new Map();

  for (const rawWave of waves || []) {
    const symbol = normalizeSymbol(rawWave?.symbol);
    if (!symbol || !rawWave?.id) continue;
    const group = grouped.get(symbol) || {
      symbol,
      name: rawWave?.name || symbol,
      waves: [],
    };
    if ((!group.name || group.name === symbol) && rawWave?.name) group.name = rawWave.name;
    group.waves.push(rawWave);
    grouped.set(symbol, group);
  }

  const groups = Array.from(grouped.values()).map((group) => {
    const quote = quotes.get(group.symbol) || null;
    const wavesForGroup = [...group.waves]
      .sort(compareStableWaves)
      .flatMap((wave, index) => projectSwingWaveSegments(wave).map((segment) => ({
        ...enrichWave(segment, quote, todayKey),
        sequence: index + 1,
      })));
    return {
      ...group,
      currentPriceUsd: positiveNumber(quote?.price),
      quote,
      waves: wavesForGroup,
      activeCount: wavesForGroup.filter((wave) => wave.status === 'active').length,
      completedCount: wavesForGroup.filter((wave) => wave.status === 'completed').length,
      latestBuyDate: wavesForGroup.reduce((latest, wave) => (
        String(wave.buyDate || '') > latest ? String(wave.buyDate || '') : latest
      ), ''),
    };
  }).sort((left, right) => (
    String(right.latestBuyDate).localeCompare(String(left.latestBuyDate))
    || left.symbol.localeCompare(right.symbol)
  ));

  const allWaves = groups.flatMap((group) => group.waves);
  const fullyValued = allWaves.length > 0 && allWaves.every((wave) => finiteNumber(wave.pnlUsd) != null);

  return {
    activeStockCount: groups.filter((group) => group.activeCount > 0).length,
    activeWaveCount: allWaves.filter((wave) => wave.status === 'active').length,
    completedWaveCount: allWaves.filter((wave) => wave.status === 'completed').length,
    cumulativePnlUsd: fullyValued
      ? allWaves.reduce((sum, wave) => sum + Number(wave.pnlUsd), 0)
      : null,
    groups,
    totalWaveCount: allWaves.length,
  };
}
