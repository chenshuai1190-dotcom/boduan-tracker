import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAccountSnapshotMutations, buildAccountSnapshotMutations } from '../src/lib/accountSnapshotMutation.js';

test('zero and blank delete an existing personal monthly snapshot', () => {
  const result = buildAccountSnapshotMutations({
    month: '2026-07',
    draft: { bank: '0', broker: '' },
    snapshots: [
      { accountId: 'bank', month: '2026-07', balance: 80_001 },
      { accountId: 'broker', month: '2026-07', balance: 490_000 },
    ],
  });

  assert.deepEqual(result, {
    upserts: [],
    deletions: [
      { accountId: 'bank', month: '2026-07' },
      { accountId: 'broker', month: '2026-07' },
    ],
    invalid: [],
  });
});

test('zero and blank always produce an idempotent delete intent even when local cache has no row', () => {
  const result = buildAccountSnapshotMutations({
    month: '2026-07',
    draft: { bank: 0, broker: '' },
    snapshots: [],
  });

  assert.deepEqual(result, {
    upserts: [],
    deletions: [
      { accountId: 'bank', month: '2026-07' },
      { accountId: 'broker', month: '2026-07' },
    ],
    invalid: [],
  });
});

test('positive balances upsert while unchanged and invalid values stay isolated', () => {
  const result = buildAccountSnapshotMutations({
    month: '2026-07',
    draft: { bank: '80001', broker: '490000', cash: '-1', card: 'bad' },
    snapshots: [
      { accountId: 'bank', month: '2026-07', balance: 80_001 },
      { accountId: 'broker', month: '2026-07', balance: 480_000 },
    ],
  });

  assert.deepEqual(result.upserts, [{ accountId: 'broker', month: '2026-07', balance: 490_000 }]);
  assert.deepEqual(result.deletions, []);
  assert.deepEqual(result.invalid, [
    { accountId: 'cash', month: '2026-07', value: '-1' },
    { accountId: 'card', month: '2026-07', value: 'bad' },
  ]);
});

test('applying snapshot mutations removes deleted rows and replaces duplicate cached upserts', () => {
  const result = applyAccountSnapshotMutations([
    { id: 'bank-old', accountId: 'bank', month: '2026-07', balance: 80_001 },
    { id: 'broker-old-a', accountId: 'broker', month: '2026-07', balance: 480_000 },
    { id: 'broker-old-b', accountId: 'broker', month: '2026-07', balance: 470_000 },
    { id: 'other-month', accountId: 'bank', month: '2026-06', balance: 90_000 },
  ], {
    deletions: [{ accountId: 'bank', month: '2026-07' }],
    upserts: [{ accountId: 'broker', month: '2026-07', balance: 490_000 }],
  });

  assert.deepEqual(result, [
    { id: 'other-month', accountId: 'bank', month: '2026-06', balance: 90_000 },
    { id: 'broker-old-a', accountId: 'broker', month: '2026-07', balance: 490_000 },
  ]);
});

test('an invalid month never produces a persistence mutation', () => {
  const result = buildAccountSnapshotMutations({
    month: '2026-13',
    draft: { bank: '0' },
    snapshots: [{ accountId: 'bank', month: '2026-07', balance: 80_001 }],
  });

  assert.deepEqual(result.upserts, []);
  assert.deepEqual(result.deletions, []);
  assert.deepEqual(result.invalid, [{ accountId: 'bank', month: '2026-13', value: '0' }]);
});
