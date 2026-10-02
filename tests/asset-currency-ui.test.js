import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { localMonthKey, shiftMonthKey } from '../src/lib/calendarMonth.js';

const pageUrl = new URL('../src/tabs/AnalysisTab.jsx', import.meta.url);
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const hooksUrl = moduleUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots = [], cursor = 0;
export function reset() { slots = []; cursor = 0; }
export function render(Component, props) { cursor = 0; return Component(props); }
function useState(initial) { const slot = slots[cursor++] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
function useRef(initial) { return slots[cursor++] ||= { current: initial }; }
export default { ...React, useState, useRef, useEffect: () => { cursor++; }, useMemo: factory => { cursor++; return factory(); }, useCallback: callback => { cursor++; return callback; } };
`);
const hooks = await import(hooksUrl);
const moduleCache = new Map();

// Compile the real component graph. Only the parent hooks are controlled so
// handlers can be exercised; nested JSX, models and currency helpers stay real.
async function compileModule(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  const loading = (async () => {
    let source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    if (url.href === pageUrl.href) source += '\nexport { AnalysisTab };';
    let { code } = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    const imports = [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)];
    for (const match of imports.reverse()) {
      const specifier = match[3];
      const resolved = specifier.startsWith('.') ? new URL(specifier, url) : null;
      const target = specifier === 'react' && url.href === pageUrl.href ? hooksUrl
        : resolved?.pathname.endsWith('.jsx') ? await compileModule(resolved)
          : resolved && /\.(?:ico|png|jpg|svg)$/.test(resolved.pathname) ? moduleUrl(`export default ${JSON.stringify(resolved.href)};`)
          : resolved?.href || import.meta.resolve(specifier);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return moduleUrl(`${code}\n//# sourceURL=${url.href}`);
  })();
  moduleCache.set(url.href, loading);
  return loading;
}

const { AnalysisTab } = await import(await compileModule(pageUrl));
const { default: MonthlyAssetTrendChart } = await import(await compileModule(new URL('../src/components/MonthlyAssetTrendChart.jsx', import.meta.url)));
const { default: MonthlyAssetTrendContent } = await import(await compileModule(new URL('../src/components/MonthlyAssetTrendContent.jsx', import.meta.url)));
const { default: MonthlyAssetCategoryReport } = await import(await compileModule(new URL('../src/components/MonthlyAssetCategoryReport.jsx', import.meta.url)));
const { default: AccountAssetTrendModal } = await import(await compileModule(new URL('../src/components/AccountAssetTrendModal.jsx', import.meta.url)));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join('');
}
const currentMonth = localMonthKey();
const previousMonth = shiftMonthKey(currentMonth, -1);
const accounts = Object.freeze([
  Object.freeze({ id: 'cny', owner: '我', name: '招商银行', type: '银行', currency: 'CNY' }),
  Object.freeze({ id: 'usd', owner: '我', name: 'IBKR', type: '证券', currency: 'USD' }),
  Object.freeze({ id: 'hkd', owner: '老婆', name: '招商永隆', type: '银行', currency: 'HKD' }),
]);
const balances = { cny: 71400, usd: 1000, hkd: 2000 };
const snapshots = Object.freeze(accounts.flatMap(account => [
  Object.freeze({ accountId: account.id, month: previousMonth, balance: balances[account.id] / 2 }),
  Object.freeze({ accountId: account.id, month: currentMonth, balance: balances[account.id] }),
]));

function mount(overrides = {}) {
  hooks.reset();
  const currencyChanges = [];
  let writes = 0;
  const ctx = {
    accounts, snapshots, usdRate: 7, hkdRate: 0.9, portfolioCurrencyMode: 'CNY', language: 'zh',
    chartSelectedMonthIdx: null, fillMonth: currentMonth, snapshotDraft: {}, snapshotTab: '我',
    showAddAccount: false, showFillSnapshot: false, showMonthsDetail: false,
    newAccount: { owner: '我', type: '', name: '', currency: 'CNY', icon: '', balance: '' },
    fmt: (value, digits = 2) => Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    db: new Proxy({}, { get: () => () => { writes += 1; throw new Error('A display action must not write'); } }),
    setAccounts() {}, setSnapshots() {}, setNewAccount() {}, setSnapshotDraft() {}, setSnapshotTab() {},
    setShowAddAccount() {}, setShowFillSnapshot() {}, setFillMonth() {}, setChartSelectedMonthIdx() {},
    setPortfolioCurrencyMode: value => { currencyChanges.push(value); ctx.portfolioCurrencyMode = value; },
    setShowMonthsDetail: value => { ctx.showMonthsDetail = value; },
    ...overrides,
  };
  return { ctx, currencyChanges, writes: () => writes, render: () => hooks.render(AnalysisTab, { ctx }) };
}
const byClass = (tree, className) => nodes(tree, node => node.props.className === className)[0];

// Execute the production memo boundary rather than supplying a complete ctx
// directly: preview fixtures cannot catch an omitted prop or stale dependency.
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const analysisContextStart = appSource.indexOf('  const analysisTabCtx = useMemo(');
const analysisContextEnd = appSource.indexOf('  const tabCtx = {', analysisContextStart);
assert.ok(analysisContextStart >= 0 && analysisContextEnd > analysisContextStart);
const productionAnalysisContext = appSource.slice(analysisContextStart, analysisContextEnd);

function mountThroughProductionContext(contextSource = productionAnalysisContext) {
  const fixture = mount({ marketColorMode: 'redUpGreenDown', showConfirm() {} });
  const scopeNames = Object.keys(fixture.ctx);
  const evaluateContext = new Function(...scopeNames, 'useMemo', `${contextSource}\nreturn analysisTabCtx;`);
  let memo;
  const useMemo = (factory, dependencies) => {
    if (!memo || dependencies.length !== memo.dependencies.length
      || dependencies.some((value, index) => !Object.is(value, memo.dependencies[index]))) {
      memo = { dependencies: [...dependencies], value: factory() };
    }
    return memo.value;
  };
  return {
    ...fixture,
    context: () => memo?.value,
    render: () => {
      const ctx = evaluateContext(...scopeNames.map(name => fixture.ctx[name]), useMemo);
      return hooks.render(AnalysisTab, { ctx });
    },
  };
}

test('production App analysis memo passes the currency handler and refreshes amounts in both directions', () => {
  const before = structuredClone({ accounts, snapshots });
  const view = mountThroughProductionContext();
  let tree = view.render();
  const cnyContext = view.context();
  assert.equal(text(byClass(tree, 'asset-report-total')), '¥80,200.00');
  view.render();
  assert.equal(view.context(), cnyContext, 'unchanged dependencies reuse the real production memo');

  nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button' && text(node) === 'USD')[0].props.onClick();
  tree = view.render();
  assert.deepEqual(view.currencyChanges, ['USD'], 'the actual production context must forward the button callback');
  assert.notEqual(view.context(), cnyContext, 'currency changes must invalidate the production memo');
  assert.equal(text(byClass(tree, 'asset-report-total')), '$11,457.14');
  assert.deepEqual(nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button').map(node => node.props['aria-pressed']), [true, false]);
  assert.equal(nodes(tree, node => node.type === MonthlyAssetTrendChart)[0].props.model.currentSlot.balance, 80200 / 7);
  const usdContext = view.context();

  nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button' && text(node) === 'CNY')[0].props.onClick();
  tree = view.render();
  assert.deepEqual(view.currencyChanges, ['USD', 'CNY']);
  assert.notEqual(view.context(), usdContext);
  assert.equal(text(byClass(tree, 'asset-report-total')), '¥80,200.00');
  assert.deepEqual(nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button').map(node => node.props['aria-pressed']), [false, true]);
  assert.equal(nodes(tree, node => node.type === MonthlyAssetTrendChart)[0].props.model.currentSlot.balance, 80200);
  assert.deepEqual(nodes(tree, node => node.props.className === 'asset-report-account-amount').map(text), ['¥71,400.00', '$1,000.00', 'HK$2,000.00']);
  assert.deepEqual({ accounts, snapshots }, before);
  assert.equal(view.writes(), 0);
});

test('production currency regression controls detect an omitted callback and an omitted memo dependency', () => {
  const [factory, dependencies] = productionAnalysisContext.split('}), [');
  assert.ok(factory && dependencies, 'the context must retain a factory and dependency list');

  // This mirrors the deployed omission: the component receives neither mode nor handler.
  const missingProps = `${factory.replace(/^    (?:portfolioCurrencyMode|setPortfolioCurrencyMode),\n/gm, '')}}), [${dependencies}`;
  const missingHandlerView = mountThroughProductionContext(missingProps);
  let tree = missingHandlerView.render();
  nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button' && text(node) === 'USD')[0].props.onClick();
  tree = missingHandlerView.render();
  assert.deepEqual(missingHandlerView.currencyChanges, []);
  assert.equal(text(byClass(tree, 'asset-report-total')), '¥80,200.00', 'old production props reproduce the inert button');
  assert.equal(missingHandlerView.writes(), 0);

  // Forwarding the handler alone is insufficient: React would retain the CNY ctx.
  const missingDependency = `${factory}}), [${dependencies.replace(/^    portfolioCurrencyMode,\n/gm, '')}`;
  const staleView = mountThroughProductionContext(missingDependency);
  tree = staleView.render();
  const originalContext = staleView.context();
  nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button' && text(node) === 'USD')[0].props.onClick();
  tree = staleView.render();
  assert.deepEqual(staleView.currencyChanges, ['USD']);
  assert.equal(staleView.context(), originalContext);
  assert.equal(text(byClass(tree, 'asset-report-total')), '¥80,200.00', 'missing currency dependency reproduces the stale total');
  assert.equal(staleView.writes(), 0);
});

test('asset header converts canonical CNY totals and replaces its date entry with the shared currency switch', () => {
  const view = mount();
  let tree = view.render();
  assert.equal(text(byClass(tree, 'asset-report-total')), '¥80,200.00');
  const header = byClass(tree, 'asset-report-hero-header');
  const buttons = nodes(header, node => node.type === 'button');
  assert.deepEqual(buttons.map(text), ['USD', 'CNY']);
  assert.deepEqual(buttons.map(node => node.props['aria-pressed']), [false, true]);
  assert.doesNotMatch(text(header), /\d{4}-\d{2}/);
  buttons[0].props.onClick();
  tree = view.render();
  assert.deepEqual(view.currencyChanges, ['USD']);
  assert.equal(text(byClass(tree, 'asset-report-total')), '$11,457.14');
  assert.deepEqual(nodes(byClass(tree, 'asset-report-currency'), node => node.type === 'button').map(node => node.props['aria-pressed']), [true, false]);
  assert.equal(view.writes(), 0);
});

test('overview chart and nested monthly reports receive consistent displayed values and canonical report facts', () => {
  const view = mount({ portfolioCurrencyMode: 'USD' });
  let tree = view.render();
  const chart = nodes(tree, node => node.type === MonthlyAssetTrendChart)[0];
  assert.equal(chart.props.model.currentSlot.balance, 80200 / 7);
  assert.equal(chart.props.model.currentSlot.changeAmount, 40100 / 7);
  const entry = nodes(tree, node => node.type === 'button' && text(node) === '月度明细');
  assert.equal(entry.length, 1);
  entry[0].props.onClick();
  tree = view.render();
  const trend = nodes(tree, node => node.type === MonthlyAssetTrendContent)[0];
  assert.equal(trend.props.currency, 'USD');
  assert.equal(trend.props.values.at(-1), 80200 / 7);
  assert.equal(trend.props.values.at(-2), 40100 / 7);
  trend.props.onOpenMonthReport(currentMonth);
  tree = view.render();
  const monthlyReport = nodes(tree, node => node.type === MonthlyAssetCategoryReport)[0];
  assert.equal(monthlyReport.props.currency, 'USD');
  assert.equal(monthlyReport.props.usdRate, 7);
  assert.equal(monthlyReport.props.report.currentTotal, 80200, 'account report input stays canonical CNY');
  assert.equal(monthlyReport.props.report.previousTotal, 40100);
  assert.match(renderToStaticMarkup(monthlyReport), /\$1\.1/);
  assert.equal(view.writes(), 0);
});

test('both market conventions flow through monthly asset navigation and keep amount and rate colors paired', () => {
  for (const direction of [1, -1]) {
    for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
      const green = (direction > 0) === (marketColorMode === 'greenUpRedDown');
      const expectedColor = green ? '#34d399' : '#ff4b1f';
      const view = mount({
        marketColorMode,
        snapshots: direction > 0 ? snapshots : snapshots.map(snapshot => (
          snapshot.month === currentMonth ? { ...snapshot, balance: snapshot.balance / 4 } : snapshot
        )),
      });
      let tree = view.render();
      const metric = nodes(tree, node => node.props.className === 'asset-report-metric')[0];
      assert.equal(nodes(metric, node => node.props.style?.color)[0].props.style.color, expectedColor);

      nodes(tree, node => node.type === 'button' && text(node) === '月度明细')[0].props.onClick();
      tree = view.render();
      const trend = nodes(tree, node => node.type === MonthlyAssetTrendContent)[0];
      assert.equal(trend.props.marketColorMode, marketColorMode);
      const trendMarkup = renderToStaticMarkup(trend);
      const monthRow = trendMarkup.match(new RegExp(`data-asset-trend-month-row="${currentMonth}"[\\s\\S]*?</button>`))?.[0];
      assert.ok(monthRow, 'the current month stays navigable in the real monthly report');
      assert.equal(monthRow.split(`color:${expectedColor}`).length - 1, 2, 'monthly amount and percentage share the full market color');

      trend.props.onOpenMonthReport(currentMonth);
      tree = view.render();
      const report = nodes(tree, node => node.type === MonthlyAssetCategoryReport)[0];
      assert.equal(report.props.marketColorMode, marketColorMode);
      const reportMarkup = renderToStaticMarkup(report);
      assert.ok(reportMarkup.includes(`class="text-[12px] font-medium" style="color:${expectedColor}"`));
      assert.ok(reportMarkup.includes(`class="mt-0.5 text-[10px]" style="color:${expectedColor}"><span>`), 'ordinary account percentage inherits the same opaque color as the change amount');
      assert.doesNotMatch(reportMarkup, /class="mt-0.5 text-\[10px\] text-white\/\[0\.48\]"/);
      assert.equal(view.writes(), 0);
    }
  }
});

test('shared display currency does not rewrite native account balances, trends or monthly inputs', () => {
  const before = structuredClone({ accounts, snapshots });
  const view = mount({ portfolioCurrencyMode: 'USD' });
  let tree = view.render();
  assert.deepEqual(nodes(tree, node => node.props.className === 'asset-report-account-amount').map(text), ['¥71,400.00', '$1,000.00', 'HK$2,000.00']);
  nodes(tree, node => node.props['data-open-account-trend'] === 'cny')[0].props.onClick();
  tree = view.render();
  const trend = nodes(tree, node => node.type === AccountAssetTrendModal)[0];
  assert.equal(trend.props.account.currency, 'CNY');
  assert.equal(trend.props.trend.endSnapshot.balance, 71400);
  view.ctx.showFillSnapshot = true;
  tree = view.render();
  const inputs = nodes(tree, node => node.type === 'input' && node.props.className === 'asset-dialog-input asset-dialog-balance-input');
  assert.deepEqual(inputs.map(node => node.props.value), [71400, 1000]);
  assert.deepEqual(inputs.map(node => node.props['aria-label']), ['招商银行 · CNY', 'IBKR · USD']);
  assert.deepEqual({ accounts, snapshots }, before);
  assert.equal(view.writes(), 0);
});

test('invalid display FX leaves the total and monthly display unavailable instead of showing a zero amount', () => {
  for (const usdRate of [undefined, 0, -7, Number.NaN, Infinity]) {
    const view = mount({ portfolioCurrencyMode: 'USD', usdRate, accounts: [accounts[0]], snapshots: snapshots.filter(row => row.accountId === 'cny') });
    let tree = view.render();
    assert.equal(text(byClass(tree, 'asset-report-total')), '--');
    assert.equal(nodes(tree, node => node.type === MonthlyAssetTrendChart).length, 0);
    view.ctx.showMonthsDetail = true;
    tree = view.render();
    const trend = nodes(tree, node => node.type === MonthlyAssetTrendContent)[0];
    assert.ok(trend.props.values.every(value => value === null));
    assert.doesNotMatch(renderToStaticMarkup(trend), /\$0(?:[.,<])/);
  }
});
