import { providerFetch, QUOTE_TIMEOUTS } from './http.js';

export const FEAR_GREED_TTL_MS = 15 * 60_000;
export const FEAR_GREED_FAILURE_BACKOFF_MS = 60_000;
export const FEAR_GREED_RATE_LIMIT_BACKOFF_MS = 30 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const DAY_MS = 86_400_000;
const RATINGS = new Set(['extreme fear', 'fear', 'neutral', 'greed', 'extreme greed']);
const INDICATORS = [
  ['momentum', ['market_momentum_sp500', 'market_momentum_sp125']],
  ['strength', ['stock_price_strength']],
  ['breadth', ['stock_price_breadth']],
  ['options', ['put_call_options']],
  ['volatility', ['market_volatility_vix', 'market_volatility_vix_50']],
  ['safeHaven', ['safe_haven_demand']],
  ['junkBonds', ['junk_bond_demand']],
];

export class FearGreedError extends Error {
  constructor(code = 'PROVIDER_UNAVAILABLE', { retryAfterMs = 0 } = {}) {
    super(code === 'INVALID_PARAMETERS' ? 'fear-greed 仅接受单个 view 参数' : 'CNN 恐惧与贪婪数据暂不可用');
    this.name = 'FearGreedError';
    this.code = code;
    this.status = code === 'INVALID_PARAMETERS' ? 400 : code === 'RATE_LIMITED' ? 503 : 502;
    this.retryAfterMs = retryAfterMs;
  }
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function score(value) {
  return finite(value) !== null && value >= 0 && value <= 100 ? value : null;
}

function rating(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return RATINGS.has(normalized) ? normalized : null;
}

function timestamp(value, ceiling) {
  let parsed = value;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
      || hour > 23 || minute > 59 || second > 59) return null;
    parsed = Date.parse(value);
  }
  // CNN uses epoch milliseconds, not seconds. Never interpret null/empty as 0.
  return Number.isSafeInteger(parsed) && parsed >= Date.UTC(2000, 0, 1) && parsed <= ceiling ? parsed : null;
}

function sourceDay(at) {
  // Midnight UTC denotes CNN's source date; converting to New York would move it back a day.
  return new Date(at).toISOString().slice(0, 10);
}

function startOfHistory(now) {
  return Date.parse(`${sourceDay(now - 400 * DAY_MS)}T00:00:00Z`);
}

function dailyPoints(rows, { from, until, scores = false } = {}) {
  if (!Array.isArray(rows)) return [];
  if (rows.length > 10_000) throw new FearGreedError('INVALID_DATA');
  const byDay = new Map();
  for (const row of rows) {
    const at = timestamp(row?.x, until);
    const value = scores ? score(row?.y) : finite(row?.y);
    if (at === null || at < from || value === null) continue;
    const point = { timestamp: at, value, ...(scores ? { rating: rating(row.rating) } : {}) };
    const day = sourceDay(at);
    const previous = byDay.get(day);
    if (previous?.timestamp === at && previous.value !== value) throw new FearGreedError('INVALID_DATA');
    if (!previous || at > previous.timestamp) byDay.set(day, point);
    else if (scores && at === previous.timestamp && previous.rating === null) byDay.set(day, point);
  }
  return [...byDay.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function normalizeFearGreedPayload(payload, { fetchedAt = Date.now() } = {}) {
  const current = payload?.fear_and_greed;
  const currentScore = score(current?.score);
  const currentRating = rating(current?.rating);
  const currentAt = timestamp(current?.timestamp, fetchedAt);
  if (currentScore === null || currentRating === null || currentAt === null) throw new FearGreedError('INVALID_DATA');
  const from = startOfHistory(fetchedAt);
  const history = dailyPoints(payload?.fear_and_greed_historical?.data, { from, until: currentAt, scores: true });
  if (!history.length) throw new FearGreedError('INVALID_DATA');
  const last = history.at(-1);
  if (last.timestamp === currentAt && last.value !== currentScore) throw new FearGreedError('INVALID_DATA');
  const indicators = INDICATORS.map(([id, keys]) => {
    const metadata = payload?.[keys[0]];
    const at = timestamp(metadata?.timestamp, fetchedAt);
    const normalizedScore = at === null ? null : score(metadata?.score);
    return {
      id,
      score: normalizedScore,
      rating: normalizedScore === null ? null : rating(metadata?.rating),
      timestamp: at === null ? null : new Date(at).toISOString(),
      series: keys.map(key => ({
        id: key,
        // These values are raw index levels, ratios, spreads, etc. Their ratings are not index scores.
        points: dailyPoints(payload?.[key]?.data, {
          from,
          until: timestamp(payload?.[key]?.timestamp, fetchedAt) ?? fetchedAt,
        }),
      })),
    };
  });
  return deepFreeze({
    source: 'CNN',
    asOf: new Date(currentAt).toISOString(),
    fetchedAt: new Date(fetchedAt).toISOString(),
    stale: false,
    current: { score: currentScore, rating: currentRating, timestamp: new Date(currentAt).toISOString() },
    comparisons: {
      previousClose: score(current.previous_close),
      weekAgo: score(current.previous_1_week),
      monthAgo: score(current.previous_1_month),
      yearAgo: score(current.previous_1_year),
    },
    history,
    indicators,
  });
}

function mergePoints(previous, incoming, from) {
  const byDay = new Map();
  for (const point of [...previous, ...incoming]) {
    if (point.timestamp < from) continue;
    const day = sourceDay(point.timestamp);
    const accepted = byDay.get(day);
    if (accepted?.timestamp === point.timestamp && accepted.value !== point.value) {
      throw new FearGreedError('INVALID_DATA');
    }
    if (!accepted || point.timestamp > accepted.timestamp) byDay.set(day, point);
    // A repeated source timestamp cannot rewrite an accepted value.
    else if (point.timestamp === accepted.timestamp && accepted.rating === null && point.value === accepted.value && point.rating) {
      byDay.set(day, point);
    }
  }
  return [...byDay.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function mergeSnapshot(previous, incoming) {
  if (!previous) return incoming;
  const oldAt = Date.parse(previous.asOf);
  const newAt = Date.parse(incoming.asOf);
  if (newAt < oldAt) throw new FearGreedError('OUTDATED_DATA');
  if (newAt === oldAt && (incoming.current.score !== previous.current.score || incoming.current.rating !== previous.current.rating)) {
    throw new FearGreedError('INVALID_DATA');
  }
  const comparisons = { ...incoming.comparisons };
  if (newAt === oldAt) {
    for (const key of Object.keys(comparisons)) {
      if (previous.comparisons[key] !== null) comparisons[key] = previous.comparisons[key];
    }
  }
  const from = startOfHistory(Date.parse(incoming.fetchedAt));
  let stale = false;
  const indicators = incoming.indicators.map((indicator, index) => {
    const old = previous.indicators[index];
    const olderMetadata = old?.timestamp && (!indicator.timestamp || Date.parse(indicator.timestamp) < Date.parse(old.timestamp));
    const missingScore = old?.score !== null && indicator.score === null;
    const sameTime = old?.timestamp && old.timestamp === indicator.timestamp;
    const conflictingScore = sameTime && old.score !== null && indicator.score !== null && old.score !== indicator.score;
    const conflictingRating = sameTime && old.rating !== null && indicator.rating !== null && old.rating !== indicator.rating;
    const keepMetadata = olderMetadata || missingScore || conflictingScore || conflictingRating;
    if (keepMetadata) stale = true;
    const metadata = keepMetadata ? old : indicator;
    return {
      ...metadata,
      rating: sameTime && metadata.score === old.score ? metadata.rating ?? old.rating : metadata.rating,
      series: indicator.series.map((series, seriesIndex) => ({
        id: series.id,
        points: mergePoints(old?.series[seriesIndex]?.points || [], series.points, from),
      })),
    };
  });
  return deepFreeze({ ...incoming, stale, comparisons, history: mergePoints(previous.history, incoming.history, from), indicators });
}

function retryAfterMs(response, now) {
  const value = response.headers?.get?.('retry-after');
  if (typeof value !== 'string' || !value.trim()) return 0;
  const seconds = Number(value);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(duration) ? Math.min(MAX_BACKOFF_MS, Math.max(0, duration)) : 0;
}

export function createFearGreedService({ fetchImpl, now = () => Date.now() } = {}) {
  let cached = null;
  let expiresAt = 0;
  let retryAt = 0;
  let failures = 0;
  let lastFailure = null;
  let pending = null;

  return async function fetchFearGreedSnapshot() {
    const requestAt = now();
    if (cached && requestAt < expiresAt) return cached;
    if (pending) return pending;
    if (requestAt < retryAt) {
      if (cached) return deepFreeze({ ...cached, stale: true });
      throw lastFailure;
    }
    pending = (async () => {
      try {
        const startDate = sourceDay(requestAt - 400 * DAY_MS);
        const response = await providerFetch(`https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }, { provider: 'cnn:fear-greed', timeoutMs: QUOTE_TIMEOUTS.cnn, fetchImpl });
        if (!response?.ok) {
          throw new FearGreedError(response?.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', {
            retryAfterMs: retryAfterMs(response, now()),
          });
        }
        const incoming = normalizeFearGreedPayload(await response.json(), { fetchedAt: now() });
        cached = mergeSnapshot(cached, incoming);
        expiresAt = now() + FEAR_GREED_TTL_MS;
        retryAt = 0;
        failures = 0;
        lastFailure = null;
        return cached;
      } catch (cause) {
        lastFailure = cause instanceof FearGreedError ? cause : new FearGreedError();
        failures += 1;
        const base = lastFailure.code === 'RATE_LIMITED' ? FEAR_GREED_RATE_LIMIT_BACKOFF_MS : FEAR_GREED_FAILURE_BACKOFF_MS;
        retryAt = now() + Math.max(Math.min(MAX_BACKOFF_MS, base * (2 ** Math.min(failures - 1, 8))), lastFailure.retryAfterMs);
        if (cached) return deepFreeze({ ...cached, stale: true });
        throw lastFailure;
      } finally {
        pending = null;
      }
    })();
    return pending;
  };
}

export const fetchFearGreed = createFearGreedService();
