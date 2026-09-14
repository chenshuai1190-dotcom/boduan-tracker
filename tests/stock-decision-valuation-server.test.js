import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStockDecisionValuationService, STOCK_DECISION_VALUATION_TTL_MS as TTL,
  STOCK_DECISION_VALUATION_FAILURE_MS as RETRY, STOCK_DECISION_VALUATION_RATE_LIMIT_MS as RATE_RETRY } from '../server/quote/stockDecisionValuation.js';

const NOW = Date.parse('2026-09-15T01:00:00Z');
const source = (symbol = 'MSFT', quarter = 2) => ({ status: 'ready', symbol,
  report: { accession: `0000789019-26-00000${quarter}`, periodEnd: `2026-0${quarter * 3}-30`, publishedAt: `2026-0${quarter * 3 + 1}-29T20:00:00Z`,
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/${{ MSFT: '789019', NVDA: '1045810', META: '1326801' }[symbol]}/00007890192600000${quarter}/earnings.htm` },
  quarters: [{ revenue: 100 + quarter }], guidance: { revenue: 150 + quarter } });
// The source/parser and financial model have separate numerical tests. This
// controlled model exposes whether the coordinator actually processes a new report.
const model = data => ({ schemaVersion: 2, modelVersion: 'earnings-valuation-v2', symbol: data.symbol,
  currency: 'USD', status: 'available', reportPeriodEnd: data.report.periodEnd,
  reportedPeriod: data.report.periodEnd, reportedAt: data.report.publishedAt.slice(0, 10),
  scenarios: [{ eps: data.quarters[0].revenue }], sources: [], notes: { zh: '自动', en: 'Automatic' } });

test('cache merges concurrent callers without returning mutable shared objects', async () => {
  let calls = 0;
  const get = createStockDecisionValuationService({ now: () => NOW, buildModel: model,
    loadSource: async ({ symbol, now, signal }) => { calls++; assert.equal(now.getTime(), NOW); assert.ok(signal instanceof AbortSignal); return source(symbol); } });
  const [a, b] = await Promise.all([get({ symbol: 'MSFT' }), get({ symbol: 'msft.us' })]);
  assert.equal(calls, 1);
  assert.equal(a.snapshotId, b.snapshotId);
  a.scenarios[0].eps = 0;
  assert.equal(b.scenarios[0].eps, 102);
  assert.equal((await get({ symbol: 'MSFT' })).scenarios[0].eps, 102);
  await get({ symbol: 'NVDA' });
  assert.equal(calls, 2);
});

test('new financial reports replace EPS and source identity without code or calendar edits', async () => {
  let clock = NOW, latest = source('MSFT', 1), calls = 0;
  const get = createStockDecisionValuationService({ now: () => clock, buildModel: model, loadSource: async () => { calls++; return latest; } });
  const first = await get({ symbol: 'MSFT' });
  latest = source('MSFT', 2);
  clock += TTL - 1;
  assert.equal((await get({ symbol: 'MSFT' })).snapshotId, first.snapshotId);
  clock++;
  const second = await get({ symbol: 'MSFT' });
  assert.equal(calls, 2);
  assert.notEqual(second.snapshotId, first.snapshotId);
  assert.equal(second.scenarios[0].eps, 102);
  assert.equal(second.reportPeriodEnd, '2026-06-30');
  assert.equal(second.checkedAt, new Date(clock).toISOString());
  assert.equal(Date.parse(second.expiresAt) - clock, TTL);
});

test('a newly reported but unparsed quarter immediately removes expired forecasts and retries after backoff', async () => {
  let clock = NOW, available = true, calls = 0;
  const get = createStockDecisionValuationService({ now: () => clock, buildModel: model, loadSource: async () => {
    calls++; return available ? source() : { status: 'pending', symbol: 'MSFT', reason: 'new_earnings_unparsed' };
  } });
  assert.equal((await get({ symbol: 'MSFT' })).status, 'available');
  clock += TTL;
  available = false;
  const missing = await get({ symbol: 'MSFT' });
  assert.equal(missing.status, 'pending');
  assert.deepEqual(missing.scenarios, []);
  assert.equal(missing.snapshotId, null);
  assert.equal(missing.reason, 'new_earnings_unparsed');
  available = true;
  clock += RETRY - 1;
  assert.equal((await get({ symbol: 'MSFT' })).status, 'pending');
  assert.equal(calls, 2);
  clock++;
  assert.equal((await get({ symbol: 'MSFT' })).status, 'available');
  assert.equal(calls, 3);
});

test('source failure, identity mismatch and rollback never fall back to an old valid valuation', async () => {
  let clock = NOW, next = source(), calls = 0;
  const get = createStockDecisionValuationService({ now: () => clock, buildModel: model, loadSource: async () => { calls++; if (next instanceof Error) throw next; return next; } });
  await get({ symbol: 'MSFT' });
  for (const bad of [source('META'), source('MSFT', 1), new Error('private upstream diagnostics')]) {
    clock += TTL; next = bad;
    const result = await get({ symbol: 'MSFT' });
    assert.equal(result.status, 'pending');
    assert.deepEqual(result.scenarios, []);
    assert.doesNotMatch(JSON.stringify(result), /private upstream/);
  }
  assert.equal(calls, 4);
});

test('a verified new report advances the watermark while either source parsing or modeling is pending', async () => {
  for (const pendingStage of ['source', 'model']) {
    let clock = NOW, next = source('MSFT', 1), blocked = false;
    const get = createStockDecisionValuationService({ now: () => clock,
      buildModel: data => blocked ? { ...model(data), status: 'pending', reason: 'incomplete_model', scenarios: [] } : model(data),
      loadSource: async () => next });
    assert.equal((await get({ symbol: 'MSFT' })).status, 'available');
    clock += TTL;
    next = source('MSFT', 2);
    if (pendingStage === 'source') Object.assign(next, { status: 'pending', reason: 'new_report_unparsed' });
    else blocked = true;
    assert.equal((await get({ symbol: 'MSFT' })).status, 'pending');
    clock += RETRY;
    next = source('MSFT', 1); blocked = false;
    const old = await get({ symbol: 'MSFT' });
    assert.equal(old.status, 'pending');
    assert.deepEqual(old.scenarios, []);
  }
});

test('a verified release with an unparsed period also prevents reviving an earlier forecast', async () => {
  let clock = NOW, next = source('MSFT', 1);
  const get = createStockDecisionValuationService({ now: () => clock, buildModel: model, loadSource: async () => next });
  assert.equal((await get({ symbol: 'MSFT' })).status, 'available');
  const { periodEnd, ...latestRelease } = source('MSFT', 2).report;
  clock += TTL;
  next = { symbol: 'MSFT', status: 'pending', reason: 'new_report_unparsed', latestRelease };
  assert.equal((await get({ symbol: 'MSFT' })).status, 'pending');
  clock += RETRY;
  next = source('MSFT', 1);
  assert.equal((await get({ symbol: 'MSFT' })).status, 'pending');
  clock += RETRY;
  next = source('MSFT', 2);
  assert.equal((await get({ symbol: 'MSFT' })).status, 'available');
});

test('rate limits back off and timeouts abort the source without replacing later successful results', async () => {
  let clock = NOW, calls = 0;
  const getLimited = createStockDecisionValuationService({ now: () => clock,
    loadSource: async () => { calls++; throw Object.assign(new Error('limited'), { status: 429 }); } });
  const limited = await getLimited({ symbol: 'NVDA' });
  assert.equal(Date.parse(limited.expiresAt) - clock, RATE_RETRY);
  clock += RATE_RETRY - 1;
  await getLimited({ symbol: 'NVDA' });
  assert.equal(calls, 1);
  let signal, release;
  const getTimed = createStockDecisionValuationService({ now: () => clock, timeoutMs: 5, buildModel: model,
    loadSource: async opts => { signal = opts.signal; return new Promise(resolve => { release = resolve; }); } });
  const timed = await getTimed({ symbol: 'NVDA' });
  assert.equal(timed.status, 'pending');
  assert.equal(signal.aborted, true);
  release(source('NVDA'));
  assert.deepEqual((await getTimed({ symbol: 'NVDA' })).scenarios, []);
});

test('unsupported stocks never request data and production cannot import a fixed financial snapshot', async () => {
  const get = createStockDecisionValuationService({ now: () => NOW, loadSource: async () => assert.fail('no source calls') });
  for (const symbol of ['QQQ', 'AAPL', 'constructor', '../MSFT', '', null]) {
    const data = await get({ symbol });
    assert.equal(data.status, 'unsupported');
    assert.deepEqual(data.scenarios, []);
  }
  for (const path of ['server/quote/stockDecisionValuation.js', 'src/lib/stockDecisionValuation.js', 'src/pages/StockDecisionPage.jsx']) {
    const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /stockDecisionValuationData|STOCK_DECISION_VALUATION_SNAPSHOTS|2026-10-14/);
  }
});
