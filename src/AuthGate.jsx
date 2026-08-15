import React, { lazy, Suspense, useEffect, useState } from 'react';
import { isRecoveryCallbackLocation } from './lib/authRecovery.js';

const Login = lazy(() => import('./Login.jsx'));
const MainApp = lazy(() => import('./App.jsx'));

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

function isRecoveryRoute() {
  return isRecoveryCallbackLocation(window.location);
}

function isDevVisualPreviewRequested() {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).get('devPreview') === '1';
  } catch {
    return false;
  }
}

function isDevStartupLoadingPreviewRequested() {
  if (!import.meta.env.DEV) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('devPreview') === '1' && params.get('startupLoading') === 'cursor';
  } catch {
    return false;
  }
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
    <div
      className="flex min-h-screen items-center justify-center bg-[#05070b]"
      data-startup-loading="cursor"
    >
      <div className="flex -translate-y-1 flex-col items-center gap-5" role="status" aria-label="Quote loading">
        <div
          className="text-[42px] font-normal leading-none tracking-[-0.035em] text-white/[0.92]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          Quote
        </div>
        <div
          className="h-px w-[92px] overflow-hidden bg-white/[0.11]"
          data-startup-loading-track
          aria-hidden="true"
        >
          <div
            className="quote-startup-glint h-px w-[22px] bg-gradient-to-r from-transparent via-[#e9b65e] to-transparent shadow-[0_0_10px_rgba(233,182,94,0.35)]"
            data-startup-loading-glint
          />
        </div>
      </div>
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
  const [addingAccount, setAddingAccount] = useState(false);
  const [rememberedAccounts, setRememberedAccounts] = useState([]);
  const [authState, setAuthState] = useState(() => ({
    loading: isRecoveryRoute() || hasStoredSupabaseSession(),
    user: null,
    error: null,
  }));

  const refreshRememberedAccounts = async () => {
    const { getRememberedAccounts } = await import('./lib/supabase');
    const accounts = getRememberedAccounts();
    setRememberedAccounts(accounts);
    return accounts;
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    refreshRememberedAccounts().catch(() => setRememberedAccounts([]));
  }, []);

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

  if (import.meta.env.DEV && (!isSupabaseConfigured || isDevVisualPreviewRequested())) {
    if (isDevStartupLoadingPreviewRequested()) {
      return <LoadingScreen />;
    }
    const DevVisualPreview = lazy(() => import('./DevVisualPreview.jsx'));
    return (
      <Suspense fallback={<LoadingScreen />}>
        <DevVisualPreview />
      </Suspense>
    );
  }

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
        <Login
          rememberedAccounts={rememberedAccounts}
          onSwitchRememberedAccount={async (userId) => {
            const { switchAccount } = await import('./lib/supabase');
            const result = await switchAccount(userId);
            if (result.error) throw result.error;
            const user = result.data?.session?.user || result.data?.user;
            if (!user) throw new Error('账户切换失败，请重新登录');
            await refreshRememberedAccounts();
            setAuthState({ loading: false, user, error: null });
          }}
          onSuccess={async (user) => {
            await refreshRememberedAccounts();
            setAuthState({ loading: false, user, error: null });
          }}
        />
      </Suspense>
    );
  }

  if (addingAccount) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Login
          accountSwitchMode
          onCancelAccountSwitch={() => setAddingAccount(false)}
          onSuccess={async (user) => {
            setAddingAccount(false);
            await refreshRememberedAccounts();
            setAuthState({ loading: false, user, error: null });
          }}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <MainApp
        key={authState.user.id}
        user={authState.user}
        accountManager={{
          list: refreshRememberedAccounts,
          switch: async (userId) => {
            const { switchAccount } = await import('./lib/supabase');
            const result = await switchAccount(userId);
            if (result.error) throw result.error;
            const user = result.data?.session?.user || result.data?.user;
            if (!user) throw new Error('账户切换失败，请重新登录');
            await refreshRememberedAccounts();
            setAuthState({ loading: false, user, error: null });
            return user;
          },
          remove: async (userId) => {
            const { forgetRememberedAccount } = await import('./lib/supabase');
            forgetRememberedAccount(userId);
            return refreshRememberedAccounts();
          },
        }}
        onAddAccount={async () => {
          const { rememberCurrentAccount } = await import('./lib/supabase');
          const result = await rememberCurrentAccount();
          if (result.error) throw result.error;
          await refreshRememberedAccounts();
          setAddingAccount(true);
        }}
        onLogout={async () => {
          const { signOut } = await import('./lib/supabase');
          const result = await signOut();
          if (result.error) throw result.error;
          await refreshRememberedAccounts();
          setAuthState({ loading: false, user: null, error: null });
        }}
      />
    </Suspense>
  );
}
