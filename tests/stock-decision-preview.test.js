import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookupStockDecision, STOCK_DECISION_SAMPLES } from '../src/dev/stockDecisionFixtures.js';

const CHECK_IDS = ['trend', 'position', 'volume', 'momentum'];

test('unsupported input never borrows another symbol’s fictional decision', () => {
  for (const input of ['', '   ', null, undefined, 123, 'AAPL', 'NVDA.X', 'constructor', '__proto__']) {
    assert.equal(lookupStockDecision(input), null);
  }
  assert.equal(lookupStockDecision(' meta.us ').symbol, 'META');
});

test('mock scenarios keep chart, price and daily change coherent without planned risk', () => {
  for (const { symbol } of STOCK_DECISION_SAMPLES) {
    const sample = lookupStockDecision(symbol);
    assert.equal(sample.history.at(-1), sample.price);
    assert.ok(sample.history.every(value => Number.isFinite(value) && value > 0));
    const change = (sample.price / sample.history.at(-2) - 1) * 100;
    assert.ok(Math.abs(change - sample.changePct) < 0.01, symbol);
    assert.ok(sample.support < sample.price && sample.price < sample.resistance);
    assert.deepEqual(sample.checks.map(check => check.id), CHECK_IDS);
    assert.doesNotMatch(JSON.stringify(sample), /计划风险|止损|仓位建议/);
  }
});

test('all localized samples contain four checks without the removed calendar-event dimension', () => {
  for (const { symbol } of STOCK_DECISION_SAMPLES) {
    for (const language of ['zh', 'en']) {
      const sample = lookupStockDecision(symbol, language);
      assert.deepEqual(sample.checks.map(check => check.id), CHECK_IDS);
      assert.deepEqual(sample.checks.map(check => check.label), language === 'zh'
        ? ['趋势', '位置', '量能', '动量'] : ['Trend', 'Position', 'Volume', 'Momentum']);
      assert.ok(sample.checks.every(check => ['clear', 'caution', 'neutral', 'missing'].includes(check.status)
        && check.reading && check.metric && check.detail));
      assert.doesNotMatch(JSON.stringify(sample), /财报|财报事件|earnings|"events?"\s*:/i);
    }
  }
  const fixtures = readFileSync(new URL('../src/dev/stockDecisionFixtures.js', import.meta.url), 'utf8');
  // A price-derived divergence event is part of momentum, not a fifth calendar check.
  assert.doesNotMatch(fixtures, /财报|earnings|\b(?:id|label)\s*:\s*['"]events?['"]/i,
    'the calendar row and earnings text are deleted, not hidden');
  const statuses = [...fixtures.matchAll(/statuses:\s*\[([^\]]+)\]/g)];
  assert.equal(statuses.length, STOCK_DECISION_SAMPLES.length);
  assert.ok(statuses.every(match => match[1].split(',').filter(value => value.trim()).length === 4));
});

test('report numbering follows its actual checks instead of keeping a hidden fifth row', () => {
  const page = readFileSync(new URL('../src/pages/StockDecisionPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /01 — \{String\(decision\.checks\.length\)\.padStart\(2,\s*['"]0['"]\)\}/);
  assert.match(page, /decision\.checks\.map\(\(check, index\) =>/);
  assert.match(page, /String\(index \+ 1\)\.padStart\(2,\s*['"]0['"]\)/);
  assert.doesNotMatch(page, /01 — 05|财报|事件|Earnings|\bEvents\b/);
});

test('English scenarios and returned copies stay independent', () => {
  for (const { symbol } of STOCK_DECISION_SAMPLES) {
    const english = lookupStockDecision(symbol, 'en');
    assert.doesNotMatch(JSON.stringify(english), /[\u4e00-\u9fff]/);
    english.history[0] = 0;
    english.checks[0].reading = 'changed';
    assert.notEqual(lookupStockDecision(symbol, 'en').history[0], 0);
    assert.notEqual(lookupStockDecision(symbol, 'en').checks[0].reading, 'changed');
  }
});
