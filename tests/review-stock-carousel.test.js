import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';
import { parse } from 'postcss';

const source = readFileSync(new URL('../src/components/ReviewStockCarousel.jsx', import.meta.url), 'utf8');
const css = parse(readFileSync(new URL('../src/components/ReviewStockCarousel.css', import.meta.url), 'utf8'));
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const findClass = (tree, name) => walk(tree).find(node => node.props.className?.split(' ').includes(name));
const buttons = tree => walk(tree).filter(node => node.type === 'button');
const props = { symbols: ['SMH', 'GOOGL', 'VGT'], recordDate: '2026-10-28', stockTrades: [{ id: 'trade-1' }], userId: 'owner-a', language: 'zh', previewHistory: { series: {} } };

let nextFixture = 0;
async function harness({ reducedMotion = false, width = 280 } = {}) {
  const slots = [], observers = [], calls = [], focusCalls = [];
  let cursor = 0, effects = [];
  const node = { children: [], scrollLeft: 0, contains: target => target !== 'portal', scrollTo(options) { calls.push(options); } };
  const fixture = {
    React: { ...React,
      useRef(initial) { const id = cursor++; return slots[id] ||= { current: initial }; },
      useState(initial) { const id = cursor++; const slot = slots[id] ||= { value: initial }; return [slot.value, value => { slot.value = value; }]; },
      useEffect(effect, deps) { const id = cursor++, previous = slots[id]; if (previous && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return; previous?.cleanup?.(); const slot = slots[id] = { deps }; effects.push(() => { slot.cleanup = effect(); }); },
    },
    window: {
      matchMedia: () => ({ matches: reducedMotion }),
      ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe(element) { this.node = element; } disconnect() { this.disconnected = true; } },
    },
    Replay: () => null,
  };
  const key = `__reviewCarousel${++nextFixture}`;
  globalThis[key] = fixture;
  let Component;
  try {
    const code = `const { React, window, Replay: ReviewStockReplay } = globalThis[${JSON.stringify(key)}];\n${source.replace(/^import .*;\n/gm, '')}`;
    const transformed = await transformWithOxc(code, 'ReviewStockCarouselTest.jsx', { jsx: { runtime: 'classic' } });
    Component = (await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  return {
    node, calls, observers, focusCalls, Component, Replay: fixture.Replay,
    render(input = props) {
      const entry = Component(input);
      if (!entry) return null;
      cursor = 0; effects = [];
      const tree = entry.type(entry.props), track = findClass(tree, 'rsc-track');
      if (track) { node.children = input.symbols.map((_, index) => ({ offsetLeft: index * (width + 12) })); track.ref.current = node; }
      const navigation = findClass(tree, 'rsc-navigation');
      if (navigation) navigation.ref.current = { children: input.symbols.map((symbol, index) => ({ focus(options) { focusCalls.push({ symbol, index, ...options }); } })) };
      effects.forEach(effect => effect());
      return tree;
    },
    event(extra = {}) { return { currentTarget: node, target: 'inside', pointerId: 1, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra }; },
    cleanup() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('keeps the mention order and forwards every replay data contract without changing it', async () => {
  const h = await harness(), tree = h.render();
  const cards = walk(tree).filter(node => node.type === h.Replay);
  assert.deepEqual(cards.map(card => card.props.symbol), props.symbols);
  for (const card of cards) for (const key of ['recordDate', 'stockTrades', 'userId', 'language', 'previewHistory']) assert.equal(card.props[key], props[key]);
  assert.deepEqual(buttons(tree).map(button => button.props.children), props.symbols);
  assert.deepEqual(buttons(tree).map(button => button.props['aria-pressed']), [true, false, false]);
  assert.equal(tree.props['data-rj-interactive'], true);
  h.cleanup();
});

test('one stock uses the existing card width without pagination, and empty attachments render nothing', async () => {
  const h = await harness();
  const tree = h.render({ ...props, symbols: ['NOK'] });
  assert.equal(findClass(tree, 'rsc-track'), undefined);
  assert.equal(buttons(tree).length, 0);
  assert.equal(tree.props.children.type, h.Replay);
  assert.equal(tree.props.children.props.symbol, 'NOK');
  const click = h.event(); tree.props.onClick(click); assert.equal(click.stopped, true);
  assert.equal(h.render({ ...props, symbols: [] }), null);
  assert.equal(h.render({ ...props, symbols: undefined }), null);
  assert.equal(h.observers.length, 0);
});

test('ticker buttons and keyboard arrows navigate complete pages and respect both bounds', async () => {
  const h = await harness();
  let tree = h.render();
  buttons(tree)[1].props.onClick(); tree = h.render();
  assert.deepEqual(h.calls.at(-1), { left: 292, behavior: 'smooth' });
  assert.equal(buttons(tree)[1].props['aria-pressed'], true);
  const right = h.event({ key: 'ArrowRight' }); tree.props.onKeyDown(right); tree = h.render();
  assert.equal(buttons(tree)[2].props['aria-pressed'], true);
  assert.equal(right.prevented, true); assert.equal(right.stopped, true);
  assert.deepEqual(h.focusCalls.at(-1), { symbol: 'VGT', index: 2, preventScroll: true }, 'Enter must activate the newly selected ticker');
  tree.props.onKeyDown(h.event({ key: 'ArrowRight' }));
  assert.equal(h.calls.at(-1).left, 584);
  for (let i = 0; i < 4; i++) tree.props.onKeyDown(h.event({ key: 'ArrowLeft' }));
  tree = h.render(); assert.equal(buttons(tree)[0].props['aria-pressed'], true);
  assert.equal(h.calls.at(-1).left, 0);
  const count = h.calls.length;
  const down = h.event({ key: 'ArrowDown' }); tree.props.onKeyDown(down);
  assert.equal(down.prevented, false); assert.equal(h.calls.length, count);
  tree.props.onKeyDown(h.event({ key: 'ArrowRight', target: 'portal' }));
  assert.equal(h.calls.length, count, 'full replay dialog arrow keys must remain independent');
  h.cleanup();
});

test('native swipe scrolling updates the selected ticker and resize preserves that stock', async () => {
  for (const width of [226, 296, 336]) {
    const h = await harness({ width }); let tree = h.render();
    h.node.scrollLeft = (width + 12) * 2 - 1;
    findClass(tree, 'rsc-track').props.onScroll(h.event()); tree = h.render();
    assert.deepEqual(buttons(tree).map(button => button.props['aria-pressed']), [false, false, true]);
    h.node.children = [{ offsetLeft: 0 }, { offsetLeft: 400 }, { offsetLeft: 800 }];
    h.observers[0].callback();
    assert.deepEqual(h.calls.at(-1), { left: 800, behavior: 'auto' });
    h.cleanup(); assert.equal(h.observers[0].disconnected, true);
  }
});

test('swiping a chart never opens its replay or parent article while taps still reach the replay', async () => {
  const h = await harness(), tree = h.render(), track = findClass(tree, 'rsc-track');
  track.props.onPointerDown(h.event({ clientX: 120, clientY: 60 }));
  const move = h.event({ clientX: 30, clientY: 63 }); track.props.onPointerMove(move);
  assert.equal(move.prevented, false, 'native horizontal and vertical scrolling must not be blocked');
  const swipeClick = h.event(); track.props.onClickCapture(swipeClick);
  assert.equal(swipeClick.prevented, true); assert.equal(swipeClick.stopped, true);
  track.props.onPointerDown(h.event({ clientX: 120, clientY: 60 }));
  track.props.onPointerMove(h.event({ clientX: 123, clientY: 62 }));
  const tap = h.event(); track.props.onClickCapture(tap);
  assert.equal(tap.prevented, false); assert.equal(tap.stopped, false);
  tree.props.onClick(tap); assert.equal(tap.stopped, true, 'the replay tap must not bubble into the article');
  track.props.onPointerDown(h.event({ clientX: 120, clientY: 60 }));
  track.props.onPointerMove(h.event({ clientX: 10, clientY: 60, target: 'portal' }));
  const portalTap = h.event(); track.props.onClickCapture(portalTap); assert.equal(portalTap.prevented, false);
  track.props.onPointerDown(h.event({ clientX: 120, clientY: 60 }));
  track.props.onPointerCancel();
  const nativeSwipeClick = h.event(); track.props.onClickCapture(nativeSwipeClick);
  assert.equal(nativeSwipeClick.prevented, true, 'a native scroll cancellation must not open the replay');
  track.props.onPointerDown(h.event({ clientX: 120, clientY: 60 }));
  h.node.scrollLeft = 292; track.props.onScroll(h.event());
  const scrollClick = h.event(); track.props.onClickCapture(scrollClick);
  assert.equal(scrollClick.prevented, true, 'native scroll without pointermove still suppresses its trailing click');
  track.props.onPointerDown(h.event({ clientX: 120, clientY: 60 }));
  const freshTap = h.event(); track.props.onClickCapture(freshTap); assert.equal(freshTap.prevented, false);
  h.cleanup();
});

test('reduced motion uses immediate navigation and symbols or owner changes reset the carousel scope', async () => {
  const h = await harness({ reducedMotion: true }), tree = h.render();
  buttons(tree)[2].props.onClick(); assert.equal(h.calls.at(-1).behavior, 'auto');
  assert.notEqual(h.Component(props).key, h.Component({ ...props, symbols: [...props.symbols].reverse() }).key);
  assert.notEqual(h.Component(props).key, h.Component({ ...props, userId: 'owner-b' }).key);
  h.cleanup();
});

test('native paging is confined to the card width without disabling page or full-chart gestures', () => {
  const declarations = selector => Object.fromEntries(css.nodes.filter(node => node.type === 'rule' && node.selector === selector).flatMap(rule => rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])));
  assert.equal(declarations('.rsc-carousel')['min-width'], '0');
  const track = declarations('.rsc-track');
  assert.equal(track.display, 'flex'); assert.equal(track['overflow-x'], 'auto');
  assert.equal(track['scroll-snap-type'], 'x mandatory');
  assert.equal(track['max-width'], '100%'); assert.equal(track['min-width'], '0');
  assert.equal(track['touch-action'], undefined);
  const slide = declarations('.rsc-slide');
  assert.equal(slide.flex, '0 0 100%'); assert.equal(slide['min-width'], '0');
  assert.equal(slide['scroll-snap-align'], 'start');
  assert.equal(declarations('.rsc-track .rsr-chart-mini .rsr-chart-touch')['touch-action'], 'auto');
  assert.equal(declarations('.rsc-track .rsr-chart-touch')['touch-action'], undefined);
});
