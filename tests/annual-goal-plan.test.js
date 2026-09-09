import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';
import { marketHexColor } from '../src/lib/marketColorMode.js';

const source = readFileSync(new URL('../src/components/AnnualGoalPlan.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/AnnualGoalPlan.css', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'AnnualGoalPlan.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/AnnualGoalPlan\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, _quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`)
  .replace(/from (["'])\.\.\/lib\/([^'"]+)\1/g, (_, _quote, file) => `from ${JSON.stringify(new URL(`../src/lib/${file}`, import.meta.url).href)}`);
const { default: AnnualGoalPlan } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const money = value => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = value => `${value >= 0 ? '+' : '-'}${money(Math.abs(value))}`;
const currentYear = Object.freeze({ year: 2026, startBalance: 2400000, planTarget: 480000, actualGain: 70000, endBalance: 2470000, isProjected: false });
const futureYear = Object.freeze({ year: 2027, startBalance: 2470000, planTarget: 494000, actualGain: null, endBalance: 2964000, isProjected: true });
const pastYear = Object.freeze({ year: 2025, startBalance: 2000000, planTarget: 400000, actualGain: 400000, endBalance: 2400000, isProjected: false });
const baseProps = {
  language: 'zh', thisYear: 2026, visibleYears: [currentYear, futureYear],
  totalYearCount: 10, hiddenYearCount: 8, showAllYears: false,
  money, signedMoney, onToggleYears() {}, onOpenYear() {},
};

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
function renderPlan(overrides = {}) {
  let tree;
  const props = { ...baseProps, ...overrides };
  function Capture() { tree = AnnualGoalPlan(props); return tree; }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}
const byClass = (tree, className) => nodes(tree, node => (node.props.className || '').split(' ').includes(className));
const current = tree => byClass(tree, 'ag-current-card')[0];
const progressbar = tree => nodes(tree, node => node.props.role === 'progressbar')[0];
const currentWith = fields => ({ ...currentYear, ...fields });

test('annual focus prioritizes realized gain, target and one completion ratio without a repeated asset chain', () => {
  const { tree } = renderPlan();
  const card = current(tree);
  assert.ok(card);
  assert.equal(textContent(byClass(card, 'ag-gain')[0]), '+$70,000.00');
  assert.ok(textContent(byClass(card, 'ag-current-target')[0]).includes('$480,000.00'));
  assert.equal(textContent(byClass(card, 'ag-gap')[0]), '距离目标还差 $410,000.00');
  assert.equal(progressbar(tree).props['aria-valuetext'], '14.6%');
  assert.equal(textContent(card).match(/14\.6%/g).length, 1);
  assert.doesNotMatch(textContent(card), /\$2,470,000|\$2,400,000|100%/);
  assert.equal(byClass(tree, 'ag-year-row').length, 1);
});

test('realized zero is retained and is distinct from missing and projected annual records', () => {
  const { tree: zero } = renderPlan({ visibleYears: [currentWith({ actualGain: 0, endBalance: 2400000 })] });
  assert.equal(textContent(byClass(zero, 'ag-gain')[0]), '+$0.00');
  assert.equal(progressbar(zero).props['aria-valuenow'], 0);
  assert.equal(progressbar(zero).props['aria-valuetext'], '0.0%');
  for (const fields of [{ actualGain: null }, { actualGain: undefined }, { actualGain: NaN }, { actualGain: Infinity }, { actualGain: 480000, isProjected: true }]) {
    const { tree } = renderPlan({ visibleYears: [currentWith(fields)] });
    assert.equal(textContent(byClass(tree, 'ag-gain')[0]), '待填写');
    assert.equal(byClass(tree, 'ag-status')[0].props['data-annual-goal-status'], 'pending');
    assert.equal(progressbar(tree).props['aria-valuenow'], undefined);
    assert.equal(progressbar(tree).props['aria-valuetext'], '待填写');
    assert.equal(textContent(byClass(tree, 'ag-progress-summary')[0]), '本年完成—');
    assert.doesNotMatch(textContent(current(tree)), /0\.0%|NaN|Infinity|undefined|\$2,470,000/);
  }
});

test('current in-progress, reached and exceeded statuses retain cent-level rules and an exceeded icon', () => {
  for (const [actualGain, status, gap] of [[70, 'inProgress', '距离目标还差 $30.00'], [100, 'reached', '已达标'], [100.001, 'reached', '已达标'], [120, 'exceeded', '超额 $20.00']]) {
    const { tree } = renderPlan({ visibleYears: [currentWith({ actualGain, planTarget: 100 })] });
    const statusNode = byClass(tree, 'ag-status')[0];
    assert.equal(statusNode.props['data-annual-goal-status'], status);
    assert.equal(textContent(byClass(tree, 'ag-gap')[0]), gap);
    const iconNodes = nodes(statusNode, node => typeof node.type !== 'string' && node.props['aria-hidden'] === 'true');
    assert.equal(iconNodes.length, status === 'exceeded' ? 1 : 0);
  }
});

test('current-year shortfalls stay in progress while the same past-year shortfall is behind', () => {
  for (const language of ['zh', 'en']) {
    const past = Object.freeze({ ...pastYear, actualGain: 70, planTarget: 100 });
    const present = Object.freeze(currentWith({ actualGain: 70, planTarget: 100 }));
    const { tree } = renderPlan({ language, visibleYears: Object.freeze([past, present]) });
    const currentStatus = byClass(current(tree), 'ag-status')[0];
    const pastStatus = byClass(byClass(tree, 'ag-year-row')[0], 'ag-status')[0];
    assert.equal(currentStatus.props['data-annual-goal-status'], 'inProgress');
    assert.equal(textContent(currentStatus), t(language, 'review.compoundInProgress'));
    assert.equal(pastStatus.props['data-annual-goal-status'], 'behind');
    assert.equal(textContent(pastStatus), t(language, 'review.behind'));
    assert.equal(textContent(byClass(tree, 'ag-gain')[0]), '+$70.00');
    assert.equal(progressbar(tree).props['aria-valuetext'], '70.0%');
    assert.equal(byClass(tree, 'ag-gap')[0].props['data-gap-status'], 'inProgress');
    assert.equal(textContent(byClass(tree, 'ag-gap')[0]), t(language, 'review.annualGapRemaining', undefined, { amount: '$30.00' }));
  }
});

test('future records show only the plan even when saved gains are zero, short, reached or exceeded', () => {
  for (const language of ['zh', 'en']) {
    for (const actualGain of [0, 50, 100, 150]) {
      const future = Object.freeze({ ...futureYear, startBalance: 1000, planTarget: 100, actualGain, endBalance: 1000 + actualGain, isProjected: false });
      const calls = [];
      const { tree } = renderPlan({ language, visibleYears: Object.freeze([future]), onOpenYear: row => calls.push(row) });
      const row = byClass(tree, 'ag-year-row')[0];
      const status = byClass(row, 'ag-status')[0];
      assert.equal(status.props['data-annual-goal-status'], 'notStarted');
      assert.equal(textContent(status), t(language, 'review.notStarted'));
      assert.equal(textContent(byClass(row, 'ag-row-gain')[0]), `${t(language, 'review.annualPlannedGain')}+$100.00`);
      assert.equal(textContent(byClass(row, 'ag-row-assets')[0]), `${t(language, 'review.annualTargetAssets')}$1,100.00`);
      assert.ok(!textContent(row).includes(t(language, 'review.annualRecordedGain')));
      assert.equal(byClass(row, 'ag-row-gain')[0].props.children[1].props.style, undefined);
      assert.deepEqual(calls, []);
      row.props.onClick();
      assert.deepEqual(calls, [future]);
      assert.equal(calls[0], future, 'opening the future plan must preserve the original record');
      assert.equal(future.actualGain, actualGain);
    }
  }
});

test('negative and over-100 completion remain accurate while visual progress stays bounded', () => {
  for (const [actualGain, expectedLabel, expectedWidth] of [[-200, '-20.0%', '0%'], [1200, '120.0%', '100%']]) {
    const { tree } = renderPlan({ visibleYears: [currentWith({ actualGain, planTarget: 1000 })] });
    assert.equal(progressbar(tree).props['aria-valuetext'], expectedLabel);
    assert.equal(byClass(tree, 'ag-progress-fill')[0].props.style.width, expectedWidth);
    assert.ok(textContent(byClass(tree, 'ag-progress-summary')[0]).includes(expectedLabel));
    assert.equal(progressbar(tree).props['aria-valuemin'], 0);
    assert.equal(progressbar(tree).props['aria-valuemax'], 100);
    assert.equal(progressbar(tree).props['aria-valuenow'], actualGain < 0 ? 0 : 100);
  }
  for (const planTarget of [0, -100, null, undefined, NaN, Infinity]) {
    const { tree } = renderPlan({ visibleYears: [currentWith({ actualGain: 0, planTarget })] });
    assert.equal(progressbar(tree).props['aria-valuenow'], undefined);
    assert.doesNotMatch(textContent(current(tree)), /NaN|Infinity|undefined/);
  }
});

test('timeline labels planned target assets separately from actual achieved returns', () => {
  const changedActual = { ...pastYear, actualGain: 300000, endBalance: 2300000 };
  const missingPast = { ...pastYear, year: 2024, actualGain: null, isProjected: true };
  const { tree } = renderPlan({ visibleYears: [missingPast, changedActual, currentYear, futureYear], showAllYears: true });
  assert.equal(byClass(tree, 'ag-current-card').length, 1);
  const rows = byClass(tree, 'ag-year-row');
  assert.equal(rows.length, 3);
  assert.ok(textContent(rows[0]).includes('待填写'));
  assert.ok(textContent(rows[1]).includes('期末目标资产$2,400,000.00'));
  assert.ok(textContent(rows[1]).includes('已实现收益+$300,000.00'));
  assert.doesNotMatch(textContent(rows[1]), /\$2,300,000/);
  assert.ok(textContent(rows[2]).includes('未开始'));
  assert.ok(textContent(rows[2]).includes('期末目标资产$2,964,000.00'));
  assert.ok(textContent(rows[2]).includes('计划收益+$494,000.00'));
  assert.doesNotMatch(textContent(rows[2]), /已实现收益/);
});

test('large CNY values preserve full cents and caller formatting without compact notation', () => {
  const cny = value => `¥${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signedCny = value => `${value >= 0 ? '+' : '-'}${cny(Math.abs(value))}`;
  const row = currentWith({ actualGain: 106993204.85, planTarget: 206993204.97 });
  const next = { ...futureYear, startBalance: 107632238.10, planTarget: 21526447.62 };
  const { tree } = renderPlan({ visibleYears: [row, next], money: cny, signedMoney: signedCny });
  assert.ok(textContent(tree).includes('+¥106,993,204.85'));
  assert.ok(textContent(tree).includes('¥206,993,204.97'));
  assert.ok(textContent(tree).includes('¥100,000,000.12'));
  assert.ok(textContent(tree).includes('¥129,158,685.72'));
  assert.ok(textContent(tree).includes('+¥21,526,447.62'));
  assert.doesNotMatch(textContent(tree), /亿|万|\.\.\./);
  assert.doesNotMatch(css, /text-overflow\s*:\s*ellipsis|white-space\s*:\s*nowrap|line-clamp/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('annual and expansion actions are independent native controls and retain original immutable row objects', () => {
  const records = Object.freeze([pastYear, currentYear, futureYear]);
  const original = JSON.stringify(records);
  const calls = [];
  const { tree } = renderPlan({ visibleYears: records, showAllYears: true, onOpenYear: row => calls.push(row), onToggleYears: () => calls.push('toggle') });
  const buttons = nodes(tree, node => node.type === 'button');
  assert.equal(buttons.length, 4);
  for (const button of buttons) {
    assert.equal(button.props.type, 'button');
    assert.equal(nodes(button, node => node.type === 'button').length, 1);
  }
  assert.deepEqual(calls, []);
  current(tree).props.onClick();
  byClass(tree, 'ag-year-row')[0].props.onClick();
  byClass(tree, 'ag-year-row')[1].props.onClick();
  byClass(tree, 'ag-toggle')[0].props.onClick();
  assert.deepEqual(calls, [currentYear, pastYear, futureYear, 'toggle']);
  assert.equal(calls[0], currentYear);
  assert.equal(JSON.stringify(records), original);
  assert.equal(byClass(tree, 'ag-toggle')[0].props['aria-expanded'], true);
  assert.equal(byClass(renderPlan({ totalYearCount: 3 }).tree, 'ag-toggle').length, 0);
});

test('missing current year renders compact plan rows without fabricating a focus year', () => {
  for (const visibleYears of [[], [pastYear], [futureYear]]) {
    const { tree } = renderPlan({ visibleYears });
    assert.equal(byClass(tree, 'ag-current-card').length, 0);
    assert.equal(byClass(tree, 'ag-year-row').length, visibleYears.length);
    assert.equal(nodes(tree, node => node.props.role === 'progressbar').length, 0);
  }
});

test('gain colors respect the market setting while zero remains neutral and fill uses the shared accent', () => {
  for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
    for (const actualGain of [-70, 70]) {
      const { tree } = renderPlan({ marketColorMode, visibleYears: [currentWith({ actualGain })] });
      assert.equal(byClass(tree, 'ag-gain')[0].props.style.color, marketHexColor(actualGain, marketColorMode));
    }
  }
  assert.equal(byClass(renderPlan({ visibleYears: [currentWith({ actualGain: 0 })] }).tree, 'ag-gain')[0].props.style.color, '#f1f1f2');
  assert.match(css, /\.ag-progress-fill\s*\{[^}]*background:\s*#ff4b1f/);
});

test('both languages use localized annual labels and preserve the supplied year and formatter', () => {
  for (const language of ['zh', 'en']) {
    const { tree } = renderPlan({ language });
    const text = textContent(tree);
    for (const key of ['review.annualPlan', 'review.annualRealizedGain', 'review.annualProfitTarget', 'review.annualTargetAssets', 'review.annualPlannedGain']) {
      assert.ok(text.includes(t(language, key)), `missing ${language} ${key}`);
    }
    assert.equal(current(tree).props['aria-label'], t(language, 'review.openAnnualPlan', undefined, { year: 2026 }));
    assert.ok(text.includes('+$70,000.00'));
    assert.doesNotMatch(text, /review\./);
    if (language === 'en') assert.doesNotMatch(text, /[\u3400-\u9fff]/);
  }
});

test('annual plan remains scoped presentation without persistence, network, projections or global styling', () => {
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', 'lucide-react', '../lib/i18n.js', '../lib/annualGoalStatus.js', '../lib/marketColorMode.js', './AnnualGoalPlan.css'].includes(module)));
  assert.doesNotMatch(source, /\b(?:fetch|save|insert|upsert|update|delete)\s*\(|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves|service_role/);
  assert.doesNotMatch(source, /\b(?:window|document)\s*\.|\b(?:useEffect|useLayoutEffect|useState|useReducer|useContext|addEventListener)\b/);
  assert.doesNotMatch(source, /Intl\.|Math\.pow|calculateCompound|computeCompound|exchangeRate|convertCurrency/);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selectors: match[1].split(',').map(selector => selector.trim()), declarations: match[2] }));
  assert.ok(rules.every(rule => rule.selectors.every(selector => /^\.annual-goal-plan(?=[\s.:#\[>+~]|$)/.test(selector))));
  assert.ok(rules.find(rule => rule.selectors.includes('.annual-goal-plan button:focus-visible'))?.declarations.includes('outline: 1px solid'));
  assert.doesNotMatch(css, /#f6b54b|linear-gradient|animation:|box-shadow:/);
});
