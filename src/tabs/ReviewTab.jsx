import React from 'react';
import { BookOpen as BookOpenIcon, ChevronRight, NotebookPen, Pin as PinIcon, Plus } from 'lucide-react';
import AnnualGoalPlan from '../components/AnnualGoalPlan.jsx';
import './ReviewTab.css';
import CompoundDetailPage from '../pages/CompoundDetailPage.jsx';
import ReviewGoalModal from '../components/ReviewGoalModal.jsx';
import { DisciplineDetailModal, ReviewLogDetailModal } from '../components/ReviewReadingDetails.jsx';
import NorthStarGoalCard from '../components/NorthStarGoalCard.jsx';
import { resolveAnnualGoalStatus } from '../lib/annualGoalStatus.js';
import { t } from '../lib/i18n.js';
import { marketTextClass } from '../lib/marketColorMode.js';

const DISCIPLINE_LEVELS = [
  { level: '🟢', label: '一般', dotColor: '#18d66b', ringColor: 'rgba(24, 214, 107, 0.12)', ringBorder: 'rgba(24, 214, 107, 0.14)' },
  { level: '🔺', label: '重要', dotColor: '#ff0f35', ringColor: 'rgba(255, 15, 53, 0.13)', ringBorder: 'rgba(255, 15, 53, 0.15)' },
  { level: '📣', label: '强调', dotColor: '#ffa42b', ringColor: 'rgba(255, 164, 43, 0.13)', ringBorder: 'rgba(255, 164, 43, 0.16)' },
  { level: '❗', label: '警告', dotColor: '#ef0018', ringColor: 'rgba(239, 0, 24, 0.13)', ringBorder: 'rgba(239, 0, 24, 0.16)' },
];


function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtMoney(value, digits = 2) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}


function ReviewActionSheet({ title, children, actions, language = 'zh', onClose }) {
  return <ReviewGoalModal
    title={title}
    closeLabel={t(language, 'review.closeRecordDetails', '关闭记录详情')}
    onClose={onClose}
    actions={actions}
  >{children}</ReviewGoalModal>;
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
    Edit2,
    editYearlyActualId,
    filterLevel,
    investmentPlan,
    lastSubmitRef,
    language = 'zh',
    LogModal,
    marketColorMode,
    reviewLogs,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditYearlyActualId,
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
    Pin,
    Trash2,
    TrendingUp,
    usdRate,
    X,
    YearlyActualModal,
    yearlyActuals,
  } = ctx;

  const [disciplineAction, setDisciplineAction] = React.useState(() => (disciplines || []).find(item => item.id === ctx.initialDisciplineId) || null);
  const [reviewLogAction, setReviewLogAction] = React.useState(() => (reviewLogs || []).find(item => item.id === ctx.initialReviewLogId) || null);
  const [showCompoundDetails, setShowCompoundDetails] = React.useState(Boolean(ctx.initialCompoundDetails));
  const compoundReturnScrollRef = React.useRef(0);
  const compoundPendingScrollRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (compoundPendingScrollRef.current === null) return;
    window.scrollTo({ top: compoundPendingScrollRef.current, left: 0, behavior: 'instant' });
    compoundPendingScrollRef.current = null;
  }, [showCompoundDetails]);
  const openCompoundDetails = () => {
    compoundReturnScrollRef.current = window.scrollY || 0;
    compoundPendingScrollRef.current = 0;
    setShowCompoundDetails(true);
  };
  const closeCompoundDetails = () => {
    compoundPendingScrollRef.current = compoundReturnScrollRef.current;
    setShowCompoundDetails(false);
  };
  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);

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

  const money = (usdValue, digits = 2) => `${symbol}${fmtMoney(toNumber(usdValue) * rate, digits)}`;
  const signedMoney = (usdValue, digits = 2) => {
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

  const [yearAction, setYearAction] = React.useState(() => yearlyFinal.find(item => item.year === ctx.initialReviewYear) || null);

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
      if (currentYearIndex === -1) return index < 2;
      return index >= currentYearIndex && index < currentYearIndex + 2;
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
  const visibleDisciplines = showAllDisciplines ? filteredDisciplines : filteredDisciplines.slice(0, 3);
  const visibleLogs = showAllLogs ? (reviewLogs || []) : (reviewLogs || []).slice(0, 2);

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
      title: tt('review.deleteDisciplineTitle', '删除这条心得?'),
      desc: tt('review.irreversible', '此操作不可撤销'),
      info: (discipline?.text || '').slice(0, 50) + ((discipline?.text || '').length > 50 ? '...' : ''),
      confirmText: tt('review.delete', '删除'),
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

  const deleteReviewLog = (log) => {
    const logId = log?.id || ctx.editingLogId;
    if (!logId) return;
    setReviewLogAction(null);
    showConfirm({
      title: tt('review.deleteReviewTitle', '删除这条复盘?'),
      desc: tt('review.irreversible', '此操作不可撤销'),
      info: `${log?.date || ''} · ${(log?.text || '').slice(0, 40)}${(log?.text || '').length > 40 ? '...' : ''}`,
      confirmText: tt('review.delete', '删除'),
      onConfirm: async () => {
        await db.deleteReviewLog(logId);
        setReviewLogs((reviewLogs || []).filter((item) => item.id !== logId));
        setEditingLogId(null);
        setShowAddLog(false);
      },
    });
  };

  const openReviewLogEdit = (log) => {
    setReviewLogAction(null);
    setEditingLogId(log.id);
  };

  const openYearEdit = (year) => {
    setYearAction(null);
    setEditYearlyActualId(year);
  };

  if (showCompoundDetails) return (
    <CompoundDetailPage
      initialView={ctx.initialCompoundView}
      currentYear={thisYear}
      language={language}
      marketColorMode={marketColorMode}
      money={money}
      onBack={closeCompoundDetails}
      signedMoney={signedMoney}
      startCapital={startCapital}
      startYear={startYear}
      symbol={symbol}
      targetAnnualRate={targetAnnualRate}
      targetValue={ageGoalAmountExact}
      totalYears={totalYears}
      rate={rate}
      yearRows={yearlyFinal}
    />
  );

  return (
    <div className="review-page mx-auto max-w-[430px] pb-2 text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      <NorthStarGoalCard
        language={language}
        goalMoney={headlineGoalMoney}
        goalSubtitle={tt('review.goalSubtitle', '{{years}} 年目标 · {{age}} 岁实现', { years: totalYears, age: ageGoalAge || '--' })}
        currentMoney={money(currentBalance)}
        progressPct={progressPct}
        yearsLeft={yearsLeft}
        principalMoney={money(startCapital)}
        annualRateText={`${(targetAnnualRate * 100).toFixed(0)}%`}
        motto={plan.motto}
        displayCurrency={displayCurrency}
        onCurrencyChange={switchCurrency}
        onOpenDetails={openCompoundDetails}
        onOpenSettings={() => setShowPlanSettings(true)}
      />

      <AnnualGoalPlan
        language={language}
        visibleYears={visibleYears}
        thisYear={thisYear}
        showAllYears={showAllYears}
        totalYearCount={yearlyFinal.length}
        hiddenYearCount={hiddenYearCount}
        onToggleYears={() => setShowAllYears(!showAllYears)}
        onOpenYear={setYearAction}
        money={money}
        signedMoney={signedMoney}
        marketColorMode={marketColorMode}
      />

      <section className="review-reading-section" aria-labelledby="review-disciplines-heading">
        <div className="review-section-header">
          <h2 id="review-disciplines-heading"><BookOpenIcon size={17} strokeWidth={1.6} aria-hidden="true" />{tt('review.disciplines', '投资心得')}</h2>
          <button type="button" className="review-text-action" onClick={() => setShowAddDiscipline(true)}>
            <Plus size={15} strokeWidth={1.6} aria-hidden="true" />{tt('review.add', '添加')}
          </button>
        </div>
        <div className="review-filters" role="group" aria-label={tt('review.filterDiscipline', '筛选投资心得')} data-pull-refresh-block="true">
          <button type="button" aria-pressed={filterLevel === 'all'} onClick={() => setFilterLevel('all')}>
            {tt('review.allCount', '全部 ({{count}})', { count: disciplines.length })}
          </button>
          {DISCIPLINE_LEVELS.map((item, index) => {
            const count = disciplines.filter((discipline) => discipline.level === item.level).length;
            return <button key={item.level} type="button" aria-pressed={filterLevel === item.level} onClick={() => setFilterLevel(item.level)}>
              {tt(`review.disciplineLevel${index}`, item.label)} <span>{count}</span>
            </button>;
          })}
        </div>
        {disciplines.length === 0 || filteredDisciplines.length === 0 ? (
          <div className="review-empty">{tt('review.noDisciplines', '还没有投资心得')}</div>
        ) : <>
          <div className="review-entry-list">
            {visibleDisciplines.map((discipline) => (
              <button key={discipline.id} type="button" className="review-entry" data-pinned={discipline.pinned ? 'true' : undefined}
                onClick={() => setDisciplineAction(discipline)}>
                <span className="review-entry-meta">
                  <span>{discipline.date}</span>
                  {discipline.pinned && <span className="review-pinned"><PinIcon size={12} strokeWidth={1.6} aria-hidden="true" />{tt('review.pinned', '置顶')}</span>}
                  <ChevronRight size={14} strokeWidth={1.5} className="review-entry-arrow" aria-hidden="true" />
                </span>
                <span className="review-entry-body">{discipline.text}</span>
              </button>
            ))}
          </div>
          {filteredDisciplines.length > 3 && <button type="button" className="review-show-more" onClick={() => setShowAllDisciplines(!showAllDisciplines)}>
            {showAllDisciplines ? tt('review.collapseRecent', '收起') : tt('review.viewAllCount', '查看全部 {{count}} 条', { count: filteredDisciplines.length })}
            {showAllDisciplines ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>}
        </>}
      </section>

      <section className="review-reading-section" aria-labelledby="review-logs-heading">
        <div className="review-section-header">
          <h2 id="review-logs-heading"><NotebookPen size={17} strokeWidth={1.6} aria-hidden="true" />{tt('review.reviewLogs', '复盘日志')}</h2>
          <button type="button" className="review-text-action" onClick={() => setShowAddLog(true)}>
            <Plus size={15} strokeWidth={1.6} aria-hidden="true" />{tt('review.writeReview', '写复盘')}
          </button>
        </div>
        {reviewLogs.length === 0 ? (
          <div className="review-empty">{tt('review.noReviewLogs', '还没有复盘')}</div>
        ) : <>
          <div className="review-entry-list">
            {visibleLogs.map((log) => {
              const text = log.text || '';
              return <button key={log.id} type="button" className="review-entry" onClick={() => setReviewLogAction(log)}>
                <span className="review-entry-meta">
                  <span>{log.date}</span>
                  {log.mood && <span>{log.mood}</span>}
                  <ChevronRight size={14} strokeWidth={1.5} className="review-entry-arrow" aria-hidden="true" />
                </span>
                <span className="review-entry-body">{text}</span>
              </button>;
            })}
          </div>
          {reviewLogs.length > 2 && <button type="button" className="review-show-more" onClick={() => setShowAllLogs(!showAllLogs)}>
            {showAllLogs ? tt('review.collapseRecent', '收起') : tt('review.viewAllCount', '查看全部 {{count}} 条', { count: reviewLogs.length })}
            {showAllLogs ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>}
        </>}
      </section>

      {yearAction && (
        <ReviewActionSheet
          title={tt('review.yearActions', '年度目标操作')}
          language={language}
          onClose={() => setYearAction(null)}
          actions={[
            { key: 'edit', label: tt('review.editYearData', '修改年度数据'), className: 'rgm-primary', onClick: () => openYearEdit(yearAction.year) },
          ]}
        >
          <div className="rgm-year-summary">
            <div className="rgm-year-heading"><strong>{yearAction.year}</strong><span>{yearAction.year === thisYear ? tt('review.thisYear', '本年') : yearAction.year > thisYear ? tt('review.plannedYear', '计划年度') : tt('review.pastYear', '历史年度')}</span></div>
            <span className="rgm-result-label">{tt('review.actualGain', '实际收益')}</span>
            <strong className={`rgm-result ${!yearAction.isProjected && yearAction.actualGain !== null ? marketTextClass(yearAction.actualGain, marketColorMode) : ''}`}>
              {yearAction.isProjected || yearAction.actualGain === null ? tt('review.pending', '待填写') : signedMoney(yearAction.actualGain)}
            </strong>
          </div>
          <dl className="review-year-facts">
            <div><dt>{tt('review.yearStart', '年初起点')}</dt><dd>{money(yearAction.startBalance)}</dd></div>
            <div><dt>{yearAction.year === thisYear ? tt('review.currentAssets', '当前资产') : tt('review.actualYearEndAssets', '实际期末资产')}</dt><dd>{yearAction.isProjected ? tt('review.pending', '待填写') : money(yearAction.endBalance)}</dd></div>
            <div><dt>{tt('review.annualProfitTarget', '年度收益目标')}</dt><dd>{money(yearAction.planTarget)}</dd></div>
            <div className="rgm-target-row"><dt>{tt('review.yearEnd', '年底目标')}</dt><dd>{money(yearAction.startBalance + yearAction.planTarget)}</dd></div>
          </dl>
        </ReviewActionSheet>
      )}

      {disciplineAction && (
        <DisciplineDetailModal
          discipline={disciplineAction}
          Edit2={Edit2}
          language={language}
          Pin={Pin}
          Trash2={Trash2}
          X={X}
          onClose={() => setDisciplineAction(null)}
          onEdit={() => openDisciplineEdit(disciplineAction)}
          onTogglePin={() => togglePinDiscipline(disciplineAction)}
          onDelete={() => deleteDiscipline(disciplineAction)}
        />
      )}

      {reviewLogAction && (
        <ReviewLogDetailModal
          log={reviewLogAction}
          Edit2={Edit2}
          language={language}
          Trash2={Trash2}
          X={X}
          onClose={() => setReviewLogAction(null)}
          onEdit={() => openReviewLogEdit(reviewLogAction)}
          onDelete={() => deleteReviewLog(reviewLogAction)}
        />
      )}

      {showPlanSettings && (
        <ReviewGoalModal
          title={tt('review.planSettings', '北极星设置')}
          closeLabel={tt('review.closePlanSettings', '关闭北极星设置')}
          onClose={() => setShowPlanSettings(false)}
          actions={[
            {
              key: 'save',
              className: 'rgm-primary',
              label: tt('review.save', '保存'),
              onClick: async () => {
                try {
                  await db.upsertInvestmentPlan(investmentPlan);
                  setShowPlanSettings(false);
                } catch (error) {
                  console.error('[目标页设置] 保存失败:', error);
                }
              },
            },
          ]}
        >
            <div className="rgm-settings-grid">
              <label className="rgm-field rgm-field-wide">
                <span>{tt('review.basePrincipal', '基础本金 ({{symbol}})', { symbol })}</span>
                <input
                  type="number"
                  value={Math.round(startCapital * rate)}
                  onChange={(event) => setInvestmentPlan({ ...plan, startCapital: (parseFloat(event.target.value) || 0) / rate })}

                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <label className="rgm-field">
                <span>{tt('review.annualTarget', '年化目标 (%)')}</span>
                <input
                  type="number"
                  value={(targetAnnualRate * 100).toFixed(0)}
                  onChange={(event) => setInvestmentPlan({ ...plan, targetAnnualRate: (parseFloat(event.target.value) || 0) / 100 })}

                  style={{ colorScheme: 'dark' }}
                />
              </label>

                <label className="rgm-field">
                  <span>{tt('review.startYear', '起始年')}</span>
                  <input
                    type="number"
                    value={plan.startYear === '' ? '' : startYear}
                    onChange={(event) => setInvestmentPlan({ ...plan, startYear: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}

                    style={{ colorScheme: 'dark' }}
                  />
                </label>
                <label className="rgm-field">
                  <span>{tt('review.totalYears', '总年数')}</span>
                  <input
                    type="number"
                    value={plan.totalYears === '' ? '' : totalYears}
                    onChange={(event) => setInvestmentPlan({ ...plan, totalYears: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}

                    style={{ colorScheme: 'dark' }}
                  />
                </label>
              <label className="rgm-field">
                <span>{tt('review.targetAge', '目标年龄')}</span>
                <input
                  type="number"
                  value={plan.ageGoalAge === '' ? '' : ageGoalAge}
                  onChange={(event) => setInvestmentPlan({ ...plan, ageGoalAge: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}

                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <label className="rgm-field rgm-field-wide">
                <span>{tt('review.motto', '个人箴言')}</span>
                <textarea
                  value={plan.motto || ''}
                  onChange={(event) => setInvestmentPlan({ ...plan, motto: event.target.value })}
                  rows={2}

                  style={{ colorScheme: 'dark' }}
                  placeholder={tt('review.mottoPlaceholder', '例: 我要变得很有钱!')}
                />
              </label>
              <div className="rgm-projection">
                <span>{tt('review.projectedAssetsAfterYears', '{{years}} 年后的计划资产', { years: totalYears })}</span>
                <strong>{money(ageGoalAmountExact)}</strong>
              </div>
            </div>
        </ReviewGoalModal>
      )}

      {(showAddDiscipline || ctx.editingDisciplineId) && (() => {
        const isEdit = Boolean(ctx.editingDisciplineId);
        const current = isEdit ? disciplines.find((item) => item.id === ctx.editingDisciplineId) : null;
        return (
          <DisciplineModal
            initial={current ? { ...current, isEdit: true } : { level: '🟢', text: '', pinned: false }}
            language={language}
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
            language={language}
            onCancel={() => { setShowAddLog(false); setEditingLogId(null); }}
            onDelete={isEdit ? () => deleteReviewLog(current) : null}
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
            language={language}
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
