const USER_STOCK_SYMBOL_RE = /^[A-Z0-9._-]{1,15}$/;

const INVISIBLE_SYMBOL_CHARS_RE = /[\u200B-\u200D\uFEFF]/g;
const SYMBOL_WHITESPACE_RE = /\s+/g;
const MAX_REPAIRED_SYMBOL_LENGTH = 6;

export function normalizeUserStockSymbol(value) {
  const upper = String(value || '')
    .trim()
    .toUpperCase()
    .replace(INVISIBLE_SYMBOL_CHARS_RE, '');
  if (!upper) return '';

  const withoutUsSuffix = upper.endsWith('.US') ? upper.slice(0, -3) : upper;
  if (USER_STOCK_SYMBOL_RE.test(withoutUsSuffix)) return withoutUsSuffix;

  if (!SYMBOL_WHITESPACE_RE.test(withoutUsSuffix)) return '';
  const compact = withoutUsSuffix.replace(SYMBOL_WHITESPACE_RE, '');
  if (compact.length > MAX_REPAIRED_SYMBOL_LENGTH) return '';
  return USER_STOCK_SYMBOL_RE.test(compact) ? compact : '';
}

export function normalizeStrictUserStockSymbol(value) {
  const upper = String(value || '')
    .trim()
    .toUpperCase()
    .replace(INVISIBLE_SYMBOL_CHARS_RE, '');
  if (!upper) return '';

  const withoutUsSuffix = upper.endsWith('.US') ? upper.slice(0, -3) : upper;
  return USER_STOCK_SYMBOL_RE.test(withoutUsSuffix) ? withoutUsSuffix : '';
}
