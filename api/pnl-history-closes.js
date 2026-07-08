import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../server/quote/http.js';
import { parseSymbolsParam } from '../server/quote/symbols.js';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeDays(value) {
  const n = Number(firstQueryValue(value));
  if (!Number.isFinite(n)) return 8;
  return Math.max(2, Math.min(90, Math.floor(n)));
}

function normalizeEodhdSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\.US$/, '');
}

function parseEodRows(rows, limit) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = String(row?.date || '').slice(0, 10);
      const adjustedClose = Number(row?.adjusted_close);
      const rawClose = Number(row?.close);
      const close = Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : rawClose;
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      return {
        date,
        close,
        adjustedClose: Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);
}

async function fetchSymbolRows(symbol, { eodhdKey, from, to, days }) {
  const eodSymbol = normalizeEodhdSymbol(symbol);
  const url = `https://eodhd.com/api/eod/${encodeURIComponent(eodSymbol)}.US?api_token=${encodeURIComponent(eodhdKey)}&from=${from}&to=${to}&period=d&fmt=json`;
  const response = await fetchWithTimeout(url, {}, {
    provider: 'eodhd-pnl-history',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${symbol} HTTP ${response.status}`);
  }
  const rows = parseEodRows(payload, days);
  if (rows.length === 0) {
    throw new Error(`${symbol} no valid close rows`);
  }
  return [symbol, rows];
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

  const parsed = parseSymbolsParam(firstQueryValue(req.query?.symbols));
  if (parsed.error) return sendError(res, 400, parsed.error);

  const to = normalizeDateParam(firstQueryValue(req.query?.to));
  if (!to) return sendError(res, 400, '缺少合法的 to 日期');
  const days = normalizeDays(req.query?.days);
  const from = shiftDate(to, -Math.max(14, days * 3));
  if (!from) return sendError(res, 400, 'to 日期不合法');

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    return sendError(res, 500, 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
  }

  try {
    const entries = await Promise.all(
      parsed.symbolList.map((symbol) => fetchSymbolRows(symbol, { eodhdKey, from, to, days }))
    );
    return res.status(200).json({
      success: true,
      from,
      to,
      days,
      rowsBySymbol: Object.fromEntries(entries),
      source: 'EODHD_EOD',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, 502, `历史收盘价请求失败: ${error.message}`);
  }
}
