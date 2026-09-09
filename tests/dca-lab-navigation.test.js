import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const preview = read('src/DevVisualPreview.jsx');
const catalog = read('src/components/TradeToolsCatalog.jsx');

test('DCA Lab is an identity-scoped lazy standalone tool with no ledger context', () => {
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/DcaLabPage\.jsx'\)\)/);
  assert.ok(app.includes("activePage === 'dca-lab'"));
  assert.ok(app.includes('|| isDcaLabPage ||'));
  assert.match(app, /<DcaLabPage key=\{user\?\.id \|\| ''\} ctx=\{\{ userId: user\?\.id \|\| '', language, closeDcaLab \}\} \/>/);
  const callbacks = app.slice(app.indexOf('const openDcaLab ='), app.indexOf('const openPortfolioOverlap ='));
  assert.equal((callbacks.match(/setActiveTab\('trades'\)/g) || []).length, 2);
  assert.ok(callbacks.includes("setActivePage('dca-lab')"));
  assert.ok(callbacks.includes('setActivePage(null)'));
  assert.doesNotMatch(callbacks, /db\.|stock_trades|upsert|insert|delete|save|fetch/);
});

test('all tools closes before opening DCA Lab and the entry follows the investment time machine', () => {
  const section = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('{showTradeRecordsTool && ('));
  const handler = section.match(/onSelect=\{\(toolId\) => \{([\s\S]*?)\}\}\s*\/>/)[1];
  const calls = [];
  new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openDcaLab', handler)(
    'dca-lab', value => calls.push(['sheet', value]), value => calls.push(['panel', value]), () => calls.push(['dca']),
  );
  assert.deepEqual(calls, [['sheet', false], ['panel', ''], ['dca']]);
  assert.equal((trades.match(/openDcaLab\?\.\(\)/g) || []).length, 1);
  assert.match(catalog, /id: 'investment-comparison'[^\n]*\n\s*\{ id: 'dca-lab'[^\n]*\n\s*\{ id: 'portfolio-overlap'/);
  assert.doesNotMatch(handler, /db\.|stock_trades|upsert|insert|delete|save|fetch/);
});

test('local DCA preview uses the standard shell and the existing Trades navigation', () => {
  assert.match(preview, /lazy\(\(\) => import\('\.\/dev\/DcaLabPreview\.jsx'\)\)/);
  assert.match(preview, /if \(params\.get\('preview'\) === 'dca-lab'\) return 'dca-lab'/);
  assert.match(preview, /'portfolio-overlap', 'dca-lab'\]\.includes\(requestedTab\)/);
  assert.match(preview, /paddingTop: \[[^\n]*'dca-lab'\]\.includes\(activeTab\) \? 0/);
  assert.match(preview, /<DcaLabPreview ctx=\{\{ language, closeDcaLab: \(\) => \{ setActiveTab\('trades'\); window\.scrollTo\(0, 0\); \} \}\} \/>/);
  assert.ok(preview.includes("(activeTab === 'dca-lab' && tab.id === 'trades')"));
  const topLevelEntry = preview.slice(preview.indexOf('export default function DevVisualPreview()'));
  assert.doesNotMatch(topLevelEntry, /<DcaLabPreview/);
});
