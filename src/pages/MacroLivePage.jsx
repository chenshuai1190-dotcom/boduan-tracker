import React from 'react';
import MacroPage from './MacroPage.jsx';
import { fetchMacroData } from '../macro/MacroDataService.js';

export default function MacroLivePage({ ctx, mock = false, ...props }) {
  const preview = import.meta.env.DEV && ctx === undefined;
  const demo = preview && mock === true;
  const userId = typeof ctx?.userId === 'string' ? ctx.userId : '';
  const onBack = ctx?.closeMacro || props.onBack;
  const [result, setResult] = React.useState(null);
  const [revision, setRevision] = React.useState(0);
  const requestKey = `${preview ? 'preview' : 'production'}:${userId}:${revision}`;
  React.useEffect(() => {
    if (demo) return undefined;
    const controller = new AbortController();
    let active = true;
    setResult({ requestKey, snapshot: undefined, fetchState: 'loading' });
    fetchMacroData({ preview, userId, signal: controller.signal }).then(data => {
      if (!active) return;
      setResult({ requestKey, snapshot: data, fetchState: data.availability.available ? 'ready' : 'empty' });
    }).catch(() => {
      if (active) setResult({ requestKey, snapshot: undefined, fetchState: 'error' });
    });
    return () => { active = false; controller.abort(); };
  }, [demo, preview, userId, requestKey]);
  if (demo) return <MacroPage {...props} onBack={onBack} />;
  // Key the visible response as well as the request: a changed identity or retry
  // must never paint the prior response while its new effect is still pending.
  const visible = result?.requestKey === requestKey ? result : null;
  return <MacroPage {...props} onBack={onBack} snapshot={visible?.snapshot} fetchState={visible?.fetchState || 'loading'} onRetry={() => setRevision(value => value + 1)} />;
}
