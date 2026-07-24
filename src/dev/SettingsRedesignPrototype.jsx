import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe2,
  Home,
  Languages,
  ListChecks,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Target,
  Ticket,
  Wallet,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import { COMMUNITY_AVATAR_OPTIONS } from '../lib/communityProfile.js';

const SETTINGS_ROWS = [
  {
    id: 'language',
    icon: Languages,
    label: '语言设置',
    value: '简体中文',
    valueClass: 'text-[#f4b44f]',
  },
  {
    id: 'display',
    icon: Monitor,
    label: '显示设置',
    value: '红涨绿跌',
    valueClass: 'text-white/45',
  },
  {
    id: 'account',
    icon: ShieldCheck,
    label: '账户设置',
    badge: '已登录',
  },
  {
    id: 'invite',
    icon: Ticket,
    label: '邀请码管理',
    badge: '管理员',
    badgeClass: 'border-[#f2a83a]/20 bg-[#f2a83a]/10 text-[#f2b65d]',
  },
];

const NAV_ITEMS = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'trades', label: '交易', icon: ListChecks },
  { id: 'analysis', label: '资产', icon: Wallet },
  { id: 'target', label: '目标', icon: Target },
  { id: 'settings', label: '设置', icon: Settings },
];

const INVITE_CODES = [
  { code: 'QTE-D6N4-8UHL', state: '可用' },
  { code: 'QTE-MK33-ANNA', state: '已使用' },
];

function communityAvatarImageClass() {
  return 'scale-[1.15]';
}

function DetailShell({ children }) {
  return (
    <div className="mx-5 border-t border-white/[0.06] pb-5 pt-4">
      {children}
    </div>
  );
}

function SettingsRow({ row, expanded, onToggle }) {
  const Icon = row.icon;
  return (
    <button
      className="flex min-h-[73px] w-full min-w-0 items-center gap-3.5 px-5 text-left outline-none transition active:bg-white/[0.025] focus-visible:bg-white/[0.025]"
      data-settings-row={row.id}
      onClick={onToggle}
      type="button"
    >
      <Icon className="h-[20px] w-[20px] shrink-0 stroke-[1.8] text-white/55" />
      <span className="min-w-0 flex-1 text-[15px] font-medium tracking-[0.01em] text-white/[0.88]">
        {row.label}
      </span>
      {row.value && (
        <span className={`max-w-[105px] truncate text-[13px] ${row.valueClass || 'text-white/45'}`}>
          {row.value}
        </span>
      )}
      {row.badge && (
        <span className={`rounded-full border border-[#2cce91]/20 bg-[#2cce91]/10 px-2 py-1 text-[10px] font-medium text-[#49daa7] ${row.badgeClass || ''}`}>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-[1px]" />
          {row.badge}
        </span>
      )}
      {expanded
        ? <ChevronDown className="h-4 w-4 shrink-0 text-white/36" />
        : <ChevronRight className="h-4 w-4 shrink-0 text-white/36" />}
    </button>
  );
}

function LanguagePanel() {
  return (
    <DetailShell>
      <p className="mb-3 text-[11px] leading-5 text-white/35">选择界面显示语言，不会修改账户数据。</p>
      <div className="grid grid-cols-2 gap-2.5">
        <button className="flex min-h-[46px] items-center justify-between rounded-xl border border-[#f2a83a]/40 bg-[#f2a83a]/[0.07] px-3.5 text-[13px] text-[#f5ba62]" type="button">
          简体中文 <Check className="h-4 w-4" />
        </button>
        <button className="min-h-[46px] rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 text-left text-[13px] text-white/50" type="button">
          English
        </button>
      </div>
    </DetailShell>
  );
}

function DisplayPanel() {
  const [mode, setMode] = useState('red-up');
  const options = [
    { id: 'red-up', label: '红涨绿跌', up: '#ff4b1f', down: '#2bd39a' },
    { id: 'green-up', label: '绿涨红跌', up: '#2bd39a', down: '#ff4b1f' },
  ];
  return (
    <DetailShell>
      <p className="mb-3 text-[11px] leading-5 text-white/35">统一首页、交易和详情页的市场涨跌颜色。</p>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.id}
            className={`flex min-h-[48px] w-full items-center rounded-xl border px-3.5 text-[13px] ${mode === option.id ? 'border-[#f2a83a]/35 bg-[#f2a83a]/[0.06] text-white/80' : 'border-white/[0.07] bg-white/[0.02] text-white/48'}`}
            onClick={() => setMode(option.id)}
            type="button"
          >
            <span className="mr-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.up }} />
            <span className="flex-1 text-left">{option.label}</span>
            <span className="mr-2 text-[11px]" style={{ color: option.up }}>+8.8%</span>
            <span className="text-[11px]" style={{ color: option.down }}>-3.2%</span>
            {mode === option.id && <Check className="ml-3 h-4 w-4 text-[#f2b65d]" />}
          </button>
        ))}
      </div>
    </DetailShell>
  );
}

function AccountPanel() {
  return (
    <DetailShell>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-white/75">chenshuai1190@gmail.com</p>
          <p className="mt-1 text-[10px] text-white/30">当前账户 · 登录状态正常</p>
        </div>
        <button className="shrink-0 rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[11px] text-white/55" type="button">
          修改密码
        </button>
      </div>
    </DetailShell>
  );
}

function CommunityProfileModal({ avatarKey, nickname, onClose, setAvatarKey, setNickname }) {
  return (
    <ActionModalCard
      title="社区资料"
      closeLabel="关闭社区资料"
      onClose={onClose}
      actions={[
        { key: 'cancel', label: '取消', onClick: onClose },
        { key: 'save', label: '保存', onClick: onClose },
      ]}
    >
      <label className="block text-[11px] text-white/38" htmlFor="settings-prototype-nickname">社区昵称</label>
      <input
        className="mt-2 h-12 w-full min-w-0 rounded-xl border border-white/[0.09] bg-[#080b11] px-3.5 text-[14px] font-normal text-white/85 outline-none placeholder:text-white/20 focus:border-[#f2a83a]/35"
        id="settings-prototype-nickname"
        maxLength={16}
        onChange={(event) => setNickname(event.target.value)}
        value={nickname}
      />
      <p className="mt-2 text-[10px] leading-4 text-white/30">2-16 个字符，用于排行榜公开展示</p>
      <p className="mb-2.5 mt-4 text-[11px] text-white/38">默认头像</p>
      <div className="grid grid-cols-6 gap-2">
        {COMMUNITY_AVATAR_OPTIONS.map((avatar) => {
          const selected = avatar.key === avatarKey;
          return (
            <button
              key={avatar.key}
              aria-label={avatar.labelZh}
              className={`relative aspect-square min-w-0 overflow-hidden rounded-full border bg-[#070a0f] transition ${selected ? 'border-[#f6b54b] shadow-[0_0_12px_rgba(246,181,75,0.22)]' : 'border-transparent opacity-65'}`}
              onClick={() => setAvatarKey(avatar.key)}
              type="button"
            >
              <img alt="" className={`h-full w-full object-cover ${communityAvatarImageClass(avatar.key)}`} src={avatar.src} />
              {selected && <span className="absolute inset-x-[32%] bottom-0 h-0.5 rounded-full bg-[#f6b54b]" />}
            </button>
          );
        })}
      </div>
    </ActionModalCard>
  );
}

function InvitePanel() {
  return (
    <DetailShell>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] text-white/70">管理员专属</p>
          <p className="mt-1 text-[10px] text-white/30">生成并管理新用户邀请码</p>
        </div>
        <button className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#f2a83a]/25 px-3 text-[11px] text-[#f2b65d]" type="button">
          <Plus className="h-3.5 w-3.5" /> 生成
        </button>
      </div>
      <div className="space-y-2">
        {INVITE_CODES.map((item) => (
          <div key={item.code} className="flex min-w-0 items-center rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] tracking-[0.08em] text-white/70">{item.code}</span>
            <span className={`mr-2 rounded-full px-2 py-1 text-[10px] ${item.state === '可用' ? 'bg-[#2cce91]/10 text-[#49daa7]' : 'bg-white/[0.05] text-white/30'}`}>{item.state}</span>
            <Copy className="h-3.5 w-3.5 text-white/30" />
          </div>
        ))}
      </div>
    </DetailShell>
  );
}

function ExpandedPanel({ id }) {
  if (id === 'language') return <LanguagePanel />;
  if (id === 'display') return <DisplayPanel />;
  if (id === 'account') return <AccountPanel />;
  if (id === 'invite') return <InvitePanel />;
  return null;
}

export default function SettingsRedesignPrototype() {
  const [expanded, setExpanded] = useState('');
  const [avatarKey, setAvatarKey] = useState('blue');
  const [nickname, setNickname] = useState('团团');
  const [showCommunityProfile, setShowCommunityProfile] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const avatar = useMemo(
    () => COMMUNITY_AVATAR_OPTIONS.find((item) => item.key === avatarKey) || COMMUNITY_AVATAR_OPTIONS[1],
    [avatarKey],
  );

  const toggle = (id) => setExpanded((current) => current === id ? '' : id);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#05070b] pb-[calc(78px+env(safe-area-inset-bottom))] text-white" data-settings-redesign-prototype="phase-1">
      <main className="mx-auto w-full max-w-[430px] px-4 pb-8 pt-[calc(26px+env(safe-area-inset-top))]">
        <button
          className="mt-1 flex min-h-[176px] w-full flex-col items-center justify-center rounded-[22px] border border-white/[0.09] bg-[radial-gradient(circle_at_50%_35%,rgba(33,65,122,0.13),transparent_45%),linear-gradient(145deg,#0d1118,#0a0d13)] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
          onClick={() => setShowCommunityProfile(true)}
          type="button"
        >
          <span className="relative h-[95px] w-[95px] rounded-full border border-white/[0.18] bg-[#080c12] shadow-[0_0_0_3px_rgba(255,255,255,0.025),0_0_24px_rgba(36,90,202,0.18)]">
            <span className="absolute inset-px overflow-hidden rounded-full bg-[#070a0f]">
              <img alt="社区头像" className={`h-full w-full object-cover ${communityAvatarImageClass(avatar.key)}`} src={avatar.src} />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-[21px] w-[21px] items-center justify-center rounded-full border border-white/[0.12] bg-[#11161f] text-[#f2b65d] shadow-[0_4px_10px_rgba(0,0,0,0.45)]">
              <Pencil className="h-2.5 w-2.5" strokeWidth={1.8} />
            </span>
          </span>
          <span className="mt-3 text-[16px] font-medium tracking-[0.02em] text-white/[0.92]">{nickname}</span>
        </button>

        <section className="mt-5 overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#0c1016] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          {SETTINGS_ROWS.map((row, index) => (
            <React.Fragment key={row.id}>
              {index > 0 && <div className="mx-5 h-px bg-white/[0.065]" />}
              <SettingsRow expanded={expanded === row.id} onToggle={() => toggle(row.id)} row={row} />
              {expanded === row.id && <ExpandedPanel id={row.id} />}
            </React.Fragment>
          ))}

          <div className="mx-5 h-px bg-white/[0.065]" />
          <div className="grid grid-cols-2 gap-3 px-4 py-4">
            <button className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-white/[0.09] bg-white/[0.025] text-[13px] text-white/65 active:bg-white/[0.05]" type="button">
              <RefreshCw className="h-4 w-4" /> 切换账户
            </button>
            <button className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-[#e04d5e]/20 bg-[#8f1f2c]/20 text-[13px] text-[#f08391] active:bg-[#8f1f2c]/28" type="button">
              <LogOut className="h-4 w-4" /> 退出登录
            </button>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[20px] border border-white/[0.075] bg-[#0b0f15]">
          <button className="flex min-h-[62px] w-full items-center gap-3 px-5 text-left" onClick={() => setShowLog((value) => !value)} type="button">
            <Globe2 className="h-[18px] w-[18px] text-white/42" />
            <span className="flex-1 text-[13px] text-white/68">更新日志</span>
            <span className="text-[10px] text-white/28">v10.7.9.322</span>
            {showLog ? <ChevronDown className="h-4 w-4 text-white/30" /> : <ChevronRight className="h-4 w-4 text-white/30" />}
          </button>
          {showLog && (
            <div className="border-t border-white/[0.06] px-5 py-4 text-[11px] leading-5 text-white/38">
              <p className="text-white/58">资产人物卡配色统一</p>
              <p className="mt-1.5">我和老婆的资产金额及进度统一系统红，小账户图标恢复默认色。</p>
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-[10px] tracking-[0.06em] text-white/18">HTML 视觉原型 · 不连接真实账户</p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.09] bg-[#070a0f]/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid h-[64px] max-w-[430px] grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === 'settings';
            return (
              <button key={item.id} className={`flex flex-col items-center justify-center gap-1 ${active ? 'text-[#f4ad3f]' : 'text-white/38'}`} type="button">
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showCommunityProfile && (
        <CommunityProfileModal
          avatarKey={avatarKey}
          nickname={nickname}
          onClose={() => setShowCommunityProfile(false)}
          setAvatarKey={setAvatarKey}
          setNickname={setNickname}
        />
      )}
    </div>
  );
}
