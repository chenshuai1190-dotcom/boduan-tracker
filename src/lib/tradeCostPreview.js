import { deriveInvestmentSummary, derivePositionAllocation, derivePositionsFromTrades } from './investmentSummary.js';
import { normalizeStrictUserStockSymbol, normalizeUserStockSymbol } from './symbols.js';

const unavailable = () => ({ status: 'unavailable', cost: null, shares: null });
const sameId = (left, right) => String(left ?? '') === String(right ?? '');
const LEDGER_NUMERIC_FIELDS = ['heldShares', 'remainingCost', 'activeRealizedPnl', 'effectiveCost', 'ignoredSellShares',
  'realizedPnl', 'totalBuyCost', 'totalBuyShares', 'totalSellShares', 'sellProceeds', 'soldCost'];

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function positive(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validLedgerRow(row) {
  return row && ['buy', 'sell'].includes(row.side) && validDate(row.date)
    && positive(row.price) !== null && positive(row.shares) !== null
    && Number.isFinite(Number(row.price) * Number(row.shares))
    && (row.currency === undefined || row.currency === null || row.currency === '' || row.currency === 'USD');
}

function replay(trades, symbol) {
  const rows = trades.filter(row => normalizeUserStockSymbol(row?.symbol) === symbol);
  if (!rows.every(validLedgerRow)) return { state: unavailable(), reason: 'invalid-ledger' };
  if (!rows.length) return { state: { status: 'empty', cost: null, shares: 0 }, reason: null };

  // Keep the production replay, including its same-day input order for UUIDs.
  // No quote is needed for the cost ledger, and fees follow its existing policy.
  const position = derivePositionsFromTrades(rows)[0];
  if (!position || !LEDGER_NUMERIC_FIELDS.every(key => Number.isFinite(position[key]))) {
    return { state: unavailable(), reason: 'invalid-ledger' };
  }
  // The production summary clamps excess sells; a preview must not present that
  // clamped result as the outcome of a fully valid proposed transaction.
  if (position.ignoredSellShares > 0) return { state: unavailable(), reason: 'ledger-oversell' };
  return {
    state: position.heldShares > 0
      ? { status: 'holding', cost: position.effectiveCost, shares: position.heldShares }
      : { status: 'closed', cost: null, shares: 0 },
    reason: null,
  };
}

function validValuationInput(quote) {
  if (!quote) return false;
  if (quote.dailyPnlLocked != null && typeof quote.dailyPnlLocked !== 'boolean') return false;
  // Validate the source selected by the production valuation fallback; do not
  // let coercible booleans/arrays turn into an apparently valid quote of $1.
  const candidates = quote.dailyPnlLocked
    ? [quote.dailyPnlPrice, quote.dailyPnlBaselineClose, quote.dailyBaselineClose, quote.previousClose]
    : [quote.price];
  for (const value of candidates) {
    if (value == null) continue;
    if (!['string', 'number'].includes(typeof value)) return false;
    if (positive(value) !== null) return true;
  }
  return false;
}

function replayAllocation(trades, symbol, quoteRows) {
  if (!Array.isArray(quoteRows) || quoteRows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return null;
  // A valid target cost says nothing about the other stocks in the denominator.
  // Check the entire formal ledger before valuing its remaining positions.
  if (!trades.every(row => validLedgerRow(row) && normalizeUserStockSymbol(row.symbol))) return null;
  let summary;
  try {
    summary = deriveInvestmentSummary({ stockTrades: trades, watchlist: quoteRows });
  } catch {
    return null;
  }
  if (summary.positions.some(position => position.ignoredSellShares > 0
    || !LEDGER_NUMERIC_FIELDS.every(key => Number.isFinite(position[key])))) return null;
  const quotes = new Map(quoteRows.map(quote => [normalizeUserStockSymbol(quote.symbol), quote]));
  if (summary.activePositions.some(position => !validValuationInput(quotes.get(position.symbol))
    || !Number.isFinite(position.valuationPrice) || position.valuationPrice <= 0
    || !Number.isFinite(position.marketValue) || position.marketValue <= 0)) return null;
  if (!Number.isFinite(summary.positionsMarketValue)
    || (summary.activePositions.length > 0 && summary.positionsMarketValue <= 0)) return null;
  // This uses stock market value only, matching the holdings table. Cash,
  // financing, draft execution prices and ETF leverage do not enter the ratio.
  const allocation = derivePositionAllocation(summary, symbol);
  return Number.isFinite(allocation) && allocation >= 0 && allocation <= 1 ? allocation : null;
}

/** Read-only ending-position preview using the formal ledger's active-cycle cost. */
export function deriveTradeCostPreview({ stockTrades, quoteRows, draft = {}, scope = 'ledger',
  holdingsReady = false, holdingsError = null } = {}) {
  const symbol = normalizeStrictUserStockSymbol(draft?.symbol);
  const result = { applies: scope === 'ledger', symbol, current: unavailable(), after: unavailable(),
    allocation: { current: null, after: null }, reason: null };
  const fail = reason => ({ ...result, reason });
  if (!result.applies) return fail('not-applicable');
  if (holdingsReady !== true || holdingsError || !Array.isArray(stockTrades)) return fail('holdings-unavailable');
  if (!symbol) return fail('invalid-input');
  if (stockTrades.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return fail('invalid-ledger');

  const current = replay(stockTrades, symbol);
  result.current = current.state;
  if (current.reason) return fail(current.reason);
  result.allocation.current = replayAllocation(stockTrades, symbol, quoteRows);

  const editingId = draft.id || draft.editingId;
  const matches = editingId ? stockTrades.filter(row => sameId(row.id, editingId)) : [];
  if (editingId && matches.length !== 1) return fail('missing-edit');
  const original = matches[0];
  const originalSymbol = original ? normalizeUserStockSymbol(original.symbol) : symbol;
  if (!originalSymbol) return fail('invalid-ledger');
  if (originalSymbol !== symbol) {
    const previous = replay(stockTrades, originalSymbol);
    if (previous.reason) return fail(previous.reason);
  }

  if (!validDate(draft.date)) return fail('invalid-date');
  if (!['buy', 'sell'].includes(draft.side) || (draft.currency && draft.currency !== 'USD')) return fail('invalid-input');
  const numericPrice = positive(draft.price), numericShares = positive(draft.shares);
  if (numericPrice === null || numericShares === null) return fail('invalid-input');
  const tqqq = symbol === 'TQQQ';
  const price = tqqq ? numericPrice : parseFloat(draft.price);
  const shares = tqqq ? numericShares : parseInt(draft.shares);
  // Ordinary saves retain parseInt/parseFloat semantics. Ambiguous input must
  // stay unknown rather than previewing a different quantity from the save.
  if (price !== numericPrice || shares !== numericShares || !Number.isInteger(shares)
    || !Number.isFinite(price * shares)) return fail('invalid-input');
  const previewTrade = { ...draft, symbol, price, shares, id: original?.id ?? '__trade_cost_preview__' };
  const afterTrades = original
    ? stockTrades.map(row => sameId(row.id, editingId) ? previewTrade : row)
    : [...stockTrades, previewTrade];
  const after = replay(afterTrades, symbol);
  if (after.reason) return fail(after.reason);
  if (originalSymbol !== symbol) {
    const previousAfter = replay(afterTrades, originalSymbol);
    if (previousAfter.reason) return fail(previousAfter.reason);
  }
  return { ...result, after: after.state,
    allocation: { ...result.allocation, after: replayAllocation(afterTrades, symbol, quoteRows) } };
}
