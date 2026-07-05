import React, { lazy, Suspense } from 'react';
import { BookOpen, Calendar, ChevronDown, ChevronUp, Edit2, Home, ListChecks, Pin, Settings, Target, Trash2, Wallet, X } from 'lucide-react';

const AnalysisTab = lazy(() => import('./tabs/AnalysisTab.jsx'));
const ReviewTab = lazy(() => import('./tabs/ReviewTab.jsx'));

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

const mockDisciplines = [
  { id: 'dev_rule_1', level: '🔺', text: 'VIX 法则:\n当 VIX 达到 30 时买入股票\n当 VIX 达到 50 时加倍买入股票', date: '2026-06-05', pinned: true },
  { id: 'dev_rule_2', level: '🔺', text: '只减融资, 不丢主线;只买错杀, 不追杂音。', date: '2026-04-25', pinned: false },
  { id: 'dev_rule_3', level: '🔺', text: 'TSM: 不卖\nNVDA: 高位减融资, 错杀买回\nMSFT: 底仓长期持有, 目标位释放部分现金\nMETA: 高弹性仓, 高位分批兑现', date: '2026-04-25', pinned: false },
  { id: 'dev_rule_4', level: '📣', text: '不是跌 3%、5% 就急着买回。要等恐慌有足够赔率。', date: '2026-04-25', pinned: false },
  { id: 'dev_rule_5', level: '📣', text: '相信凡事发生, 皆有利于我。', date: '2026-04-22', pinned: false },
  { id: 'dev_rule_6', level: '❗', text: '永远不做空美股! 逢低买入!', date: '2026-04-22', pinned: false },
  { id: 'dev_rule_7', level: '🟢', text: '每次交易前先写理由, 交易后复盘结果。', date: '2026-04-20', pinned: false },
  { id: 'dev_rule_8', level: '🟢', text: '涨的时候管住手, 跌的时候管住心。', date: '2026-04-18', pinned: false },
  { id: 'dev_rule_9', level: '🔺', text: '现金不是拖累, 是下一次进攻的选择权。', date: '2026-04-12', pinned: false },
  { id: 'dev_rule_10', level: '📣', text: '账户回撤超过预设阈值时, 先复盘杠杆和仓位, 再考虑加仓。', date: '2026-04-08', pinned: false },
];

const mockReviewLogs = [
  { id: 'dev_log_1', date: '2026-06-11', mood: '冷静', text: '承认普通人的投资组合长期来看是跑不赢指数 QQQ 的, 在目前所持仓的情况下, 只能靠股市迈 Beta 收益。所以核心策略是: 保住本金, 控制回撤, 慢慢积累。' },
  { id: 'dev_log_2', date: '2026-06-05', mood: '冷静', text: '周五 159941 建仓后, 纳斯达克大跌 4.80% 历史罕见, 也给下周创造了场内低吸的机会。接下来重点关注市场情绪能否修复。' },
  { id: 'dev_log_3', date: '2026-06-05', mood: '谨慎乐观', text: '159941 开始正式建仓, 让豆豆卖掉了支付宝的纳斯达克, 卖出理由是收益率更低, 资金效率不如场内 ETF。后续计划分批加仓, 拉低持仓成本。' },
  { id: 'dev_log_4', date: '2026-05-06', mood: '冷静', text: '一年三倍喜欢, 二年一倍若辱。在股市里的意思是: 短期暴富的人很多, 长期稳定盈利的人很少。要有耐心, 避免频繁交易和情绪化操作。' },
  { id: 'dev_log_5', date: '2026-04-30', mood: '满意', text: '今天 meta 大跌, 按照我以前性格融资早就干进去了, 现在我考虑的是更多的是风险控制和仓位管理。市场永远有机会, 活下来才有未来。' },
];

function DevModal({ title, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f16] p-4 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/55">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-8 text-center text-sm text-white/45">
          本地视觉预览弹窗
        </div>
      </div>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = React.useState(() => {
    if (typeof window === 'undefined') return 'analysis';
    return new URLSearchParams(window.location.search).get('tab') === 'review' ? 'review' : 'analysis';
  });
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
  const [investmentPlan, setInvestmentPlan] = React.useState({
    startCapital: 2400000,
    targetAnnualRate: 0.20,
    startYear: 2026,
    totalYears: 10,
    ageGoalAge: 46,
    motto: '我要变的很有钱! 有钱有钱有钱!',
    displayCurrency: 'USD',
  });
  const [disciplines, setDisciplines] = React.useState(() => mockDisciplines);
  const [reviewLogs, setReviewLogs] = React.useState(() => mockReviewLogs);
  const [yearlyActuals, setYearlyActuals] = React.useState(() => [
    { year: 2026, actualGain: 70000, endBalance: 2470000 },
  ]);
  const [showPlanSettings, setShowPlanSettings] = React.useState(false);
  const [showAddDiscipline, setShowAddDiscipline] = React.useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = React.useState(null);
  const [showAddLog, setShowAddLog] = React.useState(false);
  const [editingLogId, setEditingLogId] = React.useState(null);
  const [editYearlyActualId, setEditYearlyActualId] = React.useState(null);
  const [filterLevel, setFilterLevel] = React.useState('all');
  const [showAllDisciplines, setShowAllDisciplines] = React.useState(false);
  const [showAllLogs, setShowAllLogs] = React.useState(false);
  const [showAllYears, setShowAllYears] = React.useState(false);
  const [expandedDisciplines, setExpandedDisciplines] = React.useState({});
  const lastSubmitRef = React.useRef({});

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
    upsertInvestmentPlan: async () => ({}),
    upsertYearlyActual: async () => ({}),
    insertDiscipline: async (discipline) => ({ ...discipline, id: `dev_rule_${Date.now()}`, date: new Date().toISOString().slice(0, 10) }),
    updateDiscipline: async () => ({}),
    deleteDiscipline: async () => ({}),
    insertReviewLog: async (log) => ({ ...log, id: `dev_log_${Date.now()}` }),
    updateReviewLog: async () => ({}),
    deleteReviewLog: async () => ({}),
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

  const reviewCtx = {
    BookOpen,
    Calendar,
    ChevronDown,
    ChevronUp,
    db,
    DisciplineModal: (props) => <DevModal title={props.initial?.isEdit ? '编辑戒律' : '添加戒律'} onCancel={props.onCancel} />,
    disciplines,
    Edit2,
    editingDisciplineId,
    editingLogId,
    editYearlyActualId,
    expandedDisciplines,
    filterLevel,
    investmentPlan,
    lastSubmitRef,
    LogModal: (props) => <DevModal title={props.initial?.date ? '写复盘' : '复盘'} onCancel={props.onCancel} />,
    marketColorMode: 'redUpGreenDown',
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
    showConfirm: ({ onConfirm }) => { if (typeof onConfirm === 'function') onConfirm(); },
    showPlanSettings,
    Target,
    Pin,
    Trash2,
    usdRate: USD_RATE,
    X,
    YearlyActualModal: (props) => <DevModal title={`${props.year} 年实际数据`} onCancel={props.onCancel} />,
    yearlyActuals,
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
      <Suspense fallback={<div className="py-12 text-center text-sm text-white/45">加载本地预览...</div>}>
        {activeTab === 'review' ? <ReviewTab ctx={reviewCtx} /> : <AnalysisTab ctx={ctx} />}
      </Suspense>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#070a0f] shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-5">
            {nav.map(tab => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
