# Architecture and Security Audit

Date: 2026-07-03 Asia/Shanghai

## Executive Decision

当前代码可以继续小步维护,但还不是适合大量专业功能长期扩展的最终架构。

它已经具备基础安全护栏:

- GitHub + Vercel 自动部署链路
- GitHub Actions 构建和 `npm audit`
- `/api/quote` 默认要求 Supabase access token
- EODHD token 放在服务端 `EODHD_API_KEY`
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
   - The real community competition is isolated behind `community_competition_members` and service-only `community_competition_snapshots`. Its production SQL is applied and the anonymous REST gate passes 20/20; the SQL/admin metadata result is still pending after the Supabase Dashboard translation-plugin crash. The public API always authenticates independently of quote auth and never lets the browser aggregate cross-user financial rows. It exposes active-member nickname/avatar/rank/return fields plus, for the internal-test user card, only ticker codes whose official ledger hash matches the same-date locked snapshot; mismatches return unavailable, and shares/cost/amounts/allocation/positions/trades remain private. Joining freezes an eligible-date ledger hash; the independent Cron verifies that baseline and later locked hashes, enforces consecutive trading-date snapshots and USD-only adjusted-close valuation, carries already-ranked empty portfolios, and isolates failed EOD symbols without changing existing P&L tables or ledger permissions.

3. **Split and harden `/api/quote.js`**
   - The endpoint now handles auth, validation, dispatch, and response envelope only.
   - Status: provider routing, timeout fetch, auth/CORS, symbol parsing, response envelope, response-shape tests, and full provider implementation files now have explicit module boundaries.
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
- Add tests for key portfolio calculations.
- [~] Verify Supabase RLS live: the production anonymous REST probe passes 20/20 across the currently checked user-owned tables, including anonymous `401` for `community_profiles`, `community_competition_members`, and `community_competition_snapshots`; `swing_waves` metadata passed 13/13 checks, and its two-real-user authenticated-role/JWT-claim CRUD isolation smoke passed 14/14. Complete the competition metadata read and a two-user owner/cross-user isolation smoke for `community_profiles` when a stable admin channel is available.
- [x] Add the independent V2 wave ledger: production schema/RLS execution, metadata audit, two-user isolation gate, real standalone page, page-scoped CRUD, pure view model, active-only quote subscription, REST baseline preheat, ledger-first realtime priority, and production deployment are complete in `v10.7.9.297`.
- [~] Add the independent real community competition boundary: code, RLS SQL, strict auth, opt-in gating, immutable percentage-only close snapshots, no-mock UI, tests, production SQL execution, anonymous REST 20/20, and `v10.7.9.303` application deployment are complete; SQL/admin metadata readback remains pending after the Dashboard translation-plugin crash.

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
