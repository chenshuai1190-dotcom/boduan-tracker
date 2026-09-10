import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COVERAGE_LIMITS,
  runEarningsDetailCoverage,
  summarizeCoverageDetail,
  validateCoverageEvents,
} from '../server/earnings/earningsDetailCoverage.js';
import { parseCoverageArgs } from '../scripts/earnings-detail-coverage.mjs';

const event = { symbol: 'GOOGL', fiscalDate: '2026-06-30', reportDate: '2026-07-29' };
const now = new Date('2026-09-09T00:00:00Z');
const userAgent = 'CoverageFixture/1.0 test@example.invalid';
const section = (count, status = 'complete', reason = null) => ({
  status, reason, items: Array.from({ length: count }, () => ({ revenue: 123456789 })),
});
const completeDetail = () => ({
  status: 'complete',
  reason: null,
  source: { provider: 'SEC', form: '10-Q', documentType: 'PRIMARY', parser: 'generic-10q-v1' },
  sections: { reportSegments: section(3), revenueBreakdown: section(4), geographies: section(2) },
});

test('coverage defaults to an input-only plan and omits unrelated input fields', async () => {
  const report = await runEarningsDetailCoverage({
    events: [{ ...event, symbol: 'googl.US', userId: 'private-user', token: 'private-token', shares: 123 }],
    now,
    fetchDetail: () => assert.fail('plan must not call detail'),
    fetchFn: () => assert.fail('plan must not request anything'),
  });
  assert.equal(report.mode, 'plan');
  assert.equal(report.secRequests, 0);
  assert.equal(report.attemptedEvents, 0);
  assert.equal(report.coverage, null);
  assert.equal(report.rows[0].symbol, 'GOOGL');
  assert.equal(report.rows[0].status, 'planned');
  assert.equal(report.rows[0].source.documentType, null);
  assert.doesNotMatch(JSON.stringify(report), /private-user|private-token|shares/);
});

test('coverage validates all events before any call, including dates, limits and duplicates', async () => {
  for (const events of [
    [], {}, Array.from({ length: 21 }, (_, i) => ({ ...event, symbol: `SYM${i}` })),
    [event, { ...event, symbol: 'GOOGL.US' }],
    [{ ...event, fiscalDate: '2026-02-30' }],
    [{ ...event, reportDate: '2027-07-29' }],
    [{ ...event, symbol: 'https://evil.invalid' }],
    [{ ...event, fiscalDate: ['2026-06-30'] }],
  ]) {
    await assert.rejects(runEarningsDetailCoverage({
      events, live: true, userAgent, now,
      fetchDetail: () => assert.fail('invalid batch must not start'),
    }));
  }
  const [normalized] = validateCoverageEvents([{
    ...event, symbol: 'AMD', fiscalDate: '2026-06-27', providerFiscalDate: '2026-06-30',
  }]);
  assert.equal(normalized.officialFiscalDate, '2026-06-27');
  assert.equal(normalized.providerFiscalDate, '2026-06-30');
});

test('live requires explicit User-Agent and never falls back to local environment files', async () => {
  for (const invalid of ['', ' ', 'app\nsecret']) {
    await assert.rejects(runEarningsDetailCoverage({
      events: [event], live: true, userAgent: invalid, now,
      fetchDetail: () => assert.fail('must require valid User-Agent first'),
    }), /live-requires-valid-SEC_USER_AGENT/);
  }
});

test('live executes events sequentially once and reports only source identity and section counts', async () => {
  const visited = [];
  let active = 0;
  const report = await runEarningsDetailCoverage({
    events: [event, { ...event, symbol: 'AMD' }], live: true, userAgent, now,
    fetchDetail: async (request) => {
      active += 1;
      assert.equal(active, 1);
      assert.equal(request.requestIntervalMs, 250);
      assert.equal(request.batchTimeoutMs, COVERAGE_LIMITS.eventTimeoutMs);
      assert.equal(request.userAgent, userAgent);
      visited.push(request.symbol);
      await Promise.resolve();
      active -= 1;
      if (request.symbol === 'GOOGL') return completeDetail();
      return {
        ...completeDetail(), status: 'partial', reason: 'one-or-more-sections-unavailable',
        sections: { reportSegments: section(2), revenueBreakdown: section(0, 'unavailable', 'reconciliation-failed') },
      };
    },
  });
  assert.deepEqual(visited, ['GOOGL', 'AMD']);
  assert.equal(report.attemptedEvents, 2);
  assert.deepEqual(report.coverage, { coveredEvents: 2, totalEvents: 2 });
  assert.deepEqual(report.rows[0].source, {
    provider: 'SEC', form: '10-Q', documentType: 'PRIMARY', parser: 'generic-10q-v1',
  });
  assert.deepEqual(report.rows[0].sections.reportSegments, { status: 'complete', count: 3, reason: null });
  assert.equal(report.rows[1].sections.revenueBreakdown.reason, 'reconciliation-failed');
  assert.equal(report.rows[1].sections.geographies.reason, 'section-missing-or-invalid');
  assert.doesNotMatch(JSON.stringify(report), /123456789|test@example|User-Agent/);
});

test('summary preserves specific failures without claiming unsupported metadata or non-SEC coverage', () => {
  const pending = summarizeCoverageDetail(event, {
    status: 'pending', reason: 'sec-unavailable', failureReason: 'sec-http-403',
    sections: {},
  });
  assert.equal(pending.failureReason, 'sec-http-403');
  assert.equal(pending.source.form, null);
  assert.equal(pending.source.documentType, null);
  assert.equal(pending.source.parser, null);
  const nonSec = summarizeCoverageDetail(event, {
    ...completeDetail(), source: { provider: 'TSMC', form: '6-K' },
  });
  assert.equal(nonSec.status, 'unavailable');
  assert.equal(nonSec.reason, 'non-sec-source-excluded');
  assert.ok(Object.values(nonSec.sections).every((value) => value.count === 0));
  const malicious = summarizeCoverageDetail(event, {
    ...completeDetail(), reason: 'secret@example.com', failureReason: 'https://foo?api_token=secret',
  });
  assert.equal(malicious.reason, null);
  assert.equal(malicious.failureReason, null);
});

test('live guards SEC-only GET requests and disables redirect following without retry', async () => {
  const requests = [];
  const report = await runEarningsDetailCoverage({
    events: [event, { ...event, symbol: 'AMD' }], live: true, userAgent, now,
    fetchDetail: async ({ symbol, fetchFn }) => {
      if (symbol === 'GOOGL') {
        await fetchFn('https://data.sec.gov/submissions/CIK0001652044.json');
        await fetchFn('https://eodhd.com/api/private?api_token=hidden');
      }
      throw new Error('sensitive-token-in-exception');
    },
    fetchFn: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(report.rows[0].reason, 'non-sec-request-blocked');
  assert.equal(report.rows[1].reason, 'detail-call-failed');
  assert.equal(report.attemptedEvents, 2);
  assert.equal(report.secRequests, 1);
  assert.doesNotMatch(JSON.stringify(report), /hidden|sensitive-token|api_token/);
});

test('live stops at per-event and total request caps without dropping later event diagnostics', async () => {
  let actualRequests = 0;
  const report = await runEarningsDetailCoverage({
    events: Array.from({ length: 20 }, (_, i) => ({ ...event, symbol: `SYM${i}` })),
    live: true, userAgent, now,
    fetchDetail: async ({ fetchFn }) => {
      for (let i = 0; i <= COVERAGE_LIMITS.secRequestsPerEvent; i += 1) {
        await fetchFn(`https://www.sec.gov/Archives/fixture-${i}.htm`);
      }
      return completeDetail();
    },
    fetchFn: async () => { actualRequests += 1; return { ok: true }; },
  });
  assert.equal(actualRequests, 100);
  assert.equal(report.secRequests, 100);
  assert.equal(report.rows.length, 20);
  assert.equal(report.rows[0].reason, 'sec-event-request-limit');
  assert.equal(report.rows[0].secRequests, 6);
  assert.equal(report.rows[19].reason, 'sec-total-request-limit');
  assert.equal(report.rows[19].secRequests, 0);
  assert.equal(report.attemptedEvents, 17);
  assert.equal(report.coverage.coveredEvents, 0);
});

test('existing SEC detail pipeline produces a coverage row using only local official fixtures', async () => {
  const html = await readFile(new URL('./fixtures/sec-earnings-detail/googl-10q-primary.html', import.meta.url), 'utf8');
  const requests = [];
  const submissions = {
    tickers: ['GOOG', 'GOOGL'],
    filings: { recent: {
      accessionNumber: ['0001652044-26-000071'], form: ['10-Q'], filingDate: ['2026-07-30'],
      reportDate: ['2026-06-30'], primaryDocument: ['goog-20260630.htm'],
      acceptanceDateTime: ['2026-07-30T20:00:00.000Z'],
    } },
  };
  const report = await runEarningsDetailCoverage({
    events: [event], live: true, userAgent, now,
    fetchFn: async (url) => {
      requests.push(url);
      if (url === 'https://data.sec.gov/submissions/CIK0001652044.json') {
        return new Response(JSON.stringify(submissions));
      }
      if (url === 'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/goog-20260630.htm') {
        return new Response(html);
      }
      assert.fail('unexpected fixture request');
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(report.secRequests, 2);
  assert.equal(report.coverage.coveredEvents, 1);
  assert.equal(report.rows[0].source.provider, 'SEC');
  assert.equal(report.rows[0].source.form, '10-Q');
  assert.deepEqual(Object.values(report.rows[0].sections).map((value) => value.count), [3, 6, 4]);
});

test('CLI help has no input or live side effects and rejects ambiguous flags', () => {
  assert.deepEqual(parseCoverageArgs(['events.json']), { help: false, filePath: 'events.json', live: false });
  assert.deepEqual(parseCoverageArgs(['--live', 'events.json']), { help: false, filePath: 'events.json', live: true });
  for (const args of [[], ['a.json', 'b.json'], ['a.json', '--live', '--live'], ['a.json', '--retry'], ['--help', '--live']]) {
    assert.throws(() => parseCoverageArgs(args));
  }
  const result = spawnSync(process.execPath, ['scripts/earnings-detail-coverage.mjs', '--help'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Default: validate/);
  assert.match(result.stdout, /100 HTTP requests/);
});
