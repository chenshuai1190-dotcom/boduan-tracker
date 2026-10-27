import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const source = readFileSync(new URL('../src/components/TradeToolsCatalog.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/TradeToolsCatalog.css', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'TradeToolsCatalog.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/TradeToolsCatalog\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const { default: TradeToolsCatalog } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const expectedGroups = [
  { key: 'trades.toolsResearch', zh: '对比与测算', tools: ['portfolio-overlap', 'investment-comparison', 'dca-lab', 'stock-decision', 'macro'] },
  { key: 'trades.toolsReview', zh: '交易复盘', tools: ['records', 'waves'] },
  { key: 'trades.toolsCommunity', zh: '社区互动', tools: ['competition'] },
];
const expectedTools = expectedGroups.flatMap(group => group.tools);
const titleKeys = ['trades.portfolioOverlap', 'trades.investmentTimeMachine', 'trades.dcaLab', 'trades.stockDecision', 'trades.macro', 'trades.tradeLog', 'trades.swingLog', 'competition.toolEntry'];

function nodesOfType(node, type) {
  if (!React.isValidElement(node)) return [];
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodesOfType(child, type))];
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}

function renderCatalog(props = {}) {
  let tree;
  function CaptureCatalog() {
    tree = TradeToolsCatalog(props);
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(CaptureCatalog));
  return { html, tree };
}

test('catalog groups eight unique tools with Macro after stock decision and no removed cost tool', () => {
  const { tree } = renderCatalog({ language: 'zh', onSelect() {} });
  const groups = nodesOfType(tree, 'section');
  assert.equal(groups.length, expectedGroups.length);
  groups.forEach((group, index) => {
    const heading = nodesOfType(group, 'h3')[0];
    assert.equal(textContent(heading), expectedGroups[index].zh);
    assert.equal(group.props['aria-labelledby'], heading.props.id);
    assert.deepEqual(nodesOfType(group, 'button').map(button => button.props['data-tool-id']), expectedGroups[index].tools);
  });
  const buttons = nodesOfType(tree, 'button');
  assert.deepEqual(buttons.map(button => button.props['data-tool-id']), expectedTools);
  assert.equal(new Set(buttons.map(button => button.props['data-tool-id'])).size, 8);
  assert.equal(buttons.some(button => button.props['data-tool-id'] === 'cost'), false);
});

test('each tool has a real icon and translated visible text in Chinese and English', () => {
  for (const language of ['zh', 'en']) {
    const { tree, html } = renderCatalog({ language, onSelect() {} });
    const headings = nodesOfType(tree, 'h3').map(textContent);
    assert.deepEqual(headings, expectedGroups.map(group => t(language, group.key)));
    for (const [index, button] of nodesOfType(tree, 'button').entries()) {
      assert.equal(button.props.type, 'button');
      assert.ok(textContent(button).includes(t(language, titleKeys[index])));
      assert.equal(Boolean(button.props.disabled), false);
      const markup = renderToStaticMarkup(button);
      assert.ok((markup.match(/<svg\b/g) || []).length >= 2, 'each tool needs its own icon in addition to a navigation chevron');
      assert.match(markup, /<svg[^>]*aria-hidden="true"/);
    }
    assert.equal(/trades\.|competition\./.test(html), false, 'translation keys should not leak into the UI');
    if (language === 'en') assert.doesNotMatch(textContent(tree), /[\u3400-\u9fff]/);
  }
  assert.ok(textContent(renderCatalog().tree).includes('投资回溯'), 'the default language should remain Chinese');
});

test('each tool click emits only its own navigation ID to the controlled parent', () => {
  const selected = [];
  const { tree } = renderCatalog({ onSelect: id => selected.push(id) });
  assert.deepEqual(selected, [], 'rendering must not select or activate a tool');
  for (const button of nodesOfType(tree, 'button')) button.props.onClick();
  assert.deepEqual(selected, expectedTools);
});

test('stock comparison is an optional translated tool immediately after Portfolio Overlap', () => {
  const trades = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
  const enabledExpression = trades.match(/<TradeToolsCatalog\b[^>]*enableStockComparison=\{([^}]+)\}/)?.[1];
  assert.ok(enabledExpression, 'Trades should explicitly enable the entry only when it can navigate');
  const isEnabled = new Function('openStockComparison', `return ${enabledExpression};`);
  for (const opener of [undefined, null, false, 'stock-comparison']) {
    assert.equal(isEnabled(opener), false);
    const { tree } = renderCatalog({ enableStockComparison: isEnabled(opener) });
    assert.deepEqual(nodesOfType(tree, 'button').map(button => button.props['data-tool-id']), expectedTools);
  }
  assert.equal(isEnabled(() => {}), true);
  for (const language of ['zh', 'en']) {
    const selected = [];
    const { tree } = renderCatalog({ language, enableStockComparison: true, onSelect: id => selected.push(id) });
    const buttons = nodesOfType(tree, 'button');
    assert.deepEqual(buttons.map(button => button.props['data-tool-id']), [
      'portfolio-overlap', 'stock-comparison', 'investment-comparison', 'dca-lab', 'stock-decision', 'macro', 'records', 'waves', 'competition',
    ]);
    const comparison = buttons.find(button => button.props['data-tool-id'] === 'stock-comparison');
    assert.ok(textContent(comparison).includes(t(language, 'trades.stockComparison')));
    assert.ok(textContent(comparison).includes(t(language, 'trades.stockComparisonDescription')));
    comparison.props.onClick();
    assert.deepEqual(selected, ['stock-comparison']);
  }
});

test('stock comparison has a user-scoped production route without a sixth quick action', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
  const comparisonPage = readFileSync(new URL('../src/pages/StockComparisonPage.jsx', import.meta.url), 'utf8');
  const comparisonPreview = readFileSync(new URL('../src/dev/StockComparisonPreview.jsx', import.meta.url), 'utf8');
  const trades = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
  assert.match(app, /const StockComparisonPage = lazy\(\(\) => import\('\.\/pages\/StockComparisonPage\.jsx'\)\)/, 'the production route should load its page lazily');
  const openBody = app.match(/const openStockComparison = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/)?.[1];
  const closeBody = app.match(/const closeStockComparison = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/)?.[1];
  assert.ok(openBody && closeBody, 'production navigation should support opening and closing the tool');
  assert.match(openBody, /setActiveTab\('trades'\)/);
  assert.match(openBody, /setActivePage\('stock-comparison'\)/);
  assert.match(closeBody, /setActiveTab\('trades'\)/);
  assert.match(closeBody, /setActivePage\(null\)/);
  assert.match(app, /const isStockComparisonPage = activePage === 'stock-comparison'/);
  assert.match(app.match(/const isStandalonePage = ([^;]+);/)?.[1] || '', /\bisStockComparisonPage\b/, 'stock comparison should use standalone page layout');
  assert.match(app.match(/const tabCtx = \{([\s\S]*?)\n  \};/)?.[1] || '', /\bopenStockComparison\s*,/, 'the trading catalogue must receive a production opener');
  assert.match(app, /isStockComparisonPage\s*\? <StockComparisonPage key=\{user\?\.id \|\| ''\} ctx=\{\{ userId: user\?\.id \|\| '', language, marketColorMode, onBack: closeStockComparison \}\}/, 'the real page must receive authenticated identity, appearance, and back navigation');
  assert.match(preview, /openStockComparison: \(\) => \{ setActiveTab\('stock-comparison'\); window\.scrollTo\(0, 0\); \}/);
  assert.match(preview, /activeTab === 'stock-comparison'\s*\? <StockComparisonPreview ctx=\{\{ language, marketColorMode, onBack:/, 'DEV navigation should use its isolated sample adapter');
  assert.match(comparisonPage, /const preview = import\.meta\.env\.DEV \? previewSource : null/, 'production must ignore externally supplied preview data');
  assert.match(comparisonPage, /import \{ loadStockComparison \} from '\.\.\/lib\/stockComparison\.js'/, 'production should load the authenticated real history client');
  assert.doesNotMatch(comparisonPage, /stockComparisonFixture|STOCK_COMPARISON_DEMO|from ['"][^'"]*\/dev\//, 'synthetic samples must stay out of the production page dependency graph');
  assert.match(comparisonPreview, /import \{ STOCK_COMPARISON_DEMO \} from '\.\/stockComparisonFixture\.js'/);
  assert.match(comparisonPreview, /if \(!import\.meta\.env\.DEV\) return null/, 'the fixture adapter must refuse production rendering');
  const shortcuts = trades.match(/<section className="trades-report-tools"[\s\S]*?<\/section>/)?.[0];
  assert.ok(shortcuts);
  assert.deepEqual([...shortcuts.matchAll(/\{ id: '([^']+)'/g)].map(([, id]) => id), ['waves', 'competition', 'records', 'investment-comparison', 'all']);
});

test('the catalog remains presentation-only without ledger, persistence, or provider access', () => {
  assert.doesNotMatch(source, /\b(?:fetch|save|insert|upsert|update|delete)\s*\(|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves|service_role|EODHD_API_KEY/);
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', 'lucide-react', '../lib/i18n.js', './TradeToolsCatalog.css'].includes(module)), 'catalog imports must remain limited to presentation dependencies');
});

test('all tools share uniform borderless rows without featured or per-tool styling', () => {
  const { tree, html } = renderCatalog({ onSelect() {} });
  const buttons = nodesOfType(tree, 'button');
  assert.deepEqual([...new Set(buttons.map(button => button.props.className))], ['trade-tool-card']);
  const itemContainers = nodesOfType(tree, 'div').filter(node => node.props.className?.split(/\s+/).includes('trade-tools-items'));
  assert.equal(itemContainers.length, expectedGroups.length);
  assert.ok(itemContainers.every(node => node.props.className === 'trade-tools-items'));
  assert.doesNotMatch(`${source}\n${css}\n${html}`, /trade-tool-featured|trade-tools-columns/);
  assert.doesNotMatch(css, /\[data-tool-id\b|:nth-(?:child|of-type)\(/, 'individual tools must not receive a different visual treatment');
  const card = css.match(/\.trade-tool-card\s*\{([^}]+)\}/)?.[1];
  assert.ok(card, 'the shared row style must exist');
  assert.match(card, /\bborder:\s*(?:0|none)\s*;/);
  assert.match(card, /\bbackground:\s*(?:transparent|none)\s*;/);
});

test('catalog styles preserve keyboard focus and stay within the tools presentation', () => {
  // Read leaf rules, including those nested inside media queries.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1].split(',').map(selector => selector.trim()),
    declarations: match[2],
  }));
  const focusRule = rules.find(rule => rule.selectors.includes('.trade-tool-card:focus-visible'));
  assert.ok(focusRule, 'tool rows must retain a keyboard focus rule');
  const outline = focusRule.declarations.match(/\boutline\s*:\s*([^;]+);/)?.[1].trim();
  assert.ok(outline, 'keyboard focus must have an outline');
  assert.doesNotMatch(outline, /^(?:0(?:px)?|none)(?:\s|$)/);
  const selectors = rules.flatMap(rule => rule.selectors);
  assert.ok(selectors.every(selector => /^(?:\[role\s*=\s*['"]dialog['"]\])?\.trade-tools?[-\w]*(?=[\s.:#\[>+~]|$)/.test(selector)), 'catalog rules must remain scoped to tool classes');
  assert.doesNotMatch(source, /\b(?:window|document)\s*\.|\b(?:addEventListener|removeEventListener|useEffect|useLayoutEffect)\b|visibilitychange|pageshow|pagehide/, 'the catalog must not manage global page lifecycle');
});
