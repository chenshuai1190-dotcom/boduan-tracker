import {
  authorizePnlReportDailySnapshot,
  hasExplicitDailySnapshotTargetDate,
  resolveDailySnapshotTargetDate,
  runPnlReportDailySnapshot,
} from '../server/pnlReportDailySnapshot.js';
import {
  resolveCloseSnapshotSchedule,
  runCloseSnapshotSchedule,
} from '../server/closeSnapshotScheduler.js';
import { publishCommunityCompetitionSnapshotMarker } from '../server/snapshotPublicationMarker.js';
import { sendError } from '../server/quote/errors.js';
import { authenticateAccessToken, configuredOrigins } from '../server/quote/auth.js';
import {
  isPnlReportRecalculationRetryable,
  recalculatePnlReportUser,
} from '../server/pnlReportRecalculation.js';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function setSelfRecalculationCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const origins = configuredOrigins(req);
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export async function handlePnlReportSelfRecalculation(
  req,
  res,
  { now = new Date(), recalculate = recalculatePnlReportUser } = {}
) {
  setSelfRecalculationCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, '未授权: 请先登录');
  }
  const auth = await authenticateAccessToken(authHeader.slice('Bearer '.length));
  if (!auth.ok || !auth.user?.id) {
    return sendError(res, auth.status || 401, auth.error || '未授权: 请先登录');
  }

  try {
    const result = await recalculate({ userId: auth.user.id, now });
    return res.status(200).json({
      success: true,
      state: result.state,
      fromDate: result.fromDate || null,
      throughDate: result.throughDate || null,
      ledgerRevision: Number.isSafeInteger(Number(result.ledgerRevision))
        ? Number(result.ledgerRevision)
        : 0,
      generation: Number.isSafeInteger(Number(result.generation))
        ? Number(result.generation)
        : 0,
      replacedPortfolio: Number(result.replacedPortfolio) || 0,
      replacedSymbols: Number(result.replacedSymbols) || 0,
    });
  } catch (error) {
    const retryable = isPnlReportRecalculationRetryable(error);
    if (retryable) res.setHeader('Retry-After', error?.status === 402 ? '3600' : '60');
    return res.status(retryable ? 503 : 409).json({
      success: false,
      state: retryable ? 'recalculation_pending' : 'ledger_invalid',
      code: retryable ? 'PNL_RECALCULATION_PENDING' : 'PNL_LEDGER_INVALID',
      error: retryable
        ? '交易已保存，个人收益快照将保留旧数据并稍后重算'
        : '正式交易账本暂时无法生成个人收益快照',
    });
  }
}

export async function handlePnlReportDailySnapshot(req, res, { now = new Date() } = {}) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = authorizePnlReportDailySnapshot(req);
  if (!auth.ok) return sendError(res, auth.status, auth.error);

  try {
    const explicitDate = hasExplicitDailySnapshotTargetDate(req);
    const targetDate = resolveDailySnapshotTargetDate(req, now);
    if (!targetDate && !explicitDate) {
      return res.status(200).json({
        success: true,
        complete: true,
        retryable: false,
        deferred: true,
        reason: 'before_new_york_snapshot_window',
        timeZone: 'America/New_York',
        notBefore: '17:00',
        targetDate: null,
      });
    }
    const result = await runPnlReportDailySnapshot({
      targetDate,
      now,
      catchUp: !explicitDate,
    });
    if (!result.complete) {
      if (result.retryable) {
        res.setHeader('Retry-After', '300');
        return res.status(503).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error?.retryable) {
      res.setHeader('Retry-After', '300');
      return sendError(res, 503, '收益报表自动快照暂时失败，请稍后重试');
    }
    if (error?.status === 400) return sendError(res, 400, '目标日期不合法');
    // Never echo REST/provider response bodies or infrastructure details.
    return sendError(res, 500, '收益报表自动快照失败');
  }
}

function publishScheduledCompetitionSnapshot({ targetDate, result }) {
  return publishCommunityCompetitionSnapshotMarker({
    snapshotDate: targetDate,
    // A normal retry that only rereads immutable rows keeps the same opaque
    // version. A real write/metadata repair republishes so active clients can
    // invalidate their cached leaderboard once.
    republish: Number(result?.writtenSnapshots || 0) > 0
      || Number(result?.initializedMembers || 0) > 0
      || Number(result?.rebaselinedMembers || 0) > 0,
  });
}

export async function handleCloseSnapshotSchedule(
  req,
  res,
  { now = new Date(), publishCompetitionSnapshot = publishScheduledCompetitionSnapshot } = {}
) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = authorizePnlReportDailySnapshot(req);
  if (!auth.ok) return sendError(res, auth.status, auth.error);

  try {
    const schedule = resolveCloseSnapshotSchedule(req, now);
    if (!schedule.targetDate) {
      return res.status(200).json({
        success: true,
        complete: true,
        retryable: false,
        deferred: true,
        reason: 'before_new_york_snapshot_window',
        timeZone: 'America/New_York',
        notBefore: '17:00',
        targetDate: null,
      });
    }

    const result = await runCloseSnapshotSchedule({
      ...schedule,
      now,
      publishCompetitionSnapshot,
    });
    if (result.retryable) {
      res.setHeader('Retry-After', '300');
      return res.status(503).json(result);
    }
    return res.status(result.complete ? 200 : 500).json(result);
  } catch (error) {
    if (error?.retryable) {
      res.setHeader('Retry-After', '300');
      return sendError(res, 503, '统一收盘快照暂时失败，请稍后重试');
    }
    if (error?.status === 400) return sendError(res, 400, '目标日期不合法');
    return sendError(res, 500, '统一收盘快照失败');
  }
}

export default async function handler(req, res) {
  if (firstQueryValue(req.query?.operation) === 'recalculate-self') {
    return handlePnlReportSelfRecalculation(req, res);
  }
  if (firstQueryValue(req.query?.operation) === 'close-snapshot-schedule') {
    return handleCloseSnapshotSchedule(req, res);
  }
  return handlePnlReportDailySnapshot(req, res);
}
