import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { buildPortfolioOverlapModel } from '../src/lib/portfolioOverlapModel.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/pages/PortfolioOverlapPage.jsx');
const css = read('src/components/PortfolioOverlap.css');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const chart = await transformWithOxc(read('src/components/InvestmentComparisonChart.jsx'), 'InvestmentComparisonChart.jsx', { jsx: { runtime: 'classic' } });
const chartUrl = dataUrl(chart.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(import.meta.resolve('react'))}`));
const card = await transformWithOxc(read('src/components/ActionModalCard.jsx'), 'ActionModalCard.jsx', { jsx: { runtime: 'classic' } });
const cardUrl = dataUrl(card.code.replace(/from (["'])(react|lucide-react)\1/g, (_match, _quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`));
const transformed = await transformWithOxc(source, 'PortfolioOverlapPage.jsx', { jsx: { runtime: 'classic' } });
const internalExports = '\nexport { PortfolioOverlapContent, PortfolioAnalysis, PortfolioEditor, CompanyDetail, PositionList, PortfolioOverlapSheet, draftOf };';
function compiledPage(reactUrl, { dev = false, extra = '', transportUrl } = {}) {
  const imports = new Map([
    ['react', reactUrl], ['react-dom', import.meta.resolve('react-dom')], ['lucide-react', import.meta.resolve('lucide-react')],
    ['../components/InvestmentComparisonChart.jsx', chartUrl], ['../components/ActionModalCard.jsx', cardUrl],
    ['../lib/portfolioOverlapModel.js', new URL('../src/lib/portfolioOverlapModel.js', import.meta.url).href],
    ['../lib/portfolioOverlap.js', transportUrl || new URL('../src/lib/portfolioOverlap.js', import.meta.url).href],
  ]);
  return transformed.code.replace(/from (["'])([^"']+)\1/g, (match, _quote, path) => imports.has(path) ? `from ${JSON.stringify(imports.get(path))}` : match)
    .replace(/import ["'][^"']+\.css["'];?/g, '').replaceAll('import.meta.env.DEV', String(dev)) + extra;
}
const { default: PortfolioOverlapPage, PortfolioAnalysis, CompanyDetail, PositionList, draftOf } = await import(dataUrl(compiledPage(import.meta.resolve('react'), { extra: internalExports })));

const fetchedAt = '2026-09-08T12:00:00.000Z';
function stock(symbol) {
  return { symbol, name: `${symbol} verified stock`, kind: 'stock', holdingsStatus: 'not_applicable', source: { provider: 'Test identity provider', url: `https://example.com/identity/${symbol}`, basis: 'instrument_identity' }, asOfDate: null, fetchedAt, stale: false, reason: null, coveragePct: null, holdings: [] };
}
function fund(symbol = 'QQQ') {
  return { symbol, name: 'Test disclosed fund', kind: 'plain_etf', holdingsStatus: 'partial', source: { provider: 'Test fund issuer', url: 'https://example.com/official-fund-holdings', basis: 'fund_holdings' }, asOfDate: '2026-09-04', fetchedAt, stale: false, reason: null, coveragePct: 50, holdings: [{ symbol: 'NVDA', name: 'NVIDIA', exchange: 'US', securityType: 'stock', weightPct: 20 }, { symbol: 'MSFT', name: 'Microsoft', exchange: 'US', securityType: 'stock', weightPct: 30 }] };
}
function testModel({ missing = false, stale = false } = {}) {
  const etf = fund(); etf.stale = stale;
  const leveraged = { ...stock('TQQQ'), kind: 'leveraged_etf', source: { provider: 'Test fund issuer', url: 'https://example.com/tqqq', basis: 'fund_holdings' } };
  return buildPortfolioOverlapModel({ holdings: [{ symbol: 'NVDA', amount: missing ? null : 100 }, { symbol: 'QQQ', amount: 300 }, { symbol: 'TQQQ', amount: 100 }, { symbol: 'UNKNOWN', amount: 100 }], instruments: [stock('NVDA'), etf, leveraged] });
}
const ctxFor = (positions = []) => ({ userId: 'user-a', language: 'zh', portfolioReady: true, portfolioError: null, investmentSummary: { activePositions: positions } });
const position = (symbol = 'ZETA', amount = 285) => ({ symbol, name: `${symbol} holding`, heldShares: 3, valuationPrice: amount / 3, marketValue: amount });
const htmlOf = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('default page follows real active-position values, not prototype holdings, in both languages', () => {
  for (const language of ['zh', 'en']) {
    const html = htmlOf(PortfolioOverlapPage, { ctx: { ...ctxFor([position()]), language } });
    assert.match(html, /\$285/);
    assert.match(html, language === 'en' ? /My holdings/ : /我的持仓/);
    assert.match(html, language === 'en' ? /Reading verified security/ : /正在读取已核验/);
    assert.match(html, /id="po-tab-holdings"[^>]*aria-selected="true"/);
    assert.doesNotMatch(html, /350,000|250,000|虚构|示例持仓|class="po-hero-main"/);
  }
});

test('empty account has an honest empty state with no injected portfolio or requests', () => {
  for (const language of ['zh', 'en']) {
    const html = htmlOf(PortfolioOverlapPage, { ctx: { ...ctxFor(), language } });
    assert.match(html, language === 'en' ? /No holdings in this portfolio/ : /当前组合没有持仓/);
    assert.doesNotMatch(html, /class="po-hero-main"|po-company-row|QQQ|TQQQ|NVDA/);
  }
});

test('pending, failed and signed-out scopes never display retained account amounts', () => {
  const base = ctxFor([position('SECRET', 87654321)]);
  const pending = htmlOf(PortfolioOverlapPage, { ctx: { ...base, portfolioReady: false } });
  const failed = htmlOf(PortfolioOverlapPage, { ctx: { ...base, portfolioReady: false, portfolioError: 'load failed' } });
  const signedOut = htmlOf(PortfolioOverlapPage, { ctx: { ...base, userId: '' } });
  assert.match(pending, /正在读取当前账户持仓/);
  assert.match(failed, /持仓暂时读取失败/); assert.match(failed, /持仓读取不可用/);
  assert.match(signedOut, /请登录后/);
  for (const html of [pending, failed, signedOut]) assert.doesNotMatch(html, /87,654,321|SECRET|class="po-hero-main"/);
});

test('identified security percentages and coverage come from the model and use the entire total', () => {
  const model = testModel();
  for (const englishMode of [false, true]) {
    const html = htmlOf(PortfolioAnalysis, { model, englishMode, expanded: false });
    assert.match(html, /26\.7%/); assert.match(html, /41\.7%/); assert.match(html, /16\.7%/);
    assert.match(html, englishMode ? /Largest identified security/ : /已识别标的中/);
    assert.match(html, englishMode ? /Top five · at least/ : /前五大标的 · 至少/);
    assert.match(html, englishMode ? /Unexpanded \/ unknown/ : /未穿透 \/ 未识别/);
    assert.match(html, englishMode ? /Leveraged ETFs · separate/ : /杠杆 ETF 单列/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined|公司中，占比最高|家公司/);
  }
});

test('a missing market quote suppresses concentration cards and never invents a 100-percent denominator', () => {
  const model = testModel({ missing: true });
  assert.equal(model.valuationComplete, false);
  for (const englishMode of [false, true]) {
    const html = htmlOf(PortfolioAnalysis, { model, englishMode, expanded: false });
    assert.match(html, englishMode ? /Quotes are missing/ : /部分持仓暂无报价/);
    assert.match(html, /NVDA/);
    assert.doesNotMatch(html, /class="po-hero-main"|class="po-coverage-bar"|NaN|Infinity/);
    assert.match(html, englishMode ? /Known amounts only/ : /仅已知金额/);
  }
  assert.deepEqual(draftOf([{ symbol: 'NVDA', amount: null }]), [{ symbol: 'NVDA', amountText: '' }]);
});

test('source details show disclosed weights, date and source links rather than invented ETF weights', () => {
  const model = testModel({ stale: true });
  const company = model.companies.find(item => item.symbol === 'NVDA');
  for (const englishMode of [false, true]) {
    const html = htmlOf(CompanyDetail, { company, model, englishMode });
    assert.match(html, /2026-09-04/); assert.match(html, /20%/);
    assert.match(html, /href="https:\/\/example.com\/official-fund-holdings"/);
    assert.match(html, /noopener noreferrer/);
    assert.match(html, englishMode ? /Stale source/ : /来源较旧/);
    assert.doesNotMatch(html, /模拟成分权重|虚构|NaN/);
  }
});

test('detail formulas preserve up to six disclosed weight decimals while portfolio summaries stay compact', () => {
  const etf = fund();
  etf.coveragePct = 8.853648;
  etf.holdings = [{ symbol: 'NVDA', name: 'NVIDIA', exchange: 'US', securityType: 'stock', weightPct: 8.853648 }];
  const model = buildPortfolioOverlapModel({ holdings: [{ symbol: 'QQQ', amount: 350000 }], instruments: [etf] });
  const company = model.companies[0];
  for (const englishMode of [false, true]) {
    const html = htmlOf(CompanyDetail, { company, model, englishMode });
    assert.match(html, /\$350,000 × /);
    assert.match(html, /8\.853648% → \$30,987\.77/);
    assert.match(html, /<strong>8\.9%<\/strong>/);
  }
});

test('position list labels missing quotes explicitly and leaves percentages unavailable', () => {
  const model = testModel({ missing: true });
  const html = htmlOf(PositionList, { model, holdings: [], metadataReady: true, englishMode: true });
  assert.match(html, /Quote missing/); assert.match(html, /Missing quotes are left blank/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

const hookUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let hosts = new Map(), active, cursor = 0, pending = [];
  const same = (a,b) => a && b && a.length === b.length && a.every((value,index) => Object.is(value,b[index]));
  export function reset() { for (const slots of hosts.values()) for (const slot of slots) slot?.cleanup?.(); hosts = new Map(); pending=[]; }
  export function render(Component,props,key='default') { if(!hosts.has(key)) hosts.set(key,[]); active=hosts.get(key); cursor=0; return Component(props); }
  export function flush() { const effects=pending; pending=[]; effects.forEach(effect=>effect()); }
  export function unmount(key='default') { for(const slot of hosts.get(key)||[]) slot?.cleanup?.(); hosts.delete(key); }
  function useState(initial) { const index=cursor++; if(!active[index]) active[index]={value:typeof initial==='function'?initial():initial}; const slot=active[index]; return [slot.value,next=>{slot.value=typeof next==='function'?next(slot.value):next;}]; }
  function useRef(initial) { const index=cursor++; return active[index] ||= {current:initial}; }
  function useMemo(callback,deps) { const index=cursor++; if(!active[index]||!same(active[index].deps,deps)) active[index]={value:callback(),deps}; return active[index].value; }
  function useEffect(callback,deps) { const index=cursor++; if(!active[index]||!same(active[index].deps,deps)) { const previous=active[index],slot={deps}; active[index]=slot; pending.push(()=>{previous?.cleanup?.();slot.cleanup=callback();}); } }
  export default {...React,useState,useRef,useMemo,useEffect,useCallback:(callback,deps)=>useMemo(()=>callback,deps)};
`);
const hooks = await import(hookUrl);
const { PortfolioOverlapContent, PortfolioEditor } = await import(dataUrl(compiledPage(hookUrl, { dev: true, extra: internalExports })));
const elements = (node, predicate) => !React.isValidElement(node) ? [] : [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => elements(child, predicate))];
const button = (tree, label) => elements(tree, node => node.type === 'button' && node.props['aria-label'] === label)[0];
const settle = () => new Promise(resolve => setImmediate(resolve));
function requestHarness(initialCtx = ctxFor([position()])) {
  hooks.reset();
  const calls = [];
  const previewSource = { load: args => new Promise((resolve, reject) => calls.push({ args, resolve, reject })) };
  let ctx = initialCtx;
  const render = nextCtx => { if (nextCtx) ctx = nextCtx; const tree = hooks.render(PortfolioOverlapContent, { ctx, previewSource }); hooks.flush(); return tree; };
  const reply = index => calls[index].resolve({ version: 1, fetchedAt, instruments: calls[index].args.symbols.map(stock) });
  return { calls, render, reply, get ctx() { return ctx; } };
}

test('request scope sends symbols only; valuation updates and same-symbol mode switches do not refetch', async () => {
  const harness = requestHarness();
  harness.render(); await settle();
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0].args.symbols, ['ZETA']);
  assert.deepEqual(Object.keys(harness.calls[0].args).sort(), ['force','signal','symbols','userId']);
  assert.equal(harness.calls[0].args.force, false);
  harness.reply(0); await settle();
  let tree = harness.render();
  assert.ok(elements(tree, node => node.type.name === 'PortfolioAnalysis').length);
  tree = harness.render(ctxFor([position('ZETA', 570)])); await settle();
  assert.equal(harness.calls.length, 1);
  assert.equal(elements(tree, node => node.type.name === 'PortfolioAnalysis')[0].props.model.total, 570);
  elements(tree, node => node.props['data-mode'] === 'custom')[0].props.onClick();
  harness.render(); await settle();
  assert.equal(harness.calls.length, 1);
});

test('new symbol sets hide old metadata immediately and discard old request completion', async () => {
  const harness = requestHarness(); harness.render(); await settle();
  const old = harness.calls[0];
  let tree = harness.render(ctxFor([position('OTHER', 900)]));
  assert.equal(elements(tree, node => node.type.name === 'PortfolioAnalysis').length, 0);
  await settle(); assert.equal(old.args.signal.aborted, true);
  harness.reply(0); await settle();
  tree = harness.render(); assert.equal(elements(tree, node => node.type.name === 'PortfolioAnalysis').length, 0);
  harness.reply(1); await settle();
  tree = harness.render();
  assert.deepEqual(elements(tree, node => node.type.name === 'PortfolioAnalysis')[0].props.model.positions.map(row => row.symbol), ['OTHER']);
});

test('an explicit refresh forces only its target request, not later symbol changes', async () => {
  const harness = requestHarness(); harness.render(); await settle(); harness.reply(0); await settle();
  let tree = harness.render(); button(tree, '刷新持仓元数据').props.onClick();
  tree = harness.render(); await settle();
  assert.equal(harness.calls[1].args.force, true);
  assert.equal(elements(tree, node => node.type.name === 'PortfolioAnalysis').length, 0);
  harness.reply(1); await settle(); harness.render(ctxFor([position('NEXT', 400)])); await settle();
  assert.equal(harness.calls[2].args.force, false);
});

test('account remount aborts the old source and resets custom drafts before showing the new identity', async () => {
  const harness = requestHarness();
  let tree = harness.render(); await settle();
  elements(tree, node => node.props['data-mode'] === 'custom')[0].props.onClick();
  harness.render();
  hooks.unmount();
  assert.equal(harness.calls[0].args.signal.aborted, true);
  const nextCtx = { ...ctxFor(), userId: 'user-b' };
  tree = harness.render(nextCtx); await settle();
  assert.equal(elements(tree, node => node.props['data-mode'] === 'holdings')[0].props['aria-selected'], true);
  assert.equal(elements(tree, node => node.type.name === 'PortfolioOverlapSheet').length, 0);
  assert.equal(harness.calls.length, 1);
  const a = PortfolioOverlapPage({ ctx: { userId: 'user-a' } });
  const b = PortfolioOverlapPage({ ctx: { userId: 'user-b' } });
  assert.notEqual(a.key, b.key);
});

test('metadata request failures become an error state rather than a zero or partial result', async () => {
  const harness = requestHarness(); harness.render(); await settle();
  harness.calls[0].reject(new Error('network unavailable')); await settle();
  const tree = harness.render();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /持仓元数据读取失败/); assert.match(html, /role="alert"/);
  assert.equal(elements(tree, node => node.type.name === 'PortfolioAnalysis').length, 0);
});

test('empty or pending portfolios never request metadata, and cannot copy retained pending values', async () => {
  for (const ctx of [ctxFor(), { ...ctxFor([position('OLD', 900000)]), portfolioReady: false }]) {
    const harness = requestHarness(ctx); let tree = harness.render(); await settle();
    assert.equal(harness.calls.length, 0);
    elements(tree, node => node.props['data-mode'] === 'custom')[0].props.onClick();
    tree = harness.render();
    const editor = elements(tree, node => node.type.name === 'PortfolioEditor')[0];
    assert.deepEqual(editor.props.draft, []);
  }
});

test('custom editor preserves missing amounts and rejects malformed server-incompatible symbols', () => {
  for (const [symbol, amountText] of [['NVDA', ''], ['1INVALID', '100'], ['ABCDEFGHIJKLMNOP', '100'], ['NVDA', '-1']]) {
    hooks.reset(); let submitted = false;
    const props = { draft: [{ symbol, amountText }], setDraft() {}, englishMode: true, currentHoldings: [], onSubmit() { submitted = true; } };
    let tree = hooks.render(PortfolioEditor, props); tree.props.onSubmit({ preventDefault() {} });
    tree = hooks.render(PortfolioEditor, props);
    assert.equal(submitted, false); assert.equal(elements(tree, node => node.props.role === 'alert').length, 1);
  }
  hooks.reset(); let result;
  const props = { draft: [{ symbol: 'nvda', amountText: '1250' }], setDraft() {}, englishMode: false, currentHoldings: [], onSubmit(value) { result = value; } };
  hooks.render(PortfolioEditor, props).props.onSubmit({ preventDefault() {} });
  assert.deepEqual(result, [{ symbol: 'NVDA', amount: 1250 }]);
});

test('production source guards preview transport and never includes prototype weights or persistence', () => {
  assert.match(source, /import\.meta\.env\.DEV && previewSource\?\.load/);
  assert.match(source, /loadPortfolioOverlap/);
  assert.match(source, /normalizePortfolioOverlapSymbols\(draft\.map/);
  assert.doesNotMatch(source, /DEFAULT_HOLDINGS|INSTRUMENTS|localStorage|sessionStorage|upsert|insert\(|fetch\(|127\.0\.0\.1|localhost|350000|250000/);
  assert.match(source, /requestRef\.current !== requestId \|\| controller\.signal\.aborted/);
  assert.match(source, /state\.key === requestKey/);
});

test('page uses the existing width contract and modal cleanup is separate from other overflow locks', () => {
  assert.match(source, /investment-comparison ic-page po-page/);
  assert.match(source, /<ActionModalCard/); assert.match(source, /createPortal/);
  assert.match(source, /document\.removeEventListener\('keydown', keydown, true\)/);
  assert.match(source, /body\.classList\.remove\('po-overlap-modal-open'\)/);
  assert.doesNotMatch(source, /body\.style\.overflow\s*=/);
  assert.doesNotMatch(css, /430px|max-width:430/);
  assert.match(css, /min-height:64px/); assert.match(css, /font-size:21px/);
  assert.match(css, /width:44px; min-height:44px/);
});
