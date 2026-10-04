import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  fetchPortfolioOverlap, parseVgtPortfolioHoldings, parseSmhPortfolioHoldings,
  VGT_FUND_URL, VGT_STATISTICS_URL, VGT_HOLDINGS_URL, SMH_HOLDINGS_URL,
  resetPortfolioOverlapCacheForTests, PORTFOLIO_OVERLAP_CACHE_TTL_MS,
} from '../server/quote/portfolioOverlap.js';
import { buildPortfolioOverlapModel } from '../src/lib/portfolioOverlapModel.js';

const json = file => JSON.parse(readFileSync(new URL(`./fixtures/portfolio-overlap/${file}`, import.meta.url)));
const VGT = {
  fund: json('vgt-official/fund-2026-10-04.json'),
  statistics: json('vgt-official/statistics-2026-08-31.json'),
  holdings: json('vgt-official/holdings-2026-08-31.json'),
};
const SMH = json('smh-official-2026-10-04.json');
const NOW = Date.parse('2026-10-04T04:00:00Z');
const fixtures = new Map([[VGT_FUND_URL, VGT.fund], [VGT_STATISTICS_URL, VGT.statistics], [VGT_HOLDINGS_URL, VGT.holdings], [SMH_HOLDINGS_URL, SMH]]);
const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const sources = async url => { assert.ok(fixtures.has(url), `unexpected public source ${url}`); return response(fixtures.get(url)); };
beforeEach(() => resetPortfolioOverlapCacheForTests());

function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test('official VGT and SMH wrappers retain full baskets, disclosure dates and non-stock residuals', () => {
  const vgt = parseVgtPortfolioHoldings(VGT, { now: NOW });
  const smh = parseSmhPortfolioHoldings(SMH, { now: NOW });
  for (const item of [vgt, smh]) {
    assert.equal(item.kind, 'plain_etf');
    assert.equal(item.holdingsStatus, 'partial');
    assert.equal(item.source.basis, 'fund_holdings');
    near(item.coveragePct + item.unresolvedWeightPct, 100);
  }
  assert.equal(vgt.asOfDate, '2026-08-31');
  assert.equal(vgt.stale, true, 'monthly disclosure is not relabelled as today');
  assert.equal(vgt.parsedHoldingCount, 318);
  near(vgt.coveragePct, 99.67615);
  assert.equal(smh.asOfDate, '2026-10-01');
  assert.equal(smh.stale, false);
  assert.equal(smh.parsedHoldingCount, 25, 'the large-fund minimum does not reject SMH');
  near(smh.coveragePct, 99.94);
  assert.throws(() => parseVgtPortfolioHoldings(VGT, { now: Date.parse('2026-08-30T12:00:00Z') }), { code: 'INVALID_DATA' });
  assert.throws(() => parseSmhPortfolioHoldings(SMH, { now: Date.parse('2026-10-01T12:00:00Z') }), { code: 'INVALID_DATA' });
  const excessive = structuredClone(SMH);
  excessive.Holdings[0].Weight = '19.34';
  assert.throws(() => parseSmhPortfolioHoldings(excessive, { now: NOW }), { code: 'INVALID_DATA' });
});

test('new funds fetch fixed official sources without EODHD and cache their verified disclosures', async () => {
  const calls = [];
  const config = { now: NOW, fetchImpl: async url => { calls.push(url); return sources(url); } };
  const data = await fetchPortfolioOverlap('VGT,SMH,TQQQ', config);
  assert.deepEqual(calls.sort(), [...fixtures.keys()].sort());
  assert.equal(data.instruments.find(item => item.symbol === 'VGT').holdings.length, 318);
  assert.equal(data.instruments.find(item => item.symbol === 'SMH').holdings.length, 25);
  assert.equal(data.instruments.find(item => item.symbol === 'TQQQ').holdings.length, 0);
  await fetchPortfolioOverlap('SMH,VGT', config);
  assert.equal(calls.length, 4);
});

test('one official identity failure does not discard SMH or misclassify VGT as an ordinary stock', async () => {
  const data = await fetchPortfolioOverlap('VGT,SMH', {
    now: NOW,
    fetchImpl: async url => url === VGT_FUND_URL ? response({ ...VGT.fund, fundIdentifier: 'VTI' }) : sources(url),
  });
  const vgt = data.instruments.find(item => item.symbol === 'VGT');
  assert.equal(vgt.kind, 'plain_etf');
  assert.equal(vgt.reason, 'invalid_holdings_data');
  assert.equal(vgt.holdingsStatus, 'unavailable');
  assert.deepEqual(vgt.holdings, []);
  assert.equal(data.instruments.find(item => item.symbol === 'SMH').holdings.length, 25);
});

test('source failures retain cached evidence as stale; changed-date or oversized baskets fail closed', async () => {
  const first = await fetchPortfolioOverlap('VGT,SMH', { now: NOW, fetchImpl: sources });
  const later = NOW + PORTFOLIO_OVERLAP_CACHE_TTL_MS + 1;
  const failed = await fetchPortfolioOverlap('VGT,SMH', { now: later, fetchImpl: async () => new Response('', { status: 503 }) });
  for (const item of failed.instruments) {
    assert.equal(item.stale, true);
    assert.equal(item.fetchedAt, first.instruments.find(row => row.symbol === item.symbol).fetchedAt);
    assert.ok(item.holdings.length > 0);
  }
  const invalid = await fetchPortfolioOverlap('VGT,SMH', {
    now: later + 60_001,
    fetchImpl: async url => url === VGT_STATISTICS_URL ? response({ ...VGT.statistics, effectiveDate: '2026-09-30' })
      : url === SMH_HOLDINGS_URL ? new Response('x'.repeat(2_000_001)) : sources(url),
  });
  assert.ok(invalid.instruments.every(item => item.reason === 'invalid_holdings_data' && item.holdings.length === 0));
});

test('official baskets flow through the client model with direct-plus-ETF overlap and conserved amounts', async () => {
  const data = await fetchPortfolioOverlap('VGT,SMH,TQQQ', { now: NOW, fetchImpl: sources });
  const direct = { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', holdingsStatus: 'not_applicable',
    source: { provider: 'test identity', url: 'https://example.com/nvda', basis: 'instrument_identity' },
    asOfDate: null, fetchedAt: new Date(NOW).toISOString(), stale: false, reason: null, coveragePct: 100, holdings: [] };
  const holdings = [{ symbol: 'VGT', amount: 10000 }, { symbol: 'SMH', amount: 20000 }, { symbol: 'NVDA', amount: 5000 }, { symbol: 'TQQQ', amount: 1000 }];
  const model = buildPortfolioOverlapModel({ holdings, instruments: [...data.instruments, direct] });
  const nvda = model.companies.find(item => item.symbol === 'NVDA');
  const vgtWeight = data.instruments.find(item => item.symbol === 'VGT').holdings.find(item => item.symbol === 'NVDA').weightPct;
  near(nvda.amount, 5000 + 10000 * vgtWeight / 100 + 20000 * 19.27 / 100);
  near(nvda.percent, nvda.amount / 36000 * 100);
  assert.deepEqual(nvda.sources.map(item => item.symbol).sort(), ['NVDA', 'SMH', 'VGT']);
  near(model.identifiedAmount + model.unexpandedAmount + model.leveragedAmount, model.total);
  near(model.unexpandedAmount, 10000 * (100 - 99.67615) / 100 + 20000 * 0.06 / 100);
  assert.ok(model.positions.filter(item => ['VGT', 'SMH'].includes(item.symbol)).every(item => item.metadata.holdingsStatus === 'partial'));
  const missing = buildPortfolioOverlapModel({ holdings: holdings.map(item => item.symbol === 'SMH' ? { ...item, amount: null } : item), instruments: data.instruments });
  assert.equal(missing.total, null);
  assert.ok(missing.companies.every(item => item.percent === null));
});
