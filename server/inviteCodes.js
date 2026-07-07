import crypto from 'node:crypto';

export const INVITE_ADMIN_EMAIL = 'chenshuai1190@gmail.com';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_LIST_LIMIT = 20;

export function normalizeInviteCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

export function isInviteAdmin(user) {
  return String(user?.email || '').trim().toLowerCase() === INVITE_ADMIN_EMAIL;
}

export function generateInviteCode() {
  const random = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += CODE_ALPHABET[random[i] % CODE_ALPHABET.length];
  }
  return `QTE-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function getSupabaseAdminConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('邀请码服务未配置: 缺少 Supabase URL 或 service role key');
    error.status = 500;
    throw error;
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

function jsonHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function supabaseRestFetch(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
  const url = new URL(path, `${supabaseUrl}/`);
  const res = await fetch(url, {
    ...options,
    headers: jsonHeaders(serviceRoleKey, options.headers || {}),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const message = body?.message || body?.error_description || body?.error || `Supabase REST ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function supabaseAuthAdminFetch(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
  const url = new URL(String(path || '').replace(/^\//, ''), `${supabaseUrl}/auth/v1/`);
  const res = await fetch(url, {
    ...options,
    headers: jsonHeaders(serviceRoleKey, options.headers || {}),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const message = body?.message || body?.error_description || body?.error || `Supabase Auth ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function sanitizeInviteRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    createdByEmail: row.created_by_email || '',
    usedByEmail: row.used_by_email || '',
    expiresAt: row.expires_at || '',
    createdAt: row.created_at || '',
    usedAt: row.used_at || '',
  };
}

function isUsableInvite(row) {
  if (!row || row.status !== 'active' || row.used_at) return false;
  if (!row.expires_at) return true;
  const expiresAt = Date.parse(row.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function findInviteCode(code) {
  const normalized = normalizeInviteCode(code);
  if (!/^[A-Z0-9-]{8,32}$/.test(normalized)) return null;

  const url = new URL('/rest/v1/invite_codes', 'https://placeholder.local');
  url.searchParams.set('select', 'id,code,status,used_at,used_by,used_by_email,expires_at,created_at,created_by_email');
  url.searchParams.set('code', `eq.${normalized}`);
  url.searchParams.set('limit', '1');
  const rows = await supabaseRestFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function listInviteCodes({ limit = DEFAULT_LIST_LIMIT } = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || DEFAULT_LIST_LIMIT));
  const url = new URL('/rest/v1/invite_codes', 'https://placeholder.local');
  url.searchParams.set('select', 'id,code,status,created_by_email,used_by_email,expires_at,created_at,used_at');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(safeLimit));
  const rows = await supabaseRestFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows.map(sanitizeInviteRecord) : [];
}

export async function createInviteCode({ createdBy, note = '', expiresAt = null } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateInviteCode();
    try {
      const rows = await supabaseRestFetch('/rest/v1/invite_codes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          code,
          created_by: createdBy?.id || null,
          created_by_email: createdBy?.email || '',
          note: String(note || '').slice(0, 200),
          expires_at: expiresAt || null,
          status: 'active',
        }),
      });
      const record = Array.isArray(rows) ? rows[0] : rows;
      return sanitizeInviteRecord(record);
    } catch (error) {
      lastError = error;
      if (!/duplicate|unique/i.test(error?.message || '')) throw error;
    }
  }
  throw lastError || new Error('邀请码生成失败');
}

async function createAuthUser({ email, password, inviteCode }) {
  return await supabaseAuthAdminFetch('admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invite_code: inviteCode,
      },
    }),
  });
}

async function deleteAuthUser(userId) {
  if (!userId) return;
  try {
    await supabaseAuthAdminFetch(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.warn('[Invite] failed to roll back created auth user:', error?.message || error);
  }
}

export async function registerUserWithInvite({ email, password, inviteCode }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedCode = normalizeInviteCode(inviteCode);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error('邮箱格式不正确');
    error.status = 400;
    throw error;
  }
  if (String(password || '').length < 6) {
    const error = new Error('密码至少 6 位');
    error.status = 400;
    throw error;
  }
  if (!/^[A-Z0-9-]{8,32}$/.test(normalizedCode)) {
    const error = new Error('邀请码不正确');
    error.status = 403;
    throw error;
  }

  const invite = await findInviteCode(normalizedCode);
  if (!isUsableInvite(invite)) {
    const error = new Error('邀请码无效或已被使用');
    error.status = 403;
    throw error;
  }

  let user = null;
  try {
    user = await createAuthUser({
      email: normalizedEmail,
      password,
      inviteCode: normalizedCode,
    });
  } catch (error) {
    if (/already|registered|exists|User already registered/i.test(error.message || '')) {
      error.status = 409;
      error.message = '该邮箱已注册,请直接登录';
    }
    throw error;
  }

  const userId = user?.id;
  const now = new Date().toISOString();
  const url = new URL('/rest/v1/invite_codes', 'https://placeholder.local');
  url.searchParams.set('id', `eq.${invite.id}`);
  url.searchParams.set('status', 'eq.active');
  url.searchParams.set('used_at', 'is.null');

  const updatedRows = await supabaseRestFetch(`${url.pathname}${url.search}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'used',
      used_by: userId,
      used_by_email: normalizedEmail,
      used_at: now,
      updated_at: now,
    }),
  });

  if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
    await deleteAuthUser(userId);
    const error = new Error('邀请码已被使用,请换一个邀请码');
    error.status = 409;
    throw error;
  }

  return {
    user: {
      id: userId,
      email: user?.email || normalizedEmail,
    },
    invite: sanitizeInviteRecord(updatedRows[0]),
  };
}
