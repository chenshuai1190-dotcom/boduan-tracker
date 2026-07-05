import React, { lazy, Suspense } from 'react';
import { Home, ListChecks, Settings, Target, Wallet } from 'lucide-react';

const AnalysisTab = lazy(() => import('./tabs/AnalysisTab.jsx'));

const USD_RATE = 6.77;
const HKD_RATE = 0.86;

function localMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function shiftMonth(monthKey, offset) {
  const d = new Date(`${monthKey}-15`);
  d.setMonth(d.getMonth() + offset);
  return localMonthKey(d);
}

const baseAccounts = [
  { id: 'dev_me_bank_cny', owner: '我', type: '银行', name: '招商银行', currency: 'CNY', icon: '银行', sortOrder: 0, balance: 80000 },
  { id: 'dev_me_bank_hkd', owner: '我', type: '银行', name: '招商永隆', currency: 'HKD', icon: '银行', sortOrder: 1, balance: 260436 },
  { id: 'dev_me_longbridge', owner: '我', type: '证券', name: '长桥证券', currency: 'USD', icon: '证券', sortOrder: 2, balance: 1356 },
  { id: 'dev_me_ibkr', owner: '我', type: '证券', name: 'IBKR', currency: 'USD', icon: '证券', sortOrder: 3, balance: 600100 },
  { id: 'dev_me_alipay', owner: '我', type: '支付宝', name: '支付宝现金', currency: 'CNY', icon: '支付宝', sortOrder: 4, balance: 45000 },
  { id: 'dev_wife_eastmoney', owner: '老婆', type: '证券', name: '东方财富', currency: 'CNY', icon: '证券', sortOrder: 0, balance: 131000 },
  { id: 'dev_wife_ibkr', owner: '老婆', type: '证券', name: 'IBKR', currency: 'USD', icon: '证券', sortOrder: 1, balance: 2472240 },
  { id: 'dev_wife_alipay', owner: '老婆', type: '支付宝', name: '支付宝理财', currency: 'CNY', icon: '支付宝', sortOrder: 2, balance: 0 },
  { id: 'dev_wife_hkd', owner: '老婆', type: '银行', name: '招商永隆', currency: 'HKD', icon: '银行', sortOrder: 3, balance: 1782801 },
  { id: 'dev_wife_wechat', owner: '老婆', type: '微信', name: '微信理财', currency: 'CNY', icon: '微信', sortOrder: 4, balance: 3900000 },
  { id: 'dev_wife_fund', owner: '老婆', type: '公积金', name: '公积金', currency: 'CNY', icon: '公积金', sortOrder: 5, balance: 380000 },
];

function makeSnapshots(accounts) {
  const currentMonth = localMonthKey();
  const monthFactors = [0.34, 0.40, 0.47, 0.45, 0.52, 0.53, 0.59, 0.66, 0.70, 0.96, 0.94, 1.04, 1];
  const months = monthFactors.map((_, idx) => shiftMonth(currentMonth, idx - 12));

  return months.flatMap((month, idx) =>
    accounts.map(acc => ({
      id: `dev_snapshot_${acc.id}_${month}`,
      accountId: acc.id,
      month,
      balance: Math.round(Number(acc.balance || 0) * monthFactors[idx] * 100) / 100,
    }))
  );
}

export default function DevVisualPreview() {
  const [accounts, setAccounts] = React.useState(() => baseAccounts);
  const [snapshots, setSnapshots] = React.useState(() => makeSnapshots(baseAccounts));
  const [showAddAccount, setShowAddAccount] = React.useState(false);
  const [showFillSnapshot, setShowFillSnapshot] = React.useState(false);
  const [showMonthsDetail, setShowMonthsDetail] = React.useState(false);
  const [accountDeleteConfirmId, setAccountDeleteConfirmId] = React.useState(null);
  const [chartSelectedMonthIdx, setChartSelectedMonthIdx] = React.useState(null);
  const [fillMonth, setFillMonth] = React.useState(() => localMonthKey());
  const [snapshotDraft, setSnapshotDraft] = React.useState({});
  const [snapshotTab, setSnapshotTab] = React.useState('我');
  const [newAccount, setNewAccount] = React.useState({
    owner: '我',
    type: '',
    name: '',
    currency: 'CNY',
    icon: '',
    balance: '',
  });

  const db = React.useMemo(() => ({
    insertAccount: async (account) => ({
      ...account,
      id: `dev_account_${Date.now()}`,
    }),
    updateAccount: async (id, account) => ({
      ...account,
      id,
    }),
    upsertSnapshot: async () => ({}),
    deleteAccount: async () => ({}),
  }), []);

  const fmt = React.useCallback((n, digits = 2) => {
    const value = Number(n);
    if (!Number.isFinite(value)) return '--';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }, []);

  const ctx = {
    accountDeleteConfirmId,
    accounts,
    chartSelectedMonthIdx,
    db,
    fillMonth,
    fmt,
    hkdRate: HKD_RATE,
    newAccount,
    setAccountDeleteConfirmId,
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
    showFillSnapshot,
    showMonthsDetail,
    snapshotDraft,
    snapshots,
    snapshotTab,
    usdRate: USD_RATE,
  };

  const nav = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'trades', label: '交易', icon: ListChecks },
    { id: 'analysis', label: '资产', icon: Wallet },
    { id: 'review', label: '目标', icon: Target },
    { id: 'settings', label: '设置', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#05070b] px-4 pb-24 text-white" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
      <Suspense fallback={<div className="py-12 text-center text-sm text-white/45">加载资产预览...</div>}>
        <AnalysisTab ctx={ctx} />
      </Suspense>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#070a0f] shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-5">
            {nav.map(tab => {
              const Icon = tab.icon;
              const isActive = tab.id === 'analysis';
              return (
                <button
                  key={tab.id}
                  className={`flex flex-col items-center justify-center py-2 transition ${isActive ? 'text-[#f6a524]' : 'text-white/40'}`}
                  type="button"
                >
                  <Icon className={`mb-0.5 h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
