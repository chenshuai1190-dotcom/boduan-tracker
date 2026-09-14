import { buildSecFinancialHistory } from '../earnings/secFinancialHistory.js';
import { htmlToText } from '../earnings/secOfficialParsers.js';

export const VALUATION_CIKS = Object.freeze({ MSFT: '0000789019', NVDA: '0001045810', META: '0001326801' });
const DAY = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const span = (start, end) => (Date.parse(end) - Date.parse(start)) / DAY + 1;
export const valuationDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const CONCEPTS = {
  operatingIncome: ['OperatingIncomeLoss'],
  pretaxIncome: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],
  incomeTax: ['IncomeTaxExpenseBenefit'],
  dilutedShares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  eps: ['EarningsPerShareDiluted'],
  costOfRevenue: ['CostOfRevenue'], grossProfit: ['GrossProfit'],
};

function selectedFact(facts, concepts, unit, { start, end, accession, cutoff }) {
  const values = concepts.flatMap(concept => (facts?.facts?.['us-gaap']?.[concept]?.units?.[unit] || [])
    .filter(row => row.start === start && row.end === end && row.accn === accession
      && valuationDate(row.filed) && row.filed <= cutoff));
  if (!values.length || values.some(row => !finite(row.val))) return null;
  const unique = [...new Set(values.map(row => row.val))];
  return unique.length === 1 ? unique[0] : null;
}

function annualStart(facts, accession, end, cutoff) {
  const dates = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'].flatMap(concept =>
    (facts?.facts?.['us-gaap']?.[concept]?.units?.USD || []).filter(row => row.accn === accession && row.end === end
      && row.filed <= cutoff && valuationDate(row.start) && span(row.start, end) >= 330 && span(row.start, end) <= 385).map(row => row.start));
  return new Set(dates).size === 1 ? dates[0] : null;
}

function factValue(facts, field, row, cutoff) {
  const unit = field === 'eps' ? 'USD/shares' : field === 'dilutedShares' ? 'shares' : 'USD';
  const direct = selectedFact(facts, CONCEPTS[field], unit, { start: row.startDate, end: row.endDate, accession: row.accession, cutoff });
  if (direct !== null || !row.derived || ['eps', 'dilutedShares'].includes(field)) return direct;
  const start = annualStart(facts, row.accession, row.endDate, cutoff);
  if (!start) return null;
  const nineEnd = new Date(Date.parse(row.startDate) - DAY).toISOString().slice(0, 10);
  const annual = selectedFact(facts, CONCEPTS[field], unit, { start, end: row.endDate, accession: row.derivedFrom.annualAccession, cutoff });
  const nineMonths = selectedFact(facts, CONCEPTS[field], unit, { start, end: nineEnd, accession: row.derivedFrom.nineMonthAccession, cutoff });
  return annual !== null && nineMonths !== null ? annual - nineMonths : null;
}

/** Quarterly additive GAAP facts share the exact accession/period used by revenue. */
export function parseValuationQuarters(companyFacts, { symbol, now = new Date(), filings = [] } = {}) {
  const cik = VALUATION_CIKS[symbol];
  if (!cik || String(companyFacts?.cik || '').padStart(10, '0') !== cik) return { status: 'pending', reason: 'issuer_mismatch', quarters: [] };
  if (!Number.isFinite(new Date(now).getTime())) return { status: 'pending', reason: 'invalid_request', quarters: [] };
  const cutoff = new Date(now).toISOString().slice(0, 10);
  // A submissions timestamp is stronger than companyfacts' date-only filed field.
  const future = new Set(filings.filter(f => f.acceptedAt && Date.parse(f.acceptedAt) > new Date(now).getTime()).map(f => f.accession));
  const filteredFacts = future.size ? { ...companyFacts, facts: Object.fromEntries(Object.entries(companyFacts.facts || {}).map(([namespace, concepts]) => [namespace,
    Object.fromEntries(Object.entries(concepts).map(([concept, value]) => [concept, { ...value, units: Object.fromEntries(Object.entries(value.units || {}).map(([unit, rows]) => [unit, rows.filter(row => !future.has(row.accn))])) }]))])) } : companyFacts;
  const history = buildSecFinancialHistory(filteredFacts, { symbol, cik, asOfDate: cutoff });
  if (history.currency !== 'USD' || history.quarterly.length < 8) return { status: 'pending', reason: 'incomplete_quarter_history', quarters: [] };
  const quarters = history.quarterly.map(row => {
    const values = Object.fromEntries(Object.keys(CONCEPTS).map(field => [field, factValue(filteredFacts, field, row, cutoff)]));
    if (values.grossProfit === null && values.costOfRevenue !== null) values.grossProfit = row.revenue - values.costOfRevenue;
    if (values.costOfRevenue === null && values.grossProfit !== null) values.costOfRevenue = row.revenue - values.grossProfit;
    return { start: row.startDate, end: row.endDate, fiscalYear: Number(row.fiscalYear.slice(2)), fiscalQuarter: Number(row.fiscalQuarter.slice(1)),
      revenue: row.revenue, netIncome: row.netIncome, ...values,
      operatingExpenses: values.grossProfit !== null && values.operatingIncome !== null ? values.grossProfit - values.operatingIncome : null,
      accession: row.accession, filedAt: row.filedDate,
      derivation: row.derived ? { type: 'annual_less_nine_months', ...row.derivedFrom } : null };
  });
  if (quarters.some((q, index) => !['revenue', 'netIncome', 'operatingIncome', 'pretaxIncome', 'incomeTax'].every(key => finite(q[key]))
    || q.revenue <= 0 || Math.abs(q.pretaxIncome - q.incomeTax - q.netIncome) > Math.max(3000000, Math.abs(q.netIncome) * 0.0001)
    || (q.dilutedShares !== null && q.dilutedShares <= 0)
    || (q.dilutedShares !== null && q.eps !== null && Math.abs(q.netIncome / q.dilutedShares - q.eps) > 0.02)
    || (index && (Date.parse(q.start) - Date.parse(quarters[index - 1].end) !== DAY
      || q.fiscalYear * 4 + q.fiscalQuarter !== quarters[index - 1].fiscalYear * 4 + quarters[index - 1].fiscalQuarter + 1)))) {
    return { status: 'pending', reason: 'invalid_quarter_history', quarters: [] };
  }
  const latest = quarters.at(-1);
  let latestDilutedShares = latest.dilutedShares === null ? null : { value: latest.dilutedShares, scope: 'quarter', periodStart: latest.start, periodEnd: latest.end, accession: latest.accession, filedAt: latest.filedAt };
  if (!latestDilutedShares && latest.fiscalQuarter === 4) {
    const start = annualStart(filteredFacts, latest.accession, latest.end, cutoff);
    const value = start && selectedFact(filteredFacts, CONCEPTS.dilutedShares, 'shares', { start, end: latest.end, accession: latest.accession, cutoff });
    if (finite(value) && value > 0) latestDilutedShares = { value, scope: 'annual', periodStart: start, periodEnd: latest.end, accession: latest.accession, filedAt: latest.filedAt };
  }
  if (!latestDilutedShares) return { status: 'pending', reason: 'latest_diluted_shares_missing', quarters: [] };
  const shareEps = latestDilutedShares.scope === 'quarter' ? latest.eps
    : selectedFact(filteredFacts, CONCEPTS.eps, 'USD/shares', { start: latestDilutedShares.periodStart, end: latest.end, accession: latest.accession, cutoff });
  const shareIncome = latestDilutedShares.scope === 'quarter' ? latest.netIncome
    : history.annual.find(row => row.accession === latest.accession && row.endDate === latest.end)?.netIncome;
  if (!finite(shareEps) || !finite(shareIncome) || Math.abs(shareIncome / latestDilutedShares.value - shareEps) > 0.02) {
    return { status: 'pending', reason: 'inconsistent_share_basis', quarters: [] };
  }
  latestDilutedShares.sourceUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const annuals = history.annual.map(row => ({ fiscalYear: Number(row.fiscalYear.slice(2)), start: row.startDate, end: row.endDate,
    revenue: row.revenue, operatingIncome: selectedFact(filteredFacts, CONCEPTS.operatingIncome, 'USD', { start: row.startDate, end: row.endDate, accession: row.accession, cutoff }),
    accession: row.accession, filedAt: row.filedDate })).filter(row => finite(row.operatingIncome));
  return { status: 'ready', reason: null, quarters, latestDilutedShares, annuals };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4 };
const nextPeriod = report => ({ fiscalYear: report.fiscalYear + (report.fiscalQuarter === 4 ? 1 : 0), fiscalQuarter: report.fiscalQuarter % 4 + 1 });

export function parseValuationReportIdentity(document, { symbol, cik, expectedAccession, now = new Date() } = {}) {
  if (document?.status !== 'complete' || document.documentType !== 'EX-99.1' || document.form !== '8-K'
    || document.secCik !== cik || document.accession !== expectedAccession || typeof document.html !== 'string') return null;
  let url;
  try { url = new URL(document.primaryDocumentUrl); } catch { return null; }
  if (url.origin !== 'https://www.sec.gov' || !url.pathname.startsWith(`/Archives/edgar/data/${Number(cik)}/${expectedAccession.replaceAll('-', '')}/`)) return null;
  const text = htmlToText(document.html);
  const company = { NVDA: /NVIDIA\s*\(NASDAQ:\s*NVDA\)/i, META: /Meta Platforms,?\s*Inc\.\s*\(Nasdaq:\s*META\)/i, MSFT: /Microsoft Corp\./i }[symbol];
  if (!company?.test(text.slice(0, 2200)) || !/in millions|\$ in millions/i.test(text)) return null;
  const match = text.slice(0, 2500).match(/quarter ended\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})/i);
  if (!match) return null;
  const month = MONTHS.findIndex(name => name.toLowerCase() === match[1].toLowerCase()) + 1;
  const periodEnd = `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  const published = Date.parse(document.filedAt);
  if (!valuationDate(periodEnd) || !Number.isFinite(published) || published > new Date(now).getTime() || Date.parse(periodEnd) >= published) return null;
  return { periodEnd, publishedAt: new Date(published).toISOString(), sourceUrl: url.href, accession: expectedAccession };
}

export function valuationReleaseMatchesQuarter(html, symbol, quarter) {
  const text = htmlToText(html).slice(0, 5000);
  const match = symbol === 'META' ? text.match(/Revenue\s+\$\s*([\d,]+)\s+\$/)
    : symbol === 'MSFT' ? text.match(/Revenue was \$([\d.]+) billion/i)
      : text.match(/quarter ended [\s\S]{0,60}?of \$([\d.]+) billion/i);
  if (!match) return false;
  const amount = Number(match[1].replaceAll(',', '')) * (symbol === 'META' ? 1e6 : 1e9);
  const decimals = match[1].split('.')[1]?.length || 0;
  const tolerance = symbol === 'META' ? 500000 : 0.5 * 1e9 * 10 ** -decimals;
  return Math.abs(amount - quarter.revenue) <= tolerance;
}

const money = (low, high) => ({ low: Math.round(Number(low) * 1e9), high: Math.round(Number(high) * 1e9) });
const validRange = (value, max = Infinity) => value && finite(value.low) && finite(value.high) && value.low >= 0 && value.high >= value.low && value.high <= max;
const samePeriod = (a, b) => a.fiscalYear === b.fiscalYear && a.fiscalQuarter === b.fiscalQuarter;

/** Only explicit, issuer-specific guidance sentences are numeric inputs. */
export function parseValuationGuidance({ symbol, html, sourceUrl, report, annuals = [], transcriptHtml = null, transcriptUrl = null } = {}) {
  if (!report || !Number.isInteger(report.fiscalYear) || ![1, 2, 3, 4].includes(report.fiscalQuarter)) return null;
  const text = htmlToText(html);
  const period = nextPeriod(report);
  const base = { status: 'available', period, revenue: null, grossMargin: null, operatingExpenses: null, costOfRevenue: null, annualExpenses: null, taxRate: null,
    annualOperatingMargin: null, annualOperatingIncomeFloor: null, narrativeConstraints: [], sourceUrl, evidence: [] };
  if (symbol === 'NVDA') {
    const section = text.match(/Outlook\s+NVIDIA[’']s outlook([\s\S]*?)(?:Highlights|CFO Commentary)/i)?.[1];
    if (!section) return null;
    const target = section.match(/for the (first|second|third|fourth) quarter of fiscal (20\d{2})/i);
    const revenue = section.match(/Revenue is expected to be \$([\d.]+) billion, plus or minus ([\d.]+)%/i);
    const margin = section.match(/GAAP and non-GAAP gross margins are expected to be ([\d.]+)%(?: and ([\d.]+)%, respectively)?, plus or minus ([\d.]+) basis points/i);
    const expense = section.match(/GAAP and non-GAAP operating expenses are expected to be approximately \$([\d.]+) billion and \$([\d.]+) billion, respectively/i);
    const tax = section.match(/full year fiscal (20\d{2})[\s\S]{0,100}?tax rates to be between ([\d.]+)% and ([\d.]+)%/i);
    if (!target || !samePeriod(period, { fiscalYear: +target[2], fiscalQuarter: ORDINAL[target[1].toLowerCase()] }) || !revenue || !margin || !expense || !tax) return null;
    base.revenue = money(+revenue[1] * (1 - +revenue[2] / 100), +revenue[1] * (1 + +revenue[2] / 100));
    base.grossMargin = { low: +margin[1] / 100 - +margin[3] / 10000, high: +margin[1] / 100 + +margin[3] / 10000 };
    base.operatingExpenses = money(expense[1], expense[1]);
    base.taxRate = { low: +tax[2] / 100, high: +tax[3] / 100, scope: 'fiscal_year', fiscalYear: +tax[1] };
    base.evidence = [revenue[0], margin[0], expense[0], tax[0]];
  } else if (symbol === 'META') {
    const section = text.match(/CFO Outlook Commentary([\s\S]*?)(?:Webcast and Conference Call|Disclosure Information)/i)?.[1];
    if (!section) return null;
    const revenue = section.match(/expect (first|second|third|fourth) quarter (20\d{2}) total revenue to be in the range of \$([\d.]+)\s*[-–]\s*\$?([\d.]+) billion/i);
    const expenses = section.match(/expect full year (20\d{2}) total expenses to be in the range of \$([\d.]+)\s*[-–]\s*\$?([\d.]+) billion/i);
    const tax = section.match(/tax rate for the remaining quarters of (20\d{2}) to be between ([\d.]+)\s*[-–]\s*([\d.]+)%/i);
    if (!revenue || !expenses || !tax || !samePeriod(period, { fiscalYear: +revenue[2], fiscalQuarter: ORDINAL[revenue[1].toLowerCase()] })) return null;
    base.revenue = money(revenue[3], revenue[4]);
    base.annualExpenses = { ...money(expenses[2], expenses[3]), fiscalYear: +expenses[1] };
    base.taxRate = { low: +tax[2] / 100, high: +tax[3] / 100, scope: 'remaining_year', fiscalYear: +tax[1] };
    base.evidence = [revenue[0], expenses[0], tax[0]];
    const floor = section.match(/expect to deliver operating income this year that is above (20\d{2}) operating income/i);
    if (floor) {
      const annual = annuals.find(row => row.fiscalYear === +floor[1]);
      if (!annual || !finite(annual.operatingIncome)) return null;
      base.annualOperatingIncomeFloor = { value: annual.operatingIncome, fiscalYear: +expenses[1], exclusive: true, baselineAccession: annual.accession };
      base.evidence.push(floor[0]);
    } else if (/operating income.*(?:above|greater|higher)/i.test(section)) return null;
  } else if (symbol === 'MSFT') {
    if (!/Business Outlook\s+Microsoft will provide forward-looking guidance[\s\S]{0,150}earnings conference call and webcast/i.test(text)) return null;
    if (!transcriptHtml || !transcriptUrl) return null;
    const call = htmlToText(transcriptHtml);
    const ordinal = Object.keys(ORDINAL)[report.fiscalQuarter - 1];
    if (!new RegExp(`Microsoft Fiscal Year ${report.fiscalYear} ${ordinal} Quarter Earnings Conference Call`, 'i').test(call.slice(0, 1500))) return null;
    const published = new Date(report.publishedAt);
    const callDate = new RegExp(`${MONTHS[published.getUTCMonth()]} ${published.getUTCDate()},? ${published.getUTCFullYear()}`);
    if (!callDate.test(call.slice(0, 12000))) return null;
    const section = call.match(/at the total company level,([\s\S]*?)(?:Next, capital expenditures|In closing)/i)?.[1];
    if (!section) return null;
    const revenue = section.match(/revenue should be between \$([\d.]+) and \$([\d.]+) billion/i);
    const cost = section.match(/expect COGS of \$([\d.]+) to \$([\d.]+) billion/i);
    const expense = section.match(/operating expenses? of \$([\d.]+) to \$([\d.]+) billion/i);
    const tax = section.match(/(?:adjusted )?Q([1-4]) effective tax rate to be approximately ([\d.]+)%/i);
    if (!revenue || !cost || !expense || !tax || +tax[1] !== period.fiscalQuarter) return null;
    base.revenue = money(revenue[1], revenue[2]); base.costOfRevenue = money(cost[1], cost[2]); base.operatingExpenses = money(expense[1], expense[2]);
    base.taxRate = { low: +tax[2] / 100, high: +tax[2] / 100, scope: 'quarter', fiscalYear: period.fiscalYear, basis: /adjusted Q[1-4] effective tax/i.test(tax[0]) ? 'adjusted_guidance' : 'reported_guidance' };
    base.sourceUrl = transcriptUrl; base.evidence = [revenue[0], cost[0], expense[0], tax[0]];
    const margin = call.match(/full fiscal year operating margins should be down less than a point/i);
    if (margin) {
      const annual = annuals.find(row => row.fiscalYear === period.fiscalYear - 1);
      if (!annual || !finite(annual.operatingIncome) || !(annual.revenue > 0)) return null;
      const baseline = annual.operatingIncome / annual.revenue;
      base.annualOperatingMargin = { low: baseline - 0.01, high: baseline, fiscalYear: period.fiscalYear, lowExclusive: true, highExclusive: false, baselineAccession: annual.accession };
      base.evidence.push(margin[0]);
    }
    const approximate = section.match(/full-year FY(\d{2}) operating margins to be up about one point year-over-year/i);
    if (approximate) base.narrativeConstraints.push({ kind: 'annual_margin_increase_approximately', fiscalYear: 2000 + +approximate[1], amount: 0.01, text: approximate[0] });
  } else return null;
  if (!validRange(base.revenue) || !validRange(base.taxRate, 1)
    || (base.grossMargin && !validRange(base.grossMargin, 1))
    || [base.costOfRevenue, base.operatingExpenses, base.annualExpenses].some(range => range && !validRange(range))) return null;
  return base;
}
