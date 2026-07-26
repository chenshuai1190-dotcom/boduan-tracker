import { fetchSecCompanyFactsSource } from './secOfficialActuals.js';

export const SEC_FINANCIAL_HISTORY_SCHEMA_VERSION = 3;

const ANNUAL_LIMIT = 6;
const QUARTERLY_LIMIT = 8;
const ANNUAL_MIN_DAYS = 330;
const ANNUAL_MAX_DAYS = 385;
const QUARTER_MIN_DAYS = 70;
const QUARTER_MAX_DAYS = 110;
const NINE_MONTH_MIN_DAYS = 240;
const NINE_MONTH_MAX_DAYS = 310;
const CURRENT_PERIOD_MAX_FILING_LAG_DAYS = 180;
const SYMBOL_RE = /^[A-Z0-9.-]{1,15}$/;
const ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const VERIFIED_REVENUE_CONCEPT_MIGRATIONS = new Map([
  ['0001652044', [{
    from: 'RevenueFromContractWithCustomerExcludingAssessedTax',
    to: 'Revenues',
  }]],
]);
const REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
  'RevenuesNetOfInterestExpense',
];
const NET_INCOME_CONCEPTS = [
  'NetIncomeLoss',
  'ProfitLoss',
  'NetIncomeLossAvailableToCommonStockholdersBasic',
  'NetIncomeLossAttributableToParent',
];

export async function fetchSecFinancialHistory({
  symbol,
  fetchFn = globalThis.fetch,
  userAgent,
  now = new Date(),
  requestIntervalMs,
  batchTimeoutMs,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedNow = normalizeDate(now);
  if (!SYMBOL_RE.test(normalizedSymbol) || !normalizedNow) {
    return emptyResponse({
      symbol: normalizedSymbol,
      reason: 'invalid-sec-financial-history-request',
    });
  }

  const official = await fetchSecCompanyFactsSource({
    symbol: normalizedSymbol,
    fetchFn,
    userAgent,
    now: normalizedNow,
    requestIntervalMs,
    batchTimeoutMs,
  });
  if (official.status !== 'complete') {
    return emptyResponse({
      symbol: normalizedSymbol,
      cik: official.cik,
      reason: official.reason || 'official-history-unavailable',
    });
  }

  return buildSecFinancialHistory(official.companyFacts, {
    symbol: normalizedSymbol,
    cik: official.cik,
    asOfDate: normalizedNow.toISOString().slice(0, 10),
  });
}

export function buildSecFinancialHistory(companyFacts, {
  symbol,
  cik,
  asOfDate,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const requestedCik = normalizeCik(cik);
  const factsCik = normalizeCik(companyFacts?.cik);
  const cutoffDate = validDateKey(asOfDate) || '9999-12-31';
  if (!SYMBOL_RE.test(normalizedSymbol)
    || !companyFacts
    || typeof companyFacts !== 'object'
    || Array.isArray(companyFacts)
    || !factsCik
    || (requestedCik && requestedCik !== factsCik)) {
    return emptyResponse({
      symbol: normalizedSymbol,
      cik: requestedCik || factsCik,
      reason: requestedCik && factsCik && requestedCik !== factsCik
        ? 'sec-company-facts-cik-mismatch'
        : 'invalid-sec-company-facts',
    });
  }

  const models = financialModels(companyFacts, cutoffDate, factsCik);
  const selected = selectFinancialModel(models);
  if (!selected) {
    return emptyResponse({
      symbol: normalizedSymbol,
      cik: factsCik,
      entityName: safeText(companyFacts.entityName, 160),
      reason: 'official-history-unavailable',
    });
  }

  const annualWithMetrics = addAnnualMetrics(selected.annual);
  const quarterlyWithMetrics = addQuarterlyMetrics(selected.quarterly);
  const annual = annualWithMetrics.slice(-ANNUAL_LIMIT);
  const quarterly = quarterlyWithMetrics.slice(-QUARTERLY_LIMIT);
  const complete = annual.length === ANNUAL_LIMIT
    && quarterly.length === QUARTERLY_LIMIT
    && isConsecutiveAnnualWindow(annual)
    && isConsecutiveQuarterWindow(quarterly);

  return {
    schemaVersion: SEC_FINANCIAL_HISTORY_SCHEMA_VERSION,
    status: complete ? 'complete' : 'partial',
    reason: complete ? null : 'incomplete-official-history',
    symbol: normalizedSymbol,
    currency: selected.currency,
    source: {
      provider: 'SEC',
      cik: factsCik,
      entityName: safeText(companyFacts.entityName, 160),
      revenueConcept: selected.revenueConcept,
      netIncomeConcept: selected.netIncomeConcept,
      ...(selected.revenueConcepts.length > 1
        ? { revenueConcepts: selected.revenueConcepts }
        : {}),
    },
    annual,
    quarterly,
  };
}

function financialModels(companyFacts, cutoffDate, companyCik) {
  const usGaap = companyFacts?.facts?.['us-gaap'];
  if (!usGaap || typeof usGaap !== 'object') return [];
  const models = [];

  REVENUE_CONCEPTS.forEach((revenueConcept, revenuePriority) => {
    const revenueUnits = conceptCurrencyEntries(usGaap?.[revenueConcept]);
    if (revenueUnits.size === 0) return;
    NET_INCOME_CONCEPTS.forEach((netIncomeConcept, netIncomePriority) => {
      const netIncomeUnits = conceptCurrencyEntries(usGaap?.[netIncomeConcept]);
      for (const [currency, revenueEntries] of revenueUnits) {
        const netIncomeEntries = netIncomeUnits.get(currency);
        if (!netIncomeEntries) continue;
        const pairs = pairFacts({
          revenueEntries,
          netIncomeEntries,
          currency,
          cutoffDate,
        });
        const annualEvidencePairs = selectOriginalPeriods(
          pairs.filter(isAnnualPair),
        );
        const discreteQuarterEvidencePairs = selectOriginalPeriods(
          pairs.filter(isDiscreteQuarterPair),
        );
        const nineMonthEvidencePairs = selectOriginalPeriods(
          pairs.filter(isNineMonthPair),
        );
        // Annual rows are keyed by their actual period end, so later
        // comparative filings cannot relabel them as a newer fiscal year.
        const annualPairs = annualEvidencePairs;
        const discreteQuarters = discreteQuarterEvidencePairs
          .filter(isCurrentPeriodPair);
        const nineMonthPairs = nineMonthEvidencePairs.filter(isCurrentPeriodPair);
        const derivedQ4 = deriveFourthQuarters(annualPairs, nineMonthPairs);
        const derivedQ4Evidence = deriveFourthQuarters(
          annualEvidencePairs,
          nineMonthEvidencePairs,
        );
        const quarterlyPairs = selectUniqueQuarterRows([
          ...discreteQuarters.map(toQuarterRow),
          ...derivedQ4,
        ]);
        const annualRows = selectUniqueAnnualRows(
          annualPairs.map(toAnnualRow),
        );
        const quarterlyEvidence = selectUniqueEvidenceRows([
          ...discreteQuarterEvidencePairs.map(toQuarterRow),
          ...derivedQ4Evidence,
        ]);
        const annualEvidence = selectUniqueEvidenceRows(
          annualEvidencePairs.map(toAnnualRow),
        );
        if (annualRows.length === 0 && quarterlyPairs.length === 0) continue;
        models.push(createFinancialModel({
          currency,
          revenueConcept,
          revenueConcepts: [revenueConcept],
          netIncomeConcept,
          annual: annualRows,
          quarterly: quarterlyPairs,
          annualEvidence,
          quarterlyEvidence,
          currencyPriority: currency === 'USD' ? 0 : 1,
          revenuePriority,
          netIncomePriority,
        }));
      }
    });
  });
  return [
    ...models,
    ...buildVerifiedRevenueMigrationModels(models, companyCik),
  ];
}

function createFinancialModel({
  currency,
  revenueConcept,
  revenueConcepts,
  netIncomeConcept,
  annual,
  quarterly,
  annualEvidence,
  quarterlyEvidence,
  currencyPriority,
  revenuePriority,
  netIncomePriority,
}) {
  const annualRows = [...annual].sort(comparePeriods);
  const quarterlyRows = [...quarterly].sort(comparePeriods);
  const annualWindow = annualRows.slice(-ANNUAL_LIMIT);
  const quarterlyWindow = quarterlyRows.slice(-QUARTERLY_LIMIT);
  const latestAnnualEndDate = latestPeriodEndDate(annualRows);
  const latestQuarterEndDate = latestPeriodEndDate(quarterlyRows);
  return {
    currency,
    revenueConcept,
    revenueConcepts: Array.from(new Set(revenueConcepts || [revenueConcept])),
    netIncomeConcept,
    annual: annualRows,
    quarterly: quarterlyRows,
    annualEvidence: [...(annualEvidence || annualRows)].sort(comparePeriods),
    quarterlyEvidence: [...(quarterlyEvidence || quarterlyRows)].sort(comparePeriods),
    score: Math.min(annualRows.length, ANNUAL_LIMIT)
      + Math.min(quarterlyRows.length, QUARTERLY_LIMIT),
    annualScore: Math.min(annualRows.length, ANNUAL_LIMIT),
    quarterlyScore: Math.min(quarterlyRows.length, QUARTERLY_LIMIT),
    completeWindow: annualWindow.length === ANNUAL_LIMIT
      && quarterlyWindow.length === QUARTERLY_LIMIT
      && isConsecutiveAnnualWindow(annualWindow)
      && isConsecutiveQuarterWindow(quarterlyWindow),
    latestAnnualEndDate,
    latestQuarterEndDate,
    latestEndDate: latestAnnualEndDate > latestQuarterEndDate
      ? latestAnnualEndDate
      : latestQuarterEndDate,
    currencyPriority,
    revenuePriority,
    netIncomePriority,
  };
}

function buildVerifiedRevenueMigrationModels(models, companyCik) {
  const output = [];
  const migrations = VERIFIED_REVENUE_CONCEPT_MIGRATIONS.get(companyCik) || [];
  for (const migration of migrations) {
    const fromModels = models.filter(
      (model) => model.revenueConcept === migration.from,
    );
    const toModels = models.filter(
      (model) => model.revenueConcept === migration.to,
    );
    for (const fromModel of fromModels) {
      for (const toModel of toModels) {
        if (fromModel.currency !== toModel.currency
          || fromModel.netIncomeConcept !== toModel.netIncomeConcept
          || compareModelFreshness(toModel, fromModel) <= 0) {
          continue;
        }

        const annualOverlap = compareModelOverlap(
          fromModel.annualEvidence,
          toModel.annualEvidence,
        );
        const quarterlyOverlap = compareModelOverlap(
          fromModel.quarterlyEvidence,
          toModel.quarterlyEvidence,
        );
        if (!annualOverlap.valid
          || !quarterlyOverlap.valid
          || annualOverlap.count < 1
          || quarterlyOverlap.count < 2) {
          continue;
        }

        const annual = mergeCompatiblePeriodRows(
          fromModel.annual,
          toModel.annual,
        );
        const quarterly = mergeCompatiblePeriodRows(
          fromModel.quarterly,
          toModel.quarterly,
        );
        const annualEvidence = mergeCompatiblePeriodRows(
          fromModel.annualEvidence,
          toModel.annualEvidence,
        );
        const quarterlyEvidence = mergeCompatiblePeriodRows(
          fromModel.quarterlyEvidence,
          toModel.quarterlyEvidence,
        );
        if (!annual || !quarterly || !annualEvidence || !quarterlyEvidence) {
          continue;
        }

        if (samePeriodCoverage(annual, toModel.annual)
          && samePeriodCoverage(quarterly, toModel.quarterly)) {
          continue;
        }

        output.push(createFinancialModel({
          currency: toModel.currency,
          revenueConcept: toModel.revenueConcept,
          revenueConcepts: [migration.from, migration.to],
          netIncomeConcept: toModel.netIncomeConcept,
          annual: selectUniqueAnnualRows(annual),
          quarterly: selectUniqueQuarterRows(quarterly),
          annualEvidence: selectUniqueEvidenceRows(annualEvidence),
          quarterlyEvidence: selectUniqueEvidenceRows(quarterlyEvidence),
          currencyPriority: toModel.currencyPriority,
          revenuePriority: toModel.revenuePriority,
          netIncomePriority: toModel.netIncomePriority,
        }));
      }
    }
  }
  return output;
}

function compareModelOverlap(leftRows, rightRows) {
  const leftByPeriod = indexRowsByActualPeriod(leftRows);
  const rightByPeriod = indexRowsByActualPeriod(rightRows);
  if (!leftByPeriod || !rightByPeriod) return { valid: false, count: 0 };
  let count = 0;
  for (const [key, left] of leftByPeriod) {
    const right = rightByPeriod.get(key);
    if (!right) continue;
    count += 1;
    if (!sameReportedAmounts(left, right)) {
      return { valid: false, count };
    }
  }
  return { valid: true, count };
}

function mergeCompatiblePeriodRows(leftRows, rightRows) {
  const merged = indexRowsByActualPeriod(leftRows);
  const rightByPeriod = indexRowsByActualPeriod(rightRows);
  if (!merged || !rightByPeriod) return null;
  for (const [key, right] of rightByPeriod) {
    const left = merged.get(key);
    if (!left) {
      merged.set(key, right);
      continue;
    }
    if (!sameReportedAmounts(left, right)) return null;
    merged.set(key, preferredOriginalPeriod(left, right));
  }
  return Array.from(merged.values()).sort(comparePeriods);
}

function indexRowsByActualPeriod(rows) {
  const output = new Map();
  for (const row of rows) {
    const key = actualPeriodKey(row);
    const current = output.get(key);
    if (!current) {
      output.set(key, row);
      continue;
    }
    if (!sameReportedAmounts(current, row)) return null;
    output.set(key, preferredOriginalPeriod(current, row));
  }
  return output;
}

function actualPeriodKey(row) {
  return [
    row.fiscalQuarter,
    row.startDate,
    row.endDate,
  ].join('|');
}

function sameReportedAmounts(left, right) {
  return left.startDate === right.startDate
    && left.endDate === right.endDate
    && left.fiscalQuarter === right.fiscalQuarter
    && left.revenue === right.revenue
    && left.netIncome === right.netIncome;
}

function preferredOriginalPeriod(left, right) {
  return left.filedDate < right.filedDate
    ? left
    : right.filedDate < left.filedDate
      ? right
      : left.accession <= right.accession
        ? left
        : right;
}

function samePeriodCoverage(leftRows, rightRows) {
  if (leftRows.length !== rightRows.length) return false;
  const rightKeys = new Set(rightRows.map(actualPeriodKey));
  return leftRows.every((row) => rightKeys.has(actualPeriodKey(row)));
}

function latestPeriodEndDate(rows) {
  return rows.at(-1)?.endDate || '';
}

function compareModelFreshness(left, right) {
  return left.latestEndDate.localeCompare(right.latestEndDate)
    || left.latestQuarterEndDate.localeCompare(right.latestQuarterEndDate)
    || left.latestAnnualEndDate.localeCompare(right.latestAnnualEndDate);
}

function selectFinancialModel(models) {
  return [...models].sort((left, right) => (
    right.latestEndDate.localeCompare(left.latestEndDate)
    || right.latestQuarterEndDate.localeCompare(left.latestQuarterEndDate)
    || right.latestAnnualEndDate.localeCompare(left.latestAnnualEndDate)
    || Number(right.completeWindow) - Number(left.completeWindow)
    || right.score - left.score
    || right.annualScore - left.annualScore
    || right.quarterlyScore - left.quarterlyScore
    || left.currencyPriority - right.currencyPriority
    || left.revenuePriority - right.revenuePriority
    || left.netIncomePriority - right.netIncomePriority
    || left.currency.localeCompare(right.currency)
  ))[0] || null;
}

function conceptCurrencyEntries(concept) {
  const output = new Map();
  const units = concept?.units;
  if (!units || typeof units !== 'object') return output;
  for (const [rawCurrency, entries] of Object.entries(units)) {
    const currency = String(rawCurrency || '').trim().toUpperCase();
    if (!CURRENCY_RE.test(currency) || !Array.isArray(entries)) continue;
    output.set(currency, entries);
  }
  return output;
}

function pairFacts({
  revenueEntries,
  netIncomeEntries,
  currency,
  cutoffDate,
}) {
  const revenueByIdentity = uniqueFactsByIdentity(
    revenueEntries,
    currency,
    cutoffDate,
  );
  const netIncomeByIdentity = uniqueFactsByIdentity(
    netIncomeEntries,
    currency,
    cutoffDate,
  );
  const pairs = [];
  for (const [identity, revenue] of revenueByIdentity) {
    const netIncome = netIncomeByIdentity.get(identity);
    if (!netIncome || !(revenue.value > 0)) continue;
    if (revenue.frame && netIncome.frame && revenue.frame !== netIncome.frame) {
      continue;
    }
    pairs.push({
      currency,
      startDate: revenue.startDate,
      endDate: revenue.endDate,
      filedDate: revenue.filedDate,
      form: revenue.form,
      accession: revenue.accession,
      fiscalYearNumber: revenue.fiscalYearNumber,
      fiscalPeriod: revenue.fiscalPeriod,
      frame: revenue.frame || netIncome.frame,
      revenue: revenue.value,
      netIncome: netIncome.value,
    });
  }
  return classifyPeriodRoles(pairs);
}

function uniqueFactsByIdentity(entries, currency, cutoffDate) {
  const candidates = new Map();
  for (const raw of entries || []) {
    const fact = normalizeFact(raw, currency, cutoffDate);
    if (!fact) continue;
    const identity = factIdentity(fact);
    const current = candidates.get(identity);
    if (!current) {
      candidates.set(identity, { fact, ambiguous: false });
    } else if (current.fact.value !== fact.value) {
      current.ambiguous = true;
    }
  }
  return new Map(
    Array.from(candidates.entries())
      .filter(([, value]) => !value.ambiguous)
      .map(([identity, value]) => [identity, value.fact]),
  );
}

function normalizeFact(raw, currency, cutoffDate) {
  if (!raw || typeof raw !== 'object') return null;
  const startDate = validDateKey(raw.start);
  const endDate = validDateKey(raw.end);
  const filedDate = validDateKey(raw.filed);
  const accession = String(raw.accn || '').trim();
  const form = String(raw.form || '').trim().toUpperCase();
  const fiscalPeriod = String(raw.fp || '').trim().toUpperCase();
  const fiscalYearNumber = integerOrNull(raw.fy);
  const frame = normalizeDurationFrame(raw.frame);
  const value = finiteOrNull(raw.val);
  if (!startDate
    || !endDate
    || startDate >= endDate
    || !filedDate
    || filedDate < endDate
    || filedDate > cutoffDate
    || !ACCESSION_RE.test(accession)
    || !/^(?:10-Q|10-K)(?:\/A)?$/.test(form)
    || !/^(?:FY|Q[1-3])$/.test(fiscalPeriod)
    || value === null) {
    return null;
  }
  return {
    currency,
    startDate,
    endDate,
    filedDate,
    accession,
    form,
    fiscalPeriod,
    fiscalYearNumber,
    frame,
    value,
  };
}

function classifyPeriodRoles(pairs) {
  const latestEndByFilingPeriod = new Map();
  for (const pair of pairs) {
    const key = filingPeriodKey(pair);
    const current = latestEndByFilingPeriod.get(key);
    if (!current || pair.endDate > current) {
      latestEndByFilingPeriod.set(key, pair.endDate);
    }
  }
  return pairs.map((pair) => ({
    ...pair,
    periodRole: classifyPeriodRole(
      pair,
      latestEndByFilingPeriod.get(filingPeriodKey(pair)),
    ),
  }));
}

function classifyPeriodRole(pair, latestEndDate) {
  if (!latestEndDate || pair.endDate !== latestEndDate) return 'comparative';
  const filingLag = daysBetween(pair.endDate, pair.filedDate);
  return filingLag <= CURRENT_PERIOD_MAX_FILING_LAG_DAYS
    ? 'current'
    : 'unverified';
}

function filingPeriodKey(pair) {
  return [
    pair.accession,
    pair.form,
    pair.fiscalYearNumber ?? '',
    pair.fiscalPeriod,
    periodDurationClass(pair),
  ].join('|');
}

function periodDurationClass(pair) {
  const duration = daysBetween(pair.startDate, pair.endDate);
  if (duration >= ANNUAL_MIN_DAYS && duration <= ANNUAL_MAX_DAYS) {
    return 'annual';
  }
  if (duration >= NINE_MONTH_MIN_DAYS && duration <= NINE_MONTH_MAX_DAYS) {
    return 'nine-month';
  }
  if (duration >= QUARTER_MIN_DAYS && duration <= QUARTER_MAX_DAYS) {
    return 'quarter';
  }
  return 'other';
}

function resolvedQuarterFiscalYear(pair) {
  return pair.fiscalYearNumber || Number(pair.endDate.slice(0, 4));
}

function normalizeDurationFrame(value) {
  const frame = String(value || '').trim().toUpperCase();
  return /^CY\d{4}(?:Q[1-4])?$/.test(frame) ? frame : '';
}

function factIdentity(fact) {
  return [
    fact.currency,
    fact.startDate,
    fact.endDate,
    fact.filedDate,
    fact.accession,
    fact.form,
    fact.fiscalPeriod,
    fact.fiscalYearNumber ?? '',
  ].join('|');
}

function isAnnualPair(pair) {
  const duration = daysBetween(pair.startDate, pair.endDate);
  return /^10-K(?:\/A)?$/.test(pair.form)
    && pair.fiscalPeriod === 'FY'
    && duration >= ANNUAL_MIN_DAYS
    && duration <= ANNUAL_MAX_DAYS;
}

function isDiscreteQuarterPair(pair) {
  const duration = daysBetween(pair.startDate, pair.endDate);
  return /^10-Q(?:\/A)?$/.test(pair.form)
    && /^Q[1-3]$/.test(pair.fiscalPeriod)
    && duration >= QUARTER_MIN_DAYS
    && duration <= QUARTER_MAX_DAYS;
}

function isNineMonthPair(pair) {
  const duration = daysBetween(pair.startDate, pair.endDate);
  return /^10-Q(?:\/A)?$/.test(pair.form)
    && pair.fiscalPeriod === 'Q3'
    && duration >= NINE_MONTH_MIN_DAYS
    && duration <= NINE_MONTH_MAX_DAYS;
}

function selectOriginalPeriods(pairs) {
  const byPeriod = new Map();
  for (const pair of pairs) {
    const key = `${pair.startDate}|${pair.endDate}`;
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key).push(pair);
  }
  const output = [];
  for (const candidates of byPeriod.values()) {
    const ordered = [...candidates].sort((left, right) => (
      left.filedDate.localeCompare(right.filedDate)
      || left.accession.localeCompare(right.accession)
    ));
    const originalFiscalYear = ordered[0]?.fiscalYearNumber;
    const sameFiscalYear = ordered.filter(
      (candidate) => candidate.fiscalYearNumber === originalFiscalYear,
    );
    const selected = sameFiscalYear.sort((left, right) => (
      periodRolePriority(right.periodRole) - periodRolePriority(left.periodRole)
      || right.filedDate.localeCompare(left.filedDate)
      || amendmentPriority(right.form) - amendmentPriority(left.form)
      || right.accession.localeCompare(left.accession)
    ))[0];
    if (selected) output.push(selected);
  }
  return output.sort(comparePeriods);
}

function amendmentPriority(form) {
  return String(form || '').endsWith('/A') ? 1 : 0;
}

function periodRolePriority(value) {
  if (value === 'current') return 2;
  if (value === 'comparative') return 1;
  return 0;
}

function isCurrentPeriodPair(pair) {
  return pair?.periodRole === 'current';
}

function toAnnualRow(pair) {
  const fiscalYear = Number(pair.endDate.slice(0, 4));
  return basePeriodRow(pair, {
    fiscalYear: `FY${fiscalYear}`,
    fiscalQuarter: 'FY',
    derived: false,
  });
}

function toQuarterRow(pair) {
  const fiscalYear = resolvedQuarterFiscalYear(pair);
  return basePeriodRow(pair, {
    fiscalYear: `FY${fiscalYear}`,
    fiscalQuarter: pair.fiscalPeriod,
    derived: false,
  });
}

function selectUniqueEvidenceRows(rows) {
  const indexed = indexRowsByActualPeriod(rows);
  return indexed ? Array.from(indexed.values()).sort(comparePeriods) : [];
}

function deriveFourthQuarters(annualPairs, nineMonthPairs) {
  const output = [];
  for (const annual of annualPairs) {
    const candidates = nineMonthPairs
      .filter((nineMonths) => (
        nineMonths.startDate === annual.startDate
        && nineMonths.endDate < annual.endDate
        && nineMonths.filedDate < annual.filedDate
        && daysBetween(nineMonths.endDate, annual.endDate) >= QUARTER_MIN_DAYS
        && daysBetween(nineMonths.endDate, annual.endDate) <= QUARTER_MAX_DAYS
      ))
      .sort((left, right) => right.endDate.localeCompare(left.endDate));
    if (candidates.length !== 1) continue;
    const nineMonths = candidates[0];
    const startDate = addDays(nineMonths.endDate, 1);
    const revenue = annual.revenue - nineMonths.revenue;
    const netIncome = annual.netIncome - nineMonths.netIncome;
    if (!(revenue > 0)
      || !Number.isFinite(netIncome)
      || daysBetween(startDate, annual.endDate) < QUARTER_MIN_DAYS
      || daysBetween(startDate, annual.endDate) > QUARTER_MAX_DAYS) {
      continue;
    }
    const fiscalYear = Number(annual.endDate.slice(0, 4));
    output.push(basePeriodRow({
      ...annual,
      startDate,
      revenue,
      netIncome,
    }, {
      fiscalYear: `FY${fiscalYear}`,
      fiscalQuarter: 'Q4',
      derived: true,
      derivedFrom: {
        annualAccession: annual.accession,
        nineMonthAccession: nineMonths.accession,
      },
    }));
  }
  return output;
}

function selectUniqueQuarterRows(rows) {
  const byFiscalQuarter = new Map();
  for (const row of rows) {
    const key = `${row.fiscalYear}|${row.fiscalQuarter}`;
    if (byFiscalQuarter.has(key) && byFiscalQuarter.get(key) === null) continue;
    const current = byFiscalQuarter.get(key);
    if (!current) {
      byFiscalQuarter.set(key, row);
      continue;
    }
    if (row.startDate === current.startDate && row.endDate === current.endDate) {
      if (row.filedDate > current.filedDate) byFiscalQuarter.set(key, row);
      continue;
    }
    if (row.accession === current.accession
      && row.filedDate === current.filedDate
      && row.form === current.form) {
      if (row.endDate > current.endDate) byFiscalQuarter.set(key, row);
      continue;
    }
    byFiscalQuarter.set(key, null);
  }
  return Array.from(byFiscalQuarter.values()).filter(Boolean).sort(comparePeriods);
}

function selectUniqueAnnualRows(rows) {
  const byFiscalYear = new Map();
  for (const row of rows) {
    const current = byFiscalYear.get(row.fiscalYear);
    if (!current || row.filedDate > current.filedDate) {
      byFiscalYear.set(row.fiscalYear, row);
    }
  }
  return Array.from(byFiscalYear.values()).sort(comparePeriods);
}

function basePeriodRow(pair, {
  fiscalYear,
  fiscalQuarter,
  derived,
  derivedFrom,
}) {
  return {
    fiscalYear,
    fiscalQuarter,
    startDate: pair.startDate,
    endDate: pair.endDate,
    filedDate: pair.filedDate,
    form: pair.form,
    accession: pair.accession,
    revenue: pair.revenue,
    netIncome: pair.netIncome,
    netMarginPct: percentRatio(pair.netIncome, pair.revenue),
    revenueYoyPct: null,
    netIncomeYoyPct: null,
    netMarginChangePpt: null,
    revenueQoqPct: null,
    derived,
    ...(derivedFrom ? { derivedFrom } : {}),
  };
}

function addAnnualMetrics(rows) {
  const byFiscalYear = new Map(rows.map((row) => [fiscalYearNumber(row), row]));
  return rows.map((row) => {
    const previous = byFiscalYear.get(fiscalYearNumber(row) - 1);
    return {
      ...row,
      revenueYoyPct: positivePercentChange(row.revenue, previous?.revenue),
      netIncomeYoyPct: positivePercentChange(row.netIncome, previous?.netIncome),
      netMarginChangePpt: marginChange(row, previous),
    };
  });
}

function addQuarterlyMetrics(rows) {
  const byFiscalQuarter = new Map(rows.map((row) => [
    `${fiscalYearNumber(row)}|${row.fiscalQuarter}`,
    row,
  ]));
  return rows.map((row) => {
    const fiscalYear = fiscalYearNumber(row);
    const previousYear = byFiscalQuarter.get(
      `${fiscalYear - 1}|${row.fiscalQuarter}`,
    );
    const previousQuarterKey = priorQuarterKey(fiscalYear, row.fiscalQuarter);
    const previousQuarter = previousQuarterKey
      ? byFiscalQuarter.get(previousQuarterKey)
      : null;
    return {
      ...row,
      revenueYoyPct: positivePercentChange(row.revenue, previousYear?.revenue),
      netIncomeYoyPct: positivePercentChange(row.netIncome, previousYear?.netIncome),
      netMarginChangePpt: marginChange(row, previousYear),
      revenueQoqPct: positivePercentChange(row.revenue, previousQuarter?.revenue),
    };
  });
}

function priorQuarterKey(fiscalYear, fiscalQuarter) {
  if (fiscalQuarter === 'Q1') return `${fiscalYear - 1}|Q4`;
  if (fiscalQuarter === 'Q2') return `${fiscalYear}|Q1`;
  if (fiscalQuarter === 'Q3') return `${fiscalYear}|Q2`;
  if (fiscalQuarter === 'Q4') return `${fiscalYear}|Q3`;
  return null;
}

function isConsecutiveAnnualWindow(rows) {
  return rows.every((row, index) => (
    index === 0
    || fiscalYearNumber(row) === fiscalYearNumber(rows[index - 1]) + 1
  ));
}

function isConsecutiveQuarterWindow(rows) {
  return rows.every((row, index) => {
    if (index === 0) return true;
    const previous = rows[index - 1];
    return priorQuarterKey(
      fiscalYearNumber(row),
      row.fiscalQuarter,
    ) === `${fiscalYearNumber(previous)}|${previous.fiscalQuarter}`;
  });
}

function marginChange(current, previous) {
  return Number.isFinite(current?.netMarginPct)
    && Number.isFinite(previous?.netMarginPct)
    ? current.netMarginPct - previous.netMarginPct
    : null;
}

function positivePercentChange(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0
    ? ((current / previous) - 1) * 100
    : null;
}

function percentRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? (numerator / denominator) * 100
    : null;
}

function comparePeriods(left, right) {
  return left.endDate.localeCompare(right.endDate)
    || left.startDate.localeCompare(right.startDate)
    || left.filedDate.localeCompare(right.filedDate);
}

function fiscalYearNumber(row) {
  const match = String(row?.fiscalYear || '').match(/^FY(\d{4})$/);
  return match ? Number(match[1]) : 0;
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.round((end - start) / 86_400_000)
    : Number.POSITIVE_INFINITY;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDateKey(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function normalizeCik(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits && digits.length <= 10 ? digits.padStart(10, '0') : '';
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1900 && number <= 9999
    ? number
    : null;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function emptyResponse({
  symbol,
  cik = '',
  entityName = '',
  reason,
}) {
  return {
    schemaVersion: SEC_FINANCIAL_HISTORY_SCHEMA_VERSION,
    status: 'unavailable',
    reason: reason || 'official-history-unavailable',
    symbol: normalizeSymbol(symbol),
    currency: '',
    source: {
      provider: 'SEC',
      cik: normalizeCik(cik),
      entityName: safeText(entityName, 160),
      revenueConcept: null,
      netIncomeConcept: null,
    },
    annual: [],
    quarterly: [],
  };
}
