import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveNavigationScrollTarget } from '../src/lib/bottomTabNavigation.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const translations = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');

test('VIX card opens a lazy read-only standalone page with the authenticated identity', () => {
  assert.ok(app.includes("lazy(() => import('./pages/VixComparisonPage.jsx'))"));
  assert.ok(app.includes("activePage === 'vix-comparison'"));
  assert.match(app, /const isStandalonePage = [^;]*\bisVixComparisonPage\b/);
  assert.ok(app.includes("<VixComparisonPage ctx={{ ...tabCtx, userId: user?.id || '' }} />"));
  const cards = [...home.matchAll(/<button\b[\s\S]*?<\/button>/g)]
    .map(([block]) => block)
    .filter((block) => block.includes('onClick={() => openVixComparison?.()}'));
  assert.equal(cards.length, 1, 'Home report retains one explicit VIX comparison trigger');
  const [card] = cards;
  assert.ok(card.includes('type="button"'));
  assert.ok(card.includes('onClick={() => openVixComparison?.()}'));
  assert.ok(card.includes("aria-label={t(language, 'home.vix.compareAria'"));
  assert.ok(card.includes("'home.vix.title', 'VIX 恐慌指数'"));
  assert.ok(card.includes('fmtOptionalMoney(vix, 1)'), 'the VIX reading remains in the navigation button');
  assert.ok(card.includes('vixDateLabel'), 'the reading date remains in the navigation button');
  assert.doesNotMatch(card, /setBenchmarkSymbol|setBenchmarkMenuOpen|fetch\(|supabase|db\./, 'the VIX entry remains navigation-only');
  assert.equal((translations.match(/'home.vix.compareAria':/g) || []).length, 2);
});

test('VIX header back and bottom Home share the remembered Home position', () => {
  const callbacks = app.slice(app.indexOf('const openVixComparison ='), app.indexOf('const openStockDetail ='));
  assert.ok(callbacks.includes('homeScrollTopBeforeVixRef.current = readRootScrollTop();'));
  assert.ok(callbacks.includes('pendingHomeScrollTopRef.current = homeScrollTopBeforeVixRef.current;'));
  const bottom = app.slice(app.indexOf('const handleBottomTabClick ='), app.indexOf('const [portfolioCurrencyMode,'));
  assert.ok(bottom.includes('const returnsFromVixToHome = ('));
  assert.ok(bottom.includes("activePage === 'vix-comparison'"));
  assert.ok(bottom.includes('? homeScrollTopBeforeVixRef.current'));
  assert.ok(app.includes('hideBottomNavigation = isPnlReportPage || isPnlSharePage;'));
  assert.deepEqual(resolveNavigationScrollTarget({ activeTab: 'home', activePage: null, pendingHomeScrollTop: 420 }), { top: 420, shouldRestoreHomeScroll: true });
});
