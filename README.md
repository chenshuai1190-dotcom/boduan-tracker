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
| 投资对比小工具 | 交易 → 全部功能 → 独立页面；只读 `/api/quote?view=investment-comparison` 与 `investment-search`，不连接交易账本 |

这些边界不得为了复用 UI 或保存函数而重新耦合。正式交易、波段和摊薄工具必须使用显式 scope，不能把数据写入错误账本。

- Vercel Hobby 必须保持不超过 12 个独立函数。三个 `/api/close-snapshot-schedule*` 路径通过 rewrite 复用现有受保护 scheduler；不要为同一 Cron 随意新增函数。
- 所有本地业务缓存必须带 authenticated `user.id`。多账户 session vault 不保存密码，账户切换必须按 user ID remount，禁止上一账户数据短暂渲染到下一账户。
- 投资对比只接受经服务端验证身份的美元美股普通股和 ETF，使用 EODHD `adjusted_close`；两个标的在所选年份后的首个共同交易日等额一次买入。总资产包含本金，累计盈亏不含本金；年度收益以此前年度最后一个有效收盘为基数，首年从实际买入日计算。允许碎股，不计税费或汇率；缺失、上市前和未完成交易日不能补造价格，旧行情必须明确标记待更新。此工具不创建订单、不保存持仓，也不写收益或比赛快照。
- 投资时光机的“资产增长”与“回撤与修复”共用标的、参数和同一份已核验日线，切换分析不增加 provider 请求。回撤从所选区间内的运行前高计算，修复以首次实际收盘达到该前高为准；恢复前高与回到投入本金分别统计，时长使用自然日，尚未修复只计至最后观测日，不预测修复日期。
- 持仓重叠体检是交易全部功能中的独立只读工具，位于投资时光机之后，复用 `investmentSummary.activePositions` 的正式股票/ETF 持仓及估值。以全部股票/ETF 市值为分母，不含现金、银行资产或融资负债；缺报价时不计算完整总额与占比。QQQ/SPY 仅穿透官方披露中可识别的股票/ADR，保留披露日期、来源和未识别份额，不归一化、不将未支持基金当成普通股；TQQQ 单列而不按三倍 QQQ 展开。标的按证券代码汇总，不推断发行人合并。自定义试算仅在组件内存中，不写账本；API 只接收代码，不发送用户持仓金额或数量。
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
- 美国上市公司财报结构只读取 SEC EDGAR 官方文件：已核验专用适配器优先，通用解析要求 PRIMARY Inline XBRL 的 filing/DEI CIK、官方财期与 USD unit 一致。10-Q 支持严格当季事实；10-K 只有明确 DEI Q4 及直接披露的当季事实才允许，不能把全年/累计期改称单季或猜测差分。当期收入独立唯一勾稽后即可展示；同比、分部经营利润分别校验，缺失或不能证明可比时保留 null，不牵连已验证收入、不冒用不同利润口径。仅同一文档、同期间/币种/收入总额且原因明确未支持/未识别的区块可由通用结果补齐，不能绕过专用解析的歧义拒绝。冲突、多解、层级重叠仍 fail closed，不使用 EODHD 结构化财务、adjusted/non-GAAP、券商数字或推测补齐。定期报告无法解析时最多尝试一份匹配的业绩公告，8-K/6-K 优先财报附件；共用 SEC 请求时限与限速，不跨文件混拼数据。详情不完整结果及业绩公告阶段缓存 5 分钟，完整定期报告 6 小时；实例内并发请求合并、浏览器缓存按用户和解析器版本隔离。
- 自选 SEC 自动覆盖使用独立 service-only 队列和公开结果缓存，不读取或修改持仓金额；注册事件必须匹配已认证用户的当前自选，后台仅扫描去重代码。`SEC_EARNINGS_AUTO_COVERAGE_ENABLED` 默认关闭，必须先获准应用 foundation SQL、部署并验收后才能启用。每日有界扫描不代表分钟级同步，也不代表所有公司都解析成功；新申报发现后旧 accession 过期，不完整/不支持/临时失败仍明确区分。启用、成本和验证边界见 `docs/sec-earnings-auto-coverage.md`。
- TSM 业绩趋势只由服务端读取 `TSM.US` 的 EODHD Fundamentals TWD Income Statement，并用单次 `USDTWD.FOREX` 历史序列按各财年/季度期间平均收盘汇率转换为 USD；转换后重新计算同比、环比与复合增速，净利率保持原报表口径。公司身份、报表币种、filing date、连续期间或汇率覆盖冲突时必须 fail closed，不得使用即时汇率、`2330.TW` 请求或其他备用源。业务平台、地区和制程结构只能读取台积电官方 Management Report，缺少官方披露时显示不可用，不得推测。
- 盘前和盘中持仓展示可使用 EODHD 实时价；收盘锁定后，交易页持仓价格、市值、持仓/累计盈亏、总资产、占比和排序必须统一使用 EODHD 明确完成收盘价。原始实时价只保留给交易录入默认值和试算等实时语义，不得混入收盘估值。
- 个股收益详情必须分离即时账本事实与收盘收益事实：正式交易新增、金融字段修改或删除成功后，交易记录与交易统计立即按当前 `stock_trades` 重算，区间上限使用 `America/New_York` 当前日期且不得提前显示未来交易；个股头部收益、持仓数量与金额、收益走势、图表交易节点、相对 QQQ 和历史收益快照仍只能使用最新权威完成收盘快照，不得被当天盘中交易提前改写。
- 个股与 QQQ 收益对比固定当前持仓周期的原始对比起点，但只计算当前仍存续的仓位。正式交易新增、修改或删除后，必须先按交易顺序反推出最终仍持有的买入份额，再从原起点完整重算：卖出部分、对应 QQQ 仓位及其已实现盈亏从整段对比中剔除，后续买入只按最终存续成交额等额加入 QQQ。既有交易自动参与，禁止要求用户重复提交历史买卖；该口径不得改变账户累计盈亏、持仓成本、个人收益报表或比赛账本。
- “总资产走势”中的净资产只使用每日收盘总资产与数据库按目标交易日美东 `17:00` 锁定的融资事件计算；历史融资补录必须使用明确核验的账户、金额来源与生效时间清单，未核验账户和更早日期保持未知，不拿当前融资余额猜测全年历史，也不改变收益、QQQ、比赛或交易账本口径。
- 个人收益与内部比赛是两条独立链路。比赛只读正式 `stock_trades`，只写比赛表和脱敏 publication marker，不修改正式账本或个人收益快照。
- 个人收益报表以正式 `stock_trades` 为唯一账本。新增、删除或修改金融字段时，数据库必须在同一事务推进 ledger revision，并从新交易日、旧交易日或两者较早者标记 dirty；仅修改名称或备注不得触发重算。
- 个人收益重算只能由服务端读取 EODHD 已完成收盘日线完成。正常交易日缺少目标日精确 K 线时继续保留 dirty 和上一份完整报表，不得后退一天、改用实时价、Yahoo 或其他备用源；正常 NYSE 节假日可复用此前最后一个真实 SPY 会话，但节假日后的新交易仍须等待下一份真实完成收盘。
- 个人收益从最早 dirty 日期到最新可用完成收盘采用分块暂存、ledger revision CAS 和单事务切换；成功前继续显示旧报表，空账本则通过同一原子提交明确清空全部个人收益快照。正式交易新增、金融字段修改或删除成功后的交易保存链路，是浏览器唯一允许发起一次即时重算的位置；收益报表页面在 mount、focus、pageshow 和恢复前台时只能读取数据库权威快照，不得触发个人历史重算或 EODHD rebuild。即时请求等待或失败不得回滚已经成功保存的正式交易，遗留 dirty 只由既有收盘任务继续消费。
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
- 股票趋势的 MA50（周）与 MA200（日/周）只能使用已完成收盘数据；进行中交易周不得推进周线均值、趋势状态或连续周数，盘中价不得改变正式信号。
- 核心体验使用应用内受控弹窗、菜单和 toast，不使用 `alert`、`confirm`、`prompt` 承载正式流程。
- 需要交付静态 HTML 或页面截图作为视觉证据时，必须通过 `127.0.0.1` / localhost 的本机服务在真实 Xcode iOS Simulator 中打开，并只对最终状态和受影响页面验收一次。普通布局使用 Simulator Safari；PWA lifecycle、缓存和恢复必须使用已安装的 Home Screen PWA。纯文案、颜色、图标和简单样式不默认截图。
- 凡需视觉验收或用户要求截图，统一使用 Simulator 原生屏幕截图能力，在 `@3x` iPhone 上导出并交付 Simulator 直接生成、未经二次压缩、转码或缩放的原始整屏无损 PNG；交付前必须核验真实格式为 PNG，且像素尺寸等于设备逻辑屏幕尺寸的 3 倍，例如 `402×874 pt` 对应 `1206×2622 px`。不得用桌面浏览器、响应式视口、Codex 内置浏览器、浏览器 `deviceScaleFactor`、macOS 上的 Simulator 窗口截图、`1x` 图片放大、JPEG/WebP 改后缀或伪造状态栏冒充 iOS 证据。

## 环境变量

Frontend：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server：

- `EODHD_API_KEY`
- `SEC_USER_AGENT`（SEC EDGAR 公平访问标识；建议包含应用名与可联系邮箱）
- `SEC_EARNINGS_AUTO_COVERAGE_ENABLED`（仅服务端，默认关闭；foundation/启用流程见专项文档）
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
