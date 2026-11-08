import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/QuoteAssistantMessage.jsx', import.meta.url), 'utf8');
const walk = value => !React.isValidElement(value) ? Array.isArray(value) ? value.flatMap(walk) : [] : [value, ...walk(value.props.children)];
const text = value => typeof value === 'boolean' ? '' : !React.isValidElement(value) ? Array.isArray(value) ? value.map(text).join('') : String(value ?? '') : text(value.props.children);
let sequence = 0;
async function harness() {
  const slots = []; let cursor = 0;
  const fixture = { useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; } };
  const key = `__quoteMessage${++sequence}`; globalThis[key] = fixture;
  try {
    const compiled = await transformWithOxc(source.replace("import './QuoteAssistantMessage.css';", '').replace("import React, { useState } from 'react';", `import React from ${JSON.stringify(import.meta.resolve('react'))};\nconst {useState} = globalThis[${JSON.stringify(key)}];`), 'QuoteAssistantMessageTest.jsx', { jsx: { runtime: 'classic' } });
    const components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
    return { ...components, message: value => renderToStaticMarkup(React.createElement(components.default, { text: value })), sources(props) { cursor = 0; return components.QuoteAssistantSources(props); } };
  } finally { delete globalThis[key]; }
}

test('assistant prose renders paragraphs, line breaks, emphasis, inline code and lists without raw Markdown markers', async () => {
  const h = await harness();
  const markup = h.message('第一段 **重要判断**，使用 `VIX`。\n第二行。\n\n- 核对事实\n- __保留分歧__\n\n3. 检查计划\n4. 回看结果');
  assert.match(markup, /<p>第一段 <strong>重要判断<\/strong>，使用 <code>VIX<\/code>。<br\/>第二行。<\/p>/);
  assert.match(markup, /<ul><li>核对事实<\/li><li><strong>保留分歧<\/strong><\/li><\/ul>/);
  assert.match(markup, /<ol start="3"><li>检查计划<\/li><li>回看结果<\/li><\/ol>/);
  assert.doesNotMatch(markup, /\*\*|__保留|`VIX`/);
});

test('safe links preserve the label and nested parentheses while unsafe protocols never become anchors', async () => {
  const h = await harness();
  const markup = h.message('[**官方资料**](https://example.com/a_(b)) 和 [本地服务](http://127.0.0.1:4316/)');
  assert.match(markup, /href="https:\/\/example.com\/a_\(b\)"/);
  assert.match(markup, /<strong>官方资料<\/strong>/);
  assert.match(markup, /href="http:\/\/127.0.0.1:4316\/"/);
  assert.equal((markup.match(/rel="noopener noreferrer"/g) || []).length, 2);
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<svg/onload=alert(1)>', 'vbscript:execute(1)', 'file:///etc/passwd', '//evil.example', 'https://user:password@example.com/', 'https://example.com/\u0000x', 'https://example.com/\nx']) {
    assert.equal(h.safeQuoteAssistantLink(url), null, url);
    assert.doesNotMatch(h.message(`[危险标签](${url})`), /<a\b/, url);
  }
});

test('HTML, event attributes, script tags and Markdown image syntax remain inert text', async () => {
  const h = await harness();
  const markup = h.message('<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n<svg onload=alert(1)>\n![追踪图片](https://evil.example/track.gif)\n`<iframe src="https://evil.example">`');
  assert.doesNotMatch(markup, /<(script|img|svg|iframe)\b/);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(markup, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(markup, /<code>&lt;iframe/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML\s*=|eval\s*\(/);
});

test('intentional escapes remain literal, unfinished emphasis stays readable and headings do not enlarge the chat hierarchy', async () => {
  const h = await harness();
  assert.match(h.message('\\*\\*保留星号\\*\\*；未闭合 **内容'), /\*\*保留星号\*\*；未闭合 内容/);
  assert.match(h.message('### 复盘重点\n正文'), /class="qa-markdown-heading"><strong>复盘重点<\/strong><\/p><p>正文/);
  assert.doesNotMatch(h.message('### 复盘重点'), /<h[1-6]/);
  assert.equal(h.message(null), '<div class="qa-markdown"></div>');
});

test('assistant emphasis accepts trailing whitespace and never exposes broken markers across paragraphs', async () => {
  const h = await harness();
  const paired = h.message('**如果你愿意等待，这可能是一个机会。 **它更像是一个需要验证的判断。');
  assert.match(paired, /<strong>如果你愿意等待，这可能是一个机会。 <\/strong>它更像/);
  assert.doesNotMatch(paired, /\*\*/);
  const split = h.message('**如果你愿意等待，\n\n这可能是一个机会。 **\n\n它更像是一个需要验证的判断。');
  assert.doesNotMatch(split, /\*\*/);
  assert.match(split, /<p>如果你愿意等待，<\/p><p>这可能是一个机会。 <\/p><p>它更像/);
  assert.equal(h.message('**\n\n第一段。\n\n**\n\n第二段。\n\n****'), '<div class="qa-markdown"><p>第一段。</p><p>第二段。</p></div>');
  assert.doesNotMatch(h.message('未闭合 **重点\n第二行。\n\n继续阅读。'), /\*\*/);
});

test('removing stray assistant emphasis never changes exponent operators or explicit inline code', async () => {
  const h = await harness();
  const markup = h.message('公式 a**b + 2**3。使用 `a**b` 和 `**`。未闭合 **重点');
  assert.match(markup, /公式 a\*\*b \+ 2\*\*3/);
  assert.match(markup, /<code>a\*\*b<\/code> 和 <code>\*\*<\/code>/);
  assert.match(markup, /未闭合 重点/);
});

test('sources start collapsed and only show bounded short titles after explicit expansion', async () => {
  const h = await harness();
  const fullTitle = '**很长的公开原帖**\n' + '这段原帖正文不应堆满聊天窗口。'.repeat(100);
  const sources = [{ postId: 'log:one', title: fullTitle, date: '2026-11-08', scope: 'public' }, { title: '行情来源', url: 'https://example.com/close', date: '2026-11-06' }];
  let tree = h.sources({ sources });
  assert.equal(text(tree), '相关公开资料 · 2⌄');
  assert.equal(walk(tree).filter(node => node.type === 'ul').length, 0);
  assert.doesNotMatch(renderToStaticMarkup(tree), /这段原帖|行情来源/);
  walk(tree).find(node => node.type === 'button').props.onClick(); tree = h.sources({ sources });
  assert.equal(walk(tree).find(node => node.type === 'button').props['aria-expanded'], true);
  const title = walk(tree).find(node => node.props.className === 'qa-source-title');
  assert.equal(Array.from(text(title)).length, 64);
  assert.match(text(title), /…$/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /\*\*|\n/);
  walk(tree).find(node => node.type === 'button').props.onClick(); tree = h.sources({ sources });
  assert.equal(walk(tree).filter(node => node.type === 'ul').length, 0);
});

test('source navigation retains the exact original source and never links to unsafe destinations', async () => {
  const h = await harness(), opened = [];
  const original = { postId: 'log:private-node', title: '授权时间线节点', scope: 'milestone', url: 'javascript:bad()' };
  const sources = [original, { title: '<img src=x onerror=alert(1)>', url: 'data:text/html,evil' }, { title: '可访问来源', url: 'http://example.com/' }];
  const props = { sources, onOpenPost: (...args) => opened.push(args) };
  let tree = h.sources(props); walk(tree).find(node => node.type === 'button').props.onClick(); tree = h.sources(props);
  walk(tree).find(node => node.type === 'li').props.children.props.onClick();
  assert.equal(opened[0][0], original.postId); assert.equal(opened[0][1], original);
  const markup = renderToStaticMarkup(tree);
  assert.equal(walk(tree).filter(node => node.type === 'a').length, 1);
  assert.doesNotMatch(markup, /<img|href="(?:javascript|data):/);
  assert.match(markup, /&lt;img src=x/);
});

test('long emoji titles are truncated at code point boundaries and malformed sources produce an honest empty disclosure', async () => {
  const h = await harness();
  const title = h.quoteAssistantSourceTitle({ title: '🙂'.repeat(200) });
  assert.equal(Array.from(title).length, 64); assert.equal(title, '🙂'.repeat(63) + '…');
  assert.equal(h.sources({ sources: null }), null); assert.equal(h.sources({ sources: [null, false, 'untrusted', []] }), null);
  assert.equal(h.quoteAssistantSourceTitle({ title: '   ', date: '2026-11-08' }), '2026-11-08');
});

test('source disclosure supports an explicit non-citation label', async () => {
 const h=await harness();const tree=h.sources({sources:[{title:'资料'}],label:'本次上下文资料'});
 assert.equal(text(tree),'本次上下文资料 · 1⌄');
});
