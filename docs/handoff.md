# boduan-tracker 当前交接

验证时间：`2026-07-20 Asia/Shanghai`

本文件只保存当前已验证生产状态、风险和下一步。历史查 Git、GitHub Actions、Vercel 和 `src/lib/settingsChangelog.js`；稳定边界看 `README.md`；流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 生产运行时代码 | `c1fa5afb4efd8348e5dadfad57709d20a0862a16` |
| 设置页版本 | `v10.7.9.363` |
| 生产入口 | `/assets/index-CTyIi7GQ.js` |
| Runtime Actions | `29697649152` success |
| Runtime Vercel | `3Cpw3okpFiQTUYUmumSLBDhmBWBX` success |

已验证：

- `npm run check:full`：`547 / 547` PASS，Vite production build PASS；`npm run check:docs`：PASS。
- `npm run verify:deploy-status -- c1fa5af` 首次只读时流水线尚在 pending；随后同一 Actions `29697649152`、GitHub combined status 与同一 Vercel 部署均已只读确认 success，未重复触发部署校验。
- 未登录 `/api/quote?symbols=VIX`：`401`。
- 未登录 `/api/quote?symbols=NVDA&view=stock-detail`：`401`。
- 未登录 `/api/earnings-calendar?symbols=NVDA`：`401`。
- 未登录 `/api/pnl-benchmark?symbol=QQQ&from=2026-04-20&to=2026-07-20`：`401`。
- 首页“自选”中只有股票图标、代码和名称区域进入独立详情页；价格、涨跌、回撤、“持仓”页和排序区域不触发。
- 详情页股票价格、技术指标、目标价、平均成本和交易记录固定为 USD；只有持仓市值和盈亏跟随系统 USD/CNY。目标价按 `user_id + symbol` 保存，不进入交易账本或比赛计算。
- 详情页中文标题为“股票趋势”，保留五栏底部导航和安全留白；目标价整卡按压缩放已取消，右上角“编辑”文字、铅笔和箭头已隐藏，但点击整卡编辑不变。
- “关键事件”不再显示“自动读取”，“最近交易记录”不再显示“正式账本 · 只读”；持仓和交易数据读取边界未变。
- 成本至目标进度保留真实有符号数值：现价低于平均成本时可显示负数，但视觉标记仍限制在 `0–100%`轨道内。
- 公司 Logo 已与首页共用缓存和回退链；单一来源失败后会继续尝试 EODHD 大小写、FMP 和 Finnhub，成功后写入现有本地缓存。
- 股票趋势默认展示五年真实周收盘，约 260 个数据点使用 `0.95px` 细绿线、无发光和弱填充；`1.15px` 金色 MA200 周线贯穿图表，点击可同时读取股价、周涨跌和当周已锁定均线。
- 1月、3月、6月和1年走势图使用真实复权日收盘与蓝色 MA200（日）；日均线由完整历史预热后再裁剪可见区间，图例和 tooltip 随日/周周期切换，不新增 provider 请求。
- 关键指标第三项已由“距 EMA30（日）”改为“相对 QQQ（3个月）”：主值为个股三个月涨跌幅减去 QQQ 三个月涨跌幅，副行显示双方各自涨跌幅；双方严格对齐共同交易日并使用复权收盘价。
- QQQ 读取沿用登录鉴权的 `/api/pnl-benchmark`，15 分钟内复用成功结果，失败不阻塞详情页；历史不足、QQQ 未覆盖个股最新收盘日或三个月起点偏移超过 7 天时均显示 `--`，不拿缩短或过旧窗口冒充三个月结果。
- 五年图已增加双指缩放；放大后使用单指横向拖动平移，轻点显示 tooltip，纵向手势仍交给页面滚动。可视窗口最小 26 周并按窗口重算坐标，显示日期范围和“重置”，离开最新日期时不伪装末端呼吸点。
- 走势图右端不再重复显示最新股价气泡；末端绿点增加与股票详情页同节奏的 `3.2s` 独立呼吸光环，原圆点大小、头部主股价和点击历史价格 tooltip 不变，并遵循系统 reduced-motion 设置。
- MA200 周线由按需获取的十年复权收盘预热计算，只推进已完成交易周；未收盘周不会改写锁定值，行情源失败与真实历史不足分别显示“暂不可用”和周数进度。普通首页行情仍保持原 380 天历史窗口。
- 关键指标为无分割线的 52 周高点、MA200（日）、相对 QQQ（3个月）与独立 MA200 周线详情；MA200（周）旁标签为“芒格指标”，周线面板展示距均线、近四周变化、连续状态和锁定日期。
- 生产 `watchlist.target_price_usd numeric(18,6)` 已 database-first 迁移；正数约束、RLS、原 5 条 policy、76 条既有数据和 0 条非空目标价均完成 postflight，未改变既有行。
- 生产详情页分包 `/assets/WatchlistStockDetailPage-DWgE5sUg.js` 返回 `200`，包含相对 QQQ 三个月指标、单指横向/纵向判定、双指缩放、重置、26 周下限和“芒格指标”标记；目标价编辑、日/周 MA、呼吸动画与 reduced-motion 边界仍在，Settings/changelog 为 `v10.7.9.363`。
- 本机真实 Xcode iOS Simulator 已验证默认五年图、联动 tooltip 与周线指标面板；截图在忽略目录 `outputs/ios-simulator/watchlist-weekly-ma-production-v360-*.png`。
- 本次末端标签精简的 Simulator 截图：`outputs/ios-simulator/watchlist-weekly-ma-no-end-price-v361.png`。
- 本次日/周均线切换的真实 Simulator 截图：`outputs/ios-simulator/watchlist-real-daily-ma200-1m-v1.png`、`watchlist-real-daily-ma200-tooltip-1m-v1.png` 和 `watchlist-real-weekly-ma200-5y-v1.png`。
- 本次末端圆点呼吸效果的真实 Simulator 双帧：`outputs/ios-simulator/watchlist-endpoint-breathe-frame-a.png`、`watchlist-endpoint-breathe-frame-b.png`。
- 本次相对 QQQ 三个月指标的真实 Simulator 截图：`outputs/ios-simulator/watchlist-relative-qqq-3m-local.png`。

## 收益比赛当前状态

- 最新 publication marker：`2026-07-17`。
- marker version：`ec83653de45d4f4bb1f97cf237e96dc6`。
- `completed_at`：`2026-07-17 21:20:24.321452+00`。
- active / expected / complete：`9 / 9 / 9`。
- missing / absent / invalid / unexpected：全部 `0`。
- 2026-07-14：expected `8` / complete `8` / missing `0`。
- 2026-07-15：expected `9` / complete `9` / missing `0`。
- 2026-07-16：expected `9` / complete `9` / missing `0`。

本次于 2026-07-19 通过生产数据库只读查询核对 durable marker 与 exact complete batch；未覆盖锁定行，也未人工补造收益。

## 当前风险与下一步

1. 下一次需要比赛数据证据时先只读确认最新 marker；不要假定仍停在 07/17，也不要在美东 17:00 前判断当日缺失。
2. iOS Home Screen PWA 登录态恢复只在相关生命周期、cache 或交互变化时使用 Simulator 复测，不作为无关改动门禁。
3. competition rebaseline 的真实 scheduled D1/D2 观察继续 fail closed，只报告聚合结果。
4. `src/App.jsx`、`src/lib/db.js` 和行情 provider 仍较集中；只在明确任务中小步拆分，不顺手大重构。
5. 安全债务仍包括其余用户表 RLS metadata、`community_profiles` 双用户隔离 smoke、关键 API/组合计算测试和响应/schema 校验；只在相关 FULL 任务或稳定 admin channel 可用时推进。
6. Supabase 目前仍没有自动 migration runner；任何 SQL 继续按明确授权、database-first、preflight/postflight 执行。

## 接手入口

只读三份权威文档：`README.md`、`docs/development-process.md`、`docs/handoff.md`。首次新工作区再运行 workspace/toolchain 检查；连续开发按流程直接进入目标文件，不重复接手仪式。
