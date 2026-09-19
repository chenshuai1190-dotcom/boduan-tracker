import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublicMacroSeries, fetchPublicMacroRateSeries } from '../server/macro/publicProviders.js';

const FROM = '2026-09-01';
const TO = '2026-09-18';
const NOW = '2026-09-18T13:15:00Z';
const values = {
  T5YIE: 2.32, T10YIE: 2.33, BAMLH0A0HYM2: 2.70, BAMLC0A0CM: 0.78,
  WALCL: 6746548, WDTGAL: 991708, RRPONTSYD: 0.276, SOFR: 3.85, EFFR: 3.88,
  DGS2: 4.74, DGS5: 4.86, DGS10: 5.01, DGS30: 5.35, DFII10: 2.68,
};
const reply = (text, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => text });
const seriesId = url => url.searchParams.get('id') || url.searchParams.get('series_id') || url.pathname.match(/\/([A-Z]+)_History\.csv$/)?.[1];
function fixture(url) {
  const id = seriesId(url);
  if (id === 'VIX') return 'DATE,OPEN,HIGH,LOW,CLOSE\r\n09/16/2026,15.0,16,14,15.82\r\n09/17/2026,15.6,15.9,15.2,15.44\r\n';
  if (id === 'VVIX') return 'DATE,VVIX\n09/16/2026,88.52\n09/17/2026,87.72\n';
  if (url.hostname === 'api.stlouisfed.org') return JSON.stringify({ observations: [{ date: '2026-09-16', value: String(values[id]) }] });
  return `observation_date,${id}\n2026-09-16,${values[id]}\n`;
}
const successfulFetch = async address => reply(fixture(new URL(address)));
const options = { from: FROM, to: TO, now: NOW, fetchImpl: successfulFetch };

test('official public series normalize money and spreads once, preserving actual observation dates', async () => {
  const { series, errors } = await fetchPublicMacroSeries(options);
  assert.equal(errors, undefined);
  assert.deepEqual(Object.keys(series), ['be5y', 'be10y', 'hyOas', 'igOas', 'fedBalance', 'tga', 'rrp', 'sofr', 'effr', 'vix', 'vvix']);
  const expected = { be5y: 2.32, be10y: 2.33, hyOas: 270, igOas: 78, fedBalance: 6746.548, tga: 991.708, rrp: 0.276, sofr: 3.85, effr: 3.88, vix: 15.44, vvix: 87.72 };
  for (const [id, value] of Object.entries(expected)) assert.equal(series[id].history.at(-1).value, value, id);
  assert.deepEqual(series.tga.history, [{ date: '2026-09-16', value: 991.708 }]);
  assert.equal(series.tga.seriesId, 'WDTGAL');
  assert.equal(series.tga.frequency, '周度');
  assert.equal(series.fedBalance.frequency, '周度');
  assert.equal(series.rrp.frequency, '日度');
  assert.match(series.tga.basis, /周三余额.*非周平均/);
  assert.match(series.hyOas.historyNote, /3年/);
  assert.equal(series.fedBalance.unit, 'usdBn');
  assert.equal(series.rrp.unit, 'usdBn');
  assert.equal(series.hyOas.unit, 'bp');
  assert.equal(series.be5y.unit, 'percent');
  assert.equal(series.vvix.unit, 'index');
  assert.equal(series.vix.source, 'CBOE');
  assert.equal(series.be5y.source, 'FRED');
  for (const item of Object.values(series)) {
    assert.equal(item.fetchedAt, '2026-09-18T13:15:00.000Z');
    assert.match(item.sourceUrl, /^https:\/\/(fred\.stlouisfed\.org\/series\/|www\.cboe\.com\/tradable_products\/vix\/)/);
  }
});

test('no-key fetches use only the fixed public CSV allowlist and never invent a MOVE substitute', async () => {
  const calls = [];
  const { series } = await fetchPublicMacroSeries({ ...options, ids: ['unknown', 'MOVE'], fetchImpl: async (address, init) => {
    const url = new URL(address);
    calls.push(url);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (url.hostname === 'fred.stlouisfed.org') {
      assert.equal(url.pathname, '/graph/fredgraph.csv');
      assert.equal(url.searchParams.get('cosd'), FROM);
      assert.equal(url.searchParams.get('coed'), TO);
      assert.equal(url.searchParams.has('api_key'), false);
    } else {
      assert.equal(url.hostname, 'cdn-api.cboe.com');
      assert.match(url.pathname, /^\/api\/global\/us_indices\/daily_prices\/(?:VIX|VVIX)_History\.csv$/);
    }
    return reply(fixture(url));
  } });
  assert.equal(calls.length, 11);
  assert.equal(calls.filter(url => url.hostname === 'fred.stlouisfed.org').length, 9);
  assert.equal(Object.hasOwn(series, 'move'), false);
  assert.equal(calls.some(url => seriesId(url) === 'WTREGEN'), false);
});

test('a supplied key uses the official JSON API, keeps levels unchanged, and never escapes into output metadata', async () => {
  const key = 'test-secret-that-must-not-appear-in-output';
  const calls = [];
  const result = await fetchPublicMacroSeries({ ...options, fredKey: key, fetchImpl: async address => {
    const url = new URL(address);
    calls.push(url);
    if (url.hostname === 'api.stlouisfed.org') {
      assert.equal(url.pathname, '/fred/series/observations');
      assert.equal(url.searchParams.get('api_key'), key);
      assert.equal(url.searchParams.get('file_type'), 'json');
      assert.equal(url.searchParams.get('observation_start'), FROM);
      assert.equal(url.searchParams.get('observation_end'), TO);
      assert.equal(url.searchParams.get('frequency'), null, 'do not aggregate a weekly balance into synthetic daily observations');
      return reply(JSON.stringify({ observations: [
        { date: '2026-09-16', value: String(values[seriesId(url)]) },
        { date: '2026-09-17', value: '.' },
      ] }));
    }
    return reply(fixture(url));
  } });
  assert.equal(calls.filter(url => url.hostname === 'api.stlouisfed.org').length, 9);
  assert.equal(result.series.tga.history.length, 1);
  assert.equal(result.series.hyOas.history[0].value, 270);
  assert.doesNotMatch(JSON.stringify(result), /test-secret|api_key=/);
});

test('missing, invalid, out-of-window and future CSV rows are omitted while real zero and negative values survive', async () => {
  const { series } = await fetchPublicMacroSeries({ ...options, to: '2027-01-01', fetchImpl: async address => {
    const url = new URL(address);
    if (seriesId(url) !== 'SOFR') return reply(fixture(url));
    assert.equal(url.searchParams.get('coed'), '2026-09-18');
    return reply('\uFEFFobservation_date,SOFR\r\n2026-08-31,3\r\n2026-09-07,\r\n2026-09-08,.\r\n2026-09-09,NaN\r\n2026-09-10,null\r\n2026-09-11,0\r\n2026-09-14,-0.25\r\n2026-09-16,1\r\n"2026-09-16","3.85"\r\n2026-09-16,\r\n2026-09-17,Infinity\r\n2026-09-18,0x10\r\n2026-09-19,99\r\n2026-02-30,12\r\n');
  } });
  assert.deepEqual(series.sofr.history, [
    { date: '2026-09-11', value: 0 },
    { date: '2026-09-14', value: -0.25 },
    { date: '2026-09-16', value: 3.85 },
  ]);
});

test('CBOE reads VIX close rather than OHLC alternatives, accepts quoted fields, and filters dates strictly', async () => {
  const { series } = await fetchPublicMacroSeries({ ...options, fetchImpl: async address => {
    const url = new URL(address);
    if (seriesId(url) !== 'VIX') return reply(fixture(url));
    return reply('DATE,OPEN,HIGH,LOW,CLOSE\n"09/17/2026",999,999,999,"15.44"\n09/16/2026,999,999,999,15.82\n09/31/2026,1,1,1,99\n09/18/2026,1,1,1,\n');
  } });
  assert.deepEqual(series.vix.history, [{ date: '2026-09-16', value: 15.82 }, { date: '2026-09-17', value: 15.44 }]);
});

test('upstream throttling, transport failure, HTML errors and all-missing data fail independently without retries or secrets', async () => {
  const calls = [];
  const result = await fetchPublicMacroSeries({ ...options, fredKey: 'private-value', fetchImpl: async address => {
    const url = new URL(address);
    const id = seriesId(url);
    calls.push(id);
    if (id === 'T5YIE') return reply('rate-limited body private-value', 429);
    if (id === 'T10YIE') throw new Error(`fetch failed for ${address}`);
    if (id === 'WALCL') return reply('<html>provider unavailable</html>');
    if (id === 'WDTGAL') return reply(JSON.stringify({ observations: [{ date: '2026-09-16', value: null }] }));
    return reply(fixture(url));
  } });
  assert.equal(calls.length, 11, 'one request per allowlisted series; no hidden provider retry/fallback');
  assert.deepEqual(Object.keys(result.errors), ['be5y', 'be10y', 'fedBalance', 'tga']);
  assert.equal(result.series.be5y.errorCode, 'rate_limited');
  assert.equal(result.series.tga.errorCode, 'no_data');
  for (const id of Object.keys(result.errors)) {
    assert.deepEqual(result.series[id].history, []);
    assert.equal(typeof result.series[id].error, 'string');
    assert.match(result.series[id].error, /[\u4e00-\u9fff]/);
  }
  assert.equal(result.series.vix.history.at(-1).value, 15.44);
  assert.doesNotMatch(JSON.stringify(result), /private-value|api_key=|fetch failed for|<html>/);
});

test('a malformed CSV schema cannot silently turn another column into the requested series', async () => {
  const { series } = await fetchPublicMacroSeries({ ...options, fetchImpl: async address => {
    const url = new URL(address);
    if (seriesId(url) === 'RRPONTSYD') return reply('observation_date,WALCL\n2026-09-16,123\n');
    return reply(fixture(url));
  } });
  assert.equal(series.rrp.errorCode, 'invalid_response');
  assert.deepEqual(series.rrp.history, []);
});

test('public requests keep at most four response bodies in flight', async () => {
  let active = 0;
  let maximum = 0;
  const result = await fetchPublicMacroSeries({ ...options, fetchImpl: async address => {
    active += 1;
    maximum = Math.max(maximum, active);
    return { ok: true, status: 200, text: async () => {
      await new Promise(resolve => setImmediate(resolve));
      active -= 1;
      return fixture(new URL(address));
    } };
  } });
  assert.ok(maximum > 1 && maximum <= 4);
  assert.equal(active, 0);
  assert.equal(result.errors, undefined);
});

test('the 10-second deadline covers a stalled body and aborts only that series', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stalledSignal;
  const pending = fetchPublicMacroRateSeries({ ...options, fetchImpl: async (address, init) => {
    const url = new URL(address);
    if (seriesId(url) === 'DGS2') {
      stalledSignal = init.signal;
      return { ok: true, status: 200, text: () => new Promise(() => {}) };
    }
    return reply(fixture(url));
  } });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10_000);
  const result = await pending;
  assert.equal(stalledSignal.aborted, true);
  assert.equal(result.series.us2y.errorCode, 'timeout');
  assert.deepEqual(Object.keys(result.errors), ['us2y']);
  assert.equal(result.series.real10y.history[0].value, 2.68);
});

test('rate fallback is opt-in and invalid date ranges never reach an upstream server', async () => {
  const result = await fetchPublicMacroRateSeries(options);
  assert.deepEqual(Object.keys(result.series), ['us2y', 'us5y', 'us10y', 'us30y', 'real10y']);
  assert.equal(result.series.us10y.history[0].value, 5.01);
  for (const range of [{ from: '2026-02-30' }, { to: 'bad-date' }, { from: '2026-10-01' }, { from: TO, to: FROM }]) {
    let calls = 0;
    const invalid = await fetchPublicMacroSeries({ ...options, ...range, fetchImpl: () => { calls += 1; throw new Error('must not fetch'); } });
    assert.equal(calls, 0);
    assert.equal(Object.keys(invalid.errors).length, 11);
    assert.ok(Object.values(invalid.series).every(item => item.errorCode === 'invalid_range'));
  }
});
