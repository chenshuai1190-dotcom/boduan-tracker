import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTradeValuationQuotes } from '../src/lib/tradeValuationQuotes.js';
import { derivePositionsFromTrades } from '../src/lib/investmentSummary.js';
import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';
import { applyStockTickToQuoteRows } from '../src/lib/stockRealtime.js';
import { normalizeEodhdStockQuoteFields } from '../server/quote/providers/eodhd.js';

const trade = { id: 'buy', symbol: 'NVDA', side: 'buy', date: '2026-10-01', price: 100, shares: 10 };
const rest = (config = {}, data = {}) => ({
  symbol: 'NVDA', priceSource: 'EODHD-v2', source: 'EODHD',
  ...normalizeEodhdStockQuoteFields({ lastTradePrice: 200, previousClosePrice: 190, ...data },
    { now: Date.parse('2026-10-07T15:00:00Z'), ...config }),
});
const safe = price => [{ symbol: 'NVDA', price, dailyPnlLocked: false }];

test('accepts actual REST regular and premarket quote contracts, including new-symbol lookup results', () => {
  for (const row of [rest(), rest({ now: Date.parse('2026-10-07T10:00:00Z') }, { ethPrice: 205 })]) {
    assert.deepEqual(selectTradeValuationQuotes([row]), safe(row.price));
    // App's ordinary baseline merge retains daily fields but drops priceSource.
    const { priceSource, source, ...merged } = row;
    assert.deepEqual(selectTradeValuationQuotes([merged]), safe(row.price));
  }
});

test('accepts accepted WS trade and quote-midpoint rows using their dedicated live-price evidence', () => {
  const now = Date.parse('2026-10-07T15:00:00Z');
  for (const source of ['EODHD_WS', 'EODHD_WS_QUOTE']) {
    const rows = applyStockTickToQuoteRows([], { symbol: 'NVDA', price: 201, timestamp: now, source }, 'live', [rest()], { now });
    assert.equal(rows[0].dailyPnlSource, 'realtime-tick');
    assert.deepEqual(selectTradeValuationQuotes(rows), safe(201));
  }
});

test('uses the official locked close instead of an extended-hours stock price', () => {
  const row = rest({ now: Date.parse('2026-10-07T21:00:00Z') }, { ethPrice: 210, previousClosePrice: 202 });
  assert.equal(row.dailyPnlLocked, true);
  assert.equal(row.price, 210);
  assert.deepEqual(selectTradeValuationQuotes([row]), safe(202));
  assert.equal(derivePositionsFromTrades([trade], [row])[0].valuationPrice, 202);
});

test('accepts dated EOD locked closes and legitimate undated provider previous closes', () => {
  const historical = rest({ now: Date.parse('2026-10-10T15:00:00Z'),
    closedDailyPnlPrice: 204, closedDailyPnlDate: '2026-10-09', closedDailyPnlSource: 'eodhd-close' });
  assert.deepEqual(selectTradeValuationQuotes([historical]), safe(204));
  const provider = rest({ now: Date.parse('2026-10-10T15:00:00Z') });
  assert.equal(provider.dailyPnlPriceDate, '');
  assert.equal(provider.dailyPnlSource, 'locked-provider-regular-close');
  assert.deepEqual(selectTradeValuationQuotes([provider]), safe(190));
});

test('preserves the existing locked-valuation fallback order using explicit official baseline evidence', () => {
  const row = { symbol: 'NVDA', price: 220, dailyPnlLocked: true, dailyPnlPrice: 0, dailyPnlSource: 'unavailable',
    dailyPnlBaselineClose: 202, dailyPnlBaselineSource: 'eodhd-adjusted-close', dailyPnlBaselineDate: '2026-10-06',
    dailyBaselineClose: 201, dailyBaselineSource: 'eodhd-close', dailyBaselineDate: '2026-10-05', previousClose: 199 };
  for (const quote of [row, { ...row, dailyPnlBaselineClose: 0 }]) {
    const expected = derivePositionsFromTrades([trade], [quote])[0].valuationPrice;
    assert.deepEqual(selectTradeValuationQuotes([quote]), safe(expected));
    assert.equal(derivePositionsFromTrades([trade], selectTradeValuationQuotes([quote]))[0].valuationPrice, expected);
  }
  assert.deepEqual(selectTradeValuationQuotes([{ ...row, dailyPnlBaselineDate: '', dailyPnlBaselineSource: 'eodhd-quote-previous-close' }]), safe(202));
});

test('a previous-close-only fallback needs provider corroboration and never accepts manual watchlist data', () => {
  const row = { symbol: 'NVDA', price: 220, dailyPnlLocked: true, dailyPnlPrice: 0, previousClose: 199 };
  assert.deepEqual(selectTradeValuationQuotes([row]), []);
  assert.deepEqual(selectTradeValuationQuotes([{ ...row, source: 'EODHD_WS' }]), []);
  assert.deepEqual(selectTradeValuationQuotes([{ ...row, source: 'EODHD_WS', providerPreviousClose: 198 }]), []);
  assert.deepEqual(selectTradeValuationQuotes([{ ...row, source: 'EODHD_WS', providerPreviousClose: 199 }]), safe(199));
  assert.deepEqual(selectTradeValuationQuotes([{ ...row, priceSource: 'EODHD-v2', providerPreviousClose: 199 }]), safe(199));
});

test('trade-price fallbacks remain unavailable even when quote merging retains provider source names', () => {
  const ledgerOnly = buildLedgerQuoteUniverse([trade]).allRows;
  assert.equal(ledgerOnly[0].price, 100);
  assert.deepEqual(selectTradeValuationQuotes(ledgerOnly), []);
  for (const staleMetadata of [
    { source: 'EODHD_WS', dailyPnlSource: 'realtime-tick', dailyPnlPrice: 0 },
    { source: 'EODHD_WS_QUOTE', dailyPnlSource: 'realtime-tick', dailyPnlPrice: 200 },
    { priceSource: 'EODHD-v2', dailyPnlSource: 'realtime-regular', dailyPnlPrice: 0 },
    { priceSource: 'EODHD-v2' },
  ]) {
    const rows = buildLedgerQuoteUniverse([trade], [], [{ symbol: 'NVDA', price: 0, ...staleMetadata }]).allRows;
    assert.equal(rows[0].price, 100);
    assert.deepEqual(selectTradeValuationQuotes(rows), []);
  }
});

test('does not select a lower-priority quote to hide an unverifiable production valuation', () => {
  const row = { symbol: 'NVDA', dailyPnlLocked: true, dailyPnlPrice: 205, dailyPnlSource: 'unavailable',
    dailyPnlBaselineClose: 200, dailyPnlBaselineSource: 'eodhd-close', dailyPnlBaselineDate: '2026-10-06' };
  assert.deepEqual(selectTradeValuationQuotes([row]), []);
  const firstBaselineUnverified = { ...row, dailyPnlPrice: 0, dailyPnlBaselineSource: 'unknown',
    dailyBaselineClose: 190, dailyBaselineSource: 'eodhd-close', dailyBaselineDate: '2026-10-05' };
  assert.deepEqual(selectTradeValuationQuotes([firstBaselineUnverified]), []);
});

test('missing, invalid, non-USD and failed rows never become zero-valued quotes', () => {
  for (const input of [undefined, null, {}, 'quotes']) assert.equal(selectTradeValuationQuotes(input), null);
  assert.deepEqual(selectTradeValuationQuotes([]), []);
  for (const change of [
    { price: 0 }, { price: NaN }, { price: Infinity }, { price: true }, { dailyPnlPrice: null },
    { dailyPnlSource: 'unavailable' }, { error: 'failed' }, { currency: 'CNY' },
  ]) assert.deepEqual(selectTradeValuationQuotes([{ ...rest(), ...change }]), []);
  const locked = rest({ now: Date.parse('2026-10-07T21:00:00Z') });
  assert.deepEqual(selectTradeValuationQuotes([{ ...locked, dailyPnlPriceDate: '2026-02-30' }]), []);
  assert.deepEqual(selectTradeValuationQuotes([null, [], { symbol: '', price: 100 }]), []);
});

test('normalizes only the selected safe value, preserves last-row authority, and never mutates input', () => {
  const row = Object.freeze({ ...rest(), symbol: 'nvda.us', previousClose: 1, high: 9999 });
  const rows = Object.freeze([row]);
  const before = JSON.stringify(rows);
  assert.deepEqual(selectTradeValuationQuotes(rows), safe(200));
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(selectTradeValuationQuotes([rest(), { symbol: 'NVDA', price: 100 }]), []);
});
