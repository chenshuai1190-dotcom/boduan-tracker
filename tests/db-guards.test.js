import test from 'node:test';
import assert from 'node:assert/strict';

import { scopedDeleteById, scopedDeleteBySymbol } from '../src/lib/dbGuards.js';

function createQuery() {
  const calls = [];
  return {
    calls,
    delete() {
      calls.push(['delete']);
      return this;
    },
    eq(field, value) {
      calls.push(['eq', field, value]);
      return this;
    },
  };
}

test('scopedDeleteById always includes id and user_id filters', () => {
  const query = createQuery();
  const result = scopedDeleteById(query, 'trade-1', 'user-1');

  assert.equal(result, query);
  assert.deepEqual(query.calls, [
    ['delete'],
    ['eq', 'id', 'trade-1'],
    ['eq', 'user_id', 'user-1'],
  ]);
});

test('scopedDeleteBySymbol always includes symbol and user_id filters', () => {
  const query = createQuery();
  scopedDeleteBySymbol(query, 'QQQ', 'user-1');

  assert.deepEqual(query.calls, [
    ['delete'],
    ['eq', 'symbol', 'QQQ'],
    ['eq', 'user_id', 'user-1'],
  ]);
});

test('scoped delete guards reject missing user id', () => {
  assert.throws(
    () => scopedDeleteById(createQuery(), 'trade-1', ''),
    /未登录/
  );
});
