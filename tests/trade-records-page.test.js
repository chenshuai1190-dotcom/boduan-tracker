import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { stockLogoCandidates } from '../src/lib/stockLogo.js';
import { stripStockTradeRecordKind, withStockTradeRecordKind } from '../src/lib/stockTradeRecordKind.js';
import { buildTradeRecordsView, getTradeRecordDateRange, isValidTradeRecordDate } from '../src/lib/tradeRecordsModel.js';

const source = readFileSync(new URL('../src/pages/TradeRecordsPage.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/TradeRecordsPage.css', import.meta.url), 'utf8');

test('standalone trade navigation reserves the iPhone safe area and keeps filters below the whole header', () => {
  const header = css.match(/\.trp-header\s*\{([^}]+)\}/)?.[1];
  const filters = css.match(/\.trp-filters-wrap\s*\{([^}]+)\}/)?.[1];
  assert.ok(header && filters);
  const height = header.match(/min-height:\s*([^;]+);/)?.[1];
  const filtersTop = filters.match(/top:\s*([^;]+);/)?.[1];
  assert.match(height, /env\(safe-area-inset-top,\s*0px\)/);
  assert.equal(filtersTop, height, 'sticky filters must include the same safe-area height as navigation');
  assert.match(header, /padding:\s*calc\(10px \+ env\(safe-area-inset-top,\s*0px\)\) 16px 10px;/,
    'back button, title and add action must sit below the status bar');
  assert.match(header, /position:\s*sticky;\s*top:\s*0;/, 'navigation stays accessible after scrolling');
});

const compiled = (await transformWithOxc(source, 'TradeRecordsPage.jsx', { jsx: { runtime: 'classic' } })).code
  .replace(/^import[^\n]*\n/gm, '').replace(/export default function /g, 'function ').replace(/export function /g, 'function ');
const names = ['ArrowLeft', 'ArrowUpDown', 'CalendarDays', 'Check', 'ChevronDown', 'ChevronRight', 'Pencil', 'Plus', 'Search', 'Trash2', 'X'];
const components = { ...Object.fromEntries(names.map(name => [name, () => React.createElement('svg', { 'data-icon': name })])),
  CurrencyToggle: () => null, TradeOutcomeReview: () => null, StockLogo: () => null };
const bindings = { ...components, stockLogoCandidates, stripStockTradeRecordKind, buildTradeRecordsView, getTradeRecordDateRange, isValidTradeRecordDate };
const factory = new Function('React', 'createPortal', 'window', 'document', ...Object.keys(bindings), `${compiled}\nreturn { Page: TradeRecordsPageContent, Wrapper: TradeRecordsPage };`);
const walk = node => !React.isValidElement(node) ? Array.isArray(node) ? node.flatMap(walk) : [] : [node, ...walk(node.props.children)];
const text = node => typeof node === 'boolean' ? '' : !React.isValidElement(node) ? Array.isArray(node) ? node.map(text).join('') : String(node ?? '') : text(node.props.children);
const byClass = (tree, cls) => walk(tree).filter(node => node.props.className?.split(' ').includes(cls));
const button = (tree, label) => walk(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label));
const rowIds = tree => byClass(tree, 'trp-row').map(node => node.key);
const NOW = Date.parse('2026-11-11T17:00:00Z');
const TRADES = Object.freeze([
  Object.freeze({ id: 'msft-new', symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-11-11', price: 100, shares: 2, fee: 1, currency: 'USD', note: 'Original <script> note' }),
  Object.freeze({ id: 'nvda-sell', symbol: 'NVDA', name: 'Nvidia', side: 'sell', date: '2026-11-10', price: 150, shares: 3, fee: 2, currency: 'USD', note: 'Trim position' }),
  Object.freeze({ id: 'msft-old', symbol: 'MSFT', name: 'Microsoft', side: 'sell', date: '2026-10-30', price: 90, shares: 1, fee: 1, currency: 'USD' }),
  Object.freeze({ id: 'google-old', symbol: 'GOOGL', name: 'Alphabet', side: 'buy', date: '2025-12-19', price: 200, shares: 1, fee: 1, currency: 'USD' }),
]);
function harness(initial = {}) {
  let cursor = 0, tree, props;
  const slots = [], effects = [], calls = [], scrolls = [], listeners = new Map();
  const window = { scrollY: 0, scrollTo(options) { this.scrollY = options.top; scrolls.push(options.top); } };
  const document = { body: { style: { overflow: '' } }, activeElement: null,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const same = (a, b) => a && b && a.length === b.length && b.every((item, i) => Object.is(item, a[i]));
  const hooks = { ...React,
    useCallback(callback) { return callback; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(calculate, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: calculate(), deps }; return slots[i].value; },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); }); } },
    useLayoutEffect(effect, deps) { hooks.useEffect(effect, deps); },
  };
  const { Page, Wrapper } = factory(hooks, children => children, window, document, ...Object.values(bindings));
  props = { trades: TRADES, userId: 'owner-a', now: NOW, usdRate: 7, language: 'zh', tradeId: null,
    onSelectTrade: id => { calls.push(['select', id]); props = { ...props, tradeId: id }; },
    onEdit: trade => calls.push(['edit', trade]), onDelete: trade => calls.push(['delete', trade]), onAdd: () => calls.push(['add']), onBack: () => calls.push(['back']), ...initial };
  return { calls, scrolls, window, document, listeners, Wrapper,
    render(patch = {}) { props = { ...props, ...patch }; cursor = 0; tree = Page(props); effects.splice(0).forEach(effect => effect()); return tree; },
    unmount() { for (const item of slots) item?.cleanup?.(); },
  };
}

test('list uses real filtered summaries and date groups without inventing profit metrics', () => {
  const h = harness(); const tree = h.render();
  assert.deepEqual(rowIds(tree), ['msft-new', 'nvda-sell', 'msft-old', 'google-old']);
  assert.match(text(byClass(tree, 'trp-summary')[0]), /买入金额\$400\.00卖出金额\$540\.00/);
  assert.match(text(byClass(tree, 'trp-summary')[0]), /交易笔数 4手续费 \$5\.00/);
  assert.deepEqual(byClass(tree, 'trp-date-heading').map(text), ['2026.11.111 笔', '2026.11.101 笔', '2026.10.301 笔', '2025.12.191 笔']);
  assert.doesNotMatch(text(tree), /净利润|胜率|示例数据/);
  button(tree, '新增交易').props.onClick(); assert.deepEqual(h.calls, [['add']]);
});

test('stock multi-select searches company names, cancels drafts, combines side filters and clears chips', () => {
  const h = harness(); let tree = h.render();
  button(tree, '股票代码').props.onClick(); tree = h.render();
  const input = walk(tree).find(node => node.type === 'input' && node.props.type === 'search');
  input.props.onChange({ target: { value: 'micro' } }); tree = h.render();
  const options = byClass(tree, 'trp-stock-options')[0];
  assert.equal(walk(options).filter(node => node.type === 'button').length, 1);
  walk(options).find(node => node.type === 'button').props.onClick(); tree = h.render();
  button(tree, '取消').props.onClick(); tree = h.render(); assert.equal(rowIds(tree).length, 4);
  button(tree, '股票代码').props.onClick(); tree = h.render();
  for (const symbol of ['MSFT', 'NVDA']) {
    walk(byClass(tree, 'trp-stock-options')[0]).find(node => node.type === 'button' && text(node).includes(symbol)).props.onClick(); tree = h.render();
  }
  button(tree, '确定 · 2').props.onClick(); tree = h.render(); assert.equal(rowIds(tree).length, 3);
  button(tree, '买卖方向').props.onClick(); tree = h.render();
  button(tree, '卖出').props.onClick(); tree = h.render(); button(tree, '确定').props.onClick(); tree = h.render();
  assert.deepEqual(rowIds(tree), ['nvda-sell', 'msft-old']);
  button(tree, '移除股票筛选 NVDA').props.onClick(); tree = h.render(); assert.deepEqual(rowIds(tree), ['msft-old']);
  button(tree, '清空筛选').props.onClick(); tree = h.render(); assert.equal(rowIds(tree).length, 4);
  assert.equal(h.document.body.style.overflow, '');
});

test('date presets use the model and invalid custom ranges stay open until corrected', () => {
  const h = harness(); let tree = h.render(); button(tree, '全部时间').props.onClick(); tree = h.render();
  button(tree, '上个月').props.onClick(); tree = h.render(); button(tree, '确定').props.onClick(); tree = h.render();
  assert.deepEqual(rowIds(tree), ['msft-old']);
  button(tree, '上个月').props.onClick(); tree = h.render(); button(tree, '自定义').props.onClick(); tree = h.render();
  let dates = walk(tree).filter(node => node.type === 'input' && node.props.type === 'date');
  dates[0].props.onChange({ target: { value: '2026-11-11' } }); dates[1].props.onChange({ target: { value: '2026-11-10' } }); tree = h.render();
  button(tree, '确定').props.onClick(); tree = h.render(); assert.match(text(tree), /开始日期应早于或等于结束日期/);
  assert.ok(walk(tree).find(node => node.props.role === 'dialog'));
  dates = walk(tree).filter(node => node.type === 'input' && node.props.type === 'date');
  dates[0].props.onChange({ target: { value: '2025-12-19' } }); dates[1].props.onChange({ target: { value: '2026-10-30' } }); tree = h.render();
  button(tree, '确定').props.onClick(); tree = h.render(); assert.deepEqual(rowIds(tree), ['msft-old', 'google-old']);
});

test('details update in place, delegate original rows to edit/delete, preserve list state and use real review', () => {
  const h = harness(); let tree = h.render(); button(tree, '切换日期排序').props.onClick(); tree = h.render();
  assert.equal(rowIds(tree)[0], 'google-old'); h.window.scrollY = 460;
  byClass(tree, 'trp-row').find(node => node.key === 'msft-new').props.onClick(); tree = h.render(); assert.equal(h.scrolls.at(-1), 0);
  assert.match(text(tree), /含费收支−\$201\.00/);
  assert.match(renderToStaticMarkup(tree), /Original &lt;script&gt; note/);
  const review = walk(tree).find(node => node.type === components.TradeOutcomeReview);
  assert.equal(review.props.trade, TRADES[0]); assert.equal(review.props.showNote, false); assert.equal(review.props.historyLoader, undefined);
  button(tree, '修改交易').props.onClick(); button(tree, '删除').props.onClick();
  assert.equal(h.calls.find(([action]) => action === 'edit')[1], TRADES[0]); assert.equal(h.calls.find(([action]) => action === 'delete')[1], TRADES[0]);
  const modified = Object.freeze({ ...TRADES[0], shares: 5, fee: 3 });
  tree = h.render({ trades: [modified, ...TRADES.slice(1)] }); assert.match(text(tree), /含费收支−\$503\.00/);
  assert.equal(byClass(tree, 'trp-detail').length, 1);
  button(tree, '返回交易记录').props.onClick(); tree = h.render(); assert.equal(h.scrolls.at(-1), 460); assert.equal(rowIds(tree)[0], 'google-old');
});

test('successful deletion returns to list, while loading/error do not masquerade as deletion', () => {
  const h = harness({ tradeId: 'msft-new' }); h.render();
  h.render({ trades: [], loading: true }); assert.deepEqual(h.calls, []);
  h.render({ loading: false, error: 'network unavailable' }); assert.deepEqual(h.calls, []);
  h.render({ error: '' }); assert.deepEqual(h.calls, [['select', null]]);
  assert.equal(byClass(h.render(), 'trp-detail').length, 0);
});

test('a detail opened from today’s orders returns there after deletion or a back tap', () => {
  const removed = harness({ tradeId: 'msft-new', fromTodayOrders: true });
  removed.render();
  removed.render({ trades: TRADES.slice(1), loading: true });
  assert.deepEqual(removed.calls, []);
  removed.render({ loading: false });
  assert.deepEqual(removed.calls, [['back']]);
  removed.render();
  assert.deepEqual(removed.calls, [['back']], 'the absent selection must not navigate twice');

  const back = harness({ tradeId: 'msft-new', fromTodayOrders: true });
  button(back.render(), '返回当日订单').props.onClick();
  assert.deepEqual(back.calls, [['back']]);
});

test('opening a today order does not replace the previously saved records list scroll', () => {
  const h = harness();
  h.render();
  h.window.scrollY = 420;
  h.render({ active: false });
  h.window.scrollY = 160;
  h.render({ tradeId: 'msft-new', active: true, fromTodayOrders: true });
  assert.equal(h.scrolls.at(-1), 0);
  h.window.scrollY = 240;
  h.render({ tradeId: null, active: false, fromTodayOrders: false });
  h.render({ active: true });
  assert.equal(h.scrolls.at(-1), 420);
});

test('historical holdings keep notes and average cost but never receive fictional execution cash flows', () => {
  const historical = { ...TRADES[0], recordKind: 'historical_holding', note: withStockTradeRecordKind('Original opening note', 'historical_holding') };
  const h = harness({ trades: [historical], tradeId: historical.id }); const tree = h.render();
  assert.match(text(tree), /历史持仓/); assert.match(text(tree), /记录日期/); assert.match(text(tree), /平均成本 · USD/);
  assert.match(text(tree), /含费收支—/); assert.match(text(tree), /Original opening note/); assert.doesNotMatch(text(tree), /record-kind/);
  assert.equal(walk(tree).find(node => node.type === components.TradeOutcomeReview).props.trade, historical);
  const list = h.render({ tradeId: null }); assert.match(text(list), /交易笔数 0/); assert.match(text(list), /另有 1 条历史持仓/);
});

test('totals follow system currency while unit execution prices always remain in USD', () => {
  const h = harness({ displayCurrency: 'CNY', tradeId: 'msft-new' }); let tree = h.render();
  assert.match(text(tree), /成交金额 CNY¥1,400\.00/); assert.match(text(tree), /成交价 · USD\$100\.00/); assert.match(text(tree), /含费收支−¥1,407\.00/);
  tree = h.render({ tradeId: null });
  assert.match(text(byClass(tree, 'trp-row')[0]), /2 股·\$100\.00/);
  tree = h.render({ displayCurrency: 'USD', tradeId: 'msft-new' });
  assert.match(text(tree), /成交价 · USD\$100\.00/); assert.match(text(tree), /手续费\$1\.00/);
  tree = h.render({ displayCurrency: 'CNY' });
  button(tree, '修改交易').props.onClick();
  assert.equal(h.calls.find(([action]) => action === 'edit')[1], TRADES[0]);
  assert.equal(TRADES[0].price, 100); assert.equal(TRADES[0].currency, 'USD');
  tree = h.render({ trades: [{ ...TRADES[0], fee: null }] }); assert.match(text(tree), /手续费—含费收支—/);
  tree = h.render({ usdRate: null }); assert.match(text(tree), /成交金额 CNY—/); assert.match(text(tree), /成交价 · USD\$100\.00/); assert.doesNotMatch(text(tree), /¥200\.00|¥700\.00/);
});

test('inactive pages retain filters and scroll but close sheets and do not mount review history', () => {
  const h = harness(); let tree = h.render(); button(tree, '切换日期排序').props.onClick(); tree = h.render(); h.window.scrollY = 310;
  tree = h.render({ active: false }); assert.equal(tree.props.hidden, true);
  h.window.scrollY = 0; tree = h.render({ active: true }); assert.equal(h.scrolls.at(-1), 310); assert.equal(rowIds(tree)[0], 'google-old');
  tree = h.render({ tradeId: 'msft-new', active: false }); assert.equal(walk(tree).filter(node => node.type === components.TradeOutcomeReview).length, 0);
  assert.notEqual(h.Wrapper({ userId: 'one' }).key, h.Wrapper({ userId: 'two' }).key, 'account changes remount all local filter and scroll state');
});

test('English UI is translated and the new styles respect the 12px text floor', () => {
  const h = harness({ language: 'en' }); const tree = h.render();
  assert.match(text(tree), /Trade records/); assert.match(text(tree), /Buy amount/); assert.match(text(tree), /Newest first/);
  assert.doesNotMatch(text(tree), /[\u3400-\u9fff]/);
  for (const match of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(match[1]) >= 12, match[0]);
});

test('pending saves disable mutation controls while authorized fixture and logo callbacks pass through unchanged', () => {
  const historyLoader = async () => null, cacheStockLogo = () => {};
  const h = harness({ pending: true, historyLoader, cacheStockLogo, logoCache: { MSFT: { url: 'https://example.test/msft.png' } } });
  let tree = h.render(); assert.equal(button(tree, '新增交易').props.disabled, true);
  tree = h.render({ tradeId: 'msft-new' });
  assert.equal(button(tree, '修改交易').props.disabled, true); assert.equal(button(tree, '删除').props.disabled, true);
  const review = walk(tree).find(node => node.type === components.TradeOutcomeReview);
  assert.equal(review.props.historyLoader, historyLoader);
  const logo = walk(tree).find(node => node.type === components.StockLogo);
  assert.equal(logo.props.onLogoLoad, cacheStockLogo); assert.equal(logo.props.urls[0], 'https://example.test/msft.png');
  assert.deepEqual(h.calls, []);
});

test('list and stock filters use actual stock logos with each symbol cache, matching details', () => {
  const cacheStockLogo = () => {};
  const logoCache = Object.fromEntries(['MSFT', 'NVDA', 'GOOGL'].map(symbol => [symbol, { url: `https://example.test/${symbol}.png` }]));
  const h = harness({ logoCache, cacheStockLogo }); let tree = h.render();
  const verify = (node, symbol) => {
    const logo = walk(node).find(child => child.type === components.StockLogo);
    assert.ok(logo, `${symbol} must use the shared stock logo`);
    assert.equal(logo.props.symbol, symbol);
    assert.equal(logo.props.urls[0], logoCache[symbol].url);
    assert.equal(logo.props.onLogoLoad, cacheStockLogo);
  };
  for (const row of byClass(tree, 'trp-row')) verify(row, TRADES.find(trade => trade.id === row.key).symbol);
  button(tree, '股票代码').props.onClick(); tree = h.render();
  for (const option of walk(byClass(tree, 'trp-stock-options')[0]).filter(node => node.type === 'button')) verify(option, option.key);
});

test('failed empty reads are not presented as an empty ledger or zero dollar summary', () => {
  const h = harness({ trades: [], error: 'offline' }); const tree = h.render();
  assert.match(text(tree), /交易记录暂未读取完整/);
  assert.doesNotMatch(text(byClass(tree, 'trp-summary')[0]), /\$0\.00|交易笔数 0/);
  assert.equal(byClass(tree, 'trp-empty').length, 0);
});

test('Escape dismisses filter drafts and releases the body scroll lock', () => {
  const h = harness(); let tree = h.render(); button(tree, '股票代码').props.onClick(); tree = h.render();
  assert.equal(h.document.body.style.overflow, 'hidden');
  let prevented = false;
  h.listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } }); tree = h.render();
  assert.equal(prevented, true); assert.equal(h.document.body.style.overflow, '');
  assert.equal(walk(tree).filter(node => node.props.role === 'dialog').length, 0);
  assert.equal(rowIds(tree).length, 4);
});

test('clearing the detail and hiding simultaneously preserves list scroll instead of the detail position', () => {
  const h = harness(); let tree = h.render(); h.window.scrollY = 390;
  byClass(tree, 'trp-row')[0].props.onClick(); tree = h.render(); assert.equal(h.scrolls.at(-1), 0);
  h.window.scrollY = 150;
  h.render({ tradeId: null, active: false });
  h.window.scrollY = 0;
  h.render({ active: true });
  assert.equal(h.scrolls.at(-1), 390);
});

test('company names stay in filters and details without repeating beside list amounts, and edits retain original names', () => {
  const h = harness({ stockDisplayName: (symbol, originalName) => symbol === 'MSFT' ? '微软' : originalName });
  let tree = h.render();
  assert.doesNotMatch(text(byClass(tree, 'trp-row').find(node => node.key === 'msft-new')), /微软|Microsoft/);
  button(tree, '股票代码').props.onClick(); tree = h.render();
  const searchInput = () => walk(tree).find(node => node.type === 'input' && node.props.type === 'search');
  searchInput().props.onChange({ target: { value: '微软' } }); tree = h.render();
  let options = walk(byClass(tree, 'trp-stock-options')[0]).filter(node => node.type === 'button');
  assert.equal(options.length, 1);
  assert.match(text(options[0]), /MSFT微软/);
  searchInput().props.onChange({ target: { value: 'Microsoft' } }); tree = h.render();
  options = walk(byClass(tree, 'trp-stock-options')[0]).filter(node => node.type === 'button');
  assert.equal(options.length, 1, 'the original name stays searchable alongside the localized display name');
  options[0].props.onClick(); tree = h.render();
  button(tree, '确定 · 1').props.onClick(); tree = h.render();
  assert.deepEqual(rowIds(tree), ['msft-new', 'msft-old']);
  byClass(tree, 'trp-row')[0].props.onClick(); tree = h.render();
  assert.match(text(byClass(tree, 'trp-detail-identity')[0]), /微软/);
  button(tree, '修改交易').props.onClick();
  const edited = h.calls.find(([action]) => action === 'edit')[1];
  assert.equal(edited, TRADES[0]);
  assert.equal(edited.name, 'Microsoft');
});
