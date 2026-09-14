import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { normalizeStockValuationData } from '../src/lib/stockDecisionValuation.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/components/StockDecisionValuation.jsx');
const compiled = (await transformWithOxc(source, 'StockDecisionValuation.jsx', { jsx: { runtime: 'classic' } })).code
  .replace(/import\s*(['"])\.\/StockDecisionValuation\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
const { StockDecisionValuation } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now = Date.now();
const day = offset => new Date(now + offset * 86400000).toISOString().slice(0, 10);
function snapshot(symbol = 'NVDA') {
  const cik = { MSFT: '0000789019', NVDA: '0001045810', META: '0001326801' }[symbol];
  return {
    schemaVersion: 2, modelVersion: 'earnings-valuation-v2', symbol, currency: 'USD', status: 'available', reason: null,
    checkedAt: new Date(now).toISOString(), verifiedAt: day(0), expiresAt: new Date(now + 600000).toISOString(),
    snapshotId: `${symbol}-test-filing-v2`, reportedPeriod: 'FY Q2', reportPeriodEnd: day(-60), reportedAt: day(-30),
    forecastPeriod: { zh: '未来四个未披露季度', en: 'Next four unreported quarters', start: day(-59), end: day(305) },
    sources: [{ title: 'SEC company facts', url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json` }],
    scenarios: ['cautious', 'base', 'optimistic'].map((id, index) => {
      const eps = 100 * (1 + [0.05, 0.1, 0.15][index]) * 0.3 * (1 - 0.2) / 4;
      return { id, eps, assumptions: [{ label: { zh: '营收增长假设', en: 'Revenue growth assumption' }, value: `${[5, 10, 15][index]}%` }],
        prices: [20, 25, 30].map(pe => ({ pe, price: Math.round(eps * pe * 100) / 100 })) };
    }),
    notes: { zh: '经营盈利情景，不代表公司预测。', en: 'Operating-profit scenarios, not company forecasts.' },
  };
}
const render = props => renderToStaticMarkup(React.createElement(StockDecisionValuation, props));

test('dynamic scenarios show the returned financial period and check time without requiring expansion', () => {
  for (const symbol of ['MSFT', 'NVDA', 'META']) {
    const data = snapshot(symbol);
    const base = data.scenarios.find(item => item.id === 'base');
    const price = base.eps * 26;
    const markup = render({ data, price, priceDate: day(-1) });
    assert.ok(markup.includes(`$${base.eps.toFixed(2)}`));
    base.prices.forEach(item => assert.ok(markup.includes(`$${item.price.toFixed(2)}`), `${symbol}: ${item.pe}`));
    assert.match(markup, /EPS 为情景测算/);
    assert.match(markup, /26\.00×/);
    assert.ok(markup.includes(`财报期间 · ${data.reportedPeriod} · 截至 ${data.reportPeriodEnd}`));
    assert.ok(markup.includes(`上次检查 · ${data.checkedAt.slice(0, 16).replace('T', ' ')} UTC`));
    assert.match(markup, /财报自动解析/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /aria-pressed="true">基准/);
    assert.doesNotMatch(markup, /可买入|必然支撑|公允价格|预期收益/);
    const english = render({ data, price, priceDate: day(-1), english: true });
    assert.doesNotMatch(english, /[\u4e00-\u9fff]/);
    assert.match(english, /Reported period|Last checked/);
  }
  assert.doesNotMatch(source, /2026-09-14|2026-10-14|30日|Thirty days|人工复核|最迟复核|Financial snapshot verified|Review due/);
});

test('missing, future-information and nonfinite closes never become zero PE or a marker', () => {
  const data = snapshot('MSFT');
  for (const [price, priceDate] of [[null, day(-1)], [NaN, day(-1)], [0, day(-1)], [495, day(-70)],
    [495, day(1)], [495, '2026-02-30'], [495, 'zzz'], [undefined, undefined]]) {
    const markup = render({ data, price, priceDate });
    assert.doesNotMatch(markup, /class="sd-valuation-marker"|0\.00×/);
    assert.match(markup, /同口径收盘数据不足/);
    assert.ok(markup.includes(`$${data.scenarios[1].eps.toFixed(2)}`), 'a missing close does not fabricate PE or erase the separately valid EPS');
  }
});

test('pending, failed and expired checks cannot leave old EPS, PE prices or markers visible', () => {
  const current = snapshot();
  const pending = { ...current, status: 'pending', reason: 'LATEST_EARNINGS_PENDING', scenarios: [], snapshotId: null, forecastPeriod: null };
  const expired = { ...current, expiresAt: new Date(now - 1).toISOString() };
  for (const props of [{ data: current, error: 'NETWORK_ERROR' }, { data: current, loading: true },
    { data: { ...pending, status: 'unsupported', symbol: 'QQQ' } }, { data: pending }, { data: expired }]) {
    const markup = render(props);
    assert.doesNotMatch(markup, /sd-valuation-marker|sd-valuation-prices|\$0|25× PE/);
    assert.match(markup, /role="status"/);
    assert.ok(!markup.includes(`$${current.scenarios[1].eps.toFixed(2)}`));
  }
  assert.match(render({ data: pending }), /财报待更新或资料不足/);
  assert.match(render({ data: expired }), /data-valuation-status="pending"/);
  assert.doesNotMatch(render({ data: pending, english: true }), /[\u4e00-\u9fff]/);
});

function mountEffects(t, props) {
  const effects = [];
  let writes = 0;
  t.mock.method(React, 'useState', initial => [typeof initial === 'function' ? initial() : initial, () => { writes += 1; }]);
  t.mock.method(React, 'useRef', initial => ({ current: initial }));
  t.mock.method(React, 'useId', () => 'valuation-details-test');
  t.mock.method(React, 'useEffect', effect => { effects.push(effect); });
  StockDecisionValuation(props);
  const cleanup = effects.map(effect => effect()).filter(value => typeof value === 'function');
  return { unmount: () => cleanup.forEach(fn => fn()), writes: () => writes };
}

test('local expiry checks retry once on visibility restoration and clean up on account change or unmount', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
  const previousDocument = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'hidden';
  globalThis.document = document;
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  let retries = 0;
  const mounted = mountEffects(t, { data: snapshot(), onRetry: () => { retries += 1; } });
  t.mock.timers.tick(600001);
  assert.equal(retries, 0, 'background expiry must not issue a request');
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(retries, 1);
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(retries, 1, 'the same expired response must not cause a retry loop');
  mounted.unmount();
  const writes = mounted.writes();
  document.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(600001);
  assert.equal(mounted.writes(), writes, 'an unmounted/account-replaced report must not receive updates');
  assert.equal(retries, 1);
});

test('pending checks use the returned retry deadline and cancel their timer when replaced', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
  const previousDocument = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const pending = { ...snapshot(), status: 'pending', reason: 'financial_update_pending', scenarios: [],
    snapshotId: null, forecastPeriod: null, expiresAt: new Date(now + 60000).toISOString() };
  let retries = 0;
  const mounted = mountEffects(t, { data: pending, onRetry: () => { retries += 1; } });
  t.mock.timers.tick(60001);
  assert.equal(retries, 1, 'pending recovery follows the server minute, not the available ten-minute interval');
  mounted.unmount();
  const replaced = mountEffects(t, { data: { ...pending, expiresAt: new Date(Date.now() + 60000).toISOString() }, onRetry: () => { retries += 1; } });
  replaced.unmount();
  const writes = replaced.writes();
  t.mock.timers.tick(60001);
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(retries, 1);
  assert.equal(replaced.writes(), writes);
});

test('a device two minutes fast backs off repeated expired server checks and recovers on a new check', t => {
  const clockSkew = 120000;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: now + clockSkew });
  const previousDocument = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const raw = snapshot();
  const normalize = data => normalizeStockValuationData(data, { symbol: data.symbol, now: Date.now() });
  let retries = 0;
  const onRetry = () => { retries += 1; };
  let mounted = mountEffects(t, { data: normalize(raw), onRetry });
  t.mock.timers.tick(480001);
  assert.equal(retries, 1, 'the fast clock reaches the deadline before the server cache does');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pending = normalize(structuredClone(raw));
    assert.equal(pending.status, 'pending');
    assert.equal(pending.reason, 'CHECK_EXPIRED');
    assert.deepEqual(pending.scenarios, []);
    assert.doesNotMatch(render({ data: pending }), /sd-valuation-prices|sd-valuation-marker|Forecast EPS/);
    mounted.unmount();
    mounted = mountEffects(t, { data: pending, onRetry });
    document.dispatchEvent(new Event('visibilitychange'));
    t.mock.timers.tick(59999);
    assert.equal(retries, attempt + 1, 'an expired response must wait a full local minute');
    t.mock.timers.tick(1);
    assert.equal(retries, attempt + 2);
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(retries, attempt + 2, 'visibility must not retry twice without another response');
  }
  const serverNow = Date.now() - clockSkew;
  assert.ok(serverNow > Date.parse(raw.expiresAt));
  const next = normalize({ ...raw, checkedAt: new Date(serverNow).toISOString(),
    verifiedAt: new Date(serverNow).toISOString().slice(0, 10), expiresAt: new Date(serverNow + 600000).toISOString() });
  assert.equal(next.status, 'available');
  assert.notEqual(next.checkedAt, raw.checkedAt);
  mounted.unmount();
  mounted = mountEffects(t, { data: next, onRetry });
  assert.match(render({ data: next, price: 200, priceDate: day(-1) }), /sd-valuation-prices/);
  t.mock.timers.tick(60000);
  assert.equal(retries, 3, 'the new check restores its own normal deadline');
  mounted.unmount();
});

test('the page keeps valuation loading and retry independent of technical loading and uses raw close only', () => {
  const page = read('src/pages/StockDecisionPage.jsx');
  assert.match(page, /const \[valuationState, setValuationState\]/);
  assert.match(page, /valuationSource\(\{ userId, symbol: request\.symbol, signal: controller\.signal \}\)/);
  assert.match(page, /price=\{data\.valuationClose\?\.price\} priceDate=\{data\.valuationClose\?\.date\}/);
  assert.doesNotMatch(page, /Promise\.all|price=\{decision\.price\}[^\n]*english=/);
  assert.match(page, /onRetry=\{\(\) => setValuationRetry/);
  const effect = page.slice(page.indexOf('    setValuationState({ key,'), page.indexOf('  const data = state.key'));
  assert.match(effect, /!controller\.signal\.aborted/);
  assert.match(effect, /return \(\) => controller\.abort\(\)/);
  assert.doesNotMatch(effect, /setState\(|setRequest\(/);
  assert.ok(page.indexOf('{valuation}') < page.indexOf('<section className="sd-checks"'));
  const preview = read('src/dev/StockDecisionPreview.jsx');
  assert.match(preview, /normalizeStockValuationData/);
  assert.doesNotMatch(preview, /stockDecisionFixtures|comparison\.json/);
});
