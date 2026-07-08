import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildPnlReportCloseSnapshotInput,
  buildPnlReportHistoricalSnapshots,
  buildPnlReportSnapshots,
  latestCompletedUsTradingDate,
  normalizeReportDate,
  PNL_REPORT_SNAPSHOT_VERSION,
} from '../src/lib/pnlReportSnapshots.js';

test('builds independent portfolio and symbol snapshots from stock trades', () => {
  const { portfolioSnapshot, symbolSnapshots } = buildPnlReportSnapshots({
    snapshotDate: '2026-01-04',
    cashUsd: 50,
    stockTrades: [
      { id: '1', symbol: 'AAPL', name: 'Apple', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: '2', symbol: 'AAPL', name: 'Apple', side: 'buy', date: '2026-01-02', price: 110, shares: 10 },
      { id: '3', symbol: 'AAPL', name: 'Apple', side: 'sell', date: '2026-01-03', price: 130, shares: 5 },
    ],
    quoteRows: [
      { symbol: 'AAPL', name: 'Apple', price: 120, previousClose: 118 },
    ],
  });

  assert.equal(symbolSnapshots.length, 1);
  assert.equal(symbolSnapshots[0].sourceVersion, PNL_REPORT_SNAPSHOT_VERSION);
  assert.equal(symbolSnapshots[0].heldShares, 15);
  assert.equal(symbolSnapshots[0].avgCostUsd, 105);
  assert.equal(symbolSnapshots[0].remainingCostUsd, 1575);
  assert.equal(symbolSnapshots[0].marketValueUsd, 1800);
  assert.equal(symbolSnapshots[0].realizedPnlUsd, 125);
  assert.equal(symbolSnapshots[0].unrealizedPnlUsd, 225);
  assert.equal(symbolSnapshots[0].cumulativePnlUsd, 350);
  assert.equal(symbolSnapshots[0].dailyPnlUsd, 30);
  assert.equal(portfolioSnapshot.marketValueUsd, 1800);
  assert.equal(portfolioSnapshot.totalAssetsUsd, 1850);
  assert.equal(portfolioSnapshot.realizedPnlUsd, 125);
  assert.equal(portfolioSnapshot.unrealizedPnlUsd, 225);
  assert.equal(portfolioSnapshot.cumulativePnlUsd, 350);
  assert.equal(portfolioSnapshot.dailyPnlUsd, 30);
  assert.equal(portfolioSnapshot.totalBuyCostUsd, 2100);
  assert.equal(portfolioSnapshot.sellProceedsUsd, 650);
  assert.equal(portfolioSnapshot.tradeCount, 3);
  assert.equal(portfolioSnapshot.holdingCount, 1);
});

test('keeps sold-out symbols in report history after a full sell', () => {
  const { portfolioSnapshot, symbolSnapshots } = buildPnlReportSnapshots({
    snapshotDate: '2026-01-04',
    stockTrades: [
      { id: '1', symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: '2', symbol: 'MSFT', name: 'Microsoft', side: 'sell', date: '2026-01-03', price: 130, shares: 10 },
    ],
    quoteRows: [
      { symbol: 'MSFT', name: 'Microsoft', price: 120, previousClose: 118 },
    ],
  });

  assert.equal(symbolSnapshots.length, 1);
  assert.equal(symbolSnapshots[0].symbol, 'MSFT');
  assert.equal(symbolSnapshots[0].isOpen, false);
  assert.equal(symbolSnapshots[0].heldShares, 0);
  assert.equal(symbolSnapshots[0].marketValueUsd, 0);
  assert.equal(symbolSnapshots[0].realizedPnlUsd, 300);
  assert.equal(symbolSnapshots[0].unrealizedPnlUsd, 0);
  assert.equal(symbolSnapshots[0].cumulativePnlUsd, 300);
  assert.equal(portfolioSnapshot.holdingCount, 0);
  assert.equal(portfolioSnapshot.marketValueUsd, 0);
  assert.equal(portfolioSnapshot.realizedPnlUsd, 300);
  assert.equal(portfolioSnapshot.cumulativePnlUsd, 300);
});

test('builds historical snapshots by excluding trades after the snapshot date', () => {
  const { portfolioSnapshot, symbolSnapshots } = buildPnlReportSnapshots({
    snapshotDate: '2026-01-02',
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: '2', symbol: 'NVDA', name: 'NVIDIA', side: 'sell', date: '2026-01-03', price: 130, shares: 10 },
    ],
    quoteRows: [
      { symbol: 'NVDA', name: 'NVIDIA', price: 120, previousClose: 118 },
    ],
  });

  assert.equal(symbolSnapshots[0].isOpen, true);
  assert.equal(symbolSnapshots[0].heldShares, 10);
  assert.equal(symbolSnapshots[0].realizedPnlUsd, 0);
  assert.equal(symbolSnapshots[0].unrealizedPnlUsd, 200);
  assert.equal(portfolioSnapshot.tradeCount, 1);
  assert.equal(portfolioSnapshot.cumulativePnlUsd, 200);
});

test('does not force daily pnl when an active symbol has no valid daily baseline', () => {
  const { portfolioSnapshot, symbolSnapshots } = buildPnlReportSnapshots({
    snapshotDate: '2026-01-04',
    stockTrades: [
      { id: '1', symbol: 'TSM', name: 'TSMC', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    ],
    quoteRows: [
      { symbol: 'TSM', name: 'TSMC', price: 120 },
    ],
  });

  assert.equal(symbolSnapshots[0].dailyPnlUsd, null);
  assert.equal(symbolSnapshots[0].dailyPnlPct, null);
  assert.equal(portfolioSnapshot.dailyPnlUsd, null);
  assert.equal(portfolioSnapshot.dailyPnlPct, null);
});

test('projects premarket report snapshots to the previous completed close', () => {
  const input = buildPnlReportCloseSnapshotInput({
    now: new Date('2026-07-08T10:00:00Z'),
    quoteRows: [
      {
        symbol: 'NVDA',
        name: 'NVIDIA',
        price: 194.02,
        previousClose: 195.55,
        change: -1.53,
        changePercent: -0.78,
        dailyPnlPrice: 194.02,
        dailyPnlBaselineClose: 195.55,
        dailyPnlBaselineDate: '2026-07-07',
        dailyPnlLocked: false,
      },
    ],
  });

  assert.equal(input.snapshotDate, '2026-07-07');
  assert.equal(input.quoteRows[0].price, 195.55);

  const { portfolioSnapshot, symbolSnapshots } = buildPnlReportSnapshots({
    snapshotDate: input.snapshotDate,
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-07-01', price: 190, shares: 10 },
    ],
    quoteRows: input.quoteRows,
  });

  assert.equal(portfolioSnapshot.snapshotDate, '2026-07-07');
  assert.equal(symbolSnapshots[0].currentPriceUsd, 195.55);
  assert.equal(symbolSnapshots[0].marketValueUsd, 1955.5);
  assert.equal(symbolSnapshots[0].dailyPnlUsd, null);
});

test('uses locked regular close when the quote row has a completed close date', () => {
  const input = buildPnlReportCloseSnapshotInput({
    now: new Date('2026-07-08T22:00:00Z'),
    quoteRows: [
      {
        symbol: 'MSFT',
        name: 'Microsoft',
        price: 391.2,
        dailyPnlLocked: true,
        dailyPnlPrice: 386.74,
        dailyPnlPriceDate: '2026-07-08',
        dailyPnlBaselineClose: 385.1,
        dailyPnlBaselineDate: '2026-07-07',
      },
    ],
  });

  const { symbolSnapshots } = buildPnlReportSnapshots({
    snapshotDate: input.snapshotDate,
    stockTrades: [
      { id: '1', symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-07-01', price: 380, shares: 10 },
    ],
    quoteRows: input.quoteRows,
  });

  assert.equal(input.snapshotDate, '2026-07-08');
  assert.equal(symbolSnapshots[0].currentPriceUsd, 386.74);
  assert.equal(Number(symbolSnapshots[0].dailyPnlUsd.toFixed(2)), 16.4);
});

test('builds recent historical close snapshots with real daily pnl values', () => {
  const result = buildPnlReportHistoricalSnapshots({
    maxSnapshots: 3,
    toDate: '2026-07-08',
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-07-01', price: 190, shares: 10 },
      { id: '2', symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-07-01', price: 380, shares: 5 },
    ],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-03', close: 191 },
        { date: '2026-07-06', close: 195 },
        { date: '2026-07-07', close: 196 },
        { date: '2026-07-08', close: 194 },
      ],
      MSFT: [
        { date: '2026-07-03', close: 382 },
        { date: '2026-07-06', close: 386 },
        { date: '2026-07-07', close: 385 },
        { date: '2026-07-08', close: 390 },
      ],
    },
    lockedAt: '2026-07-08T22:00:00.000Z',
  });

  assert.equal(result.snapshots.length, 3);
  assert.deepEqual(result.snapshots.map((snapshot) => snapshot.portfolioSnapshot.snapshotDate), [
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
  ]);
  assert.equal(result.snapshots[0].portfolioSnapshot.dailyPnlUsd, 60);
  assert.equal(result.snapshots[1].portfolioSnapshot.dailyPnlUsd, 5);
  assert.equal(result.snapshots[2].portfolioSnapshot.dailyPnlUsd, 5);
  assert.equal(result.snapshots[2].symbolSnapshots.find((row) => row.symbol === 'NVDA').dailyPnlUsd, -20);
  assert.equal(result.snapshots[2].symbolSnapshots.find((row) => row.symbol === 'MSFT').dailyPnlUsd, 25);
});

test('strict ledger historical backfill starts from the actual trade entry date', () => {
  const result = buildPnlReportHistoricalSnapshots({
    maxSnapshots: 4,
    toDate: '2026-07-07',
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-07-06', price: 180, shares: 10 },
    ],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-01', close: 190 },
        { date: '2026-07-02', close: 192 },
        { date: '2026-07-06', close: 195 },
        { date: '2026-07-07', close: 196 },
      ],
    },
    lockedAt: '2026-07-08T10:00:00.000Z',
  });

  assert.deepEqual(result.snapshots.map((snapshot) => snapshot.portfolioSnapshot.snapshotDate), [
    '2026-07-01',
    '2026-07-02',
    '2026-07-06',
    '2026-07-07',
  ]);
  assert.equal(result.snapshots[0].portfolioSnapshot.holdingCount, 0);
  assert.equal(result.snapshots[1].portfolioSnapshot.holdingCount, 0);
  assert.equal(result.snapshots[2].portfolioSnapshot.holdingCount, 1);
});

test('current-position historical backfill carries manually synced positions across the window', () => {
  const result = buildPnlReportHistoricalSnapshots({
    maxSnapshots: 5,
    toDate: '2026-07-07',
    backfillMode: 'currentPositions',
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-07-06', price: 180, shares: 10 },
    ],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-06-30', close: 188 },
        { date: '2026-07-01', close: 190 },
        { date: '2026-07-02', close: 192 },
        { date: '2026-07-06', close: 195 },
        { date: '2026-07-07', close: 196 },
      ],
    },
    lockedAt: '2026-07-08T10:00:00.000Z',
  });

  assert.deepEqual(result.snapshots.map((snapshot) => snapshot.portfolioSnapshot.snapshotDate), [
    '2026-06-30',
    '2026-07-01',
    '2026-07-02',
    '2026-07-06',
    '2026-07-07',
  ]);
  assert.equal(result.snapshots.every((snapshot) => snapshot.portfolioSnapshot.holdingCount === 1), true);
  assert.equal(result.snapshots[1].portfolioSnapshot.dailyPnlUsd, 20);
  assert.equal(result.snapshots[2].portfolioSnapshot.dailyPnlUsd, 20);
  assert.equal(result.snapshots[4].portfolioSnapshot.dailyPnlUsd, 10);
});

test('current-position historical backfill preserves sold-out symbols with realized pnl', () => {
  const result = buildPnlReportHistoricalSnapshots({
    maxSnapshots: 5,
    toDate: '2026-07-08',
    backfillMode: 'currentPositions',
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-07-06', price: 180, shares: 10, created_at: '2026-07-06T13:00:00Z' },
      { id: '2', symbol: 'NVDA', name: 'NVIDIA', side: 'sell', date: '2026-07-08', price: 200, shares: 10, created_at: '2026-07-08T13:00:00Z' },
    ],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-02', close: 176 },
        { date: '2026-07-06', close: 190 },
        { date: '2026-07-07', close: 196 },
        { date: '2026-07-08', close: 198 },
      ],
    },
    lockedAt: '2026-07-08T22:00:00.000Z',
  });

  const finalSnapshot = result.snapshots.at(-1);

  assert.equal(result.snapshots.length, 4);
  assert.equal(finalSnapshot.portfolioSnapshot.snapshotDate, '2026-07-08');
  assert.equal(finalSnapshot.portfolioSnapshot.holdingCount, 0);
  assert.equal(finalSnapshot.portfolioSnapshot.realizedPnlUsd, 200);
  assert.equal(finalSnapshot.portfolioSnapshot.cumulativePnlUsd, 200);
  assert.equal(finalSnapshot.portfolioSnapshot.tradeCount, 2);
  assert.equal(finalSnapshot.symbolSnapshots.length, 1);
  assert.equal(finalSnapshot.symbolSnapshots[0].symbol, 'NVDA');
  assert.equal(finalSnapshot.symbolSnapshots[0].isOpen, false);
  assert.equal(finalSnapshot.symbolSnapshots[0].realizedPnlUsd, 200);
});

test('current-position historical backfill mixes pure open positions with ledger-sold symbols', () => {
  const result = buildPnlReportHistoricalSnapshots({
    maxSnapshots: 4,
    toDate: '2026-07-08',
    backfillMode: 'currentPositions',
    stockTrades: [
      { id: '1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-07-06', price: 180, shares: 10, created_at: '2026-07-06T13:00:00Z' },
      { id: '2', symbol: 'NVDA', name: 'NVIDIA', side: 'sell', date: '2026-07-08', price: 200, shares: 10, created_at: '2026-07-08T13:00:00Z' },
      { id: '3', symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-07-06', price: 380, shares: 5, created_at: '2026-07-06T14:00:00Z' },
    ],
    historicalClosesBySymbol: {
      NVDA: [
        { date: '2026-07-02', close: 176 },
        { date: '2026-07-06', close: 190 },
        { date: '2026-07-07', close: 196 },
        { date: '2026-07-08', close: 198 },
      ],
      MSFT: [
        { date: '2026-07-02', close: 375 },
        { date: '2026-07-06', close: 382 },
        { date: '2026-07-07', close: 385 },
        { date: '2026-07-08', close: 390 },
      ],
    },
    lockedAt: '2026-07-08T22:00:00.000Z',
  });

  const firstSnapshot = result.snapshots[0];
  const finalSnapshot = result.snapshots.at(-1);

  assert.equal(firstSnapshot.portfolioSnapshot.snapshotDate, '2026-07-02');
  assert.equal(firstSnapshot.symbolSnapshots.some((row) => row.symbol === 'MSFT' && row.isOpen), true);
  assert.equal(firstSnapshot.symbolSnapshots.some((row) => row.symbol === 'NVDA'), false);
  assert.equal(finalSnapshot.portfolioSnapshot.realizedPnlUsd, 200);
  assert.equal(finalSnapshot.portfolioSnapshot.holdingCount, 1);
  assert.equal(finalSnapshot.symbolSnapshots.find((row) => row.symbol === 'NVDA').isOpen, false);
  assert.equal(finalSnapshot.symbolSnapshots.find((row) => row.symbol === 'MSFT').isOpen, true);
});

test('normalizes report dates and stays separate from the live trading summary pipeline', () => {
  assert.equal(normalizeReportDate('2026-07-08'), '2026-07-08');
  assert.equal(latestCompletedUsTradingDate(new Date('2026-07-08T10:00:00Z')), '2026-07-07');
  const source = readFileSync(new URL('../src/lib/pnlReportSnapshots.js', import.meta.url), 'utf8');
  assert.equal(source.includes('deriveInvestmentSummary'), false);
  assert.equal(source.includes('derivePositionsFromTrades'), false);
});
