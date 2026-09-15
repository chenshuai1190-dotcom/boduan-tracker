import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/TechnicalExplanationSheet.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/TechnicalExplanationSheet.css', import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const reactUrl = dataUrl(`import React from ${JSON.stringify(import.meta.resolve('react'))};
  export default { ...React, useRef: current => ({ current }), useEffect() {}, useId: () => 'tes-test-title' };`);
const portalUrl = dataUrl('export function createPortal(children) { return children; }');
const transformed = await transformWithOxc(source, 'TechnicalExplanationSheet.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/TechnicalExplanationSheet\.css\1;?/g, '')
  .replace(/from (["'])(react|react-dom|lucide-react)\1/g, (_, _quote, module) => `from ${JSON.stringify(module === 'react' ? reactUrl : module === 'react-dom' ? portalUrl : import.meta.resolve(module))}`);
const { default: Sheet, attachTechnicalExplanationAccess, startTechnicalSheetGesture, updateTechnicalSheetGesture, shouldDismissTechnicalSheet } = await import(dataUrl(compiled));

const explanation = {
  title: '均线结构', status: '多头排列', asOfDate: '2026-09-14',
  summary: '多头结构完整，价格位于主要均线上方。', currentView: [],
  rows: [{ label: 'MA30', value: '$123.45' }, { label: 'MA60', value: null }],
  why: ['收盘价高于 MA30，MA30 高于 MA60。'], plain: ['当前价格位于较强的均线结构。'],
  doesNotMean: ['不代表下一交易日一定上涨。'], incomplete: false,
};
function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
const byClass = (tree, name) => nodes(tree, node => node.props.className?.split(/\s+/).includes(name))[0];
function renderSheet(t, props = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else delete globalThis.document; });
  return Sheet({ ticker: 'MSFT', explanation, onClose() {}, ...props });
}

test('sheet renders the agreed sections, raw missing values and a single close control', t => {
  const tree = renderSheet(t);
  const html = renderToStaticMarkup(tree);
  for (const expected of ['MSFT', '均线结构', explanation.summary, '关键数据', '判断依据', '怎么理解', '注意', '2026-09-14', '$123.45', '—']) assert.ok(html.includes(expected));
  assert.ok(html.indexOf(explanation.summary) < html.indexOf('$123.45'), 'the short conclusion comes before the data');
  assert.ok(html.indexOf(explanation.summary) < html.indexOf('关键数据'));
  assert.doesNotMatch(html, /当前状态|为什么这样判断|白话解释|不代表什么/);
  assert.equal(nodes(tree, node => node.type === 'button').length, 1);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="tes-test-title"/);
  assert.doesNotMatch(html, /我知道了|确认|取消/);
  assert.match(source, /createPortal\([\s\S]*document\.body/);
  assert.doesNotMatch(source, /\bfetch\s*\(|supabase|localStorage|sessionStorage|setActivePage|setPeriod|history\.(?:push|replace)/);
});

test('English labels and unavailable inputs are explicit without inventing zero', t => {
  const tree = renderSheet(t, { language: 'en', explanation: { ...explanation, title: 'Moving-average structure', summary: '', status: null, incomplete: true, why: [], plain: [], doesNotMean: [] } });
  const html = renderToStaticMarkup(tree);
  for (const expected of ['Close explanation', 'Key data', 'Current data is insufficient to provide a complete technical explanation.']) assert.ok(html.includes(expected));
  assert.match(html, /class="tes-status">—</);
  assert.doesNotMatch(html, /\$0(?:\.00)?/);
});

test('rules and event evidence are separate native disclosures and start collapsed', t => {
  const model = { ...explanation, currentView: ['当前价格已收复部分跌幅。'],
    ruleDetails: { rows: [{ label: '系统观察', value: 'MA30是否走高，并扩大相对MA60的领先优势。', layout: 'narrative' }, { label: '五日领先幅度变化', value: '-0.2474个百分点' }], lines: ['至少3次有效收窄。'] },
    eventDetails: { rows: [{ label: '确认日期', value: '2026-09-02' }], lines: ['这是此前确认的事件。'] } };
  const html = renderToStaticMarkup(renderSheet(t, { explanation: model }));
  assert.equal((html.match(/<details /g) || []).length, 2);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[=>\s])/);
  assert.match(html, /data-technical-details="event"[\s\S]*<summary>查看事件详情/);
  assert.match(html, /data-technical-details="rules"[\s\S]*<summary>查看规则详情/);
  const primary = html.slice(0, html.indexOf('<details '));
  assert.match(primary, /当前怎么看[\s\S]*当前价格已收复部分跌幅/);
  assert.doesNotMatch(primary, /-0.2474|2026-09-02|至少3次/);
  assert.match(source, /FOCUSABLE\s*=\s*'[^']*summary/);
  assert.match(html, /<div class="tes-value-narrative"><dt>系统观察<\/dt><dd>MA30是否走高，并扩大相对MA60的领先优势。<\/dd><\/div>/);
  assert.match(html, /<div><dt>五日领先幅度变化<\/dt><dd>-0.2474个百分点<\/dd><\/div>/);
});

test('empty details and empty narrative sections do not leave misleading empty entries', t => {
  const html = renderToStaticMarkup(renderSheet(t, { explanation: { ...explanation, currentView: [], ruleDetails: { rows: [], lines: [] }, eventDetails: null } }));
  assert.doesNotMatch(html, /查看事件详情|查看规则详情|当前怎么看|<details/);
});

test('risk contributions stay in the collapsed event detail and preserve supplied scores', t => {
  const model = { ...explanation, eventDetails: { rows: [], lines: [], scoreBreakdown: {
    title: '风险评分构成', rows: [{ label: '基础状态', value: '+45' }, { label: '恢复调整', value: '-20' }, { label: '最终评分', value: '30 / 100 · 低' }],
  } } };
  const html = renderToStaticMarkup(renderSheet(t, { explanation: model }));
  const primary = html.slice(0, html.indexOf('<details '));
  assert.doesNotMatch(primary, /风险评分构成|基础状态|恢复调整/);
  assert.match(html, /<h3>风险评分构成<\/h3>[\s\S]*<dt>基础状态<\/dt><dd>\+45<\/dd>[\s\S]*30 \/ 100 · 低/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[=>\s])/);
});

test('only an intentional backdrop click or the close button dismisses the sheet', t => {
  let closed = 0;
  const tree = renderSheet(t, { onClose: () => { closed++; } });
  const overlay = byClass(tree, 'tes-overlay');
  const sheet = byClass(tree, 'tes-sheet');
  overlay.props.onPointerDown({ target: sheet, currentTarget: overlay });
  overlay.props.onClick({ target: overlay, currentTarget: overlay });
  assert.equal(closed, 0, 'a gesture starting inside the sheet must not become a backdrop close');
  overlay.props.onPointerDown({ target: overlay, currentTarget: overlay });
  overlay.props.onClick({ target: sheet, currentTarget: overlay });
  assert.equal(closed, 0);
  overlay.props.onClick({ target: overlay, currentTarget: overlay });
  assert.equal(closed, 1);
  byClass(tree, 'tes-close').props.onClick();
  assert.equal(closed, 1, 'one close gesture must not invoke the parent repeatedly');
});

test('the close icon works independently of pointer gestures', t => {
  let closed = 0;
  const tree = renderSheet(t, { onClose: () => { closed++; } });
  byClass(tree, 'tes-close').props.onClick();
  assert.equal(closed, 1);
});

test('grab-handle downward swipe dismisses and cancellation does not', t => {
  let closed = 0;
  const tree = renderSheet(t, { onClose: () => { closed++; } });
  const handle = byClass(tree, 'tes-grab-area');
  const currentTarget = { setPointerCapture() {} };
  handle.props.onPointerDown({ clientX: 100, clientY: 10, pointerId: 1, button: 0, currentTarget });
  handle.props.onPointerMove({ clientX: 103, clientY: 110 });
  handle.props.onPointerCancel();
  handle.props.onPointerUp({ clientX: 103, clientY: 110 });
  assert.equal(closed, 0);
  handle.props.onPointerDown({ clientX: 100, clientY: 10, pointerId: 2, button: 0, currentTarget });
  handle.props.onPointerUp({ clientX: 103, clientY: 100 });
  assert.equal(closed, 1);
});

test('content can dismiss only when a downward gesture starts at the scroll top', t => {
  let closed = 0;
  const tree = renderSheet(t, { onClose: () => { closed++; } });
  const content = byClass(tree, 'tes-content');
  const currentTarget = { scrollTop: 60 };
  const touch = (x, y) => ({ clientX: x, clientY: y });
  content.props.onTouchStart({ touches: [touch(100, 100)], currentTarget });
  currentTarget.scrollTop = 0;
  content.props.onTouchMove({ touches: [touch(100, 200)], currentTarget });
  content.props.onTouchEnd({ changedTouches: [touch(100, 200)], currentTarget });
  assert.equal(closed, 0, 'ordinary scrolling back to the top must not close the sheet');
  content.props.onTouchStart({ touches: [touch(100, 100)], currentTarget });
  content.props.onTouchMove({ touches: [touch(100, 80)], currentTarget });
  content.props.onTouchEnd({ changedTouches: [touch(100, 220)], currentTarget });
  assert.equal(closed, 0, 'a reading scroll that reverses direction must not become dismissal');
  content.props.onTouchStart({ touches: [touch(100, 100)], currentTarget });
  content.props.onTouchEnd({ changedTouches: [touch(104, 200)], currentTarget });
  assert.equal(closed, 1);
});

test('gesture helper rejects short, horizontal, multi-direction and scrolled-content movement', () => {
  const gesture = startTechnicalSheetGesture(100, 100);
  assert.equal(shouldDismissTechnicalSheet(gesture, 102, 179), false);
  assert.equal(shouldDismissTechnicalSheet(gesture, 170, 180), false);
  assert.equal(shouldDismissTechnicalSheet(gesture, 102, 180), true);
  assert.equal(shouldDismissTechnicalSheet(startTechnicalSheetGesture(100, 100, 2), 100, 200), false);
  updateTechnicalSheetGesture(gesture, 135, 120);
  assert.equal(shouldDismissTechnicalSheet(gesture, 100, 200), false, 'returning horizontally to the origin does not restore a cancelled gesture');
});

function accessFixture({ locked = false } = {}) {
  const listeners = new Map(), frames = new Map(), scrollCalls = [];
  const doc = {
    body: { style: { overflow: 'auto', position: locked ? 'fixed' : '', top: locked ? '-40px' : '2px', left: '3px', right: '4px', width: '99%' } },
    documentElement: { style: { overflow: 'visible', overscrollBehavior: 'contain', scrollBehavior: 'smooth' } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    querySelectorAll() { return dialogs; },
  };
  const makeTarget = name => ({ name, isConnected: true, focusCalls: [], getClientRects: () => [1],
    focus(options) { this.focusCalls.push(options); doc.activeElement = this; }, blur() { doc.activeElement = null; } });
  const trigger = makeTarget('trigger'), first = makeTarget('first'), last = makeTarget('last');
  const dialog = { ...makeTarget('dialog'), querySelectorAll: () => [first, last], contains: node => [first, last, dialog].includes(node) };
  const dialogs = [dialog];
  doc.activeElement = trigger;
  const win = { scrollX: 7, scrollY: 631,
    requestAnimationFrame(callback) { frames.set(1, callback); return 1; }, cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo(x, y) { assert.equal(doc.documentElement.style.scrollBehavior, 'auto'); scrollCalls.push([x, y]); } };
  return { doc, win, dialog, dialogs, first, last, trigger, listeners, frames, scrollCalls };
}

test('access traps focus, handles Escape, and restores exact body styles and scroll position', () => {
  const f = accessFixture();
  const bodyBefore = { ...f.doc.body.style }, htmlBefore = { ...f.doc.documentElement.style };
  let closed = 0;
  const cleanup = attachTechnicalExplanationAccess(f.dialog, () => { closed++; }, f.doc, f.win);
  assert.equal(f.doc.body.style.top, '-631px');
  assert.equal(f.doc.body.style.position, 'fixed');
  f.frames.get(1)();
  assert.equal(f.doc.activeElement, f.first);
  assert.deepEqual(f.first.focusCalls, [{ preventScroll: true }]);
  let prevented = 0, stopped = 0;
  const key = (key, shiftKey = false) => f.listeners.get('keydown')({ key, shiftKey, preventDefault: () => { prevented++; }, stopPropagation: () => { stopped++; } });
  f.doc.activeElement = f.last; key('Tab'); assert.equal(f.doc.activeElement, f.first);
  key('Tab', true); assert.equal(f.doc.activeElement, f.last);
  f.doc.activeElement = f.trigger; key('Tab'); assert.equal(f.doc.activeElement, f.first);
  key('Escape'); assert.equal(closed, 1); assert.equal(stopped, 1); assert.equal(prevented, 4);
  cleanup();
  assert.deepEqual(f.doc.body.style, bodyBefore);
  assert.deepEqual(f.doc.documentElement.style, htmlBefore);
  assert.deepEqual(f.scrollCalls, [[7, 631]]);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.doc.activeElement, f.trigger);
  assert.deepEqual(f.trigger.focusCalls, [{ preventScroll: true }]);
});

test('an existing body lock is never overwritten and only the topmost dialog responds', () => {
  const f = accessFixture({ locked: true });
  const bodyBefore = { ...f.doc.body.style }, htmlBefore = { ...f.doc.documentElement.style };
  let closed = 0;
  const cleanup = attachTechnicalExplanationAccess(f.dialog, () => { closed++; }, f.doc, f.win);
  f.dialogs.push({});
  f.listeners.get('keydown')({ key: 'Escape', preventDefault: assert.fail, stopPropagation: assert.fail });
  assert.equal(closed, 0);
  cleanup();
  assert.deepEqual(f.doc.body.style, bodyBefore);
  assert.deepEqual(f.doc.documentElement.style, htmlBefore);
  assert.deepEqual(f.scrollCalls, []);
});

test('sheet height is capped, content scrolls internally and safe-area padding stays local', () => {
  assert.match(css, /\.tes-sheet\s*\{[^}]*max-height:\s*72dvh/);
  assert.match(css, /\.tes-sheet\s*\{[^}]*border-radius:\s*24px 24px 0 0/);
  assert.match(css, /\.tes-sheet\s*\{[^}]*background:\s*#101112/);
  assert.match(css, /\.tes-content\s*\{[^}]*overflow-y:\s*auto[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.tes-overlay\s*\{[^}]*env\(safe-area-inset-top\)/);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:body|html|#root)\b|letter-spacing:\s*-/);
  assert.doesNotMatch(source, /touch(?:Start|Move|End):?[^\n]*preventDefault/);
});
