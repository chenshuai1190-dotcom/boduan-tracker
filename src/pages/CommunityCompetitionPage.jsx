import React from 'react';
import { ArrowLeft, Info, Trophy, X } from 'lucide-react';
import { t } from '../lib/i18n.js';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const JOIN_STORAGE_KEY = 'boduan_community_competition_joined_v1';
const PROFIT = '#ff5b50';
const GREEN = '#36c49a';
const GOLD = '#f6b54b';

const PERIODS = [
  ['day', '日榜'],
  ['week', '周榜'],
  ['month', '月榜'],
  ['year', '年榜'],
];

const PERIOD_STATS = {
  day: { ownRank: 18, ownReturn: 12.86, benchmark: 0.42, outperformance: 12.44, participants: 12486, beatRate: 63, profitRate: 78, averageReturn: 5.37, top10Average: 18.36, benchmarkLabel: '本日收益率', baselineTitle: '本日基准' },
  week: { ownRank: 26, ownReturn: 18.72, benchmark: 1.84, outperformance: 16.88, participants: 12820, beatRate: 58, profitRate: 71, averageReturn: 6.42, top10Average: 24.91, benchmarkLabel: '本周收益率', baselineTitle: '本周基准' },
  month: { ownRank: 42, ownReturn: 21.48, benchmark: 4.32, outperformance: 17.16, participants: 13204, beatRate: 61, profitRate: 74, averageReturn: 8.18, top10Average: 31.64, benchmarkLabel: '本月收益率', baselineTitle: '本月基准' },
  year: { ownRank: 96, ownReturn: 38.65, benchmark: 13.72, outperformance: 24.93, participants: 14112, beatRate: 55, profitRate: 69, averageReturn: 16.52, top10Average: 52.70, benchmarkLabel: '本年收益率', baselineTitle: '本年基准' },
};

const LEADERS = [
  ['1', '🐯', 'Alpha陈', 28.63, 28.21],
  ['2', '🌙', 'ValueLee', 24.17, 23.75],
  ['3', '🧑‍🚀', 'QuantM', 21.09, 20.67],
  ['4', '🐂', '牛牛哥', 19.64, 19.22],
  ['5', '🌌', 'HangzhouQ', 17.88, 17.46],
  ['6', '🌃', 'TT_Invest', 16.32, 15.90],
  ['7', '🛰️', 'ChenS', 15.07, 14.65],
  ['8', '🐶', 'BluePapa', 13.54, 13.12],
  ['9', '🌈', 'GrowthX', 12.91, 12.49],
];

const SELF_ROW = ['18', '🐯', '我自己', 12.86, 12.44];

function readJoined() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(JOIN_STORAGE_KEY) === 'joined';
  } catch {
    return false;
  }
}

function writeJoined() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(JOIN_STORAGE_KEY, 'joined');
  } catch {}
}

function pct(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function Sparkline({ compact = false }) {
  return (
    <svg viewBox="0 0 168 72" className={compact ? 'h-[54px] w-full' : 'h-[72px] w-full'} aria-hidden="true">
      <defs>
        <linearGradient id="competitionSparkGlow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(246,181,75,0.28)" />
          <stop offset="100%" stopColor="rgba(255,91,80,0.02)" />
        </linearGradient>
      </defs>
      <path d="M4 62 C18 58 20 49 31 46 C43 42 41 35 52 36 C64 37 66 24 79 26 C92 28 95 19 109 17 C122 15 127 11 139 8 C151 5 156 2 164 4 L164 72 L4 72 Z" fill="url(#competitionSparkGlow)" />
      <path d="M4 63 C20 59 25 54 39 53 C54 52 58 43 70 45 C82 47 89 39 101 38 C116 37 123 31 136 30 C148 29 154 24 164 22" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 62 C18 58 20 49 31 46 C43 42 41 35 52 36 C64 37 66 24 79 26 C92 28 95 19 109 17 C122 15 127 11 139 8 C151 5 156 2 164 4" fill="none" stroke="#d05a32" strokeWidth="2" strokeLinecap="round" />
      <circle cx="164" cy="4" r="2.5" fill="#f6b54b" />
    </svg>
  );
}

function MetricBlock({ label, value, color = 'rgba(255,255,255,0.88)' }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] text-white/[0.42]">{label}</div>
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

function Avatar({ icon, rank }) {
  const ring = rank === '1' ? 'border-[#f6b54b]/50' : rank === '2' ? 'border-[#93a4ff]/40' : rank === '3' ? 'border-[#d97745]/45' : 'border-[#2a313b]/90';
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border ${ring} bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),rgba(255,255,255,0.02)_55%,rgba(0,0,0,0.22))] text-[18px] shadow-[0_6px_16px_rgba(0,0,0,0.28)]`}>
      {icon}
    </div>
  );
}

function RankRow({ row, self = false }) {
  const [rank, icon, name, returnPct, outperformance] = row;
  const rankColor = rank === '1' ? '#f8c45c' : rank === '2' ? '#8ea2ff' : rank === '3' ? '#d46b42' : 'rgba(255,255,255,0.64)';
  return (
    <div className={`grid grid-cols-[34px_minmax(0,1fr)_82px_82px] items-center gap-2 border-t border-white/[0.045] px-3 py-2.5 ${self ? 'rounded-xl border-t-0 bg-[#2a241c]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]' : ''}`}>
      <div className="text-center text-[15px] tabular-nums" style={{ color: rankColor, fontFamily: NUMBER_FONT }}>{rank}</div>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar icon={icon} rank={rank} />
        <div className={`truncate text-[13.5px] ${self ? 'text-white/[0.94]' : 'text-white/[0.72]'}`}>{name}</div>
      </div>
      <div className="text-right text-[13.5px] tabular-nums" style={{ color: PROFIT, fontFamily: NUMBER_FONT }}>{pct(returnPct)}</div>
      <div className="text-right text-[13.5px] tabular-nums" style={{ color: GREEN, fontFamily: NUMBER_FONT }}>{pct(outperformance)}</div>
    </div>
  );
}

function ProgressLine({ label, value, max = 30, color = GOLD }) {
  const width = Math.max(0, Math.min(100, (Number(value) / max) * 100));
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)_52px] items-center gap-2">
      <div className="text-[11px] text-white/[0.58]">{label}</div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.055]">
        <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#ff9e2f] to-[#ffc65e]" style={{ width: `${width}%` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/60 bg-[#ffb347] shadow-[0_0_12px_rgba(246,181,75,0.5)]" style={{ left: `calc(${width}% - 7px)` }} />
      </div>
      <div className="text-right text-[11px] tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{pct(value)}</div>
    </div>
  );
}

function JoinSheet({ onJoin, onDecline, tt }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/[0.48] backdrop-blur-[2px]">
      <div className="w-full max-w-[430px] rounded-t-[30px] border border-white/[0.08] bg-[linear-gradient(165deg,rgba(28,30,36,0.98),rgba(15,17,23,0.98)_62%,rgba(10,12,18,0.99))] px-6 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-3 shadow-[0_-28px_80px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mx-auto h-1 w-11 rounded-full bg-white/[0.18]" />
        <div className="mt-6 flex items-center justify-center">
          <div className="flex-1" />
          <div className="text-[18px] font-semibold text-white/[0.92]">{tt('competition.joinTitle', '加入收益比赛')}</div>
          <div className="flex flex-1 justify-end">
            <button type="button" onClick={onDecline} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white/[0.58] active:scale-95" aria-label={tt('competition.closeJoin', '关闭加入收益比赛')}>
              <X className="h-5 w-5" strokeWidth={1.7} />
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="relative flex h-[92px] w-[112px] items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[#f6b54b]/20 blur-2xl" />
            <Trophy className="relative h-[68px] w-[68px] text-[#f6bd61] drop-shadow-[0_0_16px_rgba(246,181,75,0.45)]" strokeWidth={1.45} />
            <span className="absolute right-1 top-3 h-1.5 w-1.5 rounded-full bg-[#ffe0a0] shadow-[0_0_12px_#ffd37a]" />
            <span className="absolute left-3 bottom-5 h-1 w-1 rounded-full bg-[#ffd37a] shadow-[0_0_10px_#ffd37a]" />
          </div>
        </div>
        <div className="mx-auto mt-5 max-w-[270px] text-center text-[14px] leading-7 text-white/[0.58]">
          {tt('competition.joinDesc', '本功能需要您自己自愿加入后，才可以进入排行榜单，请您选择是否加入。')}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-5">
          <button type="button" onClick={onDecline} className="h-[52px] rounded-[13px] border border-[#f6b54b]/65 bg-transparent text-[14px] text-white/[0.82] active:scale-[0.98]">
            {tt('competition.notJoin', '暂不加入')}
          </button>
          <button type="button" onClick={onJoin} className="h-[52px] rounded-[13px] bg-gradient-to-r from-[#ffb13d] to-[#ffab32] text-[14px] font-medium text-[#2d1a05] shadow-[0_12px_30px_rgba(246,181,75,0.22)] active:scale-[0.98]">
            {tt('competition.confirmJoin', '确认加入')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityCompetitionPage({ ctx = {} }) {
  const {
    closeCommunityCompetition,
    language = 'zh',
  } = ctx;
  const tt = React.useCallback((key, fallback, vars) => t(language, key, fallback, vars), [language]);
  const [period, setPeriod] = React.useState('day');
  const [joined, setJoined] = React.useState(readJoined);
  const stats = PERIOD_STATS[period] || PERIOD_STATS.day;

  const join = () => {
    writeJoined();
    setJoined(true);
  };

  const decline = () => {
    if (typeof closeCommunityCompetition === 'function') {
      closeCommunityCompetition();
      return;
    }
    setJoined(false);
  };

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[radial-gradient(circle_at_50%_-12%,rgba(24,45,70,0.18),transparent_42%),#05070b] pb-[calc(env(safe-area-inset-bottom)+92px)] text-white" style={{ fontFamily: PAGE_FONT }}>
      <div className={joined ? '' : 'pointer-events-none select-none blur-[0.5px] brightness-[0.72]'}>
        <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.07] bg-[#05070b]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={closeCommunityCompetition} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.72] active:scale-95" aria-label={tt('competition.back', '返回')}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[21px] font-semibold leading-7 text-white/[0.95]">{tt('competition.title', '收益比赛')} <span className="text-[18px]">🏆</span></h1>
              <div className="mt-0.5 truncate text-[12px] text-white/[0.42]">{tt('competition.subtitle', '社区投资者收益排行')}</div>
            </div>
            <div className="grid h-11 w-[164px] grid-cols-4 rounded-full bg-white/[0.055] p-1">
              {PERIODS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setPeriod(id)} className={`rounded-full text-[11px] transition ${period === id ? 'bg-[#ffb13d] text-[#2a1905] shadow-[0_8px_18px_rgba(246,181,75,0.2)]' : 'text-white/[0.42]'}`}>
                  {tt(`competition.period.${id}`, label)}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="space-y-3 px-0.5 pt-3">
          <section className="overflow-hidden rounded-[17px] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(16,21,29,0.96),rgba(9,13,20,0.98))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(104px,0.75fr)] gap-2">
              <div className="min-w-0">
                <div className="flex items-end gap-3">
                  <div className="text-[12px] text-white/[0.62]">{tt('competition.myRank', '我的排名')}</div>
                  <div className="text-[32px] font-semibold leading-none text-[#ffad3a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>#{stats.ownRank}</div>
                </div>
                <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08]">
                  <MetricBlock label={stats.benchmarkLabel} value={pct(stats.ownReturn)} color={PROFIT} />
                  <div className="pl-2"><MetricBlock label={tt('competition.nasdaq100', '纳斯达克100')} value={pct(stats.benchmark)} color={PROFIT} /></div>
                  <div className="pl-2"><MetricBlock label={tt('competition.outperformNasdaq', '跑赢纳指')} value={pct(stats.outperformance)} color={GREEN} /></div>
                </div>
              </div>
              <div className="self-end">
                <Sparkline />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-4 divide-x divide-white/[0.08] rounded-[16px] border border-white/[0.07] bg-[#0c1118]/95 px-1 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <StatCard label={tt('competition.participants', '参赛人数')} value={stats.participants.toLocaleString('en-US')} />
            <StatCard label={tt('competition.beatNasdaq', '跑赢纳指')} value={`${stats.beatRate}%`} color={GREEN} />
            <StatCard label={tt('competition.profitableAccounts', '赚钱账户')} value={`${stats.profitRate}%`} color={GREEN} />
            <StatCard label={tt('competition.averageReturn', '平均收益率')} value={pct(stats.averageReturn)} color={PROFIT} />
          </section>

          <section className="overflow-hidden rounded-[17px] border border-white/[0.075] bg-[#0b1017]/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div className="grid grid-cols-[minmax(0,1fr)_82px_82px] items-center px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-[13px] text-white/[0.88]">
                {tt('competition.rankingTitle', '收益率排行榜')}
                <Info className="h-3.5 w-3.5 text-white/[0.38]" strokeWidth={1.8} />
              </div>
              <div className="text-right text-[11px] text-white/[0.44]">{tt('competition.returnRate', '收益率')}</div>
              <div className="text-right text-[11px] text-white/[0.44]">{tt('competition.outperformShort', '跑赢纳指')}</div>
            </div>
            <div className="px-1 pb-1">
              {LEADERS.map((row) => <RankRow key={row[0]} row={row} />)}
              <RankRow row={SELF_ROW} self />
            </div>
          </section>

          <section className="rounded-[17px] border border-white/[0.075] bg-[#0b1017]/98 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div className="mb-3 flex items-center gap-1.5 text-[14px] text-white/[0.88]">
              {stats.baselineTitle}
              <Info className="h-3.5 w-3.5 text-white/[0.38]" strokeWidth={1.8} />
            </div>
            <div className="grid grid-cols-[98px_minmax(0,1fr)] gap-5">
              <div className="min-w-0">
                <div className="text-[12px] text-white/[0.42]">{tt('competition.nasdaq100Index', '纳斯达克100指数')}</div>
                <div className="mt-4 text-[20px] tabular-nums" style={{ color: PROFIT, fontFamily: NUMBER_FONT }}>{pct(stats.benchmark)}</div>
                <div className="mt-1">
                  <Sparkline compact />
                </div>
              </div>
              <div className="min-w-0 space-y-4 pt-2">
                <ProgressLine label={tt('competition.communityAverage', '社区平均')} value={stats.averageReturn} />
                <ProgressLine label={tt('competition.top10Average', 'TOP10 平均')} value={stats.top10Average} />
                <div className="grid grid-cols-4 text-[10px] text-white/[0.32]">
                  <span>0%</span>
                  <span className="text-center">10%</span>
                  <span className="text-center">20%</span>
                  <span className="text-right">30%</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {!joined ? <JoinSheet onJoin={join} onDecline={decline} tt={tt} /> : null}
    </main>
  );
}
