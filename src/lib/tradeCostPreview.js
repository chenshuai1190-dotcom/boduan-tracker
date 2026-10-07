import { derivePositionsFromTrades } from './investmentSummary.js';
import { normalizeStrictUserStockSymbol, normalizeUserStockSymbol } from './symbols.js';

const unavailable = () => ({ status: 'unavailable', cost: null, shares: null });
const sameId = (left, right) => String(left ?? '') === String(right ?? '');

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
  if (!position || !['heldShares', 'remainingCost', 'activeRealizedPnl', 'effectiveCost', 'ignoredSellShares',
    'realizedPnl', 'totalBuyCost', 'totalBuyShares', 'totalSellShares', 'sellProceeds', 'soldCost']
    .every(key => Number.isFinite(position[key]))) return { state: unavailable(), reason: 'invalid-ledger' };
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

/** Read-only ending-position preview using the formal ledger's active-cycle cost. */
export function deriveTradeCostPreview({ stockTrades, draft = {}, scope = 'ledger',
  holdingsReady = false, holdingsError = null } = {}) {
  const symbol = normalizeStrictUserStockSymbol(draft?.symbol);
  const result = { applies: scope === 'ledger', symbol, current: unavailable(), after: unavailable(), reason: null };
  const fail = reason => ({ ...result, reason });
  if (!result.applies) return fail('not-applicable');
  if (holdingsReady !== true || holdingsError || !Array.isArray(stockTrades)) return fail('holdings-unavailable');
  if (!symbol) return fail('invalid-input');
  if (stockTrades.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return fail('invalid-ledger');

  const current = replay(stockTrades, symbol);
  result.current = current.state;
  if (current.reason) return fail(current.reason);

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
  return { ...result, after: after.state };
}
