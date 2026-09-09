import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const source = readFileSync(new URL('../src/components/YearlyActualModal.jsx', import.meta.url), 'utf8');
const wrapperSource = readFileSync(new URL('../src/components/ReviewGoalModal.jsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/components/ActionModalCard.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/ReviewGoalModal.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/tabs/ReviewTab.jsx', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../src/AuthGate.jsx', import.meta.url), 'utf8');

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
const transformed = await transformWithOxc(source, 'YearlyActualModal.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolvePackages(transformed.code)
  .replace(/from (["'])\.\/ReviewGoalModal\.jsx\1/g, `from ${JSON.stringify(wrapperUrl)}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const { default: YearlyActualModal } = await import(moduleUrl(compiled));

// Capture field updates without replacing the component's numeric logic. The
// normal SSR tests below still render the real React hooks and real modal shell.
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
const { default: StatefulYearlyActualModal } = await import(moduleUrl(stateCompiled));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
const inputs = tree => nodes(tree, node => node.type === 'input');
const baseProps = { year: 2026, initial: { actualGain: 70000, endBalance: 2470000 }, language: 'zh', currency: 'USD', rate: 1, onSave() {}, onCancel() {} };
function renderEditor(overrides = {}, Component = YearlyActualModal) {
  const props = { ...baseProps, ...overrides };
  let tree;
  function CaptureEditor() {
    if (Component === StatefulYearlyActualModal) beginRender();
    tree = Component(props);
    return tree;
  }
  const originalError = console.error;
  console.error = (...args) => {
    // The unchanged browser-only shared shell has a layout effect. SSR cannot
    // run it; ignore only React's expected warning, never other render errors.
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
function statefulEditor(overrides = {}) {
  resetState();
  let rendered = renderEditor(overrides, StatefulYearlyActualModal);
  return {
    get tree() { return rendered.tree; },
    type(index, value) {
      inputs(rendered.tree)[index].props.onChange({ target: { value } });
      rendered = renderEditor(overrides, StatefulYearlyActualModal);
    },
    save() { rendered.tree.props.actions.find(action => action.key === 'save').onClick(); },
  };
}

test('annual data editor uses the real scoped modal and preserves localized title, controls and hints', () => {
  for (const language of ['zh', 'en']) {
    for (const currency of ['USD', 'CNY']) {
      const rate = currency === 'CNY' ? 7.2 : 1;
      const symbol = currency === 'CNY' ? '¥' : '$';
      const { tree, html } = renderEditor({ language, currency, rate });
      assert.equal(tree.type, ReviewGoalModal);
      assert.equal(tree.props.title, t(language, 'review.actualDataTitle', undefined, { year: 2026 }));
      assert.equal(tree.props.closeLabel, t(language, 'review.closeActualData', '关闭年度实际编辑'));
      assert.match(html, /role="dialog"/);
      assert.ok(html.includes('review-goal-modal'));
      const text = textContent(tree);
      for (const key of ['review.actualGrowth', 'review.yearEndBalance']) assert.ok(text.includes(t(language, key, undefined, { symbol })));
      for (const key of ['review.actualGrowthHint', 'review.yearEndHint']) assert.ok(text.includes(t(language, key)));
      assert.ok(text.includes(t(language, 'review.currentCurrency', undefined, { currency })));
      assert.equal(text.includes(t(language, 'review.currencySaveNote', undefined, { rate })), currency === 'CNY');
      assert.deepEqual(tree.props.actions.map(action => action.key), ['save']);
      assert.deepEqual(tree.props.actions.map(action => action.label), [t(language, 'review.save')]);
      assert.ok(html.includes('mt-4 grid shrink-0 gap-2.5 grid-cols-1'), 'the remaining save action should occupy one full column');
      assert.equal(tree.props.actions.find(action => action.key === 'save').className, 'rgm-primary');
      assert.doesNotMatch(html, /autofocus/i);
    }
  }
});

test('both fields are natively labelled and their explanatory text is linked for assistive technology', () => {
  const { tree } = renderEditor();
  const labels = nodes(tree, node => node.type === 'label');
  assert.equal(labels.length, 2);
  assert.equal(inputs(tree).length, 2);
  const hintIds = [];
  for (const label of labels) {
    const field = inputs(label);
    assert.equal(field.length, 1);
    assert.equal(field[0].props.type, 'number');
    assert.equal(field[0].props.style.colorScheme, 'dark');
    const hintId = field[0].props['aria-describedby'];
    assert.ok(hintId);
    assert.equal(nodes(label, node => node.props.id === hintId).length, 1);
    assert.ok(textContent(label));
    hintIds.push(hintId);
  }
  assert.equal(new Set(hintIds).size, 2);
});

test('USD and CNY initialization retain the existing rounded display policy including zero, negative and missing values', () => {
  for (const currency of ['USD', 'CNY']) {
    const rate = currency === 'CNY' ? 7.2 : 1;
    for (const initial of [
      { actualGain: 70000, endBalance: 2470000 },
      { actualGain: 0, endBalance: 0 },
      { actualGain: -1250.75, endBalance: -240.25 },
      { actualGain: 1.5, endBalance: 1000.49 },
      { actualGain: null, endBalance: undefined },
      {},
    ]) {
      const { tree } = renderEditor({ currency, rate, initial });
      const expected = [initial.actualGain, initial.endBalance].map(value => value == null ? '' : String(Math.round(value * rate)));
      assert.deepEqual(inputs(tree).map(field => field.props.value), expected);
    }
  }
});

test('untouched saves preserve the existing initialization rounding and USD storage conversion', () => {
  for (const [currency, rate] of [['USD', 1], ['CNY', 7.2]]) {
    const saved = [];
    const initial = { actualGain: -1250.75, endBalance: 24000.49 };
    const { tree } = renderEditor({ currency, rate, initial, onSave: (...args) => saved.push(args) });
    assert.deepEqual(saved, []);
    tree.props.actions.find(action => action.key === 'save').onClick();
    assert.deepEqual(saved, [[Math.round(initial.actualGain * rate) / rate, Math.round(initial.endBalance * rate) / rate]]);
  }
});

test('typed decimal, zero, negative and blank fields save independently without treating missing as zero', () => {
  for (const [currency, rate] of [['USD', 1], ['CNY', 7.2]]) {
    for (const values of [['12345.67', '987654.32'], ['0', '0'], ['-123.45', '-999.99'], ['', '12000.5'], ['45.6', ''], ['', '']]) {
      const saved = [];
      const cancelled = [];
      const editor = statefulEditor({ currency, rate, onSave: (...args) => saved.push(args), onCancel: () => cancelled.push(true) });
      editor.type(0, values[0]);
      editor.type(1, values[1]);
      assert.deepEqual(inputs(editor.tree).map(field => field.props.value), values);
      assert.deepEqual(saved, [], 'typing must not save');
      assert.deepEqual(cancelled, [], 'typing must not close');
      editor.save();
      assert.deepEqual(saved, [values.map(value => value === '' ? null : parseFloat(value) / rate)]);
      assert.deepEqual(cancelled, [], 'saving delegates closure to the parent');
    }
  }
});

test('save divisor continues to depend on CNY selection rather than applying an unrelated rate to USD', () => {
  const saved = [];
  const editor = statefulEditor({ currency: 'USD', rate: 7.2, onSave: (...args) => saved.push(args) });
  editor.type(0, '15.25');
  editor.type(1, '135.75');
  editor.save();
  assert.deepEqual(saved, [[15.25, 135.75]]);
});

test('top-right close, typing and save do not cross-trigger or mutate the supplied annual record', () => {
  const initial = Object.freeze({ year: 2026, actualGain: 12.25, endBalance: 300.75 });
  const calls = [];
  const editor = statefulEditor({ initial, onSave: (...args) => calls.push(['save', ...args]), onCancel: () => calls.push(['cancel']) });
  editor.type(0, '-9.5');
  editor.type(1, '');
  assert.deepEqual(calls, []);
  assert.equal(editor.tree.props.actions.find(action => action.key === 'cancel'), undefined, 'there is no duplicate footer cancel');
  editor.tree.props.onClose();
  assert.deepEqual(calls, [['cancel']], 'closing must not save annual data');
  editor.save();
  assert.deepEqual(calls, [['cancel'], ['save', -9.5, null]]);
  assert.deepEqual(initial, { year: 2026, actualGain: 12.25, endBalance: 300.75 });
});

test('production and development share one real annual editor while persistence remains in the Review parent', () => {
  for (const host of [appSource, previewSource]) {
    assert.ok(host.includes("import YearlyActualModal from './components/YearlyActualModal.jsx'"));
    assert.match(host, /\n\s+YearlyActualModal,/);
    assert.doesNotMatch(host, /function YearlyActualModal\b|YearlyActualModal:\s*\(/);
  }
  const annual = reviewSource.slice(reviewSource.indexOf('{editYearlyActualId && (() => {'));
  for (const unchanged of [
    'const existing = yearlyActuals.find((item) => item.year === year)',
    'initial={existing || { actualGain: null, endBalance: null }}',
    'rate={isCNY ? rate : 1}',
    'await db.upsertYearlyActual(year, actualGain, endBalance)',
    'next[idx] = { ...next[idx], actualGain, endBalance }',
    'setYearlyActuals([...yearlyActuals, { year, actualGain, endBalance }])',
    'setEditYearlyActualId(null)',
  ]) assert.ok(annual.includes(unchanged), `preserve existing parent behavior: ${unchanged}`);
  const imports = [...source.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.deepEqual(imports.sort(), ['react', './ReviewGoalModal.jsx', '../lib/i18n.js'].sort());
  assert.doesNotMatch(source, /\bdb\.|supabase|fetch\(|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves/);
  assert.doesNotMatch(source, /\b(?:window|document)\s*\.|\b(?:useEffect|useLayoutEffect|addEventListener|removeEventListener|requestAnimationFrame)\b/);
});

test('annual edit preview opens only a local fixture and editor-specific styling stays scoped', () => {
  assert.match(previewSource, /React\.useState\(reviewPanel === 'year-edit' \? yearlyActuals\[0\]\?\.year[^;]+\)/);
  assert.doesNotMatch(appSource + authSource, /reviewPanel|year-edit/);
  assert.ok(authSource.includes('import.meta.env.DEV && (!isSupabaseConfigured || isDevVisualPreviewRequested())'));
  assert.ok(css.includes('.review-goal-modal .rgm-year-editor'));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selectors: match[1], declarations: match[2] }));
  for (const rule of rules.filter(rule => /rgm-year-editor|rgm-input-hint|rgm-currency-note/.test(rule.selectors))) {
    assert.ok(rule.selectors.split(',').every(selector => selector.trim().startsWith('.review-goal-modal ')));
    assert.doesNotMatch(rule.declarations, /position:\s*fixed|z-index\s*:|100dvh|100vh|safe-area-inset|backdrop-filter/);
  }
});
