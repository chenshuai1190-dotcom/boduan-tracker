import { POPULAR_US_STOCKS } from './popularStocks.js';
import { INVESTMENT_SYMBOL_PRESETS } from './investmentSymbolPresets.js';
import { normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { normalizeStrictUserStockSymbol } from './symbols.js';

// Local suggestions only: these names never query a provider or alter a ledger.
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/;
const ETF_SYMBOLS = new Set(INVESTMENT_SYMBOL_PRESETS.filter(item => item.type === 'ETF').map(item => item.symbol));
const WORD_SYMBOLS = new Set(['ALL', 'ARM', 'CAN', 'COST', 'FOR', 'META', 'NET', 'NOW', 'ONE', 'OPEN', 'OUT', 'RUN', 'SHOP', 'SNOW', 'TEAM']);
const EXTRA_NAMES = {
  NVDA: ['英偉達'], MSFT: ['微軟'], TSM: ['台積電', 'TSMC'],
  GOOGL: ['谷歌', '谷歌A', '谷歌 A', 'Google', 'Google Class A'],
  GOOG: ['谷歌C', '谷歌 C', 'Google Class C'],
};
const catalog = [...POPULAR_US_STOCKS, ...INVESTMENT_SYMBOL_PRESETS];
const knownSymbols = new Set([...catalog.map(item => item.symbol), ...Object.keys(EXTRA_NAMES)]);
const companyNames = new Map();
for (const item of catalog) {
  if (ETF_SYMBOLS.has(item.symbol)) continue; // No generic sector/index-name inference.
  const names = companyNames.get(item.symbol) || new Set();
  for (const value of [item.name, item.company, item.nameZh]) {
    if (value && value.toUpperCase() !== item.symbol) names.add(value);
  }
  companyNames.set(item.symbol, names);
}
for (const [symbol, aliases] of Object.entries(EXTRA_NAMES)) {
  companyNames.set(symbol, new Set([...(companyNames.get(symbol) || []), ...aliases]));
}
const normalize = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const unique = values => [...new Set((Array.isArray(values) ? values : []).map(normalize).filter(Boolean))];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordChar = value => Boolean(value && /[A-Za-z0-9_]/.test(value));

function boundaries(text, start, end, first = 'A', last = 'A') {
  // Chinese text can touch a ticker, but another ticker/word cannot. A final
  // sentence period is allowed; a share-class or market suffix is not split.
  const before = text[start - 1], after = text[end];
  if (wordChar(first) && (wordChar(before) || /[.-]/.test(before || '') && wordChar(text[start - 2]))) return false;
  if (wordChar(last) && (wordChar(after) || /[.-]/.test(after || '') && wordChar(text[end + 1]))) return false;
  return true;
}

function leveragedName(text, start, end) {
  const amount = '(?:\\d+(?:\\.\\d+)?|[一二两兩三四五六七八九十双雙]+)\\s*(?:倍|[xX×])';
  return new RegExp(`${amount}\\s*(?:做多|做空|杠杆|槓桿|反向)?\\s*$`).test(text.slice(Math.max(0, start - 16), start))
    || new RegExp(`^\\s*${amount}`).test(text.slice(end, end + 12));
}

function reviewStockOccurrences(text, candidates = []) {
  const body = typeof text === 'string' ? text : '';
  if (!body) return [];
  const found = [];
  const add = (symbol, start, length) => found.push({ symbol, start, end: start + length });
  for (const match of body.matchAll(/\$([A-Za-z][A-Za-z0-9.-]*)/g)) {
    const raw = match[1].replace(/[.-]+$/, '');
    const symbol = normalizeInvestmentSymbol(normalizeStrictUserStockSymbol(raw));
    if (symbol && SYMBOL.test(symbol) && boundaries(body, match.index, match.index + raw.length + 1)) add(symbol, match.index, raw.length + 1);
  }
  for (const symbol of new Set([...knownSymbols, ...unique(candidates).filter(value => SYMBOL.test(value))])) {
    if (symbol.length <= 2 || !normalizeInvestmentSymbol(symbol)) continue; // V, T, AI, ON, etc. need $ or a company name.
    for (const match of body.matchAll(new RegExp(escape(symbol), 'gi'))) {
      if (WORD_SYMBOLS.has(symbol) && match[0] !== symbol) continue;
      if (boundaries(body, match.index, match.index + match[0].length)) add(symbol, match.index, match[0].length);
    }
  }
  for (const [symbol, names] of companyNames) {
    for (const name of names) {
      for (const match of body.matchAll(new RegExp(escape(name), 'gi'))) {
        const start = match.index, end = start + match[0].length;
        if (boundaries(body, start, end, name[0], name.at(-1)) && !leveragedName(body, start, end)) add(symbol, start, match[0].length);
      }
    }
  }
  // The more specific name wins at the same position (谷歌C before 谷歌).
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  let coveredUntil = -1;
  for (const item of found) {
    if (item.start < coveredUntil) continue;
    coveredUntil = item.end;
    result.push(item);
  }
  return result;
}

/** Known tickers/company names plus explicit $TICKER, ordered by first mention. */
export function findReviewStockMentions(text, candidates = []) {
  return [...new Set(reviewStockOccurrences(text, candidates).map(item => item.symbol))];
}

/** Render-only cashtags. The saved body and automatic stock-link rules stay intact. */
export function reviewStockTextParts(text, candidates = []) {
  const body = typeof text === 'string' ? text : '';
  if (!body) return [];
  // A ticker inside a URL or email address is not a label in the prose.
  const protectedRanges = [...body.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'，。；！？]+|(?:mailto:)?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
  const parts = [], seen = new Set();
  let cursor = 0;
  const appendText = value => {
    if (!value) return;
    const last = parts.at(-1);
    if (last && !last.symbol) last.text += value;
    else parts.push({ text: value });
  };
  for (const item of reviewStockOccurrences(body, candidates)) {
    if (protectedRanges.some(range => item.start < range.end && item.end > range.start)) continue;
    appendText(body.slice(cursor, item.start));
    const original = body.slice(item.start, item.end);
    if (seen.has(item.symbol)) appendText(original.startsWith('$') ? original.slice(1) : original);
    else { seen.add(item.symbol); parts.push({ text: `$${item.symbol}`, symbol: item.symbol }); }
    cursor = item.end;
  }
  appendText(body.slice(cursor));
  return parts;
}

/** Explicit removals win. Existing links are never dropped to make auto room. */
export function resolveReviewStockLinks({ text, selected = [], suggestions = [], excluded = [], limit = 4 } = {}) {
  const removed = new Set(unique(excluded));
  const linked = unique(selected).filter(symbol => !removed.has(symbol));
  const mentions = findReviewStockMentions(text, [...linked, ...unique(suggestions)]).filter(symbol => !removed.has(symbol));
  const linkedSet = new Set(linked), mentioned = new Set(mentions), omitted = [];
  const maximum = Number.isInteger(limit) && limit >= 0 ? limit : 4;
  for (const symbol of mentions) {
    if (linkedSet.has(symbol)) continue;
    if (linked.length < maximum) { linked.push(symbol); linkedSet.add(symbol); }
    else omitted.push(symbol);
  }
  return { stocks: [...mentions.filter(symbol => linkedSet.has(symbol)), ...linked.filter(symbol => !mentioned.has(symbol))], omitted };
}
