import { EARNINGS_DETAIL_PARSER_VERSION } from '../../src/lib/earningsDetailPolicy.js';
import { parseEarningsDetailRequest } from './secEarningsDetail.js';

export function secEarningsAutoCoverageEnabled(env = process.env) {
  return env.SEC_EARNINGS_AUTO_COVERAGE_ENABLED === 'true';
}

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function normalizeCoverageEvent(event) {
  const parsed = parseEarningsDetailRequest({
    symbol: event?.symbol,
    fiscalDate: event?.fiscalDate || event?.provider_fiscal_date,
    providerFiscalDate: event?.providerFiscalDate || event?.provider_fiscal_date || event?.fiscalDate,
    officialFiscalDate: event?.officialFiscalDate || event?.official_fiscal_date || undefined,
    reportDate: event?.reportDate || event?.report_date,
  });
  return parsed.error ? null : parsed;
}

export function coverageEventRow(event) {
  const parsed = normalizeCoverageEvent(event);
  if (!parsed) return null;
  return {
    symbol: parsed.symbol,
    provider_fiscal_date: parsed.providerFiscalDate,
    official_fiscal_date: parsed.officialFiscalDate,
    report_date: parsed.reportDate,
  };
}

export function createSecEarningsCoverageRepository({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const rawBase = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  let base;
  try { base = new URL(rawBase); } catch { throw failure('sec-coverage-not-configured'); }
  if (!key || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw failure('sec-coverage-not-configured');
  }
  async function request(path, body) {
    let response;
    try {
      response = await fetchFn(new URL(`/rest/v1/${path}`, base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(4000),
        redirect: 'error',
      });
      if (!response.ok) throw failure('sec-coverage-store-unavailable');
      const text = await response.text();
      if (Buffer.byteLength(text) > 12 * 1024 * 1024) throw failure('sec-coverage-store-invalid-response');
      return text ? JSON.parse(text) : null;
    } catch (error) {
      throw failure(error?.code?.startsWith('sec-coverage-') ? error.code : 'sec-coverage-store-unavailable');
    }
  }
  function query(table, symbol, params = {}) {
    if (!/^[A-Z0-9.-]{1,15}$/.test(symbol)) throw failure('sec-coverage-invalid-symbol');
    return `${table}?${new URLSearchParams({ symbol: `eq.${symbol}`, parser_version: `eq.${EARNINGS_DETAIL_PARSER_VERSION}`, ...params })}`;
  }
  return {
    async register(userId, events) {
      if (!/^[0-9a-f-]{36}$/i.test(userId || '')) throw failure('sec-coverage-auth-required');
      const rows = events.map(coverageEventRow).filter(Boolean).slice(0, 100);
      if (!rows.length) return { registered: 0 };
      return request('rpc/register_sec_earnings_requested_events', {
        p_user_id: userId, p_events: rows, p_parser_version: EARNINGS_DETAIL_PARSER_VERSION,
      });
    },
    async claim(limit = 12) {
      if (!Number.isInteger(limit) || limit < 1) throw failure('sec-coverage-invalid-limit');
      const rows = await request('rpc/claim_sec_earnings_watch_jobs', { p_limit: Math.max(1, Math.min(12, limit)), p_lease_seconds: 90 });
      if (!Array.isArray(rows) || rows.length > Math.min(limit, 12) || rows.some((row) => (
        !/^[A-Z0-9.-]{1,15}$/.test(row.symbol || '') || !/^[0-9a-f-]{36}$/i.test(row.lease_token || '')
      ))) throw failure('sec-coverage-store-invalid-response');
      return rows;
    },
    async inputs(symbol, today) {
      const [events, results] = await Promise.all([
        request(query('sec_earnings_requested_events', symbol, { select: 'symbol,provider_fiscal_date,official_fiscal_date,report_date,status,reason', report_date: `lte.${today}`, order: 'report_date.desc,provider_fiscal_date.desc', limit: '2' })),
        this.results(symbol),
      ]);
      if (!Array.isArray(events) || events.length > 2) throw failure('sec-coverage-store-invalid-response');
      return { events, results };
    },
    async results(symbol) {
      const rows = await request(query('sec_earnings_shared_results', symbol, { select: 'symbol,official_fiscal_date,cik,accession,document_type,parser_version,payload,checked_at,expires_at', order: 'official_fiscal_date.desc,checked_at.desc', limit: '8' }));
      if (!Array.isArray(rows) || rows.length > 8) throw failure('sec-coverage-store-invalid-response');
      return rows;
    },
    async complete(job, { status, reason = null, delaySeconds = 21600, results = [], events = [] }) {
      return request('rpc/complete_sec_earnings_watch_job', {
        p_symbol: job.symbol, p_lease_token: job.lease_token, p_parser_version: EARNINGS_DETAIL_PARSER_VERSION,
        p_status: status, p_reason: reason, p_next_delay_seconds: delaySeconds,
        p_results: results, p_events: events,
      });
    },
  };
}
