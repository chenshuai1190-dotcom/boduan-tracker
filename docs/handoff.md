# boduan-tracker 当前交接

验证时间：`2026-07-20 Asia/Shanghai`

本文件只保存当前已验证生产状态、风险和下一步。历史查 Git、GitHub Actions、Vercel 和 `src/lib/settingsChangelog.js`；稳定边界看 `README.md`；流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 生产运行时代码 | `055b450509dc23e489cf1fe52d96154adaff116b` |
| 设置页版本 | `v10.7.9.362` |
| 生产入口 | `/assets/index-BBdQn2bv.js` |
| Runtime Actions | `29694790085` success |
| Runtime Vercel | `As15htqhfoicivqJDgvJJyiKcSU5` success |

已验证：

- `npm run verify:deploy-status -- 055b450`：PASS。
- 未登录 `/api/quote?symbols=VIX`：`401`。
- 未登录 `/api/quote?symbols=NVDA&view=stock-detail`：`401`。
- 未登录 `/api/earnings-calendar?symbols=NVDA`：`401`。
- 首页“自选”中只有股票图标、代码和名称区域进入独立详情页；价格、涨跌、回撤、“持仓”页和排序区域不触发。
- 详情页股票价格、技术指标、目标价、平均成本和交易记录固定为 USD；只有持仓市值和盈亏跟随系统 USD/CNY。目标价按 `user_id + symbol` 保存，不进入交易账本或比赛计算。
- 详情页中文标题为“股票趋势”，保留五栏底部导航和安全留白；目标价整卡按压缩放已取消，右上角“编辑”文字、铅笔和箭头已隐藏，但点击整卡编辑不变。
- “关键事件”不再显示“自动读取”，“最近交易记录”不再显示“正式账本 · 只读”；持仓和交易数据读取边界未变。
- 成本至目标进度保留真实有符号数值：现价低于平均成本时可显示负数，但视觉标记仍限制在 `0–100%`轨道内。
- 公司 Logo 已与首页共用缓存和回退链；单一来源失败后会继续尝试 EODHD 大小写、FMP 和 Finnhub，成功后写入现有本地缓存。
- 股票趋势默认展示五年真实周收盘，约 260 个数据点使用 `0.95px` 细绿线、无发光和弱填充；`1.15px` 金色 MA200 周线贯穿图表，点击可同时读取股价、周涨跌和当周已锁定均线。
- 1月、3月、6月和1年走势图使用真实复权日收盘与蓝色 MA200（日）；日均线由完整历史预热后再裁剪可见区间，图例和 tooltip 随日/周周期切换，不新增 provider 请求。
- 走势图右端不再重复显示最新股价气泡；末端绿点增加与股票详情页同节奏的 `3.2s` 独立呼吸光环，原圆点大小、头部主股价和点击历史价格 tooltip 不变，并遵循系统 reduced-motion 设置。
- MA200 周线由按需获取的十年复权收盘预热计算，只推进已完成交易周；未收盘周不会改写锁定值，行情源失败与真实历史不足分别显示“暂不可用”和周数进度。普通首页行情仍保持原 380 天历史窗口。
- 关键指标已取消 20 日波动率，改为无分割线的 52 周高点、MA200（日）、EMA30（日）与独立 MA200 周线详情，周线面板展示距均线、近四周变化、连续状态和锁定日期。
- 生产 `watchlist.target_price_usd numeric(18,6)` 已 database-first 迁移；正数约束、RLS、原 5 条 policy、76 条既有数据和 0 条非空目标价均完成 postflight，未改变既有行。
- 生产详情页分包 `/assets/WatchlistStockDetailPage-C99AtbSx.js` 返回 `200`，保留目标价整卡编辑入口和编辑器边界，不再引用三处已删除的可见尾标；日/周 MA 线、动态 `price-daily-ma` 图例、`watchlist-stock-price-breathe` 呼吸动画和 reduced-motion 边界仍在，Settings/changelog 仍为 `v10.7.9.362`。
- 本机真实 Xcode iOS Simulator 已验证默认五年图、联动 tooltip 与周线指标面板；截图在忽略目录 `outputs/ios-simulator/watchlist-weekly-ma-production-v360-*.png`。
- 本次末端标签精简的 Simulator 截图：`outputs/ios-simulator/watchlist-weekly-ma-no-end-price-v361.png`。
- 本次日/周均线切换的真实 Simulator 截图：`outputs/ios-simulator/watchlist-real-daily-ma200-1m-v1.png`、`watchlist-real-daily-ma200-tooltip-1m-v1.png` 和 `watchlist-real-weekly-ma200-5y-v1.png`。
- 本次末端圆点呼吸效果的真实 Simulator 双帧：`outputs/ios-simulator/watchlist-endpoint-breathe-frame-a.png`、`watchlist-endpoint-breathe-frame-b.png`。

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
