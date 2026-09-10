import { INDEX_QUOTE_CARDS } from './indexQuotes.js';

export const INDEX_CHART_SOURCE = 'YAHOO_CHART';
export const INDEX_CHART_TTL_MS = 60_000;
export const INDEX_CHART_FAILURE_BACKOFF_MS = 15_000;
export const INDEX_CHART_RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
export const INDEX_CHART_TIMEOUT_MS = 8_000;
export const INDEX_CHART_MAX_POINTS = 400;
const STALE_AFTER_MS = 30 * 60_000;
const CHART_SYMBOLS = Object.freeze({ 'GSPC.INDX': '^GSPC', 'NDX.INDX': '^NDX', 'DJI.INDX': '^DJI' });
const ET_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

function finite(value) {
  if (value === null || value === undefined || value === '' || !['number', 'string'].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function epoch(value) {
  const number = finite(value);
  if (number === null || number <= 0) return null;
  const timestamp = Math.round(number < 1_000_000_000_000 ? number * 1000 : number);
  return Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
}

function etDate(timestamp) {
  const parts = Object.fromEntries(ET_DATE.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function chartStatus(tick, now) {
  return tick.timestamp > now || now - tick.timestamp > STALE_AFTER_MS ? 'stale' : 'delayed';
}

function resolveCard(card) {
  return INDEX_QUOTE_CARDS.find(candidate => candidate.ticker === card?.ticker) || null;
}

function sessionForQuote(meta, date, timestamp) {
  const candidates = [meta?.currentTradingPeriod?.regular];
  // Yahoo may describe the next trading day in currentTradingPeriod. Only use a
  // period belonging to this quote's actual ET day, including completed days.
  const walk = (value, depth = 0) => {
    if (depth > 5 || candidates.length >= 200) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
    } else if (value && typeof value === 'object') {
      if (value.start !== undefined && value.end !== undefined) candidates.push(value);
      else if (value.regular) walk(value.regular, depth + 1);
    }
  };
  walk(meta?.tradingPeriods);
  for (const candidate of candidates) {
    const start = epoch(candidate?.start);
    const end = epoch(candidate?.end);
    if (!start || !end || end <= start || timestamp < start) continue;
    if (etDate(start) !== date || etDate(end) !== date) continue;
    return { start, end };
  }
  return null;
}

function boundedPoints(points) {
  if (points.length <= INDEX_CHART_MAX_POINTS) return points;
  return Array.from({ length: INDEX_CHART_MAX_POINTS }, (_, index) => (
    points[Math.round(index * (points.length - 1) / (INDEX_CHART_MAX_POINTS - 1))]
  ));
}

function freezePoints(points) {
  return Object.freeze(points.map(point => Object.freeze({ timestamp: point.timestamp, price: point.price })));
}

/** Quotes and history are accepted only from one verified index chart response. */
export function normalizeIndexChartQuote(payload, requestedCard, { fetchedAt = Date.now() } = {}) {
  const card = resolveCard(requestedCard);
  const chart = payload?.chart;
  if (!card || chart?.error || !Array.isArray(chart?.result) || chart.result.length !== 1) return null;
  const result = chart.result[0];
  const meta = result?.meta;
  if (meta?.symbol !== CHART_SYMBOLS[card.ticker] || meta?.instrumentType !== 'INDEX'
    || meta?.currency !== 'USD' || meta?.exchangeTimezoneName !== 'America/New_York') return null;
  const timestamp = epoch(meta.regularMarketTime);
  const price = finite(meta.regularMarketPrice);
  if (!timestamp || timestamp > fetchedAt || !(price > 0)) return null;
  const previousClose = finite(meta.previousClose ?? meta.chartPreviousClose);
  const baseline = previousClose > 0 ? previousClose : null;
  const change = baseline === null ? null : price - baseline;
  const date = etDate(timestamp);
  const session = sessionForQuote(meta, date, timestamp);
  const points = new Map();
  if (session) {
    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const closes = result.indicators?.quote?.[0]?.close;
    if (Array.isArray(closes)) {
      for (let index = 0; index < Math.min(timestamps.length, closes.length, 20_000); index += 1) {
        const pointAt = epoch(timestamps[index]);
        const pointPrice = finite(closes[index]);
        if (!pointAt || !(pointPrice > 0) || pointAt > fetchedAt || pointAt > timestamp) continue;
        if (pointAt < session.start || pointAt > session.end || etDate(pointAt) !== date) continue;
        points.set(pointAt, { timestamp: pointAt, price: pointPrice });
      }
    }
    // This is another real observation from the same response, not interpolation.
    // A last trade reported after 16:00 may remain the quote, but is not a chart point.
    if (timestamp <= session.end) points.set(timestamp, { timestamp, price });
  }
  const tick = {
    type: 'index_tick', symbol: card.ticker, ...card,
    price, previousClose: baseline, change,
    changePercent: baseline === null ? null : (change / baseline) * 100,
    dayHigh: finite(meta.regularMarketDayHigh),
    dayLow: finite(meta.regularMarketDayLow),
    timestamp, quoteAt: new Date(timestamp).toISOString(),
    receivedAt: fetchedAt, fetchedAt: new Date(fetchedAt).toISOString(),
    source: INDEX_CHART_SOURCE, realtime: false,
    intradayPoints: freezePoints(boundedPoints([...points.values()].sort((a, b) => a.timestamp - b.timestamp))),
    intradayDate: date,
    sessionStart: session?.start ?? null,
    sessionEnd: session?.end ?? null,
  };
  return Object.freeze({ ...tick, realtimeStatus: chartStatus(tick, fetchedAt) });
}

function failure(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export async function fetchIndexChartQuote(requestedCard, {
  fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = INDEX_CHART_TIMEOUT_MS,
} = {}) {
  const card = resolveCard(requestedCard);
  if (!card) throw failure(400, 'Unsupported market index');
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(CHART_SYMBOLS[card.ticker])}`);
  url.searchParams.set('range', '1d');
  url.searchParams.set('interval', '1m');
  url.searchParams.set('includePrePost', 'false');
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(failure(504, 'Index chart request timed out'));
    }, timeoutMs);
  });
  const request = async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'boduan-tracker/1.0 market-chart' },
      });
    } catch { throw failure(502, 'Index chart request failed'); }
    if (!response?.ok) {
      const status = Number(response?.status) || 502;
      throw failure(status, `Index chart HTTP ${status}`);
    }
    let payload;
    try { payload = await response.json(); } catch { throw failure(502, 'Invalid index chart response'); }
    const tick = normalizeIndexChartQuote(payload, card, { fetchedAt: now() });
    if (!tick) throw failure(502, 'Unverified index chart response');
    return tick;
  };
  try { return await Promise.race([request(), deadline]); } finally { clearTimeout(timer); }
}

function enrichRepeatedQuote(previous, incoming) {
  if (['price', 'previousClose', 'change', 'changePercent'].some(field => !Object.is(previous[field], incoming[field]))) {
    throw failure(502, 'Conflicting index quote at the same timestamp');
  }
  const sameSession = previous.intradayDate === incoming.intradayDate
    && previous.sessionStart === incoming.sessionStart && previous.sessionEnd === incoming.sessionEnd;
  let intradayPoints = previous.intradayPoints;
  let sessionStart = previous.sessionStart;
  let sessionEnd = previous.sessionEnd;
  if (!previous.sessionStart && incoming.sessionStart) {
    intradayPoints = incoming.intradayPoints;
    sessionStart = incoming.sessionStart;
    sessionEnd = incoming.sessionEnd;
  } else if (sameSession) {
    const merged = new Map(previous.intradayPoints.map(point => [point.timestamp, point]));
    for (const point of incoming.intradayPoints) {
      // Never remove or rewrite an accepted point during a same-time quote refresh.
      if (!merged.has(point.timestamp) && merged.size < INDEX_CHART_MAX_POINTS) merged.set(point.timestamp, point);
    }
    intradayPoints = freezePoints([...merged.values()].sort((a, b) => a.timestamp - b.timestamp));
  }
  return Object.freeze({
    ...previous, intradayPoints, sessionStart, sessionEnd,
    receivedAt: incoming.receivedAt, fetchedAt: incoming.fetchedAt,
  });
}

function mergeNewerQuote(previous, incoming) {
  if (!previous?.sessionStart || previous.intradayDate !== incoming.intradayDate
    || previous.sessionStart !== incoming.sessionStart || previous.sessionEnd !== incoming.sessionEnd) return incoming;
  const points = new Map(previous.intradayPoints.map(point => [point.timestamp, point]));
  // The latest response can revise an unfinished minute, but omitted older bars
  // must not erase real observations already accepted for this same session.
  for (const point of incoming.intradayPoints) points.set(point.timestamp, point);
  return Object.freeze({
    ...incoming,
    intradayPoints: freezePoints(boundedPoints([...points.values()].sort((a, b) => a.timestamp - b.timestamp))),
  });
}

export function createIndexChartQuoteLoader({
  fetchQuote = fetchIndexChartQuote, now = () => Date.now(), ttlMs = INDEX_CHART_TTL_MS,
  failureBackoffMs = INDEX_CHART_FAILURE_BACKOFF_MS,
  rateLimitBackoffMs = INDEX_CHART_RATE_LIMIT_BACKOFF_MS,
} = {}) {
  const quotes = new Map();
  const errors = new Map();
  const nextAttemptAt = new Map();
  let inFlight = null;
  let rateLimitedUntil = 0;
  const snapshot = () => {
    const receivedAt = now();
    const ticks = INDEX_QUOTE_CARDS.flatMap(card => {
      const tick = quotes.get(card.ticker);
      if (!tick) return [];
      const error = errors.get(card.ticker);
      return [Object.freeze({ ...tick, realtimeStatus: error ? 'stale' : chartStatus(tick, receivedAt), ...(error ? { fetchError: error.error } : {}) })];
    });
    return {
      ticks, errors: [...errors.values()], receivedAt,
      status: ticks.length === 0 ? 'unavailable' : (ticks.length < INDEX_QUOTE_CARDS.length || errors.size > 0 || ticks.some(tick => tick.realtimeStatus === 'stale') ? 'stale' : 'delayed'),
      source: INDEX_CHART_SOURCE, realtime: false,
      retryAfterAt: rateLimitedUntil > receivedAt ? rateLimitedUntil : null,
    };
  };
  return async function load({ fetchImpl } = {}) {
    if (inFlight) return inFlight;
    const at = now();
    if (at < rateLimitedUntil) return snapshot();
    const due = INDEX_QUOTE_CARDS.filter(card => at >= (nextAttemptAt.get(card.ticker) || 0));
    if (due.length === 0) return snapshot();
    const pending = Promise.allSettled(due.map(card => Promise.resolve().then(() => fetchQuote(card, { fetchImpl, now })))).then(results => {
      results.forEach((result, index) => {
        const card = due[index];
        try {
          if (result.status === 'rejected') throw result.reason;
          const incoming = result.value;
          const previous = quotes.get(card.ticker);
          if (!incoming || incoming.ticker !== card.ticker || incoming.source !== INDEX_CHART_SOURCE
            || !(incoming.price > 0) || !Number.isFinite(incoming.timestamp) || incoming.timestamp <= 0 || incoming.timestamp > now()
            || (previous && incoming.timestamp < previous.timestamp)) throw failure(502, 'Out-of-order or invalid index quote');
          quotes.set(card.ticker, previous?.timestamp === incoming.timestamp
            ? enrichRepeatedQuote(previous, incoming) : mergeNewerQuote(previous, incoming));
          errors.delete(card.ticker);
          nextAttemptAt.set(card.ticker, now() + ttlMs);
        } catch (error) {
          const statusCode = Number(error?.statusCode) || 502;
          errors.set(card.ticker, { ticker: card.ticker, statusCode, error: `Index chart HTTP ${statusCode}` });
          if (statusCode === 429) rateLimitedUntil = Math.max(rateLimitedUntil, now() + rateLimitBackoffMs);
          nextAttemptAt.set(card.ticker, now() + (statusCode === 429 ? rateLimitBackoffMs : failureBackoffMs));
        }
      });
      return snapshot();
    }).finally(() => { if (inFlight === pending) inFlight = null; });
    inFlight = pending;
    return pending;
  };
}

export const loadIndexChartQuotes = createIndexChartQuoteLoader();
