import { MARKET_COLOR_MODES, marketHexColor } from '../lib/marketColorMode.js';

export const MACRO_RANGE_LABELS = { '1w': '一周', '1m': '一个月', '3m': '三个月', '1y': '一年', '5y': '五年' };

const METRIC_LABELS = {
  us2y: '美国2年期国债收益率',
  us5y: '美国5年期国债收益率',
  us10y: '美国10年期国债收益率',
  us30y: '美国30年期国债收益率',
  spread10y2y: '10年－2年国债收益率差',
  real10y: '美国10年期国债实际收益率',
  be5y: '5年期盈亏平衡通胀率',
  be10y: '10年期盈亏平衡通胀率',
  wti: '美国原油（WTI）',
  brent: '布伦特原油（Brent）',
  rbob: '汽油调和组分（RBOB）',
  naturalGas: '天然气',
  dxy: '美元指数（DXY）',
  gold: '黄金',
  vix: '美股波动率指数（VIX）',
  vvix: '波动率波动指数（VVIX）',
  move: '美债波动率指数（MOVE）',
  hyOas: '高收益债信用利差（HY）',
  igOas: '投资级债信用利差（IG）',
  fedBalance: '美联储资产负债表',
  tga: '美国财政部一般账户余额（TGA）',
  rrp: '隔夜逆回购余额（RRP）',
  sofr: '担保隔夜融资利率（SOFR）',
  effr: '有效联邦基金利率（EFFR）',
  netLiquidity: '净流动性',

};

export const macroMetricLabel = metric => METRIC_LABELS[metric?.id] || metric?.name;

// Definitions explain the instrument, independently of its current risk state.
const METRIC_DESCRIPTIONS = {
  us2y: '美国2年期国债的到期收益率，反映短端利率水平。',
  us5y: '美国5年期国债的到期收益率，观察中期利率水平。',
  us10y: '美国10年期国债的到期收益率，是常用的长端利率参考。',
  us30y: '美国30年期国债的到期收益率，观察超长期利率水平。',
  spread10y2y: '10年期减2年期国债收益率，以基点（bp）表示期限利差。',
  real10y: '美国10年期通胀保值国债的实际收益率，区别于名义收益率。',
  be5y: '5年期名义与实际国债收益率之差，反映通胀补偿，不是未来通胀的精确预测。',
  be10y: '10年期名义与实际国债收益率之差，反映通胀补偿，不是未来通胀的精确预测。',
  wti: 'WTI是西得克萨斯轻质原油，美国原油市场常用基准。报价单位：美元/桶。',
  brent: '布伦特原油是国际原油市场常用基准。报价单位：美元/桶。',
  rbob: '尚未混入乙醇的汽油调和组分，反映汽油市场价格。报价单位：美元/加仑。',
  naturalGas: '观察天然气能源价格。报价单位：美元/百万英热单位。',
  dxy: '衡量美元相对一篮子货币的强弱，数值为指数点位。',
  gold: '黄金价格，报价单位为美元/金衡盎司。',
  vix: '根据标普500指数期权价格衡量未来约30天的预期波动幅度，不表示涨跌方向。',
  vvix: '衡量美股波动率指数VIX自身的预期波动幅度，补充观察波动率的不确定性。',
  move: '衡量美国国债收益率的隐含波动率，观察债券市场的不确定性。',
  hyOas: '高收益企业债相对美国国债的期权调整利差，以基点（bp）表示信用风险补偿。',
  igOas: '投资级企业债相对美国国债的期权调整利差，以基点（bp）表示信用风险补偿。',
  fedBalance: '美联储持有的总资产规模，余额以十亿美元表示。',
  tga: '美国财政部在美联储的一般账户余额，余额以十亿美元表示。',
  rrp: '美联储隔夜逆回购工具的使用余额，以十亿美元表示。',
  sofr: '以美国国债作抵押的隔夜融资参考利率，数值为年化利率。',
  effr: '联邦基金市场隔夜无担保借贷的有效利率，数值为年化利率。',
  netLiquidity: '美联储总资产减去财政部一般账户与隔夜逆回购余额，是简化派生指标。',
};
export const macroMetricDescription = metric => METRIC_DESCRIPTIONS[metric?.id] || '';

const EVENT_LABELS = {
  CPI: '消费者价格指数 · 同比',
  'Core CPI': '核心消费者价格指数 · 同比',
  PCE: '个人消费支出价格指数 · 同比',
  'Core PCE': '核心个人消费支出价格指数 · 同比',
  NFP: '非农就业岗位变动',
  Unemployment: '失业率',
  'Initial Claims': '首次申请失业救济人数',
  ISM: '供应管理协会制造业指数',
  'Retail Sales': '零售销售',
  GDP: '国内生产总值 · 季环比年化',
  FOMC: '美联储议息决议 · 目标利率上限',
};
export const macroEventLabel = event => event?.simulated === false ? event.name : EVENT_LABELS[event?.code] || event?.name;

// Provider provenance stays in the data contract, while product copy explains
// instruments, observation dates and units without API vendor branding.
export const macroDisplayText = value => typeof value === 'string'
  ? value.replace(/\b(?:EODHD|FRED|CBOE|EIA|ICE\s+BofAML)\b\s*(?:[·/]\s*)?/gi, '').trim()
  : '';


// Only signed changes carry direction colors. Levels, percentiles and risk
// classifications are not returns, and missing/unchanged values stay neutral.
export function macroChangeColor(value) {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0
    ? marketHexColor(value, MARKET_COLOR_MODES.RED_UP_GREEN_DOWN)
    : undefined;
}

// The input is an observation/local date, already assigned to its own timezone.
// Format its parts without converting that calendar day into another timezone.
export function formatMacroDate(value, { includeYear = true } = {}) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) return '—';
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return '—';
  return `${includeYear ? `${year}年` : ''}${Number(month)}月${Number(day)}日`;
}
