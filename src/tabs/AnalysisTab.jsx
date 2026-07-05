import React from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Home,
  Info,
  Landmark,
  LineChart,
  MessageCircle,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { marketHexColor } from '../lib/marketColorMode.js';

const ASSET_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const ASSET_NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const ASSET_GOLD = '#f6c56f';
const ASSET_PINK = marketHexColor(-1);
const ASSET_GREEN = '#50d0a2';
const ASSET_CARD = '#0d131c';
const ASSET_BORDER = 'rgba(255,255,255,0.11)';

const ACCOUNT_TYPE_OPTIONS = [
  { type: '银行', Icon: Landmark },
  { type: '证券', Icon: BarChart3 },
  { type: '支付宝', Icon: WalletCards },
  { type: '微信', Icon: MessageCircle },
  { type: '定期', Icon: CalendarDays },
  { type: '现金', Icon: Coins },
  { type: '公积金', Icon: Home },
  { type: '其他', Icon: CircleDollarSign },
];

const ACCOUNT_PRESETS = {
  银行: ['招商银行', '招商永隆', '工商银行', '建设银行', '中国银行'],
  证券: ['长桥证券', 'IBKR', '富途', '老虎', '华泰证券', '东方财富'],
  支付宝: ['支付宝现金', '支付宝理财'],
  微信: ['微信钱包', '微信零钱通'],
  定期: ['银行定期', '大额存单', '货币基金'],
  现金: ['现金'],
  公积金: ['住房公积金', '企业年金'],
  其他: ['房产', '车', '黄金', '保险'],
};

const inputClassName = 'w-full min-w-0 max-w-full box-border rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-[13px] text-[#f5f7fb] outline-none placeholder:text-[#6f7887] focus:border-[#f6c56f]';

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function localMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function shiftMonth(monthKey, offset) {
  const d = new Date(`${monthKey}-15`);
  d.setMonth(d.getMonth() + offset);
  return localMonthKey(d);
}

function AccountTypeIcon({ type, className = 'h-5 w-5' }) {
  const found = ACCOUNT_TYPE_OPTIONS.find(item => item.type === type);
  const Icon = found?.Icon || CircleDollarSign;
  return <Icon className={className} strokeWidth={1.8} />;
}

function currencyPrefix(currency) {
  if (currency === 'USD') return '$';
  if (currency === 'HKD') return 'HK$';
  return '¥';
}

function monthText(monthKey) {
  return String(monthKey || '').replace('-', '-');
}

export default function AnalysisTab({ ctx }) {
  const {
    accounts,
    chartSelectedMonthIdx,
    db,
    fillMonth,
    fmt,
    hkdRate,
    newAccount,
    setAccounts,
    setChartSelectedMonthIdx,
    setFillMonth,
    setNewAccount,
    setShowAddAccount,
    setShowFillSnapshot,
    setShowMonthsDetail,
    setSnapshotDraft,
    setSnapshots,
    setSnapshotTab,
    showAddAccount,
    showConfirm = ({ onConfirm }) => onConfirm?.(),
    showFillSnapshot,
    showMonthsDetail,
    snapshotDraft,
    snapshots,
    snapshotTab,
    usdRate,
  } = ctx;

  const [assetMessage, setAssetMessage] = React.useState(null);
  const [accountActionId, setAccountActionId] = React.useState(null);
  const [editingAccountId, setEditingAccountId] = React.useState(null);
  const [accountEditDraft, setAccountEditDraft] = React.useState(null);

  const currentMonth = localMonthKey();
  const lastMonth = shiftMonth(currentMonth, -1);
  const yearStart = `${currentMonth.slice(0, 4)}-01`;
  const yearAgo = shiftMonth(currentMonth, -12);
  const last12Months = Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth, i - 11));

  const getBalance = (accId, month) => {
    const snap = snapshots.find(s => s.accountId === accId && s.month === month);
    return snap ? numberValue(snap.balance) : 0;
  };

  const toCNY = (balance, currency) => {
    const value = numberValue(balance);
    if (currency === 'USD') return value * usdRate;
    if (currency === 'HKD') return value * hkdRate;
    return value;
  };

  const balanceAtMonthCNY = (accId, month) => {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return 0;
    return toCNY(getBalance(accId, month), acc.currency);
  };

  const totalAtMonth = (month) =>
    accounts.reduce((sum, acc) => sum + balanceAtMonthCNY(acc.id, month), 0);

  const fmtWan = (n) => {
    const v = Math.abs(numberValue(n)) / 10000;
    return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const fmtSignedWan = (value) => {
    const n = numberValue(value);
    return `${n >= 0 ? '+' : '-'}¥${fmtWan(n)}万`;
  };

  const fmtSignedPct = (value) => {
    const n = numberValue(value);
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  };

  const totalNow = totalAtMonth(currentMonth);
  const totalNowMoney = splitCurrencyAmount(totalNow, 'CNY', 2);
  const totalLast = totalAtMonth(lastMonth);
  const totalYearStart = totalAtMonth(yearStart);
  const totalYearAgo = totalAtMonth(yearAgo);

  const monthChange = totalNow - totalLast;
  const monthChangePct = totalLast > 0 ? (monthChange / totalLast) * 100 : 0;
  const ytdChange = totalNow - totalYearStart;
  const ytdChangePct = totalYearStart > 0 ? (ytdChange / totalYearStart) * 100 : 0;
  const yearChange = totalNow - totalYearAgo;
  const yearChangePct = totalYearAgo > 0 ? (yearChange / totalYearAgo) * 100 : 0;

  const chartData = last12Months.map(m => totalAtMonth(m));
  const nonZero = chartData.filter(v => v > 0);
  const chartMin = nonZero.length > 0 ? Math.min(...nonZero) : 0;
  const chartMax = nonZero.length > 0 ? Math.max(...nonZero) : 0;
  const chartRange = chartMax - chartMin || 1;
  const chartVisualMax = Math.max(chartMax, 1);

  const myAccounts = accounts.filter(a => a.owner === '我');
  const wifeAccounts = accounts.filter(a => a.owner === '老婆');
  const myTotal = myAccounts.reduce((s, a) => s + balanceAtMonthCNY(a.id, currentMonth), 0);
  const wifeTotal = wifeAccounts.reduce((s, a) => s + balanceAtMonthCNY(a.id, currentMonth), 0);
  const myPct = totalNow > 0 ? (myTotal / totalNow) * 100 : 0;
  const wifePct = totalNow > 0 ? (wifeTotal / totalNow) * 100 : 0;

  const closeAddAccount = () => {
    setAssetMessage(null);
    setShowAddAccount(false);
  };

  const openAddAccount = () => {
    setAssetMessage(null);
    setNewAccount({ owner: '我', type: '', name: '', currency: 'CNY', icon: '', balance: '' });
    setShowAddAccount(true);
  };

  const closeFillSnapshot = () => {
    setAssetMessage(null);
    setSnapshotDraft({});
    setShowFillSnapshot(false);
  };

  const closeAccountAction = () => {
    setAssetMessage(null);
    setAccountActionId(null);
  };

  const closeAccountEdit = () => {
    setAssetMessage(null);
    setEditingAccountId(null);
    setAccountEditDraft(null);
  };

  const openAccountEdit = (account) => {
    if (!account) return;
    setAssetMessage(null);
    setAccountActionId(null);
    setEditingAccountId(account.id);
    setAccountEditDraft({
      owner: account.owner || '我',
      type: account.type || '',
      name: account.name || '',
      currency: account.currency || 'CNY',
      icon: account.icon || account.type || '',
      balance: String(getBalance(account.id, currentMonth) || ''),
    });
  };

  const ownerGroups = [
    { owner: '我', accounts: myAccounts, total: myTotal, pct: myPct, accent: ASSET_GOLD },
    { owner: '老婆', accounts: wifeAccounts, total: wifeTotal, pct: wifePct, accent: ASSET_PINK },
  ];

  const metricItems = [
    { label: '较上月', value: monthChange, pct: monthChangePct, enabled: totalLast > 0 },
    { label: '年初至今', value: ytdChange, pct: ytdChangePct, enabled: totalYearStart > 0 },
    { label: '近一年', value: yearChange, pct: yearChangePct, enabled: totalYearAgo > 0 },
  ];

  const chartLeft = 64;
  const chartRight = 306;
  const chartTop = 18;
  const chartBottom = 124;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const chartLabelIndices = new Set([0, Math.floor((last12Months.length - 1) / 2), last12Months.length - 1]);
  const chartPoints = chartData
    .map((v, i) => {
      const x = chartLeft + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
      const y = chartBottom - (v / chartVisualMax) * chartHeight;
      return { x, y, v, i };
    })
    .filter(p => p.v > 0);

  const chartPath = chartPoints.length > 1
    ? `M ${chartPoints[0].x} ${chartPoints[0].y} ${chartPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`
    : '';
  const chartArea = chartPath
    ? `${chartPath} L ${chartPoints[chartPoints.length - 1].x} ${chartBottom} L ${chartPoints[0].x} ${chartBottom} Z`
    : '';
  const chartPathLength = Math.max(1, chartPoints.reduce((sum, point, idx) => {
    if (idx === 0) return sum;
    const prev = chartPoints[idx - 1];
    return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
  }, 0));
  const latestChartPoint = chartPoints[chartPoints.length - 1] || null;
  const effectiveChartSelectedMonthIdx = chartSelectedMonthIdx !== null && chartData[chartSelectedMonthIdx] > 0
    ? chartSelectedMonthIdx
    : latestChartPoint?.i ?? null;
  const selectedChartDotDelay = chartSelectedMonthIdx !== null ? 0 : 900;

  const selectedChartValue = effectiveChartSelectedMonthIdx !== null ? chartData[effectiveChartSelectedMonthIdx] : 0;
  const selectedChartMonth = effectiveChartSelectedMonthIdx !== null ? last12Months[effectiveChartSelectedMonthIdx] : '';
  const selectedChartPrevValue = effectiveChartSelectedMonthIdx !== null && effectiveChartSelectedMonthIdx > 0
    ? chartData[effectiveChartSelectedMonthIdx - 1]
    : 0;
  const selectedChartChange = selectedChartPrevValue > 0 ? selectedChartValue - selectedChartPrevValue : null;
  const selectedChartChangePct = selectedChartPrevValue > 0 ? (selectedChartChange / selectedChartPrevValue) * 100 : null;
  const selectedActionAccount = accounts.find(acc => acc.id === accountActionId);
  const editingAccount = accounts.find(acc => acc.id === editingAccountId);

  const currentVisibleAccounts = (items) =>
    items.filter(acc => balanceAtMonthCNY(acc.id, currentMonth) !== 0);

  const accountBalanceText = (account) => {
    if (!account) return '--';
    const bal = getBalance(account.id, currentMonth);
    return account.currency === 'CNY' ? `¥${fmtWan(bal)}万` : `${currencyPrefix(account.currency)}${fmt(bal, 0)}`;
  };

  const accountApproxText = (account) => {
    if (!account || account.currency === 'CNY') return '';
    const balCNY = balanceAtMonthCNY(account.id, currentMonth);
    return `≈¥${fmtWan(balCNY)}万`;
  };

  const confirmDeleteAccount = (account) => {
    if (!account) return;
    setAccountActionId(null);
    showConfirm({
      title: '删除这个账户?',
      desc: '删除后会同步云端,该账户所有月度快照也会一起删除。',
      info: `${account.name || '--'} · ${account.type || '--'} · ${accountBalanceText(account)}`,
      confirmText: '删除',
      icon: '🗑',
      onConfirm: async () => {
        try {
          await db.deleteAccount(account.id);
          setAccounts(accounts.filter(a => a.id !== account.id));
          setSnapshots(snapshots.filter(s => s.accountId !== account.id));
        } catch (e) {
          console.error('[删除账户] 失败:', e);
          setAssetMessage({ type: 'error', text: `删除失败: ${e.message || '未知错误'}` });
        }
      },
    });
  };

  const saveAccountEdit = async () => {
    if (!editingAccount || !accountEditDraft) return;
    const accountName = accountEditDraft.name.trim();
    if (!accountEditDraft.type) {
      setAssetMessage({ type: 'error', text: '请选择账户类型' });
      return;
    }
    if (!accountName) {
      setAssetMessage({ type: 'error', text: '请填写账户名' });
      return;
    }
    if (accounts.find(a => a.id !== editingAccount.id && a.owner === accountEditDraft.owner && a.name === accountName)) {
      setAssetMessage({ type: 'error', text: '该账户已存在' });
      return;
    }
    const balanceValue = parseFloat(accountEditDraft.balance);
    if (accountEditDraft.balance !== '' && (!Number.isFinite(balanceValue) || balanceValue < 0)) {
      setAssetMessage({ type: 'error', text: '请填写有效余额' });
      return;
    }

    try {
      const updated = await db.updateAccount(editingAccount.id, {
        owner: accountEditDraft.owner,
        type: accountEditDraft.type,
        name: accountName,
        currency: accountEditDraft.currency,
        icon: accountEditDraft.type,
        sortOrder: editingAccount.sortOrder || 0,
      });
      setAccounts(accounts.map(acc => (acc.id === editingAccount.id ? updated : acc)));
      if (accountEditDraft.balance !== '') {
        await db.upsertSnapshot(editingAccount.id, currentMonth, balanceValue);
        const nextSnapshots = [...snapshots];
        const idx = nextSnapshots.findIndex(s => s.accountId === editingAccount.id && s.month === currentMonth);
        if (idx >= 0) {
          nextSnapshots[idx] = { ...nextSnapshots[idx], balance: balanceValue };
        } else {
          nextSnapshots.push({
            id: `new_${Date.now()}_${editingAccount.id}`,
            accountId: editingAccount.id,
            month: currentMonth,
            balance: balanceValue,
          });
        }
        setSnapshots(nextSnapshots);
      }
      closeAccountEdit();
    } catch (e) {
      console.error('[修改账户] 失败:', e);
      setAssetMessage({ type: 'error', text: `保存失败: ${e.message || '未知错误'}` });
    }
  };

  return (
    <div className="space-y-3.5 text-[#f5f7fb]" style={{ fontFamily: ASSET_FONT }}>
      <section
        className="rounded-[20px] border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{
          background: 'linear-gradient(145deg, rgba(17,22,31,0.98), rgba(8,12,18,0.98))',
          borderColor: ASSET_BORDER,
          boxShadow: '0 18px 46px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px]" style={{ color: ASSET_GOLD }}>
              <span>家庭总资产</span>
              <Info className="h-3.5 w-3.5 text-white/[0.35]" strokeWidth={1.8} />
            </div>
            <div
              className="mt-4 whitespace-nowrap text-[34px] leading-none tracking-normal sm:text-[38px]"
              style={{ color: '#ffd37d', fontFamily: ASSET_NUMBER_FONT, fontWeight: 400 }}
            >
              <span>{totalNowMoney.main}</span>
              <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-[#ffd37d]/90">{totalNowMoney.decimal}</span>
            </div>
          </div>

          <button
            onClick={() => setShowMonthsDetail(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-[12px] active:scale-95 transition"
            style={{ color: ASSET_GOLD }}
            title="查看 12 个月走势"
          >
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>{currentMonth}</span>
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-0">
          {metricItems.map((item, idx) => {
            const positive = item.value >= 0;
            const color = positive ? ASSET_PINK : ASSET_GREEN;
            return (
              <div key={item.label} className={idx === 0 ? 'min-w-0 pr-2' : 'min-w-0 border-l border-white/10 px-2'}>
                <div className="text-[12px] text-white/[0.45]">{item.label}</div>
                {item.enabled ? (
                  <div className="mt-2.5 space-y-1">
                    <div className="text-[13px] leading-tight tabular-nums" style={{ color, fontFamily: ASSET_NUMBER_FONT }}>
                      <span className="whitespace-nowrap">{fmtSignedWan(item.value)}</span>
                    </div>
                    <div className="text-[13px] tabular-nums" style={{ color, fontFamily: ASSET_NUMBER_FONT }}>
                      {fmtSignedPct(item.pct)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 text-[12px] text-white/25">无数据</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {nonZero.length >= 2 && (
        <section
          className="rounded-[20px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          style={{ background: ASSET_CARD, borderColor: ASSET_BORDER }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[14px] text-white/90">
              <LineChart className="h-4 w-4" style={{ color: ASSET_PINK }} strokeWidth={1.8} />
              <span>12 个月走势</span>
            </div>
            <button
              onClick={() => setShowMonthsDetail(true)}
              className="text-[11px] text-white/[0.45] active:text-white/70"
            >
              月度 · 点击查看
            </button>
          </div>

          {selectedChartValue > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[12px] text-white/60">
              <div className="min-w-0">
                <div className="tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>{monthText(selectedChartMonth)}</div>
                {selectedChartChange !== null && (
                  <div className="mt-1 truncate tabular-nums" style={{ color: selectedChartChange >= 0 ? ASSET_PINK : ASSET_GREEN, fontFamily: ASSET_NUMBER_FONT }}>
                    较上月 {fmtSignedWan(selectedChartChange)} · {fmtSignedPct(selectedChartChangePct)}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[13px] tabular-nums" style={{ color: ASSET_PINK, fontFamily: ASSET_NUMBER_FONT }}>¥{fmtWan(selectedChartValue)}万</span>
            </div>
          )}

          <div className="mt-3">
            <svg viewBox="0 0 320 138" className="h-[142px] w-full overflow-visible" style={{ '--asset-chart-path-length': chartPathLength }}>
              <defs>
                <linearGradient id="assetChartArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ASSET_PINK} stopOpacity="0.36" />
                  <stop offset="100%" stopColor={ASSET_PINK} stopOpacity="0.02" />
                </linearGradient>
                <filter id="assetChartGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <style>{`
                @keyframes assetDrawLine {
                  from { stroke-dashoffset: var(--asset-chart-path-length); }
                  to { stroke-dashoffset: 0; }
                }
                @keyframes assetAreaFadeIn {
                  from { opacity: 0; transform: translateY(8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                @keyframes assetDotPop {
                  0% { opacity: 0; transform: scale(0.52); }
                  60% { opacity: 1; transform: scale(1.16); }
                  100% { opacity: 1; transform: scale(1); }
                }
                .asset-chart-line {
                  animation: assetDrawLine 900ms ease-out both;
                  stroke-dasharray: var(--asset-chart-path-length);
                  stroke-dashoffset: var(--asset-chart-path-length);
                }
                .asset-chart-area {
                  animation: assetAreaFadeIn 680ms ease-out both;
                  transform-box: fill-box;
                  transform-origin: center bottom;
                }
                .asset-chart-dot {
                  animation: assetDotPop 440ms cubic-bezier(0.2, 0.85, 0.28, 1.2) both;
                  transform-box: fill-box;
                  transform-origin: center;
                }
              `}</style>

              {[0, 0.33, 0.66, 1].map((t) => {
                const y = chartTop + t * chartHeight;
                const labelValue = chartVisualMax * (1 - t);
                return (
                  <g key={t}>
                    <line x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke="rgba(255,255,255,0.13)" strokeDasharray="4 5" strokeWidth="0.7" />
                    <text x="2" y={y + 4} fill="rgba(255,255,255,0.42)" fontSize="8.5" fontFamily={ASSET_NUMBER_FONT}>
                      {labelValue <= 0 ? '0' : `${fmtWan(labelValue)}万`}
                    </text>
                  </g>
                );
              })}

              {chartArea && <path d={chartArea} className="asset-chart-area" fill="url(#assetChartArea)" />}
              {chartPath && <path d={chartPath} className="asset-chart-line" fill="none" stroke={ASSET_PINK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#assetChartGlow)" />}

              {chartPoints.map((p, idx) => {
                const selected = effectiveChartSelectedMonthIdx === p.i;
                return (
                  <g key={p.i}>
                    {selected && (
                      <>
                        <line x1={p.x} x2={p.x} y1={p.y} y2={chartBottom} stroke={ASSET_PINK} strokeOpacity="0.45" strokeDasharray="3 4" />
                        <circle className="asset-chart-dot" cx={p.x} cy={p.y} r="5.8" fill={ASSET_CARD} stroke={ASSET_PINK} strokeWidth="2.5" style={{ animationDelay: `${selectedChartDotDelay}ms` }} />
                        <circle className="asset-chart-dot" cx={p.x} cy={p.y} r="2.2" fill={ASSET_PINK} style={{ animationDelay: `${selectedChartDotDelay + 40}ms` }} />
                      </>
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="13"
                      fill="transparent"
                      onClick={() => setChartSelectedMonthIdx(prev => (prev === p.i ? null : p.i))}
                      style={{ cursor: 'pointer' }}
                    />
                  </g>
                );
              })}
              {last12Months.map((month, idx) => {
                if (!chartLabelIndices.has(idx)) return null;
                const x = chartLeft + (idx / Math.max(last12Months.length - 1, 1)) * chartWidth;
                return (
                  <text key={month} x={x} y="136" fill="rgba(255,255,255,0.45)" fontSize="11" textAnchor="middle" fontFamily={ASSET_NUMBER_FONT}>
                    {month.slice(5)}月
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="mt-3 grid grid-cols-3 border-t border-white/10 pt-3 text-center">
            {[
              ['最低', chartMin],
              ['最高', chartMax],
              ['区间', chartRange],
            ].map(([label, value], idx) => (
              <div key={label} className={idx === 0 ? '' : 'border-l border-white/10'}>
                <div className="text-[11px] text-white/[0.42]">{label}</div>
                <div className="mt-1.5 text-[14px] tabular-nums text-white/[0.88]" style={{ fontFamily: ASSET_NUMBER_FONT }}>¥{fmtWan(value)}万</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            setAssetMessage(null);
            setFillMonth(currentMonth);
            setShowFillSnapshot(true);
          }}
          disabled={accounts.length === 0}
          className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-[13px] active:scale-95 transition disabled:opacity-35"
          style={{ borderColor: 'rgba(246,197,111,0.72)', color: ASSET_GOLD, background: 'rgba(246,197,111,0.06)' }}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span className="truncate">填月度余额</span>
        </button>
        <button
          onClick={openAddAccount}
          className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/[0.16] bg-white/[0.045] px-2 text-[13px] text-white/[0.82] active:scale-95 transition"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span className="truncate">新增账户</span>
        </button>
      </div>

      {accounts.length === 0 && (
        <section className="rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-9 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-white/[0.65]">
            <PiggyBank className="h-7 w-7" strokeWidth={1.8} />
          </div>
          <div className="text-[16px] text-white/[0.88]">还没有账户</div>
          <div className="mt-2 text-[12px] text-white/[0.45]">添加你和家人的账户,记录每月余额</div>
          <button
            onClick={openAddAccount}
            className="mt-5 rounded-xl border px-5 py-2.5 text-[13px] active:scale-95 transition"
            style={{ borderColor: 'rgba(246,197,111,0.6)', color: ASSET_GOLD, background: 'rgba(246,197,111,0.08)' }}
          >
            添加第一个账户
          </button>
        </section>
      )}

      {ownerGroups.map(({ owner, accounts: ownerAccs, total, pct, accent }) => {
        const visibleOwnerAccs = currentVisibleAccounts(ownerAccs);
        if (visibleOwnerAccs.length === 0) return null;
        return (
          <section
            key={owner}
          className="rounded-[20px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ background: ASSET_CARD, borderColor: accent === ASSET_GOLD ? 'rgba(246,197,111,0.38)' : 'rgba(245,111,152,0.38)' }}
        >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[16px] leading-none text-white/[0.92]">{owner}</div>
                <div className="mt-2 text-[12px] text-white/[0.45]">{visibleOwnerAccs.length} 个账户 · 占总资产 {pct.toFixed(0)}%</div>
              </div>
              <div className="text-right text-[21px] leading-none tabular-nums" style={{ color: accent, fontFamily: ASSET_NUMBER_FONT }}>
                ¥{fmtWan(total)}万
              </div>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: accent }} />
            </div>

            <div className="mt-4 space-y-2">
              {visibleOwnerAccs.map(acc => {
                const bal = getBalance(acc.id, currentMonth);
                const balCNY = toCNY(bal, acc.currency);
                return (
                  <button
                    type="button"
                    key={acc.id}
                    onClick={() => {
                      setAssetMessage(null);
                      setAccountActionId(acc.id);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left active:scale-[0.99] transition"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/[0.18]" style={{ color: accent }}>
                      <AccountTypeIcon type={acc.type} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 border-l border-white/10 pl-2.5">
                      <div className="truncate text-[13px] text-white/[0.88]">{acc.name}</div>
                      <div className="mt-1 text-[11px] text-white/[0.42]">{acc.type}{acc.currency !== 'CNY' ? ` · ${acc.currency}` : ''}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] tabular-nums text-white/[0.88]" style={{ fontFamily: ASSET_NUMBER_FONT }}>
                        {acc.currency === 'CNY' ? `¥${fmtWan(bal)}万` : `${currencyPrefix(acc.currency)}${fmt(bal, 0)}`}
                      </div>
                      {acc.currency !== 'CNY' && (
                        <div className="mt-1 text-[11px] tabular-nums text-white/40" style={{ fontFamily: ASSET_NUMBER_FONT }}>≈¥{fmtWan(balCNY)}万</div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/35" strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {showAddAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.72] px-4 py-8 backdrop-blur-sm" onClick={closeAddAccount}>
          <div
            className="w-full max-w-[420px] rounded-[24px] border border-white/[0.12] bg-[#0b1018] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <h3 className="text-[17px] text-white/[0.92]">添加账户</h3>
              <button onClick={closeAddAccount} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.55]">
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="max-h-[calc(100vh-150px)] overflow-y-auto px-4 pb-4 pt-4">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">拥有人</label>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/[0.22] p-1">
                    {['我', '老婆'].map(owner => (
                      <button
                        key={owner}
                        onClick={() => setNewAccount({ ...newAccount, owner })}
                        className="rounded-lg py-2.5 text-[13px] transition"
                        style={newAccount.owner === owner ? { background: 'rgba(37,99,235,0.34)', color: '#f7fbff', boxShadow: 'inset 0 0 0 1px rgba(68,121,255,0.7)' } : { color: 'rgba(255,255,255,0.52)' }}
                      >
                        {owner}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">类型</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, Icon }) => {
                      const active = newAccount.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setNewAccount({ ...newAccount, type, icon: type })}
                          className="flex aspect-square min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border text-[12px] transition"
                          style={active
                            ? { borderColor: '#2563eb', color: ASSET_GOLD, background: 'rgba(37,99,235,0.18)', boxShadow: '0 0 18px rgba(37,99,235,0.18)' }
                            : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', background: 'rgba(255,255,255,0.035)' }}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                          <span>{type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">账户名</label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(ACCOUNT_PRESETS[newAccount.type] || []).map(name => (
                      <button
                        key={name}
                        onClick={() => setNewAccount({ ...newAccount, name })}
                        className="rounded-lg border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[12px] text-white/[0.65] active:scale-95 transition"
                        style={newAccount.name === name ? { color: ASSET_GOLD, borderColor: 'rgba(246,197,111,0.45)', background: 'rgba(246,197,111,0.08)' } : undefined}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newAccount.name}
                    onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                    placeholder={newAccount.type ? '点上面快捷选或自己输入' : '先选择类型,再输入账户名'}
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">币种</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['CNY', 'USD', 'HKD'].map(currency => (
                      <button
                        key={currency}
                        onClick={() => setNewAccount({ ...newAccount, currency })}
                        className="rounded-xl border py-2.5 text-[13px] tabular-nums transition"
                        style={newAccount.currency === currency
                          ? { borderColor: '#2563eb', color: '#f7fbff', background: 'rgba(37,99,235,0.34)', boxShadow: 'inset 0 0 0 1px rgba(68,121,255,0.45)' }
                          : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.56)', background: 'rgba(255,255,255,0.035)' }}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">当前余额 (可稍后填)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={newAccount.balance}
                    onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                    placeholder="0"
                    className={`${inputClassName} tabular-nums`}
                    style={{ colorScheme: 'dark', fontFamily: ASSET_NUMBER_FONT }}
                  />
                </div>

                {assetMessage && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-100">
                    {assetMessage.text}
                  </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={closeAddAccount}
                  className="min-h-[46px] rounded-xl border border-white/10 bg-white/[0.055] text-[13px] text-white/70 active:scale-95 transition"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const accountName = newAccount.name.trim();
                    if (!newAccount.type) {
                      setAssetMessage({ type: 'error', text: '请选择账户类型' });
                      return;
                    }
                    if (!accountName) {
                      setAssetMessage({ type: 'error', text: '请填写账户名' });
                      return;
                    }
                    if (accounts.find(a => a.owner === newAccount.owner && a.name === accountName)) {
                      setAssetMessage({ type: 'error', text: '该账户已存在' });
                      return;
                    }
                    try {
                      const saved = await db.insertAccount({
                        owner: newAccount.owner,
                        type: newAccount.type,
                        name: accountName,
                        currency: newAccount.currency,
                        icon: newAccount.type,
                        sortOrder: accounts.length,
                      });
                      setAccounts([...accounts, saved]);
                      if (newAccount.balance && parseFloat(newAccount.balance) > 0) {
                        const val = parseFloat(newAccount.balance);
                        await db.upsertSnapshot(saved.id, currentMonth, val);
                        setSnapshots([...snapshots, {
                          id: `new_${Date.now()}`,
                          accountId: saved.id,
                          month: currentMonth,
                          balance: val,
                        }]);
                      }
                      setNewAccount({ owner: '我', type: '', name: '', currency: 'CNY', icon: '', balance: '' });
                      closeAddAccount();
                    } catch (e) {
                      console.error('[添加账户] 失败:', e);
                      setAssetMessage({ type: 'error', text: `添加失败: ${e.message || '未知错误'}` });
                    }
                  }}
                  className="min-h-[46px] rounded-xl bg-[#2563eb] text-[13px] text-white active:scale-95 transition"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedActionAccount && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-0 py-6 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) closeAccountAction(); }}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          }}
        >
          <div className="w-[calc(100vw-72px)] max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f16] shadow-[0_24px_80px_rgba(0,0,0,0.68)]">
            <div className="border-b border-white/10 px-4 pb-3 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] text-white">账户操作</h2>
                <button
                  type="button"
                  onClick={closeAccountAction}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-[17px] text-white/45 transition hover:bg-white/[0.08] hover:text-white/70 active:scale-90"
                  aria-label="关闭账户操作"
                >
                  ×
                </button>
              </div>
              <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-white">{selectedActionAccount.name || '--'}</div>
                    <div className="mt-1 truncate text-[11px] text-white/60">
                      {selectedActionAccount.owner || '--'} · {selectedActionAccount.type || '--'} · {selectedActionAccount.currency || 'CNY'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] tabular-nums text-white/[0.88]" style={{ fontFamily: ASSET_NUMBER_FONT }}>{accountBalanceText(selectedActionAccount)}</div>
                    {accountApproxText(selectedActionAccount) && (
                      <div className="mt-1 text-[11px] tabular-nums text-white/40" style={{ fontFamily: ASSET_NUMBER_FONT }}>{accountApproxText(selectedActionAccount)}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 px-4 pb-4 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openAccountEdit(selectedActionAccount)}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#f6c56f]/35 bg-[#f6c56f]/10 text-[13px] text-[#f6c56f] active:scale-95"
                >
                  <Pencil className="h-4 w-4" strokeWidth={2} />
                  修改账户
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteAccount(selectedActionAccount)}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 text-[13px] text-rose-300 active:scale-95"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                  删除账户
                </button>
              </div>
              <button
                type="button"
                onClick={closeAccountAction}
                className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-[13px] text-white/80 active:scale-95"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAccount && accountEditDraft && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.72] px-4 py-8 backdrop-blur-sm" onClick={closeAccountEdit}>
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#0b1018] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <h3 className="text-[17px] text-white/[0.92]">修改账户</h3>
              <button onClick={closeAccountEdit} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.55]">
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="max-h-[calc(100vh-150px)] overflow-y-auto px-4 pb-4 pt-4">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">拥有人</label>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/[0.22] p-1">
                    {['我', '老婆'].map(owner => (
                      <button
                        key={owner}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, owner })}
                        className="rounded-lg py-2.5 text-[13px] transition"
                        style={accountEditDraft.owner === owner ? { background: 'rgba(37,99,235,0.34)', color: '#f7fbff', boxShadow: 'inset 0 0 0 1px rgba(68,121,255,0.7)' } : { color: 'rgba(255,255,255,0.52)' }}
                      >
                        {owner}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">类型</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, Icon }) => {
                      const active = accountEditDraft.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setAccountEditDraft({ ...accountEditDraft, type, icon: type })}
                          className="flex aspect-square min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border text-[12px] transition"
                          style={active
                            ? { borderColor: '#2563eb', color: ASSET_GOLD, background: 'rgba(37,99,235,0.18)', boxShadow: '0 0 18px rgba(37,99,235,0.18)' }
                            : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', background: 'rgba(255,255,255,0.035)' }}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                          <span>{type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">账户名</label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(ACCOUNT_PRESETS[accountEditDraft.type] || []).map(name => (
                      <button
                        key={name}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, name })}
                        className="rounded-lg border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[12px] text-white/[0.65] active:scale-95 transition"
                        style={accountEditDraft.name === name ? { color: ASSET_GOLD, borderColor: 'rgba(246,197,111,0.45)', background: 'rgba(246,197,111,0.08)' } : undefined}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={accountEditDraft.name}
                    onChange={(e) => setAccountEditDraft({ ...accountEditDraft, name: e.target.value })}
                    placeholder="账户名称"
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">币种</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['CNY', 'USD', 'HKD'].map(currency => (
                      <button
                        key={currency}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, currency })}
                        className="rounded-xl border py-2.5 text-[13px] tabular-nums transition"
                        style={accountEditDraft.currency === currency
                          ? { borderColor: '#2563eb', color: '#f7fbff', background: 'rgba(37,99,235,0.34)', boxShadow: 'inset 0 0 0 1px rgba(68,121,255,0.45)' }
                          : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.56)', background: 'rgba(255,255,255,0.035)' }}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">本月余额</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={accountEditDraft.balance}
                    onChange={(e) => setAccountEditDraft({ ...accountEditDraft, balance: e.target.value })}
                    placeholder="0"
                    className={`${inputClassName} tabular-nums`}
                    style={{ colorScheme: 'dark', fontFamily: ASSET_NUMBER_FONT }}
                  />
                </div>

                {assetMessage && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-100">
                    {assetMessage.text}
                  </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeAccountEdit}
                  className="min-h-[46px] rounded-xl border border-white/10 bg-white/[0.055] text-[13px] text-white/70 active:scale-95 transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveAccountEdit}
                  className="min-h-[46px] rounded-xl bg-[#2563eb] text-[13px] text-white active:scale-95 transition"
                >
                  保存修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMonthsDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.72] px-4 backdrop-blur-sm" onClick={() => setShowMonthsDetail(false)}>
          <div className="w-full max-w-[390px] overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#0b1018] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-1.5 text-[16px] text-white/[0.92]">
                <CalendarDays className="h-4 w-4" style={{ color: ASSET_GOLD }} strokeWidth={1.8} />
                <span>12 个月资产走势</span>
              </div>
              <button onClick={() => setShowMonthsDetail(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.55]">
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
              {[...last12Months].reverse().map((m, idx) => {
                const reversedIdx = last12Months.length - 1 - idx;
                const total = chartData[reversedIdx];
                const prevTotal = reversedIdx > 0 ? chartData[reversedIdx - 1] : 0;
                const changeAmt = prevTotal > 0 ? total - prevTotal : null;
                const changePct = prevTotal > 0 ? (changeAmt / prevTotal) * 100 : null;
                const hasData = total > 0;
                const isCurrent = m === currentMonth;
                return (
                  <div
                    key={m}
                    className="flex items-center justify-between rounded-xl border px-3 py-3"
                    style={isCurrent
                      ? { borderColor: 'rgba(246,197,111,0.45)', background: 'rgba(246,197,111,0.08)' }
                      : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)' }}
                  >
                    <div>
                      <div className="text-[13px] tabular-nums text-white/[0.82]" style={{ fontFamily: ASSET_NUMBER_FONT }}>{m}</div>
                      {isCurrent && <div className="mt-1 text-[11px]" style={{ color: ASSET_GOLD }}>本月</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] tabular-nums text-white/[0.88]" style={{ fontFamily: ASSET_NUMBER_FONT }}>
                        {hasData ? `¥${fmtWan(total)}万` : '无数据'}
                      </div>
                      {hasData && changeAmt !== null && (
                        <div className="mt-1 text-[12px] tabular-nums" style={{ color: changeAmt >= 0 ? ASSET_PINK : ASSET_GREEN, fontFamily: ASSET_NUMBER_FONT }}>
                          {fmtSignedWan(changeAmt)} · {fmtSignedPct(changePct)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/10 p-4">
              <button
                onClick={() => {
                  setShowMonthsDetail(false);
                  setFillMonth(currentMonth);
                  setShowFillSnapshot(true);
                }}
                className="flex min-h-[46px] w-full items-center justify-center gap-1.5 rounded-xl border text-[13px] active:scale-95 transition"
                style={{ borderColor: 'rgba(246,197,111,0.55)', color: ASSET_GOLD, background: 'rgba(246,197,111,0.08)' }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                补录/修改月度余额
              </button>
            </div>
          </div>
        </div>
      )}

      {showFillSnapshot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.72] px-4 py-8 backdrop-blur-sm" onClick={closeFillSnapshot}>
          <div className="w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#0b1018] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <h3 className="text-[17px] text-white/[0.92]">填月度余额</h3>
              <button onClick={closeFillSnapshot} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.55]">
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="max-h-[calc(100vh-150px)] overflow-y-auto px-4 pb-4 pt-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="mb-3 text-[12px] text-white/[0.52]">选择月份</div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setFillMonth(shiftMonth(fillMonth, -1));
                      setSnapshotDraft({});
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/75 active:scale-95 transition"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="text-[17px] tabular-nums" style={{ color: ASSET_GOLD, fontFamily: ASSET_NUMBER_FONT }}>{fillMonth}</div>
                    {fillMonth === currentMonth && <div className="mt-1 text-[11px] text-blue-300">本月</div>}
                    {fillMonth > currentMonth && <div className="mt-1 text-[11px] text-amber-300">未来月</div>}
                    {fillMonth < currentMonth && <div className="mt-1 text-[11px] text-white/[0.42]">历史月</div>}
                  </div>
                  <button
                    onClick={() => {
                      setFillMonth(shiftMonth(fillMonth, 1));
                      setSnapshotDraft({});
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/75 active:scale-95 transition"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>
              </div>

              {(() => {
                const myAccs = accounts.filter(a => a.owner === '我');
                const wifeAccs = accounts.filter(a => a.owner === '老婆');
                const hasMulti = myAccs.length > 0 && wifeAccs.length > 0;
                const currentAccs = hasMulti
                  ? (snapshotTab === '我' ? myAccs : wifeAccs)
                  : accounts;
                const curSum = currentAccs.reduce((sum, acc) => {
                  const v = parseFloat(snapshotDraft[acc.id] ?? getBalance(acc.id, fillMonth) ?? 0) || 0;
                  return sum + toCNY(v, acc.currency);
                }, 0);

                return (
                  <div className="mt-4">
                    {hasMulti && (
                      <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/[0.22] p-1">
                        {[
                          { owner: '我', accs: myAccs },
                          { owner: '老婆', accs: wifeAccs },
                        ].map(({ owner, accs }) => {
                          const active = snapshotTab === owner;
                          return (
                            <button
                              key={owner}
                              onClick={() => setSnapshotTab(owner)}
                              className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] transition"
                              style={active ? { background: 'rgba(37,99,235,0.32)', color: '#f7fbff' } : { color: 'rgba(255,255,255,0.52)' }}
                            >
                              <span>{owner}</span>
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{accs.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {hasMulti && (
                      <div className="mt-4 flex items-center justify-between text-[12px] text-white/[0.52]">
                        <span>{snapshotTab} · {currentAccs.length} 个账户</span>
                        <span className="tabular-nums" style={{ color: ASSET_GOLD, fontFamily: ASSET_NUMBER_FONT }}>≈ ¥{fmt(curSum, 0)}</span>
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      {currentAccs.map(acc => {
                        const currentBal = getBalance(acc.id, fillMonth);
                        const draftVal = snapshotDraft[acc.id] ?? (currentBal || '');
                        const accent = acc.owner === '老婆' ? ASSET_PINK : ASSET_GOLD;
                        return (
                          <div key={acc.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/[0.18]" style={{ color: accent }}>
                              <AccountTypeIcon type={acc.type} className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] text-white/[0.86]">{acc.name}</div>
                              <div className="mt-1 text-[11px] text-white/[0.42]">{acc.currency}</div>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={draftVal}
                              onChange={(e) => setSnapshotDraft({ ...snapshotDraft, [acc.id]: e.target.value })}
                              placeholder="0"
                              className="w-[116px] min-w-0 max-w-full box-border rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-right text-[13px] text-[#f5f7fb] outline-none placeholder:text-[#6f7887] focus:border-[#f6c56f]"
                              style={{ colorScheme: 'dark', fontFamily: ASSET_NUMBER_FONT }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {assetMessage && (
                <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-100">
                  {assetMessage.text}
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={closeFillSnapshot}
                  className="min-h-[46px] rounded-xl border border-white/10 bg-white/[0.055] text-[13px] text-white/70 active:scale-95 transition"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const validEntries = Object.entries(snapshotDraft)
                      .map(([accId, valStr]) => ({ accId, val: parseFloat(valStr) }))
                      .filter(({ val }) => !isNaN(val) && val >= 0);

                    if (validEntries.length === 0) {
                      closeFillSnapshot();
                      return;
                    }

                    try {
                      await Promise.all(
                        validEntries.map(({ accId, val }) => db.upsertSnapshot(accId, fillMonth, val))
                      );

                      const newSnapshots = [...snapshots];
                      validEntries.forEach(({ accId, val }) => {
                        const idx = newSnapshots.findIndex(s => s.accountId === accId && s.month === fillMonth);
                        if (idx >= 0) {
                          newSnapshots[idx] = { ...newSnapshots[idx], balance: val };
                        } else {
                          newSnapshots.push({
                            id: `new_${Date.now()}_${accId}`,
                            accountId: accId,
                            month: fillMonth,
                            balance: val,
                          });
                        }
                      });
                      setSnapshots(newSnapshots);
                      closeFillSnapshot();
                    } catch (e) {
                      console.error('[保存快照] 失败:', e);
                      setAssetMessage({ type: 'error', text: `保存失败: ${e.message || '未知错误'}` });
                    }
                  }}
                  className="min-h-[46px] rounded-xl bg-[#2563eb] text-[13px] text-white active:scale-95 transition"
                >
                  保存 {fillMonth}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
