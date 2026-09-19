import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchEodhdMacroSeries } from '../server/macro/eodhdProviders.js';

const OPTIONS = { from: '2026-09-01', to: '2026-09-18', now: '2026-09-18T13:00:00Z', eodhdKey: 'test-private-key' };
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) });
const event = (type, comparison, extra = {}) => ({ type, comparison, country: 'US', date: '2026-09-17 12:30:00', period: 'Aug', actual: null, previous: 2.8, estimate: 2.9, ...extra });
function fixture(url) {
  if (url.pathname.includes('/ust/')) return { data: ['2Y', '5Y', '10Y', '30Y'].map(tenor => ({ date: '2026-09-17', tenor, rate: url.pathname.includes('/real-') ? 2.61 : 4.94 })) };
  if (url.pathname.includes('/commodities/')) return {
    meta: { interval: 'daily', unit: url.pathname.endsWith('NATURAL_GAS') ? 'Dollars per Million BTU' : 'Dollars per Barrel', total: 1 },
    data: [{ date: '2026-09-15', value: url.pathname.endsWith('NATURAL_GAS') ? 2.97 : 107.02 }], links: { next: null },
  };
  if (url.pathname === '/api/economic-events') return [];
  return [{ date: '2026-09-17', close: 100.248, adjusted_close: 999 }];
}
function fetchFixture(overrides = () => undefined, requests = []) {
  return async (request, options) => {
    const url = new URL(request);
    requests.push({ url, options });
    return (await overrides(url, options)) ?? response(fixture(url));
  };
}

test('EODHD adapter preserves real provider units, close values and observation dates without proxies', async () => {
  const requests = [];
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, fetchImpl: fetchFixture(url => {
    if (url.pathname.endsWith('XAUUSD.FOREX')) return response([
      { date: '2026-09-12', close: 4330.25, adjusted_close: 0 },
      { date: '2026-09-17', close: 4346.4221, adjusted_close: 0 },
    ]);
  }, requests) });
  assert.equal(result.series.us10y.history.at(-1).value, 4.94, 'percentage level is not multiplied or divided by 100');
  assert.equal(result.series.real10y.history.at(-1).value, 2.61);
  assert.equal(result.series.naturalGas.history[0].value, 2.97);
  assert.equal(result.series.wti.history[0].date, '2026-09-15', 'publication lag must remain visible');
  assert.equal(result.series.dxy.history[0].value, 100.248, 'use raw index close');
  assert.deepEqual(result.series.gold.history.map(row => row.date), ['2026-09-12', '2026-09-17'], 'do not silently discard provider weekend observations');
  assert.equal(result.series.gold.history.at(-1).value, 4346.4221);
  assert.match(result.series.gold.basis, /金衡盎司/);
  assert.match(result.series.wti.basis, /现货.*滞后/);
  assert.equal(Object.hasOwn(result.series, 'rbob'), false);
  assert.ok(requests.every(item => !/RBOB|GASOLINE_US|42G3/.test(item.url.pathname)), 'do not request a retail gasoline or ETF proxy');
  assert.ok(Object.values(result.series).every(item => item.frequency === '日度'));
  assert.equal(result.calendarStatus, 'available');
  assert.equal(result.calendarError, null);
  assert.ok(!JSON.stringify(result).includes(OPTIONS.eodhdKey));
});

test('individual HTTP or network failures remain local and cannot reveal credential-bearing errors', async () => {
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, fetchImpl: fetchFixture(url => {
    if (url.pathname.endsWith('MOVE.INDX')) throw new Error(`fetch failed: ${url}`);
    if (url.pathname.endsWith('DXY.INDX')) return response({}, 403);
    if (url.pathname.includes('real-yield')) return response({}, 429);
    if (url.pathname === '/api/economic-events') return response({}, 503);
  }) });
  assert.deepEqual(result.series.move.history, []);
  assert.equal(result.series.move.error, 'EODHD 连接失败');
  assert.equal(result.series.dxy.error, 'EODHD 访问配置或套餐不可用');
  assert.equal(result.series.real10y.error, 'EODHD 请求限流');
  assert.equal(result.series.us2y.history.length, 1);
  assert.equal(result.series.wti.history.length, 1);
  assert.equal(result.calendarStatus, 'unavailable');
  assert.ok(!JSON.stringify(result).includes(OPTIONS.eodhdKey));
  assert.ok(!JSON.stringify(result).includes('api_token'));
});

test('same-day EOD readings retain their date without claiming a completed daily close', async () => {
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, fetchImpl: fetchFixture(url => url.pathname.includes('/eod/')
    ? response([{ date: '2026-09-18', close: 100.452 }]) : undefined) });
  for (const id of ['dxy', 'gold', 'move']) {
    assert.deepEqual(result.series[id].history, [{ date: '2026-09-18', value: 100.452 }]);
    assert.match(result.series[id].basis, /日线观测值.*当日数据可能尚未定稿/);
    assert.doesNotMatch(result.series[id].basis, /收盘/);
  }
});

test('invalid inputs and missing credentials do not start network calls or produce zero observations', async () => {
  const fetchImpl = () => { assert.fail('network must not run'); };
  for (const override of [{ eodhdKey: '' }, { from: '2026-02-30' }, { from: '2026-09-20' }, { now: 'invalid' }]) {
    const result = await fetchEodhdMacroSeries({ ...OPTIONS, ...override, fetchImpl });
    assert.equal(result.calendarStatus, 'unavailable');
    assert.equal(Object.keys(result.series).length, 11);
    assert.equal(Object.hasOwn(result.series, 'rbob'), false);
    assert.ok(Object.values(result.series).every(item => item.history.length === 0 && item.error));
  }
});

test('annual treasury reads are bounded to six years, share four request slots and retain valid partial years', async () => {
  const requests = [];
  let active = 0;
  let maximum = 0;
  const fetchImpl = fetchFixture(async url => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    if (url.pathname.includes('/ust/')) {
      const year = url.searchParams.get('filter[year]');
      if (year === '2024') return response({}, 503);
      return response({ data: [{ date: `${year}-09-17`, tenor: '10Y', rate: year === '2021' ? -0.1 : 4.94 }] });
    }
  }, requests);
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, from: '2010-01-01', fetchImpl });
  const nominal = requests.filter(item => item.url.pathname === '/api/ust/yield-rates');
  assert.equal(nominal.length, 6);
  assert.deepEqual(nominal.map(item => item.url.searchParams.get('filter[year]')).sort(), ['2021', '2022', '2023', '2024', '2025', '2026']);
  assert.ok(maximum <= 4);
  assert.equal(maximum, 4);
  assert.equal(result.series.us10y.history.length, 5);
  assert.equal(result.series.us10y.history[0].value, -0.1, 'negative treasury yields remain valid');
  assert.equal(result.series.us10y.error, '部分年度国债数据暂不可用');
  assert.match(result.series.us10y.historyNote, /6/);
});

test('commodity pagination uses known endpoint offsets, retains actual history and reports bounded coverage', async () => {
  const requests = [];
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, from: '2021-09-18', fetchImpl: fetchFixture(url => {
    if (!url.pathname.includes('/commodities/')) return;
    const offset = Number(url.searchParams.get('page[offset]'));
    const payload = fixture(url);
    payload.meta.total = 4000;
    payload.links.next = 'https://untrusted.invalid/steal?api_token=should-not-follow';
    payload.data = [{ date: offset ? '2022-01-04' : '2026-09-15', value: offset ? 70 : 107.02 }];
    return response(payload);
  }, requests) });
  const oil = requests.filter(item => item.url.pathname.endsWith('/WTI'));
  assert.deepEqual(oil.map(item => item.url.searchParams.get('page[offset]')), ['0', '1000']);
  assert.ok(requests.every(item => item.url.origin === 'https://eodhd.com'));
  assert.deepEqual(result.series.wti.history, [{ date: '2022-01-04', value: 70 }, { date: '2026-09-15', value: 107.02 }]);
  assert.match(result.series.wti.historyNote, /2000/);
  assert.ok(!JSON.stringify(result).includes('untrusted.invalid'));
});

test('malformed commodity units and invalid, conflicting or future observations fail closed', async () => {
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, to: '2026-12-31', fetchImpl: fetchFixture(url => {
    if (url.pathname.endsWith('/WTI')) return response({ ...fixture(url), meta: { interval: 'weekly', unit: 'Dollars per Gallon' } });
    if (url.pathname.endsWith('DXY.INDX')) return response([
      null, { date: '2026-09-17', close: 100 }, { date: '2026-09-17', close: 101 },
      { date: '2026-09-16', close: null }, { date: '2026-09-15', close: '' },
      { date: '2026-09-14', close: '0' }, { date: '2026-09-14', close: 0 },
      { date: '2026-09-31', close: 2 }, { date: '2026-09-19', close: 200 },
      { date: '2026-09-13', close: '99.5' }, { date: '2026-08-31', close: 3 },
    ]);
  }) });
  assert.deepEqual(result.series.wti.history, []);
  assert.equal(result.series.wti.error, 'EODHD 商品数据口径异常');
  assert.deepEqual(result.series.dxy.history, [{ date: '2026-09-13', value: 99.5 }, { date: '2026-09-14', value: 0 }]);
});

test('calendar preserves UTC, comparison semantics, missing readings, units and only requested economic categories', async () => {
  const requests = [];
  const rows = [
    event('Inflation Rate', 'yoy', { actual: 0, estimate: null }),
    event('Inflation Rate', 'mom', { actual: 0.2 }),
    event('Inflation Rate', null, { actual: 334.98 }),
    event('Core Inflation Rate', 'mom'), event('PCE Price Index', 'yoy'), event('Core PCE Price Index', 'mom'),
    event('Non Farm Payrolls', null, { actual: 150 }), event('Nonfarm Payrolls Private', null),
    event('Unemployment Rate', null), event('Initial Jobless Claims', null),
    event('ISM Manufacturing PMI', null), event('S&P Global Manufacturing PMI', null),
    event('Retail Sales', 'mom'), event('Retail Sales Ex Autos', 'mom'),
    event('GDP Growth Rate', 'qoq'), event('GDP', null, { actual: 30000 }),
    event('Fed Interest Rate Decision', null), event('FOMC Press Conference', null),
    event('Inflation Rate', 'yoy', { country: 'GB' }),
    event('Inflation Rate', 'yoy', { date: '2026-09-20 12:30:00', actual: 999 }),
  ];
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, from: '2021-09-18', fetchImpl: fetchFixture(url => url.pathname === '/api/economic-events' ? response(rows) : undefined, requests) });
  assert.equal(result.calendarStatus, 'available');
  assert.equal(result.events.length, 13);
  const cpi = result.events.find(item => item.code === 'CPI' && item.comparison === 'yoy' && item.time.startsWith('2026-09-17'));
  assert.equal(cpi.time, '2026-09-17T12:30:00Z');
  assert.equal(cpi.actual, 0);
  assert.equal(cpi.forecast, null);
  assert.equal(cpi.unit, 'percent');
  assert.match(cpi.name, /同比/);
  assert.match(result.events.find(item => item.code === 'CPI' && item.comparison === 'mom').name, /环比/);
  assert.equal(result.events.find(item => item.code === 'NFP').unit, '千个岗位');
  assert.equal(result.events.find(item => item.code === 'Initial Claims').unit, '千人');
  assert.equal(result.events.find(item => item.code === 'ISM').unit, 'index');
  assert.match(result.events.find(item => item.code === 'GDP').name, /季环比/);
  assert.equal(result.events.at(-1).actual, null, 'future event must not expose an actual reading');
  assert.ok(result.events.every(item => item.simulated === false && item.timeZone === 'UTC' && item.timeUncertain === false));
  const calendar = requests.find(item => item.url.pathname === '/api/economic-events').url;
  assert.equal(calendar.searchParams.get('from'), '2026-09-11');
  assert.equal(calendar.searchParams.get('to'), '2026-09-25');
  assert.equal(calendar.searchParams.get('limit'), '1000');
});

test('ambiguous or impossible event times are excluded and calendar completeness is reported honestly', async () => {
  const result = await fetchEodhdMacroSeries({ ...OPTIONS, fetchImpl: fetchFixture(url => url.pathname === '/api/economic-events' ? response([
    event('Inflation Rate', 'yoy', { date: '2026-09-17' }),
    event('Inflation Rate', 'mom', { date: '2026-09-31 12:30:00' }),
    event('Core Inflation Rate', 'yoy', { date: '2026-09-17 24:00:00' }),
    event('Unemployment Rate', null),
  ]) : undefined) });
  assert.equal(result.calendarStatus, 'partial');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].code, 'Unemployment');
  assert.match(result.calendarError, /事件时间/);
});
