import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const count = (source, pattern) => (source.match(pattern) || []).length;

const home = read('src/tabs/HomeTab.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const assets = read('src/tabs/AnalysisTab.jsx');
const monthlyAssetTrendChart = read('src/components/MonthlyAssetTrendChart.jsx');
const reviewCss = read('src/tabs/ReviewTab.css');
const compoundDetail = read('src/pages/CompoundDetailPage.jsx');
const compoundDetailCss = read('src/pages/CompoundDetailPage.css');
const annualPlan = read('src/components/AnnualGoalPlan.jsx');
const annualPlanCss = read('src/components/AnnualGoalPlan.css');
const northStar = read('src/components/NorthStarGoalCard.jsx');
const northStarCss = read('src/components/NorthStarGoalCard.css');
const reviewGoalModalCss = read('src/components/ReviewGoalModal.css');
const reviewReadingDetails = read('src/components/ReviewReadingDetails.jsx');
const reviewReadingDetailsCss = read('src/components/ReviewReadingDetails.css');
const settings = read('src/tabs/SettingsTab.jsx');
const pnlReport = read('src/pages/PnlReportPage.jsx');
const stockDetail = read('src/pages/StockDetailPage.jsx');
const watchlistDetail = read('src/pages/WatchlistStockDetailPage.jsx');
const competition = read('src/pages/CommunityCompetitionPage.jsx');
const waveTracker = read('src/pages/WaveTrackerPage.jsx');
const earningsDetail = read('src/pages/EarningsDetailPage.jsx');
const earningsGrowth = read('src/components/EarningsGrowthCard.jsx');
const earningsCalendar = read('src/tabs/EarningsCalendar.jsx');
const valuation = read('src/components/CompanyValuationCard.jsx');
const ma200History = read('src/components/Ma200RetestHistoryCard.jsx');
const stockComparison = read('src/components/StockReturnComparisonCard.jsx');

test('persistent production modules share neutral black surface levels', () => {
  assert.ok(trades.includes('data-trades-net-assets-card="true"'));
  assert.ok(
    trades.includes('data-trades-net-assets-card="true"') && count(trades, /bg-\[#0b0c0e\]/g) >= 16,
    'Trading should retain its primary neutral surfaces after the edit action adopts the raised borderless style',
  );
  assert.ok(assets.includes("const ASSET_CARD = '#0b0c0e';"));
  assert.match(northStarCss, /\.north-star-card\s*\{[^}]*background:\s*#101112;/, 'north-star presentation should use its scoped neutral surface');
  assert.match(annualPlanCss, /\.annual-goal-plan \.ag-current-card\s*\{[^}]*border:\s*0;[^}]*background:\s*#101112;/, 'current annual plan should share the north-star neutral borderless surface');
  assert.match(reviewCss, /\.review-page\s*\{[^}]*--review-surface:\s*#101112;/, 'review reading sections should use the same scoped neutral surface');
  assert.match(reviewCss, /\.review-page \.review-entry\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/, 'normal notes and logs should use quiet transparent reading rows');
  assert.match(reviewCss, /\.review-page \.review-entry\[data-pinned=true\]\s*\{[^}]*background:\s*var\(--review-surface\);/, 'pinned notes alone should use the raised neutral reading surface');
  assert.ok(compoundDetail.includes('<main className="compound-detail-page"'), 'compound details should use their independent page surface');
  assert.doesNotMatch(compoundDetail, /ReviewGoalModal|ActionModalCard/, 'compound details should not retain a dialog surface');
  assert.doesNotMatch(compoundDetail + compoundDetailCss, /UsFlagBackground|linearGradient|linear-gradient|radial-gradient|#f6b54b|#ffd18a/, 'compound details should not restore the old gold border or chart gradients');
  assert.ok(settings.includes('linear-gradient(145deg,#0b0c0e,#0b0c0e)'));
  assert.equal(count(settings, /bg-\[#0b0c0e\]/g), 2, 'settings rows and changelog should use the primary neutral surface');

  assert.equal(count(pnlReport, /bg-\[#0b0c0e\]/g), 4);
  assert.equal(count(pnlReport, /bg-\[#101114\]/g), 2);
  assert.equal(count(stockDetail, /bg-\[#0b0c0e\]/g), 4);
  assert.equal(count(watchlistDetail, /bg-\[#0b0c0e\]/g), 10);
  assert.equal(count(competition, /bg-\[#0b0c0e\]/g), 5);
  assert.ok(waveTracker.includes('border border-[#1a2530] bg-[#0b0c0e]'));
  assert.equal(count(waveTracker, /bg-\[#0b0c0e\]/g), 3);

  assert.equal(count(earningsDetail, /bg-\[#0b0c0e\]/g), 6);
  assert.equal(count(earningsDetail, /bg-\[#101114\]/g), 1);
  assert.equal(count(earningsGrowth, /bg-\[#0b0c0e\]/g), 2);
  assert.ok(earningsCalendar.includes("? 'flex h-[calc(100dvh-env(safe-area-inset-top)-138px)] min-h-[560px] w-full flex-col rounded-[20px] border border-white/10 bg-[#0b0c0e]"));
  assert.ok(valuation.includes('rounded-2xl border border-white/[0.09] bg-[#0b0c0e]'));
  assert.ok(ma200History.includes('rounded-2xl border border-white/[0.09] bg-[#0b0c0e]'));
  assert.ok(stockComparison.includes('id="stock-return-comparison" className="mt-3 scroll-mt-[132px] rounded-2xl border border-white/10 bg-[#0b0c0e]'));
});

test('actual asset amounts use soft white while semantic gold and the settings glow remain', () => {
  assert.ok(home.includes('data-home-net-assets="true"'));
  assert.ok(home.includes('tracking-normal text-white/[0.95] tabular-nums'));
  assert.ok(home.includes('text-[20px] font-normal leading-none text-white/[0.95]'));
  assert.ok(trades.includes('tracking-normal text-white/[0.95] tabular-nums'));
  assert.ok(assets.includes('tracking-normal text-white/[0.95] tabular-nums'));
  assert.ok(assets.includes('text-white/[0.95] tabular-nums') && assets.includes('≈ ¥{fmt(curSum, 0)}'));
  assert.ok(compoundDetail.includes('{fmt(selectedAsset)}'));
  assert.match(compoundDetailCss, /\.compound-detail-page \.compound-detail\s*\{[^}]*color:\s*#d9d9df;[^}]*font-variant-numeric:\s*tabular-nums;/, 'compound recorded assets should inherit neutral white tabular numbers');
  assert.match(compoundDetailCss, /\.cp-selected-asset dd\s*\{[^}]*color:\s*#e4e4e9;/, 'selected actual and projected asset amounts should keep their neutral light amount color');
  assert.ok(compoundDetail.includes("!currentShortfall && finite(difference) ? marketTextClass(difference, marketColorMode) : ''"), 'an unfinished current-year shortfall should retain a neutral color while recorded comparisons respect market colors');
  assert.ok(compoundDetail.includes('fmt(row.hasActual ? row.actualEndBalance : row.targetEndBalance)'));
  assert.match(compoundDetailCss, /\.cp-row-value strong\s*\{[^}]*color:\s*#c1c1ca;/, 'compound annual balances should use a neutral light amount color');
  assert.match(annualPlanCss, /\.annual-goal-plan\s*\{[^}]*color:\s*#f1f1f2;[^}]*font-variant-numeric:\s*tabular-nums;/, 'annual amounts should inherit neutral tabular number styling');
  assert.ok(annualPlan.includes('marketHexColor(currentYear.actualGain, marketColorMode)') && annualPlan.includes('marketHexColor(item.actualGain, marketColorMode)'), 'real annual gains should respect the user market-color convention');
  assert.match(northStarCss, /\.north-star-card\s*\{[^}]*color:\s*#f1f1f2;[^}]*font-variant-numeric:\s*tabular-nums;/, 'north-star headline and current amount should inherit neutral white tabular numbers');
  assert.ok(northStar.includes('goalMoney.main') && northStar.includes('goalMoney.decimal'), 'north-star headline should preserve its split-decimal amount');
  assert.doesNotMatch(northStar, /★|<Star\b/, 'north-star title should not restore a decorative star');
  assert.match(northStarCss, /\.ns-completion strong\s*\{[^}]*color:\s*#ff4b1f;/, 'north-star completion value should use system red');
  assert.match(northStarCss, /\.ns-progress-fill\s*\{[^}]*background:\s*#ff4b1f;/, 'north-star progress fill should match its completion value');
  assert.match(annualPlanCss, /\.annual-goal-plan \.ag-progress-fill\s*\{[^}]*background:\s*#ff4b1f;/, 'annual progress should share the quiet system-red north-star progress treatment');
  assert.doesNotMatch(annualPlanCss, /linear-gradient|radial-gradient|box-shadow/, 'annual presentation should not reintroduce decorative glow or gradients');
  assert.ok(settings.includes('radial-gradient(circle_at_50%_35%,rgba(33,65,122,0.13),transparent_45%)'));
});

test('sheets, tooltips, and chart markers keep their separate depth colors', () => {
  assert.equal(count(home, /bg-\[#0b0f14\]/g), 3, 'Home sheets should remain outside the module recolor');
  assert.equal(count(trades, /bg-\[#0b0f14\]/g), 2, 'trade scenario sheet and chart marker should keep their approved depth color');
  assert.equal(count(trades, /bg-\[#080808\]/g), 1, 'the standard formal-trade sheet should use the approved neutral-black surface');
  assert.equal(count(pnlReport, /bg-\[#0b0f14\]/g), 2, 'PnL bottom sheets should keep their existing depth colors');
  assert.equal(count(earningsCalendar, /bg-\[#0b0f14\]/g), 1, 'earnings modal should keep its existing depth color');
  assert.match(reviewGoalModalCss, /\.review-goal-modal\s*\{[^}]*background:\s*#101112;/, 'approved review dialogs should share the scoped neutral-black goal surface');
  assert.equal(count(reviewReadingDetails, /<ReviewGoalModal/g), 2, 'both reading details should use the goal-dialog palette');
  assert.doesNotMatch(reviewReadingDetails + reviewReadingDetailsCss, /UsFlagBackground|linear-gradient|radial-gradient|#f6b54b/, 'reading details should not add independent flag, gradient, or gold decorations');
  assert.ok(stockComparison.includes('rounded-[24px] border border-white/10 bg-[#0d1118]'));
  assert.ok(valuation.includes('fill="#0b0f14" stroke="#ffd18a"'));
  assert.ok(ma200History.includes('stroke="#0b0f14"'));
  assert.ok(monthlyAssetTrendChart.includes('fill="#101318" stroke={CHART_COLOR}'));
  assert.ok(monthlyAssetTrendChart.includes('fill="#f5f7fb" stroke={CHART_LATEST_COLOR}'));
});
