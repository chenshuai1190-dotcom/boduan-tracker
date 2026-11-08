import React from 'react';
import ReviewStockReplay from '../components/ReviewStockReplay.jsx';
import { SnapshotCard } from '../components/ReviewMarketSnapshot.jsx';
import { createReviewStockReplayHistoryLoader, REVIEW_STOCK_REPLAY_CACHE_MS } from '../lib/reviewStockReplayHistory.js';
import { createReviewSessionGuard } from '../lib/reviewSessionGuard.js';
import { loadStockComparison } from '../lib/stockComparison.js';
import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';
import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';

// DEV-only PWA acceptance fixture. All identity, prices and requests are local
// examples. The production loader, validator, cache and card remain exercised.
export default function ReviewReplayCachePreview({ snapshot }) {
  const [, render] = React.useReducer(value => value + 1, 0);
  const [mount, setMount] = React.useState(0), [shares, setShares] = React.useState(10);
  const scenario = React.useMemo(() => {
    const state = { now: Date.now(), userId: 'replay-cache-example-a', requests: 0, fail: false, authListeners: new Set() };
    const getSession = async () => ({ data: { session: { user: { id: state.userId }, access_token: 'local-example-only' } } });
    const client = { auth: { getSession, onAuthStateChange(callback) {
      state.authListeners.add(callback);
      return { data: { subscription: { unsubscribe: () => state.authListeners.delete(callback) } } };
    } } };
    const loader = createReviewStockReplayHistoryLoader({
      getSessionGuard: async invalidate => {
        state.authListeners.add(event => { if (event === 'SIGNED_OUT') invalidate(); });
        return createReviewSessionGuard(client);
      },
      loadHistory: options => loadStockComparison({ ...options, getSession, now: () => state.now,
        fetchImpl: async () => {
          state.requests++; render();
          await new Promise(resolve => setTimeout(resolve, 650));
          if (state.fail) throw new Error('Local simulated network failure');
          const dates = [];
          for (let time = Date.parse(`${options.startDate}T12:00:00Z`); time <= Date.parse(`${options.endDate}T12:00:00Z`); time += 86400000) {
            const day = new Date(time), date = day.toISOString().slice(0, 10);
            if (![0, 6].includes(day.getUTCDay()) && !isRegularNyseHoliday(date)) dates.push(date);
          }
          const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(state.now);
          return { ok: true, status: 200, json: async () => ({ success: true, data: {
            version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD',
            symbols: options.symbols, requestedStartDate: options.startDate, requestedEndDate: options.endDate,
            expectedAsOfDate, splitBasisDate: expectedAsOfDate, asOfDate: dates.at(-1), fetchedAt: new Date(state.now).toISOString(),
            series: Object.fromEntries(options.symbols.map(symbol => [symbol, { symbol, name: `${symbol} Local Example`, type: 'Common Stock',
              rows: dates.map((date, index) => ({ date, close: 150 + index * .3 + Math.sin(index / 8) * 12 })) }])),
          } }) };
        },
      }),
    });
    const args = options => ({ ...options, now: () => state.now });
    state.load = Object.assign(options => loader(args(options)), {
      peek: options => loader.peek(args(options)),
      isCurrent: (options, data) => loader.isCurrent(args(options), data),
      subscribe: loader.subscribe,
    });
    return state;
  }, []);
  const reopen = () => setMount(value => value + 1);
  const date = getInvestmentComparisonExpectedCloseDate();
  const stockTrades = [{ id: 'example-buy', symbol: 'GOOGL', date, side: 'buy', price: 190, shares, user_id: scenario.userId }];
  return <section style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 18px 110px', color: '#d8dce3' }}>
    <h1 style={{ fontSize: 20 }}>帖子附件缓存验收</h1>
    <p style={{ fontSize: 13, color: '#9aa3b2' }}>本地示例行情与交易，无真实请求或业务写入。</p>
    <p role="status">行情请求：{scenario.requests} 次 · 示例股数：{shares}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
      {[
        ['重新进入', reopen],
        ['修改股数', () => setShares(value => value + 1)],
        ['6 小时后重进', () => { scenario.now += REVIEW_STOCK_REPLAY_CACHE_MS; reopen(); }],
        ['断网后重进', () => { scenario.fail = true; scenario.now += REVIEW_STOCK_REPLAY_CACHE_MS; reopen(); }],
        ['恢复网络', () => { scenario.fail = false; reopen(); }],
        ['退出再登录', () => { for (const listener of scenario.authListeners) listener('SIGNED_OUT', null); for (const listener of scenario.authListeners) listener('SIGNED_IN', { user: { id: scenario.userId } }); reopen(); }],
      ].map(([label, action]) => <button type="button" key={label} onClick={action} style={{ padding: '10px 12px', background: '#20242b', borderRadius: 10, fontSize: 13 }}>{label}</button>)}
    </div>
    <p style={{ fontSize: 13 }}>Quote · 示例帖子</p>
    <ReviewStockReplay key={mount} symbol="GOOGL" stockTrades={stockTrades} userId={scenario.userId} previewHistoryLoader={scenario.load} />
    <div style={{ marginTop: 18 }}><SnapshotCard value={snapshot} /></div>
  </section>;
}
