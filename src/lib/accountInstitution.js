// Presentation-only aliases: unknown names keep their existing account-type icon.
const INSTITUTION_ALIASES = {
  alipay: ['支付宝', '支付寶', 'alipay'],
  cmb: ['招商银行', '招商銀行', '招行', 'cmb', 'china merchants bank'],
  ibkr: ['ibkr', 'interactive brokers', '盈透', '盈透证券', '盈透證券'],
  winglung: [
    '招商永隆银行', '招商永隆銀行', '招商永隆',
    '永隆银行', '永隆銀行', '招收永隆银行', '招收永隆銀行', '招收永隆',
    'cmb wing lung bank', 'wing lung bank',
  ],
  longbridge: ['长桥证券', '長橋證券', '长桥', '長橋', 'longbridge', 'longbridge securities'],
  boci: ['中银国际', '中銀國際', '中银国际证券', '中銀國際證券', 'boci', 'boci securities', 'bank of china international'],
  eastmoney: ['东方财富', '东方财富证券', '東方財富', '東方財富證券', 'east money', 'eastmoney', 'eastmoney securities'],
};

function normalizeName(name) {
  return name.normalize('NFKC').trim().toLowerCase().replace(/[\s\-‐‑‒–—―]+/gu, '');
}

// Only known account/currency suffixes are accepted; arbitrary extra words are not.
const ACCOUNT_SUFFIX = [
  '现金', '現金', '理财', '理財', '余额', '餘額',
  '个人账户', '個人賬戶', '個人帳戶', '证券账户', '證券賬戶', '證券帳戶',
  '账户', '帐户', '賬戶', '帳戶', '现金账户', '現金賬戶', '現金帳戶',
  '美元', '美金', '港币', '港幣', '人民币', '人民幣', '离岸人民币', '離岸人民幣',
  '新加坡元', '新币', '新幣', '欧元', '歐元', '英镑', '英鎊',
  'usd', 'hkd', 'cny', 'cnh', 'rmb', 'sgd', 'eur', 'gbp',
  'cash', 'account', 'personalaccount', 'securitiesaccount',
].join('|');
const KNOWN_SUFFIX = new RegExp(`^(?:(?:${ACCOUNT_SUFFIX})|\\((?:${ACCOUNT_SUFFIX})+\\))*$`, 'u');
const ALIASES = Object.entries(INSTITUTION_ALIASES)
  .flatMap(([institution, aliases]) => aliases.map(alias => [normalizeName(alias), institution]))
  .sort(([left], [right]) => right.length - left.length);

/** Resolve a display icon from a known account name without changing account data. */
export function resolveAccountInstitution(account) {
  if (typeof account?.name !== 'string') return null;
  const name = normalizeName(account.name);
  if (!name) return null;

  for (const [alias, institution] of ALIASES) {
    if (name === alias) return institution;
  }
  for (const [alias, institution] of ALIASES) {
    if (name.startsWith(alias) && KNOWN_SUFFIX.test(name.slice(alias.length))) return institution;
  }
  return null;
}
