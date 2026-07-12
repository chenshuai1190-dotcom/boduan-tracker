// Supabase 客户端
// URL 和 KEY 从 Vite 环境变量读取(VITE_ 前缀的会被打包进前端)
import { createClient } from '@supabase/supabase-js';
import { getPasswordRecoveryRedirectTo, getRecoveryUrlParams } from './authRecovery.js';
import {
  getRememberedAccountSession,
  listRememberedAccounts,
  rememberAccountSession,
  removeRememberedAccount,
} from './accountSessionVault.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.error('⚠️ Supabase 配置缺失: 请在 Vercel 环境变量里设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
}

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // 自动记住登录状态
    autoRefreshToken: true,      // 自动刷新过期 token
    detectSessionInUrl: true,    // 支持邮件确认链接
  },
}) : null;

const getSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase 配置缺失: 请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  }
  return supabase;
};

// 检测是否已登录(同步,使用 supabase 内部缓存)
export const isLoggedIn = () => {
  if (!supabase) return false;
  return !!supabase.auth.getSession();
};

// 获取当前用户(异步)
export const getCurrentUser = async () => {
  const client = getSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const { data } = await client.auth.getSession();
    if (data?.session) rememberAccountSession(data.session);
  }
  return user;
};

// 登录
export const signIn = async (email, password) => {
  const result = await getSupabase().auth.signInWithPassword({ email, password });
  if (result.data?.session) rememberAccountSession(result.data.session);
  return result;
};

// 注册
export const signUp = async (email, password) => {
  void email;
  void password;
  return {
    data: null,
    error: {
      message: '注册需要邀请码',
    },
  };
};

export const signUpWithInvite = async (email, password, inviteCode, profile = {}) => {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      inviteCode,
      nickname: profile.nickname,
      avatarKey: profile.avatarKey,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    return {
      data: null,
      error: {
        message: body?.error || '注册失败',
      },
    };
  }
  return await signIn(email, password);
};

// 登出
export const signOut = async () => {
  const client = getSupabase();
  const { data } = await client.auth.getSession();
  const currentUserId = data?.session?.user?.id;
  const result = await client.auth.signOut({ scope: 'local' });
  if (!result.error && currentUserId) removeRememberedAccount(currentUserId);
  return result;
};

export const getRememberedAccounts = () => listRememberedAccounts();

export const forgetRememberedAccount = (userId) => removeRememberedAccount(userId);

export const rememberCurrentAccount = async () => {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) return { error };
  if (data?.session) rememberAccountSession(data.session);
  return { data: { account: data?.session?.user || null }, error: null };
};

export const switchAccount = async (userId) => {
  const client = getSupabase();
  const target = getRememberedAccountSession(userId);
  if (!target) return { data: null, error: new Error('该账户的登录状态已失效，请重新添加账户') };

  const previousResult = await client.auth.getSession();
  const previousSession = previousResult.data?.session || null;
  if (previousSession) rememberAccountSession(previousSession);

  const result = await client.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  const switchedUserId = result.data?.session?.user?.id || result.data?.user?.id;
  if (!result.error && switchedUserId === target.userId && result.data?.session) {
    rememberAccountSession(result.data.session);
    return result;
  }

  const invalidStoredSession = result.error && /refresh token|invalid.*session|session.*not found/i.test(result.error.message || '');
  if (invalidStoredSession || (!result.error && switchedUserId !== target.userId)) {
    removeRememberedAccount(target.userId);
  }

  if (previousSession?.access_token && previousSession?.refresh_token && previousSession.user?.id !== target.userId) {
    const restored = await client.auth.setSession({
      access_token: previousSession.access_token,
      refresh_token: previousSession.refresh_token,
    });
    if (restored.data?.session) rememberAccountSession(restored.data.session);
  }

  return {
    data: null,
    error: result.error || new Error('账户身份校验失败，请重新添加账户'),
  };
};

// 发送重置密码邮件 (忘记密码)
export const resetPassword = async (email) => {
  return await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordRecoveryRedirectTo(),  // 点邮件链接后固定回到生产 App
  });
};

export const exchangeAuthCodeFromUrl = async () => {
  if (typeof window === 'undefined') {
    return { data: null, error: null };
  }

  const code = getRecoveryUrlParams(window.location).get('code');
  if (!code) {
    return { data: null, error: null };
  }

  const sessionResult = await getSupabase().auth.getSession();
  if (sessionResult.data?.session?.access_token) {
    return { data: { session: sessionResult.data.session }, error: null };
  }

  return await getSupabase().auth.exchangeCodeForSession(code);
};

// 更新密码 (已登录时用)
export const updatePassword = async (newPassword) => {
  return await getSupabase().auth.updateUser({ password: newPassword });
};

// 监听登录状态变化(用于自动响应登录/登出)
export const onAuthChange = (callback) => {
  if (!supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return supabase.auth.onAuthStateChange((event, session) => {
    if (session) rememberAccountSession(session);
    callback(session?.user || null);
  });
};
