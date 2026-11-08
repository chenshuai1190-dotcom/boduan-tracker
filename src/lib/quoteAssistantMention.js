const ALIASES = ['quote', '小助手'];
const TOKEN_CHARACTER = /[\p{L}\p{N}_]/u;
const EMAIL_OR_PATH_CHARACTER = /[A-Za-z0-9_@./%+\-]/;

/** Locate only the token at the collapsed caret. This is a composer affordance,
 * never an authorization check or a request to call the model. */
export function getQuoteMentionQuery(value, selectionStart, selectionEnd = selectionStart) {
  if (typeof value !== 'string' || !Number.isInteger(selectionStart)
    || selectionStart !== selectionEnd || selectionStart < 0 || selectionStart > value.length) return null;
  const start = value.lastIndexOf('@', selectionStart - 1);
  if (start < 0 || start >= selectionStart || start > 0 && EMAIL_OR_PATH_CHARACTER.test(value[start - 1])) return null;
  const query = value.slice(start + 1, selectionStart);
  if (query.length > 5 || !ALIASES.some(alias => alias.startsWith(query.toLowerCase()))) return null;
  let end = selectionStart;
  while (end < value.length && TOKEN_CHARACTER.test(value[end])) end += 1;
  const wholeToken = value.slice(start + 1, end).toLowerCase();
  if (!ALIASES.some(alias => alias.startsWith(wholeToken))) return null;
  return { start, end, query };
}

/** Replace the complete active token, preserving surrounding text and caret. */
export function applyQuoteMention(value, match) {
  if (typeof value !== 'string' || !match || !Number.isInteger(match.start) || !Number.isInteger(match.end)
    || match.start < 0 || match.end > value.length || match.end <= match.start) return null;
  const verified = getQuoteMentionQuery(value, match.start + 1 + String(match.query || '').length);
  if (!verified || verified.start !== match.start || verified.end !== match.end || verified.query !== match.query) return null;
  const suffix = value.slice(match.end);
  const insertion = `@Quote${/^\s/.test(suffix) ? '' : ' '}`;
  const position = match.start + insertion.length;
  return { text: value.slice(0, match.start) + insertion + suffix, selectionStart: position, selectionEnd: position };
}
