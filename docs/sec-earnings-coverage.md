# SEC 财报解析覆盖诊断（阶段 1）

这是手动、按明确事件清单运行的诊断工具，用于发现哪些官方财报已有结构、哪些区块缺失，以及具体失败原因。它不代表所有股票已覆盖，也不是后台自动抓取、Cron 或发布门禁。

## 准备输入

在本地准备一个 JSON 数组文件，例如 `events.json`：

```json
[
  { "symbol": "GOOGL", "fiscalDate": "2026-06-30", "reportDate": "2026-07-29" },
  { "symbol": "NVDA", "fiscalDate": "2026-04-26", "reportDate": "2026-05-20" }
]
```

日期由操作者根据已知事件明确提供。工具不查询用户数据库、持仓或行情日历；最多 20 个不同事件，文件最多 256 KiB。股票代码、有效日期和财期/公布日关系必须通过现有请求校验。需要区分 provider 与官方财期时，可额外提供 `providerFiscalDate` 和 `officialFiscalDate`；其他字段不进入输出。

## 默认只看计划

```bash
node scripts/earnings-detail-coverage.mjs --help
node scripts/earnings-detail-coverage.mjs events.json
```

默认输出 `mode: plan`、规范化后的事件、请求上限和 `planned` 状态；`coverage: null`，没有任何网络请求，也不读取环境配置文件。

## 显式执行一次 SEC 读取

先在当前终端进程中配置符合 SEC 要求的 `SEC_USER_AGENT`（应用标识和可联系邮箱），然后运行：

```bash
node scripts/earnings-detail-coverage.mjs events.json --live
```

工具不会自动加载 `.env.local` 或其他密钥文件，不需要 EODHD、Supabase 或生产登录信息，也不会打印 User-Agent。每个事件顺序调用一次既有 `fetchSecEarningsDetail`，每事件最多 6 次 HTTP 请求、全次最多 100 次，每事件使用现有服务端 12 秒批次截止时间和 250ms 请求间隔。只允许 HTTPS SEC 主机，拒绝自动跟随重定向；不重试、不循环刷新，不写生产或本地报告文件。

每个事件输出顶层状态、具体 `reason` / `failureReason`、官方 `form`、`documentType`、`parser`（仅当解析结果提供），以及 `reportSegments`、`revenueBreakdown`、`geographies` 三块的状态、条数和原因。缺失元数据输出 `null`，不根据股票名称猜测解析器；输出不含金额、持仓、原始报文、URL、token 或异常堆栈。

`coverage.coveredEvents` 仅统计 SEC 来源、状态为 `complete/partial` 且至少一个区块有结构条目的事件；不等于三块都完整。`non-sec-source-excluded` 表示现有适配器返回了其他官方来源（如 TSMC）的结构，该结果不计入 SEC 覆盖。HTTP 超时、无对应文件、未发布、未解析及区块缺失均保留具体原因，不能把“不可用”写成已覆盖。

退出码：`0` 表示计划校验通过，或 live 的所有事件至少有一块 SEC 结构；`2` 表示参数、文件或 User-Agent 配置无效；`3` 表示 live 存在尚无 SEC 结构的事件。不要把 live 退出码 `0` 解释为财报数值已经逐项人工验收。

本地回归使用纯 fixture / mock：

```bash
node --test tests/earnings-detail-coverage.test.js
```
