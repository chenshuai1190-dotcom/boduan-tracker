import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeReviewEvaluationScore as score, normalizeReviewEvaluationTags as tags,
  normalizeReviewTradeReferences as trades, normalizeReviewAccountSnapshot as account,
} from '../src/lib/reviewEvaluationModel.js';
import { buildReviewJournalWrite, mapReviewJournalRow } from '../src/lib/reviewJournalModel.js';

const strict = { strict: true };
const USER = '11111111-1111-4111-8111-111111111111';
const IMAGE = { path: `${USER}/22222222-2222-4222-8222-222222222222.jpg`, name: '图.jpg', mimeType: 'image/jpeg', size: 100 };
const trade = overrides => ({ id: 'trade-1', symbol: 'SMH', date: '2026-11-05', side: 'buy', price: 553.2, shares: 0.5, ...overrides });
const snapshot = overrides => ({ version: 1, kind: 'account_snapshot', asOfDate: '2026-11-05', recordDate: '2026-11-07',
  basis: 'close', source: 'pnl_report', items: [
    { key: 'cumulativeReturnPct', value: 0.125, asOfDate: '2026-11-05', basis: 'close', source: 'pnl_report' },
    { key: 'dailyReturnPct', value: -0.0182, asOfDate: '2026-11-05', basis: 'close', source: 'pnl_report' },
    { key: 'leverage', value: 1.28, asOfDate: '2026-11-05', basis: 'close', source: 'pnl_report' },
  ], ...overrides });
const reply = overrides => ({ id: 'reply-1', date: '2026-11-07', text: '', ...overrides });
const entry = replies => ({ type: 'log', date: '2026-11-06', text: '原记录', replies });
const read = replies => mapReviewJournalRow({ user_id: USER, log_date: '2026-11-06', text: '原记录', review_data: { replies } }, 'log', USER).replies;

test('ten-point ratings preserve half-star integers without coercion or clamping', () => {
  for (const value of [undefined, null]) assert.equal(score(value, strict), null);
  for (let value = 1; value <= 10; value++) assert.equal(score(value, strict), value);
  for (const value of [0, -1, 11, 2.5, '6', false, NaN, Infinity, {}, []]) {
    assert.equal(score(value), null);
    assert.throws(() => score(value, strict), { code: 'REVIEW_INVALID_SCORE' });
  }
});

test('tags normalize full-width text and whitespace, deduplicate case and count Unicode code points', () => {
  assert.deepEqual(tags(['  ＡＩ  ', 'ai', ' AI ', '  耐心\n不足 ', '耐心 不足'], strict), ['AI', '耐心 不足']);
  assert.deepEqual(tags(['😀'.repeat(12)], strict), ['😀'.repeat(12)]);
  assert.throws(() => tags(['😀'.repeat(13)], strict), { code: 'REVIEW_INVALID_TAG' });
  assert.deepEqual(tags(['有效', '', 5, '太'.repeat(13), '无\0效', '另一个']), ['有效', '另一个']);
  for (const value of ['单个标签', 12, {}]) {
    assert.deepEqual(tags(value), []);
    assert.throws(() => tags(value, strict), { code: 'REVIEW_INVALID_TAGS' });
  }
  assert.throws(() => tags([''], strict), { code: 'REVIEW_INVALID_TAG' });
  assert.deepEqual(tags(null, strict), []);
});

test('tag limit applies to unique normalized labels and preserves their order', () => {
  const eight = Array.from({ length: 8 }, (_, index) => `标签${index}`);
  assert.deepEqual(tags([...eight, eight[0]], strict), eight);
  assert.throws(() => tags([...eight, '第九个'], strict), { code: 'REVIEW_TAGS_LIMIT' });
  assert.deepEqual(tags([...eight, '第九个']), eight);
});

test('trade references clone only immutable transaction facts and normalize identifiers', () => {
  const source = trade({ id: 42, symbol: ' smh ', currentPrice: 99, user_id: USER, extra: { value: 1 } });
  const result = trades([source], strict);
  assert.deepEqual(result, [trade({ id: '42' })]);
  source.price = 1; source.date = '2026-11-07';
  assert.equal(result[0].price, 553.2);
  assert.equal(result[0].date, '2026-11-05');
  assert.deepEqual(trades(undefined, strict), []);
});

test('trade validation rejects missing or impossible facts, duplicate IDs and excess references', () => {
  const invalidRows = [
    null, trade({ id: '' }), trade({ id: 0 }), trade({ id: 'a'.repeat(101) }), trade({ id: 'bad\0id' }),
    trade({ symbol: '' }), trade({ symbol: '<script>' }), trade({ symbol: 'A'.repeat(21) }),
    trade({ date: '2026-02-30' }), trade({ date: '0000-01-01' }), trade({ side: 'BUY' }),
    ...[0, -2, NaN, Infinity, null, '10'].flatMap(value => [trade({ price: value }), trade({ shares: value })]),
  ];
  for (const value of invalidRows) {
    assert.deepEqual(trades([value]), []);
    assert.throws(() => trades([value], strict), { code: 'REVIEW_INVALID_TRADE' });
  }
  assert.throws(() => trades([trade(), trade()], strict), { code: 'REVIEW_INVALID_TRADE' });
  assert.deepEqual(trades([null, trade(), trade()]), [trade()]);
  for (const value of [{}, Array.from({ length: 21 }, (_, i) => trade({ id: String(i) }))]) {
    assert.deepEqual(trades(value), []);
    assert.throws(() => trades(value, strict), { code: 'REVIEW_TRADES_LIMIT' });
  }
});

test('account snapshot freezes exact dated values without converting returns or filling missing metrics', () => {
  const original = snapshot();
  const result = account(original, strict);
  assert.deepEqual(result, original);
  original.items[0].value = 99;
  assert.equal(result.items[0].value, 0.125, 'the stored contract preserves supplied percentage points without another conversion');
  const zero = snapshot({ items: [{ ...original.items[1], value: 0 }] });
  assert.deepEqual(account(zero, strict).items, zero.items);
  assert.equal(account(zero, strict).items.some(item => item.key === 'leverage'), false);
  assert.equal(account(null, strict), null);
});

test('account snapshot requires matching source, dates, basis and known finite metric types', () => {
  for (const overrides of [
    { version: 2 }, { version: '1' }, { kind: 'current_account' }, { basis: 'live' }, { source: 'manual' },
    { asOfDate: '2026-11-08' }, { asOfDate: '2026-02-30' }, { recordDate: 'bad' },
    { items: [] }, { items: null }, { items: Array(6).fill(snapshot().items[0]) },
  ]) {
    const value = snapshot(overrides);
    assert.equal(account(value), null);
    assert.throws(() => account(value, strict), { code: 'REVIEW_INVALID_ACCOUNT' });
  }
  for (const overrides of [
    { key: 'netAsset' }, { source: 'other' }, { basis: 'live' }, { asOfDate: '2026-11-04' },
    ...[null, undefined, NaN, Infinity, '0.1'].map(value => ({ value })),
    { key: 'leverage', value: 0 }, { key: 'leverage', value: -1 },
  ]) {
    const value = snapshot({ items: [{ ...snapshot().items[0], ...overrides }] });
    assert.equal(account(value), null);
    assert.throws(() => account(value, strict), { code: 'REVIEW_INVALID_ACCOUNT' });
  }
  assert.throws(() => account(snapshot({ items: [snapshot().items[0], snapshot().items[0]] }), strict), { code: 'REVIEW_INVALID_ACCOUNT' });
  const mixed = snapshot({ items: [{ ...snapshot().items[0], value: null }, snapshot().items[2]] });
  assert.deepEqual(account(mixed).items, [snapshot().items[2]], 'bad optional readings are discarded, never changed to zero');
});

const withYearPeak = () => snapshot({ items: [
  { ...snapshot().items[0], value: 20 },
  { ...snapshot().items[0], key: 'yearPeakReturnPct', value: 30, peakDate: '2026-10-23' },
  { ...snapshot().items[0], key: 'declineFromYearPeakPp', value: 10, peakDate: '2026-10-23' },
  snapshot().items[1], snapshot().items[2],
] });

test('year peak references preserve their date and percentage-point decline through save and read', () => {
  const source = withYearPeak();
  const expected = structuredClone(source);
  assert.deepEqual(account({ ...source, items: [...source.items].reverse() }, strict), expected);
  const written = buildReviewJournalWrite(entry([reply({ account: source })]), USER);
  const saved = mapReviewJournalRow({ ...written, id: 'parent' }, 'log', USER).replies[0].account;
  assert.deepEqual(saved, expected);
  source.items[1].value = 90; source.items[1].peakDate = '2026-11-04';
  assert.deepEqual(saved, expected, 'saved historical high does not track later source mutations');
  assert.equal(saved.items[2].value, 10, '30% minus 20% is 10 percentage points, not a relative drawdown');
});

test('optional year peak metrics allow negative peaks, zero decline and independent selection', () => {
  for (const item of withYearPeak().items.slice(1, 3)) {
    assert.deepEqual(account(snapshot({ items: [item] }), strict).items, [item]);
  }
  const sameHigh = withYearPeak();
  sameHigh.items[0].value = -5; sameHigh.items[1].value = -5; sameHigh.items[2].value = 0;
  assert.deepEqual(account(sameHigh, strict), sameHigh);
  assert.deepEqual(account(snapshot(), strict), snapshot(), 'legacy three-metric snapshots remain unchanged');
});

test('year peak metadata rejects future, other-year, malformed dates and negative decline without fabricating values', () => {
  for (const peakDate of [undefined, '', '2026-02-30', '2025-12-31', '2026-11-06']) {
    for (const index of [1, 2]) {
      const item = { ...withYearPeak().items[index], peakDate };
      const source = snapshot({ items: [snapshot().items[0], item] });
      assert.throws(() => account(source, strict), { code: 'REVIEW_INVALID_ACCOUNT' });
      assert.deepEqual(account(source).items, [snapshot().items[0]]);
    }
  }
  const item = { ...withYearPeak().items[2], value: -1 };
  assert.throws(() => account(snapshot({ items: [item] }), strict), { code: 'REVIEW_INVALID_ACCOUNT' });
  assert.equal(account(snapshot({ items: [item] })), null);
});

test('contradictory high and decline references are rejected while legacy readings survive tolerant reads', () => {
  for (const patch of [
    value => { value.items[1].peakDate = '2026-10-22'; },
    value => { value.items[1].value = 19; },
    value => { value.items[2].value = 9.99; },
  ]) {
    const value = withYearPeak(); patch(value);
    assert.throws(() => account(value, strict), { code: 'REVIEW_INVALID_ACCOUNT' });
    assert.deepEqual(account(value).items.map(item => item.key), ['cumulativeReturnPct', 'dailyReturnPct', 'leverage']);
  }
});

test('optional account provenance uses a validated whitelist and never retains foreign objects', () => {
  const evidence = { sourceSnapshotId: 'snap-7', sourceVersion: 'pnl_snapshot_v2',
    sourceUpdatedAt: '2026-11-06T00:00:00.000Z', capturedAt: '2026-11-07T01:00:00Z', lockedAt: '2026-11-06T01:00:00+00:00' };
  assert.deepEqual(account(snapshot({ ...evidence, userId: USER, signedUrl: 'secret' }), strict), snapshot(evidence));
  const databasePrecision = { ...evidence, sourceUpdatedAt: '2026-11-06T00:00:00.123456+00:00', lockedAt: '2026-11-06T01:00:00.654321Z' };
  assert.deepEqual(account(snapshot(databasePrecision), strict), snapshot(databasePrecision), 'database microsecond evidence is retained without truncation');
  for (const [key, value] of [['sourceSnapshotId', ''], ['sourceVersion', 'live'], ['capturedAt', '2026-11-07'], ['lockedAt', '2026-02-30T00:00:00Z'], ['sourceUpdatedAt', new Date()]]) {
    assert.throws(() => account(snapshot({ [key]: value }), strict), { code: 'REVIEW_INVALID_ACCOUNT' });
    assert.equal(Object.hasOwn(account(snapshot({ [key]: value })), key), false);
  }
});

test('legacy text comments retain their content and new evaluation defaults safely', () => {
  const legacy = reply({ text: '以前的评论', createdAt: '2026-11-07T01:00:00Z', mood: '冷静', stocks: ['SMH'] });
  const [result] = read([legacy]);
  assert.equal(result.text, legacy.text); assert.equal(result.createdAt, legacy.createdAt);
  assert.equal(result.mood, '冷静'); assert.deepEqual(result.stocks, ['SMH']);
  assert.equal(result.score, null); assert.deepEqual(result.tags, []); assert.deepEqual(result.trades, []); assert.equal(result.account, null);
});

test('textless ratings, tags, historical references, market and images can each save and reload', () => {
  const values = [{ score: 7 }, { tags: ['耐心不足'] }, { trades: [trade()] }, { account: snapshot() },
    { market: { asOfDate: '2026-11-05', vix: 28.18 } }, { images: [IMAGE] }];
  for (const value of values) {
    const written = buildReviewJournalWrite(entry([reply(value)]), USER);
    const result = mapReviewJournalRow({ ...written, id: 'parent' }, 'log', USER).replies;
    assert.equal(result.length, 1);
    assert.equal(result[0].text, '');
    assert.deepEqual(result[0][Object.keys(value)[0]], Object.values(value)[0]);
  }
});

test('strict comment writes fail before losing invalid evaluation content, while tolerant reads preserve valid text', () => {
  for (const value of [{ score: 0 }, { tags: [''] }, { trades: [trade({ shares: null })] }, { account: snapshot({ asOfDate: '2026-11-09' }) }]) {
    assert.throws(() => buildReviewJournalWrite(entry([reply({ text: '保留原文字', ...value })]), USER));
    const [result] = read([reply({ text: '保留原文字', ...value })]);
    assert.equal(result.text, '保留原文字');
  }
  assert.throws(() => buildReviewJournalWrite(entry([reply()]), USER), { code: 'REVIEW_EMPTY_REPLY' });
  assert.throws(() => buildReviewJournalWrite(entry([reply({ market: {} })]), USER), { code: 'REVIEW_EMPTY_REPLY' });
  assert.deepEqual(read([reply({ score: 0, tags: [null], trades: [trade({ price: 0 })], account: { version: 3 } })]), []);
});

test('new evaluation payload keeps every field after an immutable write-read cycle', () => {
  const source = reply({ score: 9, tags: [' ＲＳＩ ', 'rsi', '纪律'], trades: [trade()], account: snapshot(), images: [IMAGE] });
  const before = structuredClone(source);
  const written = buildReviewJournalWrite(entry([source]), USER);
  assert.deepEqual(source, before);
  const result = mapReviewJournalRow({ ...written, id: 'parent' }, 'log', USER).replies[0];
  assert.equal(result.score, 9); assert.deepEqual(result.tags, ['RSI', '纪律']);
  assert.deepEqual(result.trades, [trade()]); assert.deepEqual(result.account, snapshot()); assert.deepEqual(result.images, [IMAGE]);
  source.trades[0].price = 1; source.account.items[0].value = -99; source.tags.push('额外');
  assert.equal(result.trades[0].price, 553.2); assert.equal(result.account.items[0].value, 0.125); assert.equal(result.tags.length, 2);
});
