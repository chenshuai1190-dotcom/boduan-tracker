import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSecWatchlistEvents } from '../server/earnings/secWatchlistDiscovery.js';
import { fetchSecWatchlistSubmissionsSource } from '../server/earnings/secOfficialActuals.js';

// Synthetic SEC-shape metadata only: these are identity/date/scheduling tests,
// not downloaded official filings or proof of real-company parser coverage.
const NOW = new Date('2026-09-09T15:00:00.000Z');
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const APPLE_URL = 'https://data.sec.gov/submissions/CIK0000320193.json';
const TESLA_URL = 'https://data.sec.gov/submissions/CIK0001318605.json';

function filing(overrides = {}) {
  return {
    accession: '0000320193-26-000101', form: '10-Q', filingDate: '2026-08-01',
    reportDate: '2026-06-27', acceptedAt: '2026-08-01T16:00:00.000Z', items: '',
    ...overrides,
  };
}

function submissions(filings = [filing()], overrides = {}) {
  return {
    cik: '320193', tickers: ['AAPL'],
    filings: { recent: {
      accessionNumber: filings.map((row) => row.accession),
      form: filings.map((row) => row.form),
      filingDate: filings.map((row) => row.filingDate),
      reportDate: filings.map((row) => row.reportDate),
      acceptanceDateTime: filings.map((row) => row.acceptedAt),
      items: filings.map((row) => row.items),
    } },
    ...overrides,
  };
}

function fakeSec(payload = submissions(), { tickerPayload = { 0: { ticker: 'AAPL', cik_str: 320193 } } } = {}) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    assert.ok([TICKERS_URL, APPLE_URL, TESLA_URL].includes(url), `unexpected SEC request: ${url}`);
    return new Response(JSON.stringify(url === TICKERS_URL ? tickerPayload : payload));
  };
  return { fetchFn, calls };
}

async function discover(payload, options = {}) {
  const mock = fakeSec(payload, options);
  const result = await discoverSecWatchlistEvents({ symbol: 'AAPL', now: NOW, fetchFn: mock.fetchFn, ...options });
  return { result, calls: mock.calls };
}

test('discovers a non-calendar fiscal period from SEC, with filing date explicitly not an earnings date', async () => {
  const { result, calls } = await discover(submissions());
  assert.equal(result.status, 'ready');
  assert.equal(result.reason, null);
  assert.deepEqual(result.events, [{
    symbol: 'AAPL', providerFiscalDate: '2026-06-27', fiscalDate: '2026-06-27',
    officialFiscalDate: '2026-06-27', reportDate: '2026-08-01',
    reportDateSource: 'sec-filing-date', filedDate: '2026-08-01',
    filedAt: '2026-08-01T16:00:00.000Z', accession: '0000320193-26-000101',
    form: '10-Q', secCik: '0000320193',
  }]);
  assert.equal(result.hasUnresolvedRelease, false);
  assert.equal(result.unresolvedRelease, null);
  assert.deepEqual(calls.map((call) => call.url), [TICKERS_URL, APPLE_URL]);
  assert.ok(calls.every((call) => call.options.signal instanceof AbortSignal));
  assert.ok(!JSON.stringify(result).includes('primaryDocument'));
});

test('known CIK saves ticker request but still verifies submissions ticker and CIK', async () => {
  const mock = fakeSec(submissions([filing()], { cik: '1318605', tickers: ['TSLA'] }));
  const result = await discoverSecWatchlistEvents({ symbol: ' tsla.us ', now: NOW, fetchFn: mock.fetchFn });
  assert.equal(result.status, 'ready');
  assert.equal(result.symbol, 'TSLA');
  assert.deepEqual(mock.calls.map((call) => call.url), [TESLA_URL]);
});

test('chooses at most two newest distinct official periods, not two duplicate or amended filings', async () => {
  const { result } = await discover(submissions([
    filing({ accession: '0000320193-26-000102', form: '10-Q/A', reportDate: '2026-07-01' }),
    filing(),
    filing({ accession: '0000320193-26-000103', filingDate: '2026-08-02', acceptedAt: '2026-08-02T12:00:00Z' }),
    filing({ accession: '0000320193-26-000090', reportDate: '2026-03-28' }),
    filing({ accession: '0000320193-26-000070', form: '10-K', reportDate: '2025-09-27' }),
    filing({ accession: '0000320193-26-000050', form: '20-F', reportDate: '2025-03-01' }),
  ]));
  assert.deepEqual(result.events.map((event) => event.fiscalDate), ['2026-06-27', '2026-03-28']);
  assert.equal(result.events[0].accession, '0000320193-26-000103');
});

test('initial discovery keeps older periodic 10-K and 20-F without a release lookback cutoff', async () => {
  const { result } = await discover(submissions([
    filing({ form: '20-F', reportDate: '2025-12-31', filingDate: '2026-03-01', acceptedAt: '' }),
    filing({ accession: '0000320193-25-000010', form: '10-K', reportDate: '2024-12-31', filingDate: '2025-03-01', acceptedAt: '' }),
  ]));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.events.map((event) => event.form), ['20-F', '10-K']);
  assert.equal(result.events[0].filedAt, '2026-03-01');
});

test('conflicting periods on the same accession fail closed instead of selecting an invented latest date', async () => {
  const { result } = await discover(submissions([
    filing(), filing({ reportDate: '2026-07-01' }),
    filing({ accession: '0000320193-26-000070', reportDate: '2026-03-28' }),
  ]));
  assert.deepEqual(result.events.map((event) => event.fiscalDate), ['2026-03-28']);
});

test('different accessions at the latest identical acceptance time make that whole period ambiguous', async () => {
  const { result } = await discover(submissions([
    filing(), filing({ accession: '0000320193-26-000102' }),
    filing({ accession: '0000320193-26-000090', reportDate: '2026-03-28', filingDate: '2026-05-01', acceptedAt: '' }),
    filing({ accession: '0000320193-25-000080', reportDate: '2025-12-27', filingDate: '2026-02-01', acceptedAt: '' }),
  ]));
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'official-periodic-filing-ambiguous');
  assert.deepEqual(result.events.map((row) => row.fiscalDate), ['2026-03-28']);
});

test('same-day different accessions cannot be ordered when either acceptance time is missing', async () => {
  for (const acceptedAt of ['', '2026-08-01T21:00:00Z']) {
    const { result } = await discover(submissions([
      filing({ acceptedAt: '' }), filing({ accession: '0000320193-26-000102', acceptedAt }),
    ]));
    assert.equal(result.status, 'pending');
    assert.equal(result.reason, 'official-periodic-filing-ambiguous');
    assert.deepEqual(result.events, []);
  }
});

test('a strictly newer accepted filing resolves earlier ties, and old out-of-window ambiguity does not block current periods', async () => {
  const { result } = await discover(submissions([
    filing(), filing({ accession: '0000320193-26-000102' }),
    filing({ accession: '0000320193-26-000103', acceptedAt: '2026-08-01T17:00:00Z' }),
    filing({ accession: '0000320193-26-000090', reportDate: '2026-03-28', filingDate: '2026-05-01', acceptedAt: '' }),
    filing({ accession: '0000320193-26-000080', reportDate: '2025-12-27', filingDate: '2026-02-01', acceptedAt: '' }),
    filing({ accession: '0000320193-26-000081', reportDate: '2025-12-27', filingDate: '2026-02-01', acceptedAt: '' }),
  ]));
  assert.equal(result.status, 'ready');
  assert.equal(result.events[0].accession, '0000320193-26-000103');
  assert.equal(result.events.length, 2);
});

test('same-day ambiguity is measured in New York even if acceptedAt crosses UTC midnight', async () => {
  const { result } = await discover(submissions([
    filing({ filingDate: '2026-08-01', acceptedAt: '' }),
    filing({ accession: '0000320193-26-000102', filingDate: '2026-08-01', acceptedAt: '2026-08-02T01:00:00Z' }),
  ]));
  assert.equal(result.reason, 'official-periodic-filing-ambiguous');
  assert.deepEqual(result.events, []);
});

test('8-K earnings releases and monthly 6-K never invent a quarter even when reportDate is present', async () => {
  for (const form of ['8-K', '6-K']) {
    const { result } = await discover(submissions([
      filing({ form, items: '2.02,9.01', reportDate: '2026-09-08', filingDate: '2026-09-08', acceptedAt: '2026-09-08T12:00:00Z' }),
    ]));
    assert.equal(result.status, 'pending');
    assert.equal(result.reason, 'needs-calendar-period');
    assert.equal(result.unresolvedReleaseReason, 'needs-calendar-period');
    assert.equal(result.hasUnresolvedRelease, true);
    assert.deepEqual(result.unresolvedRelease, {
      accession: '0000320193-26-000101', form,
      filedAt: '2026-09-08T12:00:00Z', filedDate: '2026-09-08',
    });
    assert.deepEqual(result.events, []);
  }
});

test('release flag is restricted to recent earnings 8-K / unresolved 6-K newer than periodic filing', async () => {
  for (const row of [
    filing({ form: '8-K', items: '9.01', filingDate: '2026-09-08', acceptedAt: '' }),
    filing({ form: '8-K', items: '12.02', filingDate: '2026-09-08', acceptedAt: '' }),
    filing({ form: '8-K', items: '2.02', filingDate: '2026-08-25', acceptedAt: '' }),
    filing({ form: '6-K', filingDate: '2026-08-25', acceptedAt: '' }),
  ]) {
    const { result } = await discover(submissions([row]));
    assert.equal(result.hasUnresolvedRelease, false);
    assert.equal(result.unresolvedRelease, null);
    assert.equal(result.reason, 'official-periodic-filing-not-found');
  }
  const oldRelease = filing({ accession: '0000320193-26-000109', form: '8-K', items: '2.02', filingDate: '2026-09-07', acceptedAt: '2026-09-07T16:00:00Z' });
  const newerPeriodic = filing({ filingDate: '2026-09-08', acceptedAt: '2026-09-08T16:00:00Z' });
  assert.equal((await discover(submissions([oldRelease, newerPeriodic]))).result.hasUnresolvedRelease, false);
  const release = { ...oldRelease, filingDate: '2026-09-09', acceptedAt: '2026-09-09T14:00:00Z' };
  const mixed = (await discover(submissions([release, newerPeriodic]))).result;
  assert.equal(mixed.status, 'ready');
  assert.equal(mixed.events.length, 1);
  assert.equal(mixed.hasUnresolvedRelease, true);
  assert.equal(mixed.unresolvedReleaseReason, 'needs-calendar-period');
});

test('unresolved release metadata selects the latest available accession without inventing a fiscal date', async () => {
  const { result } = await discover(submissions([
    filing({ accession: '0000320193-26-000110', form: '6-K', filingDate: '2026-09-08', acceptedAt: '' }),
    filing({ accession: '0000320193-26-000111', form: '8-K', items: '2.02', filingDate: '2026-09-08', acceptedAt: '2026-09-08T21:00:00Z' }),
    filing({ accession: '0000320193-26-000112', form: '8-K', items: '2.02', filingDate: '2026-09-09', acceptedAt: '2026-09-09T16:00:00Z' }),
  ]));
  assert.deepEqual(result.unresolvedRelease, {
    accession: '0000320193-26-000111', form: '8-K',
    filedAt: '2026-09-08T21:00:00Z', filedDate: '2026-09-08',
  });
  assert.deepEqual(result.events, []);
  const dateOnly = (await discover(submissions([
    filing({ form: '6-K', filingDate: '2026-09-08', acceptedAt: '' }),
  ]))).result;
  assert.equal(dateOnly.unresolvedRelease.filedAt, '2026-09-08');
});

test('future filing and precise future acceptedAt are rejected, including unresolved release flags', async () => {
  for (const form of ['10-Q', '8-K', '6-K']) {
    for (const dates of [
      { filingDate: '2026-09-10', acceptedAt: '' },
      { filingDate: '2026-09-09', acceptedAt: '2026-09-09T15:00:01Z' },
      { filingDate: '2026-09-09', acceptedAt: '2026-09-09T12:00:00-04:00' },
    ]) {
      const { result } = await discover(submissions([filing({ form, items: '2.02', ...dates })]));
      assert.deepEqual(result.events, []);
      assert.equal(result.hasUnresolvedRelease, false);
      assert.equal(result.unresolvedRelease, null);
    }
  }
});

test('date-only filing fallback uses New York today, and current exact acceptedAt is allowed', async () => {
  const earlyUtc = new Date('2026-09-09T01:00:00Z');
  const rejected = await discover(submissions([filing({ filingDate: '2026-09-09', acceptedAt: '' })]), { now: earlyUtc });
  assert.deepEqual(rejected.result.events, []);
  const allowed = await discover(submissions([filing({ filingDate: '2026-09-09', acceptedAt: NOW.toISOString() })]));
  assert.equal(allowed.result.events.length, 1);
});

test('invalid fiscal dates, filing dates, explicit bad acceptedAt, accession, and period after filing fail closed', async () => {
  for (const overrides of [
    { reportDate: '2026-02-30' }, { reportDate: '2026-09-01' }, { reportDate: '' },
    { filingDate: '2026-02-30' }, { filingDate: '2026-08-01junk' },
    { acceptedAt: 'not-a-date' }, { acceptedAt: '2026-02-30T12:00:00Z' },
    { acceptedAt: '2026-08-01T12:00:00' }, { acceptedAt: '2026-08-01T24:00:00Z' }, { accession: 'bad-accession' },
  ]) {
    const { result } = await discover(submissions([filing(overrides)]));
    assert.deepEqual(result.events, [], JSON.stringify(overrides));
  }
});

test('wrong or missing ticker / CIK identity never returns discovered events', async () => {
  for (const [overrides, reason] of [
    [{ tickers: ['MSFT'] }, 'sec-ticker-mismatch'], [{ tickers: [] }, 'sec-ticker-mismatch'],
    [{ cik: '789019' }, 'sec-cik-mismatch'], [{ cik: undefined }, 'sec-cik-mismatch'],
    [{ cik: 'CIK320193' }, 'sec-cik-mismatch'],
  ]) {
    const { result } = await discover(submissions([filing()], overrides));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, reason);
    assert.deepEqual(result.events, []);
    assert.equal(result.unresolvedRelease, null);
  }
});

test('invalid request is rejected without any network calls', async () => {
  const mock = fakeSec();
  for (const args of [{ symbol: '../AAPL' }, { symbol: '' }, { symbol: '-' }, { symbol: 'AAPL', now: 'invalid' }]) {
    const result = await discoverSecWatchlistEvents({ now: NOW, fetchFn: mock.fetchFn, ...args });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'invalid-sec-discovery-request');
  }
  assert.equal(mock.calls.length, 0);
});

test('unknown ticker makes only a public ticker lookup and is unavailable, not fabricated zero coverage', async () => {
  const { result, calls } = await discover(submissions(), { tickerPayload: {} });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'sec-cik-not-found');
  assert.equal(calls.length, 1);
});

test('malformed and overlarge submissions shapes fail closed', async () => {
  for (const payload of [
    submissions([], { filings: null }),
    submissions([], { filings: { recent: { accessionNumber: 'not-array' } } }),
    submissions([], { filings: { recent: { accessionNumber: new Array(10_001).fill(''), form: [] } } }),
    (() => { const value = submissions(); value.filings.recent.form = []; return value; })(),
    (() => { const value = submissions(); value.filings.recent.acceptanceDateTime = []; return value; })(),
  ]) {
    const { result } = await discover(payload);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'sec-invalid-submissions');
  }
  assert.equal((await discover(submissions([]))).result.reason, 'official-periodic-filing-not-found');
});

test('HTTP, invalid JSON and response-size failures return sanitized pending without retry loops', async () => {
  for (const [response, reason] of [
    [() => new Response('', { status: 429 }), 'sec-http-429'],
    [() => new Response('', { status: 503 }), 'sec-http-503'],
    [() => new Response('invalid-json'), 'sec-invalid-response'],
    [() => new Response('{}', { headers: { 'content-length': '25000001' } }), 'sec-response-too-large'],
  ]) {
    let requests = 0;
    const result = await discoverSecWatchlistEvents({
      symbol: 'TSLA', now: NOW, fetchFn: async () => { requests += 1; return response(); },
    });
    assert.equal(result.status, 'pending');
    assert.equal(result.reason, reason);
    assert.equal(requests, 1);
  }
});

test('bounded discovery deadline aborts a hanging source without a follow-on request', async () => {
  let requests = 0;
  let signal;
  const result = await discoverSecWatchlistEvents({
    symbol: 'AAPL', now: NOW, batchTimeoutMs: 15,
    fetchFn: async (_url, options) => { requests += 1; signal = options.signal; return new Promise(() => {}); },
  });
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'sec-request-timeout');
  assert.equal(signal.aborted, true);
  assert.equal(requests, 1);
});

test('concurrent discoveries share existing SEC in-flight requests for the same fetchFn', async () => {
  const mock = fakeSec();
  const results = await Promise.all(Array.from({ length: 5 }, () => discoverSecWatchlistEvents({
    symbol: 'AAPL', now: NOW, fetchFn: mock.fetchFn,
  })));
  assert.ok(results.every((result) => result.status === 'ready'));
  assert.deepEqual(mock.calls.map((call) => call.url), [TICKERS_URL, APPLE_URL]);
});

test('source reader only exposes bounded public filing metadata and omits documents / contacts', async () => {
  const mock = fakeSec(submissions([filing()], { addresses: { business: 'not-needed' }, phone: 'not-needed' }));
  const result = await fetchSecWatchlistSubmissionsSource({ symbol: 'AAPL', now: NOW, fetchFn: mock.fetchFn });
  assert.equal(result.status, 'ready');
  assert.deepEqual(Object.keys(result).sort(), ['filings', 'reason', 'secCik', 'status', 'symbol']);
  assert.equal(result.filings.length, 1);
  assert.ok(!JSON.stringify(result).includes('not-needed'));
});
