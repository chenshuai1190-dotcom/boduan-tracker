import React from 'react';
import HomeTab from '../tabs/HomeTab.jsx';
import TradesTab from '../tabs/TradesTab.jsx';
import { useHeaderAssetSnapshot } from '../lib/useHeaderAssetSnapshot.js';
import { headerAssetSessionContext } from '../lib/headerAssetSnapshot.js';

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
  const { snapshot, acceptBaselineQuotes } = useHeaderAssetSnapshot({
    userId: 'header-startup-local-fixture', stockTrades: ledger, cashUsd,
    marginDebtUsd: 50000, usdRate: 7, ready,
    currency: ctx.portfolioCurrencyMode || 'CNY', fxDateKey: today(), quoteRows: [],
  });
  React.useEffect(() => {
    const loaded = window.setTimeout(() => { setReady(true); setStage('账本已就绪，行情尚未到齐'); }, 400);
    const partial = window.setTimeout(() => { acceptBaselineQuotes(quotes().slice(0, 1)); setStage('只有一只股票行情'); }, 1300);
    const complete = new URLSearchParams(window.location.search).get('headerStage') === 'partial' ? null
      : window.setTimeout(() => { acceptBaselineQuotes(quotes()); setStage('完整行情已就绪'); }, 4000);
    return () => { [loaded, partial, complete].forEach(window.clearTimeout); };
  }, [acceptBaselineQuotes]);
  const previewCtx = {
    ...ctx, headerAssetSnapshot: snapshot,
    marginStatusReady: ready, marginStatus: { currentMargin: 50000 },
    availableCashStatusReady: ready,
    availableCashStatus: { ...ctx.availableCashStatus, availableCashUsd: cashUsd, isSet: true },
  };
  const Tab = tab === 'trades' ? TradesTab : HomeTab;
  return <>
    <div className="mb-4 flex flex-wrap items-center gap-3 px-4 text-[12px] text-white/50" data-header-startup-fixture>
      <span>本地模拟 · {stage} · {navigator.standalone ? '主屏幕 Web App' : '浏览器'}</span>
      <button type="button" onClick={() => setCashUsd(value => value + 1000)}>现金 +1000</button>
      <button type="button" onClick={() => { acceptBaselineQuotes(quotes()); setStage('完整行情已就绪'); }}>补齐行情</button>
    </div>
    <Tab ctx={previewCtx} />
  </>;
}
