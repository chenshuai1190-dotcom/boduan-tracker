import { htmlToText } from './secOfficialParsers.js';

const SECTION_KEYS = [
  'reportSegments',
  'revenueBreakdown',
  'geographies',
];

const ADVANCED_MICRO_DEVICES_CIK = '0000002488';
const COSTCO_CIK = '0000909832';
const META_CIK = '0001326801';
const MICROSOFT_CIK = '0000789019';
const INTERACTIVE_BROKERS_CIK = '0001381197';
const UNITEDHEALTH_CIK = '0000731766';
const UNITEDHEALTH_Q2_2026_ACCESSION = '0000731766-26-000191';

const REVENUE_CONCEPT = 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax';
const REVENUES_CONCEPT = 'us-gaap:Revenues';
const NET_REVENUE_CONCEPT = 'us-gaap:RevenuesNetOfInterestExpense';
const OPERATING_INCOME_CONCEPT = 'us-gaap:OperatingIncomeLoss';
const BUSINESS_SEGMENTS_AXIS = 'us-gaap:StatementBusinessSegmentsAxis';
const PRODUCT_OR_SERVICE_AXIS = 'srt:ProductOrServiceAxis';
const GEOGRAPHICAL_AXIS = 'srt:StatementGeographicalAxis';
const CONSOLIDATION_ITEMS_AXIS = 'srt:ConsolidationItemsAxis';
const OPERATING_SEGMENTS_MEMBER = 'us-gaap:OperatingSegmentsMember';
const INTERSEGMENT_ELIMINATION_MEMBER = 'us-gaap:IntersegmentEliminationMember';
const CORPORATE_NON_SEGMENT_MEMBER = 'us-gaap:CorporateNonSegmentMember';

// AMD's Q2 2026 Form 10-Q (0000002488-26-000123) reports three accounting
// segments. Client and Gaming is one reportable segment, while its two
// disjoint product rows are separately tagged under ProductOrServiceAxis.
const AMD_SEGMENTS = [
  {
    id: 'data-center',
    label: 'Data Center',
    labelZh: '数据中心',
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: 'amd:DataCenterMember',
    },
  },
  {
    id: 'client-and-gaming',
    label: 'Client and Gaming',
    labelZh: '客户端与游戏',
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: 'amd:ClientAndGamingMember',
    },
  },
  {
    id: 'embedded',
    label: 'Embedded',
    labelZh: '嵌入式',
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: 'amd:EmbeddedMember',
    },
  },
];

const AMD_REVENUE_BREAKDOWN = [
  {
    id: 'data-center',
    label: 'Data Center',
    labelZh: '数据中心',
    parentId: 'data-center',
    members: AMD_SEGMENTS[0].members,
  },
  {
    id: 'client',
    label: 'Client',
    labelZh: '客户端',
    parentId: 'client-and-gaming',
    members: {
      [PRODUCT_OR_SERVICE_AXIS]: 'amd:ClientMember',
      [BUSINESS_SEGMENTS_AXIS]: 'amd:ClientAndGamingMember',
    },
  },
  {
    id: 'gaming',
    label: 'Gaming',
    labelZh: '游戏',
    parentId: 'client-and-gaming',
    members: {
      [PRODUCT_OR_SERVICE_AXIS]: 'amd:GamingMember',
      [BUSINESS_SEGMENTS_AXIS]: 'amd:ClientAndGamingMember',
    },
  },
  {
    id: 'embedded',
    label: 'Embedded',
    labelZh: '嵌入式',
    parentId: 'embedded',
    members: AMD_SEGMENTS[2].members,
  },
];

// Costco's Q3 2026 reportable segments are its three disclosed geographic
// operating groups. The same official rows therefore support both the segment
// and geography sections without inferring country-level revenue.
const COSTCO_SEGMENTS = [
  {
    id: 'united-states',
    label: 'United States',
    labelZh: '美国',
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: 'cost:UnitedStatesMember',
    },
  },
  {
    id: 'canada',
    label: 'Canada',
    labelZh: '加拿大',
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: 'cost:CanadaMember',
    },
  },
  {
    id: 'other-international',
    label: 'Other International',
    labelZh: '其他国际市场',
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: 'cost:OtherInternationalMember',
    },
  },
];

const COSTCO_REVENUE_BREAKDOWN = [
  {
    id: 'foods-sundries',
    label: 'Foods and Sundries',
    labelZh: '食品与杂货',
    members: { [PRODUCT_OR_SERVICE_AXIS]: 'cost:FoodsAndSundriesMember' },
  },
  {
    id: 'non-foods',
    label: 'Non-Foods',
    labelZh: '非食品',
    members: { [PRODUCT_OR_SERVICE_AXIS]: 'cost:NonFoodsMember' },
  },
  {
    id: 'fresh-foods',
    label: 'Fresh Foods',
    labelZh: '生鲜食品',
    members: { [PRODUCT_OR_SERVICE_AXIS]: 'cost:FreshFoodsMember' },
  },
  {
    id: 'warehouse-ancillary-other',
    label: 'Warehouse Ancillary and Other Businesses',
    labelZh: '仓储配套及其他业务',
    members: { [PRODUCT_OR_SERVICE_AXIS]: 'cost:OtherMember' },
  },
  {
    id: 'membership-fees',
    label: 'Membership fees',
    labelZh: '会员费',
    members: { [PRODUCT_OR_SERVICE_AXIS]: 'us-gaap:MembershipMember' },
  },
];

const UNITEDHEALTH_SEGMENTS = [
  {
    id: 'unitedhealthcare',
    label: 'UnitedHealthcare',
    labelZh: '联合医疗保险',
    member: 'unh:UnitedhealthcareMember',
  },
  {
    id: 'optum-health',
    label: 'Optum Health',
    labelZh: 'Optum 健康',
    member: 'unh:OptumHealthMember',
  },
  {
    id: 'optum-insight',
    label: 'Optum Insight',
    labelZh: 'Optum 洞察',
    member: 'unh:OptumInsightMember',
  },
  {
    id: 'optum-rx',
    label: 'Optum Rx',
    labelZh: 'Optum Rx',
    member: 'unh:OptumRxMember',
  },
];

// Member names and disjoint subtotal definitions below were verified against
// the official 2026 Q1 filings:
// META 0001628280-26-028526 and MSFT 0001193125-26-191507.
const META_SEGMENTS = [
  {
    id: 'family-of-apps',
    label: 'Family of Apps',
    labelZh: '应用家族',
    member: 'meta:FamilyOfAppsMember',
  },
  {
    id: 'reality-labs',
    label: 'Reality Labs',
    labelZh: '现实实验室',
    member: 'meta:RealityLabsMember',
  },
];

const META_REVENUE_BREAKDOWN = [
  {
    id: 'advertising',
    label: 'Advertising',
    labelZh: '广告',
    parentId: 'family-of-apps',
    members: {
      [PRODUCT_OR_SERVICE_AXIS]: 'us-gaap:AdvertisingMember',
      [BUSINESS_SEGMENTS_AXIS]: 'meta:FamilyOfAppsMember',
    },
  },
  {
    id: 'other-family-of-apps',
    label: 'Other Family of Apps revenue',
    labelZh: '应用家族其他收入',
    parentId: 'family-of-apps',
    members: {
      [PRODUCT_OR_SERVICE_AXIS]: 'us-gaap:ServiceOtherMember',
      [BUSINESS_SEGMENTS_AXIS]: 'meta:FamilyOfAppsMember',
    },
  },
  {
    id: 'reality-labs',
    label: 'Reality Labs',
    labelZh: '现实实验室',
    parentId: 'reality-labs',
    members: {
      [BUSINESS_SEGMENTS_AXIS]: 'meta:RealityLabsMember',
    },
  },
];

const META_GEOGRAPHIES = [
  {
    id: 'us-canada',
    label: 'United States & Canada',
    labelZh: '美国和加拿大',
    member: 'meta:USCanadaMember',
  },
  {
    id: 'europe',
    label: 'Europe',
    labelZh: '欧洲',
    member: 'srt:EuropeMember',
  },
  {
    id: 'asia-pacific',
    label: 'Asia-Pacific',
    labelZh: '亚太地区',
    member: 'srt:AsiaPacificMember',
  },
  {
    id: 'rest-of-world',
    label: 'Rest of World',
    labelZh: '世界其他地区',
    member: 'meta:RestOfWorldMember',
  },
];

const MICROSOFT_SEGMENTS = [
  {
    id: 'productivity-business-processes',
    label: 'Productivity and Business Processes',
    labelZh: '生产力和业务流程',
    member: 'msft:ProductivityAndBusinessProcessesMember',
  },
  {
    id: 'intelligent-cloud',
    label: 'Intelligent Cloud',
    labelZh: '智能云',
    member: 'msft:IntelligentCloudMember',
  },
  {
    id: 'more-personal-computing',
    label: 'More Personal Computing',
    labelZh: '更多个人计算',
    member: 'msft:MorePersonalComputingMember',
  },
];

const MICROSOFT_REVENUE_BREAKDOWN = [
  {
    id: 'server-cloud',
    label: 'Server products and cloud services',
    labelZh: '服务器产品和云服务',
    member: 'msft:ServerProductsAndCloudServicesMember',
    parentId: 'intelligent-cloud',
  },
  {
    id: 'microsoft-365-commercial',
    label: 'Microsoft 365 Commercial products and cloud services',
    labelZh: 'Microsoft 365 商业产品和云服务',
    member: 'msft:MicrosoftThreeSixFiveCommercialProductsAndCloudServicesMember',
    parentId: 'productivity-business-processes',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    labelZh: '游戏',
    member: 'msft:GamingMember',
    parentId: 'more-personal-computing',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    labelZh: '领英',
    member: 'msft:LinkedInCorporationMember',
    parentId: 'productivity-business-processes',
  },
  {
    id: 'windows-devices',
    label: 'Windows and Devices',
    labelZh: 'Windows 和设备',
    member: 'msft:WindowsAndDevicesMember',
    parentId: 'more-personal-computing',
  },
  {
    id: 'search-advertising',
    label: 'Search and news advertising',
    labelZh: '搜索和新闻广告',
    member: 'msft:SearchAdvertisingMember',
    parentId: 'more-personal-computing',
  },
  {
    id: 'microsoft-365-consumer',
    label: 'Microsoft 365 Consumer products and cloud services',
    labelZh: 'Microsoft 365 消费者产品和云服务',
    member: 'msft:MicrosoftThreeSixFiveConsumerProductsAndCloudServicesMember',
    parentId: 'productivity-business-processes',
  },
  {
    id: 'dynamics',
    label: 'Dynamics products and cloud services',
    labelZh: 'Dynamics 产品和云服务',
    member: 'msft:DynamicsProductsAndCloudServicesMember',
    parentId: 'productivity-business-processes',
  },
  {
    id: 'enterprise-partner-services',
    label: 'Enterprise and Partner Services',
    labelZh: '企业和合作伙伴服务',
    member: 'msft:EnterpriseAndPartnerServicesMember',
    parentId: 'intelligent-cloud',
  },
  {
    id: 'other-products-services',
    label: 'Other products and services',
    labelZh: '其他产品和服务',
    member: 'msft:OtherProductsAndServicesMember',
  },
];

const INTERACTIVE_BROKERS_REVENUE_BREAKDOWN = [
  {
    id: 'commissions',
    label: 'Commissions',
    labelZh: '佣金',
    concept: 'us-gaap:BrokerageCommissionsRevenue',
  },
  {
    id: 'net-interest-income',
    label: 'Net interest income',
    labelZh: '净利息收入',
    concept: 'us-gaap:InterestIncomeExpenseNet',
  },
  {
    id: 'other-fees-services',
    label: 'Other fees and services',
    labelZh: '其他费用和服务',
    concept: 'ibkr:OtherFeesAndServices',
  },
  {
    id: 'other-income',
    label: 'Other income',
    labelZh: '其他收入',
    concept: 'ibkr:OtherIncomeLoss',
  },
];

const INLINE_ADAPTERS = new Map([
  ['AMD', {
    id: 'advanced-micro-devices-inline-xbrl',
    cik: ADVANCED_MICRO_DEVICES_CIK,
    forms: ['10-Q'],
    fiscalDateToleranceDays: 7,
    parseSections: parseAdvancedMicroDevicesSections,
  }],
  ['COST', {
    id: 'costco-inline-xbrl',
    cik: COSTCO_CIK,
    forms: ['10-Q'],
    fiscalDates: ['2026-05-10'],
    fiscalYear: '2026',
    fiscalPeriod: 'Q3',
    parseSections: parseCostcoSections,
  }],
  ['META', {
    id: 'meta-inline-xbrl',
    cik: META_CIK,
    forms: ['10-Q'],
    parseSections: parseMetaSections,
  }],
  ['MSFT', {
    id: 'microsoft-inline-xbrl',
    cik: MICROSOFT_CIK,
    forms: ['10-Q'],
    parseSections: parseMicrosoftSections,
  }],
  ['UNH', {
    id: 'unitedhealth-inline-xbrl',
    cik: UNITEDHEALTH_CIK,
    forms: ['10-Q'],
    fiscalDates: ['2026-03-31'],
    fiscalYear: '2026',
    fiscalPeriod: 'Q1',
    totalConcept: REVENUES_CONCEPT,
    parseSections: parseUnitedHealthSections,
  }],
]);

export function hasSecUsHoldingBusinessAdapter(symbol) {
  const normalized = normalizeSymbol(symbol);
  return INLINE_ADAPTERS.has(normalized) || normalized === 'IBKR';
}

export function parseSecUsHoldingBusinessDocument({
  symbol,
  fiscalDate,
  html,
  filing = {},
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  if (!normalizedFiscalDate || typeof html !== 'string' || html.length < 100) return null;

  if (normalizedSymbol === 'IBKR') {
    if (String(filing.form || '').trim().toUpperCase() === '10-Q'
      || (!filing.form && /<ix:nonFraction\b/i.test(html))) {
      return parseInteractiveBrokersTenQ({
        fiscalDate: normalizedFiscalDate,
        html,
        filing,
      });
    }
    return parseInteractiveBrokersEarningsRelease({
      fiscalDate: normalizedFiscalDate,
      html,
      filing,
    });
  }

  if (normalizedSymbol === 'MSFT') {
    const filingForm = String(filing.form || '').trim().toUpperCase();
    if (filingForm === '8-K'
      || filingForm === 'EX-99.1'
      || (!filingForm && !/<ix:nonFraction\b/i.test(html))) {
      return parseMicrosoftEarningsRelease({
        fiscalDate: normalizedFiscalDate,
        html,
        filing,
      });
    }
  }

  if (normalizedSymbol === 'UNH') {
    const filingForm = normalizeForm(filing.form);
    if (filingForm === '8-K' || filingForm === 'EX-99.1') {
      return parseUnitedHealthEarningsRelease({
        fiscalDate: normalizedFiscalDate,
        html,
        filing,
      });
    }
  }

  const adapter = INLINE_ADAPTERS.get(normalizedSymbol);
  if (!adapter) return null;
  if (filing.cik && normalizeCik(filing.cik) !== adapter.cik) return null;
  const filingForm = String(filing.form || '').trim().toUpperCase();
  if (filingForm && !adapter.forms.includes(filingForm)) return null;

  const document = parseInlineXbrlDocument(html);
  const documentFiscalDate = normalizeDocumentDate(
    uniqueTextFact(document, 'dei:DocumentPeriodEndDate'),
  );
  if (adapter.fiscalDates && !adapter.fiscalDates.includes(documentFiscalDate)) return null;
  if (document.malformed || !inlineDocumentIdentityMatches(document, {
    cik: adapter.cik,
    fiscalDate: normalizedFiscalDate,
    forms: adapter.forms,
    fiscalDateToleranceDays: adapter.fiscalDateToleranceDays,
  })) {
    return null;
  }

  const periods = resolveReportedQuarterPeriods(
    document,
    documentFiscalDate,
    adapter.totalConcept || REVENUE_CONCEPT,
  );
  if (!periods) return null;
  const sections = adapter.parseSections(
    document,
    periods.period,
    periods.previousPeriod,
  );

  return parsedResult({
    adapterId: adapter.id,
    cik: adapter.cik,
    filing,
    period: {
      ...periods.period,
      ...(adapter.fiscalYear ? { fiscalYear: adapter.fiscalYear } : {}),
      ...(adapter.fiscalPeriod ? { fiscalPeriod: adapter.fiscalPeriod } : {}),
    },
    sections,
    evidence: 'official-primary-inline-xbrl',
  });
}

function parseInteractiveBrokersTenQ({ fiscalDate, html, filing }) {
  if (filing.cik && normalizeCik(filing.cik) !== INTERACTIVE_BROKERS_CIK) return null;
  const document = parseInlineXbrlDocument(html);
  if (document.malformed || !inlineDocumentIdentityMatches(document, {
    cik: INTERACTIVE_BROKERS_CIK,
    fiscalDate,
  })) {
    return null;
  }
  const periods = resolveReportedQuarterPeriods(document, fiscalDate, NET_REVENUE_CONCEPT);
  if (!periods) return null;

  const items = INTERACTIVE_BROKERS_REVENUE_BREAKDOWN.map((definition) => ({
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: selectUniqueFact(document, {
      concept: definition.concept,
      period: periods.period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: definition.concept,
      period: periods.previousPeriod,
      members: {},
    }),
  }));
  const totals = {
    revenue: selectUniqueFact(document, {
      concept: NET_REVENUE_CONCEPT,
      period: periods.period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: NET_REVENUE_CONCEPT,
      period: periods.previousPeriod,
      members: {},
    }),
  };
  const revenueBreakdown = items.every(revenueItemComplete)
    && reconcilesRevenue(items, totals)
    ? completeSection(items)
    : unavailableSection();

  return parsedResult({
    adapterId: 'interactive-brokers-inline-xbrl',
    cik: INTERACTIVE_BROKERS_CIK,
    filing,
    period: periods.period,
    evidence: 'official-primary-inline-xbrl',
    sections: {
      reportSegments: unavailableSection('single-reportable-segment'),
      revenueBreakdown,
      geographies: unavailableSection('quarterly-geography-not-disclosed'),
    },
  });
}

function parseAdvancedMicroDevicesSections(document, period, previousPeriod) {
  const totals = consolidatedRevenueTotals(document, period, previousPeriod);
  const reportSegments = AMD_SEGMENTS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period,
      members: definition.members,
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period: previousPeriod,
      members: definition.members,
    }),
    profitMetric: 'operatingIncome',
    profit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period,
      members: definition.members,
    }),
    previousProfit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period: previousPeriod,
      members: definition.members,
    }),
  }));
  const revenueBreakdown = AMD_REVENUE_BREAKDOWN.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    concept: REVENUE_CONCEPT,
    definition,
    members: definition.members,
  }));

  return {
    reportSegments: reportSegments.every(segmentItemComplete)
      && reconcilesRevenue(reportSegments, totals)
      ? completeSection(reportSegments)
      : unavailableSection(),
    revenueBreakdown: revenueBreakdown.every(revenueItemComplete)
      && reconcilesRevenue(revenueBreakdown, totals)
      ? completeSection(revenueBreakdown)
      : unavailableSection(),
    geographies: unavailableSection('quarterly-geography-not-disclosed'),
  };
}

function parseCostcoSections(document, period, previousPeriod) {
  const totals = consolidatedRevenueTotals(document, period, previousPeriod);
  const profitTotals = consolidatedProfitTotals(document, period, previousPeriod);
  const reportSegments = COSTCO_SEGMENTS.map((definition) => segmentItem({
    document,
    period,
    previousPeriod,
    revenueConcept: REVENUE_CONCEPT,
    definition,
    members: definition.members,
  }));
  const revenueBreakdown = COSTCO_REVENUE_BREAKDOWN.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    concept: REVENUE_CONCEPT,
    definition,
    members: definition.members,
  }));
  const netSalesTotals = {
    revenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period,
      members: { [PRODUCT_OR_SERVICE_AXIS]: 'us-gaap:ProductMember' },
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period: previousPeriod,
      members: { [PRODUCT_OR_SERVICE_AXIS]: 'us-gaap:ProductMember' },
    }),
  };
  const merchandiseCategories = revenueBreakdown.slice(0, -1);
  const segmentRowsComplete = reportSegments.every(segmentItemComplete)
    && reconcilesRevenue(reportSegments, totals)
    && reconcilesProfit(reportSegments, profitTotals);
  const revenueRowsComplete = revenueBreakdown.every(revenueItemComplete)
    && reconcilesRevenue(merchandiseCategories, netSalesTotals)
    && reconcilesRevenue(revenueBreakdown, totals);
  const geographies = reportSegments.map((item) => ({
    id: item.id,
    label: item.label,
    labelZh: item.labelZh,
    revenue: item.revenue,
    previousRevenue: item.previousRevenue,
  }));

  return {
    reportSegments: segmentRowsComplete
      ? completeSection(reportSegments)
      : unavailableSection(),
    revenueBreakdown: revenueRowsComplete
      ? completeSection(revenueBreakdown)
      : unavailableSection(),
    geographies: segmentRowsComplete && geographies.every(revenueItemComplete)
      && reconcilesRevenue(geographies, totals)
      ? completeSection(geographies)
      : unavailableSection(),
  };
}

function parseUnitedHealthSections(document, period, previousPeriod) {
  const totals = consolidatedRevenueTotals(
    document,
    period,
    previousPeriod,
    REVENUES_CONCEPT,
  );
  const profitTotals = consolidatedProfitTotals(document, period, previousPeriod);
  const reportSegments = UNITEDHEALTH_SEGMENTS.map((definition) => segmentItem({
    document,
    period,
    previousPeriod,
    revenueConcept: REVENUES_CONCEPT,
    definition,
    members: {
      [CONSOLIDATION_ITEMS_AXIS]: OPERATING_SEGMENTS_MEMBER,
      [BUSINESS_SEGMENTS_AXIS]: definition.member,
    },
  }));
  const revenueAdjustments = [
    INTERSEGMENT_ELIMINATION_MEMBER,
    CORPORATE_NON_SEGMENT_MEMBER,
  ].map((member) => ({
    revenue: selectUniqueFact(document, {
      concept: REVENUES_CONCEPT,
      period,
      members: { [CONSOLIDATION_ITEMS_AXIS]: member },
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: REVENUES_CONCEPT,
      period: previousPeriod,
      members: { [CONSOLIDATION_ITEMS_AXIS]: member },
    }),
  }));
  const reportSegmentsComplete = reportSegments.every(segmentItemComplete)
    && revenueAdjustments.every(revenueItemComplete)
    && reconcilesRevenueWithAdjustments(reportSegments, revenueAdjustments, totals)
    && reconcilesProfit(reportSegments, profitTotals);

  return {
    reportSegments: reportSegmentsComplete
      ? completeSection(reportSegments, revenueReconciliation(revenueAdjustments))
      : unavailableSection(),
    revenueBreakdown: unavailableSection('quarterly-product-revenue-not-disclosed'),
    geographies: unavailableSection('quarterly-geography-not-disclosed'),
  };
}

function parseMetaSections(document, period, previousPeriod) {
  const totals = consolidatedRevenueTotals(document, period, previousPeriod);
  const reportSegments = META_SEGMENTS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period: previousPeriod,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
    profitMetric: 'operatingIncome',
    profit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
    previousProfit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period: previousPeriod,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
  }));
  const revenueBreakdown = META_REVENUE_BREAKDOWN.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    concept: REVENUE_CONCEPT,
    definition,
    members: definition.members,
  }));
  const geographies = META_GEOGRAPHIES.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    concept: REVENUE_CONCEPT,
    definition,
    members: { [GEOGRAPHICAL_AXIS]: definition.member },
  }));

  return {
    reportSegments: reportSegments.every(segmentItemComplete)
      && reconcilesRevenue(reportSegments, totals)
      ? completeSection(reportSegments)
      : unavailableSection(),
    revenueBreakdown: revenueBreakdown.every(revenueItemComplete)
      && reconcilesRevenue(revenueBreakdown, totals)
      ? completeSection(revenueBreakdown)
      : unavailableSection(),
    geographies: geographies.every(revenueItemComplete)
      && reconcilesRevenue(geographies, totals)
      ? completeSection(geographies)
      : unavailableSection(),
  };
}

function parseMicrosoftSections(document, period, previousPeriod) {
  const totals = consolidatedRevenueTotals(document, period, previousPeriod);
  const reportSegments = MICROSOFT_SEGMENTS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: REVENUE_CONCEPT,
      period: previousPeriod,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
    profitMetric: 'operatingIncome',
    profit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
    previousProfit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period: previousPeriod,
      members: { [BUSINESS_SEGMENTS_AXIS]: definition.member },
    }),
  }));
  const revenueBreakdown = MICROSOFT_REVENUE_BREAKDOWN.map((definition) => revenueItem({
    document,
    period,
    previousPeriod,
    concept: REVENUE_CONCEPT,
    definition,
    members: { [PRODUCT_OR_SERVICE_AXIS]: definition.member },
  }));

  return {
    reportSegments: reportSegments.every(segmentItemComplete)
      && reconcilesRevenue(reportSegments, totals)
      ? completeSection(reportSegments)
      : unavailableSection(),
    revenueBreakdown: revenueBreakdown.every(revenueItemComplete)
      && reconcilesRevenue(revenueBreakdown, totals)
      ? completeSection(revenueBreakdown)
      : unavailableSection(),
    geographies: unavailableSection('quarterly-geography-not-disclosed'),
  };
}

function parseInteractiveBrokersEarningsRelease({ fiscalDate, html, filing }) {
  if (filing.cik && normalizeCik(filing.cik) !== INTERACTIVE_BROKERS_CIK) return null;
  const filingForm = String(filing.form || '').trim().toUpperCase();
  if (filingForm && filingForm !== '8-K' && filingForm !== 'EX-99.1') return null;

  const text = htmlToText(html);
  const reportedQuarter = new RegExp(
    `quarter ended\\s+${escapeRegExp(englishDate(fiscalDate))}`,
    'i',
  );
  if (!/INTERACTIVE BROKERS GROUP/i.test(text)
    || !reportedQuarter.test(text)) {
    return null;
  }
  const statementAnchor = text.search(/CONSOLIDATED STATEMENTS OF INCOME/i);
  if (statementAnchor < 0) return null;
  const statement = text.slice(statementAnchor, statementAnchor + 8_000);
  const year = Number(fiscalDate.slice(0, 4));
  const priorYear = year - 1;
  const monthDay = englishMonthDay(fiscalDate);
  const headerPattern = new RegExp(
    `Three Months(?:\\s+(?:Six|Nine|Twelve) Months)?`
      + `\\s+Ended\\s+${escapeRegExp(monthDay)},`
      + `(?:\\s+Ended\\s+${escapeRegExp(monthDay)},)?`
      + `\\s+${year}\\s+${priorYear}`,
    'i',
  );
  if (!headerPattern.test(statement)
    || !/\(in millions, except share and per share data\)/i.test(statement)) {
    return null;
  }

  // The rows are the disjoint GAAP net-revenue lines in IBKR's official Q2
  // 2026 8-K Exhibit 99.1 (0001381197-26-000118).
  const rowLabels = new Map([
    ['commissions', 'Commissions'],
    ['net-interest-income', 'Total net interest income'],
    ['other-fees-services', 'Other fees and services'],
    ['other-income', 'Other income'],
  ]);
  const items = INTERACTIVE_BROKERS_REVENUE_BREAKDOWN.map((definition) => {
    const pair = extractQuarterPair(statement, rowLabels.get(definition.id));
    return {
      id: definition.id,
      label: definition.label,
      labelZh: definition.labelZh,
      revenue: pair?.current ?? null,
      previousRevenue: pair?.previous ?? null,
    };
  });
  const totalsPair = extractQuarterPair(statement, 'Total net revenues');
  const revenueBreakdown = items.every(revenueItemComplete)
    && finite(totalsPair?.current)
    && finite(totalsPair?.previous)
    && reconcilesRevenue(items, {
      revenue: totalsPair.current,
      previousRevenue: totalsPair.previous,
    })
    ? completeSection(items)
    : unavailableSection('official-earnings-release-table-unparsed');

  return parsedResult({
    adapterId: 'interactive-brokers-earnings-release',
    cik: INTERACTIVE_BROKERS_CIK,
    filing,
    period: quarterPeriodEnding(fiscalDate),
    evidence: 'official-8-k-exhibit-99.1',
    sections: {
      reportSegments: unavailableSection('single-reportable-segment'),
      revenueBreakdown,
      geographies: unavailableSection('quarterly-geography-not-disclosed'),
    },
  });
}

function parseMicrosoftEarningsRelease({ fiscalDate, html, filing }) {
  if (filing.cik && normalizeCik(filing.cik) !== MICROSOFT_CIK) return null;
  const filingForm = String(filing.form || '').trim().toUpperCase();
  if (filingForm && filingForm !== '8-K' && filingForm !== 'EX-99.1') return null;

  const text = htmlToText(html);
  const reportedQuarter = new RegExp(
    String.raw`quarter ended\s+${escapeRegExp(englishDate(fiscalDate))}`,
    'i',
  );
  if (!/MICROSOFT (?:CORP(?:ORATION)?\.?)/i.test(text)
    || !reportedQuarter.test(text)) {
    return null;
  }

  const statementAnchor = text.search(/\bSEGMENT RESULTS\b/i);
  if (statementAnchor < 0) return null;
  const statement = text.slice(statementAnchor, statementAnchor + 20_000);
  const header = statement.slice(0, 2_000);
  const year = Number(fiscalDate.slice(0, 4));
  const priorYear = year - 1;
  const yearSequence = new RegExp(
    String.raw`${year}\s+${priorYear}\s+${year}\s+${priorYear}`,
  );
  if (!/\(In millions\)\s*\(Unaudited\)/i.test(header)
    || !/Three Months Ended/i.test(header)
    || !/Twelve Months Ended/i.test(header)
    || !yearSequence.test(header)) {
    return null;
  }

  const segmentBlocks = splitMicrosoftSegmentTable(statement);
  if (!segmentBlocks) return null;
  const reportSegments = MICROSOFT_SEGMENTS.map((definition) => {
    const block = segmentBlocks.get(definition.id);
    const revenue = extractFourPeriodRow(block, 'Revenue');
    const profit = extractFourPeriodRow(block, 'Operating income');
    return {
      id: definition.id,
      label: definition.label,
      labelZh: definition.labelZh,
      revenue: revenue?.[0] ?? null,
      previousRevenue: revenue?.[1] ?? null,
      profitMetric: 'operatingIncome',
      profit: profit?.[0] ?? null,
      previousProfit: profit?.[1] ?? null,
    };
  });
  const totalRevenue = extractFourPeriodRow(segmentBlocks.get('total'), 'Revenue');
  const totalProfit = extractFourPeriodRow(segmentBlocks.get('total'), 'Operating income');
  if (!reportSegments.every(segmentItemComplete)
    || !reconcilesRevenue(reportSegments, {
      revenue: totalRevenue?.[0],
      previousRevenue: totalRevenue?.[1],
    })
    || !reconcilesProfit(reportSegments, {
      profit: totalProfit?.[0],
      previousProfit: totalProfit?.[1],
    })) {
    return null;
  }

  return parsedResult({
    adapterId: 'microsoft-earnings-release',
    cik: MICROSOFT_CIK,
    filing,
    period: quarterPeriodEnding(fiscalDate),
    evidence: 'official-8-k-exhibit-99.1',
    sections: {
      reportSegments: completeSection(reportSegments),
      revenueBreakdown: unavailableSection('quarterly-product-revenue-not-disclosed'),
      geographies: unavailableSection('quarterly-geography-not-disclosed'),
    },
  });
}

function parseUnitedHealthEarningsRelease({ fiscalDate, html, filing }) {
  if (fiscalDate !== '2026-06-30'
    || normalizeCik(filing.cik) !== UNITEDHEALTH_CIK
    || normalizeForm(filing.form) !== '8-K'
    || normalizeForm(filing.documentType) !== 'EX-99.1'
    || normalizeAccession(filing.accession)
      !== normalizeAccession(UNITEDHEALTH_Q2_2026_ACCESSION)) {
    return null;
  }

  const text = htmlToText(html);
  if (!/UnitedHealth Group Reports Second Quarter 2026 Results/i.test(text)) return null;
  const revenueAnchor = lastMatchIndex(
    text,
    /REVENUES BY BUSINESS\s*-\s*SUPPLEMENTAL FINANCIAL INFORMATION/gi,
  );
  const earningsAnchor = lastMatchIndex(
    text,
    /EARNINGS BY BUSINESS\s*-\s*SUPPLEMENTAL FINANCIAL INFORMATION/gi,
  );
  if (revenueAnchor < 0 || earningsAnchor <= revenueAnchor) return null;
  const revenueSection = text.slice(revenueAnchor, earningsAnchor);
  const earningsSection = text.slice(earningsAnchor, earningsAnchor + 12_000);
  if (!/\(in millions; unaudited\)/i.test(revenueSection)
    || !/\(in millions, except percentages; unaudited\)/i.test(earningsSection)
    || !unitedHealthReleaseHeaderMatches(revenueSection)
    || !unitedHealthReleaseHeaderMatches(earningsSection)) {
    return null;
  }

  const currentRevenue = extractUnitedHealthReleaseRow(
    revenueSection,
    '2026-06-30',
    'Total revenues',
  );
  const previousRevenue = extractUnitedHealthReleaseRow(
    revenueSection,
    '2025-06-30',
    'Total revenues',
  );
  const currentProfit = extractUnitedHealthReleaseRow(
    earningsSection,
    '2026-06-30',
    'Earnings from operations',
  );
  const previousProfit = extractUnitedHealthReleaseRow(
    earningsSection,
    '2025-06-30',
    'Earnings from operations',
  );
  const eliminations = extractUnitedHealthReleaseEliminations(revenueSection);
  if (!currentRevenue || !previousRevenue || !currentProfit || !previousProfit || !eliminations) {
    return null;
  }

  const reportSegments = UNITEDHEALTH_SEGMENTS.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: currentRevenue[index],
    previousRevenue: previousRevenue[index],
    profitMetric: 'operatingIncome',
    profit: currentProfit[index],
    previousProfit: previousProfit[index],
  }));
  const revenueAdjustments = [
    {
      revenue: -eliminations.optum.current,
      previousRevenue: -eliminations.optum.previous,
    },
    {
      revenue: -eliminations.corporate.current,
      previousRevenue: -eliminations.corporate.previous,
    },
  ];
  const totals = {
    revenue: currentRevenue[5],
    previousRevenue: previousRevenue[5],
  };
  const profitTotals = {
    profit: currentProfit[5],
    previousProfit: previousProfit[5],
  };
  const optumSegments = reportSegments.slice(1);
  if (!reportSegments.every(segmentItemComplete)
    || !reconcilesRevenueWithAdjustments(reportSegments, revenueAdjustments, totals)
    || !reconcilesRevenueWithAdjustments(optumSegments, revenueAdjustments.slice(0, 1), {
      revenue: currentRevenue[4],
      previousRevenue: previousRevenue[4],
    })
    || !reconcilesProfit(reportSegments, profitTotals)
    || !reconcilesProfit(optumSegments, {
      profit: currentProfit[4],
      previousProfit: previousProfit[4],
    })) {
    return null;
  }

  return parsedResult({
    adapterId: 'unitedhealth-earnings-release',
    cik: UNITEDHEALTH_CIK,
    filing,
    period: {
      ...quarterPeriodEnding(fiscalDate),
      fiscalYear: '2026',
      fiscalPeriod: 'Q2',
    },
    evidence: 'official-8-k-exhibit-99.1',
    sections: {
      reportSegments: completeSection(
        reportSegments,
        revenueReconciliation(revenueAdjustments),
      ),
      revenueBreakdown: unavailableSection('quarterly-product-revenue-not-disclosed'),
      geographies: unavailableSection('quarterly-geography-not-disclosed'),
    },
  });
}

function parsedResult({
  adapterId,
  cik,
  filing,
  period,
  sections,
  evidence,
}) {
  const completeCount = SECTION_KEYS.filter((key) => sections[key]?.status === 'complete').length;
  return {
    status: completeCount === SECTION_KEYS.length
      ? 'complete'
      : completeCount > 0
        ? 'partial'
        : 'unavailable',
    currency: 'USD',
    period,
    sections,
    sourceMetadata: {
      provider: 'SEC',
      adapterId,
      evidence,
      cik,
      accession: safeText(filing.accession, 40) || null,
      form: safeText(filing.form, 20) || null,
    },
  };
}

function consolidatedRevenueTotals(
  document,
  period,
  previousPeriod,
  concept = REVENUE_CONCEPT,
) {
  return {
    revenue: selectUniqueFact(document, {
      concept,
      period,
      members: {},
    }),
    previousRevenue: selectUniqueFact(document, {
      concept,
      period: previousPeriod,
      members: {},
    }),
  };
}

function consolidatedProfitTotals(document, period, previousPeriod) {
  return {
    profit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period,
      members: {},
    }),
    previousProfit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period: previousPeriod,
      members: {},
    }),
  };
}

function segmentItem({
  document,
  period,
  previousPeriod,
  revenueConcept,
  definition,
  members,
}) {
  return {
    id: definition.id,
    label: definition.label,
    labelZh: definition.labelZh,
    revenue: selectUniqueFact(document, {
      concept: revenueConcept,
      period,
      members,
    }),
    previousRevenue: selectUniqueFact(document, {
      concept: revenueConcept,
      period: previousPeriod,
      members,
    }),
    profitMetric: 'operatingIncome',
    profit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period,
      members,
    }),
    previousProfit: selectUniqueFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period: previousPeriod,
      members,
    }),
  };
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

function inlineDocumentIdentityMatches(document, {
  cik,
  fiscalDate,
  forms = ['10-Q'],
  fiscalDateToleranceDays = 0,
}) {
  const documentForm = normalizeForm(uniqueTextFact(document, 'dei:DocumentType'));
  const acceptedForms = forms.map(normalizeForm);
  const documentFiscalDate = normalizeDocumentDate(
    uniqueTextFact(document, 'dei:DocumentPeriodEndDate'),
  );
  return acceptedForms.includes(documentForm)
    && datesWithinDays(documentFiscalDate, fiscalDate, fiscalDateToleranceDays)
    && normalizeCik(uniqueTextFact(document, 'dei:EntityCentralIndexKey')) === cik;
}

function resolveReportedQuarterPeriods(
  document,
  fiscalDate,
  totalConcept = REVENUE_CONCEPT,
) {
  const periods = new Map();
  for (const context of document.contexts.values()) {
    if (!context.start
      || context.end !== fiscalDate
      || Object.keys(context.members || {}).length > 0
      || !isQuarterDuration(context.start, context.end)) {
      continue;
    }
    const period = { start: context.start, end: context.end };
    if (!finite(selectUniqueFact(document, {
      concept: totalConcept,
      period,
      members: {},
    }))) {
      continue;
    }
    periods.set(`${period.start}|${period.end}`, period);
  }
  if (periods.size !== 1) return null;
  const period = periods.values().next().value;

  const previousPeriods = new Map();
  for (const context of document.contexts.values()) {
    if (!context.start
      || Object.keys(context.members || {}).length > 0
      || !isQuarterDuration(context.start, context.end)) {
      continue;
    }
    const endDistance = dateDistanceDays(context.end, period.end);
    const durationDifference = Math.abs(
      dateDistanceDays(context.start, context.end)
      - dateDistanceDays(period.start, period.end),
    );
    if (endDistance < 330 || endDistance > 400 || durationDifference > 7) continue;
    const candidate = { start: context.start, end: context.end };
    if (!finite(selectUniqueFact(document, {
      concept: totalConcept,
      period: candidate,
      members: {},
    }))) {
      continue;
    }
    previousPeriods.set(`${candidate.start}|${candidate.end}`, candidate);
  }
  return previousPeriods.size === 1
    ? { period, previousPeriod: previousPeriods.values().next().value }
    : null;
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

function extractQuarterPair(statement, label) {
  const amount = '(\\(?\\s*[\\d,]+(?:\\.\\d+)?\\s*\\)?)';
  const match = statement.match(new RegExp(
    `${escapeRegExp(label)}\\s+\\$?\\s*${amount}\\s+\\$?\\s*${amount}`,
    'i',
  ));
  if (!match) return null;
  const current = parseMillions(match[1]);
  const previous = parseMillions(match[2]);
  return finite(current) && finite(previous) ? { current, previous } : null;
}

function splitMicrosoftSegmentTable(statement) {
  const headings = MICROSOFT_SEGMENTS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    index: statement.search(new RegExp(`\\b${escapeRegExp(definition.label)}\\b`, 'i')),
  }));
  if (headings.some((heading) => heading.index < 0)
    || headings.some((heading, index) => index > 0 && heading.index <= headings[index - 1].index)) {
    return null;
  }

  const finalHeading = headings.at(-1);
  const finalTail = statement.slice(finalHeading.index + finalHeading.label.length);
  const totalMatch = finalTail.match(/\bTotal\s+Revenue\s+\$?/i);
  if (!totalMatch || !finite(totalMatch.index)) return null;
  const totalIndex = finalHeading.index + finalHeading.label.length + totalMatch.index;

  const output = new Map();
  headings.forEach((heading, index) => {
    const start = heading.index + heading.label.length;
    const end = headings[index + 1]?.index ?? totalIndex;
    output.set(heading.id, statement.slice(start, end));
  });
  output.set('total', statement.slice(totalIndex));
  return output;
}

function extractFourPeriodRow(statement, label) {
  if (!statement) return null;
  const amount = '(\\(?\\s*[\\d,]+(?:\\.\\d+)?\\s*\\)?)';
  const rowLabel = String(label).toLowerCase() === 'revenue'
    ? `(?<!Cost of\\s)${escapeRegExp(label)}`
    : escapeRegExp(label);
  const pattern = new RegExp(
    `${rowLabel}\\s+\\$?\\s*${amount}`
      + `\\s+\\$?\\s*${amount}`
      + `\\s+\\$?\\s*${amount}`
      + `\\s+\\$?\\s*${amount}`,
    'gi',
  );
  const rows = new Map();
  for (const match of statement.matchAll(pattern)) {
    const values = match.slice(1, 5).map(parseMillions);
    if (values.every(finite)) rows.set(values.join('|'), values);
  }
  return rows.size === 1 ? rows.values().next().value : null;
}

function unitedHealthReleaseHeaderMatches(section) {
  return [
    'UnitedHealthcare',
    'Optum Health',
    'Optum Insight',
    'Optum Rx',
    'Total Optum',
    'UnitedHealth Group Consolidated',
  ].every((label) => new RegExp(escapeRegExp(label), 'i').test(section));
}

function extractUnitedHealthReleaseRow(section, fiscalDate, label) {
  const rowStart = String.raw`Three Months Ended\s+${escapeRegExp(englishDate(fiscalDate))}`
    + String.raw`\s*(?:-\s*)?${escapeRegExp(label)}`;
  const amount = '\\$?\\s*(\\(?\\s*[\\d,]+(?:\\.\\d+)?\\s*\\)?)';
  const pattern = new RegExp(
    rowStart
      + '(?:\\s|\\.){1,160}'
      + Array.from({ length: 6 }, () => amount).join('\\s+'),
    'gi',
  );
  const rows = new Map();
  for (const match of section.matchAll(pattern)) {
    const values = match.slice(1, 7).map(parseMillions);
    if (values.every(finite)) rows.set(values.join('|'), values);
  }
  return rows.size === 1 ? rows.values().next().value : null;
}

function extractUnitedHealthReleaseEliminations(section) {
  const match = section.match(
    /Optum eliminations of\s+\$?([\d,]+)\s+and\s+\$?([\d,]+);?\s+and corporate eliminations of\s+\$?([\d,]+)\s+and\s+\$?([\d,]+)/i,
  );
  if (!match) return null;
  const values = match.slice(1, 5).map(parseMillions);
  if (!values.every(finite)) return null;
  return {
    optum: { current: values[0], previous: values[1] },
    corporate: { current: values[2], previous: values[3] },
  };
}

function parseMillions(value) {
  const raw = String(value || '').replace(/[,\s]/g, '');
  const parenthesized = raw.startsWith('(') && raw.endsWith(')');
  const number = Number(raw.replace(/[()]/g, ''));
  if (!Number.isFinite(number)) return null;
  const result = number * 1_000_000 * (parenthesized ? -1 : 1);
  return Number.isSafeInteger(result) ? result : null;
}

function reconcilesRevenue(items, totals) {
  if (!finite(totals?.revenue) || !finite(totals?.previousRevenue)) return false;
  return items.reduce((sum, item) => sum + item.revenue, 0) === totals.revenue
    && items.reduce((sum, item) => sum + item.previousRevenue, 0) === totals.previousRevenue;
}

function reconcilesRevenueWithAdjustments(items, adjustments, totals) {
  if (!finite(totals?.revenue) || !finite(totals?.previousRevenue)) return false;
  return [...items, ...adjustments].reduce((sum, item) => sum + item.revenue, 0)
      === totals.revenue
    && [...items, ...adjustments].reduce(
      (sum, item) => sum + item.previousRevenue,
      0,
    ) === totals.previousRevenue;
}

function reconcilesProfit(items, totals) {
  if (!finite(totals?.profit) || !finite(totals?.previousProfit)) return false;
  return items.reduce((sum, item) => sum + item.profit, 0) === totals.profit
    && items.reduce((sum, item) => sum + item.previousProfit, 0) === totals.previousProfit;
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

function revenueReconciliation(adjustments) {
  return {
    id: 'segment-reconciliation',
    label: 'Eliminations and corporate adjustments',
    labelZh: '抵销及公司层调整',
    revenue: adjustments.reduce((sum, item) => sum + item.revenue, 0),
    previousRevenue: adjustments.reduce(
      (sum, item) => sum + item.previousRevenue,
      0,
    ),
  };
}

function completeSection(items, reconciliation = null) {
  return {
    status: 'complete',
    reason: null,
    items,
    ...(reconciliation ? { reconciliation } : {}),
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

function parseAttributes(source) {
  const output = {};
  for (const match of String(source || '').matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    output[match[1].toLowerCase()] = match[2];
  }
  return output;
}

function elementText(source, tagName) {
  const escaped = escapeRegExp(tagName);
  const match = String(source || '').match(
    new RegExp(`<${escaped}\\b[^>]*>([^<]+)</${escaped}>`, 'i'),
  );
  return match ? htmlToText(match[1]) : '';
}

function quarterPeriodEnding(fiscalDate) {
  const end = parseDate(fiscalDate);
  if (!end) return { start: '', end: fiscalDate };
  const start = new Date(Date.UTC(
    end.getUTCFullYear(),
    Math.floor(end.getUTCMonth() / 3) * 3,
    1,
  ));
  return {
    start: start.toISOString().slice(0, 10),
    end: fiscalDate,
  };
}

function englishDate(value) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date)
    : '';
}

function englishMonthDay(value) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'long',
        day: 'numeric',
      }).format(date)
    : '';
}

function isQuarterDuration(start, end) {
  const duration = dateDistanceDays(start, end);
  return duration >= 70 && duration <= 105;
}

function dateDistanceDays(from, to) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return Number.POSITIVE_INFINITY;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function datesWithinDays(left, right, toleranceDays = 0) {
  const distance = Math.abs(dateDistanceDays(left, right));
  const tolerance = Math.max(0, Number(toleranceDays) || 0);
  return Number.isFinite(distance) && distance <= tolerance;
}

function parseDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key
    ? null
    : date;
}

function dateKey(value) {
  return String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/)?.[1] || '';
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

function normalizeCik(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(10, '0') : '';
}

function normalizeAccession(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeForm(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function safeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function lastMatchIndex(value, pattern) {
  let index = -1;
  for (const match of String(value || '').matchAll(pattern)) index = match.index;
  return index;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function finite(value) {
  return Number.isFinite(value);
}
