import React, { lazy, Suspense } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit2,
  Home,
  ListChecks,
  Loader2,
  LogOut,
  Pin,
  Plus,
  RefreshCw,
  Settings,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import ConfirmModal from './components/ConfirmModal.jsx';
import { normalizeConfirmModalOptions } from './lib/confirmModal.js';
import { localMonthKey, shiftMonthKey } from './lib/calendarMonth.js';
import { normalizeLanguage, t } from './lib/i18n.js';

const AnalysisTab = lazy(() => import('./tabs/AnalysisTab.jsx'));
const HomeTab = lazy(() => import('./tabs/HomeTab.jsx'));
const ReviewTab = lazy(() => import('./tabs/ReviewTab.jsx'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab.jsx'));
const TradesTab = lazy(() => import('./tabs/TradesTab.jsx'));
const PnlReportPage = lazy(() => import('./pages/PnlReportPage.jsx'));
const HomeMarginRiskPage = lazy(() => import('./pages/HomeMarginRiskPage.jsx'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage.jsx'));
const WatchlistStockDetailPage = lazy(() => import('./pages/WatchlistStockDetailPage.jsx'));
const WaveTrackerPage = lazy(() => import('./pages/WaveTrackerPage.jsx'));
const CommunityCompetitionPage = lazy(() => import('./pages/CommunityCompetitionPage.jsx'));
const EarningsDetailPage = lazy(() => import('./pages/EarningsDetailPage.jsx'));
const WaveTrackerPrototype = lazy(() => import('./dev/WaveTrackerPrototype.jsx'));
const SettingsRedesignPrototype = lazy(() => import('./dev/SettingsRedesignPrototype.jsx'));
const WatchlistStockDetailPrototype = lazy(() => import('./dev/WatchlistStockDetailPrototype.jsx'));

const USD_RATE = 6.77;
const HKD_RATE = 0.86;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftMonth(monthKey, offset) {
  return shiftMonthKey(monthKey, offset);
}

function shiftedDateKey(offset, date = new Date()) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

const baseAccounts = [
  { id: 'dev_me_bank_cny', owner: '我', type: '银行', name: '招商银行', currency: 'CNY', icon: '银行', sortOrder: 0, balance: 80000 },
  { id: 'dev_me_bank_hkd', owner: '我', type: '银行', name: '招商永隆', currency: 'HKD', icon: '银行', sortOrder: 1, balance: 260436 },
  { id: 'dev_me_longbridge', owner: '我', type: '证券', name: '长桥证券', currency: 'USD', icon: '证券', sortOrder: 2, balance: 1356 },
  { id: 'dev_me_ibkr', owner: '我', type: '证券', name: 'IBKR', currency: 'USD', icon: '证券', sortOrder: 3, balance: 600100 },
  { id: 'dev_me_alipay', owner: '我', type: '支付宝', name: '支付宝现金', currency: 'CNY', icon: '支付宝', sortOrder: 4, balance: 45000 },
  { id: 'dev_wife_eastmoney', owner: '老婆', type: '证券', name: '东方财富', currency: 'CNY', icon: '证券', sortOrder: 0, balance: 131000 },
  { id: 'dev_wife_ibkr', owner: '老婆', type: '证券', name: 'IBKR', currency: 'USD', icon: '证券', sortOrder: 1, balance: 2472240 },
  { id: 'dev_wife_alipay', owner: '老婆', type: '支付宝', name: '支付宝理财', currency: 'CNY', icon: '支付宝', sortOrder: 2, balance: 0 },
  { id: 'dev_wife_hkd', owner: '老婆', type: '银行', name: '招商永隆', currency: 'HKD', icon: '银行', sortOrder: 3, balance: 1782801 },
  { id: 'dev_wife_wechat', owner: '老婆', type: '微信', name: '微信理财', currency: 'CNY', icon: '微信', sortOrder: 4, balance: 3900000 },
  { id: 'dev_wife_fund', owner: '老婆', type: '公积金', name: '公积金', currency: 'CNY', icon: '公积金', sortOrder: 5, balance: 380000 },
];

const mockDisciplines = [
  { id: 'dev_rule_1', level: '🔺', text: 'VIX 法则:\n当 VIX 达到 30 时买入股票\n当 VIX 达到 50 时加倍买入股票', date: '2026-06-05', pinned: true },
  { id: 'dev_rule_2', level: '🔺', text: '只减融资, 不丢主线;只买错杀, 不追杂音。', date: '2026-04-25', pinned: false },
  { id: 'dev_rule_3', level: '🔺', text: 'TSM: 不卖\nNVDA: 高位减融资, 错杀买回\nMSFT: 底仓长期持有, 目标位释放部分现金\nMETA: 高弹性仓, 高位分批兑现', date: '2026-04-25', pinned: false },
  { id: 'dev_rule_4', level: '📣', text: '不是跌 3%、5% 就急着买回。要等恐慌有足够赔率。', date: '2026-04-25', pinned: false },
  { id: 'dev_rule_5', level: '📣', text: '相信凡事发生, 皆有利于我。', date: '2026-04-22', pinned: false },
  { id: 'dev_rule_6', level: '❗', text: '永远不做空美股! 逢低买入!', date: '2026-04-22', pinned: false },
  { id: 'dev_rule_7', level: '🟢', text: '每次交易前先写理由, 交易后复盘结果。', date: '2026-04-20', pinned: false },
  { id: 'dev_rule_8', level: '🟢', text: '涨的时候管住手, 跌的时候管住心。', date: '2026-04-18', pinned: false },
  { id: 'dev_rule_9', level: '🔺', text: '现金不是拖累, 是下一次进攻的选择权。', date: '2026-04-12', pinned: false },
  { id: 'dev_rule_10', level: '📣', text: '账户回撤超过预设阈值时, 先复盘杠杆和仓位, 再考虑加仓。', date: '2026-04-08', pinned: false },
];

const mockReviewLogs = [
  { id: 'dev_log_1', date: '2026-06-11', mood: '冷静', text: '承认普通人的投资组合长期来看是跑不赢指数 QQQ 的, 在目前所持仓的情况下, 只能靠股市迈 Beta 收益。所以核心策略是: 保住本金, 控制回撤, 慢慢积累。' },
  { id: 'dev_log_2', date: '2026-06-05', mood: '冷静', text: '周五 159941 建仓后, 纳斯达克大跌 4.80% 历史罕见, 也给下周创造了场内低吸的机会。接下来重点关注市场情绪能否修复。' },
  { id: 'dev_log_3', date: '2026-06-05', mood: '谨慎乐观', text: '159941 开始正式建仓, 让豆豆卖掉了支付宝的纳斯达克, 卖出理由是收益率更低, 资金效率不如场内 ETF。后续计划分批加仓, 拉低持仓成本。' },
  { id: 'dev_log_4', date: '2026-05-06', mood: '冷静', text: '一年三倍喜欢, 二年一倍若辱。在股市里的意思是: 短期暴富的人很多, 长期稳定盈利的人很少。要有耐心, 避免频繁交易和情绪化操作。' },
  { id: 'dev_log_5', date: '2026-04-30', mood: '满意', text: '今天 meta 大跌, 按照我以前性格融资早就干进去了, 现在我考虑的是更多的是风险控制和仓位管理。市场永远有机会, 活下来才有未来。' },
];

const mockMarketIntraday = {
  red: [44, 43.5, 42.8, 42.2, 41.4, 40.8, 39.6, 38.9, 39.4, 38.2, 37.9, 38.4, 39.8, 40.6],
  green: [36, 34.5, 32.8, 31.9, 30.7, 29.4, 28.8, 28.2, 27.9, 28.3, 29.6, 30.8, 30.9, 30.9],
  pink: [30, 31.4, 30.2, 31.7, 30.9, 30.1, 29.8, 30.4, 32.1, 31.2, 33.4, 34.8, 36.2, 39.1],
  btc: [34, 37.2, 36.5, 31.1, 27.2, 28.6, 29.5, 30.4, 31.2, 30.5, 31.8, 32.6, 33.4, 34.7],
};

const mockIndices = [
  { ticker: '.SPX', displaySymbol: '.SPX', name: '标普500', price: 7483.24, changePercent: 0, intraday: mockMarketIntraday.red },
  { ticker: '.NDX', displaySymbol: '.NDX', name: '纳斯达克100', price: 29329.21, changePercent: -1.61, intraday: mockMarketIntraday.green },
  { ticker: '.DJI', displaySymbol: '.DJI', name: '道琼斯', price: 52900.07, changePercent: 1.14, intraday: mockMarketIntraday.pink },
  { ticker: 'BTCUSD', displaySymbol: 'BTCUSD', name: 'BTC/USD', price: 62781.92, changePercent: 0.31, intraday: mockMarketIntraday.btc, realtime: true },
];
const mockMarketIndices = mockIndices.slice(0, 3);
const mockRestMarketIndices = mockMarketIndices.map(({ intraday, ...card }) => {
  const pct = Number(card.changePercent) || 0;
  const previousClose = Number(card.price) / (1 + pct / 100);
  return {
    ...card,
    source: 'EODHD',
    previousClose: Number.isFinite(previousClose) ? previousClose : card.price,
    intraday: [],
  };
});
const mockSampledMarketIndices = mockRestMarketIndices.map((card) => ({
  ...card,
  intraday: [card.previousClose, card.price],
}));
const mockBtcMarketCard = mockIndices[3];

function buildMockWatchlistDetailHistory() {
  const allRows = [];
  const start = new Date('2024-07-17T00:00:00Z');
  const visibleFrom = '2025-07-17';
  const end = new Date('2026-07-17T00:00:00Z');
  let tradingIndex = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    const close = 80 + tradingIndex * 0.24 + Math.sin(tradingIndex / 5.8) * 8 + Math.sin(tradingIndex / 17) * 6;
    allRows.push({ date: cursor.toISOString().slice(0, 10), close: Number(close.toFixed(4)) });
    tradingIndex += 1;
  }
  if (allRows.length > 1) allRows[allRows.length - 2].close = 207.39;
  if (allRows.length > 0) allRows[allRows.length - 1].close = 202.81;
  let rollingSum = 0;
  const rowsWithMa = allRows.map((row, index) => {
    rollingSum += row.close;
    if (index >= 200) rollingSum -= allRows[index - 200].close;
    return {
      ...row,
      ma200: index >= 199 ? Number((rollingSum / 200).toFixed(4)) : null,
    };
  });
  return rowsWithMa.filter((row) => row.date >= visibleFrom);
}

function buildMockWatchlistWeeklyHistory() {
  const rows = [];
  const start = new Date('2021-07-16T00:00:00Z');
  const end = new Date('2026-07-17T00:00:00Z');
  const totalWeeks = Math.round((end.getTime() - start.getTime()) / (7 * 86_400_000));
  for (let index = 0; index <= totalWeeks; index += 1) {
    const progress = index / totalWeeks;
    let trend;
    if (progress < 0.18) trend = 19 + (progress / 0.18) * 16;
    else if (progress < 0.36) trend = 35 - ((progress - 0.18) / 0.18) * 23;
    else if (progress < 0.55) trend = 12 + ((progress - 0.36) / 0.19) * 43;
    else if (progress < 0.72) trend = 55 + ((progress - 0.55) / 0.17) * 75;
    else if (progress < 0.86) trend = 130 + ((progress - 0.72) / 0.14) * 25;
    else trend = 155 + ((progress - 0.86) / 0.14) * 48;
    const volatility = (2.2 + progress * 7.5)
      * (Math.sin(index * 0.83) * 0.62 + Math.sin(index * 2.17) * 0.25 + Math.sin(index * 0.19) * 0.55);
    const close = Math.max(5, trend + volatility);
    const ma200 = 9.5 + 113.7 * (progress ** 1.75) + Math.sin(index / 22) * 1.2;
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index * 7);
    const dateKey = date.toISOString().slice(0, 10);
    rows.push({
      date: dateKey,
      weekEndDate: dateKey,
      close: Number(close.toFixed(4)),
      ma200: Number(ma200.toFixed(4)),
      completed: true,
    });
  }
  if (rows.length > 1) rows[rows.length - 2].close = 207.39;
  if (rows.length > 0) {
    rows[rows.length - 1].close = 202.81;
    rows[rows.length - 1].ma200 = 123.2;
  }
  return rows;
}

const mockWatchlistDetailHistory = buildMockWatchlistDetailHistory();
const mockWatchlistQqqHistory = mockWatchlistDetailHistory.map((row, index) => ({
  date: row.date,
  adjustedClose: Number((430 + index * 0.34 + Math.sin(index / 13) * 4.5).toFixed(4)),
}));

const mockWatchlistStockDetailData = {
  source: 'EODHD_EOD',
  priceBasis: 'adjusted_close',
  currency: 'USD',
  asOfDate: '2026-07-17',
  history: mockWatchlistDetailHistory,
  qqqHistory: mockWatchlistQqqHistory,
  weeklyHistory: buildMockWatchlistWeeklyHistory(),
  fundamentals: {
    symbol: 'NVDA',
    currency: 'USD',
    source: 'EODHD_FUNDAMENTALS',
    asOfDate: '2026-04-30',
    fetchedAt: '2026-07-20T00:00:00.000Z',
    marketCapitalization: 4_912_000_000_000,
    peTtm: 31.0582,
    peForward: 23.1481,
    revenueGrowthTtmPct: 70.683769,
    netMarginTtmPct: 62.965944,
    freeCashFlowMarginTtmPct: 46.974449,
  },
  indicators: {
    week52High: 235.88,
    ma200: mockWatchlistDetailHistory.at(-1)?.ma200 || 180.34,
    ema30: 209.58,
    volatility20AnnualizedPct: 23.4,
    ma200Weekly: 123.2,
    ma200WeeklyClose: 202.81,
    ma200WeeklyDistancePct: ((202.81 / 123.2) - 1) * 100,
    ma200WeeklyChange4WeekPct: 4.76,
    ma200WeeklySide: 'above',
    ma200WeeklyStreakWeeks: 86,
    ma200WeeklyAvailableWeeks: 520,
    ma200WeeklyRequiredWeeks: 200,
    ma200WeeklyAsOfDate: '2026-07-17',
    ma200WeeklyStatus: 'ready',
  },
};

const mockWatchlistStockDetailEarnings = [
  { symbol: 'NVDA', reportDate: '2026-08-28', fiscalDate: '2026-06-30', session: 'post', epsEstimate: 1.92 },
  { symbol: 'NVDA', reportDate: '2026-05-20', fiscalDate: '2026-03-31', session: 'post', epsActual: 1.87, marketReactionPercent: 7.32, earningsPublished: true },
];

const mockTqqqFundComposition = {
  success: true,
  schemaVersion: 1,
  kind: 'fund-composition',
  status: 'complete',
  symbol: 'TQQQ',
  fundName: 'ProShares UltraPro QQQ',
  fundType: 'leveraged-etf',
  leverageTarget: 3,
  source: { provider: 'ProShares', official: true },
  sections: {
    topHoldings: {
      status: 'complete',
      basis: 'benchmark-index',
      asOfDate: '2026-07-22',
      items: [
        ['NVIDIA', 8.9], ['Microsoft', 8.1], ['Apple', 7.4], ['Amazon', 5.7],
        ['Alphabet A', 3.9], ['Broadcom', 3.4], ['Meta Platforms', 3.2],
        ['Alphabet C', 3.1], ['Tesla', 2.8], ['Costco', 2.4],
      ].map(([name, weightPercent], index) => ({ rank: index + 1, name, weightPercent })),
    },
    sectors: {
      status: 'complete',
      basis: 'benchmark-index',
      asOfDate: '2026-07-22',
      items: [
        { name: 'Technology', weightPercent: 51.2 },
        { name: 'Consumer Discretionary', weightPercent: 13.1 },
        { name: 'Health Care', weightPercent: 6.4 },
        { name: 'Industrials', weightPercent: 5.8 },
        { name: 'Telecommunications', weightPercent: 5.5 },
      ],
    },
  },
};

const mockHomeWatchlist = [
  { symbol: 'NVDA', name: 'NVIDIA', price: 184.08, changePercent: 1.92, high: 195.95, ytdChangePercent: 32.4, intraday: mockMarketIntraday.pink },
  { symbol: 'MSFT', name: '微软', price: 496.42, changePercent: 0.74, high: 505.21, ytdChangePercent: 18.1, intraday: mockMarketIntraday.red },
  { symbol: 'AAPL', name: '苹果', price: 213.55, changePercent: -0.46, high: 237.49, ytdChangePercent: -4.8, intraday: mockMarketIntraday.green },
  { symbol: 'TSLA', name: '特斯拉', price: 323.63, changePercent: 2.12, high: 488.54, ytdChangePercent: -19.2, intraday: mockMarketIntraday.pink },
];

const mockHomeSignalBenchmarks = [
  { symbol: 'META', name: 'Meta', company: 'Meta', price: 92.7, week52High: 100 },
  { symbol: 'AMZN', name: '亚马逊', company: 'Amazon', price: 94.2, week52High: 100 },
  { symbol: 'NVDA', name: '英伟达', company: 'NVIDIA', price: 97.6, week52High: 100 },
  { symbol: 'TSM', name: '台积电', company: 'Taiwan Semiconductor', price: 98.3, week52High: 100 },
  { symbol: 'QQQ', name: '纳斯达克100 ETF', company: 'Invesco QQQ', price: 98.8, week52High: 100 },
  { symbol: 'GOOGL', name: '谷歌A', company: 'Alphabet', price: 98.9, week52High: 100 },
  { symbol: 'AAPL', name: '苹果', company: 'Apple', price: 99.7, week52High: 100 },
  { symbol: 'MSFT', name: '微软', company: 'Microsoft', price: 99.2, week52High: 100 },
];

const devMarketMoversFixture = {
  success: true,
  source: 'dev-visual-preview',
  dataDate: '2026-07-10',
  fetchedAt: '2026-07-11T01:00:00.000Z',
  gainers: [
    { symbol: 'PLTR', name: 'Palantir', company: 'Palantir Technologies Inc', price: 142.37, changePercent: 12.84, changeAmount: 16.20, exchange: 'NYSE', currency: 'USD', volume: 82741120, marketCap: 338000000000, dataDate: '2026-07-10' },
    { symbol: 'HOOD', name: 'Robinhood', company: 'Robinhood Markets Inc', price: 108.66, changePercent: 10.73, changeAmount: 10.53, exchange: 'NASDAQ', currency: 'USD', volume: 48290100, marketCap: 96000000000, dataDate: '2026-07-10' },
    { symbol: 'COIN', name: 'Coinbase', company: 'Coinbase Global Inc', price: 394.91, changePercent: 8.45, changeAmount: 30.77, exchange: 'NASDAQ', currency: 'USD', volume: 22199400, marketCap: 101000000000, dataDate: '2026-07-10' },
    { symbol: 'MU', name: 'Micron', company: 'Micron Technology Inc', price: 132.14, changePercent: 7.18, changeAmount: 8.85, exchange: 'NASDAQ', currency: 'USD', volume: 34700600, marketCap: 148000000000, dataDate: '2026-07-10' },
    { symbol: 'AVGO', name: 'Broadcom', company: 'Broadcom Inc', price: 286.44, changePercent: 5.72, changeAmount: 15.50, exchange: 'NASDAQ', currency: 'USD', volume: 23610400, marketCap: 1340000000000, dataDate: '2026-07-10' },
    { symbol: 'ORCL', name: 'Oracle', company: 'Oracle Corp', price: 241.08, changePercent: 4.96, changeAmount: 11.39, exchange: 'NYSE', currency: 'USD', volume: 18402000, marketCap: 675000000000, dataDate: '2026-07-10' },
  ],
  losers: [
    { symbol: 'SNOW', name: 'Snowflake', company: 'Snowflake Inc', price: 196.42, changePercent: -9.84, changeAmount: -21.44, exchange: 'NYSE', currency: 'USD', volume: 14910200, marketCap: 66000000000, dataDate: '2026-07-10' },
    { symbol: 'MDB', name: 'MongoDB', company: 'MongoDB Inc', price: 221.36, changePercent: -8.31, changeAmount: -20.05, exchange: 'NASDAQ', currency: 'USD', volume: 5012400, marketCap: 18000000000, dataDate: '2026-07-10' },
    { symbol: 'CRWD', name: 'CrowdStrike', company: 'CrowdStrike Holdings Inc', price: 463.19, changePercent: -7.26, changeAmount: -36.27, exchange: 'NASDAQ', currency: 'USD', volume: 8320400, marketCap: 115000000000, dataDate: '2026-07-10' },
    { symbol: 'LULU', name: 'Lululemon', company: 'Lululemon Athletica Inc', price: 274.83, changePercent: -6.72, changeAmount: -19.80, exchange: 'NASDAQ', currency: 'USD', volume: 4580100, marketCap: 33000000000, dataDate: '2026-07-10' },
    { symbol: 'NKE', name: 'Nike', company: 'NIKE Inc', price: 71.54, changePercent: -5.47, changeAmount: -4.14, exchange: 'NYSE', currency: 'USD', volume: 29200400, marketCap: 106000000000, dataDate: '2026-07-10' },
    { symbol: 'UPS', name: 'UPS', company: 'United Parcel Service Inc', price: 97.26, changePercent: -4.31, changeAmount: -4.38, exchange: 'NYSE', currency: 'USD', volume: 6290100, marketCap: 83000000000, dataDate: '2026-07-10' },
  ],
};

const mockEarningsCalendarEvents = [
  { symbol: 'TSM', name: 'TSMC', reportDate: '2026-04-15', fiscalDate: '2026-03-31', session: 'pre', epsEstimate: 3.22, epsActual: 3.49, surprisePercent: 8.3851, epsPreviousYear: 2.12, epsActualYoyPercent: 64.6226, epsEstimateYoyPercent: 58.63, revenueEstimate: 1122225819900, revenueEstimateUsd: 34877729360, revenueActual: 1134100000000, revenueActualUsd: 35246861014, revenuePreviousYear: 838900000000, revenuePreviousYearUsd: 26083500000, revenueEstimateYoyPercent: 33.72, revenueActualYoyPercent: 35.1323, revenueSurprisePercent: 1.0584, marketReactionPercent: -3.1325, currency: 'TWD', impact: 'high' },
  { symbol: 'MSFT', name: 'Microsoft', reportDate: '2026-04-29', fiscalDate: '2026-03-31', session: 'post', epsEstimate: 4.09, epsActual: 4.27, surprisePercent: 4.401, epsPreviousYear: 3.46, epsActualYoyPercent: 23.4104, epsEstimateYoyPercent: 17.29, revenueEstimate: 81426143480, revenueEstimateUsd: 81426143480, revenueActual: 82886000000, revenueActualUsd: 82886000000, revenuePreviousYear: 70066000000, revenuePreviousYearUsd: 70066000000, revenueEstimateYoyPercent: 16.21, revenueActualYoyPercent: 18.297, revenueSurprisePercent: 1.7929, marketReactionPercent: -3.9297, currency: 'USD', impact: 'medium' },
  { symbol: 'META', name: 'Meta', reportDate: '2026-04-29', fiscalDate: '2026-03-31', session: 'post', epsEstimate: 6.82, epsActual: 7.31, surprisePercent: 7.1848, epsPreviousYear: 6.43, epsActualYoyPercent: 13.6858, epsEstimateYoyPercent: 3.56, revenueEstimate: 55545185380, revenueEstimateUsd: 55545185380, revenueActual: 56311000000, revenueActualUsd: 56311000000, revenuePreviousYear: 42315000000, revenuePreviousYearUsd: 42315000000, revenueEstimateYoyPercent: 31.27, revenueActualYoyPercent: 33.0789, revenueSurprisePercent: 1.3787, marketReactionPercent: -8.55, currency: 'USD', impact: 'medium' },
  { symbol: 'GOOGL', name: 'Alphabet', reportDate: '2026-04-29', fiscalDate: '2026-03-31', session: 'post', epsEstimate: 2.53, epsActual: 5.11, surprisePercent: 101.9763, epsPreviousYear: 2.81, epsActualYoyPercent: 81.8505, epsEstimateYoyPercent: -4.96, revenueEstimate: 107033502190, revenueEstimateUsd: 107033502190, revenueActual: 109896000000, revenueActualUsd: 109896000000, revenuePreviousYear: 90234000000, revenuePreviousYearUsd: 90234000000, revenueEstimateYoyPercent: 18.62, revenueActualYoyPercent: 21.79, revenueSurprisePercent: 2.6744, marketReactionPercent: 9.9617, currency: 'USD', impact: 'normal' },
  { symbol: 'NVDA', name: 'NVIDIA', reportDate: '2026-05-20', fiscalDate: '2026-04-30', session: 'post', epsEstimate: 1.77, epsActual: 1.87, surprisePercent: 5.6497, epsPreviousYear: 0.81, epsActualYoyPercent: 130.8642, epsEstimateYoyPercent: 118.98, revenueEstimate: 79115709670, revenueEstimateUsd: 79115709670, revenueActual: 81615000000, revenueActualUsd: 81615000000, revenuePreviousYear: 44062000000, revenuePreviousYearUsd: 44062000000, revenueEstimateYoyPercent: 79.5554, revenueActualYoyPercent: 85.2276, revenueSurprisePercent: 3.159, marketReactionPercent: -1.772, currency: 'USD', impact: 'high' },
  { symbol: 'NVDA', name: 'NVIDIA', reportDate: '2026-07-08', fiscalDate: '2026-04-30', session: 'after', epsEstimate: 1.77, epsActual: 1.87, surprisePercent: 5.6497, epsPreviousYear: 0.81, epsActualYoyPercent: 130.8642, epsEstimateYoyPercent: 118.98, revenueEstimate: 79115709670, revenueEstimateUsd: 79115709670, revenueActual: 81615000000, revenueActualUsd: 81615000000, revenuePreviousYear: 44062000000, revenuePreviousYearUsd: 44062000000, revenueEstimateYoyPercent: 79.5554, revenueActualYoyPercent: 85.2276, revenueSurprisePercent: 3.158, marketReactionPercent: -1.772, currency: 'USD', impact: 'high' },
  { symbol: 'MSFT', name: 'Microsoft', reportDate: '2026-07-09', session: 'after', epsEstimate: 2.93, epsActual: 2.71, surprisePercent: -7.5, revenueEstimate: 64500000000, revenueEstimateUsd: 64500000000, revenueActual: 62800000000, revenueActualUsd: 62800000000, revenueSurprisePercent: -2.6, marketReactionPercent: -4.2, currency: 'USD', impact: 'medium' },
  { symbol: 'META', name: 'Meta', reportDate: '2026-07-09', session: 'after', epsEstimate: 4.71, epsActual: 4.92, surprisePercent: 4.5, revenueEstimate: 39100000000, revenueEstimateUsd: 39100000000, revenueActual: 38400000000, revenueActualUsd: 38400000000, revenueSurprisePercent: -1.8, marketReactionPercent: -1.2, currency: 'USD', impact: 'medium' },
  { symbol: 'TSM', name: 'TSMC', reportDate: '2026-07-10', session: 'before', epsEstimate: 1.45, revenueEstimate: 20300000000, revenueEstimateUsd: 20300000000, currency: 'USD', impact: 'high' },
  { symbol: 'GOOGL', name: 'Alphabet', reportDate: '2026-07-11', session: 'after', epsEstimate: 2.18, revenueEstimate: 96400000000, revenueEstimateUsd: 96400000000, currency: 'USD', impact: 'normal' },
];

const mockEarningsDetailEvent = {
  symbol: 'GOOGL',
  name: 'Alphabet',
  reportDate: '2026-07-22',
  fiscalDate: '2026-06-30',
  session: 'post',
  earningsPublished: true,
  earningsResult: 'beat',
  currency: 'USD',
  epsCurrency: 'USD',
  epsEstimate: 2.90,
  epsActual: 9.11,
  epsPreviousYear: 2.31,
  epsActualYoyPercent: 294.3723,
  epsEstimateYoyPercent: 25.5411,
  revenueEstimateUsd: 116_910_000_000,
  revenueActualUsd: 119_796_000_000,
  revenuePreviousYearUsd: 96_428_000_000,
  revenueActualYoyPercent: 24.2336,
  revenueEstimateYoyPercent: 21.2407,
  ebitActualUsd: 40_770_000_000,
  ebitPreviousYearUsd: 31_266_000_000,
  ebitActualYoyPercent: 30.3972,
  ebitActualBasis: 'OperatingIncomeLoss',
  secForm: '10-Q',
};

const mockEarningsDetailData = {
  success: true,
  schemaVersion: 1,
  status: 'complete',
  symbol: 'GOOGL',
  currency: 'USD',
  period: {
    start: '2026-04-01',
    end: '2026-06-30',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
  },
  source: {
    provider: 'SEC',
    cik: '0001652044',
    accession: '0001652044-26-000071',
    form: '10-Q',
    filedAt: '2026-07-23',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/goog-20260630.htm',
    primaryDocumentUrl: 'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/goog-20260630.htm',
  },
  sections: {
    reportSegments: {
      status: 'complete',
      reason: null,
      items: [
        { id: 'google-services', label: 'Google Services', labelZh: '谷歌服务', revenue: 94_540_000_000, previousRevenue: 82_543_000_000, profitMetric: 'operatingIncome', profit: 39_544_000_000, previousProfit: 33_063_000_000 },
        { id: 'google-cloud', label: 'Google Cloud', labelZh: '谷歌云', revenue: 24_768_000_000, previousRevenue: 13_624_000_000, profitMetric: 'operatingIncome', profit: 8_814_000_000, previousProfit: 2_826_000_000 },
        { id: 'other-bets', label: 'Other Bets', labelZh: '其他业务', revenue: 382_000_000, previousRevenue: 373_000_000, profitMetric: 'operatingIncome', profit: -1_799_000_000, previousProfit: -1_246_000_000 },
      ],
      reconciliation: { id: 'hedging', label: 'Hedging gains (losses)', labelZh: '对冲收益（损失）', revenue: 106_000_000, previousRevenue: -112_000_000 },
    },
    revenueBreakdown: {
      status: 'complete',
      reason: null,
      items: [
        { id: 'search', label: 'Google Search & other', labelZh: '搜索及其他', revenue: 63_271_000_000, previousRevenue: 54_190_000_000, parentId: 'google-services' },
        { id: 'cloud', label: 'Google Cloud', labelZh: '谷歌云', revenue: 24_768_000_000, previousRevenue: 13_624_000_000, parentId: 'google-cloud' },
        { id: 'subscriptions', label: 'Subscriptions, platforms & devices', labelZh: '订阅、平台和设备', revenue: 12_911_000_000, previousRevenue: 11_203_000_000, parentId: 'google-services' },
        { id: 'youtube', label: 'YouTube ads', labelZh: 'YouTube 广告', revenue: 11_055_000_000, previousRevenue: 9_796_000_000, parentId: 'google-services' },
        { id: 'network', label: 'Google Network', labelZh: '谷歌网络', revenue: 7_303_000_000, previousRevenue: 7_354_000_000, parentId: 'google-services' },
        { id: 'other-bets', label: 'Other Bets', labelZh: '其他业务', revenue: 382_000_000, previousRevenue: 373_000_000, parentId: 'other-bets' },
      ],
    },
    geographies: {
      status: 'complete',
      reason: null,
      items: [
        { id: 'us', label: 'United States', labelZh: '美国', revenue: 60_846_000_000, previousRevenue: 46_063_000_000 },
        { id: 'emea', label: 'EMEA', labelZh: '欧洲、中东和非洲', revenue: 32_501_000_000, previousRevenue: 28_262_000_000 },
        { id: 'apac', label: 'APAC', labelZh: '亚太地区', revenue: 19_317_000_000, previousRevenue: 16_480_000_000 },
        { id: 'other-americas', label: 'Other Americas', labelZh: '其他美洲', revenue: 7_026_000_000, previousRevenue: 5_735_000_000 },
      ],
    },
  },
};

const mockTsmEarningsDetailEvent = {
  symbol: 'TSM',
  name: '台积电',
  reportDate: '2026-07-16',
  fiscalDate: '2026-06-30',
  session: 'pre',
  earningsPublished: true,
  earningsResult: 'beat',
  currency: 'USD',
  epsCurrency: 'TWD',
  epsEstimate: 3.89,
  epsActual: 4.31,
  epsPreviousYear: 2.47,
  epsActualYoyPercent: 74.5,
  epsEstimateYoyPercent: 57.4,
  revenueEstimateUsd: 39_160_000_000,
  revenueActualUsd: 40_200_000_000,
  revenuePreviousYearUsd: 30_070_000_000,
  revenueActualYoyPercent: 33.7,
  revenueEstimateYoyPercent: 35.4,
  ebitActualUsd: 24_240_600_000,
  ebitPreviousYearUsd: 14_914_720_000,
  ebitActualYoyPercent: 62.5,
  ebitActualBasis: 'OperatingIncomeLoss',
  secForm: '6-K',
};

const tsmShareItems = (definitions) => definitions.map(([id, label, labelZh, current, previous]) => ({
  id,
  label,
  labelZh,
  revenue: Math.round(40_200_000_000 * current / 100),
  previousRevenue: Math.round(30_070_000_000 * previous / 100),
}));

const mockTsmEarningsDetailData = {
  success: true,
  schemaVersion: 1,
  status: 'complete',
  symbol: 'TSM',
  currency: 'USD',
  period: {
    start: '2026-04-01',
    end: '2026-06-30',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
  },
  source: {
    provider: 'TSMC',
    cik: '0001046179',
    accession: '0001046179-26-000451',
    form: '6-K',
    filedAt: '2026-07-16',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1046179/000104617926000451/0001046179-26-000451-index.html',
    primaryDocumentUrl: 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/6f49632674bd2d0fd48cb65aaf89ec6ab510b559/2Q26%20ManagementReport.pdf',
  },
  sections: {
    reportSegments: {
      status: 'complete',
      items: [{
        id: 'dedicated-ic-foundry',
        label: 'Dedicated IC Foundry',
        labelZh: '晶圆代工',
        revenue: 40_200_000_000,
        previousRevenue: 30_070_000_000,
        profitMetric: 'operatingIncome',
        profit: 24_240_600_000,
        previousProfit: 14_914_720_000,
      }],
    },
    revenueBreakdown: {
      status: 'complete',
      items: tsmShareItems([
        ['hpc', 'High Performance Computing', '高性能计算', 66, 60],
        ['smartphone', 'Smartphone', '智能手机', 22, 27],
        ['iot', 'Internet of Things', '物联网', 5, 5],
        ['automotive', 'Automotive', '汽车电子', 4, 5],
        ['dce', 'Digital Consumer Electronics', '数字消费电子', 1, 1],
        ['others', 'Others', '其他平台', 2, 2],
      ]),
    },
    geographies: {
      status: 'complete',
      items: tsmShareItems([
        ['north-america', 'North America', '北美', 78, 75],
        ['asia-pacific', 'Asia Pacific', '亚太地区', 8, 9],
        ['china', 'China', '中国', 6, 9],
        ['japan', 'Japan', '日本', 4, 4],
        ['emea', 'EMEA', '欧洲、中东和非洲', 4, 3],
      ]),
    },
  },
  supplemental: {
    technologyBreakdown: {
      status: 'complete',
      items: tsmShareItems([
        ['2nm', '2nm', '2 纳米', 3, 0],
        ['3nm', '3nm', '3 纳米', 30, 24],
        ['5nm', '5nm', '5 纳米', 33, 36],
        ['7nm', '7nm', '7 纳米', 11, 14],
        ['16-20nm', '16/20nm', '16/20 纳米', 6, 7],
        ['28nm', '28nm', '28 纳米', 6, 7],
        ['40-45nm', '40/45nm', '40/45 纳米', 2, 3],
        ['65nm', '65nm', '65 纳米', 4, 3],
        ['90nm-0.13um', '90nm-0.13um', '90 纳米至 0.13 微米', 2, 3],
        ['0.15um-and-above', '≥0.15um', '0.15 微米及以上', 3, 3],
      ]),
    },
  },
};

const mockEarningsBaseDetailEvent = {
  symbol: 'NVDA',
  name: 'NVIDIA',
  reportDate: '2026-05-20',
  fiscalDate: '2026-04-30',
  session: 'post',
  earningsPublished: true,
  earningsResult: 'beat',
  currency: 'USD',
  epsCurrency: 'USD',
  epsEstimate: 1.77,
  epsActual: 1.87,
  epsPreviousYear: 0.81,
  epsActualYoyPercent: 130.8642,
  epsEstimateYoyPercent: 118.98,
  revenueEstimateUsd: 79_115_709_670,
  revenueActualUsd: 81_615_000_000,
  revenuePreviousYearUsd: 44_062_000_000,
  revenueActualYoyPercent: 85.2276,
  revenueEstimateYoyPercent: 79.5554,
  ebitActualUsd: 47_010_000_000,
  ebitPreviousYearUsd: 28_410_000_000,
  ebitActualYoyPercent: 65.4700,
  ebitActualBasis: 'OperatingIncomeLoss',
};

const mockEarningsBaseDetailData = {
  success: true,
  schemaVersion: 1,
  status: 'complete',
  symbol: 'NVDA',
  currency: 'USD',
  period: {
    start: '2026-01-26',
    end: '2026-04-26',
    fiscalDate: '2026-04-30',
    reportDate: '2026-05-20',
  },
  source: {
    provider: 'SEC',
    cik: '0001045810',
    accession: '0001045810-26-000052',
    form: '10-Q',
    filedAt: '2026-05-20',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000052/0001045810-26-000052-index.html',
    primaryDocumentUrl: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000052/nvda-20260426.htm',
  },
  sections: {
    reportSegments: {
      status: 'complete',
      reason: null,
      items: [
        {
          id: 'compute-networking',
          label: 'Compute & Networking',
          labelZh: '计算与网络',
          revenue: 74_550_000_000,
          previousRevenue: 39_589_000_000,
          profitMetric: 'operatingIncome',
          profit: 53_335_000_000,
          previousProfit: 22_054_000_000,
        },
        {
          id: 'graphics',
          label: 'Graphics',
          labelZh: '图形业务',
          revenue: 7_065_000_000,
          previousRevenue: 4_473_000_000,
          profitMetric: 'operatingIncome',
          profit: 2_941_000_000,
          previousProfit: 1_640_000_000,
        },
      ],
    },
    revenueBreakdown: {
      status: 'complete',
      reason: null,
      items: [
        {
          id: 'hyperscale',
          label: 'Hyperscale',
          labelZh: '超大规模',
          revenue: 37_869_000_000,
          previousRevenue: 17_599_000_000,
        },
        {
          id: 'acie',
          label: 'AI Clouds, Industrial, & Enterprise',
          labelZh: 'AI 云、工业与企业',
          revenue: 37_377_000_000,
          previousRevenue: 21_513_000_000,
        },
        {
          id: 'edge-computing',
          label: 'Edge Computing',
          labelZh: '边缘计算',
          revenue: 6_369_000_000,
          previousRevenue: 4_950_000_000,
        },
      ],
    },
    geographies: {
      status: 'complete',
      reason: null,
      items: [
        {
          id: 'united-states',
          label: 'United States',
          labelZh: '美国',
          revenue: 63_769_000_000,
          previousRevenue: 25_685_000_000,
        },
        {
          id: 'taiwan',
          label: 'Taiwan',
          labelZh: '中国台湾',
          revenue: 12_006_000_000,
          previousRevenue: 7_648_000_000,
        },
        {
          id: 'china-including-hong-kong',
          label: 'China (including Hong Kong)',
          labelZh: '中国（含香港）',
          revenue: 4_550_000_000,
          previousRevenue: 9_659_000_000,
        },
        {
          id: 'other',
          label: 'Other',
          labelZh: '其他地区',
          revenue: 1_290_000_000,
          previousRevenue: 1_070_000_000,
        },
      ],
    },
  },
};

const mockPnlPortfolioSnapshots = [
  {
    snapshotDate: '2026-01-02',
    cumulativePnlUsd: 18500,
    cumulativePnlPct: 0.0060,
    totalAssetsUsd: 3068500,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: 18500,
    dailyPnlPct: 0.0060,
    updatedAt: '2026-01-02T21:00:00Z',
  },
  {
    snapshotDate: '2026-02-03',
    cumulativePnlUsd: 42600,
    cumulativePnlPct: 0.0139,
    totalAssetsUsd: 3092600,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: 12800,
    dailyPnlPct: 0.0042,
    updatedAt: '2026-02-03T21:00:00Z',
  },
  {
    snapshotDate: '2026-03-11',
    cumulativePnlUsd: 88400,
    cumulativePnlPct: 0.0287,
    totalAssetsUsd: 3138400,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: -6200,
    dailyPnlPct: -0.0020,
    updatedAt: '2026-03-11T21:00:00Z',
  },
  {
    snapshotDate: '2026-04-21',
    cumulativePnlUsd: 194000,
    cumulativePnlPct: 0.0673,
    totalAssetsUsd: 3244000,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: 31200,
    dailyPnlPct: 0.0102,
    updatedAt: '2026-04-21T21:00:00Z',
  },
  {
    snapshotDate: '2026-04-22',
    cumulativePnlUsd: 262471.75,
    cumulativePnlPct: 0.0909,
    totalAssetsUsd: 3312471.75,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: 68100,
    dailyPnlPct: 0.0236,
    updatedAt: '2026-04-22T21:00:00Z',
  },
  {
    snapshotDate: '2026-05-12',
    cumulativePnlUsd: 218300,
    cumulativePnlPct: 0.0752,
    totalAssetsUsd: 3268300,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: -24100,
    dailyPnlPct: -0.0074,
    updatedAt: '2026-05-12T21:00:00Z',
  },
  {
    snapshotDate: '2026-06-04',
    cumulativePnlUsd: 171700,
    cumulativePnlPct: 0.0594,
    totalAssetsUsd: 3221700,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: -18900,
    dailyPnlPct: -0.0058,
    updatedAt: '2026-06-04T21:00:00Z',
  },
  {
    snapshotDate: '2026-07-08',
    cumulativePnlUsd: 199938.7,
    cumulativePnlPct: 0.0657,
    totalAssetsUsd: 3249938.7,
    totalBuyCostUsd: 2850000,
    sellProceedsUsd: 420000,
    dailyPnlUsd: 14600,
    dailyPnlPct: 0.0045,
    updatedAt: '2026-07-08T21:00:00Z',
  },
];

const mockPnlBenchmarkRows = [
  { date: '2026-01-02', close: 462.00, rawClose: 462.00 },
  { date: '2026-02-03', close: 472.40, rawClose: 472.40 },
  { date: '2026-03-11', close: 486.80, rawClose: 486.80 },
  { date: '2026-04-06', close: 500.00, rawClose: 500.00 },
  { date: '2026-04-20', close: 504.50, rawClose: 504.50 },
  { date: '2026-05-06', close: 518.20, rawClose: 518.20 },
  { date: '2026-05-20', close: 526.80, rawClose: 526.80 },
  { date: '2026-06-04', close: 535.60, rawClose: 535.60 },
  { date: '2026-06-18', close: 542.10, rawClose: 542.10 },
  { date: '2026-06-30', close: 548.40, rawClose: 548.40 },
  { date: '2026-07-01', close: 550.60, rawClose: 550.60 },
  { date: '2026-07-02', close: 552.10, rawClose: 552.10 },
  { date: '2026-07-03', close: 551.20, rawClose: 551.20 },
  { date: '2026-07-06', close: 557.40, rawClose: 557.40 },
  { date: '2026-07-07', close: 560.80, rawClose: 560.80 },
  { date: '2026-07-08', close: 565.50, rawClose: 565.50 },
];

// DevVisualPreview stays fully local, but keeps the two market-data channels
// separate so the stock comparison exercises the same raw/raw contract as the
// production page. `close` intentionally differs on a few rows: the comparison
// must consume `rawClose`, never the adjusted-compatible display value.
const mockStockComparisonNvdaRawRows = [
  { date: '2026-04-05', close: 120.00, rawClose: 120.12, adjustedClose: 120.00 },
  { date: '2026-04-20', close: 119.20, rawClose: 119.35, adjustedClose: 119.20 },
  { date: '2026-05-06', close: 132.60, rawClose: 132.82, adjustedClose: 132.60 },
  { date: '2026-05-20', close: 151.30, rawClose: 151.51, adjustedClose: 151.30 },
  { date: '2026-06-04', close: 168.20, rawClose: 168.44, adjustedClose: 168.20 },
  { date: '2026-06-18', close: 148.40, rawClose: 148.61, adjustedClose: 148.40 },
  { date: '2026-06-30', close: 171.80, rawClose: 172.03, adjustedClose: 171.80 },
  { date: '2026-07-01', close: 176.40, rawClose: 176.63, adjustedClose: 176.40 },
  { date: '2026-07-02', close: 180.60, rawClose: 180.84, adjustedClose: 180.60 },
  { date: '2026-07-03', close: 184.20, rawClose: 184.43, adjustedClose: 184.20 },
  { date: '2026-07-06', close: 188.10, rawClose: 188.34, adjustedClose: 188.10 },
  { date: '2026-07-07', close: 192.30, rawClose: 192.55, adjustedClose: 192.30 },
  { date: '2026-07-08', close: 196.50, rawClose: 196.73, adjustedClose: 196.50 },
];

const mockPnlSymbolSnapshots = [
  { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 48000, dailyPnlUsd: 2100 },
  { symbol: 'MSFT', name: '微软', cumulativePnlUsd: 31400, dailyPnlUsd: -900 },
  { symbol: 'AAPL', name: '苹果', cumulativePnlUsd: -4200, dailyPnlUsd: -350 },
];

const mockPnlStockTrades = [
  { id: 'dev_trade_1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-04-05', date: '2026-04-05', price: 120, shares: 100 },
  { id: 'dev_trade_2', symbol: 'NVDA', name: 'NVIDIA', side: 'sell', trade_date: '2026-07-02', date: '2026-07-02', price: 190, shares: 20 },
  { id: 'dev_trade_3', symbol: 'MSFT', name: '微软', side: 'buy', trade_date: '2026-04-10', date: '2026-04-10', price: 410, shares: 80 },
  { id: 'dev_trade_4', symbol: 'AAPL', name: '苹果', side: 'buy', trade_date: '2026-05-01', date: '2026-05-01', price: 220, shares: 60 },
];

const mockStockComparisonCostFlowTrades = [
  { id: 'dev_cost_flow_1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-06-01', date: '2026-06-01', price: 100, shares: 10 },
  { id: 'dev_cost_flow_2', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-06-10', date: '2026-06-10', price: 120, shares: 10 },
  { id: 'dev_cost_flow_3', symbol: 'NVDA', name: 'NVIDIA', side: 'sell', trade_date: '2026-06-19', date: '2026-06-19', price: 150, shares: 5 },
];

const mockStockComparisonCostFlowSnapshots = [
  { snapshotDate: '2026-07-08', symbol: 'NVDA', name: 'NVIDIA', heldShares: 15, avgCostUsd: 110, currentPriceUsd: 150, marketValueUsd: 2250, realizedPnlUsd: 200, unrealizedPnlUsd: 600, cumulativePnlUsd: 800, totalBuyCostUsd: 2200, remainingCostUsd: 1650 },
  { snapshotDate: '2026-06-30', symbol: 'NVDA', name: 'NVIDIA', heldShares: 15, avgCostUsd: 110, currentPriceUsd: 145, marketValueUsd: 2175, realizedPnlUsd: 200, unrealizedPnlUsd: 525, cumulativePnlUsd: 725, totalBuyCostUsd: 2200, remainingCostUsd: 1650 },
  { snapshotDate: '2026-06-19', symbol: 'NVDA', name: 'NVIDIA', heldShares: 15, avgCostUsd: 110, currentPriceUsd: 140, marketValueUsd: 2100, realizedPnlUsd: 200, unrealizedPnlUsd: 450, cumulativePnlUsd: 650, totalBuyCostUsd: 2200, remainingCostUsd: 1650 },
  { snapshotDate: '2026-06-15', symbol: 'NVDA', name: 'NVIDIA', heldShares: 20, avgCostUsd: 110, currentPriceUsd: 130, marketValueUsd: 2600, realizedPnlUsd: 0, unrealizedPnlUsd: 400, cumulativePnlUsd: 400, totalBuyCostUsd: 2200, remainingCostUsd: 2200 },
  { snapshotDate: '2026-06-10', symbol: 'NVDA', name: 'NVIDIA', heldShares: 20, avgCostUsd: 110, currentPriceUsd: 122, marketValueUsd: 2440, realizedPnlUsd: 0, unrealizedPnlUsd: 240, cumulativePnlUsd: 240, totalBuyCostUsd: 2200, remainingCostUsd: 2200 },
  { snapshotDate: '2026-06-05', symbol: 'NVDA', name: 'NVIDIA', heldShares: 10, avgCostUsd: 100, currentPriceUsd: 108, marketValueUsd: 1080, realizedPnlUsd: 0, unrealizedPnlUsd: 80, cumulativePnlUsd: 80, totalBuyCostUsd: 1000, remainingCostUsd: 1000 },
  { snapshotDate: '2026-06-01', symbol: 'NVDA', name: 'NVIDIA', heldShares: 10, avgCostUsd: 100, currentPriceUsd: 102, marketValueUsd: 1020, realizedPnlUsd: 0, unrealizedPnlUsd: 20, cumulativePnlUsd: 20, totalBuyCostUsd: 1000, remainingCostUsd: 1000 },
];

const mockStockComparisonCostFlowQqqRows = [
  { date: '2026-01-02', close: 460, rawClose: 460 },
  { date: '2026-06-01', close: 500, rawClose: 500 },
  { date: '2026-06-05', close: 510, rawClose: 510 },
  { date: '2026-06-10', close: 520, rawClose: 520 },
  { date: '2026-06-15', close: 530, rawClose: 530 },
  { date: '2026-06-19', close: 540, rawClose: 540 },
  { date: '2026-06-30', close: 550, rawClose: 550 },
  { date: '2026-07-08', close: 560, rawClose: 560 },
];

const mockStockComparisonCostFlowNvdaRawRows = [
  { date: '2026-06-01', close: 102, rawClose: 101.75, adjustedClose: 102 },
  { date: '2026-06-05', close: 108, rawClose: 107.72, adjustedClose: 108 },
  { date: '2026-06-10', close: 122, rawClose: 121.66, adjustedClose: 122 },
  { date: '2026-06-15', close: 130, rawClose: 129.63, adjustedClose: 130 },
  { date: '2026-06-19', close: 140, rawClose: 139.59, adjustedClose: 140 },
  { date: '2026-06-30', close: 145, rawClose: 144.57, adjustedClose: 145 },
  { date: '2026-07-08', close: 150, rawClose: 149.55, adjustedClose: 150 },
];

const mockTodayStockTrade = {
  id: 'dev_trade_today_msft',
  symbol: 'MSFT',
  name: '微软',
  side: 'buy',
  trade_date: localDateKey(),
  date: localDateKey(),
  price: 412.07,
  shares: 2300,
  currency: 'USD',
};

const mockPnlSymbolSnapshotHistory = [
  { snapshotDate: '2026-07-08', symbol: 'NVDA', name: 'NVIDIA', heldShares: 80, avgCostUsd: 120, currentPriceUsd: 196.5, marketValueUsd: 15720, realizedPnlUsd: 1400, unrealizedPnlUsd: 6120, cumulativePnlUsd: 7520, totalBuyCostUsd: 12000, remainingCostUsd: 9600 },
  { snapshotDate: '2026-07-07', symbol: 'NVDA', name: 'NVIDIA', heldShares: 80, avgCostUsd: 120, currentPriceUsd: 192.3, marketValueUsd: 15384, realizedPnlUsd: 1400, unrealizedPnlUsd: 5784, cumulativePnlUsd: 7184, totalBuyCostUsd: 12000, remainingCostUsd: 9600 },
  { snapshotDate: '2026-07-06', symbol: 'NVDA', name: 'NVIDIA', heldShares: 80, avgCostUsd: 120, currentPriceUsd: 188.1, marketValueUsd: 15048, realizedPnlUsd: 1400, unrealizedPnlUsd: 5448, cumulativePnlUsd: 6848, totalBuyCostUsd: 12000, remainingCostUsd: 9600 },
  { snapshotDate: '2026-07-03', symbol: 'NVDA', name: 'NVIDIA', heldShares: 80, avgCostUsd: 120, currentPriceUsd: 184.2, marketValueUsd: 14736, realizedPnlUsd: 1400, unrealizedPnlUsd: 5136, cumulativePnlUsd: 6536, totalBuyCostUsd: 12000, remainingCostUsd: 9600 },
  { snapshotDate: '2026-07-02', symbol: 'NVDA', name: 'NVIDIA', heldShares: 80, avgCostUsd: 120, currentPriceUsd: 180.6, marketValueUsd: 14448, realizedPnlUsd: 1400, unrealizedPnlUsd: 4848, cumulativePnlUsd: 6248, totalBuyCostUsd: 12000, remainingCostUsd: 9600 },
  { snapshotDate: '2026-07-01', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 176.4, marketValueUsd: 17640, realizedPnlUsd: 0, unrealizedPnlUsd: 5640, cumulativePnlUsd: 5640, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-06-30', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 171.8, marketValueUsd: 17180, realizedPnlUsd: 0, unrealizedPnlUsd: 5180, cumulativePnlUsd: 5180, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-06-18', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 148.4, marketValueUsd: 14840, realizedPnlUsd: 0, unrealizedPnlUsd: 2840, cumulativePnlUsd: 2840, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-06-04', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 168.2, marketValueUsd: 16820, realizedPnlUsd: 0, unrealizedPnlUsd: 4820, cumulativePnlUsd: 4820, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-05-20', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 151.3, marketValueUsd: 15130, realizedPnlUsd: 0, unrealizedPnlUsd: 3130, cumulativePnlUsd: 3130, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-05-06', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 132.6, marketValueUsd: 13260, realizedPnlUsd: 0, unrealizedPnlUsd: 1260, cumulativePnlUsd: 1260, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-04-20', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 119.2, marketValueUsd: 11920, realizedPnlUsd: 0, unrealizedPnlUsd: -80, cumulativePnlUsd: -80, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
  { snapshotDate: '2026-04-05', symbol: 'NVDA', name: 'NVIDIA', heldShares: 100, avgCostUsd: 120, currentPriceUsd: 120, marketValueUsd: 12000, realizedPnlUsd: 0, unrealizedPnlUsd: 0, cumulativePnlUsd: 0, totalBuyCostUsd: 12000, remainingCostUsd: 12000 },
];

const mockStockComparisonLossPnlByDate = {
  '2026-04-05': 0,
  '2026-04-20': -200,
  '2026-05-06': -400,
  '2026-05-20': -700,
  '2026-06-04': -800,
  '2026-06-18': -1000,
  '2026-06-30': -1200,
  '2026-07-01': -1500,
  '2026-07-02': -1700,
  '2026-07-03': -1800,
  '2026-07-06': -2000,
  '2026-07-07': -2200,
  '2026-07-08': -2400,
};

const mockStockComparisonLossQqqCloseByDate = {
  '2026-04-06': 500,
  '2026-04-20': 498,
  '2026-05-06': 495,
  '2026-05-20': 492,
  '2026-06-04': 488,
  '2026-06-18': 485,
  '2026-06-30': 482,
  '2026-07-01': 481,
  '2026-07-02': 480,
  '2026-07-03': 479,
  '2026-07-06': 477,
  '2026-07-07': 476,
  '2026-07-08': 475,
};

const mockStockComparisonLossNvdaRawRows = [
  { date: '2026-04-05', close: 96, rawClose: 96 },
  { date: '2026-04-20', close: 94, rawClose: 94 },
  { date: '2026-05-06', close: 92, rawClose: 92 },
  { date: '2026-05-20', close: 89, rawClose: 89 },
  { date: '2026-06-04', close: 88, rawClose: 88 },
  { date: '2026-06-18', close: 86, rawClose: 86 },
  { date: '2026-06-30', close: 84, rawClose: 84 },
  { date: '2026-07-01', close: 81, rawClose: 81 },
  { date: '2026-07-02', close: 98.75, rawClose: 98.75 },
  { date: '2026-07-03', close: 97.50, rawClose: 97.50 },
  { date: '2026-07-06', close: 95, rawClose: 95 },
  { date: '2026-07-07', close: 92.50, rawClose: 92.50 },
  { date: '2026-07-08', close: 90, rawClose: 90 },
];

const mockActivePositions = [
  { symbol: 'NVDA', name: 'NVIDIA', currentPrice: 184.08, changePercent: 1.92, high: 195.95, ytdChangePercent: 32.4, totalPnl: 48000, totalPnlPct: 0.28 },
  { symbol: 'MSFT', name: '微软', currentPrice: 496.42, changePercent: 0.74, high: 505.21, ytdChangePercent: 18.1, totalPnl: 31400, totalPnlPct: 0.19 },
  { symbol: 'AAPL', name: '苹果', currentPrice: 213.55, changePercent: -0.46, high: 237.49, ytdChangePercent: -4.8, totalPnl: -4200, totalPnlPct: -0.03 },
];

const mockTradeActivePositions = [
  {
    symbol: 'NVDA',
    name: '英伟达',
    heldShares: 7000,
    currentPrice: 204.345,
    avgCost: 179.78,
    effectiveCost: 179.78,
    high: 220,
    marketValue: 1481000,
    holdingPnl: 171955,
    holdingPnlPct: 0.13664,
    todayPnl: 10713.71,
    todayPnlPct: 0.0011,
    hasTodayPnl: true,
  },
  {
    symbol: 'MSFT',
    name: '微软',
    heldShares: 2300,
    currentPrice: 412.07,
    avgCost: 427.5,
    effectiveCost: 427.5,
    high: 458.2,
    marketValue: 947761,
    holdingPnl: -35489,
    holdingPnlPct: -0.0361,
    todayPnl: -35472.51,
    todayPnlPct: -0.0059,
    hasTodayPnl: true,
  },
  {
    symbol: 'META',
    name: 'Meta',
    heldShares: 1000,
    currentPrice: 607.662,
    avgCost: 649.72,
    effectiveCost: 649.72,
    high: 740.91,
    marketValue: 607662,
    holdingPnl: -42058,
    holdingPnlPct: -0.06473,
    todayPnl: 30856.53,
    todayPnlPct: 0.0075,
    hasTodayPnl: true,
  },
];

const mockWaveTrades = [
  { id: 9101, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-06-30', shares: 10, price: 100, batch: '第1批' },
  { id: 9001, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-05-01', shares: 10, price: 100, batch: '第1批' },
  { id: 9002, symbol: 'NVDA', name: '英伟达', side: 'sell', date: '2026-05-15', shares: 10, price: 120, batch: '第1批' },
];

const mockActiveWave = {
  id: 'wave-NVDA-2026-06-30',
  index: 2,
  startDate: '2026-06-30',
  endDate: null,
  buys: [mockWaveTrades[0]],
  sells: [],
  isActive: true,
  totalBuyShares: 10,
  totalBuyCost: 1000,
  avgBuyPrice: 100,
  totalSellShares: 0,
  totalSellRevenue: 0,
  avgSellPrice: 0,
  heldShares: 10,
  heldDays: 12,
  gainAmount: 100,
  gainPct: 0.1,
  currentPrice: 110,
};

const mockCompletedWave = {
  id: 'wave-NVDA-2026-05-01',
  index: 1,
  startDate: '2026-05-01',
  endDate: '2026-05-15',
  buys: [mockWaveTrades[1]],
  sells: [mockWaveTrades[2]],
  isActive: false,
  totalBuyShares: 10,
  totalBuyCost: 1000,
  avgBuyPrice: 100,
  totalSellShares: 10,
  totalSellRevenue: 1200,
  avgSellPrice: 120,
  heldShares: 0,
  heldDays: 14,
  gainAmount: 200,
  gainPct: 0.2,
  currentPrice: 0,
};

const mockWavesByStock = [{
  symbol: 'NVDA',
  name: '英伟达',
  waves: [mockActiveWave, mockCompletedWave],
  completedCount: 1,
  avgHeldDays: 14,
  avgGainPct: 0.2,
  activeWave: mockActiveWave,
}];

const mockSwingWaves = [
  { id: 'swing-nvda-01', symbol: 'NVDA', name: '英伟达', status: 'active', buyDate: '2026-04-21', buyPriceUsd: 176.2, shares: 600, sellDate: null, sellPriceUsd: null, note: '计划 250 开始分批卖出', createdAt: '2026-04-21T08:00:00.000Z', updatedAt: '2026-07-11T08:00:00.000Z' },
  { id: 'swing-nvda-02', symbol: 'NVDA', name: '英伟达', status: 'active', buyDate: '2026-05-05', buyPriceUsd: 182.5, shares: 700, sellDate: null, sellPriceUsd: null, note: '跌破 30MA 减仓', createdAt: '2026-05-05T08:00:00.000Z', updatedAt: '2026-07-11T08:00:00.000Z' },
  { id: 'swing-nvda-03', symbol: 'NVDA', name: '英伟达', status: 'active', buyDate: '2026-05-19', buyPriceUsd: 179.1, shares: 700, sellDate: null, sellPriceUsd: null, note: '作为核心波段继续持有', createdAt: '2026-05-19T08:00:00.000Z', updatedAt: '2026-07-11T08:00:00.000Z' },
  { id: 'swing-msft-01', symbol: 'MSFT', name: '微软', status: 'active', buyDate: '2026-03-15', buyPriceUsd: 420.49, shares: 1000, sellDate: null, sellPriceUsd: null, note: '等待基本面修复后再决定', createdAt: '2026-03-15T08:00:00.000Z', updatedAt: '2026-07-11T08:00:00.000Z' },
  { id: 'swing-aapl-01', symbol: 'AAPL', name: '苹果', status: 'active', buyDate: '2026-02-28', buyPriceUsd: 192.4, shares: 1500, sellDate: null, sellPriceUsd: null, note: '观察新产品周期', createdAt: '2026-02-28T08:00:00.000Z', updatedAt: '2026-07-11T08:00:00.000Z' },
  { id: 'swing-tsla-01', symbol: 'TSLA', name: '特斯拉', status: 'completed', buyDate: '2025-11-10', buyPriceUsd: 217.36, shares: 800, sellDate: '2026-02-10', sellPriceUsd: 265.21, note: '达到计划价后一次性卖出', createdAt: '2025-11-10T08:00:00.000Z', updatedAt: '2026-02-10T08:00:00.000Z' },
];

const mockSwingQuotes = [
  { symbol: 'NVDA', name: '英伟达', price: 210.77, priceSource: 'EODHD-v2' },
  { symbol: 'MSFT', name: '微软', price: 385.12, priceSource: 'EODHD-v2' },
  { symbol: 'AAPL', name: '苹果', price: 201.18, priceSource: 'EODHD-v2' },
  { symbol: 'TSLA', name: '特斯拉', price: 265.21, priceSource: 'EODHD-v2' },
];

const mockLockedActivePositions = mockActivePositions.map((position, index) => ({
  ...position,
  dailyPnlLocked: true,
  dailyPnlPrice: [195.55, 386.74, 600.29][index] || position.currentPrice,
}));

const devStockNameEn = {
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  NVDA: 'NVIDIA',
  TSLA: 'Tesla',
};

function DevModal({ title, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f16] p-4 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/55">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-8 text-center text-sm text-white/45">
          本地视觉预览弹窗
        </div>
      </div>
    </div>
  );
}

function makeSnapshots(accounts, { zeroHistoryAccountId = '' } = {}) {
  const currentMonth = localMonthKey();
  const monthFactors = [0.34, 0.40, 0.47, 0.45, 0.52, 0.53, 0.59, 0.66, 0.70, 0.96, 0.94, 1.04, 1];
  const wingLungTrendPreview = [219500, 224800, 221600, 228300, 231200, 235900, 238400, 241600, 246900, 250400, 248018, 260436];
  const months = monthFactors.map((_, idx) => shiftMonth(currentMonth, idx - 12));

  return months.flatMap((month, idx) =>
    accounts.map(acc => ({
      id: `dev_snapshot_${acc.id}_${month}`,
      accountId: acc.id,
      month,
      balance: acc.id === zeroHistoryAccountId
        ? ([0, 0, 0, 0, 0, 0, 0, 0, 0, 490000, 488000, 485000, 80001][idx] ?? 0)
        : acc.id === 'dev_me_bank_hkd'
        ? (idx === 0 ? 215000 : wingLungTrendPreview[idx - 1])
        : Math.round(Number(acc.balance || 0) * monthFactors[idx] * 100) / 100,
    }))
  );
}

function buildCommunityCompetitionPreview(state, period = 'day') {
  if (state === 'profile_required') return { success: true, state: 'profile_required' };
  if (state === 'join_required') return { success: true, state: 'join_required' };
  if (state === 'waiting_snapshot') {
    return {
      success: true,
      state: 'waiting_snapshot',
      joinedAt: '2026-07-12T12:00:00.000Z',
      eligibleAfterSnapshotDate: '2026-07-13',
    };
  }
  return {
    success: true,
    state: 'ready',
    period,
    asOfDate: '2026-07-10',
    snapshotVersion: 'preview_snapshot_20260710',
    snapshotUpdatedAt: '2026-07-10T21:18:00.000Z',
    calculationStartDate: period === 'day' ? '2026-07-10' : '2026-07-01',
    benchmarkReturnPct: 0.0042,
    stats: {
      participants: 12486,
      beatRatePct: 0.63,
      profitableRatePct: 0.78,
      averageReturnPct: 0.0537,
      top10AverageReturnPct: 0.1836,
    },
    leaders: [
      { rank: 1, nickname: 'Alpha陈', avatarKey: 'wolf', returnPct: 0.2863, outperformancePct: 0.2821, holdingSymbols: ['AAPL', 'GOOGL', 'META', 'NVDA'] },
      { rank: 2, nickname: 'ValueLee', avatarKey: 'fox', returnPct: 0.2417, outperformancePct: 0.2375, holdingSymbols: ['AAPL', 'AMD', 'AMZN', 'AVGO', 'GOOGL', 'META', 'MSFT', 'NFLX', 'NVDA', 'QQQ', 'TSLA', 'TSM'] },
      { rank: 3, nickname: 'QuantM', avatarKey: 'tiger', returnPct: 0.2109, outperformancePct: 0.2067, holdingSymbols: ['AMD', 'PLTR', 'QQQ'] },
      { rank: 4, nickname: '牛牛哥', avatarKey: 'cat', returnPct: 0.1964, outperformancePct: 0.1922, holdingSymbols: ['BABA', 'JD', 'PDD'] },
      { rank: 5, nickname: 'HangzhouQ', avatarKey: 'eagle', returnPct: 0.1788, outperformancePct: 0.1746, holdingSymbols: ['HOOD', 'IBIT', 'MSTR', 'TSLA'] },
      { rank: 6, nickname: 'TT_Invest', avatarKey: 'panda', returnPct: -0.0312, outperformancePct: -0.0354, holdingSymbols: [] },
    ],
    self: { rank: 18, nickname: '波段玩家1836', avatarKey: 'cyber-cyan', returnPct: 0.1286, outperformancePct: 0.1244, holdingSymbols: ['META', 'MSFT', 'NVDA', 'QQQ', 'TSLA'] },
    trend: {
      self: [
        { date: '2026-07-01', value: 0 },
        { date: '2026-07-03', value: 0.031 },
        { date: '2026-07-06', value: 0.067 },
        { date: '2026-07-08', value: 0.094 },
        { date: '2026-07-10', value: 0.1286 },
      ],
      benchmark: [
        { date: '2026-07-01', value: 0 },
        { date: '2026-07-03', value: -0.002 },
        { date: '2026-07-06', value: 0.001 },
        { date: '2026-07-08', value: 0.003 },
        { date: '2026-07-10', value: 0.0042 },
      ],
    },
  };
}

function StandardDevVisualPreview({ initialTab = '' }) {
  const earningsBaseDetailPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('preview') === 'earnings-base-prototype';
  const earningsHoldingsDetailPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('preview') === 'earnings-holdings-prototype';
  const [activeTab, setActiveTab] = React.useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === 'undefined') return 'analysis';
    const params = new URLSearchParams(window.location.search);
    if (['risk', 'editor', 'leverage'].includes(params.get('homeMargin'))) return 'home-margin-risk';
    const requestedTab = params.get('tab');
    return ['home', 'trades', 'analysis', 'review', 'settings', 'pnl-report', 'home-margin-risk', 'stock-detail', 'watchlist-stock-detail', 'wave-tracker', 'community-competition'].includes(requestedTab) ? requestedTab : 'analysis';
  });
  const [communityProfileFocusRequest, setCommunityProfileFocusRequest] = React.useState(0);
  const [language, setLanguage] = React.useState(() => {
    if (typeof window === 'undefined') return 'zh';
    return normalizeLanguage(new URLSearchParams(window.location.search).get('lang'));
  });
  const [marketColorMode, setMarketColorMode] = React.useState('redUpGreenDown');
  const pnlReportTooltipDate = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('pnlReportTooltipDate') || '';
  }, []);
  const [changelogExpanded, setChangelogExpanded] = React.useState(false);
  const [newPwd, setNewPwd] = React.useState('');
  const [pwdLoading, setPwdLoading] = React.useState(false);
  const [pwdMsg, setPwdMsg] = React.useState(null);
  const [showChangePassword, setShowChangePassword] = React.useState(false);
  const [tradeCurrencyMode, setTradeCurrencyMode] = React.useState('CNY');
  const [tradeLookupStatus, setTradeLookupStatus] = React.useState(null);
  const [tradeEntryScope, setTradeEntryScope] = React.useState('ledger');
  const [showAddTrade, setShowAddTrade] = React.useState(false);
  const [previewConfirmModal, setPreviewConfirmModal] = React.useState(null);
  const [previewConfirmSubmitting, setPreviewConfirmSubmitting] = React.useState(false);
  const previewConfirmSubmittingRef = React.useRef(false);
  const [newTrade, setNewTrade] = React.useState({
    symbol: '',
    name: '',
    side: 'buy',
    date: new Date().toISOString().slice(0, 10),
    price: '',
    shares: '',
    batch: '第1批',
  });
  const [costBasisActiveSymbol, setCostBasisActiveSymbol] = React.useState('');
  const [costBasisData, setCostBasisData] = React.useState({});
  const [costBasisNewSymbol, setCostBasisNewSymbol] = React.useState('');
  const [costBasisNewTrade, setCostBasisNewTrade] = React.useState({ type: 'buy', price: '', shares: '', date: new Date().toISOString().slice(0, 10) });
  const [showCostBasisAdd, setShowCostBasisAdd] = React.useState(false);
  const [showCostBasisTrade, setShowCostBasisTrade] = React.useState(false);
  const [watchlistDetailTargetUsd, setWatchlistDetailTargetUsd] = React.useState(250);
  const watchlistDetailTooltipPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailTooltip') === '1';
  const watchlistDetailFocusSection = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('stockDetailFocus') || '';
  const watchlistDetailTargetEditorOpen = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('targetEditor') === '1';
  const watchlistFundCompositionPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('preview') === 'watchlist-fund-composition';
  const [expandedTrades, setExpandedTrades] = React.useState({});
  const [expandedWaves, setExpandedWaves] = React.useState({});
  const [waveNotes, setWaveNotes] = React.useState({});
  const [editingNoteId, setEditingNoteId] = React.useState(null);
  const btcPreviewMode = typeof window === 'undefined'
    ? 'live'
    : new URLSearchParams(window.location.search).get('btc');
  const indicesPreviewMode = typeof window === 'undefined'
    ? 'mock'
    : new URLSearchParams(window.location.search).get('indices');
  const freshnessPreviewMode = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('freshness');
  const earningsScenario = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('earningsScenario');
  const earningsResumeSmoke = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('earningsResumeSmoke') === '1';
  const earningsLiveSmoke = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('earningsLiveSmoke') === '1';
  const earningsAutoOpen = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('earningsAutoOpen') === '1';
  const benchmarkSheetPreview = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('benchmarkSheet') || '';
  const earningsResumeClockRef = React.useRef(Date.parse(earningsLiveSmoke
    ? '2026-07-15T12:07:00.000Z'
    : '2026-07-15T12:01:00.000Z'));
  const earningsResumeHiddenRef = React.useRef(false);
  const earningsResumeUserIdRef = React.useRef(`dev-earnings-resume-${Math.random().toString(36).slice(2)}`);
  const earningsCalendarNow = React.useCallback(
    () => earningsResumeSmoke || earningsLiveSmoke ? earningsResumeClockRef.current : Date.now(),
    [earningsLiveSmoke, earningsResumeSmoke],
  );
  const earningsCalendarRequest = React.useCallback(async ({ symbols = [], forceRefresh = false }) => {
    if (!earningsResumeSmoke && !earningsLiveSmoke) return [];
    const published = earningsLiveSmoke || (forceRefresh && earningsResumeHiddenRef.current);
    const events = [{
      code: 'ASML.US',
      symbol: 'ASML',
      name: '阿斯麦',
      report_date: earningsLiveSmoke ? localDateKey() : '2026-07-15',
      date: '2026-06-30',
      before_after_market: 'BeforeMarket',
      currency: 'EUR',
      estimate: 6.8954,
      actual: published ? 7.58 : null,
      difference: published ? 0.6846 : null,
      percent: published ? 9.928358035791971 : null,
      epsPreviousYear: 5.9,
      epsActualYoyPercent: published ? 28.474576271186436 : null,
      epsEstimateYoyPercent: 16.871186440677967,
      revenueEstimateUsd: 10_148_260_308.571428,
      revenueActualUsd: earningsLiveSmoke && published ? 10_182_000_000 : null,
      revenueSurprisePercent: earningsLiveSmoke && published ? 0.332474697043771 : null,
      revenueEstimateYoyPercent: 15.45,
      revenueActualYoyPercent: earningsLiveSmoke && published ? 16.78082191780822 : null,
      ebitActualUsd: earningsLiveSmoke && published ? 4_192_610_000 : null,
      ebitPreviousYearUsd: earningsLiveSmoke && published ? 3_774_694_000 : null,
      ebitActualYoyPercent: earningsLiveSmoke && published ? 11.071519969565745 : null,
      ebitActualBasis: earningsLiveSmoke && published ? 'operatingIncome' : null,
      earningsPublished: published,
    }];
    const requested = new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()));
    return events.filter((event) => requested.has(event.symbol));
  }, [earningsLiveSmoke, earningsResumeSmoke]);
  React.useEffect(() => {
    if (!earningsResumeSmoke) return undefined;
    const markResumeReady = () => {
      earningsResumeHiddenRef.current = true;
      earningsResumeClockRef.current = Date.parse('2026-07-15T12:07:00.000Z');
    };
    const markWhenHidden = () => {
      if (document.hidden) markResumeReady();
    };
    window.addEventListener('pagehide', markResumeReady);
    document.addEventListener('visibilitychange', markWhenHidden);
    return () => {
      window.removeEventListener('pagehide', markResumeReady);
      document.removeEventListener('visibilitychange', markWhenHidden);
    };
  }, [earningsResumeSmoke]);
  React.useEffect(() => {
    if (!earningsLiveSmoke || !earningsAutoOpen) return undefined;
    const modalTimer = window.setTimeout(() => {
      document.querySelector('#earnings-calendar button')?.click();
    }, 250);
    const detailTimer = window.setTimeout(() => {
      document.querySelector('[data-earnings-published-event]')?.click();
    }, 650);
    return () => {
      window.clearTimeout(modalTimer);
      window.clearTimeout(detailTimer);
    };
  }, [earningsAutoOpen, earningsLiveSmoke]);
  const stockDetailPeakPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailPeak') === 'past';
  const stockDetailCurrencyPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailCurrency') === 'CNY'
    ? 'CNY'
    : 'USD';
  const homeMarginPreview = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('homeMargin') || '';
  const homeMarginScenarioPreview = typeof window === 'undefined'
    ? undefined
    : Number(new URLSearchParams(window.location.search).get('homeMarginScenario'));
  const [homeCurrencyMode, setHomeCurrencyMode] = React.useState(stockDetailCurrencyPreview);
  const [previewMarginDebtUsd, setPreviewMarginDebtUsd] = React.useState(3_000_000 / 7.215);
  const stockReturnComparisonSharePreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailShare') === '1';
  const stockReturnComparisonMethodPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailMethod') === '1';
  const stockReturnComparisonTooltipPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailTooltip') === '1';
  const stockDetailFocusComparison = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailFocus') === 'comparison';
  const stockReturnComparisonLossPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailComparison') === 'loss';
  const stockReturnComparisonCostFlowPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stockDetailComparison') === 'cost-flow';
  const stockDetailInitialRange = typeof window === 'undefined'
    ? 'all'
    : new URLSearchParams(window.location.search).get('stockDetailRange') || 'all';
  const accountTrendPreviewId = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('accountTrend') || '';
  const accountTrendZeroHistoryPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('accountTrendZeroHistory') === '1';
  const competitionPreviewState = typeof window === 'undefined'
    ? 'ready'
    : new URLSearchParams(window.location.search).get('competitionState') || 'ready';
  const competitionResumeSmoke = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('competitionResumeSmoke') === '1';
  const competitionResumeClockRef = React.useRef(Date.parse('2026-07-13T20:00:00.000Z'));
  const competitionResumeFetchCountRef = React.useRef(0);
  const competitionResumeUserIdRef = React.useRef(`dev-resume-smoke-${Math.random().toString(36).slice(2)}`);
  const communityCompetitionNow = React.useCallback(
    () => competitionResumeSmoke ? competitionResumeClockRef.current : Date.now(),
    [competitionResumeSmoke],
  );
  React.useEffect(() => {
    if (activeTab !== 'analysis' || !baseAccounts.some(account => account.id === accountTrendPreviewId)) return undefined;
    const timer = window.setTimeout(() => {
      const trigger = [...document.querySelectorAll('[data-open-account-trend]')]
        .find(element => element.dataset.openAccountTrend === accountTrendPreviewId);
      trigger?.click();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [accountTrendPreviewId, activeTab]);
  const communityCompetitionClient = React.useMemo(() => ({
    fetch: async ({ period }) => {
      const requestedState = {
        profile: 'profile_required',
        join: 'join_required',
        waiting: 'waiting_snapshot',
      }[competitionPreviewState] || competitionPreviewState;
      const preview = buildCommunityCompetitionPreview(
        ['profile_required', 'join_required', 'waiting_snapshot', 'ready'].includes(requestedState) ? requestedState : 'ready',
        period,
      );
      if (!competitionResumeSmoke || preview.state !== 'ready') return preview;
      competitionResumeFetchCountRef.current += 1;
      if (competitionResumeFetchCountRef.current > 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3_000));
      }
      return competitionResumeFetchCountRef.current > 1
        ? {
          ...preview,
          asOfDate: '2026-07-13',
          snapshotVersion: 'preview_snapshot_20260713',
          snapshotUpdatedAt: '2026-07-13T21:11:00.000Z',
        }
        : preview;
    },
    snapshotStatus: async () => ({
      success: true,
      state: 'snapshot_status',
      channel: 'competition',
      snapshotDate: competitionResumeClockRef.current >= Date.parse('2026-07-13T21:11:00.000Z')
        ? '2026-07-13'
        : '2026-07-10',
      version: competitionResumeClockRef.current >= Date.parse('2026-07-13T21:11:00.000Z')
        ? 'preview_snapshot_20260713'
        : 'preview_snapshot_20260710',
      completedAt: competitionResumeClockRef.current >= Date.parse('2026-07-13T21:11:00.000Z')
        ? '2026-07-13T21:11:00.000Z'
        : '2026-07-10T21:18:00.000Z',
    }),
    join: async () => buildCommunityCompetitionPreview('waiting_snapshot'),
  }), [competitionPreviewState, competitionResumeSmoke]);
  React.useEffect(() => {
    if (!competitionResumeSmoke) return undefined;
    const advancePastClose = () => {
      competitionResumeClockRef.current = Date.parse('2026-07-13T21:11:00.000Z');
    };
    const advanceWhenHidden = () => {
      if (document.hidden) advancePastClose();
    };
    window.addEventListener('pagehide', advancePastClose);
    document.addEventListener('visibilitychange', advanceWhenHidden);
    return () => {
      window.removeEventListener('pagehide', advancePastClose);
      document.removeEventListener('visibilitychange', advanceWhenHidden);
    };
  }, [competitionResumeSmoke]);
  React.useEffect(() => {
    if (activeTab !== 'stock-detail' || !stockDetailFocusComparison) return undefined;
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const focusComparison = () => {
      if (cancelled) return;
      const element = document.getElementById('stock-return-comparison');
      if (element) {
        element.scrollIntoView({ block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 20) timer = window.setTimeout(focusComparison, 100);
    };
    timer = window.setTimeout(focusComparison, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, stockDetailFocusComparison]);
  const previewMarketIndices = React.useMemo(() => {
    if (indicesPreviewMode === 'placeholder') return [];
    if (indicesPreviewMode === 'rest-empty') return mockRestMarketIndices;
    if (indicesPreviewMode === 'sampled') return mockSampledMarketIndices;
    return mockMarketIndices;
  }, [indicesPreviewMode]);
  const stockDetailSnapshotHistory = React.useMemo(() => {
    if (stockReturnComparisonCostFlowPreview) return mockStockComparisonCostFlowSnapshots;
    if (stockReturnComparisonLossPreview) {
      return mockPnlSymbolSnapshotHistory.map((row) => {
        if (row.symbol !== 'NVDA' || !Object.hasOwn(mockStockComparisonLossPnlByDate, row.snapshotDate)) return row;
        const cumulativePnlUsd = mockStockComparisonLossPnlByDate[row.snapshotDate];
        const remainingCostUsd = Number(row.remainingCostUsd || 0);
        const heldShares = Number(row.heldShares || 0);
        const marketValueUsd = Math.max(0, remainingCostUsd + cumulativePnlUsd);
        return {
          ...row,
          currentPriceUsd: heldShares > 0 ? marketValueUsd / heldShares : row.currentPriceUsd,
          marketValueUsd,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: cumulativePnlUsd,
          cumulativePnlUsd,
        };
      });
    }
    if (!stockDetailPeakPreview) return mockPnlSymbolSnapshotHistory;
    return mockPnlSymbolSnapshotHistory.map((row) => {
      if (row.symbol !== 'NVDA') return row;
      if (row.snapshotDate === '2026-06-04') {
        return {
          ...row,
          currentPriceUsd: 195.2,
          marketValueUsd: 19520,
          unrealizedPnlUsd: 7520,
          cumulativePnlUsd: 7520,
        };
      }
      if (row.snapshotDate === '2026-07-07') {
        return {
          ...row,
          currentPriceUsd: 179.8,
          marketValueUsd: 14384,
          unrealizedPnlUsd: 4784,
          cumulativePnlUsd: 6184,
        };
      }
      if (row.snapshotDate !== '2026-07-08') return row;
      return {
        ...row,
        currentPriceUsd: 178.4,
        marketValueUsd: 14272,
        unrealizedPnlUsd: 4272,
        cumulativePnlUsd: 5672,
      };
    });
  }, [stockDetailPeakPreview, stockReturnComparisonCostFlowPreview, stockReturnComparisonLossPreview]);
  const stockReturnBenchmarkRows = React.useMemo(() => {
    if (stockReturnComparisonCostFlowPreview) return mockStockComparisonCostFlowQqqRows;
    if (!stockReturnComparisonLossPreview) return mockPnlBenchmarkRows;
    return mockPnlBenchmarkRows.map((row) => {
      const lossClose = mockStockComparisonLossQqqCloseByDate[row.date];
      return lossClose == null ? row : { ...row, close: lossClose, rawClose: lossClose };
    });
  }, [stockReturnComparisonCostFlowPreview, stockReturnComparisonLossPreview]);
  const stockReturnStockRawRows = React.useMemo(() => {
    if (stockReturnComparisonCostFlowPreview) return mockStockComparisonCostFlowNvdaRawRows;
    if (stockReturnComparisonLossPreview) return mockStockComparisonLossNvdaRawRows;
    return mockStockComparisonNvdaRawRows;
  }, [stockReturnComparisonCostFlowPreview, stockReturnComparisonLossPreview]);
  const stockReturnRawRowsBySymbol = React.useMemo(() => ({
    QQQ: stockReturnBenchmarkRows,
    NVDA: stockReturnStockRawRows,
  }), [stockReturnBenchmarkRows, stockReturnStockRawRows]);
  const stockDetailTrades = stockReturnComparisonCostFlowPreview
    ? [...mockPnlStockTrades.filter((trade) => trade.symbol !== 'NVDA'), ...mockStockComparisonCostFlowTrades]
    : mockPnlStockTrades;
  const previewActivePositions = freshnessPreviewMode === 'locked'
    ? mockLockedActivePositions
    : mockActivePositions;
  const previewEarningsCalendarEvents = React.useMemo(() => {
    if (earningsResumeSmoke || earningsLiveSmoke) return null;
    if (!['dense', 'sparse'].includes(earningsScenario)) return mockEarningsCalendarEvents;
    const simulatedEvents = [
      ['NVDA', 'NVIDIA', 1, 'high'],
      ['MSFT', 'Microsoft', 3, 'high'],
      ['AAPL', 'Apple', 6, 'high'],
      ['TSLA', 'Tesla', 10, 'medium'],
      ['META', 'Meta', 15, 'medium'],
    ].map(([symbol, name, offset, impact]) => ({
      symbol,
      name,
      reportDate: shiftedDateKey(offset),
      session: offset % 2 === 0 ? 'pre' : 'post',
      epsEstimate: 1 + offset / 10,
      revenueEstimateUsd: 10_000_000_000 + offset * 1_000_000_000,
      currency: 'USD',
      impact,
    }));
    return earningsScenario === 'dense' ? simulatedEvents : simulatedEvents.slice(0, 2);
  }, [earningsLiveSmoke, earningsResumeSmoke, earningsScenario]);
  const [homeWatchlist, setHomeWatchlist] = React.useState(() => (
    earningsResumeSmoke || earningsLiveSmoke
      ? [{
        symbol: 'ASML',
        name: '阿斯麦',
        price: 1825.9492,
        previousClose: 1775.64,
        dailyBaselineClose: 1775.64,
        changePercent: 2.8333,
        dailyPnlChangePercent: 2.8333,
        high: 1826.6655,
        ytdChangePercent: 22.6,
        intraday: mockMarketIntraday.red,
        realtime: true,
        realtimeStatus: 'live',
        realtimeAt: Date.parse('2026-07-15T12:07:00.000Z'),
        clientReceivedAt: Date.parse('2026-07-15T12:07:00.000Z'),
        marketStatus: 'quote',
        priceType: 'quote-midpoint',
        source: 'EODHD_WS_QUOTE',
      }, ...mockHomeWatchlist]
      : ['dense', 'sparse'].includes(earningsScenario)
      ? [...mockHomeWatchlist, { symbol: 'META', name: 'Meta', price: 607.66, changePercent: 0.75, high: 740.91, ytdChangePercent: 12.3, intraday: mockMarketIntraday.red }]
      : mockHomeWatchlist
  ));
  const [benchmarkMenuOpen, setBenchmarkMenuOpen] = React.useState(() => ['live', 'locked'].includes(benchmarkSheetPreview));
  const [benchmarkSymbol, setBenchmarkSymbol] = React.useState(() => benchmarkSheetPreview ? 'AAPL' : 'QQQ');
  const [showAddStock, setShowAddStock] = React.useState(false);
  const [newStock, setNewStock] = React.useState({
    symbol: '',
    name: '',
    price: '',
    high: '',
    cost: '0',
    shares: '0',
  });
  const [accounts, setAccounts] = React.useState(() => baseAccounts);
  const [snapshots, setSnapshots] = React.useState(() => makeSnapshots(baseAccounts, {
    zeroHistoryAccountId: accountTrendZeroHistoryPreview ? 'dev_me_bank_cny' : '',
  }));
  const [showAddAccount, setShowAddAccount] = React.useState(false);
  const [showFillSnapshot, setShowFillSnapshot] = React.useState(false);
  const [showMonthsDetail, setShowMonthsDetail] = React.useState(false);
  const [accountDeleteConfirmId, setAccountDeleteConfirmId] = React.useState(null);
  const [chartSelectedMonthIdx, setChartSelectedMonthIdx] = React.useState(null);
  const [fillMonth, setFillMonth] = React.useState(() => localMonthKey());
  const [snapshotDraft, setSnapshotDraft] = React.useState({});
  const [snapshotTab, setSnapshotTab] = React.useState('我');
  const [newAccount, setNewAccount] = React.useState({
    owner: '我',
    type: '',
    name: '',
    currency: 'CNY',
    icon: '',
    balance: '',
  });
  const [investmentPlan, setInvestmentPlan] = React.useState({
    startCapital: 2400000,
    targetAnnualRate: 0.20,
    startYear: 2026,
    totalYears: 10,
    ageGoalAge: 46,
    motto: '我要变的很有钱! 有钱有钱有钱!',
    displayCurrency: 'USD',
  });
  const [disciplines, setDisciplines] = React.useState(() => mockDisciplines);
  const [reviewLogs, setReviewLogs] = React.useState(() => mockReviewLogs);
  const [yearlyActuals, setYearlyActuals] = React.useState(() => [
    { year: 2026, actualGain: 70000, endBalance: 2470000 },
  ]);
  const [showPlanSettings, setShowPlanSettings] = React.useState(false);
  const [showAddDiscipline, setShowAddDiscipline] = React.useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = React.useState(null);
  const [showAddLog, setShowAddLog] = React.useState(false);
  const [editingLogId, setEditingLogId] = React.useState(null);
  const [editYearlyActualId, setEditYearlyActualId] = React.useState(null);
  const [filterLevel, setFilterLevel] = React.useState('all');
  const [showAllDisciplines, setShowAllDisciplines] = React.useState(false);
  const [showAllLogs, setShowAllLogs] = React.useState(false);
  const [showAllYears, setShowAllYears] = React.useState(false);
  const [expandedDisciplines, setExpandedDisciplines] = React.useState({});
  const lastSubmitRef = React.useRef({});

  const db = React.useMemo(() => ({
    insertAccount: async (account) => ({
      ...account,
      id: `dev_account_${Date.now()}`,
    }),
    updateAccount: async (id, account) => ({
      ...account,
      id,
    }),
    upsertSnapshot: async () => ({}),
    deleteSnapshot: async () => ({}),
    deleteAccount: async () => ({}),
    upsertInvestmentPlan: async () => ({}),
    upsertYearlyActual: async () => ({}),
    insertDiscipline: async (discipline) => ({ ...discipline, id: `dev_rule_${Date.now()}`, date: new Date().toISOString().slice(0, 10) }),
    updateDiscipline: async () => ({}),
    deleteDiscipline: async () => ({}),
    insertReviewLog: async (log) => ({ ...log, id: `dev_log_${Date.now()}` }),
    updateReviewLog: async () => ({}),
    deleteReviewLog: async () => ({}),
    fetchPnlReportSnapshots: async () => mockPnlPortfolioSnapshots,
    fetchPnlReportSymbolSnapshots: async () => mockPnlSymbolSnapshots,
    fetchPnlReportSymbolSnapshotHistory: async (symbol) => stockDetailSnapshotHistory.filter((row) => row.symbol === String(symbol || '').trim().toUpperCase()),
    fetchPnlReportRebuildState: async () => null,
    upsertPnlReportSnapshots: async ({ portfolioSnapshot }) => portfolioSnapshot,
    clearPnlReportRebuildState: async () => ({}),
    fetchCommunityProfile: async () => {
      if (new URLSearchParams(window.location.search).get('communityProfileDelay') === '1') {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      return {
        userId: 'dev-user',
        nickname: '波段玩家1836',
        avatarKey: 'gold',
        profileCompletedAt: ['profile', 'profile_required'].includes(competitionPreviewState)
          ? null
          : '2026-07-11T00:00:00.000Z',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      };
    },
    upsertCommunityProfile: async (profile) => ({
      userId: 'dev-user',
      nickname: profile.nickname || '波段玩家1836',
      avatarKey: profile.avatarKey || 'gold',
      profileCompletedAt: new Date().toISOString(),
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    }),
    upsertWaveNote: async () => ({}),
    listSwingWaves: async () => mockSwingWaves.map((wave) => ({ ...wave })),
    createSwingWave: async (input) => ({
      id: `swing-preview-${Date.now()}`,
      symbol: String(input.symbol || '').toUpperCase(),
      name: input.name || input.symbol,
      status: 'active',
      buyDate: input.buyDate,
      buyPriceUsd: Number(input.buyPriceUsd),
      shares: Number(input.shares),
      sellDate: null,
      sellPriceUsd: null,
      note: input.note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateSwingWave: async (id, input) => {
      const current = mockSwingWaves.find((wave) => wave.id === id) || {};
      return {
        ...current,
        id,
        symbol: input.symbol || current.symbol,
        name: input.name || current.name,
        buyDate: input.buyDate || current.buyDate,
        buyPriceUsd: Number(input.buyPriceUsd || current.buyPriceUsd),
        shares: Number(input.shares || current.shares),
        note: input.note ?? current.note,
        ...(current.status === 'completed' ? {
          sellDate: input.sellDate || current.sellDate,
          sellPriceUsd: Number(input.sellPriceUsd || current.sellPriceUsd),
        } : {}),
        updatedAt: new Date().toISOString(),
      };
    },
    completeSwingWave: async (id, input) => {
      const current = mockSwingWaves.find((wave) => wave.id === id) || {};
      return {
        ...current,
        id,
        status: 'completed',
        sellDate: input.sellDate,
        sellPriceUsd: Number(input.sellPriceUsd),
        updatedAt: new Date().toISOString(),
      };
    },
    deleteSwingWave: async () => ({}),
    deleteCostBasisTrade: async () => ({}),
    deleteCostBasisSymbol: async () => ({}),
    insertCostBasisTrade: async () => ({}),
  }), [competitionPreviewState, stockDetailSnapshotHistory]);

  const fmt = React.useCallback((n, digits = 2) => {
    const value = Number(n);
    if (!Number.isFinite(value)) return '--';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }, []);
  const noop = React.useCallback(() => {}, []);
  const showPreviewConfirm = React.useCallback((options) => {
    previewConfirmSubmittingRef.current = false;
    setPreviewConfirmSubmitting(false);
    setPreviewConfirmModal(normalizeConfirmModalOptions(options));
  }, []);
  const requestDeleteLegacyTrade = React.useCallback((tradeId) => {
    const trade = mockWaveTrades.find((item) => String(item.id) === String(tradeId));
    if (!trade) return;
    const isBuy = !trade.side || trade.side === 'buy';
    showPreviewConfirm({
      title: '确定删除这笔交易?',
      desc: '删除后无法恢复',
      info: `${isBuy ? '买' : '卖'} · ${trade.symbol || 'TQQQ'} · ${trade.date || '—'} · ${trade.shares}股 @$${Number(trade.price).toFixed(2)}`,
      confirmText: '删除',
      confirmStyle: 'danger',
      icon: '🗑',
      onConfirm: async () => {},
    });
  }, [showPreviewConfirm]);
  const closePreviewConfirm = React.useCallback(() => {
    if (previewConfirmSubmittingRef.current) return;
    setPreviewConfirmModal(null);
  }, []);
  const submitPreviewConfirm = React.useCallback(async () => {
    if (previewConfirmSubmittingRef.current) return;
    const callback = previewConfirmModal?.onConfirm;
    if (!callback) {
      setPreviewConfirmModal(null);
      return;
    }
    previewConfirmSubmittingRef.current = true;
    setPreviewConfirmSubmitting(true);
    try {
      await callback();
      setPreviewConfirmModal(null);
    } finally {
      previewConfirmSubmittingRef.current = false;
      setPreviewConfirmSubmitting(false);
    }
  }, [previewConfirmModal]);
  const calcCostBasis = React.useCallback((rows = []) => {
    let shares = 0;
    let totalCost = 0;
    let realizedPnl = 0;
    [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((row) => {
      const price = Number(row.price) || 0;
      const qty = Number(row.shares) || 0;
      if (price <= 0 || qty <= 0) return;
      if (row.type === 'sell') {
        const avg = shares > 0 ? totalCost / shares : 0;
        const sold = Math.min(shares, qty);
        realizedPnl += sold * (price - avg);
        totalCost -= sold * avg;
        shares -= sold;
        if (shares <= 0) {
          shares = 0;
          totalCost = 0;
        }
        return;
      }
      shares += qty;
      totalCost += price * qty;
    });
    const avgCost = shares > 0 ? totalCost / shares : 0;
    return { shares, totalCost, avgCost, effectiveCost: avgCost, realizedPnl };
  }, []);

  const ctx = {
    accountDeleteConfirmId,
    accounts,
    chartSelectedMonthIdx,
    db,
    fillMonth,
    fmt,
    hkdRate: HKD_RATE,
    newAccount,
    setAccountDeleteConfirmId,
    setAccounts,
    setChartSelectedMonthIdx,
    setFillMonth,
    setNewAccount,
    setShowAddAccount,
    setShowFillSnapshot,
    setShowMonthsDetail,
    setSnapshotDraft,
    setSnapshots,
    setSnapshotTab,
    showAddAccount,
    showFillSnapshot,
    showMonthsDetail,
    snapshotDraft,
    snapshots,
    snapshotTab,
    usdRate: USD_RATE,
    showConfirm: showPreviewConfirm,
  };

  const homeSignalBenchmarkOptions = ['live', 'locked'].includes(benchmarkSheetPreview)
    ? mockHomeSignalBenchmarks.map((row) => ({
      ...row,
      high: row.week52High,
      dailyPnlPrice: row.price,
      dailyPnlSession: benchmarkSheetPreview === 'live' ? 'regular' : 'closed',
      dailyPnlLocked: benchmarkSheetPreview !== 'live',
    }))
    : [
      { symbol: 'QQQ', name: 'QQQ', price: 714.22, high: 747.82, week52High: 747.82, dailyPnlPrice: 714.22, dailyPnlSession: 'closed', dailyPnlLocked: true },
      { symbol: 'SPY', name: 'SPY', price: 612.84, high: 619.25, week52High: 619.25, dailyPnlPrice: 612.84, dailyPnlSession: 'closed', dailyPnlLocked: true },
      { symbol: 'TQQQ', name: 'TQQQ', price: 87.21, high: 93.46, week52High: 93.46, dailyPnlPrice: 87.21, dailyPnlSession: 'closed', dailyPnlLocked: true },
    ];
  const homeSignalBenchmarkStock = homeSignalBenchmarkOptions.find((row) => row.symbol === benchmarkSymbol)
    || homeSignalBenchmarkOptions[0];
  const homeSignalBenchmarkDrawdown = homeSignalBenchmarkStock?.high > 0
    ? (homeSignalBenchmarkStock.price - homeSignalBenchmarkStock.high) / homeSignalBenchmarkStock.high
    : 0;

  const homeCtx = {
    addStock: async (stock) => {
      const symbol = String(stock?.symbol || '').trim().toUpperCase();
      if (!symbol) return { success: false, error: '请输入股票代码' };
      const item = {
        symbol,
        name: stock?.name || symbol,
        price: Number(stock?.price) || 0,
        changePercent: 0,
        high: Number(stock?.high) || Number(stock?.price) || 0,
        ytdChangePercent: null,
        intraday: mockMarketIntraday.red,
      };
      setHomeWatchlist((current) => [item, ...current.filter((row) => row.symbol !== symbol)]);
      return { success: true, item };
    },
    benchmarkDrawdown: homeSignalBenchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions: homeSignalBenchmarkOptions,
    benchmarkStatus: { text: '等待中', desc: '回撤<5%, 空仓等待' },
    benchmarkStock: homeSignalBenchmarkStock,
    benchmarkSymbol,
    btcMarketCard: btcPreviewMode === 'placeholder' ? null : mockBtcMarketCard,
    btcRealtimeLastTick: btcPreviewMode === 'placeholder' ? null : Date.now(),
    btcRealtimeStatus: btcPreviewMode === 'placeholder' ? 'connecting' : 'live',
    cacheStockLogo: () => {},
    CheckCircle2,
    ChevronRight,
    db,
    deleteWatchlistItem: async (symbol) => {
      setHomeWatchlist((current) => current.filter((row) => row.symbol !== symbol));
      return { success: true };
    },
    displayStockName: (symbol, name, displayLanguage = language) => {
      const normalizedSymbol = String(symbol || '').trim().toUpperCase();
      if (normalizeLanguage(displayLanguage) === 'en') {
        return devStockNameEn[normalizedSymbol] || normalizedSymbol;
      }
      return name || normalizedSymbol;
    },
    earningsCalendarEvents: previewEarningsCalendarEvents,
    earningsCalendarNow,
    earningsCalendarRequest: earningsResumeSmoke || earningsLiveSmoke ? earningsCalendarRequest : null,
    earningsDetailDataOverride: earningsHoldingsDetailPreview
      ? mockTsmEarningsDetailData
      : earningsBaseDetailPreview ? mockEarningsBaseDetailData : mockEarningsDetailData,
    earningsDetailEvent: earningsHoldingsDetailPreview
      ? mockTsmEarningsDetailEvent
      : earningsBaseDetailPreview ? mockEarningsBaseDetailEvent : mockEarningsDetailEvent,
    closeEarningsDetail: () => setActiveTab('home'),
    fetchMarketMovers: async () => devMarketMoversFixture,
    fetchPnlBenchmarkRows: async ({ symbol: requestedSymbol = 'QQQ', from, to }) => {
      const rows = stockReturnRawRowsBySymbol[String(requestedSymbol || '').trim().toUpperCase()] || [];
      return rows
        .filter((row) => (!from || row.date >= from) && (!to || row.date <= to))
        .map((row) => ({ ...row }));
    },
    fetchPopularStockQuotes: async (symbols = []) => ({
      success: true,
      data: mockHomeWatchlist.filter((row) => symbols.includes(row.symbol)),
    }),
    fetchRealtimePrices: async () => {},
    fetching: false,
    fgi: 32,
    fgiDataDate: '2026-07-03T00:00:00.000Z',
    fgiMonth: 28,
    fgiPrev: 34,
    fgiWeek: 36,
    fgiYear: 42,
    fmtPct: null,
    homeMarginPreview,
    homeMarginScenarioPreview: Number.isFinite(homeMarginScenarioPreview) ? homeMarginScenarioPreview : undefined,
    homeWatchlist,
    indices: previewMarketIndices,
    marketIndices: previewMarketIndices,
    investmentSummary: {
      activePositions: previewActivePositions,
      positions: [],
      positionsMarketValue: 3365931,
      cashUsd: 0,
      totalAssetsUsd: 3365931,
      totalAssetsCny: 24285192.165,
      todayPnl: -1485.6,
      todayPnlPct: -0.0004,
      cumulativePnl: 118433.6,
      cumulativePnlPct: 0.0365,
      holdingStockCount: 6,
      sellTradeCount: 0,
      usdRate: 7.215,
    },
    language,
    Loader2,
    logoCache: {},
    marginStatus: { currentMargin: previewMarginDebtUsd, marginLimit: 0 },
    marginStatusReady: true,
    marketColorMode,
    newStock,
    openHomeMarginRisk: () => setActiveTab('home-margin-risk'),
    closeHomeMarginRisk: () => setActiveTab('home'),
    openPnlReport: () => setActiveTab('pnl-report'),
    closePnlReport: () => setActiveTab('home'),
    openStockDetail: () => setActiveTab('stock-detail'),
    closeStockDetail: () => setActiveTab('trades'),
    pnlReportTooltipDate,
    portfolioCurrencyMode: homeCurrencyMode,
    quoteRows: freshnessPreviewMode === 'locked' ? [] : homeWatchlist,
    RefreshCw,
    reorderWatchlist: async (next) => {
      setHomeWatchlist(next);
      return { success: true };
    },
    saveMarginDebt: async (nextDebtUsd) => {
      setPreviewMarginDebtUsd(Number(nextDebtUsd));
      return { currentMargin: Number(nextDebtUsd), marginLimit: 0 };
    },
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setLanguage,
    setNewStock,
    setPortfolioCurrencyMode: setHomeCurrencyMode,
    setShowAddStock,
    showAddStock,
    stockDetailSymbol: 'NVDA',
    stockDetailInitialRange,
    stockReturnComparisonMethodPreview,
    stockReturnComparisonSharePreview,
    stockReturnComparisonTooltipPreview,
    stockReturnComparisonVisualPreview: true,
    stockTrades: stockDetailTrades,
    stockFreshnessStartedAt: freshnessPreviewMode === 'locked' ? Date.now() : 0,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'dev-visual-preview-token', user: { id: earningsResumeSmoke ? earningsResumeUserIdRef.current : 'dev-user' } } } }),
      },
    },
    usdRate: USD_RATE,
    vix: 15.8,
    vixDataDate: '2026-07-03T00:00:00.000Z',
    vixSignal: 'calm',
    watchlist: homeWatchlist,
  };

  const watchlistDetailCtx = {
    ...homeCtx,
    watchlistStockDetailSymbol: watchlistFundCompositionPreview ? 'TQQQ' : 'NVDA',
    closeWatchlistStockDetail: () => setActiveTab('home'),
    watchlist: [{ symbol: watchlistFundCompositionPreview ? 'TQQQ' : 'NVDA', name: watchlistFundCompositionPreview ? 'TQQQ' : '英伟达', targetPriceUsd: watchlistDetailTargetUsd }],
    homeWatchlist: [{ symbol: watchlistFundCompositionPreview ? 'TQQQ' : 'NVDA', name: watchlistFundCompositionPreview ? 'TQQQ' : '英伟达', price: 202.81 }],
    quoteRows: [{ symbol: watchlistFundCompositionPreview ? 'TQQQ' : 'NVDA', name: watchlistFundCompositionPreview ? 'TQQQ' : '英伟达', price: 202.81 }],
    investmentSummary: {
      positions: [{
        symbol: 'NVDA',
        name: '英伟达',
        heldShares: 500,
        avgCost: 195.3,
        remainingCost: 97650,
      }],
      totalAssetsUsd: 799724.76,
      usdRate: USD_RATE,
    },
    stockTrades: [
      { id: 'watch-detail-1', symbol: 'NVDA', side: 'buy', date: '2026-06-12', shares: 200, price: 198.45 },
      { id: 'watch-detail-2', symbol: 'NVDA', side: 'buy', date: '2026-05-20', shares: 150, price: 191.2 },
      { id: 'watch-detail-3', symbol: 'NVDA', side: 'sell', date: '2026-04-02', shares: 100, price: 178.66 },
    ],
    saveWatchlistStockTarget: async (_symbol, targetPriceUsd) => {
      setWatchlistDetailTargetUsd(Number(targetPriceUsd));
      return { success: true, targetPriceUsd: Number(targetPriceUsd) };
    },
    watchlistStockDetailDataOverride: mockWatchlistStockDetailData,
    watchlistStockDetailEarningsOverride: mockWatchlistStockDetailEarnings,
    watchlistStockDetailFundCompositionOverride: watchlistFundCompositionPreview
      ? mockTqqqFundComposition
      : undefined,
    watchlistStockDetailChartTooltipOpen: watchlistDetailTooltipPreview,
    watchlistStockDetailFocusSection: watchlistDetailFocusSection,
    watchlistStockDetailTargetEditorOpen: watchlistDetailTargetEditorOpen,
  };

  const waveTrackerCtx = {
    ...homeCtx,
    closeWaveTracker: () => setActiveTab('trades'),
    closeCommunityCompetition: () => setActiveTab('trades'),
    db,
    fetchPopularStockQuotes: async (symbols = []) => ({
      success: true,
      data: mockSwingQuotes.filter((row) => symbols.includes(row.symbol)),
    }),
    portfolioCurrencyMode: tradeCurrencyMode,
    quoteRows: mockSwingQuotes,
    showConfirm: showPreviewConfirm,
    syncSwingWaveQuoteRows: noop,
    user: { id: 'dev-user', email: 'preview@example.com' },
  };

  const tradePositionsMarketValue = mockTradeActivePositions.reduce((sum, item) => sum + Number(item.marketValue || 0), 0);
  const tradeHoldingPnl = mockTradeActivePositions.reduce((sum, item) => sum + Number(item.holdingPnl || 0), 0);
  const tradeTodayPnl = mockTradeActivePositions.reduce((sum, item) => sum + Number(item.todayPnl || 0), 0);
  const tradeQuoteRows = mockTradeActivePositions.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    price: item.currentPrice,
    high: item.high,
    week52High: item.high,
  }));
  const tradesCtx = {
    addTrade: async () => {},
    AlertCircle,
    calcCostBasis,
    calmRoomActiveCount: 1,
    calmRoomAvgActiveDays: 12,
    calmRoomCompletedCount: 1,
    cacheStockLogo: noop,
    CheckCircle2,
    costBasisActiveSymbol,
    costBasisData,
    communityCompetitionClient,
    communityCompetitionNow,
    db,
    deleteStockTradeRecord: async () => {},
    disableCommunityCompetitionCache: !competitionResumeSmoke,
    editingNoteId,
    expandedTrades,
    expandedWaves,
    fetching: false,
    fetchRealtimePrices: async () => {},
    fmt,
    investmentSummary: {
      activePositions: mockTradeActivePositions,
      positions: mockTradeActivePositions,
      positionsMarketValue: tradePositionsMarketValue,
      totalAssetsUsd: tradePositionsMarketValue,
      todayPnl: tradeTodayPnl,
      todayPnlPct: tradePositionsMarketValue > 0 ? tradeTodayPnl / tradePositionsMarketValue : 0,
      cumulativePnl: tradeHoldingPnl,
      cumulativePnlPct: 0.064,
      holdingPnl: tradeHoldingPnl,
      holdingStockCount: mockTradeActivePositions.length,
      sellTradeCount: 0,
      hasTodayPnl: true,
      usdRate: USD_RATE,
    },
    language,
    logoCache: {},
    lookupStatus: tradeLookupStatus,
    marginStatus: { currentMargin: previewMarginDebtUsd, marginLimit: 0 },
    marginStatusReady: true,
    marketColorMode,
    newTrade,
    closeCommunityCompetition: () => setActiveTab('trades'),
    openCommunityProfileSettings: () => {
      setCommunityProfileFocusRequest((current) => current + 1);
      setActiveTab('settings');
    },
    openPnlReport: () => setActiveTab('pnl-report'),
    openHomeMarginRisk: () => setActiveTab('home-margin-risk'),
    openStockDetail: noop,
    openWaveTracker: () => setActiveTab('wave-tracker'),
    openCommunityCompetition: () => setActiveTab('community-competition'),
    portfolioCurrencyMode: tradeCurrencyMode,
    Plus,
    quoteRows: tradeQuoteRows,
    RefreshCw,
    requestDeleteLegacyTrade,
    setCostBasisActiveSymbol,
    setCostBasisData,
    setCostBasisNewSymbol,
    setCostBasisNewTrade,
    setEditingNoteId,
    setExpandedTrades,
    setExpandedWaves,
    setLookupStatus: setTradeLookupStatus,
    setMarketColorMode,
    setNewTrade,
    setPortfolioCurrencyMode: setTradeCurrencyMode,
    setShowAddTrade,
    setShowCostBasisAdd,
    setShowCostBasisTrade,
    setTradeEntryScope,
    setWaveNotes,
    showAddTrade,
    showConfirm: showPreviewConfirm,
    stockFreshnessStartedAt: 0,
    stockTrades: [mockTodayStockTrade, ...mockPnlStockTrades],
    displayStockName: (symbol, name, displayLanguage = language) => {
      const normalizedSymbol = String(symbol || '').trim().toUpperCase();
      if (normalizeLanguage(displayLanguage) === 'en') return devStockNameEn[normalizedSymbol] || normalizedSymbol;
      return name || normalizedSymbol;
    },
    tradeEntryScope,
    tradeSubmitting: false,
    trades: mockWaveTrades,
    usdRate: USD_RATE,
    user: {
      id: competitionResumeSmoke ? competitionResumeUserIdRef.current : 'dev-user',
      email: 'preview@example.com',
    },
    watchlist: tradeQuoteRows,
    waveNotes,
    wavesByStock: mockWavesByStock,
  };

  const reviewCtx = {
    BookOpen,
    Calendar,
    ChevronDown,
    ChevronUp,
    db,
    DisciplineModal: (props) => <DevModal title={props.initial?.isEdit ? t(language, 'review.editDiscipline', '编辑心得') : t(language, 'review.addDiscipline', '添加心得')} onCancel={props.onCancel} />,
    disciplines,
    Edit2,
    editingDisciplineId,
    editingLogId,
    editYearlyActualId,
    expandedDisciplines,
    filterLevel,
    investmentPlan,
    lastSubmitRef,
    LogModal: (props) => <DevModal title={props.onDelete ? t(language, 'review.editReview', '编辑复盘') : t(language, 'review.addReview', '写复盘')} onCancel={props.onCancel} />,
    marketColorMode,
    reviewLogs,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditYearlyActualId,
    setExpandedDisciplines,
    setFilterLevel,
    setInvestmentPlan,
    setReviewLogs,
    setShowAddDiscipline,
    setShowAddLog,
    setShowAllDisciplines,
    setShowAllLogs,
    setShowAllYears,
    setShowPlanSettings,
    setYearlyActuals,
    showAddDiscipline,
    showAddLog,
    showAllDisciplines,
    showAllLogs,
    showAllYears,
    showConfirm: showPreviewConfirm,
    showPlanSettings,
    Target,
    Pin,
    Trash2,
    usdRate: USD_RATE,
    X,
    YearlyActualModal: (props) => <DevModal title={t(language, 'review.actualDataTitle', '{{year}} 年实际数据', { year: props.year })} onCancel={props.onCancel} />,
    yearlyActuals,
  };

  const settingsCtx = {
    accountManager: {
      list: async () => [
        { userId: 'dev-user', email: 'preview@example.com', lastUsedAt: Date.now() },
        { userId: 'dev-user-2', email: 'long.account.name@example.com', lastUsedAt: Date.now() - 1000 },
      ],
      switch: async () => {},
      remove: async (userId) => (userId === 'dev-user-2'
        ? [{ userId: 'dev-user', email: 'preview@example.com', lastUsedAt: Date.now() }]
        : []),
    },
    changelogExpanded,
    communityProfileFocusRequest,
    db,
    language,
    marketColorMode,
    newPwd,
    onAddAccount: noop,
    onLogout: noop,
    pwdLoading,
    pwdMsg,
    setChangelogExpanded,
    setLanguage,
    setMarketColorMode,
    setNewPwd,
    setPwdLoading,
    setPwdMsg,
    setShowChangePassword,
    showChangePassword,
    showConfirm: showPreviewConfirm,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'dev-visual-preview-token' } } }),
        updateUser: async () => ({ data: { user: { id: 'dev-user' } }, error: null }),
      },
    },
    user: { id: 'dev-user', email: 'preview@example.com' },
  };

  const nav = [
    { id: 'home', label: t(language, 'nav.home', '首页'), icon: Home },
    { id: 'trades', label: t(language, 'nav.trades', '交易'), icon: ListChecks },
    { id: 'analysis', label: t(language, 'nav.analysis', '资产'), icon: Wallet },
    { id: 'review', label: t(language, 'nav.review', '目标'), icon: Target },
    { id: 'settings', label: t(language, 'nav.settings', '设置'), icon: Settings },
  ];

  return (
    <div
      className={`min-h-screen bg-[#05070b] text-white ${activeTab === 'pnl-report' ? 'pb-0' : 'pb-24'} ${['pnl-report', 'stock-detail', 'community-competition', 'earnings-detail'].includes(activeTab) ? 'px-0' : 'px-4'}`}
      style={{ paddingTop: ['home-margin-risk', 'wave-tracker', 'community-competition', 'watchlist-stock-detail', 'earnings-detail'].includes(activeTab) ? 0 : 'calc(1rem + env(safe-area-inset-top))' }}
    >
      <Suspense fallback={<div className="py-12 text-center text-sm text-white/45">加载本地预览...</div>}>
        {activeTab === 'pnl-report'
          ? <PnlReportPage ctx={homeCtx} />
          : activeTab === 'home-margin-risk'
          ? <HomeMarginRiskPage ctx={homeCtx} />
          : activeTab === 'stock-detail'
          ? <StockDetailPage ctx={homeCtx} />
          : activeTab === 'watchlist-stock-detail'
          ? <WatchlistStockDetailPage ctx={watchlistDetailCtx} />
          : activeTab === 'wave-tracker'
          ? <WaveTrackerPage ctx={waveTrackerCtx} />
          : activeTab === 'community-competition'
          ? <CommunityCompetitionPage ctx={tradesCtx} />
          : activeTab === 'earnings-detail'
          ? <EarningsDetailPage ctx={homeCtx} />
          : activeTab === 'home'
          ? <HomeTab ctx={homeCtx} />
          : activeTab === 'trades'
          ? <TradesTab
              ctx={tradesCtx}
              initialToolPanel={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('legacyWaveTool') === '1' ? 'waves' : ''}
            />
          : activeTab === 'settings'
          ? <SettingsTab ctx={settingsCtx} />
          : (activeTab === 'review' ? <ReviewTab ctx={reviewCtx} /> : <AnalysisTab ctx={ctx} />)}
      </Suspense>

      <ConfirmModal
        modal={previewConfirmModal}
        submitting={previewConfirmSubmitting}
        onCancel={closePreviewConfirm}
        onConfirm={submitPreviewConfirm}
      />

      {activeTab !== 'pnl-report' && (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#070a0f] shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-5">
            {nav.map(tab => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab
                || (activeTab === 'home-margin-risk' && tab.id === 'home')
                || (activeTab === 'watchlist-stock-detail' && tab.id === 'home')
                || (activeTab === 'earnings-detail' && tab.id === 'home')
                || (['stock-detail', 'wave-tracker', 'community-competition'].includes(activeTab) && tab.id === 'trades');
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center py-2 transition ${isActive ? 'text-[#f6a524]' : 'text-white/40'}`}
                  type="button"
                >
                  <Icon className={`mb-0.5 h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default function DevVisualPreview() {
  const preview = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('preview');

  if (preview === 'wave-v2-prototype') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#05070b] py-12 text-center text-sm text-white/45">加载波段原型...</div>}>
        <WaveTrackerPrototype />
      </Suspense>
    );
  }

  if (preview === 'settings-redesign-prototype') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#05070b] py-12 text-center text-sm text-white/45">加载设置原型...</div>}>
        <SettingsRedesignPrototype />
      </Suspense>
    );
  }

  if (preview === 'watchlist-stock-detail-prototype') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#05070b] py-12 text-center text-sm text-white/45">加载自选股票详情原型...</div>}>
        <WatchlistStockDetailPrototype />
      </Suspense>
    );
  }

  if (['earnings-segments-prototype', 'earnings-base-prototype', 'earnings-holdings-prototype'].includes(preview)) {
    return <StandardDevVisualPreview initialTab="earnings-detail" />;
  }

  return <StandardDevVisualPreview initialTab={preview === 'wave-v2' ? 'wave-tracker' : preview === 'community-competition' ? 'community-competition' : ''} />;
}
