import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const source = readFileSync(new URL('../src/components/TradeToolsCatalog.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'TradeToolsCatalog.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/TradeToolsCatalog\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const { default: TradeToolsCatalog } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const expectedGroups = [
  { key: 'trades.toolsResearch', zh: '对比与测算', tools: ['investment-comparison', 'dca-lab', 'portfolio-overlap', 'cost'] },
  { key: 'trades.toolsReview', zh: '交易复盘', tools: ['records', 'waves'] },
  { key: 'trades.toolsCommunity', zh: '社区互动', tools: ['competition'] },
];
const expectedTools = expectedGroups.flatMap(group => group.tools);
const titleKeys = ['trades.investmentTimeMachine', 'trades.dcaLab', 'trades.portfolioOverlap', 'trades.averagingTool', 'trades.tradeLog', 'trades.swingLog', 'competition.toolEntry'];

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

test('catalog groups seven unique tools with DCA Lab immediately after the time machine and overlap next', () => {
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
  assert.equal(new Set(buttons.map(button => button.props['data-tool-id'])).size, 7);
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
  assert.ok(textContent(renderCatalog().tree).includes('投资时光机'), 'the default language should remain Chinese');
});

test('each tool click emits only its own navigation ID to the controlled parent', () => {
  const selected = [];
  const { tree } = renderCatalog({ onSelect: id => selected.push(id) });
  assert.deepEqual(selected, [], 'rendering must not select or activate a tool');
  for (const button of nodesOfType(tree, 'button')) button.props.onClick();
  assert.deepEqual(selected, expectedTools);
});

test('the catalog remains presentation-only without ledger, persistence, or provider access', () => {
  assert.doesNotMatch(source, /\b(?:fetch|save|insert|upsert|update|delete)\s*\(|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves|service_role|EODHD_API_KEY/);
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', 'lucide-react', '../lib/i18n.js', './TradeToolsCatalog.css'].includes(module)), 'catalog imports must remain limited to presentation dependencies');
});

test('only the DCA tool entry adopts the overlap hero background without needing page-level theme tokens', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const css = read('../src/components/TradeToolsCatalog.css');
  const card = css.match(/\.trade-tool-card\[data-tool-id="dca-lab"\] \{([^}]+)\}/)[1];
  const theme = read('../src/components/InvestmentComparison.css');
  const hero = read('../src/components/PortfolioOverlap.css').match(/\.investment-comparison \.po-hero \{([^}]+)\}/)[1];
  const background = rule => rule.match(/background:\s*([^;]+);/)[1].replace(/\s+/g, '');
  const resolvedHero = background(hero).replace(/var\((--ic-[\w-]+)\)/g, (_, name) => theme.match(new RegExp(`${name}:\\s*([^;]+);`))[1]);
  assert.equal(background(card), resolvedHero);
  assert.doesNotMatch(card, /var\(/, 'the tools catalog lives outside the investment-comparison theme scope');
  assert.match(card, /border-color:\s*#252b35/);
  assert.match(css, /\.trade-tool-featured \{[^}]*linear-gradient\(110deg/, 'the first time-machine entry keeps its featured appearance');
  assert.match(css, /\.trade-tool-card:focus-visible \{[^}]*outline:/);
});
