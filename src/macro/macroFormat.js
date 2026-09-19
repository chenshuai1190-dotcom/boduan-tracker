const presentNumber = value => typeof value === 'number' && Number.isFinite(value);
const numberText = (value, digits) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatMacroValue(value, unit) {
  if (!presentNumber(value)) return '—';
  if (unit === 'percent') return `${numberText(value, 2)}%`;
  if (unit === 'bp') return `${numberText(value, Number.isInteger(value) ? 0 : 1)} bp`;
  if (unit === 'usd') return `$${numberText(value, 2)}`;
  if (unit === 'usdBn') return `$${numberText(value, 1)}B`;
  return numberText(value, 2);
}

// Changes already carry their display unit. In particular, 4 bp stays 4 bp;
// a percentage-point-to-bp conversion belongs to the mock data definition.
export function formatMacroChange(value, changeUnit) {
  if (!presentNumber(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (changeUnit === 'bp') return `${sign}${numberText(absolute, Number.isInteger(absolute) ? 0 : 1)} bp`;
  if (changeUnit === 'usdBn') return `${sign}$${numberText(absolute, 1)}B`;
  if (changeUnit === 'percent') return `${sign}${numberText(absolute, 2)}%`;
  return `${sign}${numberText(absolute, 2)}`;
}

function dateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const read = type => parts.find(part => part.type === type)?.value || '';
  return { date: `${read('year')}-${read('month')}-${read('day')}`, time: `${read('hour')}:${read('minute')}` };
}

export function formatMacroEventTime(time, localZone = 'Asia/Shanghai') {
  const date = new Date(time === null || time === '' ? NaN : time);
  if (!Number.isFinite(date.getTime())) return { date: '—', time: '—', zone: 'ET', etAbbreviation: 'ET', localDate: '—', localTime: '—', localZone };
  try {
    const eastern = dateTimeParts(date, 'America/New_York');
    const local = dateTimeParts(date, localZone);
    const etAbbreviation = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
      .formatToParts(date).find(part => part.type === 'timeZoneName')?.value || 'ET';
    return { ...eastern, zone: 'ET', etAbbreviation, localDate: local.date, localTime: local.time, localZone };
  } catch {
    return { date: '—', time: '—', zone: 'ET', etAbbreviation: 'ET', localDate: '—', localTime: '—', localZone };
  }
}

export function formatMacroCountdown(time, now) {
  const eventTime = new Date(time === null || time === '' ? NaN : time).getTime();
  const currentTime = new Date(now === null || now === '' ? NaN : now).getTime();
  if (!Number.isFinite(eventTime) || !Number.isFinite(currentTime)) return '—';
  const milliseconds = eventTime - currentTime;
  if (milliseconds <= 0) return '已公布';
  if (milliseconds < 60000) return '不足1分钟';
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor(totalMinutes % 1440 / 60);
  const minutes = totalMinutes % 60;
  return `${days ? `${days}天` : ''}${hours ? `${hours}小时` : ''}${minutes ? `${minutes}分` : ''}`;
}

function previousMonthClamped(date, monthCount) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - monthCount;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function sliceMacroHistory(history, range = '1m', asOf) {
  if (!Array.isArray(history) || !history.length) return [];
  const endDate = new Date(`${String(asOf || history.at(-1)?.date).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(endDate.getTime())) return [];
  const normalizedRange = String(range).toLowerCase();
  let startDate;
  if (normalizedRange === '1w') startDate = new Date(endDate.getTime() - 7 * 86400000);
  else if (normalizedRange === '1m') startDate = previousMonthClamped(endDate, 1);
  else if (normalizedRange === '3m') startDate = previousMonthClamped(endDate, 3);
  else if (normalizedRange === '1y') startDate = previousMonthClamped(endDate, 12);
  else if (normalizedRange === '5y') startDate = previousMonthClamped(endDate, 60);
  else return [];
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  return history.filter(point => point && typeof point.date === 'string' && point.date > start && point.date <= end && presentNumber(point.value));
}
