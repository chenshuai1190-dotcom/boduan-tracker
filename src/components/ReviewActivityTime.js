import React from 'react';
import { formatReviewActivityTime } from '../lib/reviewActivityTime.js';
import { normalizeReviewActivityTimeZone } from '../lib/reviewActivityZone.js';

function calendarRefreshDelay(date, clock, now) {
  const parts = Object.fromEntries(clock.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  if (parts.year > Number(date.slice(0, 4))) return null;
  // Recheck at local midnight, when a short month/day label can gain its year.
  const elapsedSeconds = (parts.hour * 60 + parts.minute) * 60 + parts.second;
  return (86400 - elapsedSeconds) * 1000 - now % 1000;
}

/** One presentation for post and comment timestamps. Date-only legacy records
 * stay dates: they cannot support an honest minute/hour estimate. */
export default function ReviewActivityTime({ createdAt, date, activityTimeZone, language = 'zh' }) {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const { dateTime } = formatReviewActivityTime({ createdAt, date, activityTimeZone });
    if (!dateTime) return undefined;
    const calendarClock = dateTime.includes('T') ? null : new Intl.DateTimeFormat('en', {
      timeZone: normalizeReviewActivityTimeZone(activityTimeZone), year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    let timer;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const delay = calendarClock ? calendarRefreshDelay(dateTime, calendarClock, current) : 60000;
      if (delay !== null) timer = setTimeout(tick, delay);
    };
    tick();
    return () => clearTimeout(timer);
  }, [createdAt, date, activityTimeZone]);
  const value = formatReviewActivityTime({ createdAt, date, activityTimeZone }, { now, language });
  return React.createElement('time', {
    dateTime: value.dateTime, title: value.title || undefined,
    'aria-label': value.title && value.title !== value.label ? `${value.label} · ${value.title}` : undefined,
  }, value.label);
}
