import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompetitionLeaderboard,
  calculateBenchmarkReturn,
  calculateBenchmarkReturnFromStart,
  calculateCompetitionReturn,
  competitionPeriodStartDate,
  normalizeCompetitionPeriod,
} from '../server/communityCompetitionModel.js';

test('competition periods use calendar day, Monday week, month, and year boundaries', () => {
  assert.equal(normalizeCompetitionPeriod('week'), 'week');
  assert.equal(normalizeCompetitionPeriod('quarter'), null);
  assert.equal(competitionPeriodStartDate('day', '2026-07-08'), '2026-07-08');
  assert.equal(competitionPeriodStartDate('week', '2026-07-08'), '2026-07-06');
  assert.equal(competitionPeriodStartDate('week', '2026-07-12'), '2026-07-06');
  assert.equal(competitionPeriodStartDate('month', '2026-07-08'), '2026-07-01');
  assert.equal(competitionPeriodStartDate('year', '2026-07-08'), '2026-01-01');
});

test('first eligible close counts from the baseline captured before that close', () => {
  const member = {
    user_id: 'user-a',
    status: 'active',
    ranking_start_snapshot_date: '2026-07-06',
    ranking_baseline_return_pct: 0.1,
  };
  const snapshots = [
    { user_id: 'user-a', snapshot_date: '2026-07-06', daily_return_pct: 0.02, cumulative_return_pct: 0.12, locked_at: '2026-07-06T22:45:00Z' },
    { user_id: 'user-a', snapshot_date: '2026-07-07', daily_return_pct: 0.03, cumulative_return_pct: 0.15, locked_at: '2026-07-07T22:45:00Z' },
    { user_id: 'user-a', snapshot_date: '2026-07-08', daily_return_pct: -0.01, cumulative_return_pct: 0.14, locked_at: '2026-07-08T22:45:00Z' },
  ];

  const daily = calculateCompetitionReturn({ snapshots, member, period: 'day', asOfDate: '2026-07-08' });
  const weekly = calculateCompetitionReturn({ snapshots, member, period: 'week', asOfDate: '2026-07-08' });

  assert.equal(daily.returnPct, -0.01);
  assert.ok(Math.abs(weekly.returnPct - (1.14 / 1.1 - 1)) < 1e-12);
  assert.equal(weekly.calculationStartDate, '2026-07-06');
  assert.deepEqual(weekly.trend.map((point) => point.date), ['2026-07-06', '2026-07-07', '2026-07-08']);
});

test('month return uses the last locked close before the calendar boundary', () => {
  const result = calculateCompetitionReturn({
    member: {
      user_id: 'user-a',
      status: 'active',
      ranking_start_snapshot_date: '2026-06-10',
      ranking_baseline_return_pct: 0,
    },
    period: 'month',
    asOfDate: '2026-07-08',
    snapshots: [
      { user_id: 'user-a', snapshot_date: '2026-06-30', cumulative_return_pct: 0.3, locked_at: '2026-06-30T22:45:00Z' },
      { user_id: 'user-a', snapshot_date: '2026-07-08', cumulative_return_pct: 0.35, locked_at: '2026-07-08T22:45:00Z' },
    ],
  });
  assert.ok(Math.abs(result.returnPct - (1.35 / 1.3 - 1)) < 1e-12);
  assert.equal(result.calculationStartDate, '2026-07-01');
});

test('benchmark uses real close-to-close data and returns null when baseline is missing', () => {
  const benchmark = calculateBenchmarkReturn({
    period: 'day',
    asOfDate: '2026-07-08',
    rows: [
      { date: '2026-07-07', adjusted_close: 500 },
      { date: '2026-07-08', adjusted_close: 505 },
    ],
  });
  assert.ok(Math.abs(benchmark.returnPct - 0.01) < 1e-12);
  assert.equal(benchmark.trend[0].date, '2026-07-08');
  assert.ok(Math.abs(benchmark.trend[0].value - 0.01) < 1e-12);

  const missing = calculateBenchmarkReturn({
    period: 'day',
    asOfDate: '2026-07-08',
    rows: [{ date: '2026-07-08', close: 505 }],
  });
  assert.equal(missing.returnPct, null);
  assert.deepEqual(missing.trend, []);

  const laterStart = calculateBenchmarkReturnFromStart({
    calculationStartDate: '2026-07-08',
    asOfDate: '2026-07-09',
    rows: [
      { date: '2026-07-07', close: 100 },
      { date: '2026-07-08', close: 110 },
      { date: '2026-07-09', close: 121 },
    ],
  });
  assert.ok(Math.abs(laterStart.returnPct - 0.21) < 1e-12);
});

test('leaderboard ranks only completed profiles and exposes only public holding symbols', () => {
  const members = [
    { user_id: 'user-a', status: 'active', ranking_start_snapshot_date: '2026-07-08', ranking_baseline_return_pct: 0.1 },
    { user_id: 'user-b', status: 'active', ranking_start_snapshot_date: '2026-07-08', ranking_baseline_return_pct: 0.2 },
    { user_id: 'user-c', status: 'active', ranking_start_snapshot_date: '2026-07-08', ranking_baseline_return_pct: 0 },
  ];
  const profiles = [
    { user_id: 'user-a', nickname: 'Alpha', avatar_key: 'avatar-gold', profile_completed_at: '2026-07-01T00:00:00Z', email: 'alpha@example.com' },
    { user_id: 'user-b', nickname: 'Beta', avatar_key: 'avatar-blue', profile_completed_at: '2026-07-01T00:00:00Z' },
    { user_id: 'user-c', nickname: 'Unconfirmed', avatar_key: 'avatar-red', profile_completed_at: null },
  ];
  const snapshots = [
    { user_id: 'user-a', snapshot_date: '2026-07-08', daily_return_pct: 0.02, cumulative_return_pct: 0.12, locked_at: '2026-07-08T22:45:00Z', market_value_usd: 999999 },
    { user_id: 'user-b', snapshot_date: '2026-07-08', daily_return_pct: 0.04, cumulative_return_pct: 0.24, locked_at: '2026-07-08T22:45:00Z' },
    { user_id: 'user-c', snapshot_date: '2026-07-08', daily_return_pct: 0.9, cumulative_return_pct: 0.9, locked_at: '2026-07-08T22:45:00Z' },
  ];

  const result = buildCompetitionLeaderboard({
    members,
    profiles,
    snapshots,
    period: 'day',
    asOfDate: '2026-07-08',
    benchmarkRows: [
      { date: '2026-07-07', close: 100 },
      { date: '2026-07-08', close: 101 },
    ],
    holdingSymbolsByUser: new Map([
      ['user-a', ['NVDA', 'MSFT', 'NVDA']],
      ['user-b', []],
    ]),
    selfUserId: 'user-a',
  });

  assert.deepEqual(result.leaders.map((row) => row.nickname), ['Beta', 'Alpha']);
  assert.equal(result.self.rank, 2);
  assert.equal(result.self.returnPct, 0.02);
  assert.ok(Math.abs(result.self.outperformancePct - 0.01) < 1e-12);
  assert.equal(result.stats.participants, 2);
  assert.equal(result.stats.joinedParticipants, 2);
  assert.equal(result.stats.rankedParticipants, 2);
  assert.equal(result.stats.beatRatePct, 1);
  assert.equal(result.stats.profitableRatePct, 1);
  assert.deepEqual(result.self.holdingSymbols, ['MSFT', 'NVDA']);
  assert.deepEqual(result.leaders[0].holdingSymbols, []);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /user-a|user-b|user-c|example\.com|market_value|shares|price|amount|trade|_usd/i);
});

test('annual leaderboard preserves personal starts and uses one calendar-YTD QQQ comparator', () => {
  const input = {
    members: [
      { user_id: 'veteran', status: 'active', ranking_start_snapshot_date: '2026-07-13', ranking_baseline_return_pct: 0 },
      { user_id: 'newcomer', status: 'active', ranking_start_snapshot_date: '2026-07-15', ranking_baseline_return_pct: 0 },
    ],
    profiles: [
      { user_id: 'veteran', nickname: 'Veteran', avatar_key: 'avatar-gold', profile_completed_at: '2026-07-01T00:00:00Z' },
      { user_id: 'newcomer', nickname: 'Newcomer', avatar_key: 'avatar-blue', profile_completed_at: '2026-07-15T00:00:00Z' },
    ],
    snapshots: [
      { user_id: 'veteran', snapshot_date: '2026-07-13', daily_return_pct: 0.005, cumulative_return_pct: 0.005, locked_at: '2026-07-13T22:00:00Z' },
      { user_id: 'veteran', snapshot_date: '2026-07-15', daily_return_pct: 0.005, cumulative_return_pct: 0.01, locked_at: '2026-07-15T22:00:00Z' },
      { user_id: 'newcomer', snapshot_date: '2026-07-15', daily_return_pct: 0.015, cumulative_return_pct: 0.015, locked_at: '2026-07-15T22:00:00Z' },
    ],
    period: 'year',
    asOfDate: '2026-07-15',
    benchmarkRows: [
      { date: '2025-12-31', adjusted_close: 90, close: 120 },
      { date: '2026-07-10', close: 100 },
      { date: '2026-07-13', close: 98 },
      { date: '2026-07-15', close: 99 },
    ],
  };
  const newcomerView = buildCompetitionLeaderboard({ ...input, selfUserId: 'newcomer' });
  const veteranView = buildCompetitionLeaderboard({ ...input, selfUserId: 'veteran' });

  const annualQqq = 99 / 90 - 1;
  assert.deepEqual(newcomerView.leaders.map((row) => row.nickname), ['Newcomer', 'Veteran']);
  assert.ok(newcomerView.leaders[0].returnPct > newcomerView.leaders[1].returnPct, 'a shared benchmark produces the same order as personal return');
  assert.ok(Math.abs(newcomerView.leaders[0].outperformancePct - (0.015 - annualQqq)) < 1e-12);
  assert.ok(Math.abs(newcomerView.leaders[1].outperformancePct - (0.01 - annualQqq)) < 1e-12);
  assert.equal(newcomerView.self.rank, 1);
  assert.equal(newcomerView.selfCalculationStartDate, '2026-07-15');
  assert.ok(Math.abs(newcomerView.selfBenchmarkReturnPct - annualQqq) < 1e-12);
  assert.equal(newcomerView.selfBenchmarkCalculationStartDate, '2026-01-01');
  assert.equal(veteranView.selfCalculationStartDate, '2026-07-13');
  assert.ok(Math.abs(veteranView.selfBenchmarkReturnPct - annualQqq) < 1e-12);
  assert.equal(veteranView.selfBenchmarkCalculationStartDate, '2026-01-01');
  assert.deepEqual(newcomerView.selfTrend.map((point) => point.date), ['2026-07-15']);
  assert.ok(Math.abs(newcomerView.self.returnPct - 0.015) < 1e-12);
  assert.deepEqual(newcomerView.selfBenchmarkTrend, veteranView.selfBenchmarkTrend);
  assert.equal(newcomerView.selfCalculationAvailable, true);
  assert.equal(newcomerView.stats.participants, 2);
});

test('equal QQQ outperformance uses standard competition ranks with the next place skipped', () => {
  const members = ['user-a', 'user-b', 'user-c'].map((userId) => ({
    user_id: userId,
    status: 'active',
    ranking_start_snapshot_date: '2026-07-08',
    ranking_baseline_return_pct: 0,
  }));
  const profiles = [
    ['user-a', 'Alpha'],
    ['user-b', 'Beta'],
    ['user-c', 'Gamma'],
  ].map(([userId, nickname]) => ({
    user_id: userId,
    nickname,
    avatar_key: 'avatar-gold',
    profile_completed_at: '2026-07-01T00:00:00Z',
  }));
  const snapshots = [
    ['user-a', 0.05],
    ['user-b', 0.05],
    ['user-c', 0.02],
  ].map(([userId, dailyReturnPct]) => ({
    user_id: userId,
    snapshot_date: '2026-07-08',
    daily_return_pct: dailyReturnPct,
    cumulative_return_pct: dailyReturnPct,
    locked_at: '2026-07-08T22:45:00Z',
  }));

  const result = buildCompetitionLeaderboard({
    members,
    profiles,
    snapshots,
    period: 'day',
    asOfDate: '2026-07-08',
    benchmarkRows: [
      { date: '2026-07-07', close: 100 },
      { date: '2026-07-08', close: 101 },
    ],
    selfUserId: 'user-b',
  });

  assert.deepEqual(result.leaders.map((row) => row.rank), [1, 1, 3]);
  assert.equal(result.self.rank, 1);
});

function buildSingleMemberInput({ asOfDate = '2026-07-16', start = '2026-07-15', baseline = 0.1 } = {}) {
  return {
    members: [{ user_id: 'test-member', status: 'active', ranking_start_snapshot_date: start, ranking_baseline_return_pct: baseline }],
    profiles: [{ user_id: 'test-member', nickname: 'Member', avatar_key: 'avatar-blue', profile_completed_at: '2026-01-01T00:00:00Z' }],
    snapshots: [
      { user_id: 'test-member', snapshot_date: '2026-07-01', cumulative_return_pct: 0.9, daily_return_pct: 0.2, locked_at: '2026-07-01T22:00:00Z' },
      { user_id: 'test-member', snapshot_date: asOfDate, cumulative_return_pct: 0.144, daily_return_pct: 0.01, locked_at: `${asOfDate}T22:00:00Z` },
    ],
    asOfDate,
    selfUserId: 'test-member',
    benchmarkRows: [
      { date: '2025-12-31', adjusted_close: 80 },
      { date: '2026-06-30', adjusted_close: 90 },
      { date: '2026-07-10', adjusted_close: 95 },
      { date: '2026-07-14', adjusted_close: 100 },
      { date: '2026-07-15', adjusted_close: 101.25 },
      { date: '2026-07-16', adjusted_close: 103 },
    ],
  };
}

test('day, week and month retain their existing personal-period benchmarks after the annual change', () => {
  const input = buildSingleMemberInput();
  const original = structuredClone(input);
  for (const period of ['day', 'week', 'month']) {
    const result = buildCompetitionLeaderboard({ ...input, period });
    const expectedStart = period === 'day' ? '2026-07-16' : '2026-07-15';
    const expectedQqq = period === 'day' ? 103 / 101.25 - 1 : 103 / 100 - 1;
    const expectedReturn = period === 'day' ? 0.01 : 1.144 / 1.1 - 1;
    assert.equal(result.selfCalculationStartDate, expectedStart);
    assert.equal(result.selfBenchmarkCalculationStartDate, expectedStart);
    assert.equal(result.selfBenchmarkReturnPct, expectedQqq);
    assert.equal(result.self.returnPct, expectedReturn);
    assert.equal(result.self.outperformancePct, expectedReturn - expectedQqq);
  }
  assert.deepEqual(input, original, 'presentation scope must never alter source snapshots or closes');
});

test('annual late join retains the verified personal baseline and ignores pre-join snapshots', () => {
  const input = buildSingleMemberInput();
  const result = buildCompetitionLeaderboard({ ...input, period: 'year' });
  assert.equal(result.selfCalculationStartDate, '2026-07-15');
  assert.equal(result.selfBenchmarkCalculationStartDate, '2026-01-01');
  assert.equal(result.self.returnPct, 1.144 / 1.1 - 1);
  assert.equal(result.selfBenchmarkReturnPct, 103 / 80 - 1);
  assert.deepEqual(result.selfTrend.map(point => point.date), ['2026-07-16']);
  assert.deepEqual(result.selfBenchmarkTrend.map(point => point.date), ['2026-06-30', '2026-07-10', '2026-07-14', '2026-07-15', '2026-07-16']);
});

test('annual QQQ resets at the calendar year boundary using raw adjusted closes and no future rows', () => {
  const input = buildSingleMemberInput({ start: '2026-07-01', baseline: 0 });
  input.snapshots = [
    { user_id: 'test-member', snapshot_date: '2026-12-31', cumulative_return_pct: .4, locked_at: '2026-12-31T22:00:00Z' },
    { user_id: 'test-member', snapshot_date: '2027-01-04', cumulative_return_pct: .47, locked_at: '2027-01-04T22:00:00Z' },
    { user_id: 'test-member', snapshot_date: '2027-01-05', cumulative_return_pct: .9, locked_at: '2027-01-05T22:00:00Z' },
  ];
  input.benchmarkRows = [
    { date: '2025-12-31', adjusted_close: 100, close: 600 },
    { date: '2026-12-30', adjusted_close: 199.987654, close: 800 },
    { date: '2026-12-31', adjusted_close: 200.123456, close: 900 },
    { date: '2027-01-04', adjusted_close: 210.9876541, close: 1000 },
    { date: '2027-01-05', adjusted_close: 500, close: 2000 },
  ];
  const before = buildCompetitionLeaderboard({ ...input, period: 'year', asOfDate: '2026-12-31' });
  assert.equal(before.selfBenchmarkCalculationStartDate, '2026-01-01');
  assert.equal(before.selfCalculationStartDate, '2026-07-01');
  assert.equal(before.selfBenchmarkReturnPct, 200.123456 / 100 - 1);
  const after = buildCompetitionLeaderboard({ ...input, period: 'year', asOfDate: '2027-01-04' });
  assert.equal(after.selfBenchmarkCalculationStartDate, '2027-01-01');
  assert.equal(after.selfCalculationStartDate, '2027-01-01');
  assert.equal(after.selfBenchmarkReturnPct, 210.9876541 / 200.123456 - 1);
  assert.equal(after.self.returnPct, 1.47 / 1.4 - 1);
  assert.deepEqual(after.selfBenchmarkTrend.map(point => point.date), ['2027-01-04']);
  assert.deepEqual(after.selfTrend.map(point => point.date), ['2027-01-04']);
});

test('annual QQQ requires a previous-year baseline and never falls back to a personal start', () => {
  const input = buildSingleMemberInput();
  const currentYear = input.benchmarkRows.filter(row => row.date >= '2026-01-01');
  for (const priorRows of [[], [{ date: '2024-12-31', adjusted_close: 70 }], [{ date: '2025-12-31', adjusted_close: 0, close: 0 }]]) {
    const result = buildCompetitionLeaderboard({ ...input, period: 'year', benchmarkRows: [...priorRows, ...currentYear] });
    assert.equal(result.selfCalculationAvailable, true, 'the valid personal result remains known internally');
    assert.equal(result.benchmarkComplete, false);
    assert.equal(result.selfBenchmarkReturnPct, null);
    assert.equal(result.selfBenchmarkCalculationStartDate, null);
    assert.deepEqual(result.selfBenchmarkTrend, []);
    assert.deepEqual(result.leaders, []);
    assert.equal(result.self, null, 'an unavailable annual benchmark cannot produce an apparently valid ranking');
  }
});
