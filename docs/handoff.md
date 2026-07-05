# boduan-tracker 产品交接文档

更新时间: 2026-07-05 Asia/Shanghai

这份文档给下一位接手 `boduan-tracker` 的工程师或 AI 代理使用。先按这里同步状态,再看开发日志和代码。

## 1. 当前状态

- 仓库: `chenshuai1190-dotcom/boduan-tracker`
- 生产地址: `https://boduan-tracker.vercel.app`
- 当前产品基准提交: `858869a8442e6d575c858a5f5c792971161e26cf` (`v10.7.9.107`)
- 最近应用代码提交: `858869a8442e6d575c858a5f5c792971161e26cf`
- 最近文档/配置记录提交: 本文件所在最新提交
- 设置页版本: `v10.7.9.107`
- Vercel 最新运行时部署: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/7gBtGXLyXR2D4Hd85zHxYhwUNhHY`
- Vercel 部署记录: `v10.7.9.107` runtime commit `858869a8442e6d575c858a5f5c792971161e26cf`;production `GET https://boduan-tracker.vercel.app/?v=858869a-runtime` HTTP 200
- Supabase 项目 ref: `ykgotnmtqcqdzqtrlayq`
- 交接文档刷新提交: 本文件所在最新提交,接手后以 `git log -1 --oneline` 为准。

产品现在可用。最近一轮重点是首页自选/持仓体验、交易账本口径、BTC 独立实时行情、PWA 图标、找回密码链路、Supabase Auth URL 配置,`v10.7.9.93` 的全局下拉刷新、添加交易默认买入、波段/摊薄工具账本边界修复和防重复提交确认,`v10.7.9.94` 的波段记录小程序深色 UI 融入,`v10.7.9.95` 的波段记录字号收紧、状态点闪烁和自定义提示弹窗,`v10.7.9.96` 的波段记录继续压缩、备注入口恢复和已完成波段展开优化,`v10.7.9.97` 已完成波段独立归类视图和字号回调,`v10.7.9.98` 摊薄成本工具深色化和标题旧图标移除,`v10.7.9.99` 摊薄成本尾部加号、盈亏色、弹窗居中和文字可见性修复,`v10.7.9.100` 摊薄成本空股票标签过滤、行情拉取提示优化和交易记录入口,`v10.7.9.101` 下拉真刷新和摊薄交易输入显色修复,`v10.7.9.102` 下拉刷新手势触发强限制,`v10.7.9.103` 订单操作弹窗尺寸调整,`v10.7.9.104` 首页持仓和交易记录中文名同步,`v10.7.9.105` QQQ/TQQQ 英文显示修正,`v10.7.9.106` 资产模块深色 UI 重设计,以及 `v10.7.9.107` 资产页深色外壳、字号按钮和走势图动效修复。

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

`boduan-tracker` 是移动端优先的投资追踪 PWA,当前品牌显示为 X MONEY。核心使用场景:

- 首页账户看板: 总资产、今日盈亏、累计盈亏、当前信号、市场指标、VIX/CNN 恐慌指标。
- 自选股票: 用户主动添加的 watchlist,新用户默认空,支持添加、编辑、置顶、排序、删除。
- 持仓视图: 来自交易主账本的真实持仓,不是自选列表。
- 交易页: 手动买入/卖出主账本,派生当前持仓、有效成本、浮动盈亏、累计收益率。
- 资产/分析页: 深色家庭总资产卡、12 个月走势、我/老婆账户分组、月度余额填报和新增账户。
- 目标页: 投资目标、复盘和纪律相关功能。
- 设置页: 账户设置、修改密码、更新日志、数据维护。
- PWA: 支持保存到手机桌面,当前图标为黑金 K 线箭头图标,已修复 iOS 白边。

## 4. 技术栈

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + Postgres
- Vercel Serverless Functions
- `/api/quote`: 已登录行情代理
- `/api/fx`: 已登录汇率接口
- `/api/btc-realtime`: 已登录 BTC WebSocket relay
- 市场数据: EODHD、Yahoo Finance、CNN Fear & Greed、NASDAQ calendar
- 测试: Node built-in test runner,命令为 `npm test`

本机 Node 路径:

```bash
PATH="$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
```
## 5. 环境变量和安全边界

前端公开变量:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

服务端私密变量:

- `EODHD_API_KEY`
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
- `npm run verify:rls:rest` 当前检查 13 张用户表匿名 REST 暴露,结果应为 `visibleRows=0`。
- RLS REST 探针不等于 metadata 级 RLS 审计;metadata 还需要 Supabase SQL/admin 权限确认。

## 6. 开发和部署流程

开始前:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
npm ci
```

每次代码、配置、部署、安全或文档改动,至少跑:

```bash
npm test
npm run build
npm audit
git diff --check
```

生产敏感改动还要跑:

```bash
npm run verify:rls:rest
curl -i 'https://boduan-tracker.vercel.app/api/quote?symbols=VIX'
```

默认收尾:

1. 更新 `docs/development-log.md`。
2. 用户可见更新同步 `src/tabs/SettingsTab.jsx` 更新日志和版本。
3. 提交并推送 GitHub `main`。
4. 等 Vercel 自动部署成功。
5. 做线上验证。
6. 把部署和线上验证写回 `docs/development-log.md`。

推送注意:

- 如果 `git push origin main` 走 HTTPS 时报 `could not read Username for 'https://github.com': Device not configured`,不要误判为仓库无权限。
- 本机该项目已有 SSH key `~/.ssh/boduan_tracker_github`;用 `GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes"` 推送到 `git@github.com:chenshuai1190-dotcom/boduan-tracker.git`。

## 7. 当前线上验证证据

最近完整验证记录:

- `npm test`: pass,61 tests。
- `npm run build`: pass。
- `npm audit`: pass,0 vulnerabilities。
- `git diff --check`: pass。
- 生产未登录 `GET /api/quote?symbols=VIX`: HTTP 401。
- `v10.7.9.107` runtime 已推送并部署成功;runtime commit `858869a8442e6d575c858a5f5c792971161e26cf`, Vercel target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/7gBtGXLyXR2D4Hd85zHxYhwUNhHY`。

已验证生产 runtime chunks:

- 本轮本地构建 runtime chunks: `/assets/index-CTmL2_1m.css`, `/assets/index-BNvTa11o.js`, `/assets/AnalysisTab-ColUmi0M.js`, `/assets/SettingsTab-BYl2JxUY.js`, `/assets/HomeTab-MC5TFijP.js`, `/assets/TradesTab-GTTATZ2u.js`, `/assets/App-DjWmCN5J.js`。
- 生产 entry chunks: `/assets/index-PPuvOsBx.js`, `/assets/rolldown-runtime-QTnfLwEv.js`, `/assets/react-vendor-0zZBvgmv.js`, `/assets/index-CTmL2_1m.css`。
- 生产 runtime chunks: `/assets/App-CkaF-E5i.js`, `/assets/AnalysisTab-ColUmi0M.js`, `/assets/HomeTab-MC5TFijP.js`, `/assets/TradesTab-GTTATZ2u.js`, `/assets/SettingsTab-BYl2JxUY.js`, `/assets/ReviewTab-Bb_Mto4f.js`, `/assets/supabase-D8jmctq6.js`。

关键 marker:

- 生产 `App-CkaF-E5i.js` 包含 `QQQ` 和 `TQQQ` 英文显示映射,且不包含旧映射片段 `QQQ:\`纳斯达克100\`` / `TQQQ:\`3倍纳指\``。
- 生产 `App-CkaF-E5i.js` 包含资产页深色壳条件 `analysis`,资产页外层使用 `bg-[#05070b]`。
- 生产 `AnalysisTab-ColUmi0M.js` 包含资产模块深色 UI、`assetDrawLine` / `assetAreaFadeIn` / `assetDotPop` 走势图动效和自动汇率换算逻辑,且不包含旧手动汇率控件文案 `美元汇率` / `港币汇率`。
- 生产 entry/App/Analysis/Settings chunks 不包含 `DevVisualPreview`;开发态资产视觉预览只在 `import.meta.env.DEV` 且缺少 Supabase 配置时启用。
- 生产 `SettingsTab-BYl2JxUY.js` 包含 `v10.7.9.107` 和 `修复资产页深色视觉和本地预览`。
- 生产 runtime chunks 不包含旧工具可见标签 `股票设置</span>`。
- 生产 `/api/quote?symbols=VIX` 未登录返回 `401`。

## 8. 最近完成的产品改动

### 资产模块

- `v10.7.9.107`: 资产页纳入首页同款深色外层壳和深色底部导航;家庭总资产卡、三列指标、走势图、主按钮和账户列表字号/间距重新收紧;`填月度余额` 和 `新增账户` 主按钮恢复清晰显示;12 个月走势恢复线条绘制、面积淡入和点位弹出动效;本地开发缺少 Supabase 配置时提供只读资产视觉预览,用于手机宽度调试,不连接真实数据库。
- `v10.7.9.106`: 资产/分析页按用户新设计图改为深色版本;家庭总资产卡、12 个月走势卡、我/老婆账户列表、填月度余额弹窗和新增账户弹窗统一为当前深色风格;账户类型图标改用 lucide 线性图标体系,删除旧 emoji 展示;底部手动 USD/HKD 汇率输入删除,继续使用现有 `/api/fx` 每日自动汇率换算;账户、月度快照、删除和汇率数据逻辑不变。

### 摊薄成本工具

- `v10.7.9.101`: 全局下拉刷新会先拉取最新入口 HTML 并比对 Vite `/assets` 指纹,发现 Vercel 新包后清理旧 App/Logo 缓存、注销残留 Service Worker,再通过带时间戳的 `window.location.replace` 自动切换到最新前端包;摊薄成本新增股票和添加交易弹窗的标签、placeholder、输入内容、日期输入、取消按钮和未选买卖按钮改用显式深色主题色,修复 iOS 键盘状态文字发黑。
- `v10.7.9.100`: 摊薄成本股票栏过滤空股票代码,不再显示空白胶囊按钮;本地缓存和云端 `cost_basis_trades` 读取都会清洗无效 symbol,云端写入/整只删除也会拒绝空 symbol;行情刷新增加请求锁,避免自动轮询和下拉刷新重复并发;Safari/PWA `Load failed` 网络层错误改为中文 `行情网络请求失败,已保留现有数据` 并自动消失;持仓股票名称/代码点击默认打开买入;工具区 `股票设置` 改为 `交易记录`,可查看全部主交易记录并复用当日订单弹窗修改/删除。
- `v10.7.9.99`: 摊薄成本股票切换栏删除尾部多余虚线 `+`;实际成本涨幅、已实现盈亏和卖出展开明细利润颜色改为和头部资产卡片同源的 `pnlClass`;新增摊薄股票和添加摊薄交易弹窗改为居中弹窗;修复弹窗标签、取消按钮和输入辅助文字因非标准透明度 class 在 iOS 上变黑的问题。
- `v10.7.9.98`: 摊薄成本工具改为深色版本;标题删除旧图标,只保留纯文字 `摊薄成本`;主成本卡、累计投入、已实现盈亏、交易记录、新增股票和添加摊薄交易弹窗统一为黑色风格;辅助图标改用现有 lucide 线性图标体系;摊薄成本提交校验和失败提示改为应用内确认弹窗;数据仍只写独立 `cost_basis_trades`,不影响正式交易账本和波段记录。

### 波段记录小程序 UI

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
- `src/tabs/HomeTab.jsx`: 首页、市场卡、自选/持仓列表 UI。
- `src/tabs/TradesTab.jsx`: 交易页主账本、持仓分布、工具箱。
- `src/tabs/AnalysisTab.jsx`: 资产/分析。
- `src/tabs/ReviewTab.jsx`: 目标/复盘。
- `src/tabs/SettingsTab.jsx`: 设置页、账户设置、更新日志。

数据:

- `src/lib/db.js`: Supabase CRUD 层,仍偏大。
- `src/lib/dbGuards.js`: 删除作用域保护。
- `src/lib/investmentSummary.js`: 交易主账本派生持仓、成本和收益率。
- `src/lib/btcRealtime.js`: BTC tick 解析和首页市场卡合并逻辑。

服务端:

- `api/quote.js`: 已登录行情代理入口。
- `server/quote/*`: quote API 的 auth、symbols、provider dispatch、response、provider 实现。
- `api/fx.js`: 汇率接口。
- `api/btc-realtime.js`: BTC WebSocket relay 入口。
- `server/realtime/*`: BTC relay、WebSocket auth、EODHD 上游连接。

数据库和安全:

- `supabase/rls.sql`: RLS 策略。
- `supabase/stock_trades.sql`: 主交易账本表。
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
- 波段记录入口只能写 `trades`,不能复用正式主交易保存路径写入 `stock_trades`。
- 摊薄成本工具只能写 `cost_basis_trades`,不能并入正式主账本或波段记录。
- 波段记录和摊薄成本新增提交前必须弹确认框,确认文案要说明写入范围,并用提交锁防止重复写入。
- `deriveInvestmentSummary` 是首页和交易页资产/持仓口径来源。
- 卖出按时间正序用移动均价结转成本。
- 累计收益率分母是当前实际持仓成本,不是历史总买入额。
- `costBasisData` 是独立摊薄工具,不要并入主账本。

首页:

- 当前信号保持紧凑卡片,不要默认展开策略详情。
- 三大指数和 BTC 市场卡保持四格布局。
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
- `src/lib/db.js` 仍然偏宽,缺少 schema validation 和迁移检查。
- `server/quote/providers/eodhd.js` 仍然较大,后续应该拆成 stock、fundamentals、calendar/shared parser。
- 金融计算虽然已有核心测试,但还应继续纯函数化并覆盖更多边界:拆股、空数据、异常卖出、多账户、过期行情。
- RLS 目前只有 REST 匿名探针;metadata 层还需要 SQL/admin 权限复核 `relrowsecurity=true` 和 policy。
- 生产忘记密码链路已修复配置,但建议下一次操作时发送一封新 reset email 做完整端到端 smoke;不要复用旧邮件链接。

## 12. 建议下一步

优先级 1: 完成 RLS metadata 审计。

- 用 Supabase SQL/admin 权限确认所有用户表 `relrowsecurity=true`。
- 检查 policies 均按 `auth.uid() = user_id` 隔离。
- 继续保留 `npm run verify:rls:rest` 作为外部暴露探针。

优先级 2: 拆 `App.jsx` 和 `db.js`。

- 建 `src/features/*`。
- 把自选、交易、行情、设置相关状态拆出 hooks。
- 让 `App.jsx` 只保留 shell 和 orchestrator。

优先级 3: 拆 quote provider。

- 继续拆 `server/quote/providers/eodhd.js`。
- 补 EODHD 失败、Yahoo fallback、calendar 部分失败的测试。
- 保持 response-shape tests 不回退。

优先级 4: 加完整视觉/流程 smoke。

- 登录/忘记密码/设置新密码。
- 首页自选添加、编辑、删除。
- 交易买入/卖出后首页和交易页收益率一致。
- PWA icon manifest 和 apple-touch-icon。

## 13. 下一个人接手后的第一步

复制执行:

```bash
PATH="$HOME/.local/opt/node-v22.23.1-darwin-arm64/bin:$PATH"
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
npm ci
npm test
npm run build
npm audit
npm run verify:rls:rest
curl -i 'https://boduan-tracker.vercel.app/api/quote?symbols=VIX'
```

确认:

- 工作区干净。
- 设置页显示 `v10.7.9.107` 或更新版本。
- `/api/quote?symbols=VIX` 未登录返回 `401`。
- Supabase Auth URL Configuration 仍是生产域名。
- Reset password 模板仍使用 `{{ .ConfirmationURL }}`。
- HTTPS push 缺 GitHub 凭证时报 `could not read Username` 时,使用项目 SSH key `~/.ssh/boduan_tracker_github` 推送。

## 14. 交接给下一位同事的话

可以直接转发:

```markdown
你接手的是 `boduan-tracker`。

仓库: `chenshuai1190-dotcom/boduan-tracker`
生产地址: https://boduan-tracker.vercel.app
当前产品基准提交: `858869a8442e6d575c858a5f5c792971161e26cf` (`v10.7.9.107`)
最近应用代码提交: `858869a8442e6d575c858a5f5c792971161e26cf`
设置页版本: `v10.7.9.107`
Vercel 最新运行时部署: success, target `https://vercel.com/chenshuai1190-7580s-projects/boduan-tracker/7gBtGXLyXR2D4Hd85zHxYhwUNhHY`
部署记录: `v10.7.9.107` runtime commit `858869a8442e6d575c858a5f5c792971161e26cf`;production `GET https://boduan-tracker.vercel.app/?v=858869a-runtime` HTTP 200

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
- 不要提交任何 token、`.env`、Supabase service role key。
- 不要添加 `VITE_EODHD_TOKEN`。
- 不要关闭 `/api/quote` 鉴权。
- HTTPS push 缺凭证时报 `could not read Username` 时,不要误判为无权限;使用本机项目 SSH key `~/.ssh/boduan_tracker_github`。
- 部署前至少跑 `npm test`, `npm run build`, `npm audit`, `git diff --check`。
- 生产敏感改动还要跑 `npm run verify:rls:rest`,并确认 `/api/quote?symbols=VIX` 未登录返回 `401`。

当前已完成:
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
1. 用 Supabase SQL/admin 权限做 RLS metadata 审计。
2. 拆 `src/App.jsx` 和 `src/lib/db.js`。
3. 继续拆 quote provider。
4. 增加登录、忘记密码、自选、交易收益率的端到端 smoke。
```
