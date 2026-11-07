import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { parse } from 'postcss';
import { buildReviewStockReplay } from '../src/lib/reviewStockReplayModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

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
      return new Promise((resolve, reject) => requests.push({ options, resolve, reject }));
    },
  };
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
    const { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search, Plus, MoreHorizontal, Pin, MessageCircle, Pencil, Trash2 } = Icons;
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
      import { reviewJournalFeed } from ${moduleUrl('reviewJournalFeed')};
      import { findReviewStockMentions } from ${moduleUrl('reviewStockMentions')};
      import { mergeReviewTimelineFeed, reviewTimelineFeedDate } from ${moduleUrl('reviewTimelineFeed')};
      import { groupReviewTimelineEvents } from ${moduleUrl('reviewTimelineGroups')};
      import { findReviewEntryByKey, projectReviewTimelineEntry, resolveReviewReplySource, resolveReviewTimelineEvent, reviewTimelineAnchorEntry, reviewTimelineReplyKey } from ${moduleUrl('reviewTimelineEntries')};
      const ReviewStockCarousel = fixture.ReviewStockCarousel = () => null;
      const ReviewPostBody = () => null;
      const ReviewTimeline = () => null, ReviewPreferences = () => null, ReviewTimelinePost = () => null;
      const useReviewPreferences = () => ({
        preferences: { showTimeline: false, currency: 'USD', eventTypes: [] },
        ready: true, loading: false, canEdit: true, saving: false, error: '',
        updatePreferences: async () => true, retry: async () => {},
      });
      const ReviewEvaluationComposer = () => null, EvaluationRating = () => null, ReviewAccountCard = () => null, ReviewTradeReferences = () => null, EmojiPicker = () => null;
      const Avatar = () => null, AuthorName = () => null, Photo = () => null, SnapshotCard = () => null, Composer = () => null;
      const Dialog = ({ children }) => React.createElement('section', { role: 'dialog' }, children);
      ${pageSource.slice(pageSource.indexOf('export default function ReviewJournalPage')).replaceAll('import.meta.env.DEV', 'true')}
    `, 'ReviewJournalReplayUITest.jsx', { jsx: { runtime: 'classic' } });
    fixture.Page = (await import(dataUrl(page.code))).default;
  } finally { delete globalThis[fixtureKey]; }
  return {
    components: fixture.components, Carousel: fixture.ReviewStockCarousel, Page: fixture.Page, requests, observers,
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
  const tree = h.render(h.Page, props);
  const replays = () => walk(tree).filter(node => node.type === h.Carousel);
  assert.deepEqual(replays().flatMap(node => node.props.symbols.map(symbol => [symbol, node.props.recordDate])), [['NVDA', '2026-10-05'], ['NVDA', recordDate], ['TSM', recordDate]]);
  for (const replay of replays()) {
    assert.equal(replay.props.userId, userId);
    assert.equal(replay.props.stockTrades, stockTrades);
  }
  h.unmount();
});
