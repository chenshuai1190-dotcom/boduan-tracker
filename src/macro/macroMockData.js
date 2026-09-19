// Phase 1 visual fixtures only. Every value, history and event date is simulated.
// This module has no provider, account, network or trading-engine dependencies.
const NOW = '2026-09-21T15:00:00Z';
const AS_OF = '2026-09-18';
const SOURCE = '模拟数据';

const GROUPS = {
  rates: ['us2y', 'us5y', 'us10y', 'us30y', 'spread10y2y', 'real10y'],
  energy: ['wti', 'brent', 'rbob', 'naturalGas'],
  expectations: ['be5y', 'be10y'],
  dollarGold: ['dxy', 'gold'],
  stress: ['vix', 'vvix', 'move', 'hyOas', 'igOas'],
  liquidity: ['fedBalance', 'tga', 'rrp', 'sofr', 'effr', 'netLiquidity'],
};

// Final values and changes are authored fixtures, not live financial estimates.
// Rate levels are percentage points (4.31 means 4.31%); rate changes are bp.
const DEFINITIONS = [
  ['us2y', '美国 2 年期国债', 4.02, 'percent', 3, 9, 18, 'bp', 82, '上行', '短端利率上行，演示政策利率预期对成长股估值的压力。'],
  ['us5y', '美国 5 年期国债', 4.18, 'percent', 6, 12, 21, 'bp', 86, '上行', '中期收益率抬升，演示折现率压力。'],
  ['us10y', '美国 10 年期国债', 4.31, 'percent', 8, 27, 30, 'bp', 90, '偏高', '长端利率处于模拟区间高位，成长股估值更敏感。'],
  ['us30y', '美国 30 年期国债', 4.52, 'percent', 7, 10, 17, 'bp', 79, '上行', '超长端收益率上行，演示期限溢价变化。'],
  ['spread10y2y', '10 年 / 2 年利差', 29, 'bp', 5, 18, 12, 'bp', 70, '正利差', '以 10 年减 2 年收益率计算，模拟曲线温和陡峭化。'],
  ['real10y', '10 年期实际利率', 2.07, 'percent', 6, 10, 16, 'bp', 88, '偏高', '实际利率上行，演示成长资产的实际折现率压力。'],
  ['wti', 'WTI 原油', 71.24, 'usd', 2.8, 3.6, 6.1, 'percent', 83, '上涨', '原油上涨，演示能源成本与通胀预期的联动。'],
  ['brent', 'Brent 原油', 77.16, 'usd', 1.08, 3.2, 5.4, 'percent', 80, '上涨', '布伦特原油与 WTI 同向，演示全球能源价格压力。'],
  ['rbob', 'RBOB 汽油', 2.16, 'usd', 0.82, 2.4, 4.7, 'percent', 75, '上涨', '美元 / 加仑的模拟价格，观察成品油传导。'],
  ['naturalGas', '天然气', 3.08, 'usd', -0.64, -1.8, 2.2, 'percent', 47, '平稳', '美元 / MMBtu 的模拟价格，不代表已实现通胀。'],
  ['be5y', '5 年期盈亏平衡通胀率', 2.42, 'percent', 2, 7, 12, 'bp', 81, '上行', '演示中期通胀补偿上升，含风险与流动性溢价。'],
  ['be10y', '10 年期盈亏平衡通胀率', 2.24, 'percent', 2, 17, 14, 'bp', 73, '上行', '演示长期通胀补偿变化，不等同于未来实际 CPI。'],
  ['dxy', '美元指数 DXY', 103.42, 'index', 0.31, 1.12, 2.04, 'percent', 78, '偏强', '美元走强，演示全球金融条件收紧的一个侧面。'],
  ['gold', '黄金', 2716.4, 'usd', -0.42, 0.68, 2.8, 'percent', 68, '高位震荡', '美元 / 盎司的模拟价格，辅助观察实际利率与避险需求。'],
  ['vix', 'VIX', 18.4, 'index', -6.1, -3.2, 1.4, 'percent', 42, '正常', '股票隐含波动率短期降温，模拟风险定价处于正常区间。'],
  ['vvix', 'VVIX', 88.9, 'index', -3.2, -2.8, 1.3, 'percent', 37, '正常', '波动率本身的不确定性短期回落，结合 VIX 观察。'],
  ['move', 'MOVE', 91.2, 'index', -1.8, -2.1, 1.6, 'percent', 44, '正常', '债券隐含波动率短期降温，模拟利率市场压力保持平稳。'],
  ['hyOas', '高收益债 OAS', 328, 'bp', -4, -9, 4, 'bp', 45, '正常', '信用利差以 bp 表示，模拟风险补偿平稳、短期小幅收窄。'],
  ['igOas', '投资级债 OAS', 91, 'bp', -1, -2, 1, 'bp', 48, '正常', '模拟高等级信用利差保持平稳，未设置交易触发器。'],
  ['fedBalance', '美联储资产负债表', 6480, 'usdBn', 0, -8, -29, 'usdBn', 36, '收缩', '单位为十亿美元；周度模拟序列在工作日上延续最近一次模拟值。', '周度'],
  ['tga', '美国财政部 TGA', 720, 'usdBn', 12, 28, 65, 'usdBn', 81, '回升', '单位为十亿美元；TGA 增加在此简化展示中减少净流动性。'],
  ['rrp', '隔夜逆回购 RRP', 180, 'usdBn', -4, -15, -42, 'usdBn', 28, '下降', '单位为十亿美元；RRP 下降在此简化展示中增加净流动性。'],
  ['sofr', 'SOFR', 4.34, 'percent', 1, 2, 3, 'bp', 64, '平稳', 'SOFR 是担保隔夜融资利率，使用百分比，不属于流动性余额。'],
  ['effr', 'EFFR', 4.33, 'percent', 0, 0, 0, 'bp', 50, '平稳', 'EFFR 是有效联邦基金利率，使用百分比，不属于流动性余额。'],
];

function mockWeekdays() {
  const dates = [];
  for (const day = new Date('2021-09-20T00:00:00Z'); day.toISOString().slice(0, 10) <= AS_OF; day.setUTCDate(day.getUTCDate() + 1)) {
    if (![0, 6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

const DATES = mockWeekdays();
const round = value => Number(value.toFixed(8));

function earlierValue(value, unit, change, changeUnit) {
  if (changeUnit === 'percent') return value / (1 + change / 100);
  if (changeUnit === 'bp' && unit === 'percent') return value - change / 100;
  return value - change;
}

function fixtureHistory(id, value, unit, changes, changeUnit) {
  const seed = [...id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  const amplitude = Math.max(Math.abs(value) * 0.12, unit === 'percent' ? 0.5 : 1);
  const history = DATES.map((date, index) => ({
    date,
    value: round(value + amplitude * (Math.sin((index + seed) / 59) * 0.65 + Math.sin((index + seed) / 173) * 0.35 - 0.2)),
  }));
  const anchors = id === 'fedBalance'
    ? [[22, value - changes[2]], [7, value - changes[1]], [2, value], [0, value]]
    : [[20, earlierValue(value, unit, changes[2], changeUnit)], [5, earlierValue(value, unit, changes[1], changeUnit)], [1, earlierValue(value, unit, changes[0], changeUnit)], [0, value]];
  for (let anchor = 0; anchor < anchors.length - 1; anchor += 1) {
    const [olderOffset, olderValue] = anchors[anchor];
    const [newerOffset, newerValue] = anchors[anchor + 1];
    for (let offset = olderOffset; offset >= newerOffset; offset -= 1) {
      const fraction = (olderOffset - offset) / (olderOffset - newerOffset);
      history[history.length - 1 - offset].value = round(olderValue + (newerValue - olderValue) * fraction);
    }
  }
  if (id === 'fedBalance') {
    // An authored Wednesday update is carried forward through the mock week.
    let lastPublished = history[0].value;
    for (const point of history) {
      if (new Date(`${point.date}T00:00:00Z`).getUTCDay() === 3) lastPublished = point.value;
      point.value = lastPublished;
    }
  }
  return history;
}

function createMetric(definition) {
  const [id, name, value, unit, change1d, change5d, change20d, changeUnit, percentile20d, status, explanation, frequency = '日度'] = definition;
  return {
    id, name, value, unit, change1d, changeUnit, change5d, change20d, percentile20d, status, explanation,
    // asOf identifies the simulated release; observationAsOf identifies the
    // common chart date, which may carry the latest weekly release forward.
    asOf: id === 'fedBalance' ? '2026-09-16' : AS_OF, observationAsOf: AS_OF, frequency, source: SOURCE, simulated: true,
    history: fixtureHistory(id, value, unit, [change1d, change5d, change20d], changeUnit),
  };
}

const metrics = Object.fromEntries(DEFINITIONS.map(definition => {
  const metric = createMetric(definition);
  return [metric.id, metric];
}));

// Derived mock rows retain exactly the same dates and units as their components.
const netHistory = DATES.map((date, index) => ({
  date,
  value: metrics.fedBalance.history[index].value - metrics.tga.history[index].value - metrics.rrp.history[index].value,
}));
const netValue = metrics.fedBalance.value - metrics.tga.value - metrics.rrp.value;
metrics.netLiquidity = {
  id: 'netLiquidity', name: '净流动性', value: netValue, unit: 'usdBn',
  change1d: netValue - netHistory.at(-2).value, changeUnit: 'usdBn',
  change5d: netValue - netHistory.at(-6).value, change20d: netValue - netHistory.at(-21).value,
  percentile20d: 31, status: '中性', derived: true, simulated: true,
  explanation: '模拟净流动性 = 美联储资产负债表 − TGA − RRP；单位均为十亿美元。这是简化观察量，不是完整市场流动性。',
  asOf: AS_OF, observationAsOf: AS_OF, frequency: '日度 · 周度资产负债表沿用最近值', source: SOURCE, history: netHistory,
};

const events = [
  ['retail-20260918', 'Retail Sales', '零售销售', '2026-09-18T12:30:00Z', 'medium', 0.4, 0.3, 0.2, 'percent'],
  ['cpi-20260922', 'CPI', 'CPI 同比', '2026-09-22T12:30:00Z', 'high', null, 2.8, 2.7, 'percent'],
  ['core-cpi-20260922', 'Core CPI', '核心 CPI 同比', '2026-09-22T12:30:00Z', 'high', null, 3.1, 3.1, 'percent'],
  ['ism-20260923', 'ISM', 'ISM 制造业指数', '2026-09-23T14:00:00Z', 'medium', null, 49.2, 48.8, 'index'],
  ['fomc-20260923', 'FOMC', 'FOMC 目标利率上限', '2026-09-23T18:00:00Z', 'high', null, 4.5, 4.5, 'percent'],
  ['claims-20260924', 'Initial Claims', '初请失业金人数', '2026-09-24T12:30:00Z', 'medium', null, 225, 228, '千人'],
  ['gdp-20260924', 'GDP', 'GDP 季环比年化', '2026-09-24T12:30:00Z', 'high', null, 2.4, 2.3, 'percent'],
  ['pce-20260925', 'PCE', 'PCE 同比', '2026-09-25T12:30:00Z', 'high', null, 2.6, 2.5, 'percent'],
  ['core-pce-20260925', 'Core PCE', '核心 PCE 同比', '2026-09-25T12:30:00Z', 'high', null, 2.9, 2.9, 'percent'],
  ['nfp-20260928', 'NFP', '非农就业新增人数', '2026-09-28T12:30:00Z', 'high', null, 145, 158, '千人'],
  ['unemployment-20260928', 'Unemployment', '失业率', '2026-09-28T12:30:00Z', 'high', null, 4.2, 4.1, 'percent'],
].map(([id, code, name, time, importance, actual, forecast, previous, unit]) => ({
  id, code, name, time, importance, actual, forecast, previous, unit, simulated: true, source: '演示日程',
}));

export const MACRO_MOCK_SNAPSHOT = {
  asOf: AS_OF, now: NOW, source: SOURCE, simulated: true,
  regime: { label: '偏紧', summary: '长端实际利率上升，能源价格走强，当前金融条件对成长资产形成一定压力。' },
  growth: {
    score: 62, previous: 58, label: '偏高',
    factors: [
      { id: 'rates', label: '利率', weight: 35, pressure: 80, contribution: 28, reason: '模拟实际利率与长端收益率上行，估值折现压力偏高。' },
      { id: 'inflation', label: '通胀', weight: 25, pressure: 64, contribution: 16, reason: '模拟能源价格与通胀补偿上升。' },
      { id: 'stress', label: '市场压力', weight: 25, pressure: 40, contribution: 10, reason: '模拟波动率短期降温，信用利差保持平稳。' },
      { id: 'liquidity', label: '流动性', weight: 15, pressure: 8 / 15 * 100, contribution: 8, reason: '模拟净流动性小幅下降，资金条件略收紧。' },
    ],
  },
  interpretation: '实际利率与长端国债收益率同步上升，能源价格保持强势，成长股估值环境较前期承压。波动率与信用利差尚未同步升温。',
  metrics, groups: GROUPS, events,
  notes: ['所有指标、历史曲线、评分与事件日期均为模拟。', '工作日历史仅用于交互演示，没有接入真实交易日历。', '事件日期不是官方经济日程。'],
};
