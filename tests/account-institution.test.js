import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { resolveAccountInstitution } from '../src/lib/accountInstitution.js';

test('resolves supported institutions and the existing user account names', () => {
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
    工商银行: 'icbc',
    中国工商银行: 'icbc',
    ICBC: 'icbc',
    建设银行: 'ccb',
    中国建设银行: 'ccb',
    CCB: 'ccb',
    中国银行: 'boc',
    'Bank of China': 'boc',
    BOC: 'boc',
    富途: 'futu',
    富途证券: 'futu',
    Futu: 'futu',
    'Futu Securities': 'futu',
    老虎: 'tiger',
    老虎证券: 'tiger',
    'Tiger Brokers': 'tiger',
    华泰证券: 'htsc',
    HTSC: 'htsc',
    'Huatai Securities': 'htsc',
    微信钱包: 'wechat',
    微信零钱通: 'wechat',
    微信理财: 'wechat',
    微信: 'wechat',
    WeChat: 'wechat',
    Weixin: 'wechat',
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
    '中国工商银行（人民币）个人账户': 'icbc',
    ' ＩＣＢＣ — USD Account ': 'icbc',
    '建设银行（港币账户）': 'ccb',
    'CCB - CNY': 'ccb',
    '中国银行（美元）现金账户': 'boc',
    'Bank of China - HKD Account': 'boc',
    'BOC（离岸人民币）': 'boc',
    '富途证券（港币）证券账户': 'futu',
    'Futu Securities — USD': 'futu',
    '老虎证券（新加坡元）': 'tiger',
    'Tiger Brokers - USD Account': 'tiger',
    '华泰证券（人民币）': 'htsc',
    'Huatai Securities - CNY Account': 'htsc',
    'HTSC（人民币账户）': 'htsc',
    '微信钱包（人民币）': 'wechat',
    '微信零钱通 - CNY': 'wechat',
    ' ＷＥＣＨＡＴ — Cash Account ': 'wechat',
    'Weixin（人民币账户）': 'wechat',
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
    工商銀行: 'icbc',
    中國工商銀行: 'icbc',
    工行: 'icbc',
    建設銀行: 'ccb',
    中國建設銀行: 'ccb',
    建行: 'ccb',
    中國銀行: 'boc',
    中行: 'boc',
    '中國銀行（港幣）個人賬戶': 'boc',
    富途證券: 'futu',
    '富途證券（美元）證券帳戶': 'futu',
    老虎證券: 'tiger',
    華泰證券: 'htsc',
    微信錢包: 'wechat',
    微信零錢通: 'wechat',
    微信理財: 'wechat',
    微信现金: 'wechat',
    '微信錢包（人民幣）餘額': 'wechat',
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(resolveAccountInstitution({ name }), expected, name);
  }
});

test('does not use substring matches or accept similar but different institutions', () => {
  const names = [
    '招商证券', '招商證券', '中国银行香港', '中國銀行香港',
    '中国银行（香港）', '中國銀行（香港）', 'Bank of China (Hong Kong)', 'BOC Hong Kong',
    '支付宝商家服务', '支付宝（微信）',
    '原IBKR', 'IBKR其他', 'IBKR (unknown)', 'IBKR/长桥证券',
    '招商银行与中银国际', '长桥大学', 'IB', '未知账户',
    '东方证券', '東方證券', '东方财富期货', '東方財富期貨',
    '天天基金', '东方财富天天基金', 'Eastmoney Futures',
    '原东方财富', '东方财富其他', '东方财富/东方证券',
    '工商银行香港', 'ICBC International', 'CCB International',
    '中国银行与中银国际', '中国银行国际', 'Bank of China Insurance',
    '原富途', '富途其他', '老虎基金', 'Tiger Brokers Futures',
    '华泰保险', '華泰保險', '华泰期货', 'Huatai Futures',
    '微信商家服务', '微信支付商户', 'WeChat Pay Merchant', '微信/支付宝',
    '现金', '银行定期', '大额存单', '货币基金', '保险', '基金',
  ];
  for (const name of names) assert.equal(resolveAccountInstitution({ name }), null, name);
});

test('classifies every asset account preset as its named institution or a generic fallback', () => {
  const source = readFileSync(new URL('../src/tabs/AnalysisTab.jsx', import.meta.url), 'utf8');
  const presetLiteral = source.match(/const ACCOUNT_PRESETS = (\{[\s\S]*?\n\});/)?.[1];
  assert.ok(presetLiteral, 'the account picker must expose its preset catalogue');
  const presets = runInNewContext(`(${presetLiteral})`, Object.create(null), { timeout: 1000 });
  const expectedByCategory = {
    银行: { 招商银行: 'cmb', 招商永隆: 'winglung', 工商银行: 'icbc', 建设银行: 'ccb', 中国银行: 'boc' },
    证券: { 长桥证券: 'longbridge', IBKR: 'ibkr', 富途: 'futu', 老虎: 'tiger', 华泰证券: 'htsc', 东方财富: 'eastmoney' },
    支付宝: { 支付宝现金: 'alipay', 支付宝理财: 'alipay' },
    微信: { 微信钱包: 'wechat', 微信零钱通: 'wechat' },
    定期: { 银行定期: null, 大额存单: null, 货币基金: null },
    现金: { 现金: null },
    公积金: { 住房公积金: null, 企业年金: null },
    其他: { 房产: null, 车: null, 黄金: null, 保险: null },
  };

  assert.deepEqual(Object.keys(presets).sort(), Object.keys(expectedByCategory).sort(), 'every account category must be classified');
  for (const [category, names] of Object.entries(presets)) {
    const expected = expectedByCategory[category];
    assert.deepEqual(Array.from(names).sort(), Object.keys(expected).sort(), `${category}: every preset must be classified`);
    for (const name of names) {
      assert.equal(resolveAccountInstitution({ name, type: category }), expected[name], `${category}: ${name}`);
    }
  }
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
