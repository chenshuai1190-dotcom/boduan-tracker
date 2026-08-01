export const QUOTE_API_POLICY_HEADER = 'X-Boduan-Quote-Policy';
export const QUOTE_API_POLICY_VERSION = 'eodhd-rest-baseline-v1';

export function quoteApiPolicyHeaders(headers = {}) {
  return {
    ...headers,
    [QUOTE_API_POLICY_HEADER]: QUOTE_API_POLICY_VERSION,
  };
}
