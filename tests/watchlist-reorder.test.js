import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  applyWatchlistOrder, createWatchlistReorderCommitter, createWatchlistReorderSession,
  moveWatchlistSymbol, watchlistAutoScrollDelta, watchlistKeyboardOrder, watchlistOrderKey, watchlistTargetAtY,
} from '../src/lib/watchlistReorder.js';

const rows = Object.freeze(['AAA', 'BBB', 'CCC'].map((symbol, index) => Object.freeze({ symbol, price: index + 10 })));
const symbols = list => list.map(row => row.symbol);
const startSession = () => createWatchlistReorderSession({ rows, symbol: 'AAA', pointerId: 7, clientX: 20, clientY: 20 });
const moveSession = (session, overrides = {}) => session.move({ rows, pointerId: 7, clientX: 20, clientY: 130, targetSymbol: 'CCC', ...overrides });

test('symbol reordering preserves row objects, leaves input untouched, and rejects stale or duplicate membership', () => {
  assert.deepEqual(moveWatchlistSymbol(['AAA', 'BBB', 'CCC'], 'AAA', 'CCC'), ['BBB', 'CCC', 'AAA']);
  assert.deepEqual(symbols(watchlistKeyboardOrder(rows, 'BBB', -1)), ['BBB', 'AAA', 'CCC']);
  assert.deepEqual(symbols(watchlistKeyboardOrder(rows, 'BBB', 1)), ['AAA', 'CCC', 'BBB']);
  assert.equal(watchlistKeyboardOrder(rows, 'AAA', -1), null);
  assert.equal(watchlistKeyboardOrder(rows, 'CCC', 1), null);
  const latest = rows.map(row => ({ ...row, price: row.price + 100 }));
  assert.equal(watchlistOrderKey(latest), watchlistOrderKey(rows));
  const reordered = applyWatchlistOrder(latest, ['CCC', 'AAA', 'BBB']);
  assert.equal(reordered[0], latest[2]);
  assert.equal(reordered[0].price, 112);
  assert.deepEqual(symbols(rows), ['AAA', 'BBB', 'CCC']);
  for (const order of [['AAA', 'AAA', 'CCC'], ['AAA', 'BBB'], ['AAA', 'BBB', 'DDD']]) assert.equal(applyWatchlistOrder(rows, order), null);
});

test('six pixel threshold, pointer identity and no-op drop do not produce accidental commits', () => {
  const session = startSession();
  assert.equal(moveSession(session, { clientY: 25 }), null);
  assert.equal(session.dragging, false);
  assert.equal(moveSession(session, { pointerId: 8 }), null);
  assert.equal(session.finish({ rows, pointerId: 8 }), null);
  assert.equal(session.active, true);
  assert.deepEqual(symbols(moveSession(session, { clientY: 26 })), ['BBB', 'CCC', 'AAA']);
  assert.equal(session.dragging, true);
  const noMove = startSession();
  assert.equal(noMove.finish({ rows, pointerId: 7 }), null);
  const returned = startSession();
  moveSession(returned);
  moveSession(returned, { targetSymbol: 'BBB' });
  assert.equal(returned.finish({ rows, pointerId: 7 }), null);
});

test('drop consumes its transaction once and uses quote updates from the latest matching order', () => {
  const session = startSession();
  moveSession(session);
  const latest = rows.map(row => ({ ...row, price: 200 }));
  const next = session.finish({ rows: latest, pointerId: 7 });
  assert.deepEqual(symbols(next), ['BBB', 'CCC', 'AAA']);
  assert.equal(next[2], latest[0]);
  assert.equal(session.finish({ rows: latest, pointerId: 7 }), null);
  assert.equal(moveSession(session), null);
});

test('cancel, disable, removal, addition and external reordering abandon the preview without a payload', () => {
  for (const changed of [rows.slice(1), [...rows, { symbol: 'DDD' }], [rows[1], rows[0], rows[2]]]) {
    const session = startSession(); moveSession(session);
    assert.equal(session.finish({ rows: changed, pointerId: 7 }), null);
  }
  const cancelled = startSession(); moveSession(cancelled); cancelled.cancel();
  assert.equal(cancelled.finish({ rows, pointerId: 7 }), null);
  const disabled = startSession(); moveSession(disabled);
  assert.equal(disabled.finish({ rows, pointerId: 7, disabled: true }), null);
  const interrupted = startSession(); moveSession(interrupted, { rows: rows.slice(1) });
  assert.equal(interrupted.active, false);
});

test('the shared commit boundary rejects busy reentry and recovers after failure', async () => {
  const committer = createWatchlistReorderCommitter();
  let release; let calls = 0;
  const pending = committer.commit(rows, () => { calls += 1; return new Promise(resolve => { release = resolve; }); });
  assert.equal(committer.busy, true);
  assert.equal(await committer.commit(rows, () => { calls += 1; }), false);
  assert.equal(calls, 1);
  release({ success: false });
  assert.equal(await pending, false);
  assert.equal(committer.busy, false);
  await assert.rejects(committer.commit(rows, async () => { throw new Error('save failed'); }), /save failed/);
  assert.equal(committer.busy, false);
  assert.equal(await committer.commit(rows, () => ({ success: true })), true);
});

test('hit testing uses row centers and edge scrolling continues in both directions with bounded frame speed', () => {
  const rects = [{ symbol: 'AAA', top: 0, bottom: 50 }, { symbol: 'BBB', top: 50, bottom: 100 }];
  assert.equal(watchlistTargetAtY(rects, 79), 'BBB');
  assert.equal(watchlistTargetAtY(rects, -10), 'AAA');
  assert.equal(watchlistTargetAtY([], 10), null);
  assert.equal(watchlistAutoScrollDelta({ pointerY: 150, top: 0, bottom: 300 }), 0);
  assert.ok(watchlistAutoScrollDelta({ pointerY: 20, top: 0, bottom: 300 }) < 0);
  assert.ok(watchlistAutoScrollDelta({ pointerY: 280, top: 0, bottom: 300 }) > 0);
  assert.equal(watchlistAutoScrollDelta({ pointerY: 350, top: 0, bottom: 300, elapsedMs: 5000 }), 19.2);
});

// A small hook scheduler makes the real event callbacks and effect cleanup testable
// without a browser dependency; all reorder and commit logic remains unmodified.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const schedulerUrl = moduleUrl(`
  let slots = [], cursor = 0, effects = [], dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  export function reset() { slots = []; cursor = 0; effects = []; dirty = false; }
  export function begin() { cursor = 0; dirty = false; }
  export function flush() { const pending = effects; effects = []; pending.forEach(run => run()); return dirty; }
  export function unmount() { slots.forEach(slot => slot?.cleanup?.()); }
  export function useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; }
  export function useState(initial) {
    const i = cursor++; const slot = slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }];
  }
  export function useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; }
  export function useEffect(effect, deps) {
    const i = cursor++; if (same(slots[i]?.deps, deps)) return;
    const previous = slots[i]; const slot = slots[i] = { deps };
    effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
  }
`);
const scheduler = await import(schedulerUrl);
const hookSource = readFileSync(new URL('../src/components/useWatchlistReorder.js', import.meta.url), 'utf8');
const compiledHook = hookSource.replace("from 'react'", `from ${JSON.stringify(schedulerUrl)}`)
  .replace("from '../lib/watchlistReorder.js'", `from ${JSON.stringify(new URL('../src/lib/watchlistReorder.js', import.meta.url).href)}`);
const { useWatchlistReorder } = await import(moduleUrl(compiledHook));

function eventSurface() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, props = {}) { for (const fn of [...(listeners.get(type) || [])]) fn({ pointerId: 7, preventDefault() {}, stopPropagation() {}, ...props }); },
    get listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}
function hookFixture(initial = {}) {
  scheduler.reset();
  const previousWindow = globalThis.window; const previousDocument = globalThis.document;
  const frames = new Map(); let frameId = 0; let props = { rows, onReorder() {}, ...initial }; let hook;
  const scroller = { scrollTop: 0, clientHeight: 180, scrollHeight: 800 };
  let listScroll = 0;
  const list = { ...eventSurface(), parentElement: null, scrollHeight: 800, clientHeight: 180,
    get scrollTop() { return listScroll; }, set scrollTop(value) { listScroll = Math.min(620, Math.max(0, value)); },
    getBoundingClientRect() { return { top: 0, bottom: 180 }; },
    capture: null, setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; }, releasePointerCapture() { this.capture = null; },
    querySelectorAll() { return hook.orderedRows.map((row, i) => ({ getAttribute() { return row.symbol; }, getBoundingClientRect() { return { top: i * 60 - list.scrollTop, bottom: (i + 1) * 60 - list.scrollTop }; } })); },
  };
  const browser = { ...eventSurface(), innerHeight: 180, getComputedStyle() { return { overflowY: 'visible' }; },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
  };
  globalThis.window = browser; globalThis.document = { scrollingElement: scroller, documentElement: scroller };
  const render = updates => {
    props = { ...props, ...updates };
    let updatesPending;
    do { scheduler.begin(); hook = useWatchlistReorder(props); hook.listRef.current = list; updatesPending = scheduler.flush(); } while (updatesPending);
    return hook;
  };
  render();
  return {
    browser, list, scroller, frames, render,
    get hook() { return hook; },
    start(overrides = {}) { hook.getHandleProps(props.rows[0]).onPointerDown({ pointerId: 7, isPrimary: true, button: 0, clientX: 10, clientY: 30, preventDefault() {}, stopPropagation() {}, ...overrides }); },
    frame(time) { const pending = [...frames.entries()]; frames.clear(); pending.forEach(([, fn]) => fn(time)); render(); },
    cleanup() { scheduler.unmount(); globalThis.window = previousWindow; globalThis.document = previousDocument; },
  };
}

test('real hook events capture the stable list, preview before drop and commit once with latest quote objects', async () => {
  const calls = []; let complete;
  const fixture = hookFixture({ onReorder: next => { calls.push(next); return new Promise(resolve => { complete = resolve; }); } });
  try {
    fixture.start(); assert.equal(fixture.list.capture, 7);
    fixture.browser.emit('pointermove', { clientX: 10, clientY: 150 }); fixture.render();
    assert.deepEqual(symbols(fixture.hook.orderedRows), ['BBB', 'CCC', 'AAA']);
    assert.equal(calls.length, 0);
    const latest = rows.map(row => ({ ...row, price: 999 })); fixture.render({ rows: latest });
    assert.equal(fixture.hook.draggingSymbol, 'AAA');
    fixture.browser.emit('pointerup'); fixture.render();
    assert.equal(calls.length, 1); assert.equal(calls[0][2], latest[0]);
    assert.equal(fixture.browser.listenerCount, 0); assert.equal(fixture.frames.size, 0); assert.equal(fixture.list.capture, null);
    fixture.start(); fixture.browser.emit('pointerup'); assert.equal(calls.length, 1);
    complete(); await Promise.resolve(); await Promise.resolve(); fixture.render();
  } finally { fixture.cleanup(); }
});

test('real hook cancel, Escape, lost capture, unmount and changed order remove listeners without saving', () => {
  for (const reason of ['pointercancel', 'Escape', 'lostpointercapture', 'unmount', 'changed', 'disabled']) {
    let calls = 0; const fixture = hookFixture({ onReorder() { calls += 1; } });
    try {
      fixture.start(); fixture.browser.emit('pointermove', { clientX: 10, clientY: 150 }); fixture.render();
      if (reason === 'Escape') fixture.browser.emit('keydown', { key: 'Escape' });
      else if (reason === 'lostpointercapture') fixture.list.emit(reason);
      else if (reason === 'unmount') scheduler.unmount();
      else if (reason === 'changed') fixture.render({ rows: [...rows].reverse() });
      else if (reason === 'disabled') fixture.render({ disabled: true });
      else fixture.browser.emit(reason);
      fixture.browser.emit('pointerup');
      assert.equal(calls, 0, reason); assert.equal(fixture.browser.listenerCount, 0, reason); assert.equal(fixture.frames.size, 0, reason);
    } finally { fixture.cleanup(); }
  }
});

test('real hook rejects secondary pointers and filtered state, supports keyboard reordering and scrolls continuously at the edge', () => {
  const calls = []; const fixture = hookFixture({ onReorder: next => calls.push(next) });
  try {
    fixture.start({ isPrimary: false }); assert.equal(fixture.browser.listenerCount, 0);
    fixture.start({ button: 2 }); assert.equal(fixture.browser.listenerCount, 0);
    fixture.render({ disabled: true }); fixture.start(); assert.equal(fixture.browser.listenerCount, 0);
    fixture.render({ disabled: false }); fixture.start();
    fixture.browser.emit('pointermove', { clientX: 10, clientY: 175 }); fixture.render();
    fixture.frame(16); const firstScroll = fixture.list.scrollTop;
    fixture.frame(32); assert.ok(fixture.list.scrollTop > firstScroll && firstScroll > 0);
    fixture.browser.emit('pointercancel'); fixture.render();
    fixture.hook.getHandleProps(rows[1]).onKeyDown({ key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(symbols(calls[0]), ['BBB', 'AAA', 'CCC']);
  } finally { fixture.cleanup(); }
});

test('edge scrolling stays inside the watchlist and never moves the document at either list boundary', () => {
  const fixture = hookFixture();
  try {
    fixture.start();
    fixture.browser.emit('pointermove', { clientX: 10, clientY: 175 }); fixture.render();
    fixture.list.scrollTop = fixture.list.scrollHeight - fixture.list.clientHeight;
    fixture.frame(16); fixture.frame(32);
    assert.equal(fixture.list.scrollTop, 620);
    assert.equal(fixture.scroller.scrollTop, 0);
    fixture.scroller.scrollTop = 100;
    fixture.list.scrollTop = 0;
    fixture.browser.emit('pointermove', { clientX: 10, clientY: 5 }); fixture.render();
    fixture.frame(48); fixture.frame(64);
    assert.equal(fixture.list.scrollTop, 0);
    assert.equal(fixture.scroller.scrollTop, 100);
    fixture.browser.emit('pointercancel');
  } finally { fixture.cleanup(); }
});
