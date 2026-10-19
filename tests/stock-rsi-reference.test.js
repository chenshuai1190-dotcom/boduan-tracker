import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const sourceUrl = new URL('../src/components/StockRsiReference.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
const transformed = await transformWithOxc(source, 'StockRsiReference.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/(from\s+)(['"])([^'"]+)\2/g,
  (_, prefix, _quote, path) => `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, sourceUrl).href : import.meta.resolve(path))}`);
const { default: StockRsiReference, getStockRsiReferenceState: stateOf } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const observation = Object.freeze({ value: 83.6123, asOf: '2026-10-02', previousValue: 78.1, previousAsOf: '2026-10-01' });
const render = (patch = {}, props = {}) => renderToStaticMarkup(React.createElement(StockRsiReference,
  { symbol: 'META', observation: { ...observation, ...patch }, ...props }));

test('stock reference uses exact 15/20/30 boundaries and shared 70/80 trend states without rounded comparisons', () => {
  for (const [value, status] of [[0, 'panic-oversold'], [14.99999, 'panic-oversold'], [15, 'panic-oversold'],
    [15.00001, 'extremely-oversold'], [19.99999, 'extremely-oversold'], [20, 'extremely-oversold'],
    [20.00001, 'oversold'], [30, 'oversold'], [30.00001, 'normal'],
    [69.99999, 'normal'], [70, 'overbought'], [79.99999, 'overbought'], [80, 'strongly-overbought'], [100, 'strongly-overbought']]) {
    const state = stateOf({ ...observation, value });
    assert.equal(state.status, status);
    assert.equal(state.value, value);
  }
  assert.match(render(), /data-status="strongly-overbought"/);
  assert.match(render(), /强超买/);
  assert.match(render(), /title="83.6123">83\.61</);
});

test('panic oversold is localized for both trade sides and alerts without replacing the RSI number', () => {
  for (const side of ['buy', 'sell']) {
    for (const englishMode of [false, true]) {
      const html = render({ value: 14.8765 }, { side, englishMode });
      assert.match(html, /data-status="panic-oversold"/);
      assert.ok(html.includes(englishMode ? '>Panic oversold<' : '>恐慌超卖<'));
      assert.match(html, /class="tqqq-rsi-reference-value" title="14\.8765">14\.88</);
      assert.match(html, /tqqq-rsi-reference-dot[^>]*style="left:14\.8765%"/);
      assert.match(html, /class="tqqq-rsi-reference-alert-dot" aria-hidden="true"/);
      assert.ok(html.includes(englishMode ? 'Oversold ≤30' : '超卖 ≤30'));
      assert.ok(html.includes(englishMode ? 'Overbought ≥70 · Strong ≥80' : '超买 ≥70 · 强超买 ≥80'));
    }
  }
  const justAbove = render({ value: 15.00001 });
  assert.match(justAbove, /title="15\.00001">15\.0</);
  assert.match(justAbove, /data-status="extremely-oversold"/);
  assert.doesNotMatch(justAbove, /恐慌超卖|tqqq-rsi-reference-alert-dot/);
  for (const value of [20, 30, 45, 75, 85, null]) {
    assert.doesNotMatch(render({ value }), /tqqq-rsi-reference-alert-dot/);
  }
});

test('stock reference labels follow the symbol and language while retaining a dated observation', () => {
  const html = render({}, { symbol: 'BRK-B', side: 'sell', englishMode: true });
  assert.match(html, /BRK-B sell RSI\(6\) reference/);
  assert.match(html, /BRK-B · RSI\(6\)/);
  assert.match(html, /Strongly overbought/);
  assert.match(html, /Prior 78\.1/);
  assert.match(html, /<time dateTime="2026-10-02">2026-10-02<\/time>/);
  assert.doesNotMatch(html, /TQQQ|买入|卖出|收盘|暂无|<input|<button/);
  assert.match(render({ value: 20 }), />极端超卖</);
  assert.match(render({ value: 20.00001 }), />超卖</);
  assert.match(render({ value: 45 }), />正常</);
  assert.match(render({ value: 75 }), />超买</);
});

test('extreme oversold is localized for either trade side and retains the original RSI and compact scale', () => {
  for (const side of ['buy', 'sell']) {
    for (const englishMode of [false, true]) {
      const html = render({ value: 19.8765 }, { side, englishMode });
      assert.match(html, /data-status="extremely-oversold"/);
      assert.ok(html.includes(englishMode ? '>Extremely oversold<' : '>极端超卖<'));
      assert.match(html, /class="tqqq-rsi-reference-value" title="19\.8765">19\.88</);
      assert.match(html, /tqqq-rsi-reference-dot[^>]*style="left:19\.8765%"/);
      assert.match(html, /tqqq-rsi-reference-boundary[^>]*style="left:20%"/);
      assert.match(html, /<span style="left:20%">20<\/span>/);
      assert.ok(html.includes(englishMode ? 'Oversold ≤30' : '超卖 ≤30'));
      assert.ok(html.includes(englishMode ? 'Overbought ≥70 · Strong ≥80' : '超买 ≥70 · 强超买 ≥80'));
    }
  }
  const justAbove = render({ value: 20.00001 });
  assert.match(justAbove, /title="20\.00001">20\.0</);
  assert.match(justAbove, /data-status="oversold"/);
  assert.doesNotMatch(justAbove, /极端超卖/);
});

test('low RSI alerts require a valid current observation and do not add 15 or 20 crossing signals', () => {
  for (const asOf of [null, '', '2026-02-30']) {
    const html = render({ value: 15, asOf });
    assert.equal(stateOf({ ...observation, value: 15, asOf }).status, 'unavailable');
    assert.doesNotMatch(html, /恐慌超卖|极端超卖|tqqq-rsi-reference-(?:alert-)?dot/);
  }
  for (const [previousValue, value, status] of [
    [null, 15, 'panic-oversold'], [16, 15, 'panic-oversold'], [14, 16, 'extremely-oversold'],
    [null, 20, 'extremely-oversold'], [19, 20, 'extremely-oversold'], [21, 20, 'extremely-oversold'],
  ]) {
    const state = stateOf({ ...observation, value, previousValue });
    assert.equal(state.status, status);
    assert.equal(state.crossing, null);
  }
});

test('missing current RSI stays unknown and missing or gapped previous RSI never implies a crossing', () => {
  for (const value of [null, undefined, '', '83.6', NaN, Infinity, -1, 101]) {
    const html = render({ value });
    assert.equal(stateOf({ ...observation, value }).status, 'unavailable');
    assert.match(html, /tqqq-rsi-reference-value[^>]*>—</);
    assert.doesNotMatch(html, /恐慌超卖|极端超卖|tqqq-rsi-reference-(?:alert-)?dot|<time|→/);
  }
  for (const patch of [{ previousValue: null }, { previousAsOf: '2026-09-30' }, { previousAsOf: '2026-10-05' }]) {
    const state = stateOf({ ...observation, value: 32, previousValue: 27, ...patch });
    assert.equal(state.value, 32);
    assert.equal(state.previousValue, null);
    assert.equal(state.crossing, null);
  }
  assert.equal(stateOf({ value: 32, previousValue: 27, previousAsOf: '2026-10-02', asOf: '2026-10-05' }).crossing, 'above-30');
  assert.match(render({ value: null }, { loading: true, unavailableLabel: '正在读取收盘数据' }), /aria-busy="true"/);
});
