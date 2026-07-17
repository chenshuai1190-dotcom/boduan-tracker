# boduan-tracker 当前交接

验证时间：`2026-07-18 Asia/Shanghai`

本文件只保存当前已验证生产状态、风险和下一步。历史查 Git、GitHub Actions、Vercel 和 `src/lib/settingsChangelog.js`；稳定边界看 `README.md`；流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 生产运行时代码 | `eff19f34b9a27688ba863c79ecf56a8f48a25859` |
| 设置页版本 | `v10.7.9.352` |
| 生产入口 | `/assets/index-MUBSO0ki.js` |
| Runtime Actions | `29494393256` success |
| Runtime Vercel | `2NwyNBCGvcc48oh8FqsYPfB1ogx4` success |

已验证：

- `npm run verify:deploy-status -- eff19f3`：PASS。
- 未登录 `/api/quote?symbols=VIX`：`401`。
- 未登录 `/api/earnings-calendar?symbols=NVDA`：`401`。
- 生产 Settings/changelog 为 `v10.7.9.352`；比赛页显示“本日收益率 / 收益率排行榜”及对应英文，收益、QQQ、排序、快照、缓存和 API 不变。

## 收益比赛当前状态

- 最新 publication marker：`2026-07-16`。
- marker version：`31b0baa76b324a02ba75e053a647e8f9`。
- `completed_at`：`2026-07-16 21:22:30.662204+00`。
- active / expected / complete：`9 / 9 / 9`。
- missing / absent / invalid / unexpected：全部 `0`。
- 2026-07-14：expected `8` / complete `8` / missing `0`。
- 2026-07-15：expected `9` / complete `9` / missing `0`。

本次回查发生在 2026-07-17 美东 16:00 正式收盘后、17:00 快照窗口前，因此不对 07-17 完整性作提前声明。后续只在正式窗口与 scheduler 完成后核对 exact complete batch，不得覆盖锁定行或人工补造收益。

## 当前风险与下一步

1. 下一次需要比赛数据证据时先只读确认最新 marker；不要假定仍停在 07/16，也不要在美东 17:00 前判断当日缺失。
2. iOS Home Screen PWA 登录态恢复只在相关生命周期、cache 或交互变化时使用 Simulator 复测，不作为无关改动门禁。
3. competition rebaseline 的真实 scheduled D1/D2 观察继续 fail closed，只报告聚合结果。
4. `src/App.jsx`、`src/lib/db.js` 和行情 provider 仍较集中；只在明确任务中小步拆分，不顺手大重构。
5. 安全债务仍包括其余用户表 RLS metadata、`community_profiles` 双用户隔离 smoke、关键 API/组合计算测试和响应/schema 校验；只在相关 FULL 任务或稳定 admin channel 可用时推进。
6. Supabase 目前仍没有自动 migration runner；任何 SQL 继续按明确授权、database-first、preflight/postflight 执行。

## 接手入口

只读三份权威文档：`README.md`、`docs/development-process.md`、`docs/handoff.md`。首次新工作区再运行 workspace/toolchain 检查；连续开发按流程直接进入目标文件，不重复接手仪式。
