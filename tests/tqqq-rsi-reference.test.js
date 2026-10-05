import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const sourceUrl = new URL('../src/components/TqqqRsiReference.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const transformed = await transformWithOxc(source, 'TqqqRsiReference.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/import\s*(['"])\.\/TqqqRsiReference\.css\1;?/g, '')
  .replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) => `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, sourceUrl).href : import.meta.resolve(path))}`);
const { default: TqqqRsiReference, getTqqqRsiReferenceState: stateOf } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const observation = Object.freeze({ value: 28.6, asOf: '2026-10-02', previousValue: 31.4, previousAsOf: '2026-10-01' });
const render = (overrides = {}, props = {}) => renderToStaticMarkup(React.createElement(TqqqRsiReference, { observation: { ...observation, ...overrides }, ...props }));

test('reference thresholds include 30 and 70 and retain the supplied RSI without recalculating it', () => {
  for (const [value, expected] of [[0, 'buy-watch'], [30, 'buy-watch'], [30.01, 'neutral'], [69.99, 'neutral'], [70, 'sell-watch'], [100, 'sell-watch']]) {
    const state = stateOf({ ...observation, value });
    assert.equal(state.status, expected);
    assert.equal(state.value, value);
  }
  assert.deepEqual(observation, { value: 28.6, asOf: '2026-10-02', previousValue: 31.4, previousAsOf: '2026-10-01' });
});

test('only finite numeric RSI in range with a real ISO date is displayed', () => {
  for (const value of [null, undefined, '', '28.6', NaN, Infinity, -Infinity, -0.01, 100.01]) {
    assert.equal(stateOf({ ...observation, value }).status, 'unavailable');
    const html = render({ value });
    assert.match(html, /暂无数据/);
    assert.match(html, /tqqq-rsi-reference-value[^>]*>—</);
    assert.doesNotMatch(html, /tqqq-rsi-reference-dot|<time|→/);
  }
  for (const asOf of [null, '', '2026-02-30', '2026-13-02', '2026-10-2', '2026-10-02T16:00:00Z']) {
    assert.equal(stateOf({ ...observation, asOf }).status, 'unavailable');
  }
  assert.equal(stateOf(null).status, 'unavailable');
  assert.equal(stateOf({ value: 50, asOf: '2024-02-29' }).status, 'neutral');
});

test('return crossings require the previous side and strict movement beyond the threshold', () => {
  for (const [previousValue, value, crossing] of [[30, 30, null], [30, 30.01, 'above-30'], [27.8, 32.4, 'above-30'], [31, 32.4, null], [70, 70, null], [70, 69.99, 'below-70'], [73.1, 67.8, 'below-70'], [69, 67.8, null]]) {
    assert.equal(stateOf({ ...observation, value, previousValue }).crossing, crossing);
  }
});

test('missing, invalid, unordered and nonconsecutive previous observations never imply daily movement', () => {
  const current = { ...observation, value: 32.4, previousValue: 27.8 };
  for (const patch of [
    { previousValue: null }, { previousValue: NaN }, { previousValue: '27.8' }, { previousValue: 101 },
    { previousAsOf: undefined }, { previousAsOf: '2026-02-30' }, { previousAsOf: '2026-10-02' },
    { previousAsOf: '2026-10-05' }, { previousAsOf: '2026-09-30' },
  ]) {
    const state = stateOf({ ...current, ...patch });
    assert.equal(state.value, 32.4);
    assert.equal(state.previousValue, null);
    assert.equal(state.crossing, null);
    assert.doesNotMatch(render({ ...current, ...patch }), /→|重新站上/);
  }
});

test('adjacency crosses weekends and regular NYSE holidays but rejects non-session baselines', () => {
  for (const [previousAsOf, asOf] of [['2026-10-02', '2026-10-05'], ['2026-09-04', '2026-09-08'], ['2026-04-02', '2026-04-06']]) {
    assert.equal(stateOf({ value: 32.4, asOf, previousValue: 27.8, previousAsOf }).crossing, 'above-30');
  }
  for (const [previousAsOf, asOf] of [['2026-09-07', '2026-09-08'], ['2026-10-03', '2026-10-05'], ['2026-10-01', '2026-10-03']]) {
    assert.equal(stateOf({ value: 32.4, asOf, previousValue: 27.8, previousAsOf }).crossing, null);
  }
});

test('both languages display current region, directional crossing, thresholds and the supplied close date', () => {
  const buy = render();
  assert.match(buy, /买入观察/);
  assert.match(buy, /28\.6/);
  assert.match(buy, /上一日 31\.4/);
  assert.match(buy, /本次 28\.6/);
  assert.match(buy, /买入关注 ≤30/);
  assert.match(buy, /卖出关注 ≥70/);
  assert.match(buy, /<time dateTime="2026-10-02">2026-10-02<\/time>/);
  const recover = render({ value: 32.4, previousValue: 27.8 });
  assert.match(recover, /未进入参考区/);
  assert.match(recover, /重新站上 30/);
  assert.match(render({ value: 67.8, previousValue: 73.1 }), /重新跌回 70 以下/);
  const english = render({ value: 67.8, previousValue: 73.1 }, { side: 'sell', englishMode: true });
  assert.match(english, /TQQQ sell RSI\(6\) reference/);
  assert.match(english, /Outside watch zones/);
  assert.match(english, /Back below 70/);
  assert.match(english, /Prior 73\.1/);
  assert.match(english, /Buy watch ≤30/);
  assert.match(english, /data-selected="true">Sell watch ≥70/);
  assert.doesNotMatch(english, /买入|卖出|收盘|暂无/);
  assert.match(render({ value: null }, { englishMode: true }), /No data/);
});

test('the visual reference has no editable controls or market-data and ledger side effects', () => {
  const html = render();
  assert.doesNotMatch(html, /<(?:input|button|select|form)\b/);
  assert.doesNotMatch(source, /\b(?:fetch|localStorage|supabase|insertStockTrade|calculateRsi)\b/);
  assert.doesNotMatch(html, /最新|实时|fresh|live|建议买入|建议卖出/i);
  for (const value of [0, 100]) assert.match(render({ value }), new RegExp(`tqqq-rsi-reference-dot[^>]*style="left:${value}%"`));
});

test('loading, stale and historical states retain an unknown value without a fabricated threshold indicator', () => {
  for (const unavailableLabel of ['正在读取收盘数据', '历史参考暂不可用', '等待最新收盘数据']) {
    const html = render({ value: null }, { unavailableLabel, loading: unavailableLabel === '正在读取收盘数据' });
    assert.ok(html.includes(unavailableLabel));
    assert.match(html, /tqqq-rsi-reference-value[^>]*>—</);
    assert.doesNotMatch(html, /tqqq-rsi-reference-dot|买入观察|卖出观察|<time/);
  }
  assert.match(render({ value: null }, { loading: true }), /aria-busy="true"/);
});

test('the formal dialog uses authenticated production reference and confines design fixtures to development', () => {
  const tradesSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
  assert.match(tradesSource, /referenceContent=\{import\.meta\.env\.DEV && ctx\.tqqqRsiPreviewContent \? ctx\.tqqqRsiPreviewContent : \(/);
  assert.match(tradesSource, /<TqqqLiveRsiReference[\s\S]*?userId=\{ctx\.user\?\.id\}[\s\S]*?authClient=\{ctx\.supabase\?\.auth\}[\s\S]*?tradeDate=\{newTrade\.date\}/);
  assert.doesNotMatch(tradesSource, /import[^\n]+TqqqRsiDesignPreview/);
});

test('the formal trade panel keeps the optional reference slot separate from draft and save data', () => {
  const panelSource = readFileSync(new URL('../src/components/TqqqTradeEntryPanel.jsx', import.meta.url), 'utf8');
  assert.match(panelSource, /referenceContent = null/);
  assert.match(panelSource, /\{referenceContent\}/);
  assert.equal((panelSource.match(/referenceContent/g) || []).length, 2, 'reference content is only a defaulted prop and rendered node');
  assert.doesNotMatch(panelSource, /TqqqRsiReference|TqqqRsiDesignPreview|observation|previousAsOf/);
  assert.match(panelSource, /onDraftChange/);
});
