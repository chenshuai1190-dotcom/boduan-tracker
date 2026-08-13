import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const count = (source, pattern) => (source.match(pattern) || []).length;

const home = read('src/tabs/HomeTab.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const assets = read('src/tabs/AnalysisTab.jsx');
const monthlyAssetTrendChart = read('src/components/MonthlyAssetTrendChart.jsx');
const review = read('src/tabs/ReviewTab.jsx');
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
  assert.ok(trades.includes('data-trades-net-assets-card="true"') && count(trades, /bg-\[#0b0c0e\]/g) >= 17);
  assert.ok(assets.includes("const ASSET_CARD = '#0b0c0e';"));
  assert.ok(review.includes("const REVIEW_CARD = '#0b0c0e';"));
  assert.equal(count(review, /bg-\[#101114\]/g), 2, 'review notes and logs should use the raised neutral surface');
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
  assert.ok(review.includes("<span className=\"text-white/[0.95] tabular-nums\" style={{ fontFamily: NUMBER_FONT }}>{money(currentBalance)}</span>"));
  assert.ok(review.includes('text-white/[0.95] tabular-nums') && review.includes('{formatRowMoney(row.actualEndBalance)}'));
  assert.ok(review.includes('font-normal text-white/[0.95] tabular-nums') && review.includes('{money(yearItem.endBalance)}'));
  assert.ok(review.includes('tracking-normal text-white/[0.95] tabular-nums'));
  assert.equal(review.includes('<span className="text-[14px] text-[#ffd18a]">★</span>'), false);
  assert.ok(review.includes('background: \'linear-gradient(90deg, #f8c46a 0%, #f6b54b 58%, #ffd18a 100%)\''));
  assert.ok(settings.includes('radial-gradient(circle_at_50%_35%,rgba(33,65,122,0.13),transparent_45%)'));
});

test('sheets, tooltips, and chart markers keep their separate depth colors', () => {
  assert.equal(count(home, /bg-\[#0b0f14\]/g), 3, 'Home sheets should remain outside the module recolor');
  assert.equal(count(trades, /bg-\[#0b0f14\]/g), 2, 'trade scenario sheet and chart marker should keep their existing depth colors');
  assert.equal(count(pnlReport, /bg-\[#0b0f14\]/g), 2, 'PnL bottom sheets should keep their existing depth colors');
  assert.equal(count(earningsCalendar, /bg-\[#0b0f14\]/g), 1, 'earnings modal should keep its existing depth color');
  assert.ok(review.includes("const REVIEW_PANEL = '#0b0f16';"));
  assert.ok(stockComparison.includes('rounded-[24px] border border-white/10 bg-[#0d1118]'));
  assert.ok(valuation.includes('fill="#0b0f14" stroke="#ffd18a"'));
  assert.ok(ma200History.includes('stroke="#0b0f14"'));
  assert.ok(monthlyAssetTrendChart.includes('fill="#101318" stroke={CHART_COLOR}'));
  assert.ok(monthlyAssetTrendChart.includes('fill="#f5f7fb" stroke={CHART_LATEST_COLOR}'));
});
