import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/ReviewPostBody.jsx', import.meta.url), 'utf8');
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const findClass = (tree, name) => walk(tree).find(node => node.props.className?.split(' ').includes(name));
const toggle = tree => walk(tree).find(node => node.type === 'button');
let nextFixture = 0;
async function harness() {
  const slots = [], observers = [], listeners = new Map();
  const metrics = { height: 440, budget: 650, lineHeight: 22 };
  const content = { get scrollHeight() { return metrics.height; } };
  const ruler = { getBoundingClientRect: () => ({ height: metrics.budget }) };
  let cursor = 0, effects = [];
  const fixture = {
    React: { ...React,
      useRef(initial) { const id = cursor++; return slots[id] ||= { current: initial }; },
      useState(initial) { const id = cursor++; const slot = slots[id] ||= { value: initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; },
      useLayoutEffect(effect, deps) { const id = cursor++, previous = slots[id]; if (previous && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return; previous?.cleanup?.(); const slot = slots[id] = { deps }; effects.push(() => { slot.cleanup = effect(); }); },
    },
    StockText: () => null,
    window: {
      getComputedStyle: () => ({ lineHeight: `${metrics.lineHeight}px` }),
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
      ResizeObserver: class { constructor(callback) { this.callback = callback; this.nodes = []; observers.push(this); } observe(node) { this.nodes.push(node); } disconnect() { this.disconnected = true; } },
    },
  };
  const key = `__reviewPostBody${++nextFixture}`;
  globalThis[key] = fixture;
  let Component;
  try {
    const transformed = await transformWithOxc(`const { React, window, StockText: ReviewStockText } = globalThis[${JSON.stringify(key)}];\n${source.replace(/^import .*;\n/gm, '')}`, 'ReviewPostBodyTest.jsx', { jsx: { runtime: 'classic' } });
    Component = (await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  return {
    metrics, observers, listeners, StockText: fixture.StockText,
    render(props) {
      let tree;
      for (let pass = 0; pass < 2; pass++) {
        cursor = 0; effects = []; tree = Component(props);
        findClass(tree, 'rj-post-text').ref.current = content;
        const budget = findClass(tree, 'rj-post-body-budget'); if (budget) budget.ref.current = ruler;
        effects.forEach(effect => effect());
      }
      return tree;
    },
    cleanup() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('long character counts remain fully visible when their rendered body fits one screen', async () => {
  const h = await harness(), candidates = ['NVDA'], select = () => {};
  const tree = h.render({ text: '文字'.repeat(300), candidates, onSelectSymbol: select });
  assert.equal(toggle(tree), undefined);
  assert.equal(findClass(tree, 'rj-post-body-window').props.style.maxHeight, '638px');
  const stockText = walk(tree).find(node => node.type === h.StockText);
  assert.equal(stockText.props.candidates, candidates); assert.equal(stockText.props.onSelectSymbol, select);
  assert.equal(stockText.props.text.length, 600);
  h.cleanup();
});

test('actual overflow collapses at a whole line and retains the collapse control after expansion', async () => {
  const h = await harness(); h.metrics.height = 990;
  let expanded = false, toggles = 0, stopped = false;
  const input = () => ({ text: '短句\n'.repeat(45), expanded, onToggle: () => { expanded = !expanded; toggles++; } });
  let tree = h.render(input());
  assert.equal(toggle(tree).props.children, '展开全文');
  assert.equal(toggle(tree).props['aria-expanded'], false);
  assert.equal(parseFloat(findClass(tree, 'rj-post-body-window').props.style.maxHeight) % h.metrics.lineHeight, 0);
  toggle(tree).props.onClick({ stopPropagation() { stopped = true; } }); tree = h.render(input());
  assert.equal(toggles, 1); assert.equal(stopped, true);
  assert.equal(findClass(tree, 'rj-post-body-collapsed'), undefined);
  assert.equal(toggle(tree).props.children, '收起');
  toggle(tree).props.onClick({ stopPropagation() {} }); tree = h.render(input());
  assert.equal(toggle(tree).props.children, '展开全文');
  assert.ok(findClass(tree, 'rj-post-body-collapsed'));
  h.cleanup();
});

test('reflow, viewport and font changes recalculate real overflow and clean up observers', async () => {
  const h = await harness(), props = { text: '正文', expanded: false };
  let tree = h.render(props); assert.equal(toggle(tree), undefined);
  h.metrics.height = 760; h.observers[0].callback(); tree = h.render(props);
  assert.equal(toggle(tree).props.children, '展开全文');
  h.metrics.budget = 400; h.metrics.lineHeight = 28; h.listeners.get('resize')(); tree = h.render(props);
  assert.equal(findClass(tree, 'rj-post-body-window').props.style.maxHeight, '392px');
  h.metrics.height = 280; h.observers[0].callback(); tree = h.render(props);
  assert.equal(toggle(tree), undefined);
  h.cleanup(); assert.equal(h.observers[0].disconnected, true); assert.equal(h.listeners.size, 0);
});

test('full detail always exposes the complete body without a screen budget or toggle', async () => {
  const h = await harness(); h.metrics.height = 3000;
  const tree = h.render({ text: '正文', full: true, language: 'en' });
  assert.equal(findClass(tree, 'rj-post-body-collapsed'), undefined);
  assert.equal(findClass(tree, 'rj-post-body-budget'), undefined);
  assert.equal(toggle(tree), undefined); assert.equal(h.observers.length, 0);
  h.cleanup();
});
