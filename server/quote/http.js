import {
  assertEodhdQuotaAvailable,
  recordEodhdQuotaResponse,
} from './eodhdQuotaGuard.js';

export const QUOTE_TIMEOUTS = Object.freeze({
  auth: 6000,
  eodhd: 10000,
  yahoo: 7000,
  cnn: 8000,
  nasdaq: 8000,
  translate: 8000,
  default: 8000,
});

export class ProviderTimeoutError extends Error {
  constructor(provider, timeoutMs) {
    super(`${provider} timeout after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout(url, options = {}, config = {}) {
  const {
    timeoutMs = QUOTE_TIMEOUTS.default,
    provider = 'provider',
    fetchImpl = globalThis.fetch,
  } = config;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }

  assertEodhdQuotaAvailable(url);

  const controller = new AbortController();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError(provider, timeoutMs));
    }, timeoutMs);
  });

  const requestOptions = {
    ...(options || {}),
    signal: controller.signal,
  };

  try {
    const response = await Promise.race([
      fetchImpl(url, requestOptions),
      timeoutPromise,
    ]);
    recordEodhdQuotaResponse(url, response);
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProviderTimeoutError(provider, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function providerFetch(url, options = {}, config = {}) {
  return fetchWithTimeout(url, options, config);
}
