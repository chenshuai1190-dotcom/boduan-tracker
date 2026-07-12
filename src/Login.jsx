import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, User } from 'lucide-react';
import { getRecoveryCallbackError, isRecoveryCallbackLocation } from './lib/authRecovery.js';
import { COMMUNITY_AVATAR_OPTIONS, validateCommunityNickname } from './lib/communityProfile.js';
import { LANGUAGE_STORAGE_KEY, normalizeLanguage, saveStoredLanguage } from './lib/i18n.js';

const loadAuthApi = () => import('./lib/supabase');

const LOGIN_COPY = {
  en: {
    signIn: 'Sign In',
    signUp: 'Sign Up',
    phoneEmail: 'Phone / Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    newPassword: 'New Password',
    inviteCode: 'Invite Code',
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
    requiredConfirmPassword: 'Please confirm your password.',
    requiredInviteCode: 'Please enter your invite code.',
    requiredNewPassword: 'Please enter a new password.',
    shortPassword: 'Password must be at least 6 characters.',
    passwordMismatch: 'Passwords do not match.',
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
    addAccount: 'Add Account',
    quickAccounts: 'Quick accounts',
    switchFailed: 'Account switch failed. Please sign in again.',
    next: 'Next',
    accountStep: 'Account',
    profileStep: 'Community Profile',
    profileStepHint: 'Choose the public identity you will use if you voluntarily join the return contest.',
    communityNickname: 'Community nickname',
    communityNicknamePlaceholder: '2-16 characters',
    communityNicknameRule: '2-16 characters. You can change it later in Settings.',
    chooseAvatar: 'Choose an avatar',
    requiredNickname: 'Please enter a community nickname.',
    invalidNickname: 'Nickname must be 2-16 characters.',
    requiredAvatar: 'Please choose an avatar.',
    backToAccountStep: 'Back to account details',
  },
  zh: {
    signIn: '登录',
    signUp: '注册',
    phoneEmail: '手机号 / 邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    newPassword: '新密码',
    inviteCode: '邀请码',
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
    requiredConfirmPassword: '请再次输入密码',
    requiredInviteCode: '请填写邀请码',
    requiredNewPassword: '请填写新密码',
    shortPassword: '密码至少 6 位',
    passwordMismatch: '两次输入的密码不一致',
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
    addAccount: '添加账户',
    quickAccounts: '快捷账户',
    switchFailed: '账户切换失败，请重新登录',
    next: '下一步',
    accountStep: '账户信息',
    profileStep: '社区资料',
    profileStepHint: '请选择自愿加入收益比赛后用于排行榜展示的公开身份。',
    communityNickname: '社区昵称',
    communityNicknamePlaceholder: '请输入 2-16 个字符',
    communityNicknameRule: '2-16 个字符，之后仍可在设置中修改。',
    chooseAvatar: '选择头像',
    requiredNickname: '请填写社区昵称',
    invalidNickname: '昵称需为 2-16 个字符',
    requiredAvatar: '请选择一个头像',
    backToAccountStep: '返回账户信息',
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

function QuoteLogo() {
  return (
    <img
      src="/quote-logo-login.png"
      alt=""
      aria-hidden="true"
      className="mx-auto h-[92px] w-[92px] rounded-[26px] object-contain shadow-[0_0_34px_rgba(21,183,255,0.20)]"
      draggable="false"
    />
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

export default function Login({
  accountSwitchMode = false,
  onCancelAccountSwitch,
  onSuccess,
  onSwitchRememberedAccount,
  rememberedAccounts = [],
}) {
  const [mode, setMode] = useState('signin');
  const [language, setLanguage] = useState(getInitialLoginLanguage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [signupStep, setSignupStep] = useState(1);
  const [communityNickname, setCommunityNickname] = useState('');
  const [communityAvatarKey, setCommunityAvatarKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [switchingAccountId, setSwitchingAccountId] = useState('');

  const copy = LOGIN_COPY[language] || LOGIN_COPY.en;
  const isAuthMode = mode === 'signin' || mode === 'signup';
  const passwordType = showPassword ? 'text' : 'password';
  const confirmPasswordType = showConfirmPassword ? 'text' : 'password';
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
    if (mode === 'signup') {
      if (!confirmPassword) {
        setError(copy.requiredConfirmPassword);
        return;
      }
      if (password !== confirmPassword) {
        setError(copy.passwordMismatch);
        return;
      }
      if (!inviteCode) {
        setError(copy.requiredInviteCode);
        return;
      }
      if (signupStep === 1) {
        setSignupStep(2);
        return;
      }
      if (!communityNickname.trim()) {
        setError(copy.requiredNickname);
        return;
      }
      const nicknameValidation = validateCommunityNickname(communityNickname);
      if (!nicknameValidation.valid) {
        setError(copy.invalidNickname);
        return;
      }
      if (!communityAvatarKey) {
        setError(copy.requiredAvatar);
        return;
      }
    }
    setLoading(true);

    try {
      const { signIn, signUpWithInvite } = await loadAuthApi();
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
        const nicknameValidation = validateCommunityNickname(communityNickname);
        const { data, error } = await signUpWithInvite(email, password, inviteCode, {
          nickname: nicknameValidation.nickname,
          avatarKey: communityAvatarKey,
        });
        if (error) {
          if (error.message.includes('already registered')) {
            setError(copy.alreadyRegistered);
          } else {
            setError(error.message);
          }
        } else if (data?.user) {
          onSuccess(data.user);
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
    setSignupStep(1);
    setError('');
    setInfo('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const submitLabel = (() => {
    if (loading) return loadingText;
    if (mode === 'signin') return copy.signInNow;
    if (mode === 'signup') return signupStep === 1 ? copy.next : copy.createAccount;
    if (mode === 'forgot') return copy.sendReset;
    return copy.saveNewPassword;
  })();

  const handleFormSubmit = (event) => {
    event.preventDefault();
    if (!loading) handleSubmit();
  };

  const handleRememberedAccount = async (userId) => {
    if (!userId || switchingAccountId || typeof onSwitchRememberedAccount !== 'function') return;
    setError('');
    setInfo('');
    setSwitchingAccountId(userId);
    try {
      await onSwitchRememberedAccount(userId);
    } catch (switchError) {
      setError(switchError?.message || copy.switchFailed);
    } finally {
      setSwitchingAccountId('');
    }
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-[#020714] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(27,80,155,0.18),transparent_44%),linear-gradient(180deg,#050c1a_0%,#020712_58%,#01040b_100%)]" />
      <MarketBackdrop />
      {accountSwitchMode && (
        <button
          type="button"
          onClick={onCancelAccountSwitch}
          className="absolute left-5 top-[calc(env(safe-area-inset-top)+18px)] z-20 flex h-9 items-center gap-2 rounded-full border border-[#274260]/80 bg-[#07101d]/80 px-3 text-[12px] text-[#9dc6ff] backdrop-blur-md active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" /> {copy.backToSignIn}
        </button>
      )}
      <button
        type="button"
        onClick={handleLanguageToggle}
        className="absolute right-5 top-[calc(env(safe-area-inset-top)+18px)] z-20 h-8 min-w-[54px] rounded-full border border-[#274260]/80 bg-[#07101d]/80 px-3 text-[12px] font-normal text-[#9dc6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md active:scale-[0.98]"
        aria-label={copy.switchLanguage}
      >
        {copy.langToggle}
      </button>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-9 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-[calc(env(safe-area-inset-top)+112px)]">
        <section className="text-center">
          <QuoteLogo />
          <h1
            className="mt-[14px] text-[52px] font-normal leading-[58px] tracking-normal text-white"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            Quote
          </h1>
          {accountSwitchMode && <p className="mt-2 text-[13px] text-[#7d8cab]">{copy.addAccount}</p>}
        </section>

        {!accountSwitchMode && mode === 'signin' && rememberedAccounts.length > 0 && (
          <section className="mt-8 rounded-[14px] border border-[#1f304d]/80 bg-[#030a18]/45 p-2.5">
            <div className="px-2 pb-2 pt-1 text-[11px] uppercase tracking-[0.08em] text-[#657594]">{copy.quickAccounts}</div>
            <div className="space-y-1.5">
              {rememberedAccounts.map((account) => (
                <button
                  key={account.userId}
                  type="button"
                  onClick={() => handleRememberedAccount(account.userId)}
                  disabled={Boolean(switchingAccountId)}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-[10px] border border-white/[0.05] bg-white/[0.025] px-3 text-left text-[13px] text-white/75 active:bg-white/[0.06] disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#167fff]/30 to-[#25efe6]/15 text-[#7fc5ff]">
                    <User className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{account.email}</span>
                  {switchingAccountId === account.userId && <Loader2 className="h-4 w-4 animate-spin text-[#2a9dff]" />}
                </button>
              ))}
            </div>
          </section>
        )}

        <form onSubmit={handleFormSubmit} className={mode === 'signup' ? 'mt-[28px]' : (!accountSwitchMode && rememberedAccounts.length > 0 && mode === 'signin' ? 'mt-[28px]' : 'mt-[78px]')}>
          {isAuthMode ? (mode === 'signup' && signupStep === 2 ? (
            <div className="flex min-h-[54px] items-center gap-3 rounded-[9px] border border-[#1f304d]/80 bg-[#030a18]/[0.34] px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                type="button"
                onClick={() => {
                  setSignupStep(1);
                  setError('');
                }}
                disabled={loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#274260]/80 bg-[#07101d]/80 text-[#9dc6ff] active:scale-95"
                aria-label={copy.backToAccountStep}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] text-white/90">{copy.profileStep}</div>
                <div className="mt-0.5 text-[10px] text-[#667797]">2 / 2</div>
              </div>
              <span className="text-[11px] text-[#2a9dff]">{copy.accountStep} ✓</span>
            </div>
          ) : (
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
          )) : (
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

          {mode !== 'newpw' && !(mode === 'signup' && signupStep === 2) && (
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

          {isAuthMode && !(mode === 'signup' && signupStep === 2) && (
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
              {mode === 'signup' && (
                <>
                  <div className="relative mt-[16px]">
                    <Lock className="pointer-events-none absolute left-[22px] top-1/2 h-[21px] w-[21px] -translate-y-1/2 text-[#777794]" />
                    <input
                      type={confirmPasswordType}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      placeholder={copy.confirmPassword}
                      className="h-[58px] w-full appearance-none rounded-[8px] border border-[#1f304d]/90 bg-[#030a18]/[0.36] pl-[58px] pr-[58px] text-[15px] font-normal text-white outline-none transition placeholder:text-[#777794] focus:border-[#1d8dff]/80 focus:bg-[#051024]/[0.72]"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(value => !value)}
                      className="absolute right-[18px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-[#7e83a2] active:scale-95"
                      aria-label={showConfirmPassword ? copy.hidePassword : copy.showPassword}
                      disabled={loading}
                    >
                      {showConfirmPassword ? <EyeOff className="h-[22px] w-[22px]" /> : <Eye className="h-[22px] w-[22px]" />}
                    </button>
                  </div>
                  <div className="relative mt-[16px]">
                    <KeyRound className="pointer-events-none absolute left-[22px] top-1/2 h-[21px] w-[21px] -translate-y-1/2 text-[#777794]" />
                    <input
                      type="text"
                      autoComplete="one-time-code"
                      value={inviteCode}
                      onChange={event => setInviteCode(event.target.value.toUpperCase())}
                      placeholder={copy.inviteCode}
                      className="h-[58px] w-full appearance-none rounded-[8px] border border-[#1f304d]/90 bg-[#030a18]/[0.36] pl-[58px] pr-4 text-[15px] font-normal uppercase tracking-[0.08em] text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[#777794] focus:border-[#1d8dff]/80 focus:bg-[#051024]/[0.72]"
                      disabled={loading}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {mode === 'signup' && signupStep === 2 && (
            <section className="mt-[26px]">
              <p className="text-[12px] leading-5 text-[#75839f]">{copy.profileStepHint}</p>
              <label className="mt-5 block text-[11px] text-[#7786a4]" htmlFor="signup-community-nickname">
                {copy.communityNickname}
              </label>
              <input
                id="signup-community-nickname"
                type="text"
                autoComplete="nickname"
                value={communityNickname}
                onChange={(event) => {
                  setCommunityNickname(event.target.value);
                  setError('');
                }}
                maxLength={16}
                placeholder={copy.communityNicknamePlaceholder}
                className="mt-2 h-[54px] w-full appearance-none rounded-[8px] border border-[#1f304d]/90 bg-[#030a18]/[0.36] px-4 text-[15px] font-normal text-white outline-none transition placeholder:text-[#777794] focus:border-[#1d8dff]/80 focus:bg-[#051024]/[0.72]"
                disabled={loading}
              />
              <p className="mt-2 text-[10px] leading-4 text-[#66728c]">{copy.communityNicknameRule}</p>

              <div className="mb-2.5 mt-5 flex items-center justify-between">
                <p className="text-[11px] text-[#7786a4]">{copy.chooseAvatar}</p>
                <span className="text-[10px] text-[#66728c]">{communityAvatarKey ? '1 / 1' : '0 / 1'}</span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {COMMUNITY_AVATAR_OPTIONS.map((avatar) => {
                  const selected = communityAvatarKey === avatar.key;
                  return (
                    <button
                      key={avatar.key}
                      type="button"
                      onClick={() => {
                        setCommunityAvatarKey(avatar.key);
                        setError('');
                      }}
                      disabled={loading}
                      aria-label={language === 'en' ? avatar.labelEn : avatar.labelZh}
                      aria-pressed={selected}
                      className={`relative aspect-square min-w-0 overflow-hidden rounded-full border bg-[#070a0f] transition active:scale-95 disabled:opacity-60 ${selected ? 'border-[#2a9dff] shadow-[0_0_14px_rgba(42,157,255,0.30)]' : 'border-[#1f304d]/65 opacity-70'}`}
                    >
                      <img src={avatar.src} alt="" className="h-full w-full scale-[1.15] object-cover" draggable={false} />
                      {selected && <span className="absolute inset-x-[30%] bottom-0 h-0.5 rounded-full bg-[#25d8e6]" />}
                    </button>
                  );
                })}
              </div>
            </section>
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
