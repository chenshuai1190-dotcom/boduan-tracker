import React from 'react';
import DrawdownObservation from '../components/DrawdownObservation.jsx';
import { buildObservationUniverse, deriveObservation } from '../lib/drawdownObservationModel.js';
import { loadDrawdownObservation } from '../lib/drawdownObservationHistory.js';

// Read-only public history. Personal inputs determine membership, never cost or trades.
export default function DrawdownObservationPage({ ctx = {}, previewSource = null }) {
  const { userId = '', watchlist = [], positions = [], portfolioReady = true, portfolioError = '', closeDrawdownObservation } = ctx;
  const universeKey = JSON.stringify(buildObservationUniverse({ watchlist, positions: portfolioReady && !portfolioError ? positions : [] }));
  const instruments = React.useMemo(() => JSON.parse(universeKey), [universeKey]);
  const key = `${userId}:${universeKey}`;
  const [refresh, setRefresh] = React.useState({ key: '', tick: 0 });
  const [state, setState] = React.useState({ key: '', instruments: [], loading: true, error: '' });
  const sequenceRef = React.useRef(0);
  const consumedRefreshRef = React.useRef(0);
  const loadHistory = import.meta.env.DEV ? previewSource?.load : undefined;
  React.useEffect(() => {
    const sequence = ++sequenceRef.current;
    // A manual retry bypasses the shared cache once for its current universe;
    // later membership changes (including returning to it) reuse cached history.
    const force = refresh.key === key && refresh.tick > consumedRefreshRef.current;
    consumedRefreshRef.current = refresh.tick;
    const controller = new AbortController();
    const pending = instruments.map(item => ({ ...item, points: [], status: 'loading' }));
    setState({ key, instruments: pending, loading: true, error: '' });
    const active = () => sequence === sequenceRef.current && !controller.signal.aborted;
    loadDrawdownObservation({ userId, instruments, signal: controller.signal, force, loadHistory,
      onProgress: result => {
        if (active()) setState({ key, instruments: result.instruments, loading: true, error: '' });
      },
    }).then(result => {
      if (active()) setState({ key, instruments: result.instruments, loading: false, error: result.instruments.some(item => item.status === 'error') ? '部分标的行情暂不可用，可点击右上角刷新重试。' : '' });
    }).catch(() => {
      // An invalidated identity must discard even earlier successful progress.
      if (active()) setState({ key, instruments: instruments.map(item => ({ ...item, points: [], status: 'error' })), loading: false, error: '暂时无法读取行情，请确认登录状态后重试。' });
    });
    return () => { sequenceRef.current += 1; controller.abort(); };
  }, [key, userId, instruments, refresh, loadHistory]);
  const visible = state.key === key ? state : { instruments: instruments.map(item => ({ ...item, points: [], status: 'loading' })), loading: true, error: '' };
  const observations = React.useMemo(() => visible.instruments.map(item => deriveObservation(item, item.asOfDate)), [visible.instruments]);
  return <DrawdownObservation key={key} observations={observations} onBack={closeDrawdownObservation}
    initialSymbol={import.meta.env.DEV ? previewSource?.initialSymbol || '' : ''}
    loading={visible.loading} error={visible.error} onRefresh={() => setRefresh(value => ({ key, tick: value.tick + 1 }))}
    portfolioReady={portfolioReady} portfolioError={portfolioError} />;
}
