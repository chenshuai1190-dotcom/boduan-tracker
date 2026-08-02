# boduan-tracker 当前交接

验证时间：`2026-08-03 Asia/Shanghai`

本文件只保存当前基准、关键风险和下一步。稳定规则看 `README.md`，流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 运行时代码 | `v10.7.9.414`：v413 稳定运行时 + 股票趋势在 1 年/5 年视图追加 MA50（周）与巴菲特指标；原股价、MA200（日/周）和完成收盘口径保持不变；精确发布提交以 GitHub `main` HEAD 为准 |
| 数据库 | 保留既有 additive schema，并已按顺序接入比赛 migration、个人收益 foundation `pnl_report_immediate_rebuild_20260801.sql` 与 runtime 后 contract `pnl_report_snapshot_write_contract_after_runtime_20260801.sql` |
| 发布完成条件 | GitHub `main` 的同一份 runtime 与上述 migration 均已上线并通过聚合 postflight；只完成其中一项不得宣布上线 |

本地发布门禁：

- 收益比赛最终独立审查：`121 / 121` tests PASS，核心实现 `must-fix = 0`。
- 个人收益正确重算专项：`131 / 131` tests PASS；独立 runtime/SQL 审查 `must-fix = 0`，6 份 SQL 的 PostgreSQL/PLpgSQL 解析、canonical 同步和列值数量检查均通过。
- 个股/QQQ 当前存续仓位专项：`35 / 35` tests PASS；多次减仓、同日顺序、周末/常规 NYSE 节假日加仓和全清重买均覆盖，最终独立审查 `must-fix = 0`。
- 个人收益只读页面专项：`57 / 57` tests PASS；交易 mutation 与收盘 Cron 保留重算所有权，报表 mount/focus/pageshow 不再触发重算或显示常驻重试。
- 个股即时交易事实专项：`34 / 34` tests PASS；当天新增、修改、删除和纽约日期上限均覆盖，收盘收益、持仓、趋势、图表节点与 QQQ 边界保持不变。
- 股票趋势 MA50 周线专项：`73 / 73` tests PASS；完成周锁定、50–199 周独立可用、1 年/5 年曲线组合及原曲线保留均覆盖。
- `npm run check:full`：`873 / 873` tests PASS；字号下限、Vite production build、whitespace 和三份权威文档一致性均通过。
- 新的开发、验证和单等待器发布流程继续保留，没有恢复旧六文档或重复验证流程。

## 交易持仓收盘估值

- 盘前和盘中继续保留 `/api/quote` 返回的 EODHD 实时 `price`，交易录入默认价和持仓试算仍使用这份实时语义。
- 收盘锁定后新增独立 `valuationPrice`：交易页持仓价格、市值、持仓/累计盈亏、总资产、占比和默认市值排序统一使用 `dailyPnlPrice` 的 EODHD 完成收盘，与首页一致。
- 新完成收盘暂缺时，估值只保留最近一份明确的 EODHD 完成收盘字段，界面显示不可用；不得回退 delayed `price`，也不得用 `0` 覆盖最近有效估值。
- 今日盈亏仍独立使用 `dailyPnlPrice - dailyPnlBaselineClose`；个人收益报表仍读取数据库完成收盘快照，本次不修改其计算或数据。
- 本次没有接入 Yahoo 或其他备用行情源，没有修改 `/api/quote` provider、正式交易、个人收益快照、比赛账本或生产财务数据。

## 个人收益正确重算

- 正式交易新增、删除或金融字段修改成功后，个人收益从最早受影响交易日即时重算；修改名称或备注不触发。
- 重算只从服务端读取 EODHD 已完成收盘日线，不使用 Yahoo、实时价或其他备用源；正常交易日目标 K 线未到时返回等待并保留 dirty，不回退到旧日期冒充当日结果。
- 旧报表在分块重建期间保持可见，完整序列通过 ledger revision CAS 原子替换；空账本也通过原子操作明确清空。客户端请求是非阻塞派生动作，失败不会回滚已保存的正式交易。
- 正式交易新增、金融字段修改或删除成功后，交易保存链路只发起一次已登录即时重算。收益报表打开、重新打开、focus、pageshow 和恢复前台时只读取数据库权威快照，不再触发个人历史重算或 EODHD rebuild，也不显示常驻重试提示；等待或失败时保留 dirty 与上一份完整报表，由收盘任务继续消费。个人收益、比赛、实时持仓估值与正式交易账本仍是独立链路。
- schema 分为 `pnl_report_immediate_rebuild_20260801.sql` foundation 和 `pnl_report_snapshot_write_contract_after_runtime_20260801.sql` contract。生产严格按 foundation migration → 精确 runtime 部署/验证 → contract migration → 聚合 postflight 执行；contract 不得提前执行。

## 个股收益详情即时账本

- 正式交易新增、金融字段修改或删除成功后，个股详情直接从当前 `stock_trades` 重建交易记录、买入/卖出金额与买入/卖出次数，不等待个人收益快照或当天收盘。
- 交易事实的区间上限使用 `America/New_York` 当前日期；纽约未来日期的交易不会提前显示。修改数量、价格或日期后立即按完整账本顺序重算实现盈亏，删除后立即移除。
- 个股头部累计/已实现/未实现收益、持仓数量、持仓金额、收益走势、图表交易节点、持仓周期和相对 QQQ 继续只读取最新权威完成收盘快照；当天尚未进入快照的交易不得映射到上一收盘点，也不得提前改变这些收盘结果。
- 本次不修改正式交易保存、个人收益重算、EODHD provider、比赛、数据库 schema、收盘任务或缓存策略。

## 股票趋势 MA50 周线

- 股票趋势的 1 年视图保留股价和 MA200（日），5 年视图保留股价和 MA200（周）；两个视图均追加紫色 MA50（周），1 月、3 月和 6 月不显示 MA50。
- 关键指标新增 `MA50（周）` 卡片和紫色 `巴菲特指标` 徽章；既有 `MA200（周）` 卡片、金色 `芒格指标` 徽章及所有原曲线继续保留。
- MA50 只使用已完成交易周的收盘价，进行中周不得推进曲线、状态或连续周数；50–199 周历史允许 MA50 独立 ready，MA200 继续明确显示历史不足。
- 计算复用既有已登录 stock detail EODHD 历史响应，不新增 provider 请求、不接入备用行情源，也不修改数据库、正式交易、收益、持仓或比赛口径。

## 个股与 QQQ 收益对比

- 当前持仓周期固定使用最初的正式对比起点，但整段对比只保留当前仍存续的仓位。切换本年、近 1 月、近 6 月或近 1 年只影响页面其他报表范围，不得重置对比起点。
- 正式交易新增、修改或删除后，按 `trade_date`、`created_at` 和稳定账本顺序反推出最终仍持有的买入份额，并从原起点自动完整重算；既有卖出禁止要求用户重复提交。
- 每次卖出按卖出前持仓比例从当时已有的买入批次和对应 QQQ 仓位中同步剔除；卖出部分及其已实现盈亏不再计入整段对比。后续买入只按最终存续的成交金额等额加入 QQQ。
- 周末和常规 NYSE 节假日的后续买入映射到下一份个股/QQQ 共同普通完成收盘；正常交易日任一侧精确收盘缺失时 fail closed，不拿相邻日期、实时价或备用源填补。
- 该口径只影响个股/QQQ 收益对比，不修改账户累计盈亏、持仓成本、个人收益报表、比赛账本、EODHD provider、数据库 schema 或正式交易保存。
- 个股详情监听个人收益快照重算版本并重新读取权威快照，旧异步响应不得覆盖新结果；全部清仓后再次买入自动建立新的当前持仓周期和新对比起点。

## 收益比赛当前状态

- 已参赛用户可自由新增、修改或删除自己的正式 `stock_trades`；成功后立即触发本人比赛重算，不再因写入时间、收盘后、周末或“下一交易日才重新上榜”而延后。
- 历史修改严格按 `trade_date` 进入对应完成收盘区间。周末和正常休市日的交易归入下一份真实 SPY 完成收盘，不生成虚构交易日快照。
- 首次自愿加入仍保持原边界：空账本继续等待；首次有效交易出现后，从对应的下一份真实完成收盘开始排名。已经排名后即使删空账本，也会按完整历史重算并保留合法的 0% 延续。
- 比赛只使用 EODHD 完成日线，`adjusted_close` 优先；不使用 Yahoo、实时价、浏览器上传价格、旧收盘或其他备用源计算比赛收益。
- 正常 Cron、即时重算和 QQQ benchmark 共用公开行情内存缓存：key 为 `symbol + 完成收盘日`，同 key singleflight，长历史覆盖短历史，LRU 上限 96，70 股票多批次不会互相淘汰。
- EODHD 返回 402 后，当前 Vercel 实例熔断至下一 UTC 00:00；旧完整榜单继续保留，不写 0、不继续从该实例请求 EODHD REST。
- 每次正式交易 mutation 会由数据库 trigger 推进 ledger revision 并写本人 dirty state。客户端即时请求失败后，dirty state 仍由下一次登录态 GET 或收盘 Cron 重试。
- 本人完整快照序列、ledger revision/hash、dirty state 与同日 publication marker 通过 service-role RPC 原子提交。历史重建失败、并发 mutation、缺精确收盘或 provider 错误都不得发布混合账本榜单。
- 正式交易、个人收益快照、持仓、实时行情、波段记录和摊薄成本仍与比赛子系统隔离；比赛重算不修改这些数据。

## 数据库与发布边界

- migration 新增 service-only rebuild state、不可变 audit、正式交易 dirty trigger，以及 unpublished snapshot、publication marker、完整个人序列替换三个原子 RPC。
- 普通用户只能修改 RLS 允许的本人正式交易；不能读取 dirty/audit、直接调用 service RPC、直接写比赛快照或 publication marker。
- 生产 migration 是写操作，必须取得用户明确授权；执行前做匿名安全和聚合 preflight，执行后运行 `npm run verify:rls:rest` 并只读核对表、trigger、函数签名、grant 与聚合 dirty 数量。
- migration 为 forward-only。若 runtime 需要回退，保留 additive schema 和 audit；不得回滚生产数据库、删除正式交易或改写历史比赛快照。数据库异常只做新的 forward-fix。

## 当前风险与下一步

### 已知风险

- 比赛公开行情缓存与 402 熔断是 Vercel 单实例内存态，不是跨实例全局缓存；冷启动或不同实例仍可能分别首次读取一次。
- v414 延续收益比赛共享 EODHD 缓存与熔断、交易持仓 EODHD 收盘估值、个人收益正确重算、主 `/api/quote` 的 15/30/60 分钟客户端门控、个股/QQQ 当前存续仓位口径和个人收益只读页面，并复用 stock detail 同一历史响应计算 MA50（周），不增加 EODHD 请求。服务端仍没有 v404 的通用完成收盘缓存和全局 402 熔断；冷实例首次读取与尚未更新的旧客户端仍可能额外消耗 EODHD 额度。
- 个人收益的客户端即时重算请求是交易 mutation 后的一次非阻塞派生动作：正式交易保存成功不会因个人收益暂时失败而回滚，恢复依赖数据库 dirty state 和收盘 Cron，不依赖收益报表页面或浏览器一直存活。比赛仍保持其独立重算链路。
- P&L foundation 与 contract 之间旧 PWA 仍保留原直接写权限，因此 runtime 验证后必须尽快执行 contract；任一步失败都只做 forward-fix。跨 Vercel 实例生成不同时间戳时可能留下多个安全隔离的暂存 job，由 24 小时 TTL 清理，不会混合发布。

## 必须保护的业务边界

- 正式持仓价格、收盘锁定、趋势、相对 QQQ、个人收益和比赛继续只使用规定的 EODHD 正式口径；不得引入备用行情源计算正式持仓或盈亏。
- 个股与 QQQ 收益对比必须固定当前持仓周期起点，但只保留当前存续买入份额；卖出部分、对应 QQQ 及其已实现盈亏必须从整段对比剔除，既有交易不得要求用户重复提交。
- 股票趋势 MA50（周）、MA200、重测、20 日恢复和 60 日结果只使用已完成收盘价，盘中价和进行中周不得改变正式信号。
- iOS Home Screen PWA 继续保持账户隔离缓存首屏、WebSocket 优先、已登录 snapshot 补齐和旧响应不得覆盖新 tick。
- 财报缺少官方分部、细分结构或地区数据时显示不可用，不得推测。
- 可见文字不得小于 `10px`。

### 下一步

1. 低频观察个人收益 dirty 聚合数量、等待原因与重试完成情况；不得读取或披露用户交易明细，不得循环调用 EODHD。
2. 现场只读核验个人收益 schema/RPC/grant、比赛 publication marker、未登录接口与一条已登录读取；旧证据不能代替本次现场结果。
3. 观察应用整体 EODHD 调用量。若主 quote 仍有跨实例或旧客户端重复读取，另行恢复 EODHD-only 的通用门控与缓存，不得改变正式价格来源。
4. 新任务只读 `README.md`、`docs/development-process.md`、`docs/handoff.md`，不要重复旧流程。
