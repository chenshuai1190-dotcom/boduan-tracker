# boduan-tracker 产品交接文档

更新时间: 2026-07-14 Asia/Shanghai

这份文档给下一位接手 `boduan-tracker` 的工程师或 AI 代理使用。先按这里同步状态,再看开发日志和代码。

## 0. 给下一位同事的直接接手摘要

- 本地待发布 `v10.7.9.332`:收益比赛已生成快照按账户/周期缓存,美东交易日 17:10 主检查、19:10 最多一次延迟重试,回前台只做本地刷新决策;头像移到“我的排名”下方,三项收益指标右移,更新时间按真实 `asOfDate` 动态显示为灰色“数据更新MM.DD”。缓存不生成或修正收益,服务端锁定收盘快照仍是唯一真实来源。当前生产在本次部署完成前仍为 `v10.7.9.331`。
- 当前生产已部署 `sensitive` 后端 runtime `8f23a471be3cd63b657bf1f7a807c438881a23ea`,设置页可见版本保持 `v10.7.9.331`:无显式日期的个人/比赛 scheduled run 以 `America/New_York` 为准,美东工作日 17:00 前只安全 defer,17:00 后才选择当天目标日;个人和比赛各在 UTC 21/22/23 运行三次冗余路径。显式日期必须先取得 SPY 目标日精确收盘,周末、休市日或行情未齐时在零业务数据库访问下失败。正式 `stock_trades` 由数据库权威时间戳和 `stock_trade_ledger_revisions` 修订号追踪;加入、重建基线和首张快照都以 revision CAS 串行化。仅当前目标日且可证明全部是 16:00 ET 前纯 INSERT 的新增交易可直接进入当日首张快照;其余历史修改、删除或不可证明的变化仅允许 active、全表 0 snapshots、两个 ranking 字段均为空的成员在 scheduled D1 向前重建 eligibility。D1 拉取 SPY 与所有相关个股的精确 EOD/OHLC,只移动 eligible date/hash/revision,不写 snapshot/ranking/收益;D2 下一真实收盘只有账本未变才开始排名。锁顺序固定为 revision row 后 membership row;已有 snapshot/ranking、malformed ledger、超卖或缺行情都不能绕过。数据库源 commit `0f52700761beab0d4488e067ca9e968aea9a9bc1`、生产 SQL、metadata、21 tables + 2 RPCs RLS gate、双会话锁序 smoke、Actions `29321470173` 和 Vercel `CkNECvKe9N3WGSLokcaWFdYkUxvg` 均已完成;只有真实收盘 D1/D2 仍待观察,绝不能预填。
- 上一轮 runtime `9e1c840e0b336a0352b79f691b7ce3a3b252ff98` 的历史基准:个人/比赛 EODHD 按 symbol 最多重试 3 次,可恢复缺口不再以 HTTP 200 假成功。`2026-07-13` 历史补跑产生个人 12 users / 12 portfolio rows、54 symbol rows / 18 symbols;比赛 8 users / 8 locked rows,active 9、eligible 9、initialized 8、invalid 0,另 1 名尚未排名成员因 `eligible_ledger_hash_mismatch` 继续拒绝。该记录只是新 runtime 上线前的生产基线,不是 D1/D2 的完成证据。
- 当前生产已上线 `v10.7.9.331`。主动投资价值分享卡的当前标的、QQQ 和跑赢/跑输结果三组“金额 + 收益率”统一为同行展示,极窄屏保留安全换行;金额、收益率、颜色、计算和数据边界不变。
- 当前生产已上线 `v10.7.9.330`。主动投资价值分享卡删除标题下方同期 QQQ 假设提示,日期说明移除“个股/QQQ 普通收盘价”尾注,并删除复制对比文字按钮及剪贴板逻辑;真实收益结果、百分比、灰色外边框、关闭逻辑与主卡完整方法口径不变。
- 当前生产已上线 `v10.7.9.329`。个股详情收益走势/收益对比在 iOS 连续滑动时保持日期、十字线和金额同步;收益对比小浮层点图外立即关闭、12 秒自动关闭并可再打开;主动投资价值分享大卡恢复系统标准 10% 灰色外边框。不改收益计算、普通收盘价、现金流、API、账本或鉴权。
- `v10.7.9.328` 统一个股和 QQQ 普通收盘价口径,个人快照只核验日期/持仓股数;主卡将超额金额与收益率差分开,任一侧缺少必要普通收盘价时整卡不可用,不写账本/快照且生产无 mock 或估算兜底。
- `v10.7.9.327` 新增个股详情真实收益对比基础；同一 production runtime 继续包含独立提交的 `v10.7.9.326` 真实美股收盘涨/跌幅榜与已添加股票减号修复。
- `v10.7.9.327` 的收益对比跟随本年、近 1 月、近 6 月、近 1 年和全部周期。当前持仓轮次在清仓后重新买入时重置;起点取本轮首笔买入与周期起点中较晚者当日或之后,现有个人收益快照与 QQQ 普通收盘价都有数据的首个共同日期,双方归零。后续买入给 QQQ 等额资金,卖出按卖前持仓比例同步减仓,双方使用移动均价和已实现盈亏摊薄成本;缺数据或账本/快照不一致时不可用,生产无 mock/估算兜底。个人收益快照仍是 owner-scoped 且沿用现有用户可写模型,因此这是个人账本分析,不是比赛级不可覆盖证明。
- `v10.7.9.326` 使用已登录 `/api/quote?view=market-movers` 和服务端 EODHD 真收盘数据,再与 Nasdaq Trader 当前上市目录交集验证,涨/跌各返回 30 只;范围严格限定 NASDAQ / NYSE / NYSE American 普通股,单次每侧最多复核 80 个 HomeCategory 候选并有 2 分钟实例内失败退避,官方目录异常时 fail closed,生产无 EODHD-only 或 mock 榜单兜底。
- 当前已验证 production runtime 为 `8f23a471be3cd63b657bf1f7a807c438881a23ea`,入口 `/assets/index-DrckgGpM.js`;GitHub Actions run `29321470173` success,Vercel target `CkNECvKe9N3WGSLokcaWFdYkUxvg` success。
- `v10.7.9.316` 只实装已确认效果图的 15 组弹窗,保留各自宽度与业务回调,增加输入/日期宽度和 iOS 键盘稳定保护,恢复管理员邀请码使用邮箱显示。
- `v10.7.9.315` 把邀请注册改为两步:账户/邀请码校验后必须输入 2-16 字符昵称并明确选择 18 款头像之一。服务端先创建完整 `community_profiles` 再消费邀请码,失败回滚新 Auth 用户;不会自动加入收益比赛。
- 独立边界: `community_competition_members`、`community_competition_snapshots`、`/api/community-competition` 和独立公开比赛 Cron 路径保持不变;比赛只读正式 `stock_trades`,只写比赛表,不改任何交易账本、个人收益报表快照、行情 relay、quote 或财报日历逻辑。榜单公开昵称、头像、排名、收益率和经账本哈希验证的收盘持仓代码,仍不含 user id、邮箱、股数、成本、金额、仓位比例或交易明细。
- 自动快照硬规则:无显式日期的工作日调用必须以美东时间为准且 17:00 前不访问 provider/数据库;UTC 21/22/23 只是冗余触发,所有 retry/late-retry 都 rewrite 到同一 `CRON_SECRET` 保护函数。合法显式日期可做受保护人工修复但比赛显式路径绝不 rebaseline;非法、未来或美东当日 17:00 前日期直接 400,周末、休市日或 SPY 目标日精确收盘未齐在任何业务数据库访问前失败。provider/network 或目标日持仓收盘未齐必须在有界重试后返回 503,不可回退旧日期或用 skipped+200 隐藏。个人只在最近 31 个日历日窗口补已有账户缺口,无完成标记用户只计划目标日,portfolio 标记先删后最后写。比赛按完整 SPY 日历有界分批,空仓不造行、锁定行不覆盖;加入与首快照以权威 ledger revision CAS 为准。仅当前目标日、数据库时间证明为 16:00 ET 前纯 INSERT 的新增交易可直达当日快照;其余未排名账本变化走 D1 forward-only rebaseline,只移动 eligible date/hash/revision,D2 才可能产生首张真实快照。完整账本、USD、交易顺序、不超卖、EOD close 和 raw high/low 校验不得弱化;两条链路都不改正式 `stock_trades`,生产无 mock、实时价、估算收益或旧收盘兜底。
- `v10.7.9.302` 社区头像白边修正 commit `797fab626136719e5448692e1536f2a533d28b19` 已随 v303 上线。设置页社区资料头像取消额外白色 CSS 边框,头像图在圆形容器内轻微放大裁切;只改设置页展示样式。
- 当前本地候选设置页版本为 `v10.7.9.332`,生产仍为 `v10.7.9.331`;当前已验证生产运行时基准为 `8f23a471be3cd63b657bf1f7a807c438881a23ea`,入口 `/assets/index-DrckgGpM.js`。v332 完成收益比赛客户端缓存和头部布局,等待本次授权部署。
- `v10.7.9.331` 验证:定向测试 51/51、build、docs consistency 和 diff check 均 pass;Xcode iOS 26.5 `iPhone 17 Pro` Simulator 使用中文/CNY、English/CNY 和损失样例均无结果卡横向溢出,三组数字正常同行,分享卡高度由约 `447px` 降至 `381px`。GitHub Actions `29291434809` 与 Vercel `JALybbWGhb25un79Ahjasob9tRCR` success,生产六个关键产物与本地 build 字节一致,4 个未登录 API 均为 `401`;按 `ui-fast` 不运行完整测试、audit 或旧 frontend smoke。
- 本次收盘快照可靠性修复验证:本地定向 116/116、完整 `npm test` 323/323、build、audit high 0、RLS REST 20/20、toolchain/workspace/docs consistency/diff check 均 pass;runtime Actions `29313005445` success,Vercel `DSGn5mQnzs2o1x6ohQWD6DGrMy2Y` Ready,Cron 补跑和生产聚合回读均完成。它不含前端改动,因此没有也不需要新增 iOS Simulator 视觉/系统键盘/PWA 证据。
- ET gate/rebaseline/revision CAS 的最终 blocker 修复与 sensitive 门禁已通过:定向敏感测试 100/100、完整 `npm test` 362/362、build、audit high 0、toolchain、docs consistency、diff check,以及显式 SPY 边界、D1/D2、纯 INSERT、历史修改/删除、缺精确个股 D1 EOD、旧 close、late trade、price-out-of-range、空/非 USD 和 malformed 场景全部 pass。生产 SQL、21 tables + 2 RPCs RLS gate、metadata、真实数据库并发 smoke 和 runtime deployment 已完成;真实收盘 D1/D2 观察仍 pending。本轮无前端改动,不需要 iOS Simulator 视觉/系统键盘/PWA 证据。
- `v10.7.9.330` 验证:定向边界测试 51/51、build、docs consistency、diff check 和 Xcode iOS 26.5 `iPhone 17 Pro` Simulator 均 pass;长提示、普通收盘价尾注与复制按钮均不存在,标题、真实结果、收益率差、关闭按钮和 `1px rgba(255,255,255,0.10)` 灰边保留。GitHub Actions `29290092289` 与 Vercel `ApuefMFcjKxa37HrUPVmeACc5J6S` success,生产六个关键产物与本地 build 字节一致,未登录 quote/earnings 均为 `401`;按 `ui-fast` 不运行完整测试、audit 或旧 frontend smoke。
- `v10.7.9.329` 验证:定向边界测试 51/51、build、docs consistency、diff check 和 Xcode iOS 26.5 `iPhone 17 Pro` Simulator 均 pass;两张图连续滑动日期/金额同步,收益对比浮层点外立即关闭、12 秒自动关闭并可再打开,分享大卡标准灰边实测为 `1px rgba(255,255,255,0.10)`。GitHub Actions `29288973165` 与 Vercel `hTdA9vSVDXU3NT6x8uMo8qLVNFQM` success,生产个股详情 chunk 与本地 build 字节一致,未登录 quote/earnings 均为 `401`;按 `ui-fast` 未运行完整测试、audit 或旧 frontend smoke。
- `v10.7.9.328` sensitive 验证:toolchain、完整测试 298/298、build、high audit 0 vulnerabilities、docs/diff、匿名 RLS 20/20 和 12-function 上限均 pass。真实 server-only NVDA/QQQ EOD 探针各返回 130 个有效 `rawClose`;本机 Xcode iOS 26.5 `iPhone 17 Pro` Simulator 已验收主卡、低密度图表小浮层和无外层白框分享卡。生产关键 chunks 与本地 production build 字节一致,命中 v328/收益率差/双侧普通收盘价 marker,四条未登录 API 均为 `401`。
- `v10.7.9.327` sensitive 验证:toolchain、收盘榜/收益对比/API/分页/边界定向 94/94、完整测试 295/295、build、high audit 0 vulnerabilities、docs/diff、匿名 RLS 20/20 和 12-function 上限均 pass;真实 server-only QQQ EOD 探针返回 28/28 条有效 `rawClose`,no-store 生效且不泄露 key。已在本机 Xcode iOS 26.5 `iPhone 17 Pro` Simulator 只读 `DevVisualPreview` 使用 NVDA 验收主卡、首笔买入/对比起点小字、方法弹窗、分享预览、后续加仓/减仓成本流与纵向滚动。生产 Actions/Vercel success,四条未登录 API 均为 `401`,新版 chunks marker 完整且无本地 fixture 标识。个股侧沿用现有正式收盘快照口径,QQQ 侧明确使用普通收盘价;公司行动附近可能存在口径差异,当前不做调整价估算或伪造补偿。
- `v10.7.9.326` 验证:market-movers/边界定向 55/55、完整测试 264/264、build、零 production-fixture marker、真实 EODHD + Nasdaq Trader 交集后 30/30 同日收盘探针和 iOS 26.5 iPhone 17 Pro Simulator 只读视觉/交互均 pass;`MSPR` / `BLMZF` 等已转 OTC/退市代码已从真实榜单排除。已随 v327 runtime 上线;生产未登录 market-movers 为 `401`,本轮没有伪称完成生产登录态人工榜单检查。
- `v10.7.9.325` 验证:定向边界测试 46/46、build、docs consistency、diff check 和 iOS 26.5 iPhone 17 Pro Simulator 均 pass;公司财报卡和“全部”默认进入列表,切换日历正常,明确的日历按钮仍直接进入日历。`verify:deploy-status -- 05a0b91` pass,Actions `29225315430` 与 Vercel `8Pz4D2XZAKYHGLN84vXHB2UK49Db` success,生产四个关键 JS 产物与本地 SHA-256 一致,quote、earnings 未登录保持 `401`。按 `ui-fast` 未跑完整测试、audit 或旧 frontend smoke。
- `v10.7.9.324` 验证:目标页定向测试 46/46、build、docs consistency、diff check 和 iOS 26.5 iPhone 17 Pro Simulator 均 pass;`verify:deploy-status -- 56626e5` pass,Actions `29216076019` 与 Vercel `UN6uYu3a8KUaivPwpq4KjXJjJqPk` success,quote、earnings 未登录保持 `401`。生产目标页/i18n/settings/changelog chunks 命中“年底目标”、`Year-End Target` 和 `v10.7.9.324` marker。
- `v10.7.9.323` 验证:设置/弹窗定向 46/46、build、docs consistency、diff check、iOS 26.5 Simulator 英文设置页和 `verify:deploy-status -- d8ea6ef` 均 pass;Actions `29198603364` 与 Vercel `6M39R6ojEAwcenGshecCRPHVKcw2` success,quote、earnings 未登录保持 `401`。按 UI-fast 未跑完整测试或 audit。
- `v10.7.9.322` 验证:完整测试 255/255、build、high audit 0 vulnerabilities、docs/diff、iOS 26.5 Simulator 系统键盘和 `verify:deploy-status -- a61fc55` 均 pass;Actions `29197665639` 与 Vercel `CQBi1sr3EMRztDk7g8QYKF1FgbiT` success。4 个关键生产文件与本地 SHA-256 一致,quote、earnings 未登录保持 `401`;按新准则未运行桌面/内置浏览器视觉测试。
- `v10.7.9.320` 验证:资产/交易弹窗定向 46/46、build、docs consistency、diff check 和 `verify:deploy-status -- 28cecac` 均 pass;Actions `29195304295` 与 Vercel `G2HNApMpsV9nmGzBAsPnwmaG5gTB` success。生产入口、Analysis、Trades、Settings 与更新日志 5 个关键文件均与本地 SHA-256 一致,线上命中 v320/更新标题 marker,quote、earnings 未登录保持 `401`。按 `ui-fast` 规则未跑完整测试、5 页 smoke 或 audit。
- `v10.7.9.319` 验证:目标页定向 46/46、完整测试 255/255、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 均 pass。`verify:deploy-status -- 320f052` pass,Actions `29193491014` 与 Vercel `CAf9PQWVdE19L7Kau2Wh1vUgKWzP` success;三个关键 chunk 与本地 SHA-256 一致,生产命中 v319/100%/公式/160px marker,quote、earnings 未登录保持 `401`。
- `v10.7.9.316` 验证:定向 45/45、完整测试 253/253、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 和 `npm run verify:deploy-status -- 4302f0a` 均 pass;GitHub Actions run `29188138401` 与 Vercel target `EfhqACofs6jB8oUok8AgTqNaY8o1` success。390x844 与 390x568 输入聚焦视觉检查横向零溢出、未跳顶、console error 0;生产 29 个 assets 命中 v316/新版弹窗/visual viewport/邀请码邮箱 marker,quote、earnings 均为 `401`。
- `v10.7.9.318` 验证:波段/边界定向 59/59、完整测试 255/255、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 和 390x844/390x560 视觉检查均 pass。波段目标价只做弹窗内纯计算,单价保持 USD,收益金额跟随首页币种;不写数据库或账本。最新收益点创新高时峰值标记已恢复。`verify:deploy-status -- 3e38485` pass,Actions `29192839345` 与 Vercel `8E6Na4UWfXb5chs4Z9WqCPHuo8nP` success;生产 28 个 JS assets 命中 v318/目标价/峰值 marker,四个关键 chunk 与本地构建 SHA-256 一致,quote、earnings 未登录保持 `401`。
- `v10.7.9.317` 清理已随 v318 上线:定向 46/46、完整测试 254/254、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 均 pass。390x844 实测“全部交易”保持 390px 满宽且页面横向零溢出,最终删除进入 314px 共享危险确认卡。
- `v10.7.9.315` 验证:定向 60/60、完整测试 252/252、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff、匿名 RLS 20/20 均 pass;生产 SQL metadata/RLS 回读符合预期。GitHub Actions run `29185593537` 与 Vercel target `CLPNWdw4bgKAdSDaqVHkLKqXuAJj` success;生产 28 个 chunks 命中 v315/两步注册/社区资料 marker,18/18 头像资源 `200`,缺资料注册 `400`,quote、earnings、competition GET/POST 和 competition Cron 均为 `401`。
- `v10.7.9.314` 验证:定向 53/53、完整测试 247/247、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 均 pass;390x844 头部外框 95px、内部头像无边框、卡片 358×176px 且页面横向零溢出。GitHub Actions run `29184108557` 与 Vercel target `43bTjZaX3mZr8cRyorYsA8jRBeCj` success;生产设置 chunk 命中 v314/95px/独立外框,比赛 chunk 不含设置页外框并保持 1.15 裁切,quote、earnings、competition GET/POST 和 competition Cron 均为 `401`。
- `v10.7.9.313` 验证:定向 53/53、完整测试 247/247、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 均 pass;390x844 红色/蓝色头像均为 79px、白边不可见、头卡提示删除且页面横向零溢出。GitHub Actions run `29183688396` 与 Vercel target `CvEfjcmjcs1pYrwPJU94zRYB72pC` success;生产 29 个 chunks 命中 v313/1.15 裁切/79px,旧 1.02 裁切不存在,quote、earnings、competition GET/POST 和 competition Cron 均为 `401`。
- `v10.7.9.312` 验证:定向 53/53、完整测试 247/247、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff、匿名 RLS 20/20 均 pass;390x844 设置页 18/18 图片加载、6 列×3 行、横向零溢出,排行榜动物/赛博头像加载正常。GitHub Actions run `29182253805` 与 Vercel target `Bw1hyXdMRykyQNCm1rms9TA9tFMq` success;生产递归扫描 29 个 chunks 命中 v312/更新日志/新头像路径,18 张资源全部 `200`,quote、earnings、competition GET/POST 和 competition Cron 均为 `401`。
- `v10.7.9.311` 验证:完整测试 246/246、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff、匿名 REST RLS 20/20 均 pass;未登录 quote、earnings、competition 和 competition Cron 均为 `401`。390x844 确认账户切换弹窗 314×321px、长邮箱截断、移除二次确认和横向零溢出,console error 0。GitHub Actions run `29181586305` 与 Vercel target `CYh9UvECvKQwK2E6WgD3QqqExrtL` success;生产 v311/切换/会话保险箱/local-scope marker 已验证。当前只有一个真实业务账户,没有伪造第二个生产 Auth 用户;需由用户添加第二个真实账户完成最终切换验收。
- `v10.7.9.310` 验证:定向 44/44、完整测试 242/242、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 均 pass;390x844 确认六款头像、头卡直达资料弹窗、取消回滚、保存更新和 390/390 宽度。GitHub Actions run `29180814130` 与 Vercel target `DnBY7bQZ4TCSpXZuHm612BVR8Y2d` success;生产六张头像字节、v310/弹窗/裁切 marker 和 quote/earnings `401` 已验证。
- `v10.7.9.309` 验证:定向 44/44、完整测试 242/242、build、5/5 frontend smoke、high audit 0 vulnerabilities、docs/diff 均 pass;390x844 确认无重复标题、加载阶段无金色头像闪现、页面 390/390,蓝色与非蓝色头像裁切均已复核。GitHub Actions run `29179842191` 与 Vercel target `BbCFJTQLooZKwAiuCon4sfbJnrBp` success;生产 v309/加载占位/两档裁切 marker 和 quote/earnings `401` 已验证。
- `v10.7.9.308` 验证:定向 44/44、完整测试 242/242、build、5/5 frontend smoke、moderate audit 0 vulnerabilities、docs/diff 均 pass;390x844 确认头卡 358×176px、头像 66px、页面 390/390,设置页与交易页配色状态同步。GitHub Actions run `29179082664` 与 Vercel target `5uNuTVKCmjyuBLRkyk59tFj3rs4f` success;生产 v308/折叠入口/交易页齿轮 marker 和 quote/earnings `401` 已验证。
- `v10.7.9.307` 验证:定向 42/42、完整测试 240/240、build、5/5 frontend smoke、moderate audit 0 vulnerabilities、docs/diff 均 pass;390x844 确认两张人物卡均为 358px/中性边框,金额与进度条同为系统红,账户类型图标同为中性默认色,页面 390/390。GitHub Actions run `29177426833` 与 Vercel target `GMuVHNQyMZbwRH1185LmJM2fB1JE` success;生产 marker 和 quote/earnings `401` 已验证。
- `v10.7.9.306` 验证:定向 42/42、完整测试 240/240、build、5/5 frontend smoke、moderate audit 0 vulnerabilities、docs/diff 均 pass;390x844 复核确认旧双列表固定错开 5px,新单 grid 只有一套分隔行,卡片仍为 358px、页面 390/390、名称列横滑后仍固定。GitHub Actions run `29177139868` 与 Vercel target `7n18YeG4g6329NyX3qwZmqDF7uDu` success;生产 marker 和 quote/earnings `401` 已验证。
- `v10.7.9.305` 验证:定向 63/63、完整测试 240/240、build、5/5 frontend smoke、moderate audit 0 vulnerabilities、匿名 RLS 20/20、docs/diff 均 pass;390x844 确认 320px 用户卡、头像箭头锚点、12 ticker 换行、空仓文案与横向零溢出。GitHub Actions run `29176830040` 和 Vercel target `HXVkbhd5FJcrwE51eCmjusQnK7qm` success;未登录 competition GET/POST、比赛 Cron、quote、earnings 均为 `401`。
- `v10.7.9.304` 验证:定向 42/42、完整测试 239/239、build、5/5 frontend smoke、moderate audit 0 vulnerabilities、docs/diff 均 pass;390x844 对照确认收益比赛与波段记录标题计算样式完全一致。GitHub Actions run `29162215875` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/GLo8GFDrxfEwbWznX5adZXyEHDht` success;未登录 competition GET/POST、比赛 Cron、quote、earnings 均为 `401`。
- `v10.7.9.303` 验证:定向 78/78、完整测试 239/239、build、5/5 frontend smoke、moderate audit 0 vulnerabilities、docs/diff/RLS 20/20 均 pass;GitHub Actions run `29161655826` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/6DCsp5jvNsubXhoKnZFybTM8gpf6` success。未登录 competition GET/POST、比赛 Cron、quote、earnings 均为 `401`;生产 chunk 命中 v303/真实 API/披露/等待状态,比赛页面 chunk 不含 localStorage、旧 join key 或固定 mock 数字。
- 最新已上线: `v10.7.9.301` 设置页社区资料基础。设置页新增“社区资料”模块,可真实读写后续社区比赛使用的公开昵称和 6 个默认头像;资料写入独立 `community_profiles`,只存 `nickname` 与 `avatar_key`,不存邮箱、资产、收益或交易账本。本轮不开放头像上传、不接 Supabase Storage。
- `v10.7.9.301` 验证:边界定向 42/42、完整测试 203/203、build、5/5 frontend smoke、moderate audit（0 vulnerabilities）、docs consistency、diff check 和 `npm run verify:deploy-status -- 4bfab84` 均通过;GitHub Actions run `29159386949` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/5BdqRfYevu2vMhpshwAUrCUqoqXo` success。2026-07-12 已在 Supabase SQL Editor 执行 `supabase/community_profiles.sql`;`npm run verify:rls:rest` 18/18 pass,`community_profiles` 匿名 REST 为 `401`;未登录 quote/earnings 均为 `401`;生产 marker 命中 `v10.7.9.301`、`设置页社区资料上线`、`community_profiles`、`community-avatars/avatar-gold.webp`、`社区资料`、`保存社区资料` 和 `默认头像`。本机 Vercel env pull 只能得到空 encrypted value,无法导出 service role 或 DB URL 做双用户 smoke。
- 上一条已上线: `v10.7.9.300` 社区比赛 mock 小工具第一版,运行时代码提交 `eae8a7a1e4c4f7076d600cb9ac9c58f57ee587c5`。交易页主工具入口把“摊薄工具”替换为“社区比赛”,“摊薄工具”迁入“全部功能”;社区比赛为独立 mock 页面,首次进入需自愿确认加入,加入状态只写本地 `boduan_community_competition_joined_v1`。本轮只做 HTML/mock 视觉还原和本地入口,不接数据库、不写交易账本、不计算真实收益、不改 RLS、行情 relay 或鉴权边界。
- `v10.7.9.300` 验证:边界定向 41/41、完整测试 202/202、build、5/5 frontend smoke、moderate audit（0 vulnerabilities）、docs consistency 和 diff check 均通过;390x844 本地社区比赛首访加入弹框、确认加入后榜单页、顶部收益率不截断、第 4 名及以后头像深灰边框、交易页工具入口和“全部功能”内摊薄工具均已复核,页面 `scrollWidth=390`。`npm run verify:deploy-status -- eae8a7a` pass;GitHub Actions run `29156492612` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/7mr1AwcSoVhKz5VToaTjoYgtPAh2` success,未登录 quote/earnings 均为 `401`;生产 marker 命中 `v10.7.9.300`、`社区比赛 mock 小工具第一版`、`boduan_community_competition_joined_v1` 和 `border-[#2a313b]/90`,且不含旧 `border-white/12`。
- `v10.7.9.299` 验证:波段/边界定向 52/52、完整测试 201/201、build、5/5 frontend smoke、moderate audit（0 vulnerabilities）、docs consistency 和 diff check 均通过;390x844 本地只读 wave-v2 preview 已确认默认展开、手动收起、刷新保持收起、再次展开和刷新保持展开,console error 0。`npm run verify:deploy-status -- e0debb2` pass;GitHub Actions run `29155636911` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/GXZsHBsMf7NLDFSwPLpFYQEg2sg6` success,未登录 quote/earnings 均为 `401`;生产 marker 命中 `v10.7.9.299`、`波段首页折叠记忆恢复`、`boduan_wave_tracker_expanded_v1`、`WaveTrackerPage-SBnFf21m.js`、`SettingsTab-CZfiG-s9.js` 和 `settingsChangelog-anvmF17-.js`,且生产 chunk 不含旧 `lockedExpanded` / `const forceExpanded`。
- 上一条已上线补充: `v10.7.9.298` 波段首页与新增弹框小修复已上线,运行时代码提交 `18f25333c8fb4cfddb54eb4298afc8d9e20d171e`。默认筛选改为“进行中”,仅已完成股票只在“已完成”筛选出现;同股多波段在无用户记忆的默认状态下完整展开。共用 `ActionModalCard` 跟随 iOS `visualViewport`,修复首次聚焦输入时弹框跳顶,日期文字垂直居中;确认与取消统一为中性色,但未满足条件时确认按钮仍为原生 `disabled` 并阻止提交,危险确认仍为红色。
- `v10.7.9.298` 验证:波段定向 52/52、完整测试 201/201、build、5/5 frontend smoke、moderate audit（0 vulnerabilities）、docs consistency 和 diff check 均通过;390x844 首页/新增弹框、390x500 与 390x300 键盘压缩视口复核通过,四个输入字段均可到达,弹框未跳出可视区,关闭后滚动锁恢复,console error 0。`npm run verify:deploy-status -- 18f2533` pass;GitHub Actions run `29155184666` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/FGs3ThBsRE6nE1XLB8zW8tpdKDZn` success,未登录 quote/earnings 均为 `401`;生产 marker 命中 `v10.7.9.298`、`WaveTrackerPage-ClYqGD2a.js`、`ActionModalCard-CTI_wgqk.js`、`SettingsTab-BUnYaY2P.js` 和 `settingsChangelog-BXVNnlzy.js`。
- 上一条已上线补充: `v10.7.9.297` 波段记录 V2 真实独立页面、页面级 `swing_waves` CRUD、纯 view model、共用股票 Logo、active-only 登录态行情接入和中英文案已上线,运行时代码提交 `b56b7127ab69bd40bee1932c12eab722ebb4064d`。正式 ledger/自选在 realtime 50-symbol 上限前优先于工具 symbol,已完成波段不占 relay 名额。生产数据库表/RLS metadata 13/13、两个现有真实 Auth 用户的 authenticated role/JWT subject CRUD/RLS 隔离 smoke 14/14 和残留数据为零均通过。该 smoke 在生产 SQL editor 中模拟两个用户上下文,未导出 service-role key,也不是密码登录 REST token 会话。旧 `trades` 未清理也不双写。
- `v10.7.9.297` 上线前本地验证: 波段定向 56/56、完整测试 201/201、build、5/5 frontend smoke、moderate audit、docs consistency 和 diff check 均通过;390x844 与 320x568 真实页面/弹框无横向溢出,console error 0。收口时当前机器到 Vercel 的 TLS 握手连续重置,远端探针得到 HTTP `000`;沿用本轮 SQL 后已完成的 17/17 RLS 与 quote/earnings `401` 作为历史证据,但不能把本次失败重跑写成新通过。
- 最新已上线补充: `v10.7.9.296` 已修复 `v10.7.9.295` 把波段每股报价错误换算为 CNY 的问题,production runtime commit `121016fadf1b9b4bd010527e6b8a82a73bae71a0`;买入均价、卖出均价、当前价和交易单价固定 USD,只有浮盈、总盈亏和成交总金额跟随首页 USD/CNY。波段存储/计算及其他模块不变。
- 上一条已上线补充: `v10.7.9.295` 已修复波段记录汇总金额未跟随首页的问题,production runtime commit `8468442cb235b3e0ce33d08f456e6a88c6af6a23`;波段浮盈、总盈亏和成交总金额共用首页 USD/CNY 及汇率,波段录入/存储/计算仍为 USD。
- 上一条已上线补充: `v10.7.9.294` 目标页年度卡片配色和摘要布局优化已上线,production runtime commit `ce2ddb444e3144ad264bb9ebbc1dee8929410493`;个人箴言改为灰色斜体,当前年摘要上移到与年份状态行同高并补齐目标/实现/落后三行,目标与路径使用白/黄中性层级,实现和完成率使用系统红色,落后/未达使用系统绿色。年度计划、实际、差额/复利计算、数据库和安全边界不变。
- 上一条已上线补充: `v10.7.9.293` 年度目标当年计划口径和年度路径标签修正已上线,production runtime commit `874dd1766901dbcbf3671a6fda4b79ddce4e87fd`;当前年卡片右上角目标改为当年计划,落后/超额继续按当年计划与实际差额计算,当前与预测年度路径统一为“年初起点/当前/终点”。投资计划、年度实际、复利、北极星总目标、数据库和安全边界不变。
- 上一条已上线补充: `v10.7.9.292` 账户、订单和删除弹窗视觉重构已上线,production runtime commit `3e8b6f1117112ab4f41fbf7128cb3f7cdabd3096`;账户/订单操作统一为设计稿同款深色玻璃卡,订单接入现有股票 Logo 链路,账户支持可选图片 Logo 并以账户类型图标兜底,危险删除改为独立确认面板。账户、订单、删除回调、交易账本、数据库、RLS 和鉴权不变。
- 上一条已上线补充: `v10.7.9.291` 财报日历全模块白色文字降亮已上线,production runtime commit `777275ee90fcf3ecda6fb3f178c4843730a87194`;首页财报卡、弹窗、列表和详情里的白色标题/代码/实际值统一为 70%,预期值 60%,月份与普通日期 65%,并清理会继承成纯白的无效透明度档位;红绿结果和金色状态不变。
- 上一条已上线补充: `v10.7.9.290` 首页股票代码和公司名称继续降亮已上线,production runtime commit `ce9e3c1f04a0608baebf21c33629e871c495384b`;自选/持仓股票代码从 `text-white/80` 降为 `text-white/70`,公司名称从 `text-white/40` 降为 `text-white/35`,股票 Logo、价格、涨跌色、持仓盈亏和数据逻辑不变。
- 上一条已上线补充: `v10.7.9.289` 首页持仓盈亏和自选亮度修复已上线,production runtime commit `42582e03432b71eb4a6893069ed04303c633f0e0`;持仓盈亏金额和收益率取消粗体并分别跟随系统涨跌颜色,持仓盈亏列参考交易页从 `112px` 扩为 `144px`,金额/收益率固定单行显示;自选股票代码和价格统一为当前信号“等待中”的 `text-white/80`。持仓盈亏计算、交易账本、行情接口、收益快照、数据库、RLS 和鉴权不变。
- 上一条已上线补充: `v10.7.9.288` 首页财报和股票文字层级降亮已上线,production runtime commit `c3fe394abe7f8ec10f7e14eb535b2fda9377cba9`;财报日历标题/代码、自选/持仓当前标签和股票代码统一参考当前信号“等待中”的 `text-white/80`,“名称”表头与价格/涨跌幅统一为 `text-white/40`,股票代码取消粗体。行情数据、涨跌色、排序、API、交易账本、收益快照、数据库、RLS 和鉴权不变。
- 上一条已上线补充: `v10.7.9.287` 首页行情超限分批热修已上线,production runtime commit `ca932917d893ce966a05a999d4ead2d415291724`;首页主行情超过 30 个 symbols 时按 `30+余数` 顺序分批并合并结果,修复整批 `400` 导致今日盈亏、指数和交易持仓行情无法显示的问题。后端 30-symbol 上限、`/api/quote` 鉴权、provider、交易账本、财报日历、收益快照、数据库和 RLS 不变。
- 上一条已上线补充: `v10.7.9.286` 首页财报日历智能上移已上线,production runtime commit `aa7fe68429491a170b637889ea4c95cd8670e3c3`;未来 15 天内自选与持仓合计至少 5 家公司有待公布财报,且至少 1 家属于当前持仓时,同一张财报日历卡片上移到自选/持仓模块上方;其余情况保持首页底部。独立 `/api/earnings-calendar`、`/api/quote`、交易账本、收益快照、RLS 和数据库不变。
- 上一条已上线补充: `v10.7.9.285` 热门股票弹窗实时行情已上线,production runtime commit `a0832b369a657ca95029da78c727acabbdff36ef`;本轮把添加自选股票弹窗里的热门列表扩展为 30 个常用美股/ETF 候选池,且严格只在 `showAddStock && isWatchlistTab` 时通过现有已登录 `/api/quote` fresh 请求拉取候选股实时价格和涨跌幅,首页默认渲染不请求这批候选股。交易账本、收益快照写入逻辑、首页默认行情加载、行情接口鉴权、财报日历、RLS、独立 `/api/earnings-calendar` 鉴权和 `/api/quote` 鉴权不变。
- 上一条补充: `v10.7.9.284` 自选添加股票校验已随 `v10.7.9.285` 同一 runtime commit 上线;添加自选股票前必须先通过现有已登录 `/api/quote` 校验美股代码存在且返回有效股票价格,非美股代码、特殊行情符号、接口报错或 EODHD 未返回有效股票价格时不写入自选。
- 上一轮已上线补充: `v10.7.9.283` 个股详情持仓时间已上线,production runtime commit `d0b63f8f8b3c622b9c84b63b9964a307d442efc3`;本轮在个股详情累计盈亏卡新增“持仓天数”和“首次建仓”,按当前这一轮持仓的首次买入日到最新收盘快照日 inclusive 计算,清仓后重新买入会重新计时。
- 上一轮已上线补充: `v10.7.9.282` 收益报表浮层颜色和页面文案调整已上线,production runtime commit `8674e9212cde3303d0551de2a40079fa2df61c47`;本轮修复收益报表“收益率走势”对比浮层里“我的”当日/累计收益率固定显示红色的问题,现在和“纳斯达克”行一样跟随系统涨跌颜色设置;收益报表标题下方副标题改为 `Quote Data testing`;页面底部“生成收盘快照”入口暂时隐藏,但底层生成逻辑保留方便后续测试。
- 最新流程补充: 开发验证仍按 `ui-fast/runtime/docs-only/sensitive` 四档风险流程执行。纯视觉及只改变界面呈现的轻量交互(展开/收起、页签、弹窗开关、焦点、滚动、键盘可见性和展示状态)走 UI-fast,不默认跑完整测试;业务逻辑/计算、持久化、保存删除等业务交互、跨模块状态、API、鉴权/RLS、安全、账本/收益/快照/换算、路由/PWA 生命周期和依赖/构建/CI/环境配置才走完整 runtime。所有前端视觉、交互、键盘、滚动、安全区和 PWA 验收必须使用本机 Xcode iOS Simulator;禁止桌面浏览器、Codex 内置浏览器、响应式视口和 `verify:frontend-smoke` 作为视觉通过证据。自动化测试、build、docs 和安全检查继续作为代码门禁。
- 当前 GitHub `main`: 数据库源提交为 `0f52700761beab0d4488e067ca9e968aea9a9bc1`;最新已上线运行时代码提交为 `8f23a471be3cd63b657bf1f7a807c438881a23ea`。ET gate/rebaseline 的生产 SQL 与 runtime 均已部署并通过门禁。
- 当前生产运行时基准提交: `8f23a471be3cd63b657bf1f7a807c438881a23ea`。
- 当前本地和生产设置页版本均为 `v10.7.9.331`。
- 当前生产地址: `https://boduan-tracker.vercel.app`。
- 最近已验证 docs-only 部署: `npm run verify:deploy-status -- a54df76` pass;GitHub Actions run `29199119074` success,Vercel status success,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/Dp55pVfvjaKTQzw855Br2gC7Ybsd`;production 入口保持 `/assets/index-DN2-ymxd.js`。
- 最新运行时部署: `npm run verify:deploy-status -- 8f23a471be3cd63b657bf1f7a807c438881a23ea` pass;GitHub Actions run `29321470173` success,Vercel status success,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/CkNECvKe9N3WGSLokcaWFdYkUxvg`;production alias 已更新,backend-only 修复后入口仍为 `/assets/index-DrckgGpM.js`。
- 最近交接文档刷新部署: `0aa87dfe72b3690bedb4c5425016c699f607cb01` 已通过 GitHub Actions run `29161798255` 和 Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/G9h6ueyaBhcPdNKUY4xTuPwEyzFL`;生产入口保持 `/assets/index-CD6hu3eq.js`,运行时代码仍为 `bf48e5a` / `v10.7.9.303`。
- 线上关键验证: 当前生产未登录 quote、market-movers、earnings、pnl-benchmark、competition GET/POST、competition snapshot GET 和 P&L snapshot GET 均为 `401`;生产入口仍为 `index-DrckgGpM.js`。`2026-07-13` 的上一 runtime 历史快照聚合为个人 12 users / 12 portfolio rows、54 symbol rows / 18 symbols;比赛 8 users / 8 locked rows,active 9、eligible 9、initialized 8、invalid 0,另 1 名尚未排名成员 `eligible_ledger_hash_mismatch`。新 revision/CAS SQL、metadata、RLS、并发 smoke 和 ET-gated runtime 已有生产证据;真实 D1/D2 尚待收盘观察。
- 当前产品焦点: 英文模式已分阶段覆盖设置页、底部导航、首页、交易页、资产页和目标页。`v10.7.9.176` 起股票涨跌幅按现价和昨收重算;`v10.7.9.177` 到 `v10.7.9.207` 主要处理股票 realtime、iOS 主屏 snapshot、BTC/指数拆分和卡位稳定;`v10.7.9.208` 到 `v10.7.9.211` 主要处理三大指数去 Yahoo 图源、固定卡位和分时曲线锁定;`v10.7.9.212` 到 `v10.7.9.228` 建立收益报表独立页、真实快照读取、手动收盘快照回填、收益日历和周期统计;`v10.7.9.229` 起新增全账户自动收盘快照;`v10.7.9.230` 到 `v10.7.9.248` 主要处理只读个股收益详情页、收益线交互、持仓周期卖出收益口径、历史脏 ticker 修复和个股风险指标;`v10.7.9.249` 起首页底部财报日历改为独立 EODHD endpoint,并删除旧 NASDAQ calendar/`CALENDAR:` 混用链路;`v10.7.9.250` 起首页财报日历视觉压缩为固定一行并同步标题/日期层级;`v10.7.9.251` 起财报预计营收正确兼容 EODHD trends 嵌套数组;`v10.7.9.255` 起已公布财报使用券商式同比对比口径;`v10.7.9.256-259` 已上线列表视图收紧、上一财季回看、请求缓存和首页细节降重;`v10.7.9.260-268` 已上线财报日期选择修复、持仓收益试算和价格位置条修复;`v10.7.9.269` 已上线交易页持仓表格行对齐;`v10.7.9.270` 已上线财报列表过滤和持仓列距微调;`v10.7.9.271` 已上线持仓当日盈亏列距优化;`v10.7.9.272` 已上线持仓列距再平衡;`v10.7.9.273` 已上线持仓列宽恢复 v230 口径;`v10.7.9.274` 已上线财报日历弹窗固定高度和选中日期列表独立滚动;`v10.7.9.275` 已上线首页当前信号和 VIX 数值装饰圆点降噪;`v10.7.9.276` 已上线启动黑色背景兜底;`v10.7.9.277` 已上线 iOS 主屏启动黑底图;`v10.7.9.278` 已上线首页当前信号文字降重;`v10.7.9.279` 已上线首页股票文字继续降重;`v10.7.9.280` 已上线个股收益峰值呼吸点;`v10.7.9.281` 已上线收益报表对比浮层;`v10.7.9.282` 已上线收益报表浮层颜色和页面文案调整;`v10.7.9.283` 已上线个股详情持仓时间;`v10.7.9.284` 已上线自选添加股票校验;`v10.7.9.285` 已上线热门股票弹窗实时行情。用户自写内容、中文显示、主交易账本、摊薄工具、行情鉴权和 `/api/quote` 鉴权保持不变。
- 下一位同事第一步: 按第 13 节命令同步 `main`,确认工作区干净,再读第 14 节可转发交接块。

## 1. 当前状态

- 仓库: `chenshuai1190-dotcom/boduan-tracker`
- 生产地址: `https://boduan-tracker.vercel.app`
- 当前本地候选设置页版本为 `v10.7.9.332`,生产仍为 `v10.7.9.331`。v332 优化收益比赛快照读取和头部布局;v331 将分享卡三组金额/收益率同行紧凑化,v330 精简主动投资价值分享卡提示和复制入口,v329 修复收益图表连续滑动、浮层关闭与分享卡灰边。
- 当前 GitHub source 基准提交: 以本文件所在最新交接证据提交为准,接手后执行 `git log -1 --oneline`;当前已验证生产运行时代码提交为 `8f23a471be3cd63b657bf1f7a807c438881a23ea`。
- 当前生产运行时基准提交: `8f23a471be3cd63b657bf1f7a807c438881a23ea`。
- 最近已部署应用代码提交: `8f23a471be3cd63b657bf1f7a807c438881a23ea` 包含 ET gate、revision CAS 与比赛 forward-only rebaseline;上一 runtime `9e1c840e0b336a0352b79f691b7ce3a3b252ff98` 包含收盘快照失败重试与连续补漏;上一前端 runtime `ba3397265b8a074a59886b4ec9ca03349525f826` 包含 `v10.7.9.331` 主动投资价值结果行紧凑化。
- 最近文档/配置记录提交: 本文件所在最新提交;最近已验证交接刷新部署为 `a48c4ad64ea2870ff989f6313b13fbb3a3873170`,流程工具链运行提交为 `c47b6e0b78115ea0e004c8cc5b498a2505527fc4`。
- 当前本地候选/生产设置页版本: `v10.7.9.332` / `v10.7.9.331`。
- Vercel 最新部署: runtime commit `8f23a471be3cd63b657bf1f7a807c438881a23ea` 已 success,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/CkNECvKe9N3WGSLokcaWFdYkUxvg`,production 入口仍为 `/assets/index-DrckgGpM.js`;GitHub Actions run `29321470173` success。设置页继续为 `v10.7.9.331`,未登录 API 边界已复测。
- Sensitive 发布顺序已完成:数据库源提交、生产 `supabase/community_competition_rebaseline_20260714.sql`、revision 表/权威时间/四个 triggers、两个 CAS RPC、grants、数据库并发、21 tables + 2 RPCs RLS gate、runtime Actions/Vercel 和未登录 401 均有真实证据。仅 scheduled D1 聚合与后续 D2 必须等真实收盘观察,不得预填。
- 最近交接文档刷新部署: `a48c4ad64ea2870ff989f6313b13fbb3a3873170` 已通过 GitHub Actions run `29142090108` 和 Vercel 部署验证;本文件所在更新只回填交接证据,不改生产运行时。
- Vercel 部署记录: `v10.7.9.178` runtime code commit `2a4b2c15cf9e3a1e875d9c64c74adabd224f9c6b`;GitHub Actions `CI` run `28801658061` success;first Vercel statuses for `2a4b2c1` / `9c917d3` hit `Deployment rate limited — retry in 24 hours`;deployment retry commit `7e84d3508297e54a7f24b161def867375a617bc0` succeeded,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/2fh9MaHR7jc5N8ymasTcvZwWE5Cq`。`v10.7.9.179` runtime code commit `a2a93fe1dca6bb304986bb15f28538bb0fcba3dc`;first Vercel statuses for `a2a93fe` / `411f18d` hit `Deployment rate limited — retry in 24 hours`;SSH deployment retry commit `297fb19adfd76caacaa74cee1b42cbcac3280631` succeeded,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/BWGowMjDe8uDDhWhwKab6oPPWD7Z`;production alias `https://boduan-tracker.vercel.app` updated;active runtime assets and marker verified。`v10.7.9.180` runtime code commit `b178c7b1cfcf056d846ee4e2162e33ace430779f` pushed via project SSH key;Vercel status success,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/Epr2ayQrSEvicPoXWtCJFUsLqYv7`;production alias updated;active runtime assets and marker verified。`v10.7.9.181` runtime code commit `469edfbfc7b37e4a2166b000bcf1ab8c080baa5f` pushed via project SSH key;first Vercel status hit `Deployment rate limited — retry in 24 hours`;deployment retry commit `f80213406655a176a2181252ed1cf48934bf2631` also hit the same rate limit。`v10.7.9.182` runtime code commit `abcb44245160d01b75b260dec3b3abc7fd9ac5b5` pushed via project SSH key;Vercel status success,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/J9WkYdJUMRsvXEe4VpUqigMKP6HU`;production alias updated;active runtime assets and marker verified,并包含 `v10.7.9.181` 的输入框去白框改动。`v10.7.9.183` runtime code commit `98031831c1286d8960fdd7fb85f5ee20bf3ea499` pushed via project SSH key;first Vercel status returned `failure`: `Deployment rate limited — retry in 24 hours.`;deployment retry/status commit `3df9376d8fc74371663e0b74f7163af6a9e7cd90` 也返回同样 failure;final deployment/docs commit `6997b27a7a17f10cc0be57f27b7f9c2c4348cdaf` succeeded,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/GxexnfqpDEgPd5zcnKMTGsZHp51g`,production alias and markers verified。
- 最新补充部署记录: `v10.7.9.303` runtime code commit `bf48e5accd79c55e40e1d578e5618dd1eced0ad8` pushed via project SSH key;GitHub Actions `CI` run `29161655826` success;Vercel status success,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/6DCsp5jvNsubXhoKnZFybTM8gpf6`;production alias updated,入口 `/assets/index-CD6hu3eq.js`。首个 `a363e64` deployment `gn2MbDpda3pGTLvrZuT4QXyCT1qc` 仅因 Hobby 13 functions 超过 12 上限失败且未切换生产;`bf48e5a` 通过 rewrite 保留独立 Cron URL 与鉴权边界。上一条 v301 runtime 为 `4bfab846ab6d7b87ea9ce41af26e80aeeed3b6ad`;更早部署历史见 `docs/development-log.md`。
- Supabase 项目 ref: `ykgotnmtqcqdzqtrlayq`
- `community_profiles` 状态: 2026-07-12 已通过 Supabase SQL Editor 执行 `supabase/community_profiles.sql`、completion/policy 变更、`community_avatar_options_v312.sql` 和 `registration_community_profile_v315.sql`;头像约束只读回查确认 18 key 完整且 `invalid_rows=0`。v315 metadata 回读确认 `service_role SELECT/INSERT=true`,`anon INSERT=false`,`authenticated INSERT=true`,`relrowsecurity=true`,三条 authenticated 本人 SELECT/INSERT/UPDATE 策略完整保留。最新 `npm run verify:rls:rest` 20/20 pass,匿名 `community_profiles` 返回 `401`。排行榜跨用户昵称/头像只由比赛 API 汇总。
- `community_competition` 生产状态: database source `0f52700761beab0d4488e067ca9e968aea9a9bc1` 已通过 Actions `29320513471` 和 Vercel `72A9KA9cLzwG4t3rfZVkndz7YRoF`;其精确迁移已在 production 执行成功。回读确认 `stock_trade_ledger_revisions`、数据库权威时间/revision/member/snapshot 四个 triggers、service-only join/rebaseline RPCs、旧 overload 删除、grants、FORCE RLS 和 revision→membership 锁序全部为预期;匿名门禁通过 21 tables + 2 RPCs,真实双会话锁序 smoke 两边 rollback/true。Runtime `8f23a471be3cd63b657bf1f7a807c438881a23ea` 已上线,D1/D2 尚待真实收盘观察。
- `swing_waves` 生产状态: 2026-07-11 已从 `postgres` role 执行仓库独立 transaction;执行前表不存在,执行后 13/13 metadata 项为 `true`。SQL 后 `verify:rls:rest` 17/17 pass;随后两个真实 Auth 用户的 authenticated role/JWT subject CRUD/RLS smoke 14/14 pass,双方只见本人数据、跨用户读写删均为 0、owner 生命周期与 1.5 碎股均通过,独立清理查询为 `no_smoke_rows=true`。真实 V2 独立页面已随 `v10.7.9.297` 上线。
- 交接文档刷新提交: 本文件所在最新提交,接手后以 `git log -1 --oneline` 为准。

产品现在可用。当前重点是把行情、收益报表、个股详情和首页市场模块继续拆成清晰边界。`v10.7.9.249` 已把首页底部财报日历从旧 quote provider/NASDAQ calendar 混用逻辑中拆出,改为独立 EODHD serverless endpoint;`v10.7.9.250` 已把首页财报日历预览压缩为固定一行并同步标题/日期层级;`v10.7.9.251` 已修复 EODHD trends 嵌套数组导致预计营收无法合并的问题;`v10.7.9.255` 已把已公布财报改为券商式同比对比口径;`v10.7.9.256-259` 已上线列表视图收紧、上一财季回看、请求缓存和首页细节降重;`v10.7.9.260-268` 已上线财报日期选择、持仓收益试算和价格位置条修复;`v10.7.9.269` 已上线交易页持仓表格行对齐;`v10.7.9.270` 已上线财报列表过滤和持仓列距微调;`v10.7.9.271` 已上线持仓当日盈亏列距优化;`v10.7.9.272` 已上线持仓列距再平衡;`v10.7.9.273` 已上线持仓列宽恢复 v230 口径;`v10.7.9.274` 已上线财报日历弹窗固定高度和选中日期列表独立滚动;`v10.7.9.275` 已上线首页当前信号和 VIX 数值装饰圆点降噪;`v10.7.9.276` 已上线启动黑色背景兜底;`v10.7.9.277` 已上线 iOS 主屏启动黑底图;`v10.7.9.278` 已上线首页当前信号文字降重;`v10.7.9.279` 已上线首页股票文字继续降重;`v10.7.9.280` 已上线个股收益峰值呼吸点;`v10.7.9.281` 已上线收益报表对比浮层;`v10.7.9.282` 已上线收益报表浮层颜色和页面文案调整;`v10.7.9.283` 已上线个股详情持仓时间;`v10.7.9.284` 已上线自选添加股票校验;`v10.7.9.285` 已上线热门股票弹窗实时行情。中文默认显示、用户自写内容和核心交易/行情/数据库边界保持不变。

本机已建立稳定的本地测试环境路径:`~/.config/boduan-tracker/local.env` 保存公开 Supabase/本地 quote 配置,`~/.config/boduan-tracker/eodhd.env` 保存 EODHD key,权限均为 `600`,不跟随每个 Codex 工作区。首次接手、新工作区、换机或环境异常时跑 `npm run verify:workspace-state`;只有需要真实登录、Supabase、EODHD 或 API smoke 时才跑 `npm run verify:local-env`。纯 UI 改动不重复检查本地密钥环境。缺 `.env.local` 且任务确实需要时再跑 `npm run bootstrap:local-env`;需要 Vercel link 时跑 `npm run bootstrap:vercel-link`。不提交、打印或复制 key 值;只报告 present/missing。

## 2. 先读这些文档

按顺序读:

1. `docs/handoff.md`
2. `README.md`
3. `docs/development-process.md`
4. `docs/development-log.md`
5. `docs/security-hardening.md`
6. `docs/architecture-security-audit.md`

最重要规则: GitHub `main` 是唯一代码源头。不要直接改 Vercel、浏览器控制台、临时服务器文件。Supabase/Vercel 后台只允许做环境变量、Auth URL、数据库策略这类配置,并且必须写入 `docs/development-log.md`。

## 3. 产品概览

`boduan-tracker` 是移动端优先的投资追踪 PWA,当前品牌显示为 Quote。核心使用场景:

- 首页账户看板: 总资产、今日盈亏、累计盈亏、当前信号、市场指标、VIX/CNN 恐慌指标。`v10.7.9.116` 起首页总资产主数字使用大整数 + 小号两位小数显示;`v10.7.9.129` 起 VIX 标题同步 CNN 灰色标题层级,VIX/CNN 主数字和 CNN 状态文字取消过粗字重;`v10.7.9.130` 起 VIX/CNN 恐慌指标重做为全宽高保真 SVG 金融卡片;`v10.7.9.141` 起三大指数不再显示重复连接态,只有 BTC 卡显示实时状态;`v10.7.9.156` 起首页系统文案支持英文模式,英文模式下股票主副标题都显示 ticker 缩写。
- 自选股票: 用户主动添加的 watchlist,新用户默认空,支持添加、编辑、置顶、排序、删除;英文模式仅翻译系统文案,不自动翻译用户输入内容。
- 持仓视图: 来自交易主账本的真实持仓,不是自选列表。
- 交易页: 手动买入/卖出主账本,派生当前持仓、有效成本、浮动盈亏、累计收益率。`v10.7.9.116` 起交易页总资产主数字同步大整数 + 小号两位小数显示;`v10.7.9.141` 起持仓股票 tick 写入 `quoteCache`,交易页头部和持仓列表通过 `investmentSummary` 秒级刷新;`v10.7.9.142` 起摊薄工具和波段记录的工具-only symbol 也进入 `quoteRows`,现价通过同一股票 WebSocket/REST 行情口径刷新,但仍不写入正式主账本;`v10.7.9.157` 起股票实时 tick 只有价格时也会沿用 REST/基础行情昨收计算当日盈亏,并避免手动/下拉刷新用延迟 REST 价覆盖更新鲜实时价;`v10.7.9.158` 起盘前/盘后低频成交股票的实时价保护窗口放宽到 30 分钟,避免 NOK 这类股票被 REST 常规盘价反复冲回;`v10.7.9.167` 起持仓列表单只股票市值显示两位小数,和当日盈亏、持仓盈亏保持一致。
- 资产/分析页: 深色家庭总资产卡、12 个月走势、我/老婆账户分组、月度余额填报和新增账户。`v10.7.9.116` 起家庭总资产主数字改为完整金额 + 小号两位小数,其它走势图和账户列表仍保留 `万` 简写;`v10.7.9.148` 起资产页家庭总资产头卡尺寸、外壳、金额颜色和金额位置与首页/交易页头卡对齐;`v10.7.9.149` 起账户行不再保留老版模块级缩放。
- 目标页: 北极星目标、年度目标进度、复盘和投资心得。`v10.7.9.111` 起目标页第一阶段统一深色移动端风格,北极星目标支持 USD/RMB 切换并使用现有汇率状态,年度目标和投资戒律都改为点击记录后弹出操作面板,投资戒律保留置顶/取消置顶;`v10.7.9.112` 修正目标页视觉对齐,头部卡片压回移动端紧凑高度,年度进度条微光限制在进度条内,年度目标区域删除多余外层卡片,当前年补回右侧目标/落后信息,未开始年度补回起点、目标、增长目标虚线和两端金额结构;`v10.7.9.113` 目标页金额改为首页同款完整数字和正常字重,头部卡片进一步压缩,USD/RMB 切换同步首页尺寸,头部卡删除右下角半圆和金色边框,年度目标区域继续外扩,涨跌粉色同步首页颜色体系;`v10.7.9.114` 目标页金额取消两位小数,本年卡边框同步北极星头卡弱边框,头卡 `设置` 按钮上移;`v10.7.9.115` 只在北极星头卡大目标金额恢复两位小数,小数后缀用小字号显示,年度目标等其它金额仍保持无小数;`v10.7.9.116` 小数后缀显式保持正常字重;`v10.7.9.117` 目标页不再显示行情失败 toast,北极星提醒文案单独下移,年度年份数字缩小并降为 `font-bold`;`v10.7.9.118` 北极星设置按钮和未开始年度起点/目标/虚线进一步降为中性色,并移除未开始年度起点/目标括号年份;`v10.7.9.119` 删除北极星头卡 RMB 汇率辅助文案,年目标说明和剩余年限说明降到 12px,年度目标标题降到 15px,年度年份字重降到 `font-semibold`;`v10.7.9.120` 投资戒律模块按新图改为独立标题、灰色胶囊按钮、彩色圆点筛选和深色卡片,筛选项在 390px 移动端一行完整显示,置顶/展开/等级选择都降为低色彩;`v10.7.9.121` 投资戒律标题、正文、按钮、筛选、日期、置顶和展开入口整体降一档字号;`v10.7.9.122` 投资戒律标题继续缩小,删除标题下方数量,标题与添加按钮同排居中对齐;`v10.7.9.123` 投资戒律点击后改为记录详情弹窗,正文完整显示,底部只保留三个小号操作按钮;`v10.7.9.124` 复盘日志同步投资戒律标题和深色卡片,日期/情绪放卡片底部同一行,点击先打开 `复盘详情`,年度目标默认只展示 2 年;`v10.7.9.125` 复盘日志列表正文同步投资戒律正文,复盘日期/情绪和戒律日期/置顶同步详情弹窗灰色 meta 效果;`v10.7.9.126` 点击北极星目标卡片可打开复利明细弹窗,复用当前本金/年化/年限/目标完成度逻辑,展示目标终值、累计收益、复利倍数、实际进度、账户曲线和每年收益表;`v10.7.9.127` 复利明细弹窗加宽、改弱金色边框、完整显示十年年份并将收益统一为首页粉色;`v10.7.9.128` 复利明细内部统计卡、实际进度、曲线和每年收益表边框/分割线降为暗线,标签统一降为灰色;`v10.7.9.166` 起目标页系统文案支持英文模式,用户自己写的戒律、复盘、目标箴言和心情保持原文;`v10.7.9.172` 起目标页当前系统显示名改为“投资心得” / `Investment Notes`,底层 `disciplines` 数据和用户自写内容不迁移。
- 设置页: 本地待确认 `v10.7.9.314` 只给头部头像增加独立外框并从 79px 放大到 95px;生产仍为 `v10.7.9.313`,头像选择器与收益比赛展示不变。v311 多账户切换、语言、显示、改密、社区资料和管理员邀请码逻辑继续保留。
- PWA: 支持保存到手机桌面,当前图标为用户提供的蓝绿 K 线箭头 Logo;`v10.7.9.147` 起 512/192/180/32/16 五套最终发布 PNG 均为 RGB 不透明深色底,避免 iOS 主屏把透明区域垫成白边。

## 4. 技术栈

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Functions
- `/api/quote`: 已登录行情代理
- `/api/fx`: 已登录汇率接口
- `/api/btc-realtime`: 已登录 BTC WebSocket relay
- `/api/indices-realtime`: 已登录三大指数 WebSocket relay
- `/api/stocks-realtime`: 已登录用户股票 WebSocket relay,覆盖自选、正式持仓、波段记录和摊薄工具 quote rows;`v10.7.9.192` 起服务端同时连接 EODHD `/ws/us` 成交流和 `/ws/us-quote` 盘口流,成交价为主、盘口中间价为盘前兜底;`v10.7.9.193` 起前端股票 WebSocket 8 秒无首个 `stock_tick` 或无任何 live/tick activity 时主动重建连接
- 市场数据: EODHD 核心 quote / realtime, EODHD 财报日历, Yahoo chart visuals, CNN Fear & Greed
- 测试: Node built-in test runner,命令为 `npm test`

本机工具链路径:

```bash
PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
```

工具链基线:

```bash
npm run verify:toolchain
```
## 5. 环境变量和安全边界

前端公开变量:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

服务端私密变量:

- `EODHD_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (仅服务端,用于邀请码和全账户收益报表快照)
- `CRON_SECRET` (仅服务端,用于保护 Vercel Cron 自动快照入口)
- `QUOTE_API_AUTH_REQUIRED=true`
- `QUOTE_ALLOWED_ORIGINS=https://boduan-tracker.vercel.app`

禁止事项:

- 不要提交 token、`.env`、Supabase service role key。
- 不要添加 `VITE_EODHD_TOKEN`。
- 不要让浏览器直连 EODHD WebSocket。
- 不要关闭 `/api/quote` 鉴权。
- 不要把 Supabase anon key 当 service role 用。
- 不要绕过 Supabase session 校验。

当前安全基线:

- `/api/quote?symbols=VIX` 未登录必须返回 `401`。
- `/api/fx` 未登录必须返回 `401`。
- `/api/btc-realtime` 普通 HTTP 请求返回 `426`,WebSocket upgrade 未登录返回拒绝。
- 上一轮生产 `npm run verify:rls:rest` 的 20/20 结果仅为历史证据。本轮迁移后已重新执行并通过 21 张表 + 2 个匿名 RPC 拒绝探针;`stock_trade_ledger_revisions`、`swing_waves`、`community_profiles`、`community_competition_members`、`community_competition_snapshots` 与两个 service-only RPC 均返回 `401`,其余用户表为 `200` 且 `visibleRows=0`。
- RLS REST 探针不等于 metadata 级 RLS 审计;`swing_waves` 已通过 SQL/admin 13/13 metadata 核验,比赛表 metadata 结果因 Dashboard 翻译插件崩溃尚未稳定读取,其余用户表仍需继续完成全量复核。

## 6. 开发和部署流程

首次接手、新工作区或环境异常时:

```bash
PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
npm run verify:toolchain
npm ci
```

每次改动先判定 workflow tier,再选择验证强度。纯 UI 不再归入全量 runtime:

1. `ui-fast`: 纯文字、颜色、图标、字号/字重、边框、间距、固定宽高、对齐、已确认原型等价接入,以及仅影响当前界面呈现的展开/收起、页签、弹窗开关、焦点、按压态、局部滚动、键盘可见性、安全区和 loading/空状态/错误状态展示。允许组件内临时展示状态,但不得改持久化、全局/跨模块状态、业务计算、数据源、API、数据库、RLS、鉴权、账本或保存/删除/提交等业务回调语义。只需跑:

   ```bash
   <相关定向测试;没有时记录原因>
   npm run build
   git diff --check
   ```

   不默认跑全量 `npm test`、frontend smoke、audit 或重复环境检查。用户已确认原型时不重复出同一张图;用户说“先本地”时不推送,说“部署”时快速验证 pass 后直接上线并跑 `verify:deploy-status`。

2. `runtime`: 业务逻辑/计算/判断,保存、删除、提交、确认、同步、导入或导出等改变业务结果的交互,持久化/数据库读写,全局/跨模块状态,API/provider,鉴权/RLS/安全,交易账本/持仓/收益/快照/币种换算,路由结果,PWA 生命周期/回前台刷新/service worker,依赖/build/CI/环境配置,或会改变多个模块数据与业务行为的共享组件改动。必须跑:

   ```bash
   npm run verify:toolchain
   npm test
   npm run build
   npm audit --audit-level=high
   git diff --check
   ```

3. `docs-only`: 只修改 `docs/` 中的交接、流程、日志或部署证据,且不改变源码、依赖、测试、配置、环境变量、PWA 资源或 CI/Vercel 行为。可跳过 `npm test` / `npm run build` / `npm audit`,但必须跑:

   ```bash
   npm run verify:docs-consistency
   git diff --check
   git diff --stat
   ```

   `npm run verify:docs-consistency` 只检查当前状态区、最近日志条目、可转发交接块和设置页版本/更新日志,输出 PASS/FAIL 摘要。不要对整份长日志做无边界 `rg -n` 并输出大量历史命中。
   如果 docs-only 是部署证据回填,再跑 `npm run verify:deploy-status -- <commit>`。

4. `sensitive`: 涉及 auth、RLS、Supabase 策略、`/api/quote`、`/api/earnings-calendar`、`/api/community-competition`、行情 relay、交易主账本、收益快照、全账户/比赛 cron、付费行情 token、环境变量或安全边界。先完整执行 `runtime` 验证,再按影响面补充:

   ```bash
   npm run verify:rls:rest
   curl -i 'https://boduan-tracker.vercel.app/api/quote?symbols=VIX'
   curl -i 'https://boduan-tracker.vercel.app/api/earnings-calendar?symbols=NVDA'
   curl -i 'https://boduan-tracker.vercel.app/api/community-competition?period=day'
   curl -i 'https://boduan-tracker.vercel.app/api/community-competition-daily-snapshot'
   ```

   敏感改动不能降级到 `ui-fast` 或 `docs-only`;如果判断不确定,按 `sensitive` 处理。

默认收尾:

1. 更新 `docs/development-log.md`。
2. 在日志里写明 workflow tier、已跑验证和未跑全量验证的原因。
3. 未确认原型不升版本;准备发布的用户可见更新才同步设置页更新日志和版本。
4. UI 任务只在用户明确说部署/上线后提交并推送 GitHub `main`。
5. 等 Vercel 自动部署成功。
6. 按 workflow tier 做线上验证;默认先跑 `npm run verify:deploy-status -- <commit>`,docs-only 只需确认 Vercel success、生产入口未异常切换和必要 marker/API smoke。
7. 把部署和线上验证写回 `docs/development-log.md` 或最终交接摘要。

推送注意:

- 本仓库所有推送、部署重试、`fetch`、`ls-remote` 和刷新 `origin/main` 的远端 Git 操作,默认都必须显式使用项目 SSH key `~/.ssh/boduan_tracker_github` 和 `git@github.com:chenshuai1190-dotcom/boduan-tracker.git`;不要把 HTTPS `origin` 当作省事路径。
- 如果 `git push origin main` 走 HTTPS 时报 `could not read Username for 'https://github.com': Device not configured`,或远端检查漏带 SSH key 后出现 `Permission denied (publickey)`,先判定为命令未按本仓库 SSH 准则执行,不要误判为仓库无权限。
- 标准推送命令: `GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" git push git@github.com:chenshuai1190-dotcom/boduan-tracker.git main`。
- 如果 Vercel 对运行时代码提交返回 `Deployment rate limited — retry in 24 hours`,不能停在“已推送但未上线”;记录真实状态后,创建明确的部署重试提交,继续用上述 SSH 命令推送并轮询到 Vercel `success` 或确认真实阻塞。

### 本地调试提效细节

本轮资产模块验证确认:先本地看 UI 比直接部署更快,尤其适合字号、间距、弹窗、按钮显色这类视觉问题。

推荐流程:

```bash
PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
npm run dev -- --host 127.0.0.1
```

然后打开 `http://127.0.0.1:5173/`,用 390×844 左右的手机视口检查。检查完成后停止 dev server。

关键点:

- `src/AuthGate.jsx` 在 `import.meta.env.DEV` 且本地缺少 Supabase 配置时,会渲染 `src/DevVisualPreview.jsx`,不会卡在 `Supabase 配置缺失` 页面。
- `DevVisualPreview` 是只读本地视觉 fixture,提供首页行情/恐慌指标、固定账户、月度快照、当日 MSFT 买入订单、进行中/已完成 NVDA 波段、目标页年度数据、投资心得、复盘日志和社区比赛注入状态。首页可打开 `http://127.0.0.1:5173/?tab=home`,交易页可打开 `http://127.0.0.1:5173/?tab=trades`,资产页可打开 `http://127.0.0.1:5173/?tab=analysis`,目标页可打开 `http://127.0.0.1:5173/?tab=review`;社区比赛可用 `?devPreview=1&preview=community-competition&competitionState=profile|join|waiting|ready` 分别检查资料门槛、自愿加入、等待快照和真实榜单 DTO 展示。该 fixture 不连接生产数据,不能作为真实收益来源;`v10.7.9.295` 的波段 USD/CNY 展示可在交易预览中切换复核。
- 账户图片 Logo 不是必填项;招商银行等没有可用图片时直接显示账户类型默认图标,不要为补品牌图标阻塞功能或引入不明来源资源。订单股票 Logo 继续走现有 `StockLogo` 缓存和 EODHD/Finnhub 候选链路,失败时显示股票代码兜底。
- 这个预览不连接真实 Supabase,不提交 `.env`,不修改生产数据;不要把它当真实数据来源。
- 涉及真实登录、真实账户数据、行情、RLS、鉴权或部署后的缓存切换时,仍必须用生产地址和线上 marker/API 验证。
- UI 任务建议先用本地预览收敛 80% 视觉问题,再跑 `npm test` / `npm run build` / `npm audit` / `git diff --check`,最后部署验证。这样能明显减少“部署后才发现字号或弹窗不对”的往返时间。

## 7. 当前线上验证证据

最近完整验证记录:

- `v10.7.9.296` runtime commit `121016fadf1b9b4bd010527e6b8a82a73bae71a0` 已完成部署和线上验证;定向测试 42/42、完整测试 187/187、build、frontend smoke、audit、docs consistency 和 diff check 均 pass;390x844 CNY 预览确认单价保持 USD、汇总金额显示 CNY,`scrollWidth=390`,console error 0。GitHub Actions run `29146470542` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/E8Ncr2w58Z1WMh2AgoxVfANs4M1B`,生产入口 `/assets/index-COrRNEPC.js`,关键 chunks 与本地构建 SHA-256 一致,未登录 quote/earnings 均为 `401`。
- `v10.7.9.295` runtime commit `8468442cb235b3e0ce33d08f456e6a88c6af6a23` 已完成部署和线上验证;发布前定向测试 41/41、完整测试 186/186、build、frontend smoke、audit、docs consistency 和 diff check 均 pass;390x844 双币预览 `scrollWidth=390`,console error 0。GitHub Actions run `29146141182` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/BbTxwfByKmhNgtvpmvy61dyYsy4c`,生产入口 `/assets/index-DEPEiYoB.js`,`waveCurrencyDisplay`、`TradesTab`、`App`、`SettingsTab` 和 `settingsChangelog` 等关键 chunks 与本地构建 SHA-256 一致,未登录 quote/earnings 均为 `401`。
- `v10.7.9.294` runtime commit `ce2ddb444e3144ad264bb9ebbc1dee8929410493` 已完成部署和线上验证;发布前 `npm run verify:toolchain`,`npm test` 182/182,`npm run build`,`npm run verify:frontend-smoke`,`npm audit --audit-level=moderate` 和 `git diff --check` 均 pass;390x844 CNY 本地预览 `scrollWidth=390`,摘要与年份顶边误差 0。GitHub Actions run `29145076024` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/JBBnXuAUeWGJDTNSVfVqMzc4sccr`,生产入口 `/assets/index-C71PVvAU.js`,关键 chunks 与本地构建 SHA-256 一致,未登录 quote/earnings 均为 `401`。
- `v10.7.9.292` 运行时代码提交 `3e8b6f1117112ab4f41fbf7128cb3f7cdabd3096` 已完成部署和线上验证;GitHub Actions run `29141643669` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/Gn9Pv3tJK9ztgwwmVNCdstzd4ghL`,生产入口 `/assets/index-DlHnRYc2.js`。
- `v10.7.9.292` 本地验证: `npm run verify:toolchain` pass,定向测试 37/37 pass,`npm test` 182/182 pass,`npm run build` pass,`npm run verify:frontend-smoke` pass,`npm audit --audit-level=moderate` 0 vulnerabilities,`git diff --check` pass。390x844 真实组件复核中账户/订单操作卡均为 314x232,删除确认卡为 314x387;招商银行使用默认银行图标,MSFT 使用现有股票 Logo 链路。
- 最近交接刷新基准 `a48c4ad64ea2870ff989f6313b13fbb3a3873170` 已通过 `npm run verify:deploy-status -- a48c4ad`;GitHub Actions run `29142090108` success,Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/FJ1nENUFJLJV9g57GNDmFMhma8xh`,生产入口仍为 `/assets/index-DlHnRYc2.js`,未登录 quote/earnings 均为 `401`。
- `v10.7.9.275` 首页状态圆点降噪已完成部署和线上验证。当前生产运行时代码提交为 `41e77056d7a62a594830dda44eec8b4d54a51f5e`;生产入口为 `/assets/index-BBbtWDtu.js`;Vercel production status 为 `success`,target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/26426ft19PxD7jgkCzo8i64U72W1`。
- 当前生产 marker: `HomeTab-sFGT_nuR.js` 中当前信号标题小点 `h-3 w-3 shrink-0 rounded-full` absent,VIX 数值小点 `0_0_14px` absent,VIX 风险条定位圆点 present;`SettingsTab-ew7K8Iqh.js` 包含 `v10.7.9.275`;`settingsChangelog-B9AdpNuM.js` 包含 `v10.7.9.275`、`首页状态圆点降噪`、上一版 `v10.7.9.274` 和 `财报日历弹窗高度固定`。
- 旧首页财报日历链路继续从运行时移除:生产运行时未检出旧 `CALENDAR:` 虚拟 symbol 或旧白色事件弹窗的 `selectedEvent` marker。
- 当前鉴权边界:未登录 `GET /api/quote?symbols=VIX` 返回 `401`;未登录 `GET /api/earnings-calendar?symbols=NVDA` 返回 `401`;普通 HTTPS 访问 `/api/stocks-realtime` 预期返回 `426`。
- `v10.7.9.275` 部署前本地检查: `node --test tests/tool-ledger-boundaries.test.js` 通过 35 个测试;`npm test` 通过 173 个测试;`npm run build` 成功;`npm audit --audit-level=moderate` 返回 0 vulnerabilities;`git diff --check` 干净。
- GitHub Actions `CI` run `29030290230` completed with `success`。

以下保留历史验证摘录,用于追溯旧问题;接手时以本节最上面的 `v10.7.9.275` 证据为当前线上基线。

- `v10.7.9.204` iOS 主屏股票秒级刷新已完成部署和线上验证:iOS 主屏股票/指数 snapshot 盘前、盘中和盘后使用 1.25 秒活跃轮询,其它时段 2.5 秒;启动/回前台 burst 前移到 0/0.8/1.6/3/5 秒;BTC 保持独立 WebSocket,不参与股票/指数 snapshot 或 warming。生产入口 `/assets/index-DnB_Z168.js`,runtime chunks include `App-BSWC9NlH.js`,`HomeTab-BzDNIrHi.js`,`TradesTab-DvTLX5c4.js`,`SettingsTab-xej1q5lA.js`,`settingsChangelog-BHgcb57S.js`;marker 验证确认 `v10.7.9.204`,`iOS 主屏股票秒级刷新`,`/api/btc-realtime`,`/api/stocks-realtime`,`/api/indices-realtime`,`America/New_York`,faster burst 和 `stockFreshnessStartedAt` 均存在,且不含 BTC snapshot fetch、BTC warming reset、`v10.7.9.202` 或 `首屏当日盈亏兜底`;`/api/quote?symbols=VIX` 未登录返回 `401`,普通 HTTPS `/api/stocks-realtime` 返回 `426`,三套 snapshot 未登录均返回 `401`。

- `v10.7.9.130` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-Dsv8WFFh.css`,`HomeTab-D9pJyb08.js`,`SettingsTab-D6Cq8s1c.js`,`App-B_ap-HHi.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `HomeTab-D9pJyb08.js` contains `data-home-fear-card`, `VIX 恐慌指数`, `恐慌贪婪指数`, `gradientUnits`, and `SettingsTab-D6Cq8s1c.js` contains `v10.7.9.130` / `首页恐慌指标高保真卡片`;production assets do not contain `DevVisualPreview` or `mockHomeWatchlist`。
- `v10.7.9.130` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=home`,in-app browser viewport `390x844`;VIX/CNN fear cards render full-width `358px`,VIX card height `294px`,CNN card height `344px`,sparkline SVGs `140x40`,document-level horizontal overflow `0`;CNN gauge gradient uses `gradientUnits="userSpaceOnUse"` and displays red/yellow/green arc.
- `v10.7.9.130` deployment: pushed to GitHub `main`;runtime commit `edce5caa4ef15380f2373b3fd078a988ff95b3e4`;latest deployed main commit `b70c5c35f4390f40245f2f9718183c2a6eed55d3`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/dfa7AXhRfKT9WxxtZARpmzMozEUP`。
- Production `GET https://boduan-tracker.vercel.app/?v=b70c5c3-fearcards`: HTTP 200。
- Production entry chunks: `/assets/index-Btu8Bw6D.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-Dsv8WFFh.css`;production runtime chunks include `/assets/App-DsY184f1.js`, `/assets/HomeTab-D9pJyb08.js`, `/assets/SettingsTab-D6Cq8s1c.js`。
- Production marker check: `HomeTab-D9pJyb08.js` contains `data-home-fear-card`, `VIX 恐慌指数`, `恐慌贪婪指数`, and `gradientUnits`;`SettingsTab-D6Cq8s1c.js` contains `v10.7.9.130` and `首页恐慌指标高保真卡片`;production assets do not contain `DevVisualPreview` or `mockHomeWatchlist`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.129` local validation: `npm test` pass,65 tests;`npm ci` pass,0 vulnerabilities;`npm run build` pass (`index-BQhRIRN9.css`,`HomeTab-gGyUoKXz.js`,`SettingsTab-BS6v8Daa.js`,`App-Cz3yQnoI.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass;build/source marker check confirms HomeTab contains `text-[12px] font-normal text-white/60`, `text-2xl font-normal text-emerald-400 tabular-nums`, `text-2xl font-normal tabular-nums`, and `text-sm font-normal`;old VIX amber title and VIX/CNN `font-black` markers are absent;SettingsTab contains `v10.7.9.129` and `首页恐慌指数视觉降重`。
- `v10.7.9.129` deployment: pushed to GitHub `main`;runtime commit `512fc644ef90636e6d266219f4dcfbb46adfa79c`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/AtmC4EMx4t8DWspPuvisNh3GhqGT`。
- Production `GET https://boduan-tracker.vercel.app/?v=512fc64-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-BCEsqBqn.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-BQhRIRN9.css`;production runtime chunks include `/assets/App-C6TkG5yr.js`, `/assets/HomeTab-gGyUoKXz.js`, `/assets/SettingsTab-BS6v8Daa.js`。
- Production marker check: `HomeTab-gGyUoKXz.js` contains `VIX 恐慌指数`, `CNN 恐慌贪婪指数`, `text-[12px] font-normal text-white/60`, `text-2xl font-normal text-emerald-400 tabular-nums`, `text-2xl font-normal tabular-nums`, and `text-sm font-normal`;it does not contain old VIX amber title marker `text-[12px] font-semibold text-amber-300/90`, old VIX numeric marker `text-2xl font-black text-emerald-400 tabular-nums`, old CNN numeric marker `text-2xl font-black tabular-nums`, or old CNN label marker `text-sm font-black`;`SettingsTab-BS6v8Daa.js` contains `v10.7.9.129` and `首页恐慌指数视觉降重`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.128` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-B21CJLxn.css`,`ReviewTab-DvF47Fsk.js`,`SettingsTab-DRKSQz2w.js`,`App-B6-vRVoS.js`);`npm audit --audit-level=moderate` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `data-compound-detail`, wider scroll modal marker `w-[calc(100vw-16px)] max-w-[386px] overflow-y-auto overscroll-contain`, outer weak gold border marker `border-[#f6b54b]/35`, dark inner card border marker `border-[#232b36]/80`, dark summary divider `border-l border-[#232b36]/90`, dark section border and row dividers `border-[#202733]` / `divide-y divide-[#202733]`, muted labels `text-[#8a909a]`, no old bright summary border, white yearly dividers, or white chart grid line marker, `v10.7.9.128` changelog, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.128` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;点击北极星卡打开复利弹窗,弹窗宽 `374px`,高 `816px`,页面 `scrollWidth=390`,弹窗 `scrollHeight=877` / `clientHeight=814`,可内部滚动;外层边框色 `rgba(246,181,75,0.35)`;统计卡/实际进度边框色 `rgba(35,43,54,0.8)`,曲线卡和每年收益卡边框色 `rgb(32,39,51)`;`目标终值`、`累计收益`、`复利倍数`、`实际进度`、`年份`、`年收益`、`期末资产` 标签均为 `rgb(138,144,154)`;曲线网格为暗线;收益颜色保持 `rgb(251,113,133)`;无横向溢出。
- `v10.7.9.128` deployment: pushed to GitHub `main`;runtime commit `f82785e31b5f1ec16886b03edb636f2596033da6`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/3QvBZ9pKdvydw6S9KshNmXEy7879`。
- Production `GET https://boduan-tracker.vercel.app/?v=f82785e-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-CnERzTwG.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-B21CJLxn.css`;production runtime chunks include `/assets/App-rex7fF_2.js`, `/assets/ReviewTab-DvF47Fsk.js`, `/assets/SettingsTab-DRKSQz2w.js`。
- Production marker check: `ReviewTab-DvF47Fsk.js` contains `data-compound-detail`, wider scroll modal marker `w-[calc(100vw-16px)] max-w-[386px] overflow-y-auto overscroll-contain`, outer weak gold border marker `border-[#f6b54b]/35`, dark inner card border marker `border-[#232b36]/80`, dark summary divider `border-l border-[#232b36]/90`, dark section border and row dividers `border-[#202733]` / `divide-y divide-[#202733]`, muted labels `text-[#8a909a]`, and no old bright summary border, white yearly dividers, or white chart grid line marker;`SettingsTab-DRKSQz2w.js` contains `v10.7.9.128` and `复利明细内部层级降色`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.127` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-o_AHniHQ.css`,`ReviewTab-B87rKDT0.js`,`SettingsTab-VOO0enLZ.js`,`App-CG5AnaJY.js`);`npm audit --audit-level=moderate` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `data-compound-detail`, wider scroll modal marker `w-[calc(100vw-16px)] max-w-[386px] overflow-y-auto overscroll-contain`, weak gold border marker `border-[#f6b54b]/35`, full-year x-axis mapping, small year font `fontSize: 8`, `text-rose-400`, `v10.7.9.127` changelog, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.127` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;点击北极星卡打开复利弹窗,弹窗宽 `374px`,高 `816px`,页面 `scrollWidth=390`,弹窗 `scrollHeight=877` / `clientHeight=814`,可内部滚动;外层边框色 `rgba(246,181,75,0.35)`;曲线下方完整显示 `2026`-`2035` 共 10 个年份标签且字号为 `8`;累计收益、实际收益和每年收益颜色均为 `rgb(251,113,133)`;无横向溢出。
- `v10.7.9.127` deployment: pushed to GitHub `main`;runtime commit `c685192e5a33150ae5fa016b40fb0f88f238bb3d`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/5Qn8Xsy9ZvDBzohBNXpkPWZ343Ai`。
- Production `GET https://boduan-tracker.vercel.app/?v=c685192-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-DtvStkZ7.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-o_AHniHQ.css`;production runtime chunks include `/assets/App-pTfXC-2E.js`, `/assets/ReviewTab-B87rKDT0.js`, `/assets/SettingsTab-VOO0enLZ.js`。
- Production marker check: `ReviewTab-B87rKDT0.js` contains `data-compound-detail`, wider scroll modal marker `w-[calc(100vw-16px)] max-w-[386px] overflow-y-auto overscroll-contain`, weak gold border marker `border-[#f6b54b]/35`, full-year x-axis mapping, small year font `fontSize: 8`, and `text-rose-400`;`SettingsTab-VOO0enLZ.js` contains `v10.7.9.127` and `北极星复利明细视觉微调`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.126` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-Cx-T4_k3.css`,`ReviewTab-GIfYKcLP.js`,`SettingsTab-ClWlObgz.js`,`App-o8-UUWe0.js`);`npm audit --audit-level=moderate` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `data-compound-detail`, `复利明细`, `账户曲线`, `实际进度`, `每年收益`, compact summary font marker `text-[13px] font-normal leading-none text-[#ffd18a] tabular-nums`, `v10.7.9.126` changelog, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.126` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;点击北极星卡打开复利弹窗,弹窗宽 `366px`,高 `742.7px`,max-height `88dvh`,页面 `scrollWidth=390`;标题 `16px/600`,顶部三项数字 `13px/400`,实际进度标签 `11px/400`,完成度 `15px/400`,账户曲线标题 `14px/600`,每年收益标题 `14px/600`,表格正文 `12px`;USD 状态无横向溢出;点击 USD/RMB 切换不会打开复利弹窗,点击 `设置` 只打开北极星设置;RMB 长数字状态复查无非 SVG 横向溢出。
- `v10.7.9.126` deployment: pushed to GitHub `main`;runtime commit `f87d5c40ffe01dde9608f70dd6fae27293437c31`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/5cBEQLoFj2wbYGEFW4iDasskYauk`。
- Production `GET https://boduan-tracker.vercel.app/?v=f87d5c4-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-Cm1ZGgl0.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-Cx-T4_k3.css`;production runtime chunks include `/assets/App-CYknR7lG.js`, `/assets/ReviewTab-GIfYKcLP.js`, `/assets/SettingsTab-ClWlObgz.js`。
- Production marker check: `ReviewTab-GIfYKcLP.js` contains `data-compound-detail`, `复利明细`, `账户曲线`, `实际进度`, `每年收益` and compact summary font marker `text-[13px] font-normal leading-none text-[#ffd18a] tabular-nums`;`SettingsTab-ClWlObgz.js` contains `v10.7.9.126` and `北极星复利明细弹窗`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.125` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-qDrKxQ7M.css`,`ReviewTab-Do_QlTJz.js`,`SettingsTab-B60-thTq.js`,`App-DLWysUaW.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `text-[14px] font-normal leading-[1.52] text-white/80`, `mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-white/35`, `tabular-nums`, no old review marker `text-[13px] font-normal leading-[1.62] text-white/72`, `v10.7.9.125` changelog, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.125` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;投资戒律列表正文和复盘日志列表正文均为 `14px/400`,行高 `21.28px`,颜色 `rgba(255,255,255,0.8)`;戒律日期/置顶和复盘日期/情绪所在 meta 行均为 `12px`,颜色 `rgba(255,255,255,0.35)`,间距 `8px`;复盘日志列表卡片在 390px 视口内无横向溢出。
- `v10.7.9.125` deployment: pushed to GitHub `main`;runtime commit `27aa337337e909c4dc2a9e73aa90737ac92b2754`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/G3k8bevhm11x6eb6hHsKcXCTD2WB`。
- Production `GET https://boduan-tracker.vercel.app/?v=27aa337-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-_-S7fxoX.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-qDrKxQ7M.css`;production runtime chunks include `/assets/App-DIuIeqT_.js`, `/assets/ReviewTab-Do_QlTJz.js`, `/assets/SettingsTab-B60-thTq.js`。
- Production marker check: `ReviewTab-Do_QlTJz.js` contains `text-[14px] font-normal leading-[1.52] text-white/80`, `mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-white/35` and `tabular-nums`;old marker `text-[13px] font-normal leading-[1.62] text-white/72` is absent;`SettingsTab-B60-thTq.js` contains `v10.7.9.125` and `复盘和戒律列表细节对齐`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.124` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-CCleSwoD.css`,`ReviewTab-3jD8px9N.js`,`SettingsTab-BNBYWZsK.js`,`App-CqImk6tp.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `复盘详情`, `min-h-[220px]`, `查看全文`, `展开剩余`, `删除这条复盘?`, `v10.7.9.124` changelog, `编辑复盘` preview marker, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.124` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;页面 `scrollWidth=390`,body background `rgb(5, 7, 11)`;年度目标默认只显示 `2026` 和 `2027`,展开按钮为 `展开剩余 8 年`;复盘日志标题与右侧 `+ 写复盘` 同排,添加按钮 `40px`;首条复盘卡片 `358px` 宽、圆角 `22px`、背景 `rgb(11, 17, 25)`,正文 `13px/400`,行高 `21.06px`,日期和情绪位于正文下方同一行;点击首条复盘打开 `复盘详情`,详情正文区 `300x220`,正文 `14px/400`,行高 `25.48px`,日期和情绪位于正文下方同一行,底部只有 `修改`、`删除` 两个 `146x36` / `12px` 小按钮,无底部 `取消`;点击 `修改` 后详情关闭并打开 `编辑复盘` 预览弹窗。
- `v10.7.9.124` deployment: pushed to GitHub `main`;runtime commit `bfaac6673e4a187121c978a8e6701db3e360f347`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/2GUSsdSu2t7GfvdLr8X3NC1M355a`。
- Production `GET https://boduan-tracker.vercel.app/?v=bfaac66-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-LzxsZAa9.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-CCleSwoD.css`;production runtime chunks include `/assets/App-DT4OuoBn.js`, `/assets/ReviewTab-3jD8px9N.js`, `/assets/SettingsTab-BNBYWZsK.js`。
- Production marker check: `ReviewTab-3jD8px9N.js` contains `复盘详情`, `min-h-[220px]`, `查看全文`, `展开剩余` and `删除这条复盘?`;`SettingsTab-BNBYWZsK.js` contains `v10.7.9.124` and `复盘日志卡片和详情弹窗`;`App-DT4OuoBn.js` contains `编辑复盘`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.123` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-CMFmKKNK.css`,`ReviewTab-aXtuzmSs.js`,`SettingsTab-7OfakMAN.js`,`App-CxAlDERj.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `记录详情`, `min-h-[168px]`, compact 3-button detail actions, `border-[#f6b54b]/30`, `border-emerald-300/20`, no `删除戒律` / `修改戒律`, `v10.7.9.123` changelog, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.123` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;页面 `scrollWidth=390`,body background `rgb(5, 7, 11)`;长文本 `TSM` 戒律详情卡片 `342x314`,正文区 `300x168`,正文 `14px/400`,行高 `25.48px`,正文无列表省略号,前缀颜色 `rgba(246, 181, 75, 0.9)`;底部只有 `修改`、`删除`、`置顶` 三个 `95x36` / `12px` 小按钮,无重复底部 `取消`;短文本戒律详情正文区保持 `168px` 高;置顶 `VIX 法则:` 前缀高亮,第三个按钮显示 `取消置顶`。
- `v10.7.9.123` deployment: pushed to GitHub `main`;runtime commit `806ad0daf09266f9d1b05f9681e7b4fe4a315817`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/22CRqnoeRVyzkX68U8n9oQFqQ8N3`。
- Production `GET https://boduan-tracker.vercel.app/?v=806ad0d-runtime`: HTTP 200。
- Production entry chunks: `/assets/index-B4-3F3aL.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-CMFmKKNK.css`;production runtime chunks include `/assets/App-CzyBdNt7.js`, `/assets/ReviewTab-aXtuzmSs.js`, `/assets/SettingsTab-7OfakMAN.js`。
- Production marker check: `ReviewTab-aXtuzmSs.js` contains `记录详情`, `min-h-[168px]`, compact 3-button detail actions, `border-[#f6b54b]/30`, `border-emerald-300/20`, and no `删除戒律` / `修改戒律`;`SettingsTab-7OfakMAN.js` contains `v10.7.9.123` and `投资戒律记录详情弹窗`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.122` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-4yZywl3J.css`,`ReviewTab-DYUy-Vmo.js`,`SettingsTab-DL8y-df1.js`,`App-DwOXKVd8.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass;build marker check confirms `text-[19px]`, `min-h-10 items-center`, `h-5 w-1`, no duplicate title `{disciplines.length} 条`, `v10.7.9.122` changelog, no `overscroll-behavior-y:none`, no `DevVisualPreview` in App chunk.
- `v10.7.9.122` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;投资戒律标题 `19px/600`,标题行高 `40px`,右侧 `+ 添加` 按钮 `40px` 高,标题与添加按钮中心线差 `0px`;标题下方重复数量已删除,`全部 (10)` 筛选胶囊仍保留;标题竖条 `20px` 高;页面 `scrollWidth=390`。
- `v10.7.9.122` deployment: pushed to GitHub `main`;runtime commit `2cce942a0ad8a2ec8a46b70c80c78a8b8415c49c`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/4Z5986QN9A4tQ9aaV6k9o149zfwj`。
- Production `GET https://boduan-tracker.vercel.app/?v=2cce942-runtime`: HTTP 200。
- Production marker check: `ReviewTab-DYUy-Vmo.js` contains `text-[19px] font-semibold`, `mb-4 flex min-h-10 items-center`, `h-5 w-1`, no duplicate title `{disciplines.length} 条`, and keeps `全部 (...)`;`SettingsTab-DL8y-df1.js` contains `v10.7.9.122` and `投资戒律标题行精简`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.121` local validation: `npm test` pass,65 tests;`npm run build` pass (`index-g9a9dZt8.css`,`ReviewTab-wndgD-Gl.js`,`SettingsTab-O-01VLtQ.js`,`App-BJ_DIG30.js`);`npm audit` pass,0 vulnerabilities;`git diff --check` pass.
- `v10.7.9.121` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`,in-app browser viewport `390x844`;投资戒律区域 `scrollWidth=390`,body background `rgb(5, 7, 11)`;标题 `21px/600`,数量 `12px/400`,添加按钮 `40px` 高、`13px/400`;筛选行 `358px` 宽且 `scrollWidth=358`,5 个筛选胶囊一行完整显示,筛选文字 `12px/400`,等级圆点 `8px`;首张戒律卡 `358px` 宽,正文 `14px/400`,日期 `12px/400`,置顶 `11px/400`;旧 emoji 等级图标未显示;点击第一条戒律可打开 `戒律操作`,包含修改、取消置顶、删除和取消。
- `v10.7.9.121` deployment: pushed to GitHub `main`;runtime commit `2c7002ab36e29f4b9ebfa830a752b9d554781ad2`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/Bf2QeWCsERUgVqqsY4gUeaJB8b2i`。
- Production `GET https://boduan-tracker.vercel.app/?v=2c7002a-runtime`: HTTP 200。
- Production marker check: `ReviewTab-wndgD-Gl.js` contains `text-[21px] font-semibold`, `投资戒律`, `mt-1.5 text-[12px]`, `text-[14px] font-normal leading-[1.52] text-white/80`, `px-2.5 py-0.5 text-[11px]`, `h-9 min-w-[54px]` and `h-2 w-2`;`SettingsTab-O-01VLtQ.js` contains `v10.7.9.121` and `投资戒律字体整体收紧`;production CSS/App chunks do not contain `overscroll-behavior-y:none` or `DevVisualPreview`;unauthenticated `GET /api/quote?symbols=VIX` returns `401`。
- `v10.7.9.120` local validation: `npm test` pass,65 tests;`npm run build` pass;`npm audit` pass,0 vulnerabilities;`git diff --check` pass.
- `v10.7.9.120` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`, in-app browser viewport `390x844`;投资戒律区域 `scrollWidth=390`,body background `rgb(5, 7, 11)`;标题 24px/600,数量 13px/400,添加按钮 44px 高低色彩灰色胶囊;5 个筛选胶囊在 390px 视口一行完整显示,宽度约 `75.4px + 58px * 4`;首张戒律卡宽 358px、圆角 22px、正文 15px/400,等级显示为 40px 低饱和底圈 + 10px 实心圆点,未显示旧 emoji;置顶为 12px 低色彩灰色胶囊;点击戒律卡可打开 `戒律操作`,并包含修改、置顶/取消置顶、删除和取消。
- `v10.7.9.120` deployment: pushed to GitHub `main`;runtime commit `4d8d0f76c9c4af9276252f3aac954f4504c448a4`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/2jZMvFYo5NM7g8p6DRfgXNNfRXcR`。
- Production `GET https://boduan-tracker.vercel.app/?v=4d8d0f-runtime`: HTTP 200。
- `v10.7.9.119` local validation: `npm test` pass,65 tests;`npm run build` pass;`npm audit` pass,0 vulnerabilities;`git diff --check` pass.
- `v10.7.9.119` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`, in-app browser viewport `390x844`;RMB 状态下页面不含 `1 USD =` 文案;北极星副标题为 12px/400;`还剩 ...` 为 12px/400;`年度目标进度` 标题为 15px/600;年度 `2026` 为 28px/600,`2027` 为 22px/600;页面 `scrollWidth=390`,无横向溢出。
- `v10.7.9.119` deployment: pushed to GitHub `main`;runtime commit `80b941f797623afcfd053932dadd15517fbde2e6`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/BGcYru5uraG1wyLy6z6W3axSk34b`。
- Production `GET https://boduan-tracker.vercel.app/?v=80b941f-runtime`: HTTP 200。
- `v10.7.9.118` local validation: `npm test` pass,65 tests;`npm run build` pass;`npm audit` pass,0 vulnerabilities;`git diff --check` pass.
- `v10.7.9.118` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`, in-app browser viewport `390x844`;北极星头卡 `设置` 按钮实际为 `rgba(255,255,255,0.65)` 文本、`rgba(255,255,255,0.1)` 边框和中性弱白底;2027 未开始卡片不再出现 `起点 (2026目标)` 或 `目标 (2027)`;增长目标虚线为 `rgba(255,255,255,0.25)`;页面 `scrollWidth=390`,无横向溢出。
- `v10.7.9.118` deployment: pushed to GitHub `main`;runtime commit `b3652214d4e0d08ef6aa2d2fc1f7b825668d0b54`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/E6yeWy5nHv9w6h3oTEHjyubo1TeU`。
- Production `GET https://boduan-tracker.vercel.app/?v=b365221-runtime`: HTTP 200。
- `v10.7.9.117` local validation: `npm test` pass,65 tests;`npm run build` pass;`npm audit` pass,0 vulnerabilities;`git diff --check` pass.
- `v10.7.9.117` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=review`, in-app browser viewport `390x844`;北极星卡 `358x244`;目标提醒文案无 transform,离卡片底边约 `7px`;`设置` 按钮仍单独 `translateY(-8px)`,离卡片底边约 `6.5px`;年度 `2026` 为 28px/700,`2027` 为 22px/700;目标页未显示行情失败 toast;页面 `scrollWidth=390`,无横向溢出。
- `v10.7.9.117` deployment: pushed to GitHub `main`;runtime commit `331d5178c7ab5c4c0b5d991800b24e1c2d11ab03`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/9WAMfEBKvXXG7yaLmTQqdpjDno54`。
- Production `GET https://boduan-tracker.vercel.app/?v=331d517-runtime3`: HTTP 200。
- `v10.7.9.116` local validation: `npm test` pass,65 tests;`npm run build` pass;`npm audit` pass,0 vulnerabilities;`git diff --check` pass.
- `v10.7.9.116` local visual verification: Vite dev server `http://127.0.0.1:5173/?tab=analysis`, in-app browser viewport `390x844`;资产页家庭总资产实际渲染为 `¥27,102,105.74`,拆成 `¥27,102,105` 34px 正常字重和 `.74` 20px 正常字重两段;页面 `scrollWidth=390`,无横向溢出。
- `v10.7.9.116` deployment: pushed to GitHub `main`;runtime commit `557b8cad4ac155fb802f91dcc5f7e3718a2672c6`;GitHub Actions `CI` success run `28735781205`;Vercel production target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/CTf8d5cXrr6PdR82vwT1vWi5mVnA`。
- Production `GET https://boduan-tracker.vercel.app/?v=557b8ca-runtime`: HTTP 200。
- Latest completed production unauthenticated `GET /api/quote?symbols=VIX`: HTTP 401。

已验证生产 runtime chunks:

- 本轮本地构建 runtime chunks: `/assets/index-CRa94lVp.css`, `/assets/ReviewTab-ZMBJLBy2.js`, `/assets/SettingsTab-DCwFIKfg.js`, `/assets/App-BH87booL.js`。
- 生产 entry chunks: `/assets/index-BoU7DIW_.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-CRa94lVp.css`。
- 生产 runtime chunks include: `/assets/App-BkmZzdUe.js`, `/assets/ReviewTab-ZMBJLBy2.js`, `/assets/SettingsTab-DCwFIKfg.js`。
- 本轮本地构建 runtime chunks: `/assets/index-BiGy84K3.css`, `/assets/ReviewTab-Di8dsjgl.js`, `/assets/SettingsTab-D7CvfPsV.js`, `/assets/App-DKGUHviZ.js`。
- 生产 entry chunks: `/assets/index-BhyCkeDx.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-BiGy84K3.css`。
- 生产 runtime chunks include: `/assets/App-D39F0jru.js`, `/assets/ReviewTab-Di8dsjgl.js`, `/assets/SettingsTab-D7CvfPsV.js`。
- 本轮本地构建 runtime chunks: `/assets/index-Cfhv6Pw8.css`, `/assets/ReviewTab-CnsFy6T4.js`, `/assets/SettingsTab-36bzzT0X.js`, `/assets/App-pvxrZ9X8.js`。
- 生产 entry chunks: `/assets/index-BxfmOm0V.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-Cfhv6Pw8.css`。
- 生产 runtime chunks include: `/assets/App-DPuE5fc0.js`, `/assets/ReviewTab-CnsFy6T4.js`, `/assets/SettingsTab-36bzzT0X.js`。
- 本轮本地构建 runtime chunks: `/assets/index-DUpTtqGm.css`, `/assets/ReviewTab-9pzZj3Y2.js`, `/assets/SettingsTab-BJIarOOw.js`, `/assets/App-EZc8GBZk.js`。
- 生产 entry chunks: `/assets/index-iuBhIWkq.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-DUpTtqGm.css`。
- 生产 runtime chunks include: `/assets/App-CZk7kq2l.js`, `/assets/ReviewTab-9pzZj3Y2.js`, `/assets/SettingsTab-BJIarOOw.js`。

关键 marker:

- 本轮本地 marker: `ReviewTab-ZMBJLBy2.js` 包含 `dotColor`、`ringColor`、紧凑筛选 `h-10 min-w-[58px]`、投资戒律标题 `text-[24px] font-semibold`、`戒律操作` 和 `删除戒律`;不包含 `1 USD =` 辅助文案或旧行内 emoji marker;`App-BH87booL.js` 包含添加/编辑戒律等级圆点 `dotColor`/`ringColor`;`SettingsTab-DCwFIKfg.js` 包含 `v10.7.9.120` 和 `投资戒律低色彩重设计`;`index-CRa94lVp.css` 不包含全局 `overscroll-behavior-y:none`;构建资产不包含 `DevVisualPreview`。
- 生产 `ReviewTab-ZMBJLBy2.js` 包含 `dotColor`、`ringColor`、紧凑筛选 `h-10 min-w-[58px]`、投资戒律标题 `text-[24px] font-semibold`、`戒律操作` 和 `删除戒律`;不包含 `1 USD =` 辅助文案。
- 生产 `App-BkmZzdUe.js` 包含添加/编辑戒律等级圆点 `dotColor`/`ringColor`,并引用 `ReviewTab-ZMBJLBy2.js` 和 `SettingsTab-DCwFIKfg.js`。
- 生产 `SettingsTab-DCwFIKfg.js` 包含 `v10.7.9.120` 和 `投资戒律低色彩重设计`。
- 生产 `index-CRa94lVp.css` 不包含全局 `overscroll-behavior-y:none`,已回退的全局 scrollbar/overscroll suppression 没有恢复。
- 生产 entry/App/Review/Settings/CSS chunks 不包含 `DevVisualPreview`;开发态视觉预览只在 `import.meta.env.DEV` 且缺少 Supabase 配置时启用。
- 生产 `index-BiGy84K3.css` 不包含全局 `overscroll-behavior-y:none`,已回退的全局 scrollbar/overscroll suppression 没有恢复。
- 生产 `ReviewTab-Di8dsjgl.js` 不包含 `1 USD =`,并包含 12px 北极星副标题、12px 剩余年限说明、15px 年度目标标题、`text-[28px] font-semibold` 当前年份和 `text-[22px] font-semibold` 未来年份 marker。
- 生产 `SettingsTab-D7CvfPsV.js` 包含 `v10.7.9.119` 和 `目标页头卡和年度层级微调`。
- 生产 `index-Cfhv6Pw8.css` 不包含全局 `overscroll-behavior-y:none`,已回退的全局 scrollbar/overscroll suppression 没有恢复。
- 生产 `ReviewTab-CnsFy6T4.js` 包含北极星头卡中性色 `设置` 按钮、未开始年度灰色金额、无括号年份标签和灰色增长目标虚线。
- 生产 `SettingsTab-36bzzT0X.js` 包含 `v10.7.9.118` 和 `目标页未开始年度降色`。
- 生产 `index-DUpTtqGm.css` 不包含全局 `overscroll-behavior-y:none`,已回退的全局 scrollbar/overscroll suppression 没有恢复。
- 生产 `App-CZk7kq2l.js` 引用 `ReviewTab-9pzZj3Y2.js` 和 `SettingsTab-BJIarOOw.js`,并将行情失败 toast 限制到 `home` / `trades`。
- 生产 `ReviewTab-9pzZj3Y2.js` 包含目标提醒文案自然底部行、单独上移的设置按钮、`text-[28px] font-bold` 当前年和 `text-[22px] font-bold` 未来年份 marker。
- 生产 `SettingsTab-BJIarOOw.js` 包含 `v10.7.9.117` 和 `目标页细节修正`。
- 生产 entry/App/Review/Settings/CSS chunks 不包含 `DevVisualPreview`;开发态资产/目标视觉预览只在 `import.meta.env.DEV` 且缺少 Supabase 配置时启用。
- 生产 `/api/quote?symbols=VIX` 未登录返回 `401`。

## 8. 最近完成的产品改动

### 目标页

- `v10.7.9.128`: 复利明细内部层级降色已部署;统计卡、实际进度、曲线卡和每年收益表的白色边框/分割线改为暗线,`目标终值`、`累计收益`、`复利倍数`、`实际进度`、`年份`、`年收益`、`期末资产` 等标签统一降为灰色,收益数字继续使用首页粉色。
- `v10.7.9.127`: 北极星复利明细视觉微调已部署;弹窗外层改弱金色边框,宽度加大并支持内部滚动,曲线下方完整显示 2026-2035 十年年份,累计收益、实际收益和每年收益统一为首页粉色。
- `v10.7.9.126`: 北极星复利明细弹窗已部署;点击北极星目标卡片可打开 `10年复利明细`,复用当前本金、年化收益率、年限、目标终值和完成度逻辑,展示顶部三项、实际进度、账户曲线和每年收益表。
- `v10.7.9.125`: 复盘和戒律列表细节对齐已部署;复盘日志首页正文的字号、行距和颜色与投资戒律列表一致,复盘日期/情绪和戒律日期/置顶都改为详情弹窗同款低饱和灰色 meta 效果。
- `v10.7.9.124`: 复盘日志卡片和详情弹窗已部署;复盘日志标题同步投资戒律标题效果,列表改为正文优先的深色大圆角卡片,日期和情绪放在卡片底部同一行,点击复盘先打开 `复盘详情`,底部只保留修改和删除两个小号按钮;年度目标默认只展示 2 年,其余 8 年收进展开按钮。
- `v10.7.9.123`: 投资戒律记录详情弹窗已部署;点击戒律后改为 `记录详情` 卡片,正文完整显示并支持前缀高亮,短内容保留最小展示空间,底部操作改为修改、删除、置顶/取消置顶三个小号胶囊按钮,删除重复取消按钮。
- `v10.7.9.122`: 投资戒律标题行精简已部署;标题从 21px 降到 19px,删除标题下方数量,标题行和右侧添加按钮同排居中,标题竖条同步缩短。
- `v10.7.9.121`: 投资戒律字体整体收紧已部署;标题从 24px 降到 21px,正文从 15px 降到 14px,数量/筛选/日期降到 12px,置顶降到 11px,添加按钮和筛选胶囊高度同步降低。
- `v10.7.9.120`: 投资戒律低色彩重设计已部署;模块改为独立标题、竖向橙色短条、灰色 `+ 添加` 胶囊和灰色筛选胶囊;等级图标从 emoji 改为彩色圆点和低饱和底圈;筛选项在 390px 移动端一行完整显示;戒律卡片正文放大到 15px,日期、置顶、展开全文和等级选择都降为低色彩。
- `v10.7.9.119`: 目标页头卡和年度层级微调;北极星头卡删除 RMB 汇率辅助文案;年目标和剩余年限说明字号缩小到 12px;年度目标进度标题缩小到 15px;年度目标年份数字从 `font-bold` 降到 `font-semibold`。
- `v10.7.9.118`: 目标页未开始年度降色;北极星头卡 `设置` 按钮从金色改为中性色;未开始年度起点/目标金额改为灰色;未开始年度起点和目标去掉括号年份;未开始年度增长目标虚线改为灰色。
- `v10.7.9.117`: 目标页细节修正;行情失败 toast 限制到首页/交易页,目标页不再显示全局行情网络提示;北极星头卡目标提醒文案单独下移,`设置` 按钮保持原上移位置;年度目标年份数字缩小并从 `font-black` 降到 `font-bold`。
- `v10.7.9.116`: 北极星目标小数后缀显式保持 `font-normal`,和前面主金额正常字重一致。
- `v10.7.9.115`: 北极星目标小数层级优化;只在目标页北极星头卡大目标金额恢复两位小数,并把小数后缀用小字号显示;年度目标、计划、实际、目标、落后和未来年度金额仍保持 `v10.7.9.114` 的无小数完整数字。
- `v10.7.9.114`: 目标页数字密度微调;目标页金额默认取消两位小数,继续保留完整千分位数字;2026 本年目标卡边框改为和北极星头卡一致的 `border-white/10`;头卡 `设置` 按钮上移,本地 390px 视口实测离底边约 `7px`。
- `v10.7.9.113`: 目标页数字对齐首页样式;北极星目标和年度目标金额改为完整数字,取消 `万` 简写;目标页金额字体改为首页同源系统字体并用正常字重;北极星目标卡进一步压缩到 `244px`,标题和 USD/RMB 切换同一行,币种按钮尺寸同步首页;头部卡移除右下角半圆装饰和金色边框,改为首页同款弱边框/阴影;年度目标区域继续外扩到 390px 视口约 `374px` 宽;目标页实际/落后等粉色金额通过 `marketTextClass` 同步首页涨跌颜色体系。
- `v10.7.9.112`: 修正目标页视觉对齐;年度进度条微光扫光被限制在进度条内部,避免形成整页动态竖条;北极星目标卡按移动端效果图压回 `270px` 紧凑高度并保留动态进度条;年度目标进度删除多余外层卡片,恢复 358px 宽度;2026 当前年补回右侧目标/落后信息;2027/2028 未开始年度补回起点、目标、增长目标虚线和两端金额结构;年度目标仍通过点击卡片弹出操作面板修改,投资戒律仍通过点击记录弹出操作面板并保留置顶/取消置顶。
- `v10.7.9.111`: 目标页第一阶段统一首页/资产页深色移动端风格;北极星目标卡新增 USD/RMB 切换,RMB 使用现有 `usdRate` 汇率状态并显示汇率文案;头部动态进度条保留;融资杠杆监控模块删除;年度目标卡删除右侧修改按钮,改为点击年度卡后弹出 `年度目标操作` 再进入 `修改年度数据`;投资戒律删除右侧多余置顶/修改图标,改为点击戒律后弹出 `戒律操作`,保留修改、置顶/取消置顶和删除;本地开发预览支持 `?tab=review` 目标页 mock 视觉调试。

### 全局显示和滚动

- `v10.7.9.110` 已回退: 全局隐藏浏览器/系统原生 scrollbar 视觉和根页面 `overscroll-behavior-y:none` 会让下拉和滚动手感不够丝滑,当前 `cf9261d` 已撤回这些全局 CSS 规则,恢复上一版原生滚动与回弹手感。右侧灰白原生滚动条指示可能按系统规则短暂出现,这是本次回退后的预期取舍。

### 资产模块

- `v10.7.9.116`: 资产页家庭总资产卡主数字改为完整人民币金额 + 小号两位小数,例如 `¥27,102,105.74`;走势图、账户列表、占比和月度明细仍保留原有 `万` 简写。
- `v10.7.9.109`: 新增账户不再默认选中银行类型,打开新增账户弹窗时类型和图标为空,保存前必须由用户选择类型;我/老婆账户列表只隐藏当前月折算余额等于 0 的账户,历史快照、家庭总资产、走势图和统计逻辑仍使用完整数据;账户行取消右侧直接删除按钮,改为点击单条账户后打开居中 `账户操作` 弹窗,支持修改账户资料、本月余额和删除账户,更新走 `accounts` 表的 `updateAccount`,删除仍走既有 `deleteAccount` 和快照级联。
- `v10.7.9.108`: 资产页家庭总资产主数字、走势图标题、账户列表、主按钮和弹窗字号继续对齐首页层级;12 个月走势图点选提示补回较上月金额和百分比,首点右移避免碰到纵轴数字,底部月份标注扩展为首月/中间月/末月三点。
- `v10.7.9.107`: 资产页纳入首页同款深色外层壳和深色底部导航;家庭总资产卡、三列指标、走势图、主按钮和账户列表字号/间距重新收紧;`填月度余额` 和 `新增账户` 主按钮恢复清晰显示;12 个月走势恢复线条绘制、面积淡入和点位弹出动效;本地开发缺少 Supabase 配置时提供只读资产视觉预览,用于手机宽度调试,不连接真实数据库。
- `v10.7.9.106`: 资产/分析页按用户新设计图改为深色版本;家庭总资产卡、12 个月走势卡、我/老婆账户列表、填月度余额弹窗和新增账户弹窗统一为当前深色风格;账户类型图标改用 lucide 线性图标体系,删除旧 emoji 展示;底部手动 USD/HKD 汇率输入删除,继续使用现有 `/api/fx` 每日自动汇率换算;账户、月度快照、删除和汇率数据逻辑不变。

### 摊薄成本工具

- `v10.7.9.101`: 全局下拉刷新会先拉取最新入口 HTML 并比对 Vite `/assets` 指纹,发现 Vercel 新包后清理旧 App/Logo 缓存、注销残留 Service Worker,再通过带时间戳的 `window.location.replace` 自动切换到最新前端包;摊薄成本新增股票和添加交易弹窗的标签、placeholder、输入内容、日期输入、取消按钮和未选买卖按钮改用显式深色主题色,修复 iOS 键盘状态文字发黑。
- `v10.7.9.100`: 摊薄成本股票栏过滤空股票代码,不再显示空白胶囊按钮;本地缓存和云端 `cost_basis_trades` 读取都会清洗无效 symbol,云端写入/整只删除也会拒绝空 symbol;行情刷新增加请求锁,避免自动轮询和下拉刷新重复并发;Safari/PWA `Load failed` 网络层错误改为中文 `行情网络请求失败,已保留现有数据` 并自动消失;持仓股票名称/代码点击默认打开买入;工具区 `股票设置` 改为 `交易记录`,可查看全部主交易记录并复用当日订单弹窗修改/删除。
- `v10.7.9.99`: 摊薄成本股票切换栏删除尾部多余虚线 `+`;实际成本涨幅、已实现盈亏和卖出展开明细利润颜色改为和头部资产卡片同源的 `pnlClass`;新增摊薄股票和添加摊薄交易弹窗改为居中弹窗;修复弹窗标签、取消按钮和输入辅助文字因非标准透明度 class 在 iOS 上变黑的问题。
- `v10.7.9.98`: 摊薄成本工具改为深色版本;标题删除旧图标,只保留纯文字 `摊薄成本`;主成本卡、累计投入、已实现盈亏、交易记录、新增股票和添加摊薄交易弹窗统一为黑色风格;辅助图标改用现有 lucide 线性图标体系;摊薄成本提交校验和失败提示改为应用内确认弹窗;数据仍只写独立 `cost_basis_trades`,不影响正式交易账本和波段记录。

### 波段记录小程序 UI

- 当前生产实现: `src/pages/WaveTrackerPage.jsx` 是真实 lazy-loaded 独立页面,交易页工具卡直接进入该页;页面按需读取并真实调用 `swing_waves` CRUD,不并入全局 `fetchAllUserData`。`src/dev/WaveTrackerPrototype.jsx` 仅保留为历史高保真 mock,真实页面另有 fixture smoke 入口。生产数据库基础、13/13 metadata、双真实 Auth 用户 14/14 隔离 smoke 和 `v10.7.9.297` 前端部署均已完成。
- `v10.7.9.297` 已上线: 支持同股多个独立进行中波段、稳定编号、完整买入/完整卖出、新增/详情/编辑/删除、红涨绿跌呼吸状态、完成灰色、共用股票 Logo 和统一深色弹框。买入/卖出/当前单价固定 USD,盈亏金额跟随首页币种;只有进行中波段 symbol 进入现有已登录行情 universe,REST 基线先预热,正式 ledger/自选优先于工具 symbol。
- `v10.7.9.97`: 顶部 `已完成` 统计卡改为独立归类视图;HOOD 这类已完成股票会进入已完成分类,不再压在股票卡底部;进行中列表只显示仍在持有的波段;波段记录字号回到交易页资料卡片相邻档位。
- `v10.7.9.96`: 波段记录标题、股票代码、股票名称、统计卡、明细和整体框架继续压缩;新增波段记录弹窗恢复 `波段备注/计划` 输入;新增波段后备注写入 `wave_notes` 对应波段 id;进行中和已完成波段备注支持编辑和一键清除;顶部 `已完成` 统计卡可展开已完成波段列表。
- `v10.7.9.95`: 波段记录整体字号、行高和卡片留白继续收紧;进行中绿色状态点恢复闪烁;进行中和已完成波段移除 `#1`、`#2` 等无意义编号;添加/修改交易共用弹窗在波段和正式交易缺字段、价格或股数非法时改为应用内自定义提示弹窗,不再触发系统原生 `alert`;开发准则新增非必要不使用浏览器/系统原生交互控件。
- `v10.7.9.94`: 波段记录主界面从旧白色卡片改为深色卡片体系;删除标题前旧图标;顶部和空状态新增 `新增波段股票` 入口;波段区域普通文字、股票代码、数字、记录行、备注和交易明细取消加粗/斜体;收益红色对齐首页粉色体系;已完成波段默认收进 `已完成` 折叠区;波段新增入口继续显式使用 `wave` scope,只写旧账本 `trades`,不写正式主账本 `stock_trades`。

### 全局刷新和工具账本边界

- `v10.7.9.102`: 全局下拉刷新增加强触发限制;只有触摸开始时根页面已经在顶部、且手势不在输入控件或内部滚动容器内,才允许触发刷新。交易页 `交易记录` 内部列表增加 `data-pull-refresh-block`,用户在记录列表内上下滑动查看交易时不会再误触发顶部刷新。
- `v10.7.9.101`: 全局下拉刷新不再只是拉云端数据;会先请求最新入口 HTML 并比对 Vite 资源指纹,发现新部署后自动清理旧缓存并重新载入最新前端包。注意:已经打开在更早旧 JS 里的页面无法被新代码反向热补丁,这次版本加载后才具备后续自动切新包能力。
- `v10.7.9.93`: 添加交易新增完成后默认回到买入;页面滚到顶部继续下拉可强制刷新云端数据、汇率和已登录行情;顶部显示轻量 `下拉刷新/松开刷新/刷新中/已刷新` 状态。
- `v10.7.9.93`: 波段记录新增入口改为显式 `wave` scope,只写旧账本 `trades`,不再串到正式交易 `stock_trades`;摊薄成本新增交易只写 `cost_basis_trades`;波段记录、摊薄成本和通用确认弹窗都增加提交确认和防重复提交锁。

### 设置页和账户

- `v10.7.9.67`: 设置页整体改为和首页一致的深色风格。
- 移除无效的实时推送、数据状态、JSON 导出入口。
- 云端账户改为普通账户设置,去掉黑金炫光效果。

### 首页自选和持仓

- `v10.7.9.130`: 首页 VIX/CNN 恐慌指标重做为全宽高保真金融卡片;VIX 卡包含绿色发光大数值、140x40 sparkline、0-50 横向风险条、0/20/30/50 刻度、发光 indicator 和三段低/中/高恐慌标签;CNN 恐慌贪婪卡包含红色大数值、状态文字、140x40 sparkline、0-100 红黄绿半圆 gauge、tick、发光指针、中心 glow ring 和五段情绪标签;底层 VIX/FGI 数值、日期和 `/api/quote` 鉴权不变。
- `v10.7.9.129`: 首页恐慌指数视觉降重已部署;VIX 恐慌指数标题改为 CNN 同款灰色,VIX/CNN 主数字取消 `font-black`,CNN `恐惧` / `恐慌` 状态文字同步降为正常字重;指数数值、颜色、说明文案和 CNN 仪表盘逻辑不变。
- `v10.7.9.116`: 首页头部总资产主数字同步北极星目标的小数层级,整数部分保持 34px 正常字重,两位小数后缀缩小到 20px 正常字重。
- `v10.7.9.105`: 中文名兜底库中 `QQQ` 和 `TQQQ` 改为直接显示英文代码;QQQ 默认基准股票名称和基准候选项也同步显示 `QQQ`,避免同一页面仍出现旧中文名。
- `v10.7.9.104`: 首页持仓、交易页持仓分布、当日订单、全部交易记录、订单操作弹窗和编辑交易表单统一使用 `displayStockName` / `STOCK_NAME_CN` 中文名兜底;旧 `name=TSM`、`name=MSFT` 这类代码式名称会显示为 `台积电`、`微软` 等中文名。
- `v10.7.9.92`: 首页头部总资产卡片同步交易页字号/位置和正常字重;首页四大指数卡片取消加粗;当前信号、VIX 和 CNN 保持不动;订单操作弹窗股票中文名和取消按钮改为清晰可见;旧自选/交易记录中 `name=TSM` 这类代码式名称会用中英对照表兜底显示 `台积电` 等中文名;修正部分弱文字无效透明度 class。
- `v10.7.9.91`: 首屏加载回退到上一版圆环效果;交易页持仓分布、当日订单、美股、数字、持仓盈亏和个股盈亏统一改为正常字重;当日订单行改为点击记录后通过居中 `订单操作` 弹窗修改或删除;开发准则新增普通文本/股票代码/数字/记录行默认不加粗。
- `v10.7.9.90`: 首屏加载曾改为 mini 钱袋 PNG 和轻微弹跳 CSS 动效,但已在 `v10.7.9.91` 按用户反馈回退。
- `v10.7.9.89`: 首页自选/持仓表格收窄名称列并压缩右侧指标列,让 `52周跌幅` 在首屏打开即可完整看到;首页 `添加自选股票`、`编辑自选股票` 和交易页 `编辑` 入口改为正常字重。
- `v10.7.9.85`: 交易页持仓分布只加宽 `占比` 列,把 `持仓盈亏` 和 `占比` 拉开距离;前面的 `当日盈亏` 列宽保持不变。
- `v10.7.9.84`: 交易页持仓分布恢复上一版当日盈亏首屏显示效果;只把 `持仓盈亏` 列单独加宽到 `144px`;持仓盈亏正数恢复显示 `+` 号。
- `v10.7.9.83`: 交易页持仓盈亏改为只计算当前持仓浮动盈亏;正数不再显示 `+` 号;当日盈亏和持仓盈亏列加宽并继续支持横向滑动;当日订单支持修改和删除并同步云端账本。
- `v10.7.9.82`: 交易页持仓分布市值/数量列不再显示小数,减少市值列占用并帮助当日盈亏完整露出。
- `v10.7.9.81`: 交易页持仓分布再次微调列宽;市值/数量和现价/成本略向左收,保持当日盈亏列宽不变,让末尾数字更容易完整露出。
- `v10.7.9.80`: 交易页持仓分布内部左右留白继续收紧;名称/代码、市值/数量和现价/成本列缩窄,默认首屏更容易完整显示当日盈亏。
- `v10.7.9.79`: 首页四张市场卡价格数字统一左移并略微收紧,避免右侧被撑出且保持视觉一致;交易页持仓分布加宽股票信息、当日盈亏和持仓盈亏列。
- `v10.7.9.68`: 首页新增添加自选股票弹层,只保留美股添加流程;新用户自选默认空。
- 股票图标增加多源候选和成功缓存,IBKR 等缺图会自动兜底。
- 自选和持仓拆清楚:自选是用户关注列表,持仓来自交易主账本。
- `v10.7.9.69`: 添加自选弹窗居中自适应;键盘弹出时输入框保持可用;添加成功后有提示,防重复提交。
- 首页持仓默认展示全部持仓。
- `v10.7.9.70`: 自选/持仓表格改为左侧名称固定、右侧指标全局横向滑动。
- `v10.7.9.71`: 自选新增编辑入口,支持置顶、上移、下移、删除;删除点击股票展开自选参数的旧入口。
- `v10.7.9.72`: 自选/持仓新增年初至今;价格、涨跌幅、52 周跌幅、年初至今、持仓盈亏支持表头排序。
- 自选不显示持仓盈亏;持仓 tab 才显示真实持仓盈亏。

### 交易和收益率

- `v10.7.9.116`: 交易页头部总资产主数字同步首页/北极星目标的小数层级,保留完整金额、USD/RMB 切换和正常字重。
- `v10.7.9.104`: 交易页持仓分布、当日订单、全部交易记录、订单操作弹窗和编辑交易表单同步使用和首页一致的股票中文名显示口径;数据不回写数据库,只修正显示层兜底。
- `v10.7.9.103`: 当前股票交易记录里的 `订单操作` 弹窗改为更窄的居中尺寸;弹窗宽度使用 `100vw - 72px` 且最大 `360px`;`修改记录`、`删除记录` 和 `取消` 按钮高度同步压缩,更接近用户提供的参考图二比例。
- `v10.7.9.88`: 交易页主账本 `添加交易/修改交易` 共用弹层改为居中自适应面板;弹层打开后锁定背景页面滚动,关闭后恢复原位置;取消按钮恢复为清晰可见的暗灰底。
- `v10.7.9.87`: 交易页主账本 `添加交易/修改交易` 共用弹层继续优化细节;买入/卖出选中态改为整块红色/绿色填充,普通输入框取消可见边框效果,日期输入框和弹层网格增加防溢出约束,避免 iOS/Safari 原生日期控件撑出底部抽屉。
- `v10.7.9.86`: 交易页主账本 `添加交易/修改交易` 共用弹层改为深色 UI;默认买入,买入选中显示红色、卖出选中显示绿色,未选按钮为暗灰色;输入框、日期栏、确认和取消按钮同步适配深色风格,交易保存/修改/同步逻辑不变。
- `v10.7.9.85`: 列宽改为 `80px/76px/118px/144px/66px`,只扩大最后 `占比` 列,让 `持仓盈亏` 和 `占比` 有更合理间距。
- `v10.7.9.84`: 保留 `v10.7.9.83` 的当前持仓浮盈口径,但展示层恢复持仓盈亏正号;列宽改为 `80px/76px/118px/144px/46px`,确保当日盈亏不受持仓盈亏加宽影响。
- `v10.7.9.83`: `累计盈亏` 继续使用账户级 `realizedPnl + unrealizedPnl`;`持仓盈亏` 改用 `unrealizedPnl`,个股行改用 `position.unrealizedPnl/unrealizedPct`,避免历史已实现盈亏混入当前持仓浮盈。
- `v10.7.9.73`: 修复卖出后累计收益率口径。
- 累计收益率分母改为当前实际持仓成本。
- 卖出盈利会正确摊薄剩余持仓成本,不再被历史总买入额压低收益率。
- 超过当前持仓数量的异常卖出不会污染盈亏计算。
- 主交易账本是 `stock_trades`;旧 `trades` 只保留给波段记录兼容。

### BTC 独立实时行情

- `v10.7.9.74`: BTC 改为单币种独立实时行情,前端连接本站 `/api/btc-realtime` WebSocket relay。
- 浏览器不暴露 EODHD token。
- 断线后自动重连,并用 REST 兜底。
- `v10.7.9.75`: 修复 BTC 首屏卡片错位;BTC tick 不再在市场卡未初始化时单独占第一格。

### PWA 图标

- `v10.7.9.147`: PWA Logo 去白边已部署;最终发布的 `512/192/180/32/16` 五套 PNG 从透明 RGBA 改为 RGB 不透明深色底,四角深色填充,避免 iOS 主屏把透明区域垫成白色边框。
- `v10.7.9.146`: PWA 透明 Logo 替换已部署;用户提供的新蓝绿 K 线箭头 PNG 已确认是 `1024x1024` RGBA 透明文件,并生成 `512/192/180/32/16` 五套带 alpha 的 PNG 图标。
- `v10.7.9.76`: 替换手机桌面图标为用户提供的黑金 K 线箭头图标。
- `v10.7.9.77`: 修复 iOS 主屏图标外侧白边,PNG 改为不透明深色底。

### 找回密码

- `v10.7.9.78`: 修复找回密码回跳。
- 代码侧固定 `redirectTo=https://boduan-tracker.vercel.app`。
- 前端兼容 Supabase PKCE `?code=...` 和旧 `#type=recovery`。
- 过期链接显示“重置链接已失效,请重新发送重置链接”。
- Supabase Dashboard 已改:
  - Site URL: `https://boduan-tracker.vercel.app`
  - Redirect URLs: `https://boduan-tracker.vercel.app/**`
  - Reset password 邮件模板使用 `{{ .ConfirmationURL }}`。

## 9. 关键代码地图

认证:

- `src/AuthGate.jsx`: Supabase session gate,recovery route 判断。
- `src/Login.jsx`: 登录、注册、忘记密码、设置新密码。
- `src/lib/authRecovery.js`: recovery URL 参数解析、生产 redirect 配置。
- `src/lib/supabase.js`: Supabase client 和 auth API 包装。

主应用:

- `src/App.jsx`: 认证后主 shell 和大量共享状态。仍然过大,后续需要拆。
- `src/components/ActionModalCard.jsx`: 资产账户操作和交易订单操作共用的深色玻璃操作卡。
- `src/components/ConfirmModal.jsx`: 全局删除/危险操作确认面板;保留原异步回调和防重复提交边界。
- `src/lib/confirmModal.js`: 确认弹窗参数标准化。
- `src/tabs/HomeTab.jsx`: 首页、市场卡、自选/持仓列表 UI。
- `src/tabs/TradesTab.jsx`: 交易页主账本、持仓分布、工具箱和订单操作卡;股票 Logo 复用现有 `StockLogo` provider/fallback。
- `src/tabs/AnalysisTab.jsx`: 资产/分析和账户操作卡;账户可选图片 Logo 加载失败时回退账户类型图标。
- `src/tabs/ReviewTab.jsx`: 目标/复盘。
- `src/tabs/SettingsTab.jsx`: 设置页、账户设置、更新日志。
- `src/pages/WaveTrackerPage.jsx`: V2 波段真实独立页面;页面级加载、筛选、行情刷新、CRUD 和统一操作弹框。
- `src/components/StockLogo.jsx`: 交易页与 V2 波段共用的 EODHD/Finnhub/ticker Logo 兜底。

数据:

- `src/lib/db.js`: Supabase CRUD 聚合出口,仍偏大;V2 波段只在这里 re-export,没有塞回主体实现。
- `src/lib/dbGuards.js`: 删除作用域保护。
- `src/lib/swingWavesModel.js`: V2 波段输入校验、数据库行映射和 active/completed 生命周期规则。
- `src/lib/swingWavesRepository.js`: 只访问 `swing_waves` 的用户作用域 CRUD、完整卖出和乐观锁。
- `src/lib/swingWavesDb.js`: 绑定 Supabase client 的薄 wrapper。
- `src/lib/swingWavesViewModel.js`: V2 波段股票聚合、稳定编号、加权收益率、天数和缺行情展示纯函数。
- `src/lib/investmentSummary.js`: 交易主账本派生持仓、成本和收益率。
- `src/lib/btcRealtime.js`: BTC tick 解析和首页市场卡合并逻辑。
- `src/lib/stockRealtime.js`: 用户股票 tick 解析到 quote cache 的前端合并逻辑,覆盖自选、正式持仓、波段记录和摊薄工具 quote rows。

服务端:

- `api/quote.js`: 已登录行情代理入口。
- `server/quote/*`: quote API 的 auth、symbols、provider dispatch、response、provider 实现。
- `api/fx.js`: 汇率接口。
- `api/btc-realtime.js`: BTC WebSocket relay 入口。
- `api/indices-realtime.js`: 三大指数 WebSocket relay 入口。
- `api/stocks-realtime.js`: 用户股票 WebSocket relay 入口,覆盖自选、正式持仓、波段记录和摊薄工具 quote rows。
- `server/realtime/*`: BTC、三大指数、股票 relay、WebSocket auth、EODHD 上游连接。

数据库和安全:

- `supabase/rls.sql`: RLS 策略。
- `supabase/stock_trades.sql`: 主交易账本表。
- `supabase/swing_waves.sql`: V2 波段独立建表/RLS SQL;生产已执行,metadata 核验 13/13 和双真实 Auth 用户隔离 smoke 14/14 通过,真实 UI 已上线。
- `scripts/verify-rls-rest.mjs`: 生产匿名 REST 暴露探针。

测试:

- `tests/auth-recovery.test.js`
- `tests/btc-realtime.test.js`
- `tests/investment-summary.test.js`
- `tests/quote-*.test.js`
- `tests/fx-*.test.js`
- `tests/db-guards.test.js`
- `tests/stock-universe.test.js`
- `tests/tool-ledger-boundaries.test.js`
- `tests/swing-waves.test.js`

## 10. 产品规则和易错点

自选和持仓:

- 自选只代表用户主动关注的股票;新用户默认空。
- 持仓来自交易主账本 `stock_trades`,不能从自选推导。
- 自选列表不显示持仓盈亏。
- 持仓列表才显示真实持仓盈亏。
- 自选/持仓右侧指标使用全局横向滑动,不是单行独立滑动。
- 添加、编辑、删除、保存类操作必须禁用重复提交并显示成功/失败提示。

交易:

- 主买卖账本是 `stock_trades`。
- 旧 `trades` 只作为波段记录兼容表。
- 当前生产 `v10.7.9.297` 波段独立页面只写 `swing_waves`,不能复用正式主交易保存路径写入 `stock_trades`,也不能再双写 legacy `trades`。
- V2 一个波段只允许一次完整买入和一次同股数完整卖出,不支持部分卖出,第一版不计算佣金/手续费;同一股票允许多个互不合并的进行中波段。
- 摊薄成本工具只能写 `cost_basis_trades`,不能并入正式主账本或波段记录。
- 波段记录和摊薄成本工具可以进入 `quoteRows` 获取实时现价,但这只是行情读取,不能反向写入自选、正式持仓或其它账本。
- 波段记录和摊薄成本新增提交前必须弹确认框,确认文案要说明写入范围,并用提交锁防止重复写入。
- `deriveInvestmentSummary` 是首页和交易页资产/持仓口径来源。
- 交易页头部和持仓价格从 `quoteCache -> quoteRows -> investmentSummary` 派生;股票 WebSocket tick 必须写入 `quoteCache`,不要绕过汇总口径单独改交易页 UI。
- 卖出按时间正序用移动均价结转成本。
- 累计收益率分母是当前实际持仓成本,不是历史总买入额。
- `costBasisData` 是独立摊薄工具,不要并入主账本。

首页:

- 当前信号保持紧凑卡片,不要默认展开策略详情。
- 三大指数和 BTC 市场卡保持四格布局。
- 三大指数卡可以秒级更新价格和曲线,但不单独显示连接状态;只让 BTC 卡显示 `LIVE/REST/连接中`。
- BTC tick 只能更新第四张 BTC 卡,不要在首屏单独生成一张 BTC 卡。

设置:

- 每次用户可见更新都要同步设置页更新日志和版本。
- 设置页继续保持深色风格,不要恢复旧的黑金云端账户效果。

移动端弹层:

- `date`、`number`、`text` 等原生输入控件必须显式限制 `w-full max-w-full min-w-0 box-border`。
- 日期框必须使用 `appearance-none`/`WebkitAppearance: 'none'` 或等效约束;父级弹层、两列网格和输入容器也要补 `min-w-0`,避免 iOS/Safari 原生日期控件按自身最小宽度撑出底部抽屉。
- 添加/修改/删除/确认类弹窗打开后必须锁定背景页面滚动;移动端不能允许遮罩背后的页面跟随手势移动。
- 表单类弹窗默认居中自适应,不要无故贴底;若内容超高,弹层内部滚动,背景页面仍保持固定。
- 涉及输入框布局时,至少按 390px 左右移动端宽度核对不溢出。

## 11. 当前主要风险

不要在这些风险解决前上大型专业金融功能:

- `src/App.jsx` 仍然过大,状态和业务逻辑集中。
- `src/lib/db.js` 仍然偏宽;V2 波段已拆出独立数据层和校验,但其它表仍缺少统一 schema validation 和 migration runner。
- `server/quote/providers/eodhd.js` 仍然较大,后续应该拆成 stock、fundamentals、calendar/shared parser。
- 金融计算虽然已有核心测试,但还应继续纯函数化并覆盖更多边界:拆股、空数据、异常卖出、多账户、过期行情。
- `swing_waves` metadata 已完成 SQL/admin 核验;其余用户表仍需全量复核 `relrowsecurity=true` 和 policy。
- `swing_waves` 生产表/RLS 已执行且 metadata 13/13、匿名 REST 探针均通过;两个真实 Auth 用户的 authenticated role/JWT subject CRUD/RLS smoke 14/14 通过且无残留,真实 V2 页面已随 `v10.7.9.297` 上线。
- 生产忘记密码链路已修复配置,但建议下一次操作时发送一封新 reset email 做完整端到端 smoke;不要复用旧邮件链接。

## 12. 建议下一步

优先级 1: 完成其余用户表 RLS metadata 审计和登录隔离 smoke。

- 用 Supabase SQL/admin 权限确认所有用户表 `relrowsecurity=true`。
- 检查 policies 均按 `auth.uid() = user_id` 隔离。
- `swing_waves` 的 preflight、SQL transaction、列/约束/index/trigger/grant/RLS metadata 13/13 核验、SQL 后匿名 REST 和两个真实 Auth 用户的 CRUD/RLS 隔离 smoke 14/14 均已完成;其余用户表 metadata 审计继续独立推进。
- 继续保留 `npm run verify:rls:rest` 作为外部暴露探针。

优先级 2: 保持模块边界,继续把新功能做成独立系统。

- 首页财报日历已经拆成 `api/earnings-calendar.js`、`src/tabs/EarningsCalendar.jsx`、`src/lib/earningsCalendarModel.js`;后续扩展提醒、收藏、详情或更多字段时,继续沿这条独立链路做,不要重新塞回 `/api/quote` 或 realtime relay。
- 收益报表和个股详情读取收益快照,不要用实时行情临时拼假数据;没有快照的日期保持空,不要用其它日期替代。
- 交易页主账本仍以 `stock_trades` 为唯一正式买卖来源;波段记录和摊薄工具保持各自账本边界。

优先级 3: 拆 `App.jsx` 和 `db.js`。

- 建 `src/features/*`。
- 把自选、交易、行情、设置相关状态拆出 hooks。
- 让 `App.jsx` 只保留 shell 和 orchestrator。

优先级 4: 拆 quote provider。

- 继续拆 `server/quote/providers/eodhd.js`。
- 补 EODHD 失败、Yahoo fallback、股票/指数/BTC relay、earnings calendar 部分失败的测试。
- 保持 response-shape tests 不回退。

优先级 5: 加完整视觉/流程 smoke。

- 登录/忘记密码/设置新密码。
- 首页自选添加、编辑、删除。
- 交易买入/卖出后首页和交易页收益率一致。
- 收益报表手动生成快照、自动收盘快照、个股详情收益线。
- iOS 主屏 PWA 回前台后的股票实时刷新和 BTC 独立连接。
- PWA icon manifest 和 apple-touch-icon。

## 13. 下一个人接手后的第一步与快速门禁

首次接手先执行:

```bash
PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
GIT_SSH_COMMAND='ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes' git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
npm run verify:workspace-state
```

根据 workspace 提示补环境,不要无条件重复初始化:

```bash
npm run bootstrap:local-env       # 只有缺 .env.local 且任务确实需要真实本地环境时
npm run bootstrap:vercel-link     # 只有需要 Vercel link/env pull 时
npm ci                            # 只有 node_modules 缺失或 lockfile 变化时
npm run verify:toolchain          # 首次接手、换机、工具链异常或 runtime/sensitive 前
```

接手基准必须确认:

- `git status --short --branch` 干净,`main` 与 `origin/main` 同步。
- 本地和生产设置页版本均为 `v10.7.9.331`。
- 当前已验证生产运行时为 `8f23a471be3cd63b657bf1f7a807c438881a23ea`,入口 `/assets/index-DrckgGpM.js`;接手后以最新部署证据为准。
- `/api/quote?symbols=VIX`、`/api/quote?view=market-movers`、`/api/earnings-calendar?symbols=NVDA` 与 `/api/pnl-benchmark?symbol=QQQ&from=2026-06-01&to=2026-07-10` 未登录均返回 `401`。
- Supabase Auth URL Configuration 仍指向生产域名,Reset password 模板仍使用 `{{ .ConfirmationURL }}`。
- GitHub push 必须使用 `~/.ssh/boduan_tracker_github`;不要改成 HTTPS token 流程。

### 快速上线必须通过（UI-fast）

以下五项是快速通道红线,任一失败都不得部署:

1. 与改动直接相关的定向测试通过;确实没有对应测试时,在 `docs/development-log.md` 明确说明原因。
2. `npm run build` 通过。
3. `npm run verify:docs-consistency` 与 `git diff --check` 通过。
4. 用户可见前端改动必须在本机 Xcode iOS Simulator 验收;输入问题必须拉起系统软件键盘。禁止桌面 Chrome、Codex 内置浏览器、响应式视口和 `verify:frontend-smoke` 充当视觉通过证据。
5. 推送后 `npm run verify:deploy-status -- <commit>` 必须为 PASS,Actions/Vercel success,生产入口正常,quote/earnings 未登录继续 `401`。

UI-fast 只允许纯视觉和只改变当前呈现的轻量交互:文字、颜色、图标、间距、宽高、对齐、展开/收起、页签、弹窗开关、焦点/按压态、局部滚动、键盘可见性、安全区和 loading/空状态/错误状态展示。允许组件内临时展示状态,但不能改业务回调、持久化、全局/跨模块状态、计算、数据源或安全边界。UI-fast 不默认跑完整 `npm test` 或 audit。

### 必须升级为完整流程

出现以下任一项就不能走 UI-fast:业务逻辑/计算/判断;保存、删除、提交、确认、同步、导入或导出等改变业务结果的交互;数据库或持久化;全局/跨模块状态;API/provider;鉴权/RLS/安全;交易账本/持仓/收益/快照/币种换算;路由结果;PWA 生命周期/回前台刷新/service worker;依赖/build/CI/环境配置;会改变多个模块数据或业务行为的共享组件。

Runtime 必须通过:

```bash
npm run verify:toolchain
npm test
npm run build
npm audit --audit-level=high
npm run verify:docs-consistency
git diff --check
```

Sensitive 在 runtime 基础上按影响面追加 `npm run verify:rls:rest`、Supabase SQL metadata、登录隔离和 API/security smoke。涉及 auth、RLS、数据库策略、quote、earnings、比赛 API/Cron、行情 relay、交易主账本、收益快照、付费 token 或环境变量时,绝不能降级。

Docs-only 只跑:

```bash
npm run verify:docs-consistency
git diff --check
git diff --stat
```

## 14. 交接给下一位同事的话

最新可直接转发:

```markdown
你接手的是 `boduan-tracker`。

仓库: `chenshuai1190-dotcom/boduan-tracker`
生产地址: https://boduan-tracker.vercel.app
GitHub `main` 是唯一代码源头。

当前生产基准与待发布候选:
- 运行时代码: `8f23a471be3cd63b657bf1f7a807c438881a23ea`
- 设置页版本: `v10.7.9.332` 候选（当前生产 `v10.7.9.331`）
- 生产入口: `/assets/index-DrckgGpM.js`
- Runtime Actions: `29321470173` success
- Runtime Vercel: `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/CkNECvKe9N3WGSLokcaWFdYkUxvg` success
- 上一条已验证 docs-only commit: `a84defcc7ca1a758ae82883b7311d7fb5213988c`；Actions `29290406860`、Vercel `4F2hDq4k6SuugjgHTnsu7CbSies8` success
- 未登录 `/api/quote?symbols=VIX`: `401`
- 未登录 `/api/quote?view=market-movers`: `401`
- 未登录 `/api/earnings-calendar?symbols=NVDA`: `401`
- 未登录 `/api/pnl-benchmark?symbol=QQQ&from=2026-06-01&to=2026-07-10`: `401`
- 未登录 `/api/community-competition?period=day`: `401`
- 未带 `CRON_SECRET` `/api/community-competition-daily-snapshot`: `401`
- 未带 `CRON_SECRET` `/api/pnl-report-daily-snapshot`: `401`

最新已部署 sensitive 变更:
- 设置页继续为 `v10.7.9.331`;这是 backend-only 发布,没有前端视觉/输入/PWA 改动。
- 无显式日期的个人/比赛 scheduled run 以 `America/New_York` 为准,工作日 17:00 前只 defer 且不访问 provider/数据库;个人和比赛各用 UTC 21/22/23 三个 Hobby 冗余窗口。合法显式日期仍受 `CRON_SECRET` 保护且可绕过时间窗,但比赛显式路径永不 rebaseline;非法日期直接 400。
- 比赛以数据库维护的 `stock_trade_ledger_revisions` 为权威变更证据。仅当前目标日、权威时间证明全部为 16:00 ET 前纯 INSERT 且 revision 增量可由这些新增行完整解释时,允许正常生成当日首快照;当日 UPDATE、历史修改/删除、迁移遗留或任何不可证明的变化都不能直达排名。
- D1 forward-only rebaseline 只允许 active、全表 0 snapshots、两个 ranking 字段都为空的成员。D1 严格校验完整正式非空 USD 账本,并要求 SPY 与所有相关个股都有精确 D1 EOD/OHLC。缺 D1 行、provider 失败或旧 close 替代都不得 RPC。D1 只向前移动 eligible date/hash/revision,不写 snapshot/ranking/收益。D2 下一真实收盘只有账本未变且 EOD/OHLC 校验再次通过才开始排名;再次改账本就继续向后等待。已有 snapshot/ranking 永不 rebaseline。
- service-only join/rebaseline RPC 与 snapshot insert trigger 统一按 revision row→membership row 加锁,防止加入、重建基线或首快照并发写入陈旧 revision;PUBLIC/anon/authenticated 无 RPC execute 权限。`stock_trades` 的时间戳由数据库强制维护,malformed row 不过滤,超卖/非 USD/无效字段权威拒绝。只读正式 `stock_trades`,只写独立比赛表,生产无 mock、实时价、估算收益或旧收盘兜底。
- 发布顺序已完成到 runtime:SQL 源提交、生产应用/回读、数据库并发 smoke、21 tables + 2 RPCs RLS gate、runtime Actions/Vercel 和未登录 401 均已验证。scheduled D1 聚合和后续 D2 只能等真实收盘;当前仍 pending,不要虚构。

最近完成:
- `v10.7.9.332`（待本次部署）:收益比赛权威快照按账户/周期缓存,普通进入不再重复读取;美东 17:10 主检查、19:10 最多一次延迟重试,回前台不盲读。头像移到“我的排名”下方,三项收益指标右移,真实快照日期动态显示为灰色“数据更新MM.DD”。客户端不生成、不修正、不伪造任何收益。
- 上一 runtime 的收盘快照失败重试与连续补漏:个人/比赛 EODHD 按 symbol 最多重试 3 次,可恢复缺口返回 503;个人按最近 31 个日历日 SPY 真交易日补漏并让部分写入可自愈,比赛按完整 SPY 日历有界续跑,空仓不造行、锁定行不覆盖。`2026-07-13` 历史生产补跑为个人 12 users / 12 portfolio rows、54 symbol rows / 18 symbols;比赛 8 users / 8 locked rows,active 9、eligible 9、initialized 8、invalid 0。另 1 名尚未排名成员因 `eligible_ledger_hash_mismatch` 继续拒绝;这是新 rebaseline runtime 上线前的历史基准,不代表 D1/D2 已完成。
- `v10.7.9.331`: 主动投资价值分享卡的当前标的、QQQ 和跑赢/跑输结果三组金额与收益率改为同行展示,极窄屏保留安全换行。iPhone 17 Pro Simulator 中文/CNY、English/CNY 和损失样例均无结果卡横向溢出,分享卡高度由约 447px 降至 381px;计算、数据、API、账本和鉴权不变;已通过 UI-fast 门禁并上线。
- `v10.7.9.330`: 主动投资价值分享卡删除标题下方同期 QQQ 假设提示,日期说明移除“个股/QQQ 普通收盘价”尾注,并删除复制对比文字按钮及剪贴板逻辑。真实收益结果、百分比、系统标准灰边、关闭逻辑、主卡完整方法口径、计算、API、账本与鉴权不变;已通过 UI-fast 门禁并上线。
- `v10.7.9.329`: 个股详情的收益走势与收益对比图在 iOS 连续滑动时保持日期、十字线和金额同步;收益对比小浮层点图外立即关闭、12 秒自动关闭并可再打开;主动投资价值分享大卡恢复系统标准灰边。不改收益计算、收盘价、现金流、API、账本或鉴权;已通过 UI-fast 门禁并上线。
- `v10.7.9.328`: 收益对比的个股和 QQQ 现在都经已登录 `/api/pnl-benchmark` 读取 EODHD 普通收盘价,个人收益快照只核验日期和持仓股数;任一侧缺数据时整卡 fail unavailable,不混用调整价/快照价。主卡保留金额+收益率并将超额金额与“率差 +X.XX%”分开;图表触摸小浮层隐藏个股/QQQ 各自百分比,保留超额金额与最终收益率差;分享卡继续显示完整收益率且仅取消最外层白色描边。已通过 sensitive 门禁并上线。
- `v10.7.9.327`: 个股详情新增真实“收益对比”,跟随本年/近 1 月/近 6 月/近 1 年/全部。起点是当前持仓轮次首笔买入与所选周期中较晚者当日或之后,现有个人收益快照与 QQQ 普通收盘价都有数据的首个共同日期;后续买入给 QQQ 等额资金,卖出按卖前持仓比例同步减仓,双方使用移动均价和实现盈亏摊薄成本。只读正式交易和个人收益快照,数据缺失/不一致时不可用,生产无 mock。个人快照沿用 owner-writable 模型,所以这是个人账本分析而非比赛级不可覆盖证明;个股侧沿用既有快照价格口径,QQQ 侧使用普通收盘价,公司行动附近可能存在口径差异,不做估算补偿。
- `v10.7.9.326`: 添加自选弹窗新增真实美股收盘涨幅榜/跌幅榜,范围严格限定 NASDAQ/NYSE/NYSE American 普通股,各 30 只;与 Nasdaq Trader 当前目录交集验证,单次每侧最多复核 80 个 HomeCategory 候选并有 2 分钟实例内失败退避,官方目录/provider 异常时 fail closed,无生产 mock。已添加股票显示减号且不可重复添加。
- `v10.7.9.325`: 首页财报公司卡片点开后默认进入列表视图;右侧日历按钮和弹窗内日历页签继续保留。定向测试 46/46、build、iOS 26.5 Simulator、docs/diff、Actions、Vercel 和生产产物一致性已通过;财报数据、筛选、详情、API、缓存和鉴权不变。
- `v10.7.9.324`: 当前年度和预测年度资产路径中的“终点”改为“年底目标”,英文同步为 `Year-End Target`;目标金额、年度计划、复利和进度计算不变。定向测试 46/46、build、iOS 26.5 Simulator、docs/diff 和部署检查全部通过。
- `v10.7.9.323`: 设置页 77 个 `settings.*` 系统文案键中英文完整覆盖;Language、Display、Account、Admin、Switch Account、密码和确认流程不再回退中文。社区昵称、邮箱和用户自写内容保持原文。设置/弹窗定向 46/46、build、iOS 26.5 Simulator、docs/diff 和部署检查全部通过。
- `v10.7.9.322`: `ActionModalCard` 在 iOS 键盘缩短视口后自动把当前输入滚到安全可见区;新增交易股数/日期和修改账户余额/保存按钮已用 iPhone 17 Pro Simulator 系统键盘验证。共享宽度、字段、验证、保存回调、数据库和安全边界不变。
- 收益比赛是真实独立功能:用户必须保存社区资料并自愿参赛,榜单严格使用不可覆盖的权威收盘快照;只读正式 `stock_trades`,只写独立比赛表。不得伪造实时收益或改写个人收益快照。
- 波段记录 V2 使用独立 `swing_waves`;支持同股多个独立波段、完整买入/一次性完整卖出。股票单价固定 USD,盈亏金额跟随首页币种;不得写入正式 `stock_trades`。

请先按顺序读:
1. `docs/handoff.md`
2. `README.md`
3. `docs/development-process.md`
4. `docs/development-log.md`
5. `docs/security-hardening.md`
6. `docs/architecture-security-audit.md`

首次接手:
```bash
PATH="$HOME/.local/bin:$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
GIT_SSH_COMMAND='ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes' git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
npm run verify:workspace-state
```

快速上线必须通过（UI-fast）:
1. 相关定向测试通过,或日志明确说明没有对应测试。
2. `npm run build` 通过。
3. `npm run verify:docs-consistency` 和 `git diff --check` 通过。
4. 用户可见前端改动必须用本机 Xcode iOS Simulator 验收;输入问题必须使用系统软件键盘。桌面 Chrome、Codex 内置浏览器、响应式视口和 `verify:frontend-smoke` 不算通过证据。
5. 推送后 `npm run verify:deploy-status -- <commit>` 必须 PASS,Actions/Vercel success,quote/earnings 未登录继续 `401`。

UI-fast 范围:
- 文字、颜色、图标、字号、边框、间距、固定宽高、对齐。
- 展开/收起、页签、弹窗开关、焦点/按压态、局部滚动、键盘可见性、安全区、loading/空状态/错误状态等只影响当前呈现的轻量交互。
- 不改变业务回调、持久化、全局/跨模块状态、计算、数据源、API、数据库或安全边界。
- 不默认跑完整 `npm test` 或 audit。

以下任一项必须升级完整 runtime:
- 业务逻辑、计算或判断规则。
- 保存/删除/提交/确认/同步/导入/导出等改变业务结果的交互。
- 数据库/持久化、全局/跨模块状态、API/provider。
- auth、RLS、安全、交易账本、持仓、收益、快照、币种换算。
- 路由、PWA 生命周期/回前台刷新/service worker、依赖、build、CI、环境配置。

Runtime 必跑:
```bash
npm run verify:toolchain
npm test
npm run build
npm audit --audit-level=high
npm run verify:docs-consistency
git diff --check
```

Sensitive 在 runtime 基础上追加 RLS、Supabase SQL metadata、登录隔离和受影响 API/security smoke。敏感改动绝不能降级。

硬规则:
- 不直接修改 Vercel、浏览器控制台或临时服务器文件。
- 每次代码、配置、部署、安全或文档改动都必须更新 `docs/development-log.md`。
- 用户可见发布同步设置页版本和更新日志;系统文案同步简体中文和 English,用户自写内容保持原文。
- 不提交 token、`.env`、Supabase service role key;不添加 `VITE_EODHD_TOKEN`。
- 浏览器不得直连 EODHD WebSocket;付费行情 token 只允许服务端 `EODHD_API_KEY`。
- 不关闭 `/api/quote` 鉴权。
- 财报日历继续使用独立 `/api/earnings-calendar`,不得塞回 `/api/quote` 或 `CALENDAR:` 虚拟 symbol。
- 正式交易只写 `stock_trades`;波段 V2 只写 `swing_waves`;摊薄工具只写 `cost_basis_trades`;收益比赛只写独立比赛表。
- 收益比赛 D1 只能为 0 snapshots + 0 ranking 成员向前重建 eligibility,不得写收益;SPY 和所有相关个股都必须有精确 D1 EOD,D1 当日交易必须在美东 16:00 前创建且成交价位于 raw high/low。缺行、旧 close、malformed、空/非 USD、超卖或 OHLC 不合法绝不 RPC、忽略或估算;D2 下一真实收盘才可能初始化排名。已有锁定快照绝不覆盖,显式日期绝不 rebaseline。
- 所有自动快照无显式日期时使用美东日历;工作日 17:00 前只 defer。UTC 21/22/23 是冗余触发而不是手机时区规则,所有 path 都必须保持 `CRON_SECRET` 保护。
- 推送必须使用 `~/.ssh/boduan_tracker_github`。

本地 iOS 验收:
```bash
npm run dev -- --host 127.0.0.1
xcrun simctl list devices available
xcrun simctl boot <UDID>              # 已 Booted 时跳过
open -a Simulator
xcrun simctl openurl <UDID> 'http://127.0.0.1:5173/?devPreview=1&tab=settings&lang=en'
```
`DevVisualPreview` 只允许在 iOS Simulator 中做只读视觉/交互 smoke,不连接或写入生产数据。主屏 PWA 特有问题必须添加到模拟器主屏后复测。

当前优先事项:
1. Competition rebaseline SQL 源、生产迁移/回读、revision row→membership row 双事务并发 smoke 和 21 tables + 2 RPCs RLS gate 已完成;现在部署 runtime 并验证真实 SHA/Actions/Vercel/401。
2. 部署后观察 scheduled D1 只前移基线且不写收益,再在下一真实收盘 D2 验证账本未变成员才获得首张锁定快照;只报告聚合,不得暴露 user id 或交易明细。
3. 完成其余用户表 RLS metadata 审计和登录隔离 smoke;`swing_waves` 已完成 metadata 13/13、双真实 Auth 用户 14/14 且无残留。
4. 保持财报日历、收益报表、个股详情、正式交易账本、波段、摊薄工具和行情 relay 的独立边界。
5. 继续拆 `src/App.jsx`、`src/lib/db.js` 和 `server/quote/providers/eodhd.js`,并补关键端到端 smoke。
```

下面旧版转发块仅作历史参考,不要再转发:

```markdown
你接手的是 `boduan-tracker`。

仓库: `chenshuai1190-dotcom/boduan-tracker`
生产地址: https://boduan-tracker.vercel.app
当前 GitHub main: 以本文件所在最新提交为准;`v10.7.9.173` 运行时代码提交 `ff5b1a6ef13171a89555801e075212d47c917e31` 已推送并完成生产验证
当前产品基准提交: `ff5b1a6ef13171a89555801e075212d47c917e31`
最近应用代码提交: `ff5b1a6ef13171a89555801e075212d47c917e31`
设置页版本: `v10.7.9.173`
Vercel 最新运行时部署: success,`v10.7.9.173` production marker verified
最近交接文档刷新部署: 本文件所在提交推送后以 GitHub/Vercel 最新状态为准
部署记录: runtime commit `ff5b1a6ef13171a89555801e075212d47c917e31`;GitHub Actions `CI` run `28795451888` success;Vercel production alias `https://boduan-tracker.vercel.app` updated;active runtime assets `/assets/index-DrUo3qYu.js`, `/assets/App-Drfnt0_s.js`, `/assets/i18n-CPX81kKq.js`, `/assets/HomeTab-DzKcyI8C.js`, `/assets/TradesTab-BKaD1ZhL.js`, `/assets/ReviewTab-D0QwHV5_.js`, `/assets/SettingsTab-DGdo-lLP.js`, `/assets/settingsChangelog-DR5wiS8Z.js`, `/assets/icons-D-qNOTDb.js`;production markers verified;unauthenticated `/api/quote?symbols=VIX` returns `401`,plain HTTPS `/api/stocks-realtime` returns `426`

请先按顺序读:
1. `docs/handoff.md`
2. `README.md`
3. `docs/development-process.md`
4. `docs/development-log.md`
5. `docs/security-hardening.md`
6. `docs/architecture-security-audit.md`

硬规则:
- GitHub `main` 是唯一代码源头。
- 不要直接改 Vercel、浏览器控制台、临时服务器文件。
- 每次代码、配置、部署、安全或文档改动,都必须更新 `docs/development-log.md`。
- 用户可见更新必须同步设置页更新日志和版本。
- 修改 UI 或功能时,涉及系统文案必须同步简体中文和 English;只翻译系统文案,用户自写目标箴言、心得、复盘、备注、日志和账户名保持原文。
- 不要提交任何 token、`.env`、Supabase service role key。
- 不要添加 `VITE_EODHD_TOKEN`。
- 不要关闭 `/api/quote` 鉴权。
- HTTPS push 缺凭证时报 `could not read Username` 时,不要误判为无权限;使用本机项目 SSH key `~/.ssh/boduan_tracker_github`。
- 部署前至少跑 `npm test`, `npm run build`, `npm audit`, `git diff --check`。
- 生产敏感改动还要跑 `npm run verify:rls:rest`,并确认 `/api/quote?symbols=VIX` 未登录返回 `401`。

本地调试提效:
- 本机 Node 路径: `PATH="$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"`。
- 新 Codex 工作区默认不会继承 `.env.local`、`.vercel/`、`node_modules`、`dist`、dev server 或旧工作区测试状态;先用 `npm run verify:workspace-state` 判断缺什么,再用 `npm run bootstrap:local-env` / `npm run bootstrap:vercel-link` 恢复当前工作区本地状态。
- UI/视觉任务先跑 `npm run dev -- --host 127.0.0.1`,打开 `http://127.0.0.1:5173/`,用 390×844 左右手机视口检查,不要每个字号/弹窗问题都直接靠部署验证。
- 本地没有 Supabase 配置时,开发环境会通过 `src/AuthGate.jsx` 自动进入 `src/DevVisualPreview.jsx` 的只读 mock 预览,可以用 `?tab=home` 检查首页,用 `?tab=review` 检查目标页,快速检查首页卡片、资产页和目标页深色背景、卡片间距、按钮、输入框显色、年度目标结构和操作弹窗。
- `DevVisualPreview` 不连接真实 Supabase,不会提交 `.env`,不会改生产数据;只能用于视觉和交互烟测,不能当真实数据来源。
- 涉及真实登录、真实账户数据、行情、RLS、鉴权或部署缓存切换时,仍要用生产地址做线上验证。

当前已完成:
- `v10.7.9.173` 弹窗字重和交易确认细节已完成部署和线上验证:首页添加成功提示“添加成功”和“知道了”取消过重字重;首页添加/编辑自选弹窗标题、搜索输入、热门/美股筛选、股票代码、自定义股票入口和完成按钮统一正常字重;交易正式保存二次确认改用当前线性 check 图标,信息行取消旧等宽字体并移除末尾日期;交易录入自动识别提示降到 11px,输入框和持仓分布“编辑”入口同步金色描边语气;生产 `App-Drfnt0_s.js`、`HomeTab-DzKcyI8C.js`、`TradesTab-BKaD1ZhL.js`、`SettingsTab-DGdo-lLP.js` 和 `settingsChangelog-DR5wiS8Z.js` marker 验证通过;不改自选数据、交易账本、摊薄工具、行情 relay、汇率、RLS 或 `/api/quote` 鉴权。
- `v10.7.9.172` 目标页文案和弹窗可读性已完成部署和线上验证:交易页新增/编辑交易弹窗标题取消加粗并从 14px 提升到 16px;目标页“投资戒律”系统文案改名为“投资心得” / `Investment Notes`,同步空状态、添加/编辑、删除确认和输入提示;投资心得和复盘日志详情背景图继续加深蒙版,淡化国旗背景突出正文;生产 `TradesTab-jtoZCMkE.js`、`i18n-CPX81kKq.js`、`ReviewTab-D0QwHV5_.js`、`SettingsTab-Dnz-AZSl.js` 和 `settingsChangelog-kbO7oX-_.js` marker 验证通过;不改底层 `disciplines` 数据、用户自写内容、交易账本、摊薄工具、行情 relay、RLS 或 `/api/quote` 鉴权。
- `v10.7.9.171` 工具弹窗和币种同步已完成部署和线上验证:摊薄成本“添加交易”弹窗同步交易录入的新深色分层界面,底部 `买入` / `卖出` 按钮显式传入方向并仍保留二次确认,确认后只写 `cost_basis_trades`;投资戒律和复盘日志详情弹窗遮罩改为交易弹窗同款亮度;首页和交易页 USD/CNY 选择自动保存并跨页面同步;生产 `App-ZDAnFPug.js`、`HomeTab-caYUNvHf.js`、`TradesTab-Bglu0R2H.js`、`ReviewTab-CUjmqKeE.js`、`SettingsTab-2fJWoBGA.js` 和 `settingsChangelog-C6ZWAgLD.js` marker 验证通过;不改主交易账本、摊薄成本账本边界、持仓/盈亏计算、行情 relay、RLS 或 `/api/quote` 鉴权。
- `v10.7.9.170` 交易录入弹窗细节修正已完成部署和线上验证:交易录入弹窗输入框/标签字体适量放大,系统自动识别提示增强,移除股票代码/价格股数/日期前面的数字标记,底部不再显示“操作”标题;二次确认弹窗改为居中深色卡片,不再显示白色老版底部抽屉;生产 `TradesTab-D6G4DUOH.js`、`App-D-OpYjBa.js`、`SettingsTab-BZ5SZX4-.js` 和 `settingsChangelog-CavB_Meb.js` marker 验证通过;不改主交易账本、波段记录边界、持仓/盈亏计算、行情 relay、RLS 或 `/api/quote` 鉴权。
- `v10.7.9.169` 交易录入弹窗结构优化已完成部署和线上验证:主交易弹窗改为股票代码、价格与股数、日期、操作四层结构;底部 `买入` / `卖出` 按钮合并方向选择和提交动作,点击后仍保留确认弹窗;录入界面不再展示中文名输入框,名称和现价由系统自动识别;生产 `TradesTab-BLWroVBB.js`、`i18n-DeasJQRv.js`、`SettingsTab-DgiuxENa.js`、`settingsChangelog-CEyzx6Hv.js` 和 `icons-D-qNOTDb.js` marker 验证通过;不改主交易账本、波段记录边界、持仓/盈亏计算、行情 relay、RLS 或 `/api/quote` 鉴权。
- `v10.7.9.168` 头部 LIVE 隐藏和 CNY 名称统一已完成部署和线上验证:首页和交易页头部资产卡隐藏 `LIVE` 视觉入口,但保留 `fetchRealtimePrices` 绑定和实时行情逻辑;首页/交易页 USD/CNY 切换靠右对齐;首页、交易页、目标页、设置页和英文复利单位的人民币名称统一显示为 `CNY`;生产 `HomeTab-D29M9zKX.js`、`TradesTab-CY2fnMaM.js`、`ReviewTab-BFySgBpt.js`、`i18n-BgIxl1vI.js`、`SettingsTab-CUNzfYI6.js` 和 `settingsChangelog-DgqwhzES.js` marker 验证通过,递归抓取生产 JS 不含 `RMB`;不改交易账本、行情 relay、汇率换算、数据库结构、RLS 或 `/api/quote` 鉴权。
- `v10.7.9.167` 交易页持仓市值两位小数已完成部署和线上验证:交易页持仓列表的单只股票市值从整数显示改为两位小数,和同一行当日盈亏、持仓盈亏保持一致;仅调整显示格式和设置页版本/更新日志,不改 `investmentSummary` 计算、交易账本、行情源、持仓数量、RLS 或 `/api/quote` 鉴权。生产 `TradesTab-DdZ59l3X.js`、`SettingsTab--wAyAC6k.js` 和 `settingsChangelog-DcOrU-lb.js` marker 验证通过;`/api/quote` 和 `/api/stocks-realtime` 鉴权边界保持不变。
- `v10.7.9.166` 目标页英文模式已完成部署和线上验证:目标页北极星目标、年度目标、投资戒律、复盘日志、详情弹窗、复利明细弹窗和目标页表单弹窗接入英文系统文案;用户自己写的戒律、复盘、目标箴言和心情保持原文;目标页主体结构、年度目标/复利计算、数据库路径、行情和鉴权不变。生产 `i18n-DqUNzBZy.js`、`ReviewTab-RfDKcroI.js`、`SettingsTab-BKaQ_fvh.js` 和 `settingsChangelog-BiSWurwW.js` marker 验证通过;`/api/quote` 和 `/api/stocks-realtime` 鉴权边界保持不变。
- `v10.7.9.165` 资产页英文模式已完成部署和线上验证:资产页头部、走势图、账户分组、账户操作和账户弹窗接入英文文案;系统内置账户类型和常见账户名显示英文,用户自定义账户名保持原文;账户数据、月度余额和汇率计算不变。
- `v10.7.9.164` 英文交易头部严格对齐首页已完成部署和线上验证:交易页头部资产卡英文模式三列比例严格同步首页,英文股票副标题改为短品牌名,例如 NVIDIA、Microsoft、Nokia。
- `v10.7.9.163` 英文交易页细节修正已完成部署和线上验证:交易页英文头部持仓数量防溢出,英文持仓列表按股票代码 + 公司英文名展示。
- `v10.7.9.162` 英文模式扩展到交易页已完成部署和线上验证:交易页头部资产卡、工具入口、持仓分布、当日订单、波段记录、摊薄工具和交易弹窗接入语言开关。
- `v10.7.9.161` 股票核心行情去 Yahoo 混源已完成部署和线上验证:股票 `price`、`previousClose`、`change`、`changePercent`、`source` 和 `priceSource` 只使用 EODHD quote;EODHD 股票 quote 无有效价格时返回错误,不再用 Yahoo 自动补价;Yahoo 仅保留为股票小曲线 `intraday/intradayPoints` 的视觉 chart 来源,不参与资产、持仓或当日盈亏计算。生产 `SettingsTab-BFaVqkJr.js`、`settingsChangelog-_jfyzHps.js` 和 `App-eK1xuo-n.js` marker 验证通过;指数/BTC 小卡 Yahoo 曲线兜底、VIX Yahoo fallback、交易账本、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.160` NOK 盘前口径修复回滚已完成部署和线上验证:回滚 `v10.7.9.159` 对 EODHD provider 和 WebSocket/REST 合并的全局口径实验,恢复 `v10.7.9.158` 的行情合并路径;生产 `App-4QcrIawn.js` 不包含 `createRealtimePriceOverlayTick` 或 `usesExtendedEodhdPrice`,`SettingsTab-DfcxvG9T.js` / `settingsChangelog-5oQ0Pqpa.js` marker 验证通过;NOK 盘前涨跌幅仍需后续基于真实接口回包单独定位,不能再把截图推断出的口径套到所有股票。
- `v10.7.9.158` 盘前稀疏成交实时价保护已完成部署和线上验证:NOK 这类盘前成交不密集股票的 WebSocket tick 会保存 `marketStatus`;美股盘前/盘后实时价保护窗口放宽到 30 分钟,避免几分钟前真实盘前成交价被自动/手动 REST 刷新打回常规盘价格。生产 `App-DHstK7zI.js`、`SettingsTab-BEMuXxlM.js` 和 `settingsChangelog-DbSFKm1d.js` marker 验证通过;交易账本、成本、持仓数量、资产、目标、英文模式、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.157` 盘前实时当日盈亏修复已完成部署和线上验证:股票 WebSocket 只推实时价时会从基础行情补 `previousClose` / `changePercent` 等基准字段;REST 手动/下拉刷新后 120 秒内保留更新鲜实时 `quoteCache` 行;`investmentSummary` 可在 `previousClose` 缺失但 `change`/`changePercent` 存在时反推昨收,避免总资产按盘前价变化但今日盈亏清零。生产 `App-DlsKa9Q6.js`、`SettingsTab-CbGXXJez.js` 和 `settingsChangelog-BjTR6oqk.js` marker 验证通过;交易账本、资产、目标、英文模式、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.156` 英文模式第一阶段已完成部署和本地/线上验证:新增本地语言框架 `xmoney_language`,设置页加入 `简体中文` / `English` 切换;底部导航和首页头卡、信号卡、VIX/CNN 恐慌指标、自选/持仓表格、添加/编辑自选弹窗支持英文系统文案;英文模式下首页股票主副标题显示 ticker 缩写;中文默认显示、用户自写日志/复盘/备注/历史记录、行情 relay、交易账本、资产/目标业务逻辑、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.149` 资产和目标模块缩放移除已完成部署和本地/线上验证:资产页账户行、目标页北极星头卡、当前/未来年度目标、年度展开控件、投资戒律卡片和复盘日志卡片均移除老版模块级 `active:scale-[0.99]` / `active:scale-[0.995]`;点击账户、复利明细、年度目标、戒律和复盘详情仍按原流程打开;设置页更新日志和版本同步到 `v10.7.9.149`;生产 `ReviewTab-BSclOsB3.js` marker 验证通过;行情、交易账本、WebSocket relay、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.148` 资产头卡对齐首页已完成部署和本地/线上验证:资产页家庭总资产头卡改用首页/交易页同款外壳、尺寸、金额颜色和金额位置;390×844 本地测量显示首页和资产头卡均为 `x=16,width=358,height=202.25`,主金额均为 `x=33,y=79,34px,#ffd18a`;生产 `AnalysisTab-Dye1C266.js` marker 验证通过;账户、快照、汇率、走势图、交易账本、WebSocket relay、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.147` PWA Logo 去白边已完成部署和本地/线上验证:用户反馈 iOS 主屏出现白色外边后,最终发布图标从透明 RGBA 改为 RGB 不透明深色底;已生成并上线 `512/192/180/32/16` 五套深色填充 PNG,HTML/manifest/iOS 图标路径保持不变;生产图标 SHA 与本地一致,四角深色,无 alpha 通道;设置页更新日志和版本同步到 `v10.7.9.147`;行情、交易账本、WebSocket relay、RLS 和 `/api/quote` 鉴权保持不变。
- `v10.7.9.146` PWA 透明 Logo 替换已完成部署和本地/线上验证:用户提供的新图标确认为 `1024x1024` PNG RGBA,`hasAlpha=yes`,alpha 最小值 `0`;已生成并上线 `512/192/180/32/16` 五套透明 PNG 图标,HTML/manifest/iOS 图标路径保持不变;设置页更新日志和版本同步到 `v10.7.9.146`;行情、交易账本、WebSocket relay、RLS 和 `/api/quote` 鉴权保持不变。该版本在 iOS 主屏会被系统用白色填充透明区域,已由 `v10.7.9.147` 修复。
- `v10.7.9.145` 设置页数据维护删除和诊断报警降噪已完成部署和本地/线上验证:设置页“数据维护/重置本地数据”入口和对应 reset 运行时代码已删除;自动启动、定时和回到前台触发的 `auto-silent + browser-network` 行情抖动只写 console,不再进入设置页报警列表;手动刷新、下拉刷新、服务端错误、鉴权、限流和第三方局部错误仍会记录并按原规则提示;`/api/quote` 鉴权、三套 realtime relay、交易主账本、波段记录和摊薄工具数据边界保持不变。
- `v10.7.9.144` 设置页日志懒加载与重置确认已完成部署和本地/线上验证:重置本地数据改为应用内输入 `确认清空` 的二次确认弹窗,不再调用浏览器原生 confirm/prompt/alert;历史更新日志拆到 `src/lib/settingsChangelog.js` 并以独立 `settingsChangelog` chunk 懒加载;已删除废弃 `public/sw.js`,入口继续注销旧 Service Worker registrations;`/api/quote` 鉴权、三套 realtime relay、交易主账本、波段记录和摊薄工具数据边界保持不变。
- `v10.7.9.143` 运行时代码清理和股票实时渲染减负已完成部署和本地/线上验证:删除老版独立 `VixCard`、滚动计数 Hook、浏览器直连 WS 占位、旧 TQQQ-only 汇总/止盈线白算和不可见股票 WS React state 更新;股票 tick 仍写入 `quoteCache`,三套服务端 realtime relay 和 `/api/quote` 鉴权保持不变;设置页版本不变,因为没有用户可见功能变化。
- `v10.7.9.143` 行情诊断日志和自动失败静默已完成部署和本地/线上验证:自动启动、定时轮询和回到前台触发的 REST 兜底刷新失败只写诊断日志和 console,不再弹底部红条;下拉刷新和首页/交易页手动刷新失败仍会提示;设置页新增 `行情诊断日志`,记录根因、来源、触发方式、请求范围、HTTP 状态、耗时和重复次数。
- `v10.7.9.142` 工具行情 WebSocket 秒级推送已完成部署和本地/线上验证:摊薄工具和波段记录的股票代码加入统一 `quoteRows`,并进入已登录 `/api/stocks-realtime` 订阅;工具现价优先从 `quoteRows/quoteCache` 读取,但摊薄成本仍只写 `cost_basis_trades`,波段记录仍只写旧 `trades`,不污染自选或正式主账本。
- `v10.7.9.141` 交易持仓 WebSocket 秒级推送已完成部署和本地/线上验证:新增已登录 `/api/stocks-realtime` 服务端 relay,股票 tick 写入 `quoteCache`,首页持仓、交易页头部总资产/今日盈亏/累计盈亏和交易页持仓列表通过 `investmentSummary` 同步刷新;三大指数继续秒级更新价格和曲线,但不再显示重复连接态;只有 BTC 卡保留实时状态徽标。
- `v10.7.9.130` 首页恐慌指标高保真卡片已完成部署和本地/线上验证:VIX 恐慌指数改为全宽暗黑金融卡片,增加 sparkline、发光状态点和 0-50 精确风险条;CNN 恐慌贪婪指数改为 SVG 半圆仪表盘、红黄绿渐变弧线、发光指针和五段情绪区间;现有 VIX/FGI 数据、日期和 `/api/quote` 鉴权保持不变。
- `v10.7.9.129` 首页恐慌指数视觉降重已完成部署和线上验证:VIX 恐慌指数标题改为 CNN 同款灰色,VIX/CNN 主数字取消过粗字重,CNN `恐惧` / `恐慌` 状态文字同步降为正常字重;指数数值、颜色、说明文案和 CNN 仪表盘逻辑不变。
- `v10.7.9.128` 复利明细内部层级降色已完成部署和本地/线上验证:统计卡、实际进度、曲线卡和每年收益表的白色边框/分割线已改为暗线;`目标终值`、`累计收益`、`复利倍数`、`实际进度`、`年份`、`年收益`、`期末资产` 等标签统一降为灰色;收益数字继续使用首页粉色。
- `v10.7.9.127` 北极星复利明细视觉微调已完成部署和本地/线上验证:弹窗外层改弱金色边框,宽度加大并支持内部滚动,曲线下方完整显示 2026-2035 十年年份,累计收益、实际收益和每年收益统一为首页粉色。
- `v10.7.9.126` 北极星复利明细弹窗已完成部署和本地/线上验证:点击北极星目标卡片可打开 `10年复利明细`,复用当前本金、年化收益率、年限、目标终值和完成度逻辑,展示顶部三项、实际进度、账户曲线和每年收益表。
- `v10.7.9.125` 复盘和戒律列表细节对齐已完成部署和本地/线上验证:复盘日志首页正文的字号、行距和颜色与投资戒律列表一致,复盘日期/情绪和戒律日期/置顶都改为详情弹窗同款低饱和灰色 meta 效果。
- `v10.7.9.124` 复盘日志卡片和详情弹窗已完成部署和本地/线上验证:复盘日志标题同步投资戒律标题效果,列表改为正文优先的深色大圆角卡片,日期和情绪放在卡片底部同一行,点击复盘先打开 `复盘详情`,底部只保留修改和删除两个小号按钮;年度目标默认只展示 2 年,其余 8 年收进展开按钮。
- `v10.7.9.123` 投资戒律记录详情弹窗已完成部署和本地/线上验证:点击戒律后改为记录详情卡片,正文完整显示并支持前缀高亮,短内容保留最小展示空间,底部操作改为修改、删除、置顶/取消置顶三个小号胶囊按钮,删除重复取消按钮。
- `v10.7.9.122` 投资戒律标题行精简已完成部署和本地/线上验证:投资戒律标题继续缩小,删除标题下方数量,标题行和右侧添加按钮同排居中,标题竖条同步缩短。
- `v10.7.9.121` 投资戒律字体整体收紧已完成部署和本地/线上验证:投资戒律标题、正文、数量、添加按钮、筛选胶囊、日期、置顶和展开全文入口整体降一档字号,降低模块视觉抢占。
- `v10.7.9.120` 投资戒律低色彩重设计已完成部署和本地/线上验证:投资戒律模块改为独立标题、灰色添加按钮、彩色圆点筛选和深色大圆角卡片;390px 移动端一行完整显示 5 个筛选项;旧 emoji 等级图标不再直接渲染,置顶、展开全文和等级选择都降为低色彩。
- `v10.7.9.119` 目标页头卡和年度层级微调已完成部署和本地/线上验证:北极星头卡删除 RMB 汇率辅助文案;年目标和剩余年限说明字号缩小;年度目标进度标题缩小;年度目标年份数字进一步降字重。
- `v10.7.9.118` 目标页未开始年度降色已完成部署和本地/线上验证:北极星头卡 `设置` 按钮改为中性色;未开始年度起点/目标金额改为灰色;未开始年度起点和目标去掉括号年份;未开始年度增长目标虚线改为灰色。
- `v10.7.9.117` 目标页细节修正已完成部署和本地/线上验证:目标页不再显示首页/交易页行情失败 toast;北极星头卡目标提醒文案单独下移,`设置` 按钮保持原上移位置;年度目标年份数字缩小并降低字重。
- `v10.7.9.116` 主资产数字小数层级同步已完成部署和本地/线上验证:首页总资产、交易页总资产和资产页家庭总资产主数字同步为大整数 + 小号两位小数;北极星目标小数后缀显式保持正常字重。
- `v10.7.9.115` 北极星目标小数层级优化已完成部署和本地/线上验证:只在目标页北极星头卡大目标金额恢复两位小数,小数后缀改为小字号;年度目标、计划、实际、落后等其它金额仍保持无小数完整数字。
- `v10.7.9.114` 目标页数字密度微调已完成部署和本地/线上验证:目标页金额取消末尾两位小数,2026 本年目标卡边框改为和北极星头卡一致的弱边框,头卡 `设置` 按钮上移且离底边约 `7px`。
- `v10.7.9.113` 目标页数字对齐首页样式已完成部署和本地/线上验证:目标页金额改为首页同款完整数字和正常字重;北极星目标卡压缩到 `244px`,标题和 USD/RMB 同行,币种按钮尺寸同步首页;头部卡删除右下角半圆装饰和金色边框;年度目标区域继续外扩到 390px 视口约 `374px` 宽;实际/落后等粉色金额同步首页市场颜色体系。
- `v10.7.9.112` 目标页视觉对齐已完成部署:年度进度条微光被限制在进度条内部,不会形成整页动态竖条;北极星目标卡压回移动端紧凑高度;年度目标进度删除多余外层卡片,2026 当前年补回右侧目标/落后信息,2027/2028 未开始年度补回起点、目标、增长目标虚线和两端金额结构;年度目标和投资戒律仍使用点击记录后弹出操作面板,投资戒律保留置顶/取消置顶。
- 已按用户反馈回退 `v10.7.9.110` 全局隐藏原生滚动条方案;当前恢复上一版原生滚动与回弹手感,右侧灰白原生滚动条指示可能按系统规则短暂出现。
- 首屏加载已按用户反馈从 mini 钱袋动效回退到上一版圆环效果;线上 `/loading-mascot.png` 已返回 404。
- 设置页深色化和账户设置整理。
- 首页自选添加/编辑/排序/删除。
- 首页自选/持仓表格已收窄名称列并压缩右侧指标列,`52周跌幅` 打开首屏即可完整看到;首页 `添加自选股票`、`编辑自选股票` 和交易页 `编辑` 入口已改为正常字重。
- 首页持仓和交易页持仓分布、当日订单、全部交易记录、订单操作弹窗、编辑交易表单已同步中文股票名兜底;旧 `TSM/MSFT/NVDA` 这类代码式名称会显示 `台积电/微软/英伟达` 等。
- 中文名兜底库中 `QQQ` 和 `TQQQ` 已改为直接显示英文代码;QQQ 默认基准股票名称也同步显示英文。
- 首页头部总资产卡片已同步交易页字号/位置和正常字重;首页四大指数卡片已取消加粗;当前信号、VIX 和 CNN 保持不动。
- 添加交易新增完成后默认回到买入;页面滚到顶部继续下拉可强制刷新云端数据、汇率和已登录行情。
- 波段记录新增只写入旧账本 `trades`,不再串到正式交易记录 `stock_trades`;摊薄成本新增只写 `cost_basis_trades`;波段记录和摊薄成本提交前都有确认框和防重复提交锁。
- 摊薄成本工具已深色化并删除标题旧图标;股票切换栏尾部多余虚线 `+` 已删除;新增摊薄股票和添加摊薄交易都改为居中弹窗;弹窗标签、输入辅助文字和取消按钮已修复可见;已实现盈亏和卖出展开利润颜色对齐头部资产卡片粉色体系。
- 摊薄成本股票栏已过滤空代码,不再显示空白胶囊按钮;本地缓存和云端摊薄数据都会清洗无效 symbol;行情刷新增加请求锁,避免自动轮询和下拉刷新重复并发;Safari/PWA `Load failed` 网络错误已改为中文行情网络提示并自动消失。
- 全局下拉刷新已升级为真刷新:会先检查生产入口 HTML 的 Vite 资源指纹,发现新部署包后自动清旧缓存并切换到最新前端;摊薄成本新增/交易弹窗输入框、placeholder、日期输入和取消按钮已使用显式深色字色,避免 iOS 键盘状态发黑。
- 全局下拉刷新已增加强触发限制:只有手势从根页面顶部开始且不在输入控件或内部滚动容器内才会触发;交易页 `交易记录` 内部列表上下滑动不会再误触发顶部刷新。
- 当前股票交易记录的 `订单操作` 弹窗已改为更窄的居中尺寸,修改/删除/取消按钮高度已压缩,对齐用户参考图二的紧凑比例。
- 交易页持仓股票名称/代码点击默认打开买入;工具区 `股票设置` 已改为 `交易记录`,展示全部主交易账本记录,点击后复用当日订单弹窗修改/删除并同步数据库。
- 波段记录小程序主界面已改为深色卡片体系;标题旧图标已删除;顶部和空状态新增 `新增波段股票`;波段区域普通文字、股票代码、数字、记录行、备注和交易明细取消加粗/斜体;已完成波段默认收进 `已完成` 折叠区。
- 波段记录整体字号和留白继续收紧;进行中绿色状态点恢复闪烁;进行中/已完成波段移除 `#1` 等无意义编号;波段和正式交易表单缺字段/非法数值提示改为应用内自定义弹窗;开发准则新增非必要不使用浏览器/系统原生交互控件。
- 波段记录标题、股票代码、股票名称、统计卡、明细和整体框架继续压缩;新增波段记录弹窗恢复 `波段备注/计划`;新增波段后备注写入 `wave_notes`;进行中和已完成波段备注支持编辑和一键清除;顶部 `已完成` 统计卡可展开已完成波段列表。
- 顶部 `已完成` 统计卡改为独立归类视图;HOOD 这类已完成股票会进入已完成分类,不再压在股票卡底部;进行中列表只显示仍在持有的波段;波段记录字号回到交易页资料卡片相邻档位。
- 旧自选/持仓/交易记录中 `name=TSM` 这类代码式名称会用中英对照表兜底显示 `台积电` 等中文名。
- 新用户自选默认空。
- 自选和持仓逻辑拆清。
- 交易主账本持仓和累计收益率修复。
- 交易页添加/修改交易弹层改为深色居中 UI,买入/卖出选中态为整块红色/绿色填充,未选灰色;普通输入框取消明显边框,日期框已加防溢出约束;弹层打开时锁定背景页面滚动。
- 交易页持仓盈亏当前浮盈口径修正,当日盈亏首屏显示恢复,持仓盈亏正号恢复,持仓盈亏和占比间距修正;持仓分布、当日订单、美股、数字、持仓盈亏和个股盈亏已改为正常字重,当日订单支持点击记录后在居中弹窗修改/删除;订单操作弹窗股票中文名和取消按钮已改为清晰可见。
- BTC 单币种实时行情 relay。
- PWA 图标替换和 iOS 白边修复。
- 找回密码回跳修复,Supabase Site URL 已改生产域名。
- 首页四大指数卡和交易页持仓分布移动端布局优化。

当前优先事项:
1. 完成其余用户表的 RLS metadata 审计;`swing_waves` 双用户隔离 smoke 已完成。
2. 拆 `src/App.jsx` 和 `src/lib/db.js`。
3. 继续拆 quote provider。
4. 增加登录、忘记密码、自选、交易收益率的端到端 smoke。
```
