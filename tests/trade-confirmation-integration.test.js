import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeConfirmModalOptions } from '../src/lib/confirmModal.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { stockRsiLocalDateKey } from '../src/lib/stockRsiReference.js';
import { normalizeStrictUserStockSymbol } from '../src/lib/symbols.js';
import { deriveTqqqTradePreview } from '../src/lib/tqqqTradeDiscipline.js';
import { formatWaveUsdPrice } from '../src/lib/waveCurrencyDisplay.js';
import { getStockTradeRecordKind, normalizeStockTradeDraftKind, withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';

const source = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const handlerStart = source.indexOf('  const confirmTradeSubmit =');
const handlerEnd = source.indexOf('\n  const toggleToolPanel =', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'the fixture must compile the real confirmation handler');

// Exercise the production handler with the actual TQQQ ledger validation.
const createHandler = new Function('context', `
  const { newTrade, tradeEntryScope, tradeSubmitting, stockTrades, quoteRows,
    summary, usdRate,
    englishMode, showTradeFormNotice, showConfirm, setNewTrade, addTrade,
    normalizeStrictUserStockSymbol, deriveTqqqTradePreview,
    getStockTradeRecordKind, normalizeStockTradeDraftKind,
    formatWaveUsdPrice, tt, fmtAmount, sharesText, sideLabel } = context;
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
    englishMode: Boolean(options.englishMode),
    showTradeFormNotice: (...args) => notices.push(args),
    showConfirm: value => confirmations.push(normalizeConfirmModalOptions(value)),
    setNewTrade: update => updates.push(update(draft)),
    addTrade: async side => { writes.push(side); if (options.saveError) throw options.saveError; },
    normalizeStrictUserStockSymbol, deriveTqqqTradePreview, formatWaveUsdPrice,
    getStockTradeRecordKind, normalizeStockTradeDraftKind,
    tt: (_key, fallback) => fallback, fmtAmount: format, sharesText: value => `${value} 股`,
    sideLabel: side => side === 'sell' ? '卖出' : '买入',
  });
  return { draft, submit, confirmations, notices, writes, updates };
}

test('ordinary and TQQQ buys open the standard confirmation before saving', async () => {
  for (const symbol of ['NVDA', 'TQQQ']) {
    const f = fixture({ draft: { symbol, name: symbol } });
    f.submit();
    assert.deepEqual(f.writes, [], 'opening confirmation must not write a trade');
    assert.equal(f.notices.length, 0);
    assert.equal(f.confirmations.length, 1);
    const confirmation = f.confirmations[0];
    assert.equal(confirmation.title, '确认保存正式交易?');
    assert.equal(confirmation.info, `${symbol} · 买入 1 股 @ 187.50`);
    assert.equal(confirmation.confirmText, '确认保存');
    assert.equal(confirmation.showCancel, true);
    assert.equal(f.updates.length, 1);
    assert.equal(f.updates[0].side, 'buy');
    await confirmation.onConfirm();
    assert.deepEqual(f.writes, ['buy'], 'only the explicit callback delegates to the existing buy save');
  }
});

test('editing existing historical holdings keeps the historical-record confirmation', async () => {
  for (const symbol of ['NVDA', 'TQQQ']) {
    const note = withStockTradeRecordKind('历史均价汇总', 'historical_holding');
    const f = fixture({ draft: { id: 'existing-holding', recordKind: 'historical_holding', symbol, name: symbol, note } });
    f.submit();
    assert.equal(f.notices.length, 0);
    assert.equal(f.confirmations.length, 1);
    assert.match(f.confirmations[0].title, /保存历史持仓/);
    assert.match(f.confirmations[0].desc, /录入日期不代表实际买入日/);
    assert.equal(f.updates[0].note, note);
    assert.equal(f.updates[0].recordKind, 'historical_holding');
    assert.deepEqual(f.writes, []);
    await f.confirmations[0].onConfirm();
    assert.deepEqual(f.writes, ['buy']);
  }
});

test('TQQQ allocation warnings use the standard confirmation and still allow the buy', async () => {
  const overLimit = fixture({ draft: { symbol: 'TQQQ', shares: '20' } });
  overLimit.submit();
  assert.match(overLimit.confirmations[0].title, /买入后超过10%提醒线/);
  assert.equal(overLimit.confirmations[0].confirmText, '仍然买入');
  assert.deepEqual(overLimit.writes, []);
  await overLimit.confirmations[0].onConfirm();
  assert.deepEqual(overLimit.writes, ['buy']);
  const unavailable = fixture({ draft: { symbol: 'TQQQ' }, quoteRows: [] });
  unavailable.submit();
  assert.match(unavailable.confirmations[0].title, /当前无法计算10%提醒/);
  assert.match(unavailable.confirmations[0].desc, /估值未就绪/);
  assert.deepEqual(unavailable.writes, []);
});

test('historical and edited buys use the appropriate standard confirmation', () => {
  for (const symbol of ['NVDA', 'TQQQ']) {
    for (const patch of [{ date: '2026-10-02' }, { id: 'edited-buy' }, { editingId: 'edited-buy' }]) {
      const originalId = patch.id || patch.editingId;
      const stockTrades = originalId ? [...baseTrades, {
        id: originalId, symbol, side: 'buy', shares: 1, price: 100, date: '2026-10-01',
      }] : baseTrades;
      const f = fixture({ draft: { symbol, ...patch }, stockTrades });
      f.submit();
      assert.equal(f.confirmations[0].title, patch.date ? '确认保存正式交易?' : '确认修改正式交易?');
      assert.equal(f.confirmations[0].confirmText, '确认保存');
      assert.deepEqual(f.writes, []);
    }
  }
});

test('sell and wave confirmations preserve their original save scope', async () => {
  for (const [scope, symbol, side] of [['ledger', 'NVDA', 'sell'], ['ledger', 'TQQQ', 'sell'],
    ['wave', 'NVDA', 'buy'], ['wave', 'TQQQ', 'buy'], ['wave', 'TQQQ', 'sell']]) {
    const f = fixture({ scope, draft: { symbol, side }, stockTrades: [...baseTrades,
      { id: 'tqqq', symbol: 'TQQQ', side: 'buy', date: '2026-10-01', price: 100, shares: 10 }] });
    f.submit();
    assert.equal(f.confirmations.length, 1);
    if (scope === 'wave') assert.match(f.confirmations[0].title, /波段/);
    assert.deepEqual(f.writes, []);
    await f.confirmations[0].onConfirm();
    assert.deepEqual(f.writes, [side]);
  }
});

test('TQQQ validation stops invalid orders before confirmation or saving', () => {
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

test('confirmation forwards save failures without another write', async () => {
  const error = new Error('save unavailable');
  const f = fixture({ saveError: error });
  f.submit();
  await assert.rejects(f.confirmations[0].onConfirm, error);
  assert.deepEqual(f.writes, ['buy']);
});
