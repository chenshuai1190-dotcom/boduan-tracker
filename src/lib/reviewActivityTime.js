import { normalizeReviewActivityTimeZone } from './reviewActivityZone.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

const dateParts = { year: 'numeric', month: '2-digit', day: '2-digit' };
const exactParts = { ...dateParts, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' };
const formatters = new Map();

function formatter(locale, timeZone, precise = false) {
  const key = `${locale}/${timeZone || 'device'}/${precise}`;
  if (!formatters.has(key)) {
    // Bound the cache for long-lived feeds containing many posting time zones.
    if (formatters.size >= 128) formatters.delete(formatters.keys().next().value);
    formatters.set(key, new Intl.DateTimeFormat(locale, { ...(precise ? exactParts : dateParts), timeZone }));
  }
  return formatters.get(key);
}

function calendarDay(instant, timeZone) {
  const fields = Object.fromEntries(formatter('en-US', timeZone).formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${fields.year.padStart(4, '0')}-${fields.month}-${fields.day}`;
}

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateLabel(date, currentDate, english) {
  const [year, month, day] = date.split('-');
  const includeYear = year !== currentDate.slice(0, 4);
  if (english) return `${shortMonths[Number(month) - 1]} ${Number(day)}${includeYear ? `, ${year}` : ''}`;
  return `${includeYear ? `${year}年` : ''}${Number(month)}月${Number(day)}日`;
}

/** Compare real instants for relative time; retain the author's calendar for dates.
 * The optional date on a post may be a manually chosen journal date. Only use it
 * when its publication timestamp is unavailable. */
export function formatReviewActivityTime(value = {}, { now = Date.now(), language = 'zh', timeZone } = {}) {
  const { createdAt, date, activityTimeZone } = value || {};
  const english = typeof language === 'string' && language.startsWith('en');
  const authorZone = normalizeReviewActivityTimeZone(activityTimeZone);
  const match = typeof createdAt === 'string' ? createdAt.match(TIMESTAMP) : null;
  const milliseconds = match && validDate(match[1]) ? Date.parse(createdAt) : NaN;
  // A nonzero stored offset preserves the original local calendar even without
  // a named zone. Supabase's normalized UTC alone carries no author location.
  const offset = !authorZone && Number.isFinite(milliseconds) && createdAt.match(/([+-])(\d{2}):(\d{2})$/);
  const offsetMinutes = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
  const shift = offsetMinutes * 60000;
  const zone = authorZone || (shift ? 'UTC' : normalizeReviewActivityTimeZone(timeZone));
  if (!Number.isFinite(milliseconds) || !Number.isFinite(now)) {
    if (!validDate(date)) return { label: '—', dateTime: undefined, title: '' };
    const label = Number.isFinite(now) ? dateLabel(date, calendarDay(now, zone), english) : date;
    return { label, dateTime: date, title: date };
  }
  const precise = formatter(english ? 'en-US' : 'zh-CN', zone, true);
  const title = shift ? precise.formatToParts(milliseconds + shift)
    .map(part => part.type === 'timeZoneName' ? `UTC${offset[0]}` : part.value).join('') : precise.format(milliseconds);
  // PostgreSQL may return microseconds; do not round a just-under-one-minute
  // interval up merely because Date.parse truncates its submillisecond part.
  const fraction = createdAt.match(/\.(\d+)/)?.[1] || '';
  const fractionMs = fraction ? Number(`0.${fraction}`) * 1000 : 0;
  const elapsed = Math.max(0, now - milliseconds - (fractionMs - Math.floor(fractionMs)));
  let label;
  if (elapsed >= 4 * DAY_MS) label = dateLabel(calendarDay(milliseconds + shift, zone), calendarDay(now + shift, zone), english);
  else if (elapsed < 60 * 1000) label = english ? 'Just now' : '刚刚';
  else {
    const [amount, unit, chinese] = elapsed < 60 * 60 * 1000 ? [Math.floor(elapsed / 60000), 'minute', '分钟']
      : elapsed < DAY_MS ? [Math.floor(elapsed / 3600000), 'hour', '小时']
        : [Math.floor(elapsed / DAY_MS), 'day', '天'];
    label = english ? `${amount} ${unit}${amount === 1 ? '' : 's'} ago` : `${amount}${chinese}前`;
  }
  return { label, dateTime: createdAt, title };
}
