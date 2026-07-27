import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRealtimeStartupTrace,
  REALTIME_STARTUP_TRACE_MAX_ENTRIES,
  REALTIME_STARTUP_TRACE_STORAGE_KEY,
} from '../src/lib/realtimeStartupTrace.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

test('startup trace records injected wall and monotonic clocks without sensitive context', () => {
  const storage = new MemoryStorage();
  let wallNow = 1_800_000_000_000;
  let monotonicNow = 250;
  const trace = createRealtimeStartupTrace({
    userId: 'user-a',
    storage,
    now: () => wallNow,
    performanceNow: () => monotonicNow,
  });

  const started = trace.startSession({
    runtime: 'ios_standalone',
    standalone: true,
    trigger: 'startup',
  });
  assert.equal(started.startedAt, wallNow);
  assert.equal(started.entries[0].name, 'session_start');
  assert.equal(started.entries[0].elapsedMs, 0);

  wallNow += 420;
  monotonicNow += 17.5;
  const mark = trace.mark('socket_open', {
    durationMs: 420,
    stream: 'stock',
    transport: 'websocket',
  });
  assert.deepEqual(mark, {
    name: 'socket_open',
    at: wallNow,
    elapsedMs: 17.5,
    fields: {
      durationMs: 420,
      stream: 'stock',
      transport: 'websocket',
    },
  });

  const latest = trace.readLatest();
  assert.equal(latest.entries.length, 2);
  assert.deepEqual(latest.entries[1], mark);
  assert.equal(JSON.stringify(latest).includes('user-a'), false);
});

test('startup traces are isolated by the existing user-scoped storage boundary', () => {
  const storage = new MemoryStorage();
  const userA = createRealtimeStartupTrace({
    userId: 'user-a',
    storage,
    now: () => 1000,
    performanceNow: () => 10,
  });
  const userB = createRealtimeStartupTrace({
    userId: 'user-b',
    storage,
    now: () => 2000,
    performanceNow: () => 20,
  });

  userA.startSession({ runtime: 'ios_standalone' });
  userA.mark('first_tick', { stream: 'quote', ageMs: 12 });
  userB.startSession({ runtime: 'browser' });
  userB.mark('startup_timeout', { reason: 'hard_timeout' });

  assert.equal(userA.readLatest().entries[1].name, 'first_tick');
  assert.equal(userB.readLatest().entries[1].name, 'startup_timeout');
  assert.notEqual(userA.readLatest().traceId, userB.readLatest().traceId);
  assert.equal(storage.values.size, 2);
  assert.ok([...storage.values.keys()].every((key) => key.startsWith(REALTIME_STARTUP_TRACE_STORAGE_KEY)));
});

test('starting a resume session replaces stale startup milestones with a new trace', () => {
  const storage = new MemoryStorage();
  let wallNow = 1_800_000_000_000;
  let monotonicNow = 250;
  const trace = createRealtimeStartupTrace({
    userId: 'user-a',
    storage,
    now: () => wallNow,
    performanceNow: () => monotonicNow,
  });

  const startup = trace.startSession({
    runtime: 'ios_standalone',
    standalone: true,
    trigger: 'startup',
  });
  trace.mark('first_tick', {
    stream: 'stock',
    transport: 'websocket',
  });

  wallNow += 15_000;
  monotonicNow += 15_000;
  const resume = trace.startSession({
    runtime: 'ios_standalone',
    standalone: true,
    trigger: 'resume',
  });

  assert.notEqual(resume.traceId, startup.traceId);
  assert.equal(resume.startedAt, wallNow);
  assert.deepEqual(resume.entries.map((entry) => entry.name), ['session_start']);
  assert.equal(resume.entries[0].fields.trigger, 'resume');
  assert.equal(trace.readLatest().traceId, resume.traceId);
});

test('trace rejects symbols, tokens, URLs, raw errors, arbitrary mark names, and free-form strings', () => {
  const storage = new MemoryStorage();
  const trace = createRealtimeStartupTrace({
    userId: 'user-a',
    storage,
    now: () => 1000,
    performanceNow: () => 10,
  });
  trace.startSession({ runtime: 'ios_standalone' });
  const before = [...storage.values.values()][0];

  assert.equal(trace.mark('NVDA', { success: true }), null);
  assert.equal(trace.mark('first_tick', { symbol: 'NVDA' }), null);
  assert.equal(trace.mark('auth_done', { token: 'secret-token' }), null);
  assert.equal(trace.mark('socket_open', { url: 'wss://example.test/private' }), null);
  assert.equal(trace.mark('startup_timeout', { rawError: 'private provider failure' }), null);
  assert.equal(trace.mark('relay_status', { status: 'NVDA' }), null);
  assert.equal(trace.mark('relay_status', { status: 'a'.repeat(100) }), null);
  assert.equal(trace.mark('relay_status', { statusCode: '200' }), null);

  const after = [...storage.values.values()][0];
  assert.equal(after, before);
  assert.equal(after.includes('NVDA'), false);
  assert.equal(after.includes('secret-token'), false);
  assert.equal(after.includes('example.test'), false);
  assert.equal(after.includes('private provider failure'), false);
});

test('trace keeps the session start and only the newest fixed number of marks', () => {
  const storage = new MemoryStorage();
  let clock = 0;
  const trace = createRealtimeStartupTrace({
    userId: 'user-a',
    storage,
    now: () => clock,
    performanceNow: () => clock,
  });
  trace.startSession();

  for (let attempt = 1; attempt <= REALTIME_STARTUP_TRACE_MAX_ENTRIES + 20; attempt += 1) {
    clock = attempt;
    trace.mark('relay_status', {
      attempt,
      status: attempt % 2 === 0 ? 'connecting' : 'live',
    });
  }

  const latest = trace.readLatest();
  assert.equal(latest.entries.length, REALTIME_STARTUP_TRACE_MAX_ENTRIES);
  assert.equal(latest.entries[0].name, 'session_start');
  assert.equal(latest.entries[1].fields.attempt, 22);
  assert.equal(latest.entries.at(-1).fields.attempt, REALTIME_STARTUP_TRACE_MAX_ENTRIES + 20);
});

test('trace fails closed for missing users, unavailable storage, and malformed persisted data', () => {
  const storage = new MemoryStorage();
  const missingUser = createRealtimeStartupTrace({ storage });
  assert.equal(missingUser.startSession(), null);
  assert.equal(missingUser.mark('first_tick'), null);
  assert.equal(missingUser.readLatest(), null);

  const memoryOnly = createRealtimeStartupTrace({
    userId: 'user-a',
    storage: null,
    now: () => 1000,
    performanceNow: () => 1,
  });
  memoryOnly.startSession({ runtime: 'server' });
  assert.equal(memoryOnly.readLatest().entries[0].name, 'session_start');

  const damagedStorage = new MemoryStorage();
  damagedStorage.setItem(
    `${REALTIME_STARTUP_TRACE_STORAGE_KEY}__user_user-a`,
    JSON.stringify({
      version: 1,
      traceId: 'rt_safe_1',
      startedAt: 1000,
      entries: [{
        name: 'first_tick',
        at: 1000,
        elapsedMs: 0,
        fields: { symbol: 'NVDA' },
      }],
    }),
  );
  const damaged = createRealtimeStartupTrace({
    userId: 'user-a',
    storage: damagedStorage,
  });
  assert.equal(damaged.readLatest(), null);
});
