import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../src/tabs/HomeTab.css', import.meta.url), 'utf8');
const trades = readFileSync(new URL('../src/tabs/TradesTab.css', import.meta.url), 'utf8');
const narrowMedia = '@media (max-width: 350px)';

function declarations(css, selector, narrow = false) {
  const mediaStart = css.indexOf(narrowMedia);
  assert.ok(mediaStart >= 0, 'both reports must retain the narrow-phone breakpoint');
  const scope = narrow ? css.slice(mediaStart + narrowMedia.length) : css.slice(0, mediaStart);
  const rules = [...scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some((candidate) => candidate.trim() === selector));
  assert.ok(rules.length > 0, `missing ${narrow ? 'narrow ' : ''}rule ${selector}`);
  return Object.fromEntries(rules.flatMap(([, , body]) => body.split(';').flatMap((entry) => {
    const separator = entry.indexOf(':');
    return separator < 0 ? [] : [[entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]];
  })));
}

function assertParity(suffix, properties, { narrow = false } = {}) {
  const homeRule = declarations(home, `.home-report-${suffix}`, narrow);
  const tradesRule = declarations(trades, `.trades-report-${suffix}`, narrow);
  for (const property of properties) {
    assert.ok(Object.hasOwn(tradesRule, property), `Trading baseline must define ${suffix} ${property}`);
    assert.equal(homeRule[property], tradesRule[property], `Home ${suffix} ${property} must match the Trading hero${narrow ? ' on narrow phones' : ''}`);
  }
}

test('Home follows the compact Trading hero geometry without changing other report modules', () => {
  assert.equal(declarations(trades, '.trades-report-hero').padding, '2px 2px 12px', 'the approved compact Trading hero remains the baseline');
  for (const [suffix, properties] of [
    ['hero', ['padding']],
    ['hero-header', ['display', 'align-items', 'justify-content', 'gap']],
    ['net-amount', ['margin-top', 'font-size', 'font-weight', 'line-height', 'letter-spacing']],
    ['decimal', ['font-size', 'letter-spacing']],
    ['label', ['gap', 'font-size', 'font-weight', 'line-height']],
    ['pnl-grid', ['display', 'grid-template-columns', 'gap', 'margin-top']],
    ['pnl-amount', ['margin-top', 'font-size', 'line-height', 'letter-spacing']],
    ['pnl-percent', ['gap', 'margin-top', 'font-size', 'line-height']],
    ['balances', ['display', 'grid-template-columns', 'gap', 'margin-top', 'padding-top']],
    ['balance-value', ['margin-top', 'font-size', 'line-height']],
    ['financing', ['grid-column', 'display', 'grid-template-columns', 'gap']],
    ['leverage', ['display', 'align-items', 'flex-wrap', 'gap', 'margin-top']],
  ]) assertParity(suffix, properties);

  const leverageHome = declarations(home, '.home-report-leverage .home-report-balance-value');
  const leverageTrades = declarations(trades, '.trades-report-leverage .trades-report-balance-value');
  assert.equal(leverageHome['margin-top'], leverageTrades['margin-top']);
  for (const css of [home, trades]) {
    const prefix = css === home ? 'home' : 'trades';
    assert.equal(declarations(css, `.${prefix}-report-balances`)['border-top'], undefined, 'no extra inner separator should add height to either hero');
  }
});

test('both hero currency controls and long-amount wrapping use the same sizing', () => {
  assertParity('currency', ['display', 'gap']);
  assertParity('currency button', ['height', 'padding', 'border-radius', 'font-size']);
  for (const suffix of ['net-amount', 'pnl-amount', 'balance-value']) {
    assertParity(suffix, ['overflow-wrap']);
    assert.equal(declarations(home, `.home-report-${suffix}`)['white-space'], undefined, 'Home must not prevent the same long amount from wrapping as Trading');
  }
});

test('Home and Trading keep matching hero insets, columns and balance fonts below 350px', () => {
  assertParity('hero', ['padding-inline'], { narrow: true });
  for (const suffix of ['pnl-grid', 'balances', 'financing']) {
    assertParity(suffix, ['column-gap'], { narrow: true });
  }
  assertParity('balance-value', ['font-size'], { narrow: true });
});
