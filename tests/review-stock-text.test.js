import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/ReviewStockText.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source
  .replace("import React from 'react';", `import React from ${JSON.stringify(import.meta.resolve('react'))};`)
  .replace("'../lib/reviewStockMentions.js'", JSON.stringify(new URL('../src/lib/reviewStockMentions.js', import.meta.url).href))
  .replace("import './ReviewStockText.css';", ''), 'ReviewStockTextTest.jsx', { jsx: { runtime: 'classic' } });
const { default: ReviewStockText } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);

test('stock text renders one accessible cashtag per symbol and keeps text escaped', () => {
  const html = renderToStaticMarkup(React.createElement(ReviewStockText, { text: '英伟达上涨，NVDA 继续观察。\n$SMH 和 $SMH <script>alert(1)</script>' }));
  assert.equal((html.match(/<button /g) || []).length, 2);
  assert.match(html, /aria-label="查看 NVDA 的所有博文"/);
  assert.match(html, />\$NVDA<\/button>上涨，NVDA 继续观察。/);
  assert.match(html, />\$SMH<\/button> 和 SMH/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('unrecognized text stays plain and English labels identify the selected stock', () => {
  assert.equal(renderToStaticMarkup(React.createElement(ReviewStockText, { text: '保持耐心。\nRSI 20，价格 $100。' })), '保持耐心。\nRSI 20，价格 $100。');
  const html = renderToStaticMarkup(React.createElement(ReviewStockText, { text: 'tsm TSM', language: 'en' }));
  assert.match(html, /aria-label="All posts about TSM"/);
  assert.match(html, />\$TSM<\/button> TSM/);
});

test('assistant mentions share the prose renderer without becoming stock actions or changing saved wording', () => {
  const body = '@Quote 请看 $NVDA，@小助手也看看。\n@qUoTe <script>alert(1)</script>';
  const html = renderToStaticMarkup(React.createElement(ReviewStockText, { text: body, candidates: ['QUOTE'] }));
  assert.equal((html.match(/class="rj-assistant-mention"/g) || []).length, 3);
  assert.match(html, /<span class="rj-assistant-mention">@Quote<\/span> 请看/);
  assert.match(html, /<span class="rj-assistant-mention">@小助手<\/span>也看看/);
  assert.match(html, /<span class="rj-assistant-mention">@qUoTe<\/span>/);
  assert.equal((html.match(/<button /g) || []).length, 1);
  assert.match(html, /aria-label="查看 NVDA 的所有博文"/);
  assert.doesNotMatch(html, /<script>|查看 QUOTE/);
  assert.equal(body, '@Quote 请看 $NVDA，@小助手也看看。\n@qUoTe <script>alert(1)</script>');
});

test('assistant-like email, URL and longer handles remain ordinary text', () => {
  const body = 'a@quote.com https://example.com/@Quote www.example.com/@小助手 @QuoteBot @quote_1 @@Quote @小助手123';
  const html = renderToStaticMarkup(React.createElement(ReviewStockText, { text: body }));
  assert.equal(html, body);
});
