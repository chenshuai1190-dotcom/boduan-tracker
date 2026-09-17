import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { MARKET_COLOR_MODES } from '../src/lib/marketColorMode.js';

const componentUrl = new URL('../src/components/StockTradeEvents.jsx', import.meta.url);
const source = readFileSync(componentUrl, 'utf8');
const css = readFileSync(new URL('../src/components/StockTradeEvents.css', import.meta.url), 'utf8');
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const hookUrl = dataUrl(`import React from ${JSON.stringify(import.meta.resolve('react'))};
let slots=[], cursor=0;
export function reset(){slots=[];cursor=0;}
export function render(Component,props){cursor=0;return Component(props);}
function useState(initial){const index=cursor++;const slot=slots[index]||={value:typeof initial==='function'?initial():initial};return [slot.value,next=>{slot.value=typeof next==='function'?next(slot.value):next;}];}
function useRef(initial){return slots[cursor++]||={current:initial};}
export default {...React,useState,useRef,useEffect(){},useLayoutEffect(){},useCallback:fn=>fn};`);
const portalUrl = dataUrl('export const createPortal = child => child;');
const modules = new Map();
async function compile(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const promise = (async () => {
    const text = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    let { code } = await transformWithOxc(text, url.pathname, { jsx: { runtime: 'classic' } });
    for (const match of [...code.matchAll(/from\s+(['"])([^'"]+)\1/g)].reverse()) {
      const specifier = match[2];
      const resolved = specifier.startsWith('.') ? new URL(specifier, url) : null;
      const target = specifier === 'react' ? hookUrl : specifier === 'react-dom' ? portalUrl
        : resolved?.pathname.endsWith('TechnicalExplanationSheet.jsx')
          ? dataUrl('export function attachTechnicalExplanationAccess(){return ()=>{};}')
          : resolved?.pathname.endsWith('.jsx') ? await compile(resolved) : resolved?.href || import.meta.resolve(specifier);
      code = code.slice(0, match.index) + `from ${JSON.stringify(target)}` + code.slice(match.index + match[0].length);
    }
    return dataUrl(code);
  })();
  modules.set(url.href, promise);
  return promise;
}
const hooks = await import(hookUrl);
const { default: StockTradeEvents } = await import(await compile(componentUrl));
const nodes = (node, predicate) => !React.isValidElement(node) ? [] : [
  ...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate)),
];
const texts = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
  : React.Children.toArray(node.props?.children).map(texts).join('');
function harness(props = {}) {
  hooks.reset();
  return () => hooks.render(StockTradeEvents, props);
}
const buy = Object.freeze({ id: 'buy', date: '2026-08-04', side: 'buy', shares: 2.5, price: 100.123, amountUsd: 250.3075, heldSharesAfter: 9.5, realizedPnlUsd: 999 });
const sell = Object.freeze({ id: 'sell', date: '2026-08-07', side: 'sell', shares: 1.25, price: 110.12, amountUsd: 137.65, heldSharesAfter: 8.25, realizedPnlUsd: 12.345 });

test('trade events sort newest first without changing records and select the original transaction', () => {
  const records = Object.freeze([buy, sell]);
  let selected;
  const render = harness({ records, onSelectEvent: record => { selected = record; }, displayRate: 7.2 });
  const rows = nodes(render(), node => node.props.className === 'ste-event');
  assert.match(texts(rows[0]), /2026-08-07.*卖出.*1.25 股.*\$110.12.*¥991.08/);
  assert.match(texts(rows[0]), /已实现 \+¥88.88/);
  assert.match(texts(rows[1]), /2026-08-04.*买入.*2.5 股.*\$100.12.*¥1,802.21/);
  assert.doesNotMatch(texts(rows[1]), /已实现/);
  rows[0].props.onClick();
  assert.equal(selected, sell);
  assert.deepEqual(records, [buy, sell]);
});

test('holdings view preserves supplied facts and only totals supplied transaction amounts and counts', () => {
  const render = harness({ records: [buy, sell], displayCurrency: 'USD', holdingDetails: [{ label: '持仓数量', value: '8.25 股' }, { label: '成本', value: null }] });
  nodes(render(), node => node.props.role === 'tab')[1].props.onClick();
  const html = renderToStaticMarkup(render());
  assert.match(html, /持仓数量<\/dt><dd>8.25 股/);
  assert.match(html, /成本<\/dt><dd>--/);
  assert.match(html, /买入金额<\/dt><dd>\$250.31/);
  assert.match(html, /卖出金额<\/dt><dd>\$137.65/);
  assert.match(html, /买入次数<\/dt><dd>1/);
  assert.match(html, /卖出次数<\/dt><dd>1/);
  assert.doesNotMatch(html, /ste-event"/);
  nodes(render(), node => node.props.role === 'tab')[0].props.onClick();
  assert.equal(nodes(render(), node => node.props.className === 'ste-event').length, 2);
});

test('an optional initial holdings tab exposes supplied facts on first render without changing the default', () => {
  const render = harness({ initialTab: 'holdings', holdingDetails: [{ label: '持仓数量', value: '8.25 股' }] });
  assert.match(renderToStaticMarkup(render()), /持仓数量<\/dt><dd>8.25 股/);
  assert.equal(nodes(render(), node => node.props.role === 'tab')[1].props['aria-selected'], true);
});

test('missing numeric facts remain unavailable, including incomplete aggregated amounts', () => {
  const missing = { date: '2026-08-04', side: 'buy', shares: null, price: '', amountUsd: undefined };
  const render = harness({ records: [missing] });
  const html = renderToStaticMarkup(render());
  assert.match(html, /-- 股 · --/);
  assert.doesNotMatch(html, /¥0|\$0/);
  nodes(render(), node => node.props.role === 'tab')[1].props.onClick();
  assert.match(renderToStaticMarkup(render()), /买入金额<\/dt><dd>--/);
});

test('default buy and sell markers use green and orange and respect the opposite market color preference', () => {
  for (const [mode, colors] of [[undefined, ['#ff4b1f', '#22c55e']], [MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, ['#22c55e', '#ff4b1f']]]) {
    const render = harness({ records: [buy, sell], marketColorMode: mode });
    assert.deepEqual(nodes(render(), node => node.props.className === 'ste-marker').map(node => node.props.style.color), colors);
  }
});

test('a chart day selection opens all supplied executions and only sells show realized P&L', t => {
  const oldDocument = globalThis.document;
  globalThis.document = { body: {} };
  t.after(() => { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  let closed = 0;
  const render = harness({ selectedEvent: { date: '2026-08-07', records: [buy, sell] }, displayRate: 7.2, onCloseEvent: () => { closed++; } });
  const tree = render();
  const sheet = nodes(tree, node => node.type?.name === 'TradeDetailsSheet')[0];
  const sheetTree = sheet.type(sheet.props);
  const modal = nodes(sheetTree, node => node.type?.name === 'StockReportModal')[0];
  modal.props.onClose();
  assert.equal(closed, 1);
  const html = renderToStaticMarkup(sheetTree);
  assert.equal((html.match(/class="ste-detail"/g) || []).length, 2);
  assert.equal((html.match(/<dt>已实现盈亏<\/dt>/g) || []).length, 1);
  assert.match(html, /已实现盈亏<\/dt><dd style="color:#ff4b1f">\+¥88.88/);
  assert.match(html, /交易后持仓<\/dt><dd>9.5/);
  assert.match(html, /交易后持仓<\/dt><dd>8.25/);
  assert.match(html, /成交价 · USD<\/dt><dd>\$100.12/);
  assert.match(html, /2026-08-04/);
  assert.match(html, /2026-08-07/);
  assert.doesNotMatch(html, /保存|提交|确认买入/);
});

test('empty and English views remain complete, and sheet layout is scoped and scrollable', () => {
  const render = harness({ language: 'en' });
  const html = renderToStaticMarkup(render());
  assert.match(html, /Trade events/);
  assert.match(html, /Position details/);
  assert.match(html, /No trade records in this period/);
  assert.match(source, /attachTechnicalExplanationAccess\(dialog/);
  assert.match(source, /createPortal\(/);
  assert.doesNotMatch(source, /fetch\(|supabase|\.insert\(|\.update\(|saveTrade|Math\.random/);
  assert.match(css, /\.ste-sheet-panel\.stock-report-modal[^}]*max-height: 75dvh/);
  assert.match(css, /\.ste-sheet-panel \.srm-content[^}]*overflow-y: auto/);
  assert.doesNotMatch(css, /linear-gradient|letter-spacing:\s*-/);
});
