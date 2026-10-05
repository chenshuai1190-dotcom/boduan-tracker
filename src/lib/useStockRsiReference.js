import { normalizeStrictUserStockSymbol } from './symbols.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { canReuseStockRsiReference, loadStockRsiReference, normalizeStockRsiQuote, stockRsiTradeDateReason } from './stockRsiReference.js';
import { deriveStockTradeMarketReference } from './stockTradeMarketReference.js';

const empty = (status = 'idle', reason = '') => ({ observation: null, quote: null, status, reason });
const matchingQuote = (quote, symbol) => quote?.symbol === symbol && !quote.error && quote.stale !== true ? quote : null;

export function useStockRsiReference({ active = true, symbol, userId, authClient, tradeDate, quote,
  requestDelayMs = 0, requireMarketReference = false } = {}) {
  const selectedSymbol = normalizeStrictUserStockSymbol(symbol);
  const [authRevision, setAuthRevision] = useState(0);
  const [result, setResult] = useState(null);
  const quoteRef = useRef(quote);
  quoteRef.current = quote;
  const scope = useMemo(() => ({ controller: new AbortController(), attempted: false, disposed: false,
    revoked: false, authenticated: false, generation: 0, token: '' }), [active, selectedSymbol, userId, authClient, authRevision, requireMarketReference]);
  const dateReason = active ? stockRsiTradeDateReason(tradeDate) : '';

  useEffect(() => {
    // React development replay creates a fresh request within the same memoized
    // scope; the generation also rejects fetch implementations that ignore abort.
    if (scope.disposed) {
      scope.controller = new AbortController(); scope.attempted = false;
      scope.disposed = false; scope.revoked = false; scope.authenticated = false; scope.token = '';
    }
    if (!active || !selectedSymbol || !authClient?.getSession || !userId) return undefined;
    const subscription = authClient.onAuthStateChange?.((event, session) => {
      if (scope.disposed) return;
      const token = session?.access_token || '';
      const sameUser = session?.user?.id === userId && Boolean(token);
      if (sameUser && (!scope.token || scope.token === token)) return;
      scope.revoked = true;
      scope.authenticated = false;
      scope.generation += 1;
      scope.controller.abort();
      setResult({ scope, ...empty('unavailable', 'auth-required') });
      // Token refresh starts a new credential scope, without a polling loop.
      // A different identity waits for the parent to pass its new userId.
      if (sameUser && event !== 'SIGNED_OUT') setAuthRevision(value => value + 1);
    })?.data?.subscription;
    return () => {
      scope.disposed = true;
      scope.generation += 1;
      scope.controller.abort();
      subscription?.unsubscribe();
    };
  }, [active, authClient, scope, selectedSymbol, userId]);

  useEffect(() => {
    if (!active || !selectedSymbol || dateReason || scope.disposed || scope.revoked || scope.attempted) return;
    if (!userId || !authClient?.getSession) {
      setResult({ scope, ...empty('unavailable', 'auth-required') });
      return;
    }
    setResult({ scope, ...empty('loading') });
    const startRequest = () => {
      if (scope.disposed || scope.revoked || scope.attempted) return;
      scope.attempted = true;
      const generation = scope.generation;
      const getSession = async () => {
        const value = await authClient.getSession();
        if (!scope.token) scope.token = value?.data?.session?.access_token || '';
        if (!scope.disposed && !scope.revoked && generation === scope.generation) {
          const session = value?.data?.session;
          scope.authenticated = !value?.error && session?.user?.id === userId
            && typeof session?.access_token === 'string' && Boolean(session.access_token.trim());
        }
        return value;
      };
      loadStockRsiReference({ symbol: selectedSymbol, userId, getSession, quote: () => quoteRef.current, tradeDate,
        requireMarketReference, signal: scope.controller.signal }).then(value => {
        if (!scope.disposed && !scope.revoked && generation === scope.generation) setResult({ scope, ...value });
      }).catch(error => {
        if (!scope.disposed && !scope.revoked && generation === scope.generation) {
          if (error.code === 'AUTH_REQUIRED') scope.authenticated = false;
          setResult({ scope, ...empty('unavailable', error.code === 'AUTH_REQUIRED' ? 'auth-required' : 'network-error') });
        }
      });
    };
    // Debounce ticker edits, not quote ticks: a busy symbol must not keep
    // postponing a missing-market-field request. The loader reads the latest ref.
    const cachedReady = canReuseStockRsiReference(quoteRef.current, { symbol: selectedSymbol, tradeDate, requireMarketReference });
    const delay = cachedReady ? 0 : Math.max(0, Number.isFinite(requestDelayMs) ? requestDelayMs : 0);
    if (!delay) {
      startRequest();
      return undefined;
    }
    const timer = setTimeout(startRequest, delay);
    return () => clearTimeout(timer);
  }, [active, authClient, dateReason, requestDelayMs, requireMarketReference, scope, selectedSymbol, tradeDate, userId]);

  if (!active) return empty();
  if (!selectedSymbol) return empty('unavailable', 'data-unavailable');
  if (dateReason) return empty('unavailable', dateReason);
  if (!userId || !authClient?.getSession || scope.revoked) return empty('unavailable', 'auth-required');
  if (result?.scope !== scope) return empty('loading');
  // Revalidate against the date input and current completed session on every
  // render. A later qualified baseline may recover a network failure without
  // another request, but may never bypass this scope's authentication check.
  const updated = normalizeStockRsiQuote(quote, { symbol: selectedSymbol, tradeDate });
  if (!scope.authenticated) return empty(result.status, result.reason);
  const cachedQuote = matchingQuote(quote, selectedSymbol);
  const fetchedQuote = matchingQuote(result.quote, selectedSymbol);
  // Choose market data independently of RSI: an RSI-ready cache can omit the
  // 52-week field, and must not mask the complete modal-scoped response.
  const preferCachedQuote = updated.status === 'ready' && (!requireMarketReference
    || deriveStockTradeMarketReference({ symbol: selectedSymbol, quote: cachedQuote }).stockReady);
  const currentQuote = preferCachedQuote ? cachedQuote : fetchedQuote || cachedQuote;
  if (updated.status === 'ready') return { ...updated, quote: currentQuote };
  // A valid same-symbol quote can still support the market reference when its
  // RSI history is insufficient. Keep it local to this authenticated scope.
  if (result.status !== 'ready') return { ...empty(result.status, result.reason), quote: currentQuote };
  return { ...normalizeStockRsiQuote(result.quote, { symbol: selectedSymbol, tradeDate }), quote: currentQuote };
}
