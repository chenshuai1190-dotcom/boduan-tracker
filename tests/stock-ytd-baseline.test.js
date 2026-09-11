import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockYtdBaseline, fetchStockQuote } from '../server/quote/providers/eodhd.js';

test('stock YTD requires the prior year final exchange close, rather than the first close this year', () => {
  const rows = [
    { date: '2026-01-02', close: 110, adjusted_close: 110 },
    { date: '2025-12-30', close: 90, adjusted_close: 90 },
    { date: '2025-12-31', close: 100, adjusted_close: 100 },
  ];
  const original = JSON.stringify(rows);
  assert.deepEqual(buildStockYtdBaseline(rows, '2026-09-11'), {
    year: 2026, date: '2025-12-31', close: 100, source: 'eodhd-adjusted-close',
  });
  assert.equal(JSON.stringify(rows), original);
  assert.equal(buildStockYtdBaseline(rows.filter(row => row.date !== '2025-12-31'), '2026-09-11'), null);
  assert.equal(buildStockYtdBaseline([{ date: '2026-01-02', adjusted_close: 110 }], '2026-09-11'), null);
});

test('stock YTD preserves the provider adjusted close for split-adjusted comparisons without falling back to raw close', () => {
  assert.deepEqual(buildStockYtdBaseline([{ date: '2025-12-31', close: 400, adjusted_close: '100.25' }], '2026-06-01'), {
    year: 2026, date: '2025-12-31', close: 100.25, source: 'eodhd-adjusted-close',
  });
  for (const adjusted_close of [undefined, null, '', ' ', 0, -10, NaN, Infinity, true, false, {}, [], '100oops', '0x10']) {
    assert.equal(buildStockYtdBaseline([{ date: '2025-12-31', close: 400, adjusted_close }], '2026-06-01'), null);
  }
});

test('year-end weekends use the actual final exchange session, including Saturday New Year rules', () => {
  for (const [marketDate, expected] of [
    ['2023-06-01', '2022-12-30'],
    ['2024-06-01', '2023-12-29'],
    ['2022-06-01', '2021-12-31'],
  ]) {
    assert.equal(buildStockYtdBaseline([{ date: expected, adjusted_close: 123 }], marketDate)?.date, expected);
  }
  assert.equal(buildStockYtdBaseline([{ date: '2023-12-31', adjusted_close: 123 }], '2024-06-01'), null);
});

test('conflicting or invalid duplicate adjusted closes fail closed, while identical duplicate facts are stable', () => {
  const row = { date: '2025-12-31', close: 100, adjusted_close: 99.5 };
  assert.equal(buildStockYtdBaseline([row, { ...row, adjusted_close: 100 }], '2026-09-11'), null);
  assert.equal(buildStockYtdBaseline([row, { ...row, adjusted_close: null }], '2026-09-11'), null);
  assert.equal(buildStockYtdBaseline([row, { ...row, adjusted_close: '99.5' }], '2026-09-11')?.close, 99.5);
});

test('missing payloads and malformed market dates cannot claim a valid year baseline', () => {
  const rows = [{ date: '2025-12-31', adjusted_close: 100 }];
  for (const marketDate of [undefined, null, '', '2026-02-30', '2026-13-01', '2026-01-00', '2026-01-01T00:00:00Z']) {
    assert.equal(buildStockYtdBaseline(rows, marketDate), null);
  }
  for (const payload of [undefined, null, {}, [], [{ date: '2025-12-31-extra', adjusted_close: 100 }]]) {
    assert.equal(buildStockYtdBaseline(payload, '2026-09-11'), null);
  }
});

async function withProvider(now, eodRows, check) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const requests = [];
  const response = body => ({ ok: true, status: 200, json: async () => body });
  Date.now = () => now;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    requests.push(parsed.pathname);
    if (parsed.pathname.includes('/api/us-quote-delayed')) return response({ data: { 'NVDA.US': {
      lastTradePrice: '120', ethPrice: '120', previousClosePrice: '110', timestamp: now / 1000,
    } } });
    if (parsed.pathname.includes('/api/eod/')) return response(eodRows);
    if (parsed.hostname === 'query1.finance.yahoo.com') return response({ chart: { result: [] } });
    throw new Error('Unexpected provider request');
  };
  try {
    const quote = await fetchStockQuote('NVDA', { eodhdKey: 'mock-only' });
    check(quote);
    assert.equal(requests.length, 3, 'YTD uses the existing quote, EOD and intraday requests without another provider call');
    assert.equal(requests.filter(path => path.includes('/api/eod/')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

test('the ordinary quote adds the separate YTD baseline without changing the legacy first-day fields', async () => {
  await withProvider(Date.parse('2026-09-11T14:00:00Z'), [
    { date: '2025-12-31', close: 100, adjusted_close: 50 },
    { date: '2026-01-02', close: 60, adjusted_close: 60 },
    { date: '2026-09-10', close: 110, adjusted_close: 110 },
  ], quote => {
    assert.deepEqual(quote.stockYtdBaseline, { year: 2026, date: '2025-12-31', close: 50, source: 'eodhd-adjusted-close' });
    assert.equal(quote.yearStartDate, '2026-01-02');
    assert.equal(quote.yearStartPrice, 60);
    assert.equal(quote.ytdChangePercent, 100);
    assert.equal(quote.price, 120);
    assert.equal(quote.dailyPnlPrice, 120);
    assert.equal(quote.dailyPnlBaselineClose, 110);
    assert.equal(quote.dailyPnlLocked, false);
  });
});

test('provider YTD year follows New York across UTC New Year', async () => {
  const rows = [
    { date: '2024-12-31', close: 100, adjusted_close: 50 },
    { date: '2025-01-02', close: 60, adjusted_close: 60 },
    { date: '2025-12-31', close: 110, adjusted_close: 110 },
  ];
  await withProvider(Date.parse('2026-01-01T00:30:00Z'), rows, quote => {
    assert.deepEqual(quote.stockYtdBaseline, { year: 2025, date: '2024-12-31', close: 50, source: 'eodhd-adjusted-close' });
  });
  await withProvider(Date.parse('2026-01-01T05:30:00Z'), rows, quote => {
    assert.deepEqual(quote.stockYtdBaseline, { year: 2026, date: '2025-12-31', close: 110, source: 'eodhd-adjusted-close' });
  });
});

test('a new listing or unavailable history adds null instead of inventing a YTD denominator', async () => {
  for (const rows of [[], [{ date: '2026-01-02', close: 60, adjusted_close: 60 }]]) {
    await withProvider(Date.parse('2026-09-11T14:00:00Z'), rows, quote => {
      assert.equal(quote.stockYtdBaseline, null);
      assert.equal(quote.price, 120);
    });
  }
});
