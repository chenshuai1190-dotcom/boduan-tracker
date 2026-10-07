import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/dev/FearGreedPreview.jsx', import.meta.url), 'utf8');
const recorded = JSON.parse(readFileSync(new URL('../src/dev/fixtures/cnnFearGreedSnapshot.json', import.meta.url), 'utf8'));

async function loadPreview(dev) {
  const input = source
    .replace(/import React from 'react';/, `import React from ${JSON.stringify(import.meta.resolve('react'))};`)
    .replace(/import FearGreedPage from '[^']+';/, `const FearGreedPage = props => React.createElement('preview-page', {
      'data-score': props.previewData.current.score,
      'data-rating': props.previewData.current.rating,
      'data-scenario': String(props.previewScenario),
    }, props.previewControls);`)
    .replace(/import snapshot from '[^']+';/, `const snapshot = ${JSON.stringify(recorded)};`)
    .replaceAll('import.meta.env.DEV', String(dev));
  const compiled = await transformWithOxc(input, 'FearGreedPreview.jsx', { jsx: { runtime: 'classic' } });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
}

const design = await loadPreview(true);
const production = await loadPreview(false);
const cases = [
  ['extreme-fear', 12, 'extreme fear'], ['fear', 33, 'fear'], ['neutral', 50, 'neutral'],
  ['greed', 67, 'greed'], ['extreme-greed', 88, 'extreme greed'],
];

function renderAt(component, search = '', language = 'zh') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { search } } });
  try {
    return renderToStaticMarkup(React.createElement(component, { ctx: { language } }));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
}

test('the preview accepts only one recognized fgState and leaves other URLs on the recorded snapshot', () => {
  for (const [id] of cases) {
    assert.equal(design.initialFearGreedDesignState(`?devPreview=1&fgState=${id}&tab=fear-greed`), id);
  }
  for (const search of ['', '?fgState=', '?fgState=unknown', '?fgState=33', '?fgState=Fear',
    '?fgState=extreme%20fear', '?fgState=fear&fgState=greed', '?fgState=fear&fgState=fear', null, 33]) {
    assert.equal(design.initialFearGreedDesignState(search), null, String(search));
  }
});

test('five scenarios clone only current score and rating and never alter the recorded fixture', () => {
  const original = structuredClone(recorded);
  Object.freeze(original.current);
  Object.freeze(original);
  const before = JSON.stringify(original);
  for (const [id, score, rating] of cases) {
    const scenario = design.fearGreedDesignSnapshot(id, original);
    assert.notEqual(scenario, original);
    assert.notEqual(scenario.current, original.current);
    assert.deepEqual(scenario.current, { ...original.current, score, rating });
    assert.deepEqual({ ...scenario, current: original.current }, original);
    for (const key of ['history', 'indicators', 'comparisons']) assert.equal(scenario[key], original[key]);
    assert.equal(JSON.stringify(original), before);
  }
  for (const state of [null, '', 'unknown']) assert.equal(design.fearGreedDesignSnapshot(state, original), original);
});

test('the default render retains the real snapshot while explicit states are visibly marked as scenarios', () => {
  const original = renderAt(design.default);
  assert.ok(original.includes(`data-score="${recorded.current.score}"`));
  assert.ok(original.includes(`data-rating="${recorded.current.rating}"`));
  assert.match(original, /data-scenario="false"/);
  assert.match(original, /aria-pressed="true">原始快照<\/button>/);
  assert.match(original, /配色预览/);
  assert.equal((original.match(/<button\b/g) || []).length, 6, 'all five states and the original snapshot remain reachable');
  for (const [id, score, rating] of cases) {
    const html = renderAt(design.default, `?fgState=${id}`);
    assert.ok(html.includes(`data-score="${score}"`));
    assert.ok(html.includes(`data-rating="${rating}"`));
    assert.match(html, /data-scenario="true"/);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  }
  const english = renderAt(design.default, '?fgState=extreme-greed', 'en');
  assert.match(english, /Color preview/);
  assert.match(english, /Original snapshot/);
  assert.match(english, /aria-pressed="true">Extreme greed<\/button>/);
});

test('production builds cannot mount the design controls or scenario even when fgState is present', () => {
  assert.equal(renderAt(production.default, '?fgState=extreme-fear'), '');
  assert.equal(renderAt(production.default), '');
  assert.doesNotMatch(source, /fetch\s*\(|localStorage|sessionStorage|pushState|replaceState|setItem\s*\(/);
});
