import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { DRAWDOWN_PREVIEW, deriveObservation, getSamePeriodReturn, selectObservationRows } from '../src/dev/drawdownObservationData.js';

const source = readFileSync(new URL('../src/components/DrawdownObservation.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'DrawdownObservationPreview.jsx', { jsx: { runtime: 'classic' } });
const icons = Object.fromEntries(['ArrowDownUp', 'ArrowLeft', 'ArrowUpRight', 'ChevronRight', 'Info', 'RotateCcw'].map(name => [name, function Icon() { return null; }]));
const bindings = { ...icons, DRAWDOWN_PREVIEW, deriveObservation, getSamePeriodReturn, selectObservationRows };
const compiled = transformed.code.replace(/^import\s[^\n]+;?\n/gm, '').replaceAll('export default function ', 'function ').replaceAll('export function ', 'function ');
const createComponents = new Function('React', 'window', 'document', 'ResizeObserver', ...Object.keys(bindings), `"use strict";\n${compiled}\nreturn { DrawdownObservationPreview: DrawdownObservation, DrawdownObservationChart, DrawdownObservationDetail };`);
const observations = DRAWDOWN_PREVIEW.instruments.map(row => deriveObservation(row, DRAWDOWN_PREVIEW.asOfDate));
const nvda = observations.find(row => row.symbol === 'NVDA');

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
const byClass = (tree, name) => nodes(tree, node => node.props.className?.split(' ').includes(name));
const button = (tree, label) => nodes(tree, node => node.type === 'button' && textContent(node) === label)[0];
const symbols = tree => byClass(tree, 'do-stock-symbol').map(textContent);

// Only hook storage and browser surfaces are supplied. The compiled components,
// data helpers and event/effect closures below execute their actual source.
function harness(name, getProps) {
  const slots = [];
  const listeners = new Set();
  const listenerEvents = [];
  const observers = [];
  const captures = new Set();
  const scrolls = [];
  const windowListeners = new Set();
  let cursor = 0;
  let pending = [];
  let dirty = false;
  let tree;
  const window = {
    scrollY: 0, scrollTo(value) { scrolls.push(value); this.scrollY = value.top; },
    addEventListener(type, listener) { assert.equal(type, 'scroll'); windowListeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'scroll'); windowListeners.delete(listener); },
  };
  const document = {
    addEventListener(type, listener, capture) { listenerEvents.push({ action: 'add', type, listener, capture }); listeners.add(listener); },
    removeEventListener(type, listener, capture) { listenerEvents.push({ action: 'remove', type, listener, capture }); listeners.delete(listener); },
  };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  }
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        dirty ||= !Object.is(value, slots[index].value);
        slots[index].value = value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useId() { return `:drawdown-${cursor++}:`; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !dependencies || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))) {
        pending.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() }; });
      }
    },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const components = createComponents(hooks, window, document, ResizeObserver, ...Object.values(bindings));
  const surface = {
    getBoundingClientRect: () => ({ left: 20, width: 360 }),
    contains: target => target?.insideInspection === true,
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
  };
  const result = {
    components, window, scrolls, observers, captures, listeners, listenerEvents, windowListeners,
    get tree() { return tree; },
    render() {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        cursor = 0; dirty = false;
        tree = components[name]({ observations, demo: true, ...getProps() });
        for (const node of nodes(tree, node => typeof node.type === 'string' && node.ref)) node.ref.current = surface;
        const effects = pending; pending = [];
        effects.forEach(effect => effect());
        if (!dirty) return tree;
      }
      assert.fail('effects failed to settle');
    },
    click(label) { const target = button(tree, label); assert.ok(target, `missing button: ${label}`); target.props.onClick(); this.render(); },
    key(key) { let prevented = false; tree.props.onKeyDown({ key, preventDefault() { prevented = true; } }); this.render(); return prevented; },
    pointer(phase, values = {}) {
      let prevented = false;
      tree.props[`onPointer${phase}`]({ pointerId: 1, button: 0, isPrimary: true, clientX: 200, clientY: 100, currentTarget: surface, preventDefault() { prevented = true; }, ...values });
      this.render();
      return prevented;
    },
    outside(target) { [...listeners].forEach(listener => listener({ target })); this.render(); },
    scroll(top) { window.scrollY = top; [...windowListeners].forEach(listener => listener()); this.render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  result.render();
  return result;
}

test('overview scope, depth and ordering controls render the selected real fixture rows', () => {
  const page = harness('DrawdownObservationPreview', () => ({ onBack() {} }));
  const expectRows = (scope, minDepth, order) => {
    assert.deepEqual(symbols(page.tree), selectObservationRows(observations, { scope, minDepth, order }).map(row => row.symbol));
    assert.equal(button(page.tree, scope === 'holdings' ? '持仓' : '自选').props['aria-pressed'], true);
    assert.equal(button(page.tree, minDepth ? `≥${minDepth}%` : '全部').props['aria-pressed'], true);
  };
  expectRows('watchlist', 0, 'deepest');
  page.click('≥20%');
  assert.deepEqual(symbols(page.tree), ['TSLA', 'NVDA', 'AVGO']);
  page.click('持仓');
  expectRows('holdings', 20, 'deepest');
  page.click('深 → 浅');
  expectRows('holdings', 20, 'shallowest');
  page.click('≥10%');
  expectRows('holdings', 10, 'shallowest');
  page.click('自选');
  expectRows('watchlist', 10, 'shallowest');
  page.unmount();
});

test('detail entry and return preserve overview filters and scroll without invoking the external home callback', () => {
  const calls = [];
  const page = harness('DrawdownObservationPreview', () => ({ onBack: () => calls.push('home') }));
  page.click('持仓');
  page.click('≥20%');
  page.click('深 → 浅');
  const before = symbols(page.tree);
  page.window.scrollY = 412;
  byClass(page.tree, 'do-stock-row')[0].props.onClick();
  page.render();
  assert.equal(page.tree.type, page.components.DrawdownObservationDetail);
  assert.equal(page.tree.props.row.symbol, before[0]);
  assert.deepEqual(page.scrolls, [{ top: 0, behavior: 'instant' }]);
  page.tree.props.onBack();
  page.render();
  assert.equal(page.tree.props['data-drawdown-view'], 'overview');
  assert.deepEqual(symbols(page.tree), before);
  assert.equal(button(page.tree, '持仓').props['aria-pressed'], true);
  assert.equal(button(page.tree, '≥20%').props['aria-pressed'], true);
  assert.ok(button(page.tree, '浅 → 深'));
  assert.equal(page.window.scrollY, 412);
  assert.deepEqual(calls, []);
  const header = nodes(page.tree, node => typeof node.type === 'function' && node.type.name === 'PreviewHeader')[0];
  const headerTree = header.type(header.props);
  const home = nodes(headerTree, node => node.type === 'button' && node.props['aria-label'] === '返回首页')[0];
  home.props.onClick();
  assert.deepEqual(calls, ['home']);
  page.unmount();
});

test('the actual chart keyboard handler selects and clamps real dates while Escape restores latest', () => {
  let selectedIndex = null;
  const chart = harness('DrawdownObservationChart', () => ({ row: nvda, selectedIndex, onSelect: value => { selectedIndex = value; } }));
  const last = nvda.pointsSinceHigh.length - 1;
  assert.equal(chart.tree.props.role, 'slider');
  assert.equal(chart.tree.props['aria-valuenow'], last);
  for (const [key, expected] of [['ArrowLeft', last - 1], ['Home', 0], ['ArrowLeft', 0], ['ArrowRight', 1], ['End', last], ['ArrowRight', last]]) {
    assert.equal(chart.key(key), true);
    assert.equal(selectedIndex, expected);
    assert.equal(chart.tree.props['aria-valuenow'], expected);
    assert.ok(chart.tree.props['aria-valuetext'].includes(nvda.pointsSinceHigh[expected].date));
  }
  assert.equal(chart.key('Tab'), false);
  assert.equal(chart.key('Escape'), true);
  assert.equal(selectedIndex, null);
  assert.equal(byClass(chart.tree, 'do-chart-guide').length, 0);
  assert.equal(chart.tree.props['aria-valuenow'], last);
  assert.equal(chart.observers.length, 1);
  chart.unmount();
  assert.equal(chart.observers[0].disconnected, true);
});

test('chart horizontal dragging selects dates while a vertical gesture leaves native scrolling and selection alone', () => {
  let selectedIndex = null;
  const selections = [];
  const chart = harness('DrawdownObservationChart', () => ({ row: nvda, selectedIndex, onSelect: value => { selections.push(value); selectedIndex = value; } }));
  assert.equal(chart.pointer('Down'), false);
  assert.equal(chart.pointer('Move', { clientX: 205, clientY: 103 }), false);
  assert.deepEqual(selections, []);
  assert.equal(chart.pointer('Move', { clientX: 370, clientY: 104 }), true);
  assert.equal(selectedIndex, nvda.pointsSinceHigh.length - 1);
  assert.ok(chart.captures.has(1));
  assert.equal(chart.pointer('Move', { clientX: 58, clientY: 110 }), true);
  assert.equal(selectedIndex, 0);
  chart.pointer('Up', { clientX: 58, clientY: 110 });
  assert.equal(chart.captures.size, 0);
  const previousCalls = selections.length;
  chart.pointer('Down');
  assert.equal(chart.pointer('Move', { clientX: 202, clientY: 120 }), false);
  assert.equal(chart.pointer('Move', { clientX: 370, clientY: 122 }), false);
  chart.pointer('Up', { clientX: 370, clientY: 122 });
  assert.equal(selections.length, previousCalls);
  assert.equal(selectedIndex, 0);
  assert.equal(chart.captures.size, 0);
  chart.unmount();
});

test('detail outside clicks restore the latest readout and remove the exact capture listener on reset or unmount', () => {
  const detail = harness('DrawdownObservationDetail', () => ({ row: nvda, onBack() {} }));
  const chartNode = () => nodes(detail.tree, node => node.type === detail.components.DrawdownObservationChart)[0];
  assert.equal(detail.listeners.size, 0);
  chartNode().props.onSelect(1);
  detail.render();
  assert.equal(chartNode().props.selectedIndex, 1);
  assert.equal(detail.listeners.size, 1);
  assert.ok(textContent(byClass(detail.tree, 'do-readout')[0]).includes(nvda.pointsSinceHigh[1].date));
  detail.outside({ insideInspection: true });
  assert.equal(chartNode().props.selectedIndex, 1);
  detail.outside({ insideInspection: false });
  assert.equal(chartNode().props.selectedIndex, null);
  assert.equal(detail.listeners.size, 0);
  assert.ok(textContent(byClass(detail.tree, 'do-readout')[0]).includes(nvda.pointsSinceHigh.at(-1).date));
  chartNode().props.onSelect(2);
  detail.render();
  detail.click('回到最新');
  assert.equal(chartNode().props.selectedIndex, null);
  assert.equal(detail.listeners.size, 0);
  chartNode().props.onSelect(3);
  detail.render();
  assert.equal(detail.listeners.size, 1);
  detail.unmount();
  assert.equal(detail.listeners.size, 0);
  const added = detail.listenerEvents.filter(event => event.action === 'add');
  const removed = detail.listenerEvents.filter(event => event.action === 'remove');
  assert.equal(added.length, 3);
  assert.equal(removed.length, 3);
  for (const event of added) {
    assert.equal(event.type, 'pointerdown');
    assert.equal(event.capture, true);
    assert.ok(removed.some(item => item.listener === event.listener && item.type === event.type && item.capture === event.capture));
  }
});

test('overview restores cached filters and scroll, preserving overview position through detail and unmount', () => {
  let saved = { scope: 'holdings', minDepth: 20, order: 'shallowest', scrollTop: 412 };
  const changed = next => { saved = next; };
  const page = harness('DrawdownObservationPreview', () => ({ initialViewState: saved, onViewStateChange: changed }));
  assert.deepEqual(symbols(page.tree), ['AVGO', 'NVDA']);
  assert.equal(page.window.scrollY, 412);
  page.scroll(599);
  assert.equal(saved.scrollTop, 599);
  byClass(page.tree, 'do-stock-row')[0].props.onClick();
  page.render();
  page.scroll(0);
  assert.equal(saved.scrollTop, 599, 'scrolling the detail cannot overwrite overview state');
  page.tree.props.onBack();
  page.render();
  assert.equal(page.window.scrollY, 599);
  page.unmount();
  assert.equal(page.windowListeners.size, 0);
  const reopened = harness('DrawdownObservationPreview', () => ({ initialViewState: saved, onViewStateChange: changed }));
  assert.equal(reopened.window.scrollY, 599);
  assert.deepEqual(symbols(reopened.tree), ['AVGO', 'NVDA']);
  reopened.unmount();
});

test('background refresh keeps actual rows and marks updating without a first-load placeholder', () => {
  const page = harness('DrawdownObservationPreview', () => ({ refreshing: true, loading: false }));
  assert.deepEqual(symbols(page.tree), selectObservationRows(observations).map(row => row.symbol));
  assert.match(textContent(page.tree), /后台更新中/);
  assert.doesNotMatch(textContent(page.tree), /正在读取真实历史行情/);
  page.unmount();
});

test('removing the inspected symbol returns to the current overview without retaining its old detail', () => {
  let current = observations;
  const page = harness('DrawdownObservationPreview', () => ({ observations: current }));
  const symbol = byClass(page.tree, 'do-stock-row')[0].props['aria-label'].split(' ')[1];
  byClass(page.tree, 'do-stock-row')[0].props.onClick();
  page.render();
  assert.equal(page.tree.props.row.symbol, symbol);
  current = observations.filter(item => item.symbol !== symbol);
  page.render();
  assert.equal(page.tree.props['data-drawdown-view'], 'overview');
  assert.ok(!symbols(page.tree).includes(symbol));
  page.unmount();
});
