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
}: {
  values: number[];
  color: string;
  glowColor: string;
  id: string;
}) {
  const width = 140;
  const height = 40;
  const line = sparklinePath(values, width, height);

  return (
    <svg width="140" height="40" viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-spark-stroke`} x1="0" y1="0" x2="140" y2="0">
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
      <path d="M 0 17 H 140" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" strokeDasharray="2 3" />
      <path d={line.fill} fill={`url(#${id}-spark-fill)`} />
      <path
        d={line.path}
        fill="none"
        stroke={`url(#${id}-spark-stroke)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${id}-spark-glow)`}
      />
      <circle cx={line.last.x} cy={line.last.y} r="4" fill={color} filter={`url(#${id}-spark-glow)`} />
      <circle cx={line.last.x} cy={line.last.y} r="10" fill={glowColor} opacity="0.16" />
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
  const x = 16 + (position / 100) * 288;
  const state = getVixState(v);
  const series = normalizeSparkline(sparkline, v || 15.8);
  const majorTicks = [0, 20, 30, 50];
  const sections = [
    { label: '低恐慌', range: '0-20', color: '#52df88' },
    { label: '中等恐慌', range: '20-30', color: '#ffe258' },
    { label: '高恐慌', range: '30-50', color: '#ff5b76' },
  ];

  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0f14] px-4 py-4 text-white shadow-[0_18px_46px_rgba(0,0,0,0.54),0_0_28px_rgba(73,222,128,0.06),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-34px_68px_rgba(3,7,12,0.42)]"
      style={{ fontFamily: CARD_FONT }}
      data-home-fear-card="vix"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(78,222,129,0.105),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(72,121,96,0.08),transparent_34%)]" />
      <div className="relative z-10">
        <div className="grid grid-cols-[minmax(0,1fr)_140px] items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="whitespace-nowrap text-[20px] font-normal leading-none tracking-[0.02em] text-white/[0.92]">VIX 恐慌指数</h3>
              {date && <span className="whitespace-nowrap text-[12px] font-normal text-white/[0.36]">{date}</span>}
            </div>
            <div className="mt-5 flex items-center gap-2.5">
              <span className="text-[52px] font-normal leading-[0.82] tracking-normal text-[#53e089] tabular-nums drop-shadow-[0_0_18px_rgba(83,224,137,0.25)]">
                {v.toFixed(1)}
              </span>
              <span className="relative mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/10">
                <span className="absolute h-14 w-14 rounded-full bg-emerald-400/10 blur-md" />
                <span className="absolute h-8 w-8 rounded-full border border-emerald-300/20 bg-emerald-400/10" />
                <span className="relative h-4 w-4 rounded-full bg-[#53e089] shadow-[0_0_18px_rgba(83,224,137,0.82)]" />
              </span>
            </div>
            <div className="mt-3 text-[16px] font-normal leading-none text-white/[0.48]">{state.desc}</div>
          </div>
          <div className="pt-[58px]">
            <TinySparkline values={series} color={state.color} glowColor={state.color} id={id} />
          </div>
        </div>

        <svg viewBox="0 0 320 84" className="mt-6 block w-full overflow-visible" aria-hidden="true">
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
          <rect x="16" y="12" width="288" height="9" rx="4.5" fill={`url(#${id}-bar)`} filter={`url(#${id}-bar-glow)`} />
          {Array.from({ length: 25 }).map((_, index) => {
            const tickX = 16 + (index / 24) * 288;
            const isMajor = majorTicks.some((tick) => Math.abs((tick / 50) * 100 - (index / 24) * 100) < 2);
            return (
              <line
                key={index}
                x1={tickX}
                x2={tickX}
                y1={isMajor ? 34 : 36}
                y2={isMajor ? 43 : 40}
                stroke={isMajor ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.18)'}
                strokeWidth={isMajor ? 1.3 : 0.9}
                strokeLinecap="round"
              />
            );
          })}
          {majorTicks.map((tick) => {
            const tickX = 16 + (tick / 50) * 288;
            return (
              <text key={tick} x={tickX} y="58" textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="12" fontWeight="400">
                {tick}
              </text>
            );
          })}
          <line x1={x} x2={x} y1="23" y2="68" stroke="rgba(255,255,255,0.26)" strokeWidth="1" strokeDasharray="2 3" />
          <circle cx={x} cy="16.5" r="20" fill="#52df88" opacity="0.13" filter={`url(#${id}-bar-glow)`} />
          <circle cx={x} cy="16.5" r="13" fill="rgba(11,15,20,0.85)" stroke="rgba(255,255,255,0.92)" strokeWidth="2.8" />
          <circle cx={x} cy="16.5" r="5" fill={`url(#${id}-indicator)`} />
          <text x={x} y="78" textAnchor="middle" fill="#76f0a0" fontSize="13" fontWeight="500" letterSpacing="0.4">
            {v.toFixed(1)}
          </text>
        </svg>

        <div className="mt-1 grid grid-cols-3 items-start text-center">
          {sections.map((item, index) => (
            <div key={item.label} className={`relative ${index > 0 ? 'before:absolute before:left-0 before:top-1 before:h-9 before:w-px before:bg-white/[0.12]' : ''}`}>
              <div className="text-[13px] font-normal leading-none" style={{ color: item.color }}>{item.label}</div>
              <div className="mt-2 text-[12px] font-normal leading-none text-white/[0.38]">{item.range}</div>
            </div>
          ))}
        </div>
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
  const center = { x: 160, y: 139 };
  const arcRadius = 103;
  const pointer = polarPoint(center.x, center.y, 89, angle);
  const state = getFearGreedState(v);
  const series = normalizeSparkline(sparkline, v || 32);
  const labelSections = [
    { label: '极度恐惧', range: '0-20', color: '#ff5c72' },
    { label: '恐惧', range: '20-40', color: '#ff6678' },
    { label: '中性', range: '40-60', color: '#f7d957' },
    { label: '贪婪', range: '60-80', color: '#6cda67' },
    { label: '极度贪婪', range: '80-100', color: '#39ca70' },
  ];

  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0f14] px-4 py-4 text-white shadow-[0_18px_46px_rgba(0,0,0,0.56),0_0_30px_rgba(255,94,115,0.045),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-34px_68px_rgba(3,7,12,0.42)]"
      style={{ fontFamily: CARD_FONT }}
      data-home-fear-card="fear-greed"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,84,108,0.105),transparent_33%),radial-gradient(circle_at_80%_46%,rgba(253,224,71,0.07),transparent_34%)]" />
      <div className="relative z-10">
        <div className="grid grid-cols-[minmax(0,1fr)_140px] items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="whitespace-nowrap text-[20px] font-normal leading-none tracking-normal text-white/[0.92]">恐慌贪婪指数</h3>
              {date && <span className="whitespace-nowrap text-[12px] font-normal text-white/[0.36]">{date}</span>}
            </div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-[52px] font-normal leading-[0.82] tracking-normal tabular-nums drop-shadow-[0_0_16px_rgba(255,99,121,0.2)]" style={{ color: state.color }}>
                {Math.round(v)}
              </span>
              <span className="text-[19px] font-normal leading-none" style={{ color: state.color }}>{state.label}</span>
            </div>
            <div className="mt-3 text-[16px] font-normal leading-none text-white/[0.48]">{state.desc}</div>
          </div>
          <div className="pt-[58px]">
            <TinySparkline values={series} color={state.color} glowColor={state.color} id={id} />
          </div>
        </div>

        <svg viewBox="0 0 320 176" className="-mt-2 block w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gauge`} gradientUnits="userSpaceOnUse" x1="44" y1="139" x2="276" y2="139">
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
            const tick = polarPoint(center.x, center.y, 115, tickAngle);
            return (
              <circle
                key={index}
                cx={tick.x}
                cy={tick.y}
                r="1.1"
                fill={index < 17 ? '#ff5d75' : index < 26 ? '#f6da54' : '#5ed172'}
                opacity="0.26"
              />
            );
          })}
          <path d={describeArc(center.x, center.y, arcRadius, 180, 360)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="25" strokeLinecap="round" />
          <path d={describeArc(center.x, center.y, arcRadius, 180, 360)} fill="none" stroke={`url(#${id}-gauge)`} strokeWidth="22" strokeLinecap="round" filter={`url(#${id}-glow)`} />
          <path d={describeArc(center.x, center.y, 74, 185, 355)} fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1.2" />
          <path d={describeArc(center.x, center.y, 50, 195, 345)} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          {[20, 40, 60, 80].map((tick) => {
            const tickAngle = valueToAngle(tick);
            const outer = polarPoint(center.x, center.y, arcRadius + 13, tickAngle);
            const inner = polarPoint(center.x, center.y, arcRadius - 14, tickAngle);
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(4,8,13,0.45)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            );
          })}
          <text x="38" y="164" textAnchor="middle" fill="rgba(255,255,255,0.48)" fontSize="13">0</text>
          <text x="160" y="78" textAnchor="middle" fill="rgba(255,255,255,0.52)" fontSize="13">50</text>
          <text x="282" y="164" textAnchor="middle" fill="rgba(255,255,255,0.48)" fontSize="13">100</text>
          <line
            x1={center.x}
            y1={center.y}
            x2={pointer.x}
            y2={pointer.y}
            stroke={`url(#${id}-needle)`}
            strokeWidth="3"
            strokeLinecap="round"
            filter={`url(#${id}-glow)`}
          />
          <circle cx={center.x} cy={center.y} r="27" fill="rgba(255,88,111,0.08)" stroke="rgba(255,92,113,0.24)" strokeWidth="1.4" />
          <circle cx={center.x} cy={center.y} r="12" fill="rgba(7,10,15,0.78)" stroke="rgba(255,92,113,0.45)" strokeWidth="1.6" filter={`url(#${id}-glow)`} />
          <circle cx={center.x} cy={center.y} r="4.2" fill="#ffd6dc" />
          <circle cx={pointer.x} cy={pointer.y} r="17" fill={state.color} opacity="0.16" filter={`url(#${id}-glow)`} />
          <circle cx={pointer.x} cy={pointer.y} r="12" fill="rgba(11,15,20,0.88)" stroke="rgba(255,255,255,0.9)" strokeWidth="3" />
          <circle cx={pointer.x} cy={pointer.y} r="5.5" fill={state.color} filter={`url(#${id}-glow)`} />
        </svg>

        <div className="-mt-1 grid grid-cols-5 text-center">
          {labelSections.map((item, index) => (
            <div key={item.label} className={`relative ${index > 0 ? 'before:absolute before:left-0 before:top-1 before:h-9 before:w-px before:bg-white/[0.12]' : ''}`}>
              <div className="text-[11px] font-normal leading-none" style={{ color: item.color }}>{item.label}</div>
              <div className="mt-2 text-[11px] font-normal leading-none text-white/[0.36]">{item.range}</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
