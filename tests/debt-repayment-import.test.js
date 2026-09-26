import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBulkRepaymentText } from '../src/lib/debtRepaymentImport.js';

const options = { targetName: '家庭约定还款', debtDate: '2020-01-01', today: '2026-09-23' };

test('mixed pasted history only marks explicit, dated target-debt payments ready', () => {
  const text = [
    '家庭约定还款 合同签订前 500000 转账',
    '家庭约定还款 2021.9.27 转账20000 微信',
    '家庭约定还款 2021.11.13 转账50000 公司支付宝',
    '其他费用 2022.1.27 招行 200000（不在合同内 不计算）',
    '其他用途 2022.5.31 支付宝 4799',
    '2025',
    '家庭约定还款 2025.1.25 招商银行 100000（十万）',
    '2026',
    '2026.1.31号 招商银行 130000（十三万）',
    '家庭约定还款 2026.08.14号 微信支付 （二万元）',
  ].join('\n');
  const { rows, summary } = parseBulkRepaymentText(text, options);
  assert.deepEqual(rows.map(row => row.lineNumber), [1, 2, 3, 4, 5, 7, 9, 10]);
  assert.deepEqual(rows.map(row => row.status), ['REVIEW', 'READY', 'READY', 'EXCLUDED', 'REVIEW', 'READY', 'REVIEW', 'READY']);
  assert.deepEqual(summary, { readyCount: 4, reviewCount: 3, excludedCount: 1, invalidCount: 0, readyAmount: 190000 });
  assert.equal(rows[0].date, null, 'a relative description must not turn into an invented date');
  assert.equal(rows[0].amount, 500000);
  assert.equal(rows[1].date, '2021-09-27');
  assert.equal(rows[1].method, '微信');
  assert.equal(rows[1].note, '');
  assert.equal(rows[2].method, '公司支付宝');
  assert.equal(rows[5].amount, 100000, 'matching Arabic and Chinese amounts are corroborating text, not two payments');
  assert.equal(rows[7].amount, 20000, 'a Chinese amount without Arabic numerals is recognized');
  assert.equal(rows[6].date, '2026-01-31');
  assert.match(rows[6].reason, /当前欠款/);
});

test('year headings can supply the year for clear month-day dates, but cannot date prose', () => {
  const { rows } = parseBulkRepaymentText('2025年\n1. 家庭约定还款 9.27 微信30000（三万元）\n2、家庭约定还款 10.1 招商银行 150000（十五万）\n家庭约定还款 年初付款 10000', options);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, '2025-09-27');
  assert.equal(rows[0].amount, 30000);
  assert.equal(rows[0].status, 'READY');
  assert.equal(rows[1].date, '2025-10-01');
  assert.equal(rows[1].amount, 150000);
  assert.equal(rows[1].status, 'READY');
  assert.equal(rows[2].date, null);
  assert.equal(rows[2].status, 'REVIEW');
});

test('invalid dates, conflicting amount aliases and negative amounts never become ready', () => {
  const { rows, summary } = parseBulkRepaymentText([
    '家庭约定还款 2025.2.30 支付宝 100',
    '家庭约定还款 2025.5.21 100000（五万）',
    '家庭约定还款 2025.5.22 -100（壹佰元）',
    '家庭约定还款 2025.5.23 无金额',
    '家庭约定还款 2025.5.24 0（五万）',
    '家庭约定还款 2025.5.25 1e1',
  ].join('\n'), options);
  assert.deepEqual(rows.map(row => row.status), ['INVALID', 'REVIEW', 'INVALID', 'INVALID', 'INVALID', 'INVALID']);
  assert.equal(rows[0].date, null);
  assert.equal(rows[1].amount, null);
  assert.match(rows[1].reason, /不一致/);
  assert.equal(summary.readyAmount, 0);
});

test('debt date and as-of date constraints prevent automatic import', () => {
  const { rows } = parseBulkRepaymentText('家庭约定还款 2024.1.1 100\n家庭约定还款 2026.9.24 200',
    { ...options, debtDate: '2025-01-01' });
  assert.deepEqual(rows.map(row => row.status), ['REVIEW', 'REVIEW']);
  assert.match(rows[0].reason, /早于欠款日期/);
  assert.match(rows[1].reason, /晚于今天/);
});

test('explicit out-of-contract text excludes even a target-named row with a valid date', () => {
  const { rows, summary } = parseBulkRepaymentText('家庭约定还款 2025.3.20 支付宝 50000（合同外，不计算）', options);
  assert.equal(rows[0].status, 'EXCLUDED');
  assert.equal(rows[0].amount, 50000);
  assert.equal(summary.readyAmount, 0);
});

test('mentioning the target later in a remark does not make another transfer ready', () => {
  const { rows } = parseBulkRepaymentText('2025.6.1 微信 1000 备注家庭约定还款\n家庭约定还款其他费用 2025.6.2 2000\n家庭约定还款2025.6.3 3000', options);
  assert.deepEqual(rows.map(row => row.status), ['REVIEW', 'REVIEW', 'READY']);
});

test('Arabic ten-thousand aliases and two-decimal amounts retain exact values', () => {
  const { rows, summary } = parseBulkRepaymentText('家庭约定还款 2025.5.21 ¥1,500.25（一千五百元）\n家庭约定还款 2025.5.22 15万（十五万）', options);
  assert.equal(rows[0].status, 'REVIEW', 'a mismatched Chinese alias requires review');
  assert.equal(rows[1].status, 'READY');
  assert.equal(rows[1].amount, 150000);
  assert.equal(summary.readyAmount, 150000);
  const exact = parseBulkRepaymentText('家庭约定还款 2025.5.21 ¥1,500.25 微信', options);
  assert.equal(exact.rows[0].amount, 1500.25);
  assert.equal(exact.summary.readyAmount, 1500.25);
});
