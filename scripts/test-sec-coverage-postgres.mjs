#!/usr/bin/env node
// Local PostgreSQL execution test. No database URL, .env, network, or real user
// data is read. PGlite runs in memory and is deliberately not a repo dependency.
// Prerequisite: install @electric-sql/pglite in a disposable external directory.
// Run: PGLITE_MODULE_FILE=/absolute/temp/node_modules/@electric-sql/pglite/dist/index.js \
//   node scripts/test-sec-coverage-postgres.mjs
// PGlite has one connection: wake-race coverage below is a deterministic
// claim -> register -> complete interleaving, not a multi-connection load test.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EARNINGS_DETAIL_PARSER_VERSION } from '../src/lib/earningsDetailPolicy.js';
import { selectSharedEarningsDetail } from '../server/earnings/secEarningsSharedCache.js';
import { fetchSecEarningsDetail } from '../server/earnings/secEarningsDetail.js';
import { coverageResultRow } from '../server/earnings/secEarningsAutoCoverage.js';
import { createSecEarningsCoverageRepository } from '../server/earnings/secEarningsCoverageRepository.js';

const moduleFile = process.env.PGLITE_MODULE_FILE;
if (!moduleFile || !isAbsolute(moduleFile)) {
  console.error('Set PGLITE_MODULE_FILE to an absolute, locally installed PGlite module file. This test never connects to a database server.');
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(moduleFile).href);
const db = await PGlite.create();
const version = EARNINGS_DETAIL_PARSER_VERSION;
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const oldAccession = '0001652044-25-000071';
const newAccession = '0001652044-25-000072';
const event = {
  symbol: 'GOOGL', provider_fiscal_date: '2025-06-30',
  report_date: '2025-07-29', official_fiscal_date: '2025-06-30',
};
const nextEvent = {
  symbol: 'GOOGL', provider_fiscal_date: '2025-09-30',
  report_date: '2025-10-30', official_fiscal_date: '2025-09-30',
};
const completionSql = 'select public.complete_sec_earnings_watch_job($1,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as result';
let passed = 0;

function resultFixture(accession = oldAccession, documentType = 'EX-99.1') {
  const documentUrl = `https://www.sec.gov/Archives/edgar/data/1652044/${accession.replaceAll('-', '')}/quarter.htm`;
  const section = { status: 'complete', items: [{ id: 'first', revenue: 60 }, { id: 'second', revenue: 40 }] };
  return {
    official_fiscal_date: '2025-06-30', accession, document_type: documentType,
    cik: '0001652044', ttl_seconds: 21600,
    payload: {
      schemaVersion: 1, parserVersion: version, status: 'complete', symbol: 'GOOGL', currency: 'USD',
      period: { start: '2025-04-01', end: '2025-06-30', fiscalDate: '2025-06-30', officialFiscalDate: '2025-06-30', providerFiscalDate: '2025-06-30', reportDate: '2025-07-29' },
      source: {
        provider: 'SEC', cik: '0001652044', accession, documentType,
        form: documentType === 'PRIMARY' ? '10-Q' : '8-K', fiscalPeriod: 'Q2',
        filedAt: '2025-07-30T16:00:00Z', primaryDocumentUrl: documentUrl, filingUrl: documentUrl,
      },
      sections: { reportSegments: structuredClone(section), revenueBreakdown: structuredClone(section), geographies: structuredClone(section) },
      totalRevenue: 100,
    },
  };
}

async function roleQuery(role, sql, params = [], jwtRole = role) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [jwtRole]);
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.role','',false)");
  }
}
const service = (sql, params) => roleQuery('service_role', sql, params);
async function denied(operation, code = '42501') {
  await assert.rejects(operation, error => error.code === code);
}
async function register(events = [event], userId = userA) {
  const out = await service('select public.register_sec_earnings_requested_events($1::uuid,$2::jsonb,$3) as result', [userId, JSON.stringify(events), version]);
  return out.rows[0].result;
}
async function claim() {
  return (await service('select * from public.claim_sec_earnings_watch_jobs(12,75)')).rows;
}
async function complete(lease, { results = [], events = [], status = 'complete', token = lease.lease_token } = {}) {
  const out = await service(completionSql, [lease.symbol, token, version, status, null, 900, JSON.stringify(results), JSON.stringify(events)]);
  return out.rows[0].result;
}
async function reset() {
  await db.exec('truncate public.sec_earnings_shared_results, public.sec_earnings_requested_events, public.sec_earnings_watch_jobs, public.watchlist');
  await db.query('insert into public.watchlist(symbol,user_id) values ($1,$2::uuid)', ['GOOGL.US', userA]);
}
async function dueAgain() {
  await db.exec("update public.sec_earnings_watch_jobs set next_scan_at=clock_timestamp()-interval '1 second'");
  const leases = await claim();
  assert.equal(leases.length, 1);
  return leases[0];
}
async function rows() {
  // Keep the projection aligned with the service repository's shared read.
  return (await service('select symbol, official_fiscal_date::text, cik, accession, document_type, parser_version, payload, checked_at, expires_at from public.sec_earnings_shared_results order by accession')).rows;
}
async function test(name, fn) {
  await reset();
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as
      $$ select current_setting('request.jwt.claim.role', true) $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    create table public.watchlist(symbol text, user_id uuid);
  `);
  const migration = await readFile(new URL('../supabase/sec_earnings_auto_coverage_20260909.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  console.log(`PostgreSQL: ${(await db.query('select version() as version')).rows[0].version}`);
  console.log('PASS migration executes and reapplies in an isolated in-memory database');
  passed += 1;

  await test('only service RPC execution and read access; no direct writes or helper access', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['sec_earnings_watch_jobs', 'sec_earnings_requested_events', 'sec_earnings_shared_results']) {
        await denied(() => roleQuery(role, `select * from public.${table}`));
      }
      await denied(() => roleQuery(role, 'select public.claim_sec_earnings_watch_jobs(1,75)'));
      await denied(() => roleQuery(role, 'select public.register_sec_earnings_requested_events($1::uuid,$2::jsonb,$3)', [userA, JSON.stringify([event]), version]));
      await denied(() => roleQuery(role, completionSql, ['GOOGL', userA, version, 'idle', null, 900, '[]', '[]']));
    }
    assert.deepEqual(await rows(), []);
    await denied(() => service("insert into public.sec_earnings_watch_jobs(symbol) values ('MSFT')"));
    await denied(() => service('select public.sec_earnings_normalize_event($1::jsonb,null)', [JSON.stringify(event)]));
    await denied(() => roleQuery('service_role', 'select public.claim_sec_earnings_watch_jobs(1,75)', [], 'authenticated'));
  });

  await test('registration checks the supplied user watchlist without copying or changing membership', async () => {
    await db.query('insert into public.watchlist(symbol,user_id) values ($1,$2::uuid)', ['MSFT', userB]);
    const watchlistBefore = (await db.query('select * from public.watchlist order by symbol')).rows;
    assert.deepEqual(await register([event, { ...event, symbol: 'MSFT' }]), { registered: 1 });
    const saved = (await service('select symbol from public.sec_earnings_requested_events')).rows;
    assert.deepEqual(saved, [{ symbol: 'GOOGL' }]);
    assert.deepEqual((await db.query('select * from public.watchlist order by symbol')).rows, watchlistBefore);
    assert.equal((await claim()).length, 2); // Union of public symbols, not a copied membership list.
  });

  await test('duplicate registration does not wake or accelerate the job', async () => {
    await register();
    await db.exec("update public.sec_earnings_watch_jobs set next_scan_at=clock_timestamp()+interval '1 hour'");
    const before = (await service('select wake_revision,next_scan_at from public.sec_earnings_watch_jobs')).rows;
    assert.deepEqual(await register(), { registered: 0 });
    assert.deepEqual((await service('select wake_revision,next_scan_at from public.sec_earnings_watch_jobs')).rows, before);
    assert.equal((await claim()).length, 0);
  });

  await test('bounded claim and complete persist the public payload under the active lease', async () => {
    await register();
    const [lease] = await claim();
    assert.ok(lease.lease_token);
    assert.equal((await claim()).length, 0);
    const fixture = resultFixture();
    assert.deepEqual(await complete(lease, { results: [fixture], events: [{ ...event, status: 'complete' }] }), { outcome: 'completed', stored: 1, registered: 1 });
    const [saved] = await rows();
    assert.deepEqual(saved.payload, fixture.payload);
    assert.equal(saved.cik, fixture.cik);
    assert.ok(new Date(saved.expires_at) > new Date(saved.checked_at));
    const cached = selectSharedEarningsDetail({
      request: { symbol: 'GOOGL', fiscalDate: '2025-06-30', reportDate: '2025-07-29' },
      rows: [saved], now: new Date(), parserVersion: version,
    });
    assert.equal(cached?.cache.status, 'fresh');
    assert.deepEqual(cached.sections, fixture.payload.sections);
    assert.equal(cached.checkedAt, new Date(saved.checked_at).toISOString());
    const [job] = (await service('select lease_token,lease_until,lease_revision,status,attempt_count,next_scan_at>clock_timestamp() as delayed from public.sec_earnings_watch_jobs')).rows;
    assert.deepEqual(job, { lease_token: null, lease_until: null, lease_revision: null, status: 'complete', attempt_count: 0, delayed: true });
    await denied(() => service('select * from public.claim_sec_earnings_watch_jobs(13,75)'), '22023');
    await denied(() => service('select * from public.claim_sec_earnings_watch_jobs(1,91)'), '22023');
  });

  await test('actual SEC parser fixture -> production serializer -> SQL RPC -> repository projection -> cache selector', async () => {
    const html = await readFile(new URL('../tests/fixtures/sec-earnings-detail/googl-10q-primary.html', import.meta.url), 'utf8');
    const accession = '0001652044-26-000071';
    const seenRequests = [];
    const request = { symbol: 'GOOGL', fiscalDate: '2026-06-30', reportDate: '2026-07-22' };
    const parsed = await fetchSecEarningsDetail({
      ...request, now: new Date(), requestIntervalMs: 0,
      userAgent: 'Local PostgreSQL Fixture Test test@example.invalid',
      fetchFn: async (input) => {
        const url = new URL(input);
        seenRequests.push(url.pathname);
        if (url.href === 'https://data.sec.gov/submissions/CIK0001652044.json') {
          return new Response(JSON.stringify({ tickers: ['GOOG', 'GOOGL'], filings: { recent: {
            accessionNumber: [accession], form: ['10-Q'], filingDate: ['2026-07-30'],
            reportDate: ['2026-06-30'], primaryDocument: ['goog-20260630.htm'],
            acceptanceDateTime: ['2026-07-30T20:00:00.000Z'],
          } } }));
        }
        if (url.href === `https://www.sec.gov/Archives/edgar/data/1652044/${accession.replaceAll('-', '')}/goog-20260630.htm`) return new Response(html);
        assert.fail(`Unexpected fixture request; network is disabled: ${url.origin}${url.pathname}`);
      },
    });
    assert.equal(seenRequests.length, 2);
    assert.equal(parsed.status, 'complete');
    assert.equal(parsed.source.documentType, 'PRIMARY');
    const serialized = coverageResultRow(parsed, 'GOOGL', new Date());
    assert.ok(serialized, 'Actual parser output must be accepted by the production serializer');
    assert.ok(!Object.hasOwn(serialized.payload, 'fetchedAt'));
    assert.ok(!Object.hasOwn(serialized.payload, 'checkedAt'));
    const repository = createSecEarningsCoverageRepository({
      // Explicit inert fixture configuration: no process.env or real secrets.
      env: { SUPABASE_URL: 'https://sec-coverage-test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-local-only' },
      fetchFn: async (input, options) => {
        const url = new URL(input);
        assert.equal(url.origin, 'https://sec-coverage-test.invalid');
        if (url.pathname === '/rest/v1/rpc/complete_sec_earnings_watch_job') {
          const body = JSON.parse(options.body);
          const out = await service(completionSql, [body.p_symbol, body.p_lease_token, body.p_parser_version,
            body.p_status, body.p_reason, body.p_next_delay_seconds, JSON.stringify(body.p_results), JSON.stringify(body.p_events)]);
          return new Response(JSON.stringify(out.rows[0].result));
        }
        assert.equal(url.pathname, '/rest/v1/sec_earnings_shared_results');
        assert.equal(url.searchParams.get('symbol'), 'eq.GOOGL');
        assert.equal(url.searchParams.get('parser_version'), `eq.${version}`);
        assert.equal(url.searchParams.get('limit'), '8');
        const select = url.searchParams.get('select');
        assert.match(select, /^[a-z_,]+$/);
        // PostgreSQL date OIDs are JS Dates in PGlite; PostgREST emits YYYY-MM-DD.
        // Query every production-selected column, adapting only that encoding.
        const projection = select.split(',').map(column => column === 'official_fiscal_date' ? 'official_fiscal_date::text' : column).join(',');
        const out = await service(`select ${projection} from public.sec_earnings_shared_results where symbol=$1 and parser_version=$2 order by official_fiscal_date desc,checked_at desc limit 8`, ['GOOGL', version]);
        return new Response(JSON.stringify(out.rows));
      },
    });
    const [lease] = await claim();
    assert.equal((await repository.complete(lease, { status: parsed.status, results: [serialized] })).stored, 1);
    const persisted = await repository.results('GOOGL');
    const selected = selectSharedEarningsDetail({ request, rows: persisted, now: new Date(), parserVersion: version });
    assert.equal(selected?.cache.status, 'fresh');
    assert.deepEqual(selected.sections, parsed.sections);
    assert.deepEqual(selected.source, parsed.source);
    assert.equal(selected.period.officialFiscalDate, '2026-06-30');
    assert.equal(selected.fetchedAt, persisted[0].checked_at);
  });

  await test('stale tokens and already expired leases cannot persist results or events', async () => {
    const [lease] = await claim();
    const stale = { outcome: 'stale', stored: 0, registered: 0 };
    assert.deepEqual(await complete(lease, { token: userB, results: [resultFixture()], events: [event] }), stale);
    await db.exec("update public.sec_earnings_watch_jobs set lease_until=clock_timestamp()-interval '1 second'");
    assert.deepEqual(await complete(lease, { results: [resultFixture()], events: [event] }), stale);
    assert.deepEqual(await rows(), []);
    assert.equal((await service('select * from public.sec_earnings_requested_events')).rows.length, 0);
    const [replacement] = await claim();
    assert.notEqual(replacement.lease_token, lease.lease_token);
    assert.deepEqual(await complete(lease, { results: [resultFixture()] }), stale);
  });

  await test('claim -> new event registration -> complete preserves the concurrent wake', async () => {
    await register();
    const [lease] = await claim();
    assert.deepEqual(await register([nextEvent]), { registered: 1 });
    assert.equal((await claim()).length, 0);
    assert.deepEqual(await complete(lease), { outcome: 'completed', stored: 0, registered: 0 });
    const [job] = (await service('select next_scan_at<=clock_timestamp() as due,wake_revision from public.sec_earnings_watch_jobs')).rows;
    assert.equal(job.due, true);
    assert.equal(Number(job.wake_revision), 2);
    assert.equal((await claim()).length, 1);
  });

  await test('same filing cannot downgrade successful sections, status, or CIK', async () => {
    const [lease] = await claim();
    await complete(lease, { results: [resultFixture()] });
    const before = await rows();
    const partial = resultFixture();
    partial.payload.status = 'partial';
    partial.payload.sections.geographies = { status: 'unavailable', items: [] };
    assert.equal((await complete(await dueAgain(), { results: [partial] })).stored, 0);
    partial.payload.status = 'complete';
    assert.equal((await complete(await dueAgain(), { results: [partial] })).stored, 0);
    const otherCik = resultFixture();
    otherCik.cik = '0000789019';
    otherCik.payload.source.cik = otherCik.cik;
    assert.equal((await complete(await dueAgain(), { results: [otherCik] })).stored, 0);
    assert.deepEqual(await rows(), before);
  });

  await test('a failed newer filing expires only older same-quarter same-parser results and updates event state', async () => {
    const [lease] = await claim();
    await complete(lease, { results: [resultFixture(), resultFixture(newAccession, 'PRIMARY')], events: [{ ...event, status: 'complete' }] });
    // Synthetic scope controls, inserted only by this in-memory test owner.
    await db.exec(`insert into public.sec_earnings_shared_results
      select symbol,official_fiscal_date,cik,accession,document_type,'test-other-version',payload,checked_at,expires_at
      from public.sec_earnings_shared_results where accession='${oldAccession}'`);
    await db.exec(`insert into public.sec_earnings_shared_results
      select symbol,date '2025-03-31',cik,accession,document_type,parser_version,payload,checked_at,expires_at
      from public.sec_earnings_shared_results where accession='${oldAccession}' and parser_version='${version}'`);
    const before = await rows();
    const failedEvent = { ...event, status: 'unavailable', reason: 'section-not-reported', expected_accession: newAccession };
    await complete(await dueAgain(), { events: [failedEvent], status: 'unavailable' });
    const after = await rows();
    const expires = (await service("select accession,parser_version,official_fiscal_date::text,expires_at<=clock_timestamp() as expired from public.sec_earnings_shared_results")).rows;
    assert.equal(expires.filter(row => row.expired).length, 1);
    assert.deepEqual(expires.find(row => row.expired), { accession: oldAccession, parser_version: version, official_fiscal_date: event.official_fiscal_date, expired: true });
    for (const original of before) {
      const saved = after.find(row => row.accession === original.accession && row.parser_version === original.parser_version && String(row.official_fiscal_date) === String(original.official_fiscal_date));
      assert.deepEqual(saved.payload, original.payload);
      assert.deepEqual(saved.checked_at, original.checked_at);
    }
    const [savedEvent] = (await service('select status,reason from public.sec_earnings_requested_events')).rows;
    assert.deepEqual(savedEvent, { status: 'unavailable', reason: 'section-not-reported' });
  });

  await test('bad identity, cumulative periods, private keys and invalid event accession roll back the whole completion', async () => {
    const [lease] = await claim();
    const invalid = [];
    const crossSymbol = resultFixture(); crossSymbol.payload.symbol = 'MSFT'; invalid.push(crossSymbol);
    const cumulative = resultFixture(); cumulative.payload.period.start = '2025-01-01'; invalid.push(cumulative);
    const privateKey = resultFixture(); privateKey.payload.sections.reportSegments.items[0].user_id = userA; invalid.push(privateKey);
    const wrongCik = resultFixture(); wrongCik.payload.source.cik = '0000789019'; invalid.push(wrongCik);
    const future = resultFixture(); future.official_fiscal_date = '2999-06-30'; invalid.push(future);
    for (const candidate of invalid) {
      await denied(() => complete(lease, { results: [resultFixture(newAccession), candidate], events: [event] }), '22023');
      assert.deepEqual(await rows(), []);
    }
    await denied(() => complete(lease, { results: [resultFixture()], events: [{ ...event, official_fiscal_date: null, expected_accession: newAccession }] }), '22023');
    assert.deepEqual(await rows(), []);
    assert.equal((await service('select * from public.sec_earnings_requested_events')).rows.length, 0);
  });

  await test('expiry during completion rolls back inserted data, event updates and old-filing invalidation', async () => {
    const [firstLease] = await claim();
    await complete(firstLease, { results: [resultFixture()], events: [{ ...event, status: 'complete' }] });
    const lease = await dueAgain();
    const before = await rows();
    const beforeEvents = (await service('select * from public.sec_earnings_requested_events')).rows;
    // A short PostgreSQL-side fault injection guarantees expiry inside the RPC.
    // No sleep loop, network request, or external database is involved.
    await db.exec(`create function public.test_sec_lease_delay() returns trigger language plpgsql as $$
      begin perform pg_sleep(0.12); return new; end; $$;
      create trigger test_sec_lease_delay before insert on public.sec_earnings_shared_results
        for each row execute function public.test_sec_lease_delay();
      update public.sec_earnings_watch_jobs set lease_until=clock_timestamp()+interval '0.08 seconds';`);
    try {
      await denied(() => complete(lease, {
        results: [resultFixture(newAccession, 'PRIMARY')],
        events: [{ ...event, status: 'unavailable', expected_accession: newAccession }],
      }), '40001');
    } finally {
      await db.exec('drop trigger test_sec_lease_delay on public.sec_earnings_shared_results; drop function public.test_sec_lease_delay()');
    }
    assert.deepEqual(await rows(), before);
    assert.deepEqual((await service('select * from public.sec_earnings_requested_events')).rows, beforeEvents);
    const [job] = (await service('select lease_token from public.sec_earnings_watch_jobs')).rows;
    assert.equal(job.lease_token, lease.lease_token);
  });
  console.log(`PASS ${passed}/${passed} local PostgreSQL checks. Production untouched. Multi-connection contention is not simulated.`);
} catch (error) {
  console.error(`FAIL after ${passed} checks: ${error.code ?? error.name}: ${error.message}`);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
