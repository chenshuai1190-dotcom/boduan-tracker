import React from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Info,
  Plus,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const MOCK_CNY_RATE = 6.77;
const HISTORICAL_PNL_CNY = 1197740.58;
const PROFIT = '#ff5b50';
const LOSS = '#36c49a';
const GOLD = '#f6b54b';

const COMPANY_NAMES = {
  NVDA: '英伟达',
  MSFT: '微软',
  AAPL: '苹果',
  TSLA: '特斯拉',
};

const INITIAL_GROUPS = [
  {
    symbol: 'NVDA',
    name: '英伟达',
    currentPrice: 210.77,
    summaryAvg: 179.78,
    summaryReturn: 0.172,
    summaryDays: 82,
    waves: [
      {
        id: 'nvda-wave-01',
        status: 'active',
        buyPrice: 176.2,
        shares: 600,
        startDate: '2026-04-21',
        returnPct: 0.196,
        pnlCny: 128320,
        note: '计划 250 开始分批卖出',
      },
      {
        id: 'nvda-wave-02',
        status: 'active',
        buyPrice: 182.5,
        shares: 700,
        startDate: '2026-05-05',
        returnPct: 0.143,
        pnlCny: 132510,
        note: '跌破 30MA 减仓',
      },
      {
        id: 'nvda-wave-03',
        status: 'active',
        buyPrice: 179.1,
        shares: 700,
        startDate: '2026-05-19',
        returnPct: 0.171,
        pnlCny: 158899,
        note: '作为核心波段继续持有',
      },
    ],
  },
  {
    symbol: 'MSFT',
    name: '微软',
    currentPrice: 385.12,
    summaryAvg: 420.49,
    summaryReturn: -0.084,
    summaryDays: 118,
    waves: [
      {
        id: 'msft-wave-01',
        status: 'active',
        buyPrice: 420.49,
        shares: 1000,
        startDate: '2026-03-15',
        returnPct: -0.084,
        pnlCny: -35370,
        note: '等待基本面修复后再决定',
      },
    ],
  },
  {
    symbol: 'AAPL',
    name: '苹果',
    currentPrice: 201.18,
    summaryAvg: 192.4,
    summaryReturn: 0.046,
    summaryDays: 133,
    waves: [
      {
        id: 'aapl-wave-01',
        status: 'active',
        buyPrice: 192.4,
        shares: 1500,
        startDate: '2026-02-28',
        returnPct: 0.046,
        pnlCny: 98670,
        note: '观察新产品周期',
      },
    ],
  },
  {
    symbol: 'TSLA',
    name: '特斯拉',
    currentPrice: 265.21,
    summaryAvg: 217.36,
    summaryReturn: 0.22,
    summaryDays: 92,
    waves: [
      {
        id: 'tsla-wave-01',
        status: 'completed',
        buyPrice: 217.36,
        sellPrice: 265.21,
        shares: 800,
        startDate: '2025-11-10',
        endDate: '2026-02-10',
        heldDays: 92,
        returnPct: 0.22,
        pnlCny: 382910,
        note: '达到计划价后一次性卖出',
      },
    ],
  },
];

function cloneGroups() {
  return INITIAL_GROUPS.map((group) => ({
    ...group,
    waves: group.waves.map((wave) => ({ ...wave })),
  }));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value, digits = 0) {
  return number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPrice(value) {
  return `$${formatNumber(value, 2)}`;
}

function formatPnl(value, digits = 0) {
  const amount = number(value);
  return `${amount >= 0 ? '+' : '-'}¥${formatNumber(Math.abs(amount), digits)}`;
}

function formatPct(value) {
  const pct = number(value) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function tone(value) {
  return number(value) >= 0 ? PROFIT : LOSS;
}

function shortDate(value) {
  return String(value || '').slice(5).replace('-', '-');
}

function inclusiveDays(startDate, endDate = '2026-07-11') {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function activeWaves(group) {
  return group.waves.filter((wave) => wave.status === 'active');
}

function groupSummary(group, waves = group.waves) {
  const active = waves.filter((wave) => wave.status === 'active');
  const source = active.length > 0 ? active : waves;
  const usePreset = waves.length === group.waves.length;
  const shares = source.reduce((sum, wave) => sum + number(wave.shares), 0);
  const weightedCost = source.reduce((sum, wave) => sum + number(wave.buyPrice) * number(wave.shares), 0);
  const weightedExit = source.reduce((sum, wave) => sum + number(wave.sellPrice) * number(wave.shares), 0);
  const average = (usePreset ? group.summaryAvg : undefined) ?? (shares > 0 ? weightedCost / shares : 0);
  const sellAverage = shares > 0 ? weightedExit / shares : 0;
  const pnl = source.reduce((sum, wave) => sum + number(wave.pnlCny), 0);
  const fallbackReturn = weightedCost > 0 ? pnl / (weightedCost * MOCK_CNY_RATE) : 0;
  const firstWave = [...source].sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
  const lastWave = [...source].sort((left, right) => String(right.endDate || '').localeCompare(String(left.endDate || '')))[0];
  return {
    activeCount: active.length,
    average,
    currentPrice: group.currentPrice,
    days: (usePreset ? group.summaryDays : undefined) ?? inclusiveDays(firstWave?.startDate, active.length > 0 ? undefined : lastWave?.endDate),
    endDate: lastWave?.endDate,
    firstDate: firstWave?.startDate,
    pnl,
    returnPct: (usePreset ? group.summaryReturn : undefined) ?? fallbackReturn,
    sellAverage,
    shares,
    status: active.length > 0 ? 'active' : 'completed',
  };
}

function statusAccent(status, value) {
  const result = number(value);
  if (status === 'completed' || result === 0) return 'gray';
  return result > 0 ? 'red' : 'green';
}

function StatusDot({ accent = 'gray', pulse = false }) {
  const color = accent === 'gray' ? '#8d949d' : accent === 'green' ? LOSS : PROFIT;
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}55` }}
      aria-hidden="true"
    />
  );
}

function LogoBadge({ symbol }) {
  return (
    <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.13] bg-black/[0.38] shadow-[0_8px_22px_rgba(0,0,0,0.36)]">
      <StockLogo
        symbol={symbol}
        urls={stockLogoCandidates(symbol)}
        className="h-8 w-8 rounded-[7px]"
      />
    </div>
  );
}

function Metric({ label, value, valueColor = 'rgba(255,255,255,0.84)', align = 'left' }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="truncate text-[10px] leading-3 text-white/[0.36]">{label}</div>
      <div
        className="mt-1 truncate text-[11.5px] font-normal leading-[15px] tabular-nums"
        style={{ color: valueColor, fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
    </div>
  );
}

function FormField({ label, prefix, children, ...inputProps }) {
  return (
    <label className="block min-w-0 max-w-full overflow-hidden">
      <span className="mb-1.5 block text-[10.5px] font-normal text-white/[0.38]">{label}</span>
      <span className="flex h-10 w-full min-w-0 max-w-full items-center overflow-hidden rounded-[11px] border border-white/[0.08] bg-black/[0.18] px-2.5 focus-within:border-[#f6b54b]/35">
        {prefix ? <span className="mr-1.5 text-[13px] text-white/[0.38]">{prefix}</span> : null}
        {children || (
          <input
            {...inputProps}
            className="block h-full min-w-0 max-w-full flex-1 bg-transparent text-[12.5px] font-normal text-white/[0.82] outline-none placeholder:text-white/[0.18] tabular-nums"
            style={{
              boxSizing: 'border-box',
              colorScheme: 'dark',
              fontFamily: NUMBER_FONT,
              maxWidth: '100%',
              minWidth: 0,
              WebkitMinLogicalWidth: '0px',
              width: '100%',
            }}
          />
        )}
      </span>
    </label>
  );
}

function ModalFormScroller({ children }) {
  return (
    <div className="max-h-[52dvh] min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">
      {children}
    </div>
  );
}

function WaveRow({ group, wave, index, onAction }) {
  const isActive = wave.status === 'active';
  const price = isActive ? group.currentPrice : wave.sellPrice;
  const days = wave.heldDays ?? inclusiveDays(wave.startDate, wave.endDate);
  return (
    <button
      type="button"
      onClick={() => onAction(wave)}
      className="block w-full border-t border-white/[0.075] px-3.5 py-3 text-left outline-none active:bg-white/[0.025] focus-visible:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#f6b54b]/35"
      aria-label={`打开 ${group.symbol} 波段 ${String(index + 1).padStart(2, '0')} 操作`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className="rounded-[7px] border border-[#f6b54b]/55 px-2 py-1 text-[10px] font-normal text-[#f5bd62] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          波段 {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex min-w-0 items-center gap-2 text-[10.5px] text-white/[0.58]">
          <StatusDot accent={statusAccent(wave.status, wave.returnPct)} pulse={isActive} />
          <span className="shrink-0 text-white/[0.76]">{isActive ? '进行中' : '已完成'}</span>
          <span className="h-3 w-px shrink-0 bg-white/[0.09]" />
          <span className="truncate tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            {isActive ? `${shortDate(wave.startDate)} 开始 · 第 ${days} 天` : `${shortDate(wave.startDate)} ~ ${shortDate(wave.endDate)} · ${days} 天`}
          </span>
        </div>
        <span className="text-[16px] font-normal tabular-nums" style={{ color: tone(wave.returnPct), fontFamily: NUMBER_FONT }}>
          {formatPct(wave.returnPct)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Metric label="买入均价" value={formatPrice(wave.buyPrice)} />
        <Metric label={isActive ? '现价' : '卖出均价'} value={formatPrice(price)} valueColor={tone(wave.returnPct)} />
        <Metric label={isActive ? '持有' : '卖出'} value={`${formatNumber(wave.shares)} 股`} />
        <Metric label={isActive ? '浮盈' : '已实现'} value={formatPnl(wave.pnlCny)} valueColor={tone(wave.pnlCny)} align="right" />
      </div>

      <div className="mt-3 flex min-h-6 items-center gap-2 border-t border-white/[0.045] pt-2.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-white/[0.32]" strokeWidth={1.7} />
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-white/[0.42]">{wave.note || '暂无计划备注'}</span>
      </div>
    </button>
  );
}

function StockCard({ group, expanded, filter, onToggle, onAction }) {
  const visibleWaves = filter === 'active'
    ? group.waves.filter((wave) => wave.status === 'active')
    : filter === 'completed'
      ? group.waves.filter((wave) => wave.status === 'completed')
      : group.waves;
  const summary = groupSummary(group, visibleWaves);
  const isActive = summary.status === 'active';
  return (
    <article className="overflow-hidden rounded-[18px] border border-[#1a2530] bg-[linear-gradient(145deg,rgba(15,21,29,0.98),rgba(8,13,19,0.98))] shadow-[0_15px_38px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.025)]">
      <button type="button" onClick={onToggle} className="block w-full px-3.5 py-3.5 text-left outline-none active:bg-white/[0.025] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#f6b54b]/40" aria-expanded={expanded}>
        <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3">
          <LogoBadge symbol={group.symbol} />
          <div className="min-w-0">
            <div className="truncate text-[19px] font-normal leading-6 tracking-[0.01em] text-white/[0.94]">{group.symbol}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-white/[0.43]">{group.name}</div>
            {!expanded ? (
              <div className="mt-1.5 whitespace-nowrap text-[10px] text-white/[0.38] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {isActive
                  ? `${shortDate(summary.firstDate)} 开始 · 第 ${summary.days} 天`
                  : `${shortDate(summary.firstDate)} ~ ${shortDate(summary.endDate)} · ${summary.days} 天`}
              </div>
            ) : null}
          </div>
          <div className="flex min-w-[54px] items-center justify-end gap-2 text-right">
            <div>
              <div className="text-[19px] font-normal tabular-nums" style={{ color: tone(summary.returnPct), fontFamily: NUMBER_FONT }}>
                {formatPct(summary.returnPct)}
              </div>
              {expanded ? <div className="mt-0.5 text-[10px] text-white/[0.35]">总收益率</div> : null}
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-white/[0.68]" /> : <ChevronRight className="h-4 w-4 text-white/[0.48]" />}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/[0.075] pt-3">
          <Metric label={expanded && isActive ? '总持仓' : '持仓'} value={`${formatNumber(summary.shares)} 股`} />
          <Metric label={expanded ? '均价' : '买入均价'} value={formatPrice(summary.average)} />
          <Metric label={isActive ? '最新价' : '卖出均价'} value={formatPrice(isActive ? summary.currentPrice : summary.sellAverage)} valueColor={tone(summary.returnPct)} />
          <Metric label={isActive ? (expanded ? '总浮盈' : '浮盈') : '已实现'} value={formatPnl(summary.pnl)} valueColor={tone(summary.pnl)} align="right" />
        </div>
      </button>

      {expanded ? (
        <div>
          {visibleWaves.map((wave) => (
            <WaveRow
              key={wave.id}
              group={group}
              wave={wave}
              index={group.waves.findIndex((item) => item.id === wave.id)}
              onAction={(selected) => onAction(group, selected)}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ModalStockHeader({ group, wave, sideLabel }) {
  return (
    <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5">
      <div className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full border border-white/[0.13] bg-black/[0.38]">
        <StockLogo symbol={group.symbol} urls={stockLogoCandidates(group.symbol)} className="h-6 w-6 rounded-[4px]" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-normal leading-5 text-white/[0.82]">{group.symbol}</div>
        <div className="mt-[3px] truncate text-[11.5px] leading-4 text-white/[0.42]">{group.name}</div>
      </div>
      <div className="text-right">
        <div className="whitespace-nowrap text-[13px] text-white/[0.5]">{sideLabel}</div>
        <div className="mt-0.5 whitespace-nowrap text-[11px] text-white/[0.34] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          {wave ? `${formatNumber(wave.shares)} 股 @ ${formatPrice(wave.buyPrice)}` : '完整买入 · 独立波段'}
        </div>
      </div>
    </div>
  );
}

export default function WaveTrackerPrototype() {
  const initialExpanded = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('waveView') === 'expanded'
    ? 'NVDA'
    : '';
  const [groups, setGroups] = React.useState(cloneGroups);
  const [expandedSymbol, setExpandedSymbol] = React.useState(initialExpanded);
  const [filter, setFilter] = React.useState('all');
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [modal, setModal] = React.useState(null);
  const [draft, setDraft] = React.useState({});

  const activeStockCount = groups.filter((group) => activeWaves(group).length > 0).length;
  const activeWaveCount = groups.reduce((sum, group) => sum + activeWaves(group).length, 0);
  const cumulativePnl = HISTORICAL_PNL_CNY + groups.reduce(
    (total, group) => total + group.waves.reduce((sum, wave) => sum + number(wave.pnlCny), 0),
    0,
  );
  const visibleGroups = groups.filter((group) => {
    if (filter === 'active') return group.waves.some((wave) => wave.status === 'active');
    if (filter === 'completed') return group.waves.some((wave) => wave.status === 'completed');
    return true;
  });

  const findSelection = React.useCallback(() => {
    if (!modal?.symbol || !modal?.waveId) return { group: null, wave: null };
    const group = groups.find((item) => item.symbol === modal.symbol) || null;
    const wave = group?.waves.find((item) => item.id === modal.waveId) || null;
    return { group, wave };
  }, [groups, modal]);
  const selection = findSelection();

  const openAdd = () => {
    setDraft({
      symbol: '',
      buyPrice: '',
      shares: '',
      startDate: '2026-07-11',
      note: '',
    });
    setModal({ type: 'add' });
  };

  const openDetail = (group, wave) => setModal({ type: 'detail', symbol: group.symbol, waveId: wave.id });
  const openActions = (group, wave) => setModal({ type: 'actions', symbol: group.symbol, waveId: wave.id });
  const openEdit = (group, wave) => {
    setDraft({
      buyPrice: String(wave.buyPrice),
      shares: String(wave.shares),
      startDate: wave.startDate,
      sellPrice: wave.sellPrice ? String(wave.sellPrice) : '',
      endDate: wave.endDate || '',
      note: wave.note || '',
    });
    setModal({ type: 'edit', symbol: group.symbol, waveId: wave.id });
  };
  const openSell = (group, wave) => {
    setDraft({ sellPrice: '', endDate: '2026-07-11' });
    setModal({ type: 'sell', symbol: group.symbol, waveId: wave.id });
  };

  const addWave = () => {
    const symbol = String(draft.symbol || '').trim().toUpperCase();
    const buyPrice = number(draft.buyPrice);
    const shares = number(draft.shares);
    if (!symbol || buyPrice <= 0 || shares <= 0 || !draft.startDate) return;
    setGroups((current) => {
      const existing = current.find((group) => group.symbol === symbol);
      const currentPrice = existing?.currentPrice || buyPrice;
      const wave = {
        id: `${symbol.toLowerCase()}-${Date.now()}`,
        status: 'active',
        buyPrice,
        shares,
        startDate: draft.startDate,
        returnPct: buyPrice > 0 ? (currentPrice - buyPrice) / buyPrice : 0,
        pnlCny: (currentPrice - buyPrice) * shares * MOCK_CNY_RATE,
        note: String(draft.note || '').trim(),
      };
      if (!existing) {
        return [{ symbol, name: COMPANY_NAMES[symbol] || symbol, currentPrice, waves: [wave] }, ...current];
      }
      return current.map((group) => (
        group.symbol === symbol
          ? { ...group, summaryAvg: undefined, summaryReturn: undefined, summaryDays: undefined, waves: [...group.waves, wave] }
          : group
      ));
    });
    setExpandedSymbol(symbol);
    setFilter('all');
    setModal(null);
  };

  const saveEdit = () => {
    if (!selection.group || !selection.wave) return;
    const buyPrice = number(draft.buyPrice);
    const shares = number(draft.shares);
    const completed = selection.wave.status === 'completed';
    const sellPrice = completed ? number(draft.sellPrice) : 0;
    if (
      buyPrice <= 0
      || shares <= 0
      || !draft.startDate
      || (completed && (sellPrice <= 0 || !draft.endDate || draft.endDate < draft.startDate))
    ) return;
    setGroups((current) => current.map((group) => {
      if (group.symbol !== selection.group.symbol) return group;
      return {
        ...group,
        summaryAvg: undefined,
        summaryReturn: undefined,
        summaryDays: undefined,
        waves: group.waves.map((wave) => {
          if (wave.id !== selection.wave.id) return wave;
          const exitPrice = completed ? sellPrice : number(group.currentPrice);
          return {
            ...wave,
            buyPrice,
            shares,
            startDate: draft.startDate,
            ...(completed ? {
              sellPrice,
              endDate: draft.endDate,
              heldDays: draft.startDate !== wave.startDate || draft.endDate !== wave.endDate
                ? inclusiveDays(draft.startDate, draft.endDate)
                : wave.heldDays,
            } : {}),
            note: String(draft.note || '').trim(),
            returnPct: buyPrice > 0 ? (exitPrice - buyPrice) / buyPrice : 0,
            pnlCny: (exitPrice - buyPrice) * shares * MOCK_CNY_RATE,
          };
        }),
      };
    }));
    setModal(null);
  };

  const completeSell = () => {
    if (!selection.group || !selection.wave) return;
    const sellPrice = number(draft.sellPrice);
    if (sellPrice <= 0 || !draft.endDate || draft.endDate < selection.wave.startDate) return;
    setGroups((current) => current.map((group) => {
      if (group.symbol !== selection.group.symbol) return group;
      return {
        ...group,
        summaryAvg: undefined,
        summaryReturn: undefined,
        summaryDays: undefined,
        waves: group.waves.map((wave) => (
          wave.id === selection.wave.id
            ? {
                ...wave,
                status: 'completed',
                sellPrice,
                endDate: draft.endDate,
                returnPct: (sellPrice - number(wave.buyPrice)) / number(wave.buyPrice),
                pnlCny: (sellPrice - number(wave.buyPrice)) * number(wave.shares) * MOCK_CNY_RATE,
              }
            : wave
        )),
      };
    }));
    setModal(null);
  };

  const addReady = String(draft.symbol || '').trim() && number(draft.buyPrice) > 0 && number(draft.shares) > 0 && draft.startDate;
  const editReady = number(draft.buyPrice) > 0
    && number(draft.shares) > 0
    && draft.startDate
    && (
      selection.wave?.status !== 'completed'
      || (number(draft.sellPrice) > 0 && draft.endDate && draft.endDate >= draft.startDate)
    );
  const sellReady = number(draft.sellPrice) > 0
    && draft.endDate
    && selection.wave
    && draft.endDate >= selection.wave.startDate;

  return (
    <main
      data-wave-prototype="v2-static"
      className="min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_50%_-20%,rgba(27,53,78,0.18),transparent_42%),#05080d] px-3.5 pb-12 text-white"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 22px)' }}
    >
      <div className="mx-auto w-full max-w-[620px]">
        <header className="flex items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[23px] font-normal tracking-[0.02em] text-white/[0.96]">波段记录</h1>
            <button type="button" onClick={() => setModal({ type: 'info' })} className="flex h-6 w-6 items-center justify-center rounded-full text-white/[0.43] active:scale-90" aria-label="查看波段规则">
              <Info className="h-[16px] w-[16px]" strokeWidth={1.8} />
            </button>
          </div>
          <button data-testid="wave-add-button" type="button" onClick={openAdd} className="flex h-10 items-center gap-1.5 rounded-full bg-[#f6b54b]/[0.08] px-4 text-[13px] font-normal text-[#f6bd61] shadow-[0_0_22px_rgba(246,181,75,0.08)] active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            新增波段
          </button>
        </header>

        <section className="relative mt-6 grid grid-cols-[0.82fr_1.32fr_1fr_auto] items-center px-1">
          <div className="pr-2">
            <div className="flex items-center gap-2 whitespace-nowrap text-[11px] text-white/[0.66]">
              <span className="h-2 w-2 rounded-full bg-[#ff5b50] shadow-[0_0_10px_rgba(255,91,80,0.55)]" />
              <span>进行中</span>
              <span className="text-[16px] tabular-nums" style={{ color: PROFIT, fontFamily: NUMBER_FONT }}>{activeStockCount}</span>
            </div>
          </div>
          <div className="border-l border-white/[0.12] px-3">
            <div className="text-[10px] text-white/[0.36]">累计盈亏</div>
            <div className="mt-1 whitespace-nowrap text-[12px] tabular-nums" style={{ color: tone(cumulativePnl), fontFamily: NUMBER_FONT }}>{formatPnl(cumulativePnl, 2)}</div>
          </div>
          <div className="border-l border-white/[0.12] px-3">
            <div className="text-[10px] text-white/[0.36]">持仓数量</div>
            <div className="mt-1 whitespace-nowrap text-[12px] text-white/[0.84] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{activeStockCount}只 · {activeWaveCount}段</div>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setFilterOpen((open) => !open)} className="flex h-9 items-center gap-1 whitespace-nowrap pl-2 text-[11px] text-white/[0.62] active:scale-95" aria-expanded={filterOpen}>
              {filter === 'all' ? '全部' : filter === 'active' ? '进行中' : '已完成'}
              <ChevronDown className={`h-3.5 w-3.5 transition ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            {filterOpen ? (
              <div className="absolute right-0 top-10 z-20 w-[94px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#111720]/95 p-1 shadow-2xl backdrop-blur-xl">
                {[
                  ['all', '全部'],
                  ['active', '进行中'],
                  ['completed', '已完成'],
                ].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => { setFilter(id); setFilterOpen(false); setExpandedSymbol(''); }} className={`block w-full rounded-lg px-2 py-2 text-left text-[11px] ${filter === id ? 'bg-white/[0.07] text-[#f6bd61]' : 'text-white/[0.58]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 space-y-3">
          {visibleGroups.map((group) => (
            <StockCard
              key={group.symbol}
              group={group}
              expanded={expandedSymbol === group.symbol}
              filter={filter}
              onToggle={() => setExpandedSymbol((current) => (current === group.symbol ? '' : group.symbol))}
              onAction={openActions}
            />
          ))}
        </section>

        <div className="mt-5 flex items-center gap-3 px-8 text-[10px] text-white/[0.22]">
          <span className="h-px flex-1 bg-white/[0.07]" />
          已显示全部
          <span className="h-px flex-1 bg-white/[0.07]" />
        </div>
      </div>

      {modal?.type === 'info' ? (
        <ActionModalCard
          title="波段规则"
          closeLabel="关闭波段规则"
          onClose={() => setModal(null)}
          actions={[{ key: 'close', label: '知道了', onClick: () => setModal(null) }]}
        >
          <div className="space-y-2 text-[11.5px] leading-5 text-white/[0.5]">
            <p>每个波段只记录一次完整买入和一次完整卖出。</p>
            <p>同一股票可以同时建立多个独立波段；卖出数量固定等于该波段买入数量。</p>
            <p>单价始终按 USD 录入，第一版不计算佣金和手续费。</p>
          </div>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'add' ? (
        <ActionModalCard
          title="新增波段"
          closeLabel="关闭新增波段"
          onClose={() => setModal(null)}
          actions={[
            { key: 'cancel', label: '取消', onClick: () => setModal(null) },
            { key: 'confirm', label: '确认买入', onClick: addWave, disabled: !addReady },
          ]}
        >
          <ModalFormScroller>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] text-white/[0.42]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#f6b54b]/25 bg-[#f6b54b]/[0.07] text-[#f6b54b]">买</span>
                新建一个独立波段，后续需整段完整卖出
              </div>
              <FormField label="股票代码" value={draft.symbol || ''} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} placeholder="NVDA" autoCapitalize="characters" />
              <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                <FormField label="买入成本价（USD）" prefix="$" value={draft.buyPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, buyPrice: event.target.value }))} inputMode="decimal" placeholder="0.00" />
                <FormField label="买入数量" value={draft.shares || ''} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} inputMode="numeric" placeholder="0" />
              </div>
              <FormField label="开始日期" type="date" value={draft.startDate || ''} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
              <FormField label="计划 / 备注" value={draft.note || ''} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="例如：250 开始卖出" />
            </div>
          </ModalFormScroller>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'actions' && selection.group && selection.wave ? (
        <ActionModalCard
          title="波段操作"
          closeLabel="关闭波段操作"
          onClose={() => setModal(null)}
          actionGridClassName={selection.wave.status === 'active' ? 'grid-cols-3' : 'grid-cols-2'}
          actions={[
            {
              key: 'detail',
              label: '详情',
              onClick: () => openDetail(selection.group, selection.wave),
            },
            {
              key: 'edit',
              label: '编辑',
              onClick: () => openEdit(selection.group, selection.wave),
            },
            ...(selection.wave.status === 'active' ? [{
              key: 'sell',
              label: '卖出',
              onClick: () => openSell(selection.group, selection.wave),
            }] : []),
          ]}
        >
          <ModalStockHeader
            group={selection.group}
            wave={selection.wave}
            sideLabel={`波段 ${String(selection.group.waves.findIndex((wave) => wave.id === selection.wave.id) + 1).padStart(2, '0')} · ${selection.wave.status === 'active' ? '进行中' : '已完成'}`}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
            <Metric label="收益率" value={formatPct(selection.wave.returnPct)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? '当前价' : '卖出价'} value={formatPrice(selection.wave.status === 'active' ? selection.group.currentPrice : selection.wave.sellPrice)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? '浮盈' : '已实现'} value={formatPnl(selection.wave.pnlCny)} valueColor={tone(selection.wave.pnlCny)} align="right" />
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[10.5px] leading-4 text-white/[0.4]">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{selection.wave.note || '暂无计划备注'}</span>
          </div>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'detail' && selection.group && selection.wave ? (
        <ActionModalCard
          title="波段详情"
          closeLabel="关闭波段详情"
          onClose={() => setModal(null)}
          actions={[
            { key: 'close', label: '关闭', onClick: () => setModal(null) },
            { key: 'edit', label: '修改', onClick: () => openEdit(selection.group, selection.wave) },
          ]}
        >
          <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={selection.wave.status === 'active' ? '进行中' : '已完成'} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-3">
            <Metric label="买入成本价" value={formatPrice(selection.wave.buyPrice)} />
            <Metric label="买入数量" value={`${formatNumber(selection.wave.shares)} 股`} align="right" />
            <Metric label={selection.wave.status === 'active' ? '当前价' : '卖出价'} value={formatPrice(selection.wave.status === 'active' ? selection.group.currentPrice : selection.wave.sellPrice)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? '浮动盈亏' : '已实现盈亏'} value={formatPnl(selection.wave.pnlCny)} valueColor={tone(selection.wave.pnlCny)} align="right" />
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[11px] leading-4 text-white/[0.4]">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {selection.wave.note || '暂无计划备注'}
          </div>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'edit' && selection.group && selection.wave ? (
        <ActionModalCard
          title="编辑波段"
          closeLabel="关闭编辑波段"
          onClose={() => setModal(null)}
          actions={[
            { key: 'cancel', label: '取消', onClick: () => setModal(null) },
            { key: 'save', label: '保存修改', onClick: saveEdit, disabled: !editReady },
          ]}
        >
          <ModalFormScroller>
            <div className="space-y-3">
              <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={selection.wave.status === 'active' ? '编辑买入' : '编辑记录'} />
              <div className="grid min-w-0 grid-cols-1 gap-2.5 border-t border-white/[0.06] pt-3 min-[360px]:grid-cols-2">
                <FormField label="买入成本价（USD）" prefix="$" value={draft.buyPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, buyPrice: event.target.value }))} inputMode="decimal" />
                <FormField label="买入数量" value={draft.shares || ''} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} inputMode="numeric" />
              </div>
              <FormField label="开始日期" type="date" value={draft.startDate || ''} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
              {selection.wave.status === 'completed' ? (
                <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                  <FormField label="卖出价格（USD）" prefix="$" value={draft.sellPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, sellPrice: event.target.value }))} inputMode="decimal" />
                  <FormField label="结束日期" type="date" min={draft.startDate || undefined} value={draft.endDate || ''} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
                </div>
              ) : null}
              <FormField label="计划 / 备注" value={draft.note || ''} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </div>
          </ModalFormScroller>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'sell' && selection.group && selection.wave ? (
        <ActionModalCard
          title="完整卖出"
          closeLabel="关闭完整卖出"
          onClose={() => setModal(null)}
          actions={[
            { key: 'cancel', label: '取消', onClick: () => setModal(null) },
            { key: 'confirm', label: `卖出 ${formatNumber(selection.wave.shares)} 股`, onClick: completeSell, disabled: !sellReady },
          ]}
        >
          <ModalFormScroller>
            <div className="space-y-3">
              <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel="结束波段" />
              <div className="rounded-[11px] border border-[#ff5b50]/15 bg-[#ff5b50]/[0.045] px-3 py-2.5 text-[10.5px] leading-4 text-white/[0.42]">
                波段需一次性卖出，不支持部分卖出。
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                <FormField label="卖出价格（USD）" prefix="$" value={draft.sellPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, sellPrice: event.target.value }))} inputMode="decimal" placeholder="0.00" />
                <FormField label="卖出数量">
                  <span className="text-[12.5px] text-white/[0.48] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatNumber(selection.wave.shares)} 股</span>
                </FormField>
              </div>
              <FormField label="结束日期" type="date" min={selection.wave.startDate} value={draft.endDate || ''} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
              {draft.endDate && draft.endDate < selection.wave.startDate ? (
                <div className="text-[10px]" style={{ color: PROFIT }}>结束日期不能早于开始日期</div>
              ) : null}
              <div className="flex items-center gap-2 text-[10px] text-white/[0.28]">
                <CalendarDays className="h-3.5 w-3.5" />
                第一版不计算佣金和手续费
              </div>
            </div>
          </ModalFormScroller>
        </ActionModalCard>
      ) : null}
    </main>
  );
}
