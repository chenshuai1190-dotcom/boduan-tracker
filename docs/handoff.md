# boduan-tracker 当前交接

验证时间：`2026-08-01 Asia/Shanghai`

本文件只保存当前已验证生产状态、关键边界、风险和下一步。历史功能查 Git、GitHub Actions、Vercel 与 `src/lib/settingsChangelog.js`；稳定规则看 `README.md`；流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| GitHub main / 生产运行时代码 | `fa9f926755bcd1cc2ad6b13ff2936f6613f724dc` |
| 设置页版本 | `v10.7.9.404` |
| 生产入口 | `/assets/index-BaznyIsc.js` |
| CI Actions | `30645470401` success |
| Docs Actions | `30645470149` success |
| Vercel | `CTuqC6iqsYmdbD5SddmsiptftEqs` success |

发布验证：

- `npm run check:full`：`887 / 887` tests PASS，字号下限 PASS，Vite production build PASS，`git diff --check` PASS。
- 文档一致性：PASS。
- `npm audit --audit-level=high`：0 vulnerabilities。
- 发布状态核验：`fa9f926` 的 CI、Vercel、生产入口与未登录鉴权边界 PASS。
- 未登录 `/api/quote?symbols=VIX`、`/api/earnings-calendar?symbols=NVDA`、`/api/earnings-detail?...`、`/api/stocks-realtime?...`、`/api/indices-realtime?...`：均为 `401`。
- `main` 与 `origin/main` 同步，交接前工作树干净。
- 本次没有修改数据库、RLS、生产数据、正式交易保存、比赛账本或收益快照。

## 最近事故与 v404 修复

### 根因

- v403 本身只修改“合法编辑订单后重新进入收益比赛”，没有改行情 provider。
- 系统异常不是 Vercel 故障。EODHD 当日 REST 用量达到 `100000 / 100000`，股票、指数、外汇和财报相关 REST 请求返回 HTTP `402`。
- 直接原因是旧客户端盘中约每 10 秒调用完整 `/api/quote`，并让大量股票重复读取同一份历史日线；focus、pageshow、tab 切换和 WebSocket 打开还会额外触发。

### 已上线修复

- 盘中实时价格继续优先走已登录股票/指数 WebSocket；iOS Home Screen PWA 的快照突发、首屏缓存和防旧响应覆盖逻辑保持不变。
- 自动完整 REST 基线改为：正常交易时段 `15 分钟`、盘前/盘后 `30 分钟`、休市 `60 分钟`；页面切换和恢复只有到期才补拉，手动刷新仍可强制。
- REST 基线只保留当前持仓、自选、活跃波段及核心 `QQQ/TQQQ`；已清仓历史和关闭波段不再进入常驻 REST 行情全集。
- EODHD 历史日线按 `provider symbol + 最新已完成美股收盘日` 缓存；相同 key 并发合并，长历史可以覆盖短历史。
- 日线缓存 LRU 为 `96`，已验证 70 个 symbol 的多批次集合不会互相淘汰。
- 只有 `close` 或 `adjusted_close` 为正、且最新有效日期严格等于该完成收盘日时才写缓存。刚收盘尚未生成当日 K 线、空占位 K 线、旧日响应和未来日期都不会冻结错误缓存。
- 周末、盘前和常规 NYSE 节假日继续复用最近完成收盘；指数盘中曲线按 5 分钟 bucket 更新，完成会话按完成日期复用。
- 缓存只保存公开行情字段 `date/open/high/low/close/adjusted_close/volume`，不保存 token、用户身份、持仓、交易、成本或盈亏。
- EODHD REST 一旦返回 `402`，当前服务实例立即熔断至下一个 UTC 00:00；WebSocket、Yahoo 与其他 provider 不受影响。失败继续保留最近有效行情，禁止用 `0` 覆盖。

### 已知限制

- 历史缓存与 402 熔断是 Vercel 单实例内存态，不是跨实例全局缓存。冷启动或新实例仍可能各自首次读取一次、首次收到一次 402；15/30/60 分钟客户端闸门负责避免重新形成请求风暴。
- `WaveTrackerPage` 仍有独立 focus/pageshow 行情入口；现有服务端日线缓存会保护它，本次没有扩大修改范围。
- 事故额度预计于 `2026-08-01 08:00 Asia/Shanghai`（UTC 00:00）重置。后续接手者必须重新做登录态生产探针，不要把“代码已修复”误写成“供应商额度已提前恢复”。

## 当前关键业务边界

- 个股收益详情的“交易统计”和“交易记录”会在正式交易新增、修改或删除成功后，按纽约当前日期立即重算；头部收益、持仓金额、收益走势、相对 QQQ 与历史快照仍以最新完成收盘为准。
- 股票趋势的日线 MA200、周线 MA200、趋势重测触发、20 日恢复和 60 日结果全部使用已完成收盘价；盘中现价不得改变正式信号或历史成功率。
- iOS Web App 实时价格的受保护链路为：账户隔离的最近行情缓存首屏、WebSocket 优先、已登录 snapshot burst 补齐、旧 REST/快照响应不得覆盖更新 tick。不要因普通 REST 优化改写这套顺序。
- 财报详情的年度/季度业绩趋势继续使用已核验官方财报历史；GOOG/GOOGL 最新已公布季度不得被旧 Company Facts 财期覆盖。报告分部、细分结构与地区数据缺失时显示不可用，不推测。
- iOS 长按规则、可见文字最小 `10px`、首页辅助文字基准和头部字号规则已写入 `README.md`，后续 UI 不得重新引入 `8–9.5px`。

## 收益比赛当前状态

- v403 已允许工作日全天修改或删除合法正式交易后，重新进入下一份收益榜单；周末不生成股票比赛快照。
- v404 没有修改比赛计算、publication marker、快照任务或数据库。
- 本次发布没有重新读取最新 publication marker。涉及比赛状态的后续任务必须先做生产只读核验，不得沿用旧日期或旧人数。

## 当前风险与下一步

1. EODHD 额度重置后，使用登录态生产环境核验首页三大指数、持仓股票、股票趋势五年图、相对 QQQ、财报日历与财报详情；同时观察调用量是否稳定，不要通过循环探针制造新请求。
2. 若仍出现跨实例重复历史请求，再单独设计“公开行情全局共享缓存”；不得把鉴权结果、账户数据或交易数据放入共享缓存，也不得在未授权时新增数据库或外部缓存服务。
3. 若优化波段记录的 focus/pageshow 路径，只合并触发器，不改已验证的 iOS PWA WebSocket/snapshot 快速链路。
4. 新任务先确认 `HEAD == origin/main`、工作树干净和生产提交一致；不要重复旧的六文档仪式。

## 接手入口

只读三份权威文档：`README.md`、`docs/development-process.md`、`docs/handoff.md`。首次新工作区再执行 workspace/toolchain 检查；连续开发按流程直接进入目标文件。
