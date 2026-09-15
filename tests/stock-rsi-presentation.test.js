import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { stockRsiPresentation } from '../src/lib/stockRsiPresentation.js';
import { isStockRsiLifecycleSignal } from '../src/lib/stockRsiSignal.js';
import { lifecycleSignal } from './fixtures/stock-rsi-lifecycle.js';

const page = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const start = page.indexOf('<div className="stock-report-rsi-metric"');
const end = page.indexOf('\n        </div>\n\n        <div className="stock-report-ma-assessment"', start);
assert.ok(start >= 0 && end > start);
const metricJsx = page.slice(start, end).trim();
const transformed = await transformWithOxc(`import React from ${JSON.stringify(import.meta.resolve('react'))};
export default function Metric({ rsiSignal, rsiDisplay, language }) { const NUMBER_FONT = 'system-ui'; return (${metricJsx}); }`, 'Metric.jsx', { jsx: { runtime: 'classic' } });
const { default: Metric } = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);
const render = (signal, language = 'zh') => renderToStaticMarkup(React.createElement(Metric, {
  rsiSignal: signal, rsiDisplay: stockRsiPresentation(signal, language === 'en'), language,
}));
const plain = html => html.replace(/<[^>]+>/g, '');

function invalidatedAfterConfirmation(strength = 'BASIC') {
  const signal = lifecycleSignal('INVALIDATED', { value: 76.2 });
  signal.divergenceConfirmationStrength = strength;
  signal.divergenceDate = '2026-09-10';
  Object.assign(signal.divergenceEvent, { confirmedAt: '2026-09-09', invalidatedAt: '2026-09-10', maxDrawdownPct: 4 });
  return signal;
}

test('the actual stock-trend RSI markup always renders its number, zone and lifecycle field', () => {
  for (const [state, value, expected] of [
    ['FORMING', 83.6, '超买·顶背离形成'],
    ['CONFIRMED', 67.2, '中性·顶背离确认'],
    ['REALIZED', 30.3, '中性·顶背离已兑现'],
    ['INVALIDATED', 87, '超买·顶背离失效'],
    ['NONE', 52.4, '中性·动量正常'],
    ['NONE', 18.7, '超卖·动量正常'],
  ]) {
    const signal = lifecycleSignal(state, { value });
    assert.equal(isStockRsiLifecycleSignal(signal), true);
    const html = render(signal);
    assert.equal((html.match(/data-watchlist-rsi-divergence=/g) || []).length, 1);
    assert.equal((html.match(/class="stock-report-rsi-status"/g) || []).length, 1);
    assert.equal(plain(html), `RSI(6)${value.toFixed(1)}${expected}`);
    assert.doesNotMatch(html, /无顶背离|严重超买/);
  }
});

test('missing or old lifecycle metadata retains the fixed fields without inventing normal momentum', () => {
  assert.equal(plain(render(null)), 'RSI(6)——·—');
  const old = { period: 6, value: 30.3, asOf: '2026-09-11', priceBasis: 'adjusted_close', bearishDivergence: 'confirmed', divergenceDate: '2026-09-10' };
  assert.equal(plain(render(old)), 'RSI(6)30.3中性·—');
  assert.equal(isStockRsiLifecycleSignal(old), false);
  assert.equal(plain(render(lifecycleSignal(null, { value: 30.3 }))), 'RSI(6)30.3中性·—');
  assert.equal(isStockRsiLifecycleSignal(lifecycleSignal(null, { value: null, asOf: null })), true);
  const oldLifecycle = lifecycleSignal('CONFIRMED', { divergenceVersion: 'rsi6-lifecycle-v2' });
  assert.equal(isStockRsiLifecycleSignal(oldLifecycle), false, 'v2 confirmation semantics must not survive the version change');
  assert.equal(stockRsiPresentation(oldLifecycle).momentumLabel, '—');
});

test('the actual stock-trend markup shows invalidated after either historical confirmation strength', () => {
  for (const strength of ['BASIC', 'STRONG']) {
    const signal = invalidatedAfterConfirmation(strength);
    const original = structuredClone(signal);
    assert.equal(isStockRsiLifecycleSignal(signal), true);
    const html = render(signal);
    assert.equal(plain(html), 'RSI(6)76.2中性·顶背离失效');
    assert.match(html, /data-watchlist-rsi-divergence="invalidated"/);
    assert.doesNotMatch(plain(html), /顶背离确认/);
    assert.equal(stockRsiPresentation(signal, true).momentumLabel, 'Divergence invalidated');
    assert.deepEqual(signal, original, 'displaying the current state must retain confirmation history');
  }
  const sameDay = invalidatedAfterConfirmation();
  sameDay.divergenceEvent.confirmedAt = sameDay.divergenceEvent.invalidatedAt;
  assert.equal(isStockRsiLifecycleSignal(sameDay), true, 'same-day observable confirmation and invalidation have ordered equal dates');
  assert.equal(isStockRsiLifecycleSignal(lifecycleSignal('INVALIDATED')), true, 'direct forming invalidation still has no confirmation history');
});

test('invalidation rejects reversed history, dual terminal states and inconsistent confirmation strength', () => {
  const changes = [
    signal => { signal.divergenceEvent.confirmedAt = '2026-09-11'; },
    signal => { signal.divergenceEvent.invalidatedAt = '2026-09-08'; signal.divergenceDate = '2026-09-08'; },
    signal => { signal.divergenceEvent.realizedAt = '2026-09-10'; },
    signal => { signal.divergenceEvent.invalidatedAt = null; },
    signal => { signal.divergenceEvent.confirmedAt = null; },
    signal => { delete signal.divergenceEvent.confirmedAt; },
    signal => { signal.divergenceConfirmationStrength = null; },
    signal => { signal.divergenceConfirmationStrength = 'FORMING'; },
    signal => { delete signal.divergenceConfirmationStrength; },
    signal => { signal.divergenceDate = signal.divergenceEvent.confirmedAt; },
  ];
  for (const change of changes) {
    const signal = invalidatedAfterConfirmation();
    change(signal);
    assert.equal(isStockRsiLifecycleSignal(signal), false);
    assert.equal(stockRsiPresentation(signal).momentumLabel, '—');
  }
});

test('RSI zone thresholds do not round early or introduce a fourth zone', () => {
  for (const [value, expected] of [[20, '超卖'], [20.001, '中性'], [79.999, '中性'], [80, '超买'], [100, '超买']]) {
    assert.equal(stockRsiPresentation(lifecycleSignal('NONE', { value })).zoneLabel, expected);
  }
  for (const state of ['NONE', 'FORMING', 'CONFIRMED', 'REALIZED', 'INVALIDATED']) {
    assert.doesNotMatch(plain(render(lifecycleSignal(state), 'en')), /[\u3400-\u9fff]/);
  }
});

test('lifecycle metadata rejects conflicting stages, future dates and malformed event evidence', () => {
  const changes = [
    signal => { signal.divergenceVersion = 'old'; },
    signal => { signal.divergenceEvent.high1.date = signal.divergenceEvent.high2.date; },
    signal => { signal.divergenceEvent.high2.price = signal.divergenceEvent.high1.price; },
    signal => { signal.divergenceEvent.high2.rsi = signal.divergenceEvent.high1.rsi; },
    signal => { signal.divergenceEvent.high2.price = '220'; },
    signal => { signal.divergenceEvent.formedAt = signal.divergenceEvent.high2.date; },
    signal => { signal.divergenceEvent.confirmedAt = '2026-09-12'; },
    signal => { signal.divergenceEvent.realizedAt = '2026-09-08'; },
    signal => { signal.divergenceEvent.invalidatedAt = '2026-09-10'; },
    signal => { signal.divergenceEvent.maxDrawdownPct = NaN; },
    signal => { signal.divergenceConfirmationStrength = null; },
    signal => { signal.divergenceDate = '2026-09-11'; },
  ];
  for (const change of changes) {
    const signal = lifecycleSignal('REALIZED');
    change(signal);
    assert.equal(isStockRsiLifecycleSignal(signal), false);
    assert.equal(stockRsiPresentation(signal).momentumLabel, '—');
    assert.equal(stockRsiPresentation(signal).available, true, 'valid RSI is independent of unavailable lifecycle evidence');
  }
  assert.equal(isStockRsiLifecycleSignal(lifecycleSignal('NONE'), { asOf: '2026-09-12' }), false);
  assert.equal(isStockRsiLifecycleSignal(lifecycleSignal('NONE', { divergenceEvent: lifecycleSignal('FORMING').divergenceEvent })), false);
});
