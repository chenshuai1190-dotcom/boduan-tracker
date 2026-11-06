import { normalizeVixMonthlyRows, buildInversionAnnotations, getInversionSegmentLabel, getInversionNormalizationLabel } from './vixMonthlyInversion.js';
import { marketTextHexColor } from './marketColorMode.js';
import { getVixRiskColor, getVixObservationColor, VIX_TERM_CHART_COLORS } from './vixRiskPalette.js';
import { nextVixComparisonSession } from './vixComparisonSession.js';

// Local drawing only, at the same width as the mobile monthly report. Values,
// calendar gaps and risk classifications belong to the supplied report. This
// renderer does not fetch data, read accounts/storage or initiate sharing.
export const VIX_MOBILE_SHARE_WIDTH = 1170;
const SCALE = 3;
const WIDTH = 390;
const PAD = 18;
const RIGHT = WIDTH - PAD;
const CONTENT = WIDTH - PAD * 2;
const TABLE_TOP = 343;
const TABLE_HEADER_HEIGHT = 45;
const ROW_HEIGHT = 48;
const FOOTER_HEIGHT = 140;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Segoe UI", sans-serif';
const C = Object.freeze({
  background: '#0a0d12', text: '#e1e5eb', row: '#cbd4df', date: '#9daabc',
  muted: '#8993a3', faint: '#758295', divider: '#ffffff0b', stripe: '#14203226',
});
const RISKS = Object.freeze({
  LOW_VOLATILITY: '低波动', NORMAL: '常态波动', ELEVATED: '波动升高',
  HIGH_STRESS: '高压状态', EXTREME_STRESS: '极端压力', UNKNOWN: '待补齐',
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0 ? value : null;
const fmt = (value, digits = 2) => finite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pct = value => {
  if (!finite(value)) return '—';
  const rounded = Number(value.toFixed(2));
  return `${rounded > 0 ? '+' : rounded < 0 ? '-' : ''}${fmt(Math.abs(rounded))}%`;
};
const shortDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? value.slice(5).replace('-', '/') : '—';
const color = (value, mode) => finite(value) ? value === 0 ? C.row : marketTextHexColor(value, mode) : '#717d8c';

function text(ctx, value, x, y, size = 11, fill = C.text, { align = 'left', weight = 400, maxWidth } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillStyle = fill;
  // Canvas maxWidth is only a last-resort fit for an unusually long numeric
  // value. Ordinary values use the same unscaled sizes as the mobile page.
  if (maxWidth && ctx.measureText(String(value ?? '—')).width > maxWidth) ctx.fillText(String(value ?? '—'), x, y, maxWidth);
  else ctx.fillText(String(value ?? '—'), x, y);
}
function line(ctx, x1, y1, x2, y2, fill = C.divider, width = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.stroke();
}
function wrapped(ctx, value, x, y, width, size = 10, fill = C.faint, leading = 18) {
  ctx.font = `400 ${size}px ${FONT}`;
  let row = ''; let top = y;
  for (const char of String(value)) {
    if (row && ctx.measureText(row + char).width > width) { text(ctx, row, x, top, size, fill); row = ''; top += leading; }
    row += char;
  }
  if (row) text(ctx, row, x, top, size, fill);
  return top + leading;
}

function drawHeading(ctx, report, rows, tableTop, mode, view = 'daily', preview = false) {
  text(ctx, '市场月报', WIDTH / 2, 25, 16, C.text, { align: 'center', weight: 500 });
  if (preview) text(ctx, '本地设计预览', PAD, 61, 10, '#717c8d');
  const match = /^(\d{4})-(\d{2})$/.exec(report.month || '');
  text(ctx, match ? `${match[1]} 年 ${Number(match[2])} 月` : '市场月报', WIDTH / 2, 98, 26, C.text, { align: 'center' });
  const status = report.status === 'complete' ? '完整月份' : report.status === 'in_progress' ? '本月进行中' : '部分数据';
  text(ctx, `${status}  ·  ${fmt(report.observedSessions, 0)} / ${fmt(report.expectedSessions, 0)} 个交易日  ·  截至 ${shortDate(report.asOfDate)}`,
    WIDTH / 2, 140, 10, '#7d899a', { align: 'center', maxWidth: CONTENT });

  text(ctx, '总览', PAD + 2, 178, 13, view === 'overview' ? '#dce3ec' : '#7b8798');
  text(ctx, '每日明细', PAD + 56, 178, 13, view === 'daily' ? '#dce3ec' : '#7b8798');
  line(ctx, PAD, 203, RIGHT, 203);
  line(ctx, PAD + (view === 'daily' ? 56 : 2), 203, PAD + (view === 'daily' ? 108 : 28), 203, '#a9b9cc', 2);

  const summary = report.summary || {};
  const centers = [PAD + CONTENT / 6, WIDTH / 2, RIGHT - CONTENT / 6];
  const period = report.status === 'complete' ? '月涨跌' : '月内涨跌';
  for (const [symbol, x] of [['SPY', centers[0]], ['QQQ', centers[1]]]) {
    const value = summary[symbol]?.monthlyChangePct;
    text(ctx, `${symbol} ${period}`, x, 229, 11, '#8d98a9', { align: 'center' });
    text(ctx, pct(value), x, 252, 25, color(value, mode), { align: 'center', maxWidth: 112 });
  }
  const peakRisk = rows.find(row => row.date === summary.vixMax?.date)?.currentRiskLevel;
  text(ctx, 'VIX 最高收盘', centers[2], 229, 11, '#8d98a9', { align: 'center' });
  text(ctx, fmt(positive(summary.vixMax?.value)), centers[2], 252, 25, getVixObservationColor(peakRisk, '#dba77b'), { align: 'center', maxWidth: 112 });
  text(ctx, shortDate(summary.vixMax?.date), centers[2], 282, 10, '#778497', { align: 'center' });
  for (const x of [PAD + CONTENT / 3, PAD + CONTENT * 2 / 3]) line(ctx, x, 228, x, 291, '#ffffff08');

  if (report.status === 'partial') {
    ctx.fillStyle = '#c2b28e07'; ctx.fillRect(PAD, 307, CONTENT, 62);
    const tail = report.cutoffDate && (!report.asOfDate || report.asOfDate < report.cutoffDate) ? `待补齐至 ${report.cutoffDate}。` : '';
    wrapped(ctx, `这个月的数据尚未完整。缺失读数保留为空，无法完整计算的统计显示 —。${tail}`, PAD + 12, 316, CONTENT - 24, 11, '#c2b28e', 17);
  }
  if (view === 'daily') text(ctx, '当日涨跌 · 相对上一交易日', PAD, tableTop - 23, 10, '#7c899e');
}

// Mirrors the phone grid: 42 / 42 / 44 / 74 / 74 / 58, with 4px gaps.
const COLUMNS = [
  { label: '日期', left: 18, right: 60, width: 42 },
  { label: 'VIX', left: 64, right: 106, width: 42 },
  { label: '比率', left: 110, right: 154, width: 44 },
  { label: 'SPY', left: 158, right: 232, width: 74 },
  { label: 'QQQ', left: 236, right: 310, width: 74 },
  { label: '风险', left: 314, right: 372, width: 58 },
];
function drawTable(ctx, rows, top, mode) {
  COLUMNS.forEach((column, index) => {
    const position = index === 0 ? column.left : column.right;
    const align = index === 0 ? 'left' : 'right';
    text(ctx, column.label, position, top + 7, 10, '#8491a5', { align });
    if (index === 3 || index === 4) text(ctx, '日涨跌', position, top + 24, 10, '#657288', { align });
  });
  line(ctx, PAD, top + TABLE_HEADER_HEIGHT, RIGHT, top + TABLE_HEADER_HEIGHT, '#ffffff0d');
  rows.forEach((row, index) => {
    const rowTop = top + TABLE_HEADER_HEIGHT + index * ROW_HEIGHT;
    if (index % 2 === 1) { ctx.fillStyle = C.stripe; ctx.fillRect(PAD, rowTop, CONTENT, ROW_HEIGHT); }
    const values = [shortDate(row.date), fmt(positive(row.VIX)), fmt(positive(row.ratio), 3), pct(row.prices?.SPY?.dailyChangePct), pct(row.prices?.QQQ?.dailyChangePct), RISKS[row.currentRiskLevel] || RISKS.UNKNOWN];
    const fills = [C.date, C.row, C.row, color(row.prices?.SPY?.dailyChangePct, mode), color(row.prices?.QQQ?.dailyChangePct, mode), getVixRiskColor(row.currentRiskLevel)];
    values.forEach((value, columnIndex) => {
      const column = COLUMNS[columnIndex];
      text(ctx, value, columnIndex === 0 ? column.left : column.right, rowTop + 17, columnIndex === 5 ? 10 : 11.5, fills[columnIndex],
        { align: columnIndex === 0 ? 'left' : 'right', maxWidth: column.width });
    });
    line(ctx, PAD, rowTop + ROW_HEIGHT, RIGHT, rowTop + ROW_HEIGHT, '#ffffff07');
  });
  if (!rows.length) text(ctx, '该月暂无可用收盘数据', WIDTH / 2, top + TABLE_HEADER_HEIGHT + 38, 13, C.muted, { align: 'center' });
}
function drawFooter(ctx, report, top, preview = false) {
  let y = top + 26;
  y = wrapped(ctx, 'SPY / QQQ 使用复权收盘；横轴按交易日排列。', PAD, y, CONTENT);
  y = wrapped(ctx, '按当日收盘回放当前候选规则，不代表当时信号，也不证明预测能力。', PAD, y + 5, CONTENT);
  text(ctx, 'Cboe · EODHD', PAD, y + 14, 10, '#68778e');
  text(ctx, 'QUOTE / 市场观察', RIGHT, y + 14, 10, '#68778e', { align: 'right' });
  text(ctx, `${preview ? '已核验历史快照 · 本地设计 · 截至' : '数据截至'} ${report.asOfDate || '—'}`, PAD, y + 37, 9, '#68778e', { maxWidth: CONTENT });
}

/** One complete month, at phone width. The caller owns download and URLs. */
export async function renderVixDailyMobileShare(report, { marketColorMode, preview = false } = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('日报数据不可用');
  if (typeof document === 'undefined') throw new Error('日报图片需要浏览器 Canvas');
  const rows = normalizeVixMonthlyRows(report);
  const tableTop = TABLE_TOP + (report.status === 'partial' ? 78 : 0);
  const bodyHeight = Math.max(rows.length * ROW_HEIGHT, 96);
  const footerTop = tableTop + TABLE_HEADER_HEIGHT + bodyHeight;
  const canvas = document.createElement('canvas');
  canvas.width = VIX_MOBILE_SHARE_WIDTH; canvas.height = (footerTop + FOOTER_HEIGHT) * SCALE;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法生成日报图片');
    ctx.scale(SCALE, SCALE); ctx.fillStyle = C.background;
    ctx.fillRect(0, 0, WIDTH, canvas.height / SCALE);
    drawHeading(ctx, report, rows, tableTop, marketColorMode, 'daily', preview);
    drawTable(ctx, rows, tableTop, marketColorMode);
    drawFooter(ctx, report, footerTop, preview);
    return await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('日报图片生成失败')), 'image/png'));
  } finally { canvas.width = 0; canvas.height = 0; }
}

const CHART_COLORS = Object.freeze({ SPY: '#78ace8', QQQ: '#b79be5', VIX: '#dba77b', VIX3M: '#8fa1b6', ratio: VIX_TERM_CHART_COLORS.line });
const seriesValue = (row, key) => key === 'SPY' || key === 'QQQ' ? row?.prices?.[key]?.cumulativeChangePct : positive(row?.[key]);
const seriesColor = (key, row) => key === 'VIX' ? getVixObservationColor(row?.currentRiskLevel, CHART_COLORS.VIX) : CHART_COLORS[key];
const tickNumber = (value, step, minimumDigits = 0) => {
  let digits = minimumDigits;
  while (digits < 6 && Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) > 1e-7) digits++;
  const rounded = Number(value.toFixed(digits));
  return fmt(rounded === 0 ? 0 : rounded, digits);
};

// Only the drawing scale is derived here; returns, thresholds, durations and
// classifications remain the original report's values and shared annotations.
function chartScale(values, type) {
  const readings = values.filter(finite);
  if (!readings.length) return { min: type === 'ratio' ? .8 : 0, max: type === 'ratio' ? 1.2 : type === 'return' ? 4 : 40, step: type === 'ratio' ? .1 : type === 'return' ? 1 : 10, empty: true };
  const included = [...readings, ...(type === 'ratio' ? [1, 1.1] : type === 'return' ? [0] : [])];
  let low = Math.min(...included); let high = Math.max(...included);
  const span = Math.max(high - low, Math.abs(high) * .08, .02);
  low -= span * .12; high += span * .12;
  const magnitude = 10 ** Math.floor(Math.log10((high - low) / 4));
  const step = [1, 2, 2.5, 5, 10].find(candidate => candidate >= (high - low) / 4 / magnitude) * magnitude;
  const min = Math.floor(low / step) * step; const max = Math.ceil(high / step) * step;
  return { min, max: Math.max(max, min + step), step, empty: false };
}
function drawChart(ctx, rows, top, type, keys, annotations, mode) {
  const left = PAD + 35; const right = RIGHT - 12; const bottom = top + 156;
  const scale = chartScale(rows.flatMap(row => keys.map(key => seriesValue(row, key))), type);
  const x = index => left + (rows.length > 1 ? index / (rows.length - 1) : .5) * (right - left);
  const y = value => bottom - (value - scale.min) / (scale.max - scale.min) * (bottom - top);
  if (annotations) {
    const half = (right - left) / Math.max(rows.length - 1, 1) / 2;
    annotations.segments.forEach(segment => {
      const a = Math.max(left, x(segment.startIndex) - half); const b = Math.min(right, x(segment.endIndex) + half);
      ctx.fillStyle = VIX_TERM_CHART_COLORS.band; ctx.fillRect(a, top, Math.max(1, b - a), bottom - top);
    });
  }
  const steps = Math.min(8, Math.round((scale.max - scale.min) / scale.step));
  for (let index = 0; index <= steps; index++) {
    const tick = Number((scale.min + index * scale.step).toPrecision(12));
    line(ctx, left, y(tick), right, y(tick), tick === 0 ? '#75829840' : '#7582981c');
    const number = tickNumber(tick, scale.step, type === 'ratio' ? 2 : 0);
    const label = type === 'return' ? `${tick > 0 ? '+' : ''}${number}%` : number;
    text(ctx, label, left - 8, y(tick) - 5, 10, type === 'return' && tick !== 0 ? color(tick, mode) : '#778293', { align: 'right', maxWidth: 37 });
  }
  if (type === 'ratio') {
    for (const [threshold, stroke] of [[1, VIX_TERM_CHART_COLORS.threshold], [1.1, VIX_TERM_CHART_COLORS.secondaryThreshold]]) {
      ctx.setLineDash([3, 4]); line(ctx, left, y(threshold), right, y(threshold), stroke, .9); ctx.setLineDash([]);
    }
  }
  for (const key of keys) {
    let previous = null;
    rows.forEach((row, index) => {
      const value = seriesValue(row, key);
      if (!finite(value)) { previous = null; return; }
      const point = { x: x(index), y: y(value), color: seriesColor(key, row), date: row.date };
      if (previous && nextVixComparisonSession(previous.date) === point.date) {
        if (point.color === previous.color) line(ctx, previous.x, previous.y, point.x, point.y, point.color, 1.8);
        else {
          const mx = (point.x + previous.x) / 2; const my = (point.y + previous.y) / 2;
          line(ctx, previous.x, previous.y, mx, my, previous.color, 1.8);
          line(ctx, mx, my, point.x, point.y, point.color, 1.8);
        }
      }
      // Preserve isolated valid observations instead of silently dropping them.
      ctx.beginPath(); ctx.arc(point.x, point.y, 1.35, 0, Math.PI * 2); ctx.fillStyle = point.color; ctx.fill();
      previous = point;
    });
  }
  if (annotations) annotations.normalizations.forEach(event => {
    ctx.setLineDash([2, 4]); line(ctx, x(event.index), top, x(event.index), bottom, '#8796aa40', .7); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x(event.index), y(event.ratio), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = C.background; ctx.fill(); ctx.strokeStyle = VIX_TERM_CHART_COLORS.normalized; ctx.lineWidth = 1.4; ctx.stroke();
  });
  const indexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].filter(index => index >= 0 && rows[index]);
  indexes.forEach((index, position) => text(ctx, shortDate(rows[index].date), x(index), bottom + 12, 10, '#778293',
    { align: position === 0 ? 'left' : position === indexes.length - 1 ? 'right' : 'center' }));
  if (scale.empty) text(ctx, '这个月暂无可绘制的数据', (left + right) / 2, top + 70, 12, C.muted, { align: 'center' });
}
function drawChartSection(ctx, rows, top, config, annotations, mode) {
  const { number, title, subtitle, type, keys } = config;
  const focused = rows.at(-1);
  text(ctx, number, PAD, top + 2, 10, '#68788f');
  text(ctx, title, PAD + 24, top, 14, '#dce3ec');
  const legendLeft = type === 'ratio' ? 283 : 260;
  keys.forEach((key, index) => {
    const legendX = legendLeft + index * 60;
    line(ctx, legendX, top + 8, legendX + 11, top + 8, seriesColor(key, focused), 1.8);
    text(ctx, key === 'ratio' ? 'VIX / VIX3M' : key, legendX + 15, top + 3, 9, '#8491a5');
  });
  text(ctx, subtitle, PAD, top + 27, 10, '#7d899c', { maxWidth: CONTENT });
  keys.forEach((key, index) => {
    const left = PAD + index * 132; const value = seriesValue(focused, key);
    text(ctx, key === 'ratio' ? '比率' : key, left, top + 53, 10, seriesColor(key, focused));
    text(ctx, type === 'return' ? pct(value) : fmt(value, type === 'ratio' ? 4 : 2), left + (key === 'VIX3M' ? 42 : 31), top + 49, 15,
      type === 'return' ? color(value, mode) : seriesColor(key, focused), { maxWidth: 85 });
  });
  text(ctx, `${shortDate(focused?.date)} 收盘`, RIGHT, top + 54, 9, '#6f7f96', { align: 'right' });
  const featured = annotations?.current || annotations?.primarySegment;
  let chartTop = top + 88;
  if (featured) {
    text(ctx, getInversionSegmentLabel(featured, { includeStatus: false }), PAD, top + 78, 11, VIX_TERM_CHART_COLORS.inversionLabel);
    text(ctx, `${featured.carriedIn ? '承接上月 · ' : ''}${shortDate(featured.startDate)}—${shortDate(featured.endDate)}${featured.status === 'ongoing' ? ' · 仍在持续' : featured.status === 'interrupted' ? ' · 连续数据中断' : ''}`,
      PAD, top + 97, 10, C.muted, { maxWidth: CONTENT });
    chartTop += 48;
  }
  drawChart(ctx, rows, chartTop, type, keys, annotations, mode);
  let nextTop = chartTop + 198;
  if (annotations) {
    if (annotations.normalizations.length) {
      annotations.normalizations.forEach((event, index) => {
        const left = PAD + (index % 2) * 177; const y = nextTop + Math.floor(index / 2) * 22;
        ctx.beginPath(); ctx.arc(left + 4, y + 5, 2.8, 0, Math.PI * 2); ctx.strokeStyle = VIX_TERM_CHART_COLORS.normalized; ctx.lineWidth = 1; ctx.stroke();
        text(ctx, getInversionNormalizationLabel(event), left + 13, y, 10, VIX_TERM_CHART_COLORS.normalized);
      });
      nextTop += Math.ceil(annotations.normalizations.length / 2) * 22;
    } else {
      text(ctx, '暂无已确认解除记录；空缺不视为解除', PAD, nextTop, 10, C.faint);
      nextTop += 22;
    }
    nextTop += 8;
  }
  return nextTop;
}

/** Mobile overview of the complete report, with three vertically stacked plots. */
export async function renderVixOverviewMobileShare(report, { marketColorMode, preview = false } = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('月报数据不可用');
  if (typeof document === 'undefined') throw new Error('月报图片需要浏览器 Canvas');
  const rows = normalizeVixMonthlyRows(report);
  const annotations = buildInversionAnnotations({ ...report, rows });
  const featured = annotations.current || annotations.primarySegment;
  const chartTop = 322 + (report.status === 'partial' ? 78 : 0);
  const eventHeight = Math.max(1, Math.ceil(annotations.normalizations.length / 2)) * 22 + 8;
  const observationsTop = chartTop + 286 * 3 + (featured ? 48 : 0) + eventHeight;
  const footerTop = observationsTop + 91;
  const canvas = document.createElement('canvas');
  canvas.width = VIX_MOBILE_SHARE_WIDTH; canvas.height = (footerTop + FOOTER_HEIGHT) * SCALE;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法生成月报图片');
    ctx.scale(SCALE, SCALE); ctx.fillStyle = C.background; ctx.fillRect(0, 0, WIDTH, canvas.height / SCALE);
    drawHeading(ctx, report, rows, 0, marketColorMode, 'overview', preview);
    const configs = [
      { number: '01', title: '股价累计涨跌', subtitle: `相对 ${report.summary?.SPY?.baselineDate || '上月末'} 复权收盘`, type: 'return', keys: ['SPY', 'QQQ'] },
      { number: '02', title: '波动率水平', subtitle: 'VIX 与 VIX3M 同日收盘', type: 'volatility', keys: ['VIX', 'VIX3M'] },
      { number: '03', title: '期限比率', subtitle: '≥ 1.00 倒挂 · ≥ 1.10 深度倒挂', type: 'ratio', keys: ['ratio'] },
    ];
    let sectionTop = chartTop;
    configs.forEach(config => { sectionTop = drawChartSection(ctx, rows, sectionTop, config, config.type === 'ratio' ? annotations : null, marketColorMode); });
    line(ctx, PAD, observationsTop, RIGHT, observationsTop);
    [['高压及以上', report.summary?.highStressDays], ['倒挂交易日', report.summary?.inversionDays]].forEach(([label, value], index) => {
      const x = PAD + index * 183;
      text(ctx, label, x, observationsTop + 22, 11, C.muted);
      text(ctx, fmt(value, 0), x, observationsTop + 44, 23, '#d3dce8');
      text(ctx, `/ 应有 ${fmt(report.expectedSessions, 0)} 日`, x + 39, observationsTop + 54, 10, C.faint);
    });
    drawFooter(ctx, report, footerTop, preview);
    return await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('月报图片生成失败')), 'image/png'));
  } finally { canvas.width = 0; canvas.height = 0; }
}

/** Render a local PNG Blob. The caller owns download and system sharing. */
export async function renderVixMonthlyShare(report, type = 'overview', options = {}) {
  if (type !== 'overview' && type !== 'daily') throw new TypeError('不支持的月报分享图类型');
  return type === 'daily' ? renderVixDailyMobileShare(report, options) : renderVixOverviewMobileShare(report, options);
}

// Preserve the existing DEV caller name without maintaining two renderers.
export const renderVixMonthlySharePreview = renderVixMonthlyShare;
