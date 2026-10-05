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

test('stock reference uses the exact 30 boundary and shared 70/80 trend states without rounded comparisons', () => {
  for (const [value, status] of [[0, 'oversold'], [30, 'oversold'], [30.00001, 'normal'],
    [69.99999, 'normal'], [70, 'overbought'], [79.99999, 'overbought'], [80, 'strongly-overbought'], [100, 'strongly-overbought']]) {
    const state = stateOf({ ...observation, value });
    assert.equal(state.status, status);
    assert.equal(state.value, value);
  }
  assert.match(render(), /data-status="strongly-overbought"/);
  assert.match(render(), /强超买/);
  assert.match(render(), /title="83.6123">83\.61</);
});

test('stock reference labels follow the symbol and language while retaining a dated observation', () => {
  const html = render({}, { symbol: 'BRK-B', side: 'sell', englishMode: true });
  assert.match(html, /BRK-B sell RSI\(6\) reference/);
  assert.match(html, /BRK-B · RSI\(6\)/);
  assert.match(html, /Strongly overbought/);
  assert.match(html, /Prior 78\.1/);
  assert.match(html, /<time dateTime="2026-10-02">2026-10-02<\/time>/);
  assert.doesNotMatch(html, /TQQQ|买入|卖出|收盘|暂无|<input|<button/);
  assert.match(render({ value: 20 }), />超卖</);
  assert.match(render({ value: 45 }), />正常</);
  assert.match(render({ value: 75 }), />超买</);
});

test('missing current RSI stays unknown and missing or gapped previous RSI never implies a crossing', () => {
  for (const value of [null, undefined, '', '83.6', NaN, Infinity, -1, 101]) {
    const html = render({ value });
    assert.equal(stateOf({ ...observation, value }).status, 'unavailable');
    assert.match(html, /tqqq-rsi-reference-value[^>]*>—</);
    assert.doesNotMatch(html, /tqqq-rsi-reference-dot|<time|→/);
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
