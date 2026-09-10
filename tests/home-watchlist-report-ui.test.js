import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

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
  export default { ...React, useState };
`);
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/HomeWatchlistReport\.css\1;?/g, '')
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
const sortControl = (tree, key) => {
  const element = nodes(tree, node => node.props.sortKey === key)[0];
  return element?.type(element.props);
};
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
  assert.ok(imports.every(module => ['react', 'lucide-react', './HomeWatchlistReport.css'].includes(module)));
  assert.doesNotMatch(source, /\.sort\(|\.toFixed\(|displayRate|exchangeRate|Math\.round/);
  assert.match(css, /@media\s*\(max-width:\s*359px\)/);
  assert.match(css, /--hwr-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:auto|scroll)/);
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
  assert.equal(identity.type, 'button');
  assert.equal(identity.props['aria-label'], '打开 NVDA 股票详情');
  add.props.onClick(); edit.props.onClick(); identity.props.onClick();
  nodes(tree, node => node.props.role === 'tab')[1].props.onClick();
  assert.deepEqual(actions, ['add', 'edit', 'NVDA', 'positions']);
  assert.equal(nodes(h.render(), node => node.props.role === 'tab')[0].props['aria-selected'], true);
  h.props.tableTab = 'positions';
  tree = h.render();
  assert.equal(byClass(tree, 'hwr-identity')[0].type, 'div');
  assert.equal(byClass(tree, 'hwr-identity')[0].props.onClick, undefined);
  assert.equal(byClass(tree, 'hwr-actions').length, 0);
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
