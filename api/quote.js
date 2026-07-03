import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchQuoteForSymbol } from '../server/quote/providerHandlers.js';
import { createQuoteResponse } from '../server/quote/response.js';
import { parseSymbolsParam } from '../server/quote/symbols.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  const authRequired = process.env.QUOTE_API_AUTH_REQUIRED !== 'false';
  res.setHeader(
    'Cache-Control',
    authRequired ? 'private, max-age=15' : 's-maxage=15, stale-while-revalidate=30'
  );

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const { symbols } = req.query;
  const parsed = parseSymbolsParam(symbols);
  if (parsed.error) return sendError(res, 400, parsed.error);

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    return sendError(res, 500, 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
  }

  try {
    const results = await Promise.all(
      parsed.symbolList.map(symbol => fetchQuoteForSymbol(symbol, { eodhdKey }))
    );

    return res.status(200).json(createQuoteResponse(results));
  } catch (e) {
    return sendError(res, 500, e.message);
  }
}
