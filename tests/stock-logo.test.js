import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeStockLogoUrl, stockLogoCandidates } from '../src/lib/stockLogo.js';

const homeSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');

test('company logo candidates preserve cache and use the Home fallback chain', () => {
  const cached = 'https://cdn.example.com/tsm.png';
  assert.deepEqual(stockLogoCandidates('TSM', { url: cached }, '/img/logos/US/tsm.png'), [
    cached,
    'https://eodhd.com/img/logos/US/tsm.png',
    'https://eodhd.com/img/logos/US/TSM.png',
    'https://financialmodelingprep.com/image-stock/TSM.png',
    'https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/TSM.png',
  ]);
  assert.equal(normalizeStockLogoUrl({ url: cached }), cached);
  assert.equal(normalizeStockLogoUrl('javascript:alert(1)'), '');
});

test('Home imports the shared company-logo candidate logic instead of maintaining a second source list', () => {
  assert.ok(homeSource.includes("import { stockLogoCandidates } from '../lib/stockLogo.js'"));
  assert.equal(homeSource.includes('function logoUrlCandidates('), false);
  assert.equal(homeSource.includes('logoUrlCandidates('), false);
  assert.ok((homeSource.match(/stockLogoCandidates\(/g) || []).length >= 4);
});
