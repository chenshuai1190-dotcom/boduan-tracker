export const HOME_SIGNAL_ET_OPEN_TIME = '09:30:00';

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function resolveHomeSignalBenchmarkMarketState(row = {}) {
  if (row?.dailyPnlLocked) return 'locked';
  const session = String(row?.dailyPnlSession || '').trim().toLowerCase();
  return session === 'pre' || session === 'regular' ? 'live' : 'locked';
}

export function resolveHomeSignalBenchmarkPrice(row = {}) {
  if (resolveHomeSignalBenchmarkMarketState(row) === 'locked') {
    return positiveNumber(row?.dailyPnlPrice);
  }
  return positiveNumber(row?.price);
}

export function buildHomeSignalBenchmarkRows(options = [], { selectedSymbol = '' } = {}) {
  const selected = String(selectedSymbol || '').trim().toUpperCase();
  return (Array.isArray(options) ? options : []).map((option, originalIndex) => {
    const symbol = String(option?.symbol || '').trim().toUpperCase();
    const price = resolveHomeSignalBenchmarkPrice(option);
    const high = positiveNumber(option?.week52High) || positiveNumber(option?.high);
    const drawdown = price && high ? (price - high) / high : null;
    return {
      ...option,
      symbol,
      price,
      high,
      drawdown,
      originalIndex,
      selected: Boolean(symbol && symbol === selected),
      marketState: resolveHomeSignalBenchmarkMarketState(option),
    };
  }).filter((row) => row.symbol);
}

export function sortHomeSignalBenchmarkRows(rows = [], direction = null) {
  const list = [...(Array.isArray(rows) ? rows : [])];
  if (direction !== 'asc' && direction !== 'desc') {
    return list.sort((a, b) => Number(a?.originalIndex || 0) - Number(b?.originalIndex || 0));
  }

  return list.sort((a, b) => {
    const aValue = Number(a?.drawdown);
    const bValue = Number(b?.drawdown);
    const aMissing = a?.drawdown === null || a?.drawdown === undefined || !Number.isFinite(aValue);
    const bMissing = b?.drawdown === null || b?.drawdown === undefined || !Number.isFinite(bValue);
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return Number(a?.originalIndex || 0) - Number(b?.originalIndex || 0);
      return aMissing ? 1 : -1;
    }
    const difference = direction === 'desc' ? aValue - bValue : bValue - aValue;
    return difference || Number(a?.originalIndex || 0) - Number(b?.originalIndex || 0);
  });
}

export function nextHomeSignalBenchmarkSortDirection(direction) {
  return direction === 'desc' ? 'asc' : 'desc';
}
