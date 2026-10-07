import React from 'react';
import FearGreedPage from '../pages/FearGreedPage.jsx';
import snapshot from './fixtures/cnnFearGreedSnapshot.json';

export const FEAR_GREED_DESIGN_STATES = Object.freeze([
  { id: 'extreme-fear', score: 12, rating: 'extreme fear', zh: '极度恐慌', en: 'Extreme fear' },
  { id: 'fear', score: 33, rating: 'fear', zh: '恐慌', en: 'Fear' },
  { id: 'neutral', score: 50, rating: 'neutral', zh: '中性', en: 'Neutral' },
  { id: 'greed', score: 67, rating: 'greed', zh: '贪婪', en: 'Greed' },
  { id: 'extreme-greed', score: 88, rating: 'extreme greed', zh: '极度贪婪', en: 'Extreme greed' },
].map(Object.freeze));

export function initialFearGreedDesignState(search = '') {
  if (typeof search !== 'string') return null;
  const requested = new URLSearchParams(search).getAll('fgState');
  return requested.length === 1 && FEAR_GREED_DESIGN_STATES.some(item => item.id === requested[0])
    ? requested[0] : null;
}

export function fearGreedDesignSnapshot(state, original = snapshot) {
  const scenario = FEAR_GREED_DESIGN_STATES.find(item => item.id === state);
  if (!scenario) return original;
  return { ...original, current: { ...original.current, score: scenario.score, rating: scenario.rating } };
}

// Recorded public CNN response, captured 2026-09-11. Source as-of timestamps
// remain intact. This DEV-only fixture never masquerades as a live response.
// https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2025-08-07
export default function FearGreedPreview({ ctx }) {
  const [selected, setSelected] = React.useState(() => import.meta.env.DEV && typeof window !== 'undefined'
    ? initialFearGreedDesignState(window.location.search) : null);
  if (!import.meta.env.DEV) return null;
  const english = String(ctx?.language || 'zh').toLowerCase().startsWith('en');
  const controls = <div data-fg-design-controls="true" style={{ marginTop: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#898992', fontSize: 11 }}>{english ? 'Color preview' : '配色预览'}</span>
      <div className="fg-range"><button type="button" aria-pressed={selected === null} onClick={() => setSelected(null)}>
        {english ? 'Original snapshot' : '原始快照'}
      </button></div>
    </div>
    <div className="fg-range" role="group" aria-label={english ? 'Sentiment color preview' : '情绪配色预览'}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {FEAR_GREED_DESIGN_STATES.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id}
        onClick={() => setSelected(item.id)}>{english ? item.en : item.zh}</button>)}
    </div>
  </div>;
  return <FearGreedPage ctx={ctx} previewData={fearGreedDesignSnapshot(selected)}
    previewControls={controls} previewScenario={selected !== null} />;
}
