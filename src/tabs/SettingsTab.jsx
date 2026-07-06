import React from 'react';
import { normalizeLanguage, t } from '../lib/i18n.js';

export default function SettingsTab({ ctx }) {
  const {
    changelogExpanded,
    ChevronDown,
    ChevronUp,
    clearQuoteDiagnosticLogs,
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
  const triggerLabel = (trigger) => ({
    'auto-start': '自动启动',
    'auto-interval': '自动轮询',
    'auto-visible': '回到前台',
    'manual-button': '手动刷新',
    'manual-pull-refresh': '下拉刷新',
  }[trigger] || trigger || '未知触发');
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

  const visibleChangelog = Array.isArray(changelog)
    ? (changelogExpanded ? changelog : changelog.slice(0, 5))
    : [];

  return (
    <>

          <div className="space-y-4 text-white">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">X MONEY</div>
                  <h1 className="mt-1 text-[22px] font-black tracking-normal text-white">{t(language, 'settings.title', '设置')}</h1>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-[#f6a524]">
                  v10.7.9.173
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
                  v10.7.9.173
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
              <h2 className="mb-3 text-lg font-black text-white">{t(language, 'settings.about', '关于 X MONEY')}</h2>
              <div className="space-y-2 text-sm text-white/60">
                <div className="flex items-center justify-between gap-3">
                  <span>{t(language, 'settings.version', '版本')}</span>
                  <span className="font-semibold tabular-nums text-white/85">v10.7.9.173</span>
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
