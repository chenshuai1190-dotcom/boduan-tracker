import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchVixHistoryText, parseCboeHistoryCsv, VIX_HISTORY_MAX_BYTES } from '../server/quote/vixTermStructure.js';
import { ProviderTimeoutError } from '../server/quote/http.js';

const HEADER = 'DATE,OPEN,HIGH,LOW,CLOSE';

test('official CSV accepts BOM/CRLF and identical duplicates but rejects conflicting or malformed dated rows', () => {
  const result = parseCboeHistoryCsv('\uFEFF' + [HEADER,
    '09/25/2026,14.4,15.0,14.0,14.87',
    '09/25/2026,14.4,15.0,14.0,14.87',
    '09/24/2026,15,16,14,15.9',
    '09/24/2026,15,16,14,15.8',
    '09/24/2026,15,16,14,15.9',
    '09/23/2026,15,16,14,15.9',
    '09/23/2026,15,16,14,',
    '02/30/2026,15,16,14,15',
    '09/22/2026,15,16,14,Infinity',
    '09/21/2026,15,16,14,0',
    '09/20/2026,15,16,14,0x10',
    '09/19/2026,15,16,14,1e2',
    '09/18/2026,15,16,14,-1',
    '09/17/2026,15,16,14,15,extra',
  ].join('\r\n'));
  assert.deepEqual(result, [{ date: '2026-09-25', close: 14.87 }]);
});

test('CSV validates exact schema, nonempty closes, and bounded input', () => {
  for (const text of ['', '<html>error</html>', 'DATE,CLOSE\n09/25/2026,14.87',
    'DATE,OPEN,HIGH,LOW,CLOSE,EXTRA\n09/25/2026,15,16,14,15,1',
    HEADER, HEADER + '\n09/25/2026,15,16,14,NaN']) {
    assert.throws(() => parseCboeHistoryCsv(text), /Cboe history/);
  }
  assert.throws(() => parseCboeHistoryCsv('x'.repeat(VIX_HISTORY_MAX_BYTES + 1)), /response invalid/);
});

test('body size is enforced on content length and actual streamed bytes', async () => {
  let consumed = false;
  await assert.rejects(fetchVixHistoryText('https://example.test/history', {
    provider: 'test', maxBytes: 10,
    fetchImpl: async () => ({ ok: true, headers: { get: () => '11' }, text: async () => { consumed = true; return ''; } }),
  }), /too large/);
  assert.equal(consumed, false);
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('12345678901')); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(fetchVixHistoryText('https://example.test/history', {
    provider: 'test', maxBytes: 10,
    fetchImpl: async () => ({ ok: true, body }),
  }), /too large/);
  assert.equal(cancelled, true);
  await assert.rejects(fetchVixHistoryText('https://example.test/history', {
    provider: 'test', maxBytes: 10,
    fetchImpl: async () => ({ ok: true, text: async () => '12345678901' }),
  }), /too large/);
});

test('timeout covers body consumption after headers and aborts the provider without leaking URLs', async () => {
  let signal;
  await assert.rejects(fetchVixHistoryText('https://example.test/history?api_token=secret', {
    provider: 'test', timeoutMs: 10,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { ok: true, text: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
      }) };
    },
  }), (error) => error instanceof ProviderTimeoutError && !error.message.includes('secret'));
  assert.equal(signal.aborted, true);
});
