import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/ReviewGoalModal.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/ReviewGoalModal.css', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/components/ActionModalCard.jsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/tabs/ReviewTab.jsx', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../src/AuthGate.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolvePackages = code => code.replace(/from (["'])(react|lucide-react)\1/g,
  (_, _quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
const shellTransformed = await transformWithOxc(shellSource, 'ActionModalCard.jsx', { jsx: { runtime: 'classic' } });
const shellUrl = moduleUrl(resolvePackages(shellTransformed.code));
const { default: ActionModalCard } = await import(shellUrl);
const transformed = await transformWithOxc(source, 'ReviewGoalModal.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolvePackages(transformed.code)
  .replace(/import\s*(['"])\.\/ReviewGoalModal\.css\1;?/g, '')
  .replace(/from (["'])\.\/ActionModalCard\.jsx\1/g, `from ${JSON.stringify(shellUrl)}`);
const { default: ReviewGoalModal } = await import(moduleUrl(compiled));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
function renderModal(props = {}) {
  const wrapper = ReviewGoalModal({ title: '北极星设置', closeLabel: '关闭北极星设置', ...props });
  let tree;
  function CaptureShell() {
    tree = ActionModalCard(wrapper.props);
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(CaptureShell));
  return { wrapper, tree, html };
}
const buttons = tree => nodes(tree, node => node.type === 'button');
const byClass = (tree, className) => nodes(tree, node => (node.props.className || '').split(' ').includes(className));

test('goal dialogs delegate their title, content, close and action props to the unchanged shared shell', () => {
  const actions = Object.freeze([Object.freeze({ key: 'save', label: '保存', onClick() {}, className: 'rgm-primary' })]);
  const children = React.createElement('p', null, '$14,860,167.41');
  const onClose = () => {};
  const { wrapper, tree } = renderModal({ actions, children, onClose });
  assert.equal(wrapper.type, ActionModalCard);
  assert.equal(wrapper.props.title, '北极星设置');
  assert.equal(wrapper.props.closeLabel, '关闭北极星设置');
  assert.equal(wrapper.props.actions, actions);
  assert.equal(wrapper.props.children, children);
  assert.equal(wrapper.props.onClose, onClose);
  assert.equal(wrapper.props.widthClassName, 'w-[calc(100vw-32px)] max-w-[398px]');
  assert.equal(wrapper.props.panelClassName, 'review-goal-modal');
  assert.equal(wrapper.props.overlayClassName, undefined, 'the wrapper must not replace overlay position, blur, or viewport behavior');
  assert.equal(wrapper.props.overlayStyle, undefined);
  assert.equal(wrapper.props.panelStyle, undefined);
  assert.ok(textContent(tree).includes('$14,860,167.41'));
});

test('the real rendered shell preserves accessible dialog names and separate native actions', () => {
  for (const [title, closeLabel] of [['北极星设置', '关闭北极星设置'], ['Annual Goal Actions', 'Close Record Details']]) {
    const calls = [];
    const { tree, html } = renderModal({
      title, closeLabel,
      onClose: () => calls.push('close'),
      actions: [
        { key: 'delete', label: 'Delete', onClick: () => calls.push('delete') },
        { key: 'edit', label: 'Edit', className: 'rgm-primary', onClick: () => calls.push('edit') },
      ],
    });
    const dialog = nodes(tree, node => node.props.role === 'dialog');
    assert.equal(dialog.length, 1);
    assert.equal(dialog[0].props['aria-modal'], 'true');
    assert.equal(dialog[0].props['aria-label'], title);
    const controls = buttons(tree);
    assert.equal(controls.length, 3);
    assert.deepEqual(calls, [], 'rendering must not invoke a close, edit or save action');
    for (const button of controls) {
      assert.equal(button.props.type, 'button');
      assert.equal(nodes(button, node => node.type === 'button').length, 1, 'actions must not contain nested buttons');
    }
    controls.find(button => button.props['aria-label'] === closeLabel).props.onClick();
    assert.deepEqual(calls, ['close'], 'the top-right close must not invoke edit or delete');
    controls.find(button => textContent(button) === 'Delete').props.onClick();
    controls.find(button => textContent(button) === 'Edit').props.onClick();
    assert.deepEqual(calls, ['close', 'delete', 'edit']);
    assert.equal(byClass(tree, 'rgm-primary').length, 1, 'only the designated primary action should be emphasized');
    assert.doesNotMatch(html, /autofocus/i);
  }
});

test('one, two and three remaining actions have matching columns without removing domain actions', () => {
  for (const actionNames of [['save'], ['delete', 'save'], ['edit', 'unpin', 'delete']]) {
    const calls = [];
    const actions = actionNames.map(key => ({ key, label: key === 'unpin' ? '取消置顶' : key, onClick: () => calls.push(key) }));
    const { tree, wrapper } = renderModal({ actions, onClose: () => calls.push('close') });
    assert.equal(wrapper.props.actionGridClassName, `grid-cols-${actionNames.length}`);
    assert.equal(byClass(tree, `grid-cols-${actionNames.length}`).length, 1);
    const controls = buttons(tree);
    assert.equal(controls.length, actions.length + 1, 'only the top-right close and requested domain actions should render');
    assert.equal(controls.filter(button => textContent(button) === 'Cancel' || textContent(button) === '取消').length, 0);
    assert.deepEqual(calls, []);
    for (const item of actions) controls.find(button => textContent(button) === item.label).props.onClick();
    assert.deepEqual(calls, actionNames, '取消置顶 remains an independent domain action');
  }
  assert.ok(shellSource.includes("actions.length === 1 ? 'grid-cols-1' : 'grid-cols-2'"));
  assert.ok(shellSource.includes('{actions.map((action) => ('), 'the shared shell must not globally filter confirmation Cancel buttons');
  assert.doesNotMatch(source + shellSource, /actions\.filter\([^;]*(?:cancel|取消)/);
});

test('optional actions and disabled state remain parent-controlled without mutating frozen props', () => {
  const props = Object.freeze({
    title: '年度目标操作', closeLabel: '关闭记录详情', onClose() {},
    actions: Object.freeze([
      Object.freeze({ key: 'save', label: '保存', disabled: true, onClick() {}, className: 'rgm-primary' }),
    ]),
    children: React.createElement('p', null, '待填写'),
  });
  const before = JSON.stringify(props);
  const { wrapper, tree, html } = renderModal(props);
  assert.equal(wrapper.props.actions, props.actions);
  const save = buttons(tree).find(button => textContent(button) === '保存');
  assert.equal(save.props.disabled, true);
  assert.equal(save.props.onClick, props.actions[0].onClick);
  assert.match(html, /disabled=""/);
  assert.equal(JSON.stringify(props), before);
  assert.equal(buttons(renderModal().tree).length, 1, 'no actions should be invented when the caller supplies none');
});

test('modal presentation has no data writes, calculations or independent lifecycle management', () => {
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', './ActionModalCard.jsx', './ReviewGoalModal.css'].includes(module)));
  assert.doesNotMatch(source, /\b(?:fetch|save|insert|upsert|update|delete)\s*\(|\bdb\.|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves/);
  assert.doesNotMatch(source, /\b(?:window|document)\s*\.|\b(?:addEventListener|removeEventListener|useEffect|useLayoutEffect|useState|useReducer|useContext)\b|visualViewport|requestAnimationFrame/);
  assert.doesNotMatch(source, /Intl\.|parseFloat\(|parseInt\(|Math\.pow\(|convertCurrency|exchangeRate|computeCompound/);
  assert.doesNotMatch(source, /<input|<textarea|autoFocus/, 'the wrapper must not introduce its own field or focus state');
});

test('goal modal styles stay scoped and preserve visible input and keyboard focus affordances', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1].split(',').map(selector => selector.trim()), declarations: match[2],
  }));
  assert.ok(rules.every(rule => rule.selectors.every(selector => /^\.review-goal-modal(?=[\s.:#\[>+~]|$)/.test(selector))), 'all rules, including narrow screens, must stay inside the goal modal');
  const focusRule = rules.find(rule => rule.selectors.includes('.review-goal-modal button:focus-visible'));
  assert.match(focusRule?.declarations || '', /outline:\s*(?!none\b|0(?:px)?\s)[^;]+;/);
  const fieldRules = rules.filter(rule => rule.selectors.includes('.review-goal-modal .rgm-field input'));
  assert.ok(fieldRules.some(rule => /font-size:\s*16px;/.test(rule.declarations)), 'mobile fields should use readable non-zooming native text size');
  assert.ok(fieldRules.some(rule => /max-width:\s*100%;/.test(rule.declarations) && /min-width:\s*0;/.test(rule.declarations)), 'fields must shrink within narrow grid columns');
  for (const selector of ['.review-goal-modal .rgm-field input:focus', '.review-goal-modal .rgm-field textarea:focus']) {
    assert.ok(rules.some(rule => rule.selectors.includes(selector) && /border-color:\s*#[\da-f]+;/i.test(rule.declarations)));
  }
  assert.doesNotMatch(css, /\b(?:position:\s*fixed|100dvh|100vh|safe-area-inset|z-index\s*:|backdrop-filter)/, 'scoped presentation must not redefine the shared viewport/overlay system');
});

test('North Star settings retain all six native fields and original parent updates and persistence', () => {
  const settings = reviewSource.slice(reviewSource.indexOf('{showPlanSettings && ('), reviewSource.indexOf('{(showAddDiscipline || ctx.editingDisciplineId)'));
  assert.match(settings, /<ReviewGoalModal/);
  assert.equal((settings.match(/<input\b/g) || []).length, 5);
  assert.equal((settings.match(/<textarea\b/g) || []).length, 1);
  assert.equal((settings.match(/<label\b/g) || []).length, 6);
  const callbacks = [
    'setInvestmentPlan({ ...plan, startCapital: (parseFloat(event.target.value) || 0) / rate })',
    'setInvestmentPlan({ ...plan, targetAnnualRate: (parseFloat(event.target.value) || 0) / 100 })',
    "setInvestmentPlan({ ...plan, startYear: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })",
    "setInvestmentPlan({ ...plan, totalYears: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })",
    "setInvestmentPlan({ ...plan, ageGoalAge: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })",
    'setInvestmentPlan({ ...plan, motto: event.target.value })',
  ];
  for (const callback of callbacks) assert.ok(settings.includes(callback), `preserve parent field update: ${callback}`);
  assert.equal((settings.match(/await db\./g) || []).length, 1);
  assert.ok(settings.includes('await db.upsertInvestmentPlan(investmentPlan);'));
  assert.ok(settings.includes('onClose={() => setShowPlanSettings(false)}'));
  assert.deepEqual([...settings.matchAll(/key:\s*'([^']+)'/g)].map(match => match[1]), ['save']);
  assert.ok(settings.includes('className="rgm-projection"') && settings.includes('<strong>{money(ageGoalAmountExact)}</strong>'));
  assert.doesNotMatch(settings, /autoFocus|window\.|document\.|alert\(/);
});

test('annual action presentation preserves recorded-vs-projected semantics and exact year callbacks', () => {
  const annual = reviewSource.slice(reviewSource.indexOf('{yearAction && ('), reviewSource.indexOf('{disciplineAction && ('));
  assert.ok(annual.includes('className="rgm-year-summary"'));
  assert.ok(annual.includes("yearAction.isProjected || yearAction.actualGain === null ? tt('review.pending', '待填写') : signedMoney(yearAction.actualGain)"));
  assert.ok(annual.includes("yearAction.isProjected ? tt('review.pending', '待填写') : money(yearAction.endBalance)"));
  for (const value of ['money(yearAction.startBalance)', 'money(yearAction.planTarget)', 'money(yearAction.startBalance + yearAction.planTarget)']) {
    assert.ok(annual.includes(value));
  }
  assert.ok(annual.includes('marketTextClass(yearAction.actualGain, marketColorMode)'), 'recorded gain should honor the existing market-color preference');
  assert.ok(annual.includes('onClose={() => setYearAction(null)}'));
  assert.deepEqual([...annual.matchAll(/key:\s*'([^']+)'/g)].map(match => match[1]), ['edit']);
  assert.ok(annual.includes('onClick: () => openYearEdit(yearAction.year)'));
  assert.doesNotMatch(annual, /\bdb\.|\bfetch\(|\bsetYearlyActuals\(|\bMath\.pow\(|autoFocus/);
});

test('explicit local screenshot entries reuse parent annual rows without opening production dialogs', () => {
  const initializer = reviewSource.match(/const \[yearAction, setYearAction\] = React\.useState\(\(\) => ([^;]+)\);/)?.[1];
  assert.equal(initializer, 'yearlyFinal.find(item => item.year === ctx.initialReviewYear) || null');
  const initializeYear = new Function('yearlyFinal', 'ctx', `return ${initializer};`);
  const recorded = Object.freeze({ year: 2026, actualGain: 70000, isProjected: false });
  const future = Object.freeze({ year: 2027, actualGain: null, isProjected: true });
  const rows = Object.freeze([recorded, future]);
  assert.equal(initializeYear(rows, {}), null);
  assert.equal(initializeYear(rows, { initialReviewYear: undefined }), null);
  assert.equal(initializeYear(rows, { initialReviewYear: 2020 }), null);
  assert.equal(initializeYear(rows, { initialReviewYear: 2026 }), recorded);
  assert.equal(initializeYear(rows, { initialReviewYear: 2027 }), future);
  assert.ok(previewSource.includes("get('reviewPanel')"));
  assert.ok(previewSource.includes("React.useState(reviewPanel === 'settings')"));
  assert.ok(previewSource.includes("initialReviewYear: reviewPanel === 'annual' ? yearlyActuals[0]?.year : undefined"));
  assert.ok(authSource.includes('if (import.meta.env.DEV && (!isSupabaseConfigured || isDevVisualPreviewRequested()))'));
  assert.ok(authSource.includes("const DevVisualPreview = lazy(() => import('./DevVisualPreview.jsx'))"));
  assert.doesNotMatch(authSource + appSource, /reviewPanel|initialReviewYear/, 'production navigation must not consume local screenshot query parameters');
  assert.doesNotMatch(reviewSource, /reviewPanel|window\.location\.search/, 'the real tab must not read preview queries itself');
});
