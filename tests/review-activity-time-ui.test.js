import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatReviewActivityTime } from '../src/lib/reviewActivityTime.js';

const source = readFileSync(new URL('../src/components/ReviewActivityTime.js', import.meta.url), 'utf8');
const timestamp = '2026-11-08T01:00:00Z';
const origin = Date.parse(timestamp);
let fixtureId = 0;

async function harness({ now = origin, ...initialProps } = {}) {
  let slots = [], cursor = 0, pendingEffects = [], dirty = false, tree, mounted = true;
  let props = { createdAt: timestamp, date: '2026-11-07', ...initialProps }, nextTimer = 0;
  const timers = new Map(), cleared = [], scheduled = [];
  const fixture = {
    now,
    useState(initial) {
      const index = cursor++;
      const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, value => {
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; dirty = true; }
      }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++, old = slots[index];
      if (old && dependencies.length === old.dependencies.length && dependencies.every((value, i) => Object.is(value, old.dependencies[i]))) return;
      const slot = { dependencies }; slots[index] = slot;
      pendingEffects.push(() => { old?.cleanup?.(); slot.cleanup = effect(); });
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, due: fixture.now + delay }); scheduled.push({ id, delay });
      return id;
    },
    clearTimeout(id) { cleared.push(id); timers.delete(id); },
  };
  const fixtureKey = `__reviewActivityTimeUI${++fixtureId}`;
  globalThis[fixtureKey] = fixture;
  let Component;
  try {
    const code = `
      import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
      import { formatReviewActivityTime } from ${JSON.stringify(new URL('../src/lib/reviewActivityTime.js', import.meta.url).href)};
      import { normalizeReviewActivityTimeZone } from ${JSON.stringify(new URL('../src/lib/reviewActivityZone.js', import.meta.url).href)};
      const fixture = globalThis[${JSON.stringify(fixtureKey)}];
      const React = { ...ActualReact, useState: fixture.useState, useEffect: fixture.useEffect };
      const Date = { now: () => fixture.now };
      const { setTimeout, clearTimeout } = fixture;
      ${source.replace(/^import[^\n]+\n/gm, '')}
    `;
    Component = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  } finally { delete globalThis[fixtureKey]; }

  const render = (nextProps = {}) => {
    assert.ok(mounted, 'cannot render an unmounted timestamp');
    props = { ...props, ...nextProps };
    let passes = 0;
    do {
      assert.ok(++passes < 10, 'effects must settle without a render loop');
      dirty = false; cursor = 0; pendingEffects = [];
      tree = Component(props);
      for (const effect of pendingEffects) effect();
    } while (dirty);
    return tree;
  };
  const unmount = () => {
    for (const slot of slots) slot?.cleanup?.();
    slots = []; mounted = false;
  };
  return {
    render, timers, cleared, scheduled, unmount,
    advance(milliseconds) {
      const target = fixture.now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next;
        fixture.now = timer.due; timers.delete(id); timer.callback();
        if (mounted && dirty) render();
      }
      fixture.now = target;
      return tree;
    },
  };
}

test('activity time renders the real timestamp, localized precise title and relative label on first mount', async () => {
  const h = await harness({ now: origin + 5 * 60000 });
  const tree = h.render(), expected = formatReviewActivityTime({ createdAt: timestamp }, { now: origin + 5 * 60000 });
  assert.equal(tree.type, 'time'); assert.equal(tree.props.children, '5分钟前');
  assert.equal(tree.props.dateTime, timestamp); assert.equal(tree.props.title, expected.title);
  assert.equal(tree.props['aria-label'], `5分钟前 · ${expected.title}`);
  assert.equal(h.timers.size, 1); assert.deepEqual(h.scheduled.map(item => item.delay), [60000]);
  h.unmount();
});

test('one minute timer automatically advances the visible label and keeps only one scheduled tick', async () => {
  const h = await harness();
  assert.equal(h.render().props.children, '刚刚');
  assert.equal(h.advance(59999).props.children, '刚刚');
  assert.equal(h.advance(1).props.children, '1分钟前');
  assert.equal(h.advance(60000).props.children, '2分钟前');
  assert.equal(h.advance(58 * 60000).props.children, '1小时前');
  assert.equal(h.timers.size, 1);
  const count = h.scheduled.length;
  h.render({ language: 'en' });
  assert.equal(h.scheduled.length, count, 'a language-only rerender must not restart the timer');
  assert.equal(h.render().props.children, '1 hour ago');
  h.unmount();
});

test('changing createdAt clears the old timer and starts one timer for the new record', async () => {
  const h = await harness(); h.render();
  const oldTimer = [...h.timers.keys()][0]; h.advance(30000);
  const later = '2026-11-08T01:00:30Z';
  assert.equal(h.render({ createdAt: later }).props.children, '刚刚');
  assert.ok(h.cleared.includes(oldTimer)); assert.equal(h.timers.has(oldTimer), false); assert.equal(h.timers.size, 1);
  const newTimer = [...h.timers.keys()][0]; assert.notEqual(newTimer, oldTimer);
  assert.equal(h.advance(30000).props.children, '刚刚');
  assert.ok(h.timers.has(newTimer), 'the cleared old deadline must not run the new timer early');
  const updated = h.advance(30000);
  assert.equal(updated.props.children, '1分钟前'); assert.equal(updated.props.dateTime, later);
  h.unmount(); assert.equal(h.timers.size, 0);
});

test('unmount clears a live timer and later clock advances schedule nothing', async () => {
  const h = await harness(); h.render(); h.advance(60000);
  const liveTimer = [...h.timers.keys()][0], scheduled = h.scheduled.length;
  h.unmount(); assert.ok(h.cleared.includes(liveTimer)); assert.equal(h.timers.size, 0);
  h.advance(3600000); assert.equal(h.scheduled.length, scheduled); assert.equal(h.timers.size, 0);
});

test('date-only and invalid timestamp records use calendar checks and never invent a time', async () => {
  for (const createdAt of [undefined, '2026-11-07', '2026-11-07T23:00:00', '2026-02-30T01:00:00Z']) {
    const h = await harness({ createdAt, date: '2026-11-07' });
    const tree = h.render(); assert.equal(tree.props.children, '11月7日');
    assert.equal(tree.props.dateTime, '2026-11-07'); assert.equal(tree.props.title, '2026-11-07');
    assert.match(tree.props['aria-label'], /2026-11-07/);
    assert.equal(h.timers.size, 1); assert.ok(h.scheduled[0].delay > 60000);
    h.unmount();
  }
  const h = await harness(); h.render(); const previous = [...h.timers.keys()][0];
  assert.equal(h.render({ createdAt: undefined, date: '2026-11-06' }).props.children, '11月6日');
  assert.ok(h.cleared.includes(previous)); assert.equal(h.timers.size, 1);
  const empty = h.render({ date: 'not-a-date' });
  assert.equal(h.timers.size, 0);
  assert.equal(empty.props.children, '—'); assert.equal(empty.props.dateTime, undefined); assert.equal(empty.props.title, undefined);
  h.unmount();
});

test('a mounted activity changes from three days ago to a calendar date at 96 hours', async () => {
  const day = 86400000;
  const h = await harness({ createdAt: timestamp, activityTimeZone: 'Asia/Shanghai', now: origin + 4 * day - 60000 });
  assert.equal(h.render().props.children, '3天前');
  assert.equal(h.advance(59999).props.children, '3天前');
  const atThreshold = h.advance(1);
  assert.equal(atThreshold.props.children, '11月8日');
  assert.equal(atThreshold.props.dateTime, timestamp);
  h.unmount();
});

test('an old activity gains its publication year when New Year begins for its author', async () => {
  const createdAt = '2026-12-20T20:00:00Z';
  const h = await harness({ createdAt, activityTimeZone: 'Asia/Shanghai', now: Date.parse('2026-12-31T15:59:00Z') });
  assert.equal(h.render().props.children, '12月21日');
  assert.equal(h.advance(60000).props.children, '2026年12月21日');
  h.unmount();
});

test('a date-only post adds its year at the author’s midnight, then stops checking', async () => {
  const h = await harness({
    createdAt: undefined, date: '2026-04-20', activityTimeZone: 'Asia/Kathmandu',
    now: Date.parse('2026-12-31T18:14:59.875Z'),
  });
  assert.equal(h.render().props.children, '4月20日');
  assert.equal(h.scheduled[0].delay, 125);
  assert.equal(h.advance(124).props.children, '4月20日');
  assert.equal(h.advance(1).props.children, '2026年4月20日');
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test('past-year calendar dates start no timer and unmount clears a pending calendar check', async () => {
  const h = await harness({ createdAt: undefined, date: '2025-05-20', activityTimeZone: 'UTC' });
  assert.equal(h.render().props.children, '2025年5月20日');
  assert.equal(h.scheduled.length, 0);
  assert.equal(h.render({ date: '2026-05-20' }).props.children, '5月20日');
  assert.equal(h.scheduled[0].delay, 23 * 3600000);
  h.unmount(); assert.equal(h.timers.size, 0);
  h.advance(86400000); assert.equal(h.scheduled.length, 1);
});
