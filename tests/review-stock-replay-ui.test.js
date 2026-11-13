import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { parse } from 'postcss';
import { buildReviewStockReplay, collectReviewReplayTrades, reviewReplayRequestRange } from '../src/lib/reviewStockReplayModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';
import { withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';

const source = readFileSync(new URL('../src/components/ReviewStockReplay.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/ReviewJournalPage.jsx', import.meta.url), 'utf8');
const css = parse(readFileSync(new URL('../src/components/ReviewStockReplay.css', import.meta.url), 'utf8'));
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const moduleUrl = file => JSON.stringify(new URL(`../src/lib/${file}.js`, import.meta.url).href);
const endDate = '2026-10-06', recordDate = '2026-04-07', userId = 'replay-owner';
const rows = [];
for (let time = Date.parse('2025-04-01T12:00:00Z'); time <= Date.parse(`${endDate}T12:00:00Z`); time += 86400000) {
  const date = new Date(time), key = date.toISOString().slice(0, 10);
  if (![0, 6].includes(date.getUTCDay()) && !isRegularNyseHoliday(key)) rows.push({ date: key, close: 100 + rows.length / 10 });
}
const history = { source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', series: { NVDA: { rows } } };
const trade = (id, date, side = 'buy') => ({ id, symbol: 'NVDA', date, side, price: 125, shares: 2, currency: 'USD', user_id: userId });
const stockTrades = [trade('old-buy', '2025-04-02'), trade('review-sell', recordDate, 'sell'), trade('review-buy', recordDate), trade('later-buy', '2026-10-05')];
const baseProps = { symbol: 'NVDA', stockTrades, userId, recordDate, language: 'zh' };
const model = buildReviewStockReplay({ ...baseProps, history, endDate });
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const find = (tree, predicate) => walk(tree).find(predicate);
const hasClass = (node, name) => node.props.className?.split(' ').includes(name);
const chartIn = (tree, h) => find(tree, node => node.type === h.components.ReplayChart);
const markup = tree => renderToStaticMarkup(tree);
const flush = () => new Promise(resolve => setImmediate(resolve));

let fixtureId = 0;
async function harness({ observer = true } = {}) {
  let slots = [], cursor = 0, effects = [];
  const requests = [], observers = [];
  const cached = new Map(), listeners = new Set();
  const cacheKey = args => JSON.stringify([args.userId, args.symbols, args.startDate, args.endDate]);
  const fixture = {
    active: false, document: { body: { style: {} } },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(factory, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return fixture.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      previous?.cleanup?.();
      const slot = { deps }; slots[index] = slot;
      effects.push(() => { slot.cleanup = effect(); });
    },
    useLayoutEffect(effect, deps) { return fixture.useEffect(effect, deps); },
    load(options) {
      return new Promise((resolve, reject) => requests.push({ options, resolve: data => {
        if (!options.signal.aborted) cached.set(cacheKey(options), data);
        resolve(data);
      }, reject: error => {
        if (error?.code !== 'NETWORK_ERROR') cached.delete(cacheKey(options));
        reject(error);
      } }));
    },
  };
  fixture.load.peek = options => cached.get(cacheKey(options)) || null;
  fixture.load.isCurrent = (options, data) => Boolean(data && cached.get(cacheKey(options)) === data);
  fixture.load.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  fixture.IntersectionObserver = observer ? class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
  } : undefined;
  fixture.window = { IntersectionObserver: fixture.IntersectionObserver };
  const fixtureKey = `__reviewReplayUI${++fixtureId}`;
  globalThis[fixtureKey] = fixture;
  const imports = `
    import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
    import * as Icons from ${JSON.stringify(import.meta.resolve('lucide-react'))};
    const fixture = globalThis[${JSON.stringify(fixtureKey)}];
    const React = { ...ActualReact };
    for (const hook of ['useState', 'useRef', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback']) React[hook] = (...args) => fixture.active ? fixture[hook](...args) : ActualReact[hook](...args);
    const { useState, useRef, useEffect, useLayoutEffect, useMemo } = React;
    const { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search, Plus, MoreHorizontal, Pin, MessageCircle, Pencil, Trash2, ChevronDown, Check, Bell } = Icons;
    const { document, window, IntersectionObserver } = fixture;
  `;
  try {
    const compiled = await transformWithOxc(`${imports}
      import { normalizeInvestmentSymbol } from ${moduleUrl('investmentComparisonModel')};
      import { stockDetailChartDragIntent } from ${moduleUrl('watchlistStockDetail')};
      import { buildReviewStockReplay, collectReviewReplayTrades, isReviewReplayBuyHighlight, reviewReplayRequestRange, reviewReplayVisibleRows } from ${moduleUrl('reviewStockReplayModel')};
      const loadReviewStockReplayHistory = fixture.load;
      const getInvestmentComparisonExpectedCloseDate = () => ${JSON.stringify(endDate)};
      const createPortal = tree => tree;
      ${source.slice(source.indexOf('const clamp =')).replaceAll('import.meta.env.DEV', 'true')}
      export { ReviewStockReplay, ScopedReplay, ReplayChart, ReplayDialog };
    `, 'ReviewStockReplayUITest.jsx', { jsx: { runtime: 'classic' } });
    fixture.components = await import(dataUrl(compiled.code));
    const page = await transformWithOxc(`${imports}
      import { createQuoteAssistantSaveBridge } from ${moduleUrl('quoteAssistantTriggers')};
      const quoteAssistantApi={}, QuoteAssistantWorkbench=()=>null, QuoteAssistantAccessPanel=()=>null;
      import { reviewJournalFeed } from ${moduleUrl('reviewJournalFeed')};
      import { readReviewAudiencePreference, writeReviewAudiencePreference } from ${moduleUrl('reviewAudiencePreferences')};
      import { findReviewStockMentions } from ${moduleUrl('reviewStockMentions')};
      import { mergeReviewTimelineFeed, reviewTimelineFeedDate } from ${moduleUrl('reviewTimelineFeed')};
      import { groupReviewTimelineEvents } from ${moduleUrl('reviewTimelineGroups')};
      import { reviewCommentPostsForDetail, reviewAuthorCommentForManagement, reviewCommunityPostAllowed } from ${moduleUrl('reviewThreadContext')};
      import { findReviewEntryByKey, projectReviewTimelineEntry, resolveReviewReplySource, resolveReviewTimelineEvent, reviewTimelineAnchorEntry, reviewTimelineReplyKey } from ${moduleUrl('reviewTimelineEntries')};
      import ReviewActivityTime from ${JSON.stringify(new URL('../src/components/ReviewActivityTime.js', import.meta.url).href)};
      const ReviewStockCarousel = fixture.ReviewStockCarousel = () => null;
      const ReviewStockText = () => null, ReviewPostBody = () => null;
      const ReviewPublicFeed = () => null, ReviewCommentThreads = () => null, ReviewTimeline = () => null, ReviewPreferences = () => null, ReviewTimelinePost = () => null;
      const ReviewNotifications=()=>null;
      const useReviewNotificationCount=()=>({unreadCount:0,error:false,update:()=>{}});
      const useReviewPreferences = () => ({
        preferences: { showTimeline: false, currency: 'USD', eventTypes: [] },
        ready: true, loading: false, canEdit: true, saving: false, error: '',
        updatePreferences: async () => true, retry: async () => {},
      });
      const ReviewEvaluationComposer = () => null, EvaluationRating = () => null, ReviewAccountCard = () => null, ReviewTradeReferences = () => null, EmojiPicker = () => null;
      const Avatar = () => null, AuthorName = () => null, Photo = () => null, SnapshotCard = () => null, Composer = () => null;
      const Dialog = ({ children }) => React.createElement('section', { role: 'dialog' }, children);
      ${pageSource.slice(pageSource.indexOf('function AlwaysPinIcon')).replaceAll('import.meta.env.DEV', 'true')}
    `, 'ReviewJournalReplayUITest.jsx', { jsx: { runtime: 'classic' } });
    fixture.Page = (await import(dataUrl(page.code))).default;
  } finally { delete globalThis[fixtureKey]; }
  return {
    components: fixture.components, Carousel: fixture.ReviewStockCarousel, Page: fixture.Page, requests, observers,
    seedHistory(data, overrides = {}) {
      const props = { ...baseProps, ...overrides };
      cached.set(cacheKey({ userId: props.userId, symbols: [props.symbol, 'QQQ'], ...reviewReplayRequestRange(collectReviewReplayTrades(props), endDate) }), data);
    },
    invalidateCache() { cached.clear(); for (const listener of listeners) listener(); },
    render(component, props, runEffects = false) {
      cursor = 0; effects = []; fixture.active = true;
      let tree;
      try { tree = component(props); } finally { fixture.active = false; }
      // Only the card's host ref is needed by its real visibility effect.
      for (const node of walk(tree)) if (node.type === 'section' && node.ref) node.ref.current = { nodeName: 'SECTION' };
      if (runEffects) for (const effect of effects) effect();
      return tree;
    },
    card(props = {}) { return this.render(this.components.ScopedReplay, { ...baseProps, ...props }, true); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); slots = []; },
  };
}

test('a visible card fetches and draws history before the replay dialog is opened', async () => {
  const h = await harness();
  let tree = h.card();
  await flush();
  assert.equal(h.requests.length, 0, 'offscreen cards should not eagerly fetch');
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].node.nodeName, 'SECTION');
  h.observers[0].callback([{ isIntersecting: false }]); h.card(); await flush();
  assert.equal(h.requests.length, 0);
  h.observers[0].callback([{ isIntersecting: true }]);
  tree = h.card(); await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(find(tree, node => node.type === h.components.ReplayDialog), undefined);
  assert.match(markup(tree), /正在读取走势/);
  assert.equal(h.requests[0].options.userId, userId);
  assert.deepEqual(h.requests[0].options.symbols, ['NVDA', 'QQQ']);
  h.requests[0].resolve(history); await flush();
  tree = h.card();
  assert.match(markup(tree), /rsr-price-path/);
  assert.doesNotMatch(markup(tree), /只读回放|查看交易与走势|<footer/);
  find(tree, node => hasClass(node, 'rsr-card-open')).props.onClick();
  tree = h.card(); await flush();
  assert.equal(h.requests.length, 1, 'opening a loaded card must reuse its history');
  assert.equal(find(tree, node => node.type === h.components.ReplayDialog).props.recordDate, recordDate);
  h.unmount();
});

test('remount draws validated cached history on its first render without a loading flash', async () => {
  const h = await harness({ observer: false });
  h.seedHistory(history);
  let tree = h.card();
  assert.match(markup(tree), /rsr-price-path/);
  assert.doesNotMatch(markup(tree), /正在读取走势/);
  tree = h.card(); await flush();
  assert.equal(h.requests.length, 1, 'visible cards still check their cache/session policy in the background');
  assert.match(markup(tree), /rsr-price-path/);
  find(tree, node => hasClass(node, 'rsr-card-open')).props.onClick();
  tree = h.card();
  assert.equal(find(tree, node => node.type === h.components.ReplayDialog).props.loading, false);
  h.unmount();
});

test('editing trades updates markers without reloading unchanged history, but a changed range has no wrong cached chart', async () => {
  const h = await harness({ observer: false });
  h.seedHistory(history); h.card(); h.card(); await flush();
  h.requests[0].resolve(history); await flush();
  const changed = stockTrades.map(row => row.id === 'review-buy' ? { ...row, price: 150, shares: 7 } : row);
  let tree = h.card({ stockTrades: changed }); await flush();
  assert.equal(chartIn(tree, h).props.trades.find(row => row.id === 'review-buy').shares, 7);
  assert.equal(h.requests.length, 1);
  tree = h.card({ stockTrades: [trade('earlier', '2024-04-02'), ...changed] }); await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(chartIn(tree, h), undefined, 'different history windows cannot render the old curve');
  h.unmount();
});

test('background network failure retains a cached curve and retry, while identity invalidation clears a mounted chart', async () => {
  const h = await harness({ observer: false });
  h.seedHistory(history); h.card(); h.card(); await flush();
  h.requests[0].reject({ code: 'NETWORK_ERROR' }); await flush();
  let tree = h.card();
  assert.match(markup(tree), /rsr-price-path/);
  assert.match(markup(tree), /已缓存走势/);
  h.invalidateCache();
  tree = h.card();
  assert.equal(chartIn(tree, h), undefined);
  assert.match(markup(tree), /历史行情暂不可用/);
  h.unmount();
});

test('a replay dialog keeps its cached curve visible during background refresh and exposes retry on failure', async () => {
  const h = await harness();
  const tree = h.render(h.components.ReplayDialog, { symbol: 'NVDA', model, loading: true, error: 'NETWORK_ERROR', onClose() {}, onRetry() {} });
  assert.ok(chartIn(tree, h));
  assert.doesNotMatch(markup(tree), /正在读取历史行情/);
  assert.match(markup(tree), /正在显示已缓存的历史行情/);
  h.unmount();
});

test('without IntersectionObserver history still loads automatically; unmount aborts the subscription', async () => {
  const h = await harness({ observer: false });
  h.card(); h.card(); await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.signal.aborted, false);
  h.unmount();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(history); await flush();
  const fresh = h.card();
  assert.equal(chartIn(fresh, h), undefined, 'an obsolete response cannot populate a remounted card');
  h.unmount();
});

test('signed-out cards do not request private history even when visible', async () => {
  const h = await harness({ observer: false });
  h.card({ userId: '' });
  const tree = h.card({ userId: '' }); await flush();
  assert.equal(h.requests.length, 0);
  assert.match(markup(tree), /历史行情暂不可用/);
  h.unmount();
});

test('the mini chart retains the complete history and old trade markers without a trade-count summary', async () => {
  for (const language of ['zh', 'en']) {
    const h = await harness({ observer: false });
    h.card({ language }); h.card({ language }); await flush();
    h.requests[0].resolve(history); await flush();
    const tree = h.card({ language }), chart = chartIn(tree, h), html = markup(tree);
    assert.ok(rows.length > 65);
    assert.equal(chart.props.rows.length, rows.length);
    assert.equal(chart.props.rows[0].date, rows[0].date);
    assert.equal(chart.props.rows.at(-1).date, rows.at(-1).date);
    assert.equal(chart.props.recordDate, recordDate);
    assert.equal((html.match(/class="rsr-mini-dot"/g) || []).length, stockTrades.length, 'the old buy must survive the former 65-row truncation');
    assert.equal((html.match(/class="rsr-price-path" d="([^"]+)"/)?.[1].match(/[ML]/g) || []).length, rows.length);
    assert.match(html, />2025\/04\/01<.*>2026\/10\/06</, 'multi-year history labels must make the year visible');
    assert.doesNotMatch(html, /\d+\s*笔交易|\d+\s+trades|rsr-card-summary/);
    h.unmount();
  }
});

test('mini charts fill the available width for year-start and later histories without clipping endpoint trades', async () => {
  const h = await harness();
  for (const startDate of ['2026-01-01', '2026-07-21']) {
    const chartRows = rows.filter(row => row.date >= startDate).map((row, index) => ({ ...row, gapBefore: index === 2 }));
    const trades = [chartRows[0], chartRows.at(-1)].map((row, index) => ({ key: `edge-${index}`, date: row.date, markerDate: row.date, rowIndex: index ? chartRows.length - 1 : 0, side: index ? 'sell' : 'buy' }));
    const tree = h.render(h.components.ReplayChart, { rows: chartRows, trades, recordDate: chartRows[0].date, mini: true });
    const svg = find(tree, node => node.type === 'svg'), width = Number(svg.props.viewBox.split(' ')[2]);
    const path = find(tree, node => hasClass(node, 'rsr-price-path')).props.d;
    const coordinates = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    const left = coordinates[0][0], right = coordinates.at(-1)[0];
    assert.ok((right - left) / width >= .9, 'the actual history must occupy at least 90% of the SVG width');
    assert.equal(left, width - right, 'cards must not reserve a one-sided price-axis gutter');
    assert.equal(coordinates.length, chartRows.length, 'keep every historical close');
    assert.equal((path.match(/M/g) || []).length, 2, 'missing sessions remain separate path segments');
    const marks = walk(tree).filter(node => hasClass(node, 'rsr-mini-dot'));
    assert.deepEqual(marks.map(node => node.props.cx).sort((a, b) => a - b), [left, right]);
    assert.ok(marks.every(node => node.props.cx - Number(node.props.r) >= 2 && node.props.cx + Number(node.props.r) <= width - 2), 'edge markers retain room for their outline');
    const dates = walk(tree).filter(node => hasClass(node, 'rsr-axis'));
    assert.deepEqual(dates.map(node => node.props.x), [left, right]);
    h.unmount();
  }
  const declarations = selector => Object.fromEntries(css.nodes.filter(node => node.type === 'rule' && node.selector === selector).flatMap(rule => rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])));
  const svgStyle = declarations('.rsr-chart-touch>svg');
  assert.equal(svgStyle.width, '100%');
  assert.equal(svgStyle.height, 'auto');
  assert.equal(declarations('.rsr-chart-mini .rsr-chart-touch>svg')['max-height'], undefined, 'capping height letterboxes the SVG in wider cards');
});

test('mini and full charts highlight only the exact review-date buy, preserving sell and other buy nodes', async () => {
  const h = await harness();
  for (const mini of [true, false]) {
    const tree = h.render(h.components.ReplayChart, { rows: model.rows, trades: model.trades, recordDate, mini, selectedTrade: model.trades.at(-1) });
    const marks = walk(tree).filter(node => node.type === 'g' && /rsr-(buy|sell)/.test(node.props.className || ''));
    assert.equal(marks.length, stockTrades.length);
    assert.deepEqual(marks.filter(node => hasClass(node, 'rsr-review-buy')).map(node => node.key), [model.trades.find(row => row.id === 'review-buy').key]);
    assert.ok(marks.filter(node => hasClass(node, 'rsr-sell')).every(node => !node.props['data-review-buy']));
    if (!mini) {
      const buttons = walk(tree).filter(node => node.type === 'button');
      assert.equal(buttons.filter(node => node.props['data-review-buy']).length, 1);
      assert.match(buttons.find(node => node.props['data-review-buy']).props['aria-label'], /2026-04-07 买入/);
      assert.equal(buttons.find(node => node.props['aria-pressed']).props['data-review-buy'], undefined, 'selection alone must not color another buy red');
    }
    h.unmount();
  }
  const weekend = h.render(h.components.ReplayChart, { rows: model.rows, trades: model.trades, recordDate: '2026-04-04', mini: true });
  assert.doesNotMatch(markup(weekend), /rsr-review-buy|data-review-buy/);
  const highlight = [];
  css.walkRules('.rsr-review-buy', rule => rule.walkDecls('--rsr-side', declaration => highlight.push(declaration.value)));
  assert.ok(highlight.length, 'the highlighted buy class must define its marker color');
  const color = highlight.at(-1);
  assert.match(color, /^#[\da-f]{6}$/i);
  const [red, green, blue] = color.slice(1).match(/../g).map(value => parseInt(value, 16));
  assert.ok(red > 200 && red > green * 2 && red > blue * 2, 'review-date buys use a distinct red marker');
  h.unmount();
});

test('trades without a close use a separate date rail without inventing prices or moving out-of-range dates', async () => {
  const dailyRows = [{ date: '2026-07-02', close: 100 }, { date: '2026-07-06', close: 110 }, { date: '2026-07-08', close: 120 }];
  const replay = buildReviewStockReplay({ ...baseProps, endDate: '2026-07-08',
    history: { ...history, series: { NVDA: { rows: dailyRows } } },
    stockTrades: [trade('before', '2026-07-01'), trade('weekend-buy', '2026-07-04'), trade('weekend-sell', '2026-07-04', 'sell'),
      trade('missing-session', '2026-07-07'), trade('exact', '2026-07-08'), trade('future', '2026-07-09')] });
  const weekendIndex = replay.trades.findIndex(record => record.id === 'weekend-buy');
  const weekend = replay.trades[weekendIndex];
  assert.deepEqual([weekend.date, weekend.markerDate, weekend.close, weekend.rowIndex], ['2026-07-04', null, null, -1]);
  const h = await harness();
  for (const mini of [true, false]) {
    let selected;
    const tree = h.render(h.components.ReplayChart, { rows: replay.rows, trades: replay.trades, mini,
      selectedTrade: weekend, selectedDate: weekend.date, recordDate: weekend.date, onSelectTrade: index => { selected = index; } });
    const marks = walk(tree).filter(node => node.type === 'g' && /rsr-(buy|sell)/.test(node.props.className || ''));
    assert.equal(marks.length, 4, 'retain in-range missing-date trades and exact closes, excluding before-history and future records');
    const missing = marks.filter(node => hasClass(node, 'rsr-unpriced'));
    assert.equal(missing.length, 3);
    const rail = find(tree, node => hasClass(node, 'rsr-date-rail'));
    const dateLabels = walk(tree).filter(node => node.type === 'text' && node.props.children?.includes?.('/'));
    assert.ok(rail.props.y1 > 166 + 12, 'the date rail stays below the entire price plot');
    assert.ok(dateLabels.every(node => node.props.y > rail.props.y1 + 20), 'date labels remain below the separate markers');
    for (const mark of missing) {
      assert.equal(find(mark, node => hasClass(node, 'rsr-node-anchor') || hasClass(node, 'rsr-node-stem')), undefined);
      assert.equal(mark.props['data-review-buy'], undefined, 'no exact-close highlight for a missing close');
    }
    assert.equal(find(tree, node => hasClass(node, 'rsr-inspection')), undefined, 'no cursor can imply a close on the recorded weekend');
    const pricePath = find(tree, node => hasClass(node, 'rsr-price-path')).props.d;
    const x = [...pricePath.matchAll(/[ML]([\d.]+)/g)].map(match => Number(match[1]));
    if (mini) {
      const dot = find(marks.find(mark => mark.key === weekend.key), node => hasClass(node, 'rsr-mini-dot'));
      assert.equal(dot.props.cx, (x[0] + x[1]) / 2, 'July 4 lies midway between July 2 and July 6');
      const sell = find(marks.find(mark => mark.key === replay.trades.find(record => record.id === 'weekend-sell').key), node => hasClass(node, 'rsr-mini-dot'));
      assert.equal(sell.props.cx, dot.props.cx);
      assert.ok(sell.props.cy - dot.props.cy >= 24, 'same-date missing-close buy and sell remain separately visible');
    } else {
      const button = find(tree, node => node.type === 'button' && node.key === weekend.key);
      assert.match(button.props['aria-label'], /2026-07-04 买入.*当日无收盘行情/);
      assert.equal(parseFloat(button.props.style.left) * 360 / 100, (x[0] + x[1]) / 2);
      assert.equal(button.props['aria-pressed'], true);
      button.props.onClick(); assert.equal(selected, weekendIndex, 'selection preserves the original ledger index');
      const sell = find(tree, node => node.type === 'button' && node.key === replay.trades.find(record => record.id === 'weekend-sell').key);
      assert.equal(sell.props.style.left, button.props.style.left);
      assert.notEqual(sell.props.style.top, button.props.style.top, 'opposite directions must not cover each other');
    }
    h.unmount();
  }
  assert.equal(h.render(h.components.ReplayChart, { rows: [], trades: replay.trades }), null);
  h.unmount();
  const single = h.render(h.components.ReplayChart, { rows: [replay.rows[0]], trades: [weekend], mini: true });
  assert.equal(find(single, node => hasClass(node, 'rsr-unpriced')), undefined);
  h.unmount();
  const props = { symbol: 'NVDA', model: replay, loading: false, error: '', onClose() {}, onRetry() {} };
  let dialog = h.render(h.components.ReplayDialog, props);
  chartIn(dialog, h).props.onSelectTrade(weekendIndex, false);
  dialog = h.render(h.components.ReplayDialog, props);
  assert.equal(chartIn(dialog, h).props.selectedDate, weekend.date);
  const readout = markup(find(dialog, node => hasClass(node, 'rsr-readout')));
  assert.match(readout, /2026-07-04.*拆股复权收盘.*—/);
  assert.doesNotMatch(readout, /\$100|\$110|\$120/);
  h.unmount();
});

test('historical holdings use a separate summary and never create ordinary or hollow buy markers', async () => {
  const holding = { ...trade('holding', '2026-07-04'), note: withStockTradeRecordKind('Imported average', 'historical_holding'), price: 125.75, shares: 300 };
  const replay = buildReviewStockReplay({ ...baseProps, stockTrades: [holding, { ...holding, id: 'session-holding', date: recordDate }, trade('sale', '2026-10-05', 'sell')], history, endDate });
  const h = await harness();
  for (const mini of [true, false]) {
    const tree = h.render(h.components.ReplayChart, { rows: replay.rows, trades: replay.trades, mini, selectedTrade: replay.trades[0], selectedDate: null, recordDate });
    assert.equal(walk(tree).filter(node => node.type === 'g' && /rsr-(buy|sell)/.test(node.props.className || '')).length, 1);
    assert.equal(find(tree, node => hasClass(node, 'rsr-unpriced') || hasClass(node, 'rsr-inspection')), undefined);
    h.unmount();
  }
  const props = { symbol: 'NVDA', model: replay, loading: false, error: '', onClose() {}, onRetry() {} };
  let dialog = h.render(h.components.ReplayDialog, props);
  chartIn(dialog, h).props.onSelectTrade(0, false);
  dialog = h.render(h.components.ReplayDialog, props);
  assert.equal(chartIn(dialog, h).props.selectedDate, null);
  assert.match(markup(find(dialog, node => hasClass(node, 'rsr-readout'))), /历史持仓 · 平均成本.*\$125\.75/);
  const card = walk(dialog).find(node => hasClass(node, 'rsr-trade'));
  assert.match(markup(card), /历史持仓.*录入于.*平均成本.*持仓数量/);
  assert.doesNotMatch(markup(card), /实际成交价|当日复权收盘/);
  chartIn(dialog, h).props.onSelectDate(recordDate);
  dialog = h.render(h.components.ReplayDialog, props);
  assert.match(markup(find(dialog, node => hasClass(node, 'rsr-readout'))), /拆股复权收盘/);
  chartIn(dialog, h).props.onSelectDate('2020-01-01');
  dialog = h.render(h.components.ReplayDialog, props);
  assert.equal(chartIn(dialog, h).props.selectedDate, null, 'stale inspection never selects the historical entry date');
  assert.match(markup(find(dialog, node => hasClass(node, 'rsr-readout'))), /历史持仓 · 平均成本/);
  h.unmount();
  const cardTree = h.card({ stockTrades: [holding], previewHistory: { ...history, synthetic: true, asOfDate: endDate } });
  assert.match(markup(find(cardTree, node => hasClass(node, 'rsr-holding-caption'))), /含历史持仓记录/);
  h.unmount();
});

test('the dialog opens on all history, selects the review buy, and switches six-month/year/all views locally', async () => {
  const h = await harness();
  const props = { symbol: 'NVDA', model, loading: false, error: '', recordDate, onClose() {}, onRetry() {} };
  let tree = h.render(h.components.ReplayDialog, props);
  const selectedRange = () => find(tree, node => node.type === 'nav').props.children.find(node => node.props['aria-pressed']).props.children;
  const selectRange = label => {
    find(tree, node => node.type === 'button' && node.props.children === label).props.onClick();
    tree = h.render(h.components.ReplayDialog, props);
    assert.equal(selectedRange(), label);
    return chartIn(tree, h).props.rows;
  };
  assert.equal(selectedRange(), '全部');
  assert.equal(chartIn(tree, h).props.rows.length, rows.length);
  assert.equal(chartIn(tree, h).props.selectedTrade.id, 'review-buy');
  const halfYear = selectRange('6个月');
  assert.equal(halfYear[0].date, '2026-01-07');
  assert.equal(halfYear.at(-1).date, '2026-07-06');
  const year = selectRange('1年');
  assert.equal(year[0].date, '2025-10-06');
  assert.equal(year.at(-1).date, endDate);
  assert.ok(year.length > halfYear.length);
  assert.equal(selectRange('全部').length, rows.length);
  assert.equal(h.requests.length, 0);
  h.unmount();
});

test('journal posts preserve stock order and entry dates in each carousel', async () => {
  const h = await harness();
  const entries = [
    { id: 'review-a', date: recordDate, text: 'Review A', stocks: ['NVDA', 'TSM'] },
    { id: 'review-b', date: '2026-10-05', text: 'Review B', stocks: ['NVDA'] },
  ];
  const props = { ctx: { userId, stockTrades, reviewLogs: entries, db: { readCachedReviewIdentity: () => null } } };
  let tree = h.render(h.Page, props);
  find(tree,node=>node.type==='button'&&node.props.children==='复盘日志').props.onClick();
  tree=h.render(h.Page,props);
  const replays = () => walk(tree).filter(node => node.type === h.Carousel);
  assert.deepEqual(replays().flatMap(node => node.props.symbols.map(symbol => [symbol, node.props.recordDate])), [['NVDA', '2026-10-05'], ['NVDA', recordDate], ['TSM', recordDate]]);
  for (const replay of replays()) {
    assert.equal(replay.props.userId, userId);
    assert.equal(replay.props.stockTrades, stockTrades);
  }
  h.unmount();
});
