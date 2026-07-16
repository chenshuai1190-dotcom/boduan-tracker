const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function localMonthKey(date = new Date()) {
  if (!date || typeof date.getFullYear !== 'function' || typeof date.getMonth !== 'function') return '';

  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return '';

  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(monthKey, offset) {
  const match = typeof monthKey === 'string' ? MONTH_KEY_PATTERN.exec(monthKey) : null;
  if (!match || !Number.isInteger(offset)) return '';

  const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth - year * 12;
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
}
