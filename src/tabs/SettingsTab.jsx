import React from 'react';
import {
  COMMUNITY_AVATAR_OPTIONS,
  getCommunityAvatarOption,
  validateCommunityNickname,
} from '../lib/communityProfile.js';
import { normalizeLanguage, t } from '../lib/i18n.js';

function SettingsTab({ ctx }) {
  const {
    changelogExpanded,
    ChevronDown,
    ChevronUp,
    clearQuoteDiagnosticLogs,
    db,
    Loader2,
    LogOut,
    language = 'zh',
    newPwd,
    onLogout,
    pwdLoading,
    pwdMsg,
    quoteDiagnosticLogs = [],
    setChangelogExpanded,
    setLanguage,
    setNewPwd,
    setPwdLoading,
    setPwdMsg,
    setShowChangePassword,
    showChangePassword,
    showConfirm,
    supabase,
    user,
    X,
  } = ctx;
  const currentLanguage = normalizeLanguage(language);

  const formatDiagnosticTime = (value) => {
    if (!value) return '--';
    try {
      return new Date(value).toLocaleString(currentLanguage === 'en' ? 'en-US' : 'zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--';
    }
  };
  const triggerLabel = (trigger) => {
    const labels = currentLanguage === 'en'
      ? {
        'auto-start': 'Auto start',
        'auto-start-cloud': 'Startup snapshot',
        'auto-interval': 'Auto polling',
        'auto-visible': 'Foreground',
        'auto-focus': 'Window focus',
        'auto-pageshow': 'Page restore',
        'auto-tab': 'Tab switch',
        'auto-realtime-open': 'Live connected',
        'auto-ios-resume': 'iOS app resume',
        'auto-ios-resume-cloud': 'iOS resume snapshot',
        'auto-ios-touch-resume': 'iOS touch resume',
        'auto-ios-online': 'iOS online',
        'manual-button': 'Manual refresh',
        'manual-pull-refresh': 'Pull refresh',
      }
      : {
        'auto-start': '自动启动',
        'auto-start-cloud': '启动快照',
        'auto-interval': '自动轮询',
        'auto-visible': '回到前台',
        'auto-focus': '窗口聚焦',
        'auto-pageshow': '页面恢复',
        'auto-tab': '切换页面',
        'auto-realtime-open': '实时连接',
        'auto-ios-resume': 'iOS 回到前台',
        'auto-ios-resume-cloud': 'iOS 恢复快照',
        'auto-ios-touch-resume': 'iOS 触摸恢复',
        'auto-ios-online': 'iOS 网络恢复',
        'manual-button': '手动刷新',
        'manual-pull-refresh': '下拉刷新',
      };
    return labels[trigger] || trigger || (currentLanguage === 'en' ? 'Unknown trigger' : '未知触发');
  };
  const rootLabel = (root) => ({
    'browser-network': '浏览器网络',
    'auth': '登录鉴权',
    'request-params': '请求参数',
    'rate-limit': '频率限制',
    'server-config': '服务端配置',
    'provider-partial': '第三方局部',
    'quote-api': '行情接口',
  }[root] || root || '未知根因');
  const visibleQuoteLogs = Array.isArray(quoteDiagnosticLogs) ? quoteDiagnosticLogs.slice(0, 8) : [];

  const [changelog, setChangelog] = React.useState(null);
  const [changelogLoadError, setChangelogLoadError] = React.useState(false);
  const [inviteCodes, setInviteCodes] = React.useState([]);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteMessage, setInviteMessage] = React.useState(null);
  const [communityProfile, setCommunityProfile] = React.useState(null);
  const [communityDraft, setCommunityDraft] = React.useState({ nickname: '', avatarKey: 'gold' });
  const [communityLoading, setCommunityLoading] = React.useState(false);
  const [communitySaving, setCommunitySaving] = React.useState(false);
  const [communityMessage, setCommunityMessage] = React.useState(null);

  const isInviteAdmin = String(user?.email || '').trim().toLowerCase() === 'chenshuai1190@gmail.com';
  const selectedCommunityAvatar = getCommunityAvatarOption(communityDraft.avatarKey || communityProfile?.avatarKey);
  const communityNicknameValidation = validateCommunityNickname(communityDraft.nickname);
  const communityDirty = Boolean(
    communityProfile
    && (
      communityNicknameValidation.nickname !== communityProfile.nickname
      || selectedCommunityAvatar.key !== communityProfile.avatarKey
    ),
  );

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
    if (!isInviteAdmin) return;
    setInviteLoading(true);
    setInviteMessage(null);
    try {
      const body = await fetchInviteApi({ method: 'GET' });
      setInviteCodes(Array.isArray(body.invites) ? body.invites : []);
    } catch (error) {
      setInviteMessage({ type: 'error', text: error.message || t(language, 'settings.inviteLoadFailed', '邀请码加载失败') });
    } finally {
      setInviteLoading(false);
    }
  }, [fetchInviteApi, isInviteAdmin, language]);

  const generateInviteCode = async () => {
    if (!isInviteAdmin || inviteLoading) return;
    setInviteLoading(true);
    setInviteMessage(null);
    try {
      const body = await fetchInviteApi({
        method: 'POST',
        body: JSON.stringify({}),
      });
      setInviteCodes(Array.isArray(body.invites) ? body.invites : []);
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
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (isInviteAdmin) loadInviteCodes();
  }, [isInviteAdmin, loadInviteCodes]);

  React.useEffect(() => {
    let cancelled = false;
    if (!user?.id || !db?.fetchCommunityProfile) {
      setCommunityProfile(null);
      setCommunityDraft({ nickname: '', avatarKey: 'gold' });
      return () => {
        cancelled = true;
      };
    }

    setCommunityLoading(true);
    setCommunityMessage(null);
    db.fetchCommunityProfile(user)
      .then((profile) => {
        if (cancelled) return;
        setCommunityProfile(profile);
        setCommunityDraft({
          nickname: profile?.nickname || '',
          avatarKey: profile?.avatarKey || 'gold',
        });
      })
      .catch((error) => {
        console.warn('[Settings] 社区资料加载失败:', error?.message || error);
        if (!cancelled) {
          setCommunityProfile(null);
          setCommunityMessage({
            type: 'error',
            text: error?.message || t(language, 'settings.communityLoadFailed', '社区资料加载失败'),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCommunityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [db, language, user?.id]);

  const saveCommunityProfile = async () => {
    if (communitySaving || !db?.upsertCommunityProfile) return;
    const nicknameResult = validateCommunityNickname(communityDraft.nickname);
    if (!nicknameResult.valid) {
      setCommunityMessage({ type: 'error', text: t(language, 'settings.communityNicknameInvalid', '昵称需为 2-16 个字符') });
      return;
    }

    setCommunitySaving(true);
    setCommunityMessage(null);
    try {
      const next = await db.upsertCommunityProfile({
        nickname: nicknameResult.nickname,
        avatarKey: selectedCommunityAvatar.key,
      }, user);
      setCommunityProfile(next);
      setCommunityDraft({ nickname: next.nickname, avatarKey: next.avatarKey });
      setCommunityMessage({ type: 'success', text: t(language, 'settings.communitySaved', '社区资料已保存') });
    } catch (error) {
      setCommunityMessage({
        type: 'error',
        text: error?.message || t(language, 'settings.communitySaveFailed', '社区资料保存失败'),
      });
    } finally {
      setCommunitySaving(false);
    }
  };

  const visibleChangelog = Array.isArray(changelog)
    ? (changelogExpanded ? changelog : changelog.slice(0, 5))
    : [];

  return (
    <>

          <div className="space-y-4 text-white">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Quote</div>
                  <h1 className="mt-1 text-[22px] font-black tracking-normal text-white">{t(language, 'settings.title', '设置')}</h1>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-[#f6a524]">
                  v10.7.9.301
                </span>
              </div>
            </div>

            {/* 语言 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-white">{t(language, 'settings.language', '语言')}</h2>
                  <div className="mt-1 text-[12px] leading-5 text-white/40">
                    {t(language, 'settings.languageDesc', '切换系统界面文案, 不翻译你自己写的日志和备注。')}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#f6a524]/20 bg-[#f6a524]/10 px-2.5 py-1 text-[10px] font-black uppercase text-[#f6a524]">
                  {currentLanguage === 'en' ? 'EN' : '中文'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'zh', label: t(language, 'settings.languageZh', '简体中文') },
                  { id: 'en', label: t(language, 'settings.languageEn', 'English') },
                ].map((item) => {
                  const active = currentLanguage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLanguage?.(item.id)}
                      className={`flex h-11 items-center justify-center rounded-xl border text-[13px] font-bold transition active:scale-[0.99] ${
                        active
                          ? 'border-[#f6a524]/70 bg-[#f6a524]/15 text-[#ffd18a]'
                          : 'border-white/10 bg-black/20 text-white/55'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 账户设置 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-white">{t(language, 'settings.account', '账户设置')}</h2>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300"></span>
                  {t(language, 'settings.loggedIn', '已登录')}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Email</div>
                <div className="mt-1 break-all text-sm font-semibold text-white/85">
                  {user?.email || '--'}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] py-2.5 text-sm font-bold text-white active:scale-95 transition"
                >
                  {t(language, 'settings.changePassword', '修改密码')}
                </button>
                <button
                  onClick={() => {
                    showConfirm({
                      title: t(language, 'settings.logoutTitle', '退出登录?'),
                      desc: t(language, 'settings.logoutDesc', '下次进入需要重新登录'),
                      icon: '🔓',
                      confirmText: t(language, 'settings.logout', '退出登录'),
                      onConfirm: async () => {
                        await onLogout();
                      },
                    });
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/20 bg-rose-400/10 py-2.5 text-sm font-bold text-rose-300 active:scale-95 transition"
                >
                  <LogOut className="w-4 h-4" /> {t(language, 'settings.logout', '退出登录')}
                </button>
              </div>
            </div>

            {/* 社区资料 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-white">{t(language, 'settings.communityProfile', '社区资料')}</h2>
                  <div className="mt-1 text-[12px] leading-5 text-white/40">
                    {t(language, 'settings.communityProfileDesc', '昵称和头像会用于后续社区比赛排行榜展示,不会展示邮箱。')}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#f6a524]/20 bg-[#f6a524]/10 px-2.5 py-1 text-[10px] font-black text-[#f6a524]">
                  {t(language, 'settings.communityPublic', '公开资料')}
                </span>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#070a0f] shadow-[0_0_28px_rgba(246,181,75,0.12)]">
                    <img
                      src={selectedCommunityAvatar.src}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-[11px] font-bold text-white/42">
                      {t(language, 'settings.communityNickname', '社区昵称')}
                    </label>
                    <input
                      type="text"
                      value={communityDraft.nickname}
                      onChange={(event) => {
                        setCommunityDraft((current) => ({ ...current, nickname: event.target.value }));
                        setCommunityMessage(null);
                      }}
                      maxLength={24}
                      placeholder={t(language, 'settings.communityNicknamePlaceholder', '请输入 2-16 个字符')}
                      disabled={communityLoading || communitySaving}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#080b11] px-3 text-[14px] font-semibold text-white outline-none placeholder:text-white/25 focus:border-[#f6a524]/70 disabled:opacity-60"
                    />
                    <div className={`mt-1.5 text-[10px] ${communityNicknameValidation.valid || !communityDraft.nickname ? 'text-white/32' : 'text-rose-300'}`}>
                      {t(language, 'settings.communityNicknameRule', '2-16 个字符,用于排行榜公开展示')}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-bold text-white/42">{t(language, 'settings.communityAvatar', '默认头像')}</div>
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
                          className={`relative aspect-square rounded-full border bg-[#080b11] p-0.5 transition active:scale-95 disabled:opacity-60 ${
                            active
                              ? 'border-[#f6a524] shadow-[0_0_18px_rgba(246,181,75,0.22)]'
                              : 'border-white/10 opacity-70'
                          }`}
                        >
                          <img src={avatar.src} alt="" className="h-full w-full rounded-full object-cover" draggable={false} />
                          {active && (
                            <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#f6a524]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {communityMessage && (
                  <div className={`mt-3 rounded-xl border px-3 py-2 text-[12px] ${
                    communityMessage.type === 'error'
                      ? 'border-rose-400/25 bg-rose-400/10 text-rose-200'
                      : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                  }`}>
                    {communityMessage.text}
                  </div>
                )}

                <button
                  type="button"
                  onClick={saveCommunityProfile}
                  disabled={communityLoading || communitySaving || !communityNicknameValidation.valid || !communityDirty}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#f6a524]/25 bg-[#f6a524]/14 text-[13px] font-black text-[#ffd18a] transition active:scale-95 disabled:border-white/10 disabled:bg-white/[0.05] disabled:text-white/30"
                >
                  {communitySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {communitySaving
                    ? t(language, 'settings.communitySaving', '保存中...')
                    : t(language, 'settings.communitySave', '保存社区资料')}
                </button>
              </div>
            </div>

            {isInviteAdmin && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-white">{t(language, 'settings.inviteTitle', '邀请码管理')}</h2>
                    <div className="mt-1 text-[12px] leading-5 text-white/40">
                      {t(language, 'settings.inviteDesc', '没有邀请码的新用户无法注册。')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={generateInviteCode}
                    disabled={inviteLoading}
                    className="flex h-9 shrink-0 items-center justify-center rounded-xl border border-[#f6a524]/25 bg-[#f6a524]/14 px-3 text-[12px] font-bold text-[#ffd18a] active:scale-95 disabled:opacity-50"
                  >
                    {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t(language, 'settings.inviteGenerate', '生成')}
                  </button>
                </div>

                {inviteMessage && (
                  <div className={`mb-3 rounded-xl border px-3 py-2 text-[12px] ${
                    inviteMessage.type === 'error'
                      ? 'border-rose-400/25 bg-rose-400/10 text-rose-200'
                      : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                  }`}>
                    {inviteMessage.text}
                  </div>
                )}

                <div className="space-y-2">
                  {inviteCodes.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/45">
                      {inviteLoading ? t(language, 'settings.inviteLoading', '加载中...') : t(language, 'settings.inviteEmpty', '还没有邀请码')}
                    </div>
                  ) : inviteCodes.slice(0, 8).map((invite) => {
                    const used = invite.status === 'used' || Boolean(invite.usedAt);
                    return (
                      <div key={invite.id || invite.code} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard?.writeText(invite.code);
                                setInviteMessage({ type: 'success', text: t(language, 'settings.inviteCopied', '邀请码已复制') });
                              } catch {
                                setInviteMessage({ type: 'success', text: invite.code });
                              }
                            }}
                            className="min-w-0 truncate text-left text-[14px] font-semibold uppercase tracking-[0.08em] text-white"
                          >
                            {invite.code}
                          </button>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            used
                              ? 'border-white/10 bg-white/[0.06] text-white/45'
                              : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                          }`}>
                            {used ? t(language, 'settings.inviteUsed', '已使用') : t(language, 'settings.inviteActive', '可用')}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[11px] leading-4 text-white/35">
                          {used && invite.usedByEmail
                            ? t(language, 'settings.inviteUsedBy', '已被 {{email}} 使用', { email: invite.usedByEmail })
                            : t(language, 'settings.inviteTapToCopy', '点击邀请码复制')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 修改密码 Modal */}
            {showChangePassword && (
              <div
                className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
                onClick={(e) => { if (e.target === e.currentTarget) { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); } }}
              >
                <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0b0f16] p-5 shadow-2xl sm:rounded-3xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-black text-white">修改密码</h3>
                    <button
                      onClick={() => { setShowChangePassword(false); setNewPwd(''); setPwdMsg(null); }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <label className="mb-1 block text-xs font-bold text-white/50">新密码 (至少 6 位)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder="至少 6 位"
                    className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6a524]"
                  />

                  {pwdMsg && (
                    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                      pwdMsg.type === 'error'
                        ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    }`}>
                      {pwdMsg.text}
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!newPwd || newPwd.length < 6) {
                        setPwdMsg({ type: 'error', text: '密码至少 6 位' });
                        return;
                      }
                      setPwdLoading(true);
                      setPwdMsg(null);
                      try {
                        const { error } = await supabase.auth.updateUser({ password: newPwd });
                        if (error) {
                          setPwdMsg({ type: 'error', text: error.message });
                        } else {
                          setPwdMsg({ type: 'success', text: '✓ 密码已更新, 下次登录用新密码' });
                          setNewPwd('');
                          setTimeout(() => {
                            setShowChangePassword(false);
                            setPwdMsg(null);
                          }, 2000);
                        }
                      } catch (e) {
                        setPwdMsg({ type: 'error', text: e.message || '更新失败' });
                      } finally {
                        setPwdLoading(false);
                      }
                    }}
                    disabled={pwdLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6a524] py-3 font-black text-[#05070b] active:scale-95 transition disabled:opacity-50"
                  >
                    {pwdLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    ) : '保存新密码'}
                  </button>
                </div>
              </div>
            )}

            {/* 行情诊断日志 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white">{t(language, 'settings.diagnostics', '行情诊断日志')}</h2>
                  <div className="mt-1 text-[11px] font-medium text-white/35">
                    {t(language, 'settings.recentCount', '最近 {{count}} 条', { count: quoteDiagnosticLogs.length || 0 })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearQuoteDiagnosticLogs}
                  disabled={quoteDiagnosticLogs.length === 0}
                  className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-bold text-white/60 active:scale-95 disabled:opacity-35"
                >
                  {t(language, 'settings.clear', '清空')}
                </button>
              </div>

              {visibleQuoteLogs.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/45">
                  {t(language, 'settings.noQuoteErrors', '暂无行情错误')}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleQuoteLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                              log.mode === 'manual-visible'
                                ? 'border border-rose-300/25 bg-rose-300/10 text-rose-200'
                                : 'border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
                            }`}>
                              {log.mode === 'manual-visible' ? '已提示' : '静默'}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/55">
                              {triggerLabel(log.trigger)}
                            </span>
                            {log.count > 1 && (
                              <span className="rounded-full border border-[#f6a524]/20 bg-[#f6a524]/10 px-2 py-0.5 text-[10px] font-black text-[#f6a524]">
                                x{log.count}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 text-sm font-semibold text-white/85">
                            {rootLabel(log.root)} · {log.provider || '未知来源'}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-[10px] tabular-nums text-white/35" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {formatDiagnosticTime(log.lastAt || log.at)}
                        </div>
                      </div>
                      <div className="break-words text-[12px] leading-relaxed text-white/60">
                        {log.message || '--'}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-white/35">
                        <div className="truncate">范围: {log.symbols || '--'}</div>
                        <div className="text-right tabular-nums">HTTP: {log.status || '--'} · {log.durationMs || 0}ms</div>
                      </div>
                      {Array.isArray(log.providerErrors) && log.providerErrors.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                          {log.providerErrors.slice(0, 3).map((item, idx) => (
                            <div key={`${item.symbol}_${idx}`} className="text-[10px] leading-relaxed text-white/40">
                              {item.symbol} · {item.provider}: {item.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 📜 更新日志 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-lg text-white">
                  {t(language, 'settings.changelog', '更新日志')}
                </h2>
                <span className="text-[11px] font-bold tabular-nums text-white/40" style={{ fontFamily: 'ui-monospace, monospace' }}>
                  v10.7.9.301
                </span>
              </div>

              {changelogLoadError ? (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-3 text-[12px] text-rose-200">
                  {t(language, 'settings.changelogLoadFailed', '更新日志加载失败,请稍后重试')}
                </div>
              ) : !Array.isArray(changelog) ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[12px] text-white/45">
                  {t(language, 'settings.changelogLoading', '更新日志加载中...')}
                </div>
              ) : (
                <div>
                  {visibleChangelog.map((log, idx, arr) => (
                    <div
                      key={log.ver}
                      className={`py-3 ${idx !== arr.length - 1 ? 'border-b border-white/10' : ''} ${idx === 0 ? 'pt-0' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-black tabular-nums"
                          style={{
                            fontFamily: 'ui-monospace, monospace',
                            background: log.latest
                              ? 'rgba(52, 211, 153, 0.16)'
                              : 'rgba(246, 165, 36, 0.12)',
                            border: log.latest
                              ? '1px solid rgba(52, 211, 153, 0.24)'
                              : '1px solid rgba(246, 165, 36, 0.18)',
                            color: log.latest ? '#86efac' : '#f6a524',
                          }}
                        >
                          {log.ver}
                        </span>
                        <span className="text-[10px] text-white/35 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {log.date}
                        </span>
                        {log.latest && (
                          <span className="ml-auto rounded border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-emerald-300">
                            {t(language, 'settings.latest', '最新')}
                          </span>
                        )}
                      </div>
                      <ul className="pl-1 space-y-0.5">
                        {log.items.map((item, i) => (
                          <li key={i} className="relative pl-3.5 text-[12px] text-white/65">
                            <span className="absolute left-1 font-bold text-[#f6a524]">·</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {changelog.length > 5 && (
                    <button
                      onClick={() => setChangelogExpanded(!changelogExpanded)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] py-2.5 text-xs font-bold text-[#f6a524] active:scale-95 transition"
                    >
                      {changelogExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          {t(language, 'settings.collapseHistory', '收起 (隐藏 {{count}} 条历史)', { count: changelog.length - 5 })}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          {t(language, 'settings.viewFullHistory', '查看完整历史 (还有 {{rest}} 条 · 共 {{total}} 个版本)', { rest: changelog.length - 5, total: changelog.length })}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 关于 */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h2 className="mb-3 text-lg font-black text-white">{t(language, 'settings.about', '关于 Quote')}</h2>
              <div className="space-y-2 text-sm text-white/60">
                <div className="flex items-center justify-between gap-3">
                  <span>{t(language, 'settings.version', '版本')}</span>
                  <span className="font-semibold tabular-nums text-white/85">v10.7.9.301</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t(language, 'settings.dataSource', '数据源')}</span>
                  <span className="font-semibold text-white/85">EODHD Core + Yahoo Charts</span>
                </div>
              </div>
            </div>
          </div>

    </>
  );
}

export default React.memo(SettingsTab);
