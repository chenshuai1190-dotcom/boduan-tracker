import { dateKey, normalizeEarningsSession } from './earningsCalendarModel.js';
import { isFreshStockRealtimeTick } from './stockRealtime.js';

const NEW_YORK_TIME_ZONE = 'America/New_York';
const PREMARKET_END_MINUTE = 9 * 60 + 30;
const newYorkDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampMs(value) {
  const parsed = finiteNumber(value);
  if (!(parsed > 0)) return 0;
  return parsed < 1_000_000_000_000 ? Math.round(parsed * 1000) : Math.round(parsed);
}

function quoteTimestamp(quote) {
  return timestampMs(quote?.clientReceivedAt)
    || timestampMs(quote?.receivedAt)
    || timestampMs(quote?.realtimeAt)
    || timestampMs(quote?.timestamp);
}

function resolveNowMs(now) {
  const value = typeof now === 'function' ? now() : now;
  const parsed = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function getNewYorkClock(nowMs) {
  const parts = Object.fromEntries(
    newYorkDateTimeFormatter
      .formatToParts(new Date(nowMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minuteOfDay: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function isWebSocketQuote(quote) {
  const source = String(quote?.source || '').trim().toUpperCase();
  return quote?.realtime === true
    && (source === 'EODHD_WS' || source === 'EODHD_WS_QUOTE');
}

export function resolveEarningsReactionDisplay({
  event,
  quote,
  now = Date.now,
  freshnessStartedAt = 0,
} = {}) {
  const officialClosePercent = finiteNumber(event?.marketReactionPercent);
  if (officialClosePercent !== null) {
    return {
      mode: 'official-close',
      percent: officialClosePercent,
      locked: true,
    };
  }

  const waitingForClose = {
    mode: 'official-close',
    percent: null,
    locked: false,
  };
  if (normalizeEarningsSession(event?.session) !== 'pre' || !isWebSocketQuote(quote)) return waitingForClose;

  const nowMs = resolveNowMs(now);
  const clock = getNewYorkClock(nowMs);
  const reportDate = dateKey(event?.reportDate || event?.report_date || event?.date);
  if (
    !reportDate
    || reportDate !== clock.date
    || clock.weekday === 'Sat'
    || clock.weekday === 'Sun'
    || clock.minuteOfDay >= PREMARKET_END_MINUTE
    || !isFreshStockRealtimeTick(quote, { now: nowMs })
  ) return waitingForClose;

  const receivedAt = quoteTimestamp(quote);
  const freshnessFloor = Number(freshnessStartedAt) || 0;
  if (freshnessFloor > 0 && receivedAt < freshnessFloor) return waitingForClose;

  const price = finiteNumber(quote?.price);
  const baseline = finiteNumber(quote?.dailyBaselineClose) ?? finiteNumber(quote?.previousClose);
  if (!(price > 0) || !(baseline > 0)) return waitingForClose;

  return {
    mode: 'live-pre',
    percent: ((price - baseline) / baseline) * 100,
    locked: false,
  };
}
