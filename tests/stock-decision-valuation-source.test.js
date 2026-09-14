import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fetchStockDecisionValuationSource } from '../server/quote/stockDecisionValuationSource.js';
import { parseValuationQuarters, parseValuationReportIdentity, parseValuationGuidance, VALUATION_CIKS } from '../server/quote/stockDecisionValuationParsers.js';
import { buildStockDecisionValuation } from '../server/quote/stockDecisionValuationModel.js';

const folder = new URL('./fixtures/stock-decision-valuation/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, folder), 'utf8');
const json = name => JSON.parse(read(name));
const provenance = json('provenance.json');
const present = new Date('2026-09-14T23:00:00Z');
const releaseDates = { NVDA: ['2026-05-20', '2026-08-26'], MSFT: ['2026-04-29', '2026-07-29'], META: ['2026-04-29', '2026-07-29'] };

function replay({ patch, observed = [] } = {}) {
  const mappings = new Map();
  for (const symbol of Object.keys(VALUATION_CIKS)) {
    mappings.set(`https://data.sec.gov/submissions/CIK${VALUATION_CIKS[symbol]}.json`, read(`${symbol}-submissions.json`));
    mappings.set(`https://data.sec.gov/api/xbrl/companyfacts/CIK${VALUATION_CIKS[symbol]}.json`, read(`${symbol}-companyfacts.json`));
    for (const date of releaseDates[symbol]) {
      const document = json(`${symbol}-${date}-document.json`);
      mappings.set(document.primaryDocumentUrl, document.html);
      mappings.set(document.filingUrl, read(`${symbol}-${date}-index.html`));
    }
  }
  for (const q of [3, 4]) mappings.set(`https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q${q}`, read(`MSFT-FY2026-Q${q}-call.html`));
  for (const symbol of ['NVDA', 'MSFT']) {
    const action = json(`${symbol}-post-report-action.json`);
    mappings.set(action.url, action.html);
    if (action.indexUrl) mappings.set(action.indexUrl, action.indexHtml);
    for (const attachment of action.attachments) mappings.set(attachment.url, attachment.html);
  }
  mappings.set('https://www.sec.gov/files/company_tickers.json', read('tickers.json'));
  return async (url, options) => {
    observed.push({ url, options });
    const body = patch ? patch(url, mappings.get(url)) : mappings.get(url);
    assert.notEqual(body, undefined, `unexpected source request ${url}`);
    return new Response(body, { status: 200, headers: { 'content-type': url.endsWith('.json') ? 'application/json' : 'text/html' } });
  };
}

test('all three issuers parse two consecutive real filings using one dynamic discovery and parsing algorithm', async () => {
  const expected = { NVDA: [81615000000, 96221000000], MSFT: [82886000000, 90007000000], META: [56311000000, 60801000000] };
  for (const symbol of Object.keys(releaseDates)) {
    const reports = [];
    for (const [index, date] of releaseDates[symbol].entries()) {
      const asOf = new Date(Date.parse(`${date}T23:59:00Z`) + 2 * 86400000);
      const observed = [];
      const result = await fetchStockDecisionValuationSource({ symbol, now: asOf, fetchFn: replay({ observed }) });
      assert.equal(result.status, 'ready', `${symbol} ${date}: ${result.reason}`);
      assert.equal(result.quarters.length, 8);
      assert.equal(result.quarters.at(-1).revenue, expected[symbol][index]);
      assert.equal(result.report.periodEnd, result.quarters.at(-1).end);
      assert.ok(result.quarters.every(q => q.filedAt <= asOf.toISOString().slice(0, 10)));
      assert.ok(result.sources.every(source => source.url.startsWith('https://')));
      assert.equal(new Set(observed.map(item => item.url)).size, observed.length, 'same-run SEC metadata is fetched once');
      assert.ok(observed.every(({ options }) => options.cache === 'no-store' && options.redirect === 'error'));
      reports.push(result);
    }
    assert.ok(reports[1].report.periodEnd > reports[0].report.periodEnd);
    assert.notEqual(reports[0].report.accession, reports[1].report.accession);
    assert.notEqual(reports[0].guidance.revenue.low, reports[1].guidance.revenue.low);
  }
});

test('GAAP quarterly history preserves tax benefits and derives only additive Q4 facts', () => {
  const microsoft = parseValuationQuarters(json('MSFT-companyfacts.json'), { symbol: 'MSFT', now: present });
  const q4 = microsoft.quarters.at(-1);
  assert.equal(q4.operatingIncome, 40603000000);
  assert.equal(q4.eps, null);
  assert.equal(q4.dilutedShares, null);
  assert.equal(microsoft.latestDilutedShares.scope, 'annual');
  assert.equal(microsoft.latestDilutedShares.value, 7453000000);
  assert.equal(microsoft.latestDilutedShares.periodStart, '2025-07-01');
  assert.equal(q4.derivation.type, 'annual_less_nine_months');
  const meta = parseValuationQuarters(json('META-companyfacts.json'), { symbol: 'META', now: present });
  assert.equal(meta.quarters.find(q => q.end === '2026-03-31').incomeTax, -5021000000);
  assert.equal(meta.latestDilutedShares.scope, 'quarter');
  assert.equal(meta.latestDilutedShares.value, 2566000000);
});

test('guidance uses current GAAP numbers, correct fiscal tax scope and official annual constraints', () => {
  for (const symbol of ['NVDA', 'MSFT', 'META']) {
    const document = json(`${symbol}-${releaseDates[symbol][1]}-document.json`);
    const history = parseValuationQuarters(json(`${symbol}-companyfacts.json`), { symbol, now: present });
    const latest = history.quarters.at(-1);
    const identity = parseValuationReportIdentity(document, { symbol, cik: VALUATION_CIKS[symbol], expectedAccession: document.accession, now: present });
    const report = { ...identity, fiscalYear: latest.fiscalYear, fiscalQuarter: latest.fiscalQuarter };
    const options = { symbol, html: document.html, sourceUrl: document.primaryDocumentUrl, report, annuals: history.annuals,
      transcriptHtml: symbol === 'MSFT' ? read('MSFT-FY2026-Q4-call.html') : null,
      transcriptUrl: 'https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4' };
    const guidance = parseValuationGuidance(options);
    assert.ok(guidance, symbol);
    if (symbol === 'NVDA') {
      assert.equal(guidance.operatingExpenses.low, 9200000000, 'retain GAAP SBC and acquisition expenses');
      assert.equal(guidance.taxRate.scope, 'fiscal_year');
      assert.equal(guidance.taxRate.fiscalYear, 2027);
      assert.equal(parseValuationGuidance({ ...options, html: document.html.replace('Revenue is expected to be $108.0 billion, plus or minus 2%', 'Revenue guidance revised; refer to separate update') }), null);
    } else if (symbol === 'MSFT') {
      assert.deepEqual(guidance.costOfRevenue, { low: 29600000000, high: 29800000000 });
      assert.deepEqual(guidance.operatingExpenses, { low: 16800000000, high: 16900000000 });
      assert.equal(guidance.annualOperatingMargin.fiscalYear, 2027);
      assert.equal(guidance.annualOperatingMargin.lowExclusive, true);
      assert.equal(parseValuationGuidance({ ...options, transcriptHtml: read('MSFT-FY2026-Q3-call.html') }), null);
    } else {
      assert.equal(guidance.annualExpenses.low, 165000000000);
      assert.equal(guidance.taxRate.scope, 'remaining_year');
      assert.equal(guidance.annualOperatingIncomeFloor.value, 83276000000);
      assert.equal(guidance.annualOperatingIncomeFloor.exclusive, true);
    }
  }
});

test('a newly disclosed 8-K raises the report watermark while companyfacts are still pending', async () => {
  const result = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: new Date('2026-08-26T20:25:00Z'), fetchFn: replay() });
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'report_facts_pending');
  assert.equal(result.report.periodEnd, '2026-07-26');
  assert.equal(result.report.accession, '0001045810-26-000073');
  assert.deepEqual(result.quarters, []);
});

test('future disclosures and future-accepted facts do not enter a historical as-of result', async () => {
  const now = new Date('2026-08-26T20:00:00Z');
  const result = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now, fetchFn: replay() });
  // Intervening disclosures without saved bodies remain unverified. Even then
  // the watermark must remain Q1; the not-yet-public Q2 is unusable.
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'corporate_action_review_pending');
  assert.equal(result.report.periodEnd, '2026-04-26');
  assert.deepEqual(result.quarters, []);
  const recent = json('NVDA-submissions.json').filings.recent;
  const filings = recent.accessionNumber.map((accession, index) => ({ accession, acceptedAt: recent.acceptanceDateTime[index] }));
  const parsed = parseValuationQuarters(json('NVDA-companyfacts.json'), { symbol: 'NVDA', now, filings });
  assert.equal(parsed.status, 'ready');
  assert.equal(parsed.quarters.at(-1).end, '2026-04-26');
  assert.equal(parsed.quarters.at(-1).revenue, 81615000000);
});

test('newer submissions with stale companyfacts cannot return the older ready report', async () => {
  const observed = [];
  const result = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn: replay({ observed, patch: (url, body) => {
    if (!url.includes('/companyfacts/CIK0001045810')) return body;
    const facts = JSON.parse(body);
    for (const concept of Object.values(facts.facts['us-gaap'])) for (const [unit, entries] of Object.entries(concept.units)) {
      concept.units[unit] = entries.filter(fact => fact.end < '2026-07-26');
    }
    return JSON.stringify(facts);
  } }) });
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'report_facts_pending');
  assert.equal(result.report.periodEnd, '2026-07-26');
  assert.equal(observed.filter(item => item.url.includes('/companyfacts/')).length, 1);
});

test('issuer, units, conflicting values and missing quarterly data fail closed', () => {
  const original = json('NVDA-companyfacts.json');
  for (const mutate of [
    value => { value.cik = 1326801; },
    value => { delete value.facts['us-gaap'].IncomeTaxExpenseBenefit; },
    value => { value.facts['us-gaap'].OperatingIncomeLoss.units.EUR = value.facts['us-gaap'].OperatingIncomeLoss.units.USD; delete value.facts['us-gaap'].OperatingIncomeLoss.units.USD; },
    value => { const rows = value.facts['us-gaap'].OperatingIncomeLoss.units.USD; const row = rows.find(item => item.accn === '0001045810-26-000075' && item.start === '2026-04-27'); rows.push({ ...row, val: row.val + 10000000 }); },
    value => { const rows = value.facts['us-gaap'].IncomeTaxExpenseBenefit.units.USD; for (const row of rows.filter(item => item.accn === '0001045810-26-000075')) row.val = null; },
    value => { const rows = value.facts['us-gaap'].WeightedAverageNumberOfDilutedSharesOutstanding.units.shares; for (const row of rows.filter(item => item.accn === '0001045810-26-000075')) row.val *= 2; },
  ]) {
    const facts = structuredClone(original); mutate(facts);
    const parsed = parseValuationQuarters(facts, { symbol: 'NVDA', now: present });
    assert.equal(parsed.status, 'pending');
    assert.deepEqual(parsed.quarters, []);
  }
});

test('report identity rejects wrong accessions, future publication, malformed URL and a different issuer', () => {
  const document = json('NVDA-2026-08-26-document.json');
  const options = { symbol: 'NVDA', cik: VALUATION_CIKS.NVDA, expectedAccession: document.accession, now: present };
  for (const changes of [
    { accession: '0001045810-26-000051' }, { secCik: VALUATION_CIKS.META },
    { filedAt: '2027-01-01T00:00:00Z' }, { primaryDocumentUrl: 'not a URL' },
    { html: document.html.replace('NVIDIA (NASDAQ: NVDA)', 'Another company (NASDAQ: NVDA)') },
  ]) assert.equal(parseValuationReportIdentity({ ...document, ...changes }, options), null);
});

test('unsupported, abort and provider failures are bounded and never expose fetch error details', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const never = async () => { calls += 1; throw new Error('private network details'); };
  assert.equal((await fetchStockDecisionValuationSource({ symbol: 'AAPL', fetchFn: never })).status, 'unsupported');
  assert.equal((await fetchStockDecisionValuationSource({ symbol: 'NVDA', signal: controller.signal, fetchFn: never })).reason, 'request_aborted');
  assert.equal(calls, 0);
  const failed = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn: never });
  assert.equal(failed.reason, 'discovery_unavailable');
  assert.equal(JSON.stringify(failed).includes('private network details'), false);
  const limited = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn: async () => new Response('', { status: 429 }) });
  assert.equal(limited.reason, 'sec_rate_limited');
});

test('real fixture provenance records official URLs and collection time', () => {
  assert.ok(Number.isFinite(Date.parse(provenance.fetchedAt)));
  assert.equal(provenance.sources.filter(source => source.file?.endsWith('-document.json')).length, 6);
  assert.ok(provenance.sources.filter(source => source.url).every(source => /^https:\/\/(?:www\.sec\.gov|www\.microsoft\.com)\//.test(source.url)));
});

test('current reports remain usable after the actual later 8-K disclosures, including unchanged Microsoft total-company outlook', async () => {
  for (const symbol of ['MSFT', 'NVDA', 'META']) {
    const result = await fetchStockDecisionValuationSource({ symbol, now: present, fetchFn: replay() });
    assert.equal(result.status, 'ready', `${symbol}: ${result.reason}`);
    assert.equal(result.corporateActionCheck.status, 'checked');
    assert.equal(result.corporateActionCheck.filings.length, symbol === 'META' ? 0 : 1);
    if (symbol === 'MSFT') {
      assert.equal(result.corporateActionCheck.filings[0].guidanceUnchanged, true);
      assert.equal(result.guidance.revenue.low, 89850000000);
    }
    const model = buildStockDecisionValuation(result, { now: present.getTime() });
    assert.equal(model.status, 'available', `${symbol}: ${model.reason}`);
  }
});

test('post-report split or unparsed revised outlook suspends valuation without blocking ordinary buybacks', async () => {
  const action = json('NVDA-post-report-action.json');
  for (const [text, expected] of [
    ['NVIDIA Corporation announces a two-for-one stock split.', 'split_review_pending'],
    ['NVIDIA Corporation issued revised revenue guidance and an updated outlook.', 'guidance_update_pending'],
    ['NVIDIA Corporation announced a share repurchase authorization.', null],
  ]) {
    const result = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn: replay({ patch: (url, body) => url === action.url ? text : body }) });
    assert.equal(result.reason, expected);
    assert.equal(result.status, expected ? 'pending' : 'ready');
    if (expected) assert.deepEqual(result.quarters, []);
  }
});

test('three ordinary post-report filings are checked in two bounded runs and then reused', async () => {
  const observed = [];
  const fetchFn = replay({ observed, patch: (url, body) => {
    if (/0001045810260000(?:78|79|80)\//.test(url)) return 'NVIDIA Corporation announced a share repurchase authorization.';
    if (!url.includes('/submissions/CIK0001045810')) return body;
    const data = JSON.parse(body); const rows = data.filings.recent;
    const sourceIndex = rows.accessionNumber.indexOf('0001045810-26-000078');
    const filing = Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[sourceIndex]]));
    for (const suffix of ['000079', '000080']) {
      for (const [key, values] of Object.entries(rows)) values.unshift(key === 'accessionNumber' ? `0001045810-26-${suffix}` : filing[key]);
    }
    return JSON.stringify(data);
  } });
  const result = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn });
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'corporate_action_review_pending');
  const actionReads = () => observed.filter(item => /0001045810260000(?:78|79|80)\//.test(item.url)).length;
  assert.equal(actionReads(), 2);
  const second = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn });
  assert.equal(second.status, 'ready', second.reason);
  assert.equal(second.corporateActionCheck.filings.length, 3);
  assert.equal(actionReads(), 3);
  const third = await fetchStockDecisionValuationSource({ symbol: 'NVDA', now: present, fetchFn });
  assert.equal(third.status, 'ready', third.reason);
  assert.equal(actionReads(), 3, 'verified same-accession filings are not fetched again');
});
