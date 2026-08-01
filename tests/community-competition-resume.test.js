import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindCommunityCompetitionResume,
  COMMUNITY_COMPETITION_PUBLICATION_EVENT,
} from '../src/lib/communityCompetitionResume.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    [...(this.listeners.get(type) || [])].forEach((listener) => listener({ type, ...event }));
  }
}

class FakeClock {
  constructor(now = 0) {
    this.nowMs = now;
    this.nextId = 1;
    this.timers = new Map();
  }

  now = () => this.nowMs;

  setTimeout = (callback, delay = 0) => this.addTimer(callback, delay, 0);

  clearTimeout = (timerId) => this.timers.delete(timerId);

  setInterval = (callback, delay = 0) => this.addTimer(callback, delay, Math.max(1, Number(delay) || 0));

  clearInterval = (timerId) => this.timers.delete(timerId);

  addTimer(callback, delay, interval) {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, {
      callback,
      at: this.nowMs + Math.max(0, Number(delay) || 0),
      interval,
    });
    return id;
  }

  advance(milliseconds) {
    const target = this.nowMs + Math.max(0, Number(milliseconds) || 0);
    let guard = 0;
    while (guard < 10_000) {
      guard += 1;
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.nowMs = timer.at;
      if (timer.interval > 0) timer.at += timer.interval;
      else this.timers.delete(id);
      timer.callback();
    }
    assert.ok(guard < 10_000, 'fake clock should not spin forever');
    this.nowMs = target;
  }
}

function createHarness({ hidden = false, online = true, now = 1000, heartbeatMs = 0 } = {}) {
  const clock = new FakeClock(now);
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  windowTarget.navigator = { onLine: online };
  documentTarget.hidden = hidden;
  documentTarget.visibilityState = hidden ? 'hidden' : 'visible';
  const calls = [];
  const cleanup = bindCommunityCompetitionResume({
    windowTarget,
    documentTarget,
    onVisibleRecheck: (trigger) => calls.push(trigger),
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
    heartbeatMs,
  });
  return { calls, cleanup, clock, documentTarget, windowTarget };
}

test('a hidden iOS pageshow waits briefly for visibility instead of losing the resume', () => {
  const harness = createHarness({ hidden: true });
  harness.windowTarget.dispatch('pageshow');
  harness.documentTarget.dispatch('visibilitychange');
  assert.deepEqual(harness.calls, []);

  harness.clock.advance(120);
  assert.deepEqual(harness.calls, []);
  harness.documentTarget.hidden = false;
  harness.documentTarget.visibilityState = 'visible';
  harness.clock.advance(120);
  assert.deepEqual(harness.calls, ['pageshow']);
  harness.cleanup();
});

test('the visible heartbeat stays idle while hidden and resumes only after visibility returns', () => {
  const harness = createHarness({ hidden: true, heartbeatMs: 1000 });
  harness.clock.advance(3000);
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.clock.timers.size, 1, 'hidden heartbeat must not create visibility retry timers');

  harness.documentTarget.hidden = false;
  harness.documentTarget.visibilityState = 'visible';
  harness.clock.advance(1000);
  assert.deepEqual(harness.calls, ['visible-heartbeat']);
  harness.cleanup();
});

test('focus, online, pointer, touch, pageshow, and visibility can recheck a visible competition page', () => {
  const harness = createHarness();
  const events = ['focus', 'online', 'pointerdown', 'touchstart', 'pageshow'];
  events.forEach((eventType) => {
    harness.windowTarget.dispatch(eventType);
    harness.clock.advance(1200);
  });
  harness.documentTarget.dispatch('visibilitychange');
  assert.deepEqual(harness.calls, [...events, 'visibilitychange']);
  harness.cleanup();
});

test('an iOS resume event burst is locally deduplicated before cache evaluation', () => {
  const harness = createHarness();
  ['pageshow', 'focus', 'online', 'pointerdown', 'touchstart'].forEach((eventType) => {
    harness.windowTarget.dispatch(eventType);
  });
  assert.deepEqual(harness.calls, ['pageshow']);

  harness.clock.advance(1199);
  harness.windowTarget.dispatch('focus');
  assert.equal(harness.calls.length, 1);
  harness.clock.advance(1);
  harness.windowTarget.dispatch('focus');
  assert.deepEqual(harness.calls, ['pageshow', 'focus']);
  harness.cleanup();
});

test('same-tab and cross-tab publication signals bypass resume dedupe', () => {
  const harness = createHarness();
  harness.windowTarget.dispatch('focus');
  harness.windowTarget.dispatch(COMMUNITY_COMPETITION_PUBLICATION_EVENT);
  harness.windowTarget.dispatch('storage', { key: 'unrelated_key' });
  harness.windowTarget.dispatch('storage', {
    key: 'bottomline_community_competition_publication_v1__user_user-a',
  });
  assert.deepEqual(harness.calls, ['focus', 'publication', 'publication-storage']);
  harness.cleanup();
});

test('the delayed visibility retry evaluates the current period rather than the hidden-time period', () => {
  const clock = new FakeClock(1000);
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  windowTarget.navigator = { onLine: true };
  documentTarget.hidden = true;
  documentTarget.visibilityState = 'hidden';
  let activePeriod = 'day';
  const periods = [];
  const cleanup = bindCommunityCompetitionResume({
    windowTarget,
    documentTarget,
    onVisibleRecheck: () => periods.push(activePeriod),
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
    heartbeatMs: 0,
  });

  windowTarget.dispatch('pageshow');
  activePeriod = 'week';
  documentTarget.hidden = false;
  documentTarget.visibilityState = 'visible';
  clock.advance(120);
  assert.deepEqual(periods, ['week']);
  cleanup();
});

test('a stale offline hint never blocks iOS resume cache evaluation', () => {
  const harness = createHarness({ online: false });
  harness.windowTarget.dispatch('pageshow');
  harness.windowTarget.dispatch('focus');
  harness.windowTarget.dispatch('touchstart');
  assert.deepEqual(harness.calls, ['pageshow']);

  harness.windowTarget.navigator.onLine = true;
  harness.clock.advance(1200);
  harness.windowTarget.dispatch('online');
  assert.deepEqual(harness.calls, ['pageshow', 'online']);
  harness.cleanup();
});

test('cleanup removes resume listeners and pending timers', () => {
  const harness = createHarness({ hidden: true, heartbeatMs: 1000 });
  harness.windowTarget.dispatch('pageshow');
  harness.cleanup();
  harness.documentTarget.hidden = false;
  harness.documentTarget.visibilityState = 'visible';
  harness.clock.advance(10_000);
  harness.windowTarget.dispatch('focus');
  harness.windowTarget.dispatch('online');
  harness.windowTarget.dispatch(COMMUNITY_COMPETITION_PUBLICATION_EVENT);
  harness.windowTarget.dispatch('storage', {
    key: 'bottomline_community_competition_publication_v1__user_user-a',
  });
  harness.documentTarget.dispatch('visibilitychange');
  assert.deepEqual(harness.calls, []);
});
