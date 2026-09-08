import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const chartSource = read('src/components/InvestmentComparisonChart.jsx');
const pageSource = read('src/pages/InvestmentComparisonPage.jsx');
const cssSource = read('src/components/InvestmentComparison.css');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

// Keep the production JSX and event handlers intact. A small hook host preserves
// state/refs between event-driven renders without mounting DOM or running effects.
const hookUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0;
  export function reset() { slots = []; cursor = 0; }
  export function render(Component, props) { cursor = 0; return Component(props); }
  function useState(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  }
  function useRef(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { current: initial };
    return slots[index];
  }
  export default { ...React, useState, useRef, useMemo: callback => callback(),
    useId: () => 'interaction-test', useEffect() {}, useLayoutEffect() {} };
`);
const hooks = await import(hookUrl);
const transformed = await transformWithOxc(chartSource, 'InvestmentComparisonChart.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(hookUrl)}`);
const { default: InvestmentComparisonChart } = await import(dataUrl(compiled));

function findNode(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function chartInteraction() {
  hooks.reset();
  let pauseCalls = 0;
  const points = ['2011-01-03', '2011-01-04', '2011-01-05', '2011-01-06'].map((date, index) => ({
    date, time: Date.parse(`${date}T00:00:00Z`), year: 2011,
    values: { QQQ: 1000 + index * 100, TQQQ: 1000 + index * 200 },
    profits: { QQQ: index * 100, TQQQ: index * 200 },
  }));
  const props = {
    model: { symbols: ['QQQ', 'TQQQ'], principal: 1000, points, actualStartDate: points[0].date },
    snapshot: { index: 3, point: points[3] },
    onPause: () => { pauseCalls += 1; },
  };
  const slider = () => findNode(hooks.render(InvestmentComparisonChart, props), node => node.props.role === 'slider').props;
  const captured = new Set();
  const target = {
    getBoundingClientRect: () => ({ left: 0, width: 360 }),
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  };
  const pointer = overrides => ({ pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 100, currentTarget: target, ...overrides });
  return { slider, pointer, captured, pauseCalls: () => pauseCalls };
}

test('touch tap and horizontal chart inspection select real historical points without pausing', () => {
  const chart = chartInteraction();
  chart.slider().onPointerDown(chart.pointer());
  assert.equal(chart.slider()['aria-valuenow'], 0);
  assert.ok(chart.captured.has(1));
  chart.slider().onPointerMove(chart.pointer({ clientX: 340, clientY: 102 }));
  assert.equal(chart.slider()['aria-valuenow'], 3);
  chart.slider().onPointerUp(chart.pointer());
  assert.equal(chart.captured.size, 0);
  assert.equal(chart.pauseCalls(), 0);
});

test('vertical scrolling, pointer cancellation and mouse inspection never pause playback', () => {
  const chart = chartInteraction();
  chart.slider().onPointerDown(chart.pointer());
  chart.slider().onPointerMove(chart.pointer({ clientX: 1, clientY: 140 }));
  assert.equal(chart.slider()['aria-valuenow'], 3, 'vertical intent dismisses inspection instead of taking over page scrolling');
  chart.slider().onPointerCancel();
  chart.slider().onPointerDown(chart.pointer());
  assert.equal(chart.slider()['aria-valuenow'], 0);
  chart.slider().onPointerCancel();
  assert.equal(chart.slider()['aria-valuenow'], 3);
  chart.slider().onPointerMove(chart.pointer({ pointerType: 'mouse' }));
  assert.equal(chart.slider()['aria-valuenow'], 0);
  chart.slider().onLostPointerCapture();
  chart.slider().onPointerLeave(chart.pointer({ pointerType: 'mouse' }));
  assert.equal(chart.slider()['aria-valuenow'], 3);
  assert.equal(chart.pauseCalls(), 0);
  assert.match(cssSource, /\.ic-chart-touch\s*\{[^}]*touch-action:\s*pan-y/);
});

test('keyboard history inspection and dismissal remain accessible without pausing', () => {
  const chart = chartInteraction();
  let prevented = 0;
  for (const [key, expected] of [['Home', 0], ['ArrowRight', 1], ['ArrowLeft', 0], ['End', 3]]) {
    chart.slider().onKeyDown({ key, preventDefault() { prevented += 1; } });
    assert.equal(chart.slider()['aria-valuenow'], expected);
  }
  chart.slider().onKeyDown({ key: 'Home', preventDefault() { prevented += 1; } });
  chart.slider().onKeyDown({ key: 'Escape', preventDefault() { assert.fail('Escape should not hijack page keyboard behavior'); } });
  assert.equal(chart.slider()['aria-valuenow'], 3);
  chart.slider().onKeyDown({ key: 'Tab', preventDefault() { assert.fail('Tab should preserve normal focus navigation'); } });
  assert.equal(prevented, 5);
  assert.equal(chart.pauseCalls(), 0);
  assert.doesNotMatch(chartSource, /\bonPause\b/);
  const chartElement = pageSource.match(/<InvestmentComparisonChart\b[^>]*\/>/);
  assert.ok(chartElement);
  assert.doesNotMatch(chartElement[0], /onPause|setPlaying/);
});

function pageHandler(name) {
  const match = pageSource.match(new RegExp(`const ${name} = (?:event|\\(\\)) => \\{([\\s\\S]*?)\\n  \\};`));
  assert.ok(match, `${name} must remain a controlled page action`);
  return match[1];
}

test('timeline seeking immediately updates the animation cursor without changing playback state', () => {
  assert.match(pageSource, /className="ic-timeline"[^\n]*onChange=\{seekPlayback\}/);
  const seek = new Function('event', 'cursorRef', 'cursorKey', 'setCursorState', 'setPlaying', pageHandler('seekPlayback'));
  for (const index of [0, 2, 3]) {
    const cursorRef = { current: 1 };
    const states = [];
    seek({ target: { value: String(index) } }, cursorRef, 'current-comparison', value => {
      assert.equal(cursorRef.current, index, 'the next animation frame must start from the sought date');
      states.push(value);
    }, () => assert.fail('timeline seeking must not change playback state'));
    assert.deepEqual(states, [{ key: 'current-comparison', index }]);
  }
});

test('the playback button still explicitly pauses, resumes and restarts from the beginning', () => {
  assert.match(pageSource, /className="ic-play-button" onClick=\{togglePlayback\}/);
  const toggle = new Function('playing', 'setPlaying', 'model', 'lastIndex', 'cursor', 'cursorRef', 'setCursorState', 'cursorKey', pageHandler('togglePlayback'));
  for (const [playing, cursor, expectedState] of [[true, 1, false], [false, 1, true], [false, 3, true]]) {
    const stateCalls = [], cursorCalls = [], cursorRef = { current: cursor };
    toggle(playing, value => stateCalls.push(value), {}, 3, cursor, cursorRef, value => cursorCalls.push(value), 'comparison');
    assert.deepEqual(stateCalls, [expectedState]);
    if (!playing && cursor === 3) {
      assert.equal(cursorRef.current, 0);
      assert.deepEqual(cursorCalls, [{ key: 'comparison', index: 0 }]);
    } else assert.deepEqual(cursorCalls, []);
  }
});

test('opening the picker does not pause while data/parameter resets, natural end and visibility safety stay intact', () => {
  const picker = pageSource.match(/className="ic-pick-button" onClick=\{([^\n]*?)\} aria-haspopup/);
  assert.ok(picker);
  assert.match(picker[1], /setPickerSide\(index\)/);
  assert.doesNotMatch(picker[1], /setPlaying/);
  assert.ok(pageSource.includes('const requestKey = `${userId}:${symbols.join(\':\')}`'));
  assert.ok(pageSource.includes('const cursorKey = `${requestKey}:${startYear}:${principal}`'));
  const reset = pageSource.match(/React\.useEffect\(\(\) => \{\s*setPlaying\(false\);\s*setCursorState\(\{ key: cursorKey, index: lastIndex \}\);\s*\}, \[cursorKey, lastIndex, model\]\)/);
  assert.ok(reset, 'actual symbol, principal or year changes must reset playback against the new model');
  assert.ok(pageSource.includes('if (index === lastIndex) { setPlaying(false); return; }'));
  assert.ok(pageSource.includes('const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); }'));
  assert.ok(pageSource.includes("document.removeEventListener('visibilitychange', pauseWhenHidden)"));
});
