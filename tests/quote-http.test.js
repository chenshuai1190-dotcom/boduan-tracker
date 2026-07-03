import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithTimeout, ProviderTimeoutError } from '../server/quote/http.js';

test('fetchWithTimeout returns the provider response when it completes', async () => {
  let requestSignal;
  const response = {
    ok: true,
    status: 200,
    json: async () => {
      assert.equal(requestSignal.aborted, false);
      return { close: 123.45 };
    },
  };
  const result = await fetchWithTimeout('https://example.test/quote', {}, {
    provider: 'test-provider',
    timeoutMs: 50,
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      assert.equal(options.signal.aborted, false);
      return response;
    },
  });

  assert.equal(result, response);
  assert.deepEqual(await result.json(), { close: 123.45 });
});

test('fetchWithTimeout rejects slow providers with ProviderTimeoutError', async () => {
  await assert.rejects(
    fetchWithTimeout('https://example.test/slow', {}, {
      provider: 'slow-provider',
      timeoutMs: 5,
      fetchImpl: () => new Promise(() => {}),
    }),
    (error) => {
      assert.ok(error instanceof ProviderTimeoutError);
      assert.equal(error.provider, 'slow-provider');
      assert.equal(error.timeoutMs, 5);
      return true;
    }
  );
});
