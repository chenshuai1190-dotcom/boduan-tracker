import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import * as icons from 'lucide-react';
import { marketHexColor, MARKET_COLOR_MODES } from '../src/lib/marketColorMode.js';
import { reviewTimelineFeedDate } from '../src/lib/reviewTimelineFeed.js';
import { formatReviewMoney, reviewDisplayCurrency } from '../src/lib/reviewDisplayCurrency.js';

const source = readFileSync(new URL('../src/components/ReviewTimelinePost.jsx', import.meta.url), 'utf8');
const fixture = { React, icons, marketHexColor, reviewTimelineFeedDate, formatReviewMoney, reviewDisplayCurrency,
  TimelineChart: props => React.createElement('aside', { 'data-chart-currency': props.displayCurrency, 'data-chart-rate': props.usdCny }, props.event.id) };
globalThis.__timelinePostUI = fixture;
const compiled = await transformWithOxc(`
  const { React, icons, marketHexColor, reviewTimelineFeedDate, formatReviewMoney, reviewDisplayCurrency, TimelineChart } = globalThis.__timelinePostUI;
  const { History, MessageCircle } = icons;
  ${source.replace(/^import .*;\n/gm, '')}
`, 'ReviewTimelinePostUITest.jsx', { jsx: { runtime: 'classic' } });
const { default: Post } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
delete globalThis.__timelinePostUI;
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const byClass = (tree, name) => walk(tree).find(node => node.props.className?.split(' ').includes(name));
const peak = { date: '2026-10-01', netAssetsUsd: 100000, cumulativeReturnPct: 25, cumulativePnlUsd: 20000 };
const current = { date: '2026-10-06', netAssetsUsd: 120000, cumulativeReturnPct: 30, cumulativePnlUsd: 24000 };
const high = { id: 'high:net_assets:2026-10-02', title: '净资产创新高', kind: 'high', metric: 'net_assets', valueType: 'money', value: 120000,
  startDate: '2026-10-02', date: current.date, current, points: [peak, current], nodes: [{ key: 'start', point: peak }] };
const props = (event = high, overrides = {}) => ({ event, authorNode: React.createElement('strong', null, '团团'),
  avatarNode: React.createElement('img', { className: 'rj-avatar', src: '/avatar.png', alt: '团团' }), ...overrides });

test('system post displays the latest data date once while retaining the same author event ID and comment count', () => {
  const html = renderToStaticMarkup(Post(props(high, { commentCount: 3 })));
  assert.match(html, /src="\/avatar.png"/); assert.match(html, /团团/); assert.match(html, /自动记录/);
  assert.match(html, /dateTime="2026-10-06"/); assert.doesNotMatch(html, /更新至|Updated|rj-system-updated/);
  assert.match(html, /<span>3<\/span>/); assert.match(html, /data-rj-entry-key="timeline:high:net_assets:2026-10-02"/);
  assert.doesNotMatch(html, /编辑|删除|置顶|查看记录|查看交易|只读回放/);
});

test('a drawdown byline advances to its latest close and falls back to an end date without changing its navigation key', () => {
  const event = { ...high, id: 'drawdown:net_assets:2026-10-05', kind: 'drawdown', startDate: '2026-10-05',
    trigger: { date: '2026-10-16' }, date: '2026-11-06', endDate: '2026-11-05', drawdownPct: -24.02, maxDrawdownPct: -26.84 };
  const tree = Post(props(event));
  const byline = byClass(tree, 'rj-timeline-byline');
  assert.equal(walk(byline).find(node => node.type === 'time').props.dateTime, '2026-11-06');
  assert.match(renderToStaticMarkup(byline), /11月06日/);
  assert.equal(tree.props['data-rj-entry-key'], `timeline:${event.id}`);
  const fallback = Post(props({ ...event, date: '2026-02-30' }));
  assert.equal(walk(byClass(fallback, 'rj-timeline-byline')).find(node => node.type === 'time').props.dateTime, '2026-11-05');
  assert.doesNotMatch(renderToStaticMarkup(fallback), /更新至|rj-system-updated/);
  assert.equal(event.startDate, '2026-10-05');
  assert.equal(event.trigger.date, '2026-10-16');
});

test('post and comment navigate to the same event without double-opening interactive children', () => {
  const opened = [], tree = Post(props(high, { onOpen: (id, click) => opened.push([id, click]) }));
  globalThis.window = { getSelection: () => ({ toString: () => '' }) };
  try {
    const currentTarget = { contains: () => true }, target = { closest: () => null };
    const click = { currentTarget, target, defaultPrevented: false };
    tree.props.onClick(click); assert.deepEqual(opened[0], [high.id, click]);
    tree.props.onClick({ ...click, target: { closest: () => true } }); assert.equal(opened.length, 1);
    window.getSelection = () => ({ toString: () => '选择文字' });
    tree.props.onClick(click); assert.equal(opened.length, 1);
    let prevented = false;
    const key = { target: currentTarget, currentTarget, key: 'Enter', preventDefault() { prevented = true; } };
    tree.props.onKeyDown(key); assert.equal(opened.length, 2); assert.equal(prevented, true);
    walk(byClass(tree, 'rj-post-actions')).find(node => node.type === 'button').props.onClick(click);
    assert.equal(opened.length, 3); assert.deepEqual(opened.map(item => item[0]), [high.id, high.id, high.id]);
  } finally { delete globalThis.window; }
});

test('net-asset amount stays neutral and gains/losses follow either financial color convention', () => {
  for (const mode of Object.values(MARKET_COLOR_MODES)) {
    const net = Post(props(high, { marketColorMode: mode }));
    assert.equal(byClass(net, 'rj-system-primary').props.style, undefined);
    const delta = byClass(net, 'rj-system-secondary').props.children[1];
    assert.equal(delta.props.style.color, marketHexColor(20, mode));
    const loss = { ...high, id: 'daily', kind: 'record', metric: 'daily_return', valueType: 'percent', value: -12.5, current: { ...current, dailyPnlUsd: -2500 } };
    const daily = Post(props(loss, { marketColorMode: mode }));
    assert.equal(byClass(daily, 'rj-system-primary').props.children, '-12.50%');
    assert.equal(byClass(daily, 'rj-system-primary').props.style.color, marketHexColor(-12.5, mode));
    const pnl = byClass(daily, 'rj-system-secondary').props.children[1];
    assert.equal(pnl.props.children, '-$2,500.00'); assert.equal(pnl.props.style.color, marketHexColor(-2500, mode));
  }
});

test('CNY projection uses the same rate for card/chart and absent FX never shows a currency guess', () => {
  const tree = Post(props(high, { displayCurrency: 'CNY', usdCny: 7.2, fxDate: '2026-11-07' }));
  assert.equal(byClass(tree, 'rj-system-primary').props.children, '¥864,000.00');
  const chart = walk(tree).find(node => node.type === fixture.TimelineChart);
  assert.equal(chart.props.usdCny, 7.2); assert.equal(chart.props.fxDate, '2026-11-07'); assert.equal(chart.props.displayCurrency, 'CNY');
  const html = renderToStaticMarkup(Post(props(high, { displayCurrency: 'CNY' })));
  assert.match(html, /汇率暂不可用/); assert.doesNotMatch(html, /¥120,000|\$120,000/);
});

test('post captions omit comparison templates without blank space and keep real peak dates and currency state', () => {
  for (const comparisonScope of ['资金变化后重新计起', '收益报表已记录区间', '完整收益报表区间']) {
    const event = { ...high, comparisonScope };
    const tree = Post(props(event));
    assert.equal(byClass(tree, 'rj-system-caption'), undefined);
    assert.doesNotMatch(renderToStaticMarkup(tree), new RegExp(`${comparisonScope}|正式收盘记录|Confirmed closing record`));
    assert.equal(event.comparisonScope, comparisonScope, 'presentation does not rewrite the source event');
  }
  const event = { ...high, kind: 'drawdown', peak, drawdownPct: -12, maxDrawdownPct: -15, comparisonScope: '资金变化后重新计起' };
  const caption = byClass(Post(props(event)), 'rj-system-caption');
  assert.match(renderToStaticMarkup(caption), /较.*10月01日.*前高/);
  assert.doesNotMatch(renderToStaticMarkup(caption), /资金变化后重新计起/);
  const cny = byClass(Post(props(high, { displayCurrency: 'CNY', usdCny: 7.2 })), 'rj-system-caption');
  assert.match(renderToStaticMarkup(cny), /人民币折算/);
  assert.doesNotMatch(renderToStaticMarkup(cny), /正式收盘记录/);
});

test('archived events preserve the author/evaluation entry without stale financial metrics', () => {
  const html = renderToStaticMarkup(Post(props({ ...high, status: 'archived' })));
  assert.match(html, /来源数据已更新/); assert.match(html, /团团/); assert.match(html, /评论/);
  assert.doesNotMatch(html, /rj-system-summary|data-chart|¥|\$/);
});

test('compact post styling avoids the outer selection frame while retaining keyboard focus', () => {
  const css = readFileSync(new URL('../src/components/ReviewTimelinePost.css', import.meta.url), 'utf8');
  assert.match(css, /\.rj-timeline-post:focus,\.rj-timeline-post:focus-visible,\.rj-timeline-post:active\{outline:none!important;box-shadow:none!important/);
  assert.match(css, /\.rj-timeline-post:focus-visible \.rj-timeline-copy\{outline:1px/);
  assert.match(css, /\.rj-system-values\{[^}]*flex-wrap:wrap/);
});
