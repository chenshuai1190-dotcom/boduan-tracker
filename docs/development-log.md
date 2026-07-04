# Development Log

本文件记录 `boduan-tracker` 的每次可维护更新。任何代码、配置、部署、安全或文档改动,都必须在同一个提交中追加日志。

## 2026-07-04 Asia/Shanghai

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
