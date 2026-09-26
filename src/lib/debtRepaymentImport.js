import { parseMoney, validateRepayment } from './debtManager.js';

// Parsing is a preview only. A caller must explicitly select and save rows.
const FULL_DATE = /(?<!\d)(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:\s*[日号])?(?!\d)/u;
const PARTIAL_DATE = /(?<!\d)(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[日号])?(?!\d)/u;
const YEAR_HEADING = /^(\d{4})\s*(?:年|[:：])?$/u;
const NUMBER_AMOUNT = /(?:[¥￥]\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:万元|千元|万|千|元)?/gu;
const CHINESE_AMOUNT = /[零〇一二两三四五六七八九十百千万]+(?:元)?/gu;
const EXPLICIT_EXCLUSION = /不(?:算|在|计入).{0,8}合同|合同外|不计算|不计入|另算/u;
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const HAN_DIGITS = Object.freeze({ 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });
const HAN_UNITS = Object.freeze({ 十: 10, 百: 100, 千: 1000 });
const METHODS = Object.freeze([
  ['公司支付宝', /公司支付宝/u],
  ['支付宝', /支付宝/u],
  ['微信', /微信(?:支付)?/u],
  ['招商银行', /招商银行|招行|招商/u],
  ['台州银行', /台州银行/u],
  ['银行转账', /[\u4e00-\u9fff]{2,8}银行|银行转账/u],
]);

function dateKey(year, month, day) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

function stripListMarker(value) {
  return value.trim().replace(/^(?:[-*•]\s+|\d{1,2}[、.)](?:\s+|(?=[^\d]))|[（(]\d{1,2}[）)]\s*)/u, '').trim();
}

function beginsWithTargetLabel(body, name) {
  if (!name) return false;
  const pattern = name.split(/\s+/u).map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s*');
  return new RegExp(`^${pattern}(?=$|[\\s,，:：、（(\\d])`, 'u').test(body);
}

function readDate(body, headingYear) {
  const full = FULL_DATE.exec(body);
  if (full) return { date: dateKey(full[1], full[2], full[3]), invalid: !dateKey(full[1], full[2], full[3]), span: [full.index, full.index + full[0].length] };
  const partial = headingYear ? PARTIAL_DATE.exec(body) : null;
  if (partial) return { date: dateKey(headingYear, partial[1], partial[2]), invalid: !dateKey(headingYear, partial[1], partial[2]), span: [partial.index, partial.index + partial[0].length] };
  return { date: null, invalid: false, span: null };
}

function hanBelowTenThousand(raw) {
  if (!raw) return 0;
  let total = 0;
  let digit = null;
  for (const char of raw) {
    if (Object.hasOwn(HAN_DIGITS, char)) digit = HAN_DIGITS[char];
    else if (Object.hasOwn(HAN_UNITS, char)) {
      total += (digit ?? 1) * HAN_UNITS[char];
      digit = null;
    } else return null;
  }
  return total + (digit ?? 0);
}

function hanAmountCents(raw) {
  const amount = raw.replace(/元$/u, '');
  if (!/[十百千万]/u.test(amount) || !/[一二两三四五六七八九十百千]/u.test(amount)) return null;
  const pieces = amount.split('万');
  if (pieces.length > 2) return null;
  const high = pieces.length === 2 ? hanBelowTenThousand(pieces[0] || '一') : 0;
  const low = hanBelowTenThousand(pieces.at(-1));
  if (high === null || low === null) return null;
  // Shorthand such as "二万五" can mean 25,000; it needs human review.
  if (pieces.length === 2 && pieces[1] && /^[零〇一二两三四五六七八九]$/u.test(pieces[1])) return null;
  const cents = BigInt(high * 10000 + low) * 100n;
  return cents > MAX_SAFE_CENTS ? null : Number(cents);
}

function numericAmountCents(raw) {
  const match = /^(?:[¥￥]\s*)?([\d,]+(?:\.\d{1,2})?)\s*(万元|千元|万|千|元)?$/u.exec(raw);
  if (!match) return null;
  const base = parseMoney(match[1].replaceAll(',', ''));
  if (base === null) return null;
  const multiplier = match[2]?.startsWith('万') ? 10000n : match[2]?.startsWith('千') ? 1000n : 1n;
  const cents = BigInt(base) * multiplier;
  return cents > MAX_SAFE_CENTS ? null : Number(cents);
}

function readAmounts(body, dateSpan) {
  const masked = [...body];
  if (dateSpan) for (let i = dateSpan[0]; i < dateSpan[1]; i += 1) masked[i] = ' ';
  const withoutDate = masked.join('');
  const negative = /(?:^|[^\d])[-−]\s*(?:[¥￥]\s*)?(?:\d|[零〇一二两三四五六七八九十百千万])/u.test(withoutDate);
  let invalidAmount = /\d+(?:\.\d+)?e[+-]?\d+/iu.test(withoutDate);
  const candidates = [];
  for (const match of withoutDate.matchAll(NUMBER_AMOUNT)) {
    const cents = numericAmountCents(match[0]);
    // Standalone years or list numbers are not automatically repayment amounts.
    if (cents !== null && cents > 0) candidates.push({ cents, span: [match.index, match.index + match[0].length] });
    else invalidAmount = true;
  }
  for (const match of withoutDate.matchAll(CHINESE_AMOUNT)) {
    const end = match.index + match[0].length;
    if (candidates.some(item => item.span[0] < end && item.span[1] > match.index)) continue;
    const cents = hanAmountCents(match[0]);
    if (cents !== null && cents > 0) candidates.push({ cents, span: [match.index, end] });
  }
  const distinct = [...new Set(candidates.map(item => item.cents))];
  return { cents: distinct.length === 1 ? distinct[0] : null, ambiguous: distinct.length > 1, negative, invalidAmount, spans: candidates.map(item => item.span) };
}

function readMethodAndNote(body, targetName, dateSpan, amountSpans) {
  const masked = [...body];
  for (const span of [dateSpan, ...amountSpans]) {
    if (span) for (let i = span[0]; i < span[1]; i += 1) masked[i] = ' ';
  }
  let text = masked.join('');
  const match = METHODS.map(([label, regex]) => ({ label, match: regex.exec(text) })).find(item => item.match);
  const method = match?.label || '';
  if (match) text = text.replace(match.match[0], ' ');
  if (targetName) text = text.replace(targetName, ' ');
  const note = text.replace(/[（）()，,。;；:：]/gu, ' ').replace(/转账/gu, ' ').replace(/\s+/gu, ' ').trim();
  return { method, note };
}

/**
 * Parse pasted history into reviewable rows. READY means only that this line
 * names the target debt and has a valid dated amount; it never writes data.
 */
export function parseBulkRepaymentText(text, { targetName = '', debtDate, today } = {}) {
  const rows = [];
  const name = String(targetName).trim();
  let headingYear = null;
  let readyCents = 0n;
  for (const [index, source] of String(text ?? '').split(/\r?\n/u).entries()) {
    const raw = source.trim();
    if (!raw) continue;
    const body = stripListMarker(raw);
    const heading = YEAR_HEADING.exec(body);
    if (heading) { headingYear = heading[1]; continue; }
    const { date, invalid: invalidDate, span: dateSpan } = readDate(body, headingYear);
    const { cents, ambiguous, negative, invalidAmount, spans: amountSpans } = readAmounts(body, dateSpan);
    const { method, note } = readMethodAndNote(body, name, dateSpan, amountSpans);
    const amount = cents === null ? null : cents / 100;
    let status = 'READY';
    let reason = '';
    if (EXPLICIT_EXCLUSION.test(body)) { status = 'EXCLUDED'; reason = '原文注明不计入本笔欠款'; }
    else if (!beginsWithTargetLabel(body, name)) { status = 'REVIEW'; reason = '未明确标注为当前欠款，请确认用途'; }
    else if (invalidDate) { status = 'INVALID'; reason = '日期无效'; }
    else if (negative) { status = 'INVALID'; reason = '还款金额不能为负数'; }
    else if (invalidAmount) { status = 'INVALID'; reason = '金额无效或超出安全范围'; }
    else if (ambiguous) { status = 'REVIEW'; reason = '同一行出现不一致的金额，请核对'; }
    else if (cents === null) { status = 'INVALID'; reason = '未识别到有效还款金额'; }
    else if (!date) { status = 'REVIEW'; reason = '缺少明确还款日期'; }
    else {
      const validation = validateRepayment({ amount, repaymentDate: date }, { debtDate, currency: 'CNY' }, today);
      if (Object.keys(validation.errors).length) {
        status = 'REVIEW';
        reason = Object.values(validation.errors)[0];
      } else if (readyCents + BigInt(cents) > MAX_SAFE_CENTS) {
        status = 'INVALID';
        reason = '本次导入金额合计超出安全范围';
      }
    }
    if (status === 'READY') readyCents += BigInt(cents);
    rows.push({ lineNumber: index + 1, raw, status, date, amount, method, note, reason });
  }
  const summary = { readyCount: 0, reviewCount: 0, excludedCount: 0, invalidCount: 0, readyAmount: Number(readyCents) / 100 };
  for (const row of rows) summary[`${row.status.toLowerCase()}Count`] += 1;
  return { rows, summary };
}
