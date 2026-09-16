import React from 'react';

const TAB_ICONS = {
  home: (
    <>
      <path d="m3.5 10 8.5-7 8.5 7v9.5a1 1 0 0 1-1 1h-5.3v-6h-4.4v6H4.5a1 1 0 0 1-1-1Z" />
      <path d="M8.5 8.4h7" opacity={0.5} />
    </>
  ),
  trades: <path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4 4-4-4 4-4" />,
  analysis: (
    <>
      <rect x="3.5" y="6" width="17" height="14" rx="3" />
      <path d="M4.5 6V4.7a1.5 1.5 0 0 1 1.5-1.5H17M16 11h4.5v5H16a2.5 2.5 0 0 1 0-5Z" />
      <path d="M16.5 13.5h.01" />
    </>
  ),
  review: (
    <>
      <circle cx="11" cy="13" r="8" />
      <circle cx="11" cy="13" r="4" />
      <path d="m11 13 9-10m-4 0h4v4" />
    </>
  ),
  settings: (
    <>
      <path d="M5 3v18M12 3v18M19 3v18" />
      <path d="M2.5 8h5M9.5 16h5M16.5 7h5" strokeWidth={3.8} />
    </>
  ),
};

export default function ReportBottomNavIcon({ tabId, className = '' }) {
  const icon = TAB_ICONS[tabId];
  if (!icon) return null;

  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  );
}
