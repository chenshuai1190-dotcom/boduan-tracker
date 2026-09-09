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
