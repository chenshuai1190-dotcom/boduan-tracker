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
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const calendarSource = fs.readFileSync(new URL('../src/tabs/EarningsCalendar.jsx', import.meta.url), 'utf8');
const homeTabSource = fs.readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const calendarPageSource = fs.readFileSync(new URL('../src/pages/EarningsCalendarPage.jsx', import.meta.url), 'utf8');
const detailPageSource = fs.readFileSync(new URL('../src/pages/EarningsDetailPage.jsx', import.meta.url), 'utf8');

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

test('home earnings preview opens published reports directly and returns to Home', () => {
  assert.ok(homeTabSource.includes('openEarningsDetail,'));
  assert.ok(homeTabSource.includes("onOpenDetail={(event) => openEarningsDetail(event, { returnPage: 'home' })}"));
  assert.ok(calendarSource.includes('const openPreviewEvent = (event) => {'));
  assert.ok(calendarSource.includes("if (isEarningsPublished(event) && typeof onOpenDetail === 'function')"));
  assert.ok(calendarSource.includes('onOpenDetail(event);'));
  assert.ok(calendarSource.includes("openModal('list', event.reportDate);"));
  assert.ok(calendarSource.includes('onClick={() => openPreviewEvent(event)}'));
  assert.ok(appSource.includes("returnPage === 'home'"));
  assert.ok(appSource.includes("if (earningsDetailReturnPage === 'home')"));
  assert.ok(appSource.includes('pendingHomeScrollTopRef.current = homeScrollTopBeforeEarningsRef.current;'));
  assert.ok(appSource.includes('setActivePage(null);'));
});

test('production detail renders every official section without screenshot or share controls', () => {
  assert.ok(detailPageSource.includes('<DetailSections detail={detail}'));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Reportable segments' : '报告分部'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Revenue breakdown' : '细分结构'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Geographic revenue' : '地区收入'"));
  assert.ok(detailPageSource.includes("estimate: '—'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'Base data' : '基础数据'"));
  assert.ok(detailPageSource.includes("language === 'en' ? 'SEC filing' : 'SEC 文件'"));
  assert.ok(detailPageSource.includes('Period ended'));
  assert.ok(detailPageSource.includes('该公司的官方细分数据暂未接入'));
  assert.equal(detailPageSource.includes('shareEarningsDetailImage'), false);
  assert.equal(detailPageSource.includes('Share2'), false);
  assert.equal(detailPageSource.includes('data-earnings-export-page'), false);
  assert.equal(detailPageSource.includes('分享完整财报'), false);
  assert.equal(fs.existsSync(new URL('../src/lib/shareEarningsDetail.js', import.meta.url)), false);
  assert.equal(detailPageSource.includes('COMPANY_DATA'), false);
});

test('earnings growth stays independent and renders below official detail before methodology', () => {
  const detailSectionsIndex = detailPageSource.indexOf('<DetailSections detail={detail}');
  const growthCardIndex = detailPageSource.indexOf('<EarningsGrowthCard');
  const methodologyIndex = detailPageSource.indexOf('<div className="mt-3 rounded-[14px]');

  assert.ok(detailSectionsIndex >= 0 && detailSectionsIndex < growthCardIndex);
  assert.ok(growthCardIndex < methodologyIndex);
  assert.ok(detailPageSource.includes('earningsGrowthDataOverride'));
  assert.ok(detailPageSource.includes('supabase.auth.getSession()'));
  assert.ok(detailPageSource.includes('token={growthSession?.access_token}'));
  assert.ok(detailPageSource.includes('userId={growthSession?.user?.id}'));
});
