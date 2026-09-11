const CACHE_MS = 15 * 60 * 1000;
const snapshots = new Map();
const RATINGS = new Set(['extreme fear', 'fear', 'neutral', 'greed', 'extreme greed']);
const SERIES = {
  momentum: ['market_momentum_sp500', 'market_momentum_sp125'],
  strength: ['stock_price_strength'], breadth: ['stock_price_breadth'], options: ['put_call_options'],
  volatility: ['market_volatility_vix', 'market_volatility_vix_50'],
  safeHaven: ['safe_haven_demand'], junkBonds: ['junk_bond_demand'],
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const score = value => finite(value) && value >= 0 && value <= 100;
const validTime = (value, now) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && Date.parse(value) > 0 && Date.parse(value) <= now + 300000;
const failure = code => Object.assign(new Error(code), { code });

// Keep CNN's current component scores separate from the raw chart units.
export function normalizeFearGreed(value, { now = Date.now() } = {}) {
  if (!value || value.source !== 'CNN' || typeof value.stale !== 'boolean'
    || !validTime(value.asOf, now) || !validTime(value.fetchedAt, now)
    || !score(value.current?.score) || !RATINGS.has(value.current?.rating)
    || !validTime(value.current?.timestamp, now) || value.current.timestamp !== value.asOf
    || !Array.isArray(value.history) || !Array.isArray(value.indicators)) return null;
  const readPoints = (input, maxTimestamp, isScore = false) => {
    if (!Array.isArray(input) || input.length > 1000) return null;
    let previous = 0;
    const output = [];
    for (const point of input) {
      if (!finite(point?.timestamp) || point.timestamp <= previous || point.timestamp > maxTimestamp
        || !(isScore ? score(point.value) : finite(point.value))
        || (isScore && point.rating !== null && !RATINGS.has(point.rating))) return null;
      previous = point.timestamp;
      output.push({ timestamp: point.timestamp, value: point.value, ...(isScore ? { rating: point.rating } : {}) });
    }
    return output;
  };
  const history = readPoints(value.history, Date.parse(value.asOf), true);
  if (!history) return null;
  const comparisons = {};
  for (const key of ['previousClose', 'weekAgo', 'monthAgo', 'yearAgo']) {
    const item = value.comparisons?.[key];
    if (item !== null && !score(item)) return null;
    comparisons[key] = item;
  }
  if (value.indicators.length !== Object.keys(SERIES).length) return null;
  const indicators = [];
  for (const [id, seriesIds] of Object.entries(SERIES)) {
    const item = value.indicators.find(entry => entry?.id === id);
    if (!item || (item.score !== null && !score(item.score))
      || (item.rating !== null && !RATINGS.has(item.rating))
      || (item.timestamp !== null && !validTime(item.timestamp, now))
      || !Array.isArray(item.series) || item.series.length !== seriesIds.length) return null;
    const series = [];
    for (const seriesId of seriesIds) {
      const input = item.series.find(entry => entry?.id === seriesId);
      // Paired lines can publish at different times; the snapshot capture is
      // their shared ceiling, not the first line's component-rating timestamp.
      const points = readPoints(input?.points, Date.parse(value.fetchedAt));
      if (!points) return null;
      series.push({ id: seriesId, points });
    }
    indicators.push({ id, score: item.score, rating: item.rating, timestamp: item.timestamp, series });
  }
  return { source: 'CNN', asOf: value.asOf, fetchedAt: value.fetchedAt, stale: value.stale,
    current: { ...value.current }, comparisons, history, indicators };
}

async function defaultGetSession() {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw failure('AUTH_REQUIRED');
  return supabase.auth.getSession();
}

export function clearFearGreedCache(userId) {
  if (userId) snapshots.delete(userId);
  else snapshots.clear();
}

function retainSnapshot(previous, incoming) {
  if (!previous) return incoming;
  const sameTime = previous.asOf === incoming.asOf;
  if (Date.parse(previous.asOf) > Date.parse(incoming.asOf)
    || (sameTime && (Date.parse(previous.fetchedAt) > Date.parse(incoming.fetchedAt)
      || previous.current.score !== incoming.current.score || previous.current.rating !== incoming.current.rating))) {
    return { ...previous, stale: true };
  }
  let stale = incoming.stale;
  const cutoff = Date.parse(incoming.fetchedAt.slice(0, 10)) - 400 * 86400000;
  const merge = (oldPoints, newPoints) => {
    const days = new Map();
    for (const point of [...oldPoints, ...newPoints]) {
      if (point.timestamp < cutoff) continue;
      const day = new Date(point.timestamp).toISOString().slice(0, 10);
      const old = days.get(day);
      if (!old || point.timestamp > old.timestamp) days.set(day, point);
      else if (point.timestamp === old.timestamp && point.value !== old.value) stale = true;
      else if (point.timestamp === old.timestamp && old.rating === null && point.rating) days.set(day, point);
    }
    return [...days.values()].sort((a, b) => a.timestamp - b.timestamp);
  };
  const comparisons = { ...incoming.comparisons };
  if (sameTime) for (const key of Object.keys(comparisons)) comparisons[key] ??= previous.comparisons[key];
  const history = merge(previous.history, incoming.history);
  const indicators = incoming.indicators.map(item => {
    const old = previous.indicators.find(entry => entry.id === item.id);
    const retain = old && ((old.score !== null && item.score === null)
      || (old.timestamp && (!item.timestamp || Date.parse(old.timestamp) > Date.parse(item.timestamp))));
    if (retain) stale = true;
    return { ...(retain ? old : item), series: item.series.map(line => ({
      id: line.id, points: merge(old?.series.find(entry => entry.id === line.id)?.points || [], line.points),
    })) };
  });
  return { ...incoming, comparisons, history, indicators, stale };
}

export async function loadFearGreed({ userId, signal, force = false, getSession = defaultGetSession,
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 12000 } = {}) {
  if (!userId || typeof userId !== 'string') throw failure('AUTH_REQUIRED');
  const assertSession = async () => {
    const response = await getSession().catch(() => null);
    const session = response?.data?.session;
    if (response?.error || !session?.access_token || session.user?.id !== userId) {
      snapshots.delete(userId);
      throw failure('AUTH_REQUIRED');
    }
    if (signal?.aborted) throw failure('REQUEST_ABORTED');
    return session;
  };
  const session = await assertSession();
  const cached = snapshots.get(userId);
  if (!force && cached?.expiresAt > now()) return cached.data;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl('/api/quote?view=fear-greed', {
      headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) throw failure('AUTH_REQUIRED');
    if (!response.ok) throw failure('NETWORK_ERROR');
    const body = await response.json();
    const data = body?.success === true ? normalizeFearGreed(body.data, { now: now() }) : null;
    if (!data) throw failure('INVALID_DATA');
    await assertSession();
    const latest = snapshots.get(userId)?.data;
    const result = retainSnapshot(latest, data);
    snapshots.delete(userId);
    snapshots.set(userId, { data: result, expiresAt: now() + (result.stale ? 60000 : CACHE_MS) });
    while (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
    return result;
  } catch (error) {
    if (error?.code === 'AUTH_REQUIRED') { snapshots.delete(userId); throw error; }
    if (signal?.aborted) throw failure('REQUEST_ABORTED');
    await assertSession();
    const fallback = snapshots.get(userId)?.data || cached?.data;
    if (fallback) return { ...fallback, stale: true };
    throw error?.code ? error : failure('NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
