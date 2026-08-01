# boduan-tracker 当前交接

验证时间：`2026-08-01 Asia/Shanghai`

本文件只保存当前基准、关键风险和下一步。稳定规则看 `README.md`，流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 运行时代码 | `v10.7.9.408`：v402 稳定应用树 + 收益比赛正式交易即时重算 + 交易持仓 EODHD 收盘估值统一；精确发布提交以 GitHub `main` HEAD 为准 |
| 数据库 | 保留既有 additive schema，并新增 forward-only `supabase/community_competition_immediate_rebuild_20260801.sql` |
| 发布完成条件 | GitHub `main` 的同一份 runtime 与上述 migration 均已上线并通过聚合 postflight；只完成其中一项不得宣布上线 |

本地发布门禁：

- 收益比赛最终独立审查：`121 / 121` tests PASS，核心实现 `must-fix = 0`。
- `npm run check:full`：PASS；完整测试、字号下限、Vite production build、whitespace 和三份权威文档一致性均通过。
- 新的开发、验证和单等待器发布流程继续保留，没有恢复旧六文档或重复验证流程。

## 交易持仓收盘估值

- 盘前和盘中继续保留 `/api/quote` 返回的 EODHD 实时 `price`，交易录入默认价和持仓试算仍使用这份实时语义。
- 收盘锁定后新增独立 `valuationPrice`：交易页持仓价格、市值、持仓/累计盈亏、总资产、占比和默认市值排序统一使用 `dailyPnlPrice` 的 EODHD 完成收盘，与首页一致。
- 新完成收盘暂缺时，估值只保留最近一份明确的 EODHD 完成收盘字段，界面显示不可用；不得回退 delayed `price`，也不得用 `0` 覆盖最近有效估值。
- 今日盈亏仍独立使用 `dailyPnlPrice - dailyPnlBaselineClose`；个人收益报表仍读取数据库完成收盘快照，本次不修改其计算或数据。
- 本次没有接入 Yahoo 或其他备用行情源，没有修改 `/api/quote` provider、正式交易、个人收益快照、比赛账本或生产财务数据。

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
- v408 只为收益比赛补上共享 EODHD 缓存与熔断，并在客户端统一交易持仓的 EODHD 收盘估值。应用主 `/api/quote` 仍是 v402 行为，没有 v404 的 15/30/60 分钟客户端门控、完整完成收盘缓存和通用 402 熔断，旧客户端或高频页面仍可能再次消耗大量 EODHD 额度。
- 客户端的即时重算请求是非阻塞派生动作：正式交易保存成功不会因比赛暂时失败而回滚。恢复依赖数据库 dirty state、登录态 GET 和 Cron，不依赖浏览器一直存活。

## 必须保护的业务边界

- 正式持仓价格、收盘锁定、趋势、相对 QQQ、个人收益和比赛继续只使用规定的 EODHD 正式口径；不得引入备用行情源计算正式持仓或盈亏。
- 股票趋势 MA200、重测、20 日恢复和 60 日结果只使用已完成收盘价，盘中价不得改变正式信号。
- iOS Home Screen PWA 继续保持账户隔离缓存首屏、WebSocket 优先、已登录 snapshot 补齐和旧响应不得覆盖新 tick。
- 财报缺少官方分部、细分结构或地区数据时显示不可用，不得推测。
- 可见文字不得小于 `10px`。

### 下一步

1. 只有在 migration 与精确 GitHub `main` runtime 均完成后，运行一次 FULL 发布等待器并记录 CI、Docs 和 Vercel 结果。
2. 上线后只做低频、聚合只读回查：marker 日期/版本、dirty 总数、原子 RPC/grant、未登录接口和一条已登录比赛读取；不得循环调用 EODHD。
3. 观察应用整体 EODHD 调用量。若主 quote 仍有跨实例或旧客户端重复读取，另行恢复 EODHD-only 的通用门控与缓存，不得改变正式价格来源。
4. 新任务只读 `README.md`、`docs/development-process.md`、`docs/handoff.md`，不要重复旧流程。
