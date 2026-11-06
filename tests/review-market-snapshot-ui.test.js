import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { readReviewMarketDate, createReviewMarketSnapshot } from '../src/lib/reviewMarketSnapshot.js';

const source = readFileSync(new URL('../src/components/ReviewMarketSnapshot.jsx', import.meta.url), 'utf8');
const lib = name => JSON.stringify(new URL(`../src/lib/${name}.js`, import.meta.url).href);
const date = '2026-11-05', recordDate = '2026-11-06', red = '#ff4b1f';
const cases = [[0.9999, false], [1, false], [1.0001, true], [1.103, true]];
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const byClass = (tree, name) => walk(tree).filter(node => node.props.className === name);
function inputs(ratio) {
  const previewData = {
    now: Date.parse('2026-11-06T10:00:00Z'),
    vixComparison: { source: 'CBOE_EODHD_EOD', series: { VIX: { rows: [{ date, close: 25 }] } },
      termStructure: { source: 'CBOE', rows: [{ date, vix: 25, vix3m: 25 / ratio, ratio }] } },
    fearGreed: { source: 'CNN', fetchedAt: '2026-11-06T09:00:00Z',
      history: [{ timestamp: Date.parse(`${date}T00:00:00Z`), value: 44.6, rating: 'fear' }] },
  };
  const items = readReviewMarketDate({ date, recordDate, ...previewData }).items;
  const value = createReviewMarketSnapshot({ date, recordDate, items, selectedKeys: ['vix', 'ratio', 'fearGreed'], now: previewData.now });
  assert.ok(value);
  return { value, previewData };
}

// Run the picker's real preview-data effects before rendering its resulting UI.
let slots = [], cursor = 0, effects = [];
const hooks = {
  useState(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  },
  useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
  useId() { cursor++; return 'market-snapshot-test'; },
  useEffect(effect, deps) {
    const index = cursor++, previous = slots[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    previous?.cleanup?.();
    const slot = { deps }; slots[index] = slot;
    effects.push(() => { slot.cleanup = effect(); });
  },
};
globalThis.__reviewMarketSnapshotUIHooks = hooks;
let components;
try {
  const compiled = await transformWithOxc(`
    import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
    import { Check, X } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
    import { getVixComparisonExpectedCloseDate } from ${lib('vixComparisonSession')};
    import { MARKET_RED_HEX } from ${lib('marketColorMode')};
    import { REVIEW_MARKET_KEYS, createReviewMarketSnapshot, normalizeReviewMarketSnapshot, readReviewMarketDate, reviewMarketItemLabel, reviewMarketItemState, formatReviewMarketItem, validReviewMarketDate } from ${lib('reviewMarketSnapshot')};
    const React = { ...ActualReact, ...globalThis.__reviewMarketSnapshotUIHooks };
    const document = { body: {} }, createPortal = tree => tree;
    const loadVixComparison = () => { throw new Error('Unexpected live VIX request'); };
    const loadFearGreed = () => { throw new Error('Unexpected live fear/greed request'); };
    ${source.slice(source.indexOf('const isEnglish ='))}
  `, 'ReviewMarketSnapshotUITest.jsx', { jsx: { runtime: 'classic' } });
  components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
} finally { delete globalThis.__reviewMarketSnapshotUIHooks; }

function renderPicker(props) {
  slots = [];
  let tree;
  for (let pass = 0; pass < 2; pass++) {
    cursor = 0; effects = [];
    tree = components.SnapshotPicker({ open: true, userId: 'snapshot-test-owner', recordDate, ...props });
    for (const effect of effects) effect();
  }
  for (const slot of slots) slot?.cleanup?.();
  return tree;
}

function assertReadingStyles(groups, highlighted) {
  assert.equal(groups.length, 3);
  for (const [index, group] of groups.entries()) {
    const readings = walk(group).filter(node => node.type === 'strong' || node.type === 'small');
    assert.equal(readings.length, 2);
    for (const node of readings) assert.equal(node.props.style?.color, index === 1 && highlighted ? red : undefined);
  }
}

test('snapshot card uses the raw ratio threshold for both value and state, leaving VIX and fear/greed neutral', () => {
  for (const [ratio, highlighted] of cases) {
    const tree = components.SnapshotCard({ value: inputs(ratio).value });
    assertReadingStyles(byClass(tree, 'review-market-value'), highlighted);
    const html = renderToStaticMarkup(tree);
    assert.equal((html.match(/style="color:#ff4b1f"/g) || []).length, highlighted ? 2 : 0);
    assert.match(html, new RegExp(`>${ratio.toFixed(3).replace('.', '\\.')}<`));
  }
});

test('saved cards keep their source date at the top and omit the three footer notices in both languages', () => {
  for (const language of ['zh', 'en']) {
    const html = renderToStaticMarkup(React.createElement(components.SnapshotCard, { value: inputs(1.103).value, language }));
    assert.match(html, /<time dateTime="2026-11-05">2026-11-05<\/time>/);
    assert.doesNotMatch(html, /CBOE|CNN|日线收盘|保存时快照|记录日期|与来源日期不同|Daily close|Saved values|Record date|Source date differs/);
    assert.doesNotMatch(html, /review-market-card-footer|review-market-date-difference|2026-11-06/);
  }
});

test('picker readings and its card preview apply the same raw ratio threshold', () => {
  for (const [ratio, highlighted] of cases) {
    const tree = renderPicker(inputs(ratio));
    assertReadingStyles(byClass(tree, 'review-market-option-reading'), highlighted);
    const html = renderToStaticMarkup(tree);
    assert.equal((html.match(/style="color:#ff4b1f"/g) || []).length, highlighted ? 4 : 0);
  }
});
