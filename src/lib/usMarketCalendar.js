const US_REGULAR_CLOSE_MINUTES = 16 * 60;

export function isUsMarketDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function shiftDateKey(dateKey, offsetDays) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isWeekdayDateKey(dateKey) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function observedFixedHoliday(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + (occurrence - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function easterSundayDateKey(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

const marketHolidayCache = new Map();

function marketHolidayDatesForHolidayYear(year) {
  if (marketHolidayCache.has(year)) return marketHolidayCache.get(year);
  const dates = new Set([
    observedFixedHoliday(year, 0, 1),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    shiftDateKey(easterSundayDateKey(year), -2),
    lastWeekdayOfMonth(year, 4, 1),
    observedFixedHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25),
  ]);
  if (year >= 2022) dates.add(observedFixedHoliday(year, 5, 19));
  marketHolidayCache.set(year, dates);
  return dates;
}

export function isUsMarketTradingDate(dateKey) {
  if (!isUsMarketDateKey(dateKey) || !isWeekdayDateKey(dateKey)) return false;
  const year = Number(String(dateKey).slice(0, 4));
  return !marketHolidayDatesForHolidayYear(year).has(dateKey)
    && !marketHolidayDatesForHolidayYear(year + 1).has(dateKey);
}

export function getPreviousUsTradingDate(dateKey) {
  if (!isUsMarketDateKey(dateKey)) return '';
  let candidate = shiftDateKey(dateKey, -1);
  while (candidate && !isUsMarketTradingDate(candidate)) candidate = shiftDateKey(candidate, -1);
  return candidate;
}

export function getUsEasternMarketClock(now = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const date = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    if (!isUsMarketDateKey(date) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return {
      date,
      weekday: getPart('weekday'),
      minutes: hour * 60 + minute,
    };
  } catch {
    return null;
  }
}

export function getLatestCompletedUsTradingDate(now = Date.now()) {
  const clock = getUsEasternMarketClock(now);
  if (!clock) return '';
  if (isUsMarketTradingDate(clock.date) && clock.minutes >= US_REGULAR_CLOSE_MINUTES) {
    return clock.date;
  }

  return getPreviousUsTradingDate(clock.date);
}
