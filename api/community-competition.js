import { configuredOrigins, authenticateAccessToken } from '../server/quote/auth.js';
import {
  getCommunityCompetitionState,
  joinCommunityCompetition,
} from '../server/communityCompetition.js';

function setCommunityCompetitionCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const origins = configuredOrigins(req);
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
function sendError(res, status, error, state = undefined) {
  const body = { success: false, error };
  if (state) body.state = state;
  return res.status(status).json(body);
}

async function requireCompetitionAuth(req, res) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    sendError(res, 401, '未授权: 请先登录');
    return null;
  }
  const auth = await authenticateAccessToken(authHeader.slice('Bearer '.length));
  if (!auth.ok || !auth.user?.id) {
    sendError(res, auth.status || 401, auth.error || '未授权: 请先登录');
    return null;
  }
  return auth.user;
}

export default async function handler(req, res) {
  setCommunityCompetitionCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const user = await requireCompetitionAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'POST') {
      const result = await joinCommunityCompetition({ userId: user.id });
      return res.status(200).json(result);
    }
    const result = await getCommunityCompetitionState({
      userId: user.id,
      period: req.query?.period || 'day',
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(
      res,
      Number(error?.status) || 500,
      error?.message || '收益比赛服务暂不可用',
      error?.state
    );
  }
}
