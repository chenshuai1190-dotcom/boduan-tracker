import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
// Layout effects cannot run in SSR; all markup and action props remain real.
const ssrReact = moduleUrl(`import React from ${JSON.stringify(import.meta.resolve('react'))}; export default { ...React, useLayoutEffect: React.useEffect };`);
const sourceUrl = new URL('../src/components/BuyTradeDisciplineModal.jsx', import.meta.url);
const cardSourceUrl = new URL('../src/components/ActionModalCard.jsx', import.meta.url);
const resolveImports = (code, parent) => code.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, _quote, path) =>
  `${prefix}${JSON.stringify(path === 'react' ? ssrReact : path.startsWith('.') ? new URL(path, parent).href : import.meta.resolve(path))}`);
const card = await transformWithOxc(readFileSync(cardSourceUrl, 'utf8'), 'ActionModalCard.jsx', { jsx: { runtime: 'classic' } });
const compiledCard = moduleUrl(resolveImports(card.code, cardSourceUrl));
const modal = await transformWithOxc(readFileSync(sourceUrl, 'utf8'), 'BuyTradeDisciplineModal.jsx', { jsx: { runtime: 'classic' } });
const compiled = resolveImports(modal.code.replace(/import\s*(['"])\.\/[^'"]+\.css\1;?/g, ''), sourceUrl)
  .replace(JSON.stringify(cardSourceUrl.href), JSON.stringify(compiledCard));
const { default: BuyTradeDisciplineModal } = await import(moduleUrl(compiled));

const trade = { symbol: 'NVDA', name: '英伟达', shares: 1250, price: 187.5, date: '2026-11-07' };
const unavailable = { ready: false, value: null, asOf: '', met: false };
const rsi = { ready: true, value: 78.2, asOf: '2026-11-06', met: false, zone: 'overbought' };
const vix = { ready: true, value: 0.89, asOf: '2026-11-06', met: false };
const model = status => ({ status, rsi, vix,
  ...(status === 'met' ? { rsi: { ...rsi, value: 18.6, zone: 'extremely-oversold', met: true } } : {}),
  ...(status === 'unknown' ? { vix: unavailable } : {}),
});
const render = props => renderToStaticMarkup(React.createElement(BuyTradeDisciplineModal, { trade, ...props }));
const vixSection = html => html.match(/<section[^>]*aria-label="VIX \/ VIX3M"[\s\S]*?<\/section>/)?.[0] || '';

test('real modal renders met, unmet and unknown states with their matching actions in both languages', () => {
  const cases = [
    ['unmet', '本次买入未满足纪律', 'Buy conditions are not met', '仍然记录买入', 'Record buy anyway'],
    ['met', '本次买入符合纪律', 'Buy conditions are met', '确认记录买入', 'Confirm buy record'],
    ['unknown', '暂时无法判断买入条件', 'Buy conditions cannot be verified', '仍然记录买入', 'Record buy anyway'],
  ];
  for (const [status, zhTitle, enTitle, zhAction, enAction] of cases) {
    for (const englishMode of [false, true]) {
      const html = render({ discipline: model(status), englishMode });
      assert.ok(html.includes(englishMode ? enTitle : zhTitle));
      assert.ok(html.includes(englishMode ? enAction : zhAction));
      assert.match(html, /role="dialog" aria-modal="true"/);
      assert.match(html, /RSI\(6\) ≤20/);
      assert.match(html, /VIX \/ VIX3M &gt;1/);
      assert.match(html, /NVDA/);
      assert.match(html, /1,250/);
      assert.match(html, /<time dateTime="2026-11-07">2026-11-07<\/time>/);
      assert.match(html, /<time dateTime="2026-11-06">2026-11-06<\/time>/);
      assert.doesNotMatch(html, /示例|本地预览|破例原因|textarea/);
    }
  }
});

test('missing metrics never render zero or a satisfied condition and historical edits hide current signals', () => {
  const html = render({ discipline: model('unknown') });
  const section = vixSection(html);
  assert.match(section, /<strong>—<\/strong>/);
  assert.match(section, /待确认|暂无有效数据/);
  assert.doesNotMatch(section, /data-met="true"|>0(?:\.000)?<|<time/);
  for (const status of ['historical', 'not-applicable']) {
    const historical = render({ discipline: { ...model('unmet'), status }, trade: { ...trade, date: '2026-10-28' } });
    assert.match(historical, /确认记录这笔买入/);
    assert.match(historical, /补录或修改交易不套用当前指标/);
    assert.match(historical, /2026-10-28/);
    assert.doesNotMatch(historical, /78\.2|0\.890|2026-11-06|买入条件|buy-discipline-metric/);
  }
});

test('ratio boundary rendering never rounds a value above or below one into the opposite discipline state', () => {
  for (const [value, formatted] of [
    [1, '1.000'], [1.0001, '1.0001'], [0.9999, '0.9999'],
    [1 + Number.EPSILON, '&gt;1.000000'], [1 - Number.EPSILON, '&lt;1.000000'],
  ]) {
    const html = render({ discipline: { status: value > 1 ? 'met' : 'unmet', rsi, vix: { ...vix, value, met: value > 1 } } });
    const section = vixSection(html);
    assert.ok(section.includes(`>${formatted}</strong>`));
    assert.match(section, new RegExp(`data-met="${value > 1}"`));
    if (value === 1) assert.match(section, /等于 1，未触发/);
    if (value > 1) assert.match(section, /data-tone="high">倒挂/);
  }
});

test('TQQQ allocation warning remains visible regardless of discipline outcome', () => {
  const allocationWarning = '买入后 TQQQ 仓位为 12.5%，超过 10% 提醒线。';
  for (const status of ['unmet', 'met', 'unknown', 'historical']) {
    const html = render({ discipline: model(status), trade: { ...trade, symbol: 'TQQQ' }, allocationWarning });
    assert.match(html, /role="note"/);
    assert.ok(html.includes(allocationWarning));
    assert.match(html, /仓位提醒/);
  }
});

test('actions preserve callbacks, emphasize review when unmet, and prevent cancellation during saving', () => {
  let closed = 0;
  let confirmed = 0;
  const onConfirm = () => { confirmed += 1; };
  const onClose = () => { closed += 1; };
  for (const status of ['met', 'unmet', 'unknown', 'historical']) {
    const shell = BuyTradeDisciplineModal({ discipline: model(status), trade, onConfirm, onClose });
    const [cancel, confirm] = shell.props.actions;
    assert.equal(confirm.onClick, onConfirm);
    assert.equal(cancel.disabled, false);
    assert.equal(confirm.disabled, false);
    assert.equal(cancel.className === 'srm-primary', status === 'unmet' || status === 'unknown');
    assert.equal(confirm.className === 'srm-primary', status === 'met' || status === 'historical');
    confirm.onClick();
    cancel.onClick();
  }
  assert.equal(confirmed, 4);
  assert.equal(closed, 4);
  const saving = BuyTradeDisciplineModal({ discipline: model('unmet'), trade, submitting: true, onConfirm, onClose });
  assert.ok(saving.props.actions.every(action => action.disabled === true));
  assert.equal(saving.props.actions[1].label, '保存中…');
  saving.props.onClose();
  saving.props.actions[0].onClick();
  assert.equal(closed, 4, 'overlay, header and cancel callbacks cannot dismiss a saving confirmation');
  const html = render({ discipline: model('unmet'), submitting: true });
  assert.equal((html.match(/<button[^>]*disabled=""/g) || []).length, 2);
});

test('dialog uses the buy form width and shared viewport layout while keeping action content outside its scroller', () => {
  const shell = BuyTradeDisciplineModal({ discipline: model('unmet'), trade });
  assert.equal(shell.props.widthClassName, 'w-[calc(100vw-32px)] max-w-[440px]');
  assert.match(shell.props.panelClassName, /stock-report-modal/);
  assert.ok(shell.props.footerContent);
  assert.notEqual(shell.props.scrollFooterContent, true);
  assert.equal(shell.props.compactKeyboardSpacing, true);
  const html = render({ discipline: model('unmet') });
  assert.match(html, /flex max-h-full min-w-0 flex-col overflow-hidden/);
  assert.match(html, /overflow-y-auto overscroll-contain/);
  assert.match(html, /data-action-modal-footer="true"/);
  const css = readFileSync(new URL('../src/components/BuyTradeDisciplineModal.css', import.meta.url), 'utf8');
  assert.match(css, /\.buy-discipline-overlay\s*\{\s*z-index:\s*120/);
  assert.doesNotMatch(css, /position:\s*fixed|touch-action:\s*none/);
});
