import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deriveInvestmentSummary, derivePositionAllocation } from '../src/lib/investmentSummary.js';
import {
  TQQQ_ALLOCATION_LIMIT,
  deriveTqqqMarketReference,
  deriveTqqqTradePreview,
  isTqqqFormalTradeEntry,
} from '../src/lib/tqqqTradeDiscipline.js';

const quoteRows = [
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', price: 100, week52High: 120, dailyPnlLocked: false, dailyPnlSession: 'regular' },
  { symbol: 'AAPL', name: 'Apple', price: 100, week52High: 110, dailyPnlLocked: false, dailyPnlSession: 'regular' },
  { symbol: 'QQQ', name: 'Invesco QQQ', price: 95, week52High: 100, dailyPnlLocked: false, dailyPnlSession: 'regular' },
];

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tradesTabSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../src/components/TqqqTradeEntryPanel.jsx', import.meta.url), 'utf8');
const panelCss = readFileSync(new URL('../src/components/TqqqTradeEntryPanel.css', import.meta.url), 'utf8');
const disciplineSource = readFileSync(new URL('../src/lib/tqqqTradeDiscipline.js', import.meta.url), 'utf8');
const actionModalSource = readFileSync(new URL('../src/components/ActionModalCard.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');

function preview(options = {}) {
  const stockTrades = options.stockTrades || [];
  const currentSummary = deriveInvestmentSummary({ stockTrades, watchlist: options.quoteRows || quoteRows });
  return deriveTqqqTradePreview({
    stockTrades,
    quoteRows: options.quoteRows || quoteRows,
    currentSummary,
    draft: options.draft,
    scope: options.scope || 'ledger',
  });
}

test('activates only for the formal TQQQ ledger entry', () => {
  assert.equal(isTqqqFormalTradeEntry({ symbol: 'TQQQ', scope: 'ledger' }), true);
  assert.equal(isTqqqFormalTradeEntry({ symbol: 'tqqq.us', scope: 'ledger' }), true);
  assert.equal(isTqqqFormalTradeEntry({ symbol: 'TQQQ', scope: 'wave' }), false);
  assert.equal(isTqqqFormalTradeEntry({ symbol: 'SQQQ', scope: 'ledger' }), false);
  assert.equal(isTqqqFormalTradeEntry({ symbol: 'TQQQX', scope: 'ledger' }), false);
  assert.equal(deriveTqqqTradePreview({ draft: { symbol: 'NVDA' }, scope: 'ledger' }).applies, false);
});

test('uses the exact transaction-page allocation helper and ignores cash in that ratio', () => {
  const stockTrades = [
    { id: 't1', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 10 },
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 90 },
  ];
  const withoutCash = deriveInvestmentSummary({ stockTrades, watchlist: quoteRows, cashUsd: 0 });
  const withCash = deriveInvestmentSummary({ stockTrades, watchlist: quoteRows, cashUsd: 1_000_000 });

  assert.equal(derivePositionAllocation(withoutCash, 'TQQQ'), 0.1);
  assert.equal(derivePositionAllocation(withCash, 'TQQQ'), 0.1);
});

test('allows an exact 10% projected buy and warns without blocking above it', () => {
  const stockTrades = [
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 90 },
  ];
  const exact = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: 74.29, shares: 10 },
  });
  const above = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: 74.29, shares: 11 },
  });

  assert.equal(exact.afterAllocation, TQQQ_ALLOCATION_LIMIT);
  assert.equal(exact.overLimit, false);
  assert.equal(exact.hardBlocked, false);
  assert.equal(above.afterAllocation > TQQQ_ALLOCATION_LIMIT, true);
  assert.equal(above.overLimit, true);
  assert.equal(above.hardBlocked, false);
  assert.equal(above.blockReason, 'allocation-limit');
});

test('projected allocation follows shared valuation price rather than entered execution price', () => {
  const stockTrades = [
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 90 },
  ];
  const cheap = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: 1, shares: 10 },
  });
  const expensive = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: 999, shares: 10 },
  });

  assert.equal(cheap.afterAllocation, expensive.afterAllocation);
  assert.notEqual(cheap.amountUsd, expensive.amountUsd);
});

test('keeps the current budget usage available while a new trade is still incomplete', () => {
  const stockTrades = [
    { id: 't1', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 12 },
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 988 },
  ];
  const incomplete = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: '', shares: '' },
  });

  assert.equal(incomplete.inputReady, false);
  assert.equal(Number(incomplete.currentAllocation.toFixed(3)), 0.012);
  assert.equal(Number(incomplete.currentBudgetUsage.toFixed(2)), 0.12);
  assert.equal(incomplete.afterAllocation, null);
  assert.equal(incomplete.afterBudgetUsage, null);
  assert.equal(incomplete.remainingAllocation, null);
});

test('previews partial and full sells and rejects overselling instead of accepting the clamped result', () => {
  const stockTrades = [
    { id: 't1', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 100 },
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 900 },
  ];
  const partial = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'sell', date: '2026-08-08', price: 110, shares: 40 },
  });
  const full = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'sell', date: '2026-08-08', price: 110, shares: 100 },
  });
  const oversell = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'sell', date: '2026-08-08', price: 110, shares: 101 },
  });

  assert.equal(partial.availableShares, 100);
  assert.equal(partial.remainingShares, 60);
  assert.equal(Number(partial.afterAllocation.toFixed(6)), Number((6000 / 96000).toFixed(6)));
  assert.equal(partial.hardBlocked, false);
  assert.equal(full.remainingShares, 0);
  assert.equal(full.afterAllocation, 0);
  assert.equal(full.hardBlocked, false);
  assert.equal(oversell.oversold, true);
  assert.equal(oversell.hardBlocked, true);
  assert.equal(oversell.blockReason, 'oversell');
});

test('replays the full dated ledger when deriving sell capacity', () => {
  const stockTrades = [
    { id: 'future-buy', symbol: 'TQQQ', side: 'buy', date: '2026-08-03', price: 80, shares: 10 },
  ];
  const historicalSell = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'sell', date: '2026-08-01', price: 90, shares: 1 },
  });

  assert.equal(historicalSell.currentHeldShares, 10);
  assert.equal(historicalSell.availableShares, 0);
  assert.equal(historicalSell.oversold, true);
});

test('uses the fully replayed ending position after a historical sell followed by a later buy', () => {
  const stockTrades = [
    { id: 'first-buy', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 100 },
    { id: 'later-buy', symbol: 'TQQQ', side: 'buy', date: '2026-08-03', price: 85, shares: 50 },
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 900 },
  ];
  const historicalSell = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'sell', date: '2026-08-02', price: 90, shares: 100 },
  });

  assert.equal(historicalSell.availableShares, 100);
  assert.equal(historicalSell.afterHeldShares, 50);
  assert.equal(historicalSell.remainingShares, 50);
  assert.equal(historicalSell.afterAllocation, 5000 / 95000);
  assert.equal(historicalSell.hardBlocked, false);
});

test('replaces an edited sell in place and reserves shares for later ledger sells', () => {
  const stockTrades = [
    { id: 'buy', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 100 },
    { id: 'edited-sell', symbol: 'TQQQ', side: 'sell', date: '2026-08-02', price: 90, shares: 40 },
    { id: 'later-sell', symbol: 'TQQQ', side: 'sell', date: '2026-08-03', price: 95, shares: 30 },
  ];
  const validEdit = preview({
    stockTrades,
    draft: { id: 'edited-sell', symbol: 'TQQQ', side: 'sell', date: '2026-08-02', price: 91, shares: 70 },
  });
  const invalidEdit = preview({
    stockTrades,
    draft: { id: 'edited-sell', symbol: 'TQQQ', side: 'sell', date: '2026-08-02', price: 91, shares: 71 },
  });

  assert.equal(validEdit.availableShares, 70);
  assert.equal(validEdit.remainingShares, 0);
  assert.equal(validEdit.hardBlocked, false);
  assert.equal(invalidEdit.availableShares, 70);
  assert.equal(invalidEdit.oversold, true);
});

test('blocks a buy edit that would invalidate a later formal TQQQ sale', () => {
  const stockTrades = [
    { id: 'edited-buy', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 100 },
    { id: 'later-sell', symbol: 'TQQQ', side: 'sell', date: '2026-08-03', price: 95, shares: 80 },
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 900 },
  ];
  const invalidEdit = preview({
    stockTrades,
    draft: { id: 'edited-buy', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 79 },
  });

  assert.equal(invalidEdit.breaksLedger, true);
  assert.equal(invalidEdit.hardBlocked, true);
  assert.equal(invalidEdit.blockReason, 'ledger-oversell');
});

test('rejects fractional TQQQ shares so preview and the integer formal save stay aligned', () => {
  const stockTrades = [
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 900 },
  ];
  const fractional = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: 74.29, shares: 1.9 },
  });

  assert.equal(fractional.invalidShares, true);
  assert.equal(fractional.hardBlocked, true);
  assert.equal(fractional.blockReason, 'whole-shares-required');
  assert.ok(appSource.includes('shares: tradeDraft.shares,'));
  assert.ok(appSource.includes('const sharesNum = isTqqqFormalDraft ? Number(tradeDraft.shares) : parseInt(tradeDraft.shares);'));
  assert.ok(appSource.includes('const priceNum = isTqqqFormalDraft ? Number(tradeDraft.price) : parseFloat(tradeDraft.price);'));
});

test('accepts scientific-number input with the same Number semantics used by the isolated TQQQ save path', () => {
  const stockTrades = [
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 9900 },
  ];
  const scientific = preview({
    stockTrades,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: '1e2', shares: '1e2' },
  });

  assert.equal(scientific.requestedShares, 100);
  assert.equal(scientific.price, 100);
  assert.equal(scientific.amountUsd, 10000);
  assert.equal(scientific.hardBlocked, false);
});

test('warns without blocking a TQQQ buy when the 10% valuation is unavailable and still permits a valid sell', () => {
  const stockTrades = [
    { id: 't1', symbol: 'TQQQ', side: 'buy', date: '2026-08-01', price: 80, shares: 100 },
    { id: 'a1', symbol: 'AAPL', side: 'buy', date: '2026-08-01', price: 90, shares: 900 },
  ];
  const rowsWithoutTqqq = quoteRows.filter((row) => row.symbol !== 'TQQQ');
  const buy = preview({
    stockTrades,
    quoteRows: rowsWithoutTqqq,
    draft: { symbol: 'TQQQ', side: 'buy', date: '2026-08-08', price: 90, shares: 1 },
  });
  const sell = preview({
    stockTrades,
    quoteRows: rowsWithoutTqqq,
    draft: { symbol: 'TQQQ', side: 'sell', date: '2026-08-08', price: 90, shares: 1 },
  });

  assert.equal(buy.blockReason, 'allocation-unavailable');
  assert.equal(buy.allocationUnavailable, true);
  assert.equal(buy.hardBlocked, false);
  assert.equal(sell.previewValuationReady, false);
  assert.equal(sell.hardBlocked, false);
});

test('derives only objective VIX and QQQ references with explicit unavailable states', () => {
  const unavailable = deriveTqqqMarketReference({ vix: 16.5, vixDataDate: '', qqqQuote: {} });
  const panic = deriveTqqqMarketReference({
    vix: 30,
    vixDataDate: '2026-08-08',
    qqqQuote: quoteRows.find((row) => row.symbol === 'QQQ'),
  });
  const extreme = deriveTqqqMarketReference({
    vix: 50,
    vixDataDate: '2026-08-08',
    qqqQuote: quoteRows.find((row) => row.symbol === 'QQQ'),
  });

  assert.equal(unavailable.vixSignal, 'unavailable');
  assert.equal(unavailable.qqqReady, false);
  assert.equal(panic.vixSignal, 'panic');
  assert.equal(panic.qqqDistanceFromHigh, -0.05);
  assert.equal(extreme.vixSignal, 'extreme');
});

test('keeps the dedicated UI isolated to formal TQQQ while preserving generic buy and sell actions', () => {
  assert.ok(disciplineSource.includes("scope === 'ledger' && normalizeStrictUserStockSymbol(symbol) === TQQQ_SYMBOL"));
  assert.ok(tradesTabSource.includes('{isTqqqTradeEntry ? ('));
  assert.ok(tradesTabSource.includes('<TqqqTradeEntryPanel'));
  assert.ok(tradesTabSource.includes("onClick: () => confirmTradeSubmit('buy')"));
  assert.ok(tradesTabSource.includes("onClick: () => confirmTradeSubmit('sell')"));
  assert.ok(appSource.includes('const tqqqValidation = deriveTqqqTradePreview({'));
  assert.ok(appSource.indexOf("if (tradeEntryScope === 'wave')") < appSource.indexOf('const tqqqValidation = deriveTqqqTradePreview({'));
  assert.ok(actionModalSource.includes("${action.className || ''}"));
  assert.ok(panelSource.includes('export const TQQQ_ACTION_TONE_CLASSES'));
  assert.ok(panelSource.includes('buy: TQQQ_NEUTRAL_ACTION_TONE_CLASSES'));
  assert.ok(panelSource.includes('sell: TQQQ_NEUTRAL_ACTION_TONE_CLASSES'));
  assert.ok(panelSource.includes("selected: 'tqqq-entry-side-selected'"));
  assert.ok(panelSource.includes("confirm: 'tqqq-entry-confirm'"));
  assert.match(panelCss, /\.tqqq-entry-side \.tqqq-entry-side-selected\s*\{[^}]*background:\s*#303133;/);
  assert.match(panelCss, /\.stock-report-modal \.tqqq-entry-confirm\s*\{[^}]*background:\s*#252628;/);
  assert.equal(panelSource.includes('bg-[linear-gradient(135deg,#10b981,#059669)]'), false);
  assert.equal(panelSource.includes('bg-[linear-gradient(135deg,#eb5360,#d63c4a)]'), false);
  assert.ok(tradesTabSource.includes("TQQQ_ACTION_TONE_CLASSES[newTrade.side === 'sell' ? 'sell' : 'buy'].confirm"));
  assert.ok(panelSource.includes('data-over-limit={preview.overLimit || preview.hardBlocked}'));
  assert.ok(panelSource.includes("preview.overLimit ? 'text-[#ff6570]'"));
  assert.ok(panelSource.includes('data-alert={preview.hardBlocked || preview.overLimit}'));
  assert.match(panelCss, /\.tqqq-entry-budget-fill\[data-alert="true"\]\s*\{[^}]*background:\s*#ff4b1f;/, 'an over-limit or blocked trade retains a prominent red warning line');
  assert.match(panelCss, /\.tqqq-entry-budget-track\s*\{[^}]*height:\s*5px;/, 'normal budget progress should retain its compact track');
  assert.match(panelCss, /\.tqqq-entry-check\[data-over-limit="true"\] \.tqqq-entry-budget-track\s*\{[^}]*height:\s*8px;/, 'an over-limit or blocked trade should thicken the warning track');
  assert.ok(panelSource.includes("tt('trades.tqqq.exceedsLimit', '买入后将超过10%仓位提醒线')") && panelSource.includes('<PreviewResult preview={preview} tt={tt} />'), 'the explicit 10% warning text must remain visible beside the budget treatment');
  assert.ok(panelSource.includes('data-warning-pulse={preview.overLimit && !preview.hardBlocked}'), 'only a non-blocking over-limit reminder should pulse');
  const pulseSelectors = [...panelCss.matchAll(/([^{}]+)\{[^{}]*animation:\s*tqqq-warning-pulse 1\.2s ease-in-out infinite;[^{}]*\}/g)]
    .flatMap((match) => match[1].split(',').map((selector) => selector.trim()));
  assert.deepEqual(pulseSelectors, ['.tqqq-entry-check[data-warning-pulse="true"] .tqqq-entry-budget-fill', '.tqqq-entry-check[data-warning-pulse="true"] .tqqq-entry-result svg'], 'the gentle pulse must affect only the warning line and icon, leaving the card and text static');
  assert.match(panelCss, /@keyframes tqqq-warning-pulse\s*\{\s*0%, 100%\s*\{\s*opacity:\s*1;\s*\}\s*50%\s*\{\s*opacity:\s*\.3;\s*\}\s*\}/);
  assert.match(panelCss, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.tqqq-entry-check\[data-warning-pulse="true"\] \.tqqq-entry-budget-fill,\s*\.tqqq-entry-check\[data-warning-pulse="true"\] \.tqqq-entry-result svg\s*\{\s*animation:\s*none;/, 'reduced motion should leave both warning indicators static');
  assert.doesNotMatch(panelSource + panelCss, /shouldFlashOverLimit|tqqq-over-limit-flash|box-shadow|drop-shadow|steps\(1, end\)/, 'the reminder should not restore whole-card glow or abrupt flashing');
  assert.equal(tradesTabSource.includes('!bg-[linear-gradient(135deg,#7c3ff2,#5d2bd0)]'), false);
  assert.ok(tradesTabSource.includes("tt('trades.tqqq.confirmAnyway', '仍然买入')"));
  assert.ok(disciplineSource.includes('const hardBlocked = invalidShares || oversold || breaksLedger;'));
  assert.ok(tradesTabSource.includes("tt('trades.tqqq.confirmUnavailableTitle'"));
  assert.ok(tradesTabSource.includes('disabled: tradeSubmitting || (tqqqTradePreview.inputReady && tqqqTradePreview.hardBlocked)'));
  assert.ok(tradesTabSource.includes("onClick: () => confirmTradeSubmit(newTrade.side === 'sell' ? 'sell' : 'buy')"));
  assert.ok(tradesTabSource.includes('onClose={() => !tradeSubmitting && setShowAddTrade(false)}'));
});

test('shows objective buy references only and keeps sell focused on the formal holdings check', () => {
  assert.ok(panelSource.includes("{side === 'buy' && <MarketReference"));
  assert.ok(panelSource.includes("{side === 'sell' && ("));
  assert.ok(panelSource.includes("tt('trades.tqqq.sellRuleTitle'"));
  assert.equal(panelSource.includes("tt('trades.tqqq.buyRules'"), false);
  assert.equal(panelSource.includes('>1</span>'), false);
  assert.equal(panelSource.includes('>2</span>'), false);
  assert.ok(panelSource.includes("if (value === null || value === undefined || value === '') return '--';"));
  assert.ok(panelSource.includes(': preview.currentBudgetUsage;'));
  assert.equal(panelSource.includes('grid grid-cols-2 sm:grid-cols-4'), false);
  assert.equal((panelSource.match(/<div className="tqqq-entry-metrics">/g) || []).length, 2);
  assert.match(panelCss, /\.tqqq-entry-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(panelCss, /\.tqqq-entry-market-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(panelCss, /\.tqqq-entry-metric\s*\{[^}]*text-align:\s*left;/);
  assert.equal(panelSource.includes('min-h-[30px]'), false);
  assert.doesNotMatch(panelCss, /\.tqqq-entry-(?:check|market-grid|sell-rule)\s*\{[^}]*(?:background:|box-shadow:|border-radius:)/, 'checks, market references and sell guidance should remain unboxed report sections');
  assert.doesNotMatch(panelSource, /budgetBubble|left: `clamp\(22px/, 'the budget reading should not return to a floating bubble');
  assert.ok(panelSource.includes('<span className="tqqq-entry-budget-value">{displayedBudgetLabel}</span>'));
  assert.ok(panelSource.includes('`${Math.round(displayedBudgetUsage * 100)}%`') && panelSource.includes('Math.min(100, Math.max(0, displayedBudgetUsage * 100))'), 'only the drawn track is clamped; the numeric budget reading retains its actual value');
  assert.ok(panelSource.includes('style={{ width: `${displayedBudgetPct}%` }}'));
  const dateStart = panelSource.indexOf('className="tqqq-entry-date"');
  assert.ok(dateStart > panelSource.indexOf('className="tqqq-entry-fields"') && dateStart < panelSource.indexOf('className="tqqq-entry-amount"'), 'the date field belongs with the inputs before the preview amount');
  assert.ok(panelSource.includes('tqqq-trade-date-input appearance-none pl-9 pr-9 text-center'));
  assert.ok(panelSource.includes("splitCurrencyAmount(preview.amountUsd, 'USD', 2)"));
  assert.ok(panelSource.includes('{preview.inputReady ? <>{amountParts.main}<span className="tqqq-entry-amount-decimal">{amountParts.decimal}</span></> : \'—\'}'), 'an incomplete draft should not show a fabricated zero estimate');
  assert.match(panelCss, /\.tqqq-entry-amount-decimal\s*\{[^}]*font-size:\s*\.64em;/);
  assert.doesNotMatch(panelCss, /letter-spacing:\s*-|scaleX\s*\(|font-weight:\s*(?:[5-9]00|bold)/, 'report numbers should retain normal weight, spacing and width');
  assert.equal(/market breadth|市场广度|maximum drawdown|最大回撤/i.test(panelSource), false);
});

test('keeps TQQQ report surfaces and controlled inputs consistent while omitting the redundant lookup hint', () => {
  assert.match(panelCss, /\.tqqq-entry-logo\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
  assert.match(panelCss, /\.tqqq-entry-tag\s*\{[^}]*background:\s*#1b1c1e;/);
  assert.match(panelCss, /\.tqqq-entry-side\s*\{[^}]*background:\s*#191a1c;/);
  assert.match(panelCss, /\.tqqq-entry-input\s*\{[^}]*height:\s*46px;[^}]*background:\s*#1b1c1e;[^}]*font-size:\s*18px;[^}]*font-weight:\s*400;[^}]*letter-spacing:\s*normal;/);
  assert.doesNotMatch(panelCss, /linear-gradient|radial-gradient|box-shadow/);
  assert.equal(panelSource.includes('rounded-[14px] border border-white/[0.08] bg-black/[0.18]'), false);
  assert.equal(panelSource.includes("tt('trades.systemManagedName'"), false);
  assert.equal(panelSource.includes('function LookupStatus'), false);
  assert.equal(panelSource.includes('lookupStatus'), false);
  assert.equal(tradesTabSource.includes('lookupStatus={lookupStatus}'), false);
  assert.ok(tradesTabSource.includes("panelClassName={isTqqqTradeEntry\n              ? 'stock-report-modal tqqq-trade-dialog'"));
  assert.ok(panelSource.includes('className="tqqq-entry-sell-rule"'));
  assert.ok(panelSource.includes('aria-pressed={selected}') && panelSource.includes('onClick={() => onDraftChange({ ...draft, side: option })}'));
  const inputs = panelSource.match(/<input\b[\s\S]*?\/>/g) || [];
  assert.equal(inputs.length, 3);
  for (const [field, attributes] of [
    ['price', ['type="number"', 'min="0"', 'step="0.01"', 'inputMode="decimal"']],
    ['shares', ['type="number"', 'min="0"', 'step="1"', 'inputMode="numeric"', "max={side === 'sell' ? preview.availableShares : undefined}", "aria-invalid={preview.blockReason === 'oversell' || preview.blockReason === 'whole-shares-required'}"]],
    ['date', ['type="date"', "WebkitAppearance: 'none'"]],
  ]) {
    const input = inputs.find((element) => element.includes(`id="tqqq-entry-${field}"`));
    assert.ok(input, `the ${field} input must remain accessible`);
    for (const attribute of attributes) assert.ok(input.includes(attribute), `${field} must retain ${attribute}`);
    assert.ok(input.includes(`value={draft?.${field} || ''}`) && input.includes(`onDraftChange({ ...draft, ${field}: event.target.value })`), `${field} must retain its controlled draft binding`);
    assert.ok(input.includes("colorScheme: 'dark'"));
    assert.ok(panelSource.includes(`htmlFor="tqqq-entry-${field}"`));
  }
});

test('ships every TQQQ-specific visible message in both Chinese and English dictionaries', () => {
  const keys = [...new Set([
    ...tradesTabSource.matchAll(/trades\.tqqq\.[A-Za-z0-9]+/g),
    ...panelSource.matchAll(/trades\.tqqq\.[A-Za-z0-9]+/g),
    ...appSource.matchAll(/trades\.tqqq\.[A-Za-z0-9]+/g),
  ].map((match) => match[0]))];
  assert.ok(keys.length > 0);
  keys.forEach((key) => {
    const occurrences = i18nSource.match(new RegExp(`'${key.replaceAll('.', '\\.')}'`, 'g')) || [];
    assert.equal(occurrences.length, 2, `${key} should have one Chinese and one English translation`);
  });
});
