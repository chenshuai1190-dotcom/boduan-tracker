import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchStockQuote } from '../server/quote/providers/eodhd.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';
import { isRegularNyseHoliday, mergeQuoteBaselineRows } from '../src/lib/quoteRefreshPolicy.js';
import { mergeFreshStockRealtimeRows, mergeStockTicksIntoQuoteRows } from '../src/lib/stockRealtime.js';

const now = Date.parse('2026-09-11T15:00:00Z');
const signal = {
  period: 6, value: 82.6, asOf: '2026-09-10', priceBasis: 'adjusted_close',
  bearishDivergence: 'confirmed', divergenceDate: '2026-09-09',
};

// Exercise App's real REST projection before the shared cache/universe helpers.
// A provider-only test would miss a new field dropped by that explicit mapping.
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const projectionStart = appSource.indexOf('const updatedQuotes = rowsForQuote.map(s => {');
const projectionEnd = appSource.indexOf('setQuoteCache((current) => {', projectionStart);
assert.ok(projectionStart >= 0 && projectionEnd > projectionStart);
const projectRestRows = new Function('rowsForQuote', 'resultBySymbol', 'normalizeExternalLogoUrl',
  `${appSource.slice(projectionStart, projectionEnd)}\nreturn updatedQuotes;`);

function refreshAppCache(current, responses, rowsForQuote = current) {
  const projected = projectRestRows(rowsForQuote,
    new Map(responses.map(row => [String(row.symbol).toUpperCase(), row])), value => value);
  return mergeFreshStockRealtimeRows(mergeQuoteBaselineRows(current, projected), current, { now });
}

function completedDailyRows(count = 180) {
  const dates = [];
  const day = new Date('2026-09-10T00:00:00Z');
  while (dates.length < count) {
    const date = day.toISOString().slice(0, 10);
    if (![0, 6].includes(day.getUTCDay()) && !isRegularNyseHoliday(date)) dates.unshift(date);
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return dates.map((date, index) => {
    const adjustedClose = Number((100 + index * 0.23 + 6 * Math.sin(index / 7) + 1.1 * Math.cos(index / 3)).toFixed(6));
    const close = adjustedClose * (index < 80 ? 5 : 1);
    return { date, close, adjusted_close: adjustedClose, high: close * 1.01, low: close * 0.99, volume: 12_000_000 };
  });
}

async function providerQuote(eodRows, { clock = now, historyStatus = 200 } = {}) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const requests = [];
  const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
  Date.now = () => clock;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    requests.push({ host: parsed.hostname, path: parsed.pathname, from: parsed.searchParams.get('from') });
    if (parsed.pathname === '/api/us-quote-delayed') return response({ data: { 'NVDA.US': {
      lastTradePrice: '145.25', ethPrice: '145.25', previousClosePrice: '142.618815', timestamp: clock / 1000,
    } } });
    if (parsed.pathname === '/api/eod/NVDA.US') return response(eodRows, historyStatus);
    if (parsed.hostname === 'query1.finance.yahoo.com') return response({ chart: { result: [] } });
    throw new Error('Unexpected provider request in RSI integration');
  };
  try {
    const quote = await fetchStockQuote('NVDA', { eodhdKey: 'mock-only' });
    assert.equal(requests.length, 3, 'RSI must reuse the existing quote, EOD and intraday requests');
    assert.deepEqual(requests.map(request => request.path).sort(), [
      '/api/eod/NVDA.US', '/api/us-quote-delayed', '/v8/finance/chart/NVDA',
    ]);
    assert.equal(requests.filter(request => request.path.includes('/technical')).length, 0);
    const expectedStart = new Date(clock);
    expectedStart.setUTCDate(expectedStart.getUTCDate() - 380);
    assert.equal(requests.find(request => request.path.includes('/api/eod/')).from, expectedStart.toISOString().slice(0, 10),
      'the homepage indicator must not expand the ordinary quote history window');
    assert.equal(quote.error, undefined);
    return quote;
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

test('ordinary provider quote calculates RSI from existing adjusted daily closes without extra requests', async () => {
  const rows = completedDailyRows();
  const quote = await providerQuote(rows);
  assert.equal(quote.stockRsi?.period, 6);
  assert.equal(quote.stockRsi?.asOf, '2026-09-10');
  assert.equal(quote.stockRsi?.priceBasis, 'adjusted_close');
  // Independently calculated Wilder(6) result for the deterministic 180-close fixture.
  assert.ok(Math.abs(quote.stockRsi.value - 97.22502669309888) < 1e-9);
  assert.ok(['none', 'confirmed'].includes(quote.stockRsi.bearishDivergence));
  assert.equal(quote.price, 145.25);
  assert.equal(quote.dailyPnlBaselineClose, rows.at(-1).adjusted_close);
  assert.equal(quote.dailyPnlPrice, 145.25);
  assert.equal(quote.dailyPnlLocked, false);
});

test('premarket and regular quotes exclude the unfinished market-day bar from RSI', async () => {
  const rows = completedDailyRows();
  const completed = await providerQuote(rows);
  const unfinished = { date: '2026-09-11', adjusted_close: 9999, close: 9999, high: 10_000, low: 100 };
  for (const clock of [Date.parse('2026-09-11T12:00:00Z'), now]) {
    const quote = await providerQuote([...rows, unfinished], { clock });
    assert.deepEqual(quote.stockRsi, completed.stockRsi,
      'intraday price changes must not rewrite a completed-daily indicator');
    assert.equal(quote.price, 145.25);
  }
});

test('unavailable or malformed indicator history never hides the valid quote or existing daily PnL', async () => {
  const rows = completedDailyRows();
  const malformed = rows.map((row, index) => index === rows.length - 1 ? { ...row, adjusted_close: 'bad-data' } : row);
  for (const [payload, historyStatus] of [[[], 200], [{ error: 'unavailable' }, 200], [null, 503], [malformed, 200]]) {
    const quote = await providerQuote(payload, { historyStatus });
    assert.equal(quote.stockRsi?.value ?? null, null, 'missing data cannot become an RSI number');
    assert.notEqual(quote.stockRsi?.bearishDivergence, 'none', 'missing history cannot assert no divergence');
    assert.equal(quote.price, 145.25);
    assert.equal(quote.previousClose, 142.618815);
    assert.equal(quote.dailyPnlPrice, 145.25);
    assert.equal(quote.dailyPnlBaselineClose, 142.618815);
    assert.equal(quote.dailyPnlLocked, false);
  }
});

test('RSI survives actual App REST projection, cache, live ticks and the home watchlist universe', () => {
  const trades = [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-01', shares: 10, price: 150 }];
  const watchlist = [{ symbol: 'NVDA', name: 'NVIDIA', price: 90 }];
  const fresh = { symbol: 'NVDA', price: 120, previousClose: 110, dailyBaselineClose: 110,
    dailyBaselineDate: '2026-09-10', stockRsi: signal };
  const cached = refreshAppCache([], [fresh], watchlist);
  assert.deepEqual(cached[0].stockRsi, signal, 'the explicit App projection must carry RSI metadata');
  const updated = mergeStockTicksIntoQuoteRows(cached,
    [{ symbol: 'NVDA', price: 125, timestamp: now, source: 'EODHD_WS' }], 'live', cached, { now });
  const { allRows, watchlistRows } = buildLedgerQuoteUniverse(trades, watchlist, updated);
  assert.equal(watchlistRows[0].price, 125);
  assert.deepEqual(watchlistRows[0].stockRsi, signal, 'a price tick cannot rewrite a daily indicator');
  const summary = deriveInvestmentSummary({ stockTrades: trades, watchlist: allRows });
  assert.equal(summary.activePositions[0].holdingPnl, -250);
  assert.deepEqual(summary, deriveInvestmentSummary({
    stockTrades: trades, watchlist: allRows.map(({ stockRsi, ...row }) => row),
  }), 'display-only indicator metadata must not alter asset totals or personal returns');
});

test('new REST RSI replaces cached metadata while the newer websocket price keeps precedence', () => {
  for (const cachedSignal of [null, { ...signal, value: 55, asOf: '2026-09-09' }]) {
    const current = { symbol: 'NVDA', price: 125, previousClose: 110, dailyBaselineClose: 110,
      dailyBaselineDate: '2026-09-10', realtime: true, realtimeAt: now, clientReceivedAt: now,
      source: 'EODHD_WS', stockRsi: cachedSignal };
    const [merged] = refreshAppCache([current], [{ ...current, price: 120, stockRsi: signal }]);
    assert.equal(merged.price, 125, 'RSI must not change the existing realtime price precedence');
    assert.deepEqual(merged.stockRsi, signal);
  }
});

test('a successful REST quote with missing RSI clears an old signal without gating the financial summary', () => {
  const trades = [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-01', shares: 10, price: 150 }];
  const current = { symbol: 'NVDA', price: 125, previousClose: 110, dailyBaselineClose: 110,
    dailyBaselineDate: '2026-09-10', realtime: true, realtimeAt: now, clientReceivedAt: now,
    source: 'EODHD_WS', stockRsi: signal };
  for (const stockRsi of [null, undefined]) {
    const [merged] = refreshAppCache([current], [{ ...current, price: 120, stockRsi }]);
    assert.equal(merged.stockRsi, null, 'a valid quote with unavailable history cannot retain an old RSI as current');
    assert.equal(merged.price, 125);
    assert.equal(merged.previousClose, 110);
    const { allRows } = buildLedgerQuoteUniverse(trades, [], [merged]);
    assert.deepEqual(deriveInvestmentSummary({ stockTrades: trades, watchlist: allRows }),
      deriveInvestmentSummary({ stockTrades: trades, watchlist: allRows.map(({ stockRsi: ignored, ...row }) => row) }));
  }
});

test('Home prepares the watchlist row signal independently of holding metadata and startup readiness', () => {
  const source = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
  assert.match(source, /stockRsi:\s*isPosition\s*\?\s*null\s*:\s*row\.stockRsi\s*\?\?\s*null/,
    'an active position overlay must not shadow the real watchlist daily indicator');
  assert.doesNotMatch(source, /(?:header|summary|bootstrap|ready|loading)\w*\s*[:=][^;\n]*stockRsi/i);
  const cache = readFileSync(new URL('../src/lib/stockQuoteBootstrapCache.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cache, /stockRsi|bearishDivergence/,
    'this indicator must not broaden the restored header bootstrap cache contract');
});
