import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readReviewMarketDate, createReviewMarketSnapshot, normalizeReviewMarketSnapshot,
  reviewMarketDateStatus, formatReviewMarketItem, reviewMarketItemState,
} from '../src/lib/reviewMarketSnapshot.js';

const date = '2026-11-05';
const now = Date.parse('2026-11-06T10:00:00Z');
const inputs = () => ({ date, recordDate: '2026-11-06', now,
  vixComparison: { source: 'CBOE_EODHD_EOD', series: { VIX: { rows: [{ date, close: 28.18 }] } },
    termStructure: { source: 'CBOE', rows: [{ date, vix: 28.18, vix3m: 25.55, ratio: 28.18 / 25.55 }] } },
  fearGreed: { source: 'CNN', fetchedAt: '2026-11-06T09:00:00Z',
    history: [{ timestamp: Date.parse(`${date}T00:00:00Z`), value: 44.6, rating: 'fear' }],
    current: { score: 99, timestamp: '2026-11-06T09:00:00Z' } },
});

test('market snapshots use exact same-day closes, raw ratio and shared classifications', () => {
  const result = readReviewMarketDate(inputs());
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.items.map(item => item.key), ['vix', 'ratio', 'fearGreed']);
  assert.equal(result.items[0].stateCode, 'HIGH_STRESS');
  assert.equal(result.items[1].value, 28.18 / 25.55);
  assert.equal(formatReviewMarketItem(result.items[1]), '1.103');
  assert.equal(result.items[1].stateCode, 'DEEP_INVERTED');
  assert.equal(result.items[2].value, 44.6, 'keep source precision separately from display');
  assert.equal(formatReviewMarketItem(result.items[2]), '45');
  assert.equal(reviewMarketItemState(result.items[2]), '中性');
  assert.equal(reviewMarketItemState(result.items[2], 'en'), 'Neutral');
});

test('missing one source or indicator does not replace dates or discard other readings', () => {
  const data = inputs();
  data.vixComparison.termStructure.rows = [];
  assert.deepEqual(readReviewMarketDate(data).items.map(item => item.key), ['vix', 'fearGreed']);
  assert.equal(readReviewMarketDate(data).items[0].stateCode, 'CLOSE');
  data.fearGreed = null;
  assert.deepEqual(readReviewMarketDate(data).items.map(item => item.key), ['vix']);
  data.date = '2026-11-04';
  assert.deepEqual(readReviewMarketDate(data).items, [], 'never substitute the prior or next available date');
  data.date = date;
  data.vixComparison = null;
  data.fearGreed = inputs().fearGreed;
  data.fearGreed.history[0].value = 0;
  assert.equal(readReviewMarketDate(data).items[0].value, 0, 'a real zero sentiment score stays valid');
});

test('future, non-session, malformed and post-record dates remain unavailable', () => {
  assert.equal(reviewMarketDateStatus('2026-11-06', '2026-11-06', now), 'incomplete_close');
  assert.equal(reviewMarketDateStatus('2026-11-07', '2026-11-08', Date.parse('2026-11-09T23:00Z')), 'not_session');
  assert.equal(reviewMarketDateStatus('2026-11-05', '2026-11-04', now), 'after_record');
  assert.equal(reviewMarketDateStatus('2026-02-30', '2026-11-06', now), 'invalid_date');
  assert.deepEqual(readReviewMarketDate({ ...inputs(), date: '2026-11-06' }).items, []);
});

test('CNN source-midnight dates are retained but intraday and stale pre-close captures cannot become closes', () => {
  const data = inputs();
  assert.equal(readReviewMarketDate(data).items.at(-1).asOfDate, date, 'UTC source date does not shift to prior NY day');
  data.fearGreed.history[0].timestamp = Date.parse(`${date}T19:00:00Z`);
  assert.equal(readReviewMarketDate(data).items.some(item => item.key === 'fearGreed'), false, '14:00 NY is intraday');
  data.fearGreed.history[0].timestamp = Date.parse(`${date}T21:05:00Z`);
  assert.equal(readReviewMarketDate(data).items.at(-1).key, 'fearGreed', '16:05 NY is post-close');
  data.fearGreed.history[0].timestamp = Date.parse(`${date}T00:00:00Z`);
  data.fearGreed.fetchedAt = `${date}T19:00:00Z`;
  assert.equal(readReviewMarketDate(data).items.some(item => item.key === 'fearGreed'), false);
});

test('duplicate dates, contradictory VIX and invalid ratios fail only the affected indicator', () => {
  const data = inputs();
  data.vixComparison.termStructure.rows[0].vix = 30;
  assert.deepEqual(readReviewMarketDate(data).items.map(item => item.key), ['vix', 'fearGreed']);
  data.fearGreed.history.push({ ...data.fearGreed.history[0], value: 80 });
  assert.deepEqual(readReviewMarketDate(data).items.map(item => item.key), ['vix']);
  data.vixComparison.series.VIX.rows[0].close = null;
  assert.deepEqual(readReviewMarketDate(data).items, []);
});

test('save copies selected numeric observations into independent JSON and prevents empty snapshots', () => {
  const data = inputs();
  const { items } = readReviewMarketDate(data);
  const snapshot = createReviewMarketSnapshot({ ...data, items, selectedKeys: ['ratio', 'fearGreed'] });
  assert.equal(snapshot.source, 'CBOE · CNN');
  assert.equal(snapshot.example, false);
  assert.equal(snapshot.basis, 'close');
  assert.equal(snapshot.recordDate, '2026-11-06');
  assert.equal(snapshot.asOfDate, date);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  items[1].value = 5;
  data.fearGreed.history[0].value = 90;
  assert.equal(snapshot.items[0].value, 28.18 / 25.55);
  assert.equal(snapshot.items[1].value, 44.6);
  assert.equal(createReviewMarketSnapshot({ ...data, items, selectedKeys: [] }), null);
  assert.equal(normalizeReviewMarketSnapshot({ ...snapshot, items: [{ ...snapshot.items[0], value: 0 }] }), null);
  assert.equal(normalizeReviewMarketSnapshot({ ...snapshot, items: [{ ...snapshot.items[1], source: 'other' }] }), null);
});
