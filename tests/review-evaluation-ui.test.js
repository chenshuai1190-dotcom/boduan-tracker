import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

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

async function harness({ append } = {}) {
  const slots = [], calls = [], saved = [], listeners = new Map(); let cursor = 0, effects = [], closes = 0;
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
  };
  const key = `__reviewEvaluationUI${++nextId}`; globalThis[key] = fixture;
  let components;
  try {
    const compiled = await transformWithOxc(`
      import { Activity, Check, ImagePlus, LineChart, Loader2, Smile, Star, Wallet, X } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import { localReviewDate } from ${moduleUrl('reviewJournalFeed')};
      import { normalizeReviewEvaluationTags, normalizeReviewAccountSnapshot, normalizeReviewTradeReferences } from ${moduleUrl('reviewEvaluationModel')};
      import { collectReviewReplayTrades } from ${moduleUrl('reviewStockReplayModel')};
      import { keepReviewComposerInputVisible } from ${moduleUrl('reviewComposerVisibility')};
      import { marketTextHexColor } from ${moduleUrl('marketColorMode')};
      const { React, document, window, requestAnimationFrame } = globalThis[${JSON.stringify(key)}];
      const getVixComparisonExpectedCloseDate = () => '2026-11-06';
      const SnapshotCard = () => null, SnapshotPicker = () => null, ReviewStockReplay = () => null;
      ${source.slice(source.indexOf('const PRESET_TAGS'))}
      export { AccountPicker };
    `, 'ReviewEvaluationUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[key]; }
  const Dialog = () => null;
  const props = { open: true, entry: { id: 'entry-1', type: 'log', revision: 4, date: '2026-11-06', text: '过去的判断', replies: [] },
    identityNode: React.createElement('span', null, '作者'), userId: 'owner', stockTrades: [], Dialog, EmojiPicker: () => null,
    renderPhotos: () => null, knownTags: [],
    db: { async appendReviewJournalReply(entry, reply, owner) {
      calls.push({ entry, reply: structuredClone(reply), owner });
      return append ? append(entry, reply, owner) : { ...entry, revision: 5, replies: [...entry.replies, reply] };
    } },
    onSaved: value => saved.push(value), onClose: () => { closes++; props.open = false; },
  };
  const render = (Component, componentProps) => { cursor = 0; effects = []; const tree = Component(componentProps);
      for (const node of walk(tree)) if (node.ref) node.ref.current = { focus() {}, selectionStart: 0, selectionEnd: 0, setSelectionRange() {}, getBoundingClientRect: () => ({ bottom: 800 }) };
      effects.forEach(effect => effect()); return tree; };
  return { props, calls, saved, components, Dialog, closes: () => closes,
    render: () => render(components.default, props),
    renderAccount: accountProps => render(components.AccountPicker, { ...accountProps, Dialog }),
    cleanup() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

function chooseScore(tree, score) {
  rating(tree).props.onPointerDown({ currentTarget: { getBoundingClientRect: () => ({ left: 10, width: 200 }) }, clientX: 10 + score * 20 - 1 });
}
function customForm(tree) { return find(tree, node => node.type === 'form'); }
function customInput(tree) { return find(tree, node => node.type === 'input' && node.props.id === 'rev-custom-tag'); }

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
