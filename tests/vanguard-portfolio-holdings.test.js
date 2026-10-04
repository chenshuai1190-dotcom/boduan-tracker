import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseVanguardPortfolioHoldings, VGT_FUND_URL, VGT_STATISTICS_URL, VGT_HOLDINGS_URL,
} from '../server/quote/vanguardPortfolioHoldings.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/portfolio-overlap/vgt-official/${name}`, import.meta.url)));
const official = {
  fund: fixture('fund-2026-10-04.json'),
  statistics: fixture('statistics-2026-08-31.json'),
  holdings: fixture('holdings-2026-08-31.json'),
};
const portfolio = payload => payload.holdings[payload.holdings.latestEffectiveDate];
const checkInvalid = mutate => {
  const payload = structuredClone(official);
  mutate(payload);
  assert.throws(() => parseVanguardPortfolioHoldings(payload), { code: 'INVALID_DATA' });
};

test('the official VGT disclosure retains full five-decimal equity weights and dated stock count', () => {
  const parsed = parseVanguardPortfolioHoldings(official);
  assert.equal(parsed.asOfDate, '2026-08-31');
  assert.equal(parsed.reportedHoldingCount, 318);
  assert.equal(parsed.holdings.length, 318);
  assert.deepEqual(parsed.holdings[0], {
    symbol: 'NVDA', name: 'NVIDIA Corp', weightPct: 17.72927, exchange: 'US', securityType: 'stock',
  });
  assert.equal(parsed.holdings.find(row => row.symbol === 'AAPL').weightPct, 15.78849);
  assert.ok(Math.abs(parsed.holdings.reduce((sum, row) => sum + row.weightPct, 0) - 99.67615) < 1e-9);
  assert.ok(Math.abs(parsed.totalWeight - 100.00007) < 1e-9);
  assert.equal(parsed.holdings.some(row => ['USD', 'MKTLIQ', 'SLBBH1142'].includes(row.symbol)), false);
  assert.equal(new Set(parsed.holdings.map(row => row.symbol)).size, parsed.holdings.length);
});

test('all three response sources are fixed official Vanguard endpoints for fund 0958', () => {
  assert.equal(VGT_FUND_URL, 'https://advisors.vanguard.com/investments/products/api/funds/0958');
  assert.equal(VGT_STATISTICS_URL, `${VGT_FUND_URL}/analytics/portfolio-statistics`);
  assert.equal(VGT_HOLDINGS_URL, `${VGT_FUND_URL}/holdings/latest`);
});

test('a bare basket, another fund, or a non-equity/non-ETF identity is rejected', () => {
  assert.throws(() => parseVanguardPortfolioHoldings(official.holdings), { code: 'INVALID_DATA' });
  for (const value of [null, [], '', 0]) assert.throws(() => parseVanguardPortfolioHoldings(value), { code: 'INVALID_DATA' });
  for (const [key, value] of [
    ['portId', '0965'], ['fundIdentifier', 'VTI'], ['fundName', 'Vanguard Total Stock Market ETF'],
    ['isETF', false], ['isEquity', false], ['isIndex', false],
  ]) checkInvalid(payload => { payload.fund[key] = value; });
  checkInvalid(payload => { delete payload.fund; });
  checkInvalid(payload => { delete payload.statistics; });
});

test('the stock count and reporting date must match the complete holdings response', () => {
  checkInvalid(payload => { portfolio(payload).equity.pop(); });
  checkInvalid(payload => { payload.statistics.CSTOCK += 1; });
  checkInvalid(payload => { payload.statistics.CSTOCK = '318'; });
  checkInvalid(payload => { payload.statistics.effectiveDate = '2026-07-31'; });
  checkInvalid(payload => { payload.holdings.latestEffectiveDate = '2026-02-30'; });
  checkInvalid(payload => { payload.holdings.latestEffectiveDate = '08/31/2026'; });
  checkInvalid(payload => { delete payload.holdings['2026-08-31']; });
  checkInvalid(payload => { portfolio(payload).equity = {}; });
  checkInvalid(payload => { delete portfolio(payload).derivatives; });
});

test('invalid weights and proportion units cannot masquerade as percentage weights', () => {
  for (const value of [null, '', '17.72927', '17.72927%', NaN, Infinity, -0.1, 101]) {
    checkInvalid(payload => { portfolio(payload).equity[0].percentOfFunds = value; });
  }
  checkInvalid(payload => {
    for (const group of ['equity', 'fixedIncome', 'shortTermReserves', 'derivatives']) {
      for (const row of portfolio(payload)[group]) row.percentOfFunds /= 100;
    }
  });
  checkInvalid(payload => { portfolio(payload).shortTermReserves[0].percentOfFunds = null; });
  checkInvalid(payload => { portfolio(payload).derivatives[0].percentOfFunds = '0.05914'; });
});

test('cash and derivative weights count once without expanding synthetic exposure', () => {
  const changed = structuredClone(official);
  // These display views duplicate other assets; they must not inflate totals.
  portfolio(changed).allocationToUnderlyingFunds.push({ percentOfFunds: 75 });
  portfolio(changed).shortTermReservesMoneyMarket.push({ percentOfFunds: 75 });
  const parsed = parseVanguardPortfolioHoldings(changed);
  assert.equal(parsed.holdings.length, 318);
  assert.ok(Math.abs(parsed.totalWeight - 100.00007) < 1e-9);
  assert.ok(portfolio(changed).shortTermReserves.some(row => row.percentOfFunds < 0));
  assert.equal(parsed.holdings.some(row => /TRS:|E-MINI/.test(row.name)), false);
});

test('unknown countries, receipt types, symbols and cash remain unresolved without renormalization', () => {
  for (const mutate of [
    row => { row.country = 'CA'; },
    row => { row.securityDepositoryReceiptType = 'UNKNOWN'; },
    row => { row.ticker = ''; },
    row => { row.ticker = 'USD'; row.holdingName = 'US Dollar'; },
    row => { row.holdingName = 'NASDAQ futures'; },
  ]) {
    const changed = structuredClone(official);
    mutate(portfolio(changed).equity[0]);
    const parsed = parseVanguardPortfolioHoldings(changed);
    assert.equal(parsed.holdings.length, 317);
    assert.equal(parsed.holdings.some(row => row.symbol === 'NVDA'), false);
    assert.equal(parsed.holdings.find(row => row.symbol === 'AAPL').weightPct, 15.78849);
    assert.ok(Math.abs(parsed.totalWeight - 100.00007) < 1e-9);
  }
});

test('explicit US ADR classification is preserved and a foreign receipt is not assumed US-listed', () => {
  const changed = structuredClone(official);
  portfolio(changed).equity[0].securityDepositoryReceiptType = 'ADR';
  assert.equal(parseVanguardPortfolioHoldings(changed).holdings[0].securityType, 'adr');
  portfolio(changed).equity[0].country = 'NL';
  assert.equal(parseVanguardPortfolioHoldings(changed).holdings.some(row => row.symbol === 'NVDA'), false);
});

test('duplicate securities, malformed names and overweight baskets fail closed', () => {
  checkInvalid(payload => { portfolio(payload).equity[1].ticker = 'NVDA'; });
  checkInvalid(payload => { portfolio(payload).equity[0].holdingName = ''; });
  checkInvalid(payload => { delete portfolio(payload).equity[0].country; });
  checkInvalid(payload => { delete portfolio(payload).equity[0].securityDepositoryReceiptType; });
  // Raw weight remains below 100.5%, but recognized equities would exceed 100%.
  checkInvalid(payload => { portfolio(payload).equity[0].percentOfFunds += 0.4; });
  checkInvalid(payload => { portfolio(payload).derivatives[0].percentOfFunds += 1; });
});

test('parsing does not mutate the provider disclosure', () => {
  const before = structuredClone(official);
  parseVanguardPortfolioHoldings(official);
  assert.deepEqual(official, before);
});
