export const WATCHLIST_DRAG_THRESHOLD = 6;

const symbolsOf = rows => rows.map(row => String(row.symbol));
export const watchlistOrderKey = rows => JSON.stringify(symbolsOf(rows));

export function applyWatchlistOrder(rows, symbols) {
  const current = new Map(rows.map(row => [String(row.symbol), row]));
  if (current.size !== rows.length || symbols.length !== rows.length || new Set(symbols).size !== symbols.length) return null;
  if (symbols.some(symbol => !current.has(symbol))) return null;
  return symbols.map(symbol => current.get(symbol));
}

export function moveWatchlistSymbol(symbols, symbol, targetSymbol) {
  const from = symbols.indexOf(symbol);
  const to = symbols.indexOf(targetSymbol);
  if (from < 0 || to < 0 || from === to) return symbols;
  const next = [...symbols];
  next.splice(from, 1);
  next.splice(to, 0, symbol);
  return next;
}

export function watchlistKeyboardOrder(rows, symbol, direction) {
  const symbols = symbolsOf(rows);
  const from = symbols.indexOf(String(symbol));
  const to = from + direction;
  if (from < 0 || to < 0 || to >= symbols.length || ![-1, 1].includes(direction)) return null;
  return applyWatchlistOrder(rows, moveWatchlistSymbol(symbols, String(symbol), symbols[to]));
}

export function watchlistTargetAtY(rects, pointerY) {
  let closest = null;
  let distance = Infinity;
  for (const rect of rects) {
    const nextDistance = Math.abs(pointerY - (rect.top + rect.bottom) / 2);
    if (nextDistance < distance) {
      closest = rect.symbol;
      distance = nextDistance;
    }
  }
  return closest;
}

export function watchlistAutoScrollDelta({ pointerY, top, bottom, elapsedMs = 16 }) {
  if (![pointerY, top, bottom].every(Number.isFinite) || bottom <= top) return 0;
  const edge = Math.min(56, (bottom - top) / 3);
  const upper = top + edge;
  const lower = bottom - edge;
  const intensity = pointerY < upper ? -Math.min(1, (upper - pointerY) / edge)
    : pointerY > lower ? Math.min(1, (pointerY - lower) / edge) : 0;
  return intensity * 600 * Math.max(0, Math.min(32, elapsedMs)) / 1000;
}

// A session owns only an ordering of symbols. Quotes always come from the latest rows.
export function createWatchlistReorderSession({ rows, symbol, pointerId, clientX = 0, clientY = 0 }) {
  const originalKey = watchlistOrderKey(rows);
  let symbols = symbolsOf(rows);
  let active = symbols.includes(String(symbol)) && new Set(symbols).size === symbols.length;
  let dragging = false;
  const draggedSymbol = String(symbol);
  const isCurrent = latestRows => watchlistOrderKey(latestRows) === originalKey;
  return {
    pointerId,
    symbol: draggedSymbol,
    originalKey,
    get active() { return active; },
    get dragging() { return dragging; },
    get symbols() { return [...symbols]; },
    move({ rows: latestRows, pointerId: nextPointerId, clientX: x, clientY: y, targetSymbol, disabled = false }) {
      if (!active || nextPointerId !== pointerId) return null;
      if (disabled || !isCurrent(latestRows)) { active = false; return null; }
      if (!dragging && Math.hypot(x - clientX, y - clientY) < WATCHLIST_DRAG_THRESHOLD) return null;
      dragging = true;
      symbols = moveWatchlistSymbol(symbols, draggedSymbol, targetSymbol);
      return applyWatchlistOrder(latestRows, symbols);
    },
    finish({ rows: latestRows, pointerId: nextPointerId, disabled = false }) {
      if (!active || nextPointerId !== pointerId) return null;
      active = false;
      if (!dragging || disabled || !isCurrent(latestRows) || JSON.stringify(symbols) === originalKey) return null;
      return applyWatchlistOrder(latestRows, symbols);
    },
    cancel() { active = false; },
  };
}

export function createWatchlistReorderCommitter() {
  let busy = false;
  return {
    get busy() { return busy; },
    async commit(rows, onReorder) {
      if (busy || !rows || typeof onReorder !== 'function') return false;
      busy = true;
      try {
        const result = await onReorder(rows);
        return result !== false && result?.success !== false;
      } finally {
        busy = false;
      }
    },
  };
}
