import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

const sourceUrl = new URL('../src/components/ActionModalCard.jsx', import.meta.url);
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
// Keep the production component and focus handler intact. Only hook mounting and
// DOM geometry are supplied here; the scroll calculation is never reimplemented.
const hooksUrl = moduleUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
export default {
  ...React,
  useState: initial => [initial, () => {}],
  useRef: initial => ({ current: initial }),
  useCallback: callback => callback,
  useEffect() {},
  useLayoutEffect() {},
};
`);
const compiled = await transformWithOxc(readFileSync(sourceUrl, 'utf8'), 'ActionModalCard.jsx', { jsx: { runtime: 'classic' } });
const code = compiled.code.replace(/from\s+(['"])(react|lucide-react)\1/g, (_match, _quote, name) =>
  `from ${JSON.stringify(name === 'react' ? hooksUrl : import.meta.resolve(name))}`);
const { default: ActionModalCard } = await import(moduleUrl(code));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

function scroller({ parent, top, height, overflowY = 'auto', scrollable = true }) {
  let scrollTop = 200;
  const writes = [];
  return {
    parentElement: parent,
    overflowY,
    clientHeight: height,
    scrollHeight: scrollable ? 2000 : height,
    initialScrollTop: scrollTop,
    writes,
    get scrollTop() { return scrollTop; },
    set scrollTop(value) {
      scrollTop = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, value));
      writes.push(scrollTop);
    },
    getBoundingClientRect() { return { top, bottom: top + height, height }; },
  };
}

function withFocusHarness({
  height,
  controlHeight = 44,
  controlOffset = height + 20,
  nested = false,
  overflowY = 'auto',
  nonScrollingInner = false,
  contentOverflowY = 'auto',
}, check) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const frames = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      getComputedStyle: element => ({ overflowY: element.overflowY || 'visible' }),
      requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    },
  });
  try {
    const tree = ActionModalCard({ title: '添加交易', closeLabel: '关闭交易表单' });
    const dialog = nodes(tree, node => node.props.role === 'dialog')[0];
    const contentNode = nodes(tree, node => node.props.className?.includes('flex-1 overflow-y-auto'))[0];
    const panel = {
      parentElement: null,
      contains(target) {
        for (let element = target; element; element = element.parentElement) {
          if (element === this) return true;
        }
        return false;
      },
    };
    const content = scroller({ parent: panel, top: 100, height: nested ? height + 80 : height, overflowY: contentOverflowY });
    const actualScroller = nested
      ? scroller({ parent: content, top: 140, height, overflowY })
      : content;
    const inner = nonScrollingInner
      ? scroller({ parent: actualScroller, top: 140, height: 46, scrollable: false })
      : actualScroller;
    const wrapper = { parentElement: inner };
    const target = {
      parentElement: wrapper,
      getBoundingClientRect() {
        let scrollDelta = 0;
        for (let element = this.parentElement; element; element = element.parentElement) {
          if (element.initialScrollTop !== undefined) scrollDelta += element.scrollTop - element.initialScrollTop;
        }
        const top = actualScroller.getBoundingClientRect().top + controlOffset - scrollDelta;
        return { top, bottom: top + controlHeight, height: controlHeight };
      },
    };
    dialog.ref.current = panel;
    contentNode.ref.current = content;
    const focus = () => {
      dialog.props.onFocusCapture({ target });
      assert.equal(frames.length, 1, 'production focus handling should defer one measurement until the next frame');
      frames.shift()();
    };
    check({ target, content, actualScroller, inner, focus });
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  }
}

function assertFullyVisible(target, container, context) {
  const control = target.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();
  assert.ok(control.top >= viewport.top, `${context}: input top ${control.top} must not cross viewport top ${viewport.top}`);
  assert.ok(control.bottom <= viewport.bottom, `${context}: input bottom ${control.bottom} must not cross viewport bottom ${viewport.bottom}`);
}

for (const height of [76, 84, 100, 180, 480]) {
  test(`focus keeps the complete 44px trade input and its shell visible in a ${height}px scroller`, () => {
    withFocusHarness({ height }, ({ target, actualScroller, focus }) => {
      focus();
      assertFullyVisible(target, actualScroller, `height ${height}`);
      const control = target.getBoundingClientRect();
      const viewport = actualScroller.getBoundingClientRect();
      assert.ok(control.top - 1 >= viewport.top, 'the 46px input shell must retain its upper edge and rounded corners');
      assert.ok(control.bottom + 1 <= viewport.bottom, 'the input shell must retain its lower edge');
      assert.ok(actualScroller.scrollTop > actualScroller.initialScrollTop, 'a field below the viewport should scroll upward into view');
      const settled = actualScroller.scrollTop;
      focus();
      assert.equal(actualScroller.scrollTop, settled, 'repeated focus must not alternate between top and bottom corrections');
    });
  });
}

test('focus restores a control hidden above the content viewport', () => {
  withFocusHarness({ height: 84, controlOffset: -20 }, ({ target, actualScroller, focus }) => {
    focus();
    assertFullyVisible(target, actualScroller, 'above viewport');
    assert.ok(actualScroller.scrollTop < actualScroller.initialScrollTop);
    assert.ok(target.getBoundingClientRect().top > actualScroller.getBoundingClientRect().top, 'leave top context when it fits');
  });
});

test('a control already inside the comfortable visible region does not move the scroller', () => {
  withFocusHarness({ height: 180, controlOffset: 24 }, ({ actualScroller, focus }) => {
    focus();
    focus();
    assert.deepEqual(actualScroller.writes, []);
  });
});

test('a tall viewport retains room beneath the focused control for the next field', () => {
  withFocusHarness({ height: 480 }, ({ target, actualScroller, focus }) => {
    focus();
    assertFullyVisible(target, actualScroller, 'tall viewport');
    assert.ok(actualScroller.getBoundingClientRect().bottom - target.getBoundingClientRect().bottom >= 80, 'normal-height dialogs should retain useful lower context');
  });
});

test('a control taller than the scroller aligns its top and remains stable across repeated focus', () => {
  for (const controlOffset of [-20, 0, 50]) {
    withFocusHarness({ height: 32, controlHeight: 44, controlOffset }, ({ target, actualScroller, focus }) => {
      focus();
      assert.equal(target.getBoundingClientRect().top, actualScroller.getBoundingClientRect().top);
      const settled = actualScroller.scrollTop;
      for (let repeat = 0; repeat < 4; repeat += 1) {
        focus();
        assert.equal(actualScroller.scrollTop, settled, 'an impossible full fit must not cause alternating scroll corrections');
      }
    });
  }
});

test('a control exactly as tall as the viewport fits without added context', () => {
  withFocusHarness({ height: 44, controlHeight: 44 }, ({ target, actualScroller, focus }) => {
    focus();
    assertFullyVisible(target, actualScroller, 'exact fit');
    const settled = actualScroller.scrollTop;
    focus();
    assert.equal(actualScroller.scrollTop, settled);
  });
});

test('nested auto and scroll containers receive the adjustment instead of their outer content', () => {
  for (const overflowY of ['auto', 'scroll']) {
    withFocusHarness({ height: 76, nested: true, overflowY }, ({ target, content, actualScroller, focus }) => {
      focus();
      assertFullyVisible(target, actualScroller, `${overflowY} nested viewport`);
      assert.ok(actualScroller.writes.length > 0);
      assert.deepEqual(content.writes, [], 'the outer content must keep its existing scroll position');
    });
  }
});

test('a non-overflowing inner auto container is skipped in favor of the real scroller', () => {
  withFocusHarness({ height: 84, nested: true, nonScrollingInner: true }, ({ target, content, actualScroller, inner, focus }) => {
    focus();
    assertFullyVisible(target, actualScroller, 'skip non-scrolling inner wrapper');
    assert.ok(actualScroller.writes.length > 0);
    assert.deepEqual(inner.writes, []);
    assert.deepEqual(content.writes, []);
  });
});

test('the content ref remains the fallback when no ancestor advertises auto or scroll overflow', () => {
  withFocusHarness({ height: 84, contentOverflowY: 'visible' }, ({ target, content, focus }) => {
    focus();
    assertFullyVisible(target, content, 'content-ref fallback');
    assert.ok(content.writes.length > 0);
  });
});

// A separate mounted hook harness drives the real visualViewport listener and
// state update, so the compact-spacing tests do not inject a computed keyboard flag.
const viewportHooksUrl = moduleUrl(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots = [], cursor = 0, pending = [];
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; cursor = 0; pending = []; }
export function render(Component, props) { cursor = 0; return Component(props); }
export function flush() { const effects = pending; pending = []; effects.forEach(effect => effect()); }
function useState(initial) { const slot = slots[cursor++] ||= { value: initial }; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
function useRef(initial) { return slots[cursor++] ||= { current: initial }; }
function useCallback(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback, deps }; return slots[index].value; }
function useEffect(effect, deps) {
  const index = cursor++, previous = slots[index];
  if (previous && same(previous.deps, deps)) return;
  const slot = slots[index] = { deps, cleanup: previous?.cleanup };
  pending.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
}
export default { ...React, useState, useRef, useCallback, useEffect, useLayoutEffect: useEffect };
`);
const viewportHooks = await import(viewportHooksUrl);
const { default: ViewportActionModalCard } = await import(moduleUrl(code.replace(JSON.stringify(hooksUrl), JSON.stringify(viewportHooksUrl))));

function withViewportHarness(props, check, { available = true } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const frames = new Map();
  const viewportListeners = new Map();
  const windowListeners = new Map();
  let frameId = 0;
  const viewport = {
    height: 844,
    offsetTop: 0,
    addEventListener: (type, callback) => viewportListeners.set(type, callback),
    removeEventListener: (type, callback) => { if (viewportListeners.get(type) === callback) viewportListeners.delete(type); },
  };
  const win = {
    innerHeight: 844,
    visualViewport: available ? viewport : undefined,
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (type, callback) => windowListeners.set(type, callback),
    removeEventListener: (type, callback) => { if (windowListeners.get(type) === callback) windowListeners.delete(type); },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  viewportHooks.reset();
  try {
    const render = () => viewportHooks.render(ViewportActionModalCard, { title: '添加交易', closeLabel: '关闭交易表单', ...props });
    const initial = render();
    const settle = () => {
      viewportHooks.flush();
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
      const tree = render();
      viewportHooks.flush();
      return tree;
    };
    const resize = (height, offsetTop = 0) => {
      viewport.height = height;
      viewport.offsetTop = offsetTop;
      assert.ok(viewportListeners.has('resize'), 'production code must register the visualViewport resize handler');
      viewportListeners.get('resize')();
      return settle();
    };
    check({ initial, mount: settle, resize });
  } finally {
    viewportHooks.reset();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  }
}

function assertNormalSpacing(tree) {
  assert.equal(tree.props.style.paddingTop, 'calc(env(safe-area-inset-top) + 24px)');
  assert.equal(tree.props.style.paddingBottom, 'calc(env(safe-area-inset-bottom) + 24px)');
}

test('compact spacing preserves normal margins before measurement and in the full viewport', () => {
  withViewportHarness({ compactKeyboardSpacing: true }, ({ initial, mount }) => {
    assertNormalSpacing(initial);
    const mounted = mount();
    assertNormalSpacing(mounted);
    assert.equal(mounted.props.style.height, '844px');
    assert.equal(mounted.props.style.top, '0px');
  });
});

test('opted-in keyboard resize tightens the gaps and restores normal margins after dismissal', () => {
  withViewportHarness({ compactKeyboardSpacing: true }, ({ mount, resize }) => {
    mount();
    const keyboard = resize(500, 12);
    assert.equal(keyboard.props.style.paddingTop, 'calc(env(safe-area-inset-top) + 8px)');
    assert.equal(keyboard.props.style.paddingBottom, '8px');
    assert.equal(keyboard.props.style.height, '500px');
    assert.equal(keyboard.props.style.top, '12px');
    assertNormalSpacing(resize(844));
  });
});

test('other dialogs retain their normal margins with the keyboard when opt-in is absent or false', () => {
  for (const props of [{}, { compactKeyboardSpacing: false }]) {
    withViewportHarness(props, ({ mount, resize }) => {
      mount();
      const keyboard = resize(500);
      assertNormalSpacing(keyboard);
      assert.equal(keyboard.props.style.height, '500px', 'opt-out must preserve existing visual-viewport tracking');
    });
  }
});

test('compact spacing requires more than 120px of viewport shrinkage', () => {
  withViewportHarness({ compactKeyboardSpacing: true }, ({ mount, resize }) => {
    mount();
    assertNormalSpacing(resize(724));
    const keyboard = resize(723);
    assert.equal(keyboard.props.style.paddingTop, 'calc(env(safe-area-inset-top) + 8px)');
    assert.equal(keyboard.props.style.paddingBottom, '8px');
    assertNormalSpacing(resize(800));
  });
});

test('a browser without visualViewport retains the normal overlay spacing', () => {
  withViewportHarness({ compactKeyboardSpacing: true }, ({ initial, mount }) => {
    assertNormalSpacing(initial);
    const mounted = mount();
    assertNormalSpacing(mounted);
    assert.equal(mounted.props.style.height, undefined);
  }, { available: false });
});
