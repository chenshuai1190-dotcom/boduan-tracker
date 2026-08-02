# Quote / boduan-tracker

个人理财 PWA，用于美股交易记录、资产复盘、行情信号、收益报表和内部收益比赛。

## 三份权威文档

日常开发只维护以下三份核心文档，职责不得重复：

1. `README.md`：稳定的产品、架构、环境和安全边界。
2. `docs/development-process.md`：唯一开发与生产发布流程，只定义 `DOCS / FAST / FULL`。
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

以下命令是故障诊断或首次本地环境准备，不属于日常 gate，同一工作区不得反复执行：

```bash
npm run doctor:workspace  # 首次新工作区或状态确实不明
npm run doctor:toolchain  # 换机、工具缺失或发布权限异常
npm run doctor:env        # 任务确实需要真实本地环境
npm run setup:local-env   # 缺 .env.local 且任务确实需要
```

任何 presence 检查都不得打印 token 或 `.env` 内容。

## 一键检查

```bash
npm run check:docs   # 纯文档
npm run check:fast   # FAST 代码
npm run check:fast -- tests/<相关测试>.test.js # 同一次 gate 接入定向测试
npm run check:full   # FULL 本地完整门禁
npm run verify:typography # 单独检查字号下限
npm run release:verify -- <docs|fast|full> <commit> # 一次等待发布结果
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
- 盘前和盘中持仓展示可使用 EODHD 实时价；收盘锁定后，交易页持仓价格、市值、持仓/累计盈亏、总资产、占比和排序必须统一使用 EODHD 明确完成收盘价。原始实时价只保留给交易录入默认值和试算等实时语义，不得混入收盘估值。
- 个股与 QQQ 收益对比固定当前持仓周期的原始对比起点。正式交易新增、修改或删除后必须从该起点按交易日期完整回放现有账本：后续买入给 QQQ 等额加仓，卖出按卖出前持仓比例同步减仓；双方收益率统一使用从起点起累计投入本金，卖出不得缩小分母。既有交易自动参与重算，禁止要求用户重复提交历史买卖。
- “总资产走势”中的净资产只使用每日收盘总资产与数据库按目标交易日美东 `17:00` 锁定的融资事件计算；历史融资补录必须使用明确核验的账户、金额来源与生效时间清单，未核验账户和更早日期保持未知，不拿当前融资余额猜测全年历史，也不改变收益、QQQ、比赛或交易账本口径。
- 个人收益与内部比赛是两条独立链路。比赛只读正式 `stock_trades`，只写比赛表和脱敏 publication marker，不修改正式账本或个人收益快照。
- 个人收益报表以正式 `stock_trades` 为唯一账本。新增、删除或修改金融字段时，数据库必须在同一事务推进 ledger revision，并从新交易日、旧交易日或两者较早者标记 dirty；仅修改名称或备注不得触发重算。
- 个人收益重算只能由服务端读取 EODHD 已完成收盘日线完成。正常交易日缺少目标日精确 K 线时继续保留 dirty 和上一份完整报表，不得后退一天、改用实时价、Yahoo 或其他备用源；正常 NYSE 节假日可复用此前最后一个真实 SPY 会话，但节假日后的新交易仍须等待下一份真实完成收盘。
- 个人收益从最早 dirty 日期到最新可用完成收盘采用分块暂存、ledger revision CAS 和单事务切换；成功前继续显示旧报表，空账本则通过同一原子提交明确清空全部个人收益快照。客户端即时请求失败不得回滚已经成功保存的正式交易，登录态重试和收盘任务必须最终消费遗留 dirty。
- 比赛快照使用 ledger revision/hash/CAS 和数据库权威时间。正常发布批次不就地覆盖；只有已登录用户成功修改自己的正式账本后，服务端才能通过 service-role 原子 RPC 完整替换该成员的当前比赛序列与同日 publication marker。
- publication marker 只能在目标日 exact complete batch 后推进。部分成员完成、缺 QQQ、缺精确 EOD 或 provider 失败都不得发布新榜。
- 首次自愿参赛仍从加入后的下一份完成收盘快照开始。已参赛用户可自由新增、修改或删除自己的正式交易；成功保存后立即按 `trade_date` 重建至当前已发布的完成收盘日，不因 created_at、盘中/收盘后、周末或“下一日才入榜”限制延后生效。
- 即时重算仍只接受 USD、正数价格/数量、非负费用、无超卖的正式账本，并只使用 EODHD 已完成收盘日线（`adjusted_close` 优先）。名称和备注不进入 canonical ledger hash，不触发重算；EODHD、并发 CAS 或数据库写入失败时必须保留上一份完整榜单并稍后重试。
- 自动收盘任务以 `America/New_York` 为准，正式窗口前不得提前生成当日结果；显式修复日期仍必须验证真实 SPY 交易日和精确收盘。

## 产品实现规则

- 用户可见系统文案必须同步简体中文与 English；用户自己写的备注、目标、账户名等保持原文。
- 字号层级统一以首页为准：主模块资产类头部标题使用 `14px / white 70%`，主金额使用 `clamp(28px, 8.7vw, 34px)`，普通说明使用 `12px / white 50%`，时间、口径和次级信息使用 `11–12px / white 40%`，实体副标题使用 `11px / white 35%`，同类字段标签使用 `13px / white 50%`。
- 徽章、图表刻度、tooltip 和紧凑控件允许使用 `10px`，但任何可见文字不得小于 `10px`；禁止重新引入 `8px`、`8.5px`、`9px` 或 `9.5px` 字号。
- `npm run verify:typography` 是 FAST 与 FULL 的固定门禁，扫描 `src/` 中 Tailwind 任意字号、CSS `font-size` 和内联 `fontSize`。
- 新增、保存、删除、同步、导入和导出必须防重复提交，并给出明确成功或失败反馈。
- 盘中动态价格优先使用已登录 WebSocket；历史日线等已完成收盘数据必须按 `symbol + 最新已完成收盘日` 缓存，同一收盘版本不得被 10 秒轮询、focus、pageshow 或 tab 切换反复读取。Provider 额度异常必须熔断并保留最近有效数据，禁止用 `0` 覆盖。
- 核心体验使用应用内受控弹窗、菜单和 toast，不使用 `alert`、`confirm`、`prompt` 承载正式流程。
- 需要交付静态 HTML 或页面截图作为视觉证据时，必须通过 localhost 在本机真实 Xcode iOS Simulator 中打开，并只对最终状态和受影响页面验收一次。普通布局使用 Safari；PWA lifecycle、缓存和恢复必须使用已安装的 Home Screen PWA。复用已启动的服务与 Simulator，不得用桌面浏览器、响应式视口、Codex 内置浏览器或伪造状态栏冒充 iOS 证据。纯文案、颜色、图标和简单样式不强制截图。

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
- 当前设置页版本：`src/lib/releaseMeta.js`
- 部署与 Cron：`vercel.json`
- 自动验证：`tests/`、`scripts/`

## 当前生产状态

不要在 README 复制 runtime、Actions、Vercel ID 或最新 marker。当前已验证状态只写在 `docs/handoff.md`。
