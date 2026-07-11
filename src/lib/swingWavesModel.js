import { normalizeStrictUserStockSymbol } from './symbols.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CREATE_FIELDS = new Set([
  'symbol',
  'name',
  'buyDate',
  'buyPriceUsd',
  'shares',
  'note',
]);
const UPDATE_FIELDS = new Set([
  ...CREATE_FIELDS,
  'sellDate',
  'sellPriceUsd',
]);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const assertObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('波段数据格式不正确');
  }
};

const assertAllowedFields = (value, allowedFields) => {
  const unexpectedField = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unexpectedField) throw new Error(`波段字段不允许写入: ${unexpectedField}`);
};

const normalizeText = (value) => String(value ?? '').trim();

export function normalizeSwingWaveDate(value, label) {
  const normalized = normalizeText(value);
  if (!ISO_DATE_RE.test(normalized)) throw new Error(`${label}格式不正确`);

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label}格式不正确`);
  }
  return normalized;
}

export function normalizePositiveSwingWaveNumber(value, label) {
  const isNumber = typeof value === 'number';
  const isDecimalText = typeof value === 'string'
    && value.trim() !== ''
    && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim());
  if (!isNumber && !isDecimalText) throw new Error(`${label}格式不正确`);

  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${label}必须大于 0`);
  }
  return normalized;
}

export function mapSwingWave(row) {
  if (!row) return null;
  const completed = row.sell_date != null && row.sell_price_usd != null;
  return {
    id: row.id,
    symbol: normalizeStrictUserStockSymbol(row.symbol),
    name: row.name || row.symbol || '',
    status: completed ? 'completed' : 'active',
    buyDate: row.buy_date,
    buyPriceUsd: Number(row.buy_price_usd),
    shares: Number(row.shares),
    sellDate: completed ? row.sell_date : null,
    sellPriceUsd: completed ? Number(row.sell_price_usd) : null,
    note: row.note || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function buildSwingWaveCreateRow(input, userId) {
  assertObject(input);
  assertAllowedFields(input, CREATE_FIELDS);
  if (!userId) throw new Error('未登录');

  const symbol = normalizeStrictUserStockSymbol(input.symbol);
  if (!symbol || !/[A-Z0-9]/.test(symbol)) throw new Error('股票代码格式不正确');

  return {
    user_id: userId,
    symbol,
    name: normalizeText(input.name) || symbol,
    buy_date: normalizeSwingWaveDate(input.buyDate, '开始日期'),
    buy_price_usd: normalizePositiveSwingWaveNumber(input.buyPriceUsd, '买入价格'),
    shares: normalizePositiveSwingWaveNumber(input.shares, '买入股数'),
    note: normalizeText(input.note),
  };
}

export function buildSwingWaveUpdateRow(currentWave, input) {
  assertObject(currentWave);
  assertObject(input);
  assertAllowedFields(input, UPDATE_FIELDS);
  if (Object.keys(input).length === 0) throw new Error('没有可更新的波段内容');

  const isCompleted = currentWave.status === 'completed';
  if (!isCompleted && (hasOwn(input, 'sellDate') || hasOwn(input, 'sellPriceUsd'))) {
    throw new Error('进行中波段必须通过完整卖出完成');
  }

  const symbol = hasOwn(input, 'symbol')
    ? normalizeStrictUserStockSymbol(input.symbol)
    : normalizeStrictUserStockSymbol(currentWave.symbol);
  if (!symbol || !/[A-Z0-9]/.test(symbol)) throw new Error('股票代码格式不正确');

  const buyDate = normalizeSwingWaveDate(
    hasOwn(input, 'buyDate') ? input.buyDate : currentWave.buyDate,
    '开始日期',
  );
  const buyPriceUsd = normalizePositiveSwingWaveNumber(
    hasOwn(input, 'buyPriceUsd') ? input.buyPriceUsd : currentWave.buyPriceUsd,
    '买入价格',
  );
  const shares = normalizePositiveSwingWaveNumber(
    hasOwn(input, 'shares') ? input.shares : currentWave.shares,
    '买入股数',
  );

  const row = {
    symbol,
    name: hasOwn(input, 'name')
      ? normalizeText(input.name) || symbol
      : normalizeText(currentWave.name) || symbol,
    buy_date: buyDate,
    buy_price_usd: buyPriceUsd,
    shares,
    note: hasOwn(input, 'note') ? normalizeText(input.note) : normalizeText(currentWave.note),
  };

  if (!isCompleted) return row;

  const sellDate = normalizeSwingWaveDate(
    hasOwn(input, 'sellDate') ? input.sellDate : currentWave.sellDate,
    '结束日期',
  );
  const sellPriceUsd = normalizePositiveSwingWaveNumber(
    hasOwn(input, 'sellPriceUsd') ? input.sellPriceUsd : currentWave.sellPriceUsd,
    '卖出价格',
  );
  if (sellDate < buyDate) throw new Error('结束日期不能早于开始日期');

  return {
    ...row,
    sell_date: sellDate,
    sell_price_usd: sellPriceUsd,
  };
}

export function buildSwingWaveCompletionRow(currentWave, input) {
  assertObject(currentWave);
  assertObject(input);
  assertAllowedFields(input, new Set(['sellDate', 'sellPriceUsd']));
  if (currentWave.status !== 'active') throw new Error('该波段已经完成');

  const sellDate = normalizeSwingWaveDate(input.sellDate, '结束日期');
  const sellPriceUsd = normalizePositiveSwingWaveNumber(input.sellPriceUsd, '卖出价格');
  const buyDate = normalizeSwingWaveDate(currentWave.buyDate, '开始日期');
  if (sellDate < buyDate) throw new Error('结束日期不能早于开始日期');

  return {
    sell_date: sellDate,
    sell_price_usd: sellPriceUsd,
  };
}
