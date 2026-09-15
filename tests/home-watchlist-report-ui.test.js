import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { stockRsiPresentation } from '../src/lib/stockRsiPresentation.js';
import { lifecycleSignal } from './fixtures/stock-rsi-lifecycle.js';

const source = readFileSync(new URL('../src/components/HomeWatchlistReport.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/HomeWatchlistReport.css', import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transformed = await transformWithOxc(source, 'HomeWatchlistReport.jsx', { jsx: { runtime: 'classic' } });
const hooksUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0;
  export function reset() { slots = []; }
  export function render(Component, props) { cursor = 0; return Component(props); }
  function useState(initial) {
    const index = cursor++;
    const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  }
  function useRef(initial) {
    const index = cursor++;
    return slots[index] ||= { current: initial };
  }
  export default { ...React, useState, useRef };
`);
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/HomeWatchlistReport\.css\1;?/g, '')
  .replace(/from (["'])\.\.\/lib\/stockRsiPresentation\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/stockRsiPresentation.js', import.meta.url).href)}`)
  .replace(/from (["'])(react|lucide-react)\1/g, (_, _quote, module) => `from ${JSON.stringify(module === 'react' ? hooksUrl : import.meta.resolve(module))}`);
const hooks = await import(hooksUrl);
const { default: HomeWatchlistReport } = await import(dataUrl(compiled));

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.Children.toArray(node.props?.children).map(text).join('');
}
const byClass = (tree, name) => nodes(tree, node => node.props.className?.split(/\s+/).includes(name));
function bubbleClick(node, target, event = {}) {
  if (!React.isValidElement(node)) return false;
  // Children.toArray normalizes element keys; its clones keep the same props.
  const containsTarget = node.props === target.props
    || React.Children.toArray(node.props.children).some(child => bubbleClick(child, target, event));
  if (containsTarget) node.props.onClick?.({ detail: 1, ...event, target, currentTarget: node });
  return containsTarget;
}
const sortControl = (tree, key) => {
  const element = nodes(tree, node => node.props.sortKey === key)[0];
  return element?.type(element.props);
};
const signal = overrides => lifecycleSignal('NONE', overrides);
const row = overrides => ({
  symbol: 'NVDA', displayName: '英伟达', price: 223.674321, changePct: -0.91,
  highDrawdown: -5.44, ytdChangePercent: 13.37,
  pnlValue: 123.456789, pnlDisplayValue: 882.718456, pnlPct: 17.234567,
  color: '#53d0a4', ...overrides,
});
function harness(overrides = {}) {
  hooks.reset();
  const props = {
    language: 'zh', tableTab: 'watchlist', rows: [row()],
    formatPrice: value => `$${value}`, formatChange: value => `${value}%`,
    formatDrawdown: value => `${value}%`, formatPnl: value => `¥${value}`,
    formatPnlPct: value => `${value}%`, marketColor: () => '#53d0a4', ...overrides,
  };
  const render = () => hooks.render(HomeWatchlistReport, props);
  return { props, render, html: () => renderToStaticMarkup(render()) };
}

test('the report stays presentation-only and keeps narrow-screen values untruncated', () => {
  assert.doesNotMatch(source, /\b(?:fetch|insert|upsert|update|delete)\s*\(|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|service_role|EODHD_API_KEY/);
  const imports = [...source.matchAll(/\b(?:from\s+|import\s+)(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.ok(imports.every(module => ['react', 'lucide-react', '../lib/stockRsiPresentation.js', './HomeWatchlistReport.css'].includes(module)));
  assert.doesNotMatch(source.replace('rsi.value.toFixed(1)', 'rsiDisplayValue'), /\.sort\(|\.toFixed\(|displayRate|exchangeRate|Math\.round/);
  assert.match(css, /@media\s*\(max-width:\s*359px\)/);
  assert.match(css, /--hwr-columns:\s*minmax\(0,\s*1fr\)/);
  const defaultScrollRule = css.match(/\.hwr-table-scroll\s*\{([^}]+)\}/)?.[1];
  assert.ok(defaultScrollRule, 'the default table wrapper must stay inert');
  assert.doesNotMatch(defaultScrollRule, /overflow-x:\s*(?:auto|scroll)/);
  assert.match(css, /\.hwr-table-scroll\.has-rsi\s*\{[^}]*overflow-x:\s*auto/);
  for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(match[1]) >= 10, 'all financial and helper text must meet the 10px minimum');
  }
  for (const selector of ['hwr-price', 'hwr-change', 'hwr-aux-value']) {
    const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(rule, `${selector} needs a scoped rule`);
    assert.doesNotMatch(rule, /text-overflow:\s*ellipsis|overflow:\s*hidden/);
  }
  assert.match(css, /\.hwr-aux-value\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow-wrap:\s*anywhere/);
});

test('watchlist has separate RSI and divergence after Today while holdings keep three columns', () => {
  const h = harness({ rows: [row({ stockRsi: signal() })] });
  const tree = h.render();
  const cells = React.Children.toArray(byClass(tree, 'hwr-row-main')[0].props.children);
  assert.deepEqual(cells.map(cell => cell.props.className), ['hwr-identity', 'hwr-price', 'hwr-change', 'hwr-rsi', 'hwr-divergence']);
  assert.equal(text(cells[0]), 'NVNVDA英伟达');
  assert.equal(text(cells[1]), '$223.674321');
  assert.equal(text(cells[2]), '-0.91%');
  assert.deepEqual(cells[2].props.style, { color: '#53d0a4' });
  const headings = React.Children.toArray(byClass(tree, 'hwr-column-headings')[0].props.children);
  assert.deepEqual(headings.slice(0, 3).map(heading => heading.props.sortKey), ['drawdown', 'price', 'change']);
  assert.equal(text(headings[3]), 'RSI(6)');
  assert.equal(text(headings[4]), '顶背离');
  const scroll = byClass(tree, 'hwr-table-scroll')[0];
  assert.match(scroll.props.className, /\bhas-rsi\b/);
  assert.equal(scroll.props.tabIndex, 0);
  assert.match(scroll.props['aria-label'], /左右滑动/);
  assert.match(css, /--hwr-extra-width:\s*calc\(var\(--hwr-rsi-width\) \+ var\(--hwr-divergence-width\) \+ 16px\)/);
  assert.match(css, /--hwr-extra-width:\s*calc\(var\(--hwr-rsi-width\) \+ var\(--hwr-divergence-width\) \+ 12px\)/);
  assert.match(css, /grid-template-columns:\s*var\(--hwr-columns\) var\(--hwr-rsi-width\) var\(--hwr-divergence-width\)/);

  h.props.tableTab = 'positions';
  const holdings = h.render();
  assert.equal(byClass(holdings, 'hwr-rsi').length, 0);
  assert.equal(byClass(holdings, 'hwr-divergence').length, 0);
  assert.equal(React.Children.toArray(byClass(holdings, 'hwr-row-main')[0].props.children).length, 3);
  const holdingsScroll = byClass(holdings, 'hwr-table-scroll')[0];
  assert.doesNotMatch(holdingsScroll.props.className, /\bhas-rsi\b/);
  assert.equal(holdingsScroll.props.tabIndex, undefined);
  assert.equal(holdingsScroll.props['aria-label'], undefined);
});

test('the pinned stock identity cannot stretch over Today when the indicator columns are revealed', () => {
  const pinnedRule = css.match(/\.has-rsi \.hwr-identity,\s*\.has-rsi \.hwr-aux-sort\s*\{([^}]+)\}/)?.[1];
  assert.ok(pinnedRule, 'stock identity and its heading need the same bounded sticky surface');
  assert.match(pinnedRule, /position:\s*sticky/);
  assert.match(pinnedRule, /justify-self:\s*start/);
  assert.match(pinnedRule, /width:\s*min\(100%,\s*var\(--hwr-pinned-width\)\)/);

  const mediaRules = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{/g)].map(match => {
    let depth = 1;
    let end = match.index + match[0].length;
    const start = end;
    while (depth && end < css.length) {
      if (css[end] === '{') depth++;
      if (css[end] === '}') depth--;
      end++;
    }
    return { maxWidth: Number(match[1]), body: css.slice(start, end - 1) };
  });
  const baseRules = css.slice(0, css.indexOf('@media'));
  for (const viewport of [320, 356, 359, 360, 389, 390, 420, 421, 440]) {
    const rules = [baseRules, ...mediaRules.filter(rule => viewport <= rule.maxWidth).map(rule => rule.body)].join('\n');
    const sizes = Object.fromEntries([...rules.matchAll(/--hwr-(rsi-width|divergence-width|pinned-width):\s*(\d+)px/g)]
      .map(match => [match[1], Number(match[2])]));
    const tracks = [...rules.matchAll(/--hwr-columns:\s*minmax\(0,\s*1fr\)\s+minmax\((\d+)px,\s*max-content\)\s+minmax\((\d+)px,\s*max-content\)/g)].at(-1);
    assert.ok(tracks, 'the approved initial price and Today tracks must remain available');
    const extraGap = Number([...rules.matchAll(/--hwr-extra-width:\s*calc\(var\(--hwr-rsi-width\)\s*\+\s*var\(--hwr-divergence-width\)\s*\+\s*(\d+)px\)/g)].at(-1)?.[1]);
    const contentWidth = viewport - 32;
    const extraWidth = sizes['rsi-width'] + sizes['divergence-width'] + extraGap;
    const todayStartAfterScroll = contentWidth - Number(tracks[2]) - extraWidth;
    assert.ok(todayStartAfterScroll >= sizes['pinned-width'] + 6,
      `${viewport}px: the complete Today track must clear the pinned stock surface, including a readable gap`);
  }
});

test('horizontal scrolling hides the complete price column at the pinned boundary and restores it on return', t => {
  const computedStyleDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  const heading = {};
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: element => {
    assert.equal(element, heading);
    return { columnGap: '8px' };
  } });
  t.after(() => {
    if (computedStyleDescriptor) Object.defineProperty(globalThis, 'getComputedStyle', computedStyleDescriptor);
    else delete globalThis.getComputedStyle;
  });

  const h = harness({ rows: [row({ stockRsi: signal() })] });
  const onScroll = byClass(h.render(), 'hwr-table-scroll')[0].props.onScroll;
  assert.equal(typeof onScroll, 'function');
  let priceLeft = 0;
  let longPriceLeft = null;
  let writes = 0;
  const table = {
    scrollLeft: 0,
    dataset: new Proxy({}, { set(target, key, value) { writes++; target[key] = value; return true; } }),
    querySelector(selector) {
      if (selector === '.hwr-aux-sort') return { getBoundingClientRect: () => ({ right: 112 }) };
      if (selector === '.hwr-price-sort') return { parentElement: heading, getBoundingClientRect: () => ({ left: priceLeft }) };
      assert.fail(`unexpected selector ${selector}`);
    },
    querySelectorAll(selector) {
      assert.equal(selector, '.hwr-price');
      return [
        { getBoundingClientRect: () => ({ left: priceLeft }) },
        { getBoundingClientRect: () => ({ left: longPriceLeft ?? priceLeft }) },
      ];
    },
  };
  for (const [scrollLeft, left, expected, expectedWrites] of [
    [0, 0, 'false', 1],
    [96, 120, 'false', 1],
    [97, 119.5, 'true', 2],
    [140, 75, 'true', 2],
    [50, 130, 'false', 3],
    [0, 60, 'false', 3],
  ]) {
    table.scrollLeft = scrollLeft;
    priceLeft = left;
    onScroll({ currentTarget: table });
    assert.equal(table.dataset.priceObscured, expected, `scrollLeft ${scrollLeft}, price left ${left}`);
    assert.equal(writes, expectedWrites, 'repeated scroll events must not rewrite an unchanged visibility state');
  }
  table.scrollLeft = 80;
  priceLeft = 130;
  longPriceLeft = 116;
  onScroll({ currentTarget: table });
  assert.equal(table.dataset.priceObscured, 'true', 'a wider price value must hide the whole column before its narrower heading overlaps');
  assert.equal(writes, 4);
  longPriceLeft = 121;
  onScroll({ currentTarget: table });
  assert.equal(table.dataset.priceObscured, 'false', 'prices return once every row clears the pinned boundary');
  assert.equal(writes, 5);
  const clippingRule = css.match(/\.has-rsi\[data-price-obscured="true"\] \.hwr-price,\s*\.has-rsi\[data-price-obscured="true"\] \.hwr-price-sort\s*\{([^}]+)\}/)?.[1];
  assert.ok(clippingRule, 'the price heading and all price values must disappear together');
  assert.match(clippingRule, /visibility:\s*hidden/);
  assert.doesNotMatch(clippingRule, /display:\s*none|width:|grid-template/);
  assert.equal(text(sortControl(h.render(), 'change')).trim(), '今日涨跌');
  assert.equal(text(byClass(h.render(), 'hwr-change')[0]), '-0.91%');
  h.props.tableTab = 'positions';
  assert.equal(byClass(h.render(), 'hwr-table-scroll')[0].props.onScroll, undefined);
});

test('narrow indicator columns keep long English labels inside the cell and preserve full stock accessibility', () => {
  const zoneRules = [...css.matchAll(/\.hwr-rsi-zone\s*\{([^}]+)\}/g)].map(match => match[1]).join('\n');
  assert.match(zoneRules, /max-width:\s*100%/);
  assert.match(zoneRules, /white-space:\s*normal/);
  const h = harness({ language: 'en', onOpenStock: () => {}, rows: [row({
    symbol: 'LONGSYMBOL', displayName: 'Long Company Name Incorporated', stockRsi: signal({ value: 95 }),
  })] });
  const stockRow = byClass(h.render(), 'hwr-row')[0];
  assert.equal(stockRow.props['aria-label'], 'Open LONGSYMBOL stock details');
  assert.equal(text(byClass(h.render(), 'hwr-rsi-zone')[0]), 'Overbought');
  assert.equal(text(sortControl(h.render(), 'change')).trim(), 'Today');
});

test('invalid signal values and metadata stay missing instead of becoming neutral or no divergence', () => {
  const invalidSignals = [
    null, undefined, {},
    ...[null, undefined, '', ' ', '82.6', true, false, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 100.1]
      .map(value => signal({ value })),
    ...[14, '6', null].map(period => signal({ period })),
    ...['close', '', null].map(priceBasis => signal({ priceBasis })),
    ...['2026-02-30', '2026-13-01', '2026-9-11', '', null].map(asOf => signal({ asOf })),
  ];
  for (const stockRsi of invalidSignals) {
    const tree = harness({ rows: [row({ stockRsi })] }).render();
    assert.equal(text(byClass(tree, 'hwr-rsi-value')[0]), '—');
    assert.equal(byClass(tree, 'hwr-rsi-zone').length, 0);
    assert.equal(byClass(tree, 'hwr-rsi')[0].props['data-rsi-zone'], undefined);
    assert.equal(text(byClass(tree, 'hwr-divergence')[0]), '—');
  }
  const tree = harness({ rows: [
    row({ stockRsi: Object.freeze(signal({ value: 0 })) }),
    row({ symbol: 'AAPL' }),
    row({ symbol: 'TSLA', stockRsi: Object.freeze(signal({ value: 100 })) }),
  ] }).render();
  assert.deepEqual(byClass(tree, 'hwr-rsi-value').map(text), ['0.0', '—', '100.0']);
  assert.deepEqual(byClass(tree, 'hwr-divergence').map(text), ['动量正常', '—', '动量正常']);
});

test('RSI zones honor the approved inclusive boundaries without using rounded display values', () => {
  const cases = [
    [0, 'oversold', '超卖'], [20, 'oversold', '超卖'], [20.01, 'neutral', '中性'],
    [79.99, 'neutral', '中性'], [80, 'overbought', '超买'], [89.99, 'overbought', '超买'],
    [90, 'overbought', '超买'], [100, 'overbought', '超买'],
  ];
  for (const [value, zone, label] of cases) {
    const tree = harness({ rows: [row({ stockRsi: signal({ value }) })] }).render();
    assert.equal(text(byClass(tree, 'hwr-rsi-value')[0]), value.toFixed(1));
    assert.equal(byClass(tree, 'hwr-rsi')[0].props['data-rsi-zone'], zone);
    assert.equal(text(byClass(tree, 'hwr-rsi-zone')[0]), label);
    assert.equal(byClass(tree, 'hwr-rsi')[0].props.title, '日线 RSI(6) · 2026-09-11');
  }
});

test('the shared RSI palette stays consistent with the Home watchlist colors', () => {
  for (const value of [0, 20, 80, 89.99, 90, 100]) {
    const presentation = stockRsiPresentation(signal({ value }));
    const colorRule = css.match(new RegExp(`\\.hwr-rsi\\[data-rsi-zone="${presentation.zone}"\\]\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(colorRule?.includes(`--hwr-rsi-color: ${presentation.color}`));
  }
  assert.equal(stockRsiPresentation(signal({ value: 42 })).color, '#e4e4e7');
  assert.match(css, /--hwr-text:\s*#e4e4e7/);
  assert.equal(stockRsiPresentation(null).color, '#85858d');
});

test('momentum lifecycle stays independent of the RSI zone and keeps normal momentum visible', () => {
  for (const value of [0, 42, 79.9, 80, 90, 100]) {
    const tree = harness({ rows: [row({ stockRsi: lifecycleSignal('CONFIRMED', { value }) })] }).render();
    assert.equal(text(byClass(tree, 'hwr-divergence')[0]), '顶背离确认');
    assert.equal(byClass(tree, 'hwr-divergence')[0].props['data-divergence'], 'confirmed');
    assert.equal(byClass(tree, 'hwr-divergence')[0].props.title, '顶背离确认 · 2026-09-09');
    assert.doesNotMatch(text(byClass(tree, 'hwr-rsi')[0]), /顶背离/);
  }
  for (const overrides of [
    { divergenceState: null }, { divergenceState: 'pending' }, { divergenceVersion: 'old' },
    { divergenceState: 'CONFIRMED', divergenceDate: null },
    { divergenceState: 'CONFIRMED', divergenceDate: '2026-09-12' },
    { divergenceState: 'CONFIRMED', divergenceDate: '2026-02-30' },
  ]) {
    const tree = harness({ rows: [row({ stockRsi: signal(overrides) })] }).render();
    assert.equal(text(byClass(tree, 'hwr-rsi-value')[0]), '82.6');
    assert.equal(text(byClass(tree, 'hwr-divergence')[0]), '—');
  }
  const english = harness({ language: 'en', rows: [row({ displayName: 'NVIDIA', stockRsi: lifecycleSignal('CONFIRMED', { value: 91.2 }) })] });
  assert.equal(text(byClass(english.render(), 'hwr-rsi-zone')[0]), 'Overbought');
  assert.equal(text(byClass(english.render(), 'hwr-divergence')[0]), 'Divergence confirmed');
  assert.doesNotMatch(english.html(), /[\u3400-\u9fff]/);
});

test('development fixtures use the real row contract without introducing production preview fallbacks', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
  assert.match(source, /const rsi = item\.stockRsi/);
  assert.doesNotMatch(source, /rsiPreviewBySymbol|homeWatchlistRsiPreview|mockHomeWatchlistRsi/);
  assert.match(preview, /stockRsi:\s*mockHomeWatchlistRsi\[row\.symbol\]\s*\?\?\s*null/);
  assert.doesNotMatch(preview, /homeWatchlistRsiPreview/);
  assert.doesNotMatch(app, /rsiPreviewBySymbol|homeWatchlistRsiPreview|mockHomeWatchlistRsi/);
});

test('null, undefined, empty and non-finite market data stay missing without calling formatters', () => {
  for (const missing of [null, undefined, '', Number.NaN, Number.POSITIVE_INFINITY]) {
    const calls = [];
    const formatter = value => { calls.push(value); return 'fabricated'; };
    const h = harness({
      rows: [row({ price: missing, changePct: missing, highDrawdown: missing })],
      formatPrice: formatter, formatChange: formatter, formatDrawdown: formatter,
    });
    const tree = h.render();
    assert.equal(text(byClass(tree, 'hwr-price')[0]), '—');
    assert.equal(text(byClass(tree, 'hwr-change')[0]), '—');
    assert.equal(text(byClass(tree, 'hwr-aux-value')[0]), '—');
    assert.deepEqual(calls, []);
    assert.doesNotMatch(h.html(), /NaN|Infinity|fabricated/);
  }
});

test('zero remains a valid change or P&L, while a zero quote is not fabricated as a price', () => {
  const seen = [];
  const h = harness({
    tableTab: 'positions',
    rows: [row({ price: 0, changePct: 0, pnlValue: 0, pnlDisplayValue: 0, pnlPct: 0 })],
    formatPrice: () => assert.fail('zero price should stay unavailable'),
    formatChange: value => { seen.push(['change', value]); return '0.00%'; },
    formatPnl: value => { seen.push(['pnl', value]); return '¥0.00'; },
    formatPnlPct: value => { seen.push(['pnlPct', value]); return '0.00%'; },
  });
  const tree = h.render();
  assert.equal(text(byClass(tree, 'hwr-price')[0]), '—');
  assert.equal(text(byClass(tree, 'hwr-change')[0]), '0.00%');
  assert.equal(text(byClass(tree, 'hwr-aux-value')[0]), '¥0.000.00%');
  assert.deepEqual(seen, [['change', 0], ['pnl', 0], ['pnlPct', 0]]);
});

test('rows keep parent order and original formatter values without rounding or currency recomputation', () => {
  const calls = [];
  const input = Object.freeze(row());
  const second = Object.freeze(row({ symbol: 'AAPL', price: 101.987654 }));
  const h = harness({
    tableTab: 'positions', rows: Object.freeze([input, second]),
    sortState: { key: 'price', direction: 'asc' },
    formatPrice: value => { calls.push(['price', value]); return `EXACT $${value}`; },
    formatChange: value => { calls.push(['change', value]); return `EXACT ${value}%`; },
    formatPnl: value => { calls.push(['pnl', value]); return `EXACT ¥${value}`; },
    formatPnlPct: value => { calls.push(['pnlPct', value]); return `EXACT ${value}%`; },
  });
  const tree = h.render();
  assert.deepEqual(byClass(tree, 'hwr-symbol').map(text), ['NVDA', 'AAPL']);
  assert.equal(text(byClass(tree, 'hwr-price')[0]), 'EXACT $223.674321');
  assert.equal(text(byClass(tree, 'hwr-aux-value')[0]), 'EXACT ¥882.718456EXACT 17.234567%');
  assert.deepEqual(calls.slice(0, 4), [
    ['price', input.price], ['change', input.changePct], ['pnl', input.pnlDisplayValue], ['pnlPct', input.pnlPct],
  ]);
});

test('watchlist alone exposes add, edit and detail callbacks while tab selection stays controlled', () => {
  const actions = [];
  const h = harness({
    onAdd: () => actions.push('add'), onEdit: () => actions.push('edit'),
    onOpenStock: symbol => actions.push(symbol), onTabChange: tab => actions.push(tab),
  });
  let tree = h.render();
  const add = nodes(tree, node => node.props['aria-label'] === '添加自选股票')[0];
  const edit = nodes(tree, node => node.props['aria-label'] === '编辑自选股票')[0];
  const identity = byClass(tree, 'hwr-identity')[0];
  const stockRow = byClass(tree, 'hwr-row')[0];
  assert.equal(identity.type, 'div');
  assert.equal(identity.props.onClick, undefined);
  assert.equal(stockRow.props.role, 'button');
  assert.equal(stockRow.props.tabIndex, 0);
  assert.equal(stockRow.props['aria-label'], '打开 NVDA 股票详情');
  assert.equal(nodes(stockRow, node => node.type === 'button').length, 0, 'row action must not contain nested buttons');
  add.props.onClick(); edit.props.onClick();
  bubbleClick(tree, byClass(tree, 'hwr-symbol')[0]);
  nodes(tree, node => node.props.role === 'tab')[1].props.onClick();
  assert.deepEqual(actions, ['add', 'edit', 'NVDA', 'positions']);
  assert.equal(nodes(h.render(), node => node.props.role === 'tab')[0].props['aria-selected'], true);
  h.props.tableTab = 'positions';
  tree = h.render();
  assert.equal(byClass(tree, 'hwr-identity')[0].type, 'div');
  assert.equal(byClass(tree, 'hwr-identity')[0].props.onClick, undefined);
  for (const key of ['role', 'tabIndex', 'onClick', 'onPointerDown', 'onKeyDown']) {
    assert.equal(byClass(tree, 'hwr-row')[0].props[key], undefined, `holdings must remain inert: ${key}`);
  }
  assert.equal(byClass(tree, 'hwr-actions').length, 0);
});

test('watchlist price, daily change, RSI and lower-row values open their own stock exactly once', () => {
  const opened = [];
  const tree = harness({ rows: [row(), row({ symbol: 'MSFT' })], onOpenStock: symbol => opened.push(symbol) }).render();
  for (const className of ['hwr-price', 'hwr-change', 'hwr-rsi-value', 'hwr-divergence', 'hwr-aux-value']) {
    const target = byClass(tree, className)[1];
    assert.ok(bubbleClick(tree, target), `${className} must belong to the actionable row`);
    assert.equal(opened.length, ['hwr-price', 'hwr-change', 'hwr-rsi-value', 'hwr-divergence', 'hwr-aux-value'].indexOf(className) + 1);
  }
  assert.deepEqual(opened, ['MSFT', 'MSFT', 'MSFT', 'MSFT', 'MSFT']);
});

test('horizontal and vertical swipes stay cancelled after returning to the starting point and rerendering', () => {
  const opened = [];
  const h = harness({ onOpenStock: symbol => opened.push(symbol) });
  const scroller = { scrollLeft: 0 };
  const currentTarget = { closest: () => scroller };
  for (const movement of [{ clientX: 109, clientY: 100 }, { clientX: 100, clientY: 109 }]) {
    let stockRow = byClass(h.render(), 'hwr-row')[0];
    stockRow.props.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, currentTarget });
    stockRow.props.onPointerMove({ pointerId: 1, ...movement });
    stockRow.props.onPointerMove({ pointerId: 1, clientX: 100, clientY: 100 });
    stockRow = byClass(h.render(), 'hwr-row')[0];
    stockRow.props.onClick({ detail: 1 });
  }
  assert.deepEqual(opened, [], 'a swipe must not navigate even when the pointer returns before release');
  const stockRow = byClass(h.render(), 'hwr-row')[0];
  stockRow.props.onPointerDown({ pointerId: 2, clientX: 100, clientY: 100, currentTarget });
  stockRow.props.onPointerMove({ pointerId: 2, clientX: 104, clientY: 102 });
  stockRow.props.onClick({ detail: 1 });
  assert.deepEqual(opened, ['NVDA'], 'the following clean tap must work despite previous cancelled gestures');
});

test('native pointer cancellation and horizontal scroll movement suppress touch navigation', () => {
  const opened = [];
  const tree = harness({ onOpenStock: symbol => opened.push(symbol) }).render();
  const stockRow = byClass(tree, 'hwr-row')[0];
  const scroller = { scrollLeft: 0 };
  const currentTarget = { closest: () => scroller };
  stockRow.props.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, currentTarget });
  stockRow.props.onPointerCancel();
  bubbleClick(tree, byClass(tree, 'hwr-change')[0]);
  stockRow.props.onPointerDown({ pointerId: 2, clientX: 100, clientY: 100, currentTarget });
  scroller.scrollLeft = 60;
  bubbleClick(tree, byClass(tree, 'hwr-rsi-value')[0]);
  assert.deepEqual(opened, []);
  stockRow.props.onPointerDown({ pointerId: 3, clientX: 100, clientY: 100, currentTarget });
  bubbleClick(tree, byClass(tree, 'hwr-rsi-value')[0]);
  assert.deepEqual(opened, ['NVDA'], 'tapping a value after scrolling has stopped must open details');
});

test('keyboard and assistive actions bypass cancelled pointer gestures without repeated-key navigation', () => {
  const opened = [];
  const tree = harness({ onOpenStock: symbol => opened.push(symbol) }).render();
  const stockRow = byClass(tree, 'hwr-row')[0];
  const currentTarget = { closest: () => ({ scrollLeft: 0 }) };
  stockRow.props.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, currentTarget });
  stockRow.props.onPointerCancel();
  let prevented = 0;
  for (const key of ['Enter', ' ']) {
    const event = { target: currentTarget, currentTarget, key, repeat: false, preventDefault: () => { prevented++; } };
    stockRow.props.onKeyDown(event);
    stockRow.props.onKeyDown({ ...event, repeat: true });
  }
  assert.equal(prevented, 4, 'Enter and Space prevent their default action including repeated keys');
  assert.deepEqual(opened, ['NVDA', 'NVDA'], 'each deliberate key action navigates once');
  stockRow.props.onKeyDown({ target: {}, currentTarget, key: 'Enter', preventDefault: assert.fail });
  stockRow.props.onKeyDown({ target: currentTarget, currentTarget, key: 'ArrowRight', preventDefault: assert.fail });
  stockRow.props.onClick({ detail: 0 });
  assert.deepEqual(opened, ['NVDA', 'NVDA', 'NVDA'], 'assistive clicks remain available after a cancelled touch gesture');
});

test('auxiliary metric remembers each tab and delegates visible sort state to the parent', () => {
  const sorted = [];
  const h = harness({ onSort: key => sorted.push(key) });
  let tree = h.render();
  assert.equal(text(byClass(tree, 'hwr-aux-label')[0]), '距 52 周高点');
  byClass(tree, 'hwr-metric-chip').find(node => text(node) === '年内涨幅').props.onClick();
  tree = h.render();
  assert.equal(text(byClass(tree, 'hwr-aux-label')[0]), '年内涨幅');
  assert.equal(text(byClass(tree, 'hwr-aux-value')[0]), '13.37%');
  sortControl(tree, 'ytd').props.onClick();
  sortControl(tree, 'price').props.onClick();
  sortControl(tree, 'change').props.onClick();
  assert.deepEqual(sorted, ['ytd', 'price', 'change']);
  h.props.sortState = { key: 'ytd', direction: 'desc' };
  assert.match(sortControl(h.render(), 'ytd').props.className, /is-active/);
  assert.match(sortControl(h.render(), 'ytd').props['aria-label'], /当前降序，点击升序排列/);
  h.props.tableTab = 'positions';
  assert.equal(text(byClass(h.render(), 'hwr-aux-label')[0]), '持仓盈亏');
  sortControl(h.render(), 'pnl').props.onClick();
  assert.equal(sorted.at(-1), 'pnl');
  h.props.tableTab = 'watchlist';
  assert.equal(text(byClass(h.render(), 'hwr-aux-label')[0]), '年内涨幅');
});

test('empty lists and English controls are complete without native select or unlabeled icon actions', () => {
  const empty = harness({ rows: [] });
  assert.match(empty.html(), /暂无自选股票/);
  empty.props.tableTab = 'positions';
  assert.match(empty.html(), /暂无持仓记录/);
  const h = harness({ language: 'en', rows: [row({ displayName: 'NVIDIA' })] });
  const html = h.html();
  assert.match(html, /aria-label="Add a stock to watchlist"/);
  assert.match(html, /aria-label="Edit watchlist"/);
  assert.match(html, /aria-label="Open NVDA stock details"/);
  assert.doesNotMatch(html, /<select|<option|[\u3400-\u9fff]/);
  assert.match(html, /From 52W high/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /aria-pressed="true"/);
});
