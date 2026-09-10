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
const { default: HomeMarginRiskPage, formatMoneyFromUsd, formatWanReferenceFromUsd } = await import(moduleUrl(`${compiled}\nexport { formatMoneyFromUsd, formatWanReferenceFromUsd };`));

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
  for (const value of ['$75,000.00', '$59,000.00', '约 $5.90 万', '$16,000.00', '-21.33%']) assert.ok(net.includes(value), value);
  for (const value of ['$100,000.00', '$84,000.00', '约 $8.40 万', '$16,000.00', '-16.00%']) assert.ok(total.includes(value), value);
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
  assert.equal(input.props.value, '25000.00');
  assert.match(editor.html, /约 \$2\.50 万/);
  assert.equal(nodes(editor.tree, node => node.props['data-home-margin-save']).length, 1);
  assert.equal(saves, 0);
  const guide = renderPage({ homeMarginPreview: 'leverage' });
  assert.match(guide.html, /aria-labelledby="home-margin-leverage-info-title"/);
  assert.equal(nodes(guide.tree, node => node.props['data-home-margin-leverage-tier']).length, 6);
  assert.match(editor.html, /margin-report-sheet max-h-full[^\"]*overflow-y-auto/);
});

test('major account and scenario amounts show two decimals with a separate same-currency wan reference', () => {
  const fractionalAccount = {
    totalAssetsUsd: 1234567.89, positionsMarketValue: 1000000.25, cashUsd: 234567.64, usdRate: 7.1234,
  };
  const usd = renderPage({ investmentSummary: fractionalAccount, homeMarginScenarioPreview: -20 });
  assert.match(usd.html, /\$1,234,567\.89/);
  assert.match(usd.html, /约 \$123\.46 万/);
  assert.match(renderToStaticMarkup(result(usd.tree, 'total')), /\$1,034,567\.84/);
  assert.match(renderToStaticMarkup(result(usd.tree, 'total')), /约 \$103\.46 万/);
  const cny = renderPage({ investmentSummary: fractionalAccount, portfolioCurrencyMode: 'CNY' });
  assert.match(cny.html, /¥8,794,320\.91/);
  assert.match(cny.html, /约 ¥879\.43 万/);
  assert.doesNotMatch(cny.html, /\$[0-9]/);
  const english = renderPage({ language: 'en', portfolioCurrencyMode: 'CNY' });
  assert.match(english.html, /≈ ¥70\.00 × 10k/);
  assert.match(css, /\.margin-report-money-reference\s*\{[^}]*font-size:\s*11px;/);
});

test('reference formatting preserves negative and zero amounts without treating unavailable values as zero', () => {
  assert.equal(formatMoneyFromUsd(-12345.67, 'USD', 7), '-$12,345.67');
  assert.equal(formatWanReferenceFromUsd(-12345.67, 'USD', 7, 'zh'), '约 -$1.23 万');
  assert.equal(formatMoneyFromUsd(0, 'CNY', 7), '¥0.00');
  assert.equal(formatWanReferenceFromUsd(0, 'CNY', 7, 'zh'), '约 ¥0.00 万');
  assert.equal(formatMoneyFromUsd(125.5, 'USD', 7), '$125.50');
  assert.equal(formatWanReferenceFromUsd(125.5, 'USD', 7, 'zh'), '约 $0.01 万');
  for (const missing of [null, undefined, '', NaN, Infinity, 'invalid']) {
    assert.equal(formatMoneyFromUsd(missing, 'USD', 7), '—');
    assert.equal(formatWanReferenceFromUsd(missing, 'USD', 7, 'zh'), '—');
  }
  const negative = renderPage({ marginStatus: { currentMargin: 110000 }, homeMarginScenarioPreview: -20 });
  const net = renderToStaticMarkup(result(negative.tree, 'net'));
  assert.match(net, /-\$26,000\.00/);
  assert.match(net, /约 -\$2\.60 万/);
  assert.doesNotMatch(renderPage({ availableCashStatusReady: false }).html, /margin-report-money-reference/);
});

test('scenario change amounts have their own absolute wan reference for increases, decreases and zero', () => {
  for (const [scenario, direction, reference] of [[20, '增加', '约 $1.60 万'], [-20, '下降', '约 $1.60 万'], [0, '不变', '约 $0.00 万']]) {
    const { tree } = renderPage({ homeMarginScenarioPreview: scenario });
    for (const key of ['net', 'total']) {
      const row = result(tree, key);
      const change = nodes(row, node => node.props.className?.startsWith('margin-report-result-change'))[0];
      const references = nodes(change, node => node.props['data-home-margin-change-reference']);
      assert.equal(references.length, 1);
      assert.equal(references[0].props.children, reference);
      assert.match(renderToStaticMarkup(change), new RegExp(`${direction} \\$${scenario === 0 ? '0\\.00' : '16,000\\.00'}`));
      assert.doesNotMatch(renderToStaticMarkup(references[0]), /-\$/);
    }
  }
});

test('change references use the display currency rate and stay absent until account data is ready', () => {
  const investmentSummary = { ...account.investmentSummary, usdRate: 7.1234 };
  for (const scenario of [-20, 20]) {
    const { tree } = renderPage({ portfolioCurrencyMode: 'CNY', investmentSummary, homeMarginScenarioPreview: scenario });
    const change = nodes(result(tree, 'net'), node => node.props.className?.startsWith('margin-report-result-change'))[0];
    assert.match(renderToStaticMarkup(change), /¥113,974\.40/);
    assert.equal(nodes(change, node => node.props['data-home-margin-change-reference'])[0].props.children, '约 ¥11.40 万');
    assert.doesNotMatch(renderToStaticMarkup(change), /\$/);
  }
  const english = renderPage({ language: 'en', portfolioCurrencyMode: 'CNY', homeMarginScenarioPreview: 20 });
  assert.equal(nodes(english.tree, node => node.props['data-home-margin-change-reference'])[0].props.children, '≈ ¥11.20 × 10k');
  for (const readiness of [{ availableCashStatusReady: false }, { marginStatusReady: false }]) {
    const { html, tree } = renderPage({ ...readiness, homeMarginScenarioPreview: -20 });
    assert.equal(nodes(tree, node => node.props['data-home-margin-change-reference']).length, 0);
    assert.doesNotMatch(html, /[$¥]\d/);
  }
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
