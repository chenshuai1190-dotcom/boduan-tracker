import React from 'react';

const TAB_ICONS = {
  home: (
    <>
      <path d="m3.5 10 8.5-7 8.5 7v9.5a1 1 0 0 1-1 1h-5.3v-6h-4.4v6H4.5a1 1 0 0 1-1-1Z" />
      <path d="M8.5 8.4h7" opacity={0.5} />
    </>
  ),
  trades: <path d="M3.5 4.5v14a1 1 0 0 0 1 1h16M7 14l4-4 4 2.5 5-6" />,
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
      <path d="M9.32 5.39Q9.88 5.07 10.10 4.45L10.48 3.35Q10.70 2.74 11.35 2.74L12.65 2.74Q13.30 2.74 13.52 3.35L13.90 4.45Q14.12 5.07 14.68 5.39L16.38 6.37Q16.94 6.70 17.58 6.58L18.73 6.36Q19.37 6.24 19.69 6.81L20.34 7.93Q20.67 8.50 20.25 8.99L19.49 9.88Q19.06 10.37 19.06 11.02L19.06 12.98Q19.06 13.63 19.49 14.12L20.25 15.01Q20.67 15.50 20.34 16.07L19.69 17.19Q19.37 17.76 18.73 17.64L17.58 17.42Q16.94 17.30 16.38 17.63L14.68 18.61Q14.12 18.93 13.90 19.55L13.52 20.65Q13.30 21.26 12.65 21.26L11.35 21.26Q10.70 21.26 10.48 20.65L10.10 19.55Q9.88 18.93 9.32 18.61L7.62 17.63Q7.06 17.30 6.42 17.42L5.27 17.64Q4.63 17.76 4.31 17.19L3.66 16.07Q3.33 15.50 3.75 15.01L4.51 14.12Q4.94 13.63 4.94 12.98L4.94 11.02Q4.94 10.37 4.51 9.88L3.75 8.99Q3.33 8.50 3.66 7.93L4.31 6.81Q4.63 6.24 5.27 6.36L6.42 6.58Q7.06 6.70 7.62 6.37Z" />
      <circle cx="12" cy="12" r="3.1" />
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
