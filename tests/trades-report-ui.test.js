import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveHoldingDisplayPrice } from '../src/lib/homeMarketDisplay.js';
import { derivePositionAllocation } from '../src/lib/investmentSummary.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const trades = read('src/tabs/TradesTab.jsx');
const css = read('src/tabs/TradesTab.css');
const positionsView = read('src/components/TradesPositionsReport.jsx');
const positionsCss = read('src/components/TradesPositionsReport.css');
const i18n = read('src/lib/i18n.js');
const modelStart = trades.indexOf('const positionReportRows = positions.map((position) => {');
const modelEnd = trades.indexOf('const renderOrderRow =', modelStart);
assert.ok(modelStart >= 0 && modelEnd > modelStart, 'the report view model must remain bounded in TradesTab');
const modelSource = trades.slice(modelStart, modelEnd);

function deriveRows(positions, { currency = 'USD', rate = 1 } = {}) {
  const summary = { activePositions: positions, positionsMarketValue: 5000 };
  const dependencies = {
    positions, summary, displayRate: rate, displayCurrency: currency,
    marketColorMode: 'redUpGreenDown', logoCache: {},
    stockNameParts: (symbol, name) => ({ title: name, subtitle: symbol }),
    stockLogoCandidates: (symbol) => [`local-logo:${symbol}`],
    toNumber: (value) => Number.isFinite(Number(value)) ? Number(value) : 0,
    resolveHoldingDisplayPrice, derivePositionAllocation,
    currencyAmount: (value, currency, digits) => ({ value, currency, digits }),
    signedCurrency: (value, currency, digits) => ({ value, currency, digits, signed: true }),
    fmtAmount: (value, digits) => ({ value, digits }),
    signedPct: (value, digits) => ({ value, digits, percent: true }),
    pnlClass: (value, mode) => `${mode}:${value}`,
  };
  return Function(...Object.keys(dependencies), `${modelSource}\nreturn positionReportRows;`)(...Object.values(dependencies));
}

const position = (overrides = {}) => ({
  symbol: 'NVDA', name: '英伟达', heldShares: 12.75, marketValue: 1234.56,
  currentPrice: 999, dailyPnlLocked: true, dailyPnlPrice: 105.6789,
  effectiveCost: 99.1234, avgCost: 80, hasTodayPnl: true, todayPnl: -12.34,
  todayPnlPct: -.0123, holdingPnl: 234.56, unrealizedPnl: 456,
  holdingPnlPct: .23456, unrealizedPct: .9, ...overrides,
});

test('Trading report preserves its financial readiness, actions, currency and four tool entries', () => {
  const order = ['data-trades-net-assets-card="true"', 'className="trades-report-tools"', 'className="trades-report-ledger"', '<TradesPositionsReport'];
  const indexes = order.map((marker) => trades.indexOf(marker));
  assert.ok(indexes.every((index, offset) => index >= 0 && (!offset || index > indexes[offset - 1])));
  assert.ok(trades.includes("{tt('trades.marketValue', '持仓市值')}</span>"), 'holdings summary title must not repeat the currency selector label');
  assert.ok(trades.includes('currencyAmount(toNumber(summary.positionsMarketValue) * displayRate, displayCurrency, 2)'), 'holdings market value must still follow the selected currency and preserve cents');
  for (const invariant of [
    'assetStatusReady = marginStatusReady && availableCashStatusReady',
    'availableCashWriteReady = availableCashStatusReady && availableCashStatus?.writeReady === true',
    'availableCashReversalReady = availableCashWriteReady && availableCashStatus?.reversalReady === true',
    'disabled={!availableCashWriteReady}', 'onClick={() => setShowAvailableCashEditor(true)}',
    'onClick={openPnlShare}', 'onClick={openPnlReport}', 'onClick={openHomeMarginRisk}',
    'hasTodayPnl && summary.todayPnlLocked', 'availableCashStatusReady ? currencyAmount(displayAvailableCash',
    'availableCashIsSet ? 2 : 0', 'onLoadCashMovements={loadAvailableCashMovements}',
    'onMutateCash={availableCashWriteReady ? mutateAvailableCash : null}',
    'onReverseCashMovement={availableCashReversalReady ? reverseAvailableCashMovement : null}',
    'aria-pressed={currencyMode === mode} onClick={() => setCurrencyMode(mode)}',
  ]) assert.ok(trades.includes(invariant), `Trading must retain ${invariant}`);
  for (const id of ['waves', 'competition', 'records', 'all']) {
    assert.ok(trades.includes(`{ id: '${id}', label:`), `tool entry ${id} must stay reachable`);
  }
  assert.match(css, /\.trades-report-tools\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});

test('position presentation preserves every existing numeric source, precision, FX conversion and original row', () => {
  const original = position();
  for (const [currency, rate] of [['USD', 1], ['CNY', 7]]) {
    const [row] = deriveRows([original], { currency, rate });
    assert.strictEqual(row.position, original);
    assert.equal(row.title, original.name);
    assert.equal(row.subtitle, original.symbol);
    assert.deepEqual(row.marketValue, { value: original.marketValue * rate, currency, digits: 2 });
    assert.deepEqual(row.quantity, { value: 12.75, digits: 0 });
    assert.deepEqual(row.price, { value: 105.6789, digits: 3 }, 'locked close, not raw live price or FX-converted price');
    assert.deepEqual(row.cost, { value: 99.1234, digits: 3 }, 'effective unit cost remains canonical USD');
    assert.deepEqual(row.todayPnl, { value: -12.34 * rate, currency, digits: 2, signed: true });
    assert.deepEqual(row.todayPnlPct, { value: -.0123, digits: 2, percent: true });
    assert.deepEqual(row.holdingPnl, { value: 234.56 * rate, currency, digits: 2, signed: true });
    assert.deepEqual(row.holdingPnlPct, { value: .23456, digits: 2, percent: true });
    assert.equal(row.allocation, '24.7%');
    assert.equal(row.todayPnlClass, `redUpGreenDown:${-12.34 * rate}`);
    assert.equal(row.holdingPnlClass, `redUpGreenDown:${234.56 * rate}`);
    assert.equal(row.todayPnlPctClass, 'redUpGreenDown:-0.0123');
    assert.equal(row.holdingPnlPctClass, 'redUpGreenDown:0.23456');
  }
  assert.equal(original.currentPrice, 999, 'presentation must not overwrite raw provider price');
});

test('unavailable daily P&L and quotes remain missing while valid zero and unrealized fallbacks retain their meaning', () => {
  const [missing] = deriveRows([position({ hasTodayPnl: false, dailyPnlPrice: null })]);
  assert.equal(missing.price, '--');
  assert.equal(missing.todayPnl, '--');
  assert.equal(missing.todayPnlPct, '--');
  assert.equal(missing.todayPnlClass, '');
  assert.equal(missing.todayPnlPctClass, '');
  const [zero] = deriveRows([position({ dailyPnlLocked: false, currentPrice: 120, holdingPnl: 0, holdingPnlPct: 0, todayPnl: 0, todayPnlPct: 0 })]);
  assert.equal(zero.price.value, 120);
  assert.equal(zero.holdingPnl.value, 0);
  assert.equal(zero.holdingPnlPct.value, 0);
  assert.equal(zero.todayPnl.value, 0);
  assert.equal(zero.todayPnlPct.value, 0);
  const [fallback] = deriveRows([position({ holdingPnl: null, holdingPnlPct: null, effectiveCost: 0 })]);
  assert.equal(fallback.holdingPnl.value, 456);
  assert.equal(fallback.holdingPnlPct.value, .9);
  assert.equal(fallback.cost.value, 80);
  assert.deepEqual(deriveRows([]), []);
});

test('stock details, scenario and record-trade actions stay separate and preserve formal ledger mutations', () => {
  assert.ok(trades.includes("onOpenStock={(row) => (typeof openStockDetail === 'function' ? openStockDetail(row.symbol) : openTradeModal(row.position, 'buy'))}"));
  assert.ok(trades.includes('onScenario={(row) => openPositionScenario(row.position)}'));
  assert.ok(trades.includes("onTrade={(row) => openTradeModal(row.position, 'buy')}"));
  assert.ok(trades.includes("onClick={() => openTradeModal(null, 'buy')}"));
  const openTrade = trades.slice(trades.indexOf('const openTradeModal ='), trades.indexOf('const openPositionScenario ='));
  assert.ok(openTrade.includes("setTradeEntryScope('ledger')") && openTrade.includes('price: position?.currentPrice ?'));
  assert.ok(trades.includes("setTradeEntryScope('wave')"));
  assert.ok(trades.includes('await addTrade(tradeDraft.side);'));
  assert.ok(trades.includes('deleteStockTradeRecord(trade.id)'));
  assert.ok(trades.includes('onClick={() => setOrderActionTrade(trade)}'));
  assert.ok(trades.includes('ledgerTradeRecords.map((trade) => renderOrderRow(trade, true))'));
  assert.ok(trades.includes('todayTrades.map((trade) => renderOrderRow(trade))'));
  for (const key of ['trades.reportScenario', 'trades.reportRecordTrade']) {
    assert.equal(i18n.split(`'${key}':`).length - 1, 2, `${key} must exist in Chinese and English`);
  }
});

test('trade records have a vertical-only viewport and rows fit without clipping their monetary values', () => {
  const list = css.match(/\.trades-report-record-list\s*\{([^}]+)\}/)?.[1];
  assert.ok(list);
  assert.match(list, /overflow-x:\s*hidden;/);
  assert.match(list, /overflow-y:\s*auto;/);
  assert.match(list, /touch-action:\s*pan-y;/);
  assert.match(list, /max-width:\s*100%;/);
  const row = css.match(/\.trades-report-order\s*\{([^}]+)\}/)?.[1];
  assert.ok(row);
  assert.match(row, /width:\s*100%;/);
  assert.match(row, /min-width:\s*0;/);
  assert.match(row, /max-width:\s*100%;/);
  assert.match(row, /appearance:\s*none;/, 'WebKit buttons must use the same explicit row geometry');
  const main = css.match(/\.trades-report-order-main\s*\{([^}]+)\}/)?.[1];
  assert.match(main, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.5fr\) 14px;/,
    'reserve the entire 14px arrow and prioritize long amounts over company names');
  const start = trades.indexOf('const renderOrderRow =');
  const end = trades.indexOf('return (\n    <>', start);
  const render = trades.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(render.includes('<ChevronRight size={14}'));
  assert.ok(render.includes('currencyAmount(amount, displayCurrency, 2)'));
  assert.match(css, /\.trades-report-order-amount\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(css, /\.trades-report-order-amount\s*\{[^}]*(?:text-overflow|overflow:\s*hidden)/,
    'the full amount must remain readable, not just hide the overflow');
  assert.match(positionsCss, /\.trades-positions-report\s*\{[^}]*overflow-x:\s*auto;/,
    'record drift fix must not disable horizontal holdings scrolling');
});

test('Trading report keeps one horizontal holdings table, fixed identity column and untouched page shell', () => {
  assert.ok(positionsView.includes('data-trade-positions-table="horizontal"'));
  assert.match(positionsCss, /\.trades-positions-report\s*\{[^}]*overflow-x:\s*auto;/);
  assert.match(positionsCss, /\.tpr-table\s*\{[^}]*min-width:\s*550px;/);
  assert.match(positionsCss, /\.tpr-table td:first-child\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;[^}]*background:\s*#050609;/);
  const columns = ['trades.nameTicker', 'trades.valueQty', 'trades.priceCost', 'trades.dailyPnl', 'trades.positionPnl', 'trades.allocation'];
  const indexes = columns.map((key) => positionsView.indexOf(`tt('${key}'`));
  assert.equal((positionsView.match(/<th scope="col">/g) || []).length, 6);
  assert.ok(indexes.every((index, offset) => index >= 0 && (!offset || index > indexes[offset - 1])));
  assert.doesNotMatch(css, /overflow-x:\s*(?:auto|scroll)/);
  assert.doesNotMatch(css + positionsCss, /(?:^|[}\n])\s*(?:html|body|#root|nav)\s*\{/);
  assert.doesNotMatch(css, /100vh|100dvh|position:\s*fixed|box-shadow|linear-gradient|radial-gradient/);
  for (const field of ['market-value', 'holding-pnl', 'holding-pnl-pct', 'today-pnl', 'today-pnl-pct', 'quantity', 'price', 'cost', 'allocation']) {
    assert.ok(positionsView.includes(`data-position-field="${field}"`), `report must preserve ${field}`);
  }
  for (const match of (css + positionsCss).matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(match[1]) >= 10);
  assert.match(css, /\.trades-report-pnl-amount\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(positionsCss, /\.tpr-value\s*\{[^}]*white-space:\s*nowrap;/);
  assert.doesNotMatch(positionsCss, /\.tpr-(?:value|secondary)\s*\{[^}]*(?:overflow:\s*hidden|text-overflow:)/);
});

test('compact first-screen spacing preserves financial content and reachable tools above the horizontal table', () => {
  const rule = (selector) => {
    const match = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .find(([, selectors]) => selectors.split(',').some((candidate) => candidate.trim() === selector));
    assert.ok(match, `missing layout rule ${selector}`);
    return match[2];
  };
  const pixels = (selector, property) => {
    const value = rule(selector).match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`))?.[1];
    assert.ok(value, `missing ${property} in ${selector}`);
    assert.match(value, /^(?:\d+(?:\.\d+)?(?:px)?\s*)+$/, `${selector} ${property} must have measurable spacing`);
    return value.trim().split(/\s+/).map(parseFloat);
  };
  const verticalEdges = (values) => values[0] + (values[2] ?? values[0]);
  const hero = '.trades-report-hero';
  const tools = '.trades-report-tools';
  const toolButton = '.trades-report-tools button';
  const summary = '.trades-report-holdings-summary';
  const blocks = [hero, '.trades-report-net-amount', '.trades-report-pnl-grid', '.trades-report-pnl-amount',
    '.trades-report-pnl-percent', '.trades-report-balances', '.trades-report-balance-value', tools, toolButton,
    '.trades-report-ledger', summary, '.trades-report-holdings-value', '.trades-report-holdings-pnl'];
  const compactRules = blocks.map(rule).join('\n');

  // This bounds decorative spacing, not actual viewport height; browser checks cover rendered first-screen content.
  const spacingBudget = verticalEdges(pixels(hero, 'padding'))
    + pixels('.trades-report-net-amount', 'margin-top')[0]
    + pixels('.trades-report-pnl-grid', 'margin-top')[0]
    + pixels('.trades-report-pnl-amount', 'margin-top')[0]
    + pixels('.trades-report-pnl-percent', 'margin-top')[0]
    + pixels('.trades-report-balances', 'margin-top')[0]
    + pixels('.trades-report-balances', 'padding-top')[0]
    + pixels('.trades-report-balances', 'gap')[0]
    + 2 * pixels('.trades-report-balance-value', 'margin-top')[0]
    + verticalEdges(pixels(tools, 'padding'))
    + pixels('.trades-report-ledger', 'padding-top')[0]
    + verticalEdges(pixels(summary, 'margin'))
    + pixels('.trades-report-holdings-value', 'margin-top')[0];
  assert.ok(spacingBudget <= 150, `first-screen vertical spacing must stay compact, got ${spacingBudget}px`);
  assert.ok(verticalEdges(pixels(tools, 'padding')) <= 20);
  assert.ok(pixels(toolButton, 'min-height')[0] >= 44, 'compact tools retain a usable touch target');
  assert.ok(pixels(toolButton, 'min-height')[0] <= 48);
  assert.ok(pixels(toolButton, 'gap')[0] <= 6);
  assert.doesNotMatch(compactRules, /(?:display:\s*none|visibility:\s*hidden|opacity:\s*0(?:[;\s])|overflow:\s*hidden|max-height:)/,
    'first-screen density must come from spacing, not hiding or clipping financial data');
  assert.match(rule('.trades-report-balances'), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(rule('.trades-report-pnl-grid'), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.ok(positionsView.includes('data-trade-positions-table="horizontal"'));
  assert.match(positionsCss, /\.trades-positions-report\s*\{[^}]*overflow-x:\s*auto;/);
});

test('positions columns preserve precise widths and horizontally accessible financial text', () => {
  const rule = selector => [...positionsCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some(candidate => candidate.trim() === selector))
    .map(([, , body]) => body).join('\n');
  const minWidth = selector => Number(rule(selector).match(/min-width:\s*(\d+)px;/)?.[1]);
  const firstFour = [minWidth('.tpr-table td:first-child'), minWidth('.tpr-table td:nth-child(2)'),
    minWidth('.tpr-table td:nth-child(3)'), minWidth('.tpr-table td:nth-child(4)')];
  assert.ok(firstFour.every(Number.isFinite));
  assert.deepEqual(firstFour, [70, 110, 74, 102], 'only market value gains 2px; identity, current price and daily P&L widths are unchanged');
  assert.equal(firstFour.reduce((sum, width) => sum + width, 0), 356, 'the four column minimums gain exactly 2px in total');
  assert.match(rule('.trades-positions-report'), /overflow-x:\s*auto;/, 'narrow screens keep financial columns accessible by horizontal scrolling');
  assert.match(rule('.tpr-table'), /width:\s*max-content;/);
  assert.match(rule('.tpr-table td:first-child'), /(?:^|\n)\s*width:\s*70px;/);
  assert.match(rule('.tpr-table td:first-child'), /max-width:\s*70px;/);
  assert.match(rule('.tpr-stock'), /(?:^|\n)\s*width:\s*62px;/, 'the identity content gains the same 2px while preserving its 8px trailing padding');
  assert.match(rule('.tpr-stock-title'), /text-overflow:\s*ellipsis;/);
  assert.match(rule('.tpr-stock-subtitle'), /text-overflow:\s*ellipsis;/);
  assert.match(rule('.tpr-value'), /font-size:\s*13px;/);
  assert.match(rule('.tpr-secondary'), /font-size:\s*11px;/);
  for (const selector of ['.tpr-value', '.tpr-secondary']) {
    assert.match(rule(selector), /white-space:\s*nowrap;/);
    assert.doesNotMatch(rule(selector), /overflow:\s*hidden|text-overflow:\s*ellipsis/);
  }
});

test('Trading report retains two main tool separators without extra financial or holdings container borders', () => {
  const rule = (source, selector) => {
    const matches = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',').some((candidate) => candidate.trim() === selector));
    assert.ok(matches.length, `missing style rule ${selector}`);
    return matches.map((match) => match[2]).join('\n');
  };
  for (const [source, selector] of [
    [css, '.trades-report-balances'],
    [positionsCss, '.trades-positions-report'],
  ]) {
    assert.doesNotMatch(rule(source, selector), /(?:^|;)\s*border(?:-[\w-]+)?\s*:/,
      `${selector} must separate sections with spacing, not decorative borders`);
  }
  const toolsRule = rule(css, '.trades-report-tools');
  const toolBorders = [...toolsRule.matchAll(/(?:^|;)\s*(border(?:-[\w-]+)?)\s*:/g)]
    .map((match) => match[1]).sort();
  assert.deepEqual(toolBorders, ['border-bottom', 'border-top'], 'tools retain only two main separators');
  for (const edge of ['top', 'bottom']) {
    assert.match(toolsRule, new RegExp(`border-${edge}:\\s*1px solid rgba\\(255,\\s*255,\\s*255,\\s*0?\\.06\\);`),
      `the ${edge} main separator remains faint`);
  }
  assert.match(rule(positionsCss, '.tpr-table td'),
    /border-top:\s*1px solid rgba\(255,\s*255,\s*255,\s*0?\.045\);/,
    'horizontal holdings rows retain faint separators for scanning');
});
