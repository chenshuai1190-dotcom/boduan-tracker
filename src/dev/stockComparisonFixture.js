import { INVESTMENT_SYMBOL_PRESETS } from '../lib/investmentSymbolPresets.js';
import { wilderRsiSeries } from '../lib/wilderRsi.js';
import { STOCK_RSI_RULES } from '../lib/stockRsiConfig.js';

// Illustrative, deterministic prices for a local design preview only.
// These values are not downloaded quotes, historical facts, or backtest results.
const START_DATE = '2021-01-04';
const END_DATE = '2026-10-26';
const SYMBOL_SHAPES = {
  QQQ: [280, 0.76, 0.9], SPY: [360, 0.5, 0.62], TQQQ: [28, 1.35, 2.25],
  NVDA: [13, 2.4, 1.55], TSM: [100, 1.1, 1.3], AAPL: [125, 0.39, 0.95], MSFT: [215, 0.83, 0.91],
  GOOGL: [85, 0.95, 1.13], AMZN: [160, 0.27, 1.2], META: [245, 0.97, 1.5],
  TSLA: [210, 0.37, 2.0], AVGO: [44, 1.94, 1.4], VGT: [300, 0.89, 1.0],
  SMH: [110, 1.25, 1.45],
};

function gaussian(value, center, spread) {
  return Math.exp(-((value - center) ** 2) / (2 * spread ** 2));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function demoDates() {
  const dates = [];
  for (let time = Date.parse(`${START_DATE}T00:00:00Z`); time <= Date.parse(`${END_DATE}T00:00:00Z`); time += 86_400_000) {
    const date = new Date(time);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

const dates = demoDates();
const marketRandom = seededRandom(20261026);
let marketNoise = 0;
const marketPath = dates.map((_, index) => {
  const progress = index / (dates.length - 1);
  marketNoise = marketNoise * 0.92 + (marketRandom() - 0.5) * 0.022;
  return -0.28 * gaussian(progress, 0.29, 0.065)
    - 0.16 * gaussian(progress, 0.74, 0.024)
    - 0.075 * gaussian(progress, 0.91, 0.017)
    + Math.sin(index * 0.043) * 0.022 + marketNoise;
});

const series = Object.fromEntries(INVESTMENT_SYMBOL_PRESETS.map((preset, stockIndex) => {
  const [base, growth, sensitivity] = SYMBOL_SHAPES[preset.symbol];
  const random = seededRandom(7401 + stockIndex * 997);
  let noise = 0;
  let initialLog = null;
  const rows = dates.map((date, index) => {
    const progress = index / (dates.length - 1);
    noise = noise * 0.95 + (random() - 0.5) * 0.018 * sensitivity;
    const stockCycle = Math.sin(index * 0.009 + stockIndex * 1.31) * 0.07
      + Math.sin(index * 0.019 + stockIndex * 0.81) * 0.027;
    const logPrice = growth * progress + sensitivity * marketPath[index] + stockCycle + noise;
    initialLog ??= logPrice;
    return { date, close: Math.round(base * Math.exp(logPrice - initialLog) * 100) / 100 };
  });
  const values = wilderRsiSeries(rows, STOCK_RSI_RULES.RSI_PERIOD);
  return [preset.symbol, { ...preset, rsiPeriod: 6, rsiPriceBasis: 'adjusted_close',
    rows: rows.map((row, index) => ({ ...row, rsi6: index + 1 >= STOCK_RSI_RULES.RSI_WARMUP_CLOSES ? values[index] : null })) }];
}));

export const STOCK_COMPARISON_DEMO = Object.freeze({
  synthetic: true,
  sourceLabel: '演示数据 · 非真实行情',
  sourceLabelEn: 'Demo data · Not actual market prices',
  startDate: START_DATE,
  asOfDate: END_DATE,
  series,
});
