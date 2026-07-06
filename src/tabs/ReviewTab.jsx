import React from 'react';
import { t } from '../lib/i18n.js';
import { marketTextClass } from '../lib/marketColorMode.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const REVIEW_GOLD = '#f6b54b';
const REVIEW_BG = '#05070b';
const REVIEW_CARD = '#0b0f14';
const REVIEW_PANEL = '#0b0f16';

const DISCIPLINE_LEVELS = [
  { level: '🟢', label: '一般', dotColor: '#18d66b', ringColor: 'rgba(24, 214, 107, 0.12)', ringBorder: 'rgba(24, 214, 107, 0.14)' },
  { level: '🔺', label: '重要', dotColor: '#ff0f35', ringColor: 'rgba(255, 15, 53, 0.13)', ringBorder: 'rgba(255, 15, 53, 0.15)' },
  { level: '📣', label: '强调', dotColor: '#ffa42b', ringColor: 'rgba(255, 164, 43, 0.13)', ringBorder: 'rgba(255, 164, 43, 0.16)' },
  { level: '❗', label: '警告', dotColor: '#ef0018', ringColor: 'rgba(239, 0, 24, 0.13)', ringBorder: 'rgba(239, 0, 24, 0.16)' },
];

const US_FLAG_STRIPES = Array.from({ length: 8 }, (_, index) => {
  const y = 8 + index * 32;
  const h = 17;
  return {
    color: index % 2 === 0 ? '#bf1e3a' : '#f8fafc',
    opacity: index % 2 === 0 ? 0.72 : 0.5,
    d: [
      `M -44 ${y}`,
      `C 40 ${y - 24} 98 ${y + 24} 178 ${y + 2}`,
      `C 250 ${y - 18} 306 ${y - 7} 416 ${y - 26}`,
      `L 416 ${y + h + 4}`,
      `C 308 ${y + h - 14} 252 ${y + h + 4} 178 ${y + h + 2}`,
      `C 96 ${y + h + 30} 38 ${y + h - 20} -44 ${y + h + 8}`,
      'Z',
    ].join(' '),
  };
});

const US_FLAG_STARS = Array.from({ length: 30 }, (_, index) => ({
  x: 28 + (index % 6) * 28 + (Math.floor(index / 6) % 2) * 12,
  y: 34 + Math.floor(index / 6) * 28,
  rotation: index % 2 === 0 ? 0 : 18,
}));

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtMoney(value, digits = 0) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function levelMeta(level) {
  return DISCIPLINE_LEVELS.find((item) => item.level === level) || DISCIPLINE_LEVELS[0];
}

function UsFlagBackground({ strength = 0.56, shade = 0.36 }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#07111d]"
      aria-hidden="true"
      data-us-flag-bg
    >
      <svg className="h-full w-full" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice" focusable="false">
        <rect width="360" height="240" fill="#08111d" />
        <g opacity={strength} style={{ filter: 'drop-shadow(0 0 18px rgba(248, 250, 252, 0.1))' }}>
          {US_FLAG_STRIPES.map((stripe, index) => (
            <path key={`stripe-${index}`} d={stripe.d} fill={stripe.color} opacity={stripe.opacity} />
          ))}
          <path
            d="M -26 18 C 28 -8 103 18 157 4 C 175 24 189 54 205 84 C 224 120 246 151 264 182 C 210 169 150 187 91 201 C 43 213 3 203 -26 224 Z"
            fill="#102a5f"
            opacity="0.86"
          />
          <path
            d="M -28 58 C 38 42 94 68 156 52 C 182 86 202 122 230 154 C 168 145 104 169 44 176 C 10 180 -11 175 -28 172 Z"
            fill="#071426"
            opacity="0.42"
          />
          {US_FLAG_STARS.map((star, index) => (
            <polygon
              key={`star-${index}`}
              points="0,-3.5 0.9,-1.1 3.4,-1.1 1.35,0.35 2.1,3 -0.05,1.45 -2.15,3 -1.35,0.35 -3.4,-1.1 -0.9,-1.1"
              transform={`translate(${star.x} ${star.y}) rotate(${star.rotation}) scale(1.7)`}
              fill="#f8fafc"
              opacity="0.62"
            />
          ))}
          <ellipse cx="228" cy="106" rx="72" ry="38" fill="#f8fafc" opacity="0.12" />
          <ellipse cx="242" cy="116" rx="58" ry="34" fill="#dc223d" opacity="0.14" />
        </g>
        <rect width="360" height="240" fill="#05070b" opacity={shade} />
        <rect width="360" height="88" fill="#05070b" opacity="0.46" />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,7,11,0.42) 0%, rgba(5,7,11,0.36) 40%, rgba(5,7,11,0.74) 100%), radial-gradient(circle at 62% 45%, rgba(255,255,255,0.03), transparent 26%), radial-gradient(circle at 8% 92%, rgba(5,7,11,0.86), transparent 46%)',
        }}
      />
    </div>
  );
}

function ReviewActionSheet({ title, desc, children, language = 'zh', onClose }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-0 py-6 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
      }}
    >
      <div className="w-[calc(100vw-72px)] max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f16] shadow-[0_24px_80px_rgba(0,0,0,0.68)]">
        <div className="border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-[17px] text-white/45 active:scale-90"
              aria-label={t(language, 'review.closeRecordDetails', '关闭记录详情')}
            >
              ×
            </button>
          </div>
          {desc && (
            <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] leading-relaxed text-white/65">
              {desc}
            </div>
          )}
        </div>
        <div className="space-y-2 px-4 pb-4 pt-3">{children}</div>
      </div>
    </div>
  );
}

function formatDisciplineDetailText(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map((line, index) => {
    if (!line.trim()) {
      return <div key={`blank-${index}`} className="h-2" />;
    }
    const match = line.match(/^(\s*[\w.$&/+·\-\s\u4e00-\u9fa5]{1,18}\s*[：:])(\s*)(.*)$/);
    if (!match) {
      return (
        <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-white/72">
          {line}
        </p>
      );
    }
    return (
      <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words">
        <span className="text-[#f6b54b]/90">{match[1]}</span>
        {match[2] && <span> </span>}
        <span className="text-white/72">{match[3]}</span>
      </p>
    );
  });
}

function DisciplineDetailModal({ discipline, Edit2, Pin, Trash2, X, language = 'zh', onClose, onEdit, onTogglePin, onDelete }) {
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.65] px-6 py-8 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 32px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)',
      }}
    >
      <div className="relative w-full max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f16] px-5 pb-5 pt-4 shadow-[0_24px_90px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <UsFlagBackground strength={0.42} shade={0.7} />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold tracking-normal text-white">{tt('review.recordDetails', '记录详情')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/52 active:scale-90"
            aria-label={tt('review.closeRecordDetails', '关闭记录详情')}
          >
            {X ? <X className="h-4 w-4" strokeWidth={1.8} /> : '×'}
          </button>
        </div>

        <div className="relative z-10 mt-5 max-h-[52vh] min-h-[168px] overflow-y-auto pr-1 text-[14px] font-normal leading-[1.82] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {formatDisciplineDetailText(discipline.text)}
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/[0.045] px-2 text-[12px] font-normal text-[#f6b54b] active:scale-95"
          >
            {Edit2 && <Edit2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
            <span>{tt('review.edit', '修改')}</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-400/[0.045] px-2 text-[12px] font-normal text-rose-300/85 active:scale-95"
          >
            {Trash2 && <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
            <span>{tt('review.delete', '删除')}</span>
          </button>
          <button
            type="button"
            onClick={onTogglePin}
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/[0.045] px-2 text-[12px] font-normal text-emerald-200/80 active:scale-95"
          >
            {Pin && <Pin className="h-3.5 w-3.5" strokeWidth={1.8} />}
            <span>{discipline.pinned ? tt('review.unpin', '取消置顶') : tt('review.pin', '置顶')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatReviewLogDetailText(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map((line, index) => {
    if (!line.trim()) {
      return <div key={`blank-${index}`} className="h-3" />;
    }
    return (
      <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-white/72">
        {line}
      </p>
    );
  });
}

function ReviewLogDetailModal({ log, Edit2, Trash2, X, language = 'zh', onClose, onEdit, onDelete }) {
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.65] px-6 py-8 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 32px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)',
      }}
    >
      <div className="relative w-full max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f16] px-5 pb-5 pt-4 shadow-[0_24px_90px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <UsFlagBackground strength={0.38} shade={0.72} />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold tracking-normal text-white">{tt('review.reviewDetails', '复盘详情')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/52 active:scale-90"
            aria-label={tt('review.closeReviewDetails', '关闭复盘详情')}
          >
            {X ? <X className="h-4 w-4" strokeWidth={1.8} /> : '×'}
          </button>
        </div>

        <div className="relative z-10 mt-4 max-h-[58vh] min-h-[220px] overflow-y-auto pr-1 text-[14px] font-normal leading-[1.82] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {formatReviewLogDetailText(log.text)}
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/35">
          <span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{log.date}</span>
          {log.mood && <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-0.5 text-[11px] text-white/42">{log.mood}</span>}
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-[#f6b54b]/30 bg-[#f6b54b]/[0.045] px-2 text-[12px] font-normal text-[#f6b54b] active:scale-95"
          >
            {Edit2 && <Edit2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
            <span>{tt('review.edit', '修改')}</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-400/[0.045] px-2 text-[12px] font-normal text-rose-300/85 active:scale-95"
          >
            {Trash2 && <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
            <span>{tt('review.delete', '删除')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CompoundDetailModal({
  X,
  currentBalance,
  language = 'zh',
  money,
  onClose,
  planRows,
  progressPct,
  signedMoney,
  startCapital,
  startYear,
  symbol,
  targetAnnualRate,
  targetValue,
  totalYears,
  rate,
}) {
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  const displayRows = planRows.map((row) => ({
    ...row,
    displayAnnualGain: row.annualGain * rate,
    displayEndBalance: row.endBalance * rate,
  }));
  const displayStart = startCapital * rate;
  const displayTarget = targetValue * rate;
  const displayCurrent = currentBalance * rate;
  const displayMax = Math.max(displayTarget, displayCurrent, displayStart, 1);
  const chartMax = Math.ceil((displayMax * 1.08) / 1000000 / 4) * 4 * 1000000 || 4000000;
  const chartWidth = 324;
  const chartHeight = 132;
  const padLeft = 34;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 24;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const pointCount = Math.max(2, totalYears);
  const chartPoints = Array.from({ length: pointCount }, (_, index) => {
    const progress = pointCount <= 1 ? 1 : index / (pointCount - 1);
    const balance = startCapital * Math.pow(1 + targetAnnualRate, progress * totalYears) * rate;
    const x = padLeft + progress * plotWidth;
    const y = padTop + plotHeight - (Math.min(balance, chartMax) / chartMax) * plotHeight;
    return { x, y, balance, year: startYear + index };
  });
  const curvePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${curvePath} L ${chartPoints[chartPoints.length - 1].x.toFixed(1)} ${padTop + plotHeight} L ${chartPoints[0].x.toFixed(1)} ${padTop + plotHeight} Z`;
  const tickValues = [chartMax, chartMax * 0.75, chartMax * 0.5, chartMax * 0.25, 0];
  const xLabelIndexes = chartPoints.map((_, index) => index);
  const actualGain = currentBalance - startCapital;
  const targetGain = targetValue - startCapital;
  const multiple = startCapital > 0 ? targetValue / startCapital : 0;
  const actualIndex = clamp(new Date().getFullYear() - startYear, 0, pointCount - 1);
  const actualX = padLeft + (pointCount <= 1 ? 0 : (actualIndex / (pointCount - 1)) * plotWidth);
  const actualY = padTop + plotHeight - (Math.min(displayCurrent, chartMax) / chartMax) * plotHeight;

  const formatMillion = (value) => {
    if (value <= 0) return '0';
    const million = value / 1000000;
    return `${million >= 10 ? million.toFixed(0) : million.toFixed(1).replace(/\.0$/, '')}M`;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-hidden bg-black/70 px-2 py-4 backdrop-blur-lg"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)',
      }}
    >
      <div
        data-compound-detail="true"
        className="w-[calc(100vw-16px)] max-w-[386px] overflow-y-auto overscroll-contain rounded-[22px] border border-[#f6b54b]/35 bg-[#0b0f16] px-4 pb-4 pt-4 shadow-[0_26px_90px_rgba(0,0,0,0.74),inset_0_1px_0_rgba(246,181,75,0.12)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 28px)' }}
      >
        <div className="relative text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-[-2px] flex h-8 w-8 items-center justify-center rounded-full text-white/45 active:scale-90"
            aria-label={tt('review.closeRecordDetails', '关闭记录详情')}
          >
            {X ? <X className="h-4 w-4" strokeWidth={1.7} /> : '×'}
          </button>
          <h2 className="text-[16px] font-semibold leading-none text-[#ffd18a]">{tt('review.compoundTitle', '{{years}}年复利明细', { years: totalYears })}</h2>
          <div className="mt-2 text-[12px] leading-none text-white/45">
            {tt('review.principalAnnual', '本金 {{principal}} · 年化 {{rate}}%', { principal: money(startCapital), rate: (targetAnnualRate * 100).toFixed(0) })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 rounded-2xl border border-[#232b36]/80 bg-white/[0.032] py-3">
          {[
            { label: tt('review.targetFinal', '目标终值'), value: money(targetValue), valueClass: 'text-[#ffd18a]' },
            { label: tt('review.accumulatedGain', '累计收益'), value: signedMoney(targetGain), valueClass: 'text-[#ff4b1f]' },
            { label: tt('review.compoundMultiple', '复利倍数'), value: `${multiple.toFixed(2)}x`, valueClass: 'text-[#ffd18a]' },
          ].map((item, index) => (
            <div key={item.label} className={`px-2 text-center ${index > 0 ? 'border-l border-[#232b36]/90' : ''}`}>
              <div className="text-[11px] text-[#8a909a]">{item.label}</div>
              <div className={`mt-2 whitespace-nowrap text-[13px] font-normal leading-none tabular-nums ${item.valueClass}`} style={{ fontFamily: NUMBER_FONT }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2.5 rounded-2xl border border-[#232b36]/80 bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-[#8a909a]">{tt('review.actualProgress', '实际进度')}</div>
              <div className="mt-1 truncate text-[12px] text-white/68">
                {tt('review.current', '当前')} <span className="text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(currentBalance)}</span>
                <span className="mx-1.5 text-white/22">·</span>
                {tt('review.actualGain', '实际收益')} <span className="text-[#ff4b1f] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{signedMoney(actualGain)}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[15px] leading-none text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progressPct.toFixed(1)}%</div>
              <div className="mt-1 text-[10px] text-[#8a909a]">{tt('review.completion', '完成度')}</div>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[#f6b54b]"
              style={{ width: `${Math.min(100, progressPct)}%`, boxShadow: '0 0 12px rgba(246,181,75,0.35)' }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#d9dde4]">{tt('review.accountCurve', '账户曲线')}</h3>
          <span className="text-[11px] text-white/40">{tt('review.amountUnit', '金额单位: {{unit}}', { unit: symbol === '¥' ? tt('review.unitCnyMillion', '百万元人民币') : tt('review.unitUsdMillion', '百万美元') })}</span>
        </div>

        <div className="mt-2 rounded-[18px] border border-[#202733] bg-black/[0.12] px-2 py-2.5">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[164px] w-full overflow-visible" aria-label={tt('review.compoundCurveAria', '复利账户曲线')}>
            <defs>
              <linearGradient id="compoundLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f6b54b" />
                <stop offset="100%" stopColor="#ffd18a" />
              </linearGradient>
              <linearGradient id="compoundAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f6b54b" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#f6b54b" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {tickValues.map((tick) => {
              const y = padTop + plotHeight - (tick / chartMax) * plotHeight;
              return (
                <g key={tick}>
                  <line x1={padLeft} x2={chartWidth - padRight} y1={y} y2={y} stroke="rgba(86,99,120,0.16)" strokeWidth="0.7" />
                  <text x="4" y={y + 3} fill="rgba(141,148,160,0.68)" fontSize="10" fontFamily={NUMBER_FONT}>{formatMillion(tick)}</text>
                </g>
              );
            })}
            {xLabelIndexes.map((index) => {
              const point = chartPoints[index];
              return (
                <g key={point.year}>
                  <line x1={point.x} x2={point.x} y1={padTop} y2={padTop + plotHeight} stroke="rgba(86,99,120,0.12)" strokeWidth="0.7" />
                  <text x={point.x} y={chartHeight - 5} textAnchor="middle" fill="rgba(141,148,160,0.66)" fontSize="8" fontFamily={NUMBER_FONT}>{point.year}</text>
                </g>
              );
            })}
            <path d={areaPath} fill="url(#compoundAreaGradient)" />
            <path d={curvePath} fill="none" stroke="url(#compoundLineGradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={chartPoints[0].x} cy={chartPoints[0].y} r="3.4" fill="#ffd18a" stroke="#0b0f16" strokeWidth="1.5" />
            <circle cx={chartPoints[chartPoints.length - 1].x} cy={chartPoints[chartPoints.length - 1].y} r="4" fill="#ffd18a" stroke="#0b0f16" strokeWidth="1.6" />
            <circle cx={actualX} cy={actualY} r="3" fill="#ffffff" fillOpacity="0.88" stroke="#f6b54b" strokeWidth="1.4" />
            <text x={chartPoints[0].x - 2} y={chartPoints[0].y - 9} textAnchor="start" fill="#ffd18a" fontSize="10.5" fontFamily={NUMBER_FONT}>{money(startCapital)}</text>
            <text x={chartPoints[chartPoints.length - 1].x} y={chartPoints[chartPoints.length - 1].y - 10} textAnchor="end" fill="#ffd18a" fontSize="10.5" fontFamily={NUMBER_FONT}>{money(targetValue)}</text>
          </svg>
        </div>

        <div className="mt-4 rounded-[18px] border border-[#202733] bg-white/[0.035] px-3 py-3">
          <h3 className="text-[14px] font-semibold text-[#d9dde4]">{tt('review.yearlyIncome', '每年收益')}</h3>
          <div className="mt-3 grid grid-cols-[0.75fr_1fr_1.15fr] border-b border-[#202733] pb-2 text-[11px] text-[#8a909a]">
            <span>{tt('review.year', '年份')}</span>
            <span className="text-right">{tt('review.annualGain', '年收益')}</span>
            <span className="text-right">{tt('review.yearEndAssets', '期末资产')}</span>
          </div>
          <div className="divide-y divide-[#202733]">
            {displayRows.map((row) => (
              <div key={row.year} className="grid grid-cols-[0.75fr_1fr_1.15fr] py-2 text-[12px] leading-none">
                <span className="text-white/72 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{row.year}</span>
                <span className="text-right text-[#ff4b1f] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>+{symbol}{fmtMoney(row.displayAnnualGain)}</span>
                <span className="text-right text-white/72 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{symbol}{fmtMoney(row.displayEndBalance)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-center text-[11px] text-white/35">{tt('review.compoundNote', '收益按年复利计算')}</div>
        </div>
      </div>
    </div>
  );
}

export default function ReviewTab({ ctx }) {
  const {
    BookOpen,
    Calendar,
    ChevronDown,
    ChevronUp,
    db,
    DisciplineModal,
    disciplines,
    Edit2,
    editYearlyActualId,
    expandedDisciplines,
    filterLevel,
    investmentPlan,
    lastSubmitRef,
    language = 'zh',
    LogModal,
    marketColorMode,
    reviewLogs,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditYearlyActualId,
    setExpandedDisciplines,
    setFilterLevel,
    setInvestmentPlan,
    setReviewLogs,
    setShowAddDiscipline,
    setShowAddLog,
    setShowAllDisciplines,
    setShowAllLogs,
    setShowAllYears,
    setShowPlanSettings,
    setYearlyActuals,
    showAddDiscipline,
    showAddLog,
    showAllDisciplines,
    showAllLogs,
    showAllYears,
    showConfirm,
    showPlanSettings,
    Target,
    Pin,
    Trash2,
    usdRate,
    X,
    YearlyActualModal,
    yearlyActuals,
  } = ctx;

  const [yearAction, setYearAction] = React.useState(null);
  const [disciplineAction, setDisciplineAction] = React.useState(null);
  const [reviewLogAction, setReviewLogAction] = React.useState(null);
  const [showCompoundDetails, setShowCompoundDetails] = React.useState(false);
  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);

  const plan = investmentPlan || {};
  const startYear = toNumber(plan.startYear, new Date().getFullYear());
  const totalYears = Math.max(1, toNumber(plan.totalYears, 10));
  const startCapital = toNumber(plan.startCapital, 0);
  const targetAnnualRate = toNumber(plan.targetAnnualRate, 0.2);
  const ageGoalAge = toNumber(plan.ageGoalAge, 0);
  const displayCurrency = plan.displayCurrency === 'CNY' ? 'CNY' : 'USD';
  const isCNY = displayCurrency === 'CNY';
  const fxRate = toNumber(usdRate, 1);
  const rate = isCNY ? (fxRate > 0 ? fxRate : 1) : 1;
  const symbol = isCNY ? '¥' : '$';
  const thisYear = new Date().getFullYear();

  const money = (usdValue, digits = 0) => `${symbol}${fmtMoney(toNumber(usdValue) * rate, digits)}`;
  const signedMoney = (usdValue, digits = 0) => {
    const n = toNumber(usdValue);
    return `${n >= 0 ? '+' : '-'}${money(Math.abs(n), digits)}`;
  };
  const splitMoney = (usdValue, digits = 2) => {
    const [main, decimal = ''.padEnd(digits, '0')] = fmtMoney(toNumber(usdValue) * rate, digits).split('.');
    return {
      main: `${symbol}${main}`,
      decimal: digits > 0 ? `.${decimal}` : '',
    };
  };
  const pnlTextClass = (value) => marketTextClass(value, marketColorMode);

  const yearlyFinal = React.useMemo(() => {
    const rows = [];
    let prevEnd = startCapital;

    for (let i = 0; i < totalYears; i += 1) {
      const year = startYear + i;
      const actual = (yearlyActuals || []).find((item) => item.year === year);
      const startBalance = prevEnd;
      const planTarget = Math.round(startBalance * targetAnnualRate);
      let actualGain = actual?.actualGain ?? null;
      let endBalance = actual?.endBalance ?? null;
      let isProjected = false;

      if (actualGain !== null && endBalance !== null) {
        actualGain = toNumber(actualGain);
        endBalance = toNumber(endBalance);
      } else if (endBalance !== null) {
        endBalance = toNumber(endBalance);
        actualGain = endBalance - startBalance;
      } else if (actualGain !== null) {
        actualGain = toNumber(actualGain);
        endBalance = startBalance + actualGain;
      } else {
        actualGain = null;
        endBalance = Math.round(startBalance * (1 + targetAnnualRate));
        isProjected = true;
      }

      rows.push({
        year,
        startBalance: Math.round(startBalance),
        planTarget,
        actualGain,
        endBalance: Math.round(endBalance),
        isProjected,
        planEndBalance: Math.round(startCapital * Math.pow(1 + targetAnnualRate, i + 1)),
      });
      prevEnd = endBalance;
    }

    return rows;
  }, [startCapital, startYear, targetAnnualRate, totalYears, yearlyActuals]);

  const ageGoalAmountExact = startCapital * Math.pow(1 + targetAnnualRate, totalYears);
  const ageGoalAmount = Math.round(ageGoalAmountExact);
  const headlineGoalMoney = splitMoney(ageGoalAmountExact, 2);
  const currentBalance = React.useMemo(() => {
    for (let i = yearlyFinal.length - 1; i >= 0; i -= 1) {
      if (!yearlyFinal[i].isProjected) return yearlyFinal[i].endBalance;
    }
    return startCapital;
  }, [startCapital, yearlyFinal]);
  const progressPct = ageGoalAmount > 0 ? clamp((currentBalance / ageGoalAmount) * 100, 0, 100) : 0;
  const yearsLeft = Math.max(0, startYear + totalYears - 1 - thisYear);
  const currentYearIndex = yearlyFinal.findIndex((item) => item.year === thisYear);
  const visibleYears = showAllYears
    ? yearlyFinal
    : yearlyFinal.filter((_, index) => {
      if (currentYearIndex === -1) return index < 2;
      return index >= currentYearIndex && index < currentYearIndex + 2;
    });
  const hiddenYearCount = yearlyFinal.length - visibleYears.length;
  const compoundPlanRows = React.useMemo(() => yearlyFinal.map((yearItem, index) => {
    const previousPlanEnd = index === 0 ? startCapital : yearlyFinal[index - 1].planEndBalance;
    return {
      year: yearItem.year,
      annualGain: Math.round(yearItem.planEndBalance - previousPlanEnd),
      endBalance: yearItem.planEndBalance,
    };
  }), [startCapital, yearlyFinal]);

  const sortedDisciplines = React.useMemo(() => (
    [...(disciplines || [])].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    })
  ), [disciplines]);
  const filteredDisciplines = filterLevel === 'all'
    ? sortedDisciplines
    : sortedDisciplines.filter((item) => item.level === filterLevel);
  const visibleDisciplines = showAllDisciplines ? filteredDisciplines : filteredDisciplines.slice(0, 10);
  const visibleLogs = showAllLogs ? (reviewLogs || []) : (reviewLogs || []).slice(0, 10);

  const switchCurrency = async (nextCurrency) => {
    if (nextCurrency === displayCurrency) return;
    const next = { ...plan, displayCurrency: nextCurrency };
    setInvestmentPlan(next);
    try {
      await db.upsertInvestmentPlan(next);
    } catch (error) {
      console.error('[目标页币种切换] 保存失败:', error);
    }
  };

  const togglePinDiscipline = async (discipline) => {
    const nextPinned = !discipline.pinned;
    try {
      await db.updateDiscipline(discipline.id, { ...discipline, pinned: nextPinned });
      setDisciplines((disciplines || []).map((item) => (
        item.id === discipline.id ? { ...item, pinned: nextPinned } : item
      )));
      setDisciplineAction(null);
    } catch (error) {
      console.error('[目标页戒律置顶] 保存失败:', error);
    }
  };

  const deleteDiscipline = (discipline) => {
    setDisciplineAction(null);
    showConfirm({
      title: tt('review.deleteDisciplineTitle', '删除这条心得?'),
      desc: tt('review.irreversible', '此操作不可撤销'),
      info: (discipline?.text || '').slice(0, 50) + ((discipline?.text || '').length > 50 ? '...' : ''),
      confirmText: tt('review.delete', '删除'),
      onConfirm: async () => {
        await db.deleteDiscipline(discipline.id);
        setDisciplines((disciplines || []).filter((item) => item.id !== discipline.id));
      },
    });
  };

  const openDisciplineEdit = (discipline) => {
    setDisciplineAction(null);
    setEditingDisciplineId(discipline.id);
  };

  const deleteReviewLog = (log) => {
    const logId = log?.id || ctx.editingLogId;
    if (!logId) return;
    setReviewLogAction(null);
    showConfirm({
      title: tt('review.deleteReviewTitle', '删除这条复盘?'),
      desc: tt('review.irreversible', '此操作不可撤销'),
      info: `${log?.date || ''} · ${(log?.text || '').slice(0, 40)}${(log?.text || '').length > 40 ? '...' : ''}`,
      confirmText: tt('review.delete', '删除'),
      onConfirm: async () => {
        await db.deleteReviewLog(logId);
        setReviewLogs((reviewLogs || []).filter((item) => item.id !== logId));
        setEditingLogId(null);
        setShowAddLog(false);
      },
    });
  };

  const openReviewLogEdit = (log) => {
    setReviewLogAction(null);
    setEditingLogId(log.id);
  };

  const openYearEdit = (year) => {
    setYearAction(null);
    setEditYearlyActualId(year);
  };

  return (
    <div className="mx-auto max-w-[430px] pb-2 text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      <style>{`
        @keyframes polar-twinkle {
          0%, 100% { opacity: 0.28; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.35); }
        }
        .review-star {
          position: absolute;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.86);
          animation: polar-twinkle 3.5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes review-rocket-launch {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        .rocket-bar {
          position: relative;
          overflow: hidden;
          width: var(--target-width);
          animation: review-rocket-launch 1.2s cubic-bezier(0.25, 0.85, 0.25, 1) forwards;
        }
        @keyframes review-progress-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .progress-shine {
          position: relative;
          overflow: hidden;
        }
        .progress-shine::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 20px;
          height: 100%;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.48) 50%, transparent 100%);
          animation: review-progress-shine 2s linear infinite;
        }
      `}</style>

      <section
        className="relative flex h-[244px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]"
        role="button"
        tabIndex={0}
        onClick={() => setShowCompoundDetails(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setShowCompoundDetails(true);
          }
        }}
        aria-label={tt('review.openCompoundDetails', '查看北极星复利明细')}
      >
        <span className="review-star left-[58%] top-[16%] h-1 w-1" />
        <span className="review-star left-[74%] top-[34%] h-0.5 w-0.5" style={{ animationDelay: '0.7s' }} />
        <span className="review-star left-[63%] top-[56%] h-0.5 w-0.5" style={{ animationDelay: '1.4s' }} />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-normal text-white/70">
              <span className="text-[14px] text-[#ffd18a]">★</span>
              <span>{tt('review.polarisGoal', '北极星目标')}</span>
            </div>
          </div>
          <div className="flex shrink-0 rounded-full border border-white/10 bg-black/20 p-0.5">
            {[
              { key: 'USD', label: 'USD' },
              { key: 'CNY', label: 'CNY' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  switchCurrency(item.key);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={`h-7 rounded-full px-2.5 text-[11px] font-normal active:scale-95 ${displayCurrency === item.key ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/45'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-3 whitespace-nowrap text-[34px] font-normal leading-none tracking-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          <span>{headlineGoalMoney.main}</span>
          <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-[#ffd18a]/90">{headlineGoalMoney.decimal}</span>
        </div>
        <div className="relative z-10 mt-2 text-[12px] text-white/55">
          {tt('review.goalSubtitle', '{{years}} 年目标 · {{age}} 岁实现', { years: totalYears, age: ageGoalAge || '--' })}
        </div>

        <div className="relative z-10 mt-5">
          <div className="mb-2 flex items-center justify-between text-[13px] font-normal text-[#ffd18a]">
            <span>{tt('review.currentAmount', '当前 {{amount}}', { amount: money(currentBalance) })}</span>
            <span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progressPct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/[0.075]">
            <div
              className="rocket-bar h-full rounded-full"
              style={{
                '--target-width': `${progressPct}%`,
                background: 'linear-gradient(90deg, #f8c46a 0%, #f6b54b 58%, #ffd18a 100%)',
                boxShadow: '0 0 14px rgba(246,181,75,0.34)',
              }}
            />
          </div>
          <div className="mt-3 text-[12px] text-white/50">
            {tt('review.yearsLeftLine', '还剩 {{years}} 年 · 本金 {{principal}} · 年化 {{rate}}%', { years: yearsLeft, principal: money(startCapital), rate: (targetAnnualRate * 100).toFixed(0) })}
          </div>
        </div>

        <div className="relative z-10 mb-1.5 mt-auto flex items-center justify-between gap-3">
          {plan.motto ? (
            <div className="min-w-0 truncate text-[12px] leading-tight text-[#ffd18a]">“{plan.motto}”</div>
          ) : (
            <div className="text-[12px] text-white/35">{tt('review.goalReminderPlaceholder', '设置一句目标提醒')}</div>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowPlanSettings(true);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="shrink-0 -translate-y-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[12px] font-normal text-white/65 active:scale-95"
          >
            {tt('review.settings', '设置')}
          </button>
        </div>
      </section>

      <section className="mt-5 -mx-2">
        <div className="mb-3 flex items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-2">
            {Target ? <Target className="h-4 w-4 text-[#f6b54b]" /> : <Calendar className="h-4 w-4 text-[#f6b54b]" />}
            <div className="text-[15px] font-semibold text-white">{tt('review.annualGoals', '年度目标')}</div>
          </div>
          {yearlyFinal.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllYears(!showAllYears)}
              className="flex items-center gap-1 rounded-xl px-2 py-1 text-[12px] text-white/45 active:scale-95"
            >
              {showAllYears ? tt('review.collapse', '收起') : tt('review.expandMoreYears', '展开剩余 {{count}} 年', { count: hiddenYearCount })}
              {showAllYears ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {visibleYears.map((yearItem) => {
            const yearIndex = yearlyFinal.findIndex((item) => item.year === yearItem.year);
            const isCurrent = yearItem.year === thisYear;
            const hasActual = yearItem.actualGain !== null;
            const diff = hasActual ? yearItem.actualGain - yearItem.planTarget : null;
            const isOverTarget = diff !== null && diff >= 0;
            const targetGap = hasActual ? yearItem.planTarget - yearItem.actualGain : null;
            const yearProgressPct = isCurrent && hasActual && yearItem.planTarget > 0
              ? clamp((yearItem.actualGain / yearItem.planTarget) * 100, 0, 150)
              : 0;
            const projectedLabel = yearItem.isProjected
              ? tt('review.notStarted', '未开始')
              : isOverTarget ? tt('review.reached', '达标') : tt('review.behind', '未达');
            const currentYearTarget = yearItem.startBalance + yearItem.planTarget;
            const previousYear = yearIndex > 0 ? yearlyFinal[yearIndex - 1] : null;
            const plannedStartBalance = previousYear
              ? (previousYear.year === thisYear ? previousYear.startBalance + previousYear.planTarget : previousYear.endBalance)
              : startCapital;

            if (isCurrent) {
              return (
                <button
                  key={yearItem.year}
                  type="button"
                  onClick={() => setYearAction(yearItem)}
                  className="block w-full rounded-[20px] border border-white/10 bg-[#0b0f14] p-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="text-[22px] font-semibold leading-none text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{yearItem.year}</div>
                      <span className="rounded-md border border-[#f6b54b]/25 bg-[#f6b54b]/10 px-1.5 py-0.5 text-[10px] text-[#f6b54b]">{tt('review.thisYear', '本年')}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${isOverTarget ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/25 bg-rose-400/10 text-rose-300'}`}>{projectedLabel}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-[minmax(0,1fr)_124px] items-start gap-2.5">
                    <div className="min-w-0 pt-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[12px] text-white/50">
                        <span className="whitespace-nowrap">{tt('review.planned', '计划')} {signedMoney(yearItem.planTarget)}</span>
                        <span className="text-white/25">→</span>
                        <span>{tt('review.actual', '实际')}</span>
                      </div>
                      <div className={`mt-1 whitespace-nowrap text-[20px] font-normal tabular-nums ${hasActual ? pnlTextClass(yearItem.actualGain) : 'text-white/35'}`} style={{ fontFamily: NUMBER_FONT }}>
                        {hasActual ? signedMoney(yearItem.actualGain) : tt('review.pending', '待填写')}
                      </div>
                    </div>
                    <div className="w-full shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2.5 py-2 text-[11px] leading-relaxed">
                      <div className="whitespace-nowrap text-white/62">
                        {tt('review.target', '目标')} <span className="text-white/82 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(currentYearTarget)}</span>
                      </div>
                      <div className={`mt-0.5 whitespace-nowrap tabular-nums ${targetGap === null ? 'text-white/35' : pnlTextClass(targetGap)}`} style={{ fontFamily: NUMBER_FONT }}>
                        {targetGap === null
                          ? tt('review.pending', '待填写')
                          : targetGap < 0
                            ? tt('review.exceededAmount', '超额 {{amount}}', { amount: money(Math.abs(targetGap)) })
                            : tt('review.behindAmount', '落后 {{amount}}', { amount: money(Math.abs(targetGap)) })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-2xl border border-white/[0.06] bg-white/[0.035] px-3 py-3">
                    <div>
                      <div className="text-[11px] text-white/40">{tt('review.start', '起点')}</div>
                      <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(yearItem.startBalance)}</div>
                    </div>
                    <div className="px-2 text-white/25">→</div>
                    <div className="text-center">
                      <div className="text-[11px] text-white/40">{tt('review.current', '当前')}</div>
                      <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(yearItem.endBalance)}</div>
                    </div>
                    <div className="px-2 text-white/25">→</div>
                    <div className="text-right">
                      <div className="text-[11px] text-white/40">{tt('review.target', '目标')}</div>
                      <div className="mt-1 text-[12px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(currentYearTarget)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <span className="shrink-0 text-[13px] text-white/65">{tt('review.yearProgress', '本年完成')}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.075]">
                      <div
                        className="progress-shine h-full rounded-full"
                        style={{
                          width: `${Math.min(100, yearProgressPct)}%`,
                          background: 'linear-gradient(90deg, #f8c46a 0%, #f6b54b 62%, #ffd18a 100%)',
                        }}
                      />
                    </div>
                    <span className="w-11 text-right text-[14px] text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{yearProgressPct.toFixed(0)}%</span>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={yearItem.year}
                type="button"
                onClick={() => setYearAction(yearItem)}
                className="block w-full rounded-[18px] border border-white/10 bg-[#0b0f14] p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[22px] font-semibold leading-none text-white/55 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{yearItem.year}</span>
                      <span className="text-[11px] text-white/35">{tt('review.plannedTargetLine', '计划 {{planned}} → 目标 {{target}}', { planned: signedMoney(yearItem.planTarget), target: money(yearItem.endBalance) })}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg border border-sky-400/15 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-200/70">{projectedLabel}</span>
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-white/[0.06] bg-black/15 px-3 py-3">
                  <div>
                    <div className="text-[11px] text-white/38">{tt('review.start', '起点')}</div>
                    <div className="mt-1 text-[12px] font-normal text-white/35 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(plannedStartBalance)}</div>
                  </div>
                  <div className="px-4 text-white/25">→</div>
                  <div className="text-right">
                    <div className="text-[11px] text-white/38">{tt('review.target', '目标')}</div>
                    <div className="mt-1 text-[12px] font-normal text-white/35 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{money(yearItem.endBalance)}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[12px] text-white/45">
                    <span className="flex items-center gap-1">
                      {tt('review.growthTarget', '增长目标')}
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 text-[9px] text-white/45">i</span>
                    </span>
                    <span className="text-white/70 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{signedMoney(yearItem.planTarget)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    <span className="h-px flex-1 border-t border-dashed border-white/25" />
                    <span className="h-2 w-2 rounded-full bg-white" />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-white/35">
                    <span>{money(plannedStartBalance)}</span>
                    <span>{money(yearItem.endBalance)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {hiddenYearCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllYears(!showAllYears)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#f6b54b]/35 bg-[#f6b54b]/[0.035] py-3 text-[13px] font-normal text-[#f6b54b]"
          >
            {showAllYears ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAllYears ? tt('review.collapseAnnualGoals', '收起年度目标') : tt('review.expandMoreYears', '展开剩余 {{count}} 年', { count: hiddenYearCount })}
          </button>
        )}
      </section>

      <section className="mt-5">
        <div className="mb-4 flex min-h-10 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-5 w-1 shrink-0 rounded-full bg-[#f6a524] shadow-[0_0_14px_rgba(246,165,36,0.3)]" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-none tracking-normal text-white">{tt('review.disciplines', '投资心得')}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddDiscipline(true)}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 text-[13px] font-normal text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] active:scale-95"
          >
            <span className="text-[20px] font-light leading-none text-white/78">+</span>
            <span>{tt('review.add', '添加')}</span>
          </button>
        </div>

        <div className="mb-4 flex gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-pull-refresh-block="true">
          <button
            type="button"
            onClick={() => setFilterLevel('all')}
            className={`h-9 shrink-0 rounded-full border px-2.5 text-[12px] font-normal active:scale-95 ${filterLevel === 'all' ? 'border-white/[0.09] bg-white/[0.055] text-white/82' : 'border-white/[0.055] bg-white/[0.03] text-white/48'}`}
          >
            {tt('review.allCount', '全部 ({{count}})', { count: disciplines.length })}
          </button>
          {DISCIPLINE_LEVELS.map((item) => {
            const count = disciplines.filter((discipline) => discipline.level === item.level).length;
            return (
              <button
                key={item.level}
                type="button"
                onClick={() => setFilterLevel(item.level)}
                className={`flex h-9 min-w-[54px] shrink-0 items-center justify-center gap-2 rounded-full border px-2.5 text-[12px] font-normal active:scale-95 ${filterLevel === item.level ? 'border-white/[0.09] bg-white/[0.055] text-white/80' : 'border-white/[0.055] bg-white/[0.03] text-white/48'}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.dotColor, boxShadow: `0 0 10px ${item.dotColor}55` }} />
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        {disciplines.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center text-[13px] text-white/45">
            {tt('review.noDisciplines', '还没有投资心得')}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleDisciplines.map((discipline) => {
                const meta = levelMeta(discipline.level);
                const isLong = (discipline.text || '').length > 60;
                const isExpanded = Boolean(expandedDisciplines[discipline.id]);
                const displayText = isLong && !isExpanded ? `${discipline.text.slice(0, 60)}...` : discipline.text;
                return (
                  <div
                    key={discipline.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDisciplineAction(discipline)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDisciplineAction(discipline);
                      }
                    }}
                    className="block w-full rounded-[22px] border border-white/[0.06] bg-[#0b1119] px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
                        style={{ backgroundColor: meta.ringColor, borderColor: meta.ringBorder }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.dotColor, boxShadow: `0 0 13px ${meta.dotColor}66` }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="whitespace-pre-wrap break-words text-[14px] font-normal leading-[1.52] text-white/80">{displayText}</div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-white/35">
                          <span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{discipline.date}</span>
                          {discipline.pinned && <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-0.5 text-[11px] text-white/42">{tt('review.pinned', '置顶')}</span>}
                          {isLong && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedDisciplines((current) => ({ ...current, [discipline.id]: !current[discipline.id] }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setExpandedDisciplines((current) => ({ ...current, [discipline.id]: !current[discipline.id] }));
                                }
                              }}
                              className="inline-flex items-center gap-1 text-white/38"
                            >
                              {isExpanded ? tt('review.collapseFullText', '收起全文') : tt('review.expandFullText', '展开全文')} <span className="text-[13px] leading-none text-white/28">›</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredDisciplines.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllDisciplines(!showAllDisciplines)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.035] py-2.5 text-[12px] font-normal text-white/48 active:scale-95"
              >
                {showAllDisciplines ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAllDisciplines ? tt('review.collapseFirstTen', '收起, 只看前 10 条') : tt('review.viewAllCount', '查看全部 {{count}} 条', { count: filteredDisciplines.length })}
              </button>
            )}
          </>
        )}
      </section>

      <section className="mt-5">
        <div className="mb-4 flex min-h-10 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-5 w-1 shrink-0 rounded-full bg-[#f6a524] shadow-[0_0_14px_rgba(246,165,36,0.3)]" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-none tracking-normal text-white">{tt('review.reviewLogs', '复盘日志')}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddLog(true)}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 text-[13px] font-normal text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] active:scale-95"
          >
            <span className="text-[20px] font-light leading-none text-white/78">+</span>
            <span>{tt('review.writeReview', '写复盘')}</span>
          </button>
        </div>

        {reviewLogs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center text-[13px] text-white/45">
            {tt('review.noReviewLogs', '还没有复盘')}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleLogs.map((log) => {
                const text = log.text || '';
                const isLong = text.length > 150;
                const displayText = isLong ? `${text.slice(0, 150)}...` : text;
                return (
                  <div
                    key={log.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setReviewLogAction(log)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setReviewLogAction(log);
                      }
                    }}
                    className="block w-full rounded-[22px] border border-white/[0.06] bg-[#0b1119] px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  >
                    <div className="whitespace-pre-wrap break-words text-[14px] font-normal leading-[1.52] text-white/80">{displayText}</div>
                    {isLong && (
                      <div className="mt-2 text-[12px] text-white/38">
                        {tt('review.viewFullText', '查看全文')} <span className="text-[13px] leading-none text-white/28">›</span>
                      </div>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-white/35">
                      <span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{log.date}</span>
                      {log.mood && <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-0.5 text-[11px] text-white/42">{log.mood}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {reviewLogs.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllLogs(!showAllLogs)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.035] py-2.5 text-[12px] font-normal text-white/48 active:scale-95"
              >
                {showAllLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAllLogs ? tt('review.collapseFirstTen', '收起, 只看前 10 条') : tt('review.viewAllCount', '查看全部 {{count}} 条', { count: reviewLogs.length })}
              </button>
            )}
          </>
        )}
      </section>

      {showCompoundDetails && (
        <CompoundDetailModal
          X={X}
          currentBalance={currentBalance}
          language={language}
          money={money}
          onClose={() => setShowCompoundDetails(false)}
          planRows={compoundPlanRows}
          progressPct={progressPct}
          signedMoney={signedMoney}
          startCapital={startCapital}
          startYear={startYear}
          symbol={symbol}
          targetAnnualRate={targetAnnualRate}
          targetValue={ageGoalAmountExact}
          totalYears={totalYears}
          rate={rate}
        />
      )}

      {yearAction && (
        <ReviewActionSheet
          title={tt('review.yearActions', '年度目标操作')}
          desc={tt('review.yearActionDesc', '{{year}} · 计划 {{planned}} · 目标 {{target}}', {
            year: yearAction.year,
            planned: signedMoney(yearAction.planTarget),
            target: money(yearAction.startBalance + yearAction.planTarget),
          })}
          language={language}
          onClose={() => setYearAction(null)}
        >
          <button
            type="button"
            onClick={() => openYearEdit(yearAction.year)}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#f6b54b]/35 bg-[#f6b54b]/10 text-[13px] font-normal text-[#f6b54b] active:scale-95"
          >
            {tt('review.editYearData', '修改年度数据')}
          </button>
          <button
            type="button"
            onClick={() => setYearAction(null)}
            className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-[13px] font-normal text-white/80 active:scale-95"
          >
            {tt('review.cancel', '取消')}
          </button>
        </ReviewActionSheet>
      )}

      {disciplineAction && (
        <DisciplineDetailModal
          discipline={disciplineAction}
          Edit2={Edit2}
          language={language}
          Pin={Pin}
          Trash2={Trash2}
          X={X}
          onClose={() => setDisciplineAction(null)}
          onEdit={() => openDisciplineEdit(disciplineAction)}
          onTogglePin={() => togglePinDiscipline(disciplineAction)}
          onDelete={() => deleteDiscipline(disciplineAction)}
        />
      )}

      {reviewLogAction && (
        <ReviewLogDetailModal
          log={reviewLogAction}
          Edit2={Edit2}
          language={language}
          Trash2={Trash2}
          X={X}
          onClose={() => setReviewLogAction(null)}
          onEdit={() => openReviewLogEdit(reviewLogAction)}
          onDelete={() => deleteReviewLog(reviewLogAction)}
        />
      )}

      {showPlanSettings && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowPlanSettings(false);
          }}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 20px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
          }}
        >
          <div className="w-full max-w-sm overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f16] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.68)]" style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 40px)' }} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-white">{tt('review.planSettings', '北极星设置')}</h3>
              <button type="button" onClick={() => setShowPlanSettings(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">{tt('review.basePrincipal', '基础本金 ({{symbol}})', { symbol })}</span>
                <input
                  type="number"
                  value={Math.round(startCapital * rate)}
                  onChange={(event) => setInvestmentPlan({ ...plan, startCapital: (parseFloat(event.target.value) || 0) / rate })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums placeholder:text-white/25 focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">{tt('review.annualTarget', '年化目标 (%)')}</span>
                <input
                  type="number"
                  value={(targetAnnualRate * 100).toFixed(0)}
                  onChange={(event) => setInvestmentPlan({ ...plan, targetAnnualRate: (parseFloat(event.target.value) || 0) / 100 })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums placeholder:text-white/25 focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-white/50">{tt('review.startYear', '起始年')}</span>
                  <input
                    type="number"
                    value={plan.startYear === '' ? '' : startYear}
                    onChange={(event) => setInvestmentPlan({ ...plan, startYear: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums focus:border-[#f6b54b]/70"
                    style={{ colorScheme: 'dark' }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-white/50">{tt('review.totalYears', '总年数')}</span>
                  <input
                    type="number"
                    value={plan.totalYears === '' ? '' : totalYears}
                    onChange={(event) => setInvestmentPlan({ ...plan, totalYears: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums focus:border-[#f6b54b]/70"
                    style={{ colorScheme: 'dark' }}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">{tt('review.targetAge', '目标年龄')}</span>
                <input
                  type="number"
                  value={plan.ageGoalAge === '' ? '' : ageGoalAge}
                  onChange={(event) => setInvestmentPlan({ ...plan, ageGoalAge: event.target.value === '' ? '' : (parseInt(event.target.value, 10) || 0) })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none tabular-nums focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">{tt('review.motto', '个人箴言')}</span>
                <textarea
                  value={plan.motto || ''}
                  onChange={(event) => setInvestmentPlan({ ...plan, motto: event.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#f6b54b]/70"
                  style={{ colorScheme: 'dark' }}
                  placeholder={tt('review.mottoPlaceholder', '例: 我要变得很有钱!')}
                />
              </label>
              <div className="rounded-xl border border-[#f6b54b]/15 bg-[#f6b54b]/10 px-3 py-2 text-[11px] text-[#ffd18a]">
                {tt('review.planReach', '按此计划 {{years}} 年后将达 {{amount}}', { years: totalYears, amount: money(ageGoalAmount) })}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowPlanSettings(false)} className="rounded-xl border border-white/10 bg-white/[0.035] py-2.5 text-[13px] text-white/70 active:scale-95">{tt('review.cancel', '取消')}</button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await db.upsertInvestmentPlan(investmentPlan);
                    setShowPlanSettings(false);
                  } catch (error) {
                    console.error('[目标页设置] 保存失败:', error);
                  }
                }}
                className="rounded-xl bg-[#f6b54b] py-2.5 text-[13px] font-semibold text-[#101318] active:scale-95"
              >
                {tt('review.save', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}

      {(showAddDiscipline || ctx.editingDisciplineId) && (() => {
        const isEdit = Boolean(ctx.editingDisciplineId);
        const current = isEdit ? disciplines.find((item) => item.id === ctx.editingDisciplineId) : null;
        return (
          <DisciplineModal
            initial={current ? { ...current, isEdit: true } : { level: '🟢', text: '', pinned: false }}
            language={language}
            onCancel={() => { setShowAddDiscipline(false); setEditingDisciplineId(null); }}
            onSave={async (data) => {
              try {
                if (isEdit) {
                  await db.updateDiscipline(ctx.editingDisciplineId, data);
                  setDisciplines(disciplines.map((item) => item.id === ctx.editingDisciplineId ? { ...item, ...data } : item));
                  setEditingDisciplineId(null);
                } else {
                  const text = (data.text || '').trim();
                  const last = lastSubmitRef.current.discipline;
                  const now = Date.now();
                  if (last && last.text === text && now - last.at < 10000) return;
                  const saved = await db.insertDiscipline(data);
                  lastSubmitRef.current.discipline = { text, at: now };
                  setDisciplines([saved, ...disciplines]);
                  setShowAddDiscipline(false);
                }
              } catch (error) {
                console.error('[目标页戒律] 保存失败:', error);
              }
            }}
          />
        );
      })()}

      {(showAddLog || ctx.editingLogId) && (() => {
        const isEdit = Boolean(ctx.editingLogId);
        const current = isEdit ? reviewLogs.find((item) => item.id === ctx.editingLogId) : null;
        return (
          <LogModal
            initial={current || { date: new Date().toISOString().slice(0, 10), mood: '', text: '' }}
            language={language}
            onCancel={() => { setShowAddLog(false); setEditingLogId(null); }}
            onDelete={isEdit ? () => deleteReviewLog(current) : null}
            onSave={async (data) => {
              try {
                if (isEdit) {
                  await db.updateReviewLog(ctx.editingLogId, data);
                  setReviewLogs(reviewLogs.map((item) => item.id === ctx.editingLogId ? { ...item, ...data } : item));
                  setEditingLogId(null);
                } else {
                  const text = (data.text || '').trim();
                  const last = lastSubmitRef.current.log;
                  const now = Date.now();
                  if (last && last.text === text && now - last.at < 10000) return;
                  const saved = await db.insertReviewLog(data);
                  lastSubmitRef.current.log = { text, at: now };
                  setReviewLogs([saved, ...reviewLogs]);
                  setShowAddLog(false);
                }
              } catch (error) {
                console.error('[目标页复盘] 保存失败:', error);
              }
            }}
          />
        );
      })()}

      {editYearlyActualId && (() => {
        const year = editYearlyActualId;
        const existing = yearlyActuals.find((item) => item.year === year);
        return (
          <YearlyActualModal
            year={year}
            initial={existing || { actualGain: null, endBalance: null }}
            currency={displayCurrency}
            language={language}
            rate={isCNY ? rate : 1}
            onCancel={() => setEditYearlyActualId(null)}
            onSave={async (actualGain, endBalance) => {
              try {
                await db.upsertYearlyActual(year, actualGain, endBalance);
                const idx = yearlyActuals.findIndex((item) => item.year === year);
                if (idx >= 0) {
                  const next = [...yearlyActuals];
                  next[idx] = { ...next[idx], actualGain, endBalance };
                  setYearlyActuals(next);
                } else {
                  setYearlyActuals([...yearlyActuals, { year, actualGain, endBalance }]);
                }
                setEditYearlyActualId(null);
              } catch (error) {
                console.error('[目标页年度数据] 保存失败:', error);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
