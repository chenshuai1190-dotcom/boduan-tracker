import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const globalCssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const stockLogoSource = readFileSync(new URL('../src/components/StockLogo.jsx', import.meta.url), 'utf8');

function cssRules(source) {
  return Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selector: match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    declarations: match[2].trim(),
  }));
}

function ruleWithSelectorToken(token) {
  return cssRules(globalCssSource).find((rule) => rule.selector.includes(token));
}

function assertSelectionDisabled(rule, message) {
  assert.ok(rule, `${message}: missing CSS rule`);
  assert.match(rule.declarations, /(?:^|;)\s*-webkit-touch-callout\s*:\s*none\s*(?:;|$)/, `${message}: native callout must be disabled`);
  assert.match(rule.declarations, /(?:^|;)\s*-webkit-user-select\s*:\s*none\s*(?:;|$)/, `${message}: WebKit text selection must be disabled`);
  assert.match(rule.declarations, /(?:^|;)\s*user-select\s*:\s*none\s*(?:;|$)/, `${message}: standard text selection must be disabled`);
}

test('the application root disables iOS native text selection and callouts by default', () => {
  const rootRule = cssRules(globalCssSource).find((rule) => rule.selector === '#root');
  assertSelectionDisabled(rootRule, 'application root');
});

test('only genuine editable controls and explicit opt-ins restore native text selection', () => {
  const editableRule = ruleWithSelectorToken('[data-allow-text-selection="true"]');
  assert.ok(editableRule, 'missing editable-control selection allowlist');

  for (const selectorToken of [
    'input:not([type]):not([readonly]):not([disabled])',
    '[type="text"]',
    '[type="search"]',
    '[type="email"]',
    '[type="password"]',
    '[type="tel"]',
    '[type="url"]',
    '[type="number"]',
    'textarea:not([readonly]):not([disabled])',
    '[contenteditable="true"]',
    '[data-allow-text-selection="true"]',
  ]) {
    assert.ok(
      editableRule.selector.includes(selectorToken),
      `editable-control allowlist must include ${selectorToken}`,
    );
  }

  assert.ok(
    editableRule.selector.includes('):not([readonly]):not([disabled])'),
    'typed inputs must exclude readonly and disabled controls from the editable allowlist',
  );
  assert.equal(
    editableRule.selector.includes('input[type="date"]'),
    false,
    'native date pickers must not be restored as selectable text',
  );
  assert.match(editableRule.declarations, /(?:^|;)\s*-webkit-touch-callout\s*:\s*default\s*(?:;|$)/);
  assert.match(editableRule.declarations, /(?:^|;)\s*-webkit-user-select\s*:\s*text\s*(?:;|$)/);
  assert.match(editableRule.declarations, /(?:^|;)\s*user-select\s*:\s*text\s*(?:;|$)/);
});

test('date, readonly, button, role, tab, and interactive surfaces stay non-selectable', () => {
  const interactiveRule = ruleWithSelectorToken('.ios-interactive-surface');
  assertSelectionDisabled(interactiveRule, 'non-editable interactive controls');

  for (const selectorToken of [
    'input[type="date"]',
    'input[readonly]',
    'input[disabled]',
    'textarea[readonly]',
    'textarea[disabled]',
    'button',
    '[role="button"]',
    '[role="tab"]',
    '.ios-interactive-surface',
  ]) {
    assert.ok(
      interactiveRule.selector.includes(selectorToken),
      `non-selectable boundary must include ${selectorToken}`,
    );
  }
});

test('native callouts remain an explicit opt-in instead of weakening the app-wide boundary', () => {
  const optInRule = ruleWithSelectorToken('[data-allow-native-callout="true"]');
  assert.ok(optInRule, 'missing explicit native-callout opt-in');
  assert.match(optInRule.declarations, /(?:^|;)\s*-webkit-touch-callout\s*:\s*default\s*(?:;|$)/);
});

test('shared stock logos cannot open the iOS image callout or start native dragging', () => {
  const imageRule = ruleWithSelectorToken('#root img');
  assert.ok(imageRule, 'missing app-wide image callout boundary');
  assert.match(imageRule.declarations, /(?:^|;)\s*-webkit-touch-callout\s*:\s*none\s*(?:;|$)/);
  assert.match(imageRule.declarations, /(?:^|;)\s*-webkit-user-drag\s*:\s*none\s*(?:;|$)/);

  const stockLogoImage = stockLogoSource.match(/<img\b[\s\S]*?\/>/)?.[0] || '';
  assert.ok(stockLogoImage, 'shared StockLogo image element is missing');
  assert.ok(
    stockLogoImage.includes('draggable={false}'),
    'shared StockLogo must disable native image dragging',
  );
});
