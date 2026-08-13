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
  PiggyBank,
  Plus,
  WalletCards,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import AccountAssetTrendModal from '../components/AccountAssetTrendModal.jsx';
import MonthlyAssetTrendContent from '../components/MonthlyAssetTrendContent.jsx';
import { buildAccountAssetTrend } from '../lib/accountAssetTrend.js';
import { applyAccountSnapshotMutations, buildAccountSnapshotMutations } from '../lib/accountSnapshotMutation.js';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { localMonthKey, shiftMonthKey } from '../lib/calendarMonth.js';
import { t } from '../lib/i18n.js';
import { marketHexColor } from '../lib/marketColorMode.js';

const ASSET_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const ASSET_NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const ASSET_GOLD = '#f6c56f';
const ASSET_PINK = marketHexColor(-1);
const ASSET_GREEN = '#50d0a2';
const ASSET_CARD = '#0b0c0e';

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

function shiftMonth(monthKey, offset) {
  return shiftMonthKey(monthKey, offset);
}

function AccountTypeIcon({ type, className = 'h-5 w-5' }) {
  const found = ACCOUNT_TYPE_OPTIONS.find(item => item.type === type);
  const Icon = found?.Icon || CircleDollarSign;
  return <Icon className={className} strokeWidth={1.8} />;
}

function accountLogoUrl(account) {
  const candidates = [account?.logoURL, account?.logoUrl, account?.icon];
  return candidates.find(value => /^https?:\/\//i.test(String(value || '').trim())) || '';
}

function AccountLogo({ account }) {
  const logoUrl = accountLogoUrl(account);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [logoUrl]);

  return (
    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.13] bg-black/[0.38] text-white/[0.55] shadow-[0_7px_18px_rgba(0,0,0,0.27)]">
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full bg-black/20 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <AccountTypeIcon type={account?.type} className="h-[19px] w-[19px]" />
      )}
    </div>
  );
}

function currencyPrefix(currency) {
  if (currency === 'USD') return '$';
  if (currency === 'HKD') return 'HK$';
  return '¥';
}

function monthText(monthKey) {
  return String(monthKey || '').replace('-', '-');
}

function AnalysisTab({ ctx }) {
  const {
    accounts,
    chartSelectedMonthIdx,
    db,
    fillMonth,
    fmt,
    hkdRate,
    language = 'zh',
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
  const [accountTrendId, setAccountTrendId] = React.useState(null);
  const [editingAccountId, setEditingAccountId] = React.useState(null);
  const [accountEditDraft, setAccountEditDraft] = React.useState(null);
  const assetOverviewScrollYRef = React.useRef(0);

  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);
  const ownerLabel = React.useCallback((owner) => {
    if (owner === '我') return tt('analysis.owner.me', '我');
    if (owner === '老婆') return tt('analysis.owner.wife', '老婆');
    return owner || '--';
  }, [tt]);
  const ownerGroupLabel = React.useCallback((owner) => {
    if (owner === '我') return tt('analysis.owner.meGroup', '我');
    if (owner === '老婆') return tt('analysis.owner.wifeGroup', '老婆');
    return owner || '--';
  }, [tt]);
  const accountTypeLabel = React.useCallback((type) => (type ? tt(`analysis.accountType.${type}`, type) : '--'), [tt]);
  const accountNameLabel = React.useCallback((name) => (name ? tt(`analysis.accountName.${name}`, name) : '--'), [tt]);

  const currentMonth = localMonthKey();
  const lastMonth = shiftMonth(currentMonth, -1);
  const yearStart = `${currentMonth.slice(0, 4)}-01`;
  const yearAgo = shiftMonth(currentMonth, -12);
  const last12Months = React.useMemo(
    () => Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth, i - 11)),
    [currentMonth],
  );
  const accountById = React.useMemo(() => {
    const map = new Map();
    (accounts || []).forEach((account) => {
      if (!map.has(account?.id)) map.set(account?.id, account);
    });
    return map;
  }, [accounts]);
  const balanceByAccountMonth = React.useMemo(() => {
    const map = new Map();
    (snapshots || []).forEach((snapshot) => {
      if (!map.has(snapshot?.accountId)) map.set(snapshot?.accountId, new Map());
      const monthMap = map.get(snapshot?.accountId);
      if (!monthMap.has(snapshot?.month)) monthMap.set(snapshot?.month, numberValue(snapshot?.balance));
    });
    return map;
  }, [snapshots]);

  const getBalance = React.useCallback((accId, month) => (
    balanceByAccountMonth.get(accId)?.get(month) ?? 0
  ), [balanceByAccountMonth]);

  const getSnapshotBalance = React.useCallback((accId, month) => {
    const monthMap = balanceByAccountMonth.get(accId);
    return monthMap?.has(month) ? monthMap.get(month) : null;
  }, [balanceByAccountMonth]);

  const applySnapshotMutationsLocally = React.useCallback(({ upserts = [], deletions = [] }) => {
    setSnapshots((currentSnapshots) => applyAccountSnapshotMutations(currentSnapshots, { upserts, deletions }));
  }, [setSnapshots]);

  const persistSnapshotMutations = React.useCallback(async ({ upserts = [], deletions = [] }) => {
    const tasks = [
      ...upserts.map((mutation) => ({
        type: 'upsert',
        mutation,
        run: () => db.upsertSnapshot(mutation.accountId, mutation.month, mutation.balance),
      })),
      ...deletions.map((mutation) => ({
        type: 'delete',
        mutation,
        run: () => db.deleteSnapshot(mutation.accountId, mutation.month),
      })),
    ];
    const results = await Promise.allSettled(tasks.map(({ run }) => run()));
    const succeeded = { upserts: [], deletions: [] };
    const failures = [];
    results.forEach((result, index) => {
      const task = tasks[index];
      if (result.status === 'fulfilled') {
        if (task.type === 'upsert') succeeded.upserts.push(task.mutation);
        else succeeded.deletions.push(task.mutation);
      } else {
        failures.push(result.reason);
      }
    });
    applySnapshotMutationsLocally(succeeded);
    if (failures.length > 0) {
      throw failures[0] instanceof Error ? failures[0] : new Error(String(failures[0] || 'Snapshot mutation failed'));
    }
  }, [applySnapshotMutationsLocally, db]);

  const toCNY = React.useCallback((balance, currency) => {
    const value = numberValue(balance);
    if (currency === 'USD') return value * usdRate;
    if (currency === 'HKD') return value * hkdRate;
    return value;
  }, [hkdRate, usdRate]);

  const balanceAtMonthCNY = React.useCallback((accId, month) => {
    const acc = accountById.get(accId);
    if (!acc) return 0;
    return toCNY(getBalance(accId, month), acc.currency);
  }, [accountById, getBalance, toCNY]);

  const totalAtMonth = React.useCallback((month) => (
    (accounts || []).reduce((sum, acc) => sum + balanceAtMonthCNY(acc.id, month), 0)
  ), [accounts, balanceAtMonthCNY]);

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

  const {
    totalNow,
    totalLast,
    totalYearStart,
    totalYearAgo,
  } = React.useMemo(() => ({
    totalNow: totalAtMonth(currentMonth),
    totalLast: totalAtMonth(lastMonth),
    totalYearStart: totalAtMonth(yearStart),
    totalYearAgo: totalAtMonth(yearAgo),
  }), [currentMonth, lastMonth, totalAtMonth, yearAgo, yearStart]);
  const totalNowMoney = splitCurrencyAmount(totalNow, 'CNY', 2);

  const monthChange = totalNow - totalLast;
  const monthChangePct = totalLast > 0 ? (monthChange / totalLast) * 100 : 0;
  const ytdChange = totalNow - totalYearStart;
  const ytdChangePct = totalYearStart > 0 ? (ytdChange / totalYearStart) * 100 : 0;
  const yearChange = totalNow - totalYearAgo;
  const yearChangePct = totalYearAgo > 0 ? (yearChange / totalYearAgo) * 100 : 0;

  const chartData = React.useMemo(() => last12Months.map(m => totalAtMonth(m)), [last12Months, totalAtMonth]);
  const {
    chartMin,
    chartMax,
    chartRange,
    chartVisualMax,
    chartNonZeroCount,
  } = React.useMemo(() => {
    const nonZero = chartData.filter(v => v > 0);
    const max = nonZero.length > 0 ? Math.max(...nonZero) : 0;
    const min = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    return {
      chartMin: min,
      chartMax: max,
      chartRange: max - min || 1,
      chartVisualMax: Math.max(max, 1),
      chartNonZeroCount: nonZero.length,
    };
  }, [chartData]);

  const {
    myAccounts,
    wifeAccounts,
    myTotal,
    wifeTotal,
  } = React.useMemo(() => {
    const mine = [];
    const wife = [];
    let mineTotal = 0;
    let wifeSum = 0;
    (accounts || []).forEach((account) => {
      if (account.owner === '我') {
        mine.push(account);
        mineTotal += balanceAtMonthCNY(account.id, currentMonth);
      } else if (account.owner === '老婆') {
        wife.push(account);
        wifeSum += balanceAtMonthCNY(account.id, currentMonth);
      }
    });
    return {
      myAccounts: mine,
      wifeAccounts: wife,
      myTotal: mineTotal,
      wifeTotal: wifeSum,
    };
  }, [accounts, balanceAtMonthCNY, currentMonth]);
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

  const openMonthlyAssetTrend = React.useCallback(() => {
    setAssetMessage(null);
    if (typeof window !== 'undefined') {
      assetOverviewScrollYRef.current = window.scrollY || window.pageYOffset || 0;
    }
    setShowMonthsDetail(true);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    }
  }, [setShowMonthsDetail]);

  const closeMonthlyAssetTrend = React.useCallback(() => {
    setShowMonthsDetail(false);
    if (typeof window !== 'undefined') {
      const overviewScrollY = assetOverviewScrollYRef.current;
      window.requestAnimationFrame(() => window.scrollTo({ top: overviewScrollY, left: 0, behavior: 'auto' }));
    }
  }, [setShowMonthsDetail]);

  const openMonthlyBalanceEditor = React.useCallback((month) => {
    setAssetMessage(null);
    setSnapshotDraft({});
    setFillMonth(month);
    setShowFillSnapshot(true);
  }, [setFillMonth, setShowFillSnapshot, setSnapshotDraft]);

  const closeAccountAction = () => {
    setAssetMessage(null);
    setAccountActionId(null);
  };

  const closeAccountTrend = () => {
    setAccountTrendId(null);
  };

  const closeAccountEdit = () => {
    setAssetMessage(null);
    setEditingAccountId(null);
    setAccountEditDraft(null);
  };

  const openAccountEdit = (account) => {
    if (!account) return;
    const editMonth = localMonthKey();
    const exactBalance = getSnapshotBalance(account.id, editMonth);
    setAssetMessage(null);
    setAccountActionId(null);
    setEditingAccountId(account.id);
    setAccountEditDraft({
      owner: account.owner || '我',
      type: account.type || '',
      name: account.name || '',
      currency: account.currency || 'CNY',
      icon: account.icon || account.type || '',
      balance: Number(exactBalance) > 0 ? String(exactBalance) : '',
      balanceTouched: false,
      month: editMonth,
    });
  };

  const ownerGroups = React.useMemo(() => [
    { owner: '我', accounts: myAccounts, total: myTotal, pct: myPct },
    { owner: '老婆', accounts: wifeAccounts, total: wifeTotal, pct: wifePct },
  ], [myAccounts, myPct, myTotal, wifeAccounts, wifePct, wifeTotal]);

  const metricItems = React.useMemo(() => [
    { label: tt('analysis.vsLastMonth', '较上月'), value: monthChange, pct: monthChangePct, enabled: totalLast > 0 },
    { label: tt('analysis.ytd', '年初至今'), value: ytdChange, pct: ytdChangePct, enabled: totalYearStart > 0 },
    { label: tt('analysis.oneYear', '近一年'), value: yearChange, pct: yearChangePct, enabled: totalYearAgo > 0 },
  ], [monthChange, monthChangePct, totalLast, totalYearAgo, totalYearStart, tt, yearChange, yearChangePct, ytdChange, ytdChangePct]);

  const chartLeft = 64;
  const chartRight = 306;
  const chartTop = 18;
  const chartBottom = 124;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const chartLabelIndices = React.useMemo(() => (
    new Set([0, Math.floor((last12Months.length - 1) / 2), last12Months.length - 1])
  ), [last12Months.length]);
  const chartPoints = React.useMemo(() => chartData
    .map((v, i) => {
      const x = chartLeft + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
      const y = chartBottom - (v / chartVisualMax) * chartHeight;
      return { x, y, v, i };
    })
    .filter(p => p.v > 0), [chartBottom, chartData, chartHeight, chartLeft, chartVisualMax, chartWidth]);

  const chartPath = React.useMemo(() => (chartPoints.length > 1
    ? `M ${chartPoints[0].x} ${chartPoints[0].y} ${chartPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`
    : ''), [chartPoints]);
  const chartArea = React.useMemo(() => (chartPath
    ? `${chartPath} L ${chartPoints[chartPoints.length - 1].x} ${chartBottom} L ${chartPoints[0].x} ${chartBottom} Z`
    : ''), [chartBottom, chartPath, chartPoints]);
  const chartPathLength = React.useMemo(() => Math.max(1, chartPoints.reduce((sum, point, idx) => {
    if (idx === 0) return sum;
    const prev = chartPoints[idx - 1];
    return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
  }, 0)), [chartPoints]);
  const latestChartPoint = chartPoints[chartPoints.length - 1] || null;
  const visibleChartMarkerMonthIdx = chartSelectedMonthIdx !== null && chartData[chartSelectedMonthIdx] > 0
    ? chartSelectedMonthIdx
    : latestChartPoint?.i ?? null;
  const selectedChartDotDelay = chartSelectedMonthIdx !== null ? 0 : 900;

  const selectedChartValue = chartSelectedMonthIdx !== null ? chartData[chartSelectedMonthIdx] : 0;
  const selectedChartMonth = chartSelectedMonthIdx !== null ? last12Months[chartSelectedMonthIdx] : '';
  const selectedChartPrevValue = chartSelectedMonthIdx !== null && chartSelectedMonthIdx > 0
    ? chartData[chartSelectedMonthIdx - 1]
    : 0;
  const selectedChartChange = selectedChartPrevValue > 0 ? selectedChartValue - selectedChartPrevValue : null;
  const selectedChartChangePct = selectedChartPrevValue > 0 ? (selectedChartChange / selectedChartPrevValue) * 100 : null;
  const selectedTrendAccount = accountById.get(accountTrendId);
  const selectedAccountTrend = React.useMemo(() => (
    selectedTrendAccount
      ? buildAccountAssetTrend({
        accountId: selectedTrendAccount.id,
        snapshots,
        endMonth: currentMonth,
      })
      : null
  ), [currentMonth, selectedTrendAccount, snapshots]);
  const selectedActionAccount = accountById.get(accountActionId);
  const editingAccount = accountById.get(editingAccountId);

  const currentVisibleAccounts = (items) =>
    items.filter(acc => balanceAtMonthCNY(acc.id, currentMonth) !== 0)
      .sort((left, right) => balanceAtMonthCNY(right.id, currentMonth) - balanceAtMonthCNY(left.id, currentMonth));

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
      title: tt('analysis.deleteAccountTitle', '删除这个账户?'),
      desc: tt('analysis.deleteAccountDesc', '删除后会同步云端,该账户所有月度快照也会一起删除。'),
      info: `${accountNameLabel(account.name)} · ${accountTypeLabel(account.type)} · ${accountBalanceText(account)}`,
      confirmText: tt('analysis.delete', '删除'),
      icon: '🗑',
      onConfirm: async () => {
        try {
          await db.deleteAccount(account.id);
          setAccounts(accounts.filter(a => a.id !== account.id));
          setSnapshots(snapshots.filter(s => s.accountId !== account.id));
        } catch (e) {
          console.error('[删除账户] 失败:', e);
          setAssetMessage({ type: 'error', text: `${tt('analysis.deleteFailed', '删除失败')}: ${e.message || tt('analysis.unknownError', '未知错误')}` });
        }
      },
    });
  };

  const saveAccountEdit = async () => {
    if (!editingAccount || !accountEditDraft) return;
    const accountName = accountEditDraft.name.trim();
    if (!accountEditDraft.type) {
      setAssetMessage({ type: 'error', text: tt('analysis.chooseAccountType', '请选择账户类型') });
      return;
    }
    if (!accountName) {
      setAssetMessage({ type: 'error', text: tt('analysis.fillAccountName', '请填写账户名') });
      return;
    }
    if (accounts.find(a => a.id !== editingAccount.id && a.owner === accountEditDraft.owner && a.name === accountName)) {
      setAssetMessage({ type: 'error', text: tt('analysis.duplicateAccount', '该账户已存在') });
      return;
    }
    const snapshotMonth = accountEditDraft.month || localMonthKey();
    const snapshotMutations = accountEditDraft.balanceTouched
      ? buildAccountSnapshotMutations({
        draft: { [editingAccount.id]: accountEditDraft.balance },
        snapshots,
        month: snapshotMonth,
      })
      : { upserts: [], deletions: [], invalid: [] };
    if (snapshotMutations.invalid.length > 0) {
      setAssetMessage({ type: 'error', text: tt('analysis.validBalance', '请填写有效余额') });
      return;
    }

    const persistAccountEdit = async () => {
      try {
        const updated = await db.updateAccount(editingAccount.id, {
          owner: accountEditDraft.owner,
          type: accountEditDraft.type,
          name: accountName,
          currency: accountEditDraft.currency,
          icon: accountEditDraft.type,
          sortOrder: editingAccount.sortOrder || 0,
        });
        setAccounts((currentAccounts) => currentAccounts.map(acc => (acc.id === editingAccount.id ? updated : acc)));
        await persistSnapshotMutations(snapshotMutations);
        closeAccountEdit();
      } catch (e) {
        console.error('[修改账户] 失败:', e);
        setAssetMessage({ type: 'error', text: `${tt('analysis.saveFailed', '保存失败')}: ${e.message || tt('analysis.unknownError', '未知错误')}` });
      }
    };

    if (snapshotMutations.deletions.length > 0) {
      showConfirm({
        title: tt('analysis.deleteSnapshotTitle', '删除月度余额记录?'),
        desc: tt('analysis.deleteSnapshotDesc', '填 0 或清空代表该月记录不存在。删除后，资产走势会从剩余的第一个有数据月份重新计算。'),
        info: `${accountNameLabel(accountName)} · ${snapshotMonth}`,
        confirmText: tt('analysis.deleteSnapshotConfirm', '删除并保存'),
        icon: '🗑',
        onConfirm: persistAccountEdit,
      });
      return;
    }

    await persistAccountEdit();
  };

  const saveNewAccount = async () => {
    const snapshotMonth = localMonthKey();
    const accountName = newAccount.name.trim();
    if (!newAccount.type) {
      setAssetMessage({ type: 'error', text: tt('analysis.chooseAccountType', '请选择账户类型') });
      return;
    }
    if (!accountName) {
      setAssetMessage({ type: 'error', text: tt('analysis.fillAccountName', '请填写账户名') });
      return;
    }
    if (accounts.find(a => a.owner === newAccount.owner && a.name === accountName)) {
      setAssetMessage({ type: 'error', text: tt('analysis.duplicateAccount', '该账户已存在') });
      return;
    }
    const initialBalanceText = String(newAccount.balance ?? '').trim();
    const initialBalance = initialBalanceText === '' ? 0 : Number(initialBalanceText);
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      setAssetMessage({ type: 'error', text: tt('analysis.validBalance', '请填写有效余额') });
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
      setAccounts((currentAccounts) => [...currentAccounts, saved]);
      if (initialBalance > 0) {
        await db.upsertSnapshot(saved.id, snapshotMonth, initialBalance);
        setSnapshots((currentSnapshots) => applyAccountSnapshotMutations(currentSnapshots, {
          upserts: [{ accountId: saved.id, month: snapshotMonth, balance: initialBalance }],
        }));
      }
      setNewAccount({ owner: '我', type: '', name: '', currency: 'CNY', icon: '', balance: '' });
      closeAddAccount();
    } catch (e) {
      console.error('[添加账户] 失败:', e);
      setAssetMessage({ type: 'error', text: `${tt('analysis.addFailed', '添加失败')}: ${e.message || tt('analysis.unknownError', '未知错误')}` });
    }
  };

  const saveFillSnapshot = async () => {
    const snapshotMutations = buildAccountSnapshotMutations({
      draft: snapshotDraft,
      snapshots,
      month: fillMonth,
    });
    if (snapshotMutations.invalid.length > 0) {
      setAssetMessage({ type: 'error', text: tt('analysis.validBalance', '请填写有效余额') });
      return;
    }
    if (snapshotMutations.upserts.length === 0 && snapshotMutations.deletions.length === 0) {
      closeFillSnapshot();
      return;
    }

    const persistFillSnapshot = async () => {
      try {
        await persistSnapshotMutations(snapshotMutations);
        closeFillSnapshot();
      } catch (e) {
        console.error('[保存快照] 失败:', e);
        setAssetMessage({ type: 'error', text: `${tt('analysis.saveFailed', '保存失败')}: ${e.message || tt('analysis.unknownError', '未知错误')}` });
      }
    };

    if (snapshotMutations.deletions.length > 0) {
      const deletedNames = snapshotMutations.deletions
        .map(({ accountId }) => accountNameLabel(accountById.get(accountId)?.name))
        .filter(Boolean)
        .join('、');
      showConfirm({
        title: tt('analysis.deleteSnapshotTitle', '删除月度余额记录?'),
        desc: tt('analysis.deleteSnapshotDesc', '填 0 或清空代表该月记录不存在。删除后，资产走势会从剩余的第一个有数据月份重新计算。'),
        info: `${fillMonth} · ${deletedNames || tt('analysis.monthlyBalance', '月度余额')}`,
        confirmText: tt('analysis.deleteSnapshotConfirm', '删除并保存'),
        icon: '🗑',
        onConfirm: persistFillSnapshot,
      });
      return;
    }

    await persistFillSnapshot();
  };

  const monthlyAssetTrendPage = (
    <main
      className="mx-auto w-full max-w-[430px] pb-3 text-[#f5f7fb]"
      data-monthly-asset-trend-page="true"
      style={{ fontFamily: ASSET_FONT }}
    >
      <header className="relative mb-4 flex min-h-[40px] items-center justify-center">
        <button
          type="button"
          onClick={closeMonthlyAssetTrend}
          className="absolute left-0 flex h-10 w-10 items-center justify-start text-white/[0.78] active:scale-95 active:text-white transition"
          aria-label={tt('analysis.backToAssetOverview', '返回资产总览')}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <h1 className="px-12 text-center text-[17px] font-medium leading-6 text-white/[0.94]">
          {tt('analysis.monthTrendTitle', '12 个月资产走势')}
        </h1>
      </header>

      <MonthlyAssetTrendContent
        language={language}
        months={last12Months}
        values={chartData}
        currentMonth={currentMonth}
        comparisonStartMonth={yearAgo}
        comparisonStartValue={totalYearAgo}
        onEditMonth={openMonthlyBalanceEditor}
      />
    </main>
  );

  return (
    <>
      {showMonthsDetail ? monthlyAssetTrendPage : (
      <div className="space-y-3.5 text-[#f5f7fb]" style={{ fontFamily: ASSET_FONT }}>
      <section className="rounded-2xl border border-transparent bg-[#0b0c0e] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_1px_0_0_rgba(255,255,255,0.03),inset_-1px_0_0_rgba(255,255,255,0.03),inset_0_-1px_0_rgba(255,255,255,0.01)]">
        <div className="flex min-h-[34px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[14px] font-normal text-white/70">
            <span>{tt('analysis.familyNetWorth', '家庭总资产')}</span>
            <Info className="h-3.5 w-3.5 text-white/50" strokeWidth={1.8} />
          </div>

          <button
            onClick={openMonthlyAssetTrend}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 text-[11px] text-white/[0.82] active:scale-95 transition"
            title={tt('analysis.monthTrendTitle', '12 个月资产走势')}
          >
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>{currentMonth}</span>
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>

        <div
          className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap font-normal leading-none tracking-normal text-white/[0.95] tabular-nums"
          style={{ fontFamily: ASSET_NUMBER_FONT, fontSize: 'clamp(28px, 8.7vw, 34px)' }}
        >
          <span>{totalNowMoney.main}</span>
          <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-white/[0.95]">{totalNowMoney.decimal}</span>
        </div>

        <div className="mt-6 grid grid-cols-[1fr_1.12fr_0.96fr] divide-x divide-white/10">
          {metricItems.map((item, idx) => {
            const positive = item.value >= 0;
            const color = positive ? ASSET_PINK : ASSET_GREEN;
            return (
              <div key={item.label} className={idx === 0 ? 'min-w-0 pr-3' : idx === metricItems.length - 1 ? 'min-w-0 pl-3' : 'min-w-0 px-3'}>
                <div className="text-[13px] text-white/50">{item.label}</div>
                {item.enabled ? (
                  <div className="mt-2 space-y-1">
                    <div className="whitespace-nowrap text-[13px] font-normal leading-tight tabular-nums" style={{ color, fontFamily: ASSET_NUMBER_FONT }}>
                      <span className="whitespace-nowrap">{fmtSignedWan(item.value)}</span>
                    </div>
                    <div className="text-[12px] font-normal tabular-nums" style={{ color, fontFamily: ASSET_NUMBER_FONT }}>
                      {fmtSignedPct(item.pct)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[12px] text-white/25">{tt('analysis.noData', '无数据')}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {chartNonZeroCount >= 2 && (
        <section
          className="rounded-[20px] border border-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          style={{ background: ASSET_CARD }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[14px] text-white/90">
              <LineChart className="h-4 w-4" style={{ color: ASSET_PINK }} strokeWidth={1.8} />
              <span>{tt('analysis.monthTrend', '12 个月走势')}</span>
            </div>
            <button
              onClick={openMonthlyAssetTrend}
              className="text-[11px] text-white/[0.45] active:text-white/70"
            >
              {tt('analysis.monthlyTapToView', '月度 · 点击查看')}
            </button>
          </div>

          {selectedChartValue > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[12px] text-white/60">
              <div className="min-w-0">
                <div className="tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>{monthText(selectedChartMonth)}</div>
                {selectedChartChange !== null && (
                  <div className="mt-1 truncate tabular-nums" style={{ color: selectedChartChange >= 0 ? ASSET_PINK : ASSET_GREEN, fontFamily: ASSET_NUMBER_FONT }}>
                    {tt('analysis.vsLastMonth', '较上月')} {fmtSignedWan(selectedChartChange)} · {fmtSignedPct(selectedChartChangePct)}
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

              {chartPoints.map((p) => {
                const selected = visibleChartMarkerMonthIdx === p.i;
                return (
                  <g key={p.i}>
                    {selected && (
                      <>
                        <line x1={p.x} x2={p.x} y1={p.y} y2={chartBottom} stroke={ASSET_PINK} strokeOpacity="0.45" strokeDasharray="3 4" />
                        <circle className="asset-chart-dot" cx={p.x} cy={p.y} r="5.8" fill="#0b0f14" stroke={ASSET_PINK} strokeWidth="2.5" style={{ animationDelay: `${selectedChartDotDelay}ms` }} />
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
              [tt('analysis.low', '最低'), chartMin],
              [tt('analysis.high', '最高'), chartMax],
              [tt('analysis.range', '区间'), chartRange],
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
            setFillMonth(localMonthKey());
            setShowFillSnapshot(true);
          }}
          disabled={accounts.length === 0}
          className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/[0.16] bg-white/[0.045] px-2 text-[13px] text-white/[0.82] active:scale-95 transition disabled:opacity-35"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span className="truncate">{tt('analysis.addMonthlyBalance', '填月度余额')}</span>
        </button>
        <button
          onClick={openAddAccount}
          className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/[0.16] bg-white/[0.045] px-2 text-[13px] text-white/[0.82] active:scale-95 transition"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span className="truncate">{tt('analysis.addAccount', '新增账户')}</span>
        </button>
      </div>

      {accounts.length === 0 && (
        <section className="rounded-[22px] border border-transparent bg-white/[0.04] px-5 py-9 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-white/[0.65]">
            <PiggyBank className="h-7 w-7" strokeWidth={1.8} />
          </div>
          <div className="text-[16px] text-white/[0.88]">{tt('analysis.noAccounts', '还没有账户')}</div>
          <div className="mt-2 text-[12px] text-white/[0.45]">{tt('analysis.noAccountsDesc', '添加你和家人的账户,记录每月余额')}</div>
          <button
            onClick={openAddAccount}
            className="mt-5 rounded-xl border px-5 py-2.5 text-[13px] active:scale-95 transition"
            style={{ borderColor: 'rgba(246,197,111,0.6)', color: ASSET_GOLD, background: 'rgba(246,197,111,0.08)' }}
          >
            {tt('analysis.addFirstAccount', '添加第一个账户')}
          </button>
        </section>
      )}

      {ownerGroups.map(({ owner, accounts: ownerAccs, total, pct }) => {
        const visibleOwnerAccs = currentVisibleAccounts(ownerAccs);
        if (visibleOwnerAccs.length === 0) return null;
        return (
          <section
            key={owner}
          className="rounded-[20px] border border-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ background: ASSET_CARD }}
        >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[16px] leading-none text-white/[0.92]">{ownerGroupLabel(owner)}</div>
                <div className="mt-2 text-[12px] text-white/[0.45]">{tt('analysis.accountsSummary', '{{count}} 个账户 · 占总资产 {{pct}}%', { count: visibleOwnerAccs.length, pct: pct.toFixed(0) })}</div>
              </div>
              <div className="text-right text-[21px] leading-none tabular-nums" style={{ color: ASSET_PINK, fontFamily: ASSET_NUMBER_FONT }}>
                ¥{fmtWan(total)}万
              </div>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: ASSET_PINK }} />
            </div>

            <div className="mt-4 space-y-2">
              {visibleOwnerAccs.map(acc => {
                const bal = getBalance(acc.id, currentMonth);
                const balCNY = toCNY(bal, acc.currency);
                const displayName = accountNameLabel(acc.name);
                return (
                  <div
                    key={acc.id}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAssetMessage(null);
                        setAccountTrendId(acc.id);
                      }}
                      className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 text-left transition active:bg-white/[0.025]"
                      aria-label={tt('analysis.viewAccountTrend', '查看{{name}}资产走势', { name: displayName })}
                      data-open-account-trend={acc.id}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/[0.18] text-white/[0.55]">
                        <AccountTypeIcon type={acc.type} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 border-l border-white/10 pl-2.5">
                        <div className="truncate text-[13px] text-white/[0.88]">{displayName}</div>
                        <div className="mt-1 text-[11px] text-white/[0.42]">{accountTypeLabel(acc.type)}{acc.currency !== 'CNY' ? ` · ${acc.currency}` : ''}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssetMessage(null);
                        setAccountActionId(acc.id);
                      }}
                      className="flex shrink-0 items-center gap-2 px-2.5 py-2.5 text-right transition active:bg-white/[0.025]"
                      aria-label={tt('analysis.openAccountActionsFor', '打开{{name}}修改和删除', { name: displayName })}
                      data-open-account-actions={acc.id}
                    >
                      <span className="shrink-0">
                        <span className="block whitespace-nowrap text-[13px] tabular-nums text-white/[0.88]" style={{ fontFamily: ASSET_NUMBER_FONT }}>
                          {acc.currency === 'CNY' ? `¥${fmtWan(bal)}万` : `${currencyPrefix(acc.currency)}${fmt(bal, 0)}`}
                        </span>
                        {acc.currency !== 'CNY' && (
                          <span className="mt-1 block whitespace-nowrap text-[11px] tabular-nums text-white/40" style={{ fontFamily: ASSET_NUMBER_FONT }}>≈¥{fmtWan(balCNY)}万</span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/35" strokeWidth={1.8} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {showAddAccount && (
        <ActionModalCard
          title={tt('analysis.addAccount', '新增账户')}
          closeLabel={tt('analysis.closeAddAccount', '关闭新增账户')}
          onClose={closeAddAccount}
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          actions={[
            { key: 'cancel', label: tt('analysis.cancel', '取消'), onClick: closeAddAccount },
            { key: 'save', label: tt('analysis.add', '添加'), onClick: saveNewAccount },
          ]}
        >
            <div className="min-w-0">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.owner', '拥有人')}</label>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/[0.22] p-1">
                    {['我', '老婆'].map(owner => (
                      <button
                        key={owner}
                        onClick={() => setNewAccount({ ...newAccount, owner })}
                        className="rounded-lg py-2.5 text-[13px] transition"
                        style={newAccount.owner === owner ? { background: 'rgba(255,255,255,0.08)', color: '#f7fbff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' } : { color: 'rgba(255,255,255,0.52)' }}
                      >
                        {ownerLabel(owner)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.type', '类型')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, Icon }) => {
                      const active = newAccount.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setNewAccount({ ...newAccount, type, icon: type })}
                          className="flex aspect-square min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border text-[12px] transition"
                          style={active
                            ? { borderColor: 'rgba(246,197,111,0.38)', color: ASSET_GOLD, background: 'rgba(246,197,111,0.07)' }
                            : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', background: 'rgba(255,255,255,0.035)' }}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                          <span>{accountTypeLabel(type)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.accountName', '账户名')}</label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(ACCOUNT_PRESETS[newAccount.type] || []).map(name => (
                      <button
                        key={name}
                        onClick={() => setNewAccount({ ...newAccount, name })}
                        className="rounded-lg border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[12px] text-white/[0.65] active:scale-95 transition"
                        style={newAccount.name === name ? { color: ASSET_GOLD, borderColor: 'rgba(246,197,111,0.45)', background: 'rgba(246,197,111,0.08)' } : undefined}
                      >
                        {accountNameLabel(name)}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newAccount.name}
                    onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                    placeholder={newAccount.type ? tt('analysis.quickOrCustomPlaceholder', '点上面快捷选或自己输入') : tt('analysis.chooseTypeFirstPlaceholder', '先选择类型,再输入账户名')}
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.currency', '币种')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['CNY', 'USD', 'HKD'].map(currency => (
                      <button
                        key={currency}
                        onClick={() => setNewAccount({ ...newAccount, currency })}
                        className="rounded-xl border py-2.5 text-[13px] tabular-nums transition"
                        style={newAccount.currency === currency
                          ? { borderColor: 'rgba(246,197,111,0.38)', color: '#f7fbff', background: 'rgba(246,197,111,0.07)' }
                          : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.56)', background: 'rgba(255,255,255,0.035)' }}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.currentBalanceOptional', '当前余额 (可稍后填)')}</label>
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

            </div>
        </ActionModalCard>
      )}

      {selectedTrendAccount && selectedAccountTrend && (
        <AccountAssetTrendModal
          account={selectedTrendAccount}
          accountName={accountNameLabel(selectedTrendAccount.name)}
          accountType={accountTypeLabel(selectedTrendAccount.type)}
          language={language}
          trend={selectedAccountTrend}
          onClose={closeAccountTrend}
        />
      )}

      {selectedActionAccount && (
        <ActionModalCard
          title={tt('analysis.accountActions', '账户操作')}
          closeLabel={tt('analysis.closeAccountActions', '关闭账户操作')}
          onClose={closeAccountAction}
          actions={[
            {
              key: 'edit',
              label: tt('analysis.edit', '修改'),
              onClick: () => openAccountEdit(selectedActionAccount),
            },
            {
              key: 'delete',
              label: tt('analysis.delete', '删除'),
              onClick: () => confirmDeleteAccount(selectedActionAccount),
            },
          ]}
        >
          <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5">
            <AccountLogo account={selectedActionAccount} />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-normal leading-5 text-white/[0.82]">{accountNameLabel(selectedActionAccount.name)}</div>
              <div className="mt-[3px] truncate text-[11.5px] font-normal leading-4 text-white/[0.42]">
                {ownerLabel(selectedActionAccount.owner)} · {accountTypeLabel(selectedActionAccount.type)} · {selectedActionAccount.currency || 'CNY'}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="whitespace-nowrap text-[16px] font-normal tracking-normal text-white/[0.78] tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>{accountBalanceText(selectedActionAccount)}</div>
              {accountApproxText(selectedActionAccount) && (
                <div className="mt-1 whitespace-nowrap text-[10.5px] text-white/[0.37] tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>{accountApproxText(selectedActionAccount)}</div>
              )}
            </div>
          </div>
        </ActionModalCard>
      )}

      {editingAccount && accountEditDraft && (
        <ActionModalCard
          title={tt('analysis.editAccount', '修改账户')}
          closeLabel={tt('analysis.closeEditAccount', '关闭修改账户')}
          onClose={closeAccountEdit}
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          actions={[
            { key: 'cancel', label: tt('analysis.cancel', '取消'), onClick: closeAccountEdit },
            { key: 'save', label: tt('analysis.saveChanges', '保存修改'), onClick: saveAccountEdit },
          ]}
        >
            <div className="min-w-0">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.owner', '拥有人')}</label>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/[0.22] p-1">
                    {['我', '老婆'].map(owner => (
                      <button
                        key={owner}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, owner })}
                        className="rounded-lg py-2.5 text-[13px] transition"
                        style={accountEditDraft.owner === owner ? { background: 'rgba(255,255,255,0.08)', color: '#f7fbff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' } : { color: 'rgba(255,255,255,0.52)' }}
                      >
                        {ownerLabel(owner)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.type', '类型')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, Icon }) => {
                      const active = accountEditDraft.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setAccountEditDraft({ ...accountEditDraft, type, icon: type })}
                          className="flex aspect-square min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border text-[12px] transition"
                          style={active
                            ? { borderColor: 'rgba(246,197,111,0.38)', color: ASSET_GOLD, background: 'rgba(246,197,111,0.07)' }
                            : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', background: 'rgba(255,255,255,0.035)' }}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                          <span>{accountTypeLabel(type)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.accountName', '账户名')}</label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(ACCOUNT_PRESETS[accountEditDraft.type] || []).map(name => (
                      <button
                        key={name}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, name })}
                        className="rounded-lg border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[12px] text-white/[0.65] active:scale-95 transition"
                        style={accountEditDraft.name === name ? { color: ASSET_GOLD, borderColor: 'rgba(246,197,111,0.45)', background: 'rgba(246,197,111,0.08)' } : undefined}
                      >
                        {accountNameLabel(name)}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={accountEditDraft.name}
                    onChange={(e) => setAccountEditDraft({ ...accountEditDraft, name: e.target.value })}
                    placeholder={tt('analysis.accountNamePlaceholder', '账户名称')}
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.currency', '币种')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['CNY', 'USD', 'HKD'].map(currency => (
                      <button
                        key={currency}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, currency })}
                        className="rounded-xl border py-2.5 text-[13px] tabular-nums transition"
                        style={accountEditDraft.currency === currency
                          ? { borderColor: 'rgba(246,197,111,0.38)', color: '#f7fbff', background: 'rgba(246,197,111,0.07)' }
                          : { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.56)', background: 'rgba(255,255,255,0.035)' }}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] text-white/[0.55]">{tt('analysis.currentMonthBalance', '本月余额')}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={accountEditDraft.balance}
                    onChange={(e) => setAccountEditDraft((currentDraft) => ({
                      ...currentDraft,
                      balance: e.target.value,
                      balanceTouched: true,
                    }))}
                    placeholder="0"
                    className={`${inputClassName} tabular-nums`}
                    style={{ colorScheme: 'dark', fontFamily: ASSET_NUMBER_FONT }}
                  />
                  <div className="mt-2 text-[11px] leading-4 text-white/[0.38]">
                    {tt('analysis.zeroDeletesSnapshot', '填 0 或清空后保存，将删除该月记录')}
                  </div>
                </div>

                {assetMessage && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-100">
                    {assetMessage.text}
                  </div>
                )}
              </div>

            </div>
        </ActionModalCard>
      )}

      </div>
      )}

      {showFillSnapshot && (
        <ActionModalCard
          title={tt('analysis.addMonthlyBalance', '填月度余额')}
          closeLabel={tt('analysis.closeMonthlyBalance', '关闭填月度余额')}
          onClose={closeFillSnapshot}
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          actions={[
            { key: 'cancel', label: tt('analysis.cancel', '取消'), onClick: closeFillSnapshot },
            { key: 'save', label: tt('analysis.saveMonth', '保存 {{month}}', { month: fillMonth }), onClick: saveFillSnapshot },
          ]}
        >
            <div className="min-w-0">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="mb-3 text-[12px] text-white/[0.52]">{tt('analysis.selectMonth', '选择月份')}</div>
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
                    {fillMonth === currentMonth && <div className="mt-1 text-[11px] text-blue-300">{tt('analysis.thisMonth', '本月')}</div>}
                    {fillMonth > currentMonth && <div className="mt-1 text-[11px] text-amber-300">{tt('analysis.futureMonth', '未来月')}</div>}
                    {fillMonth < currentMonth && <div className="mt-1 text-[11px] text-white/[0.42]">{tt('analysis.historyMonth', '历史月')}</div>}
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
                  const exactBalance = getSnapshotBalance(acc.id, fillMonth);
                  const v = parseFloat(snapshotDraft[acc.id] ?? exactBalance ?? 0) || 0;
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
                              style={active ? { background: 'rgba(255,255,255,0.08)', color: '#f7fbff' } : { color: 'rgba(255,255,255,0.52)' }}
                            >
                              <span>{ownerLabel(owner)}</span>
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{accs.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {hasMulti && (
                      <div className="mt-4 flex items-center justify-between text-[12px] text-white/[0.52]">
                        <span>{tt('analysis.monthlyOwnerSummary', '{{owner}} · {{count}} 个账户', { owner: ownerLabel(snapshotTab), count: currentAccs.length })}</span>
                        <span className="text-white/[0.95] tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>≈ ¥{fmt(curSum, 0)}</span>
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      {currentAccs.map(acc => {
                        const currentBal = getSnapshotBalance(acc.id, fillMonth);
                        const draftVal = snapshotDraft[acc.id] ?? (Number(currentBal) > 0 ? currentBal : '');
                        return (
                          <div key={acc.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/[0.18] text-white/[0.55]">
                              <AccountTypeIcon type={acc.type} className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] text-white/[0.86]">{accountNameLabel(acc.name)}</div>
                              <div className="mt-1 text-[11px] text-white/[0.42]">{acc.currency}</div>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={draftVal}
                              onChange={(e) => setSnapshotDraft((currentDraft) => ({
                                ...currentDraft,
                                [acc.id]: e.target.value,
                              }))}
                              placeholder="0"
                              className="w-[116px] min-w-0 max-w-full box-border rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-right text-[13px] text-[#f5f7fb] outline-none placeholder:text-[#6f7887] focus:border-[#f6c56f]"
                              style={{ colorScheme: 'dark', fontFamily: ASSET_NUMBER_FONT }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 px-1 text-[11px] leading-4 text-white/[0.38]">
                      {tt('analysis.zeroDeletesSnapshot', '填 0 或清空后保存，将删除该月记录')}
                    </div>
                  </div>
                );
              })()}

              {assetMessage && (
                <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-100">
                  {assetMessage.text}
                </div>
              )}

            </div>
        </ActionModalCard>
      )}
    </>
  );
}

export default React.memo(AnalysisTab);
