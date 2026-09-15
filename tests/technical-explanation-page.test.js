import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';
import { lifecycleSignal } from './fixtures/stock-rsi-lifecycle.js';

const pageUrl = new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url);
const source = fs.readFileSync(pageUrl, 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const hooksUrl = dataUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots = [], cursor = 0;
export function reset(){slots=[];}
export function render(Component,props){cursor=0;return Component(props);}
function useState(initial){const i=cursor++;const slot=slots[i] ||= {value:typeof initial==='function'?initial():initial};return [slot.value,next=>{slot.value=typeof next==='function'?next(slot.value):next;}];}
function useRef(initial){return slots[cursor++] ||= {current:initial};}
function useMemo(fn,deps){const i=cursor++,old=slots[i];if(old&&deps&&deps.every((v,j)=>Object.is(v,old.deps[j])))return old.value;const value=fn();slots[i]={value,deps};return value;}
function useCallback(fn,deps){return useMemo(()=>fn,deps);}
function effect(){cursor++;}
export default {...React,useState,useRef,useMemo,useCallback,useEffect:effect,useLayoutEffect:effect};
`);
const transformed = await transformWithOxc(source, 'WatchlistStockDetailPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/import\s*["'][^"']+\.css["'];?/g, '')
  .replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => {
    if (specifier === 'react') return `from ${JSON.stringify(hooksUrl)}`;
    if (specifier.endsWith('.jsx')) {
      const name = specifier.split('/').at(-1).replace('.jsx', '');
      return `from ${JSON.stringify(dataUrl(`export default function ${name}(){return null;} export function stockLogoCandidates(){return [];}`))}`;
    }
    return `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`;
  });
const hooks = await import(hooksUrl);
const { default: Page } = await import(dataUrl(compiled));
const nodes = (node, predicate) => !React.isValidElement(node) ? [] : [
  ...(predicate(node) ? [node] : []),
  ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate)),
];
const dates = ['2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14'];
const history = dates.map(date => ({ date, close: 120, ma30: 110, ma60: 100, ma200: 90 }));
function harness(range = '6m') {
  hooks.reset();
  const ctx = { language: 'zh', watchlistStockDetailSymbol: 'SNOW', stockDetailInitialRange: range,
    watchlistStockDetailDataOverride: { stockDetail: { history, currency: 'USD', asOfDate: dates.at(-1),
      stockRsi: lifecycleSignal('NONE', { asOf: dates.at(-1), value: 52.7 }), indicators: { ma200: 90 } } } };
  return () => hooks.render(Page, { ctx });
}
const chart = tree => nodes(tree, n => n.type?.name === 'PriceChart')[0];
const sheet = tree => nodes(tree, n => n.type?.name === 'TechnicalExplanationSheet')[0];
const trigger = (tree, type) => nodes(tree, n => n.props['data-technical-explanation-trigger'] === type)[0];

test('all three full metric regions open one explanation sheet without changing their displayed metrics', () => {
  const render = harness();
  const initial = render();
  assert.equal(nodes(initial, n => n.props['data-technical-explanation-trigger']).length, 3);
  for (const type of ['rsi', 'maStructure', 'trendChange']) {
    const target = trigger(render(), type);
    assert.equal(target.type, 'div');
    assert.equal(target.props.role, 'button');
    assert.equal(target.props.tabIndex, 0);
    assert.equal(target.props['aria-haspopup'], 'dialog');
    assert.ok(React.Children.count(target.props.children) >= 2, 'hit area contains the title and the metric value');
    target.props.onClick();
    const opened = render();
    assert.equal(sheet(opened).props.ticker, 'SNOW');
    assert.ok(sheet(opened).props.explanation.why.length);
    assert.equal(trigger(opened, type).props['aria-expanded'], true);
    assert.equal(chart(opened).props.rows, chart(initial).props.rows);
    sheet(opened).props.onClose();
    assert.equal(sheet(render()), undefined);
  }
});

test('opening and closing every sheet preserves all five selected chart periods and chart identity', () => {
  const render = harness();
  for (const [index, range] of ['1m', '3m', '6m', '1y', '5y'].entries()) {
    const buttons = nodes(render(), n => n.type === 'button' && n.props.className === 'stock-report-range');
    buttons[index].props.onClick();
    const selected = render();
    assert.equal(chart(selected).props.range, range);
    for (const type of ['rsi', 'maStructure', 'trendChange']) {
      trigger(render(), type).props.onClick();
      const opened = render();
      assert.equal(chart(opened).type, chart(selected).type);
      assert.equal(chart(opened).key, chart(selected).key, 'sheet state does not remount the chart or reset its pan/zoom state');
      assert.equal(chart(opened).props.range, range);
      assert.equal(chart(opened).props.rows, chart(selected).props.rows);
      sheet(opened).props.onClose();
      assert.equal(chart(render()).props.range, range);
      assert.equal(chart(render()).props.rows, chart(selected).props.rows);
    }
  }
});

test('metric keyboard activation supports Enter and Space but does not respond to unrelated keys', () => {
  const render = harness();
  for (const key of ['Enter', ' ']) {
    const target = trigger(render(), 'rsi');
    let prevented = false;
    target.props.onKeyDown({ key, target, currentTarget: target, preventDefault(){prevented=true;} });
    assert.equal(prevented, true);
    assert.ok(sheet(render()));
    sheet(render()).props.onClose();
  }
  const target = trigger(render(), 'rsi');
  target.props.onKeyDown({key:'ArrowRight',target,currentTarget:target,preventDefault(){assert.fail('not an activation key');}});
  assert.equal(sheet(render()), undefined);
});

test('explanation integration does not add requests or place risk scores on the main metric', () => {
  assert.equal((source.match(/\/api\/quote\?symbols=/g) || []).length, 1);
  const metric = source.slice(source.indexOf('<div className="stock-report-rsi-metric"'), source.indexOf('<div className="stock-report-ma-heading"'));
  assert.doesNotMatch(metric, /divergenceRiskScore|riskScore|riskLevel|风险评分|低风险|高风险/);
  assert.doesNotMatch(source, /alert\(|TechnicalExplanationPage|setRange\([^)]*explanation/);
});

test('the actual chart outside-click handler preserves a selected point for explanation interactions', () => {
  const body = source.match(/const closeOutside = \(event\) => \{([\s\S]*?)\n    \};/)?.[1];
  assert.ok(body, 'test uses the page chart listener itself');
  const cleared = [];
  const chartTarget = {};
  const handler = new Function('chartRef', 'setSelectedIndex', `return event => {${body}}`)(
    { current: { contains: target => target === chartTarget } }, value => cleared.push(value));
  for (const region of ['[data-technical-explanation-trigger]', '.tes-overlay']) {
    handler({ target: { closest: selector => selector.split(', ').includes(region) ? {} : null } });
  }
  handler({ target: chartTarget });
  assert.deepEqual(cleared, [], 'opening, reading and closing an explanation leave the point selected');
  handler({ target: { closest: () => null } });
  assert.deepEqual(cleared, [null], 'ordinary outside clicks still close the chart tooltip');
});
