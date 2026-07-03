import React from 'react';

export default function AnalysisTab({ ctx }) {
  const {
    accountDeleteConfirmId,
    accounts,
    Calendar,
    chartSelectedMonthIdx,
    ChevronRight,
    db,
    fillMonth,
    fmt,
    hkdRate,
    newAccount,
    Plus,
    setAccountDeleteConfirmId,
    setAccounts,
    setChartSelectedMonthIdx,
    setFillMonth,
    setHkdRate,
    setNewAccount,
    setShowAddAccount,
    setShowFillSnapshot,
    setShowMonthsDetail,
    setSnapshotDraft,
    setSnapshots,
    setSnapshotTab,
    setUsdRate,
    showAddAccount,
    showFillSnapshot,
    showMonthsDetail,
    snapshotDraft,
    snapshots,
    snapshotTab,
    Trash2,
    TrendingDown,
    TrendingUp,
    usdRate,
    X,
  } = ctx;

  return (
    <>

          {(() => {
            // ============ 工具函数 ============
            const currentMonth = new Date().toISOString().slice(0, 7); // '2026-04'
            const lastMonthDate = new Date();
            lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
            const lastMonth = lastMonthDate.toISOString().slice(0, 7);

            // 本年初 (2026-01)
            const yearStart = currentMonth.slice(0, 4) + '-01';

            // 12 个月前
            const yearAgoDate = new Date();
            yearAgoDate.setMonth(yearAgoDate.getMonth() - 12);
            const yearAgo = yearAgoDate.toISOString().slice(0, 7);

            // 最近 12 个月的月份列表 (从 12 月前到当月)
            const last12Months = [];
            for (let i = 11; i >= 0; i--) {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              last12Months.push(d.toISOString().slice(0, 7));
            }

            // ============ 数据函数 ============
            const getBalance = (accId, month) => {
              const snap = snapshots.find(s => s.accountId === accId && s.month === month);
              return snap ? snap.balance : 0;
            };
            const toCNY = (balance, currency) => {
              if (currency === 'USD') return balance * usdRate;
              if (currency === 'HKD') return balance * hkdRate;
              return balance;  // CNY 直接返回
            };
            const balanceAtMonthCNY = (accId, month) => {
              const acc = accounts.find(a => a.id === accId);
              if (!acc) return 0;
              return toCNY(getBalance(accId, month), acc.currency);
            };
            const totalAtMonth = (month) =>
              accounts.reduce((sum, acc) => sum + balanceAtMonthCNY(acc.id, month), 0);

            // 万单位格式化 (保留 1 位小数)
            const fmtWan = (n) => {
              const v = Math.abs(n) / 10000;
              return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            };

            // ============ 核心数据 ============
            const totalNow = totalAtMonth(currentMonth);
            const totalLast = totalAtMonth(lastMonth);
            const totalYearStart = totalAtMonth(yearStart);
            const totalYearAgo = totalAtMonth(yearAgo);

            const monthChange = totalNow - totalLast;
            const monthChangePct = totalLast > 0 ? (monthChange / totalLast) * 100 : 0;
            const ytdChange = totalNow - totalYearStart;
            const ytdChangePct = totalYearStart > 0 ? (ytdChange / totalYearStart) * 100 : 0;
            const yearChange = totalNow - totalYearAgo;
            const yearChangePct = totalYearAgo > 0 ? (yearChange / totalYearAgo) * 100 : 0;

            // 12 个月走势数据
            const chartData = last12Months.map(m => totalAtMonth(m));
            const nonZero = chartData.filter(v => v > 0);
            const chartMin = nonZero.length > 0 ? Math.min(...nonZero) : 0;
            const chartMax = nonZero.length > 0 ? Math.max(...nonZero) : 0;
            const chartRange = chartMax - chartMin || 1;

            // 按持有人分组
            const myAccounts = accounts.filter(a => a.owner === '我');
            const wifeAccounts = accounts.filter(a => a.owner === '老婆');
            const myTotal = myAccounts.reduce((s, a) => s + balanceAtMonthCNY(a.id, currentMonth), 0);
            const wifeTotal = wifeAccounts.reduce((s, a) => s + balanceAtMonthCNY(a.id, currentMonth), 0);
            const myPct = totalNow > 0 ? (myTotal / totalNow) * 100 : 0;
            const wifePct = totalNow > 0 ? (wifeTotal / totalNow) * 100 : 0;

            return (
              <>
                {/* ============ 顶部:总资产卡 (奢华黑金) ============ */}
                <div
                  className="rounded-2xl p-5 mb-4 text-white relative overflow-hidden"
                  style={{
                    background: `
                      radial-gradient(circle at 0% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
                      radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.1) 0%, transparent 50%),
                      linear-gradient(135deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)
                    `,
                    border: '1px solid rgba(251, 191, 36, 0.2)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(251, 191, 36, 0.1)',
                  }}
                >
                  {/* 金色光晕装饰 */}
                  <div className="absolute top-0 right-0 w-44 h-44 pointer-events-none" style={{
                    background: 'radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%)',
                    transform: 'translate(40%, -40%)',
                  }}></div>

                  <div className="flex items-center justify-between mb-3 relative z-10">
                    {/* 金色渐变标题 */}
                    <div
                      className="text-[10px] uppercase font-bold"
                      style={{
                        letterSpacing: '3px',
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      家庭总资产
                    </div>
                    {/* 金色边框按钮 */}
                    <button
                      onClick={() => setShowMonthsDetail(true)}
                      className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md active:scale-95 transition"
                      style={{
                        color: '#fbbf24',
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                      }}
                      title="查看 12 个月走势"
                    >
                      <Calendar className="w-3 h-3" />
                      {currentMonth}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 主数字 - 金色渐变 */}
                  <div
                    className="text-4xl font-black tabular-nums relative z-10"
                    style={{
                      fontFamily: 'ui-monospace, "SF Mono", monospace',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-1px',
                    }}
                  >
                    ¥{fmtWan(totalNow)}<span className="text-lg ml-1 font-bold">万</span>
                  </div>

                  {/* 金色分隔线 */}
                  <div
                    className="h-px my-4"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(251, 191, 36, 0.3) 50%, transparent 100%)',
                    }}
                  ></div>

                  {/* 3 个指标 */}
                  <div className="grid grid-cols-3 gap-3 relative z-10">
                    <div>
                      <div
                        className="text-[9px] uppercase font-bold mb-1"
                        style={{
                          color: '#a3a3a3',
                          letterSpacing: '1.5px',
                        }}
                      >
                        较上月
                      </div>
                      {totalLast > 0 ? (
                        <>
                          <div className={`text-xs font-bold tabular-nums flex items-center gap-0.5`} style={{ color: monthChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {monthChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {monthChange >= 0 ? '+' : '-'}¥{fmtWan(monthChange)}万
                          </div>
                          <div className="text-[11px] font-bold" style={{ color: monthChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {monthChangePct >= 0 ? '+' : ''}{monthChangePct.toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500">无数据</div>
                      )}
                    </div>
                    <div style={{ borderLeft: '1px solid rgba(251, 191, 36, 0.15)', paddingLeft: '12px' }}>
                      <div
                        className="text-[9px] uppercase font-bold mb-1"
                        style={{ color: '#a3a3a3', letterSpacing: '1.5px' }}
                      >
                        年初至今
                      </div>
                      {totalYearStart > 0 ? (
                        <>
                          <div className="text-xs font-bold tabular-nums flex items-center gap-0.5" style={{ color: ytdChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {ytdChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {ytdChange >= 0 ? '+' : '-'}¥{fmtWan(ytdChange)}万
                          </div>
                          <div className="text-[11px] font-bold" style={{ color: ytdChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {ytdChangePct >= 0 ? '+' : ''}{ytdChangePct.toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500">无数据</div>
                      )}
                    </div>
                    <div style={{ borderLeft: '1px solid rgba(251, 191, 36, 0.15)', paddingLeft: '12px' }}>
                      <div
                        className="text-[9px] uppercase font-bold mb-1"
                        style={{ color: '#a3a3a3', letterSpacing: '1.5px' }}
                      >
                        近一年
                      </div>
                      {totalYearAgo > 0 ? (
                        <>
                          <div className="text-xs font-bold tabular-nums flex items-center gap-0.5" style={{ color: yearChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {yearChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {yearChange >= 0 ? '+' : '-'}¥{fmtWan(yearChange)}万
                          </div>
                          <div className="text-[11px] font-bold" style={{ color: yearChange >= 0 ? '#fda4af' : '#6ee7b7' }}>
                            {yearChangePct >= 0 ? '+' : ''}{yearChangePct.toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500">无数据</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ============ 12 个月走势图 (有数据时才显示) ============ */}
                {nonZero.length >= 2 && (
                  <div className="rounded-2xl bg-white p-4 shadow mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                        <span>📈</span>
                        <span>12 个月走势</span>
                      </div>
                      <div className="text-[10px] text-slate-500">月度 · 点圆点查看</div>
                    </div>

                    {/* v40 fix47: 默认隐藏, 点圆点才出 (紧凑红卡) */}
                    {chartSelectedMonthIdx !== null && chartData[chartSelectedMonthIdx] > 0 && (() => {
                      const validIdxs = chartData.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);
                      const selectedIdx = chartSelectedMonthIdx;
                      const value = chartData[selectedIdx];
                      const monthStr = last12Months[selectedIdx];
                      const [year, month] = monthStr.split('-');
                      const prevValidIdx = validIdxs.filter(i => i < selectedIdx).pop();
                      const prevValue = prevValidIdx != null ? chartData[prevValidIdx] : null;
                      const change = prevValue ? value - prevValue : null;
                      const changePct = prevValue ? (change / prevValue * 100) : null;
                      return (
                        <div
                          className="text-center mb-2 px-3 py-2 rounded-lg"
                          style={{
                            background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
                            border: '1px solid #fecaca',
                          }}
                        >
                          <span className="text-[11px] text-slate-500 font-semibold">{year}-{month} · </span>
                          <span className="font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '17px', color: '#dc2626' }}>
                            ¥{fmtWan(value)}万
                          </span>
                          {change !== null && (
                            <span className="font-bold tabular-nums ml-2" style={{
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: '11px',
                              color: change >= 0 ? '#dc2626' : '#16a34a',
                            }}>
                              {change >= 0 ? '↑ +' : '↓ '}{changePct.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <svg viewBox="0 0 320 120" className="w-full h-32">
                      <defs>
                        <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25"/>
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {/* 网格线 */}
                      {[0, 0.25, 0.5, 0.75, 1].map(t => (
                        <line key={t} x1="0" x2="320" y1={20 + t * 80} y2={20 + t * 80} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2 2"/>
                      ))}
                      {(() => {
                        // 只画有数据的月份 (v > 0), 空月份断线不画
                        const validPoints = chartData
                          .map((v, i) => ({
                            x: (i / (chartData.length - 1)) * 320,
                            y: 20 + (1 - (v - chartMin) / chartRange) * 80,
                            v,
                            i,
                            isLast: i === chartData.length - 1,
                          }))
                          .filter(p => p.v > 0);

                        if (validPoints.length === 0) return null;

                        // 构造 path (只连有效月份)
                        const pathD = validPoints.length > 1
                          ? `M ${validPoints[0].x} ${validPoints[0].y} ${validPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`
                          : '';
                        // 面积 (底部闭合)
                        const areaD = validPoints.length > 1
                          ? `${pathD} L ${validPoints[validPoints.length - 1].x} 120 L ${validPoints[0].x} 120 Z`
                          : '';

                        // 估算 path 总长度 (用于 stroke-dasharray 动画)
                        let pathLength = 0;
                        for (let i = 1; i < validPoints.length; i++) {
                          const dx = validPoints[i].x - validPoints[i - 1].x;
                          const dy = validPoints[i].y - validPoints[i - 1].y;
                          pathLength += Math.sqrt(dx * dx + dy * dy);
                        }

                        // V2 动画参数
                        // - 点: 逐个弹出 (overshoot), 间隔 0.2s
                        // - 线: 0.2s 后开始画, 1.5s 画完
                        // - 面积: 0.8s 后淡入
                        const totalPointDuration = validPoints.length * 0.2;

                        return (
                          <>
                            <style>{`
                              @keyframes assetPop {
                                0%   { opacity: 0; transform: scale(0) translateY(10px); }
                                60%  { opacity: 1; transform: scale(1.4) translateY(0); }
                                100% { opacity: 1; transform: scale(1); }
                              }
                              @keyframes assetDrawLine {
                                from { stroke-dashoffset: ${pathLength}; }
                                to   { stroke-dashoffset: 0; }
                              }
                              @keyframes assetFadeIn {
                                from { opacity: 0; }
                                to   { opacity: 1; }
                              }
                              .asset-chart-dot {
                                opacity: 0;
                                transform-box: fill-box;
                                transform-origin: center;
                                animation: assetPop 0.4s ease-out forwards;
                              }
                              .asset-chart-line {
                                stroke-dasharray: ${pathLength};
                                stroke-dashoffset: ${pathLength};
                                animation: assetDrawLine 1.5s ease-out 0.2s forwards;
                              }
                              .asset-chart-area {
                                opacity: 0;
                                animation: assetFadeIn 1s ease-out 0.8s forwards;
                              }
                              .asset-chart-empty-dot {
                                opacity: 0;
                                animation: assetFadeIn 0.5s ease-out 1.8s forwards;
                              }
                            `}</style>
                            {/* 面积 (延迟淡入) */}
                            {areaD && <path d={areaD} fill="url(#assetGrad)" className="asset-chart-area" />}
                            {/* 折线 (从左画到右) */}
                            {pathD && <path d={pathD} fill="none" stroke="#f43f5e" strokeWidth="2" className="asset-chart-line" />}
                            {/* 数据点 (依次弹出) */}
                            {validPoints.map((p, idx) => {
                              const isSelected = chartSelectedMonthIdx === p.i;
                              return (
                                <g key={p.i}>
                                  {/* 选中时的辅助竖线 */}
                                  {isSelected && (
                                    <line x1={p.x} y1={p.y} x2={p.x} y2="120" stroke="#f43f5e" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
                                  )}
                                  <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={isSelected ? 7 : (p.isLast ? 4 : 2)}
                                    fill={isSelected ? '#f43f5e' : (p.isLast ? '#f43f5e' : 'white')}
                                    stroke={isSelected ? 'white' : '#f43f5e'}
                                    strokeWidth={isSelected ? 3 : 1.5}
                                    className="asset-chart-dot"
                                    style={{ animationDelay: `${idx * 0.2}s`, cursor: 'pointer' }}
                                    onClick={() => setChartSelectedMonthIdx(prev => prev === p.i ? null : p.i)}
                                  />
                                  {/* 加大点击区 (透明) */}
                                  <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="12"
                                    fill="transparent"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setChartSelectedMonthIdx(prev => prev === p.i ? null : p.i)}
                                  />
                                </g>
                              );
                            })}
                            {/* 空月份提示 (最后淡入) */}
                            {chartData.map((v, i) => {
                              if (v > 0) return null;
                              const x = (i / (chartData.length - 1)) * 320;
                              return (
                                <circle
                                  key={`empty-${i}`}
                                  cx={x}
                                  cy={100}
                                  r={1.5}
                                  fill="#cbd5e1"
                                  opacity="0.6"
                                  className="asset-chart-empty-dot"
                                />
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>

                    <div className="flex justify-between text-[9px] text-slate-400 font-medium mt-1 px-1">
                      <span>{last12Months[0].slice(5)}月</span>
                      <span>{last12Months[5].slice(5)}月</span>
                      <span>{last12Months[11].slice(5)}月</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
                      <div>
                        <div className="text-[9px] text-slate-500">最低</div>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">¥{fmtWan(chartMin)}万</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500">最高</div>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">¥{fmtWan(chartMax)}万</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500">区间</div>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">¥{fmtWan(chartRange)}万</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ============ 操作按钮 ============ */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => { setFillMonth(currentMonth); setShowFillSnapshot(true); }}
                    disabled={accounts.length === 0}
                    className="py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                    style={{
                      background: accounts.length === 0 ? '#e2e8f0' : '#fff',
                      color: accounts.length === 0 ? '#94a3b8' : '#d97706',
                      border: accounts.length === 0 ? '2px solid #cbd5e1' : '2px solid #fbbf24',
                    }}
                  >
                    <Calendar className="w-4 h-4"/> 填月度余额
                  </button>
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4"/> 新增账户
                  </button>
                </div>

                {/* ============ 空状态 ============ */}
                {accounts.length === 0 && (
                  <div className="text-center py-12 px-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-dashed border-blue-200 mb-4">
                    <div className="text-5xl mb-3">💰</div>
                    <div className="text-slate-700 font-bold mb-1.5">还没有账户</div>
                    <div className="text-xs text-slate-500 mb-3">添加你和家人的账户,记录每月余额</div>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 transition text-sm font-bold text-white"
                    >
                      添加第一个账户
                    </button>
                  </div>
                )}

                {/* ============ 持有人分组卡 ============ */}
                {[
                  { owner: '我', icon: '👤', gradient: 'from-blue-50 to-cyan-50 border-blue-100', barColor: '#3b82f6', accounts: myAccounts, total: myTotal, pct: myPct },
                  { owner: '老婆', icon: '👩', gradient: 'from-pink-50 to-rose-50 border-pink-100', barColor: '#ec4899', accounts: wifeAccounts, total: wifeTotal, pct: wifePct },
                ].map(({ owner, icon, gradient, barColor, accounts: ownerAccs, total, pct }) => {
                  if (ownerAccs.length === 0) return null;
                  return (
                    <div key={owner} className={`rounded-2xl bg-gradient-to-br ${gradient} border p-4 shadow-sm mb-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{icon}</span>
                          <div>
                            <div className="font-black text-slate-800 text-base">{owner}</div>
                            <div className="text-[10px] text-slate-500 font-medium">{ownerAccs.length} 个账户 · 占总资产 {pct.toFixed(0)}%</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-slate-800 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>¥{fmtWan(total)}万</div>
                        </div>
                      </div>

                      {/* 占比进度条 */}
                      <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-3">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }}></div>
                      </div>

                      {/* 账户列表 */}
                      <div className="space-y-2">
                        {ownerAccs.map(acc => {
                          const bal = getBalance(acc.id, currentMonth);
                          const balCNY = toCNY(bal, acc.currency);
                          return (
                            <div key={acc.id} className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between transition">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-lg shrink-0">
                                  {acc.icon || '💰'}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-800 text-sm truncate">{acc.name}</div>
                                  <div className="text-[10px] text-slate-500">{acc.type}{acc.currency !== 'CNY' ? ` · ${acc.currency}` : ''}</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 mr-2">
                                {acc.currency !== 'CNY' ? (
                                  <>
                                    <div className="font-bold text-slate-800 text-sm tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {acc.currency === 'USD' ? '$' : 'HK$'}{fmt(bal, 0)}
                                    </div>
                                    <div className="text-[10px] text-slate-500 tabular-nums">≈¥{fmtWan(balCNY)}万</div>
                                  </>
                                ) : (
                                  <div className="font-bold text-slate-800 text-sm tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>¥{fmtWan(bal)}万</div>
                                )}
                              </div>
                              <button
                                onClick={() => setAccountDeleteConfirmId(acc.id)}
                                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-xs transition active:scale-90"
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* ============ 美元汇率设置 (有 USD 账户时才显示) ============ */}
                {accounts.some(a => a.currency === 'USD') && (
                  <div className="bg-white rounded-xl p-3 mb-3 shadow flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💱</span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">美元汇率</div>
                        <div className="text-[10px] text-slate-500">USD → CNY 换算</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">1 USD =</span>
                      <input
                        type="number"
                        step="0.01"
                        value={usdRate}
                        onChange={(e) => setUsdRate(parseFloat(e.target.value) || 7.20)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center font-bold tabular-nums"
                      />
                      <span className="text-xs text-slate-500">CNY</span>
                    </div>
                  </div>
                )}

                {/* ============ 港币汇率设置 (有 HKD 账户时才显示) ============ */}
                {accounts.some(a => a.currency === 'HKD') && (
                  <div className="bg-white rounded-xl p-3 mb-4 shadow flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💱</span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">港币汇率</div>
                        <div className="text-[10px] text-slate-500">HKD → CNY 换算</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">1 HKD =</span>
                      <input
                        type="number"
                        step="0.01"
                        value={hkdRate}
                        onChange={(e) => setHkdRate(parseFloat(e.target.value) || 0.87)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center font-bold tabular-nums"
                      />
                      <span className="text-xs text-slate-500">CNY</span>
                    </div>
                  </div>
                )}

                {/* ====== 添加账户 Modal ====== */}
                {showAddAccount && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddAccount(false)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">添加账户</h3>
                        <button onClick={() => setShowAddAccount(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">拥有人</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['我', '老婆'].map(o => (
                              <button
                                key={o}
                                onClick={() => setNewAccount({...newAccount, owner: o})}
                                className={`py-2 rounded-lg text-sm font-bold transition ${newAccount.owner === o ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >{o}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">类型</label>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { t: '银行', i: '🏦' },
                              { t: '证券', i: '📈' },
                              { t: '支付宝', i: '💚' },
                              { t: '微信', i: '💬' },
                              { t: '定期', i: '🔒' },
                              { t: '现金', i: '💵' },
                              { t: '公积金', i: '🏛️' },
                              { t: '其他', i: '💰' },
                            ].map(({ t, i }) => (
                              <button
                                key={t}
                                onClick={() => setNewAccount({...newAccount, type: t, icon: i})}
                                className={`py-2 rounded-lg text-xs font-bold transition flex flex-col items-center gap-0.5 ${newAccount.type === t ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' : 'bg-slate-50 text-slate-600 border-2 border-transparent'}`}
                              >
                                <span className="text-base">{i}</span>
                                <span>{t}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">账户名</label>
                          {/* 快捷预设 (按类型动态显示) */}
                          {(() => {
                            const presets = {
                              '银行':   ['招商银行', '招商永隆', '工商银行', '建设银行', '中国银行'],
                              '证券':   ['长桥证券', 'IBKR', '富途', '老虎', '华泰证券', '东方财富'],
                              '支付宝': ['支付宝现金', '支付宝理财'],
                              '微信':   ['微信钱包', '微信零钱通'],
                              '定期':   ['银行定期', '大额存单', '货币基金'],
                              '现金':   ['现金'],
                              '公积金': ['住房公积金', '企业年金'],
                              '其他':   ['房产', '车', '黄金', '保险'],
                            };
                            const list = presets[newAccount.type] || [];
                            if (list.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {list.map(p => (
                                  <button
                                    key={p}
                                    onClick={() => setNewAccount({...newAccount, name: p})}
                                    className={`px-2 py-1 rounded-md text-xs font-bold transition ${
                                      newAccount.name === p
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          <input
                            type="text"
                            value={newAccount.name}
                            onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                            placeholder="点上面快捷选或自己输入"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">币种</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['CNY', 'USD', 'HKD'].map(c => (
                              <button
                                key={c}
                                onClick={() => setNewAccount({...newAccount, currency: c})}
                                className={`py-2 rounded-lg text-sm font-bold transition ${newAccount.currency === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >{c}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">当前余额 (可稍后填)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newAccount.balance}
                            onChange={(e) => setNewAccount({...newAccount, balance: e.target.value})}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => setShowAddAccount(false)}
                          className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                        >取消</button>
                        <button
                          onClick={async () => {
                            if (!newAccount.name.trim()) { alert('请填写账户名'); return; }
                            // 检查同人同名 (本地预检查, 云端还有 UNIQUE 约束兜底)
                            if (accounts.find(a => a.owner === newAccount.owner && a.name === newAccount.name.trim())) {
                              alert('该账户已存在');
                              return;
                            }
                            try {
                              // 1. 先写云端
                              const saved = await db.insertAccount({
                                owner: newAccount.owner,
                                type: newAccount.type,
                                name: newAccount.name.trim(),
                                currency: newAccount.currency,
                                icon: newAccount.icon,
                                sortOrder: accounts.length,
                              });
                              // 2. 用云端返回的真实 id 更新本地 state
                              setAccounts([...accounts, saved]);
                              // 3. 如果填了余额, 云端插一条快照
                              if (newAccount.balance && parseFloat(newAccount.balance) > 0) {
                                const val = parseFloat(newAccount.balance);
                                await db.upsertSnapshot(saved.id, currentMonth, val);
                                setSnapshots([...snapshots, {
                                  id: 'new_' + Date.now(),
                                  accountId: saved.id,
                                  month: currentMonth,
                                  balance: val,
                                }]);
                              }
                              setNewAccount({ owner: '我', type: '银行', name: '', currency: 'CNY', icon: '🏦', balance: '' });
                              setShowAddAccount(false);
                            } catch (e) {
                              console.error('[添加账户] 失败:', e);
                              alert('添加失败: ' + (e.message || '未知错误'));
                            }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
                        >添加</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 删除账户确认 Modal ====== */}
                {accountDeleteConfirmId && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAccountDeleteConfirmId(null)}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                      <h3 className="font-bold text-base mb-2">删除账户</h3>
                      <p className="text-sm text-slate-600 mb-4">
                        删除 <span className="font-bold">{accounts.find(a => a.id === accountDeleteConfirmId)?.name}</span> ?
                        <br/><span className="text-xs text-slate-400">该账户所有月度快照也会一起删除</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAccountDeleteConfirmId(null)}
                          className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                        >取消</button>
                        <button
                          onClick={async () => {
                            const accId = accountDeleteConfirmId;
                            try {
                              // 云端删除 (snapshots 通过外键 cascade 自动删)
                              await db.deleteAccount(accId);
                              setAccounts(accounts.filter(a => a.id !== accId));
                              setSnapshots(snapshots.filter(s => s.accountId !== accId));
                              setAccountDeleteConfirmId(null);
                            } catch (e) {
                              console.error('[删除账户] 失败:', e);
                              alert('删除失败: ' + (e.message || '未知错误'));
                            }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold"
                        >删除</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 12 个月资产走势 Modal (v10.7.9.42 黑金版 + 环比金额) ====== */}
                {showMonthsDetail && (
                  <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowMonthsDetail(false)}>
                    <div className="rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden" style={{ background: '#0f0f0f', border: '1px solid rgba(251,191,36,0.35)', boxShadow: '0 25px 60px -10px rgba(0,0,0,0.9), 0 0 40px rgba(251,191,36,0.06)' }} onClick={(e) => e.stopPropagation()}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ background: 'linear-gradient(135deg,#0a0a0a,#1a1a1a)', borderBottom: '1px solid rgba(251,191,36,0.15)' }}>
                        <h3 className="font-black text-base flex items-center gap-1.5 text-white">
                          <span>📅</span>
                          <span>12 个月资产走势</span>
                        </h3>
                        <button onClick={() => setShowMonthsDetail(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 列表: 最新在顶部 */}
                      <div className="px-3 py-3 overflow-y-auto space-y-1.5">
                        {[...last12Months].reverse().map((m, idx) => {
                          const reversedIdx = last12Months.length - 1 - idx; // 原始索引
                          const total = chartData[reversedIdx];
                          const prevTotal = reversedIdx > 0 ? chartData[reversedIdx - 1] : 0;
                          const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
                          const changeAmt = prevTotal > 0 ? (total - prevTotal) : null; // v10.7.9.42 环比金额
                          const isCurrent = m === currentMonth;
                          const isYearStart = m.endsWith('-01');
                          const hasData = total > 0;
                          const isFlat = change !== null && Math.abs(change) < 0.05; // 持平判定

                          return (
                            <div
                              key={m}
                              className="flex items-center justify-between py-3 px-4 rounded-xl"
                              style={isCurrent
                                ? { background: 'linear-gradient(135deg, rgba(251,191,36,0.16), rgba(251,191,36,0.06))', border: '1px solid rgba(251,191,36,0.4)' }
                                : hasData
                                  ? { background: 'rgba(255,255,255,0.04)' }
                                  : { background: 'rgba(255,255,255,0.02)', opacity: 0.5 }
                              }
                            >
                              <div className="flex items-center gap-2">
                                <div className="text-[15px] font-black tabular-nums" style={{ color: isCurrent ? '#fbbf24' : '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>
                                  {m}
                                </div>
                                {isYearStart && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}>年初</span>
                                )}
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: '#fbbf24', color: '#0a0a0a' }}>本月</span>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-[15px] font-bold tabular-nums" style={{ color: isCurrent ? '#fff' : hasData ? '#f1f5f9' : '#64748b', fontFamily: 'ui-monospace, monospace' }}>
                                  {hasData ? `¥${fmtWan(total)}万` : '无数据'}
                                </div>
                                {hasData && change !== null ? (
                                  <div className="text-[11px] font-bold tabular-nums mt-0.5" style={{ fontFamily: 'ui-monospace, monospace', color: isFlat ? '#64748b' : change >= 0 ? '#f87171' : '#34d399' }}>
                                    {isFlat
                                      ? '±0 · 0.0%'
                                      : `${change >= 0 ? '+' : '-'}${fmtWan(changeAmt)}万 · ${change >= 0 ? '↑' : '↓'}${Math.abs(change).toFixed(1)}%`
                                    }
                                  </div>
                                ) : hasData ? (
                                  <div className="text-[11px] mt-0.5" style={{ color: '#475569', fontFamily: 'ui-monospace, monospace' }}>起始月</div>
                                ) : (
                                  <div className="text-[11px] mt-0.5" style={{ color: '#334155' }}>—</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 底部: 快捷操作 */}
                      <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <button
                          onClick={() => {
                            setShowMonthsDetail(false);
                            setFillMonth(currentMonth);
                            setShowFillSnapshot(true);
                          }}
                          className="w-full py-3 rounded-xl text-sm font-black active:scale-95 transition flex items-center justify-center gap-1.5"
                          style={{
                            background: 'rgba(251,191,36,0.08)',
                            color: '#fbbf24',
                            border: '1.5px solid rgba(251,191,36,0.5)',
                          }}
                        >
                          <Plus className="w-4 h-4"/> 补录/修改月度余额
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== 填快照 Modal ====== */}
                {showFillSnapshot && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowFillSnapshot(false); setSnapshotDraft({}); }}>
                    <div className="bg-white rounded-2xl p-4 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-base">填月度余额</h3>
                        <button onClick={() => { setShowFillSnapshot(false); setSnapshotDraft({}); }} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 月份选择器 */}
                      <div className="bg-slate-50 rounded-lg p-3 mb-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">选择月份</div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              const d = new Date(fillMonth + '-15');
                              d.setMonth(d.getMonth() - 1);
                              setFillMonth(d.toISOString().slice(0, 7));
                              setSnapshotDraft({}); // 切月清空草稿
                            }}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition font-bold"
                          >
                            ‹
                          </button>
                          <div className="flex-1 text-center">
                            <div className="text-lg font-black text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{fillMonth}</div>
                            {fillMonth === currentMonth && (
                              <div className="text-[10px] text-blue-600 font-bold">本月</div>
                            )}
                            {fillMonth > currentMonth && (
                              <div className="text-[10px] text-amber-600 font-bold">未来月</div>
                            )}
                            {fillMonth < currentMonth && (
                              <div className="text-[10px] text-slate-500 font-bold">历史月</div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              const d = new Date(fillMonth + '-15');
                              d.setMonth(d.getMonth() + 1);
                              setFillMonth(d.toISOString().slice(0, 7));
                              setSnapshotDraft({});
                            }}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition font-bold"
                          >
                            ›
                          </button>
                        </div>
                        {/* 快捷跳转 */}
                        {fillMonth !== currentMonth && (
                          <button
                            onClick={() => { setFillMonth(currentMonth); setSnapshotDraft({}); }}
                            className="w-full mt-2 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold active:scale-95 transition"
                          >
                            回到本月 ({currentMonth})
                          </button>
                        )}
                      </div>

                      {/* Tab 切换: 我 / 老婆 */}
                      {(() => {
                        const myAccs = accounts.filter(a => a.owner === '我');
                        const wifeAccs = accounts.filter(a => a.owner === '老婆');
                        const hasMulti = myAccs.length > 0 && wifeAccs.length > 0;

                        // 当前 Tab 过滤 (单人时不显示 Tab, 直接全部)
                        const currentAccs = hasMulti
                          ? (snapshotTab === '我' ? myAccs : wifeAccs)
                          : accounts;

                        // 小计 (CNY)
                        const curSum = currentAccs.reduce((sum, acc) => {
                          const v = parseFloat(snapshotDraft[acc.id] ?? getBalance(acc.id, fillMonth) ?? 0) || 0;
                          return sum + toCNY(v, acc.currency);
                        }, 0);

                        return (
                          <>
                            {hasMulti && (
                              <div className="flex gap-0 bg-slate-100 p-1 rounded-lg mb-3">
                                {[
                                  { owner: '我', icon: '👤', accs: myAccs, color: '#3b82f6' },
                                  { owner: '老婆', icon: '👩', accs: wifeAccs, color: '#ec4899' },
                                ].map(({ owner, icon, accs }) => {
                                  const active = snapshotTab === owner;
                                  return (
                                    <button
                                      key={owner}
                                      onClick={() => setSnapshotTab(owner)}
                                      className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition ${
                                        active ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
                                      }`}
                                    >
                                      <span>{icon}</span>
                                      <span>{owner}</span>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                        active ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'
                                      }`}>{accs.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* 小计 */}
                            {hasMulti && (
                              <div className="text-[11px] text-slate-500 mb-2 flex items-center justify-between">
                                <span>{snapshotTab} · {currentAccs.length} 个账户</span>
                                <span className="font-bold text-slate-700 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ≈ ¥{fmt(curSum, 0)}
                                </span>
                              </div>
                            )}

                            <div className="space-y-2">
                              {currentAccs.map(acc => {
                                const currentBal = getBalance(acc.id, fillMonth);
                                const draftVal = snapshotDraft[acc.id] ?? (currentBal || '');
                                return (
                                  <div key={acc.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                                    <span className="text-lg">{acc.icon || '💰'}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold truncate">{acc.name}</div>
                                      <div className="text-[10px] text-slate-500">{acc.currency}</div>
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={draftVal}
                                      onChange={(e) => setSnapshotDraft({...snapshotDraft, [acc.id]: e.target.value})}
                                      placeholder="0"
                                      className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm tabular-nums text-right"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => { setShowFillSnapshot(false); setSnapshotDraft({}); }}
                          className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                        >取消</button>
                        <button
                          onClick={async () => {
                            // 收集有效数据
                            const validEntries = Object.entries(snapshotDraft)
                              .map(([accId, valStr]) => ({ accId, val: parseFloat(valStr) }))
                              .filter(({ val }) => !isNaN(val) && val >= 0);

                            if (validEntries.length === 0) {
                              setShowFillSnapshot(false);
                              setSnapshotDraft({});
                              return;
                            }

                            try {
                              // 并发写云端 (每个账户独立 upsert)
                              await Promise.all(
                                validEntries.map(({ accId, val }) =>
                                  db.upsertSnapshot(accId, fillMonth, val)
                                )
                              );

                              // 本地 state 同步更新
                              const newSnapshots = [...snapshots];
                              validEntries.forEach(({ accId, val }) => {
                                const idx = newSnapshots.findIndex(s => s.accountId === accId && s.month === fillMonth);
                                if (idx >= 0) {
                                  newSnapshots[idx] = { ...newSnapshots[idx], balance: val };
                                } else {
                                  newSnapshots.push({
                                    id: 'new_' + Date.now() + '_' + accId,
                                    accountId: accId,
                                    month: fillMonth,
                                    balance: val,
                                  });
                                }
                              });
                              setSnapshots(newSnapshots);
                              setSnapshotDraft({});
                              setShowFillSnapshot(false);
                            } catch (e) {
                              console.error('[保存快照] 失败:', e);
                              alert('保存失败: ' + (e.message || '未知错误'));
                            }
                          }}
                          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold"
                        >保存 {fillMonth}</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

    </>
  );
}
