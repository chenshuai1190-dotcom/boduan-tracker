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

const evidence = (zhLabel, enLabel, zhValue, enValue, status) => ({
  label: { zh: zhLabel, en: enLabel },
  value: { zh: zhValue, en: enValue },
  status,
});

export const VIX_RISK_SCENARIOS = [
  {
    id: 'calm',
    label: { zh: '低波动', en: 'Low volatility' },
    title: { zh: '低波动，保持节奏', en: 'Volatility is calm' },
    description: { zh: 'VIX 15.2，比率 0.84。近期波动预期低于三个月水平，市场压力较低。', en: 'VIX is 15.2 and the ratio is 0.84. Near-term volatility expectations are below the three-month level.' },
    guidance: { zh: '关注仓位是否偏离原定计划。低波动本身不代表价格便宜，也不意味着风险消失。', en: 'Review whether exposure still fits your plan. Low volatility alone does not imply attractive prices or an absence of risk.' },
    tone: 'calm',
    duration: 12,
    points: CALM_POINTS,
    evidence: [
      evidence('波动水平', 'Volatility level', 'VIX 15.2，低于 16', 'VIX 15.2, below 16', 'met'),
      evidence('期限比率', 'Term ratio', '0.84，低于 0.90', '0.84, below 0.90', 'met'),
      evidence('价格状态', 'Price context', '近期回撤较浅，趋势仍需跟踪', 'Recent pullbacks are shallow; keep monitoring', 'neutral'),
    ],
  },
  {
    id: 'caution',
    label: { zh: '常态偏谨慎', en: 'Cautious' },
    title: { zh: '压力抬升，保持谨慎', en: 'Pressure is rising' },
    description: { zh: 'VIX 19.1，比率 0.95。短期压力有所上升，期限结构尚未倒挂。', en: 'VIX is 19.1 and the ratio is 0.95. Short-term pressure is rising, while the term structure is not inverted.' },
    guidance: { zh: '检查集中持仓与近期新增风险敞口，结合价格结构评估后续调整。', en: 'Review concentration and recently added exposure, using price structure to inform any adjustment.' },
    tone: 'caution',
    duration: 6,
    points: CAUTION_POINTS,
    evidence: [
      evidence('波动水平', 'Volatility level', 'VIX 位于 16–22 区间', 'VIX is in the 16–22 range', 'met'),
      evidence('期限比率', 'Term ratio', '0.95，仍低于 1.00', '0.95, still below 1.00', 'met'),
      evidence('价格状态', 'Price context', '价格震荡，留意回撤是否扩大', 'Prices are choppy; watch for a deeper pullback', 'neutral'),
    ],
  },
  {
    id: 'stress',
    label: { zh: '恐慌升温', en: 'Stress rising' },
    title: { zh: '短期恐慌升温', en: 'Short-term stress is rising' },
    description: { zh: 'VIX 升至 26.8，比率来到 1.04。近期波动预期已高于三个月水平。', en: 'VIX has risen to 26.8 and the ratio is 1.04. Near-term volatility expectations now exceed the three-month level.' },
    guidance: { zh: '优先检查高波动持仓与集中风险，观察价格能否形成稳定结构。', en: 'Review volatile positions and concentration first, then watch for a more stable price structure.' },
    tone: 'stress',
    duration: 2,
    points: STRESS_POINTS,
    evidence: [
      evidence('期限倒挂', 'Term inversion', '比率上穿 1.00，已持续 2 日', 'Ratio crossed above 1.00, now for 2 sessions', 'met'),
      evidence('恐慌加速', 'Stress acceleration', '近 3 个交易日内 VIX 突破 25', 'VIX crossed above 25 within 3 sessions', 'met'),
      evidence('价格确认', 'Price confirmation', '价格仍在回落，等待止跌迹象', 'Prices are still falling; stabilization pending', 'pending'),
    ],
  },
  {
    id: 'persistent',
    label: { zh: '持续压力', en: 'Persistent pressure' },
    title: { zh: '压力仍在持续', en: 'Pressure persists' },
    description: { zh: '比率连续 18 个交易日高于 1，当前为 1.12。VIX 29.4，短期压力仍未解除。', en: 'The ratio has stayed above 1 for 18 sessions and is now 1.12. VIX is 29.4; short-term pressure remains.' },
    guidance: { zh: '评估现有风险承受范围，关注重要价格位置与持续止跌迹象，避免把单日反弹视为趋势反转。', en: 'Review risk tolerance and key price levels. Look for sustained stabilization before interpreting a one-day bounce as a reversal.' },
    tone: 'stress',
    duration: 18,
    points: PERSISTENT_POINTS,
    evidence: [
      evidence('压力持续', 'Persistence', '比率 > 1.00 已连续 18 日', 'Ratio > 1.00 for 18 consecutive sessions', 'met'),
      evidence('波动水平', 'Volatility level', 'VIX 29.4，仍处高位', 'VIX 29.4, still elevated', 'met'),
      evidence('价格确认', 'Price confirmation', '出现反弹，尚未形成稳定结构', 'A bounce has appeared; structure remains unsettled', 'pending'),
    ],
  },
  {
    id: 'recovery',
    label: { zh: '恐慌缓解', en: 'Stress easing' },
    title: { zh: '恐慌缓解，等待确认', en: 'Stress is easing' },
    description: { zh: '本轮比率曾升至 1.18，现已连续 2 日回到 1 以下。当前比率 0.94，VIX 20.4。', en: 'The ratio peaked at 1.18 in this episode and has been below 1 for 2 sessions. It is now 0.94, with VIX at 20.4.' },
    guidance: { zh: '情绪已缓解，价格仅反弹 2 日。继续观察是否守住近期低点，再结合原定计划评估调整。', en: 'Sentiment has eased, but prices have rebounded for only 2 sessions. Watch whether recent lows hold and reassess within your existing plan.' },
    tone: 'recovery',
    duration: 2,
    points: RECOVERY_POINTS,
    evidence: [
      evidence('压力峰值', 'Stress peak', '本轮比率最高 1.18', 'Episode ratio peaked at 1.18', 'met'),
      evidence('期限修复', 'Term normalization', '比率连续 2 日低于 1.00', 'Ratio below 1.00 for 2 consecutive sessions', 'met'),
      evidence('价格确认', 'Price confirmation', '低点后仅 2 日，等待第 3 日确认', 'Only 2 sessions since the low; awaiting a third', 'pending'),
    ],
  },
  {
    id: 'unavailable',
    label: { zh: '数据待更新', en: 'Awaiting data' },
    title: { zh: '数据待齐，暂不判断', en: 'Awaiting complete data' },
    description: { zh: '最新交易日的 VIX 与 VIX3M 配对数据尚未齐全。图表保留此前演示历史。', en: 'The latest session does not yet have a complete VIX and VIX3M pair. Earlier demonstration history remains visible.' },
    guidance: { zh: '等待同日收盘数据齐全后再判断。缺失数据不计为 0，也不沿用旧阶段作为最新结论。', en: 'Wait for aligned closing data. Missing readings are not zero, and an earlier phase is not treated as a current conclusion.' },
    tone: 'muted',
    duration: null,
    points: STRESS_POINTS.map((point, index) => index === STRESS_POINTS.length - 1
      ? { ...point, vix: null, ratio: null }
      : { ...point }),
    missing: true,
    evidence: [
      evidence('最新波动数据', 'Latest volatility', '未完成同日配对', 'Same-session pair incomplete', 'pending'),
      evidence('风险阶段', 'Risk phase', '暂不可判断', 'Currently unavailable', 'pending'),
      evidence('历史图表', 'Historical chart', '保留至上一完整交易日', 'Retained through the last complete session', 'neutral'),
    ],
  },
].map((scenario) => ({
  demo: true,
  missing: false,
  asOfDate: AS_OF_DATE,
  ...scenario,
}));
