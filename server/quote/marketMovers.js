import { fetchWithTimeout, QUOTE_TIMEOUTS } from './http.js';

const EODHD_BASE_URL = 'https://eodhd.com/api';
const NASDAQ_TRADER_BASE_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir';
const MARKET_MOVERS_SOURCE = 'EODHD_SCREENER';
const MARKET_MOVERS_LIMIT = 30;
const SCREENER_PAGE_SIZE = 100;
const MAX_SCREENER_PAGES = 10;
const MARKET_MOVERS_REQUEST_BUDGET_MS = 25 * 1000;
const MARKET_MOVERS_TTL_MS = 60 * 60 * 1000;
const SYMBOL_UNIVERSE_TTL_MS = 24 * 60 * 60 * 1000;
const HOME_CATEGORY_TTL_MS = 24 * 60 * 60 * 1000;
const HOME_CATEGORY_BATCH_SIZE = 10;
const NASDAQ_TRADER_MIN_NASDAQ_ROWS = 1000;
const NASDAQ_TRADER_MIN_NYSE_ROWS = 1000;
const NASDAQ_TRADER_MIN_NYSE_AMERICAN_ROWS = 100;

const OTHER_LISTED_EXCHANGES = new Map([
  ['N', 'NYSE'],
  ['A', 'NYSE American'],
]);
const EODHD_ALLOWED_EXCHANGES = new Map([
  ['NASDAQ', 'NASDAQ'],
  ['NYSE', 'NYSE'],
  ['AMEX', 'NYSE American'],
  ['NYSE MKT', 'NYSE American'],
  ['NYSE AMERICAN', 'NYSE American'],
]);

const DISALLOWED_NAME_PATTERN = /\b(?:ETFs?|funds?|warrants?|rights?|units?|notes?)\b/i;
const DISALLOWED_PREFERRED_NAME_PATTERNS = Object.freeze([
  /\bpreferred\s+(?:stocks?|shares?|securities|units?)\b/i,
  /\bpreference\s+(?:stocks?|shares?|securities|units?)\b/i,
  /\b(?:preferred|preference)\s+series\b/i,
  /\b(?:pref|pfd)\b/i,
  /\bdepositary shares?\b.{0,180}\b(?:preferred|preference)\b/i,
  /\b(?:preferred|preference)\b.{0,180}\bdepositary shares?\b/i,
  /\bperpetual preferred\b/i,
  /\b(?:preferred|preference)\s*$/i,
]);
const DISALLOWED_DEBT_NAME_PATTERNS = Object.freeze([
  /\b(?:junior\s+|subordinated\s+)?debentures?\b/i,
  /\b(?:first|collateral\s+trust)\s+mortgage\s+bonds?\b/i,
  /\bsynthetic\s+fixed-income\s+securities\b/i,
  /\bSTRATS\b/i,
  /\bstructured\s+repackaged\s+asset-backed\s+trust\s+securities\b/i,
  /\bmunicipal\s+bond\b.{0,100}\b(?:debt\s+)?trust\b/i,
  /\bcorporate\s+backed\s+trust\s+securities\b/i,
  /\bincome\s+securities\s+trust\b/i,
  /\bcapital\s+trust\s+[IVX]+\b/i,
  /\bABS\b.{0,160}\b(?:corp(?:orate)?\s+backed|tr\s+certs?)\b/i,
]);
const DISALLOWED_FUND_NAME_PATTERNS = Object.freeze([
  /\b(?:BlackRock|Blackrock|Putnam|Invesco|DWS|Royce|Gabelli|XAI|Angel\s+Oak|Eaton\s+Vance)\b.{0,180}\b(?:trust|common\s+shares?\s+of\s+beneficial\s+(?:interest|ownership))\b/i,
  /\bBarings\s+(?:Participation|Corporate)\s+Investors\b/i,
  /\bBNY\s+Mellon\s+Strategic\s+Municipals\b/i,
]);
const DELIMITED_INSTRUMENT_SUFFIX_PATTERN = /(?:[-./](?:W|WS|WT|R|RI|RT|U|UN))$/i;
const PREFERRED_INSTRUMENT_SUFFIX_PATTERN = /(?:[-./]P(?:R)?(?:[-./]?[A-Z])?)$/i;
// A fifth-letter Q is no longer a current Nasdaq suffix. EODHD can retain stale
// Nasdaq metadata for symbols that moved to OTC after bankruptcy (for example BIOCQ).
const NASDAQ_FIFTH_LETTER_INSTRUMENT_PATTERN = /^[A-Z0-9]{4,}(?:M|N|O|P|Q|R|T|U|W)$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NASDAQ_LISTED_FILE = 'nasdaqlisted.txt';
const OTHER_LISTED_FILE = 'otherlisted.txt';
const EODHD_SYMBOL_LIST_EXCHANGES = Object.freeze(['NASDAQ', 'NYSE', 'AMEX']);
const NASDAQ_TRADER_TRAILER_PATTERN = /^File Creation Time: \d{10}:\d{2}(?:\|)*$/;
const MARKET_CLOSE_ANCHOR_SYMBOL = 'SPY.US';
const MARKET_CLOSE_LOOKBACK_DAYS = 14;
const DISALLOWED_HOME_CATEGORIES = new Set([
  'CEF',
  'ETF',
  'ETN',
  'ETD',
  'FUND',
  'MUTUAL FUND',
  'PREFERRED',
  'PREFERRED STOCK',
  'WARRANT',
  'WARRANTS',
  'RIGHT',
  'RIGHTS',
  'UNIT',
  'UNITS',
]);

let symbolUniverseCache = null;
let symbolUniverseInFlight = null;
let marketMoversCache = null;
let marketMoversInFlight = null;
let homeCategoryCache = new Map();
let homeCategoryInFlight = new Map();

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSymbol(value) {
  return cleanText(value).toUpperCase();
}

function canonicalListingSymbol(value) {
  return normalizeSymbol(value).replace(/[./]/g, '-');
}

function normalizeCurrency(value) {
  const currency = cleanText(value).toUpperCase();
  if (currency === '$' || currency === 'US$') return 'USD';
  return currency || 'USD';
}

function isDisallowedInstrument(symbol, name) {
  return (
    DISALLOWED_NAME_PATTERN.test(name)
    || DISALLOWED_PREFERRED_NAME_PATTERNS.some(pattern => pattern.test(name))
    || DISALLOWED_DEBT_NAME_PATTERNS.some(pattern => pattern.test(name))
    || DISALLOWED_FUND_NAME_PATTERNS.some(pattern => pattern.test(name))
    || DELIMITED_INSTRUMENT_SUFFIX_PATTERN.test(symbol)
    || PREFERRED_INSTRUMENT_SUFFIX_PATTERN.test(symbol)
    || NASDAQ_FIFTH_LETTER_INSTRUMENT_PATTERN.test(symbol)
  );
}

function parseNasdaqTraderFile(text, expectedHeaders, label) {
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${label} 返回空文件`);
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  const headers = lines[0]?.split('|').map(value => value.trim()) || [];
  if (!expectedHeaders.every(header => headers.includes(header))) {
    throw new Error(`${label} 返回格式异常`);
  }
  const trailerIndexes = lines.flatMap((line, index) => (
    NASDAQ_TRADER_TRAILER_PATTERN.test(line) ? [index] : []
  ));
  if (trailerIndexes.length !== 1 || trailerIndexes[0] !== lines.length - 1) {
    throw new Error(`${label} 缺少完整文件尾`);
  }

  return lines.slice(1).flatMap((line) => {
    if (NASDAQ_TRADER_TRAILER_PATTERN.test(line)) return [];
    const values = line.split('|');
    if (values.length < headers.length) return [];
    return [Object.fromEntries(headers.map((header, index) => [header, cleanText(values[index])]))];
  });
}

export function createCommonStockUniverse({
  eodhdRows,
  nasdaqListedText,
  otherListedText,
} = {}) {
  if (!Array.isArray(eodhdRows)) throw new Error('EODHD symbol list 返回格式异常');
  const nasdaqRows = parseNasdaqTraderFile(
    nasdaqListedText,
    ['Symbol', 'Security Name', 'Test Issue', 'ETF', 'NextShares'],
    'Nasdaq Trader nasdaqlisted'
  );
  const otherRows = parseNasdaqTraderFile(
    otherListedText,
    ['ACT Symbol', 'Security Name', 'Exchange', 'ETF', 'Test Issue', 'NASDAQ Symbol'],
    'Nasdaq Trader otherlisted'
  );

  const eligibleNasdaqRows = nasdaqRows.filter(
    row => row['Test Issue'] === 'N' && row.ETF === 'N' && row.NextShares === 'N'
  );
  const eligibleNyseRows = otherRows.filter(
    row => row.Exchange === 'N' && row['Test Issue'] === 'N' && row.ETF === 'N'
  );
  const eligibleNyseAmericanRows = otherRows.filter(
    row => row.Exchange === 'A' && row['Test Issue'] === 'N' && row.ETF === 'N'
  );
  if (
    eligibleNasdaqRows.length < NASDAQ_TRADER_MIN_NASDAQ_ROWS
    || eligibleNyseRows.length < NASDAQ_TRADER_MIN_NYSE_ROWS
    || eligibleNyseAmericanRows.length < NASDAQ_TRADER_MIN_NYSE_AMERICAN_ROWS
  ) {
    throw new Error('Nasdaq Trader 上市目录数据不完整');
  }
  const eligibleOtherRows = [...eligibleNyseRows, ...eligibleNyseAmericanRows];

  const currentListings = new Map();
  const addStock = ({ symbol, aliases = [], name, exchange }) => {
    const canonicalSymbol = canonicalListingSymbol(symbol);
    if (!canonicalSymbol || !name || !exchange || isDisallowedInstrument(canonicalSymbol, name)) return;
    const value = { symbol: canonicalSymbol, name, exchange, currency: 'USD' };
    for (const alias of [symbol, ...aliases]) {
      const canonicalAlias = canonicalListingSymbol(alias);
      if (canonicalAlias) currentListings.set(canonicalAlias, value);
    }
  };

  for (const row of eligibleNasdaqRows) {
    addStock({ symbol: row.Symbol, name: row['Security Name'], exchange: 'NASDAQ' });
  }
  for (const row of eligibleOtherRows) {
    const exchange = OTHER_LISTED_EXCHANGES.get(row.Exchange);
    addStock({
      symbol: row['NASDAQ Symbol'] || row['ACT Symbol'],
      aliases: [row['ACT Symbol']],
      name: row['Security Name'],
      exchange,
    });
  }

  const universe = new Map();
  for (const row of eodhdRows) {
    const symbol = canonicalListingSymbol(row?.Code);
    const name = cleanText(row?.Name);
    const type = cleanText(row?.Type).toLowerCase();
    const eodhdExchange = EODHD_ALLOWED_EXCHANGES.get(cleanText(row?.Exchange).toUpperCase());
    const currentListing = currentListings.get(symbol);
    if (!symbol || !name || type !== 'common stock' || !eodhdExchange || !currentListing) continue;
    if (isDisallowedInstrument(symbol, name)) continue;
    universe.set(symbol, {
      symbol,
      name,
      officialName: currentListing.name,
      exchange: currentListing.exchange,
      currency: normalizeCurrency(row?.Currency),
    });
  }
  return universe;
}

function createProviderUrl(pathname, eodhdKey, params = {}) {
  const url = new URL(`${EODHD_BASE_URL}/${pathname}`);
  url.searchParams.set('api_token', eodhdKey);
  url.searchParams.set('fmt', 'json');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readProviderJson(response, label) {
  if (!response?.ok) {
    throw new Error(`${label} HTTP ${response?.status || 'unknown'}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} 返回无效 JSON`);
  }
}

async function readProviderText(response, label) {
  if (!response?.ok) {
    throw new Error(`${label} HTTP ${response?.status || 'unknown'}`);
  }
  try {
    return await response.text();
  } catch {
    throw new Error(`${label} 返回无效文本`);
  }
}

function remainingProviderTimeout(deadlineAt) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error('美股收盘榜请求超时');
  return Math.min(QUOTE_TIMEOUTS.eodhd, remainingMs);
}

async function fetchProviderJson({ url, fetchImpl, label, provider, timeoutMs }) {
  let response;
  try {
    response = await fetchWithTimeout(
      url.toString(),
      { headers: { Accept: 'application/json' } },
      { fetchImpl, provider, timeoutMs }
    );
  } catch (error) {
    if (error?.name === 'ProviderTimeoutError') throw new Error(`${label} 请求超时`);
    throw new Error(`${label} 请求失败`);
  }
  return readProviderJson(response, label);
}

async function fetchProviderText({ url, fetchImpl, label, provider, timeoutMs }) {
  let response;
  try {
    response = await fetchWithTimeout(
      url.toString(),
      { headers: { Accept: 'text/plain' } },
      { fetchImpl, provider, timeoutMs }
    );
  } catch (error) {
    if (error?.name === 'ProviderTimeoutError') throw new Error(`${label} 请求超时`);
    throw new Error(`${label} 请求失败`);
  }
  return readProviderText(response, label);
}

async function fetchCommonStockUniverse({ eodhdKey, fetchImpl, now, deadlineAt }) {
  if (symbolUniverseCache && symbolUniverseCache.expiresAt > now) {
    return symbolUniverseCache.value;
  }
  if (symbolUniverseInFlight) return symbolUniverseInFlight;

  symbolUniverseInFlight = (async () => {
    const [eodhdRowGroups, nasdaqListedText, otherListedText] = await Promise.all([
      Promise.all(EODHD_SYMBOL_LIST_EXCHANGES.map(exchange => fetchProviderJson({
        url: createProviderUrl(`exchange-symbol-list/${exchange}`, eodhdKey),
        fetchImpl,
        label: `EODHD ${exchange} symbol list`,
        provider: `eodhd:symbol-list:${exchange.toLowerCase()}`,
        timeoutMs: remainingProviderTimeout(deadlineAt),
      }))),
      fetchProviderText({
        url: new URL(`${NASDAQ_TRADER_BASE_URL}/${NASDAQ_LISTED_FILE}`),
        fetchImpl,
        label: 'Nasdaq Trader nasdaqlisted',
        provider: 'nasdaq-trader:nasdaqlisted',
        timeoutMs: remainingProviderTimeout(deadlineAt),
      }),
      fetchProviderText({
        url: new URL(`${NASDAQ_TRADER_BASE_URL}/${OTHER_LISTED_FILE}`),
        fetchImpl,
        label: 'Nasdaq Trader otherlisted',
        provider: 'nasdaq-trader:otherlisted',
        timeoutMs: remainingProviderTimeout(deadlineAt),
      }),
    ]);
    const value = createCommonStockUniverse({
      eodhdRows: eodhdRowGroups.flat(),
      nasdaqListedText,
      otherListedText,
    });
    if (value.size === 0) throw new Error('EODHD/Nasdaq Trader 交集没有可用的美股普通股');
    symbolUniverseCache = { value, expiresAt: now + SYMBOL_UNIVERSE_TTL_MS };
    return value;
  })();

  try {
    return await symbolUniverseInFlight;
  } finally {
    symbolUniverseInFlight = null;
  }
}

async function fetchScreenerPage({ eodhdKey, fetchImpl, direction, offset, deadlineAt }) {
  const url = createProviderUrl('screener', eodhdKey, {
    sort: `refund_1d_p.${direction}`,
    filters: JSON.stringify([['exchange', '=', 'us']]),
    limit: SCREENER_PAGE_SIZE,
    offset,
  });
  const body = await fetchProviderJson({
    url,
    fetchImpl,
    label: 'EODHD screener',
    provider: `eodhd:screener:${direction}:${offset}`,
    timeoutMs: remainingProviderTimeout(deadlineAt),
  });
  if (!Array.isArray(body?.data)) throw new Error('EODHD screener 返回格式异常');
  return body.data;
}

function utcIsoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function fetchLatestMarketCloseDate({ eodhdKey, fetchImpl, now, deadlineAt }) {
  const to = utcIsoDate(now);
  const from = utcIsoDate(now - MARKET_CLOSE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await fetchProviderJson({
    url: createProviderUrl(`eod/${MARKET_CLOSE_ANCHOR_SYMBOL}`, eodhdKey, {
      period: 'd',
      order: 'd',
      from,
      to,
    }),
    fetchImpl,
    label: 'EODHD SPY close date',
    provider: 'eodhd:eod:spy-close-date',
    timeoutMs: remainingProviderTimeout(deadlineAt),
  });
  if (!Array.isArray(rows)) throw new Error('EODHD SPY 收盘日返回格式异常');
  const targetDate = rows
    .map(row => cleanText(row?.date))
    .filter(date => ISO_DATE_PATTERN.test(date) && date <= to)
    .sort()
    .at(-1);
  if (!targetDate) throw new Error('EODHD SPY 没有可用的收盘日');
  return targetDate;
}

async function fetchHomeCategory({ symbol, eodhdKey, fetchImpl, now, deadlineAt }) {
  const cached = homeCategoryCache.get(symbol);
  if (cached?.expiresAt > now) return cached.category;
  if (homeCategoryInFlight.has(symbol)) return homeCategoryInFlight.get(symbol);

  const request = (async () => {
    const body = await fetchProviderJson({
      url: createProviderUrl(`fundamentals/${symbol}.US`, eodhdKey, {
        filter: 'General::HomeCategory',
      }),
      fetchImpl,
      label: `EODHD ${symbol} HomeCategory`,
      provider: `eodhd:fundamentals:home-category:${symbol.toLowerCase()}`,
      timeoutMs: remainingProviderTimeout(deadlineAt),
    });
    const category = cleanText(body);
    if (!category) throw new Error(`EODHD ${symbol} HomeCategory 返回格式异常`);
    homeCategoryCache.set(symbol, { category, expiresAt: now + HOME_CATEGORY_TTL_MS });
    return category;
  })();
  homeCategoryInFlight.set(symbol, request);
  try {
    return await request;
  } finally {
    if (homeCategoryInFlight.get(symbol) === request) homeCategoryInFlight.delete(symbol);
  }
}

async function verifyCommonEquityCandidates({
  candidates,
  eodhdKey,
  fetchImpl,
  now,
  deadlineAt,
}) {
  const verified = [];
  for (let offset = 0; offset < candidates.length; offset += HOME_CATEGORY_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + HOME_CATEGORY_BATCH_SIZE);
    const categories = await Promise.all(batch.map(candidate => fetchHomeCategory({
      symbol: candidate.symbol,
      eodhdKey,
      fetchImpl,
      now,
      deadlineAt,
    })));
    batch.forEach((candidate, index) => {
      if (!DISALLOWED_HOME_CATEGORIES.has(categories[index].toUpperCase())) verified.push(candidate);
    });
  }
  return verified;
}

function normalizeMover(row, universe, expectedDirection) {
  const symbol = canonicalListingSymbol(row?.code);
  const stock = universe.get(symbol);
  if (!stock) return null;

  const price = finiteNumber(row?.adjusted_close);
  const changePercent = finiteNumber(row?.refund_1d_p);
  const changeAmount = finiteNumber(row?.refund_1d);
  const dataDate = cleanText(row?.last_day_data_date);
  if (!(price > 0) || changePercent === null) return null;
  if (!ISO_DATE_PATTERN.test(dataDate)) return null;
  if (expectedDirection === 'desc' && !(changePercent > 0)) return null;
  if (expectedDirection === 'asc' && !(changePercent < 0)) return null;

  const company = cleanText(row?.name) || stock.name;
  if (isDisallowedInstrument(symbol, company)) return null;

  return {
    symbol,
    name: company,
    company,
    price,
    changePercent,
    changeAmount,
    exchange: stock.exchange,
    currency: stock.currency || normalizeCurrency(row?.currency_symbol),
    volume: finiteNumber(row?.avgvol_1d),
    marketCap: finiteNumber(row?.market_capitalization),
    dataDate,
  };
}

async function fetchMoverSide({
  eodhdKey,
  fetchImpl,
  universePromise,
  targetDatePromise,
  now,
  direction,
  deadlineAt,
}) {
  const acceptedBySymbol = new Map();

  for (let page = 0; page < MAX_SCREENER_PAGES; page += 1) {
    const [rawRows, universe, targetDate] = await Promise.all([
      fetchScreenerPage({
        eodhdKey,
        fetchImpl,
        direction,
        offset: page * SCREENER_PAGE_SIZE,
        deadlineAt,
      }),
      universePromise,
      targetDatePromise,
    ]);

    const pageCandidates = [];
    const pageSymbols = new Set();
    for (const row of rawRows) {
      const normalized = normalizeMover(row, universe, direction);
      if (
        normalized?.dataDate === targetDate
        && !acceptedBySymbol.has(normalized.symbol)
        && !pageSymbols.has(normalized.symbol)
      ) {
        pageCandidates.push(normalized);
        pageSymbols.add(normalized.symbol);
      }
    }
    const verifiedCandidates = await verifyCommonEquityCandidates({
      candidates: pageCandidates,
      eodhdKey,
      fetchImpl,
      now,
      deadlineAt,
    });
    for (const candidate of verifiedCandidates) acceptedBySymbol.set(candidate.symbol, candidate);

    if (acceptedBySymbol.size >= MARKET_MOVERS_LIMIT) break;
    if (rawRows.length < SCREENER_PAGE_SIZE) break;
  }

  const targetDate = await targetDatePromise;
  const rows = [...acceptedBySymbol.values()];
  if (rows.length < MARKET_MOVERS_LIMIT) {
    throw new Error(`EODHD screener 没有返回足够的${direction === 'desc' ? '涨幅' : '跌幅'}榜普通股`);
  }
  rows.sort((left, right) => {
    const difference = direction === 'desc'
      ? right.changePercent - left.changePercent
      : left.changePercent - right.changePercent;
    return difference || left.symbol.localeCompare(right.symbol);
  });
  return { dataDate: targetDate, rows: rows.slice(0, MARKET_MOVERS_LIMIT) };
}

export async function fetchMarketMovers({
  eodhdKey,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  if (!cleanText(eodhdKey)) throw new Error('缺少 EODHD_API_KEY');
  if (typeof fetchImpl !== 'function') throw new Error('fetch 不可用');

  if (marketMoversCache && marketMoversCache.expiresAt > now) {
    return marketMoversCache.value;
  }
  if (marketMoversInFlight) return marketMoversInFlight;

  marketMoversInFlight = (async () => {
    const deadlineAt = Date.now() + MARKET_MOVERS_REQUEST_BUDGET_MS;
    const universePromise = fetchCommonStockUniverse({ eodhdKey, fetchImpl, now, deadlineAt });
    const targetDatePromise = fetchLatestMarketCloseDate({ eodhdKey, fetchImpl, now, deadlineAt });
    const [gainers, losers] = await Promise.all([
      fetchMoverSide({ eodhdKey, fetchImpl, universePromise, targetDatePromise, now, direction: 'desc', deadlineAt }),
      fetchMoverSide({ eodhdKey, fetchImpl, universePromise, targetDatePromise, now, direction: 'asc', deadlineAt }),
    ]);
    if (gainers.dataDate !== losers.dataDate) {
      throw new Error('EODHD screener 涨跌榜交易日不一致');
    }

    const value = {
      success: true,
      source: MARKET_MOVERS_SOURCE,
      dataDate: gainers.dataDate,
      fetchedAt: new Date(now).toISOString(),
      gainers: gainers.rows,
      losers: losers.rows,
    };
    marketMoversCache = { value, expiresAt: now + MARKET_MOVERS_TTL_MS };
    return value;
  })();

  try {
    return await marketMoversInFlight;
  } finally {
    marketMoversInFlight = null;
  }
}

export function resetMarketMoversCacheForTests() {
  symbolUniverseCache = null;
  symbolUniverseInFlight = null;
  marketMoversCache = null;
  marketMoversInFlight = null;
  homeCategoryCache = new Map();
  homeCategoryInFlight = new Map();
}

export const MARKET_MOVERS_CONFIG = Object.freeze({
  limit: MARKET_MOVERS_LIMIT,
  requestBudgetMs: MARKET_MOVERS_REQUEST_BUDGET_MS,
  marketMoversTtlMs: MARKET_MOVERS_TTL_MS,
  symbolUniverseTtlMs: SYMBOL_UNIVERSE_TTL_MS,
  homeCategoryTtlMs: HOME_CATEGORY_TTL_MS,
  homeCategoryBatchSize: HOME_CATEGORY_BATCH_SIZE,
  directoryMinimumRows: Object.freeze({
    nasdaq: NASDAQ_TRADER_MIN_NASDAQ_ROWS,
    nyse: NASDAQ_TRADER_MIN_NYSE_ROWS,
    nyseAmerican: NASDAQ_TRADER_MIN_NYSE_AMERICAN_ROWS,
  }),
});
