import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  generateInviteCode,
  INVITE_ADMIN_EMAIL,
  isInviteAdmin,
  normalizeInviteCode,
  sanitizeInviteRecord,
} from '../server/inviteCodes.js';

test('invite-code helpers normalize and identify the admin account', () => {
  assert.equal(INVITE_ADMIN_EMAIL, 'chenshuai1190@gmail.com');
  assert.equal(normalizeInviteCode(' qte-abcd-1234 '), 'QTE-ABCD-1234');
  assert.equal(normalizeInviteCode('qte abc_123!'), 'QTEABC123');
  assert.equal(isInviteAdmin({ email: 'CHENSHUAI1190@gmail.com ' }), true);
  assert.equal(isInviteAdmin({ email: 'other@example.com' }), false);
});

test('generated invite codes are readable and app-scoped', () => {
  for (let i = 0; i < 12; i += 1) {
    assert.match(generateInviteCode(), /^QTE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  }
});

test('invite records are sanitized before returning to the client', () => {
  const row = {
    id: 'invite-id',
    code: 'QTE-ABCD-1234',
    status: 'used',
    created_by_email: 'admin@example.com',
    used_by_email: 'user@example.com',
    expires_at: null,
    created_at: '2026-07-07T00:00:00.000Z',
    used_at: '2026-07-07T01:00:00.000Z',
    internal_column: 'hidden',
  };

  assert.deepEqual(sanitizeInviteRecord(row), {
    id: 'invite-id',
    code: 'QTE-ABCD-1234',
    status: 'used',
    createdByEmail: 'admin@example.com',
    usedByEmail: 'user@example.com',
    expiresAt: '',
    createdAt: '2026-07-07T00:00:00.000Z',
    usedAt: '2026-07-07T01:00:00.000Z',
  });
});
