import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildHeaderAssetSnapshot,
  headerAssetBasisKey,
  headerAssetSessionKey,
  readHeaderAssetSnapshot,
  selectHeaderAssetSnapshot,
  writeHeaderAssetSnapshot,
} from './headerAssetSnapshot.js';

function localDateKey(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Presentation only: this hook never writes prices, positions or report inputs.
export function useHeaderAssetSnapshot({
  userId, stockTrades, cashUsd, marginDebtUsd, usdRate,
  ready, currency = 'USD', fxDateKey, quoteRows,
}) {
  const [baselineRows, setBaselineRows] = useState([]);
  const [clock, setClock] = useState(Date.now);
  const lastGood = useRef(null);
  const lastPersisted = useRef('');
  const acceptBaselineQuotes = useCallback((rows, receivedAt = Date.now()) => {
    setBaselineRows((previous) => {
      const bySymbol = new Map(previous.map((row) => [row.symbol, row]));
      for (const row of rows || []) {
        if (row?.source !== 'EODHD' || row.error || !(Number(row.price) > 0)) continue;
        const existing = bySymbol.get(row.symbol);
        if (Number(existing?.headerReceivedAt || 0) > receivedAt) continue;
        bySymbol.set(row.symbol, { ...row, headerReceivedAt: receivedAt });
      }
      return [...bySymbol.values()];
    });
  }, []);

  useEffect(() => {
    // Recheck display eligibility at session/day boundaries and on resume.
    // This performs no requests and does not alter the realtime scheduler.
    const update = () => { if (!document.hidden) setClock(Date.now()); };
    const timer = window.setInterval(update, 15_000);
    window.addEventListener('pageshow', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pageshow', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const now = Date.now();
  // Reuse the existing FX policy's last successfully loaded rate. Its date is
  // the fetch date, not a promise that FX trades daily; midnight alone must not
  // hide a valid header or introduce a new FX request schedule.
  const knownFxRate = /^\d{4}-\d{2}-\d{2}$/.test(fxDateKey || '')
    && fxDateKey <= localDateKey(now) && Number(usdRate) > 0;
  const inputReady = ready === true && (currency !== 'CNY' || knownFxRate);
  const inputs = { userId, stockTrades, cashUsd, marginDebtUsd, usdRate, ready: inputReady };
  const basisKey = headerAssetBasisKey(inputs);
  const sessionKey = headerAssetSessionKey(now);
  const candidate = useMemo(() => buildHeaderAssetSnapshot({
    userId, stockTrades, cashUsd, marginDebtUsd, usdRate,
    ready: inputReady, quoteRows, baselineRows, now: Date.now(),
  }), [userId, stockTrades, cashUsd, marginDebtUsd, usdRate, inputReady, quoteRows, baselineRows, clock]);
  const restored = useMemo(() => readHeaderAssetSnapshot({
    userId, stockTrades, cashUsd, marginDebtUsd, usdRate,
    ready: inputReady, now: Date.now(),
  }), [userId, stockTrades, cashUsd, marginDebtUsd, usdRate, inputReady, sessionKey]);
  // A partial refresh must not replace a complete, validated header.
  const snapshot = selectHeaderAssetSnapshot({
    candidate, previous: lastGood.current, restored, basisKey, sessionKey, ready: inputReady,
  });

  useEffect(() => {
    lastGood.current = snapshot;
    if (!snapshot?.closeDate) return;
    const fingerprint = JSON.stringify([snapshot.basisKey, snapshot.sessionKey, snapshot.summary, snapshot.quotes]);
    if (fingerprint === lastPersisted.current) return;
    if (writeHeaderAssetSnapshot({ snapshot })) lastPersisted.current = fingerprint;
  }, [snapshot]);

  return { snapshot, acceptBaselineQuotes };
}
