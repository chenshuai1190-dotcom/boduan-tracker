// Supabase 客户端
// URL 和 KEY 从 Vite 环境变量读取(VITE_ 前缀的会被打包进前端)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Supabase 配置缺失: 请在 Vercel 环境变量里设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // 自动记住登录状态
    autoRefreshToken: true,      // 自动刷新过期 token
    detectSessionInUrl: true,    // 支持邮件确认链接
  },
});

// 检测是否已登录(同步,使用 supabase 内部缓存)
export const isLoggedIn = () => {
  return !!supabase.auth.getSession();
};

// 获取当前用户(异步)
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// 登录
export const signIn = async (email, password) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

// 注册
export const signUp = async (email, password) => {
  return await supabase.auth.signUp({
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
  return await supabase.auth.signOut();
};

// 监听登录状态变化(用于自动响应登录/登出)
export const onAuthChange = (callback) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
};
