import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const scopeStart = source.indexOf('  const isTqqqTradeEntry =');
const scopeEnd = source.indexOf(';', source.indexOf('  const isGenericLedgerTradeEntry =', scopeStart)) + 1;
const modalStart = source.indexOf('<ActionModalCard', source.indexOf('{showAddTrade && ('));
const modalTagEnd = source.indexOf('\n          >', modalStart);
assert.ok(scopeStart >= 0 && scopeEnd > scopeStart && modalStart >= 0 && modalTagEnd > modalStart,
  'the integration fixture must select the real trade-entry scope and modal props');

// Compile the production modal props so action dispatch and scope boundaries are
// exercised without reproducing their conditions in a test-only implementation.
const fixtureSource = `
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  import { isTqqqFormalTradeEntry } from ${JSON.stringify(new URL('../src/lib/tqqqTradeDiscipline.js', import.meta.url).href)};
  const ActionModalCard = 'action-modal';
  const TqqqTradeAmount = 'tqqq-trade-amount';
  const GenericLedgerTradeAmount = 'generic-trade-amount';
  const TradeCostPreview = 'trade-cost-preview';
  const TQQQ_ACTION_TONE_CLASSES = { buy: { confirm: 'buy-confirm' }, sell: { confirm: 'sell-confirm' } };
  const tt = (_key, fallback) => fallback;
  export default function tradeModal({
    newTrade, tradeEntryScope, tradeSubmitting, tqqqTradePreview, tradeCostPreview,
    confirmTradeSubmit, setShowAddTrade, setNewTrade = () => {},
    logoCache = {}, cacheStockLogo = () => {},
  }) {
    ${source.slice(scopeStart, scopeEnd)}
    return (${source.slice(modalStart, modalTagEnd)} />);
  }
`;
const compiled = await transformWithOxc(fixtureSource, 'trade-entry-modal-props.jsx', { jsx: { runtime: 'classic' } });
const { default: tradeModal } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);

function modal(options = {}) {
  const submitted = [];
  const closed = [];
  const draft = options.draft || { symbol: 'NVDA', side: 'buy', price: '123.45', shares: '20', date: '2026-10-05' };
  const preview = options.preview || { inputReady: true, hardBlocked: false };
  const costPreview = options.costPreview || { applies: true, symbol: draft.symbol, current: { status: 'unavailable' }, after: { status: 'unavailable' } };
  const element = tradeModal({
    newTrade: draft,
    tradeEntryScope: options.scope || 'ledger',
    tradeSubmitting: options.submitting || false,
    tqqqTradePreview: preview,
    tradeCostPreview: costPreview,
    confirmTradeSubmit: side => submitted.push(side),
    setShowAddTrade: open => closed.push(open),
  });
  return { props: element.props, submitted, closed, draft, preview, costPreview };
}

function footerElements(node) {
  if (!React.isValidElement(node)) return [];
  return node.type === React.Fragment
    ? React.Children.toArray(node.props.children).flatMap(footerElements)
    : [node];
}

function assertCostFooter(result, amountType) {
  const children = footerElements(result.props.footerContent);
  assert.deepEqual(children.map(child => child.type), [amountType, 'trade-cost-preview'],
    'cost is a read-only preview below the existing amount and before the confirmation actions');
  const [amount, cost] = children;
  assert.equal(cost.props.preview, result.costPreview, 'the footer must receive the calculated ledger preview without rebuilding it');
  assert.deepEqual(Object.keys(cost.props).sort(), ['preview', 'tt'], 'the cost footer must not receive draft or transaction mutation callbacks');
  return amount;
}

test('ordinary formal trades have one confirmation for the current direction and their own fixed amount', () => {
  for (const side of ['buy', 'sell']) {
    const draft = { symbol: 'NVDA', side, price: '123.45', shares: '20', date: '2026-10-05' };
    const result = modal({ draft, preview: { inputReady: true, hardBlocked: true } });
    assert.equal(result.props.headerContent, undefined, 'stock identity belongs inside the ordinary trade panel');
    assert.equal(result.props.actions.length, 1);
    assert.equal(result.props.actions[0].label, side === 'sell' ? '确认卖出' : '确认买入');
    assert.equal(result.props.actions[0].disabled, false, 'ordinary trades must not inherit the TQQQ allocation block');
    result.props.actions[0].onClick();
    assert.deepEqual(result.submitted, [side]);
    const amount = assertCostFooter(result, 'generic-trade-amount');
    assert.equal(amount.props.draft, draft, 'the estimate must use the same draft that is confirmed');
    assert.equal(amount.props.preview, undefined);
  }
});

test('formal TQQQ preserves its dedicated amount, current-side confirmation, and hard block', () => {
  for (const side of ['buy', 'sell']) {
    const result = modal({ draft: { symbol: 'tqqq.us', side }, preview: { inputReady: true, hardBlocked: true } });
    assert.equal(result.props.actions.length, 1);
    assert.equal(result.props.actions[0].disabled, true);
    assert.equal(result.props.actions[0].className, `${side}-confirm`);
    result.props.actions[0].onClick();
    assert.deepEqual(result.submitted, [side]);
    const amount = assertCostFooter(result, 'tqqq-trade-amount');
    assert.equal(amount.props.preview, result.preview);
    assert.equal(amount.props.side, side);
  }
  const incomplete = modal({ draft: { symbol: 'TQQQ', side: 'buy' }, preview: { inputReady: false, hardBlocked: true } });
  assert.equal(incomplete.props.actions[0].disabled, false, 'an incomplete draft must still reach the existing form validation');
});

test('wave entries preserve independent buy and sell actions without a formal-ledger amount', () => {
  for (const symbol of ['NVDA', 'TQQQ']) {
    const result = modal({ scope: 'wave', draft: { symbol, side: 'sell' } });
    assert.deepEqual(result.props.actions.map(action => action.label), ['买入', '卖出']);
    assert.equal(result.props.footerContent, null);
    assert.equal(result.props.panelClassName, 'min-h-0');
    result.props.actions.forEach(action => action.onClick());
    assert.deepEqual(result.submitted, ['buy', 'sell']);
  }
});

test('saving disables every entry action and prevents closing for all entry scopes', () => {
  for (const [scope, symbol] of [['ledger', 'NVDA'], ['ledger', 'TQQQ'], ['wave', 'NVDA']]) {
    const result = modal({ scope, draft: { symbol, side: 'buy' }, submitting: true });
    assert.ok(result.props.actions.length > 0);
    assert.ok(result.props.actions.every(action => action.disabled && action.label === '保存中...'));
    result.props.onClose();
    assert.deepEqual(result.closed, []);
    const idle = modal({ scope, draft: { symbol, side: 'buy' } });
    idle.props.onClose();
    assert.deepEqual(idle.closed, [false]);
  }
});

test('formal cost preview receives ledger readiness and error state instead of treating an unloaded ledger as empty', () => {
  const costStart = source.indexOf('  const tradeCostPreview = React.useMemo(');
  const costEnd = source.indexOf('  const tqqqTradePreview =', costStart);
  assert.ok(costStart >= 0 && costEnd > costStart);
  const costBinding = source.slice(costStart, costEnd);
  for (const binding of ['stockTrades,', 'draft: newTrade', 'scope: tradeEntryScope',
    'holdingsReady: showAddTrade && stockHoldingsReady', 'holdingsError: stockHoldingsError']) {
    assert.ok(costBinding.includes(binding), `cost calculation must receive ${binding}`);
  }
  assert.match(source, /stockHoldingsReady\s*=\s*false/);
  assert.match(costBinding, /\[newTrade, showAddTrade, stockTrades, stockHoldingsReady, stockHoldingsError, tradeEntryScope\]/,
    'readiness, errors, edits, and ledger refreshes must invalidate the cost preview');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const appContext = app.slice(app.indexOf('const tabCtx ='));
  assert.match(appContext, /stockTrades,\s*stockHoldingsReady,\s*stockHoldingsError,/,
    'the production tab must receive actual load state with its ledger');
  const designPreview = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
  assert.match(designPreview, /stockTrades: tradePreviewStockTrades,\s*stockHoldingsReady: true,\s*stockHoldingsError: null,/,
    'only the local fixture declares its synthetic ledger ready');
});

test('ordinary RSI reference is scoped to the authenticated stock and never receives a ledger-write callback', () => {
  const panelStart = source.indexOf('<GenericLedgerTradeEntryPanel', modalStart);
  const panelEnd = source.indexOf('\n              ) : (', panelStart);
  assert.ok(panelStart > modalStart && panelEnd > panelStart);
  const panel = source.slice(panelStart, panelEnd);
  const reference = panel.slice(panel.indexOf('<StockLiveRsiReference'));
  assert.match(source, /const tradeReferenceSymbol = normalizeStrictUserStockSymbol\(newTrade\?\.symbol\)/);
  assert.equal((source.match(/<StockLiveRsiReference\b/g) || []).length, 1, 'the ordinary live reference should have exactly one mount inside its entry branch');
  assert.match(source.slice(panelStart - 80, panelStart), /isGenericLedgerTradeEntry\s*\?\s*\(/);
  assert.match(reference, /key=\{`\$\{ctx\.user\?\.id \|\| 'signed-out'\}:\$\{tradeReferenceSymbol\}`\}/, 'switching owner or symbol must reset the live reference identity');
  for (const binding of ['symbol={tradeReferenceSymbol}', 'userId={ctx.user?.id}', 'authClient={ctx.supabase?.auth}',
    'tradeDate={newTrade.date}', 'quote={quoteBySymbol.get(tradeReferenceSymbol)}', 'side={newTrade.side}']) {
    assert.ok(reference.includes(binding), `the reference must preserve ${binding}`);
  }
  assert.match(panel, /referenceContent=\{import\.meta\.env\.DEV && ctx\.stockTradePreviewContent \? ctx\.stockTradePreviewContent : \(/,
    'preview content must remain gated to development builds');
  assert.match(panel, /showMarketReference=\{false\}/, 'the live reference owns the single market-data display');
  assert.match(reference, /renderMarketReference=\{quote => newTrade\.side !== 'sell'\s*\?/,
    'only a buy draft shows market context from the same quote fetch');
  assert.match(reference, /deriveStockTradeMarketReference\(\{ symbol: tradeReferenceSymbol, quote, vix, vixDataDate \}\)/);
  assert.doesNotMatch(reference, /setNewTrade|onDraftChange|confirmTradeSubmit|addTrade|insertStockTrade|updateStockTrade/,
    'reference state must never mutate the draft or submit a transaction');
  assert.doesNotMatch(source, /import[^\n]+(?:StockRsiDesignPreview|stockRsiFixtures|StockTradeDesignPreview)/,
    'production trades must not import design-only data');
});
