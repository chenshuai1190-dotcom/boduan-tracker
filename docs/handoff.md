# boduan-tracker 当前交接

验证时间：`2026-07-19 Asia/Shanghai`

本文件只保存当前已验证生产状态、风险和下一步。历史查 Git、GitHub Actions、Vercel 和 `src/lib/settingsChangelog.js`；稳定边界看 `README.md`；流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 生产运行时代码 | `fdb5dc2210118a73b2941aaaf68596d8d07407e7` |
| 设置页版本 | `v10.7.9.358` |
| 生产入口 | `/assets/index-mtzsmD1D.js` |
| Runtime Actions | `29688393119` success |
| Runtime Vercel | `AEk66g6KBdMMkrLdkGGbzfEENe6K` success |

已验证：

- `npm run verify:deploy-status -- fdb5dc2`：PASS。
- 未登录 `/api/quote?symbols=VIX`：`401`。
- 未登录 `/api/quote?symbols=NVDA&view=stock-detail`：`401`。
- 未登录 `/api/earnings-calendar?symbols=NVDA`：`401`。
- 首页“自选”中只有股票图标、代码和名称区域进入独立详情页；价格、涨跌、回撤、“持仓”页和排序区域不触发。
- 详情页股票价格、技术指标、目标价、平均成本和交易记录固定为 USD；只有持仓市值和盈亏跟随系统 USD/CNY。目标价按 `user_id + symbol` 保存，不进入交易账本或比赛计算。
- 生产 `watchlist.target_price_usd numeric(18,6)` 已 database-first 迁移；正数约束、RLS、原 5 条 policy、76 条既有数据和 0 条非空目标价均完成 postflight，未改变既有行。
- 生产详情页分包 `/assets/WatchlistStockDetailPage-BKKzS-Lh.js` 返回 `200`，Settings/changelog 为 `v10.7.9.358`。

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
