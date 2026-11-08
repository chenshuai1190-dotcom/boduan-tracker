import { fetchVixComparison } from '../quote/vixComparison.js';
import { getVixComparisonExpectedCloseDate, isVixComparisonSession, nextVixComparisonSession } from '../../src/lib/vixComparisonSession.js';
import { AssistantError } from './errors.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);

export function nextAssistantDailyRun(asOfDate) {
  const date = nextVixComparisonSession(asOfDate);
  if (!date) throw new AssistantError('ASSISTANT_MARKET_DATE', '下一交易日暂时无法确定。', 422);
  const reference = new Date(`${date}T18:00:00Z`);
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(reference).find(part => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone || '');
  if (!match) throw new AssistantError('ASSISTANT_MARKET_DATE', '交易时区暂时无法确定。', 422);
  const offset = (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === '+' ? 1 : -1);
  return new Date(Date.parse(`${date}T17:15:00Z`) - offset * 60_000).toISOString();
}

/** Project only verified completed daily closes. This never reads an account,
 * updates a ledger, changes provider routing, or invents missing sessions. */
export function projectAssistantMarketClose(data, requestedDate, now = Date.now()) {
  const expected = getVixComparisonExpectedCloseDate(now);
  const date = requestedDate || expected;
  if (!isVixComparisonSession(date) || date > expected) throw new AssistantError('ASSISTANT_MARKET_DATE', '请选择已经完成收盘的交易日。', 422);
  const prices = {};
  for (const symbol of ['SPY', 'QQQ']) {
    const rows = data?.series?.[symbol]?.rows;
    const index = Array.isArray(rows) ? rows.findIndex(row => row.date === date) : -1;
    const current = rows?.[index], previous = rows?.[index - 1];
    if (!current || !previous || !finite(current.close) || !finite(previous.close)
      || current.close <= 0 || previous.close <= 0 || nextVixComparisonSession(previous.date) !== date) {
      throw new AssistantError('ASSISTANT_MARKET_INCOMPLETE', '所选交易日的完整收盘数据尚不可用，请稍后重试。', 503);
    }
    prices[symbol] = { close: current.close, previousClose: previous.close,
      dailyReturnPct: (current.close / previous.close - 1) * 100, priceBasis: 'adjusted_close', currency: 'USD' };
  }
  const term = data?.termStructure?.rows?.find(row => row.date === date);
  if (!term || ![term.vix, term.vix3m, term.ratio].every(value => finite(value) && value > 0)) {
    throw new AssistantError('ASSISTANT_MARKET_INCOMPLETE', '所选交易日的 VIX 同日收盘数据尚不可用，请稍后重试。', 503);
  }
  return { asOfDate: date, expectedAsOfDate: expected, basis: 'completed_close',
    source: 'CBOE_EODHD_EOD', prices, vix: term.vix, vix3m: term.vix3m, vixRatio: term.ratio,
    sources: [
      { id: `market:${date}:cboe`, kind: 'market', date, title: 'Cboe VIX / VIX3M 同日收盘', url: 'https://www.cboe.com/tradable_products/vix/vix_historical_data/' },
      { id: `market:${date}:eodhd`, kind: 'market', date, title: 'EODHD SPY / QQQ 复权收盘', url: 'https://eodhd.com/financial-apis/api-for-historical-data-and-volumes/' },
    ] };
}

export async function getAssistantMarketClose({ date, now = Date.now(), env = process.env,
  fetchComparison = fetchVixComparison } = {}) {
  if (!String(env.EODHD_API_KEY || '').trim()) throw new AssistantError('ASSISTANT_MARKET_UNAVAILABLE', '正式市场数据暂不可用。', 503);
  let data;
  try { data = await fetchComparison({ eodhdKey: env.EODHD_API_KEY, now }); }
  catch { throw new AssistantError('ASSISTANT_MARKET_UNAVAILABLE', '正式市场数据暂不可用，请稍后重试。', 503); }
  return projectAssistantMarketClose(data, date, now);
}
