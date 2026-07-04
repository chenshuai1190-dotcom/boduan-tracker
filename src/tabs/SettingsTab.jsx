import React from 'react';

export default function SettingsTab({ ctx }) {
  const {
    accounts,
    batches,
    benchmarkSymbol,
    browserWsAllowed,
    changelogExpanded,
    ChevronDown,
    ChevronUp,
    disciplines,
    exitTargets,
    fetchError,
    fetching,
    fetchRealtimePrices,
    fgi,
    fgiDataDate,
    fgiLabel,
    fgiMonth,
    fgiPrev,
    fgiWeek,
    fgiYear,
    hkdRate,
    investmentPlan,
    lastFetched,
    Loader2,
    LogOut,
    marginStatus,
    newPwd,
    onLogout,
    pwdLoading,
    pwdMsg,
    RefreshCw,
    resetAll,
    reviewLogs,
    RotateCcw,
    setChangelogExpanded,
    setNewPwd,
    setPwdLoading,
    setPwdMsg,
    setShowChangePassword,
    setWsEnabled,
    showChangePassword,
    showConfirm,
    snapshots,
    supabase,
    trades,
    usdRate,
    user,
    vix,
    vixDataDate,
    watchlist,
    waveNotes,
    WifiOff,
    wsEnabled,
    wsLastTick,
    wsStatus,
    X,
    yearlyActuals,
  } = ctx;

  return (
    <>

          <div className="space-y-4">
            {/* 🧪 实验: WebSocket 实时模式 */}
            <div
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: `
                  radial-gradient(circle at 100% 0%, rgba(34, 197, 94, 0.12) 0%, transparent 50%),
                  linear-gradient(135deg, #0a0a0a 0%, #171717 100%)
                `,
                border: '1px solid rgba(34, 197, 94, 0.2)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#4ade80' }}>
                    🧪 实时推送 <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>BETA</span>
                  </h2>
                  {(wsEnabled || !browserWsAllowed) && (
                    <span className="flex items-center gap-1.5 text-[10px] font-black">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'animate-pulse' : ''}`}
                        style={{
                          background: wsStatus === 'connected' ? '#4ade80' :
                                      wsStatus === 'connecting' ? '#fbbf24' :
                                      wsStatus === 'error' ? '#ef4444' :
                                      wsStatus === 'disabled' ? '#fbbf24' : '#64748b',
                        }}
                      />
                      <span style={{ color: '#a3a3a3' }}>
                        {wsStatus === 'connected' ? 'LIVE' :
                         wsStatus === 'connecting' ? '连接中' :
                         wsStatus === 'error' ? '错误' :
                         wsStatus === 'disabled' ? '已停用' : '未连接'}
                      </span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#a3a3a3' }}>
                  WebSocket 需要服务端中转后再启用
                  <br/>
                  当前使用已登录的 REST 行情接口
                  <br/>
                  <span style={{ color: '#fbbf24' }}>已关闭浏览器直连,避免暴露 EODHD token</span>
                </p>

                <button
                  onClick={() => {
                    if (!browserWsAllowed) return;
                    const next = !wsEnabled;
                    setWsEnabled(next);
                    try { localStorage.setItem('bottomline_ws', String(next)); } catch {}
                  }}
                  disabled={!browserWsAllowed}
                  className="w-full py-2.5 rounded-xl font-black text-sm active:scale-95 transition flex items-center justify-center gap-2"
                  style={{
                    background: !browserWsAllowed
                      ? 'rgba(255,255,255,0.05)'
                      : wsEnabled
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'rgba(255,255,255,0.08)',
                    color: !browserWsAllowed ? '#737373' : (wsEnabled ? '#fff' : '#a3a3a3'),
                    border: wsEnabled && browserWsAllowed ? '1px solid #16a34a' : '1px solid rgba(255,255,255,0.1)',
                    cursor: browserWsAllowed ? 'pointer' : 'not-allowed',
                  }}
                >
                  {!browserWsAllowed ? '等待服务端中转' : (wsEnabled ? '✓ 实时模式已开启' : '开启实时模式')}
                </button>

                {wsEnabled && wsLastTick && (
                  <div className="text-[10px] mt-2 text-center tabular-nums" style={{ color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
                    最后 tick: {wsLastTick.toLocaleTimeString('zh-CN', { hour12: false })}
                  </div>
                )}
              </div>
            </div>

            {/* 数据状态 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
                📡 数据状态
              </h2>
              {(() => {
                // 计算当前刷新状态
                const now = new Date();
                const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
                const et = new Date(etStr);
                const day = et.getDay();
                const hour = et.getHours();
                const minute = et.getMinutes();
                const time = hour + minute / 60;

                let marketStatus, freq, freqColor;
                if (day === 0 || day === 6) {
                  marketStatus = '🔴 休市 (周末)';
                  freq = '5 分钟';
                  freqColor = 'text-slate-500';
                } else if (time >= 9.5 && time < 16) {
                  marketStatus = '🟢 盘中';
                  freq = '10 秒';
                  freqColor = 'text-emerald-600';
                } else if (time >= 4 && time < 9.5) {
                  marketStatus = '🟡 盘前';
                  freq = '30 秒';
                  freqColor = 'text-amber-600';
                } else if (time >= 16 && time < 20) {
                  marketStatus = '🟡 盘后';
                  freq = '30 秒';
                  freqColor = 'text-amber-600';
                } else {
                  marketStatus = '🔴 休市 (深夜)';
                  freq = '5 分钟';
                  freqColor = 'text-slate-500';
                }

                return (
                  <>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600 text-sm">连接状态</span>
                      <span className={`text-sm font-bold tabular-nums ${fetchError ? 'text-red-600' : 'text-emerald-600'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {fetchError ? '● 异常' : '● 已连接'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <div className="text-slate-600 text-sm">
                        当前刷新频率
                        <div className="text-[10px] text-slate-400 mt-0.5">智能切换</div>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${freqColor}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {freq}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600 text-sm">市场状态</span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {marketStatus}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600 text-sm">最近更新</span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {lastFetched ? lastFetched.toLocaleTimeString('zh-CN', { hour12: false }) : '--'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-600 text-sm">数据源</span>
                      <span className="text-[11px] text-slate-500">EODHD + Yahoo</span>
                    </div>
                    <div className="text-[10px] text-slate-400 pt-2 leading-relaxed border-t border-slate-100 mt-1">
                      智能刷新策略:<br/>
                      开盘 10s · 盘前盘后 30s · 休市 5 分钟<br/>
                      页面隐藏时自动暂停
                    </div>

                    {fetchError && (
                      <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1">
                        <WifiOff className="w-3 h-3" /> {fetchError}
                      </div>
                    )}
                  </>
                );
              })()}
              <button
                onClick={fetchRealtimePrices}
                disabled={fetching}
                className="mt-3 w-full py-2.5 rounded-xl font-black flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                style={{
                  background: fetching ? '#f1f5f9' : '#fff',
                  color: fetching ? '#94a3b8' : '#d97706',
                  border: fetching ? '2px solid #cbd5e1' : '2px solid #fbbf24',
                }}
              >
                <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? '拉取中…' : '立即手动拉取'}
              </button>
              <div className="mt-2 text-[10px] text-slate-400 text-center italic">
                💡 当前使用已登录 REST 行情接口;实时推送需服务端中转后再启用
              </div>
            </div>

            {/* 📜 更新日志 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  📜 更新日志
                </h2>
                <span className="text-[11px] font-bold tabular-nums" style={{ fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>
                  v10.7.9.59
                </span>
              </div>

              {(() => {
                const changelog = [
                  {
                    ver: 'v10.7.9.59', date: '2026-07-04', latest: true,
                    items: [
                      '📒 交易页重构为主交易账本',
                      '  - 持仓分布从买入/卖出记录自动推导',
                      '  - 卖出盈利会摊薄剩余持仓实际成本',
                      '  - 波段记录和摊薄工具收进工具箱',
                    ],
                  },
                  {
                    ver: 'v10.7.9.58', date: '2026-07-04',
                    items: [
                      '↩️ 回滚首页当前信号展开列表',
                      '  - 当前信号恢复上一版紧凑卡片',
                      '  - 暂不显示策略展开列表和 L1-L6 档位',
                    ],
                  },
                  {
                    ver: 'v10.7.9.56', date: '2026-07-03',
                    items: [
                      '🏷 修复部分公司图标不显示',
                      '  - EODHD 图标大写路径失败后自动尝试小写路径',
                      '  - 两种路径都失败时再隐藏图标',
                    ],
                  },
                  {
                    ver: 'v10.7.9.55', date: '2026-07-03',
                    items: [
                      '📋 首页自选默认显示全部',
                      '  - 自选列表不再默认折叠为 3 行',
                      '🏷 自选/持仓列表接入 EODHD 公司图标',
                      '  - 图片加载失败时直接隐藏, 不再显示字母占位',
                    ],
                  },
                  {
                    ver: 'v10.7.9.54', date: '2026-07-03',
                    items: [
                      '📋 首页自选/持仓列表按效果图重排',
                      '  - Tab、表头、股票名称、副标题和数字字号同步收紧',
                      '  - 列表改为 3 行预览并保留查看全部入口',
                      '  - 行尾箭头、行高和分隔线按效果图调整',
                    ],
                  },
                  {
                    ver: 'v10.7.9.53', date: '2026-07-03',
                    items: [
                      '🏠 首页信息密度继续收紧',
                      '  - 总资产卡删除约等金额副行',
                      '  - 持仓数量下方说明文字删除',
                      '📡 当前信号卡整体缩小约 20%',
                      '₿ 市场卡将黄金/美元替换为 BTC/美元',
                    ],
                  },
                  {
                    ver: 'v10.7.9.52', date: '2026-07-03',
                    items: [
                      '🎚 首页数字层级继续收紧',
                      '  - 总资产、当前信号、回撤、VIX/CNN 数字减小',
                      '💱 总资产副行删除重复汇率文案',
                    ],
                  },
                  {
                    ver: 'v10.7.9.51', date: '2026-07-03',
                    items: [
                      '🎨 首页字体调整为更接近 iOS 看板效果',
                      '  - 数字不再使用代码感 mono 字体',
                      '  - 底部导航在首页同步黑底金色',
                      '💱 首页总资产支持 USD/RMB 切换',
                      '  - 切换选择会自动记住',
                    ],
                  },
                  {
                    ver: 'v10.7.9.50', date: '2026-07-03',
                    items: [
                      '🏠 首页重做为投资账户看板',
                      '  - 总资产/今日盈亏/累计盈亏改从交易记录派生',
                      '  - 持仓数量=当前持仓股票数, 笔数=卖出记录数',
                      '  - 自选只做行情与关注列表, 不再作为首页主账本',
                      '📈 市场卡扩展为标普/纳指/道指/黄金美元四项',
                    ],
                  },
                  {
                    ver: 'v10.7.9.49', date: '2026-07-03',
                    items: [
                      '🧱 拆出行情 API provider / timeout / error 边界',
                      '✅ 新增第一批自动化测试 (12 项)',
                      '🛡 增加 Supabase RLS 匿名 REST 探针',
                      '  - 12 张用户表匿名访问均不可见',
                    ],
                  },
                  {
                    ver: 'v10.7.9.48', date: '2026-07-03',
                    items: [
                      '🛡 移除浏览器直连 EODHD WebSocket token 路径',
                      '  - 前端不再读取 VITE_EODHD_TOKEN',
                      '  - 实时行情只允许未来通过服务端中转启用',
                      '📋 新增架构安全审查与升级路线',
                    ],
                  },
                  {
                    ver: 'v10.7.9.47', date: '2026-07-03',
                    items: [
                      '⚡ 删除已登录启动开屏,首页直接进入主界面',
                      '  - 移除 X MONEY 黑金加载图和 1.6s 人为等待',
                      '  - 保留云端同步保存保护,避免默认数据误写回 Supabase',
                      '📝 设置页更新日志同步到最新版本',
                    ],
                  },
                  {
                    ver: 'v10.7.9.46', date: '2026-06-13',
                    items: [
                      '🏷 首页"当前猎手状态" → "当前信号"',
                    ],
                  },
                  {
                    ver: 'v10.7.9.45', date: '2026-06-13',
                    items: [
                      '🎨 改名 Bottomline → X MONEY',
                      '  - 开屏: 金色 X 两笔画描出 + X MONEY 文字',
                      '  - 头部 logo / 关于卡 / 图标 / PWA 名 全部更新',
                      '  - favicon 改黑底金 X',
                      '🎬 v45: 开屏 X 直接显示 (不描线), 最短停留 1.6s 让 X MONEY 完整淡入',
                    ],
                  },
                  {
                    ver: 'v10.7.9.43', date: '2026-06-10',
                    items: [
                      '🧠 预警文案理性化 (保留进攻性)',
                      '  - L6 不再"满仓100%", 留 10-20% 应急弹药',
                      '  - L8 "所有现金加杠杆" → 先核维持率, 弹药分 2-3 次',
                      '  - FGI "梭哈买入"→分批进攻, "清仓离场"→留核心仓',
                    ],
                  },
                  {
                    ver: 'v10.7.9.42', date: '2026-06-10',
                    items: [
                      '💰 资产走势 Modal 改黑金质感 (跟家庭总资产同调)',
                      '📊 每月新增环比金额 (+233.2万 · ↑8.1%, 不只百分比)',
                      '  - 起始月显示"起始月", 持平显示"±0"',
                    ],
                  },
                  {
                    ver: 'v10.7.9.41', date: '2026-06-10',
                    items: [
                      '🎯 修复猎手状态 QQQ 回撤拉取不到 (核心 bug)',
                      '  - QQQ 之前没进请求列表, 数据藏 INDICES 里只有当日高',
                      '  - 现 QQQ/TQQQ 走完整接口, 用真实 52 周高算回撤',
                      '  - 52周高不再写死 640.47, 跟 watchlist 同源',
                    ],
                  },
                  {
                    ver: 'v10.7.9.40', date: '2026-04-27',
                    items: [
                      '🚀 升级 EODHD All-In-One ($99.99/月), 全套接口替换',
                      '📅 重要日历 (首页时间轴 - 15 天)',
                      '  - 财报数据: NASDAQ → EODHD 官方 (更稳)',
                      '  - 财报 + FOMC 议息',
                      '🪟 Modal 重新设计 + 公司 Logo + 可滚动',
                      '  - 公司 Logo (EODHD 官方)',
                      '  - 顶部 V4 两行: "EPS 超预期 +X%" / "营收 超预期 +X%"',
                      '  - 业绩 V2 双卡片: EPS + 营收 (实际 vs 预期)',
                      '  - 已发布显示实际, 未发布显示预期',
                      '  - 同比对比 (本季 EPS/营收 vs 去年同期)',
                      '  - 📋 公司信息 (含 行业/员工)',
                      '  - 📊 分析师目标价 + 5 档评级',
                      '  - 📈 公司基本面 (PE TTM/营收/利润率/ROE)',
                      '  - 字段口径标注 (TTM / 本季 / 数据源 EODHD)',
                      '🔌 接入 EODHD 接口:',
                      '  - Earnings::History (EPS 实际+预期+超预期)',
                      '  - Earnings::Trend (营收预期 平均/低/高)',
                      '  - Financials::Income_Statement::quarterly (营收实际)',
                    ],
                  },
                  {
                    ver: 'v10.7.9.38', date: '2026-04-26',
                    items: [
                      '📅 新增 重要日历 (首页时间轴)',
                      '  - 显示未来 15 天: 财报日 (watchlist 全部股) + FOMC 议息',
                      '  - 时间轴风格 (彩色圆点 + 横滑)',
                      '  - 日期格式: 今天 / 4/28 / 5/2 (M/D)',
                      '  - 股票名按类型染色 (橙=财报, 蓝=议息, 红=今天)',
                      '  - 财报数据: NASDAQ 公开接口 (EODHD 套餐不含 Calendar)',
                      '  - 每次进 App 都拉新, 无缓存',
                      '🪟 点击事件 → 弹详情 Modal',
                      '  - 圆形渐变图标 (金 $ 财报 / 蓝 % 议息)',
                      '  - 时段中文 (盘前/盘后)',
                      '  - EPS 预期/实际 + 超预期对比',
                      '  - 持仓股数提示',
                    ],
                  },
                  {
                    ver: 'v10.7.9.32', date: '2026-04-25',
                    items: [
                      '💼 新增 摊薄成本计算器 (交易 tab 最底部) ☁️',
                      '  - iOS 卡片风格 · 多股 Tab 切换 · 移动加权平均算法',
                      '  - 双成本: 会计摊薄 + 实际成本 (扣已实现盈亏)',
                      '  - 实际成本下方: ↑ +37.0% · 现价 $200.00 (实时跟随)',
                      '  - 累计投入 + 已实现盈亏 加 CNY 副显示',
                      '  - 卖出交易点击 ▼ 展开利润详情 (收入 − 成本 = 利润)',
                      '  - 云端 Supabase 持久化 · 跨设备同步',
                      '🔄 头部黑金卡按 tab 切换字段 (持仓总盈亏 / 波段总盈亏)',
                      '💱 首页"今日"加 CNY 副显示',
                      '🐛 修复顶部指数 SPY/QQQ 涨跌% 乱跳 bug',
                      '🗑 删除确认 Modal 统一 (苹果风底部抽屉, 替换浏览器原生)',
                    ],
                  },
                  {
                    ver: 'v10.7.9.17', date: '2026-04-24',
                    items: [
                      '🐛 修复 REST 与 WebSocket 数据冲突 (价格"跳回"bug)',
                      'WebSocket 已连接时跳过 REST 自动拉取 · 断开时 REST 兜底',
                    ],
                  },
                  {
                    ver: 'v10.7.9.16', date: '2026-04-23',
                    items: ['🎨 关注卡 V1 三列布局: 代码 | 走势图 | 价格'],
                  },
                  {
                    ver: 'v10.7.9.15', date: '2026-04-23',
                    items: ['🎯 删除关注列表走势图 (然后用户说还是画线好看, 下一版恢复)'],
                  },
                  {
                    ver: 'v10.7.9.14', date: '2026-04-23',
                    items: ['🎯 切换到 EODHD Live v2 (/api/us-quote-delayed)', '支持 ethPrice (盘前盘后实时价)', 'changePercent 跟 Yahoo 网页一致'],
                  },
                  {
                    ver: 'v10.7.9.13', date: '2026-04-23',
                    items: ['📈 首页持仓卡: 浮动% → 当日盈亏', '显示: 今日 +$X,XXX (+X.XX%)', '⚠️ 盘前盘后涨跌% 不实时 (已解决, 见 v14)'],
                  },
                  {
                    ver: 'v10.7.9.12', date: '2026-04-23',
                    items: ['🎨 波段记录卡换白卡极简 (替换黑金)', '跟关注列表/戒律/复盘 视觉统一', '白底 + 灰块 + 进行中红色数字'],
                  },
                  {
                    ver: 'v10.7.9.11', date: '2026-04-23',
                    items: ['📊 交易波段卡加"现价"列 (3 列 → 4 列)', '现价颜色: 高于买入均=红(浮盈) · 低于=绿(浮亏)', '一眼看出当前价格 + 盈亏方向'],
                  },
                  {
                    ver: 'v10.7.9.10', date: '2026-04-23',
                    items: ['🔔 预警折叠状态持久化 (localStorage)', '用户点"收起"后, 下次打开保持折叠', '有新预警或等级升级 → 自动展开 + 显示"新/升级"徽章', '不会漏掉重要信号'],
                  },
                  {
                    ver: 'v10.7.9.9', date: '2026-04-23',
                    items: ['💱 首页总览卡加人民币副显示 (≈ ¥X.X万)', '总市值 + 波段总盈亏 都显示', '主 USD 大字 · 小字 CNY 辅助 · 汇率明示', '🧹 代码清理 -105 行 (10 处死代码)'],
                  },
                  {
                    ver: 'v10.7.9.8', date: '2026-04-23',
                    items: ['✨ 北极星计划卡 宇宙动效 (保留烈焰红金)', '北极星移到右下角, 不挡设置按钮', '8 颗闪烁星 + 偶尔流星'],
                  },
                  {
                    ver: 'v10.7.9.7', date: '2026-04-23',
                    items: ['🔧 修复顶部指数(标普/纳指 ETF)WebSocket 不更新', '现在 SPY/QQQ 也实时推送'],
                  },
                  {
                    ver: 'v10.7.9.6', date: '2026-04-23',
                    items: ['📋 设置页卡片重排序 (符合使用频率)', '新顺序: 实时推送 → 数据状态 → 更新日志 → 云端 → 数据 → 关于', '高频功能优先 (实时推送在最上)'],
                  },
                  {
                    ver: 'v10.7.9.5', date: '2026-04-23',
                    items: ['🐛 修复复利计划输入 bug (起始年/总年数/目标年龄)', '之前: 删空数字会自动跳回默认值, 不让删', '现在: 输入时可以完全清空, 失焦时才 fallback 默认'],
                  },
                  {
                    ver: 'v10.7.9.4', date: '2026-04-23',
                    items: ['📜 复盘日志默认显示 10 条 (跟戒律一致)', '超过 10 条 → "展开剩余 X 条" 按钮', '收起后回归 10 条简洁视图'],
                  },
                  {
                    ver: 'v10.7.9.3', date: '2026-04-23',
                    items: ['🐛 修复戒律置顶 bug (pinned 排序失效)', '现在置顶的戒律永远显示在最上面'],
                  },
                  {
                    ver: 'v10.7.9.2', date: '2026-04-23',
                    items: ['📐 关注列表再扩宽 (删 ✕ + 单线分隔)', '右侧 padding 28px → 14px (内容多 14px 空间)', '卡间双线 → 单线 (视觉更轻)', '删除股票: 点卡片进编辑 → 底部"删除"按钮'],
                  },
                  {
                    ver: 'v10.7.9.1', date: '2026-04-23',
                    items: ['📱 关注列表入侵式占满全屏 (手机视觉 +宽 32px)', '卡片左右贴边, 走势图更长', '编辑卡和添加按钮保持原宽度'],
                  },
                  {
                    ver: 'v10.7.9.0', date: '2026-04-23',
                    items: ['🎨 关注列表卡片重设计 (B 对称两块)', '左块: 持仓信息 / 右块: 52周高 + L级', '移除整张卡红色背景 (跟"触发预警"统一)', '52周跌幅红色 + 等级渐深 (L1黄→L7暗红)'],
                  },
                  {
                    ver: 'v10.7.8.9', date: '2026-04-22',
                    items: ['🎉 大合并版: 含所有功能 + 修复', '🎯 当前猎手状态 / settings 补全 / try/catch 兼容'],
                  },
                  {
                    ver: 'v10.7.8.8', date: '2026-04-22',
                    items: ['🚨 修复 5 张表加载失败 (Supabase auth lock 抢锁 bug)', '⚡ 性能优化: 7 处 useMemo (波段/警报/统计缓存)', 'WebSocket 模式 CPU 占用降低 ~40%'],
                  },
                  {
                    ver: 'v10.7.8.7', date: '2026-04-22',
                    items: ['💾 新增"导出 JSON 备份"按钮 (设置页 → 数据卡)', '建议每月 1 次导出, 对抗数据意外丢失'],
                  },
                  {
                    ver: 'v10.7.8.6', date: '2026-04-22',
                    items: ['底部 tab "复盘" 改名 "目标" (更贴合实际功能)', '更新日志支持折叠/展开 (默认显示最新 5 条)'],
                  },
                  {
                    ver: 'v10.7.8.5', date: '2026-04-22',
                    items: ['首页指数改用 SPY/QQQ ETF (实时数据 替代 15min 延迟)', '删除"手动保存"假按钮'],
                  },
                  {
                    ver: 'v10.7.8.3', date: '2026-04-22',
                    items: ['年度目标进度条改成"实际收益完成度" (不再是时间)', '4 个主按钮统一金色描边'],
                  },
                  {
                    ver: 'v10.7.8.1', date: '2026-04-22',
                    items: ['WebSocket 走势图实时同步 (1 分钟合并桶)'],
                  },
                  {
                    ver: 'v10.7.8', date: '2026-04-22',
                    items: ['🧪 WebSocket 实时推送 BETA (< 50ms 延迟)', '设置页 → 🧪 实时推送 手动开启', '价格变化时卡片闪烁动画'],
                  },
                  {
                    ver: 'v10.7.7.4', date: '2026-04-22',
                    items: ['🛡️ 数据安全加固: 云端失败时不覆盖本地', '顶部警告横幅 (含重试按钮)', '"重置"加二次确认 (防误操作)'],
                  },
                  {
                    ver: 'v10.7.7.3', date: '2026-04-22',
                    items: ['修复波段"消失"bug (id 改基于日期)', '新增"📋 全部交易"弹窗 (完整历史可查可删)'],
                  },
                  {
                    ver: 'v10.7.7.2', date: '2026-04-22',
                    items: ['资产走势图入场动画 (V2 点依次弹出)', '空月断线 不画"假数据"'],
                  },
                  {
                    ver: 'v10.7.7.1', date: '2026-04-22',
                    items: ['资产走势图空月断线修复'],
                  },
                  {
                    ver: 'v10.7.7', date: '2026-04-22',
                    items: ['设置页全部黑金统一', '云端账户 + 手动拉取按钮改黑金'],
                  },
                  {
                    ver: 'v10.7.6', date: '2026-04-22',
                    items: ['设置页删除持仓头卡', '数据状态升级为智能刷新实时指标', '新增更新日志卡片'],
                  },
                  {
                    ver: 'v10.7.5', date: '2026-04-22',
                    items: ['修复密码重置直接登录 bug', '设置页加"修改密码"入口'],
                  },
                  {
                    ver: 'v10.7.4', date: '2026-04-22',
                    items: ['新增忘记密码功能', '登录页升级黑金主题'],
                  },
                  {
                    ver: 'v10.7.3', date: '2026-04-22',
                    items: ['品牌图标: 金色 K 线柱', 'App 名改为 Bottomline'],
                  },
                  {
                    ver: 'v10.7.2', date: '2026-04-22',
                    items: ['资产录入按人 Tab 切换 (我/老婆)'],
                  },
                  {
                    ver: 'v10.7.1', date: '2026-04-22',
                    items: ['智能刷新 (盘中 10s/盘外 30s/休市 5min)', '修复首次进入没走势图'],
                  },
                  {
                    ver: 'v10.7.0', date: '2026-04-22',
                    items: ['我的关注 Robinhood 风改造', '走势图 56px + 渐变填充'],
                  },
                  {
                    ver: 'v10.6.9', date: '2026-04-21',
                    items: ['修复 HKD 汇率 bug (港币换算正确)'],
                  },
                  {
                    ver: 'v10.6.8', date: '2026-04-21',
                    items: ['全黑流动金线开屏 (V4-B)', 'SUPABASE LIVE 状态徽章'],
                  },
                  {
                    ver: 'v10.6.7', date: '2026-04-21',
                    items: ['大 B 开屏字母品牌强化'],
                  },
                  {
                    ver: 'v10.6.6', date: '2026-04-21',
                    items: ['3 tab 头部统一奢华黑金'],
                  },
                  {
                    ver: 'v10.6.5', date: '2026-04-21',
                    items: ['修复 52 周高拆股 bug (TQQQ)', '盘前数据自动显示'],
                  },
                  {
                    ver: 'v10.6.4', date: '2026-04-21',
                    items: ['交易 tab V3.2 重做: 进行中独立大卡 + 历史紧凑'],
                  },
                  {
                    ver: 'v10.6.0-3', date: '2026-04-20',
                    items: ['年度表视觉升级', '字号+折叠优化', '防重复提交'],
                  },
                  {
                    ver: 'v10.5.x', date: '2026-04-19',
                    items: ['复利计划', '融资杠杆监控', '投资戒律'],
                  },
                  {
                    ver: 'v10.x', date: '2026-04 之前',
                    items: ['Supabase 云端同步', '账户/快照独立表', '波段切分'],
                  },
                  {
                    ver: 'v1.0', date: '诞生',
                    items: ['第一版 TQQQ 波段追踪器 🎂'],
                  },
                ];
                return (
                  <div>
                    {(changelogExpanded ? changelog : changelog.slice(0, 5)).map((log, idx, arr) => (
                      <div
                        key={log.ver}
                        className={`py-3 ${idx !== arr.length - 1 ? 'border-b border-slate-100' : ''} ${idx === 0 ? 'pt-0' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-black tabular-nums"
                            style={{
                              fontFamily: 'ui-monospace, monospace',
                              background: log.latest
                                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                              color: log.latest ? '#fff' : '#0a0a0a',
                            }}
                          >
                            {log.ver}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {log.date}
                          </span>
                          {log.latest && (
                            <span className="ml-auto px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black tracking-wider">
                              最新
                            </span>
                          )}
                        </div>
                        <ul className="pl-1 space-y-0.5">
                          {log.items.map((item, i) => (
                            <li key={i} className="text-[12px] text-slate-600 pl-3.5 relative">
                              <span className="absolute left-1 text-amber-500 font-bold">·</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {/* 折叠/展开按钮 */}
                    {changelog.length > 5 && (
                      <button
                        onClick={() => setChangelogExpanded(!changelogExpanded)}
                        className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 active:scale-95 transition flex items-center justify-center gap-1.5"
                      >
                        {changelogExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            收起 (隐藏 {changelog.length - 5} 条历史)
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            查看完整历史 (还有 {changelog.length - 5} 条 · 共 {changelog.length} 个版本)
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 账户信息 - 奢华黑金 */}
            <div
              className="rounded-2xl p-5 text-white relative overflow-hidden"
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
              {/* 金色光晕装饰 (右上) */}
              <div className="absolute top-0 right-0 w-44 h-44 pointer-events-none" style={{
                background: 'radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%)',
                transform: 'translate(40%, -40%)',
              }}></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <h2
                    className="font-black text-lg flex items-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '1px',
                    }}
                  >
                    ☁️ 云端账户
                  </h2>
                  <span
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1.5"
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }}></span>
                    已登录
                  </span>
                </div>
                <div
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#737373', letterSpacing: '2px' }}
                >
                  SIGNED IN
                </div>
                <div
                  className="text-sm font-bold mb-3 break-all mt-1"
                  style={{ color: '#d4d4d4', fontFamily: 'ui-monospace, monospace' }}
                >
                  {user?.email || '--'}
                </div>
                <div
                  className="text-[10px] mb-3 leading-relaxed p-2.5 rounded-lg"
                  style={{
                    color: '#a3a3a3',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(251, 191, 36, 0.08)',
                  }}
                >
                  💾 数据已云端备份 (Supabase Singapore)<br />
                  🔒 行级安全 · 任何人都无法访问你的数据<br />
                  📱 任意设备登录此账号都能看到你的数据
                </div>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="w-full py-2.5 rounded-xl active:scale-95 transition flex items-center justify-center gap-1.5 text-sm font-bold mb-2"
                  style={{
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    color: '#fbbf24',
                  }}
                >
                  🔑 修改密码
                </button>
                <button
                  onClick={() => {
                    showConfirm({
                      title: '退出登录?',
                      desc: '下次进入需要重新登录',
                      icon: '🔓',
                      confirmText: '退出',
                      onConfirm: async () => {
                        await onLogout();
                      },
                    });
                  }}
                  className="w-full py-2.5 rounded-xl active:scale-95 transition flex items-center justify-center gap-1.5 text-sm font-bold"
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                  }}
                >
                  <LogOut className="w-4 h-4" /> 退出登录
                </button>
              </div>
            </div>

            {/* 修改密码 Modal */}
            {showChangePassword && (
              <div
                className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); } }}
              >
                <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-base flex items-center gap-2">
                      🔑 修改密码
                    </h3>
                    <button
                      onClick={() => { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); }}
                      className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <label className="block text-xs text-slate-500 font-bold mb-1">新密码 (至少 6 位)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-amber-500 focus:outline-none mb-3"
                  />

                  {pwdMsg && (
                    <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${
                      pwdMsg.type === 'error'
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    }`}>
                      {pwdMsg.text}
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!newPwd || newPwd.length < 6) {
                        setPwdMsg({ type: 'error', text: '密码至少 6 位' });
                        return;
                      }
                      setPwdLoading(true);
                      setPwdMsg(null);
                      try {
                        const { error } = await supabase.auth.updateUser({ password: newPwd });
                        if (error) {
                          setPwdMsg({ type: 'error', text: error.message });
                        } else {
                          setPwdMsg({ type: 'success', text: '✓ 密码已更新, 下次登录用新密码' });
                          setNewPwd('');
                          setTimeout(() => {
                            setShowChangePassword(false);
                            setPwdMsg(null);
                          }, 2000);
                        }
                      } catch (e) {
                        setPwdMsg({ type: 'error', text: e.message || '更新失败' });
                      } finally {
                        setPwdLoading(false);
                      }
                    }}
                    disabled={pwdLoading}
                    className="w-full py-3 font-black rounded-xl active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      color: '#0a0a0a',
                    }}
                  >
                    {pwdLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    ) : '保存新密码'}
                  </button>

                  <p className="text-[10px] text-slate-400 text-center mt-3">
                    保存后下次登录请使用新密码
                  </p>
                </div>
              </div>
            )}

            {/* 数据持久化 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3">💾 数据</h2>
              <div className="text-xs text-slate-500 mb-3 leading-relaxed">
                所有数据自动云端同步, 无需手动保存。
                <br/>
                建议: 每月导出一次 JSON 备份到本地。
              </div>
              <div className="space-y-2">
                {/* 导出 JSON 备份 */}
                <button
                  onClick={() => {
                    const backup = {
                      exportedAt: new Date().toISOString(),
                      version: 'v10.7.9.59',
                      trades,
                      watchlist,
                      waveNotes,
                      accounts,
                      snapshots,
                      investmentPlan,
                      marginStatus,
                      disciplines,
                      reviewLogs,
                      yearlyActuals,
                      settings: {
                        benchmarkSymbol, fgi, fgiLabel, fgiPrev, fgiWeek, fgiMonth, fgiYear, fgiDataDate,
                        vix, vixDataDate, batches, exitTargets, usdRate, hkdRate,
                      },
                    };
                    const json = JSON.stringify(backup, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const date = new Date().toISOString().slice(0, 10);
                    a.download = `x-money-backup-${date}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full py-2.5 rounded-xl font-black text-sm active:scale-95 transition flex items-center justify-center gap-1.5"
                  style={{
                    background: '#fff',
                    color: '#d97706',
                    border: '2px solid #fbbf24',
                  }}
                >
                  ⬇️ 导出 JSON 备份
                </button>
                {/* 重置本地数据 */}
                <button
                  onClick={resetAll}
                  className="w-full py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <RotateCcw className="w-4 h-4" /> 重置本地数据
                </button>
              </div>
            </div>

            {/* 关于 */}
            <div className="bg-white rounded-2xl p-5 shadow">
              <h2 className="font-bold text-lg mb-3">关于 X MONEY</h2>
              <div className="text-sm text-slate-600 space-y-1.5">
                <div>📊 版本:v10.7.9.59</div>
                <div>📡 数据源:EODHD + Yahoo Finance</div>
                <div>💡 提示:把这个页面"添加到主屏幕"获得 App 体验</div>
              </div>
            </div>
          </div>

    </>
  );
}
