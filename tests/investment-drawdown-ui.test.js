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
  const overviewProps = { data: replay.data, active: 'QQQ', colors: { QQQ: '#fff', TQQQ: '#000' }, onActivate() {}, englishMode: true };
  const overview = () => hooks.render(DrawdownOverview, overviewProps, 'overview');
  const area = () => classNode(overview(), 'ic-dd-chart ic-dd-overview').props;
  const target = { getBoundingClientRect: () => ({ left: 0, width: 360 }) };
  area().onPointerDown({ clientX: 120, clientY: 100, currentTarget: target });
  area().onPointerMove({ clientX: 121, clientY: 180, currentTarget: target });
  area().onPointerLeave();
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
