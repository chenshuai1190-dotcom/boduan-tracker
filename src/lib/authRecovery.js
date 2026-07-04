export const PASSWORD_RECOVERY_REDIRECT_TO = 'https://boduan-tracker.vercel.app';

const RECOVERY_EXPIRED_MESSAGE = '重置链接已失效, 请重新发送重置链接';
const RECOVERY_INVALID_MESSAGE = '重置链接无效或已过期, 请重新发送重置链接';

function appendParams(target, rawPart) {
  if (!rawPart) return;

  const trimmed = String(rawPart).replace(/^[?#]/, '');
  if (!trimmed) return;

  const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed;
  const params = new URLSearchParams(query);
  params.forEach((value, key) => {
    target.set(key, value);
  });
}

export function getRecoveryUrlParams(locationLike = globalThis.location) {
  const params = new URLSearchParams();
  appendParams(params, locationLike?.search || '');
  appendParams(params, locationLike?.hash || '');
  return params;
}

export function isRecoveryCallbackLocation(locationLike = globalThis.location) {
  const params = getRecoveryUrlParams(locationLike);
  return (
    params.get('type') === 'recovery' ||
    params.has('code') ||
    params.get('error') === 'access_denied' ||
    params.has('error_code') ||
    params.has('error_description')
  );
}

export function getRecoveryCallbackError(locationLike = globalThis.location) {
  const params = getRecoveryUrlParams(locationLike);
  const errorCode = params.get('error_code') || '';
  const error = params.get('error') || '';
  const description = params.get('error_description') || '';

  if (!error && !errorCode && !description) {
    return '';
  }

  if (errorCode === 'otp_expired') {
    return RECOVERY_EXPIRED_MESSAGE;
  }

  if (error === 'access_denied') {
    return RECOVERY_INVALID_MESSAGE;
  }

  return description ? `重置链接错误: ${description}` : RECOVERY_INVALID_MESSAGE;
}

export function getPasswordRecoveryRedirectTo() {
  return PASSWORD_RECOVERY_REDIRECT_TO;
}
