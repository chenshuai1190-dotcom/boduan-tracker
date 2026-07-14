import React from 'react';
import { ArrowLeft, Info, Loader2, RefreshCw, Trophy, X } from 'lucide-react';
import {
  clearCommunityCompetitionCache,
  getCommunityCompetitionRefreshDecision,
  readCommunityCompetitionCache,
  requestCommunityCompetitionRefresh,
  writeCommunityCompetitionCache,
} from '../lib/communityCompetitionCache.js';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import { communityCompetitionApi } from '../lib/communityCompetitionApi.js';
import { t } from '../lib/i18n.js';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PROFIT = '#ff5b50';
const LOSS = '#36c49a';
const NEUTRAL = 'rgba(255,255,255,0.58)';
const GOLD = '#f6b54b';

const PERIODS = [
  ['day', '日榜'],
  ['week', '周榜'],
  ['month', '月榜'],
  ['year', '年榜'],
];

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

function formatCompactDate(value) {
  const parts = String(value || '').slice(0, 10).split('-');
  if (parts.length !== 3 || !/^\d{2}$/.test(parts[1]) || !/^\d{2}$/.test(parts[2])) return '--';
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

function MetricBlock({ label, value, color = NEUTRAL }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap text-[10px] leading-4 text-white/[0.42]">{label}</div>
      <div className="mt-1.5 whitespace-nowrap text-[15px] tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, color = 'rgba(255,255,255,0.86)' }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <div className="truncate text-[10.5px] text-white/[0.38]">{label}</div>
      <div className="mt-1.5 truncate text-[17px] tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
    </div>
  );
}

function Avatar({ avatarKey, rank }) {
  const avatar = getCommunityAvatarOption(avatarKey);
  const rankValue = Number(rank);
  const ring = rankValue === 1
    ? 'border-[#f6b54b]/50'
    : rankValue === 2
      ? 'border-[#93a4ff]/40'
      : rankValue === 3
        ? 'border-[#d97745]/45'
        : 'border-[#2a313b]/90';
  return (
    <div data-rank-avatar className={`h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-[#070a0f] shadow-[0_6px_16px_rgba(0,0,0,0.28)] ${ring}`}>
      <img src={avatar.src} alt="" className="h-full w-full scale-[1.15] object-cover" draggable={false} />
    </div>
  );
}

function RankRow({ row, self = false, selected = false, onSelect }) {
  if (!row) return null;
  const rank = isFiniteValue(row.rank) ? String(Math.trunc(Number(row.rank))) : '--';
  const rankValue = Number(row.rank);
  const rankColor = rankValue === 1 ? '#f8c45c' : rankValue === 2 ? '#8ea2ff' : rankValue === 3 ? '#d46b42' : 'rgba(255,255,255,0.64)';
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
      className={`grid w-full grid-cols-[26px_minmax(0,1fr)_68px_72px] items-center gap-1.5 border-t border-white/[0.045] px-3 py-2.5 text-left outline-none transition-colors active:bg-white/[0.045] focus:outline-none ${self ? 'rounded-xl border-t-0 bg-[#2a241c]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]' : ''} ${selected ? 'bg-white/[0.055] ring-1 ring-inset ring-white/[0.055]' : ''}`}
      aria-label={`${row.nickname || '--'} ${formatPercent(row.returnPct)}`}
      aria-expanded={selected}
    >
      <div className="text-center text-[15px] tabular-nums" style={{ color: rankColor, fontFamily: NUMBER_FONT }}>{rank}</div>
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar avatarKey={row.avatarKey} rank={rankValue} />
        <div className={`truncate text-[13.5px] ${self ? 'text-white/[0.94]' : 'text-white/[0.72]'}`}>{row.nickname || '--'}</div>
      </div>
      <div className="text-right text-[12.5px] tabular-nums" style={{ color: valueColor(row.returnPct), fontFamily: NUMBER_FONT }}>{formatPercent(row.returnPct)}</div>
      <div className="text-right text-[12.5px] tabular-nums" style={{ color: valueColor(row.outperformancePct), fontFamily: NUMBER_FONT }}>{formatPercent(row.outperformancePct)}</div>
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
        className="fixed z-[131] w-[320px] max-w-[calc(100vw-20px)] rounded-[20px] bg-[linear-gradient(135deg,rgba(76,126,158,0.58)_0%,rgba(142,75,112,0.52)_44%,rgba(70,73,82,0.2)_100%)] p-px shadow-[0_22px_70px_rgba(0,0,0,0.7)]"
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
            className={`absolute h-3.5 w-3.5 rotate-45 bg-[linear-gradient(135deg,rgba(76,126,158,0.72),rgba(142,75,112,0.62))] p-px ${layout.placement === 'below' ? '-top-[7px]' : '-bottom-[7px]'}`}
            style={{ left: layout.arrowLeft - 7 }}
          >
            <span className="block h-full w-full bg-[#181b22]" />
          </span>
        ) : null}
        <div className="relative rounded-[19px] bg-[linear-gradient(150deg,rgba(25,28,35,0.99),rgba(12,15,21,0.995))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/[0.12] bg-[#070a0f]">
              <img src={avatar.src} alt="" className="h-full w-full scale-[1.15] object-cover" draggable={false} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[19px] text-white/[0.92]">{row.nickname || '--'}</div>
              <div className="mt-1 text-[10px] text-white/[0.34]">#{isFiniteValue(row.rank) ? Math.trunc(Number(row.rank)) : '--'} · {formatDate(snapshotDate, language)}</div>
            </div>
          </div>
          <div className="mt-5 text-[11px] text-white/[0.38]">{periodMetricLabel}</div>
          <div className="mt-1 text-[30px] leading-none tabular-nums" style={{ color: valueColor(row.returnPct), fontFamily: NUMBER_FONT }}>{formatPercent(row.returnPct)}</div>
          <div className="mt-5 text-[11px] text-white/[0.38]">{tt('competition.closeHoldingSymbols', '收盘持仓代码')}</div>
          <div className="mt-2.5 max-h-[112px] overflow-y-auto overscroll-contain pr-1">
            {!holdingsAvailable ? (
              <div className="text-[12px] text-white/[0.46]">{tt('competition.holdingsUnavailable', '持仓暂不可用')}</div>
            ) : holdingSymbols.length ? (
              <div className="flex flex-wrap gap-2">
                {holdingSymbols.map((symbol) => (
                  <span key={symbol} className="rounded-lg border border-white/[0.055] bg-white/[0.055] px-2.5 py-1.5 text-[12px] leading-none text-white/[0.74]">{symbol}</span>
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
    return <div className={`flex ${compact ? 'h-[54px]' : 'h-[72px]'} items-center justify-center text-[12px] text-white/28`}>--</div>;
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
            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/50 shadow-[0_0_12px_rgba(246,181,75,0.28)]" style={{ left: `calc(${width}% - 7px)`, background: color }} />
          </>
        ) : null}
      </div>
      <div className="text-right text-[11px] tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{formatPercent(value)}</div>
    </div>
  );
}

function JoinSheet({ onJoin, onDecline, joining, error, tt }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/[0.48] backdrop-blur-[2px]">
      <div className="w-full max-w-[430px] rounded-t-[30px] border border-white/[0.08] bg-[linear-gradient(165deg,rgba(28,30,36,0.98),rgba(15,17,23,0.98)_62%,rgba(10,12,18,0.99))] px-6 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-3 shadow-[0_-28px_80px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mx-auto h-1 w-11 rounded-full bg-white/[0.18]" />
        <div className="mt-6 flex items-center justify-center">
          <div className="flex-1" />
          <div className="text-[18px] font-semibold text-white/[0.92]">{tt('competition.joinTitle', '加入收益比赛')}</div>
          <div className="flex flex-1 justify-end">
            <button type="button" onClick={onDecline} disabled={joining} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white/[0.58] active:scale-95 disabled:opacity-40" aria-label={tt('competition.closeJoin', '关闭加入收益比赛')}>
              <X className="h-5 w-5" strokeWidth={1.7} />
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="relative flex h-[92px] w-[112px] items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[#f6b54b]/20 blur-2xl" />
            <Trophy className="relative h-[68px] w-[68px] text-[#f6bd61] drop-shadow-[0_0_16px_rgba(246,181,75,0.45)]" strokeWidth={1.45} />
          </div>
        </div>
        <div className="mx-auto mt-5 max-w-[276px] text-center text-[13px] leading-6 text-white/[0.58] [text-wrap:balance]">
          {tt('competition.joinDesc', '自愿加入后即可查看真实收益排行榜，请选择是否加入。')}
        </div>
        {error ? <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-center text-[12px] text-rose-200">{error}</div> : null}
        <div className="mt-8 grid grid-cols-2 gap-5">
          <button type="button" onClick={onDecline} disabled={joining} className="h-[52px] rounded-[13px] border border-[#f6b54b]/65 bg-transparent text-[14px] text-white/[0.82] active:scale-[0.98] disabled:opacity-40">
            {tt('competition.notJoin', '暂不加入')}
          </button>
          <button type="button" onClick={onJoin} disabled={joining} className="flex h-[52px] items-center justify-center gap-2 rounded-[13px] bg-gradient-to-r from-[#ffb13d] to-[#ffab32] text-[14px] font-medium text-[#2d1a05] shadow-[0_12px_30px_rgba(246,181,75,0.22)] active:scale-[0.98] disabled:opacity-55">
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
    <section className="mx-0.5 mt-8 rounded-[20px] border border-white/[0.075] bg-[#0b1017]/98 px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f6b54b]/10 text-[30px]">{icon}</div>
      <h2 className="mt-5 text-[17px] font-semibold text-white/88">{title}</h2>
      <p className="mx-auto mt-3 max-w-[286px] text-[13px] leading-[1.8] text-white/42 [text-wrap:pretty]">{protectHintText(desc)}</p>
      {note ? <p className="mx-auto mt-3 max-w-[286px] text-[10.5px] leading-[1.7] text-white/28 [text-wrap:pretty]">{protectHintText(note)}</p> : null}
      {actionLabel ? (
        <button type="button" onClick={onAction} disabled={busy} className="mx-auto mt-6 flex h-11 min-w-[148px] items-center justify-center gap-2 rounded-xl border border-[#f6b54b]/25 bg-[#f6b54b]/12 px-5 text-[13px] font-semibold text-[#ffd18a] active:scale-95 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function CompetitionContent({ data, period, language, tt }) {
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
    <div className="space-y-3 px-0.5 pt-3">
      <section className="overflow-hidden rounded-[17px] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(16,21,29,0.96),rgba(9,13,20,0.98))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <div className="flex items-end gap-3">
          <div className="text-[12px] text-white/[0.62]">{tt('competition.myRank', '我的排名')}</div>
          <div className="text-[32px] font-semibold leading-none text-[#ffad3a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{isFiniteValue(self?.rank) ? `#${Math.trunc(Number(self.rank))}` : '--'}</div>
        </div>
        <div className="mt-3 grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4">
          <div data-competition-self-avatar className="h-14 w-14 overflow-hidden rounded-full border border-white/[0.1] bg-[#070a0f] shadow-[0_8px_20px_rgba(0,0,0,0.34)]">
            {selfAvatar ? <img src={selfAvatar.src} alt="" className="h-full w-full scale-[1.15] object-cover" draggable={false} /> : null}
          </div>
          <div data-competition-hero-metrics className="grid min-w-0 grid-cols-3 divide-x divide-white/[0.08]">
            <MetricBlock label={periodMetricLabel} value={formatPercent(self?.returnPct)} color={valueColor(self?.returnPct)} />
            <div className="pl-2"><MetricBlock label={tt('competition.nasdaq100', 'QQQ 基准')} value={formatPercent(data?.benchmarkReturnPct)} color={valueColor(data?.benchmarkReturnPct)} /></div>
            <div className="pl-2"><MetricBlock label={tt('competition.outperformNasdaq', '跑赢 QQQ')} value={formatPercent(self?.outperformancePct)} color={valueColor(self?.outperformancePct)} /></div>
          </div>
        </div>
        <div className="mt-2 whitespace-nowrap text-right text-[10px] text-[#7f858e]">
          {ready ? tt('competition.snapshotAsOf', '数据更新{{date}}', { date: formatCompactDate(data?.asOfDate) }) : '--'}
        </div>
      </section>

      <section className="grid grid-cols-4 divide-x divide-white/[0.08] rounded-[16px] border border-white/[0.07] bg-[#0c1118]/95 px-1 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <StatCard label={tt('competition.participants', '参赛人数')} value={formatInteger(stats.participants, language)} />
        <StatCard label={tt('competition.beatNasdaq', '跑赢 QQQ')} value={formatPercent(stats.beatRatePct, 0)} color={valueColor(stats.beatRatePct)} />
        <StatCard label={tt('competition.profitableAccounts', '赚钱账户')} value={formatPercent(stats.profitableRatePct, 0)} color={valueColor(stats.profitableRatePct)} />
        <StatCard label={tt('competition.averageReturn', '平均收益率')} value={formatPercent(stats.averageReturnPct)} color={valueColor(stats.averageReturnPct)} />
      </section>

      <section className="relative overflow-visible rounded-[17px] border border-white/[0.075] bg-[#0b1017]/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <div className="grid grid-cols-[minmax(0,1fr)_68px_72px] items-center gap-1.5 px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[13px] text-white/[0.88]">
            {tt('competition.rankingTitle', '收益率排行榜')}
            <Info className="h-3.5 w-3.5 text-white/[0.38]" strokeWidth={1.8} />
          </div>
          <div className="text-right text-[11px] text-white/[0.44]">{tt('competition.returnRate', '收益率')}</div>
          <div className="text-right text-[11px] text-white/[0.44]">{tt('competition.outperformShort', '跑赢 QQQ')}</div>
        </div>
        <div className="px-1 pb-1">
          {leaders.length ? leaders.map((row, index) => <RankRow key={`${row?.rank ?? index}-${row?.nickname ?? ''}`} row={row} self={index === selfLeaderIndex} selected={selection?.row === row} onSelect={selectRow} />) : (
            <div className="border-t border-white/[0.045] px-4 py-10 text-center text-[12px] text-white/28">{ready ? tt('competition.noRanking', '当前周期暂无有效排行') : '--'}</div>
          )}
          {self && selfLeaderIndex < 0 ? <RankRow row={self} self selected={selection?.row === self} onSelect={selectRow} /> : null}
        </div>
        <div className="border-t border-white/[0.045] px-4 py-2.5 text-center text-[10px] leading-[1.65] text-white/25 [text-wrap:balance]">
          {protectHintText(tt('competition.dataDisclosure', '收益基于正式交易记录与服务端收盘价快照，不代表券商认证。'))}
        </div>
        {selection ? <HoldingPopover selection={selection} periodMetricLabel={periodMetricLabel} snapshotDate={data?.asOfDate} language={language} onClose={() => setSelection(null)} tt={tt} /> : null}
      </section>

      <section className="rounded-[17px] border border-white/[0.075] bg-[#0b1017]/98 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[14px] text-white/[0.88]">
            {baselineTitle}
            <Info className="h-3.5 w-3.5 text-white/[0.38]" strokeWidth={1.8} />
          </div>
          <div className="whitespace-nowrap text-[9.5px] text-white/24">
            {ready ? tt('competition.calculationStart', '起算 {{date}}', { date: formatDate(data?.calculationStartDate, language) }) : '--'}
          </div>
        </div>
        <div className="grid grid-cols-[98px_minmax(0,1fr)] gap-5">
          <div className="min-w-0">
            <div className="text-[12px] text-white/[0.42]">{tt('competition.nasdaq100Index', 'QQQ ETF')}</div>
            <div className="mt-4 text-[20px] tabular-nums" style={{ color: valueColor(data?.benchmarkReturnPct), fontFamily: NUMBER_FONT }}>{formatPercent(data?.benchmarkReturnPct)}</div>
            <div className="mt-1"><TrendChart benchmark={trend.benchmark} compact /></div>
          </div>
          <div className="min-w-0 space-y-4 pt-2">
            <ProgressLine label={tt('competition.communityAverage', '社区平均')} value={stats.averageReturnPct} maxMagnitude={maxMagnitude} />
            <ProgressLine label={tt('competition.top10Average', 'TOP10 平均')} value={stats.top10AverageReturnPct} maxMagnitude={maxMagnitude} />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function CommunityCompetitionPage({ ctx = {} }) {
  const {
    closeCommunityCompetition,
    communityCompetitionClient = communityCompetitionApi,
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
  const [joining, setJoining] = React.useState(false);
  const [joinError, setJoinError] = React.useState('');
  const joiningRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const activeViewKey = `${userId}:${period}`;
  const activeViewKeyRef = React.useRef(activeViewKey);
  const settledViewKeyRef = React.useRef('');
  activeViewKeyRef.current = activeViewKey;
  const profileRedirectedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = React.useCallback(async ({ showLoading = false } = {}) => {
    const requestViewKey = `${userId}:${period}`;
    const cached = cacheEnabled ? readCommunityCompetitionCache({ userId, period }) : null;
    if (mountedRef.current && showLoading && !cached) {
      setView({ state: 'loading', data: null, error: '' });
    }
    if (mountedRef.current) setJoinError('');
    try {
      const result = cacheEnabled
        ? await requestCommunityCompetitionRefresh({
          userId,
          period,
          fetcher: () => communityCompetitionClient.fetch({ supabase, period }),
        })
        : { data: await communityCompetitionClient.fetch({ supabase, period }), entry: null };
      if (mountedRef.current && activeViewKeyRef.current === requestViewKey) {
        settledViewKeyRef.current = requestViewKey;
        setView({ state: result.data.state, data: result.data, error: '' });
      }
      return result;
    } catch (error) {
      const fallback = cacheEnabled ? readCommunityCompetitionCache({ userId, period }) : null;
      if (mountedRef.current && activeViewKeyRef.current === requestViewKey) {
        settledViewKeyRef.current = requestViewKey;
        setView(fallback
          ? { state: fallback.data.state, data: fallback.data, error: '' }
          : { state: 'error', data: null, error: error?.message || tt('competition.loadFailed', '收益比赛读取失败') });
      }
      return null;
    } finally {
      if (
        mountedRef.current
        && activeViewKeyRef.current === requestViewKey
        && cacheEnabled
        && readCommunityCompetitionCache({ userId, period })
      ) {
        setRefreshTick((current) => current + 1);
      }
    }
  }, [cacheEnabled, communityCompetitionClient, period, supabase, tt, userId]);

  React.useEffect(() => {
    let timerId = 0;
    const cached = cacheEnabled ? readCommunityCompetitionCache({ userId, period }) : null;
    if (cached) {
      settledViewKeyRef.current = activeViewKey;
      setView({ state: cached.data.state, data: cached.data, error: '' });
    }
    const decision = getCommunityCompetitionRefreshDecision({ entry: cached });
    if ((!cached && settledViewKeyRef.current !== activeViewKey) || (cached && decision.shouldRefresh)) {
      load({ showLoading: !cached });
    } else if (cached && Number.isFinite(decision.nextCheckAt)) {
      const delay = Math.min(2_147_000_000, Math.max(1_000, decision.nextCheckAt - Date.now()));
      timerId = window.setTimeout(() => setRefreshTick((current) => current + 1), delay);
    }
    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [activeViewKey, cacheEnabled, load, period, refreshTick, userId]);

  React.useEffect(() => {
    const recheck = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setRefreshTick((current) => current + 1);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

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
      if (cacheEnabled) clearCommunityCompetitionCache(userId);
      const normalizedData = { ...data, period };
      if (cacheEnabled) writeCommunityCompetitionCache({ userId, period, data: normalizedData });
      settledViewKeyRef.current = `${userId}:${period}`;
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
    <main className="relative mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[radial-gradient(circle_at_50%_-12%,rgba(24,45,70,0.18),transparent_42%),#05070b] pb-[calc(env(safe-area-inset-bottom)+92px)] text-white" style={{ fontFamily: PAGE_FONT }}>
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#05070b]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={closeCommunityCompetition} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.72] active:scale-95" aria-label={tt('competition.back', '返回')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[18px] font-normal tracking-[0.01em] text-white/[0.94]">{tt('competition.title', '收益比赛')} <span className="text-[15px]">🏆</span></h1>
            <div className="mt-0.5 truncate text-[12px] text-white/[0.42]">{tt('competition.subtitle', '社区投资者收益排行')}</div>
          </div>
          <div className="grid h-11 w-[164px] grid-cols-4 rounded-full bg-white/[0.055] p-1">
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
                className={`rounded-full text-[11px] transition disabled:opacity-50 ${period === id ? 'bg-[#ffb13d] text-[#2a1905] shadow-[0_8px_18px_rgba(246,181,75,0.2)]' : 'text-white/[0.42]'}`}
              >
                {tt(`competition.period.${id}`, label)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`px-3 ${contentDimmed ? 'pointer-events-none select-none blur-[0.5px] brightness-[0.62]' : ''}`}>
        {view.state === 'loading' ? (
          <StatusCard icon={<Loader2 className="h-7 w-7 animate-spin text-[#f6b54b]" />} title={tt('competition.loading', '正在读取真实收盘快照')} desc={tt('competition.loadingDesc', '正在验证社区资料、参赛状态和已锁定的收盘收益快照。')} />
        ) : null}
        {view.state === 'profile_required' ? (
          <StatusCard icon="👤" title={tt('competition.profileRequired', '请先完成社区资料')} desc={tt('competition.profileRequiredDesc', '正在前往设置页，请选择社区昵称和默认头像并保存后再参加比赛。')} />
        ) : null}
        {view.state === 'join_required' ? <CompetitionContent data={null} period={period} language={language} tt={tt} /> : null}
        {view.state === 'waiting_snapshot' ? (
          <StatusCard
            icon="🕰️"
            title={tt('competition.waitingTitle', '等待下一次真实收盘快照')}
            desc={view.data?.eligibleAfterSnapshotDate
              ? tt('competition.waitingEligibleDesc', '已加入收益比赛。排名将在 {{date}} 后的首个收盘快照生成；此前不展示估算或模拟数据。', { date: keepTogether(formatDate(view.data.eligibleAfterSnapshotDate, language)) })
              : tt('competition.waitingDesc', '已加入收益比赛。排名从下一份有效收盘快照开始；此前不展示估算或模拟数据。')}
            note={tt('competition.dataDisclosure', '收益基于正式交易记录与服务端收盘价快照，不代表券商认证。')}
          />
        ) : null}
        {view.state === 'ready' ? <CompetitionContent data={view.data} period={period} language={language} tt={tt} /> : null}
        {view.state === 'error' ? (
          <StatusCard icon="!" title={tt('competition.loadFailed', '收益比赛读取失败')} desc={view.error || tt('competition.tryAgainLater', '请稍后重试。')} actionLabel={tt('competition.retry', '重新读取')} onAction={() => load({ showLoading: true })} />
        ) : null}
      </div>

      {view.state === 'join_required' ? <JoinSheet onJoin={join} onDecline={decline} joining={joining} error={joinError} tt={tt} /> : null}
    </main>
  );
}
