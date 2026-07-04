import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchDailyFxRates, parseForexRate } from '../server/fx/rates.js';

function createJsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('parseForexRate accepts common EODHD quote fields', () => {
  assert.equal(parseForexRate({ close: 7.2512 }), 7.2512);
  assert.equal(parseForexRate({ price: 7.2513 }), 7.2513);
  assert.equal(parseForexRate({ last: 7.2514 }), 7.2514);
  assert.equal(parseForexRate({ close: 0, previousClose: 7.2515 }), 7.2515);
  assert.equal(parseForexRate({ close: 0 }), 0);
});

test('fetchDailyFxRates maps EODHD USD pairs into app rates', async () => {
  const seenUrls = [];
  const fetchImpl = async (url) => {
    seenUrls.push(url);
    if (url.includes('USDCNY.FOREX')) {
      return createJsonResponse({ close: 7.25, date: '2026-07-04' });
    }
    if (url.includes('USDHKD.FOREX')) {
      return createJsonResponse({ close: 7.82, date: '2026-07-04' });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const fx = await fetchDailyFxRates({
    eodhdKey: 'test-key',
    fetchImpl,
    now: new Date('2026-07-04T00:00:00.000Z'),
  });

  assert.equal(fx.source, 'EODHD');
  assert.equal(fx.rates.CNY, 7.25);
  assert.equal(fx.rates.HKD, Math.round((7.25 / 7.82) * 10000) / 10000);
  assert.equal(fx.fetchedAt, '2026-07-04T00:00:00.000Z');
  assert.equal(seenUrls.length, 2);
  assert.ok(seenUrls.every(url => !url.includes('undefined')));
});
