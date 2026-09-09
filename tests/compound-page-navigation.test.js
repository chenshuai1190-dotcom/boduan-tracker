import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { resolveAnnualGoalStatus } from '../src/lib/annualGoalStatus.js';
import { t } from '../src/lib/i18n.js';
import { marketTextClass } from '../src/lib/marketColorMode.js';

const source = readFileSync(new URL('../src/tabs/ReviewTab.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'ReviewTab.jsx', { jsx: { runtime: 'classic' } });
const componentNames = [
  'BookOpenIcon', 'ChevronRight', 'NotebookPen', 'PinIcon', 'Plus',
  'AnnualGoalPlan', 'CompoundDetailPage', 'ReviewGoalModal',
  'DisciplineDetailModal', 'ReviewLogDetailModal', 'NorthStarGoalCard',
];
const components = Object.fromEntries(componentNames.map(name => [name, function Stub() { return null; }]));
const bindings = { ...components, resolveAnnualGoalStatus, t, marketTextClass };
const compiled = transformed.code
  .replace(/^import\s[^\n]+;?\n/gm, '')
  .replace('export default function ReviewTab', 'function ReviewTab');
// Only imports are substituted: render branches, data derivation, hooks and
// event handlers below execute the compiled production ReviewTab component.
const createReviewTab = new Function('React', 'window', ...Object.keys(bindings), `"use strict";\n${compiled}\nreturn ReviewTab;`);

function nodes(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, type)),
  ];
}

function fixture(overrides = {}) {
  const calls = [];
  const callbackNames = [
    'setDisciplines', 'setEditingDisciplineId', 'setEditingLogId', 'setEditYearlyActualId',
    'setFilterLevel', 'setInvestmentPlan', 'setReviewLogs', 'setShowAddDiscipline',
    'setShowAddLog', 'setShowAllDisciplines', 'setShowAllLogs', 'setShowAllYears',
    'setShowPlanSettings', 'setYearlyActuals', 'showConfirm',
  ];
  const callbacks = Object.fromEntries(callbackNames.map(name => [name, (...args) => calls.push({ name, args })]));
  const db = Object.freeze(Object.fromEntries([
    'upsertInvestmentPlan', 'updateDiscipline', 'deleteDiscipline', 'deleteReviewLog',
    'insertDiscipline', 'updateReviewLog', 'insertReviewLog', 'upsertYearlyActual',
  ].map(name => [name, (...args) => calls.push({ name: `db.${name}`, args })])));
  const year = new Date().getFullYear();
  const ctx = Object.freeze({
    ChevronDown: components.ChevronRight, ChevronUp: components.ChevronRight,
    language: 'zh', filterLevel: 'all', usdRate: 7.2, marketColorMode: 'red-up',
    investmentPlan: Object.freeze({ startYear: year, totalYears: 10, startCapital: 1000, targetAnnualRate: 0.2, displayCurrency: 'USD', motto: 'Keep the plan' }),
    yearlyActuals: Object.freeze([Object.freeze({ year, actualGain: 150, endBalance: 1150 })]),
    disciplines: Object.freeze([Object.freeze({ id: 'discipline-1', date: `${year}-01-01`, level: '🟢', text: 'Keep this entry', pinned: true })]),
    reviewLogs: Object.freeze([Object.freeze({ id: 'log-1', date: `${year}-01-02`, text: 'Keep this review' })]),
    lastSubmitRef: Object.freeze({ current: Object.freeze({}) }),
    db, ...callbacks, ...overrides,
  });
  return { ctx, calls };
}

function navigationHarness(ctx, initialScroll = 0) {
  const slots = [];
  let cursor = 0;
  let hookCount;
  let tree;
  let pendingEffects = [];
  const scrolls = [];
  const window = {
    scrollY: initialScroll,
    scrollTo(options) {
      scrolls.push({ ...options, view: tree.type === components.CompoundDetailPage ? 'details' : 'list' });
      this.scrollY = options.top;
    },
  };
  const changed = (previous, next) => !previous || !next || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(calculate, dependencies) {
      const index = cursor++;
      if (changed(slots[index]?.dependencies, dependencies)) slots[index] = { value: calculate(), dependencies };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useLayoutEffect(effect, dependencies) {
      const index = cursor++;
      if (changed(slots[index], dependencies)) pendingEffects.push(effect);
      slots[index] = dependencies;
    },
  };
  const ReviewTab = createReviewTab(hooks, window, ...Object.values(bindings));
  return {
    window, scrolls,
    get tree() { return tree; },
    render() {
      assert.equal(pendingEffects.length, 0, 'commit the preceding render before rendering again');
      cursor = 0;
      tree = ReviewTab({ ctx });
      if (hookCount !== undefined) assert.equal(cursor, hookCount, 'both views must retain the same hook order');
      hookCount = cursor;
      return tree;
    },
    commit() {
      const effects = pendingEffects;
      pendingEffects = [];
      for (const effect of effects) effect();
    },
    open() {
      const cards = nodes(tree, components.NorthStarGoalCard);
      assert.equal(cards.length, 1);
      cards[0].props.onOpenDetails();
    },
    back() {
      assert.equal(tree.type, components.CompoundDetailPage);
      tree.props.onBack();
    },
  };
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
const growthOf = tree => nodes(tree, 'span').find(node => node.props.className?.split(' ').includes('rgm-actual-growth'));
const excessOf = tree => nodes(tree, 'div').find(node => node.props.className === 'rgm-excess-row');
function openAnnualAction(overrides = {}, rowOverride) {
  const { ctx, calls } = fixture(overrides);
  const before = JSON.stringify(ctx);
  const harness = navigationHarness(ctx);
  harness.render();
  harness.commit();
  const annual = nodes(harness.tree, components.AnnualGoalPlan)[0];
  const row = rowOverride ?? annual.props.visibleYears[0];
  annual.props.onOpenYear(row);
  harness.render();
  harness.commit();
  const sheet = React.Children.toArray(harness.tree.props.children).find(node => node.props.title === t(ctx.language, 'review.yearActions'));
  assert.ok(sheet, 'the actual ReviewTab annual-row handler opens its annual action sheet');
  return { ctx, calls, before, harness, row, sheet };
}

test('annual action sheets show actual growth rather than target completion and convert excess once in either currency', () => {
  const year = new Date().getFullYear();
  for (const language of ['zh', 'en']) {
    for (const marketColorMode of ['redUpGreenDown', 'greenUpRedDown']) {
      for (const [displayCurrency, gain, excess] of [['USD', '+$250.00', '+$50.00'], ['CNY', '+¥1,800.00', '+¥360.00']]) {
        const investmentPlan = Object.freeze({ ...fixture().ctx.investmentPlan, displayCurrency });
        const yearlyActuals = Object.freeze([Object.freeze({ year, actualGain: 250, endBalance: 1250 })]);
        const { sheet, row, calls, ctx, before } = openAnnualAction({ language, marketColorMode, investmentPlan, yearlyActuals });
        assert.deepEqual([row.startBalance, row.planTarget, row.actualGain], [1000, 200, 250]);
        const growth = growthOf(sheet);
        assert.equal(growth.props['aria-label'], t(language, 'review.actualGrowthRate'));
        assert.equal(textContent(growth), '+25.0%');
        assert.ok(growth.props.className.includes(marketTextClass(25, marketColorMode)));
        assert.ok(!textContent(sheet).includes('125.0%'), '125% target completion must not replace the 25% gain on starting assets');
        assert.equal(textContent(nodes(sheet, 'strong').find(node => node.props.className?.split(' ').includes('rgm-result'))), gain);
        const excessRow = excessOf(sheet);
        assert.equal(textContent(nodes(excessRow, 'dt')[0]), t(language, 'review.excessGain'));
        const amount = nodes(nodes(excessRow, 'dd')[0], 'span')[0];
        assert.equal(textContent(amount), excess);
        assert.equal(amount.props.className, marketTextClass(50, marketColorMode));
        assert.deepEqual(sheet.props.actions.map(action => action.key), ['edit']);
        assert.equal(sheet.props.actions[0].label, t(language, 'review.editYearData'));
        assert.deepEqual(calls, []);
        sheet.props.onClose();
        assert.deepEqual(calls, [], 'opening, reading and closing never save annual data');
        assert.equal(JSON.stringify(ctx), before);
      }
    }
  }
});

test('annual action growth and excess respect missing values, future years, valid starting assets and cent-level achievement', () => {
  const year = new Date().getFullYear();
  const base = { year, startBalance: 1000, planTarget: 200, actualGain: 250, endBalance: 1250, isProjected: false };
  const cases = [
    [{ actualGain: -250 }, '-25.0%', null],
    [{ actualGain: 0 }, '0.0%', null],
    [{ actualGain: 150 }, '+15.0%', null],
    [{ planTarget: 250 }, '+25.0%', null],
    [{ actualGain: 250.004, planTarget: 250 }, '+25.0%', null],
    [{ actualGain: 250.01, planTarget: 250 }, '+25.0%', '+$0.01'],
    [{ actualGain: null }, '—', null],
    [{ actualGain: undefined }, '—', null],
    [{ actualGain: NaN }, '—', null],
    [{ actualGain: Infinity }, '—', null],
    [{ isProjected: true }, '—', null],
    [{ year: year + 1 }, '—', null],
    [{ startBalance: 0 }, '—', '+$50.00'],
    [{ startBalance: -1000 }, '—', '+$50.00'],
    [{ startBalance: NaN }, '—', '+$50.00'],
    [{ startBalance: Infinity }, '—', '+$50.00'],
    [{ startBalance: Number.MIN_VALUE, actualGain: 1, planTarget: 2 }, '—', null],
    [{ planTarget: null }, '+25.0%', null],
    [{ planTarget: NaN }, '+25.0%', null],
    [{ planTarget: Infinity }, '+25.0%', null],
    [{ startBalance: Number.MAX_VALUE, actualGain: Number.MAX_VALUE, planTarget: -Number.MAX_VALUE }, '+100.0%', null],
  ];
  for (const [fields, expectedGrowth, expectedExcess] of cases) {
    const row = Object.freeze({ ...base, ...fields });
    const snapshot = { ...row };
    const { sheet, calls, ctx, before } = openAnnualAction({ marketColorMode: 'redUpGreenDown' }, row);
    const growth = growthOf(sheet);
    assert.equal(textContent(growth), expectedGrowth);
    assert.equal(growth.props.style, undefined);
    if (expectedGrowth === '—' || expectedGrowth === '0.0%') assert.equal(growth.props.className.trim(), 'rgm-actual-growth');
    else assert.ok(growth.props.className.includes(marketTextClass(row.actualGain, 'redUpGreenDown')));
    const excess = excessOf(sheet);
    if (expectedExcess === null) assert.equal(excess, undefined, 'unrecorded, unmet, cent-equal or invalid differences have no excess row');
    else assert.equal(textContent(nodes(excess, 'dd')[0]), expectedExcess);
    assert.deepEqual(row, snapshot);
    assert.deepEqual(calls, []);
    assert.equal(JSON.stringify(ctx), before);
  }
});

test('historical annual action metrics use the recorded year and retain the existing edit callback without writes', () => {
  const year = new Date().getFullYear() - 1;
  const investmentPlan = Object.freeze({ ...fixture().ctx.investmentPlan, startYear: year });
  const yearlyActuals = Object.freeze([Object.freeze({ year, actualGain: 250, endBalance: 1250 })]);
  const { sheet, row, ctx, calls, before, harness } = openAnnualAction({ investmentPlan, yearlyActuals, showAllYears: true });
  assert.equal(row.year, year);
  assert.equal(textContent(growthOf(sheet)), '+25.0%');
  assert.equal(textContent(nodes(excessOf(sheet), 'dd')[0]), '+$50.00');
  assert.ok(textContent(sheet).includes(t('zh', 'review.pastYear')));
  sheet.props.actions[0].onClick();
  assert.deepEqual(calls, [{ name: 'setEditYearlyActualId', args: [year] }]);
  harness.render();
  harness.commit();
  assert.equal(growthOf(harness.tree), undefined, 'editing dismisses the action sheet before the parent opens the editor');
  assert.equal(ctx.investmentPlan, investmentPlan);
  assert.equal(ctx.yearlyActuals, yearlyActuals);
  assert.equal(JSON.stringify(ctx), before);
});

test('initial ReviewTab rendering does not move the window in the list or direct details preview', () => {
  for (const initialCompoundDetails of [false, true]) {
    const { ctx } = fixture({ initialCompoundDetails });
    const harness = navigationHarness(ctx, 275);
    harness.render();
    harness.commit();
    assert.equal(harness.tree.type === components.CompoundDetailPage, initialCompoundDetails);
    assert.deepEqual(harness.scrolls, []);
    assert.equal(harness.window.scrollY, 275);
  }
});

test('actual card and back handlers replace the view before scrolling and restore the click-time list position', () => {
  const { ctx, calls } = fixture();
  const harness = navigationHarness(ctx, 100);
  harness.render();
  harness.commit();
  harness.window.scrollY = 482.5;
  harness.open();
  assert.deepEqual(harness.scrolls, [], 'opening must defer its scroll until the new view is committed');
  assert.equal(harness.render().type, components.CompoundDetailPage);
  assert.equal(nodes(harness.tree, components.NorthStarGoalCard).length, 0);
  assert.equal(nodes(harness.tree, components.AnnualGoalPlan).length, 0);
  assert.deepEqual(harness.scrolls, []);
  harness.commit();
  assert.deepEqual(harness.scrolls, [{ top: 0, left: 0, behavior: 'instant', view: 'details' }]);

  harness.window.scrollY = 940;
  harness.back();
  assert.equal(harness.scrolls.length, 1, 'back must defer restoration until the list is committed');
  const list = harness.render();
  assert.equal(list.type, 'div');
  assert.ok(list.props.className.split(' ').includes('review-page'));
  assert.equal(nodes(list, components.NorthStarGoalCard).length, 1);
  assert.equal(nodes(list, components.AnnualGoalPlan).length, 1);
  assert.equal(nodes(list, components.CompoundDetailPage).length, 0);
  harness.commit();
  assert.deepEqual(harness.scrolls.at(-1), { top: 482.5, left: 0, behavior: 'instant', view: 'list' });
  assert.deepEqual(calls, []);
});

test('each entry captures the current list scroll anew and ordinary rerenders do not replay scrolling', () => {
  const harness = navigationHarness(fixture().ctx);
  harness.render();
  harness.commit();
  for (const position of [618, 203.25, 0]) {
    harness.window.scrollY = position;
    harness.open();
    harness.render();
    harness.commit();
    const afterOpen = harness.scrolls.length;
    harness.window.scrollY = 127;
    harness.render();
    harness.commit();
    assert.equal(harness.scrolls.length, afterOpen);
    assert.equal(harness.window.scrollY, 127);
    harness.back();
    harness.render();
    harness.commit();
    assert.equal(harness.window.scrollY, position);
    assert.deepEqual(harness.scrolls.at(-1), { top: position, left: 0, behavior: 'instant', view: 'list' });
    harness.render();
    harness.commit();
    assert.equal(harness.scrolls.length, afterOpen + 1);
  }
  assert.equal(harness.scrolls.length, 6);
});

test('entering and returning leave frozen parent data, callbacks and list content intact', () => {
  const { ctx, calls } = fixture({ showAllYears: true, showAllDisciplines: true, showAllLogs: true });
  const before = JSON.stringify(ctx);
  const references = Object.entries(ctx);
  const harness = navigationHarness(ctx, 333);
  harness.render();
  harness.commit();
  const originalYears = nodes(harness.tree, components.AnnualGoalPlan)[0].props.visibleYears;
  harness.open();
  harness.render();
  harness.commit();
  assert.equal(harness.tree.props.yearRows, originalYears);
  assert.equal(harness.tree.props.startCapital, ctx.investmentPlan.startCapital);
  assert.equal(harness.tree.props.yearRows[0].actualGain, ctx.yearlyActuals[0].actualGain);
  harness.back();
  harness.render();
  harness.commit();
  assert.equal(nodes(harness.tree, components.AnnualGoalPlan)[0].props.visibleYears, originalYears);
  assert.deepEqual(nodes(harness.tree, 'span').map(node => node.props.children).filter(value => typeof value === 'string' && value.startsWith('Keep')), ['Keep this entry', 'Keep this review']);
  assert.equal(JSON.stringify(ctx), before);
  for (const [key, reference] of references) assert.equal(ctx[key], reference, `${key} must remain owned by the parent`);
  assert.deepEqual(calls, [], 'navigation must not call parent setters, persistence or confirmation callbacks');
});

function insightList(tree) {
  const section = nodes(tree, 'section').find(node => node.props['aria-labelledby'] === 'review-disciplines-heading');
  const buttons = nodes(section, 'button');
  return {
    entries: buttons.filter(node => node.props.className === 'review-entry'),
    toggle: buttons.find(node => node.props.className === 'review-show-more'),
  };
}

function note(id, pinned = false, level = '🟢') {
  return Object.freeze({ id, text: id, date: '2026-01-01', pinned, level });
}

function insightText(entry) {
  return nodes(entry, 'span').find(node => node.props.className === 'review-entry-body').props.children;
}

test('all pinned insights remain visible when collapsed, without changing order or persistence', () => {
  const pinned = Array.from({ length: 5 }, (_, index) => note(`pinned-${index}`, true));
  const ordinary = [note('ordinary-1'), note('ordinary-2')];
  const disciplines = Object.freeze([ordinary[0], ...pinned, ordinary[1]]);
  const { ctx, calls } = fixture({ disciplines, showAllDisciplines: false });
  const harness = navigationHarness(ctx);
  harness.render();
  harness.commit();
  const list = insightList(harness.tree);
  assert.deepEqual(list.entries.map(insightText), pinned.map(item => item.id));
  assert.ok(list.entries.every(node => node.props['data-pinned'] === 'true'));
  assert.ok(list.toggle, 'ordinary entries still have an expand control');
  assert.deepEqual(calls, [], 'rendering does not write pin flags or any data');
  list.toggle.props.onClick();
  assert.deepEqual(calls, [{ name: 'setShowAllDisciplines', args: [true] }]);
  assert.deepEqual(disciplines.map(item => item.id), ['ordinary-1', ...pinned.map(item => item.id), 'ordinary-2']);
});

test('all-pinned lists have no redundant expand control, while ordinary defaults stay at three', () => {
  for (const pinnedCount of [0, 2, 5]) {
    const disciplines = Object.freeze(Array.from({ length: 5 }, (_, index) => note(`note-${index}`, index < pinnedCount)));
    const harness = navigationHarness(fixture({ disciplines, showAllDisciplines: false }).ctx);
    harness.render();
    harness.commit();
    const list = insightList(harness.tree);
    assert.equal(list.entries.length, Math.max(3, pinnedCount));
    assert.equal(Boolean(list.toggle), pinnedCount < 5);
  }
});

test('insight expansion and level filters preserve pinned visibility without leaking other levels', () => {
  const pinned = Array.from({ length: 5 }, (_, index) => note(`pinned-${index}`, true, '🔺'));
  const disciplines = Object.freeze([note('ordinary'), ...pinned, note('important-extra', false, '🔺')]);
  for (const showAllDisciplines of [false, true]) {
    const { ctx, calls } = fixture({ disciplines, filterLevel: '🔺', showAllDisciplines });
    const harness = navigationHarness(ctx);
    harness.render();
    harness.commit();
    const list = insightList(harness.tree);
    assert.deepEqual(list.entries.map(insightText), [...pinned.map(item => item.id), ...(showAllDisciplines ? ['important-extra'] : [])]);
    list.toggle.props.onClick();
    assert.deepEqual(calls, [{ name: 'setShowAllDisciplines', args: [!showAllDisciplines] }]);
  }
});

test('annual editor receives the existing rolling start and target as read-only references', async () => {
  const year = new Date().getFullYear();
  function YearEditor() { return null; }
  for (const [offset, previousActuals, expectedStart, projected] of [
    [0, [], 1000, false],
    [1, [{ year, actualGain: 150, endBalance: 1150 }], 1150, false],
    [1, [], 1200, true],
  ]) {
    const yearlyActuals = Object.freeze(previousActuals.map(item => Object.freeze(item)));
    const { ctx, calls } = fixture({ editYearlyActualId: year + offset, YearlyActualModal: YearEditor, yearlyActuals });
    const harness = navigationHarness(ctx);
    harness.render();
    harness.commit();
    const editor = nodes(harness.tree, YearEditor)[0];
    assert.equal(editor.props.referenceYear.year, year + offset);
    assert.equal(editor.props.referenceYear.startBalance, expectedStart);
    assert.equal(editor.props.referenceYear.planTarget, Math.round(expectedStart * 0.2));
    assert.equal(editor.props.referenceStartProjected, projected);
    assert.deepEqual(calls, []);
    await editor.props.onSave(0, null);
    assert.deepEqual(calls[0], { name: 'db.upsertYearlyActual', args: [year + offset, 0, null] });
    assert.deepEqual(editor.props.initial, { actualGain: null, endBalance: null });
  }
});
