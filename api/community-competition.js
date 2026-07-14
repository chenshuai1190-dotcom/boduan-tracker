import { configuredOrigins, authenticateAccessToken } from '../server/quote/auth.js';
import {
  getCommunityCompetitionState,
  joinCommunityCompetition,
} from '../server/communityCompetition.js';
import {
  authorizeCommunityCompetitionDailySnapshot,
  hasExplicitCommunityCompetitionSnapshotDate,
  resolveCommunityCompetitionSnapshotDate,
  runCommunityCompetitionDailySnapshot,
  runCommunityCompetitionScheduledCatchUp,
} from '../server/communityCompetitionDailySnapshot.js';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

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

export async function handleCommunityCompetitionDailySnapshot(
  req,
  res,
  { now = new Date() } = {}
) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = authorizeCommunityCompetitionDailySnapshot(req);
  if (!auth.ok) return sendError(res, auth.status, auth.error);

  try {
    const explicitDate = hasExplicitCommunityCompetitionSnapshotDate(req);
    const targetDate = resolveCommunityCompetitionSnapshotDate(req, now);
    if (!targetDate && !explicitDate) {
      return res.status(200).json({
        success: true,
        mode: 'scheduled_deferred',
        deferred: true,
        reason: 'before_new_york_snapshot_window',
        timeZone: 'America/New_York',
        notBefore: '17:00',
        targetDate: null,
        retryableIncomplete: false,
        failedMembers: 0,
      });
    }
    const result = explicitDate
      ? await runCommunityCompetitionDailySnapshot({
          targetDate,
          now,
          requireTargetCloseConfirmation: true,
        })
      : await runCommunityCompetitionScheduledCatchUp({ targetDate, now });
    if (result.retryableIncomplete) {
      res.setHeader('Retry-After', '300');
      return res.status(503).json(result);
    }
    return res.status(result.failedMembers > 0 ? 500 : 200).json(result);
  } catch (error) {
    return sendError(res, error?.status || 500, error?.message || '收益比赛自动快照失败');
  }
}

export default async function handler(req, res) {
  if (firstQueryValue(req.query?.operation) === 'daily-snapshot') {
    return handleCommunityCompetitionDailySnapshot(req, res);
  }

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
