import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { splitCurrencyAmount } from '../src/lib/amountDisplay.js';
import { deriveHomeMarginOverview, homeMarginLeverageStatus, normalizeMarginDebtUsd } from '../src/lib/homeMarginRisk.js';
import { t } from '../src/lib/i18n.js';
import { marketTextClass } from '../src/lib/marketColorMode.js';

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing production fragment: ${start}`);
  return source.slice(from, to);
}

async function loadHeader(kind) {
  const home = kind === 'home';
  const source = readFileSync(new URL(`../src/tabs/${home ? 'Home' : 'Trades'}Tab.jsx`, import.meta.url), 'utf8');
  // Render the actual production declarations and hero JSX. Only unrelated
  // market widgets, account network effects and long trade tables are omitted.
  const helpers = home
    ? between(source, 'function num(', 'function fmtMarketPct(')
    : between(source, 'function toNumber(', 'function strongPnlClass(');
  const identity = home
    ? between(source, '  const summary =', '  const englishMode =')
      + source.match(/  const positions = summary\.activePositions \|\| \[\];/)[0]
    : between(source, '  const summary =', '  const quoteBySymbol =');
  const calculations = home
    ? between(source, '  const isCnyMode =', '  React.useEffect(() => {')
    : between(source, '  const rate =', '  const signedWaveCurrencyAmount =')
      + source.match(/  const pnlAmountClass = [^\n]+/)[0]
      + between(source, '  const availableCashIsSet =', '  const todayKey =');
  const heroStart = source.indexOf(`<section className="${kind}-report-hero"`);
  const heroEnd = source.indexOf('</section>', heroStart) + '</section>'.length;
  assert.ok(heroStart >= 0 && heroEnd > heroStart);
  const hero = source.slice(heroStart, heroEnd);
  const { code } = await transformWithOxc(`
    ${helpers}
    function Header({ ctx, capture }) {
      const {
        investmentSummary, availableCashStatus, marginStatus,
        availableCashStatusReady = false, marginStatusReady = false,
        language = 'zh', marketColorMode = 'red-up', usdRate,
        currencyMode = 'USD',
      } = ctx;
      const englishMode = language === 'en';
      const tt = (key, fallback, values) => t(language, key, fallback, values);
      const setCurrencyMode = () => {};
      const setShowAvailableCashEditor = () => {};
      const openPnlShare = () => {};
      const openPnlReport = () => {};
      const openHomeMarginRisk = () => {};
      ${identity}
      ${calculations}
      capture({ summary, positions, displayRate${home ? '' : ', displayHoldingPnl'} });
      return (${hero});
    }
  `, `${kind}-asset-header.jsx`, { jsx: { runtime: 'classic' } });
  const dependencies = {
    React, t, splitCurrencyAmount, deriveHomeMarginOverview, homeMarginLeverageStatus,
    normalizeMarginDebtUsd, marketTextClass, pnlColor: marketTextClass,
    NUMBER_FONT: 'sans-serif', TRADE_NUMBER_FONT: 'sans-serif', emptySummary: {},
    ChevronRight: () => null,
    AccountLeverageBadge: ({ tierId }) => React.createElement('i', { 'data-leverage-tier': tierId }),
  };
  return new Function('dependencies', `const { ${Object.keys(dependencies).join(', ')} } = dependencies; ${code}; return Header;`)(dependencies);
}

const sharedPosition = { symbol: 'NVDA', heldShares: 10, marketValue: 900_000 };
const sharedSummary = {
  activePositions: [sharedPosition], positions: [sharedPosition],
  totalAssetsUsd: 999_999, totalAssetsCny: 8_999_991,
  todayPnl: 888_888, todayPnlPct: 0.88, todayPnlLocked: false, hasTodayPnl: true,
  cumulativePnl: 777_777, cumulativePnlPct: 0.77,
  holdingPnl: 666_666, usdRate: 9,
};
const confirmedSnapshot = {
  marginDebtUsd: 2_000,
  summary: {
    totalAssetsUsd: 15_000, totalAssetsCny: 106_500,
    todayPnl: -123.45, todayPnlPct: -0.0123, todayPnlLocked: true, hasTodayPnl: true,
    cumulativePnl: 2_345.67, cumulativePnlPct: 0.2345, usdRate: 7.1,
  },
};

function context(overrides = {}) {
  return {
    investmentSummary: sharedSummary,
    availableCashStatus: { isSet: true, availableCashUsd: 500, writeReady: true },
    availableCashStatusReady: true,
    marginStatus: { currentMargin: 2_000 }, marginStatusReady: true,
    currencyMode: 'USD', ...overrides,
  };
}

function render(Header, ctx) {
  let underlying;
  const html = renderToStaticMarkup(React.createElement(Header, { ctx, capture: value => { underlying = value; } }));
  return { html, text: html.replace(/<[^>]*>/g, ''), underlying };
}

for (const kind of ['home', 'trades']) {
  const Header = await loadHeader(kind);

  test(`${kind}: an explicitly unavailable valuation renders placeholders instead of fallback assets`, () => {
    const { html, text } = render(Header, context({ headerAssetSnapshot: null }));
    assert.equal((text.match(/--/g) || []).length, 7, 'net assets, two P&L amounts/rates, total assets and leverage all stay unavailable');
    assert.doesNotMatch(text, /999,999|997,999|888,888|777,777|收盘锁定|NaN/);
    assert.match(text, /现金\$500\.00/);
    assert.match(text, /融资负债\$2,000\.00/);
    assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*data-${kind}-pnl-share-trigger="true"`));
    assert.doesNotMatch(html, /data-leverage-tier/);
  });

  test(`${kind}: all header amounts and lock state come from the confirmed snapshot`, () => {
    const { html, text } = render(Header, context({ headerAssetSnapshot: confirmedSnapshot }));
    assert.match(text, /\$13,000\.00/);
    assert.match(text, /总资产\$15,000\.00/);
    assert.match(text, /-\$123\.45-1\.23%收盘锁定/);
    assert.match(text, /\+\$2,345\.67\+23\.45%/);
    assert.match(text, /杠杆1\.15×/);
    assert.doesNotMatch(text, /999,999|997,999|888,888|777,777|--/);
    const shareButton = html.match(new RegExp(`<button[^>]*data-${kind}-pnl-share-trigger="true"[^>]*>`))[0];
    assert.doesNotMatch(shareButton, /disabled/);
  });

  test(`${kind}: snapshot FX is kept together while non-header positions retain the shared summary`, () => {
    const { text, underlying } = render(Header, context({ headerAssetSnapshot: confirmedSnapshot, currencyMode: 'CNY' }));
    assert.match(text, /¥92,300\.00/);
    assert.match(text, /总资产¥106,500\.00/);
    assert.match(text, /-¥876\.50/);
    assert.match(text, /\+¥16,654\.26/);
    assert.match(text, /现金¥3,550\.00/);
    assert.match(text, /融资负债¥14,200\.00/);
    assert.equal(underlying.summary, sharedSummary);
    assert.equal(underlying.positions, sharedSummary.activePositions);
    assert.equal(underlying.positions[0], sharedPosition);
    assert.equal(underlying.displayRate, 9, 'position tables and trade calculations retain their existing rate');
    if (kind === 'trades') assert.equal(underlying.displayHoldingPnl, 5_999_994);
  });

  test(`${kind}: omitting the snapshot field preserves existing visual-preview behavior`, () => {
    const { html, text } = render(Header, context());
    assert.match(text, /\$997,999\.00/);
    assert.match(text, /总资产\$999,999\.00/);
    assert.match(text, /\+\$888,888\.00\+88\.00%/);
    assert.match(text, /\+\$777,777\.00\+77\.00%/);
    assert.doesNotMatch(html.match(new RegExp(`<button[^>]*data-${kind}-pnl-share-trigger="true"[^>]*>`))[0], /disabled/);
  });
}
