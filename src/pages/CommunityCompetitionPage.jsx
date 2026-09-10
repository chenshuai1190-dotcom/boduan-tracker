import React from 'react';
import { ArrowLeft, Clock3, Info, Loader2, RefreshCw, Trophy, UserRound, X } from 'lucide-react';
import {
  clearCommunityCompetitionCache,
  commitCommunityCompetitionCache,
  getCommunityCompetitionCacheGeneration,
  getCommunityCompetitionRefreshDecision,
  getCommunityCompetitionSnapshotStatusDecision,
  invalidateCommunityCompetitionRequests,
  readCommunityCompetitionCache,
  recordCommunityCompetitionObservedPublication,
  recordCommunityCompetitionStatusCheck,
  requestCommunityCompetitionRefresh,
  shouldRecordCommunityCompetitionRefreshFailure,
} from '../lib/communityCompetitionCache.js';
import { bindCommunityCompetitionResume } from '../lib/communityCompetitionResume.js';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import { communityCompetitionApi } from '../lib/communityCompetitionApi.js';
import { t } from '../lib/i18n.js';
import './CommunityCompetitionPage.css';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PROFIT = '#ff4b1f';
const LOSS = '#36c49a';
const NEUTRAL = 'rgba(255,255,255,0.58)';
const TRANSIENT_RESUME_RETRY_COOLDOWN_MS = 60_000;

const PERIODS = [
  ['day', '日榜'],
  ['week', '周榜'],
  ['month', '月榜'],
  ['year', '年榜'],
];

function snapshotPublicationFromCompetitionState(data) {
  if (data?.state === 'ready') {
    return {
      snapshotDate: data.asOfDate,
      version: data.snapshotVersion,
      completedAt: data.publicationCompletedAt || data.snapshotUpdatedAt,
    };
  }
  if (data?.state === 'waiting_snapshot') {
    return {
      snapshotDate: data.publishedSnapshotDate,
      version: data.snapshotVersion,
      completedAt: data.publicationCompletedAt || data.snapshotUpdatedAt,
    };
  }
  return null;
}

function isFiniteValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function valueColor(value) {
  if (!isFiniteValue(value) || Number(value) === 0) return NEUTRAL;
  return Number(value) > 0 ? PROFIT : LOSS;
}

function formatPercent(value, digits = 2) {
  if (!isFiniteValue(value)) return '--';
  const percentage = Number(value) * 100;
  const sign = percentage > 0 ? '+' : '';
  return `${sign}${percentage.toFixed(digits)}%`;
}

function formatInteger(value, language = 'zh') {
  if (!isFiniteValue(value)) return '--';
  return Math.max(0, Math.trunc(Number(value))).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN');
}

function formatDate(value, language = 'zh') {
  if (!value) return '--';
  const parts = String(value).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return '--';
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCompactSnapshotDate(value) {
  const parts = String(value || '').slice(0, 10).split('-');
  if (parts.length !== 3 || !/^\d{4}$/.test(parts[0]) || !/^\d{2}$/.test(parts[1]) || !/^\d{2}$/.test(parts[2])) return '--';
  return `${parts[1]}.${parts[2]}`;
}

function keepTogether(value) {
  return Array.from(String(value || '')).join('\u2060');
}

function protectHintText(value) {
  if (typeof value !== 'string') return value;
  return ['收盘价快照', '收盘快照', '服务端', '估算或模拟数据', '不代表券商认证'].reduce(
    (text, phrase) => text.replaceAll(phrase, keepTogether(phrase)),
    value,
  );
}

function isRetryableCompetitionHttpFailure(error) {
  const status = Number(error?.status);
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function MetricBlock({ label, value, color = NEUTRAL }) {
  return (
    <div className="cc-metric">
      <div className="cc-label">{label}</div>
      <div className="cc-metric-value" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, color = 'rgba(255,255,255,0.86)' }) {
  return (
    <div className="cc-stat">
      <div className="cc-label">{label}</div>
      <div className="cc-stat-value" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
    </div>
  );
}

function Avatar({ avatarKey, rank }) {
  const avatar = getCommunityAvatarOption(avatarKey);
  const rankValue = Number(rank);
  return (
    <div data-rank-avatar data-rank={rankValue} className="cc-avatar">
      <img src={avatar.src} alt="" className="h-full w-full scale-[1.15] object-cover" draggable={false} />
    </div>
  );
}

function RankRow({ row, self = false, selected = false, onSelect }) {
  if (!row) return null;
  const rank = isFiniteValue(row.rank) ? String(Math.trunc(Number(row.rank))) : '--';
  const rankValue = Number(row.rank);
  const rankColor = rankValue <= 3 ? '#dedee3' : '#85858d';
  return (
    <button
      type="button"
      onClick={(event) => {
        const avatar = event.currentTarget.querySelector('[data-rank-avatar]');
        onSelect?.(
          row,
          event.currentTarget.getBoundingClientRect(),
          avatar?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect(),
        );
      }}
      className={`cc-rank-row ${self ? 'cc-rank-self' : ''} ${selected ? 'cc-rank-selected' : ''}`}
      data-competition-rank-row
      aria-label={`${row.nickname || '--'} ${formatPercent(row.returnPct)}`}
      aria-expanded={selected}
    >
      <div className="cc-rank-number" style={{ color: rankColor, fontFamily: NUMBER_FONT }}>{rank}</div>
      <div className="cc-rank-person">
        <Avatar avatarKey={row.avatarKey} rank={rankValue} />
        <div className="cc-rank-name">{row.nickname || '--'}</div>
      </div>
      <div className="cc-rank-return" style={{ color: valueColor(row.returnPct), fontFamily: NUMBER_FONT }}>{formatPercent(row.returnPct)}</div>
      <div className="cc-rank-excess" style={{ color: valueColor(row.outperformancePct), fontFamily: NUMBER_FONT }}>{formatPercent(row.outperformancePct)}</div>
    </button>
  );
}

function HoldingPopover({ selection, periodMetricLabel, snapshotDate, language, onClose, tt }) {
  const cardRef = React.useRef(null);
  const [layout, setLayout] = React.useState(null);
  const row = selection?.row;
  const holdingsAvailable = Array.isArray(row?.holdingSymbols);
  const holdingSymbols = (holdingsAvailable ? row.holdingSymbols : [])
    .map((symbol) => String(symbol || '').trim().toUpperCase())
    .filter(Boolean);

  React.useLayoutEffect(() => {
    const card = cardRef.current;
    const anchor = selection?.anchorRect;
    const arrowTarget = selection?.arrowRect || anchor;
    if (!card || !anchor || typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      const cardRect = card.getBoundingClientRect();
      const margin = 10;
      const anchorCenter = anchor.left + anchor.width / 2;
      const arrowTargetCenter = arrowTarget.left + arrowTarget.width / 2;
      const left = Math.max(margin, Math.min(window.innerWidth - cardRect.width - margin, anchorCenter - cardRect.width / 2));
      let top = anchor.bottom + 10;
      let placement = 'below';
      if (top + cardRect.height > window.innerHeight - margin) {
        top = Math.max(margin, anchor.top - cardRect.height - 10);
        placement = 'above';
      }
      setLayout({
        left,
        top,
        placement,
        arrowLeft: Math.max(24, Math.min(cardRect.width - 24, arrowTargetCenter - left)),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selection]);

  if (!row) return null;
  const avatar = getCommunityAvatarOption(row.avatarKey);

  return (
    <>
      <button type="button" className="fixed inset-0 z-[130] cursor-default bg-transparent" onClick={onClose} aria-label={tt('competition.closeUserCard', '关闭用户资料卡')} />
      <div
        ref={cardRef}
        className="cc-user-card"
        style={{
          left: layout?.left ?? 0,
          top: layout?.top ?? 0,
          visibility: layout ? 'visible' : 'hidden',
        }}
        role="dialog"
        aria-label={tt('competition.userCard', '参赛用户资料')}
      >
        {layout ? (
          <span
            className={`cc-user-arrow ${layout.placement === 'below' ? '-top-[7px]' : '-bottom-[7px]'}`}
            style={{ left: layout.arrowLeft - 7 }}
          >
            <span className="block h-full w-full" />
          </span>
        ) : null}
        <div className="cc-user-inner">
          <button type="button" className="cc-user-close" onClick={onClose} aria-label={tt('competition.closeUserCard', '关闭用户资料卡')}><X size={16} /></button>
          <div className="cc-user-profile">
            <div className="cc-user-avatar">
              <img src={avatar.src} alt="" className="h-full w-full scale-[1.15] object-cover" draggable={false} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[19px] text-white/[0.92]">{row.nickname || '--'}</div>
              <div className="mt-1 text-[11px] text-white/[0.40]">#{isFiniteValue(row.rank) ? Math.trunc(Number(row.rank)) : '--'} · {formatDate(snapshotDate, language)}</div>
            </div>
          </div>
          <div className="mt-5 text-[11px] text-white/[0.40]">{periodMetricLabel}</div>
          <div className="mt-1 text-[30px] leading-none tabular-nums" style={{ color: valueColor(row.returnPct), fontFamily: NUMBER_FONT }}>{formatPercent(row.returnPct)}</div>
          <div className="mt-5 text-[11px] text-white/[0.40]">{tt('competition.closeHoldingSymbols', '收盘持仓代码')}</div>
          <div className="mt-2.5 max-h-[112px] overflow-y-auto overscroll-contain pr-1">
            {!holdingsAvailable ? (
              <div className="text-[12px] text-white/[0.46]">{tt('competition.holdingsUnavailable', '持仓暂不可用')}</div>
            ) : holdingSymbols.length ? (
              <div className="flex flex-wrap gap-2">
                {holdingSymbols.map((symbol) => (
                  <span key={symbol} className="cc-holding-symbol">{symbol}</span>
                ))}
              </div>
            ) : <div className="text-[12px] text-white/[0.46]">{tt('competition.noHoldings', '当前空仓')}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function normalizeTrendPoints(points) {
  return (Array.isArray(points) ? points : [])
    .filter((point) => point?.date && isFiniteValue(point?.value))
    .map((point) => ({ date: String(point.date).slice(0, 10), value: Number(point.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function TrendChart({ self = [], benchmark = [], compact = false }) {
  const ownPoints = React.useMemo(() => normalizeTrendPoints(self), [self]);
  const benchmarkPoints = React.useMemo(() => normalizeTrendPoints(benchmark), [benchmark]);
  const allPoints = [...ownPoints, ...benchmarkPoints];
  if (allPoints.length < 2 || (ownPoints.length < 2 && benchmarkPoints.length < 2)) {
    return <div className={`flex ${compact ? 'h-[54px]' : 'h-[72px]'} items-center justify-center text-[12px] text-white/40`}>--</div>;
  }

  const dates = Array.from(new Set(allPoints.map((point) => point.date))).sort();
  const values = allPoints.map((point) => point.value);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) {
    minValue -= 0.01;
    maxValue += 0.01;
  }
  const xFor = (date) => 4 + (dates.indexOf(date) / Math.max(1, dates.length - 1)) * 160;
  const yFor = (value) => 66 - ((value - minValue) / (maxValue - minValue)) * 60;
  const pathFor = (points) => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(point.date).toFixed(2)} ${yFor(point.value).toFixed(2)}`).join(' ');

  return (
    <svg viewBox="0 0 168 72" className={compact ? 'h-[54px] w-full' : 'h-[72px] w-full'} role="img" aria-label="Return trend">
      {benchmarkPoints.length >= 2 ? <path d={pathFor(benchmarkPoints)} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {ownPoints.length >= 2 ? <path d={pathFor(ownPoints)} fill="none" stroke="#d05a32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {ownPoints.length >= 2 ? <circle cx={xFor(ownPoints.at(-1).date)} cy={yFor(ownPoints.at(-1).value)} r="2.5" fill={valueColor(ownPoints.at(-1).value)} /> : null}
    </svg>
  );
}

function ProgressLine({ label, value, maxMagnitude }) {
  const hasValue = isFiniteValue(value);
  const width = hasValue ? Math.max(0, Math.min(100, (Math.abs(Number(value)) / maxMagnitude) * 100)) : 0;
  const color = valueColor(value);
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)_58px] items-center gap-2">
      <div className="text-[11px] text-white/[0.58]">{label}</div>
      <div className="relative h-2 overflow-visible rounded-full bg-white/[0.055]">
        {hasValue ? (
          <>
            <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${width}%`, background: color }} />
          </>
        ) : null}
      </div>
      <div className="text-right text-[11px] tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{formatPercent(value)}</div>
    </div>
  );
}

function JoinSheet({ onJoin, onDecline, joining, error, tt }) {
  return (
    <div className="cc-join-backdrop">
      <div className="cc-join-panel" role="dialog" aria-modal="true" aria-label={tt('competition.joinTitle', '加入收益比赛')}>
        <div className="cc-join-header">
          <div>{tt('competition.joinTitle', '加入收益比赛')}</div>
          <div>
            <button type="button" onClick={onDecline} disabled={joining} className="cc-dialog-close" aria-label={tt('competition.closeJoin', '关闭加入收益比赛')}>
              <X className="h-5 w-5" strokeWidth={1.7} />
            </button>
          </div>
        </div>
        <div className="cc-join-illustration">
          <div className="cc-join-icon">
            <Trophy size={36} strokeWidth={1.3} />
          </div>
        </div>
        <div className="cc-join-description">
          {tt('competition.joinDesc', '自愿加入后即可查看真实收益排行榜，请选择是否加入。')}
        </div>
        {error ? <div className="cc-join-error" role="alert">{error}</div> : null}
        <div className="cc-join-actions">
          <button type="button" onClick={onDecline} disabled={joining} className="cc-secondary-action">
            {tt('competition.notJoin', '暂不加入')}
          </button>
          <button type="button" onClick={onJoin} disabled={joining} className="cc-primary-action">
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {joining ? tt('competition.joining', '加入中...') : tt('competition.confirmJoin', '确认加入')}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon, title, desc, note, actionLabel, onAction, busy = false }) {
  return (
    <section className="cc-status" role="status">
      <div className="cc-status-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{protectHintText(desc)}</p>
      {note ? <p className="cc-status-note">{protectHintText(note)}</p> : null}
      {actionLabel ? (
        <button type="button" onClick={onAction} disabled={busy} className="cc-primary-action cc-status-action">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function CompetitionContent({ data, period, language, tt, leaderboardRefreshing = false }) {
  const [selection, setSelection] = React.useState(null);
  const ready = data?.state === 'ready';
  const stats = ready ? (data.stats || {}) : {};
  const leaders = ready && Array.isArray(data.leaders) ? data.leaders : [];
  const self = ready ? data.self : null;
  const selfAvatar = self?.avatarKey ? getCommunityAvatarOption(self.avatarKey) : null;
  const selfLeaderIndex = self
    ? leaders.findIndex((row) => Number(row?.rank) === Number(self.rank) && row?.nickname === self.nickname)
    : -1;
  const trend = ready ? (data.trend || {}) : {};
  const snapshotDateLabel = formatCompactSnapshotDate(data?.asOfDate);
  const joinedParticipants = isFiniteValue(stats.joinedParticipants)
    ? Number(stats.joinedParticipants)
    : Number(stats.participants);
  const rankedParticipants = isFiniteValue(stats.rankedParticipants)
    ? Number(stats.rankedParticipants)
    : joinedParticipants;
  const participantCoverageIncomplete = Number.isFinite(joinedParticipants)
    && Number.isFinite(rankedParticipants)
    && rankedParticipants < joinedParticipants;
  const periodMetricLabel = tt(`competition.periodMetric.${period}`, PERIODS.find(([id]) => id === period)?.[1] || '收益率');
  const baselineTitle = tt(`competition.baseline.${period}`, '收益基准');
  React.useEffect(() => setSelection(null), [period]);
  React.useEffect(() => {
    if (!selection || typeof window === 'undefined') return undefined;
    const close = () => setSelection(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [selection]);
  const selectRow = React.useCallback((row, anchorRect, arrowRect) => {
    setSelection((current) => (
      current?.row === row ? null : { row, anchorRect, arrowRect }
    ));
  }, []);
  const maxMagnitude = Math.max(
    0.01,
    isFiniteValue(stats.averageReturnPct) ? Math.abs(Number(stats.averageReturnPct)) : 0,
    isFiniteValue(stats.top10AverageReturnPct) ? Math.abs(Number(stats.top10AverageReturnPct)) : 0,
  ) * 1.18;

  return (
    <div className="cc-content">
      <section className="cc-hero">
        <div className="cc-hero-top">
          <div data-competition-self-profile className="cc-self-profile">
            <div data-competition-self-avatar className="cc-self-avatar">
              {selfAvatar ? <img src={selfAvatar.src} alt="" draggable={false} /> : null}
            </div>
            <div>
              <div data-competition-self-nickname className="cc-self-nickname">{self?.nickname || '--'}</div>
              <div className="cc-label">{tt('competition.subtitle', '社区投资者收益排行')}</div>
            </div>
          </div>
          <div className="cc-self-rank">
            <div className="cc-label">{tt('competition.myRank', '我的排名')}</div>
            <div className="cc-self-rank-value" style={{ fontFamily: NUMBER_FONT }}>{isFiniteValue(self?.rank) ? `#${Math.trunc(Number(self.rank))}` : '--'}</div>
          </div>
        </div>
        <div data-competition-hero-metrics className="cc-hero-metrics">
          <div className="cc-hero-return">
            <div className="cc-label">{periodMetricLabel}</div>
            <div className="cc-hero-return-value" style={{ color: valueColor(self?.returnPct), fontFamily: NUMBER_FONT }}>{formatPercent(self?.returnPct)}</div>
          </div>
          <div className="cc-hero-comparison">
            <MetricBlock label={tt('competition.nasdaq100', 'QQQ 基准')} value={formatPercent(data?.benchmarkReturnPct)} color={valueColor(data?.benchmarkReturnPct)} />
            <MetricBlock label={tt('competition.outperformNasdaq', '跑赢 QQQ')} value={formatPercent(self?.outperformancePct)} color={valueColor(self?.outperformancePct)} />
          </div>
        </div>
        <div data-competition-update-row className="cc-update-row">
          <div data-competition-update-date className="cc-update-date">
            {ready ? tt('competition.dataAsOfClose', '数据截至 {{date}} 收盘', { date: snapshotDateLabel }) : '--'}
          </div>
          {leaderboardRefreshing ? (
            <div
              data-competition-leaderboard-refresh
              role="status"
              aria-live="polite"
              className="cc-refresh-status"
            >
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              <span>{tt('competition.loadingLatestLeaderboard', '正在加载最新榜单…')}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="cc-leaderboard">
        <div className="cc-section-heading">
          <h2>{tt('competition.rankingTitle', '收益率排行榜')}</h2>
          <span>{participantCoverageIncomplete
            ? `${tt('competition.participantsRanked', '参赛/上榜')} ${formatInteger(joinedParticipants, language)}/${formatInteger(rankedParticipants, language)}`
            : `${tt('competition.participants', '参赛人数')} ${formatInteger(joinedParticipants, language)}`}</span>
        </div>
        <div className="cc-rank-head">
          <span>{language === 'en' ? 'Rank' : '排名'}</span>
          <span>{tt('competition.returnRate', '收益率')}</span>
          <span>{tt('competition.outperformShort', '跑赢 QQQ')}</span>
        </div>
        <div className="cc-rank-list">
          {leaders.length ? leaders.map((row, index) => <RankRow key={`${row?.rank ?? index}-${row?.nickname ?? ''}`} row={row} self={index === selfLeaderIndex} selected={selection?.row === row} onSelect={selectRow} />) : (
            <div className="cc-empty">{ready ? tt('competition.noRanking', '当前周期暂无有效排行') : '--'}</div>
          )}
          {self && selfLeaderIndex < 0 ? <RankRow row={self} self selected={selection?.row === self} onSelect={selectRow} /> : null}
        </div>
        {selection ? <HoldingPopover selection={selection} periodMetricLabel={periodMetricLabel} snapshotDate={data?.asOfDate} language={language} onClose={() => setSelection(null)} tt={tt} /> : null}
      </section>

      <section className="cc-baseline">
        <div className="cc-section-heading">
          <h2>{baselineTitle}</h2>
          <span>
            {ready ? tt('competition.calculationStart', '起算 {{date}}', { date: formatDate(data?.calculationStartDate, language) }) : '--'}
          </span>
        </div>
        <div className="cc-community-stats">
          <StatCard label={tt('competition.beatNasdaq', '跑赢 QQQ')} value={formatPercent(stats.beatRatePct, 0)} color={NEUTRAL} />
          <StatCard label={tt('competition.profitableAccounts', '赚钱账户')} value={formatPercent(stats.profitableRatePct, 0)} color={NEUTRAL} />
          <StatCard label={tt('competition.averageReturn', '平均收益率')} value={formatPercent(stats.averageReturnPct)} color={valueColor(stats.averageReturnPct)} />
        </div>
        <div className="cc-baseline-comparison">
          <div className="cc-benchmark">
            <div className="cc-label">{tt('competition.nasdaq100Index', 'QQQ ETF')}</div>
            <div className="cc-benchmark-value" style={{ color: valueColor(data?.benchmarkReturnPct), fontFamily: NUMBER_FONT }}>{formatPercent(data?.benchmarkReturnPct)}</div>
            <div className="mt-1"><TrendChart benchmark={trend.benchmark} compact /></div>
          </div>
          <div className="cc-baseline-bars">
            <ProgressLine label={tt('competition.communityAverage', '社区平均')} value={stats.averageReturnPct} maxMagnitude={maxMagnitude} />
            <ProgressLine label={tt('competition.top10Average', 'TOP10 平均')} value={stats.top10AverageReturnPct} maxMagnitude={maxMagnitude} />
          </div>
        </div>
      </section>
      <div className="cc-disclosure"><Info size={14} aria-hidden="true" /><p>{protectHintText(tt('competition.dataDisclosure', '收益基于正式交易记录与服务端收盘价快照，不代表券商认证。'))}</p></div>
    </div>
  );
}

export default function CommunityCompetitionPage({ ctx = {} }) {
  const {
    closeCommunityCompetition,
    communityCompetitionClient = communityCompetitionApi,
    communityCompetitionNow = Date.now,
    disableCommunityCompetitionCache = false,
    language = 'zh',
    openCommunityProfileSettings,
    supabase,
    user,
  } = ctx;
  const tt = React.useCallback((key, fallback, vars) => t(language, key, fallback, vars), [language]);
  const [period, setPeriod] = React.useState('day');
  const userId = String(user?.id || '').trim();
  const cacheEnabled = Boolean(userId) && !disableCommunityCompetitionCache;
  const [view, setView] = React.useState(() => {
    const cached = cacheEnabled ? readCommunityCompetitionCache({ userId, period: 'day' }) : null;
    return cached
      ? { state: cached.data.state, data: cached.data, error: '' }
      : { state: 'loading', data: null, error: '' };
  });
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [refreshingLeaderboardViewKey, setRefreshingLeaderboardViewKey] = React.useState('');
  const [joining, setJoining] = React.useState(false);
  const [joinError, setJoinError] = React.useState('');
  const joiningRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const activeViewKey = `${userId}:${period}`;
  const activeViewKeyRef = React.useRef(activeViewKey);
  const settledViewKeyRef = React.useRef('');
  const renderedCacheRef = React.useRef({ viewKey: '', savedAt: 0 });
  const failedRetryNotBeforeRef = React.useRef(new Map());
  const statusCheckRef = React.useRef(null);
  const publicationRefreshRef = React.useRef(new Map());
  activeViewKeyRef.current = activeViewKey;
  const profileRedirectedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = React.useCallback(async ({
    showLoading = false,
    bypassFailureCooldown = false,
    commitExpectedPublication = false,
    expectedPublication = null,
    propagateError = false,
  } = {}) => {
    const requestViewKey = `${userId}:${period}`;
    const now = communityCompetitionNow();
    const blockedUntil = Number(failedRetryNotBeforeRef.current.get(requestViewKey)) || 0;
    if (!bypassFailureCooldown && blockedUntil > now) return null;
    failedRetryNotBeforeRef.current.delete(requestViewKey);
    const cached = cacheEnabled ? readCommunityCompetitionCache({ userId, period }) : null;
    const cacheGeneration = cacheEnabled
      ? getCommunityCompetitionCacheGeneration(userId)
      : '';
    if (mountedRef.current && showLoading && !cached) {
      setView({ state: 'loading', data: null, error: '' });
    }
    if (mountedRef.current) setJoinError('');
    try {
      let result;
      if (cacheEnabled && commitExpectedPublication) {
        const data = await communityCompetitionClient.fetch({ supabase, period });
        const responsePublication = snapshotPublicationFromCompetitionState(data);
        if (
          expectedPublication
          && (
            responsePublication?.snapshotDate !== expectedPublication.snapshotDate
            || responsePublication?.version !== expectedPublication.version
          )
        ) {
          const error = new Error('COMPETITION_PUBLICATION_MISMATCH');
          error.code = 'COMPETITION_PUBLICATION_MISMATCH';
          throw error;
        }
        result = { data, entry: null };
      } else {
        result = cacheEnabled
          ? await requestCommunityCompetitionRefresh({
            userId,
            period,
            now,
            fetcher: () => communityCompetitionClient.fetch({ supabase, period }),
          })
          : { data: await communityCompetitionClient.fetch({ supabase, period }), entry: null };
      }
      if (
        cacheEnabled
        && commitExpectedPublication
        && activeViewKeyRef.current === requestViewKey
      ) {
        const committed = await commitCommunityCompetitionCache({
          userId,
          period,
          data: result.data,
          now: communityCompetitionNow(),
          expectedGeneration: cacheGeneration,
        });
        if (!committed.entry) {
          const error = new Error('COMPETITION_CACHE_SUPERSEDED');
          error.code = committed.reason === 'invalidated'
            ? 'COMPETITION_CACHE_INVALIDATED'
            : 'COMPETITION_CACHE_SUPERSEDED';
          throw error;
        }
        result = {
          data: committed.entry.data,
          entry: committed.entry,
          accepted: committed.accepted,
        };
      }
      if (mountedRef.current && activeViewKeyRef.current === requestViewKey) {
        settledViewKeyRef.current = requestViewKey;
        failedRetryNotBeforeRef.current.delete(requestViewKey);
        const renderedCache = cacheEnabled
          ? readCommunityCompetitionCache({ userId, period })
          : null;
        renderedCacheRef.current = {
          viewKey: requestViewKey,
          savedAt: Number(renderedCache?.savedAt) || 0,
        };
        setView({ state: result.data.state, data: result.data, error: '' });
      }
      return result;
    } catch (error) {
      const fallback = cacheEnabled ? readCommunityCompetitionCache({ userId, period }) : null;
      if (
        (
          commitExpectedPublication
          && error?.code !== 'COMPETITION_CACHE_INVALIDATED'
          && error?.code !== 'COMPETITION_CACHE_SUPERSEDED'
        )
        || (
          error?.code !== 'COMPETITION_CACHE_INVALIDATED'
          && !shouldRecordCommunityCompetitionRefreshFailure(error)
        )
        || (!fallback && isRetryableCompetitionHttpFailure(error))
      ) {
        failedRetryNotBeforeRef.current.set(
          requestViewKey,
          communityCompetitionNow() + TRANSIENT_RESUME_RETRY_COOLDOWN_MS,
        );
      }
      if (mountedRef.current && activeViewKeyRef.current === requestViewKey) {
        settledViewKeyRef.current = requestViewKey;
        renderedCacheRef.current = {
          viewKey: requestViewKey,
          savedAt: Number(fallback?.savedAt) || 0,
        };
        setView(fallback
          ? { state: fallback.data.state, data: fallback.data, error: '' }
          : { state: 'error', data: null, error: error?.message || tt('competition.loadFailed', '收益比赛读取失败') });
      }
      if (propagateError) throw error;
      return null;
    } finally {
      if (
        mountedRef.current
        && activeViewKeyRef.current === requestViewKey
        && cacheEnabled
        && (
          readCommunityCompetitionCache({ userId, period })
          || failedRetryNotBeforeRef.current.has(requestViewKey)
        )
      ) {
        setRefreshTick((current) => current + 1);
      }
    }
  }, [cacheEnabled, communityCompetitionClient, communityCompetitionNow, period, supabase, tt, userId]);

  const checkSnapshotStatus = React.useCallback(async () => {
    if (!cacheEnabled) return null;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null;
    const requestViewKey = `${userId}:${period}`;
    const cached = readCommunityCompetitionCache({ userId, period });
    if (!cached) return load({ showLoading: true });
    if (typeof communityCompetitionClient.snapshotStatus !== 'function') {
      return load({ showLoading: false });
    }

    const checkedAt = communityCompetitionNow();
    recordCommunityCompetitionStatusCheck({ userId, period, now: checkedAt });
    let statusRequest = statusCheckRef.current;
    if (!statusRequest) {
      statusRequest = Promise.resolve()
        .then(() => communityCompetitionClient.snapshotStatus({ supabase }))
        .finally(() => {
          if (statusCheckRef.current === statusRequest) statusCheckRef.current = null;
        });
      statusCheckRef.current = statusRequest;
    }
    return statusRequest
      .then(async (status) => {
        if (!mountedRef.current || activeViewKeyRef.current !== requestViewKey) return null;
        const observedPublication = await recordCommunityCompetitionObservedPublication({
          userId,
          publication: {
            snapshotDate: status?.snapshotDate,
            version: status?.version,
            completedAt: status?.completedAt,
          },
        });
        const currentCache = readCommunityCompetitionCache({ userId, period }) || cached;
        const latestStatus = observedPublication
          ? {
            ...status,
            snapshotDate: observedPublication.snapshotDate,
            version: observedPublication.version,
            completedAt: observedPublication.completedAt,
          }
          : status;
        const decision = getCommunityCompetitionSnapshotStatusDecision({
          entry: currentCache,
          status: latestStatus,
        });
        if (!decision.shouldRefresh) {
          failedRetryNotBeforeRef.current.delete(requestViewKey);
          setRefreshTick((current) => current + 1);
          return decision;
        }
        const publicationKey = `${requestViewKey}:${decision.snapshotDate}:${decision.version}`;
        let publicationRefresh = publicationRefreshRef.current.get(publicationKey);
        if (!publicationRefresh) {
          publicationRefresh = Promise.resolve().then(async () => {
            invalidateCommunityCompetitionRequests(userId);
            settledViewKeyRef.current = '';
            failedRetryNotBeforeRef.current.delete(requestViewKey);
            return load({
              showLoading: false,
              bypassFailureCooldown: true,
              commitExpectedPublication: true,
              expectedPublication: {
                snapshotDate: decision.snapshotDate,
                version: decision.version,
              },
              propagateError: true,
            });
          }).finally(() => {
            if (publicationRefreshRef.current.get(publicationKey) === publicationRefresh) {
              publicationRefreshRef.current.delete(publicationKey);
            }
          });
          publicationRefreshRef.current.set(publicationKey, publicationRefresh);
        }
        if (mountedRef.current) setRefreshingLeaderboardViewKey(requestViewKey);
        try {
          await publicationRefresh;
          return decision;
        } finally {
          if (mountedRef.current) {
            setRefreshingLeaderboardViewKey((current) => (
              current === requestViewKey ? '' : current
            ));
          }
        }
      })
      .catch((error) => {
        if (mountedRef.current && activeViewKeyRef.current === requestViewKey) {
          failedRetryNotBeforeRef.current.set(
            requestViewKey,
            communityCompetitionNow() + TRANSIENT_RESUME_RETRY_COOLDOWN_MS,
          );
          setRefreshTick((current) => current + 1);
        }
        return null;
      });
  }, [
    cacheEnabled,
    communityCompetitionClient,
    communityCompetitionNow,
    load,
    period,
    supabase,
    userId,
  ]);

  React.useEffect(() => {
    let timerId = 0;
    const cached = cacheEnabled ? readCommunityCompetitionCache({ userId, period }) : null;
    if (cached) {
      settledViewKeyRef.current = activeViewKey;
      renderedCacheRef.current = {
        viewKey: activeViewKey,
        savedAt: Number(cached.savedAt) || 0,
      };
      setView({ state: cached.data.state, data: cached.data, error: '' });
    } else if (renderedCacheRef.current.viewKey !== activeViewKey) {
      renderedCacheRef.current = { viewKey: activeViewKey, savedAt: 0 };
    }
    const now = communityCompetitionNow();
    const decision = getCommunityCompetitionRefreshDecision({ entry: cached, now });
    const retryNotBefore = Number(failedRetryNotBeforeRef.current.get(activeViewKey)) || 0;
    const missingCacheNeedsLoad = !cached && (
      settledViewKeyRef.current !== activeViewKey
      || Number.isFinite(retryNotBefore) && retryNotBefore > 0
    );
    if (missingCacheNeedsLoad || (cached && decision.shouldRefresh)) {
      if (retryNotBefore > now) {
        const delay = Math.min(2_147_000_000, Math.max(1_000, retryNotBefore - now));
        timerId = window.setTimeout(() => setRefreshTick((current) => current + 1), delay);
      } else {
        failedRetryNotBeforeRef.current.delete(activeViewKey);
        if (cached) checkSnapshotStatus();
        else load({ showLoading: true });
      }
    } else if (cached && Number.isFinite(decision.nextCheckAt)) {
      const delay = Math.min(2_147_000_000, Math.max(1_000, decision.nextCheckAt - now));
      timerId = window.setTimeout(() => setRefreshTick((current) => current + 1), delay);
    }
    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [
    activeViewKey,
    cacheEnabled,
    checkSnapshotStatus,
    communityCompetitionNow,
    load,
    period,
    refreshTick,
    userId,
  ]);

  const recheckActiveCompetition = React.useCallback((trigger = '') => {
    if (!cacheEnabled) return;
    const currentViewKey = `${userId}:${period}`;
    if (trigger === 'online') failedRetryNotBeforeRef.current.delete(currentViewKey);
    const now = communityCompetitionNow();
    const retryNotBefore = Number(failedRetryNotBeforeRef.current.get(currentViewKey)) || 0;
    const cached = readCommunityCompetitionCache({ userId, period });
    if (!cached) {
      if (
        renderedCacheRef.current.viewKey === currentViewKey
        && renderedCacheRef.current.savedAt > 0
      ) {
        renderedCacheRef.current = { viewKey: currentViewKey, savedAt: 0 };
        settledViewKeyRef.current = '';
        setRefreshTick((current) => current + 1);
        return;
      }
      if (
        settledViewKeyRef.current !== currentViewKey
        || trigger === 'online'
        || (retryNotBefore > 0 && retryNotBefore <= now)
      ) {
        if (retryNotBefore > 0 && retryNotBefore <= now) {
          failedRetryNotBeforeRef.current.delete(currentViewKey);
        }
        setRefreshTick((current) => current + 1);
      }
      return;
    }
    if (
      renderedCacheRef.current.viewKey !== currentViewKey
      || renderedCacheRef.current.savedAt !== Number(cached.savedAt)
    ) {
      renderedCacheRef.current = {
        viewKey: currentViewKey,
        savedAt: Number(cached.savedAt) || 0,
      };
      settledViewKeyRef.current = currentViewKey;
      setView({ state: cached.data.state, data: cached.data, error: '' });
      setRefreshTick((current) => current + 1);
      return;
    }
    const decision = getCommunityCompetitionRefreshDecision({ entry: cached, now });
    if (
      decision.shouldRefresh
      && (trigger === 'online' || retryNotBefore <= now)
    ) setRefreshTick((current) => current + 1);
  }, [cacheEnabled, communityCompetitionNow, period, userId]);

  React.useEffect(() => bindCommunityCompetitionResume({
    onVisibleRecheck: recheckActiveCompetition,
    now: communityCompetitionNow,
  }), [communityCompetitionNow, recheckActiveCompetition]);

  React.useEffect(() => {
    if (view.state !== 'profile_required' || profileRedirectedRef.current) return;
    profileRedirectedRef.current = true;
    openCommunityProfileSettings?.();
  }, [openCommunityProfileSettings, view.state]);

  const join = async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setJoinError('');
    try {
      const data = await communityCompetitionClient.join({ supabase });
      if (cacheEnabled) await clearCommunityCompetitionCache(userId);
      const normalizedData = { ...data, period };
      if (cacheEnabled) {
        await commitCommunityCompetitionCache({
          userId,
          period,
          data: normalizedData,
          allowUnpublishedWaiting: true,
          expectedGeneration: getCommunityCompetitionCacheGeneration(userId),
        });
      }
      settledViewKeyRef.current = `${userId}:${period}`;
      const renderedCache = cacheEnabled
        ? readCommunityCompetitionCache({ userId, period })
        : null;
      renderedCacheRef.current = {
        viewKey: `${userId}:${period}`,
        savedAt: Number(renderedCache?.savedAt) || 0,
      };
      setView({ state: normalizedData.state, data: normalizedData, error: '' });
      if (cacheEnabled) setRefreshTick((current) => current + 1);
    } catch (error) {
      if (error?.state === 'profile_required') {
        setView({ state: 'profile_required', data: null, error: '' });
        return;
      }
      setJoinError(error?.message || tt('competition.joinFailed', '加入收益比赛失败'));
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  };

  const decline = () => {
    if (joiningRef.current) return;
    closeCommunityCompetition?.();
  };

  const contentDimmed = view.state === 'join_required';

  return (
    <main className="cc-page" style={{ fontFamily: PAGE_FONT }}>
      <header className="cc-header">
        <div className="cc-title-row">
          <button type="button" onClick={closeCommunityCompetition} className="cc-back" aria-label={tt('competition.back', '返回')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1>{tt('competition.title', '收益比赛')}</h1>
          <span className="cc-title-icon" aria-hidden="true"><Trophy size={19} strokeWidth={1.5} /></span>
        </div>
          <div className="cc-periods">
            {PERIODS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  const nextViewKey = `${userId}:${id}`;
                  const cached = cacheEnabled ? readCommunityCompetitionCache({ userId, period: id }) : null;
                  activeViewKeyRef.current = nextViewKey;
                  setPeriod(id);
                  setView(cached
                    ? { state: cached.data.state, data: cached.data, error: '' }
                    : { state: 'loading', data: null, error: '' });
                }}
                disabled={view.state === 'loading' || joining}
                className="cc-period"
                aria-pressed={period === id}
              >
                {tt(`competition.period.${id}`, label)}
              </button>
            ))}
          </div>
      </header>

      <div className={`cc-body ${contentDimmed ? 'pointer-events-none select-none blur-[0.5px] brightness-[0.62]' : ''}`}>
        {view.state === 'loading' ? (
          <StatusCard icon={<Loader2 className="h-7 w-7 animate-spin" />} title={tt('competition.loading', '正在读取真实收盘快照')} desc={tt('competition.loadingDesc', '正在验证社区资料、参赛状态和已锁定的收盘收益快照。')} />
        ) : null}
        {view.state === 'profile_required' ? (
          <StatusCard icon={<UserRound size={26} strokeWidth={1.5} />} title={tt('competition.profileRequired', '请先完成社区资料')} desc={tt('competition.profileRequiredDesc', '正在前往设置页，请选择社区昵称和默认头像并保存后再参加比赛。')} />
        ) : null}
        {view.state === 'join_required' ? <CompetitionContent data={null} period={period} language={language} tt={tt} /> : null}
        {view.state === 'waiting_snapshot' ? (
          <StatusCard
            icon={<Clock3 size={26} strokeWidth={1.5} />}
            title={tt('competition.waitingTitle', '等待下一次真实收盘快照')}
            desc={view.data?.eligibleAfterSnapshotDate
              ? tt('competition.waitingEligibleDesc', '已加入收益比赛。排名将在 {{date}} 后的首个收盘快照生成；此前不展示估算或模拟数据。', { date: keepTogether(formatDate(view.data.eligibleAfterSnapshotDate, language)) })
              : tt('competition.waitingDesc', '已加入收益比赛。排名从下一份有效收盘快照开始；此前不展示估算或模拟数据。')}
            note={tt('competition.dataDisclosure', '收益基于正式交易记录与服务端收盘价快照，不代表券商认证。')}
          />
        ) : null}
        {view.state === 'ready' ? (
          <CompetitionContent
            data={view.data}
            period={period}
            language={language}
            tt={tt}
            leaderboardRefreshing={refreshingLeaderboardViewKey === activeViewKey}
          />
        ) : null}
        {view.state === 'error' ? (
          <StatusCard icon="!" title={tt('competition.loadFailed', '收益比赛读取失败')} desc={view.error || tt('competition.tryAgainLater', '请稍后重试。')} actionLabel={tt('competition.retry', '重新读取')} onAction={() => load({ showLoading: true, bypassFailureCooldown: true })} />
        ) : null}
      </div>

      {view.state === 'join_required' ? <JoinSheet onJoin={join} onDecline={decline} joining={joining} error={joinError} tt={tt} /> : null}
    </main>
  );
}
