import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReviewActivityTime } from '../src/lib/reviewActivityTime.js';

const createdAt = '2026-11-07T23:30:00.000Z';
const start = Date.parse(createdAt);
const format = (elapsed, options = {}) => formatReviewActivityTime({ createdAt, date: '2026-11-06' }, { now: start + elapsed, timeZone: 'Asia/Shanghai', ...options });

test('activities switch at exact minute, hour and elapsed 24-hour boundaries', () => {
  for (const [elapsed, label] of [[0, '刚刚'], [59999, '刚刚'], [60000, '1分钟前'], [119999, '1分钟前'],
    [3599999, '59分钟前'], [3600000, '1小时前'], [86399999, '23小时前'], [86400000, '1天前'],
    [172799999, '1天前'], [172800000, '2天前']]) {
    assert.equal(format(elapsed).label, label, `${elapsed} elapsed milliseconds`);
  }
});

test('crossing UTC midnight or a viewer calendar day does not count as a whole elapsed day', () => {
  assert.equal(formatReviewActivityTime({ createdAt: '2026-11-07T23:59:00Z' }, { now: Date.parse('2026-11-08T00:01:00Z'), timeZone: 'UTC' }).label, '2分钟前');
  assert.equal(formatReviewActivityTime({ createdAt: '2026-11-07T15:59:00Z' }, { now: Date.parse('2026-11-07T16:01:00Z'), timeZone: 'Asia/Shanghai' }).label, '2分钟前');
  assert.equal(format(23 * 3600000).label, '23小时前');
});

test('equivalent offset timestamps have equal relative labels and preserve their original datetime', () => {
  const now = Date.parse('2026-11-08T02:30:00Z');
  const stamps = ['2026-11-07T23:30:00Z', '2026-11-08T07:30:00+08:00', '2026-11-07T18:30:00-05:00'];
  const results = stamps.map(createdAt => formatReviewActivityTime({ createdAt }, { now, timeZone: 'Asia/Shanghai' }));
  assert.deepEqual(results.map(value => value.label), ['3小时前', '3小时前', '3小时前']);
  assert.deepEqual(results.map(value => value.dateTime), stamps);
  assert.equal(new Set(results.map(value => value.title)).size, 1);
});

test('viewer timezone changes the precise title but never the relative elapsed label', () => {
  const shanghai = format(60000), newYork = format(60000, { timeZone: 'America/New_York' });
  assert.equal(shanghai.label, newYork.label);
  assert.match(shanghai.title, /2026.*11.*08.*07:30:00/);
  assert.match(newYork.title, /2026.*11.*07.*18:30:00/);
  assert.notEqual(shanghai.title, newYork.title);
  const device = format(60000, { timeZone: undefined });
  assert.equal(device.title, new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).format(start));
});

test('only explicit timezone timestamps are used, and malformed or calendar-only values fall back without inventing time', () => {
  for (const value of [undefined, null, '', '2026-11-07', '2026-11-07T23:30:00', '2026-11-07 23:30:00Z',
    '2026-02-30T23:30:00Z', '2026-11-07T24:00:00Z', '2026-11-07T23:30:60Z', '2026-11-07T23:30:00+25:00', 1794094200000]) {
    assert.deepEqual(formatReviewActivityTime({ createdAt: value, date: '2026-11-07' }, { now: start }), { label: '2026-11-07', dateTime: '2026-11-07', title: '2026-11-07' });
  }
  for (const date of [undefined, '', '2026-02-30', '2026-13-01', '0000-01-01', '2026-1-1']) {
    assert.deepEqual(formatReviewActivityTime({ date }, { now: start }), { label: '—', dateTime: undefined, title: '' });
  }
  assert.equal(formatReviewActivityTime({ date: '2024-02-29' }).label, '2024-02-29');
  assert.equal(formatReviewActivityTime(null).label, '—');
});

test('future timestamps display just now and invalid clocks safely retain a historical date', () => {
  assert.equal(format(-3600000).label, '刚刚');
  assert.equal(format(-86400000).dateTime, createdAt);
  assert.deepEqual(format(0, { now: NaN }), { label: '2026-11-06', dateTime: '2026-11-06', title: '2026-11-06' });
  assert.doesNotThrow(() => format(60000, { timeZone: 'not-a-real-zone' }));
});

test('English labels use the same thresholds with correct singular and plural units', () => {
  for (const [elapsed, label] of [[0, 'Just now'], [60000, '1 minute ago'], [120000, '2 minutes ago'],
    [3600000, '1 hour ago'], [7200000, '2 hours ago'], [86400000, '1 day ago'], [172800000, '2 days ago']]) {
    assert.equal(format(elapsed, { language: 'en-US' }).label, label);
  }
});

test('server microseconds do not round an activity prematurely into the next minute', () => {
  const timestamp='2026-11-08T00:00:00.000456Z';
  const result=formatReviewActivityTime({createdAt:timestamp},{now:Date.parse('2026-11-08T00:01:00.000Z')});
  assert.equal(result.label,'刚刚');assert.equal(result.dateTime,timestamp);
  assert.equal(formatReviewActivityTime({createdAt:timestamp},{now:Date.parse('2026-11-08T00:01:00.001Z')}).label,'1分钟前');
});
