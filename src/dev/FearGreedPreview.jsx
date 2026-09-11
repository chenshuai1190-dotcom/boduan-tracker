import React from 'react';
import FearGreedPage from '../pages/FearGreedPage.jsx';
import snapshot from './fixtures/cnnFearGreedSnapshot.json';

// Recorded public CNN response, captured 2026-09-11. Source as-of timestamps
// remain intact. This DEV-only fixture never masquerades as a live response.
// https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2025-08-07
export default function FearGreedPreview({ ctx }) {
  return <FearGreedPage ctx={ctx} previewData={snapshot} />;
}
