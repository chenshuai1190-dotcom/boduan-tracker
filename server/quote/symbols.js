export const MAX_SYMBOLS = 30;
export const MAX_SYMBOLS_PARAM_LENGTH = 2000;
export const MAX_TRANSLATE_PAYLOAD_LENGTH = 1200;
export const STOCK_SYMBOL_RE = /^[A-Z0-9._-]{1,15}$/;

export function normalizeSymbolToken(token) {
  const trimmed = (token || '').trim();
  if (!trimmed) return { error: 'symbols 里包含空代码' };

  if (trimmed.startsWith('TRANSLATE:')) {
    const encoded = trimmed.slice('TRANSLATE:'.length);
    if (encoded.length === 0 || encoded.length > MAX_TRANSLATE_PAYLOAD_LENGTH) {
      return { error: 'TRANSLATE 内容长度不合法' };
    }
    if (!/^[A-Za-z0-9+/=_-]+$/.test(encoded)) {
      return { error: 'TRANSLATE 内容格式不合法' };
    }
    return { value: trimmed };
  }

  const upper = trimmed.toUpperCase();
  if (upper.startsWith('ANALYST:')) {
    const stockSym = upper.slice('ANALYST:'.length);
    if (!STOCK_SYMBOL_RE.test(stockSym)) return { error: `股票代码不合法: ${stockSym}` };
    return { value: `ANALYST:${stockSym}` };
  }

  if (upper.startsWith('CALENDAR')) {
    if (upper === 'CALENDAR') return { value: upper };
    if (!upper.startsWith('CALENDAR:')) return { error: `日历参数不合法: ${trimmed}` };
    const watchSymbols = upper.slice('CALENDAR:'.length).split('|').filter(Boolean);
    if (watchSymbols.length > MAX_SYMBOLS) return { error: `日历股票数量不能超过 ${MAX_SYMBOLS} 个` };
    const invalid = watchSymbols.find(sym => !STOCK_SYMBOL_RE.test(sym));
    if (invalid) return { error: `日历股票代码不合法: ${invalid}` };
    return { value: `CALENDAR:${watchSymbols.join('|')}` };
  }

  if (upper === 'VIX' || upper === 'FGI' || upper === 'INDICES') return { value: upper };
  if (!STOCK_SYMBOL_RE.test(upper)) return { error: `股票代码不合法: ${trimmed}` };
  return { value: upper };
}

export function parseSymbolsParam(rawSymbols) {
  const symbols = Array.isArray(rawSymbols) ? rawSymbols[0] : rawSymbols;
  if (!symbols || typeof symbols !== 'string') {
    return { error: '需要传 symbols 参数,例如 ?symbols=TQQQ,QQQ,NVDA' };
  }
  if (symbols.length > MAX_SYMBOLS_PARAM_LENGTH) {
    return { error: `symbols 参数过长,最多 ${MAX_SYMBOLS_PARAM_LENGTH} 字符` };
  }

  const normalized = [];
  for (const token of symbols.split(',')) {
    const result = normalizeSymbolToken(token);
    if (result.error) return { error: result.error };
    normalized.push(result.value);
  }
  if (normalized.length > MAX_SYMBOLS) {
    return { error: `单次最多请求 ${MAX_SYMBOLS} 个 symbols` };
  }
  return { symbolList: normalized };
}
