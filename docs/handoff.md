# boduan-tracker 当前交接

验证时间：`2026-08-01 Asia/Shanghai`

本文件只保存当前基准、关键风险和下一步。稳定规则看 `README.md`，流程看 `docs/development-process.md`。

## 当前生产基准

| 项目 | 当前值 |
| --- | --- |
| 仓库 | `chenshuai1190-dotcom/boduan-tracker` |
| 生产地址 | `https://boduan-tracker.vercel.app` |
| 运行时代码 | 回退至 v402 稳定树 `be3748d`；实际发布提交以 GitHub `main` HEAD 为准 |
| 设置页版本 | `v10.7.9.402` |
| 数据库 | 未回退；保留线上 additive schema 与 GitHub migration 记录 |

本地发布门禁：

- `npm run check:full`：`839 / 839` tests PASS，字号下限 PASS，Vite production build PASS，whitespace PASS。
- 新的开发、验证和单等待器发布流程继续保留，没有恢复旧六文档或重复验证流程。
- 本次没有修改生产数据库、RLS、生产数据、正式交易、比赛账本或收益快照。

## 回退范围

- 产品 `server/**`、`src/**` 和对应业务测试恢复到 v402 稳定行为。
- 保留当前 `.github/**`、`README.md`、`docs/development-process.md`、`package.json`、`scripts/**` 开发发布流程。
- 保留当前 `supabase/**` migration 记录；禁止执行旧 SQL 或回滚生产数据库。
- v403 的比赛重新入榜运行时代码和 v404 的行情额度保护均不在当前运行时中。

## 收益比赛当前状态

- v402 运行时不包含 v403 的合法交易修改后自动重新入榜逻辑。
- 生产数据库保留 additive epoch schema；不得为匹配 v402 而回滚、覆盖或重跑旧 SQL。

## 当前风险与下一步

### 已知高风险

- v402 会恢复旧的完整 `/api/quote` 自动刷新：正常交易时段约每 10 秒、盘前盘后约每 30 秒、休市约每 5 分钟。
- 每只股票的完整请求会同时读取 EODHD 延迟行情和历史日线；历史交易代码、波段和其他常驻 symbol 会扩大上游请求量。
- v402 没有 v404 的完成收盘日线缓存、并发合并、15/30/60 分钟门控和 HTTP 402 熔断，可能再次耗尽 EODHD `100000` 日额度。
- 生产数据库保留 v403 additive schema，但 v402 运行时不认识比赛 epoch 重入；相关成员后续比赛快照可能 fail-closed，不得直接修改数据库处理。

## 必须保护的业务边界

- 正式持仓价格、收盘锁定、趋势、相对 QQQ 和收益口径继续只使用 EODHD；不得引入备用行情源计算正式持仓或盈亏。
- 股票趋势 MA200、重测、20 日恢复和 60 日结果只使用已完成收盘价，盘中价不得改变正式信号。
- iOS Home Screen PWA 继续保持 WebSocket 优先、已登录 snapshot 补齐和旧响应不得覆盖新 tick。
- 财报缺少官方分部、细分结构或地区数据时显示不可用，不得推测。
- 可见文字不得小于 `10px`。

### 下一步

1. 发布后只做一次低频登录态验证：交易页收盘锁定、持仓价、三大指数、股票趋势和收益报表。
2. 观察 EODHD 调用量，禁止循环探针。
3. 后续若重新优化额度，只做 EODHD-only 的缓存、合并和缺失收盘基线自动补齐；不得再次改变正式持仓和累计盈亏来源。
4. 新任务只读 `README.md`、`docs/development-process.md`、`docs/handoff.md`，不要重复旧流程。
