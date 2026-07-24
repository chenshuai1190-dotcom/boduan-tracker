import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveThreeMonthQqqRelativeReturn,
  deriveCloseBasedPosition,
  filterStockDetailHistory,
  filterStockDetailWeeklyHistory,
  findStockDetailWeeklyMaOnOrBefore,
  findWatchlistStockDetailRows,
  fullStockDetailChartWindow,
  normalizeStockDetailHistory,
  normalizeStockDetailWeeklyHistory,
  resolveWatchlistEarningsEvents,
  resolveStockDetailClose,
  sliceStockDetailChartWindow,
  stockDetailChartDragIntent,
  targetProgressPercent,
  targetProgressPositionPercent,
  targetSpacePercent,
  transformStockDetailChartWindow,
  usdToDisplayCurrency,
} from '../src/lib/watchlistStockDetail.js';

function assertClose(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);
}

test('stock detail history is normalized and ranges use the latest completed close', () => {
  const rows = normalizeStockDetailHistory([
    { date: '2026-07-17', close: 202, ma200: 180 },
    { date: 'bad', close: 999 },
    { date: '2026-06-17', close: 180, ma200: null },
    { date: '2026-07-17', close: 203, ma200: 181.5 },
    { date: '2026-07-16', close: 0 },
  ]);
  assert.deepEqual(rows, [
    { date: '2026-06-17', close: 180, ma200: null },
    { date: '2026-07-17', close: 203, ma200: 181.5 },
  ]);
  assert.equal(filterStockDetailHistory(rows, '1m').length, 2);
  assert.deepEqual(resolveStockDetailClose(rows), {
    asOfDate: '2026-07-17',
    closeUsd: 203,
    previousCloseUsd: 180,
    changeUsd: 23,
    changePercent: (23 / 180) * 100,
  });
});

test('daily history range keeps the real MA field and clamps end-of-month subtraction', () => {
  const visible = filterStockDetailHistory([
    { date: '2026-02-27', close: 100, ma200: 90 },
    { date: '2026-02-28', close: 101, ma200: null },
    { date: '2026-03-31', close: 110, ma200: 95 },
  ], '1m');

  assert.deepEqual(visible, [
    { date: '2026-02-28', close: 101, ma200: null },
    { date: '2026-03-31', close: 110, ma200: 95 },
  ]);
});

test('three-month relative return aligns common dates and uses adjusted QQQ closes only', () => {
  const result = deriveThreeMonthQqqRelativeReturn([
    { date: '2026-07-31', close: 120 },
    { date: '2026-04-30', close: 100 },
    { date: 'invalid', close: 999 },
  ], [
    { date: '2026-07-31', close: 9_999, rawClose: 9_999, adjustedClose: 220 },
    { date: '2026-04-30', close: 1, rawClose: 1, adjustedClose: 200 },
  ]);

  assert.deepEqual({
    requestedStartDate: result.requestedStartDate,
    startDate: result.startDate,
    endDate: result.endDate,
  }, {
    requestedStartDate: '2026-04-30',
    startDate: '2026-04-30',
    endDate: '2026-07-31',
  });
  assertClose(result.stockReturnPercent, 20);
  assertClose(result.qqqReturnPercent, 10);
  assertClose(result.relativeReturnPercent, 10);
});

test('three-month relative return uses the latest and earliest eligible exact common trading dates', () => {
  const result = deriveThreeMonthQqqRelativeReturn([
    { date: '2026-04-15', close: 90 },
    { date: '2026-04-16', close: 95 },
    { date: '2026-04-17', close: 100 },
    { date: '2026-07-16', close: 110 },
  ], [
    { date: '2026-04-15', adjustedClose: 190 },
    { date: '2026-04-17', adjustedClose: 200 },
    { date: '2026-07-16', adjustedClose: 210 },
  ]);

  assert.equal(result.requestedStartDate, '2026-04-16');
  assert.equal(result.startDate, '2026-04-17');
  assert.equal(result.endDate, '2026-07-16');
  assertClose(result.stockReturnPercent, 10);
  assertClose(result.qqqReturnPercent, 5);
  assertClose(result.relativeReturnPercent, 5);
});

test('three-month relative return fails closed for short history or missing adjusted QQQ data', () => {
  const shortStock = [
    { date: '2026-05-01', close: 100 },
    { date: '2026-07-31', close: 110 },
  ];
  const shortQqq = [
    { date: '2026-05-01', adjustedClose: 200 },
    { date: '2026-07-31', adjustedClose: 210 },
  ];
  assert.equal(deriveThreeMonthQqqRelativeReturn(shortStock, shortQqq), null);
  assert.equal(deriveThreeMonthQqqRelativeReturn([
    { date: '2026-04-30', close: 100 },
    { date: '2026-07-31', close: 110 },
  ], [
    { date: '2026-04-30', close: 200, rawClose: 200, adjustedClose: null },
    { date: '2026-07-31', close: 210, rawClose: 210, adjustedClose: 0 },
  ]), null);

  const equal = deriveThreeMonthQqqRelativeReturn([
    { date: '2026-04-30', close: 100 },
    { date: '2026-07-31', close: 110 },
  ], [
    { date: '2026-04-30', adjustedClose: 200 },
    { date: '2026-07-31', adjustedClose: 220 },
  ]);
  assert.equal(equal.relativeReturnPercent, 0);
  assert.equal(Object.is(equal.relativeReturnPercent, -0), false);
});

test('three-month relative return never presents a stale QQQ window as current', () => {
  assert.equal(deriveThreeMonthQqqRelativeReturn([
    { date: '2026-03-15', close: 90 },
    { date: '2026-03-17', close: 100 },
    { date: '2026-06-15', close: 110 },
    { date: '2026-07-17', close: 120 },
  ], [
    { date: '2026-03-15', adjustedClose: 180 },
    { date: '2026-03-17', adjustedClose: 200 },
    { date: '2026-06-15', adjustedClose: 210 },
  ]), null);
});

test('watchlist earnings separates the latest published report from the latest available market reaction', () => {
  const events = [
    {
      symbol: 'NVDA',
      reportDate: '2026-07-22',
      fiscalDate: '2026-06-30',
      earningsPublished: true,
      epsActual: 1.91,
      marketReactionPercent: null,
    },
    {
      symbol: 'NVDA',
      reportDate: '2026-05-20',
      fiscalDate: '2026-04-30',
      earningsPublished: true,
      epsActual: 1.87,
      marketReactionPercent: 7.32,
    },
    {
      symbol: 'NVDA',
      reportDate: '2026-07-23',
      fiscalDate: '2026-06-30',
      epsEstimate: 1.92,
    },
    {
      symbol: 'NVDA',
      reportDate: '2026-08-28',
      fiscalDate: '2026-07-31',
      epsEstimate: 2.11,
    },
    {
      symbol: 'NVDA',
      reportDate: '2026-08-30',
      fiscalDate: '2026-07-31',
      earningsPublished: true,
      epsActual: 2.18,
      marketReactionPercent: 4.2,
    },
  ];

  const resolved = resolveWatchlistEarningsEvents(events, 'nvda', '2026-07-24');
  assert.equal(resolved.latestPublished, events[0], 'a published report must not be hidden just because market reaction is pending');
  assert.equal(resolved.latestReactionEvent, events[1], 'the reaction tile should fall back to the latest published report with a real reaction');
  assert.equal(resolved.upcoming, events[3], 'a past schedule without actuals must not be treated as published');
  assert.notEqual(resolved.latestPublished, events[4], 'a future schedule carrying stale actual fields must not replace the latest completed report');
});

test('three-month relative return rejects a sparse window that starts too far after three months', () => {
  assert.equal(deriveThreeMonthQqqRelativeReturn([
    { date: '2026-04-29', close: 100 },
    { date: '2026-06-30', close: 110 },
    { date: '2026-07-31', close: 120 },
  ], [
    { date: '2026-04-29', adjustedClose: 200 },
    { date: '2026-06-30', adjustedClose: 210 },
    { date: '2026-07-31', adjustedClose: 220 },
  ]), null);
});

test('weekly history preserves missing MA values, filters five years, and resolves the latest locked MA by date', () => {
  const rows = normalizeStockDetailWeeklyHistory([
    { date: '2021-07-09', weekEndDate: '2021-07-09', close: 100, ma200: 80, completed: true },
    { date: '2026-07-10', weekEndDate: '2026-07-10', close: 200, ma200: 150, completed: true },
    { date: '2026-07-15', weekEndDate: '2026-07-17', close: 205, ma200: 999, completed: false },
    { date: 'bad', close: 999, ma200: 999 },
  ]);

  assert.equal(rows.length, 3);
  assert.equal(rows.at(-1).ma200, 999, 'normalization should preserve the provider payload for diagnostics');
  assert.equal(rows.at(-1).completed, false);
  const visible = filterStockDetailWeeklyHistory(rows, '5y');
  assert.deepEqual(visible.map((row) => row.date), ['2026-07-10', '2026-07-15']);
  assert.deepEqual(findStockDetailWeeklyMaOnOrBefore(rows, '2026-07-15'), rows[1], 'tooltips must ignore any MA attached to an unfinished week');
  assert.equal(findStockDetailWeeklyMaOnOrBefore(rows, '2021-01-01'), null);
});

test('five-year chart window pinches around its anchor, pans, clamps, and keeps inclusive endpoints', () => {
  const full = fullStockDetailChartWindow(261);
  assert.deepEqual(full, { start: 0, end: 260 });

  const centered = transformStockDetailChartWindow(full, { pointCount: 261, scale: 2 });
  assert.deepEqual(centered, { start: 65, end: 195 });
  assert.equal(centered.end - centered.start + 1, 131);
  assert.deepEqual(
    transformStockDetailChartWindow(full, { pointCount: 261, scale: 2, startCenterRatio: 0, currentCenterRatio: 0 }),
    { start: 0, end: 130 },
  );
  assert.deepEqual(
    transformStockDetailChartWindow(full, { pointCount: 261, scale: 2, startCenterRatio: 1, currentCenterRatio: 1 }),
    { start: 130, end: 260 },
  );

  const pannedEarlier = transformStockDetailChartWindow(centered, {
    pointCount: 261,
    scale: 1,
    startCenterRatio: 0.5,
    currentCenterRatio: 0.75,
  });
  assert.deepEqual(pannedEarlier, { start: 33, end: 163 });
  assert.deepEqual(
    transformStockDetailChartWindow({ start: 0, end: 130 }, {
      pointCount: 261,
      scale: 1,
      startCenterRatio: 0.5,
      currentCenterRatio: 1,
    }),
    { start: 0, end: 130 },
  );

  const minimum = transformStockDetailChartWindow(full, { pointCount: 261, scale: 100 });
  assert.equal(minimum.end - minimum.start + 1, 26);
  assert.deepEqual(transformStockDetailChartWindow(full, { pointCount: 261, scale: 0 }), full);
  assert.deepEqual(transformStockDetailChartWindow(full, { pointCount: 20, scale: 4 }), { start: 0, end: 19 });

  const rows = Array.from({ length: 261 }, (_, index) => ({ index }));
  const sliced = sliceStockDetailChartWindow(rows, centered);
  assert.equal(sliced.length, 131);
  assert.equal(sliced[0].index, 65);
  assert.equal(sliced.at(-1).index, 195);
});

test('stock chart distinguishes a tap, horizontal pan, and vertical page scroll', () => {
  assert.equal(stockDetailChartDragIntent(4, 3), 'pending');
  assert.equal(stockDetailChartDragIntent(14, 3), 'horizontal');
  assert.equal(stockDetailChartDragIntent(-14, 3), 'horizontal');
  assert.equal(stockDetailChartDragIntent(3, 14), 'vertical');
  assert.equal(stockDetailChartDragIntent(12, 12), 'pending');
});

test('portfolio conversion is reserved for holding totals while target math stays canonical in USD', () => {
  const targetUsd = 250;
  assert.equal(usdToDisplayCurrency(2000, 'USD', 7.2), 2000);
  assert.equal(usdToDisplayCurrency(2000, 'CNY', 7.2), 14400);
  assert.equal(targetSpacePercent(targetUsd, 200), 25);
  assert.equal(targetProgressPercent(targetUsd, 200, 150), 50);
});

test('cost-to-target progress keeps the real signed value while the visual marker stays bounded', () => {
  const belowCost = targetProgressPercent(550, 393.82, 412.07);
  assert.equal(belowCost, ((393.82 - 412.07) / (550 - 412.07)) * 100);
  assert.equal(targetProgressPositionPercent(belowCost), 0);

  const aboveTarget = targetProgressPercent(250, 300, 150);
  assert.equal(aboveTarget, 150);
  assert.equal(targetProgressPositionPercent(aboveTarget), 100);

  assert.equal(targetProgressPercent(150, 200, 150), null);
  assert.equal(targetProgressPercent(250, 200, null), null);
  assert.equal(targetProgressPositionPercent(null), 0);
});

test('watchlist detail derives read-only holdings and formal trades by symbol', () => {
  const rows = findWatchlistStockDetailRows({
    symbol: 'nvda',
    watchlist: [{ symbol: 'NVDA', targetPriceUsd: 250 }],
    quoteRows: [{ symbol: 'NVDA', price: 202 }],
    positions: [{ symbol: 'NVDA', heldShares: 10, avgCost: 180, remainingCost: 1800 }],
    stockTrades: [
      { id: 1, symbol: 'NVDA', date: '2026-01-01' },
      { id: 2, symbol: 'AAPL', date: '2026-02-01' },
      { id: 3, symbol: 'NVDA', date: '2026-03-01' },
    ],
  });
  assert.equal(rows.watchlistRow.targetPriceUsd, 250);
  assert.deepEqual(rows.trades.map((trade) => trade.id), [3, 1]);
  assert.deepEqual(deriveCloseBasedPosition(rows.position, 200, 5000), {
    held: true,
    shares: 10,
    averageCostUsd: 180,
    marketValueUsd: 2000,
    pnlUsd: 200,
    pnlPercent: (200 / 1800) * 100,
    allocationPercent: 40,
  });
});
