import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { reviewDraftKey } from '../src/lib/reviewJournalFeed.js';

const source = readFileSync(new URL('../src/pages/ReviewJournalPage.jsx', import.meta.url), 'utf8');
const composerSource = source.slice(source.indexOf('function Composer('), source.indexOf('export default function ReviewJournalPage'));
const lib = name => JSON.stringify(new URL(`../src/lib/${name}.js`, import.meta.url).href);
const userId = 'mention-ui-owner';
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const find = (tree, predicate) => walk(tree).find(predicate);
const linkedStocks = tree => walk(tree).filter(node => node.type === 'button' && node.props['aria-label']?.startsWith('移除关联股票 ')).map(node => node.props['aria-label'].slice('移除关联股票 '.length));
let fixtureId = 0;

async function harness({ entry, storage = new Map() } = {}) {
  let slots = [], cursor = 0, effects = [], tree;
  const saves = [], published = [], closes = [];
  const fixture = {
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useMemo(factory, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      previous?.cleanup?.();
      const slot = { deps }; slots[index] = slot;
      effects.push(() => { slot.cleanup = effect(); });
    },
  };
  const fixtureKey = `__reviewMentionsUI${++fixtureId}`;
  globalThis[fixtureKey] = fixture;
  let components;
  try {
    const compiled = await transformWithOxc(`
      import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
      import { ImagePlus, LineChart, Activity, Smile, MoreHorizontal, X, Loader2 } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import { emptyReviewEntry, localReviewDate, reviewDraftKey, restoreReviewDraft } from ${lib('reviewJournalFeed')};
      import { resolveReviewStockLinks } from ${lib('reviewStockMentions')};
      const fixture = globalThis[${JSON.stringify(fixtureKey)}];
      const React = { ...ActualReact, ...fixture };
      const { useState, useRef, useEffect, sessionStorage } = fixture;
      const Dialog = ({ title, headerAction, children }) => React.createElement('section', { 'aria-label': title }, headerAction, children);
      const Avatar = () => null, AuthorName = () => null, Photo = () => null, SnapshotCard = () => null, SnapshotPicker = () => null, EmojiPicker = () => null, SymbolPicker = () => null;
      ${composerSource}
      export { Composer, SymbolPicker };
    `, 'ReviewStockMentionsUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[fixtureKey]; }
  const props = {
    entry, defaultType: 'log', userId, suggestions: ['NVDA', 'TSM', 'QQQ', 'SPY', 'SMH'], language: 'zh',
    db: { async saveReviewJournalEntry(payload, owner) { saves.push({ payload, owner }); return { ...payload, id: entry?.id || 'created-entry' }; } },
    onSaved: value => published.push(value), onClose: () => closes.push(true),
  };
  const h = {
    saves, published, closes, storage,
    render() {
      cursor = 0; effects = [];
      tree = components.Composer(props);
      for (const effect of effects) effect();
      return tree;
    },
    type(text) { find(tree, node => node.props['aria-label'] === '复盘正文').props.onChange({ target: { value: text } }); return h.render(); },
    stocks: () => linkedStocks(tree),
    remove(symbol) { find(tree, node => node.props['aria-label'] === `移除关联股票 ${symbol}`).props.onClick(); return h.render(); },
    picker() {
      find(tree, node => node.props['aria-label'] === '股票').props.onClick(); h.render();
      return find(tree, node => node.type === components.SymbolPicker).props;
    },
    draft: () => JSON.parse(storage.get(reviewDraftKey(userId))),
    async save() {
      assert.equal(tree.props.headerAction.props.disabled, false);
      await tree.props.headerAction.props.onClick();
      assert.equal(saves.length, 1);
      assert.equal(saves[0].owner, userId);
      assert.equal(Object.hasOwn(saves[0].payload, 'excludedStocks'), false, 'UI-only exclusions must never reach the saved entry');
      assert.equal(published.length, 1); assert.equal(closes.length, 1);
      return saves[0].payload;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); slots = []; },
  };
  h.render();
  return h;
}

test('new posts derive stock links from first mention, reorder immediately, and save that order', async () => {
  const h = await harness();
  h.type('先看 $TSM，再观察 $NVDA，最后再看 $TSM。');
  assert.deepEqual(h.stocks(), ['TSM', 'NVDA']);
  assert.deepEqual(h.draft().stocks, [], 'automatic links remain derived instead of becoming manual selections');
  h.type('现在先分析 $NVDA，然后再看 $TSM。');
  assert.deepEqual(h.stocks(), ['NVDA', 'TSM']);
  h.type('暂时删除所有股票引用。');
  assert.deepEqual(h.stocks(), []);
  const tree = h.type('先看 $TSM，然后研究 $NVDA。');
  assert.match(renderToStaticMarkup(tree), /移除关联股票 TSM.*移除关联股票 NVDA/);
  assert.deepEqual((await h.save()).stocks, ['TSM', 'NVDA']);
  h.unmount();
});

test('editing reorders by the current text and retains existing manual stocks absent from the text', async () => {
  const entry = { id: 'existing-entry', type: 'log', date: '2026-11-06', text: '先看 $TSM，后看 $NVDA。', stocks: ['NVDA', 'SPY'] };
  const h = await harness({ entry });
  assert.deepEqual(h.stocks(), ['TSM', 'NVDA', 'SPY']);
  assert.match(renderToStaticMarkup(h.render()), /编辑复盘/);
  h.type('改为先研究 $SPY，然后看 $TSM。');
  assert.deepEqual(h.stocks(), ['SPY', 'TSM', 'NVDA']);
  const payload = await h.save();
  assert.equal(payload.id, entry.id);
  assert.deepEqual(payload.stocks, ['SPY', 'TSM', 'NVDA']);
  h.unmount();
});

test('removing an automatic link survives more typing and restoring the saved draft', async () => {
  const h = await harness();
  h.type('$NVDA 与 $TSM 的复盘。');
  h.remove('NVDA');
  assert.deepEqual(h.stocks(), ['TSM']);
  h.type('$NVDA 与 $TSM 的复盘，继续补充 $NVDA。');
  assert.deepEqual(h.stocks(), ['TSM']);
  assert.deepEqual(h.draft().excludedStocks, ['NVDA']);
  h.unmount();
  const restored = await harness({ storage: h.storage });
  assert.deepEqual(restored.stocks(), ['TSM']);
  restored.type('$NVDA 仍在正文里，接着分析 $TSM。');
  assert.deepEqual(restored.stocks(), ['TSM']);
  assert.deepEqual((await restored.save()).stocks, ['TSM']);
  assert.equal(restored.storage.has(reviewDraftKey(userId)), false, 'successful publication clears the local draft');
  restored.unmount();
});

test('picker additions remain manual while existing automatic selections remain derived', async () => {
  const h = await harness();
  h.type('关注 $NVDA。');
  const picker = h.picker();
  assert.deepEqual(picker.selected, ['NVDA']);
  assert.equal(picker.text, '关注 $NVDA。');
  picker.onChange(['NVDA', 'QQQ']); picker.onClose(); h.render();
  assert.deepEqual(h.draft().stocks, ['QQQ']);
  h.type('正文改为讨论 $TSM。');
  assert.deepEqual(h.stocks(), ['TSM', 'QQQ']);
  h.type('正文不再提及任何股票。');
  assert.deepEqual(h.stocks(), ['QQQ']);
  assert.deepEqual((await h.save()).stocks, ['QQQ']);
  h.unmount();
});

test('a full manual selection remains intact and exposes the automatic-link limit notice', async () => {
  const manual = ['SPY', 'QQQ', 'TSM', 'SMH'];
  const h = await harness({ entry: { id: 'full-entry', type: 'log', date: '2026-11-06', text: '新增关注 $NVDA。', stocks: manual } });
  assert.deepEqual(h.stocks(), manual);
  const status = find(h.render(), node => node.props.role === 'status');
  assert.ok(status, 'omitted automatic symbols must be visible to the author');
  assert.match(renderToStaticMarkup(status), /最多 4 只/);
  assert.deepEqual((await h.save()).stocks, manual);
  h.unmount();
});
