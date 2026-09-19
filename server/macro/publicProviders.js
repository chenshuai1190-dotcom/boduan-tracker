const TIMEOUT_MS = 10_000;
const MAX_CONCURRENCY = 4;
const MAX_BODY_LENGTH = 8_000_000;

const FRED_SERIES = Object.freeze([
  { id: 'be5y', seriesId: 'T5YIE', unit: 'percent' },
  { id: 'be10y', seriesId: 'T10YIE', unit: 'percent' },
  { id: 'hyOas', seriesId: 'BAMLH0A0HYM2', unit: 'bp', scale: 100 },
  { id: 'igOas', seriesId: 'BAMLC0A0CM', unit: 'bp', scale: 100 },
  { id: 'fedBalance', seriesId: 'WALCL', unit: 'usdBn', scale: 0.001, frequency: '周度' },
  // WDTGAL is the Wednesday level; WTREGEN is a weekly average and is not interchangeable.
  { id: 'tga', seriesId: 'WDTGAL', unit: 'usdBn', scale: 0.001, frequency: '周度' },
  { id: 'rrp', seriesId: 'RRPONTSYD', unit: 'usdBn' },
  { id: 'sofr', seriesId: 'SOFR', unit: 'percent' },
  { id: 'effr', seriesId: 'EFFR', unit: 'percent' },
]);
const CBOE_SERIES = Object.freeze([
  { id: 'vix', seriesId: 'VIX', column: 'CLOSE', unit: 'index', provider: 'CBOE' },
  { id: 'vvix', seriesId: 'VVIX', column: 'VVIX', unit: 'index', provider: 'CBOE' },
]);
const FRED_RATE_SERIES = Object.freeze([
  { id: 'us2y', seriesId: 'DGS2', unit: 'percent' },
  { id: 'us5y', seriesId: 'DGS5', unit: 'percent' },
  { id: 'us10y', seriesId: 'DGS10', unit: 'percent' },
  { id: 'us30y', seriesId: 'DGS30', unit: 'percent' },
  { id: 'real10y', seriesId: 'DFII10', unit: 'percent' },
]);

class PublicSeriesError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

function observationNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function csvCells(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(value.trim()); value = '';
    } else value += character;
  }
  if (quoted) return null;
  cells.push(value.trim());
  return cells;
}

function csvObservations(text, definition) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const headers = csvCells(lines[0] || '');
  const dateIndex = headers?.findIndex(column => ['observation_date', 'date'].includes(column.toLowerCase())) ?? -1;
  const valueIndex = headers?.indexOf(definition.column || definition.seriesId) ?? -1;
  if (dateIndex < 0 || valueIndex < 0) throw new PublicSeriesError('invalid_response', '数据源返回格式异常');
  return lines.slice(1).flatMap(line => {
    const cells = csvCells(line);
    if (!cells || cells.length !== headers.length) return [];
    let date = cells[dateIndex];
    if (definition.provider === 'CBOE') {
      const match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return [];
      date = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    }
    return [{ date, value: cells[valueIndex] }];
  });
}

function normalizeHistory(rows, definition, from, to) {
  const points = new Map();
  for (const row of rows) {
    const date = dateKey(row?.date);
    const value = observationNumber(row?.value);
    if (!date || date < from || date > to || value === null) continue;
    const normalized = Number((value * (definition.scale || 1)).toFixed(8));
    if (Number.isFinite(normalized)) points.set(date, { date, value: normalized });
  }
  return [...points.values()].sort((left, right) => left.date.localeCompare(right.date));
}

async function readResponse(url, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PublicSeriesError('timeout', '公共数据源响应超时'));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl(url.toString(), {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'text/csv, application/csv, application/json', 'User-Agent': 'Quote-Macro/1.0' },
      });
      if (!response.ok) {
        if (response.status === 429) throw new PublicSeriesError('rate_limited', '数据源请求限流，请稍后重试');
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new PublicSeriesError('request_rejected', '数据源拒绝请求，请检查访问配置');
        }
        throw new PublicSeriesError('http_error', '公共数据源暂不可用');
      }
      const text = await response.text();
      if (text.length > MAX_BODY_LENGTH) throw new PublicSeriesError('invalid_response', '数据源响应超出读取范围');
      return text;
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

function requestUrl(definition, { from, to, fredKey }) {
  if (definition.provider === 'CBOE') return new URL(`https://cdn-api.cboe.com/api/global/us_indices/daily_prices/${definition.seriesId}_History.csv`);
  if (typeof fredKey === 'string' && fredKey.trim()) {
    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.search = new URLSearchParams({
      series_id: definition.seriesId, api_key: fredKey.trim(), file_type: 'json',
      observation_start: from, observation_end: to, sort_order: 'asc', limit: '100000',
    }).toString();
    return url;
  }
  const url = new URL('https://fred.stlouisfed.org/graph/fredgraph.csv');
  url.search = new URLSearchParams({ id: definition.seriesId, cosd: from, coed: to }).toString();
  return url;
}

function seriesMetadata(definition, fetchedAt) {
  const source = definition.provider || 'FRED';
  return {
    source,
    sourceUrl: source === 'CBOE'
      ? 'https://www.cboe.com/tradable_products/vix/vix_historical_data/'
      : `https://fred.stlouisfed.org/series/${definition.seriesId}`,
    frequency: definition.frequency || '日度',
    unit: definition.unit,
    seriesId: definition.seriesId,
    fetchedAt,
    ...(definition.id === 'tga' ? { basis: '美国财政部一般账户周三余额（非周平均）' } : {}),
    ...(['hyOas', 'igOas'].includes(definition.id) ? { historyNote: 'FRED 自2026年4月起仅提供约3年此序列历史' } : {}),
  };
}

async function fetchSeries(definition, options) {
  const metadata = seriesMetadata(definition, options.fetchedAt);
  try {
    if (!options.validRange) throw new PublicSeriesError('invalid_range', '历史日期范围无效');
    const url = requestUrl(definition, options);
    const text = await readResponse(url, options.fetchImpl);
    let observations;
    if (url.hostname === 'api.stlouisfed.org') {
      let payload;
      try { payload = JSON.parse(text); } catch { throw new PublicSeriesError('invalid_response', '数据源返回格式异常'); }
      if (!Array.isArray(payload?.observations) || payload.error_code) throw new PublicSeriesError('invalid_response', '数据源返回格式异常');
      observations = payload.observations;
    } else observations = csvObservations(text, definition);
    const history = normalizeHistory(observations, definition, options.from, options.to);
    if (!history.length) throw new PublicSeriesError('no_data', '所选日期暂无有效观测');
    return { ...metadata, history };
  } catch (error) {
    // Do not surface upstream error bodies, exceptions, or URLs: an API URL can contain a key.
    return {
      ...metadata, history: [],
      error: error instanceof PublicSeriesError ? error.message : '公共数据源读取失败',
      errorCode: error instanceof PublicSeriesError ? error.code : 'fetch_failed',
    };
  }
}

async function fetchDefinitions(definitions, { from, to, fetchImpl = globalThis.fetch, fredKey, now = Date.now() } = {}) {
  const clock = new Date(now);
  const fetchedAt = Number.isFinite(clock.getTime()) ? clock.toISOString() : new Date().toISOString();
  const today = fetchedAt.slice(0, 10);
  const end = to === undefined ? today : dateKey(to);
  const defaultStart = new Date(`${today}T00:00:00Z`);
  defaultStart.setUTCFullYear(defaultStart.getUTCFullYear() - 5);
  const start = from === undefined ? defaultStart.toISOString().slice(0, 10) : dateKey(from);
  const boundedEnd = end && end < today ? end : today;
  const options = { from: start, to: boundedEnd, fetchImpl, fredKey, fetchedAt, validRange: Boolean(start && end && start <= boundedEnd) };
  const results = new Array(definitions.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, definitions.length) }, async () => {
    while (cursor < definitions.length) {
      const index = cursor++;
      results[index] = await fetchSeries(definitions[index], options);
    }
  }));
  const series = Object.fromEntries(definitions.map((definition, index) => [definition.id, results[index]]));
  const errors = Object.fromEntries(Object.entries(series).filter(([, item]) => item.error).map(([id, item]) => [id, item.error]));
  return { series, ...(Object.keys(errors).length ? { errors } : {}) };
}

export function fetchPublicMacroSeries(options = {}) {
  return fetchDefinitions([...FRED_SERIES, ...CBOE_SERIES], options);
}

// Optional official fallback; kept separate so the main request never fetches duplicate rates.
export function fetchPublicMacroRateSeries(options = {}) {
  return fetchDefinitions(FRED_RATE_SERIES, options);
}
