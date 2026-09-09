import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const preview = read('src/DevVisualPreview.jsx');
const app = read('src/App.jsx');
const auth = read('src/AuthGate.jsx');
const dev = read('src/dev/DrawdownObservationPreview.jsx');
const page = read('src/pages/DrawdownObservationPage.jsx');
const presentation = read('src/components/DrawdownObservation.jsx');

test('synthetic data and query inputs stay behind the existing development-only auth gate', () => {
  assert.match(preview, /const DrawdownObservationPreview = lazy\(\(\) => import\('\.\/dev\/DrawdownObservationPreview\.jsx'\)\)/);
  assert.match(auth, /function isDevVisualPreviewRequested\(\)\s*\{\s*if \(!import\.meta\.env\.DEV\) return false;/);
  assert.match(dev, /import\.meta\.env\.DEV && .*get\('drawdownData'\) === 'synthetic'/);
  assert.match(page, /const loadHistory = import\.meta\.env\.DEV \? previewSource\?\.load : undefined/);
  for (const source of [app, page, presentation]) assert.doesNotMatch(source, /DRAWDOWN_PREVIEW|drawdownObservationData|drawdownData|drawdownSymbol|\/__investment-preview/);
  assert.match(dev, /source: 'EODHD_EOD'/);
  assert.match(dev, /getInvestmentComparisonExpectedCloseDate\(Date\.now\(\)\)/);
  assert.match(dev, /stale: asOfDate !== expectedAsOfDate/);
});

test('preview routes share production presentation with Home safe-area and nav selection', () => {
  assert.match(preview, /<DrawdownObservationPreview onBack=\{\(\) => setActiveTab\('home'\)\} initialSymbol=\{drawdownInitialSymbol\} \/>/);
  assert.match(preview, /activeTab === 'drawdown-observation' && tab\.id === 'home'/);
  const safeArea = preview.match(/paddingTop: \[([^\]]+)\]\.includes\(activeTab\) \? 0 : 'calc\(1rem \+ env\(safe-area-inset-top\)\)'/)?.[1];
  assert.ok(safeArea?.includes("'drawdown-observation'"));
  assert.match(dev, /import DrawdownObservation from '\.\.\/components\/DrawdownObservation\.jsx'/);
  assert.match(dev, /import DrawdownObservationPage from '\.\.\/pages\/DrawdownObservationPage\.jsx'/);
});

test('preview and production separate observation navigation from benchmark selection', () => {
  assert.match(preview, /openDrawdownObservation: \(\) => \{\s*setBenchmarkMenuOpen\(false\);\s*setActiveTab\('drawdown-observation'\);/);
  assert.match(preview, /setBenchmarkMenuOpen,\s*setBenchmarkSymbol,/);
  for (const source of [page, presentation]) assert.doesNotMatch(source, /setBenchmarkSymbol|mutate|onSave|onDelete|stock_trades|cost_basis_trades|localStorage|sessionStorage|indexedDB/);
});

test('presentation identifies closing data, short histories and missing values without global layout changes', () => {
  assert.match(presentation, /复权收盘 · 非实时/);
  assert.match(presentation, /不足 52 周 · 按可用历史/);
  assert.match(presentation, /行情暂不可用/);
  assert.match(presentation, /getSamePeriodReturn\(raw, row\.highDate, row\.asOfDate\)/);
  const css = read('src/components/DrawdownObservation.css');
  assert.doesNotMatch(css, /(?:^|[}\n])\s*(?:html|body|#root|nav|\.bottom-nav)\b/);
  assert.doesNotMatch(css, /position:\s*fixed|100dvh|100vh/);
});
