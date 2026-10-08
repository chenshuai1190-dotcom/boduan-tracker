import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { DCA_SYMBOLS } from '../src/lib/dcaLabModel.js';

const componentUrl = name => new URL(`../src/components/${name}.jsx`, import.meta.url);
const source = readFileSync(componentUrl('DcaSymbolPicker'), 'utf8');
const pickerSource = readFileSync(componentUrl('InvestmentSymbolPicker'), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function compile(name, replacements = {}) {
  const url = componentUrl(name);
  const input = readFileSync(url, 'utf8').replace(/import\s*['"][^'"]+\.css['"];?/g, '');
  const transformed = await transformWithOxc(input, `${name}.jsx`, { jsx: { runtime: 'classic' } });
  return dataUrl(transformed.code.replace(/from (["'])([^"']+)\1/g, (_match, _quote, path) =>
    `from ${JSON.stringify(replacements[path] || (path.startsWith('.') ? new URL(path, url).href : import.meta.resolve(path)))}`));
}

// Exercise the production handlers and effect cleanup with deterministic hooks
// and browser primitives, without live requests or changing browser state.
const hooksUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0, pending = [], writes = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; pending = []; writes = 0; }
  export function unmount() { for (const slot of slots) slot?.cleanup?.(); slots = []; pending = []; }
  export function stateWrites() { return writes; }
  export function render(Component, props) { cursor = 0; return Component(props); }
  export function flush() { const effects = pending; pending = []; effects.forEach(effect => effect()); }
  function useState(initial) { const index = cursor++; const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { writes++; slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
  function useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; }
  function useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) { const previous = slots[index], slot = { deps }; slots[index] = slot; pending.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); }); } }
  export default { ...React, useState, useRef, useEffect };
`);
const hooks = await import(hooksUrl);
const portalUrl = dataUrl('export const portals = []; export const createPortal = (node, target) => { portals.push(target); return node; };');
const { portals } = await import(portalUrl);
const presetsUrl = await compile('InvestmentSymbolPresets');
const { default: Presets } = await import(presetsUrl);
const pickerUrl = await compile('InvestmentSymbolPicker', { react: hooksUrl, 'react-dom': portalUrl, './InvestmentSymbolPresets.jsx': presetsUrl });
const { default: SharedPicker } = await import(pickerUrl);
const wrapperUrl = await compile('DcaSymbolPicker', { react: hooksUrl, './InvestmentSymbolPicker.jsx': pickerUrl });
const { default: InteractiveDcaPicker } = await import(wrapperUrl);
const ssrWrapperUrl = await compile('DcaSymbolPicker', { './InvestmentSymbolPicker.jsx': pickerUrl });
const { default: DcaSymbolPicker } = await import(ssrWrapperUrl);

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
const resultButtons = tree => nodes(tree, node => node.props.className === 'ic-result');
const buttonSymbol = node => nodes(node, item => item.type === 'strong')[0]?.props.children;
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const instrument = symbol => ({ symbol, name: `${symbol} test instrument`, type: 'ETF' });

function wrapperHarness(overrides = {}) {
  hooks.reset();
  const changes = [];
  const props = { value: 'QQQ', userId: 'user-one', searchSource() {}, onChange: symbol => changes.push(symbol), ...overrides };
  const render = () => hooks.render(InteractiveDcaPicker, props);
  const picker = () => nodes(render(), node => node.type === SharedPicker)[0];
  const open = () => { byClass(render(), 'dl-symbol-trigger').props.onClick(); return picker(); };
  return { props, changes, render, picker, open };
}

function pickerHarness(overrides = {}) {
  hooks.reset();
  const globals = ['document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const listeners = new Map(), viewportListeners = new Map(), timers = new Map(), frames = new Map();
  const actions = [], changes = [], requests = [];
  let now = 0, nextId = 0, closeCount = 0;
  const doc = {
    activeElement: null, body: { style: { overflow: 'auto' } },
    addEventListener(type, callback) { assert.equal(listeners.has(type), false); listeners.set(type, callback); },
    removeEventListener(type, callback) { assert.equal(listeners.get(type), callback); listeners.delete(type); },
  };
  const target = name => ({ name, focus() { actions.push(name); doc.activeElement = this; } });
  const trigger = target('trigger'), input = target('input'), first = target('close'), last = target('last-preset');
  const dialog = { ...target('dialog'), querySelectorAll: () => [first, input, last] };
  doc.activeElement = trigger;
  const viewport = {
    offsetTop: 12, height: 600,
    addEventListener(type, callback) { assert.equal(viewportListeners.has(type), false); viewportListeners.set(type, callback); },
    removeEventListener(type, callback) { assert.equal(viewportListeners.get(type), callback); viewportListeners.delete(type); },
  };
  const win = {
    visualViewport: viewport,
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  for (const [key, value] of [['document', doc], ['window', win]]) Object.defineProperty(globalThis, key, { configurable: true, value });
  const props = {
    selectedSymbol: 'QQQ', userId: 'user-one', onSelect: item => changes.push(item), onClose: () => closeCount++,
    searchSource: args => new Promise((resolve, reject) => requests.push({ ...args, resolve, reject })), ...overrides,
  };
  function render() {
    let tree = hooks.render(SharedPicker, props);
    byClass(tree, 'ic-picker').ref.current = dialog;
    nodes(tree, node => node.type === 'input')[0].ref.current = input;
    hooks.flush();
    tree = hooks.render(SharedPicker, props);
    return tree;
  }
  function type(value) { nodes(render(), node => node.type === 'input')[0].props.onChange({ target: { value } }); return render(); }
  function advance(milliseconds) {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
  }
  function key(keyValue, shiftKey = false) {
    let prevented = 0;
    listeners.get('keydown')?.({ key: keyValue, shiftKey, preventDefault: () => prevented++ });
    return prevented;
  }
  function unmount() {
    hooks.unmount();
    assert.equal(listeners.size, 0); assert.equal(viewportListeners.size, 0);
    assert.equal(timers.size, 0); assert.equal(frames.size, 0);
    assert.equal(doc.body.style.overflow, 'auto');
  }
  function restore() {
    try { unmount(); }
    finally { for (const [key, original] of globals) { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; } }
  }
  return { props, render, type, advance, key, unmount, restore, requests, changes, actions, doc, trigger, input, first, last, dialog,
    timers, viewport, viewportListeners, closeCount: () => closeCount,
    focusFrame() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
  };
}

test('DCA uses an accessible dialog trigger and forwards its controlled selection and search context', () => {
  for (const englishMode of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(DcaSymbolPicker, { value: 'QQQ', englishMode, onChange() {} }));
    assert.match(html, /aria-haspopup="dialog" aria-expanded="false"/);
    assert.match(html, englishMode ? /Change investment QQQ/ : /更换投资标的 QQQ/);
    assert.doesNotMatch(html, /<select|<option|role="listbox"|role="dialog"/);
    const h = wrapperHarness({ englishMode });
    const picker = h.open();
    assert.ok(picker, 'DCA renders the same shared picker used by investment comparison');
    assert.equal(picker.props.selectedSymbol, 'QQQ');
    assert.equal(picker.props.comparisonSymbol, undefined, 'a single-investment plan cannot disable an opposing symbol');
    assert.equal(picker.props.userId, 'user-one'); assert.equal(picker.props.englishMode, englishMode);
    assert.equal(picker.props.searchSource, h.props.searchSource);
    assert.equal(byClass(h.render(), 'dl-symbol-trigger').props['aria-expanded'], true);
    picker.props.onClose();
    assert.equal(h.picker(), undefined); assert.deepEqual(h.changes, []);
  }
});

test('DCA choosing a different preset or searched symbol closes; reselecting does not reload the plan', () => {
  const h = wrapperHarness();
  for (const symbol of ['VGT', 'SMH', 'BRK-B']) {
    const item = instrument(symbol);
    h.open().props.onSelect(item);
    assert.equal(h.picker(), undefined); assert.equal(h.changes.at(-1), symbol);
    h.props.value = symbol;
    const count = h.changes.length;
    h.open().props.onSelect(item);
    assert.equal(h.picker(), undefined);
    assert.equal(h.changes.length, count, 'same-symbol selection must not start another historical-data request');
  }
  assert.deepEqual(h.changes, ['VGT', 'SMH', 'BRK-B']);
});

test('the shared portal starts with every preset, focuses without opening the keyboard, and restores its trigger', () => {
  const h = pickerHarness();
  try {
    const tree = h.render();
    assert.equal(portals.at(-1), h.doc.body);
    const dialog = byClass(tree, 'ic-picker');
    assert.equal(dialog.props.role, 'dialog'); assert.equal(dialog.props['aria-modal'], 'true'); assert.equal(dialog.props.tabIndex, -1);
    assert.match(text(nodes(tree, node => node.type === 'h2')[0]), /更换投资标的/);
    assert.match(text(byClass(tree, 'ic-picker-context')).trim(), /^当前\s+QQQ$/);
    const presets = nodes(tree, node => node.type === Presets)[0];
    const choices = nodes(Presets(presets.props), node => node.type === 'button');
    assert.deepEqual(choices.map(buttonSymbol), DCA_SYMBOLS.map(item => item.symbol));
    assert.equal(choices.filter(choice => choice.props.disabled).length, 0);
    assert.equal(choices.filter(choice => choice.props['aria-current'] === 'true').length, 1);
    h.advance(1000);
    assert.deepEqual(h.requests, [], 'empty search displays shortcuts without a network request');
    assert.equal(h.doc.body.style.overflow, 'hidden');
    h.focusFrame();
    assert.equal(h.doc.activeElement, h.dialog); assert.deepEqual(h.actions, ['dialog']);
  } finally { h.restore(); }
  assert.equal(h.doc.activeElement, h.trigger);
});

test('dialog Tab traversal, Escape, backdrop dismissal and viewport cleanup preserve selection', () => {
  const h = pickerHarness({ selectedSymbol: 'NVDA', comparisonSymbol: 'SMH', englishMode: true, title: 'Change left investment' });
  try {
    let tree = h.render(); h.focusFrame();
    assert.match(text(byClass(tree, 'ic-picker-context')), /Current.*NVDA.*Compared with.*SMH/);
    assert.equal(text(nodes(tree, node => node.type === 'h2')[0]), 'Change left investment');
    assert.equal(h.key('Tab'), 1); assert.equal(h.doc.activeElement, h.first);
    assert.equal(h.key('Tab', true), 1); assert.equal(h.doc.activeElement, h.last);
    assert.equal(h.key('Tab'), 1); assert.equal(h.doc.activeElement, h.first);
    h.doc.activeElement = h.dialog;
    assert.equal(h.key('Tab', true), 1); assert.equal(h.doc.activeElement, h.last);
    h.doc.activeElement = h.input;
    assert.equal(h.key('Tab'), 0, 'ordinary traversal inside the dialog remains native');
    h.props.onClose = () => h.changes.push('latest-close'); tree = h.render();
    assert.equal(h.key('Escape'), 1);
    assert.deepEqual(h.changes, ['latest-close'], 'Escape uses the latest close callback');
    const overlay = {};
    tree.props.onPointerDown({ target: {}, currentTarget: overlay });
    assert.equal(h.changes.length, 1, 'pointer events within the dialog do not dismiss it');
    tree.props.onPointerDown({ target: overlay, currentTarget: overlay }); assert.equal(h.changes.length, 2);
    h.viewport.offsetTop = 24; h.viewport.height = 320; h.viewportListeners.get('resize')();
    assert.deepEqual(h.render().props.style, { top: 24, height: 320, bottom: 'auto' });
  } finally { h.restore(); }
  assert.equal(h.doc.activeElement, h.trigger);
});

test('typed search debounces with authenticated context and protects the comparison symbol', async () => {
  const h = pickerHarness({ comparisonSymbol: 'TQQQ' });
  try {
    h.type('N'); h.advance(299); assert.equal(h.requests.length, 0);
    h.type('  NVDA  '); h.advance(299);
    assert.equal(h.requests.length, 0, 'typing again restarts the debounce');
    h.advance(1); assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    assert.equal(request.query, 'NVDA'); assert.equal(request.userId, 'user-one');
    assert.equal(request.force, false); assert.equal(request.signal.aborted, false);
    assert.match(text(h.render()), /搜索中/);
    const results = ['QQQ', 'NVDA', 'TQQQ'].map(instrument);
    request.resolve({ results }); await tick();
    const buttons = resultButtons(h.render());
    assert.deepEqual(buttons.map(buttonSymbol), ['QQQ', 'NVDA', 'TQQQ']);
    assert.match(text(buttons[0]), /当前/); assert.equal(buttons[2].props.disabled, true);
    buttons[2].props.onClick(); assert.deepEqual(h.changes, []);
    buttons[1].props.onClick(); assert.deepEqual(h.changes, [results[1]]);
  } finally { h.restore(); }
});

test('outdated query or user responses cannot repopulate another search or another account', async () => {
  const h = pickerHarness();
  try {
    h.type('old'); h.advance(300); const old = h.requests[0];
    h.type('new'); assert.equal(old.signal.aborted, true);
    h.advance(300); const newer = h.requests[1];
    old.resolve({ results: [instrument('OLD')] }); await tick();
    assert.equal(resultButtons(h.render()).length, 0);
    h.props.userId = 'user-two'; h.render(); assert.equal(newer.signal.aborted, true);
    h.advance(300); assert.equal(h.requests[2].userId, 'user-two');
    newer.resolve({ results: [instrument('WRONG-USER')] }); await tick();
    assert.equal(resultButtons(h.render()).length, 0);
    h.requests[2].resolve({ results: [instrument('SMH')] }); await tick();
    assert.deepEqual(resultButtons(h.render()).map(buttonSymbol), ['SMH']);
    h.props.userId = 'user-three';
    const transition = hooks.render(SharedPicker, h.props);
    assert.equal(resultButtons(transition).length, 0, 'user changes hide existing results before the next effect');
    h.render();
  } finally { h.restore(); }
});

test('clearing search and unmount abort pending work, restore shortcuts and prevent post-close state writes', async () => {
  const h = pickerHarness();
  try {
    h.type('QQQ'); h.advance(300); const first = h.requests[0];
    const tree = h.type('   '); assert.equal(first.signal.aborted, true);
    assert.equal(nodes(tree, node => node.type === Presets).length, 1);
    first.resolve({ results: [instrument('SHOULD-NOT-APPEAR')] }); await tick();
    assert.equal(resultButtons(h.render()).length, 0);
    h.type('SMH'); h.advance(300); const final = h.requests[1];
    h.unmount(); assert.equal(final.signal.aborted, true);
    const writes = hooks.stateWrites();
    final.resolve({ results: [instrument('SMH')] }); await tick();
    assert.equal(hooks.stateWrites(), writes, 'an aborted response cannot update the unmounted picker');
  } finally { h.restore(); }
  const pending = pickerHarness();
  try {
    pending.type('VGT'); pending.unmount(); pending.advance(300);
    assert.equal(pending.requests.length, 0, 'closing before the debounce expires never starts a request');
  } finally { pending.restore(); }
});

test('failure stays explicit, retry forces the authenticated query, and a new query clears retry state', async () => {
  const h = pickerHarness({ englishMode: true });
  try {
    h.type('VGT'); h.advance(300);
    h.requests[0].reject(new Error('fixture network failure')); await tick();
    const alert = nodes(h.render(), node => node.props.role === 'alert')[0];
    assert.match(text(alert), /Search is temporarily unavailable/);
    nodes(alert, node => node.type === 'button')[0].props.onClick(); h.render(); h.advance(300);
    assert.equal(h.requests[1].force, true);
    assert.equal(h.requests[1].query, 'VGT'); assert.equal(h.requests[1].userId, 'user-one');
    h.requests[1].resolve({ results: [] }); await tick();
    assert.match(text(h.render()), /No matching USD stock or ETF found/);
    h.type('SMH'); h.advance(300); assert.equal(h.requests[2].force, false);
  } finally { h.restore(); }
});

test('the wrapper and shared picker do not load prices or write financial state', () => {
  assert.doesNotMatch(source + pickerSource, /<select\b|<option\b|\b(?:fetch|loadDcaHistory|buildDcaModel)\s*\(|localStorage|sessionStorage|supabase|stock_trades/);
  assert.doesNotMatch(source, /document\.|visualViewport|scrollTo\(|touchmove|touchstart|createPortal/);
  assert.match(source, /if \(item\.symbol !== value\) onChange\(item\.symbol\)/);
});
