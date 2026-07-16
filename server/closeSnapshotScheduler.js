import {
  hasExplicitCommunityCompetitionSnapshotDate,
  resolveCommunityCompetitionSnapshotDate,
  runCommunityCompetitionScheduledCatchUp,
} from './communityCompetitionDailySnapshot.js';
import {
  hasExplicitDailySnapshotTargetDate,
  resolveDailySnapshotTargetDate,
  runPnlReportDailySnapshot,
} from './pnlReportDailySnapshot.js';
import { latestCompletedUsTradingDate } from '../src/lib/pnlReportSnapshots.js';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function isoTimestamp(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizedDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function summarizePnlResult(result, fallbackTargetDate) {
  return {
    success: Boolean(result?.success),
    complete: Boolean(result?.complete),
    retryable: Boolean(result?.retryable),
    targetDate: normalizedDate(result?.targetDate) || fallbackTargetDate,
    attemptedUsers: nonNegativeInteger(result?.attemptedUsers),
    writtenUsers: nonNegativeInteger(result?.writtenUsers),
    skippedUsers: nonNegativeInteger(result?.skippedUsers),
    failedUsers: nonNegativeInteger(result?.failedUsers),
    generatedAt: isoTimestamp(result?.generatedAt),
  };
}

function summarizeCompetitionResult(result, fallbackTargetDate) {
  const failedMembers = nonNegativeInteger(result?.failedMembers);
  // The snapshot runner counts retryable incompletes separately from permanent
  // member failures. If both occur in one batch, the permanent failure must win
  // so the protected endpoint does not advertise an endless retry as sufficient.
  const retryable = failedMembers === 0
    && Boolean(result?.retryableIncomplete || result?.batchLimited);
  // Deferred members can be legitimate not-yet-ranked cohorts. The durable
  // publisher performs the exact target-date cohort proof; only that database
  // truth may reject an otherwise operationally successful run as incomplete.
  const complete = Boolean(result?.success) && failedMembers === 0 && !retryable;
  return {
    success: complete,
    complete,
    retryable,
    targetDate: normalizedDate(result?.targetDate) || fallbackTargetDate,
    activeMembers: nonNegativeInteger(result?.activeMembers),
    writtenSnapshots: nonNegativeInteger(result?.writtenSnapshots),
    existingSnapshots: nonNegativeInteger(result?.existingSnapshots),
    failedMembers,
    generatedAt: isoTimestamp(result?.generatedAt),
  };
}

function failedJobSummary(error) {
  return {
    success: false,
    complete: false,
    retryable: retryableError(error),
    targetDate: null,
  };
}

function retryableError(error) {
  if (typeof error?.retryable === 'boolean') return error.retryable;
  const status = Number(error?.status) || 0;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

async function settleJob(run) {
  try {
    return { ok: true, result: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function resolveCloseSnapshotSchedule(req, now = new Date()) {
  const pnlExplicit = hasExplicitDailySnapshotTargetDate(req);
  const competitionExplicit = hasExplicitCommunityCompetitionSnapshotDate(req);
  // Keep historical repairs on the existing independent endpoints. The shared
  // entry is scheduled-only so one manual request cannot unexpectedly repair
  // both ledgers.
  if (pnlExplicit || competitionExplicit) {
    const error = new Error('统一收盘快照不接受手工目标日期');
    error.status = 400;
    throw error;
  }

  const pnlTargetDate = resolveDailySnapshotTargetDate(req, now);
  const competitionTargetDate = resolveCommunityCompetitionSnapshotDate(req, now);
  if (pnlTargetDate !== competitionTargetDate) {
    const error = new Error('统一收盘快照目标日期不一致');
    error.status = 500;
    throw error;
  }

  // The late-retry Cron is also the service-only operational recovery path.
  // A manual Vercel invocation before 17:00 ET may repair only the latest
  // already-completed US session; it still cannot select an arbitrary date.
  // Normal scheduled runs remain unchanged, and every write stays idempotent.
  const recoverLatestCompleted = firstQueryValue(
    req?.query?.recoverLatestCompleted
  ) === '1';
  if (!pnlTargetDate && recoverLatestCompleted) {
    return { targetDate: latestCompletedUsTradingDate(now) };
  }

  return {
    targetDate: pnlTargetDate,
  };
}

export async function runCloseSnapshotSchedule({
  targetDate,
  now = new Date(),
  runPnl = runPnlReportDailySnapshot,
  runCompetitionCatchUp = runCommunityCompetitionScheduledCatchUp,
  publishCompetitionSnapshot = null,
} = {}) {
  const safeTargetDate = normalizedDate(targetDate);
  if (!safeTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }

  // Start both independent jobs in the same invocation. Neither runner shares
  // tables or state with the other; their existing ledger, D1/D2 and CAS rules
  // remain authoritative.
  const competitionJob = settleJob(() => (
    runCompetitionCatchUp({ targetDate: safeTargetDate, now })
  )).then(async (outcome) => {
    const summary = outcome.ok
      ? summarizeCompetitionResult(outcome.result, safeTargetDate)
      : failedJobSummary(outcome.error);
    const publication = {
      required: typeof publishCompetitionSnapshot === 'function',
      complete: true,
      published: false,
      retryable: false,
    };
    // Publish as soon as the competition batch itself is complete. Do not wait
    // for the independent P&L job: a slow or timed-out P&L rebuild must not
    // delay an already-authoritative leaderboard.
    if (summary.complete && typeof publishCompetitionSnapshot === 'function') {
      try {
        await publishCompetitionSnapshot({
          targetDate: safeTargetDate,
          generatedAt: summary.generatedAt
            || (now instanceof Date ? now : new Date(now)).toISOString(),
          result: outcome.result,
        });
        publication.published = true;
      } catch (error) {
        publication.complete = false;
        publication.retryable = retryableError(error);
      }
    }
    return { outcome, summary, publication };
  });

  const [pnlOutcome, competitionJobResult] = await Promise.all([
    settleJob(() => runPnl({
      targetDate: safeTargetDate,
      now,
      catchUp: true,
    })),
    competitionJob,
  ]);

  const pnl = pnlOutcome.ok
    ? summarizePnlResult(pnlOutcome.result, safeTargetDate)
    : failedJobSummary(pnlOutcome.error);
  const competition = competitionJobResult.summary;
  const publication = competitionJobResult.publication;

  const complete = pnl.complete && competition.complete && publication.complete;
  const permanentFailure = [pnl, competition, publication]
    .some((job) => !job.complete && !job.retryable);
  const retryable = !complete
    && !permanentFailure
    && (pnl.retryable || competition.retryable || publication.retryable);

  return {
    success: complete,
    complete,
    retryable,
    permanentFailure: !complete && permanentFailure,
    targetDate: safeTargetDate,
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    jobs: {
      pnl,
      competition: {
        ...competition,
        completionPublished: publication.published,
      },
    },
  };
}
