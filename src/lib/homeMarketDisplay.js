function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = optionalNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function resolveHoldingDisplayPrice(position = {}) {
  return positiveNumber(position?.currentPrice)
    || (position?.dailyPnlLocked ? positiveNumber(position?.dailyPnlPrice) : null);
}

export function resolveHomeMarketDisplayMetrics(row = {}, {
  livePrice = row?.price,
  liveChangePercent = row?.changePercent,
  high = row?.week52High || row?.high,
} = {}) {
  const locked = Boolean(row?.dailyPnlLocked);
  const lockedPrice = positiveNumber(row?.dailyPnlPrice);
  const price = locked
    ? lockedPrice
    : positiveNumber(livePrice);

  let changePercent = locked
    ? optionalNumber(row?.dailyPnlChangePercent)
    : optionalNumber(liveChangePercent);
  if (locked && changePercent === null && lockedPrice) {
    const baseline = positiveNumber(row?.dailyPnlBaselineClose)
      || positiveNumber(row?.dailyBaselineClose)
      || positiveNumber(row?.previousClose);
    if (baseline) changePercent = ((lockedPrice - baseline) / baseline) * 100;
  }

  const resolvedHigh = positiveNumber(high);
  const highDrawdown = price && resolvedHigh ? (price - resolvedHigh) / resolvedHigh : null;

  return {
    price,
    changePercent,
    highDrawdown,
    locked,
  };
}
