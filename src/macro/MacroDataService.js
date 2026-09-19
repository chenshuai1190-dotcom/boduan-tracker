import { MACRO_GROUPS, MACRO_METRICS } from './macroCatalog.js';
import { isMacroDate } from './macroNormalizer.js';

const nullable = value => value === null || typeof value === 'number' && Number.isFinite(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function validateMacroSnapshot(data) {
  if (!data || data.schemaVersion !== 1 || data.simulated !== false || data.source !== 'MacroDataService'
    || !data.metrics || !data.groups || !Array.isArray(data.events)
    || !timestamp(data.fetchedAt) || !timestamp(data.now)
    || !data.regime || typeof data.regime.label !== 'string' || typeof data.regime.summary !== 'string'
    || !data.growth || !nullable(data.growth.score) || !nullable(data.growth.previous) || !Array.isArray(data.growth.factors)
    || !data.availability || !Number.isInteger(data.availability.available)
    || data.availability.total !== Object.keys(MACRO_METRICS).length
    || !Array.isArray(data.availability.missing) || !Array.isArray(data.availability.stale)
    || !['available', 'unavailable', 'partial'].includes(data.calendarStatus)) return false;
  if (!Object.entries(MACRO_GROUPS).every(([group, ids]) => Array.isArray(data.groups[group])
    && ids.length === data.groups[group].length && ids.every((id, i) => data.groups[group][i] === id))) return false;
  const validMetrics = Object.keys(MACRO_METRICS).every(id => {
    const metric = data.metrics[id];
    let previous = '';
    return metric?.id === id && metric.simulated === false && Array.isArray(metric.history)
      && ['value', 'change1d', 'change5d', 'change20d', 'percentile20d'].every(key => nullable(metric[key]))
      && metric.unit === MACRO_METRICS[id].unit && metric.changeUnit === MACRO_METRICS[id].changeUnit
      && typeof metric.source === 'string' && ['fresh', 'stale', 'unavailable'].includes(metric.freshness)
      && metric.history.every(point => {
        if (!isMacroDate(point?.date) || point.date <= previous || point.date > data.now.slice(0, 10)
          || typeof point.value !== 'number' || !Number.isFinite(point.value)) return false;
        previous = point.date; return true;
      })
      && (metric.history.length ? metric.asOf === metric.history.at(-1).date && metric.value === metric.history.at(-1).value : metric.value === null && metric.asOf === null);
  });
  return validMetrics && data.availability.available === Object.values(data.metrics).filter(metric => metric.value !== null).length
    && data.events.every(event => event && event.simulated === false && timestamp(event.time)
      && typeof event.id === 'string' && typeof event.code === 'string' && typeof event.name === 'string'
      && ['actual', 'forecast', 'previous'].every(key => nullable(event[key])));
}

const failure = (code, message) => Object.assign(new Error(message), { code });

async function defaultGetSession() {
  const { supabase } = await import('../lib/supabase.js');
  return supabase?.auth.getSession();
}

// Read the active Supabase session before and after each production request.
// The local, unauthenticated endpoint is only available in a development build.
export async function fetchMacroData({ preview = false, userId, accessToken, signal,
  getSession = defaultGetSession, fetchImpl = globalThis.fetch, timeoutMs = 90000 } = {}) {
  const local = preview === true && import.meta.env?.DEV === true;
  const scoped = userId !== undefined;
  if (!local && (scoped ? typeof userId !== 'string' || !userId.trim() : !accessToken)) {
    throw failure('AUTH_REQUIRED', '请先登录后读取宏观数据');
  }
  if (signal?.aborted) throw failure('REQUEST_ABORTED', '读取已取消');
  const controller = new AbortController();
  let timer;
  let abort;
  const assertActive = () => {
    if (controller.signal.aborted || signal?.aborted) throw failure('REQUEST_ABORTED', '读取已取消');
  };
  const assertSession = async () => {
    assertActive();
    const result = await Promise.resolve().then(getSession).catch(() => null);
    assertActive();
    const session = result?.data?.session;
    if (result?.error || !session?.access_token || session.user?.id !== userId
      || (typeof session.expires_at === 'number' && session.expires_at <= Date.now() / 1000)) {
      throw failure('AUTH_REQUIRED', '登录已失效，请重新登录');
    }
    return session;
  };
  try {
    const cancelled = new Promise((_, reject) => {
      abort = () => { controller.abort(); reject(failure('REQUEST_ABORTED', '读取已取消')); };
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(failure('REQUEST_TIMEOUT', '宏观数据读取超时，请重试'));
      }, timeoutMs);
    });
    const operation = (async () => {
      const token = !local && scoped ? (await assertSession()).access_token : accessToken;
      assertActive();
      const response = await fetchImpl(local ? '/__macro-preview' : '/api/quote?view=macro', {
        signal: controller.signal, cache: 'no-store', headers: local ? {} : { Authorization: `Bearer ${token}` },
      });
      assertActive();
      if ([401, 403].includes(response.status)) throw failure('AUTH_REQUIRED', '登录已失效，请重新登录');
      if (!response.ok) throw failure('NETWORK_ERROR', '宏观数据暂时不可用');
      const body = await response.json().catch(() => null);
      assertActive();
      if (body?.success !== true || !validateMacroSnapshot(body.data)) throw failure('INVALID_DATA', '宏观数据格式不完整');
      if (!local && scoped) await assertSession();
      assertActive();
      return body.data;
    })();
    return await Promise.race([operation, cancelled]);
  } catch (error) {
    if (error?.code) throw error;
    throw failure('NETWORK_ERROR', '宏观数据暂时不可用');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
