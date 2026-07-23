import { htmlToText } from './secOfficialParsers.js';

const SECTION_KEYS = [
  'reportSegments',
  'revenueBreakdown',
  'geographies',
];

const ALPHABET_CIK = '0001652044';
const TESLA_CIK = '0001318605';

const ALPHABET_SEGMENTS = [
  {
    id: 'google-services',
    label: 'Google Services',
    labelZh: '谷歌服务',
    member: 'goog:GoogleServicesMember',
  },
  {
    id: 'google-cloud',
    label: 'Google Cloud',
    labelZh: '谷歌云',
    member: 'goog:GoogleCloudMember',
  },
  {
    id: 'other-bets',
    label: 'Other Bets',
    labelZh: '其他业务',
    member: 'us-gaap:AllOtherSegmentsMember',
  },
];

const ALPHABET_REVENUE_BREAKDOWN = [
  {
    id: 'google-search-other',
    label: 'Google Search & other',
    labelZh: '搜索及其他',
    member: 'goog:GoogleSearchOtherMember',
    parentId: 'google-services',
  },
  {
    id: 'google-cloud',
    label: 'Google Cloud',
    labelZh: '谷歌云',
    segmentMember: 'goog:GoogleCloudMember',
    parentId: 'google-cloud',
  },
  {
    id: 'subscriptions-platforms-devices',
    label: 'Subscriptions, platforms & devices',
    labelZh: '订阅、平台和设备',
    member: 'goog:SubscriptionsPlatformsAndDevicesRevenueMember',
    parentId: 'google-services',
  },
  {
    id: 'youtube-ads',
    label: 'YouTube ads',
    labelZh: 'YouTube 广告',
    member: 'goog:YouTubeAdvertisingRevenueMember',
    parentId: 'google-services',
  },
  {
    id: 'google-network',
    label: 'Google Network',
    labelZh: '谷歌网络',
    member: 'goog:GoogleNetworkMember',
    parentId: 'google-services',
  },
  {
    id: 'other-bets',
    label: 'Other Bets',
    labelZh: '其他业务',
    segmentMember: 'us-gaap:AllOtherSegmentsMember',
    parentId: 'other-bets',
  },
];

const ALPHABET_GEOGRAPHIES = [
  {
    id: 'united-states',
    label: 'United States',
    labelZh: '美国',
    member: 'country:US',
  },
  {
    id: 'emea',
    label: 'EMEA',
    labelZh: '欧洲、中东和非洲',
    member: 'us-gaap:EMEAMember',
  },
  {
    id: 'apac',
    label: 'APAC',
    labelZh: '亚太地区',
    member: 'srt:AsiaPacificMember',
  },
  {
    id: 'americas-ex-us',
    label: 'Americas excluding United States',
    labelZh: '其他美洲',
    member: 'goog:AmericasExcludingUnitedStatesMember',
  },
];

const TESLA_SEGMENTS = [
  {
    id: 'automotive',
    label: 'Automotive & services and other',
    labelZh: '汽车（含服务及其他）',
    member: 'tsla:AutomotiveSegmentMember',
  },
  {
    id: 'energy-generation-storage',
    label: 'Energy generation and storage',
    labelZh: '能源生产与储存',
    member: 'tsla:EnergyGenerationAndStorageSegmentMember',
  },
];

const TESLA_REVENUE_BREAKDOWN = [
  {
    id: 'automotive-sales',
    label: 'Automotive sales',
    labelZh: '汽车销售',
    member: 'tsla:AutomotiveSalesMember',
    parentId: 'automotive',
  },
  {
    id: 'services-other',
    label: 'Services and other',
    labelZh: '服务及其他',
    member: 'tsla:ServicesAndOtherMember',
    parentId: 'automotive',
  },
  {
    id: 'energy-sales',
    label: 'Energy generation and storage sales',
    labelZh: '能源产品销售',
    member: 'tsla:EnergyGenerationAndStorageSalesMember',
    parentId: 'energy-generation-storage',
  },
  {
    id: 'automotive-leasing',
    label: 'Automotive leasing',
    labelZh: '汽车租赁',
    member: 'tsla:AutomotiveLeasingMember',
    parentId: 'automotive',
  },
  {
    id: 'automotive-regulatory-credits',
    label: 'Automotive regulatory credits',
    labelZh: '监管积分',
    member: 'tsla:AutomotiveRegulatoryCreditsMember',
    parentId: 'automotive',
  },
  {
    id: 'energy-leasing',
    label: 'Energy generation and storage leasing',
    labelZh: '能源租赁',
    member: 'tsla:EnergyGenerationAndStorageLeasingMember',
    parentId: 'energy-generation-storage',
  },
];

const TESLA_GEOGRAPHIES = [
  {
    id: 'united-states',
    label: 'United States',
    labelZh: '美国',
    member: 'country:US',
  },
  {
    id: 'other-international',
    label: 'Other international',
    labelZh: '其他国际市场',
    member: 'us-gaap:NonUsMember',
  },
  {
    id: 'china',
    label: 'China',
    labelZh: '中国',
    member: 'country:CN',
  },
];

export function parseSecEarningsDetailPrimaryDocument({
  symbol,
  fiscalDate,
  html,
  filing = {},
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  const expectedCik = normalizedSymbol === 'TSLA' ? TESLA_CIK : ALPHABET_CIK;
  if (!['GOOG', 'GOOGL', 'TSLA'].includes(normalizedSymbol)
    || !normalizedFiscalDate
    || typeof html !== 'string'
    || html.length < 100) {
    return null;
  }

  const document = parseInlineXbrlDocument(html);
  if (document.malformed || !documentIdentityMatches(document, {
    fiscalDate: normalizedFiscalDate,
    cik: filing.cik || expectedCik,
  })) {
    return null;
  }

  const period = exactQuarterPeriod(normalizedFiscalDate);
  if (!period) return null;
  const previousPeriod = previousYearPeriod(period);

  const parser = normalizedSymbol === 'TSLA'
    ? parseTeslaSections
    : parseAlphabetSections;
  const sections = parser(document, period, previousPeriod);
  const statuses = SECTION_KEYS.map((key) => sections[key].status);
  const completeCount = statuses.filter((status) => status === 'complete').length;

  return {
    status: completeCount === SECTION_KEYS.length
      ? 'complete'
      : completeCount > 0
        ? 'partial'
        : 'unavailable',
    currency: 'USD',
    period: {
      start: period.start,
      end: period.end,
    },
    sections,
  };
}

function parseAlphabetSections(document, period, previousPeriod) {
  const revenueTotals = alphabetRevenueTotals(document, period, previousPeriod);
  return {
    reportSegments: parseAlphabetSegments(document, period, previousPeriod, revenueTotals),
    revenueBreakdown: parseAlphabetRevenueBreakdown(
      document,
      period,
      previousPeriod,
      revenueTotals,
    ),
    geographies: parseGeographies({
      document,
      period,
      previousPeriod,
      definitions: ALPHABET_GEOGRAPHIES,
      concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      totals: revenueTotals,
      reconciliation: alphabetHedgingReconciliation(document, period, previousPeriod),
    }),
  };
}

function parseAlphabetSegments(document, period, previousPeriod, totals) {
  const items = ALPHABET_SEGMENTS.map((definition) => {
    const revenueMembers = {
      'us-gaap:StatementBusinessSegmentsAxis': definition.member,
    };
    const profitMembers = {
      'srt:ConsolidationItemsAxis': 'us-gaap:OperatingSegmentsMember',
      'us-gaap:StatementBusinessSegmentsAxis': definition.member,
    };
    return {
      id: definition.id,
      label: definition.label,
      labelZh: definition.labelZh,
      revenue: selectUniqueFact(document, {
        concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
        period,
        members: revenueMembers,
      }),
      previousRevenue: selectUniqueFact(document, {
        concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
        period: previousPeriod,
        members: revenueMembers,
      }),
      profitMetric: 'operatingIncome',
      profit: selectUniqueFact(document, {
        concept: 'us-gaap:OperatingIncomeLoss',
        period,
        members: profitMembers,
      }),
      previousProfit: selectUniqueFact(document, {
        concept: 'us-gaap:OperatingIncomeLoss',
        period: previousPeriod,
        members: profitMembers,
      }),
    };
  });
  const reconciliation = {
    id: 'hedging',
    label: 'Hedging gains (losses)',
    labelZh: '对冲收益（损失）',
    revenue: selectUniqueFact(document, {
      concept: 'us-gaap:RevenueNotFromContractWithCustomer',
      period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: 'us-gaap:RevenueNotFromContractWithCustomer',
      period: previousPeriod,
      members: {},
    }),
  };

  if (!items.every(segmentItemComplete)
    || !finite(reconciliation.revenue)
    || !finite(reconciliation.previousRevenue)
    || !reconcilesRevenue(items, reconciliation, totals)) {
    return unavailableSection();
  }
  return completeSection(items, { reconciliation });
}

function parseAlphabetRevenueBreakdown(document, period, previousPeriod, totals) {
  const items = ALPHABET_REVENUE_BREAKDOWN.map((definition) => {
    const members = definition.segmentMember
      ? { 'us-gaap:StatementBusinessSegmentsAxis': definition.segmentMember }
      : {
          'srt:ProductOrServiceAxis': definition.member,
          'us-gaap:StatementBusinessSegmentsAxis': 'goog:GoogleServicesMember',
        };
    return revenueItem({
      document,
      period,
      previousPeriod,
      definition,
      concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      members,
    });
  });
  const reconciliation = alphabetHedgingReconciliation(document, period, previousPeriod);
  return items.every(revenueItemComplete)
    && reconcilesRevenue(items, reconciliation, totals)
    ? completeSection(items)
    : unavailableSection();
}

function parseTeslaSections(document, period, previousPeriod) {
  const revenueTotals = teslaRevenueTotals(document, period, previousPeriod);
  return {
    reportSegments: parseTeslaSegments(document, period, previousPeriod, revenueTotals),
    revenueBreakdown: parseTeslaRevenueBreakdown(
      document,
      period,
      previousPeriod,
      revenueTotals,
    ),
    geographies: parseGeographies({
      document,
      period,
      previousPeriod,
      definitions: TESLA_GEOGRAPHIES,
      concept: 'us-gaap:Revenues',
      totals: revenueTotals,
    }),
  };
}

function parseTeslaSegments(document, period, previousPeriod, totals) {
  const items = TESLA_SEGMENTS.map((definition) => {
    const members = {
      'us-gaap:StatementBusinessSegmentsAxis': definition.member,
    };
    return {
      id: definition.id,
      label: definition.label,
      labelZh: definition.labelZh,
      revenue: selectUniqueFact(document, {
        concept: 'us-gaap:Revenues',
        period,
        members,
      }),
      previousRevenue: selectUniqueFact(document, {
        concept: 'us-gaap:Revenues',
        period: previousPeriod,
        members,
      }),
      profitMetric: 'grossProfit',
      profit: selectUniqueFact(document, {
        concept: 'us-gaap:GrossProfit',
        period,
        members,
      }),
      previousProfit: selectUniqueFact(document, {
        concept: 'us-gaap:GrossProfit',
        period: previousPeriod,
        members,
      }),
    };
  });
  return items.every(segmentItemComplete) && reconcilesRevenue(items, null, totals)
    ? completeSection(items)
    : unavailableSection();
}

function parseTeslaRevenueBreakdown(document, period, previousPeriod, totals) {
  const items = TESLA_REVENUE_BREAKDOWN.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    definition,
    concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
    members: {
      'srt:ProductOrServiceAxis': definition.member,
    },
  }));
  return items.every(revenueItemComplete) && reconcilesRevenue(items, null, totals)
    ? completeSection(items)
    : unavailableSection();
}

function parseGeographies({
  document,
  period,
  previousPeriod,
  definitions,
  concept,
  totals,
  reconciliation = null,
}) {
  const items = definitions.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    definition,
    concept,
    members: {
      'srt:StatementGeographicalAxis': definition.member,
    },
  }));
  return items.every(revenueItemComplete) && reconcilesRevenue(items, reconciliation, totals)
    ? completeSection(items)
    : unavailableSection();
}

function alphabetRevenueTotals(document, period, previousPeriod) {
  return {
    revenue: selectUniqueFact(document, {
      concept: 'us-gaap:Revenues',
      period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: 'us-gaap:Revenues',
      period: previousPeriod,
      members: {},
    }),
  };
}

function teslaRevenueTotals(document, period, previousPeriod) {
  return {
    revenue: selectUniqueFact(document, {
      concept: 'us-gaap:Revenues',
      period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: 'us-gaap:Revenues',
      period: previousPeriod,
      members: {},
    }),
  };
}

function alphabetHedgingReconciliation(document, period, previousPeriod) {
  return {
    revenue: selectUniqueFact(document, {
      concept: 'us-gaap:RevenueNotFromContractWithCustomer',
      period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: 'us-gaap:RevenueNotFromContractWithCustomer',
      period: previousPeriod,
      members: {},
    }),
  };
}

function reconcilesRevenue(items, reconciliation, totals) {
  if (!finite(totals?.revenue) || !finite(totals?.previousRevenue)) return false;
  const current = items.reduce((sum, item) => sum + item.revenue, 0)
    + (reconciliation?.revenue || 0);
  const previous = items.reduce((sum, item) => sum + item.previousRevenue, 0)
    + (reconciliation?.previousRevenue || 0);
  return current === totals.revenue && previous === totals.previousRevenue;
}

function revenueItem({
  document,
  period,
  previousPeriod,
  definition,
  concept,
  members,
}) {
  return {
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: selectUniqueFact(document, { concept, period, members }),
    previousRevenue: selectUniqueFact(document, {
      concept,
      period: previousPeriod,
      members,
    }),
    ...(definition.parentId ? { parentId: definition.parentId } : {}),
  };
}

function selectUniqueFact(document, {
  concept,
  period,
  members,
}) {
  const values = new Set();
  for (const fact of document.numericFacts) {
    if (fact.concept !== concept || !finite(fact.value)) continue;
    const context = document.contexts.get(fact.contextRef);
    if (!context
      || context.start !== period.start
      || context.end !== period.end
      || !membersEqual(context.members, members)) {
      continue;
    }
    values.add(fact.value);
  }
  return values.size === 1 ? values.values().next().value : null;
}

function parseInlineXbrlDocument(html) {
  const contexts = new Map();
  const contextIds = new Set();
  let malformed = false;
  for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)) {
    const attributes = parseAttributes(match[1]);
    const id = attributes.id;
    if (!id) continue;
    if (contextIds.has(id)) {
      malformed = true;
      continue;
    }
    contextIds.add(id);
    const body = match[2];
    const start = elementText(body, 'xbrli:startDate');
    const end = elementText(body, 'xbrli:endDate') || elementText(body, 'xbrli:instant');
    const members = {};
    let ambiguous = false;
    for (const memberMatch of body.matchAll(/<xbrldi:explicitMember\b([^>]*)>([\s\S]*?)<\/xbrldi:explicitMember>/gi)) {
      const memberAttributes = parseAttributes(memberMatch[1]);
      const dimension = memberAttributes.dimension;
      const member = htmlToText(memberMatch[2]);
      if (!dimension || !member || Object.hasOwn(members, dimension)) {
        ambiguous = true;
        break;
      }
      members[dimension] = member;
    }
    if (!ambiguous && end) contexts.set(id, { start, end, members });
  }

  const numericFacts = [];
  for (const match of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.name || !attributes.contextref || attributes['xsi:nil'] === 'true') continue;
    const value = parseInlineNumber(match[2], attributes);
    if (!finite(value)) continue;
    numericFacts.push({
      concept: attributes.name,
      contextRef: attributes.contextref,
      value,
    });
  }

  const nonNumericFacts = [];
  for (const match of html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.name) continue;
    nonNumericFacts.push({
      concept: attributes.name,
      value: htmlToText(match[2]),
    });
  }
  return {
    contexts,
    numericFacts,
    nonNumericFacts,
    malformed,
  };
}

function documentIdentityMatches(document, { fiscalDate, cik }) {
  return uniqueTextFact(document, 'dei:DocumentType') === '10-Q'
    && normalizeDocumentDate(uniqueTextFact(document, 'dei:DocumentPeriodEndDate')) === fiscalDate
    && normalizeCik(uniqueTextFact(document, 'dei:EntityCentralIndexKey')) === normalizeCik(cik);
}

function uniqueTextFact(document, concept) {
  const values = new Set(
    document.nonNumericFacts
      .filter((fact) => fact.concept === concept && fact.value)
      .map((fact) => fact.value),
  );
  return values.size === 1 ? values.values().next().value : '';
}

function parseInlineNumber(innerHtml, attributes) {
  const rawText = htmlToText(innerHtml)
    .replace(/[$,\s]/g, '')
    .replace(/−/g, '-');
  if (!rawText || rawText === '—' || rawText === '-') return null;
  const parenthesized = rawText.startsWith('(') && rawText.endsWith(')');
  const rawNumber = Number(rawText.replace(/[()]/g, ''));
  const scale = Number(attributes.scale || 0);
  if (!Number.isFinite(rawNumber) || !Number.isInteger(scale) || Math.abs(scale) > 20) return null;
  let value = rawNumber * (10 ** scale);
  if (attributes.sign === '-' || parenthesized) value *= -1;
  return Number.isSafeInteger(value) ? value : null;
}

function parseAttributes(source) {
  const output = {};
  for (const match of String(source || '').matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    output[match[1].toLowerCase()] = match[2];
  }
  return output;
}

function elementText(source, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(source || '').match(new RegExp(`<${escaped}\\b[^>]*>([^<]+)</${escaped}>`, 'i'));
  return match ? htmlToText(match[1]) : '';
}

function membersEqual(actual = {}, expected = {}) {
  const actualEntries = Object.entries(actual).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  if (actualEntries.length !== expectedEntries.length) return false;
  return expectedEntries.every(([dimension, member], index) => (
    actualEntries[index][0] === dimension
    && actualEntries[index][1] === member
  ));
}

function completeSection(items, extra = {}) {
  return {
    status: 'complete',
    reason: null,
    items,
    ...extra,
  };
}

function unavailableSection(reason = 'ambiguous-or-missing-xbrl-facts') {
  return {
    status: 'unavailable',
    reason,
    items: [],
  };
}

function segmentItemComplete(item) {
  return revenueItemComplete(item)
    && finite(item.profit)
    && finite(item.previousProfit);
}

function revenueItemComplete(item) {
  return finite(item.revenue) && finite(item.previousRevenue);
}

function exactQuarterPeriod(fiscalDate) {
  const end = parseDate(fiscalDate);
  if (!end) return null;
  const month = end.getUTCMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  const quarterEnd = new Date(Date.UTC(
    end.getUTCFullYear(),
    quarterEndMonth + 1,
    0,
  ));
  if (end.getTime() !== quarterEnd.getTime()) return null;
  const start = new Date(Date.UTC(
    end.getUTCFullYear(),
    quarterEndMonth - 2,
    1,
  ));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function previousYearPeriod(period) {
  return {
    start: previousYearDate(period.start),
    end: previousYearDate(period.end),
  };
}

function previousYearDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
  return date;
}

function normalizeCik(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(10, '0') : '';
}

function normalizeDocumentDate(value) {
  const strict = dateKey(value);
  if (strict) return strict;
  const match = String(value || '').trim().match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i,
  );
  if (!match) return '';
  const month = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ].indexOf(match[1].toLowerCase());
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function dateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  return match?.[1] || '';
}

function finite(value) {
  return Number.isFinite(value);
}
