import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const tabSource = read('src/components/InvestmentAnalysisTabs.jsx');
const pageSource = read('src/pages/InvestmentComparisonPage.jsx');
const transformedTabs = await transformWithOxc(tabSource, 'InvestmentAnalysisTabs.jsx', { jsx: { runtime: 'classic' } });
const tabUrl = dataUrl(transformedTabs.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(import.meta.resolve('react'))}`));
const { default: InvestmentAnalysisTabs } = await import(tabUrl);
const transformedCurrency = await transformWithOxc(read('src/components/CurrencyToggle.jsx'), 'CurrencyToggle.jsx', { jsx: { runtime: 'classic' } });
const currencyUrl = dataUrl(transformedCurrency.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(import.meta.resolve('react'))}`).replace(/import ["'][^"']+\.css["'];?/g, ''));
const { default: CurrencyToggle } = await import(currencyUrl);

function findAll(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => findAll(child, predicate))];
}

test('analysis tabs render the two bilingual choices with one active keyboard stop', () => {
  for (const englishMode of [false, true]) {
    for (const value of ['growth', 'drawdown']) {
      const tree = InvestmentAnalysisTabs({ value, englishMode, onChange() {} });
      const tabs = findAll(tree, node => node.props.role === 'tab');
      assert.equal(tree.props.role, 'tablist');
      assert.equal(tabs.length, 2);
      assert.deepEqual(tabs.map(node => node.props.children), englishMode ? ['Asset growth', 'Drawdown & recovery'] : ['资产增长', '回撤与修复']);
      assert.equal(tabs.filter(node => node.props['aria-selected']).length, 1);
      assert.equal(tabs.filter(node => node.props.tabIndex === 0).length, 1);
      for (const tab of tabs) {
        assert.equal(tab.props['aria-selected'], tab.props.id === `ic-tab-${value}`);
        assert.equal(tab.props['aria-controls'], 'ic-analysis-panel');
        assert.equal(tab.props.type, 'button');
      }
      const html = renderToStaticMarkup(tree);
      assert.match(html, englishMode ? /Investment analysis/ : /投资分析/);
      assert.doesNotMatch(html, /href=|localhost|127\.0\.0\.1|target=/);
    }
  }
});

test('analysis tabs click and keyboard actions select the view and move keyboard focus', () => {
  const selected = [], focused = [];
  const tabs = findAll(InvestmentAnalysisTabs({ value: 'growth', onChange: value => selected.push(value) }), node => node.props.role === 'tab');
  tabs[1].props.onClick();
  tabs[0].props.onClick();
  assert.deepEqual(selected, ['drawdown', 'growth']);
  const focusTargets = [0, 1].map(index => ({ focus: () => focused.push(index) }));
  let prevented = 0;
  for (const [index, key, expected] of [[0, 'ArrowRight', 1], [1, 'ArrowRight', 0], [0, 'ArrowLeft', 1], [1, 'ArrowLeft', 0], [1, 'Home', 0], [0, 'End', 1]]) {
    tabs[index].props.onKeyDown({ key, preventDefault: () => { prevented += 1; }, currentTarget: { parentElement: { querySelectorAll: () => focusTargets } } });
    assert.equal(selected.at(-1), expected === 0 ? 'growth' : 'drawdown');
    assert.equal(focused.at(-1), expected);
  }
  tabs[0].props.onKeyDown({ key: 'Tab', preventDefault: () => assert.fail('Tab must preserve normal navigation') });
  assert.equal(prevented, 6);
});

// Execute the production page and its loading effect with an in-memory provider.
// Persistent memo/ref/effect slots let a real tab event demonstrate that switching
// analysis does not start another history request or recreate the shared model.
const hookUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0, effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; cursor = 0; effects = []; }
  export function render(Component, props) { cursor = 0; return Component(props); }
  export async function flush() { const pending = effects; effects = []; for (const effect of pending) effect(); await Promise.resolve(); await Promise.resolve(); }
  function useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; const slot = slots[index]; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
  function useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; }
  function useMemo(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback(), deps }; return slots[index].value; }
  function useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) { const prior = slots[index]; slots[index] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = callback(); }); } }
  export default { ...React, useState, useRef, useMemo, useEffect, useLayoutEffect: useEffect, useCallback: (callback, deps) => useMemo(() => callback, deps), useId: () => 'analysis-test' };
`);
const hooks = await import(hookUrl);
const sourceUrl = dataUrl(`
  let fixture;
  export const calls = [];
  export function configure(data) { fixture = data; calls.length = 0; }
  export function getInvestmentComparisonExpectedCloseDate() { return '2026-09-04'; }
  export async function loadInvestmentComparison(options) { calls.push(options); return typeof fixture === 'function' ? fixture(options) : fixture; }
  export async function searchInvestmentSymbols() { throw new Error('Search should not run during analysis switching'); }
`);
const source = await import(sourceUrl);
const chartUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export default function Chart() { return React.createElement('div', { 'data-test-growth-chart': true }); }
  export const formatInvestmentAmount = (value, _englishMode, { displayCurrency, displayRate } = {}) => JSON.stringify({ value, displayCurrency, displayRate, converted: value * displayRate });
  export const formatInvestmentPercent = value => String(value);
  export const investmentChangeColor = () => '#fff';
  export const investmentRank = () => 'tied';
  export const investmentRankColor = () => '#fff';
`);
const drawdownUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export default function Drawdown() { return React.createElement('div', { 'data-test-drawdown-view': true }); }
`);
const pickerUrl = dataUrl('export default function SymbolPicker() { return null; }');
let pageCode = (await transformWithOxc(pageSource, 'InvestmentComparisonPage.jsx', { jsx: { runtime: 'classic' } })).code;
const imports = new Map([
  ['react', hookUrl], ['react-dom', import.meta.resolve('react-dom')], ['lucide-react', import.meta.resolve('lucide-react')],
  ['../components/CurrencyToggle.jsx', currencyUrl], ['../components/InvestmentAnalysisTabs.jsx', tabUrl], ['../components/InvestmentComparisonChart.jsx', chartUrl],
  ['../components/InvestmentDrawdownView.jsx', drawdownUrl], ['../components/InvestmentSymbolPicker.jsx', pickerUrl],
  ['../lib/investmentComparison.js', sourceUrl], ['../lib/investmentComparisonModel.js', new URL('../src/lib/investmentComparisonModel.js', import.meta.url).href],
  ['../lib/investmentComparisonCurrency.js', new URL('../src/lib/investmentComparisonCurrency.js', import.meta.url).href],
  ['../lib/investmentComparisonLead.js', new URL('../src/lib/investmentComparisonLead.js', import.meta.url).href],
]);
pageCode = pageCode.replace(/from (["'])([^"']+)\1/g, (match, _quote, path) => imports.has(path) ? `from ${JSON.stringify(imports.get(path))}` : match)
  .replace(/import ["'][^"']+\.css["'];?/g, '').replaceAll('import.meta.env.DEV', 'false');
const { default: InvestmentComparisonPage } = await import(dataUrl(pageCode));

function fixture() {
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  return {
    version: 1, source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD', symbols: ['QQQ', 'TQQQ'],
    expectedAsOfDate: dates.at(-1), asOfDate: dates.at(-1), availableFromDate: dates[0], fetchedAt: '2026-09-08T12:00:00Z', stale: false, staleReason: '',
    series: Object.fromEntries(['QQQ', 'TQQQ'].map((symbol, offset) => [symbol, { symbol, name: `${symbol} synthetic fixture`, type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close', rows: dates.map((date, index) => ({ date, close: 100 + index * (offset + 1) })) }])),
  };
}

test('production analysis switching retains shared settings and model without another provider load', async () => {
  hooks.reset();
  source.configure(fixture());
  const props = { ctx: { userId: 'synthetic-owner', language: 'en', usdRate: 7.2 } };
  const render = () => hooks.render(InvestmentComparisonPage, props);
  render(); await hooks.flush(); render(); await hooks.flush();
  let tree = render();
  const tab = () => findAll(tree, node => node.type === InvestmentAnalysisTabs)[0];
  const shared = () => {
    assert.equal(findAll(tree, node => node.type === 'header' && node.props.className === 'ic-header').length, 1);
    assert.equal(findAll(tree, node => node.props.className === 'ic-settings').length, 1);
    assert.equal(findAll(tree, node => node.type === 'input' && node.props['aria-label'] === 'Principal per investment in Chinese yuan').length, 1);
    const panel = findAll(tree, node => node.props.role === 'tabpanel')[0];
    assert.equal(panel.props['aria-labelledby'], `ic-tab-${tab().props.value}`);
    assert.equal(panel.props.id, 'ic-analysis-panel');
  };
  shared();
  assert.equal(tab().props.value, 'growth');
  const growthChart = findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0];
  const originalModel = growthChart.props.model;
  assert.equal(source.calls.length, 1);
  tab().props.onChange('drawdown'); tree = render(); await hooks.flush(); tree = render();
  shared();
  assert.equal(tab().props.value, 'drawdown');
  const drawdown = findAll(tree, node => typeof node.type === 'function' && node.props.model && !node.props.snapshot)[0];
  assert.strictEqual(drawdown.props.model, originalModel);
  assert.equal(drawdown.props.englishMode, true);
  assert.equal(source.calls.length, 1, 'view changes must reuse the authenticated history load');
  const principalInput = findAll(tree, node => node.type === 'input' && node.props.type === 'number')[0];
  principalInput.props.onChange({ target: { value: '2000000' } }); tree = render(); await hooks.flush(); tree = render();
  assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.model && !node.props.snapshot)[0].props.model.principal, 2000000 / 7.2);
  assert.equal(source.calls.length, 1, 'changing principal recalculates locally');
  tab().props.onChange('growth'); tree = render(); await hooks.flush(); tree = render();
  shared();
  assert.equal(findAll(tree, node => node.type === 'input' && node.props.type === 'number')[0].props.value, '2000000');
  assert.equal(source.calls.length, 1);
  hooks.reset();
});

test('production tabs do not depend on preview routes or cross-port navigation', () => {
  assert.doesNotMatch(tabSource, /import\.meta\.env|window\.location|location\.(?:href|assign|replace)|https?:\/\/|localhost|127\.0\.0\.1|target=/);
  assert.match(pageSource, /<InvestmentAnalysisTabs\b/);
  assert.match(pageSource, /analysisView === 'drawdown' \? <InvestmentDrawdownView\b/);
});

test('switching tabs while history is pending keeps the original request and renders its result in the selected view', async () => {
  hooks.reset();
  let resolveHistory;
  source.configure(new Promise(resolve => { resolveHistory = resolve; }));
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-pending-owner', language: 'zh', usdRate: 7.2 } });
  let tree = render(); await hooks.flush(); tree = render();
  findAll(tree, node => node.type === InvestmentAnalysisTabs)[0].props.onChange('drawdown');
  tree = render(); await hooks.flush(); tree = render();
  assert.equal(source.calls.length, 1);
  assert.equal(source.calls[0].signal.aborted, false);
  assert.equal(findAll(tree, node => node.props.className === 'ic-loading').length, 1);
  resolveHistory(fixture()); await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  assert.equal(findAll(tree, node => node.type === InvestmentAnalysisTabs)[0].props.value, 'drawdown');
  assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.model && !node.props.snapshot).length, 1);
  assert.equal(findAll(tree, node => node.props.className === 'ic-loading').length, 0);
  assert.equal(source.calls.length, 1);
  hooks.reset();
});

test('changing the starting year requests its range and prevents old-year responses from replacing it', async () => {
  hooks.reset();
  const pending = new Map();
  source.configure(({ startYear }) => new Promise(resolve => pending.set(startYear, resolve)));
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-year-owner', language: 'zh', usdRate: 7.2 } });
  let tree = render(); await hooks.flush(); tree = render();
  assert.equal(source.calls[0].startYear, 2011);
  findAll(tree, node => node.type === 'select' && node.props['aria-label'] === '起始年份')[0].props.onChange({ target: { value: '2020' } });
  tree = render(); await hooks.flush(); tree = render();
  assert.deepEqual(source.calls.map(call => call.startYear), [2011, 2020]);
  assert.equal(source.calls[0].signal.aborted, true);
  assert.equal(source.calls[1].signal.aborted, false);
  pending.get(2020)({ ...fixture(), startYear: 2020 });
  await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  const selectedModel = findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0].props.model;
  assert.equal(selectedModel.startYear, 2020);
  pending.get(2011)({ ...fixture(), startYear: 2011 });
  await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  assert.strictEqual(findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0].props.model, selectedModel);
  assert.equal(findAll(tree, node => node.props.role === 'alert').length, 0);
  hooks.reset();
});

test('an old-year error cannot hide a completed request for the selected year', async () => {
  hooks.reset();
  let rejectOld;
  source.configure(({ startYear }) => startYear === 2011 ? new Promise((_resolve, reject) => { rejectOld = reject; }) : { ...fixture(), startYear });
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-year-error-owner', language: 'zh', usdRate: 7.2 } });
  let tree = render(); await hooks.flush(); tree = render();
  findAll(tree, node => node.type === 'select' && node.props['aria-label'] === '起始年份')[0].props.onChange({ target: { value: '2020' } });
  tree = render(); await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  rejectOld(Object.assign(new Error('old unavailable range'), { code: 'INVALID_DATA' }));
  await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  assert.equal(findAll(tree, node => node.props.role === 'alert').length, 0);
  assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0].props.model.startYear, 2020);
  hooks.reset();
});

test('range errors preserve their code in production-page messages instead of becoming a network error', async () => {
  const text = node => !React.isValidElement(node) ? (typeof node === 'string' ? node : '') : React.Children.toArray(node.props.children).map(text).join(' ');
  for (const [code, expected] of [
    ['INVALID_DATA', '所选区间历史数据存在缺失或冲突，暂时无法对比。'],
    ['INSUFFICIENT_HISTORY', '所选标的在该起始年份后暂无足够的共同历史数据。'],
    ['INVALID_START_YEAR', '请选择已完成收盘年份范围内的起始年份。'],
  ]) {
    hooks.reset();
    source.configure(() => { throw Object.assign(new Error('test range error'), { code }); });
    const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-invalid-owner', language: 'zh', usdRate: 7.2 } });
    render(); await hooks.flush(); render(); await hooks.flush();
    const tree = render();
    const alert = findAll(tree, node => node.props.role === 'alert')[0];
    assert.ok(alert);
    assert.ok(text(alert).includes(expected));
    assert.ok(!text(alert).includes('历史数据暂时无法读取'));
    assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.model).length, 0);
  }
  hooks.reset();
});

test('invalid normalized history uses the same range diagnostic as an API INVALID_DATA error', async () => {
  hooks.reset();
  const invalid = fixture();
  invalid.series.QQQ.rows[0].close = null;
  source.configure(invalid);
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-model-error-owner', language: 'zh', usdRate: 7.2 } });
  render(); await hooks.flush(); render(); await hooks.flush();
  const tree = render();
  assert.equal(findAll(tree, node => node.props.role === 'status' && findAll(node, child => child.type === 'span' && child.props.children === '所选区间历史数据存在缺失或冲突，暂时无法对比。').length === 1).length, 1);
  hooks.reset();
});

test('stale, model-error and load-error states retain a forced retry without restoring normal-state refresh', async () => {
  try {
    for (const language of ['zh', 'en']) {
      for (const state of ['stale', 'model-error', 'load-error']) {
        hooks.reset();
        const initialData = fixture();
        if (state === 'stale') {
          initialData.stale = true;
          initialData.staleReason = 'provider_unavailable';
          initialData.expectedAsOfDate = '2026-09-08';
        } else if (state === 'model-error') initialData.series.QQQ.rows[0].close = null;
        let first = true, resolveRetry;
        source.configure(() => {
          if (first) {
            first = false;
            if (state === 'load-error') throw Object.assign(new Error('provider unavailable'), { code: 'PROVIDER_UNAVAILABLE' });
            return initialData;
          }
          return new Promise(resolve => { resolveRetry = resolve; });
        });
        const ctx = { userId: `synthetic-retry-${state}-${language}`, language, usdRate: 7.2 };
        const render = () => hooks.render(InvestmentComparisonPage, { ctx });
        render(); await hooks.flush(); render(); await hooks.flush();
        let tree = render();
        const retries = () => findAll(tree, node => node.type === 'button' && node.props.children === (language === 'en' ? 'Retry' : '重试'));
        assert.equal(retries().length, 1, `${state} must expose its retry action`);
        assert.equal(retries()[0].props.disabled, false);
        retries()[0].props.onClick();
        tree = render(); await hooks.flush(); tree = render();
        assert.equal(source.calls.length, 2);
        assert.equal(source.calls[0].force, false);
        assert.equal(source.calls[1].force, true);
        assert.equal(source.calls[1].userId, ctx.userId);
        assert.equal(source.calls[1].startYear, source.calls[0].startYear);
        assert.deepEqual(source.calls[1].symbols, source.calls[0].symbols);
        assert.equal(source.calls[0].signal.aborted, true);
        assert.equal(source.calls[1].signal.aborted, false);
        if (state !== 'load-error') {
          assert.equal(retries().length, 1);
          assert.equal(retries()[0].props.disabled, true, 'the retained diagnostic cannot queue duplicate retries while loading');
        }
        resolveRetry(fixture());
        await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
        assert.equal(retries().length, 0, 'fresh successful history must not expose a refresh action');
        const view = findAll(tree, node => typeof node.type === 'function' && node.props.model)[0];
        assert.ok(view);
        assert.equal(view.props.model.stale, false);
      }
    }
  } finally { hooks.reset(); }
});

async function currencySession(ctx, data = fixture()) {
  hooks.reset();
  source.configure(data);
  let tree;
  const render = () => { tree = hooks.render(InvestmentComparisonPage, { ctx }); return tree; };
  const settle = async () => {
    render(); await hooks.flush(); render(); await hooks.flush(); return render();
  };
  await settle();
  return {
    settle,
    get tree() { return tree; },
    get currency() { return findAll(tree, node => node.type === CurrencyToggle)[0]; },
    get currencyButtons() { return findAll(CurrencyToggle(this.currency.props), node => node.type === 'button'); },
    get principal() { return findAll(tree, node => node.type === 'input' && node.props.type === 'number')[0]; },
    get analysis() { return findAll(tree, node => node.type === InvestmentAnalysisTabs)[0]; },
    get view() { return findAll(tree, node => typeof node.type === 'function' && node.props.model)[0]; },
    get timeline() { return findAll(tree, node => node.props.className === 'ic-timeline')[0]; },
    get play() { return findAll(tree, node => node.props.className === 'ic-play-button')[0]; },
    async switchCurrency(value) { this.currencyButtons.find(node => node.props.children === value).props.onClick(); await settle(); },
  };
}

test('production lead amount follows timeline leadership and ties while currency changes only its display', async () => {
  try {
    for (const language of ['zh', 'en']) {
      const data = fixture();
      for (const [symbol, closes] of [['QQQ', [100, 120, 90, 110]], ['TQQQ', [100, 110, 80, 130]]]) {
        data.series[symbol].rows.forEach((row, index) => { row.close = closes[index]; });
      }
      const ctx = { userId: 'synthetic-lead-playback', language, usdRate: 7.2 };
      const session = await currencySession(ctx, data);
      const model = session.view.props.model;
      const leadRow = () => {
        const rows = findAll(session.tree, node => node.props.className === 'ic-lead-comparison');
        assert.equal(rows.length, 1);
        return {
          label: findAll(rows[0], node => node.type === 'span')[0].props.children,
          amount: JSON.parse(findAll(rows[0], node => node.type === 'strong')[0].props.children),
        };
      };
      const assertPoint = (index, winner) => {
        assert.equal(session.timeline.props.value, index);
        const row = leadRow();
        const expectedLabel = winner === null ? (language === 'en' ? 'Returns tied' : '收益持平')
          : language === 'en' ? `${winner} leads ${winner === 'QQQ' ? 'TQQQ' : 'QQQ'}`
            : `${winner} 领先 ${winner === 'QQQ' ? 'TQQQ' : 'QQQ'}`;
        assert.equal(row.label, expectedLabel);
        const values = model.points[index].values;
        assert.equal(row.amount.value, Math.abs(values.QQQ - values.TQQQ), 'the displayed gap must use the selected point at original USD precision');
        assert.equal(row.amount.displayCurrency, session.currency.props.value);
        assert.equal(row.amount.displayRate, session.currency.props.value === 'CNY' ? ctx.usdRate : 1);
        assert.equal(row.amount.converted, row.amount.value * row.amount.displayRate);
        return row.amount.value;
      };

      const latestGap = assertPoint(3, 'TQQQ');
      for (const [index, winner] of [[0, null], [1, 'QQQ'], [2, 'QQQ'], [3, 'TQQQ']]) {
        session.timeline.props.onChange({ target: { value: String(index) } });
        await session.settle();
        const gap = assertPoint(index, winner);
        if (index === 1) assert.notEqual(gap, latestGap, 'replay must not retain the latest gap');
      }
      const snapshot = session.view.props.snapshot;
      for (const [currency, rate] of [['USD', 7.2], ['CNY', 6.7048], ['USD', 6.7048]]) {
        ctx.usdRate = rate;
        await session.switchCurrency(currency);
        assert.equal(assertPoint(3, 'TQQQ'), latestGap);
        assert.strictEqual(session.view.props.model, model);
        assert.strictEqual(session.view.props.snapshot, snapshot);
      }
      assert.equal(source.calls.length, 1, 'lead comparison and display changes must reuse the existing history');
    }
  } finally { hooks.reset(); }
});

test('time-machine defaults to one million CNY and retains its principal through the bilingual currency selector', async () => {
  try {
    for (const language of ['zh', 'en']) {
      const session = await currencySession({ userId: 'synthetic-currency-header', language, usdRate: 7.2 });
      const header = findAll(session.tree, node => node.type === 'header' && node.props.className === 'ic-header')[0];
      assert.equal(session.currency.props.label, language === 'en' ? 'Display currency' : '显示币种');
      assert.equal(session.currency.props.value, 'CNY');
      assert.equal(Number(session.principal.props.value), 1000000);
      assert.equal(session.view.props.model.principal, 1000000 / 7.2);
      const model = session.view.props.model;
      assert.equal(findAll(header, node => node.type === CurrencyToggle && node.props.label === session.currency.props.label).length, 1);
      assert.equal(CurrencyToggle(session.currency.props).props['aria-label'], session.currency.props.label);
      assert.deepEqual(session.currencyButtons.map(node => node.props.children), ['USD', 'CNY']);
      assert.deepEqual(session.currencyButtons.map(node => node.props['aria-pressed']), [false, true]);
      assert.equal(findAll(header, node => node.type === 'button' && /Refresh historical data|刷新历史数据/.test(node.props['aria-label'] || '')).length, 0);
      await session.switchCurrency('USD');
      assert.equal(session.currency.props.value, 'USD');
      assert.ok(Math.abs(Number(session.principal.props.value) - 1000000 / 7.2) < 0.0050001);
      assert.strictEqual(session.view.props.model, model);
      await session.switchCurrency('CNY');
      assert.equal(session.currency.props.value, 'CNY');
      assert.equal(Number(session.principal.props.value), 1000000);
      assert.strictEqual(session.view.props.model, model);
      assert.equal(source.calls.length, 1);
    }
  } finally { hooks.reset(); }
});

test('currency toggles and FX updates retain canonical principal, history and in-progress playback without drift', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let nextFrame = 0;
  const frames = new Map();
  globalThis.window = {
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  try {
    const ctx = { userId: 'synthetic-currency-playback', language: 'en', usdRate: 7.21 };
    const session = await currencySession(ctx);
    session.principal.props.onChange({ target: { value: '12345.67' } }); await session.settle();
    const expectedUsd = 12345.67 / 7.21;
    session.timeline.props.onChange({ target: { value: '1' } }); await session.settle();
    session.play.props.onClick(); await session.settle();
    const model = session.view.props.model;
    const snapshot = session.view.props.snapshot;
    const request = source.calls[0];
    for (let index = 0; index < 20; index += 1) {
      await session.switchCurrency(index % 2 === 0 ? 'CNY' : 'USD');
      ctx.usdRate = index % 3 === 0 ? 7.12345 : 7.21;
      await session.settle();
      const multiplier = session.currency.props.value === 'CNY' ? ctx.usdRate : 1;
      assert.ok(Math.abs(Number(session.principal.props.value) - expectedUsd * multiplier) < 0.0050001, 'converted input may round to cents without changing the canonical principal');
      assert.strictEqual(session.view.props.model, model, 'display changes must reuse the USD model');
      assert.strictEqual(session.view.props.snapshot, snapshot);
      assert.equal(session.timeline.props.value, 1);
      assert.equal(findAll(session.play, node => node.type === 'span')[0].props.children, 'Pause');
      assert.equal(frames.size, 1, 'the active playback animation remains scheduled');
      assert.equal(source.calls.length, 1);
      assert.equal(request.signal.aborted, false);
    }
    assert.equal(model.principal, expectedUsd);
    assert.ok(Math.abs(Number(session.principal.props.value) - expectedUsd) < 0.0050001);
  } finally {
    hooks.reset();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('editing CNY principal normalizes at the current FX rate and later display changes retain the drawdown identity', async () => {
  try {
    const ctx = { userId: 'synthetic-currency-edit', language: 'zh', usdRate: 7.2 };
    const session = await currencySession(ctx);
    await session.switchCurrency('CNY');
    ctx.usdRate = 7.3; await session.settle();
    session.principal.props.onChange({ target: { value: '123456.78' } }); await session.settle();
    const expectedUsd = 123456.78 / 7.3;
    assert.ok(Math.abs(session.view.props.model.principal - expectedUsd) < 1e-10);
    assert.equal(Number(session.principal.props.value), 123456.78);
    session.analysis.props.onChange('drawdown'); await session.settle();
    const model = session.view.props.model;
    const key = session.view.key;
    for (const [currency, rate] of [['USD', 7.3], ['CNY', 7.12345], ['USD', 7.12345], ['CNY', 7.5]]) {
      ctx.usdRate = rate; await session.settle();
      await session.switchCurrency(currency);
      assert.equal(session.analysis.props.value, 'drawdown');
      assert.strictEqual(session.view.props.model, model);
      assert.equal(session.view.key, key, 'display changes must not remount the selected drawdown');
      assert.ok(Math.abs(Number(session.principal.props.value) - expectedUsd * (currency === 'CNY' ? rate : 1)) < 0.0050001);
      assert.equal(source.calls.length, 1);
    }
  } finally { hooks.reset(); }
});

test('initial invalid FX preserves the known CNY amount without a model until the first valid rate locks USD', async () => {
  try {
    for (const usdRate of [undefined, null, '', 0, -1, NaN, Infinity, 'not-a-rate']) {
      const ctx = { userId: 'synthetic-invalid-fx', language: 'en', usdRate };
      const session = await currencySession(ctx);
      const options = session.currencyButtons;
      assert.equal(session.currency.props.value, 'CNY');
      assert.ok(!session.currency.props.disabled);
      assert.equal(options.find(node => node.props.children === 'CNY').props.disabled, true);
      assert.ok(!options.find(node => node.props.children === 'USD').props.disabled);
      assert.equal(Number(session.principal.props.value), 1000000);
      assert.equal(session.principal.props.disabled, true);
      assert.equal(session.principal.props['aria-invalid'], false);
      assert.equal(session.view, undefined, 'unknown initial FX must not fabricate a USD model');
      assert.equal(findAll(session.tree, node => node.props.className === 'ic-feedback ic-invalid').length, 0, 'waiting for FX is not an invalid principal range');
      assert.equal(source.calls.length, 1);
      const request = source.calls[0];

      ctx.usdRate = 7.2; await session.settle();
      assert.equal(session.principal.props.disabled, false);
      assert.equal(Number(session.principal.props.value), 1000000);
      const model = session.view.props.model;
      assert.equal(model.principal, 1000000 / 7.2);
      for (const nextRate of [7.5, null, 6.77]) {
        ctx.usdRate = nextRate; await session.settle();
        assert.strictEqual(session.view.props.model, model, 'later FX changes must not repeat the initial principal conversion');
        if (nextRate !== null) assert.ok(Math.abs(Number(session.principal.props.value) - model.principal * nextRate) < 0.0050001);
        assert.equal(source.calls.length, 1);
        assert.equal(request.signal.aborted, false);
      }
    }
  } finally { hooks.reset(); }
});

test('a USD edit made before initial FX arrives is never overwritten by the delayed CNY initialization', async () => {
  try {
    for (const usdRate of [undefined, null, 0]) {
      const ctx = { userId: 'synthetic-early-usd-edit', language: 'en', usdRate };
      const session = await currencySession(ctx);
      assert.equal(session.view, undefined);
      await session.switchCurrency('USD');
      assert.equal(session.currency.props.value, 'USD');
      assert.equal(session.principal.props.disabled, false);
      assert.equal(session.principal.props.value, '');
      assert.equal(session.principal.props['aria-invalid'], false);
      assert.equal(session.view, undefined, 'switching currency alone cannot initialize a principal without FX');
      session.principal.props.onChange({ target: { value: '123.45' } }); await session.settle();
      assert.equal(session.view.props.model.principal, 123.45);
      const model = session.view.props.model;
      ctx.usdRate = 7.2; await session.settle();
      assert.equal(session.currency.props.value, 'USD');
      assert.equal(Number(session.principal.props.value), 123.45);
      assert.strictEqual(session.view.props.model, model);
      await session.switchCurrency('CNY');
      assert.ok(Math.abs(Number(session.principal.props.value) - 123.45 * 7.2) < 0.0050001);
      ctx.usdRate = 7.5; await session.settle();
      assert.strictEqual(session.view.props.model, model);
      await session.switchCurrency('USD');
      assert.equal(Number(session.principal.props.value), 123.45);
      assert.strictEqual(session.view.props.model, model);
      assert.equal(source.calls.length, 1);
    }
  } finally { hooks.reset(); }
});

test('losing FX after a CNY edit retains the captured USD principal and allows switching back to USD', async () => {
  try {
    const ctx = { userId: 'synthetic-lost-fx', language: 'en', usdRate: 7.2 };
    const session = await currencySession(ctx);
    await session.switchCurrency('CNY');
    session.principal.props.onChange({ target: { value: '720.72' } }); await session.settle();
    const model = session.view.props.model;
    ctx.usdRate = null; await session.settle();
    assert.equal(session.principal.props.value, '');
    assert.equal(session.principal.props.disabled, true);
    assert.strictEqual(session.view.props.model, model, 'losing live FX must retain the USD value captured when CNY was edited');
    assert.equal(session.currencyButtons.find(node => node.props.children === 'CNY').props.disabled, true);
    await session.switchCurrency('USD');
    assert.equal(session.currency.props.value, 'USD');
    assert.ok(!session.principal.props.disabled);
    assert.ok(Math.abs(Number(session.principal.props.value) - 100.1) < 1e-10);
    assert.strictEqual(session.view.props.model, model);
    assert.equal(source.calls.length, 1);
  } finally { hooks.reset(); }
});
