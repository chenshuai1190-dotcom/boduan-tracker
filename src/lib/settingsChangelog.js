import { CURRENT_RELEASE } from './releaseMeta.js';

export const settingsChangelog = [
  {
    ver: CURRENT_RELEASE.version, date: CURRENT_RELEASE.date, latest: true,
    items: [
      '🎨 资产录入弹窗进一步统一无外边框层次',
      '  - “新增账户”和“填月度余额”弹窗隐藏最外层装饰线及内容区冗余内框，同时保留原尺寸、圆角、背景、阴影和滚动',
      '  - 输入框、类型与币种选项、月份切换、关闭、取消和保存按钮继续保留必要的交互边界',
      '  - 账户数据、余额草稿、月度快照、保存删除和数据库逻辑均未改变',
    ],
    itemsEn: [
      '🎨 Asset entry dialogs now share a cleaner borderless hierarchy',
      '  - Add Account and Fill Monthly Balance hide the decorative panel outline and redundant content outline while preserving sizing, rounding, surfaces, shadows, and scrolling',
      '  - Inputs, account type and currency choices, month navigation, close, cancel, and save controls retain their necessary interaction boundaries',
      '  - Account data, balance drafts, monthly snapshots, save and delete behavior, and database logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.460', date: '2026-08-14',
    items: [
      '🎨 首页自选操作与交易编辑入口统一为中性无框样式',
      '  - 首页“添加自选股票”和“编辑自选股票”取消金黄色强调与最外层描边，统一使用中性白色文字和低对比底色',
      '  - 交易页持仓区“编辑”同步取消金黄色、金色阴影和外框，保留原内边距、圆角、图标及点击入口',
      '  - 自选列表、交易弹窗、持仓数据、交易账本和保存逻辑均未改变',
    ],
    itemsEn: [
      '🎨 Home watchlist actions and the Trading edit entry now share a neutral borderless style',
      '  - Add Watchlist Stock and Edit Watchlist remove gold emphasis and outer outlines, using neutral white text on a low-contrast surface',
      '  - The Positions edit entry also removes its gold color, glow, and outline while preserving its padding, rounding, icon, and action',
      '  - Watchlist data, trade dialogs, positions, trading ledgers, and saving behavior are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.459', date: '2026-08-14',
    items: [
      '🎨 资产页操作按钮与账户条目进一步取消外描边',
      '  - “填月度余额”和“新增账户”移除最外层描边，保留原有中性底色、圆角、点击高度和交互反馈',
      '  - 账户条目同步移除可见外框，同时保留账户类型图标边框、名称左侧分隔线、背景和行间距',
      '  - 账户数据、资产汇总、币种换算、月度余额、编辑保存和数据库逻辑均未改变',
    ],
    itemsEn: [
      '🎨 Asset actions and account rows now use a cleaner borderless treatment',
      '  - Fill Monthly Balance and Add Account remove their outer outlines while retaining the neutral surface, rounding, tap height, and interaction feedback',
      '  - Account rows also remove their visible outer outlines while preserving account-type icon borders, the name divider, background, and row spacing',
      '  - Account data, asset aggregation, currency conversion, monthly balances, editing, saving, and database behavior are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.458', date: '2026-08-14',
    items: [
      '✨ 资产首页月份详情支持触碰外部自动收起',
      '  - 点击12个月走势图中的月份后，触碰图表以外的任意区域会立即关闭该月份详情',
      '  - 图表内部仍可直接切换其他月份，页面卸载时同步清理监听，避免交互状态残留',
      '  - 图表样式、资产汇总、汇率折算、月度余额、保存和数据库口径均未改变',
    ],
    itemsEn: [
      '✨ Monthly details on the Assets overview now dismiss when you tap outside the chart',
      '  - After selecting a month on the 12-month chart, tapping anywhere outside the chart immediately closes its detail',
      '  - Other months remain directly selectable inside the chart, and the listener is cleaned up when the page unmounts',
      '  - Chart styling, asset aggregation, FX conversion, monthly balances, saving, and database semantics are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.457', date: '2026-08-13',
    items: [
      '📈 资产首页12个月走势升级为独立页同款宽幅图表',
      '  - 首页与独立资产走势页面共享同一套图表渲染层，绘图区加宽并统一动态纵轴、弱网格和平滑青绿色曲线',
      '  - 首页同步克制的渐变面积、最高点标记和金色最新点，同时保留原有标题、月份点击详情及最低/最高/区间摘要',
      '  - 独立页面的拖动选点、触碰外部关闭及缺失月份断线行为保持不变；资产汇总、汇率折算、月度余额、保存和数据库口径均未改变',
    ],
    itemsEn: [
      '📈 The Assets overview now uses the same wide 12-month chart design as the standalone page',
      '  - The overview and standalone asset-trend page share one chart renderer with a wider plot, dynamic value scale, subtle grid, and smooth teal curve',
      '  - The overview adopts the restrained area gradient, peak marker, and gold latest point while preserving its title, month-tap detail, and Low/High/Range summary',
      '  - Standalone drag selection, outside-touch dismissal, and missing-month gaps remain unchanged; asset aggregation, FX conversion, monthly balances, saving, and database semantics are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.456', date: '2026-08-13',
    items: [
      '✨ 首页、交易与资产头部进一步简化分隔层次',
      '  - 首页和交易页的“今日盈亏 / 累计盈亏 / 融资负债”取消两条列间竖线，保留上方横线和原三列布局',
      '  - 资产页的“较上月 / 年初至今 / 近一年”取消列间竖线，保留原列宽、间距与数值对齐',
      '  - 12个月走势下方的“最低 / 最高 / 区间”取消列间竖线，同时保留上方横线',
      '  - 金额、百分比、币种、点击入口、资产计算和交易账本逻辑均保持不变',
    ],
    itemsEn: [
      '✨ Home, Trading, and Assets headers now use a lighter divider hierarchy',
      '  - Home and Trading remove the two vertical dividers between Today P&L, Total P&L, and Margin Debt while preserving the top divider and three-column layout',
      '  - Assets removes vertical dividers between Month-over-Month, Year-to-Date, and One Year while preserving column widths, spacing, and number alignment',
      '  - The Low, High, and Range summary below the 12-month chart removes its vertical dividers while keeping the divider above it',
      '  - Amounts, percentages, currencies, navigation, asset calculations, and trading-ledger behavior are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.455', date: '2026-08-13',
    items: [
      '✨ 年度目标卡片层次与信息进一步精简',
      '  - 当前年度和后续年份计划卡同步顶部6%、左右3%和底部1%的渐弱内高光，同时继续隐藏外轮廓',
      '  - 北极星头部移除装饰星点及闪烁动画，保留进度条动画与原有操作',
      '  - 当前年度删除重复的“计划→实际”金额模块，并隐藏“目标/实现/落后”摘要外框',
      '  - 年度数据、百分比计算、进度条、编辑入口、弹窗和保存逻辑均保持不变',
    ],
    itemsEn: [
      '✨ Annual Goal cards now use a clearer, lighter information hierarchy',
      '  - Current and future year cards add stepped 6% top, 3% side, and 1% bottom inner highlights while keeping their outer outlines hidden',
      '  - The Polaris header removes decorative star dots and their twinkling animation while preserving progress animation and actions',
      '  - The current-year card removes the duplicate Plan-to-Actual amount block and hides the Target/Achieved/Gap summary outline',
      '  - Annual data, percentage calculations, progress bars, edit entry points, dialogs, and saving logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.454', date: '2026-08-13',
    items: [
      '🎨 目标页统一无外边框层次',
      '  - 北极星目标头部隐藏外轮廓，并同步顶部6%、左右3%和底部1%的渐弱内高光',
      '  - 当前年度、未来年度及投资心得和复盘日志的空态卡片统一隐藏最外层边框',
      '  - 年度内部信息框、心得和复盘记录行、操作按钮、弹窗及目标数据、计算和保存逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 The Goals page now shares a borderless visual hierarchy',
      '  - The Polaris Goal header hides its outer outline and adds stepped 6% top, 3% side, and 1% bottom inner highlights',
      '  - Current-year, future-year, and empty Insight and Review cards now hide their outer outlines',
      '  - Annual inner panels, Insight and Review rows, action buttons, dialogs, goal data, calculations, and saving logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.453', date: '2026-08-13',
    items: [
      '🎨 资产总览统一无外边框层次',
      '  - 家庭总资产头部隐藏外轮廓，并同步顶部6%、左右3%和底部1%的渐弱内高光',
      '  - 总览中的12个月走势、无账户空态和家庭成员账户分组卡统一隐藏最外层边框',
      '  - 独立资产走势页面、账户行、操作按钮、内部结构线、弹窗及资产数据和保存逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 The Assets overview now shares a borderless visual hierarchy',
      '  - The Family Net Worth header hides its outer outline and adds stepped 6% top, 3% side, and 1% bottom inner highlights',
      '  - The overview trend, empty state, and family-member account groups now hide their outer card outlines',
      '  - The standalone asset-trend page, account rows, action buttons, internal dividers, dialogs, asset data, and saving logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.452', date: '2026-08-13',
    items: [
      '✨ 交易页快捷入口与持仓卡片进一步轻量化',
      '  - 波段记录、社区比赛、交易记录和全部功能取消列间竖线，保留原有等宽布局与点击区域',
      '  - 持仓分布与当日订单卡片同步顶部6%、左右3%和底部1%的渐弱内高光',
      '  - 卡片背景、圆角、内部表格分隔、交互及交易账本和资产逻辑均保持不变',
    ],
    itemsEn: [
      '✨ Trading quick actions and the holdings card now feel lighter',
      '  - Swing Log, Community, Trade Log, and All Tools remove their vertical column dividers while preserving equal-width layout and tap areas',
      '  - The Positions and Today’s Orders card now uses stepped 6% top, 3% side, and 1% bottom inner highlights',
      '  - Card surfaces, rounding, internal table dividers, interactions, trading ledgers, and asset logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.451', date: '2026-08-13',
    items: [
      '🎨 交易页信息模块取消外边框',
      '  - 净资产、快捷功能、交易记录、持仓/当日订单及交易辅助模块统一隐藏卡片外轮廓',
      '  - 交易页头部同步首页的顶部6%、左右3%和底部1%渐弱内高光',
      '  - 卡片背景、圆角、内部结构线、按钮、输入框、弹窗及交易账本和资产逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 Trading information modules now use borderless outer shells',
      '  - Net assets, quick actions, trade records, positions/today’s orders, and trading utility modules now hide their outer card outlines',
      '  - The Trading header now matches Home with a 6% top, 3% side, and 1% bottom stepped inner highlight',
      '  - Card surfaces, rounding, internal dividers, buttons, inputs, dialogs, trading ledgers, and asset logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.450', date: '2026-08-13',
    items: [
      '✨ 首页头部卡片完善四向内高光',
      '  - 净资产卡片保持顶部6%高光，并为左右两侧增加3%、底部增加1%的渐弱内高光',
      '  - 外边框继续保持隐藏，四向亮度按顶部、侧边、底部逐级减弱，强化黑色卡片的完整层次',
      '  - 其他首页模块、内部结构线、布局、金额和业务逻辑均保持不变',
    ],
    itemsEn: [
      '✨ The Home header now has balanced four-edge inner highlights',
      '  - The Net Assets card keeps its 6% top highlight and adds 3% highlights on both sides plus a 1% bottom highlight',
      '  - The outer outline remains hidden while brightness steps down from top to sides to bottom for a more complete black-card depth',
      '  - Other Home modules, internal dividers, layout, amounts, and business logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.449', date: '2026-08-13',
    items: [
      '🎨 首页信息模块取消外边框',
      '  - 净资产、当前信号、行情、市场指标、自选/持仓、财报日历和MA200监控统一隐藏卡片外轮廓',
      '  - 卡片背景、圆角、顶部层次、内部结构线及币种、状态和操作控件边框保持不变',
      '  - 本次仅调整首页视觉；布局、行情、资产金额、信号和业务逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 Home information modules now use borderless outer shells',
      '  - Net assets, current signal, market tiles, sentiment indicators, watchlist/positions, earnings, and the MA200 monitor now hide their outer card outlines',
      '  - Card surfaces, rounding, top-layer highlights, internal dividers, and currency, status, and action-control borders remain unchanged',
      '  - This release changes Home visuals only; layout, quotes, asset amounts, signals, and business logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.448', date: '2026-08-13',
    items: [
      '📈 股票趋势标题代码与文字完整统一',
      '  - 股票代码和“股票趋势”现在共同使用个股收益详情顶部股票代码的字号、字重和柔和白色',
      '  - 取消股票代码原有的小号金色样式，标题整行保持同一视觉层级',
      '  - 股票数据、图表、指标、返回入口和页面布局逻辑保持不变',
    ],
    itemsEn: [
      '📈 The complete Stock Trend heading now shares one title style',
      '  - The symbol and Stock Detail text now both use the size, weight, and soft-white tone of the stock-code heading above Stock P&L Detail',
      '  - The symbol no longer keeps its previous small gold treatment, so the full heading has one visual hierarchy',
      '  - Stock data, charts, indicators, navigation, and page-layout behavior are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.447', date: '2026-08-13',
    items: [
      '🎨 资产月度入口统一中性视觉',
      '  - 家庭总资产右上角的月份入口取消金黄色文字，改为系统柔和白色',
      '  - “填月度余额”取消黄色文字、边框和底色，与“新增账户”使用同一套中性按钮样式',
      '  - 本次仅调整视觉；月度余额、缺失月份计算、账户走势、保存和数据库逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 Asset month entries now share the neutral system style',
      '  - The month entry in Family Net Worth changes from gold to the system soft-white tone',
      '  - Add Monthly Balance removes its gold text, border, and fill to match the neutral Add Account button',
      '  - This release changes visuals only; monthly balances, missing-month calculations, account trends, saving, and database behavior are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.446', date: '2026-08-13',
    items: [
      '🎯 年度目标展开入口去重',
      '  - 删除年度目标列表底部带黄色虚线边框的“展开剩余 X 年”重复按钮',
      '  - 保留标题右侧的展开与收起入口，年度数据、卡片和计算逻辑保持不变',
    ],
    itemsEn: [
      '🎯 The Annual Goals expand control is no longer duplicated',
      '  - The repeated full-width “Expand remaining X years” button with the yellow dashed border is removed',
      '  - The title-row expand and collapse control remains, with annual data, cards, and calculations unchanged',
    ],
  },
  {
    ver: 'v10.7.9.445', date: '2026-08-13',
    items: [
      '📈 股票趋势标题统一页面视觉层级',
      '  - “股票趋势”的字号、字重和柔和白色同步个股收益详情页面上方的股票代码标题',
      '  - 股票代码、返回按钮、页面布局、趋势数据和交互逻辑保持不变',
    ],
    itemsEn: [
      '📈 The Stock Trend title now follows the shared page-heading hierarchy',
      '  - Its size, weight, and soft-white tone now match the stock-code heading above Stock P&L Detail',
      '  - The symbol, back button, page layout, trend data, and interactions are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.444', date: '2026-08-13',
    items: [
      '🎯 北极星目标同步柔和白色资产数字',
      '  - 北极星目标主金额及两位小数由金色改为与首页和资产页一致的柔和白色',
      '  - 取消“北极星目标”标题前的星星图标，保留卡片背景中的轻微星点动效',
      '  - 目标进度条、完成度、币种选中态、数据和计算逻辑保持不变',
    ],
    itemsEn: [
      '🎯 The Polaris goal now follows the soft-white asset-number style',
      '  - The Polaris headline amount and its two-decimal suffix change from gold to the same soft white used on Home and Assets',
      '  - The leading star icon is removed from the Polaris Goal title while the subtle background star animation remains',
      '  - Goal progress, completion, selected currency, data, and calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.443', date: '2026-08-13',
    items: [
      '🎨 全站常驻模块统一为系统中性黑色',
      '  - 交易、资产、目标、设置及股票、收益、比赛、财报和波段详情的常驻卡片统一为主黑与抬升黑两级表面',
      '  - 首页与交易净资产、家庭总资产及当前实际资产统一为柔和白色；目标、选中、警示和市场涨跌仍保留原有语义色',
      '  - 设置头像卡保留蓝色径向底光；弹窗、浮层、图表标记、布局和业务逻辑不变',
    ],
    itemsEn: [
      '🎨 Persistent modules across the app now share the neutral system-black palette',
      '  - Trading, Assets, Goals, Settings, and persistent stock, P&L, competition, earnings, and swing-detail cards now use consistent primary and raised black surfaces',
      '  - Home and Trading net assets, family assets, and current actual assets now share a soft white tone, while goals, selections, warnings, and market movements retain their semantic colors',
      '  - The Settings profile card keeps its blue radial glow; dialogs, overlays, chart markers, layout, and business logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.442', date: '2026-08-13',
    items: [
      '🎨 首页卡片统一为系统黑色并突出净资产',
      '  - 首页资产、信号、行情、市场指标、自选、财报日历和MA200监控统一使用中性黑色层级，减少原有藏青色倾向',
      '  - 净资产主数字由金色改为与12个月资产走势一致的白色；金色继续保留给币种选中和当前Tab',
      '  - 本次仅调整首页视觉配色；布局、金额计算、行情数据和业务逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 Home cards now use the system black palette with a clearer net-assets headline',
      '  - Assets, signals, market tiles, sentiment indicators, watchlists, earnings, and the MA200 monitor now share neutral black surface levels without the previous navy cast',
      '  - The net-assets headline changes from gold to the same white used by the 12-month asset trend, while gold remains for the selected currency and current tab',
      '  - This release changes Home visuals only; layout, calculations, market data, and business logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.441', date: '2026-08-13',
    items: [
      '📐 12个月资产走势完善图表边距与月度编辑交互',
      '  - 图表坐标、网格、曲线和数据点统一收回页面边界，在不同iPhone宽度下与下方摘要及月度明细卡片对齐',
      '  - 月度明细仅右侧箭头进入对应月份余额编辑；关闭、取消或保存后继续停留在当前资产走势页面',
      '  - 点击图表仍可查看或切换月份，触碰图表外区域会自动收起提示；资产快照、金额计算、保存及数据库口径保持不变',
    ],
    itemsEn: [
      '📐 The 12-month asset trend now has aligned chart spacing and clearer monthly editing interactions',
      '  - Axis labels, grid lines, curves, and points now stay within the page bounds and align with the summary and monthly-detail cards across iPhone widths',
      '  - Only a monthly row’s trailing arrow opens that exact month’s balance editor; closing, cancelling, or saving returns to the same asset-trend page',
      '  - Chart taps still reveal or switch months, while touching outside dismisses the callout; asset snapshots, calculations, saving, and database semantics are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.440', date: '2026-08-13',
    items: [
      '📈 12个月资产走势升级为资产Tab内的独立宽版页面',
      '  - 取消弹窗、遮罩和整页外框，保留底部五个Tab及资产选中状态；返回键和资产Tab均可回到资产总览',
      '  - 图表、坐标和月度明细按独立页面同步加宽，纵轴与当前资产左对齐，最新月份与环比箭头右对齐',
      '  - 最高与当前金额不再默认悬浮显示，点击或拖动图表时才显示所选月份；资产快照、比较、保存及数据库口径保持不变',
    ],
    itemsEn: [
      '📈 The 12-month asset trend is now a wider standalone page within the Assets tab',
      '  - The dialog, overlay, and full-page outer frame are removed while all five bottom tabs remain visible with Assets selected; Back and the Assets tab both return to the overview',
      '  - The chart, axes, and monthly details expand together for the page layout, with the value axis aligned to Current Assets and the latest month aligned to the comparison arrow',
      '  - Peak and current-value callouts are hidden by default and appear only after chart interaction; asset snapshots, comparisons, saving, and database semantics are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.439', date: '2026-08-13',
    items: [
      '🎨 12个月资产走势统一为系统黑色并修正标题裁切',
      '  - 清除弹窗残留的蓝灰渐变，使用资产页统一黑色卡片背景；最新数据点同步改为系统金色',
      '  - 为“当前资产”标签增加iOS字形安全边距和固定行高，避免首字贴近滚动边界时被裁切',
      '  - 本次仅调整视觉样式；资产快照、金额计算、月度比较、保存和数据库逻辑均保持不变',
    ],
    itemsEn: [
      '🎨 The 12-month asset trend now uses the system black palette with corrected label clipping',
      '  - The residual blue-gray gradient is removed in favor of the asset-page black card background, and the latest point now uses the system gold accent',
      '  - The Current Assets label now has an iOS glyph safety inset and fixed line height so its first character is not clipped at the scroll boundary',
      '  - This release changes visuals only; asset snapshots, calculations, monthly comparisons, saving, and database behavior are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.438', date: '2026-08-13',
    items: [
      '📈 12个月资产走势升级为完整月度分析面板',
      '  - 当前资产、较上月变化、动态折线、最高点、近12月资产变化和最高资产统一在同一弹窗展示',
      '  - 月度明细默认显示最近6个月，可展开全部12个月；点击任一月份直接进入该月原有余额补录与修改流程',
      '  - 缺失月份不跨月连线或计算涨跌，当前月不回退旧数据；现有账户快照、人民币折算、保存和数据库口径均保持不变',
    ],
    itemsEn: [
      '📈 The 12-month asset trend is now a complete monthly analysis panel',
      '  - Current assets, month-over-month change, a dynamic trend chart, the peak point, 12-month asset change, and highest assets now share one dialog',
      '  - Monthly details show the latest six months by default and can expand to all twelve; tapping a month opens the existing balance editor for that exact month',
      '  - Missing months are not bridged or compared, and the current month never falls back to stale data; account snapshots, CNY conversion, saving, and database semantics are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.437', date: '2026-08-08',
    items: [
      '🎨 TQQQ买卖操作按钮按交易方向统一配色',
      '  - 顶部买入选择与底部确认买入统一为绿色，顶部卖出选择与底部确认卖出统一为红色',
      '  - 两处共用同一套方向色配置，避免后续调整时再次出现颜色分叉',
      '  - 本次仅调整TQQQ专属呈现；交易校验、保存、仓位、市场配色设置和其他股票均不改变',
    ],
    itemsEn: [
      '🎨 TQQQ buy and sell actions now share direction-consistent colors',
      '  - The top Buy selection and bottom Confirm Buy action are both green, while the Sell selection and Confirm Sell action are both red',
      '  - Both locations now share the same direction-tone configuration so future refinements cannot drift apart',
      '  - This is limited to the TQQQ presentation; validation, saving, allocation, market-color preferences, and other stocks are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.436', date: '2026-08-08',
    items: [
      '🎛️ TQQQ交易检查与市场参考进一步收紧纵向高度',
      '  - 交易前检查同步缩小四列标签、卡片内边距和进度条上下间距，保持现有一行四列与全部数值口径',
      '  - 市场参考按相同比例收紧VIX与QQQ的标签和说明区域，使两个模块保持一致的视觉密度',
      '  - 本次仍仅调整TQQQ专属界面；仓位、提醒线、行情请求、交易保存和其他股票均不改变',
    ],
    itemsEn: [
      '🎛️ TQQQ trade checks and market references now use tighter vertical spacing',
      '  - The four-column labels, card padding, and progress-bar spacing are reduced together while preserving the existing one-row layout and every calculation',
      '  - VIX and QQQ labels and supporting text are tightened by the same proportion so both sections share the same visual density',
      '  - This remains a TQQQ-only interface change; allocation, advisory limits, quote requests, trade saving, and other stocks are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.435', date: '2026-08-08',
    items: [
      '🎛️ TQQQ交易检查与市场参考统一为紧凑横向布局',
      '  - 买入和卖出检查在移动端固定一行四列，移除重复辅助说明，保留同一正式仓位、持仓和提醒线计算',
      '  - 风险预算进度条新增跟随填充位置的真实占用百分比；超过提醒线时保留真实数值且继续只提醒、不强制阻止买入',
      '  - VIX与QQQ合并到同一个市场参考卡片中左右排列；本次仅调整TQQQ专属界面，不改变行情请求、交易保存或其他股票',
    ],
    itemsEn: [
      '🎛️ TQQQ trade checks and market references now share a compact horizontal layout',
      '  - Buy and sell checks stay in one four-column row on mobile, with repetitive helper copy removed while preserving the same official allocation, holdings, and advisory calculations',
      '  - The risk-budget bar now shows the actual usage percentage at the fill position; values above the advisory line remain visible and continue to warn without forcibly blocking a buy',
      '  - VIX and QQQ now share one two-column market-reference card; this release changes only the TQQQ interface, with no quote request, trade-save, or other-stock changes',
    ],
  },
  {
    ver: 'v10.7.9.434', date: '2026-08-08',
    items: [
      '📊 TQQQ风险预算进度与当前仓位保持同步',
      '  - 尚未输入交易时，进度条使用当前TQQQ仓位占10%提醒线的比例；输入完成后自动切换为交易后仓位占用',
      '  - 未形成的“本次交易后”和“距提醒线”显示为不可用，不再将空值错误显示成0.0%；仓位计算与交易保存逻辑不变',
    ],
    itemsEn: [
      '📊 TQQQ risk-budget progress now stays aligned with the current allocation',
      '  - Before trade input is complete, the bar uses the current TQQQ allocation relative to the 10% advisory line; it switches to projected post-trade usage once input is ready',
      '  - Unformed post-trade and remaining-capacity values now show as unavailable instead of incorrectly appearing as 0.0%; allocation and trade-save logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.433', date: '2026-08-08',
    items: [
      '🎛️ TQQQ买入面板进一步精简视觉分隔',
      '  - 删除市场参考与日期之间的分割线，保留原有间距；卖出页的必要分隔及全部交易逻辑保持不变',
    ],
    itemsEn: [
      '🎛️ The TQQQ buy panel now uses a cleaner visual transition',
      '  - The divider between Market Reference and Date was removed while preserving spacing; the sell-side separator and all trade logic remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.432', date: '2026-08-08',
    items: [
      '🎛️ TQQQ专属交易面板统一系统视觉层级',
      '  - 输入、仓位、金额、市场参考及确认按钮的数字字号与高度收敛到现有交易系统规格，保留原有仓位计算和买卖逻辑',
      '  - 交易前检查与市场参考取消数字编号，并移除买入规则提示；VIX和QQQ仅保留客观数据参考',
      '  - 日期在Safari中恢复水平与垂直居中；改动仍仅作用于正式TQQQ入口，其他股票与波段记录不受影响',
    ],
    itemsEn: [
      '🎛️ The TQQQ trade panel now matches the system visual hierarchy',
      '  - Numeric sizing and control heights for inputs, allocations, amounts, market references, and confirmation now match the existing Trades system while preserving all position and trade logic',
      '  - Numbered section badges and the buy-rule prompt were removed; VIX and QQQ remain objective references only',
      '  - The date is horizontally and vertically centered in Safari, and the refinement remains isolated to the official TQQQ entry without affecting other stocks or swing records',
    ],
  },
  {
    ver: 'v10.7.9.431', date: '2026-08-08',
    items: [
      '🛡️ 正式交易新增TQQQ专属买卖纪律面板',
      '  - 仅正式交易账本中的TQQQ启用专属界面；其他股票、TQQQ波段记录及其他独立工具保持原逻辑与原界面',
      '  - 当前与交易后仓位直接复用交易页同一正式账本、完成收盘估值和持仓占比口径，不新增第二套仓位计算',
      '  - TQQQ买入以10%作为仓位纪律提醒线，超过后明确二次确认但仍允许用户自主买入；VIX与QQQ距52周高点仅作客观参考，不展示市场广度、综合状态或最大回撤',
      '  - TQQQ卖出隐藏买入信号，不受10%提醒线影响，但会按完整日期账本校验可卖股数并阻止超卖；本次不新增数据库、行情请求或外部数据源',
    ],
    itemsEn: [
      '🛡️ Official trades now include a TQQQ-only discipline panel',
      '  - The dedicated flow applies only to TQQQ in the official trade ledger; other stocks, TQQQ swing records, and independent tools keep their existing UI and behavior',
      '  - Current and projected weights reuse the exact official ledger, completed-close valuation, and allocation basis already shown in Trades, with no second position calculation',
      '  - TQQQ buys use 10% as an advisory discipline line; crossing it adds an explicit second confirmation while preserving the user’s choice to proceed. VIX and QQQ distance from the 52-week high remain objective references with no breadth, aggregate market state, or maximum-drawdown label',
      '  - TQQQ sells hide buy signals and are unaffected by the 10% reminder, while full dated-ledger replay prevents overselling; no database, quote request, or external data source was added',
    ],
  },
  {
    ver: 'v10.7.9.430', date: '2026-08-08',
    items: [
      '🎯 复利明细新增每年实际完成对照',
      '  - 每年收益新增实际完成、实际增幅、当前或实际期末资产、达成率及目标差额，并默认聚焦本年与下一年',
      '  - 未来预测只显示计划收益、计划期末资产和待填写状态，不再把预测值冒充实际数据',
      '  - 原有纯计划复利表保留并改名为“模拟年化收益”，固定放在弹窗最底部，与实际记录明确分开',
      '  - 下一年度继续使用上一年度真实结转余额作为起点；本次不改变年度录入、保存、数据库或结转规则',
    ],
    itemsEn: [
      '🎯 Compound details now compare each year’s actual result',
      '  - Yearly gains now show actual gain, actual growth, current or actual ending assets, goal completion, and the target gap, with the current and next year shown first',
      '  - Future projections show only planned gain, planned ending assets, and a pending state instead of presenting projections as actual data',
      '  - The original plan-only compound table remains available as Simulated Annualized Returns at the bottom of the modal, clearly separated from actual records',
      '  - Each new year continues from the prior year’s carried ending balance; annual entry, persistence, database, and carryover rules are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.429', date: '2026-08-07',
    items: [
      '📅 恢复未来一个月的财报日历',
      '  - 财报日历改用明确的完整当前与未来日期区间，不再依赖 provider 的 symbol-only 默认短窗口',
      '  - 最近已公布财报由第二个最多 90 天的历史窗口补齐，历史补取失败不会清空当前与未来事件',
      '  - 两个返回都只保留用户请求的股票；主窗口失败时继续 fail closed，不把未来数据缺失冒充为空结果',
      '  - 仍最多两笔 EODHD Calendar 请求，不增加第三笔请求、循环读取、备用源或数据库',
    ],
    itemsEn: [
      '📅 Restored the next month of upcoming earnings',
      '  - The calendar now uses an explicit complete current and future date range instead of relying on the provider\'s short symbol-only default window',
      '  - The latest published report is supplemented by a second history window of at most 90 days, and a history lookup failure no longer clears current or future events',
      '  - Both responses retain only the user-requested stocks; the authoritative window continues to fail closed instead of presenting missing future data as an empty result',
      '  - The flow remains capped at two EODHD Calendar requests with no third lookup, loop, alternate source, or database',
    ],
  },
  {
    ver: 'v10.7.9.428', date: '2026-08-06',
    items: [
      '📊 财报详情扩展为按用户请求读取官方结构化细分',
      '  - 任意美股详情都会尝试解析该公司最新 SEC 官方文件，不再只允许预先列入名单的少数股票读取结构',
      '  - 通用 XBRL 解析严格核验公司、官方财期、当前与上年同期，并仅发布可唯一识别且能双期勾稽的分部、产品或地区数据',
      '  - COST 使用 2026-05-10 官方 12 周财期而非 provider 月末，并返回 3 个地理分部和 5 项收入结构；UNH 最新 Q2 严格读取 8-K EX-99.1 的 4 个分部及抵销',
      '  - provider 财期、SEC 官方财期和公布日分别保存；非自然季度不再因公布日早于月末而报日期不匹配，标题也使用官方财年季度',
      '  - 本次不增加 EODHD 请求、不新增数据库或备用财报源；无法唯一识别、无法对账或官方未披露的数据继续显示不可用',
    ],
    itemsEn: [
      '📊 Earnings detail now reads official structured breakdowns on demand',
      '  - Any requested U.S. stock now attempts to parse its latest official SEC filing instead of limiting structures to a small predeclared symbol list',
      '  - The generic XBRL path verifies company identity, official period, current and prior-year quarters, and publishes only uniquely identifiable sections that reconcile in both periods',
      '  - Costco uses its official May 10, 2026 twelve-week period and returns three geographic segments plus five revenue categories; UnitedHealth Q2 strictly reads four segments and eliminations from its 8-K Exhibit 99.1',
      '  - Provider period, exact SEC period, and report date are stored separately, so retail-calendar quarters no longer fail when the announcement precedes the provider month-end and headings use the official fiscal quarter',
      '  - This release adds no EODHD request, database, or alternate earnings source; ambiguous, unreconciled, and undisclosed structures remain unavailable',
    ],
  },
  {
    ver: 'v10.7.9.427', date: '2026-08-06',
    items: [
      '📊 恢复所有已支持股票的最新财报与官方结构化细分',
      '  - 财报列表分离 EODHD provider 财期与 SEC 官方精确财期；同一季度不再重复、串期或回退到错误详情',
      '  - “最近已公布”复用原有日历请求并在 90 天边界内补齐历史，不增加请求次数；下一季尚未公布时仍可读取上一份最新财报',
      '  - SEC 摘要与详情使用独立调度、共享公开响应缓存和同 URL singleflight；瞬态失败及未解析结果五分钟后可重试，并只记录脱敏诊断字段',
      '  - AMD 2026 Q2 官方 10-Q 返回 3 个分部和 4 项业务结构；MSFT 2026 Q4 严格使用当季 8-K 的 3 个分部，未披露的产品或地区继续显示不可用',
      '  - 不新增数据库、备用财报源或共享外部缓存，任何无法由官方文件勾稽的结构继续 fail closed',
    ],
    itemsEn: [
      '📊 Restored the latest earnings and official structured breakdowns for every supported stock',
      '  - Earnings now keep the EODHD provider period separate from the exact official SEC period, preventing duplicate quarters, crossed periods, and incorrect detail fallbacks',
      '  - Latest published results reuse the existing calendar request with a bounded 90-day history window and no extra request, retaining the prior report until the next quarter is actually published',
      '  - SEC summary and detail use isolated schedulers with a shared public-response cache and same-URL singleflight; transient and unparsed states retry after five minutes with sanitized diagnostics only',
      '  - AMD Q2 2026 returns three official 10-Q segments and four business lines; Microsoft Q4 2026 strictly uses the quarterly 8-K for three segments while undisclosed product and geography data remain unavailable',
      '  - No database, alternate earnings source, or external shared cache was added, and any structure that cannot be reconciled to an official filing continues to fail closed',
    ],
  },
  {
    ver: 'v10.7.9.426', date: '2026-08-05',
    items: [
      '📊 修复已公布财报跨日期窗口后退到旧季度',
      '  - 财报日历按每只关注股票保留最近一份真正已公布的财报，不再把“最近已公布”等同于上一个自然季度',
      '  - GOOGL 等七月已公布 Q2 在超过七天后仍保持为最新财报，不会重新显示四月 Q1',
      '  - 当前和未来财报窗口保持不变；历史补取只使用既有股票代码请求，并移除全市场上一季度额外读取',
      '  - 请求范围使用纽约日期，新增缓存版本避免部署后继续命中旧窗口结果；SEC 详情与分部解析边界不变',
    ],
    itemsEn: [
      '📊 Fixed published earnings falling back to an older quarter after leaving the date window',
      '  - The calendar now retains each followed symbol’s latest genuinely published report instead of equating “latest published” with the previous calendar quarter',
      '  - July Q2 reports such as GOOGL remain the latest result after seven days and no longer fall back to April Q1',
      '  - The current and future window is unchanged; history uses the existing symbol-scoped request and removes the extra full-market previous-quarter read',
      '  - New York dates and a new cache scope prevent stale-window reuse after deployment, while SEC detail and breakdown parsing boundaries remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.425', date: '2026-08-05',
    items: [
      '📊 修复已公布财报与 AMD 8 月 4 日盘后结果',
      '  - 财报日历统一使用纽约日期，盘后待更新事件在公布后保留两天；客户端与 API 的关注股票上限统一为 30',
      '  - 已公布 EPS 保持 Calendar 与 Trend 成对口径，History 只在缺失时回退，避免不同来源覆盖后形成混合同比',
      '  - AMD 使用 SEC 8-K/10-Q 官方 GAAP 实际值，并区分 8 月 4 日公布日、6 月 30 日 provider 财季与 6 月 27 日官方财季',
      '  - 不新增行情源或数据库；既有 SEC 财报详情分部适配保持不变，缺少专用适配的数据继续显示不可用',
    ],
    itemsEn: [
      '📊 Fixed published earnings and AMD’s August 4 after-market result',
      '  - The earnings calendar now uses the New York date, retains pending after-market events for two days, and aligns the client and API symbol cap at 30',
      '  - Published EPS keeps Calendar and Trend on one basis, using History only as a missing-data fallback to avoid mixed-source year-over-year results',
      '  - AMD now uses official SEC 8-K/10-Q GAAP actuals while separating the August 4 report date, June 30 provider period, and June 27 official fiscal period',
      '  - No market-data source or database was added; existing SEC detail adapters stay unchanged and unsupported breakdowns remain unavailable',
    ],
  },
  {
    ver: 'v10.7.9.424', date: '2026-08-05',
    items: [
      '💵 现金长金额改为向左自适应完整显示',
      '  - 首页与交易页的短现金金额继续从融资负债第三列起点对齐，保留原卡片比例、字号和间距',
      '  - 百万级等较长金额以卡片右侧为锚点自动向左扩展，不再换行、显示省略号或挤出卡片',
      '  - 本次只调整现金显示布局，不修改现金保存、资产口径、个人收益、数据库或行情链路',
    ],
    itemsEn: [
      '💵 Long cash balances now expand left and remain fully visible',
      '  - Short cash balances on Home and Trades keep the original third-column alignment with Margin Debt, card proportions, typography, and spacing',
      '  - Million-scale and other long balances stay anchored to the card’s right edge and expand left without wrapping, ellipsis, or overflow',
      '  - This is a cash-display layout change only, with no change to cash persistence, asset accounting, personal P&L, the database, or market data',
    ],
  },
  {
    ver: 'v10.7.9.423', date: '2026-08-05',
    items: [
      '💵 交易页头部同步可用现金',
      '  - 交易页与首页使用相同的现金金额、默认 ¥0/$0、币种切换和融资列对齐样式',
      '  - 点击交易页现金复用同一个录入窗口和保存回调；任一页面保存后，首页与交易页立即同步',
      '  - 交易页总资产继续读取已包含现金的统一资产汇总，不重复加现金；数据库、个人收益和行情链路不变',
    ],
    itemsEn: [
      '💵 Available cash synchronized into the Trades header',
      '  - Trades now matches Home for the cash amount, ¥0/$0 default, currency switching, and alignment above the margin column',
      '  - Tapping cash in Trades reuses the same editor and save callback, so either page updates Home and Trades immediately',
      '  - Trades continues reading the unified asset total that already includes cash, avoiding double counting with no database, personal P&L, or market-data change',
    ],
  },
  {
    ver: 'v10.7.9.422', date: '2026-08-05',
    items: [
      '💵 优化首页现金默认值与列对齐',
      '  - 尚未录入现金时直接显示当前币种的 ¥0 或 $0，不再显示“设置”文字；金额区域仍可点击录入',
      '  - 现金与下方融资负债使用同一列起点和左侧间距，总资产及头部卡片原样式保持不变',
      '  - 本次只调整首页显示，不修改现金持久化、资产口径、个人收益、数据库或行情链路',
    ],
    itemsEn: [
      '💵 Refined the Home cash default and column alignment',
      '  - Unset cash now displays ¥0 or $0 in the active currency instead of a Set label, while the amount area remains tappable for entry',
      '  - Cash now shares the same column start and left spacing as Margin Debt below, with Total Assets and the original header-card styling preserved',
      '  - This is a Home display-only change with no change to cash persistence, asset accounting, personal P&L, the database, or market data',
    ],
  },
  {
    ver: 'v10.7.9.421', date: '2026-08-05',
    items: [
      '💵 首页新增可用现金并联动账户资产',
      '  - 总资产后新增同字号现金金额；点击即可录入 USD 或 CNY，未设置与明确为 0 保持不同状态，小屏不挤出原卡片',
      '  - 可用现金计入首页、交易页和融资情景的总资产与净资产，并参与自选股仓位占比；融资负债及原有样式保持不变',
      '  - 个人收益按现金变更事件和对应完成收盘日生成资产快照，不把当前现金倒灌历史，也不稀释股票收益率或 QQQ 对比',
      '  - 数据库按 foundation、精确 runtime、contract 顺序开放本人写入；事件由服务端生成且不可直接修改，不接入新行情源或共享缓存',
    ],
    itemsEn: [
      '💵 Available cash on Home with account-asset integration',
      '  - A same-size cash amount now follows Total Assets and opens a USD/CNY editor; unset and explicit zero remain distinct without squeezing the original card on small screens',
      '  - Available cash contributes to total and net assets across Home, Trades, and margin scenarios, and to watchlist allocation, while margin debt and existing styling stay unchanged',
      '  - Personal P&L uses immutable cash-change events at the corresponding completed close, without backfilling current cash into history or diluting stock returns and QQQ comparison',
      '  - Owner writes open only after the foundation, exact runtime, and contract sequence; events remain server-generated and immutable, with no new market source or shared cache',
    ],
  },
  {
    ver: 'v10.7.9.420', date: '2026-08-05',
    items: [
      '🌊 波段记录支持部分卖出',
      '  - 同一波段可分多次卖出；每笔卖出独立进入已完成，未卖股数继续保留在进行中并沿用原波段编号',
      '  - 已完成的单笔卖出可修改或删除，减少或删除后股数自动返还进行中；全部卖完后不再保留进行中记录',
      '  - 数据库通过独立退出记录与原子 RPC 锁定本人波段，校验日期、旧版本和剩余股数，禁止并发超卖',
      '  - 既有完整卖出记录继续兼容；波段、正式交易、持仓、收益、比赛和摊薄成本仍保持独立账本',
    ],
    itemsEn: [
      '🌊 Partial exits for swing-wave records',
      '  - A wave can now be sold in multiple exits; each exit appears separately under Completed while unsold shares remain Active under the original wave number',
      '  - Each completed exit can be edited or deleted, returning reduced or removed shares to Active; a fully sold wave no longer keeps an Active row',
      '  - Dedicated exit records and atomic database RPCs lock the user-owned wave and validate dates, stale versions, and remaining shares to prevent concurrent overselling',
      '  - Existing full-sale records remain compatible, while waves, formal trades, holdings, P&L, competition, and cost-basis ledgers remain isolated',
    ],
  },
  {
    ver: 'v10.7.9.419', date: '2026-08-04',
    items: [
      '📊 补齐台积电 2026 财年 Q1 官方财报',
      '  - 2026-03-31 财报详情将 provider 的 2026-04-15 日历键严格映射到 2026-04-16 官方 Management Report，恢复业务平台、地区及 11 项制程结构',
      '  - Q1 使用独立官方分类，不虚构 2nm，也不把 90nm、0.11/0.13um、0.15/0.18um 与 0.25um 以上项目错误合并',
      '  - 顶部营收与经营利润按官方季度平均 USD/NTD 转换，EPS 统一为官方 USD/ADR；详情页定向更新旧缓存，不触发财报日历重算',
      '  - Q1/Q2 财季与受控发布日期必须精确匹配；不新增 EODHD、备用行情源、数据库或生产数据写入',
    ],
    itemsEn: [
      '📊 Restored TSMC FY2026 Q1 official earnings data',
      '  - The March 31, 2026 detail strictly maps the provider’s April 15 calendar key to the official April 16 Management Report, restoring platform, geography, and all eleven disclosed process categories',
      '  - Q1 keeps its own official taxonomy without inventing 2nm or merging the separately disclosed 90nm, 0.11/0.13um, 0.15/0.18um, and 0.25um-and-above rows',
      '  - Revenue and operating income use TSMC’s official quarter-average USD/NTD rates, EPS uses official USD/ADR, and a targeted detail-cache revision bypasses the older unavailable result without a calendar rebuild',
      '  - Q1 and Q2 require exact fiscal and controlled publication-date pairs, with no new EODHD call, backup market source, database change, or production-data write',
    ],
  },
  {
    ver: 'v10.7.9.418', date: '2026-08-03',
    items: [
      '📊 台积电财报详情与美元业绩趋势',
      '  - TSM 2026 财年 Q2 财报详情接入台积电官方 Management Report，业务平台、地区与制程结构严格使用已披露数据',
      '  - 业绩趋势从 EODHD Fundamentals 读取 TWD 年度与季度营收、净利润，再按每个财务期间的 USDTWD 平均收盘汇率转换为 USD',
      '  - USD 转换完成后重新计算年度/季度同比、季度环比与复合增速；净利率保持原始报表口径，并明确标注原始币种 TWD',
      '  - Fundamentals 与整段历史汇率使用 6 小时缓存、并发合并和 UTC 日 402 熔断；不逐期请求、不使用即时汇率或备用数据源',
    ],
    itemsEn: [
      '📊 TSMC earnings detail and USD performance trends',
      '  - TSM FY2026 Q2 earnings detail now uses TSMC’s official Management Report for disclosed platform, geography, and process-technology composition',
      '  - Performance trends read TWD annual and quarterly revenue and net income from EODHD Fundamentals, then translate each fiscal period to USD with its period-average USDTWD closes',
      '  - Annual and quarterly YoY, quarterly QoQ, and CAGR are recalculated after translation; net margin retains the original statement basis and the original TWD currency remains explicit',
      '  - Fundamentals and the single historical FX range share a six-hour cache, request coalescing, and the UTC-day 402 breaker, with no per-period requests, spot-rate substitution, or backup source',
    ],
  },
  {
    ver: 'v10.7.9.417', date: '2026-08-03',
    items: [
      '⚡ 股票实时稳定版 v10',
      '  - iOS Home Screen PWA 的 EODHD 成交与报价 WebSocket 改为同时启动，不再让成交流等待报价流',
      '  - provider 连接打开后立即发送兼容订阅，同时保留授权确认、错误关闭和安全重订阅',
      '  - 已登录 Snapshot 收到首批新行情即返回，其余股票继续由既有 burst 补齐；旧 Snapshot 不得覆盖更新的 WebSocket tick',
      '  - 保留 EODHD 单一来源、15/30/60 分钟完整 REST 门控、完成收盘锁定和账户隔离缓存，不恢复 v382 的 10 秒 REST 轮询',
    ],
    itemsEn: [
      '⚡ Stock Realtime Stable v10',
      '  - EODHD trade and quote WebSockets now start together in the iOS Home Screen PWA, so the trade stream no longer waits behind the quote stream',
      '  - A compatibility subscription is sent immediately when the provider socket opens, while authorization confirmation, error closure, and safe resubscription remain intact',
      '  - Authenticated snapshots return after the first fresh market tick and the existing burst continues filling the remaining symbols; an older snapshot still cannot overwrite a newer WebSocket tick',
      '  - EODHD remains the only provider, with the 15/30/60-minute full REST gate, completed-close lock, and account-isolated cache preserved; the v382 ten-second REST polling is not restored',
    ],
  },
  {
    ver: 'v10.7.9.416', date: '2026-08-03',
    items: [
      '📉 首页新增自选股票 MA200 跌破监控',
      '  - 财报日历下方显示自选股票的 MA200（日）跌破状态；正式确认仅使用 EODHD 最新完成收盘 adjusted_close，盘中现价只标记等待收盘',
      '  - 新跌破按盘中、连续 1 日、2 日依次排列，最多保留 20 个完成交易日；默认显示 5 只，超过后可展开全部',
      '  - 点击股票整行直接进入对应股票趋势页面；收盘价、MA200、距离与确认状态保持首页紧凑布局',
      '  - 监控数据随现有 /api/quote 批次返回并复用同一份 EODHD 日线响应，不发起卡片专属重复请求，不接入备用源，也不修改数据库、交易或收益口径',
    ],
    itemsEn: [
      '📉 MA200 breakdown monitoring for Home watchlist stocks',
      '  - A new card below the earnings calendar shows daily-MA200 breakdowns for watchlist stocks; confirmation uses only the latest completed EODHD adjusted close, while live prices remain close-pending observations',
      '  - Signals sort from intraday to one, two, and later completed sessions, remain visible for up to 20 completed trading days, and show five rows by default with an expand-all control',
      '  - Tapping any stock row opens its existing Stock Trend page, while close, MA200, distance, and confirmation stay in the compact Home layout',
      '  - Monitor data travels with the existing /api/quote batch and reuses the same EODHD daily-history response, with no card-specific duplicate request, backup provider, database change, trade change, or P&L formula change',
    ],
  },
  {
    ver: 'v10.7.9.415', date: '2026-08-03',
    items: [
      '📊 股票趋势一年图支持自由缩放',
      '  - 1 年视图复用 5 年视图的双指缩放、缩放后单指横向拖动、范围提示和重置逻辑',
      '  - 1 年图继续使用日线股价、MA200（日）与 MA50（周）；5 年图及 1 月、3 月、6 月视图保持原行为',
      '  - MA200 建仓指标徽章改为与日均线一致的蓝色，MA50 巴菲特指标紫色和 MA200 周线芒格指标金色保持不变',
      '  - 本次只复用既有前端图表窗口逻辑，不增加 EODHD 请求，不修改行情、数据库、交易或收益口径',
    ],
    itemsEn: [
      '📊 Free zooming for the one-year stock trend chart',
      '  - The 1Y view now reuses the 5Y view\'s pinch zoom, post-zoom horizontal pan, visible-range label, and reset behavior',
      '  - The 1Y chart keeps daily prices, daily MA200, and weekly MA50; the 5Y, 1M, 3M, and 6M views retain their existing behavior',
      '  - The MA200 entry-indicator badge now matches the daily MA line in blue, while the purple MA50 Buffett badge and gold weekly MA200 Munger badge stay unchanged',
      '  - This reuses the existing frontend chart-window logic with no extra EODHD request and no market-data, database, trade, or P&L formula change',
    ],
  },
  {
    ver: 'v10.7.9.414', date: '2026-08-03',
    items: [
      '📈 股票趋势新增 MA50 周线与巴菲特指标',
      '  - 1 年视图保留股价和 MA200（日），5 年视图保留股价和 MA200（周），并在两个范围追加紫色 MA50（周）曲线',
      '  - 关键指标新增 MA50（周）巴菲特指标卡片，原 MA200（周）芒格指标及其金色样式保持不变',
      '  - MA50 只使用已完成交易周收盘价；进行中周不会推进指标，50 至 199 周历史可独立显示 MA50 而不伪造 MA200',
      '  - 复用现有 EODHD 历史响应完成计算，不增加行情请求、不接入备用源，也不修改数据库、正式交易或收益口径',
    ],
    itemsEn: [
      '📈 Weekly MA50 and Buffett Indicator for stock trends',
      '  - The 1Y view retains price and daily MA200, the 5Y view retains price and weekly MA200, and both ranges now add a purple weekly MA50 line',
      '  - Key indicators now include a weekly MA50 Buffett Indicator card while the existing weekly MA200 Munger Indicator and gold styling remain unchanged',
      '  - MA50 uses completed trading-week closes only; an in-progress week cannot advance it, and 50 to 199 weeks of history can show MA50 independently without fabricating MA200',
      '  - The calculation reuses the existing EODHD history response with no extra market-data request, backup provider, database change, formal-trade change, or P&L formula change',
    ],
  },
  {
    ver: 'v10.7.9.413', date: '2026-08-02',
    items: [
      '📒 个股交易记录与统计保存后立即更新',
      '  - 正式交易新增、金融字段修改或删除成功后，个股详情的交易记录、买卖金额和买卖次数立即按当前账本重算，不再等待当天收盘快照',
      '  - 交易区间上限统一使用纽约当前日期，纽约尚未到达的未来日期交易不会提前显示，并保持买卖成本顺序和实现盈亏计算一致',
      '  - 个股头部收益、持仓数量与金额、收益走势、图表交易节点和相对 QQQ 仍严格锁定最新权威完成收盘快照',
      '  - 不修改正式交易保存、个人收益快照、EODHD provider、比赛、数据库 schema 或收盘重算任务',
    ],
    itemsEn: [
      '📒 Immediate stock trade records and statistics after saving',
      '  - After a successful formal-trade add, financial edit, or deletion, stock-detail records, buy/sell amounts, and buy/sell counts rebuild immediately from the current ledger instead of waiting for the same-day close snapshot',
      '  - The trade range ends on the current New York date, excluding trades dated in New York\'s future while preserving canonical trade order and realized-P&L accounting',
      '  - Stock headline returns, held shares and value, return trends, chart trade markers, and QQQ comparison remain strictly locked to the latest authoritative completed-close snapshot',
      '  - Formal-trade persistence, personal P&L snapshots, the EODHD provider, competition, database schema, and close-rebuild jobs are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.412', date: '2026-08-02',
    items: [
      '📈 收益报表改为只读加载',
      '  - 正式交易新增、金融字段修改或删除成功后，由交易保存链路唯一触发一次已登录即时重算；名称和备注修改仍不触发',
      '  - 打开或重新打开收益报表，以及 focus、pageshow 和恢复前台时，只读取数据库中的权威完成快照，不再触发个人历史重算或 EODHD rebuild',
      '  - 即时重算等待收盘或失败时继续保留 dirty 与上一份完整报表，由既有收盘定时任务补算；页面不再显示常驻重试提示或按钮',
      '  - 不修改个人收益口径、每日收盘快照、EODHD provider、正式交易、比赛、持仓估值或数据库 schema',
    ],
    itemsEn: [
      '📈 Read-only loading for personal P&L reports',
      '  - After a successful formal-trade add, financial edit, or deletion, the trade-save path is the only client path that triggers one authenticated immediate rebuild; name-only and note-only edits still do not trigger it',
      '  - Opening or reopening the report, focus, pageshow, and foreground resume now read only authoritative completed snapshots from the database and never trigger a personal-history rebuild or EODHD rebuild',
      '  - When the immediate rebuild is waiting for a close or fails, dirty state and the previous complete report remain for the existing scheduled close jobs; the page no longer shows a persistent retry notice or button',
      '  - Personal P&L formulas, daily close snapshots, the EODHD provider, formal trades, competition, holding valuation, and database schema are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.411', date: '2026-08-02',
    items: [
      '📊 个股与 QQQ 对比只保留当前存续仓位',
      '  - 固定当前持仓周期的原始起点，但卖出部分、对应 QQQ 仓位及其已实现盈亏会从整段历史对比中剔除',
      '  - 每次正式交易新增、修改或删除后，系统按交易顺序反推仍存续的买入份额并自动完整重算；既有卖出无需重复提交',
      '  - 后续买入仅按最终存续成交额等额加入 QQQ；多次减仓、同日交易顺序和全清后重买均按正式账本处理',
      '  - 该变化只影响个股/QQQ 收益对比；账户累计盈亏、持仓成本、个人收益报表、比赛和 EODHD 行情链路保持不变',
    ],
    itemsEn: [
      '📊 Stock-versus-QQQ comparison now keeps only the current position',
      '  - The original start of the current holding cycle stays fixed, while sold shares, matched QQQ shares, and their realized P&L are removed from the entire comparison history',
      '  - Every formal-trade add, edit, or deletion re-derives the surviving buy shares in ledger order and rebuilds automatically; historical sells must not be submitted again',
      '  - Later buys add only their surviving executed value to QQQ; multiple trims, same-day trade order, and full-close/rebuy cycles follow the formal ledger',
      '  - This changes only the stock/QQQ comparison; account P&L, holding cost, personal P&L reports, competition, and EODHD market-data paths remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.410', date: '2026-08-02',
    items: [
      '📊 个股与 QQQ 收益对比按固定起点完整重算',
      '  - 当前持仓周期使用同一个原始对比起点；切换本年、近 1 月等页面范围不再重置 QQQ 或丢弃更早现金流',
      '  - 正式交易新增、修改或删除后自动读取现有账本并从起点完整回放，历史卖出无需也不得重复提交',
      '  - 后续买入给 QQQ 等额加仓，卖出按卖出前持仓比例同步减仓；双方收益率统一除以累计投入本金，卖出不缩小分母',
      '  - 个人收益快照重算完成后个股详情自动刷新；价格仍只使用个股与 QQQ 的正式普通收盘价，不修改 EODHD provider、数据库或持仓成本链路',
    ],
    itemsEn: [
      '📊 Full fixed-start rebuilds for stock-versus-QQQ returns',
      '  - The current holding cycle keeps one original comparison start; page ranges such as YTD or 1M no longer rebase QQQ or discard earlier cash flows',
      '  - Adding, editing, or deleting a formal trade automatically replays the existing ledger from that start, so historical sells must never be submitted again',
      '  - Later buys add the same executed value to QQQ, while sells trim QQQ by the same pre-sale holding ratio; both rates use cumulative contributed capital and sells never shrink the denominator',
      '  - Stock detail refreshes after personal snapshot rebuilding; prices remain ordinary formal closes for the stock and QQQ, with no change to the EODHD provider, database, or holding-cost path',
    ],
  },
  {
    ver: 'v10.7.9.409', date: '2026-08-02',
    items: [
      '📈 正式交易修改后收益报表正确重算',
      '  - 新增、修改或删除正式交易后，个人收益从最早受影响交易日重建至 EODHD 最新精确完成收盘；修改名称或备注不触发金融重算',
      '  - 重建期间继续显示上一份完整报表，完整新序列经账本版本校验后原子替换；空账本也会原子清空',
      '  - 正常交易日精确收盘暂缺时保持等待和 dirty，不拿实时价、Yahoo、备用源或旧日期冒充当日结果',
      '  - 正式交易保存不因派生报表失败而回滚；前台和收盘任务会安全重试，且不修改比赛、实时持仓、波段或摊薄成本链路',
    ],
    itemsEn: [
      '📈 Correct personal P&L rebuilds after formal-trade changes',
      '  - Adding, editing, or deleting a formal trade rebuilds personal P&L from the earliest affected trade date through the latest exact completed EODHD close; name-only or note-only edits do not trigger a financial rebuild',
      '  - The previous complete report remains visible during the rebuild, and the new complete series replaces it atomically after a ledger-version check; an empty ledger is cleared atomically as well',
      '  - If the exact close for a regular session is not available yet, the report remains pending and dirty instead of substituting realtime prices, Yahoo, backup providers, or an older date',
      '  - A derived-report failure never rolls back the saved formal trade; foreground and close jobs retry safely without changing competition, live holdings, swing records, or dilution-cost paths',
    ],
  },
  {
    ver: 'v10.7.9.408', date: '2026-08-01',
    items: [
      '📊 交易持仓统一使用 EODHD 收盘估值',
      '  - 收盘锁定后，交易页持仓价格、市值、持仓盈亏、累计盈亏、总资产、占比和排序统一使用 EODHD 最新完成收盘价，与首页正式收盘口径一致',
      '  - 盘前和盘中继续保留 EODHD 实时价；交易录入默认价和持仓试算不会被收盘估值字段替换',
      '  - 新完成收盘暂缺时保留最近一份明确的 EODHD 完成收盘估值，界面不拿延迟价或 0 冒充新收盘',
      '  - 不接入备用行情源，不修改正式交易、个人收益快照、比赛账本或生产财务数据',
    ],
    itemsEn: [
      '📊 Unified EODHD close valuation for trading positions',
      '  - After the close locks, holding prices, market value, holding and cumulative P&L, total assets, allocation, and sorting all use the latest completed EODHD close, matching Home',
      '  - EODHD realtime prices remain available before and during the session; trade-entry defaults and the position scenario tool are not replaced by the close-valuation field',
      '  - If a new completed close is temporarily unavailable, valuation retains the last explicit completed EODHD close instead of presenting a delayed price or zero as the new close',
      '  - No backup quote provider is introduced, and formal trades, personal P&L snapshots, competition ledgers, and production financial data remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.407', date: '2026-08-01',
    items: [
      '🏆 收益比赛交易修改即时生效',
      '  - 参赛用户可自由新增、修改或删除自己的正式交易；保存成功后立即重算当前已发布收盘日的比赛成绩，不再等待下一个交易日',
      '  - 历史修正严格按 trade_date 归入对应收益区间，价格只使用 EODHD 已完成收盘日线，不使用实时价、备用行情或浏览器上传的价格',
      '  - 个人比赛快照与同日 publication marker 在数据库内原子替换；账本并发变更、EODHD 不可用或写入失败时保留上一份有效榜单并稍后重试',
      '  - 正式交易、个人收益快照、实时行情、持仓与比赛子系统继续隔离；波段记录和摊薄成本不触发比赛重算',
    ],
    itemsEn: [
      '🏆 Immediate competition updates after formal-trade changes',
      '  - Active members may freely add, edit, or delete their own formal trades; a successful save immediately recalculates the currently published close instead of waiting for the next trading day',
      '  - Historical corrections are assigned by trade_date and use completed EODHD daily closes only, never realtime prices, backup providers, or prices supplied by the browser',
      '  - The member snapshot series and same-date publication marker are replaced atomically; ledger races, unavailable EODHD data, or storage failures retain the last valid board for a later retry',
      '  - Formal trades, personal P&L snapshots, realtime quotes, holdings, and the competition subsystem remain isolated; swing records and dilution-cost entries never trigger this recalculation',
    ],
  },
  {
    ver: 'v10.7.9.401', date: '2026-07-28',
    items: [
      '⚡ iOS 主屏股票行情启动加速',
      '  - 复用最近 15 分钟、按账户隔离的股票代码与昨收基线，在云端持仓完成前提前建立股票实时连接',
      '  - WebSocket 仍为首选；只有新实时行情才进入持仓价格，iOS 快照仅在首包缺失或恢复时兜底',
      '  - 恢复会话按新鲜度与连接世代隔离，旧快照和旧连接不能覆盖新价格或重新写回已删除股票',
      '  - 缓存不保存数量、成本、盈亏、目标价、交易或账户数据；BTC、指数、财报、认证、数据库和正式账本逻辑均保持不变',
    ],
    itemsEn: [
      '⚡ Faster stock-quote startup in the iOS Home Screen app',
      '  - A user-scoped 15-minute cache of stock symbols and previous-close baselines can start stock realtime before cloud holdings finish loading',
      '  - WebSocket remains primary; only a new realtime tick enters holding prices, while iOS snapshots are limited to first-tick and resume fallback',
      '  - Resume sessions isolate freshness and connection generations so stale snapshots or sockets cannot replace newer prices or restore removed symbols',
      '  - The cache stores no shares, cost, P&L, targets, trades, or account data; BTC, indices, earnings, authentication, databases, and formal ledgers are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.400', date: '2026-07-28',
    items: [
      '📈 iOS 主屏持仓价格稳定显示',
      '  - 首页与交易页在 Tab 切换、滑动和行情预热期间保留最后一个有效价格，不再短暂显示为空',
      '  - 触摸与恢复快照并发时使用最新事件的新鲜度语义，避免普通触摸继承旧的强制重置',
      '  - 财报反应继续使用严格的新行情判断；数据库、持仓、正式交易、收益、比赛和财务计算均未修改',
    ],
    itemsEn: [
      '📈 Stable holding prices in the iOS Home Screen app',
      '  - Home and Trades now retain the last valid price during tab switches, scrolling, and quote warmup instead of briefly showing an empty value',
      '  - Concurrent touch and resume snapshots now follow the latest event freshness semantics, preventing an ordinary touch from inheriting an earlier forced reset',
      '  - Earnings reactions keep their strict fresh-quote checks; databases, holdings, formal trades, P&L, competitions, and financial calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.399', date: '2026-07-28',
    items: [
      '⚡ iOS 主屏股票行情混合加速',
      '  - iOS 主屏 Web App 前台改为实时 WebSocket 优先，同时立即启动股票快照兜底；后台暂停，回到前台后重新连接并校准',
      '  - 首个实时价格等待 4 秒后自动补拉，按股票代码识别缺失覆盖；迟到快照不会覆盖更新的 WebSocket 价格',
      '  - 服务端 relay 优先连接盘口流，并在 1.3 秒后错峰启动成交流；授权后重新确认订阅，快照同时返回覆盖率、缺失代码与数据年龄',
      '  - 本次只调整行情传递、兜底与 PWA 生命周期；不修改数据库、持仓、正式交易、收益、比赛或财务计算',
    ],
    itemsEn: [
      '⚡ Faster hybrid stock quotes for the iOS Home Screen app',
      '  - The iOS Home Screen Web App now prefers the realtime WebSocket while starting an immediate stock-snapshot fallback; it pauses in the background and reconnects with a fresh calibration on resume',
      '  - A four-second first-tick watchdog starts fallback reads, coverage is tracked per symbol, and a late snapshot cannot overwrite a newer WebSocket price',
      '  - The server relay connects the quote stream first and staggers the trade stream by 1.3 seconds; subscriptions are reconfirmed after authorization, while snapshots report coverage, missing symbols, and data age',
      '  - This release only changes quote delivery, fallback behavior, and PWA lifecycle handling; databases, holdings, formal trades, P&L, competitions, and financial calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.398', date: '2026-07-27',
    items: [
      '🎯 个股收益头卡整合目标计划',
      '  - 个股收益详情头卡在原有三排持仓结构下方新增单一目标价、距目标空间和成本进度',
      '  - 点击目标区域可直接编辑；与股票趋势原目标价卡共用同一份个人目标和保存入口',
      '  - 股票趋势原目标价卡继续保留；目标价、成本和当前价仍按 USD 口径展示',
      '  - 不修改持仓、正式交易、收益计算、比赛账本或数据库结构',
    ],
    itemsEn: [
      '🎯 Integrated the personal target into the stock-return summary',
      '  - The individual return summary now adds target price, remaining upside, and cost progress below the existing three position rows',
      '  - The target area opens the same editor and persists through the same personal-target path as the Stock Trend card',
      '  - The original Stock Trend target card remains available; target, cost, and current price continue to use canonical USD',
      '  - Holdings, formal trades, return calculations, competition ledgers, and database structure are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.397', date: '2026-07-27',
    items: [
      '🔎 股票趋势辅助文字与底部留白优化',
      '  - 关键指标、公司估值、财报、目标价与持仓辅助文字统一到首页可读层级',
      '  - 356px 窄屏下相对 QQQ、MA200 与徽章保持单排完整显示',
      '  - 移除“我的持仓”后的重复底栏预留；底部导航仍由 App 统一保留安全空间',
      '  - 仅调整页面样式与间距；不修改行情、指标、财报、目标价、持仓或交易数据',
    ],
    itemsEn: [
      '🔎 Improved stock-trend helper text and bottom spacing',
      '  - Helper text across key metrics, valuation, earnings, target price, and holdings now follows the readable Home hierarchy',
      '  - Relative QQQ, MA200, and badges remain complete on one line at the 356px narrow width',
      '  - Removed duplicate clearance below My Position while the App continues to reserve the bottom-navigation safe area',
      '  - This only changes presentation and spacing; quotes, indicators, earnings, targets, holdings, and trade data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.396', date: '2026-07-27',
    items: [
      '🧭 股票趋势模块顺序精简',
      '  - “关键事件”移动到“目标价”上方，财报时间与反应信息优先展示',
      '  - 股票趋势页移除“最近交易记录”卡片；正式交易账本及“我的持仓”计算保持不变',
      '  - 仅调整页面展示顺序与模块；不修改目标价保存、财报数据、持仓、交易或比赛数据',
    ],
    itemsEn: [
      '🧭 Simplified the stock-trend module order',
      '  - Key Events now appears above Target Price so earnings timing and reaction information is presented first',
      '  - The Recent Trades card is removed from the stock-trend page; the formal trade ledger and My Position calculations remain unchanged',
      '  - This only changes module visibility and order; target saving, earnings data, holdings, trades, and competition data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.395', date: '2026-07-26',
    items: [
      '📊 季度业绩趋势恢复卡片内布局',
      '  - 季度图恢复为与年度图一致的画布、柱宽和间距，最近 6 个完整季度全部显示在卡片内',
      '  - 取消季度图横向滚动和自动右移，四位数营收与净利润标签不再因固定宽画布而越界',
      '  - 仅调整展示布局；SEC 历史数据、季度范围、缓存和财报计算口径均保持不变',
    ],
    itemsEn: [
      '📊 Restored the quarterly performance trend to the card layout',
      '  - The quarterly chart now uses the same canvas, bar width, and spacing as the annual chart, keeping the latest six complete quarters inside the card',
      '  - Horizontal scrolling and automatic right alignment are removed so four-digit revenue and net-income labels no longer overflow a fixed-width canvas',
      '  - This is presentation-only; SEC history data, the quarterly window, cache, and earnings calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.394', date: '2026-07-26',
    items: [
      '📊 季度业绩趋势排版优化',
      '  - 季度图改为展示最近 6 个完整季度，并按时间顺序重新均分横向空间，季度之间更清晰',
      '  - 季度柱宽统一为 18px；营收与净利润同时为四位数时仍保留千位分隔，标签不重叠、不越界',
      '  - 年度图、SEC 历史读取、8 季度源数据、缓存和财报计算口径均保持不变',
    ],
    itemsEn: [
      '📊 Refined quarterly performance-trend layout',
      '  - The quarterly chart now presents the latest six complete quarters in chronological order with more breathing room between periods',
      '  - Quarterly bars now use a consistent 18px width; four-digit revenue and net-income labels keep thousands separators without overlapping or overflowing',
      '  - The annual chart, SEC history retrieval, eight-quarter source data, cache, and earnings calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.393', date: '2026-07-26',
    items: [
      '🛠️ 财报历史财期读取修复',
      '  - Alphabet 的年度与季度历史现在会衔接已核验的 SEC 收入口径迁移，不再因官方概念切换而停留在较早财期',
      '  - 只有公司、相邻口径及官方重叠数据全部匹配时才合并历史；比较期重报不会冒充最新季度，冲突数据继续显示不可用',
      '  - 业绩趋势数据 schema 与本地缓存同步升级，修复上线后会重新读取官方历史，不继续复用旧结果',
      '  - 不修改财报公布值、数据库、交易、持仓、收益或比赛数据',
    ],
    itemsEn: [
      '🛠️ Fixed fiscal-period freshness in earnings history',
      '  - Alphabet annual and quarterly history now follows a verified SEC revenue-concept migration instead of stopping at an older fiscal period after the official concept changed',
      '  - History is stitched only when the company, adjacent concepts, and official overlap all match; comparative restatements cannot masquerade as the latest quarter, and conflicting data still fails closed',
      '  - The performance-trend data schema and local cache are upgraded together so the fixed official history is fetched again instead of reusing stale results',
      '  - Reported earnings actuals, databases, trades, holdings, P&L, and competition data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.392', date: '2026-07-26',
    items: [
      '📊 财报详情增加业绩趋势',
      '  - 财报详情底部新增年度与季度切换，展示近 6 个完整财年的营收、净利润和复合增速，以及近 8 个完整季度的同比与环比变化',
      '  - 柱状图默认显示真实金额并保留千位分隔；点击任一财年或季度可查看公布值、同比、净利率及季度环比，四位数标签与柱顶间距同步优化',
      '  - 历史数据读取 SEC Company Facts，严格匹配同一财期、币种和申报文件；缺失、冲突或口径不完整时显示不可用，不推测数据',
      '  - 登录鉴权、用户隔离缓存和 Vercel 现有财报函数边界保持不变；不修改数据库、交易、持仓、收益或比赛数据',
    ],
    itemsEn: [
      '📊 Performance trends added to earnings details',
      '  - Earnings details now switch between annual and quarterly views, covering six complete fiscal years of revenue, net income, and CAGR plus eight complete quarters of year-over-year and sequential changes',
      '  - The chart shows reported amounts with thousands separators by default; selecting a fiscal year or quarter reveals reported values, YoY changes, net margin, and quarterly sequential growth, with improved four-digit labels and bar spacing',
      '  - History comes from SEC Company Facts with strict period, currency, and filing matching; missing, conflicting, or incomplete disclosures fail closed instead of being estimated',
      '  - Existing authentication, user-scoped caching, and Vercel earnings-function boundaries are preserved; databases, trades, holdings, P&L, and competition data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.391', date: '2026-07-26',
    items: [
      '📘 MA200 技术分析术语优化',
      '  - “回踩历史（MA200）”统一改为更中性的“MA200 趋势重测”，近 5 次事件同步称为“近 5 次重测”',
      '  - “平均回踩幅度”和表格“回踩”分别改为“平均下探幅度”和“下探”，单次弹层统一使用“重测详情”',
      '  - 当前周期、空状态与无障碍文案同步更新；仅调整显示术语，不改变 daily-ma200-retest-v5 触发、20 日恢复、60 日结果或任何行情数据',
    ],
    itemsEn: [
      '📘 Clarified MA200 technical-analysis terminology',
      '  - “Retest history (MA200)” is renamed to the more neutral “MA200 trend retests,” with the latest-five label updated consistently',
      '  - Average-depth, table-depth, and single-event detail labels now use clearer and consistent terminology',
      '  - Current-cycle, empty-state, and accessibility copy are aligned; this display-only change does not alter daily-ma200-retest-v5 triggers, 20-session recovery, 60-session outcomes, or market data',
    ],
  },
  {
    ver: 'v10.7.9.390', date: '2026-07-26',
    items: [
      '📅 首页财报股票直达详情',
      '  - 首页财报日历中的已公布股票改为直接进入对应财报详情，返回时恢复首页原滚动位置',
      '  - 尚未公布财报的股票继续进入对应日期列表，避免进入不存在的报告或出现点击无响应',
      '  - “全部”、日历视图及现有详情数据保持不变；不修改财报接口、缓存、公布判断或官方数据解析',
    ],
    itemsEn: [
      '📅 Home earnings stocks now open report details directly',
      '  - Published stocks in the Home earnings calendar now open their matching earnings detail and return to the original Home scroll position',
      '  - Unpublished stocks continue to open their matching date list so taps never lead to a nonexistent report or a dead action',
      '  - All, calendar view, and existing detail data remain unchanged; earnings APIs, caches, publication rules, and official-data parsing are untouched',
    ],
  },
  {
    ver: 'v10.7.9.389', date: '2026-07-26',
    items: [
      '🎨 MA200 回踩界面细节优化',
      '  - 回踩详情标题改为弹层内几何居中，不再受右侧关闭按钮影响',
      '  - “触发后 60 日涨跌幅”横轴改用四位年份的 YYYY/MM 日期，事件与涨跌幅数据保持不变',
      '  - 移除“回踩历史（MA200）”标题后的说明图标；仅调整显示，不改变回踩触发、20 日恢复、60 日结果或其他业务数据',
    ],
    itemsEn: [
      '🎨 Refined MA200 retest presentation',
      '  - The retest-detail title is now geometrically centered within the sheet and is no longer offset by the close button',
      '  - The 60-session return chart now uses four-digit YYYY/MM axis dates while preserving every event and return value',
      '  - The trailing info icon is removed from the Retest history (MA200) title; these are display-only changes and do not alter triggers, 20-session recovery, 60-session outcomes, or other business data',
    ],
  },
  {
    ver: 'v10.7.9.388', date: '2026-07-26',
    items: [
      '🧭 MA200 回踩增加当前周期状态',
      '  - 最近一次回踩后持续位于 MA200 下方时，页面会继续显示原事件，并标明“等待趋势重置”、当前距 MA200 与 5 日重置进度，不重复生成回踩记录',
      '  - 只有重新连续 5 日收盘高出日线 MA200 至少 3%，才重新激活资格；之后首次收盘触及或跌破 MA200 才生成下一次事件',
      '  - 原 daily-ma200-retest-v5 触发、20 日恢复、60 日结果和近 5 次汇总保持不变；不增加生产行情请求，也不改变持仓、交易、收益、比赛或数据库数据',
    ],
    itemsEn: [
      '🧭 Current-cycle status added to MA200 retests',
      '  - When a stock remains below MA200 after its latest retest, the original event stays in place while the page shows “Waiting for trend reset,” the current distance to MA200, and five-session reset progress without creating duplicate events',
      '  - Qualification is reactivated only after 5 consecutive closes at least 3% above daily MA200; the first later close at or below MA200 then creates the next event',
      '  - Existing daily-ma200-retest-v5 triggers, 20-session recovery, 60-session outcomes, and latest-five summaries remain unchanged; no production quote request is added, and holdings, trades, P&L, competition, and database data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.387', date: '2026-07-26',
    items: [
      '🔎 MA200 单次回踩增加完整走势详情',
      '  - 点击近 5 次回踩中的任一记录，可查看触发前 5 日到触发后 60 个交易日的真实收盘价与日线 MA200 走势',
      '  - 详情默认定位最低收盘点，并分别展示最低价格与日期、距 MA200 最深位置以及第 60 日结果，避免混淆两种低点口径',
      '  - 全部价格继续使用原始收盘与官方拆股记录推导的仅拆股复权口径；不增加行情请求，也不改变持仓、交易、收益、比赛或数据库数据',
    ],
    itemsEn: [
      '🔎 Complete path details added for each MA200 retest',
      '  - Tap any latest-five retest to view the real close and daily MA200 path from five sessions before the trigger through session 60',
      '  - Details initially focus on the lowest close and separately show its price and date, the deepest distance below MA200, and the session-60 result so the two lows are not conflated',
      '  - Prices continue to use split-only adjustments derived from raw closes and official split actions; no extra market-data request is added, and holdings, trades, P&L, competition, and database data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.386', date: '2026-07-26',
    items: [
      '📐 MA200 回踩资格与 60 日结果口径完善',
      '  - 连续 5 日收盘高出日线 MA200 至少 3% 后，回踩资格在未来 60 个交易日内有效；期间首次收盘触及或跌破 MA200 才记录事件',
      '  - 近 5 次逐项结果继续观察 20 个交易日，底部改为展示触发日至第 60 个交易日收盘的真实涨跌幅；固定窗口不会因提前恢复而截断后续低点',
      '  - 页面减少重复边框，深跌标签不再被竖线遮挡，底部只保留数据截止日期；不改变持仓、交易、收益、比赛或数据库数据',
    ],
    itemsEn: [
      '📐 Refined MA200 retest qualification and 60-session outcomes',
      '  - After 5 consecutive closes at least 3% above daily MA200, retest qualification remains valid for the next 60 trading sessions; only the first close at or below MA200 records an event',
      '  - Latest-five event details keep a 20-session window, while the bottom chart now shows the real close-to-close return from the trigger through session 60; fixed windows no longer stop measuring later lows after an early recovery',
      '  - Repeated borders are reduced, deep-decline labels no longer collide with stems, and only the data-through date remains at the bottom; holdings, trades, P&L, competition, and database data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.385', date: '2026-07-26',
    items: [
      '⏱️ MA200 回踩观察窗口调整为 20 个交易日',
      '  - 回踩恢复率、平均回踩幅度、平均恢复天数、逐次结果与分布图统一使用已完成的 20 个交易日样本，更贴近可操作的短期恢复表现',
      '  - 60 个交易日最大反弹继续独立统计，并显示自己的有效样本数，避免较晚恢复抬高 20 日成功率',
      '  - 已覆盖第 20 日成功、第 21 日失败及未完成样本边界；不改变持仓、交易、收益、比赛或数据库数据',
    ],
    itemsEn: [
      '⏱️ MA200 retest observation window changed to 20 trading sessions',
      '  - Recovery rate, average retest depth, average recovery time, per-event outcomes, and the distribution chart now consistently use completed 20-session samples for a more actionable short-term view',
      '  - The 60-session maximum rebound remains a separate statistic with its own valid sample count, preventing later recoveries from inflating the 20-session success rate',
      '  - Session-20 success, session-21 failure, and incomplete-sample boundaries are covered; holdings, trades, P&L, competition, and database data are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.384', date: '2026-07-26',
    items: [
      '🧮 MA200 回踩历史数据口径修正',
      '  - 股价曲线、日线与周线 MA200、52 周高点及回踩统计统一使用原始收盘加官方拆股记录推导的仅拆股复权价，不再把现金分红混入技术指标',
      '  - 顶部汇总按可见最近 5 次触发中已完成的 60 个交易日样本计算；逐次回踩、最大反弹、恢复天数与结果全部锁定 30 个交易日',
      '  - 相对 QQQ 继续使用独立总回报复权序列；拆股数据缺失或异常时明确显示不可用，不回退到错误口径，也不改变持仓、交易、收益或比赛账本',
    ],
    itemsEn: [
      '🧮 Corrected the MA200 retest-history data basis',
      '  - Price charts, daily and weekly MA200, 52-week highs, and retest statistics now derive split-only prices from raw closes plus official split records, keeping cash dividends out of technical indicators',
      '  - The summary uses completed 60-session samples from the same visible latest-five trigger cohort, while every per-event depth, maximum rebound, recovery time, and outcome is locked to 30 sessions',
      '  - Relative QQQ keeps its separate total-return adjusted series; missing or invalid split data now reports unavailable instead of falling back to the wrong basis, without changing holdings, trades, P&L, or competition ledgers',
    ],
  },
  {
    ver: 'v10.7.9.383', date: '2026-07-26',
    items: [
      '📈 股票趋势新增 MA200 日线回踩历史',
      '  - “关键指标”下方新增近 5 次回踩统计，集中展示恢复率、平均反弹、平均回踩、恢复天数及逐次结果',
      '  - 全部结果使用真实复权日收盘和 200 个交易日均线计算；事件观察 20 个交易日，未完成事件不计入汇总',
      '  - 紧凑表格保留真实回踩与反弹路径，底部对照每次幅度；仅为历史统计，不代表未来表现，也不改变持仓、交易、收益或比赛账本',
    ],
    itemsEn: [
      '📈 Daily MA200 retest history added to Stock Trend',
      '  - A latest-five retest section below Key Metrics now summarizes recovery rate, average rebound, average depth, recovery time, and every outcome',
      '  - Every result is calculated from real adjusted daily closes and a 200-session moving average; each event is observed for 20 trading sessions and incomplete events stay out of the summary',
      '  - The compact table keeps the actual retest and rebound path with a per-event comparison chart; these are historical statistics only and do not change holdings, trades, P&L, or competition ledgers',
    ],
  },
  {
    ver: 'v10.7.9.382', date: '2026-07-25',
    items: [
      '🛠️ 收益报表净资产历史修复闭环',
      '  - 已核验融资记录从原持久化时间起生效，补齐 7 月 23 日和 7 月 24 日快照的融资负债与净资产；更早的 7 月 22 日继续保持未知',
      '  - 修复事务强制校验只更新两条目标快照、总资产完全不变且其他账户零变化，重复执行不会重复写入',
      '  - 本地真实数据库双跑和 iPhone 模拟器均验证 7 月 24 日可同时显示净资产与总资产',
    ],
    itemsEn: [
      '🛠️ Completed the historical net-assets repair in the P&L report',
      '  - The verified financing record now takes effect from its original persisted time, repairing margin debt and net assets for July 23 and July 24 while July 22 remains explicitly unavailable',
      '  - The transaction requires exactly two target snapshots, unchanged total assets, and zero changes to other accounts; repeated execution remains idempotent',
      '  - A real local database double run and iPhone Simulator both verify that July 24 shows Net Assets and Total Assets together',
    ],
  },
  {
    ver: 'v10.7.9.381', date: '2026-07-25',
    items: [
      '🧾 收益报表修正初始融资历史锚点',
      '  - 对已核验的管理员账户新增明确融资历史锚点，使用原持久化记录时间作为起点；不对其他账户自动套用',
      '  - 只补齐日终截止时间达到或晚于该起点、早于历史系统启用且融资字段仍为空的旧快照；更早日期继续保持未知',
      '  - 净资产仍严格等于总资产减融资负债；总资产、收益、交易账本、比赛及纳斯达克对比均不改动',
    ],
    itemsEn: [
      '🧾 Corrected the initial margin-history anchor in the P&L report',
      '  - A specific financing-history anchor is added only for the verified admin account, using its original persisted record time; no other account is inferred automatically',
      '  - Only empty snapshots whose close cutoff is at or after that anchor and before the history system started are repaired; earlier dates remain unavailable',
      '  - Net assets still equal total assets minus margin debt exactly; total assets, returns, trade ledgers, competition, and Nasdaq comparison remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.380', date: '2026-07-25',
    items: [
      '📊 收益报表补全净资产历史口径',
      '  - 分段名称继续保留“总资产走势”，图表内部新增红色净资产与金色总资产双曲线，点击日期同时查看两项金额',
      '  - 融资负债由数据库按每个交易日美东 17:00 的最后有效记录锁定，收盘重试和补跑保持同一口径；净资产严格等于总资产减融资负债',
      '  - 历史记录启用前的日期保持未知并明确提示，不使用当前融资余额倒推；股票收益、纳斯达克对比、比赛和交易账本计算均不改变',
    ],
    itemsEn: [
      '📊 Exact historical net assets added to the P&L report',
      '  - The segment remains named Total Assets Trend, while the chart now adds a red Net Assets line alongside the gold Total Assets line and shows both values for a selected date',
      '  - Margin debt is locked by the database to the latest effective record before 17:00 America/New_York on each trading day, keeping close retries and catch-up runs on the same basis; net assets always equal total assets minus margin debt',
      '  - Dates before margin history began remain explicitly unavailable instead of projecting the current debt backward; stock returns, Nasdaq comparison, competition, and trade-ledger calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.379', date: '2026-07-24',
    items: [
      '₿ 首页 BTC 实时行情增加独立兜底',
      '  - 有效 WebSocket 行情始终优先，并且只有收到真实 BTC tick 后才显示绿色 LIVE，连接成功但没有行情时不再误标实时',
      '  - 实时源暂时不可用时，服务端自动读取 BTC-USD.CC REST 行情，使用橙色 REST 标识并保留价格、涨跌幅与曲线',
      '  - 下一笔有效实时行情到达后自动切回 LIVE；REST 请求与缓存均留在已登录服务端，不向浏览器暴露行情密钥',
    ],
    itemsEn: [
      '₿ Independent fallback added for Home BTC quotes',
      '  - Valid WebSocket quotes always take priority, and the green LIVE label appears only after a real BTC tick instead of treating an open connection as live data',
      '  - When the realtime source is temporarily unavailable, the authenticated server automatically reads the BTC-USD.CC REST quote and keeps price, change, and the chart visible under an amber REST label',
      '  - The next valid realtime tick automatically restores LIVE; REST requests and caching remain on the authenticated server without exposing the market-data key to the browser',
    ],
  },
  {
    ver: 'v10.7.9.378', date: '2026-07-24',
    items: [
      '🧾 股票趋势新增最近财报入口',
      '  - “基本信息”下方新增最近已公布财报卡片，集中展示营收、息税前利润与每股收益的公布值、预测值和同比',
      '  - 卡片只使用真实已公布结果，并按来源区分官方数据、官方文件与基础公布值；缺失预测继续显示不可用，不做推测',
      '  - 点击整卡直接进入现有财报详情，返回后定位回原股票的财报卡片；公司估值底部摘要同步改为居中显示',
    ],
    itemsEn: [
      '🧾 Latest earnings added to Stock Trend',
      '  - A Latest Earnings card below Company Fundamentals brings together reported, estimated, and year-over-year revenue, operating profit, and EPS values',
      '  - The card uses published results only and distinguishes official data, official filings, and base reported values; missing estimates remain unavailable instead of being inferred',
      '  - Tapping the card opens the existing earnings detail directly and returns to the same stock and card position; the valuation summary is now centered as well',
    ],
  },
  {
    ver: 'v10.7.9.377', date: '2026-07-24',
    items: [
      '🧭 股票趋势标题与估值交互精简',
      '  - 页面顶部改为“股票代码 + 股票趋势”单排居中标题，保持原有返回入口与紧凑头部高度',
      '  - 点击估值曲线外的其他区域会立即关闭数据浮层，图表内继续支持切换历史数据点',
      '  - 五年估值图例整排居中；移除“口径”和“统计”说明，仅保留有效交易日、区间与中位数',
    ],
    itemsEn: [
      '🧭 Streamlined Stock Trend heading and valuation interaction',
      '  - The page header now centers the ticker and Stock Detail title on one line while preserving the Back action and compact header height',
      '  - Tapping outside the valuation chart now dismisses its data tooltip immediately, while chart taps continue selecting historical points',
      '  - The five-year valuation legend is centered, and the Basis and Statistics notes are removed while valid trading days, range, and median remain',
    ],
  },
  {
    ver: 'v10.7.9.376', date: '2026-07-24',
    items: [
      '📈 股票趋势新增公司估值',
      '  - 关键指标下方新增公司估值，展示市盈率 TTM、超过历史（5年）和预期市盈率，并提供五年历史估值曲线',
      '  - 历史统计按日频计算，曲线采用每月最后交易日；历史估值只使用当时已披露的滚动四季利润与历史股本，不引入未来数据或补造比较基准',
      '  - 目标价进度文案改为“成本至目标已完成”，计算公式保持不变',
    ],
    itemsEn: [
      '📈 Company valuation added to Stock Trend',
      '  - A new Company Valuation section below Key Metrics shows trailing P/E, Above 5Y History, forward P/E, and a five-year valuation curve',
      '  - Historical statistics use daily observations while the curve uses each month’s last trading day; historical valuation uses only trailing-four-quarter earnings and share counts available at the time, without future leakage or synthetic benchmarks',
      '  - The target-price progress label is now “Cost-to-Target Completion,” with its calculation unchanged',
    ],
  },
  {
    ver: 'v10.7.9.375', date: '2026-07-24',
    items: [
      '🔎 全站辅助字号与可读性标准',
      '  - 首页“财报日历”恢复正常字重；交易、财报日历、股票趋势、波段记录、融资测算、设置和收益比赛的辅助文字统一采用首页字号与灰度层级',
      '  - 股票趋势“相对 QQQ（3个月）”为第三列保留更宽空间，个股与 QQQ 涨跌幅继续以 11px 单行完整显示',
      '  - 全站可见文字下限固定为 10px，并新增自动门禁阻止 8px、8.5px、9px 或 9.5px 字号重新进入代码',
    ],
    itemsEn: [
      '🔎 Unified auxiliary typography and readability standard',
      '  - The Home Earnings Calendar title returns to normal weight, while auxiliary text across Trades, Earnings Calendar, Stock Trend, Wave Tracker, margin scenarios, Settings, and Return Competition now follows the Home size and gray hierarchy',
      '  - Stock Trend gives the three-month relative-QQQ metric a wider third column so both stock and QQQ returns remain fully visible on one 11px line',
      '  - All visible text now has a 10px minimum, with an automated gate preventing 8px, 8.5px, 9px, or 9.5px text from re-entering the codebase',
    ],
  },
  {
    ver: 'v10.7.9.374', date: '2026-07-24',
    items: [
      '🧩 持仓业务构成完整覆盖',
      '  - META、MSFT、IBKR、NOK、NVDA 与 TSM 财报详情接入各自官方报告中的业务构成；未披露维度继续显示不可用，不使用推测值',
      '  - 台积电按当前财期展示报告分部、平台收入、地区收入与制程结构，并明确标记为公司官方文件',
      '  - QQQ 与 TQQQ 改为展示 Invesco / ProShares 官方指数成分和行业权重；TQQQ 明确使用基准指数口径，不伪装成基金直接持仓',
    ],
    itemsEn: [
      '🧩 Complete business-composition coverage for held symbols',
      '  - Earnings details for META, MSFT, IBKR, NOK, NVDA, and TSM now use business composition disclosed in each issuer’s official reports; undisclosed dimensions remain unavailable instead of being inferred',
      '  - TSMC shows its current-period reportable segment, platform revenue, geographic revenue, and process-node mix with the source identified as an official company document',
      '  - QQQ and TQQQ show official Invesco / ProShares index composition and sector weights; TQQQ is explicitly labeled as benchmark-index data rather than direct fund holdings',
    ],
  },
  {
    ver: 'v10.7.9.373', date: '2026-07-24',
    items: [
      '🧾 SEC 官方财报覆盖与详情可读性',
      '  - 财报详情按股票代码动态匹配 SEC 文件；可确认的 10-Q、10-K、20-F、6-K 或 8-K 均提供官方原文入口，不再受固定公司白名单限制',
      '  - NVIDIA 新增真实财期的报告分部、业务细分和地区收入；谷歌与特斯拉保留确定性结构化适配，台积电可匹配官方 6-K 与公布值；其他未适配公司的深层数据保持不可用而不猜测',
      '  - 财报详情页字号统一放大 1px，完整分享长图同步提升字号并修复长列表导出的排版与可读性',
    ],
    itemsEn: [
      '🧾 Broader SEC filing coverage and clearer earnings details',
      '  - Earnings details now resolve SEC filings dynamically by ticker; verified 10-Q, 10-K, 20-F, 6-K, or 8-K filings expose the official source link without a fixed company allowlist',
      '  - NVIDIA now includes reportable segments, business breakdowns, and geographic revenue for its real fiscal period; deterministic structured adapters remain for Alphabet and Tesla, while TSMC resolves its official 6-K and actuals; unsupported deep breakdowns stay unavailable instead of being inferred',
      '  - Earnings-detail typography is one pixel larger throughout, and full-report share images use the same larger, corrected long-layout rendering',
    ],
  },
  {
    ver: 'v10.7.9.372', date: '2026-07-23',
    items: [
      '📊 独立财报详情与业务细分',
      '  - 财报日历改为保留底部导航的独立页面，已发布公司可继续进入“代码 + 财报详情”，返回时保留日历视图与首页滚动位置',
      '  - 谷歌与特斯拉首期接入 SEC 官方 10-Q 报告分部、产品/服务细分和地区收入；口径不明确时显示不可用，不以推测值补齐',
      '  - 详情头部同步展示营收、息税前利润和每股收益的公布值/同比与预测值/同比；利润预测保持“—”，财务金额按原币种以万/亿显示',
      '  - 右上角分享可生成完整财报长图并调起系统分享面板，长图不包含返回按钮或底部导航',
    ],
    itemsEn: [
      '📊 Standalone earnings detail and business breakdowns',
      '  - Earnings Calendar is now a standalone page that keeps the global bottom navigation; published companies open a ticker-specific detail page while preserving calendar state and Home scroll position',
      '  - The first release reads official SEC 10-Q reportable segments, product/service breakdowns, and geographic revenue for Alphabet and Tesla; ambiguous fields remain unavailable instead of being inferred',
      '  - The detail header shows actual/YoY and estimate/YoY for revenue, EBIT, and EPS; the unavailable profit estimate remains an em dash and financial amounts stay in report currency',
      '  - Share creates a full-length earnings PNG and opens the system share sheet without including Back controls or the bottom navigation',
    ],
  },
  {
    ver: 'v10.7.9.371', date: '2026-07-22',
    items: [
      '📐 账户杠杆分级与资产卡同步',
      '  - 首页与交易页头部资产卡统一展示净资产、总资产、今日盈亏、累计盈亏、融资负债和账户杠杆等级',
      '  - 独立融资页的“账户杠杆”区域可打开分级说明；首页与交易页不增加说明图标',
      '  - 交易页仅只读复用个人融资状态，不改变融资余额保存、正式交易、比赛排行榜或收益报表逻辑',
    ],
    itemsEn: [
      '📐 Account leverage tiers and synchronized asset cards',
      '  - Home and Trades now share the same header structure for net assets, total assets, daily P&L, cumulative P&L, margin debt, and account leverage tier',
      '  - Tapping Account Leverage on the standalone margin page opens the tier guide without adding an explanation icon to Home or Trades',
      '  - Trades reuses personal margin status as read-only display data without changing balance persistence, formal trades, competition rankings, or P&L reports',
    ],
  },
  {
    ver: 'v10.7.9.370', date: '2026-07-22',
    items: [
      '🧭 融资情景测算独立页面',
      '  - 点击首页融资负债后进入独立测算页面，顶部保留返回与“设置余额”，原测算公式和个人余额保存逻辑不变',
      '  - 独立页面继续显示五栏底部导航并高亮首页；切换栏目会正常离开测算页，余额编辑仍使用页内二级弹层',
      '  - 融资数据继续与正式交易、比赛排行榜和收益报表隔离',
    ],
    itemsEn: [
      '🧭 Standalone margin scenario page',
      '  - Tapping margin debt on Home now opens a standalone scenario page with Back and Set Balance controls while preserving the existing formulas and personal balance save flow',
      '  - The five-tab bottom navigation remains visible with Home highlighted; changing tabs exits the scenario page, while balance editing stays in a secondary in-page sheet',
      '  - Margin data remains isolated from formal trades, competition rankings, and P&L reports',
    ],
  },
  {
    ver: 'v10.7.9.369', date: '2026-07-22',
    items: [
      '🎚️ 融资情景滑杆与历史余额修正',
      '  - 情景测算默认归零，滑杆改为对称的 -100% 至 +100%；圆点跟随当前数值，左右拖动与归零操作保持一致',
      '  - 新首页启用前留下的融资余额会按当前登录用户一次性清零；使用原更新时间防止覆盖另一设备刚保存的新余额',
      '  - 旧版无版本缓存不再回退；之后仍复用现有 margin_status 保存新余额，交易、比赛和收益报表边界不变',
    ],
    itemsEn: [
      '🎚️ Margin scenario slider and legacy balance reset',
      '  - Scenarios now start at zero with a symmetric -100% to +100% control; the thumb follows the current value and drag/reset behavior stays aligned',
      '  - Margin balances left before the new Home model are cleared once for the signed-in user, using the original update time so a newer save from another device always wins',
      '  - Unversioned legacy cache entries are no longer restored; new balances continue using the existing margin_status row without entering trades, competitions, or P&L reports',
    ],
  },
  {
    ver: 'v10.7.9.368', date: '2026-07-22',
    items: [
      '📐 首页净资产与融资情景测算',
      '  - 首页资产卡改为净资产主值，并同时展示总资产、融资负债与实时杠杆倍数；币种切换只改变展示金额',
      '  - 融资负债区域可打开双向情景测算：六个正负快捷值保持一排，连续滑杆下跌最低 -100%、上涨不设上限',
      '  - 情景只作用于股票持仓，现金与融资负债保持不变；总资产、净资产和杠杆同步计算并跟随系统涨跌配色',
      '  - 融资余额仅按当前用户保存，不进入正式交易、比赛排行榜或收益报表',
    ],
    itemsEn: [
      '📐 Home net assets and margin scenarios',
      '  - The Home asset card now leads with net assets while also showing total assets, margin debt, and live leverage; currency switching changes display amounts only',
      '  - The margin debt area opens two-way scenario analysis with six signed presets in one row and a continuous control floored at -100% with no upside cap',
      '  - Scenarios affect stock positions only while cash and margin debt stay fixed; total assets, net assets, and leverage update together using the selected market color mode',
      '  - Margin balance remains private to the current user and stays out of formal trades, competition rankings, and P&L reports',
    ],
  },
  {
    ver: 'v10.7.9.367', date: '2026-07-20',
    items: [
      '🔄 股票趋势基本信息恢复',
      '  - 在关键指标下方恢复六项公司基本面，模块标题由“公司基本信息”简化为“基本信息”',
      '  - 恢复独立鉴权请求和按用户隔离的约 6 小时缓存；缺失或季度不完整仍显示“—”，失败不阻塞走势图',
      '  - 保留目标价、关键事件、我的持仓的新顺序，以及 iOS 走势图横滑禁选修复',
    ],
    itemsEn: [
      '🔄 Stock Trend fundamentals restored',
      '  - Restored the six company fundamentals below Key Indicators, with the Chinese section title shortened to “基本信息”',
      '  - Restored the separate authenticated request and approximately six-hour per-user cache; missing or incomplete quarters still show “—” without blocking the chart',
      '  - Preserved the Target Price, Key Events, and My Position order together with the iOS chart selection guard',
    ],
  },
  {
    ver: 'v10.7.9.366', date: '2026-07-20',
    items: [
      '🧹 股票趋势信息结构调整',
      '  - 撤下“基本信息”模块及其专用接口与本地缓存，避免将不同数据源的远期市盈率误作同一动态口径',
      '  - 目标价调整到我的持仓上方，关键事件紧随目标价；持仓、交易、走势图与目标价编辑逻辑保持不变',
      '  - 修复 iOS 横滑走势图时误触发文字选择和复制菜单；点击提示、页面纵向滚动及五年缩放横移保持不变',
    ],
    itemsEn: [
      '🧹 Stock Trend information layout cleanup',
      '  - Removed the Fundamentals card, its dedicated endpoint, and local cache to avoid presenting unlike forward P/E sources as one dynamic metric',
      '  - Moved Target Price above My Position with Key Events directly below it; positions, trades, chart, and target editing remain unchanged',
      '  - Prevented iOS chart swipes from opening native text-selection and copy menus while preserving tooltips, vertical page scrolling, and five-year zooming and panning',
    ],
  },
  {
    ver: 'v10.7.9.365', date: '2026-07-20',
    items: [
      '🏢 股票趋势公司基本面',
      '  - 关键指标下新增市值、市盈率 TTM、动态市盈率、营收增长 TTM、净利润率 TTM 与自由现金流率六项真实基本面',
      '  - TTM 增长与利润率严格使用连续季度计算；季度缺失、日期错位或字段不完整时显示“—”，不补造结果',
      '  - 基本面使用独立鉴权请求和按用户隔离的约 6 小时本地缓存；临时失败不会拖住走势图、持仓或其他详情数据',
    ],
    itemsEn: [
      '🏢 Company fundamentals in Stock Trend',
      '  - Added six real fundamentals below Key Indicators: market cap, trailing P/E, forward P/E, TTM revenue growth, TTM net margin, and free-cash-flow margin',
      '  - TTM growth and margins require complete consecutive quarters; missing fields or misaligned periods show “—” instead of a fabricated result',
      '  - Fundamentals load through a separate authenticated request with an approximately six-hour per-user local cache, so temporary failures never block the chart, position, or other detail data',
    ],
  },
  {
    ver: 'v10.7.9.364', date: '2026-07-20',
    items: [
      '📍 首页返回位置记忆',
      '  - 从自选股票进入“股票趋势”前记录首页滚动位置；通过页头返回或详情页底部“首页”返回时恢复原位',
      '  - 位置只在当前会话的一次往返中使用；切换其他页面仍回顶，双击“首页”仍平滑回顶并清除旧记忆，页面布局和数据逻辑不变',
    ],
    itemsEn: [
      '📍 Remember Home position on return',
      '  - Home records its scroll position before opening Stock Trend and restores it when returning through either the header back button or the detail-page Home tab',
      '  - The position is used only for the current in-memory round trip; other navigation still returns to the top, while the existing Home double tap still scrolls smoothly to the top and clears older memory without changing layout or data logic',
    ],
  },
  {
    ver: 'v10.7.9.363', date: '2026-07-20',
    items: [
      '📊 个股相对 QQQ 三个月表现',
      '  - 股票趋势页取消“距 EMA30（日）”，改为个股三个月涨跌幅减去 QQQ 三个月涨跌幅；副行同时显示个股与 QQQ 的各自表现',
      '  - 双方严格使用相同的共同交易日起止点和复权收盘价；历史不足或 QQQ 暂不可用时显示“--”，不伪造结果',
      '  - QQQ 读取保持登录鉴权、独立失败和 15 分钟会话缓存，不阻塞详情页，也不修改持仓、交易或比赛账本',
    ],
    itemsEn: [
      '📊 Three-month stock performance versus QQQ',
      '  - Stock Trend replaces “From EMA30 (Daily)” with the stock three-month return minus the QQQ three-month return, while the detail line shows both underlying returns',
      '  - Both sides use identical common trading-date endpoints and adjusted closes; insufficient history or an unavailable QQQ response shows “--” instead of fabricating a result',
      '  - The authenticated QQQ read fails independently and uses a 15-minute session cache, so it never blocks the detail page or changes positions, trades, or the competition ledger',
    ],
  },
  {
    ver: 'v10.7.9.362', date: '2026-07-19',
    items: [
      '📈 短周期真实 MA200 日线',
      '  - 1月、3月、6月和1年走势图使用真实复权日收盘价与蓝色 MA200（日）；5年继续使用真实周收盘价与金色 MA200（周）',
      '  - 日均线先用完整历史预热再裁剪展示区间，避免1年图开头断线；图例和历史价格提示会随日线、周线周期同步切换',
      '  - 不新增行情请求，首页普通行情仍保持原有短历史窗口，持仓、交易和比赛逻辑不变',
    ],
    itemsEn: [
      '📈 Real daily MA200 for short ranges',
      '  - The 1M, 3M, 6M, and 1Y charts use real adjusted daily closes with a blue daily MA200; 5Y keeps real weekly closes with the gold weekly MA200',
      '  - The daily average is warmed from full history before the visible range is trimmed, preventing a false gap at the start of 1Y; legends and historical tooltips switch with the active daily or weekly range',
      '  - No market-data request is added: ordinary Home quotes keep their existing short-history window and position, trade, and competition logic remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.361', date: '2026-07-19',
    items: [
      '📈 走势图末端标签精简',
      '  - 移除走势图右端重复的最新股价气泡；页面头部主股价、末端圆点和点击历史价格提示保持不变',
    ],
    itemsEn: [
      '📈 Cleaner chart endpoint',
      '  - Removed the repeated latest-price bubble at the right edge while keeping the header price, endpoint dot, and interactive historical-price tooltip unchanged',
    ],
  },
  {
    ver: 'v10.7.9.360', date: '2026-07-19',
    items: [
      '📈 五年股价与 MA200 周线',
      '  - 股票趋势默认展示五年真实周收盘走势，约 260 个数据点保留细节；股价线改为细绿线并取消发光，200 周均线使用细金线贯穿图表',
      '  - 200 周均线由十年复权收盘数据预热计算，只使用已完成交易周锁定；本周未收盘不会提前改写均线',
      '  - 关键指标取消 20 日波动率，改为无分割线的日线指标与独立 MA200 周线面板，增加距均线、近四周变化和连续状态',
      '  - 行情源失败显示“暂不可用”，历史确实不足才显示周数进度；首页普通行情仍只读取原有短历史窗口',
    ],
    itemsEn: [
      '📈 Five-year price chart with weekly MA200',
      '  - Stock Trend now defaults to five years of real weekly closes with roughly 260 points; the price is a thin green line without glow and the 200-week average runs across the chart in thin gold',
      '  - The 200-week average is warmed with ten years of adjusted closes and locks only completed trading weeks, so an unfinished week never advances it early',
      '  - The 20-day volatility tile is replaced by a borderless daily-indicator row and a dedicated weekly-MA panel with distance, four-week change, and consecutive status',
      '  - Provider failures show unavailable while genuinely short history shows its week count; ordinary Home quotes keep their existing short history window',
    ],
  },
  {
    ver: 'v10.7.9.359', date: '2026-07-19',
    items: [
      '📈 股票趋势详情修正',
      '  - 自选详情页标题改为“股票趋势”，并保留现有五栏底部导航，可直接返回首页或切换其他模块',
      '  - 成本至目标进度改为显示真实有符号数值；现价低于平均成本时允许负数，但进度点始终限制在轨道内',
      '  - 公司 Logo 与首页共用同一回退链和本地缓存，单个来源失败会继续尝试其他来源',
      '  - 取消目标价整卡按压缩放，点击编辑和保存逻辑保持不变',
    ],
    itemsEn: [
      '📈 Stock-trend detail corrections',
      '  - The Chinese watchlist-detail title is now “股票趋势” and the page keeps the existing five-tab bottom navigation for direct module switching',
      '  - Cost-to-target progress now shows the real signed value; prices below average cost can be negative while the visual marker stays inside the track',
      '  - Company logos share the Home fallback chain and local cache, continuing to another provider when one source fails',
      '  - The target-price card no longer scales on press, while editing and saving behavior remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.358', date: '2026-07-19',
    items: [
      '📈 自选股票详情与个人目标价',
      '  - 首页“自选”中点击股票代码和名称区域可进入独立详情页；价格、涨跌和回撤区域保持原有滚动与排序交互',
      '  - 详情页使用真实复权收盘数据展示 1月、3月、6月、1年走势，以及距52周高点、MA200、EMA30 和 20日年化波动率',
      '  - 持仓和正式交易记录自动读取且不可编辑；个人目标价独立保存在自选表，不修改持仓、交易或比赛账本',
      '  - 股票报价、指标、目标价、平均成本和交易价格固定使用美元；仅持仓市值与持仓盈亏跟随系统币种，中英文同步切换',
    ],
    itemsEn: [
      '📈 Watchlist stock detail and personal target price',
      '  - Tap the symbol and company-name area in the Home watchlist to open the standalone detail page; price, change, and drawdown cells keep their existing scroll and sort behavior',
      '  - The detail page uses real adjusted closes for 1M, 3M, 6M, and 1Y charts plus distance from the 52-week high, MA200, EMA30, and 20-day annualized volatility',
      '  - Positions and formal trades are read-only; the personal target is isolated in the watchlist and never changes positions, trades, or the competition ledger',
      '  - Stock quotes, indicators, targets, average cost, and trade prices stay in USD; only position market value and P&L follow the shared currency, with synchronized Chinese and English UI',
    ],
  },
  {
    ver: 'v10.7.9.357', date: '2026-07-19',
    items: [
      '📊 财报息税前利润与首页双击回顶',
      '  - 已发布财报增加“息税前利润”，展示公布值和同比；预测值和预测同比均显示“—”，不参与超预期或不及预期判断',
      '  - 首页根页面连续双击底部“首页”按钮可平滑返回顶部；单击导航、页面数据和现有底栏布局保持不变',
    ],
    itemsEn: [
      '📊 Earnings EBIT and Home double-tap scroll',
      '  - Published earnings add reported EBIT and YoY; estimate value and estimate YoY are both shown as “—” and do not affect beat-or-miss classification',
      '  - Double-tapping the active Home tab smoothly returns to the top while single-tap navigation, page data, and the existing bottom-nav layout stay unchanged',
    ],
  },
  {
    ver: 'v10.7.9.356', date: '2026-07-18',
    items: [
      '🏆 比赛榜单刷新状态提示',
      '  - 旧榜单继续显示；确认存在新发布并读取完整榜单时，在“我的排名”卡片右上角显示“正在加载最新榜单…”',
      '  - 请求结束后提示自动消失，不新增请求，也不改变收益、排名、快照或缓存刷新逻辑',
    ],
    itemsEn: [
      '🏆 Competition leaderboard refresh status',
      '  - The cached ranking stays visible while a compact notice appears in the My Rank card only when a newer publication requires the full leaderboard',
      '  - The notice clears when the request settles without adding requests or changing return, ranking, snapshot, or cache-refresh logic',
    ],
  },
  {
    ver: 'v10.7.9.355', date: '2026-07-18',
    items: [
      '🏆 iOS 比赛榜单自动刷新修复',
      '  - iOS 主屏应用恢复前台时不再被可能失真的离线状态拦截，会按原有规则主动核对最新发布状态',
      '  - 比赛状态与榜单读取强制绕过 WebKit 响应缓存；被系统挂起的请求会自动超时释放并重试，不再依赖手动刷新',
      '  - 收益、排名、QQQ、参赛资格、快照生成和发布标记逻辑全部保持不变',
    ],
    itemsEn: [
      '🏆 iOS competition auto-refresh fix',
      '  - Returning to the iOS Home Screen app is no longer blocked by a potentially stale offline hint and rechecks publication through the existing rules',
      '  - Competition status and leaderboard reads bypass the WebKit response cache, while suspended requests time out, release, and retry without a manual reload',
      '  - Returns, ranking, QQQ, eligibility, snapshot generation, and publication-marker logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.354', date: '2026-07-18',
    items: [
      '📈 首页股票收盘价口径修正',
      '  - 首页自选与持仓在盘后或休市时改为显示最近正式收盘价，不再展示盘后成交价',
      '  - 涨跌幅和距52周高回撤同步使用同一收盘价口径；正常盘中继续显示实时行情',
      '  - 正式收盘价缺失时显示“--”，不会用盘后价伪装为收盘价',
    ],
    itemsEn: [
      '📈 Home stock close-price correction',
      '  - Home watchlist and holdings now show the latest official close after hours or while the market is closed instead of an after-hours trade',
      '  - Change and 52-week drawdown use that same close-price basis, while regular-session prices remain live',
      '  - A missing official close is shown as “--” rather than substituting an after-hours price',
    ],
  },
  {
    ver: 'v10.7.9.353', date: '2026-07-18',
    items: [
      '📡 首页当前回撤面板升级',
      '  - 点击当前信号右侧回撤区域可打开股票回撤面板，默认保持原有股票顺序，并支持按回撤深浅切换排序',
      '  - 面板统一显示“当前回撤 · 距52周新高”，股票样式沿用首页添加股票列表，并保留当前基准高亮',
      '  - 盘中显示实时状态和美东开盘 09:30:00；收盘后锁定正式收盘价，不用盘后成交冒充收盘回撤',
    ],
    itemsEn: [
      '📡 Home drawdown panel upgrade',
      '  - The drawdown area in Current Signal now opens the stock panel, preserving the source order by default with optional drawdown sorting',
      '  - The panel uses “Current Drawdown · From 52W High”, matches the Home add-stock list, and keeps the active benchmark highlighted',
      '  - Live sessions show the 09:30:00 ET open time; closed sessions lock to the official close instead of treating after-hours trades as the close',
    ],
  },
  {
    ver: 'v10.7.9.352', date: '2026-07-16',
    items: [
      '🏆 收益比赛标题恢复',
      '  - 顶部卡片恢复“本日收益率”，不再把快照日期加入收益率标题',
      '  - 榜单左侧标题恢复“收益率排行榜”；收益率、QQQ 基准、跑赢 QQQ 三列和实际排序规则保持不变',
    ],
    itemsEn: [
      '🏆 Competition labels restored',
      '  - The top card again shows “Daily Return” without adding the snapshot date to the metric label',
      '  - The left leaderboard title is restored to “Return Ranking”; the return, QQQ benchmark, Beat QQQ columns, and ranking calculation remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.351', date: '2026-07-16',
    items: [
      '🏆 收益比赛受保护补漏入口',
      '  - 晚间重试任务支持在美东 17:00 前手动修复最近一个已完成收盘日，不必让系统漏快照拖到下一次自动窗口',
      '  - 补漏只能选择最近已完成的真实美股交易日，不接受任意日期；仍按交易日顺序补齐且重复执行不重复写',
      '  - 继续使用原有 Cron 密钥、真实正式账本与 EOD 收盘，不开放公共修复接口，也不生成估算收益',
    ],
    itemsEn: [
      '🏆 Protected competition catch-up entry',
      '  - The late-retry job can manually repair the latest completed close before 17:00 ET instead of leaving a system gap until the next automatic window',
      '  - Recovery is limited to the latest completed real US session, never an arbitrary date, and remains ordered and idempotent',
      '  - The existing Cron secret, formal ledger, and real EOD close remain authoritative; no public repair endpoint or estimated return is introduced',
    ],
  },
  {
    ver: 'v10.7.9.350', date: '2026-07-16',
    items: [
      '🏆 收益比赛日榜完整补齐与真实日期修复',
      '  - 自动从上一份锁定快照顺序补齐缺失收盘日，补成完整批次后立即发布，不让用户承担系统漏快照',
      '  - 发布前按真实参赛队列逐人核对目标日锁定快照；7/8 或 8/9 只会重试，绝不会冒充完整榜单',
      '  - 日榜指标和底部说明改为实际快照日期，不再把稍后的发布动作时间显示成当天收益日期',
    ],
    itemsEn: [
      '🏆 Complete competition catch-up and truthful daily dates',
      '  - Missing close days are repaired in order from the last locked snapshot and published immediately after the batch becomes complete',
      '  - Publication verifies every ranked member against the exact target-date locked batch; 7/8 or 8/9 retries instead of appearing complete',
      '  - Daily metrics and the footer now show the actual snapshot date rather than presenting the later publication action as the return date',
    ],
  },
  {
    ver: 'v10.7.9.349', date: '2026-07-16',
    items: [
      '🏆 收益比赛 PWA 等待状态恢复',
      '  - 修复真实完整快照已经发布后，iOS 主屏 PWA 仍停留在“等待下一次真实收盘快照”的问题',
      '  - 已耗尽完整榜单读取次数的合资格等待页会继续每分钟检查轻量发布状态，发现日期或版本推进后才读取完整榜单',
      '  - 比赛缓存升级到 v5 并淘汰已卡住的旧缓存；不修改收益、排名、快照、交易、参赛资格或发布标记',
    ],
    itemsEn: [
      '🏆 Competition PWA waiting-state recovery',
      '  - Fixes an iOS Home Screen PWA that could remain on “Waiting for the next real close snapshot” after a complete real snapshot was already published',
      '  - An eligible waiting page that has exhausted full leaderboard reads continues minute-bounded lightweight publication checks and fetches the full board only after the date or version advances',
      '  - Competition cache v5 discards the stuck legacy cache without changing returns, rankings, snapshots, trades, eligibility, or publication markers',
    ],
  },
  {
    ver: 'v10.7.9.348', date: '2026-07-16',
    items: [
      '🏆 收益比赛历史真实榜单恢复',
      '  - 修复发布标记升级后旧真实快照仍在数据库、但榜单被错误显示为等待下一次收盘的问题',
      '  - 只恢复已经逐账户完整锁定的最近历史批次;缺少任一应参赛账户时严格拒绝发布',
      '  - 不生成、不补写也不修改任何收益快照;07/14、07/15 的缺口继续由正式收盘任务补齐',
    ],
    itemsEn: [
      '🏆 Restore the real historical competition board',
      '  - Fixes the upgrade state where real historical snapshots remained in the database but the board incorrectly showed that it was waiting for the next close',
      '  - Only the latest historical batch locked for every expected member can be restored; any missing expected member fails closed',
      '  - No return snapshot is generated, backfilled, or modified; gaps for July 14 and July 15 remain assigned to the formal close job',
    ],
  },
  {
    ver: 'v10.7.9.347', date: '2026-07-16',
    items: [
      '🏆 收益比赛超额收益排行与内部成交规则修正',
      '  - 每位用户保留本人自然周期内的真实累计收益和固定参赛起点,不会因新用户加入而修改日期或清空累计收益',
      '  - QQQ 从该用户本人同一计算起点开始计算;榜单按“本人收益率 - 本人同期 QQQ 收益率”的超额收益从高到低排列',
      '  - 新用户首份有效收盘后即可进入日/周/月/年榜;参赛人数显示已报名总人数,比例统计只计算真实数据完整的用户',
      '  - 内部比赛接受正式账本记录的正数成交价,不再用 provider raw high/low 拒绝;真实目标日收盘与其他账本安全规则不变',
    ],
    itemsEn: [
      '🏆 QQQ-outperformance ranking and internal execution-rule fixes',
      '  - Every member keeps the real cumulative return within the selected calendar period and their fixed personal competition start; a newcomer never resets another member’s date or return',
      '  - QQQ is calculated from that same member-specific start, and rankings sort by member return minus the member’s same-period QQQ return',
      '  - A newcomer enters the day, week, month, and year boards after the first valid close; participant count shows all enrolled members while rate statistics use only complete real data',
      '  - The internal competition accepts positive execution prices from the formal ledger without provider raw high/low rejection; exact target closes and all other ledger safeguards remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.346', date: '2026-07-16',
    items: [
      '🏆 收盘快照同步与比赛按需刷新',
      '  - 个人收益报表和收益比赛改由同一受保护收盘调度同时启动,避免独立定时任务产生较长时间差',
      '  - 比赛整批完成后才发布不含用户数据的完成标记,部分写入不会提前显示为新榜单',
      '  - 可见旧榜每分钟最多读取一次轻量状态;日期或版本推进时才读取完整榜单,多标签页不会回退旧版本',
      '  - 两套快照表、D1/D2、账本哈希、revision CAS 和无模拟收益规则保持不变',
    ],
    itemsEn: [
      '🏆 Synchronized close snapshots and on-demand competition refresh',
      '  - Personal P&L and competition jobs now start from one protected close scheduler, avoiding long delays between independent cron invocations',
      '  - A privacy-safe completion marker is published only after the full competition batch completes, so partial writes never expose a new leaderboard',
      '  - Visible stale rankings check lightweight status at most once per minute and fetch the full leaderboard only on a publication advance, without cross-tab rollback',
      '  - Separate snapshot tables, D1/D2, ledger hashes, revision CAS, and the no-synthetic-return rule remain unchanged',
    ],
  },
  {
    ver: 'v10.7.9.345', date: '2026-07-16',
    items: [
      '📊 账户零余额记录与走势口径修正',
      '  - 月度余额填 0 或清空后保存,等同删除该账户该月份的个人记录,不再保存零值快照',
      '  - 历史零值按不存在处理,走势从剩余第一个正数月份重新起算,最低/最高资产和累计增长同步重算',
      '  - 删除只限定当前登录用户、精确账户和精确月份,并同步清理离线缓存,不影响其他账户或月份',
      '  - 只修改账户资料而未触碰余额时不会误删;批量补录也只处理用户实际改动的输入',
      '  - 当前月份按设备本地年月生成,避免月初因 UTC 时差把删除或补录作用到上个月',
    ],
    itemsEn: [
      '📊 Zero-balance record and account-trend fixes',
      '  - Saving a monthly balance as 0 or blank now deletes that personal account-month record instead of persisting a zero snapshot',
      '  - Legacy zero rows are treated as absent; the trend restarts from the first remaining positive month and recalculates lows, highs, and cumulative growth',
      '  - Deletion is scoped to the signed-in user, exact account, and exact month, and also clears the matching offline cache without touching other records',
      '  - Editing account details without touching the balance cannot delete it; bulk entry likewise processes only inputs the user actually changed',
      '  - The current month now follows the device calendar month, preventing UTC offsets at month boundaries from targeting the previous month',
    ],
  },
  {
    ver: 'v10.7.9.344', date: '2026-07-16',
    items: [
      '📊 财报一致预期与延迟补数修正',
      '  - 同一精确财季的 0q Trends EPS 一致预期优先,Calendar 仅作回退,并按最终预期重算超预期幅度',
      '  - EPS 明确标注报告币种,营收继续按真实汇率换算为 USD,不再混用币种标签',
      '  - 已公布但真实营收 actual 缺失时,报告日起两天内有界补拉,保留五分钟节流和 PWA 恢复检查',
      '  - 局部回包的 null 不覆盖已有真实 actual;生产不使用 mock 或网页数字补结果',
    ],
    itemsEn: [
      '📊 Earnings consensus and delayed-result refresh fixes',
      '  - Exact-fiscal-quarter 0q Trends EPS consensus now takes priority, with Calendar only as fallback and surprise recomputed from the final estimate',
      '  - EPS is labeled in the report currency, while revenue remains converted to USD with real FX data so the two units are explicit',
      '  - Published reports still missing real revenue actuals are rechecked within two days of the report date, retaining five-minute throttling and PWA resume checks',
      '  - Partial null responses never overwrite an existing real actual; production uses neither mock data nor figures copied from web pages to fill results',
    ],
  },
  {
    ver: 'v10.7.9.343', date: '2026-07-16',
    items: [
      '📊 账户走势口径与金额排序修正',
      '  - 账户走势初次打开不再默认显示月份浮层,点击柱图后才显示,点击图表外只关闭小浮层',
      '  - 近 12 个月缺少早期快照时,累计增长从窗口内首个真实月份起算;缺月继续留空,不补零或插值',
      '  - 只有一个真实月份时累计增长为 0.0%;真实零起点明确显示“起点为 0”,不伪造百分比',
      '  - 每位家庭成员的账户按当前余额折算人民币后从高到低排列,USD/HKD 复用现有每日汇率,不写回数据库排序',
    ],
    itemsEn: [
      '📊 Account trend basis and value ordering fixes',
      '  - Account trends now open without a month tooltip; tapping a bar shows it, while tapping outside the chart dismisses only the small tooltip',
      '  - When early snapshots are missing, growth over the last twelve months starts at the first real month inside the window; missing months remain empty without zero-filling or interpolation',
      '  - One real month produces 0.0% growth, while a real zero starting balance is labeled “Started From 0” instead of inventing a percentage',
      '  - Each family member’s accounts are ordered by current CNY-equivalent balance, using the existing daily rates for USD and HKD without writing a new database order',
    ],
  },
  {
    ver: 'v10.7.9.342', date: '2026-07-16',
    items: [
      '📊 单个账户真实资产走势',
      '  - 点击账户名称可查看该精确账户近 12 个月的真实月度余额柱状图,同名账户不会合并',
      '  - 金额、环比、最低和最高资产均使用账户原币;缺月不补零、不插值或沿用旧余额',
      '  - 右侧金额继续打开原有修改与删除,账户和月度余额写入逻辑保持不变',
      '  - 柱图提示与图形分区显示,支持连续滑动选月并保持移动端安全间距',
    ],
    itemsEn: [
      '📊 Real asset trend for each account',
      '  - Tap an account name to view twelve months of real monthly balances for that exact account; accounts with the same name are never merged',
      '  - Amounts, month-over-month changes, lows, and highs stay in the account currency; missing months are never filled, interpolated, or carried forward',
      '  - The amount still opens the existing edit and delete actions, while account and monthly-balance writes remain unchanged',
      '  - The tooltip and bars use separate regions, with continuous month selection and mobile-safe spacing',
    ],
  },
  {
    ver: 'v10.7.9.341', date: '2026-07-15',
    items: [
      '📊 财报盘前实时与正式收盘反应',
      '  - ASML 使用 EODHD 真实结果:实际 EPS 7.58、预期 7.98;实际营收尚未返回时继续显示 --',
      '  - 盘前反应复用现有已登录 WebSocket 实时价与前一交易日普通收盘价,正式收盘后切换并锁定普通 close 反应',
      '  - EUR 营收按真实外汇数据换算 USD,EPS 同比统一使用同一财报口径',
      '  - unknown 时段不猜测;收盘后自动补读,全流程不使用 mock、预期值或估算值冒充真实结果',
    ],
    itemsEn: [
      '📊 Live pre-market and official close earnings reactions',
      '  - ASML uses real EODHD results: actual EPS 7.58 versus estimate 7.98; actual revenue remains -- while the provider has not returned it',
      '  - The pre-market reaction reuses the existing authenticated WebSocket quote against the previous ordinary close, then switches to and locks the official ordinary-close reaction',
      '  - EUR revenue is converted to USD with real FX data, while EPS year-over-year comparisons use one consistent earnings basis',
      '  - Unknown sessions are never guessed; the calendar automatically rechecks after the close and never substitutes mock, estimate, or inferred results',
    ],
  },
  {
    ver: 'v10.7.9.340', date: '2026-07-15',
    items: [
      '📅 财报已公布数据自动刷新',
      '  - 财报日历按美东发布时段判断待刷新股票,不受手机时区影响',
      '  - iOS 主屏 PWA 恢复、重新聚焦或恢复联网后,会自动检查到期财报',
      '  - 只请求已到期且缺少真实结果的股票,五分钟限频并保留现有日历',
      '  - 仅真实 EPS 或营收 actual 可标记已公布;时间、预期和演示数据绝不代替',
    ],
    itemsEn: [
      '📅 Automatic refresh for published earnings data',
      '  - Earnings Calendar identifies due symbols by New York release windows, independent of the phone time zone',
      '  - The iOS Home Screen PWA automatically checks due earnings after resume, focus, or reconnect',
      '  - Only due symbols still missing real results are requested, with a five-minute limit while the existing calendar remains visible',
      '  - Only real EPS or revenue actuals can mark an event published; timing, estimates, and demo data never substitute',
    ],
  },
  {
    ver: 'v10.7.9.339', date: '2026-07-15',
    items: [
      '🕒 收益比赛显示真实更新时间',
      '  - “最后更新 MM.DD”改为更紧凑的“更新 MM.DD HH:mm”',
      '  - 分钟取自当日已锁定比赛快照中最晚的真实 locked_at,不使用手机当前时间',
      '  - 时间固定按美东时区显示,不受客户手机时区影响',
      '  - 比赛缓存升级一次以立即读取真实分钟;排名、收益和交易账本保持不变',
      '  - iOS 主屏 PWA 从后台恢复时会重新检查收盘窗口,到期后自动读取新快照',
    ],
    itemsEn: [
      '🕒 Real Competition update timestamp',
      '  - Last updated MM.DD becomes the more compact Updated MM.DD HH:mm',
      '  - Minutes come from the latest real locked_at among that day’s locked Competition snapshots, never the phone clock',
      '  - The timestamp is fixed to New York time and does not depend on the customer device time zone',
      '  - Competition cache advances once to load the real minute immediately; ranking, returns, and the trade ledger are unchanged',
      '  - The iOS Home Screen PWA rechecks the close window on resume and automatically reads a new snapshot when due',
    ],
  },
  {
    ver: 'v10.7.9.338', date: '2026-07-15',
    items: [
      '🏆 收益比赛本人信息行优化',
      '  - 本人昵称与“最后更新”调整到同一水平行,头卡更加紧凑',
      '  - 昵称缩小为 12px 并使用排行榜普通用户名同款灰白色',
      '  - 头像居中的安全宽度由 72px 增至 80px,目标昵称可完整显示',
      '  - 比赛缓存、请求、排名、收益、快照、交易账本和服务端逻辑保持不变',
    ],
    itemsEn: [
      '🏆 Refined the signed-in identity row in Competition',
      '  - The nickname and Last updated now share one horizontal row for a tighter header card',
      '  - The nickname uses a compact 12px size and the same muted color as standard leaderboard names',
      '  - Its avatar-centered safe width grows from 72px to 80px so the target nickname displays in full',
      '  - Competition caching, requests, ranking, returns, snapshots, the trade ledger, and server logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.337', date: '2026-07-15',
    items: [
      '🏆 收益比赛本人昵称与头卡紧凑化',
      '  - 头像下方本人昵称放大为更清晰的半粗体高对比文字',
      '  - “最后更新”上移并收紧头卡底部留白,整体高度更加紧凑',
      '  - 头像、排名、三项收益指标和排行榜昵称位置保持不变',
      '  - 比赛缓存、请求、排名、收益、快照、交易账本和服务端逻辑保持不变',
    ],
    itemsEn: [
      '🏆 Refined signed-in identity hierarchy in Competition',
      '  - The nickname below the avatar is now larger, semibold, and higher contrast',
      '  - Last updated moves upward while the header card bottom spacing becomes more compact',
      '  - Avatar, rank, three return metrics, and leaderboard nicknames keep their positions',
      '  - Competition caching, requests, ranking, returns, snapshots, the trade ledger, and server logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.336', date: '2026-07-15',
    items: [
      '📐 持仓市值长金额完整显示',
      '  - 名称/代码列缩小 8px,市值/数量列同步增加 8px',
      '  - 表格总宽和其余四列保持不变,千万级人民币市值不再显示省略号',
      '  - 开发预览加入超过 1000 万人民币的 NVDA 市值边界样例',
      '  - 金额计算、汇率、持仓数据、交易账本和接口保持不变',
    ],
    itemsEn: [
      '📐 Full display for long position market values',
      '  - Shifted 8px from Name/Ticker to Market Value/Quantity',
      '  - Total table width and the other four columns are unchanged, so eight-digit CNY values no longer truncate',
      '  - The development preview now covers an NVDA market value above CNY 10 million',
      '  - Amount calculations, FX, position data, the trade ledger, and APIs are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.335', date: '2026-07-15',
    items: [
      '⬛ 资产页与收益比赛卡片黑色统一',
      '  - 资产页走势图和账户分组卡统一为首页标准黑色与灰色边框',
      '  - 收益比赛的排名头卡、统计卡、排行榜、基准卡和状态卡同步统一',
      '  - 保留本人排行高亮、头像资料卡和参赛弹窗等有意义的状态色',
      '  - 资产数据、比赛缓存、请求、排名、收益、交易账本和服务端逻辑保持不变',
    ],
    itemsEn: [
      '⬛ Unified black cards across Assets and Competition',
      '  - Asset trend and account-group cards now match the standard Home black and neutral border',
      '  - Competition rank header, statistics, leaderboard, benchmark, and status cards use the same shell',
      '  - Meaningful state colors remain intact for the signed-in row, profile popover, and join sheet',
      '  - Asset data, competition caching, requests, ranking, returns, the trade ledger, and server logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.334', date: '2026-07-14',
    items: [
      '🏆 收益比赛头卡与页面宽度优化',
      '  - 更新时间精简为“最后更新 MM.DD”,日期继续读取服务端真实快照日期',
      '  - 我的社区昵称显示在头像下方,字号和间距更清晰',
      '  - 比赛卡片与首页统一 16px 左右边距和 430px 最大内容宽度',
      '  - 缓存、请求、排名、比赛收益、交易账本和服务端数据逻辑保持不变',
    ],
    itemsEn: [
      '🏆 Competition header and page-width refinement',
      '  - The update label is shortened to “Last updated MM.DD” while continuing to use the real server snapshot date',
      '  - The signed-in community nickname now appears below the avatar with clearer size and spacing',
      '  - Competition cards now match Home with 16px side gutters and the same 430px maximum content width',
      '  - Caching, requests, ranking, competition returns, the trade ledger, and server data logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.333', date: '2026-07-14',
    items: [
      '📐 收益比赛更新时间对齐',
      '  - “数据更新MM.DD”左边缘与上方“跑赢 QQQ”标签统一对齐',
      '  - 日期行复用头像与三项收益指标的同一网格,不依赖固定像素偏移',
      '  - 实际快照日期、缓存读取、比赛收益和服务端数据逻辑保持不变',
    ],
    itemsEn: [
      '📐 Competition update-label alignment',
      '  - The Updated MM.DD label now starts on the same left edge as Beat QQQ above it',
      '  - The date row reuses the avatar and three-metric grid instead of a fixed pixel offset',
      '  - The actual snapshot date, cache reads, competition returns, and server data logic are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.332', date: '2026-07-14',
    items: [
      '🏆 收益比赛读取与头部信息优化',
      '  - 已生成的比赛快照按账户和榜单周期安全缓存,普通进入不再重复读取',
      '  - 仅在美东收盘后检查新快照,延迟时最多追加一次有界重试,下次有效收盘再强制检查',
      '  - 我的头像移到排名下方,本日收益率、QQQ 基准和跑赢 QQQ 向右紧凑排列',
      '  - 更新时间按实际快照日期动态显示为“数据更新MM.DD”,不写死日期、不展示估算数据',
    ],
    itemsEn: [
      '🏆 Competition snapshot reads and header refinement',
      '  - Completed competition snapshots are cached safely per account and ranking period to avoid repeated reads on normal entry',
      '  - New snapshots are checked only after the New York close window, with one bounded late retry before the next eligible close',
      '  - The signed-in avatar now sits below the rank while daily return, QQQ benchmark, and QQQ outperformance align compactly to its right',
      '  - The update label uses the actual snapshot date in MM.DD format with no hard-coded date or estimated result',
    ],
  },
  {
    ver: 'v10.7.9.331', date: '2026-07-14',
    items: [
      '📏 主动投资价值结果行紧凑化',
      '  - 当前标的和 QQQ 的收益金额与收益率改为同一行展示,减少纵向占用',
      '  - 跑赢金额与收益率差同步横向排列,窄屏保留安全换行兜底',
      '  - 中英文和人民币金额在 iPhone 17 Pro 上均无卡片内横向溢出',
      '  - 收益计算、普通收盘价口径、同期现金流、API、账本和鉴权不变',
    ],
    itemsEn: [
      '📏 Compact Active Investment Value result rows',
      '  - The current stock and QQQ now show return amounts and return rates on one row to reduce vertical space',
      '  - The excess amount and return-rate gap also align horizontally with a safe narrow-screen wrap fallback',
      '  - English, Chinese, and CNY amounts remain free of card-level horizontal overflow on iPhone 17 Pro',
      '  - Return calculations, ordinary-close methodology, matched cash flows, APIs, the ledger, and authentication are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.330', date: '2026-07-14',
    items: [
      '🧾 主动投资价值分享卡信息精简',
      '  - 删除标题下方的 QQQ 同期投资假设提示,保留真实对比结果',
      '  - 日期说明仅保留等额加仓和同持仓比例减仓,取消重复的普通收盘价尾注',
      '  - 移除“复制对比文字”按钮和剪贴板操作,预览卡继续可打开和关闭',
      '  - 收益计算、真实普通收盘价口径、同期现金流、API、账本和鉴权不变',
    ],
    itemsEn: [
      '🧾 Active Investment Value card cleanup',
      '  - Removed the same-period QQQ investment assumption under the title while preserving the real comparison results',
      '  - The date note now keeps only equal-value adds and same-ratio trims without the repeated ordinary-close suffix',
      '  - Removed the Copy Comparison button and clipboard action while keeping the preview available and dismissible',
      '  - Return calculations, real ordinary-close methodology, matched cash flows, APIs, the ledger, and authentication are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.329', date: '2026-07-14',
    items: [
      '📈 收益图表触摸与浮层体验修复',
      '  - 收益走势和收益对比在 iOS 连续滑动时,日期、十字线与金额保持同步',
      '  - 收益对比小浮层点击图外立即关闭,12 秒无操作后自动关闭,关闭后可再次点开',
      '  - 主动投资价值分享卡恢复系统标准灰色外边框,内部数据卡层级不变',
      '  - 不改收益计算、普通收盘价、同期现金流、API、交易账本或鉴权',
    ],
    itemsEn: [
      '📈 Return-chart touch and tooltip fixes',
      '  - Dates, crosshairs, and amounts now stay synchronized during continuous iOS drags on both the P&L and Return Comparison charts',
      '  - The Return Comparison tooltip closes immediately when tapping outside, auto-closes after 12 seconds of inactivity, and can be opened again',
      '  - The Active Investment Value share card restores the standard system gray outer border while preserving its inner data-card hierarchy',
      '  - Return calculations, ordinary closes, matched cash flows, APIs, the trading ledger, and authentication are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.328', date: '2026-07-14',
    items: [
      '📊 收益对比统一普通收盘价与收益率',
      '  - 个股与 QQQ 均通过已登录服务端接口读取 EODHD 普通收盘价,不再混用个人快照价格与 QQQ 普通收盘价',
      '  - 个人收益快照只用于日期和持仓股数一致性核验;任一标的缺少必要普通收盘价时整卡不可用',
      '  - 主卡保留金额主展示和收益率辅助展示;超额金额与收益率差分开标注,率差使用百分号紧凑显示,口径明确为我的收益率减 QQQ 收益率',
      '  - 图表触摸小浮层的个股与 QQQ 行只保留收益金额,最终收益率差继续显示;主动投资价值分享卡仅取消最外层白色描边',
      '  - 只读正式交易与个人快照,不写交易账本或快照,生产无 mock 或估算收益兜底',
    ],
    itemsEn: [
      '📊 Raw-close return comparison with clearer rates',
      '  - Both the stock and QQQ now read EODHD ordinary closes through the authenticated server API instead of mixing personal snapshot prices with ordinary QQQ closes',
      '  - Personal P&L snapshots only verify dates and held-share integrity; the entire card is unavailable when either symbol lacks a required ordinary close',
      '  - Amounts remain primary with rates secondary; excess dollars stay separate from a compact percent-marked rate gap, explicitly defined as my return rate minus the QQQ return rate',
      '  - The chart touch tooltip keeps only P&L amounts on the stock and QQQ rows while retaining the final rate gap; the Active Investment Value share card only removes its outer white outline',
      '  - The feature only reads the formal ledger and personal snapshots, never writes either one, and has no production mock or estimated-return fallback',
    ],
  },
  {
    ver: 'v10.7.9.327', date: '2026-07-14',
    items: [
      '📈 个股收益对比与 QQQ 基准',
      '  - 个股收益走势下新增收益对比,跟随本年、近 1 月、近 6 月、近 1 年和全部周期',
      '  - 起点取本轮首笔买入与所选周期中较晚者当日或之后,现有个人收益快照与 QQQ 普通收盘价都有数据的首个共同日期,双方从零开始',
      '  - 后续买入按实际成交额给 QQQ 等额加仓,卖出按卖出前持仓比例同步减仓;双方使用移动均价和已实现盈亏摊薄成本',
      '  - 只读正式交易和个股收盘快照,QQQ 通过已登录服务端接口读取普通收盘价;数据缺失或不一致时显示不可用,生产无 mock',
    ],
    itemsEn: [
      '📈 Stock return comparison against QQQ',
      '  - Added Return Comparison below the stock return chart for YTD, 1M, 6M, 1Y, and All ranges',
      '  - The baseline is the first common existing personal stock snapshot and ordinary QQQ close on or after the later of the current position cycle start and selected range start; both sides begin at zero',
      '  - Later buys add the same executed dollar value to QQQ, while sells trim QQQ by the same pre-sale holding ratio; both sides use moving-average and realized-P&L-diluted cost',
      '  - The feature only reads the formal ledger and stock close snapshots; QQQ ordinary closes come through the authenticated server API, and missing or inconsistent data fails unavailable with no production mock',
    ],
  },
  {
    ver: 'v10.7.9.326', date: '2026-07-13',
    items: [
      '📊 真实美股收盘涨跌榜',
      '  - 添加自选股弹窗新增涨幅榜和跌幅榜,展示最新收盘日各 30 只普通股',
      '  - 榜单严格限定 NASDAQ、NYSE 和 NYSE American,排除 ETF、基金、优先股、权证、权利和单位',
      '  - 涨跌和收盘数据来自 EODHD,并与 Nasdaq Trader 当前上市目录交集验证;不使用演示数据或生产 mock 兜底',
      '  - 已在自选中的股票用减号表示已添加,保持不可重复点击',
    ],
    itemsEn: [
      '📊 Real U.S. close movers',
      '  - Added Top Gainers and Top Losers to Add Watchlist Stock, with 30 common stocks per side for the latest close',
      '  - The universe is strictly limited to NASDAQ, NYSE, and NYSE American and excludes ETFs, funds, preferreds, warrants, rights, and units',
      '  - EODHD close data is intersected with the current Nasdaq Trader listings; production has no demo ranking or mock fallback',
      '  - Stocks already in the watchlist now show a minus icon and remain protected from duplicate taps',
    ],
  },
  {
    ver: 'v10.7.9.325', date: '2026-07-13',
    items: [
      '📋 财报弹窗默认列表视图',
      '  - 从首页财报公司卡片点开时默认进入列表视图,更快浏览全部近期财报',
      '  - 日历视图页签和首页右侧日历按钮继续保留,可随时切换查看具体日期',
      '  - 只调整弹窗默认页签,不改财报数据、筛选、详情、API、缓存或鉴权',
    ],
    itemsEn: [
      '📋 Earnings modal defaults to List View',
      '  - Opening a company from the home earnings card now starts in List View for faster browsing',
      '  - Calendar View and the calendar shortcut remain available for date-based review',
      '  - This only changes the default tab; earnings data, filtering, details, API, cache, and authentication are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.324', date: '2026-07-13',
    items: [
      '🎯 年度路径“年底目标”文案',
      '  - 当前年度和预测年度路径里的“终点”统一改为“年底目标”,更准确表达该金额含义',
      '  - 年初起点、当前值、年末目标金额、年度计划、复利和进度计算保持不变',
    ],
    itemsEn: [
      '🎯 Year-end target label for annual paths',
      '  - Renamed the ending label on current and projected annual paths to Year-End Target for clearer meaning',
      '  - Year-start, current value, target amount, annual plan, compounding, and progress calculations are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.323', date: '2026-07-12',
    items: [
      '🌐 设置页英文翻译补全',
      '  - 补齐语言、显示、账户、邀请码、账户切换、修改密码和确认流程的英文文案',
      '  - 英文模式下“简体中文”、红绿配色、管理员和切换账户等不再回退显示中文',
      '  - 社区昵称属于用户自写内容,继续保持原文;不改账户、社区资料、邀请码或设置保存逻辑',
    ],
    itemsEn: [
      '🌐 Complete English translation for Settings',
      '  - Added English copy for language, display, account, invite-code, account-switching, password, and confirmation controls',
      '  - Simplified Chinese, market color modes, Admin, and Switch Account no longer fall back to Chinese in English mode',
      '  - User-created community nicknames remain unchanged; account, profile, invite-code, and settings persistence are unchanged',
    ],
  },
  {
    ver: 'v10.7.9.322', date: '2026-07-12',
    items: [
      '⌨️ iOS 共享弹窗聚焦输入自动可见',
      '  - iOS 键盘缩短弹窗后,当前输入框会自动滚到内容区偏上位置,并为下一个日期或字段保留显示空间',
      '  - 新增交易输入股数时可同时看到日期与买入/卖出按钮;修改账户输入余额时可同时看到币种与保存按钮',
      '  - 编辑波段继续使用自身内部滚动容器,共享弹窗宽度、标题和底部操作区保持不变',
      '  - 本次不改字段宽度、表单验证、交易或资产保存回调、数据库、RLS、鉴权或 API 边界',
    ],
  },
  {
    ver: 'v10.7.9.321', date: '2026-07-12',
    items: [
      '📱 iOS Web App 交易弹窗整卡滚动修正',
      '  - 真机确认 v320 的内层滚动修复无效;新增/修改交易改为整张弹窗唯一纵向滚动链',
      '  - 标题、股票、价格与股数、日期和买入/卖出按钮可整体拖动,避免日期被固定操作区裁住',
      '  - 仅交易录入弹窗启用新模式,其他共享弹窗继续使用原布局和宽度',
      '  - 本次不改表单验证、交易提交、stock_trades、持仓、收益快照、数据库、RLS、鉴权或 API 边界',
    ],
  },
  {
    ver: 'v10.7.9.320', date: '2026-07-12',
    items: [
      '🪟 资产走势弹窗统一与 iOS 交易滚动修复',
      '  - 12 个月资产走势切换到当前共享玻璃弹窗,取消旧标题图标、金色底部按钮和列表外侧整块内框',
      '  - 新增/修改交易在 iOS 键盘打开后可正常纵向滚动,日期输入不再被下方操作区遮挡',
      '  - 背景页仍使用 fixed + overflow hidden 锁定;月度补录、交易买入/卖出、表单验证和保存回调保持原样',
      '  - 本次不改资产计算、stock_trades、持仓、收益快照、数据库、RLS、鉴权、行情 relay、quote 或财报日历边界',
    ],
  },
  {
    ver: 'v10.7.9.319', date: '2026-07-12',
    items: [
      '🎯 年度目标摘要补充百分比',
      '  - 当前年右侧摘要框同时显示目标、实现与落后/超额百分比,并适当加宽摘要框',
      '  - 目标固定为 100%,实现按当年实际收益 ÷ 当年计划,落后/超额按差额绝对值 ÷ 当年计划计算',
      '  - 只调整年度目标摘要展示,不改年度计划、实际收益、进度条、整卡宽度或其他目标逻辑',
      '  - 本次不改交易账本、资产、收益快照、数据库、RLS、鉴权、行情 relay、quote 或财报日历边界',
    ],
  },
  {
    ver: 'v10.7.9.318', date: '2026-07-12',
    items: [
      '📈 波段目标价预测与收益曲线峰值修复',
      '  - 进行中波段的操作弹窗新增目标股价模拟,支持手动输入、当前价、成本价及按当前价计算的 +10% / +20% / +30% 快捷选项',
      '  - 预计收益金额和收益率严格按目标价、该波段成本与完整股数计算;股票单价固定 USD,预计收益金额继续跟随首页 USD/CNY 设置',
      '  - 预测只存在当前弹窗内,不保存数据库,不修改波段成本、数量、行情或买卖记录;详情、编辑和完整卖出流程保持原样',
      '  - 个股收益曲线在最新收盘点创出新高时也会显示峰值圆点与呼吸标记,最右侧文字自动向左展开避免裁切',
      '  - 同批上线 v317 的旧白色交易弹窗与不可达删除代码清理;不改 stock_trades、收益快照、RLS、鉴权、行情 relay、quote 或财报日历边界',
    ],
  },
  {
    ver: 'v10.7.9.317', date: '2026-07-12',
    items: [
      '🌑 旧白色交易弹窗与无用代码清理',
      '  - 旧波段兼容账本的“全部交易”保留原有宽版尺寸和列表结构,白色卡片统一改为当前深色玻璃视觉',
      '  - 单笔交易删除改走统一危险确认卡,列表入口保持中性,只有最终删除按钮使用系统红色',
      '  - 移除没有任何入口的旧关注列表删除状态与白色弹窗,不保留不可达兼容代码',
      '  - 本次不改旧波段账本数据、波段 V2、stock_trades、持仓、资产、目标、数据库、RLS、行情 relay 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.316', date: '2026-07-12',
    items: [
      '🪟 已确认弹窗统一为新版交易视觉',
      '  - 交易、摊薄工具、资产账户、修改密码、目标记录和首页自选结果共 15 组已确认弹窗统一使用新版玻璃卡片风格',
      '  - 各弹窗保留原有宽度与业务回调;普通操作使用中性色,最终危险确认仍由红色确认弹窗负责',
      '  - 输入框、日期框统一限制在卡片宽度内,共享弹窗跟随 iOS visual viewport,键盘弹出时保持可滚动且不跳到页面顶端',
      '  - 邀请码管理恢复显示已使用邀请码对应的注册邮箱,仅管理员入口可见',
      '  - 本次不改交易账本、资产计算、收益快照、数据库、RLS、行情 relay、quote 或财报日历边界',
    ],
  },
  {
    ver: 'v10.7.9.315', date: '2026-07-12',
    items: [
      '🪪 注册流程接入社区昵称与头像',
      '  - 新用户注册升级为两步:先验证账户与邀请码,再设置社区昵称并明确选择头像',
      '  - 昵称继续使用 2-16 字符规则,头像只能从内置 18 款白名单中选择,未完成不能提交注册',
      '  - 服务端在消费邀请码前创建完整社区资料;任一步骤失败都会回滚新建 Auth 用户',
      '  - 注册完成只建立社区身份,不会自动加入收益比赛,参赛仍需用户自愿确认',
      '  - 本次不改交易账本、收益快照、比赛收益公式、行情 relay 或其他业务模块',
    ],
  },
  {
    ver: 'v10.7.9.314', date: '2026-07-12',
    items: [
      '⭕ 设置页头部头像层级增强',
      '  - 设置页头部头像增加独立中性外边框,让头像区域与背景层次更清楚',
      '  - 头部头像从 79px 再放大约 20% 到 95px',
      '  - 外边框和尺寸调整仅作用于设置页头卡,不影响头像选择器或收益比赛展示',
      '  - 本次不改头像素材、头像 key、资料保存、数据库、RLS 或比赛逻辑',
    ],
  },
  {
    ver: 'v10.7.9.313', date: '2026-07-12',
    items: [
      '👤 社区头像展示细节修复',
      '  - 头像统一加深裁切,彻底隐藏素材自带的白色外缘',
      '  - 设置页头部头像显示尺寸放大约 20%',
      '  - 删除头部头像昵称下方的公开展示提示文字,资料弹窗内的昵称规则继续保留',
      '  - 本次只改社区头像视觉,不改头像 key、资料保存、比赛收益、数据库或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.312', date: '2026-07-12',
    items: [
      '🎭 社区默认头像扩展为 18 款',
      '  - 原有 6 款头像全部替换,新增人物、动物和赛博夜行者三组共 18 款头像',
      '  - 18 张素材均从用户提供的三张设计图精准裁切,不重新生成、不改变人物造型',
      '  - 保留原 6 个头像 key 兼容已保存用户,另外新增 12 个头像 key',
      '  - 设置页头像选择器扩展为 6 列 3 行,排行榜和用户资料卡同步使用新头像',
      '  - 本次只扩展社区头像白名单和素材,不改昵称、比赛收益、持仓披露、交易账本或行情逻辑',
    ],
  },
  {
    ver: 'v10.7.9.311', date: '2026-07-12',
    items: [
      '🔁 多账户一键切换上线',
      '  - 设置页“切换账户”升级为已添加账户列表,可直接切换、移除或添加新账户',
      '  - 只保存 Supabase 会话令牌,不保存账户密码;普通退出仅退出当前设备上的当前会话',
      '  - 数据库离线缓存、波段折叠记忆、摊薄工具和行情诊断记录全部按用户隔离',
      '  - 切换账户时强制重新挂载应用并重新读取云端数据,避免前一个账户状态残留',
      '  - 本次不改交易账本、收益快照、数据库表、RLS、行情 relay 或服务端鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.310', date: '2026-07-12',
    items: [
      '🧑‍🚀 社区默认头像整套更新',
      '  - 六个社区默认头像替换为全新蓝、金、紫、绿、青、银人物设计',
      '  - 新头像统一使用轻量圆形构图与一致裁切,设置页头卡和头像选择器同步更新',
      '  - 点击头部身份卡直接打开社区资料弹窗,下方重复的社区资料设置行已移除',
      '  - 收益比赛发现资料不完整时也会打开同一个真实资料弹窗',
      '  - 已保存用户继续沿用原头像 key,无需重新选择,社区昵称和比赛身份不变',
      '  - 本次不改社区资料表、保存数据、数据库、RLS 或比赛收益逻辑',
    ],
  },
  {
    ver: 'v10.7.9.309', date: '2026-07-12',
    items: [
      '👤 设置页头像卡细节优化',
      '  - 移除设置页顶部重复的“设置”标题,社区身份卡直接作为页面首个内容模块',
      '  - 首次读取社区资料时改为中性加载占位,不再先闪现金色默认头像再切换到用户头像',
      '  - 蓝色头像保持原裁切,其余五种头像加大圆形裁切比例,减弱素材自带的粗重外圈',
      '  - 本次只改设置页头像加载和展示样式,不改头像 key、社区资料保存、数据库、RLS 或比赛逻辑',
    ],
  },
  {
    ver: 'v10.7.9.308', date: '2026-07-12',
    items: [
      '⚙️ 设置页折叠式重设计',
      '  - 设置页改为社区身份大卡与统一折叠列表,语言、账户、社区资料和管理员邀请码均在点击后展开',
      '  - 设置页新增“显示设置”红绿配色入口,交易页原有齿轮入口继续保留;两处同步控制同一个全局设置',
      '  - 社区昵称、默认头像、修改密码、邀请码生成/复制和更新日志继续连接真实功能',
      '  - 设置页不再展示行情诊断日志入口;底层行情错误保护与接口边界保持不变',
      '  - “切换账户”本阶段安全退出当前账户并返回登录页,不保存密码;账户记忆留待独立缓存隔离完成后再接入',
    ],
  },
  {
    ver: 'v10.7.9.307', date: '2026-07-12',
    items: [
      '💼 资产人物卡配色统一',
      '  - “我”和“老婆”资产分组卡取消人物金色/红色外框,统一为普通中性边框',
      '  - 两组资产金额和占比进度条统一使用系统标准红色',
      '  - 各账户类型图标取消人物强调色,统一恢复为中性默认色;账户图片 Logo 保持原图',
      '  - 本次只调整资产页颜色,不改卡片宽度、布局、账户金额、占比、币种换算、数据库或操作逻辑',
    ],
  },
  {
    ver: 'v10.7.9.306', date: '2026-07-12',
    items: [
      '📋 首页自选分隔线对齐',
      '  - 首页自选与持仓表格改为每只股票共用一个完整行容器,名称和各项行情不再由两套独立列表拼接',
      '  - 名称表头和排序表头现在共享同一行高,修复 iOS 上分隔线固定错开的问题',
      '  - 保留首页卡片原宽度、名称列宽、行情列宽、横向滑动和固定名称列,不改现有信息密度',
      '  - 本次只调整首页自选/持仓表格布局,不改自选数据、正式交易账本、行情计算、数据库、RLS 或接口鉴权',
    ],
  },
  {
    ver: 'v10.7.9.305', date: '2026-07-12',
    items: [
      '🏆 收益比赛收盘持仓公开与用户卡',
      '  - 点击排行榜用户可查看头像、昵称、名次、周期收益率和榜单截止日的收盘持仓代码',
      '  - 持仓代码只从正式 stock_trades 推导,必须通过同日锁定 ledger hash 后才返回;不公开股数、成本、金额或交易明细',
      '  - 排行榜加宽昵称列,用户卡使用 320px 渐变边框并由三角精确指向所选头像;较多代码自动换行并在卡片内滚动',
      '  - 加入、等待、榜单披露和 QQQ 基准提示统一换行与行高,日期和关键词组不再被拆开',
      '  - 不新增 SQL、不改收益率快照、主交易账本、个人收益报表、行情 relay、quote 或财报日历边界',
    ],
  },
  {
    ver: 'v10.7.9.304', date: '2026-07-12',
    items: [
      '🏆 收益比赛标题样式统一',
      '  - 收益比赛标题与波段记录统一为 18px 常规字重、相同字距和文字亮度',
      '  - 保留比赛奖杯、副标题、周期切换和原有页面结构',
      '  - 本次只调整标题视觉,不改参赛、排行榜、收盘快照、交易账本、RLS 或行情接口',
    ],
  },
  {
    ver: 'v10.7.9.303', date: '2026-07-12',
    items: [
      '🏆 收益比赛真实收盘快照版',
      '  - 参加前必须主动保存社区昵称和默认头像,未完成资料会自动返回设置页',
      '  - 加入完全自愿并写入独立参赛表,排名从加入后的下一份符合条件的收盘快照开始',
      '  - 排行只使用服务端生成且不可覆盖的比赛专用收盘收益率快照,不再展示 mock、估算值或实时价格替代值',
      '  - 加入时锁定参赛起点账本,后续按连续交易日和调整后收盘价计算;空仓延续且单只股票行情失败不会拖累其他用户',
      '  - 缺少权威快照时只显示等待状态;榜单仅公开昵称、头像、排名和收益率,不公开邮箱、金额、持仓或交易',
      '  - 比赛数据库、API 和 Cron 均独立,不改正式交易账本、个人收益报表、行情 relay、quote 或财报日历边界',
    ],
  },
  {
    ver: 'v10.7.9.302', date: '2026-07-12',
    items: [
      '👤 社区头像白边修正',
      '  - 设置页社区资料头像取消额外白色边框',
      '  - 头像在圆形容器内轻微放大裁切,避免素材边缘浅色像素露出',
      '  - 只调整设置页头像展示样式,不改 community_profiles 数据、头像 key、RLS、交易账本或社区比赛 mock 逻辑',
    ],
  },
  {
    ver: 'v10.7.9.301', date: '2026-07-11',
    items: [
      '👤 设置页社区资料上线',
      '  - 设置页新增“社区资料”模块,可设置后续社区比赛使用的公开昵称和默认头像',
      '  - 社区资料真实写入独立 community_profiles,后续排行榜可直接复用 nickname 和 avatar_key',
      '  - 默认头像使用 6 个内置预设头像,本次不开放图片上传、不接 Supabase Storage',
      '  - 资料表只存昵称和头像 key,不存邮箱、资产、收益、交易账本或任何私密财务数据',
      '  - RLS 允许已登录用户读取社区公开资料,但只能新增或修改自己的社区资料',
    ],
  },
  {
    ver: 'v10.7.9.300', date: '2026-07-11',
    items: [
      '🏆 社区比赛 mock 小工具第一版',
      '  - 交易页主工具入口把“摊薄工具”替换为“社区比赛”,底部不新增比赛 tab',
      '  - 摊薄工具收录到“全部功能”里,原摊薄计算和记录入口继续保留',
      '  - 新增收益比赛独立 mock 页面,按日榜 / 周榜 / 月榜 / 年榜展示排名、社区统计、排行榜和本日基准',
      '  - 首次进入会显示自愿加入弹框;未确认加入不能查看榜单,确认加入后仅用本地 localStorage 记住 mock 加入状态',
      '  - 排行榜头像边框按名次分层:前三名保留金 / 蓝 / 铜色,第 4 名及以后统一为低亮深灰,避免出现白色边框',
      '  - 本次只做 HTML / mock 视觉还原,不接数据库、不写交易账本、不计算真实收益、不改 RLS、收益快照、行情 relay 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.299', date: '2026-07-11',
    items: [
      '📌 波段首页折叠记忆恢复',
      '  - 波段首页恢复股票卡片折叠/展开能力,同股多波段不再强制锁定展开',
      '  - 用户在“全部 / 进行中 / 已完成”各筛选下对单只股票的展开状态会自动记忆,下次进入保持上次状态',
      '  - 没有历史记忆时,同一股票多个当前筛选波段仍默认展开,兼顾完整展示与手动收起',
      '  - 新增波段后自动切回进行中并展开对应股票,方便继续查看刚录入的波段',
      '  - 本次只调整波段首页 UI 状态和本地 localStorage 记忆,不改 swing_waves 数据、波段收益计算、正式交易账本、RLS、行情 relay 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.298', date: '2026-07-11',
    items: [
      '🛠️ 波段首页与 iOS 弹框细节修复',
      '  - 波段首页默认只显示进行中记录,已完成股票不再混入首页,仍可通过右上角“已完成”分类查看历史',
      '  - 同一股票存在多个当前分类波段时默认完整展开且不再折叠,直接显示全部波段明细',
      '  - 弹框跟随 iOS 键盘可视区域,修复首次点击股票、成本、数量或备注输入框时整张卡片上窜的问题',
      '  - 日期文字改为垂直居中;普通操作卡的确认、取消、保存等按钮统一为相同中性色,禁用状态仍阻止提交,最终危险删除继续保留红色',
      '  - 本次只调整页面筛选、展开和共用弹框显示,不改波段计算、swing_waves 数据、正式交易账本、收益快照、RLS 或行情鉴权',
    ],
  },
  {
    ver: 'v10.7.9.297', date: '2026-07-11',
    items: [
      '📈 波段记录 V2 独立页面',
      '  - 交易页波段入口改为独立页面,按股票聚合展示并支持同一股票同时建立多个进行中波段',
      '  - 新增、编辑、完整卖出和删除改为读写独立 swing_waves,卖出必须一次性结束整段,不支持部分卖出',
      '  - 买入价、卖出价和现价始终按 USD 显示,浮盈与已实现盈亏继续跟随首页 USD / CNY 设置',
      '  - 新增波段弹窗的买入徽标固定为横排胶囊,避免窄屏下“买入”被压成竖排',
      '  - 股票展开后移除汇总区与第一段波段之间的多余白色粗线,保留各波段之间的细分隔',
      '  - 旧波段记录未清理,只有进行中波段加入现有行情链路;正式交易账本、持仓收益、摊薄成本、收益快照和行情鉴权边界保持不变',
    ],
  },
  {
    ver: 'v10.7.9.296', date: '2026-07-11',
    items: [
      '💵 波段股票报价固定美元',
      '  - 修复首页选择 CNY 后,波段买入均价、卖出均价和当前价被错误换算成人民币的问题',
      '  - 美股每股报价与交易明细单价现在始终显示 USD,符合股票实际报价口径',
      '  - 浮盈、总盈亏和成交总金额继续跟随首页 USD / CNY,只收紧报价与汇总金额的展示边界',
      '  - 波段录入、USD 存储、切段和盈亏计算保持不变,不影响其他模块',
    ],
  },
  {
    ver: 'v10.7.9.295', date: '2026-07-11',
    items: [
      '🔄 波段记录币种跟随首页',
      '  - 波段记录的买入均价、卖出均价、现价、浮盈、总盈亏和交易明细金额统一跟随首页 USD / CNY 设置',
      '  - 全部波段交易弹窗与波段删除确认同步使用相同币种,切换后按首页共享汇率即时换算',
      '  - 波段录入、数据库存储和盈亏计算继续保持 USD,本次换算只发生在波段展示层',
      '  - 本次仅影响波段工具,不改首页、正式交易账本、摊薄成本、资产、收益报表、行情接口、RLS 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.294', date: '2026-07-11',
    items: [
      '🎨 目标页年度卡片配色与布局优化',
      '  - 个人箴言改为灰色斜体,北极星当前金额改为中性白色,总体完成率与本年完成率统一为系统红色',
      '  - 当前年度右侧摘要上移并与年份状态行对齐,新增“实现”金额,形成目标、实现、落后三行结构',
      '  - 当前年份、计划、年初起点和终点改为白色层级,当前位置保留黄色,实现/达标使用红色,落后/未达使用绿色',
      '  - 补齐“实现 / Achieved”中英文文案,只改目标页展示与布局,不改年度计算、数据库、账本或安全边界',
    ],
  },
  {
    ver: 'v10.7.9.293', date: '2026-07-11',
    items: [
      '🎯 年度目标当年计划口径修正',
      '  - 年度目标当前年卡片右上角的目标改为当年计划,不再显示年初余额与计划相加后的年末总额',
      '  - 落后与超额继续按当年计划和当年实际的差额计算,与右上角目标保持同一口径',
      '  - 当前年度与预测年度的资产路径标签统一为年初起点、当前、终点,只改文字不改金额或计算逻辑',
      '  - 不改北极星总目标、年度数据、年末资产路径或数据库',
    ],
  },
  {
    ver: 'v10.7.9.292', date: '2026-07-11',
    items: [
      '🪟 账户、订单和删除弹窗视觉重构',
      '  - 资产账户操作与交易订单操作统一为设计稿同款深色玻璃卡片,修改和删除按钮改为低亮度中性样式',
      '  - 订单操作新增股票 Logo,复用现有 Logo 缓存和行情图源,加载失败时显示股票代码兜底',
      '  - 账户操作支持可选图片 Logo,当前无图片时使用账户类型图标兜底,不新增数据库字段',
      '  - 危险删除确认改为独立面板式卡片,红色只出现在最终删除按钮,原有提交防重和云端删除逻辑保持不变',
    ],
  },
  {
    ver: 'v10.7.9.291', date: '2026-07-11',
    items: [
      '📅 财报日历全模块白色文字降亮',
      '  - 首页财报卡片、日历弹窗、列表和财报详情里的白色标题、股票代码与实际数值统一降低亮度',
      '  - 主内容统一为 70% 白色,预期值为 60%,月份与普通日期为 65%,避免深色页面上数字过亮',
      '  - 清理财报模块内无效的白色透明度档位,避免样式未生效后继承成纯白',
      '  - 红绿财报结果、市场反应和金色选中/操作状态保持不变,不改财报数据或接口逻辑',
    ],
  },
  {
    ver: 'v10.7.9.290', date: '2026-07-11',
    items: [
      '🎨 首页股票代码和公司名称降亮',
      '  - 自选与持仓列表的股票代码从 80% 白色降为 70%,减少名称列在深色页面上的高亮感',
      '  - 公司名称从 40% 白色降为 35%,继续与股票代码保持清晰的上下层级',
      '  - 股票 Logo、价格、涨跌颜色、持仓盈亏、行情和交易数据均保持不变',
    ],
  },
  {
    ver: 'v10.7.9.289', date: '2026-07-11',
    items: [
      '📊 首页持仓盈亏与自选亮度修复',
      '  - 首页持仓盈亏金额和收益率取消粗体,涨跌颜色继续跟随系统设置并与交易页持仓保持一致',
      '  - 持仓盈亏列参考交易页扩大到 144px,金额和百分比固定单行显示,避免正号与数字被挤成两排',
      '  - 自选股票代码和价格统一为当前信号“等待中”的轻灰亮度,避免价格继续显示得过亮',
      '  - 本次不改变持仓盈亏计算、交易账本、行情接口、收益快照、数据库、RLS 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.288', date: '2026-07-11',
    items: [
      '🎨 首页财报与股票文字降亮',
      '  - 财报日历标题、首页财报代码和自选/持仓当前标签统一为当前信号“等待中”的轻灰亮度',
      '  - 自选/持仓表格“名称”表头与“价格”“涨跌幅”统一为同一灰色层级',
      '  - 自选和持仓股票代码取消粗体并降低白色亮度,涨跌颜色和行情数据保持不变',
    ],
  },
  {
    ver: 'v10.7.9.287', date: '2026-07-10',
    items: [
      '🛠 首页行情超限分批修复',
      '  - 修复自选与持仓股票较多时,首页主行情连同 QQQ、TQQQ、VIX、FGI 和指数一次请求超过 30 个 symbols,导致整批行情和交易持仓显示失败的问题',
      '  - 超过 30 个 symbols 时现在按接口上限顺序分批读取并合并结果,单个批次失败仍保留明确错误诊断',
      '  - 本次不放宽 /api/quote 服务端上限,不关闭鉴权,不改交易账本、财报日历、收益快照、数据库或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.286', date: '2026-07-10',
    items: [
      '📅 首页财报日历智能上移',
      '  - 未来 15 天内自选与持仓合计至少 5 家公司有待公布财报,且其中至少 1 家属于当前持仓时,财报日历自动上移到自选/持仓模块上方',
      '  - 不足 5 家、没有持仓股票财报、暂无数据或读取失败时,财报日历继续放在首页最下方',
      '  - 本次只调整同一张财报日历卡片的位置,继续使用独立 /api/earnings-calendar,不新增请求、不改 /api/quote、交易账本、收益快照、RLS 或数据库结构',
    ],
  },
  {
    ver: 'v10.7.9.285', date: '2026-07-10',
    items: [
      '🔥 热门股票弹窗实时行情',
      '  - 添加自选股票弹窗里的热门股票扩展为常用美股候选池,打开弹窗后按已登录 /api/quote 拉取实时价格和涨跌幅',
      '  - 热门行情严格只在添加自选股票弹窗打开时触发,首页默认加载不会请求这批候选股',
      '  - 本次复用现有 /api/quote 鉴权和股票校验,不新增接口、不改变热门候选池以外的首页行情、交易账本、RLS 或数据库结构',
    ],
  },
  {
    ver: 'v10.7.9.284', date: '2026-07-10',
    items: [
      '🛡 自选添加股票校验',
      '  - 添加自选股票前必须先通过已登录 /api/quote 校验美股代码存在且返回有效价格',
      '  - EODHD 未返回有效股票价格、接口报错、非美股代码或特殊行情符号都不会写入自选列表',
      '  - 本次只改添加自选前的校验和提示,不改热门股票动态来源、/api/quote 鉴权、行情 token、交易账本、RLS 或数据库结构',
    ],
  },
  {
    ver: 'v10.7.9.283', date: '2026-07-10',
    items: [
      '📈 个股详情持仓时间',
      '  - 个股详情页累计盈亏卡新增“持仓天数”和“首次建仓”,布局沿用当前两列统计样式',
      '  - 持仓天数按当前这一轮持仓的首次买入日到最新收盘快照日计算,清仓后重新买入会重新计时',
      '  - 本次只从主交易账本 stock_trades 派生展示字段,不改数据库、交易写入、收益快照、行情接口、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.282', date: '2026-07-10',
    items: [
      '📊 收益报表浮层颜色和页面文案调整',
      '  - 收益报表对比浮层中“我的”当日和累计收益率改为跟随系统涨跌颜色设置',
      '  - “我的”和“纳斯达克”两行现在使用同一套红涨/绿涨模式,下跌不再错误显示为红色',
      '  - 收益报表标题下方副标题改为 Quote Data testing',
      '  - 页面底部“生成收盘快照”入口暂时移除;底层生成逻辑保留,后续测试需要时可恢复',
      '  - 本次只改收益报表展示层,不改交易账本、收益快照写入、行情接口、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.281', date: '2026-07-10',
    items: [
      '📊 收益报表对比浮层',
      '  - 收益报表“收益率走势”支持点击或滑动查看同一天的“我的”和“纳斯达克”对比',
      '  - 浮层同时展示当日收益率和按本期起点累计的收益率,本年基准继续沿用 1 月 1 日起点收盘价口径',
      '  - 本次只改收益报表展示层和本地视觉预览,不改交易账本、收益快照写入、行情接口、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.280', date: '2026-07-10',
    items: [
      '📈 个股收益峰值呼吸点',
      '  - 个股收益详情页“我的收益线”峰值圆点增加金色呼吸光晕,圆点本体半径保持不变',
      '  - 呼吸节奏对齐持仓收益试算价格位置点,并尊重系统减少动态效果设置',
      '  - 本次只改个股收益走势图展示层,不改交易账本、收益快照、行情接口、财报日历、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.279', date: '2026-07-10',
    items: [
      '🏠 首页股票文字继续降重',
      '  - 切换基准菜单里的股票代码取消粗体,和股票名称层级更接近',
      '  - 首页列表顶部“自选”和“持仓”两个 tab 标题取消粗体,减少视觉抢占',
      '  - 本次只改首页展示层,不改行情接口、交易账本、收益快照、财报日历、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.278', date: '2026-07-10',
    items: [
      '🏠 首页当前信号文字降重',
      '  - 当前信号状态文字取消粗体,并从纯白降为轻灰,等待中和接近建仓更安静',
      '  - 策略状态右侧回撤百分比同步取消粗体,保留原来的涨跌颜色、字号和位置',
      '  - 本次只改首页展示层,不改行情接口、交易账本、收益快照、财报日历、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.277', date: '2026-07-10',
    items: [
      '📱 iOS 主屏启动黑底图',
      '  - 为 iOS Web App 增加 Apple startup image 黑底启动图,覆盖 HTML/CSS 加载前的系统 launch screen',
      '  - 保留上一版入口 HTML 深色背景兜底,这次补齐主屏首次重开时更早阶段的黑色底',
      '  - 本次只改 PWA 启动壳和静态黑底图片,不改业务功能、交易账本、收益快照、行情接口、财报日历、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.276', date: '2026-07-10',
    items: [
      '🖤 启动黑色背景兜底',
      '  - 在入口 HTML 内提前声明深色背景,避免应用 CSS 加载前短暂露出浏览器默认白底',
      '  - PWA theme/background 颜色同步为当前应用深黑底色,启动和主屏打开更一致',
      '  - 本次只改启动壳和 PWA 颜色兜底,不改业务功能、交易账本、收益快照、行情接口、财报日历、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.275', date: '2026-07-09',
    items: [
      '🏠 首页状态圆点降噪',
      '  - 删除首页当前信号标题旁的小状态圆点,等待中文案更干净',
      '  - 删除 VIX 恐慌指数数值右侧的小绿点,保留下方风险条定位圆点和颜色逻辑',
      '  - 本次只改首页展示层,不改行情接口、交易账本、收益快照、财报日历、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.274', date: '2026-07-09',
    items: [
      '📅 财报日历弹窗高度固定',
      '  - 财报日历弹窗改为固定高度,切换不同日期时标题、视图切换、月份导航、日历网格和图例不再跟随财报数量上下跳动',
      '  - 日历视图下方的选中日期财报列表独立滚动,1 项、2 项或多项财报只影响列表区域',
      '  - 本次只改财报日历弹窗展示层,不改 `/api/earnings-calendar`、`/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.273', date: '2026-07-09',
    items: [
      '📈 持仓列宽恢复 v230 口径',
      '  - 交易页持仓分布恢复 v10.7.9.230 当时调好的列宽:名称/代码 100px,右侧指标 80/76/118/144/66',
      '  - 使用单一横向 grid 承载整行,避免 v230 两段式结构带来的行分割线断层',
      '  - 保留后续新增的个股详情入口和现价/成本持仓收益试算入口,只调整列表宽度和排列口径',
      '  - 本次只改交易页持仓表格展示,不写交易账本、不改行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.272', date: '2026-07-09',
    items: [
      '📈 持仓列距再平衡',
      '  - 交易页持仓分布收回上一版过宽的当日盈亏和持仓盈亏间距,默认首屏不再显得右侧留空过多',
      '  - 名称/代码、市值/数量和现价/成本列获得更多横向空间,多数字时列间距更均衡',
      '  - 横滑后的持仓盈亏列收窄,和当日盈亏距离更接近实际阅读节奏',
      '  - 本次只改交易页持仓表格展示,不写交易账本、不改行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.271', date: '2026-07-09',
    items: [
      '📈 持仓当日盈亏列距优化',
      '  - 交易页持仓分布加宽横向表格总宽,后侧持仓盈亏和占比保留更舒服的横滑空间',
      '  - 首屏前四列新增缓冲边界,当日盈亏完整可见时不再漏出右侧持仓盈亏的加号',
      '  - 收紧名称/代码和现价/成本列,把空间让给当日盈亏,缓解多数字时和现价/成本贴得过近的问题',
      '  - 本次只改交易页持仓表格展示,不写交易账本、不改行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.270', date: '2026-07-09',
    items: [
      '📅 财报列表和持仓列距微调',
      '  - 财报日历弹窗的列表视图不再混入上一财季历史已公布财报,只显示当前仍可见的未来财报和公布后两天内结果',
      '  - 日历视图仍保留上一财季回看能力,方便单独查看历史已公布财报状态',
      '  - 交易页持仓分布在保持当日盈亏首屏完整可见的前提下,略放宽现价/成本列并隔开右侧持仓盈亏列,避免边缘露出下一列加号',
      '  - 本次只改财报弹窗列表过滤和交易页持仓表格展示,不写交易账本、不改行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.269', date: '2026-07-09',
    items: [
      '📈 持仓表格行对齐',
      '  - 交易页持仓分布改为单一横向表格,左侧名称/代码列固定,右侧指标继续横向滑动',
      '  - 名称/代码和市值/数量现在在同一个行容器里共享行高,避免两套独立列表在 iOS 上出现上下错位',
      '  - 首屏仍保留当日盈亏完整可见,持仓盈亏和占比继续放在右侧横滑区域',
      '  - 本次只改交易页持仓分布展示结构,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.268', date: '2026-07-09',
    items: [
      '📈 当前价标记去重',
      '  - 持仓收益试算价格位置条里,金黄色呼吸点只标记当前价,模拟价等于当前价时不再重复显示白色圆环和“模拟价”标签',
      '  - 模拟价离开当前价后仍恢复为独立静态圆环和标签,成本价高于当前价时的真实价格排序继续保留',
      '  - 本次只改交易页试算弹窗视觉点位逻辑,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.267', date: '2026-07-09',
    items: [
      '📈 价格位置条顺序修复',
      '  - 持仓收益试算价格位置条不再固定“成本价/当前价/模拟价”左中右三列,标签会跟随真实价格位置显示',
      '  - 成本价高于当前价时,当前价金色呼吸点会正确显示在更低价格一侧,成本价和模拟价静态圆环按真实价格排序',
      '  - 标签距离过近时自动错层,避免成本价、当前价、模拟价文字互相遮挡;本次只改交易页试算弹窗视觉位置逻辑',
    ],
  },
  {
    ver: 'v10.7.9.266', date: '2026-07-09',
    items: [
      '📈 当前价呼吸标记',
      '  - 持仓收益试算价格位置条里,金黄色呼吸点改为标记当前价,不再跟随模拟价移动',
      '  - 模拟价恢复为普通静态圆环;当前价呼吸点为 9px,柔光更清晰,定位沿用原来的价格比例计算',
      '  - 本次只改交易页试算弹窗视觉标记,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.265', date: '2026-07-09',
    items: [
      '📈 持仓试算呼吸标记',
      '  - 持仓收益试算弹窗的价格位置条里,模拟价标记改为更小的金黄色圆点,增加轻微慢速呼吸动效',
      '  - 呼吸标记固定为金黄色,尺寸约为上一版圆点的一半,避免和盈亏红绿状态混淆',
      '  - 本次只改交易页试算弹窗视觉标记,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.264', date: '2026-07-09',
    items: [
      '📈 修复 iOS 试算输入跳顶',
      '  - 修复 iOS Web App 首次在持仓收益试算弹窗输入数字时,弹窗被系统键盘滚到顶部的问题',
      '  - iOS 上改为用户点击输入框后唤起键盘,并用 visualViewport 固定弹窗到当前可视区域',
      '  - 本次只改交易页试算弹窗输入体验,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.263', date: '2026-07-09',
    items: [
      '📈 持仓收益试算去除汇率说明',
      '  - 持仓收益试算弹窗底部不再显示“1 USD = x.xxxx CNY”说明,页面更轻',
      '  - 试算金额仍继续跟随交易页 USD/CNY 切换,仅隐藏重复汇率文案',
      '  - 本次只改交易页试算弹窗展示文案,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.262', date: '2026-07-09',
    items: [
      '📈 持仓收益试算视觉补强',
      '  - 持仓收益试算弹窗背景改为半透明毛玻璃遮罩,打开时保留交易页上下文但降低干扰',
      '  - 试算结果亏损继续使用现有绿色,持平状态改为金色金额、收益率和模拟价标记',
      '  - 本次只改交易页试算弹窗视觉状态,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.261', date: '2026-07-09',
    items: [
      '📈 交易页持仓收益试算',
      '  - 点击持仓列表里的现价/成本区域,可打开底部半屏持仓收益试算弹窗',
      '  - 输入模拟股价后实时计算预计持仓盈亏、收益率、较当前价变化、持仓市值和每涨跌 1 美元影响',
      '  - 快捷按钮支持当前价、成本价、52 周高、+5% 和 -5%;金额输出跟随交易页 USD/CNY 切换',
      '  - 本次只做前端 UI 和本地计算,不写交易账本、不改底部导航、行情接口、收益快照、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.260', date: '2026-07-09',
    items: [
      '📅 财报日历日期选择修复',
      '  - 修复弹窗日历视图点击具体日期后,被财报数据刷新重置回默认第一个财报日的问题',
      '  - 用户手动选择日期后会保持当前日期,即使当天没有关注股票财报也不会自动跳回默认日期',
      '  - 本次只改财报日历弹窗选择状态,不改 `/api/earnings-calendar`、`/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.259', date: '2026-07-09',
    items: [
      '📅 首页财报日历细节降重',
      '  - 首页财报日历预览里的股票代码缩小一档,视觉更接近参考图的轻量层级',
      '  - 首页财报日历右侧日历按钮颜色降低一点,避免图标过白抢视觉',
      '  - 本次只改首页财报日历展示层,不改 `/api/earnings-calendar`、`/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.258', date: '2026-07-09',
    items: [
      '📅 财报日历请求缓存',
      '  - 财报日历前端增加 15 分钟请求缓存,同一用户、同一股票集合和同一日期窗口不会因反复打开首页重复请求',
      '  - 正在加载中的同 key 请求会复用同一个 in-flight promise,避免短时间重复打 `/api/earnings-calendar`',
      '  - 打开财报弹窗只使用首页已拉取的数据,不会额外触发上一财季请求',
      '  - 本次只优化财报日历请求节流,不改 `/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.257', date: '2026-07-09',
    items: [
      '📅 财报日历上一财季回看',
      '  - 财报接口新增上一季度已公布财报回看,方便在日历弹窗里查看已公布卡片效果',
      '  - 首页预览仍只展示当前可见财报,不会被历史已公布财报占位',
      '  - 弹窗日历和列表视图会使用完整拉取结果,可看到上一季度的已公布 EPS、营收、同比和市场反应',
      '  - 本次仍保持财报日历独立 `/api/earnings-calendar` 边界,不改 `/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.256', date: '2026-07-09',
    items: [
      '📅 财报日历列表视图收紧',
      '  - 列表视图去掉顶部重复日期筛选行,打开后直接展示财报卡片',
      '  - 未公布财报行压缩公司列,把更多宽度让给预计 EPS 和预计营收',
      '  - 预计 EPS 和预计营收的标题与数值字号上调一档,提升扫读性',
      '  - 本次只改财报日历展示层,不改 `/api/earnings-calendar`、`/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.255', date: '2026-07-09',
    items: [
      '📅 财报日历券商式对比口径',
      '  - 已公布财报详情改为“公布值同比 / 预测值同比”并列表格,更接近券商财务页的阅读方式',
      '  - 已公布财报列表里的 EPS/营收百分比同步改为同比口径,不再显示实际值相对预测值的差异率',
      '  - EODHD trends 同一财报期同时返回 `+1q` 和 `0q` 时优先使用 `0q`,避免误拿下一季预测营收',
      '  - NVDA 最新已公布财报可展示真实营收 816.2 亿美元、预测营收 791.2 亿美元及对应同比',
      '  - 本次仍保持财报日历独立 `/api/earnings-calendar` 边界,不改 `/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.254', date: '2026-07-09',
    items: [
      '📅 财报日历已公布结果',
      '  - 已公布财报在发布后两天内继续显示,不再当天从首页或列表里消失',
      '  - 已公布行展示实际 EPS、实际营收、预期值、差异百分比和盘前/盘后收盘反应',
      '  - 已公布列表卡片加高并放松内部间距,首页、日历图例、弹窗列表和详情里的结果状态图标统一大小',
      '  - 财报事件传入高影响时会保留“高影响”显示;详情弹窗结果区不再重复显示状态图标,分化标签边框也改为无白边',
      '  - 首页小标记和日历点改为结果状态:超预期、不及预期、分化、符合预期和未公布',
      '  - 实际营收从 EODHD Fundamentals 按同一财报 fiscal date 匹配,非美元营收仍在服务端换算为美元',
      '  - 本次仍保持财报日历独立 `/api/earnings-calendar` 边界,不改 `/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.253', date: '2026-07-09',
    items: [
      '📅 财报日历盘前盘后图标',
      '  - 财报弹窗里的盘前/盘后标识改为参考图同款小太阳和小月亮图标',
      '  - 盘前使用暖黄色太阳,盘后使用蓝色月亮,列表视图和日历下方事件列表共用同一展示',
      '  - 本次只改财报日历展示层,不改 `/api/earnings-calendar`、`/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.252', date: '2026-07-09',
    items: [
      '📅 财报日历美元营收显示',
      '  - 首页财报日历预览日期进一步缩小,颜色同步为编辑自选股票弹窗里的灰色层级',
      '  - 财报弹窗列表压缩公司列,把更多横向空间让给预计 EPS 和预计营收',
      '  - 预计营收改为美元口径展示,中文显示为“亿美元 / 千万美元”等更容易扫读的单位',
      '  - `TSM.US` 等非美元财报营收会通过服务端 EODHD Forex 汇率换算为美元,前端仍不接触 token',
      '  - 本次继续保持财报日历独立边界,不改 `/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.251', date: '2026-07-09',
    items: [
      '📅 财报日历营收字段修复',
      '  - 首页财报日历预览取消第一个股票的默认选中背景和高亮日期,进入页面时不再自动突出第一项',
      '  - `/api/earnings-calendar` 兼容 EODHD `/api/calendar/trends` 的真实嵌套数组返回,预计营收改为正确读取 `revenueEstimateAvg`',
      '  - 分析师数量同步兼容 EODHD 官方字段 `earningsEstimateNumberOfAnalysts` 和 `revenueEstimateNumberOfAnalysts`',
      '  - 本次继续保持财报日历独立边界,不改 `/api/quote`、交易账本、收益快照、行情 relay 或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.250', date: '2026-07-09',
    items: [
      '📅 首页财报日历视觉压缩',
      '  - 首页底部财报日历预览压缩为固定一行,5 支股票和日历入口不再左右滑动',
      '  - 日期、股票代码和图标尺寸按参考效果收紧,首页日期字号与弹窗日历日期保持一致',
      '  - 首页和弹窗的财报日历标题同步为自选标题层级,并删除标题旁信息图标',
      '  - 本次只改首页财报日历展示层,不改 `/api/earnings-calendar`、交易账本、收益快照、行情 relay、RLS 或 `/api/quote` 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.249', date: '2026-07-09',
    items: [
      '📅 首页财报日历独立重构',
      '  - 首页底部新增独立财报日历模块,支持关注股票的横向预览、日历视图和列表视图',
      '  - 财报日历改走新的已登录 `/api/earnings-calendar` 接口,服务端使用 EODHD 财报日历和趋势数据,不再混入 `/api/quote` 行情链路',
      '  - 删除旧的 NASDAQ/CALENDAR 虚拟行情 provider 和旧白色事件详情弹窗,避免财报功能影响股票、指数、BTC 实时行情',
      '  - 中文和英文文案同步;本次不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 `/api/quote` 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.248', date: '2026-07-09',
    items: [
      '📈 个股峰值颜色统一',
      '  - 个股详情页收益走势底部“峰值”数字改为跟随全局涨跌色,红涨绿跌模式下显示页面红色',
      '  - 最大回吐、回撤率和回吐率继续按负向风险显示,与当前颜色体系保持一致',
      '  - 确认个股详情页读取主交易账本 stock_trades 和单股票收盘快照 pnl_report_symbol_snapshots,与收益报表共用每日自动收盘快照数据源',
      '  - 本次只改个股详情只读展示层和设置页版本记录,不改交易录入/编辑、自动快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.247', date: '2026-07-09',
    items: [
      '📈 个股收益风险指标调整',
      '  - 个股收益走势底部改为峰值、最大回吐、回撤率和回吐率四项指标',
      '  - 回撤率按峰值对应资产净值计算,回吐率按利润峰值计算,避免两个百分比口径混在一起',
      '  - 四项指标数字取消加粗,和个股详情页当前轻量字体层级保持一致',
      '  - 本次只改个股详情只读图表指标展示和计算口径,不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.246', date: '2026-07-09',
    items: [
      '📈 个股收益浮层边界优化',
      '  - 个股收益线浮层加宽并固定金额单行显示,避免累计盈亏金额换行',
      '  - 浮层改为在图表范围内自动夹住位置,高点优先停在上方,右侧点不再跑出边框',
      '  - 删除图表右侧“当前”金额标注,减少和浮层、边界的视觉冲突',
      '  - 本次只改个股详情只读图表展示层,不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.245', date: '2026-07-09',
    items: [
      '📈 个股收益线交互修正',
      '  - 个股详情页收益线改为按下即显示十字线和日期浮层,不再依赖长按延迟触发',
      '  - 暂时隐藏曲线上的 B/S 买卖点和图例,避免密集交易点重叠;交易记录列表仍完整保留',
      '  - 移除收益走势里的“累计盈亏”胶囊按钮,最大回撤补充百分比,线条和发光更细更接近效果图',
      '  - 本次只改个股详情只读展示层,不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.244', date: '2026-07-09',
    items: [
      '📈 个股收益走势升级',
      '  - 个股详情页收益走势改为金色面积线,更接近当前设计稿的视觉层级',
      '  - 收益曲线增加买入 B、卖出 S 标记,长按可查看指定日期累计盈亏、当日盈亏、收益率、市值和收盘价',
      '  - 曲线底部增加峰值和最大回撤,仅基于已有单股票收盘快照计算,不展示尚未实现的对比线和曲线切换功能',
      '  - 本次只改个股详情只读展示层和快照字段读取,不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.243', date: '2026-07-09',
    items: [
      '🎨 个股详情标题颜色统一',
      '  - 个股详情页累计盈亏、收益走势、交易统计和交易记录标题统一使用同一白色层级',
      '  - 交易记录里的日期同步成交额白色层级,同一行数字视觉更协调',
      '  - 保留普通字段标签的中灰层级,只调整区块标题和交易记录日期颜色一致性',
      '  - 本次只改个股详情展示层颜色,不改交易账本、收益计算、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.242', date: '2026-07-09',
    items: [
      '📋 个股交易记录列宽收紧',
      '  - 个股详情页交易记录横向表格收紧列宽,日期和数量/价格按固定内容展示,避免整体过宽',
      '  - 成交额和实现盈亏列保留更宽空间,大数字仍保持单行显示,窄屏继续可左右滑动',
      '  - 本次只改个股详情展示层布局,不改交易账本、收益计算、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.241', date: '2026-07-09',
    items: [
      '📋 个股交易记录横向滚动',
      '  - 个股详情页交易记录改为横向滚动表格,成交额和实现盈亏列加宽,大数字不再挤压错位',
      '  - 日期/操作、数量/价格、成交额、实现盈亏保持同一行不换行,窄屏可左右滑动查看完整内容',
      '  - 本次只改个股详情展示层布局,不改交易账本、收益计算、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.239', date: '2026-07-09',
    items: [
      '📊 清仓账户收益快照修复',
      '  - 收益报表生成近两个月快照时,有卖出记录的股票改用真实交易账本口径,不再被当前持仓回填模式丢掉',
      '  - 清仓账户仍会保留买卖记录和已实现收益数据,收益报表可读取历史收盘快照',
      '  - 本次只修复收益快照生成口径,不改交易页实时显示、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.238', date: '2026-07-09',
    items: [
      '🎚️ 个股收益提示和报表分段按钮优化',
      '  - 个股详情收益走势点位提示支持点击图表外区域立即关闭,避免手滑后只能等待自动消失',
      '  - 收益报表的收益率走势、收益日历年/月、收益/收益率和盈亏 Top 分段按钮降低选中白底亮度',
      '  - 本次只改展示层交互和按钮亮度,不改交易账本、收益快照、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.237', date: '2026-07-09',
    items: [
      '🎨 个股详情和收益报表文字亮度统一',
      '  - 个股详情页普通数值同步交易页市值/现价数字亮度,持仓数量、当前成本、交易统计和交易记录更清晰',
      '  - 收益报表页纯白文字统一降到交易页中文白色层级,使用明确透明度写法避免构建后回退',
      '  - 本次只改展示层颜色,不改交易账本、收益快照、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.236', date: '2026-07-08',
    items: [
      '🧾 历史股票代码落库修复',
      '  - 登录后会用当前用户自己的会话自动修复历史交易、自选和摊薄工具里的短 ticker 空格脏数据,例如 N VDA -> NVDA',
      '  - 波段记录、摊薄工具和名称本地化路径统一走股票代码标准化,不再把 N VDA 送进 Quote API',
      '  - 新增波段记录和摊薄工具股票仍严格拒绝含空格或特殊字符的股票代码',
      '  - 本次不改变登录权限、邀请码规则、交易收益计算、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.235', date: '2026-07-08',
    items: [
      '🧾 股票代码输入严格校验',
      '  - 修复旧交易记录里股票代码带空格时会打爆整批 Quote API、导致行情和资产显示异常的问题',
      '  - 旧数据读取时会把短 ticker 内部空格修复为正确代码,例如 N VDA -> NVDA,保证已注册用户正常访问',
      '  - 新增和编辑交易、自选股票时严格拒绝含空格或特殊字符的股票代码,不再允许写入不正确代码',
      '  - 本次不改变登录权限、邀请码规则、交易收益计算、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.234', date: '2026-07-08',
    items: [
      '📈 个股详情文字层级回调',
      '  - 个股详情页累计盈亏、已实现盈亏、未实现盈亏、持仓数量、当前成本和交易统计标题统一为交易页同款中灰层级',
      '  - 个股详情页普通数值同步交易页持仓现价白色数字层级,避免上一版过暗',
      '  - 正负盈亏仍保留当前红/绿涨跌色,不改变收益计算、交易账本、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.233', date: '2026-07-08',
    items: [
      '📈 个股详情文字层级微调',
      '  - 个股收益详情页的日期、小标题、统计标签和普通白字统一压低灰度层级',
      '  - 修复部分 text-white/xx 不生效导致文字偏亮的问题,改为明确透明度写法',
      '  - 收益走势点位提示停留至少 10 秒,并避免页面重渲染提前清掉提示',
      '  - 本次只改个股详情只读展示和图表提示停留时间,不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.232', date: '2026-07-08',
    items: [
      '📈 个股收益线滑动查看',
      '  - 个股收益详情页的收益走势支持手指按住或滑动查看每日收益点',
      '  - 图表会显示对应快照日期、收益金额、竖向辅助线和节点圆点',
      '  - 点位仍只来自已有单股票收盘快照,不插值、不使用假数据补线',
      '  - 本次只改个股详情只读走势图交互和持仓收益显示口径,不改交易录入/编辑、收益快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.231', date: '2026-07-08',
    items: [
      '📈 个股详情视觉优化',
      '  - 个股收益详情页默认展示全部周期,标题居中并删除右上角编辑按钮和股票装饰标识',
      '  - 收益走势横轴按当前周期起止日期显示,左侧增加真实金额刻度,缺少历史点位时不使用假数据补线',
      '  - 累计盈亏日期、统计标题和交易记录灰度层级按设计稿收紧,整体字号更接近当前系统准则',
      '  - 本次只调整个股详情只读展示层,不改交易录入/编辑、交易页实时持仓盈亏、自动快照任务、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.230', date: '2026-07-08',
    items: [
      '📈 个股收益详情页',
      '  - 交易页持仓列表点击股票名称/代码可进入只读个股收益详情页',
      '  - 个股详情展示周期累计盈亏、收益率、已实现/未实现盈亏、持仓数量、当前成本、收益走势、交易统计和交易记录',
      '  - 页面只读取主交易账本 stock_trades 和单股票收盘快照 pnl_report_symbol_snapshots,卖出记录按移动平均成本展示实现盈亏',
      '  - 本次只新增只读详情入口和展示页,不改交易录入/编辑、交易页实时持仓盈亏、自动快照任务、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.229', date: '2026-07-08',
    items: [
      '📊 收益报表自动收盘快照',
      '  - 新增服务端定时任务,美股收盘后自动为所有有交易账本的账户生成当日收益报表快照',
      '  - 自动任务使用主交易账本 stock_trades 和 EODHD 日线收盘价,写入独立的组合快照和单股票快照表',
      '  - 新增 CRON_SECRET 保护的 /api/pnl-report-daily-snapshot 入口和 Vercel Cron 配置,密钥只在服务端环境变量中使用',
      '  - 本次只新增收益报表自动生成链路,不改交易页实时持仓/盈亏、手动近两个月回填、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.228', date: '2026-07-08',
    items: [
      '📊 收益报表日历样式微调',
      '  - 收益日历年份视图移除外层和单元白色边框,保留收益/亏损色块表达',
      '  - 年/月与收益/收益率切换改为固定双列按钮,切换时底色和按钮宽度保持一致',
      '  - 本次只改收益报表日历展示样式,不改收益计算、快照生成、交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.227', date: '2026-07-08',
    items: [
      '📊 收益报表近两个月快照回填',
      '  - 手动生成收盘快照从最近 7 个交易日扩展为最近 45 个已完成交易日,用于查看近两个月每日收益走势',
      '  - 历史收盘价接口允许更长查询窗口,仍然要求登录鉴权,前端不接触 EODHD token',
      '  - 继续使用当前持仓 + EODHD 日线收盘价回填,不改变 v10.7.9.226 已修复的本年/近 6 月/全部统计口径',
      '  - 本次只改收益报表独立快照回填窗口和提示文案,不改交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.226', date: '2026-07-08',
    items: [
      '📊 收益报表区间口径修正',
      '  - 修复本年、近 6 月等周期统计把当前持仓回填快照当作真实期初基准的问题',
      '  - 单股票排行榜遇到区间内新录入的持仓时,直接使用成本到当前收盘价的累计盈亏,不再被回填窗口内价格差误导',
      '  - 组合总盈亏在第一笔交易发生于当前统计区间内时,同样使用最新累计盈亏口径,保持与全部口径一致',
      '  - 本次只改收益报表独立系统的区间统计和排行榜口径,不改交易页实时持仓/盈亏、快照生成、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.225', date: '2026-07-08',
    items: [
      '📊 收益报表日历月份与当前持仓回填',
      '  - 手动生成收盘快照改为用当前打开持仓贯穿最近 7 个交易日,再叠加 EODHD 历史收盘价计算每日收益',
      '  - 修复测试账号只在最近两天有收益日历金额的问题;价格仍来自 EODHD 日线,交易页实时显示不受影响',
      '  - 收益日历支持点击年月选择月份,并新增年份视图;年份选择只显示已有快照记录的年份',
      '  - 本次只改收益报表独立快照回填和日历展示,不改交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.224', date: '2026-07-08',
    items: [
      '📊 收益报表 7 日收盘快照回填',
      '  - 手动生成收盘快照改为通过服务端读取 EODHD 多股票日线收盘价,一次回填最近 7 个已完成交易日',
      '  - 收益日历的每日金额改为由当日收盘价和前一交易日收盘价计算,不再依赖盘前实时 quote 的缺失基准字段',
      '  - 新增已登录服务端接口 /api/pnl-history-closes,前端不接触 EODHD token,/api/quote 鉴权保持不变',
      '  - 本次只改收益报表独立快照生成链路,不改交易页实时持仓/盈亏、行情 relay、RLS 或 Supabase 表结构',
    ],
  },
  {
    ver: 'v10.7.9.223', date: '2026-07-08',
    items: [
      '📊 收益报表收盘快照读取保护',
      '  - 收益报表读取端只使用已经完成的美股交易日快照,盘前误写入当天自然日的旧快照会被自动排除',
      '  - 如果快照带有 lockedAt,会校验生成时点对应的最新已完成交易日,只有盘后生成的当日收盘快照才会显示',
      '  - 本次用 EODHD 近 7 日日线收盘价和本地单元测试验证 7/7 收盘数据存在,问题不在 EODHD 无法返回昨日数据',
      '  - 本次只改收益报表独立快照读取保护,不改交易页实时持仓/盈亏、行情 relay、RLS、Supabase 表结构或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.222', date: '2026-07-08',
    items: [
      '📊 收益报表收盘快照口径',
      '  - 手动生成收益快照改为写入最新已完成美股交易日,盘前和盘中不再写入当天自然日',
      '  - 收益报表快照使用收盘价口径:盘前/盘中用上一已完成交易日收盘价,收盘锁定后用锁定收盘价',
      '  - 周期盈亏总结标题跟随本年、近 6 月、近 1 年、全部和自定义筛选切换',
      '  - 时间筛选弹窗的开始日期和结束日期输入文字改为垂直居中',
      '  - 本次只改收益报表独立快照和展示口径,不改交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.221', date: '2026-07-08',
    items: [
      '🧭 收益报表时间筛选弹窗',
      '  - 修复 iOS 日期输入框在时间筛选弹窗里撑出容器的问题',
      '  - 时间筛选提示文案缩短为灰色小字,减少视觉干扰',
      '  - 弹窗底部移除“恢复本年”按钮,只保留满宽“确定”按钮',
      '  - 本次只改收益报表时间筛选弹窗 UI,不改收益报表快照口径、交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.220', date: '2026-07-08',
    items: [
      '📊 收益报表日期筛选',
      '  - 收益报表默认周期从“全部”改为“本年”,打开后优先展示本年收益口径',
      '  - 右上角新增时间筛选,支持选择单日报表或自定义日期区间',
      '  - 单日报表只读取当天已有快照的 daily P&L;所选日期没有快照时显示空状态,不会用其他日期替代',
      '  - 盈亏排行榜跟随当前周期切换:本年、近 6 月、近 1 年、全部和自定义区间会显示对应周期标题和周期排行',
      '  - 本次只改收益报表独立系统展示和快照读取口径,不改交易页实时持仓/盈亏、行情 relay、收益快照表结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.219', date: '2026-07-08',
    items: [
      '🏷️ Quote 品牌和收益报表文案',
      '  - 产品可见品牌名统一改为 Quote,设置页、PWA 标题、manifest 和用户可见更新日志同步替换',
      '  - 收益报表头部标识改为 Quote 数据测试版,跑赢/跑输纳斯达克卡片增加当前周期提示',
      '  - 收益报表盈亏总额默认 CNY,支持下拉切换 USD,下方成交金额、日历、总结和排行榜同步切换币种',
      '  - 收益报表周期筛选会保留本月、本年、近 6 月等真实日期范围,没有组合快照的日期留空,纳斯达克基准线仍可按周期铺开',
      '  - 收益报表排行榜条形背景收紧宽度和圆角,避免第一名左侧被裁切成直角',
      '  - 本次只改前端展示文案和样式,不改收益报表数据库、交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.218', date: '2026-07-08',
    items: [
      '📊 收益报表周期统计',
      '  - 收益报表的累计成交金额和交易股票数改为按当前筛选周期从主交易账本计算',
      '  - 新增登录鉴权的纳斯达克基准接口,用 EODHD QQQ 日线计算跑赢/跑输纳斯达克和蓝色基准线',
      '  - 本次只扩展收益报表独立系统,不改交易页实时持仓/盈亏、股票行情 relay、收益快照表结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.217', date: '2026-07-08',
    items: [
      '📊 收益日历视觉优化',
      '  - 收益报表的收益日历金额改为紧凑单位显示,中文使用 K/万,英文使用 K/M',
      '  - 日历单元格按当日盈亏强弱显示更清晰的红绿半透明背景块,提升扫视效率',
      '  - 本次只调整收益报表日历展示,不改快照数据、交易页实时持仓/盈亏、行情 relay、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.216', date: '2026-07-08',
    items: [
      '📊 收益报表真实快照读取',
      '  - 收益报表页面接入数据库快照,优先读取组合快照和单股票快照生成总览、日历、总结和 Top5 排行',
      '  - 新增“生成今日快照”手动入口,从主交易账本和当前 quoteRows 生成今日收益快照并写入独立报表表',
      '  - 生成前会校验持仓股票现价是否就绪,避免用缺失行情写入错误快照',
      '  - 本次只打通日级报表快照闭环,不改交易页实时持仓/盈亏显示、股票行情 relay、主交易账本、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.215', date: '2026-07-08',
    items: [
      '📊 收益报表快照基础',
      '  - 新增独立收益报表组合快照、单股票快照和重算脏区间 SQL,并同步 RLS 策略',
      '  - 交易主账本新增、编辑、删除后会标记报表从受影响日期开始重算,不改变交易页实时显示逻辑',
      '  - 新增独立快照计算模块,清仓股票仍保留历史已实现盈亏贡献',
      '  - 本次先建立报表数据库基础和计算边界,报表页仍保持前端预览;Supabase SQL 执行后再接真实快照读取',
    ],
  },
  {
    ver: 'v10.7.9.214', date: '2026-07-08',
    items: [
      '📊 收益报表功能精简',
      '  - 删除收益报表总额区的说明和全屏图标,总额标题重新居中对齐',
      '  - 删除收益走势卡右上角“简单加权”入口,保留当前图例和走势展示',
      '  - 删除全部盈亏总结下方基金、新股、余额通等暂不开发分类入口',
      '  - “股票期权累计盈亏”改为“股票累计盈亏”,英文同步为 Stock P&L',
      '  - 本次只清理收益报表前端未开发功能入口,不改数据库、交易账本、行情实时链路、持仓盈亏计算、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.213', date: '2026-07-08',
    items: [
      '📊 收益报表视觉收紧',
      '  - 收益报表独立页面顶部位置上移,更接近首页头部卡片的顶部节奏',
      '  - 收紧盈亏总额、累计成交金额、全部跑赢、收益日历和全部盈亏总结的数字字号',
      '  - 全部盈亏排行榜去掉行内浅色边框并降低行高,列表更轻、更紧凑',
      '  - 本次只调整收益报表前端展示,不改数据库、交易账本、行情实时链路、持仓盈亏计算、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.212', date: '2026-07-08',
    items: [
      '📊 收益报表前端预览',
      '  - 首页和交易页头部累计盈亏增加独立收益报表入口,点击进入完整页面而不是弹窗',
      '  - 新增静态 mock 版收益报表页面:周期筛选、总盈亏、收益走势、收益日历、盈亏总结和 Top5 排行',
      '  - 报表系统暂不接数据库,不读取或改写交易账本、行情 quoteRows、持仓计算、收盘锁定、RLS 或鉴权边界',
      '  - 同步中英文界面文案,后续可直接替换为每日快照数据源',
    ],
  },
  {
    ver: 'v10.7.9.211', date: '2026-07-08',
    items: [
      '📈 三大指数分时曲线锁定',
      '  - 三大指数曲线改为按美股交易时段控制:盘中动态追加,盘前、盘后和夜盘不再继续画线',
      '  - INDICES provider 使用 EODHD intraday 5分钟数据作为完整静态曲线来源,不恢复 Yahoo 图源',
      '  - 收盘后指数价格仍可更新,但曲线保持静态,避免出现断崖横线或心电图走势',
      '  - 本次只改三大指数卡片曲线数据逻辑,不改 BTC、股票交易行情、持仓盈亏、数据库、RLS 或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.210', date: '2026-07-08',
    items: [
      '📊 收盘锁定价格显示',
      '  - 盘后和夜盘进入收盘锁定后,持仓现价列不再显示 --,改为显示锁定收盘价',
      '  - 盘前和盘中继续保持 freshness 遮旧价规则,未拿到本轮新 tick 前仍显示 --',
      '  - 本次只改首页和交易页持仓价格展示,不改今日盈亏计算、股票 quote、交易账本、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.209', date: '2026-07-07',
    items: [
      '📈 三大指数固定卡位',
      '  - 首页三大指数和 BTC 一样固定四格位置,首屏不再因为指数后加载只剩 BTC 卡',
      '  - 三大指数小曲线用 EODHD 昨收和现价先建立基础线,后续 REST/WS 行情继续追加采样点',
      '  - 本次只改首页指数卡占位和指数小曲线采样,不改 BTC、股票 quote、交易账本、持仓数量、成本、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.208', date: '2026-07-07',
    items: [
      '📈 三大指数去 Yahoo 图源',
      '  - 首页三大指数价格、涨跌幅和首屏基础数据只使用 EODHD,不再用 Yahoo chart 覆盖指数卡',
      '  - 三大指数小曲线改由 EODHD realtime tick 在前端累积绘制,首个 tick 前不伪造走势',
      '  - 本次只改三大指数数据源和小曲线来源,不改 BTC、股票 quote、交易账本、持仓数量、成本、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.207', date: '2026-07-07',
    items: [
      '₿ BTC 卡位保留',
      '  - 首页三大指数和 BTC 继续保持独立系统,但 BTC 首个 tick 或 snapshot 未到时也保留第四张 BTC 卡',
      '  - BTC 占位状态只显示 BTCUSD 和连接态,价格/涨跌幅用 --,拿到最新 BTC tick 后自动恢复真实价格和曲线',
      '  - 本次只改首页 BTC 卡片兜底渲染,不改三大指数 provider、股票 quote、交易账本、持仓数量、成本、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.206', date: '2026-07-07',
    items: [
      '₿ BTC 连接态稳定',
      '  - BTC 有近期有效 tick 时,上拉刷新、切换页面或 iOS 回前台不再把右上角状态临时降级成连接中',
      '  - BTC WebSocket 只在旧 tick 真的过期后才强制重连,减少焦点事件造成的重复断开重连',
      '  - 本次只改 BTC 状态机和 BTC 卡片徽标展示,不改三大指数、股票 quote、交易账本、持仓数量、成本、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.205', date: '2026-07-07',
    items: [
      '🧩 首页指数和 BTC 行情拆分',
      '  - 三大指数和 BTC 拆成两套独立状态,BTC 不再混在 INDICES 数组里,首页只在渲染层并排展示',
      '  - INDICES REST 只返回标普500、纳斯达克100和道琼斯,价格优先使用 Yahoo chart 当前价,EODHD 仅作兜底,修复三大指数显示昨日收盘值的问题',
      '  - BTC 继续使用独立 /api/btc-realtime WebSocket,不改股票 quote、交易账本、持仓数量、成本、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.204', date: '2026-07-07',
    items: [
      '⚡ iOS 主屏股票秒级刷新',
      '  - iOS 主屏股票和指数 snapshot 在美股盘前、盘中和盘后切到 1.25 秒活跃刷新,减少和普通网页直连的体感差距',
      '  - 启动和回前台 snapshot burst 前移到 0/0.8/1.6/3/5 秒,更快拿到本轮新 tick',
      '  - BTC 保持独立 WebSocket,不改 EODHD token、/api/quote 鉴权、交易账本、持仓数量、成本、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.203', date: '2026-07-07',
    items: [
      '₿ BTC 主屏连接恢复',
      '  - iOS 主屏返回或刷新时,BTC 恢复使用原有 WebSocket 稳定连接,不再被股票 snapshot burst 标成同步中',
      '  - iOS 主屏股票和指数 snapshot 轮询保持不变,继续保护持仓现价 freshness 和股票实时刷新',
      '  - 不改 EODHD token、/api/quote 鉴权、股票/指数 snapshot 接口、交易账本、持仓数量、成本、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.201', date: '2026-07-07',
    items: [
      '🎨 持仓现价遮罩占位优化',
      '  - 首页持仓和交易持仓在等待本轮新 tick 时,现价占位从 ---- 调整为更轻的 --',
      '  - 只改持仓现价遮罩显示,不改市值、今日盈亏、持仓盈亏、头部总资产、行情公式、EODHD token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.200', date: '2026-07-07',
    items: [
      '📡 iOS 主屏滑动现价遮罩修复',
      '  - iOS 主屏滑动或普通 focus 触发 realtime snapshot 时不再刷新持仓现价 freshness 时间戳,避免整页股票误显示 ----',
      '  - 真正从后台恢复、页面重新可见、网络恢复或云数据加载完成时仍会开启本轮 freshness 遮旧价保护',
      '  - 不改市值、今日盈亏、持仓盈亏、头部总资产、行情公式、EODHD token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.199', date: '2026-07-07',
    items: [
      '📡 iOS 主屏持仓现价遮罩',
      '  - iOS 主屏进入实时行情预热后,首页持仓和交易持仓会按同 symbol 的 quoteRows tick freshness 判断现价是否已更新',
      '  - 未拿到本轮新 tick 前只把持仓现价显示为 ----,拿到新 tick 后自动恢复真实现价',
      '  - 只改 UI 显示保护,不改市值、今日盈亏、持仓盈亏、头部总资产、行情公式、EODHD token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.198', date: '2026-07-07',
    items: [
      '📡 iOS 主屏启动实时预热',
      '  - iOS 主屏首次进入、云数据加载完成和回前台时触发多轮 realtime snapshot burst,减少先显示旧价格再等待 tick 的时间',
      '  - iOS 主屏恢复链路优先使用服务端 EODHD realtime snapshot,不再先用 /api/quote REST 快照覆盖交易页实时价格',
      '  - BTC 卡新增“同步中/Syncing”状态,拿到实时 tick 后自动恢复 LIVE',
      '  - 不改交易账本、持仓数量、成本、今日盈亏公式、EODHD token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.197', date: '2026-07-07',
    items: [
      '📡 iOS 主屏行情轮询模式',
      '  - 自动识别 iOS 添加到主屏幕的 standalone Web App,切换到认证 HTTP snapshot 轮询,普通 Safari/桌面继续走 WebSocket',
      '  - BTC、指数和股票在 iOS 主屏不再打开浏览器 WebSocket,避免连接中反复刷新和股票静态',
      '  - snapshot 接口仍走服务端 EODHD WebSocket 和 Supabase 鉴权,普通 HTTP 访问 /api/*-realtime 仍返回 426',
      '  - 不改交易账本、持仓数量、成本、今日盈亏公式、EODHD token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.196', date: '2026-07-07',
    items: [
      '📡 iOS 主屏股票实时防静态',
      '  - 股票 WebSocket 不再因为首轮 symbol 覆盖不足就反复断开重连,避免 iOS 主屏幕版被覆盖率门槛卡成静态',
      '  - 打开后 8 秒还没收到首个 stock_tick 时先保留连接并补拉快照,30 秒完全无 tick 才重建连接',
      '  - 不改交易账本、持仓数量、成本、今日盈亏公式、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.195', date: '2026-07-07',
    items: [
      '📡 股票实时订阅补发',
      '  - 股票 realtime relay 在新客户端接入时会对当前 symbol 集重新发送幂等 subscribe,避免 warm upstream 连接漏推个别持仓股票',
      '  - 继续保留 iOS 主屏 App Shell 检查、可见 heartbeat、per-symbol freshness 和 120 秒缓存回放限制',
      '  - 不改交易账本、持仓数量、成本、今日盈亏公式、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.194', date: '2026-07-07',
    items: [
      '📡 iOS 主屏股票实时恢复',
      '  - iOS 添加到主屏幕版本回前台时自动检查 App Shell 是否仍是旧版本,发现新 bundle 会刷新到最新运行时代码',
      '  - 股票实时连接首轮不再只等任意一只股票 tick,改为要求初始 symbol 覆盖不足时自动重连',
      '  - 服务端股票 relay 不再向新客户端回放超过 120 秒的 warm-process 缓存 tick,无客户端后会清理旧 tick',
      '  - REST 刷新后只保留客户端最近收到的 per-symbol 实时 tick,避免一只股票的新 tick 带着其它旧 tick 继续覆盖',
      '  - 不改交易账本、持仓数量、成本、今日盈亏公式、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.193', date: '2026-07-07',
    items: [
      '📡 股票实时连接首包重连',
      '  - 股票 WebSocket 打开后若 8 秒内没有收到首个 stock_tick,自动重建连接',
      '  - 无 live/tick activity 的连接不再停在静态 REST 快照,会主动进入重连',
      '  - iOS 主屏幕版回前台继续强制重建股票实时连接,减少偶发静态状态',
      '  - 不改 REST provider、今日盈亏公式、交易账本、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.192', date: '2026-07-07',
    items: [
      '📡 盘前股票盘口兜底',
      '  - 股票实时 relay 保留 /ws/us 成交价为主源,新增 /ws/us-quote bid/ask 中间价作为盘前兜底',
      '  - 最近成交 tick 优先,避免盘口中间价立刻覆盖刚收到的成交价',
      '  - 客户端识别 EODHD_WS_QUOTE 为实时行情,继续用现有昨日收盘基准计算盘前今日盈亏',
      '  - 不改交易账本、持仓数量、成本、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.191', date: '2026-07-07',
    items: [
      '🌐 英文头卡持仓文案收窄',
      '  - 英文模式首页和交易页头部持仓数量只显示 holdings,不再显示 trades',
      '  - 英文头卡三列回到中文同一套宽度比例,避免右侧持仓文案挤压今日盈亏和累计盈亏',
      '  - 保持中文显示、持仓数量计算、交易笔数计算、行情和数据库逻辑不变',
    ],
  },
  {
    ver: 'v10.7.9.190', date: '2026-07-07',
    items: [
      '🎨 收盘锁定标签灰色弱化',
      '  - 首页和交易页今日盈亏下方的“收盘锁定”状态改为中性灰色',
      '  - 保持今日盈亏收盘锁定逻辑、行情字段、交易账本和数据库不变',
    ],
  },
  {
    ver: 'v10.7.9.189', date: '2026-07-07',
    items: [
      '📊 今日盈亏收盘锁定',
      '  - 行情新增独立 dailyPnlPrice,今日盈亏不再直接复用展示现价 price',
      '  - 盘前和盘中继续按实时价计算今日盈亏,盘后和夜盘改为收盘锁定口径',
      '  - 盘后现价仍可显示和影响市值/持仓盈亏,但今日盈亏锁定到正常交易时段收盘价',
      '  - 不改交易账本、持仓数量、成本、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.188', date: '2026-07-07',
    items: [
      '🎨 登录 Logo 裁剪贴合',
      '  - 登录页改用官方 PNG 的登录专用裁剪版,去掉原图外层灰黑大画布',
      '  - Logo 显示尺寸从 78px 提升到 92px,图标本体更接近效果图比例',
      '  - 保留官方原始 PNG 文件,登录页只切换到裁剪后的展示资产',
      '  - 不改登录鉴权、注册邀请码、忘记密码、已登录 App、行情或交易账本',
    ],
  },
  {
    ver: 'v10.7.9.187', date: '2026-07-07',
    items: [
      '🔐 注册邀请码和官方登录 Logo',
      '  - 登录页 Logo 改用官方 PNG 文件,不再使用自绘图标',
      '  - 注册页新增确认密码和邀请码输入,两次密码不一致或没有邀请码时不允许提交',
      '  - 注册改走服务端 /api/register,邀请码校验、账号创建和邀请码消耗都在服务端完成',
      '  - 管理员 chenshuai1190@gmail.com 的设置页新增邀请码生成、查看和复制入口',
      '  - 不改登录鉴权、忘记密码、已登录 App、行情、交易账本、EODHD 服务端 token 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.186', date: '2026-07-07',
    items: [
      '🔐 登录页 Quote 深色重设计',
      '  - 未登录首屏按 Quote 效果图重做为深色金融登录界面,默认英文显示',
      '  - 右上角新增中英切换,登录/注册/忘记密码/重置密码文案同步英文和中文',
      '  - Logo、标题、tab、输入框、按钮和辅助文字按参考图控制尺寸和字重',
      '  - 只改登录 UI 和显示文案,不改 Supabase 鉴权、重置密码回跳、已登录 App、行情或数据库',
    ],
  },
  {
    ver: 'v10.7.9.185', date: '2026-07-07',
    items: [
      '📊 盘后当日盈亏券商口径',
      '  - 当日盈亏基准改为独立 dailyBaselineClose,优先使用当前美股市场日期之前的 EOD 收盘价',
      '  - 盘前、盘中、盘后都按“当前价 - 昨日收盘价”计算当日盈亏,避免盘后误变成“盘后价 - 当天收盘价”',
      '  - WebSocket 实时 tick 不再覆盖已锁定的券商口径日内基准,价格仍可继续实时更新',
      '  - 不改交易账本、持仓数量、成本、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.184', date: '2026-07-07',
    items: [
      '🎨 全局行情红色调整',
      '  - 将首页、交易页、资产页和目标页共用的市场红色从偏粉的 rose 色系改为更接近主流券商的橙红色',
      '  - 买入按钮、买入标签、上涨/收益数字和市场颜色模式 swatch 同步使用新的红色 token',
      '  - 保持绿色、涨跌方向设置、交易账本、行情刷新、EODHD 服务端 token、/api/quote 鉴权、数据库结构和 RLS 不变',
    ],
  },
  {
    ver: 'v10.7.9.183', date: '2026-07-07',
    items: [
      '📊 当日盈亏基准保护',
      '  - 股票实时 tick 只有价格但没有有效昨收时,不再覆盖当前完整行情行',
      '  - REST 快照补齐 previousClose 后,立即用同一份基准叠回最后一笔实时价重新计算当日盈亏',
      '  - 避免打开或回前台早期出现价格已更新、当日盈亏仍按半成品基准短暂算错',
      '  - 保持现有涨跌幅公式、交易账本、EODHD 服务端 token、/api/quote 鉴权、数据库结构和 RLS 不变',
    ],
  },
  {
    ver: 'v10.7.9.182', date: '2026-07-07',
    items: [
      '📡 iOS 实时行情恢复重连',
      '  - iOS 主屏幕 Web App 回前台时同步强制重建 BTC、指数和股票三套实时连接',
      '  - pagehide 进入后台时主动关闭旧 socket,避免回前台后残留半死连接只跳几次就停',
      '  - 可见状态下 15 秒无实时活动会主动重连,不再只把连接标记为 stale',
      '  - REST 行情继续作为启动、回前台和手动刷新的快照兜底,不替代 WebSocket 实时推送',
      '  - 不改交易账本、持仓盈亏计算、涨跌幅重算口径、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.181', date: '2026-07-06',
    items: [
      '🎛️ 交易录入输入框去白框',
      '  - 新增交易弹窗输入框默认边框改为透明,避免 iOS 上出现突兀白色描边',
      '  - 聚焦状态只保留低强度金色边框,输入区仍维持当前深色背景和紧凑字号',
      '  - 摊薄成本工具和交易录入弹窗继续保持同一套深色输入框风格',
      '  - 不改交易账本、持仓盈亏计算、行情刷新、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.180', date: '2026-07-06',
    items: [
      '📱 iOS 主屏幕恢复刷新加固',
      '  - 回到主屏幕 Web App 前台时不再依赖冻结断档判断,直接排队 fresh 行情刷新',
      '  - 触发时若 iOS 仍短暂处于 hidden 状态,先挂起并短延迟重试,避免首次触摸被吞',
      '  - pageshow、focus 和 online 同步检查三套实时连接,近期无活动时主动重连',
      '  - 不改交易账本、持仓盈亏计算、EODHD 服务端 token、/api/quote 鉴权、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.179', date: '2026-07-06',
    items: [
      '📱 iOS 主屏幕秒级恢复刷新',
      '  - 添加到主屏幕的 iOS Web App 回到前台时检测冻结断档并立即 fresh 拉取股票行情',
      '  - 补充 pagehide、online、touchstart 和 pointerdown 兜底,避免 iOS 偶发不触发 focus/pageshow',
      '  - 云端账本仍在加载时先挂起恢复刷新,加载完成后用真实交易/自选全集立即补一轮快照',
      '  - 不改交易账本、持仓盈亏计算、EODHD 服务端 token、/api/quote 鉴权、WebSocket relay、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.178', date: '2026-07-06',
    items: [
      '⚡ 行情请求禁用浏览器缓存',
      '  - 首页/交易页自动、切页、前台恢复和实时连接后的股票行情刷新强制走网络请求',
      '  - 主行情请求增加 no-store/no-cache 和一次性时间戳,避免复用浏览器 15 秒旧响应',
      '  - /api/quote 登录态响应改为 no-store,未登录仍保持 401 鉴权边界',
      '  - 不改交易账本、涨跌幅重算口径、EODHD 服务端 token、WebSocket relay、数据库结构或 RLS',
    ],
  },
  {
    ver: 'v10.7.9.177', date: '2026-07-06',
    items: [
      '⚡ 股票行情即时刷新',
      '  - 启动云端账本加载完成后立即拉取行情快照,不再等下一轮轮询',
      '  - 切回 App、窗口聚焦、页面恢复和切到首页/交易页时主动刷新股票数据',
      '  - 股票 WebSocket 连接打开后同步拉一次 REST 快照,避免不活跃股票等待首个 tick',
      '  - 保持 EODHD 服务端鉴权、交易账本、涨跌幅重算口径、汇率和数据库结构不变',
    ],
  },
  {
    ver: 'v10.7.9.176', date: '2026-07-06',
    items: [
      '📈 股票涨跌幅按现价和昨收重算',
      '  - 股票行情只要 previousClosePrice 有效,涨跌额和涨跌幅统一由当前选定价格重新计算',
      '  - 修复 EODHD changePercent 滞后导致 NOK、TSM 等股票涨幅低于真实现价涨幅的问题',
      '  - WebSocket 实时价覆盖时也沿用基础行情昨收重算涨跌幅,不再信任 tick 自带百分比',
      '  - 不改交易账本、成本、股数、汇率、Yahoo 小曲线、RLS 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.175', date: '2026-07-06',
    items: [
      '📈 EODHD 股票价格口径统一',
      '  - 正常交易时段股票价格使用 lastTradePrice,避免与按 lastTradePrice 返回的涨跌幅混用 ethPrice',
      '  - 盘前/盘后才使用 ethPrice,并用 ethPrice 和 previousClosePrice 重新计算涨跌额和涨跌幅',
      '  - previousClosePrice 有效但 EODHD 涨跌字段临时为 0 时,按当前选定价格保守重算',
      '  - 不改交易账本、成本、股数、汇率、行情 relay、Yahoo 小曲线、RLS 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.173', date: '2026-07-06',
    items: [
      '🎛 弹窗字重和交易确认细节',
      '  - 首页添加/编辑自选弹窗、添加成功提示和确认按钮取消过重字重',
      '  - 交易确认弹窗图标改为当前线性图标,交易信息行取消旧等宽字体并移除过长日期',
      '  - 交易录入提示继续缩小,输入框和交易编辑入口统一金色描边语气',
      '  - 不改自选数据、交易账本、摊薄工具数据、行情 relay、汇率、RLS 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.172', date: '2026-07-06',
    items: [
      '🎯 目标页文案和弹窗可读性',
      '  - 交易页新增/编辑交易弹窗标题取消加粗,字号从 14px 提升到 16px',
      '  - 目标页“投资戒律”模块改名为“投资心得”,同步空状态、添加/编辑、删除确认和输入提示',
      '  - 投资心得和复盘日志详情弹窗继续加深背景图蒙版,弱化国旗背景突出正文',
      '  - 不改用户自写心得/复盘内容、交易账本、摊薄工具数据、行情 relay 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.171', date: '2026-07-06',
    items: [
      '🧰 工具弹窗和币种同步',
      '  - 摊薄成本的添加交易弹窗同步交易录入的新深色分层界面',
      '  - 摊薄成本添加交易改为底部买入/卖出按钮提交,仍保留二次确认',
      '  - 投资戒律和复盘日志详情弹窗遮罩改为交易弹窗同款亮度',
      '  - 首页和交易页 USD/CNY 选择自动同步并保存,切换页面后保持一致',
      '  - 不改主交易账本、摊薄成本账本边界、持仓盈亏计算、行情 relay 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.170', date: '2026-07-06',
    items: [
      '🎛 交易录入弹窗细节修正',
      '  - 交易录入弹窗字体和输入框文字适量放大,保持紧凑但提升可读性',
      '  - “名称和现价由系统自动识别”提示增强可读性',
      '  - 移除股票代码、价格股数、日期前面的数字标记,底部不再显示“操作”标题',
      '  - 二次确认弹窗改为居中深色样式,不再显示白色老版底部抽屉',
      '  - 不改主交易账本、波段记录边界、持仓盈亏计算、行情 relay 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.169', date: '2026-07-06',
    items: [
      '🧾 交易录入弹窗结构优化',
      '  - 主交易弹窗改为股票代码、价格股数、日期、买入卖出四层结构',
      '  - 底部买入/卖出按钮合并方向选择和提交动作,点击后仍保留确认弹窗',
      '  - 买入/卖出按钮加入趋势图标,移除重复的确认和取消按钮',
      '  - 录入界面不再展示中文名输入框,名称和现价继续由系统自动识别',
      '  - 不改主交易账本、波段记录边界、持仓盈亏计算、行情 relay 或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.168', date: '2026-07-06',
    items: [
      '💱 头部币种显示改为 CNY',
      '  - 首页和交易页头部隐藏 LIVE 视觉入口,保留原有刷新和实时行情逻辑',
      '  - 首页和交易页 USD/CNY 切换靠右对齐,人民币名称统一显示为 CNY',
      '  - 目标页和英文复利单位等当前界面的人民币名称同步改为 CNY',
      '  - 不改交易账本、行情 relay、汇率换算、数据库结构或鉴权边界',
    ],
  },
  {
    ver: 'v10.7.9.167', date: '2026-07-06',
    items: [
      '💵 交易页持仓市值两位小数',
      '  - 交易页持仓列表的市值显示补回两位小数',
      '  - 市值格式和当日盈亏、持仓盈亏保持一致',
      '  - 仅调整显示格式,不改交易账本、行情、持仓数量或盈亏计算',
    ],
  },
  {
    ver: 'v10.7.9.166', date: '2026-07-06',
    items: [
      '🌐 目标页英文模式',
      '  - 目标页北极星目标、年度目标、投资戒律和复盘日志接入英文文案',
      '  - 目标页新增/编辑戒律、复盘和年度实际数据弹窗同步语言开关',
      '  - 用户自己写的戒律、复盘、心情和目标箴言保持原文显示',
      '  - 仅调整显示文案,不改目标页主体结构、年度计算、数据库结构或行情鉴权',
    ],
  },
  {
    ver: 'v10.7.9.165', date: '2026-07-06',
    items: [
      '🌐 资产页英文模式',
      '  - 资产页头部、走势图、账户分组和账户弹窗接入英文文案',
      '  - 系统内置账户类型和常见账户名显示英文,用户自定义账户名保持原文',
      '  - 保持原有资产页结构、账户数据、月度余额和汇率计算不变',
      '  - 不改交易账本、行情源、数据库结构、RLS 或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.164', date: '2026-07-06',
    items: [
      '🌐 英文交易页头部对齐首页',
      '  - 交易页头部资产卡英文模式三列比例严格同步首页',
      '  - 移除上一版交易页头部单独截断处理,保持首页/交易头部一致',
      '  - 英文股票副标题改为短品牌名,例如 NVIDIA、Microsoft、Nokia',
      '  - 仅调整英文显示层,不改交易账本、行情、持仓盈亏或数据库结构',
    ],
  },
  {
    ver: 'v10.7.9.163', date: '2026-07-06',
    items: [
      '🌐 英文交易页细节修正',
      '  - 交易页头部持仓数量文案同步首页英文尺寸,避免右侧撑出卡片',
      '  - 英文模式下股票列表改为主标题 ticker、副标题英文公司名',
      '  - 首页和交易页共用英文公司名映射,中文模式仍保持原中文股票名',
      '  - 仅调整英文显示层,不改交易账本、行情、持仓盈亏或数据库结构',
    ],
  },
  {
    ver: 'v10.7.9.162', date: '2026-07-06',
    items: [
      '🌐 英文模式扩展到交易页',
      '  - 交易页头部资产卡、工具入口、持仓分布和当日订单支持英文文案',
      '  - 波段记录、摊薄工具、交易记录和交易弹窗接入语言开关',
      '  - 英文模式下交易页股票名称按代码显示,已有备注、日志和自定义内容保持原文',
      '  - 仅调整显示文案和单位,不改交易账本、行情、持仓盈亏或数据库结构',
    ],
  },
  {
    ver: 'v10.7.9.161', date: '2026-07-06',
    items: [
      '⚡ 股票核心行情去 Yahoo 混源',
      '  - 股票价格、昨收、涨跌额和涨跌幅统一只使用 EODHD 口径',
      '  - EODHD 股票 quote 没有有效价格时不再用 Yahoo 自动补价',
      '  - Yahoo 仅保留为股票小曲线的视觉 chart 来源,不参与资产、持仓或当日盈亏计算',
      '  - 设置页数据源说明调整为 EODHD Core + Yahoo Charts,不影响指数、VIX、CNN、交易账本或鉴权',
    ],
  },
  {
    ver: 'v10.7.9.160', date: '2026-07-06',
    items: [
      '⚠️ NOK 盘前口径修复回滚',
      '  - 回滚上一版 NOK 盘前涨跌幅口径改动,恢复其它股票原有实时行情显示',
      '  - 暂停对 EODHD ethPrice/previousClose 的跨源重算,避免扩大影响面',
      '  - 后续将单独隔离 NOK 数据源问题,先不再改动持仓、总资产和当日盈亏计算',
      '  - 不影响交易账本、行情鉴权、RLS、英文模式或 VIX/CNN 数据来源',
    ],
  },
  {
    ver: 'v10.7.9.158', date: '2026-07-06',
    items: [
      '⚡ 盘前稀疏成交实时价保护',
      '  - 修复 NOK 这类盘前成交不密集股票被 REST 延迟价反复覆盖的问题',
      '  - 股票 WebSocket 行情保存 marketStatus,盘前/盘后使用更长实时价保护窗口',
      '  - 盘前真实成交价不再因几分钟无新 tick 被打回常规盘价格',
      '  - 不影响交易账本、行情鉴权、RLS、英文模式或 VIX/CNN 数据来源',
    ],
  },
  {
    ver: 'v10.7.9.157', date: '2026-07-06',
    items: [
      '⚡ 盘前实时当日盈亏修复',
      '  - 股票 WebSocket 只推实时价时,自动沿用基础行情昨收计算当日盈亏',
      '  - 下拉刷新或 REST 兜底返回延迟价时,保留更新鲜的实时盘前价',
      '  - 今日盈亏、持仓当日盈亏和总资产使用同一实时价格口径',
      '  - 不影响交易账本、行情鉴权、RLS 或英文模式设置',
    ],
  },
  {
    ver: 'v10.7.9.156', date: '2026-07-06',
    items: [
      '🌐 英文模式第一阶段',
      '  - 新增本地语言框架和设置页中文/English 切换',
      '  - 底部导航和首页核心卡片、恐慌指标、自选表格支持英文文案',
      '  - 英文模式下首页股票主副标题都显示股票代码缩写',
      '  - 用户自己写的日志、复盘、备注和历史更新记录保持原文不自动翻译',
    ],
  },
  {
    ver: 'v10.7.9.155', date: '2026-07-06',
    items: [
      '🏠 CNN 仪表盘刻度点位微调',
      '  - CNN 圆弧图 0/50/100 刻度文字进一步缩小',
      '  - 0 和 100 向弧线端点内收,贴近标注点位',
      '  - 50 上移到弧线外侧,避免压住高亮弧线',
      '  - 小卡高度、CNN 指针、VIX 样式和行情鉴权逻辑不变',
    ],
  },
  {
    ver: 'v10.7.9.154', date: '2026-07-06',
    items: [
      '🏠 CNN 仪表盘数字显示修复',
      '  - CNN 圆弧图 0/50/100 改为 HTML 绝对定位数字',
      '  - 避免移动端 SVG text 基线和 overflow 导致端点数字显示异常',
      '  - 圆弧整体轻微上移,为 0/100 留出稳定显示空间',
      '  - 小卡高度、VIX 样式、VIX/FGI 数据来源和鉴权逻辑不变',
    ],
  },
  {
    ver: 'v10.7.9.153', date: '2026-07-06',
    items: [
      '🏠 恐慌小卡文字和端点微调',
      '  - CNN 仪表盘 0/100 标签回到弧线起止端附近',
      '  - VIX 市场状态说明降为首页常规小字',
      '  - CNN 恐慌说明文字同步降为同款小字',
      '  - 保持小卡尺寸、VIX/FGI 数据来源和鉴权逻辑不变',
    ],
  },
  {
    ver: 'v10.7.9.152', date: '2026-07-06',
    items: [
      '🏠 CNN 仪表盘端点修正',
      '  - CNN 恐慌贪婪仪表盘改为横向椭圆弧,左右展开更接近参考图',
      '  - 0/100 端点数字向内并上移,避免末尾显示不完整',
      '  - 保持当前双列小卡高度和 VIX 卡片样式不变',
      '  - 不影响 VIX/FGI 数据来源或 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.151', date: '2026-07-06',
    items: [
      '🏠 首页恐慌指数小卡压缩',
      '  - VIX 和 CNN 恐慌小卡同步收紧内边距和纵向间距',
      '  - VIX 风险横条继续压薄,保留 0/20/30/50 刻度',
      '  - CNN 恐慌贪婪仪表盘改为细半圆弧、细指针和发光节点',
      '  - 保持双列小卡布局和现有 VIX/FGI 数据链路不变',
    ],
  },
  {
    ver: 'v10.7.9.150', date: '2026-07-06',
    items: [
      '🎯 目标和操作弹窗细节收紧',
      '  - 目标页本年年份缩小到未来年度同款字号,本年/未达徽标同步缩小',
      '  - 年度目标进度改名为年度目标,投资戒律和复盘日志标题同步 15px',
      '  - 交易记录操作弹窗的修改/删除改为详情弹窗同款小胶囊,删除底部取消按钮',
      '  - 资产账户操作弹窗同步小胶囊修改/删除,删除底部取消按钮',
    ],
  },
  {
    ver: 'v10.7.9.149', date: '2026-07-06',
    items: [
      '🧊 资产和目标模块缩放移除',
      '  - 资产页账户行取消老版本按压缩放,滑过或点击不再让整块卡片收缩',
      '  - 目标页北极星、年度目标、投资戒律和复盘日志卡片取消模块级缩放',
      '  - 保留按钮按压反馈、图表绘制动画和原有点击打开详情/操作弹窗逻辑',
      '  - 不影响资产账户、年度目标、投资戒律、复盘日志、行情或交易数据',
    ],
  },
  {
    ver: 'v10.7.9.148', date: '2026-07-06',
    items: [
      '💼 资产头卡对齐首页',
      '  - 资产页家庭总资产卡改用首页/交易页同款卡片外壳和阴影',
      '  - 家庭总资产标题、金额颜色和金额位置同步首页头部卡片',
      '  - 三项资产指标改用首页/交易页同款分隔线和间距',
      '  - 仅调整资产页头卡视觉,不改账户、汇率、走势图或数据库逻辑',
    ],
  },
  {
    ver: 'v10.7.9.147', date: '2026-07-06',
    items: [
      '📱 PWA Logo 去白边',
      '  - iOS 会把透明图标外沿垫成白色,因此改为不透明深色底 PNG',
      '  - 裁掉源图多余透明边,让深色图标主体更完整填充画布',
      '  - 重新生成 512/192/180/32/16 五套 RGB PNG,四角保持深色',
      '  - 仅替换静态图标资产,不影响行情、交易、RLS 或鉴权逻辑',
    ],
  },
  {
    ver: 'v10.7.9.146', date: '2026-07-06',
    items: [
      '📱 PWA 透明 Logo 替换',
      '  - 使用用户提供的新蓝绿 K 线箭头 PNG 作为 App 图标',
      '  - 源文件为 1024x1024 RGBA,包含真实透明像素和半透明阴影',
      '  - 重新生成 512/192/180/32/16 五套 PNG,manifest 和 iOS 图标路径保持不变',
      '  - 仅替换静态图标资产,不影响行情、交易、RLS 或鉴权逻辑',
    ],
  },
  {
    ver: 'v10.7.9.145', date: '2026-07-06',
    items: [
      '🧭 设置页维护入口清理',
      '  - 删除设置页数据维护和重置本地数据入口',
      '  - 移除对应本地清空代码,减少误操作风险',
      '  - 自动回到前台产生的浏览器网络抖动不再写入行情诊断日志报警',
      '  - 手动刷新、下拉刷新和真实服务端/第三方错误仍会保留诊断',
    ],
  },
  {
    ver: 'v10.7.9.144', date: '2026-07-06',
    items: [
      '🧹 设置页日志懒加载与重置确认',
      '  - 重置本地数据改为应用内输入确认弹窗,不再调用浏览器原生确认框',
      '  - 历史更新日志拆成独立懒加载 chunk,降低设置页首屏负担',
      '  - 删除已废弃 Service Worker 历史文件,入口继续注销旧缓存',
    ],
  },
  {
    ver: 'v10.7.9.143', date: '2026-07-06',
    items: [
      '🧭 行情诊断日志',
      '  - 股票已有 WebSocket 时,自动 REST 兜底失败不再弹底部红条',
      '  - 用户主动下拉刷新或手动刷新失败仍会提示',
      '  - 设置页新增行情诊断日志,记录根因、来源、触发方式和请求范围',
    ],
  },
  {
    ver: 'v10.7.9.142', date: '2026-07-06',
    items: [
      '⚡ 工具行情 WebSocket 秒级推送',
      '  - 摊薄工具和波段记录的股票代码加入已登录服务端股票 WebSocket relay',
      '  - 工具现价统一从 quoteRows/quoteCache 读取,不再只依赖自选列表',
      '  - 首页自选、首页持仓、交易主持仓和工具现价共用同一股票实时行情口径',
    ],
  },
  {
    ver: 'v10.7.9.141', date: '2026-07-06',
    items: [
      '⚡ 交易持仓 WebSocket 秒级推送',
      '  - 交易页头部总资产、今日盈亏和持仓列表接入已登录服务端股票 WebSocket relay',
      '  - 股票 tick 直接写入 quoteCache,investmentSummary 自动同步刷新',
      '  - 首页三大指数继续秒级更新价格和曲线,但不再单独显示连接状态',
      '  - 只有 BTC 卡保留 LIVE/REST/连接中状态标记,减少重复提示',
    ],
  },
  {
    ver: 'v10.7.9.140', date: '2026-07-06',
    items: [
      '⚡ 三大指数 WebSocket 秒级推送',
      '  - 首页标普500、纳斯达克100、道琼斯接入已登录服务端 WebSocket relay',
      '  - EODHD token 继续只留在服务端,浏览器不直连 EODHD',
      '  - 指数 tick 到达后秒级更新卡片价格和小曲线,并显示实时状态',
      '  - 原有 EODHD REST / Yahoo 5 分钟分时继续作为兜底',
    ],
  },
  {
    ver: 'v10.7.9.139', date: '2026-07-05',
    items: [
      '💼 资产走势图详情恢复点击显示',
      '  - 默认状态只显示最新月份圆点,不再默认展开当月盈亏详情',
      '  - 点击某个月份后才显示对应月份、较上月变化和金额',
      '  - 再次点击当前月份可收起详情,圆点回到最新月份',
      '  - 12 个月透明点击热区、曲线动画和资产计算逻辑保持不变',
    ],
  },
  {
    ver: 'v10.7.9.138', date: '2026-07-05',
    items: [
      '💼 资产走势图点位修正',
      '  - 12 个月走势动画结束后只显示最后一个有效月份圆点',
      '  - 点击其它月份时只显示当前选中圆点,不再所有圆圈同时铺满',
      '  - 所有月份仍保留透明点击热区,月度查看能力不变',
      '  - 走势图数据、曲线、面积渐变和资产计算逻辑保持不变',
    ],
  },
  {
    ver: 'v10.7.9.137', date: '2026-07-05',
    items: [
      '💼 资产页粉色对齐首页',
      '  - 检查首页和资产页粉色 token,确认资产页旧值偏紫',
      '  - 资产页走势图、月度变化和老婆账户强调色改用首页同款粉色',
      '  - 粉色来源改为复用首页市场颜色工具,避免后续再次漂移',
      '  - 资产计算、账户列表、汇率和数据库逻辑保持不变',
    ],
  },
  {
    ver: 'v10.7.9.136', date: '2026-07-05',
    items: [
      '🎯 弹窗国旗背景保留',
      '  - 投资戒律和复盘日志列表卡片恢复纯深色背景',
      '  - 美国国旗效果只保留在记录详情和复盘详情弹窗',
      '  - 弹窗背景蒙版加深,正文和操作按钮更清晰',
      '  - 弹窗继续保留星区和红白波浪条纹的美国国旗识别度',
    ],
  },
  {
    ver: 'v10.7.9.135', date: '2026-07-05',
    items: [
      '🎯 投资戒律国旗背景增强',
      '  - 记录详情和复盘详情背景改成更清晰的美国国旗效果',
      '  - 左侧星区和右侧红白波浪条纹更接近参考图',
      '  - 增强国旗可识别度,同时保留深色遮罩保证文字可读',
      '  - 列表卡片保留较低强度国旗纹理,不抢正文',
    ],
  },
  {
    ver: 'v10.7.9.134', date: '2026-07-05',
    items: [
      '🎯 投资戒律和复盘日志国旗背景',
      '  - 记录详情和复盘详情加入淡淡的美国国旗背景',
      '  - 戒律列表和复盘列表同步加入更低透明度国旗纹理',
      '  - 背景层只做视觉装饰,不影响文字阅读和按钮操作',
      '  - 保持原有深色卡片、弱边框和移动端紧凑布局',
    ],
  },
  {
    ver: 'v10.7.9.133', date: '2026-07-05',
    items: [
      '🏠 首页恐慌模块回退旧版小卡',
      '  - VIX 和 CNN 恐慌模块回到高保真重做前的两列小卡效果',
      '  - 删除高保真 SVG 新组件和大卡样式',
      '  - 保留 VIX 灰色标题、正常字重和原有数据逻辑',
      '  - 其它首页表格、资产和行情逻辑保持不变',
    ],
  },
  {
    ver: 'v10.7.9.132', date: '2026-07-05',
    items: [
      '🏠 首页恐慌卡片继续压缩',
      '  - 删除 VIX 和 CNN 恐慌卡片里的曲线图',
      '  - 去掉 VIX 风险定位下方突兀的 15.8 小数字',
      '  - VIX 风险条保持宽度,但条高和刻度高度继续压薄',
      '  - CNN 半圆仪表盘弧线和指针进一步变细,整体高度继续降低',
    ],
  },
  {
    ver: 'v10.7.9.131', date: '2026-07-05',
    items: [
      '🏠 首页恐慌卡片双列瘦身',
      '  - VIX 和 CNN 恐慌卡片恢复并排双列布局',
      '  - 保留暗黑发光、sparkline、风险条和半圆仪表盘样式',
      '  - 删除两张卡片底部分区说明文字,降低整体高度',
      '  - CNN 半圆仪表盘弧线和指针同步瘦身',
    ],
  },
  {
    ver: 'v10.7.9.130', date: '2026-07-05',
    items: [
      '🏠 首页恐慌指标高保真卡片',
      '  - VIX 恐慌指数改为全宽暗黑金融卡片',
      '  - VIX 增加 sparkline、发光状态点和精确风险条',
      '  - CNN 恐慌贪婪指数改为 SVG 半圆仪表盘和五段情绪区间',
      '  - 保留现有 VIX/FGI 数据、日期和 /api/quote 鉴权',
    ],
  },
  {
    ver: 'v10.7.9.129', date: '2026-07-05',
    items: [
      '🏠 首页恐慌指数视觉降重',
      '  - VIX 恐慌指数标题改为 CNN 同款灰色',
      '  - VIX 和 CNN 主数字取消过粗字重',
      '  - CNN 恐惧/贪婪状态文字同步降为正常字重',
      '  - 保留原有指数数值、颜色和仪表盘逻辑',
    ],
  },
  {
    ver: 'v10.7.9.128', date: '2026-07-05',
    items: [
      '🎯 复利明细内部层级降色',
      '  - 内部统计卡、实际进度、曲线和收益表取消偏白边框',
      '  - 内部分割线改为参考图同款低对比暗线',
      '  - 目标、累计、复利、实际进度和表头标签统一降为灰色',
      '  - 保留弹窗宽度、内部滚动、十年年份和收益粉色',
    ],
  },
  {
    ver: 'v10.7.9.127', date: '2026-07-05',
    items: [
      '🎯 北极星复利明细视觉微调',
      '  - 弹窗边框改为参考图同款弱金色,减少白边突兀感',
      '  - 弹窗宽度加大并保持内部可滚动,小屏也能看完整内容',
      '  - 账户曲线底部完整显示 10 年年份,年份字号进一步缩小',
      '  - 累计收益、实际收益和每年收益统一首页粉色',
    ],
  },
  {
    ver: 'v10.7.9.126', date: '2026-07-05',
    items: [
      '🎯 北极星复利明细弹窗',
      '  - 点击北极星目标卡片可查看 10 年复利明细',
      '  - 复用当前本金、年化、年限和目标完成度逻辑',
      '  - 增加账户曲线、实际进度和每年收益表',
      '  - USD/CNY 切换和设置按钮保持独立操作',
    ],
  },
  {
    ver: 'v10.7.9.125', date: '2026-07-05',
    items: [
      '🎯 复盘和戒律列表细节对齐',
      '  - 复盘日志列表正文字号、行距和颜色同步投资戒律卡片',
      '  - 复盘日志日期和情绪改为详情弹窗同款灰色效果',
      '  - 投资戒律日期和置顶标记同步详情弹窗灰色效果',
    ],
  },
  {
    ver: 'v10.7.9.124', date: '2026-07-05',
    items: [
      '🎯 复盘日志卡片和详情弹窗',
      '  - 复盘日志标题同步投资戒律标题效果',
      '  - 复盘列表改为深色大圆角卡片,正文优先展示更多内容',
      '  - 日期和情绪移到卡片底部同一行显示',
      '  - 点击复盘先打开详情预览,修改和删除放到底部小按钮',
      '  - 年度目标默认展示 2 年,剩余年份收进展开按钮',
    ],
  },
  {
    ver: 'v10.7.9.123', date: '2026-07-05',
    items: [
      '🎯 投资戒律记录详情弹窗',
      '  - 点击戒律后改为记录详情卡片,正文完整显示',
      '  - 详情正文支持前缀高亮和更宽松行距',
      '  - 短内容详情保留最小展示空间,不再塌成小面板',
      '  - 修改、删除、置顶按钮改为小号胶囊,删除重复取消按钮',
    ],
  },
  {
    ver: 'v10.7.9.122', date: '2026-07-05',
    items: [
      '🎯 投资戒律标题行精简',
      '  - 投资戒律标题继续缩小到 19px',
      '  - 删除标题下方数量,保留筛选里的全部数量',
      '  - 标题和添加按钮改为同一行垂直居中',
      '  - 标题竖条同步缩短,降低头部占位',
    ],
  },
  {
    ver: 'v10.7.9.121', date: '2026-07-05',
    items: [
      '🎯 投资戒律字体整体收紧',
      '  - 投资戒律标题、数量和添加按钮字号下调',
      '  - 筛选胶囊字号和高度同步收紧',
      '  - 戒律正文从 15px 下调到 14px',
      '  - 日期、置顶和展开全文入口同步降一档',
    ],
  },
  {
    ver: 'v10.7.9.120', date: '2026-07-05',
    items: [
      '🎯 投资戒律低色彩重设计',
      '  - 戒律图标改为彩色圆点和低饱和底圈',
      '  - 筛选按钮改为灰色胶囊和圆点数量',
      '  - 添加、置顶和展开全文入口统一降色',
      '  - 添加/编辑戒律等级选择同步改为圆点',
    ],
  },
  {
    ver: 'v10.7.9.119', date: '2026-07-05',
    items: [
      '🎯 目标页头卡和年度层级微调',
      '  - 北极星头卡删除 CNY 汇率文案',
      '  - 年目标和剩余年限说明字号缩小',
      '  - 年度目标进度标题字号缩小',
      '  - 年度目标年份数字进一步降字重',
    ],
  },
  {
    ver: 'v10.7.9.118', date: '2026-07-05',
    items: [
      '🎯 目标页未开始年度降色',
      '  - 北极星头卡设置按钮改为中性色',
      '  - 未开始年度起点/目标金额改为灰色',
      '  - 未开始年度起点和目标去掉括号年份',
      '  - 未开始年度增长目标虚线改为灰色',
    ],
  },
  {
    ver: 'v10.7.9.117', date: '2026-07-05',
    items: [
      '🎯 目标页细节修正',
      '  - 目标页不再显示首页/交易页行情失败 toast',
      '  - 北极星头卡目标提醒文案下移,设置按钮保持当前位置',
      '  - 年度目标年份数字缩小并降低字重',
    ],
  },
  {
    ver: 'v10.7.9.116', date: '2026-07-05',
    items: [
      '💰 主资产数字小数层级同步',
      '  - 首页总资产同步大整数 + 小号两位小数显示',
      '  - 交易页总资产同步同款数字层级',
      '  - 资产页家庭总资产卡改为完整金额并缩小小数后缀',
      '  - 北极星目标小数后缀显式保持正常字重',
    ],
  },
  {
    ver: 'v10.7.9.115', date: '2026-07-05',
    items: [
      '🎯 北极星目标小数层级优化',
      '  - 仅北极星头卡大目标金额恢复两位小数',
      '  - 主金额整数保持大字号,小数部分改为小字号显示',
      '  - 年度目标、计划、实际、落后等其它金额仍保持无小数',
    ],
  },
  {
    ver: 'v10.7.9.114', date: '2026-07-05',
    items: [
      '🎯 目标页数字密度微调',
      '  - 本年目标卡边框改为和北极星头卡一致的弱边框',
      '  - 北极星头卡设置按钮上移一点,避免贴近底边',
      '  - 目标页金额取消末尾两位小数,降低数字密度',
    ],
  },
  {
    ver: 'v10.7.9.113', date: '2026-07-05',
    items: [
      '🎯 目标页数字对齐首页样式',
      '  - 北极星目标金额改为首页同款完整数字和正常字重',
      '  - USD/CNY 切换按钮尺寸同步首页头卡',
      '  - 头部卡片继续压缩,北极星目标和币种切换保持同一行',
      '  - 删除头部卡右下角半圆装饰和金色边框,改为首页同款弱边框阴影',
      '  - 年度目标区域继续外扩,金额改为完整数字',
      '  - 目标页粉色金额同步首页涨跌颜色体系',
    ],
  },
  {
    ver: 'v10.7.9.112', date: '2026-07-05',
    items: [
      '🎯 修正目标页视觉对齐',
      '  - 修复年度进度条扫光跑到整页形成动态竖条的问题',
      '  - 北极星目标卡按效果图压低高度,保留进度条动态增长',
      '  - 年度目标进度去掉多余外层卡片,恢复接近效果图的宽度',
      '  - 2026 年度卡补回右侧目标/落后信息',
      '  - 未开始年度补回起点、目标、增长目标虚线和两端金额结构',
    ],
  },
  {
    ver: 'v10.7.9.111', date: '2026-07-05',
    items: [
      '🎯 目标页深色化第一阶段',
      '  - 北极星目标卡同步首页深色风格,保留动态进度条',
      '  - 目标金额支持 USD / CNY 切换,人民币显示使用现有汇率接口结果',
      '  - 删除融资杠杆监控模块,年度目标改为点击卡片后弹出修改操作',
      '  - 投资戒律改为黑色卡片,点击记录后可修改、置顶/取消置顶或删除',
      '  - 本地开发预览新增目标页 mock,方便移动端视觉调试',
    ],
  },
  {
    ver: 'v10.7.9.109', date: '2026-07-05',
    items: [
      '🧾 优化资产账户显示和操作',
      '  - 新增账户不再默认选择银行类型,必须由用户自由选择',
      '  - 我/老婆账户列表隐藏本月余额为 0 的账户,历史月度快照和总资产统计逻辑保持不变',
      '  - 账户行删除右侧直接删除按钮,改为点击单条记录弹出账户操作',
      '  - 账户操作弹窗支持修改账户资料、本月余额和删除账户,继续同步云端数据库',
    ],
  },
  {
    ver: 'v10.7.9.108', date: '2026-07-05',
    items: [
      '📐 对齐资产页字号和走势图细节',
      '  - 家庭总资产、走势图标题、账户列表和弹窗字号继续按首页层级收紧',
      '  - 填月度余额和新增账户按钮文字/图标尺寸同步首页按钮规格',
      '  - 12 个月走势图点选提示补回较上月金额和百分比',
      '  - 走势图左侧点位右移,避免初始圆圈碰到纵轴数字',
      '  - 走势图底部补充中间月份标注,让 08 月、01 月、07 月更均衡',
    ],
  },
  {
    ver: 'v10.7.9.107', date: '2026-07-05',
    items: [
      '🧩 修复资产页深色视觉和本地预览',
      '  - 资产页外层壳同步为首页同款深色背景和深色底部导航',
      '  - 家庭总资产、12 个月走势、主按钮和账户列表字号重新收紧',
      '  - 填月度余额和新增账户按钮恢复清晰显示',
      '  - 12 个月走势恢复线条绘制、面积淡入和点位弹出动效',
      '  - 本地无 Supabase 配置时提供只读资产视觉预览,方便开发调试',
    ],
  },
  {
    ver: 'v10.7.9.106', date: '2026-07-05',
    items: [
      '💼 资产模块 UI 深色重设计',
      '  - 家庭总资产、12 个月走势和我/老婆账户列表统一为深色卡片风格',
      '  - 填月度余额和新增账户弹窗改为居中深色界面',
      '  - 资产账户图标改用线性图标体系,删除旧 emoji 显示',
      '  - 删除底部手动 USD/HKD 汇率输入,继续使用每日自动汇率换算',
    ],
  },
  {
    ver: 'v10.7.9.105', date: '2026-07-05',
    items: [
      '🏷️ QQQ 和 TQQQ 改为英文显示',
      '  - 中文名兜底库中 QQQ 显示为 QQQ',
      '  - 中文名兜底库中 TQQQ 显示为 TQQQ',
      '  - QQQ 默认基准股票名称同步改为英文',
    ],
  },
  {
    ver: 'v10.7.9.104', date: '2026-07-05',
    items: [
      '🏷️ 同步持仓和交易记录中文名显示',
      '  - 首页持仓名称同步使用股票中文名兜底',
      '  - 交易页持仓分布、当日订单和全部交易记录同步显示中文名',
      '  - 订单操作弹窗和编辑交易表单也使用同一套中文名显示口径',
    ],
  },
  {
    ver: 'v10.7.9.103', date: '2026-07-05',
    items: [
      '🧾 调整订单操作弹窗尺寸',
      '  - 当前股票交易记录的订单操作弹窗改为更窄的居中尺寸',
      '  - 修改记录、删除记录和取消按钮高度同步压缩',
      '  - 弹窗整体比例对齐当前参考图的紧凑样式',
    ],
  },
  {
    ver: 'v10.7.9.102', date: '2026-07-05',
    items: [
      '🔄 收紧下拉刷新触发条件',
      '  - 只有手势开始时页面已经在顶部,才允许进入全局刷新',
      '  - 在交易记录等内部滚动列表里上下滑动不会再误触发刷新',
      '  - 下拉刷新增加更明确的启动距离,减少轻微滑动误触',
    ],
  },
  {
    ver: 'v10.7.9.101', date: '2026-07-05',
    items: [
      '🔄 修复下拉刷新和摊薄交易输入框显示',
      '  - 下拉刷新会检查线上新版本资源,发现 Vercel 已更新后自动切换到新包',
      '  - 新版本切换前清理旧 App/Logo 缓存,无需重新打开网页',
      '  - 摊薄成本新增股票和添加交易弹窗改用显式深色输入框字色',
      '  - 修复 iOS 键盘弹出时标签、占位文本、输入内容和取消按钮发黑的问题',
    ],
  },
  {
    ver: 'v10.7.9.100', date: '2026-07-05',
    items: [
      '🧮 修复摊薄成本空股票标签和行情拉取提示',
      '  - 摊薄成本股票栏过滤空代码,不再显示空白按钮',
      '  - 云端和本地摊薄数据都会清洗无效股票代码',
      '  - 行情刷新增加请求锁,避免自动轮询和下拉刷新重复并发',
      '  - Safari 网络层 Load failed 改为中文行情网络提示并自动消失',
      '  - 持仓股票代码点击默认打开买入,不再误开卖出',
      '  - 工具入口“股票设置”改为“交易记录”,支持查看全部主交易记录并修改/删除',
    ],
  },
  {
    ver: 'v10.7.9.99', date: '2026-07-05',
    items: [
      '🧮 微调摊薄成本工具显示',
      '  - 删除股票切换栏尾部多余虚线加号',
      '  - 已实现盈亏颜色对齐头部资产卡片粉色体系',
      '  - 卖出展开明细的利润颜色同步对齐同一套盈亏色',
    ],
  },
  {
    ver: 'v10.7.9.98', date: '2026-07-04',
    items: [
      '🧮 摊薄成本工具改为深色版本',
      '  - 摊薄成本标题删除旧图标,保留纯文字标题',
      '  - 主卡、统计卡、交易记录和新增弹窗统一为黑色风格',
      '  - 前台辅助图标改用现有线性图标体系',
      '  - 摊薄成本仍只写独立 cost_basis_trades,不影响正式交易账本',
    ],
  },
  {
    ver: 'v10.7.9.97', date: '2026-07-04',
    items: [
      '📓 修正波段已完成归类和字号',
      '  - 顶部“已完成”统计卡改为独立归类视图',
      '  - HOOD 这类已完成股票会进入已完成分类,不再压在股票卡底部',
      '  - 进行中列表只显示仍在持有的波段',
      '  - 波段记录字号回到交易页资料卡片相邻档位',
    ],
  },
  {
    ver: 'v10.7.9.96', date: '2026-07-04',
    items: [
      '📓 继续压缩波段记录并恢复备注入口',
      '  - 波段记录标题、股票代码、统计卡和明细字体继续收紧',
      '  - 新增波段记录弹窗恢复“波段备注/计划”输入',
      '  - 新增波段后备注会写入波段备注库,用于说明这段波段应该怎么做',
      '  - 进行中和已完成波段备注支持编辑和一键清除',
      '  - 顶部“已完成”统计卡可展开已完成波段列表',
    ],
  },
  {
    ver: 'v10.7.9.95', date: '2026-07-04',
    items: [
      '📓 收紧波段记录字号并移除原生提示',
      '  - 波段记录整体字号和卡片留白进一步收紧',
      '  - 进行中绿色状态点恢复闪烁',
      '  - 移除进行中和已完成波段里的无意义编号标识',
      '  - 波段添加缺字段和非法数值提示改为应用内自定义弹窗',
      '  - 开发准则新增非必要不使用浏览器/系统原生交互控件',
    ],
  },
  {
    ver: 'v10.7.9.94', date: '2026-07-04',
    items: [
      '📓 波段记录小程序融入深色风格',
      '  - 波段记录主界面改为深色卡片,和交易页视觉统一',
      '  - 波段区域普通文字、股票代码、数字和记录行取消加粗/斜体',
      '  - 收益红色对齐首页粉色体系',
      '  - 顶部和空状态新增“新增波段股票”入口',
      '  - 已完成波段默认收进“已完成”折叠区,不再直接铺在主列表',
    ],
  },
  {
    ver: 'v10.7.9.93', date: '2026-07-04',
    items: [
      '🔄 新增全局下拉刷新并修复工具账本边界',
      '  - 添加交易新增完成后默认回到买入',
      '  - 页面滚到顶部后继续下拉可强制刷新云端数据和行情',
      '  - 下拉刷新过程中显示轻量顶部状态提示',
      '  - 波段记录新增只写入波段独立账本,不再串到正式交易记录',
      '  - 波段记录和摊薄成本提交前增加确认框和防重复提交锁',
    ],
  },
  {
    ver: 'v10.7.9.92', date: '2026-07-04',
    items: [
      '🏠 同步首页头部卡片和指数卡字重',
      '  - 首页头部总资产卡片字体大小和位置与交易页同步',
      '  - 首页头部总资产、盈亏和持仓数量改为正常字重',
      '  - 首页四大指数卡片名称、价格和涨跌幅取消加粗',
      '  - 当前信号、VIX 和 CNN 卡片保持不变',
      '  - 订单操作弹窗股票中文名和取消按钮改为清晰可见',
      '  - 旧自选/交易记录里的代码式名称自动用中文股票名兜底',
      '  - 修正部分弱文字的无效透明度 class',
    ],
  },
  {
    ver: 'v10.7.9.91', date: '2026-07-04',
    items: [
      '🧾 回退首屏加载并优化交易页字重',
      '  - 首屏加载回到上一版圆环效果',
      '  - 交易页持仓分布、当日订单、美股和数字改为正常字重',
      '  - 当日订单行改为点击记录后居中弹窗修改或删除',
      '  - 开发准则新增普通文本/股票代码/数字/记录行默认不加粗',
    ],
  },
  {
    ver: 'v10.7.9.90', date: '2026-07-04',
    items: [
      '💰 首屏加载改为钱袋弹跳图标',
      '  - 使用新版透明钱袋 PNG 替换圆环加载',
      '  - 采用轻微弹跳和阴影压缩动效,位置保持在首屏中间',
      '  - 图标按 mini 尺寸展示,动效仅用 CSS,不增加额外脚本',
    ],
  },
  {
    ver: 'v10.7.9.89', date: '2026-07-04',
    items: [
      '📐 优化首页自选/持仓首屏列宽',
      '  - 添加自选股票、编辑自选股票和交易页编辑入口改为正常字重',
      '  - 首页自选/持仓名称列收窄,价格列左移',
      '  - 52周跌幅打开首屏即可完整看到,减少横向滑动',
    ],
  },
  {
    ver: 'v10.7.9.88', date: '2026-07-04',
    items: [
      '🧾 优化交易录入弹层位置和遮罩',
      '  - 取消按钮恢复为清晰可见的暗灰底',
      '  - 添加/修改交易弹层改为居中自适应显示',
      '  - 弹层打开后锁定背景页面, 避免背后内容滑动',
    ],
  },
  {
    ver: 'v10.7.9.87', date: '2026-07-04',
    items: [
      '🧾 优化交易录入弹层细节',
      '  - 买入/卖出选中态改为整块红色/绿色填充',
      '  - 股票代码、中文名、日期、价格和股数输入框取消明显边框效果',
      '  - 修复日期输入框在移动端撑出弹层的问题',
    ],
  },
  {
    ver: 'v10.7.9.86', date: '2026-07-04',
    items: [
      '🧾 交易录入弹层改为深色版本',
      '  - 添加交易和修改交易统一改成黑色 UI',
      '  - 买入选中显示红色,卖出选中显示绿色,未选按钮为灰色',
      '  - 输入框、日期栏、确认和取消按钮同步适配深色风格',
    ],
  },
  {
    ver: 'v10.7.9.85', date: '2026-07-04',
    items: [
      '📊 调整持仓盈亏和占比间距',
      '  - 占比列单独加宽,和持仓盈亏拉开距离',
      '  - 当日盈亏列宽保持不变',
    ],
  },
  {
    ver: 'v10.7.9.84', date: '2026-07-04',
    items: [
      '📐 微调持仓盈亏列显示',
      '  - 当日盈亏列恢复上一版首屏显示效果',
      '  - 持仓盈亏列单独加宽,支持百万和千万级数字',
      '  - 持仓盈亏正数恢复显示 + 号',
    ],
  },
  {
    ver: 'v10.7.9.83', date: '2026-07-04',
    items: [
      '🧾 修正持仓盈亏和今日订单维护',
      '  - 持仓盈亏改为只计算当前持仓浮动盈亏',
      '  - 持仓盈亏正数不再显示 + 号,盈亏列加宽支持横向滑动',
      '  - 当日订单支持修改和删除,并同步云端账本',
    ],
  },
  {
    ver: 'v10.7.9.82', date: '2026-07-04',
    items: [
      '🔢 持仓市值改为整数显示',
      '  - 交易页持仓分布市值/数量列不再显示小数',
      '  - 减少市值列占用,帮助当日盈亏完整露出',
    ],
  },
  {
    ver: 'v10.7.9.81', date: '2026-07-04',
    items: [
      '📏 微调交易持仓分布首屏列宽',
      '  - 市值/数量和现价/成本再左移一点',
      '  - 保持当日盈亏列宽,首屏末尾数字更容易完整露出',
    ],
  },
  {
    ver: 'v10.7.9.80', date: '2026-07-04',
    items: [
      '📊 继续优化交易持仓分布',
      '  - 持仓分布内部左右留白继续收紧,表格更贴近两侧边框',
      '  - 缩窄名称/代码、市值/数量和现价/成本列,首屏更完整显示当日盈亏',
    ],
  },
  {
    ver: 'v10.7.9.79', date: '2026-07-04',
    items: [
      '📐 优化首页指数卡和交易持仓表宽度',
      '  - 首页四张市场卡价格数字统一左移并略微收紧,避免右侧被撑出',
      '  - 交易页持仓分布加宽股票信息和盈亏列,当日盈亏显示更完整',
    ],
  },
  {
    ver: 'v10.7.9.78', date: '2026-07-04',
    items: [
      '🔐 修复找回密码回跳',
      '  - 找回密码邮件固定回到生产域名',
      '  - 登录页兼容 Supabase code 回跳和过期链接提示',
      '  - 避免有效链接进入后不显示设置新密码',
    ],
  },
  {
    ver: 'v10.7.9.77', date: '2026-07-04',
    items: [
      '📱 修复手机桌面图标白边',
      '  - PWA / iOS 图标改为不透明深色底 PNG',
      '  - 避免透明外沿在浅色壁纸上显示成白色边框',
    ],
  },
  {
    ver: 'v10.7.9.76', date: '2026-07-04',
    items: [
      '📱 更新手机桌面图标',
      '  - 保存到手机桌面的 PWA 图标替换为新黑金 K 线图标',
      '  - 新增 180/192/512 PNG 图标和 16/32 favicon',
      '  - manifest 和 iOS apple-touch-icon 改为 PNG 图标',
    ],
  },
  {
    ver: 'v10.7.9.75', date: '2026-07-04',
    items: [
      '₿ 修复 BTC 首屏卡片错位',
      '  - BTC 实时 tick 不再在市场卡未初始化时单独占第一格',
      '  - 等四张市场卡加载完成后再覆盖更新 BTC 第四格',
    ],
  },
  {
    ver: 'v10.7.9.74', date: '2026-07-04',
    items: [
      '₿ BTC 单币种独立实时行情',
      '  - 首页 BTC 卡接入已登录服务端 WebSocket relay',
      '  - 前端不暴露 EODHD token,断线后自动重连并用 REST 兜底',
      '  - BTC 卡显示 LIVE/REST/连接中状态',
    ],
  },
  {
    ver: 'v10.7.9.73', date: '2026-07-04',
    items: [
      '🧮 修复卖出后累计收益率口径',
      '  - 累计收益率分母改为当前实际持仓成本',
      '  - 卖出盈利会正确摊薄剩余持仓成本,不再被历史买入额压低收益率',
      '  - 超过当前持仓数量的异常卖出不会污染盈亏计算',
    ],
  },
  {
    ver: 'v10.7.9.72', date: '2026-07-04',
    items: [
      '📈 首页自选/持仓新增年初至今和排序',
      '  - 自选和持仓右侧指标新增年初至今涨跌幅',
      '  - 价格、涨跌幅、52 周跌幅、年初至今和持仓盈亏支持表头排序',
      '  - 自选列表不再显示持仓盈亏,持仓 tab 才显示真实持仓盈亏',
    ],
  },
  {
    ver: 'v10.7.9.71', date: '2026-07-04',
    items: [
      '🧩 首页自选编辑管理',
      '  - 自选列表底部新增并排编辑自选股票入口',
      '  - 编辑窗口支持置顶、上移、下移和删除',
      '  - 删除点击股票展开自选参数的旧入口',
    ],
  },
  {
    ver: 'v10.7.9.70', date: '2026-07-04',
    items: [
      '📊 首页自选/持仓表格全局横向滑动',
      '  - 左侧名称列固定不动',
      '  - 右侧价格、涨跌幅、52 周跌幅和持仓盈亏统一横向滑动',
      '  - 表头和每只股票数字上下严格对齐',
    ],
  },
  {
    ver: 'v10.7.9.69', date: '2026-07-04',
    items: [
      '✅ 首页自选添加体验细节优化',
      '  - 添加自选窗口改为居中自适应,键盘弹出时输入框保持可操作',
      '  - 添加股票时显示添加中状态并禁止重复提交',
      '  - 添加成功后弹出成功提示窗口',
      '  - 首页持仓默认展示全部持仓股',
      '  - 自选/持仓右侧指标改为横向滑动,增加 52 周高点跌幅',
    ],
  },
  {
    ver: 'v10.7.9.68', date: '2026-07-04',
    items: [
      '⭐ 首页自选添加与持仓口径修正',
      '  - 自选只显示用户主动添加的股票,新用户默认空列表',
      '  - 首页新增底部添加自选股票弹层,仅保留美股添加流程',
      '  - 持仓继续同步交易主账本真实持仓,不再污染自选',
      '  - 股票图标增加多源候选和成功缓存,IBKR 等缺图会自动兜底',
    ],
  },
  {
    ver: 'v10.7.9.67', date: '2026-07-04',
    items: [
      '🎚️ 设置页深色风格对齐首页',
      '  - 移除实时推送、数据状态和 JSON 导出入口',
      '  - 云端账户改为普通账户设置卡',
      '  - 设置页底部导航同步深色模式',
    ],
  },
  {
    ver: 'v10.7.9.66', date: '2026-07-04',
    items: [
      '🎨 首页/交易页加载和涨跌颜色设置',
      '  - 首页、交易和建议加载态改为深色,避免闪白',
      '  - 持仓分布右侧新增绿涨红跌/绿跌红涨切换',
      '  - 首页自选和持仓改为接入交易主账本股票集合',
    ],
  },
  {
    ver: 'v10.7.9.65', date: '2026-07-04',
    items: [
      '💱 汇率每日自动查询',
      '  - 新增已登录 /api/fx 服务端接口',
      '  - USD/CNY 和 HKD/CNY 每台设备每天查询一次',
      '  - 查询失败时保留上次缓存或默认汇率',
    ],
  },
  {
    ver: 'v10.7.9.64', date: '2026-07-04',
    items: [
      '🔠 USD/CNY 盈亏数字字号统一',
      '  - 首页和交易页头部 USD 盈亏数字按 CNY 尺寸收紧',
      '  - 汇率仍为手动/默认值,暂未接入自动汇率接口',
    ],
  },
  {
    ver: 'v10.7.9.63', date: '2026-07-04',
    items: [
      '📒 交易主账本独立建库',
      '  - 首页和交易页持仓改为读取 stock_trades',
      '  - 旧 trades 只保留给波段记录兼容',
      '  - JSON 备份同步包含新主账本',
    ],
  },
  {
    ver: 'v10.7.9.62', date: '2026-07-04',
    items: [
      '🎨 交易页盈亏色号统一首页',
      '  - 持仓盈亏、当日盈亏和订单方向色阶改为首页同款',
      '  - 买入/卖出快捷按钮颜色同步收敛',
    ],
  },
  {
    ver: 'v10.7.9.61', date: '2026-07-04',
    items: [
      '🎚️ 交易页头部和工具箱细节对齐首页',
      '  - 交易头部卡片字号、按钮和间距对齐首页',
      '  - 波段记录后改为摊薄工具、股票设置',
      '  - 占比列只显示百分比',
    ],
  },
  {
    ver: 'v10.7.9.60', date: '2026-07-04',
    items: [
      '🧭 交易页工具箱和持仓表优化',
      '  - 交易页背景和底部导航统一为首页黑色风格',
      '  - 持仓表右侧指标支持横向滑动',
      '  - 增加个股持仓盈亏和市值占比',
      '  - 全部功能入口暂不响应点击',
    ],
  },
  {
    ver: 'v10.7.9.59', date: '2026-07-04',
    items: [
      '📒 交易页重构为主交易账本',
      '  - 持仓分布从买入/卖出记录自动推导',
      '  - 卖出盈利会摊薄剩余持仓实际成本',
      '  - 波段记录和摊薄工具收进工具箱',
    ],
  },
  {
    ver: 'v10.7.9.58', date: '2026-07-04',
    items: [
      '↩️ 回滚首页当前信号展开列表',
      '  - 当前信号恢复上一版紧凑卡片',
      '  - 暂不显示策略展开列表和 L1-L6 档位',
    ],
  },
  {
    ver: 'v10.7.9.56', date: '2026-07-03',
    items: [
      '🏷 修复部分公司图标不显示',
      '  - EODHD 图标大写路径失败后自动尝试小写路径',
      '  - 两种路径都失败时再隐藏图标',
    ],
  },
  {
    ver: 'v10.7.9.55', date: '2026-07-03',
    items: [
      '📋 首页自选默认显示全部',
      '  - 自选列表不再默认折叠为 3 行',
      '🏷 自选/持仓列表接入 EODHD 公司图标',
      '  - 图片加载失败时直接隐藏, 不再显示字母占位',
    ],
  },
  {
    ver: 'v10.7.9.54', date: '2026-07-03',
    items: [
      '📋 首页自选/持仓列表按效果图重排',
      '  - Tab、表头、股票名称、副标题和数字字号同步收紧',
      '  - 列表改为 3 行预览并保留查看全部入口',
      '  - 行尾箭头、行高和分隔线按效果图调整',
    ],
  },
  {
    ver: 'v10.7.9.53', date: '2026-07-03',
    items: [
      '🏠 首页信息密度继续收紧',
      '  - 总资产卡删除约等金额副行',
      '  - 持仓数量下方说明文字删除',
      '📡 当前信号卡整体缩小约 20%',
      '₿ 市场卡将黄金/美元替换为 BTC/美元',
    ],
  },
  {
    ver: 'v10.7.9.52', date: '2026-07-03',
    items: [
      '🎚 首页数字层级继续收紧',
      '  - 总资产、当前信号、回撤、VIX/CNN 数字减小',
      '💱 总资产副行删除重复汇率文案',
    ],
  },
  {
    ver: 'v10.7.9.51', date: '2026-07-03',
    items: [
      '🎨 首页字体调整为更接近 iOS 看板效果',
      '  - 数字不再使用代码感 mono 字体',
      '  - 底部导航在首页同步黑底金色',
      '💱 首页总资产支持 USD/CNY 切换',
      '  - 切换选择会自动记住',
    ],
  },
  {
    ver: 'v10.7.9.50', date: '2026-07-03',
    items: [
      '🏠 首页重做为投资账户看板',
      '  - 总资产/今日盈亏/累计盈亏改从交易记录派生',
      '  - 持仓数量=当前持仓股票数, 笔数=卖出记录数',
      '  - 自选只做行情与关注列表, 不再作为首页主账本',
      '📈 市场卡扩展为标普/纳指/道指/黄金美元四项',
    ],
  },
  {
    ver: 'v10.7.9.49', date: '2026-07-03',
    items: [
      '🧱 拆出行情 API provider / timeout / error 边界',
      '✅ 新增第一批自动化测试 (12 项)',
      '🛡 增加 Supabase RLS 匿名 REST 探针',
      '  - 12 张用户表匿名访问均不可见',
    ],
  },
  {
    ver: 'v10.7.9.48', date: '2026-07-03',
    items: [
      '🛡 移除浏览器直连 EODHD WebSocket token 路径',
      '  - 前端不再读取 VITE_EODHD_TOKEN',
      '  - 实时行情只允许未来通过服务端中转启用',
      '📋 新增架构安全审查与升级路线',
    ],
  },
  {
    ver: 'v10.7.9.47', date: '2026-07-03',
    items: [
      '⚡ 删除已登录启动开屏,首页直接进入主界面',
      '  - 移除 Quote 黑金加载图和 1.6s 人为等待',
      '  - 保留云端同步保存保护,避免默认数据误写回 Supabase',
      '📝 设置页更新日志同步到最新版本',
    ],
  },
  {
    ver: 'v10.7.9.46', date: '2026-06-13',
    items: [
      '🏷 首页"当前猎手状态" → "当前信号"',
    ],
  },
  {
    ver: 'v10.7.9.45', date: '2026-06-13',
    items: [
      '🎨 改名 Bottomline → Quote',
      '  - 开屏: 金色 X 两笔画描出 + Quote 文字',
      '  - 头部 logo / 关于卡 / 图标 / PWA 名 全部更新',
      '  - favicon 改黑底金 X',
      '🎬 v45: 开屏 X 直接显示 (不描线), 最短停留 1.6s 让 Quote 完整淡入',
    ],
  },
  {
    ver: 'v10.7.9.43', date: '2026-06-10',
    items: [
      '🧠 预警文案理性化 (保留进攻性)',
      '  - L6 不再"满仓100%", 留 10-20% 应急弹药',
      '  - L8 "所有现金加杠杆" → 先核维持率, 弹药分 2-3 次',
      '  - FGI "梭哈买入"→分批进攻, "清仓离场"→留核心仓',
    ],
  },
  {
    ver: 'v10.7.9.42', date: '2026-06-10',
    items: [
      '💰 资产走势 Modal 改黑金质感 (跟家庭总资产同调)',
      '📊 每月新增环比金额 (+233.2万 · ↑8.1%, 不只百分比)',
      '  - 起始月显示"起始月", 持平显示"±0"',
    ],
  },
  {
    ver: 'v10.7.9.41', date: '2026-06-10',
    items: [
      '🎯 修复猎手状态 QQQ 回撤拉取不到 (核心 bug)',
      '  - QQQ 之前没进请求列表, 数据藏 INDICES 里只有当日高',
      '  - 现 QQQ/TQQQ 走完整接口, 用真实 52 周高算回撤',
      '  - 52周高不再写死 640.47, 跟 watchlist 同源',
    ],
  },
  {
    ver: 'v10.7.9.40', date: '2026-04-27',
    items: [
      '🚀 升级 EODHD All-In-One ($99.99/月), 全套接口替换',
      '📅 重要日历 (首页时间轴 - 15 天)',
      '  - 财报数据: NASDAQ → EODHD 官方 (更稳)',
      '  - 财报 + FOMC 议息',
      '🪟 Modal 重新设计 + 公司 Logo + 可滚动',
      '  - 公司 Logo (EODHD 官方)',
      '  - 顶部 V4 两行: "EPS 超预期 +X%" / "营收 超预期 +X%"',
      '  - 业绩 V2 双卡片: EPS + 营收 (实际 vs 预期)',
      '  - 已发布显示实际, 未发布显示预期',
      '  - 同比对比 (本季 EPS/营收 vs 去年同期)',
      '  - 📋 公司信息 (含 行业/员工)',
      '  - 📊 分析师目标价 + 5 档评级',
      '  - 📈 公司基本面 (PE TTM/营收/利润率/ROE)',
      '  - 字段口径标注 (TTM / 本季 / 数据源 EODHD)',
      '🔌 接入 EODHD 接口:',
      '  - Earnings::History (EPS 实际+预期+超预期)',
      '  - Earnings::Trend (营收预期 平均/低/高)',
      '  - Financials::Income_Statement::quarterly (营收实际)',
    ],
  },
  {
    ver: 'v10.7.9.38', date: '2026-04-26',
    items: [
      '📅 新增 重要日历 (首页时间轴)',
      '  - 显示未来 15 天: 财报日 (watchlist 全部股) + FOMC 议息',
      '  - 时间轴风格 (彩色圆点 + 横滑)',
      '  - 日期格式: 今天 / 4/28 / 5/2 (M/D)',
      '  - 股票名按类型染色 (橙=财报, 蓝=议息, 红=今天)',
      '  - 财报数据: NASDAQ 公开接口 (EODHD 套餐不含 Calendar)',
      '  - 每次进 App 都拉新, 无缓存',
      '🪟 点击事件 → 弹详情 Modal',
      '  - 圆形渐变图标 (金 $ 财报 / 蓝 % 议息)',
      '  - 时段中文 (盘前/盘后)',
      '  - EPS 预期/实际 + 超预期对比',
      '  - 持仓股数提示',
    ],
  },
  {
    ver: 'v10.7.9.32', date: '2026-04-25',
    items: [
      '💼 新增 摊薄成本计算器 (交易 tab 最底部) ☁️',
      '  - iOS 卡片风格 · 多股 Tab 切换 · 移动加权平均算法',
      '  - 双成本: 会计摊薄 + 实际成本 (扣已实现盈亏)',
      '  - 实际成本下方: ↑ +37.0% · 现价 $200.00 (实时跟随)',
      '  - 累计投入 + 已实现盈亏 加 CNY 副显示',
      '  - 卖出交易点击 ▼ 展开利润详情 (收入 − 成本 = 利润)',
      '  - 云端 Supabase 持久化 · 跨设备同步',
      '🔄 头部黑金卡按 tab 切换字段 (持仓总盈亏 / 波段总盈亏)',
      '💱 首页"今日"加 CNY 副显示',
      '🐛 修复顶部指数 SPY/QQQ 涨跌% 乱跳 bug',
      '🗑 删除确认 Modal 统一 (苹果风底部抽屉, 替换浏览器原生)',
    ],
  },
  {
    ver: 'v10.7.9.17', date: '2026-04-24',
    items: [
      '🐛 修复 REST 与 WebSocket 数据冲突 (价格"跳回"bug)',
      'WebSocket 已连接时跳过 REST 自动拉取 · 断开时 REST 兜底',
    ],
  },
  {
    ver: 'v10.7.9.16', date: '2026-04-23',
    items: ['🎨 关注卡 V1 三列布局: 代码 | 走势图 | 价格'],
  },
  {
    ver: 'v10.7.9.15', date: '2026-04-23',
    items: ['🎯 删除关注列表走势图 (然后用户说还是画线好看, 下一版恢复)'],
  },
  {
    ver: 'v10.7.9.14', date: '2026-04-23',
    items: ['🎯 切换到 EODHD Live v2 (/api/us-quote-delayed)', '支持 ethPrice (盘前盘后实时价)', 'changePercent 跟 Yahoo 网页一致'],
  },
  {
    ver: 'v10.7.9.13', date: '2026-04-23',
    items: ['📈 首页持仓卡: 浮动% → 当日盈亏', '显示: 今日 +$X,XXX (+X.XX%)', '⚠️ 盘前盘后涨跌% 不实时 (已解决, 见 v14)'],
  },
  {
    ver: 'v10.7.9.12', date: '2026-04-23',
    items: ['🎨 波段记录卡换白卡极简 (替换黑金)', '跟关注列表/戒律/复盘 视觉统一', '白底 + 灰块 + 进行中红色数字'],
  },
  {
    ver: 'v10.7.9.11', date: '2026-04-23',
    items: ['📊 交易波段卡加"现价"列 (3 列 → 4 列)', '现价颜色: 高于买入均=红(浮盈) · 低于=绿(浮亏)', '一眼看出当前价格 + 盈亏方向'],
  },
  {
    ver: 'v10.7.9.10', date: '2026-04-23',
    items: ['🔔 预警折叠状态持久化 (localStorage)', '用户点"收起"后, 下次打开保持折叠', '有新预警或等级升级 → 自动展开 + 显示"新/升级"徽章', '不会漏掉重要信号'],
  },
  {
    ver: 'v10.7.9.9', date: '2026-04-23',
    items: ['💱 首页总览卡加人民币副显示 (≈ ¥X.X万)', '总市值 + 波段总盈亏 都显示', '主 USD 大字 · 小字 CNY 辅助 · 汇率明示', '🧹 代码清理 -105 行 (10 处死代码)'],
  },
  {
    ver: 'v10.7.9.8', date: '2026-04-23',
    items: ['✨ 北极星计划卡 宇宙动效 (保留烈焰红金)', '北极星移到右下角, 不挡设置按钮', '8 颗闪烁星 + 偶尔流星'],
  },
  {
    ver: 'v10.7.9.7', date: '2026-04-23',
    items: ['🔧 修复顶部指数(标普/纳指 ETF)WebSocket 不更新', '现在 SPY/QQQ 也实时推送'],
  },
  {
    ver: 'v10.7.9.6', date: '2026-04-23',
    items: ['📋 设置页卡片重排序 (符合使用频率)', '新顺序: 实时推送 → 数据状态 → 更新日志 → 云端 → 数据 → 关于', '高频功能优先 (实时推送在最上)'],
  },
  {
    ver: 'v10.7.9.5', date: '2026-04-23',
    items: ['🐛 修复复利计划输入 bug (起始年/总年数/目标年龄)', '之前: 删空数字会自动跳回默认值, 不让删', '现在: 输入时可以完全清空, 失焦时才 fallback 默认'],
  },
  {
    ver: 'v10.7.9.4', date: '2026-04-23',
    items: ['📜 复盘日志默认显示 10 条 (跟戒律一致)', '超过 10 条 → "展开剩余 X 条" 按钮', '收起后回归 10 条简洁视图'],
  },
  {
    ver: 'v10.7.9.3', date: '2026-04-23',
    items: ['🐛 修复戒律置顶 bug (pinned 排序失效)', '现在置顶的戒律永远显示在最上面'],
  },
  {
    ver: 'v10.7.9.2', date: '2026-04-23',
    items: ['📐 关注列表再扩宽 (删 ✕ + 单线分隔)', '右侧 padding 28px → 14px (内容多 14px 空间)', '卡间双线 → 单线 (视觉更轻)', '删除股票: 点卡片进编辑 → 底部"删除"按钮'],
  },
  {
    ver: 'v10.7.9.1', date: '2026-04-23',
    items: ['📱 关注列表入侵式占满全屏 (手机视觉 +宽 32px)', '卡片左右贴边, 走势图更长', '编辑卡和添加按钮保持原宽度'],
  },
  {
    ver: 'v10.7.9.0', date: '2026-04-23',
    items: ['🎨 关注列表卡片重设计 (B 对称两块)', '左块: 持仓信息 / 右块: 52周高 + L级', '移除整张卡红色背景 (跟"触发预警"统一)', '52周跌幅红色 + 等级渐深 (L1黄→L7暗红)'],
  },
  {
    ver: 'v10.7.8.9', date: '2026-04-22',
    items: ['🎉 大合并版: 含所有功能 + 修复', '🎯 当前猎手状态 / settings 补全 / try/catch 兼容'],
  },
  {
    ver: 'v10.7.8.8', date: '2026-04-22',
    items: ['🚨 修复 5 张表加载失败 (Supabase auth lock 抢锁 bug)', '⚡ 性能优化: 7 处 useMemo (波段/警报/统计缓存)', 'WebSocket 模式 CPU 占用降低 ~40%'],
  },
  {
    ver: 'v10.7.8.7', date: '2026-04-22',
    items: ['💾 新增"导出 JSON 备份"按钮 (设置页 → 数据卡)', '建议每月 1 次导出, 对抗数据意外丢失'],
  },
  {
    ver: 'v10.7.8.6', date: '2026-04-22',
    items: ['底部 tab "复盘" 改名 "目标" (更贴合实际功能)', '更新日志支持折叠/展开 (默认显示最新 5 条)'],
  },
  {
    ver: 'v10.7.8.5', date: '2026-04-22',
    items: ['首页指数改用 SPY/QQQ ETF (实时数据 替代 15min 延迟)', '删除"手动保存"假按钮'],
  },
  {
    ver: 'v10.7.8.3', date: '2026-04-22',
    items: ['年度目标进度条改成"实际收益完成度" (不再是时间)', '4 个主按钮统一金色描边'],
  },
  {
    ver: 'v10.7.8.1', date: '2026-04-22',
    items: ['WebSocket 走势图实时同步 (1 分钟合并桶)'],
  },
  {
    ver: 'v10.7.8', date: '2026-04-22',
    items: ['🧪 WebSocket 实时推送 BETA (< 50ms 延迟)', '设置页 → 🧪 实时推送 手动开启', '价格变化时卡片闪烁动画'],
  },
  {
    ver: 'v10.7.7.4', date: '2026-04-22',
    items: ['🛡️ 数据安全加固: 云端失败时不覆盖本地', '顶部警告横幅 (含重试按钮)', '"重置"加二次确认 (防误操作)'],
  },
  {
    ver: 'v10.7.7.3', date: '2026-04-22',
    items: ['修复波段"消失"bug (id 改基于日期)', '新增"📋 全部交易"弹窗 (完整历史可查可删)'],
  },
  {
    ver: 'v10.7.7.2', date: '2026-04-22',
    items: ['资产走势图入场动画 (V2 点依次弹出)', '空月断线 不画"假数据"'],
  },
  {
    ver: 'v10.7.7.1', date: '2026-04-22',
    items: ['资产走势图空月断线修复'],
  },
  {
    ver: 'v10.7.7', date: '2026-04-22',
    items: ['设置页全部黑金统一', '云端账户 + 手动拉取按钮改黑金'],
  },
  {
    ver: 'v10.7.6', date: '2026-04-22',
    items: ['设置页删除持仓头卡', '数据状态升级为智能刷新实时指标', '新增更新日志卡片'],
  },
  {
    ver: 'v10.7.5', date: '2026-04-22',
    items: ['修复密码重置直接登录 bug', '设置页加"修改密码"入口'],
  },
  {
    ver: 'v10.7.4', date: '2026-04-22',
    items: ['新增忘记密码功能', '登录页升级黑金主题'],
  },
  {
    ver: 'v10.7.3', date: '2026-04-22',
    items: ['品牌图标: 金色 K 线柱', 'App 名改为 Bottomline'],
  },
  {
    ver: 'v10.7.2', date: '2026-04-22',
    items: ['资产录入按人 Tab 切换 (我/老婆)'],
  },
  {
    ver: 'v10.7.1', date: '2026-04-22',
    items: ['智能刷新 (盘中 10s/盘外 30s/休市 5min)', '修复首次进入没走势图'],
  },
  {
    ver: 'v10.7.0', date: '2026-04-22',
    items: ['我的关注 Robinhood 风改造', '走势图 56px + 渐变填充'],
  },
  {
    ver: 'v10.6.9', date: '2026-04-21',
    items: ['修复 HKD 汇率 bug (港币换算正确)'],
  },
  {
    ver: 'v10.6.8', date: '2026-04-21',
    items: ['全黑流动金线开屏 (V4-B)', 'SUPABASE LIVE 状态徽章'],
  },
  {
    ver: 'v10.6.7', date: '2026-04-21',
    items: ['大 B 开屏字母品牌强化'],
  },
  {
    ver: 'v10.6.6', date: '2026-04-21',
    items: ['3 tab 头部统一奢华黑金'],
  },
  {
    ver: 'v10.6.5', date: '2026-04-21',
    items: ['修复 52 周高拆股 bug (TQQQ)', '盘前数据自动显示'],
  },
  {
    ver: 'v10.6.4', date: '2026-04-21',
    items: ['交易 tab V3.2 重做: 进行中独立大卡 + 历史紧凑'],
  },
  {
    ver: 'v10.6.0-3', date: '2026-04-20',
    items: ['年度表视觉升级', '字号+折叠优化', '防重复提交'],
  },
  {
    ver: 'v10.5.x', date: '2026-04-19',
    items: ['复利计划', '融资杠杆监控', '投资戒律'],
  },
  {
    ver: 'v10.x', date: '2026-04 之前',
    items: ['Supabase 云端同步', '账户/快照独立表', '波段切分'],
  },
  {
    ver: 'v1.0', date: '诞生',
    items: ['第一版 TQQQ 波段追踪器 🎂'],
  },
];

export default settingsChangelog;
