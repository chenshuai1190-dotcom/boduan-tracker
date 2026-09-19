import { fetchEodhdMacroSeries } from './eodhdProviders.js';
import { fetchPublicMacroSeries } from './publicProviders.js';
import { createMacroSnapshot } from '../../src/macro/macroNormalizer.js';

export const MACRO_CACHE_MS = 15 * 60 * 1000;
export const MACRO_FAILURE_CACHE_MS = 60 * 1000;

// Only public macro observations are cached. No account data or auth tokens.
export function createMacroDataService({ eodhdProvider = fetchEodhdMacroSeries, publicProvider = fetchPublicMacroSeries, clock = () => new Date() } = {}) {
  let cached = null;
  let expiresAt = 0;
  let pending = null;
  return async function getSnapshot({ eodhdKey = process.env.EODHD_API_KEY, fredKey = process.env.FRED_API_KEY } = {}) {
    const now = clock();
    if (cached && now.getTime() < expiresAt) return { ...cached, now: now.toISOString() };
    if (pending) return pending;
    pending = (async () => {
      const to = now.toISOString().slice(0, 10);
      const start = new Date(now);
      start.setUTCFullYear(start.getUTCFullYear() - 5);
      const from = start.toISOString().slice(0, 10);
      const results = await Promise.allSettled([
        eodhdProvider({ from, to, now: now.toISOString(), eodhdKey }),
        publicProvider({ from, to, now: now.toISOString(), fredKey }),
      ]);
      const eodhd = results[0].status === 'fulfilled' ? results[0].value : {};
      const publicData = results[1].status === 'fulfilled' ? results[1].value : {};
      cached = createMacroSnapshot({
        series: { ...publicData.series, ...eodhd.series },
        events: eodhd.events || [], calendarStatus: eodhd.calendarStatus || 'unavailable',
        calendarError: eodhd.calendarError || (eodhd.calendarStatus === 'available' ? null : '经济日历读取失败'),
        now: now.toISOString(), from,
      });
      expiresAt = clock().getTime() + (cached.availability.available ? MACRO_CACHE_MS : MACRO_FAILURE_CACHE_MS);
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}

export const fetchMacroSnapshot = createMacroDataService();
