const VALID_PERIODS = new Set(['day', 'week', 'month', 'year']);

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeSnapshot(row) {
  const snapshotDate = normalizeDate(row?.snapshot_date || row?.snapshotDate);
  if (!snapshotDate) return null;
  return {
    userId: String(row?.user_id || row?.userId || ''),
    snapshotDate,
    dailyReturnPct: toFiniteNumber(row?.daily_return_pct ?? row?.dailyReturnPct),
    cumulativeReturnPct: toFiniteNumber(row?.cumulative_return_pct ?? row?.cumulativeReturnPct),
    lockedAt: row?.locked_at || row?.lockedAt || null,
  };
}

function normalizeMember(row) {
  const userId = String(row?.user_id || row?.userId || '');
  if (!userId) return null;
  return {
    userId,
    status: String(row?.status || ''),
    rankingStartSnapshotDate: normalizeDate(
      row?.ranking_start_snapshot_date || row?.rankingStartSnapshotDate
    ),
    rankingBaselineReturnPct: toFiniteNumber(
      row?.ranking_baseline_return_pct ?? row?.rankingBaselineReturnPct
    ),
  };
}

function normalizeProfile(row) {
  const userId = String(row?.user_id || row?.userId || '');
  if (!userId || !(row?.profile_completed_at || row?.profileCompletedAt)) return null;
  const nickname = String(row?.nickname || '').trim();
  const avatarKey = String(row?.avatar_key || row?.avatarKey || '').trim();
  if (!nickname || !avatarKey) return null;
  return { userId, nickname, avatarKey };
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeCompetitionPeriod(value) {
  const period = String(value || 'day').trim().toLowerCase();
  return VALID_PERIODS.has(period) ? period : null;
}

export function competitionPeriodStartDate(period, asOfDate) {
  const normalizedPeriod = normalizeCompetitionPeriod(period);
  const normalizedAsOfDate = normalizeDate(asOfDate);
  if (!normalizedPeriod || !normalizedAsOfDate) return null;
  if (normalizedPeriod === 'day') return normalizedAsOfDate;
  if (normalizedPeriod === 'month') return `${normalizedAsOfDate.slice(0, 7)}-01`;
  if (normalizedPeriod === 'year') return `${normalizedAsOfDate.slice(0, 4)}-01-01`;

  const date = new Date(`${normalizedAsOfDate}T00:00:00Z`);
  const weekday = date.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return shiftDate(normalizedAsOfDate, -daysSinceMonday);
}

function sortSnapshots(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeSnapshot)
    .filter(Boolean)
    .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
}

function periodBaseline({ snapshots, periodStartDate, rankingStartSnapshotDate, rankingBaselineReturnPct }) {
  const effectiveStartDate = rankingStartSnapshotDate > periodStartDate
    ? rankingStartSnapshotDate
    : periodStartDate;
  const prior = snapshots
    .filter((snapshot) => snapshot.snapshotDate < effectiveStartDate)
    .at(-1);
  if (prior?.cumulativeReturnPct != null) {
    return { value: prior.cumulativeReturnPct, effectiveStartDate };
  }
  if (rankingStartSnapshotDate >= periodStartDate && rankingBaselineReturnPct != null) {
    return { value: rankingBaselineReturnPct, effectiveStartDate };
  }
  return { value: null, effectiveStartDate };
}

export function calculateCompetitionReturn({
  snapshots = [],
  member,
  period = 'day',
  asOfDate,
} = {}) {
  const normalizedMember = normalizeMember(member);
  const normalizedPeriod = normalizeCompetitionPeriod(period);
  const normalizedAsOfDate = normalizeDate(asOfDate);
  if (!normalizedMember?.rankingStartSnapshotDate || !normalizedPeriod || !normalizedAsOfDate) return null;
  if (normalizedMember.rankingStartSnapshotDate > normalizedAsOfDate) return null;

  const chronological = sortSnapshots(snapshots)
    .filter((snapshot) => snapshot.userId === normalizedMember.userId)
    .filter((snapshot) => snapshot.lockedAt)
    .filter((snapshot) => snapshot.snapshotDate >= normalizedMember.rankingStartSnapshotDate)
    .filter((snapshot) => snapshot.snapshotDate <= normalizedAsOfDate);
  const latest = chronological.find((snapshot) => snapshot.snapshotDate === normalizedAsOfDate);
  if (!latest) return null;

  const startDate = competitionPeriodStartDate(normalizedPeriod, normalizedAsOfDate);
  if (normalizedPeriod === 'day') {
    if (latest.dailyReturnPct == null) return null;
    return {
      returnPct: latest.dailyReturnPct,
      calculationStartDate: normalizedAsOfDate,
      trend: [{ date: normalizedAsOfDate, value: latest.dailyReturnPct }],
    };
  }

  if (latest.cumulativeReturnPct == null) return null;
  const baseline = periodBaseline({
    snapshots: chronological,
    periodStartDate: startDate,
    rankingStartSnapshotDate: normalizedMember.rankingStartSnapshotDate,
    rankingBaselineReturnPct: normalizedMember.rankingBaselineReturnPct,
  });
  if (baseline.value == null || !(1 + baseline.value > 0)) return null;

  const periodReturn = (value) => (1 + value) / (1 + baseline.value) - 1;

  const trend = chronological
    .filter((snapshot) => snapshot.snapshotDate >= baseline.effectiveStartDate)
    .filter((snapshot) => snapshot.cumulativeReturnPct != null)
    .map((snapshot) => ({
      date: snapshot.snapshotDate,
      value: periodReturn(snapshot.cumulativeReturnPct),
    }));

  return {
    returnPct: periodReturn(latest.cumulativeReturnPct),
    calculationStartDate: baseline.effectiveStartDate,
    trend,
  };
}

function normalizeBenchmarkRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = normalizeDate(row?.date);
      const adjustedClose = toFiniteNumber(row?.adjusted_close ?? row?.adjustedClose);
      const rawClose = toFiniteNumber(row?.close);
      const close = adjustedClose != null && adjustedClose > 0 ? adjustedClose : rawClose;
      return date && close != null && close > 0 ? { date, close } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateBenchmarkReturn({ rows = [], period = 'day', asOfDate } = {}) {
  const normalizedPeriod = normalizeCompetitionPeriod(period);
  const normalizedAsOfDate = normalizeDate(asOfDate);
  if (!normalizedPeriod || !normalizedAsOfDate) return { returnPct: null, trend: [] };
  const periodStartDate = competitionPeriodStartDate(normalizedPeriod, normalizedAsOfDate);
  return calculateBenchmarkReturnFromStart({
    rows,
    calculationStartDate: periodStartDate,
    asOfDate: normalizedAsOfDate,
  });
}

export function calculateBenchmarkReturnFromStart({
  rows = [],
  calculationStartDate,
  asOfDate,
} = {}) {
  const normalizedStartDate = normalizeDate(calculationStartDate);
  const normalizedAsOfDate = normalizeDate(asOfDate);
  if (!normalizedStartDate || !normalizedAsOfDate || normalizedStartDate > normalizedAsOfDate) {
    return { returnPct: null, trend: [] };
  }
  const chronological = normalizeBenchmarkRows(rows).filter((row) => row.date <= normalizedAsOfDate);
  const end = chronological.find((row) => row.date === normalizedAsOfDate);
  const baseline = chronological.filter((row) => row.date < normalizedStartDate).at(-1);
  if (!end || !baseline) return { returnPct: null, trend: [] };

  const trend = chronological
    .filter((row) => row.date >= normalizedStartDate)
    .map((row) => ({ date: row.date, value: row.close / baseline.close - 1 }));
  return {
    returnPct: end.close / baseline.close - 1,
    trend,
  };
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function assignCompetitionRanks(entries) {
  let previousRankingPct = null;
  let currentRank = 0;
  return entries.map((entry, index) => {
    if (index === 0 || Math.abs(entry.rankingPct - previousRankingPct) > 1e-12) {
      currentRank = index + 1;
      previousRankingPct = entry.rankingPct;
    }
    return { ...entry, rank: currentRank };
  });
}

function publicHoldingSymbols(source, userId) {
  const value = source instanceof Map ? source.get(userId) : source?.[userId];
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en-US'));
}

export function buildCompetitionLeaderboard({
  members = [],
  profiles = [],
  snapshots = [],
  period = 'day',
  asOfDate,
  benchmarkRows = [],
  holdingSymbolsByUser = {},
  selfUserId = '',
  leadersLimit = 10,
} = {}) {
  const memberRows = (Array.isArray(members) ? members : []).map(normalizeMember).filter(Boolean);
  const profileRows = (Array.isArray(profiles) ? profiles : []).map(normalizeProfile).filter(Boolean);
  const profileByUser = new Map(profileRows.map((profile) => [profile.userId, profile]));
  const snapshotRows = sortSnapshots(snapshots);
  const activeProfileUserIds = new Set(
    memberRows
      .filter((member) => member.status === 'active' && profileByUser.has(member.userId))
      .map((member) => member.userId)
  );
  const snapshotsByUser = new Map();
  snapshotRows.forEach((snapshot) => {
    if (!snapshotsByUser.has(snapshot.userId)) snapshotsByUser.set(snapshot.userId, []);
    snapshotsByUser.get(snapshot.userId).push(snapshot);
  });

  const calculatedEntries = memberRows
    .filter((member) => member.status === 'active')
    .map((member) => {
      const profile = profileByUser.get(member.userId);
      if (!profile) return null;
      const calculation = calculateCompetitionReturn({
        snapshots: snapshotsByUser.get(member.userId) || [],
        member,
        period,
        asOfDate,
      });
      if (!calculation) return null;
      const benchmark = calculateBenchmarkReturnFromStart({
        rows: benchmarkRows,
        calculationStartDate: calculation.calculationStartDate,
        asOfDate,
      });
      return {
        internalUserId: member.userId,
        nickname: profile.nickname,
        avatarKey: profile.avatarKey,
        returnPct: calculation.returnPct,
        benchmarkReturnPct: benchmark.returnPct,
        outperformancePct: benchmark.returnPct == null
          ? null
          : calculation.returnPct - benchmark.returnPct,
        rankingPct: benchmark.returnPct == null
          ? null
          : calculation.returnPct - benchmark.returnPct,
        calculationStartDate: calculation.calculationStartDate,
        holdingSymbols: publicHoldingSymbols(holdingSymbolsByUser, member.userId),
        trend: calculation.trend,
        benchmarkTrend: benchmark.trend,
      };
    })
    .filter(Boolean);
  const benchmarkComplete = calculatedEntries.length > 0 && calculatedEntries.every((entry) => (
    entry.benchmarkReturnPct != null && entry.benchmarkTrend.length > 0
  ));
  const rankedEntries = calculatedEntries
    .filter((entry) => entry.rankingPct != null)
    .sort((a, b) => b.rankingPct - a.rankingPct || b.returnPct - a.returnPct || a.nickname.localeCompare(b.nickname, 'zh-CN'));
  const ranked = assignCompetitionRanks(rankedEntries);

  const sanitize = (entry) => entry ? {
    rank: entry.rank,
    nickname: entry.nickname,
    avatarKey: entry.avatarKey,
    returnPct: entry.returnPct,
    outperformancePct: entry.outperformancePct,
    holdingSymbols: entry.holdingSymbols,
  } : null;
  const selfEntry = ranked.find((entry) => entry.internalUserId === selfUserId) || null;
  const selfCalculatedEntry = calculatedEntries.find((entry) => entry.internalUserId === selfUserId) || null;
  const returns = ranked.map((entry) => entry.returnPct);
  const top10Returns = returns.slice(0, 10);
  const benchmarkComparable = ranked;

  return {
    stats: {
      joinedParticipants: activeProfileUserIds.size,
      rankedParticipants: ranked.length,
      // Backward-compatible alias for clients that still display the number
      // of active members with completed community profiles.
      participants: activeProfileUserIds.size,
      beatRatePct: benchmarkComparable.length === 0
        ? null
        : benchmarkComparable.filter((entry) => entry.returnPct > entry.benchmarkReturnPct).length
          / benchmarkComparable.length,
      profitableRatePct: ranked.length === 0
        ? null
        : ranked.filter((entry) => entry.returnPct > 0).length / ranked.length,
      averageReturnPct: average(returns),
      top10AverageReturnPct: average(top10Returns),
    },
    leaders: ranked.slice(0, Math.max(1, Number(leadersLimit) || 10)).map(sanitize),
    self: sanitize(selfEntry),
    selfCalculationAvailable: Boolean(selfCalculatedEntry),
    benchmarkComplete,
    selfCalculationStartDate: selfEntry?.calculationStartDate || null,
    selfTrend: selfEntry?.trend || [],
    selfBenchmarkReturnPct: selfEntry?.benchmarkReturnPct ?? null,
    selfBenchmarkTrend: selfEntry?.benchmarkTrend || [],
  };
}
