import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerUserWithInvite } from '../server/inviteCodes.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function withAdminMock(mockFetch, run) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = mockFetch;
  process.env.SUPABASE_URL = 'https://project.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  }
}

test('registration creates a completed community profile before consuming the invite', { concurrency: false }, async () => {
  const calls = [];
  await withAdminMock(async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/rest/v1/invite_codes' && (!options.method || options.method === 'GET')) {
      return jsonResponse([{
        id: 'invite-1',
        code: 'QTE-ABCD-EFGH',
        status: 'active',
        used_at: null,
      }]);
    }
    if (url.pathname === '/auth/v1/admin/users' && options.method === 'POST') {
      return jsonResponse({ id: 'user-new', email: 'new-user@example.com' });
    }
    if (url.pathname === '/rest/v1/community_profiles' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return jsonResponse([{
        ...body,
        created_at: body.profile_completed_at,
      }]);
    }
    if (url.pathname === '/rest/v1/invite_codes' && options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      return jsonResponse([{
        id: 'invite-1',
        code: 'QTE-ABCD-EFGH',
        status: body.status,
        used_by_email: body.used_by_email,
        used_at: body.used_at,
      }]);
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url.pathname}`);
  }, async () => {
    const result = await registerUserWithInvite({
      email: 'NEW-USER@example.com',
      password: '123456',
      inviteCode: 'qte-abcd-efgh',
      nickname: '  新 用户  ',
      avatarKey: 'WOLF',
    });
    assert.equal(result.user.id, 'user-new');
    assert.deepEqual(result.profile, {
      nickname: '新 用户',
      avatarKey: 'wolf',
      profileCompletedAt: result.profile.profileCompletedAt,
    });
    assert.ok(result.profile.profileCompletedAt);
  });

  const authIndex = calls.findIndex(({ url, options }) => url.pathname === '/auth/v1/admin/users' && options.method === 'POST');
  const profileIndex = calls.findIndex(({ url, options }) => url.pathname === '/rest/v1/community_profiles' && options.method === 'POST');
  const invitePatchIndex = calls.findIndex(({ url, options }) => url.pathname === '/rest/v1/invite_codes' && options.method === 'PATCH');
  assert.ok(authIndex >= 0 && profileIndex > authIndex && invitePatchIndex > profileIndex);
  const profileBody = JSON.parse(calls[profileIndex].options.body);
  assert.equal(profileBody.user_id, 'user-new');
  assert.equal(profileBody.nickname, '新 用户');
  assert.equal(profileBody.avatar_key, 'wolf');
  assert.ok(profileBody.profile_completed_at);
});

test('registration deletes the new auth user when profile creation fails', { concurrency: false }, async () => {
  const calls = [];
  await assert.rejects(withAdminMock(async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/rest/v1/invite_codes' && (!options.method || options.method === 'GET')) {
      return jsonResponse([{ id: 'invite-1', code: 'QTE-ABCD-EFGH', status: 'active', used_at: null }]);
    }
    if (url.pathname === '/auth/v1/admin/users' && options.method === 'POST') {
      return jsonResponse({ id: 'user-new', email: 'new-user@example.com' });
    }
    if (url.pathname === '/rest/v1/community_profiles' && options.method === 'POST') {
      return jsonResponse({ message: 'profile write failed' }, 500);
    }
    if (url.pathname === '/auth/v1/admin/users/user-new' && options.method === 'DELETE') {
      return jsonResponse({});
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url.pathname}`);
  }, async () => registerUserWithInvite({
    email: 'new-user@example.com',
    password: '123456',
    inviteCode: 'QTE-ABCD-EFGH',
    nickname: '新用户',
    avatarKey: 'blue',
  })), /profile write failed/);

  assert.ok(calls.some(({ url, options }) => url.pathname === '/auth/v1/admin/users/user-new' && options.method === 'DELETE'));
  assert.equal(calls.some(({ url, options }) => url.pathname === '/rest/v1/invite_codes' && options.method === 'PATCH'), false);
});

test('registration rolls back the new auth user when invite consumption loses the race', { concurrency: false }, async () => {
  const calls = [];
  await assert.rejects(withAdminMock(async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/rest/v1/invite_codes' && (!options.method || options.method === 'GET')) {
      return jsonResponse([{ id: 'invite-1', code: 'QTE-ABCD-EFGH', status: 'active', used_at: null }]);
    }
    if (url.pathname === '/auth/v1/admin/users' && options.method === 'POST') {
      return jsonResponse({ id: 'user-new', email: 'new-user@example.com' });
    }
    if (url.pathname === '/rest/v1/community_profiles' && options.method === 'POST') {
      return jsonResponse([{ ...JSON.parse(options.body), created_at: '2026-07-12T00:00:00.000Z' }]);
    }
    if (url.pathname === '/rest/v1/invite_codes' && options.method === 'PATCH') {
      return jsonResponse([]);
    }
    if (url.pathname === '/auth/v1/admin/users/user-new' && options.method === 'DELETE') {
      return jsonResponse({});
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url.pathname}`);
  }, async () => registerUserWithInvite({
    email: 'new-user@example.com',
    password: '123456',
    inviteCode: 'QTE-ABCD-EFGH',
    nickname: '新用户',
    avatarKey: 'blue',
  })), /邀请码已被使用/);

  const profileIndex = calls.findIndex(({ url, options }) => url.pathname === '/rest/v1/community_profiles' && options.method === 'POST');
  const invitePatchIndex = calls.findIndex(({ url, options }) => url.pathname === '/rest/v1/invite_codes' && options.method === 'PATCH');
  const rollbackIndex = calls.findIndex(({ url, options }) => url.pathname === '/auth/v1/admin/users/user-new' && options.method === 'DELETE');
  assert.ok(profileIndex >= 0 && invitePatchIndex > profileIndex && rollbackIndex > invitePatchIndex);
});
