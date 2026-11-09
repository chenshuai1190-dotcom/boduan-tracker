import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/CashTradeSettlementPanel.jsx', import.meta.url), 'utf8');
const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
const text = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.map(text).join('') : String(tree ?? '') : text(tree.props.children);
const button = (tree, name) => walk(tree).find(node => node.type === 'button' && text(node) === name);
const flush = () => new Promise(resolve => setImmediate(resolve));
let nextId = 0;

async function harness(initialProps) {
  let cursor = 0;
  let props = initialProps;
  const slots = [];
  const pending = [];
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((item, index) => !Object.is(item, old.deps[index]))) { slots[i] = { deps, cleanup: old?.cleanup }; pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const key = `cashSettlementUi${++nextId}`;
  globalThis[key] = hooks;
  let Component;
  try {
    const compiled = await transformWithOxc(`const React = globalThis[${JSON.stringify(key)}];\n${source.replace(/^import .*;\n/gm, '')}`, 'CashTradeSettlementPanel.jsx', { jsx: { runtime: 'classic' } });
    Component = (await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  return {
    render(next) { if (next) props = next; cursor = 0; const tree = Component(props); pending.splice(0).forEach(effect => effect()); return tree; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const state = (patch = {}) => ({ settlement: { mode: 'manual', canEnable: true, canRepair: true, eligibleNewAccount: true, ...patch }, cashStatus: { availableCashUsd: 2000000, isSet: true }, openingCandidates: [{ eventId: 12, effectiveAt: '2026-11-08T05:00:00Z', cashUsd: 2000000 }] });
const plan = (kind = 'repair', patch = {}) => ({ kind, token: 'verified-ledger-token', openingEventId: 12, baselineDate: '2026-11-08', beforeCashUsd: 2000000, afterCashUsd: 1840528.90, affectedTradeCount: 1, ...patch });

test('no settlement API adds no controls or requests; unknown status never appears as manual', async () => {
  const absent = await harness({});
  assert.equal(absent.render(), null);
  const h = await harness({ api: { load: async () => { throw new Error('读取失败'); } } });
  assert.match(renderToStaticMarkup(h.render()), /正在读取结算方式/);
  await flush();
  const tree = h.render();
  assert.match(text(tree), /读取失败/);
  assert.doesNotMatch(text(tree), /手动余额|从当前余额启用/);
  assert.ok(button(tree, '重试'));
});

test('eligible new accounts review opening funds first, with exact amounts and no implicit write', async () => {
  const calls = [];
  const api = { load: async () => state(), preview: async input => { calls.push(input); return { plan: plan() }; }, confirm: async () => { throw new Error('must not write yet'); } };
  const h = await harness({ api }); h.render(); await flush();
  let tree = h.render();
  assert.ok(button(tree, '核对遗漏的交易扣款'));
  assert.equal(button(tree, '从当前余额启用'), undefined);
  assert.equal(button(tree, '确认并启用'), undefined);
  await button(tree, '核对遗漏的交易扣款').props.onClick();
  tree = h.render();
  assert.deepEqual(calls, [{ kind: 'repair', openingEventId: 12 }]);
  for (const value of ['$2,000,000.00 USD', '$1,840,528.90 USD', '2026-11-08', '1 笔']) assert.ok(text(tree).includes(value), value);
  assert.ok(button(tree, '确认并启用'));
});

test('legacy manual accounts can start from reviewed current cash without selecting historical repair', async () => {
  const calls = [];
  const api = { load: async () => state({ eligibleNewAccount: false, canRepair: false }), preview: async input => { calls.push(input); return { plan: plan('enable', { afterCashUsd: 2000000, affectedTradeCount: 0 }) }; } };
  const h = await harness({ api }); h.render(); await flush();
  let tree = h.render();
  await button(tree, '从当前余额启用').props.onClick(); tree = h.render();
  assert.deepEqual(calls, [{ kind: 'enable' }]);
  assert.match(text(tree), /已有历史持仓不再扣款/);
  assert.match(text(tree), /0 笔/);
});

test('incomplete or mismatched preview fails closed without a confirm action', async () => {
  for (const broken of [{ afterCashUsd: null }, { affectedTradeCount: null }, { token: '' }, { openingEventId: 99 }, { kind: 'enable' }]) {
    const api = { load: async () => state(), preview: async () => ({ plan: plan('repair', broken) }) };
    const h = await harness({ api }); h.render(); await flush();
    await button(h.render(), '核对遗漏的交易扣款').props.onClick();
    const tree = h.render();
    assert.equal(button(tree, '确认并启用'), undefined);
    assert.match(text(tree), /核对结果不完整/);
  }
});

test('confirmation is explicit, double-click safe, and an unknown result retries the same operation key', async () => {
  const confirmations = [];
  let resolve;
  const api = { load: async () => state(), preview: async () => ({ plan: plan() }), confirm: payload => { confirmations.push(payload); return new Promise((yes, no) => { resolve = { yes, no }; }); } };
  const h = await harness({ api }); h.render(); await flush();
  await button(h.render(), '核对遗漏的交易扣款').props.onClick();
  const submit = button(h.render(), '确认并启用');
  const first = submit.props.onClick(); await submit.props.onClick();
  assert.equal(confirmations.length, 1);
  resolve.no(new Error('连接中断')); await first;
  assert.match(text(h.render()), /连接中断/);
  assert.ok(button(h.render(), '确认并启用'));
  const retry = button(h.render(), '确认并启用').props.onClick();
  assert.equal(confirmations.length, 2);
  assert.equal(confirmations[0].operationKey, confirmations[1].operationKey);
  assert.equal(confirmations[0].planToken, 'verified-ledger-token');
  assert.equal(confirmations[0].openingEventId, 12);
  resolve.yes(state({ mode: 'auto' })); await retry;
  assert.match(text(h.render()), /已启用交易自动结算/);
  assert.equal(button(h.render(), '确认并启用'), undefined);
});

test('changed balance revision discards a stale preview before it can be confirmed', async () => {
  let completePreview;
  const api = { load: async () => state(), preview: () => new Promise(resolve => { completePreview = resolve; }) };
  const h = await harness({ api, revision: 'first' }); h.render(); await flush();
  const pending = button(h.render(), '核对遗漏的交易扣款').props.onClick();
  h.render({ api, revision: 'new-balance' }); await flush();
  completePreview({ plan: plan() }); await pending;
  const tree = h.render();
  assert.equal(button(tree, '确认并启用'), undefined);
  assert.ok(button(tree, '核对遗漏的交易扣款'));
});

test('automatic accounts show settlement semantics and no enabling actions in either language', async () => {
  for (const language of ['zh', 'en']) {
    const h = await harness({ api: { load: async () => state({ mode: 'auto' }) }, language });
    h.render(); await flush(); const tree = h.render();
    assert.match(text(tree), language === 'en' ? /Purchases reduce cash, sales add cash/ : /买入扣减现金，卖出增加现金/);
    assert.equal(walk(tree).filter(node => node.type === 'button').length, 0);
  }
});

test('both cash entry points pass the same settlement interface only into the opened editor', () => {
  for (const file of ['HomeTab', 'TradesTab']) {
    const code = readFileSync(new URL(`../src/tabs/${file}.jsx`, import.meta.url), 'utf8');
    assert.match(code, /cashTradeSettlementApi=\{cashTradeSettlementApi\}/);
    assert.match(code, /cashTradeSettlementRevision=\{cashTradeSettlementRevision\}/);
  }
  const editor = readFileSync(new URL('../src/components/AvailableCashEditor.jsx', import.meta.url), 'utf8');
  assert.ok(editor.indexOf("if (!isOpen) return null") < editor.indexOf('<CashTradeSettlementPanel'));
  assert.match(editor, /disabled=\{saving \|\| settlementBusy\}/);
});
