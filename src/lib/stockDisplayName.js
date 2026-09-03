import { normalizeUserStockSymbol } from './symbols.js';

const CODE_ONLY_CHINESE_SYMBOLS = new Set(['QQQ', 'TQQQ']);
const ASCII_STOCK_NAME_RE = /^[A-Za-z0-9 .,&'()/-]+$/;

function isPlaceholderStockName(symbol, name) {
  const raw = String(name || '').trim();
  if (!raw) return true;
  const upper = raw.toUpperCase();
  return upper === symbol || upper === `${symbol}.US`;
}

export function resolveStockDisplayName({
  symbol,
  name,
  english = false,
  chineseName = '',
  englishName = '',
} = {}) {
  const normalizedSymbol = normalizeUserStockSymbol(symbol);
  const raw = String(name || '').trim();
  if (!normalizedSymbol) return raw;

  if (english) {
    const mappedEnglishName = String(englishName || '').trim();
    if (mappedEnglishName) return mappedEnglishName;
    if (raw && !isPlaceholderStockName(normalizedSymbol, raw) && ASCII_STOCK_NAME_RE.test(raw)) return raw;
    return normalizedSymbol;
  }

  // QQQ/TQQQ are product-level ticker labels. Provider, discovery, or historical
  // Chinese aliases must not replace them in holdings or persisted trade metadata.
  if (CODE_ONLY_CHINESE_SYMBOLS.has(normalizedSymbol)) return normalizedSymbol;

  const mappedChineseName = String(chineseName || '').trim();
  if (mappedChineseName && (isPlaceholderStockName(normalizedSymbol, raw) || ASCII_STOCK_NAME_RE.test(raw))) {
    return mappedChineseName;
  }
  return raw || mappedChineseName || normalizedSymbol;
}
