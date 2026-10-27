import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  buildStockComparisonRows, fetchStockComparison, normalizeStockComparisonSymbols,
  normalizeStockComparisonDates, resetStockComparisonCacheForTests, addStockComparisonRsi,
} from '../server/quote/stockComparison.js';
import { resetInvestmentComparisonCacheForTests } from '../server/quote/investmentComparison.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';
import { wilderRsiSeries } from '../src/lib/wilderRsi.js';

const NOW = Date.parse('2026-10-27T10:00:00Z');
const RANGE = { from: '2026-10-19', to: '2026-10-23', splitBasisDate: '2026-10-26' };
const DATES = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });
const identity = (symbol, overrides = {}) => ({
  Code: symbol, Name: `${symbol} Fund`, Exchange: 'US', Currency: 'USD', Country: 'USA', Type: 'ETF', ...overrides,
});
const rows = (offset = 0) => DATES.map((date, index) => ({ date, close: 100 + offset + index, adjusted_close: 12 + index }));
const isCode = (code) => (cause) => cause.code === code;
const options = (fetchImpl, overrides = {}) => ({ ...RANGE, eodhdKey: 'secret-test-key', now: NOW, fetchImpl, ...overrides });
function reset() { resetStockComparisonCacheForTests(); resetInvestmentComparisonCacheForTests(); }
beforeEach(reset);
afterEach(reset);

function provider({ calls = [], prices, splits, search, delay = false, concurrency } = {}) {
  return async (input, init) => {
    const url = new URL(input);
    const symbol = decodeURIComponent(url.pathname.split('/').at(-1)).replace(/\.US$/, '');
    calls.push(url);
    assert.ok(init.signal instanceof AbortSignal);
    if (url.pathname.startsWith('/api/search/')) return search ? search(symbol, url) : response([identity(symbol)]);
    if (concurrency) { concurrency.current += 1; concurrency.max = Math.max(concurrency.max, concurrency.current); }
    if (delay) await new Promise(resolve => setTimeout(resolve, 5));
    try {
      if (url.pathname.startsWith('/api/eod/')) return prices ? prices(symbol, url) : response(rows(symbol === 'TQQQ' ? 100 : 0));
      assert.match(url.pathname, /^\/api\/splits\//);
      return splits ? splits(symbol, url) : response([]);
    } finally { if (concurrency) concurrency.current -= 1; }
  };
}

test('stock comparison accepts two to four unique US symbols and exact real date ranges', () => {
  assert.deepEqual(normalizeStockComparisonSymbols(' qqq , tqqq, nvda ,brk-b'), ['QQQ', 'TQQQ', 'NVDA', 'BRK-B']);
  for (const input of [undefined, 'QQQ', 'QQQ,QQQ', 'QQQ,qqq', 'QQQ,TQQQ,NVDA,SPY,SMH', 'QQQ,^VIX', 'QQQ,SPY.US', ['QQQ,TQQQ'], 'QQQ,,SMH', 'QQQ,A..B']) {
    assert.throws(() => normalizeStockComparisonSymbols(input), isCode('INVALID_SYMBOLS'));
  }
  assert.deepEqual(normalizeStockComparisonDates('2026-10-24', '2026-10-25', '2026-10-26'), { from: '2026-10-24', to: '2026-10-25' });
  assert.deepEqual(normalizeStockComparisonDates('2026-10-23', '2026-10-23', '2026-10-26'), { from: '2026-10-23', to: '2026-10-23' });
  for (const [from, to] of [['2026-02-30', '2026-03-03'], ['1999-12-31', '2026-10-23'], ['2026-10-23', '2026-10-22'], ['2026-10-23', '2026-10-27'], [[], '2026-10-23'], ['2026-1-1', '2026-10-23']]) {
    assert.throws(() => normalizeStockComparisonDates(from, to, '2026-10-26'), isCode('INVALID_DATES'));
  }
});

test('only raw close and subsequent split actions set price basis; dividends and leverage are never added', async () => {
  const input = [
    { date: '2026-10-19', close: 100, adjusted_close: 22 },
    { date: '2026-10-20', close: 55, adjusted_close: 24 },
    { date: '2026-10-23', close: 60, adjusted_close: 25 },
  ];
  const actions = [{ date: '2026-10-20', split: '2/1' }, { date: '2026-10-26', split: '2/1' }];
  const parsed = buildStockComparisonRows(input, actions, RANGE);
  assert.deepEqual(parsed.map(row => row.close), [25, 27.5, 30]);
  assert.equal(parsed.at(-1).close / parsed[0].close - 1, 0.19999999999999996);
  const calls = [];
  const result = await fetchStockComparison('QQQ,TQQQ', options(provider({ calls, prices: () => response(input), splits: () => response(actions) })));
  assert.deepEqual(result.series.TQQQ.rows, parsed.map(row => ({ ...row, rsi6: null })), 'TQQQ market prices receive no additional ×3 leverage');
  assert.deepEqual(result.series.QQQ.rows, parsed.map(row => ({ ...row, rsi6: null })));
  assert.equal(result.priceBasis, 'split_adjusted_close');
  assert.equal(result.source, 'EODHD_EOD_SPLITS');
  assert.equal(result.splitBasisDate, '2026-10-26');
  assert.ok(calls.filter(url => url.pathname.includes('/eod/')).every(url => url.searchParams.get('to') === '2026-10-23'));
  assert.ok(calls.filter(url => url.pathname.includes('/splits/')).every(url => url.searchParams.get('to') === '2026-10-26'));
  assert.ok(calls.filter(url => /\/(eod|splits)\//.test(url.pathname)).every(url => url.searchParams.get('from') === '2025-10-04'));
});

test('reverse splits and identical duplicate actions are applied once; conflicts and malformed data fail closed', () => {
  const split = { date: '2026-10-20', split: '1/2' };
  assert.equal(buildStockComparisonRows(rows(), [split, split], RANGE)[0].close, 200);
  for (const actions of [null, {}, [{ date: '2026-10-20', split: '2/0' }], [{ date: '2026-10-20', split: '1/0.0' }], [{ date: '2026-10-20', split: '0/1' }], [split, { ...split, split: '2/1' }], [{ date: '2026-02-30', split: '2/1' }], [{ date: '2026-10-27', split: '2/1' }], [{ date: '2026-10-20', split: 2 }], [{ date: '2026-10-20', split: '2/1junk' }]]) {
    assert.throws(() => buildStockComparisonRows(rows(), actions, RANGE), isCode('INVALID_DATA'));
  }
  for (const close of [undefined, null, '', false, [], {}, 0, -1, NaN, Infinity, '12oops']) {
    const input = rows(); input[1].close = close;
    assert.throws(() => buildStockComparisonRows(input, [], RANGE), isCode('INVALID_DATA'));
  }
  for (const input of [null, {}, [...rows(), { date: '2026-10-20', close: 500 }], [...rows(), { date: '2026-10-24', close: 100 }], [...rows(), { date: '2026-10-18', close: 100 }], [...rows(), { date: '2026-02-30', close: 100 }]]) {
    assert.throws(() => buildStockComparisonRows(input, [], RANGE), isCode('INVALID_DATA'));
  }
  assert.throws(() => buildStockComparisonRows([], [], RANGE), isCode('NO_DATA'));
  assert.deepEqual(buildStockComparisonRows([rows()[0], rows()[0]], [], RANGE), [{ date: DATES[0], close: 100 }]);
});

test('one-point ranges and sparse daily data stay observed; series remain separate', async () => {
  const result = await fetchStockComparison(['QQQ', 'TQQQ', 'NVDA', 'SMH'], options(provider({
    prices: (symbol) => response(symbol === 'TQQQ' ? rows(100).filter((_, i) => i !== 1 && i !== 4) : rows()),
  })));
  assert.equal(result.asOfDate, DATES[3]);
  assert.equal(result.series.QQQ.rows.length, 5);
  assert.deepEqual(result.series.TQQQ.rows.map(row => row.date), [DATES[0], DATES[2], DATES[3]]);
  assert.equal(result.series.TQQQ.rows[0].close, 200);
  reset();
  const single = await fetchStockComparison('QQQ,TQQQ', options(provider({ prices: () => response([rows()[0]]) }), { from: DATES[0], to: DATES[0] }));
  assert.equal(single.series.QQQ.rows.length, 1);
  assert.equal(single.asOfDate, DATES[0]);
});

test('identities must all be verified USD ordinary stock or ETF before price history fetch', async () => {
  for (const row of [identity('SMH'), identity('TQQQ', { Currency: 'CNY' }), identity('TQQQ', { Type: 'Index' }), identity('TQQQ', { Exchange: 'LSE' }), identity('TQQQ', { Country: 'Canada' })]) {
    reset();
    const calls = [];
    await assert.rejects(fetchStockComparison('QQQ,TQQQ', options(provider({ calls, search: symbol => response([symbol === 'TQQQ' ? row : identity(symbol)]) }))), isCode('UNSUPPORTED_INSTRUMENT'));
    assert.equal(calls.filter(url => url.pathname.includes('/eod/')).length, 0);
  }
});

test('concurrent requests single-flight per symbol/range/basis with at most two symbol loads (four payload requests)', async () => {
  const calls = []; const concurrency = { current: 0, max: 0 };
  const fetchImpl = provider({ calls, concurrency, delay: true });
  const values = await Promise.all([
    fetchStockComparison('QQQ,TQQQ,NVDA,SMH', options(fetchImpl)),
    fetchStockComparison('QQQ,TQQQ', options(fetchImpl)),
  ]);
  assert.equal(calls.filter(url => url.pathname.includes('/eod/')).length, 4);
  assert.equal(calls.filter(url => url.pathname.includes('/splits/')).length, 4);
  assert.ok(concurrency.max <= 4);
  assert.deepEqual(values[0].series.TQQQ, values[1].series.TQQQ);
  await fetchStockComparison('QQQ,TQQQ', options(fetchImpl));
  assert.equal(calls.filter(url => url.pathname.includes('/eod/')).length, 4, 'fresh cache reused');
  const later = NOW + 24 * 60 * 60 * 1000;
  await fetchStockComparison('QQQ,TQQQ', options(fetchImpl, { now: later }));
  assert.equal(calls.filter(url => url.pathname.includes('/eod/')).length, 6, 'a new split basis never reuses stale adjustment factors');
});

test('provider failure is sanitized and cached briefly; no adjusted-close, old or simulated fallback', async () => {
  const calls = [];
  const fetchImpl = provider({ calls, prices: () => { throw new Error('https://eodhd.com/api/eod/QQQ?api_token=secret-test-key'); } });
  await assert.rejects(fetchStockComparison('QQQ,TQQQ', options(fetchImpl)), (cause) => {
    assert.equal(cause.code, 'PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(cause.message, /secret-test-key|https:/);
    return true;
  });
  const before = calls.length;
  await assert.rejects(fetchStockComparison('QQQ,TQQQ', options(fetchImpl)), isCode('PROVIDER_UNAVAILABLE'));
  assert.equal(calls.length, before);
  reset();
  await assert.rejects(fetchStockComparison('QQQ,TQQQ', options(provider({ splits: () => response({ error: 'bad key' }, 402) }))), isCode('QUOTA_EXHAUSTED'));
  reset();
  await assert.rejects(fetchStockComparison('QQQ,TQQQ', options(provider({ prices: () => response(rows().map(({ close, ...row }) => row)) }))), isCode('INVALID_DATA'));
});

test('range cache is isolated and incomplete close refreshes after five minutes rather than hiding new daily bars', async () => {
  const calls = [];
  let complete = false;
  const fetchImpl = provider({ calls, prices: (_, url) => response(rows().filter(row => row.date >= url.searchParams.get('from')
    && row.date <= url.searchParams.get('to') && (complete || row.date !== DATES.at(-1)))) });
  const first = await fetchStockComparison('QQQ,TQQQ', options(fetchImpl));
  assert.equal(first.asOfDate, DATES[3]);
  complete = true;
  const cached = await fetchStockComparison('QQQ,TQQQ', options(fetchImpl, { now: NOW + 60_000 }));
  assert.equal(cached.asOfDate, DATES[3]);
  const refreshed = await fetchStockComparison('QQQ,TQQQ', options(fetchImpl, { now: NOW + 300_001 }));
  assert.equal(refreshed.asOfDate, DATES[4]);
  assert.equal(calls.filter(url => url.pathname.includes('/eod/')).length, 4);
  const narrowed = await fetchStockComparison('QQQ,TQQQ', options(fetchImpl, { from: DATES[1], now: NOW + 300_001 }));
  assert.equal(narrowed.series.QQQ.rows[0].date, DATES[1]);
  assert.equal(calls.filter(url => url.pathname.includes('/eod/')).length, 6);
});

function calendarRows(from = '2025-01-01', to = '2026-10-23', priceAt = index => 100 + index * 0.04 + Math.sin(index * 0.7) * 4) {
  const result = [];
  const specialClosures = new Set(['2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14',
    '2004-06-11', '2007-01-02', '2012-10-29', '2012-10-30', '2018-12-05', '2025-01-09']);
  const cursor = new Date(`${from}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= to) {
    const date = cursor.toISOString().slice(0, 10);
    if (![0, 6].includes(cursor.getUTCDay()) && !isRegularNyseHoliday(date) && !specialClosures.has(date)) {
      const close = priceAt(result.length);
      result.push({ date, close: close * 2, adjusted_close: close });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function historyProvider(history, calls = [], actions = []) {
  return provider({ calls,
    prices: (_, url) => response(history.filter(row => row.date >= url.searchParams.get('from') && row.date <= url.searchParams.get('to'))),
    splits: (_, url) => response(actions.filter(action => action.date >= url.searchParams.get('from') && action.date <= url.searchParams.get('to'))),
  });
}

test('historical RSI uses pre-start warmup, shared Wilder RSI6 and adjusted-close metadata while returning only requested prices', async () => {
  const history = calendarRows(); const calls = [];
  const data = await fetchStockComparison('QQQ,TQQQ', options(historyProvider(history, calls)));
  const series = data.series.QQQ;
  assert.equal(series.rsiPeriod, 6);
  assert.equal(series.rsiPriceBasis, 'adjusted_close');
  assert.deepEqual(series.rows.map(row => row.date), DATES, 'warmup is not exposed as the comparison interval');
  assert.ok(series.rows.every(row => Number.isFinite(row.rsi6)));
  assert.ok(calls.filter(url => /\/(eod|splits)\//.test(url.pathname)).every(url => url.searchParams.get('from') === '2025-10-04'));
  const warmup = history.filter(row => row.date >= '2025-10-04' && row.date <= DATES[0]);
  const expected = wilderRsiSeries(warmup.map(row => ({ date: row.date, close: row.adjusted_close })), 6).at(-1);
  assert.equal(series.rows[0].rsi6, expected);
  assert.equal(series.rows[0].close, history.find(row => row.date === DATES[0]).close);
});

test('same historical date has identical RSI across selected chart ranges and excludes future observations', async () => {
  const history = calendarRows(); const fetchImpl = historyProvider(history);
  const wide = await fetchStockComparison('QQQ,TQQQ', options(fetchImpl, { from: '2026-05-01' }));
  const narrow = await fetchStockComparison('QQQ,TQQQ', options(fetchImpl, { from: '2026-10-21' }));
  assert.equal(wide.series.QQQ.rows.find(row => row.date === '2026-10-21').rsi6, narrow.series.QQQ.rows[0].rsi6);
  const selected = history.filter(row => row.date >= DATES[0]).map(({ date, close }) => ({ date, close }));
  const prior = addStockComparisonRsi(selected, history);
  const modified = history.map(row => row.date > '2026-10-21' ? { ...row, adjusted_close: row.date === '2026-10-22' ? null : 1e8 } : row);
  const after = addStockComparisonRsi(selected, modified);
  assert.deepEqual(after.slice(0, 3), prior.slice(0, 3), 'future invalid or extreme prices cannot change earlier RSI');
  assert.equal(after[3].rsi6, null);
});

test('split does not create a false RSI crash and adjusted-close RSI is not split-adjusted a second time', async () => {
  const history = calendarRows('2026-06-01', '2026-10-23', index => 100 + index);
  const splitDate = '2026-10-20';
  for (const row of history) row.close = row.adjusted_close * (row.date < splitDate ? 2 : 1);
  const data = await fetchStockComparison('QQQ,TQQQ', options(historyProvider(history, [], [{ date: splitDate, split: '2/1' }])));
  assert.ok(data.series.TQQQ.rows.every(row => row.rsi6 === 100));
  assert.ok(data.series.TQQQ.rows.every(row => row.close === history.find(point => point.date === row.date).adjusted_close));
});

test('short, invalid or internally missing adjusted history yields null RSI without suppressing valid prices', async () => {
  const history = calendarRows();
  const selected = history.filter(row => row.date >= DATES[0]).map(({ date, close }) => ({ date, close }));
  for (const invalid of [undefined, null, '', false, [], {}, '0x64', '12bad', 0, -1, Infinity]) {
    const damaged = history.map(row => row.date === '2026-10-16' ? { ...row, adjusted_close: invalid } : row);
    const result = addStockComparisonRsi(selected, damaged);
    assert.ok(result.every(row => row.rsi6 === null));
    assert.deepEqual(result.map(({ rsi6, ...row }) => row), selected);
  }
  const missing = history.filter(row => row.date !== '2026-10-16');
  const data = await fetchStockComparison('QQQ,TQQQ', options(historyProvider(missing)));
  assert.ok(data.series.QQQ.rows.every(row => row.rsi6 === null));
  assert.deepEqual(data.series.QQQ.rows.map(({ rsi6, ...row }) => row), selected);
  const last59 = history.slice(-59);
  assert.equal(addStockComparisonRsi([selected.at(-1)], last59)[0].rsi6, null);
  const last60 = history.slice(-60);
  assert.ok(Number.isFinite(addStockComparisonRsi([selected.at(-1)], last60)[0].rsi6));
  const conflict = [...history, { ...history.find(row => row.date === '2026-10-16'), adjusted_close: 999 }];
  assert.ok(addStockComparisonRsi(selected, conflict).every(row => row.rsi6 === null));
});

test('RSI warmup respects the 2000 floor and holidays do not count as missing sessions', async () => {
  const history = calendarRows('2000-01-01', '2000-05-01', index => 100 + index); const calls = [];
  const data = await fetchStockComparison('QQQ,TQQQ', options(historyProvider(history, calls), { from: '2000-05-01', to: '2000-05-01' }));
  assert.equal(data.series.QQQ.rows[0].rsi6, 100);
  assert.ok(calls.filter(url => /\/(eod|splits)\//.test(url.pathname)).every(url => url.searchParams.get('from') === '2000-01-01'));
});

test('documented exceptional market closures since 2000 are not missing RSI sessions; real missing trading days still fail closed', async () => {
  for (const date of ['2001-09-17', '2004-06-14', '2007-01-03', '2012-10-31', '2018-12-06', '2025-01-10']) {
    const history = calendarRows(`${Number(date.slice(0, 4)) - 1}-01-01`, date, index => 100 + index);
    const row = history.at(-1);
    assert.equal(addStockComparisonRsi([{ date, close: row.close }], history)[0].rsi6, 100, date);
  }
  const history = calendarRows('2024-01-01', '2025-01-10', index => 100 + index);
  const data = await fetchStockComparison('QQQ,TQQQ', options(historyProvider(history), { from: '2025-01-10', to: '2025-01-10' }));
  assert.equal(data.series.QQQ.rows[0].rsi6, 100, 'Carter closure is accepted through the complete backend path');
  const missing = history.filter(row => row.date !== '2025-01-08');
  assert.equal(addStockComparisonRsi([{ date: '2025-01-10', close: history.at(-1).close }], missing)[0].rsi6, null);
});
