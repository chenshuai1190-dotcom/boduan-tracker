# Architecture and Security Audit

Date: 2026-07-03 Asia/Shanghai

## Executive Decision

当前代码可以继续小步维护,但还不是适合大量专业功能长期扩展的最终架构。

它已经具备基础安全护栏:

- GitHub + Vercel 自动部署链路
- GitHub Actions 构建和 `npm audit`
- `/api/quote` 默认要求 Supabase access token
- EODHD token 放在服务端 `EODHD_API_KEY`
- Supabase RLS SQL 已纳入仓库
- 登录前/登录后 bundle 已拆分
- 已登录后五个业务 tab 已拆分为 lazy chunks

但它仍保留明显的手搓 MVP 痕迹:

- `src/App.jsx` 仍有约 4300 行,承载大量状态、派生计算、modal、行情逻辑和页面编排。
- 五个 tab 文件合计超过 5200 行,主要是 JSX 搬迁,还没有真正形成业务模块边界。
- `api/quote.js` 约 1100 行,同时处理认证、行情源请求、日历、财报、新闻、分析师、指数、VIX、FGI 和降级逻辑。
- 缺少 lint、单元测试、集成测试和关键金融计算测试。
- 数据库访问集中在 `src/lib/db.js`,没有类型约束、schema validator 或迁移检查。
- 浏览器直连 EODHD WebSocket token path 已作为 Phase 0 第一项移除;实时行情未来必须走服务端 relay。

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
   - Future real-time quotes should use a server-side relay.

2. **Verify RLS live, not just SQL file**
   - `supabase/rls.sql` is present and correct in shape.
   - Before major feature development, confirm in Supabase that every user-owned table has RLS enabled and policies scoped to `auth.uid() = user_id`.

3. **Split and harden `/api/quote.js`**
   - The endpoint currently handles too many providers and response shapes in one file.
   - Add provider modules, request timeouts, consistent error objects, and tests before adding broker-grade or professional data features.

4. **Add automated checks before business expansion**
   - Required baseline: lint, unit tests, API tests, and smoke tests.
   - Financial calculations, risk rules, and delete/update operations must have tests before professional features are added.

### Medium Priority

1. **Local storage contains personal finance cache**
   - Current localStorage cache improves offline behavior.
   - This is acceptable for a personal app, but it should be treated as device-local sensitive data.

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
- Add API request timeout helpers in `api/quote.js`.
- Add lightweight linting.
- Add a first test runner.
- Add tests for:
  - `/api/quote` unauthenticated returns `401`
  - symbol validation rejects invalid input
  - `deleteTrade` and other deletes scope by `user_id`
  - key portfolio calculations
- Verify Supabase RLS live.

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
- Split `/api/quote.js` into provider modules:
  - `auth.js`
  - `symbols.js`
  - `providers/eodhd.js`
  - `providers/yahoo.js`
  - `providers/cnn.js`
  - `providers/calendar.js`
  - `response.js`

### Phase 2 - Data Correctness Layer

Goal: make professional finance features reliable.

- Add schema validation for Supabase rows and API responses.
- Add a migration strategy for Supabase schema changes.
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
- Server-side real-time quote relay
- Admin/diagnostics panel

## Recommended Next Step

Start with Phase 0 in this order:

1. Add quote API timeout utilities and cleaner provider boundaries.
2. Add test runner and first tests.
3. Verify RLS live in Supabase.
4. Add server-side relay design before enabling real-time streaming.

This sequence reduces future bug risk before adding new professional features.
