import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { fearGreedDisplay } from '../src/lib/fearGreedDisplay.js';
import { normalizeFearGreed } from '../src/lib/fearGreed.js';
import { MARKET_GREEN_HEX, MARKET_RED_HEX } from '../src/lib/marketColorMode.js';

const pageUrl = new URL('../src/pages/FearGreedPage.jsx', import.meta.url);
const source = readFileSync(pageUrl, 'utf8');
const recorded = JSON.parse(readFileSync(new URL('../src/dev/fixtures/cnnFearGreedSnapshot.json', import.meta.url), 'utf8'));
const input = source
  .replace(/import FearGreedChart from '[^']+';/, `export const chartCalls = [];
    const FearGreedChart = props => { chartCalls.push(props); return null; };`)
  .replace(/import\s*(['"])\.\/FearGreedPage\.css\1;?/, '')
  .replaceAll('import.meta.env.DEV', 'true');
const transformed = await transformWithOxc(`${input}\nexport { Gauge, Indicator };`, 'FearGreedPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/(from\s+)(['"])([^'"]+)\2/g, (_match, prefix, _quote, path) =>
  `${prefix}${JSON.stringify(path.startsWith('.') ? new URL(path, pageUrl).href : import.meta.resolve(path))}`);
const { default: Page, Gauge, Indicator, chartCalls } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const ratings = ['extreme fear', 'fear', 'neutral', 'greed', 'extreme greed'];
const zh = ['极度恐慌', '恐慌', '中性', '贪婪', '极度贪婪'];
const en = ['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'];
const boundaries = [
  [0, 0, 0], [24, 24, 0], [24.49, 24, 0], [24.5, 25, 1], [25, 25, 1],
  [44.49, 44, 1], [44.5, 45, 2], [44.6, 45, 2], [45, 45, 2],
  [54.49, 54, 2], [54.5, 55, 3], [55, 55, 3],
  [74.49, 74, 3], [74.5, 75, 4], [75, 75, 4], [99.5, 100, 4], [100, 100, 4],
];

const scoreText = html => html.match(/class="fg-gauge-score"[^>]*>([^<]*)<\/text>/)?.[1];
const ratingText = html => html.match(/class="fg-gauge-rating"[^>]*>([^<]*)<\/text>/)?.[1];
const needleAngle = html => Number(html.match(/class="fg-gauge-needle"[^>]*transform="rotate\(([^ ]+)/)?.[1]);
const gaugeFromPage = html => html.match(/<div\b[^>]*class="fg-gauge"[^>]*>(<svg[\s\S]*?<\/svg>)/)?.[1];
const renderGauge = (score, rating = 'fear', english = false) => renderToStaticMarkup(
  React.createElement(Gauge, { current: { score, rating }, english }));

function assertDefaultGaugeStyle(html) {
  assert.ok(!html.toLowerCase().includes(MARKET_RED_HEX), 'the gauge must not apply a red fill or halo');
  assert.ok(!html.toLowerCase().includes(MARKET_GREEN_HEX), 'the gauge must not apply a green fill or halo');
  const filter = html.match(/<filter\b[^>]*>([\s\S]*?)<\/filter>/)?.[1];
  assert.ok(filter, 'the default hub shadow remains present');
  const shadows = [...filter.matchAll(/<feDropShadow\b([^>]*)>/g)].map(([, attributes]) =>
    Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])));
  assert.deepEqual(shadows, [
    { dx: '0', dy: '0', stdDeviation: '8', 'flood-color': '#9299aa', 'flood-opacity': '0.16' },
    { dx: '0', dy: '5', stdDeviation: '6', 'flood-color': '#000000', 'flood-opacity': '0.55' },
  ]);
  const rating = html.match(/<text\b[^>]*class="fg-gauge-rating"[^>]*>/)?.[0];
  assert.ok(rating);
  assert.doesNotMatch(rating, /\b(?:style|fill|color)=/, 'the rating uses its default stylesheet color');
  return filter;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function snapshotWithBoundaryScore() {
  const snapshot = structuredClone(recorded);
  snapshot.current.score = 44.6;
  snapshot.current.rating = 'fear';
  snapshot.history.at(-1).value = 44.6;
  snapshot.history.at(-1).rating = 'fear';
  snapshot.indicators[0].score = 44.6;
  snapshot.indicators[0].rating = 'fear';
  return snapshot;
}

test('display score and category agree at every application presentation boundary', () => {
  for (const [raw, score, index] of boundaries) {
    assert.deepEqual(fearGreedDisplay(raw), { score, index, rating: ratings[index], label: zh[index] }, `raw score ${raw}`);
    assert.deepEqual(fearGreedDisplay(raw, 'en'), { score, index, rating: ratings[index], label: en[index] }, `English raw score ${raw}`);
  }
});

test('invalid raw scores stay unknown instead of coercing to zero or rounding into range', () => {
  for (const raw of [null, undefined, '', '44.6', '0', false, true, [], {}, NaN, Infinity, -Infinity, -0.01, 100.01]) {
    for (const language of ['zh', 'en']) {
      assert.deepEqual(fearGreedDisplay(raw, language), { score: null, index: -1, rating: null, label: '—' });
    }
  }
});

test('the real Gauge keeps score, selected band, needle and neutral styling aligned at 44.6', () => {
  for (const english of [false, true]) {
    const html = renderGauge(44.6, 'fear', english);
    assert.equal(scoreText(html), '45');
    assert.equal(ratingText(html), english ? 'Neutral' : '中性');
    assert.match(html, /data-band="2" data-active="true"/);
    assert.equal((html.match(/data-active="true"/g) || []).length, 1);
    assert.equal(needleAngle(html), -9, 'the needle must point to the same rounded 45 as the displayed number');
    assert.ok(!html.toLowerCase().includes(MARKET_RED_HEX), 'raw fear must not leave a red fill or halo on neutral 45');
    assert.ok(!html.toLowerCase().includes(MARKET_GREEN_HEX), 'neutral must not receive a greed fill or halo');
    assert.ok(html.includes(`aria-label="${english ? 'Fear and Greed Index 45 Neutral' : '恐慌与贪婪指数 45 中性'}"`));
  }
  const stillFear = renderGauge(44.49, 'fear');
  assert.equal(scoreText(stillFear), '44');
  assert.equal(ratingText(stillFear), '恐慌');
  assert.match(stillFear, /data-band="1" data-active="true"/);
  assertDefaultGaugeStyle(stillFear);
});

test('all five Gauge categories and rounded 45 share the default gray hub, halo and rating styling', () => {
  let defaultFilter;
  for (const [raw, index] of [[12, 0], [33, 1], [50, 2], [67, 3], [88, 4], [44.6, 2]]) {
    for (const english of [false, true]) {
      const html = renderGauge(raw, raw === 44.6 ? 'fear' : ratings[index], english);
      assert.equal(scoreText(html), String(Math.round(raw)));
      assert.equal(ratingText(html), (english ? en : zh)[index]);
      assert.match(html, new RegExp(`data-band="${index}" data-active="true"`));
      const filter = assertDefaultGaugeStyle(html);
      defaultFilter ??= filter;
      assert.equal(filter, defaultFilter, `raw score ${raw} must retain the same default shadow`);
    }
  }
});

test('the real Gauge supports endpoint scores and never draws a fabricated needle for missing data', () => {
  for (const [score, index, angle] of [[0, 0, -90], [100, 4, 90]]) {
    const html = renderGauge(score, null);
    assert.equal(scoreText(html), String(score));
    assert.equal(ratingText(html), zh[index]);
    assert.match(html, new RegExp(`data-band="${index}" data-active="true"`));
    assert.equal(needleAngle(html), angle);
  }
  for (const score of [null, undefined, '44.6', NaN, -1, 101]) {
    const html = renderGauge(score, 'fear');
    assert.equal(scoreText(html), '—');
    assert.equal(ratingText(html), '—');
    assert.doesNotMatch(html, /class="fg-gauge-needle"|data-active="true"/);
  }
});

test('page presentation changes do not rewrite API scores, historical observations or component ratings', () => {
  const raw = snapshotWithBoundaryScore();
  const normalized = normalizeFearGreed(raw, { now: Date.parse(raw.fetchedAt) });
  assert.ok(normalized);
  assert.equal(normalized.current.score, 44.6);
  assert.equal(normalized.current.rating, 'fear');
  assert.equal(normalized.history.at(-1).value, 44.6);
  assert.equal(normalized.history.at(-1).rating, 'fear');
  assert.deepEqual(normalized.indicators[0].series, raw.indicators[0].series);
  assert.equal(normalized.indicators[0].score, 44.6);
  assert.equal(normalized.indicators[0].rating, 'fear');
  deepFreeze(normalized);
  const before = JSON.stringify(normalized);
  chartCalls.length = 0;
  const html = renderToStaticMarkup(React.createElement(Page, { ctx: { language: 'zh' }, previewData: normalized }));
  const gauge = gaugeFromPage(html);
  assert.ok(gauge, 'the page must render its actual Gauge');
  assert.equal(scoreText(gauge), '45');
  assert.equal(ratingText(gauge), '中性');
  assert.equal(needleAngle(gauge), -9);
  assert.equal(chartCalls.length, 1);
  assert.equal(chartCalls[0].series[0].points, normalized.history, 'the history chart receives the original precision and recorded ratings');
  const momentum = html.match(/<section class="fg-indicator">[\s\S]*?市场动量[\s\S]*?<\/section>/)?.[0];
  assert.ok(momentum);
  assert.match(momentum, />恐慌<\/span>/, 'component metadata retains the source rating rather than the aggregate display category');
  assert.match(momentum, /class="fg-indicator-score">44\.6<\/span>/);
  assert.equal(JSON.stringify(normalized), before);
  const englishComponent = renderToStaticMarkup(React.createElement(Indicator, {
    definition: { id: 'momentum', name: ['市场动量', 'Market momentum'], measure: ['', ''] },
    data: normalized.indicators[0], english: true,
  }));
  assert.match(englishComponent, />Fear<\/span>/);
  assert.match(englishComponent, /class="fg-indicator-score">44\.6<\/span>/);
});

test('Home uses the shared display contract for both score and label', () => {
  const home = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
  assert.match(home, /import\s*\{\s*fearGreedDisplay\s*\}\s*from\s*['"]\.\.\/lib\/fearGreedDisplay\.js['"]/);
  assert.match(home, /const fgiInfo = fearGreedDisplay\(fgi, language\)/);
  const entryStart = home.indexOf('onClick={() => openFearGreed?.()}');
  assert.ok(entryStart >= 0);
  const reading = home.slice(entryStart, home.indexOf('</button>', entryStart));
  assert.ok(reading.includes('fgiInfo.score'), 'Home must display the same validated rounded score as the shared category');
  assert.ok(reading.includes('fgiInfo.label'));
  assert.doesNotMatch(home, /const fgiInfo = fgiLevel\(/);
});
