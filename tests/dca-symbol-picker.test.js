import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { DCA_SYMBOLS } from '../src/lib/dcaLabModel.js';

const source = readFileSync(new URL('../src/components/DcaSymbolPicker.jsx', import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transformed = await transformWithOxc(source, 'DcaSymbolPicker.jsx', { jsx: { runtime: 'classic' } });
function compile(reactUrl) {
  const imports = new Map([
    ['react', reactUrl], ['lucide-react', import.meta.resolve('lucide-react')],
    ['../lib/dcaLabModel.js', new URL('../src/lib/dcaLabModel.js', import.meta.url).href],
  ]);
  return dataUrl(transformed.code.replace(/from (["'])([^"']+)\1/g, (match, _quote, path) => imports.has(path) ? `from ${JSON.stringify(imports.get(path))}` : match));
}
const { default: DcaSymbolPicker } = await import(compile(import.meta.resolve('react')));

// A deterministic component hook host lets these tests exercise the production
// handlers and effect cleanup without changing browser state or loading prices.
const hooksUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0, pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; pending = []; }
  export function render(Component, props) { cursor = 0; return Component(props); }
  export function flush() { const effects = pending; pending = []; effects.forEach(effect => effect()); }
  function useState(initial) { const index = cursor++; const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
  function useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; }
  function useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) { const previous = slots[index], slot = { deps }; slots[index] = slot; pending.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); }); } }
  export default { ...React, useState, useRef, useEffect, useId: () => 'dca-picker-test' };
`);
const hooks = await import(hooksUrl);
const { default: InteractivePicker } = await import(compile(hooksUrl));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.Children.toArray(node.props?.children).map(text).join(' ');
}
const byClass = (tree, name) => nodes(tree, node => node.props.className === name)[0];
const options = tree => nodes(tree, node => node.props.role === 'option');

function harness(value = 'QQQ') {
  hooks.reset();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const listeners = new Map(), actions = [], changes = [];
  const doc = { activeElement: null,
    addEventListener(type, callback) { assert.equal(listeners.has(type), false); listeners.set(type, callback); },
    removeEventListener(type, callback) { assert.equal(listeners.get(type), callback); listeners.delete(type); },
  };
  const target = name => ({ name, focus(config) { actions.push({ name, config }); doc.activeElement = this; } });
  const trigger = target('trigger');
  const choices = DCA_SYMBOLS.map(item => target(item.symbol));
  const root = { contains: node => node === root || node === trigger || choices.includes(node) };
  const props = { value, onChange: symbol => changes.push(symbol) };
  const menu = { querySelector: () => choices.find(item => item.name === props.value), querySelectorAll: () => choices };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  function render() {
    const tree = hooks.render(InteractivePicker, props);
    tree.ref.current = root;
    byClass(tree, 'dl-symbol-trigger').ref.current = trigger;
    const menuElement = byClass(tree, 'dl-symbol-menu');
    if (menuElement) menuElement.ref.current = menu;
    hooks.flush();
    return tree;
  }
  function key(keyValue) {
    let prevented = 0, stopped = 0;
    render().props.onKeyDown({ key: keyValue, preventDefault: () => prevented++, stopPropagation: () => stopped++ });
    return { prevented, stopped };
  }
  const open = () => { byClass(render(), 'dl-symbol-trigger').props.onClick(); return render(); };
  function restore() {
    try { hooks.reset(); assert.equal(listeners.size, 0); }
    finally { if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document; }
  }
  return { render, open, key, restore, doc, listeners, actions, changes, trigger, choices, root, props };
}

test('the collapsed symbol field is an accessible custom trigger, not a native select', () => {
  const html = renderToStaticMarkup(React.createElement(DcaSymbolPicker, { value: 'QQQ', onChange() {} }));
  assert.match(html, /aria-label="投资标的：QQQ，纳斯达克 100 ETF"/);
  assert.match(html, /aria-haspopup="listbox" aria-expanded="false"/);
  assert.doesNotMatch(html, /<select|<option|role="listbox"|role="option"/);
});

test('opening shows all eleven presets grouped as three ETFs and eight stocks with one selected option', () => {
  const h = harness('NVDA');
  try {
    const tree = h.open();
    const groups = nodes(tree, node => node.props.role === 'group');
    assert.deepEqual(groups.map(node => node.props['aria-label']), ['指数 ETF', '美股']);
    assert.deepEqual(groups.map(group => options(group).length), [3, 8]);
    const symbols = options(tree).map(option => nodes(option, node => node.type === 'strong')[0].props.children);
    assert.deepEqual(symbols, DCA_SYMBOLS.map(item => item.symbol));
    assert.equal(symbols.at(-1), 'AVGO');
    assert.equal(options(tree).filter(option => option.props['aria-selected']).length, 1);
    assert.match(text(options(tree).find(option => option.props['aria-selected'])), /NVDA.*英伟达/);
    assert.ok(options(tree).every(option => option.props.type === 'button' && option.props.tabIndex === -1));
    assert.equal(h.doc.activeElement.name, 'NVDA');
    assert.deepEqual(h.actions.at(-1).config, { preventScroll: true });
    const trigger = byClass(tree, 'dl-symbol-trigger');
    assert.equal(trigger.props['aria-expanded'], true);
    assert.equal(trigger.props['aria-controls'], byClass(tree, 'dl-symbol-menu').props.id);
    assert.deepEqual(h.changes, []);
  } finally { h.restore(); }
});

test('choosing a different symbol sends exactly one change; selecting the current symbol only closes', () => {
  const h = harness();
  try {
    let tree = h.open();
    options(tree).find(option => text(option).includes('NVDA')).props.onClick();
    assert.deepEqual(h.changes, ['NVDA']);
    assert.equal(options(h.render()).length, 0);
    assert.equal(h.doc.activeElement, h.trigger);
    assert.deepEqual(h.actions.at(-1).config, { preventScroll: true });
    h.props.value = 'NVDA';
    tree = h.open();
    options(tree).find(option => text(option).includes('NVDA')).props.onClick();
    assert.deepEqual(h.changes, ['NVDA'], 'the same selection cannot trigger an extra historical-data request');
    assert.equal(options(h.render()).length, 0);
    h.open();
    byClass(h.render(), 'dl-symbol-trigger').props.onClick();
    assert.equal(options(h.render()).length, 0);
    assert.deepEqual(h.changes, ['NVDA'], 'toggling the menu is not a plan change');
  } finally { h.restore(); }
});

test('keyboard opening, arrow navigation, Home, End and Escape preserve the selection until explicitly chosen', () => {
  const h = harness('SPY');
  try {
    assert.equal(h.key('ArrowDown').prevented, 1);
    assert.equal(options(h.render()).length, 11);
    assert.equal(h.doc.activeElement.name, 'SPY');
    h.key('ArrowDown'); assert.equal(h.doc.activeElement.name, 'TQQQ');
    h.key('ArrowRight'); assert.equal(h.doc.activeElement.name, 'AAPL');
    h.key('ArrowLeft'); assert.equal(h.doc.activeElement.name, 'TQQQ');
    h.key('Home'); assert.equal(h.doc.activeElement.name, 'QQQ');
    h.key('ArrowUp'); assert.equal(h.doc.activeElement.name, 'AVGO');
    h.key('ArrowDown'); assert.equal(h.doc.activeElement.name, 'QQQ');
    h.key('End'); assert.equal(h.doc.activeElement.name, 'AVGO');
    const escape = h.key('Escape');
    assert.deepEqual(escape, { prevented: 1, stopped: 1 });
    assert.equal(options(h.render()).length, 0);
    assert.equal(h.doc.activeElement, h.trigger);
    assert.equal(h.listeners.size, 0);
    assert.deepEqual(h.changes, []);
    assert.equal(h.key('Tab').prevented, 0, 'ordinary tab navigation is not trapped');
  } finally { h.restore(); }
});

test('outside pointer and focus departure dismiss without committing or stealing external focus; handlers clean up', () => {
  const h = harness();
  try {
    h.open();
    h.listeners.get('pointerdown')({ target: h.choices[0] });
    assert.equal(options(h.render()).length, 11);
    const outside = {};
    h.doc.activeElement = outside;
    h.listeners.get('pointerdown')({ target: outside });
    assert.equal(options(h.render()).length, 0);
    assert.equal(h.doc.activeElement, outside);
    assert.equal(h.listeners.size, 0);
    h.open();
    h.render().props.onBlur({ currentTarget: h.root, relatedTarget: h.choices[1] });
    assert.equal(options(h.render()).length, 11);
    h.render().props.onBlur({ currentTarget: h.root, relatedTarget: outside });
    assert.equal(options(h.render()).length, 0);
    assert.equal(h.listeners.size, 0);
    assert.deepEqual(h.changes, []);
    h.open();
    assert.equal(h.listeners.size, 1, 'unmount must also remove the active outside listener');
  } finally { h.restore(); }
});

test('the picker owns presentation only and cannot change prices, persistence or global scroll styles', () => {
  assert.doesNotMatch(source, /<select\b|<option\b|\b(?:fetch|loadDcaHistory|buildDcaModel)\s*\(|localStorage|sessionStorage|supabase|stock_trades/);
  assert.doesNotMatch(source, /document\.(?:body|documentElement)|visualViewport|scrollTo\(|touchmove|touchstart|createPortal/);
  assert.match(source, /if \(symbol !== value\) onChange\(symbol\)/);
  assert.match(source, /document\.removeEventListener\('pointerdown', outside\)/);
});
