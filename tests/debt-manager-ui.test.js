import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { createDebtPreviewSeed, DEBT_PREVIEW_STORAGE_KEY } from '../src/dev/debtManagerPreviewStore.js';
import { debtErrorText, debtText } from '../src/lib/debtManagerI18n.js';

const pageUrl = new URL('../src/pages/DebtManagerPage.jsx', import.meta.url);
const pageSource = readFileSync(pageUrl, 'utf8');
const compiled = new Map();
async function compile(url) {
  if (compiled.has(url.href)) return compiled.get(url.href);
  const loading = (async () => {
    let source = readFileSync(url, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    // Expose the existing leaves only to this test; their source and imports remain real.
    if (url.href === pageUrl.href) source += '\nexport { DebtEditor, RepaymentEditor, BulkRepaymentEditor, Sheet };';
    let { code } = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'classic' } });
    for (const match of [...code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)].reverse()) {
      const resolved = match[3].startsWith('.') ? new URL(match[3], url) : null;
      const target = resolved?.pathname.endsWith('.jsx') ? await compile(resolved) : resolved?.href || import.meta.resolve(match[3]);
      code = code.slice(0, match.index) + match[1] + JSON.stringify(target) + code.slice(match.index + match[0].length);
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  })();
  compiled.set(url.href, loading);
  return loading;
}
const { default: DebtManagerPage, DebtEditor, RepaymentEditor, BulkRepaymentEditor, Sheet } = await import(await compile(pageUrl));

const seed = () => createDebtPreviewSeed('2026-09-23');
const persisted = data => JSON.stringify({ schemaVersion: 1, ...data });
function memoryStorage(raw = null) {
  const values = new Map([['accounts', 'private account'], ['ledger', 'private ledger']]);
  if (raw !== null) values.set(DEBT_PREVIEW_STORAGE_KEY, raw);
  const calls = [];
  return {
    values, calls,
    getItem(key) { calls.push(['get', key]); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(['set', key]); values.set(key, value); },
  };
}

function withBrowser(storage, run) {
  const keys = ['Date', 'localStorage', 'window', 'fetch'];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const RealDate = globalThis.Date;
  const now = new RealDate(2026, 8, 23, 12).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  try {
    for (const [key, value] of Object.entries({ Date: FixedDate, localStorage: storage, window: { scrollTo() {} }, fetch() { throw new Error('Debt preview must not fetch'); } })) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    return run();
  } finally {
    for (const key of keys) {
      if (originals.get(key)) Object.defineProperty(globalThis, key, originals.get(key));
      else delete globalThis[key];
    }
  }
}

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}
const byClass = (tree, className) => nodes(tree, node => node.props.className?.split(/\s+/).includes(className));
const button = (tree, label) => nodes(tree, node => node.type === 'button' && node.props['aria-label'] === label)[0];
const editorFooter = rendered => rendered.tree.props.footer;

// Retain only the invoked component's state between explicit SSR renders, so its
// real event callbacks can be exercised without a DOM or a second renderer.
function driver(Component, props = {}) {
  const state = [];
  return { render() {
    let tree;
    function Capture() {
      const useState = React.useState;
      let index = 0;
      React.useState = initial => {
        const slot = index++;
        if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
        return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
      };
      try { tree = Component(props); } finally { React.useState = useState; }
      return tree;
    }
    const useLayoutEffect = React.useLayoutEffect;
    // Neither effect runs during SSR; avoid the client-only modal's known
    // layout-effect warning without hiding any other rendering warnings.
    React.useLayoutEffect = React.useEffect;
    try {
      const html = renderToStaticMarkup(React.createElement(Capture));
      return { tree, html };
    } finally { React.useLayoutEffect = useLayoutEffect; }
  } };
}

function setField(rendered, name, value) {
  const field = nodes(rendered.tree, node => node.props.name === name && typeof node.props.onChange === 'function')[0];
  assert.ok(field, `the actual form must expose ${name}`);
  field.props.onChange(name, value);
}
function submit(rendered) {
  const form = nodes(rendered.tree, node => node.type === 'form')[0];
  assert.ok(form);
  form.props.onSubmit({ preventDefault() {} });
}
const cardIds = html => [...html.matchAll(/data-debt-id="([^"]+)"/g)].map(match => match[1]);

test('the actual initial page shows 250万 original, 65万 paid, 185万 remaining and three CNY debts in urgency order', () => {
  const storage = memoryStorage();
  withBrowser(storage, () => {
    const { tree, html } = driver(DebtManagerPage, { preview: true }).render();
    assert.match(html, /data-debt-manager="local-preview"/);
    assert.match(html, /人民币 CNY/);
    assert.match(html, /剩余总欠款/);
    assert.match(renderToStaticMarkup(byClass(tree, 'dm-overview-hero')[0]), /<span>¥<\/span>1,850,000\.00/);
    assert.match(html, /原始欠款<\/span><strong>¥2,500,000\.00/);
    assert.match(html, /累计已还<\/span><strong>¥650,000\.00/);
    assert.match(html, /3 笔未结清/);
    assert.match(html, /aria-valuenow="26"/);
    assert.deepEqual(cardIds(html), ['demo-debt-renovation', 'demo-debt-friend', 'demo-debt-supplier']);
    for (const status of ['OVERDUE', 'DUE_SOON', 'NORMAL']) assert.match(html, new RegExp(`data-status="${status}"`));
    for (const text of ['已逾期', '即将到期', '正常', '2026/07/28', '2026/09/28', '2026/12/31']) assert.ok(html.includes(text), text);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.deepEqual(storage.calls, [['get', DEBT_PREVIEW_STORAGE_KEY]], 'rendering only reads the independent preview key');
  });
});

test('production begins in a cloud loading state without reading or displaying local preview debts', () => {
  const storage = memoryStorage();
  withBrowser(storage, () => {
    const { tree, html } = driver(DebtManagerPage, { supabase: {}, userId: 'owner-1' }).render();
    assert.match(html, /data-debt-manager="cloud"/);
    assert.match(html, /正在读取欠款记录/);
    assert.equal(button(tree, '新增欠款').props.disabled, true);
    assert.doesNotMatch(html, /本地预览|预览数据|供应商借款|装修借款|亲友周转|1,850,000|¥0\.00/);
    assert.deepEqual(storage.calls, []);
  });
});

test('English debt UI translates status, amounts, forms, errors, and import review without changing user data', () => {
  const storage = memoryStorage();
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true, language: 'en' });
    const first = page.render();
    for (const label of ['Debts', 'Total outstanding', 'Original debt', 'Total repaid', 'Due this month', 'Overdue', 'Due soon', 'On track']) {
      assert.ok(first.html.includes(label), label);
    }
    assert.match(first.html, /1,850,000\.00/);
    assert.ok(first.html.includes('装修借款'), 'user-provided debt names remain unchanged');
    button(first.tree, 'Add debt').props.onClick();
    const editorNode = nodes(page.render().tree, node => node.type === DebtEditor)[0];
    assert.equal(editorNode.props.language, 'en');
    const editor = driver(editorNode.type, editorNode.props);
    assert.match(editor.render().html, /aria-label="Add debt"/);
    submit(editor.render());
    const invalid = editor.render().html;
    assert.match(invalid, /Enter a debt name/);
    assert.match(invalid, /Required/);
    assert.doesNotMatch(invalid, /请输入欠款名称|必填/);
  });
  assert.equal(debtText('zh', '第 {{line}} 行', { line: 2 }), '第 2 行');
  assert.equal(debtText('en', '第 {{line}} 行', { line: 2 }), 'Line 2');
  assert.equal(debtErrorText('en', '缺少明确还款日期'), 'No clear repayment date');
  assert.equal(debtErrorText('en', 'PostgREST unknown error'), 'Unable to complete this action. Reload the records and try again.');
});

test('persisted empty arrays remain an empty list and do not repopulate examples', () => {
  const raw = persisted({ debts: [], repayments: [] });
  const storage = memoryStorage(raw);
  withBrowser(storage, () => {
    const { html } = driver(DebtManagerPage, { preview: true }).render();
    assert.match(html, /从第一笔欠款开始/);
    assert.match(html, /0 笔未结清/);
    assert.deepEqual(cardIds(html), []);
    assert.doesNotMatch(html, /供应商借款|装修借款|亲友周转|1,850,000|2,500,000/);
    assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), raw);
    assert.ok(storage.calls.every(([operation]) => operation === 'get'));
  });
});

test('corrupt or unreadable storage renders an explicit error without zero balances or seed cards', () => {
  for (const storage of [memoryStorage('{broken'), { getItem() { throw new Error('denied'); }, setItem() { throw new Error('must not save'); } }]) {
    withBrowser(storage, () => {
      const { tree, html } = driver(DebtManagerPage, { preview: true }).render();
      assert.match(html, /暂时无法读取本地数据/);
      assert.match(html, /role="alert"/);
      assert.match(html, /重新读取/);
      assert.equal(button(tree, '新增欠款').props.disabled, true);
      assert.equal(byClass(tree, 'dm-overview-hero').length, 0);
      assert.deepEqual(cardIds(html), []);
      assert.doesNotMatch(html, /¥0\.00|供应商借款|装修借款|亲友周转|1,850,000|2,500,000/);
    });
  }
});

test('valid storage whose aggregate cannot be calculated shows the guarded error instead of crashing or showing zero', () => {
  const data = seed();
  data.debts = data.debts.slice(0, 2).map(debt => ({ ...debt, originalAmount: 50000000000000 }));
  data.repayments = [];
  const storage = memoryStorage(persisted(data));
  withBrowser(storage, () => {
    const { tree, html } = driver(DebtManagerPage, { preview: true }).render();
    assert.match(html, /本地记录的金额或日期异常/);
    assert.equal(button(tree, '新增欠款').props.disabled, true);
    assert.equal(byClass(tree, 'dm-overview-hero').length, 0);
    assert.doesNotMatch(html, /¥0\.00|data-debt-id=|1,850,000|2,500,000/);
    assert.ok(storage.calls.every(([operation]) => operation === 'get'));
  });
});

test('actual page and form callbacks add a debt, record a partial repayment, then settle it without saving derived balances', () => {
  const storage = memoryStorage(persisted({ debts: [], repayments: [] }));
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true });
    button(page.render().tree, '新增欠款').props.onClick();
    const newDebt = nodes(page.render().tree, node => node.type === DebtEditor)[0];
    assert.ok(newDebt);
    const editor = driver(newDebt.type, newDebt.props);
    let form = editor.render();
    assert.match(form.html, /role="dialog"[^>]*aria-label="新增欠款"/);
    assert.match(form.html, /原始金额 · 人民币 ¥/);
    setField(form, 'name', '本地新增借款');
    setField(form, 'originalAmount', '1000.00');
    submit(editor.render());
    let rendered = page.render();
    assert.match(rendered.html, /欠款详情/);
    assert.match(rendered.html, /本地新增借款/);
    assert.match(rendered.html, /<span>¥<\/span>1,000\.00/);
    assert.match(rendered.html, /2026\/09\/23/);

    for (const [amount, remaining] of [['400', '600.00'], [null, '0.00']]) {
      byClass(rendered.tree, 'dm-detail-action')[0].props.children.props.onClick();
      const payment = nodes(page.render().tree, node => node.type === RepaymentEditor)[0];
      assert.ok(payment);
      const repayment = driver(payment.type, payment.props);
      const repaymentForm = repayment.render();
      assert.match(repaymentForm.html, /role="dialog"[^>]*aria-label="记一笔还款"/);
      if (amount === null) byClass(repaymentForm.tree, 'dm-fill-remaining')[0].props.onClick();
      else setField(repaymentForm, 'amount', amount);
      submit(repayment.render());
      rendered = page.render();
      assert.ok(rendered.html.includes(`<span>¥</span>${remaining}`));
    }
    assert.match(rendered.html, /data-status="SETTLED"/);
    assert.match(rendered.html, /已全部结清/);
    assert.equal(byClass(rendered.tree, 'dm-detail-action')[0].props.children.props.disabled, true);
    assert.equal(byClass(rendered.tree, 'dm-payment-row').length, 2);
    button(rendered.tree, '返回欠款列表').props.onClick();
    const list = page.render();
    assert.match(list.html, /0 笔未结清/);
    assert.match(list.html, /class="dm-settled"/);
    const saved = JSON.parse(storage.values.get(DEBT_PREVIEW_STORAGE_KEY));
    assert.equal(saved.debts.length, 1);
    assert.equal(saved.repayments.length, 2);
    assert.deepEqual(saved.repayments.map(payment => payment.amount), [400, 600]);
    for (const record of [...saved.debts, ...saved.repayments]) {
      for (const key of ['remaining', 'remainingAmount', 'totalPaid', 'progress', 'status']) assert.equal(Object.hasOwn(record, key), false, key);
    }
    assert.ok(storage.calls.every(([, key]) => key === DEBT_PREVIEW_STORAGE_KEY));
    assert.equal(storage.values.get('accounts'), 'private account');
    assert.equal(storage.values.get('ledger'), 'private ledger');
  });
});

test('editing an overpaid repayment previews and saves the balance after counting every other repayment', () => {
  for (const [amount, remaining, status] of [['100', '0.00', 'SETTLED'], ['50', '50.00', 'NORMAL']]) {
    const original = seed();
    const data = {
      debts: [{ ...original.debts[0], originalAmount: 200 }],
      repayments: [
        { ...original.repayments[0], id: 'other-payment', amount: 100, repaymentDate: '2026-09-20' },
        { ...original.repayments[0], id: 'edited-payment', amount: 150, repaymentDate: '2026-09-21' },
      ],
    };
    const storage = memoryStorage(persisted(data));
    withBrowser(storage, () => {
      const page = driver(DebtManagerPage, { preview: true });
      const card = nodes(page.render().tree, node => node.props.debt?.id === data.debts[0].id)[0];
      assert.ok(card);
      driver(card.type, card.props).render().tree.props.onClick();
      const currentPayment = byClass(page.render().tree, 'dm-payment-row').find(node => node.props['aria-label'].includes('150.00'));
      assert.ok(currentPayment);
      currentPayment.props.onClick();
      const payment = nodes(page.render().tree, node => node.type === RepaymentEditor)[0];
      assert.equal(payment.props.debt.originalAmount, 200);
      assert.equal(payment.props.debt.totalPaid, 250);
      assert.equal(payment.props.debt.remainingAmount, 0);
      assert.equal(payment.props.repayment.amount, 150);
      const editor = driver(payment.type, payment.props);
      setField(editor.render(), 'amount', amount);
      const form = editor.render();
      const preview = renderToStaticMarkup(byClass(form.tree, 'dm-after-payment')[0]);
      assert.ok(preview.includes(`<strong>¥${remaining}</strong>`), `editing 150 to ${amount} must preview ${remaining}`);
      if (amount === '100') assert.doesNotMatch(preview, /¥50\.00/);
      submit(form);
      const detail = page.render();
      const hero = renderToStaticMarkup(byClass(detail.tree, 'dm-detail-hero')[0]);
      assert.ok(hero.includes(`<span>¥</span>${remaining}`), 'saved derived balance must equal the preview');
      assert.ok(hero.includes(`data-status="${status}"`));
      const saved = JSON.parse(storage.values.get(DEBT_PREVIEW_STORAGE_KEY));
      assert.equal(saved.repayments.length, 2, 'editing replaces the same record');
      assert.equal(saved.repayments.find(row => row.id === 'other-payment').amount, 100);
      assert.equal(saved.repayments.find(row => row.id === 'edited-payment').amount, Number(amount));
      assert.equal(Object.hasOwn(saved.debts[0], 'remainingAmount'), false);
    });
  }
});

test('deleting an entire debt requires a second confirmation and removes its repayments from the isolated overview', () => {
  const original = seed();
  const storage = memoryStorage(persisted(original));
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true });
    const card = nodes(page.render().tree, node => node.props.debt?.id === 'demo-debt-supplier')[0];
    assert.ok(card);
    driver(card.type, card.props).render().tree.props.onClick();
    assert.match(page.render().html, /供应商借款/);
    button(page.render().tree, '编辑欠款').props.onClick();
    const opened = nodes(page.render().tree, node => node.type === DebtEditor)[0];
    assert.equal(opened.props.debt.id, 'demo-debt-supplier');
    const editor = driver(opened.type, opened.props);
    const deleteAction = byClass(editorFooter(editor.render()), 'dm-delete-link')[0];
    assert.ok(deleteAction, 'an existing debt should expose a destructive action');
    deleteAction.props.onClick();
    let confirmation = editor.render();
    assert.match(confirmation.html, /供应商借款/);
    assert.match(confirmation.html, /还款记录|还款流水/);
    const actions = byClass(editorFooter(confirmation), 'dm-two-actions')[0];
    assert.ok(actions, 'deletion must require a distinct confirmation step');
    const cancel = byClass(actions, 'dm-secondary')[0];
    const confirm = byClass(actions, 'dm-danger-button')[0];
    assert.ok(cancel);
    assert.ok(confirm);
    assert.equal(storage.calls.filter(([operation]) => operation === 'set').length, 0, 'opening confirmation must not write');

    cancel.props.onClick();
    assert.equal(byClass(editorFooter(editor.render()), 'dm-two-actions').length, 0);
    assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), persisted(original), 'cancel must preserve all data');

    byClass(editorFooter(editor.render()), 'dm-delete-link')[0].props.onClick();
    confirmation = editor.render();
    byClass(byClass(editorFooter(confirmation), 'dm-two-actions')[0], 'dm-danger-button')[0].props.onClick();
    const after = page.render();
    assert.equal(byClass(after.tree, 'dm-detail-hero').length, 0, 'successful deletion returns to overview');
    assert.deepEqual(cardIds(after.html), ['demo-debt-renovation', 'demo-debt-friend']);
    assert.match(after.html, /原始欠款<\/span><strong>¥500,000\.00/);
    assert.match(after.html, /累计已还<\/span><strong>¥150,000\.00/);
    assert.match(after.html, /<span>¥<\/span>350,000\.00/);
    assert.match(after.html, /2 笔未结清/);
    const saved = JSON.parse(storage.values.get(DEBT_PREVIEW_STORAGE_KEY));
    assert.equal(saved.debts.length, 2);
    assert.equal(saved.repayments.length, 2);
    assert.ok(saved.debts.every(debt => debt.id !== 'demo-debt-supplier'));
    assert.ok(saved.repayments.every(repayment => repayment.debtId !== 'demo-debt-supplier'));
    assert.equal(storage.calls.filter(([operation]) => operation === 'set').length, 1, 'debt and repayment deletion should be one atomic store write');
    assert.ok(storage.calls.every(([, key]) => key === DEBT_PREVIEW_STORAGE_KEY));
    assert.equal(storage.values.get('accounts'), 'private account');
    assert.equal(storage.values.get('ledger'), 'private ledger');
  });
});

test('failed whole-debt deletion keeps the detail and all repayment records visible with an explicit save error', () => {
  const original = seed();
  const raw = persisted(original);
  const storage = memoryStorage(raw);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true });
    const card = nodes(page.render().tree, node => node.props.debt?.id === 'demo-debt-supplier')[0];
    driver(card.type, card.props).render().tree.props.onClick();
    button(page.render().tree, '编辑欠款').props.onClick();
    const opened = nodes(page.render().tree, node => node.type === DebtEditor)[0];
    const editor = driver(opened.type, opened.props);
    byClass(editorFooter(editor.render()), 'dm-delete-link')[0].props.onClick();
    byClass(byClass(editorFooter(editor.render()), 'dm-two-actions')[0], 'dm-danger-button')[0].props.onClick();

    const after = page.render();
    assert.match(after.html, /role="alert"/);
    assert.match(after.html, /未保存/);
    assert.ok(byClass(after.tree, 'dm-detail-hero').length, 'failed deletion must not navigate away');
    assert.match(after.html, /供应商借款/);
    assert.equal(byClass(after.tree, 'dm-payment-row').length, 1);
    assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), raw);
  });
});

function bulkFixture() {
  const example = seed();
  const duplicateLine = '家庭约定还款 2021.9.27 微信20000';
  const validLines = [
    '家庭约定还款 2021.10.01 支付宝10000',
    '家庭约定还款 2021.10.05 招商银行30000',
  ];
  const lines = [
    duplicateLine,
    ...validLines,
    '其他事项 2021.10.08 支付宝9000',
    '家庭约定还款 日期待核 5000',
    '家庭约定还款 2021.10.10 微信7000（不在合同内）',
  ];
  return {
    data: {
      debts: [{ ...example.debts[0], id: 'bulk-debt', name: '家庭约定还款', originalAmount: 100000, debtDate: '2020-01-01' }],
      repayments: [{ ...example.repayments[0], id: 'prior-repayment', debtId: 'bulk-debt', amount: 20000, repaymentDate: '2021-09-27', note: duplicateLine }],
    },
    lines, validLines,
  };
}

function openBulk(page, debtId = 'bulk-debt') {
  const card = nodes(page.render().tree, node => node.props.debt?.id === debtId)[0];
  assert.ok(card);
  driver(card.type, card.props).render().tree.props.onClick();
  const bulkButton = nodes(page.render().tree, node => node.type === 'button' && node.props.children === '批量录入')[0];
  assert.ok(bulkButton, 'debt detail must expose bulk repayment entry');
  bulkButton.props.onClick();
  const opened = nodes(page.render().tree, node => node.type === BulkRepaymentEditor)[0];
  assert.ok(opened, 'bulk sheet should open on the selected debt');
  return driver(opened.type, opened.props);
}

function reviewBulk(editor, lines) {
  const before = editor.render();
  const textarea = nodes(before.tree, node => node.type === 'textarea')[0];
  assert.ok(textarea);
  textarea.props.onChange({ target: { value: lines.join('\n') } });
  const review = byClass(editorFooter(editor.render()), 'dm-primary')[0];
  assert.equal(review.props.children, '解析并核对');
  review.props.onClick();
  return editor.render();
}

test('bulk review defaults to safe rows, preserves source text, and atomically appends only selected repayments', () => {
  const { data, lines, validLines } = bulkFixture();
  const storage = memoryStorage(persisted(data));
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true });
    const editor = openBulk(page);
    const review = reviewBulk(editor, lines);
    const rows = nodes(review.tree, node => node.props['data-import-status']);
    assert.deepEqual(rows.map(row => row.props['data-import-status']), ['READY', 'READY', 'READY', 'REVIEW', 'REVIEW', 'EXCLUDED']);
    assert.deepEqual(rows.map(row => nodes(row, item => item.type === 'input' && item.props.type === 'checkbox')[0].props.checked),
      [false, true, true, false, false, false], 'only new, dated target-debt rows should be preselected');
    assert.equal(nodes(rows[5], item => item.type === 'input' && item.props.type === 'checkbox')[0].props.disabled, true);
    assert.match(review.html, /待确认 2/);
    assert.match(review.html, /合同外 1/);
    assert.match(review.html, /与已有或本次记录相同/);
    assert.match(renderToStaticMarkup(editorFooter(review)), /已选 2 笔/);
    assert.match(renderToStaticMarkup(editorFooter(review)), /¥40,000\.00/);
    assert.ok(storage.calls.every(([operation]) => operation === 'get'), 'pasting and reviewing must not write storage');

    byClass(editorFooter(review), 'dm-primary')[0].props.onClick();
    const after = page.render();
    assert.match(after.html, /已录入 2 笔还款/);
    assert.match(renderToStaticMarkup(byClass(after.tree, 'dm-detail-hero')[0]), /<span>¥<\/span>40,000\.00/);
    assert.equal(byClass(after.tree, 'dm-payment-row').length, 3);
    assert.equal(storage.calls.filter(([operation]) => operation === 'set').length, 1, 'the batch must be one storage write');
    const saved = JSON.parse(storage.values.get(DEBT_PREVIEW_STORAGE_KEY));
    assert.deepEqual(saved.repayments.map(row => row.amount).sort((a, b) => a - b), [10000, 20000, 30000]);
    assert.deepEqual(saved.repayments.filter(row => row.id !== 'prior-repayment').map(row => row.note).sort(), [...validLines].sort(), 'original lines should remain available as payment evidence');
    assert.ok(saved.repayments.every(row => row.debtId === 'bulk-debt'));
    assert.equal(Object.hasOwn(saved.debts[0], 'remainingAmount'), false);

    const again = nodes(after.tree, node => node.type === 'button' && node.props.children === '批量录入')[0];
    again.props.onClick();
    const opened = nodes(page.render().tree, node => node.type === BulkRepaymentEditor)[0];
    const repeated = reviewBulk(driver(opened.type, opened.props), lines);
    const repeatRows = nodes(repeated.tree, node => node.props['data-import-status']);
    assert.equal(repeatRows.filter(row => nodes(row, item => item.type === 'input' && item.props.type === 'checkbox')[0].props.checked).length, 0,
      'repasting already recorded source lines must not select them again');
    assert.match(renderToStaticMarkup(editorFooter(repeated)), /已选 0 笔/);
    assert.equal(storage.calls.filter(([operation]) => operation === 'set').length, 1);
  });
});

test('a failed bulk write keeps the review sheet and every original repayment unchanged', () => {
  const { data, lines } = bulkFixture();
  const raw = persisted(data);
  const storage = memoryStorage(raw);
  let attemptedWrites = 0;
  storage.setItem = () => { attemptedWrites += 1; throw new Error('QuotaExceededError'); };
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true });
    const editor = openBulk(page);
    const review = reviewBulk(editor, lines);
    byClass(editorFooter(review), 'dm-primary')[0].props.onClick();
    const after = page.render();
    assert.equal(attemptedWrites, 1);
    assert.equal(storage.values.get(DEBT_PREVIEW_STORAGE_KEY), raw);
    assert.equal(byClass(after.tree, 'dm-payment-row').length, 1);
    assert.match(renderToStaticMarkup(editorFooter(editor.render())), /确认录入 2 笔/, 'failed save should retain the prepared selection for retry');
    const openSheet = nodes(after.tree, node => node.type === BulkRepaymentEditor)[0];
    assert.ok(openSheet, 'save failure must leave the sheet mounted');
    const retry = driver(openSheet.type, openSheet.props);
    assert.match(renderToStaticMarkup(editorFooter(retry.render())), /未保存/);
    assert.match(renderToStaticMarkup(byClass(after.tree, 'dm-detail-hero')[0]), /<span>¥<\/span>80,000\.00/);
  });
});

test('a missing-date history line needs a corrected date and explicit selection before import', () => {
  const { data } = bulkFixture();
  const rawLine = '家庭约定还款 日期待核 5000';
  const storage = memoryStorage(persisted(data));
  withBrowser(storage, () => {
    const page = driver(DebtManagerPage, { preview: true });
    const editor = openBulk(page);
    let reviewed = reviewBulk(editor, [rawLine]);
    let row = nodes(reviewed.tree, node => node.props['data-import-status'] === 'REVIEW')[0];
    assert.ok(row);
    assert.equal(nodes(row, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.checked, false);
    nodes(row, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange();
    byClass(editorFooter(editor.render()), 'dm-primary')[0].props.onClick();
    assert.match(renderToStaticMarkup(editorFooter(editor.render())), /日期或金额无效/);
    assert.ok(storage.calls.every(([operation]) => operation === 'get'));

    reviewed = editor.render();
    row = nodes(reviewed.tree, node => node.props['data-import-status'] === 'REVIEW')[0];
    nodes(row, node => node.type === 'input' && node.props.type === 'date')[0].props.onChange({ target: { value: '2021-10-12' } });
    byClass(editorFooter(editor.render()), 'dm-primary')[0].props.onClick();
    const saved = JSON.parse(storage.values.get(DEBT_PREVIEW_STORAGE_KEY));
    assert.equal(saved.repayments.length, 2);
    assert.deepEqual(saved.repayments[1], {
      id: saved.repayments[1].id,
      debtId: 'bulk-debt', amount: 5000, repaymentDate: '2021-10-12', note: rawLine,
      createdAt: saved.repayments[1].createdAt, updatedAt: saved.repayments[1].updatedAt,
    });
    assert.equal(storage.calls.filter(([operation]) => operation === 'set').length, 1);
  });
});

test('the real sheet keeps its modal semantics and the page stays independent of financial context and providers', () => {
  const sheet = driver(Sheet, { title: '独立记录', onClose() {}, children: React.createElement('p', null, '仅供预览'), footer: React.createElement('button', null, '确认') }).render();
  assert.match(sheet.html, /role="dialog" aria-modal="true" aria-label="独立记录"/);
  assert.match(sheet.html, /aria-label="关闭"/);
  assert.match(sheet.html, /data-action-modal-footer="true"/);
  assert.match(sheet.html, /dm-sheet-overlay/);
  assert.match(pageSource, /export default function DebtManagerPage\(\{ onBack, supabase, userId, preview = false, language = 'zh' \}\)/);
  assert.doesNotMatch(pageSource, /\bfetch\s*\(|\bctx\b|investmentSummary|availableCash|stock_trades|swing_waves|asset_accounts|\/api\//);
  const imports = [...pageSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['react', 'lucide-react', '../components/ActionModalCard.jsx', '../lib/debtManager.js', '../lib/debtRepaymentImport.js', '../dev/debtManagerPreviewStore.js', '../lib/debtManagerCloudStore.js', '../lib/debtMutationReconciliation.js', '../lib/debtManagerI18n.js']);
});
