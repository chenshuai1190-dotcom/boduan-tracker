import { fetchSecCompanyFactsSource } from './secOfficialActuals.js';

export const SEC_FINANCIAL_HISTORY_SCHEMA_VERSION = 1;

const ANNUAL_LIMIT = 6;
const QUARTERLY_LIMIT = 8;
const ANNUAL_MIN_DAYS = 330;
const ANNUAL_MAX_DAYS = 385;
const QUARTER_MIN_DAYS = 70;
const QUARTER_MAX_DAYS = 110;
const NINE_MONTH_MIN_DAYS = 240;
const NINE_MONTH_MAX_DAYS = 310;
const SYMBOL_RE = /^[A-Z0-9.-]{1,15}$/;
const ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
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

  const models = financialModels(companyFacts, cutoffDate);
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
    },
    annual,
    quarterly,
  };
}

function financialModels(companyFacts, cutoffDate) {
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
        const annualPairs = selectOriginalPeriods(
          pairs.filter(isAnnualPair),
        );
        const discreteQuarters = selectOriginalPeriods(
          pairs.filter(isDiscreteQuarterPair),
        );
        const nineMonthPairs = selectOriginalPeriods(
          pairs.filter(isNineMonthPair),
        );
        const derivedQ4 = deriveFourthQuarters(annualPairs, nineMonthPairs);
        const quarterlyPairs = selectUniqueQuarterRows([
          ...discreteQuarters.map(toQuarterRow),
          ...derivedQ4,
        ]);
        const annualRows = selectUniqueAnnualRows(
          annualPairs.map(toAnnualRow),
        );
        if (annualRows.length === 0 && quarterlyPairs.length === 0) continue;
        models.push({
          currency,
          revenueConcept,
          netIncomeConcept,
          annual: annualRows,
          quarterly: quarterlyPairs,
          score: Math.min(annualRows.length, ANNUAL_LIMIT)
            + Math.min(quarterlyPairs.length, QUARTERLY_LIMIT),
          annualScore: Math.min(annualRows.length, ANNUAL_LIMIT),
          quarterlyScore: Math.min(quarterlyPairs.length, QUARTERLY_LIMIT),
          currencyPriority: currency === 'USD' ? 0 : 1,
          revenuePriority,
          netIncomePriority,
        });
      }
    });
  });
  return models;
}

function selectFinancialModel(models) {
  return [...models].sort((left, right) => (
    right.score - left.score
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
    pairs.push({
      currency,
      startDate: revenue.startDate,
      endDate: revenue.endDate,
      filedDate: revenue.filedDate,
      form: revenue.form,
      accession: revenue.accession,
      fiscalYearNumber: revenue.fiscalYearNumber,
      fiscalPeriod: revenue.fiscalPeriod,
      revenue: revenue.value,
      netIncome: netIncome.value,
    });
  }
  return pairs;
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
    value,
  };
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
      right.filedDate.localeCompare(left.filedDate)
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

function toAnnualRow(pair) {
  const fiscalYear = Number(pair.endDate.slice(0, 4));
  return basePeriodRow(pair, {
    fiscalYear: `FY${fiscalYear}`,
    fiscalQuarter: 'FY',
    derived: false,
  });
}

function toQuarterRow(pair) {
  const fiscalYear = pair.fiscalYearNumber
    || Number(pair.endDate.slice(0, 4));
  return basePeriodRow(pair, {
    fiscalYear: `FY${fiscalYear}`,
    fiscalQuarter: pair.fiscalPeriod,
    derived: false,
  });
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
    const current = byFiscalQuarter.get(key);
    if (!current || row.filedDate > current.filedDate) {
      byFiscalQuarter.set(key, row);
    }
  }
  return Array.from(byFiscalQuarter.values()).sort(comparePeriods);
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
