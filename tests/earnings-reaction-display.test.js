import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEarningsReactionDisplay } from '../src/lib/earningsReactionDisplay.js';

const ASML_EVENT = {
  symbol: 'ASML',
  reportDate: '2026-07-15',
  session: 'pre',
  epsActual: 7.58,
  marketReactionPercent: null,
};

function liveAsmlQuote(overrides = {}) {
  return {
    symbol: 'ASML',
    price: 1825.9492,
    previousClose: 1775.64,
    dailyBaselineClose: 1775.64,
    realtime: true,
    realtimeStatus: 'live',
    source: 'EODHD_WS_QUOTE',
    clientReceivedAt: Date.parse('2026-07-15T05:13:30Z'),
    ...overrides,
  };
}

test('earnings reaction shows a fresh same-day ASML WebSocket quote before the open', () => {
  const result = resolveEarningsReactionDisplay({
    event: ASML_EVENT,
    quote: liveAsmlQuote(),
    now: Date.parse('2026-07-15T05:14:00Z'),
  });

  assert.equal(result.mode, 'live-pre');
  assert.equal(result.locked, false);
  assert.equal(Math.round(result.percent * 100) / 100, 2.83);
});

test('official EOD reaction always overrides a live quote, including a valid zero', () => {
  const result = resolveEarningsReactionDisplay({
    event: { ...ASML_EVENT, marketReactionPercent: 0 },
    quote: liveAsmlQuote(),
    now: Date.parse('2026-07-15T05:14:00Z'),
  });

  assert.deepEqual(result, { mode: 'official-close', percent: 0, locked: true });
});

test('earnings reaction rejects stale, pre-resume, cross-day, and non-WebSocket quotes', () => {
  const now = Date.parse('2026-07-15T05:14:00Z');
  assert.equal(resolveEarningsReactionDisplay({
    event: ASML_EVENT,
    quote: liveAsmlQuote({ clientReceivedAt: now - 121_000 }),
    now,
  }).percent, null);
  assert.equal(resolveEarningsReactionDisplay({
    event: ASML_EVENT,
    quote: liveAsmlQuote(),
    now,
    freshnessStartedAt: now + 1,
  }).percent, null);
  assert.equal(resolveEarningsReactionDisplay({
    event: { ...ASML_EVENT, reportDate: '2026-07-14' },
    quote: liveAsmlQuote(),
    now,
  }).percent, null);
  assert.equal(resolveEarningsReactionDisplay({
    event: ASML_EVENT,
    quote: liveAsmlQuote({ realtime: false, source: 'EODHD-v2' }),
    now,
  }).percent, null);
});

test('earnings reaction waits for official close after the regular session starts and never uses post earnings live quotes', () => {
  assert.equal(resolveEarningsReactionDisplay({
    event: ASML_EVENT,
    quote: liveAsmlQuote({ clientReceivedAt: Date.parse('2026-07-15T14:00:00Z') }),
    now: Date.parse('2026-07-15T14:00:30Z'),
  }).percent, null);
  assert.equal(resolveEarningsReactionDisplay({
    event: { ...ASML_EVENT, session: 'post' },
    quote: liveAsmlQuote(),
    now: Date.parse('2026-07-15T05:14:00Z'),
  }).percent, null);
});
