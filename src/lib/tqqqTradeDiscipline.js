import { resolveHomeSignalBenchmarkPrice } from './homeSignalBenchmark.js';
import { deriveInvestmentSummary, derivePositionAllocation } from './investmentSummary.js';
import { normalizeStrictUserStockSymbol } from './symbols.js';

export const TQQQ_SYMBOL = 'TQQQ';
export const TQQQ_ALLOCATION_LIMIT = 0.10;
export const TQQQ_VIX_PANIC_THRESHOLD = 30;
export const TQQQ_VIX_EXTREME_THRESHOLD = 50;

const SHARE_EPSILON = 0.000001;

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sameTradeId(trade, editingId) {
  if (editingId === null || editingId === undefined || editingId === '') return false;
  return String(trade?.id ?? '') === String(editingId);
}

function findTqqqPosition(summary) {
  return (summary?.activePositions || []).find((position) => position?.symbol === TQQQ_SYMBOL) || null;
}

function findTqqqLedgerPosition(summary) {
  return (summary?.positions || []).find((position) => position?.symbol === TQQQ_SYMBOL) || null;
}

function ignoredTqqqSellShares(summary) {
  return Math.max(0, Number(findTqqqLedgerPosition(summary)?.ignoredSellShares) || 0);
}

function buildSummary({ stockTrades, quoteRows, cashUsd, usdRate }) {
  return deriveInvestmentSummary({
    stockTrades,
    watchlist: quoteRows,
    cashUsd,
    usdRate,
  });
}

function replaceOrAppendTrade(ledgerTrades, editingId, previewTrade) {
  if (!editingId) return [...ledgerTrades, previewTrade];
  return ledgerTrades.map((trade) => (sameTradeId(trade, editingId) ? previewTrade : trade));
}

function deriveSafeSellCapacity({
  ledgerTrades,
  editingId,
  previewTrade,
  baseSummary,
  allowedIgnoredShares,
  quoteRows,
  cashUsd,
  usdRate,
}) {
  const totalBuyShares = Math.floor(Math.max(0, Number(findTqqqLedgerPosition(baseSummary)?.totalBuyShares) || 0));
  let low = 0;
  let high = totalBuyShares;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidateTrade = { ...previewTrade, shares: middle, price: previewTrade.price || 1 };
    const candidateSummary = buildSummary({
      stockTrades: replaceOrAppendTrade(ledgerTrades, editingId, candidateTrade),
      quoteRows,
      cashUsd,
      usdRate,
    });
    if (ignoredTqqqSellShares(candidateSummary) <= allowedIgnoredShares + SHARE_EPSILON) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

export function isTqqqFormalTradeEntry({ symbol, scope } = {}) {
  return scope === 'ledger' && normalizeStrictUserStockSymbol(symbol) === TQQQ_SYMBOL;
}

export function deriveTqqqTradePreview({
  stockTrades = [],
  quoteRows = [],
  cashUsd = 0,
  usdRate = 7.2,
  currentSummary = null,
  draft = {},
  scope = 'ledger',
} = {}) {
  if (!isTqqqFormalTradeEntry({ symbol: draft?.symbol, scope })) {
    return { applies: false };
  }

  const ledgerTrades = Array.isArray(stockTrades) ? stockTrades : [];
  const marketRows = Array.isArray(quoteRows) ? quoteRows : [];
  const side = draft?.side === 'sell' ? 'sell' : 'buy';
  const price = toPositiveNumber(draft?.price) || 0;
  const requestedShares = toPositiveNumber(draft?.shares) || 0;
  const invalidShares = requestedShares > 0 && !Number.isInteger(requestedShares);
  const editingId = draft?.id || draft?.editingId || null;
  const baseTrades = editingId
    ? ledgerTrades.filter((trade) => !sameTradeId(trade, editingId))
    : ledgerTrades;
  const currentLedgerSummary = currentSummary || buildSummary({
    stockTrades: ledgerTrades,
    quoteRows: marketRows,
    cashUsd,
    usdRate,
  });
  const baseSummary = editingId
    ? buildSummary({ stockTrades: baseTrades, quoteRows: marketRows, cashUsd, usdRate })
    : currentLedgerSummary;
  const currentPosition = findTqqqPosition(currentLedgerSummary);
  const basePosition = findTqqqPosition(baseSummary);
  const currentAllocation = derivePositionAllocation(currentLedgerSummary, TQQQ_SYMBOL);
  const currentIgnoredShares = ignoredTqqqSellShares(currentLedgerSummary);
  const baseIgnoredShares = ignoredTqqqSellShares(baseSummary);
  const inputReady = price > 0 && requestedShares > 0;
  const previewTrade = {
    ...draft,
    id: editingId || '__tqqq_preview__',
    symbol: TQQQ_SYMBOL,
    side,
    price,
    shares: requestedShares,
  };
  const availableShares = side === 'sell'
    ? deriveSafeSellCapacity({
      ledgerTrades,
      editingId,
      previewTrade,
      baseSummary,
      allowedIgnoredShares: editingId ? baseIgnoredShares : currentIgnoredShares,
      quoteRows: marketRows,
      cashUsd,
      usdRate,
    })
    : Math.max(0, Number(basePosition?.heldShares) || 0);
  const previewTrades = inputReady && !invalidShares
    ? replaceOrAppendTrade(ledgerTrades, editingId, previewTrade)
    : ledgerTrades;
  const previewSummary = inputReady && !invalidShares
    ? buildSummary({ stockTrades: previewTrades, quoteRows: marketRows, cashUsd, usdRate })
    : currentLedgerSummary;
  const afterPosition = findTqqqPosition(previewSummary);
  const previewIgnoredShares = ignoredTqqqSellShares(previewSummary);
  const allowedIgnoredShares = side === 'sell' && editingId
    ? baseIgnoredShares
    : currentIgnoredShares;
  const oversold = side === 'sell'
    && inputReady
    && !invalidShares
    && previewIgnoredShares > allowedIgnoredShares + SHARE_EPSILON;
  const breaksLedger = side === 'buy'
    && inputReady
    && !invalidShares
    && previewIgnoredShares > allowedIgnoredShares + SHARE_EPSILON;
  const afterHeldShares = Math.max(0, Number(afterPosition?.heldShares) || 0);
  const remainingShares = afterHeldShares;
  const fullSell = side === 'sell' && inputReady && !invalidShares && !oversold && afterHeldShares <= SHARE_EPSILON;
  const previewValuationReady = fullSell || Boolean(
    afterPosition
    && Number(afterPosition.valuationPrice) > 0
    && Number(previewSummary.positionsMarketValue) > 0,
  );
  const afterAllocation = inputReady && previewValuationReady
    ? (fullSell ? 0 : derivePositionAllocation(previewSummary, TQQQ_SYMBOL))
    : null;
  const overLimit = side === 'buy'
    && inputReady
    && !invalidShares
    && Number.isFinite(afterAllocation)
    && afterAllocation > TQQQ_ALLOCATION_LIMIT + Number.EPSILON;
  const allocationUnavailable = side === 'buy' && inputReady && !invalidShares && !Number.isFinite(afterAllocation);
  // 10% and its valuation readiness are advisory only. Users may explicitly continue;
  // only invalid input or a ledger state that creates an oversell remains blocked.
  const hardBlocked = invalidShares || oversold || breaksLedger;
  const blockReason = invalidShares
    ? 'whole-shares-required'
    : (oversold
      ? 'oversell'
      : (breaksLedger
        ? 'ledger-oversell'
        : (overLimit ? 'allocation-limit' : (allocationUnavailable ? 'allocation-unavailable' : null))));
  const remainingAllocation = Number.isFinite(afterAllocation)
    ? Math.max(0, TQQQ_ALLOCATION_LIMIT - afterAllocation)
    : null;
  const currentBudgetUsage = Number.isFinite(currentAllocation)
    ? Math.max(0, currentAllocation / TQQQ_ALLOCATION_LIMIT)
    : null;
  const afterBudgetUsage = Number.isFinite(afterAllocation)
    ? Math.max(0, afterAllocation / TQQQ_ALLOCATION_LIMIT)
    : null;

  return {
    applies: true,
    side,
    inputReady,
    price,
    requestedShares,
    amountUsd: price * requestedShares,
    currentAllocation,
    afterAllocation,
    remainingAllocation,
    currentBudgetUsage,
    afterBudgetUsage,
    availableShares,
    remainingShares,
    currentHeldShares: Math.max(0, Number(currentPosition?.heldShares) || 0),
    afterHeldShares,
    currentIgnoredShares,
    previewIgnoredShares,
    previewValuationReady,
    overLimit,
    allocationUnavailable,
    oversold,
    breaksLedger,
    invalidShares,
    hardBlocked,
    blockReason,
  };
}

export function deriveTqqqMarketReference({ vix, vixDataDate, qqqQuote } = {}) {
  const vixValue = toPositiveNumber(vix);
  const normalizedVixDate = String(vixDataDate || '').trim();
  const vixReady = Boolean(vixValue && normalizedVixDate);
  const vixSignal = !vixReady
    ? 'unavailable'
    : (vixValue >= TQQQ_VIX_EXTREME_THRESHOLD
      ? 'extreme'
      : (vixValue >= TQQQ_VIX_PANIC_THRESHOLD ? 'panic' : 'none'));
  const qqqPrice = resolveHomeSignalBenchmarkPrice(qqqQuote || {});
  const qqqHigh = toPositiveNumber(qqqQuote?.week52High) || toPositiveNumber(qqqQuote?.high);
  const qqqReady = Boolean(qqqPrice && qqqHigh);

  return {
    vixReady,
    vixValue: vixReady ? vixValue : null,
    vixDataDate: vixReady ? normalizedVixDate : '',
    vixSignal,
    qqqReady,
    qqqPrice: qqqReady ? qqqPrice : null,
    qqqHigh: qqqReady ? qqqHigh : null,
    qqqDistanceFromHigh: qqqReady ? (qqqPrice - qqqHigh) / qqqHigh : null,
  };
}
