// DEV-only fictional scenarios. Prices, history and indicators are
// illustrative mock data, never live quotes or a recommendation to trade.
const FIXTURES = {
  NVDA: {
    price: 176.4,
    changePct: 1.2,
    verdict: 'wait',
    support: 170,
    resistance: 184,
    history: [208, 204, 206, 200, 196, 198, 192, 187, 190, 183, 179, 182, 175, 169, 172, 176, 180, 177, 174, 170, 171.5, 173, 172.2, 174.1, 172.8, 174, 174.31, 176.4],
    statuses: ['caution', 'neutral', 'caution', 'neutral'],
    zh: {
      name: '英伟达',
      scenario: '缩量反弹',
      verdictLabel: '等待确认',
      summary: '价格正在反弹，量能与结构仍待确认。',
      reasons: ['反弹尚未突破前一高点', '成交量仅为 20 日均量的 0.68 倍'],
      trendLabel: '下跌后的反弹',
      checks: [
        { label: '趋势', reading: '反弹中', metric: '前高 $180.00', detail: '近期低点有所抬高，价格仍低于前一反弹高点，上行结构尚未形成。' },
        { label: '位置', reading: '支撑上方', metric: '距支撑 3.6%', detail: '样例支撑在 $170.00，下一压力在 $184.00，距压力约 4.3%。' },
        { label: '量能', reading: '缩量反弹', metric: '0.68×', detail: '当日成交量相对 20 日均量偏低，反弹的参与度仍待确认。' },
        { label: '动量', reading: '中性 · 动量正常', metric: 'RSI (6) 54.2', detail: 'RSI 回到中性区间，样例中没有近期有效背离事件。' },
      ],
      nextSteps: ['观察收盘能否站上 $180.00 的前一高点', '观察反弹成交量能否回到 20 日均量附近'],
    },
    en: {
      name: 'NVIDIA',
      scenario: 'Low-volume rebound',
      verdictLabel: 'Await confirmation',
      summary: 'Price is rebounding; volume and structure still need confirmation.',
      reasons: ['The rebound remains below its previous peak', 'Volume is only 0.68× the 20-day average'],
      trendLabel: 'Rebound after a decline',
      checks: [
        { label: 'Trend', reading: 'Rebounding', metric: 'Prior high $180.00', detail: 'Recent lows are rising, but price remains below the previous rebound peak. An uptrend is not yet established.' },
        { label: 'Position', reading: 'Above support', metric: '3.6% to support', detail: 'Sample support is $170.00. The next resistance is $184.00, about 4.3% above price.' },
        { label: 'Volume', reading: 'Low-volume rebound', metric: '0.68×', detail: 'Volume is below its 20-day average. Participation in the rebound needs confirmation.' },
        { label: 'Momentum', reading: 'Neutral · Normal momentum', metric: 'RSI (6) 54.2', detail: 'RSI has returned to its neutral range. This scenario has no recent active divergence event.' },
      ],
      nextSteps: ['Watch for a close above the previous $180.00 peak', 'Watch for rebound volume to recover toward its 20-day average'],
    },
  },
  META: {
    price: 680.5,
    changePct: 0.75,
    verdict: 'pause',
    support: 652,
    resistance: 692,
    history: [602, 608, 611, 606, 617, 623, 629, 625, 637, 644, 651, 656, 660, 649, 643, 647, 652, 657, 661, 667, 673, 668, 678, 682, 686.4, 684, 675.43, 680.5],
    statuses: ['clear', 'caution', 'neutral', 'caution'],
    zh: {
      name: 'Meta',
      scenario: '超买与顶背离',
      verdictLabel: '触发暂缓条件',
      summary: '上行趋势仍在，超买与顶背离同时出现。',
      reasons: ['RSI (6) 高于 80，且顶背离正在形成', '距离下一压力约 1.7%'],
      trendLabel: '上涨中的动量减弱',
      checks: [
        { label: '趋势', reading: '维持上行', metric: '高低点抬升', detail: '近期价格高点与低点持续抬升，趋势尚未反转。' },
        { label: '位置', reading: '靠近压力', metric: '距压力 1.7%', detail: '样例下一压力在 $692.00，支撑在 $652.00。当前价格接近压力区域。' },
        { label: '量能', reading: '略高于均量', metric: '1.12×', detail: '当日成交量为 20 日均量的 1.12 倍，样例未触发缩量条件。' },
        { label: '动量', reading: '超买 · 顶背离形成', metric: 'RSI (6) 82.4', detail: '两次价格高点从 $660.00 升至 $686.40，对应 RSI 从 91.2 降至 85.1；第二高点已完成后续三根日线确认，但价格尚未从高点回撤 3%，当前仍处于形成阶段。' },
      ],
      nextSteps: ['观察超买与顶背离的组合条件是否解除', '观察压力附近能否形成新的价格与动量确认'],
    },
    en: {
      name: 'Meta',
      scenario: 'Overbought with divergence',
      verdictLabel: 'Pause conditions triggered',
      summary: 'The uptrend continues, with overbought RSI and bearish divergence.',
      reasons: ['RSI (6) exceeds 80 with bearish divergence forming', 'The next resistance is about 1.7% away'],
      trendLabel: 'Fading momentum in an uptrend',
      checks: [
        { label: 'Trend', reading: 'Uptrend intact', metric: 'Rising highs and lows', detail: 'Recent price highs and lows continue to rise. The trend has not reversed.' },
        { label: 'Position', reading: 'Near resistance', metric: '1.7% to resistance', detail: 'Sample resistance is $692.00 and support is $652.00. Price is approaching the resistance area.' },
        { label: 'Volume', reading: 'Above average', metric: '1.12×', detail: 'Volume is 1.12× its 20-day average. This scenario does not trigger a low-volume condition.' },
        { label: 'Momentum', reading: 'Overbought · Divergence forming', metric: 'RSI (6) 82.4', detail: 'Price peaks rose from $660.00 to $686.40 while RSI fell from 91.2 to 85.1. Three subsequent completed bars confirmed the second peak, but price has not drawn down 3%, so divergence is still forming.' },
      ],
      nextSteps: ['Watch whether the combined overbought and divergence conditions clear', 'Watch for fresh price and momentum confirmation near resistance'],
    },
  },
  MSFT: {
    price: 492.6,
    changePct: 1.43,
    verdict: 'observe',
    support: 480,
    resistance: 515,
    history: [493, 489, 484, 479, 475, 471, 468, 470, 474, 477, 475, 472, 474, 478, 481, 479, 476, 480, 482, 484, 481, 483, 485, 482, 484, 487, 485.65, 492.6],
    statuses: ['clear', 'clear', 'clear', 'neutral'],
    zh: {
      name: '微软',
      scenario: '放量修复',
      verdictLabel: '可进一步观察',
      summary: '价格收复关键位置，修复得到量能配合。',
      reasons: ['收盘站上前一反弹高点 $487.00', '成交量升至 20 日均量的 1.36 倍'],
      trendLabel: '回调后的修复',
      checks: [
        { label: '趋势', reading: '修复确认', metric: '突破前高', detail: '近期低点逐步抬升，收盘突破前一反弹高点 $487.00，满足样例的结构修复条件。' },
        { label: '位置', reading: '收复支撑', metric: '距支撑 2.6%', detail: '价格位于样例 $480.00 支撑上方，下一压力在 $515.00，距压力约 4.5%。' },
        { label: '量能', reading: '放量配合', metric: '1.36×', detail: '当日成交量达到 20 日均量的 1.36 倍，与价格突破同步。' },
        { label: '动量', reading: '中性 · 动量正常', metric: 'RSI (6) 68.3', detail: 'RSI 未进入本工具的 80 以上超买区间，样例中没有近期有效背离事件。' },
      ],
      nextSteps: ['观察后续收盘能否维持在 $487.00 上方', '观察回踩时量能是否收敛、支撑是否保持有效'],
    },
    en: {
      name: 'Microsoft',
      scenario: 'Recovery with volume',
      verdictLabel: 'Eligible for further review',
      summary: 'Price has reclaimed a key level with supporting volume.',
      reasons: ['The close cleared the previous $487.00 rebound peak', 'Volume rose to 1.36× its 20-day average'],
      trendLabel: 'Recovery after a pullback',
      checks: [
        { label: 'Trend', reading: 'Recovery confirmed', metric: 'Prior high cleared', detail: 'Recent lows are rising and the close cleared the previous $487.00 rebound peak, meeting this scenario’s structural recovery condition.' },
        { label: 'Position', reading: 'Support reclaimed', metric: '2.6% to support', detail: 'Price is above sample support at $480.00. Resistance is $515.00, about 4.5% above price.' },
        { label: 'Volume', reading: 'Volume confirms', metric: '1.36×', detail: 'Volume reached 1.36× its 20-day average alongside the price breakout.' },
        { label: 'Momentum', reading: 'Neutral · Normal momentum', metric: 'RSI (6) 68.3', detail: 'RSI remains below this tool’s overbought threshold of 80. This scenario has no recent active divergence event.' },
      ],
      nextSteps: ['Watch whether subsequent closes hold above $487.00', 'Watch whether pullbacks come on lighter volume and support holds'],
    },
  },
};

const CHECK_IDS = ['trend', 'position', 'volume', 'momentum'];

export const STOCK_DECISION_SAMPLES = Object.entries(FIXTURES).map(([symbol, fixture]) => ({
  symbol,
  name: fixture.zh.name,
  nameEn: fixture.en.name,
  scenario: fixture.zh.scenario,
  scenarioEn: fixture.en.scenario,
}));

export function lookupStockDecision(rawSymbol, language = 'zh') {
  if (typeof rawSymbol !== 'string') return null;
  const symbol = rawSymbol.trim().toUpperCase().replace(/\.US$/, '');
  if (!Object.prototype.hasOwnProperty.call(FIXTURES, symbol)) return null;
  const fixture = FIXTURES[symbol];
  const copy = fixture[language === 'en' ? 'en' : 'zh'];
  return {
    symbol,
    name: copy.name,
    asOf: '2026-09-11',
    price: fixture.price,
    changePct: fixture.changePct,
    verdict: fixture.verdict,
    verdictLabel: copy.verdictLabel,
    summary: copy.summary,
    reasons: [...copy.reasons],
    trendLabel: copy.trendLabel,
    history: [...fixture.history],
    support: fixture.support,
    resistance: fixture.resistance,
    checks: CHECK_IDS.map((id, index) => ({
      id,
      status: fixture.statuses[index],
      ...copy.checks[index],
    })),
    nextSteps: [...copy.nextSteps],
  };
}
