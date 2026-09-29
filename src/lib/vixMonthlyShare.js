import { nextVixComparisonSession } from './vixComparisonSession.js';
import { marketTextHexColor } from './marketColorMode.js';
import { getVixRiskColor } from './vixRiskPalette.js';
import {
  buildInversionAnnotations,
  getInversionNormalizationLabel,
  getInversionSegmentLabel,
  normalizeVixMonthlyRows,
} from './vixMonthlyInversion.js';

// Local drawing only. The report owns all financial calculations; this
// renderer neither fetches data nor reads account, storage or sharing APIs.
const WIDTH = 1920;
const OVERVIEW_HEIGHT = 2720;
const PAD = 112;
const CONTENT = WIDTH - PAD * 2;
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const C = Object.freeze({
  background: '#0b1119', panel: '#131e2b', stripe: '#111b28', grid: '#263343',
  text: '#e6edf5', muted: '#8d9bad', faint: '#66768a', spy: '#79b4ff',
  qqq: '#b9a0ff', vix: '#ffae6c', vix3m: '#92a4bb', ratio: '#ed91a2',
  up: '#72d2b1', caution: '#d7ba69',
});
const RISK_LABELS = Object.freeze({
  LOW_VOLATILITY: '低波动',
  NORMAL: '常态波动',
  ELEVATED: '波动升高',
  HIGH_STRESS: '高压状态',
  EXTREME_STRESS: '极端压力',
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const number = (value, digits = 2) => finite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const percent = value => {
  if (!finite(value)) return '—';
  const rounded = Number(value.toFixed(2));
  return `${rounded > 0 ? '+' : rounded < 0 ? '-' : ''}${number(Math.abs(rounded))}%`;
};
const dateKey = value => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
};
const shortDate = value => dateKey(value) ? value.slice(5).replace('-', '/') : '—';
const fullDate = value => dateKey(value) ? value.replaceAll('-', '/') : '—';
const positive = value => finite(value) && value > 0 ? value : null;
const count = value => finite(value) && value >= 0 ? number(value, 0) : '—';
const signColor = (value, marketColorMode) => !finite(value) || value === 0 ? C.muted : marketTextHexColor(value, marketColorMode);
const tickNumber = (value, step, minimumDigits = 0) => {
  let digits = minimumDigits;
  while (digits < 6 && Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) > 1e-7) digits += 1;
  const rounded = Number(value.toFixed(digits));
  return number(rounded === 0 ? 0 : rounded, digits);
};

function text(ctx, value, x, y, size = 30, color = C.text, { align = 'left', weight = 400, maxWidth } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  const label = String(value ?? '—');
  if (maxWidth && ctx.measureText(label).width > maxWidth) {
    let end = label.length;
    while (end > 0 && ctx.measureText(`${label.slice(0, end)}…`).width > maxWidth) end -= 1;
    ctx.fillText(`${label.slice(0, end)}…`, x, y);
  } else ctx.fillText(label, x, y);
}
function wrapped(ctx, value, x, y, width, size = 27, color = C.muted, lineHeight = 42) {
  ctx.font = `400 ${size}px ${FONT}`;
  let line = '';
  let top = y;
  for (const character of String(value)) {
    if (character === '\n' || (line && ctx.measureText(line + character).width > width)) {
      text(ctx, line, x, top, size, color);
      top += lineHeight;
      line = character === '\n' ? '' : character;
    } else line += character;
  }
  if (line) { text(ctx, line, x, top, size, color); top += lineHeight; }
  return top;
}
function roundedRect(ctx, x, y, width, height, color, radius = 16) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function line(ctx, x1, y1, x2, y2, color = C.grid, width = 2, dash = []) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}
function legend(ctx, items, x, y) {
  for (const item of items) {
    line(ctx, x, y + 18, x + 48, y + 18, item.color, 5);
    text(ctx, item.label, x + 60, y, 30, C.muted);
    x += item.width || 235;
  }
}
function monthTitle(report) {
  if (typeof report.monthLabel === 'string' && report.monthLabel.trim()) return report.monthLabel.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(report.month || '');
  return match ? `${match[1]} 年 ${Number(match[2])} 月` : '市场月报';
}
function reportStatus(report) {
  if (report.status === 'in_progress') return { label: '截至月 · 尚未结束', color: C.spy, period: '本月至今' };
  if (report.status === 'partial') return { label: '数据不齐 · 缺值保留', color: C.caution, period: '月内已记录' };
  if (report.status === 'complete') return { label: '完整月 · 历史回放', color: C.muted, period: '全月' };
  return { label: '数据状态待确认', color: C.caution, period: '月内已记录' };
}
function header(ctx, report, type) {
  const status = reportStatus(report);
  text(ctx, `QUOTE  /  ${type === 'daily' ? '历史市场观察 · 每日明细' : '历史市场观察'}`, PAD, 66, 30, C.muted);
  text(ctx, status.label, WIDTH - PAD, 66, 29, status.color, { align: 'right' });
  text(ctx, `${monthTitle(report)} · ${type === 'daily' ? '每日涨跌与风险' : '市场走势总览'}`, PAD, 151, 71, C.text,
    { maxWidth: CONTENT });
  text(ctx, `VIX 风险 × SPY / QQQ 走势  ·  已记录 ${count(report.observedSessions)} / ${count(report.expectedSessions)} 个交易日`,
    PAD, 259, 36, C.muted, { maxWidth: CONTENT });
}
function baselineText(report, symbol) {
  const summary = report.summary?.[symbol];
  const close = positive(summary?.baselineClose);
  return `${symbol}  ${fullDate(summary?.baselineDate)}  ·  $${close === null ? '—' : number(close, 4)}`;
}
function footer(ctx, report, y) {
  line(ctx, PAD, y, WIDTH - PAD, y, C.grid);
  text(ctx, `月度比较基准 · 上月最后完成交易日复权收盘`, PAD, y + 28, 28, C.muted);
  text(ctx, baselineText(report, 'SPY'), PAD, y + 73, 28, C.text);
  text(ctx, baselineText(report, 'QQQ'), WIDTH / 2 + 20, y + 73, 28, C.text);
  text(ctx, `历史回放 · 现行规则按当日收盘计算，非当时实时信号；不证明预测能力。`, PAD, y + 124, 26, C.muted,
    { maxWidth: CONTENT });
  text(ctx, `SPY / QQQ 使用复权收盘；日涨跌比较前一交易日，缺值显示 — 并中断曲线。`, PAD, y + 167, 26, C.muted,
    { maxWidth: CONTENT });
  text(ctx, `来源：Cboe、EODHD  ·  数据截至 ${fullDate(report.asOfDate)}`, PAD, y + 214, 27, C.muted);
  text(ctx, 'QUOTE', WIDTH - PAD, y + 214, 27, C.faint, { align: 'right' });
}
function niceScale(values, { include = [], fallback = [0, 1] } = {}) {
  const finiteValues = values.filter(finite);
  const all = [...finiteValues, ...include];
  if (!finiteValues.length) return { min: fallback[0], max: fallback[1], step: (fallback[1] - fallback[0]) / 4, empty: true };
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const span = Math.max(hi - lo, Math.abs(hi) * .08, .02);
  lo -= span * .12;
  hi += span * .12;
  const magnitude = 10 ** Math.floor(Math.log10((hi - lo) / 4));
  const normalized = (hi - lo) / 4 / magnitude;
  const step = [1, 2, 2.5, 5, 10].find(value => value >= normalized) * magnitude;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  return { min, max: Math.max(max, min + step), step, empty: false };
}
function plot(ctx, rows, { top, height, series, formatTick, tickColor, include, fallback, thresholds = [], drawBackground, annotate }) {
  const left = PAD + 92;
  const right = WIDTH - PAD - 22;
  const bottom = top + height;
  const scale = niceScale(rows.flatMap(row => series.map(item => item.value(row))), { include, fallback });
  const x = index => left + (rows.length > 1 ? index / (rows.length - 1) : .5) * (right - left);
  const y = value => bottom - (value - scale.min) / (scale.max - scale.min) * height;
  const band = thresholds.find(item => item.fillAbove);
  if (band && band.value < scale.max) {
    ctx.fillStyle = band.fillAbove;
    ctx.fillRect(left, top, right - left, Math.max(0, y(Math.max(scale.min, band.value)) - top));
  }
  if (drawBackground) drawBackground({ x, y, left, right, top, bottom });
  const steps = Math.min(10, Math.round((scale.max - scale.min) / scale.step));
  for (let index = 0; index <= steps; index += 1) {
    const value = scale.min + index * scale.step;
    const py = y(value);
    line(ctx, left, py, right, py, Math.abs(value) < 1e-9 ? '#526174' : C.grid, Math.abs(value) < 1e-9 ? 2.5 : 1.5);
    text(ctx, formatTick(value, scale.step), left - 22, py - 17, 29, tickColor ? tickColor(value) : C.muted, { align: 'right' });
  }
  for (const threshold of thresholds) {
    if (threshold.value < scale.min || threshold.value > scale.max) continue;
    line(ctx, left, y(threshold.value), right, y(threshold.value), threshold.color || C.ratio, 2, [9, 8]);
  }
  for (const item of series) {
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width || 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let previousDate = '';
    let penDown = false;
    rows.forEach((row, index) => {
      const value = item.value(row);
      const date = dateKey(row.date);
      if (!finite(value) || !date) { penDown = false; previousDate = ''; return; }
      if (penDown && nextVixComparisonSession(previousDate) === date) ctx.lineTo(x(index), y(value));
      else ctx.moveTo(x(index), y(value));
      penDown = true;
      previousDate = date;
    });
    ctx.stroke();
    for (const [index, row] of rows.entries()) {
      const value = item.value(row);
      if (!finite(value) || !dateKey(row.date)) continue;
      ctx.beginPath(); ctx.arc(x(index), y(value), 4.2, 0, Math.PI * 2);
      ctx.fillStyle = item.color; ctx.fill();
    }
  }
  const dateIndexes = [...new Set(Array.from({ length: Math.min(5, rows.length) }, (_, index) => (
    Math.round(index * (rows.length - 1) / Math.max(1, Math.min(5, rows.length) - 1))
  )))];
  for (const index of dateIndexes) text(ctx, shortDate(rows[index]?.date), x(index), bottom + 24, 30, C.muted, { align: 'center' });
  if (scale.empty) text(ctx, '数据不足，暂无可用曲线', (left + right) / 2, top + height / 2 - 20, 36, C.muted, { align: 'center' });
  if (!scale.empty && annotate) annotate({ x, y, left, right, top, bottom });
}
function sectionTitle(ctx, title, detail, y, items) {
  text(ctx, title, PAD, y, 46);
  if (items) legend(ctx, items, WIDTH - PAD - 500, y + 3);
  text(ctx, detail, PAD, y + 75, 29, C.muted, { maxWidth: CONTENT });
}
function drawInversionChart(ctx, report, rows) {
  const annotations = buildInversionAnnotations({ ...report, rows }, { throughDate: report.cutoffDate ?? report.asOfDate });
  const { segments, normalizations, primarySegment } = annotations;
  const primaryNormalization = normalizations.find(event => event.date === primarySegment?.normalizedDate);
  const secondaryNormalizations = normalizations.filter(event => event !== primaryNormalization);
  const leftSummaryWidth = primaryNormalization ? CONTENT - 390 : CONTENT;
  const segmentLabel = primarySegment ? `最长已知段 · ${getInversionSegmentLabel(primarySegment)}` : '暂无可标注的连续倒挂区间';
  let summarySize = 31;
  ctx.font = `400 ${summarySize}px ${FONT}`;
  while (summarySize > 25 && ctx.measureText(segmentLabel).width > leftSummaryWidth - 42) {
    summarySize -= 1;
    ctx.font = `400 ${summarySize}px ${FONT}`;
  }
  roundedRect(ctx, PAD, 2001, 18, 28, 'rgba(237,145,162,0.45)', 4);
  text(ctx, segmentLabel, PAD + 34, 1998, summarySize, primarySegment ? C.ratio : C.muted,
    { maxWidth: leftSummaryWidth - 34 });
  if (primaryNormalization) text(ctx, getInversionNormalizationLabel(primaryNormalization), WIDTH - PAD, 1998, 31, C.up,
    { align: 'right', maxWidth: 365 });
  plot(ctx, rows, {
    top: 2077, height: 242, include: [1, 1.1], fallback: [.8, 1.2],
    formatTick: (value, step) => tickNumber(value, step, 2),
    thresholds: [{ value: 1, color: C.ratio }, { value: 1.1, color: '#916170' }],
    series: [{ color: C.ratio, value: row => positive(row.ratio) }],
    drawBackground: ({ x, left, right, top, bottom }) => {
      const halfSessionWidth = rows.length > 1 ? (right - left) / (rows.length - 1) / 2 : 24;
      for (const segment of segments) {
        const start = Math.max(left, x(segment.startIndex) - halfSessionWidth);
        const end = Math.min(right, x(segment.endIndex) + halfSessionWidth);
        ctx.fillStyle = segment === primarySegment ? 'rgba(237,145,162,0.14)' : 'rgba(237,145,162,0.09)';
        ctx.fillRect(start, top, end - start, bottom - top);
        line(ctx, start, top + 1, end, top + 1, 'rgba(237,145,162,0.5)', 2);
      }
    },
    annotate: ({ x, y, top, bottom }) => {
      for (const event of normalizations) {
        const major = event === primaryNormalization;
        const px = x(event.index);
        const py = y(event.ratio);
        line(ctx, px, top, px, bottom, major ? '#527e72' : '#355a50', major ? 2.5 : 1.5, [6, 7]);
        ctx.beginPath(); ctx.arc(px, py, major ? 9 : 6.5, 0, Math.PI * 2);
        ctx.fillStyle = C.background; ctx.fill();
        ctx.strokeStyle = C.up; ctx.lineWidth = major ? 3 : 2; ctx.stroke();
      }
    },
  });
  const notes = secondaryNormalizations.length
    ? `${primaryNormalization ? '其他解除日' : '已确认解除日'}：${secondaryNormalizations.map(event => shortDate(event.date)).join('、')}  ·  空缺不视为解除`
    : normalizations.length ? '绿色标记：收盘比率回到 1.00 以下；空缺不视为解除' : '暂无已确认解除记录；空缺不视为解除';
  text(ctx, notes, PAD, 2399, 25, C.muted, { maxWidth: CONTENT });
}
function drawOverview(ctx, report, rows, marketColorMode) {
  header(ctx, report, 'overview');
  const period = reportStatus(report).period;
  const summary = report.summary || {};
  const gap = 36;
  const cardWidth = (CONTENT - gap * 2) / 3;
  const cards = [
    { label: `SPY ${period}涨跌`, value: percent(summary.SPY?.monthlyChangePct), color: signColor(summary.SPY?.monthlyChangePct, marketColorMode) },
    { label: `QQQ ${period}涨跌`, value: percent(summary.QQQ?.monthlyChangePct), color: signColor(summary.QQQ?.monthlyChangePct, marketColorMode) },
    { label: `VIX 月内最高收盘 · ${shortDate(summary.vixMax?.date)}`, value: number(positive(summary.vixMax?.value)), color: C.vix },
  ];
  cards.forEach((card, index) => {
    const x = PAD + index * (cardWidth + gap);
    roundedRect(ctx, x, 348, cardWidth, 194, C.panel);
    text(ctx, card.label, x + 34, 388, 29, C.muted, { maxWidth: cardWidth - 66 });
    text(ctx, card.value, x + 34, 454, 64, card.color);
  });
  sectionTitle(ctx, '01  股价累计涨跌', '相对月度比较基准；SPY / QQQ 使用复权收盘', 600,
    [{ label: 'SPY', color: C.spy }, { label: 'QQQ', color: C.qqq }]);
  plot(ctx, rows, { top: 774, height: 368, include: [0], fallback: [-1, 1],
    formatTick: (value, step) => `${value > step / 2 ? '+' : ''}${tickNumber(value, step)}%`,
    tickColor: value => signColor(value, marketColorMode),
    series: [
      { color: C.spy, value: row => finite(row.prices?.SPY?.cumulativeChangePct) ? row.prices.SPY.cumulativeChangePct : null },
      { color: C.qqq, value: row => finite(row.prices?.QQQ?.cumulativeChangePct) ? row.prices.QQQ.cumulativeChangePct : null },
    ],
  });
  sectionTitle(ctx, '02  波动率水平', '收盘指数值；当前风险与股价当日涨跌分别观察', 1243,
    [{ label: 'VIX', color: C.vix }, { label: 'VIX3M', color: C.vix3m }]);
  plot(ctx, rows, { top: 1414, height: 358, fallback: [0, 40], formatTick: tickNumber,
    series: [{ color: C.vix, value: row => positive(row.VIX) }, { color: C.vix3m, width: 4, value: row => positive(row.VIX3M) }],
    annotate: ({ x, y, top }) => {
      const index = rows.findIndex(row => row.date === summary.vixMax?.date && positive(row.VIX) !== null);
      if (index < 0 || !finite(summary.vixMax?.value)) return;
      const value = rows[index].VIX;
      const labelY = Math.max(top + 2, y(value) - 64);
      line(ctx, x(index), y(value) - 7, x(index), labelY + 40, C.vix, 2);
      const label = `${shortDate(rows[index].date)}  ${number(value)}`;
      ctx.font = `400 32px ${FONT}`;
      const labelWidth = ctx.measureText(label).width + 20;
      roundedRect(ctx, x(index) - labelWidth / 2, labelY - 6, labelWidth, 44, C.background, 4);
      text(ctx, label, x(index), labelY, 32, C.vix, { align: 'center' });
    },
  });
  sectionTitle(ctx, '03  期限比率  VIX ÷ VIX3M',
    `月内累计倒挂 ${count(summary.inversionDays)} 日 · 高压及以上 ${count(summary.highStressDays)} 日  ·  ≥ 1.00 倒挂 / ≥ 1.10 深度倒挂`, 1878);
  drawInversionChart(ctx, report, rows);
  footer(ctx, report, 2446);
}
function drawDaily(ctx, report, rows, height, marketColorMode) {
  header(ctx, report, 'daily');
  const summary = report.summary || {};
  roundedRect(ctx, PAD, 348, CONTENT, 112, C.panel);
  text(ctx, `${reportStatus(report).period}累计`, PAD + 30, 386, 30, C.muted);
  for (const [symbol, x, color] of [['SPY', PAD + 345, C.spy], ['QQQ', PAD + 850, C.qqq]]) {
    text(ctx, symbol, x, 377, 44, color);
    const labelWidth = ctx.measureText(`${symbol}  `).width;
    const change = summary[symbol]?.monthlyChangePct;
    text(ctx, percent(change), x + labelWidth, 377, 44, signColor(change, marketColorMode));
  }
  text(ctx, `高压及以上 ${count(summary.highStressDays)} 日`, WIDTH - PAD - 28, 389, 28, C.muted, { align: 'right' });
  const columns = [
    { label: '日期', x: PAD + 25, align: 'left' },
    { label: 'VIX', x: PAD + 330, align: 'right' },
    { label: 'VIX3M', x: PAD + 555, align: 'right' },
    { label: '期限比率', x: PAD + 805, align: 'right' },
    { label: 'SPY', x: PAD + 1095, align: 'right', note: '日涨跌' },
    { label: 'QQQ', x: PAD + 1360, align: 'right', note: '日涨跌' },
    { label: '当前风险', x: WIDTH - PAD - 26, align: 'right' },
  ];
  for (const column of columns) {
    text(ctx, column.label, column.x, 541, 32, C.muted, { align: column.align });
    if (column.note) text(ctx, column.note, column.x, 589, 25, C.faint, { align: column.align });
  }
  const rowTop = 648;
  const rowHeight = 74;
  rows.forEach((row, index) => {
    const y = rowTop + index * rowHeight;
    if (index % 2 === 0) roundedRect(ctx, PAD - 10, y - 8, CONTENT + 20, 68, C.stripe, 5);
    const riskLabel = RISK_LABELS[row.currentRiskLevel] || '—';
    const riskColor = getVixRiskColor(row.currentRiskLevel);
    if (row.currentRiskLevel === 'EXTREME_STRESS') line(ctx, PAD - 10, y - 5, PAD - 10, y + 53, riskColor, 4);
    text(ctx, shortDate(row.date), columns[0].x, y + 5, 38);
    text(ctx, number(positive(row.VIX)), columns[1].x, y + 5, 38, C.text, { align: 'right' });
    text(ctx, number(positive(row.VIX3M)), columns[2].x, y + 5, 38, C.vix3m, { align: 'right' });
    text(ctx, number(positive(row.ratio), 4), columns[3].x, y + 5, 38, C.text, { align: 'right' });
    for (const [symbol, column] of [['SPY', columns[4]], ['QQQ', columns[5]]]) {
      const change = row.prices?.[symbol]?.dailyChangePct;
      text(ctx, percent(change), column.x, y + 5, 39, signColor(change, marketColorMode), { align: 'right' });
    }
    text(ctx, riskLabel, columns[6].x, y + 8, 32, riskColor, { align: 'right' });
  });
  if (!rows.length) text(ctx, '该月暂无已记录的完成交易日数据', WIDTH / 2, rowTop + 200, 38, C.muted, { align: 'center' });
  const noteY = Math.max(rowTop + rows.length * rowHeight + 40, height - 490);
  roundedRect(ctx, PAD, noteY, CONTENT, 150, C.panel);
  text(ctx, '当日涨跌与当前风险分别观察', PAD + 34, noteY + 27, 36);
  wrapped(ctx, '股价上涨不代表压力解除；价格止跌或反弹不表示市场底部已经形成。', PAD + 34, noteY + 83, CONTENT - 68, 28);
  footer(ctx, report, height - 276);
}

/** Render only a local PNG Blob. The caller owns download and system sharing. */
export async function renderVixMonthlyShare(report, type = 'overview', { marketColorMode } = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('月报数据不可用');
  if (type !== 'overview' && type !== 'daily') throw new TypeError('不支持的月报分享图类型');
  if (typeof document === 'undefined') throw new Error('月报分享图需要浏览器 Canvas');
  const rows = normalizeVixMonthlyRows(report);
  const height = type === 'overview' ? OVERVIEW_HEIGHT : Math.max(OVERVIEW_HEIGHT, 648 + rows.length * 74 + 530);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法生成月报分享图');
    ctx.fillStyle = C.background;
    ctx.fillRect(0, 0, WIDTH, height);
    if (type === 'daily') drawDaily(ctx, report, rows, height, marketColorMode);
    else drawOverview(ctx, report, rows, marketColorMode);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('月报图片生成失败')), 'image/png');
    });
    return blob;
  } finally {
    // The detached backing store can be large on iOS; release it after encoding.
    canvas.width = 0;
    canvas.height = 0;
  }
}

// Preserve the DEV caller name without maintaining a second renderer.
export const renderVixMonthlySharePreview = renderVixMonthlyShare;
