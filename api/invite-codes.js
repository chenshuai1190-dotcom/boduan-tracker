import { authenticateAccessToken, configuredOrigins } from '../server/quote/auth.js';
import { createInviteCode, isInviteAdmin, listInviteCodes } from '../server/inviteCodes.js';

function setInviteCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const origins = configuredOrigins(req);
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function sendError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function requireInviteAdmin(req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    sendError(res, 401, '未授权: 请先登录');
    return null;
  }

  const auth = await authenticateAccessToken(authHeader.slice('Bearer '.length));
  if (!auth.ok) {
    sendError(res, auth.status, auth.error);
    return null;
  }
  if (!isInviteAdmin(auth.user)) {
    sendError(res, 403, '只有管理员可以管理邀请码');
    return null;
  }
  return auth.user;
}

export default async function handler(req, res) {
  setInviteCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const admin = await requireInviteAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const invites = await listInviteCodes({ limit: req.query?.limit });
      return res.status(200).json({ success: true, invites });
    }

    const body = await readBody(req);
    const invite = await createInviteCode({
      createdBy: admin,
      note: body.note || '',
      expiresAt: body.expiresAt || null,
    });
    const invites = await listInviteCodes();
    return res.status(200).json({ success: true, invite, invites });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return sendError(res, status, error?.message || '邀请码操作失败');
  }
}

