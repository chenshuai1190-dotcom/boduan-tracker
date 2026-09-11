import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  HOME_MARGIN_LOGIC_VERSION,
  homeMarginLogicUpdatedAt,
  isLegacyHomeMarginStatus,
  normalizeMarginDebtUsd,
} from '../src/lib/homeMarginRisk.js';

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const migrationStart = dbSource.indexOf('const emptyHomeMarginStatus = () => ({');
const migrationEnd = dbSource.indexOf('export const upsertMarginStatus = async (status) => {', migrationStart);

assert.ok(migrationStart >= 0, 'margin status migration helpers must remain in db.js');
assert.ok(migrationEnd > migrationStart, 'margin status loader must remain before its upsert function');

const migrationSource = dbSource
  .slice(migrationStart, migrationEnd)
  .replace('export const fetchMarginStatus = async (preUser = null) => {', 'const fetchMarginStatus = async (preUser = null) => {');

const extractedModule = await import(
  `data:text/javascript;base64,${Buffer.from(`
    export function createMarginStatusLoader(dependencies) {
      const {
        supabase,
        cacheGet,
        cacheSet,
        HOME_MARGIN_LOGIC_VERSION,
        homeMarginLogicUpdatedAt,
        isLegacyHomeMarginStatus,
        normalizeMarginDebtUsd,
      } = dependencies;
      ${migrationSource}
      return { fetchMarginStatus };
    }
  `).toString('base64')}`
);

function createSupabaseHarness({ rows, beforeUpdate = null } = {}) {
  const state = {
    rows: (rows || []).map((row) => ({ ...row })),
    operations: [],
    updateAttempts: 0,
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.action = null;
      this.payload = null;
      this.filters = [];
      this.returning = false;
      this.operation = { table, action: null, filters: [] };
      state.operations.push(this.operation);
    }

    select(columns) {
      if (!this.action) this.action = 'select';
      else this.returning = true;
      this.operation.action = this.action;
      this.operation.select = columns;
      return this;
    }

    update(payload) {
      this.action = 'update';
      this.payload = payload;
      this.operation.action = 'update';
      this.operation.payload = { ...payload };
      return this;
    }

    eq(field, value) {
      this.filters.push((row) => row[field] === value);
      this.operation.filters.push(['eq', field, value]);
      return this;
    }

    is(field, value) {
      this.filters.push((row) => (value == null ? row[field] == null : row[field] === value));
      this.operation.filters.push(['is', field, value]);
      return this;
    }

    matches(row) {
      return this.filters.every((filter) => filter(row));
    }

    async maybeSingle() {
      let selected;
      if (this.action === 'update') {
        state.updateAttempts += 1;
        beforeUpdate?.({
          state,
          attempt: state.updateAttempts,
          payload: { ...this.payload },
        });
        selected = state.rows.filter((row) => this.matches(row));
        for (const row of selected) Object.assign(row, this.payload);
        if (!this.returning) selected = [];
      } else {
        selected = state.rows.filter((row) => this.matches(row));
      }

      if (selected.length > 1) {
        return { data: null, error: new Error('at most one row expected') };
      }
      return { data: selected[0] ? { ...selected[0] } : null, error: null };
    }
  }

  return {
    state,
    client: {
      auth: {
        async getUser() {
          return { data: { user: { id: 'user-a' } } };
        },
      },
      from(table) {
        assert.equal(table, 'margin_status');
        return new Query(table);
      },
    },
  };
}

function createLoader(client, { cacheGet = () => null, cacheSet = () => {} } = {}) {
  return extractedModule.createMarginStatusLoader({
    supabase: client,
    cacheGet,
    cacheSet,
    HOME_MARGIN_LOGIC_VERSION,
    homeMarginLogicUpdatedAt,
    isLegacyHomeMarginStatus,
    normalizeMarginDebtUsd,
  }).fetchMarginStatus;
}

function legacyRow(overrides = {}) {
  return {
    user_id: 'user-a',
    current_margin: 3_000_000,
    margin_limit: 1_000_000,
    updated_at: '2026-07-21T20:35:50.000Z',
    ...overrides,
  };
}

function currentRow(overrides = {}) {
  return legacyRow({
    current_margin: 500_000,
    margin_limit: 0,
    updated_at: '2026-07-21T20:36:30.000Z',
    ...overrides,
  });
}

test('legacy margin status is cleared when the conditional update matches', async () => {
  const cachedWrites = [];
  const { client, state } = createSupabaseHarness({
    rows: [legacyRow(), legacyRow({ user_id: 'user-b', current_margin: 9_000_000 })],
  });
  const fetchMarginStatus = createLoader(client, {
    cacheSet: (...args) => cachedWrites.push(args),
  });

  const result = await fetchMarginStatus({ id: 'user-a' });

  assert.deepEqual(result, {
    currentMargin: 0,
    marginLimit: 0,
    logicVersion: HOME_MARGIN_LOGIC_VERSION,
    updatedAt: homeMarginLogicUpdatedAt(0),
  });
  assert.equal(state.updateAttempts, 1);
  assert.equal(state.rows.find((row) => row.user_id === 'user-a').current_margin, 0);
  assert.equal(state.rows.find((row) => row.user_id === 'user-b').current_margin, 9_000_000);
  assert.deepEqual(cachedWrites, [['user-a', 'margin_status', result]]);
});

test('a concurrent new-model save wins when the legacy conditional update matches zero rows', async () => {
  const { client, state } = createSupabaseHarness({
    rows: [legacyRow()],
    beforeUpdate({ state: mutableState, attempt }) {
      if (attempt !== 1) return;
      Object.assign(mutableState.rows[0], currentRow({ current_margin: 750_000 }));
    },
  });
  const fetchMarginStatus = createLoader(client);

  const result = await fetchMarginStatus({ id: 'user-a' });

  assert.equal(state.updateAttempts, 1);
  assert.equal(result.currentMargin, 750_000);
  assert.equal(result.updatedAt, '2026-07-21T20:36:30.000Z');
  assert.equal(state.rows[0].current_margin, 750_000);
});

test('a zero-row conflict that still rereads legacy data retries once and clears it', async () => {
  const { client, state } = createSupabaseHarness({
    rows: [legacyRow()],
    beforeUpdate({ state: mutableState, attempt }) {
      if (attempt !== 1) return;
      Object.assign(mutableState.rows[0], legacyRow({
        current_margin: 2_000_000,
        updated_at: '2026-07-21T20:35:51.000Z',
      }));
    },
  });
  const fetchMarginStatus = createLoader(client);

  const result = await fetchMarginStatus({ id: 'user-a' });

  assert.equal(state.updateAttempts, 2);
  assert.equal(result.currentMargin, 0);
  assert.equal(state.rows[0].current_margin, 0);
  assert.equal(state.rows[0].updated_at, homeMarginLogicUpdatedAt(0));
});

test('a second legacy CAS conflict fails closed without caching or clearing the raced value', async () => {
  const cachedWrites = [];
  const { client, state } = createSupabaseHarness({
    rows: [legacyRow()],
    beforeUpdate({ state: mutableState, attempt }) {
      Object.assign(mutableState.rows[0], legacyRow({
        current_margin: 3_000_000 - attempt,
        updated_at: `2026-07-21T20:35:5${attempt}.000Z`,
      }));
    },
  });
  const fetchMarginStatus = createLoader(client, {
    cacheSet: (...args) => cachedWrites.push(args),
  });

  await assert.rejects(
    fetchMarginStatus({ id: 'user-a' }),
    /旧融资余额清零冲突，请刷新后重试/,
  );

  assert.equal(state.updateAttempts, 2);
  assert.equal(state.rows[0].current_margin, 2_999_998);
  assert.deepEqual(cachedWrites, []);
});

test('a legacy row with null updated_at uses an is-null CAS filter', async () => {
  const { client, state } = createSupabaseHarness({
    rows: [legacyRow({ updated_at: null })],
  });
  const fetchMarginStatus = createLoader(client);

  const result = await fetchMarginStatus({ id: 'user-a' });

  assert.equal(result.currentMargin, 0);
  const updateOperation = state.operations.find((operation) => operation.action === 'update');
  assert.deepEqual(updateOperation.filters, [
    ['eq', 'user_id', 'user-a'],
    ['is', 'updated_at', null],
  ]);
});

test('a current-model margin status is returned without any clearing update', async () => {
  const { client, state } = createSupabaseHarness({ rows: [currentRow()] });
  const fetchMarginStatus = createLoader(client);

  const result = await fetchMarginStatus({ id: 'user-a' });

  assert.equal(result.currentMargin, 500_000);
  assert.equal(result.marginLimit, 0);
  assert.equal(result.logicVersion, HOME_MARGIN_LOGIC_VERSION);
  assert.equal(result.updatedAt, '2026-07-21T20:36:30.000Z');
  assert.equal(state.updateAttempts, 0);
});
