import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const authGateSource = readFileSync(new URL('../src/AuthGate.jsx', import.meta.url), 'utf8');
const amountDisplaySource = readFileSync(new URL('../src/lib/amountDisplay.js', import.meta.url), 'utf8');
const analysisTabSource = readFileSync(new URL('../src/tabs/AnalysisTab.jsx', import.meta.url), 'utf8');
const devVisualPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const homeTabSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const reviewTabSource = readFileSync(new URL('../src/tabs/ReviewTab.jsx', import.meta.url), 'utf8');
const settingsChangelogSource = readFileSync(new URL('../src/lib/settingsChangelog.js', import.meta.url), 'utf8');
const settingsTabSource = readFileSync(new URL('../src/tabs/SettingsTab.jsx', import.meta.url), 'utf8');
const tradesTabSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const indicesRealtimeApiSource = readFileSync(new URL('../api/indices-realtime.js', import.meta.url), 'utf8');
const stocksRealtimeApiSource = readFileSync(new URL('../api/stocks-realtime.js', import.meta.url), 'utf8');

function readPngInfo(relativePath) {
  const buffer = readFileSync(new URL(relativePath, import.meta.url));
  assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a', `${relativePath} must be a PNG`);

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    pos += 4;
    const type = buffer.toString('ascii', pos, pos + 4);
    pos += 4;
    const data = buffer.subarray(pos, pos + length);
    pos += length + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    }
  }

  let alphaMin = 255;
  let darkestCornerMax = 255;
  if (bitDepth === 8 && (colorType === 2 || colorType === 6)) {
    const raw = inflateSync(Buffer.concat(idatChunks));
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const stride = width * bytesPerPixel;
    let offset = 0;
    let previous = Buffer.alloc(stride);
    const decodedRows = [];
    const paeth = (left, up, upLeft) => {
      const estimate = left + up - upLeft;
      const leftDistance = Math.abs(estimate - left);
      const upDistance = Math.abs(estimate - up);
      const upLeftDistance = Math.abs(estimate - upLeft);
      if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
      return upDistance <= upLeftDistance ? up : upLeft;
    };

    for (let y = 0; y < height; y += 1) {
      const filter = raw[offset];
      offset += 1;
      const row = Buffer.alloc(stride);
      for (let x = 0; x < stride; x += 1) {
        const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
        const up = previous[x] || 0;
        const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
        const value = raw[offset];
        offset += 1;
        if (filter === 0) row[x] = value;
        else if (filter === 1) row[x] = (value + left) & 255;
        else if (filter === 2) row[x] = (value + up) & 255;
        else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
        else throw new Error(`${relativePath} has unsupported PNG filter ${filter}`);
      }
      if (colorType === 6) {
        for (let x = 3; x < stride; x += 4) alphaMin = Math.min(alphaMin, row[x]);
      }
      decodedRows.push(row);
      previous = row;
    }
    const cornerMaxValues = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ].map(([x, y]) => {
      const row = decodedRows[y];
      const start = x * bytesPerPixel;
      return Math.max(row[start], row[start + 1], row[start + 2]);
    });
    darkestCornerMax = Math.max(...cornerMaxValues);
  }

  return { width, height, bitDepth, colorType, alphaMin, darkestCornerMax };
}

test('wave record entry writes legacy trades before main ledger stock_trades', () => {
  const waveBranch = appSource.indexOf("tradeEntryScope === 'wave'");
  const waveInsert = appSource.indexOf('await db.insertTrade', waveBranch);
  const ledgerInsert = appSource.indexOf('await db.insertStockTrade', waveBranch);

  assert.ok(waveBranch > -1, 'missing explicit wave entry scope branch');
  assert.ok(waveInsert > waveBranch, 'wave branch must insert into legacy trades');
  assert.ok(ledgerInsert > waveInsert, 'main stock_trades insert must stay outside the wave branch');
  assert.ok(tradesTabSource.includes("setTradeEntryScope('wave')"), 'wave quick-add must open the modal in wave scope');
  assert.ok(tradesTabSource.includes("setTradeEntryScope('ledger')"), 'main ledger entries must open the modal in ledger scope');
});

test('tool submissions require confirmation and duplicate-submit guards', () => {
  assert.ok(appSource.includes('confirmSubmittingRef'), 'global confirmation modal needs a submit guard');
  assert.ok(appSource.includes('costBasisSubmittingRef'), 'cost-basis submissions need a submit guard');
  assert.ok(appSource.includes('tradeSubmittingRef'), 'trade submissions need a submit guard');
  assert.ok(tradesTabSource.includes('确认保存到波段记录?'), 'wave submissions must show a confirmation dialog');
  assert.ok(appSource.includes('确认保存摊薄成本记录?'), 'cost-basis submissions must show a confirmation dialog');
  assert.ok(appSource.includes('不会进入正式持仓、当日订单或波段记录'), 'cost-basis confirmation must state its ledger boundary');
  assert.ok(tradesTabSource.includes('不会进入正式持仓、当日订单或总资产计算'), 'wave confirmation must state its ledger boundary');
});

test('trade and wave form validation avoids native alert dialogs', () => {
  const addTradeStart = appSource.indexOf('const addTrade = async () =>');
  const nextToolStart = appSource.indexOf('const confirmCostBasisTradeSubmit =', addTradeStart);
  const addTradeBlock = appSource.slice(addTradeStart, nextToolStart);

  assert.ok(addTradeStart > -1, 'missing addTrade implementation');
  assert.ok(nextToolStart > addTradeStart, 'missing boundary after addTrade implementation');
  assert.equal(addTradeBlock.includes('alert('), false, 'trade/wave submit path must not use native alert');
  assert.ok(appSource.includes('showCancel: opts.showCancel !== false'), 'custom notice modal must support hiding cancel button');
  assert.ok(tradesTabSource.includes('showTradeFormNotice'), 'trade tab must intercept invalid form state before submit');
});

test('settings data maintenance reset entry and runtime reset code stay removed', () => {
  assert.equal(settingsTabSource.includes('数据维护'), false, 'settings should not show the unused data maintenance card');
  assert.equal(settingsTabSource.includes('重置本地数据'), false, 'settings should not show the local reset entry');
  assert.equal(settingsTabSource.includes('resetAll'), false, 'settings should not receive a local reset handler');
  assert.equal(settingsTabSource.includes('RotateCcw'), false, 'settings should not keep the reset icon dependency');
  assert.equal(appSource.includes('const resetAll ='), false, 'app runtime should not keep the local reset implementation');
  assert.equal(appSource.includes('RESET_LOCAL_DATA_CONFIRM_PHRASE'), false, 'app runtime should not keep the reset typed-confirmation phrase');
  assert.equal(appSource.includes('resetConfirmOpen'), false, 'app runtime should not keep the reset modal state');
  assert.equal(appSource.includes('云端数据不会被删除'), false, 'app runtime should not keep the removed reset modal copy');
});

test('legacy service worker file stays removed while old registrations are still cleaned up', () => {
  assert.equal(existsSync(new URL('../public/sw.js', import.meta.url)), false, 'deprecated service worker file should not be shipped');
  assert.ok(mainSource.includes('navigator.serviceWorker.getRegistrations()'), 'entry should still enumerate old service worker registrations');
  assert.ok(mainSource.includes('reg.unregister()'), 'entry should still unregister old service workers on client load');
});

test('pwa app icons use opaque dark png assets without white iOS padding', () => {
  const expectedIcons = [
    ['../public/icon-512.png', 512, 512],
    ['../public/icon-192.png', 192, 192],
    ['../public/apple-touch-icon.png', 180, 180],
    ['../public/favicon-32.png', 32, 32],
    ['../public/favicon-16.png', 16, 16],
  ];

  for (const [path, width, height] of expectedIcons) {
    const info = readPngInfo(path);
    assert.equal(info.width, width, `${path} should keep the expected width`);
    assert.equal(info.height, height, `${path} should keep the expected height`);
    assert.equal(info.bitDepth, 8, `${path} should stay 8-bit PNG`);
    assert.equal(info.colorType, 2, `${path} should be RGB without an alpha channel so iOS cannot add white padding`);
    assert.equal(info.alphaMin, 255, `${path} should be fully opaque`);
    assert.ok(info.darkestCornerMax < 32, `${path} should have dark filled corners instead of white padding`);
  }
});

test('cost basis tool uses dark custom UI without legacy title icon or native alerts', () => {
  const costSubmitStart = appSource.indexOf('const confirmCostBasisTradeSubmit =');
  const costSubmitEnd = appSource.indexOf('const deleteStockTradeRecord =', costSubmitStart);
  const costSubmitBlock = appSource.slice(costSubmitStart, costSubmitEnd);

  assert.ok(costSubmitStart > -1, 'missing cost-basis submit implementation');
  assert.ok(costSubmitEnd > costSubmitStart, 'missing boundary after cost-basis submit implementation');
  assert.equal(costSubmitBlock.includes('alert('), false, 'cost-basis submit path must not use native alert');
  assert.ok(tradesTabSource.includes('bg-[#0b0f14]'), 'cost-basis tool should use the dark card surface');
  assert.ok(tradesTabSource.includes('Database'), 'cost-basis stats should use the existing line icon system');
  assert.ok(tradesTabSource.includes('TrendingUp'), 'cost-basis realized PnL should use the existing line icon system');
  assert.equal(tradesTabSource.includes('💼 摊薄成本'), false, 'cost-basis title must not keep the legacy briefcase icon');
  assert.equal(tradesTabSource.includes('aria-label="新增摊薄股票"'), false, 'cost-basis stock tabs must not keep a redundant trailing plus button');
  assert.ok(tradesTabSource.includes('pnlClass(stats.realizedPnl, marketColorMode)'), 'cost-basis realized PnL should use the same color class as the header cards');
  assert.ok(tradesTabSource.includes('pnlClass(profit, marketColorMode)'), 'cost-basis expanded profit should use the same color class as the header cards');
  assert.ok(appSource.includes('新增摊薄股票'), 'cost-basis add stock modal should be custom in-app UI');
  assert.ok(appSource.includes('添加摊薄交易'), 'cost-basis add trade modal should be custom in-app UI');
  assert.ok(appSource.includes('flex items-center justify-center bg-black/70 px-4'), 'cost-basis modals must stay centered on mobile');
  assert.equal(appSource.includes('items-end justify-center bg-black/70'), false, 'cost-basis modals must not use bottom-drawer layout');
  assert.equal(appSource.includes('text-white/42'), false, 'cost-basis modals must not use unsupported opacity classes');
  assert.equal(appSource.includes('text-white/72'), false, 'cost-basis cancel buttons must use visible supported text colors');
  assert.ok(appSource.includes('costBasisModalLabelClass'), 'cost-basis labels need shared explicit dark-theme colors');
  assert.ok(appSource.includes('costBasisModalInputClass'), 'cost-basis inputs need shared explicit dark-theme colors');
  assert.ok(appSource.includes('text-[#f5f7fb]'), 'cost-basis input text should stay visible on iOS keyboards');
  assert.ok(appSource.includes('placeholder:text-[#707a89]'), 'cost-basis placeholders should stay visible on iOS keyboards');
  assert.ok(appSource.includes("style={{ colorScheme: 'dark' }}"), 'cost-basis date input must force dark color scheme');
});

test('cost basis tool filters empty symbols before rendering or saving', () => {
  assert.ok(appSource.includes('sanitizeCostBasisData'), 'cost-basis state should sanitize stale local/cloud records');
  assert.ok(appSource.includes('normalizeCostBasisSymbol(costBasisNewSymbol)'), 'new cost-basis symbols must be normalized before saving');
  assert.ok(tradesTabSource.includes('Object.keys(costBasisData).map(sym => normalizeCostBasisSymbol(sym)).filter(Boolean)'), 'cost-basis tabs must filter blank symbols before rendering');
  assert.ok(dbSource.includes('if (!sym) continue;'), 'cost-basis cloud fetch must ignore invalid blank symbols');
  assert.ok(dbSource.includes("if (!normalizedSymbol) throw new Error('缺少有效股票代码');"), 'cost-basis cloud writes must reject blank symbols');
});

test('realtime quote refresh avoids duplicate requests and hides raw Safari network errors', () => {
  assert.ok(appSource.includes('quoteFetchInFlightRef'), 'quote refresh should guard overlapping auto and pull-refresh requests');
  assert.ok(appSource.includes('formatRealtimeFetchError'), 'quote refresh should normalize browser network errors');
  assert.ok(appSource.includes('行情网络请求失败,已保留现有数据'), 'raw Load failed text should become a user-facing Chinese message');
  assert.ok(appSource.includes('setTimeout(() => setFetchError(null), 4200)'), 'quote refresh errors should clear automatically');
  assert.ok(appSource.includes('QUOTE_DIAGNOSTIC_LOG_STORAGE_KEY'), 'quote failures should be persisted in local diagnostics');
  assert.ok(appSource.includes('buildQuoteDiagnosticEntry'), 'quote failures should capture root cause diagnostics');
  assert.ok(appSource.includes('recordQuoteDiagnosticLog(diagnostic)'), 'quote refresh failures should write a diagnostic log');
  assert.ok(appSource.includes('shouldRecordQuoteDiagnosticEntry'), 'quote diagnostics should filter noisy automatic browser-network failures');
  assert.ok(appSource.includes("const AUTO_NETWORK_DIAGNOSTIC_TRIGGERS = new Set(['auto-start', 'auto-interval', 'auto-visible'])"), 'automatic foreground/start/interval browser-network errors should be classified as transient');
  assert.ok(appSource.includes("entry.mode === 'auto-silent'"), 'diagnostic filter should only suppress automatic silent failures');
  assert.ok(appSource.includes("entry.root === 'browser-network'"), 'diagnostic filter should only suppress browser-network failures');
  assert.ok(appSource.includes('自动网络抖动已忽略'), 'suppressed automatic browser-network failures should remain visible in console for debugging');
  assert.ok(appSource.includes("fetchRealtimePrices(null, { trigger: 'auto-start', notifyOnError: false })"), 'automatic quote refresh failures should stay silent');
  assert.ok(appSource.includes("trigger: 'manual-pull-refresh'"), 'pull refresh should be identified as a manual quote trigger');
  assert.ok(appSource.includes('if (notifyOnError) setFetchError(message);'), 'only manual quote failures should surface bottom toasts');
  assert.ok(appSource.includes("const QUOTE_ERROR_VISIBLE_TABS = ['home', 'trades'];"), 'quote refresh errors should only surface on quote-consuming tabs');
  assert.ok(appSource.includes('const showQuoteFetchError = Boolean(fetchError) && QUOTE_ERROR_VISIBLE_TABS.includes(activeTab)'), 'target/asset/settings tabs should not inherit quote refresh toasts');
  assert.ok(appSource.includes('行情拉取失败:{fetchError}'), 'bottom toast should identify quote refresh failures specifically');
  assert.ok(settingsTabSource.includes('行情诊断日志'), 'settings should expose quote diagnostic logs');
  assert.ok(settingsTabSource.includes('quoteDiagnosticLogs'), 'settings diagnostics should read quote diagnostic log entries');
  assert.ok(settingsTabSource.includes('clearQuoteDiagnosticLogs'), 'settings diagnostics should allow clearing local quote logs');
  assert.ok(appSource.includes('/api/indices-realtime'), 'home indices should connect to the server-side indices realtime relay');
  assert.ok(appSource.includes('INDICES_REALTIME_PROTOCOL'), 'indices realtime relay should use an explicit WebSocket subprotocol');
  assert.ok(appSource.includes('applyIndexTickToMarketCards'), 'index realtime ticks should update existing market cards');
  assert.ok(appSource.includes('/api/stocks-realtime'), 'held stock quotes should connect to the server-side stock realtime relay');
  assert.ok(appSource.includes('STOCKS_REALTIME_PROTOCOL'), 'stock realtime relay should use an explicit WebSocket subprotocol');
  assert.ok(appSource.includes('applyStockTickToQuoteRows'), 'stock realtime ticks should update quoteCache for investment summary');
  assert.ok(appSource.includes('buildToolQuoteRows({ trades, costBasisData })'), 'wave and cost-basis tool symbols should join the realtime quote universe');
  assert.ok(appSource.includes('buildLedgerQuoteUniverse(localizedStockTrades, localizedWatchlist, localizedQuoteCache, toolQuoteRows)'), 'tool-only symbols must be included in quote rows for REST and WebSocket quotes');
  assert.ok(appSource.includes('quoteBySymbol.get(normalizeSymbolKey(g.symbol))'), 'wave records should read current prices from the realtime quote map');
  assert.ok(tradesTabSource.includes('quoteRows,'), 'trades tools should receive the shared realtime quote rows');
  assert.ok(tradesTabSource.includes('const quoteStock = activeSymbol ? quoteBySymbol.get(activeSymbol) : null'), 'cost-basis tool should prefer realtime quote rows for current price');
  assert.equal(appSource.includes('VITE_EODHD_TOKEN'), false, 'frontend must not reintroduce a browser EODHD token path');
  assert.ok(indicesRealtimeApiSource.includes('authenticateAccessToken'), 'indices realtime relay must require the same Supabase token boundary');
  assert.ok(indicesRealtimeApiSource.includes('attachIndicesRealtimeClient'), 'indices realtime endpoint should attach the server-side EODHD relay');
  assert.ok(stocksRealtimeApiSource.includes('authenticateAccessToken'), 'stock realtime relay must require the same Supabase token boundary');
  assert.ok(stocksRealtimeApiSource.includes('attachStocksRealtimeClient'), 'stock realtime endpoint should attach the server-side EODHD relay');
  assert.equal(homeTabSource.includes("import { isIndexMarketCard } from '../lib/indexRealtime.js';"), false, 'index cards should not import index matching just to render connection badges');
  assert.ok(homeTabSource.includes('{isBtc && realtimeLabel && ('), 'only the BTC market card should render realtime connection status');
});

test('legacy realtime and fear-card placeholders stay out of the runtime shell', () => {
  assert.equal(appSource.includes('function VixCard'), false, 'old standalone VIX card should not remain in App');
  assert.equal(appSource.includes('useCountUpOnScroll'), false, 'unused scroll count-up hook should not remain after VIX card rollback');
  assert.equal(appSource.includes('browserWsAllowed'), false, 'browser-direct websocket placeholder should not be passed through tab context');
  assert.equal(appSource.includes('wsEnabled'), false, 'old browser websocket toggle state should stay removed');
  assert.equal(appSource.includes('setStockRealtimeStatus'), false, 'stock websocket internal status should not trigger visible React state updates');
  assert.equal(appSource.includes('tqqqCurrent'), false, 'old TQQQ-only summary state should not be recalculated after ledger split');
  assert.equal(appSource.includes('computedExits'), false, 'old TQQQ exit-line calculation should stay removed from render');
  assert.ok(appSource.includes('/api/stocks-realtime'), 'stock realtime relay itself must remain active');
  assert.ok(appSource.includes('applyStockTickToQuoteRows'), 'stock ticks must still update quote rows after the cleanup');
});

test('global pull refresh checks for a new deployed app shell before data refresh', () => {
  const refreshStart = appSource.indexOf('const runGlobalPullRefresh = async () =>');
  const appShellCheck = appSource.indexOf('await checkForAppShellUpdate()', refreshStart);
  const cloudFetch = appSource.indexOf('await db.fetchAllUserData()', refreshStart);

  assert.ok(refreshStart > -1, 'missing global pull-refresh implementation');
  assert.ok(appShellCheck > refreshStart, 'pull-refresh should check the deployed app shell');
  assert.ok(cloudFetch > appShellCheck, 'app shell check should run before cloud data refresh');
  assert.ok(appSource.includes('extractAppShellAssetsFromHtml'), 'refresh should compare deployed asset fingerprints');
  assert.ok(appSource.includes('getCurrentAppShellAssets'), 'refresh should read the currently loaded asset fingerprints');
  assert.ok(appSource.includes("cache: 'no-store'"), 'refresh should bypass browser cache when checking index HTML');
  assert.ok(appSource.includes('clearAppShellCaches'), 'refresh should clear stale app caches before reload');
  assert.ok(appSource.includes('window.location.replace'), 'refresh should reload the app without requiring the user to reopen it');
  assert.ok(appSource.includes('发现新版本,正在更新'), 'refresh should tell the user when it is switching to a new version');
});

test('global pull refresh only starts from the page top outside internal scrollers', () => {
  assert.ok(appSource.includes('PULL_REFRESH_ACTIVATION_DISTANCE'), 'pull-refresh should require a deliberate pull before showing UI');
  assert.ok(appSource.includes('touchStartedAtRootTop = getScrollTop() <= PULL_REFRESH_ROOT_TOP_TOLERANCE'), 'pull-refresh eligibility must be captured at touch start');
  assert.ok(appSource.includes('if (!touchStartedAtRootTop) return false;'), 'pull-refresh must not start after a gesture reaches the top mid-scroll');
  assert.ok(appSource.includes('touchStartedInBlockedRegion = isBlockedPullTarget(startTarget)'), 'pull-refresh should remember blocked start targets');
  assert.ok(appSource.includes('if (touchStartedInBlockedRegion) return false;'), 'pull-refresh must ignore gestures from internal scrollers');
  assert.ok(appSource.includes('target.closest(\'[data-pull-refresh-block="true"]\')'), 'pull-refresh should support explicit blocked scroll regions');
  assert.ok(appSource.includes('isInternalScrollable'), 'pull-refresh should detect generic nested scroll containers');
  assert.ok(tradesTabSource.includes('data-pull-refresh-block="true"'), 'trade records list should not trigger global pull-refresh while scrolling records');
});

test('position clicks default to buy and trade records use ledger edit/delete flow', () => {
  assert.equal(tradesTabSource.includes("openTradeModal(position, 'sell')"), false, 'clicking a position row must not default to sell');
  assert.ok(tradesTabSource.includes("openTradeModal(position, 'buy')"), 'clicking a position row should open buy mode');
  assert.ok(tradesTabSource.includes("{ id: 'records', label: '交易记录', icon: ListChecks }"), 'stock settings tool should become trade records with a record icon');
  assert.ok(tradesTabSource.includes('const ledgerTradeRecords ='), 'trade records tool should render all stock_trades records');
  assert.ok(tradesTabSource.includes('setOrderActionTrade(trade)'), 'trade records should reuse the order action modal for edit/delete');
  assert.ok(tradesTabSource.includes('deleteStockTradeRecord(trade.id)'), 'trade records delete flow should still use the database-backed stock_trades delete path');
});

test('stock Chinese names are shared by home positions and trade records', () => {
  assert.ok(appSource.includes('stockTrades: localizedStockTrades'), 'investment summary should derive positions from localized stock trades');
  assert.ok(appSource.includes('displayStockName,'), 'tabs should receive the shared stock-name display helper');
  assert.ok(homeTabSource.includes('displayName: stockDisplayName(symbol, row?.name || quote?.name)'), 'home watchlist edit rows should use shared stock-name fallback');
  assert.ok(homeTabSource.includes('{item.displayName}'), 'home watchlist/positions table should render the localized display name');
  assert.ok(tradesTabSource.includes('stockDisplayName(position.symbol, position.name)'), 'trade positions should render localized stock names');
  assert.ok(tradesTabSource.includes('stockDisplayName(trade.symbol, trade.name)'), 'trade records and today orders should render localized stock names');
  assert.ok(tradesTabSource.includes('stockDisplayName(orderActionTrade.symbol, orderActionTrade.name)'), 'order action modal should render localized stock names');
});

test('QQQ and TQQQ stay English in the shared stock-name fallback', () => {
  assert.ok(appSource.includes("QQQ: 'QQQ'"), 'QQQ should display as the English code');
  assert.ok(appSource.includes("TQQQ: 'TQQQ'"), 'TQQQ should display as the English code');
  assert.equal(appSource.includes("QQQ: '纳斯达克100'"), false, 'QQQ must not be remapped to the old Chinese display name');
  assert.equal(appSource.includes("TQQQ: '3倍纳指'"), false, 'TQQQ must not be remapped to the old Chinese display name');
  assert.ok(appSource.includes("{ symbol: 'QQQ', name: 'QQQ' }"), 'QQQ benchmark option should also display in English');
});

test('asset module redesign keeps database logic while removing legacy controls', () => {
  assert.ok(analysisTabSource.includes('ASSET_GOLD'), 'asset page should use the redesigned dark/gold theme tokens');
  assert.ok(analysisTabSource.includes("import { marketHexColor } from '../lib/marketColorMode.js';"), 'asset page should reuse the home market color helper');
  assert.ok(analysisTabSource.includes('const ASSET_PINK = marketHexColor(-1);'), 'asset page pink accent should match the home pink token');
  assert.equal(analysisTabSource.includes("const ASSET_PINK = '#f56f98';"), false, 'asset page should not keep the old mismatched pink accent');
  assert.ok(analysisTabSource.includes('ASSET_PINK'), 'asset page should keep the pink accent for positive values and spouse assets');
  assert.ok(analysisTabSource.includes('ACCOUNT_TYPE_OPTIONS'), 'asset accounts should use the custom line-icon type grid');
  assert.ok(analysisTabSource.includes('Landmark'), 'bank accounts should use lucide line icons rather than emoji');
  assert.ok(analysisTabSource.includes('WalletCards'), 'payment accounts should use lucide line icons rather than emoji');
  assert.ok(analysisTabSource.includes('bg-black/[0.72]'), 'asset modals should use centered dark in-app overlays');
  assert.ok(analysisTabSource.includes('text-[#f5f7fb]'), 'asset modal inputs should force visible dark-theme text');
  assert.ok(analysisTabSource.includes('placeholder:text-[#6f7887]'), 'asset modal placeholders should stay visible on iOS keyboards');
  assert.ok(analysisTabSource.includes('db.insertAccount'), 'add account must keep the existing account insert path');
  assert.ok(analysisTabSource.includes('db.upsertSnapshot'), 'monthly balance saves must keep the existing snapshot upsert path');
  assert.ok(analysisTabSource.includes('db.deleteAccount'), 'account delete must keep the existing database-backed delete path');
  assert.ok(analysisTabSource.includes('db.updateAccount'), 'account edits must use the database-backed update path');
  assert.ok(dbSource.includes('export const updateAccount = async'), 'account metadata updates need a shared database helper');
  assert.ok(analysisTabSource.includes("if (currency === 'USD') return value * usdRate;"), 'USD balances must still convert with the existing daily fx rate');
  assert.ok(analysisTabSource.includes("if (currency === 'HKD') return value * hkdRate;"), 'HKD balances must still convert with the existing daily fx rate');
  assert.equal(analysisTabSource.includes('美元汇率'), false, 'manual USD rate control should not remain visible');
  assert.equal(analysisTabSource.includes('港币汇率'), false, 'manual HKD rate control should not remain visible');
  assert.equal(analysisTabSource.includes('setUsdRate'), false, 'asset tab should not expose manual USD rate editing');
  assert.equal(analysisTabSource.includes('setHkdRate'), false, 'asset tab should not expose manual HKD rate editing');
  assert.equal(analysisTabSource.includes('alert('), false, 'asset tab validation should not use native alert dialogs');
  assert.ok(settingsChangelogSource.includes('v10.7.9.109'), 'settings changelog should retain the latest asset account behavior');
  assert.ok(settingsChangelogSource.includes('优化资产账户显示和操作'), 'settings changelog should describe the asset account behavior update');
  assert.ok(settingsChangelogSource.includes('资产模块 UI 深色重设计'), 'settings changelog should describe the asset module redesign');
});

test('asset page visual shell and local preview stay debuggable', () => {
  assert.ok(appSource.includes("activeTab === 'analysis'"), 'asset tab must use the same dark shell as home and trades');
  assert.ok(authGateSource.includes("!isSupabaseConfigured && import.meta.env.DEV"), 'local missing-env mode must be development-only');
  assert.ok(authGateSource.includes('<DevVisualPreview />'), 'development missing-env mode should render the asset visual preview');
  assert.ok(devVisualPreviewSource.includes('makeSnapshots(baseAccounts)'), 'asset visual preview should provide deterministic local mock snapshots');
  assert.ok(devVisualPreviewSource.includes('updateAccount: async'), 'asset visual preview should support account edit smoke checks');
  assert.ok(devVisualPreviewSource.includes("deleteAccount: async () => ({})"), 'asset visual preview must not perform real database deletes');
  assert.ok(analysisTabSource.includes('assetDrawLine'), 'asset chart should keep the line drawing animation');
  assert.ok(analysisTabSource.includes('assetAreaFadeIn'), 'asset chart area should keep the fade-in animation');
  assert.ok(analysisTabSource.includes('assetDotPop'), 'asset chart points should keep the pop animation');
  assert.ok(analysisTabSource.includes('selectedChartChangePct'), 'asset chart point tooltip should include the month-over-month percentage');
  assert.ok(analysisTabSource.includes('const latestChartPoint = chartPoints[chartPoints.length - 1] || null'), 'asset chart should default the visible marker to the latest valid month');
  assert.ok(analysisTabSource.includes('const visibleChartMarkerMonthIdx'), 'asset chart should separate the visible marker from the clicked detail state');
  assert.ok(analysisTabSource.includes('const selectedChartDotDelay = chartSelectedMonthIdx !== null ? 0 : 900'), 'asset chart should let the default final marker appear after the line draw animation');
  assert.ok(analysisTabSource.includes('const selectedChartValue = chartSelectedMonthIdx !== null ? chartData[chartSelectedMonthIdx] : 0'), 'asset chart should keep the detail panel hidden until the user clicks a month');
  assert.ok(analysisTabSource.includes('const selected = visibleChartMarkerMonthIdx === p.i'), 'asset chart visible marker should only render for the selected or latest month');
  assert.ok(analysisTabSource.includes('r="13"'), 'asset chart should keep transparent hit targets for every month');
  assert.equal(analysisTabSource.includes('r={selected ? 5.8 : 4.4}'), false, 'asset chart should not render visible circles for every month');
  assert.ok(analysisTabSource.includes('chartLabelIndices'), 'asset chart x-axis should include a middle month label');
  assert.ok(analysisTabSource.includes('const chartLeft = 64'), 'asset chart first point should stay clear of y-axis labels');
  assert.ok(analysisTabSource.includes("className=\"flex min-h-[46px] min-w-0 items-center justify-center"), 'asset action buttons should stay compact and readable');
  assert.equal(analysisTabSource.includes('text-[48px]'), false, 'asset header number should not return to the oversized mobile font');
  assert.ok(settingsChangelogSource.includes('对齐资产页字号和走势图细节'), 'settings changelog should document the asset typography and chart fix');
});

test('asset account list hides zero-balance rows and uses action modal for edit/delete', () => {
  assert.ok(appSource.includes("type: ''"), 'new account state should not preselect bank type');
  assert.ok(analysisTabSource.includes("setNewAccount({ owner: '我', type: '', name: '', currency: 'CNY', icon: '', balance: '' })"), 'opening add account should reset to no selected type');
  assert.ok(analysisTabSource.includes('请选择账户类型'), 'add/edit account should require the user to choose a type');
  assert.ok(analysisTabSource.includes('const currentVisibleAccounts = (items) =>'), 'asset owner lists need a current-month visibility filter');
  assert.ok(analysisTabSource.includes('items.filter(acc => balanceAtMonthCNY(acc.id, currentMonth) !== 0)'), 'only zero current-month accounts should be hidden from owner lists');
  assert.ok(analysisTabSource.includes('visibleOwnerAccs.length'), 'owner account counts should reflect only visible current-month accounts');
  assert.ok(analysisTabSource.includes('setAccountActionId(acc.id)'), 'clicking an account row should open the action modal');
  assert.ok(analysisTabSource.includes('账户操作'), 'asset account action modal should be present');
  assert.ok(analysisTabSource.includes('修改账户'), 'asset account action modal should offer editing');
  assert.ok(analysisTabSource.includes('删除账户'), 'asset account action modal should offer deletion');
  assert.ok(analysisTabSource.includes('保存修改'), 'asset account edit modal should save changes');
  assert.equal(analysisTabSource.includes('title="删除"'), false, 'owner account rows must not keep a direct trailing delete button');
});

test('primary asset totals split decimal suffixes consistently', () => {
  assert.ok(amountDisplaySource.includes('splitCurrencyAmount'), 'shared amount helper should split integer and decimal parts');
  assert.ok(amountDisplaySource.includes("if (currency === 'CNY') return '¥'"), 'shared amount helper should preserve CNY prefix');
  assert.ok(homeTabSource.includes("import { splitCurrencyAmount } from '../lib/amountDisplay.js';"), 'home tab should use the shared split amount helper');
  assert.ok(homeTabSource.includes('const displayAssetMoney = splitCurrencyAmount(displayAssets, displayCurrency, 2)'), 'home total assets should split the decimal suffix');
  assert.ok(homeTabSource.includes('displayAssetMoney.decimal'), 'home total assets should render the decimal suffix separately');
  assert.ok(tradesTabSource.includes("import { splitCurrencyAmount } from '../lib/amountDisplay.js';"), 'trades tab should use the shared split amount helper');
  assert.ok(tradesTabSource.includes('const displayAssetMoney = splitCurrencyAmount(displayAssets, displayCurrency, 2)'), 'trades total assets should split the decimal suffix');
  assert.ok(tradesTabSource.includes('displayAssetMoney.decimal'), 'trades total assets should render the decimal suffix separately');
  assert.ok(analysisTabSource.includes("import { splitCurrencyAmount } from '../lib/amountDisplay.js';"), 'asset tab should use the shared split amount helper');
  assert.ok(analysisTabSource.includes("const totalNowMoney = splitCurrencyAmount(totalNow, 'CNY', 2)"), 'family total assets should split the decimal suffix');
  assert.ok(analysisTabSource.includes('totalNowMoney.decimal'), 'family total assets should render the decimal suffix separately');
  assert.ok(homeTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'home decimal suffix should be smaller and normal weight');
  assert.ok(tradesTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'trades decimal suffix should be smaller and normal weight');
  assert.ok(analysisTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'family asset decimal suffix should match the home header color and stay normal weight');
});

test('asset header card aligns with home and trade header sizing', () => {
  const sharedHeaderShell = 'rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]';
  assert.ok(homeTabSource.includes(sharedHeaderShell), 'home header should keep the shared header card shell');
  assert.ok(tradesTabSource.includes(sharedHeaderShell), 'trade header should keep the shared header card shell');
  assert.ok(analysisTabSource.includes(sharedHeaderShell), 'asset header should use the same header card shell');
  assert.ok(analysisTabSource.includes('text-[13px] font-normal text-white/70'), 'asset header title should match the home title tone');
  assert.ok(analysisTabSource.includes('mt-3 whitespace-nowrap text-[34px] font-normal leading-none tracking-normal text-[#ffd18a] tabular-nums'), 'family total amount should match the home amount position and color');
  assert.equal(analysisTabSource.includes('sm:text-[38px]'), false, 'asset header amount should not grow larger than home on wider screens');
  assert.ok(analysisTabSource.includes('mt-6 grid grid-cols-[1fr_1.12fr_0.96fr] divide-x divide-white/10'), 'asset header metrics should match the home/trade metric grid');
  assert.ok(settingsChangelogSource.includes('v10.7.9.148'), 'settings changelog should document the asset header alignment update');
  assert.ok(settingsChangelogSource.includes('资产头卡对齐首页'), 'settings changelog should describe the asset header alignment update');
});

test('asset and review module cards do not keep legacy scale interactions', () => {
  assert.equal(analysisTabSource.includes('text-left active:scale-[0.99] transition'), false, 'asset account rows should not scale on press or hover');
  assert.equal(reviewTabSource.includes('shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.995]'), false, 'north-star card should not keep module-level scale');
  assert.equal(reviewTabSource.includes('bg-[#0b0f14] p-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.99]'), false, 'current annual target card should not keep module-level scale');
  assert.equal(reviewTabSource.includes('bg-[#0b0f14] p-4 text-left active:scale-[0.99]'), false, 'future annual target cards should not keep module-level scale');
  assert.equal(reviewTabSource.includes('bg-[#0b1119] px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] active:scale-[0.99]'), false, 'discipline and review log cards should not keep module-level scale');
  assert.equal(reviewTabSource.includes('border-dashed border-[#f6b54b]/35 bg-[#f6b54b]/[0.035] py-3 text-[13px] font-normal text-[#f6b54b] active:scale-[0.99]'), false, 'full-width annual expand control should not keep card-like scale');
  assert.ok(settingsTabSource.includes('v10.7.9.149'), 'settings version badge should document the module scale removal update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.149'), 'settings changelog should document the module scale removal update');
  assert.ok(settingsChangelogSource.includes('资产和目标模块缩放移除'), 'settings changelog should describe the module scale removal update');
});

test('review target page uses dark mobile cards and click action modals', () => {
  assert.ok(appSource.includes("activeTab === 'review'"), 'review tab must use the same dark shell as home and assets');
  assert.ok(reviewTabSource.includes("const REVIEW_CARD = '#0b0f14'"), 'review page should share the dark card surface');
  assert.ok(reviewTabSource.includes('年度目标操作'), 'year cards should open an action panel');
  assert.ok(reviewTabSource.includes('修改年度数据'), 'year action panel should offer editing instead of a trailing edit icon');
  assert.ok(reviewTabSource.includes('SF Pro Display'), 'review money should use the same system number font as the home header');
  assert.ok(reviewTabSource.includes('fmtMoney(value, digits = 0)'), 'review money should render full comma-separated amounts without dense decimals');
  assert.equal(reviewTabSource.includes('fmtWan'), false, 'review money must not return to wan shorthand');
  assert.ok(reviewTabSource.includes('const splitMoney = (usdValue, digits = 2)'), 'north-star headline should split the decimal part for small-type rendering');
  assert.ok(reviewTabSource.includes('headlineGoalMoney = splitMoney(ageGoalAmountExact, 2)'), 'only the north-star headline should restore two decimals');
  assert.ok(reviewTabSource.includes('headlineGoalMoney.decimal'), 'north-star headline should render the decimal suffix separately');
  assert.ok(reviewTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'north-star headline decimal suffix should be visually smaller and normal weight');
  assert.equal(reviewTabSource.includes('money(ageGoalAmount, 2)'), false, 'other target amount surfaces should not return to two decimals');
  assert.ok(reviewTabSource.includes('function CompoundDetailModal'), 'north-star card should open a compound detail modal');
  assert.ok(reviewTabSource.includes('data-compound-detail="true"'), 'compound detail modal should have a stable visual verification hook');
  assert.ok(reviewTabSource.includes('{totalYears}年复利明细'), 'compound detail should title itself from the current plan years');
  assert.ok(reviewTabSource.includes('账户曲线'), 'compound detail should render the account curve section');
  assert.ok(reviewTabSource.includes('实际进度'), 'compound detail should compare actual progress with the plan');
  assert.ok(reviewTabSource.includes('每年收益'), 'compound detail should render the yearly income table');
  assert.ok(reviewTabSource.includes('w-[calc(100vw-16px)] max-w-[386px] overflow-y-auto overscroll-contain'), 'compound detail modal should be wider while remaining scrollable on mobile');
  assert.ok(reviewTabSource.includes('border border-[#f6b54b]/35'), 'compound detail modal should use the muted gold reference border instead of a bright white border');
  assert.ok(reviewTabSource.includes('border border-[#232b36]/80'), 'compound inner cards should not use bright white or gold borders');
  assert.ok(reviewTabSource.includes('border-l border-[#232b36]/90'), 'compound summary dividers should use low-contrast dark lines');
  assert.ok(reviewTabSource.includes('border border-[#202733]'), 'compound chart and yearly table should use muted dark borders');
  assert.ok(reviewTabSource.includes('divide-y divide-[#202733]'), 'compound yearly rows should use muted dark dividers');
  assert.ok(reviewTabSource.includes('text-[11px] text-[#8a909a]'), 'compound summary labels should use muted gray text');
  assert.ok(reviewTabSource.includes('text-[11px] text-[#8a909a]">实际进度'), 'compound actual-progress label should use muted gray text');
  assert.ok(reviewTabSource.includes('border-b border-[#202733] pb-2 text-[11px] text-[#8a909a]'), 'compound yearly table headers should use muted gray text and dividers');
  assert.equal(reviewTabSource.includes('border border-[#f6b54b]/15 bg-white/[0.032]'), false, 'compound summary card should not keep the overly bright accent border');
  assert.equal(reviewTabSource.includes('divide-y divide-white/[0.055]'), false, 'compound yearly table should not keep white row dividers');
  assert.equal(reviewTabSource.includes('stroke="rgba(255,255,255,0.07)"'), false, 'compound chart grid should not use white grid lines');
  assert.ok(reviewTabSource.includes('const xLabelIndexes = chartPoints.map((_, index) => index);'), 'compound chart should show every year label across the full plan');
  assert.ok(reviewTabSource.includes('fontSize="8" fontFamily={NUMBER_FONT}>{point.year}</text>'), 'compound chart year labels should stay small enough to fit all ten years');
  assert.ok(reviewTabSource.includes('mt-2 whitespace-nowrap text-[13px] font-normal leading-none tabular-nums'), 'compound summary numbers should stay compact for mobile');
  assert.ok(reviewTabSource.includes("valueClass: 'text-rose-400'"), 'compound accumulated gain should use the home pink amount color');
  assert.ok(reviewTabSource.includes('实际收益 <span className="text-rose-400 tabular-nums"'), 'compound actual gain should use the home pink amount color');
  assert.ok(reviewTabSource.includes('text-right text-rose-400 tabular-nums'), 'compound yearly gains should use the home pink amount color');
  assert.ok(reviewTabSource.includes('setShowCompoundDetails(true)'), 'north-star card should open compound details on click');
  assert.ok(reviewTabSource.includes('switchCurrency(item.key);'), 'currency switch should remain available inside the north-star card');
  assert.ok(reviewTabSource.includes('setShowPlanSettings(true);'), 'settings button should remain available inside the north-star card');
  assert.ok(reviewTabSource.includes('onKeyDown={(event) => event.stopPropagation()}'), 'nested north-star buttons should stop keyboard propagation');
  assert.ok(reviewTabSource.includes('h-[244px]'), 'north-star header card should stay more compact on mobile');
  assert.ok(reviewTabSource.includes('mb-1.5 mt-auto flex items-center justify-between gap-3'), 'north-star motto row should stay at the natural bottom position');
  assert.ok(reviewTabSource.includes('shrink-0 -translate-y-2 rounded-xl border border-white/10 bg-white/[0.045]'), 'north-star settings button should stay lifted with neutral styling');
  assert.ok(reviewTabSource.includes('relative z-10 mt-2 text-[12px] text-white/55'), 'north-star target subtitle should stay visually quieter');
  assert.ok(reviewTabSource.includes('mt-3 text-[12px] text-white/50'), 'north-star remaining-years line should match the smaller subtitle size');
  assert.ok(reviewTabSource.includes('text-[15px] font-semibold text-white">年度目标进度'), 'annual target section title should be slightly smaller');
  assert.ok(reviewTabSource.includes('text-[28px] font-semibold leading-none text-[#ffd18a]'), 'current annual year should use a lighter weight');
  assert.ok(reviewTabSource.includes('text-[22px] font-semibold leading-none text-white/55'), 'future annual years should use a lighter weight');
  assert.ok(reviewTabSource.includes('<div className="text-[11px] text-white/38">起点</div>'), 'future year start label should omit the parenthesized year');
  assert.ok(reviewTabSource.includes('<div className="text-[11px] text-white/38">目标</div>'), 'future year target label should omit the parenthesized year');
  assert.equal(reviewTabSource.includes('起点 ({yearItem.year - 1}目标)'), false, 'future year start label should not include the old year suffix');
  assert.equal(reviewTabSource.includes('目标 ({yearItem.year})'), false, 'future year target label should not include the old year suffix');
  assert.ok(reviewTabSource.includes('mt-1 text-[12px] font-normal text-white/35 tabular-nums'), 'future year start and target amounts should use neutral gray');
  assert.ok(reviewTabSource.includes('border-dashed border-white/25'), 'future year growth target guide line should be gray');
  assert.ok(reviewTabSource.includes('h-7 rounded-full px-2.5 text-[11px] font-normal'), 'review currency switch should match the home header size');
  assert.ok(reviewTabSource.includes('rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-'), 'north-star card should use the same weak border/shadow style as the home header');
  assert.ok(reviewTabSource.includes('rounded-[20px] border border-white/10 bg-[#0b0f14] p-4 text-left shadow-'), 'current year card should use the same weak border color as the north-star card');
  assert.equal(reviewTabSource.includes('border-[#f6b54b]/65'), false, 'current year card should not keep the bright yellow outline');
  assert.equal(reviewTabSource.includes('bottom-[-78px] h-48 w-48'), false, 'north-star card should not keep the lower-right semicircle decoration');
  assert.ok(reviewTabSource.includes('mt-5 -mx-2'), 'annual target section should expand wider than the page padding');
  assert.ok(reviewTabSource.includes('marketTextClass'), 'review pink/green amount colors should share the home market color helper');
  assert.equal(reviewTabSource.includes('rocket-particle rocket-particle'), false, 'review header should not render loose moving particle strips');
  assert.ok(appSource.includes('.progress-shine { position: relative; overflow: hidden; }'), 'progress shine must stay clipped inside the progress bar');
  assert.ok(reviewTabSource.includes('.progress-shine {'), 'review local preview should carry its own clipped progress shine styles');
  assert.ok(reviewTabSource.includes('targetGap'), 'current year card should show target gap/lag information');
  assert.ok(reviewTabSource.includes('plannedStartBalance'), 'future year cards should show the prior planned target start');
  assert.ok(reviewTabSource.includes('border-dashed border-[#f6b54b]/35'), 'annual goal list expand button should keep its reference accent');
  assert.ok(reviewTabSource.includes('mb-4 flex min-h-10 items-center justify-between gap-4'), 'discipline section title row should align with the add button');
  assert.ok(reviewTabSource.includes('text-[19px] font-semibold leading-none tracking-normal text-white">投资戒律'), 'discipline section title should use the smaller heading size');
  assert.ok(reviewTabSource.includes('h-5 w-1 shrink-0 rounded-full bg-[#f6a524]'), 'discipline section should use a shorter vertical accent bar');
  assert.equal(reviewTabSource.includes('{disciplines.length} 条'), false, 'discipline section should not show a duplicate count under the title');
  assert.ok(reviewTabSource.includes('flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035]'), 'discipline add button should use a smaller low-color pill style');
  assert.ok(reviewTabSource.includes("dotColor: '#18d66b'"), 'discipline level metadata should use colored dots instead of icons');
  assert.ok(reviewTabSource.includes('mb-4 flex gap-2.5 overflow-x-auto'), 'discipline filters should stay compact enough for the mobile reference row');
  assert.ok(reviewTabSource.includes('flex h-9 min-w-[54px] shrink-0 items-center justify-center gap-2'), 'discipline level filter pills should remain compact on 390px mobile');
  assert.ok(reviewTabSource.includes('className="h-2 w-2 rounded-full" style={{ backgroundColor: item.dotColor'), 'discipline filters should render compact colored dots');
  assert.ok(reviewTabSource.includes('style={{ backgroundColor: meta.ringColor, borderColor: meta.ringBorder }}'), 'discipline rows should render muted color rings');
  assert.ok(reviewTabSource.includes('function UsFlagBackground'), 'review page should define the shared faint US flag background');
  assert.ok(reviewTabSource.includes('data-us-flag-bg'), 'review page should expose a stable marker for the US flag background layer');
  assert.ok(reviewTabSource.includes('scale(1.7)'), 'review flag background should render recognizable larger stars');
  assert.ok(reviewTabSource.includes('linear-gradient(180deg, rgba(5,7,11,0.24)'), 'review flag background should keep a deeper dark readability overlay');
  assert.ok(reviewTabSource.includes('className="block w-full rounded-[22px] border border-white/[0.06] bg-[#0b1119] px-4 py-3.5'), 'discipline rows should use the tightened plain card surface');
  assert.equal(reviewTabSource.includes('<UsFlagBackground strength={0.2} shade={0.48} />'), false, 'discipline rows should not render the flag background');
  assert.ok(reviewTabSource.includes('text-[14px] font-normal leading-[1.52] text-white/80'), 'discipline text should use the tightened body size');
  assert.ok(reviewTabSource.includes('mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-white/35'), 'discipline and review metadata should match the detail modal gray treatment');
  assert.ok(reviewTabSource.includes('<span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{discipline.date}</span>'), 'discipline date should use the same muted numeric meta treatment as review details');
  assert.ok(reviewTabSource.includes('rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-0.5 text-[11px] text-white/42'), 'discipline pinned badge should be muted and smaller');
  assert.ok(reviewTabSource.includes('inline-flex items-center gap-1 text-white/38'), 'discipline expand action should be muted gray');
  assert.equal(reviewTabSource.includes('<span className="text-[15px]">{discipline.level}</span>'), false, 'discipline rows should not render legacy emoji level icons');
  assert.ok(appSource.includes('style={{ backgroundColor: l.ringColor, borderColor: l.ringBorder }}'), 'discipline edit modal should use colored dots for level choices');
  assert.equal(appSource.includes('<span className="text-base">{l.level}</span>'), false, 'discipline edit modal should not render emoji level icons');
  assert.ok(reviewTabSource.includes('function DisciplineDetailModal'), 'discipline rows should open a record detail modal');
  assert.ok(reviewTabSource.includes('记录详情'), 'discipline detail modal should use the record detail title');
  assert.ok(reviewTabSource.includes('<UsFlagBackground strength={0.64} shade={0.5} />'), 'discipline detail modal should include a clearly recognizable US flag background with a deeper readability mask');
  assert.ok(reviewTabSource.includes('min-h-[168px]'), 'discipline detail modal should reserve enough space for short content');
  assert.ok(reviewTabSource.includes('formatDisciplineDetailText(discipline.text)'), 'discipline detail modal should render the full text body');
  assert.ok(reviewTabSource.includes("discipline.pinned ? '取消置顶' : '置顶'"), 'discipline detail modal must keep pin/unpin');
  assert.ok(reviewTabSource.includes('grid grid-cols-3 gap-2'), 'discipline detail actions should use compact three-button layout');
  assert.ok(reviewTabSource.includes('flex h-9 items-center justify-center gap-1.5 rounded-full'), 'discipline detail action buttons should be compact pills');
  assert.equal(reviewTabSource.includes('删除戒律'), false, 'discipline detail modal should not keep the large legacy delete label');
  assert.equal(reviewTabSource.includes('修改戒律'), false, 'discipline detail modal should not keep the large legacy edit label');
  assert.ok(reviewTabSource.includes('return index >= currentYearIndex && index < currentYearIndex + 2'), 'annual target list should show only two years by default');
  assert.ok(reviewTabSource.includes('function ReviewLogDetailModal'), 'review logs should open a detail preview modal before editing');
  assert.ok(reviewTabSource.includes('复盘详情'), 'review log detail modal should use a dedicated detail title');
  assert.ok(reviewTabSource.includes('<UsFlagBackground strength={0.58} shade={0.52} />'), 'review log detail modal should include a clearly recognizable US flag background with a deeper readability mask');
  assert.ok(reviewTabSource.includes('min-h-[220px]'), 'review log detail modal should allow more preview space than discipline detail');
  assert.ok(reviewTabSource.includes('formatReviewLogDetailText(log.text)'), 'review log detail modal should render full review text');
  assert.ok(reviewTabSource.includes('setReviewLogAction(log)'), 'review log cards should open the preview modal');
  assert.ok(reviewTabSource.includes('openReviewLogEdit(reviewLogAction)'), 'review log detail modal should expose edit action');
  assert.ok(reviewTabSource.includes('deleteReviewLog(reviewLogAction)'), 'review log detail modal should expose delete action');
  assert.ok(reviewTabSource.includes('查看全文'), 'review log cards should preview longer text with a muted full-text hint');
  assert.equal(reviewTabSource.includes('<UsFlagBackground strength={0.18} shade={0.5} />'), false, 'review log cards should not render the flag background');
  assert.equal(reviewTabSource.includes('text-[13px] font-normal leading-[1.62] text-white/72'), false, 'review log cards should not keep the mismatched smaller body style');
  assert.ok(reviewTabSource.includes('role="button"'), 'discipline rows should avoid nested native buttons while remaining clickable');
  assert.equal(reviewTabSource.includes('融资杠杆监控'), false, 'leverage monitor card should be removed from the review page UI');
  assert.equal(reviewTabSource.includes('setShowEditMargin'), false, 'review page should not keep a leverage edit entry point');
  assert.equal(reviewTabSource.includes('1 USD = {fxRate.toFixed(2)} RMB'), false, 'review header should not show the fx rate helper text');
  assert.ok(devVisualPreviewSource.includes("['home', 'analysis', 'review'].includes(requestedTab)"), 'local visual preview should support opening home and review tabs directly');
  assert.ok(devVisualPreviewSource.includes("const HomeTab = lazy(() => import('./tabs/HomeTab.jsx'))"), 'local visual preview should be able to render the home page mock');
  assert.ok(devVisualPreviewSource.includes('<HomeTab ctx={homeCtx} />'), 'local visual preview should render the home page mock');
  assert.ok(devVisualPreviewSource.includes('<ReviewTab ctx={reviewCtx} />'), 'local visual preview should render the review page mock');
  assert.ok(devVisualPreviewSource.includes("props.onDelete ? '编辑复盘' : '写复盘'"), 'local visual preview should reflect review log edit state');
  assert.equal(homeTabSource.includes("FearIndexCards.tsx"), false, 'home should not import the high-fidelity fear index card components after rollback');
  assert.equal(homeTabSource.includes('<VixFearIndexCard'), false, 'home should not render the redesigned VIX fear index card after rollback');
  assert.equal(homeTabSource.includes('<FearGreedIndexCard'), false, 'home should not render the redesigned fear greed index card after rollback');
  assert.equal(homeTabSource.includes('data-home-fear-card'), false, 'home should not keep high-fidelity fear card visual markers after rollback');
  assert.ok(homeTabSource.includes('mt-3 grid grid-cols-2 gap-3'), 'home fear cards should render as compact side-by-side cards');
  assert.equal(homeTabSource.includes('mt-3 space-y-3'), false, 'home fear cards should not remain as stacked full-width cards');
  assert.ok(homeTabSource.includes('VIX 恐慌指数'), 'rollback should keep the inline VIX fear card title');
  assert.ok(homeTabSource.includes('CNN 恐慌贪婪指数'), 'rollback should keep the inline CNN fear greed card title');
  assert.ok(homeTabSource.includes('<FgiGauge value={fgi} />'), 'rollback should restore the old inline CNN gauge');
  assert.ok(homeTabSource.includes('text-[12px] font-normal text-white/60'), 'rollback should preserve the previous gray normal-weight VIX title');
  assert.ok(homeTabSource.includes('text-2xl font-normal text-emerald-400 tabular-nums'), 'rollback should preserve the previous normal-weight VIX value');
  assert.ok(settingsTabSource.includes('v10.7.9.149'), 'settings version badge should document the latest module scale removal update');
  assert.ok(settingsTabSource.includes("import('../lib/settingsChangelog.js')"), 'settings should lazy load the historical changelog chunk');
  assert.equal(settingsTabSource.includes('const changelog = ['), false, 'settings tab should not inline the historical changelog array');
  assert.ok(settingsChangelogSource.includes('v10.7.9.148'), 'settings changelog should document the asset header alignment update');
  assert.ok(settingsChangelogSource.includes('资产头卡对齐首页'), 'settings changelog should describe the asset header alignment update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.147'), 'settings changelog should document the no-white-padding PWA logo update');
  assert.ok(settingsChangelogSource.includes('PWA Logo 去白边'), 'settings changelog should describe the no-white-padding PWA logo update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.146'), 'settings changelog should document the transparent PWA logo update');
  assert.ok(settingsChangelogSource.includes('PWA 透明 Logo 替换'), 'settings changelog should describe the transparent PWA logo update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.145'), 'settings changelog should document the data maintenance cleanup update');
  assert.ok(settingsChangelogSource.includes('设置页维护入口清理'), 'settings changelog should describe the data maintenance cleanup update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.144'), 'settings changelog should document the reset and lazy-log update');
  assert.ok(settingsChangelogSource.includes('设置页日志懒加载与重置确认'), 'settings changelog should describe the reset and lazy-log update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.143'), 'settings changelog should retain the quote diagnostics update');
  assert.ok(settingsChangelogSource.includes('行情诊断日志'), 'settings changelog should describe quote diagnostic logs');
  assert.ok(settingsChangelogSource.includes('v10.7.9.142'), 'settings changelog should retain the tool quote websocket update');
  assert.ok(settingsChangelogSource.includes('工具行情 WebSocket 秒级推送'), 'settings changelog should describe the tool quote websocket update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.141'), 'settings changelog should document the stock websocket update');
  assert.ok(settingsChangelogSource.includes('交易持仓 WebSocket 秒级推送'), 'settings changelog should describe the stock websocket update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.140'), 'settings changelog should retain the indices websocket update');
  assert.ok(settingsChangelogSource.includes('三大指数 WebSocket 秒级推送'), 'settings changelog should describe the indices websocket update');
  assert.ok(settingsChangelogSource.includes('v10.7.9.139'), 'settings changelog should retain the asset chart detail visibility update');
  assert.ok(settingsChangelogSource.includes('资产走势图详情恢复点击显示'), 'settings changelog should describe the asset chart detail visibility update');
  assert.ok(settingsChangelogSource.includes('资产走势图点位修正'), 'settings changelog should retain the asset chart point history');
  assert.ok(settingsChangelogSource.includes('资产页粉色对齐首页'), 'settings changelog should retain the asset pink alignment history');
  assert.ok(settingsChangelogSource.includes('弹窗国旗背景保留'), 'settings changelog should retain the modal-only review flag background history');
  assert.ok(settingsChangelogSource.includes('投资戒律国旗背景增强'), 'settings changelog should retain the stronger review flag background history');
  assert.ok(settingsChangelogSource.includes('投资戒律和复盘日志国旗背景'), 'settings changelog should retain the previous review flag background history');
  assert.ok(settingsChangelogSource.includes('首页恐慌模块回退旧版小卡'), 'settings changelog should retain the fear card rollback history');
});

test('review edit modals use in-app validation instead of native alerts', () => {
  const disciplineStart = appSource.indexOf('function DisciplineModal');
  const disciplineEnd = appSource.indexOf('// 添加/编辑日志 Modal', disciplineStart);
  const disciplineBlock = appSource.slice(disciplineStart, disciplineEnd);
  const logStart = appSource.indexOf('function LogModal');
  const logEnd = appSource.indexOf('// 编辑年度实际数据 Modal', logStart);
  const logBlock = appSource.slice(logStart, logEnd);

  assert.ok(disciplineStart > -1 && disciplineEnd > disciplineStart, 'missing discipline modal boundary');
  assert.ok(logStart > -1 && logEnd > logStart, 'missing review log modal boundary');
  assert.equal(disciplineBlock.includes('alert('), false, 'discipline modal validation should not use native alert');
  assert.equal(logBlock.includes('alert('), false, 'review log modal validation should not use native alert');
  assert.ok(disciplineBlock.includes("setError('请输入内容')"), 'discipline modal should show an in-app validation message');
  assert.ok(logBlock.includes("setError('请输入内容')"), 'review log modal should show an in-app validation message');
});

test('order action modal stays compact like the current trade record reference', () => {
  assert.ok(tradesTabSource.includes('w-[calc(100vw-72px)] max-w-[360px]'), 'order action modal should use the narrower centered reference width');
  assert.ok(tradesTabSource.includes('rounded-[22px]'), 'order action modal should keep a compact rounded panel');
  assert.ok(tradesTabSource.includes('min-h-[48px]'), 'order action edit/delete buttons should not return to oversized cards');
  assert.ok(tradesTabSource.includes('min-h-[42px]'), 'order action cancel button should stay compact');
  assert.ok(tradesTabSource.includes('px-4 pb-4 pt-3'), 'order action button area should use compact vertical padding');
});

test('wave records keep editable notes and completed waves remain reachable', () => {
  assert.ok(tradesTabSource.includes('波段备注/计划'), 'wave add modal must keep a note/plan field');
  assert.ok(tradesTabSource.includes('completedWaveGroups'), 'completed waves need their own grouped data source');
  assert.ok(tradesTabSource.includes("setWaveView('completed')"), 'completed summary must switch into a completed-only view');
  assert.ok(tradesTabSource.includes("waveView === 'completed' ?"), 'completed waves must render as a separate category view');
  assert.ok(tradesTabSource.includes('key={`completed-${group.symbol}`}'), 'completed category must group rows by stock symbol');
  assert.ok(tradesTabSource.includes('saveWaveNote'), 'wave notes need a shared save helper');
  assert.ok(tradesTabSource.includes('清除'), 'wave note UI must provide an obvious clear action');
  assert.ok(appSource.includes('targetWaveId'), 'wave add path must attach notes to the computed wave id');
  assert.ok(appSource.includes('db.upsertWaveNote(targetWaveId, noteValue)'), 'wave add path must persist note/plan text');
});
