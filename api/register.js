import { configuredOrigins } from '../server/quote/auth.js';
import { registerUserWithInvite } from '../server/inviteCodes.js';

function setRegisterCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const origins = configuredOrigins(req);
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

export default async function handler(req, res) {
  setRegisterCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  let body = {};
  try {
    body = await readBody(req);
  } catch {
    return sendError(res, 400, '请求格式不正确');
  }

  try {
    const result = await registerUserWithInvite({
      email: body.email,
      password: body.password,
      inviteCode: body.inviteCode,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return sendError(res, status, error?.message || '注册失败');
  }
}

