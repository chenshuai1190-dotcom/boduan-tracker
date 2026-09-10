import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const home = read('src/tabs/HomeTab.jsx');
const css = read('src/tabs/HomeWatchlistDialogs.css');

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
