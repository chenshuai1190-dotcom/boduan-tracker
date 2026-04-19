import React, { useState } from 'react';
import { LogIn, UserPlus, Loader2, AlertCircle, Mail, Lock } from 'lucide-react';
import { signIn, signUp } from './lib/supabase';

export default function Login({ onSuccess }) {
  const [mode, setMode] = useState('signin');  // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            setError('邮箱或密码错误');
          } else if (error.message.includes('Email not confirmed')) {
            setError('邮箱未确认,请检查邮箱完成确认');
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
            setError('该邮箱已注册,请直接登录');
          } else {
            setError(error.message);
          }
        } else if (data?.user) {
          // Supabase 默认开启邮件确认,需要点确认链接才能登录
          // 如果用户在 Supabase Dashboard 关闭了 email confirmation,则会立即登录
          if (data.session) {
            onSuccess(data.user);
          } else {
            setInfo('注册成功!请到邮箱点击确认链接,然后回来登录');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 items-center justify-center text-3xl font-black text-white shadow-2xl mb-3">
            B
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Bottomline</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mt-1">
            BUY THE DIP · STAY DISCIPLINED
          </p>
        </div>

        {/* 主卡片 */}
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {/* tab 切换 */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
            <button
              onClick={() => { setMode('signin'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mode === 'signin' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              登录
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mode === 'signup' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              注册
            </button>
          </div>

          {/* 邮箱 */}
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

          {/* 密码 */}
          <label className="block text-xs text-slate-500 font-bold mb-1">密码 (至少 6 位)</label>
          <div className="relative mb-4">
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
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'signin' ? '登录中...' : '注册中...'}
              </>
            ) : (
              <>
                {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {mode === 'signin' ? '登录' : '创建账户'}
              </>
            )}
          </button>

          {/* 提示文字 */}
          <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
            {mode === 'signup'
              ? '注册后,你的所有交易记录将云端同步,任意设备登录都能查看'
              : '欢迎回来 · 数据已云端备份'}
          </p>
        </div>

        {/* 底部说明 */}
        <p className="text-[10px] text-slate-500 text-center mt-5 leading-relaxed">
          🔒 数据存储于 Supabase (新加坡节点)<br />
          每个账户的数据独立隔离 · 任何人都无法访问你的数据
        </p>
      </div>
    </div>
  );
}
