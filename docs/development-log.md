# Development Log

本文件记录 `boduan-tracker` 的每次可维护更新。任何代码、配置、部署、安全或文档改动,都必须在同一个提交中追加日志。

## 2026-07-03 Asia/Shanghai

### 2026-07-03 - 同步设置页应用内更新日志

- Commit: `same commit`
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
- Deployment: pending
- Production verification: pending
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
