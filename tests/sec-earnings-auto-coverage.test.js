import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeSecEarningsCoverage,
  combineCoverageEvents,
  coverageResultRow,
  handleSecEarningsCoverageSchedule,
  runSecEarningsAutoCoverage,
  SEC_COVERAGE_RUN_LIMITS,
} from '../server/earnings/secEarningsAutoCoverage.js';
import { EARNINGS_DETAIL_PARSER_VERSION } from '../src/lib/earningsDetailPolicy.js';
import { discoverSecWatchlistEvents } from '../server/earnings/secWatchlistDiscovery.js';

// Synthetic, structurally complete SEC quarter payloads. These fixtures verify
// worker/cache contracts; they are NOT new real-company filing regressions.
const NOW = new Date('2026-09-09T15:00:00.000Z');
const OLD_ACCESSION = '0000320193-26-000100';
const NEW_ACCESSION = '0000320193-26-000101';
const RELEASE_ACCESSION = '0000320193-26-000110';
const LEASE = '00000000-0000-4000-8000-000000000001';
const noNetwork = async () => { throw new Error('Unexpected real network path in worker test'); };

function event(overrides = {}) {
  return {
    symbol: 'AAPL', fiscalDate: '2026-06-30', providerFiscalDate: '2026-06-30',
    officialFiscalDate: '2026-06-30', reportDate: '2026-07-31', accession: NEW_ACCESSION,
    form: '10-Q', filedDate: '2026-07-31', filedAt: '2026-07-31T16:00:00Z',
    reportDateSource: 'sec-filing-date', ...overrides,
  };
}

function detail(request = event(), overrides = {}) {
  const fiscalDate = request.officialFiscalDate || request.fiscalDate;
  const accession = overrides.accession || request.accession || NEW_ACCESSION;
  const form = overrides.form || '10-Q';
  const archive = `https://www.sec.gov/Archives/edgar/data/320193/${accession.replaceAll('-', '')}`;
  const start = fiscalDate === '2026-03-31' ? '2026-01-01' : '2026-04-01';
  const section = (id) => ({
    status: 'complete', reason: null,
    items: [{ id, label: id, revenue: 100_000_000, previousRevenue: 90_000_000,
      profit: 20_000_000, previousProfit: 18_000_000, currency: 'USD' }],
  });
  return {
    schemaVersion: 4, parserVersion: EARNINGS_DETAIL_PARSER_VERSION,
    symbol: request.symbol, status: overrides.status || 'complete', reason: overrides.reason || null,
    currency: 'USD', fetchedAt: NOW.toISOString(),
    period: {
      start, end: fiscalDate, fiscalDate, officialFiscalDate: fiscalDate,
      providerFiscalDate: request.providerFiscalDate || request.fiscalDate,
      reportDate: request.reportDate, fiscalYear: '2026', fiscalPeriod: start.endsWith('01-01') ? 'Q1' : 'Q2',
    },
    source: {
      provider: 'SEC', cik: '0000320193', accession, form,
      documentType: /^(8-K|6-K)$/.test(form) ? 'EX-99.1' : 'PRIMARY',
      parser: 'synthetic-sec-worker-contract',
      filedAt: overrides.filedAt || request.filedAt || `${request.reportDate}T16:00:00Z`,
      filingUrl: `${archive}/${accession}-index.html`, primaryDocumentUrl: `${archive}/quarter.htm`,
    },
    sections: { reportSegments: section('Segment'), revenueBreakdown: section('Product'), geographies: section('Country') },
  };
}

function storedRow(payload = detail()) {
  return {
    symbol: payload.symbol, official_fiscal_date: payload.period.end,
    cik: payload.source.cik, accession: payload.source.accession,
    document_type: payload.source.documentType, parser_version: EARNINGS_DETAIL_PARSER_VERSION,
    payload, checked_at: '2026-09-09T14:30:00Z', expires_at: '2026-09-09T20:30:00Z',
  };
}

function repositoryMock({ jobs = [{ symbol: 'AAPL', lease_token: LEASE, attempt_count: 1 }],
  inputs = { events: [], results: [] }, outcome = 'completed' } = {}) {
  const queue = [...jobs];
  const calls = { claim: [], inputs: [], complete: [] };
  return {
    calls,
    repository: {
      async claim(limit) { calls.claim.push(limit); return queue.splice(0, limit); },
      async inputs(symbol, today) { calls.inputs.push({ symbol, today }); return typeof inputs === 'function' ? inputs(symbol) : inputs; },
      async complete(job, payload) {
        calls.complete.push({ job: structuredClone(job), payload: structuredClone(payload) });
        return { outcome, stored: outcome === 'completed' ? payload.results?.length || 0 : 0 };
      },
    },
  };
}

async function run(mock, options = {}) {
  return runSecEarningsAutoCoverage({
    repository: mock.repository, now: NOW, fetchFn: noNetwork,
    discover: async () => ({ status: 'ready', reason: null, events: [event()], hasUnresolvedRelease: false }),
    fetchDetail: async (request) => detail(request), ...options,
  });
}

test('worker fixtures have verified SEC URLs, quarter identity and non-empty numeric sections', () => {
  const payload = detail();
  assert.ok(coverageResultRow(payload, 'AAPL', NOW));
  assert.equal(coverageResultRow(payload, 'MSFT', NOW), null);
  const missingStart = structuredClone(payload);
  delete missingStart.period.start;
  assert.equal(coverageResultRow(missingStart, 'AAPL', NOW), null);
  const fakeSource = structuredClone(payload);
  fakeSource.source.primaryDocumentUrl = 'https://example.com/not-sec.htm';
  assert.equal(coverageResultRow(fakeSource, 'AAPL', NOW), null);
});

test('transient discovery failures remain pending with a short retry, not unavailable for one day', async () => {
  for (const reason of ['sec-http-429', 'sec-http-503', 'sec-request-timeout', 'sec-network-error']) {
    const mock = repositoryMock();
    const report = await run(mock, {
      discover: async () => ({ status: 'pending', reason, events: [], hasUnresolvedRelease: false }),
      fetchDetail: async () => assert.fail('no period is available to parse'),
    });
    const completion = mock.calls.complete[0].payload;
    assert.equal(completion.status, 'pending');
    assert.equal(completion.reason, reason);
    assert.ok(completion.delaySeconds > 0 && completion.delaySeconds <= 3600);
    assert.deepEqual(completion.results, []);
    assert.equal(report.failed, 0);
  }
});

test('calendar and SEC events merge into one official period while retaining calendar/provider coordinates', async () => {
  const calendar = { symbol: 'AAPL', fiscalDate: '2026-06-30', reportDate: '2026-07-30' };
  const official = event({ fiscalDate: '2026-06-27', providerFiscalDate: '2026-06-27', officialFiscalDate: '2026-06-27' });
  const previous = event({ fiscalDate: '2026-03-31', providerFiscalDate: '2026-03-31', officialFiscalDate: '2026-03-31', reportDate: '2026-05-01', filedAt: '2026-05-01T16:00:00Z', accession: OLD_ACCESSION });
  const merged = combineCoverageEvents('AAPL', [calendar], [official, previous], '2026-09-09');
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((row) => row.fiscalDate), ['2026-06-27', '2026-03-31']);
  assert.equal(merged[0].providerFiscalDate, '2026-06-30');
  assert.equal(merged[0].reportDate, '2026-07-30');
  assert.equal(merged[0].accession, NEW_ACCESSION);
  const fetched = [];
  const mock = repositoryMock({ inputs: { events: [calendar], results: [] } });
  await run(mock, {
    discover: async () => ({ status: 'ready', events: [official, previous], hasUnresolvedRelease: false }),
    fetchDetail: async (request) => { fetched.push(request.fiscalDate); return detail(request); },
  });
  assert.deepEqual(fetched, ['2026-06-27', '2026-03-31']);
  assert.equal(mock.calls.complete[0].payload.results.length, 2);
});

test('budget exit retains the completed quarter but marks the unfinished job partial with short retry', async () => {
  let milliseconds = 0;
  const previous = event({ fiscalDate: '2026-03-31', providerFiscalDate: '2026-03-31', officialFiscalDate: '2026-03-31', reportDate: '2026-05-01', filedAt: '2026-05-01T16:00:00Z', accession: OLD_ACCESSION });
  const mock = repositoryMock({ inputs: () => { milliseconds = 20_000; return { events: [], results: [] }; } });
  let parsed = 0;
  const report = await run(mock, {
    clock: () => milliseconds,
    discover: async () => { milliseconds += 6000; return { status: 'ready', events: [event(), previous], hasUnresolvedRelease: false }; },
    fetchDetail: async (request) => { milliseconds += 7000; parsed += 1; return detail(request); },
  });
  const completion = mock.calls.complete[0].payload;
  assert.equal(parsed, 1);
  assert.equal(completion.status, 'partial');
  assert.equal(completion.reason, 'worker-time-budget');
  assert.equal(completion.results.length, 1);
  assert.equal(completion.events.length, 2);
  assert.equal(completion.events[0].status, 'complete');
  assert.equal(completion.events[1].status, 'pending');
  assert.equal(completion.events[1].expected_accession, OLD_ACCESSION);
  assert.equal(completion.events[1].reason, 'worker-time-budget');
  assert.ok(completion.delaySeconds <= 3600);
  assert.equal(report.deferred, 1);
});

test('a later SEC request budget exit retains completed results without failing the run', async () => {
  const previous = event({ fiscalDate: '2026-03-31', providerFiscalDate: '2026-03-31', officialFiscalDate: '2026-03-31', reportDate: '2026-05-01', filedAt: '2026-05-01T16:00:00Z', accession: OLD_ACCESSION });
  const mock = repositoryMock();
  let parsed = 0;
  const report = await run(mock, {
    discover: async () => ({ status: 'ready', events: [event(), previous], hasUnresolvedRelease: false }),
    fetchDetail: async (request) => {
      parsed += 1;
      if (parsed === 2) throw Object.assign(new Error('Raw private diagnostics must not be returned'), { code: 'sec-request-budget' });
      return detail(request);
    },
  });
  const completion = mock.calls.complete[0].payload;
  assert.equal(report.failed, 0);
  assert.equal(report.success, true);
  assert.equal(report.deferred, 1);
  assert.equal(report.processed, 1);
  assert.equal(report.stored, 1);
  assert.equal(report.bounded, true);
  assert.equal(completion.status, 'partial');
  assert.equal(completion.reason, 'sec-request-budget');
  assert.ok(completion.delaySeconds <= 3600);
  assert.equal(completion.results.length, 1);
  assert.equal(completion.results[0].accession, NEW_ACCESSION);
  assert.equal(completion.events.length, 2);
  assert.equal(completion.events[0].status, 'complete');
  assert.equal(completion.events[1].status, 'pending');
  assert.equal(completion.events[1].expected_accession, OLD_ACCESSION);
  assert.equal(completion.events[1].reason, 'sec-request-budget');
  assert.ok(!JSON.stringify(completion).includes('Raw private diagnostics'));
});

test('inputs finishing at the start-budget boundary defer instead of failing, and no write starts after forty seconds', async () => {
  for (const [finishedAt, expectedStatus, expectedParsed] of [
    [31_999, 'complete', 1], [32_000, 'pending', 0], [39_999, 'pending', 0], [40_000, null, 0],
  ]) {
    let milliseconds = 0;
    let parsed = 0;
    let discovered = 0;
    const mock = repositoryMock({ inputs: () => { milliseconds = finishedAt; return { events: [], results: [] }; } });
    const report = await run(mock, {
      clock: () => milliseconds,
      discover: async () => { discovered += 1; return { status: 'ready', events: [event()], hasUnresolvedRelease: false }; },
      fetchDetail: async (request) => { parsed += 1; return detail(request); },
    });
    assert.equal(report.success, true, `input finished at ${finishedAt}`);
    assert.equal(report.failed, 0);
    assert.equal(report.deferred, expectedParsed ? 0 : 1);
    assert.equal(parsed, expectedParsed);
    assert.equal(discovered, expectedParsed);
    assert.equal(mock.calls.complete.length, expectedStatus ? 1 : 0);
    if (expectedStatus) {
      assert.equal(mock.calls.complete[0].payload.status, expectedStatus);
      assert.equal(report.processed, 1);
      if (expectedStatus === 'pending') {
        assert.equal(mock.calls.complete[0].payload.reason, 'worker-time-budget');
        assert.deepEqual(mock.calls.complete[0].payload.results, []);
      }
    } else assert.equal(report.processed, 0);
  }
});

test('a failed or invalid deferral write remains a failed run; stale leases are not reported as persisted', async () => {
  for (const mode of ['store-error', 'invalid-response', 'stale']) {
    let milliseconds = 0;
    const mock = repositoryMock({ inputs: () => { milliseconds = 32_000; return { events: [], results: [] }; } });
    mock.repository.complete = async () => {
      if (mode === 'store-error') throw Object.assign(new Error('private database body'), { code: 'sec-coverage-store-unavailable' });
      return mode === 'stale' ? { outcome: 'stale', stored: 0 } : { outcome: 'unexpected' };
    };
    const report = await run(mock, { clock: () => milliseconds });
    assert.equal(report.deferred, 1);
    assert.equal(report.processed, 0);
    assert.equal(report.stored, 0);
    assert.equal(report.failed, mode === 'stale' ? 0 : 1);
    assert.equal(report.success, mode === 'stale');
    assert.equal(report.staleWrites, mode === 'stale' ? 1 : 0);
    assert.ok(!JSON.stringify(report).includes('private database body'));
  }
});

test('only explicit worker budgets are soft exits; real parse/network exceptions remain failures', async () => {
  for (const code of ['sec-network-error', 'sec-request-timeout', 'sec-coverage-store-unavailable', 'unexpected-parser-error']) {
    const mock = repositoryMock();
    const report = await run(mock, { fetchDetail: async () => {
      throw Object.assign(new Error('private parse or network diagnostics'), { code });
    } });
    assert.equal(report.failed, 1, code);
    assert.equal(report.success, false, code);
    assert.equal(report.deferred, 0, code);
    assert.equal(mock.calls.complete[0].payload.status, 'error');
    assert.equal(mock.calls.complete[0].payload.reason, code);
    assert.ok(!JSON.stringify(report).includes('private parse or network diagnostics'));
  }
});

test('structured pending discovery budget remains deferred without becoming a failure', async () => {
  const mock = repositoryMock();
  const report = await run(mock, {
    discover: async () => ({ status: 'pending', reason: 'sec-request-budget', events: [], hasUnresolvedRelease: false }),
  });
  assert.equal(report.failed, 0);
  assert.equal(report.success, true);
  assert.equal(report.deferred, 1);
  assert.equal(report.bounded, true);
  assert.equal(mock.calls.complete[0].payload.status, 'pending');
  assert.equal(mock.calls.complete[0].payload.reason, 'sec-request-budget');
});

test('max jobs, claim batch and active discovery concurrency stay bounded', async () => {
  const jobs = Array.from({ length: 100 }, (_, index) => ({ symbol: `TEST${index}`, lease_token: LEASE }));
  const mock = repositoryMock({ jobs });
  let active = 0;
  let peak = 0;
  const report = await run(mock, {
    maxJobs: 100,
    discover: async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { status: 'pending', reason: 'official-periodic-filing-not-found', events: [], hasUnresolvedRelease: false };
    },
  });
  assert.equal(report.claimed, SEC_COVERAGE_RUN_LIMITS.jobs);
  assert.equal(report.processed, SEC_COVERAGE_RUN_LIMITS.jobs);
  assert.equal(peak, 3);
  assert.ok(mock.calls.claim.every((limit) => limit <= 12));
  assert.equal(report.bounded, true);
  const small = repositoryMock({ jobs });
  assert.equal((await run(small, { maxJobs: 2, discover: async () => ({ status: 'ready', events: [], hasUnresolvedRelease: false }) })).claimed, 2);
});

test('late errors allow one bounded final write before forty seconds and no new retry after the deadline', async () => {
  for (const [errorAt, expectedWrites] of [[36_000, 1], [39_999, 1], [40_000, 0]]) {
    let milliseconds = 0;
    const mock = repositoryMock({ inputs: () => {
      milliseconds = errorAt;
      throw Object.assign(new Error('store timed out'), { code: 'sec-coverage-store-unavailable' });
    } });
    const originalComplete = mock.repository.complete;
    mock.repository.complete = async (...args) => { milliseconds += 4000; return originalComplete(...args); };
    const report = await run(mock, { clock: () => milliseconds });
    assert.equal(mock.calls.complete.length, expectedWrites);
    assert.equal(report.failed, 1);
    assert.equal(report.success, false);
    assert.equal(report.deferred, expectedWrites ? 0 : 1);
    assert.equal(report.processed, 0);
    assert.ok(milliseconds <= 44_000);
  }
});

test('four-second database operations cannot make a claimed batch drain past sixty seconds', async () => {
  let milliseconds = 0;
  let claimCalls = 0;
  let inputCalls = 0;
  let completionCalls = 0;
  const completedSymbols = new Set();
  const jobs = Array.from({ length: 12 }, (_, index) => ({ symbol: `TEST${index}`, lease_token: LEASE }));
  const slowRepository = {
    async claim() { claimCalls += 1; milliseconds += 4000; return claimCalls === 1 ? jobs : []; },
    async inputs() { inputCalls += 1; milliseconds += 4000; return { events: [], results: [] }; },
    async complete(job) {
      completionCalls += 1; completedSymbols.add(job.symbol); milliseconds += 4000;
      throw Object.assign(new Error('four-second store timeout'), { code: 'sec-coverage-store-unavailable' });
    },
  };
  const report = await runSecEarningsAutoCoverage({
    repository: slowRepository, now: NOW, clock: () => milliseconds, fetchFn: noNetwork,
    discover: async () => ({ status: 'ready', events: [], hasUnresolvedRelease: false }),
    fetchDetail: async () => assert.fail('no financial event is present'),
  });
  // Every individual database operation costs four virtual seconds, even when
  // real concurrency could overlap them; this deliberately overestimates time.
  assert.ok(milliseconds <= 60_000, `batch consumed ${milliseconds} ms`);
  assert.equal(report.claimed, 12);
  assert.equal(claimCalls, 1);
  assert.ok(inputCalls < jobs.length);
  assert.ok(completedSymbols.size < jobs.length, 'unstarted jobs must retain leases, not flush individually');
  assert.ok(completionCalls <= 6);
  assert.ok(report.deferred > 0);
  assert.equal(report.processed, 0);
});

test('fresh unchanged filing reuses verified shared data without parsing or writing a replacement result', async () => {
  const cached = storedRow();
  const snapshot = structuredClone(cached);
  const mock = repositoryMock({ inputs: { events: [], results: [cached] } });
  const report = await run(mock, { fetchDetail: async () => assert.fail('fresh same accession should be reused') });
  assert.equal(report.reused, 1);
  assert.equal(report.stored, 0);
  assert.equal(mock.calls.complete[0].payload.status, 'complete');
  assert.deepEqual(mock.calls.complete[0].payload.results, []);
  assert.deepEqual(cached, snapshot);
});

test('no discovered filing never writes an empty financial payload over stored data', async () => {
  const cached = storedRow();
  const snapshot = structuredClone(cached);
  const mock = repositoryMock({ inputs: { events: [], results: [cached] } });
  await run(mock, {
    discover: async () => ({ status: 'pending', reason: 'official-periodic-filing-not-found', events: [], hasUnresolvedRelease: false }),
    fetchDetail: async () => assert.fail('no event should be fabricated'),
  });
  assert.deepEqual(mock.calls.complete[0].payload.results, []);
  assert.deepEqual(cached, snapshot);
});

test('stale lease completion does not claim processing or newly persisted rows', async () => {
  const mock = repositoryMock({ outcome: 'stale' });
  const report = await run(mock);
  assert.equal(report.staleWrites, 1);
  assert.equal(report.processed, 0);
  assert.equal(report.stored, 0);
  assert.equal(report.failed, 0);
  assert.equal(mock.calls.complete.length, 1);
  assert.equal(mock.calls.complete[0].job.lease_token, LEASE);
});

test('a newly discovered accession bypasses an older shared cache and records expected_accession', async () => {
  const old = storedRow(detail(event(), { accession: OLD_ACCESSION, filedAt: '2026-07-30T16:00:00Z' }));
  const mock = repositoryMock({ inputs: { events: [], results: [old] } });
  let fetched = 0;
  const report = await run(mock, { fetchDetail: async (request) => { fetched += 1; return detail(request); } });
  assert.equal(fetched, 1);
  assert.equal(report.reused, 0);
  const completion = mock.calls.complete[0].payload;
  assert.equal(completion.results[0].accession, NEW_ACCESSION);
  assert.equal(completion.events[0].expected_accession, NEW_ACCESSION);
  assert.equal(completion.events[0].status, 'complete');
});

test('a fetch that still returns the older accession cannot satisfy the newly discovered event', async () => {
  const mock = repositoryMock();
  await run(mock, { fetchDetail: async (request) => detail(request, { accession: OLD_ACCESSION }) });
  const completion = mock.calls.complete[0].payload;
  assert.deepEqual(completion.results, []);
  assert.equal(completion.events[0].expected_accession, NEW_ACCESSION);
  assert.equal(completion.events[0].status, 'unavailable');
  assert.notEqual(completion.status, 'complete');
});

test('unresolved release is cleared only by its exact parsed accession, not an unrelated completed event', async () => {
  const requested = { symbol: 'AAPL', fiscalDate: '2026-06-30', reportDate: '2026-09-08' };
  for (const [accession, expected] of [[RELEASE_ACCESSION, 'complete'], [OLD_ACCESSION, 'partial']]) {
    const mock = repositoryMock({ inputs: { events: [requested], results: [] } });
    await run(mock, {
      discover: async () => ({ status: 'ready', events: [], hasUnresolvedRelease: true,
        unresolvedRelease: { accession: RELEASE_ACCESSION, form: '8-K', filedAt: '2026-09-08T16:00:00Z', filedDate: '2026-09-08' } }),
      fetchDetail: async (request) => detail(request, { accession, form: '8-K', filedAt: '2026-09-08T16:00:00Z' }),
    });
    assert.equal(mock.calls.complete[0].payload.status, expected);
    if (expected === 'partial') assert.equal(mock.calls.complete[0].payload.reason, 'needs-calendar-period');
  }
});

test('release-only pending discovery becomes complete after its exact release is parsed with calendar-provided quarter', async () => {
  const requested = { symbol: 'AAPL', fiscalDate: '2026-06-30', reportDate: '2026-09-08' };
  const mock = repositoryMock({ inputs: { events: [requested], results: [] } });
  const requests = [];
  await run(mock, {
    discover: discoverSecWatchlistEvents,
    fetchFn: async (url) => {
      requests.push(url);
      if (url === 'https://www.sec.gov/files/company_tickers.json') {
        return new Response(JSON.stringify({ 0: { ticker: 'AAPL', cik_str: 320193 } }));
      }
      assert.equal(url, 'https://data.sec.gov/submissions/CIK0000320193.json');
      return new Response(JSON.stringify({ cik: '320193', tickers: ['AAPL'], filings: { recent: {
        accessionNumber: [RELEASE_ACCESSION], form: ['8-K'], filingDate: ['2026-09-08'],
        reportDate: ['2026-09-08'], acceptanceDateTime: ['2026-09-08T16:00:00Z'], items: ['2.02,9.01'],
      } } }));
    },
    fetchDetail: async (request) => detail(request, { accession: RELEASE_ACCESSION, form: '8-K', filedAt: '2026-09-08T16:00:00Z' }),
  });
  assert.equal(requests.length, 2);
  const completion = mock.calls.complete[0].payload;
  assert.equal(completion.results.length, 1);
  assert.equal(completion.status, 'complete');
  assert.equal(completion.reason, null);
});

test('worker SEC fetch rejects non-SEC hosts, credentials, insecure URLs and custom ports before network', async () => {
  for (const url of [
    'https://eodhd.com/api/test', 'https://ir.example.com/report', 'https://www.sec.gov.evil.test/report',
    'http://www.sec.gov/report', 'https://user:secret@www.sec.gov/report', 'https://www.sec.gov:444/report',
  ]) {
    const mock = repositoryMock();
    let requests = 0;
    const report = await run(mock, {
      fetchFn: async () => { requests += 1; return new Response('{}'); },
      discover: async ({ fetchFn }) => { await fetchFn(url); return { status: 'ready', events: [] }; },
    });
    assert.equal(requests, 0, url);
    assert.equal(report.secRequests, 0);
    assert.equal(report.failed, 1);
    assert.equal(mock.calls.complete[0].payload.reason, 'non-sec-request-blocked');
  }
});

test('public SEC requests force GET and forbid redirects', async () => {
  const mock = repositoryMock();
  const requests = [];
  const report = await run(mock, {
    fetchFn: async (url, options) => { requests.push({ url, options }); return new Response('{}'); },
    discover: async ({ fetchFn }) => {
      await fetchFn('https://data.sec.gov/submissions/CIK0000320193.json', { method: 'POST', redirect: 'follow' });
      return { status: 'ready', events: [], hasUnresolvedRelease: false };
    },
  });
  assert.equal(report.secRequests, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.redirect, 'error');
});

test('one run cannot send more than 100 SEC requests even when an injected discovery tries to exceed it', async (t) => {
  let fakeWallClock = NOW.getTime();
  t.mock.method(Date, 'now', () => { fakeWallClock += 251; return fakeWallClock; });
  const mock = repositoryMock();
  let requests = 0;
  const report = await run(mock, {
    clock: () => 0,
    fetchFn: async () => { requests += 1; return new Response('{}'); },
    discover: async ({ fetchFn }) => {
      for (let index = 0; index < 101; index += 1) await fetchFn('https://data.sec.gov/submissions/CIK0000320193.json');
      return { status: 'ready', events: [] };
    },
  });
  assert.equal(requests, 100);
  assert.equal(report.secRequests, SEC_COVERAGE_RUN_LIMITS.requests);
  assert.equal(mock.calls.complete[0].payload.reason, 'sec-request-budget');
  assert.equal(mock.calls.complete[0].payload.status, 'pending');
  assert.equal(report.success, true);
  assert.equal(report.failed, 0);
  assert.equal(report.deferred, 1);
  assert.equal(report.bounded, true);
  assert.equal(mock.calls.claim.length, 1);
});

test('an aborted individual SEC request is not mislabeled as the worker budget', async () => {
  const mock = repositoryMock();
  const controller = new AbortController();
  controller.abort();
  const report = await run(mock, {
    fetchFn: async () => assert.fail('aborted request must not reach the network'),
    discover: async ({ fetchFn }) => {
      await fetchFn('https://data.sec.gov/submissions/CIK0000320193.json', { signal: controller.signal });
    },
  });
  assert.equal(report.failed, 1);
  assert.equal(report.success, false);
  assert.equal(report.deferred, 0);
  assert.equal(report.secRequests, 0);
  assert.equal(mock.calls.complete[0].payload.reason, 'sec-request-timeout');
});

function responseMock() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('schedule rejects wrong credentials, absent secret and method; disabled flag never runs worker', async () => {
  const goodSecret = 'synthetic-cron-secret';
  const enabled = { CRON_SECRET: goodSecret, SEC_EARNINGS_AUTO_COVERAGE_ENABLED: 'true' };
  assert.deepEqual(authorizeSecEarningsCoverage({ headers: { authorization: `Bearer ${goodSecret}` } }, enabled), { ok: true });
  for (const [req, env, expected] of [
    [{ method: 'GET', headers: { authorization: 'Bearer wrong' } }, enabled, 401],
    [{ method: 'GET', headers: { authorization: `Bearer ${goodSecret}` } }, {}, 503],
    [{ method: 'POST', headers: { authorization: `Bearer ${goodSecret}` } }, enabled, 405],
    [{ method: 'GET', headers: { authorization: `Bearer ${goodSecret}` } }, { ...enabled, SEC_EARNINGS_AUTO_COVERAGE_ENABLED: 'false' }, 200],
  ]) {
    const res = responseMock();
    await handleSecEarningsCoverageSchedule(req, res, { env, run: async () => assert.fail('scheduler must not run') });
    assert.equal(res.statusCode, expected);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    if (expected === 200) assert.deepEqual(res.body, { success: true, enabled: false });
    assert.ok(!JSON.stringify(res.body).includes(goodSecret));
  }
});

test('authorized enabled schedule executes and sanitizes worker failures', async () => {
  const env = { CRON_SECRET: 'synthetic-cron-secret', SEC_EARNINGS_AUTO_COVERAGE_ENABLED: 'true' };
  const req = { method: 'GET', headers: { authorization: 'Bearer synthetic-cron-secret' } };
  const success = responseMock();
  let called = 0;
  await handleSecEarningsCoverageSchedule(req, success, { env, run: async () => { called += 1; return { success: true, processed: 2 }; } });
  assert.equal(called, 1);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.body, { success: true, processed: 2, enabled: true });
  const failed = responseMock();
  await handleSecEarningsCoverageSchedule(req, failed, { env, run: async () => { throw new Error('secret-provider-raw-body'); } });
  assert.equal(failed.statusCode, 503);
  assert.ok(!JSON.stringify(failed.body).includes('secret-provider-raw-body'));
});

test('schedule returns 200 for a normal time-budget deferral and 503 for a real store error at the same boundary', async () => {
  const env = { CRON_SECRET: 'synthetic-cron-secret', SEC_EARNINGS_AUTO_COVERAGE_ENABLED: 'true' };
  const req = { method: 'GET', headers: { authorization: 'Bearer synthetic-cron-secret' } };
  for (const storeFails of [false, true]) {
    let milliseconds = 0;
    const mock = repositoryMock({ inputs: () => {
      milliseconds = 32_000;
      if (storeFails) throw Object.assign(new Error('private store error'), { code: 'sec-coverage-store-unavailable' });
      return { events: [], results: [] };
    } });
    const res = responseMock();
    await handleSecEarningsCoverageSchedule(req, res, {
      env, run: () => run(mock, { clock: () => milliseconds }),
    });
    assert.equal(res.statusCode, storeFails ? 503 : 200);
    assert.equal(res.body.failed, storeFails ? 1 : 0);
    assert.equal(res.body.success, !storeFails);
    assert.equal(res.body.enabled, true);
    assert.ok(!JSON.stringify(res.body).includes('private store error'));
  }
});
