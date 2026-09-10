import { htmlToText } from './secOfficialParsers.js';

const CIK = '0001783879';
const REVENUE = 'us-gaap:revenues';
const CONTRACT_REVENUE = 'us-gaap:revenuefromcontractwithcustomerexcludingassessedtax';
const NET_INTEREST = 'us-gaap:interestincomeexpensenet';
const CONCEPTS = new Set([REVENUE, CONTRACT_REVENUE, NET_INTEREST]);
const PRODUCT_AXES = new Set(['srt:productorserviceaxis', 'us-gaap:productorserviceaxis']);
// These are mutually exclusive TOP-LEVEL sources, not operating segments.
// Transaction/interest/other subcategories must never be added alongside their
// parent amounts. In particular gross securities-lending interest is not net.
const SOURCES = [
  { id: 'transaction-based-revenues', label: 'Transaction-based revenues', labelZh: '交易收入', concept: CONTRACT_REVENUE, member: 'hood:transactionbasedrevenuesmember' },
  { id: 'net-interest-revenues', label: 'Net interest revenues', labelZh: '净利息收入', concept: NET_INTEREST, member: null },
  { id: 'other-revenues', label: 'Other revenues', labelZh: '其他收入', concept: CONTRACT_REVENUE, member: 'us-gaap:financialserviceothermember' },
];

const unavailable = reason => ({ status: 'unavailable', reason, items: [] });
const metric = (complete, reason) => ({ status: complete ? 'complete' : 'unavailable', reason: complete ? null : reason });
const normalizedCik = value => /^\d{1,10}$/.test(String(value || '').trim()) ? String(value).trim().padStart(10, '0') : '';
function attributes(source) {
  const values = {};
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    const name = match[1].toLowerCase();
    if (Object.hasOwn(values, name)) return null;
    values[name] = match[2];
  }
  return values;
}
function element(source, name) {
  const matches = [...source.matchAll(new RegExp(`<${name}\\b[^>]*>([^<]+)</${name}>`, 'gi'))];
  return matches.length === 1 ? htmlToText(matches[0][1]) : '';
}
function isoDate(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const named = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  const iso = named && months.includes(named[1].toLowerCase())
    ? `${named[3]}-${String(months.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0')}-${named[2].padStart(2, '0')}` : text;
  if (!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(iso)) return '';
  const stamp = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === iso ? iso : '';
}
function monetaryValue(inner, attrs) {
  if (attrs['xsi:nil'] === 'true' || attrs.continuedat) return null;
  if (attrs.sign && attrs.sign !== '-') return null;
  if (attrs.format && !/:(?:num-dot-decimal|numdotdecimal|fixed-zero|zerodash)$/i.test(attrs.format)) return null;
  const raw = htmlToText(inner).replace(/[\s$,]/g, '').replace(/−/g, '-');
  const scale = Number(attrs.scale || 0);
  if (!Number.isInteger(scale) || Math.abs(scale) > 20) return null;
  if (/:(?:fixed-zero|zerodash)$/i.test(attrs.format || '') && ['—', '-', '–', '0'].includes(raw)) return 0;
  if (!/^(?:-?\d+(?:\.\d+)?|\(\d+(?:\.\d+)?\))$/.test(raw)) return null;
  if (raw.startsWith('-') && attrs.sign === '-') return null;
  const negative = attrs.sign === '-' || /^\(/.test(raw);
  const value = Number(raw.replace(/[()]/g, '')) * 10 ** scale * (negative ? -1 : 1);
  return Number.isSafeInteger(value) ? value : null;
}

function parseDocument(html) {
  const contexts = new Map(), units = new Map(), facts = [], identities = [];
  let malformed = false;
  for (const match of html.matchAll(/<xbrli:unit\b([^>]*)>([\s\S]*?)<\/xbrli:unit>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs?.id || units.has(attrs.id)) { malformed = true; continue; }
    const measures = [...match[2].matchAll(/<xbrli:measure\b[^>]*>([^<]+)<\/xbrli:measure>/gi)];
    units.set(attrs.id, measures.length === 1 && htmlToText(measures[0][1]).toLowerCase() === 'iso4217:usd'
      && !/<xbrli:divide\b/i.test(match[2]));
  }
  const contextIds = new Set();
  for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)) {
    const attrs = attributes(match[1]), body = match[2];
    if (!attrs?.id || contextIds.has(attrs.id)) { malformed = true; continue; }
    contextIds.add(attrs.id);
    const entities = [...body.matchAll(/<xbrli:entity\b[^>]*>([\s\S]*?)<\/xbrli:entity>/gi)];
    const identifiers = [...(entities[0]?.[1] || '').matchAll(/<xbrli:identifier\b([^>]*)>([^<]+)<\/xbrli:identifier>/gi)];
    if (entities.length !== 1 || identifiers.length !== 1
      || attributes(identifiers[0][1])?.scheme !== 'http://www.sec.gov/CIK'
      || normalizedCik(htmlToText(identifiers[0][2])) !== CIK || /<xbrldi:typedMember\b/i.test(body)) continue;
    const members = {};
    let valid = true;
    for (const member of body.matchAll(/<xbrldi:explicitMember\b([^>]*)>([\s\S]*?)<\/xbrldi:explicitMember>/gi)) {
      const dimension = attributes(member[1])?.dimension?.toLowerCase(), value = htmlToText(member[2]).toLowerCase();
      if (!dimension || !value || Object.hasOwn(members, dimension)) { valid = false; break; }
      members[dimension] = value;
    }
    const start = isoDate(element(body, 'xbrli:startDate'));
    const end = isoDate(element(body, 'xbrli:endDate') || element(body, 'xbrli:instant'));
    if (valid && end) contexts.set(attrs.id, { start, end, members });
  }
  for (const match of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs) { malformed = true; continue; }
    const concept = attrs.name?.toLowerCase();
    if (!CONCEPTS.has(concept)) continue;
    facts.push({ concept, context: attrs.contextref, value: units.get(attrs.unitref) === true ? monetaryValue(match[2], attrs) : null });
  }
  for (const match of html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs?.name?.toLowerCase().startsWith('dei:')) identities.push({ concept: attrs.name.toLowerCase(), value: htmlToText(match[2]), context: attrs.contextref });
  }
  return { contexts, facts, identities, malformed };
}

function identity(document, concept, end) {
  const facts = document.identities.filter(fact => fact.concept === `dei:${concept.toLowerCase()}`);
  if (!facts.length || facts.some(fact => {
    const context = document.contexts.get(fact.context);
    return !context || Object.keys(context.members).length || context.end !== end;
  })) return '';
  const values = new Set(facts.map(fact => fact.value));
  return values.size === 1 ? [...values][0] : '';
}

function fact(document, period, concept, member = null) {
  const values = new Set(), signatures = new Set();
  for (const candidate of document.facts) {
    if (candidate.concept !== concept) continue;
    const context = document.contexts.get(candidate.context);
    if (!context || context.start !== period.start || context.end !== period.end) continue;
    const dimensions = Object.entries(context.members);
    if (member ? dimensions.length !== 1 || !PRODUCT_AXES.has(dimensions[0][0]) || dimensions[0][1] !== member : dimensions.length !== 0) continue;
    if (!Number.isSafeInteger(candidate.value)) return { value: null, reason: 'invalid-usd-revenue-fact' };
    values.add(candidate.value);
    signatures.add(JSON.stringify(dimensions));
  }
  return values.size === 1 && signatures.size === 1 ? { value: [...values][0], reason: null }
    : { value: null, reason: values.size > 1 || signatures.size > 1 ? 'conflicting-revenue-facts' : 'missing-exact-quarter-revenue' };
}

function quarterRevenue(document, period) {
  const total = fact(document, period, REVENUE);
  const sources = SOURCES.map(source => ({ ...source, ...fact(document, period, source.concept, source.member) }));
  const invalid = [total, ...sources].find(item => item.reason);
  if (invalid) return { reason: invalid.reason };
  if (total.value <= 0 || sources.some(source => source.value < 0)) return { reason: 'unsupported-negative-revenue-source' };
  const sum = sources.reduce((value, source) => value + source.value, 0);
  if (!Number.isSafeInteger(sum) || sum !== total.value) return { reason: 'revenue-reconciliation-failed' };
  return { total: total.value, sources, reason: null };
}

/** Robinhood's SEC-disclosed net-revenue sources, never inferred operating segments. */
export function inspectRobinhoodBusinessComposition({ symbol, fiscalDate, html, filing = {} } = {}) {
  const reject = reason => ({ result: null, reason });
  if (String(symbol || '').trim().toUpperCase().replace(/\.US$/, '') !== 'HOOD'
    || normalizedCik(filing.cik) !== CIK) return reject('robinhood-filing-identity-mismatch');
  const end = isoDate(fiscalDate), form = String(filing.form || '').trim().toUpperCase();
  if (!end || !['10-Q', '10-K'].includes(form) || String(filing.documentType || '').toUpperCase() !== 'PRIMARY') return reject('unsupported-filing-or-period');
  if (typeof html !== 'string' || html.length < 100 || !/<ix:nonFraction\b/i.test(html)) return reject('inline-xbrl-not-found');
  const document = parseDocument(html);
  if (document.malformed) return reject('malformed-inline-xbrl');
  if (identity(document, 'DocumentType', end) !== form
    || isoDate(identity(document, 'DocumentPeriodEndDate', end)) !== end
    || normalizedCik(identity(document, 'EntityCentralIndexKey', end)) !== CIK
    || identity(document, 'TradingSymbol', end).trim().toUpperCase() !== 'HOOD') return reject('document-identity-or-period-mismatch');
  const year = identity(document, 'DocumentFiscalYearFocus', end);
  const quarter = identity(document, 'DocumentFiscalPeriodFocus', end);
  if (!/^Q[1-4]$/.test(quarter) || year !== end.slice(0, 4)
    || (form === '10-K' ? quarter !== 'Q4' : quarter === 'Q4')) return reject('missing-explicit-quarter');
  const quarterNumber = Number(quarter.slice(1));
  const expectedEnd = `${year}-${String(quarterNumber * 3).padStart(2, '0')}-${quarterNumber === 1 || quarterNumber === 4 ? '31' : '30'}`;
  if (end !== expectedEnd) return reject('unsupported-fiscal-calendar');
  const start = `${year}-${String((quarterNumber - 1) * 3 + 1).padStart(2, '0')}-01`;
  const period = { start, end };
  const current = quarterRevenue(document, period);
  if (current.reason) return reject(current.reason);
  const previousYear = String(Number(year) - 1);
  const previousPeriod = { start: start.replace(year, previousYear), end: end.replace(year, previousYear) };
  const previous = quarterRevenue(document, previousPeriod);
  const previousComplete = !previous.reason;
  const items = current.sources.map((source, index) => ({
    id: source.id, label: source.label, labelZh: source.labelZh, revenue: source.value,
    previousRevenue: previousComplete ? previous.sources[index].value : null,
    profit: null, previousProfit: null,
  }));
  return { reason: null, result: {
    status: 'partial', currency: 'USD', totalRevenue: current.total,
    previousTotalRevenue: previousComplete ? previous.total : null,
    period: { ...period, fiscalYear: year, fiscalPeriod: quarter },
    sections: {
      reportSegments: unavailable('quarterly-operating-segments-not-disclosed'),
      revenueBreakdown: { status: 'complete', reason: null, items, metricStatus: {
        revenue: metric(true), previousRevenue: metric(previousComplete, 'prior-revenue-unavailable-or-not-comparable'),
        profit: metric(false, 'source-operating-income-not-disclosed'), previousProfit: metric(false, 'source-operating-income-not-disclosed'),
      } },
      geographies: unavailable('quarterly-geography-not-disclosed'),
    },
    sourceMetadata: { provider: 'SEC', adapterId: 'robinhood-sec-inline-xbrl-v1', evidence: 'official-primary-inline-xbrl',
      cik: CIK, accession: String(filing.accession || '').slice(0, 40) || null, form },
  } };
}
