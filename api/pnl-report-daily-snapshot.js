import {
  authorizePnlReportDailySnapshot,
  hasExplicitDailySnapshotTargetDate,
  resolveDailySnapshotTargetDate,
  runPnlReportDailySnapshot,
} from '../server/pnlReportDailySnapshot.js';
import { sendError } from '../server/quote/errors.js';

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

export default async function handler(req, res) {
  return handlePnlReportDailySnapshot(req, res);
}
