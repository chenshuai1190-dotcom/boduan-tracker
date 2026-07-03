import React, { lazy, Suspense, useEffect, useState } from 'react';

const Login = lazy(() => import('./Login.jsx'));
const MainApp = lazy(() => import('./App.jsx'));

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

function isRecoveryRoute() {
  return (window.location.hash || '').includes('type=recovery');
}

function getSupabaseProjectRef() {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

function hasStoredSupabaseSession() {
  try {
    const projectRef = getSupabaseProjectRef();
    const sessionKeys = projectRef
      ? [`sb-${projectRef}-auth-token`]
      : Object.keys(localStorage).filter(key => key.startsWith('sb-') && key.endsWith('-auth-token'));

    return sessionKeys.some(key => {
      const raw = localStorage.getItem(key);
      return raw && raw.includes('access_token');
    });
  } catch {
    return false;
  }
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
    </div>
  );
}

function ConfigMissingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-slate-900 p-5 shadow-2xl">
        <div className="w-10 h-10 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center mb-4">
          <span className="text-xl font-black">!</span>
        </div>
        <h1 className="text-xl font-black mb-2">Supabase 配置缺失</h1>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          请先复制 `.env.example` 为 `.env.local`,并填写以下变量后重新启动开发服务器。
        </p>
        <div className="rounded-xl bg-black/40 border border-white/10 p-3 text-xs font-mono text-amber-100 space-y-1">
          <div>VITE_SUPABASE_URL</div>
          <div>VITE_SUPABASE_ANON_KEY</div>
          <div>EODHD_API_KEY</div>
        </div>
      </div>
    </div>
  );
}

export default function AuthGate() {
  const [isRecovery, setIsRecovery] = useState(() => isRecoveryRoute());
  const [authState, setAuthState] = useState(() => ({
    loading: isRecoveryRoute() || hasStoredSupabaseSession(),
    user: null,
    error: null,
  }));

  useEffect(() => {
    const shouldInitAuth = authState.loading || !!authState.user || isRecovery;
    if (!isSupabaseConfigured || !shouldInitAuth) return undefined;

    let mounted = true;
    let unsubscribe = null;

    (async () => {
      try {
        const { getCurrentUser, onAuthChange } = await import('./lib/supabase');
        const user = await getCurrentUser();
        if (!mounted) return;

        setAuthState({ loading: false, user, error: null });
        const { data: { subscription } } = onAuthChange(nextUser => {
          if (mounted) setAuthState(state => ({ ...state, user: nextUser }));
        });
        unsubscribe = () => subscription?.unsubscribe();
      } catch (e) {
        if (mounted) {
          setAuthState({ loading: false, user: null, error: e.message || '认证初始化失败' });
        }
      }
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [authState.loading, authState.user?.id, isRecovery]);

  if (!isSupabaseConfigured) {
    return <ConfigMissingScreen />;
  }

  if (authState.loading) {
    return <LoadingScreen />;
  }

  if (authState.error && !authState.user) {
    console.error('[AuthGate] auth init failed:', authState.error);
  }

  if (isRecovery) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Login
          onSuccess={(user) => {
            setIsRecovery(false);
            setAuthState({ loading: false, user, error: null });
          }}
        />
      </Suspense>
    );
  }

  if (!authState.user) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Login onSuccess={(user) => setAuthState({ loading: false, user, error: null })} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <MainApp
        user={authState.user}
        onLogout={async () => {
          const { signOut } = await import('./lib/supabase');
          await signOut();
          setAuthState({ loading: false, user: null, error: null });
        }}
      />
    </Suspense>
  );
}
