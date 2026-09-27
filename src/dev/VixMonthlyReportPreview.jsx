import React from 'react';
import VixMonthlyReportView from '../pages/VixMonthlyReportView.jsx';

// The local fixture workspace shares the exact production presentation.
export default function VixMonthlyReportPreview(props) {
  return <VixMonthlyReportView {...props} preview />;
}
