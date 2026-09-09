import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';
import { buildCompoundPathModel } from '../src/lib/compoundPathModel.js';
import { buildCompoundYearDetailRows } from '../src/lib/compoundYearDetails.js';
import { resolveAnnualGoalStatus } from '../src/lib/annualGoalStatus.js';
import { MARKET_COLOR_MODES, marketTextClass } from '../src/lib/marketColorMode.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../src/pages/CompoundDetailPage.jsx');
const css = read('../src/pages/CompoundDetailPage.css');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolvePackages = code => code.replace(/from (["'])(react|lucide-react)\1/g,
  (_, _quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
const transformed = await transformWithOxc(source, 'CompoundDetailPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolvePackages(transformed.code)
  .replace(/import\s*(['"])\.\/CompoundDetailPage\.css\1;?/g, '')
  .replace(/from (["'])(\.\.\/lib\/[^'"]+\.js)\1/g, (_, _quote, path) => `from ${JSON.stringify(new URL(path.replace('../lib/', '../src/lib/'), import.meta.url).href)}`);
const { default: CompoundDetailPage } = await import(moduleUrl(compiled));

// The harness supplies persistent hook slots and commit timing. JSX, calculation
// helpers, event closures and effects themselves remain production code.
const stateReactUrl = moduleUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export * from ${JSON.stringify(import.meta.resolve('react'))};
  let values = []; let cursor = 0; let effects = []; let changed = false;
  export function resetState() { values = []; cursor = 0; effects = []; changed = false; }
  export function beginRender() { cursor = 0; changed = false; }
  function useState(initial) {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
    return [values[index], next => {
      const value = typeof next === 'function' ? next(values[index]) : next;
      if (!Object.is(values[index], value)) changed = true;
      values[index] = value;
    }];
  }
  function useRef(initial) {
    const index = cursor++;
    if (!(index in values)) values[index] = { current: initial };
    return values[index];
  }
  function useLayoutEffect(effect, dependencies) {
    const index = cursor++;
    const previous = values[index];
    if (!previous || !dependencies || dependencies.length !== previous.dependencies?.length
      || dependencies.some((dependency, offset) => !Object.is(dependency, previous.dependencies[offset]))) {
      effects.push(() => {
        previous?.cleanup?.();
        values[index] = { dependencies, cleanup: effect() };
      });
    }
  }
  export function flushLayoutEffects() {
    const pending = effects; effects = [];
    pending.forEach(effect => effect());
    return changed;
  }
  export default { ...React, useState, useRef, useLayoutEffect };
`);
const { resetState, beginRender, flushLayoutEffects } = await import(stateReactUrl);
const { default: StatefulCompoundDetailPage } = await import(moduleUrl(compiled
  .replace(`from ${JSON.stringify(import.meta.resolve('react'))}`, `from ${JSON.stringify(stateReactUrl)}`)));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}
const byClass = (tree, className) => nodes(tree, node => (node.props.className || '').split(' ').includes(className));
const chart = tree => byClass(tree, 'cp-chart')[0];
const summary = tree => byClass(tree, 'cp-selected-summary')[0];
const rowForYear = (tree, year) => nodes(tree, node => node.props['data-compound-year-row'] === year)[0];
const namedButton = (tree, label) => nodes(tree, node => node.type === 'button' && textContent(node) === label)[0];
const detailValue = (tree, label) => {
  const pair = nodes(tree, node => node.type === 'div' && React.Children.toArray(node.props.children)
    .some(child => React.isValidElement(child) && child.type === 'dt' && textContent(child) === label))[0];
  assert.ok(pair, `missing fact: ${label}`);
  return nodes(pair, node => node.type === 'dd')[0];
};
const selectedYear = tree => textContent(nodes(byClass(tree, 'cp-selected-heading')[0], node => node.type === 'strong')[0]);
const selectedAssetValue = tree => textContent(nodes(byClass(tree, 'cp-selected-asset')[0], node => node.type === 'dd')[0]);
const selectedStatus = tree => textContent(nodes(byClass(tree, 'cp-year-context')[0], node => node.type === 'span')[0]);

function fixture(overrides = {}) {
  const symbol = overrides.symbol ?? '$';
  const rate = overrides.rate ?? (symbol === '¥' ? 7.2 : 1);
  const format = value => (value * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    language: 'zh', symbol, rate, currentYear: 2027,
    startYear: 2024, totalYears: 5, startCapital: 1000, targetAnnualRate: 0.1, targetValue: 1610.51,
    money: value => `${symbol}${format(value)}`,
    signedMoney: value => `${value >= 0 ? '+' : '-'}${symbol}${format(Math.abs(value))}`,
    onBack() {},
    yearRows: [
      { year: 2024, startBalance: 1000, planTarget: 100, actualGain: 0, endBalance: 1000, isProjected: false },
      { year: 2025, startBalance: 1000, planTarget: 100, actualGain: null, endBalance: 1100, isProjected: true },
      { year: 2026, startBalance: 1100, planTarget: 110, actualGain: 50, endBalance: 1150, isProjected: false },
      { year: 2027, startBalance: 1150, planTarget: 115, actualGain: null, endBalance: 1265, isProjected: true },
      { year: 2028, startBalance: 1265, planTarget: 126.5, actualGain: 126.5, endBalance: 1391.5, isProjected: true },
    ],
    ...overrides,
  };
}

function renderPage(overrides = {}, stateful = false) {
  const props = fixture(overrides);
  let tree;
  function CapturePage() {
    if (stateful) beginRender();
    tree = (stateful ? StatefulCompoundDetailPage : CompoundDetailPage)(props);
    return tree;
  }
  const originalError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return;
    originalError(...args);
  };
  try {
    const html = renderToStaticMarkup(React.createElement(CapturePage));
    return { tree, html, props };
  } finally {
    console.error = originalError;
  }
}

function attachPageRefs(tree, events) {
  // Query only elements present in the committed JSX. This catches an effect
  // looking for the future simulation row before its view has been rendered.
  const domFor = node => ({
    get open() { return !!node.props.open; },
    set open(value) { events.push({ type: 'open', value, props: node.props }); },
    setAttribute(name, value) { events.push({ type: 'attribute', name, value, props: node.props }); },
    scrollIntoView(options) { events.push({ type: 'scroll', options, props: node.props }); },
    focus(options) { events.push({ type: 'focus', options, props: node.props }); },
    querySelector(selector) {
      const attributes = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
      const tagName = selector.match(/^[a-z]+/)?.[0];
      const classNames = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      const match = nodes(node, child => typeof child.type === 'string'
        && (!tagName || child.type === tagName)
        && attributes.every(([, name, value]) => value === undefined ? name in child.props : String(child.props[name]) === value)
        && classNames.every(name => (child.props.className || '').split(' ').includes(name)))[0];
      events.push({ type: 'query', selector, props: match?.props ?? null });
      return match ? domFor(match) : null;
    },
  });
  for (const node of nodes(tree, element => element.ref != null && typeof element.type === 'string')) {
    if (typeof node.ref === 'function') node.ref(domFor(node));
    else node.ref.current = domFor(node);
  }
}

function statefulPage(overrides = {}) {
  resetState();
  const props = fixture(overrides);
  const effects = [];
  let rendered;
  const refresh = () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      rendered = renderPage(props, true);
      attachPageRefs(rendered.tree, effects);
      const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      let changed;
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {
        matchMedia: () => ({ matches: !!overrides.reducedMotion }),
      } });
      try { changed = flushLayoutEffects(); }
      finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete globalThis.window;
      }
      if (!changed) return;
    }
    assert.fail('component effects did not settle after ten committed renders');
  };
  refresh();
  const pointerSurface = {
    getBoundingClientRect: () => ({ left: 100, width: 340 }),
    setPointerCapture(pointerId) { effects.push({ type: 'capture', pointerId }); },
    releasePointerCapture(pointerId) { effects.push({ type: 'release', pointerId }); },
    hasPointerCapture() { return true; },
  };
  return {
    get tree() { return rendered.tree; },
    get html() { return rendered.html; },
    get effects() { return effects; },
    clearEffects() { effects.length = 0; },
    key(key) {
      let prevented = false;
      chart(rendered.tree).props.onKeyDown({ key, preventDefault() { prevented = true; } });
      refresh();
      return prevented;
    },
    clickChart(clientX, bounds = { left: 100, width: 340 }) {
      chart(rendered.tree).props.onClick({ clientX, currentTarget: { getBoundingClientRect: () => bounds } });
      refresh();
    },
    clickView(key) {
      namedButton(rendered.tree, t(props.language, key)).props.onClick();
      refresh();
    },
    clickButton(label) {
      const button = namedButton(rendered.tree, label);
      assert.ok(button, `missing button: ${label}`);
      button.props.onClick();
      refresh();
    },
    pointer(phase, values = {}) {
      let prevented = false;
      const event = {
        pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true, cancelable: true,
        clientX: 300, clientY: 100, currentTarget: pointerSurface,
        preventDefault() { prevented = true; },
        ...values,
      };
      chart(rendered.tree).props[phase === 'LostPointerCapture' ? 'onLostPointerCapture' : `onPointer${phase}`](event);
      refresh();
      return prevented;
    },
    bubbleClick(matchedTarget) {
      let selector;
      rendered.tree.props.onClick({ target: { closest(value) { selector = value; return matchedTarget; } } });
      refresh();
      return selector;
    },
  };
}

test('compound details render an independent localized page with a working back button and no modal shell', () => {
  for (const language of ['zh', 'en']) {
    const calls = [];
    const onBack = () => calls.push('back');
    const { tree, html } = renderPage({ language, onBack });
    assert.equal(tree.type, 'main');
    assert.ok(tree.props.className.split(' ').includes('compound-detail-page'));
    assert.equal(tree.props['data-compound-page'], 'true');
    const headers = nodes(tree, node => node.type === 'header');
    assert.equal(headers.length, 1);
    const titles = nodes(headers[0], node => ['h1', 'h2'].includes(node.type));
    assert.equal(titles.length, 1);
    assert.equal(textContent(titles[0]), t(language, 'review.compoundTitle', '', { years: 5 }));
    const backButtons = nodes(headers[0], node => node.type === 'button');
    assert.equal(backButtons.length, 1);
    const back = backButtons[0];
    assert.equal(back.props.type, 'button');
    assert.equal(back.props.onClick, onBack);
    assert.equal(back.props['aria-label'], t(language, 'review.backToGoals'));
    back.props.onClick();
    assert.deepEqual(calls, ['back']);
    assert.equal(nodes(tree, node => node.props['data-compound-detail'] === 'true').length, 1);
    assert.equal(nodes(tree, node => node.props.role === 'dialog' || node.props['aria-modal']).length, 0);
    assert.doesNotMatch(html, /role="dialog"|aria-modal|review-goal-modal|rgm-close|rgm-action/);
  }
  assert.doesNotMatch(source, /ReviewGoalModal|ActionModalCard|createPortal|onClose/);
});

test('target dollars and cents remain exact and separate in both languages and currencies', () => {
  for (const language of ['zh', 'en']) {
    for (const [symbol, expectedMain, expectedDecimal] of [['$', '$14,860,167', '.41'], ['¥', '¥106,993,205', '.35']]) {
      const { tree, props } = renderPage({ language, symbol, targetValue: 14860167.41 });
      const target = byClass(tree, 'cp-target')[0];
      assert.deepEqual(React.Children.toArray(target.props.children).map(textContent), [expectedMain, expectedDecimal]);
      assert.equal(textContent(target), props.money(props.targetValue));
      assert.equal(textContent(byClass(tree, 'cp-decimal')[0]), expectedDecimal);
      assert.equal(textContent(byClass(tree, 'cp-context')[0]), `2024 — 2028${symbol === '¥' ? 'CNY' : 'USD'}`);
      assert.equal(byClass(tree, 'cp-hero')[0].props['aria-label'], t(language, 'review.compoundGoal', '', { years: 5 }));
      assert.equal(textContent(detailValue(tree, t(language, 'review.initialCapitalShort'))), props.money(props.startCapital));
    }
  }
});

test('execution is the default and both localized buttons switch actual JSX views with pressed state', () => {
  for (const language of ['zh', 'en']) {
    for (const initialView of [undefined, 'execution', 'invalid', 'simulation']) {
      const modal = statefulPage({ language, initialView });
      const assertView = view => {
        assert.equal(nodes(modal.tree, node => node.props[`data-compound-${view}`] === 'true').length, 1);
        assert.equal(nodes(modal.tree, node => node.props[`data-compound-${view === 'execution' ? 'simulation' : 'execution'}`] === 'true').length, 0);
        for (const [key, value] of [['review.compoundAnnualExecution', 'execution'], ['review.compoundProjection', 'simulation']]) {
          const button = namedButton(modal.tree, t(language, key));
          assert.equal(button.props.type, 'button');
          assert.equal(button.props['aria-pressed'], view === value);
        }
      };
      assertView(initialView === 'simulation' ? 'simulation' : 'execution');
      modal.clickView('review.compoundProjection');
      assertView('simulation');
      assert.ok(modal.html.includes(t(language, 'review.compoundSimulationBasis')));
      modal.clickView('review.compoundAnnualExecution');
      assertView('execution');
      assert.ok(modal.html.includes(t(language, 'review.compoundAnnualRolling')));
    }
  }
});

test('the chart defaults to the latest recorded year and keeps gaps separate from projected balances', () => {
  const { tree, props } = renderPage();
  const model = buildCompoundPathModel(props);
  assert.equal(chart(tree).props['aria-valuenow'], model.latestActualIndex);
  assert.equal(selectedYear(tree), '2026');
  assert.equal(selectedAssetValue(tree), '$1,150.00');
  assert.ok(textContent(byClass(tree, 'cp-selected-heading')[0]).includes(t('zh', 'review.compoundLatest')));
  const actual = byClass(tree, 'cp-actual-line')[0];
  assert.deepEqual(actual.props.d.match(/[ML]/g), ['M', 'M'], 'a missing year must break the actual line');
  assert.equal(byClass(tree, 'cp-actual-dot').length, 2);
  assert.equal(byClass(tree, 'cp-plan-line')[0].props.d.match(/[ML]/g).length, model.points.length);
  assert.doesNotMatch(actual.props.d, /NaN|Infinity/);
  assert.equal(summary(tree).props['aria-live'], 'polite');

  const consecutive = fixture().yearRows.map(row => row.year === 2025 ? { ...row, actualGain: 10, endBalance: 1010, isProjected: false } : row);
  const connected = renderPage({ yearRows: consecutive }).tree;
  assert.deepEqual(byClass(connected, 'cp-actual-line')[0].props.d.match(/[ML]/g), ['M', 'L', 'L']);
});

test('future rows and projected-only values never become actual chart points or a latest record', () => {
  const props = fixture();
  const futureRecorded = props.yearRows.map(row => row.year === 2028 ? { ...row, isProjected: false } : row);
  const future = renderPage({ yearRows: futureRecorded }).tree;
  assert.equal(selectedYear(future), '2026');
  assert.equal(byClass(future, 'cp-actual-dot').length, 2);
  const projected = statefulPage({ yearRows: props.yearRows.map(row => ({ ...row, isProjected: true })) });
  assert.equal(selectedYear(projected.tree), '2028');
  assert.equal(selectedAssetValue(projected.tree), props.money(buildCompoundPathModel(props).points.at(-1).plannedValue));
  assert.equal(summary(projected.tree).props['data-compound-selection'], 'future');
  assert.equal(selectedStatus(projected.tree), t('zh', 'review.compoundForecastOnly'));
  assert.equal(byClass(projected.tree, 'cp-actual-line')[0].props.d.trim(), '');
  assert.equal(byClass(projected.tree, 'cp-actual-dot').length, 0);
  assert.ok(!textContent(byClass(projected.tree, 'cp-selected-heading')[0]).includes(t('zh', 'review.compoundLatest')));
});

test('recorded zero balances and gains display as zero while missing data stays an em dash', () => {
  for (const language of ['zh', 'en']) {
    const props = fixture();
    const yearRows = props.yearRows.map(row => row.year === 2026 ? { ...row, actualGain: -1100, endBalance: 0 } : row);
    const modal = statefulPage({ language, yearRows });
    assert.equal(selectedAssetValue(modal.tree, language), '$0.00');
    assert.equal(byClass(modal.tree, 'cp-actual-dot').length, 2, 'a recorded zero balance remains a real point');
    const zeroGainRow = rowForYear(modal.tree, 2024);
    assert.equal(textContent(detailValue(zeroGainRow, t(language, 'review.actualGain'))), '+$0.00');
    assert.equal(textContent(detailValue(zeroGainRow, t(language, 'review.actualGrowthRate'))), '+0.0%');
    assert.equal(textContent(detailValue(zeroGainRow, t(language, 'review.compoundAnnualCompletion'))), '0.0%');
    const missingRow = rowForYear(modal.tree, 2025);
    for (const key of ['review.actualGain', 'review.actualGrowthRate', 'review.compoundAnnualCompletion']) {
      assert.equal(textContent(detailValue(missingRow, t(language, key))), '—');
    }
    modal.key('ArrowLeft');
    assert.equal(selectedYear(modal.tree), '2025');
    assert.equal(selectedAssetValue(modal.tree, language), '—');
    assert.equal(textContent(detailValue(summary(modal.tree), t(language, 'review.compoundVsOriginal'))), '—');
    assert.equal(detailValue(summary(modal.tree), t(language, 'review.compoundVsOriginal')).props.className, '');
  }
});

test('chart clicks use the visible SVG bounds, clamp both ends and ignore a zero-width surface', () => {
  const modal = statefulPage();
  modal.clickChart(1000);
  assert.equal(selectedYear(modal.tree), '2028');
  assert.equal(chart(modal.tree).props['aria-valuenow'], 5);
  modal.clickChart(-1000);
  assert.equal(selectedYear(modal.tree), t('zh', 'review.start'));
  assert.equal(chart(modal.tree).props['aria-valuenow'], 0);
  const planCoordinates = [...byClass(modal.tree, 'cp-plan-line')[0].props.d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)];
  modal.clickChart(100 + Number(planCoordinates[2][1]) * 2, { left: 100, width: 680 });
  assert.equal(selectedYear(modal.tree), '2025', 'a scaled SVG still maps its visible coordinate to the right year');
  modal.clickChart(1000, { left: 100, width: 0 });
  assert.equal(selectedYear(modal.tree), '2025');
});

test('horizontal gestures wait for six pixels, track across years, clamp and suppress only their following click', () => {
  const page = statefulPage();
  page.key('Home');
  page.clearEffects();
  assert.equal(page.pointer('Down', { clientX: 300, clientY: 100 }), false);
  assert.equal(selectedYear(page.tree), t('zh', 'review.start'), 'touch down alone must not select a year');
  assert.equal(page.pointer('Move', { clientX: 305, clientY: 102 }), false);
  assert.equal(selectedYear(page.tree), t('zh', 'review.start'));
  assert.deepEqual(page.effects, []);
  assert.equal(page.pointer('Move', { clientX: 306, clientY: 102 }), true);
  assert.equal(selectedYear(page.tree), '2026');
  assert.deepEqual(page.effects, [{ type: 'capture', pointerId: 1 }]);
  assert.equal(page.pointer('Move', { clientX: 1000, clientY: 1000 }), true);
  assert.equal(selectedYear(page.tree), '2028', 'horizontal intent stays locked even when subsequent vertical movement grows');
  page.pointer('Up', { clientX: -1000, clientY: 1000 });
  assert.equal(selectedYear(page.tree), t('zh', 'review.start'));
  assert.deepEqual(page.effects.filter(event => event.type === 'release'), [{ type: 'release', pointerId: 1 }]);
  page.clickChart(1000);
  assert.equal(selectedYear(page.tree), t('zh', 'review.start'), 'the browser click synthesized after dragging is ignored');
  page.clickChart(1000);
  assert.equal(selectedYear(page.tree), '2028', 'an independent click remains usable after suppression is consumed');
  assert.equal(page.effects.some(event => ['open', 'scroll', 'focus', 'query'].includes(event.type)), false);
});

test('vertical gestures preserve the selected year and native scrolling even after lateral movement', () => {
  const page = statefulPage();
  page.clearEffects();
  assert.equal(page.pointer('Down', { clientX: 100, clientY: 100 }), false);
  assert.equal(page.pointer('Move', { clientX: 104, clientY: 106 }), false);
  assert.equal(page.pointer('Move', { clientX: 1000, clientY: 108 }), false);
  assert.equal(selectedYear(page.tree), '2026');
  assert.equal(page.effects.some(event => event.type === 'capture'), false);
  assert.equal(page.pointer('Up', { clientX: 1000, clientY: 108 }), false);
  page.clickChart(1000);
  assert.equal(selectedYear(page.tree), '2026', 'a scrolling gesture cannot turn its trailing click into a chart selection');
  page.pointer('Down', { clientX: 430, clientY: 100 });
  page.pointer('Up', { clientX: 430, clientY: 100 });
  page.clickChart(430);
  assert.equal(selectedYear(page.tree), '2028', 'a fresh tap works after a vertical gesture');
  assert.equal(page.effects.some(event => ['open', 'scroll', 'focus', 'query'].includes(event.type)), false);
});

test('pointer cancellation and lost capture retain selection and a fresh gesture remains available', () => {
  for (const phase of ['Cancel', 'LostPointerCapture']) {
    const page = statefulPage();
    page.pointer('Down', { clientX: 100, clientY: 100 });
    page.pointer('Move', { clientX: 430, clientY: 100 });
    assert.equal(selectedYear(page.tree), '2028');
    assert.equal(page.pointer(phase), false);
    assert.equal(selectedYear(page.tree), '2028');
    page.pointer('Move', { clientX: -1000, clientY: 100 });
    page.pointer('Up', { clientX: -1000, clientY: 100 });
    page.clickChart(-1000);
    assert.equal(selectedYear(page.tree), '2028');
    page.pointer('Down', { clientX: 142, clientY: 100 });
    page.pointer('Up', { clientX: 142, clientY: 100 });
    page.clickChart(142);
    assert.equal(selectedYear(page.tree), t('zh', 'review.start'));
  }
});

test('non-primary buttons and unrelated pointer IDs cannot steer an active chart gesture', () => {
  for (const values of [{ button: 2 }, { isPrimary: false }]) {
    const page = statefulPage();
    page.pointer('Down', values);
    assert.equal(page.pointer('Move', { clientX: 1000 }), false);
    page.pointer('Up', { clientX: 1000 });
    assert.equal(selectedYear(page.tree), '2026');
    assert.deepEqual(page.effects, []);
  }
  const page = statefulPage();
  page.pointer('Down', { pointerId: 7 });
  assert.equal(page.pointer('Move', { pointerId: 8, clientX: 1000 }), false);
  page.pointer('Cancel', { pointerId: 8 });
  assert.equal(selectedYear(page.tree), '2026');
  assert.equal(page.pointer('Move', { pointerId: 7, clientX: 430, cancelable: false }), false);
  assert.equal(selectedYear(page.tree), '2028', 'the owning pointer can still select on a noncancelable event');
});

test('selection summaries distinguish past records, missing years, future projections and initial principal', () => {
  for (const language of ['zh', 'en']) {
    const page = statefulPage({ language });
    assert.equal(summary(page.tree).props['data-compound-selection'], 'past');
    assert.equal(selectedStatus(page.tree), t(language, 'review.compoundLatest'));
    page.key('Home');
    assert.equal(summary(page.tree).props['data-compound-selection'], 'start');
    assert.equal(selectedStatus(page.tree), '');
    assert.equal(textContent(byClass(page.tree, 'cp-year-context')[0]), t(language, 'review.start'), 'the starting label is not repeated as a second status');
    assert.equal(textContent(detailValue(summary(page.tree), t(language, 'review.initialCapitalShort'))), '$1,000.00');
    assert.equal(chart(page.tree).props['aria-valuetext'], t(language, 'review.compoundChartStart', '', { principal: '$1,000.00' }));
    assert.equal(byClass(page.tree, 'cp-selected-facts').length, 0);
    assert.equal(byClass(page.tree, 'cp-open-year').length, 0);
    page.key('ArrowRight');
    assert.equal(selectedStatus(page.tree), t(language, 'review.compoundHistoricalRecord'));
    assert.equal(textContent(detailValue(summary(page.tree), t(language, 'review.actualEndingAssets'))), '$1,000.00');
    page.key('ArrowRight');
    assert.equal(selectedStatus(page.tree), t(language, 'review.compoundUnrecorded'));
    assert.equal(selectedAssetValue(page.tree), '—');
    assert.equal(textContent(detailValue(summary(page.tree), t(language, 'review.compoundVsOriginal'))), '—');
    page.key('End');
    assert.equal(summary(page.tree).props['data-compound-selection'], 'future');
    assert.equal(selectedStatus(page.tree), t(language, 'review.compoundForecastOnly'));
    const labels = nodes(summary(page.tree), node => node.type === 'dt').map(textContent);
    assert.deepEqual(labels, [t(language, 'review.compoundProjectedAssets'), t(language, 'review.initialCapitalShort'), t(language, 'review.compoundProjectedGain')]);
    assert.equal(selectedAssetValue(page.tree), '$1,611.00');
    assert.equal(chart(page.tree).props['aria-valuetext'], t(language, 'review.compoundChartForecast', '', { year: 2028, planned: '$1,611.00' }));
    assert.ok(!textContent(summary(page.tree)).includes('—'), 'a future projection has no empty actual-data fields');
    assert.equal(textContent(byClass(page.tree, 'cp-selected-year')[0]), '2028');
    assert.equal(byClass(page.tree, 'cp-plan-dot')[0].props.r, 5);
  }
});

test('current-year assets show remaining or exceeded original target amounts without a premature behind verdict', () => {
  for (const language of ['zh', 'en']) {
    for (const [endBalance, labelKey, expectedAmount] of [[1200, 'review.compoundUntilYearEnd', '$264.00'], [1464, 'review.compoundAboveYearEnd', '+$0.00'], [1500, 'review.compoundAboveYearEnd', '+$36.00']]) {
      const yearRows = fixture().yearRows.map(row => row.year === 2027 ? { ...row, actualGain: endBalance - row.startBalance, endBalance, isProjected: false } : row);
      const { tree } = renderPage({ language, yearRows });
      assert.equal(selectedYear(tree), '2027');
      assert.equal(summary(tree).props['data-compound-selection'], 'current');
      assert.equal(selectedStatus(tree), t(language, 'review.compoundCurrentRecord'));
      assert.equal(textContent(detailValue(summary(tree), t(language, 'review.compoundCurrentAssets'))), fixture().money(endBalance));
      const difference = detailValue(summary(tree), t(language, labelKey));
      assert.equal(textContent(difference), expectedAmount);
      if (endBalance < 1464) assert.equal(difference.props.className, '', 'remaining target is neutral rather than a realized loss');
      assert.ok(!textContent(summary(tree)).includes(t(language, 'review.behind')));
    }
    const missingCurrent = statefulPage({ language });
    missingCurrent.key('End');
    missingCurrent.key('ArrowLeft');
    assert.equal(summary(missingCurrent.tree).props['data-compound-selection'], 'current');
    assert.equal(selectedStatus(missingCurrent.tree), t(language, 'review.compoundUnrecorded'));
    assert.equal(selectedAssetValue(missingCurrent.tree), '—');
  }
});

test('the reset button restores the latest record or default projection without scrolling', () => {
  for (const language of ['zh', 'en']) {
    for (const hasRecords of [true, false]) {
      const yearRows = hasRecords ? fixture().yearRows : [];
      const page = statefulPage({ language, yearRows });
      const label = t(language, hasRecords ? 'review.compoundResetLatest' : 'review.compoundResetDefault');
      assert.equal(namedButton(page.tree, label).props.disabled, true);
      page.key('Home');
      assert.equal(namedButton(page.tree, label).props.disabled, false);
      page.clearEffects();
      page.clickButton(label);
      assert.equal(selectedYear(page.tree), hasRecords ? '2026' : '2028');
      assert.equal(namedButton(page.tree, label).props.disabled, true);
      assert.equal(byClass(page.tree, 'cp-selected-year').length, 0);
      assert.equal(byClass(page.tree, 'cp-plan-dot')[0].props.r, 3);
      assert.deepEqual(page.effects, []);
    }
  }
});

test('only the year CTA commits the required view then opens, focuses and scrolls its matching row', () => {
  for (const language of ['zh', 'en']) {
    for (const reducedMotion of [false, true]) {
      for (const [index, year, targetView] of [[1, 2024, 'execution'], [4, 2027, 'execution'], [5, 2028, 'simulation']]) {
        const initialView = targetView === 'execution' ? 'simulation' : 'execution';
        const page = statefulPage({ language, reducedMotion, initialView });
        page.key('Home');
        for (let step = 0; step < index; step += 1) page.key('ArrowRight');
        const rowId = `cp-${targetView}-year-${year}`;
        const cta = byClass(page.tree, 'cp-open-year')[0];
        const label = t(language, targetView === 'simulation' ? 'review.compoundViewProjectionYear' : 'review.compoundViewYear', '', { year });
        assert.equal(textContent(cta), label);
        assert.equal(cta.props['aria-controls'], rowId);
        assert.equal(nodes(page.tree, node => node.props.id === rowId).length, 0, 'the other view has not been mounted yet');
        assert.deepEqual(page.effects, [], 'year selection alone does not query, expand, focus or scroll rows');
        page.clickButton(label);
        assert.equal(selectedYear(page.tree), String(year));
        assert.equal(nodes(page.tree, node => node.props[`data-compound-${targetView}`] === 'true').length, 1);
        assert.equal(rowForYear(page.tree, year).props.id, rowId);
        assert.equal(rowForYear(page.tree, year).props['data-selected'], true);
        const open = page.effects.filter(event => event.type === 'open');
        assert.equal(open.length, 1);
        assert.equal(open[0].props.id, rowId, 'the committed matching view is queried by its ref');
        assert.equal(open[0].value, true);
        assert.equal(page.effects.filter(event => event.type === 'focus').length, 1);
        assert.deepEqual(page.effects.find(event => event.type === 'focus').options, { preventScroll: true });
        const scroll = page.effects.filter(event => event.type === 'scroll');
        assert.equal(scroll.length, 1);
        assert.equal(scroll[0].props.id, rowId);
        assert.deepEqual(scroll[0].options, { block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' });
        assert.equal(page.effects.some(event => event.type === 'query' && event.props === null), false);
        page.clearEffects();
        page.clickButton(label);
        assert.equal(page.effects.filter(event => event.type === 'scroll').length, 1, 'the same CTA works again after its previous effect completes');
        assert.doesNotMatch(page.html, /role="dialog"|aria-modal/);
      }
    }
  }
  const empty = renderPage({ startCapital: undefined }).tree;
  assert.equal(summary(empty).props['data-compound-selection'], 'empty');
  assert.equal(selectedStatus(empty), '');
  assert.equal(byClass(empty, 'cp-open-year').length, 0);
});

test('annual rows use the chart model eligibility so blank, invalid and future inputs never masquerade as actuals', () => {
  for (const [field, invalidValues] of [['actualGain', [null, undefined, '', ' ', NaN, Infinity]], ['endBalance', [null, undefined, '', ' ', NaN, Infinity]]]) {
    for (const value of invalidValues) {
      const yearRows = fixture().yearRows.map(row => row.year === 2026 ? { ...row, [field]: value, isProjected: false } : row);
      const page = statefulPage({ yearRows });
      assert.equal(selectedYear(page.tree), '2024');
      page.key('ArrowRight');
      page.key('ArrowRight');
      assert.equal(selectedYear(page.tree), '2026');
      assert.equal(selectedAssetValue(page.tree), '—');
      const row = rowForYear(page.tree, 2026);
      assert.equal(textContent(byClass(row, 'cp-year-status')[0]), t('zh', 'review.pending'));
      for (const key of ['review.actualGain', 'review.actualGrowthRate', 'review.compoundAnnualCompletion']) {
        assert.equal(textContent(detailValue(row, t('zh', key))), '—', `${field}=${String(value)} must remain unrecorded`);
      }
    }
  }
  const yearRows = fixture().yearRows.map(row => row.year === 2028 ? { ...row, actualGain: 0, endBalance: 0, isProjected: false } : row);
  const { tree } = renderPage({ yearRows });
  const future = rowForYear(tree, 2028);
  assert.equal(textContent(byClass(future, 'cp-year-status')[0]), t('zh', 'review.notStarted'));
  assert.equal(textContent(detailValue(future, t('zh', 'review.actualGain'))), '—');
  assert.equal(byClass(tree, 'cp-actual-dot').length, 2);
});

test('keyboard year selection is accessible, bounded, and Escape restores the latest record', () => {
  for (const language of ['zh', 'en']) {
    const modal = statefulPage({ language });
    const svg = chart(modal.tree);
    assert.equal(svg.props.role, 'slider');
    assert.equal(svg.props.tabIndex, 0);
    assert.equal(svg.props['aria-label'], t(language, 'review.compoundChartYear'));
    assert.equal(svg.props['aria-valuemin'], 0);
    assert.equal(svg.props['aria-valuemax'], 5);
    assert.ok(svg.props['aria-valuetext'].includes('2026'));
    assert.ok(svg.props['aria-valuetext'].includes('$1,150.00'));
    for (const [key, expected] of [['ArrowLeft', 2], ['ArrowDown', 1], ['ArrowRight', 2], ['ArrowUp', 3], ['Home', 0], ['ArrowLeft', 0], ['End', 5], ['ArrowRight', 5]]) {
      assert.equal(modal.key(key), true);
      assert.equal(chart(modal.tree).props['aria-valuenow'], expected);
    }
    assert.equal(modal.key('Tab'), false);
    assert.equal(selectedYear(modal.tree), '2028');
    assert.equal(modal.key('Escape'), true);
    assert.equal(selectedYear(modal.tree), '2026');
    assert.ok(textContent(byClass(modal.tree, 'cp-selected-heading')[0]).includes(t(language, 'review.compoundLatest')));
  }
});

test('pointer focus has no chart outline while keyboard focus retains its visible indicator and year controls', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), declarations: match[2] }));
  const baseIndex = rules.findIndex(rule => rule.selector === '.compound-detail-page .cp-chart');
  const focusIndex = rules.findIndex(rule => rule.selector === '.compound-detail-page .cp-chart:focus');
  const keyboardIndex = rules.findIndex(rule => rule.selector === '.compound-detail-page .cp-chart:focus-visible');
  assert.ok(baseIndex >= 0 && focusIndex > baseIndex && keyboardIndex > focusIndex, 'equal-specificity keyboard focus must override the general focus reset');
  assert.match(rules[baseIndex].declarations, /(?:^|;)\s*outline:\s*none\s*;/);
  assert.match(rules[focusIndex].declarations, /(?:^|;)\s*outline:\s*none\s*;/);
  assert.doesNotMatch(rules[focusIndex].declarations, /!important/);
  assert.match(rules[keyboardIndex].declarations, /outline:\s*1px solid #9696a0\s*;/);
  assert.match(rules[keyboardIndex].declarations, /outline-offset:\s*4px\s*;/);
  assert.doesNotMatch(source, /\.blur\s*\(/, 'focus styling must not remove focus from the interactive chart');
  for (const pointerType of ['touch', 'mouse']) {
    const page = statefulPage();
    const svg = chart(page.tree);
    assert.equal(svg.props.tabIndex, 0);
    assert.equal(svg.props.role, 'slider');
    assert.equal(svg.props.onFocus, undefined, 'focus alone must not reset or dismiss chart interaction');
    for (const eventName of ['onKeyDown', 'onClick', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) {
      assert.equal(typeof svg.props[eventName], 'function', `${eventName} stays available after the style fix`);
    }
    assert.equal(page.pointer('Down', { pointerType, clientX: 430 }), false);
    assert.equal(page.pointer('Up', { pointerType, clientX: 430 }), false);
    page.clickChart(430);
    assert.equal(selectedYear(page.tree), '2028');
    assert.equal(page.key('ArrowLeft'), true);
    assert.equal(selectedYear(page.tree), '2027', 'keyboard selection remains available after pointer use');
    assert.equal(page.key('Escape'), true);
    assert.equal(selectedYear(page.tree), '2026');
  }
});

test('reading the header or page resets chart selection while the closest guard preserves child interactions', () => {
  const modal = statefulPage();
  assert.equal(modal.tree.type, 'main');
  assert.equal(typeof modal.tree.props.onClick, 'function');
  const header = React.Children.toArray(modal.tree.props.children).find(node => node.type === 'header');
  assert.ok(header, 'the page header must be inside the main click-reset boundary');
  assert.equal(header.props.onClick, undefined, 'header clicks bubble to the page handler');
  const title = nodes(header, node => node.type === 'h1')[0];
  assert.ok(title);
  assert.equal(title.props.onClick, undefined, 'title clicks bubble to the page handler');
  modal.key('End');
  for (const target of [{ kind: 'chart' }, { kind: 'tab-button' }, { kind: 'year-summary' }, { kind: 'selected-summary' }, { kind: 'year-row' }]) {
    const selector = modal.bubbleClick(target);
    for (const guarded of ['.cp-chart', '.cp-selected-summary', '.cp-year-row', 'button', 'summary']) assert.ok(selector.split(',').map(value => value.trim()).includes(guarded));
    assert.equal(selectedYear(modal.tree), '2028', `${target.kind} bubbling must not clear the selection`);
  }
  modal.bubbleClick(null);
  assert.equal(selectedYear(modal.tree), '2026');
  assert.ok(textContent(byClass(modal.tree, 'cp-selected-heading')[0]).includes(t('zh', 'review.compoundLatest')));
});

test('year expansion stays native and read-only within the page without dialogs or mutating controls', () => {
  const writes = [];
  const yearRows = Object.freeze(fixture().yearRows.map(row => Object.freeze({ ...row })));
  const before = structuredClone(yearRows);
  const props = Object.freeze({ yearRows, onSave: value => writes.push(value), onDelete: () => writes.push('delete') });
  const modal = statefulPage(props);
  for (const view of ['review.compoundAnnualExecution', 'review.compoundProjection']) {
    modal.clickView(view);
    assert.doesNotMatch(modal.html, /role="dialog"|aria-modal/);
    assert.equal(nodes(modal.tree, node => node.type === 'details').length, 5);
    for (const detail of nodes(modal.tree, node => node.type === 'details')) {
      assert.equal(detail.props.open, undefined, 'each year starts as a collapsed native disclosure');
      assert.equal(detail.props.onClick, undefined);
      assert.equal(detail.props.onToggle, undefined);
      const summaryNodes = nodes(detail, node => node.type === 'summary');
      assert.equal(summaryNodes.length, 1);
      assert.ok(textContent(summaryNodes[0]));
      assert.equal(summaryNodes[0].props.onClick, undefined);
      assert.equal(nodes(detail, node => node.type === 'dl').length, 1);
    }
    assert.equal(nodes(modal.tree, node => ['input', 'textarea', 'select', 'form'].includes(node.type)).length, 0);
    modal.key('Home');
    modal.bubbleClick(null);
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(yearRows, before);
  assert.doesNotMatch(source, /\bdb\.|supabase|\bfetch\s*\(|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves/);
});

test('execution and simulation rows render shared helper outputs without changing their amount basis', () => {
  for (const symbol of ['$', '¥']) {
    const props = fixture({ symbol });
    const execution = renderPage(props).tree;
    for (const row of buildCompoundYearDetailRows(props.yearRows, { currentYear: props.currentYear })) {
      const rendered = rowForYear(execution, row.year);
      const value = nodes(byClass(rendered, 'cp-row-value')[0], node => node.type === 'strong')[0];
      assert.equal(textContent(value), props.money(row.hasActual ? row.actualEndBalance : row.targetEndBalance));
      assert.equal(textContent(detailValue(rendered, t('zh', 'review.plannedGain'))), props.signedMoney(row.planTarget));
    }
    const simulation = renderPage({ ...props, initialView: 'simulation' }).tree;
    const rows = nodes(simulation, node => node.type === 'details');
    const model = buildCompoundPathModel(props);
    assert.equal(rows.length, model.simulationRows.length);
    model.simulationRows.forEach((row, index) => {
      assert.equal(textContent(nodes(byClass(rows[index], 'cp-row-year')[0], node => node.type === 'strong')[0]), String(row.year));
      assert.equal(textContent(nodes(byClass(rows[index], 'cp-row-value')[0], node => node.type === 'strong')[0]), props.money(row.endBalance));
      assert.ok(textContent(byClass(rows[index], 'cp-row-value')[0]).includes(props.signedMoney(row.annualGain)));
    });
  }
});

test('current progress and cent-accurate achieved or exceeded statuses follow the shared status helper', () => {
  for (const language of ['zh', 'en']) {
    for (const [actualGain, expectedKey] of [[20, 'review.compoundInProgress'], [100, 'review.reached'], [100.004, 'review.reached'], [100.01, 'review.exceeded']]) {
      const yearRows = [{ year: 2027, startBalance: 1000, planTarget: 100, actualGain, endBalance: 1000 + actualGain, isProjected: false }];
      const row = rowForYear(renderPage({ language, yearRows }).tree, 2027);
      const status = resolveAnnualGoalStatus(actualGain, 100);
      const expected = status === 'behind' ? t(language, 'review.compoundInProgress') : t(language, `review.${status}`);
      assert.equal(textContent(byClass(row, 'cp-year-status')[0]), expected);
      assert.equal(expected, t(language, expectedKey));
      assert.equal(row.props['data-current'], true);
      assert.ok(textContent(nodes(row, node => node.type === 'summary')[0]).includes(t(language, 'review.thisYear')));
    }
    const { tree } = renderPage({ language });
    assert.equal(textContent(byClass(rowForYear(tree, 2024), 'cp-year-status')[0]), t(language, 'review.behind'));
    assert.equal(textContent(byClass(rowForYear(tree, 2025), 'cp-year-status')[0]), t(language, 'review.pending'));
    assert.equal(textContent(byClass(rowForYear(tree, 2028), 'cp-year-status')[0]), t(language, 'review.notStarted'));
  }
  assert.match(source, /resolveAnnualGoalStatus\(row\.actualGain, row\.planTarget\)/);
});

test('market colors preserve financial differences and keep both chart paths neutral', () => {
  for (const marketColorMode of Object.values(MARKET_COLOR_MODES)) {
    const { tree, props } = renderPage({ marketColorMode });
    const point = buildCompoundPathModel(props).points[chart(tree).props['aria-valuenow']];
    const difference = detailValue(summary(tree), t('zh', 'review.compoundVsOriginal'));
    assert.equal(difference.props.className, marketTextClass(point.actualValue - point.plannedValue, marketColorMode));
    for (const className of ['cp-plan-line', 'cp-actual-line', 'cp-actual-dot']) {
      for (const node of byClass(tree, className)) {
        assert.equal(node.props.className, className);
        assert.equal(node.props.style, undefined);
      }
    }
  }
});

test('target and projected cumulative gains follow both market color modes with genuine zero kept neutral', () => {
  for (const language of ['zh', 'en']) {
    for (const [marketColorMode, positiveClass, negativeClass] of [
      [MARKET_COLOR_MODES.RED_UP_GREEN_DOWN, 'text-[#ff4b1f]', 'text-emerald-400'],
      [MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, 'text-emerald-400', 'text-[#ff4b1f]'],
    ]) {
      for (const [targetAnnualRate, targetValue, expectedClass] of [[0.1, 1610.51, positiveClass], [-0.1, 590.49, negativeClass], [0, 1000, '']]) {
        const { tree, props } = renderPage({ language, marketColorMode, targetAnnualRate, targetValue, yearRows: [], initialView: 'simulation' });
        const assertGain = (scope, label, amount) => {
          const dd = detailValue(scope, t(language, label));
          const spans = nodes(dd, node => node.type === 'span');
          assert.equal(spans.length, 1, 'gain colors belong on an inner amount span, not the high-specificity neutral dd');
          assert.equal(spans[0].props.className, expectedClass);
          assert.equal(textContent(dd), props.signedMoney(amount));
        };
        const model = buildCompoundPathModel(props);
        assertGain(byClass(tree, 'cp-hero')[0], 'review.compoundTargetGain', targetValue - props.startCapital);
        assert.equal(summary(tree).props['data-compound-selection'], 'future');
        assertGain(summary(tree), 'review.compoundProjectedGain', model.points.at(-1).plannedValue - props.startCapital);
        for (const row of model.simulationRows) assertGain(rowForYear(tree, row.year), 'review.compoundTargetGain', row.endBalance - props.startCapital);
        const initialCapital = detailValue(byClass(tree, 'cp-hero')[0], t(language, 'review.initialCapitalShort'));
        assert.equal(initialCapital.props.className, undefined, 'principal must not inherit gain colors');
      }
    }
  }
  assert.match(css, /\.compound-detail-page \.cp-facts dd\s*\{[^}]*color:\s*#bbbcc5;/, 'neutral fact styling stays intact while the child gain span controls its own color');
});

test('missing or invalid cumulative gain inputs remain neutral and do not become zero or a colored gain', () => {
  for (const marketColorMode of Object.values(MARKET_COLOR_MODES)) {
    for (const [field, values] of [['targetValue', [null, undefined, '', ' ', NaN, Infinity]], ['startCapital', [null, undefined, '', ' ', NaN, Infinity]]]) {
      for (const value of values) {
        const { tree } = renderPage({ marketColorMode, [field]: value, yearRows: [], initialView: 'simulation' });
        const gain = detailValue(byClass(tree, 'cp-hero')[0], t('zh', 'review.compoundTargetGain'));
        assert.equal(textContent(gain), '—', `${field}=${String(value)} must not become a zero gain`);
        assert.equal(nodes(gain, node => node.type === 'span')[0].props.className, '');
        if (field === 'startCapital') {
          assert.equal(nodes(tree, node => node.type === 'details').length, 0, 'invalid principal must not manufacture simulation gains');
          assert.equal(nodes(summary(tree), node => node.type === 'dt' && textContent(node) === t('zh', 'review.compoundProjectedGain')).length, 0);
        }
      }
    }
  }
});

test('invalid plan presentation has an explicit chart empty state and missing target rather than NaN or zero', () => {
  const { tree, html } = renderPage({ startCapital: undefined, targetValue: undefined, targetAnnualRate: undefined });
  assert.equal(chart(tree), undefined);
  assert.equal(textContent(byClass(tree, 'cp-chart-empty')[0]), t('zh', 'review.compoundChartEmpty'));
  assert.equal(textContent(byClass(tree, 'cp-target')[0]), '—');
  assert.equal(selectedAssetValue(tree), '—');
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('compound styles are scoped to the page, keep a 300px chart and avoid gold glow', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selectors: match[1], declarations: match[2] }));
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule.selectors.split(',').every(selector => /^\.compound-detail-page(?:\s|$)/.test(selector.trim())), rule.selectors);
    assert.doesNotMatch(rule.declarations.replace(/scroll-margin-top:[^;]+;/g, ''), /position:\s*fixed|z-index\s*:|100dvh|100vh|safe-area-inset|backdrop-filter/);
  }
  const chartRule = rules.find(rule => rule.selectors.trim() === '.compound-detail-page .cp-chart');
  assert.match(chartRule.declarations, /height:\s*300px/);
  assert.match(chartRule.declarations, /touch-action:\s*pan-y/);
  const selectionRule = rules.find(rule => rule.selectors.trim() === '.compound-detail-page .cp-selected-summary');
  assert.match(selectionRule.declarations, /min-height:\s*270px/, 'the short starting summary keeps the chart section height stable');
  assert.doesNotMatch(css, /#f6b54b|#d4af37|gold|amber|box-shadow|text-shadow|drop-shadow|linear-gradient|animation\s*:/i);
  const actualRule = rules.find(rule => rule.selectors.trim() === '.compound-detail-page .cp-actual-line');
  const stroke = actualRule.declarations.match(/stroke:\s*#([a-f\d]{6})/i)?.[1];
  assert.ok(stroke, 'the actual path must retain its explicit neutral stroke');
  const channels = [0, 2, 4].map(offset => parseInt(stroke.slice(offset, offset + 2), 16));
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 16);
  assert.match(css, /\.cp-year-row\[open\] summary > svg/);
  assert.match(css, /prefers-reduced-motion/);
});

test('year screenshot fixtures stay behind DEV preview routing with scoped selection and cleanup', () => {
  const previewSource = read('../src/DevVisualPreview.jsx');
  const authSource = read('../src/AuthGate.jsx');
  assert.match(authSource, /function isDevVisualPreviewRequested\(\)\s*\{\s*if \(!import\.meta\.env\.DEV\) return false;/);
  const start = previewSource.indexOf('const reviewSection =');
  const end = previewSource.indexOf('}, [activeTab, reviewPanel, reviewSection]);', start);
  assert.ok(start >= 0 && end > start);
  const fixtureSource = previewSource.slice(start, end);
  assert.match(fixtureSource, /activeTab !== 'review'/);
  assert.match(fixtureSource, /\['compound', 'compound-simulation'\]\.includes\(reviewPanel\)/);
  assert.match(fixtureSource, /\['years', 'year-detail', 'curve'\]\.includes\(reviewSection\)/);
  assert.match(fixtureSource, /new MutationObserver\(focusCompoundYears\)/);
  assert.match(fixtureSource, /content\?\.querySelector\('\[data-compound-tabs="true"\]'\)/);
  assert.match(fixtureSource, /if \(reviewSection === 'year-detail'\) content\.querySelector\('details'\)\?\.setAttribute\('open', ''\)/);
  assert.match(fixtureSource, /observer\.disconnect\(\);[\s\S]*window\.requestAnimationFrame/);
  assert.match(fixtureSource, /const target = reviewSection === 'curve' \? content\.querySelector\('\.cp-path-heading'\) : tabs;/);
  assert.match(fixtureSource, /target\?\.scrollIntoView\(\{ block: 'start', behavior: 'instant' \}\)/);
  assert.match(fixtureSource, /return \(\) => \{ observer\.disconnect\(\); window\.cancelAnimationFrame\(frame\); \}/);
  assert.doesNotMatch(fixtureSource, /setInterval|setTimeout/);
  assert.doesNotMatch(source.replaceAll('window.matchMedia', ''), /reviewSection|URLSearchParams|MutationObserver|\b(?:window|document)\s*\.|\b(?:useEffect|requestAnimationFrame|setInterval|setTimeout)\b/);
  assert.equal(byClass(renderPage().tree, 'cp-tabs')[0].props['data-compound-tabs'], 'true');
});
