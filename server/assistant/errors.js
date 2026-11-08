export class AssistantError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AssistantError';
    this.code = code;
    this.status = status;
  }
}

export function assistantFailure(error) {
  if (error instanceof AssistantError) return error;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new AssistantError('ASSISTANT_TIMEOUT', 'Quote 本次思考超时，请稍后重试。', 504);
  }
  return new AssistantError('ASSISTANT_UNAVAILABLE', 'Quote 暂时无法完成这次请求，请稍后重试。', 502);
}

/** Existing shared read caches need not accept our AbortSignal. Stop awaiting
 * them at this request's deadline without cancelling work shared by other users. */
export async function withinAssistantDeadline(work, signal) {
  signal?.throwIfAborted();
  if (!signal) return work();
  let abort;
  const cancelled = new Promise((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(work), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
