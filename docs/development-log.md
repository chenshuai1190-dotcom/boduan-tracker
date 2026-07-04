# Development Log

本文件记录 `boduan-tracker` 的每次可维护更新。任何代码、配置、部署、安全或文档改动,都必须在同一个提交中追加日志。

## 2026-07-04 Asia/Shanghai

### 2026-07-04 - 微调持仓分布当日盈亏露出宽度

- Commit: same commit
- Background: 用户根据最新手机截图反馈交易页持仓分布已接近目标,但当日盈亏末尾数字仍差一点点完整露出,希望市值再往左移动一点点。
- Changes:
  - 固定名称/代码列从 `minmax(104px,0.78fr)` 微调为 `minmax(100px,0.72fr)`,释放约 4px 首屏宽度。
  - 名称列右侧 padding 从 `pr-2` 收紧为 `pr-1.5`,避免挤压右侧指标区。
  - 右侧横向指标区总宽从 `474px` 收紧为 `448px`。
  - 右侧列宽从 `84px/80px/118px/116px/52px` 微调为 `80px/76px/118px/112px/46px`,保持当日盈亏列 `118px` 不变。
  - 右侧列间距从 `gap-1.5` 收紧为 `gap-1`,让市值/数量和现价/成本整体更靠左。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.81`。
  - 同步更新 `docs/handoff.md`,标记本次微调待部署回填。
- Key files:
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/handoff.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 46 tests.
  - `npm run build`: pass; `TradesTab-4yE9p-D5.js` 46.08 kB / gzip 9.99 kB, `SettingsTab-BAurU2i9.js` 28.09 kB / gzip 11.07 kB, `App-QDn34Osy.js` 131.64 kB / gzip 36.76 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass, 13 user-owned tables returned 0 visible rows for anonymous REST probes.
  - Local build marker check: pass; built TradesTab chunk contains `grid-cols-[minmax(100px,0.72fr)_minmax(0,3.35fr)]`, `pr-1.5`, `min-w-[448px]`, `grid-cols-[80px_76px_118px_112px_46px]` and `gap-1`; built SettingsTab chunk contains `v10.7.9.81`, `微调交易持仓分布首屏列宽` and `市值/数量和现价/成本再左移一点`.
- Deployment: pending.
- Production verification: pending.
- Rollback: 回滚本次改动会恢复 v10.7.9.80 的持仓分布列宽,当日盈亏末尾数字可能再次差一点点露出。

### 2026-07-04 - 继续优化交易持仓分布首屏宽度

- Commit: `27404fd58bed23a07c4afc2938ad448cf0f62c13`
- Background: 用户根据手机截图继续反馈交易页持仓分布移动端首屏宽度问题:持仓表两侧内部留白仍偏宽,名称/代码列和市值列占用空间过多,打开首屏时当日盈亏仍容易只显示一部分。
- Changes:
  - 交易页持仓分布内容区左右 padding 从 `px-3.5` 继续收紧为 `px-2`,让表格更贴近用户标红的两侧边框。
  - 固定名称/代码列从 `minmax(118px,1.22fr)` 压缩为 `minmax(104px,0.78fr)`,释放更多首屏宽度给右侧指标区。
  - 右侧横向指标区总宽从 `528px` 收紧为 `474px`,列间距从 `gap-2` 降到 `gap-1.5`。
  - 右侧前两列从 `90px/88px` 收窄为 `84px/80px`,当日盈亏保持 `118px`,使默认首屏更容易完整显示当日盈亏。
  - 市值数字字号略收紧并增加截断保护,避免窄列内容挤压后续盈亏列。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.80`。
  - 同步更新 `docs/handoff.md`,记录本次持仓分布布局优化和部署验证证据。
- Key files:
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/handoff.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 46 tests.
  - `npm run build`: pass; `TradesTab-B94L94JQ.js` 46.08 kB / gzip 9.99 kB, `SettingsTab-D9Ijm0MX.js` 27.88 kB / gzip 11.01 kB, `App-223ZIj9N.js` 131.64 kB / gzip 36.76 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass, 13 user-owned tables returned 0 visible rows for anonymous REST probes.
  - Local build marker check: pass; built TradesTab chunk contains `px-2 py-4`, `grid-cols-[minmax(104px,0.78fr)_minmax(0,3.2fr)]`, `min-w-[474px]`, `grid-cols-[84px_80px_118px_116px_52px]` and `gap-1.5`; built SettingsTab chunk contains `v10.7.9.80`, `继续优化交易持仓分布` and `首屏更完整显示当日盈亏`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - Runtime commit: `27404fd58bed23a07c4afc2938ad448cf0f62c13`.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/DXVViZc8RvPC4ngUEm9S3NJtchNd`.
  - Production `GET https://boduan-tracker.vercel.app/?v=27404fd-runtime`: HTTP 200.
  - Production entry chunk: `/assets/index-CttjM15V.js`.
  - Production runtime chunks: `/assets/TradesTab-B94L94JQ.js`, `/assets/SettingsTab-D9Ijm0MX.js`, `/assets/supabase-CcYdvS9P.js`, `/assets/supabase-BfiA1a3S.js`.
- Production verification:
  - Production TradesTab marker check: `TradesTab-B94L94JQ.js` contains `px-2 py-4`, `grid-cols-[minmax(104px,0.78fr)_minmax(0,3.2fr)]`, `min-w-[474px]` and `grid-cols-[84px_80px_118px_116px_52px]`.
  - Production SettingsTab marker check: `SettingsTab-D9Ijm0MX.js` contains `v10.7.9.80`, `继续优化交易持仓分布` and `首屏更完整显示当日盈亏`.
  - Production RLS REST check: pass, 13 user-owned tables returned 0 visible rows; source chunks `/assets/supabase-CcYdvS9P.js` and `/assets/supabase-BfiA1a3S.js`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复持仓分布较宽的内部留白、名称/代码列和右侧指标列宽,移动端首屏当日盈亏可能再次显示不完整。

### 2026-07-04 - 优化首页指数卡和交易持仓表宽度

- Commit: `ccc064bcd1d929106e63f53122aa51491bfdf399`
- Background: 用户根据手机截图反馈两个移动端布局问题:首页四大指数区域的价格数字太靠右,BTC 卡片最明显、几乎被撑出卡片;交易页持仓分布里股票信息显示不够,且当日盈亏列容易显示不完整。
- Changes:
  - 首页四张市场卡保留原有标题和状态徽标排版,统一将价格数字左移并略微收紧字号,避免右侧被撑出且保持视觉一致。
  - 交易页持仓分布外层横向 padding 从 `p-4` 收紧为 `px-3.5 py-4`,给表格更多可用宽度。
  - 交易页持仓分布左侧股票信息列从 `minmax(100px,1.05fr)` 加宽到 `minmax(118px,1.22fr)`,右侧指标区同步调宽。
  - 交易页右侧指标列将 `当日盈亏` 和 `持仓盈亏` 加宽到 `118px`,并把 `市值/数量` 改为左对齐,使市值更靠左、盈亏金额更完整。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.79`。
  - 按记录文件同步准则更新 `docs/handoff.md`,记录本次用户可见版本变化。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/handoff.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 46 tests.
  - `npm run build`: pass; `HomeTab-BGMLsK0v.js` 39.11 kB / gzip 10.44 kB, `TradesTab-w_N8hPA8.js` 46.06 kB / gzip 9.98 kB, `SettingsTab-c6HRVu7v.js` 27.62 kB / gzip 10.92 kB, `App-BcMo3SGL.js` 131.64 kB / gzip 36.77 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass, 13 user-owned tables returned 0 visible rows for anonymous REST probes.
  - Local build marker check: pass; built HomeTab chunk contains `-ml-1 whitespace-nowrap text-[14px]`, built TradesTab chunk contains `grid-cols-[minmax(118px,1.22fr)_minmax(0,2.55fr)]` and `grid-cols-[90px_88px_118px_118px_74px]`, built SettingsTab chunk contains `v10.7.9.79` and `首页四张市场卡价格数字统一左移`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - Runtime commit: `ccc064bcd1d929106e63f53122aa51491bfdf399`.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/FHyovruvLL3L24jfjy85sGAxxy2W`.
  - Production `GET https://boduan-tracker.vercel.app/?v=ccc064b-initial`: HTTP 200.
  - Production entry chunk: `/assets/index-kdBrS5rh.js`.
  - Production runtime chunks: `/assets/App-FRlt4neK.js`, `/assets/HomeTab-BGMLsK0v.js`, `/assets/TradesTab-w_N8hPA8.js`, `/assets/SettingsTab-c6HRVu7v.js`.
- Production verification:
  - Production HomeTab marker check: `HomeTab-BGMLsK0v.js` contains `-ml-1 whitespace-nowrap text-[14px]` for the unified market-card price line.
  - Production TradesTab marker check: `TradesTab-w_N8hPA8.js` contains `grid-cols-[minmax(118px,1.22fr)_minmax(0,2.55fr)]` and `grid-cols-[90px_88px_118px_118px_74px]`.
  - Production SettingsTab marker check: `SettingsTab-c6HRVu7v.js` contains `v10.7.9.79` and `首页四张市场卡价格数字统一左移`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复首页市场卡较宽的内边距/价格字号和交易页旧持仓表列宽,移动端 BTC 卡片和当日盈亏列可能再次被挤压。

### 2026-07-04 - 固化记录文件同步规则

- Commit: same commit
- Background: 用户要求把“每次改进都要同步更新相关记录文件的日志内容,避免漏掉或互相不一致”写入开发准则。
- Changes:
  - 在 `docs/development-process.md` 的开发日志步骤中新增记录文件同步规则。
  - 明确 `docs/handoff.md` 是给下一位接手工程师或 AI 代理使用的产品交接入口和当前状态快照,不是开发日志替代品。
  - 将 `docs/handoff.md` 纳入 source of truth 列表,并要求接手时先读交接文档。
  - 明确每次改进收尾时必须核对 `docs/development-log.md`、`docs/handoff.md`、`README.md`、`docs/security-hardening.md`、`docs/architecture-security-audit.md` 和设置页更新日志/版本号。
  - 明确当前 `main`/关键 commit/部署状态/线上验证、设置页版本、产品规则、安全边界、配置、代码地图、风险或下一步优先级变化时,必须同步更新 `docs/handoff.md`。
  - 明确用户可见更新、产品状态、部署状态、安全基线或交接规则变化必须同步更新对应记录面,不能只改其中一个文件。
- Key files:
  - `docs/development-process.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 46 tests.
  - `npm run build`: pass; docs-only change, runtime chunks unchanged from current local build (`SettingsTab-Cm6OKwzN.js`, `App-UM18uLNm.js`, `HomeTab-CHpB9Zxg.js`).
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: not run; documentation rule update is local pending commit/push.
- Production verification: not run; no runtime behavior changed.
- Rollback: 回滚本次文档改动会移除记录文件一致性准则,后续改进更容易出现设置页、交接文档、安全文档和开发日志不同步。

### 2026-07-04 - 刷新产品交接文档

- Commit: same commit
- Background: 用户准备把项目交接给下一位同事,原 `docs/handoff.md` 仍停留在 `v10.7.9.66`、`d8014814` 和旧部署证据,已经落后于自选/持仓升级、BTC relay、PWA 图标、找回密码和 Supabase Auth URL 配置修复。
- Changes:
  - 将 `docs/handoff.md` 重写为中文产品交接文档。
  - 更新当前 GitHub main、最近应用代码提交、设置页版本、Vercel 部署、Supabase Auth 配置和线上验证证据。
  - 补充当前产品规则:自选和持仓拆分、交易主账本口径、BTC 独立实时行情、找回密码 recovery 逻辑和设置页更新纪律。
  - 补充可直接转发给下一位同事的交接话术。
- Key files:
  - `docs/handoff.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 46 tests.
  - `npm run build`: pass; `Login-BhhvU4kS.js` 9.39 kB / gzip 3.23 kB, `SettingsTab-Cm6OKwzN.js` 27.35 kB / gzip 10.82 kB, `App-UM18uLNm.js` 131.64 kB / gzip 36.77 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass after removing trailing blank line.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables return `visibleRows=0` for anonymous REST probes.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - Handoff refresh commit: `4cc1be3a944cd506be50f448c22e3e4cc007b912`.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/2BaceuAUR88PUrFqdom3xiVYrehH`.
- Production verification:
  - `GET https://boduan-tracker.vercel.app/?v=handoff-4cc1be3`: HTTP 200 from Vercel.
  - Unauthenticated `GET /api/quote?symbols=VIX`: HTTP 401 with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次文档改动会恢复旧交接状态,其中版本、部署和找回密码配置说明会再次过期。

### 2026-07-04 - 修复找回密码回跳兼容

- Commit: `b7a0e48371cf74da200fb2d6e760117afffdf786`
- Background: 用户反馈 Supabase 找回密码邮件打开后跳到 `localhost:3000/#error=access_denied&error_code=otp_expired...`,手机端无法访问,且链接容易失效。排查发现邮件中的 `redirect_to` 仍为 `http://localhost:3000`;这是 Supabase Auth URL Configuration / 邮件模板配置问题。同时前端只识别旧的 `#type=recovery` hash,不能稳定处理 Supabase PKCE `?code=...` 回跳。
- Changes:
  - 找回密码请求的 `redirectTo` 固定为生产域名 `https://boduan-tracker.vercel.app`。
  - 新增 `src/lib/authRecovery.js`,统一解析 Supabase recovery 回跳参数。
  - `AuthGate` 兼容 `#type=recovery`、`?code=...`、`error_code` 和 `error_description` 等 recovery 回跳。
  - 登录页在过期链接回跳时直接展示“重置链接已失效,请重新发送重置链接”,并回到找回密码模式。
  - 设置新密码前会尝试消费 URL 中的一次性 `code`,避免有效 recovery 链接进入后没有 session 导致更新失败。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.78`。
- Required Supabase Auth configuration:
  - Completed 2026-07-04 via Supabase Dashboard.
  - Site URL 已从 `http://localhost:3000` 改为 `https://boduan-tracker.vercel.app`。
  - Redirect URLs 已确认存在 `https://boduan-tracker.vercel.app/**`。
  - Reset password 邮件模板已确认使用 `{{ .ConfirmationURL }}` 作为重置链接,未使用 `{{ .SiteURL }}` 自行拼链接。
- Key files:
  - `src/lib/authRecovery.js`
  - `src/lib/supabase.js`
  - `src/AuthGate.jsx`
  - `src/Login.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/auth-recovery.test.js`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 46 tests.
  - `npm run build`: pass; `Login-BhhvU4kS.js` 9.39 kB / gzip 3.23 kB, `supabase-VDMVHqcp.js` 1.21 kB / gzip 0.65 kB, `SettingsTab-Cm6OKwzN.js` 27.35 kB / gzip 10.82 kB, `App-UM18uLNm.js` 131.64 kB / gzip 36.77 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades`, `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local dist marker check: pass; `index-B6hUxu6G.js` contains `https://boduan-tracker.vercel.app`, recovery parser markers and `重置链接已失效`; `supabase-VDMVHqcp.js` contains `exchangeCodeForSession`; `SettingsTab-Cm6OKwzN.js` contains `v10.7.9.78` and `修复找回密码回跳`.
  - Pre-deploy production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - Code commit: `b7a0e48371cf74da200fb2d6e760117afffdf786`.
  - Documentation commit: `182366ab0f6ea9e7ac2a276dd55247c85cd935d0`.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/D1A31LfoKzxpSZST18ALauEDkYZu`.
  - `GET https://boduan-tracker.vercel.app/?v=182366a`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-CQLYX_ud.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`.
  - Production runtime chunks: `/assets/Login-Csb10EdR.js`, `/assets/App-VS3FgzvJ.js`, `/assets/supabase-CcYdvS9P.js`, `/assets/supabase-DSYL9ExE.js`, `/assets/SettingsTab-Cm6OKwzN.js`.
- Production verification:
  - Production chunk marker check: `SettingsTab-Cm6OKwzN.js` contains `v10.7.9.78` and `修复找回密码回跳`.
  - Production auth chunk marker check: `supabase-CcYdvS9P.js` and `supabase-DSYL9ExE.js` contain `exchangeCodeForSession`; `index-CQLYX_ud.js` contains `https://boduan-tracker.vercel.app`.
  - Production login chunk marker check: `Login-Csb10EdR.js` contains `重置链接已失效`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
  - Production relay HTTP check: `GET /api/btc-realtime` returned `426` with `请使用 WebSocket 连接 /api/btc-realtime`.
  - Supabase Auth dashboard configuration: pass; URL Configuration reload 后 `SITE_URL=https://boduan-tracker.vercel.app`,页面包含 `https://boduan-tracker.vercel.app/**`,Reset password 模板正文为 `{{ .ConfirmationURL }}` 链接。
- Rollback: 回滚本次改动会恢复找回密码使用当前浏览器 origin 的旧行为,并且前端只识别 `#type=recovery`;Supabase Auth 后台若仍指向 localhost,邮件链接仍会跳到本地地址。

### 2026-07-04 - 修复 PWA 手机桌面图标白边

- Commit: `db79729bfc3e856f5f8064ec4d9874dd7981d88a`
- Background: 用户安装到 iOS 主屏后反馈 X MONEY 图标外侧出现明显白色边缘。根因是上一版图标保留透明外沿,在浅色壁纸/系统图标背景上会透出白色边框;手机桌面图标应使用不透明底图。
- Changes:
  - 将 `512x512`, `192x192`, `180x180`, `32x32`, `16x16` 五个 PNG 图标全部改为不透明深色底。
  - 保留黑金 K 线主体和图标构图,只移除透明外沿导致的白边。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.77`。
- Key files:
  - `public/icon-512.png`
  - `public/icon-192.png`
  - `public/apple-touch-icon.png`
  - `public/favicon-32.png`
  - `public/favicon-16.png`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - Local icon check: pass; `public/icon-512.png`, `public/icon-192.png`, `public/apple-touch-icon.png`, `public/favicon-32.png`, `public/favicon-16.png` 均为 PNG RGB,尺寸分别为 `512x512`, `192x192`, `180x180`, `32x32`, `16x16`,且 `hasAlpha=no`。
  - Icon SHA256: `icon-512.png` = `b7b44d3b731f4630f69b5f79aca42639e4de89baf9ab2ffa3a72389e83c9d3e9`, `apple-touch-icon.png` = `9c5418bcfe67cf5302793c4ab4512ac78375215d72c88ef996131554e8942995`。
  - Local manifest/index check: pass; `manifest.json` icons continue to point to `/icon-192.png` and `/icon-512.png`, `index.html` continues to point to `/favicon-32.png`, `/favicon-16.png`, `/apple-touch-icon.png` and `/manifest.json`。
  - `npm test`: pass, 41 tests.
  - `npm run build`: pass; `SettingsTab-BAP9xbbD.js` 27.10 kB / gzip 10.73 kB, `App-5LIL82wQ.js` 131.64 kB / gzip 36.77 kB, `HomeTab-CHpB9Zxg.js` 39.10 kB / gzip 10.43 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades`, `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local dist marker check: pass; dist icon files are PNG RGB and `hasAlpha=no`, `SettingsTab-BAP9xbbD.js` contains `v10.7.9.77` and `修复手机桌面图标白边`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/6UF4seTNFjjqwzgyH6hF1hUCetqU`.
  - `GET https://boduan-tracker.vercel.app/?v=f5e21b0`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-uTBj8jV3.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-BQcgsNXo.css`.
  - Production runtime chunks: `/assets/App-DOgJ04H1.js`, `/assets/HomeTab-CHpB9Zxg.js`, `/assets/SettingsTab-BAP9xbbD.js`.
- Production verification:
  - Production manifest/index check: pass; `manifest.json` still points to `/icon-192.png` and `/icon-512.png`, production HTML still points to `/favicon-32.png`, `/favicon-16.png`, `/apple-touch-icon.png` and `/manifest.json`.
  - Production icon check: pass; `/icon-512.png`, `/icon-192.png`, `/apple-touch-icon.png`, `/favicon-32.png`, `/favicon-16.png` all return PNG RGB with the expected dimensions and `hasAlpha=no`.
  - Production icon SHA256 matches local: `icon-512.png` = `b7b44d3b731f4630f69b5f79aca42639e4de89baf9ab2ffa3a72389e83c9d3e9`, `apple-touch-icon.png` = `9c5418bcfe67cf5302793c4ab4512ac78375215d72c88ef996131554e8942995`.
  - Production chunk marker check: `SettingsTab-BAP9xbbD.js` contains `v10.7.9.77` and `修复手机桌面图标白边`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
  - GitHub Actions workflow run lookup for `f5e21b0` returned no workflow runs; combined commit status contains Vercel success.
- Rollback: 回滚本次改动会恢复透明外沿 PNG,在 iOS 浅色壁纸上可能再次显示白色边缘;不影响 `/api/quote` 鉴权、Supabase RLS、交易账本或行情功能。

### 2026-07-04 - 更新 PWA 手机桌面图标

- Commit: `30109e586e1ca3048ec5a19e42423cb7aecaacc6`
- Background: 用户提供新的黑金 K 线箭头图标,要求替换“保存到网页版到手机”的桌面 logo;原 manifest 和 iOS 主屏图标仍指向旧 `favicon.svg`,手机安装入口不会使用新 PNG 图标。
- Changes:
  - 从用户提供的图标文件中抠出主体并生成透明 PNG 图标。
  - 更新 PWA 安装图标为 `192x192` 和 `512x512` PNG。
  - 更新 iOS `apple-touch-icon` 为 `180x180` PNG。
  - 更新浏览器 favicon 为 `16x16` 和 `32x32` PNG。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.76`。
- Key files:
  - `index.html`
  - `public/manifest.json`
  - `public/icon-192.png`
  - `public/icon-512.png`
  - `public/apple-touch-icon.png`
  - `public/favicon-16.png`
  - `public/favicon-32.png`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - 用户提供的源文件为 JPEG 且无透明通道;已用本机图像处理移除边缘连通棋盘格背景,生成 RGBA PNG 图标。
  - Local icon check: pass; `public/icon-512.png`, `public/icon-192.png`, `public/apple-touch-icon.png`, `public/favicon-32.png`, `public/favicon-16.png` 均为 PNG RGBA,尺寸分别为 `512x512`, `192x192`, `180x180`, `32x32`, `16x16`,且 `hasAlpha=yes`。
  - Icon SHA256: `icon-512.png` = `5d235acb636d1c7ce21303ecdc8a2188fcf44233884570fb14a9cbea361618e1`, `apple-touch-icon.png` = `06e2000342f98c0665b81b3e042c8d8039a552a3416344661cd7d182239f5d2d`。
  - Local manifest/index check: pass; `manifest.json` icons point to `/icon-192.png` and `/icon-512.png`, `index.html` points to `/favicon-32.png`, `/favicon-16.png`, `/apple-touch-icon.png` and `/manifest.json`。
  - `npm test`: pass, 41 tests.
  - `npm run build`: pass; `SettingsTab-8PvNnP1R.js` 26.90 kB / gzip 10.66 kB, `App-DLS1Yl4g.js` 131.64 kB / gzip 36.77 kB, `HomeTab-CHpB9Zxg.js` 39.10 kB / gzip 10.43 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades`, `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local dist marker check: pass; `dist/manifest.json` and `dist/index.html` point to the new PNG icons, dist icon files retain RGBA alpha, and `SettingsTab-8PvNnP1R.js` contains `v10.7.9.76` and `更新手机桌面图标`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/5wZL6Xjc2Dc19MN1PGig3SdVFNUu`.
  - `GET https://boduan-tracker.vercel.app/?v=a5e3629`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-2Bu3JjEJ.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-BQcgsNXo.css`.
  - Production runtime chunks: `/assets/App-CT6agu4P.js`, `/assets/HomeTab-CHpB9Zxg.js`, `/assets/SettingsTab-8PvNnP1R.js`.
- Production verification:
  - Production manifest/index check: pass; `manifest.json` points to `/icon-192.png` and `/icon-512.png`, production HTML points to `/favicon-32.png`, `/favicon-16.png`, `/apple-touch-icon.png` and `/manifest.json`.
  - Production icon check: pass; `/icon-512.png`, `/icon-192.png`, `/apple-touch-icon.png`, `/favicon-32.png`, `/favicon-16.png` all return PNG RGBA with the expected dimensions and `hasAlpha=yes`.
  - Production icon SHA256 matches local: `icon-512.png` = `5d235acb636d1c7ce21303ecdc8a2188fcf44233884570fb14a9cbea361618e1`, `apple-touch-icon.png` = `06e2000342f98c0665b81b3e042c8d8039a552a3416344661cd7d182239f5d2d`.
  - Production chunk marker check: `SettingsTab-8PvNnP1R.js` contains `v10.7.9.76` and `更新手机桌面图标`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
  - GitHub Actions workflow run lookup for `a5e3629` returned no workflow runs; combined commit status contains Vercel success.
- Rollback: 回滚本次改动会恢复旧 `favicon.svg` 作为 PWA/手机桌面图标;不影响 `/api/quote` 鉴权、Supabase RLS、交易账本或行情功能。

### 2026-07-04 - 修复 BTC 首屏卡片错位

- Commit: `4fded56e0bcf22cdffb030c890a525ba13657c2f`
- Background: 用户反馈首页首屏加载时 BTC 卡片位置有小问题。根因是 BTC WebSocket tick 可能早于 `INDICES` REST 首次返回,旧逻辑会在市场卡数组为空时单独创建一张 BTC 卡,导致 BTC 临时出现在市场卡第一格,三大指数为空白。
- Changes:
  - `applyBtcTickToMarketCards` 不再在市场卡未初始化时追加独立 BTC 卡。
  - BTC 实时 tick 仍会缓存到 `btcRealtimeRef`,等 `INDICES` REST 首次返回四张市场卡后,再覆盖更新第四张 BTC 卡。
  - 新增单元测试覆盖空市场卡数组收到 BTC tick 时不渲染单张 BTC,以及四张市场卡加载后正确更新 BTC 第四格。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.75`。
- Key files:
  - `src/lib/btcRealtime.js`
  - `tests/btc-realtime.test.js`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 41 tests.
  - `npm run build`: pass; `App-5euJp5go.js` 131.64 kB / gzip 36.77 kB, `HomeTab-CHpB9Zxg.js` 39.10 kB / gzip 10.43 kB, `SettingsTab-CEMAwGfU.js` 26.64 kB / gzip 10.54 kB, `btcRealtime-BPO454lO.js` 0.82 kB / gzip 0.46 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades`, `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local chunk marker check: pass; built chunks contain `v10.7.9.75`, `修复 BTC 首屏卡片错位`, and `BTC-USD.CC`; built frontend chunks contain no `ws.eodhistoricaldata.com` browser-direct URL.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/EiwpeSUPH4sHWD9F3RCQkN5QnSEJ`.
  - `GET https://boduan-tracker.vercel.app/?v=4fded56`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-PNOjm5C0.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-BQcgsNXo.css`.
  - Production runtime chunks: `/assets/App-BLOPKNTS.js`, `/assets/HomeTab-CHpB9Zxg.js`, `/assets/SettingsTab-CEMAwGfU.js`, `/assets/btcRealtime-BPO454lO.js`.
- Production verification:
  - Production chunk marker check: `btcRealtime-BPO454lO.js` contains `BTC-USD.CC` and `BTCUSD`, contains the new no-standalone-card fallback shape, and does not contain `ws.eodhistoricaldata.com`.
  - Production chunk marker check: `App-BLOPKNTS.js` contains `/api/btc-realtime` and `xmoney-btc`, and does not contain `ws.eodhistoricaldata.com`; `SettingsTab-CEMAwGfU.js` contains `v10.7.9.75` and `修复 BTC 首屏卡片错位`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
  - Production relay HTTP check: `GET /api/btc-realtime` returned `426` with `请使用 WebSocket 连接 /api/btc-realtime`.
  - GitHub Actions workflow run lookup for `4fded56` returned no workflow runs; combined commit status contains Vercel success.
- Rollback: 回滚本次改动会恢复 BTC tick 可在市场卡未初始化时单独创建 BTC 卡的旧行为,首屏可能再次出现 BTC 临时占第一格的问题;不影响 `/api/quote` 鉴权、WebSocket relay 鉴权或交易数据。

### 2026-07-04 - BTC 单币种独立实时行情

- Commit: `a74433f806067990a31166922163eebd0387e1c6`
- Background: 用户确认 BTC 是 24h 交易资产,不应继续完全跟随美股交易时段的 `INDICES` REST 轮询;项目安全基线要求禁止浏览器直连 EODHD WebSocket,因此需要先做单币种服务端 relay,只让前端连接本站已登录 WebSocket。
- Changes:
  - 新增 `/api/btc-realtime` Vercel WebSocket Function,在 upgrade 前校验请求 origin、Supabase access token 和服务端 `EODHD_API_KEY`。
  - 新增服务端 BTC relay,每个 Function 实例共享一个上游 EODHD `wss://ws.eodhistoricaldata.com/ws/crypto` 连接并订阅 `BTC-USD`,下游多浏览器共享同一条上游连接。
  - 前端首页 BTC 卡独立连接本站 WebSocket relay,接收 `BTC-USD` tick 后只更新 BTC 市场卡,并保留原有指数和股票 REST 刷新逻辑。
  - BTC tick 前端更新节流到最多每秒一次;连接断开或 15 秒无 tick 时自动重连,并单独用已鉴权 `/api/quote?symbols=INDICES` REST 兜底更新 BTC。
  - BTC 市场卡新增 `LIVE` / `REST` / `连接中` / `暂停` / `延迟` 状态标识。
  - 新增 `ws` 服务端依赖和 BTC WebSocket 解析/鉴权单元测试。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.74`。
- Key files:
  - `api/btc-realtime.js`
  - `server/realtime/btc.js`
  - `server/realtime/btcRelay.js`
  - `server/realtime/auth.js`
  - `server/quote/auth.js`
  - `src/App.jsx`
  - `src/lib/btcRealtime.js`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/btc-realtime.test.js`
  - `package.json`
  - `package-lock.json`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 40 tests.
  - `npm run build`: pass; `App-B2E91SOE.js` 131.64 kB / gzip 36.76 kB, `HomeTab-DFb0eupU.js` 39.10 kB / gzip 10.43 kB, `SettingsTab-DkqTFg-n.js` 26.42 kB / gzip 10.45 kB, `btcRealtime-Ko1pACcK.js` 0.84 kB / gzip 0.46 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades`, `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local chunk marker check: pass; built `App-B2E91SOE.js` contains `/api/btc-realtime` and `xmoney-btc`; built `SettingsTab-DkqTFg-n.js` contains `v10.7.9.74` and `BTC 单币种独立实时行情`; built frontend chunks contain no `ws.eodhistoricaldata.com` browser-direct URL.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/8aFt9a3ZMA9GwUkFVfoHGKdk7FUu`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-pTmihQos.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-BQcgsNXo.css`.
  - Production runtime chunks: `/assets/App-CnNRQWBQ.js`, `/assets/HomeTab-DFb0eupU.js`, `/assets/SettingsTab-DkqTFg-n.js`, `/assets/btcRealtime-Ko1pACcK.js`.
- Production verification:
  - Production chunk marker check: `App-CnNRQWBQ.js` contains `/api/btc-realtime`, `xmoney-btc`, and `BTC 实时连接中断`; `App-CnNRQWBQ.js` does not contain `ws.eodhistoricaldata.com`.
  - Production chunk marker check: `HomeTab-DFb0eupU.js` contains `LIVE`, `REST`, `连接中`, and `延迟`; `SettingsTab-DkqTFg-n.js` contains `v10.7.9.74`, `BTC 单币种独立实时行情`, and `服务端 WebSocket relay`; `btcRealtime-Ko1pACcK.js` contains `BTC-USD.CC`, `BTCUSD`, and `BTC/美元`, and does not contain `ws.eodhistoricaldata.com`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
  - Production relay HTTP check: `GET /api/btc-realtime` returned `426` with `请使用 WebSocket 连接 /api/btc-realtime`.
  - Production relay auth check: unauthenticated WebSocket upgrade to `wss://boduan-tracker.vercel.app/api/btc-realtime` with origin `https://boduan-tracker.vercel.app` returned `401`.
  - GitHub Actions workflow run lookup for `a74433f` returned no workflow runs; combined commit status contains Vercel success.
- Rollback: 回滚本次改动会让 BTC 市场卡重新只依赖 `INDICES` REST 轮询;不会影响 `/api/quote` 鉴权、Supabase RLS、交易账本或自选数据。

### 2026-07-04 - 修复卖出后累计收益率口径

- Commit: `5228f9c7723afdc1cc12b1f513bf40b79e4bf489`
- Background: 用户反馈有卖出记录的账户累计收益率明显偏低;截图中总资产 `$670,694.84`、累计盈亏 `$113,086.89` 按当前实际成本应约为 `113,086.89 / (670,694.84 - 113,086.89) = 20.29%`,但页面显示 `11.18%`。根因是收益率分母使用了历史总买入额 `totalBuyCost`,卖出后已结转成本仍留在分母里,导致有卖出记录账户被低估;无卖出记录账户不暴露该问题。
- Changes:
  - 主交易账本派生逻辑明确区分历史买入总额 `totalBuyCost`、剩余会计成本 `remainingCost` 和当前实际收益率分母 `returnCostBasis`。
  - 卖出按时间正序使用移动均价结转成本,只关闭当前实际持有股数;超过当前持仓数量的异常卖出记录计入 `ignoredSellShares`,不参与盈亏。
  - 个股持仓盈亏百分比改为 `totalPnl / returnCostBasis`,不再使用历史买入总额。
  - 首页和交易页顶部累计收益率改为 `cumulativePnl / (positionsMarketValue - cumulativePnl)`,正常卖出盈利会正确摊薄当前实际持仓成本。
  - 补充单元测试覆盖卖出后收益率口径、卖出摊薄成本和超卖边界。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.73`。
- Key files:
  - `src/lib/investmentSummary.js`
  - `tests/investment-summary.test.js`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 35 tests.
  - `npm run build`: pass; `App-CN4Z7Q6i.js` 128.12 kB / gzip 35.56 kB, `SettingsTab-BLE4HkOM.js` 26.16 kB / gzip 10.34 kB, `HomeTab-C1sT2srr.js` 38.36 kB / gzip 10.17 kB, `TradesTab-BnuMo9HL.js` 46.05 kB / gzip 9.97 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades`, `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local chunk marker check: pass; built `App-CN4Z7Q6i.js` contains `returnCostBasis` and `ignoredSellShares`; built `SettingsTab-BLE4HkOM.js` contains `v10.7.9.73` and `修复卖出后累计收益率口径`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/9F4EeqRqHC33tBH7D7ruqA3V6DqP`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-By0qzx4L.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-n1Upib5J.css`.
  - Production runtime chunks: `/assets/App-UIpBHiwm.js`, `/assets/HomeTab-C1sT2srr.js`, `/assets/TradesTab-BnuMo9HL.js`, `/assets/SettingsTab-BLE4HkOM.js`.
- Production verification:
  - Production chunk marker check: `App-UIpBHiwm.js` contains `returnCostBasis` and `ignoredSellShares`; `SettingsTab-BLE4HkOM.js` contains `v10.7.9.73` and `修复卖出后累计收益率口径`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复累计收益率使用历史总买入额作为分母的旧行为,有卖出记录的账户收益率会再次被低估;不影响 `/api/quote` 鉴权、Supabase RLS 或交易流水数据本身。

### 2026-07-04 - 首页自选持仓新增年初至今排序

- Commit: `ee43da7b548ef3ab484a7774156007228b5e35a2`
- Background: 用户要求首页自选功能继续升级:在 `52周跌幅` 后新增 `年初至今`,并让 `涨跌幅`、`52周跌幅`、`年初至今`、`持仓盈亏` 等指标支持表头排序;同时确认自选列表不应显示持仓盈亏,持仓盈亏只在持仓 tab 显示。
- Changes:
  - `/api/quote` 股票行情响应新增 `yearStartPrice`、`yearStartDate` 和 `ytdChangePercent`,从当年首个可用交易日调整收盘价计算年初至今涨跌幅。
  - 首页自选/持仓右侧指标区新增 `年初至今` 列,并保持左侧名称固定、右侧全局横向滑动的对齐逻辑。
  - 首页自选和持仓表头增加排序按钮与上下三角状态;价格、涨跌幅、52 周跌幅、年初至今和持仓盈亏均可按升降序排序。
  - 自选 tab 只显示价格、涨跌幅、52 周跌幅和年初至今;持仓 tab 才显示真实持仓盈亏。
  - `quoteCache`、自选股票、交易主账本派生持仓同步透传 `ytdChangePercent`,保证新增股票和持仓股票都能使用同一行情口径。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.72`。
- Key files:
  - `server/quote/providers/eodhd.js`
  - `src/App.jsx`
  - `src/lib/investmentSummary.js`
  - `src/lib/stockUniverse.js`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/quote-response-shape.test.js`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 33 tests.
  - `npm run build`: pass; `HomeTab-C1sT2srr.js` 38.36 kB / gzip 10.17 kB, `SettingsTab-BbyGTlG2.js` 25.85 kB / gzip 10.24 kB, `App-M8ebebVt.js` 127.83 kB / gzip 35.41 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `watchlist`, `stock_trades` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local chunk marker check: pass; built `HomeTab-C1sT2srr.js` contains `年初至今`, `ytdChangePercent`, and `持仓盈亏`; built `App-M8ebebVt.js` contains `ytdChangePercent`; built `SettingsTab-BbyGTlG2.js` contains `v10.7.9.72` and `首页自选/持仓新增年初至今和排序`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/4pDjmD7gNZ7SoTiqLwChMitrqVp4`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-DKIgwaYA.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-n1Upib5J.css`.
  - Production runtime chunks: `/assets/App-CFe9LP7v.js`, `/assets/HomeTab-C1sT2srr.js`, `/assets/SettingsTab-BbyGTlG2.js`.
- Production verification:
  - Production chunk marker check: `HomeTab-C1sT2srr.js` contains `年初至今`, `ytdChangePercent`, and `持仓盈亏`; `App-CFe9LP7v.js` contains `ytdChangePercent`; `SettingsTab-BbyGTlG2.js` contains `v10.7.9.72` and `首页自选/持仓新增年初至今和排序`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复自选/持仓无年初至今、无表头排序、自选显示持仓盈亏列的旧表格行为;不影响 `/api/quote` 鉴权、Supabase RLS 或交易主账本表结构。

### 2026-07-04 - 首页自选编辑管理

- Commit: `1ce1fa6eb1b48c4a6f7fa738255ddb2641942523`
- Background: 用户要求首页自选区域在添加自选股票旁边新增并排的编辑自选股票入口;编辑功能需要支持自选股票排序、删除、置顶,风格沿用当前深色设计;同时删除点击股票行展开自选参数的旧功能。
- Changes:
  - 首页自选列表底部按钮改为两列并排: `添加自选股票` 和 `编辑自选股票`,节约底部空间。
  - 新增深色居中编辑自选股票弹窗,支持搜索当前自选、置顶、上移、下移和删除。
  - 删除自选时在编辑弹窗内二次确认,删除和排序完成后显示明确成功或失败反馈。
  - 自选排序写入 `user_settings.data.watchlistOrder`,云端加载和重试加载时按该顺序恢复;不改 Supabase 表结构。
  - 移除首页点击自选/持仓表格股票行展开 `自选参数` 的旧入口和旧箭头列。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.71`。
- Key files:
  - `src/App.jsx`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 33 tests.
  - `npm run build`: pass; `HomeTab-DNjOYbNg.js` 36.19 kB / gzip 9.46 kB, `SettingsTab-D0dP5vdW.js` 25.52 kB / gzip 10.17 kB, `App-IJqpZUi8.js` 127.56 kB / gzip 35.38 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `watchlist` and `user_settings` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local chunk marker check: pass; built `HomeTab-DNjOYbNg.js` contains `编辑自选股票` and `确认删除`; built `App-IJqpZUi8.js` contains `watchlistOrder`; `src/tabs/HomeTab.jsx` and built `HomeTab-DNjOYbNg.js` contain no `自选参数`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/AaE3MCtdEgNkbr6RfRuyJGXs5HMW`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-BHRqHAcw.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-wvNJKiFO.js`, `/assets/index-Domadpa2.css`.
  - Production runtime chunks: `/assets/App-B_hJSJx7.js`, `/assets/HomeTab-DNjOYbNg.js`, `/assets/SettingsTab-D0dP5vdW.js`.
- Production verification:
  - Production chunk marker check: `HomeTab-DNjOYbNg.js` contains `编辑自选股票` and `确认删除`; `HomeTab-DNjOYbNg.js` no longer contains `自选参数`; `App-B_hJSJx7.js` contains `watchlistOrder`; `SettingsTab-D0dP5vdW.js` contains `v10.7.9.71` and `首页自选编辑管理`.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复只有添加自选股票按钮、点击股票展开自选参数面板和无账号级自选排序保存的旧行为;不影响交易主账本、`/api/quote` 鉴权或 Supabase 表结构。

### 2026-07-04 - 首页自选持仓表格全局横向滑动

- Commit: `e59973e080dbd19b382ca87f29ff7bb8124b6675`
- Background: 用户确认首页自选/持仓表格的横向滑动不应是单个股票行独立滑动,而应是整个右侧指标区全局同步滑动;价格和数字需要在左右滑动时保持上下对齐。
- Changes:
  - 首页自选/持仓表格改为左右两栏结构:左侧名称/图标/代码固定,右侧指标区使用一个全局 `overflow-x-auto` 容器。
  - 右侧表头和所有股票数字行放在同一个横向滚动坐标系中,左右滑动时价格、涨跌幅、52 周跌幅和持仓盈亏整列同步移动。
  - 移除每只股票独立横向滚动容器,避免不同行滑动位置不一致导致列错位。
  - 自选行的价格/52 周高手动编辑面板改为显示在表格下方,避免破坏全局横向滚动结构。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.70`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 33 tests.
  - `npm run build`: pass; `HomeTab-DnEjwyar.js` 30.26 kB / gzip 8.66 kB, `SettingsTab-BP6j67Zs.js` 25.27 kB / gzip 10.09 kB, `App-CA7OEcOb.js` 126.15 kB / gzip 34.90 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Source structure check: `src/tabs/HomeTab.jsx` now has exactly one `overflow-x-auto`, the shared right-side metrics scroller.
  - Local chunk marker check: pass; built `HomeTab-DnEjwyar.js` contains global metrics scroll markers, `自选参数`, and `52周跌幅`; built `SettingsTab-BP6j67Zs.js` contains `v10.7.9.70` and `首页自选/持仓表格全局横向滑动`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/4H7sjbhMRLswbu1UNuUa7VEB1Ty9`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-mV3RlnwM.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-DIQvbhZJ.js`, `/assets/index-23EtP-Fi.css`.
  - Production runtime chunks: `/assets/App-CrQfvSM5.js`, `/assets/HomeTab-DnEjwyar.js`, `/assets/SettingsTab-BP6j67Zs.js`.
  - Production chunk marker check: global metrics scroll container, `自选参数`, `52周跌幅`, settings `v10.7.9.70`, and settings changelog all present.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复每行独立横向滑动的旧表格结构;不影响添加自选、交易主账本、`/api/quote` 鉴权或 Supabase 数据结构。

### 2026-07-04 - 首页自选添加体验细节优化

- Commit: `180f00c3e29b094ea7c510b70cd54baaf8bc90df`
- Background: 用户反馈添加自选股票弹窗偏下,键盘弹出后输入区域容易跑到上方且需要手动拉回;添加成功没有反馈导致快速重复提交容易出错;首页持仓默认只显示 3 条不符合真实持仓浏览;自选列表需要默认显示价格、涨跌幅、距离 52 周高点跌幅和持仓盈亏,并采用交易页同类横向滑动指标区。
- Changes:
  - 添加自选股票弹窗从贴底 bottom sheet 改为居中自适应对话框,锁定页面滚动,输入框聚焦时滚入可视中心。
  - 添加自选流程增加提交中状态,请求期间禁用关闭和重复提交;添加成功或失败后显示明确提示窗口。
  - `addStock` 改为返回成功/失败结果,云端写入成功后才更新本地自选并关闭弹窗,避免假成功。
  - 首页持仓 tab 默认展示全部真实持仓股,不再截断为 3 条预览。
  - 首页自选/持仓表格改为左侧名称固定、右侧指标横向滑动,默认指标为价格、涨跌幅、52 周高点跌幅和持仓盈亏。
  - 交易主账本派生持仓补充 `high` 字段,便于首页持仓直接显示 52 周高点跌幅。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.69`。
  - `docs/development-process.md` 新增提交反馈准则:所有新增/保存/删除/同步等用户提交类操作都必须防重复提交并给出成功或失败反馈。
- Key files:
  - `src/App.jsx`
  - `src/lib/investmentSummary.js`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/investment-summary.test.js`
  - `docs/development-process.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 33 tests.
  - `npm run build`: pass; `HomeTab-B0PgqjBL.js` 29.74 kB / gzip 8.49 kB, `SettingsTab-CiP5Q747.js` 25.01 kB / gzip 10.01 kB, `App-rMa6tsQs.js` 126.15 kB / gzip 34.90 kB, `index-23EtP-Fi.css` 45.44 kB / gzip 8.78 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk marker check: pass; built `HomeTab-B0PgqjBL.js` contains centered add-stock dialog, `添加中...`, `添加成功`, `52周跌幅`, and no old `rounded-t-[22px]` bottom-sheet marker; built `App-rMa6tsQs.js` contains the success-result return path; built `SettingsTab-CiP5Q747.js` contains `v10.7.9.69`; built CSS contains the dynamic viewport `76dvh` modal height.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/2FAW1JUbKi6yTFXAL81E7vwzMLzY`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-DRyxIatJ.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-DIQvbhZJ.js`, `/assets/index-23EtP-Fi.css`.
  - Production runtime chunks: `/assets/App-5zNz64jh.js`, `/assets/HomeTab-B0PgqjBL.js`, `/assets/SettingsTab-CiP5Q747.js`.
  - Production chunk marker check: `添加中...`, `添加成功`, `52周跌幅`, centered modal dynamic viewport `76dvh`, add-stock success return path, settings `v10.7.9.69`, and settings changelog all present; old `rounded-t-[22px]` bottom-sheet marker absent.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Rollback: 回滚本次改动会恢复添加自选底部弹层、无成功提示、持仓 3 条预览和旧单行表格布局;不影响 `/api/quote` 鉴权、Supabase RLS 或 `stock_trades` 表结构。

### 2026-07-04 - 首页自选添加与持仓口径修正

- Commit: `8f0c99b0eb9f878f752e9f8420b23e9b91ae8ae0`
- Background: 用户要求首页自选区域新增添加自选股票功能,添加弹层参考截图但不需要港股、ETF、全部等分类;股票图标需要在新增或缺图时自动多源补拉;持仓必须显示和交易页同步的真实持仓;新用户自选默认空。
- Changes:
  - 首页自选列表改为只显示用户主动添加的 `watchlist`,不再把 `stock_trades` 交易账本股票回退显示为自选。
  - 新增独立 `quoteCache`,行情刷新继续覆盖自选和持仓价格,但不再把行情全集写回 `watchlist`。
  - 添加交易不再自动把股票加入自选;交易只影响真实持仓和行情请求集合。
  - 云端 `watchlist` 返回空数组时会真实清空本地自选,确保新用户默认自选为空;云端失败 `null` 才保留本地数据。
  - 首页自选区域新增金色描边 `添加自选股票` 按钮和底部弹层;弹层保留搜索、热门和美股入口,不提供港股、ETF、全部分类。
  - 添加自选时优先通过已登录 `/api/quote` 预拉当前价和 52 周高,失败时仍允许按代码加入,后续行情轮询补数据。
  - 股票图标改为多源候选: EODHD 大小写、Financial Modeling Prep、Finnhub;图片成功加载后写入 `localStorage` 缓存,IBKR 等 EODHD 缺图股票会自动兜底。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.68`。
- Key files:
  - `src/App.jsx`
  - `src/lib/stockUniverse.js`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/stock-universe.test.js`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 33 tests.
  - `npm run build`: pass; `HomeTab-CEEkE0OJ.js` 26.49 kB / gzip 7.70 kB, `SettingsTab-B0cgOAT-.js` 24.60 kB / gzip 9.87 kB, `App-DYgWtj7v.js` 125.94 kB / gzip 34.81 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local SSR mock render: pass; `HomeTab` renders with mock self-selected `IBKR`/`NVDA`, active position `MSFT`, and open add-stock sheet.
  - Direct logo URL check: EODHD `IBKR.png`/`ibkr.png` returned 404; Financial Modeling Prep and Finnhub `IBKR.png` returned 200 image responses, validating the new fallback order.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
  - Runtime commit: `8f0c99b0eb9f878f752e9f8420b23e9b91ae8ae0`.
  - Deployment trigger commit: `45665772051a9016e47752bd685ce3456aabc4cb`.
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/8t6inSQiWyeQbSPhsKoWt8CLYNgM`.
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production index assets: `/assets/index-D7ogyxM2.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-DIQvbhZJ.js`, `/assets/index-Cy64uOab.css`.
  - Production runtime chunks: `/assets/App-D13t57Uf.js`, `/assets/HomeTab-CEEkE0OJ.js`, `/assets/SettingsTab-B0cgOAT-.js`.
  - Production chunk marker check: `xmoney_stock_logo_cache_v1`, `watchlistRows`, `添加自选股票`, Financial Modeling Prep/Finnhub logo fallback, popular stock list, `v10.7.9.68`, and settings changelog all present.
  - Production auth check: unauthenticated `GET /api/quote?symbols=VIX` returned `401` with `{"error":"未授权: 请先登录后再请求行情接口"}`.
- Notes:
  - Local browser could not enter the full app because the current dev server has no `.env.local` Supabase config and shows `Supabase 配置缺失`; UI verification used Vite SSR mock rendering instead.
- Rollback: 回滚本次改动会恢复交易账本股票进入首页自选、实时行情写回 `watchlist`、添加交易自动加入自选、旧内嵌添加股票表单和 EODHD-only 图标逻辑;不影响 `/api/quote` 鉴权、Supabase RLS 或 `stock_trades` 表结构。

### 2026-07-04 - 设置页深色化和失效入口清理

- Commit: `6e9a5e0377ccd74f4ffea10e6ac40959d5f8b385`
- Background: 用户要求设置页整体色调和首页保持一致,同时清理已经无效的实时推送、数据状态和 JSON 导出等入口;`云端账户` 需要改成正常的账户设置,取消当前黑金效果。
- Changes:
  - 设置 tab 纳入 App 深色 shell,页面底色和底部导航与首页/交易页一致。
  - 设置页顶部、账户设置、更新日志、数据维护和关于卡统一改为深色半透明卡片。
  - 删除设置页可见的实时推送卡、数据状态卡和 JSON 导出按钮。
  - `云端账户` 改为普通 `账户设置`,保留邮箱、修改密码和退出登录;修改密码弹窗同步深色化。
  - 设置页用户可见更新日志和关于页版本同步到 `v10.7.9.67`。
- Key files:
  - `src/App.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 32 tests.
  - `npm run build`: pass; `SettingsTab-C1-vVtYh.js` 24.20 kB / gzip 9.71 kB, `App-DoxPBnoI.js` 124.38 kB / gzip 34.32 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built `SettingsTab-C1-vVtYh.js` contains `v10.7.9.67`, `账户设置`, `数据维护`, and no active JSON export implementation.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `6e9a5e0377ccd74f4ffea10e6ac40959d5f8b385`
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/FMUVPLmh2EoM1ynwdNbZtVLicC5A`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-B_2KCKOY.js`, `App-w7k4xFVp.js`, `SettingsTab-C1-vVtYh.js`, `index-_0jfOJrA.css`.
  - `SettingsTab-C1-vVtYh.js` contains `v10.7.9.67`, `账户设置`, and `数据维护`.
  - `SettingsTab-C1-vVtYh.js` no longer contains active implementation markers for JSON export, browser WebSocket settings, or manual quote pull controls: `x-money-backup`, `URL.createObjectURL`, `bottomline_ws`, `setWsEnabled`, `fetchRealtimePrices`, `立即手动拉取`, `当前刷新频率`, `最近更新`.
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次提交会恢复设置页旧白卡/黑金混合样式、实时推送/数据状态/JSON 导出入口和 `云端账户` 黑金卡;不影响行情 API、交易账本或 Supabase 数据结构。

### 2026-07-04 - 深色加载、涨跌配色与首页交易账本接入

- Commit: `d8014814e17a8f789b304c5facaeb32fab5a6eed`
- Background: 用户反馈首页和建议加载时会闪现白色页面,要求改掉;同时要求在交易页持仓分布右侧增加股票涨跌颜色设置,默认绿涨红跌并支持绿跌红涨,且全局影响首页和交易;首页自选和持仓需要接入交易主账本最新数据库。
- Changes:
  - Auth 初始化和懒加载 fallback 改为深色加载态;`body` 默认背景改为首页/交易一致的深黑,避免加载首页、建议等 lazy chunk 时闪白。
  - 新增 `marketColorMode` 全局偏好,默认 `绿涨红跌`,支持切换 `绿跌红涨`;偏好写入 `localStorage` 和 `user_settings.data`。
  - 交易页持仓分布右侧齿轮改为涨跌颜色设置菜单;颜色切换后影响首页资产卡、当前信号、市场卡、自选/持仓列表和交易页主账本收益显示。
  - 新增 `buildLedgerQuoteUniverse`,将 `stock_trades` 主交易账本股票集合与 quote cache 合并;首页自选优先显示主交易账本股票,持仓继续读取 `investmentSummary.activePositions`。
  - 行情自动刷新、日历请求和添加交易本地查询改用合并后的股票集合,避免交易账本里有股票但首页不更新行情。
  - 设置页用户可见更新日志、JSON 备份版本和关于页版本同步到 `v10.7.9.66`。
- Key files:
  - `src/App.jsx`
  - `src/AuthGate.jsx`
  - `src/index.css`
  - `src/lib/marketColorMode.js`
  - `src/lib/stockUniverse.js`
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/market-color-mode.test.js`
  - `tests/stock-universe.test.js`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 32 tests.
  - `npm run build`: pass; `HomeTab-CvMXmPja.js`, `TradesTab-CLP8y-lz.js`, `SettingsTab-BlOgMv_X.js`, `App-DI5-kdN8.js`, and `marketColorMode-DYH4sHWM.js` generated.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades` and `cost_basis_trades` return `200` with `visibleRows=0` for anonymous REST probes.
  - Local chunk check: pass; built chunks contain `v10.7.9.66`, `绿涨红跌`, `绿跌红涨`, `homeWatchlist`, `marketColorMode`, `/api/fx`, and `xmoney_fx_rates_v1`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `d8014814e17a8f789b304c5facaeb32fab5a6eed`
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/63Eg1owwZyQSADwJ768uA3QviEGc`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-BhT7eKm6.js`, `App-CD-bBewo.js`, `HomeTab-CvMXmPja.js`, `TradesTab-CLP8y-lz.js`, `SettingsTab-BlOgMv_X.js`, `marketColorMode-DYH4sHWM.js`, `index-dzCkedeL.css`.
  - `index-dzCkedeL.css` contains the deep loading/body background `#05070b`.
  - `HomeTab-CvMXmPja.js` contains `marketColorMode` and `homeWatchlist`.
  - `TradesTab-CLP8y-lz.js` contains `绿涨红跌`, `绿跌红涨`, and `股票涨跌颜色设置`.
  - `SettingsTab-BlOgMv_X.js` contains `v10.7.9.66`, "首页/交易页加载和涨跌颜色设置", and `marketColorMode` in JSON backup.
  - `marketColorMode-DYH4sHWM.js` contains `greenUpRedDown` and `redUpGreenDown`.
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
  - `GET https://boduan-tracker.vercel.app/api/fx` without auth returns `401`; `/api/fx` auth remains enabled.
  - Post-deploy `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades` and `cost_basis_trades` return `200` with `visibleRows=0` for anonymous REST probes.
- Rollback: 回滚本次改动会恢复浅色加载 fallback、首页自选旧 watchlist 数据源和固定绿涨/红跌逻辑;不影响 `/api/quote` 鉴权、`/api/fx` 或 `stock_trades` 表结构。

### 2026-07-04 - 汇率每日自动查询

- Commit: `1c91b7123e0c93b5a4dcc1842782e12830b715cd`
- Background: 用户确认 USD/RMB 和 RMB/USD 切换需要真实汇率,但每天查询一次即可。
- Changes:
  - 新增已登录服务端接口 `/api/fx`,复用 `/api/quote` 的 Supabase Bearer 鉴权和服务端 `EODHD_API_KEY`,不新增前端 token。
  - 服务端通过 EODHD Forex real-time endpoint 拉取 `USDCNY.FOREX` 和 `USDHKD.FOREX`;`usdRate` 使用 USD/CNY,`hkdRate` 使用 `USDCNY / USDHKD`。
  - App 启动时读取 `localStorage` 的 `xmoney_fx_rates_v1`;同一自然日直接使用缓存,跨日才请求 `/api/fx`。
  - 汇率请求失败时保留上次成功缓存;没有缓存时继续使用默认 `7.20` / `0.87`。
  - 设置页用户可见更新日志同步到 `v10.7.9.65`。
- Key files:
  - `api/fx.js`
  - `server/fx/rates.js`
  - `src/App.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `tests/fx-rates.test.js`
  - `tests/fx-handler.test.js`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 28 tests.
  - `npm run build`: pass; `App-gEJt5Z2Y.js` 122.83 kB / gzip 33.80 kB, `SettingsTab-Wq7N0WSd.js` 31.09 kB / gzip 12.01 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built `App-gEJt5Z2Y.js` contains `/api/fx` and `xmoney_fx_rates_v1`, and `SettingsTab-Wq7N0WSd.js` contains `v10.7.9.65` plus "汇率每日自动查询"。
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades` return `200` with `visibleRows=0` for anonymous REST probes.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `1c91b7123e0c93b5a4dcc1842782e12830b715cd`
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/BbrV57wBnXWGdmajtm99yKFYxs5W`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-PwnYXs8I.js`, `App-D95X7hSG.js`, `SettingsTab-Wq7N0WSd.js`
  - `App-D95X7hSG.js` contains `/api/fx` and `xmoney_fx_rates_v1`.
  - `SettingsTab-Wq7N0WSd.js` contains `v10.7.9.65` and "汇率每日自动查询"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
  - `GET https://boduan-tracker.vercel.app/api/fx` without auth returns `401`; `/api/fx` auth is enabled.
  - Post-deploy `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades` return `200` with `visibleRows=0` for anonymous REST probes.
- Rollback: 回滚本次提交会恢复固定默认/手动汇率;不会影响 `/api/quote` 鉴权或交易账本。

### 2026-07-04 - USD/RMB 盈亏字号统一

- Commit: `99d27ce3dab9085edf587c489d12b6c7ea3b66a9`
- Background: 用户反馈 RMB 的数字大小和 USD 不一致,要求以 RMB 当前字号为准;同时询问汇率来源。
- Changes:
  - 首页总资产卡的今日盈亏、累计盈亏金额统一使用 RMB 当前的 `text-[13px]`,USD 不再放大到 `text-[15px]`。
  - 交易页总资产卡的今日盈亏、累计盈亏金额同步使用同一字号。
  - 设置页用户可见更新日志同步到 `v10.7.9.64`。
  - 确认当前 `usdRate` 仍为本地默认/手动输入值,没有接入实时或每日自动汇率接口。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 23 tests.
  - `npm run build`: pass; `HomeTab-CentWHQh.js` 21.54 kB / gzip 6.25 kB, `TradesTab-LpilKs1l.js` 45.10 kB / gzip 9.61 kB, `SettingsTab-B6EfuSRi.js` 30.86 kB / gzip 11.93 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built `HomeTab-CentWHQh.js` and `TradesTab-LpilKs1l.js` use fixed `text-[13px]` for top-card P/L amount class, and `SettingsTab-B6EfuSRi.js` contains `v10.7.9.64` plus "USD/RMB 盈亏数字字号统一"。
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `99d27ce3dab9085edf587c489d12b6c7ea3b66a9`
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/J1ARsY5PBYGLLr5Trp3M8hSStzbX`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-CpFcn1nY.js`, `App-DoFunHmg.js`, `HomeTab-CentWHQh.js`, `TradesTab-LpilKs1l.js`, `SettingsTab-B6EfuSRi.js`
  - `HomeTab-CentWHQh.js` and `TradesTab-LpilKs1l.js` contain fixed top-card P/L amount class `text-[13px]`.
  - `SettingsTab-B6EfuSRi.js` contains `v10.7.9.64` and "USD/RMB 盈亏数字字号统一"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
  - `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades` return `200` with `visibleRows=0` for anonymous REST probes.
- Rollback: 回滚本次提交会恢复 USD 盈亏金额比 RMB 大的字号;不影响交易账本或汇率计算。

### 2026-07-04 - 交易主账本独立建库

- Commit: `c6b4d2882b123f503252ec4984a9c5aa51cb4dcf`
- Background: 用户确认当前交易页持仓仍来自波段旧 `trades` 数据,要求重新建立独立数据库来完整记录股票买入/卖出操作,不再复用老数据库和结构。
- Changes:
  - 新增 `stock_trades` 主交易账本数据层: `fetchStockTrades` / `insertStockTrade` / `deleteStockTrade`。
  - App 启动加载新增 `stockTrades` 状态,首页/交易页投资汇总改从 `stockTrades` 派生;旧 `trades` 保留给波段记录工具兼容。
  - 交易页当日订单改读 `stockTrades`;波段记录和全部旧交易弹窗继续读旧 `trades`。
  - `supabase/stock_trades.sql` 新增独立建表迁移;`supabase/rls.sql` 同步纳入 `stock_trades` 表结构、索引和 RLS policy。
  - RLS REST 探针加入 `stock_trades`。
  - 设置页用户可见更新日志同步到 `v10.7.9.63`,JSON 备份新增 `stockTrades`。
  - 交接文档更新交易模块边界。
- Key files:
  - `src/lib/db.js`
  - `src/lib/investmentSummary.js`
  - `src/App.jsx`
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `supabase/stock_trades.sql`
  - `supabase/rls.sql`
  - `scripts/verify-rls-rest.mjs`
  - `tests/investment-summary.test.js`
  - `docs/handoff.md`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 23 tests.
  - `npm run build`: pass; `App-D3Wzy0Ax.js` 121.45 kB / gzip 33.34 kB, `TradesTab-Cre_5I5e.js` 45.12 kB / gzip 9.62 kB, `SettingsTab-PfDVAiR-.js` 30.64 kB / gzip 11.88 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built chunks contain `stock_trades`, `stockTrades`, `v10.7.9.63`, and "交易主账本独立建库"。
  - `npm run verify:rls:rest`: pass after migration; 13 user-owned tables including `stock_trades` return `200` with `visibleRows=0` for anonymous REST probes.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `c6b4d2882b123f503252ec4984a9c5aa51cb4dcf`
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/Ccke1DF4YyU5zjHjjPFpmZKhUkqM`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-Djtos65b.js`, `App-CunFcbVA.js`, `TradesTab-Cre_5I5e.js`, `SettingsTab-PfDVAiR-.js`
  - `App-CunFcbVA.js` contains `stockTrades`, `stock_trades`, and `insertStockTrade`.
  - `TradesTab-Cre_5I5e.js` contains `stockTrades`.
  - `SettingsTab-PfDVAiR-.js` contains `v10.7.9.63`, `stockTrades`, `stock_trades`, and "交易主账本独立建库"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
  - Post-deploy `npm run verify:rls:rest`: pass; 13 user-owned tables including `stock_trades` return `200` with `visibleRows=0` for anonymous REST probes.
- Supabase note:
  - Executed `supabase/stock_trades.sql` in production Supabase project `ykgotnmtqcqdzqtrlayq`; SQL Editor returned "Success. No rows returned"。
  - Pre-migration REST probe showed `stock_trades` returned `404`; post-migration probe shows `stock_trades` returns `200` with `visibleRows=0`。
- Rollback: 回滚本次提交会让首页/交易页重新从旧 `trades` 派生主持仓;`stock_trades` 表若已创建可保留,不会影响旧模块。

### 2026-07-04 - 交易页盈亏色号统一首页

- Commit: `ac6e337708f29d9c435e45c10022b670e1e31d11`
- Background: 用户反馈交易页粉色与首页粉色不是同一个色号,要求交易页和首页视觉统一;同时确认当前交易页持仓仍来自旧波段记录数据,后续主交易账本需要独立建库。
- Changes:
  - 交易页盈亏色阶统一为首页同款 `text-rose-400` / `text-emerald-400`。
  - 股票设置买入/卖出快捷按钮、当日订单方向文字同步使用同一套色阶。
  - 设置页用户可见更新日志同步到 `v10.7.9.62`。
- Key files:
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 22 tests.
  - `npm run build`: pass; `TradesTab-CyaUGrGg.js` 45.11 kB / gzip 9.61 kB, `SettingsTab-BOo-UFRG.js` 30.38 kB / gzip 11.78 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built `TradesTab-CyaUGrGg.js` contains `text-rose-400` / `text-emerald-400` for trade P/L and order direction, while `SettingsTab-BOo-UFRG.js` contains `v10.7.9.62` and "交易页盈亏色号统一首页"。
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `ac6e337708f29d9c435e45c10022b670e1e31d11`
  - GitHub commit status `Vercel`: success, deployment target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/GcGHtrmbtJq1BY1dXL9SKbj2J8FC`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-ykmMaX1P.js`, `App-sOZfF3zQ.js`, `TradesTab-CyaUGrGg.js`, `SettingsTab-BOo-UFRG.js`
  - `TradesTab-CyaUGrGg.js` contains `text-rose-400` / `text-emerald-400` for the main trade P/L and order direction; the remaining `text-emerald-300` is the unchanged LIVE button style.
  - `SettingsTab-BOo-UFRG.js` contains `v10.7.9.62` and "交易页盈亏色号统一首页"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Follow-up:
  - 下一步交易重构应新增独立买卖流水表,不再复用旧 `trades` 表作为主持仓数据源;旧 `trades` 保留给波段记录兼容使用。
- Rollback: 回滚本次提交会恢复交易页上一版盈亏色阶;不影响交易数据逻辑。

### 2026-07-04 - 交易页头部和工具箱顺序对齐首页

- Commit: `6028bf7b5bcf9c3f55c0fcc00a828438b27a0834`
- Background: 用户反馈交易页头部卡片和首页头部卡片效果不一致,要求字体大小、按钮和间距完全对齐首页;交易整体字号/图标参考首页;工具箱中 `股票设置` 与 `摊薄工具` 调换顺序;占比列不再显示 `市值` 小字。
- Changes:
  - 交易页头部资产卡按首页资产卡同步:标题色值/图标、币种按钮高度与字号、LIVE 字重、主数字上间距与字重、统计区上间距和列比例。
  - 交易页工具箱密度调整为更接近首页:图标从 28px 收到 24px,标签从 13px 收到 12px,按钮高度从 96px 收到 86px。
  - 工具箱顺序改为 `波段记录` / `摊薄工具` / `股票设置` / `全部功能`。
  - 持仓表 `占比` 列只显示百分比,删除下方 `市值` 小字。
  - 设置页用户可见更新日志同步到 `v10.7.9.61`。
- Key files:
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 22 tests.
  - `npm run build`: pass; `TradesTab-DETFbJEb.js` 45.11 kB / gzip 9.61 kB, `SettingsTab-B1V1K9oO.js` 30.18 kB / gzip 11.72 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built `TradesTab-DETFbJEb.js` contains home-aligned header sizing, compact toolbox classes and no `策略订单`; built `SettingsTab-B1V1K9oO.js` contains `v10.7.9.61`; built trade chunk no longer contains allocation sublabel `市值`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `6028bf7b5bcf9c3f55c0fcc00a828438b27a0834`
  - GitHub Actions `CI`: success, run `28693408355`
  - Vercel deployment: success, deployment `5307063628`, target `https://boduan-tracker-pqk5209bf-chenshuai1190-7580s-projects.vercel.app`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-DtdIVvn6.js`, `index-BKpRRget.css`, `App-DnY3pLpu.js`, `TradesTab-DETFbJEb.js`, `SettingsTab-B1V1K9oO.js`, `HomeTab-CB8aSzcR.js`
  - `TradesTab-DETFbJEb.js` contains home-aligned header sizing, compact toolbox classes and no `策略订单`; it no longer contains allocation sublabel `市值`.
  - `SettingsTab-B1V1K9oO.js` contains `v10.7.9.61` and "交易页头部和工具箱细节对齐首页"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次提交会恢复交易页上一版头部卡、工具箱顺序和占比列副文案;不影响交易数据逻辑。

### 2026-07-04 - 交易页黑底和工具箱细节优化

- Commit: `37df7e3f50e5248675c374a03942cfef0e5edf53`
- Background: 用户要求交易页背景与首页黑色风格一致;主持仓列表从 `市值/数量` 开始改为横向滑动指标区,并增加个股持仓盈亏和占比;`全部功能` 未确定前不响应点击;波段记录和摊薄工具点开后显示当前头部加原模块内容。
- Changes:
  - App 外层背景和底部导航在 `home` / `trades` 两个 tab 统一使用黑色风格。
  - 交易页工具箱中 `全部功能` 改为灰显禁用,不触发工具视图。
  - 点击 `波段记录` 或 `摊薄工具` 时,隐藏主持仓账本卡,保留顶部资产卡和工具箱,下方显示对应原模块内容。
  - 持仓表改为左侧名称固定、右侧指标横向滑动;右侧新增 `持仓盈亏` 和 `占比`。
  - 波段记录无数据时也保留模块头部并显示空状态。
  - 移除旧的重复空交易白卡。
  - 设置页用户可见更新日志同步到 `v10.7.9.60`。
- Key files:
  - `src/App.jsx`
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 22 tests.
  - `npm run build`: pass; `TradesTab-X2Aflgml.js` 45.13 kB / gzip 9.56 kB, `SettingsTab-WMoYlydN.js` 29.92 kB / gzip 11.63 kB, `App-Di96tjJp.js` 119.83 kB / gzip 33.00 kB, `index-BzNM0xJt.css` 41.26 kB / gzip 8.13 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local chunk check: pass; built `TradesTab-X2Aflgml.js` contains `市值/数量`, `持仓盈亏`, `占比`, `波段记录`, `摊薄工具`, disabled `全部功能` styling, and does not contain `策略订单`; built `SettingsTab-WMoYlydN.js` contains `v10.7.9.60`; built `App-Di96tjJp.js` contains the dark-shell `trades` branch.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `37df7e3f50e5248675c374a03942cfef0e5edf53`
  - GitHub Actions `CI`: success, run `28693219408`
  - Vercel deployment: success, deployment `5307019723`, target `https://boduan-tracker-jy063ere4-chenshuai1190-7580s-projects.vercel.app`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-O1ERwYpW.js`, `index-BzNM0xJt.css`, `App-C3fPgYW0.js`, `TradesTab-X2Aflgml.js`, `SettingsTab-WMoYlydN.js`, `HomeTab-CB8aSzcR.js`
  - `TradesTab-X2Aflgml.js` contains `市值/数量`, `持仓盈亏`, `占比`, `波段记录`, `摊薄工具`, disabled `全部功能` styling, and does not contain `策略订单`.
  - `SettingsTab-WMoYlydN.js` contains `v10.7.9.60` and "交易页工具箱和持仓表优化"。
  - `App-C3fPgYW0.js` contains the dark-shell branch for `home` / `trades` and dark bottom navigation styling.
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次提交会恢复交易页浅色 App 外壳、旧持仓表布局和可点击 `全部功能`;不影响交易主账本数据结构。

### 2026-07-04 - 记录交易页主账本部署验证

- Commit: `same commit`
- Background: 交易页主账本运行时代码已部署到 Vercel 生产环境,需要回填线上验证证据并刷新交接文档。
- Changes:
  - 回填交易页重构提交 `58663cdd685207d54c0def7bd17bf02830905ebb` 的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本、生产 chunk 和交易模块最新规则。
  - 记录交易模块主账本边界:主持仓使用 `trades` + `derivePositionsFromTrades`,独立摊薄成本工具继续留在工具箱内,不参与主交易账本。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 22 tests.
  - `npm run build`: pass; docs-only change, runtime chunks unchanged from `58663cdd685207d54c0def7bd17bf02830905ebb` local build (`TradesTab-CZdjIIxw.js`, `SettingsTab-pFm5DUJ_.js`, `App-6jso7Jjy.js`).
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only record pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Docs/deployment record commit: `59b8d3ede8df5d0d4231d31ea9a48579eb7b571d`
  - GitHub Actions `CI`: success, run `28692997780`
  - Vercel deployment: success, deployment `5306970970`, target `https://boduan-tracker-kj91rrn4b-chenshuai1190-7580s-projects.vercel.app`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks remain `index-DIlRs9If.js`, `index-C89TU27I.css`, `App-Q0v9E7k3.js`, `TradesTab-CZdjIIxw.js`, `SettingsTab-pFm5DUJ_.js`, `HomeTab-CB8aSzcR.js`.
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除部署记录和交接刷新,不影响交易页运行时代码。

### 2026-07-04 - 交易页重构为主交易账本

- Commit: `58663cdd685207d54c0def7bd17bf02830905ebb`
- Background: 用户要求重构交易模块:所有股票通过交易页手动记录买入/卖出,主持仓和成本从交易记录推导;波段记录和摊薄成本等小工具收进工具箱,不参与整体交易逻辑改变;不需要策略订单。
- Changes:
  - 交易页新增深色主交易界面:总资产卡、工具箱、持仓分布和当日订单。
  - 持仓分布使用 `investmentSummary.activePositions`,从主 `trades` 买入/卖出记录推导持仓数量、现价、实际摊薄成本、当日盈亏和累计盈亏。
  - `derivePositionsFromTrades` 增加 `effectiveCost` 和 `effectiveRemainingCost`,卖出盈利会冲减剩余持仓实际成本。
  - 新增测试覆盖:100 买入 100 股、150 卖出 10 股后剩余 90 股,实际摊薄成本为 94.44。
  - 波段记录和独立摊薄成本工具改为只在工具箱中展开,保持独立数据逻辑。
  - 删除 App 外层旧交易总览卡,避免与新交易主界面重复。
  - 交易页新增本地日期助手,避免今日订单和新增交易默认日期被 UTC 日期偏移影响。
  - 设置页用户可见更新日志同步到 `v10.7.9.59`。
- Key files:
  - `src/lib/investmentSummary.js`
  - `src/tabs/TradesTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `src/App.jsx`
  - `tests/investment-summary.test.js`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 22 tests.
  - `npm run build`: pass; `TradesTab-CZdjIIxw.js` 43.64 kB / gzip 9.36 kB, `SettingsTab-pFm5DUJ_.js` 29.64 kB / gzip 11.53 kB, `App-6jso7Jjy.js` 119.82 kB / gzip 33.00 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local trade-page chunk check: pass; built `TradesTab-CZdjIIxw.js` contains `持仓分布`, `当日订单`, `波段记录`, `股票设置`, `摊薄工具`, `全部功能`, `effectiveCost`, and local-date helper, and does not contain `策略订单`; built `App-6jso7Jjy.js` does not contain old outer trade summary text `持仓总市值` / `波段总盈亏`; built `SettingsTab-pFm5DUJ_.js` contains `v10.7.9.59`.
- Deployment: pushed to GitHub `main`; Vercel production deployment completed.
- Production verification:
  - Runtime commit: `58663cdd685207d54c0def7bd17bf02830905ebb`
  - GitHub Actions `CI`: success, run `28692910439`
  - Vercel deployment: success, deployment `5306951776`, target `https://boduan-tracker-3701o64x4-chenshuai1190-7580s-projects.vercel.app`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-DIlRs9If.js`, `index-C89TU27I.css`, `App-Q0v9E7k3.js`, `TradesTab-CZdjIIxw.js`, `SettingsTab-pFm5DUJ_.js`, `HomeTab-CB8aSzcR.js`
  - `TradesTab-CZdjIIxw.js` contains `持仓分布`, `当日订单`, `波段记录`, `股票设置`, `摊薄工具`, `全部功能`, `effectiveCost`, and local-date helper; it does not contain `策略订单`.
  - `SettingsTab-pFm5DUJ_.js` contains `v10.7.9.59` and "交易页重构为主交易账本"。
  - `App-Q0v9E7k3.js` does not contain old outer trade summary text `持仓总市值` / `波段总盈亏`.
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次提交会恢复旧交易页波段记录优先的布局和独立摊薄工具直出显示;不影响首页、资产或目标逻辑。

### 2026-07-04 - 记录当前信号回滚部署验证

- Commit: `2e374fa169bdff04fd40bc5fb38918f17c7825b9`
- Background: 首页当前信号展开列表已回滚并完成 Vercel 生产部署,需要把最终线上证据回填到日志和交接文档。
- Changes:
  - 回填回滚提交 `33dab311f662b357804b69601c91afd0577e3e61` 的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和线上产物证据。
  - 记录用户偏好: 当前信号右上角保留策略提醒/入口,但不得默认展开或因预警自动展开;策略详情必须由用户主动点击打开。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-DgRCQBTf.js` 21.55 kB / gzip 6.26 kB, `SettingsTab-BG2i8XEV.js` 29.40 kB / gzip 11.44 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only verification record; runtime rollback already deployed by commit `33dab311f662b357804b69601c91afd0577e3e61`.
- Production verification:
  - Runtime commit: `33dab311f662b357804b69601c91afd0577e3e61`
  - GitHub Actions `CI`: success, run `28673202099`
  - Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/5jnZyUvSdpTQ9bzn5ewfaYJAQ5N5`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-BHNU0-21.js`, `index-CkXPg5ZA.css`, `App-gC5t_xx6.js`, `HomeTab-DgRCQBTf.js`, `SettingsTab-BG2i8XEV.js`
  - `HomeTab-DgRCQBTf.js` does not contain `触发列表` or `策略档位 L1-L6`; it still contains compact `当前信号` / `策略状态` UI.
  - `SettingsTab-BG2i8XEV.js` contains `v10.7.9.58` and "回滚首页当前信号展开列表"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除验证记录,不影响首页运行时代码。

### 2026-07-04 - 回滚首页当前信号展开列表

- Commit: `33dab311f662b357804b69601c91afd0577e3e61`
- Background: 用户反馈首页当前信号的策略展开样式很难看,要求回滚到上一版紧凑信号卡。
- Changes:
  - 回滚提交 `20eba4d31a9f343560b78649bd0116d707916585` 引入的当前信号展开列表 UI。
  - 首页当前信号恢复为上一版紧凑卡片:只显示当前状态、基准回撤、价格和 52 周高。
  - 保留回撤数字点击后的基准切换菜单,不展示策略展开列表和 L1-L6 档位。
  - 设置页用户可见更新日志同步到 `v10.7.9.58`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-DgRCQBTf.js` 21.55 kB / gzip 6.26 kB, `SettingsTab-BG2i8XEV.js` 29.40 kB / gzip 11.44 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local rollback check: pass; built `HomeTab-DgRCQBTf.js` does not contain `触发列表` or `策略档位 L1-L6`, and built `SettingsTab-BG2i8XEV.js` contains `v10.7.9.58`.
- Deployment: pushed to GitHub `main`; GitHub Actions run `28673202099` passed; Vercel status success with target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/5jnZyUvSdpTQ9bzn5ewfaYJAQ5N5`。
- Production verification: pass,见上方 `记录当前信号回滚部署验证` 条目。
- Rollback: 回滚本次提交会重新启用 `20eba4d31a9f343560b78649bd0116d707916585` 的当前信号展开列表;不影响交易、资产或目标逻辑。

## 2026-07-03 Asia/Shanghai

### 2026-07-03 - 记录 EODHD 图标 fallback 部署验证

- Commit: `4dcb6e8d9c20d8b06b1df5617870583e09ef4f28`
- Background: EODHD logo 大小写 fallback 修复已推送到 GitHub `main` 并完成 Vercel 生产部署,需要把最终线上证据回填到日志和交接文档。
- Changes:
  - 回填运行时代码提交 `8fe2cd2aec16686aaa1261cf0b7bb7d89165a61b` 的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和线上产物证据。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-DgRCQBTf.js` 21.55 kB / gzip 6.26 kB, `SettingsTab-07aPWMBk.js` 29.21 kB / gzip 11.37 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only verification record; runtime code already deployed by commit `8fe2cd2aec16686aaa1261cf0b7bb7d89165a61b`.
- Production verification:
  - Runtime commit: `8fe2cd2aec16686aaa1261cf0b7bb7d89165a61b`
  - GitHub Actions `CI`: success, run `28670402550`
  - Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/3JMEhzQqhsJLoxzgoV9pAWQE5vju`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-3PlTfOnE.js`, `App-xepx7EC5.js`, `HomeTab-DgRCQBTf.js`, `SettingsTab-07aPWMBk.js`
  - `HomeTab-DgRCQBTf.js` contains uppercase and lowercase EODHD logo candidates, `data-logo-fallbacks`, and final hide fallback.
  - `SettingsTab-07aPWMBk.js` contains `v10.7.9.56` and "修复部分公司图标不显示"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除验证记录,不影响首页运行时代码。

### 2026-07-03 - 修复 EODHD 图标大小写 fallback

- Commit: `8fe2cd2aec16686aaa1261cf0b7bb7d89165a61b`
- Background: 用户反馈首页自选列表公司图标拉取不全。实际请求发现 EODHD logo 文件名大小写不统一,例如 `US/AAPL.png` 返回 404,但 `US/aapl.png` 返回 200;上一版只尝试大写路径,导致部分可用图标被隐藏。
- Changes:
  - 首页自选/持仓列表 logo 加载改为候选 URL 队列,优先使用已有 `logoURL`,再尝试 EODHD 大写路径和小写路径。
  - 图片 `onError` 从直接隐藏改为尝试下一个候选路径;所有候选路径失败后才隐藏。
  - 支持从 fundamentals 返回的相对 `LogoURL` 路径规范化为 `https://eodhd.com/...`。
  - 设置页用户可见更新日志同步到 `v10.7.9.56`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - Direct EODHD checks: `US/AAPL.png`, `US/AMZN.png`, `US/GOOGL.png`, `US/HOOD.png`, `US/NFLX.png`, and `US/TSM.png` returned 404; lowercase equivalents returned 200 image/png.
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-DgRCQBTf.js` 21.55 kB / gzip 6.26 kB, `SettingsTab-07aPWMBk.js` 29.21 kB / gzip 11.37 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local logo fallback check: pass; built `HomeTab-DgRCQBTf.js` contains uppercase and lowercase EODHD candidates, `data-logo-fallbacks`, retry-by-setting-`src`, and final hide fallback.
- Deployment: pushed to GitHub `main`; GitHub Actions run `28670402550` passed; Vercel status success with target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/3JMEhzQqhsJLoxzgoV9pAWQE5vju`。
- Production verification: pass,见上方 `记录 EODHD 图标 fallback 部署验证` 条目。
- Rollback: 回滚本次提交会恢复为只尝试单一路径,部分 EODHD 小写 logo 会继续隐藏;不影响交易、资产或目标逻辑。

### 2026-07-03 - 记录自选展开和 EODHD 图标部署验证

- Commit: `same commit`
- Background: 首页自选默认展开和 EODHD 图标改动已推送到 GitHub `main` 并完成 Vercel 生产部署,需要把最终线上证据回填到日志和交接文档。
- Changes:
  - 回填运行时代码提交 `bc97472c384a8c4b2a6fa53384afb8f33666041a` 的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和线上产物证据。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BFytG1L8.js` 21.05 kB / gzip 6.05 kB, `SettingsTab-DPrCHReO.js` 29.01 kB / gzip 11.30 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only verification record; runtime code already deployed by commit `bc97472c384a8c4b2a6fa53384afb8f33666041a`.
- Production verification:
  - Runtime commit: `bc97472c384a8c4b2a6fa53384afb8f33666041a`
  - GitHub Actions `CI`: success, run `28668771392`
  - Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/DmxN6reREMuSNhqgowT79KPyGhvk`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-UVcE5qxg.js`, `App-D1a8nJ9d.js`, `HomeTab-BFytG1L8.js`, `SettingsTab-DPrCHReO.js`
  - `HomeTab-BFytG1L8.js` contains `https://eodhd.com/img/logos/US/`, `object-contain`, `no-referrer`, and `currentTarget.style.display=\`none\`` for failed logo loads.
  - `SettingsTab-DPrCHReO.js` contains `v10.7.9.55`, "首页自选默认显示全部", and "图片加载失败时直接隐藏"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除验证记录,不影响首页运行时代码。

### 2026-07-03 - 自选默认展开并接入 EODHD 图标

- Commit: `bc97472c384a8c4b2a6fa53384afb8f33666041a`
- Background: 用户要求首页自选区域默认显示全部,并确认公司图标是否能通过 EODHD 获取;如果不能稳定获取则取消图标功能。
- Changes:
  - 首页自选 tab 默认显示全部自选股票,不再限制为 3 行预览。
  - 持仓 tab 继续保留 3 行预览和 `查看全部` 展开逻辑。
  - 自选/持仓列表图标改为 EODHD 官方 logo 图片地址 `https://eodhd.com/img/logos/US/{SYMBOL}.png`,不需要前端 token。
  - 公司图标加载失败时直接隐藏,不再显示字母占位假图标。
  - 设置页用户可见更新日志同步到 `v10.7.9.55`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BFytG1L8.js` 21.05 kB / gzip 6.05 kB, `SettingsTab-DPrCHReO.js` 29.01 kB / gzip 11.30 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local mobile visual check: pass via Chrome DevTools Protocol mobile viewport; no horizontal overflow offenders, default watchlist shows 5 rows, `查看全部` is absent on watchlist, and all 5 list icons use EODHD logo URLs.
- Deployment: pushed to GitHub `main`; GitHub Actions run `28668771392` passed; Vercel status success with target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/DmxN6reREMuSNhqgowT79KPyGhvk`。
- Production verification: pass,见上方 `记录自选展开和 EODHD 图标部署验证` 条目。
- Rollback: 回滚本次提交会恢复自选 3 行预览和字母占位图标;不影响交易、资产或目标逻辑。

### 2026-07-03 - 记录首页列表字号部署验证

- Commit: `same commit`
- Background: 首页 `自选 / 持仓` 列表字号和行高改动已推送到 GitHub `main` 并完成 Vercel 生产部署,需要把最终线上证据回填到日志和交接文档。
- Changes:
  - 回填运行时代码提交 `eb47a1defc56ef44300a25af8930bb4984d28732` 的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和线上产物证据。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BQFTB0wJ.js` 20.77 kB / gzip 5.86 kB, `SettingsTab-Tord0uk8.js` 28.76 kB / gzip 11.23 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only verification record; runtime code already deployed by commit `eb47a1defc56ef44300a25af8930bb4984d28732`.
- Production verification:
  - Runtime commit: `eb47a1defc56ef44300a25af8930bb4984d28732`
  - GitHub Actions `CI`: success, run `28668049380`
  - Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/9UPP3BLCdE2FhyWNybx6XRoHPMd3`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-Dv996v4w.js`, `App-BqYxDnF0.js`, `HomeTab-BQFTB0wJ.js`, `SettingsTab-Tord0uk8.js`
  - `HomeTab-BQFTB0wJ.js` contains `查看全部`, `min-h-[43px]`, `text-[13px]`, `text-[10px]`, and the tightened table grid class.
  - `SettingsTab-Tord0uk8.js` contains `v10.7.9.54`, "首页自选/持仓列表按效果图重排", "列表改为 3 行预览", and "行尾箭头、行高和分隔线按效果图调整"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除验证记录,不影响首页运行时代码。

### 2026-07-03 - 对齐首页自选持仓列表字号

- Commit: `eb47a1defc56ef44300a25af8930bb4984d28732`
- Background: 用户要求首页底部 `自选 / 持仓` 和列表文字大小严格参考效果图,当前列表行高、右上角动作和行内文字层级仍不够贴近。
- Changes:
  - 首页列表顶部 tab 改为效果图式 14px 加粗文字,右侧动作改为 `查看全部` + 箭头。
  - 自选/持仓列表默认显示 3 行预览,点击 `查看全部` 展开当前 tab 全部行。
  - 表头字号、行高、股票代码、公司名、价格、涨跌幅、持仓盈亏和行尾箭头按效果图收紧。
  - 列表分隔线透明度降低,整体更接近截图的紧凑暗色表格。
  - 设置页用户可见更新日志同步到 `v10.7.9.54`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BQFTB0wJ.js` 20.77 kB / gzip 5.86 kB, `SettingsTab-Tord0uk8.js` 28.76 kB / gzip 11.23 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local mobile visual check: pass via Chrome DevTools Protocol mobile viewport; no horizontal overflow offenders, default preview shows 3 stock rows, `查看全部` is visible, `添加` / `记一笔` are absent, row height is 43px, symbol font is 13px, company-name font is 10px, and price font is 13px.
- Deployment: pushed to GitHub `main`; GitHub Actions run `28668049380` passed; Vercel status success with target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/9UPP3BLCdE2FhyWNybx6XRoHPMd3`。
- Production verification: pass,见上方 `记录首页列表字号部署验证` 条目。
- Rollback: 回滚本次提交会恢复首页列表上一版字号、行高、右上角添加/记一笔入口和最多 6 行自选预览;不影响交易、资产或目标逻辑。

### 2026-07-03 - 记录首页 BTC 市场卡部署验证

- Commit: `same commit`
- Background: 首页资产卡精简、当前信号收紧和 BTC 市场卡运行时代码已推送到 GitHub `main` 并完成 Vercel 生产部署,需要把最终线上证据回填到日志和交接文档。
- Changes:
  - 回填运行时代码提交 `21242f015508d37aa85f7e141f7a548b7e0fae01` 的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和线上产物证据。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BAW_INYx.js` 20.56 kB / gzip 5.80 kB, `SettingsTab-Dl_xZT64.js` 28.48 kB / gzip 11.12 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only verification record; runtime code already deployed by commit `21242f015508d37aa85f7e141f7a548b7e0fae01`.
- Production verification:
  - Runtime commit: `21242f015508d37aa85f7e141f7a548b7e0fae01`
  - GitHub Actions `CI`: success, run `28667320117`
  - Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/4KzszEVaRnYmWCRjnqUTvGasRbEK`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-DOhTX5qe.js`, `App-DcFWu00c.js`, `HomeTab-BAW_INYx.js`, `SettingsTab-Dl_xZT64.js`
  - `HomeTab-BAW_INYx.js` contains current-signal shrink classes `h-[62px]`, `text-[19px]`, `grid-cols-[62px_minmax(0,1fr)_70px]`; it no longer contains `≈`, `持仓股票`, or `卖出记录` helper text.
  - `SettingsTab-Dl_xZT64.js` contains `v10.7.9.53`, "总资产卡删除约等金额副行", "当前信号卡整体缩小约 20%", and "市场卡将黄金/美元替换为 BTC/美元"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除验证记录,不影响首页运行时代码。

### 2026-07-03 - 精简首页资产卡和替换 BTC 市场卡

- Commit: `21242f015508d37aa85f7e141f7a548b7e0fae01`
- Background: 用户继续按效果图收紧首页:总资产卡不再需要任何副行换算,持仓数量下方说明文字冗余,当前信号区域仍偏大,且第四张市场卡希望从黄金/美元换成 BTC/美元。
- Changes:
  - 首页总资产卡删除另一币种约等金额副行,保留 USD/RMB 切换和主金额。
  - 首页持仓数量栏删除 `持仓股票 · 卖出记录` 小字说明。
  - 当前信号卡整体约缩小 20%:卡片内边距、雷达尺寸、三列宽度、主状态、辅助文案和回撤数字同步收紧。
  - `INDICES` 市场卡第四项由 `XAUUSD.FOREX` 改为 `BTC-USD.CC`,走势图 symbol 同步为 Yahoo `BTC-USD`。
  - Quote response-shape 测试明确断言第四张市场卡为 `BTC-USD.CC` / `BTCUSD`。
  - 设置页用户可见更新日志同步到 `v10.7.9.53`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `server/quote/providers/indices.js`
  - `tests/quote-response-shape.test.js`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BAW_INYx.js` 20.56 kB / gzip 5.80 kB, `SettingsTab-Dl_xZT64.js` 28.48 kB / gzip 11.12 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local mobile visual check: pass via Chrome DevTools Protocol mobile viewport; no horizontal overflow offenders, no `≈` text, no `持仓股票` / `卖出记录` helper text, BTC present and gold absent.
- Deployment: pushed to GitHub `main`; GitHub Actions run `28667320117` passed; Vercel status success with target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/4KzszEVaRnYmWCRjnqUTvGasRbEK`。
- Production verification: pass,见上方 `记录首页 BTC 市场卡部署验证` 条目。
- Rollback: 回滚本次提交会恢复资产卡副行、当前信号上一版尺寸和黄金/美元市场卡;不影响交易、资产或目标逻辑。

### 2026-07-03 - 记录首页数字层级部署验证

- Commit: `same commit`
- Background: 首页数字层级运行时代码 `ba94dfa77b9ee4d5f8cf55b37b93a8ef4c01ec72` 已通过后续 docs-only 触发提交 `81e202cfaf4c52542f6efc29a0b141c7ab2f0856` 完成 Vercel 生产部署,需要把最终线上证据回填到日志和交接文档。
- Changes:
  - 回填首页数字层级改动的 GitHub Actions、Vercel 和生产 chunk 验证结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和线上产物证据。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BQ-Txk2y.js` 20.82 kB / gzip 5.83 kB, `SettingsTab-ByI5o0mQ.js` 28.22 kB / gzip 11.02 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only verification record; runtime code already deployed by trigger commit `81e202cfaf4c52542f6efc29a0b141c7ab2f0856`.
- Production verification:
  - Runtime commit: `ba94dfa77b9ee4d5f8cf55b37b93a8ef4c01ec72`
  - Deployment trigger commit: `81e202cfaf4c52542f6efc29a0b141c7ab2f0856`
  - GitHub Actions `build`: success, runs `28665772588` and `28665980534`
  - Vercel deployment: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/7jgaxgSCXKmrpTevRbJp129FaisV`
  - Production `GET https://boduan-tracker.vercel.app/`: `200`
  - Production chunks: `index-CNrhAves.js`, `App-B7iH9a-B.js`, `HomeTab-BQ-Txk2y.js`, `SettingsTab-ByI5o0mQ.js`
  - `HomeTab-BQ-Txk2y.js` contains the smaller total-asset/drawdown text classes and no `汇率` text in the top asset card payload; it keeps the `≈ $`/`≈ ¥` converted-amount line.
  - `SettingsTab-ByI5o0mQ.js` contains `v10.7.9.52`, "首页数字层级继续收紧", and "总资产副行删除重复汇率文案"。
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns `401`; `/api/quote` auth remains enabled.
- Rollback: 回滚本次 docs-only 提交只会移除验证记录,不影响首页运行时代码。

### 2026-07-03 - 记录首页数字层级提交并重触发部署

- Commit: `81e202cfaf4c52542f6efc29a0b141c7ab2f0856`
- Background: 首页数字层级运行时代码提交 `ba94dfa77b9ee4d5f8cf55b37b93a8ef4c01ec72` 已推送到 GitHub `main`,GitHub Actions 已成功,但 Vercel 未在常规等待窗口内为该 SHA 创建 deployment 记录,需要用 docs-only 提交重触发 GitHub 集成并保留证据。
- Changes:
  - 回填首页数字层级运行时代码提交 SHA。
  - 记录 Vercel 未自动挂载 `ba94dfa` deployment 的处置方式。
- Key files:
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BQ-Txk2y.js` 20.82 kB / gzip 5.83 kB, `SettingsTab-ByI5o0mQ.js` 28.22 kB / gzip 11.02 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: success; this docs-only commit triggered a fresh Vercel production deployment of latest `main`, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/7jgaxgSCXKmrpTevRbJp129FaisV`。
- Production verification: pass,见上方 `记录首页数字层级部署验证` 条目。
- Rollback: 回滚本次 docs-only 提交只会移除部署触发记录,不影响首页运行时代码。

### 2026-07-03 - 收紧首页数字层级并移除汇率副文案

- Commit: `ba94dfa77b9ee4d5f8cf55b37b93a8ef4c01ec72`
- Background: 首页首屏仍有部分数字比设计稿偏大,且总资产卡已经提供 USD/RMB 切换后,副行继续展示汇率显得重复。
- Changes:
  - 总资产副行删除 `汇率 x.xx` 文案,仅保留另一币种的约等金额。
  - 首页总资产主金额从 40px 降到 34px。
  - 当前信号主状态文案从 `text-2xl` 降到 `text-xl`。
  - 策略状态回撤数字从 30px 降到 24px。
  - VIX 和 CNN 恐慌贪婪指数主数字从 `text-3xl` 降到 `text-2xl`,CNN 标签同步从 `text-base` 降到 `text-sm`。
  - 设置页用户可见更新日志同步到 `v10.7.9.52`。
- Key files:
  - `src/tabs/HomeTab.jsx`
  - `src/tabs/SettingsTab.jsx`
  - `docs/development-log.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-BQ-Txk2y.js` 20.82 kB / gzip 5.83 kB, `SettingsTab-ByI5o0mQ.js` 28.22 kB / gzip 11.02 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
  - Local mobile visual check: pass at 390x844 in both USD and RMB modes; no horizontal overflow and no `汇率` text in the top asset card.
- Deployment: pushed to GitHub `main`; GitHub Actions run `28665772588` passed. Vercel did not create a deployment record for this SHA during the normal wait window, so docs-only follow-up commit `81e202cfaf4c52542f6efc29a0b141c7ab2f0856` re-triggered production deployment for latest `main`。
- Production verification: pass after follow-up deployment trigger; production `HomeTab-BQ-Txk2y.js` contains the updated typography classes and no `汇率` text, `SettingsTab-ByI5o0mQ.js` contains `v10.7.9.52`, and `/api/quote?symbols=VIX` without auth returns `401`。
- Rollback: 回滚本次提交会恢复首页上一版数字层级和总资产副行汇率展示;不影响交易、资产或目标逻辑。

### 2026-07-03 - 记录首页币种切换发布验证

- Commit: `same commit`
- Background: 首页字体、底部导航和 USD/RMB 切换的运行时代码已推送并由 Vercel 完成生产部署,需要把部署证据回填到日志并刷新交接文档当前状态。
- Changes:
  - 回填运行时代码提交 `5b40b9d2afc14372a65132adb802cae768f8c7f4` 的 GitHub Actions、Vercel 和生产 smoke check 结果。
  - 刷新 `docs/handoff.md` 当前运行时代码、设置页版本和生产 chunk 证据。
- Key files:
  - `docs/development-log.md`
  - `docs/handoff.md`
- Validation:
  - `npm test`: pass, 21 tests.
  - `npm run build`: pass; `HomeTab-D9tp3Z_b.js` 20.88 kB / gzip 5.86 kB, `App-w46slVPG.js` 126.42 kB / gzip 34.14 kB.
  - `npm audit`: pass, found 0 vulnerabilities.
  - `git diff --check`: pass.
- Deployment: docs-only record; runtime deployment evidence is recorded in the entry below, and this commit does not change runtime assets.
- Production verification: runtime commit `5b40b9d2afc14372a65132adb802cae768f8c7f4` already verified on production; this commit only records that evidence.
- Rollback: 回滚本次 docs-only 提交只会移除发布证据记录,不影响线上运行时代码。

### 2026-07-03 - 调整首页字体、底部导航和币种切换

- Commit: `5b40b9d2afc14372a65132adb802cae768f8c7f4`
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
- Deployment: pushed to GitHub `main`; GitHub Actions run `28664999696` passed; Vercel status success with target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/BeD4vZBihYbB9VjA4EAg9EQ6CGb6` and deployment id `5300500092`。
- Production verification:
  - `GET https://boduan-tracker.vercel.app/`: HTTP 200 from Vercel.
  - Production entry chunk: `index-C1aFWIrR.js`, App chunk: `App-Qgn3MtGg.js`.
  - App chunk maps `HomeTab-D9tp3Z_b.js` and `SettingsTab-5CV0bdpD.js`.
  - `HomeTab-D9tp3Z_b.js` contains `xmoney_home_currency`, RMB toggle, and system font stack.
  - `SettingsTab-5CV0bdpD.js` contains `v10.7.9.51` and the USD/RMB update-log text.
  - `GET https://boduan-tracker.vercel.app/api/quote?symbols=VIX` without auth returns HTTP 401; `/api/quote` auth remains enabled.
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
