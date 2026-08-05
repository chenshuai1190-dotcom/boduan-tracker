import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS,
  EARNINGS_DETAIL_PENDING_CACHE_TTL_MS,
  EARNINGS_DETAIL_UNPARSED_CACHE_TTL_MS,
  earningsDetailClientCacheKey,
  earningsDetailStructureRevenueTotal,
  earningsDetailSourceBadgeKind,
  earningsPercentChange,
  fetchEarningsDetail,
  formatEarningsDetailMoney,
  mergeEarningsDetailSummary,
  normalizeEarningsDetailPayload,
} from '../src/lib/earningsDetail.js';
import { normalizeEarningsEvents } from '../src/lib/earningsCalendarModel.js';
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

test('earnings detail uses a fresh cache namespace and retries transient detail states after five minutes', () => {
  assert.equal(EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS, 6 * 60 * 60 * 1000);
  assert.equal(EARNINGS_DETAIL_PENDING_CACHE_TTL_MS, 5 * 60 * 1000);
  assert.equal(EARNINGS_DETAIL_UNPARSED_CACHE_TTL_MS, 5 * 60 * 1000);
  assert.equal(
    earningsDetailClientCacheKey({
      userId: 'user-1',
      symbol: 'googl.us',
      fiscalDate: '2026-06-30',
      reportDate: '2026-07-22',
    }),
    'xmoney_earnings_detail_v3:user-1:GOOGL:2026-06-30:auto:2026-07-22',
  );
  assert.equal(
    earningsDetailClientCacheKey({
      userId: 'user-1',
      symbol: 'TSM',
      fiscalDate: '2026-03-31',
      reportDate: '2026-04-15',
    }),
    'xmoney_earnings_detail_tsm_q1_2026_v4:user-1:TSM:2026-03-31:auto:2026-04-15',
  );
  assert.equal(
    earningsDetailClientCacheKey({
      userId: 'user-1',
      symbol: 'TSM',
      fiscalDate: '2026-06-30',
      reportDate: '2026-07-16',
    }),
    'xmoney_earnings_detail_v3:user-1:TSM:2026-06-30:auto:2026-07-16',
  );
  assert.equal(
    earningsDetailClientCacheKey({
      userId: 'user-1',
      symbol: 'COST',
      fiscalDate: '2026-05-10',
      providerFiscalDate: '2026-05-31',
      officialFiscalDate: '2026-05-10',
      reportDate: '2026-05-28',
    }),
    'xmoney_earnings_detail_v3:user-1:COST:2026-05-31:2026-05-10:2026-05-28',
  );
});

test('earnings detail keeps only sanitized SEC failure diagnostics', () => {
  const normalized = normalizeEarningsDetailPayload({
    success: true,
    schemaVersion: 3,
    status: 'pending',
    reason: 'sec-unavailable',
    failureReason: 'sec-http-429',
    symbol: 'GOOGL',
    period: { fiscalDate: '2026-06-30', reportDate: '2026-07-22' },
    sections: {},
  });
  assert.equal(normalized.reason, 'sec-unavailable');
  assert.equal(normalized.failureReason, 'sec-http-429');

  const rejected = normalizeEarningsDetailPayload({
    success: true,
    status: 'pending',
    reason: 'sec-unavailable',
    failureReason: 'SEC failed for https://secret.example/?token=do-not-keep',
    symbol: 'GOOGL',
    period: { fiscalDate: '2026-06-30', reportDate: '2026-07-22' },
    sections: {},
  });
  assert.equal(rejected.failureReason, null);
});

test('a request failure never resurrects stale pending detail but may retain stale complete data', async () => {
  const originalStorage = globalThis.localStorage;
  const entries = new Map();
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const request = {
    supabase: {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'test-token',
              user: { id: 'cache-fallback-user' },
            },
          },
        }),
      },
    },
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
    fetchImpl: async () => {
      throw new Error('offline');
    },
  };
  const cacheKey = earningsDetailClientCacheKey({
    userId: 'cache-fallback-user',
    symbol: request.symbol,
    fiscalDate: request.fiscalDate,
    reportDate: request.reportDate,
  });
  const payload = (status, reason = null) => ({
    success: true,
    schemaVersion: 3,
    status,
    reason,
    symbol: 'GOOGL',
    currency: 'USD',
    period: {
      start: '2026-04-01',
      end: '2026-06-30',
      fiscalDate: '2026-06-30',
      reportDate: '2026-07-22',
    },
    sections: {},
  });

  try {
    entries.set(cacheKey, JSON.stringify({
      savedAt: Date.now() - EARNINGS_DETAIL_PENDING_CACHE_TTL_MS - 1,
      payload: payload('pending', 'sec-unavailable'),
    }));
    await assert.rejects(fetchEarningsDetail(request), /offline/);

    entries.set(cacheKey, JSON.stringify({
      savedAt: Date.now() - EARNINGS_DETAIL_CLIENT_CACHE_TTL_MS - 1,
      payload: payload('complete'),
    }));
    const retained = await fetchEarningsDetail(request);
    assert.equal(retained.status, 'complete');
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('structured revenue total takes the official section period before a headline quarter', () => {
  assert.equal(earningsDetailStructureRevenueTotal({
    sections: {
      reportSegments: {
        items: [
          { revenue: 80 },
          { revenue: 25 },
        ],
        reconciliation: { revenue: -5 },
      },
    },
  }, { revenueActualUsd: 30 }), 100);
  assert.equal(earningsDetailStructureRevenueTotal({
    sections: { reportSegments: { items: [] } },
  }, { revenueActualUsd: 30 }), 30);
});

test('calendar-to-detail request uses the official fiscal period and keeps the provider period separate', async () => {
  const [event] = normalizeEarningsEvents([{
    code: 'NVDA.US',
    reportDate: '2026-05-20',
    providerFiscalDate: '2026-04-30',
    fiscalDate: '2026-04-26',
    earningsPublished: true,
    epsActual: 1,
  }]);
  let requestedUrl = '';
  const detail = await fetchEarningsDetail({
    supabase: {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'test-token',
              user: { id: 'coordinate-test-user' },
            },
          },
        }),
      },
    },
    symbol: event.symbol,
    fiscalDate: event.fiscalDate,
    providerFiscalDate: event.providerFiscalDate,
    officialFiscalDate: event.officialFiscalDate,
    reportDate: event.reportDate,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        async json() {
          return {
            success: true,
            status: 'complete',
            symbol: 'NVDA',
            currency: 'USD',
            period: {
              start: '2026-01-26',
              end: '2026-04-26',
              fiscalDate: '2026-04-26',
              providerFiscalDate: '2026-04-30',
              officialFiscalDate: '2026-04-26',
              reportDate: '2026-05-20',
            },
            sections: {
              reportSegments: { status: 'complete', items: [] },
              revenueBreakdown: { status: 'complete', items: [] },
              geographies: { status: 'complete', items: [] },
            },
          };
        },
      };
    },
  });

  const params = new URL(requestedUrl, 'https://local.test').searchParams;
  assert.equal(event.providerFiscalDate, '2026-04-30');
  assert.equal(event.fiscalDate, '2026-04-26');
  assert.equal(event.officialFiscalDate, '2026-04-26');
  assert.equal(params.get('fiscalDate'), '2026-04-26');
  assert.equal(params.get('providerFiscalDate'), '2026-04-30');
  assert.equal(params.get('officialFiscalDate'), '2026-04-26');
  assert.equal(params.get('reportDate'), '2026-05-20');
  assert.equal(detail.period.fiscalDate, '2026-04-26');
});

test('TSM Q1 official summary overrides only the matching detail page event', () => {
  const event = {
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
    reportDate: '2026-04-15',
    revenueActualUsd: 34_957_000_000,
    revenueEstimateUsd: 34_500_000_000,
    ebitActualUsd: 20_260_000_000,
    epsActual: 3.49,
    epsEstimate: 3.36,
    epsCurrency: 'TWD',
    epsUnit: 'TWD/share',
  };
  const detail = normalizeEarningsDetailPayload({
    success: true,
    schemaVersion: 2,
    status: 'complete',
    symbol: 'TSM',
    currency: 'USD',
    period: {
      start: '2026-01-01',
      end: '2026-03-31',
      fiscalDate: '2026-03-31',
      reportDate: '2026-04-15',
    },
    source: {
      provider: 'TSMC',
      primaryDocumentUrl: 'https://investor.tsmc.com/english/reports/1Q26ManagementReport.pdf',
    },
    sections: {},
    summaryActuals: {
      revenueActualUsd: 35_901_000_000,
      revenuePreviousYearUsd: 25_525_000_000,
      ebitActualUsd: 20_860_000_000,
      ebitPreviousYearUsd: 12_381_000_000,
      ebitActualBasis: 'operatingIncome',
      epsActual: 3.49,
      epsPreviousYear: 2.12,
      epsCurrency: 'USD',
      epsUnit: 'USD/ADR',
      officialActualSource: 'sec-exhibit',
      secExhibitUrl: 'https://www.sec.gov/Archives/edgar/data/1046179/000104617926000199/a1q26e_withguidancexfinal.htm',
    },
  });
  const merged = mergeEarningsDetailSummary(event, detail);

  assert.notEqual(merged, event);
  assert.equal(merged.revenueActualUsd, 35_901_000_000);
  assert.equal(merged.revenueEstimateUsd, 34_500_000_000);
  assert.equal(merged.ebitActualUsd, 20_860_000_000);
  assert.equal(merged.epsActual, 3.49);
  assert.equal(merged.epsEstimate, 3.36);
  assert.equal(merged.epsCurrency, 'USD');
  assert.equal(merged.epsUnit, 'USD/ADR');
  assert.equal(
    merged.revenueActualYoyPercent,
    earningsPercentChange(35_901_000_000, 25_525_000_000),
  );
  assert.equal(
    merged.ebitActualYoyPercent,
    earningsPercentChange(20_860_000_000, 12_381_000_000),
  );
  assert.equal(merged.epsActualYoyPercent, earningsPercentChange(3.49, 2.12));
  assert.equal(event.revenueActualUsd, 34_957_000_000);
  assert.equal(event.epsUnit, 'TWD/share');

  assert.equal(mergeEarningsDetailSummary(event, {
    ...detail,
    period: { ...detail.period, reportDate: '2026-04-16' },
  }), event);
  assert.equal(mergeEarningsDetailSummary(event, {
    ...detail,
    symbol: 'NOK',
  }), event);
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
  assert.ok(detailPageSource.includes('mergeEarningsDetailSummary(event, detail)'));
  assert.ok(detailPageSource.includes('<EarningsSummary event={effectiveEvent}'));
  assert.ok(detailPageSource.includes('<DetailSections detail={detail} event={effectiveEvent}'));
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
