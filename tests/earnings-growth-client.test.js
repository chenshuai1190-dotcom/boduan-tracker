import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  SEC_FINANCIAL_HISTORY_SCHEMA_VERSION,
} from '../server/earnings/secFinancialHistory.js';
import {
  EARNINGS_GROWTH_CACHE_TTL_MS,
  EARNINGS_GROWTH_QUARTERLY_DISPLAY_LIMIT,
  EARNINGS_GROWTH_SCHEMA_VERSION,
  EARNINGS_GROWTH_STORAGE_PREFIX,
  EARNINGS_GROWTH_STORAGE_VERSION,
  EARNINGS_GROWTH_TRANSIENT_CACHE_TTL_MS,
  buildEarningsGrowthChartGeometry,
  buildEarningsGrowthSummary,
  calculateEarningsGrowthCagr,
  earningsGrowthVisiblePeriods,
  loadEarningsGrowth,
  normalizeEarningsGrowthPayload,
  resetEarningsGrowthMemoryCache,
} from '../src/lib/earningsGrowth.js';

const PREVIOUS_EARNINGS_GROWTH_SCHEMA_VERSION = 2;
const componentSource = fs.readFileSync(
  new URL('../src/components/EarningsGrowthCard.jsx', import.meta.url),
  'utf8',
);

function period(fiscalYear, overrides = {}) {
  const fiscalYearNumber = Number(String(fiscalYear).replace(/^FY/i, ''));
  const startYear = fiscalYearNumber - 1;
  return {
    fiscalYear,
    startDate: `${startYear}-01-27`,
    endDate: `${fiscalYearNumber}-01-26`,
    revenue: fiscalYearNumber * 1_000_000,
    netIncome: fiscalYearNumber * 400_000,
    netMarginPct: 40,
    revenueYoyPct: 20,
    netIncomeYoyPct: 25,
    netMarginChangePpt: 1.5,
    revenueQoqPct: null,
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    success: true,
    schemaVersion: EARNINGS_GROWTH_SCHEMA_VERSION,
    status: 'complete',
    symbol: 'NVDA',
    currency: 'USD',
    source: {
      provider: 'SEC_COMPANY_FACTS',
      asOfDate: '2026-07-26',
      url: 'https://www.sec.gov/Archives/example',
    },
    annual: [
      period(2023, { revenue: 100, netIncome: 20 }),
      period(2024, { revenue: 200, netIncome: 40 }),
      period(2025, { revenue: 400, netIncome: 80 }),
    ],
    quarterly: [
      period(2025, {
        fiscalQuarter: 3,
        startDate: '2024-07-29',
        endDate: '2024-10-27',
        revenue: 35,
        netIncome: 19,
      }),
      period(2025, {
        fiscalQuarter: 4,
        startDate: '2024-10-28',
        endDate: '2025-01-26',
        revenue: 39,
        netIncome: 22,
        revenueYoyPct: 77.9,
        netIncomeYoyPct: 79.8,
      }),
    ],
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('earnings growth normalization keeps only complete comparable periods', () => {
  const normalized = normalizeEarningsGrowthPayload(payload({
    symbol: 'nvda.us',
    annual: [
      period(2021),
      period(2022, { netIncome: null }),
      period(2023),
      period(2024),
      period(2025),
      period(2026),
      period(2027),
      period(2028),
    ],
  }), 'NVDA');

  assert.equal(normalized.symbol, 'NVDA');
  assert.equal(normalized.schemaVersion, EARNINGS_GROWTH_SCHEMA_VERSION);
  assert.equal(normalized.currency, 'USD');
  assert.equal(normalized.annual.length, 6);
  assert.deepEqual(normalized.annual.map((row) => row.fiscalYear), [
    2023, 2024, 2025, 2026, 2027, 2028,
  ]);
  assert.equal(normalized.source.provider, 'SEC_COMPANY_FACTS');
});

test('earnings growth normalization rejects missing or stale response schemas', () => {
  const missingSchema = payload();
  delete missingSchema.schemaVersion;
  assert.equal(normalizeEarningsGrowthPayload(missingSchema, 'NVDA'), null);
  assert.equal(normalizeEarningsGrowthPayload(payload({
    schemaVersion: PREVIOUS_EARNINGS_GROWTH_SCHEMA_VERSION,
  }), 'NVDA'), null);
  assert.equal(normalizeEarningsGrowthPayload(payload({
    schemaVersion: String(EARNINGS_GROWTH_SCHEMA_VERSION),
  }), 'NVDA'), null);
});

test('earnings growth client and SEC history server require the same schema', () => {
  assert.equal(EARNINGS_GROWTH_SCHEMA_VERSION, 3);
  assert.equal(
    SEC_FINANCIAL_HISTORY_SCHEMA_VERSION,
    EARNINGS_GROWTH_SCHEMA_VERSION,
  );
});

test('conflicting duplicate fiscal periods fail closed', () => {
  const normalized = normalizeEarningsGrowthPayload(payload({
    annual: [
      period(2024, { revenue: 100 }),
      period(2024, { revenue: 101 }),
      period(2025, { revenue: 200 }),
    ],
  }));
  assert.deepEqual(normalized.annual.map((row) => row.fiscalYear), [2025]);
});

test('annual CAGR uses fiscal-year intervals and rejects gaps or non-positive profit', () => {
  const rows = [
    period(2023, { revenue: 100, netIncome: 20 }),
    period(2024, { revenue: 200, netIncome: 40 }),
    period(2025, { revenue: 400, netIncome: 80 }),
  ];
  assert.equal(Number(calculateEarningsGrowthCagr(rows, 'revenue').toFixed(1)), 100);
  assert.equal(Number(calculateEarningsGrowthCagr(rows, 'netIncome').toFixed(1)), 100);
  assert.equal(calculateEarningsGrowthCagr([rows[0], rows[2]], 'revenue'), null);
  assert.equal(calculateEarningsGrowthCagr([
    rows[0],
    rows[1],
    { ...rows[2], netIncome: -10 },
  ], 'netIncome'), null);
});

test('quarterly summary uses latest reported year-over-year fields', () => {
  const normalized = normalizeEarningsGrowthPayload(payload({
    annual: [
      period('FY2024', { revenue: 200, netIncome: 40 }),
      period('FY2025', { revenue: 400, netIncome: 80 }),
    ],
    quarterly: [
      period('FY2025', {
        fiscalQuarter: 'Q3',
        startDate: '2024-07-29',
        endDate: '2024-10-27',
        revenue: 35,
        netIncome: 19,
      }),
      period('FY2025', {
        fiscalQuarter: 'Q4',
        startDate: '2024-10-28',
        endDate: '2025-01-26',
        revenue: 39,
        netIncome: 22,
        revenueYoyPct: 77.9,
        netIncomeYoyPct: 79.8,
      }),
    ],
  }));
  const summary = buildEarningsGrowthSummary(normalized, 'quarterly');
  assert.equal(summary.periodText, 'FY2025 Q4');
  assert.equal(summary.revenueValue, 77.9);
  assert.equal(summary.netIncomeValue, 79.8);
});

test('chart geometry includes a visible zero axis and negative net-income bars', () => {
  const rows = [
    period(2024, { revenue: 100, netIncome: -30 }),
    period(2025, { revenue: 150, netIncome: 40 }),
  ];
  const chart = buildEarningsGrowthChartGeometry(rows);
  assert.ok(chart.domainMin < 0);
  assert.ok(chart.domainMax > 0);
  assert.ok(chart.zeroY > chart.top);
  assert.ok(chart.zeroY < chart.height - chart.bottom);
  assert.equal(chart.groups[0].netIncome.y, chart.zeroY);
  assert.ok(chart.groups[0].netIncome.height > 0);
  assert.ok(chart.groups[0].revenue.y < chart.zeroY);
});

test('chart labels keep a consistent distance from positive bars and grouped bars have breathing room', () => {
  const rows = [
    period(2024, { revenue: 167, netIncome: 43 }),
    period(2025, { revenue: 2_159, netIncome: 1_201 }),
  ];
  const chart = buildEarningsGrowthChartGeometry(rows);
  for (const group of chart.groups) {
    assert.equal(group.revenueLabelY, group.revenue.valueY - 6);
    assert.equal(group.netIncomeLabelY, group.netIncome.valueY - 6);
    assert.ok(group.netIncome.x - (group.revenue.x + group.revenue.width) >= 4);
  }
});

test('six visible quarters stay inside the card without a horizontal scroller', () => {
  const rows = Array.from({ length: 8 }, (_, index) => period(`FY202${index}`, {
    fiscalQuarter: `Q${(index % 4) + 1}`,
    revenue: 1_198 + index,
    netIncome: 1_122 + index,
  }));
  const visible = earningsGrowthVisiblePeriods({ quarterly: rows }, 'quarterly');
  assert.equal(EARNINGS_GROWTH_QUARTERLY_DISPLAY_LIMIT, 6);
  assert.equal(rows.length, 8);
  assert.equal(visible.length, 6);
  assert.equal(visible[0], rows[2]);
  const chart = buildEarningsGrowthChartGeometry(visible, {
    mode: 'quarterly',
    width: 356,
    height: 185,
  });
  const annualGeometry = buildEarningsGrowthChartGeometry(visible, {
    mode: 'annual',
    width: 356,
    height: 185,
  });
  assert.equal(chart.width, 356);
  chart.groups.forEach((group, index) => {
    const revenueCenter = group.revenue.x + group.revenue.width / 2;
    const netIncomeCenter = group.netIncome.x + group.netIncome.width / 2;
    assert.equal(group.revenue.width, annualGeometry.groups[index].revenue.width);
    assert.equal(group.netIncome.width, annualGeometry.groups[index].netIncome.width);
    assert.equal(group.revenue.x, annualGeometry.groups[index].revenue.x);
    assert.equal(group.netIncome.x, annualGeometry.groups[index].netIncome.x);
    assert.equal(group.centerX, annualGeometry.groups[index].centerX);
    assert.ok(group.revenue.x >= chart.left);
    assert.ok(group.netIncome.x + group.netIncome.width <= chart.width - chart.right);
    if (index > 0) {
      const previous = chart.groups[index - 1];
      const previousNetIncomeCenter = previous.netIncome.x + previous.netIncome.width / 2;
      assert.ok(revenueCenter - previousNetIncomeCenter >= 30);
    }
    assert.ok(netIncomeCenter > revenueCenter);
  });
});

test('earnings growth loader authenticates once and reuses the user-scoped cache', async () => {
  resetEarningsGrowthMemoryCache();
  const storage = memoryStorage();
  let requestCount = 0;
  const fetchImpl = async (url, options) => {
    requestCount += 1;
    assert.equal(url, '/api/earnings-growth?symbol=NVDA');
    assert.equal(options.headers.Authorization, 'Bearer session-token');
    assert.equal(options.cache, 'no-store');
    return {
      ok: true,
      async json() {
        return payload();
      },
    };
  };
  const options = {
    userId: 'user-1',
    symbol: 'NVDA',
    token: 'session-token',
    fetchImpl,
    storage,
    now: () => 1_000,
  };
  const first = await loadEarningsGrowth(options);
  const second = await loadEarningsGrowth(options);
  assert.equal(first.symbol, 'NVDA');
  assert.equal(second.annual.length, 3);
  assert.equal(requestCount, 1);
});

test('earnings growth loader bypasses an unexpired v1 cache containing schema 2 complete data', async () => {
  resetEarningsGrowthMemoryCache();
  const storage = memoryStorage();
  const userId = 'user-schema-upgrade';
  const oldPayload = payload({
    schemaVersion: PREVIOUS_EARNINGS_GROWTH_SCHEMA_VERSION,
    annual: [period(2024, { revenue: 100, netIncome: 20 })],
  });
  storage.setItem(
    `xmoney_earnings_growth_v1:${userId}:NVDA`,
    JSON.stringify({
      version: 1,
      expiresAt: EARNINGS_GROWTH_CACHE_TTL_MS * 2,
      data: oldPayload,
    }),
  );
  let requestCount = 0;
  const fresh = await loadEarningsGrowth({
    userId,
    symbol: 'NVDA',
    token: 'session-token',
    storage,
    now: () => 1_000,
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: true,
        async json() {
          return payload({
            annual: [period(2025, { revenue: 200, netIncome: 40 })],
          });
        },
      };
    },
  });

  assert.equal(requestCount, 1);
  assert.equal(fresh.annual.at(-1).fiscalYear, 2025);
  const upgraded = JSON.parse(
    storage.getItem(`${EARNINGS_GROWTH_STORAGE_PREFIX}:${userId}:NVDA`),
  );
  assert.equal(upgraded.version, EARNINGS_GROWTH_STORAGE_VERSION);
  assert.equal(upgraded.data.schemaVersion, EARNINGS_GROWTH_SCHEMA_VERSION);
});

test('earnings growth loader rejects schema 2 inside the current cache key', async () => {
  resetEarningsGrowthMemoryCache();
  const storage = memoryStorage();
  const userId = 'user-current-schema-mismatch';
  storage.setItem(
    `${EARNINGS_GROWTH_STORAGE_PREFIX}:${userId}:NVDA`,
    JSON.stringify({
      version: EARNINGS_GROWTH_STORAGE_VERSION,
      expiresAt: EARNINGS_GROWTH_CACHE_TTL_MS * 2,
      data: payload({
        schemaVersion: PREVIOUS_EARNINGS_GROWTH_SCHEMA_VERSION,
        annual: [period(2024, { revenue: 100, netIncome: 20 })],
      }),
    }),
  );
  let requestCount = 0;
  const fresh = await loadEarningsGrowth({
    userId,
    symbol: 'NVDA',
    token: 'session-token',
    storage,
    now: () => 1_000,
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: true,
        async json() {
          return payload({
            annual: [period(2025, { revenue: 200, netIncome: 40 })],
          });
        },
      };
    },
  });

  assert.equal(requestCount, 1);
  assert.equal(fresh.schemaVersion, EARNINGS_GROWTH_SCHEMA_VERSION);
  assert.equal(fresh.annual.at(-1).fiscalYear, 2025);
});

test('unavailable official history accepts an empty currency and uses the transient cache', async () => {
  resetEarningsGrowthMemoryCache();
  const storage = memoryStorage();
  let currentTime = 1_000;
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return {
      ok: true,
      async json() {
        return payload({
          status: 'unavailable',
          reason: 'official-history-unavailable',
          currency: '',
          annual: [period(2026)],
          quarterly: [period(2026, { fiscalQuarter: 1 })],
        });
      },
    };
  };
  const options = {
    userId: 'user-unavailable',
    symbol: 'NVDA',
    token: 'session-token',
    fetchImpl,
    storage,
    now: () => currentTime,
  };

  const first = await loadEarningsGrowth(options);
  const cached = await loadEarningsGrowth(options);
  assert.equal(first.status, 'unavailable');
  assert.equal(first.currency, '');
  assert.deepEqual(first.annual, []);
  assert.deepEqual(first.quarterly, []);
  assert.equal(cached.status, 'unavailable');
  assert.equal(requestCount, 1);

  currentTime += EARNINGS_GROWTH_TRANSIENT_CACHE_TTL_MS + 1;
  resetEarningsGrowthMemoryCache();
  await loadEarningsGrowth(options);
  assert.equal(requestCount, 2);
});

test('expired verified data is used only when a refresh fails', async () => {
  resetEarningsGrowthMemoryCache();
  const storage = memoryStorage();
  let currentTime = 2_000;
  const baseOptions = {
    userId: 'user-2',
    symbol: 'NVDA',
    token: 'session-token',
    storage,
    now: () => currentTime,
  };
  await loadEarningsGrowth({
    ...baseOptions,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return payload();
      },
    }),
  });

  currentTime += EARNINGS_GROWTH_CACHE_TTL_MS + 1;
  resetEarningsGrowthMemoryCache();
  const stale = await loadEarningsGrowth({
    ...baseOptions,
    fetchImpl: async () => {
      throw new Error('provider unavailable');
    },
  });
  assert.equal(stale.symbol, 'NVDA');
  assert.equal(stale.annual.length, 3);
});

test('earnings growth component keeps the confirmed mobile interaction contract', () => {
  assert.ok(componentSource.includes("IntersectionObserver"));
  assert.ok(componentSource.includes("data-earnings-growth-mode={mode}"));
  assert.ok(componentSource.includes("data-earnings-growth-period={key}"));
  assert.ok(componentSource.includes("onClick={() => onSelect(key)}"));
  assert.ok(componentSource.includes("fontSize=\"10\""));
  assert.ok(componentSource.includes("fontWeight=\"400\""));
  assert.equal(componentSource.includes("useGrouping: !chart"), false);
  assert.ok(componentSource.includes("grid-cols-[minmax(0,1fr)_max-content_max-content]"));
  assert.ok(componentSource.includes("selected.netMarginChangePpt"));
  assert.ok(componentSource.includes("selected.revenueQoqPct"));
  assert.equal(componentSource.includes("stroke={selected ? 'rgba(231,170,73,0.12)'"), false);
  assert.equal(componentSource.includes("bg-[#e7aa49]/[0.14]"), false);
  assert.equal(componentSource.includes("shadow-[inset_0_0_0_1px_rgba(231,170,73,0.25)]"), false);
  assert.equal(componentSource.includes('<Info'), false);
  assert.equal(componentSource.includes('sourceText('), false);
  assert.equal(componentSource.includes('SEC 公司事实'), false);
  assert.equal(componentSource.includes('role="dialog"'), false);
  assert.ok(componentSource.includes('const QUARTERLY_CHART_WIDTH = 356'));
  assert.ok(componentSource.includes("earningsGrowthVisiblePeriods(data, mode)"));
  assert.equal(componentSource.includes('overflow-x-auto'), false);
  assert.equal(componentSource.includes('scrollLeft ='), false);
});
