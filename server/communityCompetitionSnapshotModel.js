import crypto from 'node:crypto';

const EPSILON = 1e-9;

export class CompetitionSnapshotValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CompetitionSnapshotValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CompetitionSnapshotValidationError(code, message);
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail('non_finite', `${field} 不是有效数字`);
  return number;
}

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function normalizeTrade(row) {
  const symbol = normalizeSymbol(row?.symbol);
  const tradeDate = normalizeDate(row?.trade_date || row?.tradeDate || row?.date);
  const side = row?.side === 'sell' ? 'sell' : row?.side === 'buy' ? 'buy' : '';
  const price = finiteNumber(row?.price, '交易价格');
  const shares = finiteNumber(row?.shares, '交易数量');
  const fee = finiteNumber(row?.fee ?? 0, '交易费用');
  const currency = String(row?.currency ?? 'USD').trim().toUpperCase();
  if (!symbol || !tradeDate || !side || price <= 0 || shares <= 0 || fee < 0) {
    fail('invalid_trade', '交易账本包含无效记录');
  }
  if (currency !== 'USD') fail('unsupported_currency', '收益比赛仅支持 USD 交易账本');
  return {
    id: String(row?.id || ''),
    symbol,
    side,
    tradeDate,
    price,
    shares,
    fee,
    currency,
    createdAt: String(row?.created_at || row?.createdAt || ''),
  };
}

function sortTrades(a, b) {
  return a.tradeDate.localeCompare(b.tradeDate)
    || a.createdAt.localeCompare(b.createdAt)
    || a.id.localeCompare(b.id);
}

function normalizeTrades(rows, throughDate = null) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeTrade)
    .filter((trade) => !throughDate || trade.tradeDate <= throughDate)
    .sort(sortTrades);
}

function canonicalTrade(trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    trade_date: trade.tradeDate,
    price: trade.price,
    shares: trade.shares,
    fee: trade.fee,
    currency: trade.currency,
    created_at: trade.createdAt,
  };
}

export function computeCompetitionLedgerHash(stockTrades = [], throughDate) {
  const date = normalizeDate(throughDate);
  if (!date) fail('invalid_date', '账本哈希日期不合法');
  const canonical = normalizeTrades(stockTrades, date).map(canonicalTrade);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function deriveCompetitionHoldingSymbols(stockTrades = [], throughDate) {
  const date = normalizeDate(throughDate);
  if (!date) fail('invalid_date', '持仓代码日期不合法');
  const positions = new Map();
  normalizeTrades(stockTrades, date).forEach((trade) => {
    addPosition(positions, trade.symbol, trade.side === 'buy' ? trade.shares : -trade.shares);
  });
  return [...positions.entries()]
    .filter(([, shares]) => shares > EPSILON)
    .map(([symbol]) => symbol)
    .sort((a, b) => a.localeCompare(b, 'en-US'));
}

export function deriveVerifiedCompetitionHoldingSymbols({
  stockTrades = [],
  throughDate,
  expectedLedgerHash,
} = {}) {
  const expected = String(expectedLedgerHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return null;
  if (computeCompetitionLedgerHash(stockTrades, throughDate) !== expected) return null;
  return deriveCompetitionHoldingSymbols(stockTrades, throughDate);
}

function normalizeCloseRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = normalizeDate(row?.date);
      const rawClose = Number(row?.close);
      const adjustedClose = Number(row?.adjusted_close ?? row?.adjustedClose);
      const close = Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : rawClose;
      const high = Number(row?.high);
      const low = Number(row?.low);
      return date && Number.isFinite(close) && close > 0 ? {
        date,
        close,
        high: Number.isFinite(high) && high > 0 ? high : null,
        low: Number.isFinite(low) && low > 0 ? low : null,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeCloseMap(historicalClosesBySymbol = {}) {
  const entries = historicalClosesBySymbol instanceof Map
    ? [...historicalClosesBySymbol.entries()]
    : Object.entries(historicalClosesBySymbol || {});
  return new Map(entries.map(([symbol, rows]) => [normalizeSymbol(symbol), normalizeCloseRows(rows)]));
}

function exactClose(rows, date) {
  return rows.find((row) => row.date === date) || null;
}

function previousClose(rows, date) {
  return rows.filter((row) => row.date < date).at(-1) || null;
}

function newYorkCreatedAtParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  if (!normalizeDate(dateKey) || ![hour, minute, second].every(Number.isFinite)) return null;
  return { dateKey, seconds: hour * 3600 + minute * 60 + second };
}

function validateTargetTrade(trade, closeRow) {
  const created = newYorkCreatedAtParts(trade.createdAt);
  if (!created || created.dateKey !== trade.tradeDate || created.seconds > 16 * 3600) {
    fail('late_trade', `${trade.symbol} 当日交易必须在纽约时间收盘前写入`);
  }
  if (!closeRow || closeRow.high == null || closeRow.low == null) {
    fail('missing_close', `${trade.symbol} 缺少目标日完整收盘行情`);
  }
  if (trade.price < closeRow.low - EPSILON || trade.price > closeRow.high + EPSILON) {
    fail('price_out_of_range', `${trade.symbol} 交易价格超出目标日最高最低价范围`);
  }
}

function addPosition(positions, symbol, shares) {
  const next = (positions.get(symbol) || 0) + shares;
  if (next < -EPSILON) fail('oversell', `${symbol} 卖出数量超过当时持仓`);
  positions.set(symbol, Math.abs(next) <= EPSILON ? 0 : next);
}

function positionValue(positions, closeForSymbol, missingMessage) {
  let value = 0;
  positions.forEach((shares, symbol) => {
    if (shares <= EPSILON) return;
    const close = closeForSymbol(symbol);
    if (!close || !(close.close > 0)) fail('missing_close', `${symbol} ${missingMessage}`);
    value += shares * close.close;
  });
  if (!Number.isFinite(value)) fail('non_finite', '持仓市值不是有效数字');
  return value;
}

export function validateCompetitionTargetDateLedger({
  stockTrades = [],
  historicalClosesBySymbol = {},
  targetDate,
} = {}) {
  const date = normalizeDate(targetDate);
  if (!date) fail('invalid_date', '比赛账本校验日期不合法');

  const trades = normalizeTrades(stockTrades, date);
  const closeMap = normalizeCloseMap(historicalClosesBySymbol);
  const positions = new Map();
  const startPositions = new Map();
  const targetTrades = [];
  const targetSymbols = new Set();

  trades.forEach((trade) => {
    if (trade.tradeDate < date) {
      addPosition(positions, trade.symbol, trade.side === 'buy' ? trade.shares : -trade.shares);
      return;
    }
    targetTrades.push(trade);
    targetSymbols.add(trade.symbol);
  });

  positions.forEach((shares, symbol) => startPositions.set(symbol, shares));
  targetTrades.forEach((trade) => {
    const targetClose = exactClose(closeMap.get(trade.symbol) || [], date);
    validateTargetTrade(trade, targetClose);
    addPosition(positions, trade.symbol, trade.side === 'buy' ? trade.shares : -trade.shares);
  });

  const requiredSymbols = new Set(targetSymbols);
  startPositions.forEach((shares, symbol) => {
    if (shares > EPSILON) requiredSymbols.add(symbol);
  });
  positions.forEach((shares, symbol) => {
    if (shares > EPSILON) requiredSymbols.add(symbol);
  });
  requiredSymbols.forEach((symbol) => {
    if (!exactClose(closeMap.get(symbol) || [], date)) {
      fail('missing_close', `${symbol} 缺少重设基线目标日的权威收盘行情`);
    }
  });

  return [...requiredSymbols].sort((a, b) => a.localeCompare(b, 'en-US'));
}

export function buildCompetitionCashFlowSnapshot({
  stockTrades = [],
  historicalClosesBySymbol = {},
  targetDate,
  priorSnapshotDate = null,
  priorCumulativeReturnPct = 0,
} = {}) {
  const date = normalizeDate(targetDate);
  const priorDate = priorSnapshotDate ? normalizeDate(priorSnapshotDate) : null;
  if (!date || (priorSnapshotDate && !priorDate) || (priorDate && priorDate >= date)) {
    fail('invalid_date', '比赛快照日期不合法');
  }
  const trades = normalizeTrades(stockTrades, date);
  const closeMap = normalizeCloseMap(historicalClosesBySymbol);
  const positions = new Map();
  const targetTrades = [];

  trades.forEach((trade) => {
    if (trade.tradeDate < date) {
      addPosition(positions, trade.symbol, trade.side === 'buy' ? trade.shares : -trade.shares);
      return;
    }
    targetTrades.push(trade);
  });

  const startPositions = new Map(positions);
  if (priorDate) {
    const relevantSymbols = new Set(targetTrades.map((trade) => trade.symbol));
    startPositions.forEach((shares, symbol) => {
      if (shares > EPSILON) relevantSymbols.add(symbol);
    });
    relevantSymbols.forEach((symbol) => {
      const priorClose = previousClose(closeMap.get(symbol) || [], date);
      if (!priorClose || priorClose.date !== priorDate) {
        fail('snapshot_gap', `${symbol} 前一交易日收盘日期与上一份比赛快照不连续`);
      }
    });
  }
  if (priorDate && trades.some((trade) => trade.tradeDate > priorDate && trade.tradeDate < date)) {
    fail('trade_between_snapshots', '两次比赛快照之间存在未快照交易日');
  }
  const startValue = positionValue(
    startPositions,
    (symbol) => previousClose(closeMap.get(symbol) || [], date),
    '缺少前一交易日收盘价'
  );
  let buyFlow = 0;
  let sellFlow = 0;
  targetTrades.forEach((trade) => {
    const targetClose = exactClose(closeMap.get(trade.symbol) || [], date);
    validateTargetTrade(trade, targetClose);
    if (trade.side === 'buy') {
      buyFlow += trade.price * trade.shares + trade.fee;
      addPosition(positions, trade.symbol, trade.shares);
    } else {
      addPosition(positions, trade.symbol, -trade.shares);
      sellFlow += trade.price * trade.shares - trade.fee;
    }
  });
  const endValue = positionValue(
    positions,
    (symbol) => exactClose(closeMap.get(symbol) || [], date),
    '缺少目标日收盘价'
  );
  const denominator = startValue + buyFlow;
  const priorReturnPct = finiteNumber(priorCumulativeReturnPct, '上一份累计收益率');
  const emptyCarry = Boolean(
    priorDate
    && Math.abs(startValue) <= EPSILON
    && Math.abs(buyFlow) <= EPSILON
    && Math.abs(sellFlow) <= EPSILON
    && [...positions.values()].every((shares) => shares <= EPSILON)
  );
  let dailyReturnPct;
  if (!(denominator > EPSILON) || !Number.isFinite(denominator)) {
    if (!emptyCarry) fail('zero_denominator', '比赛日收益率缺少有效起始资金');
    dailyReturnPct = 0;
  } else {
    dailyReturnPct = (endValue + sellFlow - buyFlow - startValue) / denominator;
  }
  const cumulativeReturnPct = (1 + priorReturnPct) * (1 + dailyReturnPct) - 1;
  if (
    !Number.isFinite(dailyReturnPct)
    || !Number.isFinite(cumulativeReturnPct)
    || dailyReturnPct < -1 - EPSILON
    || cumulativeReturnPct < -1 - EPSILON
  ) {
    fail('non_finite', '比赛收益率计算结果无效');
  }

  return {
    snapshotDate: date,
    dailyReturnPct,
    cumulativeReturnPct,
    ledgerHash: computeCompetitionLedgerHash(trades, date),
  };
}
