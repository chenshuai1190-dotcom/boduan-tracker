import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { buildInvestmentDrawdownModel } from '../src/lib/investmentDrawdownModel.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/components/InvestmentDrawdownView.jsx');
const css = read('src/components/InvestmentDrawdown.css');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const chartSource = await transformWithOxc(read('src/components/InvestmentComparisonChart.jsx'), 'InvestmentComparisonChart.jsx', { jsx: { runtime: 'classic' } });
const chartUrl = dataUrl(chartSource.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(import.meta.resolve('react'))}`));
const transformed = await transformWithOxc(source, 'InvestmentDrawdownView.jsx', { jsx: { runtime: 'classic' } });
function compiledView(reactUrl, extra = '') {
  const imports = new Map([
    ['react', reactUrl], ['lucide-react', import.meta.resolve('lucide-react')], ['./InvestmentComparisonChart.jsx', chartUrl],
    ['../lib/investmentDrawdownModel.js', new URL('../src/lib/investmentDrawdownModel.js', import.meta.url).href],
  ]);
  return transformed.code.replace(/from (["'])([^"']+)\1/g, (match, _quote, path) => imports.has(path) ? `from ${JSON.stringify(imports.get(path))}` : match)
    .replace(/import ["'][^"']+\.css["'];?/g, '') + extra;
}
const { default: InvestmentDrawdownView } = await import(dataUrl(compiledView(import.meta.resolve('react'))));

function comparisonModel({ rising = false } = {}) {
  const dates = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
  const prices = rising ? [[100, 110, 120, 130, 140, 150], [100, 105, 110, 115, 120, 125]] : [[100, 120, 90, 108, 120, 115], [100, 130, 65, 80, 130, 120]];
  return { symbols: ['QQQ', 'TQQQ'], principal: 1000000, actualStartDate: dates[0], asOfDate: dates.at(-1), points: dates.map((date, index) => ({ date, values: { QQQ: prices[0][index] * 10000, TQQQ: prices[1][index] * 10000 } })) };
}

test('drawdown view renders real model outcomes, principal risk and bilingual controls without duplicate page settings', () => {
  for (const englishMode of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(InvestmentDrawdownView, { model: comparisonModel(), englishMode }));
    assert.equal((html.match(/class="ic-dd-metric"/g) || []).length, 2);
    assert.match(html, /QQQ/); assert.match(html, /TQQQ/);
    assert.match(html, /-25\.0%/); assert.match(html, /-50\.0%/);
    assert.match(html, /2026-01-05/); assert.match(html, /2026-01-06/); assert.match(html, /2026-01-08/);
    assert.match(html, englishMode ? /Maximum drawdown/ : /区间最大回撤/);
    assert.match(html, englishMode ? /Looking only at the initial principal/ : /如果只看投入本金/);
    assert.match(html, englishMode ? /Drawdown calculation methodology/ : /回撤计算口径/);
    assert.match(html, englishMode ? /Drawdown replay progress/ : /回撤回放进度/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined|class="ic-header"|class="ic-settings"|<h1/);
  }
});

test('a period with no drawdown has an honest empty journey and no unusable playback controls', () => {
  for (const englishMode of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(InvestmentDrawdownView, { model: comparisonModel({ rising: true }), englishMode }));
    assert.match(html, englishMode ? /No drawdown occurred/ : /尚未发生回撤/);
    assert.match(html, englishMode ? /Never below principal/ : /未跌破本金/);
    assert.doesNotMatch(html, /class="ic-dd-play"|class="ic-dd-scrubber"|NaN|Infinity/);
    assert.equal((html.match(/class="ic-dd-metric"/g) || []).length, 2);
  }
});

test('missing or invalid history fails closed with a translated alert instead of fabricated charts', () => {
  const invalid = comparisonModel(); invalid.points[2].values.QQQ = null;
  for (const model of [null, {}, invalid]) {
    for (const englishMode of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(InvestmentDrawdownView, { model, englishMode }));
      assert.match(html, /role="alert"/);
      assert.match(html, englishMode ? /Drawdown analysis is unavailable/ : /暂时无法计算回撤/);
      assert.doesNotMatch(html, /<svg|ic-dd-metric|ic-dd-play/);
    }
  }
});

// Expose internal components only in the in-memory transformed test module.
// Each component keeps independent hook slots, as it would in a React tree.
const hookUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let hosts = new Map(), active, cursor = 0, pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  export function reset() { for (const slots of hosts.values()) for (const slot of slots) slot?.cleanup?.(); hosts = new Map(); pending = []; }
  export function render(Component, props, key = 'default') { if (!hosts.has(key)) hosts.set(key, []); active = hosts.get(key); cursor = 0; return Component(props); }
  export function flush() { const effects = pending; pending = []; effects.forEach(effect => effect()); }
  function useState(initial) { const index = cursor++; if (!active[index]) active[index] = { value: typeof initial === 'function' ? initial() : initial }; const slot = active[index]; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
  function useRef(initial) { const index = cursor++; return active[index] ||= { current: initial }; }
  function useMemo(callback, deps) { const index = cursor++; if (!active[index] || !same(active[index].deps, deps)) active[index] = { value: callback(), deps }; return active[index].value; }
  function useEffect(callback, deps) { const index = cursor++; if (!active[index] || !same(active[index].deps, deps)) { const previous = active[index], slot = { deps }; active[index] = slot; pending.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); }); } }
  export default { ...React, memo: component => component, useState, useRef, useMemo, useEffect, useId: () => 'drawdown-test', useCallback: (callback, deps) => useMemo(() => callback, deps) };
`);
const hooks = await import(hookUrl);
const { DrawdownJourney, DrawdownOverview, JourneyChart, DrawdownAnalysis } = await import(dataUrl(compiledView(hookUrl, '\nexport { DrawdownJourney, DrawdownOverview, JourneyChart, DrawdownAnalysis };')));

function findAll(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => findAll(child, predicate))];
}
const classNode = (tree, className) => findAll(tree, node => node.props.className === className)[0];

function overviewInteraction({ data = buildInvestmentDrawdownModel(comparisonModel()), reset = true, mount = false } = {}) {
  if (reset) hooks.reset();
  const props = { data, active: 'QQQ', colors: { QQQ: '#fff', TQQQ: '#000' }, onActivate() {}, englishMode: true };
  const captured = new Set();
  const inside = {};
  const target = {
    getBoundingClientRect: () => ({ left: 0, width: 360 }),
    contains: node => node === target || node === inside,
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  };
  const render = () => {
    const tree = hooks.render(DrawdownOverview, props, 'overview');
    if (mount) findAll(tree, node => node.props.role === 'slider')[0].ref.current = target;
    hooks.flush();
    return tree;
  };
  const area = () => findAll(render(), node => node.props.role === 'slider')[0].props;
  const pointer = (index, overrides = {}) => ({
    pointerId: 1, pointerType: 'touch', button: 0, buttons: 1, isPrimary: true,
    clientX: 39 + index / (props.data.analyses.QQQ.points.length - 1) * (360 - 39 - 8), clientY: 100,
    currentTarget: target, preventDefault: () => assert.fail('inspection must not suppress native vertical scrolling'), ...overrides,
  });
  const inspect = index => {
    area().onPointerDown(pointer(index));
    area().onPointerUp(pointer(index, { buttons: 0 }));
    area().onLostPointerCapture(pointer(index, { buttons: 0 }));
  };
  const cancel = event => {
    area().onPointerCancel(event);
    // The browser implicitly releases pointer capture after pointercancel.
    captured.delete(event.pointerId);
    area().onLostPointerCapture(event);
  };
  const assertSelection = (index, crosshair = true) => {
    const tree = render();
    const date = props.data.analyses.QQQ.points[index].date;
    const slider = findAll(tree, node => node.props.role === 'slider')[0].props;
    assert.equal(slider['aria-valuenow'], index);
    assert.ok(slider['aria-valuetext'].includes(date), 'accessible readout must identify the selected real day');
    assert.equal(React.Children.toArray(classNode(tree, 'ic-dd-overview-readout').props.children)[0].props.children, date);
    assert.equal(findAll(tree, node => node.props.className === 'ic-dd-inspection-line').length, crosshair ? 1 : 0);
  };
  return { props, render, area, pointer, inspect, cancel, assertSelection, captured, target, inside };
}

function documentEvents(t) {
  const previous = globalThis.document;
  const listeners = [];
  globalThis.document = {
    addEventListener(type, callback, capture) { listeners.push({ type, callback, capture }); },
    removeEventListener(type, callback, capture) {
      const index = listeners.findIndex(listener => listener.type === type && listener.callback === callback && listener.capture === capture);
      assert.notEqual(index, -1, 'effect cleanup must remove the same event, callback and capture flag');
      listeners.splice(index, 1);
    },
  };
  t.after(() => { hooks.reset(); if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const dispatch = (type, target, onTarget = () => {}) => {
    const event = { type, target, preventDefault: () => assert.fail('outside dismissal must preserve the clicked action'), stopPropagation: () => assert.fail('outside dismissal must not swallow clicks') };
    for (const listener of [...listeners]) if (listener.type === type) listener.callback(event);
    onTarget(event);
  };
  return { listeners, dispatch };
}

test('outside click clears pinned inspection without swallowing the action, while plot clicks, release, blur and scrolling preserve it', t => {
  const events = documentEvents(t);
  const chart = overviewInteraction({ mount: true });
  chart.assertSelection(5, false);
  assert.equal(events.listeners.length, 0);
  chart.area().onPointerMove(chart.pointer(1, { pointerType: 'mouse', buttons: 0 }));
  chart.assertSelection(1);
  assert.equal(events.listeners.length, 0, 'temporary mouse hover must not install an outside-click listener');
  chart.area().onPointerLeave(chart.pointer(1, { pointerType: 'mouse', buttons: 0 }));
  chart.inspect(2);
  chart.assertSelection(2);
  assert.deepEqual(events.listeners.map(({ type, capture }) => ({ type, capture })), [{ type: 'click', capture: true }]);
  chart.area().onPointerLeave(chart.pointer(2, { buttons: 0 }));
  chart.area().onBlur({});
  events.dispatch('pointerdown', {});
  events.dispatch('scroll', {});
  events.dispatch('click', chart.inside);
  chart.assertSelection(2);
  let clicked = false;
  events.dispatch('click', {}, () => { clicked = true; });
  assert.equal(clicked, true);
  chart.assertSelection(5, false);
  assert.equal(events.listeners.length, 0);
});

test('outside-click listener is removed on explicit reset, history replacement and unmount without interrupting replay', t => {
  const events = documentEvents(t);
  const replay = replayHost(t);
  let tree = replay.render(); classNode(tree, 'ic-dd-play').props.onClick(); replay.render();
  const chart = overviewInteraction({ data: replay.data, reset: false, mount: true });
  chart.inspect(0);
  assert.equal(events.listeners.length, 1);
  classNode(chart.render(), 'ic-dd-reset-inspection').props.onClick();
  chart.assertSelection(5, false);
  assert.equal(events.listeners.length, 0);
  chart.inspect(1);
  chart.props.data = buildInvestmentDrawdownModel(comparisonModel());
  chart.assertSelection(5, false);
  assert.equal(events.listeners.length, 0);
  chart.inspect(2);
  events.dispatch('click', {});
  chart.assertSelection(5, false);
  assert.equal(classNode(replay.render(), 'ic-dd-play').props['aria-pressed'], true);
  chart.inspect(1);
  assert.equal(events.listeners.length, 1);
  hooks.reset();
  assert.equal(events.listeners.length, 0);
});

test('touch inspection stays pinned after release, pointer leave, focus loss and horizontal dragging', () => {
  const chart = overviewInteraction();
  chart.assertSelection(5, false);
  chart.area().onPointerDown(chart.pointer(1));
  chart.assertSelection(1);
  chart.area().onPointerUp(chart.pointer(1, { buttons: 0 }));
  chart.area().onPointerLeave(chart.pointer(1, { buttons: 0 }));
  chart.area().onBlur({ currentTarget: chart.pointer(1).currentTarget });
  chart.assertSelection(1);
  assert.equal(chart.captured.size, 0);
  chart.area().onPointerDown(chart.pointer(1));
  chart.area().onPointerMove(chart.pointer(4, { clientY: 103 }));
  chart.assertSelection(4);
  chart.area().onPointerUp(chart.pointer(4, { buttons: 0, clientY: 103 }));
  chart.area().onPointerLeave(chart.pointer(4, { buttons: 0 }));
  chart.area().onBlur({ currentTarget: chart.pointer(4).currentTarget });
  chart.assertSelection(4);
  assert.equal(chart.captured.size, 0);
});

test('vertical scroll and cancelled gestures restore the previously pinned day without replacing it', () => {
  const chart = overviewInteraction();
  chart.inspect(1);
  const start = chart.pointer(3);
  chart.area().onPointerDown(start);
  chart.assertSelection(3);
  chart.area().onPointerMove({ ...start, clientX: start.clientX + 2, clientY: 145 });
  chart.assertSelection(1);
  chart.cancel({ ...start, clientY: 145 });
  chart.area().onPointerLeave(start);
  chart.assertSelection(1);
  assert.equal(chart.captured.size, 0);
  chart.area().onPointerDown(chart.pointer(4));
  chart.assertSelection(4);
  chart.cancel(chart.pointer(4));
  chart.assertSelection(1);
  assert.equal(chart.captured.size, 0);

  const unselected = overviewInteraction();
  unselected.area().onPointerDown(unselected.pointer(2));
  unselected.area().onPointerMove(unselected.pointer(2, { clientY: 150 }));
  unselected.cancel(unselected.pointer(2));
  unselected.assertSelection(5, false);
});

test('mouse hover is temporary until a click pins a day and free movement cannot replace the pinned selection', () => {
  const chart = overviewInteraction();
  const mouse = (index, overrides = {}) => chart.pointer(index, { pointerType: 'mouse', buttons: 0, ...overrides });
  chart.area().onPointerMove(mouse(2));
  chart.assertSelection(2);
  chart.area().onPointerLeave(mouse(2));
  chart.assertSelection(5, false);
  chart.area().onPointerMove(mouse(1));
  chart.area().onBlur({ currentTarget: mouse(1).currentTarget });
  chart.assertSelection(5, false);
  chart.area().onPointerDown(mouse(2, { buttons: 1 }));
  chart.area().onPointerUp(mouse(2));
  chart.area().onPointerMove(mouse(4));
  chart.area().onPointerLeave(mouse(4));
  chart.area().onBlur({ currentTarget: mouse(4).currentTarget });
  chart.assertSelection(2);
});

test('keyboard history selection persists while Escape returns to the latest day and normal Tab navigation is preserved', () => {
  const chart = overviewInteraction();
  let prevented = 0;
  for (const [key, expected] of [['Home', 0], ['ArrowRight', 1], ['ArrowLeft', 0], ['ArrowLeft', 0], ['End', 5], ['ArrowRight', 5]]) {
    chart.area().onKeyDown({ key, preventDefault: () => { prevented += 1; } });
    chart.area().onBlur({});
    chart.area().onPointerLeave(chart.pointer(expected));
    chart.assertSelection(expected);
  }
  assert.equal(prevented, 6);
  chart.area().onKeyDown({ key: 'Home', preventDefault() {} });
  chart.area().onKeyDown({ key: 'Escape', preventDefault() {} });
  chart.assertSelection(5, false);
  chart.area().onKeyDown({ key: 'Tab', preventDefault: () => assert.fail('Tab must retain native focus behavior') });
  chart.assertSelection(5, false);
});

test('changing the highlighted symbol retains the selected date while refreshed history clears its old selection', () => {
  const chart = overviewInteraction();
  chart.inspect(1);
  chart.props.active = 'TQQQ';
  chart.assertSelection(1);
  const refreshed = comparisonModel();
  refreshed.points = refreshed.points.slice(0, 3);
  refreshed.asOfDate = refreshed.points.at(-1).date;
  chart.props.data = buildInvestmentDrawdownModel(refreshed);
  chart.assertSelection(2, false);
  chart.inspect(0);
  chart.assertSelection(0);
});

test('the bilingual reset button returns to latest and secondary touches cannot overwrite the selected day', () => {
  for (const englishMode of [false, true]) {
    const chart = overviewInteraction();
    chart.props.englishMode = englishMode;
    chart.inspect(1);
    const secondary = chart.pointer(4, { pointerId: 2, isPrimary: false });
    chart.area().onPointerDown(secondary);
    chart.area().onPointerMove(secondary);
    chart.area().onPointerUp({ ...secondary, buttons: 0 });
    chart.assertSelection(1);
    chart.area().onPointerDown(chart.pointer(2));
    chart.area().onPointerDown(secondary);
    chart.area().onPointerMove(secondary);
    chart.area().onPointerUp({ ...secondary, buttons: 0 });
    chart.assertSelection(2);
    chart.area().onPointerUp(chart.pointer(2, { buttons: 0 }));
    chart.area().onPointerLeave(chart.pointer(2));
    chart.assertSelection(2);
    const reset = classNode(chart.render(), 'ic-dd-reset-inspection');
    assert.equal(reset.props.children, englishMode ? 'Back to latest' : '回到最新');
    reset.props.onClick();
    chart.assertSelection(5, false);
    assert.equal(classNode(chart.render(), 'ic-dd-reset-inspection'), undefined);
  }
});

function replayHost(t) {
  hooks.reset();
  const savedFrame = globalThis.requestAnimationFrame, savedCancel = globalThis.cancelAnimationFrame;
  const frames = new Map(); let frameId = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  t.after(() => { hooks.reset(); if (savedFrame) globalThis.requestAnimationFrame = savedFrame; else delete globalThis.requestAnimationFrame; if (savedCancel) globalThis.cancelAnimationFrame = savedCancel; else delete globalThis.cancelAnimationFrame; });
  const data = buildInvestmentDrawdownModel(comparisonModel());
  const props = { analysis: data.analyses.QQQ, episode: data.analyses.QQQ.maxDrawdownEpisode, symbol: 'QQQ', englishMode: true };
  const render = () => { const tree = hooks.render(DrawdownJourney, props, 'journey'); hooks.flush(); return tree; };
  const frame = timestamp => { const entry = frames.entries().next().value; assert.ok(entry, 'playback must schedule a frame'); frames.delete(entry[0]); entry[1](timestamp); return render(); };
  return { data, props, render, frame, frames };
}

test('drawdown playback defaults to 0.2 and displays only real daily observations while pausing and restarting explicitly', t => {
  const replay = replayHost(t);
  let tree = replay.render();
  assert.equal(classNode(tree, 'ic-dd-speed').props.value, 0.2);
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.step, '1');
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, replay.props.episode.recoveryIndex);
  classNode(tree, 'ic-dd-play').props.onClick(); tree = replay.render();
  assert.equal(classNode(tree, 'ic-dd-play').props['aria-pressed'], true);
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, replay.props.episode.peakIndex);
  tree = replay.frame(0); tree = replay.frame(20);
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, 1, 'fractional frame progress must still display an observed day');
  tree = replay.frame(40);
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, 2);
  assert.match(classNode(tree, 'ic-dd-scrubber').props['aria-valuetext'], /2026-01-06, -25\.0%/);
  const chart = findAll(tree, node => node.type === JourneyChart)[0];
  assert.equal(chart.props.index, 2, 'chart and financial labels must select the same real day');
  classNode(tree, 'ic-dd-play').props.onClick(); tree = replay.render();
  assert.equal(classNode(tree, 'ic-dd-play').props['aria-pressed'], false);
  assert.equal(replay.frames.size, 0);
  classNode(tree, 'ic-dd-play').props.onClick(); tree = replay.render();
  tree = replay.frame(100); tree = replay.frame(200);
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, replay.props.episode.recoveryIndex);
  assert.equal(classNode(tree, 'ic-dd-play').props['aria-pressed'], false, 'recovery endpoint ends playback');
  classNode(tree, 'ic-dd-play').props.onClick(); tree = replay.render();
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, replay.props.episode.peakIndex);
});

test('timeline seeking, chart tapping and vertical movement leave an active replay running', t => {
  const replay = replayHost(t);
  let tree = replay.render(); classNode(tree, 'ic-dd-play').props.onClick(); tree = replay.render();
  classNode(tree, 'ic-dd-scrubber').props.onChange({ target: { value: '2' } }); tree = replay.render();
  assert.equal(classNode(tree, 'ic-dd-scrubber').props.value, 2);
  assert.equal(classNode(tree, 'ic-dd-play').props['aria-pressed'], true);
  const chart = overviewInteraction({ data: replay.data, reset: false });
  chart.inspect(2);
  chart.area().onPointerLeave(chart.pointer(2, { buttons: 0 }));
  chart.area().onBlur({});
  chart.assertSelection(2);
  chart.area().onPointerDown(chart.pointer(3));
  chart.area().onPointerMove(chart.pointer(3, { clientY: 180 }));
  chart.cancel(chart.pointer(3));
  chart.assertSelection(2);
  assert.equal(classNode(replay.render(), 'ic-dd-play').props['aria-pressed'], true);
  assert.match(css, /\.ic-dd-chart\s*\{[^}]*touch-action:\s*pan-y/);
  const journeyChart = hooks.render(JourneyChart, { ...replay.props, index: 2 }, 'chart');
  assert.equal(journeyChart.props.onPointerDown, undefined);
  assert.equal(journeyChart.props.onScroll, undefined);
  assert.doesNotMatch(source, /\bonPause\b|addEventListener\(['"](?:scroll|touchstart|pointerdown)['"]/);
});

test('instrument selection and episode filters use each symbol analysis and reset a refreshed replay safely', t => {
  const replay = replayHost(t);
  let tree = hooks.render(DrawdownAnalysis, { data: replay.data, englishMode: true }, 'analysis');
  const metrics = findAll(tree, node => node.props.className === 'ic-dd-metric');
  metrics[1].props.onClick();
  tree = hooks.render(DrawdownAnalysis, { data: replay.data, englishMode: true }, 'analysis');
  let journey = findAll(tree, node => node.type === DrawdownJourney)[0];
  assert.strictEqual(journey.props.analysis, replay.data.analyses.TQQQ);
  const filters = findAll(classNode(tree, 'ic-dd-episode-tabs'), node => node.type === 'button');
  filters[2].props.onClick();
  tree = hooks.render(DrawdownAnalysis, { data: replay.data, englishMode: true }, 'analysis');
  journey = findAll(tree, node => node.type === DrawdownJourney)[0];
  assert.strictEqual(journey.props.episode, replay.data.analyses.TQQQ.episodes.at(-1));
  let playingTree = replay.render(); classNode(playingTree, 'ic-dd-play').props.onClick(); playingTree = replay.render();
  assert.equal(classNode(playingTree, 'ic-dd-play').props['aria-pressed'], true);
  const refreshed = buildInvestmentDrawdownModel(comparisonModel());
  replay.props.analysis = refreshed.analyses.QQQ; replay.props.episode = refreshed.analyses.QQQ.maxDrawdownEpisode;
  const refreshedTree = replay.render();
  assert.equal(classNode(refreshedTree, 'ic-dd-play').props['aria-pressed'], false);
  assert.equal(classNode(refreshedTree, 'ic-dd-scrubber').props.value, replay.props.episode.recoveryIndex);
  assert.equal(replay.frames.size, 0, 'old model animation must be cleaned up');
});

test('drawdown history shows the eight newest starts, including a shallow unresolved episode before older deep declines', () => {
  const values = [1000000];
  for (let episode = 0; episode < 9; episode += 1) {
    const peak = values.at(-1);
    const trough = peak * (episode === 0 ? 0.4 : 0.85 + episode * 0.01);
    values.push(trough);
    if (episode === 2) values.push(trough, trough, trough, trough);
    values.push(peak * 1.1);
  }
  values.push(values.at(-1) * 0.97);
  const points = values.map((value, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 2)).toISOString().slice(0, 10),
    values: { QQQ: value, TQQQ: value },
  }));
  const data = buildInvestmentDrawdownModel({ symbols: ['QQQ', 'TQQQ'], principal: 1000000, actualStartDate: points[0].date, asOfDate: points.at(-1).date, points });
  const analysis = data.analyses.QQQ;
  assert.equal(analysis.episodes.length, 10);
  assert.equal(analysis.currentEpisode.recovered, false);
  assert.ok(Math.abs(analysis.currentEpisode.drawdownPct) < Math.abs(analysis.maxDrawdownEpisode.drawdownPct));
  const originalIds = analysis.episodes.map(episode => episode.id);
  const newestEight = [...analysis.episodes].reverse().slice(0, 8);
  Object.freeze(analysis.episodes);
  for (const englishMode of [false, true]) {
    hooks.reset();
    const render = () => hooks.render(DrawdownAnalysis, { data, englishMode }, 'chronological-history');
    let tree = render();
    const rows = findAll(tree, node => node.props.className === 'ic-dd-history-row');
    assert.equal(rows.length, 8);
    assert.deepEqual(rows.map(row => row.props['aria-label'].match(/\d{4}-\d{2}-\d{2}/)[0]), newestEight.map(episode => episode.peakDate));
    assert.ok(rows[0].props['aria-label'].includes(analysis.currentEpisode.peakDate));
    assert.ok(rows.every(row => !row.props['aria-label'].includes(analysis.maxDrawdownEpisode.peakDate)), 'older deepest episode should not displace a newer episode in the eight-row history');
    assert.deepEqual(analysis.episodes.map(episode => episode.id), originalIds);
    const historyText = renderToStaticMarkup(classNode(tree, 'ic-dd-history'));
    assert.match(historyText, englishMode ? /(?:latest|most recent).*(?:8|eight)/i : /最近.*8|最新.*8/);
    assert.doesNotMatch(historyText, englishMode ? /eight deepest/i : /按回撤深度/);
    rows[0].props.onClick(); tree = render();
    assert.strictEqual(findAll(tree, node => node.type === DrawdownJourney)[0].props.episode, analysis.currentEpisode);
    const chooseFilter = index => {
      findAll(classNode(tree, 'ic-dd-episode-tabs'), node => node.type === 'button')[index].props.onClick();
      tree = render();
      return findAll(tree, node => node.type === DrawdownJourney)[0].props.episode;
    };
    assert.strictEqual(chooseFilter(0), analysis.maxDrawdownEpisode);
    assert.strictEqual(chooseFilter(1), analysis.longestEpisode);
    assert.deepEqual(analysis.episodes.map(episode => episode.id), originalIds);
  }
  hooks.reset();
});

test('selected drawdown cards keep their dark border while retaining pressed-state accessibility', () => {
  const selectedRule = css.match(/\.ic-dd-metric\[aria-pressed="true"\]\s*\{([^}]*)\}/);
  assert.ok(selectedRule);
  assert.doesNotMatch(selectedRule[1], /(?:^|;)\s*border(?:-[\w-]+)?\s*:/);
  assert.match(css, /\.ic-dd-metric\s*\{[^}]*border:\s*1px solid var\(--ic-border\)/);
  hooks.reset();
  const data = buildInvestmentDrawdownModel(comparisonModel());
  const render = () => hooks.render(DrawdownAnalysis, { data, englishMode: true }, 'metric-border');
  let cards = findAll(render(), node => node.props.className === 'ic-dd-metric');
  assert.deepEqual(cards.map(card => card.props['aria-pressed']), [true, false]);
  cards[1].props.onClick();
  cards = findAll(render(), node => node.props.className === 'ic-dd-metric');
  assert.deepEqual(cards.map(card => card.props['aria-pressed']), [false, true]);
  hooks.reset();
});
