// Local preview only. Every price and market reading in this file is invented.
// Synthetic sessions follow weekdays and the listed full-day US market holidays;
// this fixture is not a historical market-data source or a trading calendar API.
export { deriveObservation, selectObservationRows, getSamePeriodReturn } from '../lib/drawdownObservationModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const AS_OF_DATE = '2026-09-08';
const FIXTURE_START_DATE = '2025-07-01';
const FIXTURE_HOLIDAYS = new Set([
  '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
]);

function dateTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function fixtureSessions() {
  const dates = [];
  for (let timestamp = dateTimestamp(FIXTURE_START_DATE); timestamp <= dateTimestamp(AS_OF_DATE); timestamp += DAY_MS) {
    const day = new Date(timestamp);
    const date = day.toISOString().slice(0, 10);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !FIXTURE_HOLIDAYS.has(date)) dates.push(date);
  }
  return dates;
}

const FIXTURE_SESSIONS = fixtureSessions();

function buildSyntheticPoints({ high, depth, todayPct, peakDate, troughRatio, phase, continuingDecline = false }) {
  const currentRatio = 1 - depth / 100;
  const previousRatio = currentRatio / (1 + todayPct / 100);
  const anchors = [
    ['2025-07-01', 0.73 + phase * 0.003],
    ['2025-08-15', 0.78 + phase * 0.002],
    ['2025-10-06', 0.75 + phase * 0.002],
    ['2025-11-21', 0.85 - phase * 0.002],
    ['2026-01-16', 0.88 - phase * 0.001],
    ['2026-02-27', 0.82 + phase * 0.002],
    ['2026-04-02', 0.91 - phase * 0.001],
    ['2026-05-08', 0.94 - phase * 0.001],
    [peakDate, 1],
    ['2026-06-29', 1 - (1 - currentRatio) * 0.40],
    ['2026-07-17', 1 - (1 - currentRatio) * 0.23],
    ['2026-08-03', 1 - (1 - troughRatio) * 0.83],
    ['2026-08-18', troughRatio],
    ['2026-08-28', continuingDecline ? currentRatio + 0.045 : currentRatio - 0.008],
    ['2026-09-04', previousRatio],
    [AS_OF_DATE, currentRatio],
  ].map(([date, ratio]) => ({ date, ratio, timestamp: dateTimestamp(date) }));
  const anchorByDate = new Map(anchors.map((anchor) => [anchor.date, anchor.ratio]));
  let segment = 0;

  return FIXTURE_SESSIONS.map((date, index) => {
    const timestamp = dateTimestamp(date);
    while (segment < anchors.length - 2 && timestamp > anchors[segment + 1].timestamp) segment += 1;
    const left = anchors[segment];
    const right = anchors[segment + 1];
    const progress = (timestamp - left.timestamp) / (right.timestamp - left.timestamp);
    // Fixed sinusoids make small daily moves without randomness or changing runs.
    const ripple = Math.sin(Math.PI * progress)
      * (Math.sin(index * 1.17 + phase) * 0.004 + Math.sin(index * 0.39 + phase) * 0.006);
    let ratio = anchorByDate.has(date)
      ? anchorByDate.get(date)
      : left.ratio + (right.ratio - left.ratio) * progress + ripple;
    if (!anchorByDate.has(date)) {
      ratio = Math.min(ratio, 0.9995);
      if (date > peakDate) {
        ratio = Math.max(ratio, (continuingDecline ? currentRatio : troughRatio) + 0.0005);
      }
    }
    return Object.freeze({ date, close: Number((high * ratio).toFixed(4)) });
  });
}

const INSTRUMENT_CONFIGS = [
  { symbol: 'SPY', name: '标普 500 ETF', kind: 'etf', high: 640, depth: 9.2, todayPct: 0.34, peakDate: '2026-06-09', troughRatio: 0.888 },
  { symbol: 'QQQ', name: '纳斯达克 100 ETF', kind: 'etf', high: 620, depth: 14.6, todayPct: 0.85, peakDate: '2026-06-12', troughRatio: 0.815 },
  { symbol: 'AAPL', name: '苹果', kind: 'stock', high: 260, depth: 5, todayPct: 0.25, peakDate: '2026-06-11', troughRatio: 0.938 },
  { symbol: 'MSFT', name: '微软', kind: 'stock', high: 540, depth: 8.2, todayPct: -0.35, peakDate: '2026-06-15', troughRatio: 0.902 },
  { symbol: 'AMZN', name: '亚马逊', kind: 'stock', high: 250, depth: 18, todayPct: 0.45, peakDate: '2026-06-10', troughRatio: 0.790 },
  { symbol: 'GOOGL', name: '谷歌', kind: 'stock', high: 230, depth: 13.8, todayPct: 0.30, peakDate: '2026-06-12', troughRatio: 0.830 },
  { symbol: 'META', name: 'Meta', kind: 'stock', high: 800, depth: 12.8, todayPct: 1.20, peakDate: '2026-06-09', troughRatio: 0.847 },
  { symbol: 'NVDA', name: '英伟达', kind: 'stock', high: 200, depth: 25, todayPct: 2.30, peakDate: '2026-06-11', troughRatio: 0.680 },
  { symbol: 'TSLA', name: '特斯拉', kind: 'stock', high: 450, depth: 37, todayPct: -1.90, peakDate: '2026-06-10', troughRatio: 0.700, continuingDecline: true },
  { symbol: 'AVGO', name: '博通', kind: 'stock', high: 350, depth: 23, todayPct: -0.80, peakDate: '2026-06-08', troughRatio: 0.731 },
];
const HOLDING_SYMBOLS = new Set(['NVDA', 'MSFT', 'META', 'AVGO']);

export const DRAWDOWN_PREVIEW = Object.freeze({
  source: 'SYNTHETIC',
  asOfDate: AS_OF_DATE,
  vix: 24.8,
  instruments: Object.freeze(INSTRUMENT_CONFIGS.map((config, phase) => Object.freeze({
    symbol: config.symbol,
    name: config.name,
    kind: config.kind,
    inWatchlist: config.kind === 'stock',
    inHoldings: HOLDING_SYMBOLS.has(config.symbol),
    points: Object.freeze(buildSyntheticPoints({ ...config, phase })),
  }))),
});
