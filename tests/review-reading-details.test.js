import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../src/components/ReviewReadingDetails.jsx');
const css = read('../src/components/ReviewReadingDetails.css');
const shellSource = read('../src/components/ActionModalCard.jsx');
const wrapperSource = read('../src/components/ReviewGoalModal.jsx');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolvePackages = code => code.replace(/from (["'])(react|lucide-react)\1/g,
  (_, _quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
async function compile(code, filename, replacements = {}) {
  const transformed = await transformWithOxc(code, filename, { jsx: { runtime: 'classic' } });
  let compiled = resolvePackages(transformed.code).replace(/import\s*(['"])\.\/[^'"]+\.css\1;?/g, '');
  for (const [path, url] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`from "${path}"`, `from ${JSON.stringify(url)}`)
      .replaceAll(`from '${path}'`, `from ${JSON.stringify(url)}`);
  }
  return moduleUrl(compiled);
}
const shellUrl = await compile(shellSource, 'ActionModalCard.jsx');
const { default: ActionModalCard } = await import(shellUrl);
const wrapperUrl = await compile(wrapperSource, 'ReviewGoalModal.jsx', { './ActionModalCard.jsx': shellUrl });
const { default: ReviewGoalModal } = await import(wrapperUrl);
const detailsUrl = await compile(source, 'ReviewReadingDetails.jsx', {
  './ReviewGoalModal.jsx': wrapperUrl,
  '../lib/i18n.js': new URL('../src/lib/i18n.js', import.meta.url).href,
});
const { DisciplineDetailModal, ReviewLogDetailModal } = await import(detailsUrl);

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
const byClass = (node, className) => nodes(node, item => (item.props.className || '').split(' ').includes(className));
function renderDetails(Component, props = {}, renderShell = false) {
  const detail = Component(props);
  const wrapper = ReviewGoalModal(detail.props);
  let tree;
  function CaptureShell() {
    tree = ActionModalCard(wrapper.props);
    return tree;
  }
  const html = renderToStaticMarkup(renderShell ? React.createElement(CaptureShell) : detail.props.children);
  return { detail, wrapper, tree, html };
}
const variants = [
  { Component: DisciplineDetailModal, property: 'discipline' },
  { Component: ReviewLogDetailModal, property: 'log' },
];

test('both detail readers preserve full multiline text, blank lines, spaces, punctuation and long CJK text', () => {
  const text = `  原则：  保留每一个空格\n\n\n${'不要因为市场波动而丢失长期计划。'.repeat(24)}\r\nNVDA:    keep the exact text\n<script>alert("not executable")</script>\n\n`;
  assert.ok(text.length > 150);
  for (const { Component, property } of variants) {
    const { detail, html } = renderDetails(Component, { [property]: { text } });
    const body = byClass(detail, 'rgm-reading-text');
    assert.equal(body.length, 1);
    assert.equal(body[0].props.children, text);
    assert.equal(textContent(body[0]), text);
    assert.match(html, /&lt;script&gt;/, 'user text must be rendered as text, not HTML');
    assert.doesNotMatch(html, /<script>|line-clamp|text-ellipsis|overflow-y-auto/);
  }
});

test('detail readers handle missing, empty and zero text without inventing text or a date', () => {
  for (const { Component, property } of variants) {
    for (const item of [undefined, null, {}, { text: null }, { text: '' }, { text: 0 }]) {
      const { detail } = renderDetails(Component, { [property]: item });
      assert.equal(byClass(detail, 'rgm-reading-text')[0].props.children, item?.text === 0 ? '0' : '');
      assert.equal(byClass(detail, 'rgm-reading-meta').length, 0);
    }
  }
});

test('notes use neutral localized date, level and optional pinned metadata', () => {
  const levels = [
    { symbol: '🟢', zh: '一般', en: 'General' },
    { symbol: '🔺', zh: '重要', en: 'Important' },
    { symbol: '📣', zh: '强调', en: 'Emphasis' },
    { symbol: '❗', zh: '警告', en: 'Warning' },
  ];
  for (const language of ['zh', 'en']) {
    for (const [index, level] of levels.entries()) {
      const { detail } = renderDetails(DisciplineDetailModal, {
        language, discipline: { date: '2026-09-09', text: '完整心得', level: level.symbol, pinned: true },
      });
      assert.equal(detail.props.title, t(language, 'review.disciplineDetails', '心得详情'));
      assert.equal(detail.props.closeLabel, t(language, 'review.closeRecordDetails', '关闭记录详情'));
      const meta = textContent(byClass(detail, 'rgm-reading-meta')[0]);
      assert.ok(meta.includes('2026-09-09'));
      assert.ok(meta.includes(t(language, `review.disciplineLevel${index}`)));
      assert.ok(meta.includes(level[language]), `preserve ${level.symbol} as ${level[language]}`);
      assert.ok(meta.includes(t(language, 'review.pinned')));
      assert.ok(!meta.includes(level.symbol), 'level icons should not introduce colored symbols');
    }
    const unpinned = renderDetails(DisciplineDetailModal, { language, discipline: { text: '内容', pinned: false } }).detail;
    assert.equal(byClass(unpinned, 'rgm-reading-meta').length, 0);
    assert.equal(unpinned.props.actions[1].label, t(language, 'review.pin'));
  }
});

test('review metadata displays the recorded date and optional mood without empty chips', () => {
  for (const language of ['zh', 'en']) {
    for (const mood of ['冷静', 'Calm', null, undefined, '']) {
      const { detail } = renderDetails(ReviewLogDetailModal, {
        language, log: { text: 'Review text', date: '2026-08-18', mood },
      });
      assert.equal(detail.props.title, t(language, 'review.reviewDetails'));
      assert.equal(detail.props.closeLabel, t(language, 'review.closeReviewDetails'));
      const meta = byClass(detail, 'rgm-reading-meta')[0];
      assert.equal(nodes(meta, node => node.type === 'span').length, mood ? 2 : 1);
      assert.equal(textContent(meta), `2026-08-18${mood || ''}`);
    }
  }
});

test('detail dialogs delegate unchanged callback identities with delete first and edit last', () => {
  for (const { Component, property } of variants) {
    for (const language of ['zh', 'en']) {
      const calls = [];
      const props = {
        language, [property]: { text: '内容', pinned: true },
        onClose: () => calls.push('close'), onEdit: () => calls.push('edit'),
        onDelete: () => calls.push('delete'), onTogglePin: () => calls.push('pin'),
      };
      const { detail, wrapper, tree } = renderDetails(Component, props, true);
      assert.equal(detail.type, ReviewGoalModal);
      assert.equal(detail.props.onClose, props.onClose);
      assert.equal(wrapper.props.widthClassName, 'w-[calc(100vw-32px)] max-w-[398px]');
      assert.equal(wrapper.props.panelClassName, 'review-goal-modal');
      assert.deepEqual(calls, []);
      const actions = detail.props.actions;
      assert.deepEqual(actions.map(action => action.key), property === 'discipline' ? ['delete', 'pin', 'edit'] : ['delete', 'edit']);
      assert.equal(actions[0].onClick, props.onDelete);
      assert.equal(actions[0].className, 'rgm-danger');
      assert.equal(actions.at(-1).onClick, props.onEdit);
      assert.equal(actions.at(-1).className, 'rgm-primary');
      if (property === 'discipline') {
        assert.equal(actions[1].onClick, props.onTogglePin);
        assert.equal(actions[1].label, t(language, 'review.unpin'));
      }
      const dialogs = nodes(tree, node => node.props.role === 'dialog');
      assert.equal(dialogs.length, 1);
      assert.equal(dialogs[0].props['aria-modal'], 'true');
      assert.equal(dialogs[0].props['aria-label'], detail.props.title);
      const buttons = nodes(tree, node => node.type === 'button');
      assert.equal(buttons.length, actions.length + 1);
      for (const button of buttons) {
        assert.equal(button.props.type, 'button');
        assert.equal(nodes(button, node => node.type === 'button').length, 1);
        button.props.onClick();
      }
      assert.deepEqual(calls, ['close', ...actions.map(action => action.key)]);
    }
  }
});

test('frozen parent records and callbacks remain untouched while rendering', () => {
  for (const { Component, property } of variants) {
    const item = Object.freeze({ id: 'record-1', text: '完整内容\n\n第二段', date: '2026-09-09', level: '❗', mood: null, pinned: false });
    const props = Object.freeze({ [property]: item, language: 'zh', onClose() {}, onEdit() {}, onDelete() {}, onTogglePin() {} });
    const before = JSON.stringify(props);
    renderDetails(Component, props);
    assert.equal(JSON.stringify(props), before);
    assert.equal(props[property], item);
  }
});

test('reading details remain presentation-only and use the shared modal lifecycle', () => {
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', '../lib/i18n.js', './ReviewGoalModal.jsx', './ReviewReadingDetails.css'].includes(module)));
  assert.doesNotMatch(source, /\b(?:window|document|db)\s*\.|supabase|localStorage|sessionStorage|fetch\(|useEffect|useLayoutEffect|useState|useReducer|addEventListener|requestAnimationFrame/);
  assert.doesNotMatch(source, /UsFlag|gold|#f6b54b|maxLength|substring\(|\.slice\(|\.trim\(|dangerouslySetInnerHTML|line-clamp|overflow-y|100dvh|safe-area/);
});

test('all reading styles are scoped, preserve whitespace, wrap long words and avoid independent scrolling', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), declarations: match[2] }));
  assert.ok(rules.every(rule => /^\.review-goal-modal \.rgm-reading-/.test(rule.selector)));
  const body = rules.find(rule => rule.selector === '.review-goal-modal .rgm-reading-text');
  assert.match(body.declarations, /white-space:\s*pre-wrap;/);
  assert.match(body.declarations, /overflow-wrap:\s*anywhere;/);
  assert.match(body.declarations, /font-size:\s*14px;/);
  assert.match(body.declarations, /line-height:\s*1\.8;/);
  assert.doesNotMatch(css, /overflow(?:-y)?:\s*(?:hidden|auto|scroll)|max-height|text-overflow|line-clamp|background|border:|position:|z-index|100vh|100dvh/);
});
