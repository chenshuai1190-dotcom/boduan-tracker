import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const home = read('src/tabs/HomeTab.jsx');
const css = read('src/tabs/HomeWatchlistDialogs.css');

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
}

test('watchlist add and edit preserve composing text while matching normalized tickers and Chinese names', async (t) => {
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  t.after(() => vite.close());
  const { default: HomeTab } = await vite.ssrLoadModule('/src/tabs/HomeTab.jsx');

  for (const dialog of ['add', 'edit']) {
    const ctx = {
      showAddStock: dialog === 'add', newStock: {}, ChevronRight: () => null,
      watchlist: [{ symbol: 'NVDA', name: '英伟达' }, { symbol: 'TSLA', name: '特斯拉' }],
    };
    const inputs = ['', 'n', 'nv', ' nVdA ', 'ying', '英伟达', ''];
    let step = 0;

    function Interact() {
      const nodes = elements(HomeTab({ ctx }));
      const input = nodes.find(node => node.type === 'input' && node.props.className === 'watchlist-search-input');
      if (dialog === 'edit' && !input) {
        nodes.find(node => node.props.onEdit).props.onEdit();
        return null;
      }
      assert.equal(input.props.value, inputs[step], dialog + ' must preserve the native input value');
      assert.equal(input.props.autoCapitalize, 'none');
      assert.equal(input.props.autoCorrect, 'off');
      assert.equal(input.props.spellCheck, false);
      const symbols = nodes.filter(node => node.props.className === 'watchlist-symbol').map(node => node.props.children);
      if (inputs[step] === ' nVdA ' || inputs[step] === '英伟达') {
        assert.deepEqual(symbols, ['NVDA']);
      }
      if (step === inputs.length - 1) {
        assert.ok(symbols.includes('NVDA') && symbols.includes('TSLA'), 'clearing restores the stock list');
        return null;
      }
      const next = inputs[++step];
      if (next) {
        input.props.onChange({ target: { value: next }, nativeEvent: { isComposing: ['n', 'nv', 'ying'].includes(next) } });
      } else {
        nodes.find(node => node.props['aria-label'] === '清空搜索').props.onClick();
      }
      return null;
    }
    renderToStaticMarkup(React.createElement(Interact));
    assert.equal(step, inputs.length - 1);
  }
});

test('watchlist dialogs reuse the current report modal and keep mobile controls readable', () => {
  assert.match(home, /panelClassName="watchlist-dialog watchlist-dialog-add"/);
  assert.match(home, /panelClassName="watchlist-dialog watchlist-dialog-edit"/);
  assert.match(css, /\.watchlist-dialog \.srm-content[^}]*overflow: hidden/);
  assert.match(css, /\.watchlist-scroll-list[^}]*min-height: 0[^}]*overflow-y: auto/);
  assert.match(css, /\.watchlist-search-input[^}]*font-size: 16px/);
  assert.match(css, /\.watchlist-row-actions[^}]*grid-column: 2/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /#f6b54b|#0b0f14|font-weight: (600|700|800|900)/);
});

test('watchlist redesign retains full-list ordering and mutation safety', () => {
  assert.match(home, /const closeAddStockSheet = \(\) => \{\s*if \(isAddingStock\) return;/);
  assert.match(home, /const closeEditWatchlist = \(\) => \{\s*if \(editActionKey \|\| watchlistReorder.draggingSymbol \|\| watchlistReorder.isReordering\) return;/);
  assert.match(home, /const next = \[\.\.\.watchlist\];/);
  assert.match(home, /const result = await reorderWatchlist\(next\)/);
  assert.match(home, /const fullIndex = editWatchlistRows.findIndex/);
  assert.match(home, /disabled=\{busy \|\| isFirst\}/);
  assert.match(home, /disabled: !showEditWatchlist \|\| Boolean\(editSearchKey \|\| editActionKey \|\| pendingDeleteSymbol\)/);
  assert.match(home, /sourceRows.get\(row.symbol\)/);
  assert.match(home, /watchlistReorder.getHandleProps\(item\)/);
  assert.doesNotMatch(home, /onClick=\{\(\) => moveWatchlistItem\(symbol, '(up|down)'\)\}/);
  assert.match(home, /onClick=\{\(\) => setPendingDeleteSymbol\(symbol\)\}/);
  assert.match(home, /onClick=\{\(\) => setPendingDeleteSymbol\(null\)\}/);
  assert.match(home, /onClick=\{\(\) => confirmDeleteWatchlistItem\(symbol\)\}/);
  assert.match(home, /const result = await deleteWatchlistItem\(symbol\)/);
  assert.match(home, /disabled=\{isAdded \|\| isAddingStock\}/);
  assert.match(home, /const result = await addStock\(stockDraft\)/);
  assert.match(home, /home\.noWatchlist/);
  assert.match(home, /home\.noMatches/);
  assert.match(home, /marketColor\(item.changePercent, marketColorMode\)/);
});
