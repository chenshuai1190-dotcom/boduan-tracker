import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { buildDcaModel } from '../src/lib/dcaLabModel.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/pages/DcaLabPage.jsx');
const preview = read('src/dev/DcaLabPreview.jsx');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function compile(text, file, dev = false, replacements = {}) {
  const transformed = await transformWithOxc(text, file, { jsx: { runtime: 'classic' } });
  const compiled = transformed.code
    .replace(/from (["'])(react|lucide-react)\1/g, (_match, _quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
    .replace(/from (["'])(\.\.\/[^"']+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(replacements[path] || new URL(`../src/${path.slice(3)}`, import.meta.url).href)}`)
    .replace(/import ["'][^"']+\.css["'];?/g, '')
    .replaceAll('import.meta.env.DEV', String(dev));
  return dataUrl(compiled);
}
const pickerModule = await compile(read('src/components/DcaSymbolPicker.jsx'), 'DcaSymbolPicker.jsx');
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
const htmlOf = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

// Supply component-local UI state while preserving React's SSR rendering. No
// production code or browser state is changed by these interaction assertions.
function capture(Component, props, overrides = []) {
  const original = React.useState;
  let nextState = 0, tree;
  const changes = [];
  React.useState = initial => {
    const stateIndex = nextState++;
    const [value] = original(initial);
    return [stateIndex in overrides ? overrides[stateIndex] : value, next => changes.push({ stateIndex, next })];
  };
  try {
    const html = htmlOf(() => { tree = Component(props); return tree; });
    return { html, tree, changes };
  } finally { React.useState = original; }
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

test('incomplete annual periods show the actual date and purchase records use adjusted simulation units', () => {
  const html = htmlOf(DcaLabResults, { model, plan });
  assert.equal(model.years[0].partial, true);
  assert.match(html, /2026<small class="dl-partial">截至 09-08<\/small>/);
  assert.match(html, /年度盈亏已扣除本年新增投入/);
  const records = capture(DcaLabResults, { model, plan }, [false, null, false, .2, true]).html;
  assert.match(records, /<th>复权价<\/th><th>复权份额<\/th>/);
  assert.match(records, /<th>26-09-04<\/th><td>1,100<\/td><td>100\.00<\/td><td>11\.00<\/td>/);
  assert.match(records, /复权份额非实际持股数/);
  assert.match(records, /复权份额仅用于回测试算，不代表当时实际买入股数/);
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
  assert.match(source, /String\(draft\[key\]\)\.trim\(\) === ''/);
  assert.match(source, /min="0" max="100000000"/);
});

test('asset values display two decimals without rounding the underlying history or changing chart units', () => {
  const fractional = buildDcaModel({ data: { ...data, rows: [data.rows[0], { ...data.rows[1], close: 120.123456 }] }, plan });
  const original = JSON.stringify(fractional);
  const results = capture(DcaLabResults, { model: fractional, plan }, [true]);
  assert.match(results.html, /class="dl-total">\$1,321\.36<\/div>/);
  assert.match(results.html, /定投期末资产<\/span><strong[^>]*>\$1,321\.36<\/strong>/);
  assert.match(results.html, /一次投入期末资产<\/span><strong[^>]*>\$1,321\.36<\/strong>/);
  assert.match(results.html, /<td>1,321\.36<\/td><\/tr>/, 'annual ending assets retain cents too');
  const comparison = results.html.slice(results.html.indexOf('class="dl-chart-comparison"'), results.html.indexOf('class="dl-chart"'));
  assert.equal((comparison.match(/\$1,321\.36/g) || []).length, 2);
  assert.equal(JSON.stringify(fractional), original);
  assert.equal(fractional.rows.at(-1).price, 120.123456);
  const large = buildDcaModel({ data, plan: { ...plan, initial: 10000000, amount: 1000000 } });
  assert.match(htmlOf(DcaLabResults, { model: large, plan }), /class="dl-total">\$1320\.00万<\/div>/);
  assert.match(htmlOf(DcaLabResults, { model: large, plan }), /<td>1320\.00万<\/td><\/tr>/);
  assert.match(htmlOf(DcaLabResults, { model, plan }), /<td>1,320\.00<\/td><\/tr>/);
});

test('the plan and symbol popup cards use the exact overlap hero background and inherited color tokens', () => {
  const css = read('src/components/DcaLab.css');
  const dca = css.match(/\.dca-lab \.dl-plan \{([^}]+)\}/)[1];
  const menu = css.match(/\.dca-lab \.dl-symbol-menu \{([^}]+)\}/)[1];
  const overlap = read('src/components/PortfolioOverlap.css').match(/\.investment-comparison \.po-hero \{([^}]+)\}/)[1];
  const background = rule => rule.match(/background:([^;]+);/)[1];
  assert.equal(background(dca), background(overlap));
  assert.equal(background(menu), background(overlap));
  assert.match(menu, /border:1px solid var\(--ic-border\)/);
  assert.doesNotMatch(dca, /--ic-(?:panel|bg|border)\s*:|box-shadow/);
  assert.doesNotMatch(menu, /--ic-(?:panel|bg|border)\s*:|inset/);
});
