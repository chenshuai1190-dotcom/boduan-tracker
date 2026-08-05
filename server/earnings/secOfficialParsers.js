const SUPPORTED_EXHIBIT_SYMBOLS = new Set([
  'AMD',
  'TSLA',
  'TSM',
  'GOOG',
  'GOOGL',
  'IBKR',
  'NOK',
]);

const TSMC_USD_TRANSLATION_BY_FISCAL_DATE = new Map([
  // Official TSMC quarter-weighted USD/NTD rates for the current and prior-year quarters.
  ['2026-06-30', {
    currentRate: 31.601,
    previousRate: 31.054,
  }],
]);

const REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'RevenuesNetOfInterestExpense',
  'SalesRevenueNet',
];

const OPERATING_INCOME_CONCEPTS = [
  'OperatingIncomeLoss',
];

const PRETAX_INCOME_CONCEPTS = [
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
];

const EPS_CONCEPTS = [
  'EarningsPerShareDiluted',
];

export function isSecExhibitActualSupportedEvent({ symbol, fiscalDate } = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!SUPPORTED_EXHIBIT_SYMBOLS.has(normalizedSymbol)) return false;
  if (normalizedSymbol === 'TSM') {
    return TSMC_USD_TRANSLATION_BY_FISCAL_DATE.has(dateKey(fiscalDate));
  }
  return true;
}

export function parseSecExhibitActuals({ symbol, fiscalDate, html }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  if (!SUPPORTED_EXHIBIT_SYMBOLS.has(normalizedSymbol) || !normalizedFiscalDate) return null;
  if (typeof html !== 'string' || html.length < 100) return null;

  if (normalizedSymbol === 'TSLA') {
    return parseTeslaExhibit(html, normalizedFiscalDate);
  }
  if (normalizedSymbol === 'AMD') {
    return parseAdvancedMicroDevicesExhibit(html, normalizedFiscalDate);
  }
  if (normalizedSymbol === 'TSM') {
    return parseTaiwanSemiconductorExhibit(html, normalizedFiscalDate);
  }
  if (normalizedSymbol === 'NOK') {
    return parseNokiaPrimaryDocument(html, normalizedFiscalDate);
  }
  if (normalizedSymbol === 'GOOG' || normalizedSymbol === 'GOOGL') {
    return parseAlphabetExhibit(html, normalizedFiscalDate);
  }
  if (normalizedSymbol === 'IBKR') {
    return parseInteractiveBrokersExhibit(html, normalizedFiscalDate);
  }
  return null;
}

export function parseSecCompanyFactsActuals({
  symbol,
  fiscalDate,
  companyFacts,
  accession = '',
  filedAt = '',
}) {
  const normalizedFiscalDate = dateKey(fiscalDate);
  if (!normalizedFiscalDate || !companyFacts || typeof companyFacts !== 'object') return null;

  const previousFiscalDate = previousYearDate(normalizedFiscalDate);
  const currentOptions = {
    end: normalizedFiscalDate,
    accession,
    filedAt,
  };
  const previousOptions = {
    end: previousFiscalDate,
    accession,
    filedAt,
    allowEarlierAccession: true,
    endToleranceDays: 7,
  };

  const financialServices = normalizeSymbol(symbol) === 'IBKR';
  const revenueConcepts = financialServices
    ? ['RevenuesNetOfInterestExpense']
    : REVENUE_CONCEPTS;
  const revenueCurrent = selectConceptFact(companyFacts, revenueConcepts, 'USD', currentOptions);
  const revenuePrevious = selectConceptFact(companyFacts, revenueConcepts, 'USD', previousOptions);
  const operatingCurrent = selectConceptFact(companyFacts, OPERATING_INCOME_CONCEPTS, 'USD', currentOptions);
  const operatingPrevious = selectConceptFact(companyFacts, OPERATING_INCOME_CONCEPTS, 'USD', previousOptions);
  const pretaxCurrent = selectConceptFact(companyFacts, PRETAX_INCOME_CONCEPTS, 'USD', currentOptions);
  const pretaxPrevious = selectConceptFact(companyFacts, PRETAX_INCOME_CONCEPTS, 'USD', previousOptions);
  const epsCurrent = selectConceptFact(companyFacts, EPS_CONCEPTS, 'USD/shares', currentOptions);
  const epsPrevious = selectConceptFact(companyFacts, EPS_CONCEPTS, 'USD/shares', previousOptions);

  const selectedCurrent = financialServices
    ? pretaxCurrent
    : operatingCurrent;
  const selectedPrevious = financialServices ? pretaxPrevious : operatingPrevious;
  const ebitPreviousYear = selectedPrevious?.value ?? null;
  const ebitActualBasis = selectedCurrent
    ? (financialServices ? 'incomeBeforeTax' : 'operatingIncome')
    : null;
  const fields = {
    symbol: normalizeSymbol(symbol),
    fiscalDate: normalizedFiscalDate,
    currency: 'USD',
    revenueActual: revenueCurrent?.value ?? null,
    revenuePreviousYear: revenuePrevious?.value ?? null,
    revenueActualBasis: revenueCurrent?.concept || null,
    ebitActual: selectedCurrent?.value ?? null,
    ebitPreviousYear,
    ebitActualBasis,
    epsActual: epsCurrent?.value ?? null,
    epsPreviousYear: epsPrevious?.value ?? null,
    epsActualBasis: epsCurrent?.concept || null,
  };

  return allActualFieldsComplete(fields) ? fields : null;
}

export function extractExhibit991Url(indexHtml, filingUrl) {
  return extractSecExhibitUrl(indexHtml, filingUrl, 'EX-99.1');
}

export function extractSecExhibitUrl(indexHtml, filingUrl, documentType) {
  if (typeof indexHtml !== 'string' || !filingUrl) return null;
  const normalizedType = String(documentType || '').trim().toUpperCase();
  if (!/^EX-99\.\d{1,2}$/.test(normalizedType)) return null;
  const typePattern = new RegExp(`\\b${escapeRegex(normalizedType)}\\b`, 'i');
  const rows = indexHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    if (!typePattern.test(htmlToText(row))) continue;
    const links = Array.from(row.matchAll(/href\s*=\s*["']([^"']+)["']/gi), (match) => match[1]);
    for (const href of links) {
      try {
        const resolved = new URL(href, filingUrl);
        if (!isSecArchiveUrl(resolved)) continue;
        if (!/\.html?$/i.test(resolved.pathname)) continue;
        return resolved.toString();
      } catch {
        // Ignore malformed filing links and keep looking.
      }
    }
  }
  return null;
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([\da-f]+);/gi, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;|&ensp;|&emsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTeslaExhibit(html, fiscalDate) {
  const text = htmlToText(html);
  if (!/Financial Summary/i.test(text) || !/\(\$ in millions,/i.test(text)) return null;
  const anchor = text.search(/Total (?:automotive )?revenues/i);
  if (anchor < 0) return null;
  const section = text.slice(Math.max(0, anchor - 500), anchor + 6000);
  const quarterLabels = Array.from(section.slice(0, 700).matchAll(/\bQ([1-4])-(\d{4})\b/gi), (match) => `Q${match[1]}-${match[2]}`);
  const uniqueQuarterLabels = [...new Set(quarterLabels)].slice(0, 5);
  if (uniqueQuarterLabels.length < 2) return null;

  const targetQuarter = quarterLabelForDate(fiscalDate);
  const previousQuarter = quarterLabelForDate(previousYearDate(fiscalDate));
  const currentIndex = uniqueQuarterLabels.indexOf(targetQuarter);
  const previousIndex = uniqueQuarterLabels.indexOf(previousQuarter);
  if (currentIndex < 0 || previousIndex < 0) return null;

  const revenue = extractSeries(section, 'Total revenues', uniqueQuarterLabels.length);
  const operatingIncome = extractSeries(section, 'Income from operations', uniqueQuarterLabels.length);
  const eps = extractSeries(
    section,
    'EPS attributable to common stockholders, diluted (GAAP)',
    uniqueQuarterLabels.length,
  );
  if (!revenue || !operatingIncome || !eps) return null;

  return completeActuals({
    fiscalDate,
    revenueActual: scaleMillions(revenue[currentIndex]),
    revenuePreviousYear: scaleMillions(revenue[previousIndex]),
    revenueActualBasis: 'totalRevenue',
    ebitActual: scaleMillions(operatingIncome[currentIndex]),
    ebitPreviousYear: scaleMillions(operatingIncome[previousIndex]),
    ebitActualBasis: 'operatingIncome',
    epsActual: eps[currentIndex],
    epsPreviousYear: eps[previousIndex],
    epsActualBasis: 'EarningsPerShareDiluted',
  });
}

function parseAdvancedMicroDevicesExhibit(html, fiscalDate) {
  const text = htmlToText(html);
  const gaapStart = text.search(/GAAP Quarterly Financial Results/i);
  const nonGaapStart = text.search(/Non-GAAP\(\*\) Quarterly Financial Results/i);
  if (!/(?:Advanced Micro Devices|AMD\s*\(NASDAQ\s*:\s*AMD\))/i.test(text)
    || gaapStart < 0
    || nonGaapStart <= gaapStart) {
    return null;
  }
  const officialFiscalDate = extractFirstThreeMonthsEndedDate(text);
  if (!officialFiscalDate || fiscalDateDistanceDays(officialFiscalDate, fiscalDate) > 7) return null;

  const section = text.slice(gaapStart, nonGaapStart);
  const revenue = extractFinancialSeries(section, 'Revenue ($M)', 2);
  const operatingIncome = extractFinancialSeries(section, 'Operating income ($M)', 2);
  const eps = extractFinancialSeries(section, 'Diluted earnings per share', 2);
  if (!revenue || !operatingIncome || !eps) return null;

  return completeActuals({
    fiscalDate: officialFiscalDate,
    revenueActual: scaleMillions(revenue[0]),
    revenuePreviousYear: scaleMillions(revenue[1]),
    revenueActualBasis: 'totalRevenue',
    ebitActual: scaleMillions(operatingIncome[0]),
    ebitPreviousYear: scaleMillions(operatingIncome[1]),
    ebitActualBasis: 'operatingIncome',
    epsActual: eps[0],
    epsPreviousYear: eps[1],
    epsActualBasis: 'EarningsPerShareDiluted',
  });
}

function parseTaiwanSemiconductorExhibit(html, fiscalDate) {
  const text = htmlToText(html);
  const translation = TSMC_USD_TRANSLATION_BY_FISCAL_DATE.get(fiscalDate);
  if (!translation) return null;
  if (!/TSMC Reports/i.test(text)
    || !/TWSE\s*:\s*2330,\s*NYSE\s*:\s*TSM/i.test(text)
    || !/TIFRS/i.test(text)
    || !containsFiscalQuarter(text, fiscalDate)) {
    return null;
  }

  const rows = extractTableRows(html);
  const revenue = numericValues(findFirstExactRow(rows, ['Net sales', 'Net revenue'], 2));
  const operatingIncome = numericValues(findFirstExactRow(rows, [
    'Income from operations',
    'Operating income',
  ], 2));
  const epsNtd = numericValuesWithFootnotes(findFirstExactRow(rows, [
    'EPS (NT$)',
    'Earnings per share - diluted (NT$)',
  ], 2));
  if (revenue.length < 2 || operatingIncome.length < 2 || epsNtd.length < 2) return null;

  return completeActuals({
    fiscalDate,
    actualBasis: 'tifrs',
    revenueActual: translateMillionsToUsd(revenue[0], translation.currentRate),
    revenuePreviousYear: translateMillionsToUsd(revenue[1], translation.previousRate),
    revenueActualBasis: 'netRevenue',
    ebitActual: translateMillionsToUsd(operatingIncome[0], translation.currentRate),
    ebitPreviousYear: translateMillionsToUsd(operatingIncome[1], translation.previousRate),
    ebitActualBasis: 'operatingIncome',
    epsActual: translateAdrEps(epsNtd[0], translation.currentRate),
    epsPreviousYear: translateAdrEps(epsNtd[1], translation.previousRate),
    epsActualBasis: 'EarningsPerADR',
    epsCurrency: 'USD',
    epsUnit: 'USD/ADR',
  });
}

function parseNokiaPrimaryDocument(html, fiscalDate) {
  const text = htmlToText(html);
  const expectedQuarter = quarterLabelForDate(fiscalDate).replace(
    /^Q([1-4])-(\d{2})(\d{2})$/,
    "Q$1'$3",
  );
  if (!expectedQuarter
    || !/\bNokia Corporation\b/i.test(text)
    || !text.includes(expectedQuarter)
    || !/\bComparable results\b/i.test(text)) {
    return null;
  }

  const rows = extractTableRows(html);
  const reportedIndex = rows.findIndex((row) => normalizeLabel(row[0]) === 'reported results');
  const comparableIndex = rows.findIndex(
    (row, index) => index > reportedIndex && normalizeLabel(row[0]) === 'comparable results',
  );
  if (reportedIndex < 0 || comparableIndex <= reportedIndex) return null;

  const reportedRows = rows.slice(reportedIndex + 1, comparableIndex);
  const comparableRows = rows.slice(comparableIndex + 1, comparableIndex + 20);
  const reportedRevenue = nokiaNumericValues(findRowByLabel(reportedRows, 'Net sales'));
  const comparableOperatingIncome = nokiaNumericValues(
    findRowByLabel(comparableRows, 'Operating profit'),
  );
  const reportedEps = nokiaNumericValues(
    findRowByLabel(reportedRows, 'EPS for the period, diluted'),
  );
  if (reportedRevenue.length < 2
    || comparableOperatingIncome.length < 2
    || reportedEps.length < 2) {
    return null;
  }

  return completeActuals({
    fiscalDate,
    currency: 'EUR',
    actualBasis: 'nokia-reported-and-comparable',
    revenueActual: scaleMillions(reportedRevenue[0]),
    revenuePreviousYear: scaleMillions(reportedRevenue[1]),
    revenueActualBasis: 'reportedNetSales',
    ebitActual: scaleMillions(comparableOperatingIncome[0]),
    ebitPreviousYear: scaleMillions(comparableOperatingIncome[1]),
    ebitActualBasis: 'comparableOperatingIncome',
    epsActual: reportedEps[0],
    epsPreviousYear: reportedEps[1],
    epsActualBasis: 'reportedDilutedEPS',
    epsCurrency: 'EUR',
    epsUnit: 'EUR/share',
  });
}

function parseAlphabetExhibit(html, fiscalDate) {
  const text = htmlToText(html);
  if (!/\bAlphabet\b/i.test(text) || !/in millions/i.test(text) || !containsFiscalQuarter(text, fiscalDate)) return null;
  const rows = extractTableRows(html);
  const revenue = numericValues(findFirstExactRow(rows, ['Total revenues', 'Revenues'], 2));
  const operatingIncome = numericValues(findFirstExactRow(rows, [
    'Total income from operations',
    'Income from operations',
    'Operating income',
  ], 2));
  const eps = numericValues(findExactRow(rows, 'Diluted net income per common share', 2));
  if (revenue.length < 2 || operatingIncome.length < 2 || eps.length < 2) return null;

  return completeActuals({
    fiscalDate,
    revenueActual: scaleMillions(revenue[1]),
    revenuePreviousYear: scaleMillions(revenue[0]),
    revenueActualBasis: 'totalRevenue',
    ebitActual: scaleMillions(operatingIncome[1]),
    ebitPreviousYear: scaleMillions(operatingIncome[0]),
    ebitActualBasis: 'operatingIncome',
    epsActual: eps[1],
    epsPreviousYear: eps[0],
    epsActualBasis: 'EarningsPerShareDiluted',
  });
}

function parseInteractiveBrokersExhibit(html, fiscalDate) {
  const text = htmlToText(html);
  if (!/Interactive Brokers Group/i.test(text) || !/in millions/i.test(text) || !containsFiscalQuarter(text, fiscalDate)) return null;
  const rows = extractTableRows(html);
  const revenue = numericValues(findExactRow(rows, 'Net revenues - GAAP', 2));
  const pretaxIncome = numericValues(findExactRow(rows, 'Income before income taxes - GAAP', 2));
  const eps = numericValues(findExactRow(rows, 'Diluted EPS - GAAP', 2));
  if (revenue.length < 2 || pretaxIncome.length < 2 || eps.length < 2) return null;

  return completeActuals({
    fiscalDate,
    revenueActual: scaleMillions(revenue[0]),
    revenuePreviousYear: scaleMillions(revenue[1]),
    revenueActualBasis: 'netRevenue',
    ebitActual: scaleMillions(pretaxIncome[0]),
    ebitPreviousYear: scaleMillions(pretaxIncome[1]),
    ebitActualBasis: 'incomeBeforeTax',
    epsActual: eps[0],
    epsPreviousYear: eps[1],
    epsActualBasis: 'EarningsPerShareDiluted',
  });
}

function completeActuals(fields) {
  const output = {
    currency: 'USD',
    ...fields,
  };
  return allActualFieldsComplete(output) ? output : null;
}

function allActualFieldsComplete(fields) {
  return positiveFinite(fields.revenueActual)
    && positiveFinite(fields.revenuePreviousYear)
    && finite(fields.ebitActual)
    && finite(fields.ebitPreviousYear)
    && typeof fields.ebitActualBasis === 'string'
    && finite(fields.epsActual)
    && finite(fields.epsPreviousYear);
}

function extractTableRows(html) {
  const rows = [];
  for (const rowMatch of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(
      rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
      (cellMatch) => htmlToText(cellMatch[1]),
    ).filter(Boolean);
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function findExactRow(rows, label, minimumNumbers) {
  const normalizedLabel = normalizeLabel(label);
  return (rows || []).find((row) => (
    normalizeLabel(row[0]) === normalizedLabel
    && numericValues(row).length >= minimumNumbers
  )) || [];
}

function findFirstExactRow(rows, labels, minimumNumbers) {
  for (const label of labels) {
    const row = findExactRow(rows, label, minimumNumbers);
    if (row.length) return row;
  }
  return [];
}

function findRowByLabel(rows, label) {
  const normalizedLabel = normalizeLabel(label);
  return (rows || []).find((row) => normalizeLabel(row[0]) === normalizedLabel) || [];
}

function nokiaNumericValues(cells) {
  return (cells || []).slice(1).flatMap((cell) => {
    const raw = String(cell || '').trim().replace(/\u00a0/g, ' ');
    if (!/^\(?[-−]?\d+(?: \d{3})*(?:\.\d+)?\)?$/.test(raw)) return [];
    const value = parseFinancialNumber(raw.replace(/\s+/g, ''));
    return value === null ? [] : [value];
  });
}

function numericValues(cells) {
  return (cells || []).flatMap((cell) => {
    if (!/^\s*\(?[-−]?\$?\d[\d,]*(?:\.\d+)?\)?\s*$/.test(cell)) return [];
    const value = parseFinancialNumber(cell);
    return value === null ? [] : [value];
  });
}

function numericValuesWithFootnotes(cells) {
  return (cells || []).flatMap((cell) => {
    const match = String(cell || '').match(/^\s*(\(?[-−]?\$?\d[\d,]*(?:\.\d+)?\)?)(?:\s+[a-z])?\s*$/i);
    if (!match) return [];
    const value = parseFinancialNumber(match[1]);
    return value === null ? [] : [value];
  });
}

function extractSeries(section, label, count) {
  const offset = section.toLowerCase().indexOf(label.toLowerCase());
  if (offset < 0) return null;
  const tail = section.slice(offset + label.length, offset + label.length + 500);
  const values = [];
  for (const token of tail.split(/\s+/)) {
    if (!/^\(?[-−]?\$?\d[\d,]*(?:\.\d+)?\)?$/.test(token)) continue;
    const value = parseFinancialNumber(token);
    if (value === null) continue;
    values.push(value);
    if (values.length === count) return values;
  }
  return null;
}

function extractFinancialSeries(section, label, count) {
  const offset = section.toLowerCase().indexOf(label.toLowerCase());
  if (offset < 0) return null;
  const tail = section.slice(offset + label.length, offset + label.length + 500);
  const values = [];
  for (const match of tail.matchAll(/\$?\(?[-−]?\d[\d,]*(?:\.\d+)?\)?/g)) {
    const value = parseFinancialNumber(match[0]);
    if (value === null) continue;
    values.push(value);
    if (values.length === count) return values;
  }
  return null;
}

function extractFirstThreeMonthsEndedDate(text) {
  const match = String(text || '').match(
    /Three Months Ended\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  if (!match) return '';
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31 || year < 2000) return '';
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return dateKey(new Date(`${value}T00:00:00.000Z`).toISOString()) === value ? value : '';
}

function fiscalDateDistanceDays(left, right) {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);
  if (!leftDate || !rightDate) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000));
}

function selectConceptFact(companyFacts, conceptNames, unit, options) {
  for (const conceptName of conceptNames) {
    const entries = companyFacts?.facts?.['us-gaap']?.[conceptName]?.units?.[unit];
    const selected = selectQuarterEntry(entries, options);
    if (selected) return { concept: conceptName, value: selected.val, entry: selected };
  }
  return null;
}

function selectQuarterEntry(entries, {
  end,
  accession,
  filedAt,
  allowEarlierAccession = false,
  endToleranceDays = 0,
}) {
  const targetEnd = parseDate(end);
  if (!targetEnd) return null;
  const candidates = (Array.isArray(entries) ? entries : [])
    .filter((entry) => {
      if (!finite(entry?.val)) return false;
      if (!/^10-Q(?:\/A)?$/i.test(String(entry?.form || ''))) return false;
      if (!isQuarterDuration(entry?.start, entry?.end)) return false;
      if (accession && !allowEarlierAccession && entry?.accn !== accession) return false;
      if (filedAt && dateKey(entry?.filed) > dateKey(filedAt)) return false;
      return true;
    })
    .map((entry) => ({
      entry,
      distance: fiscalDateDistanceDays(entry.end, end),
    }))
    .filter(({ distance }) => distance <= Math.max(0, Number(endToleranceDays) || 0))
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      const accessionScoreA = accession && a.entry?.accn === accession ? 1 : 0;
      const accessionScoreB = accession && b.entry?.accn === accession ? 1 : 0;
      if (accessionScoreA !== accessionScoreB) return accessionScoreB - accessionScoreA;
      return String(b.entry?.filed || '').localeCompare(String(a.entry?.filed || ''));
    });
  if (candidates.length === 0) return null;
  const nearestDistance = candidates[0].distance;
  const nearestEndDates = new Set(
    candidates
      .filter((candidate) => candidate.distance === nearestDistance)
      .map((candidate) => dateKey(candidate.entry?.end)),
  );
  return nearestEndDates.size === 1 ? candidates[0].entry : null;
}

function isQuarterDuration(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return false;
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  return days >= 70 && days <= 110;
}

function containsFiscalQuarter(text, fiscalDate) {
  const date = parseDate(fiscalDate);
  if (!date) return false;
  const month = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][date.getUTCMonth()];
  return new RegExp(`quarter ended\\s+${month}\\s+${date.getUTCDate()},\\s+${date.getUTCFullYear()}`, 'i').test(text);
}

function quarterLabelForDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1}-${date.getUTCFullYear()}`;
}

function previousYearDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function parseFinancialNumber(value) {
  const raw = String(value || '').trim().replace(/[$,]/g, '').replace(/−/g, '-');
  if (!raw || raw === '—' || raw === '-') return null;
  const negative = raw.startsWith('(') && raw.endsWith(')');
  const numeric = Number(raw.replace(/[()]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return negative ? -numeric : numeric;
}

function scaleMillions(value) {
  return finite(value) ? value * 1_000_000 : null;
}

function translateMillionsToUsd(value, exchangeRate) {
  if (!finite(value) || !positiveFinite(exchangeRate)) return null;
  return Math.round(value / exchangeRate) * 1_000_000;
}

function translateAdrEps(value, exchangeRate) {
  if (!finite(value) || !positiveFinite(exchangeRate)) return null;
  return Math.round(((value * 5) / exchangeRate) * 100) / 100;
}

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function parseDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeCodePoint(value) {
  try {
    return Number.isFinite(value) ? String.fromCodePoint(value) : ' ';
  } catch {
    return ' ';
  }
}

function isSecArchiveUrl(url) {
  return url?.protocol === 'https:'
    && url.hostname.toLowerCase() === 'www.sec.gov'
    && url.pathname.startsWith('/Archives/edgar/data/');
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveFinite(value) {
  return finite(value) && value > 0;
}
