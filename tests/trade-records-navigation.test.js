import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const callbacks = app.slice(app.indexOf('  const openTradeRecords ='), app.indexOf('  const openDcaLab ='));
const flags = app.slice(app.indexOf('  const isPnlReportPage ='), app.indexOf('  const ActiveTab ='));
const localBindings = trades.slice(trades.indexOf('  const [fallbackRecordsOpen,'), trades.indexOf('  const [scenarioPosition,'))
  .replaceAll('import.meta.env.DEV', 'false');
assert.ok(callbacks.includes('const selectTradeRecord') && localBindings.includes('const openRecordsPage'));

function appNavigation({ activePage = null, ownerId = 'owner', initialScroll = 0 } = {}) {
  const calls = [];
  const refs = { tradeRootScrollBeforeRecordsRef: { current: initialScroll }, pendingTradeRootScrollRef: { current: null } };
  const navigation = new Function('context', `
    const { activePage, user, tradeRootScrollBeforeRecordsRef, pendingTradeRootScrollRef,
      setTradeRecordSelection, setActiveTab, setActivePage, readRootScrollTop } = context;
    const activeTab = 'trades', useCallback = fn => fn;
    ${callbacks}
    return { openTradeRecords, closeTradeRecords, selectTradeRecord };
  `)({ ...refs, activePage, user: { id: ownerId }, readRootScrollTop: () => 540,
    setTradeRecordSelection: value => calls.push(['selection', value]),
    setActiveTab: value => calls.push(['tab', value]), setActivePage: value => calls.push(['page', value]) });
  return { navigation, calls, refs };
}

function localNavigation(ctx = {}, initialToolPanel = '') {
  const calls = [];
  const hooks = { useState: initial => [typeof initial === 'function' ? initial() : initial, value => calls.push(['state', value])], useEffect() {} };
  const navigate = new Function('React', 'ctx', 'initialToolPanel', 'setToolPanel', 'window', `${localBindings}
    return { recordsPageOpen, selectedTradeRecordId, openRecordsPage, closeRecordsPage, selectRecord };`)(
    hooks, ctx, initialToolPanel, value => calls.push(['panel', value]), { scrollTo: (...args) => calls.push(['scroll', ...args]) });
  return { ...navigate, calls };
}

test('App routes one owner-bound record selection and restores the original Trades scroll only on close', () => {
  const { navigation, calls, refs } = appNavigation();
  navigation.openTradeRecords();
  assert.deepEqual(calls.splice(0), [['selection', { ownerId: 'owner', id: null }], ['tab', 'trades'], ['page', 'trade-records']]);
  assert.equal(refs.tradeRootScrollBeforeRecordsRef.current, 540);
  navigation.selectTradeRecord(42);
  assert.deepEqual(calls.splice(0), [['selection', { ownerId: 'owner', id: '42' }]], 'detail selection does not replace the App route');
  navigation.selectTradeRecord(null);
  assert.deepEqual(calls.splice(0), [['selection', { ownerId: 'owner', id: null }]]);
  navigation.closeTradeRecords();
  assert.deepEqual(calls, [['selection', null], ['tab', 'trades'], ['page', null]]);
  assert.equal(refs.pendingTradeRootScrollRef.current, 540);
  const alreadyOpen = appNavigation({ activePage: 'trade-records', initialScroll: 210 });
  alreadyOpen.navigation.openTradeRecords('next');
  assert.equal(alreadyOpen.refs.tradeRootScrollBeforeRecordsRef.current, 210, 'opening a detail cannot overwrite the root scroll');
  const ownerGuard = app.match(/  const tradeRecordId = ([^;]+);/)?.[1];
  assert.ok(ownerGuard);
  const resolveId = new Function('tradeRecordSelection', 'user', `return ${ownerGuard};`);
  assert.equal(resolveId({ ownerId: 'owner', id: 'selected' }, { id: 'owner' }), 'selected');
  assert.equal(resolveId({ ownerId: 'owner', id: 'selected' }, { id: 'other' }), null);
  assert.doesNotMatch(callbacks, /pushState|replaceState|\bdb\.|\bsupabase\.|fetch\(|insert|upsert|delete/);
});

test('the actual App content keeps the same Trades component type and key for root, list and detail', async () => {
  const start = app.indexOf('<Suspense fallback={<TabFallback />}>');
  const end = app.indexOf('</Suspense>', start) + '</Suspense>'.length;
  assert.ok(start >= 0 && end > start);
  const content = app.slice(start, end);
  const compiled = await transformWithOxc(`
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    const Suspense = React.Suspense, TabFallback = () => null;
    export function TradesTab() { return null; }
    export function route(activePage, tradeRecordId) {
      const activeTab = 'trades', user = { id: 'owner' }, ActiveTab = TradesTab;
      ${flags}
      const activeTabCtx = { tradeRecordsOpen: isTradeRecordsPage, tradeRecordId };
      return (${content});
    }
  `, 'trade-records-app-route.jsx', { jsx: { runtime: 'classic' } });
  const { route, TradesTab } = await import(dataUrl(compiled.code));
  const rendered = [route(null, null), route('trade-records', null), route('trade-records', 'trade-1')].map(element => element.props.children);
  assert.ok(rendered.every(element => element.type === TradesTab));
  assert.ok(rendered.every(element => element.key === rendered[0].key), 'page navigation cannot remount the parent that owns the trade form');
  assert.deepEqual(rendered.map(element => element.props.ctx), [
    { tradeRecordsOpen: false, tradeRecordId: null }, { tradeRecordsOpen: true, tradeRecordId: null },
    { tradeRecordsOpen: true, tradeRecordId: 'trade-1' },
  ]);
  const context = app.slice(app.indexOf('  const tabCtx = {'), app.indexOf('  const activeTabCtx ='));
  for (const binding of ['openTradeRecords,', 'closeTradeRecords,', 'selectTradeRecord,', 'tradeRecordsOpen: isTradeRecordsPage,', 'tradeRecordId,']) assert.ok(context.includes(binding));
});

test('both list entries and a today-order click call the same controlled page opener', () => {
  const events = [];
  const local = localNavigation({ tradeRecordsOpen: false, tradeRecordId: null, openTradeRecords: id => events.push(['open', id]) });
  const tools = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('</ActionModalCard>', trades.indexOf('{showAllToolsModal && (')));
  const handler = tools.match(/onSelect=\{\(toolId\) => \{([\s\S]*?)\}\}\s*\/>/)?.[1];
  const shortcut = trades.slice(trades.indexOf('<section className="trades-report-tools"'), trades.indexOf('{showAllToolsModal && ('));
  const shortcutHandler = shortcut.match(/onClick=\{\(\) => \{([\s\S]*?)\}\}><span/)?.[1];
  const todayHandler = trades.match(/className="trades-report-order" onClick=\{\(\) => ([^}]+)\}/)?.[1];
  assert.ok(handler && shortcutHandler && todayHandler);
  new Function('toolId', 'setShowAllToolsModal', 'openRecordsPage', handler)('records', value => events.push(['sheet', value]), local.openRecordsPage);
  assert.deepEqual(events.splice(0), [['sheet', false], ['open', null]]);
  assert.deepEqual(local.calls.splice(0), [['panel', '']]);
  new Function('item', 'setColorMenuOpen', 'openRecordsPage', shortcutHandler)({ id: 'records' }, value => events.push(['color', value]), local.openRecordsPage);
  assert.deepEqual(events.splice(0), [['color', false], ['open', null]]);
  new Function('trade', 'openRecordsPage', todayHandler)({ id: 'real-trade-id' }, local.openRecordsPage);
  assert.deepEqual(events, [['open', 'real-trade-id']]);
  assert.doesNotMatch(`${handler}\n${shortcutHandler}\n${todayHandler}`, /pushState|replaceState|\bdb\.|\bsupabase\.|fetch\(/);
});

test('controlled navigation wins over preview fallbacks without writing a transaction', () => {
  const events = [];
  const local = localNavigation({ tradeRecordsOpen: false, tradeRecordId: null,
    openTradeRecords: id => events.push(['open', id]), closeTradeRecords: () => events.push(['close']),
    selectTradeRecord: id => events.push(['select', id]) }, 'records');
  assert.equal(local.recordsPageOpen, false); assert.equal(local.selectedTradeRecordId, null);
  local.openRecordsPage('trade'); local.selectRecord(null); local.closeRecordsPage();
  assert.deepEqual(events, [['open', 'trade'], ['select', null], ['close']]);
  assert.deepEqual(local.calls, [['panel', '']], 'controlled routing must not mutate fallback state');
  assert.equal(localNavigation({}, 'records').recordsPageOpen, true, 'the existing explicit preview entry still opens the records page');
  assert.doesNotMatch(localBindings, /pushState|replaceState|\bdb\.|\bsupabase\.|addTrade\(|deleteStockTradeRecord\(/);
});

test('record presentation stays mounted after first use and forwards the original edit/delete/form callbacks', async () => {
  const start = trades.indexOf('{(recordsEverOpened || recordsPageOpen) &&');
  const end = trades.indexOf('\n      </div>}', start) + '\n      </div>}'.length;
  assert.ok(start >= 0 && end > start);
  const element = trades.slice(start, end).replaceAll('import.meta.env.DEV', 'false');
  const compiled = await transformWithOxc(`
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    export function TradeRecordsPage() { return null; }
    export function render(options) {
      const { recordsEverOpened, recordsPageOpen, stockTrades, openTradeEditModal, confirmDeleteTodayTrade, openTradeModal } = options;
      const ctx = { user: { id: 'owner' } }, language = 'zh', marketColorMode = 'red-up', displayCurrency = 'USD', usdRate = 7;
      const setCurrencyMode = () => {}, stockHoldingsReady = true, stockHoldingsError = null, selectedTradeRecordId = 'trade';
      const selectRecord = () => {}, closeRecordsPage = () => {}, tradeSubmitting = true, logoCache = {}, cacheStockLogo = () => {};
      const stockDisplayName = (symbol, name) => name || symbol;
      return <>${element}</>;
    }
  `, 'trade-records-mounted-page.jsx', { jsx: { runtime: 'classic' } });
  const { render, TradeRecordsPage } = await import(dataUrl(compiled.code));
  const actions = [], stockTrades = [{ id: 'trade', updatedAt: 'version', recordKind: 'historical_holding', note: 'original' }];
  const edit = row => actions.push(['edit', row]), remove = row => actions.push(['delete', row]);
  const options = { recordsEverOpened: false, recordsPageOpen: false, stockTrades,
    openTradeEditModal: edit, confirmDeleteTodayTrade: remove, openTradeModal: (...args) => actions.push(['add', ...args]) };
  assert.equal(render(options).props.children, false, 'unused records do not mount or fetch');
  const opened = render({ ...options, recordsPageOpen: true }).props.children;
  const closed = render({ ...options, recordsEverOpened: true }).props.children;
  assert.equal(opened.props.hidden, false); assert.equal(closed.props.hidden, true);
  const page = opened.props.children;
  assert.equal(page.type, TradeRecordsPage); assert.equal(page.key, closed.props.children.key);
  assert.equal(page.props.trades, stockTrades); assert.equal(page.props.onEdit, edit); assert.equal(page.props.onDelete, remove);
  assert.equal(page.props.pending, true); assert.equal(closed.props.children.props.active, false);
  page.props.onEdit(stockTrades[0]); page.props.onDelete(stockTrades[0]); page.props.onAdd();
  assert.deepEqual(actions, [['edit', stockTrades[0]], ['delete', stockTrades[0]], ['add', null, 'buy']]);
  assert.match(trades, /<div className="trades-report mx-auto[^\n]+hidden=\{recordsPageOpen\}/);
  const form = trades.indexOf('{showAddTrade && (');
  assert.ok(form > end, 'the original form is a sibling after the record page, outside its hidden wrapper');
  assert.doesNotMatch(trades.slice(trades.indexOf('export default function TradesTab('), form), /if\s*\(recordsPageOpen\)\s*return/);
});

test('bottom tab departure clears selection and pending scroll, while the records shell keeps standard bottom navigation', () => {
  const start = app.indexOf('    setShowMonthsDetail(false);', app.indexOf('  const handleBottomTabClick ='));
  const end = app.indexOf('\n  }, [activePage, activeTab, earningsDetailReturnPage]);', start);
  assert.ok(start >= 0 && end > start);
  const tail = app.slice(start, end);
  const run = new Function('tabId', 'context', `const { setShowMonthsDetail, setTradeRecordSelection, pendingTradeRootScrollRef,
    setActiveTab, setActivePage, setStockDetailSymbol, setWatchlistStockDetailSymbol,
    setWatchlistStockDetailFocusSection, setEarningsDetailEvent, setEarningsDetailReturnPage } = context; ${tail}`);
  for (const tabId of ['home', 'trades', 'analysis', 'review', 'settings']) {
    const calls = [], context = { pendingTradeRootScrollRef: { current: 540 } };
    for (const key of ['setShowMonthsDetail', 'setTradeRecordSelection', 'setActiveTab', 'setActivePage', 'setStockDetailSymbol',
      'setWatchlistStockDetailSymbol', 'setWatchlistStockDetailFocusSection', 'setEarningsDetailEvent', 'setEarningsDetailReturnPage']) {
      context[key] = value => calls.push([key, value]);
    }
    run(tabId, context);
    assert.ok(calls.some(([name, value]) => name === 'setTradeRecordSelection' && value === null));
    assert.ok(calls.some(([name, value]) => name === 'setActiveTab' && value === tabId));
    assert.ok(calls.some(([name, value]) => name === 'setActivePage' && value === null));
    assert.equal(context.pendingTradeRootScrollRef.current, null);
  }
  const shell = new Function('activePage', 'activeTab', `${flags}; return { isStandalonePage, isFullBleedPage, hideBottomNavigation };`);
  assert.deepEqual(shell('trade-records', 'trades'), { isStandalonePage: true, isFullBleedPage: true, hideBottomNavigation: false });
});
