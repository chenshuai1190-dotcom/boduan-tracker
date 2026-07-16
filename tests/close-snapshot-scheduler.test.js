import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCloseSnapshotSchedule,
  runCloseSnapshotSchedule,
} from '../server/closeSnapshotScheduler.js';
import { handleCloseSnapshotSchedule } from '../api/pnl-report-daily-snapshot.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('unified resolver gives both jobs one New York close target and stays scheduled-only', () => {
  assert.deepEqual(
    resolveCloseSnapshotSchedule({ query: {} }, new Date('2026-07-08T22:30:00Z')),
    { targetDate: '2026-07-08' },
  );
  assert.deepEqual(
    resolveCloseSnapshotSchedule({ query: {} }, new Date('2026-07-08T20:30:00Z')),
    { targetDate: null },
  );
  assert.deepEqual(
    resolveCloseSnapshotSchedule(
      { query: { recoverLatestCompleted: '1' } },
      new Date('2026-07-08T10:30:00Z'),
    ),
    { targetDate: '2026-07-07' },
  );
  assert.deepEqual(
    resolveCloseSnapshotSchedule(
      { query: { recoverLatestCompleted: '0' } },
      new Date('2026-07-08T10:30:00Z'),
    ),
    { targetDate: null },
  );
  assert.throws(
    () => resolveCloseSnapshotSchedule(
      { query: { date: '2026-07-07' } },
      new Date('2026-07-08T22:30:00Z'),
    ),
    /不接受手工目标日期/,
  );
});

test('unified schedule starts independent P&L and competition jobs concurrently', async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const now = new Date('2026-07-08T22:30:00Z');
  const running = runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    now,
    runPnl: async (options) => {
      started.push(['pnl', options]);
      await gate;
      return {
        success: true,
        complete: true,
        retryable: false,
        targetDate: '2026-07-08',
        attemptedUsers: 2,
        writtenUsers: 2,
        generatedAt: now.toISOString(),
      };
    },
    runCompetitionCatchUp: async (options) => {
      started.push(['competition', options]);
      await gate;
      return {
        success: true,
        targetDate: '2026-07-08',
        activeMembers: 3,
        writtenSnapshots: 3,
        existingSnapshots: 0,
        retryableIncomplete: false,
        batchLimited: false,
        failedMembers: 0,
        generatedAt: now.toISOString(),
      };
    },
  });

  await Promise.resolve();
  assert.deepEqual(started.map(([name]) => name).sort(), ['competition', 'pnl']);
  assert.equal(started.find(([name]) => name === 'pnl')[1].catchUp, true);
  assert.deepEqual(started.find(([name]) => name === 'competition')[1], {
    targetDate: '2026-07-08',
    now,
  });
  release();

  const result = await running;
  assert.equal(result.complete, true);
  assert.equal(result.retryable, false);
  assert.equal(result.jobs.pnl.writtenUsers, 2);
  assert.equal(result.jobs.competition.writtenSnapshots, 3);
});

test('unified result fails closed when either independent job is retryable or batch-limited', async () => {
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => ({
      success: true,
      complete: true,
      retryable: false,
      targetDate: '2026-07-08',
    }),
    runCompetitionCatchUp: async () => ({
      success: true,
      targetDate: '2026-07-08',
      retryableIncomplete: false,
      batchLimited: true,
      failedMembers: 0,
    }),
  });

  assert.equal(result.success, false);
  assert.equal(result.complete, false);
  assert.equal(result.retryable, true);
  assert.equal(result.jobs.competition.complete, false);
});

test('a permanent failure wins over a retryable sibling and returns a permanent result', async () => {
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => ({
      success: false,
      complete: false,
      retryable: false,
      targetDate: '2026-07-08',
    }),
    runCompetitionCatchUp: async () => ({
      success: false,
      targetDate: '2026-07-08',
      retryableIncomplete: true,
      failedMembers: 0,
    }),
  });

  assert.equal(result.complete, false);
  assert.equal(result.retryable, false);
  assert.equal(result.permanentFailure, true);
});

test('a permanent competition member failure wins over retryable work in the same batch', async () => {
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => ({
      success: true,
      complete: true,
      retryable: false,
      targetDate: '2026-07-08',
    }),
    runCompetitionCatchUp: async () => ({
      success: false,
      targetDate: '2026-07-08',
      retryableIncomplete: true,
      batchLimited: true,
      failedMembers: 1,
    }),
  });

  assert.equal(result.complete, false);
  assert.equal(result.retryable, false);
  assert.equal(result.permanentFailure, true);
  assert.equal(result.jobs.competition.retryable, false);
  assert.equal(result.jobs.competition.completionPublished, false);
});

test('runner HTTP 503 errors are retryable even when the provider omitted an explicit flag', async () => {
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => {
      const error = new Error('temporarily unavailable');
      error.status = 503;
      throw error;
    },
    runCompetitionCatchUp: async () => ({
      success: true,
      retryableIncomplete: false,
      batchLimited: false,
      failedMembers: 0,
    }),
  });
  assert.equal(result.complete, false);
  assert.equal(result.retryable, true);
  assert.equal(result.permanentFailure, false);
  assert.equal(result.jobs.pnl.retryable, true);
});

test('competition completion publishes immediately without waiting for the independent P&L job', async () => {
  const events = [];
  let releasePnl;
  const pnlGate = new Promise((resolve) => { releasePnl = resolve; });
  const running = runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    now: new Date('2026-07-08T22:30:00Z'),
    runPnl: async () => {
      events.push('pnl-started');
      await pnlGate;
      events.push('pnl-finished');
      return { success: true, complete: true, targetDate: '2026-07-08' };
    },
    runCompetitionCatchUp: async () => {
      events.push('competition');
      return {
        success: true,
        targetDate: '2026-07-08',
        failedMembers: 0,
        retryableIncomplete: false,
        batchLimited: false,
      };
    },
    publishCompetitionSnapshot: async ({ targetDate, result: competitionResult }) => {
      events.push('published');
      assert.equal(targetDate, '2026-07-08');
      assert.equal(competitionResult.success, true);
    },
  });

  while (!events.includes('published')) await Promise.resolve();
  assert.equal(events.includes('pnl-finished'), false);
  releasePnl();
  const result = await running;
  assert.ok(events.indexOf('published') < events.indexOf('pnl-finished'));
  assert.equal(result.jobs.competition.completionPublished, true);
  assert.equal(result.complete, true);
});

test('a retryable P&L failure does not block publication of a completed competition batch', async () => {
  let publicationCalls = 0;
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => {
      const error = new Error('P&L provider temporarily unavailable');
      error.retryable = true;
      throw error;
    },
    runCompetitionCatchUp: async () => ({
      success: true,
      targetDate: '2026-07-08',
      retryableIncomplete: false,
      batchLimited: false,
      failedMembers: 0,
    }),
    publishCompetitionSnapshot: async () => { publicationCalls += 1; },
  });

  assert.equal(publicationCalls, 1);
  assert.equal(result.jobs.competition.completionPublished, true);
  assert.equal(result.jobs.competition.complete, true);
  assert.equal(result.jobs.pnl.complete, false);
  assert.equal(result.complete, false);
  assert.equal(result.retryable, true);
});

test('publisher is skipped for incomplete competition and a transient publish failure is retryable', async () => {
  let incompletePublishCalls = 0;
  const incomplete = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => ({ success: true, complete: true }),
    runCompetitionCatchUp: async () => ({
      success: true,
      retryableIncomplete: false,
      batchLimited: true,
      failedMembers: 0,
    }),
    publishCompetitionSnapshot: async () => { incompletePublishCalls += 1; },
  });
  assert.equal(incompletePublishCalls, 0);
  assert.equal(incomplete.jobs.competition.completionPublished, false);

  const publishFailure = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => ({ success: true, complete: true }),
    runCompetitionCatchUp: async () => ({
      success: true,
      retryableIncomplete: false,
      batchLimited: false,
      failedMembers: 0,
    }),
    publishCompetitionSnapshot: async () => {
      const error = new Error('database unavailable');
      error.status = 503;
      throw error;
    },
  });
  assert.equal(publishFailure.complete, false);
  assert.equal(publishFailure.retryable, true);
  assert.equal(publishFailure.permanentFailure, false);
});

test('legitimate deferred non-ranked cohorts leave exact publication proof to the publisher', async () => {
  let publicationCalls = 0;
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-15',
    runPnl: async () => ({ success: true, complete: true }),
    runCompetitionCatchUp: async () => ({
      success: true,
      targetDate: '2026-07-15',
      activeMembers: 10,
      writtenSnapshots: 9,
      deferredMembers: 1,
      skippedMembers: 0,
      retryableIncomplete: false,
      batchLimited: false,
      failedMembers: 0,
    }),
    publishCompetitionSnapshot: async () => { publicationCalls += 1; },
  });
  assert.equal(publicationCalls, 1);
  assert.equal(result.complete, true);
  assert.equal(result.jobs.competition.completionPublished, true);
});

test('unified response never echoes runner errors, user ids, provider bodies, or secrets', async () => {
  const result = await runCloseSnapshotSchedule({
    targetDate: '2026-07-08',
    runPnl: async () => {
      const error = new Error('user-a service-role-secret provider-body');
      error.retryable = true;
      throw error;
    },
    runCompetitionCatchUp: async () => ({
      success: false,
      targetDate: '2026-07-08',
      retryableIncomplete: false,
      failedMembers: 1,
      failedReasons: { 'user-b cron-secret': 1 },
    }),
  });

  assert.equal(result.complete, false);
  assert.equal(result.retryable, false);
  assert.equal(result.permanentFailure, true);
  assert.doesNotMatch(
    JSON.stringify(result),
    /user-a|user-b|service-role-secret|provider-body|cron-secret|failedReasons/,
  );
});

test('unified cron branch requires CRON_SECRET and defers both jobs before 17:00 New York', async () => {
  const previousSecret = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = 'expected-secret';
    const denied = createResponse();
    await handleCloseSnapshotSchedule({
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret' },
      query: {},
    }, denied, { now: new Date('2026-07-08T22:30:00Z') });
    assert.equal(denied.statusCode, 401);

    const deferred = createResponse();
    await handleCloseSnapshotSchedule({
      method: 'GET',
      headers: { authorization: 'Bearer expected-secret' },
      query: {},
    }, deferred, { now: new Date('2026-07-08T20:30:00Z') });
    assert.equal(deferred.statusCode, 200);
    assert.equal(deferred.body.deferred, true);
    assert.equal(deferred.body.targetDate, null);
  } finally {
    restoreEnv('CRON_SECRET', previousSecret);
  }
});

test('the production unified handler injects the durable competition publisher', async () => {
  const source = await import('node:fs/promises')
    .then(({ readFile }) => readFile(new URL('../api/pnl-report-daily-snapshot.js', import.meta.url), 'utf8'));
  assert.match(source, /publishCommunityCompetitionSnapshotMarker/);
  assert.match(source, /publishCompetitionSnapshot,/);
  assert.match(source, /snapshotDate:\s*targetDate/);
});
