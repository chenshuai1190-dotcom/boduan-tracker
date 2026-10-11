import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { MARKET_COLOR_MODES, MARKET_GREEN_HEX, MARKET_RED_HEX } from '../src/lib/marketColorMode.js';

const sourceUrl = new URL('../src/components/TradeOutcomeReview.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const transformed = await transformWithOxc(source, 'TradeOutcomeReview.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/import\s*(['"])\.\/TradeOutcomeReview\.css\1;?/g, '')
  .replace(/(from\s+)(['"])([^'"]+)\2/g, (_match, prefix, _quote, specifier) =>
    `${prefix}${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : import.meta.resolve(specifier))}`);
const { default: TradeOutcomeReview, TradeOutcomeReviewContent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const ready = { status: 'ready', tradeDate: '2026-09-01', asOfDate: '2026-10-09', stale: false,
  windows: [
    { days: 5, status: 'available', returnPct: 5, maxRisePct: 8, maxFallPct: -4 },
    { days: 20, status: 'pending', observedDays: 11 },
    { days: 60, status: 'missing_data' },
  ] };
const render = (props = {}) => renderToStaticMarkup(React.createElement(TradeOutcomeReviewContent, { model: ready, ...props }));

test('compact review labels price observations honestly and shows pending/data gaps without fake percentages', () => {
  const html = render();
  assert.match(html, /涨跌幅/);
  assert.match(html, /最大上涨/);
  assert.match(html, /最大下跌/);
  assert.match(html, /\+5\.00%/);
  assert.match(html, /\+8\.00%/);
  assert.match(html, /-4\.00%/);
  assert.match(html, /已观察 11 \/ 20 日/);
  assert.match(html, /收盘数据不完整/);
  assert.match(html, /非成交盈亏/);
  assert.match(html, /按每日收盘计算/);
  assert.match(html, /数据截至 2026-10-09/);
  assert.doesNotMatch(html, /胜率|卖飞|买对|浮盈/);
});

test('both market color modes keep the system red and green', () => {
  for (const mode of Object.values(MARKET_COLOR_MODES)) {
    const html = render({ marketColorMode: mode });
    const up = mode === MARKET_COLOR_MODES.RED_UP_GREEN_DOWN ? MARKET_RED_HEX : MARKET_GREEN_HEX;
    const down = mode === MARKET_COLOR_MODES.RED_UP_GREEN_DOWN ? MARKET_GREEN_HEX : MARKET_RED_HEX;
    assert.ok(html.includes(`style="color:${up}">+5.00%`));
    assert.ok(html.includes(`style="color:${down}">-4.00%`));
  }
});

test('trade note remains plain escaped user text; English and stale state are complete', () => {
  const html = render({ model: { ...ready, stale: true }, language: 'en', note: '<script>trade reason</script>' });
  assert.match(html, /Sessions/);
  assert.match(html, /Max rise/);
  assert.match(html, /not execution P&amp;L/);
  assert.match(html, /Awaiting update/);
  assert.match(html, /Trade note/);
  assert.match(html, /&lt;script&gt;trade reason&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('history does not load until the user expands the section', () => {
  let calls = 0;
  const html = renderToStaticMarkup(React.createElement(TradeOutcomeReview, {
    trade: { symbol: 'NVDA', date: '2026-01-02', side: 'buy' }, userId: 'preview',
    historyLoader: async () => { calls += 1; return null; },
  }));
  assert.equal(calls, 0);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /操作复盘/);
  assert.doesNotMatch(html, /trade-outcome-table/);
});

test('unavailable trade close is distinguished from zero moves', () => {
  for (const reason of ['awaiting_trade_close', 'missing_trade_close', 'invalid_history']) {
    const html = render({ model: { status: 'unavailable', reason } });
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /0\.00%/);
  }
});
