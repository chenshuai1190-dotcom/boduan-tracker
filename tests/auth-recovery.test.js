import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSWORD_RECOVERY_REDIRECT_TO,
  getPasswordRecoveryRedirectTo,
  getRecoveryCallbackError,
  getRecoveryUrlParams,
  isRecoveryCallbackLocation,
} from '../src/lib/authRecovery.js';

test('password recovery redirect is pinned to production app origin', () => {
  assert.equal(PASSWORD_RECOVERY_REDIRECT_TO, 'https://boduan-tracker.vercel.app');
  assert.equal(getPasswordRecoveryRedirectTo(), 'https://boduan-tracker.vercel.app');
});

test('detects legacy hash recovery callback', () => {
  const location = { search: '', hash: '#access_token=abc&type=recovery&refresh_token=def' };
  assert.equal(isRecoveryCallbackLocation(location), true);
  assert.equal(getRecoveryCallbackError(location), '');
});

test('detects Supabase code callback in query string', () => {
  const location = { search: '?code=one-time-code', hash: '' };
  const params = getRecoveryUrlParams(location);
  assert.equal(params.get('code'), 'one-time-code');
  assert.equal(isRecoveryCallbackLocation(location), true);
  assert.equal(getRecoveryCallbackError(location), '');
});

test('detects recovery callback parameters inside hash route query', () => {
  const location = { search: '', hash: '#/auth/callback?code=hash-code&type=recovery' };
  const params = getRecoveryUrlParams(location);
  assert.equal(params.get('code'), 'hash-code');
  assert.equal(params.get('type'), 'recovery');
  assert.equal(isRecoveryCallbackLocation(location), true);
});

test('maps expired recovery links to a resend message', () => {
  const location = {
    search: '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    hash: '',
  };

  assert.equal(isRecoveryCallbackLocation(location), true);
  assert.equal(getRecoveryCallbackError(location), '重置链接已失效, 请重新发送重置链接');
});

