import React from 'react';

export default function ReviewTab({ ctx }) {
  const {
    AlertTriangle,
    BookOpen,
    Calendar,
    ChevronDown,
    ChevronUp,
    db,
    DisciplineModal,
    disciplines,
    Edit2,
    editingDisciplineId,
    editingLogId,
    editYearlyActualId,
    expandedDisciplines,
    filterLevel,
    investmentPlan,
    lastSubmitRef,
    LogModal,
    marginStatus,
    Pin,
    Plus,
    reviewLogs,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditYearlyActualId,
    setExpandedDisciplines,
    setFilterLevel,
    setInvestmentPlan,
    setMarginStatus,
    setReviewLogs,
    setShowAddDiscipline,
    setShowAddLog,
    setShowAllDisciplines,
    setShowAllLogs,
    setShowAllYears,
    setShowEditMargin,
    setShowPlanSettings,
    setYearlyActuals,
    showAddDiscipline,
    showAddLog,
    showAllDisciplines,
    showAllLogs,
    showAllYears,
    showConfirm,
    showEditMargin,
    showPlanSettings,
    usdRate,
    X,
    YearlyActualModal,
    yearlyActuals,
  } = ctx;

  return (
    <>

          {(() => {
            // === 工具函数 ===
            const fmtWan = (n, d = 0) => {
              const v = Math.abs(n) / 10000;
              return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
            };
            // 📌 核心: 统一金额显示函数 (根据 displayCurrency 切换)
            // 数据库永远存 USD, CNY 模式时显示 × usdRate
            const displayCurrency = investmentPlan.displayCurrency || 'USD';
            const isCNY = displayCurrency === 'CNY';
            const symbol = isCNY ? '¥' : '$';
            const rate = isCNY ? (usdRate || 7.2) : 1;
            // 金额带"万"单位显示 (USD: $240 万, CNY: ¥1728 万)
            const fmtMoney = (usdValue, d = 1) => `${symbol}${fmtWan(usdValue * rate, d)} 万`;
            const fmtWanUSD = fmtMoney;  // 兼容旧调用, 自动切

            // ============================================
            // 🧠 复利计划核心计算 (柔性目标 + 宽松推演)
            // ============================================
            const PLAN = investmentPlan;
            // 规则:
            //   1. 每年起点 = 上年终点 (实际或推演)
            //   2. 计划增长 = 起点 × 年化率 (柔性, 联动上年实际)
            //   3. 实际增长 = 用户填的 (可空)
            //   4. 终点 = 起点 + 实际增长
            //   5. 未填年: 假设达标 20%, 标记为 isProjected
            //   6. 智能补全: 填一个自动算另一个
            // ============================================

            // 第 1 步: 合并用户填的原始数据
            const yearlyRaw = [];
            for (let i = 0; i < PLAN.totalYears; i++) {
              const year = PLAN.startYear + i;
              const actual = yearlyActuals.find(a => a.year === year);
              yearlyRaw.push({
                year,
                actualGain: actual?.actualGain ?? null,
                endBalance: actual?.endBalance ?? null,
              });
            }

            // 第 2 步: 按年顺序计算 (起点 / 计划 / 实际 / 终点 / 是否推演)
            const yearlyFinal = [];
            let prevEnd = PLAN.startCapital;  // 第 1 年起点 = 起始本金

            for (let i = 0; i < yearlyRaw.length; i++) {
              const r = yearlyRaw[i];
              const startBalance = prevEnd;  // 本年起点 = 上年终点
              const planTarget = Math.round(startBalance * PLAN.targetAnnualRate);  // 柔性: 基于动态起点

              let actualGain, endBalance, isProjected;

              if (r.actualGain !== null && r.endBalance !== null) {
                // 都填了: 用 endBalance, actualGain 显示用户填的
                actualGain = r.actualGain;
                endBalance = r.endBalance;
                isProjected = false;
              } else if (r.endBalance !== null) {
                // 只填了余额: 倒算增长
                actualGain = r.endBalance - startBalance;
                endBalance = r.endBalance;
                isProjected = false;
              } else if (r.actualGain !== null) {
                // 只填了增长: 算余额
                actualGain = r.actualGain;
                endBalance = startBalance + r.actualGain;
                isProjected = false;
              } else {
                // 都没填: 推演 = 起点 × 1.20 (假设达标)
                actualGain = null;  // 实际显示 TBD
                endBalance = Math.round(startBalance * (1 + PLAN.targetAnnualRate));
                isProjected = true;
              }

              yearlyFinal.push({
                year: r.year,
                startBalance: Math.round(startBalance),
                planTarget,
                actualGain,  // null = TBD
                endBalance: Math.round(endBalance),
                isProjected,
                planEndBalance: Math.round(PLAN.startCapital * Math.pow(1 + PLAN.targetAnnualRate, i + 1)),  // 原计划余额 (北极星硬目标)
              });
              prevEnd = endBalance;  // 下年起点
            }

            // 北极星目标 (永远固定)
            const ageGoalAmount = Math.round(PLAN.startCapital * Math.pow(1 + PLAN.targetAnnualRate, PLAN.totalYears));
            // 现实推演终点 (根据柔性 + 宽松推演)
            const projectedFinal = yearlyFinal[yearlyFinal.length - 1]?.endBalance || 0;
            const shortfall = ageGoalAmount - projectedFinal;

            // === 当前进度 ===
            // 用复盘 tab 自己的数据: 取最近一个已填实际数据的年份 endBalance
            // 如果一个都没填, 用起始本金
            const currentMonth = new Date().toISOString().slice(0, 7);
            // 旧逻辑: 读资产 tab 家庭总资产 (不合适, 因为复盘追踪的是投资账户)
            // 新逻辑: 基于复盘 tab 填入的数据
            let currentBalance = PLAN.startCapital;
            // 找最近一个"实际"填写的年份 (不是推演)
            const thisYear = new Date().getFullYear();
            for (let i = yearlyFinal.length - 1; i >= 0; i--) {
              if (!yearlyFinal[i].isProjected) {
                currentBalance = yearlyFinal[i].endBalance;
                break;
              }
            }

            const progressPct = ageGoalAmount > 0 ? (currentBalance / ageGoalAmount) * 100 : 0;
            const yearsLeft = (PLAN.startYear + PLAN.totalYears - 1) - thisYear;

            // === 融资杠杆状态 (基于总仓位倍率) ===
            // 总仓位倍率 = (账户净值 + 融资金额) / 账户净值
            // 1.0 = 无融资, 1.5 = 杠杆到 1.5 倍
            // 账户净值 = currentBalance (来自复盘数据)
            // 融资 marginStatus.currentMargin 是人民币, 但复盘是 USD, 需要统一
            // 约定: currentMargin 也是 USD (和 startCapital 一致)
            const marginRatio = currentBalance > 0
              ? 1 + (marginStatus.currentMargin / currentBalance)
              : 1;
            const marginState = marginRatio >= 1.5 ? 'red'
              : marginRatio >= 1.3 ? 'orange'
              : 'green';
            // 进度条位置: 1.0 → 0%, 2.0 → 100% (以 2x 为刻度上限)
            const marginPct = Math.max(0, Math.min(100, (marginRatio - 1.0) / 1.0 * 100));

            // === 戒律筛选 ===
            const LEVELS = [
              { level: '🟢', label: '一般', colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
              { level: '🔺', label: '重要', colorClass: 'bg-amber-50 border-amber-200 text-amber-800' },
              { level: '📣', label: '强调', colorClass: 'bg-violet-50 border-violet-200 text-violet-800' },
              { level: '❗', label: '警告', colorClass: 'bg-rose-50 border-rose-200 text-rose-800' },
            ];
            const LEVEL_COLORS = Object.fromEntries(LEVELS.map(l => [l.level, l.colorClass]));
            // 🐛 修复 (v10.7.9.3): 按 pinned 优先排序
            //   之前: 直接用 disciplines, 置顶按钮无效
            //   现在: pinned=true 的永远在前
            const sortedDisciplines = [...disciplines].sort((a, b) => {
              if (a.pinned && !b.pinned) return -1;
              if (!a.pinned && b.pinned) return 1;
              return 0;  // 都置顶 / 都不置顶 → 保持原顺序
            });
            const filteredDisciplines = filterLevel === 'all' ? sortedDisciplines : sortedDisciplines.filter(d => d.level === filterLevel);

            return (
              <>
                {/* ============ 货币切换按钮 (USD/CNY) ============ */}
                {(() => {
                  const isCNY = investmentPlan.displayCurrency === 'CNY';
                  const switchCurrency = async (newCurrency) => {
                    if (newCurrency === investmentPlan.displayCurrency) return;
                    const next = { ...investmentPlan, displayCurrency: newCurrency };
                    setInvestmentPlan(next);
                    try {
                      await db.upsertInvestmentPlan(next);
                    } catch (e) {
                      console.error('[切换币种] 云端保存失败:', e);
                    }
                  };
                  return (
                    <div className="flex justify-end mb-3">
                      <div className="inline-flex rounded-lg p-0.5 bg-slate-200">
                        <button
                          onClick={() => switchCurrency('USD')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${!isCNY ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
                        >$ USD</button>
                        <button
                          onClick={() => switchCurrency('CNY')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${isCNY ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
                        >¥ CNY</button>
                      </div>
                    </div>
                  );
                })()}

                {/* ============ 模块 1: 复利计划卡 (烈焰红金 + 北极星宇宙动效) ============ */}
                <div
                  className="rounded-2xl p-5 mb-4 text-white relative overflow-hidden"
                  style={{
                    background: `
                      radial-gradient(circle at 0% 100%, rgba(220, 38, 38, 0.25) 0%, transparent 50%),
                      radial-gradient(circle at 100% 0%, rgba(251, 191, 36, 0.18) 0%, transparent 50%),
                      linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0505 100%)
                    `,
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    boxShadow: '0 10px 40px rgba(127, 29, 29, 0.4)',
                  }}
                >
                  {/* 🌌 宇宙动效层 (纯 CSS 动画, 不阻塞 React 渲染) */}
                  <style>{`
                    @keyframes polar-twinkle {
                      0%, 100% { opacity: 0.3; transform: scale(1); }
                      50% { opacity: 1; transform: scale(1.5); }
                    }
                    @keyframes polar-star-pulse {
                      0%, 100% { box-shadow: 0 0 15px #fbbf24, 0 0 30px rgba(251, 191, 36, 0.6), 0 0 50px rgba(251, 191, 36, 0.3); }
                      50% { box-shadow: 0 0 20px #fbbf24, 0 0 40px rgba(251, 191, 36, 0.8), 0 0 70px rgba(251, 191, 36, 0.5); }
                    }
                    @keyframes polar-meteor {
                      0% { transform: translate(-50px, -20px) rotate(25deg); opacity: 0; }
                      5% { opacity: 1; }
                      20% { opacity: 1; }
                      25% { transform: translate(400px, 150px) rotate(25deg); opacity: 0; }
                      100% { transform: translate(400px, 150px) rotate(25deg); opacity: 0; }
                    }
                    .polar-bg-star {
                      position: absolute;
                      background: white;
                      border-radius: 50%;
                      animation: polar-twinkle infinite;
                      pointer-events: none;
                      z-index: 1;
                    }
                    .polar-main-star {
                      position: absolute;
                      bottom: 24px;
                      right: 24px;
                      width: 6px;
                      height: 6px;
                      background: #fbbf24;
                      border-radius: 50%;
                      animation: polar-star-pulse 2s ease-in-out infinite;
                      pointer-events: none;
                      z-index: 2;
                    }
                    .polar-meteor {
                      position: absolute;
                      width: 60px;
                      height: 1px;
                      background: linear-gradient(90deg, transparent, #fbbf24, white);
                      animation: polar-meteor linear infinite;
                      opacity: 0;
                      pointer-events: none;
                      z-index: 1;
                    }
                  `}</style>
                  {/* ⭐ 北极星 (右上角主星, 脉动发光) */}
                  <div className="polar-main-star"></div>
                  {/* 闪烁背景星星 */}
                  <div className="polar-bg-star" style={{ top: '20%', left: '15%', width: '2px', height: '2px', animationDuration: '2s' }}></div>
                  <div className="polar-bg-star" style={{ top: '45%', left: '40%', width: '1.5px', height: '1.5px', animationDuration: '3s', animationDelay: '0.5s' }}></div>
                  <div className="polar-bg-star" style={{ top: '65%', left: '20%', width: '2px', height: '2px', animationDuration: '2.5s', animationDelay: '1s' }}></div>
                  <div className="polar-bg-star" style={{ top: '75%', left: '60%', width: '1.5px', height: '1.5px', animationDuration: '3.5s', animationDelay: '1.5s' }}></div>
                  <div className="polar-bg-star" style={{ top: '30%', left: '70%', width: '1px', height: '1px', animationDuration: '4s' }}></div>
                  <div className="polar-bg-star" style={{ top: '55%', left: '80%', width: '1.5px', height: '1.5px', animationDuration: '2s', animationDelay: '0.8s' }}></div>
                  <div className="polar-bg-star" style={{ top: '85%', left: '40%', width: '1px', height: '1px', animationDuration: '3s' }}></div>
                  <div className="polar-bg-star" style={{ top: '15%', left: '50%', width: '1px', height: '1px', animationDuration: '3.5s', animationDelay: '0.3s' }}></div>
                  {/* 流星 (偶尔划过) */}
                  <div className="polar-meteor" style={{ top: '40%', left: '30%', animationDuration: '10s', animationDelay: '2s' }}></div>
                  <div className="polar-meteor" style={{ top: '70%', left: '50%', animationDuration: '12s', animationDelay: '7s' }}></div>

                  <div className="flex items-center justify-between mb-3 relative z-10">
                    {/* 金红渐变标题 */}
                    <div
                      className="text-[10px] uppercase font-bold"
                      style={{
                        letterSpacing: '3px',
                        background: 'linear-gradient(135deg, #fbbf24 0%, #dc2626 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      ★ 北极星目标
                    </div>
                    {/* 红色边框按钮 */}
                    <button
                      onClick={() => setShowPlanSettings(true)}
                      className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md active:scale-95 transition"
                      style={{
                        color: '#fca5a5',
                        background: 'rgba(220, 38, 38, 0.15)',
                        border: '1px solid rgba(220, 38, 38, 0.3)',
                      }}
                    >
                      <Edit2 className="w-3 h-3" /> 设置
                    </button>
                  </div>

                  {/* 主数字 - 金色渐变 */}
                  <div
                    className="text-3xl font-black tabular-nums mb-1 relative z-10"
                    style={{
                      fontFamily: 'ui-monospace, "SF Mono", monospace',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 40%, #f59e0b 80%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {fmtWanUSD(ageGoalAmount, 0)}
                  </div>
                  <div className="text-xs relative z-10" style={{ color: '#fca5a5' }}>
                    {PLAN.totalYears} 年目标 · {PLAN.ageGoalAge} 岁实现
                  </div>

                  {/* 进度条 (🚀 粒子尾气动画) */}
                  <div className="mt-4 relative z-10">
                    <div className="flex justify-between text-[10px] font-bold mb-1" style={{ color: '#fbbf24' }}>
                      <span>当前 {fmtWanUSD(currentBalance, 0)}</span>
                      <span>{progressPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full relative" style={{ background: 'rgba(220, 38, 38, 0.15)', overflow: 'visible' }}>
                      {/* 主进度条 */}
                      <div
                        className="h-full rounded-full rocket-bar"
                        style={{
                          '--target-width': `${Math.min(progressPct, 100)}%`,
                          background: 'linear-gradient(90deg, #dc2626 0%, #fbbf24 100%)',
                          boxShadow: '0 0 10px rgba(251, 191, 36, 0.4)',
                          position: 'relative',
                        }}
                      >
                        {/* 3 个粒子 (尾气) */}
                        <div className="rocket-particle rocket-particle-1"></div>
                        <div className="rocket-particle rocket-particle-2"></div>
                        <div className="rocket-particle rocket-particle-3"></div>
                      </div>
                    </div>
                    <div className="text-[10px] mt-1.5" style={{ color: '#737373' }}>
                      还剩 {yearsLeft} 年 · 本金 {fmtWanUSD(PLAN.startCapital, 0)} · 年化 {(PLAN.targetAnnualRate * 100).toFixed(0)}%
                    </div>
                  </div>

                  {/* 个人箴言 (红色分隔线 + 金色字) */}
                  {PLAN.motto && (
                    <div
                      className="mt-4 pt-3 text-[11px] italic relative z-10"
                      style={{
                        borderTop: '1px solid rgba(220, 38, 38, 0.3)',
                        color: '#fbbf24',
                      }}
                    >
                      "{PLAN.motto}"
                    </div>
                  )}
                </div>

                {/* ============ 模块 2: 融资杠杆监控 (基于总仓位倍率) ============ */}
                <div className={`rounded-2xl p-4 shadow border-2 mb-4 ${marginState === 'red' ? 'bg-rose-50 border-rose-300' : marginState === 'orange' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className={`w-4 h-4 ${marginState === 'red' ? 'text-rose-600' : marginState === 'orange' ? 'text-amber-600' : 'text-emerald-600'}`}/>
                      <div className="text-sm font-black text-slate-800">融资杠杆监控</div>
                    </div>
                    <button onClick={() => setShowEditMargin(true)} className="text-[11px] text-blue-600 font-bold flex items-center gap-1">
                      <Edit2 className="w-3 h-3"/> 修改
                    </button>
                  </div>

                  {/* 主数字: 总仓位倍率 + 状态 */}
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">总仓位倍率</div>
                      <div className={`text-2xl font-black tabular-nums ${marginState === 'red' ? 'text-rose-700' : marginState === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {marginRatio.toFixed(2)}x
                      </div>
                    </div>
                    <div className={`text-xs font-bold ${marginState === 'red' ? 'text-rose-700' : marginState === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {marginState === 'red' ? '🚨 危险' : marginState === 'orange' ? '⚠️ 中等' : '✅ 安全'}
                    </div>
                  </div>

                  {/* 金额明细 */}
                  <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                    <div className="bg-white/60 rounded-md p-2">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">账户净值</div>
                      <div className="font-bold text-slate-800 tabular-nums">{fmtWanUSD(currentBalance, 1)}</div>
                    </div>
                    <div className="bg-white/60 rounded-md p-2">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">融资金额</div>
                      <div className="font-bold text-slate-800 tabular-nums">{fmtWanUSD(marginStatus.currentMargin, 1)}</div>
                    </div>
                    <div className="bg-white/60 rounded-md p-2">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">总仓位</div>
                      <div className="font-bold text-slate-800 tabular-nums">{fmtWanUSD(currentBalance + marginStatus.currentMargin, 1)}</div>
                    </div>
                  </div>

                  {/* 倍率进度条 (1.0 → 2.0) */}
                  <div className="relative h-3 bg-white rounded-full overflow-hidden border border-slate-200">
                    {/* 3 档背景色 */}
                    <div className="absolute inset-0 flex">
                      <div style={{ width: '30%' }} className="bg-emerald-100"></div>
                      <div style={{ width: '20%' }} className="bg-amber-100"></div>
                      <div style={{ width: '50%' }} className="bg-rose-100"></div>
                    </div>
                    {/* 当前进度 */}
                    <div className={`absolute top-0 left-0 h-full rounded-full ${marginState === 'red' ? 'bg-rose-500' : marginState === 'orange' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${marginPct}%` }}></div>
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-slate-500 font-medium">
                    <span>1.0x</span>
                    <span className="text-emerald-600 font-bold" style={{ marginLeft: '6%' }}>安全</span>
                    <span className="text-amber-600 font-bold">1.3x</span>
                    <span className="text-rose-600 font-bold">1.5x</span>
                    <span>2.0x</span>
                  </div>

                  {/* 提示 */}
                  <div className={`mt-3 text-[11px] font-medium ${marginState === 'red' ? 'text-rose-700' : marginState === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {marginState === 'red'
                      ? '🚨 融资过度, 强烈建议降杠杆'
                      : marginState === 'orange'
                      ? '⚠️ 杠杆偏高, 注意风险控制'
                      : '✅ 杠杆安全, 风险可控'}
                  </div>
                </div>

                {/* ============ 模块 3: 年度目标进度表 ============ */}
                <div className="rounded-2xl bg-white p-2.5 shadow mb-4">
                  <div className="flex items-center justify-between mb-3 px-1.5">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-600"/>
                      <div className="text-[15px] font-black text-slate-800">年度目标进度</div>
                    </div>
                  </div>

                  {/* 年度列表 (V5B 布局: 本年夕阳粉金 + 微光扫过 + 起点→终点 胶囊) */}
                  <div className="space-y-1.5">
                    {(() => {
                      const thisYear = new Date().getFullYear();
                      // 默认显示: 本年 + 本年之后的 2 个 = 3 个
                      // 展开后: 全部
                      const visibleYears = showAllYears
                        ? yearlyFinal
                        : yearlyFinal.filter((y, i) => {
                            // 只显示本年及其后 2 年, 如果本年不在列表 (过去了) 就显示前 3 个
                            const currentIdx = yearlyFinal.findIndex(yy => yy.year === thisYear);
                            if (currentIdx === -1) return i < 3;
                            return i >= currentIdx && i < currentIdx + 3;
                          });
                      const hiddenCount = yearlyFinal.length - visibleYears.length;

                      return (
                        <>
                          {visibleYears.map(y => {
                            const isCurrent = y.year === thisYear;
                            const hasActual = y.actualGain !== null;
                            const diff = hasActual ? y.actualGain - y.planTarget : null;
                            const isOverTarget = diff !== null && diff >= 0;

                            // 当年进度: 基于实际收益完成度 (而非时间)
                            // 例如: 目标 +20%, 实际已经 +12% → 完成度 = 60%
                            const currentMonth = new Date().getMonth() + 1;
                            const yearProgressPct = isCurrent && hasActual && y.planTarget > 0
                              ? Math.max(0, Math.min(150, (y.actualGain / y.planTarget) * 100))  // 上限 150% (超额完成)
                              : 0;

                            if (isCurrent) {
                              // ============ 本年大卡: 夕阳粉金 ============
                              return (
                                <div
                                  key={y.year}
                                  className="rounded-xl p-3.5 relative"
                                  style={{
                                    background: `
                                      radial-gradient(circle at 100% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
                                      radial-gradient(circle at 0% 100%, rgba(236, 72, 153, 0.12) 0%, transparent 50%),
                                      linear-gradient(135deg, #fdf2f8 0%, #fff 100%)
                                    `,
                                    border: '1px solid #fbcfe8',
                                  }}
                                >
                                  {/* 第 1 行: 年份 + 标签 + 编辑 */}
                                  <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="text-[20px] font-black tabular-nums" style={{ color: '#db2777', fontFamily: 'ui-monospace, monospace' }}>
                                        {y.year}
                                      </div>
                                      <span className="px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: '#db2777' }}>本年</span>
                                      {hasActual && (
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold text-white ${isOverTarget ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                          {isOverTarget ? '↑达标' : '↓未达'}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => setEditYearlyActualId(y.year)}
                                      className="w-8 h-8 rounded-md hover:bg-pink-200 flex items-center justify-center active:scale-95 transition"
                                      style={{ background: 'rgba(219, 39, 119, 0.1)', color: '#db2777' }}
                                    >
                                      <Edit2 className="w-[15px] h-[15px]"/>
                                    </button>
                                  </div>

                                  {/* 第 2 行: 计划 → 实际 + 差额 */}
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-baseline gap-2" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      <span className="text-slate-500 text-[14px]">计划 +{symbol}{fmtWan(y.planTarget * rate, 1)}</span>
                                      <span className="text-[14px]" style={{ color: '#f9a8d4' }}>→</span>
                                      <span className={`font-black text-[18px] ${!hasActual ? 'text-slate-400 italic font-normal' : y.actualGain >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {hasActual ? `${y.actualGain >= 0 ? '+' : ''}${symbol}${fmtWan(y.actualGain * rate, 1)}万` : 'TBD'}
                                      </span>
                                    </div>
                                    {hasActual ? (
                                      <span className={`text-[13px] font-black tabular-nums px-2.5 py-1 rounded-md ${isOverTarget ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                        {diff >= 0 ? '+' : ''}{symbol}{fmtWan(diff * rate, 1)}万
                                      </span>
                                    ) : (
                                      <span className="text-[13px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">TBD</span>
                                    )}
                                  </div>

                                  {/* 第 3 行: 起点 → 终点 胶囊 */}
                                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-[13px] mb-3" style={{ background: 'rgba(219, 39, 119, 0.08)' }}>
                                    <span>
                                      <span className="text-slate-500 text-[12px]">起点</span>{' '}
                                      <span className="font-black tabular-nums text-[14px]" style={{ color: '#be185d', fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.startBalance * rate, 1)}万</span>
                                    </span>
                                    <span style={{ color: '#f9a8d4', fontSize: '15px' }}>→</span>
                                    <span>
                                      <span className="text-slate-500 text-[12px]">终点</span>{' '}
                                      <span className="font-black tabular-nums text-[14px]" style={{ color: '#be185d', fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.endBalance * rate, 1)}万</span>
                                    </span>
                                  </div>

                                  {/* 第 4 行: 年度收益完成度进度条 (PE 微光扫过) */}
                                  <div className="flex items-center gap-2 mb-2 text-[13px] font-bold" style={{ color: '#db2777' }}>
                                    <span className="whitespace-nowrap">{hasActual ? '本年完成' : '尚未填收益'}</span>
                                    <div className="flex-1 h-[9px] rounded-full overflow-hidden relative" style={{ background: 'rgba(219, 39, 119, 0.12)' }}>
                                      <div
                                        className="h-full rounded-full relative progress-shine"
                                        style={{
                                          width: `${Math.min(100, yearProgressPct)}%`,
                                          background: yearProgressPct >= 100
                                            ? 'linear-gradient(90deg, #f43f5e 0%, #fb923c 50%, #fbbf24 100%)'  // 达标: 红橙金
                                            : 'linear-gradient(90deg, #10b981 0%, #fbbf24 50%, #e11d48 100%)',  // 未达: 绿黄红
                                          boxShadow: '0 0 6px rgba(251, 191, 36, 0.4)',
                                        }}
                                      ></div>
                                    </div>
                                    <span className="tabular-nums">{yearProgressPct.toFixed(0)}%</span>
                                  </div>

                                  {/* 北极星对比 */}
                                  <div className="text-[12px] text-slate-400">
                                    北极星 <span className="tabular-nums">{symbol}{fmtWan(y.planEndBalance * rate, 1)}万</span>
                                    {' · '}
                                    {y.endBalance >= y.planEndBalance ? (
                                      <span className="text-rose-500 font-bold">领先 {symbol}{fmtWan((y.endBalance - y.planEndBalance) * rate, 1)}万</span>
                                    ) : (
                                      <span className="text-emerald-500 font-bold">落后 {symbol}{fmtWan((y.planEndBalance - y.endBalance) * rate, 1)}万</span>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // ============ 其他年份紧凑行 ============
                            return (
                              <div key={y.year} className="rounded-lg px-3 py-2.5 bg-slate-50/60">
                                <div className="flex items-center gap-2.5">
                                  <div className="text-[17px] font-black tabular-nums text-slate-500 w-14 flex-shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    {y.year}
                                  </div>
                                  <div className="flex-1 flex items-center justify-between text-[14px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="text-slate-500 text-[13px]">+{symbol}{fmtWan(y.planTarget * rate, 1)}</span>
                                      <span className="text-slate-300">→</span>
                                      <span className={`font-black ${!hasActual ? 'text-slate-400 italic font-normal' : y.actualGain >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {hasActual ? `${y.actualGain >= 0 ? '+' : ''}${symbol}${fmtWan(y.actualGain * rate, 1)}万` : 'TBD'}
                                      </span>
                                    </div>
                                    {hasActual ? (
                                      <span className={`text-[12px] font-bold px-2 py-0.5 rounded tabular-nums ${isOverTarget ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                        {diff >= 0 ? '+' : ''}{symbol}{fmtWan(diff * rate, 1)}万
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-bold">TBD</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setEditYearlyActualId(y.year)}
                                    className="w-7 h-7 rounded bg-slate-200 hover:bg-blue-500 hover:text-white flex items-center justify-center active:scale-95 transition text-slate-500 flex-shrink-0"
                                  >
                                    <Edit2 className="w-3 h-3"/>
                                  </button>
                                </div>

                                {/* 起点 → 终点 小胶囊 */}
                                <div className="flex items-center justify-between mt-1.5 ml-14 mr-9 px-2.5 py-1 rounded text-[12px] bg-white">
                                  <span>
                                    <span className="text-slate-400 text-[11px]">起点</span>{' '}
                                    <span className="font-bold text-slate-600 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.startBalance * rate, 1)}万</span>
                                  </span>
                                  <span className="text-slate-300">→</span>
                                  <span>
                                    <span className="text-slate-400 text-[11px]">终点</span>{' '}
                                    <span className={`font-bold tabular-nums italic ${y.isProjected ? 'text-slate-400' : 'text-slate-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>{symbol}{fmtWan(y.endBalance * rate, 1)}万</span>
                                  </span>
                                </div>

                                {/* 北极星对比 */}
                                <div className="text-[12px] text-slate-400 mt-1.5 ml-14">
                                  北极星 <span className="tabular-nums">{symbol}{fmtWan(y.planEndBalance * rate, 1)}万</span>
                                  {' · '}
                                  {y.endBalance >= y.planEndBalance ? (
                                    <span className="text-rose-500 font-bold">领先 {symbol}{fmtWan((y.endBalance - y.planEndBalance) * rate, 1)}万</span>
                                  ) : (
                                    <span className="text-emerald-500 font-bold">落后 {symbol}{fmtWan((y.planEndBalance - y.endBalance) * rate, 1)}万</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* 展开/收起按钮 */}
                          {yearlyFinal.length > 3 && (
                            <button
                              onClick={() => setShowAllYears(!showAllYears)}
                              className="w-full py-3 mt-2 rounded-lg active:scale-95 transition flex items-center justify-center gap-1.5 text-[13px] font-bold"
                              style={{
                                background: '#fff8f5',
                                border: '1px dashed #fbcfe8',
                                color: '#db2777',
                              }}
                            >
                              {showAllYears ? (
                                <>
                                  <ChevronUp className="w-4 h-4"/>
                                  收起 · 只看前 3 年
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4"/>
                                  展开剩余 {hiddenCount} 年
                                </>
                              )}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* ============ 模块 4: 投资戒律 ============ */}
                <div className="rounded-2xl bg-white p-4 shadow mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-violet-600"/>
                      <div className="text-sm font-black text-slate-800">投资戒律</div>
                      <span className="text-[10px] text-slate-400">({disciplines.length})</span>
                    </div>
                    <button
                      onClick={() => setShowAddDiscipline(true)}
                      className="px-2 py-1 rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition"
                    >
                      <Plus className="w-3 h-3"/> 添加
                    </button>
                  </div>

                  {/* 等级筛选 */}
                  <div className="flex gap-1 mb-3 overflow-x-auto">
                    <button
                      onClick={() => setFilterLevel('all')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${filterLevel === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >全部 ({disciplines.length})</button>
                    {LEVELS.map(l => {
                      const count = disciplines.filter(d => d.level === l.level).length;
                      return (
                        <button
                          key={l.level}
                          onClick={() => setFilterLevel(l.level)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap flex items-center gap-1 ${filterLevel === l.level ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                          <span>{l.level}</span><span>{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 戒律列表 */}
                  {disciplines.length === 0 ? (
                    <div className="text-center py-8 px-3 bg-slate-50 rounded-xl text-slate-500 text-sm">
                      <div className="text-3xl mb-2">📖</div>
                      <div className="mb-2 font-bold">还没有戒律</div>
                      <div className="text-xs">记录你的投资经验教训, 防止重复犯错</div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(showAllDisciplines ? filteredDisciplines : filteredDisciplines.slice(0, 10)).map(d => {
                          const isLong = d.text.length > 60;
                          const isExpanded = expandedDisciplines[d.id];
                          const displayText = (isLong && !isExpanded) ? d.text.slice(0, 60) + '...' : d.text;
                          return (
                            <div key={d.id} className={`relative rounded-xl border p-3 ${LEVEL_COLORS[d.level] || ''}`}>
                              {d.pinned && (
                                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow">
                                  <Pin className="w-2.5 h-2.5 text-white" fill="white"/>
                                </div>
                              )}
                              <div className="flex items-start gap-2">
                                <div className="text-base shrink-0">{d.level}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm leading-relaxed font-medium whitespace-pre-wrap break-words">{displayText}</div>
                                  {isLong && (
                                    <button
                                      onClick={() => setExpandedDisciplines(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                                      className="text-[11px] mt-1 font-bold underline opacity-70"
                                    >
                                      {isExpanded ? '收起' : '展开全文'}
                                    </button>
                                  )}
                                  <div className="text-[10px] mt-1 opacity-60">{d.date}</div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await db.updateDiscipline(d.id, { ...d, pinned: !d.pinned });
                                        setDisciplines(disciplines.map(x => x.id === d.id ? { ...x, pinned: !x.pinned } : x));
                                      } catch (e) { alert('Pin 失败: ' + e.message); }
                                    }}
                                    className={`p-1 rounded ${d.pinned ? 'bg-amber-200' : 'hover:bg-white/50'}`}
                                  >
                                    <Pin className="w-3 h-3 opacity-70"/>
                                  </button>
                                  <button onClick={() => setEditingDisciplineId(d.id)} className="p-1 rounded hover:bg-white/50">
                                    <Edit2 className="w-3 h-3 opacity-70"/>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {filteredDisciplines.length > 10 && (
                        <button
                          onClick={() => setShowAllDisciplines(!showAllDisciplines)}
                          className="w-full mt-3 py-2 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition border border-violet-200"
                        >
                          {showAllDisciplines ? (<><ChevronUp className="w-3.5 h-3.5"/>收起, 只看前 10 条</>) : (<><ChevronDown className="w-3.5 h-3.5"/>展开剩余 {filteredDisciplines.length - 10} 条</>)}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* ============ 模块 5: 月度复盘日志 ============ */}
                <div className="rounded-2xl bg-white p-4 shadow mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Edit2 className="w-4 h-4 text-blue-600"/>
                      <div className="text-sm font-black text-slate-800">复盘日志</div>
                      <span className="text-[10px] text-slate-400">({reviewLogs.length})</span>
                    </div>
                    <button
                      onClick={() => setShowAddLog(true)}
                      className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition"
                    >
                      <Plus className="w-3 h-3"/> 写复盘
                    </button>
                  </div>

                  {reviewLogs.length === 0 ? (
                    <div className="text-center py-8 px-3 bg-slate-50 rounded-xl text-slate-500 text-sm">
                      <div className="text-3xl mb-2">📝</div>
                      <div className="mb-2 font-bold">还没有复盘</div>
                      <div className="text-xs">每周/每月记录一下操作和思考</div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(showAllLogs ? reviewLogs : reviewLogs.slice(0, 10)).map(l => (
                          <div key={l.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-xs font-black text-slate-700 tabular-nums">{l.date}</div>
                              <div className="flex items-center gap-1.5">
                                {l.mood && <span className="text-[10px] text-blue-600 font-bold bg-blue-100 px-1.5 py-0.5 rounded">{l.mood}</span>}
                                <button onClick={() => setEditingLogId(l.id)} className="p-1 rounded hover:bg-white">
                                  <Edit2 className="w-3 h-3 text-slate-400"/>
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{l.text}</div>
                          </div>
                        ))}
                      </div>
                      {/* 展开/收起按钮 (跟戒律一致样式) */}
                      {reviewLogs.length > 10 && (
                        <button
                          onClick={() => setShowAllLogs(!showAllLogs)}
                          className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 active:scale-95 transition flex items-center justify-center gap-1.5"
                        >
                          {showAllLogs ? (
                            <><ChevronUp className="w-3.5 h-3.5"/>收起, 只看前 10 条</>
                          ) : (
                            <><ChevronDown className="w-3.5 h-3.5"/>展开剩余 {reviewLogs.length - 10} 条</>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* ====== 复利计划设置 Modal ====== */}
                {showPlanSettings && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPlanSettings(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">复利计划设置</h3>
                        <button onClick={() => setShowPlanSettings(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4"/>
                        </button>
                      </div>
                      {(() => {
                        const [draft, setDraft] = [investmentPlan, setInvestmentPlan];
                        const settingCurrency = draft.displayCurrency || 'USD';
                        const isCNYSetting = settingCurrency === 'CNY';
                        const settingSymbol = isCNYSetting ? '¥' : '$';
                        const settingRate = isCNYSetting ? (usdRate || 7.2) : 1;
                        // 输入框显示值 (当前币种)
                        const displayStartCapital = draft.startCapital * settingRate;
                        return (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">基础本金 ({settingSymbol})</label>
                              <input
                                type="number"
                                value={Math.round(displayStartCapital)}
                                onChange={e => {
                                  const inputVal = parseFloat(e.target.value) || 0;
                                  // 存回 USD
                                  setDraft({ ...draft, startCapital: inputVal / settingRate });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                              />
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                当前: {fmtWanUSD(draft.startCapital, 0)}
                                {isCNYSetting && <span> (输入 ¥ 自动换算为 USD 存储, 汇率 1 USD = {settingRate} CNY)</span>}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">年化目标 (%)</label>
                              <input
                                type="number"
                                step="1"
                                value={(draft.targetAnnualRate * 100).toFixed(0)}
                                onChange={e => setDraft({ ...draft, targetAnnualRate: (parseFloat(e.target.value) || 0) / 100 })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-slate-500 block mb-1">起始年</label>
                                <input
                                  type="number"
                                  value={draft.startYear === '' ? '' : draft.startYear}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setDraft({ ...draft, startYear: v === '' ? '' : (parseInt(v) || 0) });
                                  }}
                                  onBlur={e => {
                                    const v = parseInt(e.target.value);
                                    if (!v || v < 2000) setDraft({ ...draft, startYear: 2026 });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 block mb-1">总年数</label>
                                <input
                                  type="number"
                                  value={draft.totalYears === '' ? '' : draft.totalYears}
                                  onChange={e => {
                                    const v = e.target.value;
                                    // 空 → 保持空 (允许删除); 否则解析为数字
                                    setDraft({ ...draft, totalYears: v === '' ? '' : (parseInt(v) || 0) });
                                  }}
                                  onBlur={e => {
                                    // 失焦时: 如果是空 / 0, fallback 到 10
                                    const v = parseInt(e.target.value);
                                    if (!v || v < 1) setDraft({ ...draft, totalYears: 10 });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">目标年龄</label>
                              <input
                                type="number"
                                value={draft.ageGoalAge === '' ? '' : (draft.ageGoalAge || '')}
                                onChange={e => {
                                  const v = e.target.value;
                                  setDraft({ ...draft, ageGoalAge: v === '' ? '' : (parseInt(v) || 0) });
                                }}
                                onBlur={e => {
                                  const v = parseInt(e.target.value);
                                  if (!v || v < 1) setDraft({ ...draft, ageGoalAge: 40 });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">个人箴言 (可选)</label>
                              <textarea
                                value={draft.motto || ''}
                                onChange={e => setDraft({ ...draft, motto: e.target.value })}
                                placeholder="例: 40 岁主账户 $500 万"
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              />
                            </div>
                            <div className="text-[10px] text-slate-500 bg-slate-50 rounded p-2">
                              按此计划 {draft.totalYears} 年后将达 <span className="font-bold text-amber-700">{fmtWanUSD(draft.startCapital * Math.pow(1 + draft.targetAnnualRate, draft.totalYears), 0)}</span>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setShowPlanSettings(false)} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
                        <button
                          onClick={async () => {
                            try {
                              await db.upsertInvestmentPlan(investmentPlan);
                              setShowPlanSettings(false);
                            } catch (e) { alert('保存失败: ' + e.message); }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-bold"
                        >保存</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 融资修改 Modal ====== */}
                {showEditMargin && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditMargin(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">融资杠杆</h3>
                        <button onClick={() => setShowEditMargin(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4"/>
                        </button>
                      </div>
                      <div className="space-y-3">
                        {/* 账户净值显示 (自动, 不可改) */}
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">账户净值 (自动)</div>
                          <div className="font-bold text-slate-800 tabular-nums text-sm">{fmtWanUSD(currentBalance, 1)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">来自目标 tab 最近填写的余额</div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-500 block mb-1">当前融资额 ({investmentPlan.displayCurrency === 'CNY' ? '¥' : '$'})</label>
                          {(() => {
                            const isCNYMargin = investmentPlan.displayCurrency === 'CNY';
                            const rateMargin = isCNYMargin ? (usdRate || 7.2) : 1;
                            const displayMargin = marginStatus.currentMargin * rateMargin;
                            return (
                              <>
                                <input
                                  type="number"
                                  value={Math.round(displayMargin)}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setMarginStatus({ ...marginStatus, currentMargin: val / rateMargin });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                                  placeholder={isCNYMargin ? '例: 3600000 (360 万¥)' : '例: 500000 (50 万$)'}
                                />
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  当前: {fmtWanUSD(marginStatus.currentMargin, 1)}
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {/* 实时计算预览 */}
                        {currentBalance > 0 && (
                          <div className={`rounded-lg p-3 border ${marginRatio >= 1.5 ? 'bg-rose-50 border-rose-200' : marginRatio >= 1.3 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                            <div className="text-[10px] font-bold uppercase mb-1 tracking-widest">
                              {marginRatio >= 1.5 ? '🚨 危险区' : marginRatio >= 1.3 ? '⚠️ 中等区' : '✅ 安全区'}
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs text-slate-600">总仓位倍率:</span>
                              <span className={`text-lg font-black tabular-nums ${marginRatio >= 1.5 ? 'text-rose-700' : marginRatio >= 1.3 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {marginRatio.toFixed(2)}x
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              1.0-1.3x 安全 · 1.3-1.5x 中等 · 1.5x+ 危险
                            </div>
                          </div>
                        )}
                        {currentBalance === 0 && (
                          <div className="text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                            💡 先在目标 tab 填年度数据, 才能自动算杠杆倍率
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setShowEditMargin(false)} className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">取消</button>
                        <button
                          onClick={async () => {
                            try {
                              await db.upsertMarginStatus(marginStatus);
                              setShowEditMargin(false);
                            } catch (e) { alert('保存失败: ' + e.message); }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
                        >保存</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 添加/编辑 戒律 Modal ====== */}
                {(showAddDiscipline || editingDisciplineId) && (() => {
                  const isEdit = !!editingDisciplineId;
                  const current = isEdit ? disciplines.find(d => d.id === editingDisciplineId) : null;
                  return (
                    <DisciplineModal
                      initial={current || { level: '🟢', text: '', pinned: false }}
                      onCancel={() => { setShowAddDiscipline(false); setEditingDisciplineId(null); }}
                      onDelete={isEdit ? () => {
                        showConfirm({
                          title: '删除这条戒律?',
                          desc: '此操作不可撤销',
                          info: (current?.text || '').slice(0, 50) + ((current?.text || '').length > 50 ? '...' : ''),
                          confirmText: '删除',
                          onConfirm: async () => {
                            try {
                              await db.deleteDiscipline(editingDisciplineId);
                              setDisciplines(disciplines.filter(d => d.id !== editingDisciplineId));
                              setEditingDisciplineId(null);
                              setShowAddDiscipline(false);
                            } catch (e) { alert('删除失败: ' + e.message); }
                          },
                        });
                      } : null}
                      onSave={async (data) => {
                        try {
                          if (isEdit) {
                            await db.updateDiscipline(editingDisciplineId, data);
                            setDisciplines(disciplines.map(d => d.id === editingDisciplineId ? { ...d, ...data } : d));
                            setEditingDisciplineId(null);
                          } else {
                            // 防重复: 10 秒内相同内容拒绝
                            const text = (data.text || '').trim();
                            const last = lastSubmitRef.current['discipline'];
                            const now = Date.now();
                            if (last && last.text === text && (now - last.at) < 10000) {
                              alert('⚠️ 10 秒内已提交过相同内容, 请勿重复');
                              return;
                            }
                            const saved = await db.insertDiscipline(data);
                            lastSubmitRef.current['discipline'] = { text, at: now };
                            setDisciplines([saved, ...disciplines]);
                            setShowAddDiscipline(false);
                          }
                        } catch (e) { alert('保存失败: ' + e.message); }
                      }}
                    />
                  );
                })()}

                {/* ====== 添加/编辑 日志 Modal ====== */}
                {(showAddLog || editingLogId) && (() => {
                  const isEdit = !!editingLogId;
                  const current = isEdit ? reviewLogs.find(l => l.id === editingLogId) : null;
                  return (
                    <LogModal
                      initial={current || { date: new Date().toISOString().slice(0, 10), mood: '', text: '' }}
                      onCancel={() => { setShowAddLog(false); setEditingLogId(null); }}
                      onDelete={isEdit ? () => {
                        showConfirm({
                          title: '删除这条复盘?',
                          desc: '此操作不可撤销',
                          info: current?.date + ' · ' + (current?.text || '').slice(0, 40) + ((current?.text || '').length > 40 ? '...' : ''),
                          confirmText: '删除',
                          onConfirm: async () => {
                            try {
                              await db.deleteReviewLog(editingLogId);
                              setReviewLogs(reviewLogs.filter(l => l.id !== editingLogId));
                              setEditingLogId(null);
                              setShowAddLog(false);
                            } catch (e) { alert('删除失败: ' + e.message); }
                          },
                        });
                      } : null}
                      onSave={async (data) => {
                        try {
                          if (isEdit) {
                            await db.updateReviewLog(editingLogId, data);
                            setReviewLogs(reviewLogs.map(l => l.id === editingLogId ? { ...l, ...data } : l));
                            setEditingLogId(null);
                          } else {
                            // 防重复: 10 秒内相同内容拒绝
                            const text = (data.text || '').trim();
                            const last = lastSubmitRef.current['log'];
                            const now = Date.now();
                            if (last && last.text === text && (now - last.at) < 10000) {
                              alert('⚠️ 10 秒内已提交过相同内容, 请勿重复');
                              return;
                            }
                            const saved = await db.insertReviewLog(data);
                            lastSubmitRef.current['log'] = { text, at: now };
                            setReviewLogs([saved, ...reviewLogs]);
                            setShowAddLog(false);
                          }
                        } catch (e) { alert('保存失败: ' + e.message); }
                      }}
                    />
                  );
                })()}

                {/* ====== 编辑年度实际数据 Modal ====== */}
                {editYearlyActualId && (() => {
                  const year = editYearlyActualId;
                  const existing = yearlyActuals.find(a => a.year === year);
                  return (
                    <YearlyActualModal
                      year={year}
                      initial={existing || { actualGain: null, endBalance: null }}
                      currency={investmentPlan.displayCurrency || 'USD'}
                      rate={(investmentPlan.displayCurrency === 'CNY') ? (usdRate || 7.2) : 1}
                      onCancel={() => setEditYearlyActualId(null)}
                      onSave={async (actualGain, endBalance) => {
                        try {
                          await db.upsertYearlyActual(year, actualGain, endBalance);
                          const idx = yearlyActuals.findIndex(a => a.year === year);
                          if (idx >= 0) {
                            const next = [...yearlyActuals];
                            next[idx] = { ...next[idx], actualGain, endBalance };
                            setYearlyActuals(next);
                          } else {
                            setYearlyActuals([...yearlyActuals, { year, actualGain, endBalance }]);
                          }
                          setEditYearlyActualId(null);
                        } catch (e) { alert('保存失败: ' + e.message); }
                      }}
                    />
                  );
                })()}
              </>
            );
          })()}

    </>
  );
}
