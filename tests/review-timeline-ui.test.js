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
  assert.match(renderToStaticMarkup(byClass(tree, 'rjt-node-value')), /\$90,000\.00.*-10\.00%/);
  assert.match(renderToStaticMarkup(byClass(tree, 'rjt-metric-grid')), /\+12\.50%/);
  assert.equal(walk(byClass(tree, 'rjt-node-tabs')).find(node => node.type === 'button' && node.props['aria-pressed']).props.children[0], '首次回落 10%');
});

test('cash-flow interruptions explain the exact reason and do not promise continued recovery tracking', async () => {
  const h = await harness();
  const event = { ...cycle, status: 'interrupted', interruptionReason: 'external_cash_flow', interruptedAt: '2026-10-07' };
  const html = renderToStaticMarkup(h.render('TimelineDetail', details({ event })));
  assert.match(html, /2026-10-07 · 因发生转入或转出停止比较，未判定为恢复/);
  assert.doesNotMatch(html, /中断前最后一条可比较的收盘记录|持续跟踪，直到/);
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
  assert.equal(byClass(card, 'rjt-event-description'), undefined);
  assert.doesNotMatch(renderToStaticMarkup(card), /2026 年已记录交易日/);
  assert.equal(byClass(h.render('TimelineEvent', cards[1].props), 'rjt-event-description'), undefined);
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

test('timeline labels omit comparison explanations and system-record badges but retain dates icons and states', async () => {
  const h = await harness();
  for (const [status, expected] of [['active', '恢复中'], ['recovered', '已恢复'], ['interrupted', '数据待核对']]) {
    const event = { ...cycle, status, comparisonScope: '资金变化后重新计起' };
    const list = h.render('TimelineEvent', { event });
    const detail = h.render('TimelineDetail', details({ event }));
    for (const tree of [list, detail]) {
      const html = renderToStaticMarkup(tree);
      assert.doesNotMatch(html, /资金变化后重新计起|系统记录|System record/);
      assert.match(html, new RegExp(expected));
      assert.match(html, /dateTime="2026-10-06"/);
    }
    assert.ok(byClass(list, 'rjt-event-icon'));
    assert.ok(walk(byClass(detail, 'rjt-detail-eyebrow')).some(node => node.type === (status === 'recovered' ? icons.History : icons.ArrowDownRight)));
  }
  for (const comparisonScope of ['收益报表已记录区间', '完整收益报表区间']) {
    const event = { ...cycle, kind: 'period', metric: 'period_return', comparisonScope };
    const list = h.render('TimelineEvent', { event });
    assert.doesNotMatch(renderToStaticMarkup(list), new RegExp(comparisonScope));
    assert.equal(byClass(list, 'rjt-event-footer'), undefined, 'no explanation-only footer remains');
  }
  const english = h.render('TimelineDetail', details({ language: 'en' }));
  assert.doesNotMatch(renderToStaticMarkup(english), /System record/);
  assert.match(renderToStaticMarkup(english), /Recovering/);
});

test('the timeline omits the global data-notes panel without hiding its events', async () => {
  const h = await harness();
  const warnings = ['资金变化说明', '收益率缺口说明'];
  const tree = h.render('default', { data: { events: [cycle], warnings } });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /数据说明|Data notes|rjt-data-notice|资金变化说明|收益率缺口说明/);
  assert.match(html, /当前回撤|净资产回撤/);
  assert.deepEqual(warnings, ['资金变化说明', '收益率缺口说明']);
});

test('new-high details retain real net-asset history and never fill an absent series', async () => {
  const h = await harness();
  const event = { id: 'high', kind: 'high', metric: 'net_assets', title: '净资产新高', date: current.date, value: 100000, valueType: 'money', points: [trigger, peak], nodes: [{ key: 'current', label: '新高', point: peak }] };
  const detail = h.render('TimelineDetail', details({ event }));
  assert.ok(byClass(detail, 'rjt-chart-section'));
  assert.equal(byClass(detail, 'rjt-detail-description'), undefined);
  assert.equal(byClass(h.render('TimelineEvent', { event }), 'rjt-event-description'), undefined);
  assert.doesNotMatch(renderToStaticMarkup(detail), /查看该节点对应|在可核对的历史收盘|来源于正式收盘快照/);
  assert.equal(walk(byClass(detail, 'rjt-node-detail')).some(node => node.type === 'p'), false);
  const missing = renderToStaticMarkup(h.components.TimelineChart({ event: { ...event, points: [{ date: peak.date, netAssetsUsd: null }] } }));
  assert.match(missing, /暂无可展示/); assert.doesNotMatch(missing, /<svg|<path/);
});

test('CNY converts net-asset views with one rate while return basis and trade execution prices stay USD', async () => {
  const h = await harness();
  const currency = { displayCurrency: 'CNY', usdCny: 7.2, fxDate: '2026-11-07' };
  const props = details({ ...currency, stockTrades: [{ id: 'trade', date: current.date, side: 'buy', symbol: 'NVDA', price: 187.5, shares: 1 }] });
  const html = renderToStaticMarkup(h.render('TimelineDetail', props));
  assert.match(html, /¥576,000\.00/); assert.match(html, /净资产走势 · CNY/);
  assert.doesNotMatch(html, /1 USD =|汇率更新于|金额按同一汇率折算|收益率沿用美元报表口径/);
  assert.match(html, /-25\.00%/); assert.match(html, /\$187\.50/);
  const usdChart = h.components.TimelineChart({ event: cycle, detail: true });
  const cnyChart = h.components.TimelineChart({ event: cycle, detail: true, ...currency });
  assert.equal(byClass(usdChart, 'rjt-chart-line').props.d, byClass(cnyChart, 'rjt-chart-line').props.d);
  assert.match(renderToStaticMarkup(cnyChart), /Historical net assets|账户净资产历史走势.*CNY/);
  const list = renderToStaticMarkup(h.render('TimelineEvent', { event: cycle, ...currency }));
  assert.match(list, /¥720,000\.00/); assert.match(list, /¥540,000\.00/); assert.match(list, /¥576,000\.00/);
  const timeline = h.render('default', { data: { events: [cycle] }, ...currency });
  assert.equal(byClass(timeline, 'rjt-currency-note'), undefined);
});

test('missing CNY rate shows unavailable balances and no mislabeled USD chart', async () => {
  const h = await harness(), props = details({ displayCurrency: 'CNY', usdCny: null });
  const html = renderToStaticMarkup(h.render('TimelineDetail', props));
  assert.match(html, /人民币汇率暂不可用/); assert.match(html, /-25\.00%/);
  const timeline = h.render('default', { data: { events: [cycle] }, displayCurrency: 'CNY' });
  assert.match(renderToStaticMarkup(byClass(timeline, 'rjt-currency-note')), /人民币汇率暂不可用/);
  assert.doesNotMatch(html, /\$80,000|¥80,000|rjt-chart-line|rjt-chart-area/);
  const headline = { id: 'high', kind: 'high', metric: 'net_assets', valueType: 'money', value: 100000, date: current.date, nodes: [], points: [] };
  const card = h.render('TimelineEvent', { event: headline, displayCurrency: 'CNY' });
  assert.equal(byClass(card, 'rjt-event-primary').props.children[0].props.children, '—');
});

const returnPeak = { ...peak, cumulativeReturnPct: 36.91 };
const returnTrigger = { ...trigger, cumulativeReturnPct: 26.91 };
const returnTrough = { ...trough, cumulativeReturnPct: .64 };
const returnCurrent = { ...current, cumulativeReturnPct: 3.39 };
const returnCycle = { ...cycle, id: 'drawdown:cumulative_return:2026-10-01', metric: 'cumulative_return', title: '收益率回落',
  value: -33.52, drawdownPct: -33.52, maxDrawdownPct: -36.27,
  peak: returnPeak, trigger: returnTrigger, trough: returnTrough, current: returnCurrent,
  points: [returnPeak, returnTrigger, returnTrough, returnCurrent],
  nodes: [{ key: 'peak', label: '年内高点', point: returnPeak }, { key: 'trigger', label: '首次回落 10%', point: returnTrigger },
    { key: 'trough', label: '最低点', point: returnTrough }, { key: 'current', label: '最近收盘', point: returnCurrent }] };

test('return declines show percentage magnitudes separately from net assets in both financial color modes', async () => {
  const h = await harness();
  for (const marketColorMode of Object.values(MARKET_COLOR_MODES)) {
    const list = h.render('TimelineEvent', { event: returnCycle, marketColorMode, displayCurrency: 'CNY', usdCny: 7.2 });
    const primary = byClass(list, 'rjt-event-primary').props.children[0];
    assert.equal(primary.props.children, '36.27%');
    assert.equal(primary.props.style.color, marketHexColor(-36.27, marketColorMode));
    const stops = renderToStaticMarkup(byClass(list, 'rjt-three-values'));
    assert.match(stops, /年内高点.*\+36\.91%.*\+0\.64%.*\+3\.39%/);
    assert.doesNotMatch(stops, /¥|\$/);
    const detail = h.render('TimelineDetail', details({ event: returnCycle, marketColorMode, displayCurrency: 'CNY', usdCny: 7.2 }));
    const stats = byClass(detail, 'rjt-detail-stats');
    const figures = walk(stats).filter(node => node.type === 'strong');
    assert.equal(figures[0].props.children, '33.52%');
    assert.equal(figures[0].props.style.color, marketHexColor(-33.52, marketColorMode));
    assert.equal(figures[2].props.children, '+3.39%');
    assert.equal(figures[2].props.style.color, marketHexColor(3.39, marketColorMode));
    assert.match(renderToStaticMarkup(stats), /较年内高点回落.*当前收益率/);
    assert.match(renderToStaticMarkup(byClass(detail, 'rjt-metric-grid')), /¥576,000\.00/);
    assert.match(renderToStaticMarkup(byClass(detail, 'rjt-chart-heading')), /累计收益率走势 · %/);
    assert.doesNotMatch(renderToStaticMarkup(byClass(detail, 'rjt-detail-metric')), /-36\.27%/);
  }
});

test('return charts use cumulative percentages independent of cash balances and FX, with a ten-point decline threshold', async () => {
  const h = await harness(), chart = options => h.components.TimelineChart({ event: returnCycle, detail: true, ...options });
  const usd = chart(), cny = chart({ displayCurrency: 'CNY', usdCny: 7.2 }), unavailableFx = chart({ displayCurrency: 'CNY', usdCny: null });
  const path = byClass(usd, 'rjt-chart-line').props.d;
  assert.equal(byClass(cny, 'rjt-chart-line').props.d, path);
  assert.equal(byClass(unavailableFx, 'rjt-chart-line').props.d, path);
  assert.match(renderToStaticMarkup(unavailableFx), /累计收益率历史走势 · %/);
  assert.doesNotMatch(renderToStaticMarkup(unavailableFx), /USD|CNY|汇率|净资产/);
  const changedBalances = { ...returnCycle, points: returnCycle.points.map(point => ({ ...point, netAssetsUsd: 1, chartValue: 1 })) };
  assert.equal(byClass(chart({ event: changedBalances }), 'rjt-chart-line').props.d, path);
  const plottedPoints = [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)];
  assert.ok(Math.abs(byClass(usd, 'rjt-chart-threshold').props.y1 - Number(plottedPoints[1][2])) < .01, 'the threshold meets the point whose return is exactly ten points below the peak');
  const negative = { ...returnCycle, peak: { ...returnPeak, cumulativeReturnPct: -2 },
    points: [{ ...returnPeak, cumulativeReturnPct: -2 }, { ...returnTrigger, cumulativeReturnPct: -12 }, { ...returnCurrent, cumulativeReturnPct: -15 }] };
  assert.ok(byClass(chart({ event: negative }), 'rjt-chart-threshold'), 'a negative return high still has an additive ten-point threshold');
});

test('return milestones show selected returns and peak differences without substituting net-asset ratios', async () => {
  const h = await harness(), props = details({ event: returnCycle });
  let detail = h.render('TimelineDetail', props);
  let figures = walk(byClass(detail, 'rjt-node-value')).filter(node => ['strong', 'span'].includes(node.type));
  assert.deepEqual(figures.map(node => node.props.children), ['+3.39%', '33.52%']);
  const selectTrigger = walk(byClass(detail, 'rjt-node-tabs')).find(node => node.type === 'button' && node.props.children[0] === '首次回落 10%');
  selectTrigger.props.onClick(); detail = h.render('TimelineDetail', props);
  figures = walk(byClass(detail, 'rjt-node-value')).filter(node => ['strong', 'span'].includes(node.type));
  assert.deepEqual(figures.map(node => node.props.children), ['+26.91%', '10.00%']);
  assert.match(renderToStaticMarkup(byClass(detail, 'rjt-node-detail')), /累计收益率.*2026-10-02/);
  const selectPeak = walk(byClass(detail, 'rjt-node-tabs')).find(node => node.type === 'button' && node.props.children[0] === '年内高点');
  selectPeak.props.onClick(); detail = h.render('TimelineDetail', props);
  assert.match(renderToStaticMarkup(byClass(detail, 'rjt-node-value')), /\+36\.91%.*0\.00%/);
  const absent = { ...returnCycle, current: { ...returnCurrent, cumulativeReturnPct: null }, nodes: [], points: [{ ...returnPeak, cumulativeReturnPct: null }] };
  const missing = renderToStaticMarkup(h.components.TimelineChart({ event: absent, detail: true }));
  assert.match(missing, /连续收益率曲线/); assert.doesNotMatch(missing, /<svg|<path|100,000/);
  const missingDetail = h.render('TimelineDetail', details({ event: absent }));
  assert.equal(byClass(missingDetail, 'rjt-node-value'), undefined, 'without nodes or a series there is no node card');
  const currentReading = byClass(missingDetail, 'rjt-detail-net');
  assert.match(renderToStaticMarkup(currentReading), /当前收益率.*—/);
  assert.doesNotMatch(renderToStaticMarkup(currentReading), /80,000|0\.00%/);
  const missingNode = { ...absent, nodes: [{ key: 'current', label: '最近收盘', point: absent.current }] };
  const nodeDetail = h.render('TimelineDetail', details({ event: missingNode }));
  assert.match(renderToStaticMarkup(byClass(nodeDetail, 'rjt-node-value')), /—.*—/);
  assert.doesNotMatch(renderToStaticMarkup(byClass(nodeDetail, 'rjt-node-value')), /80,000|0\.00%/);
});

test('return year boundaries and gaps preserve interrupted states without fabricated recovery or selected chart points', async () => {
  const h = await harness();
  const ended = { ...returnCycle, status: 'interrupted', interruptionReason: 'year_boundary' };
  for (const component of ['TimelineEvent', 'TimelineDetail']) {
    const html = renderToStaticMarkup(h.render(component, details({ event: ended })));
    assert.match(html, /本年度已结束/);
    assert.doesNotMatch(html, /数据待核对|恢复中/);
  }
  const missing = renderToStaticMarkup(h.render('TimelineDetail', details({ event: { ...returnCycle, status: 'interrupted', interruptionReason: 'missing_return' } })));
  assert.match(missing, /收益率数据缺失.*未判定为恢复/);
  const gap = { ...returnCycle, status: 'interrupted', interruptionReason: 'missing_session', points: [returnTrough, returnCurrent] };
  const oldPeak = renderToStaticMarkup(h.components.TimelineChart({ event: gap, selectedPoint: returnPeak, detail: true }));
  assert.match(oldPeak, /所选节点不在当前连续数据区间/);
  assert.doesNotMatch(oldPeak, /rjt-chart-selected|rjt-chart-cursor/);
  const latest = h.components.TimelineChart({ event: gap, selectedPoint: returnCurrent, detail: true });
  assert.ok(byClass(latest, 'rjt-chart-selected'));
});

test('cumulative and annual extrema use the matching return or P&L series instead of the account balance', async () => {
  const h = await harness();
  const cases = [
    ['cumulative_return', 'cumulativeReturnPct', '累计收益率', 'percent', [25, 20, 30]],
    ['cumulative_pnl', 'cumulativePnlUsd', '累计盈利金额', 'money', [2000, 1500, 3000]],
    ['annual_return', 'annualReturnPct', '年内收益率', 'percent', [5, 2, 10]],
    ['annual_pnl', 'annualPnlUsd', '年内收益金额', 'money', [200, 150, 300]],
  ];
  for (const [metric, field, label, valueType, values] of cases) {
    for (const kind of metric.startsWith('annual_') ? ['high', 'low'] : ['high']) {
      const points = [peak, trigger, current].map((point, index) => ({ ...point, [field]: values[index], netAssetsUsd: 100000 * (index + 1), chartValue: 100000 * (index + 1) }));
      const event = { id: `${kind}:${metric}:2026-10-01`, kind, metric, valueType, value: values[2], title: `${label}${kind === 'low' ? '新低' : '新高'}`,
        startDate: points[0].date, date: points[2].date, current: points[2], points,
        nodes: [{ key: 'start', label: '此前节点', point: points[0] }, { key: 'current', label: '当前节点', point: points[2] }] };
      const usdChart = h.components.TimelineChart({ event, detail: true });
      const path = byClass(usdChart, 'rjt-chart-line').props.d;
      const unrelatedBalances = { ...event, points: points.map(point => ({ ...point, netAssetsUsd: 1, chartValue: 1 })) };
      assert.equal(byClass(h.components.TimelineChart({ event: unrelatedBalances, detail: true }), 'rjt-chart-line').props.d, path);
      assert.match(renderToStaticMarkup(usdChart), new RegExp(`${label}历史走势`));
      assert.equal(byClass(usdChart, 'rjt-chart-threshold'), undefined, 'highs and lows are not drawdown threshold charts');
      const cny = { displayCurrency: 'CNY', usdCny: 7.2 };
      assert.equal(byClass(h.components.TimelineChart({ event, detail: true, ...cny }), 'rjt-chart-line').props.d, path);
      const noFx = h.components.TimelineChart({ event, displayCurrency: 'CNY' });
      if (valueType === 'percent') assert.ok(byClass(noFx, 'rjt-chart-line'));
      else { assert.equal(byClass(noFx, 'rjt-chart-line'), undefined); assert.match(renderToStaticMarkup(noFx), /收益金额曲线待更新/); }
      const props = details({ event, ...cny });
      let detail = h.render('TimelineDetail', props);
      const expected = valueType === 'percent' ? `+${values[2].toFixed(2)}%` : formatReviewMoney(values[2], cny);
      assert.equal(byClass(detail, 'rjt-node-value').props.children[0].props.children, expected);
      assert.match(renderToStaticMarkup(byClass(detail, 'rjt-node-detail')), new RegExp(label));
      assert.match(renderToStaticMarkup(byClass(detail, 'rjt-chart-heading')), new RegExp(`${label}走势 · ${valueType === 'percent' ? '%' : 'CNY'}`));
      walk(byClass(detail, 'rjt-node-tabs')).find(node => node.type === 'button' && node.props.children[0] === '此前节点').props.onClick();
      detail = h.render('TimelineDetail', props);
      assert.equal(byClass(detail, 'rjt-node-value').props.children[0].props.children, valueType === 'percent' ? `+${values[0].toFixed(2)}%` : formatReviewMoney(values[0], cny));
      const missingPoints = points.map(point => ({ ...point, [field]: null }));
      const empty = h.components.TimelineChart({ event: { ...event, points: missingPoints } });
      assert.equal(byClass(empty, 'rjt-chart-line'), undefined, 'net assets never replace missing metric observations');
      const missingNode = h.render('TimelineDetail', details({ event: { ...event, nodes: [{ key: 'current', point: missingPoints[2] }], points: missingPoints } }));
      assert.equal(byClass(missingNode, 'rjt-node-value').props.children[0].props.children, '—');
    }
  }
});

test('annual lows have their own filter and values keep their financial sign in either color convention', async () => {
  const h = await harness();
  const low = { id: 'low:annual_return:2026-10-06', kind: 'low', metric: 'annual_return', title: '年内收益率新低', date: current.date,
    valueType: 'percent', value: 5, points: [{ ...peak, annualReturnPct: 10 }, { ...current, annualReturnPct: 5 }],
    nodes: [{ key: 'current', label: '新低', point: { ...current, annualReturnPct: 5 } }] };
  const high = { ...low, id: 'high:annual_return:2026-10-06', kind: 'high', title: '年内收益率新高' };
  const props = { data: { events: [cycle, high, low], years: [2026] } };
  let timeline = h.render('default', props);
  walk(byClass(timeline, 'rjt-filters')).find(node => node.type === 'button' && node.props.children === '新低').props.onClick();
  timeline = h.render('default', props);
  assert.deepEqual(walk(timeline).filter(node => node.type === h.components.TimelineEvent).map(node => node.props.event), [low]);
  for (const mode of Object.values(MARKET_COLOR_MODES)) for (const value of [-5, 5]) {
    const event = { ...low, value, nodes: [{ key: 'current', label: '新低', point: { ...current, annualReturnPct: value } }] };
    const card = h.render('TimelineEvent', { event, marketColorMode: mode });
    assert.ok(walk(byClass(card, 'rjt-event-icon')).some(node => node.type === icons.ArrowDownRight));
    assert.equal(byClass(card, 'rjt-event-primary').props.children[0].props.style.color, marketHexColor(value, mode));
    const detail = h.render('TimelineDetail', details({ event, marketColorMode: mode }));
    assert.equal(byClass(detail, 'rjt-node-value').props.children[0].props.style.color, marketHexColor(value, mode));
  }
});
