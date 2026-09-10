import React from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Home,
  Landmark,
  MessageCircle,
  PiggyBank,
  Plus,
  WalletCards,
} from 'lucide-react';
import StockReportModal from '../components/StockReportModal.jsx';
import AccountAssetTrendModal from '../components/AccountAssetTrendModal.jsx';
import MonthlyAssetCategoryReport from '../components/MonthlyAssetCategoryReport.jsx';
import MonthlyAssetTrendChart, { MONTHLY_ASSET_CHART_WIDTH, buildMonthlyAssetTrendChartScale } from '../components/MonthlyAssetTrendChart.jsx';
import MonthlyAssetTrendContent from '../components/MonthlyAssetTrendContent.jsx';
import { buildAccountAssetTrend } from '../lib/accountAssetTrend.js';
import { applyAccountSnapshotMutations, buildAccountSnapshotMutations } from '../lib/accountSnapshotMutation.js';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { localMonthKey, shiftMonthKey } from '../lib/calendarMonth.js';
import { t } from '../lib/i18n.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import { buildMonthlyAssetAccountReport } from '../lib/monthlyAssetCategoryReport.js';
import { buildMonthlyAssetTrend } from '../lib/monthlyAssetTrend.js';
import './AnalysisTab.css';
import './AssetDialogs.css';

const ASSET_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const ASSET_NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

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

const inputClassName = 'asset-dialog-input';

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
    <div className="asset-dialog-logo">
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

function AnalysisTab({ ctx }) {
  const {
    accounts,
    chartSelectedMonthIdx,
    db,
    fillMonth,
    fmt,
    hkdRate,
    language = 'zh',
    marketColorMode = 'redUpGreenDown',
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
  const [selectedAssetCategoryMonth, setSelectedAssetCategoryMonth] = React.useState('');
  const [monthlyDetailsExpanded, setMonthlyDetailsExpanded] = React.useState(false);
  const assetOverviewScrollYRef = React.useRef(0);
  const monthlyTrendScrollYRef = React.useRef(0);
  const overviewChartInteractionRef = React.useRef(null);
  const overviewChartPointerIdRef = React.useRef(null);

  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);

  React.useEffect(() => {
    if (chartSelectedMonthIdx === null) return undefined;

    const clearSelectedMonthOutsideOverviewChart = (event) => {
      if (overviewChartInteractionRef.current?.contains(event.target)) return;
      overviewChartPointerIdRef.current = null;
      setChartSelectedMonthIdx(null);
    };

    document.addEventListener('pointerdown', clearSelectedMonthOutsideOverviewChart, true);
    return () => document.removeEventListener('pointerdown', clearSelectedMonthOutsideOverviewChart, true);
  }, [chartSelectedMonthIdx, setChartSelectedMonthIdx]);

  React.useEffect(() => {
    if (showMonthsDetail) return;
    setSelectedAssetCategoryMonth('');
    setMonthlyDetailsExpanded(false);
  }, [showMonthsDetail]);

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
  const assetCategoryReport = React.useMemo(() => buildMonthlyAssetAccountReport({
    accounts,
    snapshots,
    month: selectedAssetCategoryMonth,
    toCNY,
  }), [accounts, selectedAssetCategoryMonth, snapshots, toCNY]);
  const {
    chartMin,
    chartMax,
    chartRange,
    chartNonZeroCount,
  } = React.useMemo(() => {
    const nonZero = chartData.filter(v => v > 0);
    const max = nonZero.length > 0 ? Math.max(...nonZero) : 0;
    const min = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    return {
      chartMin: min,
      chartMax: max,
      chartRange: max - min || 1,
      chartNonZeroCount: nonZero.length,
    };
  }, [chartData]);
  const overviewChartModel = React.useMemo(
    () => buildMonthlyAssetTrend({ months: last12Months, values: chartData }),
    [chartData, last12Months],
  );
  const overviewChartScale = React.useMemo(
    () => buildMonthlyAssetTrendChartScale(overviewChartModel, last12Months.length),
    [last12Months.length, overviewChartModel],
  );
  const overviewChartLatestIndex = overviewChartModel.points.at(-1)?.index ?? null;

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
    setSelectedAssetCategoryMonth('');
    setMonthlyDetailsExpanded(false);
    if (typeof window !== 'undefined') {
      assetOverviewScrollYRef.current = window.scrollY || window.pageYOffset || 0;
    }
    setShowMonthsDetail(true);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    }
  }, [setShowMonthsDetail]);

  const closeMonthlyAssetTrend = React.useCallback(() => {
    setSelectedAssetCategoryMonth('');
    setMonthlyDetailsExpanded(false);
    setShowMonthsDetail(false);
    if (typeof window !== 'undefined') {
      const overviewScrollY = assetOverviewScrollYRef.current;
      window.requestAnimationFrame(() => window.scrollTo({ top: overviewScrollY, left: 0, behavior: 'auto' }));
    }
  }, [setShowMonthsDetail]);

  const openMonthlyAssetCategoryReport = React.useCallback((month) => {
    if (!month) return;
    setAssetMessage(null);
    if (typeof window !== 'undefined') {
      monthlyTrendScrollYRef.current = window.scrollY || window.pageYOffset || 0;
    }
    setSelectedAssetCategoryMonth(month);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    }
  }, []);

  const closeMonthlyAssetCategoryReport = React.useCallback(() => {
    setSelectedAssetCategoryMonth('');
    if (typeof window !== 'undefined') {
      const monthlyTrendScrollY = monthlyTrendScrollYRef.current;
      window.requestAnimationFrame(() => window.scrollTo({ top: monthlyTrendScrollY, left: 0, behavior: 'auto' }));
    }
  }, []);

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

  const requestedChartSlot = overviewChartModel.slots[chartSelectedMonthIdx];
  const overviewChartReading = chartSelectedMonthIdx !== null && requestedChartSlot?.hasData
    ? requestedChartSlot
    : null;
  const selectedChartValue = overviewChartReading?.balance ?? null;
  const selectedChartMonth = overviewChartReading?.month || '--';
  const selectedChartChange = overviewChartReading?.changeAmount ?? null;
  const selectedChartChangePct = overviewChartReading?.changePct ?? null;
  const selectedChartMoney = Number.isFinite(selectedChartValue)
    ? splitCurrencyAmount(selectedChartValue, 'CNY', 2)
    : { main: '--', decimal: '' };
  const selectedChartChangeMoney = Number.isFinite(selectedChartChange)
    ? splitCurrencyAmount(Math.abs(selectedChartChange), 'CNY', 2)
    : { main: '--', decimal: '' };

  const selectNearestOverviewMonth = React.useCallback((event) => {
    if (overviewChartModel.points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const viewX = ((event.clientX - bounds.left) / bounds.width) * MONTHLY_ASSET_CHART_WIDTH;
    let nearest = overviewChartModel.points[0];
    let distance = Number.POSITIVE_INFINITY;
    overviewChartModel.points.forEach((point) => {
      const candidateDistance = Math.abs(overviewChartScale.xForIndex(point.index) - viewX);
      if (candidateDistance < distance) {
        nearest = point;
        distance = candidateDistance;
      }
    });
    setChartSelectedMonthIdx(nearest.index);
  }, [overviewChartModel.points, overviewChartScale, setChartSelectedMonthIdx]);

  const handleOverviewPointerDown = React.useCallback((event) => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    overviewChartPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectNearestOverviewMonth(event);
  }, [selectNearestOverviewMonth]);

  const handleOverviewPointerMove = React.useCallback((event) => {
    if (overviewChartPointerIdRef.current !== event.pointerId) return;
    selectNearestOverviewMonth(event);
  }, [selectNearestOverviewMonth]);

  const finishOverviewPointerTracking = React.useCallback((event) => {
    if (overviewChartPointerIdRef.current !== event.pointerId) return;
    overviewChartPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

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
    return `${currencyPrefix(account.currency)}${fmt(bal, 2)}`;
  };

  const accountApproxText = (account) => {
    if (!account || account.currency === 'CNY') return '';
    const balCNY = balanceAtMonthCNY(account.id, currentMonth);
    return `≈¥${fmt(balCNY, 2)}`;
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
        expanded={monthlyDetailsExpanded}
        onExpandedChange={setMonthlyDetailsExpanded}
        onOpenMonthReport={openMonthlyAssetCategoryReport}
      />
    </main>
  );

  const monthlyAssetCategoryReportPage = (
    <main
      className="mx-auto w-full max-w-[430px] pb-3 text-[#f5f7fb]"
      data-monthly-asset-category-report-page="true"
      style={{ fontFamily: ASSET_FONT }}
    >
      <header className="relative mb-4 grid min-h-[44px] grid-cols-[40px_minmax(0,1fr)_40px] items-center">
        <button
          type="button"
          onClick={closeMonthlyAssetCategoryReport}
          className="flex h-10 w-10 items-center justify-start text-white/[0.78] transition active:scale-95 active:text-white"
          aria-label={tt('analysis.backToMonthlyAssetTrend', '返回12个月资产走势')}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-[16px] font-medium leading-6 text-white/[0.94]">
            {tt('analysis.assetCategoryReportTitle', '{{month}} · 账户资产环比', { month: selectedAssetCategoryMonth })}
          </h1>
          <div className="mt-0.5 text-[10px] text-white/[0.42] tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>
            {tt('analysis.assetCategoryCompareWith', '对比 {{month}}', { month: assetCategoryReport.previousMonth || '--' })}
          </div>
        </div>
        <span className="h-10 w-10" aria-hidden="true" />
      </header>

      <MonthlyAssetCategoryReport
        language={language}
        report={assetCategoryReport}
      />
    </main>
  );

  return (
    <>
      {showMonthsDetail ? (
        selectedAssetCategoryMonth ? monthlyAssetCategoryReportPage : monthlyAssetTrendPage
      ) : (
      <div className="asset-report" style={{ fontFamily: ASSET_FONT }}>
      <section className="asset-report-hero">
        <div className="asset-report-hero-header">
          <span className="asset-report-label">{tt('analysis.familyNetWorth', '家庭总资产')}</span>
          <button
            type="button"
            onClick={openMonthlyAssetTrend}
            className="asset-report-month"
            title={tt('analysis.monthTrendTitle', '12 个月资产走势')}
          >
            <CalendarDays size={14} strokeWidth={1.8} />
            <span>{currentMonth}</span>
            <ChevronRight size={13} strokeWidth={1.8} />
          </button>
        </div>

        <div className="asset-report-total" style={{ fontFamily: ASSET_NUMBER_FONT }}>
          <span>{totalNowMoney.main}</span><span className="asset-report-decimal">{totalNowMoney.decimal}</span>
        </div>

        <div className="asset-report-metrics">
          {metricItems.map(item => (
            <div key={item.label} className="asset-report-metric">
              <div className="asset-report-label">{item.label}</div>
              {item.enabled ? (
                <div style={{ color: marketHexColor(item.value, marketColorMode), fontFamily: ASSET_NUMBER_FONT }}>
                  <div className="asset-report-metric-value">{fmtSignedWan(item.value)}</div>
                  <div className="asset-report-metric-percent">{fmtSignedPct(item.pct)}</div>
                </div>
              ) : (
                <div className="asset-report-unavailable">{tt('analysis.noData', '无数据')}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {chartNonZeroCount >= 2 && (
        <section className="asset-report-trend">
          <div className="asset-report-section-heading">
            <h2>{tt('analysis.monthTrend', '12 个月走势')}</h2>
            <button type="button" onClick={openMonthlyAssetTrend} className="asset-report-text-link">
              {tt('analysis.monthlyDetails', '月度明细')}
              <ChevronRight size={14} strokeWidth={1.8} />
            </button>
          </div>

          <div ref={overviewChartInteractionRef} className="asset-report-chart-explorer">
            {overviewChartReading && (
            <div
              className="asset-report-chart-reading"
              data-asset-chart-month={selectedChartMonth}
              data-side={chartSelectedMonthIdx < last12Months.length / 2 ? 'right' : 'left'}
            >
              <div className="asset-report-chart-month">{selectedChartMonth}</div>
              <div className="asset-report-chart-amount" style={{ fontFamily: ASSET_NUMBER_FONT }}>
                <span>{selectedChartMoney.main}</span><span className="asset-report-decimal">{selectedChartMoney.decimal}</span>
              </div>
              <div className="asset-report-chart-change" style={{ fontFamily: ASSET_NUMBER_FONT }}>
                <span className="asset-report-label">{tt('analysis.vsLastMonth', '较上月')}</span>
                {Number.isFinite(selectedChartChange) ? (
                  <span className="asset-report-chart-change-values" style={{ color: marketHexColor(selectedChartChange, marketColorMode) }}>
                    <span className="asset-report-chart-change-amount">
                      <span>{selectedChartChange >= 0 ? '+' : '-'}{selectedChartChangeMoney.main}</span><span className="asset-report-chart-change-decimal">{selectedChartChangeMoney.decimal}</span>
                    </span>
                    <span className="asset-report-chart-change-percent">{Number.isFinite(selectedChartChangePct) ? fmtSignedPct(selectedChartChangePct) : '--'}</span>
                  </span>
                ) : (
                  <span className="asset-report-label">--</span>
                )}
              </div>
            </div>
            )}

            <div className="asset-report-chart">
              <div className="aspect-[370/206] w-full select-none touch-pan-y">
                <MonthlyAssetTrendChart
                  language={language}
                  months={last12Months}
                  model={overviewChartModel}
                  scale={overviewChartScale}
                  selectedIndex={chartSelectedMonthIdx}
                  latestPointIndex={overviewChartLatestIndex}
                  maxPointIndex={overviewChartModel.maxPoint?.index ?? null}
                  connectGaps
                  showSelectedLabel={false}
                  highlightSelectedMonth
                  animate
                  latestPointDelayMs={780}
                  onPointerDown={handleOverviewPointerDown}
                  onPointerMove={handleOverviewPointerMove}
                  onPointerUp={finishOverviewPointerTracking}
                  onPointerCancel={finishOverviewPointerTracking}
                  onLostPointerCapture={finishOverviewPointerTracking}
                  ariaLabel={tt('analysis.assetTrendChartRange', '{{start}} 至 {{end}}资产走势', {
                    start: last12Months[0] || '--',
                    end: last12Months.at(-1) || '--',
                  })}
                />
              </div>
            </div>
          </div>

          <div className="asset-report-range">
            {[
              [tt('analysis.low', '最低'), chartMin],
              [tt('analysis.high', '最高'), chartMax],
              [tt('analysis.range', '区间'), chartRange],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="asset-report-label">{label}</span>
                <span className="asset-report-range-value">¥{fmtWan(value)}万</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="asset-report-accounts">
        <div className="asset-report-section-heading">
          <h2>{tt('analysis.accountsTitle', '资产账户')}</h2>
        </div>
        <div className="asset-report-actions">
          <button
            type="button"
            onClick={() => {
              setAssetMessage(null);
              setFillMonth(localMonthKey());
              setShowFillSnapshot(true);
            }}
            disabled={accounts.length === 0}
          >
            <CalendarDays size={15} strokeWidth={1.8} />
            <span>{tt('analysis.addMonthlyBalance', '填月度余额')}</span>
          </button>
          <button type="button" onClick={openAddAccount}>
            <Plus size={16} strokeWidth={1.8} />
            <span>{tt('analysis.addAccount', '新增账户')}</span>
          </button>
        </div>

        {accounts.length === 0 && (
          <div className="asset-report-empty">
            <PiggyBank size={28} strokeWidth={1.5} />
            <div>{tt('analysis.noAccounts', '还没有账户')}</div>
            <p>{tt('analysis.noAccountsDesc', '添加你和家人的账户,记录每月余额')}</p>
            <button type="button" onClick={openAddAccount}>
              {tt('analysis.addFirstAccount', '添加第一个账户')}
            </button>
          </div>
        )}

        {ownerGroups.map(({ owner, accounts: ownerAccs, total, pct }) => {
          const visibleOwnerAccs = currentVisibleAccounts(ownerAccs);
          if (visibleOwnerAccs.length === 0) return null;
          return (
            <section key={owner} className="asset-report-owner">
              <div className="asset-report-owner-header">
                <h3>{ownerGroupLabel(owner)}</h3>
                <div className="asset-report-owner-total" style={{ fontFamily: ASSET_NUMBER_FONT }}>¥{fmt(total, 2)}</div>
                <div className="asset-report-owner-summary">
                  {tt('analysis.accountsSummary', '{{count}} 个账户 · 占总资产 {{pct}}%', { count: visibleOwnerAccs.length, pct: pct.toFixed(0) })}
                </div>
              </div>

              <div className="asset-report-account-list">
                {visibleOwnerAccs.map(acc => {
                  const bal = getBalance(acc.id, currentMonth);
                  const balCNY = toCNY(bal, acc.currency);
                  const displayName = accountNameLabel(acc.name);
                  return (
                    <div key={acc.id} className="asset-report-account">
                      <button
                        type="button"
                        onClick={() => {
                          setAssetMessage(null);
                          setAccountTrendId(acc.id);
                        }}
                        className="asset-report-account-identity"
                        aria-label={tt('analysis.viewAccountTrend', '查看{{name}}资产走势', { name: displayName })}
                        data-open-account-trend={acc.id}
                      >
                        <span className="asset-report-account-icon">
                          <AccountTypeIcon type={acc.type} className="h-[18px] w-[18px]" />
                        </span>
                        <span className="asset-report-account-description">
                          <span className="asset-report-account-name">{displayName}</span>
                          <span className="asset-report-account-type">{accountTypeLabel(acc.type)}{acc.currency !== 'CNY' ? ` · ${acc.currency}` : ''}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetMessage(null);
                          setAccountActionId(acc.id);
                        }}
                        className="asset-report-account-balance"
                        aria-label={tt('analysis.openAccountActionsFor', '打开{{name}}修改和删除', { name: displayName })}
                        data-open-account-actions={acc.id}
                      >
                        <span>
                          <span className="asset-report-account-amount" style={{ fontFamily: ASSET_NUMBER_FONT }}>
                            {currencyPrefix(acc.currency)}{fmt(bal, 2)}
                          </span>
                          {acc.currency !== 'CNY' && (
                            <span className="asset-report-account-equivalent" style={{ fontFamily: ASSET_NUMBER_FONT }}>≈¥{fmt(balCNY, 2)}</span>
                          )}
                        </span>
                        <ChevronRight size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </section>

      {showAddAccount && (
        <StockReportModal
          title={tt('analysis.addAccount', '新增账户')}
          closeLabel={tt('analysis.closeAddAccount', '关闭新增账户')}
          onClose={closeAddAccount}
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          panelClassName="asset-dialog"
          actions={[
            { key: 'save', label: tt('analysis.add', '添加'), onClick: saveNewAccount, className: 'asset-dialog-primary' },
          ]}
        >
            <div className="min-w-0">
              <div className="asset-dialog-form">
                <div>
                  <label className="asset-dialog-label">{tt('analysis.owner', '拥有人')}</label>
                  <div className="asset-dialog-segments">
                    {['我', '老婆'].map(owner => (
                      <button
                        key={owner}
                        onClick={() => setNewAccount({ ...newAccount, owner })}
                        type="button"
                        aria-pressed={newAccount.owner === owner}
                      >
                        {ownerLabel(owner)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="asset-dialog-label">{tt('analysis.type', '类型')}</label>
                  <div className="asset-dialog-types">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, Icon }) => {
                      const active = newAccount.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setNewAccount({ ...newAccount, type, icon: type })}
                          type="button"
                          aria-pressed={active}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                          <span>{accountTypeLabel(type)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="asset-dialog-label">{tt('analysis.accountName', '账户名')}</label>
                  <div className="asset-dialog-presets">
                    {(ACCOUNT_PRESETS[newAccount.type] || []).map(name => (
                      <button
                        key={name}
                        onClick={() => setNewAccount({ ...newAccount, name })}
                        type="button"
                        aria-pressed={newAccount.name === name}
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
                  <label className="asset-dialog-label">{tt('analysis.currency', '币种')}</label>
                  <div className="asset-dialog-segments">
                    {['CNY', 'USD', 'HKD'].map(currency => (
                      <button
                        key={currency}
                        onClick={() => setNewAccount({ ...newAccount, currency })}
                        type="button"
                        aria-pressed={newAccount.currency === currency}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="asset-dialog-label">{tt('analysis.currentBalanceOptional', '当前余额 (可稍后填)')}</label>
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
                  <div role="alert" className="asset-dialog-error">
                    {assetMessage.text}
                  </div>
                )}
              </div>

            </div>
        </StockReportModal>
      )}

      {selectedTrendAccount && selectedAccountTrend && (
        <AccountAssetTrendModal
          account={selectedTrendAccount}
          accountName={accountNameLabel(selectedTrendAccount.name)}
          accountType={accountTypeLabel(selectedTrendAccount.type)}
          language={language}
          marketColorMode={marketColorMode}
          trend={selectedAccountTrend}
          onClose={closeAccountTrend}
        />
      )}

      {selectedActionAccount && (
        <StockReportModal
          title={tt('analysis.accountActions', '账户操作')}
          closeLabel={tt('analysis.closeAccountActions', '关闭账户操作')}
          onClose={closeAccountAction}
          panelClassName="asset-dialog asset-account-dialog"
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
          <div className="asset-dialog-identity">
            <AccountLogo account={selectedActionAccount} />
            <div>
              <div className="asset-dialog-account-name">{accountNameLabel(selectedActionAccount.name)}</div>
              <div className="asset-dialog-account-meta">
                {ownerLabel(selectedActionAccount.owner)} · {accountTypeLabel(selectedActionAccount.type)} · {selectedActionAccount.currency || 'CNY'}
              </div>
            </div>
          </div>
          <div className="asset-dialog-account-value">
            <div className="asset-dialog-label">{tt('analysis.currentMonthBalance', '本月余额')}</div>
            <div className="asset-dialog-account-amount" style={{ fontFamily: ASSET_NUMBER_FONT }}>{accountBalanceText(selectedActionAccount)}</div>
            {accountApproxText(selectedActionAccount) && (
              <div className="asset-dialog-account-meta" style={{ fontFamily: ASSET_NUMBER_FONT }}>{accountApproxText(selectedActionAccount)}</div>
            )}
          </div>
        </StockReportModal>
      )}

      {editingAccount && accountEditDraft && (
        <StockReportModal
          title={tt('analysis.editAccount', '修改账户')}
          closeLabel={tt('analysis.closeEditAccount', '关闭修改账户')}
          onClose={closeAccountEdit}
          panelClassName="asset-dialog"
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          actions={[
            { key: 'save', label: tt('analysis.saveChanges', '保存修改'), onClick: saveAccountEdit, className: 'asset-dialog-primary' },
          ]}
        >
            <div className="min-w-0">
              <div className="asset-dialog-form">
                <div>
                  <label className="asset-dialog-label">{tt('analysis.owner', '拥有人')}</label>
                  <div className="asset-dialog-segments">
                    {['我', '老婆'].map(owner => (
                      <button
                        key={owner}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, owner })}
                        type="button"
                        aria-pressed={accountEditDraft.owner === owner}
                      >
                        {ownerLabel(owner)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="asset-dialog-label">{tt('analysis.type', '类型')}</label>
                  <div className="asset-dialog-types">
                    {ACCOUNT_TYPE_OPTIONS.map(({ type, Icon }) => {
                      const active = accountEditDraft.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setAccountEditDraft({ ...accountEditDraft, type, icon: type })}
                          type="button"
                          aria-pressed={active}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                          <span>{accountTypeLabel(type)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="asset-dialog-label">{tt('analysis.accountName', '账户名')}</label>
                  <div className="asset-dialog-presets">
                    {(ACCOUNT_PRESETS[accountEditDraft.type] || []).map(name => (
                      <button
                        key={name}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, name })}
                        type="button"
                        aria-pressed={accountEditDraft.name === name}
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
                  <label className="asset-dialog-label">{tt('analysis.currency', '币种')}</label>
                  <div className="asset-dialog-segments">
                    {['CNY', 'USD', 'HKD'].map(currency => (
                      <button
                        key={currency}
                        onClick={() => setAccountEditDraft({ ...accountEditDraft, currency })}
                        type="button"
                        aria-pressed={accountEditDraft.currency === currency}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="asset-dialog-label">{tt('analysis.currentMonthBalance', '本月余额')}</label>
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
                  <div className="asset-dialog-hint">
                    {tt('analysis.zeroDeletesSnapshot', '填 0 或清空后保存，将删除该月记录')}
                  </div>
                </div>

                {assetMessage && (
                  <div role="alert" className="asset-dialog-error">
                    {assetMessage.text}
                  </div>
                )}
              </div>

            </div>
        </StockReportModal>
      )}

      </div>
      )}

      {showFillSnapshot && (
        <StockReportModal
          title={tt('analysis.addMonthlyBalance', '填月度余额')}
          closeLabel={tt('analysis.closeMonthlyBalance', '关闭填月度余额')}
          onClose={closeFillSnapshot}
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          panelClassName="asset-dialog"
          actions={[
            { key: 'save', label: tt('analysis.saveMonth', '保存 {{month}}', { month: fillMonth }), onClick: saveFillSnapshot, className: 'asset-dialog-primary' },
          ]}
        >
            <div className="min-w-0">
              <div className="asset-dialog-month">
                <div className="asset-dialog-label">{tt('analysis.selectMonth', '选择月份')}</div>
                <div className="asset-dialog-month-picker">
                  <button
                    onClick={() => {
                      setFillMonth(shiftMonth(fillMonth, -1));
                      setSnapshotDraft({});
                    }}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="asset-dialog-month-value" style={{ fontFamily: ASSET_NUMBER_FONT }}>{fillMonth}</div>
                    {fillMonth === currentMonth && <div className="asset-dialog-month-status">{tt('analysis.thisMonth', '本月')}</div>}
                    {fillMonth > currentMonth && <div className="asset-dialog-month-status">{tt('analysis.futureMonth', '未来月')}</div>}
                    {fillMonth < currentMonth && <div className="asset-dialog-month-status">{tt('analysis.historyMonth', '历史月')}</div>}
                  </div>
                  <button
                    onClick={() => {
                      setFillMonth(shiftMonth(fillMonth, 1));
                      setSnapshotDraft({});
                    }}
                    type="button"
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
                      <div className="asset-dialog-segments">
                        {[
                          { owner: '我', accs: myAccs },
                          { owner: '老婆', accs: wifeAccs },
                        ].map(({ owner, accs }) => {
                          const active = snapshotTab === owner;
                          return (
                            <button
                              key={owner}
                              onClick={() => setSnapshotTab(owner)}
                              type="button"
                              aria-pressed={active}
                            >
                              <span>{ownerLabel(owner)}</span>
                              <span className="asset-dialog-count">{accs.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {hasMulti && (
                      <div className="asset-dialog-month-summary">
                        <span>{tt('analysis.monthlyOwnerSummary', '{{owner}} · {{count}} 个账户', { owner: ownerLabel(snapshotTab), count: currentAccs.length })}</span>
                        <span className="text-white/[0.95] tabular-nums" style={{ fontFamily: ASSET_NUMBER_FONT }}>≈ ¥{fmt(curSum, 2)}</span>
                      </div>
                    )}

                    <div className="asset-dialog-balance-list">
                      {currentAccs.map(acc => {
                        const currentBal = getSnapshotBalance(acc.id, fillMonth);
                        const draftVal = snapshotDraft[acc.id] ?? (Number(currentBal) > 0 ? currentBal : '');
                        return (
                          <div key={acc.id} className="asset-dialog-balance-row">
                            <div className="asset-dialog-balance-icon">
                              <AccountTypeIcon type={acc.type} className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="asset-dialog-balance-name">{accountNameLabel(acc.name)}</div>
                              <div className="asset-dialog-month-status">{acc.currency}</div>
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
                              aria-label={`${accountNameLabel(acc.name)} · ${acc.currency}`}
                              className="asset-dialog-input asset-dialog-balance-input"
                              style={{ colorScheme: 'dark', fontFamily: ASSET_NUMBER_FONT }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="asset-dialog-hint">
                      {tt('analysis.zeroDeletesSnapshot', '填 0 或清空后保存，将删除该月记录')}
                    </div>
                  </div>
                );
              })()}

              {assetMessage && (
                <div role="alert" className="asset-dialog-error">
                  {assetMessage.text}
                </div>
              )}

            </div>
        </StockReportModal>
      )}
    </>
  );
}

export default React.memo(AnalysisTab);
