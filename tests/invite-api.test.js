import assert from 'node:assert/strict';
import { test } from 'node:test';

import inviteCodesHandler from '../api/invite-codes.js';
import registerHandler from '../api/register.js';

function createMockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test('register endpoint rejects signup without an invite code before admin config is needed', async () => {
  const req = {
    method: 'POST',
    headers: { host: 'localhost:3000' },
    body: {
      email: 'new-user@example.com',
      password: '123456',
    },
  };
  const res = createMockRes();

  await registerHandler(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { success: false, error: '邀请码不正确' });
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('invite-code management endpoint rejects missing auth before admin work', async () => {
  const req = {
    method: 'GET',
    headers: { host: 'localhost:3000' },
    query: {},
  };
  const res = createMockRes();

  await inviteCodesHandler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { success: false, error: '未授权: 请先登录' });
  assert.equal(res.headers['cache-control'], 'no-store');
});
