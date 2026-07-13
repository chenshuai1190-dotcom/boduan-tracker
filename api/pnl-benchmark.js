import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../server/quote/http.js';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBenchmarkSymbol(value) {
  const raw = String(value || 'QQQ').trim().toUpperCase().replace(/\.US$/, '');
  if (!/^[A-Z0-9.-]{1,16}$/.test(raw)) return null;
  return raw;
}

function normalizeDateParam(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function sanitizeClose(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseEodRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = String(row?.date || '').slice(0, 10);
      const adjustedClose = sanitizeClose(row?.adjusted_close);
      const rawClose = sanitizeClose(row?.close);
      const close = adjustedClose ?? rawClose;
      if (!date || close === null) return null;
      return {
        date,
        close,
        rawClose,
        adjustedClose,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const symbol = normalizeBenchmarkSymbol(firstQueryValue(req.query?.symbol));
  if (!symbol) return sendError(res, 400, '基准代码不合法');

  const from = normalizeDateParam(firstQueryValue(req.query?.from));
  const to = normalizeDateParam(firstQueryValue(req.query?.to));
  if (!from || !to) return sendError(res, 400, '缺少合法的 from/to 日期');
  if (from > to) return sendError(res, 400, 'from 日期不能晚于 to 日期');

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    return sendError(res, 500, 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
  }

  const url = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${encodeURIComponent(eodhdKey)}&from=${from}&to=${to}&period=d&fmt=json`;

  try {
    const response = await fetchWithTimeout(url, {}, {
      provider: 'eodhd-pnl-benchmark',
      timeoutMs: QUOTE_TIMEOUTS.eodhd,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return sendError(res, 502, `基准行情请求失败: HTTP ${response.status}`);
    }
    const rows = parseEodRows(payload);
    if (rows.length === 0) {
      return sendError(res, 502, '基准行情没有返回有效收盘价');
    }
    return res.status(200).json({
      success: true,
      symbol,
      from,
      to,
      rows,
      source: 'EODHD_EOD',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, 502, `基准行情请求失败: ${error.message}`);
  }
}
