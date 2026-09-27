import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';

// Local design fixtures only: all readings and prices below are invented.
// These scenarios illustrate a proposed VIX / VIX3M interpretation; they are
// neither historical market data nor a production risk or trading model.
const AS_OF_DATE = '2026-09-25';
const SESSION_COUNT = 120;
const DAY_MS = 86_400_000;

function syntheticSessions() {
  const dates = [];
  let timestamp = Date.parse(`${AS_OF_DATE}T00:00:00Z`);
  while (dates.length < SESSION_COUNT) {
    const day = new Date(timestamp);
    const date = day.toISOString().slice(0, 10);
    if (![0, 6].includes(day.getUTCDay()) && !isRegularNyseHoliday(date)) dates.unshift(date);
    timestamp -= DAY_MS;
  }
  return dates;
}

const DATES = syntheticSessions();

// [session index, VIX, VIX / VIX3M, SPY, QQQ]. Earlier history is shared so that
// switching scenarios makes the different endings easy to compare visually.
const COMMON_ANCHORS = [
  [0, 18.4, 0.93, 580, 490],
  [10, 16.2, 0.87, 590, 504],
  [19, 20.7, 0.96, 572, 482],
  [27, 17.9, 0.91, 586, 503],
  [36, 15.6, 0.85, 605, 526],
  [44, 16.9, 0.89, 601, 518],
  [53, 22.1, 0.98, 584, 492],
  [61, 18.2, 0.92, 596, 513],
  [69, 16.1, 0.87, 610, 535],
  [77, 17.3, 0.90, 604, 523],
  [89, 15.9, 0.86, 617, 545],
];

function buildPoints(ending) {
  const anchors = [...COMMON_ANCHORS, ...ending];
  let segment = 0;
  return DATES.map((date, index) => {
    while (segment < anchors.length - 2 && index > anchors[segment + 1][0]) segment += 1;
    const left = anchors[segment];
    const right = anchors[segment + 1];
    const progress = (index - left[0]) / (right[0] - left[0]);
    const envelope = Math.sin(progress * Math.PI);
    const ripple = Math.sin(index * 1.81) * 0.55 + Math.sin(index * 0.73) * 0.45;
    const interpolate = (column, amplitude, decimals = 2) => Number((
      left[column] + (right[column] - left[column]) * progress + envelope * ripple * amplitude
    ).toFixed(decimals));
    return {
      date,
      vix: interpolate(1, 0.75),
      ratio: interpolate(2, 0.014, 3),
      SPY: interpolate(3, -2.8),
      QQQ: interpolate(4, -4.4),
    };
  });
}

const CALM_POINTS = buildPoints([
  [98, 18.6, 0.93, 607, 531],
  [107, 16.4, 0.902, 621, 553],
  [108, 15.9, 0.88, 623, 556],
  [114, 14.8, 0.83, 631, 568],
  [119, 15.2, 0.84, 629.4, 565.2],
]);

const CAUTION_POINTS = buildPoints([
  [98, 17.7, 0.89, 613, 539],
  [106, 15.7, 0.85, 626, 557],
  [112, 16.8, 0.887, 623, 552],
  [113, 17.8, 0.904, 620, 547],
  [116, 19.5, 0.956, 613, 536],
  [119, 19.1, 0.95, 615.2, 538.4],
]);

const STRESS_POINTS = buildPoints([
  [99, 16.8, 0.89, 625, 556],
  [108, 18.7, 0.93, 618, 544],
  [114, 20.6, 0.97, 609, 529],
  [116, 22.3, 0.98, 602, 518],
  [117, 24.1, 0.995, 593, 504],
  [118, 26.2, 1.025, 584, 491],
  [119, 26.8, 1.04, 581.6, 486.3],
]);

const PERSISTENT_POINTS = buildPoints([
  [97, 20.7, 0.96, 609, 531],
  [101, 23.8, 0.99, 599, 515],
  [102, 25.1, 1.02, 593, 506],
  [108, 31.4, 1.16, 565, 465],
  [113, 27.2, 1.075, 578, 481],
  [117, 30.1, 1.145, 558, 454],
  [119, 29.4, 1.12, 562.8, 459.5],
]);

const RECOVERY_POINTS = buildPoints([
  [96, 22.7, 0.98, 604, 524],
  [100, 28.1, 1.11, 580, 491],
  [105, 25.2, 1.05, 590, 503],
  [109, 32.4, 1.18, 568, 478],
  [114, 28.6, 1.13, 572, 484],
  [116, 25.3, 1.07, 564, 474],
  [117, 23.1, 1.02, 560, 470],
  [118, 21.7, 0.97, 564, 476],
  [119, 20.4, 0.94, 565.8, 478.6],
]);

// Each fixture is fed into the real six-dimensional model. No result labels
// are injected into the production page or used as a simulated fallback.
const ELEVATED_POINTS = buildPoints([
  [97, 20.7, 0.92, 609, 531], [104, 24.1, 0.97, 598, 516],
  [111, 25.0, 0.985, 592, 507], [116, 24.8, 0.975, 590, 504],
  [117, 24.7, 0.972, 592, 507], [118, 24.8, 0.974, 591, 505],
  [119, 24.6, 0.97, 593, 508],
]);
const EXTREME_POINTS = buildPoints([
  [97, 20.7, 0.96, 609, 531], [101, 26.1, 1.04, 593, 506],
  [105, 32.5, 1.16, 574, 480], [111, 35.0, 1.21, 552, 449],
  [116, 34.0, 1.18, 545, 440], [117, 34.1, 1.181, 546, 442],
  [118, 34.0, 1.18, 544, 438], [119, 34.2, 1.182, 541, 434],
]);
const EASING_POINTS = buildPoints([
  [97, 20.7, 0.96, 609, 531], [102, 30.8, 1.13, 582, 490],
  [109, 40.5, 1.23, 552, 446], [112, 42.0, 1.24, 541, 431],
  [113, 43.0, 1.25, 538, 426], [114, 41.0, 1.23, 539, 429],
  [115, 38.5, 1.20, 542, 433], [116, 35.0, 1.16, 546, 438],
  [117, 32.0, 1.12, 550, 444], [118, 31.4, 1.10, 552, 447],
  [119, 30.8, 1.08, 555, 452],
]);
const HIGH_VIX_FORWARD_POINTS = EASING_POINTS.map((point, index) => index >= 117
  ? { ...point, vix: [34.5, 33.5, 33.0][index - 117], ratio: [0.995, 0.98, 0.96][index - 117] }
  : point);
const PRICE_DIVERGENCE_POINTS = CAUTION_POINTS.map((point, index) => index >= 100
  ? { ...point, SPY: 620 - (index - 100) * 1.8, QQQ: 480 + (index - 100) * 2.1 }
  : point);

export const VIX_RISK_SCENARIOS = [
  { id: 'calm', label: { zh: '低波动', en: 'Low volatility' }, points: CALM_POINTS },
  { id: 'caution', label: { zh: '常态波动', en: 'Normal volatility' }, points: CAUTION_POINTS },
  { id: 'elevated', label: { zh: '波动升高', en: 'Elevated volatility' }, points: ELEVATED_POINTS },
  { id: 'stress', label: { zh: '高压状态 · 升温', en: 'High stress · rising' }, points: STRESS_POINTS },
  { id: 'extreme', label: { zh: '极端压力 · 维持', en: 'Extreme stress · holding' }, points: EXTREME_POINTS },
  { id: 'easing', label: { zh: '极端压力 · 缓解', en: 'Extreme stress · easing' }, points: EASING_POINTS },
  { id: 'persistent', label: { zh: '高压状态 · 持续倒挂', en: 'High stress · prolonged inversion' }, points: PERSISTENT_POINTS },
  { id: 'recovery', label: { zh: '常态波动 · 缓解', en: 'Normal volatility · easing' }, points: RECOVERY_POINTS },
  { id: 'high_vix_forward', label: { zh: 'VIX 高位 · 未倒挂', en: 'High VIX · not inverted' }, points: HIGH_VIX_FORWARD_POINTS },
  { id: 'price_divergence', label: { zh: 'SPY / QQQ 价格分化', en: 'Diverging price behavior' }, points: PRICE_DIVERGENCE_POINTS },
  { id: 'short_history', label: { zh: '极端压力 · 历史不足', en: 'Extreme stress · short history' }, points: EXTREME_POINTS, termHistoryLimit: 4 },
  { id: 'term_gap', label: { zh: '配对历史缺口', en: 'Term history gap' }, points: EXTREME_POINTS, missingTermIndexes: [115] },
  { id: 'spy_missing', label: { zh: '仅 SPY 数据缺失', en: 'Only SPY missing' }, points: PRICE_DIVERGENCE_POINTS, missingBenchmark: 'SPY' },
  { id: 'unavailable', label: { zh: '最新配对缺失', en: 'Latest pair missing' }, points: STRESS_POINTS.map((point, index) => index === STRESS_POINTS.length - 1 ? { ...point, vix: null, ratio: null } : point), missing: true },
].map(scenario => ({ demo: true, missing: false, asOfDate: AS_OF_DATE, ...scenario }));
