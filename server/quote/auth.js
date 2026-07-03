import { sendError } from './errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './http.js';

export function configuredOrigins(req) {
  const origins = new Set();
  const envOrigins = (process.env.QUOTE_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  envOrigins.forEach(origin => origins.add(origin));
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (req.headers.host) origins.add(`https://${req.headers.host}`);
  origins.add('https://boduan-tracker.vercel.app');
  return origins;
}

export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const origins = configuredOrigins(req);
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export async function requireQuoteAuth(req, res) {
  if (process.env.QUOTE_API_AUTH_REQUIRED === 'false') {
    return { ok: true, user: null };
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    sendError(res, 401, '未授权: 请先登录后再请求行情接口');
    return { ok: false };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    sendError(res, 500, '行情接口认证未配置: 缺少 Supabase URL 或 anon key');
    return { ok: false };
  }

  try {
    const authRes = await fetchWithTimeout(
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      },
      { provider: 'supabase-auth', timeoutMs: QUOTE_TIMEOUTS.auth }
    );
    if (!authRes.ok) {
      sendError(res, 401, '未授权或登录已过期,请重新登录');
      return { ok: false };
    }
    return { ok: true, user: await authRes.json() };
  } catch (e) {
    sendError(res, 503, `认证服务暂不可用: ${e.message}`);
    return { ok: false };
  }
}
