import React from 'react';
import { formatReviewActivityTime } from '../lib/reviewActivityTime.js';

/** One presentation for post and comment timestamps. Date-only legacy records
 * stay dates: they cannot support an honest minute/hour estimate. */
export default function ReviewActivityTime({ createdAt, date, language = 'zh' }) {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const value = formatReviewActivityTime({ createdAt, date });
    if (!value.dateTime?.includes('T')) return undefined;
    let timer;
    const tick = () => { setNow(Date.now()); timer = setTimeout(tick, 60000); };
    tick();
    return () => clearTimeout(timer);
  }, [createdAt, date]);
  const value = formatReviewActivityTime({ createdAt, date }, { now, language });
  return React.createElement('time', {
    dateTime: value.dateTime, title: value.title || undefined,
    'aria-label': value.title && value.title !== value.label ? `${value.label} · ${value.title}` : undefined,
  }, value.label);
}
