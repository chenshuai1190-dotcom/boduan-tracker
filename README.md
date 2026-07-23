# Quote / boduan-tracker

个人理财 PWA，用于美股交易记录、资产复盘、行情信号、收益报表和内部收益比赛。

## 三份权威文档

日常开发只维护以下三份核心文档，职责不得重复：

1. `README.md`：稳定的产品、架构、环境和安全边界。
2. `docs/development-process.md`：唯一开发与生产发布流程，只定义 `FAST / FULL`。
3. `docs/handoff.md`：当前已验证的生产运行时、版本、风险和下一步。

历史改动由 Git commit、GitHub Actions、Vercel deployment 和 `src/lib/settingsChangelog.js` 承担，不再维护手工长篇开发日志。专题 runbook 可以保留在 `docs/`，但不属于接手必读链。

## 技术栈

- React 18 + Vite + Tailwind CSS
- Supabase Auth + Postgres + RLS
- Vercel Serverless Functions / Cron
- EODHD、SEC EDGAR、Yahoo Finance、CNN FGI 等服务端数据源
- iOS Home Screen PWA

生产地址：`https://boduan-tracker.vercel.app`

## 本地启动

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
npm ci        # 仅首次工作区、node_modules 缺失或 lockfile 变化
npm run dev
```

以下命令只按需运行，不要在同一工作区反复执行：

```bash
npm run verify:workspace-state   # 首次接手或工作区状态不明
npm run verify:toolchain         # 首次接手、换机或工具链异常
npm run verify:local-env         # 任务确实需要真实本地环境
npm run bootstrap:local-env      # 缺 .env.local 且任务确实需要
npm run bootstrap:vercel-link    # 任务确实需要 Vercel CLI link/env
```

任何 presence 检查都不得打印 token 或 `.env` 内容。

## 一键检查

```bash
npm run check:docs   # 纯文档
npm run check:fast   # FAST 代码；受影响测试按任务先单独运行
npm run check:full   # FULL 本地完整门禁
```

具体判定见 `docs/development-process.md`。

## 稳定架构边界

| 范围 | 唯一边界 |
| --- | --- |
| 正式股票交易 | `stock_trades` |
| 独立波段 V2 | `swing_waves` |
| 旧波段记录 | `trades` |
| 摊薄成本工具 | `cost_basis_trades` |
| 个人收益快照 | `pnl_report_*` tables / APIs |
| 内部收益比赛 | `community_competition_*`、独立 API/Cron、publication marker |
| 财报日历 | `/api/earnings-calendar` |
| 行情和涨跌榜 | 已登录 `/api/quote` 与服务端 relay |

这些边界不得为了复用 UI 或保存函数而重新耦合。正式交易、波段和摊薄工具必须使用显式 scope，不能把数据写入错误账本。

- Vercel Hobby 必须保持不超过 12 个独立函数。三个 `/api/close-snapshot-schedule*` 路径通过 rewrite 复用现有受保护 scheduler；不要为同一 Cron 随意新增函数。
- 所有本地业务缓存必须带 authenticated `user.id`。多账户 session vault 不保存密码，账户切换必须按 user ID remount，禁止上一账户数据短暂渲染到下一账户。
- 邀请注册必须先原子创建完整 `community_profiles`，再消费邀请码；任一步失败都回滚新 Auth 用户。完成资料不等于自动加入收益比赛。

## 永久安全规则

- GitHub `main` 是唯一代码源头。禁止直接在 Vercel、浏览器控制台或临时服务器文件中改代码。
- `EODHD_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET` 只能存在于服务端环境；不得放入任何 `VITE_` 变量、日志、截图、测试夹具或仓库文件。
- SEC EDGAR 只能由服务端访问；可选 `SEC_USER_AGENT` 覆盖值不得放入任何 `VITE_` 变量或客户端代码。
- `/api/quote`、`/api/earnings-calendar`、P&L、比赛和 realtime relay 必须保持登录鉴权；Cron 和修复入口必须保持 `CRON_SECRET` 保护。
- 浏览器不得直连或暴露付费行情 token。BTC、指数和股票 realtime 统一走已登录服务端 relay。
- 所有用户表必须保持 owner scope。任何 `auth.uid()`、`user_id`、grant、policy、SECURITY DEFINER、trigger、schema 或 migration 变化都属于 FULL。
- 提交 SQL 文件不会自动修改生产数据库。生产 migration/backfill 必须明确授权，执行前后都要有聚合级 preflight/postflight 和回滚方案。
- 生产验证不得输出 user id、邮箱、持仓、交易明细、密钥或完整财务金额。

## 金融与比赛不变量

- 正式收益、持仓、汇率、QQQ 对比和比赛排名只使用权威账本与真实 provider 数据；缺数据必须 fail closed，不使用 mock、估算、实时价或旧收盘价冒充正式结果。
- 个人收益与内部比赛是两条独立链路。比赛只读正式 `stock_trades`，只写比赛表和脱敏 publication marker，不修改正式账本或个人收益快照。
- 比赛快照使用 ledger revision/hash/CAS 和数据库权威时间；已锁定行不可覆盖或删除。
- publication marker 只能在目标日 exact complete batch 后推进。部分成员完成、缺 QQQ、缺精确 EOD 或 provider 失败都不得发布新榜。
- D1 forward-only rebaseline 不写收益；只有下一真实收盘 D2 且账本未变时才可能生成首张锁定快照。
- 自动收盘任务以 `America/New_York` 为准，正式窗口前不得提前生成当日结果；显式修复日期仍必须验证真实 SPY 交易日和精确收盘。

## 产品实现规则

- 用户可见系统文案必须同步简体中文与 English；用户自己写的备注、目标、账户名等保持原文。
- 新增、保存、删除、同步、导入和导出必须防重复提交，并给出明确成功或失败反馈。
- 核心体验使用应用内受控弹窗、菜单和 toast，不使用 `alert`、`confirm`、`prompt` 承载正式流程。
- 需要交付静态 HTML 或页面截图作为视觉证据时，必须通过 localhost 在本机真实 Xcode iOS Simulator 的 Safari 中打开并截图。桌面浏览器、Codex 内置浏览器、响应式视口以及手工伪造的 iOS 状态栏都不能作为截图证据。纯文案、颜色、图标和简单样式不强制制作截图。

## 环境变量

Frontend：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server：

- `EODHD_API_KEY`
- `SEC_USER_AGENT`（SEC EDGAR 公平访问标识；建议包含应用名与可联系邮箱）
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `QUOTE_API_AUTH_REQUIRED=true`
- `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`

## 关键代码位置

- 应用入口与全局编排：`src/App.jsx`
- 数据访问：`src/lib/db.js`
- 行情入口：`api/quote.js`、`server/quote/`
- 财报：`api/earnings-calendar.js`
- 收益快照：`api/pnl-report-daily-snapshot.js`、`server/pnl*`
- 收益比赛：`api/community-competition.js`、`server/communityCompetition*`
- 数据库/RLS：`supabase/`
- 部署与 Cron：`vercel.json`
- 自动验证：`tests/`、`scripts/`

## 当前生产状态

不要在 README 复制 runtime、Actions、Vercel ID 或最新 marker。当前已验证状态只写在 `docs/handoff.md`。
