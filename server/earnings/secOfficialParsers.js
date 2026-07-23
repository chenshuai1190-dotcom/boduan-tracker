const SUPPORTED_EXHIBIT_SYMBOLS = new Set([
  'TSLA',
  'GOOG',
  'GOOGL',
  'IBKR',
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

export function parseSecExhibitActuals({ symbol, fiscalDate, html }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  if (!SUPPORTED_EXHIBIT_SYMBOLS.has(normalizedSymbol) || !normalizedFiscalDate) return null;
  if (typeof html !== 'string' || html.length < 100) return null;

  if (normalizedSymbol === 'TSLA') {
    return parseTeslaExhibit(html, normalizedFiscalDate);
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
  if (typeof indexHtml !== 'string' || !filingUrl) return null;
  const rows = indexHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    if (!/\bEX-99\.1\b/i.test(htmlToText(row))) continue;
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

function numericValues(cells) {
  return (cells || []).flatMap((cell) => {
    if (!/^\s*\(?[-−]?\$?\d[\d,]*(?:\.\d+)?\)?\s*$/.test(cell)) return [];
    const value = parseFinancialNumber(cell);
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
}) {
  const candidates = (Array.isArray(entries) ? entries : [])
    .filter((entry) => {
      if (!finite(entry?.val) || dateKey(entry?.end) !== end) return false;
      if (!/^10-Q(?:\/A)?$/i.test(String(entry?.form || ''))) return false;
      if (!isQuarterDuration(entry?.start, entry?.end)) return false;
      if (accession && !allowEarlierAccession && entry?.accn !== accession) return false;
      if (filedAt && dateKey(entry?.filed) > dateKey(filedAt)) return false;
      return true;
    })
    .sort((a, b) => {
      const accessionScoreA = accession && a?.accn === accession ? 1 : 0;
      const accessionScoreB = accession && b?.accn === accession ? 1 : 0;
      if (accessionScoreA !== accessionScoreB) return accessionScoreB - accessionScoreA;
      return String(b?.filed || '').localeCompare(String(a?.filed || ''));
    });
  return candidates[0] || null;
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

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
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
