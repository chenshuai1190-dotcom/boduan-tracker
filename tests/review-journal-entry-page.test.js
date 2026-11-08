import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/pages/ReviewJournalPage.jsx', import.meta.url), 'utf8');
const pageSource = source.slice(source.indexOf('export default function ReviewJournalPage'));
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const systemIdentitySource = readFileSync(new URL('../src/components/ReviewSystemIdentity.jsx', import.meta.url), 'utf8');
const systemIdentityModule = dataUrl((await transformWithOxc(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  const avatar = '/assets/quote-system-fox.jpg';
  ${systemIdentitySource.replace(/^import .*;\n/gm, '')}
`, 'ReviewSystemIdentityTest.jsx', { jsx: { runtime: 'classic' } })).code);
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const visible = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(visible) : [] : tree.props.hidden ? [] : [tree, ...visible(tree.props.children)];
const hasClass = (node, value) => node.props.className?.split(' ').includes(value);
const find = (tree, predicate) => visible(tree).find(predicate);
const textOf = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.map(textOf).join('') : String(tree ?? '') : tree.props.text !== undefined ? String(tree.props.text) : textOf(tree.props.children);
const button = (tree, name) => find(tree, node => node.type === 'button' && (node.props['aria-label'] === name || name==='全部'&&node.props['aria-label']==='全部动态范围' || textOf(node) === name));
const firstPost = tree => find(tree, node => node.type === 'article');
const detail = tree => find(tree, node => hasClass(node, 'rj-entry-content'));
const records = () => [
  { id: 'one', type: 'log', date: '2026-11-04', text: '完整的长期复盘。'.repeat(50), mood: '冷静', stocks: ['NVDA', 'QQQ'], images: [{ path: 'owner/image.webp', name: '图表' }], market: { id: 'saved-market' }, replies: [{ id: 'reply-one', date: '2026-11-05', text: '评论正文', mood: '谨慎', stocks: ['SPY'], images: [{ path: 'owner/reply.webp' }], market: { id: 'reply-market' } }] },
  { id: 'two', type: 'log', date: '2026-11-03', text: '第二条复盘', stocks: [], images: [], replies: [] },
];
let fixtureId = 0;
test('public/private scope applies only to All while personal categories retain every own entry', async () => {
  const h=await harness();
  h.ctx.previewData.initialAllScope='public';
  h.ctx.reviewLogs=[...records(),{...records()[1],id:'published',visibility:'public'}];
  let tree=h.render();
  assert.ok(find(tree,node=>node.type===h.Page.ReviewPublicFeed));
  assert.equal(visible(tree).filter(node=>node.type==='article').length,0,'private rows never render into the public feed');
  button(tree,'复盘日志').props.onClick();tree=h.render();
  assert.equal(find(tree,node=>node.type===h.Page.ReviewPublicFeed),undefined);
  assert.equal(visible(tree).filter(node=>node.type==='article').length,3,'personal logs include public and private own entries');
  button(tree,'全部').props.onClick();tree=h.render();
  button(tree,'显示私密记录').props.onClick();tree=h.render();
  assert.equal(find(tree,node=>node.type===h.Page.ReviewPublicFeed),undefined);
  assert.deepEqual(visible(tree).filter(node=>node.type==='article').map(node=>node.props['data-rj-entry-key']),['log:one','log:two']);
  button(tree,'复盘日志').props.onClick();tree=h.render();
  assert.equal(visible(tree).filter(node=>node.type==='article').length,3,'private scope must not filter personal category tabs');
  button(tree,'全部').props.onClick();tree=h.render();button(tree,'显示公开动态').props.onClick();tree=h.render();
  const publicFeed=find(tree,node=>node.type===h.Page.ReviewPublicFeed);
  publicFeed.props.onManageOwnEntry('log','published');tree=h.render();
  assert.ok(button(tree,'编辑记录'),'authors manage the original directly from the public post');
  assert.ok(button(tree,'删除记录'));
  assert.equal(detail(tree),undefined,'opening actions must not detour into private evaluations');
  h.unmount();
});

test('publishing from All shows the chosen audience and keeps the new post in view', async () => {
  const h=await harness();
  h.fixture.window.requestAnimationFrame=callback=>callback();
  let tree=h.render();
  for(const visibility of ['public','private']) {
    button(tree,'写复盘').props.onClick();tree=h.render();
    const composer=find(tree,node=>node.type===h.Page.Composer);
    composer.props.onSaved({...records()[1],id:`new-${visibility}`,visibility});
    composer.props.onClose();tree=h.render();
    assert.equal(Boolean(find(tree,node=>node.type===h.Page.ReviewPublicFeed)),visibility==='public');
    assert.equal(h.scrolls.at(-1).top,0);
    assert.ok(h.ctx.reviewLogs.some(entry=>entry.id===`new-${visibility}`));
  }
  h.unmount();
});

test('public details retain their visible feed container and use the entry layout', async () => {
  const h = await harness(); h.ctx.previewData.initialAllScope = 'public';
  let tree = h.render();
  find(tree, node => node.type === h.Page.ReviewPublicFeed).props.onDetailChange(true);
  tree = h.render();
  assert.ok(hasClass(tree, 'rj-entry-page'));
  assert.ok(find(tree, node => node.type === h.Page.ReviewPublicFeed), 'the public detail must not be hidden with private routes');
  assert.equal(find(tree, node => node.type === 'header' && hasClass(node, 'rj-page-header')), undefined);
  h.unmount();
});

test('public owner evaluations use original records and refresh the public view after edits and deletion', async () => {
  const h = await harness(); h.ctx.previewData.initialAllScope = 'public'; h.ctx.reviewLogs[0].visibility = 'public';
  let tree = h.render();
  const feed = () => find(tree, node => node.type === h.Page.ReviewPublicFeed);
  feed().props.onDetailChange(true, {authorId:'owner',type:'log',sourceId:'one'}); tree = h.render();
  feed().props.onEvaluateOwnEntry('log','one'); tree = h.render();
  let editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.open);
  assert.ok(editor); assert.deepEqual(editor.props.entry, h.ctx.reviewLogs[0]);
  assert.match(textOf(editor.props.identityNode), /公开可见/);
  assert.equal(detail(tree), undefined, 'public evaluations do not replace the public detail with a private route');
  editor.props.onClose(); tree = h.render();
  feed().props.onManageOwnReply('log','one','reply-one'); tree = h.render();
  button(tree,'修改评价').props.onClick(); tree = h.render();
  editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.reply);
  assert.equal(editor.props.reply.id,'reply-one');
  const refresh = feed().props.refreshToken;
  editor.props.onSaved({...editor.props.entry,replies:[{...editor.props.reply,text:'已更新公开评价'}]});
  editor.props.onClose(); tree = h.render();
  assert.ok(feed().props.refreshToken > refresh);
  assert.equal(h.ctx.reviewLogs[0].replies[0].text,'已更新公开评价');
  feed().props.onManageOwnReply('log','one','reply-one'); tree = h.render();
  button(tree,'删除评价').props.onClick(); tree = h.render();
  await button(tree,'确认删除评价').props.onClick(); tree = h.render();
  assert.equal(h.replyDeletes[0].owner,'owner'); assert.equal(h.ctx.reviewLogs[0].replies.length,0);
  assert.ok(feed()); assert.equal(detail(tree),undefined);
  feed().props.onEvaluateOwnEntry('log','one'); tree = h.render();
  feed().props.onDetailChange(true, {authorId:'other',type:'log',sourceId:'foreign'}); tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.open), undefined, 'another author detail cannot retain an owner evaluation editor');
  h.unmount();
});

test('public owner actions edit the full original and delete through the same owner-scoped path', async () => {
  const h = await harness(); h.ctx.previewData.initialAllScope = 'public';
  h.ctx.reviewLogs[0].visibility = 'public';
  let tree = h.render();
  const feed = () => find(tree, node => node.type === h.Page.ReviewPublicFeed);
  const original = h.ctx.reviewLogs[0], firstRefresh = feed().props.refreshToken;
  feed().props.onManageOwnEntry('log', 'one'); tree = h.render();
  button(tree, '编辑记录').props.onClick(); tree = h.render();
  const composer = find(tree, node => node.type === h.Page.Composer);
  assert.deepEqual(composer.props.entry, original, 'editing must use the complete owner row, not the public projection');
  assert.equal(composer.props.entry.replies[0].id, 'reply-one');
  composer.props.onSaved({ ...composer.props.entry, text: '修改后的公开正文' });
  composer.props.onClose(); tree = h.render();
  assert.equal(h.ctx.reviewLogs[0].text, '修改后的公开正文');
  assert.equal(h.ctx.reviewLogs[0].replies[0].id, 'reply-one');
  assert.ok(feed().props.refreshToken > firstRefresh);
  feed().props.onManageOwnEntry('log', 'one'); tree = h.render();
  button(tree, '删除记录').props.onClick(); tree = h.render();
  assert.equal(h.deletes.length, 0, 'the existing confirmation remains required');
  await button(tree, '确认删除').props.onClick(); tree = h.render();
  assert.equal(h.deletes[0].entry.id, 'one'); assert.equal(h.deletes[0].owner, 'owner');
  assert.equal(h.ctx.reviewLogs.some(entry => entry.id === 'one'), false);
  assert.deepEqual(h.removals.map(item => item.path).sort(), ['owner/image.webp', 'owner/reply.webp']);
  assert.ok(feed().props.refreshToken > firstRefresh + 1);
  h.unmount();
});

test('an explicit private All scope survives leaving and mounting the page again', async () => {
  const localPreferences = new Map();
  const first = await harness({ localPreferences }); delete first.ctx.previewData.initialAllScope;
  let tree = first.render();
  assert.ok(find(tree, node => node.type === first.Page.ReviewPublicFeed));
  button(tree, '全部动态范围').props.onClick(); tree = first.render();
  button(tree, '显示私密记录').props.onClick(); tree = first.render();
  assert.equal(find(tree, node => node.type === first.Page.ReviewPublicFeed), undefined);
  assert.ok(localPreferences.size > 0, 'an explicit choice must persist'); first.unmount();

  const second = await harness({ localPreferences }); delete second.ctx.previewData.initialAllScope;
  tree = second.render();
  assert.equal(find(tree, node => node.type === second.Page.ReviewPublicFeed), undefined);
  assert.equal(visible(tree).filter(node => node.type === 'article').length, records().length);
  assert.match(textOf(button(tree, '全部动态范围')), /私密/); second.unmount();

  const isolated = await harness(); delete isolated.ctx.previewData.initialAllScope;
  assert.ok(find(isolated.render(), node => node.type === isolated.Page.ReviewPublicFeed), 'unrelated harnesses do not inherit storage');
  isolated.unmount();
});

test('an explicit public All scope replaces the private preference and survives remounting', async () => {
  const localPreferences = new Map();
  const first = await harness({ localPreferences }); delete first.ctx.previewData.initialAllScope;
  let tree = first.render();
  button(tree, '全部动态范围').props.onClick(); tree = first.render();
  button(tree, '显示私密记录').props.onClick(); tree = first.render();
  button(tree, '全部动态范围').props.onClick(); tree = first.render();
  button(tree, '显示公开动态').props.onClick(); tree = first.render();
  assert.ok(find(tree, node => node.type === first.Page.ReviewPublicFeed)); first.unmount();

  const second = await harness({ localPreferences }); delete second.ctx.previewData.initialAllScope;
  tree = second.render();
  assert.ok(find(tree, node => node.type === second.Page.ReviewPublicFeed));
  assert.equal(visible(tree).filter(node => node.type === 'article').length, 0); second.unmount();
});

test('switching accounts restores each user scope without carrying another user private selection', async () => {
  const localPreferences = new Map();
  const h = await harness({ localPreferences }); delete h.ctx.previewData.initialAllScope;
  let tree = h.render();
  button(tree, '全部动态范围').props.onClick(); tree = h.render();
  button(tree, '显示私密记录').props.onClick(); tree = h.render();
  h.ctx.userId = 'second-owner'; tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.ReviewPublicFeed), 'a new user starts with their own default immediately');
  button(tree, '全部动态范围').props.onClick(); tree = h.render();
  button(tree, '显示公开动态').props.onClick(); tree = h.render();
  h.ctx.userId = 'owner'; tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewPublicFeed), undefined);
  h.ctx.userId = 'second-owner'; tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.ReviewPublicFeed)); h.unmount();

  const remount = await harness({ localPreferences }); delete remount.ctx.previewData.initialAllScope;
  assert.equal(find(remount.render(), node => node.type === remount.Page.ReviewPublicFeed), undefined);
  remount.ctx.userId = 'second-owner';
  assert.ok(find(remount.render(), node => node.type === remount.Page.ReviewPublicFeed)); remount.unmount();
});

test('publishing may reveal the saved audience without replacing the manually chosen All scope', async () => {
  const localPreferences = new Map();
  const h = await harness({ localPreferences }); delete h.ctx.previewData.initialAllScope;
  h.fixture.window.requestAnimationFrame = callback => callback();
  let tree = h.render();
  button(tree, '全部动态范围').props.onClick(); tree = h.render();
  button(tree, '显示私密记录').props.onClick(); tree = h.render();
  button(tree, '写复盘').props.onClick(); tree = h.render();
  const composer = find(tree, node => node.type === h.Page.Composer);
  composer.props.onSaved({ ...records()[1], id: 'published-after-private', visibility: 'public' });
  composer.props.onClose(); tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.ReviewPublicFeed)); h.unmount();

  const remount = await harness({ localPreferences }); delete remount.ctx.previewData.initialAllScope;
  assert.equal(find(remount.render(), node => node.type === remount.Page.ReviewPublicFeed), undefined);
  remount.unmount();
});

async function harness({ removeReply, preferences = {}, localPreferences = new Map() } = {}) {
  let slots = [], cursor = 0, layout = [], effects = [];
  const scrolls = [], saves = [], deletes = [], replyDeletes = [], removals = [], focus = [], pushes = [];
  const listeners = new Map(), historyStates = [{ otherAppState: 'retained' }]; let historyIndex = 0;
  const host = { isConnected: true, focus: options => focus.push({ target: 'post', options }), closest: () => host, contains: target => !target.portal, matches: () => Boolean(fixture.keyboardFocus) };
  const fixture = {
    localStorage: {
      getItem: key => localPreferences.has(key) ? localPreferences.get(key) : null,
      setItem: (key, value) => localPreferences.set(key, String(value)),
      removeItem: key => localPreferences.delete(key),
    },
    preferenceState: {
      preferences: { showTimeline: false, currency: 'USD', eventTypes: [], ...preferences },
      ready: true, loading: false, canEdit: true, saving: false, error: '',
      updatePreferences: async patch => {
        fixture.preferenceState.preferences = { ...fixture.preferenceState.preferences, ...patch };
        return true;
      },
      retry: async () => {},
    },
    document: { activeElement: null },
    window: { scrollX: 0, scrollY: 740, getSelection: () => ({ toString: () => fixture.selection || '' }), scrollTo: value => { scrolls.push(value); fixture.window.scrollX = value.left; fixture.window.scrollY = value.top; } },
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; const slot = slots[index]; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useMemo(create, deps) { const index = cursor++, previous = slots[index]; if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return previous.value; const value = create(); slots[index] = { deps, value }; return value; },
    effect(effect, deps, queue) { const index = cursor++, previous = slots[index]; if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return; previous?.cleanup?.(); const slot = { deps }; slots[index] = slot; queue.push(() => { slot.cleanup = effect(); }); },
    useEffect(effect, deps) { fixture.effect(effect, deps, effects); },
    useLayoutEffect(effect, deps) { fixture.effect(effect, deps, layout); },
  };
  host.ownerDocument = fixture.document;
  fixture.window.addEventListener = (type, listener) => listeners.set(type, listener);
  fixture.window.removeEventListener = (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); };
  fixture.window.history = {
    scrollRestoration: 'auto',
    get state() { return historyStates[historyIndex]; },
    pushState(...args) { pushes.push(args); historyStates.splice(++historyIndex, Infinity, args[0]); },
    replaceState(state) { historyStates[historyIndex] = state; },
    back() { if (historyIndex > 0) { historyIndex--; listeners.get('popstate')?.({ state: historyStates[historyIndex] }); } },
    forward() { if (historyIndex < historyStates.length - 1) { historyIndex++; listeners.get('popstate')?.({ state: historyStates[historyIndex] }); } },
  };
  const key = `__journalEntryPage${++fixtureId}`;
  globalThis[key] = fixture;
  let Page;
  try {
    const compiled = await transformWithOxc(`
      import React from ${JSON.stringify(import.meta.resolve('react'))};
      import { ArrowLeft, Search, Plus, MoreHorizontal, Pin, MessageCircle, Pencil, Trash2, ChevronDown, Check } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import { reviewJournalFeed, localReviewDate } from ${JSON.stringify(new URL('../src/lib/reviewJournalFeed.js', import.meta.url).href)};
      import { findReviewStockMentions } from ${JSON.stringify(new URL('../src/lib/reviewStockMentions.js', import.meta.url).href)};
      import { mergeReviewTimelineFeed, reviewTimelineFeedDate } from ${JSON.stringify(new URL('../src/lib/reviewTimelineFeed.js', import.meta.url).href)};
      import { groupReviewTimelineEvents } from ${JSON.stringify(new URL('../src/lib/reviewTimelineGroups.js', import.meta.url).href)};
      import { findReviewEntryByKey, projectReviewTimelineEntry, resolveReviewReplySource, resolveReviewTimelineEvent, reviewTimelineAnchorEntry, reviewTimelineReplyKey } from ${JSON.stringify(new URL('../src/lib/reviewTimelineEntries.js', import.meta.url).href)};
      import { ReviewSystemAvatar, ReviewSystemName } from ${JSON.stringify(systemIdentityModule)};
      import { readReviewAudiencePreference as readAudience, writeReviewAudiencePreference as writeAudience } from ${JSON.stringify(new URL('../src/lib/reviewAudiencePreferences.js', import.meta.url).href)};
      const fixture = globalThis[${JSON.stringify(key)}];
      const { useState, useRef, useEffect, useLayoutEffect, useMemo, window, document } = fixture;
      const readReviewAudiencePreference = (userId, kind) => readAudience(userId, kind, fixture.localStorage);
      const writeReviewAudiencePreference = (userId, kind, value) => writeAudience(userId, kind, value, fixture.localStorage);
      const Avatar = () => null, AuthorName = () => null, Photo = () => null, SnapshotCard = () => null, ReviewStockCarousel = () => null, ReviewPostBody = () => null, Composer = () => null, Dialog = () => null;
      const ReviewPublicFeed = () => null, ReviewTimeline = () => null, ReviewPreferences = () => null, ReviewTimelinePost = () => null;
      const useReviewPreferences = () => fixture.preferenceState;
      const ReviewEvaluationComposer = () => null, EvaluationRating = () => null, ReviewAccountCard = () => null, ReviewTradeReferences = () => null, EmojiPicker = () => null;
      export { ReviewPublicFeed, ReviewSystemAvatar, ReviewSystemName, Avatar, AuthorName, ReviewTimeline, ReviewPreferences, ReviewTimelinePost, Photo, SnapshotCard, ReviewStockCarousel, ReviewPostBody, Composer, Dialog, ReviewEvaluationComposer, EvaluationRating, ReviewAccountCard, ReviewTradeReferences };
      ${pageSource.replaceAll('import.meta.env.DEV', 'true')}
    `, 'ReviewJournalEntryPageTest.jsx', { jsx: { runtime: 'classic' } });
    Page = await import(dataUrl(compiled.code));
  } finally { delete globalThis[key]; }
  const ctx = {
    userId: 'owner', disciplines: [], reviewLogs: records(), stockTrades: [],
    previewData: { initialAllScope: 'private', identity: { nickname: '复盘者' }, history: {} }, onBack: () => { fixture.leftJournal = true; },
    setDisciplines: update => { ctx.disciplines = update(ctx.disciplines); },
    setReviewLogs: update => { ctx.reviewLogs = update(ctx.reviewLogs); },
    db: {
      saveReviewJournalEntry: async (entry, owner) => { saves.push({ entry, owner }); return { ...entry, revision: (entry.revision || 0) + 1 }; },
      deleteReviewJournalEntry: async (entry, owner) => { deletes.push({ entry, owner }); },
      deleteReviewJournalReply: async (entry, reply, owner) => {
        replyDeletes.push({ entry, reply, owner });
        if (removeReply) return removeReply(entry, reply, owner);
        return { ...entry, revision: (entry.revision || 0) + 1, replies: entry.replies.filter(item => item.id !== reply.id) };
      },
      removeReviewJournalImage: async (path, owner) => { removals.push({ path, owner }); },
    },
  };
  return {
    Page, fixture, ctx, scrolls, focus, saves, deletes, replyDeletes, removals, host, pushes, listeners, localPreferences,
    render() { cursor = 0; layout = []; effects = []; const tree = Page.default({ ctx }); for (const node of walk(tree)) if (node.ref) node.ref.current = { focus: options => focus.push({ target: node.type, options }) }; for (const effect of layout) effect(); for (const effect of effects) effect(); return tree; },
    clickPost(tree, options = {}) { const event = { type: 'click', detail: options.detail ?? 1, nativeEvent: { pointerType: options.pointerType }, currentTarget: host, target: { closest: () => options.interactive || null, portal: options.portal }, defaultPrevented: options.defaultPrevented }; const post = options.id ? find(tree, node => node.type === 'article' && node.props['data-rj-entry-key'] === `log:${options.id}`) : firstPost(tree); post.props.onClick(event); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('a whole post opens a normal detail page with all entry and comment attachments', async () => {
  const h = await harness();
  let tree = h.render();
  assert.equal(button(tree, '查看记录'), undefined);
  assert.ok(button(tree, '查看评论'));
  assert.doesNotMatch(textOf(tree), /查看记录/);
  h.clickPost(tree); tree = h.render();
  assert.ok(detail(tree));
  assert.equal(find(tree, node => node.type === h.Page.Dialog), undefined);
  assert.equal(find(tree, node => hasClass(node, 'rj-tabs')), undefined);
  assert.equal(button(tree, '写复盘'), undefined);
  assert.ok(button(tree, '返回投资动态'));
  assert.equal(firstPost(tree).props.role, undefined);
  assert.equal(find(tree, node => node.type === h.Page.ReviewPostBody).props.text, h.ctx.reviewLogs[0].text);
  assert.equal(find(tree, node => node.type === h.Page.ReviewPostBody).props.full, true);
  assert.deepEqual(visible(tree).filter(node => node.type === h.Page.Photo).map(node => node.props.item.path), ['owner/image.webp', 'owner/reply.webp']);
  assert.deepEqual(visible(tree).filter(node => node.type === h.Page.ReviewStockCarousel).flatMap(node => node.props.symbols.map(symbol => [symbol, node.props.recordDate, node.props.userId])), [['NVDA', '2026-11-04', 'owner'], ['QQQ', '2026-11-04', 'owner'], ['SPY', '2026-11-05', 'owner']]);
  assert.deepEqual(visible(tree).filter(node => node.type === h.Page.SnapshotCard).map(node => node.props.value.id), ['saved-market', 'reply-market']);
  assert.match(textOf(detail(tree)), /评论.*评论正文/);
  assert.doesNotMatch(textOf(detail(tree)), /后来的想法|复盘日志|投资心得/);
  assert.equal(h.scrolls.at(-1).top, 0);
  assert.equal(h.focus.at(-1).target, 'h1');
  h.unmount();
});

test('the Journal navigation tab keeps its page title and returns from entries and stock tags to the feed', async () => {
  const h = await harness(); h.ctx.navigationTab = true;
  let tree = h.render();
  assert.ok(hasClass(tree, 'rj-navigation-tab'));
  assert.equal(find(tree, node => node.type === 'h1').props.children, '投资动态');
  assert.equal(button(tree, '返回'), undefined, 'a primary tab has no parent-page back action');
  assert.equal(button(tree, '返回投资动态'), undefined);
  assert.ok(button(tree, '写复盘'));
  h.clickPost(tree); tree = h.render();
  assert.ok(detail(tree));
  assert.equal(find(tree, node => node.type === 'h1').props.children, '复盘记录');
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  assert.equal(detail(tree), undefined);
  assert.equal(h.fixture.window.scrollY, 740);
  find(tree, node => node.type === h.Page.ReviewPostBody).props.onSelectSymbol('NVDA', { type: 'click', detail: 1, stopPropagation() {}, preventDefault() {} });
  tree = h.render();
  assert.equal(find(tree, node => node.type === 'h1').props.children, '$NVDA');
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  assert.equal(find(tree, node => node.type === 'h1').props.children, '投资动态');
  assert.equal(button(tree, '返回'), undefined);
  assert.equal(h.fixture.leftJournal, undefined);
  assert.equal(h.saves.length, 0);
  h.unmount();
});

test('interactive controls, portals and text selection keep their own interactions', async () => {
  const h = await harness(); let tree = h.render();
  for (const options of [{ interactive: 'button' }, { interactive: 'stock-chart' }, { portal: true }, { defaultPrevented: true }]) {
    h.clickPost(tree, options); tree = h.render(); assert.equal(detail(tree), undefined);
  }
  h.fixture.selection = '需要复制的文字'; h.clickPost(tree); tree = h.render(); assert.equal(detail(tree), undefined);
  h.fixture.selection = '';
  button(tree, '记录操作').props.onClick(); tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.Dialog));
  assert.equal(detail(tree), undefined);
  h.unmount();
});

test('keyboard entry and back preserve the filtered feed, scroll position and focus', async () => {
  for (const key of ['Enter', ' ']) {
    const h = await harness(); let tree = h.render();
    button(tree, '复盘日志').props.onClick(); tree = h.render();
    let prevented = false;
    const post = firstPost(tree);
    assert.equal(post.props.role, 'link'); assert.equal(post.props.tabIndex, 0);
    post.props.onKeyDown({ type: 'keydown', key, target: {}, currentTarget: h.host, preventDefault: () => { prevented = true; } });
    assert.equal(detail(h.render()), undefined, 'nested controls must not navigate on keydown');
    post.props.onKeyDown({ type: 'keydown', key, target: h.host, currentTarget: h.host, preventDefault: () => { prevented = true; } });
    tree = h.render(); assert.ok(prevented); assert.ok(detail(tree));
    h.fixture.window.scrollY = 900;
    button(tree, '返回投资动态').props.onClick(); tree = h.render();
    assert.equal(detail(tree), undefined);
    assert.equal(button(tree, '复盘日志').props['aria-pressed'], true);
    assert.equal(h.scrolls.at(-1).top, 740);
    assert.equal(h.focus.at(-1).target, 'post');
    assert.equal(h.fixture.leftJournal, undefined);
    h.unmount();
  }
});

test('mouse and touch entry return to the title without focusing the whole post', async () => {
  for (const options of [{ pointerType: 'mouse' }, { pointerType: 'touch' }, { detail: 0 }, { detail: 0, pointerType: 'touch', focused: true }, { detail: 0, pointerType: 'mouse', focused: true }]) {
    const h = await harness(); let tree = h.render();
    h.fixture.keyboardFocus = Boolean(options.focused);
    h.fixture.document.activeElement = options.focused ? h.host : null;
    h.clickPost(tree, options); tree = h.render();
    assert.ok(detail(tree));
    button(tree, '返回投资动态').props.onClick(); tree = h.render();
    assert.equal(detail(tree), undefined);
    assert.equal(h.fixture.window.scrollY, 740);
    assert.equal(h.focus.at(-1).target, 'h1');
    assert.equal(h.focus.some(item => item.target === 'post'), false, 'pointer navigation must never restore article focus');
    h.unmount();
  }
});

test('a keyboard-generated comment button click restores its post focus', async () => {
  const h = await harness(); let tree = h.render();
  const trigger = { ownerDocument: h.fixture.document, matches: selector => selector === ':focus-visible', closest: () => h.host };
  h.fixture.document.activeElement = trigger;
  button(tree, '查看评论').props.onClick({ type: 'click', detail: 0, currentTarget: trigger, nativeEvent: { pointerType: '' } });
  tree = h.render(); assert.ok(detail(tree));
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  assert.equal(detail(tree), undefined);
  assert.equal(h.focus.at(-1).target, 'post');
  assert.equal(h.fixture.window.scrollY, 740);
  h.unmount();
});

test('the evaluation composer stays mounted when closed and saves on the same detail without resetting scroll', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  assert.equal(find(tree, node => node.type === 'textarea'), undefined);
  const repliesHeader = find(tree, node => hasClass(node, 'rj-replies-header'));
  assert.ok(repliesHeader);
  assert.equal(button(repliesHeader, '写评价'), button(tree, '写评价'));
  assert.ok(find(repliesHeader, node => node.type === 'h2' && node.props.id === 'rj-comments-title'));
  assert.equal(find(tree, node => hasClass(node, 'rev-write-bar')), undefined);
  button(tree, '写评价').props.onClick(); tree = h.render();
  let composer = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  assert.equal(composer.props.open, true); assert.equal(composer.props.entry.id, 'one');
  assert.equal(composer.props.userId, 'owner'); assert.equal(composer.props.db, h.ctx.db);
  for (let tick = 0; tick < 3; tick++) {
    h.ctx.stockTrades = [...h.ctx.stockTrades]; tree = h.render();
    assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer).props.db, h.ctx.db);
  }
  const key = composer.key;
  composer.props.onClose(); tree = h.render();
  composer = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  assert.equal(composer.key, key); assert.equal(composer.props.open, false, 'closing must retain its draft component');
  button(tree, '写评价').props.onClick(); tree = h.render();
  composer = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  assert.equal(composer.key, key); assert.equal(composer.props.open, true);
  h.fixture.window.scrollY = 820;
  composer.props.onSaved({ ...composer.props.entry, revision: 2, replies: [...composer.props.entry.replies,
    { id: 'new-comment', date: '2026-11-07', text: '新的评论', score: 7, tags: ['按计划执行'] }] });
  composer.props.onClose(); tree = h.render();
  assert.equal(h.ctx.reviewLogs[0].replies.length, 2);
  assert.deepEqual(h.ctx.reviewLogs[0].replies[0], records()[0].replies[0]);
  assert.deepEqual(h.ctx.reviewLogs[0].images, records()[0].images);
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer).props.open, false);
  const rating = visible(tree).filter(node => node.type === h.Page.EvaluationRating).at(-1);
  assert.equal(rating.props.score, 7); assert.deepEqual(rating.props.tags, ['按计划执行']);
  assert.ok(detail(tree)); assert.match(textOf(detail(tree)), /新的评论/);
  assert.equal(h.fixture.window.scrollY, 820);
  assert.equal(h.scrolls.length, 1, 'saving must not navigate or scroll to the top');
  h.unmount();
});

test('A and B evaluation drafts keep distinct component identities across navigation and reopening', async () => {
  const h = await harness(); let tree = h.render();
  const composers = () => visible(tree).filter(node => node.type === h.Page.ReviewEvaluationComposer);
  const goBack = () => { button(tree, '返回投资动态').props.onClick(); tree = h.render(); };
  const open = id => { h.clickPost(tree, { id }); tree = h.render(); button(tree, '写评价').props.onClick(); tree = h.render(); };
  open('one');
  const a = composers()[0]; assert.equal(a.props.open, true);
  a.props.onClose(); tree = h.render(); goBack();
  assert.equal(composers()[0].key, a.key); assert.equal(composers()[0].props.open, false);
  open('two');
  assert.equal(composers().length, 2, 'opening another entry must not unmount the first draft');
  const b = composers().find(node => node.props.entry.id === 'two');
  assert.notEqual(b.key, a.key); assert.equal(b.props.open, true);
  assert.equal(composers().find(node => node.props.entry.id === 'one').key, a.key);
  assert.equal(composers().find(node => node.props.entry.id === 'one').props.open, false);
  goBack(); assert.ok(composers().every(node => !node.props.open), 'navigation closes every editor while retaining drafts');
  open('one');
  assert.deepEqual(composers().map(node => node.key), [a.key, b.key]);
  assert.equal(composers()[0].props.open, true); assert.equal(composers()[1].props.open, false);
  h.fixture.window.history.back(); tree = h.render();
  assert.deepEqual(composers().map(node => node.key), [a.key, b.key]);
  assert.ok(composers().every(node => !node.props.open), 'browser back also closes editors');
  h.unmount();
});

test('deleted entries unmount their draft and account changes cannot reuse another account editor', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  button(tree, '写评价').props.onClick(); tree = h.render();
  const old = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  h.ctx.userId = 'another-owner'; tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer), undefined, 'old draft must disappear in the first new-account render');
  button(tree, '写评价').props.onClick(); tree = h.render();
  const current = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  assert.notEqual(current.key, old.key); assert.equal(current.props.userId, 'another-owner');
  h.ctx.reviewLogs = h.ctx.reviewLogs.filter(entry => entry.id !== 'one'); tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer), undefined);
  h.ctx.userId = 'owner'; tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer), undefined, 'switching back does not revive the discarded account draft');
  h.unmount();
});

test('detail editing stays available and deleting returns to the original feed', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  button(tree, '记录操作').props.onClick(); tree = h.render();
  button(tree, '编辑记录').props.onClick(); tree = h.render();
  const composer = find(tree, node => node.type === h.Page.Composer);
  assert.equal(composer.props.entry.id, 'one');
  composer.props.onSaved({ ...composer.props.entry, text: '已编辑的正文' }); composer.props.onClose(); tree = h.render();
  assert.match(textOf(detail(tree)), /已编辑的正文/);
  button(tree, '记录操作').props.onClick(); tree = h.render();
  button(tree, '删除记录').props.onClick(); tree = h.render();
  await button(tree, '确认删除').props.onClick(); tree = h.render();
  assert.equal(detail(tree), undefined);
  assert.equal(h.deletes[0].entry.id, 'one'); assert.equal(h.deletes[0].owner, 'owner');
  assert.deepEqual(h.removals.map(item => item.path).sort(), ['owner/image.webp', 'owner/reply.webp']);
  assert.equal(h.ctx.reviewLogs.length, 1);
  assert.equal(h.scrolls.at(-1).top, 740);
  h.unmount();
});

test('review deletion requires a separate confirmation and cancellation leaves all data intact', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  const original = structuredClone(h.ctx.reviewLogs);
  button(tree, '评论操作').props.onClick(); tree = h.render();
  const menu = find(tree, node => node.type === h.Page.Dialog && node.props.title === '评论操作');
  assert.ok(menu); assert.ok(button(menu, '修改评价')); assert.ok(button(menu, '删除评价'));
  assert.equal(button(tree, '确认删除评价'), undefined);
  button(menu, '删除评价').props.onClick(); tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.Dialog && node.props.title === '删除这条评价？'));
  assert.ok(button(tree, '确认删除评价')); assert.equal(h.replyDeletes.length, 0);
  button(tree, '取消').props.onClick(); tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.Dialog), undefined);
  assert.deepEqual(h.ctx.reviewLogs, original);
  assert.equal(h.replyDeletes.length, 0); assert.equal(h.deletes.length, 0); assert.equal(h.removals.length, 0);
  h.unmount();
});

test('confirmed review deletion updates only that review and keeps the post, sibling review and ledger', async () => {
  const h = await harness();
  const sibling = { id: 'reply-two', date: '2026-11-06', text: '另一条评价', score: 8, tags: ['按计划执行'] };
  h.ctx.reviewLogs[0].replies.push(sibling);
  h.ctx.stockTrades = [{ id: 'ledger-one', symbol: 'SPY', side: 'buy', shares: 10, price: 500, date: '2026-11-05' }];
  const original = structuredClone(h.ctx.reviewLogs[0]), trades = structuredClone(h.ctx.stockTrades);
  let tree = h.render(); h.clickPost(tree); tree = h.render();
  h.fixture.window.scrollY = 940;
  const row = find(tree, node => node.props['data-rj-reply-id'] === 'reply-one');
  button(row, '评论操作').props.onClick(); tree = h.render();
  button(tree, '删除评价').props.onClick(); tree = h.render();
  await button(tree, '确认删除评价').props.onClick(); tree = h.render();
  assert.equal(h.replyDeletes.length, 1);
  assert.deepEqual(h.replyDeletes[0].reply, original.replies[0]);
  assert.equal(h.replyDeletes[0].entry.id, 'one'); assert.equal(h.replyDeletes[0].owner, 'owner');
  assert.equal(h.ctx.reviewLogs[0].text, original.text);
  assert.deepEqual(h.ctx.reviewLogs[0].images, original.images);
  assert.deepEqual(h.ctx.reviewLogs[0].market, original.market);
  assert.deepEqual(h.ctx.reviewLogs[0].replies, [sibling]); assert.deepEqual(h.ctx.stockTrades, trades);
  assert.equal(find(tree, node => node.props['data-rj-reply-id'] === 'reply-one'), undefined);
  assert.ok(find(tree, node => node.props['data-rj-reply-id'] === 'reply-two'));
  assert.equal(h.deletes.length, 0, 'removing a review must not delete the whole entry');
  assert.equal(h.removals.length, 0, 'private image objects may still be referenced elsewhere');
  assert.ok(detail(tree)); assert.equal(h.fixture.window.scrollY, 940);
  assert.equal(h.scrolls.length, 1, 'deleting a review must not navigate away or reset detail scroll');
  h.unmount();
});

test('a failed review deletion keeps its confirmation and original comment available for retry', async () => {
  const h = await harness({ removeReply: async () => { throw new Error('评价已更新，请刷新后重试。'); } });
  let tree = h.render(); h.clickPost(tree); tree = h.render();
  button(tree, '评论操作').props.onClick(); tree = h.render();
  button(tree, '删除评价').props.onClick(); tree = h.render();
  await button(tree, '确认删除评价').props.onClick(); tree = h.render();
  assert.equal(h.replyDeletes.length, 1);
  assert.deepEqual(h.ctx.reviewLogs[0].replies, records()[0].replies);
  assert.ok(find(tree, node => node.props['data-rj-reply-id'] === 'reply-one'));
  assert.match(textOf(find(tree, node => node.props.role === 'alert')), /评价已更新/);
  assert.equal(button(tree, '确认删除评价').props.disabled, false);
  assert.equal(h.removals.length, 0); h.unmount();
});

test('pending review deletion disables dismissal and blocks duplicate submission', async () => {
  let complete;
  const h = await harness({ removeReply: (entry, reply) => new Promise(resolve => {
    complete = () => resolve({ ...entry, replies: entry.replies.filter(item => item.id !== reply.id) });
  }) });
  let tree = h.render(); h.clickPost(tree); tree = h.render();
  button(tree, '评论操作').props.onClick(); tree = h.render();
  button(tree, '删除评价').props.onClick(); tree = h.render();
  const submit = button(tree, '确认删除评价').props.onClick;
  const pending = submit(); tree = h.render();
  assert.equal(button(tree, '删除中…').props.disabled, true);
  assert.equal(button(tree, '取消').props.disabled, true);
  assert.equal(button(tree, '评论操作').props.disabled, true);
  find(tree, node => node.type === h.Page.Dialog).props.onClose(); tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.Dialog));
  await submit(); assert.equal(h.replyDeletes.length, 1);
  complete(); await pending; tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.Dialog), undefined);
  assert.equal(h.ctx.reviewLogs[0].replies.length, 0); h.unmount();
});

test('editing a saved review receives the complete original and has a separate identity from the new draft', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  const original = structuredClone(h.ctx.reviewLogs[0].replies[0]);
  button(tree, '写评价').props.onClick(); tree = h.render();
  const newDraft = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  newDraft.props.onClose(); tree = h.render();
  button(tree, '评论操作').props.onClick(); tree = h.render();
  button(tree, '修改评价').props.onClick(); tree = h.render();
  const editors = visible(tree).filter(node => node.type === h.Page.ReviewEvaluationComposer);
  const editor = editors.find(node => node.props.reply);
  assert.equal(editors.length, 2);
  assert.deepEqual(editor.props.reply, original); assert.equal(editor.props.entry.id, 'one');
  assert.equal(editor.props.userId, 'owner'); assert.equal(editor.props.open, true);
  assert.equal(editor.props.db, h.ctx.db, 'ordinary review editing keeps the original repository');
  assert.notEqual(editor.key, newDraft.key);
  assert.equal(editors.find(node => !node.props.reply).key, newDraft.key);
  assert.equal(editors.find(node => !node.props.reply).props.open, false);
  editor.props.onClose(); tree = h.render();
  assert.deepEqual(h.ctx.reviewLogs[0].replies[0], original, 'closing an edit must leave the saved review intact');
  assert.equal(visible(tree).filter(node => node.type === h.Page.ReviewEvaluationComposer).length, 1);
  button(tree, '写评价').props.onClick(); tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer).key, newDraft.key);
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer).props.open, true);
  assert.equal(h.saves.length, 0); assert.equal(h.replyDeletes.length, 0); h.unmount();
});

test('an edited review refreshes in place and account switches immediately remove review actions and drafts', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  button(tree, '评论操作').props.onClick(); tree = h.render();
  button(tree, '修改评价').props.onClick(); tree = h.render();
  const editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.reply);
  h.fixture.window.scrollY = 950;
  const changed = { ...editor.props.reply, text: '修改后的评价', score: 9, tags: ['自定义标签'] };
  editor.props.onSaved({ ...editor.props.entry, replies: [changed], revision: 3 }); editor.props.onClose(); tree = h.render();
  assert.deepEqual(h.ctx.reviewLogs[0].replies, [changed]);
  assert.match(textOf(detail(tree)), /修改后的评价/);
  assert.equal(h.fixture.window.scrollY, 950); assert.equal(h.scrolls.length, 1);
  button(tree, '评论操作').props.onClick(); tree = h.render();
  h.ctx.userId = 'another-owner'; tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.Dialog), undefined, 'a previous account menu must disappear before its cleanup effect');
  h.ctx.userId = 'owner'; tree = h.render();
  button(tree, '评论操作').props.onClick(); tree = h.render();
  button(tree, '修改评价').props.onClick(); tree = h.render();
  assert.deepEqual(find(tree, node => node.type === h.Page.ReviewEvaluationComposer).props.reply, changed);
  h.ctx.userId = 'another-owner'; tree = h.render();
  assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer), undefined, 'the saved-review editor must not cross accounts');
  assert.equal(h.replyDeletes.length, 0); h.unmount();
});

test('removing a review or navigating back unmounts its editor without reviving a stale edit', async () => {
  for (const remove of [false, true]) {
    const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
    button(tree, '评论操作').props.onClick(); tree = h.render();
    button(tree, '修改评价').props.onClick(); tree = h.render();
    assert.ok(find(tree, node => node.type === h.Page.ReviewEvaluationComposer));
    if (remove) h.ctx.reviewLogs[0] = { ...h.ctx.reviewLogs[0], replies: [] };
    else button(tree, '返回投资动态').props.onClick();
    tree = h.render();
    assert.equal(find(tree, node => node.type === h.Page.ReviewEvaluationComposer), undefined);
    assert.equal(h.saves.length, 0); assert.equal(h.replyDeletes.length, 0); h.unmount();
  }
});

test('browser back and forward navigate privately and preserve the latest feed position', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0].length, 2, 'the entry must not introduce a URL or publicly addressable route');
  assert.equal(h.fixture.window.history.state.otherAppState, 'retained');
  assert.equal(h.fixture.window.history.scrollRestoration, 'manual');
  h.fixture.window.history.back(); tree = h.render();
  assert.equal(detail(tree), undefined); assert.equal(h.fixture.window.scrollY, 740);
  h.fixture.window.scrollY = 360;
  h.fixture.window.history.forward(); tree = h.render();
  assert.ok(detail(tree)); assert.equal(h.fixture.window.scrollY, 0);
  h.fixture.window.history.back(); tree = h.render();
  assert.equal(detail(tree), undefined); assert.equal(h.fixture.window.scrollY, 360);
  h.fixture.window.history.forward(); tree = h.render(); assert.ok(detail(tree));
  h.unmount();
  assert.equal(h.fixture.window.history.scrollRestoration, 'auto');
  assert.deepEqual(h.fixture.window.history.state, { otherAppState: 'retained' });
  assert.equal(h.listeners.has('popstate'), false);
});

test('history cannot reopen a deleted record or restore another journal mount', async () => {
  const h = await harness(); let tree = h.render(); h.clickPost(tree); tree = h.render();
  h.fixture.window.history.back(); tree = h.render();
  h.ctx.reviewLogs = h.ctx.reviewLogs.filter(entry => entry.id !== 'one');
  h.render(); h.fixture.window.history.forward(); tree = h.render();
  assert.equal(detail(tree), undefined);
  h.listeners.get('popstate')({ state: { reviewJournalEntry: { token: 'another-session', key: 'log:two' } } });
  assert.equal(detail(h.render()), undefined);
  h.unmount();
});


test('stock tags open a cross-category exact-match feed without changing category or search', async () => {
  const h = await harness();
  h.ctx.reviewLogs = [
    {id:'one',date:'2026-11-06',text:'NVDA 继续观察 NVDA',stocks:[]},
    {id:'same',date:'2026-11-04',text:'英伟达 复盘',stocks:[]},
    {id:'noise',date:'2026-11-05',text:'XNVDAX 与 NVDA100',stocks:[]},
  ];
  h.ctx.disciplines = [
    {id:'linked',date:'2026-11-07',text:'手动关联',stocks:['NVDA'],pinned:false},
    {id:'pinned',date:'2026-10-01',text:'NVDA 投资心得',stocks:[],pinned:true},
  ];
  let tree = h.render();
  button(tree, '复盘日志').props.onClick(); tree=h.render();
  button(tree, '搜索动态').props.onClick(); tree=h.render();
  find(tree,node=>node.type==='input').props.onChange({target:{value:'继续观察'}}); tree=h.render();
  assert.equal(visible(tree).filter(node=>node.type==='article').length,1);
  const control=find(tree,node=>node.type===h.Page.ReviewPostBody);
  let stopped=false,prevented=false;
  control.props.onSelectSymbol('NVDA',{type:'click',detail:1,currentTarget:h.host,stopPropagation:()=>{stopped=true;},preventDefault:()=>{prevented=true;}});
  tree=h.render();
  assert.equal(stopped,true);assert.equal(prevented,true);
  assert.equal(detail(tree),undefined);
  assert.equal(find(tree,node=>node.type==='h1').props.children,'$NVDA');
  assert.deepEqual(visible(tree).filter(node=>node.type==='article').map(node=>node.props['data-rj-entry-key']),['insight:linked','log:one','log:same','insight:pinned']);
  assert.equal(find(tree,node=>hasClass(node,'rj-tabs')),undefined);
  assert.equal(find(tree,node=>node.type==='input'),undefined);
  assert.equal(visible(tree).some(node=>hasClass(node,'rj-inline-pin')),false);
  button(tree,'返回投资动态').props.onClick();tree=h.render();
  assert.equal(button(tree,'复盘日志').props['aria-pressed'],true);
  assert.equal(find(tree,node=>node.type==='input').props.value,'继续观察');
  assert.equal(h.fixture.window.scrollY,740);
  assert.equal(h.saves.length,0);
  h.unmount();
});

test('tag and entry navigation preserve parent pages and positions through browser history',async()=>{
  const h=await harness();h.ctx.reviewLogs[0].text='NVDA 与 QQQ';
  let tree=h.render();
  const select=(symbol)=>{find(tree,node=>node.type===h.Page.ReviewPostBody).props.onSelectSymbol(symbol,{type:'click',detail:1,stopPropagation(){},preventDefault(){}});tree=h.render();};
  select('NVDA');
  assert.equal(find(tree,node=>node.type==='h1').props.children,'$NVDA');
  h.fixture.window.scrollY=280;
  h.clickPost(tree);tree=h.render();assert.ok(detail(tree));
  h.fixture.window.scrollY=610;
  select('QQQ');assert.equal(find(tree,node=>node.type==='h1').props.children,'$QQQ');
  button(tree,'返回投资动态').props.onClick();tree=h.render();
  assert.ok(detail(tree));assert.equal(h.fixture.window.scrollY,610);
  button(tree,'返回投资动态').props.onClick();tree=h.render();
  assert.equal(find(tree,node=>node.type==='h1').props.children,'$NVDA');assert.equal(h.fixture.window.scrollY,280);
  h.fixture.window.history.back();tree=h.render();
  assert.equal(find(tree,node=>node.type==='h1').props.children,'投资动态');assert.equal(h.fixture.window.scrollY,740);
  h.fixture.window.history.forward();tree=h.render();
  assert.equal(find(tree,node=>node.type==='h1').props.children,'$NVDA');assert.equal(h.fixture.window.scrollY,280);
  h.fixture.window.history.forward();tree=h.render();assert.ok(detail(tree));assert.equal(h.fixture.window.scrollY,610);
  h.fixture.window.history.forward();tree=h.render();
  assert.equal(find(tree,node=>node.type==='h1').props.children,'$QQQ');
  assert.equal(h.pushes.every(args=>args.length===2),true);
  assert.equal(h.fixture.window.history.state.otherAppState,'retained');
  h.unmount();
});


test('timeline detail reuses evaluation, preserves references and keeps containers out of posts', async () => {
  const h = await harness();
  const event = { id:'drawdown:net_assets:2026-10-06',kind:'drawdown',metric:'net_assets',date:'2026-11-06',startDate:'2026-10-06',endDate:'2026-11-06',title:'净资产回落',value:-5,valueType:'percent',status:'active',points:[],nodes:[] };
  h.ctx.previewData.timeline = {status:'ready',events:[event],years:[2026],coverage:{},warnings:[]};
  const submissions = [];
  h.ctx.db.appendReviewTimelineReply = async (...args) => { submissions.push(args); return {...args[0],id:'timeline-container',revision:1,replies:[args[1]]}; };
  let tree=h.render();
  button(tree,'时间线').props.onClick();tree=h.render();await Promise.resolve();tree=h.render();
  let timeline=find(tree,node=>node.type===h.Page.ReviewTimeline);
  assert.equal(timeline.props.data.events[0].id,event.id);
  assert.equal(button(tree,'写复盘'),undefined);
  timeline.props.onSelectEvent(event.id);tree=h.render();
  assert.match(textOf(tree),/时间线记录/);
  timeline=find(tree,node=>node.type===h.Page.ReviewTimeline);
  assert.equal(timeline.props.selectedEventId,event.id);
  button(timeline.props.renderEvaluations(event),'写评价').props.onClick();tree=h.render();
  const composer=find(tree,node=>node.type===h.Page.ReviewEvaluationComposer);
  assert.ok(composer);
  const reply={id:'timeline-reply',date:'2026-11-07',text:'这次仓位过重。',score:4};
  const saved=await composer.props.db.appendReviewJournalReply(composer.props.entry,reply,'owner');
  composer.props.onSaved(saved);composer.props.onClose();tree=h.render();
  assert.equal(submissions.length,1);
  assert.equal(saved.timelineEvent.id,event.id);
  timeline=find(tree,node=>node.type===h.Page.ReviewTimeline);
  assert.match(textOf(timeline.props.renderEvaluations(event)),/这次仓位过重/);
  button(tree,'返回投资动态').props.onClick();tree=h.render();
  button(tree,'全部').props.onClick();tree=h.render();
  assert.equal(visible(tree).filter(node=>node.type==='article').length,records().length);
  h.unmount();
});

test('timeline evaluation keeps one repository adapter across parent updates and edits while forwarding timeline writes', async () => {
  const h = await harness();
  const event = { id: 'high:annual_return:2026-10-06', kind: 'high', metric: 'annual_return', date: '2026-11-06', startDate: '2026-10-06', title: '年内收益率新高', points: [], nodes: [] };
  h.ctx.previewData.timeline = { status: 'ready', events: [event], years: [2026] };
  const writes = [], edits = [];
  h.ctx.db.fetchReviewAccountSnapshot = async () => ({ asOfDate: '2026-11-06' });
  h.ctx.db.appendReviewTimelineReply = async (...args) => { writes.push(args); return { ...args[0], id: 'timeline-container', revision: 1, replies: [args[1]] }; };
  h.ctx.db.appendReviewJournalReply = () => assert.fail('timeline append must not use ordinary journal append');
  h.ctx.db.updateReviewJournalReply = async (...args) => { edits.push(args); return { ...args[0], revision: 2, replies: [args[2]] }; };
  let tree = h.render();
  button(tree, '时间线').props.onClick(); tree = h.render(); await Promise.resolve(); tree = h.render();
  find(tree, node => node.type === h.Page.ReviewTimeline).props.onEvaluate(event); tree = h.render();
  const composer = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.open);
  const adapter = composer.props.db;
  assert.notEqual(adapter, h.ctx.db);
  assert.equal(adapter.fetchReviewAccountSnapshot, h.ctx.db.fetchReviewAccountSnapshot);
  for (let tick = 0; tick < 6; tick++) {
    h.ctx.stockTrades = [...h.ctx.stockTrades]; h.ctx.usdCny = 7 + tick / 100;
    tree = h.render();
    const updated = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.open);
    assert.equal(updated.props.db, adapter, 'parent market updates must not cancel snapshot reads through a fresh adapter');
    assert.equal(updated.props.db.fetchReviewAccountSnapshot, adapter.fetchReviewAccountSnapshot);
    assert.equal(updated.key, composer.key);
  }
  const reply = { id: 'stable-reply', date: '2026-11-07', text: '高点后的评价' };
  const saved = await adapter.appendReviewJournalReply(composer.props.entry, reply, 'owner');
  assert.deepEqual(writes, [[composer.props.entry, reply, 'owner']]);
  composer.props.onSaved(saved); composer.props.onClose(); tree = h.render();
  const timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  button(timeline.props.renderEvaluations(event), '评论操作').props.onClick(); tree = h.render();
  button(tree, '修改评价').props.onClick(); tree = h.render();
  const editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.reply);
  assert.equal(editor.props.db, adapter, 'editing the timeline evaluation reuses the same adapter');
  assert.equal(editor.props.db.updateReviewJournalReply, h.ctx.db.updateReviewJournalReply);
  const changed = { ...reply, text: '修改后的高点评价' };
  const edited = await editor.props.db.updateReviewJournalReply(editor.props.entry, editor.props.reply, changed, 'owner');
  assert.deepEqual(edits, [[editor.props.entry, editor.props.reply, changed, 'owner']]);
  editor.props.onSaved(edited); editor.props.onClose(); tree = h.render();
  assert.match(textOf(find(tree, node => node.type === h.Page.ReviewTimeline).props.renderEvaluations(event)), /修改后的高点评价/);
  h.unmount();
});

test('grouped earnings share comments while append, edit and delete retain their original containers', async () => {
  const h = await harness({ preferences: { showTimeline: true, eventTypes: ['return_high', 'pnl_high'] } });
  const point = { date: '2026-10-06', cumulativePnlUsd: 5000, cumulativeReturnPct: 20 };
  const amount = { id: 'high:cumulative_pnl:2026-10-06', kind: 'high', metric: 'cumulative_pnl',
    date: point.date, startDate: point.date, title: '累计盈利新高', current: point, points: [point], nodes: [{ key: 'current', point }] };
  const rate = { ...amount, id: 'high:cumulative_return:2026-10-06', metric: 'cumulative_return', title: '累计收益率新高' };
  const makeContainer = (id, source, label, date) => ({ id, type: 'log', date: source.startDate, text: source.title, revision: 1,
    stocks: [], images: [], timelineEvent: { version: 1, id: source.id, kind: source.kind, metric: source.metric, date: source.startDate, title: source.title },
    replies: [{ id: 'same-reply-id', date, text: label }] });
  const amountEntry = makeContainer('amount-container', amount, '金额原评论', '2026-11-07');
  const rateEntry = makeContainer('rate-container', rate, '收益率原评论', '2026-11-06');
  h.ctx.reviewLogs.push(amountEntry, rateEntry);
  h.ctx.previewData.timeline = { status: 'ready', events: [rate, amount], years: [2026] };
  const appends = [], edits = [];
  h.ctx.db.appendReviewTimelineReply = async (entry, reply, owner) => {
    appends.push({ entry, reply, owner }); return { ...entry, revision: entry.revision + 1, replies: [...entry.replies, reply] };
  };
  h.ctx.db.updateReviewJournalReply = async (entry, original, replacement, owner) => {
    edits.push({ entry, original, replacement, owner });
    return { ...entry, revision: entry.revision + 1, replies: entry.replies.map(item => item.id === original.id ? replacement : item) };
  };
  let tree = h.render(); await settle(); tree = h.render();
  assert.equal(systemPosts(tree, h).length, 1);
  assert.equal(systemPosts(tree, h)[0].props.commentCount, 2);
  // A previous raw return route remains valid even though the display anchor is amount.
  systemPosts(tree, h)[0].props.onOpen(rate.id, clickEvent(h)); tree = h.render();
  let timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.equal(timeline.props.selectedEventId, amount.id);
  assert.equal(timeline.props.getCommentCount(amount), 2);
  assert.equal(timeline.props.getCommentCount(rate), 2, 'both source aliases share the merged comment count');
  let comments = timeline.props.renderEvaluations();
  assert.match(textOf(comments), /收益率原评论.*金额原评论/);
  assert.equal(new Set(visible(comments).filter(node => hasClass(node, 'rj-reply')).map(node => node.key)).size, 2);
  button(comments, '写评价').props.onClick(); tree = h.render();
  let editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.open);
  assert.equal(editor.props.entry, amountEntry);
  const adapter = editor.props.db;
  const newReply = { id: 'new-group-comment', date: '2026-11-07', text: '合并之后的新评论' };
  editor.props.onSaved(await editor.props.db.appendReviewJournalReply(editor.props.entry, newReply, 'owner'));
  editor.props.onClose(); tree = h.render();
  assert.equal(appends[0].entry.replies.length, 1, 'append must not send aggregated replies to the anchor');
  assert.equal(h.ctx.reviewLogs.find(entry => entry.id === rateEntry.id), rateEntry);
  timeline = find(tree, node => node.type === h.Page.ReviewTimeline); comments = timeline.props.renderEvaluations();
  assert.equal(timeline.props.getCommentCount(rate), 3, 'the timeline count updates after adding a comment');
  const rateComment = visible(comments).find(node => hasClass(node, 'rj-reply') && textOf(node).includes('收益率原评论'));
  button(rateComment, '评论操作').props.onClick(); tree = h.render();
  button(tree, '修改评价').props.onClick(); tree = h.render();
  editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.reply);
  assert.equal(editor.props.db, adapter);
  assert.equal(editor.props.entry, rateEntry);
  assert.deepEqual(editor.props.reply, rateEntry.replies[0]);
  assert.equal(editor.props.reply.timelineReplySource, undefined);
  const editedReply = { ...editor.props.reply, text: '修改收益率原评论' };
  editor.props.onSaved(await editor.props.db.updateReviewJournalReply(editor.props.entry, editor.props.reply, editedReply, 'owner'));
  editor.props.onClose(); tree = h.render();
  assert.equal(edits[0].entry.id, rateEntry.id);
  assert.equal(h.ctx.reviewLogs.find(entry => entry.id === amountEntry.id).replies[0].text, '金额原评论');
  timeline = find(tree, node => node.type === h.Page.ReviewTimeline); comments = timeline.props.renderEvaluations();
  const changed = visible(comments).find(node => hasClass(node, 'rj-reply') && textOf(node).includes('修改收益率原评论'));
  button(changed, '评论操作').props.onClick(); tree = h.render();
  button(tree, '删除评价').props.onClick(); tree = h.render();
  await button(tree, '确认删除评价').props.onClick(); tree = h.render();
  assert.equal(h.replyDeletes.at(-1).entry.id, rateEntry.id);
  assert.equal(h.replyDeletes.at(-1).reply.timelineReplySource, undefined);
  assert.equal(h.ctx.reviewLogs.find(entry => entry.id === rateEntry.id).replies.length, 0);
  assert.equal(h.ctx.reviewLogs.find(entry => entry.id === amountEntry.id).replies.length, 2);
  timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.equal(timeline.props.getCommentCount(rate), 2, 'the timeline count updates after deleting a merged source comment');
  assert.equal(h.saves.length, 0);
  h.unmount();
});

test('timeline menu refresh retains the displayed original for edit and delete conflict checks', async () => {
  for (const operation of ['edit', 'delete']) {
    const h = await harness({ removeReply: async (entry, original) => {
      assert.equal(entry.revision, 2);
      assert.equal(original.text, '菜单打开时的原评论');
      throw new Error('评价已由其他设备修改，请刷新后重试。');
    } });
    const event = { id: 'high:annual_pnl:2026-10-06', kind: 'high', metric: 'annual_pnl',
      date: '2026-10-06', startDate: '2026-10-06', title: '年内收益金额新高', points: [], nodes: [] };
    const original = { id: 'reply', date: event.date, text: '菜单打开时的原评论' };
    const entry = { id: 'source-container', type: 'log', date: event.date, text: event.title, revision: 1,
      timelineEvent: { version: 1, id: event.id, kind: event.kind, metric: event.metric, date: event.date, title: event.title },
      replies: [original], stocks: [], images: [] };
    h.ctx.reviewLogs.push(entry);
    h.ctx.previewData.timeline = { status: 'ready', events: [event], years: [2026] };
    let tree = h.render(); button(tree, '时间线').props.onClick(); tree = h.render(); await settle(); tree = h.render();
    find(tree, node => node.type === h.Page.ReviewTimeline).props.onSelectEvent(event.id); tree = h.render();
    button(find(tree, node => node.type === h.Page.ReviewTimeline).props.renderEvaluations(), '评论操作').props.onClick(); tree = h.render();
    const remote = { ...entry, revision: 2, replies: [{ ...original, text: '另一台设备修改后的评论' }] };
    h.ctx.reviewLogs = h.ctx.reviewLogs.map(item => item.id === entry.id ? remote : item); tree = h.render();
    if (operation === 'edit') {
      button(tree, '修改评价').props.onClick(); tree = h.render();
      const editor = find(tree, node => node.type === h.Page.ReviewEvaluationComposer && node.props.reply);
      assert.equal(editor.props.entry, remote);
      assert.deepEqual(editor.props.reply, original, 'the expected payload must remain the menu-time original');
    } else {
      button(tree, '删除评价').props.onClick(); tree = h.render();
      await button(tree, '确认删除评价').props.onClick(); tree = h.render();
      assert.match(textOf(tree), /评价已由其他设备修改/);
      assert.equal(h.ctx.reviewLogs.find(item => item.id === remote.id), remote);
    }
    h.unmount();
  }
});

test('timeline drafts stay mounted through category reloads and linked stock tags show only posts', async () => {
  const h = await harness();
  const event = {id:'drawdown:net_assets:2026-10-06',kind:'drawdown',metric:'net_assets',date:'2026-11-06',startDate:'2026-10-06',title:'净资产回落',points:[],nodes:[]};
  h.ctx.previewData.timeline={status:'ready',events:[event],years:[2026]};
  let tree=h.render();button(tree,'时间线').props.onClick();tree=h.render();await Promise.resolve();tree=h.render();
  find(tree,node=>node.type===h.Page.ReviewTimeline).props.onEvaluate(event);tree=h.render();
  const editor=find(tree,node=>node.type===h.Page.ReviewEvaluationComposer);
  editor.props.onClose();button(tree,'返回投资动态').props.onClick();tree=h.render();
  button(tree,'全部').props.onClick();tree=h.render();
  button(tree,'时间线').props.onClick();tree=h.render();tree=h.render();
  assert.equal(find(tree,node=>node.type===h.Page.ReviewEvaluationComposer).key,editor.key,'loading must not unmount the draft');
  await Promise.resolve();tree=h.render();
  find(tree,node=>node.type===h.Page.ReviewTimeline).props.onSelectEvent(event.id);tree=h.render();
  find(tree,node=>node.type===h.Page.ReviewTimeline).props.onOpenEntry(h.ctx.reviewLogs[0]);tree=h.render();
  find(tree,node=>node.type===h.Page.ReviewPostBody).props.onSelectSymbol('NVDA',{type:'click',detail:1,stopPropagation(){},preventDefault(){}});tree=h.render();
  assert.match(textOf(tree),/1 篇相关博文/);
  assert.equal(visible(tree).filter(node=>node.type==='article').length,1);
  assert.equal(find(tree,node=>node.type===h.Page.ReviewTimeline),undefined);
  h.unmount();
});

const activityEvents = () => [
  { id: 'high:net_assets:2026-11-05', kind: 'high', metric: 'net_assets', date: '2026-11-06', startDate: '2026-11-05', endDate: '2026-11-06', title: '净资产新高', value: 120000, valueType: 'money', points: [], nodes: [] },
  { id: 'drawdown:net_assets:2026-10-06', kind: 'drawdown', metric: 'net_assets', date: '2026-11-06', startDate: '2026-10-06', trigger: { date: '2026-11-01' }, title: '净资产回落', value: -12, valueType: 'percent', status: 'active', points: [], nodes: [] },
];
const systemPosts = (tree, h) => visible(tree).filter(node => node.type === h.Page.ReviewTimelinePost);
const clickEvent = h => ({ type: 'click', detail: 1, currentTarget: h.host });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('the avatar opens an independent settings route and browser history restores the exact feed', async () => {
  const h = await harness(); h.ctx.navigationTab = true;
  let tree = h.render();
  button(tree, '复盘日志').props.onClick(); tree = h.render();
  button(tree, '搜索动态').props.onClick(); tree = h.render();
  find(tree, node => node.type === 'input').props.onChange({ target: { value: '第二条' } }); tree = h.render();
  h.fixture.window.scrollY = 485;
  button(tree, '动态设置').props.onClick(clickEvent(h)); tree = h.render();
  assert.ok(hasClass(tree, 'rj-settings-page'));
  assert.equal(find(tree, node => node.type === 'h1').props.children, '动态设置');
  assert.ok(find(tree, node => node.type === h.Page.ReviewPreferences));
  assert.equal(firstPost(tree), undefined);
  assert.equal(button(tree, '写复盘'), undefined);
  assert.equal(find(tree, node => hasClass(node, 'rj-entry-missing')), undefined);
  assert.equal(h.fixture.window.history.state.reviewJournalEntry.key, 'settings');
  assert.equal(h.fixture.window.scrollY, 0);
  h.fixture.window.scrollY = 92;
  h.fixture.window.history.back(); tree = h.render();
  assert.equal(button(tree, '复盘日志').props['aria-pressed'], true);
  assert.equal(find(tree, node => node.type === 'input').props.value, '第二条');
  assert.equal(firstPost(tree).props['data-rj-entry-key'], 'log:two');
  assert.equal(h.fixture.window.scrollY, 485);
  h.fixture.window.history.forward(); tree = h.render();
  assert.ok(find(tree, node => node.type === h.Page.ReviewPreferences));
  assert.equal(h.fixture.window.scrollY, 92);
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  assert.equal(find(tree, node => node.type === 'h1').props.children, '投资动态');
  assert.equal(h.fixture.window.scrollY, 485);
  assert.equal(h.saves.length, 0);
  assert.equal(h.fixture.leftJournal, undefined);
  h.unmount();
});

test('a mixed system post opens its event and shares saved evaluations with the timeline category', async () => {
  const h = await harness({ preferences: { showTimeline: true, eventTypes: ['net_assets_high', 'drawdown'] } });
  const events = activityEvents(), event = events[0];
  h.ctx.previewData.timeline = { status: 'ready', events, years: [2026], coverage: {}, warnings: [] };
  h.ctx.reviewLogs.push({ id: 'event-container', type: 'log', date: event.startDate, text: event.title, stocks: [], images: [], revision: 1,
    timelineEvent: { version: 1, id: event.id, kind: event.kind, metric: event.metric, date: event.startDate, title: event.title },
    replies: [{ id: 'earlier', date: '2026-11-06', text: '原有时间线评价' }] });
  const submissions = [];
  h.ctx.db.appendReviewTimelineReply = async (entry, reply, owner) => {
    submissions.push({ entry, reply, owner });
    return { ...entry, revision: 2, replies: [...entry.replies, reply] };
  };
  let tree = h.render(); await settle(); tree = h.render();
  assert.deepEqual(systemPosts(tree, h).map(node => node.props.event.id), [events[1].id, events[0].id]);
  assert.equal(visible(tree).filter(node => node.type === 'article').length, records().length, 'the persisted event container must not render as a duplicate ordinary post');
  const systemPost = systemPosts(tree, h).find(node => node.props.event.id === event.id);
  assert.equal(systemPost.props.commentCount, 1);
  assert.equal(systemPost.props.avatarNode.type, h.Page.ReviewSystemAvatar);
  assert.equal(systemPost.props.authorNode.type, h.Page.ReviewSystemName);
  assert.match(renderToStaticMarkup(systemPost.props.avatarNode), /quote-system-fox\.jpg/);
  assert.match(renderToStaticMarkup(systemPost.props.authorNode), /Quote.*小助手/);
  assert.ok(find(firstPost(tree), node => node.type === h.Page.AuthorName && node.props.identity.nickname === '复盘者'));

  systemPost.props.onOpen(event.id, clickEvent(h)); tree = h.render();
  let timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.equal(timeline.props.selectedEventId, event.id);
  const author = find(tree, node => hasClass(node, 'rj-timeline-author'));
  assert.equal(find(author, node => node.type === 'time').props.dateTime, event.date);
  assert.ok(find(author, node => node.type === h.Page.ReviewSystemAvatar));
  assert.ok(find(author, node => node.type === h.Page.ReviewSystemName));
  const replies = timeline.props.renderEvaluations(event);
  assert.ok(find(replies, node => node.type === h.Page.AuthorName && node.props.identity.nickname === '复盘者'));
  assert.equal(find(replies, node => node.type === h.Page.ReviewSystemName), undefined);

  assert.match(textOf(timeline.props.renderEvaluations(event)), /原有时间线评价/);
  button(timeline.props.renderEvaluations(event), '写评价').props.onClick(); tree = h.render();
  const composer = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  assert.equal(composer.props.entry.id, 'event-container');
  assert.equal(composer.props.entry.timelineEvent.id, event.id);
  assert.equal(composer.props.entry.timelineEvent.date, event.startDate, 'the saved evaluation reference retains its original date');
  const reply = { id: 'new-review', date: '2026-11-07', text: '新高之后仍控制仓位', score: 8 };
  const saved = await composer.props.db.appendReviewJournalReply(composer.props.entry, reply, 'owner');
  composer.props.onSaved(saved); composer.props.onClose(); tree = h.render();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].entry.timelineEvent.id, event.id);
  assert.equal(submissions[0].owner, 'owner');
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  assert.equal(systemPosts(tree, h).find(node => node.props.event.id === event.id).props.commentCount, 2);
  button(tree, '时间线').props.onClick(); tree = h.render();
  find(tree, node => node.type === h.Page.ReviewTimeline).props.onSelectEvent(event.id); tree = h.render();
  timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.match(textOf(timeline.props.renderEvaluations(event)), /原有时间线评价.*新高之后仍控制仓位/);
  assert.equal(h.ctx.reviewLogs.filter(entry => entry.timelineEvent?.id === event.id).length, 1);
  assert.equal(h.saves.length, 0, 'adding an event evaluation must use its existing event-specific save operation');
  h.unmount();
});

test('All keeps only the latest branch event while the complete timeline preserves older evaluation containers', async () => {
  const h = await harness({ preferences: { showTimeline: true, eventTypes: ['net_assets_high', 'drawdown'] } });
  const currentEvents = activityEvents(), latest = currentEvents[0];
  const older = { ...latest, id: 'high:net_assets:2026-09-01', date: '2026-09-30', startDate: '2026-09-01', endDate: '2026-09-30', title: '上一次净资产新高' };
  const events = [older, ...currentEvents];
  const reference = { version: 1, id: older.id, kind: older.kind, metric: older.metric, date: older.startDate, title: older.title };
  const replies = [{ id: 'old-high-reply', date: '2026-10-01', text: '旧高点留下的评价' }];
  const container = { id: 'old-high-container', type: 'log', date: older.startDate, text: older.title, stocks: [], images: [], revision: 1, timelineEvent: reference, replies };
  h.ctx.reviewLogs.push(container);
  h.ctx.previewData.timeline = { status: 'ready', events, years: [2026], coverage: {}, warnings: [] };
  let tree = h.render(); await settle(); tree = h.render();
  assert.deepEqual(systemPosts(tree, h).map(node => node.props.event.id), [currentEvents[1].id, currentEvents[0].id]);
  assert.equal(systemPosts(tree, h).find(node => node.props.event.id === latest.id).props.commentCount, 0, 'old evaluations must not move to the latest card');
  button(tree, '时间线').props.onClick(); tree = h.render();
  let timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.deepEqual(new Set(timeline.props.data.events.map(event => event.id)), new Set(events.map(event => event.id)));
  assert.equal(timeline.props.data.events.find(event => event.id === older.id), older);
  timeline.props.onSelectEvent(older.id); tree = h.render();
  timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.equal(timeline.props.selectedEventId, older.id);
  assert.match(textOf(timeline.props.renderEvaluations(older)), /旧高点留下的评价/);
  button(timeline.props.renderEvaluations(older), '写评价').props.onClick(); tree = h.render();
  const composer = find(tree, node => node.type === h.Page.ReviewEvaluationComposer);
  assert.equal(composer.props.entry.id, container.id);
  assert.equal(composer.props.entry.timelineEvent, reference);
  assert.equal(composer.props.entry.replies, replies);
  composer.props.onClose(); tree = h.render();
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  button(tree, '全部').props.onClick(); tree = h.render();
  assert.deepEqual(systemPosts(tree, h).map(node => node.props.event.id), [currentEvents[1].id, currentEvents[0].id]);
  assert.equal(h.ctx.reviewLogs.find(entry => entry.id === container.id), container);
  assert.equal(h.saves.length, 0);
  assert.equal(h.deletes.length, 0);
  h.unmount();
});

test('master and event-type settings filter only All while the complete timeline remains available', async () => {
  const h = await harness({ preferences: { showTimeline: true, eventTypes: ['net_assets_high', 'drawdown'] } });
  const events = activityEvents();
  h.ctx.previewData.timeline = { status: 'ready', events, years: [2026], coverage: {}, warnings: [] };
  let tree = h.render(); await settle(); tree = h.render();
  assert.equal(systemPosts(tree, h).length, 2);
  const changeSettings = async patch => {
    button(tree, '动态设置').props.onClick(clickEvent(h)); tree = h.render();
    await find(tree, node => node.type === h.Page.ReviewPreferences).props.onChange(patch);
    tree = h.render(); button(tree, '返回投资动态').props.onClick(); tree = h.render();
  };
  const checkCompleteTimeline = () => {
    button(tree, '时间线').props.onClick(); tree = h.render();
    const timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
    assert.deepEqual(new Set(timeline.props.data.events.map(event => event.id)), new Set(events.map(event => event.id)));
    assert.equal(timeline.props.loading, false);
    button(tree, '全部').props.onClick(); tree = h.render();
  };
  await changeSettings({ eventTypes: ['drawdown'] });
  assert.deepEqual(systemPosts(tree, h).map(node => node.props.event.id), [events[1].id]);
  checkCompleteTimeline();
  await changeSettings({ showTimeline: false });
  assert.equal(systemPosts(tree, h).length, 0);
  checkCompleteTimeline();
  await changeSettings({ showTimeline: true, eventTypes: [] });
  assert.equal(systemPosts(tree, h).length, 0);
  checkCompleteTimeline();
  await changeSettings({ eventTypes: ['net_assets_high'] });
  assert.deepEqual(systemPosts(tree, h).map(node => node.props.event.id), [events[0].id]);
  button(tree, '复盘日志').props.onClick(); tree = h.render();
  assert.equal(systemPosts(tree, h).length, 0);
  assert.equal(visible(tree).filter(node => node.type === 'article').length, records().length);
  assert.equal(h.saves.length, 0);
  h.unmount();
});

test('loaded timeline data is reused across rerenders, settings and feed-category navigation', async () => {
  const h = await harness({ preferences: { showTimeline: true, eventTypes: ['net_assets_high'] } });
  delete h.ctx.previewData;
  h.ctx.db.readCachedReviewIdentity = () => ({ nickname: '当前账户' });
  h.ctx.db.fetchReviewIdentity = async () => ({ nickname: '当前账户' });
  h.ctx.db.subscribeReviewIdentity = () => () => {};
  const calls = [];
  h.ctx.db.fetchReviewTimeline = async owner => {
    calls.push(owner);
    return { status: 'ready', events: activityEvents(), years: [2026], coverage: {}, warnings: [] };
  };
  let tree = h.render(); button(tree,'全部动态范围').props.onClick(); tree=h.render(); button(tree,'显示私密记录').props.onClick(); tree=h.render(); await settle(); tree=h.render();
  assert.deepEqual(calls, ['owner']);
  for (let index = 0; index < 4; index++) tree = h.render();
  button(tree, '动态设置').props.onClick(clickEvent(h)); tree = h.render();
  button(tree, '返回投资动态').props.onClick(); tree = h.render();
  for (const category of ['复盘日志', '全部', '时间线', '投资心得', '全部']) {
    button(tree, category).props.onClick(); tree = h.render(); await settle(); tree = h.render();
  }
  assert.deepEqual(calls, ['owner'], 'ready data must not re-fetch merely because the requested-view flag changes');
  assert.equal(systemPosts(tree, h).length, 1);
  h.unmount();
});

test('automatic reads wait for confirmed preferences and ignore a response from a departed view', async () => {
  const h = await harness({ preferences: { showTimeline: true, eventTypes: ['net_assets_high'] } });
  delete h.ctx.previewData;
  h.ctx.db.readCachedReviewIdentity = () => ({ nickname: '当前账户' });
  h.ctx.db.fetchReviewIdentity = async () => ({ nickname: '当前账户' });
  h.ctx.db.subscribeReviewIdentity = () => () => {};
  h.fixture.preferenceState.ready = false;
  const requests = [];
  h.ctx.db.fetchReviewTimeline = owner => new Promise(resolve => requests.push({ owner, resolve }));
  let tree = h.render(); button(tree,'全部动态范围').props.onClick(); tree=h.render(); button(tree,'显示私密记录').props.onClick(); tree=h.render(); await settle(); tree=h.render();
  assert.equal(requests.length, 0);
  assert.equal(visible(tree).filter(node => node.type === 'article').length, records().length, 'ordinary posts must not wait for display preferences');
  h.fixture.preferenceState.ready = true;
  tree = h.render(); tree = h.render();
  assert.equal(requests.length, 1);
  button(tree, '复盘日志').props.onClick(); tree = h.render();
  requests[0].resolve({ status: 'ready', events: activityEvents(), years: [2026] });
  await settle(); tree = h.render();
  assert.equal(systemPosts(tree, h).length, 0);
  button(tree, '时间线').props.onClick(); tree = h.render();
  assert.equal(requests.length, 2, 'the canceled view response must not mark the new view ready');
  assert.equal(find(tree, node => node.type === h.Page.ReviewTimeline).props.loading, true);
  const latestEvents = activityEvents().slice(1);
  requests[1].resolve({ status: 'ready', events: latestEvents, years: [2026] });
  await settle(); tree = h.render();
  const timeline = find(tree, node => node.type === h.Page.ReviewTimeline);
  assert.equal(timeline.props.loading, false);
  assert.deepEqual(timeline.props.data.events, latestEvents);
  for (let index = 0; index < 3; index++) tree = h.render();
  assert.equal(requests.length, 2);
  h.unmount();
});
