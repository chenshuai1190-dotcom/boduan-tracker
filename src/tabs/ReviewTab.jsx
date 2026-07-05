import React from 'react';
import { marketTextClass } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const REVIEW_GOLD = '#f6b54b';
const REVIEW_BG = '#05070b';
const REVIEW_CARD = '#0b0f14';
const REVIEW_PANEL = '#0b0f16';

const DISCIPLINE_LEVELS = [
  { level: '🟢', label: '一般', dot: 'bg-emerald-400', border: 'border-emerald-400/20', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  { level: '🔺', label: '重要', dot: 'bg-rose-400', border: 'border-rose-400/20', text: 'text-rose-300', bg: 'bg-rose-400/10' },
  { level: '📣', label: '强调', dot: 'bg-amber-400', border: 'border-amber-400/20', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  { level: '❗', label: '警告', dot: 'bg-red-500', border: 'border-red-400/25', text: 'text-red-300', bg: 'bg-red-400/10' },
];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtMoney(value, digits = 0) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function levelMeta(level) {
  return DISCIPLINE_LEVELS.find((item) => item.level === level) || DISCIPLINE_LEVELS[0];
}

function SectionTitle({ icon, title, count, actionLabel, onAction }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[#f6b54b]/20 bg-[#f6b54b]/10 text-[15px] text-[#f6b54b]">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white">{title}</div>
          {count !== undefined && <div className="mt-0.5 text-[10px] text-white/35">{count}</div>}
        </div>
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-xl border border-[#f6b54b]/25 bg-[#f6b54b]/10 px-3 py-1.5 text-[12px] font-normal text-[#f6b54b] active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function ReviewActionSheet({ title, desc, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-0 py-6 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
      }}
    >
      <div className="w-[calc(100vw-72px)] max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f16] shadow-[0_24px_80px_rgba(0,0,0,0.68)]">
        <div className="border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-[17px] text-white/45 active:scale-90"
              aria-label="关闭操作面板"
            >
              ×
            </button>
          </div>
          {desc && (
            <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] leading-relaxed text-white/65">
              {desc}
            </div>
          )}
        </div>
        <div className="space-y-2 px-4 pb-4 pt-3">{children}</div>
      </div>
    </div>
  );
}

export default function ReviewTab({ ctx }) {
  const {
    BookOpen,
    Calendar,
    ChevronDown,
    ChevronUp,
    db,
    DisciplineModal,
    disciplines,
    editYearlyActualId,
    expandedDisciplines,
    filterLevel,
    investmentPlan,
    lastSubmitRef,
    LogModal,
    marketColorMode,
    reviewLogs,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditYearlyActualId,
    setExpandedDisciplines,
    setFilterLevel,
    setInvestmentPlan,
    setReviewLogs,
    setShowAddDiscipline,
    setShowAddLog,
    setShowAllDisciplines,
    setShowAllLogs,
    setShowAllYears,
    setShowPlanSettings,
    setYearlyActuals,
    showAddDiscipline,
    showAddLog,
    showAllDisciplines,
    showAllLogs,
    showAllYears,
    showConfirm,
    showPlanSettings,
    Target,
    usdRate,
    X,
    YearlyActualModal,
    yearlyActuals,
  } = ctx;

  const [yearAction, setYearAction] = React.useState(null);
  const [disciplineAction, setDisciplineAction] = React.useState(null);

  const plan = investmentPlan || {};
  const startYear = toNumber(plan.startYear, new Date().getFullYear());
  const totalYears = Math.max(1, toNumber(plan.totalYears, 10));
  const startCapital = toNumber(plan.startCapital, 0);
  const targetAnnualRate = toNumber(plan.targetAnnualRate, 0.2);
  const ageGoalAge = toNumber(plan.ageGoalAge, 0);
  const displayCurrency = plan.displayCurrency === 'CNY' ? 'CNY' : 'USD';
  const isCNY = displayCurrency === 'CNY';
  const fxRate = toNumber(usdRate, 1);
  const rate = isCNY ? (fxRate > 0 ? fxRate : 1) : 1;
  const symbol = isCNY ? '¥' : '$';
  const thisYear = new Date().getFullYear();

  const money = (usdValue, digits = 0) => `${symbol}${fmtMoney(toNumber(usdValue) * rate, digits)}`;
  const signedMoney = (usdValue, digits = 0) => {
    const n = toNumber(usdValue);
    return `${n >= 0 ? '+' : '-'}${money(Math.abs(n), digits)}`;
  };
  const splitMoney = (usdValue, digits = 2) => {
    const [main, decimal = ''.padEnd(digits, '0')] = fmtMoney(toNumber(usdValue) * rate, digits).split('.');
    return {
      main: `${symbol}${main}`,
      decimal: digits > 0 ? `.${decimal}` : '',
    };
  };
  const pnlTextClass = (value) => marketTextClass(value, marketColorMode);

  const yearlyFinal = React.useMemo(() => {
    const rows = [];
    let prevEnd = startCapital;

    for (let i = 0; i < totalYears; i += 1) {
      const year = startYear + i;
      const actual = (yearlyActuals || []).find((item) => item.year === year);
      const startBalance = prevEnd;
      const planTarget = Math.round(startBalance * targetAnnualRate);
      let actualGain = actual?.actualGain ?? null;
      let endBalance = actual?.endBalance ?? null;
      let isProjected = false;

      if (actualGain !== null && endBalance !== null) {
        actualGain = toNumber(actualGain);
        endBalance = toNumber(endBalance);
      } else if (endBalance !== null) {
        endBalance = toNumber(endBalance);
        actualGain = endBalance - startBalance;
      } else if (actualGain !== null) {
        actualGain = toNumber(actualGain);
        endBalance = startBalance + actualGain;
      } else {
        actualGain = null;
        endBalance = Math.round(startBalance * (1 + targetAnnualRate));
        isProjected = true;
      }

      rows.push({
        year,
        startBalance: Math.round(startBalance),
        planTarget,
        actualGain,
        endBalance: Math.round(endBalance),
        isProjected,
        planEndBalance: Math.round(startCapital * Math.pow(1 + targetAnnualRate, i + 1)),
      });
      prevEnd = endBalance;
    }

    return rows;
  }, [startCapital, startYear, targetAnnualRate, totalYears, yearlyActuals]);

  const ageGoalAmountExact = startCapital * Math.pow(1 + targetAnnualRate, totalYears);
  const ageGoalAmount = Math.round(ageGoalAmountExact);
  const headlineGoalMoney = splitMoney(ageGoalAmountExact, 2);
  const currentBalance = React.useMemo(() => {
    for (let i = yearlyFinal.length - 1; i >= 0; i -= 1) {
      if (!yearlyFinal[i].isProjected) return yearlyFinal[i].endBalance;
    }
    return startCapital;
  }, [startCapital, yearlyFinal]);
  const progressPct = ageGoalAmount > 0 ? clamp((currentBalance / ageGoalAmount) * 100, 0, 100) : 0;
  const yearsLeft = Math.max(0, startYear + totalYears - 1 - thisYear);
  const currentYearIndex = yearlyFinal.findIndex((item) => item.year === thisYear);
  const visibleYears = showAllYears
    ? yearlyFinal
    : yearlyFinal.filter((_, index) => {
      if (currentYearIndex === -1) return index < 3;
      return index >= currentYearIndex && index < currentYearIndex + 3;
    });
  const hiddenYearCount = yearlyFinal.length - visibleYears.length;

  const sortedDisciplines = React.useMemo(() => (
    [...(disciplines || [])].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    })
  ), [disciplines]);
  const filteredDisciplines = filterLevel === 'all'
    ? sortedDisciplines
    : sortedDisciplines.filter((item) => item.level === filterLevel);
  const visibleDisciplines = showAllDisciplines ? filteredDisciplines : filteredDisciplines.slice(0, 10);
  const visibleLogs = showAllLogs ? (reviewLogs || []) : (reviewLogs || []).slice(0, 10);

  const switchCurrency = async (nextCurrency) => {
    if (nextCurrency === displayCurrency) return;
    const next = { ...plan, displayCurrency: nextCurrency };
    setInvestmentPlan(next);
    try {
      await db.upsertInvestmentPlan(next);
    } catch (error) {
      console.error('[目标页币种切换] 保存失败:', error);
    }
  };

  const togglePinDiscipline = async (discipline) => {
    const nextPinned = !discipline.pinned;
    try {
      await db.updateDiscipline(discipline.id, { ...discipline, pinned: nextPinned });
      setDisciplines((disciplines || []).map((item) => (
        item.id === discipline.id ? { ...item, pinned: nextPinned } : item
      )));
      setDisciplineAction(null);
    } catch (error) {
      console.error('[目标页戒律置顶] 保存失败:', error);
    }
  };

  const deleteDiscipline = (discipline) => {
    setDisciplineAction(null);
    showConfirm({
      title: '删除这条戒律?',
      desc: '此操作不可撤销',
      info: (discipline?.text || '').slice(0, 50) + ((discipline?.text || '').length > 50 ? '...' : ''),
      confirmText: '删除',
      onConfirm: async () => {
        await db.deleteDiscipline(discipline.id);
        setDisciplines((disciplines || []).filter((item) => item.id !== discipline.id));
      },
    });
  };

  const openDisciplineEdit = (discipline) => {
    setDisciplineAction(null);
    setEditingDisciplineId(discipline.id);
  };

  const openYearEdit = (year) => {
    setYearAction(null);
    setEditYearlyActualId(year);
  };

  return (
    <div className="mx-auto max-w-[430px] pb-2 text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      <style>{`
        @keyframes polar-twinkle {
          0%, 100% { opacity: 0.28; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.35); }
        }
        .review-star {
          position: absolute;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.86);
          animation: polar-twinkle 3.5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes review-rocket-launch {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        .rocket-bar {
          position: relative;
          overflow: hidden;
          width: var(--target-width);
          animation: review-rocket-launch 1.2s cubic-bezier(0.25, 0.85, 0.25, 1) forwards;
        }
        @keyframes review-progress-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .progress-shine {
          position: relative;
          overflow: hidden;
        }
        .progress-shine::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 20px;
          height: 100%;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.48) 50%, transparent 100%);
          animation: review-progress-shine 2s linear infinite;
        }
      `}</style>

      <section className="relative flex h-[244px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <span className="review-star left-[58%] top-[16%] h-1 w-1" />
        <span className="review-star left-[74%] top-[34%] h-0.5 w-0.5" style={{ animationDelay: '0.7s' }} />
        <span className="review-star left-[63%] top-[56%] h-0.5 w-0.5" style={{ animationDelay: '1.4s' }} />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-normal text-white/70">
              <span className="text-[14px] text-[#ffd18a]">★</span>
              <span>北极星目标</span>
            </div>
          </div>
          <div className="flex shrink-0 rounded-full border border-white/10 bg-black/20 p-0.5">
            {[
              { key: 'USD', label: 'USD' },
              { key: 'CNY', label: 'RMB' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => switchCurrency(item.key)}
                className={`h-7 rounded-full px-2.5 text-[11px] font-normal active:scale-95 ${displayCurrency === item.key ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/45'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-3 whitespace-nowrap text-[34px] font-normal leading-none tracking-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          <span>{headlineGoalMoney.main}</span>
          <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-[#ffd18a]/90">{headlineGoalMoney.decimal}</span>
        </div>
        <div className="relative z-10 mt-2 text-[13px] text-white/55">
          {totalYears} 年目标 · {ageGoalAge || '--'} 岁实现
          {isCNY && <span className="ml-2 text-white/35">1 USD = {fxRate.toFixed(2)} RMB</span>}
        </div>

        <div className="relative z-10 mt-5">
          <div className="mb-2 flex items-center justify-between text-[13px] font-normal text-[#ffd18a]">
            <span>当前 {money(currentBalance)}</span>
            <span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progressPct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/[0.075]">
            <div
              className="rocket-bar h-full rounded-full"
              style={{
                '--target-width': `${progressPct}%`,
                background: 'linear-gradient(90deg, #f8c46a 0%, #f6b54b 58%, #ffd18a 100%)',
                boxShadow: '0 0 14px rgba(246,181,75,0.34)',
              }}
            />
          </div>
          <div className="mt-3 text-[13px] text-white/50">
            还剩 {yearsLeft} 年 · 本金 {money(startCapital)} · 年化 {(targetAnnualRate * 100).toFixed(0)}%
          </div>
        </div>

        <div className="relative z-10 mb-1.5 mt-auto flex items-center justify-between gap-3">
          {plan.motto ? (
            <div className="min-w-0 truncate text-[12px] leading-tight text-[#ffd18a]">“{plan.motto}”</div>
          ) : (
            <div className="text-[12px] text-white/35">设置一句目标提醒</div>
          )}
          <button
            type="button"
            onClick={() => setShowPlanSettings(true)}
            className="shrink-0 -translate-y-2 rounded-xl border border-[#f6b54b]/20 bg-black/20 px-3 py-1.5 text-[12px] font-normal text-[#ffd18a] active:scale-95"
          >
            设置
          </button>
        </div>
      </section>

      <section className="mt-5 -mx-2">
        <div className="mb-3 flex items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-2">
            {Target ? <Target className="h-4 w-4 text-[#f6b54b]" /> : <Calendar className="h-4 w-4 text-[#f6b54b]" />}
            <div className="text-[16px] font-semibold text-white">年度目标进度</div>
          </div>
          {yearlyFinal.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllYears(!showAllYears)}
              className="flex items-center gap-1 rounded-xl px-2 py-1 text-[12px] text-white/45 active:scale-95"
            >
              {showAllYears ? '收起' : `展开剩余 ${hiddenYearCount} 年`}
              {showAllYears ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {visibleYears.map((yearItem) => {
            const yearIndex = yearlyFinal.findIndex((item) => item.year === yearItem.year);
            const isCurrent = yearItem.year === thisYear;
            const hasActual = yearItem.actualGain !== null;
            const diff = hasActual ? yearItem.actualGain - yearItem.planTarget : null;
            const isOverTarget = diff !== null && diff >= 0;
            const targetGap = hasActual ? yearItem.planTarget - yearItem.actualGain : null;
            const yearProgressPct = isCurrent && hasActual && yearItem.planTarget > 0
              ? clamp((yearItem.actualGain / yearItem.planTarget) * 100, 0, 150)
              : 0;
            const projectedLabel = yearItem.isProjected ? '未开始' : isOverTarget ? '达标' : '未达';
            const currentYearTarget = yearItem.startBalance + yearItem.planTarget;
            const previousYear = yearIndex > 0 ? yearlyFinal[yearIndex - 1] : null;
            const plannedStartBalance = previousYear
              ? (previousYear.year === thisYear ? previousYear.startBalance + previousYear.planTarget : previousYear.endBalance)
              : startCapital;

            if (isCurrent) {
              return (
                <button
                  key={yearItem.year}
                  type="button"
                  onClick={() => setYearAction(yearItem)}
                  className="block w-full rounded-[20px] border border-white/10 bg-[#0b0f14] p-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="text-[28px] font-bold leading-none text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{yearItem.year}</div>
                      <span className="rounded-md border border-[#f6b54b]/25 bg-[#f6b54b]/10 px-2 py-1 text-[11px] text-[#f6b54b]">本年</span>
                      <span className={`rounded-md border px-2 py-1 text-[11px] ${isOverTarget ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/25 bg-rose-400/10 text-rose-300'}`}>{projectedLabel}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-[minmax(0,1fr)_124px] items-start gap-2.5">
                    <div className="min-w-0 pt-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[12px] text-white/50">
                        <span className="whitespace-nowrap">计划 {signedMoney(yearItem.planTarget)}</span>
                        <span className="text-white/25">→</span>
                        <span>实际</span>
                      </div>
                      <div className={`mt-1 whitespace-nowrap text-[20px] font-normal tabular-nums ${hasActual ? pnlTextClass(yearItem.actualGain) : 'text-white/35'}`} style={{ fontFamily: NUMBER_FONT }}>
                        {hasActual ? signedMoney(yearItem.actualGain) : '待填写'}
                      </div>
                    </div>
                    <div className="w-full shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2.5 py-2 text-[11px] leading-relaxed">
                      <div className="whitespace-nowrap text-white/62">
                        目标 <span className="text-white/82 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(currentYearTarget)}</span>
                      </div>
                      <div className={`mt-0.5 whitespace-nowrap tabular-nums ${targetGap === null ? 'text-white/35' : pnlTextClass(targetGap)}`} style={{ fontFamily: NUMBER_FONT }}>
                        {targetGap === null ? '待填写' : `${targetGap < 0 ? '超额' : '落后'} ${money(Math.abs(targetGap))}`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-2xl border border-white/[0.06] bg-white/[0.035] px-3 py-3">
                    <div>
                      <div className="text-[11px] text-white/40">起点</div>
                      <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(yearItem.startBalance)}</div>
                    </div>
                    <div className="px-2 text-white/25">→</div>
                    <div className="text-center">
                      <div className="text-[11px] text-white/40">当前</div>
                      <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(yearItem.endBalance)}</div>
                    </div>
                    <div className="px-2 text-white/25">→</div>
                    <div className="text-right">
                      <div className="text-[11px] text-white/40">目标</div>
                      <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(currentYearTarget)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <span className="shrink-0 text-[13px] text-white/65">本年完成</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.075]">
                      <div
                        className="progress-shine h-full rounded-full"
                        style={{
                          width: `${Math.min(100, yearProgressPct)}%`,
                          background: 'linear-gradient(90deg, #f8c46a 0%, #f6b54b 62%, #ffd18a 100%)',
                        }}
                      />
                    </div>
                    <span className="w-11 text-right text-[14px] text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{yearProgressPct.toFixed(0)}%</span>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={yearItem.year}
                type="button"
                onClick={() => setYearAction(yearItem)}
                className="block w-full rounded-[18px] border border-white/10 bg-[#0b0f14] p-4 text-left active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[22px] font-bold leading-none text-white/55 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{yearItem.year}</span>
                      <span className="text-[11px] text-white/35">计划 {signedMoney(yearItem.planTarget)} → 目标 {money(yearItem.endBalance)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg border border-sky-400/15 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-200/70">{projectedLabel}</span>
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-white/[0.06] bg-black/15 px-3 py-3">
                  <div>
                    <div className="text-[11px] text-white/38">起点 ({yearItem.year - 1}目标)</div>
                    <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(plannedStartBalance)}</div>
                  </div>
                  <div className="px-4 text-white/25">→</div>
                  <div className="text-right">
                    <div className="text-[11px] text-white/38">目标 ({yearItem.year})</div>
                    <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(yearItem.endBalance)}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[12px] text-white/45">
                    <span className="flex items-center gap-1">
                      增长目标
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 text-[9px] text-white/45">i</span>
                    </span>
                    <span className="text-white/70 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{signedMoney(yearItem.planTarget)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    <span className="h-px flex-1 border-t border-dashed border-[#f6b54b]/45" />
                    <span className="h-2 w-2 rounded-full bg-white" />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-white/35">
                    <span>{money(plannedStartBalance)}</span>
                    <span>{money(yearItem.endBalance)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {hiddenYearCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllYears(!showAllYears)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#f6b54b]/35 bg-[#f6b54b]/[0.035] py-3 text-[13px] font-normal text-[#f6b54b] active:scale-[0.99]"
          >
            {showAllYears ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAllYears ? '收起年度目标' : `展开剩余 ${hiddenYearCount} 年`}
          </button>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <SectionTitle
          icon={<BookOpen className="h-4 w-4" />}
          title="投资戒律"
          count={`${disciplines.length} 条`}
          actionLabel="+ 添加"
          onAction={() => setShowAddDiscipline(true)}
        />

        <div className="mb-3 flex gap-2 overflow-x-auto" data-pull-refresh-block="true">
          <button
            type="button"
            onClick={() => setFilterLevel('all')}
            className={`shrink-0 rounded-xl border px-3 py-1.5 text-[12px] font-normal active:scale-95 ${filterLevel === 'all' ? 'border-[#f6b54b]/45 bg-[#f6b54b]/10 text-[#f6b54b]' : 'border-white/10 bg-white/[0.035] text-white/45'}`}
          >
            全部 ({disciplines.length})
          </button>
          {DISCIPLINE_LEVELS.map((item) => {
            const count = disciplines.filter((discipline) => discipline.level === item.level).length;
            return (
              <button
                key={item.level}
                type="button"
                onClick={() => setFilterLevel(item.level)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px] font-normal active:scale-95 ${filterLevel === item.level ? 'border-[#f6b54b]/45 bg-[#f6b54b]/10 text-[#f6b54b]' : 'border-white/10 bg-white/[0.035] text-white/50'}`}
              >
                <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        {disciplines.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center text-[13px] text-white/45">
            还没有投资戒律
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleDisciplines.map((discipline) => {
                const meta = levelMeta(discipline.level);
                const isLong = (discipline.text || '').length > 60;
                const isExpanded = Boolean(expandedDisciplines[discipline.id]);
                const displayText = isLong && !isExpanded ? `${discipline.text.slice(0, 60)}...` : discipline.text;
                return (
                  <div
                    key={discipline.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDisciplineAction(discipline)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDisciplineAction(discipline);
                      }
                    }}
                    className="block w-full rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${meta.border} ${meta.bg}`}>
                        <span className="text-[15px]">{discipline.level}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/78">{displayText}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/35">
                          <span>{discipline.date}</span>
                          {discipline.pinned && <span className="rounded-md border border-[#f6b54b]/25 bg-[#f6b54b]/10 px-1.5 py-0.5 text-[#f6b54b]">置顶</span>}
                          {isLong && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedDisciplines((current) => ({ ...current, [discipline.id]: !current[discipline.id] }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setExpandedDisciplines((current) => ({ ...current, [discipline.id]: !current[discipline.id] }));
                                }
                              }}
                              className="text-[#f6b54b]"
                            >
                              {isExpanded ? '收起全文' : '展开全文'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredDisciplines.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllDisciplines(!showAllDisciplines)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#f6b54b]/25 bg-[#f6b54b]/10 py-2.5 text-[12px] font-normal text-[#f6b54b] active:scale-95"
              >
                {showAllDisciplines ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAllDisciplines ? '收起, 只看前 10 条' : `查看全部 ${filteredDisciplines.length} 条`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <SectionTitle
          icon="✎"
          title="复盘日志"
          count={`${reviewLogs.length} 条`}
          actionLabel="+ 写复盘"
          onAction={() => setShowAddLog(true)}
        />

        {reviewLogs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center text-[13px] text-white/45">
            还没有复盘
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleLogs.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setEditingLogId(log.id)}
                  className="block w-full rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-white/78 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{log.date}</div>
                      <div className="mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-white/62">{log.text}</div>
                    </div>
                    {log.mood && <span className="shrink-0 rounded-lg border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[11px] text-sky-300">{log.mood}</span>}
                  </div>
                </button>
              ))}
            </div>
            {reviewLogs.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllLogs(!showAllLogs)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#f6b54b]/25 bg-[#f6b54b]/10 py-2.5 text-[12px] font-normal text-[#f6b54b] active:scale-95"
              >
                {showAllLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAllLogs ? '收起, 只看前 10 条' : `查看全部 ${reviewLogs.length} 条`}
              </button>
            )}
          </>
        )}
      </section>

      {yearAction && (
        <ReviewActionSheet
          title="年度目标操作"
          desc={`${yearAction.year} · 计划 ${signedMoney(yearAction.planTarget)} · 目标 ${money(yearAction.startBalance + yearAction.planTarget)}`}
          onClose={() => setYearAction(null)}
        >
          <button
            type="button"
            onClick={() => openYearEdit(yearAction.year)}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#f6b54b]/35 bg-[#f6b54b]/10 text-[13px] font-normal text-[#f6b54b] active:scale-95"
          >
            修改年度数据
          </button>
          <button
            type="button"
            onClick={() => setYearAction(null)}
            className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-[13px] font-normal text-white/80 active:scale-95"
          >
            取消
          </button>
        </ReviewActionSheet>
      )}

      {disciplineAction && (
        <ReviewActionSheet
          title="戒律操作"
          desc={disciplineAction.text}
          onClose={() => setDisciplineAction(null)}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openDisciplineEdit(disciplineAction)}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-[#f6b54b]/35 bg-[#f6b54b]/10 text-[13px] font-normal text-[#f6b54b] active:scale-95"
            >
              修改戒律
            </button>
            <button
              type="button"
              onClick={() => togglePinDiscipline(disciplineAction)}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-[13px] font-normal text-emerald-300 active:scale-95"
            >
              {disciplineAction.pinned ? '取消置顶' : '置顶戒律'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => deleteDiscipline(disciplineAction)}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/10 text-[13px] font-normal text-rose-300 active:scale-95"
          >
            删除戒律
          </button>
          <button
            type="button"
            onClick={() => setDisciplineAction(null)}
            className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-[13px] font-normal text-white/80 active:scale-95"
          >
            取消
          </button>
        </ReviewActionSheet>
      )}

      {showPlanSettings && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowPlanSettings(false);
          }}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 20px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
          }}
        >
          <div className="w-full max-w-sm overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f16] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.68)]" style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 40px)' }} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-white">北极星设置</h3>
              <button type="button" onClick={() => setShowPlanSettings(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">基础本金 ({symbol})</span>
                <input
                  type="number"
                  value={Math.round(startCapital * rate)}
                  onChange={(event) => setInvestmentPlan({ ...plan, startCapital: (parseFloat(event.target.value) || 0) / rate })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums placeholder:text-white/25 focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">年化目标 (%)</span>
                <input
                  type="number"
                  value={(targetAnnualRate * 100).toFixed(0)}
                  onChange={(event) => setInvestmentPlan({ ...plan, targetAnnualRate: (parseFloat(event.target.value) || 0) / 100 })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums placeholder:text-white/25 focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-white/50">起始年</span>
                  <input
                    type="number"
                    value={plan.startYear === '' ? '' : startYear}
                    onChange={(event) => setInvestmentPlan({ ...plan, startYear: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums focus:border-[#f6b54b]/70"
                    style={{ colorScheme: 'dark' }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-white/50">总年数</span>
                  <input
                    type="number"
                    value={plan.totalYears === '' ? '' : totalYears}
                    onChange={(event) => setInvestmentPlan({ ...plan, totalYears: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums focus:border-[#f6b54b]/70"
                    style={{ colorScheme: 'dark' }}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">目标年龄</span>
                <input
                  type="number"
                  value={plan.ageGoalAge === '' ? '' : ageGoalAge}
                  onChange={(event) => setInvestmentPlan({ ...plan, ageGoalAge: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">个人箴言</span>
                <textarea
                  value={plan.motto || ''}
                  onChange={(event) => setInvestmentPlan({ ...plan, motto: event.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                  placeholder="例: 我要变得很有钱!"
                />
              </label>
              <div className="rounded-xl border border-[#f6b54b]/15 bg-[#f6b54b]/10 px-3 py-2 text-[11px] text-[#ffd18a]">
                按此计划 {totalYears} 年后将达 {money(ageGoalAmount)}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowPlanSettings(false)} className="rounded-xl border border-white/10 bg-white/[0.035] py-2.5 text-[13px] text-white/70 active:scale-95">取消</button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await db.upsertInvestmentPlan(investmentPlan);
                    setShowPlanSettings(false);
                  } catch (error) {
                    console.error('[目标页设置] 保存失败:', error);
                  }
                }}
                className="rounded-xl bg-[#f6b54b] py-2.5 text-[13px] font-semibold text-[#101318] active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {(showAddDiscipline || ctx.editingDisciplineId) && (() => {
        const isEdit = Boolean(ctx.editingDisciplineId);
        const current = isEdit ? disciplines.find((item) => item.id === ctx.editingDisciplineId) : null;
        return (
          <DisciplineModal
            initial={current ? { ...current, isEdit: true } : { level: '🟢', text: '', pinned: false }}
            onCancel={() => { setShowAddDiscipline(false); setEditingDisciplineId(null); }}
            onSave={async (data) => {
              try {
                if (isEdit) {
                  await db.updateDiscipline(ctx.editingDisciplineId, data);
                  setDisciplines(disciplines.map((item) => item.id === ctx.editingDisciplineId ? { ...item, ...data } : item));
                  setEditingDisciplineId(null);
                } else {
                  const text = (data.text || '').trim();
                  const last = lastSubmitRef.current.discipline;
                  const now = Date.now();
                  if (last && last.text === text && now - last.at < 10000) return;
                  const saved = await db.insertDiscipline(data);
                  lastSubmitRef.current.discipline = { text, at: now };
                  setDisciplines([saved, ...disciplines]);
                  setShowAddDiscipline(false);
                }
              } catch (error) {
                console.error('[目标页戒律] 保存失败:', error);
              }
            }}
          />
        );
      })()}

      {(showAddLog || ctx.editingLogId) && (() => {
        const isEdit = Boolean(ctx.editingLogId);
        const current = isEdit ? reviewLogs.find((item) => item.id === ctx.editingLogId) : null;
        return (
          <LogModal
            initial={current || { date: new Date().toISOString().slice(0, 10), mood: '', text: '' }}
            onCancel={() => { setShowAddLog(false); setEditingLogId(null); }}
            onDelete={isEdit ? () => {
              showConfirm({
                title: '删除这条复盘?',
                desc: '此操作不可撤销',
                info: `${current?.date || ''} · ${(current?.text || '').slice(0, 40)}${(current?.text || '').length > 40 ? '...' : ''}`,
                confirmText: '删除',
                onConfirm: async () => {
                  await db.deleteReviewLog(ctx.editingLogId);
                  setReviewLogs(reviewLogs.filter((item) => item.id !== ctx.editingLogId));
                  setEditingLogId(null);
                  setShowAddLog(false);
                },
              });
            } : null}
            onSave={async (data) => {
              try {
                if (isEdit) {
                  await db.updateReviewLog(ctx.editingLogId, data);
                  setReviewLogs(reviewLogs.map((item) => item.id === ctx.editingLogId ? { ...item, ...data } : item));
                  setEditingLogId(null);
                } else {
                  const text = (data.text || '').trim();
                  const last = lastSubmitRef.current.log;
                  const now = Date.now();
                  if (last && last.text === text && now - last.at < 10000) return;
                  const saved = await db.insertReviewLog(data);
                  lastSubmitRef.current.log = { text, at: now };
                  setReviewLogs([saved, ...reviewLogs]);
                  setShowAddLog(false);
                }
              } catch (error) {
                console.error('[目标页复盘] 保存失败:', error);
              }
            }}
          />
        );
      })()}

      {editYearlyActualId && (() => {
        const year = editYearlyActualId;
        const existing = yearlyActuals.find((item) => item.year === year);
        return (
          <YearlyActualModal
            year={year}
            initial={existing || { actualGain: null, endBalance: null }}
            currency={displayCurrency}
            rate={isCNY ? rate : 1}
            onCancel={() => setEditYearlyActualId(null)}
            onSave={async (actualGain, endBalance) => {
              try {
                await db.upsertYearlyActual(year, actualGain, endBalance);
                const idx = yearlyActuals.findIndex((item) => item.year === year);
                if (idx >= 0) {
                  const next = [...yearlyActuals];
                  next[idx] = { ...next[idx], actualGain, endBalance };
                  setYearlyActuals(next);
                } else {
                  setYearlyActuals([...yearlyActuals, { year, actualGain, endBalance }]);
                }
                setEditYearlyActualId(null);
              } catch (error) {
                console.error('[目标页年度数据] 保存失败:', error);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
