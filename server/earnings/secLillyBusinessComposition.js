import { htmlToText } from './secOfficialParsers.js';
import { inspectGenericSecBusinessComposition } from './secGenericBusinessComposition.js';

const CIK = '0000059478';
const REVENUE = 'us-gaap:Revenues';
const PRODUCT = 'srt:ProductOrServiceAxis';
const GEOGRAPHY = 'srt:StatementGeographicalAxis';
const SEGMENT = 'us-gaap:StatementBusinessSegmentsAxis';
const BLOCK = 'us-gaap:RevenueFromContractWithCustomerTextBlock';
const unavailable = (reason) => ({ status: 'unavailable', reason, items: [] });
const text = (html) => htmlToText(html || '').replace(/\s+/g, ' ').trim();
const nameKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const memberKey = (members) => JSON.stringify(Object.entries(members).sort(([a], [b]) => a.localeCompare(b)));
const fail = (reason) => { throw new Error(reason); };

export function canAttemptLillyBusinessComposition(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\.US$/, '') === 'LLY';
}

// The revenue text-block and its continuation chain identify the disclosure.
// Within that disclosure, explicit table rows/headers identify the hierarchy;
// numeric subset searches, inferred eliminations and cross-table unions are
// deliberately not used. A changed/unproven layout fails only that section.
export function inspectLillyBusinessComposition({ symbol, fiscalDate, html, filing = {} } = {}) {
  const rejected = (reason) => ({ result: null, reason });
  if (!canAttemptLillyBusinessComposition(symbol)
    || !/^\d{1,10}$/.test(String(filing.cik || ''))
    || String(filing.cik).padStart(10, '0') !== CIK) return rejected('lilly-issuer-mismatch');
  if (filing.form !== '10-Q' || filing.documentType !== 'PRIMARY') return rejected('lilly-unsupported-document-type');
  if (filing.accession && !/^\d{10}-\d{2}-\d{6}$/.test(filing.accession)) return rejected('lilly-invalid-accession');
  const generic = inspectGenericSecBusinessComposition({ symbol: 'LLY', fiscalDate, html, filing });
  if (!generic.result) return rejected(generic.reason);
  const base = generic.result;
  const { fiscalYear: year, fiscalPeriod: quarter, start, end } = base.period;
  const quarters = { Q1: ['01-01', '03-31'], Q2: ['04-01', '06-30'], Q3: ['07-01', '09-30'] };
  if (!quarters[quarter] || start !== `${year}-${quarters[quarter][0]}`
    || end !== `${year}-${quarters[quarter][1]}` || end !== fiscalDate) return rejected('lilly-quarter-focus-mismatch');
  let document;
  let disclosure;
  try {
    document = readDocument(html, base);
    validateIdentityContexts(html, document.contexts, end);
    disclosure = revenueDisclosure(html, document.contexts, end);
  } catch (error) { return rejected(error.message); }
  const tables = [...disclosure.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  const sections = {
    reportSegments: singleSegmentSection(html, document, base),
    revenueBreakdown: selectTableSection(tables, document, base, PRODUCT),
    geographies: selectTableSection(tables, document, base, GEOGRAPHY),
  };
  const complete = Object.values(sections).filter((section) => section.status === 'complete').length;
  return { result: {
    status: complete === 3 ? 'complete' : complete ? 'partial' : 'unavailable',
    currency: 'USD', totalRevenue: base.totalRevenue, previousTotalRevenue: base.previousTotalRevenue,
    period: base.period, sections,
    sourceMetadata: { provider: 'SEC', adapterId: 'lilly-revenue-disclosure-v1',
      evidence: 'official-primary-inline-xbrl-revenue-text-block', cik: CIK,
      accession: filing.accession || null, form: '10-Q' },
  }, reason: null };
}

function attributes(raw) {
  const result = {};
  for (const match of raw.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    const name = match[1].toLowerCase();
    if (Object.hasOwn(result, name)) fail('lilly-duplicate-attribute');
    result[name] = match[3];
  }
  return result;
}

function readDocument(html, base) {
  const contexts = new Map();
  for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)) {
    const a = attributes(match[1]);
    if (!a.id || contexts.has(a.id)) fail('lilly-duplicate-context');
    const entities = [...match[2].matchAll(/<xbrli:entity\b[^>]*>([\s\S]*?)<\/xbrli:entity>/gi)];
    const identifiers = entities.length === 1 ? [...entities[0][1].matchAll(/<xbrli:identifier\b([^>]*)>([^<]+)<\/xbrli:identifier>/gi)] : [];
    let valid = identifiers.length === 1
      && attributes(identifiers[0][1]).scheme === 'http://www.sec.gov/CIK'
      && /^\d{1,10}$/.test(text(identifiers[0][2]))
      && text(identifiers[0][2]).padStart(10, '0') === CIK
      && !/<xbrldi:typedMember\b/i.test(match[2]);
    const members = {};
    for (const member of match[2].matchAll(/<xbrldi:explicitMember\b([^>]*)>([\s\S]*?)<\/xbrldi:explicitMember>/gi)) {
      const dimension = attributes(member[1]).dimension;
      if (!dimension || Object.hasOwn(members, dimension)) valid = false;
      members[dimension] = text(member[2]);
    }
    const read = (tag) => text(match[2].match(new RegExp(`<xbrli:${tag}\\b[^>]*>([\\s\\S]*?)<\\/xbrli:${tag}>`, 'i'))?.[1]);
    contexts.set(a.id, { valid, members, start: read('startDate'), end: read('endDate') || read('instant') });
  }
  const units = new Map();
  for (const match of html.matchAll(/<xbrli:unit\b([^>]*)>([\s\S]*?)<\/xbrli:unit>/gi)) {
    const id = attributes(match[1]).id;
    if (!id || units.has(id)) fail('lilly-duplicate-unit');
    const measures = [...match[2].matchAll(/<xbrli:measure\b[^>]*>([\s\S]*?)<\/xbrli:measure>/gi)];
    units.set(id, !/<xbrli:divide\b/i.test(match[2]) && measures.length === 1
      && text(measures[0][1]).toLowerCase() === 'iso4217:usd');
  }
  const previous = { start: `${Number(base.period.fiscalYear) - 1}${base.period.start.slice(4)}`,
    end: `${Number(base.period.fiscalYear) - 1}${base.period.end.slice(4)}` };
  const document = { contexts, units, current: base.period, previous, values: new Map(), invalidValues: new Set() };
  for (const fact of revenueFacts(html, document)) {
    if (!fact.kind) continue;
    const key = `${fact.kind}|${memberKey(fact.context.members)}`;
    if (!fact.valid) { document.invalidValues.add(key); continue; }
    const values = document.values.get(key) || new Set();
    values.add(fact.value);
    document.values.set(key, values);
  }
  return document;
}

function revenueFacts(html, document) {
  return [...html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)]
    .flatMap((match) => {
      const a = attributes(match[1]);
      if (a.name !== REVENUE) return [];
      const context = document.contexts.get(a.contextref);
      const kind = context && ['current', 'previous'].find((key) => context.start === document[key].start && context.end === document[key].end);
      const displayed = text(match[2]);
      const dotFormatted = a.format === 'ixt:num-dot-decimal';
      // An unknown transform is not a dot-decimal number. In particular,
      // num-comma-decimal would give the same glyphs a different value.
      const validNumber = dotFormatted
        ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(displayed)
        : !a.format && /^\d+(?:\.\d+)?$/.test(displayed);
      const raw = dotFormatted ? displayed.replace(/,/g, '') : displayed;
      const scale = a.scale === undefined ? 0 : Number(a.scale);
      const value = Number(raw) * (10 ** scale) * (a.sign === '-' ? -1 : 1);
      const valid = Boolean(context?.valid && document.units.get(a.unitref)
        && (a['xsi:nil'] === undefined || a['xsi:nil'] === 'false')
        && a.continuedat === undefined && (a.sign === undefined || a.sign === '-')
        && (a.scale === undefined || /^-?\d+$/.test(a.scale)) && validNumber
        && Number.isInteger(scale) && Math.abs(scale) <= 12 && Number.isSafeInteger(value) && value >= 0);
      return [{ context, kind, value, valid }];
    });
}

function validateIdentityContexts(html, contexts, end) {
  const required = new Set(['dei:EntityCentralIndexKey', 'dei:DocumentType', 'dei:DocumentPeriodEndDate', 'dei:DocumentFiscalYearFocus', 'dei:DocumentFiscalPeriodFocus']);
  const seen = new Set();
  for (const match of html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)) {
    const a = attributes(match[1]);
    if (!required.has(a.name)) continue;
    const context = contexts.get(a.contextref);
    if (!context?.valid || context.end !== end || Object.keys(context.members).length) fail('lilly-dei-context-mismatch');
    seen.add(a.name);
  }
  if (seen.size !== required.size) fail('lilly-dei-context-mismatch');
}

// Inline continuation elements may be nested in a different text-block's
// continuation. A balanced stack is required; a flat closing-tag regex would
// truncate Lilly's final continuation before its geography disclosure.
function continuationMap(html) {
  const stack = [];
  const nodes = new Map();
  const ids = new Set();
  for (const token of html.matchAll(/<\/?ix:continuation\b[^>]*>/gi)) {
    if (/^<\//.test(token[0])) {
      const node = stack.pop();
      if (!node) fail('lilly-malformed-continuation');
      nodes.set(node.id, { ...node, html: html.slice(node.start, token.index) });
    } else {
      const a = attributes(token[0]);
      if (!a.id || ids.has(a.id) || /\/\s*>$/.test(token[0])) fail('lilly-duplicate-or-invalid-continuation');
      ids.add(a.id);
      stack.push({ id: a.id, next: a.continuedat, start: token.index + token[0].length });
    }
  }
  if (stack.length) fail('lilly-malformed-continuation');
  return nodes;
}

function revenueDisclosure(html, contexts, end) {
  const blocks = [...html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)]
    .filter((match) => attributes(match[1]).name === BLOCK);
  if (blocks.length !== 1) fail('lilly-ambiguous-or-missing-revenue-disclosure');
  const a = attributes(blocks[0][1]);
  const context = contexts.get(a.contextref);
  if (!context?.valid || context.end !== end || Object.keys(context.members).length) fail('lilly-revenue-disclosure-context-mismatch');
  const continuations = continuationMap(html);
  const seen = new Set();
  let result = blocks[0][2];
  let next = a.continuedat;
  while (next) {
    if (seen.has(next) || seen.size >= 24 || !continuations.has(next)) fail('lilly-invalid-revenue-continuation-chain');
    seen.add(next);
    const node = continuations.get(next);
    result += node.html;
    next = node.next;
  }
  if (!/disaggregation of revenue/i.test(text(result)) || !/by product/i.test(text(result))) fail('lilly-revenue-disclosure-not-supported');
  return result;
}

function selectTableSection(tables, document, base, axis) {
  try {
    const candidates = tables.filter((table) => {
      if (!/Three Months Ended/i.test(text(table))) return false;
      const facts = revenueFacts(table, document);
      if (!facts.some((fact) => fact.kind === 'current' && Object.hasOwn(fact.context.members, axis))) return false;
      return axis === PRODUCT ? /Outside U\.S\./i.test(text(table)) && /Total/i.test(text(table))
        : !facts.some((fact) => fact.context && Object.hasOwn(fact.context.members, PRODUCT));
    });
    if (candidates.length !== 1) return unavailable('lilly-ambiguous-or-missing-disclosure-table');
    return parseTable(candidates[0], document, base, axis);
  } catch (error) { return unavailable(error.message); }
}

function exactRowFact(facts, kind, axis) {
  const matching = facts.filter((fact) => fact.kind === kind && (axis
    ? Object.keys(fact.context.members).length === 1 && Object.hasOwn(fact.context.members, axis)
    : Object.keys(fact.context.members).length === 0));
  if (matching.length > 1) fail('lilly-duplicate-row-fact');
  return matching[0] || null;
}

function parseTable(table, document, base, axis) {
  if ([...table.matchAll(/<table\b/gi)].length !== 1) fail('lilly-nested-disclosure-table');
  const header = text(table.slice(0, table.search(/<ix:nonFraction\b/i)));
  const quarterEnd = { Q1: 'March 31', Q2: 'June 30', Q3: 'September 30' }[base.period.fiscalPeriod];
  const years = header.match(/\b(?:19|20|21)\d{2}\b/g) || [];
  if (!new RegExp(`Three Months Ended ${quarterEnd}`, 'i').test(header)
    || !years.includes(base.period.fiscalYear)
    || years.some((year) => ![base.period.fiscalYear, String(Number(base.period.fiscalYear) - 1)].includes(year))) {
    fail('lilly-disclosure-header-period-mismatch');
  }
  const items = [];
  const seenMembers = new Set();
  let group = null;
  let total = null;
  let priorTotal = null;
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const label = text(row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1]).replace(/\s*\(\d+\)\s*$/, '').trim();
    const facts = revenueFacts(row[1], document);
    if (facts.some((fact) => !fact.context || !fact.context.valid
      || (fact.kind && (!fact.valid || document.invalidValues.has(`${fact.kind}|${memberKey(fact.context.members)}`)
        || document.values.get(`${fact.kind}|${memberKey(fact.context.members)}`)?.size !== 1)))) {
      fail('lilly-conflicting-or-invalid-revenue-fact');
    }
    const current = exactRowFact(facts, 'current', axis);
    const previous = exactRowFact(facts, 'previous', axis);
    const root = exactRowFact(facts, 'current', null);
    if (root) {
      if (!/^Revenue$/i.test(label) || total !== null || group) fail('lilly-ambiguous-table-total');
      total = root.value;
      priorTotal = exactRowFact(facts, 'previous', null)?.value ?? null;
      continue;
    }
    if (!current) {
      if (facts.some((fact) => fact.kind === 'current') || previous) fail('lilly-missing-current-row');
      if (axis === PRODUCT && /:$/.test(label)) {
        if (group || total !== null) fail('lilly-unclosed-product-hierarchy');
        group = { label: nameKey(label), children: [] };
      }
      continue;
    }
    if (!label || total !== null) fail('lilly-invalid-disclosure-row-order');
    const member = current.context.members[axis];
    if (seenMembers.has(member) || (previous && previous.context.members[axis] !== member)) fail('lilly-duplicate-or-mismatched-member');
    seenMembers.add(member);
    if (/^Total\b/i.test(label)) {
      if (axis !== PRODUCT || !group || nameKey(label.replace(/^Total\s+/i, '')) !== group.label
        || group.children.length < 1 || group.children.reduce((sum, item) => sum + item.revenue, 0) !== current.value) {
        fail('lilly-product-subtotal-reconciliation-failed');
      }
      group = null;
      continue;
    }
    const item = { id: member.replace(':', '-').replace(/Member$/, '').toLowerCase(), label,
      labelZh: '', revenue: current.value, previousRevenue: previous?.value ?? null,
      profit: null, previousProfit: null, currency: 'USD' };
    items.push(item);
    if (group) group.children.push(item);
  }
  if (group || items.length < 2 || items.length > 24 || total !== base.totalRevenue
    || items.reduce((sum, item) => sum + item.revenue, 0) !== total) fail('lilly-disclosure-revenue-reconciliation-failed');
  const comparable = Number.isSafeInteger(base.previousTotalRevenue) && priorTotal === base.previousTotalRevenue
    && items.every((item) => Number.isSafeInteger(item.previousRevenue))
    && items.reduce((sum, item) => sum + item.previousRevenue, 0) === priorTotal;
  if (!comparable) for (const item of items) item.previousRevenue = null;
  return { status: 'complete', reason: null, items,
    metricStatus: { revenue: { status: 'complete', reason: null },
      previousRevenue: { status: comparable ? 'complete' : 'unavailable', reason: comparable ? null : 'prior-revenue-unavailable-or-not-comparable' } } };
}

function singleSegmentSection(html, document, base) {
  const facts = revenueFacts(html, document).filter((fact) => fact.kind === 'current'
    && fact.valid && Object.keys(fact.context.members).length === 1 && fact.context.members[SEGMENT]);
  const members = new Set(facts.map((fact) => fact.context.members[SEGMENT]));
  const explicitSingle = /\bWe operate as a single reportable segment\b/i.test(text(html))
    && members.size === 1 && members.has('lly:ReportableSegmentMember')
    && facts.every((fact) => fact.value === base.totalRevenue);
  return unavailable(explicitSingle ? 'single-reportable-segment' : 'lilly-reporting-segments-not-verified');
}
