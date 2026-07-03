# Development Log

本文件记录 `boduan-tracker` 的每次可维护更新。任何代码、配置、部署、安全或文档改动,都必须在同一个提交中追加日志。

## 2026-07-03 Asia/Shanghai

### 2026-07-03 - 调整首页字体、底部导航和币种切换

- Commit: `same commit`
- Background: 首页首版与效果图相比字体代码感过重,底部导航仍是浅色导致与暗色首页不协调,且总资产区域需要支持 USD/RMB 切换并记住用户选择。
- Changes:
  - 首页主字体和数字字体改为系统 iOS 风格字体栈,移除首页数字的 `ui-monospace` 观感。
  - 首页底部导航同步为黑底、金色 active、浅白 inactive,其他 tab 继续使用原浅色导航。
  - 首页总资产卡新增 USD/RMB 分段切换;主金额、今日盈亏和累计盈亏随币种切换,副行显示另一种货币和汇率。
  - 币种选择写入 `localStorage` 的 `xmoney_home_currency`,下次进入首页自动恢复。
  - 设置页用户可见更新日志同步到 `v10.7.9.51`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/App.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-D9tp3Z_b.js` 20.88 kB / gzip 5.86 kB, `App-w46slVPG.js` 126.42 kB / gzip 34.14 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local mobile visual check: pass at 390x844; no horizontal overflow, home bottom nav is dark/gold, RMB selection survives reload, and long RMB P/L values no longer wrap.
- Deployment: pending。
- Production verification: pending。
- Rollback: 回滚本次提交会恢复首页首版字体、浅色底部导航和固定 USD 主金额;不影响交易、资产或目标数据。
- Follow-up: 后续可继续按效果图细调卡片间距和 VIX/FGI 小组件视觉。

### 2026-07-03 - 记录首页看板部署验证

- Commit: `same commit`
- Background: 首页投资账户看板已推送到 GitHub `main` 并由 Vercel 自动部署,需要把部署和线上验证证据补进日志,同时刷新交接文档当前状态。
- Changes:
  - 回填运行时代码提交 `3ca274c` 的 GitHub Actions、Vercel 和生产 smoke check 结果。
  - 刷新 `docs/handoff.md` 当前运行时代码和设置页版本。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `git diff --check`: pass
- Deployment: docs-only,推送 `main` 后由 Vercel 自动部署,不改变运行时代码逻辑。
- Production verification: docs-only,运行时代码验证见下方 `重做首页投资账户看板` 条目。
- Rollback: 回滚本次提交只会移除部署记录和交接状态刷新,不改变应用行为。
- Follow-up: 后续完成任何可部署改动后按 `docs/development-process.md` 默认自动部署并验证。

### 2026-07-03 - 重做首页投资账户看板

- Commit: `3ca274c`
- Background: 用户提供新的首页效果图并明确首页口径:总资产只统计投资账户,资产/目标模块保持独立,`costBasisData` 继续作为单股票摊薄成本小工具,不参与首页主账本。
- Changes:
  - 新增 `src/lib/investmentSummary.js`,从交易记录和自选行情派生首页投资账户汇总。
  - 首页总资产、今日盈亏、累计盈亏改用交易记录口径;当前现金先固定为 `0`,等待后续交易页手动现金模块接入。
  - 首页持仓数量改为当前仍持有的股票数量,`笔` 改为卖出交易记录数量。
  - 重做 `src/tabs/HomeTab.jsx`,改为暗色移动首屏:投资账户资产卡、当前信号卡、四个市场卡、VIX/FGI 卡和自选/持仓表格。
  - `INDICES` provider 扩展为标普500、纳斯达克100、道琼斯、黄金/美元四张市场卡,价格走服务端 EODHD real-time endpoint。
  - 设置页用户可见更新日志同步到 `v10.7.9.50`。
  - `docs/development-process.md` 和 `docs/handoff.md` 补充默认自动部署规则:验证通过后推进到 GitHub `main`,触发 Vercel 生产部署并做线上验证;除非用户明确要求暂不部署。
- Key files:
  - `src/App.jsx`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `src/lib/investmentSummary.js`
  - `server/quote/providers/indices.js`
  - `tests/investment-summary.test.js`
  - `tests/quote-response-shape.test.js`
  - `docs/development-process.md`
  - `docs/handoff.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass,21 tests
  - `npm run build`: pass,local `HomeTab-BZMrfBOs.js` `20.09 kB`,gzip `5.46 kB`
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
  - Local visual check: pass,390×844 mobile preview of `HomeTab` showed no horizontal overflow and no detected viewport offenders
- Deployment: 已推送 `main`;Vercel 对 `3ca274c65536642cb462ae96778cb325531a56cf` 返回 `success`,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/3DBpMoRwwUCtLoqZq87ZcDCxX8he`。
- Production verification:
  - GitHub `main`: `3ca274c65536642cb462ae96778cb325531a56cf`
  - GitHub Actions `CI` run `28664187222`: success
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production `GET /api/quote?symbols=VIX` without auth: `401`
  - Production HTML points to `App-BZZTuF4R.js`;App chunk lazy-loads `HomeTab-BZMrfBOs.js`
  - Production Settings chunk contains `v10.7.9.50` and the homepage changelog entry
- Rollback: 回滚本次提交会恢复旧首页和旧的两项指数市场卡,不会改动资产/目标模块数据。
- Follow-up: 在交易页补投资现金手动录入模块,再把首页现金纳入 `investmentSummary.cashUsd`;继续拆 `server/quote/providers/eodhd.js` 并做 RLS metadata 复核。

### 2026-07-03 - 拆分 quote provider 实现并补响应形状测试

- Commit: `25c79eb`
- Background: 交接后继续 Phase 0,优先把 `/api/quote.js` 中的 provider 业务实现移出入口文件,并补齐主要 quote 响应形状测试,降低后续行情功能改动风险。
- Changes:
  - 将 `/api/quote.js` 缩成 CORS、鉴权、symbol 校验、provider 调度和统一响应封装。
  - 新增 `server/quote/providerHandlers.js` 和 `server/quote/response.js`。
  - 新增 `server/quote/providers/*`,拆出 VIX、CNN FGI、Google Translate、EODHD 股票/基本面、指数和 NASDAQ 日历 provider 实现。
  - 新增 response-shape tests,覆盖 `VIX`、`FGI`、`INDICES`、`CALENDAR`、`ANALYST:<symbol>` 和普通股票。
  - 更新交接、安全和架构审查文档中的 quote API 当前结构与后续重点。
- Key files:
  - `api/quote.js`
  - `server/quote/providerHandlers.js`
  - `server/quote/response.js`
  - `server/quote/providers/*.js`
  - `tests/quote-response-shape.test.js`
  - `docs/handoff.md`
  - `docs/security-hardening.md`
  - `docs/architecture-security-audit.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass,18 tests
  - `npm run build`: pass
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
  - `npm run verify:rls:rest`: pass,12 user-owned tables returned `visibleRows=0` for anonymous REST probes
- Deployment: 已推送 `main`;Vercel 为 `25c79eb806225adbc5aa53212077db5d90ffa7a9` 创建 Production deployment `5299629938` 并返回 success。
- Production verification:
  - GitHub `main`: `25c79eb806225adbc5aa53212077db5d90ffa7a9`
  - GitHub Actions `CI` run `28661210514`: success
  - Vercel deployment target: `https://boduan-tracker-69zehu5bo-chenshuai1190-7580s-projects.vercel.app` success;该 preview URL 受 Vercel SSO 保护,生产 alias 已验证
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production `GET /api/quote?symbols=VIX` without auth: `401`
  - `npm run verify:rls:rest`: pass,12 user-owned tables returned `visibleRows=0` for anonymous REST probes
- Rollback: 回滚本次提交会把 provider 实现放回旧的单文件 quote API,不影响数据库数据。
- Follow-up: 继续把较大的 `server/quote/providers/eodhd.js` 拆成 stock/fundamentals/shared parser helpers,并在有 Supabase SQL/admin 权限时做 metadata-level RLS 复核。

### 2026-07-03 - 新增开发交接文档

- Commit: `same commit`
- Background: 用户准备把项目移交给下一位开发者,需要一份不依赖聊天记录的交接文档。
- Changes:
  - 新增 `docs/handoff.md`,汇总当前生产状态、运行时代码 commit、开发流程、验证命令、架构风险和下一步优先级。
  - 在 README 开发入口加入 `docs/handoff.md`。
- Key files:
  - `docs/handoff.md`
  - `README.md`
  - `docs/development-log.md`
- Validation:
  - `git diff --check`: pass
- Deployment: docs-only,推送 `main` 后由 Vercel 自动部署,不改变运行时代码。
- Production verification: docs-only,沿用上一条运行时代码验证结果。
- Rollback: 回滚本次提交只会移除交接文档和 README 链接,不会改变应用行为。
- Follow-up: 下一位开发者应先读 `docs/handoff.md`,再继续 quote provider 拆分、RLS metadata 复核和金融计算测试。

### 2026-07-03 - 记录 quote API 安全边界部署验证

- Commit: `af69dc9`
- Background: quote API 边界拆分、测试基线和 RLS REST 探针已推送到 `main`,需要把生产验证证据补进交接日志。
- Changes:
  - 回填本轮运行时代码提交 `7be8caf` 的部署状态和线上验证结果。
  - 记录 GitHub Actions、Vercel、生产 chunk、未登录 quote API 401 和 Supabase RLS REST 探针结果。
- Key files:
  - `docs/development-log.md`
- Validation:
  - `git diff --check`: pass
- Deployment: 本次为日志回填提交;推送 `main` 后由 Vercel 自动部署,不改变运行时代码。
- Production verification:
  - Runtime commit: `7be8caf8a62db137047c051dd3a856c94527ff96`
  - GitHub Actions `build`: success
  - Vercel status: success, deployment completed
  - Production chunks: `index-BFR1MOM7.js`, `App-CB4Nn09n.js`, `SettingsTab-DMWkNhZg.js`
  - Settings chunk contains `v10.7.9.49`; App chunk has no browser EODHD token/WS path
  - `GET /api/quote?symbols=VIX` without auth: `401`
  - `npm run verify:rls:rest`: pass,12 user-owned tables returned `visibleRows=0` for anonymous REST probes
- Rollback: 回滚本次日志提交只会移除部署记录,不会改变应用行为。
- Follow-up: 继续把 provider 业务解析移出 `api/quote.js`,并在有 Supabase SQL/admin 权限时做 metadata-level RLS 复核。

### 2026-07-03 - 拆分 quote API 安全边界并加入测试

- Commit: `7be8caf`
- Background: 用户要求继续 Phase 0,先拆 `/api/quote.js` 的 provider/timeout/error 边界,再加第一批自动化测试,并复核 Supabase RLS 线上状态。
- Changes:
  - 将 quote API 的认证/CORS、错误响应、symbol 解析、provider 路由、timeout fetch 拆到 `server/quote/*`。
  - `/api/quote.js` 外部 EODHD/Yahoo/CNN/Nasdaq/Translate 请求统一走 `providerFetch`,避免 provider 慢响应无限挂住函数。
  - 新增 `node --test` 测试基线,覆盖 quote auth、symbol 校验、provider 路由、timeout 和删除按 `user_id` 约束。
  - 新增 `src/lib/dbGuards.js`,让删除操作的 `user_id` 约束可复用、可测试。
  - GitHub Actions 增加 `npm test`。
  - 新增 `scripts/verify-rls-rest.mjs`,用生产公开 Supabase anon 配置复核匿名 REST 客户端不能看到用户表数据。
  - 设置页应用内更新日志同步到 `v10.7.9.49`。
  - README、安全 runbook、开发流程和架构审查文档同步本次安全基线。
- Key files:
  - `api/quote.js`
  - `server/quote/auth.js`
  - `server/quote/errors.js`
  - `server/quote/http.js`
  - `server/quote/providers.js`
  - `server/quote/symbols.js`
  - `src/lib/db.js`
  - `src/lib/dbGuards.js`
  - `tests/*.test.js`
  - `scripts/verify-rls-rest.mjs`
  - `.github/workflows/ci.yml`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass,12 tests
  - `npm run build`: pass, local App chunk `App-C0OkX0VY.js` `124.03 kB`, gzip `33.16 kB`
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
  - `npm run verify:rls:rest`: pass,12 user-owned tables returned `visibleRows=0` for anonymous REST probes
- Deployment: 已推送 `main`;Vercel 生产部署完成。
- Production verification: pass,见上方 `记录 quote API 安全边界部署验证`。
- Rollback: 回滚本次提交会恢复旧 quote API 单文件边界和无测试基线;如回滚,不要继续新增专业功能。
- Follow-up: 继续把 EODHD/Yahoo/CNN/Nasdaq provider 的完整实现移出 `api/quote.js`,并在有 Supabase SQL/admin 权限时做 metadata-level RLS 复核。

### 2026-07-03 - 记录架构安全升级部署验证

- Commit: `3d50aad`
- Background: 架构审查和浏览器直连 EODHD token 路径移除已推送生产环境,需要把线上验证证据补进交接日志。
- Changes:
  - 回填架构审查与安全升级条目的 commit、部署状态和线上验证结果。
  - 记录生产 chunk、SHA256、Vercel 部署状态、GitHub Actions build 状态和未登录行情接口 401 验证。
- Key files:
  - `docs/development-log.md`
- Validation:
  - `git diff --check`: pass
- Deployment: 本次为日志回填提交;推送 `main` 后由 Vercel 自动部署,不改变运行时代码。
- Production verification: 运行时代码已在 `2bb9772` 验证通过;本次提交只补文档证据。
- Rollback: 回滚本次日志提交只会移除部署记录,不会改变应用行为。
- Follow-up: 下一步继续 Phase 0,开始 `/api/quote` timeout/provider 边界和测试基线。

### 2026-07-03 - 移除浏览器直连 EODHD token 路径

- Commit: `2bb9772`
- Background: 架构安全审查确认前端曾保留浏览器直连 EODHD WebSocket 的历史路径;即使默认关闭,未来误配置也可能暴露付费行情 token。
- Changes:
  - `App.jsx` 不再读取 `VITE_EODHD_TOKEN`,也不再建立浏览器直连 EODHD WebSocket。
  - 已登录行情刷新统一走 `/api/quote` REST 轮询,继续附带 Supabase access token。
  - 删除 `VITE_ALLOW_BROWSER_EODHD_WS` 示例环境变量和部署说明。
  - 更新设置页应用内更新日志到 `v10.7.9.48`。
  - 更新安全 runbook、README、CONTEXT 和架构安全审查文档。
- Key files:
  - `src/App.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `.env.example`
  - `README.md`
  - `docs/security-hardening.md`
  - `docs/architecture-security-audit.md`
  - `docs/development-log.md`
  - `CONTEXT.md`
  - `部署指南.md`
- Validation:
  - `git diff --check`: pass
  - `npm run build`: pass, local App chunk `App-CEVMG_lS.js` `124.04 kB`, gzip `33.10 kB`
  - `npm audit`: pass,0 vulnerabilities
  - frontend token-path grep: pass,no `import.meta.env.VITE_EODHD*`,no `new WebSocket`,no browser EODHD WS URL
  - production build scan: pass,no browser EODHD WebSocket implementation in `dist/assets`
- Deployment: 已推送 `main`,Vercel 生产部署完成。
- Production verification:
  - Remote `main`: `2bb977221dc08d54c53275b1f0be6a126d0fdab9`
  - Vercel status: success, deployment completed
  - GitHub Actions `build`: success
  - Production index chunk: `/assets/index-b3tIKfz9.js`, SHA256 `ecef8c425d14e6011902d0a581c886668be9cf2a5e5f75ed3abab7332431ddee`
  - Production App chunk: `/assets/App-yVNJsOWc.js`, `123869` bytes, SHA256 `55139c3dadab824f9db39930852f6402a392e1ece43b77547f07b00b97ba1f21`
  - Production SettingsTab chunk: `/assets/SettingsTab-C4C_Sw5U.js`, `27165` bytes, SHA256 `432291a70d225aad0d01ff1649f751d70cf0a0616836a067e1aa9678367af52b`
  - SettingsTab chunk contains `v10.7.9.48` and "前端不再读取 VITE_EODHD_TOKEN"
  - Production App/Settings chunks contain no browser EODHD token or WebSocket direct markers
  - `/api/quote?symbols=VIX` 未登录返回 `401`
- Rollback: 回滚本次提交会恢复旧的浏览器直连占位路径;不建议,除非同时有服务端 relay 替代方案。
- Follow-up: 下一步继续 Phase 0,优先给 `/api/quote` 增加 timeout/helper 边界和第一批自动化测试。

### 2026-07-03 - 完成架构安全审查和升级路线

- Commit: `2bb9772`
- Background: 用户要求在正式开发大量专业功能前,确认当前代码是否是最新架构,并做安全审查与代码升级规划,避免给未来留下 bug。
- Changes:
  - 新增 `docs/architecture-security-audit.md`。
  - 明确当前代码可以维护,但不是适合长期专业功能扩展的最终架构。
  - 记录依赖现状、架构风险、安全风险和分阶段升级路线。
  - 在 README 开发入口增加架构安全审查文档。
- Key files:
  - `docs/architecture-security-audit.md`
  - `README.md`
  - `docs/development-log.md`
- Validation:
  - `npm run build`: pass
  - `npm audit`: pass,0 vulnerabilities
  - `npm outdated --json`: React 18/Tailwind 3/lucide 旧于 latest,Vite/Supabase 当前可接受
  - code size scan: `App.jsx` 约 4300 行,`api/quote.js` 约 1100 行
  - secret grep: no real EODHD/Supabase service secret found in tracked source
- Deployment: 已随安全升级提交推送 `main`,Vercel 生产部署完成。
- Production verification:
  - `docs/architecture-security-audit.md` 已进入 GitHub `main`
  - Vercel status: success
  - GitHub Actions `build`: success
- Rollback: 回滚本次文档提交即可。
- Follow-up: 已开始 Phase 0 第一项安全代码升级;后续继续 API 边界、测试和 RLS 复核。

### 2026-07-03 - 同步设置页应用内更新日志

- Commit: `223a538`
- Background: 用户指出更新日志也必须在设置页里更新,不能只写仓库文档。
- Changes:
  - 在设置页更新日志顶部新增 `v10.7.9.47`。
  - 将设置页更新日志角标、关于页版本、JSON 备份版本号同步到 `v10.7.9.47`。
  - 保留 `v10.7.9.46` 为历史项,不再标记最新。
- Key files:
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm run build`: pass
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
  - local build SettingsTab chunk: `SettingsTab-B5SIqOMt.js`
- Deployment: 已推送 `main`,Vercel 生产部署完成。
- Production verification:
  - 线上 SettingsTab chunk: `/assets/SettingsTab-B5SIqOMt.js`
  - 线上 SettingsTab chunk 包含 `v10.7.9.47`
  - 线上 SettingsTab chunk 包含“删除已登录启动开屏”
  - GitHub Actions `CI`: success
  - `/api/quote?symbols=VIX` 未登录返回 `401`
- Rollback: 回滚本次提交即可恢复设置页旧版本号和旧日志。
- Follow-up: 后续每次用户可见更新,必须同时更新 `docs/development-log.md` 和设置页应用内更新日志。

### 2026-07-03 - 删除已登录启动开屏

- Commit: `67e8f5b`
- Background: 用户反馈软件首页启动慢,要求删除启动加载图,让首页更快进入可见状态。
- Changes:
  - 删除 `App.jsx` 中 `cloudLoading` 期间阻塞渲染的全黑 X MONEY 开屏。
  - 删除人为最短停留 1.6s 的启动等待。
  - 保留 `cloudLoading` 状态作为启动保存保护,避免云端数据未返回时把默认数据误写回 Supabase。
  - 云端同步完成后立即解除保护;若超过 2.6s 未完成,只解除保护,不再挡住主界面。
- Key files:
  - `src/App.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm run build`: pass
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
  - production App chunk splash scan: pass,`App-t_qgm7p2.js` 不再包含 `splashFadeIn`、`v4FillSimple`、`SUPABASE LIVE` 等开屏标记
  - local build App chunk: `124.30 kB`,gzip `33.18 kB`
- Deployment: 已推送 `main`,Vercel 生产部署完成。
- Production verification:
  - 生产首页 `https://boduan-tracker.vercel.app/`: `200`
  - 线上 App chunk: `/assets/App-D9SGEdyL.js`,约 `118.7 kB`
  - 线上 App chunk 不再包含 `splashFadeIn`、`v4FillSimple`、`SUPABASE LIVE` 等开屏标记
  - GitHub Actions `CI`: success
  - `/api/quote?symbols=VIX` 未登录返回 `401`
- Rollback: 回滚本次提交即可恢复旧开屏;不建议,因为会重新引入启动等待。
- Follow-up: 下一步可继续优化登录态认证检查和首页数据同步策略,减少首屏数据闪动。

### 2026-07-03 - 固化开发流程和更新日志制度

- Commit: `same commit`
- Background: 用户要求把当前开发方式写入文档,确保后续交接严格按照流程执行,并要求每次更新都写更新日志。
- Changes:
  - 新增正式开发流程文档,明确 GitHub 是唯一代码源,Vercel 是自动部署目标。
  - 明确不使用腾讯云/Vercel 控制台在线改代码作为主流程。
  - 新增强制开发日志制度和日志模板。
  - 在 README 和 CONTEXT 中增加开发流程入口。
- Key files:
  - `docs/development-process.md`
  - `docs/development-log.md`
  - `README.md`
  - `CONTEXT.md`
- Validation:
  - 文档改动,无运行时代码变更。
  - `npm run build`: pass
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
- Deployment: 文档更新推送到 GitHub 后由 Vercel 自动部署,不影响运行时。
- Production verification: 文档变更不改变运行时代码;推送后确认 GitHub `main` 和 Vercel 部署完成。
- Rollback: 回滚本次文档提交即可。
- Follow-up: 后续每次提交必须更新本文件。

### 2026-07-03 - 修复首页 tab 渲染崩溃

- Commit: `dba3c6d`
- Background: 五个 tab 拆分后,首页无法正常显示。
- Changes:
  - `HomeTab` 使用了 `alertsMuted`,但 `App.jsx` 的 `tabCtx` 没有传入该字段。
  - 在 `tabCtx` 中补充 `alertsMuted`,并在 `HomeTab.jsx` 中解构接收。
- Key files:
  - `src/App.jsx`
  - `src/tabs/HomeTab.jsx`
- Validation:
  - `npm run build`: pass
  - `git diff --check`: pass
  - tab no-undef 静态扫描: pass
  - `tabCtx` 字段覆盖检查: pass,187 个 ctx 字段全部覆盖
  - Vite SSR 直接渲染 `HomeTab`: pass
- Deployment: 已推送 `main`,Vercel 已切到新资源。
- Production verification:
  - 线上 `HomeTab-61TTdkJd.js` 已发布。
  - GitHub Actions `CI`: success。
  - `/api/quote?symbols=VIX` 未登录返回 `401`。
- Rollback: 回滚到 `b13efcf` 会重新引入首页崩溃,不建议。
- Follow-up: 继续减少 `tabCtx` 的字段数量,用业务 hooks 替代大对象传参。

### 2026-07-03 - 将已登录 App 拆成五个业务 tab chunk

- Commit: `b13efcf`
- Background: 已登录后的 `App` chunk 仍偏大,需要按首页、交易、资产、目标、设置继续拆分。
- Changes:
  - 从 `src/App.jsx` 抽出五个 lazy tab:
    - `src/tabs/HomeTab.jsx`
    - `src/tabs/TradesTab.jsx`
    - `src/tabs/AnalysisTab.jsx`
    - `src/tabs/ReviewTab.jsx`
    - `src/tabs/SettingsTab.jsx`
  - `App.jsx` 改为按 `activeTab` 懒加载业务 tab。
  - `vite.config.js` 增加 tab chunk 的 preload 过滤,避免首页提前拉取。
- Key files:
  - `src/App.jsx`
  - `src/tabs/*.jsx`
  - `vite.config.js`
- Validation:
  - `npm run build`: pass
  - `npm audit`: pass,0 vulnerabilities
  - `git diff --check`: pass
  - 本地 preview smoke check: pass
- Deployment: 已推送 `main`,Vercel 已部署。
- Production verification:
  - 首页 HTML 只 preload runtime 和 React vendor。
  - 已登录 `App` chunk 从约 `279 KB` 降到线上约 `124 KB`。
  - 五个 tab chunk 均为独立按需资源。
  - `/api/quote?symbols=VIX` 未登录返回 `401`。
- Rollback: 可回滚到 `d249b58`,但会恢复更大的已登录 App chunk。
- Follow-up: 把 `tabCtx` 拆成更小的 feature hooks,降低维护复杂度。

### 2026-07-03 - 拆分认证入口和已登录 App 包

- Commit: `d249b58`
- Background: 未登录首屏不应该提前加载 Supabase、App、Login、icons 等大块。
- Changes:
  - 新增 `src/AuthGate.jsx`,把认证判定从主入口拆出。
  - `src/main.jsx` 改为先加载轻量入口,登录页和已登录 App 按需加载。
  - `vite.config.js` 拆分 React vendor、Supabase、icons 等 chunk,并过滤不必要 preload。
- Key files:
  - `src/AuthGate.jsx`
  - `src/main.jsx`
  - `src/Login.jsx`
  - `src/App.jsx`
  - `vite.config.js`
- Validation:
  - `npm run build`: pass
  - `npm audit`: pass
  - 本地和线上首页 preload 检查: pass
- Deployment: 已推送 `main`,Vercel 已部署。
- Production verification:
  - 未登录 HTML 不再提前 preload App/Login/Supabase/icons。
  - 登录页 smoke check 正常。
- Rollback: 可回滚到 `96c5e0e`,但会恢复登录前大包问题。
- Follow-up: 继续拆已登录 App 内部业务块。

### 2026-07-03 - 接手安全基线治理

- Commit: `96c5e0e`
- Background: 项目由手工快速开发而来,存在公开密钥、弱鉴权、RLS 和工程流程风险,需要建立可接手基线。
- Changes:
  - 新增 `.env.example`、`.gitignore`、GitHub Actions CI。
  - 加固 `api/quote.js`,默认要求 Supabase access token。
  - 移除重复/陈旧 quote 实现。
  - 更新 README 和安全加固 runbook。
  - 新增 `supabase/rls.sql`。
- Key files:
  - `api/quote.js`
  - `src/lib/supabase.js`
  - `src/lib/db.js`
  - `supabase/rls.sql`
  - `docs/security-hardening.md`
  - `.github/workflows/ci.yml`
- Validation:
  - `npm run build`: pass
  - `npm audit`: pass
  - GitHub Actions `CI`: success
- Deployment: 已推送 `main`,Vercel 已部署。
- Production verification:
  - `/api/quote?symbols=VIX` 未登录返回 `401`。
  - Vercel 环境变量已改为服务端 `EODHD_API_KEY`。
- Rollback: 不建议回滚,会重新打开关键安全风险。
- Follow-up: 保持 RLS、quote API 鉴权和 secret hygiene 为长期底线。
