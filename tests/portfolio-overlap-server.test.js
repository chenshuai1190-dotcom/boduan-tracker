import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import {
  fetchPortfolioOverlap, normalizePortfolioOverlapSymbols, parseQqqPortfolioHoldings,
  parseSpyPortfolioHoldings, QQQ_HOLDINGS_URL, SPY_HOLDINGS_URL,
  PORTFOLIO_OVERLAP_CACHE_TTL_MS, resetPortfolioOverlapCacheForTests,
} from '../server/quote/portfolioOverlap.js';
import { parseSsgaHoldingsWorkbook } from '../server/quote/ssgaHoldingsWorkbook.js';

const NOW = Date.parse('2026-09-08T12:00:00Z');
const QQQ = JSON.parse(readFileSync(new URL('./fixtures/portfolio-overlap/qqq-official-2026-09-08.json', import.meta.url)));
const SPY = readFileSync(new URL('./fixtures/portfolio-overlap/spy-official-2026-09-08.xlsx', import.meta.url));
beforeEach(() => resetPortfolioOverlapCacheForTests());

function officialResponse(body, status = 200) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return { ok: status === 200, status, arrayBuffer: async () => bytes };
}
function searchResponse(symbol, type = 'Common Stock') {
  return { ok: true, status: 200, json: async () => [{ Code: symbol, Name: `${symbol} Test`, Type: type, Exchange: 'US', Country: 'USA', Currency: 'USD' }] };
}
function sources(url) {
  if (url === QQQ_HOLDINGS_URL) return officialResponse(QQQ);
  if (url === SPY_HOLDINGS_URL) return officialResponse(SPY);
  return searchResponse(decodeURIComponent(new URL(url).pathname.split('/').at(-1)));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Repack only test copies, using stored ZIP entries, for corruption/contract
// mutation tests. The committed official download remains byte-for-byte intact.
function mutatedWorkbook(mutate) {
  let end = SPY.length - 22;
  while (SPY.readUInt32LE(end) !== 0x06054b50) end -= 1;
  let cursor = SPY.readUInt32LE(end + 16);
  const records = [];
  for (let i = 0; i < SPY.readUInt16LE(end + 10); i += 1) {
    const nameLength = SPY.readUInt16LE(cursor + 28);
    const name = SPY.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const local = SPY.readUInt32LE(cursor + 42);
    const start = local + 30 + SPY.readUInt16LE(local + 26) + SPY.readUInt16LE(local + 28);
    const compressed = SPY.subarray(start, start + SPY.readUInt32LE(cursor + 20));
    const raw = SPY.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(compressed) : compressed;
    records.push({ name, bytes: raw });
    cursor += 46 + nameLength + SPY.readUInt16LE(cursor + 30) + SPY.readUInt16LE(cursor + 32);
  }
  mutate(records);
  const localParts = [];
  const directory = [];
  let offset = 0;
  for (const record of records) {
    const name = Buffer.from(record.name);
    const bytes = Buffer.from(record.bytes);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, name, bytes);
    directory.push(central, name);
    offset += local.length + name.length + bytes.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(records.length, 8);
  footer.writeUInt16LE(records.length, 10);
  footer.writeUInt32LE(directoryBytes.length, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directoryBytes, footer]);
}

test('symbols normalize uniquely and invalid/oversized inputs fail before provider access', () => {
  assert.deepEqual(normalizePortfolioOverlapSymbols('spy, aapl,QQQ,AAPL'), ['AAPL', 'QQQ', 'SPY']);
  for (const input of ['', [], ['AAPL', null], 'https://example.com', 'AAPL.US', 'AAPL,', Array(41).fill('AAPL')]) {
    assert.throws(() => normalizePortfolioOverlapSymbols(input), { code: 'INVALID_SYMBOLS' });
  }
});

test('public QQQ fixture uses business date and full holdings without turning cash or derivatives into stocks', () => {
  const result = parseQqqPortfolioHoldings(QQQ, { now: NOW });
  assert.equal(result.kind, 'plain_etf');
  assert.equal(result.asOfDate, '2026-09-04');
  assert.equal(result.reportedHoldingCount, 107);
  assert.equal(result.parsedHoldingCount, 102);
  assert.equal(result.holdingsStatus, 'partial');
  assert.ok(Math.abs(result.coveragePct - 99.886855) < 1e-9);
  assert.ok(Math.abs(result.coveragePct + result.unresolvedWeightPct - 100) < 1e-9);
  assert.equal(result.holdings.find(row => row.symbol === 'ASML').securityType, 'adr');
  assert.ok(result.holdings.every(row => !['USD', 'NQU6', 'NQU6_', 'USDPDV'].includes(row.symbol)));
  assert.equal(result.stale, false);
  assert.equal(parseQqqPortfolioHoldings(QQQ, { now: Date.parse('2026-09-20T12:00:00Z') }).stale, true);
});

test('QQQ identity, truncated top-ten, future date, duplicate and malformed stock weight fail closed', () => {
  for (const mutate of [
    data => { data.cusip = 'QQQM'; },
    data => { data.holdings = data.holdings.slice(0, 10); },
    data => { data.effectiveBusinessDate = '2026-09-08'; },
    data => { data.effectiveBusinessDate = null; },
    data => { data.holdings[0].percentageOfTotalNetAssets = null; },
    data => { data.holdings[0].percentageOfTotalNetAssets = false; },
    data => { data.holdings[0].percentageOfTotalNetAssets = -1; },
    data => { data.holdings[0].ticker = data.holdings[1].ticker; },
  ]) {
    const data = structuredClone(QQQ);
    mutate(data);
    assert.throws(() => parseQqqPortfolioHoldings(data, { now: NOW }), { code: 'INVALID_DATA' });
  }
});

test('public SPY workbook validates identity, exact holdings date, weights and residual coverage', () => {
  const parsed = parseSsgaHoldingsWorkbook(SPY);
  assert.equal(parsed.asOfDate, '2026-09-04');
  assert.equal(parsed.holdings.length, 505);
  const result = parseSpyPortfolioHoldings(SPY, { now: NOW });
  assert.equal(result.parsedHoldingCount, 503);
  assert.ok(Math.abs(result.coveragePct - 99.797453) < 1e-9);
  assert.ok(result.holdings.some(row => row.symbol === 'BRK.B'));
  assert.ok(result.holdings.every(row => !['-', '2602335D'].includes(row.symbol)));
  assert.equal(result.holdings[0].weightPct, 8.386494, 'spreadsheet percent-point values are not multiplied by 100');
});

test('SSGA parser rejects wrong fund/header, formulas, macros, DTD, ZIP traversal and corruption', () => {
  const edits = [
    records => { const record = records.find(row => row.name === 'xl/sharedStrings.xml'); record.bytes = record.bytes.toString().replace('<t>SPY</t>', '<t>QQQ</t>'); },
    records => { const record = records.find(row => row.name === 'xl/sharedStrings.xml'); record.bytes = record.bytes.toString().replace('<t>Weight</t>', '<t>Market Value</t>'); },
    records => { const record = records.find(row => row.name === 'xl/worksheets/sheet1.xml'); record.bytes = record.bytes.toString().replace('<v>8.386494</v>', '<f>1+1</f><v>8.386494</v>'); },
    records => { records.push({ name: 'xl/vbaProject.bin', bytes: Buffer.from('test') }); },
    records => { const record = records.find(row => row.name === 'xl/sharedStrings.xml'); record.bytes = record.bytes.toString().replace('<sst ', '<!DOCTYPE sst [<!ENTITY x SYSTEM "file:///private">]><sst '); },
    records => { records[0].name = '../outside.xml'; },
  ];
  for (const mutate of edits) assert.throws(() => parseSsgaHoldingsWorkbook(mutatedWorkbook(mutate)), /workbook invalid/);
  const corrupt = Buffer.from(SPY);
  corrupt[400] ^= 1;
  assert.throws(() => parseSsgaHoldingsWorkbook(corrupt));
  assert.throws(() => parseSsgaHoldingsWorkbook(Buffer.alloc(2_000_001)));
  assert.deepEqual(parseSsgaHoldingsWorkbook(mutatedWorkbook(() => {})), parseSsgaHoldingsWorkbook(SPY));
});

test('mixed instrument contract keeps unknown and leveraged positions instead of guessing a fund structure', async () => {
  const calls = [];
  const data = await fetchPortfolioOverlap('SPY,QQQ,TQQQ,OVERLAPA,OVERLAPF', {
    eodhdKey: 'test', now: NOW,
    fetchImpl: async url => { calls.push(url); return url.includes('/search/OVERLAPF') ? searchResponse('OVERLAPF', 'ETF') : sources(url); },
  });
  assert.equal(data.version, 1);
  assert.equal(data.instruments.find(row => row.symbol === 'OVERLAPA').kind, 'stock');
  const unknown = data.instruments.find(row => row.symbol === 'OVERLAPF');
  assert.equal(unknown.kind, 'unknown');
  assert.equal(unknown.reason, 'unsupported_fund_structure');
  assert.equal(unknown.coveragePct, 0);
  const leveraged = data.instruments.find(row => row.symbol === 'TQQQ');
  assert.equal(leveraged.kind, 'leveraged_etf');
  assert.equal(leveraged.leverageTarget, 3);
  assert.deepEqual(leveraged.holdings, []);
  assert.equal(leveraged.coveragePct, 0);
  assert.equal(calls.length, 4, 'known leveraged metadata needs no portfolio or holdings provider call');
  assert.ok(data.instruments.every(row => row.source?.provider && row.fetchedAt));
  assert.doesNotMatch(JSON.stringify(data), /api_token|test&key/);
});

test('one symbol failure does not discard other results and repeats back off', async () => {
  let calls = 0;
  const config = { eodhdKey: 'test', now: NOW, fetchImpl: async url => {
    calls += 1;
    return url === SPY_HOLDINGS_URL ? officialResponse({}, 503) : sources(url);
  } };
  const first = await fetchPortfolioOverlap('SPY,QQQ', config);
  assert.equal(first.instruments.find(row => row.symbol === 'SPY').holdingsStatus, 'unavailable');
  assert.equal(first.instruments.find(row => row.symbol === 'QQQ').holdings.length, 102);
  await fetchPortfolioOverlap('SPY,QQQ', config);
  assert.equal(calls, 2);
  await fetchPortfolioOverlap('SPY,QQQ', { ...config, now: NOW + 60_001 });
  assert.equal(calls, 3);
});

test('concurrent requests share public metadata and successful entries cache six hours', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const config = { now: NOW, fetchImpl: async url => { calls += 1; await pending; return sources(url); } };
  const one = fetchPortfolioOverlap('QQQ,SPY', config);
  const two = fetchPortfolioOverlap('SPY,QQQ', config);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  release();
  assert.deepEqual(await one, await two);
  await fetchPortfolioOverlap('QQQ,SPY', { ...config, now: NOW + PORTFOLIO_OVERLAP_CACHE_TTL_MS - 1 });
  assert.equal(calls, 2);
  await fetchPortfolioOverlap('QQQ,SPY', { ...config, now: NOW + PORTFOLIO_OVERLAP_CACHE_TTL_MS + 1 });
  assert.equal(calls, 4);
});

test('network refresh failure retains older evidence as stale but invalid holdings never fall back', async () => {
  const first = await fetchPortfolioOverlap('QQQ', { now: NOW, fetchImpl: async () => officialResponse(QQQ) });
  const later = NOW + PORTFOLIO_OVERLAP_CACHE_TTL_MS + 1;
  const fallback = await fetchPortfolioOverlap('QQQ', { now: later, fetchImpl: async () => officialResponse({}, 503) });
  assert.equal(fallback.instruments[0].stale, true);
  assert.equal(fallback.instruments[0].fetchedAt, first.instruments[0].fetchedAt);
  const invalid = await fetchPortfolioOverlap('QQQ', { now: later + 60_001, fetchImpl: async () => officialResponse({}) });
  assert.equal(invalid.instruments[0].holdingsStatus, 'unavailable');
  assert.equal(invalid.instruments[0].reason, 'invalid_holdings_data');
  assert.deepEqual(invalid.instruments[0].holdings, []);
});

test('provider work across a batch never exceeds three concurrent jobs', async () => {
  let active = 0;
  let peak = 0;
  const symbols = ['OVERLAPB', 'OVERLAPC', 'OVERLAPD', 'OVERLAPE', 'OVERLAPG', 'OVERLAPH'];
  const result = await fetchPortfolioOverlap(symbols, {
    eodhdKey: 'test', now: NOW,
    fetchImpl: async url => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return sources(url);
    },
  });
  assert.equal(result.instruments.length, symbols.length);
  assert.equal(peak, 3);
});

test('batch deadline preserves completed holdings and never drains expired queued work into provider calls', async () => {
  await fetchPortfolioOverlap('QQQ', { now: NOW, fetchImpl: async () => officialResponse(QQQ) });
  const symbols = ['QQQ', ...Array.from({ length: 39 }, (_, index) => `TIMEBATCH${index}`)];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  const config = {
    eodhdKey: 'test', now: NOW, batchTimeoutMs: 5,
    fetchImpl: async url => {
      calls.push(url);
      await pending;
      return sources(url);
    },
  };
  const first = await fetchPortfolioOverlap(symbols, config);
  assert.equal(first.instruments.length, 40);
  assert.equal(first.instruments.find(row => row.symbol === 'QQQ').holdings.length, 102);
  assert.equal(first.instruments.filter(row => row.reason === 'provider_timeout').length, 39);
  assert.equal(calls.length, 3, 'only the already-running three jobs may remain active');

  // A fresh caller may safely share already-running public work. The queued
  // jobs retain their old deadline and must not receive a new provider budget.
  const second = fetchPortfolioOverlap(symbols, { ...config, batchTimeoutMs: 1000 });
  release();
  const shared = await second;
  assert.equal(calls.length, 3, 'expired queue never starts the remaining 36 provider requests');
  assert.equal(shared.instruments.filter(row => row.kind === 'stock').length, 3);
  assert.equal(shared.instruments.filter(row => row.reason === 'provider_timeout').length, 36);
  assert.equal(first.instruments.filter(row => row.kind === 'stock').length, 0, 'later cache completion cannot mutate a returned batch');

  const queued = shared.instruments.find(row => row.reason === 'provider_timeout').symbol;
  let retryCalls = 0;
  const retry = await fetchPortfolioOverlap([queued], {
    eodhdKey: 'test', now: NOW + 60_001,
    fetchImpl: async url => { retryCalls += 1; return sources(url); },
  });
  assert.equal(retryCalls, 1, 'expired queued metadata is eligible for a later retry');
  assert.equal(retry.instruments[0].kind, 'stock');
});

test('batch timeout validates its bounds and a fast batch clears its deadline timer', async () => {
  for (const batchTimeoutMs of [0, -1, NaN, Infinity, '17']) {
    await assert.rejects(fetchPortfolioOverlap('TQQQ', { now: NOW, batchTimeoutMs }), { code: 'INVALID_DATA' });
  }
  const data = await fetchPortfolioOverlap('TQQQ', { now: NOW, batchTimeoutMs: 1000 });
  assert.equal(data.instruments[0].kind, 'leveraged_etf');
  assert.equal(data.instruments[0].reason, 'leveraged_fund_not_expanded');
});
