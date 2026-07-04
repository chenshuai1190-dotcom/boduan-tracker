// Supabase 客户端
// URL 和 KEY 从 Vite 环境变量读取(VITE_ 前缀的会被打包进前端)
import { createClient } from '@supabase/supabase-js';
import { getPasswordRecoveryRedirectTo, getRecoveryUrlParams } from './authRecovery.js';

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
  const { data: { user } } = await getSupabase().auth.getUser();
  return user;
};

// 登录
export const signIn = async (email, password) => {
  return await getSupabase().auth.signInWithPassword({ email, password });
};

// 注册
export const signUp = async (email, password) => {
  return await getSupabase().auth.signUp({
    email,
    password,
    options: {
      // 注册后默认自动登录,不需要邮件确认
      // 如果开启了邮件确认,这里会需要点邮件链接
    }
  });
};

// 登出
export const signOut = async () => {
  return await getSupabase().auth.signOut();
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
    callback(session?.user || null);
  });
};
