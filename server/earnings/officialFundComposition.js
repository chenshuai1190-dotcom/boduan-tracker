export const OFFICIAL_FUND_COMPOSITION_SCHEMA_VERSION = 1;
export const OFFICIAL_FUND_COMPOSITION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_JSON_BYTES = 500_000;
const MAX_HTML_BYTES = 2_000_000;
const RESULT_CACHE_MAX_ENTRIES = 8;

const INVESCO_QQQ_PAGE_URL = 'https://www.invesco.com/qqq-etf/en/about.html';
const INVESCO_QQQ_HOLDINGS_URL = 'https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF&loadType=initial';
const INVESCO_QQQ_SECTORS_URL = 'https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/weightedHoldings/fund?idType=ticker&productType=ETF&breakdown=sector';
const PROSHARES_TQQQ_PAGE_URL = 'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq';

const FUND_DEFINITIONS = new Map([
  ['QQQ', {
    fundName: 'Invesco QQQ ETF',
    fundType: 'index-etf',
    leverageTarget: 1,
    provider: 'Invesco',
    pageUrl: INVESCO_QQQ_PAGE_URL,
  }],
  ['TQQQ', {
    fundName: 'ProShares UltraPro QQQ',
    fundType: 'leveraged-etf',
    leverageTarget: 3,
    provider: 'ProShares',
    pageUrl: PROSHARES_TQQQ_PAGE_URL,
  }],
]);

const resultCache = new Map();
const inFlightRequests = new Map();

export function isOfficialFundCompositionSupportedSymbol(symbol) {
  return FUND_DEFINITIONS.has(normalizeSymbol(symbol));
}

export async function fetchOfficialFundComposition({
  symbol,
  fetchFn = globalThis.fetch,
  now = new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const definition = FUND_DEFINITIONS.get(normalizedSymbol);
  const normalizedNow = normalizeDate(now) || new Date();
  if (!definition) {
    return responseBase({
      symbol: normalizedSymbol,
      status: 'unavailable',
      reason: 'official-fund-adapter-not-supported',
      definition: null,
      source: null,
      sections: unavailableSections('official-fund-adapter-not-supported'),
    });
  }

  const cached = readCache(normalizedSymbol, normalizedNow.getTime());
  if (cached) return cached;
  if (inFlightRequests.has(normalizedSymbol)) return inFlightRequests.get(normalizedSymbol);

  const request = fetchComposition({
    symbol: normalizedSymbol,
    definition,
    fetchFn,
    now: normalizedNow,
    timeoutMs: normalizeTimeout(timeoutMs),
  }).then((result) => {
    const ttl = result.status === 'complete'
      ? OFFICIAL_FUND_COMPOSITION_CACHE_TTL_MS
      : FAILURE_CACHE_TTL_MS;
    writeCache(normalizedSymbol, result, ttl, normalizedNow.getTime());
    return result;
  }).catch(() => {
    const unavailable = responseBase({
      symbol: normalizedSymbol,
      status: 'unavailable',
      reason: 'official-source-unavailable',
      definition,
      source: sourceMetadata(definition, normalizedNow),
      sections: unavailableSections('official-source-unavailable'),
    });
    writeCache(
      normalizedSymbol,
      unavailable,
      FAILURE_CACHE_TTL_MS,
      normalizedNow.getTime(),
    );
    return unavailable;
  }).finally(() => {
    inFlightRequests.delete(normalizedSymbol);
  });

  inFlightRequests.set(normalizedSymbol, request);
  return request;
}

export function parseInvescoQqqComposition({
  holdingsPayload,
  sectorsPayload,
} = {}) {
  const topHoldings = parseInvescoHoldings(holdingsPayload)
    || unavailableSection('official-holdings-unparsed', 'fund-holdings');
  const sectors = parseInvescoSectors(sectorsPayload)
    || unavailableSection('official-sectors-unparsed', 'fund-sector-allocation');
  return parsedComposition({ topHoldings, sectors });
}

export function parseProSharesTqqqComposition(html) {
  if (typeof html !== 'string' || html.length < 100) return null;
  if (!/<title>\s*TQQQ\s*\|\s*UltraPro QQQ\s*\|\s*ProShares\s*<\/title>/i.test(html)
    || !/\bTQQQ seeks daily investment results\b/i.test(stripHtml(html))) {
    return null;
  }

  const asOfDate = parseUsDate(
    html.match(/id=["']exposures-asOfDate["'][^>]*>\s*Index as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1],
  );
  const tabs = extractJsonArrayAfter(html, /const\s+tabs\s*=/);
  if (!asOfDate || !Array.isArray(tabs)) return null;

  const companies = tabs.find((entry) => entry?.label === 'Top 10 Index Companies')?.tableData;
  const sectorRows = tabs.find((entry) => entry?.label === 'Index Sector Weightings')?.tableData;
  const topHoldings = parseProSharesCompanies(companies, asOfDate)
    || unavailableSection('official-index-companies-unparsed', 'benchmark-index');
  const sectors = parseProSharesSectors(sectorRows, asOfDate)
    || unavailableSection('official-index-sectors-unparsed', 'benchmark-index');
  const parsed = parsedComposition({ topHoldings, sectors });
  return parsed.status === 'unavailable' ? null : parsed;
}

export function clearOfficialFundCompositionCachesForTests() {
  resultCache.clear();
  inFlightRequests.clear();
}

async function fetchComposition({
  symbol,
  definition,
  fetchFn,
  now,
  timeoutMs,
}) {
  if (typeof fetchFn !== 'function') throw new Error('fetch unavailable');
  if (symbol === 'QQQ') {
    const [holdingsResult, sectorsResult] = await Promise.allSettled([
      fetchJson(INVESCO_QQQ_HOLDINGS_URL, { fetchFn, timeoutMs }),
      fetchJson(INVESCO_QQQ_SECTORS_URL, { fetchFn, timeoutMs }),
    ]);
    const parsed = parseInvescoQqqComposition({
      holdingsPayload: holdingsResult.status === 'fulfilled' ? holdingsResult.value : null,
      sectorsPayload: sectorsResult.status === 'fulfilled' ? sectorsResult.value : null,
    });
    return responseBase({
      symbol,
      status: parsed.status,
      reason: parsed.reason,
      definition,
      source: sourceMetadata(definition, now, {
        holdingsUrl: INVESCO_QQQ_HOLDINGS_URL,
        sectorsUrl: INVESCO_QQQ_SECTORS_URL,
      }),
      sections: parsed.sections,
    });
  }

  const html = await fetchText(PROSHARES_TQQQ_PAGE_URL, {
    fetchFn,
    timeoutMs,
    maxBytes: MAX_HTML_BYTES,
    accept: 'text/html,application/xhtml+xml;q=0.9',
  });
  const parsed = parseProSharesTqqqComposition(html);
  if (!parsed) {
    return responseBase({
      symbol,
      status: 'unavailable',
      reason: 'official-page-unparsed',
      definition,
      source: sourceMetadata(definition, now),
      sections: unavailableSections('official-page-unparsed'),
    });
  }
  return responseBase({
    symbol,
    status: parsed.status,
    reason: parsed.reason,
    definition,
    source: sourceMetadata(definition, now),
    sections: parsed.sections,
  });
}

function parseInvescoHoldings(payload) {
  if (!payload
    || String(payload.cusip || '').toUpperCase() !== 'QQQ'
    || !validDateKey(payload.effectiveDate)
    || !Array.isArray(payload.holdings)
    || payload.holdings.length < 10) {
    return null;
  }
  const items = payload.holdings.map((holding) => {
    const ticker = normalizeSymbol(holding?.ticker);
    const name = cleanLabel(holding?.issuerName);
    const weightPercent = finiteWeight(holding?.percentageOfTotalNetAssets);
    if (!/^[A-Z0-9.-]{1,15}$/.test(ticker) || !name || weightPercent === null) return null;
    return {
      ticker,
      name,
      weightPercent,
      securityType: cleanLabel(holding?.securityTypeName) || null,
    };
  });
  if (items.some((item) => !item) || !uniqueBy(items, (item) => item.ticker)) return null;
  const topTen = items
    .sort((a, b) => b.weightPercent - a.weightPercent)
    .slice(0, 10)
    .map((item, index) => ({ rank: index + 1, ...item }));
  if (topTen.length !== 10) return null;

  const totalHoldings = Number(payload.totalNumberOfHoldings);
  return {
    status: 'complete',
    reason: null,
    label: 'Top 10 holdings',
    basis: 'fund-holdings',
    asOfDate: payload.effectiveDate,
    totalHoldings: Number.isInteger(totalHoldings) && totalHoldings >= topTen.length
      ? totalHoldings
      : null,
    items: topTen,
  };
}

function parseInvescoSectors(payload) {
  if (!payload
    || String(payload.cusip || '').toUpperCase() !== 'QQQ'
    || !validDateKey(payload.effectiveDate)
    || !Array.isArray(payload.holdingWeights)) {
    return null;
  }
  const items = payload.holdingWeights.map((row) => {
    const name = cleanLabel(row?.name);
    const weightPercent = finiteWeight(row?.value);
    return name && weightPercent !== null ? { name, weightPercent } : null;
  });
  if (!validSectorItems(items)) return null;
  return {
    status: 'complete',
    reason: null,
    label: 'Sector allocation',
    basis: 'fund-sector-allocation',
    asOfDate: payload.effectiveDate,
    items: items.sort((a, b) => b.weightPercent - a.weightPercent),
  };
}

function parseProSharesCompanies(rows, asOfDate) {
  if (!Array.isArray(rows) || rows.length !== 10) return null;
  const items = rows.map((row) => {
    const name = cleanLabel(row?.Company);
    const weightPercent = finiteWeight(row?.Weight);
    return name && weightPercent !== null ? { name, weightPercent } : null;
  });
  if (items.some((item) => !item) || !uniqueBy(items, (item) => item.name)) return null;
  return {
    status: 'complete',
    reason: null,
    label: 'Top 10 index companies',
    basis: 'benchmark-index',
    asOfDate,
    items: items
      .sort((a, b) => b.weightPercent - a.weightPercent)
      .map((item, index) => ({ rank: index + 1, ...item })),
  };
}

function parseProSharesSectors(rows, asOfDate) {
  if (!Array.isArray(rows)) return null;
  const items = rows.map((row) => {
    const name = cleanLabel(row?.Sector);
    const weightPercent = finiteWeight(row?.Weight);
    return name && weightPercent !== null ? { name, weightPercent } : null;
  });
  if (!validSectorItems(items)) return null;
  return {
    status: 'complete',
    reason: null,
    label: 'Index sector weightings',
    basis: 'benchmark-index',
    asOfDate,
    items: items.sort((a, b) => b.weightPercent - a.weightPercent),
  };
}

function parsedComposition({ topHoldings, sectors }) {
  const completeCount = [topHoldings, sectors]
    .filter((section) => section.status === 'complete')
    .length;
  return {
    status: completeCount === 2 ? 'complete' : completeCount === 1 ? 'partial' : 'unavailable',
    reason: completeCount === 2
      ? null
      : completeCount === 1
        ? 'one-or-more-sections-unavailable'
        : 'official-composition-unavailable',
    sections: { topHoldings, sectors },
  };
}

function responseBase({
  symbol,
  status,
  reason,
  definition,
  source,
  sections,
}) {
  return {
    schemaVersion: OFFICIAL_FUND_COMPOSITION_SCHEMA_VERSION,
    kind: 'fund-composition',
    status,
    reason,
    symbol,
    fundName: definition?.fundName || null,
    fundType: definition?.fundType || null,
    leverageTarget: definition?.leverageTarget || null,
    source,
    sections,
  };
}

function sourceMetadata(definition, now, extra = {}) {
  return {
    provider: definition.provider,
    official: true,
    pageUrl: definition.pageUrl,
    retrievedAt: now.toISOString(),
    ...extra,
  };
}

function unavailableSections(reason) {
  return {
    topHoldings: unavailableSection(reason, null),
    sectors: unavailableSection(reason, null),
  };
}

function unavailableSection(reason, basis) {
  return {
    status: 'unavailable',
    reason,
    label: null,
    basis,
    asOfDate: null,
    items: [],
  };
}

async function fetchJson(url, options) {
  const text = await fetchText(url, {
    ...options,
    maxBytes: MAX_JSON_BYTES,
    accept: 'application/json',
  });
  return JSON.parse(text);
}

async function fetchText(url, {
  fetchFn,
  timeoutMs,
  maxBytes,
  accept,
}) {
  const controller = new AbortController();
  let timeoutId;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchFn(url, {
          headers: {
            Accept: accept,
            'User-Agent': process.env.FUND_DATA_USER_AGENT || 'BoduanTracker/1.0',
          },
          signal: controller.signal,
        });
        if (!response?.ok) throw new Error(`Official fund source HTTP ${response?.status || 0}`);
        const contentLength = Number(response.headers?.get?.('content-length') || 0);
        if (contentLength > maxBytes) throw new Error('Official fund source response too large');
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
          throw new Error('Official fund source response too large');
        }
        return text;
      })(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('Official fund source request timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractJsonArrayAfter(text, markerPattern) {
  const marker = text.search(markerPattern);
  if (marker < 0) return null;
  const start = text.indexOf('[', marker);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '[') depth += 1;
    if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function validSectorItems(items) {
  if (!Array.isArray(items)
    || items.length < 5
    || items.length > 20
    || items.some((item) => !item)
    || !uniqueBy(items, (item) => item.name)) {
    return false;
  }
  const total = items.reduce((sum, item) => sum + item.weightPercent, 0);
  return total >= 99 && total <= 101;
}

function uniqueBy(items, selector) {
  return new Set(items.map(selector)).size === items.length;
}

function finiteWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 100 ? numeric : null;
}

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const key = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return validDateKey(key) ? key : '';
}

function validDateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTimeout(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 25 && numeric <= 15_000
    ? numeric
    : REQUEST_TIMEOUT_MS;
}

function readCache(key, nowMs) {
  const entry = resultCache.get(key);
  if (!entry || entry.expiresAt <= nowMs) {
    if (entry) resultCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, ttlMs, nowMs) {
  if (!resultCache.has(key)) {
    while (resultCache.size >= RESULT_CACHE_MAX_ENTRIES) {
      const oldest = resultCache.keys().next().value;
      if (oldest === undefined) break;
      resultCache.delete(oldest);
    }
  }
  resultCache.set(key, {
    value,
    expiresAt: nowMs + ttlMs,
  });
}
