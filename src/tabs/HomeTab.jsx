import React from 'react';

export default function HomeTab({ ctx }) {
  const {
    addStock,
    ALERT_LEVELS,
    benchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions,
    benchmarkStatus,
    benchmarkStock,
    benchmarkSymbol,
    calendarEvents,
    CheckCircle2,
    displayFgi,
    editingStock,
    fgi,
    fgiDataDate,
    fgiMonth,
    fgiPrev,
    fgiWeek,
    fgiYear,
    fmt,
    fmtPct,
    indices,
    lastSeenAlerts,
    newStock,
    Plus,
    priceFlash,
    removeStock,
    setAlertsMuted,
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setEditingStock,
    setLastSeenAlerts,
    setNewStock,
    setSelectedEvent,
    setShowAddStock,
    setVix,
    setVixDataDate,
    showAddStock,
    TrendingUp,
    triggeredAlerts,
    updateStockPrice,
    vix,
    VixCard,
    vixDataDate,
    vixSignal,
    watchlist,
    watchlistAlerts,
  } = ctx;

  return (
    <>


        {/* 两大指数(标普/纳指 当天分时,迷你卡片) */}
        {indices.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {indices.map((idx) => {
              if (idx.error) {
                return (
                  <div key={idx.ticker} className="bg-white rounded-xl p-3 shadow text-center">
                    <div className="text-xs text-slate-500 font-bold">{idx.name}</div>
                    <div className="text-[10px] text-red-500 mt-2">拉取失败</div>
                  </div>
                );
              }
              const isUp = idx.changePercent >= 0;
              const accentColor = isUp ? '#dc2626' : '#16a34a';        // 红涨绿跌
              const bgColor = isUp ? 'rgba(220, 38, 38, 0.08)' : 'rgba(22, 163, 74, 0.08)';
              const series = (idx.intraday || []).filter(v => v != null && !isNaN(v));

              // 走势图绘制(纯 SVG)
              let pathD = '';
              let fillD = '';
              if (series.length > 1) {
                const min = Math.min(...series, idx.previousClose);
                const max = Math.max(...series, idx.previousClose);
                const range = max - min || 1;
                const W = 100, H = 32;
                const points = series.map((v, i) => {
                  const x = (i / (series.length - 1)) * W;
                  const y = H - ((v - min) / range) * H;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                pathD = `M ${points.join(' L ')}`;
                fillD = `${pathD} L ${W},${H} L 0,${H} Z`;
              }

              return (
                <div key={idx.ticker} className="bg-white rounded-xl p-3 shadow overflow-hidden relative">
                  {/* 名字(英文代码已删除,只保留中文名) */}
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700">{idx.name}</span>
                  </div>
                  {/* 当前价 - BTC 加美元符,指数纯点位 */}
                  <div className={`text-base font-black tabular-nums leading-tight`} style={{ color: accentColor, fontFamily: 'ui-monospace, monospace' }}>
                    {idx.ticker === 'BTC-USD.CC' ? '$' : ''}{(idx.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {/* 涨跌幅 */}
                  <div className={`text-[11px] font-bold tabular-nums leading-tight`} style={{ color: accentColor }}>
                    {isUp ? '+' : ''}{(idx.changePercent || 0).toFixed(2)}%
                  </div>
                  {/* 走势线 */}
                  {series.length > 1 ? (
                    <svg viewBox="0 0 100 32" className="w-full h-8 mt-1.5" preserveAspectRatio="none">
                      <path d={fillD} fill={bgColor} />
                      <path d={pathD} fill="none" stroke={accentColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                  ) : (
                    <div className="h-8 mt-1.5 flex items-center justify-center text-[10px] text-slate-300">无数据</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 合并卡:市场状态 + 触发预警 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          {/* === 第 1 排:市场状态(可切换基准) === */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">当前信号</div>
              <div className="text-2xl font-black mt-1 text-slate-900 leading-tight">{benchmarkStatus.text}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{benchmarkStatus.desc}</div>
            </div>
            <div className="text-right relative shrink-0">
              {/* 下拉触发按钮(显示当前基准代码) */}
              <button
                onClick={() => setBenchmarkMenuOpen(!benchmarkMenuOpen)}
                className="text-xs text-slate-500 uppercase tracking-wider font-bold hover:text-slate-700 active:scale-95 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-slate-100"
              >
                <span>{benchmarkStock?.symbol || 'QQQ'} 回撤</span>
                <svg className={`w-3 h-3 transition-transform ${benchmarkMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
              </button>
              <div className={`text-3xl font-black tabular-nums mt-1 ${benchmarkDrawdown <= -0.10 ? 'text-red-600' : benchmarkDrawdown <= -0.05 ? 'text-amber-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                {fmtPct(benchmarkDrawdown)}
              </div>
              {/* 当前价 / 52周高(小字补充) */}
              {benchmarkStock && (
                <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                  ${(benchmarkStock.price || 0).toFixed(2)} / 52周高 ${(benchmarkStock.high || 0).toFixed(2)}
                </div>
              )}

              {/* 下拉菜单 */}
              {benchmarkMenuOpen && (
                <>
                  {/* 遮罩点击外关闭 */}
                  <div className="fixed inset-0 z-40" onClick={() => setBenchmarkMenuOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100">
                      切换基准
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {benchmarkOptions.map(opt => {
                        const isActive = opt.symbol === benchmarkSymbol;
                        return (
                          <button
                            key={opt.symbol}
                            onClick={() => { setBenchmarkSymbol(opt.symbol); setBenchmarkMenuOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition ${isActive ? 'bg-blue-50' : ''}`}
                          >
                            <div className="min-w-0">
                              <div className={`font-bold ${isActive ? 'text-blue-700' : 'text-slate-900'}`}>{opt.symbol}</div>
                              <div className="text-[10px] text-slate-500 truncate">{opt.name}</div>
                            </div>
                            {isActive && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                    {benchmarkOptions.length === 1 && (
                      <div className="px-3 py-2 text-[10px] text-slate-400 italic border-t border-slate-100">
                        添加更多关注股票后可切换
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* === 第 2 排:触发预警 === */}
          {triggeredAlerts.length > 0 && (
            <>
              <div className="border-t border-slate-200 my-4"></div>

              {!alertsMuted ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        触发预警 · {triggeredAlerts.length}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setAlertsMuted(true);
                        // 持久化: 记住"已折叠" + 存当前看到的股票等级
                        try {
                          localStorage.setItem('bottomline_alerts_muted', 'true');
                          const snap = {};
                          triggeredAlerts.forEach(s => { snap[s.symbol] = s.alert.level; });
                          localStorage.setItem('bottomline_last_seen_alerts', JSON.stringify(snap));
                          setLastSeenAlerts(snap);
                        } catch {}
                      }}
                      className="text-xs text-slate-500 font-medium hover:text-slate-700 active:scale-95 px-2 py-0.5 rounded"
                    >
                      收起 ▲
                    </button>
                  </div>

                  <div className="space-y-3">
                    {triggeredAlerts.map(s => {
                      const isExtreme = s.alert.level >= 7;
                      const levelColor = s.alert.level >= 7 ? 'text-red-600 bg-red-50 border-red-200' 
                                       : s.alert.level >= 5 ? 'text-orange-600 bg-orange-50 border-orange-200'
                                       : s.alert.level >= 3 ? 'text-amber-600 bg-amber-50 border-amber-200'
                                       : 'text-yellow-700 bg-yellow-50 border-yellow-200';
                      // 回撤% 的渐进背景色(警示强度递增)
                      const ddBadge = s.alert.level >= 7 ? 'text-red-100 bg-gradient-to-r from-red-700 to-black border-red-900 shadow-md'
                                    : s.alert.level >= 5 ? 'text-white bg-red-600 border-red-700 shadow-sm'
                                    : s.alert.level >= 3 ? 'text-white bg-orange-500 border-orange-600'
                                    : 'text-amber-900 bg-amber-200 border-amber-400';
                      return (
                        <button
                          key={s.symbol}
                          onClick={() => setEditingStock(s.symbol)}
                          className="w-full text-left active:scale-[0.99] transition"
                        >
                          {/* 第 1 行:股票信息 + 价格 */}
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                              <span className={`font-black text-base text-slate-900 hover:text-blue-600 transition ${isExtreme ? 'animate-pulse' : ''}`}>
                                {s.symbol}
                              </span>
                              <span className="text-xs text-slate-500">{s.name}</span>
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${levelColor}`}>
                                L{s.alert.level} · {s.alert.label}
                              </span>
                              {/* "新" 徽章: 新股票或等级升级 */}
                              {(() => {
                                const prevLevel = lastSeenAlerts[s.symbol] || 0;
                                if (s.alert.level > prevLevel) {
                                  return (
                                    <span
                                      className="text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                                      style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', letterSpacing: '0.5px' }}
                                    >
                                      {prevLevel === 0 ? '新' : '升级'}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-slate-400 tabular-nums leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                从 ${fmt(s.high)}
                              </div>
                              <div className="flex items-baseline gap-1.5 leading-tight justify-end">
                                <span className="text-base font-black tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ${fmt(s.price)}
                                </span>
                                <span className={`text-sm font-black tabular-nums px-1.5 py-0.5 rounded border ${ddBadge} ${isExtreme ? 'animate-pulse' : ''}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {(s.drawdown * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* 第 2 行:操作建议 */}
                          <div className="text-xs text-slate-500 pl-0">
                            ➡️ {s.alert.action}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    setAlertsMuted(false);
                    try { localStorage.setItem('bottomline_alerts_muted', 'false'); } catch {}
                  }}
                  className="w-full py-2.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-bold border border-orange-200 active:scale-95"
                >
                  🔔 有 {triggeredAlerts.length} 个预警被收起,点击展开
                </button>
              )}
            </>
          )}
        </div>

        {/* 📅 v10.7.9.41: 重要日历 (时间轴风格) */}
        {(() => {
          // v10.7.9.41: 15 天范围 + V1 日期格式 (今天 / M/D)
          const today = new Date().toISOString().slice(0, 10);
          const fifteenDaysLater = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const futureEvents = (calendarEvents || [])
            .filter(e => e.date >= today && e.date <= fifteenDaysLater)
            .slice(0, 10);  // 最多 10 个

          if (futureEvents.length === 0) return null;

          // V1 日期格式: 今天 / 4/28 / 5/1
          const dayLabel = (dateStr) => {
            const d = new Date(dateStr);
            const todayDate = new Date(today);
            const diff = Math.round((d - todayDate) / (24 * 60 * 60 * 1000));
            if (diff === 0) return '今天';
            return `${d.getMonth() + 1}/${d.getDate()}`;
          };

          // 类型颜色
          const typeColor = (type, isToday) => {
            if (isToday) return { dot: '#dc2626', glow: 'rgba(220,38,38,0.6)', day: '#dc2626' };
            if (type === 'earnings') return { dot: '#f59e0b', glow: 'rgba(245,158,11,0.4)', day: '#94a3b8' };
            if (type === 'fomc') return { dot: '#1e40af', glow: 'rgba(30,64,175,0.4)', day: '#94a3b8' };
            if (type === 'cpi') return { dot: '#7c3aed', glow: 'rgba(124,58,237,0.4)', day: '#94a3b8' };
            if (type === 'nonfarm') return { dot: '#0891b2', glow: 'rgba(8,145,178,0.4)', day: '#94a3b8' };
            return { dot: '#94a3b8', glow: 'rgba(148,163,184,0.4)', day: '#94a3b8' };
          };

          return (
            <div className="bg-white rounded-2xl shadow p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[12px] font-bold text-slate-700">📅 重要日历 · 15 天内</div>
                <div className="text-[10px] text-slate-400">点圆点看详情</div>
              </div>
              {/* 时间轴 */}
              <div className="relative">
                {/* 横线 */}
                <div
                  className="absolute left-2 right-2 rounded-full"
                  style={{
                    top: '18px',
                    height: '2px',
                    background: 'linear-gradient(90deg, #dc2626 0%, #fbbf24 30%, #1e40af 60%, #7c3aed 100%)',
                  }}
                ></div>
                {/* 事件列表 横滑 */}
                <div className="flex gap-2 overflow-x-auto pb-1 relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {futureEvents.map((e, idx) => {
                    const isToday = e.date === today;
                    const c = typeColor(e.type, isToday);
                    // 颜色: 不同类型不同色
                    const nameColor = e.type === 'earnings' ? '#d97706'
                      : e.type === 'fomc' ? '#1e40af'
                      : e.type === 'cpi' ? '#7c3aed'
                      : e.type === 'nonfarm' ? '#0891b2'
                      : '#475569';
                    // 显示名 (中文化)
                    const displayName = e.symbol || (
                      e.type === 'fomc' ? 'FOMC'
                      : e.type === 'cpi' ? 'CPI'
                      : e.type === 'nonfarm' ? '非农'
                      : ''
                    );
                    // 副文字
                    const subText = (() => {
                      if (e.type === 'fomc') return '美联储议息';
                      if (e.type === 'cpi') return '通胀数据';
                      if (e.type === 'nonfarm') return '就业数据';
                      if (e.type !== 'earnings') return '';
                      const t = (e.time || '').toLowerCase();
                      if (t.includes('pre') || t.includes('before')) return '财报 · 盘前';
                      if (t.includes('after') || t.includes('post')) return '财报 · 盘后';
                      if (t.includes('not-supplied') || t.includes('not supplied') || t === '') return '财报';
                      return '财报 · 盘中';
                    })();
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedEvent(e)}
                        className="flex-shrink-0 text-center active:scale-95 transition"
                        style={{ width: '90px' }}
                      >
                        {/* 大圆点 */}
                        <div
                          className="rounded-full mx-auto"
                          style={{
                            width: isToday ? '14px' : '12px',
                            height: isToday ? '14px' : '12px',
                            background: c.dot,
                            margin: '12px auto 8px',
                            border: '3px solid white',
                            boxShadow: isToday ? `0 0 0 2px ${c.dot}, 0 0 8px ${c.glow}` : `0 0 0 1px ${c.dot}`,
                          }}
                        ></div>
                        <div className="text-[10px] font-bold tabular-nums" style={{ color: c.day, fontFamily: 'ui-monospace, monospace' }}>
                          {dayLabel(e.date)}
                        </div>
                        <div className="text-[13px] font-black mt-0.5 truncate px-1" style={{ color: isToday ? '#dc2626' : nameColor }}>
                          {displayName}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5 truncate px-1">
                          {subText}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* VIX 恐慌指数 */}
        <VixCard
          vix={vix}
          setVix={setVix}
          vixDataDate={vixDataDate}
          setVixDataDate={setVixDataDate}
          vixSignal={vixSignal}
        />

        {/* CNN 恐慌贪婪指数 (FGI) */}
        {(() => {
          // 5 档分级
          const getFgiLevel = (v) => {
            if (v < 25) return { label: 'Extreme Fear', cn: '极度恐慌', color: 'bg-rose-100 text-rose-800 border-rose-300', barColor: 'bg-rose-500', accent: 'text-rose-600', action: '🎯 重点买入区, 分批进攻', desc: '市场极度恐慌,反向操作时机' };
            if (v < 45) return { label: 'Fear', cn: '恐慌', color: 'bg-orange-100 text-orange-800 border-orange-300', barColor: 'bg-orange-500', accent: 'text-orange-600', action: '✅ 买入区, 可分批建仓', desc: '市场偏恐慌,逢低布局' };
            if (v < 55) return { label: 'Neutral', cn: '中立', color: 'bg-slate-100 text-slate-700 border-slate-300', barColor: 'bg-slate-400', accent: 'text-slate-600', action: '⏸ 观望,不动作', desc: '市场情绪平衡' };
            if (v < 75) return { label: 'Greed', cn: '贪婪', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', barColor: 'bg-emerald-500', accent: 'text-emerald-600', action: '⚠️ 减仓区,获利了结部分仓位', desc: '市场偏贪婪,谨慎追高' };
            return { label: 'Extreme Greed', cn: '极度贪婪', color: 'bg-red-100 text-red-800 border-red-400', barColor: 'bg-red-600', accent: 'text-red-700', action: '🚨 高风险区, 减仓为主, 留核心仓', desc: '市场极度贪婪,泡沫风险' };
          };
          const cur = getFgiLevel(fgi);

          // === 半圆仪表盘 (用 circle + stroke-dasharray 实现完美弧线) ===
          // viewBox: 0 0 280 180. 圆心 (140, 150),半径 110
          const cx = 140, cy = 150, R = 110;
          // 一个半圆的周长 = π × R
          const halfCircumference = Math.PI * R;
          // 5 段定义
          const segments = [
            { from: 0,  to: 25,  color: '#fb7185', label: 'EXTREME FEAR' },
            { from: 25, to: 45,  color: '#fb923c', label: 'FEAR' },
            { from: 45, to: 55,  color: '#94a3b8', label: 'NEUTRAL' },
            { from: 55, to: 75,  color: '#4ade80', label: 'GREED' },
            { from: 75, to: 100, color: '#16a34a', label: 'EXTREME GREED' },
          ];
          // 找当前段(用动画值,这样动画过程中段会一路切换)
          const animFgi = displayFgi;
          const activeIdx = segments.findIndex(s => animFgi >= s.from && animFgi < s.to);
          const safeActiveIdx = activeIdx === -1 ? (animFgi >= 100 ? 4 : 0) : activeIdx;

          // 0-100 → 角度(180° = 左, 0° = 右)
          const valueToAngle = (v) => 180 - (v / 100) * 180;
          const polar = (angleDeg, radius) => {
            const rad = angleDeg * Math.PI / 180;
            return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
          };
          // 指针位置(用动画值)
          const needleAngle = valueToAngle(animFgi);
          const needleTip = polar(needleAngle, R - 5);

          // 用 dasharray 在半圆上画一段
          // 所有段保持相同粗细,通过透明度区分激活/非激活
          const renderSegment = (seg, isActive) => {
            const segLen = ((seg.to - seg.from) / 100) * halfCircumference;
            const offsetLen = (seg.from / 100) * halfCircumference;
            return (
              <path
                key={`${seg.from}-${seg.to}`}
                d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
                fill="none"
                stroke={seg.color}
                strokeWidth={22}
                strokeDasharray={`${segLen} ${halfCircumference}`}
                strokeDashoffset={-offsetLen}
                opacity={isActive ? 1 : 0.45}
              />
            );
          };

          const renderHistorical = (val, labelText) => {
            if (val === null) return null;
            const lev = getFgiLevel(val);
            return (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-500">{labelText}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${lev.accent}`}>{lev.cn}</span>
                  <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${lev.color}`}>
                    {val}
                  </span>
                </div>
              </div>
            );
          };

          return (
            <div className={`rounded-2xl p-5 mb-4 shadow border-2 ${cur.color}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs opacity-80 font-medium">CNN 恐慌贪婪指数</span>
                    {fgiDataDate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/50 font-bold">
                        实时 · {(() => {
                          const d = new Date(fgiDataDate);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        })()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">{cur.desc}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-80">操作信号</div>
                  <div className="text-lg font-black mt-0.5">{cur.cn}</div>
                </div>
              </div>

              {/* 半圆仪表盘 (CNN 官方风) */}
              <div className="flex justify-center my-2">
                <svg viewBox="0 0 280 200" className="w-full max-w-[320px]">
                  {/* 隐藏的文字路径(供沿弧弯曲的标签用) */}
                  <defs>
                    {segments.map((seg, i) => {
                      const a1 = valueToAngle(seg.from);
                      const a2 = valueToAngle(seg.to);
                      const p1 = polar(a1, R);
                      const p2 = polar(a2, R);
                      return (
                        <path
                          key={`labelpath-${i}`}
                          id={`fgi-label-path-${i}`}
                          d={`M ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y}`}
                          fill="none"
                        />
                      );
                    })}
                  </defs>

                  {/* 5 段半圆弧 */}
                  {segments.map((seg, i) => renderSegment(seg, i === safeActiveIdx))}

                  {/* 5 段标签:EXTREME 两行直排往内挪,其他沿弧弯曲 */}
                  {segments.map((seg, i) => {
                    const isActive = i === safeActiveIdx;
                    const isExtreme = seg.label.includes('EXTREME');

                    if (isExtreme) {
                      // EXTREME FEAR / EXTREME GREED:两行直排,往内挪 12px
                      const midAngle = valueToAngle((seg.from + seg.to) / 2);
                      const labelPos = polar(midAngle, R - 12);
                      const lines = seg.label.split(' ');
                      return (
                        <g key={`label-${i}`}>
                          {lines.map((line, lineIdx) => (
                            <text
                              key={lineIdx}
                              x={labelPos.x}
                              y={labelPos.y - 1 + lineIdx * 9}
                              fontSize={8}
                              fill="#fff"
                              textAnchor="middle"
                              fontWeight={isActive ? 900 : 700}
                              letterSpacing={0.3}
                              opacity={isActive ? 1 : 0.85}
                              style={{ paintOrder: 'stroke', stroke: seg.color, strokeWidth: 2.5 }}
                            >
                              {line}
                            </text>
                          ))}
                        </g>
                      );
                    }

                    // FEAR / NEUTRAL / GREED:沿弧弯曲
                    const isNeutral = seg.label === 'NEUTRAL';
                    return (
                      <text
                        key={`label-${i}`}
                        fontSize={isNeutral ? 7 : 9}
                        fill="#fff"
                        fontWeight={isActive ? 900 : 700}
                        letterSpacing={isNeutral ? 0 : 0.3}
                        opacity={isActive ? 1 : 0.85}
                        style={{ paintOrder: 'stroke', stroke: seg.color, strokeWidth: 2.5 }}
                      >
                        <textPath href={`#fgi-label-path-${i}`} startOffset="50%" textAnchor="middle">
                          {seg.label}
                        </textPath>
                      </text>
                    );
                  })}

                  {/* 刻度数字(放在弧的外侧) */}
                  {[0, 25, 50, 75, 100].map(v => {
                    const a = valueToAngle(v);
                    const pos = polar(a, R + 22);
                    return (
                      <text key={v} x={pos.x} y={pos.y + 4} fontSize={11} fill="#475569" textAnchor="middle" fontWeight="bold">
                        {v}
                      </text>
                    );
                  })}
                  {/* 指针 */}
                  <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
                  <circle cx={cx} cy={cy} r={9} fill="#0f172a" />
                  {/* 中心数字 */}
                  <text x={cx} y={cy + 38} fontSize={32} fill="#0f172a" textAnchor="middle" fontWeight="900">{Math.round(displayFgi)}</text>
                </svg>
              </div>

              {/* 操作建议 */}
              <div className="bg-white/40 rounded-lg px-3 py-2 text-sm font-bold mb-3">
                {cur.action}
              </div>

              {/* 历史对比 */}
              {(fgiPrev !== null || fgiWeek !== null || fgiMonth !== null || fgiYear !== null) && (
                <div className="bg-white/40 rounded-lg px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider font-bold opacity-60 mb-1">历史对比</div>
                  <div className="divide-y divide-slate-200/40">
                    {renderHistorical(fgiPrev, '前一交易日')}
                    {renderHistorical(fgiWeek, '1 周前')}
                    {renderHistorical(fgiMonth, '1 月前')}
                    {renderHistorical(fgiYear, '1 年前')}
                  </div>
                </div>
              )}

              <div className="text-[10px] opacity-60 mt-2 text-center">
                数据来源:CNN Business · <a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener noreferrer" className="underline">查官方↗</a>
              </div>
            </div>
          );
        })()}

        {/* 关注股票 - 1 列大卡片 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            我的关注
            <span className="text-xs text-slate-500 font-normal ml-auto">{watchlist.length} 只</span>
          </h2>

          {/* 添加股票表单(只在打开时显示) */}
          {showAddStock && (
            <div className="mb-3 p-4 bg-blue-50 border-2 border-blue-300 rounded-xl">
              <div className="font-bold text-sm mb-2 text-blue-900">+ 添加新股票</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">代码 *</label>
                  <input
                    type="text"
                    placeholder="如 AAPL"
                    value={newStock.symbol}
                    onChange={(e) => setNewStock({ ...newStock, symbol: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">中文名</label>
                  <input
                    type="text"
                    placeholder="如 苹果"
                    value={newStock.name}
                    onChange={(e) => setNewStock({ ...newStock, name: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">现价 *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newStock.price}
                    onChange={(e) => setNewStock({ ...newStock, price: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-blue-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">最高价</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="留空=用现价"
                    value={newStock.high}
                    onChange={(e) => setNewStock({ ...newStock, high: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-orange-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">成本(可选)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStock.cost}
                    onChange={(e) => setNewStock({ ...newStock, cost: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-0.5">股数(可选)</label>
                  <input
                    type="number"
                    value={newStock.shares}
                    onChange={(e) => setNewStock({ ...newStock, shares: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addStock} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold active:scale-95">
                  确认添加
                </button>
                <button onClick={() => { setShowAddStock(false); setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' }); }} className="flex-1 py-2 bg-slate-300 text-slate-700 rounded-lg text-sm font-bold active:scale-95">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 空状态引导 - 新用户友好 */}
          {watchlist.length === 0 && !showAddStock && (
            <div className="text-center py-12 px-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-dashed border-blue-200">
              <div className="text-5xl mb-3">📊</div>
              <div className="text-slate-700 font-bold mb-1.5">还没有关注的股票</div>
              <div className="text-xs text-slate-500 mb-4 leading-relaxed">
                添加你关注的美股,实时跟踪价格、回撤<br/>
                所有数据自动云同步,多设备共享
              </div>
              <button
                onClick={() => setShowAddStock(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" strokeWidth={3}/>
                添加你的第一只股票
              </button>
            </div>
          )}

          {/* 心电图行(单列, 入侵式占满全屏 v10.7.9.1) */}
          <div className="space-y-1.5 -mx-4">
            {watchlistAlerts.map(s => {
              const pnl = s.cost > 0 ? (s.price - s.cost) / s.cost : 0;
              const marketValue = s.shares * s.price;
              const isEditing = editingStock === s.symbol;
              const hasAlert = !!s.alert;
              const isExtreme = hasAlert && s.alert.level >= 7;

              // 当日涨跌色(红涨绿跌)
              const dayChange = s.changePercent || 0;
              const isUp = dayChange >= 0;
              const dayColor = isUp ? '#dc2626' : '#16a34a';
              const dayBg = isUp ? 'rgba(220, 38, 38, 0.06)' : 'rgba(22, 163, 74, 0.06)';

              // 走势线
              const series = (s.intraday || []).filter(v => v != null && !isNaN(v));
              let pathD = '';
              let fillD = '';
              if (series.length > 1) {
                const min = Math.min(...series, s.previousClose || series[0]);
                const max = Math.max(...series, s.previousClose || series[0]);
                const range = max - min || 1;
                const W = 100, H = 28;
                const points = series.map((v, i) => {
                  const x = (i / (series.length - 1)) * W;
                  const y = H - ((v - min) / range) * H;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                pathD = `M ${points.join(' L ')}`;
                fillD = `${pathD} L ${W},${H} L 0,${H} Z`;
              }

              if (isEditing) {
                // 编辑模式 - 展开成大卡 (有 mx-4 抵消列表 -mx-4)
                return (
                  <div key={s.symbol} className="rounded-xl border-2 border-blue-500 bg-blue-50 p-3 space-y-2 mx-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{s.symbol} <span className="text-xs text-slate-500 font-normal">{s.name}</span></span>
                      <button
                        onClick={() => setEditingStock(null)}
                        className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold active:scale-95"
                      >
                        完成
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">现价</label>
                        <input type="number" step="0.01" value={s.price} onChange={(e) => updateStockPrice(s.symbol, 'price', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-blue-700" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">52周高</label>
                        <input type="number" step="0.01" value={s.high} onChange={(e) => updateStockPrice(s.symbol, 'high', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-orange-700" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">成本</label>
                        <input type="number" step="0.01" value={s.cost} onChange={(e) => updateStockPrice(s.symbol, 'cost', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">股数</label>
                        <input type="number" value={s.shares} onChange={(e) => updateStockPrice(s.symbol, 'shares', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
                      </div>
                    </div>
                    <button
                      onClick={() => removeStock(s.symbol)}
                      className="w-full py-2 rounded-lg bg-red-50 text-red-600 text-xs font-bold border border-red-200 active:scale-95"
                    >
                      🗑 删除该股票
                    </button>
                  </div>
                );
              }

              // 心电图行 - 入侵式占满全屏 (v10.7.9.3: 删 X, 单线分隔)
              return (
                <div
                  key={s.symbol}
                  className="border-b border-slate-200 bg-white active:bg-slate-50 transition relative overflow-hidden"
                >
                  <button
                    onClick={() => setEditingStock(s.symbol)}
                    className="w-full text-left p-4 block transition-colors duration-300"
                    style={{
                      background: priceFlash[s.symbol] === 'up' ? 'rgba(225, 29, 72, 0.08)' :
                                  priceFlash[s.symbol] === 'down' ? 'rgba(16, 185, 129, 0.08)' :
                                  'transparent',
                    }}
                  >
                    {/* 上: 三列 - 代码+名称 | 走势图 | 价格+涨跌 (v10.7.9.41) */}
                    <div className="grid gap-3 mb-2 items-center" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                      {/* 左: 代码 + 名称 (v10.7.9.40 fix29: 点击复用财报日数据) */}
                      <div
                        className="min-w-0 cursor-pointer active:opacity-60 transition"
                        style={{ minWidth: '64px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // 优先用 calendarEvents 里的财报事件 (跟"重要日历"完全一致)
                          const earningsEvent = (calendarEvents || []).find(
                            ev => ev.type === 'earnings' && ev.symbol === s.symbol
                          );
                          if (earningsEvent) {
                            setSelectedEvent(earningsEvent);
                          } else {
                            setSelectedEvent({
                              type: 'stock',
                              symbol: s.symbol,
                              name: s.name,
                              date: new Date().toISOString().slice(0, 10),
                            });
                          }
                        }}
                      >
                        <div className="font-black text-[17px] leading-tight tabular-nums text-slate-900" style={{ fontFamily: 'ui-monospace, monospace' }}>{s.symbol}</div>
                        <div className="text-[10px] truncate leading-tight mt-0.5 text-slate-400" style={{ maxWidth: '70px' }}>{s.name}</div>
                      </div>
                      {/* 中: 走势图 */}
                      <div className="h-10">
                        {series.length > 1 ? (
                          <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id={`grad-${s.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={dayColor} stopOpacity="0.22"/>
                                <stop offset="100%" stopColor={dayColor} stopOpacity="0"/>
                              </linearGradient>
                            </defs>
                            {(() => {
                              const H = 40;
                              const min = Math.min(...series, s.previousClose || series[0]);
                              const max = Math.max(...series, s.previousClose || series[0]);
                              const range = max - min || 1;
                              const W = 100;
                              const pts = series.map((v, i) => {
                                const x = (i / (series.length - 1)) * W;
                                const y = H - ((v - min) / range) * H;
                                return `${x.toFixed(1)},${y.toFixed(1)}`;
                              });
                              const p = `M ${pts.join(' L ')}`;
                              const f = `${p} L ${W},${H} L 0,${H} Z`;
                              return (
                                <>
                                  <path d={f} fill={`url(#grad-${s.symbol})`} />
                                  <path d={p} fill="none" stroke={dayColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                </>
                              );
                            })()}
                          </svg>
                        ) : (
                          <div className="h-full flex items-center justify-center text-[10px] text-slate-300">—</div>
                        )}
                      </div>
                      {/* 右: 价格 + 涨跌 */}
                      <div className="text-right" style={{ minWidth: '70px' }}>
                        <div className="text-[17px] font-bold tabular-nums leading-tight text-slate-900" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          ${fmt(s.price)}
                        </div>
                        <div
                          className="text-[12px] font-bold tabular-nums leading-tight mt-0.5"
                          style={{ fontFamily: 'ui-monospace, monospace', color: dayColor }}
                        >
                          {isUp ? '+' : ''}{dayChange.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* 下: 2 块对称 - 持仓块 / 52周高块 */}
                    <div className="grid grid-cols-2 gap-2 pt-2.5">
                      {/* 左: 持仓块 (灰底) */}
                      <div className="rounded-lg p-2.5" style={{ background: '#f8fafc' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">持仓</span>
                          {s.cost > 0 && (
                            <span className={`text-[10px] font-black tabular-nums ${pnl >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {pnl >= 0 ? '+' : ''}{(pnl * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] font-bold text-slate-700 tabular-nums leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {s.shares > 0 ? `${s.shares} 股` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          成本 {s.cost > 0 ? `$${s.cost.toFixed(2)}` : '—'}
                        </div>
                      </div>

                      {/* 右: 52周高块 (有预警时浅红, 无时灰底) */}
                      <div
                        className="rounded-lg p-2.5"
                        style={{
                          background: hasAlert ? '#fef2f2' : '#f8fafc',
                          border: hasAlert ? '1px solid #fecaca' : 'none',
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">52周高</span>
                          {hasAlert && (
                            <span
                              className="text-[10px] font-black px-1.5 py-0.5 rounded"
                              style={{
                                background: s.alert.level >= 7 ? '#7f1d1d' : s.alert.level >= 5 ? '#dc2626' : s.alert.level >= 3 ? '#f97316' : '#fbbf24',
                                color: '#fff',
                              }}
                            >
                              L{s.alert.level}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] font-bold text-slate-700 tabular-nums leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {s.high > 0 ? `$${s.high >= 1000 ? s.high.toFixed(0) : s.high.toFixed(2)}` : '—'}
                        </div>
                        <div
                          className="text-[10px] tabular-nums mt-0.5 font-bold"
                          style={{
                            fontFamily: 'ui-monospace, monospace',
                            color: s.high > 0 && s.drawdown < 0 ? '#dc2626' : '#94a3b8',
                          }}
                        >
                          {s.high > 0 ? (s.drawdown < 0 ? `▾ ${(s.drawdown * 100).toFixed(1)}%` : '─ 0.0%') : '—'}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}

            {/* 添加股票按钮(整行, 给左右补 padding) */}
            {!showAddStock && (
              <button
                onClick={() => setShowAddStock(true)}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition active:scale-98 font-bold text-sm flex items-center justify-center gap-1"
                style={{ marginLeft: '1rem', marginRight: '1rem', width: 'calc(100% - 2rem)', marginTop: '8px' }}
              >
                <Plus className="w-4 h-4" /> 添加股票
              </button>
            )}
          </div>

          {/* 持仓汇总 */}
          {(() => {
            const totalMV = watchlist.reduce((sum, s) => sum + s.shares * s.price, 0);
            const totalCost = watchlist.reduce((sum, s) => sum + s.shares * s.cost, 0);
            const totalGain = totalMV - totalCost;
            const totalGainPct = totalCost > 0 ? totalGain / totalCost : 0;
            if (totalMV === 0) return null;
            return (
              <div className="mt-3 p-3 bg-gradient-to-br from-slate-100 to-blue-50 rounded-xl">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-slate-600">总市值</div>
                    <div className="font-bold text-sm">${fmt(totalMV, 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-600">总成本</div>
                    <div className="font-bold text-sm">${fmt(totalCost, 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-600">总盈亏</div>
                    <div className={`font-bold text-sm ${totalGain >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {totalGain >= 0 ? '+' : ''}{(totalGainPct * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 预警等级速查表 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3">🚨 预警等级速查</h2>
          <div className="space-y-1.5">
            {ALERT_LEVELS.map(a => (
              <div key={a.level} className={`rounded-lg p-2.5 border ${a.color} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{a.icon}</span>
                  <span className="font-black text-xs">L{a.level}</span>
                  <span className="font-bold text-xs">{Math.abs(a.dd * 100).toFixed(0)}%</span>
                  <span className="text-xs font-bold">{a.label}</span>
                </div>
                <span className="text-[11px] font-medium opacity-90 text-right max-w-[55%]">{a.action}</span>
              </div>
            ))}
          </div>
          
          <h3 className="font-bold text-sm mt-4 mb-2">VIX 恐慌指数信号</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200">
              <span><span className="font-bold">VIX &lt; 20</span> 🟢 平静</span>
              <span className="text-slate-600">空仓等待</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-50 border border-yellow-300">
              <span><span className="font-bold">VIX 20-25</span> 🟡 警惕</span>
              <span className="text-slate-600">现金待命</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-orange-100 border border-orange-300">
              <span><span className="font-bold">VIX 25-30</span> ⚠️ 恐慌</span>
              <span className="text-slate-600">开始建仓</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-100 border border-red-300">
              <span><span className="font-bold">VIX 30-35</span> 🚨 极度恐慌</span>
              <span className="text-slate-600">重点买入</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-gradient-to-r from-red-700 to-black text-yellow-300 border border-yellow-500">
              <span><span className="font-bold">VIX ≥ 35</span> 💎 历史机会</span>
              <span>梭哈买入</span>
            </div>
          </div>
          
          <div className="mt-3 p-2 bg-blue-50 rounded text-[11px] text-slate-700">
            💡 <span className="font-bold">联合判断更准:</span>当股票回撤 ≥L5 + VIX ≥30,通常是真正底部信号(如 2020 年 3 月、2022 年 10 月、2025 年 4 月)。
          </div>
        </div>

        {/* 历史参考 */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow">
          <h2 className="font-bold text-lg mb-3">📊 历史回撤参考</h2>
          <div className="space-y-2 text-sm">
            {[
              { event: '2018 Q4 加息恐慌', dd: '-23%', tqqq: '-55%', batches: '满3档' },
              { event: '2020 新冠崩盘', dd: '-28%', tqqq: '-70%', batches: '满3档' },
              { event: '2022 加息熊市', dd: '-35%', tqqq: '-82%', batches: '满3档(持续14个月)' },
              { event: '2023 银行业危机', dd: '-9%', tqqq: '-23%', batches: '0档(未触发)' },
              { event: '2024 日元套利', dd: '-13%', tqqq: '-35%', batches: '1档' },
              { event: '2025 关税恐慌', dd: '-26%', tqqq: '-65%', batches: '满3档(你抓住了)' },
            ].map((h, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <div className="font-medium text-sm">{h.event}</div>
                  <div className="text-xs text-slate-500">{h.batches}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">QQQ {h.dd}</div>
                  <div className="text-xs text-purple-600">TQQQ {h.tqqq}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-slate-700">
            <strong>关键观察:</strong>过去 8 年满 3 档机会约 4 次,平均 2 年一次。耐心等待是这个策略的核心。
          </div>
        </div>


    </>
  );
}
