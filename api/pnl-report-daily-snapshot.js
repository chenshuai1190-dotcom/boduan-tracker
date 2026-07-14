import {
  authorizePnlReportDailySnapshot,
  hasExplicitDailySnapshotTargetDate,
  resolveDailySnapshotTargetDate,
  runPnlReportDailySnapshot,
} from '../server/pnlReportDailySnapshot.js';
import { sendError } from '../server/quote/errors.js';

export default async function handler(req, res) {
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
    const targetDate = resolveDailySnapshotTargetDate(req);
    const result = await runPnlReportDailySnapshot({
      targetDate,
      catchUp: !hasExplicitDailySnapshotTargetDate(req),
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
    // Never echo REST/provider response bodies or infrastructure details.
    return sendError(res, 500, '收益报表自动快照失败');
  }
}
