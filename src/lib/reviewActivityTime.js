const DAY_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function exactTimeTitle(timestamp, milliseconds, english, timeZone) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' };
  const locale = english ? 'en-US' : 'zh-CN';
  try {
    return new Intl.DateTimeFormat(locale, { ...options, ...(timeZone ? { timeZone } : {}) }).format(milliseconds);
  } catch {
    // A stale/unsupported IANA preference falls back to the viewer's device.
    // If Intl itself is unavailable, the original zoned timestamp remains true.
    try { return new Intl.DateTimeFormat(locale, options).format(milliseconds); }
    catch { return timestamp; }
  }
}

/** Activity chronology uses elapsed time from the server's zoned createdAt.
 * A historical calendar date is not an instant; never manufacture its midnight
 * or replace it with the parent post's/market's date. */
export function formatReviewActivityTime(value = {}, { now = Date.now(), language = 'zh', timeZone } = {}) {
  const { createdAt, date } = value || {};
  const fallback = validDate(date) ? { label: date, dateTime: date, title: date }
    : { label: '—', dateTime: undefined, title: '' };
  const match = typeof createdAt === 'string' ? createdAt.match(TIMESTAMP) : null;
  if (!match || !validDate(match[1]) || !Number.isFinite(now)) return fallback;
  const milliseconds = Date.parse(createdAt);
  if (!Number.isFinite(milliseconds)) return fallback;
  const english = typeof language === 'string' && language.startsWith('en');
  // PostgreSQL may return microseconds; do not round a just-under-one-minute
  // interval up merely because Date.parse truncates its submillisecond part.
  const fraction = createdAt.match(/\.(\d+)/)?.[1] || '';
  const fractionMs = fraction ? Number(`0.${fraction}`) * 1000 : 0;
  const elapsed = Math.max(0, now - milliseconds - (fractionMs - Math.floor(fractionMs)));
  let label;
  if (elapsed < 60 * 1000) label = english ? 'Just now' : '刚刚';
  else {
    const [amount, unit, chinese] = elapsed < 60 * 60 * 1000 ? [Math.floor(elapsed / 60000), 'minute', '分钟']
      : elapsed < DAY_MS ? [Math.floor(elapsed / 3600000), 'hour', '小时']
        : [Math.floor(elapsed / DAY_MS), 'day', '天'];
    label = english ? `${amount} ${unit}${amount === 1 ? '' : 's'} ago` : `${amount}${chinese}前`;
  }
  return { label, dateTime: createdAt, title: exactTimeTitle(createdAt, milliseconds, english, timeZone) };
}
