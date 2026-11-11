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
  assert.match(app, /<DcaLabPage key=\{user\?\.id \|\| ''\} ctx=\{\{ userId: user\?\.id \|\| '', language, marketColorMode, usdRate, closeDcaLab \}\} \/>/);
  const callbacks = ['openDcaLab', 'closeDcaLab'].map(name => app.match(new RegExp(`const ${name} = useCallback\\(\\(\\) => \\{[\\s\\S]*?\\}, \\[\\]\\);`))?.[0] || '').join('\n');
  assert.equal((callbacks.match(/setActiveTab\('trades'\)/g) || []).length, 2);
  assert.ok(callbacks.includes("setActivePage('dca-lab')"));
  assert.ok(callbacks.includes('setActivePage(null)'));
  assert.doesNotMatch(callbacks, /db\.|stock_trades|upsert|insert|delete|save|fetch/);
});

test('all tools closes before opening DCA Lab and the entry follows the investment time machine', () => {
  const section = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('</ActionModalCard>', trades.indexOf('{showAllToolsModal && (')));
  const handler = section.match(/onSelect=\{\(toolId\) => \{([\s\S]*?)\}\}\s*\/>/)[1];
  const calls = [];
  new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openDcaLab', handler)(
    'dca-lab', value => calls.push(['sheet', value]), value => calls.push(['panel', value]), () => calls.push(['dca']),
  );
  assert.deepEqual(calls, [['sheet', false], ['panel', ''], ['dca']]);
  assert.equal((trades.match(/openDcaLab\?\.\(\)/g) || []).length, 1);
  assert.match(catalog, /id: 'portfolio-overlap'[^\n]*\n\s*\{ id: 'investment-comparison'[^\n]*\n\s*\{ id: 'dca-lab'/);
  assert.doesNotMatch(handler, /db\.|stock_trades|upsert|insert|delete|save|fetch/);
});

test('local DCA preview uses the standard shell and the existing Trades navigation', () => {
  assert.match(preview, /lazy\(\(\) => import\('\.\/dev\/DcaLabPreview\.jsx'\)\)/);
  assert.match(preview, /if \(params\.get\('preview'\) === 'dca-lab'\) return 'dca-lab'/);
  const routeList = preview.match(/return (\[[^\n]+?\])\.includes\(requestedTab\)/)?.[1];
  assert.ok(routeList, 'preview routes must remain explicitly allowlisted');
  const routes = [...routeList.matchAll(/'([^']+)'/g)].map(([, route]) => route);
  for (const route of ['portfolio-overlap', 'dca-lab', 'review-journal']) assert.ok(routes.includes(route), `${route} must be selectable in the local preview`);
  const paddingExpression = preview.match(/paddingTop: ((?:tradeRecordsActive \? 0 : )?\[[^\n]+\.includes\(activeTab\) \? 0 : [^\n]+),/)?.[1];
  assert.ok(paddingExpression, 'read the actual standalone preview top-padding rule');
  const paddingTop = new Function('activeTab', 'tradeRecordsActive = false', `return ${paddingExpression};`);
  assert.equal(paddingTop('dca-lab'), 0);
  assert.equal(paddingTop('debt-manager'), 0);
  assert.equal(paddingTop('review-journal'), 0, 'the independent journal owns its safe-area header');
  assert.equal(paddingTop('trades'), 'calc(1rem + env(safe-area-inset-top))', 'standard Trades still owns its shell padding');
  const recordsStyle = preview.match(/\.\.\.(\(tradeRecordsActive \? \{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 \} : \{\}\)),/)?.[1];
  assert.ok(recordsStyle, 'read the scoped records preview style override');
  const recordsPadding = new Function('tradeRecordsActive', `return ${recordsStyle};`);
  assert.deepEqual(recordsPadding(true), { paddingTop: 0, paddingLeft: 0, paddingRight: 0 }, 'the independent records preview owns its safe-area header and side gutters');
  assert.deepEqual(recordsPadding(false), {}, 'other preview pages keep their existing shell padding');
  assert.match(preview, /<DcaLabPreview ctx=\{\{ language, marketColorMode, usdRate: USD_RATE, closeDcaLab: \(\) => \{ setActiveTab\('trades'\); window\.scrollTo\(0, 0\); \} \}\} \/>/);
  assert.ok(preview.includes("(activeTab === 'dca-lab' && tab.id === 'trades')"));
  const topLevelEntry = preview.slice(preview.indexOf('export default function DevVisualPreview()'));
  assert.doesNotMatch(topLevelEntry, /<DcaLabPreview/);
});
