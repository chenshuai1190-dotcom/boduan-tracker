import React from 'react';
import DrawdownObservation from '../components/DrawdownObservation.jsx';
import { buildObservationUniverse, deriveObservation } from '../lib/drawdownObservationModel.js';
import { loadDrawdownObservation } from '../lib/drawdownObservationHistory.js';
import { getDrawdownSnapshot, beginDrawdownCacheRequest, storeDrawdownHistory, recordDrawdownFailure, shouldRefreshDrawdown, clearDrawdownObservationCache, getDrawdownViewState, setDrawdownViewState } from '../lib/drawdownObservationCache.js';
import { verifyDrawdownObservationSession } from '../lib/drawdownObservationSession.js';
import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';

function preferredHistory(cached, live) {
  if (!live?.points?.length) return cached?.status === 'loading' && live?.status === 'error' ? live : cached;
  if (!cached?.points?.length) return live;
  return cached.asOfDate > live.asOfDate || (cached.asOfDate === live.asOfDate && Date.parse(cached.fetchedAt) > Date.parse(live.fetchedAt)) ? cached : live;
}

// Read-only history is cached per authenticated user; membership always comes
// from the current inputs, never from persisted positions or a previous screen.
export default function DrawdownObservationPage({ ctx = {}, previewSource = null }) {
  const { userId = '', watchlist = [], positions = [], portfolioReady = true, portfolioError = '', closeDrawdownObservation } = ctx;
  const universeKey = JSON.stringify(buildObservationUniverse({ watchlist, positions: portfolioReady && !portfolioError ? positions : [] }));
  const instruments = React.useMemo(() => JSON.parse(universeKey), [universeKey]);
  const key = `${userId}:${universeKey}`;
  const [refresh, setRefresh] = React.useState({ key: '', tick: 0 });
  const [state, setState] = React.useState({ key: '', revision: 0, busy: false, invalid: false, error: '' });
  const sequenceRef = React.useRef(0);
  const renderKeyRef = React.useRef(key);
  const consumedRefreshRef = React.useRef(0);
  const sessionRef = React.useRef(null);
  // Storage is bounded; the currently visible universe must not lose successful
  // rows just because a 65th instrument evicts one of the 64 persisted entries.
  const liveRef = React.useRef({ userId, rows: new Map() });
  if (liveRef.current.userId !== userId) liveRef.current = { userId, rows: new Map() };
  const membership = new Set(instruments.map(item => item.symbol));
  for (const symbol of liveRef.current.rows.keys()) if (!membership.has(symbol)) liveRef.current.rows.delete(symbol);
  renderKeyRef.current = key;
  const loadHistory = import.meta.env.DEV ? previewSource?.load : undefined;
  const verifySession = import.meta.env.DEV && previewSource?.verifySession ? previewSource.verifySession : verifyDrawdownObservationSession;
  const readSnapshot = React.useMemo(() => () => {
    const cached = getDrawdownSnapshot({ userId, instruments });
    const expected = getInvestmentComparisonExpectedCloseDate();
    return { ...cached, instruments: cached.instruments.map((item, index) => {
      const preferred = preferredHistory(item, liveRef.current.rows.get(item.symbol));
      const sameHistory = item.points?.length && item.asOfDate === preferred.asOfDate && item.fetchedAt === preferred.fetchedAt;
      const metadata = sameHistory ? item : preferred;
      const stale = metadata.stale || (preferred.asOfDate && preferred.asOfDate < expected);
      const merged = { ...preferred, ...instruments[index], expectedAsOfDate: expected,
        error: metadata.error, retryAt: metadata.expectedAsOfDate === expected ? metadata.retryAt : 0,
        stale: Boolean(stale), staleReason: stale ? metadata.staleReason || 'incomplete_close' : '' };
      if (merged.status === 'ready') liveRef.current.rows.set(merged.symbol, merged);
      return merged;
    }) };
  }, [userId, instruments]);
  const snapshot = React.useMemo(() => readSnapshot(), [readSnapshot, state.revision]);
  const initialViewState = React.useMemo(() => getDrawdownViewState(userId), [userId]);
  const onViewStateChange = React.useMemo(() => value => setDrawdownViewState(userId, value), [userId]);

  React.useEffect(() => {
    const sequence = ++sequenceRef.current;
    const force = refresh.key === key && refresh.tick > consumedRefreshRef.current;
    consumedRefreshRef.current = refresh.tick;
    const controller = new AbortController();
    const ticket = beginDrawdownCacheRequest(userId);
    const active = () => sequence === sequenceRef.current && renderKeyRef.current === key && !controller.signal.aborted;
    const publish = (busy, error = '', invalid = false) => {
      if (active()) setState(value => ({ key, revision: value.revision + 1, busy, invalid, error }));
    };
    // Validate even an entirely fresh snapshot, but not again for changed input
    // array identities or membership while the same page remains open.
    if (sessionRef.current?.userId !== userId || sessionRef.current?.verifySession !== verifySession) {
      sessionRef.current = { userId, verifySession, promise: Promise.resolve().then(() => verifySession({ userId })) };
    }
    let pending = readSnapshot().instruments.filter(item => force || shouldRefreshDrawdown(item));
    publish(pending.length > 0);
    const processed = new Set();
    const descriptors = new Map(instruments.map(item => [item.symbol, item]));
    const retainFailure = (instrument, error) => {
      recordDrawdownFailure({ userId, symbol: instrument.symbol, error, ticket });
      const descriptor = descriptors.get(instrument.symbol);
      const fallback = getDrawdownSnapshot({ userId, instruments: [descriptor] }).instruments[0];
      const previous = liveRef.current.rows.get(instrument.symbol);
      if (previous?.points?.length) liveRef.current.rows.set(instrument.symbol, {
        ...previous, ...descriptor, status: 'ready', stale: true,
        expectedAsOfDate: fallback.expectedAsOfDate,
        staleReason: fallback.staleReason || 'provider_unavailable', error: fallback.error, retryAt: fallback.retryAt,
      });
      else liveRef.current.rows.set(instrument.symbol, fallback);
    };
    const persistProgress = result => {
      if (!active()) return;
      for (const instrument of result.instruments) {
        if (processed.has(instrument.symbol) || !['ready', 'error'].includes(instrument.status)) continue;
        processed.add(instrument.symbol);
        if (instrument.status === 'ready') {
          storeDrawdownHistory({ userId, instrument, ticket });
          const previous = liveRef.current.rows.get(instrument.symbol);
          liveRef.current.rows.set(instrument.symbol, preferredHistory(previous, instrument));
        } else retainFailure(instrument, instrument.error);
      }
    };
    (async () => {
      await sessionRef.current.promise;
      if (!active()) return;
      // Re-read after auth: another mounted consumer may have filled a symbol.
      pending = readSnapshot().instruments.filter(item => force || shouldRefreshDrawdown(item));
      if (!pending.length) { publish(false); return; }
      const result = await loadDrawdownObservation({ userId, instruments: pending, signal: controller.signal, force, loadHistory,
        onProgress: progress => { persistProgress(progress); publish(true); },
      });
      if (!active()) return;
      persistProgress(result);
      publish(false);
    })().catch(cause => {
      if (!active()) return;
      if (['AUTH_REQUIRED', 'REQUEST_SUPERSEDED'].includes(cause?.code)) {
        // Invalidate disk, memory and previously issued write tickets together.
        clearDrawdownObservationCache(userId);
        liveRef.current.rows.clear();
        sessionRef.current = null;
        publish(false, '暂时无法读取行情，请确认登录状态后重试。', true);
        controller.abort();
      } else if (cause?.name !== 'AbortError' && cause?.code !== 'REQUEST_ABORTED') {
        pending.forEach(instrument => retainFailure(instrument, cause));
        publish(false, [...liveRef.current.rows.values()].some(item => item.points?.length)
          ? '行情更新失败，已有数据仍保留，可稍后刷新重试。' : '行情暂不可用，可稍后刷新重试。');
      }
    });
    return () => { sequenceRef.current += 1; controller.abort(); };
  }, [key, userId, instruments, refresh, loadHistory, verifySession, readSnapshot]);

  const visible = state.key === key ? state : { busy: snapshot.instruments.some(item => shouldRefreshDrawdown(item)), invalid: false, error: '' };
  const visibleInstruments = visible.invalid ? instruments.map(item => ({ ...item, points: [], status: 'error' })) : snapshot.instruments;
  const observations = React.useMemo(() => visibleInstruments.map(item => deriveObservation(item, item.asOfDate)), [visibleInstruments]);
  const hasData = visibleInstruments.some(item => item.points?.length > 0);
  const error = visible.error || (visibleInstruments.some(item => item.error || item.status === 'error')
    ? hasData ? '部分标的行情暂不可用，已保留上次数据，可稍后刷新重试。' : '行情暂不可用，可稍后刷新重试。' : '');
  return <DrawdownObservation key={userId} observations={observations} onBack={closeDrawdownObservation}
    initialSymbol={import.meta.env.DEV ? previewSource?.initialSymbol || '' : ''}
    initialViewState={initialViewState} onViewStateChange={onViewStateChange}
    loading={visible.busy && !hasData} refreshing={visible.busy && hasData} error={error}
    onRefresh={() => { if (!visible.busy) setRefresh(value => ({ key, tick: value.tick + 1 })); }}
    portfolioReady={portfolioReady} portfolioError={portfolioError} />;
}
