import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { getRecoveryCallbackError, isRecoveryCallbackLocation } from './lib/authRecovery.js';
import { LANGUAGE_STORAGE_KEY, normalizeLanguage, saveStoredLanguage } from './lib/i18n.js';

const loadAuthApi = () => import('./lib/supabase');

const LOGIN_COPY = {
  en: {
    signIn: 'Sign In',
    signUp: 'Sign Up',
    phoneEmail: 'Phone / Email',
    password: 'Password',
    newPassword: 'New Password',
    forgotPassword: 'Forgot password?',
    signInNow: 'Sign In',
    signUpNow: 'Sign Up Now',
    createAccount: 'Sign Up',
    noAccount: 'No account yet?',
    hasAccount: 'Already have an account?',
    resetPassword: 'Reset Password',
    sendReset: 'Send Reset Link',
    backToSignIn: 'Back to Sign In',
    setNewPassword: 'Set New Password',
    saveNewPassword: 'Save New Password',
    resetHint: 'Enter your email and we will send a reset link.',
    newPasswordHint: 'Create a new password with at least 6 characters.',
    resetSent: 'Reset link sent. Please check your inbox.',
    passwordUpdated: 'Password updated. Signing in...',
    recoveryReady: 'Please set a new password.',
    expiredLink: 'The reset link expired. Please send a new reset link.',
    requiredEmail: 'Please enter your email.',
    requiredPassword: 'Please enter your email and password.',
    requiredNewPassword: 'Please enter a new password.',
    shortPassword: 'Password must be at least 6 characters.',
    invalidLogin: 'Email or password is incorrect.',
    emailNotConfirmed: 'Email is not confirmed. Please check your inbox.',
    alreadyRegistered: 'This email is already registered. Please sign in.',
    sendFailed: 'Failed to send reset link.',
    updateFailed: 'Failed to update password.',
    actionFailed: 'Action failed.',
    loadingSignIn: 'Signing in...',
    loadingSignUp: 'Signing up...',
    loadingForgot: 'Sending...',
    loadingNewPassword: 'Saving...',
    langToggle: '中文',
    switchLanguage: 'Switch to Chinese',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  zh: {
    signIn: '登录',
    signUp: '注册',
    phoneEmail: '手机号 / 邮箱',
    password: '密码',
    newPassword: '新密码',
    forgotPassword: '忘记密码?',
    signInNow: '登录',
    signUpNow: '立即注册',
    createAccount: '注册',
    noAccount: '还没有账户?',
    hasAccount: '已有账户?',
    resetPassword: '找回密码',
    sendReset: '发送重置链接',
    backToSignIn: '返回登录',
    setNewPassword: '设置新密码',
    saveNewPassword: '保存新密码',
    resetHint: '填写邮箱后会收到重置密码链接。',
    newPasswordHint: '请设置至少 6 位的新密码。',
    resetSent: '重置链接已发送,请到邮箱查收。',
    passwordUpdated: '密码已更新,正在登录...',
    recoveryReady: '请设置新密码。',
    expiredLink: '重置链接已失效,请重新发送重置链接。',
    requiredEmail: '请填写邮箱',
    requiredPassword: '请填写邮箱和密码',
    requiredNewPassword: '请填写新密码',
    shortPassword: '密码至少 6 位',
    invalidLogin: '邮箱或密码错误',
    emailNotConfirmed: '邮箱未确认,请检查邮箱完成确认',
    alreadyRegistered: '该邮箱已注册,请直接登录',
    sendFailed: '发送失败',
    updateFailed: '更新失败',
    actionFailed: '操作失败',
    loadingSignIn: '登录中...',
    loadingSignUp: '注册中...',
    loadingForgot: '发送中...',
    loadingNewPassword: '保存中...',
    langToggle: 'EN',
    switchLanguage: 'Switch to English',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
  },
};

function getInitialLoginLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored ? normalizeLanguage(stored) : 'en';
  } catch {
    return 'en';
  }
}

function ChartLogo() {
  return (
    <div className="relative mx-auto flex h-[78px] w-[78px] items-center justify-center rounded-[22px] border border-[#284064]/80 bg-[#07101f]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_32px_rgba(21,183,255,0.16)]">
      <div className="absolute inset-[1px] rounded-[21px] bg-[radial-gradient(circle_at_30%_20%,rgba(39,218,255,0.18),transparent_48%),linear-gradient(145deg,rgba(255,255,255,0.08),transparent_40%)]" />
      <svg
        viewBox="0 0 84 84"
        aria-hidden="true"
        className="relative h-[58px] w-[58px]"
        fill="none"
      >
        <g strokeLinecap="round">
          <path d="M14 59L27 48L38 54L52 35L64 43L72 28" stroke="#16a4ff" strokeWidth="5" />
          <path d="M14 65L27 54L39 59L53 40L65 49L76 35" stroke="#23e0ff" strokeWidth="3" opacity="0.96" />
          <path d="M72 28V42M72 28H58" stroke="#33f7f1" strokeWidth="4" />
        </g>
        <g>
          <rect x="21" y="32" width="9" height="21" rx="1.5" fill="#218cff" />
          <rect x="36" y="24" width="9" height="25" rx="1.5" fill="#2fc7ff" />
          <rect x="51" y="15" width="9" height="28" rx="1.5" fill="#35f3e4" />
          <path d="M25.5 26V59M40.5 18V55M55.5 8V50" stroke="#7beeff" strokeWidth="2" opacity="0.62" />
        </g>
      </svg>
    </div>
  );
}

function MarketBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute right-[-10px] top-[118px] h-[220px] w-[230px] opacity-[0.16]"
      viewBox="0 0 230 220"
      fill="none"
    >
      <path d="M6 182C34 154 44 168 67 130C92 89 112 117 137 76C157 44 185 53 220 16" stroke="#1f8fff" strokeWidth="1.4" opacity="0.34" />
      <path d="M14 202C47 174 60 188 84 144C102 111 127 121 148 93C169 65 190 69 226 35" stroke="#2df2f0" strokeWidth="1" opacity="0.18" />
      {[26, 50, 73, 98, 123, 148, 173, 198].map((x, index) => {
        const y = [160, 139, 129, 102, 88, 64, 45, 25][index];
        const h = [34, 48, 38, 54, 44, 58, 50, 66][index];
        return (
          <g key={x} opacity={0.72 - index * 0.035}>
            <path d={`M${x + 5} ${y - 15}V${y + h + 14}`} stroke="#2c71bb" strokeWidth="1.3" />
            <rect x={x} y={y} width="12" height={h} rx="1.8" fill={index % 3 === 0 ? '#21d5ff' : '#3568a8'} />
          </g>
        );
      })}
    </svg>
  );
}

function InlineMessage({ type, text }) {
  if (!text) return null;
  const success = type === 'success';
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-[12px] border px-3 py-2.5 text-[12px] leading-[17px] ${
      success
        ? 'border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100'
        : 'border-red-300/20 bg-red-400/[0.08] text-red-100'
    }`}>
      {success ? (
        <CheckCircle2 className="mt-[1px] h-4 w-4 shrink-0 text-cyan-300" />
      ) : (
        <AlertCircle className="mt-[1px] h-4 w-4 shrink-0 text-red-300" />
      )}
      <span>{text}</span>
    </div>
  );
}

export default function Login({ onSuccess }) {
  const [mode, setMode] = useState('signin');
  const [language, setLanguage] = useState(getInitialLoginLanguage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const copy = LOGIN_COPY[language] || LOGIN_COPY.en;
  const isAuthMode = mode === 'signin' || mode === 'signup';
  const passwordType = showPassword ? 'text' : 'password';
  const newPasswordType = showNewPassword ? 'text' : 'password';

  const loadingText = useMemo(() => {
    if (mode === 'signin') return copy.loadingSignIn;
    if (mode === 'signup') return copy.loadingSignUp;
    if (mode === 'forgot') return copy.loadingForgot;
    return copy.loadingNewPassword;
  }, [copy, mode]);

  useEffect(() => {
    const recoveryError = getRecoveryCallbackError(window.location);
    if (recoveryError) {
      setMode('forgot');
      setError(copy.expiredLink);
      window.history.replaceState(null, '', window.location.pathname || '/');
      return;
    }

    if (isRecoveryCallbackLocation(window.location)) {
      setMode('newpw');
      setInfo(copy.recoveryReady);
    }
  }, []);

  const handleLanguageToggle = () => {
    const next = language === 'en' ? 'zh' : 'en';
    setLanguage(saveStoredLanguage(next));
    setError('');
    setInfo('');
  };

  const handleSubmit = async () => {
    setError('');
    setInfo('');

    if (mode === 'forgot') {
      if (!email) {
        setError(copy.requiredEmail);
        return;
      }
      setLoading(true);
      try {
        const { resetPassword } = await loadAuthApi();
        const { error } = await resetPassword(email);
        if (error) {
          setError(error.message);
        } else {
          setInfo(copy.resetSent);
        }
      } catch (e) {
        setError(e.message || copy.sendFailed);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'newpw') {
      if (!newPassword) {
        setError(copy.requiredNewPassword);
        return;
      }
      if (newPassword.length < 6) {
        setError(copy.shortPassword);
        return;
      }
      setLoading(true);
      try {
        const { exchangeAuthCodeFromUrl, updatePassword, getCurrentUser } = await loadAuthApi();
        const exchangeResult = await exchangeAuthCodeFromUrl();
        if (exchangeResult?.error) {
          setMode('forgot');
          setError(copy.expiredLink);
          return;
        }

        const { error } = await updatePassword(newPassword);
        if (error) {
          if ((error.message || '').toLowerCase().includes('session')) {
            setMode('forgot');
            setError(copy.expiredLink);
          } else {
            setError(error.message);
          }
        } else {
          setInfo(copy.passwordUpdated);
          window.history.replaceState(null, '', window.location.pathname);
          setTimeout(async () => {
            const user = await getCurrentUser();
            if (user) onSuccess(user);
          }, 2000);
        }
      } catch (e) {
        setError(e.message || copy.updateFailed);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) {
      setError(copy.requiredPassword);
      return;
    }
    if (password.length < 6) {
      setError(copy.shortPassword);
      return;
    }
    setLoading(true);

    try {
      const { signIn, signUp } = await loadAuthApi();
      if (mode === 'signin') {
        const { data, error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            setError(copy.invalidLogin);
          } else if (error.message.includes('Email not confirmed')) {
            setError(copy.emailNotConfirmed);
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
            setError(copy.alreadyRegistered);
          } else {
            setError(error.message);
          }
        } else if (data?.user) {
          if (data.session) {
            onSuccess(data.user);
          } else {
            setInfo(language === 'en'
              ? 'Account created. Please confirm your email, then sign in.'
              : '注册成功! 请到邮箱点击确认链接,然后回来登录');
            setMode('signin');
          }
        }
      }
    } catch (e) {
      setError(e.message || copy.actionFailed);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfo('');
  };

  const submitLabel = (() => {
    if (loading) return loadingText;
    if (mode === 'signin') return copy.signInNow;
    if (mode === 'signup') return copy.createAccount;
    if (mode === 'forgot') return copy.sendReset;
    return copy.saveNewPassword;
  })();

  const handleFormSubmit = (event) => {
    event.preventDefault();
    if (!loading) handleSubmit();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020714] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(27,80,155,0.18),transparent_44%),linear-gradient(180deg,#050c1a_0%,#020712_58%,#01040b_100%)]" />
      <MarketBackdrop />
      <button
        type="button"
        onClick={handleLanguageToggle}
        className="absolute right-5 top-[calc(env(safe-area-inset-top)+18px)] z-20 h-8 min-w-[54px] rounded-full border border-[#274260]/80 bg-[#07101d]/80 px-3 text-[12px] font-normal text-[#9dc6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md active:scale-[0.98]"
        aria-label={copy.switchLanguage}
      >
        {copy.langToggle}
      </button>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-9 pb-[calc(env(safe-area-inset-bottom)+26px)] pt-[calc(env(safe-area-inset-top)+142px)]">
        <section className="text-center">
          <ChartLogo />
          <h1
            className="mt-[14px] text-[52px] font-normal leading-[58px] tracking-normal text-white"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            Quote
          </h1>
        </section>

        <form onSubmit={handleFormSubmit} className="mt-[78px]">
          {isAuthMode ? (
            <div className="relative grid h-[54px] grid-cols-2 overflow-hidden rounded-[9px] border border-[#1f304d]/80 bg-[#030a18]/[0.34] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                disabled={loading}
                className={`relative text-[15px] font-normal transition ${mode === 'signin' ? 'text-[#2a9dff]' : 'text-[#8d8aa2]'}`}
              >
                {copy.signIn}
                {mode === 'signin' && (
                  <span className="absolute bottom-[-1px] left-1/2 h-[2px] w-[72px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#167fff] to-[#25efe6]" />
                )}
              </button>
              <div className="absolute left-1/2 top-[14px] h-[26px] w-px bg-[#182640]" />
              <button
                type="button"
                onClick={() => switchMode('signup')}
                disabled={loading}
                className={`relative text-[15px] font-normal transition ${mode === 'signup' ? 'text-[#2a9dff]' : 'text-[#8d8aa2]'}`}
              >
                {copy.signUp}
                {mode === 'signup' && (
                  <span className="absolute bottom-[-1px] left-1/2 h-[2px] w-[72px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#167fff] to-[#25efe6]" />
                )}
              </button>
            </div>
          ) : (
            <div className="mb-7 flex items-center gap-3">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#203653] bg-[#06101f]/[0.82] text-[#92a0bd] active:scale-95"
                aria-label={copy.backToSignIn}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-[18px] font-normal leading-6 text-white">
                  {mode === 'forgot' ? copy.resetPassword : copy.setNewPassword}
                </h2>
                <p className="mt-1 text-[12px] font-normal leading-4 text-[#6f7895]">
                  {mode === 'forgot' ? copy.resetHint : copy.newPasswordHint}
                </p>
              </div>
            </div>
          )}

          {mode !== 'newpw' && (
            <div className="relative mt-[34px]">
              <User className="pointer-events-none absolute left-[22px] top-1/2 h-[22px] w-[22px] -translate-y-1/2 text-[#777794]" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder={copy.phoneEmail}
                className="h-[58px] w-full appearance-none rounded-[8px] border border-[#1f304d]/90 bg-[#030a18]/[0.36] pl-[58px] pr-4 text-[15px] font-normal text-white outline-none transition placeholder:text-[#777794] focus:border-[#1d8dff]/80 focus:bg-[#051024]/[0.72]"
                disabled={loading}
              />
            </div>
          )}

          {isAuthMode && (
            <>
              <div className="relative mt-[22px]">
                <Lock className="pointer-events-none absolute left-[22px] top-1/2 h-[21px] w-[21px] -translate-y-1/2 text-[#777794]" />
                <input
                  type={passwordType}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder={copy.password}
                  className="h-[58px] w-full appearance-none rounded-[8px] border border-[#1f304d]/90 bg-[#030a18]/[0.36] pl-[58px] pr-[58px] text-[15px] font-normal text-white outline-none transition placeholder:text-[#777794] focus:border-[#1d8dff]/80 focus:bg-[#051024]/[0.72]"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  className="absolute right-[18px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-[#7e83a2] active:scale-95"
                  aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-[22px] w-[22px]" /> : <Eye className="h-[22px] w-[22px]" />}
                </button>
              </div>
              {mode === 'signin' && (
                <div className="mt-[13px] text-right">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[13px] font-normal leading-5 text-[#1688ff] active:scale-[0.98]"
                    disabled={loading}
                  >
                    {copy.forgotPassword}
                  </button>
                </div>
              )}
            </>
          )}

          {mode === 'newpw' && (
            <div className="relative mt-[22px]">
              <Lock className="pointer-events-none absolute left-[22px] top-1/2 h-[21px] w-[21px] -translate-y-1/2 text-[#777794]" />
              <input
                type={newPasswordType}
                autoComplete="new-password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                placeholder={copy.newPassword}
                className="h-[58px] w-full appearance-none rounded-[8px] border border-[#1f304d]/90 bg-[#030a18]/[0.36] pl-[58px] pr-[58px] text-[15px] font-normal text-white outline-none transition placeholder:text-[#777794] focus:border-[#1d8dff]/80 focus:bg-[#051024]/[0.72]"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(value => !value)}
                className="absolute right-[18px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-[#7e83a2] active:scale-95"
                aria-label={showNewPassword ? copy.hidePassword : copy.showPassword}
                disabled={loading}
              >
                {showNewPassword ? <EyeOff className="h-[22px] w-[22px]" /> : <Eye className="h-[22px] w-[22px]" />}
              </button>
            </div>
          )}

          <InlineMessage type="error" text={error} />
          <InlineMessage type="success" text={info} />

          <button
            type="submit"
            disabled={loading}
            className="mt-[37px] flex h-[58px] w-full items-center justify-center rounded-[7px] bg-gradient-to-r from-[#0b7dff] to-[#18d2d5] text-[17px] font-normal text-white shadow-[0_16px_36px_rgba(0,147,255,0.22)] transition active:scale-[0.99] disabled:opacity-70"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>

          {isAuthMode && (
            <p className="mt-[41px] text-center text-[13px] font-normal leading-5 text-[#797b91]">
              {mode === 'signin' ? copy.noAccount : copy.hasAccount}{' '}
              <button
                type="button"
                className="text-[#1688ff] active:scale-[0.98]"
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                disabled={loading}
              >
                {mode === 'signin' ? copy.signUpNow : copy.signInNow}
              </button>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
