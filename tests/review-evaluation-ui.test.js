import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';
import { withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';

const source = readFileSync(new URL('../src/components/ReviewEvaluation.jsx', import.meta.url), 'utf8');
const moduleUrl = name => JSON.stringify(new URL(`../src/lib/${name}.js`, import.meta.url).href);
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : []
  : [tree, ...walk(tree.props.children), ...walk(tree.props.headerAction)];
const text = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.map(text).join('') : String(tree ?? '') : text(tree.props.children);
const find = (tree, predicate) => walk(tree).find(predicate);
const button = (tree, name) => find(tree, node => node.type === 'button' && (node.props['aria-label'] === name || text(node) === name));
const rating = tree => find(tree, node => node.props.role === 'slider');
const body = tree => find(tree, node => node.type === 'textarea');
const alert = tree => walk(tree).filter(node => node.props.role === 'alert').map(text).join(' ');
let nextId = 0;

test('trade attachment choices never convert explicit aggregate holdings into actual executions', async () => {
  const h = await harness();
  const base = { user_id: 'owner', symbol: 'NVDA', date: '2025-07-04', side: 'buy', price: 120, shares: 10 };
  const tree = h.renderTrades({ selected: [], stockTrades: [{ ...base, id: 'holding', note: withStockTradeRecordKind('', 'historical_holding') }, { ...base, id: 'execution' }], userId: 'owner', onChange() {}, onClose() {} });
  const choices = walk(tree).filter(node => node.props.className === 'rev-trade-choice');
  assert.deepEqual(choices.map(node => node.key), ['execution']);
});

async function harness({ append, update, reply = null, clock = null } = {}) {
  const slots = [], calls = [], updates = [], saved = [], listeners = new Map(); let cursor = 0, effects = [], closes = 0;
  const fixture = {
    React: { ...React,
      useState(initial) { const index = cursor++; const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
        return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
      useRef(initial) { return slots[cursor++] ||= { current: initial }; },
      useEffect(effect, deps) { const index = cursor++, previous = slots[index];
        if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
        previous?.cleanup?.(); const slot = slots[index] = { deps }; effects.push(() => { slot.cleanup = effect(); }); },
    },
    document: { activeElement: { blur() {} } },
    window: { visualViewport: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } } },
    requestAnimationFrame: callback => callback(),
    Date: clock?.Date || Date,
  };
  const key = `__reviewEvaluationUI${++nextId}`; globalThis[key] = fixture;
  let components;
  try {
    const compiled = await transformWithOxc(`
      import { Activity, Check, ImagePlus, LineChart, Loader2, Smile, Star, Wallet, X } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import { localReviewDate as formatLocalReviewDate } from ${moduleUrl('reviewJournalFeed')};
      import { normalizeReviewEvaluationTags, normalizeReviewAccountSnapshot, normalizeReviewTradeReferences } from ${moduleUrl('reviewEvaluationModel')};
      import { collectReviewReplayTrades } from ${moduleUrl('reviewStockReplayModel')};
      import { keepReviewComposerInputVisible } from ${moduleUrl('reviewComposerVisibility')};
      import { marketTextHexColor } from ${moduleUrl('marketColorMode')};
      const { React, document, window, requestAnimationFrame, Date } = globalThis[${JSON.stringify(key)}];
      const localReviewDate = (now = new Date()) => formatLocalReviewDate(now);
      import { latestReviewAccountCloseDate as accountCloseDate, isReviewAccountCloseDate as isAccountCloseDate } from ${moduleUrl('reviewAccountSnapshot')};
      const getVixComparisonExpectedCloseDate = () => '2026-11-06';
      const latestReviewAccountCloseDate = () => accountCloseDate(Date.parse('2026-11-07T10:00:00Z'));
      const isReviewAccountCloseDate = date => isAccountCloseDate(date, Date.parse('2026-11-07T10:00:00Z'));
      const SnapshotCard = () => null, SnapshotPicker = () => null, ReviewStockReplay = () => null;
      ${source.slice(source.indexOf('const PRESET_TAGS'))}
      export { AccountPicker, TradePicker };
    `, 'ReviewEvaluationUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[key]; }
  const Dialog = () => null;
  const props = { open: true, reply, entry: { id: 'entry-1', type: 'log', revision: 4, date: '2026-11-06', text: '过去的判断', replies: reply ? [reply] : [] },
    identityNode: React.createElement('span', null, '作者'), userId: 'owner', stockTrades: [], Dialog, EmojiPicker: () => null,
    renderPhotos: () => null, knownTags: [],
    db: { async appendReviewJournalReply(entry, reply, owner) {
      calls.push({ entry, reply: structuredClone(reply), owner });
      return append ? append(entry, reply, owner) : { ...entry, revision: 5, replies: [...entry.replies, reply] };
    }, async updateReviewJournalReply(entry, original, replacement, owner) {
      updates.push({ entry, original, replacement: structuredClone(replacement), owner });
      return update ? update(entry, original, replacement, owner)
        : { ...entry, revision: 5, replies: entry.replies.map(item => item.id === original.id ? replacement : item) };
    } },
    onSaved: value => saved.push(value), onClose: () => { closes++; props.open = false; },
  };
  const render = (Component, componentProps) => { cursor = 0; effects = []; const tree = Component(componentProps);
      for (const node of walk(tree)) if (node.ref) node.ref.current = { focus() {}, selectionStart: 0, selectionEnd: 0, setSelectionRange() {}, getBoundingClientRect: () => ({ bottom: 800 }) };
      effects.forEach(effect => effect()); return tree; };
  return { props, calls, updates, saved, components, Dialog, closes: () => closes,
    render: () => render(components.default, props),
    renderAccount: accountProps => render(components.AccountPicker, { ...accountProps, Dialog }),
    renderTrades: tradeProps => render(components.TradePicker, { ...tradeProps, Dialog }),
    cleanup() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

function chooseScore(tree, score) {
  rating(tree).props.onPointerDown({ currentTarget: { getBoundingClientRect: () => ({ left: 10, width: 200 }) }, clientX: 10 + score * 20 - 1 });
}
function customForm(tree) { return find(tree, node => node.type === 'form'); }
function customInput(tree) { return find(tree, node => node.type === 'input' && node.props.id === 'rev-custom-tag'); }

test('new public comments and replies insert Quote at the selected text and keep the ordinary save path', async () => {
  for (const replyTarget of [null, { kind: 'community', id: 'target', nickname: '访客', available: true }]) {
    const h = await harness(); h.props.entry.visibility = 'public'; h.props.replyTarget = replyTarget;
    let tree = h.render(); body(tree).props.onChange({ target: { value: '前文替换后文' } }); tree = h.render();
    const input = body(tree).ref.current, focus = [], selections = [];
    Object.assign(input, { selectionStart: 2, selectionEnd: 4, focus: value => focus.push(value), setSelectionRange: (...args) => selections.push(args) });
    let prevented = false; button(tree, '@Quote').props.onPointerDown({ preventDefault() { prevented = true; } });
    button(tree, '@Quote').props.onClick(); tree = h.render();
    assert.equal(prevented, true); assert.equal(body(tree).props.value, '前文 @Quote 后文');
    assert.deepEqual(focus, [{ preventScroll: true }]); assert.deepEqual(selections, [[10, 10]]);
    assert.equal(h.calls.length, 0, 'mention insertion is a local edit, not a comment or AI request');
    await button(tree, '发布').props.onClick();
    assert.equal(h.calls[0].reply.text, '前文 @Quote 后文');
    if (replyTarget) { assert.equal(h.calls[0].reply.score, null); assert.deepEqual(h.calls[0].reply.tags, []); }
    h.cleanup();
  }
});

test('private comments and existing public comment edits never expose the Quote insertion shortcut', async () => {
  for (const visibility of [undefined, 'private']) {
    const h = await harness(); h.props.entry.visibility = visibility;
    assert.equal(button(h.render(), '@Quote'), undefined); h.cleanup();
  }
  const h = await harness({ reply: { id: 'existing', date: '2026-11-06', text: '原评论', score: null } });
  h.props.entry.visibility = 'public'; assert.equal(button(h.render(), '@Quote'), undefined); h.cleanup();
});

test('Quote insertion does not exceed the existing comment character limit', async () => {
  const h = await harness(); h.props.entry.visibility = 'public'; let tree = h.render();
  body(tree).props.onChange({ target: { value: '字'.repeat(20000) } }); tree = h.render();
  button(tree, '@Quote').props.onClick(); tree = h.render();
  assert.equal(body(tree).props.value.length, 20000); assert.match(alert(tree), /字数上限/); h.cleanup();
});

// A device clock with an explicit UTC offset keeps the midnight assertions
// meaningful on CI machines in UTC as well as the developer's local timezone.
function reviewClock(instant, offsetMinutes = 480) {
  let current = Date.parse(instant);
  const local = date => new Date(date.getTime() + offsetMinutes * 60000);
  return {
    set(value) { current = Date.parse(value); },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [current])); }
      static now() { return current; }
      getFullYear() { return local(this).getUTCFullYear(); }
      getMonth() { return local(this).getUTCMonth(); }
      getDate() { return local(this).getUTCDate(); }
    },
  };
}

test('new evaluations take the device-local submission date after uploads finish and reset the clock after success', async () => {
  const clock = reviewClock('2026-11-08T15:59:00Z');
  const h = await harness({ clock }); let releaseUpload;
  h.props.db.uploadReviewJournalImage = file => new Promise(resolve => { releaseUpload = () => resolve({ path: 'owner/midnight.jpg', name: file.name, mimeType: file.type, size: file.size }); });
  let tree = h.render();
  body(tree).props.onChange({ target: { value: '午夜前写下、午夜后提交的评价' } }); tree = h.render();
  find(tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['image'], 'midnight.jpg', { type: 'image/jpeg' })], value: 'selected' } });
  tree = h.render();
  clock.set('2026-11-08T15:59:59Z');
  const publishing = button(tree, '发布').props.onClick();
  assert.equal(h.calls.length, 0, 'the database attempt waits for the image upload');
  clock.set('2026-11-08T16:00:05Z'); releaseUpload(); await publishing;
  assert.equal(h.calls[0].reply.createdAt, '2026-11-08T16:00:05.000Z');
  assert.equal(h.calls[0].reply.date, '2026-11-09', 'the stored date uses the device day, not the UTC date');
  const firstId = h.calls[0].reply.id;
  h.props.open = true; tree = h.render();
  body(tree).props.onChange({ target: { value: '下一条新评价' } }); tree = h.render();
  clock.set('2026-11-09T16:30:00Z'); await button(tree, '发布').props.onClick();
  assert.notEqual(h.calls[1].reply.id, firstId);
  assert.equal(h.calls[1].reply.createdAt, '2026-11-09T16:30:00.000Z');
  assert.equal(h.calls[1].reply.date, '2026-11-10');
  h.cleanup();
});

test('an uncertain reply save retains its first submission time and date across later retries and reopening', async () => {
  const clock = reviewClock('2026-11-08T15:59:00Z'); let attempts = 0;
  const h = await harness({ clock, append: async (entry, reply) => { if (++attempts === 1) throw new Error('连接中断'); return { ...entry, replies: [reply] }; } });
  h.props.replyTarget = { kind: 'community', id: 'target', nickname: '访客', available: true };
  let tree = h.render(); body(tree).props.onChange({ target: { value: '回复内容' } }); tree = h.render();
  clock.set('2026-11-08T16:00:02Z'); await button(tree, '发布').props.onClick(); tree = h.render();
  assert.match(alert(tree), /连接中断/); assert.equal(h.calls[0].reply.createdAt, '2026-11-08T16:00:02.000Z');
  assert.equal(h.calls[0].reply.date, '2026-11-09');
  tree.props.onClose(); assert.equal(h.render(), null);
  clock.set('2026-11-09T16:02:00Z'); h.props.open = true; tree = h.render();
  body(tree).props.onChange({ target: { value: '回复内容，补充一句' } }); tree = h.render();
  await button(tree, '发布').props.onClick();
  for (const key of ['id', 'createdAt', 'date']) assert.equal(h.calls[1].reply[key], h.calls[0].reply[key]);
  assert.equal(h.calls[1].reply.text, '回复内容，补充一句');
  assert.equal(h.calls[1].reply.score, null); assert.deepEqual(h.calls[1].reply.tags, []);
  h.cleanup();
});

test('an image-upload failure does not freeze a publication time before a database attempt exists', async () => {
  const clock = reviewClock('2026-11-08T15:59:00Z'); let uploads = 0;
  const h = await harness({ clock });
  h.props.db.uploadReviewJournalImage = async file => {
    if (++uploads === 1) { clock.set('2026-11-08T16:01:00Z'); throw new Error('图片上传中断'); }
    clock.set('2026-11-10T16:03:00Z'); return { path: 'owner/retry.jpg', name: file.name, mimeType: file.type, size: file.size };
  };
  let tree = h.render();
  find(tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['image'], 'retry.jpg', { type: 'image/jpeg' })], value: 'selected' } });
  tree = h.render(); await button(tree, '发布').props.onClick(); tree = h.render();
  assert.equal(h.calls.length, 0); assert.match(alert(tree), /图片上传中断/);
  clock.set('2026-11-10T15:59:00Z'); await button(tree, '发布').props.onClick();
  assert.equal(h.calls[0].reply.createdAt, '2026-11-10T16:03:00.000Z');
  assert.equal(h.calls[0].reply.date, '2026-11-11');
  h.cleanup();
});

test('editing preserves the original review time and never invents a timestamp for date-only legacy reviews', async () => {
  for (const metadata of [{ createdAt: '2026-10-06T08:00:00.123456Z' }, {}, { createdAt: null }]) {
    const reply = { id: 'existing-review', date: '2026-10-06', text: '原来的评价', score: 8, ...metadata };
    const before = structuredClone(reply), clock = reviewClock('2026-11-08T16:01:00Z');
    const h = await harness({ clock, reply }); let tree = h.render();
    body(tree).props.onChange({ target: { value: '修改后的评价' } }); tree = h.render();
    clock.set('2026-11-10T16:03:00Z'); await button(tree, '保存').props.onClick();
    assert.equal(h.updates[0].replacement.date, '2026-10-06');
    assert.equal(h.updates[0].replacement.createdAt, reply.createdAt);
    assert.equal(Object.hasOwn(h.updates[0].replacement, 'createdAt'), Object.hasOwn(reply, 'createdAt'));
    assert.deepEqual(reply, before); h.cleanup();
  }
});

test('half-star input represents integer points, can clear, and publishes a score-only evaluation', async () => {
  const h = await harness(); let tree = h.render();
  assert.equal(button(tree, '发布').props.disabled, true); assert.equal(rating(tree).props['aria-valuenow'], 0);
  chooseScore(tree, 7); tree = h.render();
  assert.equal(rating(tree).props['aria-valuenow'], 7);
  assert.deepEqual(rating(tree).props.children.map(star => star.props.fill), [1, 1, 1, 0.5, 0]);
  assert.equal(button(tree, '发布').props.disabled, false);
  button(tree, '清除').props.onClick(); tree = h.render();
  assert.equal(rating(tree).props['aria-valuenow'], 0); assert.equal(button(tree, '发布').props.disabled, true);
  chooseScore(tree, 7); tree = h.render(); await button(tree, '发布').props.onClick();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].reply.score, 7); assert.equal(h.calls[0].reply.text, '');
  assert.equal(h.calls[0].entry, h.props.entry); assert.equal(h.calls[0].owner, 'owner');
  assert.equal(h.saved.length, 1); assert.equal(h.closes(), 1);
  h.props.open = true; tree = h.render();
  assert.equal(rating(tree).props['aria-valuenow'], 0); assert.equal(body(tree).props.value, '');
  h.cleanup();
});

test('keyboard rating supports half-star steps, bounds and clearing without selecting a mandatory score', async () => {
  const h = await harness(); let tree = h.render(); let prevented = 0;
  for (const [key, expected] of [['ArrowRight', 1], ['ArrowUp', 2], ['End', 10], ['ArrowUp', 10], ['ArrowLeft', 9], ['Home', 0], ['ArrowDown', 0]]) {
    rating(tree).props.onKeyDown({ key, preventDefault() { prevented++; } }); tree = h.render();
    assert.equal(rating(tree).props['aria-valuenow'], expected);
  }
  assert.equal(prevented, 7); h.cleanup();
});

test('closing and reopening retains the unfinished evaluation body, score and tag', async () => {
  const h = await harness(); let tree = h.render();
  body(tree).props.onChange({ target: { value: '保留尚未发布的想法' } }); tree = h.render();
  chooseScore(tree, 5); tree = h.render(); button(tree, '买入过急').props.onClick(); tree = h.render();
  tree.props.onClose(); assert.equal(h.render(), null); assert.equal(h.calls.length, 0);
  h.props.open = true; tree = h.render();
  assert.equal(body(tree).props.value, '保留尚未发布的想法'); assert.equal(rating(tree).props['aria-valuenow'], 5);
  assert.equal(button(tree, '买入过急').props['aria-pressed'], true); h.cleanup();
});

const savedReview = () => ({
  id: 'saved-reply', date: '2026-10-06', createdAt: '2026-10-06T08:00:00.000Z', text: '当时卖得过早',
  score: 5, tags: ['过早卖出', '耐心不足'], mood: '谨慎', stocks: ['NVDA'],
  images: [{ path: 'owner/kept.jpg', name: 'kept.jpg', mimeType: 'image/jpeg', size: 100 }],
  trades: [{ id: 'trade-1', symbol: 'NVDA', date: '2026-10-01', side: 'sell', price: 240.2, shares: 1000 }],
  market: { version: 1, asOfDate: '2026-10-01', items: [{ key: 'vix', value: 26.8 }] },
  account: { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report',
    asOfDate: '2026-10-01', recordDate: '2026-10-06',
    items: [{ key: 'leverage', value: 1.2, asOfDate: '2026-10-01', basis: 'close', source: 'pnl_report' }] },
});

test('editing loads saved rating and attachments, preserves original identity/date and updates only that review', async () => {
  const reply = savedReview(), original = structuredClone(reply);
  const h = await harness({ reply }); let tree = h.render();
  assert.equal(tree.props.title, '修改评价'); assert.equal(button(tree, '发布'), undefined);
  assert.equal(body(tree).props.value, original.text); assert.equal(rating(tree).props['aria-valuenow'], 5);
  assert.equal(button(tree, '耐心不足').props['aria-pressed'], true);
  assert.ok(button(tree, '移除已上传图片 1')); assert.ok(button(tree, '移除市场快照'));
  assert.ok(button(tree, '移除账户快照')); assert.ok(button(tree, '移除交易引用'));
  body(tree).props.onChange({ target: { value: '现在认为这笔减仓符合计划' } }); tree = h.render();
  chooseScore(tree, 8); tree = h.render();
  button(tree, '过早卖出').props.onClick(); tree = h.render();
  button(tree, '按计划执行').props.onClick(); tree = h.render();
  await button(tree, '保存').props.onClick();
  assert.equal(h.calls.length, 0, 'editing must never append a second review');
  assert.equal(h.updates.length, 1); assert.equal(h.updates[0].original, reply);
  assert.equal(h.updates[0].entry, h.props.entry); assert.equal(h.updates[0].owner, 'owner');
  assert.deepEqual(h.updates[0].replacement, { ...original, text: '现在认为这笔减仓符合计划', score: 8, tags: ['耐心不足', '按计划执行'] });
  assert.deepEqual(reply, original, 'editing must not mutate the visible saved reply before success');
  assert.equal(h.saved.length, 1); assert.equal(h.closes(), 1); h.cleanup();
});

test('cancelling an edit leaves its stored review unchanged and removed image references do not delete shared files', async () => {
  const reply = savedReview(), original = structuredClone(reply); let deletes = 0;
  const h = await harness({ reply }); h.props.db.removeReviewJournalImage = async () => { deletes++; };
  let tree = h.render();
  body(tree).props.onChange({ target: { value: '未保存的修改' } }); tree = h.render();
  button(tree, '移除已上传图片 1').props.onClick(); tree = h.render();
  assert.equal(button(tree, '移除已上传图片 1'), undefined);
  tree.props.onClose();
  assert.equal(h.render(), null); assert.equal(h.updates.length, 0); assert.equal(h.calls.length, 0);
  assert.deepEqual(reply, original); assert.equal(deletes, 0); h.cleanup();
});

test('failed edits retain draft and original comparison snapshot for retry without appending', async () => {
  const reply = savedReview(); let attempts = 0;
  const h = await harness({ reply, update: async (entry, original, replacement) => {
    if (++attempts === 1) throw Object.assign(new Error('这条评论已更新，请刷新后重试。'), { code: 'REVIEW_REPLY_CONFLICT' });
    return { ...entry, replies: [replacement] };
  } });
  let tree = h.render(); body(tree).props.onChange({ target: { value: '保留这次修改' } }); tree = h.render();
  await button(tree, '保存').props.onClick(); tree = h.render();
  assert.match(alert(tree), /这条评论已更新/); assert.equal(body(tree).props.value, '保留这次修改');
  assert.equal(rating(tree).props['aria-valuenow'], 5); assert.ok(button(tree, '移除已上传图片 1'));
  assert.equal(h.closes(), 0); assert.equal(h.saved.length, 0);
  await button(tree, '保存').props.onClick();
  assert.equal(h.updates.length, 2); assert.equal(h.updates[1].original, reply);
  assert.deepEqual(h.updates[1].replacement, h.updates[0].replacement);
  assert.equal(h.calls.length, 0); assert.equal(h.saved.length, 1); h.cleanup();
});

test('editing legacy stock-only or mood-only reviews does not disable saving or discard their data', async () => {
  for (const legacy of [{ stocks: ['SMH'] }, { mood: '冷静' }]) {
    const reply = { id: 'legacy-reply', date: '2026-08-01', text: '', ...legacy };
    const h = await harness({ reply }); const tree = h.render();
    assert.equal(button(tree, '保存').props.disabled, false);
    await button(tree, '保存').props.onClick();
    assert.equal(h.updates[0].replacement.id, reply.id); assert.equal(h.updates[0].replacement.date, reply.date);
    for (const [key, value] of Object.entries(legacy)) assert.deepEqual(h.updates[0].replacement[key], value);
    h.cleanup();
  }
});

test('trade picker retains frozen selections when current ledger rows change or disappear', async () => {
  const selected = [
    { id: 'changed', symbol: 'NVDA', date: '2026-09-01', side: 'buy', price: 100, shares: 20 },
    { id: 'deleted', symbol: 'SMH', date: '2026-09-02', side: 'sell', price: 200, shares: 10 },
  ];
  const h = await harness(); let inserted;
  const props = { selected, stockTrades: [{ ...selected[0], price: 999, user_id: 'owner' }], userId: 'owner', relatedSymbols: [],
    onChange: value => { inserted = value; }, onClose() {} };
  let tree = h.renderTrades(props);
  const choices = walk(tree).filter(node => node.props.className === 'rev-trade-choice');
  assert.equal(choices.length, 2); assert.ok(choices.every(node => node.props['aria-pressed']));
  assert.match(choices.map(text).join(' '), /\$100\.00/); assert.doesNotMatch(choices.map(text).join(' '), /999/);
  choices.find(node => text(node).includes('SMH')).props.onClick(); tree = h.renderTrades(props);
  button(tree, '插入 1 笔').props.onClick();
  assert.deepEqual(inserted, [selected[0]]); assert.equal(selected.length, 2); h.cleanup();
});

test('custom tags normalize and deduplicate while rejecting empty, overlong and unfinished IME input', async () => {
  const h = await harness(); let tree = h.render();
  const open = () => { if (!customForm(tree)) { button(tree, '＋ 自定义').props.onClick(); tree = h.render(); } };
  const enter = value => { open(); customInput(tree).props.onChange({ target: { value } }); tree = h.render(); customForm(tree).props.onSubmit({ preventDefault() {} }); tree = h.render(); };
  enter('  ＡＬＰＨＡ  '); assert.equal(button(tree, 'ALPHA').props['aria-pressed'], true);
  enter('alpha'); assert.equal(walk(tree).filter(node => node.type === 'button' && /^alpha$/i.test(text(node))).length, 1);
  enter('   '); assert.match(alert(tree), /1 至 12/); assert.ok(customForm(tree));
  enter('这是超过十二个字符限制的标签'); assert.match(alert(tree), /1 至 12/); assert.ok(customForm(tree));
  customInput(tree).props.onChange({ target: { value: '输入中' } }); tree = h.render();
  customInput(tree).props.onCompositionStart(); customForm(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
  assert.equal(button(tree, '输入中'), undefined); customInput(tree).props.onCompositionEnd();
  customForm(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
  assert.equal(button(tree, '输入中').props['aria-pressed'], true);
  await button(tree, '发布').props.onClick(); assert.deepEqual(h.calls[0].reply.tags, ['ALPHA', '输入中']);
  h.cleanup();
});

test('pending publication blocks repeat submits and dismissal until the original request completes', async () => {
  let resolve;
  const h = await harness({ append: () => new Promise(done => { resolve = done; }) }); let tree = h.render();
  chooseScore(tree, 6); tree = h.render(); const publish = button(tree, '发布').props.onClick;
  const first = publish(); await publish(); tree = h.render();
  assert.equal(h.calls.length, 1); assert.equal(tree.props.headerAction.props.disabled, true);
  tree.props.onClose(); assert.equal(h.closes(), 0); assert.equal(body(tree).props.disabled, true);
  resolve({ ...h.props.entry, replies: [h.calls[0].reply] }); await first;
  assert.equal(h.saved.length, 1); assert.equal(h.closes(), 1); h.cleanup();
});

test('failed publication retains content and stable reply id for a safe retry', async () => {
  let attempts = 0;
  const h = await harness({ append: async (entry, reply) => { if (++attempts === 1) throw new Error('连接中断'); return { ...entry, replies: [reply] }; } }); let tree = h.render();
  body(tree).props.onChange({ target: { value: '需要保留的评价' } }); tree = h.render();
  chooseScore(tree, 9); tree = h.render(); button(tree, '按计划执行').props.onClick(); tree = h.render();
  await button(tree, '发布').props.onClick(); tree = h.render();
  assert.match(alert(tree), /连接中断/); assert.equal(h.closes(), 0); assert.equal(h.saved.length, 0);
  assert.equal(body(tree).props.value, '需要保留的评价'); assert.equal(rating(tree).props['aria-valuenow'], 9);
  assert.equal(button(tree, '按计划执行').props['aria-pressed'], true); assert.equal(button(tree, '发布').props.disabled, false);
  await button(tree, '发布').props.onClick();
  assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1].reply, h.calls[0].reply);
  assert.equal(h.saved.length, 1); h.cleanup();
});

test('uploaded photos remain individually removable after publication fails without deleting cloud objects', async () => {
  let attempts = 0, deletes = 0; const uploads = [];
  const h = await harness({ append: async (entry, reply) => {
    if (++attempts === 1) throw new Error('保存失败');
    return { ...entry, replies: [reply] };
  } });
  h.props.db.uploadReviewJournalImage = async file => {
    uploads.push(file.name); return { path: `owner/${file.name}`, name: file.name, mimeType: file.type, size: file.size };
  };
  h.props.db.removeReviewJournalImage = async () => { deletes++; };
  let tree = h.render();
  const images = ['one.jpg', 'two.jpg', 'three.jpg'].map(name => new File(['image'], name, { type: 'image/jpeg' }));
  find(tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: images, value: 'selected' } });
  tree = h.render(); await button(tree, '发布').props.onClick(); tree = h.render();
  assert.match(alert(tree), /保存失败/); assert.equal(uploads.length, 3);
  assert.equal(walk(tree).filter(node => node.props['aria-label']?.startsWith('移除已上传图片')).length, 3);
  button(tree, '移除已上传图片 2').props.onClick(); tree = h.render();
  await button(tree, '发布').props.onClick();
  assert.deepEqual(h.calls[1].reply.images.map(image => image.path), ['owner/one.jpg', 'owner/three.jpg']);
  assert.equal(h.calls[1].reply.id, h.calls[0].reply.id);
  assert.equal(uploads.length, 3, 'retained uploads must not be uploaded again');
  assert.equal(deletes, 0, 'removing a draft reference must not delete a potentially committed cloud object');
  h.cleanup();
});

test('partial image upload failure allows removing the completed reference and retrying remaining files', async () => {
  const uploads = []; let failed = false, deletes = 0;
  const h = await harness();
  h.props.db.uploadReviewJournalImage = async file => {
    uploads.push(file.name);
    if (file.name === 'two.jpg' && !failed) { failed = true; throw new Error('图片上传中断'); }
    return { path: `owner/${file.name}`, name: file.name, mimeType: file.type, size: file.size };
  };
  h.props.db.removeReviewJournalImage = async () => { deletes++; };
  let tree = h.render();
  find(tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: {
    files: ['one.jpg', 'two.jpg'].map(name => new File(['image'], name, { type: 'image/jpeg' })), value: 'selected',
  } });
  tree = h.render(); await button(tree, '发布').props.onClick(); tree = h.render();
  assert.match(alert(tree), /图片上传中断/); assert.equal(h.calls.length, 0);
  assert.ok(button(tree, '移除已上传图片 1')); assert.ok(button(tree, '移除待上传图片'));
  button(tree, '移除已上传图片 1').props.onClick(); tree = h.render();
  assert.equal(button(tree, '移除已上传图片 1'), undefined);
  await button(tree, '发布').props.onClick();
  assert.deepEqual(h.calls[0].reply.images.map(image => image.path), ['owner/two.jpg']);
  assert.deepEqual(uploads, ['one.jpg', 'two.jpg', 'two.jpg']); assert.equal(deletes, 0);
  h.cleanup();
});

test('account picker distinguishes an incomplete close from a historical rebuild', async () => {
  for (const reason of ['incomplete_close', 'rebuilding']) {
    const h = await harness(); const requests = [];
    const props = { value: null, initialDate: '2026-11-06', recordDate: '2026-11-07', userId: 'owner',
      db: { async fetchReviewAccountSnapshot(date, owner) { requests.push([date, owner]); return { status: 'pending', reason, snapshot: null }; } },
      onChange() {}, onClose() {},
    };
    h.renderAccount(props); await Promise.resolve(); const tree = h.renderAccount(props);
    assert.deepEqual(requests, [['2026-11-06', 'owner']]);
    assert.equal(text(find(tree, node => node.props.role === 'status')), reason === 'incomplete_close'
      ? '该日尚未完成收盘。' : '该日历史数据待更新，暂不能引用。');
    assert.equal(button(tree, '插入').props.disabled, true);
    assert.equal(Boolean(button(tree, '重新读取')), reason !== 'incomplete_close');
    h.cleanup();
  }
});

const accountSnapshot = (overrides = {}) => ({
  version: 1, kind: 'account_snapshot', asOfDate: '2026-11-05', recordDate: '2026-11-05', basis: 'close', source: 'pnl_report',
  items: [['cumulativeReturnPct', 20], ['yearPeakReturnPct', 30], ['declineFromYearPeakPp', 10], ['dailyReturnPct', -1.2], ['leverage', 1.28]]
    .map(([key, value]) => ({ key, value, asOfDate: '2026-11-05', basis: 'close', source: 'pnl_report',
      ...(['yearPeakReturnPct', 'declineFromYearPeakPp'].includes(key) ? { peakDate: '2026-10-23' } : {}) })),
  ...overrides,
});
const accountMetric = (tree, key) => find(tree, node => node.props['data-metric'] === key);

test('account cards format the year high and decline with percent signs, date the high and follow both market color modes', async () => {
  const h = await harness();
  for (const [mode, positive, negative] of [['greenUpRedDown', '#34d399', '#ff4b1f'], ['redUpGreenDown', '#ff4b1f', '#34d399']]) {
    const card = h.components.ReviewAccountCard({ value: accountSnapshot(), marketColorMode: mode });
    assert.deepEqual(walk(card).filter(node => node.props['data-metric']).map(node => node.props['data-metric']),
      ['cumulativeReturnPct', 'yearPeakReturnPct', 'declineFromYearPeakPp', 'dailyReturnPct', 'leverage']);
    assert.equal(accountMetric(card, 'cumulativeReturnPct').props.className, 'rev-account-primary');
    assert.match(text(accountMetric(card, 'yearPeakReturnPct')), /年内收益率高点\+30\.00%10月23日/);
    assert.match(text(accountMetric(card, 'declineFromYearPeakPp')), /较高点回落10\.00%/);
    assert.doesNotMatch(text(accountMetric(card, 'declineFromYearPeakPp')), /个百分点/);
    assert.equal(find(accountMetric(card, 'yearPeakReturnPct'), node => node.type === 'time').props.dateTime, '2026-10-23');
    for (const key of ['cumulativeReturnPct', 'yearPeakReturnPct']) assert.equal(find(accountMetric(card, key), node => node.type === 'strong').props.style.color, positive);
    for (const key of ['declineFromYearPeakPp', 'dailyReturnPct']) assert.equal(find(accountMetric(card, key), node => node.type === 'strong').props.style.color, negative);
    assert.equal(find(accountMetric(card, 'leverage'), node => node.type === 'strong').props.style, undefined);
  }
  h.cleanup();
});

test('hindsight return labels count calendar days to the snapshot and leave saved returns unchanged', async () => {
  const h = await harness();
  for (const [recordDate, asOfDate, days] of [
    ['2026-10-28', '2026-11-05', 8],
    ['2026-10-31', '2026-11-02', 2],
    ['2024-02-28', '2024-03-01', 2],
    ['2025-12-31', '2026-01-01', 1],
    ['2026-11-05', '2026-11-05', 0],
    ['2026-11-06', '2026-11-05', -1],
  ]) {
    const value = accountSnapshot({ recordDate, asOfDate, items: [
      { key: 'cumulativeReturnPct', value: 20, asOfDate, basis: 'close', source: 'pnl_report' },
    ] });
    const frozen = structuredClone(value), card = h.components.ReviewAccountCard({ value });
    const metric = accountMetric(card, 'cumulativeReturnPct');
    assert.equal(text(find(metric, node => node.type === 'span')), days > 0 ? `博文发布后 ${days} 天账户收益率变化` : '截至该日累计收益率');
    assert.equal(text(find(metric, node => node.type === 'strong')), '+20.00%');
    assert.ok(text(card).startsWith(`${days > 0 ? '后续账户' : '当时的账户'}${asOfDate}`));
    assert.deepEqual(value, frozen);
  }
  h.cleanup();
});

test('zero decline remains neutral and legacy cards retain only their frozen three metrics', async () => {
  const h = await harness();
  const atPeak = accountSnapshot();
  atPeak.items.find(item => item.key === 'yearPeakReturnPct').value = 20;
  atPeak.items.find(item => item.key === 'declineFromYearPeakPp').value = 0;
  for (const mode of ['greenUpRedDown', 'redUpGreenDown']) {
    const card = h.components.ReviewAccountCard({ value: atPeak, marketColorMode: mode });
    const decline = accountMetric(card, 'declineFromYearPeakPp');
    assert.match(text(decline), /0\.00%/);
    assert.equal(find(decline, node => node.type === 'strong').props.style, undefined);
  }
  const legacy = accountSnapshot(); legacy.items = legacy.items.filter(item => !item.peakDate);
  const frozen = structuredClone(legacy), card = h.components.ReviewAccountCard({ value: legacy, marketColorMode: 'greenUpRedDown' });
  assert.deepEqual(walk(card).filter(node => node.props['data-metric']).map(node => node.props['data-metric']),
    ['cumulativeReturnPct', 'dailyReturnPct', 'leverage']);
  assert.doesNotMatch(text(card), /年内收益率高点|较高点回落/); assert.deepEqual(legacy, frozen);
  h.cleanup();
});

test('account picker selects all five available metrics and saves the peak date and percentage-point units unchanged', async () => {
  const h = await harness(), source = accountSnapshot(), requests = []; let inserted;
  const props = { value: null, initialDate: '2026-11-05', recordDate: '2026-11-06', userId: 'owner',
    db: { async fetchReviewAccountSnapshot(date, owner) { requests.push([date, owner]); return { status: 'ready', snapshot: source }; } },
    onChange(value) { inserted = value; }, onClose() {}, marketColorMode: 'greenUpRedDown' };
  h.renderAccount(props); await Promise.resolve(); const tree = h.renderAccount(props);
  const options = walk(tree).filter(node => node.props.className === 'rev-account-option');
  assert.equal(options.length, 5);
  assert.ok(options.every(option => find(option, node => node.type === 'input').props.checked));
  assert.ok(options.every(option => !find(option, node => node.type === 'input').props.disabled));
  assert.equal(button(tree, '插入').props.disabled, false); button(tree, '插入').props.onClick();
  assert.deepEqual(inserted, { ...source, recordDate: '2026-11-06' });
  source.items[1].value = 99;
  assert.equal(inserted.items[1].value, 30, 'inserted references must not retain the source objects');
  assert.deepEqual(requests, [['2026-11-05', 'owner']]); h.cleanup();
});

test('account reads survive repeated timeline adapter renders and remain insertable after completion', async () => {
  const h = await harness(), source = accountSnapshot(), requests = []; let resolve, inserted;
  const fetchReviewAccountSnapshot = (date, owner) => {
    requests.push([date, owner]); return new Promise(done => { resolve = done; });
  };
  const props = { value: null, initialDate: source.asOfDate, recordDate: '2026-10-06', userId: 'owner',
    db: { fetchReviewAccountSnapshot }, onChange(value) { inserted = value; }, onClose() {} };
  let tree = h.renderAccount(props);
  for (let tick = 0; tick < 20; tick++) {
    props.db = { fetchReviewAccountSnapshot, appendReviewJournalReply() {} };
    tree = h.renderAccount(props);
  }
  assert.deepEqual(requests, [[source.asOfDate, 'owner']], 'unrelated parent updates must not restart the pending read');
  assert.equal(button(tree, '插入').props.disabled, true);
  resolve({ status: 'ready', snapshot: source }); await Promise.resolve();
  props.db = { fetchReviewAccountSnapshot }; tree = h.renderAccount(props);
  assert.equal(button(tree, '插入').props.disabled, false);
  assert.equal(find(tree, node => node.props.role === 'status'), undefined);
  assert.equal(walk(tree).filter(node => node.props.className === 'rev-account-option'
    && !find(node, child => child.type === 'input').props.disabled).length, 5);
  button(tree, '插入').props.onClick();
  assert.deepEqual(inserted, { ...source, recordDate: '2026-10-06' });
  assert.equal(requests.length, 1); h.cleanup();
});

test('account picker still rejects late results after changing date or owner', async () => {
  const h = await harness(), requests = [], source = accountSnapshot();
  const fetchReviewAccountSnapshot = (date, owner) => new Promise(resolve => requests.push({ date, owner, resolve }));
  const props = { value: null, initialDate: source.asOfDate, recordDate: '2026-10-06', userId: 'owner',
    db: { fetchReviewAccountSnapshot }, onChange() {}, onClose() {} };
  let tree = h.renderAccount(props);
  find(tree, node => node.type === 'input' && node.props.type === 'date').props.onChange({ target: { value: '2026-11-06' } });
  tree = h.renderAccount(props);
  requests[0].resolve({ status: 'ready', snapshot: source }); await Promise.resolve();
  tree = h.renderAccount(props);
  assert.equal(button(tree, '插入').props.disabled, true);
  props.userId = 'other'; props.db = { fetchReviewAccountSnapshot }; h.renderAccount(props);
  const latest = accountSnapshot({ asOfDate: '2026-11-06', items: source.items.map(item => ({ ...item, asOfDate: '2026-11-06' })) });
  requests[1].resolve({ status: 'ready', snapshot: latest }); await Promise.resolve();
  tree = h.renderAccount(props);
  assert.equal(button(tree, '插入').props.disabled, true);
  assert.deepEqual(requests.map(({ date, owner }) => [date, owner]),
    [['2026-11-05', 'owner'], ['2026-11-06', 'owner'], ['2026-11-06', 'other']]);
  requests[2].resolve({ status: 'ready', snapshot: latest }); await Promise.resolve();
  tree = h.renderAccount(props); assert.equal(button(tree, '插入').props.disabled, false); h.cleanup();
});

test('missing year history disables only its two metrics and retains independently available daily values', async () => {
  const h = await harness(), source = accountSnapshot(); source.items = source.items.filter(item => !item.peakDate);
  const props = { value: null, initialDate: source.asOfDate, recordDate: source.recordDate, userId: 'owner',
    db: { async fetchReviewAccountSnapshot() { return { status: 'ready', snapshot: source, missingKeys: ['yearPeakReturnPct', 'declineFromYearPeakPp'] }; } }, onChange() {}, onClose() {} };
  h.renderAccount(props); await Promise.resolve(); const tree = h.renderAccount(props);
  for (const name of ['年内收益率高点', '较高点回落']) {
    const option = find(tree, node => node.props.className === 'rev-account-option' && text(node).includes(name));
    assert.equal(find(option, node => node.type === 'input').props.disabled, true);
    assert.match(text(option), /—/);
  }
  assert.match(text(tree), /该日期暂无可用的收益报表历史记录/);
  assert.equal(button(tree, '插入').props.disabled, false); h.cleanup();
});

test('the account picker defaults to the blog date and preserves a saved hindsight date when editing', async () => {
  const h = await harness({ reply: savedReview() });
  h.props.entry.date = '2026-09-01'; let tree = h.render();
  button(tree, '账户').props.onClick(); tree = h.render();
  const picker = find(tree, node => node.type === h.components.AccountPicker);
  assert.equal(picker.props.initialDate, '2026-09-01'); assert.equal(picker.props.recordDate, '2026-09-01');
  assert.deepEqual(picker.props.value, savedReview().account);
  h.cleanup();

  const p = await harness(), requests = [];
  const saved = accountSnapshot({ recordDate: '2026-10-06' }), frozen = structuredClone(saved);
  const props = { value: saved, initialDate: '2026-10-06', recordDate: '2026-10-06', userId: 'owner',
    db: { async fetchReviewAccountSnapshot(date) { requests.push(date); return { status: 'ready', snapshot: saved }; } },
    onChange() {}, onClose() {} };
  p.renderAccount(props); await Promise.resolve(); const dialog = p.renderAccount(props);
  const dateInput = find(dialog, node => node.type === 'input' && node.props.type === 'date');
  assert.equal(dateInput.props.value, '2026-11-05'); assert.equal(dateInput.props.max, '2026-11-06');
  assert.deepEqual(requests, ['2026-11-05']); assert.deepEqual(saved, frozen);
  assert.equal(button(dialog, '插入').props.disabled, false);
  const card = p.components.ReviewAccountCard({ value: saved });
  assert.match(text(card), /后续账户2026-11-05/);
  p.cleanup();
});

test('a completed date after the blog can be selected and inserted with both dates and frozen values intact', async () => {
  const h = await harness(), source = accountSnapshot(), requests = []; let inserted;
  const props = { value: null, initialDate: '2026-10-06', recordDate: '2026-10-06', userId: 'owner',
    db: { async fetchReviewAccountSnapshot(date) { requests.push(date); return date === source.asOfDate
      ? { status: 'ready', snapshot: source } : { status: 'missing', snapshot: null }; } },
    onChange(value) { inserted = value; }, onClose() {} };
  h.renderAccount(props); await Promise.resolve(); let dialog = h.renderAccount(props);
  const dateInput = find(dialog, node => node.type === 'input' && node.props.type === 'date');
  assert.equal(dateInput.props.value, '2026-10-06'); assert.equal(dateInput.props.max, '2026-11-06');
  dateInput.props.onChange({ target: { value: '2026-11-05' } });
  dialog = h.renderAccount(props);
  assert.equal(button(dialog, '插入').props.disabled, true, 'the previous date must never be insertable during a new request');
  await Promise.resolve(); dialog = h.renderAccount(props);
  assert.equal(button(dialog, '插入').props.disabled, false); button(dialog, '插入').props.onClick();
  assert.deepEqual(requests, ['2026-10-06', '2026-11-05']);
  assert.deepEqual(inserted, { ...source, recordDate: '2026-10-06' });
  source.items[0].value = 999;
  assert.equal(inserted.items[0].value, 20); h.cleanup();
});

test('future and non-trading dates remain blocked even if the date field is bypassed', async () => {
  const h = await harness(), requests = []; let inserts = 0;
  const source = accountSnapshot();
  const props = { value: null, initialDate: source.asOfDate, recordDate: '2026-10-06', userId: 'owner',
    db: { async fetchReviewAccountSnapshot(date) { requests.push(date); return { status: 'ready', snapshot: source }; } },
    onChange() { inserts++; }, onClose() {} };
  h.renderAccount(props); await Promise.resolve(); let dialog = h.renderAccount(props);
  assert.equal(button(dialog, '插入').props.disabled, false);
  for (const date of ['2026-11-09', '2026-11-07', '2026-10-10', '2026-07-03', '2026-02-30', '']) {
    find(dialog, node => node.type === 'input' && node.props.type === 'date').props.onChange({ target: { value: date } });
    dialog = h.renderAccount(props); await Promise.resolve(); dialog = h.renderAccount(props);
    assert.equal(button(dialog, '插入').props.disabled, true, date); button(dialog, '插入').props.onClick();
    assert.match(text(find(dialog, node => node.props.role === 'status')), /已完成收盘日期/);
  }
  assert.equal(inserts, 0); assert.deepEqual(requests, ['2026-11-05']); h.cleanup();
});

test('reply composer identifies its recipient without retaining target text and preserves draft text after closing', async () => {
  const h=await harness();h.props.replyTarget={kind:'community',id:'target',nickname:'访客',available:true,text:'不应显示的目标正文'};
  let tree=h.render();assert.equal(tree.props.title,'回复评论');assert.match(text(tree),/回复 @访客/);assert.doesNotMatch(text(tree),/不应显示的目标正文/);assert.equal(body(tree).props.placeholder,'写下你的回复…');
  body(tree).props.onChange({target:{value:'先保留这条回复'}});h.props.open=false;assert.equal(h.render(),null);h.props.open=true;tree=h.render();assert.equal(body(tree).props.value,'先保留这条回复');
  h.props.replyTarget={...h.props.replyTarget,available:false};tree=h.render();assert.match(text(tree),/原评论已删除/);assert.doesNotMatch(text(tree),/回复 @访客/);h.cleanup();
});

test('new replies have no rating or tag controls while all attachment tools remain available', async () => {
  for (const source of ['replyTarget','entry']) {
    const h=await harness(),target={kind:'community',id:'target',nickname:'访客',available:true};
    if(source==='replyTarget')h.props.replyTarget=target;else h.props.entry.communityReplyTo=target;
    let tree=h.render();assert.equal(rating(tree),undefined);assert.doesNotMatch(text(tree),/给当时的判断打个分|轻点选星|评分可留空|未评分/);
    for(const label of ['交易','市场','账户','图片','表情'])assert.ok(button(tree,label),`${label} remains available in replies`);
    assert.equal(button(tree,'发布').props.disabled,true);
    assert.equal(button(tree,'按计划执行'),undefined);assert.equal(button(tree,'＋ 自定义'),undefined);assert.equal(customForm(tree),undefined);
    body(tree).props.onChange({target:{value:'感谢你的建议'}});tree=h.render();assert.equal(button(tree,'发布').props.disabled,false);
    await button(tree,'发布').props.onClick();assert.equal(h.calls[0].reply.score,null);assert.deepEqual(h.calls[0].reply.tags,[]);h.cleanup();
  }
});

test('editing a legacy scored reply hides its score and sends null without losing saved attachments', async () => {
  const reply={...savedReview(),replyTo:{kind:'author',id:'original',nickname:'原评论人',available:true}},before=structuredClone(reply);
  const h=await harness({reply});let tree=h.render();assert.equal(tree.props.title,'修改回复');assert.equal(rating(tree),undefined);assert.doesNotMatch(text(tree),/给当时的判断打个分|轻点选星|评分可留空/);
  for(const label of ['移除已上传图片 1','移除市场快照','移除账户快照','移除交易引用'])assert.ok(button(tree,label));
  body(tree).props.onChange({target:{value:'修改后的回复'}});tree=h.render();await button(tree,'保存').props.onClick();
  assert.equal(h.updates[0].replacement.score,null);assert.equal(h.updates[0].replacement.text,'修改后的回复');
  assert.deepEqual(h.updates[0].replacement.tags,[]);
  for(const key of ['images','market','account','trades','replyTo'])assert.deepEqual(h.updates[0].replacement[key],before[key]);
  assert.deepEqual(reply,before,'stored historical record stays unchanged until save succeeds');h.cleanup();
});

test('a legacy score-only reply cannot submit as empty content after reply scoring is removed', async () => {
  const reply={id:'legacy-score-only',date:'2026-11-08',text:'',score:9,replyTo:{kind:'community',id:'target',nickname:'访客',available:true}};
  const h=await harness({reply});let tree=h.render();assert.equal(rating(tree),undefined);assert.equal(button(tree,'保存').props.disabled,true);
  await button(tree,'保存').props.onClick();assert.equal(h.updates.length,0,'hidden legacy score must not count as reply content');
  body(tree).props.onChange({target:{value:'补充真实回复内容'}});tree=h.render();assert.equal(button(tree,'保存').props.disabled,false);await button(tree,'保存').props.onClick();
  assert.equal(h.updates.length,1);assert.equal(h.updates[0].replacement.score,null);assert.equal(h.updates[0].replacement.text,'补充真实回复内容');h.cleanup();
});

test('legacy tag-only replies cannot submit empty content and editing them clears hidden tags', async () => {
  const reply={id:'legacy-tag-only',date:'2026-11-08',text:'',score:null,tags:['旧回复标签'],replyTo:{kind:'author',id:'original',nickname:'访客',available:true}};
  const h=await harness({reply});let tree=h.render();assert.equal(button(tree,'旧回复标签'),undefined);assert.equal(button(tree,'＋ 自定义'),undefined);assert.equal(button(tree,'保存').props.disabled,true);
  await button(tree,'保存').props.onClick();assert.equal(h.updates.length,0);
  body(tree).props.onChange({target:{value:'现在补充回复内容'}});tree=h.render();await button(tree,'保存').props.onClick();assert.equal(h.updates[0].replacement.score,null);assert.deepEqual(h.updates[0].replacement.tags,[]);h.cleanup();
});

test('direct post evaluations still allow tag-only publishing and reply mode hides a previously opened tag form', async () => {
  const h=await harness();let tree=h.render();assert.ok(rating(tree));button(tree,'按计划执行').props.onClick();tree=h.render();assert.equal(button(tree,'发布').props.disabled,false);
  await button(tree,'发布').props.onClick();assert.deepEqual(h.calls[0].reply.tags,['按计划执行']);assert.equal(h.calls[0].reply.score,null);h.cleanup();
  const changed=await harness();tree=changed.render();button(tree,'按计划执行').props.onClick();tree=changed.render();button(tree,'＋ 自定义').props.onClick();tree=changed.render();customForm(tree).props.onSubmit({preventDefault(){}});tree=changed.render();assert.ok(customForm(tree));assert.ok(alert(tree));
  changed.props.replyTarget={kind:'community',id:'target',nickname:'访客',available:true};tree=changed.render();assert.equal(customForm(tree),undefined);assert.equal(button(tree,'＋ 自定义'),undefined);assert.equal(button(tree,'按计划执行'),undefined);assert.equal(alert(tree),'');assert.equal(button(tree,'发布').props.disabled,true,'hidden draft tags must not count as reply content');changed.cleanup();
});
