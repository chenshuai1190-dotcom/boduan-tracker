import { fetchSecEarningsDetail } from '../server/earnings/secEarningsDetail.js';
import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';

const SUPPORTED_SYMBOLS = new Set(['GOOG', 'GOOGL', 'TSLA']);
const MAX_REPORT_DELAY_DAYS = 180;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const parsed = parseEarningsDetailRequest(req.query);
  if (parsed.error) return sendError(res, 400, parsed.error);

  try {
    const detail = await fetchSecEarningsDetail(parsed);
    res.setHeader(
      'Cache-Control',
      detail.status === 'complete' || detail.status === 'partial'
        ? 'private, max-age=21600, stale-while-revalidate=1800'
        : 'private, max-age=300',
    );
    return res.status(200).json({
      success: true,
      ...detail,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return sendError(res, 502, '财报详情读取失败');
  }
}

export function parseEarningsDetailRequest(query = {}) {
  const rawSymbol = singleQueryValue(query.symbol);
  if (!rawSymbol) return { error: '需要传 symbol 参数' };

  const symbol = normalizeSymbol(rawSymbol);
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return { error: `股票代码不合法: ${String(rawSymbol).trim()}` };
  }
  if (!SUPPORTED_SYMBOLS.has(symbol)) {
    return { error: `暂不支持该财报详情: ${String(rawSymbol).trim()}` };
  }
  const rawFiscalDate = singleQueryValue(query.fiscalDate);
  const rawReportDate = singleQueryValue(query.reportDate);
  if (!rawFiscalDate) return { error: '需要传 fiscalDate 参数' };
  if (!rawReportDate) return { error: '需要传 reportDate 参数' };
  const fiscalDate = validDateKey(rawFiscalDate);
  if (!fiscalDate || !isQuarterEnd(fiscalDate)) {
    return { error: 'fiscalDate 必须是有效财季结束日期' };
  }
  const reportDate = validDateKey(rawReportDate);
  if (!reportDate) return { error: 'reportDate 必须是有效日期' };

  const reportDelayDays = daysBetween(fiscalDate, reportDate);
  if (reportDelayDays < 0 || reportDelayDays > MAX_REPORT_DELAY_DAYS) {
    return { error: 'reportDate 与 fiscalDate 不匹配' };
  }
  return { symbol, fiscalDate, reportDate };
}

function singleQueryValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || '').trim() : '';
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function validDateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function isQuarterEnd(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const expected = new Date(Date.UTC(
    date.getUTCFullYear(),
    Math.floor(date.getUTCMonth() / 3) * 3 + 3,
    0,
  ));
  return date.getTime() === expected.getTime();
}

function daysBetween(from, to) {
  return Math.round((
    new Date(`${to}T00:00:00.000Z`).getTime()
    - new Date(`${from}T00:00:00.000Z`).getTime()
  ) / 86400000);
}
