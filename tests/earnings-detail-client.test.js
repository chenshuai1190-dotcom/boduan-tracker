import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS,
  EARNINGS_DETAIL_PENDING_CACHE_TTL_MS,
  earningsDetailClientCacheKey,
  earningsDetailSourceBadgeKind,
  earningsPercentChange,
  formatEarningsDetailMoney,
  normalizeEarningsDetailPayload,
} from '../src/lib/earningsDetail.js';
import {
  EARNINGS_DETAIL_EXPORT_MAX_DIMENSION,
  EARNINGS_DETAIL_EXPORT_MAX_PIXELS,
  EARNINGS_DETAIL_EXPORT_WIDTH,
  calculateEarningsDetailExportLayout,
} from '../src/lib/shareEarningsDetail.js';

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const calendarSource = fs.readFileSync(new URL('../src/tabs/EarningsCalendar.jsx', import.meta.url), 'utf8');
const calendarPageSource = fs.readFileSync(new URL('../src/pages/EarningsCalendarPage.jsx', import.meta.url), 'utf8');
const detailPageSource = fs.readFileSync(new URL('../src/pages/EarningsDetailPage.jsx', import.meta.url), 'utf8');
const shareSource = fs.readFileSync(new URL('../src/lib/shareEarningsDetail.js', import.meta.url), 'utf8');

test('earnings detail payload keeps only the documented SEC section contract', () => {
  const normalized = normalizeEarningsDetailPayload({
    success: true,
    status: 'complete',
    symbol: 'googl.us',
    currency: 'usd',
    period: {
      start: '2026-04-01T00:00:00Z',
      end: '2026-06-30',
      fiscalDate: '2026-06-30',
      reportDate: '2026-07-22',
    },
    source: {
      provider: 'SEC',
      filingUrl: 'https://www.sec.gov/Archives/example.htm',
      primaryDocumentUrl: 'https://evil.example/filing',
    },
    sections: {
      reportSegments: {
        status: 'complete',
        items: [{
          id: 'cloud',
          label: 'Google Cloud',
          labelZh: '谷歌云',
          revenue: 24_768_000_000,
          previousRevenue: 13_624_000_000,
          profitMetric: 'operatingIncome',
          profit: 8_814_000_000,
          previousProfit: 2_826_000_000,
          unexpected: 'discard',
        }],
      },
      revenueBreakdown: { status: 'pending', items: [] },
      geographies: { status: 'unavailable', reason: 'ambiguous', items: [] },
    },
  });

  assert.equal(normalized.symbol, 'GOOGL');
  assert.equal(normalized.currency, 'USD');
  assert.equal(normalized.source.filingUrl, 'https://www.sec.gov/Archives/example.htm');
  assert.equal(normalized.source.primaryDocumentUrl, null);
  assert.deepEqual(normalized.sections.reportSegments.items[0], {
    id: 'cloud',
    label: 'Google Cloud',
    labelZh: '谷歌云',
    revenue: 24_768_000_000,
    previousRevenue: 13_624_000_000,
    profitMetric: 'operatingIncome',
    profit: 8_814_000_000,
    previousProfit: 2_826_000_000,
  });
});

test('earnings detail uses Chinese wan/yi units and preserves raw report currency', () => {
  assert.equal(formatEarningsDetailMoney(119_796_000_000, 'zh'), '1197.96亿');
  assert.equal(formatEarningsDetailMoney(382_000_000, 'zh'), '3.82亿');
  assert.equal(formatEarningsDetailMoney(8_800_000, 'zh'), '880万');
  assert.equal(formatEarningsDetailMoney(-1_799_000_000, 'zh', { signed: true }), '-17.99亿');
  assert.equal(formatEarningsDetailMoney(24_768_000_000, 'en'), '$24.77B');
  assert.equal(Number(earningsPercentChange(24_768, 13_624).toFixed(1)), 81.8);
});

test('earnings detail caches complete data for six hours but pending data for only five minutes', () => {
  assert.equal(EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS, 6 * 60 * 60 * 1000);
  assert.equal(EARNINGS_DETAIL_PENDING_CACHE_TTL_MS, 5 * 60 * 1000);
  assert.equal(
    earningsDetailClientCacheKey({
      userId: 'user-1',
      symbol: 'googl.us',
      fiscalDate: '2026-06-30',
      reportDate: '2026-07-22',
    }),
    'xmoney_earnings_detail_v1:user-1:GOOGL:2026-06-30:2026-07-22',
  );
});

test('earnings source badge distinguishes official actuals from filing provenance', () => {
  assert.equal(
    earningsDetailSourceBadgeKind(
      { source: { provider: 'SEC', cik: '0000320193' } },
      {},
    ),
    'base',
  );
  assert.equal(
    earningsDetailSourceBadgeKind(
      { source: { provider: 'SEC', filingUrl: 'https://www.sec.gov/Archives/aapl.htm' } },
      {},
    ),
    'filing',
  );
  assert.equal(
    earningsDetailSourceBadgeKind(
      { source: { provider: 'SEC', filingUrl: 'https://www.sec.gov/Archives/nvda.htm' } },
      { revenueActualSource: 'sec-xbrl' },
    ),
    'official',
  );
  assert.equal(
    earningsDetailSourceBadgeKind(null, { secExhibitUrl: 'https://www.sec.gov/Archives/tsm.htm' }),
    'filing',
  );
});

test('earnings calendar and detail are standalone pages that retain the global bottom navigation', () => {
  assert.ok(appSource.includes("const EarningsCalendarPage = lazy(() => import('./pages/EarningsCalendarPage.jsx'));"));
  assert.ok(appSource.includes("const EarningsDetailPage = lazy(() => import('./pages/EarningsDetailPage.jsx'));"));
  assert.ok(appSource.includes("activePage === 'earnings-calendar'"));
  assert.ok(appSource.includes("activePage === 'earnings-detail'"));
  assert.ok(appSource.includes('const hideBottomNavigation = isPnlReportPage;'));
  assert.ok(calendarPageSource.includes('variant="standalone"'));
  assert.ok(calendarSource.includes('onOpenDetail={onOpenDetail}'));
  assert.ok(appSource.includes("setActivePage('earnings-calendar')"));
  assert.ok(appSource.includes("setActivePage('earnings-detail')"));
});

test('production detail renders every section in one page and shares the export root as a long PNG', () => {
  assert.ok(detailPageSource.includes('<DetailSections detail={detail}'));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Reportable segments' : '报告分部'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Revenue breakdown' : '细分结构'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Geographic revenue' : '地区收入'"));
  assert.ok(detailPageSource.includes("estimate: '—'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Base data' : '基础数据'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'SEC filing' : 'SEC 文件'"));
  assert.ok(detailPageSource.includes('Period ended'));
  assert.ok(detailPageSource.includes('该公司的官方细分数据暂未接入'));
  assert.ok(detailPageSource.includes('data-earnings-detail-export-root="true"'));
  assert.ok(detailPageSource.includes('data-export-ignore="true"'));
  assert.ok(shareSource.includes("navigator.canShare?.({ files: [file] })"));
  assert.ok(shareSource.includes("canvas.toBlob"));
  assert.ok(shareSource.includes('EARNINGS_DETAIL_EXPORT_MAX_DIMENSION = 8192'));
  assert.ok(shareSource.includes('} finally {'));
  assert.ok(shareSource.includes('anchor?.remove();'));
  assert.ok(shareSource.includes('setTimeout(() => URL.revokeObjectURL(url), 30_000)'));
  assert.equal(detailPageSource.includes('COMPANY_DATA'), false);
});

test('earnings detail export uses a stable readable width and stays inside iOS canvas limits', () => {
  const standard = calculateEarningsDetailExportLayout({
    height: 2_200,
    devicePixelRatio: 3,
  });
  assert.equal(standard.width, EARNINGS_DETAIL_EXPORT_WIDTH);
  assert.equal(standard.scale, 3);
  assert.equal(standard.outputWidth, 1_290);
  assert.equal(standard.outputHeight, 6_600);

  const longReport = calculateEarningsDetailExportLayout({
    height: 4_000,
    devicePixelRatio: 3,
  });
  assert.ok(longReport.scale < 3);
  assert.ok(longReport.outputWidth <= EARNINGS_DETAIL_EXPORT_MAX_DIMENSION);
  assert.ok(longReport.outputHeight <= EARNINGS_DETAIL_EXPORT_MAX_DIMENSION);
  assert.ok(
    longReport.outputWidth * longReport.outputHeight
      <= EARNINGS_DETAIL_EXPORT_MAX_PIXELS + longReport.outputWidth + longReport.outputHeight,
  );
  assert.ok(detailPageSource.includes('data-export-decoration="true"'));
  assert.ok(detailPageSource.includes('data-export-content="true"'));
  assert.ok(shareSource.includes('await clonedDocument.fonts?.ready'));
  assert.ok(shareSource.includes("root.style.webkitTextSizeAdjust = '100%'"));
  assert.ok(shareSource.includes('exportClone?.remove();'));
});
