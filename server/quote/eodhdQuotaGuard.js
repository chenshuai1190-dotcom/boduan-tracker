const EODHD_REST_DOMAINS = Object.freeze([
  'eodhd.com',
  'eodhistoricaldata.com',
]);
export const EODHD_QUOTA_COOLDOWN_MS = 30 * 60 * 1000;

let blockedUntilMs = 0;
let nowImpl = () => Date.now();

function currentTimeMs() {
  const value = Number(nowImpl());
  return Number.isFinite(value) ? value : Date.now();
}

function nextUtcMidnightMs(nowMs) {
  const now = new Date(nowMs);
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
}

function matchesEodhdDomain(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  return EODHD_REST_DOMAINS.some((domain) => (
    normalized === domain || normalized.endsWith(`.${domain}`)
  ));
}

export function isEodhdRestUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(String(value || ''));
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && matchesEodhdDomain(url.hostname);
  } catch {
    return false;
  }
}

export class EodhdQuotaExhaustedError extends Error {
  constructor(blockedUntil) {
    super(`EODHD daily REST quota exhausted until ${blockedUntil}`);
    this.name = 'EodhdQuotaExhaustedError';
    this.code = 'EODHD_DAILY_QUOTA_EXHAUSTED';
    this.status = 402;
    this.blockedUntil = blockedUntil;
  }
}

function activeBlock(nowMs = currentTimeMs()) {
  if (!(blockedUntilMs > nowMs)) {
    blockedUntilMs = 0;
    return null;
  }
  return {
    blockedUntilMs,
    blockedUntil: new Date(blockedUntilMs).toISOString(),
  };
}

export function assertEodhdQuotaAvailable(url) {
  if (!isEodhdRestUrl(url)) return;
  const block = activeBlock();
  if (block) throw new EodhdQuotaExhaustedError(block.blockedUntil);
}

export function recordEodhdQuotaResponse(url, response) {
  if (!isEodhdRestUrl(url) || Number(response?.status) !== 402) return null;
  const nowMs = currentTimeMs();
  const cooldownUntilMs = Math.min(
    nowMs + EODHD_QUOTA_COOLDOWN_MS,
    nextUtcMidnightMs(nowMs),
  );
  blockedUntilMs = Math.max(blockedUntilMs, cooldownUntilMs);
  return activeBlock(nowMs);
}

export function getEodhdQuotaGuardStateForTests() {
  const block = activeBlock();
  return block
    ? { blocked: true, ...block }
    : { blocked: false, blockedUntilMs: 0, blockedUntil: null };
}

export function setEodhdQuotaGuardNowForTests(value) {
  if (typeof value === 'function') {
    nowImpl = value;
    return;
  }
  const fixedTimeMs = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(fixedTimeMs)) throw new TypeError('test time must be finite');
  nowImpl = () => fixedTimeMs;
}

export function resetEodhdQuotaGuardForTests() {
  blockedUntilMs = 0;
  nowImpl = () => Date.now();
}
