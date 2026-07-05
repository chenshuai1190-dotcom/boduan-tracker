import React from 'react';

type Props = {
  value: number;
  date: string;
  sparkline: number[];
};

const CARD_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const safeNumber = (value: number) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const getPosition = (value: number) => clamp(safeNumber(value), 0, 50) / 50 * 100;

export const valueToAngle = (value: number) => 180 + (clamp(safeNumber(value), 0, 100) / 100) * 180;

const polarPoint = (cx: number, cy: number, r: number, angle: number) => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  };
};

export const describeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarPoint(cx, cy, r, startAngle);
  const end = polarPoint(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

const normalizeSparkline = (values: number[], fallback: number) => {
  const clean = values.filter((item) => Number.isFinite(Number(item))).map(Number);
  if (clean.length >= 2) return clean;
  return [fallback * 0.86, fallback * 0.95, fallback * 0.9, fallback * 1.04, fallback];
};

const sparklinePath = (values: number[], width: number, height: number) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return {
      x,
      y: clamp(y, 3, height - 3),
    };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  return {
    path,
    fill: `${path} L ${width} ${height} L 0 ${height} Z`,
    last: points[points.length - 1],
  };
};

function TinySparkline({
  values,
  color,
  glowColor,
  id,
  width = 140,
  height = 40,
  strokeWidth = 2,
}: {
  values: number[];
  color: string;
  glowColor: string;
  id: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const line = sparklinePath(values, width, height);
  const baselineY = Math.round(height * 0.42);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-spark-stroke`} x1="0" y1="0" x2={width} y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="60%" stopColor={color} stopOpacity="0.72" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <linearGradient id={`${id}-spark-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-spark-glow`} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={`M 0 ${baselineY} H ${width}`} stroke="rgba(255,255,255,0.08)" strokeWidth="0.7" strokeDasharray="2 3" />
      <path d={line.fill} fill={`url(#${id}-spark-fill)`} />
      <path
        d={line.path}
        fill="none"
        stroke={`url(#${id}-spark-stroke)`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${id}-spark-glow)`}
      />
      <circle cx={line.last.x} cy={line.last.y} r={Math.max(2.7, strokeWidth * 1.8)} fill={color} filter={`url(#${id}-spark-glow)`} />
      <circle cx={line.last.x} cy={line.last.y} r={Math.max(7, strokeWidth * 4.5)} fill={glowColor} opacity="0.16" />
    </svg>
  );
}

const getVixState = (value: number) => {
  const v = safeNumber(value);
  if (v < 20) return { label: '市场平静', desc: '市场平静, 无操作', color: '#53e089' };
  if (v < 30) return { label: '轻度波动', desc: '轻度波动, 控制仓位', color: '#e9d64a' };
  return { label: '风险上升', desc: '风险上升, 保持防守', color: '#ff5973' };
};

export function VixFearIndexCard({ value, date, sparkline }: Props) {
  const rawId = React.useId().replace(/:/g, '');
  const id = `vix-fear-${rawId}`;
  const v = clamp(safeNumber(value), 0, 50);
  const position = getPosition(v);
  const x = 10 + (position / 100) * 140;
  const state = getVixState(v);
  const series = normalizeSparkline(sparkline, v || 15.8);
  const majorTicks = [0, 20, 30, 50];

  return (
    <article
      className="relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0f14] px-3 py-3 text-white shadow-[0_14px_34px_rgba(0,0,0,0.5),0_0_22px_rgba(73,222,128,0.055),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-24px_48px_rgba(3,7,12,0.42)]"
      style={{ fontFamily: CARD_FONT }}
      data-home-fear-card="vix"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(78,222,129,0.105),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(72,121,96,0.08),transparent_34%)]" />
      <div className="relative z-10">
        <div className="flex items-baseline gap-1.5">
          <h3 className="min-w-0 truncate text-[12px] font-normal leading-none tracking-normal text-white/[0.92]">VIX 恐慌指数</h3>
          {date && <span className="shrink-0 whitespace-nowrap text-[9px] font-normal text-white/[0.36]">{date}</span>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[36px] font-normal leading-[0.82] tracking-normal text-[#53e089] tabular-nums drop-shadow-[0_0_14px_rgba(83,224,137,0.25)]">
            {v.toFixed(1)}
          </span>
          <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10">
            <span className="absolute h-9 w-9 rounded-full bg-emerald-400/10 blur-md" />
            <span className="absolute h-5 w-5 rounded-full border border-emerald-300/20 bg-emerald-400/10" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-[#53e089] shadow-[0_0_14px_rgba(83,224,137,0.82)]" />
          </span>
        </div>
        <div className="mt-2 truncate text-[11px] font-normal leading-none text-white/[0.48]">{state.desc}</div>
        <div className="mt-3">
          <TinySparkline values={series} color={state.color} glowColor={state.color} id={id} height={26} strokeWidth={1.5} />
        </div>

        <svg viewBox="0 0 160 60" className="mt-3 block w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4cdd87" />
              <stop offset="40%" stopColor="#5ee58b" />
              <stop offset="58%" stopColor="#f2e553" />
              <stop offset="74%" stopColor="#ffb84a" />
              <stop offset="100%" stopColor="#ff5574" />
            </linearGradient>
            <filter id={`${id}-bar-glow`} x="-10%" y="-200%" width="120%" height="500%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id={`${id}-indicator`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fff9" />
              <stop offset="100%" stopColor="#57e48b" />
            </linearGradient>
          </defs>
          <rect x="10" y="10" width="140" height="6" rx="3" fill={`url(#${id}-bar)`} filter={`url(#${id}-bar-glow)`} />
          {Array.from({ length: 25 }).map((_, index) => {
            const tickX = 10 + (index / 24) * 140;
            const isMajor = majorTicks.some((tick) => Math.abs((tick / 50) * 100 - (index / 24) * 100) < 2);
            return (
              <line
                key={index}
                x1={tickX}
                x2={tickX}
                y1={isMajor ? 27 : 29}
                y2={isMajor ? 35 : 33}
                stroke={isMajor ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.18)'}
                strokeWidth={isMajor ? 1 : 0.75}
                strokeLinecap="round"
              />
            );
          })}
          {majorTicks.map((tick) => {
            const tickX = 10 + (tick / 50) * 140;
            return (
              <text key={tick} x={tickX} y="48" textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="8" fontWeight="400">
                {tick}
              </text>
            );
          })}
          <line x1={x} x2={x} y1="19" y2="51" stroke="rgba(255,255,255,0.24)" strokeWidth="0.8" strokeDasharray="2 3" />
          <circle cx={x} cy="13" r="13" fill="#52df88" opacity="0.13" filter={`url(#${id}-bar-glow)`} />
          <circle cx={x} cy="13" r="8" fill="rgba(11,15,20,0.85)" stroke="rgba(255,255,255,0.92)" strokeWidth="2" />
          <circle cx={x} cy="13" r="3.2" fill={`url(#${id}-indicator)`} />
          <text x={x} y="59" textAnchor="middle" fill="#76f0a0" fontSize="8.5" fontWeight="500" letterSpacing="0.2">
            {v.toFixed(1)}
          </text>
        </svg>
      </div>
    </article>
  );
}

const getFearGreedState = (value: number) => {
  const v = clamp(safeNumber(value), 0, 100);
  if (v <= 20) return { label: '极度恐惧', desc: '市场极度恐惧，等待确认', color: '#ff5770' };
  if (v <= 40) return { label: '恐惧', desc: '市场偏恐惧, 谨慎布局', color: '#ff6678' };
  if (v <= 60) return { label: '中性', desc: '市场情绪中性，保持观察', color: '#f6d84f' };
  if (v <= 80) return { label: '贪婪', desc: '市场偏贪婪，控制追高', color: '#76db66' };
  return { label: '极度贪婪', desc: '市场过热，防守减仓', color: '#36c96e' };
};

export function FearGreedIndexCard({ value, date, sparkline }: Props) {
  const rawId = React.useId().replace(/:/g, '');
  const id = `fear-greed-${rawId}`;
  const v = clamp(safeNumber(value), 0, 100);
  const angle = valueToAngle(v);
  const center = { x: 80, y: 84 };
  const arcRadius = 56;
  const pointer = polarPoint(center.x, center.y, 47, angle);
  const state = getFearGreedState(v);
  const series = normalizeSparkline(sparkline, v || 32);

  return (
    <article
      className="relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0f14] px-3 py-3 text-white shadow-[0_14px_34px_rgba(0,0,0,0.52),0_0_24px_rgba(255,94,115,0.045),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-24px_48px_rgba(3,7,12,0.42)]"
      style={{ fontFamily: CARD_FONT }}
      data-home-fear-card="fear-greed"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,84,108,0.105),transparent_33%),radial-gradient(circle_at_80%_46%,rgba(253,224,71,0.07),transparent_34%)]" />
      <div className="relative z-10">
        <div className="flex items-baseline gap-1.5">
          <h3 className="min-w-0 truncate text-[12px] font-normal leading-none tracking-normal text-white/[0.92]">恐慌贪婪指数</h3>
          {date && <span className="shrink-0 whitespace-nowrap text-[9px] font-normal text-white/[0.36]">{date}</span>}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[36px] font-normal leading-[0.82] tracking-normal tabular-nums drop-shadow-[0_0_14px_rgba(255,99,121,0.2)]" style={{ color: state.color }}>
            {Math.round(v)}
          </span>
          <span className="text-[12px] font-normal leading-none" style={{ color: state.color }}>{state.label}</span>
        </div>
        <div className="mt-2 truncate text-[11px] font-normal leading-none text-white/[0.48]">{state.desc}</div>
        <div className="mt-3">
          <TinySparkline values={series} color={state.color} glowColor={state.color} id={id} height={26} strokeWidth={1.5} />
        </div>

        <svg viewBox="0 0 160 104" className="mt-1 block w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gauge`} gradientUnits="userSpaceOnUse" x1="24" y1="84" x2="136" y2="84">
              <stop offset="0%" stopColor="#e44359" />
              <stop offset="22%" stopColor="#ff6655" />
              <stop offset="46%" stopColor="#f6a83e" />
              <stop offset="58%" stopColor="#f7dc4f" />
              <stop offset="78%" stopColor="#99dc57" />
              <stop offset="100%" stopColor="#38c96e" />
            </linearGradient>
            <linearGradient id={`${id}-needle`} gradientUnits="userSpaceOnUse" x1={center.x} y1={center.y} x2={pointer.x} y2={pointer.y}>
              <stop offset="0%" stopColor="#ff5d75" />
              <stop offset="100%" stopColor="#ffd6dc" />
            </linearGradient>
            <filter id={`${id}-glow`} x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {Array.from({ length: 43 }).map((_, index) => {
            const tickAngle = 180 + (index / 42) * 180;
            const tick = polarPoint(center.x, center.y, 64, tickAngle);
            return (
              <circle
                key={index}
                cx={tick.x}
                cy={tick.y}
                r="0.65"
                fill={index < 17 ? '#ff5d75' : index < 26 ? '#f6da54' : '#5ed172'}
                opacity="0.22"
              />
            );
          })}
          <path d={describeArc(center.x, center.y, arcRadius, 180, 360)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="10" strokeLinecap="round" />
          <path d={describeArc(center.x, center.y, arcRadius, 180, 360)} fill="none" stroke={`url(#${id}-gauge)`} strokeWidth="8" strokeLinecap="round" filter={`url(#${id}-glow)`} />
          <path d={describeArc(center.x, center.y, 39, 185, 355)} fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="0.8" />
          <path d={describeArc(center.x, center.y, 27, 195, 345)} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.7" />
          {[20, 40, 60, 80].map((tick) => {
            const tickAngle = valueToAngle(tick);
            const outer = polarPoint(center.x, center.y, arcRadius + 7, tickAngle);
            const inner = polarPoint(center.x, center.y, arcRadius - 7, tickAngle);
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(4,8,13,0.45)"
                strokeWidth="1"
                strokeLinecap="round"
              />
            );
          })}
          <text x="18" y="95" textAnchor="middle" fill="rgba(255,255,255,0.48)" fontSize="8">0</text>
          <text x="80" y="53" textAnchor="middle" fill="rgba(255,255,255,0.52)" fontSize="8">50</text>
          <text x="142" y="95" textAnchor="middle" fill="rgba(255,255,255,0.48)" fontSize="8">100</text>
          <line
            x1={center.x}
            y1={center.y}
            x2={pointer.x}
            y2={pointer.y}
            stroke={`url(#${id}-needle)`}
            strokeWidth="1.4"
            strokeLinecap="round"
            filter={`url(#${id}-glow)`}
          />
          <circle cx={center.x} cy={center.y} r="12" fill="rgba(255,88,111,0.08)" stroke="rgba(255,92,113,0.24)" strokeWidth="0.9" />
          <circle cx={center.x} cy={center.y} r="5.5" fill="rgba(7,10,15,0.78)" stroke="rgba(255,92,113,0.45)" strokeWidth="0.9" filter={`url(#${id}-glow)`} />
          <circle cx={center.x} cy={center.y} r="2.2" fill="#ffd6dc" />
          <circle cx={pointer.x} cy={pointer.y} r="10" fill={state.color} opacity="0.16" filter={`url(#${id}-glow)`} />
          <circle cx={pointer.x} cy={pointer.y} r="6.5" fill="rgba(11,15,20,0.88)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.7" />
          <circle cx={pointer.x} cy={pointer.y} r="2.9" fill={state.color} filter={`url(#${id}-glow)`} />
        </svg>
      </div>
    </article>
  );
}
