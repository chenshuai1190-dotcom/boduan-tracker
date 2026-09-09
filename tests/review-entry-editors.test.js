import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../src/components/ReviewEntryEditors.jsx');
const css = read('../src/components/ReviewEntryEditors.css');
const wrapperSource = read('../src/components/ReviewGoalModal.jsx');
const shellSource = read('../src/components/ActionModalCard.jsx');
const appSource = read('../src/App.jsx');
const previewSource = read('../src/DevVisualPreview.jsx');
const reviewSource = read('../src/tabs/ReviewTab.jsx');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolvePackages = code => code.replace(/from (["'])(react|lucide-react)\1/g,
  (_, _quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
const shellTransformed = await transformWithOxc(shellSource, 'ActionModalCard.jsx', { jsx: { runtime: 'classic' } });
const shellUrl = moduleUrl(resolvePackages(shellTransformed.code));
const wrapperTransformed = await transformWithOxc(wrapperSource, 'ReviewGoalModal.jsx', { jsx: { runtime: 'classic' } });
const wrapperUrl = moduleUrl(resolvePackages(wrapperTransformed.code)
  .replace(/import\s*(['"])\.\/ReviewGoalModal\.css\1;?/g, '')
  .replace(/from (["'])\.\/ActionModalCard\.jsx\1/g, `from ${JSON.stringify(shellUrl)}`));
const { default: ReviewGoalModal } = await import(wrapperUrl);
const transformed = await transformWithOxc(source, 'ReviewEntryEditors.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolvePackages(transformed.code)
  .replace(/import\s*(['"])\.\/ReviewEntryEditors\.css\1;?/g, '')
  .replace(/from (["'])\.\/ReviewGoalModal\.jsx\1/g, `from ${JSON.stringify(wrapperUrl)}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const editors = await import(moduleUrl(compiled));

// Exercise the actual change/save closures while keeping the real modal shell
// in SSR. This harness supplies component state, not replacement form logic.
const stateReactUrl = moduleUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export * from ${JSON.stringify(import.meta.resolve('react'))};
  let values = []; let cursor = 0;
  export function resetState() { values = []; cursor = 0; }
  export function beginRender() { cursor = 0; }
  export function useState(initial) {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
    return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
  }
  export default { ...React, useState };
`);
const { resetState, beginRender } = await import(stateReactUrl);
const stateCompiled = compiled.replace(`from ${JSON.stringify(import.meta.resolve('react'))}`, `from ${JSON.stringify(stateReactUrl)}`);
const statefulEditors = await import(moduleUrl(stateCompiled));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
const fields = tree => nodes(tree, node => node.type === 'input' || node.type === 'textarea');
const field = (tree, type) => fields(tree).find(node => type === 'textarea' ? node.type === type : node.type === 'input' && node.props.type === type);
const buttons = tree => nodes(tree, node => node.type === 'button');
const namedButton = (tree, label) => buttons(tree).find(node => textContent(node) === label);
const action = (tree, key) => tree.props.actions.find(item => item.key === key);
const names = ['DisciplineModal', 'LogModal'];
const defaultInitial = name => name === 'DisciplineModal'
  ? { level: '🟢', text: '原始心得', pinned: false }
  : { date: '2026-09-09', mood: '冷静', text: '原始复盘' };

function renderEditor(name, overrides = {}, stateful = false) {
  const props = { initial: defaultInitial(name), language: 'zh', onSave() {}, onCancel() {}, ...overrides };
  const Component = (stateful ? statefulEditors : editors)[name];
  let tree;
  function CaptureEditor() {
    if (stateful) beginRender();
    tree = Component(props);
    return tree;
  }
  const originalError = console.error;
  console.error = (...args) => {
    // The shared browser shell has an unchanged layout effect that SSR cannot run.
    if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return;
    originalError(...args);
  };
  try {
    const html = renderToStaticMarkup(React.createElement(CaptureEditor));
    return { tree, html, props };
  } finally {
    console.error = originalError;
  }
}
function statefulEditor(name, overrides = {}) {
  resetState();
  let rendered = renderEditor(name, overrides, true);
  const refresh = () => { rendered = renderEditor(name, overrides, true); };
  return {
    get tree() { return rendered.tree; },
    get html() { return rendered.html; },
    type(type, value) { field(rendered.tree, type).props.onChange({ target: { value } }); refresh(); },
    pin(checked) { field(rendered.tree, 'checkbox').props.onChange({ target: { checked } }); refresh(); },
    click(label) { namedButton(rendered.tree, label).props.onClick(); refresh(); },
    save() { action(rendered.tree, 'save').onClick(); refresh(); },
  };
}

test('both editors share the real scoped shell and localized add/edit titles with deletion only when provided', () => {
  for (const language of ['zh', 'en']) {
    for (const name of names) {
      for (const [isEdit, withDelete] of [[false, false], [true, false], [false, true], [true, true]]) {
        const onDelete = withDelete ? () => {} : undefined;
        const { tree, html } = renderEditor(name, { language, initial: { ...defaultInitial(name), isEdit }, onDelete });
        const editing = name === 'DisciplineModal' ? isEdit || withDelete : withDelete;
        const titleKey = name === 'DisciplineModal'
          ? (editing ? 'review.editDiscipline' : 'review.addDiscipline')
          : (editing ? 'review.editReview' : 'review.addReview');
        assert.equal(tree.type, ReviewGoalModal);
        assert.equal(tree.props.title, t(language, titleKey));
        assert.equal(tree.props.closeLabel, name === 'DisciplineModal'
          ? t(language, 'review.closeDisciplineEditor', '关闭心得编辑')
          : t(language, 'review.closeReviewEditor', '关闭复盘编辑'));
        assert.match(html, /role="dialog"/);
        assert.ok(html.includes('review-goal-modal'));
        assert.deepEqual(tree.props.actions.map(item => item.key), withDelete ? ['delete', 'save'] : ['save']);
        assert.equal(action(tree, 'cancel'), undefined, 'the top-right close replaces the redundant footer cancel');
        assert.ok(html.includes(`mt-4 grid shrink-0 gap-2.5 grid-cols-${withDelete ? 2 : 1}`), 'the action row must fill the exact number of remaining columns');
        for (const item of tree.props.actions) assert.equal(item.label, t(language, `review.${item.key}`));
        assert.equal(action(tree, 'save').className, 'rgm-primary');
        if (withDelete) assert.equal(action(tree, 'delete').className, 'rgm-danger');
        assert.doesNotMatch(html, /autofocus/i);
      }
    }
  }
});

test('text, date, custom mood and pin controls are natively labelled and selection buttons expose pressed state', () => {
  for (const language of ['zh', 'en']) {
    for (const name of names) {
      const { tree } = renderEditor(name, { language });
      const labels = nodes(tree, node => node.type === 'label');
      for (const input of fields(tree)) {
        // Children.toArray creates keyed element copies; their field props stay
        // shared, so compare props rather than the traversal's wrapper identity.
        const enclosingLabel = labels.find(label => fields(label).some(child => child.type === input.type && child.props === input.props));
        assert.ok(enclosingLabel || input.props['aria-label'], 'every control has an accessible name');
        assert.ok(input.props['aria-label'] || textContent(enclosingLabel));
        assert.equal(input.props.maxLength, undefined);
      }
      assert.equal(field(tree, 'textarea').props['aria-invalid'], false);
      assert.equal(field(tree, 'textarea').props.style.colorScheme, 'dark');
      const expectedCount = name === 'DisciplineModal' ? 4 : 6;
      assert.equal(buttons(tree).length, expectedCount);
      for (const button of buttons(tree)) {
        assert.equal(button.props.type, 'button');
        assert.equal(typeof button.props['aria-pressed'], 'boolean');
      }
      assert.equal(nodes(tree, node => node.type === 'fieldset').length, 1);
      assert.ok(textContent(nodes(tree, node => node.type === 'legend')[0]));
    }
  }
});

test('initial values preserve content and record dates while empty additions use original defaults', () => {
  const before = new Date().toISOString().slice(0, 10);
  const discipline = renderEditor('DisciplineModal', { initial: {} });
  const log = renderEditor('LogModal', { initial: {} });
  const after = new Date().toISOString().slice(0, 10);
  assert.equal(field(discipline.tree, 'textarea').props.value, '');
  assert.equal(field(discipline.tree, 'checkbox').props.checked, false);
  assert.equal(namedButton(discipline.tree, t('zh', 'review.levelNormal')).props['aria-pressed'], true);
  assert.equal(field(log.tree, 'textarea').props.value, '');
  assert.equal(field(log.tree, 'text').props.value, '');
  assert.ok([before, after].includes(field(log.tree, 'date').props.value));
  assert.equal(buttons(log.tree).some(button => button.props['aria-pressed']), false);
  const existing = { date: '2011-02-03', mood: '自定义心情', text: '  内容\n保留原样  ' };
  const preserved = renderEditor('LogModal', { initial: existing });
  assert.deepEqual(['date', 'text', 'textarea'].map(type => field(preserved.tree, type).props.value), [existing.date, existing.mood, existing.text]);
});

test('empty or whitespace-only content blocks save in both languages and typing clears the accessible error', () => {
  for (const language of ['zh', 'en']) {
    for (const name of names) {
      for (const emptyText of ['', ' \n\t\r ', '\u3000\u00a0']) {
        const calls = [];
        const editor = statefulEditor(name, { language, onSave: value => calls.push(value) });
        editor.type('textarea', emptyText);
        editor.save();
        assert.deepEqual(calls, []);
        const error = nodes(editor.tree, node => node.props.role === 'alert');
        assert.equal(error.length, 1);
        assert.equal(textContent(error[0]), t(language, 'review.contentRequired'));
        assert.equal(field(editor.tree, 'textarea').props['aria-invalid'], true);
        editor.type('textarea', '  修订内容  ');
        assert.equal(nodes(editor.tree, node => node.props.role === 'alert').length, 0);
        assert.equal(field(editor.tree, 'textarea').props['aria-invalid'], false);
        assert.deepEqual(calls, [], 'typing must not submit');
        editor.save();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].text, '修订内容');
      }
    }
  }
});

test('long multiline bodies are not truncated and saves only trim outer whitespace', () => {
  const content = `首段：长期记录。\n\n${'完整内容 & <标签> 中文与 emoji 🧭。\n'.repeat(400)}末段：保留全文。`;
  for (const name of names) {
    const saved = [];
    const editor = statefulEditor(name, { onSave: value => saved.push(value) });
    editor.type('textarea', ` \n${content}\n\t `);
    assert.equal(field(editor.tree, 'textarea').props.value, ` \n${content}\n\t `);
    assert.ok(editor.html.includes('末段：保留全文。'));
    assert.ok(editor.html.includes('&lt;标签&gt;'), 'React escapes content without dropping it');
    editor.save();
    assert.equal(saved[0].text, content);
    assert.ok(saved[0].text.length > 10000);
  }
  assert.doesNotMatch(source, /maxLength|dangerouslySetInnerHTML/);
});

test('discipline level labels keep the exact persisted enums and pin state remains independent', () => {
  const levels = [['🟢', 'review.levelNormal'], ['🔺', 'review.levelImportant'], ['📣', 'review.levelEmphasis'], ['❗', 'review.levelWarning']];
  for (const language of ['zh', 'en']) {
    const saved = [];
    const editor = statefulEditor('DisciplineModal', { language, onSave: value => saved.push(value) });
    editor.type('textarea', '  保持投资纪律  ');
    for (const [index, [level, key]] of levels.entries()) {
      editor.click(t(language, key));
      editor.pin(index % 2 === 0);
      assert.equal(buttons(editor.tree).filter(button => button.props['aria-pressed']).length, 1);
      assert.equal(namedButton(editor.tree, t(language, key)).props['aria-pressed'], true);
      assert.equal(saved.length, index, 'selection must not submit');
      editor.save();
      assert.deepEqual(saved[index], { level, text: '保持投资纪律', pinned: index % 2 === 0 });
    }
  }
});

test('all mood presets preserve translations, toggle off when reselected and allow a custom trimmed mood', () => {
  const keys = ['review.moodCautiousOptimism', 'review.moodSatisfied', 'review.moodAnxious', 'review.moodGreedy', 'review.moodFearful', 'review.moodCalm'];
  for (const language of ['zh', 'en']) {
    const saved = [];
    const editor = statefulEditor('LogModal', { language, initial: { date: '2020-03-23', mood: '', text: '  回看交易  ' }, onSave: value => saved.push(value) });
    assert.deepEqual(buttons(editor.tree).map(textContent), keys.map(key => t(language, key)));
    for (const key of keys) {
      const mood = t(language, key);
      editor.click(mood);
      assert.equal(field(editor.tree, 'text').props.value, mood);
      assert.equal(buttons(editor.tree).filter(button => button.props['aria-pressed']).length, 1);
      editor.save();
      assert.deepEqual(saved.at(-1), { date: '2020-03-23', mood, text: '回看交易' });
      editor.click(mood);
      assert.equal(field(editor.tree, 'text').props.value, '');
      assert.equal(buttons(editor.tree).some(button => button.props['aria-pressed']), false);
    }
    editor.type('text', ' \t我的心情 / patient 🧭  ');
    assert.equal(buttons(editor.tree).some(button => button.props['aria-pressed']), false);
    editor.save();
    assert.deepEqual(saved.at(-1), { date: '2020-03-23', mood: '我的心情 / patient 🧭', text: '回看交易' });
    editor.type('text', '  ');
    editor.save();
    assert.equal(saved.at(-1).mood, '', 'mood stays optional');
  }
});

test('log date changes are delegated unchanged and are not overwritten when editing other fields', () => {
  const saved = [];
  const editor = statefulEditor('LogModal', { onSave: value => saved.push(value) });
  for (const date of ['2010-02-11', '2024-02-29', '']) {
    editor.type('date', date);
    editor.type('text', ' 冷静 ');
    editor.type('textarea', ' 日期与内容独立 ');
    editor.save();
    assert.deepEqual(saved.at(-1), { date, mood: '冷静', text: '日期与内容独立' });
  }
});

test('top-right close invokes cancellation independently of delete and save without a redundant footer action', () => {
  for (const name of names) {
    const initial = Object.freeze({ ...defaultInitial(name), id: 'record-fixture', isEdit: true });
    const snapshot = { ...initial };
    const calls = [];
    const editor = statefulEditor(name, {
      initial,
      onSave: value => calls.push(['save', value]),
      onCancel: () => calls.push(['cancel']),
      onDelete: () => calls.push(['delete']),
    });
    editor.type('textarea', '  修订全文  ');
    if (name === 'DisciplineModal') editor.pin(true);
    else { editor.type('date', '2000-01-01'); editor.type('text', ' 乐观 '); }
    assert.deepEqual(calls, []);
    assert.equal(action(editor.tree, 'cancel'), undefined);
    editor.tree.props.onClose();
    assert.deepEqual(calls, [['cancel']], 'closing must not save or delete');
    action(editor.tree, 'delete').onClick();
    assert.deepEqual(calls, [['cancel'], ['delete']]);
    editor.save();
    assert.equal(calls.length, 3, 'save delegates closure and persistence to the parent');
    assert.deepEqual(calls[2], ['save', name === 'DisciplineModal'
      ? { level: '🟢', text: '修订全文', pinned: true }
      : { date: '2000-01-01', mood: '乐观', text: '修订全文' }]);
    assert.deepEqual(initial, snapshot);
  }
});

test('production and development reuse both real named editors with persistence and duplicate guards staying in Review', () => {
  for (const host of [appSource, previewSource]) {
    assert.match(host, /import\s*\{\s*DisciplineModal\s*,\s*LogModal\s*\}\s*from\s*['"]\.\/components\/ReviewEntryEditors\.jsx['"]/);
    for (const name of names) {
      assert.match(host, new RegExp(`\\n\\s+${name},`));
      assert.doesNotMatch(host, new RegExp(`function ${name}\\b|${name}:\\s*\\(`));
    }
  }
  for (const preserved of [
    "initial={current ? { ...current, isEdit: true } : { level: '🟢', text: '', pinned: false }}",
    'await db.updateDiscipline(ctx.editingDisciplineId, data)',
    'await db.insertDiscipline(data)',
    'lastSubmitRef.current.discipline',
    "initial={current || { date: new Date().toISOString().slice(0, 10), mood: '', text: '' }}",
    'onDelete={isEdit ? () => deleteReviewLog(current) : null}',
    'await db.updateReviewLog(ctx.editingLogId, data)',
    'await db.insertReviewLog(data)',
    'lastSubmitRef.current.log',
    'now - last.at < 10000',
  ]) assert.ok(reviewSource.includes(preserved), `preserve parent behavior: ${preserved}`);
  const imports = [...source.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.deepEqual(imports.sort(), ['react', '../lib/i18n.js', './ReviewGoalModal.jsx'].sort());
  assert.doesNotMatch(source, /\bdb\.|supabase|fetch\(|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves/);
  assert.doesNotMatch(source, /\b(?:window|document)\s*\.|\b(?:useEffect|useLayoutEffect|addEventListener|removeEventListener|requestAnimationFrame)\b/);
});

test('editor-specific styles stay inside the neutral Review modal without changing viewport or shared navigation', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selectors: match[1], declarations: match[2] }));
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule.selectors.split(',').every(selector => selector.trim().startsWith('.review-goal-modal ')));
    assert.doesNotMatch(rule.declarations, /position:\s*fixed|z-index\s*:|100dvh|100vh|safe-area-inset|backdrop-filter/);
  }
  assert.doesNotMatch(css, /#f6b54b|box-shadow|text-shadow|linear-gradient|animation\s*:/i);
  assert.match(css, /button\[aria-pressed="true"\]/);
});
