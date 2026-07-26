function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDetailSeries(rows, observationTradingDays) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const close = finiteNumber(row?.close);
      const ma200 = finiteNumber(row?.ma200);
      const relativeTradingDay = finiteNumber(row?.relativeTradingDay);
      const date = String(row?.date || '');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || !(close > 0)
        || !(ma200 > 0)
        || relativeTradingDay === null
      ) {
        return null;
      }
      return {
        date,
        close,
        ma200,
        relativeTradingDay: Math.trunc(relativeTradingDay),
      };
    })
    .filter((row) => (
      row
      && row.relativeTradingDay >= -5
      && row.relativeTradingDay <= observationTradingDays
    ))
    .sort((left, right) => (
      left.relativeTradingDay - right.relativeTradingDay
      || left.date.localeCompare(right.date)
    ));
}

export function deriveMa200RetestDetail(event, observationTradingDays = 60) {
  const normalizedObservationDays = Math.max(
    1,
    Math.trunc(finiteNumber(observationTradingDays) || 60),
  );
  const series = normalizeDetailSeries(event?.detailSeries, normalizedObservationDays);
  const trigger = series.find((row) => row.relativeTradingDay === 0) || null;
  const observationRows = series.filter((row) => row.relativeTradingDay >= 0);
  if (!trigger || observationRows.length === 0) return null;

  const lowestClose = observationRows.reduce(
    (lowest, row) => (row.close < lowest.close ? row : lowest),
    observationRows[0],
  );
  const deepestMa = observationRows.reduce((deepest, row) => {
    const distancePct = ((row.close / row.ma200) - 1) * 100;
    return distancePct < deepest.distancePct
      ? { ...row, distancePct }
      : deepest;
  }, {
    ...observationRows[0],
    distancePct: ((observationRows[0].close / observationRows[0].ma200) - 1) * 100,
  });
  const endpointRow = observationRows.find(
    (row) => row.relativeTradingDay === normalizedObservationDays,
  ) || null;

  return {
    series,
    trigger,
    lowestClose: {
      ...lowestClose,
      fromTriggerPct: ((lowestClose.close / trigger.close) - 1) * 100,
    },
    deepestMa,
    endpoint: endpointRow
      ? {
          ...endpointRow,
          returnPct: ((endpointRow.close / trigger.close) - 1) * 100,
        }
      : null,
    observationTradingDays: normalizedObservationDays,
    complete: Boolean(endpointRow),
    asOfDate: series.at(-1)?.date || '',
  };
}
