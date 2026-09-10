// Shared by the authenticated API and client: incomplete / release-stage
// results must not block discovery of a subsequently filed periodic report.
export const EARNINGS_DETAIL_PARSER_VERSION = 'sec-structure-5';
export const EARNINGS_DETAIL_COMPLETE_TTL_MS = 6 * 60 * 60 * 1000;
export const EARNINGS_DETAIL_RETRY_TTL_MS = 5 * 60 * 1000;

export function earningsDetailCacheTtl(detail) {
  const releaseStage = /^(?:8-K|6-K)(?:\/A)?$/.test(detail?.source?.form || '');
  return detail?.status === 'complete' && !releaseStage
    ? EARNINGS_DETAIL_COMPLETE_TTL_MS
    : EARNINGS_DETAIL_RETRY_TTL_MS;
}

export function earningsDetailStateText(status, reason, language = 'zh') {
  const en = language === 'en';
  if (reason === 'not-published') return en ? 'Not published yet' : '尚未发布';
  if (reason === 'official-filing-not-found') return en ? 'Waiting for the official filing' : '等待官方财报文件';
  if (reason === 'sec-unavailable') return en ? 'Unable to read the official filing. Try again later.' : '官方文件暂时读取失败，请稍后重试';
  if (/^(?:single-reportable-segment|quarterly-.+-not-disclosed)$/.test(reason || '')) {
    return reason === 'single-reportable-segment'
      ? (en ? 'One reportable segment; no further breakdown' : '仅一个报告分部，无进一步拆分')
      : (en ? 'This quarterly breakdown is not disclosed' : '本期未披露该项细分');
  }
  if (/unsupported|not-supported|missing-axis|unparsed|ambiguous|conflict|reconciliation|invalid-xbrl|missing-quarter/.test(reason || '')) {
    return en ? 'Official filing found; this breakdown is not yet verified' : '已找到官方文件，此项细分尚未解析确认';
  }
  if (status === 'pending') return en ? 'Official breakdown is syncing' : '官方细分数据同步中';
  return en ? 'No verified breakdown is available yet' : '暂未取得可验证的细分数据';
}
