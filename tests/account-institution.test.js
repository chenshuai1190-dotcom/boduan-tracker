import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAccountInstitution } from '../src/lib/accountInstitution.js';

test('resolves the seven supported institutions and the existing user account names', () => {
  const cases = {
    支付宝现金: 'alipay',
    支付宝理财: 'alipay',
    招商银行: 'cmb',
    IBKR: 'ibkr',
    招商永隆: 'winglung',
    招商永隆银行: 'winglung',
    招收永隆银行: 'winglung',
    长桥证券: 'longbridge',
    中银国际: 'boci',
    东方财富: 'eastmoney',
    东方财富证券: 'eastmoney',
    'East Money': 'eastmoney',
    Eastmoney: 'eastmoney',
    'Eastmoney Securities': 'eastmoney',
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(resolveAccountInstitution({ name }), expected, name);
  }
});

test('normalizes case, full-width characters, whitespace, hyphens and known account suffixes', () => {
  const cases = {
    '  ＩＢＫＲ  ': 'ibkr',
    'IBKR - USD Account': 'ibkr',
    'Interactive-Brokers（美元）': 'ibkr',
    '支付宝（人民币）现金账户': 'alipay',
    'China Merchants Bank — HKD': 'cmb',
    'CMB Wing Lung Bank（港币账户）': 'winglung',
    'Longbridge Securities - USD': 'longbridge',
    'BOCI Securities (HKD)': 'boci',
    'Bank of China International': 'boci',
    ' 招商 银行 - 美元账户 ': 'cmb',
    ' ＥＡＳＴＭＯＮＥＹ — CNY Account ': 'eastmoney',
    'East Money Securities（人民币）': 'eastmoney',
    '东方财富证券（人民币）现金账户': 'eastmoney',
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(resolveAccountInstitution({ name }), expected, name);
  }
});

test('supports common Chinese aliases and traditional names without confusing parent institutions', () => {
  const cases = {
    支付寶現金: 'alipay',
    招行: 'cmb',
    招商銀行: 'cmb',
    盈透證券: 'ibkr',
    招商永隆銀行: 'winglung',
    永隆銀行: 'winglung',
    長橋證券: 'longbridge',
    中銀國際: 'boci',
    中銀國際證券: 'boci',
    東方財富: 'eastmoney',
    東方財富證券: 'eastmoney',
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(resolveAccountInstitution({ name }), expected, name);
  }
});

test('does not use substring matches or accept similar but different institutions', () => {
  const names = [
    '招商证券', '招商證券', '中国银行', '中國銀行', 'Bank of China',
    '微信', '微信现金', '支付宝商家服务', '支付宝（微信）',
    '原IBKR', 'IBKR其他', 'IBKR (unknown)', 'IBKR/长桥证券',
    '招商银行与中银国际', '长桥大学', 'BOC', 'IB', '未知账户',
    '东方证券', '東方證券', '东方财富期货', '東方財富期貨',
    '天天基金', '东方财富天天基金', 'Eastmoney Futures',
    '原东方财富', '东方财富其他', '东方财富/东方证券',
  ];
  for (const name of names) assert.equal(resolveAccountInstitution({ name }), null, name);
});

test('resolves a historical Eastmoney account after its balance reaches zero', () => {
  const account = Object.freeze({ name: '东方财富', balance: 0, currency: 'CNY' });
  assert.equal(resolveAccountInstitution(account), 'eastmoney');
  assert.equal(account.balance, 0);
});

test('missing names keep the fallback even when other fields name an institution', () => {
  for (const account of [null, undefined, {}, { name: null }, { name: 123 }, { name: '' }, { name: ' \n ' }, { institution: 'ibkr' }]) {
    assert.equal(resolveAccountInstitution(account), null);
  }
});

test('reads only account.name and never mutates the supplied account', () => {
  const account = Object.freeze({
    name: ' IBKR（美元） ',
    balance: 123.45,
    currency: 'USD',
    get institution() { throw new Error('unrelated account fields must not be read'); },
  });
  assert.equal(resolveAccountInstitution(account), 'ibkr');
  assert.equal(account.name, ' IBKR（美元） ');
  assert.equal(account.balance, 123.45);
  assert.equal(account.currency, 'USD');
});
