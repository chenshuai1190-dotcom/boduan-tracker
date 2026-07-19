import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prototypeSource = readFileSync(new URL('../src/dev/WatchlistStockDetailPrototype.jsx', import.meta.url), 'utf8');
const devPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');

test('watchlist stock detail prototype stays local and keeps account data read-only', () => {
  assert.ok(devPreviewSource.includes("lazy(() => import('./dev/WatchlistStockDetailPrototype.jsx'))"));
  assert.ok(devPreviewSource.includes("preview === 'watchlist-stock-detail-prototype'"));
  assert.ok(prototypeSource.includes('data-watchlist-stock-detail-prototype="phase-1"'));
  assert.ok(prototypeSource.includes('max-w-[430px] pb-[calc(env(safe-area-inset-bottom)+86px)]" data-prototype-width="home"'));
  assert.equal(prototypeSource.includes('max-w-[430px] px-3'), false, 'prototype modules should use the same visible width as Home cards');
  assert.ok(prototypeSource.includes("import ActionModalCard from '../components/ActionModalCard.jsx'"));
  assert.ok(prototypeSource.includes("import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx'"));
  assert.ok(prototypeSource.includes('目标价只保存个人计划，不修改持仓、正式交易记录或比赛账本。'));
  assert.ok(prototypeSource.includes('正式账本 · 只读'));

  for (const forbidden of ['insertStockTrade', 'updateStockTrade', 'deleteStockTrade', 'stock_trades', 'supabase', 'fetch(']) {
    assert.equal(prototypeSource.includes(forbidden), false, `prototype must not access ${forbidden}`);
  }
  assert.equal(appSource.includes('WatchlistStockDetailPrototype'), false);
  assert.equal(homeSource.includes('WatchlistStockDetailPrototype'), false);
});

test('watchlist price chart opens a read-only close-price tooltip', () => {
  assert.ok(prototypeSource.includes("previewParams.get('chartTooltip') === '1'"));
  assert.ok(prototypeSource.includes('data-watchlist-price-chart-trigger="true"'));
  assert.ok(prototypeSource.includes('aria-label="查看 NVDA 股价走势"'));
  assert.ok(prototypeSource.includes('data-watchlist-price-chart-tooltip="true"'));
  assert.ok(prototypeSource.includes('· 普通收盘'));
  assert.ok(prototypeSource.includes('当日涨跌'));
  assert.ok(prototypeSource.includes('MA200（周）'));
  assert.ok(prototypeSource.includes('data-watchlist-weekly-ma-line="true"'));
  assert.ok(prototypeSource.includes('strokeWidth="0.95"'));
  assert.ok(prototypeSource.includes('strokeWidth="1.15"'));
  assert.equal(prototypeSource.includes('price-glow'), false);
  assert.equal(prototypeSource.includes('formatNumber(last.value)'), false, 'the chart endpoint should not repeat the latest stock price');
  assert.ok(prototypeSource.includes('setSelectedIndex(Math.round'));
  assert.ok(prototypeSource.includes('window.setTimeout(() => setSelectedIndex(null), 12_000)'));
});

test('watchlist header gives the price chart a full-width row', () => {
  assert.ok(prototypeSource.includes('data-prototype-header-chart="full-width"'));
  assert.ok(prototypeSource.includes('data-prototype-price-summary="inline"'));
  assert.ok(prototypeSource.includes('data-prototype-chart-row="full-width"'));
  assert.equal(prototypeSource.includes('grid-cols-[103px_minmax(0,1fr)]'), false);
  assert.ok(prototypeSource.includes('className="h-[184px] w-full overflow-visible"'));
  assert.ok(prototypeSource.includes('data-prototype-chart-ranges="five"'));
  assert.ok(prototypeSource.includes("React.useState('5y')"));
  assert.ok(prototypeSource.includes("'5y': '5年'"));
  assert.ok(prototypeSource.includes('data-prototype-chart-legend="price-weekly-ma"'));
});

test('key indicators replace the dense grid with daily facts and one weekly trend panel', () => {
  assert.ok(prototypeSource.includes('data-prototype-key-metrics="spacious"'));
  assert.ok(prototypeSource.includes('data-prototype-daily-metrics="borderless"'));
  assert.ok(prototypeSource.includes('data-watchlist-weekly-ma-panel="true"'));
  assert.ok(prototypeSource.includes('距MA200（日）'));
  assert.ok(prototypeSource.includes('距EMA30（日）'));
  assert.ok(prototypeSource.includes('200周数据完整'));
  assert.equal(prototypeSource.includes('20日年化波动率'), false);
  assert.equal(prototypeSource.includes('中期高于MA200 · 短期低于EMA30'), false);
});

test('prototype keeps the stock-detail bottom navigation', () => {
  assert.ok(prototypeSource.includes('data-prototype-bottom-tabs="five"'));
  for (const label of ['首页', '交易', '资产', '目标', '设置']) {
    assert.ok(prototypeSource.includes(`label: '${label}'`));
  }
});

test('prototype target card keeps editing but has no whole-card scale animation', () => {
  const targetButtonStart = prototypeSource.lastIndexOf('<button', prototypeSource.indexOf('data-prototype-section="target"'));
  const targetButtonEnd = prototypeSource.indexOf('>', prototypeSource.indexOf('data-prototype-section="target"'));
  const targetButton = prototypeSource.slice(targetButtonStart, targetButtonEnd);
  assert.ok(targetButton.includes('setShowTargetEditor(true)'));
  assert.equal(targetButton.includes('scale-'), false);
});
