import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Globe2,
  Languages,
  Loader2,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import { clearCommunityCompetitionCache } from '../lib/communityCompetitionCache.js';
import {
  COMMUNITY_AVATAR_OPTIONS,
  getCommunityAvatarOption,
  validateCommunityNickname,
} from '../lib/communityProfile.js';
import { normalizeLanguage, t } from '../lib/i18n.js';
import { MARKET_COLOR_MODES, normalizeMarketColorMode } from '../lib/marketColorMode.js';

const SETTINGS_VERSION = 'v10.7.9.356';

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

function SettingsRow({ badge, badgeClass = '', expanded, icon: Icon, label, onClick, rowRef, value, valueClass = 'text-white/42' }) {
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      className="flex min-h-[73px] w-full min-w-0 items-center gap-3.5 px-5 text-left outline-none transition active:bg-white/[0.025] focus-visible:bg-white/[0.025]"
    >
      <Icon className="h-[20px] w-[20px] shrink-0 stroke-[1.8] text-white/55" />
      <span className="min-w-0 flex-1 text-[15px] font-medium tracking-[0.01em] text-white/[0.88]">{label}</span>
      {value && <span className={`max-w-[108px] truncate text-[12px] ${valueClass}`}>{value}</span>}
      {badge && (
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${badgeClass}`}>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-[1px]" />
          {badge}
        </span>
      )}
      {expanded
        ? <ChevronDown className="h-4 w-4 shrink-0 text-white/36" />
        : <ChevronRight className="h-4 w-4 shrink-0 text-white/36" />}
    </button>
  );
}

function StatusMessage({ message, className = '' }) {
  if (!message) return null;
  const tone = message.type === 'error'
    ? 'border-rose-400/25 bg-rose-400/10 text-rose-200'
    : message.type === 'info'
      ? 'border-[#f6a524]/25 bg-[#f6a524]/10 text-[#ffd18a]'
      : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  return <div className={`rounded-xl border px-3 py-2 text-[11px] leading-5 ${tone} ${className}`}>{message.text}</div>;
}

function SettingsTab({ ctx }) {
  const {
    accountManager,
    changelogExpanded,
    communityProfileFocusRequest = 0,
    db,
    language = 'zh',
    marketColorMode = MARKET_COLOR_MODES.GREEN_UP_RED_DOWN,
    newPwd,
    onAddAccount,
    onLogout,
    pwdLoading,
    pwdMsg,
    setChangelogExpanded,
    setLanguage,
    setMarketColorMode,
    setNewPwd,
    setPwdLoading,
    setPwdMsg,
    setShowChangePassword,
    showChangePassword,
    showConfirm,
    supabase,
    user,
  } = ctx;
  const currentLanguage = normalizeLanguage(language);
  const normalizedColorMode = normalizeMarketColorMode(marketColorMode);
  const [expandedSection, setExpandedSection] = React.useState('');
  const [changelog, setChangelog] = React.useState(null);
  const [changelogLoadError, setChangelogLoadError] = React.useState(false);
  const [inviteCodes, setInviteCodes] = React.useState([]);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteLoaded, setInviteLoaded] = React.useState(false);
  const [inviteMessage, setInviteMessage] = React.useState(null);
  const [communityProfile, setCommunityProfile] = React.useState(null);
  const [communityDraft, setCommunityDraft] = React.useState({ nickname: '', avatarKey: 'gold' });
  const [communityLoading, setCommunityLoading] = React.useState(Boolean(user?.id));
  const [communitySaving, setCommunitySaving] = React.useState(false);
  const [communityMessage, setCommunityMessage] = React.useState(null);
  const [showCommunityProfile, setShowCommunityProfile] = React.useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = React.useState(false);
  const [rememberedAccounts, setRememberedAccounts] = React.useState([]);
  const [accountSwitchingId, setAccountSwitchingId] = React.useState('');
  const [accountSwitchMessage, setAccountSwitchMessage] = React.useState(null);

  const isInviteAdmin = String(user?.email || '').trim().toLowerCase() === 'chenshuai1190@gmail.com';
  const selectedCommunityAvatar = getCommunityAvatarOption(communityDraft.avatarKey || communityProfile?.avatarKey);
  const communityHydrating = communityLoading && !communityProfile;
  const communityNicknameValidation = validateCommunityNickname(communityDraft.nickname);
  const communityDirty = Boolean(
    communityProfile
    && (
      !communityProfile.profileCompletedAt
      || communityNicknameValidation.nickname !== communityProfile.nickname
      || selectedCommunityAvatar.key !== communityProfile.avatarKey
    ),
  );
  const communityDisplayName = communityProfile?.nickname || communityNicknameValidation.nickname || t(language, 'settings.communityProfile', '社区资料');

  const fetchInviteApi = React.useCallback(async (options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error(t(language, 'settings.inviteAuthRequired', '请重新登录后再操作'));
    const res = await fetch('/api/invite-codes', {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success === false) {
      throw new Error(body?.error || t(language, 'settings.inviteRequestFailed', '邀请码请求失败'));
    }
    return body;
  }, [language, supabase]);

  const loadInviteCodes = React.useCallback(async () => {
    if (!isInviteAdmin || inviteLoading) return;
    setInviteLoading(true);
    setInviteMessage(null);
    try {
      const body = await fetchInviteApi({ method: 'GET' });
      setInviteCodes(Array.isArray(body.invites) ? body.invites : []);
    } catch (error) {
      setInviteMessage({ type: 'error', text: error.message || t(language, 'settings.inviteLoadFailed', '邀请码加载失败') });
    } finally {
      setInviteLoaded(true);
      setInviteLoading(false);
    }
  }, [fetchInviteApi, inviteLoading, isInviteAdmin, language]);

  const generateInviteCode = async () => {
    if (!isInviteAdmin || inviteLoading) return;
    setInviteLoading(true);
    setInviteMessage(null);
    try {
      const body = await fetchInviteApi({ method: 'POST', body: JSON.stringify({}) });
      setInviteCodes(Array.isArray(body.invites) ? body.invites : []);
      setInviteLoaded(true);
      setInviteMessage({
        type: 'success',
        text: t(language, 'settings.inviteGenerated', '邀请码已生成: {{code}}', { code: body.invite?.code || '--' }),
      });
    } catch (error) {
      setInviteMessage({ type: 'error', text: error.message || t(language, 'settings.inviteGenerateFailed', '邀请码生成失败') });
    } finally {
      setInviteLoading(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    import('../lib/settingsChangelog.js')
      .then((mod) => {
        if (!cancelled) {
          setChangelog(mod.settingsChangelog || mod.default || []);
          setChangelogLoadError(false);
        }
      })
      .catch((error) => {
        console.warn('[Settings] 更新日志加载失败:', error?.message || error);
        if (!cancelled) setChangelogLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (expandedSection === 'invite' && isInviteAdmin && !inviteLoaded && !inviteLoading) {
      loadInviteCodes();
    }
  }, [expandedSection, inviteLoaded, inviteLoading, isInviteAdmin, loadInviteCodes]);

  React.useEffect(() => {
    let cancelled = false;
    if (!user?.id || !db?.fetchCommunityProfile) {
      setCommunityProfile(null);
      setCommunityDraft({ nickname: '', avatarKey: 'gold' });
      return () => { cancelled = true; };
    }

    setCommunityLoading(true);
    setCommunityMessage(null);
    db.fetchCommunityProfile(user)
      .then((profile) => {
        if (cancelled) return;
        setCommunityProfile(profile);
        setCommunityDraft({ nickname: profile?.nickname || '', avatarKey: profile?.avatarKey || 'gold' });
      })
      .catch((error) => {
        console.warn('[Settings] 社区资料加载失败:', error?.message || error);
        if (!cancelled) {
          setCommunityProfile(null);
          setCommunityMessage({ type: 'error', text: error?.message || t(language, 'settings.communityLoadFailed', '社区资料加载失败') });
        }
      })
      .finally(() => {
        if (!cancelled) setCommunityLoading(false);
      });
    return () => { cancelled = true; };
  }, [db, language, user?.id]);

  React.useEffect(() => {
    if (!communityProfileFocusRequest) return undefined;
    setShowCommunityProfile(true);
    setCommunityMessage({
      type: 'info',
      text: t(language, 'settings.communityRequiredForCompetition', '参加收益比赛前，请选择社区昵称和默认头像并保存。'),
    });
    return undefined;
  }, [communityProfileFocusRequest, language]);

  const saveCommunityProfile = async () => {
    if (communitySaving || !db?.upsertCommunityProfile) return false;
    const nicknameResult = validateCommunityNickname(communityDraft.nickname);
    if (!nicknameResult.valid) {
      setCommunityMessage({ type: 'error', text: t(language, 'settings.communityNicknameInvalid', '昵称需为 2-16 个字符') });
      return false;
    }
    setCommunitySaving(true);
    setCommunityMessage(null);
    try {
      const next = await db.upsertCommunityProfile({
        nickname: nicknameResult.nickname,
        avatarKey: selectedCommunityAvatar.key,
      }, user);
      await clearCommunityCompetitionCache(user?.id);
      setCommunityProfile(next);
      setCommunityDraft({ nickname: next.nickname, avatarKey: next.avatarKey });
      setCommunityMessage({ type: 'success', text: t(language, 'settings.communitySaved', '社区资料已保存') });
      return true;
    } catch (error) {
      setCommunityMessage({ type: 'error', text: error?.message || t(language, 'settings.communitySaveFailed', '社区资料保存失败') });
      return false;
    } finally {
      setCommunitySaving(false);
    }
  };

  const toggleSection = (id) => {
    setExpandedSection((current) => current === id ? '' : id);
    if (id !== 'invite') setInviteMessage(null);
  };

  const closeCommunityProfile = () => {
    if (communitySaving) return;
    setShowCommunityProfile(false);
    setCommunityMessage(null);
    if (communityProfile) {
      setCommunityDraft({ nickname: communityProfile.nickname, avatarKey: communityProfile.avatarKey });
    } else {
      setCommunityDraft({ nickname: '', avatarKey: 'gold' });
    }
  };

  const requestLogout = () => {
    showConfirm({
      title: t(language, 'settings.logoutTitle', '退出登录?'),
      desc: t(language, 'settings.logoutDesc', '只退出当前设备上的这个账户，其他已添加账户仍会保留'),
      icon: 'logout',
      confirmText: t(language, 'settings.logout', '退出登录'),
      submittingText: t(language, 'settings.processing', '处理中...'),
      confirmStyle: 'danger',
      onConfirm: async () => { await onLogout(); },
    });
  };

  const openAccountSwitcher = async () => {
    setAccountSwitchMessage(null);
    setShowAccountSwitcher(true);
    try {
      const accounts = await accountManager?.list?.();
      setRememberedAccounts(Array.isArray(accounts) ? accounts : []);
    } catch (error) {
      setAccountSwitchMessage({ type: 'error', text: error?.message || t(language, 'settings.accountListFailed', '账户列表加载失败') });
    }
  };

  const selectRememberedAccount = async (account) => {
    if (!account?.userId || account.userId === user?.id || accountSwitchingId) return;
    setAccountSwitchMessage(null);
    setAccountSwitchingId(account.userId);
    try {
      await accountManager?.switch?.(account.userId);
    } catch (error) {
      setAccountSwitchMessage({ type: 'error', text: error?.message || t(language, 'settings.switchAccountFailed', '账户切换失败，请重新添加账户') });
      const accounts = await accountManager?.list?.();
      setRememberedAccounts(Array.isArray(accounts) ? accounts : []);
      setAccountSwitchingId('');
    }
  };

  const removeAccount = async (account) => {
    if (!account?.userId || account.userId === user?.id || accountSwitchingId) return;
    const accounts = await accountManager?.remove?.(account.userId);
    setRememberedAccounts(Array.isArray(accounts) ? accounts : []);
  };

  const requestRemoveAccount = (account) => {
    if (!account?.userId || account.userId === user?.id || accountSwitchingId) return;
    showConfirm({
      title: t(language, 'settings.removeAccountTitle', '移除快捷账户?'),
      desc: t(language, 'settings.removeAccountDesc', '将从本机移除 {{email}}，下次需要重新输入密码添加。', { email: account.email }),
      icon: 'logout',
      confirmText: t(language, 'settings.removeAccountConfirm', '确认移除'),
      submittingText: t(language, 'settings.processing', '处理中...'),
      confirmStyle: 'danger',
      onConfirm: async () => { await removeAccount(account); },
    });
  };

  const closeChangePassword = () => {
    setShowChangePassword(false);
    setNewPwd('');
    setPwdMsg(null);
  };

  const saveNewPassword = async () => {
    if (!newPwd || newPwd.length < 6) {
      setPwdMsg({ type: 'error', text: t(language, 'settings.passwordTooShort', '密码至少 6 位') });
      return;
    }
    setPwdLoading(true);
    setPwdMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        setPwdMsg({ type: 'error', text: error.message });
      } else {
        setPwdMsg({ type: 'success', text: t(language, 'settings.passwordUpdated', '密码已更新，下次登录请使用新密码') });
        setNewPwd('');
        window.setTimeout(closeChangePassword, 1800);
      }
    } catch (error) {
      setPwdMsg({ type: 'error', text: error.message || t(language, 'settings.passwordUpdateFailed', '更新失败') });
    } finally {
      setPwdLoading(false);
    }
  };

  const visibleChangelog = Array.isArray(changelog)
    ? (changelogExpanded ? changelog : changelog.slice(0, 5))
    : [];

  const renderExpandedPanel = (id) => {
    if (id === 'language') {
      const options = [
        { id: 'zh', label: t(language, 'settings.languageZh', '简体中文') },
        { id: 'en', label: t(language, 'settings.languageEn', 'English') },
      ];
      return (
        <DetailShell>
          <p className="mb-3 text-[11px] leading-5 text-white/35">
            {t(language, 'settings.languageDesc', '切换系统界面文案，不翻译你自己写的日志和备注。')}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {options.map((option) => {
              const active = currentLanguage === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLanguage?.(option.id)}
                  className={`flex min-h-[46px] items-center justify-between rounded-xl border px-3.5 text-[13px] outline-none transition active:scale-[0.99] ${active ? 'border-[#f2a83a]/40 bg-[#f2a83a]/[0.07] text-[#f5ba62]' : 'border-white/[0.08] bg-white/[0.025] text-white/50'}`}
                >
                  {option.label} {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </DetailShell>
      );
    }

    if (id === 'display') {
      const options = [
        { id: MARKET_COLOR_MODES.RED_UP_GREEN_DOWN, label: t(language, 'settings.redUpGreenDown', '红涨绿跌'), up: '#ff4b1f', down: '#2bd39a' },
        { id: MARKET_COLOR_MODES.GREEN_UP_RED_DOWN, label: t(language, 'settings.greenUpRedDown', '绿涨红跌'), up: '#2bd39a', down: '#ff4b1f' },
      ];
      return (
        <DetailShell>
          <p className="mb-3 text-[11px] leading-5 text-white/35">
            {t(language, 'settings.displayDesc', '统一首页、交易和详情页中的市场涨跌颜色。')}
          </p>
          <div className="space-y-2">
            {options.map((option) => {
              const active = normalizedColorMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMarketColorMode?.(option.id)}
                  className={`flex min-h-[48px] w-full items-center rounded-xl border px-3.5 text-[13px] outline-none ${active ? 'border-[#f2a83a]/35 bg-[#f2a83a]/[0.06] text-white/80' : 'border-white/[0.07] bg-white/[0.02] text-white/48'}`}
                >
                  <span className="mr-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.up }} />
                  <span className="flex-1 text-left">{option.label}</span>
                  <span className="mr-2 text-[11px]" style={{ color: option.up }}>+8.8%</span>
                  <span className="text-[11px]" style={{ color: option.down }}>-3.2%</span>
                  {active && <Check className="ml-3 h-4 w-4 text-[#f2b65d]" />}
                </button>
              );
            })}
          </div>
        </DetailShell>
      );
    }

    if (id === 'account') {
      return (
        <DetailShell>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-white/75">{user?.email || '--'}</p>
              <p className="mt-1 text-[10px] text-white/30">{t(language, 'settings.accountHealthy', '当前账户 · 登录状态正常')}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="shrink-0 rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[11px] text-white/55 active:bg-white/[0.05]"
            >
              {t(language, 'settings.changePassword', '修改密码')}
            </button>
          </div>
        </DetailShell>
      );
    }

    if (id === 'community') {
      return (
        <>
          <label className="block text-[11px] text-white/38" htmlFor="community-nickname-input">
            {t(language, 'settings.communityNickname', '社区昵称')}
          </label>
          <input
            id="community-nickname-input"
            type="text"
            value={communityDraft.nickname}
            onChange={(event) => {
              setCommunityDraft((current) => ({ ...current, nickname: event.target.value }));
              setCommunityMessage(null);
            }}
            maxLength={24}
            placeholder={t(language, 'settings.communityNicknamePlaceholder', '请输入 2-16 个字符')}
            disabled={communityLoading || communitySaving}
            className="mt-2 block h-12 w-full min-w-0 max-w-full box-border rounded-xl border border-white/[0.09] bg-[#080b11] px-3.5 text-[14px] font-normal text-white/85 outline-none placeholder:text-white/20 focus:border-[#f2a83a]/35 disabled:opacity-60"
          />
          <p className={`mt-2 text-[10px] ${communityNicknameValidation.valid || !communityDraft.nickname ? 'text-white/30' : 'text-rose-300'}`}>
            {t(language, 'settings.communityNicknameRule', '2-16 个字符，用于排行榜公开展示')}
          </p>
          <div className="mb-2.5 mt-4 flex items-center justify-between">
            <p className="text-[11px] text-white/38">{t(language, 'settings.communityAvatar', '默认头像')}</p>
            {communityLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/35" />}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {COMMUNITY_AVATAR_OPTIONS.map((avatar) => {
              const active = selectedCommunityAvatar.key === avatar.key;
              return (
                <button
                  key={avatar.key}
                  type="button"
                  onClick={() => {
                    setCommunityDraft((current) => ({ ...current, avatarKey: avatar.key }));
                    setCommunityMessage(null);
                  }}
                  disabled={communityLoading || communitySaving}
                  aria-label={currentLanguage === 'en' ? avatar.labelEn : avatar.labelZh}
                  className={`relative aspect-square min-w-0 overflow-hidden rounded-full border bg-[#070a0f] transition active:scale-95 disabled:opacity-60 ${active ? 'border-[#f6b54b] shadow-[0_0_12px_rgba(246,181,75,0.22)]' : 'border-transparent opacity-65'}`}
                >
                  <img src={avatar.src} alt="" className={`h-full w-full object-cover ${communityAvatarImageClass(avatar.key)}`} draggable={false} />
                  {active && <span className="absolute inset-x-[32%] bottom-0 h-0.5 rounded-full bg-[#f6b54b]" />}
                </button>
              );
            })}
          </div>
          <StatusMessage message={communityMessage} className="mt-3" />
        </>
      );
    }

    if (id === 'invite' && isInviteAdmin) {
      return (
        <DetailShell>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] text-white/70">{t(language, 'settings.inviteAdminOnly', '管理员专属')}</p>
              <p className="mt-1 text-[10px] text-white/30">{t(language, 'settings.inviteDesc', '生成并管理新用户邀请码')}</p>
            </div>
            <button
              type="button"
              onClick={generateInviteCode}
              disabled={inviteLoading}
              className="flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-[#f2a83a]/25 px-3 text-[11px] text-[#f2b65d] active:scale-95 disabled:opacity-50"
            >
              {inviteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t(language, 'settings.inviteGenerate', '生成')}
            </button>
          </div>
          <StatusMessage message={inviteMessage} className="mb-3" />
          <div className="space-y-2">
            {inviteCodes.length === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-[12px] text-white/38">
                {inviteLoading ? t(language, 'settings.inviteLoading', '加载中...') : t(language, 'settings.inviteEmpty', '还没有邀请码')}
              </div>
            ) : inviteCodes.slice(0, 8).map((invite) => {
              const used = invite.status === 'used' || Boolean(invite.usedAt);
              return (
                <button
                  key={invite.id || invite.code}
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard?.writeText(invite.code);
                      setInviteMessage({ type: 'success', text: t(language, 'settings.inviteCopied', '邀请码已复制') });
                    } catch {
                      setInviteMessage({ type: 'success', text: invite.code });
                    }
                  }}
                  className="flex w-full min-w-0 items-center rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] tracking-[0.08em] text-white/70">{invite.code}</span>
                    {used && invite.usedByEmail && (
                      <span className="mt-1 block truncate text-[10px] tracking-normal text-white/32">
                        {t(language, 'settings.inviteUsedByEmail', '注册邮箱: {{email}}', { email: invite.usedByEmail })}
                      </span>
                    )}
                  </span>
                  <span className={`mr-2 rounded-full px-2 py-1 text-[9px] ${used ? 'bg-white/[0.05] text-white/30' : 'bg-[#2cce91]/10 text-[#49daa7]'}`}>
                    {used ? t(language, 'settings.inviteUsed', '已使用') : t(language, 'settings.inviteActive', '可用')}
                  </span>
                  <Copy className="h-3.5 w-3.5 text-white/30" />
                </button>
              );
            })}
          </div>
        </DetailShell>
      );
    }

    return null;
  };

  const settingsRows = [
    {
      id: 'language',
      icon: Languages,
      label: t(language, 'settings.languageSettings', '语言设置'),
      value: currentLanguage === 'en' ? 'English' : '简体中文',
      valueClass: 'text-[#f4b44f]',
    },
    {
      id: 'display',
      icon: Monitor,
      label: t(language, 'settings.displaySettings', '显示设置'),
      value: normalizedColorMode === MARKET_COLOR_MODES.RED_UP_GREEN_DOWN
        ? t(language, 'settings.redUpGreenDownShort', '红涨绿跌')
        : t(language, 'settings.greenUpRedDownShort', '绿涨红跌'),
    },
    {
      id: 'account',
      icon: ShieldCheck,
      label: t(language, 'settings.account', '账户设置'),
      badge: t(language, 'settings.loggedIn', '已登录'),
      badgeClass: 'border-[#2cce91]/20 bg-[#2cce91]/10 text-[#49daa7]',
    },
    ...(isInviteAdmin ? [{
      id: 'invite',
      icon: Ticket,
      label: t(language, 'settings.inviteTitle', '邀请码管理'),
      badge: t(language, 'settings.admin', '管理员'),
      badgeClass: 'border-[#f2a83a]/20 bg-[#f2a83a]/10 text-[#f2b65d]',
    }] : []),
  ];

  return (
    <>
      <div className="mx-auto w-full max-w-[430px] text-white" data-settings-redesign="phase-1-production">
        <button
          type="button"
          onClick={() => {
            setCommunityMessage(null);
            setShowCommunityProfile(true);
          }}
          aria-label={t(language, 'settings.editCommunityProfile', '编辑社区资料')}
          className="mt-1 flex min-h-[176px] w-full flex-col items-center justify-center rounded-[22px] border border-white/[0.09] bg-[radial-gradient(circle_at_50%_35%,rgba(33,65,122,0.13),transparent_45%),linear-gradient(145deg,#0d1118,#0a0d13)] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
        >
          <span className="relative h-[95px] w-[95px] rounded-full border border-white/[0.18] bg-[#080c12] shadow-[0_0_0_3px_rgba(255,255,255,0.025),0_0_24px_rgba(36,90,202,0.18)]">
            <span className="absolute inset-px flex items-center justify-center overflow-hidden rounded-full bg-[#070a0f]">
              {communityHydrating
                ? <Loader2 className="h-5 w-5 animate-spin text-white/22" />
                : <img src={selectedCommunityAvatar.src} alt="" className={`h-full w-full object-cover ${communityAvatarImageClass(selectedCommunityAvatar.key)}`} draggable={false} />}
            </span>
            {!communityHydrating && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-[21px] w-[21px] items-center justify-center rounded-full border border-white/[0.12] bg-[#11161f] text-[#f2b65d] shadow-[0_4px_10px_rgba(0,0,0,0.45)]">
                <Pencil className="h-2.5 w-2.5" strokeWidth={1.8} />
              </span>
            )}
          </span>
          <span className="mt-3 max-w-full truncate text-[16px] font-medium tracking-[0.02em] text-white/[0.92]">
            {communityHydrating ? t(language, 'settings.loading', '加载中...') : communityDisplayName}
          </span>
        </button>

        <section className="mt-5 overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#0c1016] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          {settingsRows.map((row, index) => (
            <React.Fragment key={row.id}>
              {index > 0 && <div className="mx-5 h-px bg-white/[0.065]" />}
              <SettingsRow
                {...row}
                expanded={expandedSection === row.id}
                onClick={() => toggleSection(row.id)}
              />
              {expandedSection === row.id && renderExpandedPanel(row.id)}
            </React.Fragment>
          ))}

          <div className="mx-5 h-px bg-white/[0.065]" />
          <div className="grid grid-cols-2 gap-3 px-4 py-4">
            <button
              type="button"
              onClick={openAccountSwitcher}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-white/[0.09] bg-white/[0.025] text-[13px] text-white/65 active:bg-white/[0.05]"
            >
              <RefreshCw className="h-4 w-4" /> {t(language, 'settings.switchAccount', '切换账户')}
            </button>
            <button
              type="button"
              onClick={requestLogout}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-[#e04d5e]/20 bg-[#8f1f2c]/20 text-[13px] text-[#f08391] active:bg-[#8f1f2c]/28"
            >
              <LogOut className="h-4 w-4" /> {t(language, 'settings.logout', '退出登录')}
            </button>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[20px] border border-white/[0.075] bg-[#0b0f15]">
          <button
            type="button"
            onClick={() => toggleSection('changelog')}
            className="flex min-h-[62px] w-full items-center gap-3 px-5 text-left"
          >
            <Globe2 className="h-[18px] w-[18px] text-white/42" />
            <span className="flex-1 text-[13px] text-white/68">{t(language, 'settings.changelog', '更新日志')}</span>
            <span className="text-[10px] text-white/28">{SETTINGS_VERSION}</span>
            {expandedSection === 'changelog'
              ? <ChevronDown className="h-4 w-4 text-white/30" />
              : <ChevronRight className="h-4 w-4 text-white/30" />}
          </button>

          {expandedSection === 'changelog' && (
            <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
              {changelogLoadError ? (
                <StatusMessage message={{ type: 'error', text: t(language, 'settings.changelogLoadFailed', '更新日志加载失败，请稍后重试') }} />
              ) : !Array.isArray(changelog) ? (
                <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-white/38">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t(language, 'settings.changelogLoading', '更新日志加载中...')}
                </div>
              ) : (
                <div>
                  {visibleChangelog.map((log, index, rows) => (
                    <div key={log.ver} className={`py-3 ${index !== rows.length - 1 ? 'border-b border-white/[0.07]' : ''} ${index === 0 ? 'pt-0' : ''}`}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${log.latest ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-[#f6a524]/20 bg-[#f6a524]/10 text-[#f6a524]'}`}>
                          {log.ver}
                        </span>
                        <span className="font-mono text-[9px] text-white/30">{log.date}</span>
                      </div>
                      <ul className="space-y-0.5">
                        {(currentLanguage === 'en' && Array.isArray(log.itemsEn) ? log.itemsEn : log.items).map((item, itemIndex) => (
                          <li key={itemIndex} className="relative pl-3 text-[11px] leading-5 text-white/52">
                            <span className="absolute left-0 text-[#f6a524]">·</span>{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {changelog.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setChangelogExpanded(!changelogExpanded)}
                      className="mt-2 flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.025] text-[11px] text-[#f2b65d]"
                    >
                      {changelogExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {changelogExpanded
                        ? t(language, 'settings.collapseHistory', '收起历史版本')
                        : t(language, 'settings.viewFullHistory', '查看完整历史（共 {{total}} 个版本）', { total: changelog.length })}
                    </button>
                  )}
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[9px] text-white/24">
                    <span>{t(language, 'settings.dataSource', '数据源')}</span>
                    <span>EODHD Core + Yahoo Charts</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-[9px] tracking-[0.06em] text-white/18">Quote · {SETTINGS_VERSION}</p>
      </div>

      {showCommunityProfile && (
        <ActionModalCard
          title={t(language, 'settings.communityProfile', '社区资料')}
          closeLabel={t(language, 'settings.closeCommunityProfile', '关闭社区资料')}
          onClose={closeCommunityProfile}
          actions={[
            {
              key: 'cancel',
              label: t(language, 'common.cancel', '取消'),
              onClick: closeCommunityProfile,
              disabled: communitySaving,
            },
            {
              key: 'save',
              label: communitySaving
                ? t(language, 'settings.communitySaving', '保存中...')
                : t(language, 'common.save', '保存'),
              disabled: communityLoading || communitySaving || !communityNicknameValidation.valid || !communityDirty,
              onClick: async () => {
                const saved = await saveCommunityProfile();
                if (saved) {
                  setShowCommunityProfile(false);
                  setCommunityMessage(null);
                }
              },
            },
          ]}
        >
          {renderExpandedPanel('community')}
        </ActionModalCard>
      )}

      {showAccountSwitcher && (
        <ActionModalCard
          title={t(language, 'settings.switchAccount', '切换账户')}
          closeLabel={t(language, 'settings.closeAccountSwitcher', '关闭账户切换')}
          onClose={() => { if (!accountSwitchingId) setShowAccountSwitcher(false); }}
          actions={[
            {
              key: 'cancel',
              label: t(language, 'common.cancel', '取消'),
              disabled: Boolean(accountSwitchingId),
              onClick: () => setShowAccountSwitcher(false),
            },
            {
              key: 'add',
              label: t(language, 'settings.addAccount', '添加账户'),
              disabled: Boolean(accountSwitchingId),
              onClick: async () => {
                try {
                  await onAddAccount?.();
                } catch (error) {
                  setAccountSwitchMessage({ type: 'error', text: error?.message || t(language, 'settings.addAccountFailed', '无法添加账户') });
                }
              },
            },
          ]}
        >
          <div className="space-y-2">
            <p className="px-1 pb-1 text-[11px] leading-5 text-white/38">
              {t(language, 'settings.accountSwitchDesc', '选择已添加账户可直接切换，不保存密码。')}
            </p>
            {rememberedAccounts.map((account) => {
              const current = account.userId === user?.id;
              const switching = accountSwitchingId === account.userId;
              return (
                <div key={account.userId} className={`flex min-h-[54px] items-center gap-2 rounded-xl border px-3 ${current ? 'border-[#f2a83a]/25 bg-[#f2a83a]/[0.07]' : 'border-white/[0.07] bg-black/20'}`}>
                  <button
                    type="button"
                    onClick={() => selectRememberedAccount(account)}
                    disabled={current || Boolean(accountSwitchingId)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${current ? 'bg-[#f2a83a]/15 text-[#f2b65d]' : 'bg-white/[0.05] text-white/45'}`}>
                      {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-white/75">{account.email}</span>
                      <span className={`mt-0.5 block text-[9px] ${current ? 'text-[#f2b65d]' : 'text-white/28'}`}>
                        {current ? t(language, 'settings.currentAccount', '当前账户') : t(language, 'settings.tapToSwitch', '点击直接切换')}
                      </span>
                    </span>
                  </button>
                  {!current && (
                    <button
                      type="button"
                      onClick={() => requestRemoveAccount(account)}
                      disabled={Boolean(accountSwitchingId)}
                      aria-label={t(language, 'settings.removeRememberedAccount', '移除已添加账户')}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/25 active:bg-white/[0.05] active:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {rememberedAccounts.length === 0 && (
              <div className="flex min-h-[72px] items-center justify-center gap-2 text-[11px] text-white/35">
                <UserPlus className="h-4 w-4" /> {t(language, 'settings.noRememberedAccount', '暂无已添加账户')}
              </div>
            )}
            <StatusMessage message={accountSwitchMessage} className="mt-2" />
          </div>
        </ActionModalCard>
      )}

      {showChangePassword && (
        <ActionModalCard
          title={t(language, 'settings.changePassword', '修改密码')}
          closeLabel={t(language, 'settings.closePassword', '关闭修改密码')}
          onClose={closeChangePassword}
          widthClassName="w-[calc(100vw-32px)] max-w-md"
          actions={[
            { key: 'cancel', label: t(language, 'settings.cancel', '取消'), onClick: closeChangePassword },
            {
              key: 'save',
              label: pwdLoading ? t(language, 'settings.saving', '保存中...') : t(language, 'settings.saveNewPassword', '保存新密码'),
              disabled: pwdLoading,
              onClick: saveNewPassword,
            },
          ]}
        >
          <div className="min-w-0">
            <label className="mb-1.5 block text-[11px] text-white/42">{t(language, 'settings.newPassword', '新密码（至少 6 位）')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPwd}
              onChange={(event) => setNewPwd(event.target.value)}
              placeholder={t(language, 'settings.passwordPlaceholder', '至少 6 位')}
              className="block h-12 w-full min-w-0 max-w-full box-border rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6a524]/50"
            />
            <p className="mt-3 text-[11px] leading-5 text-white/35">{t(language, 'settings.passwordChangeHint', '修改后，下次登录请使用新密码。')}</p>
            {pwdMsg && <StatusMessage message={pwdMsg} className="mt-3" />}
          </div>
        </ActionModalCard>
      )}
    </>
  );
}

export default React.memo(SettingsTab);
