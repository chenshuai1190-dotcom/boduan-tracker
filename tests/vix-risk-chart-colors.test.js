import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const path = fileURLToPath(new URL('../src/components/VixRiskChart.jsx', import.meta.url));
let { code } = await transformWithOxc(readFileSync(path, 'utf8'), path, { jsx: { runtime: 'automatic' } });
code = code.replace(/from\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${JSON.stringify(specifier.startsWith('.')
  ? pathToFileURL(resolve(dirname(path), specifier)).href : import.meta.resolve(specifier))}`);
const { default: Chart } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const observations = [
  { date: '2025-05-01', vix: 20, vix3m: 22, ratio: 20 / 22, price: 550 },
  { date: '2025-05-02', vix: 35, vix3m: 30, ratio: 35 / 30, price: 530 },
  { date: '2025-05-05', vix: 34, vix3m: 31, ratio: 34 / 31, price: 535 },
  { date: '2025-05-06', vix: 24, vix3m: 26, ratio: 24 / 26, price: 548 },
];
const riskLevels = new Map([
  ['2025-05-01', 'NORMAL'], ['2025-05-02', 'EXTREME_STRESS'],
  ['2025-05-05', 'EXTREME_STRESS'], ['2025-05-06', 'ELEVATED'],
]);
const render = (props = {}) => renderToStaticMarkup(React.createElement(Chart, {
  model: { rows: observations }, termRows: observations, riskLevels, symbol: 'SPY', onSelect: () => {}, ...props,
}));
const tag = (html, element, attribute, value) => html.match(new RegExp(`<${element}\\b[^>]*${attribute}="${value}"[^>]*>`))?.[0];
const readout = html => html.match(/<div data-vix-history-reading="vix">([\s\S]*?)<\/div>/)?.[1];
const stops = html => [...html.matchAll(/<stop offset="([^"]+)" stop-color="([^"]+)"/g)].map(([, offset, color]) => ({ offset, color }));

test('homepage historical reading, legend and point follow the selected date while the line retains every day color', () => {
  const latest = render();
  const extreme = render({ selectedDate: '2025-05-02' });
  const recovered = render({ selectedDate: '2025-05-06' });
  const latestExtreme = render({ model: { rows: observations.slice(0, 3) }, termRows: observations.slice(0, 3) });
  assert.match(readout(latest), /background:#dda36b/);
  assert.match(readout(latest), /<strong style="color:#dda36b">24\.00<\/strong>/);
  assert.match(readout(extreme), /background:#ff4d4f/);
  assert.match(readout(extreme), /<strong style="color:#ff4d4f">35\.00<\/strong>/);
  assert.match(tag(extreme, 'circle', 'data-vix-history-selected-series', 'vix'), /fill="#ff4d4f"/);
  assert.match(tag(recovered, 'circle', 'data-vix-history-selected-series', 'vix'), /fill="#dda36b"/);
  assert.match(readout(latestExtreme), /<strong style="color:#ff4d4f">34\.00<\/strong>/);
  assert.match(tag(latestExtreme, 'circle', 'data-vix-history-selected-series', 'vix'), /fill="#ff4d4f"/);
  assert.deepEqual(stops(latest), stops(extreme), 'selecting an extreme day must not recolor the full history');
  assert.deepEqual(stops(latest), stops(recovered));
  const colors = stops(latest);
  assert.equal(colors[0].color, '#dda36b');
  assert.equal(colors.at(-1).color, '#dda36b');
  assert.equal(Number.parseFloat(colors[1].offset), .5 / 3 * 100);
  assert.deepEqual(colors.slice(1, 3).map(item => item.color), ['#dda36b', '#ff4d4f']);
  assert.equal(colors[1].offset, colors[2].offset, 'the first transition splits at the geometric midpoint');
  assert.equal(colors[3].offset, colors[4].offset, 'the recovery transition also splits at the midpoint');
});

test('switching SPY/QQQ, return preference or displayed range cannot change a shared date risk color', () => {
  for (const symbol of ['SPY', 'QQQ']) {
    for (const marketColorMode of ['greenUpRedDown', 'redUpGreenDown']) {
      for (const requestedFrom of ['2025-05-01', '2025-05-02']) {
        const html = render({ selectedDate: '2025-05-02', symbol, marketColorMode,
          model: { requestedFrom, rows: observations.map(row => ({ ...row, price: symbol === 'QQQ' ? row.price * .8 : row.price })) } });
        assert.match(readout(html), /<strong style="color:#ff4d4f">35\.00<\/strong>/);
        assert.match(tag(html, 'circle', 'data-vix-history-selected-series', 'vix'), /fill="#ff4d4f"/);
        assert.match(tag(html, 'path', 'data-vix-history-series', 'price'), /stroke="#91a9c2"/);
        assert.match(tag(html, 'path', 'data-vix-history-series', 'ratio'), /stroke="#789ac0"/);
      }
    }
  }
});

test('absent or unknown paired risk remains orange even with a high VIX reading', () => {
  for (const levels of [undefined, new Map(), new Map([['2025-05-02', 'UNKNOWN']])]) {
    const html = render({ selectedDate: '2025-05-02', riskLevels: levels });
    assert.match(readout(html), /<strong style="color:#dda36b">35\.00<\/strong>/);
    assert.match(tag(html, 'circle', 'data-vix-history-selected-series', 'vix'), /fill="#dda36b"/);
    assert(stops(html).every(stop => stop.color === '#dda36b'));
  }
});

test('risk coloring preserves explicit gaps in VIX and ratio history', () => {
  const rows = observations.filter(row => row.date !== '2025-05-05');
  const html = render({ model: { rows }, termRows: rows });
  for (const field of ['vix', 'ratio']) {
    const series = tag(html, 'path', 'data-vix-history-series', field);
    const pathData = series.match(/ d="([^"]+)"/)?.[1];
    assert.equal((pathData.match(/M/g) || []).length, 2, `${field} must restart after the missing trading session`);
    assert.equal((pathData.match(/L/g) || []).length, 1, `${field} must not bridge to the final observation`);
  }
});
