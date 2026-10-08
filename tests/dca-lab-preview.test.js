import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { buildDcaModel } from '../src/lib/dcaLabModel.js';
import { searchInvestmentSymbols } from '../src/lib/investmentComparison.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/pages/DcaLabPage.jsx');
const preview = read('src/dev/DcaLabPreview.jsx');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function compile(text, file, dev = false, replacements = {}) {
  const transformed = await transformWithOxc(text, file, { jsx: { runtime: 'classic' } });
  const compiled = transformed.code
    .replace(/from (["'])([^"']+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(replacements[path] || (path.startsWith('../') ? new URL(`../src/${path.slice(3)}`, import.meta.url).href : import.meta.resolve(path)))}`)
    .replace(/import ["'][^"']+\.css["'];?/g, '')
    .replaceAll('import.meta.env.DEV', String(dev));
  return dataUrl(compiled);
}
const presetsModule = await compile(read('src/components/InvestmentSymbolPresets.jsx'), 'InvestmentSymbolPresets.jsx');
const sharedPickerModule = await compile(read('src/components/InvestmentSymbolPicker.jsx'), 'InvestmentSymbolPicker.jsx', false, { './InvestmentSymbolPresets.jsx': presetsModule });
const pickerModule = await compile(read('src/components/DcaSymbolPicker.jsx'), 'DcaSymbolPicker.jsx', false, { './InvestmentSymbolPicker.jsx': sharedPickerModule });
const productionModule = await compile(source, 'DcaLabPage.jsx', false, { '../components/DcaSymbolPicker.jsx': pickerModule });
const { default: DcaLabPage, DcaLabResults } = await import(productionModule);
const { default: DcaLabPreview } = await import(await compile(preview, 'DcaLabPreview.jsx', false, { '../pages/DcaLabPage.jsx': productionModule }));

// A tiny arithmetic fixture, not a claim about real QQQ prices. It satisfies the
// same normalized history contract consumed by the production model.
const plan = { symbol: 'QQQ', startYear: 2026, endYear: 2026, initial: 1000, amount: 100, frequency: 'monthly' };
const data = {
  version: 1, source: 'EODHD_EOD', symbol: 'QQQ', name: 'QQQ test history', type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close',
  rows: [{ date: '2026-09-04', close: 100 }, { date: '2026-09-08', close: 120 }],
  availableFromDate: '2026-09-04', asOfDate: '2026-09-08', expectedAsOfDate: '2026-09-08', fetchedAt: '2026-09-09T00:00:00Z', stale: false, staleReason: '',
};
const model = buildDcaModel({ data, plan });
const annualPlan = { ...plan, startYear: 2025 };
// An explicit four-session arithmetic fixture straddling a year boundary. The
// monthly contribution arrives after a fall, so the two strategies diverge.
const annualData = {
  ...data,
  rows: [
    { date: '2025-12-22', close: 100 }, { date: '2025-12-29', close: 120 },
    { date: '2026-01-05', close: 80 }, { date: '2026-01-12', close: 90 },
  ],
  availableFromDate: '2025-12-22', asOfDate: '2026-01-12', expectedAsOfDate: '2026-01-12',
};
const annualModel = buildDcaModel({ data: annualData, plan: annualPlan });
const htmlOf = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

// Supply component-local UI state while preserving React's SSR rendering. No
// production code or browser state is changed by these interaction assertions.
function capture(Component, props, overrides = []) {
  const original = React.useState, originalEffect = React.useEffect;
  let nextState = 0, tree;
  const changes = [], states = [], effects = [];
  React.useEffect = (effect, dependencies) => { effects.push({ effect, dependencies }); return originalEffect(effect, dependencies); };
  React.useState = initial => {
    const stateIndex = nextState++;
    const [value] = original(initial);
    const selected = stateIndex in overrides ? overrides[stateIndex] : value;
    states[stateIndex] = selected;
    return [selected, next => changes.push({ stateIndex, next })];
  };
  try {
    const html = htmlOf(() => { tree = Component(props); return tree; });
    return { html, tree, changes, states, effects };
  } finally { React.useState = original; React.useEffect = originalEffect; }
}

function applyChanges(result) {
  const states = [...result.states];
  for (const { stateIndex, next } of result.changes) states[stateIndex] = typeof next === 'function' ? next(states[stateIndex]) : next;
  return states;
}

test('the redundant header source row is removed while real-history safeguards and collapsed methodology remain', () => {
  const html = htmlOf(DcaLabPage, { ctx: { userId: 'user-a' } });
  assert.doesNotMatch(html, /历史回测 · EODHD|dl-preview-label/);
  assert.doesNotMatch(source, /dl-preview-label/);
  const results = htmlOf(DcaLabResults, { model, plan });
  assert.match(results, /<details class="dl-method"><summary>实验口径/);
  assert.match(results, /使用 EODHD 真实历史日线复权收盘价/);
  assert.match(html, /正在读取.*QQQ.*真实历史行情/);
  assert.doesNotMatch(source + preview, /simulateDca|buildDcaSimulation|Math\.random|source:\s*['"]synthetic|本地模拟 · 非真实行情/);
  assert.match(source, /import\.meta\.env\.DEV && previewSource\?\.load \? previewSource\.load : loadDcaHistory/);
  assert.match(preview, /data\.source !== 'EODHD_EOD'/);
  assert.match(preview, /if \(!import\.meta\.env\.DEV\) return null/);
  assert.equal(htmlOf(DcaLabPreview, { ctx: {} }), '');
  assert.doesNotMatch(source, /\.\.\/dev\//);
});

test('the default plan is CNY 10000 for initial and monthly contributions with the current rate pinned', () => {
  const overrides = [];
  overrides[1] = true;
  const page = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 6.7048 } }, overrides);
  assert.match(page.html, /每月 ¥10,000<\/span>/);
  assert.match(page.html, /起投 ¥10,000<\/span>/);
  assert.match(page.html, /value="CNY" selected=""/);
  const editor = nodes(page.tree, node => node.type?.name === 'PlanEditor')[0];
  assert.equal(editor.props.plan.amount, 10000);
  assert.equal(editor.props.plan.initial, 10000);
  assert.equal(editor.props.plan.frequency, 'monthly');
  assert.equal(editor.props.plan.symbol, 'QQQ');
  assert.equal(editor.props.plan.startYear, 2020);
  assert.equal(editor.props.plan.inputCurrency, 'CNY');
  assert.equal(editor.props.plan.inputRate, 6.7048);
  assert.equal(editor.props.displayCurrency, 'CNY');
});

test('currency switching only changes display while CNY contributions normalize to a fixed USD plan', () => {
  const cnyPlan = { ...plan, initial: 10000, amount: 10000, inputCurrency: 'CNY', inputRate: 7 };
  const loaded = { key: 'user-a:QQQ', data, loading: false, error: '' };
  const first = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 7 } }, [cnyPlan, false, 0, loaded, 'CNY']);
  const firstResults = nodes(first.tree, node => node.type?.name === 'DcaLabResults')[0];
  assert.equal(firstResults.props.plan.initial, 10000 / 7);
  assert.equal(firstResults.props.plan.amount, 10000 / 7);
  assert.equal(firstResults.props.plan.inputCurrency, 'USD');
  const currency = nodes(first.tree, node => node.type === 'select' && node.props['aria-label'] === '显示币种')[0];
  currency.props.onChange({ target: { value: 'USD' } });
  assert.deepEqual(first.changes, [{ stateIndex: 4, next: 'USD' }]);
  const switched = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 8 } }, applyChanges(first));
  const nextResults = nodes(switched.tree, node => node.type?.name === 'DcaLabResults')[0];
  assert.equal(nextResults.key, firstResults.key, 'currency and current rate do not remount the results or reset playback');
  assert.deepEqual(nextResults.props.model, firstResults.props.model);
  assert.deepEqual(nextResults.props.plan, firstResults.props.plan);
  assert.equal(nextResults.props.displayCurrency, 'USD');
  assert.deepEqual(switched.effects[1].dependencies, first.effects[1].dependencies, 'the historical request does not depend on display currency or FX rate');
  const selected = capture(DcaLabResults, { ...nextResults.props }, [true, 0, false]);
  assert.match(selected.html, /当时定投资产<time dateTime="2026-09-04">/);
});

test('missing initial FX waits without a fabricated model and resolves the CNY plan only once', () => {
  const unresolved = { ...plan, initial: 10000, amount: 10000, inputCurrency: 'CNY', inputRate: null };
  const loaded = { key: 'user-a:QQQ', data, loading: false, error: '' };
  const missing = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: null } }, [unresolved, false, 0, loaded, 'CNY']);
  assert.match(missing.html, /每月 ¥10,000/);
  assert.match(missing.html, /等待汇率/);
  assert.equal(nodes(missing.tree, node => node.type?.name === 'DcaLabResults').length, 0);
  const arrives = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 7 } }, missing.states);
  arrives.effects[0].effect();
  const resolved = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 7 } }, applyChanges(arrives));
  const result = nodes(resolved.tree, node => node.type?.name === 'DcaLabResults')[0];
  assert.equal(result.props.plan.initial, 10000 / 7);
  const later = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 8 } }, resolved.states);
  later.effects[0].effect();
  assert.equal(applyChanges(later)[0], resolved.states[0], 'subsequent rates keep the original input rate');
  assert.equal(nodes(later.tree, node => node.type?.name === 'DcaLabResults')[0].key, result.key);
});

test('an open plan editor preserves unedited precision through currency and rate switches, and cancel never applies', () => {
  const exactPlan = { ...plan, initial: 1234.567891, amount: 12.34567891, inputCurrency: 'USD', inputRate: 1 };
  const page = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 7 } }, [exactPlan, true, 0, { key: '', data: null, loading: true, error: '' }, 'CNY']);
  const editor = nodes(page.tree, node => node.type?.name === 'PlanEditor')[0];
  const applied = []; let cancelled = 0;
  const props = { ...editor.props, onApply: value => applied.push(value), onCancel: () => cancelled++ };
  const opened = capture(editor.type, props);
  const cnyInputs = nodes(opened.tree, node => node.type === 'input' && node.props.type === 'number');
  assert.equal(cnyInputs[0].props.value, '8641.98', 'display rounding does not change the original USD draft');
  const switched = capture(editor.type, { ...props, displayCurrency: 'USD', usdRate: 8 }, opened.states);
  switched.effects[0].effect();
  const settled = capture(editor.type, { ...props, displayCurrency: 'USD', usdRate: 8 }, applyChanges(switched));
  assert.equal(settled.states[0], opened.states[0], 'currency/rate changes must not rewrite a resolved draft');
  settled.tree.props.onSubmit({ preventDefault() {} });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].initial, exactPlan.initial);
  assert.equal(applied[0].amount, exactPlan.amount);
  assert.equal(applied[0].inputCurrency, 'USD');
  const back = capture(editor.type, { ...props, displayCurrency: 'CNY', usdRate: 8 }, settled.states);
  const cancel = nodes(back.tree, node => node.type === 'button' && node.props.children === '取消')[0];
  cancel.props.onClick();
  assert.equal(cancelled, 1);
  assert.equal(applied.length, 1);
  assert.equal(exactPlan.initial, 1234.567891);
});

test('editing one CNY contribution freezes its input rate and leaves the other amount unchanged', () => {
  const exactPlan = { ...plan, initial: 1234.567891, amount: 12.34567891, inputCurrency: 'USD', inputRate: 1 };
  const page = capture(DcaLabPage, { ctx: { userId: 'user-a', usdRate: 7 } }, [exactPlan, true, 0, { key: '', data: null, loading: true, error: '' }, 'CNY']);
  const editor = nodes(page.tree, node => node.type?.name === 'PlanEditor')[0];
  const applied = [];
  const props = { ...editor.props, onApply: value => applied.push(value) };
  const opened = capture(editor.type, props);
  const inputs = nodes(opened.tree, node => node.type === 'input' && node.props.type === 'number');
  inputs[1].props.onChange({ target: { value: '9876.54321' } });
  const edited = capture(editor.type, { ...props, displayCurrency: 'USD', usdRate: 8 }, applyChanges(opened));
  edited.effects[0].effect();
  const settled = capture(editor.type, { ...props, displayCurrency: 'USD', usdRate: 8 }, applyChanges(edited));
  settled.tree.props.onSubmit({ preventDefault() {} });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].initial, exactPlan.initial);
  assert.equal(applied[0].amount, 9876.54321 / 7);
  assert.notEqual(applied[0].amount, 9876.54321 / 8);
  const cleared = capture(editor.type, props, settled.states);
  nodes(cleared.tree, node => node.type === 'input' && node.props.type === 'number')[1].props.onChange({ target: { value: '' } });
  const invalid = capture(editor.type, props, applyChanges(cleared));
  invalid.tree.props.onSubmit({ preventDefault() {} });
  assert.equal(applied.length, 1, 'an empty input must not become a zero contribution');
  assert.match(applyChanges(invalid)[1], /请填写投入金额/);
});

test('loading and failed history never show fabricated zero assets or retained results', () => {
  const loading = htmlOf(DcaLabPage, { ctx: { userId: 'user-a' } });
  const failed = capture(DcaLabPage, { ctx: { userId: 'user-a' } }, [plan, false, 0, { key: 'user-a:QQQ', data: null, loading: false, error: '历史行情暂不可用' }]).html;
  const oldIdentity = capture(DcaLabPage, { ctx: { userId: 'user-b' } }, [plan, false, 0, { key: 'user-a:QQQ', data, loading: false, error: '' }]).html;
  assert.match(loading, /role="status"/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /历史行情暂不可用/);
  assert.match(failed, /重试行情/);
  assert.match(oldIdentity, /正在读取/);
  for (const html of [loading, failed, oldIdentity]) {
    assert.doesNotMatch(html, /class="dl-hero"|class="dl-total"|class="dl-chart"|\$0|\$1,320|NaN|Infinity/);
  }
});

test('switching symbols clears a previous explicit refresh without forcing later cached visits', () => {
  const page = capture(DcaLabPage, { ctx: { userId: 'user-a' } }, [plan, false, 1, { key: 'user-a:QQQ', data, loading: false, error: '' }]);
  const selector = nodes(page.tree, node => node.type?.name === 'DcaSymbolPicker')[0];
  assert.ok(selector, 'the symbol uses the controlled custom picker');
  assert.equal(selector.props.value, 'QQQ');
  assert.equal(selector.props.userId, 'user-a', 'symbol search must retain the current authenticated user');
  assert.equal(selector.props.searchSource, searchInvestmentSymbols, 'production uses the existing authenticated stock and ETF search');
  selector.props.onChange('SPY');
  assert.deepEqual(page.changes[0], { stateIndex: 2, next: 0 });
  assert.equal(page.changes[1].next.symbol, 'SPY');
  assert.match(source, /\[key, userId, plan\.symbol, refresh, source\]/);
});

test('results distinguish assets, contributed principal and cumulative profit excluding principal', () => {
  const html = htmlOf(DcaLabResults, { model, plan });
  assert.match(html, /class="dl-total">\$1,320\.00<\/div>/);
  assert.match(html, /累计收益 \+\$220/);
  assert.match(html, /\+20\.0%/);
  assert.match(html, /累计投入<\/span><strong>\$1,100/);
  assert.match(html, /累计收益＝资产总额－累计投入，不包含本金/);
  assert.match(html, /非年化收益率/);
  assert.match(html, /首日已有全部资金/);
  assert.match(html, /不读取持仓 · 不产生交易/);
  assert.match(html, /value="0.2" selected=""/);
  assert.match(html, /class="dl-chart"/);
  assert.match(html, /height="318"/);
  assert.doesNotMatch(html, /累计收益 \+\$1,320|NaN|Infinity|undefined/);
});

test('DCA profit amount, return and chart follow both color preferences without changing comparison ranking', () => {
  const lossModel = buildDcaModel({ data: { ...data, rows: [data.rows[0], { ...data.rows[1], close: 80 }] }, plan });
  for (const [marketColorMode, positiveClass, negativeClass, positiveColor, negativeColor] of [
    ['redUpGreenDown', 'text-[#ff4b1f]', 'text-[#34d399]', '#ff4b1f', '#34d399'],
    ['greenUpRedDown', 'text-[#34d399]', 'text-[#ff4b1f]', '#34d399', '#ff4b1f'],
  ]) {
    for (const [scenario, textClass, color] of [[model, positiveClass, positiveColor], [lossModel, negativeClass, negativeColor]]) {
      const html = htmlOf(DcaLabResults, { model: scenario, plan, marketColorMode });
      const hero = html.slice(html.indexOf('<section class="dl-hero"'), html.indexOf('<div class="dl-mode"'));
      assert.ok(hero.includes(`class="dl-profit ${textClass}"><span>累计收益`));
      assert.ok(html.includes(`stroke="${color}" fill="none" stroke-width="2.2"`));
    }
    const comparison = capture(DcaLabResults, { model, plan, marketColorMode }, [true]).html;
    assert.match(comparison, /stroke="#ff4b1f" fill="none" stroke-width="2.2"/);
    assert.match(comparison, /stroke="#34d399" fill="none" stroke-width="1.8"/);
  }
});

test('playback asset amount, cumulative contribution and visible date share the same selected history row', () => {
  for (const playing of [false, true]) {
    const { html } = capture(DcaLabResults, { model, plan }, [false, 0, playing]);
    const hero = html.slice(html.indexOf('<section class="dl-hero"'), html.indexOf('<div class="dl-mode"'));
    assert.match(hero, /当时定投资产/);
    assert.match(hero, /<time dateTime="2026-09-04">2026-09-04<\/time>/);
    assert.match(hero, /class="dl-total">\$1,100\.00<\/div>/);
    assert.match(hero, /累计收益 \$0/);
    assert.doesNotMatch(hero, /2026-09-08|\$1,320|\+\$220/);
  }
  const latest = htmlOf(DcaLabResults, { model, plan });
  assert.match(latest, /期末定投资产<time dateTime="2026-09-08">2026-09-08<\/time>/);
  const heroSource = source.slice(source.indexOf('<section className="dl-hero"'), source.indexOf('<div className="dl-mode"'));
  assert.doesNotMatch(heroSource, /Date\(|Date\.now|playing\s*&&/);
});

test('annual results compare both strategies at each actual cutoff and remove the purchase list', () => {
  const result = capture(DcaLabResults, { model: annualModel, plan: annualPlan });
  const years = nodes(result.tree, node => node.type === 'article' && node.props.className === 'dl-year');
  assert.equal(years.length, 2);
  const [latest, earlier] = years.map(year => htmlOf(() => year));
  assert.match(latest, /2026/);
  assert.match(latest, /2026-01-12/);
  assert.match(earlier, /2025/);
  assert.match(earlier, /2025-12-29/);
  assert.match(latest, /\$1,102\.50/);
  assert.match(latest, /\$1,080\.00/);
  assert.match(latest, /-8\.1%/);
  assert.match(latest, /-10\.0%/);
  assert.match(latest, /−\$318/);
  assert.match(latest, /−\$360/);
  assert.match(earlier, /\$1,320\.00/);
  assert.match(earlier, /\$1,440\.00/);
  assert.match(earlier, /\+20\.0%/);
  assert.match(earlier, /\+\$220/);
  assert.match(earlier, /\+\$240/);
  for (const html of [latest, earlier]) {
    assert.match(html, /定投/);
    assert.match(html, /一次投入/);
    assert.match(html, /累计收益率/);
    assert.match(html, /本年盈亏/);
    assert.doesNotMatch(html, /年度收益率|NaN|Infinity|undefined/);
  }
  assert.match(result.html, /年度盈亏已扣除本年新增投入/);
  assert.match(result.html, /USD/);
  assert.match(result.html, /复权份额仅用于回测试算，不代表当时实际买入股数/);
  assert.doesNotMatch(result.html, /每笔定投|展开全部|收起记录|<table/);
  assert.doesNotMatch(source, /expandedRecords|setRecords|setExpandedRecords/);
});

test('comparison assets, returns and leading amount track the selected history row', () => {
  for (const index of [0, 1, 3]) {
    const result = capture(DcaLabResults, { model: annualModel, plan: annualPlan }, [true, index]);
    const comparisons = nodes(result.tree, node => node.type?.name === 'DcaComparisonValues');
    assert.ok(comparisons.length >= 2);
    const selected = comparisons[0];
    const row = annualModel.rows[index];
    for (const field of ['value', 'lumpValue', 'returnPct', 'lumpReturnPct', 'advantage']) {
      assert.equal(selected.props[field], row[field], `${field} uses selected date ${row.date}`);
    }
    const selectedHtml = htmlOf(selected.type, selected.props);
    assert.match(selectedHtml, /累计收益率/);
    if (index === 0) {
      assert.match(selectedHtml, /\$1,100\.00/);
      assert.match(selectedHtml, /\$1,200\.00/);
      assert.match(selectedHtml, /0\.0%/);
      assert.match(selectedHtml, /一次投入领先/);
      assert.match(selectedHtml, /\$100/);
      assert.doesNotMatch(selectedHtml, /-8\.1%|-10\.0%|\$1,102\.50/);
    } else if (index === 3) {
      assert.match(selectedHtml, /定投领先/);
      assert.match(selectedHtml, /\$22\.50/);
      assert.match(selectedHtml, /-8\.1%/);
      assert.match(selectedHtml, /-10\.0%/);
    }
    const finalComparison = comparisons.find(node => node !== selected && node.props.annual !== true);
    assert.ok(finalComparison);
    assert.equal(finalComparison.props.value, annualModel.summary.value, 'the final comparison remains at the full period');
    assert.equal(finalComparison.props.lumpReturnPct, annualModel.summary.lumpReturnPct);
    assert.equal(finalComparison.props.advantage, annualModel.summary.advantage);
    assert.match(result.html, /首日已有全部资金/);
  }
});

test('equal results explicitly show a tie with both cumulative returns', () => {
  const result = capture(DcaLabResults, { model, plan }, [true]);
  const comparisons = nodes(result.tree, node => node.type?.name === 'DcaComparisonValues');
  assert.ok(comparisons.length >= 3, 'selected, final and annual comparisons remain available');
  for (const comparison of comparisons) {
    const html = htmlOf(comparison.type, comparison.props);
    assert.match(html, /两种方案持平/);
    assert.equal((html.match(/\+20\.0%/g) || []).length, 2);
    assert.doesNotMatch(html, /定投领先|一次投入领先|NaN|Infinity/);
  }
});

test('comparison returns and annual profit follow both market preferences independently from the winning strategy', () => {
  for (const [marketColorMode, positiveClass, negativeClass] of [
    ['redUpGreenDown', 'text-[#ff4b1f]', 'text-[#34d399]'],
    ['greenUpRedDown', 'text-[#34d399]', 'text-[#ff4b1f]'],
  ]) {
    const result = capture(DcaLabResults, { model: annualModel, plan: annualPlan, marketColorMode }, [true]);
    const comparisons = nodes(result.tree, node => node.type?.name === 'DcaComparisonValues');
    for (const comparison of comparisons) {
      const html = htmlOf(comparison.type, comparison.props);
      const negative = comparison.props.returnPct < 0;
      const color = negative ? negativeClass : positiveClass;
      assert.ok(html.includes(`<div class="dl-comparison-return"><b class="${color}">`));
      const conclusion = html.slice(html.indexOf('class="dl-compare-conclusion"'));
      assert.ok(conclusion.includes(`class="${positiveClass}"`), 'leading amount is the winner’s positive advantage in both preference modes');
      if (comparison.props.annual) {
        const expectedClass = comparison.props.profit < 0 ? negativeClass : positiveClass;
        assert.ok(html.includes(`<div class="dl-annual-profit"><span>本年盈亏</span><b class="${expectedClass}">`));
      }
    }
    const previousYear = comparisons.find(node => node.props.year === 2025);
    const latestYear = comparisons.find(node => node.props.year === 2026);
    assert.match(htmlOf(previousYear.type, previousYear.props), /一次投入领先定投/);
    assert.match(htmlOf(latestYear.type, latestYear.props), /定投领先一次投入/);
    assert.match(htmlOf(latestYear.type, latestYear.props), /-8\.1%/);
    assert.match(htmlOf(latestYear.type, latestYear.props), /-10\.0%/);
  }
});

test('ordinary chart touches and timeline input select dates without stopping active playback', () => {
  const results = capture(DcaLabResults, { model, plan }, [false, 0, true]);
  const chartElement = nodes(results.tree, node => node.type?.name === 'DcaChart')[0];
  assert.ok(chartElement);
  const chart = capture(chartElement.type, chartElement.props);
  const touchLayer = nodes(chart.tree, node => node.type === 'rect' && node.props.onPointerDown)[0];
  assert.equal(touchLayer.props.style.touchAction, 'pan-y');
  const event = { clientX: 350, buttons: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0 }) }, preventDefault() { assert.fail('chart must not cancel ordinary scrolling'); } };
  touchLayer.props.onPointerMove(event);
  assert.equal(results.changes.length, 0, 'ordinary unpressed movement must not select or pause');
  touchLayer.props.onPointerDown(event);
  assert.deepEqual(results.changes, [{ stateIndex: 1, next: 1 }]);
  const timeline = nodes(results.tree, node => node.type === 'input' && node.props.type === 'range')[0];
  timeline.props.onChange({ target: { value: '0' } });
  assert.deepEqual(results.changes.at(-1), { stateIndex: 1, next: 0 });
  assert.ok(results.changes.every(change => change.stateIndex === 1), 'only the cursor changes; the playing state stays untouched');
  const pause = nodes(results.tree, node => node.type === 'button' && node.props.className === 'dl-play')[0];
  pause.props.onClick();
  assert.equal(results.changes.at(-1).stateIndex, 2);
  assert.equal(results.changes.at(-1).next(true), false, 'the explicit pause control stops playback');
});

test('the tool remains read-only and inherits the existing page width and bottom navigation', () => {
  assert.match(source, /<main className="investment-comparison ic-page dca-lab">/);
  assert.doesNotMatch(source, /<nav\b|dl-bottom-nav|fixed bottom|document\.body\.style|visualViewport|addEventListener\(['"]touch|localStorage|sessionStorage|supabase|stock_trades|\b(?:insert|upsert|delete)\s*\(/);
  const css = read('src/components/DcaLab.css');
  assert.doesNotMatch(css, /(?:^|\n)(?:body|html|#root)\s*[{,.]/);
  assert.doesNotMatch(css, /position\s*:\s*fixed|100d?vh|po-viewport/);
  const chart = source.slice(source.indexOf('function DcaChart'), source.indexOf('function PlanEditor'));
  assert.doesNotMatch(chart, /preventDefault|setPlaying|stopPropagation/);
  assert.match(source, /draft\[key\]\.text\.trim\(\) === ''/);
  assert.match(source, /min="0" max=\{displayRate === null \? undefined : 100000000 \* displayRate\}/);
});

test('asset values display two decimals without rounding the underlying history or changing chart units', () => {
  const fractional = buildDcaModel({ data: { ...data, rows: [data.rows[0], { ...data.rows[1], close: 120.123456 }] }, plan });
  const original = JSON.stringify(fractional);
  const results = capture(DcaLabResults, { model: fractional, plan }, [true]);
  assert.match(results.html, /class="dl-total">\$1,321\.36<\/div>/);
  assert.match(results.html, /定投期末资产<\/span><strong[^>]*>\$1,321\.36<\/strong>/);
  assert.match(results.html, /一次投入期末资产<\/span><strong[^>]*>\$1,321\.36<\/strong>/);
  const annual = nodes(results.tree, node => node.type === 'article' && node.props.className === 'dl-year')[0];
  assert.equal((htmlOf(() => annual).match(/\$1,321\.36/g) || []).length, 2, 'both annual ending assets retain cents');
  const comparison = results.html.slice(results.html.indexOf('class="dl-chart-comparison"'), results.html.indexOf('class="dl-chart"'));
  assert.equal((comparison.match(/\$1,321\.36/g) || []).length, 2);
  assert.equal(JSON.stringify(fractional), original);
  assert.equal(fractional.rows.at(-1).price, 120.123456);
  const large = buildDcaModel({ data, plan: { ...plan, initial: 10000000, amount: 1000000 } });
  assert.match(htmlOf(DcaLabResults, { model: large, plan }), /class="dl-total">\$1320\.00万<\/div>/);
  assert.match(htmlOf(DcaLabResults, { model: large, plan }), /定投期末资产<\/span><strong[^>]*>\$1320\.00万<\/strong>/);
  assert.match(htmlOf(DcaLabResults, { model, plan }), /定投期末资产<\/span><strong[^>]*>\$1,320\.00<\/strong>/);
});

test('CNY display converts every result region while preserving USD model, returns and selected history', () => {
  const original = JSON.stringify(annualModel);
  const usd = capture(DcaLabResults, { model: annualModel, plan: annualPlan, displayCurrency: 'USD', usdRate: 7 }, [true, 3]);
  const cny = capture(DcaLabResults, { model: annualModel, plan: annualPlan, displayCurrency: 'CNY', usdRate: 7 }, [true, 3]);
  const hero = cny.html.slice(cny.html.indexOf('<section class="dl-hero"'), cny.html.indexOf('<div class="dl-mode"'));
  assert.match(hero, /QQQ · CNY/);
  assert.match(hero, /class="dl-total">¥7,717\.50<\/div>/);
  assert.match(hero, /累计收益 −¥683/);
  assert.match(hero, /累计投入<\/span><strong>¥8,400/);
  assert.match(hero, /2026-01-12/);
  assert.match(hero, /-8\.1%/);
  const comparisons = nodes(cny.tree, node => node.type?.name === 'DcaComparisonValues');
  const selected = htmlOf(comparisons[0].type, comparisons[0].props);
  assert.match(selected, /¥7,717\.50/);
  assert.match(selected, /¥7,560\.00/);
  assert.match(selected, /¥157\.50/);
  assert.match(selected, /-8\.1%/);
  assert.match(selected, /-10\.0%/);
  const annual = nodes(cny.tree, node => node.type === 'article' && node.props.className === 'dl-year').map(year => htmlOf(() => year));
  assert.match(annual[0], /−¥2,223/);
  assert.match(annual[0], /−¥2,520/);
  assert.match(annual[1], /¥9,240\.00/);
  assert.match(annual[1], /¥10,080\.00/);
  assert.match(annual[1], /¥840\.00/);
  assert.match(cny.html, /同等最终本金 ¥8,400/);
  assert.doesNotMatch(cny.html, /\$|NaN|Infinity/);
  const chart = nodes(cny.tree, node => node.type?.name === 'DcaChart')[0];
  assert.match(htmlOf(chart.type, chart.props), /class="dl-axis">CNY/);
  assert.equal(chart.props.index, 3);
  assert.equal(chart.props.rows, annualModel.rows);
  const paths = html => [...html.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(paths(cny.html), paths(usd.html), 'currency changes labels without changing the historical graph');
  const returns = html => [...html.matchAll(/-?\d+\.\d%/g)].map(match => match[0]);
  assert.deepEqual(returns(cny.html), returns(usd.html));
  assert.equal(JSON.stringify(annualModel), original);
});

test('unavailable CNY exchange rates leave money unknown instead of zero or falling back to USD', () => {
  for (const usdRate of [undefined, null, 0, -1, NaN, Infinity, '7']) {
    const result = capture(DcaLabResults, { model: annualModel, plan: annualPlan, displayCurrency: 'CNY', usdRate }, [true]);
    assert.match(result.html, /class="dl-total">—<\/div>/);
    assert.match(result.html, /-8\.1%/);
    assert.match(result.html, /-10\.0%/);
    assert.doesNotMatch(result.html, /¥0|\$|NaN|Infinity|[+−]—/);
  }
});

test('DCA receives the current display exchange rate in production and preview contexts', () => {
  const app = read('src/App.jsx');
  const dev = read('src/DevVisualPreview.jsx');
  assert.match(app, /<DcaLabPage[^\n]*ctx=\{\{[^\n]*\busdRate\b[^\n]*closeDcaLab/);
  assert.match(dev, /<DcaLabPreview[^\n]*ctx=\{\{[^\n]*usdRate: USD_RATE[^\n]*closeDcaLab/);
  assert.match(preview, /<DcaLabPage ctx=\{\{ \.\.\.ctx, userId:/);
});

test('the plan retains its background while symbol search reuses the existing investment dialog', () => {
  const css = read('src/components/DcaLab.css');
  const dca = css.match(/\.dca-lab \.dl-plan \{([^}]+)\}/)[1];
  const overlap = read('src/components/PortfolioOverlap.css').match(/\.investment-comparison \.po-hero \{([^}]+)\}/)[1];
  const background = rule => rule.match(/background:([^;]+);/)[1];
  assert.equal(background(dca), background(overlap));
  assert.doesNotMatch(dca, /--ic-(?:panel|bg|border)\s*:|box-shadow/);
  assert.doesNotMatch(css, /\.dl-symbol-menu\b|\.dl-symbol-option\b/);
  const sharedPicker = read('src/components/InvestmentSymbolPicker.jsx');
  assert.match(sharedPicker, /import ['"]\.\/InvestmentComparison\.css['"]/);
  assert.match(sharedPicker, /className="investment-comparison ic-time-machine ic-sheet-overlay"/);
  assert.match(sharedPicker, /className="ic-picker" role="dialog"/);
  assert.match(read('src/components/DcaSymbolPicker.jsx'), /import InvestmentSymbolPicker from ['"]\.\/InvestmentSymbolPicker\.jsx['"]/);
});
