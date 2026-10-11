import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTradeExposurePreview } from '../src/lib/tradeExposurePreview.js';
import { deriveTradeCostPreview } from '../src/lib/tradeCostPreview.js';

// Artificial contract weights, not a fund's published holdings.
const source = { provider: 'Contract fixture', url: 'https://example.test/holdings', basis: 'instrument_identity' };
const metadata = (symbol, kind = 'stock', changes = {}) => ({
  symbol, name: symbol, kind, source, holdingsStatus: 'not_applicable', asOfDate: null,
  fetchedAt: '2026-10-10T12:00:00Z', stale: false, reason: null, coveragePct: null, holdings: [], ...changes,
});
const fund = (symbol, weights) => metadata(symbol, 'plain_etf', {
  source: { ...source, basis: 'fund_holdings' }, holdingsStatus: 'partial', asOfDate: '2026-10-09',
  coveragePct: Object.values(weights).reduce((sum, weight) => sum + weight, 0),
  holdings: Object.entries(weights).map(([symbol, weightPct]) => ({ symbol, name: symbol, weightPct, exchange: 'US', securityType: 'stock' })),
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const holding = (symbol, amount) => ({ symbol, amount });
const nvda = model => model.companies.find(row => row.symbol === 'NVDA');

test('compares verified direct plus ETF exposure using the full before/after stock denominator', () => {
  const result = deriveTradeExposurePreview({
    currentHoldings: [holding('NVDA', 100), holding('QQQ', 900)],
    afterHoldings: [holding('NVDA', 200), holding('QQQ', 900)],
    instruments: [metadata('NVDA'), fund('QQQ', { NVDA: 20, MSFT: 80 })],
  });
  assert.equal(result.reason, null);
  assert.equal(result.partial, false);
  assert.equal(result.current.total, 1000);
  assert.equal(result.after.total, 1100);
  assert.equal(nvda(result).currentAmount, 280);
  assert.equal(nvda(result).afterAmount, 380);
  assert.equal(nvda(result).currentDirectAmount, 100);
  assert.equal(nvda(result).currentIndirectAmount, 180);
  assert.equal(nvda(result).afterIndirectAmount, 180);
  near(nvda(result).currentPercent, 28);
  near(nvda(result).afterPercent, 380 / 1100 * 100);
  near(nvda(result).deltaPercent, 380 / 1100 * 100 - 28);
  assert.equal(nvda(result).deltaAmount, 100);
  near(result.topFive.current, 100);
  near(result.topFive.after, 100);
  near(result.topFive.delta, 0);
});

test('partial fund baskets retain source gaps and denominator, never renormalize or turn unseen companies into zero', () => {
  const result = deriveTradeExposurePreview({
    currentHoldings: [holding('QQQ', 1000)],
    afterHoldings: [holding('QQQ', 1000), holding('NVDA', 500)],
    instruments: [fund('QQQ', { MSFT: 20 }), metadata('NVDA')],
  });
  assert.equal(result.partial, true);
  assert.equal(result.current.identifiedOnly, true);
  assert.equal(result.current.unexpandedAmount, 800);
  assert.equal(result.current.identifiedPercent, 20);
  assert.equal(nvda(result).currentAmount, null);
  assert.equal(nvda(result).currentPercent, null);
  assert.equal(nvda(result).afterAmount, 500);
  near(nvda(result).afterPercent, 500 / 1500 * 100);
  assert.equal(nvda(result).deltaAmount, null);
  assert.equal(nvda(result).deltaPercent, null);
  near(result.topFive.after, 700 / 1500 * 100);
  assert.equal(result.current.positions[0].metadata.asOfDate, '2026-10-09');
  assert.equal(result.current.positions[0].metadata.source.url, source.url);
});

test('unavailable instruments and leveraged ETFs remain in the denominator without synthetic 3x exposure', () => {
  const result = deriveTradeExposurePreview({
    currentHoldings: [holding('NVDA', 100), holding('SMH', 400), holding('TQQQ', 500)],
    afterHoldings: [holding('NVDA', 100), holding('SMH', 400), holding('TQQQ', 1000)],
    instruments: [metadata('NVDA'), metadata('TQQQ', 'leveraged_etf', { leverage: 3 })],
  });
  assert.equal(result.current.total, 1000);
  assert.equal(result.current.unexpandedAmount, 400);
  assert.equal(result.current.leveragedAmount, 500);
  assert.equal(result.after.leveragedAmount, 1000);
  assert.deepEqual(result.companies.map(row => row.symbol), ['NVDA']);
  assert.equal(nvda(result).currentPercent, 10);
  near(nvda(result).afterPercent, 100 / 1500 * 100);
  assert.equal(nvda(result).deltaAmount, 0);
  assert.equal(result.partial, true);
});

test('unknown or malformed valuations suppress only that side and never show a fake loss', () => {
  for (const afterHoldings of [undefined, null, {}, [holding('NVDA', null)], [holding('NVDA', -1)], [holding('NVDA', Infinity)]]) {
    const result = deriveTradeExposurePreview({ currentHoldings: [holding('NVDA', 100)], afterHoldings, instruments: [metadata('NVDA')] });
    assert.equal(result.after, null);
    assert.equal(result.reason, 'valuation-unavailable');
    assert.equal(nvda(result).currentAmount, 100);
    assert.equal(nvda(result).afterAmount, null);
    assert.equal(nvda(result).deltaAmount, null);
    assert.equal(result.topFive.after, null);
    assert.equal(result.topFive.delta, null);
  }
});

test('known fully disclosed additions and disposals can use zero; empty portfolios have no percentage denominator', () => {
  const instruments = [metadata('NVDA'), metadata('MSFT')];
  const result = deriveTradeExposurePreview({ currentHoldings: [holding('MSFT', 100)], afterHoldings: [holding('NVDA', 100)], instruments });
  assert.equal(nvda(result).currentAmount, 0);
  assert.equal(nvda(result).currentPercent, 0);
  assert.equal(nvda(result).deltaPercent, 100);
  const sold = result.companies.find(row => row.symbol === 'MSFT');
  assert.equal(sold.afterAmount, 0);
  assert.equal(sold.deltaAmount, -100);
  const closed = deriveTradeExposurePreview({ currentHoldings: [holding('NVDA', 100)], afterHoldings: [], instruments });
  assert.equal(closed.after.total, 0);
  assert.equal(nvda(closed).afterAmount, 0);
  assert.equal(nvda(closed).afterPercent, null);
  assert.equal(closed.topFive.after, null);
});

test('top-five concentration uses independently ranked company aggregates, including overlapping ETFs', () => {
  const symbols = ['A', 'B', 'C', 'D', 'E', 'F'];
  const currentHoldings = symbols.map((symbol, index) => holding(symbol, 6 - index));
  const afterHoldings = symbols.map((symbol, index) => holding(symbol, symbol === 'F' ? 10 : 6 - index));
  const result = deriveTradeExposurePreview({ currentHoldings, afterHoldings, instruments: symbols.map(symbol => metadata(symbol)) });
  near(result.topFive.current, 20 / 21 * 100);
  near(result.topFive.after, 28 / 30 * 100);
  near(result.topFive.delta, 28 / 30 * 100 - 20 / 21 * 100);
  assert.equal(result.companies[0].symbol, 'F');
});

test('formal replay integration values the ending ledger at current quotes and honors edited/historical transactions', () => {
  const stockTrades = [
    { id: '1', symbol: 'NVDA', side: 'buy', date: '2026-09-01', price: 100, shares: 10 },
    { id: '2', symbol: 'QQQ', side: 'buy', date: '2026-09-01', price: 50, shares: 10 },
  ];
  const quoteRows = [{ symbol: 'NVDA', price: 120 }, { symbol: 'QQQ', price: 100 }];
  const preview = deriveTradeCostPreview({ stockTrades, quoteRows, holdingsReady: true,
    draft: { symbol: 'NVDA', side: 'sell', date: '2026-10-11', price: '999', shares: '5' } });
  const model = deriveTradeExposurePreview({ currentHoldings: preview.portfolio.current,
    afterHoldings: preview.portfolio.after, instruments: [metadata('NVDA'), fund('QQQ', { NVDA: 50, MSFT: 50 })] });
  assert.equal(nvda(model).currentAmount, 1700);
  assert.equal(nvda(model).afterAmount, 1100);
  near(nvda(model).afterPercent, 1100 / 1600 * 100);
});

test('comparison never mutates holdings or shared metadata', () => {
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  const input = freeze({ currentHoldings: [holding('QQQ', 100)], afterHoldings: [holding('QQQ', 200)],
    instruments: { version: 1, instruments: [fund('QQQ', { NVDA: 50, MSFT: 50 })] } });
  const before = JSON.stringify(input);
  assert.equal(deriveTradeExposurePreview(input).after.total, 200);
  assert.equal(JSON.stringify(input), before);
});
