import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

const source = readFileSync(new URL('../src/components/NorthStarGoalCard.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/NorthStarGoalCard.css', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'NorthStarGoalCard.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/NorthStarGoalCard\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, _quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const { default: NorthStarGoalCard } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const baseProps = {
  language: 'zh',
  goalMoney: { main: '$14,860,167', decimal: '.34' },
  goalSubtitle: '20 年目标 · 60 岁实现',
  currentMoney: '$1,060,033.07',
  progressPct: 7.13,
  yearsLeft: 18,
  principalMoney: '$800,000.00',
  annualRateText: '12%',
  motto: '慢慢变富，安稳生活',
  displayCurrency: 'USD',
};

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate)),
  ];
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}

function renderCard(overrides = {}) {
  const props = { ...baseProps, ...overrides };
  let tree;
  function CaptureCard() {
    tree = NorthStarGoalCard(props);
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(CaptureCard));
  return { tree, html, props };
}

const buttons = tree => nodes(tree, node => node.type === 'button');
const currencyButtons = tree => buttons(tree).filter(node => ['USD', 'CNY'].includes(textContent(node)));
const labeledButton = (tree, label) => buttons(tree).find(node => node.props['aria-label'] === label);

test('preformatted target, current assets and principal retain every comma and cent, including zero', () => {
  for (const amounts of [
    { goalMoney: baseProps.goalMoney, currentMoney: baseProps.currentMoney, principalMoney: baseProps.principalMoney },
    { goalMoney: { main: '¥106,993,204', decimal: '.85' }, currentMoney: '¥7,632,238.10', principalMoney: '¥5,760,000.00' },
    { goalMoney: { main: '$0', decimal: '.00' }, currentMoney: '$0.00', principalMoney: '$0.00' },
  ]) {
    const { tree } = renderCard(amounts);
    const text = textContent(tree);
    assert.ok(text.includes(`${amounts.goalMoney.main}${amounts.goalMoney.decimal}`), 'the complete target must remain visible');
    for (const part of [amounts.goalMoney.main, amounts.goalMoney.decimal]) {
      assert.ok(nodes(tree, node => node.type === 'span' && textContent(node) === part).length, 'the target main amount and decimal must remain separate spans');
    }
    assert.ok(text.includes(amounts.currentMoney));
    assert.ok(text.includes(amounts.principalMoney));
    assert.ok(text.includes(baseProps.goalSubtitle));
    assert.ok(text.includes(baseProps.motto));
    assert.ok(text.includes(baseProps.annualRateText));
    assert.ok(text.includes(t('zh', 'review.goalYearsRemaining', undefined, { years: baseProps.yearsLeft })));
    assert.doesNotMatch(text, /NaN|undefined|Infinity/);
  }
});

test('progress has a one-decimal label and accessible semantics at both endpoints', () => {
  for (const progressPct of [0, 7.13, 100]) {
    const { tree } = renderCard({ progressPct });
    const bars = nodes(tree, node => node.props.role === 'progressbar');
    assert.equal(bars.length, 1);
    assert.equal(bars[0].props['aria-valuemin'], 0);
    assert.equal(bars[0].props['aria-valuemax'], 100);
    assert.equal(bars[0].props['aria-valuenow'], progressPct);
    assert.equal(bars[0].props['aria-valuetext'], `${progressPct.toFixed(1)}%`);
    assert.ok(bars[0].props['aria-label'] || bars[0].props['aria-labelledby'], 'progress requires an accessible name');
    assert.equal(nodes(tree, node => node.props.className === 'ns-progress-fill')[0].props.style.width, `${progressPct}%`);
    assert.ok(textContent(tree).includes(`${progressPct.toFixed(1)}%`));
  }
});

test('unavailable progress stays distinct from zero while finite out-of-range input remains bounded', () => {
  for (const progressPct of [undefined, null, NaN, Infinity]) {
    const { tree } = renderCard({ progressPct });
    const progressbar = nodes(tree, node => node.props.role === 'progressbar')[0];
    assert.equal(progressbar.props['aria-valuenow'], undefined);
    assert.equal(progressbar.props['aria-valuetext'], '—');
    assert.equal(textContent(nodes(tree, node => node.props.className === 'ns-completion')[0]), `${t('zh', 'review.goalCompletion')}—`);
    assert.doesNotMatch(textContent(tree), /NaN|undefined|Infinity/);
  }
  for (const [progressPct, expected] of [[-12, 0], [112, 100]]) {
    const { tree } = renderCard({ progressPct });
    assert.equal(nodes(tree, node => node.props.role === 'progressbar')[0].props['aria-valuenow'], expected);
  }
});

test('Chinese and English labels remain localized while supplied plan text stays intact', () => {
  for (const language of ['zh', 'en']) {
    const goalSubtitle = language === 'en' ? '20-year goal · reach it at age 60' : baseProps.goalSubtitle;
    const motto = language === 'en' ? 'Build a comfortable future' : baseProps.motto;
    const { tree } = renderCard({ language, goalSubtitle, motto });
    const text = textContent(tree);
    assert.ok(text.includes(t(language, 'review.polarisGoal')));
    assert.ok(text.includes(goalSubtitle));
    assert.ok(text.includes(motto));
    assert.ok(labeledButton(tree, t(language, 'review.openCompoundDetails')));
    assert.ok(labeledButton(tree, t(language, 'review.planSettings')));
    for (const key of ['review.currentAssets', 'review.goalCompletion', 'review.initialCapitalShort', 'review.assumedAnnualRate', 'review.viewCompoundPath']) {
      assert.ok(text.includes(t(language, key)));
    }
    assert.ok(nodes(tree, node => node.props.role === 'group' && node.props['aria-label'] === t(language, 'review.goalCurrency')).length);
    assert.doesNotMatch(text, /review\./);
    if (language === 'en') assert.doesNotMatch(text, /[\u3400-\u9fff]/);
  }
  assert.ok(textContent(renderCard({ language: undefined }).tree).includes('北极星目标'));
});

test('currency, detail and settings controls are independent native buttons', () => {
  const calls = [];
  const { tree } = renderCard({
    onCurrencyChange: currency => calls.push(['currency', currency]),
    onOpenDetails: () => calls.push(['details']),
    onOpenSettings: () => calls.push(['settings']),
  });
  const controls = buttons(tree);
  assert.equal(controls.length, 4);
  assert.deepEqual(calls, [], 'rendering must not open a dialog or change currency');
  for (const button of controls) {
    assert.equal(button.props.type, 'button');
    assert.equal(Boolean(button.props.disabled), false);
    assert.equal(nodes(button, node => node.type === 'button').length, 1, 'controls must not contain other buttons');
  }
  assert.equal(nodes(tree, node => node.type !== 'button' && node.props.role === 'button').length, 0, 'the card container must not add another interactive ancestor');
  assert.equal(nodes(tree, node => node.type !== 'button' && typeof node.props.onClick === 'function').length, 0, 'only the individual controls should handle clicks');

  for (const button of currencyButtons(tree)) {
    calls.length = 0;
    button.props.onClick({ stopPropagation() {} });
    assert.deepEqual(calls, textContent(button) === baseProps.displayCurrency ? [] : [['currency', textContent(button)]], 'currency actions must not invoke either dialog, and the active currency is a no-op');
  }
  calls.length = 0;
  labeledButton(tree, t('zh', 'review.openCompoundDetails')).props.onClick({ stopPropagation() {} });
  assert.deepEqual(calls, [['details']]);
  calls.length = 0;
  labeledButton(tree, t('zh', 'review.planSettings')).props.onClick({ stopPropagation() {} });
  assert.deepEqual(calls, [['settings']]);
});

test('pressed currency follows the parent selection and does not change supplied money', () => {
  for (const displayCurrency of ['USD', 'CNY']) {
    const changes = [];
    const { tree } = renderCard({ displayCurrency, onCurrencyChange: currency => changes.push(currency) });
    const currencies = currencyButtons(tree);
    assert.deepEqual(currencies.map(textContent), ['USD', 'CNY']);
    assert.equal(currencies.filter(button => button.props['aria-pressed'] === true).length, 1);
    for (const button of currencies) assert.equal(button.props['aria-pressed'], textContent(button) === displayCurrency);
    for (const button of currencies) button.props.onClick();
    assert.deepEqual(changes, [displayCurrency === 'USD' ? 'CNY' : 'USD']);
    assert.equal(currencies.find(button => button.props['aria-pressed']).props.children, displayCurrency, 'selection remains controlled until the parent rerenders');
    assert.ok(textContent(tree).includes('$14,860,167.34'), 'currency is a controlled selection; conversion belongs to the parent');
  }
});

test('rendering and invoking callbacks do not mutate supplied goal or plan props', () => {
  const goalMoney = Object.freeze({ ...baseProps.goalMoney });
  const props = Object.freeze({ ...baseProps, goalMoney, onCurrencyChange() {}, onOpenDetails() {}, onOpenSettings() {} });
  const before = JSON.stringify(props);
  let tree;
  function FrozenCard() {
    tree = NorthStarGoalCard(props);
    return tree;
  }
  renderToStaticMarkup(React.createElement(FrozenCard));
  for (const button of buttons(tree)) button.props.onClick({ stopPropagation() {} });
  assert.equal(JSON.stringify(props), before);
  assert.equal(props.goalMoney, goalMoney);
});

test('the goal card remains presentation-only without ledger, financial calculations or global lifecycle access', () => {
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', 'lucide-react', '../lib/i18n.js', './NorthStarGoalCard.css'].includes(module)));
  assert.doesNotMatch(source, /\b(?:fetch|save|insert|upsert|update|delete)\s*\(|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves|service_role|EODHD_API_KEY/);
  assert.doesNotMatch(source, /\b(?:window|document)\s*\.|\b(?:addEventListener|removeEventListener|useEffect|useLayoutEffect|useState|useReducer|useContext)\b|visibilitychange|pageshow|pagehide/);
  assert.doesNotMatch(source, /Intl\.(?:NumberFormat|DateTimeFormat)|parseFloat\(|parseInt\(|Math\.pow\(|convertCurrency|exchangeRate|computeCompound|calculateCompound/);
  assert.doesNotMatch(css, /(?:^|})\s*(?:html|body|:root|button|section)\s*[{,]/, 'styles must not alter global page or button behavior');
});

test('card styles remain scoped and all native controls retain visible keyboard focus', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1].split(',').map(selector => selector.trim()),
    declarations: match[2],
  }));
  assert.ok(rules.every(rule => rule.selectors.every(selector => /^\.north-star-card(?=[\s.:#\[>+~]|$)/.test(selector))), 'all rules, including responsive rules, must stay inside the card');
  const focusRule = rules.find(rule => rule.selectors.includes('.north-star-card button:focus-visible'));
  assert.ok(focusRule, 'every native card button requires visible keyboard focus');
  const outline = focusRule.declarations.match(/\boutline\s*:\s*([^;]+);/)?.[1].trim();
  assert.ok(outline);
  assert.doesNotMatch(outline, /^(?:0(?:px)?|none)(?:\s|$)/);
});
