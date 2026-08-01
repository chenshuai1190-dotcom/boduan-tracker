import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompetitionCashFlowSnapshot,
  buildCompetitionRecalculatedSnapshotSeries,
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
  deriveCompetitionHoldingSymbols,
  deriveCompetitionLedgerSymbols,
  deriveCompetitionRequiredCloseDates,
  deriveVerifiedCompetitionHoldingSymbols,
} from '../server/communityCompetitionSnapshotModel.js';

const TARGET_DATE = '2026-07-08';
const CLOSES = {
  NVDA: [
    { date: '2026-07-07', close: 100, high: 102, low: 98 },
    { date: TARGET_DATE, close: 110, high: 116, low: 105 },
  ],
};

function buy({ id = 'buy-1', date = '2026-07-07', price = 90, shares = 10, fee = 0, createdAt = '2026-07-07T14:00:00Z' } = {}) {
  return { id, symbol: 'NVDA', side: 'buy', trade_date: date, price, shares, fee, currency: 'USD', created_at: createdAt };
}

function sell({ id = 'sell-1', price = 115, shares = 4, fee = 0, createdAt = '2026-07-08T19:00:00Z' } = {}) {
  return { id, symbol: 'NVDA', side: 'sell', trade_date: TARGET_DATE, price, shares, fee, currency: 'USD', created_at: createdAt };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => (
    error instanceof CompetitionSnapshotValidationError && error.code === code
  ));
}

test('buying at the target close produces zero daily return', () => {
  const result = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({ date: TARGET_DATE, price: 110, createdAt: '2026-07-08T19:00:00Z' })],
    historicalClosesBySymbol: CLOSES,
  });
  assert.equal(result.dailyReturnPct, 0);
  assert.equal(result.cumulativeReturnPct, 0);
  assert.match(result.ledgerHash, /^[a-f0-9]{64}$/);
});

test('partial and full sells preserve correct cash-flow daily return', () => {
  const partial = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy(), sell()],
    historicalClosesBySymbol: CLOSES,
    priorCumulativeReturnPct: 0.1,
  });
  assert.ok(Math.abs(partial.dailyReturnPct - 0.12) < 1e-12);
  assert.ok(Math.abs(partial.cumulativeReturnPct - 0.232) < 1e-12);

  const full = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy(), sell({ price: 110, shares: 10 })],
    historicalClosesBySymbol: CLOSES,
  });
  assert.ok(Math.abs(full.dailyReturnPct - 0.1) < 1e-12);
  assert.ok(Math.abs(full.cumulativeReturnPct - 0.1) < 1e-12);
});

test('prior snapshots require the immediately preceding market close for every relevant holding', () => {
  expectCode('snapshot_gap', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    priorSnapshotDate: '2026-07-03',
    stockTrades: [buy({ date: '2026-07-03' })],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-03', close: 95 },
        { date: '2026-07-07', close: 100 },
        { date: TARGET_DATE, close: 110 },
      ],
    },
  }));

  const contiguous = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    priorSnapshotDate: '2026-07-07',
    stockTrades: [buy()],
    historicalClosesBySymbol: CLOSES,
  });
  assert.ok(Math.abs(contiguous.dailyReturnPct - 0.1) < 1e-12);
});

test('an already-ranked empty portfolio carries cumulative return across an idle trading day', () => {
  const carried = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    priorSnapshotDate: '2026-07-07',
    priorCumulativeReturnPct: 0.25,
    stockTrades: [],
    historicalClosesBySymbol: {},
  });
  assert.equal(carried.dailyReturnPct, 0);
  assert.equal(carried.cumulativeReturnPct, 0.25);
  assert.match(carried.ledgerHash, /^[a-f0-9]{64}$/);

  expectCode('zero_denominator', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [],
    historicalClosesBySymbol: {},
  }));
});

test('split-style close rows use adjusted close for valuation while retaining raw high-low data', () => {
  const result = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy()],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-07', close: 100, adjusted_close: 50, high: 102, low: 98 },
        { date: TARGET_DATE, close: 110, adjustedClose: 55, high: 116, low: 105 },
      ],
    },
  });
  assert.ok(Math.abs(result.dailyReturnPct - 0.1) < 1e-12);

  const targetTrade = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({
      date: TARGET_DATE,
      price: 110,
      createdAt: '2026-07-08T19:00:00Z',
    })],
    historicalClosesBySymbol: {
      NVDA: [{
        date: TARGET_DATE,
        close: 110,
        adjusted_close: 55,
        high: 116,
        low: 105,
      }],
    },
  });
  assert.ok(Math.abs(targetTrade.dailyReturnPct + 0.5) < 1e-12);
});

test('snapshot rejects oversells and missing completed closes', () => {
  expectCode('oversell', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy(), sell({ shares: 11 })],
    historicalClosesBySymbol: CLOSES,
  }));
  expectCode('missing_close', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy()],
    historicalClosesBySymbol: { NVDA: [{ date: TARGET_DATE, close: 110, high: 116, low: 105 }] },
  }));
});

test('snapshot rejects non-USD ledger rows instead of mixing currencies', () => {
  expectCode('unsupported_currency', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [{ ...buy(), currency: 'CNY' }],
    historicalClosesBySymbol: CLOSES,
  }));
});

test('target-date records require a same-day pre-close write and an exact positive close', () => {
  expectCode('late_trade', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({ date: TARGET_DATE, price: 110, createdAt: '2026-07-08T20:00:01Z' })],
    historicalClosesBySymbol: CLOSES,
  }));
  expectCode('late_trade', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({ date: TARGET_DATE, price: 110, createdAt: '2026-07-07T19:00:00Z' })],
    historicalClosesBySymbol: CLOSES,
  }));
  expectCode('missing_close', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({ date: TARGET_DATE, price: 110, createdAt: '2026-07-08T19:00:00Z' })],
    historicalClosesBySymbol: { NVDA: [{ date: '2026-07-07', close: 100 }] },
  }));

  const outsideRawRange = buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({ date: TARGET_DATE, price: 120, createdAt: '2026-07-08T19:00:00Z' })],
    historicalClosesBySymbol: CLOSES,
  });
  assert.ok(Math.abs(outsideRawRange.dailyReturnPct - ((110 - 120) / 120)) < 1e-12);
});

test('ledger hash is canonical and changes when locked economic history changes', () => {
  const trades = [buy(), sell()];
  const first = computeCompetitionLedgerHash(trades, TARGET_DATE);
  const reordered = computeCompetitionLedgerHash([...trades].reverse(), TARGET_DATE);
  const changed = computeCompetitionLedgerHash([buy({ price: 91 }), sell()], TARGET_DATE);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test('public holding symbols reflect the locked close date without exposing quantities', () => {
  const rows = [
    buy({ id: 'nvda-buy', shares: 10 }),
    { ...buy({ id: 'msft-buy', shares: 5 }), symbol: 'MSFT' },
    sell({ id: 'nvda-sell', shares: 10, price: 110 }),
    { ...buy({ id: 'future-aapl', date: '2026-07-09', shares: 2 }), symbol: 'AAPL', created_at: '2026-07-09T14:00:00Z' },
  ];
  assert.deepEqual(deriveCompetitionHoldingSymbols(rows, TARGET_DATE), ['MSFT']);
  const ledgerHash = computeCompetitionLedgerHash(rows, TARGET_DATE);
  assert.deepEqual(deriveVerifiedCompetitionHoldingSymbols({
    stockTrades: rows,
    throughDate: TARGET_DATE,
    expectedLedgerHash: ledgerHash,
  }), ['MSFT']);
  assert.equal(deriveVerifiedCompetitionHoldingSymbols({
    stockTrades: rows,
    throughDate: TARGET_DATE,
    expectedLedgerHash: '0'.repeat(64),
  }), null);
  expectCode('unsupported_currency', () => deriveCompetitionHoldingSymbols([
    { ...buy(), currency: 'CNY' },
  ], TARGET_DATE));
});

test('historical correction rebuilds every SPY close by trade_date without a write-time cutoff', () => {
  const rows = buildCompetitionRecalculatedSnapshotSeries({
    rankingStartSnapshotDate: '2026-07-07',
    rankingBaselineReturnPct: 0,
    tradingDates: ['2026-07-07', '2026-07-08', '2026-07-09'],
    stockTrades: [
      buy({
        date: '2026-07-07',
        price: 100,
        shares: 10,
        createdAt: '2026-08-01T10:00:00Z',
      }),
      sell({
        price: 115,
        shares: 2,
        createdAt: '2026-08-01T10:01:00Z',
      }),
    ],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-06', close: 100 },
        { date: '2026-07-07', close: 100 },
        { date: '2026-07-08', close: 110 },
        { date: '2026-07-09', close: 121 },
      ],
    },
  });

  assert.deepEqual(rows.map((row) => row.snapshotDate), [
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
  ]);
  assert.equal(rows[0].dailyReturnPct, 0);
  assert.ok(Math.abs(rows[1].dailyReturnPct - 0.11) < 1e-12);
  assert.ok(Math.abs(rows[2].dailyReturnPct - 0.1) < 1e-12);
  assert.ok(Math.abs(rows[2].cumulativeReturnPct - 0.221) < 1e-12);
});

test('historical correction emits zero-return snapshots for an empty ranked ledger', () => {
  const rows = buildCompetitionRecalculatedSnapshotSeries({
    rankingStartSnapshotDate: '2026-07-07',
    rankingBaselineReturnPct: 0,
    tradingDates: ['2026-07-07', '2026-07-08'],
    stockTrades: [],
    historicalClosesBySymbol: {},
  });
  assert.deepEqual(rows.map((row) => row.dailyReturnPct), [0, 0]);
  assert.deepEqual(rows.map((row) => row.cumulativeReturnPct), [0, 0]);
});

test('historical correction maps a weekend trade after eligibility into the first SPY close cash flow', () => {
  const rows = buildCompetitionRecalculatedSnapshotSeries({
    initialPriorSnapshotDate: '2026-07-02',
    rankingStartSnapshotDate: '2026-07-06',
    rankingBaselineReturnPct: 0,
    tradingDates: ['2026-07-06'],
    stockTrades: [buy({
      date: '2026-07-04',
      price: 80,
      shares: 10,
      createdAt: '2026-08-01T10:00:00Z',
    })],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-02', close: 100 },
        { date: '2026-07-06', close: 110 },
      ],
    },
  });
  assert.equal(rows.length, 1);
  assert.ok(Math.abs(rows[0].dailyReturnPct - 0.375) < 1e-12);
});

test('historical correction starts a later first buy without an eligibility close, then restores strict daily continuity', () => {
  const input = {
    initialPriorSnapshotDate: '2026-07-01',
    rankingStartSnapshotDate: '2026-07-08',
    rankingBaselineReturnPct: 0,
    tradingDates: ['2026-07-08', '2026-07-09'],
    stockTrades: [buy({
      date: '2026-07-08',
      price: 100,
      shares: 10,
      createdAt: '2026-07-08T15:00:00Z',
    })],
  };
  const rows = buildCompetitionRecalculatedSnapshotSeries({
    ...input,
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-08', close: 110 },
        { date: '2026-07-09', close: 121 },
      ],
    },
  });
  assert.deepEqual(rows.map((row) => row.snapshotDate), ['2026-07-08', '2026-07-09']);
  assert.ok(Math.abs(rows[0].dailyReturnPct - 0.1) < 1e-12);
  assert.ok(Math.abs(rows[1].dailyReturnPct - 0.1) < 1e-12);
  assert.ok(Math.abs(rows[1].cumulativeReturnPct - 0.21) < 1e-12);

  expectCode('snapshot_gap', () => buildCompetitionRecalculatedSnapshotSeries({
    ...input,
    tradingDates: ['2026-07-08', '2026-07-10'],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-08', close: 110 },
        { date: '2026-07-09', close: 121 },
        { date: '2026-07-10', close: 122 },
      ],
    },
  }));
});

test('historical correction keeps structural ledger and exact-close validation', () => {
  expectCode('oversell', () => buildCompetitionRecalculatedSnapshotSeries({
    rankingStartSnapshotDate: '2026-07-07',
    tradingDates: ['2026-07-07', '2026-07-08'],
    stockTrades: [sell({ shares: 1 })],
    historicalClosesBySymbol: CLOSES,
  }));
  const gapRows = buildCompetitionRecalculatedSnapshotSeries({
    rankingStartSnapshotDate: '2026-07-07',
    tradingDates: ['2026-07-07', '2026-07-09'],
    stockTrades: [buy({ date: '2026-07-08', price: 100 })],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-07', close: 100 },
        { date: '2026-07-09', close: 110 },
      ],
    },
  });
  assert.equal(gapRows[0].dailyReturnPct, 0);
  assert.ok(Math.abs(gapRows[1].dailyReturnPct - 0.1) < 1e-12);
  expectCode('missing_close', () => buildCompetitionRecalculatedSnapshotSeries({
    rankingStartSnapshotDate: '2026-07-07',
    tradingDates: ['2026-07-07', '2026-07-08'],
    stockTrades: [buy({ date: '2026-07-07' })],
    historicalClosesBySymbol: {
      NVDA: [{ date: '2026-07-07', close: 100 }],
    },
  }));
});

test('rebuild symbols exclude pre-eligibility round trips but retain interval round trips', () => {
  assert.deepEqual(deriveCompetitionLedgerSymbols([
    buy({ id: 'old-nvda-buy', date: '2026-07-01' }),
    {
      ...sell({ id: 'old-nvda-sell', shares: 10, price: 100, createdAt: '2026-07-02T14:00:00Z' }),
      trade_date: '2026-07-02',
    },
    { ...buy({ id: 'msft-buy', date: '2026-07-03' }), symbol: 'MSFT' },
    { ...buy({ id: 'aapl-buy', date: '2026-07-07' }), symbol: 'AAPL' },
    { ...sell({ id: 'aapl-sell', shares: 10 }), symbol: 'AAPL' },
  ], TARGET_DATE, '2026-07-06'), ['AAPL', 'MSFT']);
});

test('rebuild freshness follows the last close each symbol actually needs', () => {
  const rows = [
    buy({ id: 'nvda-buy', date: '2026-07-03', price: 80 }),
    {
      ...sell({ id: 'nvda-sell', shares: 10, price: 100, createdAt: '2026-07-07T14:00:00Z' }),
      trade_date: '2026-07-07',
    },
    { ...buy({ id: 'msft-buy', date: '2026-07-07' }), symbol: 'MSFT' },
  ];
  assert.deepEqual(deriveCompetitionRequiredCloseDates({
    stockTrades: rows,
    eligibilityDate: '2026-07-02',
    throughDate: '2026-07-08',
    tradingDates: ['2026-07-06', '2026-07-07', '2026-07-08'],
  }), {
    MSFT: '2026-07-08',
    NVDA: '2026-07-07',
  });
});
