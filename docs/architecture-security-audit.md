# Architecture and Security Audit

Date: 2026-07-03 Asia/Shanghai
Last updated: 2026-07-14 Asia/Shanghai

## Executive Decision

当前代码可以继续小步维护,但还不是适合大量专业功能长期扩展的最终架构。

它已经具备基础安全护栏:

- GitHub + Vercel 自动部署链路
- GitHub Actions 构建和 `npm audit`
- `/api/quote` 默认要求 Supabase access token
- EODHD token 放在服务端 `EODHD_API_KEY`
- 美股收盘涨跌榜通过已登录 `/api/quote?view=market-movers` 和独立 `server/quote/marketMovers.js` 获取真实 EODHD 收盘数据,并与 Nasdaq Trader 当前上市目录交集验证;官方目录/provider 异常时 fail closed,生产无 EODHD-only 或 mock 榜单兜底
- 个股收益对比只读当前用户正式 `stock_trades` 和 owner-scoped `pnl_report_symbol_snapshots`,个股与 QQQ 的 `rawClose` 普通收盘价均经已登录 `/api/pnl-benchmark` 从服务端读取;个人快照只核验日期和持仓股数,双方按首个三方共同日期、等额加仓和同比例减仓计算,缺数据或账本/快照不一致时 fail closed,不写账本/快照且生产无 mock 收益。个人收益快照沿用现有 owner-writable 模型,因此该视图是个人账本分析,不是比赛级不可覆盖证明
- 自动个人/比赛收盘任务对 EODHD symbol 做最多三次有界重试,可恢复缺口和没有目标日 SPY 行的保守休市判断返回 503,不退回旧日期。当前生产 runtime 以 `America/New_York` 判定工作日目标,无显式日期的调用在美东 17:00 前只返回 deferred 且不访问 provider/数据库;个人/比赛各用 UTC 21/22/23 三个 Hobby 冗余窗口,retry/late-retry 仍 rewrite 到同一 `CRON_SECRET` 保护函数。合法显式日期可做受保护人工修复,但必须先确认目标日精确 SPY 收盘,周末、休市日、旧 payload 或缺失目标行均在任何业务 Supabase 读写前 fail closed;比赛显式路径不允许 rebaseline。非法日期直接 400。个人继续按最近 31 个日历日的 SPY 真交易日补既有账户缺口,无完成标记用户只写目标日;portfolio 标记先删后最后写。比赛仍按完整 SPY 日历有界分批,空仓不造行、锁定行不覆盖。
- 比赛以不可由 authenticated 客户端读取或伪造的 `stock_trade_ledger_revisions` 为权威 mutation state。数据库 trigger 覆盖正式交易的 `created_at`/`updated_at`,并在每次 INSERT/UPDATE/DELETE 后推进 revision 与 `last_mutated_at`;加入、重建基线和快照插入均使用 revision CAS,统一锁序为 revision row → member row。首张快照前,只有 revision 增量能被数据库时间证明为“全部都是 current target day、从未更新的纯 INSERT”,且写入时间不晚于目标收盘时,才可走普通快照。历史修改、删除、当日 UPDATE、混合/无法证明的变更、迁移期 delta-zero 歧义和收盘后变更都不得使用该例外。
- 其余安全恢复只允许 active 且全表 0 snapshots、两个 ranking 字段均为空的成员在 scheduled D1 向前重建 eligible date/hash/revision。D1 严格校验完整正式账本的非空 USD、字段、顺序和不超卖,并拉取 SPY 与所有相关个股的精确 D1 EOD;缺个股 D1 行、provider 失败或旧日收盘替代都不得调用 RPC。D1 当日交易还必须满足权威 `created_at <= 16:00 America/New_York`,成交价位于 provider raw D1 high/low 内。D1 不写 snapshot/ranking/收益;D2 下一真实收盘只有账本未变且正常 EOD/OHLC 校验再次通过才可开始排名。已有任一 snapshot/ranking 永久禁止 rebaseline。`service_role`-only RPC 与 membership/snapshot insert guards 都先锁 revision row 再锁 member row,并在锁内重验 revision、active 状态与日期;malformed ledger row 不得被过滤。两条链路都不改 `stock_trades`,不新增浏览器数据面、账本写入口或 mock/实时价/估算收益兜底。本地完整测试为 362/362。生产 revision/CAS SQL、21-table + 2-RPC REST gate、metadata 回读、真实双事务并发 smoke 与 runtime `8f23a471be3cd63b657bf1f7a807c438881a23ea` 已完成;真实收盘 D1/D2 仍待观察,不得提前声称结果。
- 上一 runtime 的历史生产恢复证据(2026-07-14):commit `9e1c840e0b336a0352b79f691b7ce3a3b252ff98` 的 GitHub Actions run `29313005445` success,Vercel deployment `DSGn5mQnzs2o1x6ohQWD6DGrMy2Y` Ready。`2026-07-13` 个人为 12 users / 12 portfolio rows 与 54 symbol rows / 18 symbols;比赛为 8 users / 8 locked rows,active 9、eligible 9、initialized 8、invalid 0。另 1 名尚未排名成员因 `eligible_ledger_hash_mismatch` 继续拒绝;未改正式 `stock_trades`、未覆盖锁定行、未造收益。这不是新 runtime 的真实 D1/D2 完成证据。
- BTC、三大指数和用户股票实时推送已走服务端 WebSocket relay,浏览器只连接已登录的 `/api/btc-realtime` / `/api/indices-realtime` / `/api/stocks-realtime`;用户股票范围包括自选、正式持仓、波段记录和摊薄工具 quote rows
- Supabase RLS SQL 已纳入仓库
- 登录前/登录后 bundle 已拆分
- 已登录后五个业务 tab 已拆分为 lazy chunks

但它仍保留明显的手搓 MVP 痕迹:

- `src/App.jsx` 仍有约 4300 行,承载大量状态、派生计算、modal、行情逻辑和页面编排。
- 五个 tab 文件合计超过 5200 行,主要是 JSX 搬迁,还没有真正形成业务模块边界。
- `api/quote.js` 约 1100 行,同时处理认证、行情源请求、日历、财报、新闻、分析师、指数、VIX、FGI 和降级逻辑。
- 缺少 lint、单元测试、集成测试和关键金融计算测试。
- 数据库访问仍主要集中在 `src/lib/db.js`;V2 波段已先拆出独立 model/repository/wrapper 和输入校验,但全局 schema validator 与统一 migration 机制仍缺失。
- 浏览器直连 EODHD WebSocket token path 已作为 Phase 0 第一项移除;实时行情必须继续走已登录服务端 relay。

结论: **不要直接进入大量专业功能开发。先做一次架构安全升级,再扩功能。**

## Current Dependency Position

Based on `npm outdated --json` on 2026-07-03:

| Package | Current | Latest | Decision |
| --- | ---: | ---: | --- |
| React | 18.3.1 | 19.2.7 | 不立即升级。先补测试和拆模块,再单独迁移 React 19。 |
| React DOM | 18.3.1 | 19.2.7 | 同 React。 |
| Tailwind CSS | 3.4.19 | 4.3.2 | 不立即升级。Tailwind 4 影响构建和样式,需视觉回归后迁移。 |
| lucide-react | 0.383.0 | 1.23.0 | 可较早升级,但仍要做 Settings/Home/Tab smoke check。 |
| Vite | 8.1.3 | 8.1.3 installed | 当前可接受。 |
| @vitejs/plugin-react | 6.0.3 | 6.0.3 installed | 当前可接受。 |
| @supabase/supabase-js | 2.110.0 | 2.110.0 installed | 当前可接受。 |

Do not treat "latest dependency version" as the same thing as "safe architecture". The first priority is correctness and module boundaries.

## Security Findings

### High Priority

1. **Remove browser-direct EODHD WebSocket path**
   - Status: completed in the Phase 0 baseline.
   - The frontend no longer reads `VITE_EODHD_TOKEN` or exposes a browser WebSocket toggle env var.
   - BTC、三大指数和用户股票已使用已登录服务端 relay;用户股票范围包括自选、正式持仓、波段记录和摊薄工具 quote rows;future real-time quotes should follow the same pattern.

2. **Verify RLS live, not just SQL file**
   - `supabase/rls.sql` is present and correct in shape.
   - Before major feature development, confirm in Supabase that every user-owned table has RLS enabled and policies scoped to `auth.uid() = user_id`.
   - `supabase/swing_waves.sql` was applied to production on 2026-07-11 and its schema/grant/RLS metadata verification passed 13/13 checks. The post-migration anonymous REST probe also passes. A two-real-Auth-user SQL/JWT-claim CRUD/RLS isolation smoke passed 14/14 checks and cleanup confirmed zero residual rows. The smoke used existing Auth user IDs in the SQL editor and did not export a service-role key or exercise password-login REST sessions. The standalone page is deployed as `v10.7.9.297`, runtime commit `b56b7127ab69bd40bee1932c12eab722ebb4064d`.
   - `community_profiles` is added for the `v10.7.9.301` settings profile foundation, and the production SQL plus the `profile_completed_at` change are applied. The latest anonymous REST probe passes 20/20 with `community_profiles` returning `401`. Authenticated clients may read/insert/update only their own profile row; active-member public nickname/avatar exposure is mediated by the authenticated competition API. No delete grant is given, and the table remains outside trades, assets, returns, snapshots, quote relay, and Supabase Storage.
   - Local `v10.7.9.312` adds 12 preset avatar keys through the standalone `community_avatar_options_v312.sql` constraint migration while retaining all 6 legacy keys. This is an allowlist-only schema change: it does not add columns, widen public reads, alter owner RLS, or introduce Storage uploads.
   - `v10.7.9.315` moves explicit nickname/avatar selection into invite registration. `/api/register` validates the same nickname rule and 18-key avatar allowlist, creates the completed canonical profile before consuming the invite, and removes the new Auth user if either write fails. Its standalone production migration was applied and read back on 2026-07-12: only `service_role` gains INSERT, anonymous INSERT remains false, authenticated INSERT/RLS and all three owner policies remain intact; it does not widen browser reads/writes or enroll the user in the competition.
   - The real community competition is isolated behind `community_competition_members` and service-only `community_competition_snapshots`. Database source commit `0f52700761beab0d4488e067ca9e968aea9a9bc1` and the production revision/CAS/forward-only migration are complete; metadata readback, the 21-table + 2-RPC denial probe, and a two-session ordered-lock smoke all passed before runtime deployment. Runtime `8f23a471be3cd63b657bf1f7a807c438881a23ea` then passed Actions `29321470173` and Vercel target `CkNECvKe9N3WGSLokcaWFdYkUxvg`. The local suite passes 362/362. The public API always authenticates independently of quote auth and never lets the browser aggregate cross-user financial rows. It exposes active-member nickname/avatar/rank/return fields plus, for the internal-test user card, only ticker codes whose official ledger hash matches the same-date locked snapshot; mismatches return unavailable, and shares/cost/amounts/allocation/positions/trades remain private. `stock_trade_ledger_revisions` plus database-authored trade timestamps are authoritative: every ledger mutation advances the opaque revision, join/rebaseline/snapshot insertion use revision CAS, and every competition writer that needs both rows locks the revision row before the member row. Only an exactly provable current-target-day pure INSERT set may use the normal first-snapshot path. Every historical update/delete, target-day update, mixed or unprovable delta, migration ambiguity, and post-close mutation must fail closed or use D1 forward-only recovery. That recovery remains limited to active members with zero snapshots and zero ranking, requires exact same-day EOD rows for SPY and every relevant stock, rejects old-close substitution, and admits D1-dated trades only when their authoritative creation time is no later than 16:00 ET and their price fits provider raw high/low. D1 writes no result; D2 must be a later real close with unchanged revision and the normal EOD/OHLC checks. The insert guard rechecks revision, active membership, and date under the same lock order. Explicit-date personal and competition requests also require an exact target-date SPY close before any business-database access, so a weekend/holiday cannot write an empty official row. Snapshot automation classifies provider/date gaps separately from ledger rejections, returns 503 on recoverable incompleteness, and uses the full SPY trading-date sequence from the earliest pending anchor to catch members up without skipping or overwriting a day. Work is bounded to 5 sessions/250 member-days per invocation; no-trade members defer without blocking, a later first buy accelerates their start, and failed ranking initialization is recovered only after both earliest and latest locked hashes still match the formal ledger.

3. **Split and harden `/api/quote.js`**
   - The endpoint now handles auth, validation, dispatch, and response envelope only.
   - Status: provider routing, timeout fetch, auth/CORS, symbol parsing, response envelope, response-shape tests, and full provider implementation files now have explicit module boundaries. The close-movers path is isolated in `server/quote/marketMovers.js`; it intersects EODHD common-stock classification with current Nasdaq Trader directories, canonicalizes class symbols, bounds/cache-merges calls, returns same-date 30/30 close rows, and fails closed with sanitized auth/API-tested errors.
   - Continue splitting the large EODHD provider module and add error-path coverage before broker-grade or professional data features.

4. **Add automated checks before business expansion**
   - Status: first `node --test` baseline exists and runs in GitHub Actions.
   - Remaining baseline: lint, broader API tests, and smoke tests.
   - Financial calculations, risk rules, and delete/update operations must have tests before professional features are added.

### Medium Priority

1. **Local storage contains personal finance cache and remembered account sessions**
   - Current localStorage cache improves offline behavior; from `v10.7.9.311` every user-data cache key is scoped by authenticated user ID and old unscoped cache is ignored.
   - True one-click switching retains up to five Supabase sessions without passwords. The safe account list never exposes tokens, logout is local-scope, and `MainApp` remounts on user ID before cloud data reloads.
   - This is acceptable for a personal app on a trusted device, but both finance cache and refresh sessions are JS-readable device-local sensitive data. Do not use the remembered-account feature on shared or untrusted devices; future XSS-hardening remains defense-in-depth priority.

2. **Auth gate still blocks on Supabase session verification**
   - This is safer than optimistic rendering.
   - Performance can be improved later, but do not bypass auth verification just to make startup feel faster.

3. **Docs still contain historical product details**
   - `CONTEXT.md` is useful but partially stale.
   - It should be refreshed after the architecture upgrade so future handoff is based on current code, not old Claude-era notes.

## Architecture Upgrade Roadmap

### Phase 0 - Safety Baseline Before New Features

Goal: make the current app safer to change without altering product behavior.

- [x] Remove browser-direct EODHD WebSocket token path.
- [x] Add API request timeout helpers and quote provider boundary modules.
- Add lightweight linting.
- [x] Add a first test runner.
- [x] Add tests for:
  - `/api/quote` unauthenticated returns `401`
  - symbol validation rejects invalid input
  - delete guards scope by `user_id`
- [x] Add quote response-shape tests for VIX, FGI, INDICES, ANALYST, and normal stock symbols; earnings calendar now has a dedicated EODHD endpoint test.
- [x] Add authenticated EODHD close-mover tests for 30/30 sorting/signs, same-date enforcement, venue/instrument filtering, caching/in-flight coalescing, timeout budgeting, and sanitized provider failures.
- Add tests for key portfolio calculations.
- [~] Verify Supabase RLS live: the production anonymous REST probe passes 21 table probes plus 2 RPC-denial probes, including anonymous `401` for `community_profiles`, `community_competition_members`, `community_competition_snapshots`, and `stock_trade_ledger_revisions`; `swing_waves` metadata passed 13/13 checks, and its two-real-user authenticated-role/JWT-claim CRUD isolation smoke passed 14/14. Complete a two-user owner/cross-user isolation smoke for `community_profiles` when a stable admin channel is available.
- [x] Add the independent V2 wave ledger: production schema/RLS execution, metadata audit, two-user isolation gate, real standalone page, page-scoped CRUD, pure view model, active-only quote subscription, REST baseline preheat, ledger-first realtime priority, and production deployment are complete in `v10.7.9.297`.
- [~] Add the independent real community competition boundary: strict auth, opt-in gating, immutable percentage-only close snapshots, no-mock UI, and `v10.7.9.303` application deployment are complete. The authoritative revision/database-time/CAS and forward-only recovery release passes 362/362 local tests; production SQL application/readback, the 21-table + 2-RPC denial probe, row-lock concurrency smoke, and runtime deployment are complete. Real-close D1/D2 observation remains pending.

### Phase 1 - Feature Boundary Split

Goal: stop expanding `App.jsx` and `api/quote.js`.

- Create feature folders:
  - `src/features/home`
  - `src/features/trades`
  - `src/features/assets`
  - `src/features/goals`
  - `src/features/settings`
  - `src/features/market-data`
- Move tab-specific state and calculations into hooks:
  - `usePortfolioSummary`
  - `useWatchlistAlerts`
  - `useRealtimeQuotes`
  - `useCalendarEvents`
  - `useCostBasis`
- Replace the giant `tabCtx` object with small feature-specific props or hooks.
- Continue splitting quote provider modules:
  - `providers/eodhd.js` into stock, fundamentals, and shared parser helpers
  - Yahoo chart/fallback helpers where reuse grows
  - additional response and error-path tests

### Phase 2 - Data Correctness Layer

Goal: make professional finance features reliable.

- Add schema validation for Supabase rows and API responses.
- [~] Add a migration strategy for Supabase schema changes. `supabase/swing_waves.sql` provides a first small, standalone execution unit, but the repository still has no automated migration runner.
- Create a pure calculation layer for:
  - realized P/L
  - holding P/L
  - cost basis
  - drawdown
  - risk levels
  - portfolio allocation
- Tests must cover edge cases: splits, partial sells, multi-account snapshots, empty data, stale market data.

### Phase 3 - Dependency Modernization

Goal: upgrade framework without masking business bugs.

- Upgrade `lucide-react` first.
- Migrate to React 19 only after tests exist.
- Migrate Tailwind 4 only after visual smoke checks exist.
- Keep Vite upgrades isolated and validate bundle output after each step.

### Phase 4 - Professional Features

Only after Phases 0-2:

- Broker integration
- Risk engine
- Portfolio attribution
- Multi-currency accounting
- Tax lots
- Alerts and push notifications
- Server-side real-time quote relay expansion beyond BTC, core indices, and current user quote rows
- Admin/diagnostics panel

## Recommended Next Step

Start with Phase 0 in this order:

1. Continue shrinking the large EODHD provider module into stock, fundamentals, and shared parser helpers.
2. Add quote API error-path tests for EODHD failures, Yahoo fallback, CNN failures, and the dedicated EODHD earnings-calendar endpoint.
3. Complete a two-real-user `community_profiles` owner/cross-user isolation smoke when a non-empty service-role or DB admin channel is available.
4. Continue the remaining all-table RLS metadata audit; the `swing_waves` two-user isolation gate and `v10.7.9.297` standalone-page deployment are complete.
5. Extend server-side relay tests before adding more streamed symbols or user-configurable realtime watchlists.

This sequence reduces future bug risk before adding new professional features.
