import {
  authorizeCommunityCompetitionDailySnapshot,
  resolveCommunityCompetitionSnapshotDate,
  runCommunityCompetitionDailySnapshot,
} from '../server/communityCompetitionDailySnapshot.js';
import { sendError } from '../server/quote/errors.js';

export default async function handler(req, res) {
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
    const targetDate = resolveCommunityCompetitionSnapshotDate(req);
    const result = await runCommunityCompetitionDailySnapshot({ targetDate });
    return res.status(result.failedMembers > 0 ? 500 : 200).json(result);
  } catch (error) {
    return sendError(res, error?.status || 500, error?.message || '收益比赛自动快照失败');
  }
}
