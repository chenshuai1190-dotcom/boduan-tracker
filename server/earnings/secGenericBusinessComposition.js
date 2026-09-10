import { htmlToText } from './secOfficialParsers.js';

const SECTION_KEYS = [
  'reportSegments',
  'revenueBreakdown',
  'geographies',
];

const REVENUE_CONCEPTS = [
  'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
  'us-gaap:Revenues',
  'us-gaap:SalesRevenueNet',
  'us-gaap:SalesRevenueGoodsNet',
  'us-gaap:SalesRevenueServicesNet',
  'us-gaap:RevenuesNetOfInterestExpense',
];
const OPERATING_INCOME_CONCEPT = 'us-gaap:OperatingIncomeLoss';

const NUMERIC_CONCEPT_BY_LOWER_NAME = new Map(
  [...REVENUE_CONCEPTS, OPERATING_INCOME_CONCEPT]
    .map((concept) => [concept.toLowerCase(), concept]),
);

const SECTION_DEFINITIONS = [
  {
    key: 'reportSegments',
    axes: [
      'us-gaap:StatementBusinessSegmentsAxis',
      'srt:StatementBusinessSegmentsAxis',
    ],
  },
  {
    key: 'revenueBreakdown',
    axes: [
      'srt:ProductOrServiceAxis',
      'us-gaap:ProductOrServiceAxis',
    ],
  },
  {
    key: 'geographies',
    axes: [
      'srt:StatementGeographicalAxis',
      'us-gaap:StatementGeographicalAxis',
    ],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_QUARTER_DAYS = 70;
const MAX_QUARTER_DAYS = 105;
const MIN_PRIOR_YEAR_DAYS = 330;
const MAX_PRIOR_YEAR_DAYS = 400;
const MAX_QUARTER_DURATION_DIFFERENCE_DAYS = 7;
const MAX_RECONCILIATION_ITEMS = 24;

export function canAttemptGenericSecBusinessComposition(symbol) {
  return Boolean(normalizeSymbol(symbol));
}

export function parseGenericSecBusinessComposition(options = {}) {
  return inspectGenericSecBusinessComposition(options).result;
}

export function inspectGenericSecBusinessComposition({
  symbol,
  fiscalDate,
  html,
  filing = {},
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = normalizeDate(fiscalDate);
  const filingForm = normalizeForm(filing.form);
  const documentType = String(filing.documentType || '').trim().toUpperCase();
  const filingCik = normalizeCik(filing.cik);
  const rejected = (reason) => ({ result: null, reason });
  if (!normalizedSymbol
    || !normalizedFiscalDate
    || !filingCik) return rejected('invalid-filing-identity');
  if (!['10-Q', '10-K'].includes(filingForm)) return rejected('unsupported-filing-form');
  if (documentType !== 'PRIMARY') return rejected('unsupported-document-type');
  if (typeof html !== 'string' || html.length < 100 || !/<ix:nonFraction\b/i.test(html)) {
    return rejected('inline-xbrl-not-found');
  }

  const document = parseInlineXbrlDocument(html, filingCik);
  if (document.malformed) return rejected('malformed-inline-xbrl');

  const documentForm = normalizeForm(uniqueIdentityFact(document, 'dei:DocumentType'));
  const documentFiscalDate = normalizeDate(
    uniqueIdentityFact(document, 'dei:DocumentPeriodEndDate'),
  );
  const documentCik = normalizeCik(
    uniqueIdentityFact(document, 'dei:EntityCentralIndexKey'),
  );
  if (documentForm !== filingForm
    || documentFiscalDate !== normalizedFiscalDate
    || documentCik !== filingCik) {
    return rejected('document-identity-or-period-mismatch');
  }
  const fiscalYear = uniqueFiscalYear(document);
  const fiscalPeriod = uniqueFiscalPeriod(document);
  // A normal 10-K says FY and contains annual facts. Never relabel those facts
  // as Q4 or infer Q4 by subtraction. Only an explicit DEI Q4 and an exact
  // 70-105 day root duration ending on the official fiscal date are eligible.
  if (filingForm === '10-K' && (fiscalPeriod !== 'Q4' || !fiscalYear)) {
    return rejected('annual-filing-without-explicit-quarter');
  }

  const resolved = resolveUniqueQuarterPair(document, documentFiscalDate);
  if (!resolved.value) return rejected(resolved.reason);
  const quarter = resolved.value;

  const sections = Object.fromEntries(SECTION_DEFINITIONS.map((definition) => [
    definition.key,
    buildAxisSection(document, quarter, definition),
  ]));
  const completeCount = SECTION_KEYS.filter(
    (key) => sections[key]?.status === 'complete',
  ).length;
  const result = {
    status: completeCount === SECTION_KEYS.length
      ? 'complete'
      : completeCount > 0
        ? 'partial'
        : 'unavailable',
    currency: 'USD',
    totalRevenue: quarter.revenue,
    previousTotalRevenue: quarter.previousRevenue,
    period: {
      ...quarter.period,
      ...(fiscalYear ? { fiscalYear } : {}),
      ...(fiscalPeriod ? { fiscalPeriod } : {}),
    },
    sections,
    sourceMetadata: {
      provider: 'SEC',
      adapterId: 'generic-sec-inline-xbrl-v2',
      evidence: 'official-primary-inline-xbrl',
      cik: filingCik,
      accession: safeText(filing.accession, 40) || null,
      form: filingForm,
    },
  };
  return { result, reason: null };
}

function buildAxisSection(document, resolved, definition) {
  const axisResults = definition.axes
    .map((axis) => buildSingleAxisSection(document, resolved, axis, definition.key));
  const ambiguous = axisResults.find((result) => result.status === 'ambiguous');
  if (ambiguous) return unavailableSection(ambiguous.reason);
  const complete = axisResults.filter((result) => result.status === 'complete');
  return complete.length === 1
    ? completeSection(
        complete[0].items,
        {
          ...(complete[0].reconciliation
            ? { reconciliation: complete[0].reconciliation }
            : {}),
          metricStatus: complete[0].metricStatus,
        },
      )
    : unavailableSection(complete.length > 1
      ? 'ambiguous-section-axes'
      : 'missing-supported-axis-facts');
}

function buildSingleAxisSection(document, resolved, axis, sectionKey) {
  const axisLower = axis.toLowerCase();
  const configurations = new Map();
  for (const fact of document.numericFacts) {
    if (fact.concept !== resolved.concept) continue;
    const context = document.contexts.get(fact.contextRef);
    if (!context) continue;
    const periodKind = samePeriod(context, resolved.period)
      ? 'current'
      : resolved.previousPeriod && samePeriod(context, resolved.previousPeriod)
        ? 'previous'
        : '';
    if (!periodKind) continue;

    const axisEntry = Object.entries(context.members)
      .find(([dimension]) => dimension.toLowerCase() === axisLower);
    if (!axisEntry || !dimensionsFitSection(context.members, axisLower, sectionKey)) continue;
    const key = serializeMembers(context.members);
    const existing = configurations.get(key) || {
      members: context.members,
      member: axisEntry[1],
      current: [],
      previous: [],
    };
    existing[periodKind].push(fact.value);
    configurations.set(key, existing);
  }

  if (configurations.size === 0) return { status: 'missing', items: [] };

  const memberConfigurations = new Set();
  const ids = new Set();
  const candidates = [];
  for (const configuration of configurations.values()) {
    const currentValues = new Set(configuration.current);
    const previousValues = new Set(configuration.previous);
    if (currentValues.size > 1 || previousValues.size > 1) {
      return ambiguousSection('conflicting-dimensional-revenue');
    }
    // A discontinued prior-year member is not a current revenue component.
    // Its absence is never filled with zero; prior comparability is checked
    // against the company total after the current structure is resolved.
    if (currentValues.size === 0) continue;
    const memberKey = configuration.member.toLowerCase();
    if (memberConfigurations.has(memberKey)) {
      return ambiguousSection('ambiguous-member-dimensions');
    }
    memberConfigurations.add(memberKey);
    const label = humanizeQName(configuration.member);
    const id = qnameId(configuration.member);
    if (!label || !id || ids.has(id)) return ambiguousSection('ambiguous-member-labels');
    ids.add(id);
    candidates.push({
      id,
      label,
      labelZh: '',
      revenue: currentValues.values().next().value,
      previousRevenue: previousValues.size === 1 ? previousValues.values().next().value : null,
      ...(sectionKey === 'reportSegments'
        ? {
            profitMetric: 'operatingIncome',
            profit: strictFact(document, {
              concept: OPERATING_INCOME_CONCEPT,
              period: resolved.period,
              members: configuration.members,
            }).value,
            previousProfit: resolved.previousPeriod ? strictFact(document, {
              concept: OPERATING_INCOME_CONCEPT,
              period: resolved.previousPeriod,
              members: configuration.members,
            }).value : null,
          }
        : {}),
    });
  }

  if (candidates.length < 2 || candidates.length > MAX_RECONCILIATION_ITEMS) {
    return ambiguousSection('unsupported-component-count');
  }
  const reconciliationCandidates = sectionKey === 'reportSegments'
    ? reportSegmentReconciliationCandidates(document, resolved)
    : { status: 'complete', items: [] };
  if (reconciliationCandidates.status !== 'complete') {
    return ambiguousSection(reconciliationCandidates.reason);
  }
  if (candidates.length + reconciliationCandidates.items.length > MAX_RECONCILIATION_ITEMS) {
    return ambiguousSection('unsupported-component-count');
  }
  // Profit-only adjustments do not help identify a revenue hierarchy. Adding
  // them here would create duplicate revenue solutions merely by adding zero.
  const revenueAdjustments = reconciliationCandidates.items.filter((item) => item.revenue !== 0);
  const allCandidates = [...candidates, ...revenueAdjustments];
  const comparableCandidates = Number.isSafeInteger(resolved.previousRevenue)
    && allCandidates.every((item) => Number.isSafeInteger(item.previousRevenue));
  const currentSolutions = findReconciliationSolutions(allCandidates, {
    revenue: resolved.revenue,
    previousRevenue: null,
  });
  const comparableSolutions = comparableCandidates ? findReconciliationSolutions(allCandidates, {
    revenue: resolved.revenue, previousRevenue: resolved.previousRevenue,
  }) : [];
  const solutions = comparableSolutions.length === 1 ? comparableSolutions : currentSolutions;
  if (solutions.length !== 1 || solutions[0].length < 2) {
    return ambiguousSection(solutions.length > 1
      ? 'ambiguous-revenue-hierarchy'
      : 'revenue-reconciliation-failed');
  }
  const selectedSegments = solutions[0]
    .filter((index) => index < candidates.length)
    .map((index) => candidates[index]);
  if (selectedSegments.length < 2) return ambiguousSection('unsupported-component-count');
  const selectedReconciliation = solutions[0]
    .filter((index) => index >= candidates.length)
    .map((index) => allCandidates[index]);
  const selectedItems = [...selectedSegments, ...selectedReconciliation];
  const previousComplete = Number.isSafeInteger(resolved.previousRevenue)
    && selectedItems.every((item) => Number.isSafeInteger(item.previousRevenue))
    && selectedItems.reduce((sum, item) => sum + item.previousRevenue, 0) === resolved.previousRevenue;
  const metricStatus = {
    revenue: { status: 'complete', reason: null },
    previousRevenue: {
      status: previousComplete ? 'complete' : 'unavailable',
      reason: previousComplete ? null : 'prior-revenue-unavailable-or-not-comparable',
    },
  };
  if (!previousComplete) {
    for (const item of selectedItems) item.previousRevenue = null;
  }
  let profitReconciliation = [];
  if (sectionKey === 'reportSegments') {
    const optionalAdjustments = reconciliationCandidates.items.filter((item) => item.revenue === 0);
    const currentProfit = resolveSegmentProfit({
      items: selectedItems,
      adjustments: optionalAdjustments,
      total: resolved.profit,
      metric: 'profit',
      conflicted: reconciliationCandidates.profitConflict,
    });
    let previousProfit = previousComplete ? resolveSegmentProfit({
      items: selectedItems,
      adjustments: optionalAdjustments.filter((item) => item.previousRevenue === 0),
      total: resolved.previousProfit,
      metric: 'previousProfit',
      conflicted: reconciliationCandidates.previousProfitConflict,
    }) : { status: 'unavailable', reason: 'prior-revenue-unavailable-or-not-comparable', adjustments: [] };
    if (currentProfit.status === 'complete' && previousProfit.status === 'complete'
      && currentProfit.adjustments.map((item) => item.id).sort().join('|')
        !== previousProfit.adjustments.map((item) => item.id).sort().join('|')) {
      previousProfit = {
        status: 'unavailable', reason: 'operating-income-reconciliation-not-comparable', adjustments: [],
      };
    }
    metricStatus.profit = { status: currentProfit.status, reason: currentProfit.reason };
    metricStatus.previousProfit = { status: previousProfit.status, reason: previousProfit.reason };
    if (currentProfit.status !== 'complete') {
      for (const item of selectedItems) item.profit = null;
    }
    if (previousProfit.status !== 'complete') {
      for (const item of selectedItems) item.previousProfit = null;
    }
    const adjustmentIds = new Set([
      ...currentProfit.adjustments.map((item) => item.id),
      ...previousProfit.adjustments.map((item) => item.id),
    ]);
    profitReconciliation = optionalAdjustments.filter((item) => adjustmentIds.has(item.id)).map((item) => ({
      ...item,
      previousRevenue: previousComplete ? item.previousRevenue : null,
      profit: currentProfit.status === 'complete'
        ? item.profit
        : null,
      previousProfit: previousProfit.status === 'complete'
        ? item.previousProfit
        : null,
    }));
  }
  const allReconciliation = [...selectedReconciliation, ...profitReconciliation];
  return {
    status: 'complete',
    items: selectedSegments,
    metricStatus,
    ...(allReconciliation.length > 0
      ? { reconciliation: aggregateReconciliation(allReconciliation) }
      : {}),
  };
}

function resolveSegmentProfit({ items, adjustments, total, metric, conflicted }) {
  const unavailable = (reason) => ({ status: 'unavailable', reason, adjustments: [] });
  if (conflicted) return unavailable('conflicting-operating-income');
  if (!Number.isSafeInteger(total)
    || !items.every((item) => Number.isSafeInteger(item[metric]))) {
    return unavailable('operating-income-not-disclosed');
  }
  const usableAdjustments = adjustments.filter((item) => Number.isSafeInteger(item[metric]));
  const remaining = total - items.reduce((sum, item) => sum + item[metric], 0);
  const solutions = findReconciliationSolutions(usableAdjustments.map((item) => ({
    revenue: item[metric], previousRevenue: null,
  })), { revenue: remaining, previousRevenue: null }, { allowEmpty: true });
  if (solutions.length !== 1) return unavailable(solutions.length > 1
    ? 'ambiguous-operating-income-reconciliation'
    : 'operating-income-reconciliation-failed');
  return {
    status: 'complete', reason: null,
    adjustments: solutions[0].map((index) => usableAdjustments[index]),
  };
}

function reportSegmentReconciliationCandidates(document, resolved) {
  const configurations = new Map();
  for (const fact of document.numericFacts) {
    if (![resolved.concept, OPERATING_INCOME_CONCEPT].includes(fact.concept)) continue;
    const context = document.contexts.get(fact.contextRef);
    if (!context || Object.keys(context.members).length !== 1) continue;
    const [axisEntry] = Object.entries(context.members);
    if (!isConsolidationItemsAxis(axisEntry[0])
      || /:OperatingSegmentsMember$/i.test(axisEntry[1])) {
      continue;
    }
    const periodKind = samePeriod(context, resolved.period)
      ? 'current'
      : resolved.previousPeriod && samePeriod(context, resolved.previousPeriod)
        ? 'previous'
        : '';
    if (!periodKind) continue;
    const key = serializeMembers(context.members);
    const existing = configurations.get(key) || {
      member: axisEntry[1],
      currentRevenue: new Set(),
      previousRevenue: new Set(),
      currentProfit: new Set(),
      previousProfit: new Set(),
    };
    const metric = fact.concept === OPERATING_INCOME_CONCEPT ? 'Profit' : 'Revenue';
    existing[`${periodKind}${metric}`].add(fact.value);
    configurations.set(key, existing);
  }

  const items = [];
  const ids = new Set();
  let profitConflict = false;
  let previousProfitConflict = false;
  for (const configuration of configurations.values()) {
    if (!configuration.currentRevenue.size && !configuration.currentProfit.size) continue;
    if (configuration.currentRevenue.size > 1 || configuration.previousRevenue.size > 1) {
      return ambiguousSection('conflicting-consolidation-revenue');
    }
    profitConflict ||= configuration.currentProfit.size > 1;
    previousProfitConflict ||= configuration.previousProfit.size > 1;
    const id = qnameId(configuration.member);
    const label = humanizeQName(configuration.member);
    if (!id || !label || ids.has(id)) return ambiguousSection('ambiguous-consolidation-labels');
    ids.add(id);
    items.push({
      id,
      label,
      labelZh: '',
      revenue: configuration.currentRevenue.size === 1
        ? configuration.currentRevenue.values().next().value
        : 0,
      previousRevenue: configuration.previousRevenue.size === 1
        ? configuration.previousRevenue.values().next().value
        : configuration.previousProfit.size > 0 ? 0 : null,
      profitMetric: 'operatingIncome',
      profit: configuration.currentProfit.size === 1
        ? configuration.currentProfit.values().next().value : null,
      previousProfit: configuration.previousProfit.size === 1
        ? configuration.previousProfit.values().next().value : null,
    });
  }
  return { status: 'complete', items, profitConflict, previousProfitConflict };
}

function aggregateReconciliation(items) {
  if (items.length === 1) return items[0];
  return {
    id: 'consolidation-adjustments',
    label: items.map((item) => item.label).join(' + ').slice(0, 120),
    labelZh: '',
    revenue: sumCompleteMetric(items, 'revenue'),
    previousRevenue: sumCompleteMetric(items, 'previousRevenue'),
    profitMetric: 'operatingIncome',
    profit: sumCompleteMetric(items, 'profit'),
    previousProfit: sumCompleteMetric(items, 'previousProfit'),
  };
}

function sumCompleteMetric(items, metric) {
  return items.every((item) => Number.isSafeInteger(item[metric]))
    ? items.reduce((sum, item) => sum + item[metric], 0)
    : null;
}

function isConsolidationItemsAxis(dimension) {
  return [
    'srt:consolidationitemsaxis',
    'us-gaap:consolidationitemsaxis',
  ].includes(String(dimension || '').toLowerCase());
}

function dimensionsFitSection(members, axisLower, sectionKey) {
  const supportingAxes = new Set([
    axisLower,
    'srt:consolidationitemsaxis',
    'us-gaap:consolidationitemsaxis',
  ]);
  if (sectionKey === 'revenueBreakdown') {
    supportingAxes.add('us-gaap:statementbusinesssegmentsaxis');
    supportingAxes.add('srt:statementbusinesssegmentsaxis');
  }
  return Object.keys(members).every(
    (dimension) => supportingAxes.has(dimension.toLowerCase()),
  );
}

function resolveUniqueQuarterPair(document, fiscalDate) {
  const solutions = [];
  for (const concept of REVENUE_CONCEPTS) {
    const currentInspection = inspectRootPeriods(document, {
      concept,
      end: fiscalDate,
    });
    if (currentInspection.ambiguous) {
      return { value: null, reason: 'conflicting-current-quarter-revenue' };
    }
    const periods = currentInspection.periods;
    if (periods.length !== 1) continue;
    const period = periods[0];
    const revenueFact = strictFact(document, { concept, period, members: {} });
    if (revenueFact.status !== 'complete' || revenueFact.value <= 0) continue;

    const previousInspection = inspectRootPeriods(document, { concept }, (candidate) => {
      const endDistance = daysBetween(candidate.end, period.end);
      const durationDifference = Math.abs(
        daysBetween(candidate.start, candidate.end)
        - daysBetween(period.start, period.end),
      );
      return endDistance >= MIN_PRIOR_YEAR_DAYS
        && endDistance <= MAX_PRIOR_YEAR_DAYS
        && durationDifference <= MAX_QUARTER_DURATION_DIFFERENCE_DAYS;
    });
    if (previousInspection.ambiguous) {
      return { value: null, reason: 'conflicting-prior-quarter-revenue' };
    }
    const previousPeriods = previousInspection.periods;
    const previousPeriod = previousPeriods.length === 1 ? previousPeriods[0] : null;
    const previousRevenueFact = previousPeriod ? strictFact(document, {
      concept,
      period: previousPeriod,
      members: {},
    }) : { status: 'missing', value: null };
    const profitFact = strictFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period,
      members: {},
    });
    const previousProfitFact = previousPeriod ? strictFact(document, {
      concept: OPERATING_INCOME_CONCEPT,
      period: previousPeriod,
      members: {},
    }) : { status: 'missing', value: null };
    solutions.push({
      concept,
      period,
      previousPeriod,
      revenue: revenueFact.value,
      previousRevenue: previousRevenueFact.value > 0 ? previousRevenueFact.value : null,
      profit: profitFact.status === 'complete' ? profitFact.value : null,
      previousProfit: previousProfitFact.status === 'complete'
        ? previousProfitFact.value
        : null,
    });
  }
  return solutions.length === 1
    ? { value: solutions[0], reason: null }
    : { value: null, reason: solutions.length > 1
        ? 'ambiguous-consolidated-revenue-concepts'
        : 'missing-exact-usd-quarter-revenue' };
}

function inspectRootPeriods(document, { concept, end = '' }, filter = () => true) {
  const semanticPeriods = new Map();
  for (const context of document.contexts.values()) {
    if (!context.start
      || Object.keys(context.members).length > 0
      || (end && context.end !== end)
      || !isQuarterDuration(context.start, context.end)) {
      continue;
    }
    const period = { start: context.start, end: context.end };
    if (filter(period)) semanticPeriods.set(`${period.start}|${period.end}`, period);
  }
  const inspections = Array.from(semanticPeriods.values()).map((period) => ({
    period,
    selected: strictFact(document, { concept, period, members: {} }),
  }));
  const ambiguous = inspections.some(({ selected }) => selected.status === 'ambiguous');
  const periods = inspections
    .filter(({ selected }) => selected.status === 'complete')
    .map(({ period }) => period);
  return {
    ambiguous: ambiguous || periods.length > 1,
    periods,
  };
}

function strictFact(document, { concept, period, members }) {
  const values = new Set();
  for (const fact of document.numericFacts) {
    if (fact.concept !== concept) continue;
    const context = document.contexts.get(fact.contextRef);
    if (!context
      || !samePeriod(context, period)
      || !membersEqual(context.members, members)) {
      continue;
    }
    values.add(fact.value);
  }
  return values.size === 1
    ? { status: 'complete', value: values.values().next().value }
    : { status: values.size ? 'ambiguous' : 'missing', value: null };
}

function findReconciliationSolutions(items, totals, { allowEmpty = false } = {}) {
  const includePrevious = Number.isSafeInteger(totals.previousRevenue);
  const midpoint = Math.floor(items.length / 2);
  const left = enumerateSubsets(items.slice(0, midpoint), 0);
  const right = enumerateSubsets(items.slice(midpoint), midpoint);
  if (!left || !right) return [];

  const rightByTotals = new Map();
  for (const subset of right) {
    const key = reconciliationKey(subset, includePrevious);
    const matches = rightByTotals.get(key) || [];
    if (matches.length < 2) matches.push(subset.indices);
    rightByTotals.set(key, matches);
  }

  const solutions = [];
  const solutionKeys = new Set();
  for (const subset of left) {
    const neededRevenue = totals.revenue - subset.revenue;
    const neededPreviousRevenue = includePrevious ? totals.previousRevenue - subset.previousRevenue : 0;
    const needed = {
      revenue: neededRevenue,
      previousRevenue: neededPreviousRevenue,
    };
    const matches = rightByTotals.get(reconciliationKey(needed, includePrevious)) || [];
    for (const match of matches) {
      const indices = [...subset.indices, ...match];
      if (indices.length === 0 && !allowEmpty) continue;
      const key = indices.join(',');
      if (solutionKeys.has(key)) continue;
      solutionKeys.add(key);
      solutions.push(indices);
      if (solutions.length > 1) return solutions;
    }
  }
  return solutions;
}

function enumerateSubsets(items, indexOffset) {
  const subsets = [];
  const count = 2 ** items.length;
  for (let mask = 0; mask < count; mask += 1) {
    let revenue = 0;
    let previousRevenue = 0;
    const indices = [];
    for (let index = 0; index < items.length; index += 1) {
      if ((mask & (2 ** index)) === 0) continue;
      revenue += items[index].revenue;
      previousRevenue += Number.isSafeInteger(items[index].previousRevenue)
        ? items[index].previousRevenue : 0;
      indices.push(index + indexOffset);
    }
    if (!Number.isSafeInteger(revenue)
      || !Number.isSafeInteger(previousRevenue)) return null;
    subsets.push({ revenue, previousRevenue, indices });
  }
  return subsets;
}

function reconciliationKey(value, includePrevious) {
  return includePrevious ? `${value.revenue}|${value.previousRevenue}` : `${value.revenue}`;
}

function parseInlineXbrlDocument(html, filingCik) {
  const units = new Map();
  let malformed = false;
  for (const match of html.matchAll(/<xbrli:unit\b([^>]*)>([\s\S]*?)<\/xbrli:unit>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.id || units.has(attributes.id)) {
      malformed = true;
      continue;
    }
    const measures = Array.from(match[2].matchAll(
      /<xbrli:measure\b[^>]*>([\s\S]*?)<\/xbrli:measure>/gi,
    )).map((measure) => htmlToText(measure[1]).toLowerCase());
    units.set(attributes.id, measures.length === 1 && measures[0] === 'iso4217:usd');
  }

  const contexts = new Map();
  const seenContextIds = new Set();
  for (const match of html.matchAll(
    /<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi,
  )) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.id || seenContextIds.has(attributes.id)) {
      malformed = true;
      continue;
    }
    seenContextIds.add(attributes.id);
    const body = match[2];
    // The DEI identity validates the document, not every context. An official
    // filing can include facts about another entity; those facts must never
    // be attributed to this issuer merely because their periods line up.
    const entities = [...body.matchAll(/<xbrli:entity\b[^>]*>([\s\S]*?)<\/xbrli:entity>/gi)];
    if (entities.length !== 1) continue;
    const identifiers = [...entities[0][1].matchAll(
      /<xbrli:identifier\b([^>]*)>([^<]+)<\/xbrli:identifier>/gi,
    )];
    if (identifiers.length !== 1
      || parseAttributes(identifiers[0][1]).scheme !== 'http://www.sec.gov/CIK'
      || normalizeCik(htmlToText(identifiers[0][2])) !== filingCik) continue;
    const start = normalizeDate(elementText(body, 'xbrli:startDate'));
    const end = normalizeDate(
      elementText(body, 'xbrli:endDate') || elementText(body, 'xbrli:instant'),
    );
    const members = {};
    // Typed dimensions are valid XBRL, but this conservative fallback cannot
    // prove their labels or reconciliation semantics. Ignore only those
    // contexts instead of rejecting an otherwise usable official filing.
    let unsupportedContext = /<xbrldi:typedMember\b/i.test(body);
    for (const memberMatch of body.matchAll(
      /<xbrldi:explicitMember\b([^>]*)>([\s\S]*?)<\/xbrldi:explicitMember>/gi,
    )) {
      const memberAttributes = parseAttributes(memberMatch[1]);
      const dimension = String(memberAttributes.dimension || '').trim();
      const member = htmlToText(memberMatch[2]);
      if (!dimension || !member || Object.hasOwn(members, dimension)) {
        unsupportedContext = true;
        break;
      }
      members[dimension] = member;
    }
    if (unsupportedContext) continue;
    if (end) contexts.set(attributes.id, { start, end, members });
  }

  const numericFacts = [];
  for (const match of html.matchAll(
    /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi,
  )) {
    const attributes = parseAttributes(match[1]);
    const concept = NUMERIC_CONCEPT_BY_LOWER_NAME.get(
      String(attributes.name || '').toLowerCase(),
    );
    if (!concept
      || !attributes.contextref
      || attributes['xsi:nil'] === 'true'
      || units.get(attributes.unitref) !== true) {
      continue;
    }
    const value = parseInlineNumber(match[2], attributes);
    if (!Number.isSafeInteger(value)) continue;
    numericFacts.push({
      concept,
      contextRef: attributes.contextref,
      value,
    });
  }

  const nonNumericFacts = [];
  for (const match of html.matchAll(
    /<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi,
  )) {
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

function uniqueIdentityFact(document, concept) {
  const values = new Set(document.nonNumericFacts
    .filter((fact) => fact.concept.toLowerCase() === concept.toLowerCase())
    .map((fact) => fact.value)
    .filter(Boolean));
  return values.size === 1 ? values.values().next().value : '';
}

function uniqueFiscalYear(document) {
  const value = uniqueIdentityFact(document, 'dei:DocumentFiscalYearFocus');
  return /^(?:19|20|21)\d{2}$/.test(value) ? value : '';
}

function uniqueFiscalPeriod(document) {
  const value = uniqueIdentityFact(document, 'dei:DocumentFiscalPeriodFocus').toUpperCase();
  return /^Q[1-4]$/.test(value) ? value : '';
}

function parseInlineNumber(innerHtml, attributes) {
  const rawText = htmlToText(innerHtml)
    .replace(/[$,\s]/g, '')
    .replace(/−/g, '-');
  if (!rawText || rawText === '—' || rawText === '-') return null;
  const parenthesized = rawText.startsWith('(') && rawText.endsWith(')');
  const rawNumber = Number(rawText.replace(/[()]/g, ''));
  const scale = Number(attributes.scale || 0);
  if (!Number.isFinite(rawNumber) || !Number.isInteger(scale) || Math.abs(scale) > 20) {
    return null;
  }
  let value = rawNumber * (10 ** scale);
  if (attributes.sign === '-' || parenthesized) value *= -1;
  return Number.isSafeInteger(value) ? value : null;
}

function membersEqual(actual = {}, expected = {}) {
  return serializeMembers(actual) === serializeMembers(expected);
}

function serializeMembers(members = {}) {
  return JSON.stringify(
    Object.entries(members).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function samePeriod(context, period) {
  return context.start === period.start && context.end === period.end;
}

function isQuarterDuration(start, end) {
  const duration = daysBetween(start, end);
  return duration >= MIN_QUARTER_DAYS && duration <= MAX_QUARTER_DAYS;
}

function daysBetween(start, end) {
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  return Number.isFinite(startTime) && Number.isFinite(endTime)
    ? Math.round((endTime - startTime) / DAY_MS)
    : Number.NaN;
}

function normalizeSymbol(symbol) {
  const normalized = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\.US$/, '');
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(normalized) ? normalized : '';
}

function normalizeForm(form) {
  return String(form || '').trim().toUpperCase();
}

function normalizeCik(value) {
  const digits = String(value || '').trim();
  if (!/^\d{1,10}$/.test(digits)) return '';
  const significant = digits.replace(/^0+/, '') || '0';
  return significant === '0' ? '' : significant.padStart(10, '0');
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return exactDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const named = raw.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (named) {
    const month = monthNames.indexOf(named[1].toLowerCase()) + 1;
    return month ? exactDate(Number(named[3]), month, Number(named[2])) : '';
  }

  const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return numeric
    ? exactDate(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]))
    : '';
}

function exactDate(year, month, day) {
  if (!Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || year < 1900
    || year > 2200
    || month < 1
    || month > 12
    || day < 1
    || day > 31) {
    return '';
  }
  const normalized = [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
  const exact = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return exact === normalized ? normalized : '';
}

function humanizeQName(value) {
  const localName = String(value || '').split(':').at(-1) || '';
  return localName
    .replace(/Member$/, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function qnameId(value) {
  return humanizeQName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function completeSection(items, extra = {}) {
  return {
    status: 'complete',
    reason: null,
    items,
    ...extra,
  };
}

function ambiguousSection(reason) {
  return { status: 'ambiguous', reason, items: [] };
}

function unavailableSection(reason = 'ambiguous-or-missing-xbrl-facts') {
  return {
    status: 'unavailable',
    reason,
    items: [],
  };
}

function parseAttributes(source) {
  const output = {};
  for (const match of String(source || '').matchAll(
    /([\w:-]+)\s*=\s*["']([^"']*)["']/g,
  )) {
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

function safeText(value, maxLength = 180) {
  return String(value || '').trim().slice(0, maxLength);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
