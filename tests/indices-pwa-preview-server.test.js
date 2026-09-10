import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  createIndicesPreviewHandler,
  createIndicesPreviewUpgrade,
  isLocalPreviewRequest,
  isReadOnlyApiRequest,
  productionRequestOptions,
  productionTarget,
  validatePreviewEnvironment,
} from '../scripts/indices-pwa-preview-server.mjs';

function request(url = '/api/indices-realtime?snapshot=1', overrides = {}) {
  return { method: 'GET', url, headers: { host: '127.0.0.1:4173' }, ...overrides };
}

function response() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.end = (body) => { res.body = body; res.writableEnded = true; res.emit('finish'); };
  return res;
}

test('PWA QA accepts only its loopback host and same-origin requests', () => {
  assert.equal(isLocalPreviewRequest(request()), true);
  assert.equal(isLocalPreviewRequest(request('/', { headers: { host: 'localhost:4173', origin: 'http://localhost:4173' } })), true);
  for (const headers of [
    { host: '192.168.1.4:4173' }, { host: 'attacker.example:4173' },
    { host: '127.0.0.1:4173', origin: 'https://attacker.example' },
    { host: '127.0.0.1:4174' },
  ]) assert.equal(isLocalPreviewRequest(request('/', { headers })), false);
});

test('PWA QA never bypasses API auth or allows missing provider/auth configuration', () => {
  const env = { EODHD_API_KEY: 'test-key', VITE_SUPABASE_URL: 'https://example.test', VITE_SUPABASE_ANON_KEY: 'test-anon' };
  assert.doesNotThrow(() => validatePreviewEnvironment(env));
  assert.throws(() => validatePreviewEnvironment({ ...env, QUOTE_API_AUTH_REQUIRED: 'false' }), /authentication/);
  assert.throws(() => validatePreviewEnvironment({ ...env, EODHD_API_KEY: '' }), /configuration/);
  assert.throws(() => validatePreviewEnvironment({ ...env, VITE_SUPABASE_ANON_KEY: '' }), /configuration/);
});

test('PWA QA refuses writes and GET-based cron operations before upstream forwarding', () => {
  for (const [method, target] of [
    ['POST', '/api/quote'], ['DELETE', '/api/quote'], ['GET', '/api/register'],
    ['GET', '/api/close-snapshot-schedule'], ['GET', '/api/pnl-report-daily-snapshot'],
    ['GET', '/api/earnings-calendar?operation=sec-coverage-schedule'],
    ['GET', '/api/community-competition?operation=daily-snapshot'],
    ['GET', '/api/community-competition?operation=recalculate-self'],
    ['GET', '/api/community-competition?operation=detail&operation=daily-snapshot'],
  ]) assert.equal(isReadOnlyApiRequest(request(target, { method }), new URL(target, 'https://example.test')), false, target);
  for (const target of ['/api/quote?symbols=QQQ', '/api/fx', '/api/stocks-realtime?snapshot=1', '/api/earnings-calendar?operation=detail', '/api/community-competition?operation=snapshot-status']) {
    assert.equal(isReadOnlyApiRequest(request(target), new URL(target, 'https://example.test')), true, target);
  }
});

test('PWA QA passes the original authenticated index request to production code and logs only allowed metadata', () => {
  const indices = new EventEmitter();
  const logs = [];
  let time = Date.parse('2026-09-10T14:00:00Z');
  const handler = createIndicesPreviewHandler({ indicesServer: indices, logger: value => logs.push(JSON.parse(value)), now: () => time });
  const req = request('/api/indices-realtime?snapshot=1&private-query=do-not-log', { headers: { host: '127.0.0.1:4173', authorization: 'Bearer test-private-token' } });
  const res = response();
  indices.on('request', (originalReq, originalRes) => {
    assert.equal(originalReq, req);
    assert.equal(originalRes, res);
    assert.equal(originalReq.headers.authorization, 'Bearer test-private-token');
    time += 23;
    originalRes.statusCode = 401;
    originalRes.end('private response never logged');
  });
  handler(req, res);
  res.emit('close');
  assert.deepEqual(logs, [{ request: 1, at: '2026-09-10T14:00:00.000Z', status: 401, durationMs: 23 }]);
  assert.doesNotMatch(JSON.stringify(logs), /private|Bearer|snapshot/);
});

test('PWA QA records a cancelled index request once without body or URL', () => {
  const logs = [];
  const handler = createIndicesPreviewHandler({ indicesServer: new EventEmitter(), logger: value => logs.push(JSON.parse(value)), now: () => 0 });
  const res = response();
  handler(request(), res);
  res.emit('close');
  res.emit('finish');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 499);
});

test('PWA QA rejects nonlocal and modifying requests before invoking any handler', () => {
  const indices = new EventEmitter();
  indices.on('request', () => assert.fail('must not reach index handler'));
  const handler = createIndicesPreviewHandler({ indicesServer: indices, logger: () => assert.fail('must not log private requests'), requestUpstream: () => assert.fail('must not forward') });
  for (const req of [request(undefined, { method: 'POST' }), request(undefined, { headers: { host: 'external.example' } }), request('/api/earnings-calendar?operation=sec-coverage-schedule')]) {
    const res = response();
    handler(req, res);
    assert.ok([403, 405].includes(res.statusCode));
  }
});

test('PWA QA HTTP/WS forwarding preserves authorization but not local cookies or arbitrary headers', () => {
  const req = request('/api/stocks-realtime?symbols=QQQ', { headers: {
    host: '127.0.0.1:4173', authorization: 'Bearer test-token', cookie: 'private=ignored',
    origin: 'http://127.0.0.1:4173', 'sec-websocket-key': 'handshake-key',
    'sec-websocket-protocol': 'xmoney-stocks, supabase.test-token',
  } });
  const options = productionRequestOptions(req);
  assert.equal(options.headers.Authorization, req.headers.authorization);
  assert.equal(options.headers.cookie, undefined);
  const ws = productionRequestOptions(req, { upgrade: true });
  assert.equal(ws.headers.Origin, 'https://boduan-tracker.vercel.app');
  assert.equal(ws.headers['Sec-WebSocket-Protocol'], req.headers['sec-websocket-protocol']);
  assert.equal(ws.headers['Sec-WebSocket-Key'], 'handshake-key');
  assert.equal(ws.headers.cookie, undefined);
});

test('PWA QA cannot redirect authenticated forwarding to an arbitrary request origin', () => {
  for (const target of [
    '/api/quote?symbols=QQQ',
    'https://untrusted.example/api/quote?symbols=QQQ',
    '//untrusted.example/api/stocks-realtime?symbols=QQQ',
  ]) {
    const url = productionTarget(target);
    assert.equal(url.origin, 'https://boduan-tracker.vercel.app');
    assert.equal(url.searchParams.get('symbols'), 'QQQ');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
});

test('PWA QA forwards GET to the fixed production origin without logging response or authorization', () => {
  const outbound = new EventEmitter();
  outbound.setTimeout = () => {};
  outbound.end = () => {};
  outbound.destroy = () => {};
  let forwarded = false;
  const handler = createIndicesPreviewHandler({
    indicesServer: new EventEmitter(),
    logger: () => assert.fail('non-index requests must not be logged'),
    requestUpstream: (url, options) => {
      forwarded = true;
      assert.equal(url.href, 'https://boduan-tracker.vercel.app/api/quote?symbols=QQQ');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer original-test-token');
      return outbound;
    },
  });
  handler(request('https://untrusted.example/api/quote?symbols=QQQ', { headers: { host: '127.0.0.1:4173', authorization: 'Bearer original-test-token' } }), response());
  assert.equal(forwarded, true);
});

test('PWA QA only upgrades the two existing read-only stock and BTC websocket routes', () => {
  for (const target of ['/api/indices-realtime', '/api/quote', '/unexpected']) {
    const socket = new PassThrough();
    let body = '';
    socket.on('data', chunk => { body += chunk; });
    createIndicesPreviewUpgrade({ requestUpstream: () => assert.fail('unknown upgrade must not forward') })(request(target), socket, Buffer.alloc(0));
    assert.match(body, /403 Forbidden/);
  }
  for (const target of ['/api/btc-realtime', '/api/stocks-realtime?symbols=QQQ']) {
    const outbound = new EventEmitter();
    outbound.setTimeout = () => {};
    outbound.end = () => {};
    outbound.destroy = () => {};
    const socket = new PassThrough();
    createIndicesPreviewUpgrade({ requestUpstream: (url, options) => {
      assert.equal(url.origin, 'https://boduan-tracker.vercel.app');
      assert.equal(url.pathname + url.search, target);
      assert.equal(options.headers.Origin, url.origin);
      return outbound;
    } })(request(target), socket, Buffer.alloc(0));
    socket.destroy();
  }
});
