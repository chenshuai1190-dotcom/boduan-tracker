import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveBuyTradeDiscipline } from '../src/lib/buyTradeDiscipline.js';
import { normalizeConfirmModalOptions } from '../src/lib/confirmModal.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { getInvestmentComparisonExpectedCloseDate } from '../src/lib/investmentComparison.js';
import { stockRsiLocalDateKey } from '../src/lib/stockRsiReference.js';
import { normalizeStrictUserStockSymbol } from '../src/lib/symbols.js';
import { deriveTqqqTradePreview } from '../src/lib/tqqqTradeDiscipline.js';
import { getVixComparisonExpectedCloseDate } from '../src/lib/vixComparisonSession.js';
import { formatWaveUsdPrice } from '../src/lib/waveCurrencyDisplay.js';

const source = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const handlerStart = source.indexOf('  const confirmTradeSubmit =');
const handlerEnd = source.indexOf('\n  const toggleToolPanel =', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'the fixture must compile the real confirmation handler');

// Execute the actual production handler with real discipline and TQQQ ledger
// models. Only UI context and the final persistence callback are supplied by
// the fixture, so a changed branch cannot be concealed by a copied condition.
const createHandler = new Function('context', `
  const { newTrade, tradeEntryScope, tradeSubmitting, stockTrades, quoteRows,
    summary, usdRate, tradeRsiReference, tradeVixRatioReference, buyDisciplinePreview,
    englishMode, showTradeFormNotice, showConfirm, setNewTrade, addTrade,
    normalizeStrictUserStockSymbol, deriveTqqqTradePreview, deriveBuyTradeDiscipline,
    formatWaveUsdPrice, tt, fmtAmount, sharesText, sideLabel, stockDisplayName } = context;
  ${source.slice(handlerStart, handlerEnd)}
  return confirmTradeSubmit;
`);

const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = stockRsiLocalDateKey(NOW);
const quotes = ['TQQQ', 'NVDA', 'AAPL'].map(symbol => ({ symbol, price: 100,
  dailyPnlLocked: false, dailyPnlSession: 'regular' }));
const baseTrades = [{ id: 'apple', symbol: 'AAPL', side: 'buy', price: 100, shares: 100, date: '2026-10-01' }];

function fixture(options = {}) {
  const draft = { symbol: 'NVDA', name: '英伟达', side: 'buy', price: '187.50', shares: '1', date: TODAY, ...options.draft };
  const stockTrades = options.stockTrades || baseTrades;
  const quoteRows = options.quoteRows || quotes;
  const confirmations = [], notices = [], writes = [], updates = [];
  const format = value => String(value);
  const submit = createHandler({
    newTrade: draft, tradeEntryScope: options.scope || 'ledger', tradeSubmitting: Boolean(options.submitting),
    stockTrades, quoteRows, summary: deriveInvestmentSummary({ stockTrades, watchlist: quoteRows }), usdRate: 7.2,
    tradeRsiReference: options.rsiReference ?? { status: 'ready', observation: { value: 78.2, asOf: getInvestmentComparisonExpectedCloseDate(NOW) } },
    tradeVixRatioReference: options.vixReference ?? { vixRatioReady: true, vixRatioValue: 0.89,
      vixRatioDataDate: getVixComparisonExpectedCloseDate(NOW) },
    buyDisciplinePreview: { now: NOW }, englishMode: Boolean(options.englishMode),
    showTradeFormNotice: (...args) => notices.push(args),
    showConfirm: value => confirmations.push(normalizeConfirmModalOptions(value)),
    setNewTrade: update => updates.push(update(draft)),
    addTrade: async side => { writes.push(side); if (options.saveError) throw options.saveError; },
    normalizeStrictUserStockSymbol, deriveTqqqTradePreview, deriveBuyTradeDiscipline, formatWaveUsdPrice,
    tt: (_key, fallback) => fallback, fmtAmount: format, sharesText: value => `${value} 股`,
    sideLabel: side => side === 'sell' ? '卖出' : '买入', stockDisplayName: (symbol, name) => name || symbol,
  });
  return { draft, submit, confirmations, notices, writes, updates };
}

test('ordinary and TQQQ buys reach the shared discipline confirmation before the original save callback', async () => {
  for (const symbol of ['NVDA', 'TQQQ']) {
    const f = fixture({ draft: { symbol, name: symbol } });
    f.submit();
    assert.deepEqual(f.writes, [], 'opening confirmation must not write a trade');
    assert.equal(f.notices.length, 0);
    assert.equal(f.confirmations.length, 1);
    const confirmation = f.confirmations[0];
    assert.equal(confirmation.buyDiscipline.discipline.status, 'unmet');
    assert.deepEqual(confirmation.buyDiscipline.trade, { symbol, name: symbol, shares: 1, price: 187.5, date: TODAY });
    assert.equal(confirmation.buyDiscipline.allocationWarning, null);
    assert.equal(confirmation.buyDiscipline.englishMode, false);
    assert.equal(f.updates.length, 1);
    assert.equal(f.updates[0].side, 'buy');
    await confirmation.onConfirm();
    assert.deepEqual(f.writes, ['buy'], 'only the explicit callback delegates to the existing buy save');
  }
});

test('TQQQ allocation and unavailable-valuation warnings coexist with the shared discipline result', () => {
  const overLimit = fixture({ draft: { symbol: 'TQQQ', shares: '20' }, englishMode: true });
  overLimit.submit();
  assert.match(overLimit.confirmations[0].buyDiscipline.allocationWarning, /10%/);
  assert.equal(overLimit.confirmations[0].buyDiscipline.discipline.status, 'unmet');
  assert.equal(overLimit.confirmations[0].buyDiscipline.englishMode, true);
  assert.deepEqual(overLimit.writes, []);
  const unavailable = fixture({ draft: { symbol: 'TQQQ' }, quoteRows: [] });
  unavailable.submit();
  assert.match(unavailable.confirmations[0].buyDiscipline.allocationWarning, /估值未就绪/);
  assert.equal(unavailable.confirmations[0].buyDiscipline.discipline.status, 'unmet');
});

test('historical and edited buys keep the new layout but do not judge past decisions with current signals', () => {
  for (const symbol of ['NVDA', 'TQQQ']) {
    for (const patch of [{ date: '2026-10-02' }, { id: 'edited-buy' }, { editingId: 'edited-buy' }]) {
      const f = fixture({ draft: { symbol, ...patch } });
      f.submit();
      const result = f.confirmations[0].buyDiscipline.discipline;
      assert.equal(result.status, 'historical');
      assert.equal(result.applies, false);
      assert.equal(result.rsi.value, null);
      assert.equal(result.vix.value, null);
      assert.deepEqual(f.writes, []);
    }
  }
});

test('sell and wave confirmations preserve their original scope and omit buy-discipline content', async () => {
  for (const [scope, symbol, side] of [['ledger', 'NVDA', 'sell'], ['ledger', 'TQQQ', 'sell'],
    ['wave', 'NVDA', 'buy'], ['wave', 'TQQQ', 'buy'], ['wave', 'TQQQ', 'sell']]) {
    const f = fixture({ scope, draft: { symbol, side }, stockTrades: [...baseTrades,
      { id: 'tqqq', symbol: 'TQQQ', side: 'buy', date: '2026-10-01', price: 100, shares: 10 }] });
    f.submit();
    assert.equal(f.confirmations.length, 1);
    assert.equal(f.confirmations[0].buyDiscipline, null);
    if (scope === 'wave') assert.match(f.confirmations[0].title, /波段/);
    assert.deepEqual(f.writes, []);
    await f.confirmations[0].onConfirm();
    assert.deepEqual(f.writes, [side]);
  }
});

test('existing TQQQ hard blocks still stop before the discipline dialog and before saving', () => {
  const cases = [
    fixture({ draft: { symbol: 'TQQQ', shares: '1.5' } }),
    fixture({ draft: { symbol: 'TQQQ', side: 'sell', shares: '1' } }),
    fixture({ draft: { symbol: 'TQQQ', id: 'original-buy', shares: '1', date: '2026-10-01' },
      stockTrades: [...baseTrades,
        { id: 'original-buy', symbol: 'TQQQ', side: 'buy', date: '2026-10-01', price: 100, shares: 10 },
        { id: 'following-sell', symbol: 'TQQQ', side: 'sell', date: '2026-10-02', price: 100, shares: 10 }] }),
  ];
  for (const f of cases) {
    f.submit();
    assert.equal(f.notices.length, 1);
    assert.deepEqual(f.confirmations, []);
    assert.deepEqual(f.writes, []);
  }
});

test('pending saves and invalid draft inputs do not bypass existing validation', () => {
  const pending = fixture({ submitting: true });
  pending.submit();
  assert.deepEqual(pending.confirmations, []);
  assert.deepEqual(pending.notices, []);
  assert.deepEqual(pending.writes, []);
  for (const draft of [{ price: '' }, { shares: '-1' }, { symbol: 'INVALID CODE' }]) {
    const f = fixture({ draft });
    f.submit();
    assert.equal(f.notices.length, 1);
    assert.deepEqual(f.confirmations, []);
    assert.deepEqual(f.writes, []);
  }
});

test('confirmation normalization retains the shared payload and save failures propagate without a duplicate write', async () => {
  const payload = { discipline: { status: 'unknown' }, trade: { symbol: 'NVDA' } };
  const callback = async () => {};
  const normalized = normalizeConfirmModalOptions({ buyDiscipline: payload, onConfirm: callback });
  assert.equal(normalized.buyDiscipline, payload);
  assert.equal(normalized.onConfirm, callback);
  assert.equal(normalizeConfirmModalOptions({}).buyDiscipline, null);

  const error = new Error('save unavailable');
  const f = fixture({ saveError: error });
  f.submit();
  await assert.rejects(f.confirmations[0].onConfirm, error);
  assert.deepEqual(f.writes, ['buy']);
});
