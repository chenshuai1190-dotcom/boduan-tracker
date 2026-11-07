const KINDS = new Set(['high', 'drawdown', 'record', 'period']);
const METRICS = new Set(['net_assets', 'cumulative_return', 'cumulative_pnl', 'daily_return', 'period_return']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const validId = value => typeof value === 'string' && /^[a-z0-9_:\-.]{1,160}$/i.test(value);
const validDate = value => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const failure = (code, message) => Object.assign(new Error(message), { code });

// This is a stable pointer to an event derived from the account's closing
// snapshots. It never stores an invented account value or changes the ledger.
export function normalizeReviewTimelineReference(value, { strict = false } = {}) {
  if (value == null) return null;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!plain(value) || value.version !== 1 || !validId(value.id)
    || !KINDS.has(value.kind) || !METRICS.has(value.metric) || !validDate(value.date)
    || !title || title.length > 120 || /[\u0000-\u001f\u007f]/u.test(title)) {
    if (strict) throw failure('REVIEW_INVALID_TIMELINE', '时间线事件引用无效，请重新打开记录。');
    return null;
  }
  return { version: 1, id: value.id, kind: value.kind, metric: value.metric, date: value.date, title };
}

export function sameReviewTimelineReference(left, right) {
  const a = normalizeReviewTimelineReference(left), b = normalizeReviewTimelineReference(right);
  return Boolean(a && b && ['id', 'kind', 'metric', 'date'].every(key => a[key] === b[key]));
}

// UUIDv8 uses the first 128 bits of SHA-256 with version/variant bits. Including
// the owner prevents two accounts from reusing a timeline operation identity.
export async function reviewTimelineOperationId(userId, eventId, { digest } = {}) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 160
      || /[\u0000-\u001f\u007f]/u.test(userId) || !validId(eventId)) {
    throw failure('REVIEW_INVALID_TIMELINE', '时间线事件或账户标识无效。');
  }
  const hash = digest || (globalThis.crypto?.subtle
    ? value => globalThis.crypto.subtle.digest('SHA-256', value) : null);
  if (!hash) throw failure('REVIEW_TIMELINE_ID_UNAVAILABLE', '暂时无法生成评价标识，请稍后重试。');
  const input = new TextEncoder().encode(`quote:review-timeline:v1\0${userId}\0${eventId}`);
  const result = await hash(input);
  const bytes = result instanceof Uint8Array ? result.slice(0, 16) : new Uint8Array(result).slice(0, 16);
  if (bytes.length !== 16) throw failure('REVIEW_TIMELINE_ID_UNAVAILABLE', '暂时无法生成评价标识，请稍后重试。');
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
