import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadPortfolioOverlap, clearPortfolioOverlapCache } from '../src/lib/portfolioOverlap.js';
import { buildPortfolioOverlapModel } from '../src/lib/portfolioOverlapModel.js';

const timestamp = Date.parse('2026-10-16T08:00:00Z');
const fetchedAt = '2026-10-15T12:00:00Z';
const storagePrefix = 'quote:portfolio-overlap:fund-holdings:v1:';
const session = id => async () => ({ data: { session: { user: { id }, access_token: `private-${id}` } } });
function memoryStorage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
function fund(symbol = 'SMH', changes = {}) {
  return { symbol, name: `${symbol} official fund`, kind: 'plain_etf', holdingsStatus: 'partial',
    source: { provider: 'Official issuer', basis: 'fund_holdings', url: 'https://example.com/holdings' },
    asOfDate: '2026-10-14', fetchedAt, stale: false, reason: null, coveragePct: 50,
    holdings: [{ symbol: 'NVDA', name: 'NVIDIA', securityType: 'stock', exchange: 'US', weightPct: 50 }], ...changes };
}
function unavailable(symbol = 'SMH') {
  return { ...fund(symbol), holdingsStatus: 'unavailable', asOfDate: null, coveragePct: null, holdings: [], stale: true };
}
function stock(symbol = 'NVDA') {
  return { ...fund(symbol), kind: 'stock', holdingsStatus: 'not_applicable', asOfDate: null, holdings: [], coveragePct: null,
    source: { provider: 'Identity provider', basis: 'instrument_identity', url: 'https://example.com/identity' } };
}
const response = instruments => ({ ok: true, status: 200, json: async () => ({ success: true,
  data: { version: 1, fetchedAt: new Date(timestamp).toISOString(), instruments } }) });
const options = (storage, extra = {}) => ({ userId: 'alice', symbols: ['SMH'], now: timestamp, getSession: session('alice'), storage, ...extra });
const fetchRows = rows => async () => response(rows);
beforeEach(clearPortfolioOverlapCache);

async function seed(storage, rows = [fund()], extra = {}) {
  return loadPortfolioOverlap(options(storage, { symbols: rows.map(row => row.symbol), fetchImpl: fetchRows(rows), ...extra }));
}

function assertOldFund(row) {
  assert.equal(row.holdingsStatus, 'partial');
  assert.equal(row.stale, true);
  assert.equal(row.asOfDate, '2026-10-14');
  assert.equal(row.fetchedAt, fetchedAt);
  assert.equal(row.holdings[0].weightPct, 50);
  assert.deepEqual(row.source, fund().source);
}

test('an unavailable or invalid refresh preserves the verified basket and its actual disclosure date', async () => {
  const storage = memoryStorage();
  await seed(storage);
  for (const candidate of [unavailable(), fund('SMH', { coveragePct: 51 }), fund('SMH', { asOfDate: '2026-02-30' })]) {
    const data = await loadPortfolioOverlap(options(storage, { force: true, fetchImpl: fetchRows([candidate]) }));
    assertOldFund(data.instruments[0]);
    const model = buildPortfolioOverlapModel({ holdings: [{ symbol: 'SMH', amount: 1000 }], instruments: data });
    assert.equal(model.identifiedAmount, 500);
    assert.equal(model.companies[0].sources[0].asOfDate, '2026-10-14');
  }
});

test('network failure retains an old basket and verified in-memory stock identities, then retries after one minute', async () => {
  const storage = memoryStorage();
  await seed(storage, [fund(), stock()]);
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('offline'); };
  const extra = { symbols: ['NVDA', 'SMH'], fetchImpl };
  const data = await loadPortfolioOverlap(options(storage, { ...extra, force: true }));
  assert.equal(data.instruments[0].kind, 'stock');
  assertOldFund(data.instruments[1]);
  await loadPortfolioOverlap(options(storage, { ...extra, now: timestamp + 30000 }));
  assert.equal(calls, 1);
  await loadPortfolioOverlap(options(storage, { ...extra, now: timestamp + 61000 }));
  assert.equal(calls, 2);
});

test('public fund snapshots survive a fresh module instance and work for a different symbol set', async () => {
  const storage = memoryStorage();
  await seed(storage);
  const reopened = await import(`../src/lib/portfolioOverlap.js?reopen=${Date.now()}`);
  const data = await reopened.loadPortfolioOverlap(options(storage, {
    symbols: ['SMH', 'VGT'], fetchImpl: async () => { throw new Error('offline'); },
  }));
  assertOldFund(data.instruments[0]);
  assert.equal(data.instruments[1].symbol, 'VGT');
  assert.equal(data.instruments[1].holdingsStatus, 'unavailable');
  assert.deepEqual(data.instruments[1].holdings, []);
  reopened.clearPortfolioOverlapCache({ storage });
});

test('only a newer verified disclosure replaces the saved basket; older valid responses cannot roll it back', async () => {
  const storage = memoryStorage();
  await seed(storage);
  const latest = fund('SMH', { asOfDate: '2026-10-15', fetchedAt: '2026-10-16T01:00:00Z', coveragePct: 60,
    holdings: [{ ...fund().holdings[0], weightPct: 60 }] });
  let data = await loadPortfolioOverlap(options(storage, { force: true, fetchImpl: fetchRows([latest]) }));
  assert.equal(data.instruments[0].asOfDate, '2026-10-15');
  assert.equal(data.instruments[0].stale, false);
  data = await loadPortfolioOverlap(options(storage, { force: true, fetchImpl: fetchRows([fund()]) }));
  assert.equal(data.instruments[0].asOfDate, '2026-10-15');
  assert.equal(data.instruments[0].holdings[0].weightPct, 60);
  assert.equal(data.instruments[0].stale, true);
  assert.equal(JSON.parse(storage.getItem(storage.key(0))).instruments[0].asOfDate, '2026-10-15');
});

test('storage contains only whitelisted public fund fields, never authentication, holdings amounts or other rows', async () => {
  const storage = memoryStorage();
  const raw = fund('SMH', { userId: 'DO_NOT_SAVE_USER', marketValue: 987654, access_token: 'DO_NOT_SAVE_TOKEN',
    holdings: [{ ...fund().holdings[0], shares: 123456, accountId: 'DO_NOT_SAVE_ACCOUNT' }] });
  await seed(storage, [raw, stock()]);
  const saved = storage.getItem(storage.key(0));
  assert.doesNotMatch(saved, /DO_NOT_SAVE|987654|123456|private-alice|access_token|marketValue|shares|accountId|userId/);
  const data = JSON.parse(saved);
  assert.equal(data.instruments.length, 1);
  assert.equal(data.instruments[0].symbol, 'SMH');
  assert.deepEqual(Object.keys(data.instruments[0]).sort(), Object.keys(fund()).sort());
  assert.deepEqual(Object.keys(data.instruments[0].holdings[0]).sort(), Object.keys(fund().holdings[0]).sort());
});

test('future, malformed, weight-mismatched and authenticated-source persisted snapshots are never used', async () => {
  const cases = [fund('SMH', { asOfDate: '2026-10-17', fetchedAt: '2026-10-17T12:00:00Z' }),
    fund('SMH', { fetchedAt: '2026-99-99T12:00:00Z' }), fund('SMH', { asOfDate: '2026-02-30' }),
    fund('SMH', { coveragePct: 60 }), fund('SMH', { source: { ...fund().source, basis: 'instrument_identity' } }),
    fund('SMH', { source: { ...fund().source, url: 'https://example.com/holdings?api_token=private' } })];
  for (const invalid of cases) {
    clearPortfolioOverlapCache();
    const storage = memoryStorage();
    storage.setItem(`${storagePrefix}alice`, JSON.stringify({ version: 1, instruments: [invalid] }));
    const data = await loadPortfolioOverlap(options(storage, { fetchImpl: fetchRows([unavailable()]) }));
    assert.equal(data.instruments[0].holdingsStatus, 'unavailable');
  }
});

test('snapshots are user-isolated and authentication failure clears only that user', async () => {
  const storage = memoryStorage();
  await seed(storage);
  let data = await loadPortfolioOverlap(options(storage, { userId: 'bob', getSession: session('bob'), fetchImpl: fetchRows([unavailable()]) }));
  assert.equal(data.instruments[0].holdingsStatus, 'unavailable');
  await seed(storage, [fund()], { userId: 'bob', getSession: session('bob'), force: true });
  await assert.rejects(loadPortfolioOverlap(options(storage, { force: true, fetchImpl: async () => ({ ok: false, status: 401 }) })), { code: 'AUTH_REQUIRED' });
  assert.equal(storage.getItem(`${storagePrefix}alice`), null);
  assert.notEqual(storage.getItem(`${storagePrefix}bob`), null);
  data = await loadPortfolioOverlap(options(storage, { fetchImpl: fetchRows([unavailable()]) }));
  assert.equal(data.instruments[0].holdingsStatus, 'unavailable');
});

test('initial authentication failure also clears a persisted snapshot before it can be read', async () => {
  const storage = memoryStorage();
  storage.setItem(`${storagePrefix}alice`, JSON.stringify({ version: 1, instruments: [fund()] }));
  await assert.rejects(loadPortfolioOverlap(options(storage, { getSession: session('bob'), fetchImpl: fetchRows([unavailable()]) })), { code: 'AUTH_REQUIRED' });
  assert.equal(storage.getItem(`${storagePrefix}alice`), null);
});

test('explicit clear removes persisted baskets and a late request cannot republish them', async () => {
  const storage = memoryStorage();
  await seed(storage);
  let finish, started;
  const wait = new Promise(resolve => { started = resolve; });
  const pending = loadPortfolioOverlap(options(storage, { force: true, fetchImpl: () => {
    started(); return new Promise(resolve => { finish = resolve; });
  } }));
  await wait;
  clearPortfolioOverlapCache({ storage });
  finish(response([fund()]));
  await assert.rejects(pending, { code: 'REQUEST_SUPERSEDED' });
  assert.equal(storage.length, 0);
  const data = await loadPortfolioOverlap(options(storage, { fetchImpl: fetchRows([unavailable()]) }));
  assert.equal(data.instruments[0].holdingsStatus, 'unavailable');
});

test('storage failures do not block fresh data or the in-memory fallback', async () => {
  const storage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('disabled'); } };
  await seed(storage);
  const data = await loadPortfolioOverlap(options(storage, { force: true, fetchImpl: fetchRows([unavailable()]) }));
  assertOldFund(data.instruments[0]);
});

test('a request waiting for initial authentication cannot repopulate storage after clear', async () => {
  const storage = memoryStorage();
  let finishAuthentication;
  let requests = 0;
  const pending = loadPortfolioOverlap(options(storage, {
    getSession: () => new Promise(resolve => { finishAuthentication = resolve; }),
    fetchImpl: async () => { requests += 1; return response([fund()]); },
  }));
  clearPortfolioOverlapCache({ storage });
  finishAuthentication(await session('alice')());
  await assert.rejects(pending, { code: 'REQUEST_SUPERSEDED' });
  assert.equal(requests, 0);
  assert.equal(storage.length, 0);
});

test('without any valid historical basket network failures stay errors and no weights are invented', async () => {
  await assert.rejects(loadPortfolioOverlap(options(memoryStorage(), { fetchImpl: async () => { throw new Error('offline'); } })), { code: 'NETWORK_ERROR' });
});

test('concurrent distinct symbol sets preserve both public baskets', async () => {
  const storage = memoryStorage();
  let finishSmh, finishVgt;
  const smh = loadPortfolioOverlap(options(storage, { fetchImpl: () => new Promise(resolve => { finishSmh = resolve; }) }));
  const vgt = loadPortfolioOverlap(options(storage, { symbols: ['VGT'], fetchImpl: () => new Promise(resolve => { finishVgt = resolve; }) }));
  await new Promise(resolve => setImmediate(resolve));
  finishSmh(response([fund()]));
  await smh;
  finishVgt(response([fund('VGT')]));
  await vgt;
  const saved = JSON.parse(storage.getItem(`${storagePrefix}alice`));
  assert.deepEqual(saved.instruments.map(row => row.symbol).sort(), ['SMH', 'VGT']);
});
