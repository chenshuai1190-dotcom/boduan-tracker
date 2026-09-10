import { createSecEarningsCoverageRepository, normalizeCoverageEvent, secEarningsAutoCoverageEnabled } from './secEarningsCoverageRepository.js';
import { selectSharedEarningsDetail } from './secEarningsSharedCache.js';
import { EARNINGS_DETAIL_PARSER_VERSION } from '../../src/lib/earningsDetailPolicy.js';
import { isEarningsPublished } from '../../src/lib/earningsCalendarModel.js';

export async function registerCalendarCoverage({ userId, events, now = new Date(), env = process.env,
  createRepository = createSecEarningsCoverageRepository } = {}) {
  if (!secEarningsAutoCoverageEnabled(env) || !userId) return { status: 'disabled' };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const published = (events || []).filter(isEarningsPublished)
    .map(normalizeCoverageEvent).filter((event) => event && event.reportDate <= today);
  if (!published.length) return { status: 'idle', registered: 0 };
  try {
    const result = await createRepository({ env }).register(userId, published);
    return { status: 'queued', registered: Number(result?.registered) || 0 };
  } catch {
    // Additive foundation may not be installed yet; never break the calendar.
    return { status: 'unavailable' };
  }
}

export async function readSharedEarningsDetail(request, { now = new Date(), env = process.env,
  createRepository = createSecEarningsCoverageRepository } = {}) {
  if (!secEarningsAutoCoverageEnabled(env)) return null;
  try {
    const rows = await createRepository({ env }).results(request.symbol);
    return selectSharedEarningsDetail({ request, rows, now, parserVersion: EARNINGS_DETAIL_PARSER_VERSION });
  } catch { return null; }
}
