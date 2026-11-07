import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import * as icons from 'lucide-react';
import { marketHexColor, MARKET_COLOR_MODES } from '../src/lib/marketColorMode.js';
import { normalizeReviewMarketSnapshot } from '../src/lib/reviewMarketSnapshot.js';
import { convertReviewMoney, formatReviewMoney, reviewCurrencyNotice, reviewDisplayCurrency } from '../src/lib/reviewDisplayCurrency.js';

const source = readFileSync(new URL('../src/components/ReviewTimeline.jsx', import.meta.url), 'utf8');
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const byClass = (tree, name) => walk(tree).find(node => node.props.className?.split(' ').includes(name));
let nextFixture = 0;
async function harness() {
  let cursor = 0;
  const slots = [];
  const fixture = {
    React: { ...React, useState(initial) { const i = cursor++; const slot = slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; } },
    icons, marketHexColor, normalizeReviewMarketSnapshot, convertReviewMoney, formatReviewMoney, reviewCurrencyNotice, reviewDisplayCurrency,
    SnapshotCard: ({ value }) => React.createElement('aside', { 'data-market-date': value.asOfDate }, value.items[0].value),
  };
  const key = `__timelineUI${++nextFixture}`;
  globalThis[key] = fixture;
  let components;
  try {
    const compiled = await transformWithOxc(`
      const { React, icons, marketHexColor, normalizeReviewMarketSnapshot, convertReviewMoney, formatReviewMoney, reviewCurrencyNotice, reviewDisplayCurrency, SnapshotCard } = globalThis[${JSON.stringify(key)}];
      const { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, Flag, History, Info, Loader2, MessageCircle, RefreshCw } = icons;
      ${source.replace(/^import .*;\n/gm, '')}
      export { TimelineDetail, TimelineEvent, ArchivedDetail };
    `, 'ReviewTimelineUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[key]; }
  return { components, render(name, props) { cursor = 0; return components[name](props); } };
}

const peak = { date: '2026-10-01', netAssetsUsd: 100000, chartValue: 100000, cumulativeReturnPct: 25 };
const trigger = { date: '2026-10-02', netAssetsUsd: 90000, chartValue: 90000, cumulativeReturnPct: 12.5, dailyReturnPct: -10 };
const trough = { date: '2026-10-05', netAssetsUsd: 75000, chartValue: 75000, cumulativeReturnPct: -6.25 };
const current = { date: '2026-10-06', netAssetsUsd: 80000, chartValue: 80000, cumulativeReturnPct: 0, dailyReturnPct: 6.67 };
const cycle = { id: 'drawdown:net_assets:2026-10-01', kind: 'drawdown', metric: 'net_assets', title: '净资产回撤超过 10%', date: current.date,
  value: -20, valueType: 'percent', status: 'active', drawdownPct: -20, maxDrawdownPct: -25, durationDays: 5,
  startDate: peak.date, endDate: current.date, peak, trigger, trough, current, points: [peak, trigger, trough, current],
  nodes: [{ key: 'peak', label: '前高', point: peak }, { key: 'trigger', label: '首次回落 10%', point: trigger }, { key: 'trough', label: '最低点', point: trough }, { key: 'current', label: '最近收盘', point: current }] };
const details = overrides => ({ event: cycle, entries: [], stockTrades: [], language: 'zh', ...overrides });
const market = (date, value = 25) => ({ version: 1, kind: 'market_snapshot', asOfDate: date, recordDate: date, basis: 'close',
  items: [{ key: 'vix', value, asOfDate: date, basis: 'close', source: 'CBOE' }] });

test('recovered cycles keep the worst drawdown as the main reading in both financial color modes', async () => {
  const h = await harness();
  const recovered = { ...cycle, status: 'recovered', value: 0, drawdownPct: 0, current: { ...current, netAssetsUsd: 101000 } };
  for (const mode of Object.values(MARKET_COLOR_MODES)) {
    const list = h.render('TimelineEvent', { event: recovered, marketColorMode: mode });
    const primary = byClass(list, 'rjt-event-primary').props.children[0];
    assert.equal(primary.props.children, '-25.00%');
    assert.equal(primary.props.style.color, marketHexColor(-25, mode));
    assert.match(renderToStaticMarkup(list), /恢复<\/span>/);
    const detail = h.render('TimelineDetail', details({ event: recovered, marketColorMode: mode }));
    const main = byClass(detail, 'rjt-detail-metric').props.children[0];
    assert.equal(main.props.children, '-25.00%');
    assert.equal(main.props.style.color, marketHexColor(-25, mode));
    assert.match(renderToStaticMarkup(byClass(detail, 'rjt-detail-stats')), /0\.00%/);
    const svg = h.components.TimelineChart({ event: recovered, marketColorMode: mode });
    assert.equal(byClass(svg, 'rjt-chart-dot').props.fill, marketHexColor(-1, mode));
  }
});

test('milestone selection changes the exact account and market date without inventing missing balances', async () => {
  const h = await harness();
  const props = details({ event: { ...cycle, current: { ...current, market: market(peak.date, 99) } },
    entries: [{ id: 'journal', date: trigger.date, text: '复盘', market: market(trigger.date, 24) }] });
  let tree = h.render('TimelineDetail', props);
  let html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /data-market-date|融资负债|账户杠杆|>现金</);
  const selectTrigger = walk(byClass(tree, 'rjt-node-tabs')).find(node => node.type === 'button' && node.props.children[0] === '首次回落 10%');
  selectTrigger.props.onClick();
  tree = h.render('TimelineDetail', props); html = renderToStaticMarkup(tree);
  assert.match(html, /data-market-date="2026-10-02"/);
  assert.match(renderToStaticMarkup(byClass(tree, 'rjt-node-value')), /\$90,000.*-10\.00%/);
  assert.match(renderToStaticMarkup(byClass(tree, 'rjt-metric-grid')), /\+12\.50%/);
  assert.equal(walk(byClass(tree, 'rjt-node-tabs')).find(node => node.type === 'button' && node.props['aria-pressed']).props.children[0], '首次回落 10%');
});

test('cash-flow interruptions explain the exact reason and do not promise continued recovery tracking', async () => {
  const h = await harness();
  const event = { ...cycle, status: 'interrupted', interruptionReason: 'external_cash_flow', interruptedAt: '2026-10-07' };
  const html = renderToStaticMarkup(h.render('TimelineDetail', details({ event })));
  assert.match(html, /2026-10-07 · 因发生转入或转出停止比较，未判定为恢复/);
  assert.match(html, /中断前最后一条可比较的收盘记录/);
  assert.doesNotMatch(html, /持续跟踪，直到/);
});

test('archived records preserve reflections without made-up figures, chart or milestones', async () => {
  const h = await harness(), event = { ...cycle, status: 'archived', value: null, points: [], nodes: [], description: '来源数据已更新，保留此前写下的评价。' };
  let received;
  const props = { event, renderEvaluations(value) { received = value; return React.createElement('section', null, '已保存的评价'); } };
  const html = renderToStaticMarkup(h.render('ArchivedDetail', props));
  assert.equal(received, event);
  assert.match(html, /已保存的评价/);
  assert.match(html, /来源数据已更新/);
  assert.doesNotMatch(html, /\$|rjt-detail-metric|rjt-chart|rjt-node|最大回撤/);
  const list = renderToStaticMarkup(h.render('TimelineEvent', { event }));
  assert.doesNotMatch(list, /\$|rjt-event-primary|rjt-chart|rjt-three-values|最大回撤/);
});

test('year and event filters keep periods and daily records together, and navigation stays separate from evaluation', async () => {
  const h = await harness();
  let selected, evaluated;
  const daily = { ...cycle, id: 'daily', kind: 'record', metric: 'daily_return', title: '单日涨幅纪录', comparisonScope: '2026 年已记录交易日' };
  const old = { ...daily, id: 'old', date: '2025-10-01' };
  const period = { ...daily, id: 'period', kind: 'period', title: '月度纪录' };
  const props = { data: { events: [old, cycle, daily, period], years: [2025, 2026] }, onSelectEvent(id) { selected = id; }, onEvaluate(event) { evaluated = event.id; } };
  let tree = h.render('default', props);
  walk(tree).find(node => node.type === 'select').props.onChange({ target: { value: '2026' } });
  walk(byClass(tree, 'rjt-filters')).find(node => node.type === 'button' && node.props.children === '周期纪录').props.onClick();
  tree = h.render('default', props);
  const cards = walk(tree).filter(node => node.type === h.components.TimelineEvent);
  assert.deepEqual(cards.map(card => card.props.event.id), ['daily', 'period']);
  const card = h.render('TimelineEvent', cards[0].props);
  byClass(card, 'rjt-event-open').props.onClick({}); assert.equal(selected, 'daily'); assert.equal(evaluated, undefined);
  walk(byClass(card, 'rjt-event-footer')).find(node => node.type === 'button').props.onClick(); assert.equal(evaluated, 'daily');
});

test('loading, errors and pending reports never render old events as completed results', async () => {
  const h = await harness(), data = { events: [cycle] };
  const loading = renderToStaticMarkup(h.render('default', { data, loading: true }));
  assert.match(loading, /正在整理/); assert.doesNotMatch(loading, /最大回撤|净资产回撤超过/);
  const error = renderToStaticMarkup(h.render('default', { data, error: '读取失败' }));
  assert.match(error, /role="alert"/); assert.doesNotMatch(error, /最大回撤|净资产回撤超过/);
  const pending = renderToStaticMarkup(h.render('default', { data: { ...data, status: 'pending' } }));
  assert.match(pending, /收益报表正在更新/); assert.doesNotMatch(pending, /最大回撤|净资产回撤超过/);
});

test('new-high details retain real net-asset history and never fill an absent series', async () => {
  const h = await harness();
  const event = { id: 'high', kind: 'high', metric: 'net_assets', title: '净资产新高', date: current.date, value: 100000, valueType: 'money', points: [trigger, peak], nodes: [{ key: 'current', label: '新高', point: peak }] };
  assert.ok(byClass(h.render('TimelineDetail', details({ event })), 'rjt-chart-section'));
  const missing = renderToStaticMarkup(h.components.TimelineChart({ event: { ...event, points: [{ date: peak.date, netAssetsUsd: null }] } }));
  assert.match(missing, /暂无可展示/); assert.doesNotMatch(missing, /<svg|<path/);
});

test('CNY converts net-asset views with one rate while return basis and trade execution prices stay USD', async () => {
  const h = await harness();
  const currency = { displayCurrency: 'CNY', usdCny: 7.2, fxDate: '2026-11-07' };
  const props = details({ ...currency, stockTrades: [{ id: 'trade', date: current.date, side: 'buy', symbol: 'NVDA', price: 187.5, shares: 1 }] });
  const html = renderToStaticMarkup(h.render('TimelineDetail', props));
  assert.match(html, /¥576,000/); assert.match(html, /净资产走势 · CNY/);
  assert.match(html, /汇率更新于 2026-11-07/); assert.match(html, /-25\.00%/); assert.match(html, /\$187\.50/);
  const usdChart = h.components.TimelineChart({ event: cycle, detail: true });
  const cnyChart = h.components.TimelineChart({ event: cycle, detail: true, ...currency });
  assert.equal(byClass(usdChart, 'rjt-chart-line').props.d, byClass(cnyChart, 'rjt-chart-line').props.d);
  assert.match(renderToStaticMarkup(cnyChart), /Historical net assets|账户净资产历史走势.*CNY/);
  const list = renderToStaticMarkup(h.render('TimelineEvent', { event: cycle, ...currency }));
  assert.match(list, /¥720,000/); assert.match(list, /¥540,000/); assert.match(list, /¥576,000/);
});

test('missing CNY rate shows unavailable balances and no mislabeled USD chart', async () => {
  const h = await harness(), props = details({ displayCurrency: 'CNY', usdCny: null });
  const html = renderToStaticMarkup(h.render('TimelineDetail', props));
  assert.match(html, /人民币汇率暂不可用/); assert.match(html, /-25\.00%/);
  assert.doesNotMatch(html, /\$80,000|¥80,000|rjt-chart-line|rjt-chart-area/);
  const headline = { id: 'high', kind: 'high', metric: 'net_assets', valueType: 'money', value: 100000, date: current.date, nodes: [], points: [] };
  const card = h.render('TimelineEvent', { event: headline, displayCurrency: 'CNY' });
  assert.equal(byClass(card, 'rjt-event-primary').props.children[0].props.children, '—');
});
