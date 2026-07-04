import React from 'react';

export default function SettingsTab({ ctx }) {
  const {
    changelogExpanded,
    ChevronDown,
    ChevronUp,
    Loader2,
    LogOut,
    newPwd,
    onLogout,
    pwdLoading,
    pwdMsg,
    resetAll,
    RotateCcw,
    setChangelogExpanded,
    setNewPwd,
    setPwdLoading,
    setPwdMsg,
    setShowChangePassword,
    showChangePassword,
    showConfirm,
    supabase,
    user,
    X,
  } = ctx;

  return (
    <>

          <div className="space-y-4 text-white">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">X MONEY</div>
                  <h1 className="mt-1 text-[22px] font-black tracking-normal text-white">设置</h1>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-[#f6a524]">
                  v10.7.9.89
                </span>
              </div>
            </div>

            {/* 账户设置 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-white">账户设置</h2>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300"></span>
                  已登录
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Email</div>
                <div className="mt-1 break-all text-sm font-semibold text-white/85">
                  {user?.email || '--'}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] py-2.5 text-sm font-bold text-white active:scale-95 transition"
                >
                  修改密码
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
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/20 bg-rose-400/10 py-2.5 text-sm font-bold text-rose-300 active:scale-95 transition"
                >
                  <LogOut className="w-4 h-4" /> 退出登录
                </button>
              </div>
            </div>

            {/* 修改密码 Modal */}
            {showChangePassword && (
              <div
                className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
                onClick={(e) => { if (e.target === e.currentTarget) { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); } }}
              >
                <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0b0f16] p-5 shadow-2xl sm:rounded-3xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-black text-white">修改密码</h3>
                    <button
                      onClick={() => { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <label className="mb-1 block text-xs font-bold text-white/50">新密码 (至少 6 位)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder="至少 6 位"
                    className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6a524]"
                  />

                  {pwdMsg && (
                    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                      pwdMsg.type === 'error'
                        ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6a524] py-3 font-black text-[#05070b] active:scale-95 transition disabled:opacity-50"
                  >
                    {pwdLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    ) : '保存新密码'}
                  </button>
                </div>
              </div>
            )}

            {/* 📜 更新日志 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-lg text-white">
                  更新日志
                </h2>
                <span className="text-[11px] font-bold tabular-nums text-white/40" style={{ fontFamily: 'ui-monospace, monospace' }}>
                  v10.7.9.89
                </span>
              </div>

              {(() => {
                const changelog = [
                  {
                    ver: 'v10.7.9.89', date: '2026-07-04', latest: true,
                    items: [
                      '📐 优化首页自选/持仓首屏列宽',
                      '  - 添加自选股票、编辑自选股票和交易页编辑入口改为正常字重',
                      '  - 首页自选/持仓名称列收窄,价格列左移',
                      '  - 52周跌幅打开首屏即可完整看到,减少横向滑动',
                    ],
                  },
                  {
                    ver: 'v10.7.9.88', date: '2026-07-04',
                    items: [
                      '🧾 优化交易录入弹层位置和遮罩',
                      '  - 取消按钮恢复为清晰可见的暗灰底',
                      '  - 添加/修改交易弹层改为居中自适应显示',
                      '  - 弹层打开后锁定背景页面, 避免背后内容滑动',
                    ],
                  },
                  {
                    ver: 'v10.7.9.87', date: '2026-07-04',
                    items: [
                      '🧾 优化交易录入弹层细节',
                      '  - 买入/卖出选中态改为整块红色/绿色填充',
                      '  - 股票代码、中文名、日期、价格和股数输入框取消明显边框效果',
                      '  - 修复日期输入框在移动端撑出弹层的问题',
                    ],
                  },
                  {
                    ver: 'v10.7.9.86', date: '2026-07-04',
                    items: [
                      '🧾 交易录入弹层改为深色版本',
                      '  - 添加交易和修改交易统一改成黑色 UI',
                      '  - 买入选中显示红色,卖出选中显示绿色,未选按钮为灰色',
                      '  - 输入框、日期栏、确认和取消按钮同步适配深色风格',
                    ],
                  },
                  {
                    ver: 'v10.7.9.85', date: '2026-07-04',
                    items: [
                      '📊 调整持仓盈亏和占比间距',
                      '  - 占比列单独加宽,和持仓盈亏拉开距离',
                      '  - 当日盈亏列宽保持不变',
                    ],
                  },
                  {
                    ver: 'v10.7.9.84', date: '2026-07-04',
                    items: [
                      '📐 微调持仓盈亏列显示',
                      '  - 当日盈亏列恢复上一版首屏显示效果',
                      '  - 持仓盈亏列单独加宽,支持百万和千万级数字',
                      '  - 持仓盈亏正数恢复显示 + 号',
                    ],
                  },
                  {
                    ver: 'v10.7.9.83', date: '2026-07-04',
                    items: [
                      '🧾 修正持仓盈亏和今日订单维护',
                      '  - 持仓盈亏改为只计算当前持仓浮动盈亏',
                      '  - 持仓盈亏正数不再显示 + 号,盈亏列加宽支持横向滑动',
                      '  - 当日订单支持修改和删除,并同步云端账本',
                    ],
                  },
                  {
                    ver: 'v10.7.9.82', date: '2026-07-04',
                    items: [
                      '🔢 持仓市值改为整数显示',
                      '  - 交易页持仓分布市值/数量列不再显示小数',
                      '  - 减少市值列占用,帮助当日盈亏完整露出',
                    ],
                  },
                  {
                    ver: 'v10.7.9.81', date: '2026-07-04',
                    items: [
                      '📏 微调交易持仓分布首屏列宽',
                      '  - 市值/数量和现价/成本再左移一点',
                      '  - 保持当日盈亏列宽,首屏末尾数字更容易完整露出',
                    ],
                  },
                  {
                    ver: 'v10.7.9.80', date: '2026-07-04',
                    items: [
                      '📊 继续优化交易持仓分布',
                      '  - 持仓分布内部左右留白继续收紧,表格更贴近两侧边框',
                      '  - 缩窄名称/代码、市值/数量和现价/成本列,首屏更完整显示当日盈亏',
                    ],
                  },
                  {
                    ver: 'v10.7.9.79', date: '2026-07-04',
                    items: [
                      '📐 优化首页指数卡和交易持仓表宽度',
                      '  - 首页四张市场卡价格数字统一左移并略微收紧,避免右侧被撑出',
                      '  - 交易页持仓分布加宽股票信息和盈亏列,当日盈亏显示更完整',
                    ],
                  },
                  {
                    ver: 'v10.7.9.78', date: '2026-07-04',
                    items: [
                      '🔐 修复找回密码回跳',
                      '  - 找回密码邮件固定回到生产域名',
                      '  - 登录页兼容 Supabase code 回跳和过期链接提示',
                      '  - 避免有效链接进入后不显示设置新密码',
                    ],
                  },
                  {
                    ver: 'v10.7.9.77', date: '2026-07-04',
                    items: [
                      '📱 修复手机桌面图标白边',
                      '  - PWA / iOS 图标改为不透明深色底 PNG',
                      '  - 避免透明外沿在浅色壁纸上显示成白色边框',
                    ],
                  },
                  {
                    ver: 'v10.7.9.76', date: '2026-07-04',
                    items: [
                      '📱 更新手机桌面图标',
                      '  - 保存到手机桌面的 PWA 图标替换为新黑金 K 线图标',
                      '  - 新增 180/192/512 PNG 图标和 16/32 favicon',
                      '  - manifest 和 iOS apple-touch-icon 改为 PNG 图标',
                    ],
                  },
                  {
                    ver: 'v10.7.9.75', date: '2026-07-04',
                    items: [
                      '₿ 修复 BTC 首屏卡片错位',
                      '  - BTC 实时 tick 不再在市场卡未初始化时单独占第一格',
                      '  - 等四张市场卡加载完成后再覆盖更新 BTC 第四格',
                    ],
                  },
                  {
                    ver: 'v10.7.9.74', date: '2026-07-04',
                    items: [
                      '₿ BTC 单币种独立实时行情',
                      '  - 首页 BTC 卡接入已登录服务端 WebSocket relay',
                      '  - 前端不暴露 EODHD token,断线后自动重连并用 REST 兜底',
                      '  - BTC 卡显示 LIVE/REST/连接中状态',
                    ],
                  },
                  {
                    ver: 'v10.7.9.73', date: '2026-07-04',
                    items: [
                      '🧮 修复卖出后累计收益率口径',
                      '  - 累计收益率分母改为当前实际持仓成本',
                      '  - 卖出盈利会正确摊薄剩余持仓成本,不再被历史买入额压低收益率',
                      '  - 超过当前持仓数量的异常卖出不会污染盈亏计算',
                    ],
                  },
                  {
                    ver: 'v10.7.9.72', date: '2026-07-04',
                    items: [
                      '📈 首页自选/持仓新增年初至今和排序',
                      '  - 自选和持仓右侧指标新增年初至今涨跌幅',
                      '  - 价格、涨跌幅、52 周跌幅、年初至今和持仓盈亏支持表头排序',
                      '  - 自选列表不再显示持仓盈亏,持仓 tab 才显示真实持仓盈亏',
                    ],
                  },
                  {
                    ver: 'v10.7.9.71', date: '2026-07-04',
                    items: [
                      '🧩 首页自选编辑管理',
                      '  - 自选列表底部新增并排编辑自选股票入口',
                      '  - 编辑窗口支持置顶、上移、下移和删除',
                      '  - 删除点击股票展开自选参数的旧入口',
                    ],
                  },
                  {
                    ver: 'v10.7.9.70', date: '2026-07-04',
                    items: [
                      '📊 首页自选/持仓表格全局横向滑动',
                      '  - 左侧名称列固定不动',
                      '  - 右侧价格、涨跌幅、52 周跌幅和持仓盈亏统一横向滑动',
                      '  - 表头和每只股票数字上下严格对齐',
                    ],
                  },
                  {
                    ver: 'v10.7.9.69', date: '2026-07-04',
                    items: [
                      '✅ 首页自选添加体验细节优化',
                      '  - 添加自选窗口改为居中自适应,键盘弹出时输入框保持可操作',
                      '  - 添加股票时显示添加中状态并禁止重复提交',
                      '  - 添加成功后弹出成功提示窗口',
                      '  - 首页持仓默认展示全部持仓股',
                      '  - 自选/持仓右侧指标改为横向滑动,增加 52 周高点跌幅',
                    ],
                  },
                  {
                    ver: 'v10.7.9.68', date: '2026-07-04',
                    items: [
                      '⭐ 首页自选添加与持仓口径修正',
                      '  - 自选只显示用户主动添加的股票,新用户默认空列表',
                      '  - 首页新增底部添加自选股票弹层,仅保留美股添加流程',
                      '  - 持仓继续同步交易主账本真实持仓,不再污染自选',
                      '  - 股票图标增加多源候选和成功缓存,IBKR 等缺图会自动兜底',
                    ],
                  },
                  {
                    ver: 'v10.7.9.67', date: '2026-07-04',
                    items: [
                      '🎚️ 设置页深色风格对齐首页',
                      '  - 移除实时推送、数据状态和 JSON 导出入口',
                      '  - 云端账户改为普通账户设置卡',
                      '  - 设置页底部导航同步深色模式',
                    ],
                  },
                  {
                    ver: 'v10.7.9.66', date: '2026-07-04',
                    items: [
                      '🎨 首页/交易页加载和涨跌颜色设置',
                      '  - 首页、交易和建议加载态改为深色,避免闪白',
                      '  - 持仓分布右侧新增绿涨红跌/绿跌红涨切换',
                      '  - 首页自选和持仓改为接入交易主账本股票集合',
                    ],
                  },
                  {
                    ver: 'v10.7.9.65', date: '2026-07-04',
                    items: [
                      '💱 汇率每日自动查询',
                      '  - 新增已登录 /api/fx 服务端接口',
                      '  - USD/RMB 和 HKD/RMB 每台设备每天查询一次',
                      '  - 查询失败时保留上次缓存或默认汇率',
                    ],
                  },
                  {
                    ver: 'v10.7.9.64', date: '2026-07-04',
                    items: [
                      '🔠 USD/RMB 盈亏数字字号统一',
                      '  - 首页和交易页头部 USD 盈亏数字按 RMB 尺寸收紧',
                      '  - 汇率仍为手动/默认值,暂未接入自动汇率接口',
                    ],
                  },
                  {
                    ver: 'v10.7.9.63', date: '2026-07-04',
                    items: [
                      '📒 交易主账本独立建库',
                      '  - 首页和交易页持仓改为读取 stock_trades',
                      '  - 旧 trades 只保留给波段记录兼容',
                      '  - JSON 备份同步包含新主账本',
                    ],
                  },
                  {
                    ver: 'v10.7.9.62', date: '2026-07-04',
                    items: [
                      '🎨 交易页盈亏色号统一首页',
                      '  - 持仓盈亏、当日盈亏和订单方向色阶改为首页同款',
                      '  - 买入/卖出快捷按钮颜色同步收敛',
                    ],
                  },
                  {
                    ver: 'v10.7.9.61', date: '2026-07-04',
                    items: [
                      '🎚️ 交易页头部和工具箱细节对齐首页',
                      '  - 交易头部卡片字号、按钮和间距对齐首页',
                      '  - 波段记录后改为摊薄工具、股票设置',
                      '  - 占比列只显示百分比',
                    ],
                  },
                  {
                    ver: 'v10.7.9.60', date: '2026-07-04',
                    items: [
                      '🧭 交易页工具箱和持仓表优化',
                      '  - 交易页背景和底部导航统一为首页黑色风格',
                      '  - 持仓表右侧指标支持横向滑动',
                      '  - 增加个股持仓盈亏和市值占比',
                      '  - 全部功能入口暂不响应点击',
                    ],
                  },
                  {
                    ver: 'v10.7.9.59', date: '2026-07-04',
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
                        className={`py-3 ${idx !== arr.length - 1 ? 'border-b border-white/10' : ''} ${idx === 0 ? 'pt-0' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-black tabular-nums"
                            style={{
                              fontFamily: 'ui-monospace, monospace',
                              background: log.latest
                                ? 'rgba(52, 211, 153, 0.16)'
                                : 'rgba(246, 165, 36, 0.12)',
                              border: log.latest
                                ? '1px solid rgba(52, 211, 153, 0.24)'
                                : '1px solid rgba(246, 165, 36, 0.18)',
                              color: log.latest ? '#86efac' : '#f6a524',
                            }}
                          >
                            {log.ver}
                          </span>
                          <span className="text-[10px] text-white/35 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            {log.date}
                          </span>
                          {log.latest && (
                            <span className="ml-auto rounded border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-emerald-300">
                              最新
                            </span>
                          )}
                        </div>
                        <ul className="pl-1 space-y-0.5">
                          {log.items.map((item, i) => (
                            <li key={i} className="relative pl-3.5 text-[12px] text-white/65">
                              <span className="absolute left-1 font-bold text-[#f6a524]">·</span>
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
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] py-2.5 text-xs font-bold text-[#f6a524] active:scale-95 transition"
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

            {/* 数据维护 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h2 className="mb-3 text-lg font-black text-white">数据维护</h2>
              <div className="mb-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs leading-relaxed text-white/55">
                数据会随账号自动同步。这里仅保留本机重置入口。
              </div>
              <button
                onClick={resetAll}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] py-2.5 text-sm font-bold text-white active:scale-95 transition"
              >
                <RotateCcw className="w-4 h-4" /> 重置本地数据
              </button>
            </div>

            {/* 关于 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h2 className="mb-3 text-lg font-black text-white">关于 X MONEY</h2>
              <div className="space-y-2 text-sm text-white/60">
                <div className="flex items-center justify-between gap-3">
                  <span>版本</span>
                  <span className="font-semibold tabular-nums text-white/85">v10.7.9.89</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>数据源</span>
                  <span className="font-semibold text-white/85">EODHD + Yahoo Finance</span>
                </div>
              </div>
            </div>
          </div>

    </>
  );
}
