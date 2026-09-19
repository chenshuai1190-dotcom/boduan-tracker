const API_ORIGIN = 'https://eodhd.com';
const TIMEOUT_MS = 12_000;
const MAX_CONCURRENCY = 4;
const MAX_UST_YEARS = 6;
const COMMODITY_PAGE_SIZE = 1000;
const MAX_COMMODITY_PAGES = 2;
const MAX_BODY_LENGTH = 8_000_000;
const CALENDAR_DOCUMENTATION = `${API_ORIGIN}/financial-apis/economic-events-data-api`;

const TREASURIES = [
  { id: 'us2y', tenor: '2Y' }, { id: 'us5y', tenor: '5Y' },
  { id: 'us10y', tenor: '10Y' }, { id: 'us30y', tenor: '30Y' },
  { id: 'real10y', tenor: '10Y', real: true },
];
const COMMODITIES = [
  { id: 'wti', code: 'WTI', providerUnit: 'Dollars per Barrel', basis: 'EIA 库欣 WTI 原油现货，美元/桶；公布通常滞后约一周' },
  { id: 'brent', code: 'BRENT', providerUnit: 'Dollars per Barrel', basis: 'EIA 欧洲 Brent 原油现货，美元/桶；公布通常滞后约一周' },
  { id: 'naturalGas', code: 'NATURAL_GAS', providerUnit: 'Dollars per Million BTU', basis: 'EIA Henry Hub 天然气现货，美元/百万英热单位；公布通常滞后约一周' },
];
const EOD_SERIES = [
  { id: 'dxy', code: 'DXY.INDX', unit: 'index', basis: '美元指数日线观测值，指数点；当日数据可能尚未定稿' },
  { id: 'gold', code: 'XAUUSD.FOREX', unit: 'usd', basis: '黄金现货日线观测值，美元/金衡盎司；当日数据可能尚未定稿' },
  { id: 'move', code: 'MOVE.INDX', unit: 'index', basis: 'ICE BofAML MOVE 美债波动率指数日线观测值，指数点；当日数据可能尚未定稿' },
];

class ProviderError extends Error {}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

function nullableNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function historyPoints(rows, from, to) {
  const values = new Map();
  const conflicts = new Set();
  for (const row of rows) {
    const date = dateKey(row?.date);
    const value = nullableNumber(row?.value);
    if (!date || date < from || date > to || value === null || conflicts.has(date)) continue;
    if (values.has(date) && values.get(date) !== value) {
      values.delete(date);
      conflicts.add(date);
    } else values.set(date, value);
  }
  return [...values].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

function limitConcurrency(maximum) {
  let active = 0;
  const waiting = [];
  function runNext() {
    if (active >= maximum || !waiting.length) return;
    const { work, resolve, reject } = waiting.shift();
    active += 1;
    Promise.resolve().then(work).then(resolve, reject).finally(() => { active -= 1; runNext(); });
  }
  return work => new Promise((resolve, reject) => { waiting.push({ work, resolve, reject }); runNext(); });
}

function createRequest({ eodhdKey, fetchImpl }) {
  const limit = limitConcurrency(MAX_CONCURRENCY);
  return (path, parameters = {}) => limit(async () => {
    const url = new URL(path, API_ORIGIN);
    url.search = new URLSearchParams({ ...parameters, fmt: 'json', api_token: eodhdKey }).toString();
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProviderError('EODHD 响应超时')); }, TIMEOUT_MS);
    });
    try {
      return await Promise.race([timeout, (async () => {
        // Do not follow redirects that could forward a provider credential.
        const response = await fetchImpl(url.toString(), { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
        if (!response.ok) {
          if (response.status === 429) throw new ProviderError('EODHD 请求限流');
          if ([401, 403].includes(response.status)) throw new ProviderError('EODHD 访问配置或套餐不可用');
          throw new ProviderError('EODHD 数据暂不可用');
        }
        const text = await response.text();
        if (text.length > MAX_BODY_LENGTH) throw new ProviderError('EODHD 响应超出读取范围');
        try { return JSON.parse(text); } catch { throw new ProviderError('EODHD 返回格式异常'); }
      })()]);
    } catch (error) {
      // Raw network errors can include the URL with api_token; never return them.
      throw error instanceof ProviderError ? error : new ProviderError('EODHD 连接失败');
    } finally { clearTimeout(timer); }
  });
}

function metadata(id, fetchedAt) {
  const treasury = TREASURIES.find(item => item.id === id);
  if (treasury) return {
    source: 'EODHD / 美国财政部', sourceUrl: `${API_ORIGIN}/financial-apis/us-treasury-ust-interest-rates-api-beta`,
    frequency: '日度', unit: 'percent', fetchedAt,
    basis: `${treasury.real ? '美国财政部实际收益率曲线' : '美国财政部名义收益率曲线'}，${treasury.tenor}；单位为百分比`,
  };
  const commodity = COMMODITIES.find(item => item.id === id);
  if (commodity) return {
    source: 'EODHD / EIA', sourceUrl: `${API_ORIGIN}/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta`,
    frequency: '日度', unit: 'usd', fetchedAt, basis: commodity.basis,
  };
  const eod = EOD_SERIES.find(item => item.id === id);
  return {
    source: 'EODHD', sourceUrl: `${API_ORIGIN}/api/eod/${eod.code}`,
    frequency: '日度', unit: eod.unit, fetchedAt,
    basis: eod.basis,
  };
}

async function treasurySeries({ real, from, to, request, fetchedAt }) {
  const definitions = TREASURIES.filter(item => Boolean(item.real) === real);
  const endYear = Number(to.slice(0, 4));
  const startYear = Math.max(Number(from.slice(0, 4)), endYear - MAX_UST_YEARS + 1);
  const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  const results = await Promise.allSettled(years.map(async year => {
    const payload = await request(`/api/ust/${real ? 'real-yield-rates' : 'yield-rates'}`, { 'filter[year]': String(year) });
    if (!Array.isArray(payload?.data)) throw new ProviderError('EODHD 国债数据格式异常');
    return payload.data.filter(row => dateKey(row?.date)?.startsWith(`${year}-`));
  }));
  const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failed = results.filter(result => result.status === 'rejected');
  return Object.fromEntries(definitions.map(definition => {
    const history = historyPoints(rows.filter(row => row.tenor === definition.tenor).map(row => ({ date: row.date, value: row.rate })), from, to);
    const item = { ...metadata(definition.id, fetchedAt), history };
    if (!history.length) item.error = failed[0]?.reason?.message || '请求范围内暂无国债数据';
    else if (failed.length) item.error = '部分年度国债数据暂不可用';
    if (startYear > Number(from.slice(0, 4))) item.historyNote = '本次读取最多覆盖最近 6 个年度';
    return [definition.id, item];
  }));
}

async function commoditySeries(definition, { from, to, request, fetchedAt }) {
  const rows = [];
  let partialError = null;
  let more = false;
  for (let page = 0; page < MAX_COMMODITY_PAGES; page += 1) {
    let payload;
    try {
      payload = await request(`/api/commodities/historical/${definition.code}`, {
        interval: 'daily', 'page[offset]': String(page * COMMODITY_PAGE_SIZE), 'page[limit]': String(COMMODITY_PAGE_SIZE),
      });
      if (!Array.isArray(payload?.data) || payload.meta?.interval !== 'daily' || payload.meta?.unit !== definition.providerUnit) {
        throw new ProviderError('EODHD 商品数据口径异常');
      }
    } catch (error) { partialError = error.message; break; }
    rows.push(...payload.data);
    const dates = payload.data.map(row => dateKey(row?.date)).filter(Boolean);
    const earliest = dates.sort()[0];
    // The documented endpoint returns newest first. Rebuild pagination locally;
    // provider links can contain credentials and are never followed or exposed.
    more = Boolean(payload.links?.next) || nullableNumber(payload.meta?.total) > (page + 1) * COMMODITY_PAGE_SIZE;
    if (!more || !payload.data.length || (earliest && earliest <= from)) { more = false; break; }
  }
  const history = historyPoints(rows, from, to);
  return {
    ...metadata(definition.id, fetchedAt), history,
    ...(!history.length ? { error: partialError || '请求范围内暂无商品数据' } : partialError ? { error: '部分商品历史数据暂不可用' } : {}),
    ...(more ? { historyNote: '本次读取最多 2000 条已发布观察值，未补造更早历史' } : {}),
  };
}

async function eodSeries(definition, { from, to, request, fetchedAt }) {
  try {
    const payload = await request(`/api/eod/${definition.code}`, { from, to, order: 'a', period: 'd' });
    if (!Array.isArray(payload)) throw new ProviderError('EODHD 日线数据格式异常');
    const history = historyPoints(payload.map(row => ({ date: row?.date, value: row?.close })), from, to);
    return { ...metadata(definition.id, fetchedAt), history, ...(!history.length ? { error: '请求范围内暂无日线数据' } : {}) };
  } catch (error) { return { ...metadata(definition.id, fetchedAt), history: [], error: error.message }; }
}

const COMPARISON_LABELS = { yoy: '同比', mom: '环比', qoq: '季环比' };
const EVENT_DEFINITIONS = [
  { types: ['Inflation Rate', 'CPI'], code: 'CPI', name: '消费者价格指数（CPI）', comparisons: ['yoy', 'mom'] },
  { types: ['Core Inflation Rate', 'Core CPI'], code: 'Core CPI', name: '核心消费者价格指数（Core CPI）', comparisons: ['yoy', 'mom'] },
  { types: ['PCE Price Index'], code: 'PCE', name: '个人消费支出价格指数（PCE）', comparisons: ['yoy', 'mom'] },
  { types: ['Core PCE Price Index'], code: 'Core PCE', name: '核心个人消费支出价格指数（Core PCE）', comparisons: ['yoy', 'mom'] },
  { types: ['Non Farm Payrolls', 'Nonfarm Payrolls'], code: 'NFP', name: '非农就业人数变化（NFP）', unit: '千个岗位' },
  { types: ['Unemployment Rate'], code: 'Unemployment', name: '失业率' },
  { types: ['Initial Jobless Claims'], code: 'Initial Claims', name: '初次申请失业金人数', unit: '千人', importance: 'medium' },
  { types: ['ISM Manufacturing PMI'], code: 'ISM', name: 'ISM 制造业采购经理人指数', unit: 'index', importance: 'medium' },
  { types: ['Retail Sales'], code: 'Retail Sales', name: '零售销售', comparisons: ['mom', 'yoy'], importance: 'medium' },
  { types: ['GDP Growth Rate', 'GDP'], code: 'GDP', name: '国内生产总值（GDP）增长率', comparisons: ['qoq', 'yoy'] },
  { types: ['Fed Interest Rate Decision', 'Fed Interest Rate'], code: 'FOMC', name: 'FOMC 联邦基金目标利率决定' },
];

function eventTimestamp(value) {
  // EODHD's own endpoint reference explicitly specifies UTC:
  // https://github.com/EodHistoricalData/eodhd-claude-skills/blob/main/skills/eodhd-api/references/endpoints/economic-events.md
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}Z?$/.test(value)) return null;
  const iso = `${value.replace(' ', 'T').replace(/Z$/, '')}Z`;
  const stamp = Date.parse(iso);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().replace('.000Z', 'Z') === iso ? iso : null;
}

function normalizeEvents(rows, from, to, now) {
  const events = new Map();
  let invalid = false;
  for (const row of rows) {
    if (row?.country !== 'US') continue;
    const definition = EVENT_DEFINITIONS.find(item => item.types.includes(row.type));
    if (!definition) continue;
    const comparison = typeof row.comparison === 'string' ? row.comparison.toLowerCase() : null;
    // Index levels and rates of change must never share a percent label.
    if (definition.comparisons ? !definition.comparisons.includes(comparison) : comparison !== null) continue;
    const time = eventTimestamp(row.date);
    if (!time) { invalid = true; continue; }
    if (time.slice(0, 10) < from || time.slice(0, 10) > to) continue;
    const period = typeof row.period === 'string' ? row.period : null;
    const id = [definition.code, comparison || 'level', time, period || ''].join('|');
    events.set(id, {
      id, code: definition.code, name: `${definition.name}${comparison ? ` · ${COMPARISON_LABELS[comparison]}` : ''}`,
      time, importance: definition.importance || 'high',
      actual: Date.parse(time) > now.getTime() ? null : nullableNumber(row.actual),
      forecast: nullableNumber(row.estimate), previous: nullableNumber(row.previous), unit: definition.unit || 'percent',
      comparison, period, country: 'US', source: 'EODHD', sourceUrl: CALENDAR_DOCUMENTATION,
      sourceType: row.type, timeZone: 'UTC', timeUncertain: false, simulated: false,
    });
  }
  return { events: [...events.values()].sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id)), invalid };
}

async function economicEvents({ request, now }) {
  const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  try {
    const rows = await request('/api/economic-events', { from, to, country: 'US', limit: '1000', offset: '0' });
    if (!Array.isArray(rows)) throw new ProviderError('EODHD 日历数据格式异常');
    const { events, invalid } = normalizeEvents(rows, from, to, now);
    const partial = invalid || rows.length >= 1000;
    return { events, calendarStatus: partial ? 'partial' : 'available', calendarError: partial ? '部分事件时间或日历范围尚未完整读取' : null };
  } catch (error) { return { events: [], calendarStatus: 'unavailable', calendarError: error.message }; }
}

export async function fetchEodhdMacroSeries({ from, to, now = new Date().toISOString(), eodhdKey, fetchImpl = fetch } = {}) {
  const clock = new Date(now);
  const validClock = Number.isFinite(clock.getTime());
  const fetchedAt = validClock ? clock.toISOString() : null;
  const ids = [...TREASURIES, ...COMMODITIES, ...EOD_SERIES].map(item => item.id);
  const key = typeof eodhdKey === 'string' ? eodhdKey.trim() : '';
  const invalidRange = !validClock || !dateKey(from) || !dateKey(to) || from > to;
  if (!key || invalidRange) {
    const error = !key ? 'EODHD 数据源未配置' : '宏观数据日期范围无效';
    return { series: Object.fromEntries(ids.map(id => [id, { ...metadata(id, fetchedAt), history: [], error }])), events: [], calendarStatus: 'unavailable', calendarError: error };
  }
  // Never retain observations after the caller's clock, even if a provider responds with them.
  const end = to < fetchedAt.slice(0, 10) ? to : fetchedAt.slice(0, 10);
  if (from > end) return { series: Object.fromEntries(ids.map(id => [id, { ...metadata(id, fetchedAt), history: [], error: '请求范围尚无已发生数据' }])), events: [], calendarStatus: 'unavailable', calendarError: '宏观数据日期范围无效' };
  const request = createRequest({ eodhdKey: key, fetchImpl });
  const context = { from, to: end, request, fetchedAt };
  const [nominal, real, commodities, eod, calendar] = await Promise.all([
    treasurySeries({ ...context, real: false }), treasurySeries({ ...context, real: true }),
    Promise.all(COMMODITIES.map(async item => [item.id, await commoditySeries(item, context)])),
    Promise.all(EOD_SERIES.map(async item => [item.id, await eodSeries(item, context)])),
    economicEvents({ request, now: clock }),
  ]);
  return {
    series: { ...nominal, ...real, ...Object.fromEntries(commodities), ...Object.fromEntries(eod) },
    ...calendar,
  };
}
