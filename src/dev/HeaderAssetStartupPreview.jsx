import React from 'react';
import HomeTab from '../tabs/HomeTab.jsx';
import TradesTab from '../tabs/TradesTab.jsx';
import { useHeaderAssetSnapshot } from '../lib/useHeaderAssetSnapshot.js';
import { headerAssetSessionContext } from '../lib/headerAssetSnapshot.js';
import { applyStockTickToQuoteRows } from '../lib/stockRealtime.js';
import { readStockQuoteBootstrapCache, writeStockQuoteBootstrapCache } from '../lib/stockQuoteBootstrapCache.js';

const PREVIEW_MODE_STORAGE_KEY = 'boduan.dev.header-startup-mode';

// Deterministic local fixture exercising the production hook, never account data.
const ledger = [
  { id: 1, symbol: 'NVDA', side: 'buy', date: '2026-01-05', price: 100, shares: 1000 },
  { id: 2, symbol: 'MSFT', side: 'buy', date: '2026-01-05', price: 300, shares: 500 },
];
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
function quotes() {
  const now = Date.now();
  const context = headerAssetSessionContext(now);
  return [['NVDA', 200, 205], ['MSFT', 450, 460]].map(([symbol, price, previousClose]) => ({
    symbol, source: 'EODHD', price, previousClose, timestamp: Math.floor(now / 1000),
    dailyPnlPrice: price, dailyPnlPriceDate: context.live ? '' : context.closeDate,
    dailyPnlLocked: !context.live, dailyPnlSession: context.session,
    dailyPnlSource: context.live ? `realtime-${context.session}` : 'eodhd-adjusted-close',
    dailyPnlBaselineClose: previousClose, dailyPnlBaselineDate: context.baselineDate,
    dailyPnlBaselineSource: 'eodhd-adjusted-close',
  }));
}

function premarketQuotes(tickCount, now = Date.now()) {
  const context = headerAssetSessionContext(now);
  if (context?.session !== 'pre') return null;
  // 02:00 UTC after the completed trading date is still that evening in New
  // York under either DST offset. This is a historical quote timestamp only.
  const overnightAt = Date.parse(`${context.closeDate}T23:00:00Z`) + 3 * 60 * 60 * 1000;
  const overnightContext = headerAssetSessionContext(overnightAt);
  const overnight = [['NVDA', 200, 205], ['MSFT', 450, 460]].map(([symbol, price, baseline]) => ({
    symbol, source: 'EODHD', price, previousClose: baseline,
    timestamp: Math.floor(overnightAt / 1000),
    dailyBaselineClose: baseline, dailyBaselineDate: overnightContext.baselineDate,
    dailyBaselineSource: 'eodhd-adjusted-close',
    dailyPnlPrice: price, dailyPnlPriceDate: context.closeDate,
    dailyPnlLocked: true, dailyPnlSession: 'closed', dailyPnlSource: 'eodhd-adjusted-close',
    dailyPnlBaselineClose: baseline, dailyPnlBaselineDate: overnightContext.baselineDate,
    dailyPnlBaselineSource: 'eodhd-adjusted-close',
  }));
  // Exercise the real startup cache schema, which intentionally does not carry
  // the complete close bundle. Keep this serialization entirely in memory.
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  writeStockQuoteBootstrapCache({ userId: 'premarket-fixture', rows: overnight, storage, now });
  let runtime = readStockQuoteBootstrapCache({ userId: 'premarket-fixture', storage, now });
  for (const row of overnight.slice(0, tickCount)) {
    runtime = applyStockTickToQuoteRows(runtime, {
      symbol: row.symbol, source: 'EODHD_WS', price: row.price + 2,
      timestamp: now, receivedAt: now, clientReceivedAt: now,
    }, 'live', [], { now });
  }
  const baseline = overnight.map(row => ({
    ...row, previousClose: row.price,
    dailyBaselineClose: row.price, dailyBaselineDate: context.baselineDate,
    dailyPnlBaselineClose: row.price, dailyPnlBaselineDate: context.baselineDate,
    dailyPnlPriceDate: '', dailyPnlSession: 'pre', dailyPnlLocked: false,
    dailyPnlSource: 'realtime-pre',
    // REST can supply a verified new baseline while its last trade remains old.
    // Its old price must never replace the new runtime tick.
  }));
  return { runtime, baseline };
}

export default function HeaderAssetStartupPreview({ ctx, tab }) {
  React.useEffect(() => {
    // A separate installable local fixture exercises WebKit standalone storage.
    // The production manifest and authenticated startup path are untouched.
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return undefined;
    const previous = link.getAttribute('href');
    link.setAttribute('href', '/dev-header-startup.webmanifest');
    return () => { if (previous) link.setAttribute('href', previous); };
  }, []);
  const [ready, setReady] = React.useState(false);
  const [cashUsd, setCashUsd] = React.useState(10000);
  const [stage, setStage] = React.useState('账本加载中');
  const [premarket] = React.useState(() => {
    try {
      const saved = localStorage.getItem(PREVIEW_MODE_STORAGE_KEY);
      if (saved === 'premarket' || saved === 'normal') return saved === 'premarket';
    } catch { /* The query remains usable when storage is unavailable. */ }
    return new URLSearchParams(window.location.search).get('headerStage') === 'premarket';
  });
  const [quoteRows, setQuoteRows] = React.useState([]);
  const premarketBaselinesComplete = React.useRef(false);
  const { snapshot, acceptBaselineQuotes } = useHeaderAssetSnapshot({
    userId: premarket ? 'header-premarket-local-fixture' : 'header-startup-local-fixture', stockTrades: ledger, cashUsd,
    marginDebtUsd: 50000, usdRate: 7, ready,
    currency: ctx.portfolioCurrencyMode || 'CNY', fxDateKey: today(), quoteRows,
  });
  const completeQuotes = React.useCallback((ticksOnly = false) => {
    if (!premarket) { acceptBaselineQuotes(quotes()); setStage('完整行情已就绪'); return; }
    const data = premarketQuotes(2);
    if (!data) { setStage('当前非真实盘前时段'); return; }
    setQuoteRows(data.runtime);
    if (!ticksOnly) {
      acceptBaselineQuotes(data.baseline);
      premarketBaselinesComplete.current = true;
    }
    setStage(ticksOnly && !premarketBaselinesComplete.current
      ? '两只盘前价已齐，第二只昨收基线仍缺失'
      : '盘前实时价与昨收基线已齐，REST价格时间仍为昨夜');
  }, [acceptBaselineQuotes, premarket]);
  React.useEffect(() => {
    const loaded = window.setTimeout(() => { setReady(true); setStage('账本已就绪，行情尚未到齐'); }, 400);
    const partial = window.setTimeout(() => {
      if (!premarket) { acceptBaselineQuotes(quotes().slice(0, 1)); setStage('只有一只股票行情'); return; }
      const data = premarketQuotes(1);
      if (!data) { setStage('当前非真实盘前时段'); return; }
      setQuoteRows(data.runtime);
      acceptBaselineQuotes(data.baseline.slice(0, 1));
      setStage('只有一只盘前新价与基线，头部等待补齐');
    }, 1300);
    const complete = premarket || new URLSearchParams(window.location.search).get('headerStage') === 'partial' ? null
      : window.setTimeout(() => completeQuotes(), 4000);
    return () => { [loaded, partial, complete].forEach(window.clearTimeout); };
  }, [acceptBaselineQuotes, completeQuotes, premarket]);
  const previewCtx = {
    ...ctx, headerAssetSnapshot: snapshot,
    marginStatusReady: ready, marginStatus: { currentMargin: 50000 },
    availableCashStatusReady: ready,
    availableCashStatus: { ...ctx.availableCashStatus, availableCashUsd: cashUsd, isSet: true },
  };
  const Tab = tab === 'trades' ? TradesTab : HomeTab;
  return <>
    <div className="mb-4 flex flex-wrap items-center gap-3 px-4 text-[12px] text-white/50" data-header-startup-fixture>
      <span>本地模拟 · {premarket ? '盘前基线合并模拟 · ' : ''}{stage} · {navigator.standalone ? '主屏幕 Web App' : '浏览器'}</span>
      <button type="button" onClick={() => {
        try { localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, premarket ? 'normal' : 'premarket'); }
        catch { setStage('无法保存本地模拟场景'); return; }
        window.location.reload();
      }}>{premarket ? '普通场景' : '盘前场景'}</button>
      <button type="button" onClick={() => setCashUsd(value => value + 1000)}>现金 +1000</button>
      {premarket ? <button type="button" onClick={() => completeQuotes(true)}>仅补齐盘前价</button> : null}
      <button type="button" onClick={() => completeQuotes()}>补齐行情</button>
    </div>
    <Tab ctx={previewCtx} />
  </>;
}
