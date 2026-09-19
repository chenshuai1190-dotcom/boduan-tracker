import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { MACRO_MOCK_SNAPSHOT } from '../src/macro/macroMockData.js';
import { formatMacroValue, formatMacroChange, formatMacroEventTime } from '../src/macro/macroFormat.js';

const source = readFileSync(new URL('../src/pages/MacroPage.jsx', import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
// Execute the real page and child components with independent hook slots. Only
// the chart is replaced: its actual SVG and range slicing have a separate suite.
const hooksUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let instances = new Map(), visited = new Set(), current;
  export function reset() { instances.clear(); }
  export function begin() { visited = new Set(); }
  export function end() { for (const key of instances.keys()) if (!visited.has(key)) instances.delete(key); }
  export function render(Component, props, key) {
    const previous = current;
    const slots = instances.get(key) || [];
    instances.set(key, slots); visited.add(key);
    current = { slots, cursor: 0 };
    try { return Component(props); } finally { current = previous; }
  }
  function useState(initial) {
    const index = current.cursor++;
    const slot = current.slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  }
  function useRef(initial) { return current.slots[current.cursor++] ||= { current: initial }; }
  function useMemo(factory) { current.cursor++; return factory(); }
  function useEffect() { current.cursor++; }
  export default { ...React, useState, useRef, useMemo, useEffect };
`);
const chartUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export default function MacroHistoryChart({ metric, range }) {
    return React.createElement('div', { 'data-chart-stub': true, 'data-metric': metric.id, 'data-range': range });
  }
`);
const transformed = await transformWithOxc(source, 'MacroPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/MacroPage\.css\1;?/g, '')
  .replace(/from (['"])\.\.\/components\/MacroHistoryChart\.jsx\1/g, `from ${JSON.stringify(chartUrl)}`)
  .replace(/from (['"])(\.\.\/macro\/[^'"]+\.js)\1/g, (_, _quote, path) => `from ${JSON.stringify(new URL(`../src/${path.slice(3)}`, import.meta.url).href)}`)
  .replace(/from (['"])(react|lucide-react)\1/g, (_, _quote, module) => `from ${JSON.stringify(module === 'react' ? hooksUrl : import.meta.resolve(module))}`);
const hooks = await import(hooksUrl);
const { default: MacroPage } = await import(dataUrl(compiled));

function expand(node, path = 'root') {
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') {
    const key = `${path}/${node.type.name}`;
    return expand(hooks.render(node.type, node.props, key), key);
  }
  const children = React.Children.toArray(node.props.children).flatMap((child, index) => expand(child, `${path}/${index}`));
  if (node.type === React.Fragment) return children;
  return React.cloneElement(node, { children });
}
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.Children.toArray(node.props?.children).map(text).join('');
}
const byClass = (tree, name) => nodes(tree, node => node.props.className?.split(/\s+/).includes(name));
const buttons = tree => nodes(tree, node => node.type === 'button');
const buttonText = (tree, label) => buttons(tree).find(node => text(node) === label);
const chart = tree => nodes(tree, node => node.props['data-chart-stub'])[0];
const metricValue = id => formatMacroValue(MACRO_MOCK_SNAPSHOT.metrics[id].value, MACRO_MOCK_SNAPSHOT.metrics[id].unit);
function harness(props = {}) {
  hooks.reset();
  return {
    render() {
      hooks.begin();
      const tree = expand(React.createElement(MacroPage, props));
      hooks.end();
      return tree;
    },
    click(node) { assert.equal(typeof node?.props.onClick, 'function', 'the requested control must exist'); node.props.onClick(); return this.render(); },
  };
}
const goBack = (h, tree) => h.click(byClass(tree, 'macro-back')[0]);
const calendarEvents = tree => byClass(tree, 'macro-calendar-event');
const eventCodes = tree => calendarEvents(tree).map(event => text(nodes(event, node => node.type === 'h2')[0]));

test('Macro overview has exactly six layers and four summaries without lower-level metric lists', () => {
  const tree = harness().render();
  assert.equal(tree.props['data-macro-page'], 'overview');
  const layers = React.Children.toArray(tree.props.children);
  assert.equal(layers.length, 6);
  for (const [index, className] of ['macro-header', 'macro-summary-grid', 'macro-rate-card', 'macro-core-grid', 'macro-focus', 'macro-insight'].entries()) {
    assert.ok(layers[index].props.className.split(/\s+/).includes(className), `overview layer ${index + 1} must be ${className}`);
  }
  const summaryCards = React.Children.toArray(layers[1].props.children);
  assert.equal(summaryCards.length, 2);
  assert.match(summaryCards[0].props.className, /\bmacro-regime\b/);
  assert.match(summaryCards[1].props.className, /\bmacro-pressure\b/);
  assert.equal(byClass(layers[3], 'macro-rate-card').length, 0, 'the full-width rate entry must be outside the remaining dimensions grid');
  assert.deepEqual(byClass(layers[3], 'macro-core-card').map(card => text(byClass(card, 'macro-card-heading')[0])), ['通胀', '市场压力', '流动性']);
  const cards = byClass(tree, 'macro-core-card');
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map(card => text(byClass(card, 'macro-card-heading')[0])), ['利率', '通胀', '市场压力', '流动性']);
  assert.deepEqual(cards.map(card => text(byClass(card, 'macro-core-symbol')[0])), ['美国10年期国债收益率', '美国原油（WTI）', '美股波动率指数（VIX）', '净流动性']);
  assert.deepEqual(cards.slice(0, 3).map(card => byClass(card, 'macro-change')[0].props.style.color), ['#ff4b1f', '#ff4b1f', '#22c55e']);
  assert.equal(byClass(tree, 'macro-metric-row').length, 0);
  assert.equal(chart(tree), undefined);
  assert.doesNotMatch(text(tree), /VVIX|MOVE|SOFR|EFFR|TGA|RRP|Brent|RBOB/);
  assert.match(text(byClass(tree, 'macro-score-row')[0]), /62\s*\/\s*100/);
  assert.match(text(tree), /模拟数据.*演示快照/s);
});

test('score explanation, factor drilldown and internal back preserve the route stack', () => {
  let exits = 0;
  const h = harness({ onBack: () => { exits++; } });
  let tree = h.click(byClass(h.render(), 'macro-pressure')[0]);
  assert.equal(tree.props['data-macro-page'], 'growth');
  assert.equal(byClass(tree, 'macro-factor').length, 4);
  assert.match(text(tree), /不是市场涨跌概率.*不生成买卖建议/);
  assert.match(text(tree), /尚未校准或回测/);
  tree = h.click(byClass(tree, 'macro-factor')[0]);
  assert.equal(tree.props['data-macro-page'], 'rates');
  tree = goBack(h, tree);
  assert.equal(tree.props['data-macro-page'], 'growth');
  tree = goBack(h, tree);
  assert.equal(tree.props['data-macro-page'], 'overview');
  assert.equal(exits, 0);
  goBack(h, tree);
  assert.equal(exits, 1);
});

test('all four overview entries and both calendar controls open their own page', () => {
  for (const [index, page] of ['rates', 'inflation', 'stress', 'liquidity'].entries()) {
    const h = harness();
    let tree = h.click(byClass(h.render(), 'macro-core-card')[index]);
    assert.equal(tree.props['data-macro-page'], page);
    tree = goBack(h, tree);
    assert.equal(tree.props['data-macro-page'], 'overview');
  }
  for (const choose of [tree => buttonText(tree, '7天日历 '), tree => byClass(tree, 'macro-event-preview')[0]]) {
    const h = harness();
    const tree = h.render();
    const control = choose(tree) || buttons(tree).find(node => text(node).trim() === '7天日历');
    assert.equal(h.click(control).props['data-macro-page'], 'calendar');
  }
  const h = harness({ initialPage: 'calendar' });
  assert.equal(goBack(h, h.render()).props['data-macro-page'], 'overview');
});

test('inflation tabs select the correct metric groups and all five ranges reach the shared chart', () => {
  const h = harness({ initialPage: 'inflation' });
  const meanings = {
    wti: /美国原油/, brent: /布伦特原油/, rbob: /汽油/, naturalGas: /天然气/,
    be5y: /5年期盈亏平衡通胀率/, be10y: /10年期盈亏平衡通胀率/, dxy: /美元指数/, gold: /黄金/,
  };
  let tree = h.render();
  for (const [tab, label] of [['energy', '能源'], ['expectations', '通胀预期'], ['dollarGold', '美元 / 黄金']]) {
    tree = h.click(buttonText(tree, label));
    const ids = MACRO_MOCK_SNAPSHOT.groups[tab];
    assert.equal(buttonText(tree, label).props['aria-selected'], true);
    assert.equal(byClass(tree, 'macro-metric-row').length, ids.length);
    assert.equal(chart(tree).props['data-metric'], ids[0]);
    for (const [index, id] of ids.entries()) {
      assert.match(text(byClass(tree, 'macro-metric-name')[index]), meanings[id], `${id} must explain its meaning in Chinese`);
      tree = h.click(byClass(tree, 'macro-metric-row')[index]);
      assert.match(text(byClass(tree, 'macro-hero-label')[0]), meanings[id]);
      assert.match(text(byClass(tree, 'macro-metric-definition')[0]), /[\u4e00-\u9fff]/,
        `${id} must show an instrument definition independent of its current status`);
    }
    const lastId = ids.at(-1);
    tree = h.click(byClass(tree, 'macro-metric-row').at(-1));
    assert.equal(chart(tree).props['data-metric'], lastId);
    assert.equal(text(byClass(tree, 'macro-hero-value')[0]), metricValue(lastId));
    for (const [range, label] of [['1w', '一周'], ['1m', '一个月'], ['3m', '三个月'], ['1y', '一年'], ['5y', '五年']]) {
      tree = h.click(buttonText(tree, label));
      assert.equal(chart(tree).props['data-range'], range);
      assert.equal(chart(tree).props['data-metric'], lastId);
      assert.equal(byClass(tree, 'stock-report-range').filter(button => button.props['aria-pressed']).length, 1);
    }
  }
});

test('rates, energy, spreads, balances and funding rates preserve their display units', () => {
  let h = harness({ initialPage: 'rates' });
  let tree = h.render();
  assert.deepEqual(byClass(tree, 'macro-metric-name').map(text), [
    '美国2年期国债收益率', '美国5年期国债收益率', '美国10年期国债收益率', '美国30年期国债收益率',
    '10年－2年国债收益率差', '美国10年期国债实际收益率',
  ]);
  assert.equal(text(byClass(tree, 'macro-hero-label')[0]), '美国10年期国债收益率');
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), metricValue('us10y'));
  assert.match(text(byClass(tree, 'macro-hero-change')[0]), /\+8 bp/);
  assert.equal(byClass(byClass(tree, 'macro-hero-change')[0], 'macro-change')[0].props.style.color, '#ff4b1f');
  assert.equal(byClass(tree, 'macro-hero-value')[0].props.style?.color, undefined, 'a yield level must stay neutral');
  assert.match(text(byClass(tree, 'macro-history-context')[0]), /5日变化.*20日变化.*20日位置/);
  assert.doesNotMatch(text(tree), /\b(?:1D|5D|20D)\b/);
  tree = h.click(byClass(tree, 'macro-metric-row')[MACRO_MOCK_SNAPSHOT.groups.rates.indexOf('spread10y2y')]);
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '29 bp');
  assert.doesNotMatch(text(byClass(tree, 'macro-hero-value')[0]), /%/);
  h = harness({ initialPage: 'inflation' });
  tree = h.render();
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '$71.24');
  assert.match(text(byClass(tree, 'macro-hero-change')[0]), /\+2\.80%/);
  tree = h.click(buttonText(tree, '通胀预期'));
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '2.42%');
  assert.match(text(byClass(tree, 'macro-hero-change')[0]), /\+2 bp/);
  tree = h.click(buttonText(tree, '美元 / 黄金'));
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '103.42');
  h = harness({ initialPage: 'liquidity' });
  tree = h.render();
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '$5,580.0B');
  assert.match(text(byClass(tree, 'macro-liquidity-hero')[0]), /净流动性.*派生指标.*美元十亿.*美联储总资产 − 财政部一般账户 − 隔夜逆回购/s);
  const liquidityMeanings = [/美联储资产负债表/, /财政部一般账户/, /隔夜逆回购/, /担保隔夜融资利率/, /有效联邦基金利率/];
  for (const [index, label] of byClass(tree, 'macro-metric-name').entries()) {
    assert.match(text(React.Children.toArray(label.props.children)[0]), liquidityMeanings[index]);
  }
  const readings = byClass(tree, 'macro-metric-reading').map(text);
  assert.match(readings[0], /^\$6,480\.0B/);
  assert.match(readings[3], /^4\.34%\+1 bp$/);
  assert.match(readings[4], /^4\.33%0 bp$/);
  assert.doesNotMatch(readings[3] + readings[4], /\$|B/);
  assert.deepEqual(byClass(tree, 'macro-metric-reading').map(reading => byClass(reading, 'macro-change')[0].props.style.color),
    [undefined, '#ff4b1f', '#22c55e', '#ff4b1f', undefined], 'positive changes are red, negative changes green, and unchanged readings neutral');
});

test('every internal page is explicitly simulated and the page has no provider or trading dependencies', () => {
  for (const page of ['overview', 'rates', 'inflation', 'stress', 'liquidity', 'calendar', 'growth']) {
    const tree = harness({ initialPage: page }).render();
    assert.equal(text(byClass(tree, 'macro-demo-label')[0]), '模拟数据');
    assert.match(text(byClass(tree, 'macro-snapshot')[0]), /演示快照 · 2026年9月18日/);
    assert.doesNotMatch(renderToStaticMarkup(tree), /NaN|Infinity|undefined/);
    if (page === 'stress') {
      const meanings = [/美股波动率指数/, /波动率.*波动指数/, /美债波动率指数/, /高收益债信用利差/, /投资级债信用利差/];
      for (const [index, item] of byClass(tree, 'macro-stress-item').entries()) {
        assert.match(text(React.Children.toArray(byClass(item, 'macro-card-heading')[0].props.children)[0]), meanings[index]);
      }
    }
  }
  assert.doesNotMatch(source, /\bfetch\s*\(|supabase|localStorage|sessionStorage|stockDecision|stockRsi|stockTrend|\/api\//);
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', 'lucide-react', '../components/MacroHistoryChart.jsx', '../macro/macroMockData.js', '../macro/macroFormat.js', '../macro/macroPresentation.js', './MacroPage.css'].includes(module)));
});

test('loading, error and empty keep the environment and score absent rather than synthesizing zero', () => {
  for (const state of ['loading', 'error', 'empty']) {
    for (const page of ['overview', 'growth', 'rates']) {
      const h = harness({ initialPage: page, previewState: state });
      let tree = h.render();
      assert.ok(nodes(tree, node => node.props.role === 'status').length > 0);
      assert.equal(byClass(tree, 'macro-score-row').length, 0);
      assert.equal(byClass(tree, 'macro-regime').length, 0);
      assert.equal(byClass(tree, 'macro-core-card').length, 0);
      assert.equal(chart(tree), undefined);
      assert.doesNotMatch(text(tree), /62\s*\/\s*100|0\s*\/\s*100|0\.00%|\$0/);
      if (state !== 'loading') {
        tree = h.click(buttonText(tree, '重新加载演示'));
        assert.equal(tree.props['data-macro-state'], 'ready');
        assert.equal(tree.props['data-macro-page'], page);
      }
    }
  }
});

test('partial data suppresses aggregate scores, missing values and their stale changes', () => {
  let h = harness({ previewState: 'partial' });
  let tree = h.render();
  assert.match(text(tree), /部分数据缺失.*综合评分暂不可用/);
  assert.match(text(byClass(tree, 'macro-regime')[0]), /暂不可判定/);
  assert.match(text(byClass(tree, 'macro-score-row')[0]), /—\s*\/\s*100/);
  assert.doesNotMatch(text(byClass(tree, 'macro-score-row')[0]), /62|0\s*\//);
  const stressCard = byClass(tree, 'macro-core-card').find(card => text(byClass(card, 'macro-card-heading')[0]) === '市场压力');
  assert.equal(text(byClass(stressCard, 'macro-tone')[0]), '部分数据待补全');
  tree = h.click(byClass(tree, 'macro-pressure')[0]);
  assert.equal(text(byClass(tree, 'macro-total')[0]), '合计—');
  for (const factor of byClass(tree, 'macro-factor')) assert.equal(text(nodes(factor, node => node.type === 'strong')[0]), '—');

  h = harness({ initialPage: 'rates', previewState: 'partial' });
  tree = h.render();
  tree = h.click(byClass(tree, 'macro-metric-row')[MACRO_MOCK_SNAPSHOT.groups.rates.indexOf('real10y')]);
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '—');
  assert.match(text(byClass(tree, 'macro-hero-change')[0]), /—$/);
  assert.doesNotMatch(text(byClass(tree, 'macro-hero-change')[0]), /\d|bp|%/);
  assert.equal(byClass(byClass(tree, 'macro-hero-change')[0], 'macro-change')[0].props.style.color, undefined, 'missing changes must stay neutral');
  assert.doesNotMatch(text(byClass(tree, 'macro-insight')[0]), /长端收益率与实际利率近5日走高/);

  h = harness({ initialPage: 'stress', previewState: 'partial' });
  tree = h.render();
  const move = byClass(tree, 'macro-stress-item')[MACRO_MOCK_SNAPSHOT.groups.stress.indexOf('move')];
  assert.equal(text(nodes(move, node => node.type === 'strong')[0]), '—');
  assert.match(text(move), /数据缺失/);
  assert.match(text(byClass(move, 'macro-stress-numbers')[0]), /1日变化.*20日位置/);
  assert.doesNotMatch(text(byClass(move, 'macro-stress-numbers')[0]), /0%|0\.00/);
  assert.equal(nodes(byClass(move, 'macro-percentile')[0], node => node.type === 'i').length, 0,
    'a missing percentile must leave the track empty instead of placing a marker at zero');
  tree = h.click(byClass(move, 'macro-stress-trigger')[0]);
  assert.doesNotMatch(text(byClass(tree, 'macro-stress-expanded')[0]), /[+−]\d/);
  assert.match(text(byClass(tree, 'macro-stress-expanded')[0]), /此指标数据缺失，暂不描述其变化方向与速度。/);
  assert.ok(!text(byClass(tree, 'macro-stress-expanded')[0]).includes(MACRO_MOCK_SNAPSHOT.metrics.move.explanation),
    'an unavailable metric must not retain its ready-state directional explanation');

  tree = harness({ initialPage: 'liquidity', previewState: 'partial' }).render();
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '—');
  assert.equal(text(byClass(tree, 'macro-section-state')[0]), '数据不足');
});

test('stale data is clearly labeled as a previous snapshot instead of a current environment', () => {
  for (const page of ['overview', 'rates', 'growth']) {
    const tree = harness({ initialPage: page, previewState: 'stale' }).render();
    assert.match(text(byClass(tree, 'macro-notice')[0]), /数据待更新.*上次快照.*不能代表当前环境/);
    if (page === 'overview') assert.equal(text(byClass(tree, 'macro-eyebrow')[0]), '上次环境');
    // Historical scores remain visible only with the explicit stale notice.
    if (page !== 'rates') assert.match(text(byClass(tree, 'macro-score-row')[0]), /62\s*\/\s*100/);
  }
});

test('calendar switches upcoming/released events and ET/local time without inventing future actuals', () => {
  const h = harness({ initialPage: 'calendar' });
  let tree = h.render();
  assert.deepEqual(eventCodes(tree), ['CPI', 'Core CPI', 'ISM', 'FOMC', 'Initial Claims', 'GDP', 'PCE', 'Core PCE', 'NFP', 'Unemployment']);
  assert.doesNotMatch(text(byClass(tree, 'macro-event-values')), /公布值|Actual/);
  for (const event of calendarEvents(tree)) assert.match(text(byClass(event, 'macro-event-name')[0]), /[\u4e00-\u9fff]/, 'event codes must have a Chinese explanatory subtitle');
  const cpi = MACRO_MOCK_SNAPSHOT.events.find(event => event.code === 'CPI');
  assert.match(text(calendarEvents(tree)[0]), /2026年9月22日 · 08:30 美东时间/);
  assert.equal(text(byClass(tree, 'macro-time-switch')[0]), '美东时间');
  assert.match(text(byClass(calendarEvents(tree)[0], 'macro-event-name')[0]), /消费者价格指数/);
  assert.match(text(calendarEvents(tree)[0]), /预测值2\.8%前值2\.7%/);
  assert.doesNotMatch(text(calendarEvents(tree)[2]), /49\.2 index/);
  assert.match(text(byClass(calendarEvents(tree)[8], 'macro-event-name')[0]), /非农就业岗位/);
  assert.match(text(byClass(calendarEvents(tree)[8], 'macro-event-values')[0]), /预测值145 千个岗位前值158 千个岗位/);
  assert.match(text(byClass(calendarEvents(tree)[4], 'macro-event-values')[0]), /预测值225 千人前值228 千人/,
    'the NFP display-unit clarification must not change the claims unit');
  assert.equal(MACRO_MOCK_SNAPSHOT.events.find(event => event.code === 'NFP').unit, '千人', 'presentation must not mutate the mock source');
  tree = h.click(byClass(tree, 'macro-time-switch')[0]);
  const local = formatMacroEventTime(cpi.time, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [year, month, day] = local.localDate.split('-').map(Number);
  assert.ok(text(calendarEvents(tree)[0]).includes(`${year}年${month}月${day}日 · ${local.localTime} 本地时间`));
  assert.equal(byClass(tree, 'macro-time-switch')[0].props['aria-pressed'], true);
  tree = h.click(buttonText(tree, '已公布'));
  assert.deepEqual(eventCodes(tree), ['Retail Sales']);
  assert.match(text(byClass(calendarEvents(tree)[0], 'macro-event-name')[0]), /零售销售/);
  assert.match(text(tree), /公布值0\.4%预测值0\.3%前值0\.2%/);
  assert.match(text(tree), /高于预期 · 仅描述数据差异/);
  assert.match(text(tree), /不直接对应利多或利空/);
  tree = h.click(buttonText(tree, '未来7天'));
  assert.equal(calendarEvents(tree).length, 10);
  assert.doesNotMatch(text(byClass(tree, 'macro-event-values')), /公布值|Actual/);
});

test('calendar includes the seven-day boundary, excludes later events and leaves missing estimates blank', () => {
  const now = Date.parse(MACRO_MOCK_SNAPSHOT.now);
  const event = (id, offset) => ({
    id, code: id, name: id, time: new Date(now + offset).toISOString(), importance: 'high',
    actual: null, forecast: null, previous: null, unit: 'percent',
  });
  const snapshot = { ...MACRO_MOCK_SNAPSHOT, events: [
    event('NOW', 0), event('NEXT', 1), event('BOUNDARY', 7 * 86400000), event('LATER', 7 * 86400000 + 1),
  ] };
  const h = harness({ initialPage: 'calendar', snapshot });
  let tree = h.render();
  assert.deepEqual(eventCodes(tree), ['NEXT', 'BOUNDARY']);
  for (const item of calendarEvents(tree)) {
    assert.match(text(item), /预测值—前值—/);
    assert.doesNotMatch(text(item), /0%|公布值|Actual/);
  }
  tree = h.click(buttonText(tree, '已公布'));
  assert.deepEqual(eventCodes(tree), ['NOW']);
  assert.match(text(tree), /公布值—预测值—前值—/);
  assert.equal(byClass(tree, 'macro-surprise').length, 0);
});

test('overview focus shares the calendar seven-day horizon and does not pull in distant high-impact events', () => {
  const now = Date.parse(MACRO_MOCK_SNAPSHOT.now);
  const snapshot = { ...MACRO_MOCK_SNAPSHOT, events: [{
    id: 'far', code: 'FAR EVENT', name: '范围外事件', time: new Date(now + 8 * 86400000).toISOString(), importance: 'high',
  }] };
  const tree = harness({ snapshot }).render();
  assert.equal(byClass(tree, 'macro-event-preview').length, 0);
  assert.match(text(byClass(tree, 'macro-focus')[0]), /未来7天暂无高重要性事件/);
  assert.doesNotMatch(text(tree), /FAR EVENT/);
});

test('selected-metric daily changes are formatted from the mock unit, not inferred from level units', () => {
  const h = harness({ initialPage: 'rates' });
  let tree = h.render();
  for (const [index, id] of MACRO_MOCK_SNAPSHOT.groups.rates.entries()) {
    tree = h.click(byClass(tree, 'macro-metric-row')[index]);
    const metric = MACRO_MOCK_SNAPSHOT.metrics[id];
    assert.equal(text(byClass(tree, 'macro-hero-value')[0]), formatMacroValue(metric.value, metric.unit));
    assert.match(text(byClass(tree, 'macro-metric-definition')[0]), /[\u4e00-\u9fff]/);
    assert.ok(text(byClass(tree, 'macro-hero-change')[0]).endsWith(formatMacroChange(metric.change1d, metric.changeUnit)));
    assert.equal(chart(tree).props['data-metric'], id);
  }
});

function liveSnapshot(overrides = {}) {
  return {
    ...MACRO_MOCK_SNAPSHOT, simulated: false, source: 'FRED', fetchedAt: '2026-09-21T15:00:00Z',
    regime: { label: '待评估', summary: '真实指标已接入，综合环境模型尚未启用。' },
    growth: { score: null, previous: null, label: '待评估', factors: [] },
    interpretation: '已读取真实观测值，暂不生成综合风险判断。',
    metrics: Object.fromEntries(Object.entries(MACRO_MOCK_SNAPSHOT.metrics).map(([id, metric]) => [id, {
      ...metric, simulated: false, source: 'FRED', freshness: 'fresh', error: null,
      fetchedAt: '2026-09-21T15:00:00Z', status: '数据已更新', explanation: '最近有效观测值较前次有所变化。',
    }])),
    events: [], calendarStatus: 'available', calendarSource: '经济日历服务', calendarError: null,
    sections: Object.fromEntries(['rates', 'inflation', 'stress', 'liquidity'].map(id => [id, {
      label: '待评估', summary: `${id}：已读取观测数据，模型尚未启用。`,
    }])),
    ...overrides,
  };
}

test('live pages use their actual snapshot and section summaries without the mock score or static risk judgments', () => {
  const snapshot = liveSnapshot();
  for (const page of ['overview', 'rates', 'inflation', 'stress', 'liquidity', 'calendar', 'growth']) {
    const tree = harness({ initialPage: page, snapshot }).render();
    assert.equal(tree.props['data-macro-mode'], 'live');
    assert.equal(text(byClass(tree, 'macro-demo-label')[0]), '真实数据');
    assert.match(text(byClass(tree, 'macro-snapshot')[0]), /最新观测日.*读取于/);
    assert.doesNotMatch(text(tree), /模拟|演示|62\s*\/\s*100|偏紧|压力上升|近20日温和收缩|近5日走高|近期中段|EODHD|FRED|CBOE|EIA/);
    if (page === 'overview' || page === 'growth') {
      assert.equal(byClass(tree, 'macro-score-row').length, 0);
      assert.equal(byClass(tree, 'macro-summary-grid').length, 0);
      assert.equal(nodes(byClass(tree, 'macro-pressure-bar'), node => node.type === 'i').length, 0);
      if (page === 'growth') assert.match(text(tree), /暂无评分.*模型尚未启用/);
      else assert.equal(byClass(tree, 'macro-pressure').length, 0, 'no unimplemented model is offered as an overview entry');
    }
    if (Object.hasOwn(snapshot.sections, page)) assert.ok(text(tree).includes(snapshot.sections[page].summary));
  }
  const poisonedScore = liveSnapshot({ growth: { ...MACRO_MOCK_SNAPSHOT.growth } });
  for (const page of ['overview', 'growth']) {
    const tree = harness({ initialPage: page, snapshot: poisonedScore }).render();
    assert.doesNotMatch(text(byClass(tree, 'macro-score-row')[0]), /62/,
      'until the model is enabled, a leftover sample score must never become a live score');
  }
});

test('live metrics retain stale values and source errors while removing entries that have no value', () => {
  const snapshot = liveSnapshot();
  snapshot.metrics.us10y = { ...snapshot.metrics.us10y, source: 'EODHD', asOf: '2026-09-17', frequency: '周度', freshness: 'stale', error: 'EODHD 请求限流', observationUnit: '周', basis: 'EODHD 美国财政部国债收益率观测', historyNote: 'FRED 历史区间以实际可得观测为准。' };
  snapshot.metrics.real10y = { ...snapshot.metrics.real10y, value: null, history: [], asOf: null, source: '未接通', freshness: 'unavailable', error: '上游暂未返回数据' };
  const h = harness({ initialPage: 'rates', snapshot });
  let tree = h.render();
  assert.match(text(byClass(tree, 'macro-data-stamp')[0]), /2026年9月17日.*周度.*数据待更新/);
  assert.equal(text(byClass(tree, 'macro-metric-basis')[0]), '美国财政部国债收益率观测');
  assert.ok(text(tree).includes('历史区间以实际可得观测为准。'));
  assert.doesNotMatch(text(tree), /EODHD|FRED|请求限流/);
  assert.equal(snapshot.metrics.us10y.source, 'EODHD', 'display cleanup leaves provenance intact');
  assert.match(text(byClass(tree, 'macro-hero-change')[0]), /^较前次数据\+8 bp$/);
  assert.match(text(byClass(tree, 'macro-history-context')[0]), /5个观测期变化.*20个观测期变化.*20个观测期位置/);
  assert.doesNotMatch(text(byClass(tree, 'macro-history-context')[0]), /5日|20日/);
  assert.match(text(byClass(tree, 'macro-notice')), /部分数据待更新/);
  assert.doesNotMatch(text(tree), /部分指标暂不可用/);
  assert.match(text(byClass(tree, 'macro-data-stamp')[0]), /部分数据暂未更新，请稍后重试/);
  assert.equal(byClass(tree, 'macro-metric-row').length, MACRO_MOCK_SNAPSHOT.groups.rates.length - 1);
  assert.doesNotMatch(text(byClass(tree, 'macro-metric-name')), /实际收益率/);
  assert.equal(chart(tree).props['data-metric'], 'us10y');
});

test('live loading and failure are controlled by the wrapper and retry never restores demonstration data', () => {
  for (const state of ['loading', 'error', 'empty']) {
    for (const snapshot of [undefined, liveSnapshot()]) {
      let retries = 0;
      const props = { snapshot, fetchState: state, onRetry: () => { retries++; } };
      const h = harness(props);
      let tree = h.render();
      assert.equal(tree.props['data-macro-mode'], 'live');
      assert.equal(buttonText(tree, '刷新').props.disabled, state === 'loading');
      assert.equal(byClass(tree, 'macro-score-row').length, 0);
      assert.equal(byClass(tree, 'macro-core-card').length, 0);
      assert.doesNotMatch(text(tree), /模拟|演示|62\s*\/\s*100/);
      if (state !== 'loading') {
        tree = h.click(buttonText(tree, '重新读取'));
        assert.equal(retries, 1);
        assert.equal(tree.props['data-macro-state'], state);
        assert.equal(byClass(tree, 'macro-score-row').length, 0);
        props.snapshot = liveSnapshot();
        props.fetchState = 'ready';
        tree = h.render();
        assert.equal(tree.props['data-macro-state'], 'ready');
        assert.equal(byClass(tree, 'macro-score-row').length, 0);
        assert.equal(byClass(tree, 'macro-core-card').length, 4);
        tree = h.click(buttonText(tree, '刷新'));
        assert.equal(retries, 2);
        assert.equal(tree.props['data-macro-mode'], 'live');
      }
    }
  }
});

test('a failed or partial live calendar does not claim that no economic events exist', () => {
  for (const calendarStatus of ['unavailable', 'partial']) {
    const snapshot = liveSnapshot({ calendarStatus, calendarError: '日历服务暂不可用' });
    for (const page of ['overview', 'calendar']) {
      const h = harness({ initialPage: page, snapshot });
      let tree = h.render();
      assert.match(text(tree), calendarStatus === 'unavailable' ? /未能读取经济日历/ : /日历数据不完整/);
      assert.doesNotMatch(text(tree), /暂无符合条件|未来7天暂无|演示/);
      if (page === 'calendar') {
        tree = h.click(buttonText(tree, '近期发布'));
        assert.doesNotMatch(text(tree), /暂无符合条件/);
        assert.equal(calendarEvents(tree).length, 0);
      }
    }
  }
});

test('live calendar distinguishes a passed release time with missing actual from an actual zero', () => {
  const base = {
    code: 'CPI', name: '消费者价格指数 · 环比', time: '2026-09-21T12:30:00Z',
    importance: 'high', forecast: 0.2, previous: 0.1, unit: 'percent', simulated: false,
  };
  const snapshot = liveSnapshot({ events: [
    { ...base, id: 'awaiting', actual: null },
    { ...base, id: 'zero', actual: 0 },
  ] });
  const h = harness({ initialPage: 'calendar', snapshot });
  let tree = h.render();
  assert.equal(buttonText(tree, '已公布'), undefined, 'elapsed scheduled times are only recent releases until values arrive');
  tree = h.click(buttonText(tree, '近期发布'));
  const [awaiting, zero] = calendarEvents(tree);
  assert.equal(awaiting.props['data-release-state'], 'awaiting');
  assert.match(text(awaiting), /等待公布值.*公布值—/);
  assert.equal(byClass(awaiting, 'macro-surprise').length, 0);
  assert.equal(zero.props['data-release-state'], 'released');
  assert.match(text(zero), /公布值0%/);
  assert.doesNotMatch(text(zero), /等待公布值/);
  assert.match(text(byClass(zero, 'macro-surprise')[0]), /低于预期/);
  assert.equal(text(byClass(zero, 'macro-event-name')[0]), base.name,
    'the provider-specific monthly definition must not be replaced by a generic yearly label');
});

test('live overview and detail entries retain available parts of a module and select a valid representative', () => {
  const snapshot = liveSnapshot();
  for (const id of ['us10y', 'wti', 'vix', 'move', 'netLiquidity', 'tga']) snapshot.metrics[id] = { ...snapshot.metrics[id], value: null };
  delete snapshot.metrics.rbob;
  snapshot.metrics.us2y = { ...snapshot.metrics.us2y, value: 0, change1d: 0 };
  snapshot.sections.rates.label = '数据缺失';
  snapshot.sections.inflation.label = '数据缺失';
  let h = harness({ snapshot });
  let tree = h.render();
  const cards = byClass(tree, 'macro-core-card');
  assert.deepEqual(cards.map(card => text(byClass(card, 'macro-card-heading')[0])), ['利率', '通胀', '市场压力', '流动性']);
  assert.match(text(byClass(cards[0], 'macro-core-symbol')[0]), /美国2年期国债收益率/);
  assert.match(text(byClass(cards[0], 'macro-core-value')[0]), /^0\.00%/);
  assert.match(text(byClass(cards[1], 'macro-core-symbol')[0]), /布伦特原油/);
  assert.equal(text(byClass(cards[0], 'macro-tone')[0]), '数据已更新');
  assert.equal(text(byClass(cards[1], 'macro-tone')[0]), '数据已更新');
  assert.equal(byClass(tree, 'macro-summary-grid').length, 0);
  tree = h.click(cards[0]);
  assert.equal(chart(tree).props['data-metric'], 'us2y');
  assert.equal(text(byClass(tree, 'macro-hero-value')[0]), '0.00%');
  assert.equal(byClass(tree, 'macro-metric-row').length, 5);
  assert.doesNotMatch(text(byClass(tree, 'macro-metric-name')), /美国10年期国债收益率/);

  h = harness({ initialPage: 'inflation', snapshot });
  tree = h.render();
  assert.equal(chart(tree).props['data-metric'], 'brent');
  assert.equal(byClass(tree, 'macro-metric-row').length, 2);
  assert.doesNotMatch(text(tree), /WTI|RBOB/);
  tree = harness({ initialPage: 'stress', snapshot }).render();
  assert.equal(byClass(tree, 'macro-stress-item').length, 3);
  assert.doesNotMatch(text(byClass(tree, 'macro-stress-list')), /美股波动率指数（VIX）|美债波动率指数（MOVE）/);
  tree = harness({ initialPage: 'liquidity', snapshot }).render();
  assert.equal(byClass(tree, 'macro-liquidity-hero').length, 0);
  assert.equal(byClass(tree, 'macro-metric-row').length, 4);
  assert.doesNotMatch(text(byClass(tree, 'macro-metric-name')), /财政部一般账户/);
});

test('live inflation hides empty tabs and invalid selections fall back when data availability changes', () => {
  const snapshot = liveSnapshot();
  for (const id of [...snapshot.groups.energy, ...snapshot.groups.expectations]) snapshot.metrics[id] = { ...snapshot.metrics[id], value: null };
  const props = { initialPage: 'inflation', initialInflationTab: 'energy', snapshot };
  const h = harness(props);
  let tree = h.render();
  assert.deepEqual(nodes(tree, node => node.props.role === 'tab').map(text), ['美元 / 黄金']);
  assert.equal(chart(tree).props['data-metric'], 'dxy');
  tree = h.click(byClass(tree, 'macro-metric-row')[1]);
  assert.equal(chart(tree).props['data-metric'], 'gold');
  props.snapshot = { ...snapshot, metrics: { ...snapshot.metrics, gold: { ...snapshot.metrics.gold, value: null } } };
  tree = h.render();
  assert.equal(chart(tree).props['data-metric'], 'dxy');
  assert.equal(byClass(tree, 'macro-metric-row').length, 1);

  const rateProps = { initialPage: 'rates', snapshot: liveSnapshot() };
  const rateHarness = harness(rateProps);
  tree = rateHarness.click(byClass(rateHarness.render(), 'macro-metric-row')[1]);
  assert.equal(chart(tree).props['data-metric'], 'us5y');
  rateProps.snapshot = { ...rateProps.snapshot, metrics: { ...rateProps.snapshot.metrics, us5y: { ...rateProps.snapshot.metrics.us5y, value: null } } };
  tree = rateHarness.render();
  assert.equal(chart(tree).props['data-metric'], 'us10y');
});

test('wholly unavailable live groups remove only their own overview module and have safe empty detail pages', () => {
  const snapshot = liveSnapshot();
  for (const id of snapshot.groups.rates) snapshot.metrics[id] = { ...snapshot.metrics[id], value: null };
  let tree = harness({ snapshot }).render();
  assert.equal(byClass(tree, 'macro-rate-card').length, 0);
  assert.deepEqual(byClass(tree, 'macro-core-card').map(card => text(byClass(card, 'macro-card-heading')[0])), ['通胀', '市场压力', '流动性']);
  const empty = { ...snapshot, metrics: {}, groups: {} };
  for (const page of ['overview', 'rates', 'inflation', 'stress', 'liquidity']) {
    tree = harness({ initialPage: page, snapshot: empty }).render();
    assert.match(text(tree), /本页暂无可用数据/);
    assert.equal(chart(tree), undefined);
    assert.equal(byClass(tree, 'macro-core-card').length, 0);
    assert.equal(byClass(tree, 'macro-metric-row').length, 0);
    assert.doesNotMatch(text(tree), /部分指标暂不可用|NaN|undefined/);
  }
});
