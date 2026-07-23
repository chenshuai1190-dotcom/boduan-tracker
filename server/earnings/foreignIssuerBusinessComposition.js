import { htmlToText } from './secOfficialParsers.js';

const SUPPORTED_SYMBOLS = new Set(['NOK', 'TSM']);
const NOKIA_CIK = '0000924613';
const TSMC_CIK = '0001046179';
const MONEY_TOKEN = '(?:—|\\((?:\\d+(?: \\d{3})*)\\)|(?:\\d+(?: \\d{3})*))';
const TSMC_Q2_2026_MANAGEMENT_REPORT_URL = 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/6f49632674bd2d0fd48cb65aaf89ec6ab510b559/2Q26%20ManagementReport.pdf';
const TSMC_Q2_2026_MANAGEMENT_REPORT_TEXT = `
TSMC
July 16, 2026
2Q26 Quarterly Management Report

Summary:
2Q26 1Q26 2Q25 QoQ YoY
Net Revenue (US$ billions) 40.20 35.90 30.07 12.0% 33.7%
Operating Margin 60.3% 58.1% 49.6%

Wafer Revenue by Technology 2Q26 1Q26 2Q25
2nm 3% 0% 0%
3nm 30% 25% 24%
5nm 33% 36% 36%
7nm 11% 13% 14%
16/20nm 6% 7% 7%
28nm 6% 7% 7%
40/45nm 2% 3% 3%
65nm 4% 4% 3%
90nm-0.13um 2% 2% 3%
≥0.15um 3% 3% 3%

Net Revenue by Platform 2Q26 1Q26 2Q25
High Performance Computing 66% 61% 60%
Smartphone 22% 26% 27%
Internet of Things 5% 6% 5%
Automotive 4% 4% 5%
Digital Consumer Electronics 1% 1% 1%
Others 2% 2% 2%

Net Revenue by Geography 2Q26 1Q26 2Q25
North America 78% 76% 75%
Asia Pacific 8% 9% 9%
China 6% 7% 9%
Japan 4% 4% 4%
EMEA 4% 4% 3%

Revenue Analysis:
In the second quarter, revenue increased 12.0% quarter-over-quarter.
`;

const NOKIA_SEGMENTS = [
  {
    id: 'network-infrastructure',
    label: 'Network Infrastructure',
    labelZh: '网络基础设施',
    sectionStart: 'Network Infrastructure EUR million',
    sectionEnd: 'Mobile Infrastructure EUR million',
    profitLabel: 'Operating profit',
  },
  {
    id: 'mobile-infrastructure',
    label: 'Mobile Infrastructure',
    labelZh: '移动基础设施',
    sectionStart: 'Mobile Infrastructure EUR million',
    sectionEnd: 'Portfolio Businesses EUR million',
    profitLabel: 'Operating profit',
  },
  {
    id: 'portfolio-businesses',
    label: 'Portfolio Businesses',
    labelZh: '组合业务',
    sectionStart: 'Portfolio Businesses EUR million',
    sectionEnd: 'Group Common and Other EUR million',
    profitLabel: 'Operating (loss)/profit',
  },
];

const NOKIA_BUSINESS_UNITS = [
  {
    id: 'optical-networks',
    label: 'Optical Networks',
    labelZh: '光网络',
    segmentId: 'network-infrastructure',
  },
  {
    id: 'ip-networks',
    label: 'IP Networks',
    labelZh: 'IP 网络',
    segmentId: 'network-infrastructure',
  },
  {
    id: 'fixed-networks',
    label: 'Fixed Networks',
    labelZh: '固定网络',
    segmentId: 'network-infrastructure',
  },
  {
    id: 'core-software',
    label: 'Core Software',
    labelZh: '核心软件',
    segmentId: 'mobile-infrastructure',
  },
  {
    id: 'radio-networks',
    label: 'Radio Networks',
    labelZh: '无线网络',
    segmentId: 'mobile-infrastructure',
  },
  {
    id: 'technology-standards',
    label: 'Technology Standards',
    labelZh: '技术标准与授权',
    segmentId: 'mobile-infrastructure',
  },
  {
    id: 'portfolio-businesses',
    label: 'Portfolio Businesses',
    labelZh: '组合业务',
    segmentId: 'portfolio-businesses',
    rowLabel: 'Net sales',
  },
];

const NOKIA_GEOGRAPHIES = [
  { id: 'americas', label: 'Americas', labelZh: '美洲' },
  { id: 'apac', label: 'APAC', labelZh: '亚太地区' },
  { id: 'emea', label: 'EMEA', labelZh: '欧洲、中东和非洲' },
];

const NOKIA_CUSTOMER_TYPES = [
  {
    id: 'telecommunication-providers',
    label: 'Telecommunication Providers',
    labelZh: '电信运营商',
  },
  {
    id: 'ai-cloud',
    label: 'AI & Cloud',
    labelZh: 'AI 与云客户',
  },
  {
    id: 'mission-critical-enterprise-defense',
    label: 'Mission Critical Enterprise & Defense',
    labelZh: '关键任务企业与国防',
  },
  {
    id: 'technology-licensees',
    label: 'Technology Licensees',
    labelZh: '技术授权客户',
  },
];

const TSMC_PLATFORMS = [
  {
    id: 'high-performance-computing',
    label: 'High Performance Computing',
    labelZh: '高性能计算',
  },
  { id: 'smartphone', label: 'Smartphone', labelZh: '智能手机' },
  { id: 'internet-of-things', label: 'Internet of Things', labelZh: '物联网' },
  { id: 'automotive', label: 'Automotive', labelZh: '汽车电子' },
  {
    id: 'digital-consumer-electronics',
    label: 'Digital Consumer Electronics',
    labelZh: '数字消费电子',
  },
  { id: 'others', label: 'Others', labelZh: '其他平台' },
];

const TSMC_GEOGRAPHIES = [
  { id: 'north-america', label: 'North America', labelZh: '北美' },
  { id: 'asia-pacific', label: 'Asia Pacific', labelZh: '亚太地区' },
  { id: 'china', label: 'China', labelZh: '中国' },
  { id: 'japan', label: 'Japan', labelZh: '日本' },
  { id: 'emea', label: 'EMEA', labelZh: '欧洲、中东和非洲' },
];

const TSMC_TECHNOLOGIES = [
  { id: '2nm', label: '2nm', labelZh: '2 纳米' },
  { id: '3nm', label: '3nm', labelZh: '3 纳米' },
  { id: '5nm', label: '5nm', labelZh: '5 纳米' },
  { id: '7nm', label: '7nm', labelZh: '7 纳米' },
  { id: '16-20nm', label: '16/20nm', labelZh: '16/20 纳米' },
  { id: '28nm', label: '28nm', labelZh: '28 纳米' },
  { id: '40-45nm', label: '40/45nm', labelZh: '40/45 纳米' },
  { id: '65nm', label: '65nm', labelZh: '65 纳米' },
  { id: '90nm-0.13um', label: '90nm-0.13um', labelZh: '90 纳米至 0.13 微米' },
  { id: '0.15um-and-above', label: '≥0.15um', labelZh: '0.15 微米及以上' },
];

export function hasForeignIssuerBusinessCompositionAdapter(symbol) {
  return SUPPORTED_SYMBOLS.has(normalizeSymbol(symbol));
}

export function knownForeignIssuerBusinessComposition({
  symbol,
  fiscalDate,
} = {}) {
  if (normalizeSymbol(symbol) !== 'TSM' || dateKey(fiscalDate) !== '2026-06-30') {
    return null;
  }
  return parseForeignIssuerBusinessComposition({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    sourceText: TSMC_Q2_2026_MANAGEMENT_REPORT_TEXT,
    sourceUrl: TSMC_Q2_2026_MANAGEMENT_REPORT_URL,
  });
}

export function foreignIssuerBusinessCompositionDiscoveryUrl({
  symbol,
  fiscalDate,
} = {}) {
  if (normalizeSymbol(symbol) !== 'TSM') return null;
  const period = exactQuarterPeriod(fiscalDate);
  if (!period) return null;
  return `https://investor.tsmc.com/english/quarterly-results/${period.year}/q${period.quarter}`;
}

export function discoverForeignIssuerBusinessCompositionDocument({
  symbol,
  fiscalDate,
  html,
  baseUrl,
} = {}) {
  if (normalizeSymbol(symbol) !== 'TSM'
    || !exactQuarterPeriod(fiscalDate)
    || typeof html !== 'string') {
    return null;
  }
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    if (!/^Management Report$/i.test(htmlToText(match[2]).trim())) continue;
    const hrefMatch = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    try {
      const url = new URL(decodeHtmlAttribute(hrefMatch[1]), baseUrl);
      if (url.protocol !== 'https:'
        || url.hostname !== 'investor.tsmc.com'
        || !/\.pdf$/i.test(url.pathname)) {
        continue;
      }
      return url.toString();
    } catch {
      // Ignore malformed or non-absolute official-report links.
    }
  }
  return null;
}

export function foreignIssuerFilingCandidateMatches({
  symbol,
  fiscalDate,
  reportDate,
  filing,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  const normalizedReportDate = dateKey(reportDate);
  const filingDate = dateKey(filing?.filingDate)
    || dateKey(String(filing?.acceptedAt || '').slice(0, 10));
  const filingReportDate = dateKey(filing?.reportDate);
  const form = String(filing?.form || '').trim().toUpperCase();
  const cik = normalizeCik(filing?.cik);

  if (!normalizedFiscalDate
    || !normalizedReportDate
    || !filingDate
    || form !== '6-K') {
    return false;
  }
  if (normalizedSymbol === 'NOK') {
    return (!cik || cik === NOKIA_CIK)
      && Math.abs(dateDistanceDays(filingDate, normalizedReportDate)) <= 1
      && (!filingReportDate
        || filingReportDate === normalizedFiscalDate
        || Math.abs(dateDistanceDays(filingReportDate, normalizedReportDate)) <= 1);
  }
  if (normalizedSymbol === 'TSM') {
    return (!cik || cik === TSMC_CIK)
      && filingReportDate === normalizedFiscalDate
      && Math.abs(dateDistanceDays(filingDate, normalizedReportDate)) <= 2;
  }
  return false;
}

export function parseForeignIssuerBusinessComposition({
  symbol,
  fiscalDate,
  sourceText,
  html,
  text,
  source,
  sourceUrl = null,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  const resolvedSourceText = firstString(
    sourceText,
    html,
    text,
    source?.text,
    source?.html,
  );
  const resolvedSourceUrl = sourceUrl || source?.url || null;
  if (!normalizedFiscalDate
    || typeof resolvedSourceText !== 'string'
    || resolvedSourceText.length < 200) {
    return null;
  }
  if (normalizedSymbol === 'NOK') {
    return parseNokiaBusinessComposition({
      fiscalDate: normalizedFiscalDate,
      sourceText: resolvedSourceText,
      sourceUrl: resolvedSourceUrl,
    });
  }
  if (normalizedSymbol === 'TSM') {
    return parseTsmcBusinessComposition({
      fiscalDate: normalizedFiscalDate,
      sourceText: resolvedSourceText,
      sourceUrl: resolvedSourceUrl,
    });
  }
  return null;
}

export function convertForeignBusinessCompositionCurrency(
  composition,
  {
    rate,
    currency = 'USD',
  } = {},
) {
  const numericRate = Number(rate);
  if (!composition
    || typeof composition !== 'object'
    || !Number.isFinite(numericRate)
    || numericRate <= 0) {
    return null;
  }
  const moneyKeys = new Set([
    'revenue',
    'previousRevenue',
    'profit',
    'previousProfit',
  ]);
  const convertValue = (value, key = '') => {
    if (Array.isArray(value)) return value.map((entry) => convertValue(entry));
    if (!value || typeof value !== 'object') {
      return moneyKeys.has(key) && Number.isFinite(value)
        ? Math.round(value * numericRate)
        : value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        convertValue(entryValue, entryKey),
      ]),
    );
  };
  return {
    ...convertValue(composition),
    currency: String(currency || 'USD').trim().toUpperCase() || 'USD',
  };
}

function parseNokiaBusinessComposition({ fiscalDate, sourceText, sourceUrl }) {
  const period = exactQuarterPeriod(fiscalDate);
  const text = normalizeSourceText(sourceText);
  if (!period
    || !/\bNokia Corporation\b/i.test(text)
    || !text.includes(`Q${period.quarter}'${String(period.year).slice(-2)}`)
    || !/\bNetwork Infrastructure\b/.test(text)
    || !/\bMobile Infrastructure\b/.test(text)) {
    return null;
  }

  const segmentBlocks = new Map();
  let segmentSearchOffset = 0;
  const reportSegments = NOKIA_SEGMENTS.map((definition) => {
    const sectionStartIndex = text.indexOf(definition.sectionStart, segmentSearchOffset);
    const sectionEndIndex = sectionStartIndex < 0
      ? -1
      : text.indexOf(
          definition.sectionEnd,
          sectionStartIndex + definition.sectionStart.length,
        );
    const block = sectionStartIndex < 0
      ? ''
      : text.slice(sectionStartIndex, sectionEndIndex < 0 ? undefined : sectionEndIndex);
    segmentSearchOffset = sectionEndIndex < 0
      ? segmentSearchOffset
      : sectionEndIndex;
    segmentBlocks.set(definition.id, block);
    const revenue = parseMoneyPair(block, 'Net sales');
    const profit = parseMoneyPair(block, definition.profitLabel);
    if (!revenue || !profit) return null;
    return {
      id: definition.id,
      label: definition.label,
      labelZh: definition.labelZh,
      revenue: revenue[0],
      previousRevenue: revenue[1],
      profitMetric: 'operatingIncome',
      profit: profit[0],
      previousProfit: profit[1],
    };
  });
  if (reportSegments.some((item) => !item)) return null;

  const groupBlock = sliceBetween(
    text,
    "Net sales by region EUR million Q2'26",
    'Reconciliation of reported operating profit',
  );
  const totalRevenue = parseMoneyPair(groupBlock, 'Total');
  if (!groupBlock || !totalRevenue) return null;

  const revenueBreakdown = NOKIA_BUSINESS_UNITS.map((definition) => {
    const block = segmentBlocks.get(definition.segmentId);
    const revenue = parseMoneyPair(block, definition.rowLabel || definition.label);
    if (!revenue) return null;
    return {
      id: definition.id,
      label: definition.label,
      labelZh: definition.labelZh,
      revenue: revenue[0],
      previousRevenue: revenue[1],
      parentId: definition.segmentId,
    };
  });
  if (revenueBreakdown.some((item) => !item)) return null;

  const geographies = NOKIA_GEOGRAPHIES.map((definition) => {
    const revenue = parseMoneyPair(groupBlock, definition.label);
    if (!revenue) return null;
    return {
      ...definition,
      revenue: revenue[0],
      previousRevenue: revenue[1],
    };
  });
  if (geographies.some((item) => !item)) return null;

  const customerBlock = sliceBetween(
    groupBlock,
    "Net sales by customer type EUR million Q2'26",
    'Reconciliation of reported operating profit',
  );
  const customerTypes = NOKIA_CUSTOMER_TYPES.map((definition) => {
    const revenue = parseMoneyPair(customerBlock, definition.label);
    if (!revenue) return null;
    return {
      ...definition,
      revenue: revenue[0],
      previousRevenue: revenue[1],
    };
  });
  if (customerTypes.some((item) => !item)) return null;

  const reportRevenueSum = sumMoney(reportSegments, 'revenue');
  const previousReportRevenueSum = sumMoney(reportSegments, 'previousRevenue');
  const reconciliation = {
    id: 'eliminations-unallocated-rounding',
    label: 'Eliminations, unallocated items & rounding',
    labelZh: '抵销、未分配项目及四舍五入',
    revenue: totalRevenue[0] - reportRevenueSum,
    previousRevenue: totalRevenue[1] - previousReportRevenueSum,
  };

  if (!reconcilesWithinRounding(reportSegments, totalRevenue, reconciliation)
    || !reconcilesWithinRounding(revenueBreakdown, totalRevenue)
    || !reconcilesWithinRounding(geographies, totalRevenue)
    || !reconcilesWithinRounding(customerTypes, totalRevenue)) {
    return null;
  }

  return {
    status: 'complete',
    currency: 'EUR',
    period: {
      start: period.start,
      end: period.end,
    },
    source: {
      provider: 'SEC',
      form: '6-K',
      cik: NOKIA_CIK,
      url: safeOfficialUrl(sourceUrl, 'www.sec.gov'),
    },
    sections: {
      reportSegments: completeSection(reportSegments, { reconciliation }),
      revenueBreakdown: completeSection(revenueBreakdown),
      geographies: completeSection(geographies),
    },
    supplemental: {
      customerTypes: completeSection(customerTypes),
    },
  };
}

function parseTsmcBusinessComposition({ fiscalDate, sourceText, sourceUrl }) {
  const period = exactQuarterPeriod(fiscalDate);
  const text = normalizeSourceText(sourceText);
  const quarterLabel = period
    ? `${period.quarter}Q${String(period.year).slice(-2)}`
    : '';
  const firstReportedQuarter = text.match(/\b[1-4]Q\d{2}\b/)?.[0] || '';
  if (!period
    || !/\bTSMC\b/.test(text)
    || firstReportedQuarter !== quarterLabel
    || !/\bRevenue Analysis\b/.test(text)) {
    return null;
  }

  const revenueTotals = parseTsmcSummaryValues(
    text,
    'Net Revenue \\(US\\$ billions\\)',
  );
  const operatingMargins = parseTsmcSummaryValues(text, 'Operating Margin');
  if (!revenueTotals || !operatingMargins) return null;
  const totalRevenue = [
    Math.round(revenueTotals[0] * 1_000_000_000),
    Math.round(revenueTotals[2] * 1_000_000_000),
  ];
  const reportSegments = [{
    id: 'dedicated-ic-foundry',
    label: 'Dedicated IC Foundry',
    labelZh: '晶圆代工',
    revenue: totalRevenue[0],
    previousRevenue: totalRevenue[1],
    profitMetric: 'operatingIncome',
    profit: revenueFromPercent(totalRevenue[0], operatingMargins[0]),
    previousProfit: revenueFromPercent(totalRevenue[1], operatingMargins[2]),
  }];

  const platformBlock = sliceBetween(
    text,
    'Net Revenue by Platform',
    'Net Revenue by Geography',
  );
  const geographyBlock = sliceBetween(
    text,
    'Net Revenue by Geography',
    'Revenue Analysis:',
  );
  const technologyBlock = sliceBetween(
    text,
    'Wafer Revenue by Technology',
    'Net Revenue by Platform',
  );
  if (!platformBlock || !geographyBlock || !technologyBlock) return null;

  const revenueBreakdown = parsePercentBreakdown(
    platformBlock,
    TSMC_PLATFORMS,
    totalRevenue,
  );
  const geographies = parsePercentBreakdown(
    geographyBlock,
    TSMC_GEOGRAPHIES,
    totalRevenue,
  );
  const technologyBreakdown = parsePercentBreakdown(
    technologyBlock,
    TSMC_TECHNOLOGIES,
    totalRevenue,
  );
  if (!revenueBreakdown || !geographies || !technologyBreakdown) return null;

  return {
    status: 'complete',
    currency: 'USD',
    period: {
      start: period.start,
      end: period.end,
    },
    source: {
      provider: 'TSMC',
      form: 'Management Report',
      cik: TSMC_CIK,
      url: safeOfficialUrl(sourceUrl, 'investor.tsmc.com'),
    },
    sections: {
      reportSegments: completeSection(reportSegments),
      revenueBreakdown: completeSection(revenueBreakdown),
      geographies: completeSection(geographies),
    },
    supplemental: {
      technologyBreakdown: completeSection(technologyBreakdown),
    },
  };
}

function parsePercentBreakdown(block, definitions, totalRevenue) {
  const items = definitions.map((definition) => {
    const percentages = parsePercentTriple(block, definition.label);
    if (!percentages) return null;
    return {
      ...definition,
      revenue: revenueFromPercent(totalRevenue[0], percentages[0]),
      previousRevenue: revenueFromPercent(totalRevenue[1], percentages[2]),
      sharePercent: percentages[0],
      previousSharePercent: percentages[2],
    };
  });
  if (items.some((item) => !item)) return null;
  const currentShare = items.reduce((sum, item) => sum + item.sharePercent, 0);
  const previousShare = items.reduce((sum, item) => sum + item.previousSharePercent, 0);
  return Math.abs(currentShare - 100) <= 0.1
    && Math.abs(previousShare - 100) <= 0.1
    ? items
    : null;
}

function parseMoneyPair(block, label) {
  if (!block) return null;
  const escapedLabel = escapeRegex(label);
  const match = block.match(new RegExp(
    `(?:^|\\s)${escapedLabel}\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})(?=\\s+(?:\\(?-?\\d+(?:\\.\\d+)?\\)?%|${MONEY_TOKEN}))`,
    'i',
  ));
  if (!match) return null;
  const current = parseMillions(match[1]);
  const previous = parseMillions(match[2]);
  return Number.isFinite(current) && Number.isFinite(previous)
    ? [current, previous]
    : null;
}

function parseTsmcSummaryValues(text, labelPattern) {
  const match = text.match(new RegExp(
    `${labelPattern}\\s+(-?\\d+(?:\\.\\d+)?)%?\\s+(-?\\d+(?:\\.\\d+)?)%?\\s+(-?\\d+(?:\\.\\d+)?)%?`,
    'i',
  ));
  if (!match) return null;
  const values = match.slice(1, 4).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function parsePercentTriple(block, label) {
  const match = block.match(new RegExp(
    `(?:^|\\s)${escapeRegex(label)}\\s+(-?\\d+(?:\\.\\d+)?)%\\s+(-?\\d+(?:\\.\\d+)?)%\\s+(-?\\d+(?:\\.\\d+)?)%`,
    'i',
  ));
  if (!match) return null;
  const values = match.slice(1, 4).map(Number);
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
    ? values
    : null;
}

function parseMillions(value) {
  const normalized = String(value || '').trim();
  if (normalized === '—') return 0;
  const negative = normalized.startsWith('(') && normalized.endsWith(')');
  const number = Number(normalized.replace(/[() ]/g, ''));
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1_000_000) * (negative ? -1 : 1);
}

function revenueFromPercent(total, percentage) {
  return Math.round((total * percentage) / 100);
}

function reconcilesWithinRounding(items, totals, reconciliation = null) {
  const current = sumMoney(items, 'revenue') + (reconciliation?.revenue || 0);
  const previous = sumMoney(items, 'previousRevenue')
    + (reconciliation?.previousRevenue || 0);
  const currentTolerance = Math.max(10_000_000, Math.abs(totals[0]) * 0.002);
  const previousTolerance = Math.max(10_000_000, Math.abs(totals[1]) * 0.002);
  return Math.abs(current - totals[0]) <= currentTolerance
    && Math.abs(previous - totals[1]) <= previousTolerance;
}

function sumMoney(items, key) {
  return items.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0);
}

function completeSection(items, extra = {}) {
  return {
    status: 'complete',
    reason: null,
    items,
    ...extra,
  };
}

function normalizeSourceText(value) {
  const source = /<[^>]+>/.test(value) ? htmlToText(value) : value;
  return String(source || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function sliceBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return '';
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

function exactQuarterPeriod(value) {
  const end = parseDate(value);
  if (!end) return null;
  const month = end.getUTCMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  const expectedEnd = new Date(Date.UTC(
    end.getUTCFullYear(),
    quarterEndMonth + 1,
    0,
  ));
  if (expectedEnd.getTime() !== end.getTime()) return null;
  const start = new Date(Date.UTC(
    end.getUTCFullYear(),
    quarterEndMonth - 2,
    1,
  ));
  return {
    year: end.getUTCFullYear(),
    quarter: Math.floor(month / 3) + 1,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function safeOfficialUrl(value, expectedHostname) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === expectedHostname
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function dateDistanceDays(left, right) {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);
  if (!leftDate || !rightDate) return Number.POSITIVE_INFINITY;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000);
}

function parseDate(value) {
  const normalized = dateKey(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== normalized
    ? null
    : date;
}

function dateKey(value) {
  return String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/)?.[1] || '';
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function normalizeCik(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(10, '0') : '';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0) || '';
}
