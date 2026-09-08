import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { holdingsFromPositions, buildPortfolioOverlapModel } from '../src/lib/portfolioOverlapModel.js';
import { fetchPortfolioOverlap, QQQ_HOLDINGS_URL, SPY_HOLDINGS_URL, resetPortfolioOverlapCacheForTests } from '../server/quote/portfolioOverlap.js';

// Contract fixtures only: none of these test weights are published fund data.
const SOURCE = { provider: 'Official contract fixture', url: 'https://example.test/holdings', basis: 'fund_holdings' };
const FETCHED = '2026-09-08T12:00:00.000Z';
const AS_OF = '2026-09-07';
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} must be within ${tolerance} of ${expected}`);

function metadata(symbol, kind = 'stock', changes = {}) {
  return { symbol, name: `${symbol} verified name`, kind, holdingsStatus: 'not_applicable', source: { ...SOURCE, basis: kind === 'plain_etf' ? 'fund_holdings' : 'instrument_identity' }, asOfDate: null, fetchedAt: FETCHED, stale: false, reason: '', coveragePct: null, holdings: [], ...changes };
}

function fund(symbol, weights, changes = {}) {
  const holdings = Object.entries(weights).map(([code, weightPct]) => ({ symbol: code, name: `${code} underlying`, exchange: 'US', weightPct, securityType: 'stock' }));
  return metadata(symbol, 'plain_etf', { holdingsStatus: 'partial', asOfDate: AS_OF, coveragePct: holdings.reduce((sum, row) => sum + row.weightPct, 0), holdings, ...changes });
}

function sample() {
  return {
    holdings: [
      { symbol: 'QQQ', amount: 400 }, { symbol: 'SPY', amount: 200 },
      { symbol: 'NVDA', amount: 100 }, { symbol: 'XYZ', amount: 100 }, { symbol: 'TQQQ', amount: 200 },
    ],
    instruments: [fund('QQQ', { NVDA: 10, MSFT: 20 }), fund('SPY', { NVDA: 5, AAPL: 15 }), metadata('NVDA'), metadata('TQQQ', 'leveraged_etf')],
  };
}

function conservation(result) {
  const knownPositions = result.positions.filter(position => position.amount !== null).reduce((sum, position) => sum + position.amount, 0);
  near(result.identifiedAmount + result.unexpandedAmount + result.leveragedAmount, knownPositions);
  for (const company of result.companies) {
    near(company.directAmount + company.indirectAmount, company.amount);
    near(company.sources.reduce((sum, source) => sum + source.amount, 0), company.amount);
    if (result.total > 0) near(company.sources.reduce((sum, source) => sum + source.percent, 0), company.percent);
  }
  if (result.total > 0) near(result.identifiedPercent + result.unexpandedPercent + result.leveragedPercent, 100);
}

function allPercentagesNull(result) {
  for (const field of ['identifiedPercent', 'unexpandedPercent', 'leveragedPercent', 'topFivePercent']) assert.equal(result[field], null);
  for (const position of result.positions) assert.equal(position.percent, null);
  for (const company of result.companies) {
    assert.equal(company.percent, null);
    for (const source of company.sources) assert.equal(source.percent, null);
  }
}

test('position adapter uses existing market value, excludes closed/short positions, and never substitutes cost', () => {
  const positions = [
    { symbol: ' nvda ', name: 'NVIDIA', heldShares: 2, valuationPrice: 100, marketValue: 201.25, remainingCost: 180 },
    { symbol: 'QQQ', heldShares: 3, valuationPrice: 0, marketValue: 900, remainingCost: 900, currentPrice: 300 },
    { symbol: 'SPY', heldShares: 1, valuationPrice: null, marketValue: 500, avgCost: 500 },
    { symbol: 'MSFT', heldShares: 0, valuationPrice: 200, marketValue: 0 },
    { symbol: 'AAPL', heldShares: -1, valuationPrice: 200, marketValue: -200 },
  ];
  assert.deepEqual(holdingsFromPositions(positions), [
    { symbol: 'NVDA', name: 'NVIDIA', amount: 201.25 },
    { symbol: 'QQQ', name: 'QQQ', amount: null },
    { symbol: 'SPY', name: 'SPY', amount: null },
  ]);
});

test('missing, nonnumeric, negative, or nonfinite valuation fields remain null', () => {
  const base = { symbol: 'NVDA', heldShares: 1, valuationPrice: 10, marketValue: 10 };
  for (const valuationPrice of [undefined, null, 0, -1, NaN, Infinity, '10']) {
    assert.equal(holdingsFromPositions([{ ...base, valuationPrice }])[0].amount, null);
  }
  for (const marketValue of [undefined, null, -1, NaN, Infinity, '10']) {
    assert.equal(holdingsFromPositions([{ ...base, marketValue }])[0].amount, null);
  }
  assert.equal(holdingsFromPositions([{ ...base, marketValue: 0 }])[0].amount, 0);
  assert.throws(() => holdingsFromPositions(null), /array/);
  for (const heldShares of [undefined, null, NaN, Infinity, '1']) assert.throws(() => holdingsFromPositions([{ ...base, heldShares }]), /heldShares/);
});

test('verified metadata drives direct and partial ETF exposures with source provenance and full portfolio denominator', () => {
  const result = buildPortfolioOverlapModel(sample());
  assert.equal(result.total, 1000);
  assert.equal(result.valuationComplete, true);
  assert.deepEqual(result.missingValuationSymbols, []);
  assert.equal(result.identifiedAmount, 260);
  assert.equal(result.unexpandedAmount, 540);
  assert.equal(result.leveragedAmount, 200);
  assert.equal(result.identifiedPercent, 26);
  assert.equal(result.unexpandedPercent, 54);
  assert.equal(result.leveragedPercent, 20);
  assert.equal(result.topFivePercent, 26);
  assert.equal(result.overlappingCompaniesCount, 1);
  assert.deepEqual(result.companies.map(company => company.symbol), ['NVDA', 'MSFT', 'AAPL']);
  const nvda = result.companies[0];
  assert.equal(nvda.amount, 150);
  assert.equal(nvda.percent, 15);
  assert.equal(nvda.directAmount, 100);
  assert.equal(nvda.indirectAmount, 50);
  assert.equal(nvda.name, 'NVDA verified name');
  assert.deepEqual(nvda.sources.map(source => [source.symbol, source.amount, source.weightPct, source.kind, source.asOfDate]), [
    ['NVDA', 100, 100, 'direct', null], ['QQQ', 40, 10, 'etf', AS_OF], ['SPY', 10, 5, 'etf', AS_OF],
  ]);
  assert.deepEqual(nvda.sources[1].source, SOURCE);
  assert.equal(nvda.sources[1].percent, 4);
  assert.equal(result.positions.find(position => position.symbol === 'XYZ').kind, 'unknown');
  conservation(result);
});

test('no metadata or unknown classification cannot turn a name or familiar ticker into a verified stock', () => {
  for (const instruments of [undefined, [], {}, { version: 2, instruments: [metadata('NVDA')] }, [metadata('NVDA', 'unknown', { holdingsStatus: 'unavailable', source: null, reason: 'classification_unavailable' })]]) {
    const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', name: 'NVIDIA Common Stock', amount: 100 }], instruments });
    assert.deepEqual(result.companies, []);
    assert.equal(result.unexpandedAmount, 100);
    assert.equal(result.total, 100);
    assert.equal(result.positions[0].kind, 'unknown');
    conservation(result);
  }
});

test('metadata response envelope version 1 and instruments arrays have the same model', () => {
  const input = sample();
  assert.deepEqual(buildPortfolioOverlapModel(input), buildPortfolioOverlapModel({ ...input, instruments: { version: 1, instruments: input.instruments } }));
});

test('healthy metadata accepts a null reason and normalizes it to an empty presentation reason', () => {
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: 100 }], instruments: [metadata('NVDA', 'stock', { reason: null, coveragePct: 100 })] });
  assert.equal(result.identifiedAmount, 100);
  assert.equal(result.positions[0].kind, 'stock');
  assert.equal(result.positions[0].metadata.reason, '');
});

test('a missing quote makes total and every percentage null without turning the missing position into zero', () => {
  const input = sample();
  input.holdings.find(holding => holding.symbol === 'QQQ').amount = null;
  const result = buildPortfolioOverlapModel(input);
  assert.equal(result.total, null);
  assert.equal(result.valuationComplete, false);
  assert.deepEqual(result.missingValuationSymbols, ['QQQ']);
  assert.equal(result.positions[0].amount, null);
  assert.equal(result.identifiedAmount, 140);
  assert.equal(result.unexpandedAmount, 260);
  assert.equal(result.leveragedAmount, 200);
  allPercentagesNull(result);
  conservation(result);
});

test('zero and empty portfolios have zero known amounts but null percentages and no fake companies', () => {
  for (const holdings of [[], [{ symbol: 'QQQ', amount: 0 }], [{ symbol: 'NVDA', amount: -0 }, { symbol: 'TQQQ', amount: 0 }]]) {
    const result = buildPortfolioOverlapModel({ holdings, instruments: sample().instruments });
    assert.equal(result.total, 0);
    assert.equal(Object.is(result.total, -0), false);
    assert.equal(result.valuationComplete, true);
    assert.deepEqual(result.companies, []);
    assert.equal(result.identifiedAmount, 0);
    assert.equal(result.unexpandedAmount, 0);
    assert.equal(result.leveragedAmount, 0);
    allPercentagesNull(result);
  }
});

test('leveraged ETF stays a separate unmultiplied position and never contributes company exposure', () => {
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'TQQQ', amount: 100 }], instruments: [metadata('TQQQ', 'leveraged_etf')] });
  assert.equal(result.total, 100);
  assert.equal(result.leveragedAmount, 100);
  assert.equal(result.leveragedPercent, 100);
  assert.equal(result.unexpandedAmount, 0);
  assert.equal(result.identifiedAmount, 0);
  assert.deepEqual(result.companies, []);
});

test('plain ETF unavailable metadata keeps full amount unexpanded; stale valid snapshots retain the original date', () => {
  const unavailable = metadata('QQQ', 'plain_etf', { holdingsStatus: 'unavailable', reason: 'provider_unavailable' });
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [unavailable] });
  assert.equal(result.positions[0].kind, 'plain_etf');
  assert.equal(result.unexpandedAmount, 100);
  assert.deepEqual(result.companies, []);
  const stale = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [fund('QQQ', { NVDA: 10 }, { stale: true, reason: 'cached_fund_holdings' })] });
  assert.equal(stale.identifiedAmount, 10);
  assert.equal(stale.unexpandedAmount, 90);
  assert.equal(stale.positions[0].metadata.stale, true);
  assert.equal(stale.companies[0].sources[0].asOfDate, AS_OF);
});

test('invalid metadata dates, security types, provenance, weights or coverage refuse look-through', () => {
  const mutations = [
    value => { value.asOfDate = null; },
    value => { value.asOfDate = '2026-02-30'; },
    value => { value.asOfDate = '2026-09-09'; },
    value => { value.fetchedAt = 'yesterday'; },
    value => { value.fetchedAt = '2026-02-30T12:00:00Z'; },
    value => { value.stale = 'false'; },
    value => { value.source = null; },
    value => { value.source.basis = 'benchmark_index'; },
    value => { value.source.url = 'javascript:alert(1)'; },
    value => { value.source.url = 'http://example.test/holdings'; },
    value => { value.coveragePct = null; },
    value => { value.coveragePct = 80; },
    value => { value.holdings[0].weightPct = -10; },
    value => { value.holdings[0].weightPct = '10'; },
    value => { value.holdings[0].weightPct = NaN; },
    value => { value.holdings[0].weightPct = Infinity; },
    value => { value.holdings[0].exchange = 'HK'; },
    value => { value.holdings[0].securityType = 'etf'; },
    value => { value.holdings[0].symbol = 'QQQ'; },
    value => { value.holdings[0].symbol = 'nvda'; },
    value => { value.holdings[0].name = ''; },
    value => { value.holdings = []; },
    value => { value.holdingsStatus = 'unavailable'; },
  ];
  for (const mutate of mutations) {
    const item = fund('QQQ', { NVDA: 10 });
    mutate(item);
    const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [item] });
    assert.equal(result.identifiedAmount, 0);
    assert.equal(result.unexpandedAmount, 100);
    assert.deepEqual(result.companies, []);
    assert.equal(result.positions[0].metadata.reason, 'invalid_metadata');
  }
});

test('unverified stock and leverage classifications do not gain trust from a kind string alone', () => {
  for (const kind of ['stock', 'leveraged_etf']) {
    for (const changes of [{ source: null }, { fetchedAt: null }, { holdingsStatus: 'available' }, { holdings: [{ symbol: 'NVDA' }] }]) {
      const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'ABC', amount: 100 }], instruments: [metadata('ABC', kind, changes)] });
      assert.equal(result.identifiedAmount, 0);
      assert.equal(result.leveragedAmount, 0);
      assert.equal(result.unexpandedAmount, 100);
    }
  }
});

test('source basis matches the verified classification instead of treating index weights as holdings', () => {
  const stockWithFundBasis = buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: 100 }], instruments: [metadata('NVDA', 'stock', { source: SOURCE })] });
  assert.equal(stockWithFundBasis.identifiedAmount, 0);
  const fundWithIdentityOnly = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [fund('QQQ', { NVDA: 10 }, { source: { ...SOURCE, basis: 'instrument_identity' } })] });
  assert.equal(fundWithIdentityOnly.identifiedAmount, 0);
  const leveraged = buildPortfolioOverlapModel({ holdings: [{ symbol: 'TQQQ', amount: 100 }], instruments: [metadata('TQQQ', 'leveraged_etf', { source: { ...SOURCE, basis: 'daily_leverage_target' } })] });
  assert.equal(leveraged.leveragedAmount, 100);
  assert.equal(leveraged.identifiedAmount, 0);
});

test('identity-only fund metadata retains classification provenance but cannot supply equity weights', () => {
  const source = { ...SOURCE, basis: 'instrument_identity' };
  for (const kind of ['plain_etf', 'unknown']) {
    const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'CUSTOM', amount: 100 }], instruments: [metadata('CUSTOM', kind, { holdingsStatus: 'unavailable', source, reason: 'unsupported_fund_structure' })] });
    assert.equal(result.identifiedAmount, 0);
    assert.equal(result.unexpandedAmount, 100);
    assert.equal(result.positions[0].kind, kind);
    assert.deepEqual(result.positions[0].metadata.source, source);
  }
});

test('overweight baskets fail closed; tiny floating-point excess is not normalized', () => {
  const excessive = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [fund('QQQ', { NVDA: 60, MSFT: 50 })] });
  assert.equal(excessive.identifiedAmount, 0);
  assert.equal(excessive.unexpandedAmount, 100);
  const weights = { NVDA: 50, MSFT: 50.00000001 };
  const roundoff = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [fund('QQQ', weights)] });
  assert.equal(roundoff.positions[0].kind, 'plain_etf');
  assert.equal(roundoff.companies.find(company => company.symbol === 'NVDA').amount, 50);
  assert.equal(roundoff.companies.find(company => company.symbol === 'MSFT').sources[0].weightPct, 50.00000001);
  assert.equal(roundoff.unexpandedAmount, 0);
  near(roundoff.identifiedAmount, 100, 1e-6);
});

test('duplicate input holdings merge and any missing duplicate keeps that entire position unvalued', () => {
  const instruments = [metadata('NVDA')];
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: 100 }, { symbol: ' nvda ', amount: 50 }], instruments });
  assert.equal(result.total, 150);
  assert.equal(result.positions.length, 1);
  assert.equal(result.companies[0].amount, 150);
  assert.equal(result.companies[0].sources.length, 1);
  assert.equal(result.overlappingCompaniesCount, 0);
  for (const holdings of [[{ symbol: 'NVDA', amount: 100 }, { symbol: 'NVDA', amount: null }], [{ symbol: 'NVDA', amount: null }, { symbol: 'NVDA', amount: 100 }]]) {
    const missing = buildPortfolioOverlapModel({ holdings, instruments });
    assert.equal(missing.positions[0].amount, null);
    assert.equal(missing.total, null);
    assert.deepEqual(missing.missingValuationSymbols, ['NVDA']);
    assert.deepEqual(missing.companies, []);
    allPercentagesNull(missing);
  }
});

test('duplicate underlying rows combine by verified code without creating false source overlap', () => {
  const item = fund('QQQ', { NVDA: 10 });
  item.holdings.push({ ...item.holdings[0], weightPct: 5 });
  item.coveragePct = 15;
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [item] });
  assert.equal(result.companies[0].amount, 15);
  assert.equal(result.companies[0].sources[0].weightPct, 15);
  assert.equal(result.companies[0].sources.length, 1);
  assert.equal(result.overlappingCompaniesCount, 0);
  conservation(result);
});

test('duplicate metadata is ambiguous and cannot silently choose one classification', () => {
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: 100 }], instruments: [metadata('NVDA'), metadata('NVDA')] });
  assert.equal(result.unexpandedAmount, 100);
  assert.equal(result.positions[0].metadata.reason, 'ambiguous_metadata');
});

test('verified ADR rows are supported while similar company names and share classes remain distinct', () => {
  const item = fund('QQQ', { GOOG: 10, GOOGL: 10, TSM: 5 });
  item.holdings[0].name = 'Alphabet';
  item.holdings[1].name = 'Alphabet';
  item.holdings[2].securityType = 'adr';
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 100 }], instruments: [item] });
  assert.deepEqual(result.companies.map(company => company.symbol), ['GOOG', 'GOOGL', 'TSM']);
  assert.equal(result.companies.length, 3);
  assert.equal(result.overlappingCompaniesCount, 0);
});

test('top five is calculated from identified companies only against the whole portfolio', () => {
  const result = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 1000 }, { symbol: 'TQQQ', amount: 1000 }], instruments: [fund('QQQ', { AAA: 1, BBB: 2, CCC: 3, DDD: 4, EEE: 5, FFF: 6 }), metadata('TQQQ', 'leveraged_etf')] });
  assert.equal(result.identifiedAmount, 210);
  assert.equal(result.identifiedPercent, 10.5);
  assert.equal(result.topFivePercent, 10);
  assert.equal(result.unexpandedAmount, 790);
  assert.equal(result.leveragedAmount, 1000);
  conservation(result);
});

test('bad holdings and unsafe numeric totals fail closed instead of emitting NaN or Infinity', () => {
  for (const holdings of [null, {}, 'holdings']) assert.throws(() => buildPortfolioOverlapModel({ holdings }), /array/);
  for (const holding of [null, [], 'NVDA']) assert.throws(() => buildPortfolioOverlapModel({ holdings: [holding] }), /record/);
  for (const amount of [undefined, -1, NaN, Infinity, '10']) assert.throws(() => buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount }] }), /non-negative/);
  for (const symbol of ['', null, '__proto__']) assert.throws(() => buildPortfolioOverlapModel({ holdings: [{ symbol, amount: 100 }] }), /symbol/);
  assert.throws(() => buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: Number.MAX_VALUE }, { symbol: 'MSFT', amount: Number.MAX_VALUE }] }), /numeric range/);
  const huge = buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: Number.MAX_VALUE }], instruments: [metadata('NVDA')] });
  assert.equal(huge.companies[0].percent, 100);
  assert.equal(huge.topFivePercent, 100);
});

test('functions never mutate positions, holdings, or nested metadata', () => {
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const positions = freeze([{ symbol: 'NVDA', heldShares: 1, valuationPrice: 100, marketValue: 100 }]);
  const input = freeze(sample());
  const before = JSON.stringify(input);
  holdingsFromPositions(positions);
  const result = buildPortfolioOverlapModel(input);
  result.positions[0].metadata.holdings[0].weightPct = 99;
  result.companies[0].sources[0].source.provider = 'Changed output only';
  assert.equal(JSON.stringify(input), before);
  assert.equal(positions[0].marketValue, 100);
});

test('official captured fixtures pass through the actual server fetch contract into the overlap model', async () => {
  resetPortfolioOverlapCacheForTests();
  const qqqBytes = readFileSync(new URL('./fixtures/portfolio-overlap/qqq-official-2026-09-08.json', import.meta.url));
  const spyBytes = readFileSync(new URL('./fixtures/portfolio-overlap/spy-official-2026-09-08.xlsx', import.meta.url));
  const holdings = [
    { symbol: 'QQQ', amount: 350000 }, { symbol: 'SPY', amount: 250000 },
    { symbol: 'NVDA', amount: 150000 }, { symbol: 'MSFT', amount: 100000 },
    { symbol: 'AVGO', amount: 50000 }, { symbol: 'TQQQ', amount: 100000 },
  ];
  const calls = [];
  const response = await fetchPortfolioOverlap(holdings.map(holding => holding.symbol), {
    eodhdKey: 'unit-test-only', now: Date.parse(FETCHED),
    fetchImpl: async url => {
      calls.push(url);
      if (url === QQQ_HOLDINGS_URL) return { ok: true, status: 200, arrayBuffer: async () => qqqBytes };
      if (url === SPY_HOLDINGS_URL) return { ok: true, status: 200, arrayBuffer: async () => spyBytes };
      const symbol = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      assert.ok(['NVDA', 'MSFT', 'AVGO'].includes(symbol), 'test never falls through to a real network call');
      return { ok: true, status: 200, json: async () => [{ Code: symbol, Name: `${symbol} verified identity fixture`, Type: 'Common Stock', Exchange: 'US', Country: 'USA', Currency: 'USD' }] };
    },
  });
  const result = buildPortfolioOverlapModel({ holdings, instruments: response });
  assert.equal(response.version, 1);
  assert.equal(calls.length, 5, 'two official fund fixtures and three mocked verified identities');
  assert.equal(result.total, 1000000);
  assert.equal(result.leveragedAmount, 100000);
  assert.equal(result.valuationComplete, true);
  assert.deepEqual(result.positions.map(position => [position.symbol, position.kind]), [
    ['QQQ', 'plain_etf'], ['SPY', 'plain_etf'], ['NVDA', 'stock'], ['MSFT', 'stock'], ['AVGO', 'stock'], ['TQQQ', 'leveraged_etf'],
  ]);
  assert.ok(result.positions.every(position => position.metadata.reason !== 'invalid_metadata'));
  assert.ok(result.companies.length >= 503);
  const qqq = response.instruments.find(instrument => instrument.symbol === 'QQQ');
  const spy = response.instruments.find(instrument => instrument.symbol === 'SPY');
  assert.equal(qqq.asOfDate, '2026-09-04');
  assert.equal(spy.asOfDate, '2026-09-04');
  near(qqq.coveragePct, 99.886855);
  near(spy.coveragePct, 99.797453);
  const expectedIdentified = 300000 + 350000 * qqq.coveragePct / 100 + 250000 * spy.coveragePct / 100;
  near(result.identifiedAmount, expectedIdentified);
  near(result.unexpandedAmount, 900000 - expectedIdentified);
  const expectedNvda = 150000 + 350000 * qqq.holdings.find(row => row.symbol === 'NVDA').weightPct / 100
    + 250000 * spy.holdings.find(row => row.symbol === 'NVDA').weightPct / 100;
  const nvda = result.companies.find(company => company.symbol === 'NVDA');
  near(nvda.amount, expectedNvda);
  assert.equal(nvda.sources.length, 3);
  assert.equal(nvda.sources.find(source => source.kind === 'direct').source.basis, 'instrument_identity');
  for (const source of nvda.sources.filter(source => source.kind === 'etf')) {
    assert.equal(source.source.basis, 'fund_holdings');
    assert.equal(source.asOfDate, '2026-09-04');
  }
  conservation(result);
  resetPortfolioOverlapCacheForTests();
});
