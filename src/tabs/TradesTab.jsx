import React from 'react';

export default function TradesTab({ ctx }) {
  const {
    addTrade,
    AlertCircle,
    calcCostBasis,
    calmRoomActiveCount,
    calmRoomAvgActiveDays,
    calmRoomCompletedCount,
    CheckCircle2,
    costBasisActiveSymbol,
    costBasisData,
    db,
    editingNoteId,
    expandedTrades,
    expandedWaves,
    fmt,
    lookupStatus,
    newTrade,
    Plus,
    RefreshCw,
    setAllTradesModal,
    setCostBasisActiveSymbol,
    setCostBasisData,
    setCostBasisNewSymbol,
    setCostBasisNewTrade,
    setEditingNoteId,
    setExpandedTrades,
    setExpandedWaves,
    setLookupStatus,
    setNewTrade,
    setShowAddTrade,
    setShowCostBasisAdd,
    setShowCostBasisTrade,
    setTradeDeleteConfirmId,
    setWaveNotes,
    showAddTrade,
    showConfirm,
    trades,
    usdRate,
    watchlist,
    waveNotes,
    wavesByStock,
  } = ctx;

  return (
    <>


        {/* 波段记录(取代原来的"冷静室"+"日记本") */}
        {wavesByStock.length > 0 && (
          <>
            {/* 顶部总览 - 白卡极简 (v10.7.9.41) */}
            <div
              className="rounded-2xl p-4 mb-3 relative overflow-hidden bg-white shadow-sm"
              style={{
                border: '1px solid #e2e8f0',
              }}
            >
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📓</span>
                  <h2
                    className="font-black text-sm"
                    style={{
                      letterSpacing: '1px',
                      color: '#0f172a',
                    }}
                  >
                    波段记录
                  </h2>
                </div>
                <div className="text-[10px] italic" style={{ color: '#94a3b8' }}>点波段看明细</div>
              </div>

              <div className="grid grid-cols-3 gap-2 relative z-10">
                <div
                  className="rounded-xl py-2.5 text-center"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div className="text-xl font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#dc2626' }}>{calmRoomActiveCount}</div>
                  <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: '#94a3b8' }}>进行中</div>
                </div>
                <div
                  className="rounded-xl py-2.5 text-center"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div className="text-xl font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{calmRoomCompletedCount}</div>
                  <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: '#94a3b8' }}>已完成</div>
                </div>
                <div
                  className="rounded-xl py-2.5 text-center"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div className="text-xl font-black tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{calmRoomAvgActiveDays}<span className="text-xs font-bold ml-0.5" style={{ color: '#94a3b8' }}>天</span></div>
                  <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: '#94a3b8' }}>均持有</div>
                </div>
              </div>
            </div>

            {/* 按股票分组的复盘卡 */}
            {wavesByStock.map(group => {
              const completedWaves = group.waves.filter(w => !w.isActive);
              const activeWave = group.waves.find(w => w.isActive);
              return (
              <div key={group.symbol} className="bg-white rounded-2xl mb-3 shadow overflow-hidden">
                {/* ============ 头部: 灰白 + 3 列统计 ============ */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNewTrade({
                          ...newTrade,
                          symbol: group.symbol,
                          name: group.name,
                          side: 'buy',
                          date: new Date().toISOString().split('T')[0],
                          price: '',
                          shares: '',
                        });
                        setLookupStatus('found');
                        setShowAddTrade(true);
                      }}
                      className="flex items-center gap-2 text-left active:opacity-70 transition"
                      title={`点击快速添加 ${group.symbol} 交易`}
                    >
                      <div>
                        <div className="font-black text-[18px] text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{group.symbol}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{group.name}</div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAllTradesModal({ symbol: group.symbol, name: group.name });
                        }}
                        className="text-[11px] text-rose-600 font-bold flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 active:scale-95 transition"
                        title="查看所有交易记录"
                      >
                        📋 全部
                      </button>
                      <div className="text-[11px] text-slate-400">
                        {group.waves.length} 个波段
                      </div>
                    </div>
                  </div>
                  {/* 3 列统计 */}
                  {(() => {
                    const totalGain = group.waves.reduce((sum, w) => sum + (w.gainAmount || 0), 0);
                    const completedCount = completedWaves.length;
                    const winCount = completedWaves.filter(w => w.gainPct > 0).length;
                    const winRate = completedCount > 0 ? Math.round(winCount / completedCount * 100) : 0;
                    const avgHeld = group.avgHeldDays || 0;
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className={`font-black text-[15px] tabular-nums ${totalGain >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {totalGain >= 0 ? '+' : ''}${fmt(Math.abs(totalGain), 0)}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">总盈亏</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="font-black text-[15px] text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {completedCount > 0 ? `${winRate}%` : '—'}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">胜率 {completedCount > 0 ? `${winCount}/${completedCount}` : ''}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="font-black text-[15px] text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {avgHeld > 0 ? `${avgHeld}天` : '—'}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">均持有</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ============ 进行中独立大卡 (如果有) ============ */}
                {activeWave && (() => {
                  const w = activeWave;
                  const noteValue = waveNotes[w.id] || '';
                  const isEditingNote = editingNoteId === w.id;
                  const isExpanded = expandedWaves[w.id] || false;
                  const startD = (w.startDate || '').slice(5);
                  const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
                  return (
                    <div
                      className="m-3 rounded-xl relative"
                      style={{
                        background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)',
                        border: '2px solid #fecaca',
                      }}
                    >
                      {/* 悬挂角标 "进行中 #N" */}
                      <div
                        className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider text-white flex items-center gap-1.5"
                        style={{ background: '#e11d48' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        进行中 · #{w.index}
                      </div>

                      {/* 主行 */}
                      <button
                        onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                        className="w-full p-4 pt-5 text-left"
                      >
                        <div className="flex items-baseline justify-between mb-3">
                          <div className="text-[12px] text-slate-500 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {startD} 开始 · 第 {w.heldDays} 天
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className={`font-black text-[24px] tabular-nums ${w.gainPct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {w.gainPct >= 0 ? '+' : ''}{(w.gainPct * 100).toFixed(1)}%
                            </span>
                            <span className={`text-slate-400 text-xs transition ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                          </div>
                        </div>

                        {/* 4 列详情: 买入均 / 现价 / 持有 / 浮盈 (v10.7.9.41) */}
                        <div className="flex gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.7)' }}>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">买入均</div>
                            <div className="font-black text-slate-900 tabular-nums text-[13px]" style={{ fontFamily: 'ui-monospace, monospace' }}>${w.avgBuyPrice.toFixed(2)}</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">现价</div>
                            <div
                              className={`font-black tabular-nums text-[13px] ${w.currentPrice > w.avgBuyPrice ? 'text-rose-600' : w.currentPrice < w.avgBuyPrice ? 'text-emerald-600' : 'text-slate-900'}`}
                              style={{ fontFamily: 'ui-monospace, monospace' }}
                            >
                              {w.currentPrice > 0 ? `$${w.currentPrice.toFixed(2)}` : '—'}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">持有</div>
                            <div className="font-black text-slate-900 tabular-nums text-[13px]" style={{ fontFamily: 'ui-monospace, monospace' }}>{w.heldShares} 股</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">浮盈</div>
                            <div className={`font-black tabular-nums text-[13px] ${w.gainAmount >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                              {w.gainAmount >= 0 ? '+' : ''}${fmt(Math.abs(w.gainAmount), 0)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* 备注 */}
                      <div className="px-4 pb-2">
                        {isEditingNote ? (
                          <input
                            type="text"
                            autoFocus
                            defaultValue={noteValue}
                            placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                            className="w-full px-2 py-1 border border-rose-300 rounded text-[12px]"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newVal = e.target.value;
                                setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                setEditingNoteId(null);
                              } else if (e.key === 'Escape') {
                                setEditingNoteId(null);
                              }
                            }}
                            onBlur={(e) => {
                              const newVal = e.target.value;
                              setWaveNotes({ ...waveNotes, [w.id]: newVal });
                              db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                              setEditingNoteId(null);
                            }}
                          />
                        ) : noteValue ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                            className="text-[12px] text-slate-600 italic px-1 py-0.5 rounded hover:bg-rose-50 active:scale-98 transition w-fit max-w-full text-left"
                          >
                            💬 {noteValue}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                            className="text-[11px] text-rose-500 hover:text-rose-700 active:scale-95 transition"
                          >
                            + 加备注
                          </button>
                        )}
                      </div>

                      {/* 展开:交易明细 */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 border-t border-rose-100">
                          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2 mt-2">📋 交易明细</div>
                          <div className="space-y-2">
                            {waveTrades.map(t => {
                              const isBuy = !t.side || t.side === 'buy';
                              const amount = t.shares * t.price;
                              return (
                                <div key={t.id} className="flex items-center justify-between py-2 px-2.5 bg-white rounded-lg border border-slate-100">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-black text-white shrink-0 ${isBuy ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                      {isBuy ? '买' : '卖'}
                                    </span>
                                    <span className="text-[13px] text-slate-500 tabular-nums shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {(t.date || '').slice(5)}
                                    </span>
                                    <span className="text-[13px] text-slate-700 tabular-nums truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {t.shares}股 @${fmt(t.price)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[13px] font-bold tabular-nums ${isBuy ? 'text-slate-900' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                      {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                      className="w-5 h-5 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-[10px] font-bold transition active:scale-90"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ============ 已完成列表 (紧凑) ============ */}
                {completedWaves.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      已完成 ({completedWaves.length})
                    </div>
                    <div className="divide-y divide-slate-50">
                      {completedWaves.map(w => {
                        const noteValue = waveNotes[w.id] || '';
                        const isEditingNote = editingNoteId === w.id;
                        const isExpanded = expandedWaves[w.id] || false;
                        const startD = (w.startDate || '').slice(5);
                        const endD = (w.endDate || '').slice(5);
                        const waveTrades = [...(w.buys || []), ...(w.sells || [])]
                          .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
                        return (
                          <div key={w.id}>
                            <button
                              onClick={() => setExpandedWaves({ ...expandedWaves, [w.id]: !isExpanded })}
                              className="w-full px-4 py-2.5 text-left active:bg-slate-50 transition grid grid-cols-[28px_1fr_auto] items-center gap-2.5"
                            >
                              {/* 编号 */}
                              <span className="text-slate-300 font-bold text-[14px] tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                #{w.index}
                              </span>
                              {/* 信息 */}
                              <div>
                                <div className="text-[13px] text-slate-900 font-bold tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {startD} → {endD}
                                  <span className="text-[11px] text-slate-400 font-normal ml-1.5">· {w.heldDays}天</span>
                                </div>
                                <div className="text-[11px] text-slate-500 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ${w.avgBuyPrice.toFixed(2)} → ${w.avgSellPrice.toFixed(2)}
                                </div>
                              </div>
                              {/* 收益 */}
                              <div className="text-right">
                                <div className={`font-black text-[15px] tabular-nums ${w.gainPct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {w.gainPct >= 0 ? '+' : ''}{(w.gainPct * 100).toFixed(1)}%
                                </div>
                                <div className={`text-[11px] tabular-nums ${w.gainAmount >= 0 ? 'text-slate-500' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  {w.gainAmount >= 0 ? '+' : ''}${fmt(Math.abs(w.gainAmount), 0)}
                                </div>
                              </div>
                            </button>

                            {/* 备注 */}
                            {(noteValue || isEditingNote) && (
                              <div className="px-4 pb-2 -mt-1">
                                {isEditingNote ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    defaultValue={noteValue}
                                    placeholder="如:关税恐慌、新冠崩盘、AI 浪潮…"
                                    className="w-full px-2 py-1 border border-blue-300 rounded text-[11px]"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const newVal = e.target.value;
                                        setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                        db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                        setEditingNoteId(null);
                                      } else if (e.key === 'Escape') setEditingNoteId(null);
                                    }}
                                    onBlur={(e) => {
                                      const newVal = e.target.value;
                                      setWaveNotes({ ...waveNotes, [w.id]: newVal });
                                      db.upsertWaveNote(w.id, newVal).catch(err => console.error('备注保存失败:', err));
                                      setEditingNoteId(null);
                                    }}
                                  />
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                    className="text-[11px] text-slate-500 italic px-1 py-0.5 rounded hover:bg-slate-100 active:scale-98 transition w-fit max-w-full text-left"
                                  >
                                    💬 {noteValue}
                                  </button>
                                )}
                              </div>
                            )}
                            {!noteValue && !isEditingNote && (
                              <div className="px-4 pb-2 -mt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingNoteId(w.id); }}
                                  className="text-[10px] text-slate-300 hover:text-blue-500 active:scale-95 transition"
                                >
                                  + 加备注
                                </button>
                              </div>
                            )}

                            {/* 展开明细 */}
                            {isExpanded && (
                              <div className="px-4 pb-3 pt-1 bg-slate-50/50 border-t border-slate-100">
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2 mt-2">📋 交易明细</div>
                                <div className="space-y-2">
                                  {waveTrades.map(t => {
                                    const isBuy = !t.side || t.side === 'buy';
                                    const amount = t.shares * t.price;
                                    return (
                                      <div key={t.id} className="flex items-center justify-between py-2 px-2.5 bg-white rounded-lg border border-slate-100">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-black text-white shrink-0 ${isBuy ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                            {isBuy ? '买' : '卖'}
                                          </span>
                                          <span className="text-[13px] text-slate-500 tabular-nums shrink-0" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                            {(t.date || '').slice(5)}
                                          </span>
                                          <span className="text-[13px] text-slate-700 tabular-nums truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                                            {t.shares}股 @${fmt(t.price)}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className={`text-[13px] font-bold tabular-nums ${isBuy ? 'text-slate-900' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                            {isBuy ? '-' : '+'}${fmt(amount, 0)}
                                          </span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setTradeDeleteConfirmId(t.id); }}
                                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center text-[10px] font-bold transition active:scale-90"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              );
            })}

          </>
        )}

        {/* 添加成交按钮 */}
        <button
          onClick={() => setShowAddTrade(!showAddTrade)}
          className="w-full mb-3 py-3 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition"
          style={{
            background: '#fff',
            color: '#d97706',
            border: '2px solid #fbbf24',
          }}
        >
          <Plus className="w-5 h-5" strokeWidth={3} /> 添加交易
        </button>

        {/* 添加成交表单 - Modal 弹窗 */}
        {showAddTrade && (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAddTrade(false); }}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div
              className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* 顶部把手 + 标题 */}
              <div className="sticky top-0 bg-white pt-3 pb-2 px-4 border-b border-slate-100 z-10">
                <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-2 sm:hidden" />
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-900">添加交易</h2>
                  <button
                    onClick={() => setShowAddTrade(false)}
                    className="text-slate-400 hover:text-slate-600 active:scale-90 transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* 买/卖切换 */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'buy' })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition active:scale-95 ${newTrade.side === 'buy' ? 'bg-red-600 text-white shadow' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                  >
                    买入
                  </button>
                  <button
                    onClick={() => setNewTrade({ ...newTrade, side: 'sell' })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition active:scale-95 ${newTrade.side === 'sell' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                  >
                    卖出
                  </button>
                </div>

                {/* 股票代码 + 名称 */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1.5">
                      <span>股票代码</span>
                      {lookupStatus === 'loading' && (
                        <span className="text-blue-600 inline-flex items-center gap-0.5">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>查询中</span>
                        </span>
                      )}
                      {lookupStatus === 'found' && (
                        <span className="text-emerald-600 inline-flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>已找到</span>
                        </span>
                      )}
                      {lookupStatus === 'notfound' && (
                        <span className="text-amber-600 inline-flex items-center gap-0.5">
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>未找到,可手动填</span>
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="如 NVDA"
                      value={newTrade.symbol}
                      onChange={(e) => {
                        const sym = e.target.value.toUpperCase();
                        setNewTrade({
                          ...newTrade,
                          symbol: sym,
                          name: '',
                          price: '',
                        });
                      }}
                      className={`w-full px-2 py-2 border rounded-lg text-sm font-bold uppercase ${
                        lookupStatus === 'found' ? 'border-emerald-400' :
                        lookupStatus === 'notfound' ? 'border-amber-400' :
                        'border-slate-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">中文名(自动)</label>
                    <input
                      type="text"
                      placeholder="自动填充"
                      value={newTrade.name}
                      onChange={(e) => setNewTrade({ ...newTrade, name: e.target.value })}
                      className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50"
                    />
                  </div>
                </div>

                {/* 日期(独占一行) */}
                <div className="mb-2">
                  <label className="text-[10px] text-slate-500 block mb-1">日期</label>
                  <input
                    type="date"
                    value={newTrade.date}
                    onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                    className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                {/* 价格 + 股数(共一行) */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">价格 ($, 自动)</label>
                    <input
                      type="number"
                      placeholder="自动填充"
                      step="0.01"
                      inputMode="decimal"
                      value={newTrade.price}
                      onChange={(e) => setNewTrade({ ...newTrade, price: e.target.value })}
                      className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm tabular-nums bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">股数</label>
                    <input
                      type="number"
                      placeholder="0"
                      inputMode="numeric"
                      value={newTrade.shares}
                      onChange={(e) => setNewTrade({ ...newTrade, shares: e.target.value })}
                      className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={addTrade} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-black active:scale-95 shadow">确认添加</button>
                  <button onClick={() => setShowAddTrade(false)} className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold active:scale-95">取消</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 空状态(没有任何交易) */}
        {trades.length === 0 && !showAddTrade && (
          <div className="bg-white rounded-2xl p-8 mb-4 shadow text-center">
            <div className="text-5xl mb-3">📔</div>
            <h3 className="font-bold text-lg text-slate-700 mb-1">还没有交易记录</h3>
            <p className="text-sm text-slate-500">点上面「添加交易」开始记录你的高抛低吸</p>
          </div>
        )}

        {/* ============ 💼 摊薄成本计算器 (v10.7.9.41, iOS 风格) ============ */}
        {(() => {
          const allSymbols = Object.keys(costBasisData);
          const activeSymbol = costBasisActiveSymbol && costBasisData[costBasisActiveSymbol]
            ? costBasisActiveSymbol
            : (allSymbols[0] || '');
          const trades = activeSymbol ? (costBasisData[activeSymbol] || []) : [];
          const stats = calcCostBasis(trades);

          return (
            <div className="mt-6 mb-4">
              {/* 头部 */}
              <div className="px-1 mb-3">
                <h2 className="font-black text-[20px] text-slate-900 mb-0.5">💼 摊薄成本</h2>
                <div className="text-[11px] text-slate-400">
                  {allSymbols.length > 0 ? `${allSymbols.length} 只股 · 云端存储` : '云端小工具 · 不影响其他模块'}
                </div>
              </div>

              {/* 顶部 Tab 切换 */}
              <div className="flex gap-2 px-1 pb-3 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                {allSymbols.map(sym => (
                  <button
                    key={sym}
                    onClick={() => setCostBasisActiveSymbol(sym)}
                    className="flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-black transition active:scale-95"
                    style={{
                      background: activeSymbol === sym ? '#0f172a' : 'white',
                      color: activeSymbol === sym ? 'white' : '#475569',
                      fontFamily: 'ui-monospace, monospace',
                      boxShadow: activeSymbol === sym ? '0 4px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    {sym}
                  </button>
                ))}
                <button
                  onClick={() => { setCostBasisNewSymbol(''); setShowCostBasisAdd(true); }}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-black transition active:scale-95"
                  style={{
                    background: 'white',
                    color: '#0f172a',
                    border: '1px dashed #cbd5e1',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  + 新增
                </button>
              </div>

              {/* 内容 */}
              {!activeSymbol ? (
                // 空状态
                <div className="bg-white rounded-2xl p-8 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div className="text-5xl mb-3">💼</div>
                  <div className="text-sm text-slate-700 font-bold mb-1">还没有股票</div>
                  <div className="text-xs text-slate-500">点上方"+ 新增" 添加第一只股票</div>
                </div>
              ) : (
                <>
                  {/* 大数字卡 - 摊薄成本 (会计 + 实际 两个) */}
                  <div
                    className="rounded-2xl p-5 mb-3"
                    style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    {/* 顶部 持仓 */}
                    <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <div className="text-[12px] text-slate-500 font-bold">持仓</div>
                      <div className="font-black tabular-nums text-emerald-600 text-[15px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {stats.shares} 股
                      </div>
                    </div>
                    {/* 两种成本对比 (v10.7.9.41: V2 替换 sub 字, 显示涨幅%) */}
                    {(() => {
                      // 从关注列表拿现价
                      const watchStock = watchlist.find(w => w.symbol === activeSymbol);
                      const currentPrice = watchStock?.price || 0;
                      const hasPrice = currentPrice > 0 && stats.effectiveCost > 0;
                      const gainPct = hasPrice ? ((currentPrice - stats.effectiveCost) / stats.effectiveCost) * 100 : 0;
                      const isUp = gainPct >= 0;

                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">会计摊薄</div>
                            <div className="font-black tabular-nums leading-tight mt-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '22px', color: '#0f172a' }}>
                              ${stats.avgCost.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">移动加权平均</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#d97706' }}>实际成本</div>
                            <div className="font-black tabular-nums leading-tight mt-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '22px', color: '#d97706' }}>
                              ${stats.effectiveCost.toFixed(2)}
                            </div>
                            {/* v10.7.9.41: 涨幅% + 现价 一行紧凑 (11px 长股价也能装下) */}
                            {hasPrice ? (
                              <div className="mt-0.5" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                <span className={isUp ? 'text-rose-600' : 'text-emerald-600'}>
                                  {isUp ? '↑ +' : '↓ '}{gainPct.toFixed(2)}%
                                </span>
                                <span style={{ color: '#94a3b8', fontWeight: 600, marginLeft: '4px' }}>
                                  · 现价 ${currentPrice.toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 mt-0.5">扣除已实现盈亏</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2 列小卡 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">累计投入</div>
                      <div className="font-black tabular-nums text-slate-900 mt-1 text-[18px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        ${stats.totalCost.toFixed(0)}
                      </div>
                      {/* v10.7.9.41: CNY 副显示 */}
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                        ≈ ¥{(stats.totalCost * usdRate / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万
                      </div>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">已实现盈亏</div>
                      <div className={`font-black tabular-nums mt-1 text-[18px] ${stats.realizedPnl >= 0 ? 'text-rose-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {stats.realizedPnl >= 0 ? '+' : ''}${stats.realizedPnl.toFixed(0)}
                      </div>
                      {/* v10.7.9.41: CNY 副显示 */}
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                        ≈ {stats.realizedPnl >= 0 ? '+' : '-'}¥{(Math.abs(stats.realizedPnl) * usdRate / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万
                      </div>
                    </div>
                  </div>

                  {/* 交易记录列表 */}
                  <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[12px] text-slate-600 font-bold">交易记录 ({trades.length})</div>
                      <button
                        onClick={() => {
                          setCostBasisNewTrade({ type: 'buy', price: '', shares: '', date: new Date().toISOString().slice(0, 10) });
                          setShowCostBasisTrade(true);
                        }}
                        className="text-[11px] font-bold text-amber-700 active:scale-95"
                      >
                        + 添加
                      </button>
                    </div>
                    {trades.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-400">还没有交易, 点 + 添加</div>
                    ) : (
                      (() => {
                        // 计算每笔卖出"成交时"的会计摊薄成本
                        // 算法: 按时间正序遍历, 维护 totalCost / shares
                        //       遇到卖出时, 当前 avgCost 就是"卖出成本依据"
                        const sortedAsc = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                        const tradeAvgAtSell = {};  // {tradeId: avgCost}
                        let runShares = 0;
                        let runTotalCost = 0;
                        for (const t of sortedAsc) {
                          const p = parseFloat(t.price) || 0;
                          const s = parseFloat(t.shares) || 0;
                          if (t.type === 'buy') {
                            runShares += s;
                            runTotalCost += s * p;
                          } else {
                            if (runShares > 0) {
                              const avg = runTotalCost / runShares;
                              tradeAvgAtSell[t.id] = avg;
                              runTotalCost -= s * avg;
                              runShares -= s;
                              if (runShares <= 0) { runShares = 0; runTotalCost = 0; }
                            }
                          }
                        }

                        return [...trades]
                          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                          .map(t => {
                            const isExpanded = !!expandedTrades[t.id];
                            const isSell = t.type === 'sell';
                            const price = parseFloat(t.price);
                            const shares = parseFloat(t.shares);
                            const amount = price * shares;
                            const sellAvg = isSell ? (tradeAvgAtSell[t.id] || 0) : 0;
                            const sellCost = isSell ? sellAvg * shares : 0;
                            const profit = isSell ? (amount - sellCost) : 0;
                            const profitPct = (isSell && sellCost > 0) ? (profit / sellCost) * 100 : 0;

                            return (
                              <div key={t.id} className="border-b border-slate-100 last:border-b-0">
                                {/* 主行 */}
                                <div className="grid items-center py-2.5" style={{ gridTemplateColumns: '32px 1fr auto auto auto', gap: '10px' }}>
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black ${isSell ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                                  >
                                    {isSell ? '卖' : '买'}
                                  </div>
                                  <div
                                    className={`text-[13px] ${isSell ? 'cursor-pointer' : ''}`}
                                    onClick={() => isSell && setExpandedTrades(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                  >
                                    <div className="font-bold text-slate-900">{t.date} {isSell ? '卖出' : '买入'} {shares} 股</div>
                                    <div className="text-[11px] text-slate-400 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>${price.toFixed(2)}/股</div>
                                  </div>
                                  <div className={`text-right font-black tabular-nums text-[13px] ${isSell ? 'text-emerald-600' : 'text-rose-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    {isSell ? '+' : '-'}${amount.toFixed(0)}
                                  </div>
                                  {isSell ? (
                                    <button
                                      onClick={() => setExpandedTrades(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                      className="text-slate-400 text-[12px] px-1"
                                    >
                                      {isExpanded ? '▲' : '▼'}
                                    </button>
                                  ) : (
                                    <span></span>
                                  )}
                                  <button
                                    onClick={() => {
                                      showConfirm({
                                        title: '删除这笔交易?',
                                        desc: '此操作不可撤销',
                                        info: `${t.date} · ${isSell ? '卖出' : '买入'} ${shares} 股 @ $${price}`,
                                        confirmText: '删除',
                                        onConfirm: () => {
                                          setCostBasisData(prev => ({
                                            ...prev,
                                            [activeSymbol]: prev[activeSymbol].filter(x => x.id !== t.id),
                                          }));
                                          db.deleteCostBasisTrade(t.id).catch(e => {
                                            console.error('[CostBasis] 删除云端失败:', e.message);
                                          });
                                        },
                                      });
                                    }}
                                    className="text-slate-300 hover:text-rose-500 text-[14px] px-1"
                                    title="删除"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {/* 卖出详情 (展开) */}
                                {isSell && isExpanded && (
                                  <div
                                    className="px-3 py-3 mb-2 mx-9 rounded-lg"
                                    style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdf4 100%)', border: '1px solid #d1fae5' }}
                                  >
                                    <div className="text-[11px] leading-relaxed" style={{ fontFamily: 'ui-monospace, monospace', color: '#15803d' }}>
                                      <div><strong style={{ color: '#14532d' }}>卖出收入</strong> = {price.toFixed(2)} × {shares} = <strong style={{ color: '#14532d' }}>${amount.toFixed(2)}</strong></div>
                                      <div><strong style={{ color: '#14532d' }}>卖出成本</strong> = {sellAvg.toFixed(2)} × {shares} = <strong style={{ color: '#14532d' }}>${sellCost.toFixed(2)}</strong></div>
                                      <div><strong style={{ color: '#14532d' }}>本次利润</strong> = {amount.toFixed(0)} − {sellCost.toFixed(0)}</div>
                                    </div>
                                    <div className={`mt-2 pt-2 font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '15px', borderTop: '1px dashed #86efac' }}>
                                      = {profit >= 0 ? '+' : ''}${profit.toFixed(2)} ({profit >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                      })()
                    )}
                  </div>

                  {/* 删除整只股票按钮 */}
                  <button
                    onClick={() => {
                      const symToDelete = activeSymbol;
                      const count = trades.length;
                      showConfirm({
                        title: `删除 ${symToDelete}?`,
                        desc: '此操作不可撤销, 该股票的全部交易记录将从云端删除',
                        info: `${symToDelete} · ${count} 笔交易`,
                        confirmText: '全部删除',
                        onConfirm: () => {
                          setCostBasisData(prev => {
                            const next = { ...prev };
                            delete next[symToDelete];
                            return next;
                          });
                          const remaining = Object.keys(costBasisData).filter(s => s !== symToDelete);
                          setCostBasisActiveSymbol(remaining[0] || '');
                          db.deleteCostBasisSymbol(symToDelete).catch(e => {
                            console.error('[CostBasis] 删整只云端失败:', e.message);
                          });
                        },
                      });
                    }}
                    className="w-full mt-3 py-2 text-[11px] text-rose-500 font-bold active:scale-95"
                  >
                    🗑 删除 {activeSymbol} 整只股票
                  </button>
                </>
              )}
            </div>
          );
        })()}


    </>
  );
}
