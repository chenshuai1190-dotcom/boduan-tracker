import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/StockBuyReference.jsx', import.meta.url), 'utf8');
const compiled = (await transformWithOxc(source, 'StockBuyReference.jsx', { jsx: { runtime: 'classic' } })).code
  .replace(/import\s*(['"])\.\/StockBuyReference\.css\1;?/g, '')
  .replace(/from (["'])react\1/g, () => `from ${JSON.stringify(import.meta.resolve('react'))}`);
const { default: StockBuyReference } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const asOfDate = '2026-10-16';
const reference = {
  version: 'stock-buy-reference-v1', state: 'triggered', reason: 'recovery_confirmed', asOfDate,
  rsi: 38.44, previousRsi: 29.2, close: 234.1, confirmationPrice: 233.456, distanceMa200Pct: 13.24,
  ma60SlopePct: 0.18, trendEligible: true,
  conditions: { trend: true, rsiRecovered: true, priceConfirmed: true },
  event: { startedAt: '2026-10-13', triggeredAt: asOfDate, lowPrice: 218.741, invalidatedAt: null, ageTradingDays: 0, remainingTradingDays: 5 },
};
const render = (props = {}) => renderToStaticMarkup(React.createElement(StockBuyReference, { reference, asOfDate, ...props }));

test('entry reference presents synchronized closing metrics and actual event dates in an expandable explanation', () => {
  const html = render();
  assert.match(html, /买入参考已触发/);
  assert.match(html, /38\.4/);
  assert.match(html, /\$233\.46/);
  assert.match(html, /\+13\.2%/);
  assert.match(html, /<summary>.*查看条件/);
  assert.match(html, /观察起始日<\/dt><dd>2026-10-13/);
  assert.match(html, /实际触发日<\/dt><dd>2026-10-16/);
  assert.match(html, /回调低点 · 收盘<\/dt><dd>\$218\.74/);
  assert.match(html, /剩余有效期<\/dt><dd>5 个交易日/);
  assert.match(html, /参数尚待回测/);
  assert.match(html, /不构成买卖指令/);
  assert.equal((html.match(/>已满足</g) || []).length, 3);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|立即买入|确认买入|胜率|NaN|undefined/);
});

test('missing, unsupported or mismatched-date references cannot display old metrics or event dates', () => {
  for (const props of [
    { reference: null },
    { reference: { ...reference, state: 'unavailable' } },
    { reference: { ...reference, version: 'future-model' } },
    { reference: { ...reference, asOfDate: '2026-10-15' } },
    { reference: { ...reference, state: 'unknown' } },
    { asOfDate: null },
  ]) {
    const html = render(props);
    assert.match(html, /暂不可用/);
    assert.match(html, /收盘 · —/);
    assert.equal((html.match(/>资料不足</g) || []).length, 3);
    assert.doesNotMatch(html, /38\.4|233\.46|13\.2%|218\.74|2026-10-13|2026-10-15|2026-10-16|>已满足<|>0\.0</);
  }
});

test('watching reference explains the unfulfilled condition without inventing a trigger date', () => {
  const html = render({ reference: {
    ...reference, state: 'watch', conditions: { trend: true, rsiRecovered: true, priceConfirmed: false },
    event: { ...reference.event, triggeredAt: null, remainingTradingDays: 3 },
  } });
  assert.match(html, /回调观察/);
  assert.match(html, /RSI 已回升，等待收盘突破价格确认位/);
  assert.match(html, /实际触发日<\/dt><dd>—/);
  assert.match(html, /3 个交易日/);
  assert.equal((html.match(/>已满足</g) || []).length, 2);
  assert.equal((html.match(/>待满足</g) || []).length, 1);
});

test('each lifecycle state stays distinct and unknown numbers remain missing', () => {
  const labels = { idle: '暂无触发', watch: '回调观察', invalidated: '参考失效', expired: '参考已到期', paused: '暂缓观察' };
  for (const [state, label] of Object.entries(labels)) {
    const html = render({ reference: { ...reference, state, event: null, rsi: null, confirmationPrice: NaN, distanceMa200Pct: Infinity, conditions: { trend: null, rsiRecovered: false, priceConfirmed: null } } });
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /NaN|Infinity|\$0\.00|0\.0%|观察起始日/);
    assert.equal((html.match(/>资料不足</g) || []).length, 2);
    assert.equal((html.match(/>待满足</g) || []).length, 1);
  }
});

test('English copy, currency and paused reasons render without Chinese text or stale instructions', () => {
  const html = render({ language: 'en', currency: 'CNY' });
  assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
  assert.match(html, /Entry reference triggered/);
  assert.match(html, /¥233\.46/);
  assert.match(html, /Parameters await backtesting/);
  assert.match(html, /5 sessions/);
  assert.match(render({ reference: { ...reference, state: 'paused', reason: 'chase_buy_blocked' } }), /强超买叠加顶背离/);
  assert.match(render({ reference: { ...reference, state: 'paused', reason: 'trend' } }), /长期趋势条件尚未满足/);
});
