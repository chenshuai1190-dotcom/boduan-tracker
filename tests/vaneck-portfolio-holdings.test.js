import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseVanEckPortfolioHoldings, SMH_HOLDINGS_URL } from '../server/quote/vanEckPortfolioHoldings.js';

const OFFICIAL = JSON.parse(readFileSync(new URL('./fixtures/portfolio-overlap/smh-official-2026-10-04.json', import.meta.url)));
const NEGATIVE_ZERO_OFFICIAL = JSON.parse(readFileSync(new URL('./fixtures/portfolio-overlap/smh-official-2026-10-08.json', import.meta.url)));

test('VanEck October 8 disclosure accepts rounded negative-zero cash without changing equity weights', () => {
  const before = structuredClone(NEGATIVE_ZERO_OFFICIAL);
  const parsed = parseVanEckPortfolioHoldings(NEGATIVE_ZERO_OFFICIAL);
  assert.equal(parsed.asOfDate, '2026-10-08');
  assert.equal(parsed.reportedHoldingCount, 26);
  assert.equal(parsed.holdings.length, 25);
  assert.equal(parsed.holdings.find(row => row.symbol === 'NVDA').weightPct, 19.60);
  assert.ok(Math.abs(parsed.totalWeight - 99.98) < 1e-9);
  assert.ok(Math.abs(parsed.holdings.reduce((sum, row) => sum + row.weightPct, 0) - 99.93) < 1e-9);
  assert.deepEqual(NEGATIVE_ZERO_OFFICIAL, before, 'disclosed negative zero remains unchanged in the source');

  for (const weight of ['0', '-0', '-0.0', '-0.00', '-0.00000000']) {
    const data = structuredClone(NEGATIVE_ZERO_OFFICIAL);
    data.Holdings.at(-1).Weight = weight;
    assert.deepEqual(parseVanEckPortfolioHoldings(data), parsed);
  }
});

test('VanEck negative-zero compatibility never rounds genuine negatives or broadens numeric syntax', () => {
  for (const weight of ['-0.01', '-1', '-0.00000001', '-0.000000001', '-00', '-0.', '-0e0', '-0.00%', ' -0.00', '-0.000000000']) {
    for (const order of [1, 9999, 10000]) {
      const data = structuredClone(NEGATIVE_ZERO_OFFICIAL);
      data.Holdings.find(row => row.LabelOrder === order).Weight = weight;
      assert.throws(() => parseVanEckPortfolioHoldings(data), { code: 'INVALID_DATA' }, `${order}: ${weight}`);
    }
  }
});

test('VanEck US SMH complete public dataset preserves disclosed percent points and date', () => {
  const parsed = parseVanEckPortfolioHoldings(OFFICIAL);
  assert.equal(new URL(SMH_HOLDINGS_URL).hostname, 'www.vaneck.com');
  assert.equal(parsed.asOfDate, '2026-10-01');
  assert.equal(parsed.reportedHoldingCount, 26);
  assert.equal(parsed.holdings.length, 25, 'SMH is a 25-security fund, not a 50-plus-security fund');
  assert.deepEqual(parsed.holdings[0], { symbol: 'NVDA', name: 'Nvidia Corp', weightPct: 19.27, exchange: 'US', securityType: 'stock' });
  assert.ok(Math.abs(parsed.totalWeight - 100) < 1e-9);
  assert.ok(Math.abs(parsed.holdings.reduce((sum, row) => sum + row.weightPct, 0) - 99.94) < 1e-9);
  assert.ok(parsed.holdings.some(row => row.symbol === 'TSM'));
  assert.ok(parsed.holdings.some(row => row.symbol === 'SKHY'));
  assert.ok(parsed.holdings.every(row => !['-USD CASH-', '--'].includes(row.symbol)));
  assert.equal(OFFICIAL.Holdings[0].Weight, '19.27', 'source is not mutated');
});

test('VanEck rejects wrong fund identity, inconsistent or invalid holding dates and currency', () => {
  for (const mutate of [
    data => { data.Holdings[0].Ticker = 'SMHG'; },
    data => { data.Holdings[0].PortfolioTicker = 'SMH LN'; },
    data => { data.Holdings[0].LabelType = 'Top Holdings'; },
    data => { data.Holdings[0].LabelId = 2; },
    data => { data.AsOfDate = '2026-02-30T00:00:00'; },
    data => { data.AsOfDate = '2026-10-01'; },
    data => { delete data.AsOfDate; },
    data => { data.Holdings[0].AsOfDate = '2026-09-30T00:00:00'; },
    data => { data.Holdings[0].DataDate = '2026-09-30T00:00:00'; },
    data => { data.Holdings[0].CurrencyCode = 'EUR'; },
    data => { data.Holdings.at(-1).PortfolioTicker = 'SMHX'; },
  ]) {
    const data = structuredClone(OFFICIAL);
    mutate(data);
    assert.throws(() => parseVanEckPortfolioHoldings(data), { code: 'INVALID_DATA' });
  }
});

test('VanEck rejects truncated, duplicated and malformed complete-holdings data', () => {
  for (const mutate of [
    data => { data.Holdings = data.Holdings.slice(0, 10); },
    data => { data.Holdings.pop(); },
    data => { data.Holdings.splice(14, 1); },
    data => { data.Holdings[1].Label = data.Holdings[0].Label; },
    data => { data.Holdings[1].LabelOrder = data.Holdings[0].LabelOrder; },
    data => { data.Holdings.at(-1).HoldingName = 'Total'; },
    data => { data.Holdings[0].HoldingName = ''; },
    data => { data.Holdings[0].HoldingName = 'Nvidia\u0000Corp'; },
  ]) {
    const data = structuredClone(OFFICIAL);
    mutate(data);
    assert.throws(() => parseVanEckPortfolioHoldings(data), { code: 'INVALID_DATA' });
  }
});

test('VanEck numeric contracts reject missing, negative and scaled weight units without normalization', () => {
  for (const weight of [null, false, 19.27, '', '19.27%', '-1', 'NaN', 'Infinity', '100.01', ' 19.27', '1,927']) {
    const data = structuredClone(OFFICIAL);
    data.Holdings[0].Weight = weight;
    assert.throws(() => parseVanEckPortfolioHoldings(data), { code: 'INVALID_DATA' });
  }
  const fractional = structuredClone(OFFICIAL);
  fractional.Holdings.forEach(row => { row.Weight = String(Number(row.Weight) / 100); });
  assert.throws(() => parseVanEckPortfolioHoldings(fractional), { code: 'INVALID_DATA' });
  const missingCashWeight = structuredClone(OFFICIAL);
  delete missingCashWeight.Holdings.at(-1).Weight;
  assert.throws(() => parseVanEckPortfolioHoldings(missingCashWeight), { code: 'INVALID_DATA' });
  const overAllocated = structuredClone(OFFICIAL);
  overAllocated.Holdings[0].Weight = '19.34';
  assert.throws(() => parseVanEckPortfolioHoldings(overAllocated), { code: 'INVALID_DATA' }, '100.01% equity coverage is rejected, never normalized to 100%');
});

test('VanEck rejects truncated tail holdings even when cash, footer and plausible totals remain', () => {
  for (const removed of [1, 5]) {
    const data = structuredClone(OFFICIAL);
    data.Holdings = data.Holdings.filter(row => row.LabelOrder <= 25 - removed || row.LabelOrder >= 9999);
    assert.throws(() => parseVanEckPortfolioHoldings(data), { code: 'INVALID_DATA' });
  }
});

test('VanEck cash, unsupported securities and unknown ticker labels remain unresolved', () => {
  for (const mutate of [
    row => { row.AssetClass = 'Future'; },
    row => { row.Label = '--'; },
    row => { row.Label = '2330 TT'; },
    row => { row.Label = 'NVDA.US'; },
  ]) {
    const data = structuredClone(OFFICIAL);
    mutate(data.Holdings[0]);
    const parsed = parseVanEckPortfolioHoldings(data);
    assert.equal(parsed.holdings.length, 24);
    assert.ok(parsed.holdings.every(row => row.symbol !== 'NVDA'));
    assert.ok(Math.abs(parsed.totalWeight - 100) < 1e-9, 'unresolved allocation remains in the source total');
  }
});

test('VanEck retains precision and uses ADR classification only when explicitly disclosed', () => {
  const data = structuredClone(OFFICIAL);
  data.Holdings[0].Weight = '19.271234';
  data.Holdings[1].AssetClass = 'ADR';
  const parsed = parseVanEckPortfolioHoldings(data);
  assert.equal(parsed.holdings[0].weightPct, 19.271234);
  assert.equal(parsed.holdings[1].securityType, 'adr');
  assert.equal(parsed.holdings.find(row => row.symbol === 'ASML').securityType, 'stock', 'country is not an ADR classifier');
});
