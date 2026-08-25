import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildPnlShareMetricPresentation,
  createPnlShareRenderModel,
  PNL_SHARE_IMAGE_HEIGHT,
  PNL_SHARE_IMAGE_WIDTH,
  pnlShareToneColor,
  renderPnlShareCanvas,
} from '../src/lib/pnlShareImage.js';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const appSource = read('src/App.jsx');
const devPreviewSource = read('src/DevVisualPreview.jsx');
const tradesSource = read('src/tabs/TradesTab.jsx');
const pageSource = read('src/pages/PnlSharePage.jsx');
const imageSource = read('src/lib/pnlShareImage.js');
const i18nSource = read('src/lib/i18n.js');

function translationCount(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (i18nSource.match(new RegExp(`['"]${escaped}['"]\\s*:`, 'g')) || []).length;
}

function createCanvasRecorder() {
  const text = [];
  const gradient = { addColorStop() {} };
  const context = {
    arc() {},
    beginPath() {},
    clearRect() {},
    closePath() {},
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    fill() {},
    fillRect() {},
    fillText(value) { text.push({ value: String(value), color: this.fillStyle }); },
    lineTo() {},
    measureText(value) { return { width: String(value).length * 56 }; },
    moveTo() {},
    quadraticCurveTo() {},
    restore() {},
    rotate() {},
    save() {},
    setTransform() {},
    stroke() {},
    translate() {},
  };
  return {
    canvas: {
      width: 0,
      height: 0,
      getContext(kind) { return kind === '2d' ? context : null; },
    },
    text,
  };
}

test('Trading opens the share page only from Today P&L and preserves Total P&L reporting', () => {
  assert.ok(appSource.includes("lazy(() => import('./pages/PnlSharePage.jsx'))"));
  assert.ok(appSource.includes("setActivePage('pnl-share')"));
  assert.ok(appSource.includes("activePage === 'pnl-share'"));
  assert.ok(appSource.includes('<PnlSharePage'));
  for (const allowedProp of ['onClose={closePnlShare}', 'investmentSummary={investmentSummary}', 'language={language}', 'portfolioCurrencyMode={portfolioCurrencyMode}', 'usdRate={usdRate}']) {
    assert.ok(appSource.includes(allowedProp), `share page must receive ${allowedProp}`);
  }
  assert.equal(appSource.includes('<PnlSharePage ctx={tabCtx} />'), false);
  assert.ok(appSource.includes('isFullBleedPage = isPnlSharePage || isCommunityCompetitionPage'));
  assert.ok(appSource.includes('hideBottomNavigation = isPnlReportPage || isPnlSharePage;'));

  assert.equal((tradesSource.match(/onClick=\{openPnlShare\}/g) || []).length, 1);
  assert.ok(tradesSource.includes('data-trades-pnl-share-trigger="true"'));

  const shareTrigger = tradesSource.indexOf('data-trades-pnl-share-trigger="true"');
  const totalPnlTrigger = tradesSource.indexOf('onClick={openPnlReport}', shareTrigger);
  const marginTrigger = tradesSource.indexOf('data-trades-margin-trigger="true"', totalPnlTrigger);
  assert.ok(shareTrigger >= 0 && totalPnlTrigger > shareTrigger && marginTrigger > totalPnlTrigger);
  assert.ok(tradesSource.slice(totalPnlTrigger, marginTrigger).includes("tt('trades.totalPnl'"));

  assert.ok(devPreviewSource.includes("openPnlShare: () => setActiveTab('pnl-share')"));
  assert.ok(devPreviewSource.includes("activeTab === 'pnl-share'"));
  assert.ok(devPreviewSource.includes("'pnl-report', 'pnl-share', 'home-margin-risk'"));
  assert.ok(devPreviewSource.includes("preview === 'pnl-share' ? 'pnl-share'"));
  assert.ok(devPreviewSource.includes("activeTab !== 'pnl-report' && activeTab !== 'pnl-share' && ("));
});

test('share metrics reuse the formal summary and convert money without changing percentages', () => {
  const summary = {
    todayPnl: 10,
    todayPnlPct: 0.02,
    hasTodayPnl: true,
    holdingPnl: 200,
    holdingPnlPct: 0.1,
    cumulativePnl: 700,
    cumulativePnlPct: 700 / 1500,
  };

  assert.deepEqual(buildPnlShareMetricPresentation({ summary, metricId: 'daily', locale: 'en-US' }), {
    available: true,
    amountText: '+$10.00',
    percentText: '+2.00%',
    amountTone: 'gain',
    percentTone: 'gain',
  });
  assert.deepEqual(buildPnlShareMetricPresentation({
    summary,
    metricId: 'holding',
    currency: 'CNY',
    rate: 7.2,
    locale: 'en-US',
  }), {
    available: true,
    amountText: '+¥1,440.00',
    percentText: '+10.00%',
    amountTone: 'gain',
    percentTone: 'gain',
  });
  assert.deepEqual(buildPnlShareMetricPresentation({ summary, metricId: 'total', locale: 'en-US' }), {
    available: true,
    amountText: '+$700.00',
    percentText: '+46.67%',
    amountTone: 'gain',
    percentTone: 'gain',
  });

  assert.deepEqual(buildPnlShareMetricPresentation({
    summary: { cumulativePnl: -50, cumulativePnlPct: -0.025 },
    metricId: 'total',
    locale: 'en-US',
  }), {
    available: true,
    amountText: '-$50.00',
    percentText: '-2.50%',
    amountTone: 'loss',
    percentTone: 'loss',
  });
  assert.deepEqual(buildPnlShareMetricPresentation({
    summary: { holdingPnl: 0, holdingPnlPct: 0 },
    metricId: 'holding',
    locale: 'en-US',
  }), {
    available: true,
    amountText: '+$0.00',
    percentText: '+0.00%',
    amountTone: 'neutral',
    percentTone: 'neutral',
  });
  assert.deepEqual(buildPnlShareMetricPresentation({
    summary: { holdingPnl: -0.001, holdingPnlPct: -0.000001 },
    metricId: 'holding',
    locale: 'en-US',
  }), {
    available: true,
    amountText: '+$0.00',
    percentText: '+0.00%',
    amountTone: 'neutral',
    percentTone: 'neutral',
  });

  assert.deepEqual(buildPnlShareMetricPresentation({
    summary: { holdingPnl: -0.004, holdingPnlPct: -0.0004 },
    metricId: 'holding',
    locale: 'en-US',
  }), {
    available: true,
    amountText: '+$0.00',
    percentText: '-0.04%',
    amountTone: 'neutral',
    percentTone: 'loss',
  });
  assert.deepEqual(buildPnlShareMetricPresentation({
    summary: { holdingPnl: 20, holdingPnlPct: null },
    metricId: 'holding',
    locale: 'en-US',
  }), {
    available: true,
    amountText: '+$20.00',
    percentText: '暂不可用',
    amountTone: 'gain',
    percentTone: 'neutral',
  });
});

test('an unavailable daily result stays unavailable instead of becoming zero', () => {
  const result = buildPnlShareMetricPresentation({
    summary: { todayPnl: 0, todayPnlPct: 0, hasTodayPnl: false },
    metricId: 'daily',
    unavailableText: '暂不可用',
  });

  assert.deepEqual(result, {
    available: false,
    amountText: '—',
    percentText: '暂不可用',
    amountTone: 'neutral',
    percentTone: 'neutral',
  });
});

test('the renderer fixes the PNG canvas at 1200 by 1600 and ignores unknown private fields', () => {
  const input = {
    generatedText: '2026-08-25 21:30',
    marketLabel: '美股',
    metricLabel: '持仓收益',
    amountText: '+$200.00',
    percentText: '+10.00%',
    amountTone: 'gain',
    percentTone: 'gain',
    accountName: 'PRIVATE ACCOUNT',
    totalAssets: 'PRIVATE TOTAL ASSETS',
    symbol: 'PRIVATE SYMBOL',
    holdings: 'PRIVATE HOLDINGS',
  };
  const model = createPnlShareRenderModel(input);
  assert.deepEqual(Object.keys(model), [
    'generatedText',
    'marketLabel',
    'metricLabel',
    'amountText',
    'percentText',
    'amountTone',
    'percentTone',
    'accessibilityLabel',
  ]);

  const { canvas, text } = createCanvasRecorder();
  renderPnlShareCanvas(canvas, input);
  assert.equal(PNL_SHARE_IMAGE_WIDTH, 1200);
  assert.equal(PNL_SHARE_IMAGE_HEIGHT, 1600);
  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 1600);
  assert.deepEqual(text.find(item => item.value === '+$200.00'), {
    value: '+$200.00',
    color: '#ff4b1f',
  });
  assert.deepEqual(text.find(item => item.value === '+10.00%'), {
    value: '+10.00%',
    color: '#ff4b1f',
  });
  assert.equal(text.some(item => item.value.includes('PRIVATE')), false);

  const lossInput = {
    metricLabel: '持仓收益',
    amountText: '-$0.01',
    percentText: '+0.00%',
    amountTone: 'loss',
    percentTone: 'neutral',
  };
  const lossRecorder = createCanvasRecorder();
  renderPnlShareCanvas(lossRecorder.canvas, lossInput);
  assert.deepEqual(lossRecorder.text.find(item => item.value === '-$0.01'), {
    value: '-$0.01',
    color: '#22c55e',
  });
  assert.deepEqual(lossRecorder.text.find(item => item.value === '+0.00%'), {
    value: '+0.00%',
    color: 'rgba(255,255,255,0.94)',
  });
});

test('share-image tones use fixed red-up green-down colors and keep neutral values white', () => {
  assert.equal(pnlShareToneColor('gain'), '#ff4b1f');
  assert.equal(pnlShareToneColor('loss'), '#22c55e');
  assert.equal(pnlShareToneColor('neutral'), 'rgba(255,255,255,0.94)');
  assert.equal(pnlShareToneColor('unknown'), 'rgba(255,255,255,0.94)');
});

test('sharing is local-only, pre-generates the file, and safely handles iOS cancellation and downloads', () => {
  for (const marker of [
    'const [shareSnapshot] = React.useState',
    'summary: shareSnapshot.summary',
    'canvasToPngBlob(canvas)',
    'createPnlSharePngFile(blob, fileName)',
    'navigator.canShare({ files: [file] })',
    'navigator.share({',
    "error?.name === 'AbortError'",
    'URL.createObjectURL(asset.blob)',
    'URL.revokeObjectURL(url)',
    'renderVersionRef.current !== version',
    'asset.renderKey !== renderKey',
    'shareAsset.renderKey === renderKey',
  ]) {
    assert.ok(pageSource.includes(marker), `missing share safety marker: ${marker}`);
  }

  for (const forbidden of [
    'fetch(',
    'supabase',
    'stockTrades',
    'activePositions',
    'localStorage',
    'sessionStorage',
    'clipboard',
    'totalAssets',
    'accountManager',
    'user.id',
  ]) {
    assert.equal(pageSource.includes(forbidden), false, `share page must not consume ${forbidden}`);
    assert.equal(imageSource.includes(forbidden), false, `image renderer must not consume ${forbidden}`);
  }

  assert.equal(pageSource.includes('让结果留下，让情绪过去'), false);
  assert.equal(pageSource.includes('账户持仓总资产'), false);
  assert.equal(pageSource.includes('生成于 {{time}}'), false);
  assert.equal(i18nSource.includes("'pnlShare.generatedAt': '生成于 {{time}}'"), false);
  assert.equal(i18nSource.includes("'pnlShare.generatedAt': 'Generated {{time}}'"), false);
  assert.equal(pageSource.includes("tt('pnlShare.privacyLabel'"), false);
  assert.equal(imageSource.includes('drawPrivacyLock'), false);
  assert.ok(imageSource.includes('drawWarmGoldMotif'));
  assert.equal(imageSource.includes('收益走势'), false);
});

test('share-page system text is bilingual and visible CSS text never drops below 10px', () => {
  for (const key of [
    'trades.openPnlShare',
    'pnlShare.title',
    'pnlShare.back',
    'pnlShare.selectMetric',
    'pnlShare.privacyLabel',
    'pnlShare.generatedAt',
    'pnlShare.usMarket',
    'pnlShare.dailyReturn',
    'pnlShare.holdingReturn',
    'pnlShare.totalPnl',
    'pnlShare.unavailable',
    'pnlShare.previewLabel',
    'pnlShare.imageSpec',
    'pnlShare.saveImage',
    'pnlShare.share',
    'pnlShare.generating',
    'pnlShare.saveHint',
    'pnlShare.shareUnavailable',
    'pnlShare.shareFailed',
    'pnlShare.saveFailed',
    'pnlShare.fileName',
  ]) {
    assert.equal(translationCount(key), 2, `${key} must exist once in each language dictionary`);
  }

  const cssPixelSizes = [...pageSource.matchAll(/text-\[(\d+)px\]/g)].map(match => Number(match[1]));
  assert.ok(cssPixelSizes.length > 0);
  assert.equal(cssPixelSizes.some(size => size < 10), false);
});
