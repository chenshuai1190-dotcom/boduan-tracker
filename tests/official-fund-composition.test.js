import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  OFFICIAL_FUND_COMPOSITION_CACHE_TTL_MS,
  clearOfficialFundCompositionCachesForTests,
  fetchOfficialFundComposition,
  isOfficialFundCompositionSupportedSymbol,
  parseInvescoQqqComposition,
  parseProSharesTqqqComposition,
} from '../server/earnings/officialFundComposition.js';

const fixtureRoot = new URL('./fixtures/official-fund-composition/', import.meta.url);

async function fixtureText(name) {
  return readFile(new URL(name, fixtureRoot), 'utf8');
}

async function fixtureJson(name) {
  return JSON.parse(await fixtureText(name));
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('official fund adapter scope is explicit', () => {
  assert.equal(isOfficialFundCompositionSupportedSymbol('QQQ'), true);
  assert.equal(isOfficialFundCompositionSupportedSymbol('tqqq.us'), true);
  assert.equal(isOfficialFundCompositionSupportedSymbol('SPY'), false);
});

test('Invesco QQQ parser keeps official holdings and sector dates separate', async () => {
  const parsed = parseInvescoQqqComposition({
    holdingsPayload: await fixtureJson('qqq-holdings.json'),
    sectorsPayload: await fixtureJson('qqq-sectors.json'),
  });

  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.reason, null);
  assert.equal(parsed.sections.topHoldings.basis, 'fund-holdings');
  assert.equal(parsed.sections.topHoldings.asOfDate, '2026-07-22');
  assert.equal(parsed.sections.topHoldings.totalHoldings, 108);
  assert.equal(parsed.sections.topHoldings.items.length, 10);
  assert.deepEqual(parsed.sections.topHoldings.items[0], {
    rank: 1,
    ticker: 'NVDA',
    name: 'NVIDIA Corp',
    weightPercent: 8.288274,
    securityType: 'Common Stock',
  });
  assert.equal(parsed.sections.sectors.basis, 'fund-sector-allocation');
  assert.equal(parsed.sections.sectors.asOfDate, '2026-06-30');
  assert.deepEqual(parsed.sections.sectors.items[0], {
    name: 'Technology',
    weightPercent: 68.51,
  });
});

test('Invesco QQQ parser fails closed per section and preserves valid official data', async () => {
  const holdingsPayload = await fixtureJson('qqq-holdings.json');
  const sectorsPayload = await fixtureJson('qqq-sectors.json');
  sectorsPayload.holdingWeights[0].value = 20;

  const parsed = parseInvescoQqqComposition({ holdingsPayload, sectorsPayload });
  assert.equal(parsed.status, 'partial');
  assert.equal(parsed.reason, 'one-or-more-sections-unavailable');
  assert.equal(parsed.sections.topHoldings.status, 'complete');
  assert.equal(parsed.sections.sectors.status, 'unavailable');
  assert.deepEqual(parsed.sections.sectors.items, []);

  holdingsPayload.cusip = 'SPY';
  const unavailable = parseInvescoQqqComposition({ holdingsPayload, sectorsPayload });
  assert.equal(unavailable.status, 'unavailable');
  assert.deepEqual(unavailable.sections.topHoldings.items, []);
});

test('ProShares TQQQ parser labels companies and sectors as benchmark-index data', async () => {
  const parsed = parseProSharesTqqqComposition(await fixtureText('tqqq-page.html'));

  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.sections.topHoldings.label, 'Top 10 index companies');
  assert.equal(parsed.sections.topHoldings.basis, 'benchmark-index');
  assert.equal(parsed.sections.topHoldings.asOfDate, '2026-06-30');
  assert.deepEqual(parsed.sections.topHoldings.items[0], {
    rank: 1,
    name: 'NVIDIA Corp.',
    weightPercent: 7.602316000000001,
  });
  assert.equal(parsed.sections.sectors.label, 'Index sector weightings');
  assert.equal(parsed.sections.sectors.basis, 'benchmark-index');
  assert.equal(parsed.sections.sectors.items[0].name, 'Information Technology');
});

test('ProShares TQQQ parser rejects wrong identity and materially incomplete totals', async () => {
  const html = await fixtureText('tqqq-page.html');
  assert.equal(parseProSharesTqqqComposition(
    html.replace('TQQQ | UltraPro QQQ | ProShares', 'Other Fund'),
  ), null);
  const partial = parseProSharesTqqqComposition(
    html.replace('"Weight": 61.210749', '"Weight": 1.210749'),
  );
  assert.equal(partial.status, 'partial');
  assert.equal(partial.sections.topHoldings.status, 'complete');
  assert.equal(partial.sections.sectors.status, 'unavailable');
  assert.equal(parseProSharesTqqqComposition(
    html.replace('Index as of 6/30/2026', 'Index as of unknown'),
  ), null);
});

test('QQQ fetch uses only fixed Invesco sources and returns official source metadata', async () => {
  clearOfficialFundCompositionCachesForTests();
  const holdingsPayload = await fixtureJson('qqq-holdings.json');
  const sectorsPayload = await fixtureJson('qqq-sectors.json');
  const requested = [];
  const fetchFn = async (url) => {
    requested.push(url);
    if (url.startsWith('https://dng-api.invesco.com/')
      && url.includes('/holdings/fund')) {
      return jsonResponse(holdingsPayload);
    }
    if (url.startsWith('https://dng-api.invesco.com/')
      && url.includes('/weightedHoldings/fund')) {
      return jsonResponse(sectorsPayload);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchOfficialFundComposition({
    symbol: 'qqq.us',
    fetchFn,
    now: new Date('2026-07-24T01:02:03.000Z'),
  });

  assert.equal(result.kind, 'fund-composition');
  assert.equal(result.status, 'complete');
  assert.equal(result.symbol, 'QQQ');
  assert.equal(result.fundName, 'Invesco QQQ ETF');
  assert.equal(result.fundType, 'index-etf');
  assert.equal(result.leverageTarget, 1);
  assert.equal(result.source.provider, 'Invesco');
  assert.equal(result.source.official, true);
  assert.equal(result.source.retrievedAt, '2026-07-24T01:02:03.000Z');
  assert.match(result.source.pageUrl, /^https:\/\/www\.invesco\.com\//);
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.startsWith('https://dng-api.invesco.com/')));
});

test('TQQQ fetch uses only the official ProShares page and exposes leverage semantics', async () => {
  clearOfficialFundCompositionCachesForTests();
  const html = await fixtureText('tqqq-page.html');
  const requested = [];
  const fetchFn = async (url) => {
    requested.push(url);
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };

  const result = await fetchOfficialFundComposition({
    symbol: 'TQQQ',
    fetchFn,
    now: new Date('2026-07-24T02:03:04.000Z'),
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.fundName, 'ProShares UltraPro QQQ');
  assert.equal(result.fundType, 'leveraged-etf');
  assert.equal(result.leverageTarget, 3);
  assert.equal(result.source.provider, 'ProShares');
  assert.equal(result.source.official, true);
  assert.equal(result.sections.topHoldings.basis, 'benchmark-index');
  assert.deepEqual(requested, [
    'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq',
  ]);
});

test('official fund fetch is failure-safe for unsupported symbols and partial QQQ data', async () => {
  clearOfficialFundCompositionCachesForTests();
  let requestCount = 0;
  const unsupported = await fetchOfficialFundComposition({
    symbol: 'SPY',
    fetchFn: async () => {
      requestCount += 1;
      throw new Error('must not fetch');
    },
  });
  assert.equal(unsupported.status, 'unavailable');
  assert.equal(unsupported.reason, 'official-fund-adapter-not-supported');
  assert.equal(requestCount, 0);

  const holdingsPayload = await fixtureJson('qqq-holdings.json');
  const partial = await fetchOfficialFundComposition({
    symbol: 'QQQ',
    fetchFn: async (url) => {
      if (url.includes('/weightedHoldings/fund')) {
        return new Response('unavailable', { status: 503 });
      }
      return jsonResponse(holdingsPayload);
    },
  });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.sections.topHoldings.status, 'complete');
  assert.equal(partial.sections.sectors.status, 'unavailable');
});

test('official fund fetch bounds stalled sources and returns unavailable', async () => {
  clearOfficialFundCompositionCachesForTests();
  const startedAt = Date.now();
  const result = await fetchOfficialFundComposition({
    symbol: 'TQQQ',
    timeoutMs: 25,
    fetchFn: async () => new Promise(() => {}),
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'official-source-unavailable');
  assert.ok(Date.now() - startedAt < 1000);
});

test('official fund fetch deduplicates concurrent work and caches complete results for six hours', async () => {
  clearOfficialFundCompositionCachesForTests();
  const holdingsPayload = await fixtureJson('qqq-holdings.json');
  const sectorsPayload = await fixtureJson('qqq-sectors.json');
  let requestCount = 0;
  const fetchFn = async (url) => {
    requestCount += 1;
    await Promise.resolve();
    return url.includes('/weightedHoldings/fund')
      ? jsonResponse(sectorsPayload)
      : jsonResponse(holdingsPayload);
  };
  const now = new Date('2026-07-24T03:00:00.000Z');

  const [first, concurrent] = await Promise.all([
    fetchOfficialFundComposition({ symbol: 'QQQ', fetchFn, now }),
    fetchOfficialFundComposition({ symbol: 'QQQ', fetchFn, now }),
  ]);
  const cached = await fetchOfficialFundComposition({
    symbol: 'QQQ',
    fetchFn,
    now: new Date(now.getTime() + OFFICIAL_FUND_COMPOSITION_CACHE_TTL_MS - 1),
  });

  assert.strictEqual(first, concurrent);
  assert.strictEqual(first, cached);
  assert.equal(requestCount, 2);
});
