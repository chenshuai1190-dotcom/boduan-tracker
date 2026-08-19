import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const quoteApiSource = readFileSync(new URL('../api/quote.js', import.meta.url), 'utf8');
const eodhdSource = readFileSync(new URL('../server/quote/providers/eodhd.js', import.meta.url), 'utf8');
const stockDetailSource = readFileSync(new URL('../server/quote/stockDetail.js', import.meta.url), 'utf8');
const stockDetailPageSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');

test('the retired Home MA200 breakdown monitor has no remaining runtime path', () => {
  assert.equal(existsSync(new URL('../src/components/HomeMa200BreakdownMonitor.jsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/lib/homeMa200Breakdown.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../server/quote/ma200Monitor.js', import.meta.url)), false);

  for (const [source, forbidden] of [
    [homeSource, 'HomeMa200BreakdownMonitor'],
    [appSource, 'ma200Symbols'],
    [appSource, 'ma200Monitor'],
    [quoteApiSource, 'ma200Symbols'],
    [quoteApiSource, 'includeMa200Monitor'],
    [eodhdSource, 'includeMa200Monitor'],
    [eodhdSource, 'deriveMa200Monitor'],
    [i18nSource, 'home.ma200Monitor'],
    [previewSource, 'home-ma200-breakdown'],
    [previewSource, 'mockHomeMa200BreakdownWatchlist'],
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should be removed with the Home monitor`);
  }
});

test('stock-detail MA200 analysis remains intact and isolated from the removed Home monitor', () => {
  assert.ok(stockDetailPageSource.includes("import Ma200RetestHistoryCard from '../components/Ma200RetestHistoryCard.jsx'"));
  assert.ok(stockDetailPageSource.includes("t(language, 'watchlistDetail.ma200Daily', 'MA200（日）')"));
  assert.ok(stockDetailPageSource.includes("t(language, 'watchlistDetail.ma200Weekly', 'MA200（周）')"));
  assert.ok(stockDetailPageSource.includes('<Ma200RetestHistoryCard'));
  assert.ok(stockDetailSource.includes('ma200RetestHistory'));
  assert.ok(stockDetailSource.includes('ma200Weekly'));
  assert.ok(quoteApiSource.includes('includeStockDetail: stockDetailRequested'));
  assert.ok(eodhdSource.includes('buildEodhdStockDetail'));
});
