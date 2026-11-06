import { useEffect, useMemo, useState } from 'react';
import { getVixComparisonExpectedCloseDate, loadVixComparison } from './vixComparison.js';
import { stockRsiTradeDateReason } from './stockRsiReference.js';
import { deriveTradeVixRatioReference } from './tradeVixRatioReference.js';

// Buy-dialog only. The existing loader owns authenticated daily caching,
// in-flight deduplication and bounded retries; no ticker or price dependencies.
export function useTradeVixRatioReference({ active = false, userId, authClient, tradeDate } = {}) {
  const [result, setResult] = useState(null);
  const [authRevision, setAuthRevision] = useState(0);
  const expectedDate = getVixComparisonExpectedCloseDate();
  const dateReason = stockRsiTradeDateReason(tradeDate);
  const scope = useMemo(() => ({ revoked: false }), [active, userId, authClient, tradeDate, expectedDate, authRevision]);

  useEffect(() => {
    if (!active || dateReason || !userId || !authClient?.getSession) return undefined;
    let disposed = false;
    scope.revoked = false;
    setResult(null);
    const subscription = authClient.onAuthStateChange?.((event, session) => {
      if (disposed) return;
      if (session?.user?.id !== userId || !session?.access_token) {
        scope.revoked = true;
        setResult(null);
      } else if (scope.revoked || event === 'TOKEN_REFRESHED') {
        scope.revoked = true;
        setResult(null);
        setAuthRevision(value => value + 1);
      }
    })?.data?.subscription;
    loadVixComparison({ userId, getSession: () => authClient.getSession() })
      .then(data => { if (!disposed && !scope.revoked) setResult({ scope, data }); })
      .catch(() => { if (!disposed && !scope.revoked) setResult(null); });
    return () => { disposed = true; subscription?.unsubscribe(); };
  }, [active, authClient, dateReason, scope, userId]);

  const data = active && !dateReason && !scope.revoked && result?.scope === scope ? result.data : null;
  return deriveTradeVixRatioReference({ data, tradeDate });
}
