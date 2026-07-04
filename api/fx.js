import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchDailyFxRates } from '../server/fx/rates.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    return sendError(res, 500, 'API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
  }

  try {
    const fx = await fetchDailyFxRates({ eodhdKey });
    return res.status(200).json({
      success: true,
      ...fx,
    });
  } catch (e) {
    return sendError(res, 502, `汇率请求失败: ${e.message}`);
  }
}
