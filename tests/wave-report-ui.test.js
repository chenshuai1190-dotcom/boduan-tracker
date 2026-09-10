import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pageUrl = new URL('../src/pages/WaveTrackerPage.jsx', import.meta.url);
const page = read('src/pages/WaveTrackerPage.jsx');
const css = read('src/pages/WaveTrackerPage.css');
const dialogs = read('src/pages/WaveTrackerDialogs.css');
const modal = read('src/components/StockReportModal.jsx');
const sharedModal = read('src/components/ActionModalCard.jsx');
const rule = (source, selector) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectors]) => selectors.split(',').some(candidate => candidate.trim() === selector))
  .map(([, , body]) => body).join('\n');

// Exercise the real row renderers and formatters. CSS imports alone are omitted
// for Node; the component graph and financial helpers remain unchanged.
const moduleCache = new Map();
async function compileModule(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  const loading = (async () => {
    let source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    if (url.href === pageUrl.href) source += '\nexport { WaveRow, Metric, FormField, formatPnl, formatUsdPrice, formatShares, tone };';
    let { code } = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
      const resolved = match[3].startsWith('.') ? new URL(match[3], url) : null;
      const target = resolved?.pathname.endsWith('.jsx')
        ? await compileModule(resolved)
        : resolved?.href || import.meta.resolve(match[3]);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  })();
  moduleCache.set(url.href, loading);
  return loading;
}

const { WaveRow, Metric, FormField, formatPnl, formatUsdPrice, formatShares, tone } = await import(await compileModule(pageUrl));
const tt = (_key, fallback, values = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
const group = { symbol: 'NVDA', displayName: '英伟达' };
const activeWave = {
  id: 'wave-3', sequence: 3, status: 'active', buyDate: '2026-09-01',
  buyPriceUsd: 180.25, currentPriceUsd: 185.12, shares: 1.234567,
  pnlUsd: 51.0943, returnPct: .027, heldDays: 10, note: '观察目标价后决定',
};
const rowProps = wave => ({ group, wave, tt, displayRate: 7, displayCurrency: 'CNY' });

test('wave report owns a neutral responsive surface and safe-area spacing', () => {
  const root = rule(css, '.wave-page');
  assert.match(page, /<main className="wave-page"/);
  assert.match(root, /(?:^|\n)\s*width:\s*100%;/);
  assert.match(root, /max-width:\s*760px;/);
  assert.match(root, /background:\s*#08090b;/);
  assert.match(root, /color:\s*#e4e4e7;/);
  assert.match(root, /padding-bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 92px\);/);
  assert.match(rule(css, '.wave-header'), /padding:\s*calc\(env\(safe-area-inset-top\) \+ 12px\) 0 12px;/);
  assert.doesNotMatch(page + css + dialogs, /#f6b54b|#ffd18a|#f6bd61|#f5bd62|#1a2530|#05080d|#111720|linear-gradient|radial-gradient|box-shadow/);
  assert.doesNotMatch(css + dialogs, /(?:^|[}\n])\s*(?:html|body|#root|nav)\s*\{/, 'wave styles must not recolor other modules');
  assert.equal(tone(1), '#ff4b1f');
  assert.equal(tone(-1), '#36c49a');
  assert.equal(tone(null), tone(0), 'unavailable and flat values retain a neutral color');
});

test('direct wave filters retain selection and loading/error totals remain unavailable', () => {
  for (const id of ['all', 'active', 'completed']) assert.ok(page.includes(`['${id}', tt(`));
  assert.ok(page.includes('onClick={() => setFilter(id)} aria-pressed={filter === id} className="wave-filter"'));
  assert.match(rule(css, '.wave-filter[aria-pressed="true"]'), /background:\s*#1b1c1e;[^}]*color:\s*#e4e4e7;/);
  assert.match(rule(css, '.wave-toolbar'), /flex-wrap:\s*wrap;/);
  assert.match(rule(css, '.wave-hero-stats'), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.ok(page.includes('formatPnl(loading || loadError ? null : cumulativeDisplayPnl, displayCurrency, 2)'));
  assert.ok(page.includes("value={loading || loadError ? '--' : dashboard.completedWaveCount}"));
  assert.ok(page.includes("value={loading || loadError ? '--' : tt('swing.positionsValue'"));
  assert.ok(page.includes('onClick={() => loadRows().catch(() => {})}'), 'load failure retains a retry action');
});

test('active wave rows preserve financial fields and open the original wave action', () => {
  let selected;
  const tree = WaveRow({ ...rowProps(activeWave), onAction: (...args) => { selected = args; } });
  assert.equal(tree.type, 'button');
  tree.props.onClick();
  assert.deepEqual(selected, [group, activeWave]);
  const html = renderToStaticMarkup(tree);
  for (const value of ['波段 03', '进行中', '+¥357.66', '+2.7%', '$180.25', '$185.12', '1.234567 股', '09-01 开始 · 第 10 天', activeWave.note]) {
    assert.ok(html.includes(value), `active row must retain ${value}`);
  }
});

test('completed batches keep sell numbering and missing financial values never become zero', () => {
  const completed = { ...activeWave, status: 'completed', exitSequence: 2, sellDate: '2026-09-06', sellPriceUsd: 195.45, pnlUsd: -12.5, returnPct: -.06, heldDays: 5 };
  const html = renderToStaticMarkup(React.createElement(WaveRow, rowProps(completed)));
  for (const value of ['波段 03 · 第2次卖出', '已完成', '-¥87.50', '-6.0%', '$195.45', '卖出均价', '09-01 ~ 09-06 · 5 天']) {
    assert.ok(html.includes(value), `completed row must retain ${value}`);
  }
  for (const value of [null, undefined, Number.NaN]) {
    assert.equal(formatPnl(value), '--');
    assert.equal(formatUsdPrice(value), '--');
    assert.equal(formatShares(value), '--');
  }
  assert.equal(formatPnl(12.5), '+$12.50', 'dialog defaults and list amounts retain cents');
  assert.equal(formatPnl(-12.5, 'CNY'), '-¥12.50');
  assert.equal(formatPnl(0), '+$0.00', 'a recorded zero remains distinct from unavailable');
  const missing = renderToStaticMarkup(React.createElement(WaveRow, rowProps({ ...activeWave, currentPriceUsd: null, pnlUsd: null, returnPct: null })));
  assert.doesNotMatch(missing, /NaN|\+¥0\.00|\+0\.0%/);
  assert.ok(missing.includes('--'));
});

test('financial labels and values wrap instead of being truncated', () => {
  const selectors = [
    '.wave-hero-value', '.wave-metric-label', '.wave-metric-value', '.wave-stock-pnl', '.wave-record-profit',
  ];
  for (const selector of selectors) {
    const declarations = rule(css, selector);
    assert.match(declarations, /overflow-wrap:\s*anywhere;/, `${selector} must expose long financial values`);
    assert.doesNotMatch(declarations, /overflow(?:-x)?:\s*(?:hidden|clip)|text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  }
  for (const selector of ['.wave-dialog-metric-value', '.wave-dialog-result-amount', '.wave-dialog-result-percent']) {
    const declarations = rule(dialogs, `.wave-dialog ${selector}`);
    assert.match(declarations, /overflow-wrap:\s*anywhere;/);
    assert.doesNotMatch(declarations, /overflow(?:-x)?:\s*(?:hidden|clip)|text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  }
  const html = renderToStaticMarkup(React.createElement(Metric, { label: '累计盈亏', value: '+¥123,456,789.12' }));
  assert.ok(html.includes('+¥123,456,789.12'));
  assert.doesNotMatch(html, /truncate|line-clamp/);
  assert.match(rule(css, '.wave-record:first-child'), /border-top:\s*0;/);
});

test('wave report forms retain the shared modal and iOS keyboard safeguards', () => {
  assert.ok(page.includes("import StockReportModal from '../components/StockReportModal.jsx'"));
  assert.ok(modal.includes('<ActionModalCard'));
  assert.ok(sharedModal.includes('window.visualViewport'));
  const scroller = rule(dialogs, '.wave-dialog .wave-dialog-form-scroller');
  assert.match(scroller, /max-height:\s*56dvh;/);
  assert.match(scroller, /overflow-y:\s*auto;/);
  assert.match(scroller, /overscroll-behavior:\s*contain;/);
  assert.match(dialogs, /@media\s*\(max-width:\s*359px\)\s*\{\s*\.wave-dialog \.wave-dialog-field-pair\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  const dateHtml = renderToStaticMarkup(React.createElement(FormField, { label: '日期', type: 'date', value: '2026-09-10', onChange: () => {} }));
  assert.match(dateHtml, /wave-form-date-input/);
  assert.match(dateHtml, /line-height:48px/);
  assert.match(dateHtml, /text-align:center/);
  assert.match(dateHtml, /-webkit-min-logical-width:0px/);
  assert.match(rule(dialogs, '.wave-dialog .wave-form-date-input::-webkit-date-and-time-value'), /min-height:\s*48px;[^}]*line-height:\s*48px;/);
  for (const guard of ["document.body.style.position = 'fixed'", "document.body.style.touchAction = 'none'", "document.documentElement.style.overscrollBehavior = 'none'", 'document.body.style.position = previous.bodyPosition', 'document.body.style.touchAction = previous.bodyTouchAction']) {
    assert.ok(page.includes(guard), `modal must preserve ${guard}`);
  }
});

test('simplified dialog footers retain close controls and guarded mutation callbacks', () => {
  for (const [type, closeKey] of [['info', 'closeRules'], ['add', 'closeAdd'], ['actions', 'closeActions'], ['detail', 'closeDetail'], ['edit', 'closeEdit'], ['sell', 'closeSell']]) {
    const start = page.indexOf(`{modal?.type === '${type}'`);
    assert.ok(start >= 0, `${type} modal remains present`);
    const end = page.indexOf('</StockReportModal>', start);
    assert.ok(end > start);
    const block = page.slice(start, end);
    assert.ok(block.includes(`closeLabel={tt('swing.${closeKey}'`));
    assert.match(block, /onClose=\{\(\) => (?:!submitting && )?setModal\(null\)\}/);
    assert.doesNotMatch(block, /key:\s*['"](?:cancel|close)['"]/, 'redundant cancel/close footer actions should stay removed');
    if (['add', 'edit', 'sell'].includes(type)) assert.ok(block.includes('onClose={() => !submitting && setModal(null)}'));
  }
  assert.ok(modal.includes('closeLabel={closeLabel}') && modal.includes('onClose={onClose}'));
  assert.ok(sharedModal.includes('aria-label={closeLabel}') && sharedModal.includes('onClick={onClose}'));
  for (const [callback, ready] of [['createWave', 'addReady'], ['saveEdit', 'editReady'], ['sellWave', 'sellReady']]) {
    assert.ok(page.includes(`onClick: ${callback}, disabled: !${ready} || submitting`), `${callback} retains validation and submission guards`);
  }
  for (const callback of ['openDetail(selection.wave)', 'openEdit(selection.wave)', "openEdit(selection.wave, 'parent')", 'openSell(selection.wave)', 'onClick: confirmDelete', 'onClick: confirmDeleteWholeWave, disabled: submitting']) assert.ok(page.includes(callback));
  assert.ok(page.includes('if (submittingRef.current) return;') && page.includes('submittingRef.current = false;'), 'mutation deduplication remains in the shared action path');
});
