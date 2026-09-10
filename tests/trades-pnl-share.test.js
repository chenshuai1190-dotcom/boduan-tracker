import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { transformWithOxc } from 'vite';
import { isEnglishLanguage, t } from '../src/lib/i18n.js';

import {
  buildPnlShareMetricPresentation,
  createPnlShareRenderModel,
  PNL_SHARE_IMAGE_HEIGHT,
  PNL_SHARE_IMAGE_WIDTH,
  pnlShareToneColor,
  renderPnlShareCanvas,
} from '../src/lib/pnlShareImage.js';
import {
  PNL_SHARE_THEMES,
  normalizePnlShareTheme,
  drawPnlShareBackground,
} from '../src/lib/pnlShareThemes.js';
import {
  createPnlShareIdentity,
  loadPnlShareAvatarImage,
  pnlShareAvatarSource,
  sanitizePnlShareNickname,
} from '../src/lib/pnlShareIdentity.js';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const appSource = read('src/App.jsx');
const devPreviewSource = read('src/DevVisualPreview.jsx');
const homeSource = read('src/tabs/HomeTab.jsx');
const tradesSource = read('src/tabs/TradesTab.jsx');
const pageSource = read('src/pages/PnlSharePage.jsx');
const pageCss = read('src/pages/PnlSharePage.css');
const imageSource = read('src/lib/pnlShareImage.js');
const themesSource = read('src/lib/pnlShareThemes.js');
const i18nSource = read('src/lib/i18n.js');

function translationCount(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (i18nSource.match(new RegExp(`['"]${escaped}['"]\\s*:`, 'g')) || []).length;
}

function createCanvasRecorder() {
  const text = [];
  const drawnText = [];
  const images = [];
  const fills = [];
  const gradients = [];
  const paths = [];
  const strokes = [];
  const createGradient = (type, coordinates) => {
    const gradient = { type, coordinates, stops: [] };
    gradients.push(gradient);
    return { addColorStop(position, color) { gradient.stops.push({ position, color }); } };
  };
  const context = {
    letterSpacing: '0px',
    arc(...args) { paths.push(['arc', ...args]); },
    beginPath() {},
    clearRect() {
      text.length = 0;
      drawnText.length = 0;
      images.length = 0;
      fills.length = 0;
      gradients.length = 0;
      paths.length = 0;
      strokes.length = 0;
    },
    clip() {},
    closePath() {},
    createLinearGradient(...args) { return createGradient('linear', args); },
    createRadialGradient(...args) { return createGradient('radial', args); },
    fill() {},
    fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
    fillText(value, x, y, maxWidth) {
      text.push({ value: String(value), color: this.fillStyle });
      drawnText.push({ value: String(value), x, y, maxWidth, color: this.fillStyle, font: this.font, letterSpacing: this.letterSpacing });
    },
    drawImage(...args) { images.push(args); },
    lineTo(...args) { paths.push(['lineTo', ...args]); },
    measureText(value) { return { width: String(value).length * Number(this.font?.match(/([\d.]+)px/)?.[1] || 16) * .56 }; },
    moveTo(...args) { paths.push(['moveTo', ...args]); },
    quadraticCurveTo(...args) { paths.push(['quadraticCurveTo', ...args]); },
    bezierCurveTo(...args) { paths.push(['bezierCurveTo', ...args]); },
    restore() {},
    rotate() {},
    save() {},
    setTransform() {},
    stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth }); },
    translate() {},
  };
  return {
    canvas: {
      width: 0,
      height: 0,
      getContext(kind) { return kind === '2d' ? context : null; },
    },
    text,
    drawnText,
    images,
    fills,
    gradients,
    paths,
    strokes,
    context,
  };
}

const backgroundFingerprint = recorder => JSON.stringify({
  fills: recorder.fills,
  gradients: recorder.gradients,
  paths: recorder.paths,
  strokes: recorder.strokes,
});

function elements(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => elements(child, predicate))];
}

function elementText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(elementText).join('');
}

let pageCodePromise;
async function createSharePageHarness(initialProps) {
  pageCodePromise ||= transformWithOxc(
    pageSource.replace(/^import\b[\s\S]*?;\s*/gm, '').replace('export default function PnlSharePage', 'function PnlSharePage'),
    'PnlSharePage.jsx',
    { jsx: { runtime: 'classic' } },
  );
  const { code } = await pageCodePromise;
  const states = [];
  const refs = [];
  const effects = [];
  const pendingEffects = [];
  const exports = [];
  const shares = [];
  const downloads = [];
  const models = [];
  const recorder = createCanvasRecorder();
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let tree;
  let props = initialProps;
  const hooks = {
    ...React,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }];
    },
    useRef(initial) {
      const index = refIndex++;
      refs[index] ||= { current: initial };
      return refs[index];
    },
    useCallback(callback) { return callback; },
    useEffect(callback, dependencies) {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || !dependencies || dependencies.some((value, key) => !Object.is(value, previous.dependencies?.[key]))) {
        effects[index] = { dependencies, cleanup: previous?.cleanup };
        pendingEffects.push(() => {
          effects[index].cleanup?.();
          effects[index].cleanup = callback();
        });
      }
    },
  };
  const iconNames = pageSource.match(/import\s*\{([^}]+)\}\s*from ['"]lucide-react['"]/)?.[1].split(',').map(name => name.trim()) || [];
  const bindings = {
    React: hooks,
    ...Object.fromEntries(iconNames.map(name => [name, () => null])),
    isEnglishLanguage,
    t,
    createPnlShareIdentity,
    loadPnlShareAvatarImage: async () => ({ naturalWidth: 200, naturalHeight: 200 }),
    buildPnlShareMetricPresentation,
    PNL_SHARE_THEMES,
    normalizePnlShareTheme,
    PNL_SHARE_IMAGE_HEIGHT,
    PNL_SHARE_IMAGE_WIDTH,
    renderPnlShareCanvas(...args) {
      const model = renderPnlShareCanvas(...args);
      models.push(model);
      return model;
    },
    canvasToPngBlob() {
      const blob = { type: 'image/png', text: recorder.text.map(item => item.value), themeId: models.at(-1)?.themeId };
      return new Promise((resolve, reject) => exports.push({ blob, resolve: () => resolve(blob), reject }));
    },
    createPnlSharePngFile: (blob, name) => ({ blob, name, type: 'image/png' }),
    navigator: { canShare: () => true, share: async payload => { shares.push(payload); } },
    URL: { revokeObjectURL() {}, createObjectURL: blob => { downloads.push(blob); return 'blob:preview'; } },
    document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) },
    window: { setTimeout() {} },
  };
  const Page = new Function(...Object.keys(bindings), `${code}\nreturn PnlSharePage;`)(...Object.values(bindings));
  const harness = {
    exports, shares, downloads, models,
    render(nextProps = props) {
      props = nextProps;
      stateIndex = 0;
      refIndex = 0;
      effectIndex = 0;
      tree = Page(props);
      const canvas = elements(tree, node => node.type === 'canvas')[0];
      const ref = Object.getOwnPropertyDescriptor(canvas.props, 'ref')?.value || canvas.ref;
      ref.current = recorder.canvas;
      return tree;
    },
    async flushEffects() {
      for (const effect of pendingEffects.splice(0)) effect();
      await Promise.resolve();
      await Promise.resolve();
    },
    get canvas() { return elements(tree, node => node.type === 'canvas')[0]; },
    get privacy() { return elements(tree, node => node.props.role === 'switch')[0]; },
    get metricButtons() { return elements(tree, node => node.type === 'button' && node.props.className === 'pnl-share-metric'); },
    get themeButtons() { return elements(tree, node => node.type === 'button' && node.props['data-pnl-share-theme']); },
    get actionButtons() { return elements(tree, node => node.type === 'button' && node.props.className?.split(' ').includes('pnl-share-action')); },
  };
  harness.render();
  await harness.flushEffects();
  harness.render();
  await harness.flushEffects();
  harness.render();
  return harness;
}

test('Home and Trading open one shared image page from Today P&L while preserving Total P&L reporting', () => {
  assert.ok(appSource.includes("lazy(() => import('./pages/PnlSharePage.jsx'))"));
  assert.ok(appSource.includes("setActivePage('pnl-share')"));
  assert.ok(appSource.includes("activePage === 'pnl-share'"));
  assert.ok(appSource.includes('<PnlSharePage'));
  for (const allowedProp of ['onClose={closePnlShare}', 'investmentSummary={investmentSummary}', 'language={language}', 'portfolioCurrencyMode={portfolioCurrencyMode}', 'usdRate={usdRate}', 'communityIdentity={pnlShareIdentityState.identity}', 'communityIdentityStatus={pnlShareIdentityState.status}']) {
    assert.ok(appSource.includes(allowedProp), `share page must receive ${allowedProp}`);
  }
  assert.equal(appSource.includes('<PnlSharePage ctx={tabCtx} />'), false);
  assert.ok(appSource.includes('db.fetchPnlShareIdentity({ id: userId })'));
  assert.ok(appSource.includes('const identity = createPnlShareIdentity(profile);'));
  assert.ok(appSource.includes('isFullBleedPage = isPnlSharePage || isCommunityCompetitionPage'));
  assert.ok(appSource.includes('hideBottomNavigation = isPnlReportPage || isPnlSharePage;'));

  assert.equal((tradesSource.match(/onClick=\{openPnlShare\}/g) || []).length, 1);
  assert.ok(tradesSource.includes('data-trades-pnl-share-trigger="true"'));
  assert.equal((homeSource.match(/onClick=\{openPnlShare\}/g) || []).length, 1);
  assert.ok(homeSource.includes('data-home-pnl-share-trigger="true"'));
  assert.ok(homeSource.includes("t(language, 'home.openPnlShare', '分享今日盈亏')"));

  const shareTrigger = tradesSource.indexOf('data-trades-pnl-share-trigger="true"');
  const totalPnlTrigger = tradesSource.indexOf('onClick={openPnlReport}', shareTrigger);
  const marginTrigger = tradesSource.indexOf('data-trades-margin-trigger="true"', totalPnlTrigger);
  assert.ok(shareTrigger >= 0 && totalPnlTrigger > shareTrigger && marginTrigger > totalPnlTrigger);
  assert.ok(tradesSource.slice(totalPnlTrigger, marginTrigger).includes("tt('trades.totalPnl'"));

  const homeShareTrigger = homeSource.indexOf('data-home-pnl-share-trigger="true"');
  const homeTotalPnlTrigger = homeSource.indexOf('onClick={openPnlReport}', homeShareTrigger);
  const homeMarginTrigger = homeSource.indexOf('data-home-margin-trigger="true"', homeTotalPnlTrigger);
  assert.ok(homeShareTrigger >= 0 && homeTotalPnlTrigger > homeShareTrigger && homeMarginTrigger > homeTotalPnlTrigger);
  assert.ok(homeSource.slice(homeTotalPnlTrigger, homeMarginTrigger).includes("t(language, 'home.totalPnl'"));

  assert.equal((devPreviewSource.match(/openPnlShare: \(\) => setActiveTab\('pnl-share'\)/g) || []).length, 2);
  assert.ok(devPreviewSource.includes("activeTab === 'pnl-share'"));
  assert.ok(devPreviewSource.includes("'pnl-report', 'pnl-share', 'home-margin-risk'"));
  assert.ok(devPreviewSource.includes("preview === 'pnl-share' ? 'pnl-share'"));
  assert.ok(devPreviewSource.includes("communityIdentity={{ nickname: '波段玩家1836', avatarKey: 'gold' }}"));
  assert.ok(devPreviewSource.includes('communityIdentityStatus="ready"'));
  assert.ok(devPreviewSource.includes("activeTab !== 'pnl-report' && activeTab !== 'pnl-share' && ("));
});

test('share identity accepts only a validated nickname and allowlisted local avatar', async () => {
  assert.deepEqual(createPnlShareIdentity({
    nickname: '  陈\u0000 \u202e团团  ',
    avatarKey: 'cyber-cyan',
    avatarUrl: 'https://example.com/private.jpg',
    email: 'private@example.com',
  }), {
    nickname: '陈 团团',
    avatarKey: 'cyber-cyan',
  });
  assert.equal(Array.from(sanitizePnlShareNickname('😀'.repeat(17))).length, 16);
  assert.equal(createPnlShareIdentity({ nickname: '陈团团', avatarKey: '../../private' }), null);
  assert.equal(createPnlShareIdentity({ nickname: '陈', avatarKey: 'gold' }), null);
  assert.equal(pnlShareAvatarSource('gold'), '/community-avatars/avatar-human-gold.jpg');
  assert.equal(pnlShareAvatarSource('https://example.com/a.jpg'), '');

  class FakeImage {
    set src(value) {
      this.loadedSrc = value;
      queueMicrotask(() => this.onload?.());
    }
  }
  const image = await loadPnlShareAvatarImage('gold', { ImageCtor: FakeImage, timeoutMs: 1000 });
  assert.equal(image.loadedSrc, '/community-avatars/avatar-human-gold.jpg');
  await assert.rejects(
    loadPnlShareAvatarImage('data:image/png;base64,private', { ImageCtor: FakeImage, timeoutMs: 1000 }),
    /not allowlisted/,
  );
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
    amountText: '+10.00',
    currencyUnit: 'USD',
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
    amountText: '+1,440.00',
    currencyUnit: 'CNY',
    percentText: '+10.00%',
    amountTone: 'gain',
    percentTone: 'gain',
  });
  assert.deepEqual(buildPnlShareMetricPresentation({ summary, metricId: 'total', locale: 'en-US' }), {
    available: true,
    amountText: '+700.00',
    currencyUnit: 'USD',
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
    amountText: '-50.00',
    currencyUnit: 'USD',
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
    amountText: '+0.00',
    currencyUnit: 'USD',
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
    amountText: '+0.00',
    currencyUnit: 'USD',
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
    amountText: '+0.00',
    currencyUnit: 'USD',
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
    amountText: '+20.00',
    currencyUnit: 'USD',
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
    currencyUnit: '',
    percentText: '暂不可用',
    amountTone: 'neutral',
    percentTone: 'neutral',
  });
});

test('the renderer fixes the PNG canvas at 1200 by 1600 and ignores unknown private fields', () => {
  const input = {
    nickname: '陈团团',
    generatedText: '2026-08-25 21:30',
    marketLabel: '美股',
    metricLabel: '持仓收益',
    amountText: '+200.00',
    currencyUnit: 'USD',
    percentText: '+10.00%',
    amountTone: 'gain',
    percentTone: 'gain',
    accountName: 'PRIVATE ACCOUNT',
    totalAssets: 'PRIVATE TOTAL ASSETS',
    symbol: 'PRIVATE SYMBOL',
    holdings: 'PRIVATE HOLDINGS',
    avatarUrl: 'PRIVATE AVATAR URL',
    email: 'PRIVATE EMAIL',
  };
  const model = createPnlShareRenderModel(input);
  assert.equal(model.themeId, 'obsidian');
  assert.equal(model.showAmount, true, 'existing callers continue displaying the amount by default');
  assert.equal(Object.isFrozen(model), true);
  assert.equal(createPnlShareRenderModel({ currencyUnit: 'BTC' }).currencyUnit, '');
  assert.deepEqual(Object.keys(model), [
    'nickname',
    'generatedText',
    'marketLabel',
    'metricLabel',
    'themeId',
    'showAmount',
    'amountText',
    'currencyUnit',
    'percentText',
    'amountTone',
    'percentTone',
    'accessibilityLabel',
  ]);

  const { canvas, text, images } = createCanvasRecorder();
  const avatarImage = { naturalWidth: 200, naturalHeight: 160 };
  renderPnlShareCanvas(canvas, input, avatarImage);
  assert.equal(PNL_SHARE_IMAGE_WIDTH, 1200);
  assert.equal(PNL_SHARE_IMAGE_HEIGHT, 1600);
  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 1600);
  assert.deepEqual(text.find(item => item.value === '+200.00'), {
    value: '+200.00',
    color: '#ff4b1f',
  });
  assert.deepEqual(text.find(item => item.value === 'USD'), {
    value: 'USD',
    color: '#909099',
  });
  assert.deepEqual(text.find(item => item.value === '+10.00%'), {
    value: '+10.00%',
    color: '#ff4b1f',
  });
  assert.ok(text.some(item => item.value === '陈团团'));
  assert.equal(images.length, 1);
  assert.equal(images[0][0], avatarImage);
  assert.equal(text.some(item => item.value.includes('PRIVATE')), false);

  const lossInput = {
    metricLabel: '持仓收益',
    amountText: '-0.01',
    currencyUnit: 'CNY',
    percentText: '+0.00%',
    amountTone: 'loss',
    percentTone: 'neutral',
  };
  const lossRecorder = createCanvasRecorder();
  renderPnlShareCanvas(lossRecorder.canvas, lossInput);
  assert.deepEqual(lossRecorder.text.find(item => item.value === '-0.01'), {
    value: '-0.01',
    color: '#36c49a',
  });
  assert.deepEqual(lossRecorder.text.find(item => item.value === 'CNY'), {
    value: 'CNY',
    color: '#909099',
  });
  assert.deepEqual(lossRecorder.text.find(item => item.value === '+0.00%'), {
    value: '+0.00%',
    color: '#e1e1e6',
  });
});

test('share-image tones use fixed red-up green-down colors and keep neutral values white', () => {
  assert.equal(pnlShareToneColor('gain'), '#ff4b1f');
  assert.equal(pnlShareToneColor('loss'), '#36c49a');
  assert.equal(pnlShareToneColor('neutral'), '#e1e1e6');
  assert.equal(pnlShareToneColor('unknown'), '#e1e1e6');
});

test('hidden amounts are removed from both the render model and exported canvas text', () => {
  const input = {
    nickname: '陈团团',
    generatedText: '生成于 2026-09-10 21:30',
    marketLabel: '美股市场',
    metricLabel: '累计盈亏',
    amountText: '+789,654.32',
    currencyUnit: 'CNY',
    percentText: '+12.34%',
    amountTone: 'gain',
    percentTone: 'gain',
    accessibilityLabel: '累计盈亏 +789,654.32 CNY · +12.34%',
    totalAssets: 'PRIVATE TOTAL ASSETS',
    history: 'PRIVATE HISTORICAL CURVE',
  };
  assert.equal(createPnlShareRenderModel({ ...input, showAmount: true }).amountText, '+789,654.32');
  const hidden = createPnlShareRenderModel({ ...input, showAmount: false });
  assert.equal(hidden.showAmount, false);
  assert.equal(hidden.amountText, '');
  assert.equal(hidden.currencyUnit, '');
  assert.equal(hidden.accessibilityLabel, '', 'caller-supplied accessibility text must not retain the hidden amount');
  assert.equal(hidden.percentText, '+12.34%');
  assert.doesNotMatch(JSON.stringify(hidden), /789,654\.32|CNY|PRIVATE/);

  for (const { id: themeId } of PNL_SHARE_THEMES) {
    const recorder = createCanvasRecorder();
    renderPnlShareCanvas(recorder.canvas, { ...input, themeId });
    assert.ok(recorder.text.some(item => item.value === '+789,654.32'));
    const hiddenModel = renderPnlShareCanvas(recorder.canvas, { ...input, themeId, showAmount: false });
    assert.equal(hiddenModel.themeId, themeId);
    assert.equal(hiddenModel.amountText, '');
    assert.equal(hiddenModel.currencyUnit, '');
    assert.equal(hiddenModel.accessibilityLabel, '');
    assert.doesNotMatch(recorder.text.map(item => item.value).join(' · '), /789,654\.32|CNY|PRIVATE/);
    assert.ok(recorder.text.some(item => item.value === '+12.34%'));
    assert.equal(recorder.text.some(item => item.value === '—'), false, 'hiding a valid amount must not draw an amount placeholder');
  }
});

test('all share themes prioritize the amount above the percentage and enlarge only the percentage when the amount is hidden', () => {
  const input = {
    generatedText: '生成于 2026-09-10 21:30', marketLabel: '美股市场', metricLabel: '累计盈亏',
    amountText: '+12,345.67', currencyUnit: 'USD', percentText: '+12.34%',
    amountTone: 'gain', percentTone: 'gain',
  };
  const fontSize = item => Number(item.font.match(/([\d.]+)px/)[1]);
  assert.doesNotMatch(imageSource + themesSource + pageSource + pageCss, /drawWarmGoldMotif|246,\s*181,\s*75|#f6b54b|#ffd18a/);
  assert.doesNotMatch(imageSource, /context\.stroke\(/, 'the poster does not invent a result curve or retain a decorative outer stroke');
  assert.doesNotMatch(pageSource + pageCss, /letter-spacing:\s*-|letterSpacing:\s*['"]?-|tracking-(?:tight|tighter)|tracking-\[-/);
  for (const { id: themeId } of PNL_SHARE_THEMES) {
    const visible = createCanvasRecorder();
    visible.context.letterSpacing = '-2px';
    renderPnlShareCanvas(visible.canvas, { ...input, themeId });
    const amount = visible.drawnText.find(item => item.value === input.amountText);
    const percent = visible.drawnText.find(item => item.value === input.percentText);
    const unit = visible.drawnText.find(item => item.value === 'USD');
    assert.ok(fontSize(amount) > fontSize(percent), `${themeId}: the visible amount is the primary result`);
    assert.ok(fontSize(percent) > fontSize(unit), `${themeId}: the percentage is secondary and larger than the currency`);
    assert.ok(amount.y < percent.y, `${themeId}: the amount appears above the percentage`);
    assert.equal(amount.x, percent.x, 'the metric hierarchy shares a readable alignment');
    assert.ok(visible.fills.some(fill => fill.x === 0 && fill.y === 0 && fill.width === 1200 && fill.height === 1600));

    const hidden = createCanvasRecorder();
    hidden.context.letterSpacing = '-2px';
    const hiddenModel = renderPnlShareCanvas(hidden.canvas, { ...input, themeId, showAmount: false, amountTone: 'loss' });
    const hiddenPercent = hidden.drawnText.find(item => item.value === input.percentText);
    assert.ok(fontSize(hiddenPercent) > fontSize(percent), `${themeId}: hiding the amount enlarges the remaining percentage`);
    assert.ok(fontSize(hiddenPercent) > fontSize(amount));
    assert.equal(hiddenModel.amountText, '');
    assert.equal(hiddenModel.currencyUnit, '');
    assert.equal(hiddenModel.accessibilityLabel, '');
    assert.doesNotMatch(hidden.text.map(item => item.value).join(' '), /12,345\.67|USD/);
    assert.equal(backgroundFingerprint(hidden), backgroundFingerprint(visible), 'chosen backgrounds do not depend on financial values or the hidden amount tone');
    for (const item of [...visible.drawnText, ...hidden.drawnText]) {
      assert.equal(item.letterSpacing, '0px', 'reused Canvas state must not compress letter spacing');
      assert.equal(item.maxWidth, undefined, 'Canvas must wrap or resize text instead of horizontally compressing glyphs');
      assert.match(item.font, /^400 /);
      assert.ok(fontSize(item) >= 36, 'export metadata remains legible at mobile preview size');
    }
  }
});

test('share themes are a closed four-theme catalog with deterministic distinct backgrounds and a safe fallback', () => {
  const ids = ['obsidian', 'aurora', 'ember', 'glacier'];
  assert.deepEqual(PNL_SHARE_THEMES.map(theme => theme.id), ids);
  assert.equal(Object.isFrozen(PNL_SHARE_THEMES), true);
  const fingerprints = new Map();
  for (const theme of PNL_SHARE_THEMES) {
    assert.equal(Object.isFrozen(theme), true);
    assert.deepEqual(Object.keys(theme).sort(), ['id', 'labelFallback', 'labelKey', 'swatchBackground']);
    assert.ok(theme.labelFallback && theme.labelKey && theme.swatchBackground);
    assert.equal(translationCount(theme.labelKey), 2, `${theme.id} has a label in both languages`);
    assert.doesNotMatch(theme.swatchBackground, /url\s*\(/i, 'theme swatches cannot fetch arbitrary image URLs');
    assert.equal(normalizePnlShareTheme(theme.id), theme.id);
    assert.equal(createPnlShareRenderModel({ themeId: theme.id }).themeId, theme.id);
    const recorder = createCanvasRecorder();
    assert.equal(drawPnlShareBackground(recorder.context, theme.id), theme.id);
    assert.equal(recorder.text.length, 0, 'themes only draw decoration, never financial values');
    assert.equal(recorder.images.length, 0, 'backgrounds do not load arbitrary images');
    assert.ok(recorder.fills.some(fill => fill.x === 0 && fill.y === 0 && fill.width === 1200 && fill.height === 1600));
    fingerprints.set(theme.id, backgroundFingerprint(recorder));
    const again = createCanvasRecorder();
    drawPnlShareBackground(again.context, theme.id);
    assert.equal(backgroundFingerprint(again), fingerprints.get(theme.id), 'the same theme renders deterministically');
  }
  assert.equal(new Set(fingerprints.values()).size, 4, 'all four choices produce different drawing operations');
  for (const unknown of [undefined, null, '', 'unknown', '__proto__', 'https://example.com/private.png', { id: 'aurora' }]) {
    assert.equal(normalizePnlShareTheme(unknown), 'obsidian');
    assert.equal(createPnlShareRenderModel({ themeId: unknown }).themeId, 'obsidian');
    const recorder = createCanvasRecorder();
    assert.equal(drawPnlShareBackground(recorder.context, unknown), 'obsidian');
    assert.equal(backgroundFingerprint(recorder), fingerprints.get('obsidian'));
  }
});

test('very long allowed amounts remain complete by wrapping at normal letter spacing', () => {
  const longAmount = `+${'1'.repeat(44)}.23`;
  const recorder = createCanvasRecorder();
  const model = renderPnlShareCanvas(recorder.canvas, {
    amountText: longAmount, currencyUnit: 'CNY', percentText: '暂不可用', amountTone: 'gain', percentTone: 'neutral',
  });
  const amountLines = recorder.drawnText.filter(item => item.color === '#ff4b1f');
  assert.ok(amountLines.length > 1, 'an amount exceeding the minimum-font width uses multiple lines');
  assert.equal(amountLines.map(item => item.value).join(''), model.amountText);
  assert.equal(model.amountText, longAmount);
  assert.ok(amountLines.every(item => item.letterSpacing === '0px' && item.maxWidth === undefined));
  assert.ok(amountLines[1].y > amountLines[0].y);
});

const pageProps = {
  onClose: () => {},
  investmentSummary: {
    todayPnl: 10, todayPnlPct: .02, hasTodayPnl: true,
    holdingPnl: 200, holdingPnlPct: .1,
    cumulativePnl: 700, cumulativePnlPct: 700 / 1500,
    usdRate: 7.2,
  },
  communityIdentity: { nickname: '陈团团', avatarKey: 'gold' },
  communityIdentityStatus: 'ready',
  portfolioCurrencyMode: 'CNY',
  language: 'zh',
};

test('amount visibility immediately updates aria and invalidates old share files, including late exports', async () => {
  const h = await createSharePageHarness(pageProps);
  assert.equal(h.exports.length, 1);
  assert.equal(h.privacy.props['aria-checked'], true);
  assert.match(h.canvas.props['aria-label'], /\+72\.00 CNY/);
  h.exports[0].resolve();
  await h.flushEffects();
  h.render();
  assert.ok(h.actionButtons.every(button => button.props.disabled === false));

  h.privacy.props.onClick();
  h.render();
  assert.equal(h.privacy.props['aria-checked'], false);
  assert.doesNotMatch(h.canvas.props['aria-label'], /72\.00|CNY/);
  assert.match(h.canvas.props['aria-label'], /\+2\.00%/);
  assert.ok(h.actionButtons.every(button => button.props.disabled === true), 'the previous unmasked file is unavailable immediately, before the new export finishes');
  h.actionButtons[1].props.onClick();
  assert.equal(h.shares.length, 0, 'the handler must also reject a stale unmasked file');
  assert.equal(h.downloads.length, 0);
  await h.flushEffects();
  assert.equal(h.exports.length, 2);
  assert.equal(h.models.at(-1).showAmount, false);
  assert.doesNotMatch(JSON.stringify(h.exports[1].blob), /72\.00|CNY/);
  h.exports[1].resolve();
  await h.flushEffects();
  h.render();
  h.actionButtons[1].props.onClick();
  assert.equal(h.shares.length, 1);
  assert.doesNotMatch(JSON.stringify(h.shares[0]), /72\.00|CNY/);

  h.privacy.props.onClick();
  h.render();
  await h.flushEffects();
  assert.equal(h.exports.length, 3);
  h.privacy.props.onClick();
  h.render();
  await h.flushEffects();
  assert.equal(h.exports.length, 4);
  h.exports[2].resolve();
  await h.flushEffects();
  h.render();
  assert.ok(h.actionButtons.every(button => button.props.disabled === true), 'a late unmasked render cannot replace the pending masked file');
  h.exports[3].resolve();
  await h.flushEffects();
  h.render();
  assert.ok(h.actionButtons.every(button => button.props.disabled === false));
  assert.doesNotMatch(h.canvas.props['aria-label'], /72\.00|CNY/);
  h.actionButtons[1].props.onClick();
  assert.doesNotMatch(JSON.stringify(h.shares.at(-1)), /72\.00|CNY/);
});

test('theme selection immediately invalidates the old asset and rejects a late previous-theme export', async () => {
  const h = await createSharePageHarness(pageProps);
  assert.deepEqual(h.themeButtons.map(button => button.props['data-pnl-share-theme']), PNL_SHARE_THEMES.map(theme => theme.id));
  assert.equal(h.themeButtons.filter(button => button.props['aria-pressed']).length, 1);
  assert.equal(h.themeButtons[0].props['aria-pressed'], true);
  for (let index = 0; index < PNL_SHARE_THEMES.length; index += 1) {
    const theme = PNL_SHARE_THEMES[index];
    assert.equal(elementText(h.themeButtons[index]), t('zh', theme.labelKey, theme.labelFallback));
  }
  const capturedTime = h.models[0].generatedText;
  h.exports[0].resolve();
  await h.flushEffects();
  h.render();
  assert.ok(h.actionButtons.every(button => button.props.disabled === false));

  h.themeButtons[1].props.onClick();
  h.render();
  assert.equal(h.themeButtons[1].props['aria-pressed'], true);
  assert.equal(h.themeButtons.filter(button => button.props['aria-pressed']).length, 1);
  assert.ok(h.canvas.props['aria-label'].includes(t('zh', PNL_SHARE_THEMES[1].labelKey, PNL_SHARE_THEMES[1].labelFallback)));
  assert.ok(h.actionButtons.every(button => button.props.disabled === true), 'the old background cannot be shared even before the new effect runs');
  for (const button of h.actionButtons) await button.props.onClick();
  assert.equal(h.shares.length, 0);
  assert.equal(h.downloads.length, 0);
  await h.flushEffects();
  assert.equal(h.exports.length, 2);
  assert.equal(h.models.at(-1).themeId, 'aurora');

  h.themeButtons[2].props.onClick();
  h.render();
  await h.flushEffects();
  assert.equal(h.exports.length, 3);
  assert.equal(h.models.at(-1).themeId, 'ember');
  h.exports[1].resolve();
  await h.flushEffects();
  h.render();
  assert.ok(h.actionButtons.every(button => button.props.disabled === true), 'a late aurora blob must not become shareable while ember is pending');
  await h.actionButtons[1].props.onClick();
  assert.equal(h.shares.length, 0);

  h.exports[2].resolve();
  await h.flushEffects();
  h.render();
  assert.ok(h.actionButtons.every(button => button.props.disabled === false));
  await h.actionButtons[1].props.onClick();
  assert.equal(h.shares.length, 1);
  assert.equal(h.shares[0].files[0].blob.themeId, 'ember');
  assert.equal(h.models.at(-1).nickname, '陈团团');
  assert.equal(h.models.at(-1).amountText, '+72.00');
  assert.equal(h.models.at(-1).percentText, '+2.00%');
  assert.equal(h.models.at(-1).generatedText, capturedTime);
});

test('every page theme preserves amount privacy in aria and the actual shared export', async () => {
  const h = await createSharePageHarness(pageProps);
  const capturedTime = h.models[0].generatedText;
  h.privacy.props.onClick();
  h.render();
  await h.flushEffects();
  for (let index = 0; index < PNL_SHARE_THEMES.length; index += 1) {
    const theme = PNL_SHARE_THEMES[index];
    h.themeButtons[index].props.onClick();
    h.render();
    await h.flushEffects();
    assert.equal(h.privacy.props['aria-checked'], false, 'background changes must not reset the privacy choice');
    assert.equal(h.themeButtons[index].props['aria-pressed'], true);
    assert.equal(h.themeButtons.filter(button => button.props['aria-pressed']).length, 1);
    assert.ok(h.canvas.props['aria-label'].includes(t('zh', theme.labelKey, theme.labelFallback)));
    assert.doesNotMatch(h.canvas.props['aria-label'], /72\.00|CNY/);
    assert.match(h.canvas.props['aria-label'], /\+2\.00%/);
    assert.equal(h.models.at(-1).themeId, theme.id);
    assert.equal(h.models.at(-1).showAmount, false);
    assert.equal(h.models.at(-1).nickname, '陈团团');
    assert.equal(h.models.at(-1).generatedText, capturedTime);
    assert.equal(h.models.at(-1).amountText, '');
    assert.equal(h.models.at(-1).currencyUnit, '');
    assert.equal(h.models.at(-1).accessibilityLabel, '');
    const latestExport = h.exports.at(-1);
    assert.equal(latestExport.blob.themeId, theme.id);
    assert.doesNotMatch(JSON.stringify(latestExport.blob), /72\.00|CNY/);
    latestExport.resolve();
    await h.flushEffects();
    h.render();
    assert.ok(h.actionButtons.every(button => button.props.disabled === false));
    await h.actionButtons[1].props.onClick();
    assert.equal(h.shares.length, index + 1);
    assert.equal(h.shares.at(-1).files[0].blob.themeId, theme.id);
    assert.doesNotMatch(JSON.stringify(h.shares.at(-1)), /72\.00|CNY/);
  }
});

test('all three page selections keep the captured formal summary and currency after live props change', async () => {
  const h = await createSharePageHarness(pageProps);
  assert.equal(h.metricButtons.length, 3);
  const capturedTime = h.models[0].generatedText;
  h.render({
    ...pageProps,
    portfolioCurrencyMode: 'USD',
    investmentSummary: {
      todayPnl: 999999, todayPnlPct: 9, hasTodayPnl: true,
      holdingPnl: 999999, holdingPnlPct: 9,
      cumulativePnl: 999999, cumulativePnlPct: 9,
      usdRate: 99,
    },
  });
  const expected = [['当日收益', '+72.00', '+2.00%'], ['持仓收益', '+1,440.00', '+10.00%'], ['累计盈亏', '+5,040.00', '+46.67%']];
  for (let index = 0; index < expected.length; index += 1) {
    h.metricButtons[index].props.onClick();
    h.render();
    await h.flushEffects();
    h.render();
    const [label, amountText, percentText] = expected[index];
    assert.equal(elementText(h.metricButtons[index]), label);
    assert.equal(h.metricButtons.filter(button => button.props['aria-pressed']).length, 1);
    assert.equal(h.metricButtons[index].props['aria-pressed'], true);
    assert.equal(h.models.at(-1).amountText, amountText);
    assert.equal(h.models.at(-1).currencyUnit, 'CNY');
    assert.equal(h.models.at(-1).percentText, percentText);
    assert.equal(h.models.at(-1).generatedText, capturedTime);
  }
});

test('sharing is local-only, pre-generates the file, and safely handles iOS cancellation and downloads', () => {
  for (const marker of [
    'const [shareSnapshot] = React.useState',
    'const [identitySnapshot, setIdentitySnapshot] = React.useState',
    'summary: shareSnapshot.summary',
    'loadPnlShareAvatarImage(identitySnapshot.avatarKey)',
    'nickname: identitySnapshot.nickname',
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
    'avatarUrl',
    'avatarSrc',
    'email',
  ]) {
    assert.equal(pageSource.includes(forbidden), false, `share page must not consume ${forbidden}`);
    assert.equal(imageSource.includes(forbidden), false, `image renderer must not consume ${forbidden}`);
    assert.equal(themesSource.includes(forbidden), false, `theme artwork must not consume ${forbidden}`);
  }

  assert.equal(pageSource.includes('让结果留下，让情绪过去'), false);
  assert.equal(pageSource.includes('账户持仓总资产'), false);
  assert.ok(pageSource.includes('生成于 {{time}}'));
  assert.ok(i18nSource.includes("'pnlShare.generatedAt': '生成于 {{time}}'"));
  assert.ok(i18nSource.includes("'pnlShare.generatedAt': 'Generated {{time}}'"));
  assert.equal(pageSource.includes("tt('pnlShare.privacyLabel'"), false);
  assert.equal(imageSource.includes('drawPrivacyLock'), false);
  assert.equal(imageSource.includes('drawWarmGoldMotif'), false);
  assert.equal(imageSource.includes('收益走势'), false);
});

test('share-page system text is bilingual and visible CSS text never drops below 10px', () => {
  for (const key of [
    'trades.openPnlShare',
    'home.openPnlShare',
    'pnlShare.title',
    'pnlShare.back',
    'pnlShare.selectMetric',
    'pnlShare.privacyLabel',
    'pnlShare.showAmount',
    'pnlShare.chooseTheme',
    'pnlShare.generatedAt',
    'pnlShare.identityUnavailable',
    'pnlShare.identityUnavailableShort',
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

  const cssPixelSizes = [
    ...[...pageSource.matchAll(/text-\[([\d.]+)px\]/g)].map(match => Number(match[1])),
    ...[...pageCss.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])),
  ];
  assert.ok(cssPixelSizes.length > 0);
  assert.equal(cssPixelSizes.some(size => size < 10), false);
});
