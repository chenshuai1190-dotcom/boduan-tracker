import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompetitionCashFlowSnapshot,
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
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

test('target-date records must be created before New York close and inside daily high-low', () => {
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
  expectCode('price_out_of_range', () => buildCompetitionCashFlowSnapshot({
    targetDate: TARGET_DATE,
    stockTrades: [buy({ date: TARGET_DATE, price: 120, createdAt: '2026-07-08T19:00:00Z' })],
    historicalClosesBySymbol: CLOSES,
  }));
});

test('ledger hash is canonical and changes when locked economic history changes', () => {
  const trades = [buy(), sell()];
  const first = computeCompetitionLedgerHash(trades, TARGET_DATE);
  const reordered = computeCompetitionLedgerHash([...trades].reverse(), TARGET_DATE);
  const changed = computeCompetitionLedgerHash([buy({ price: 91 }), sell()], TARGET_DATE);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});
