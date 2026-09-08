import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../src/pages/VixComparisonPage.jsx', import.meta.url), 'utf8');
const chartSource = readFileSync(new URL('../src/components/VixComparisonChart.jsx', import.meta.url), 'utf8');

test('VIX comparison omits the removed top labels and idle chart hints in both languages', () => {
  for (const text of ['左轴 · 点', '右轴 · 复权美元', 'Left · points', 'Right · Adj. USD']) {
    assert.equal(pageSource.includes(text), false, `removed top label must stay absent: ${text}`);
  }
  for (const text of ['滑动查看历史日涨跌', '左右轴独立刻度', 'Touch to see daily changes', 'Independent axes']) {
    assert.equal(chartSource.includes(text), false, `removed idle hint must stay absent: ${text}`);
  }
});

test('compact VIX comparison retains accessible date selection, price units and daily changes', () => {
  assert.ok(chartSource.includes('role="slider"'));
  assert.ok(chartSource.includes('aria-valuetext=') && chartSource.includes('selected.date'));
  assert.ok(chartSource.includes('VIX points on the left axis') && chartSource.includes('adjusted USD price on the right axis'));
  assert.ok(chartSource.includes('左轴 VIX 点位') && chartSource.includes('美元复权价'));
  for (const [name, source] of [['page', pageSource], ['chart', chartSource]]) {
    assert.ok(source.includes('priceDayChangePct'), `${name} must retain the ETF daily-change value`);
    assert.ok(source.includes('vixDayChangePct'), `${name} must retain the VIX daily-change value`);
    assert.ok(source.includes('formatVixComparisonChangePercent('), `${name} must retain shared signed-percent formatting`);
  }
});

test('VIX comparison removes static footer explanations while retaining data-status feedback', () => {
  for (const text of [
    'it is an ETF, not the index itself.', '的 ETF，并非指数点位。',
    'Daily changes compare with the previous trading close;', '当日涨跌相对前一交易日收盘计算，',
    'Daily closing data, not live quotes.', '日线收盘数据，非实时行情。',
    ' EODHD.',
  ]) assert.equal(pageSource.includes(text), false, `removed footer explanation must stay absent: ${text}`);
  assert.equal(/\bInfo\b/.test(pageSource), false, 'the removed information icon must not remain');
  assert.ok(pageSource.includes('stale && data?.expectedAsOfDate'));
  assert.ok(pageSource.includes('Latest expected trading date:') && pageSource.includes('最近应有交易日：'));
  assert.ok(pageSource.includes('partialHistory &&') && pageSource.includes('Available history starts') && pageSource.includes('可用历史始于'));
  assert.ok(pageSource.includes('state.error &&') && pageSource.includes('role="alert"'));
  assert.ok(pageSource.includes('Daily data could not be loaded.') && pageSource.includes('日线数据暂时无法读取。'));
});
