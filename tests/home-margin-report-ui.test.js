import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const pageUrl = new URL('../src/pages/HomeMarginRiskPage.jsx', import.meta.url);
const pageSource = readFileSync(pageUrl, 'utf8');
const css = readFileSync(new URL('../src/pages/HomeMarginRiskPage.css', import.meta.url), 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolveImports = (code, parent) => code.replace(/from (["'])([^"']+)\1/g, (_, _quote, path) =>
  `from ${JSON.stringify(path.startsWith('.') ? new URL(path, parent).href : import.meta.resolve(path))}`);
const badgeUrl = new URL('../src/components/AccountLeverageBadge.jsx', import.meta.url);
const badge = await transformWithOxc(readFileSync(badgeUrl, 'utf8'), 'AccountLeverageBadge.jsx', { jsx: { runtime: 'classic' } });
const compiledBadgeUrl = moduleUrl(resolveImports(badge.code, badgeUrl));
const transformed = await transformWithOxc(pageSource, 'HomeMarginRiskPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolveImports(transformed.code.replace(/import\s*(['"])\.\/HomeMarginRiskPage\.css\1;?/g, ''), pageUrl)
  .replace(JSON.stringify(badgeUrl.href), JSON.stringify(compiledBadgeUrl));
const { default: HomeMarginRiskPage } = await import(moduleUrl(compiled));

const account = Object.freeze({
  language: 'zh', availableCashStatusReady: true, marginStatusReady: true,
  investmentSummary: Object.freeze({ totalAssetsUsd: 100000, positionsMarketValue: 80000, cashUsd: 20000, usdRate: 7 }),
  marginStatus: Object.freeze({ currentMargin: 25000 }),
  marketColorMode: 'redUpGreenDown',
});
function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function renderPage(ctx = {}) {
  let tree;
  const props = Object.freeze({ ...account, ...ctx });
  function CapturePage() { tree = HomeMarginRiskPage({ ctx: props }); return tree; }
  return { html: renderToStaticMarkup(React.createElement(CapturePage)), tree };
}
function result(tree, key) {
  return nodes(tree, node => node.props['data-home-margin-result'] === key)[0];
}

test('margin report keeps exact before, after and change readings while putting net assets first', () => {
  const { html, tree } = renderPage({ homeMarginScenarioPreview: -20 });
  assert.deepEqual(nodes(tree, node => node.props['data-home-margin-result']).map(node => node.props['data-home-margin-result']), ['net', 'total']);
  const net = renderToStaticMarkup(result(tree, 'net'));
  const total = renderToStaticMarkup(result(tree, 'total'));
  for (const value of ['$75,000', '$59,000', '$16,000.00', '-21.33%']) assert.ok(net.includes(value), value);
  for (const value of ['$100,000', '$84,000', '$16,000.00', '-16.00%']) assert.ok(total.includes(value), value);
  assert.match(html, /融资负债保持 \$25,000\.00/);
  assert.match(html, /1\.33×.*1\.42×/);
  assert.match(html, /role="spinbutton"[^>]*aria-valuemin="-100"[^>]*aria-valuemax="100"[^>]*aria-valuenow="-20"/);
  assert.match(net, /text-emerald-400/);
});

test('scenario direction, market preference and currency remain reflected in complete result values', () => {
  const positive = renderPage({ homeMarginScenarioPreview: 20 });
  assert.match(renderToStaticMarkup(result(positive.tree, 'net')), /\$91,000/);
  assert.match(renderToStaticMarkup(result(positive.tree, 'net')), /text-\[#ff4b1f\]/);
  const alternate = renderPage({ homeMarginScenarioPreview: 20, marketColorMode: 'greenUpRedDown' });
  assert.match(renderToStaticMarkup(result(alternate.tree, 'net')), /text-emerald-400/);
  const cny = renderPage({ homeMarginScenarioPreview: -20, portfolioCurrencyMode: 'CNY', language: 'en' });
  assert.match(renderToStaticMarkup(result(cny.tree, 'net')), /¥413,000/);
  assert.match(cny.html, /Scenario results/);
  assert.match(cny.html, /Current account/);
  const zero = renderPage();
  assert.match(zero.html, /aria-valuenow="0"/);
  assert.match(renderToStaticMarkup(result(zero.tree, 'net')), /\$75,000/);
});

test('unready account facts stay unavailable and cannot open balance or leverage dialogs', () => {
  for (const readiness of [{ availableCashStatusReady: false }, { marginStatusReady: false }]) {
    const { html, tree } = renderPage({ ...readiness, homeMarginPreview: 'editor', homeMarginScenarioPreview: -20 });
    assert.doesNotMatch(html, /[$¥]\d/);
    assert.doesNotMatch(html, /data-home-margin-balance-editor/);
    assert.ok(nodes(tree, node => node.props['data-home-margin-leverage-info-trigger'])[0].props.disabled);
    assert.doesNotMatch(renderPage({ ...readiness, homeMarginPreview: 'leverage' }).html, /data-home-margin-leverage-info-sheet/);
  }
});

test('balance and leverage sheets retain their labeled controls and readonly rendering never saves', () => {
  let saves = 0;
  const editor = renderPage({ homeMarginPreview: 'editor', saveMarginDebt: () => { saves += 1; } });
  const input = nodes(editor.tree, node => node.type === 'input')[0];
  assert.equal(input.props.id, 'home-margin-debt-input');
  assert.equal(input.props.inputMode, 'decimal');
  assert.equal(input.props.value, '25000');
  assert.equal(nodes(editor.tree, node => node.props['data-home-margin-save']).length, 1);
  assert.equal(saves, 0);
  const guide = renderPage({ homeMarginPreview: 'leverage' });
  assert.match(guide.html, /aria-labelledby="home-margin-leverage-info-title"/);
  assert.equal(nodes(guide.tree, node => node.props['data-home-margin-leverage-tier']).length, 6);
  assert.match(editor.html, /margin-report-sheet max-h-full[^\"]*overflow-y-auto/);
});

test('report styling keeps financial text untruncated and gives mobile controls neutral, readable surfaces', () => {
  assert.doesNotMatch(pageSource, /truncate|font-semibold|font-medium|radial-gradient/);
  assert.match(css, /\.margin-report-current\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.margin-report-result-value\s*\{[^}]*font-weight:\s*400;[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(css, /\.margin-report-debt-field\s*\{[^}]*min-width:\s*0;[^}]*font-size:\s*26px;/);
  assert.match(css, /\.margin-report-action\s*\{[^}]*min-height:\s*46px;/);
  assert.match(css, /\.margin-report-preset\s*\{[^}]*min-height:\s*40px;/);
  assert.match(css, /\.margin-report-page\s*\{[^}]*background:\s*#08090b;/);
  assert.match(css, /\.margin-report-sheet\s*\{[^}]*background:\s*#101112;/);
  assert.match(css, /button:focus-visible/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis|overflow:\s*hidden/);
});
