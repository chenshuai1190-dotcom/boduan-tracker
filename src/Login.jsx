import React, { useState, useEffect } from 'react';
import { LogIn, UserPlus, Loader2, AlertCircle, Mail, Lock, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { signIn, signUp, resetPassword, updatePassword, supabase } from './lib/supabase';

export default function Login({ onSuccess }) {
  // mode: 'signin' | 'signup' | 'forgot' | 'newpw' (点邮件链接后设新密码)
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // 检测是否是从"重置密码"邮件链接点进来的
  // Supabase 会在 URL 里带上 type=recovery
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setMode('newpw');
      setInfo('请设置新密码');
    }
  }, []);

  const handleSubmit = async () => {
    setError('');
    setInfo('');

    // --- 忘记密码: 只需邮箱 ---
    if (mode === 'forgot') {
      if (!email) {
        setError('请填写邮箱');
        return;
      }
      setLoading(true);
      try {
        const { error } = await resetPassword(email);
        if (error) {
          setError(error.message);
        } else {
          setInfo('✓ 重置链接已发送, 请到邮箱查收 (垃圾邮件也看一下)');
        }
      } catch (e) {
        setError(e.message || '发送失败');
      } finally {
        setLoading(false);
      }
      return;
    }

    // --- 设置新密码 (从邮件链接回来) ---
    if (mode === 'newpw') {
      if (!newPassword) {
        setError('请填写新密码');
        return;
      }
      if (newPassword.length < 6) {
        setError('密码至少 6 位');
        return;
      }
      setLoading(true);
      try {
        const { error } = await updatePassword(newPassword);
        if (error) {
          setError(error.message);
        } else {
          setInfo('✓ 密码已更新, 2 秒后自动进入...');
          // 清除 URL 里的 hash 参数
          window.history.replaceState(null, '', window.location.pathname);
          // 获取当前用户并跳转
          setTimeout(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) onSuccess(user);
          }, 2000);
        }
      } catch (e) {
        setError(e.message || '更新失败');
      } finally {
        setLoading(false);
      }
      return;
    }

    // --- 登录 / 注册: 需要邮箱 + 密码 ---
    if (!email || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            setError('邮箱或密码错误');
          } else if (error.message.includes('Email not confirmed')) {
            setError('邮箱未确认, 请检查邮箱完成确认');
          } else {
            setError(error.message);
          }
        } else if (data?.user) {
          onSuccess(data.user);
        }
      } else {
        const { data, error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            setError('该邮箱已注册, 请直接登录');
          } else {
            setError(error.message);
          }
        } else if (data?.user) {
          if (data.session) {
            onSuccess(data.user);
          } else {
            setInfo('注册成功! 请到邮箱点击确认链接, 然后回来登录');
            setMode('signin');
          }
        }
      }
    } catch (e) {
      setError(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 模式切换 (清空错误和成功)
  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfo('');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{
        background: `
          radial-gradient(circle at 0% 0%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.1) 0%, transparent 50%),
          linear-gradient(135deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)
        `,
      }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex w-16 h-16 rounded-2xl items-center justify-center text-3xl font-black mb-3"
            style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0a0a',
              fontFamily: 'ui-monospace, monospace',
              boxShadow: '0 0 40px rgba(251, 191, 36, 0.4)',
            }}
          >
            B
          </div>
          <h1
            className="text-3xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Bottomline
          </h1>
          <p className="text-xs uppercase tracking-widest font-bold mt-1" style={{ color: '#737373' }}>
            BUY THE DIP · STAY DISCIPLINED
          </p>
        </div>

        {/* 主卡片 */}
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {/* 模式标题 */}
          {(mode === 'forgot' || mode === 'newpw') && (
            <div className="flex items-center gap-2 mb-4">
              {mode === 'forgot' && (
                <button
                  onClick={() => switchMode('signin')}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition"
                  disabled={loading}
                >
                  <ArrowLeft className="w-4 h-4 text-slate-600" />
                </button>
              )}
              <h2 className="font-black text-base text-slate-900 flex items-center gap-2">
                {mode === 'forgot' ? (
                  <><KeyRound className="w-5 h-5 text-amber-500" /> 找回密码</>
                ) : (
                  <><CheckCircle2 className="w-5 h-5 text-emerald-500" /> 设置新密码</>
                )}
              </h2>
            </div>
          )}

          {/* 登录/注册 tab 切换 */}
          {(mode === 'signin' || mode === 'signup') && (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
              <button
                onClick={() => switchMode('signin')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mode === 'signin' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                登录
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mode === 'signup' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                注册
              </button>
            </div>
          )}

          {/* 邮箱 (除"设新密码"模式) */}
          {mode !== 'newpw' && (
            <>
              <label className="block text-xs text-slate-500 font-bold mb-1">邮箱</label>
              <div className="relative mb-3">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* 密码 (登录/注册) */}
          {(mode === 'signin' || mode === 'signup') && (
            <>
              <label className="block text-xs text-slate-500 font-bold mb-1">密码 (至少 6 位)</label>
              <div className="relative mb-2">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder="••••••"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                  disabled={loading}
                />
              </div>
              {/* 忘记密码入口 */}
              {mode === 'signin' && (
                <div className="text-right mb-3">
                  <button
                    onClick={() => switchMode('forgot')}
                    className="text-[11px] text-blue-600 font-bold hover:underline active:scale-95 transition"
                    disabled={loading}
                  >
                    忘记密码?
                  </button>
                </div>
              )}
            </>
          )}

          {/* 新密码 (从邮件回来设新密码) */}
          {mode === 'newpw' && (
            <>
              <label className="block text-xs text-slate-500 font-bold mb-1">新密码 (至少 6 位)</label>
              <div className="relative mb-4">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder="至少 6 位"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* 忘记密码模式 - 说明 */}
          {mode === 'forgot' && (
            <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
              <div className="text-[11px] text-blue-700 leading-relaxed">
                填写你注册时的邮箱<br/>
                会收到重置密码的链接
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <span className="text-xs text-red-700">{error}</span>
            </div>
          )}

          {/* 成功提示 */}
          {info && (
            <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-xs text-emerald-700">{info}</span>
            </div>
          )}

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 font-black rounded-xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0a0a',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'signin' ? '登录中...' :
                 mode === 'signup' ? '注册中...' :
                 mode === 'forgot' ? '发送中...' : '更新中...'}
              </>
            ) : (
              <>
                {mode === 'signin' && <><LogIn className="w-4 h-4" />登录</>}
                {mode === 'signup' && <><UserPlus className="w-4 h-4" />创建账户</>}
                {mode === 'forgot' && <><Mail className="w-4 h-4" />发送重置链接</>}
                {mode === 'newpw' && <><CheckCircle2 className="w-4 h-4" />保存新密码</>}
              </>
            )}
          </button>

          {/* 提示文字 */}
          <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
            {mode === 'signup' && '注册后, 你的所有交易记录将云端同步, 任意设备登录都能查看'}
            {mode === 'signin' && '欢迎回来 · 数据已云端备份'}
            {mode === 'forgot' && '收到邮件后, 点击链接回到这里设新密码'}
            {mode === 'newpw' && '设置后会自动登录'}
          </p>
        </div>

        {/* 底部说明 */}
        <p className="text-[10px] text-center mt-5 leading-relaxed" style={{ color: '#525252' }}>
          🔒 数据存储于 Supabase (新加坡节点)<br />
          每个账户的数据独立隔离 · 任何人都无法访问你的数据
        </p>
      </div>
    </div>
  );
}
