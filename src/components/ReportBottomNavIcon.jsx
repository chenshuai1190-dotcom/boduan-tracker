import React from 'react';

const TAB_ICONS = {
  home: {
    outline: <path d="m3.5 10 8.5-7 8.5 7v9.5a1 1 0 0 1-1 1h-5.3v-6h-4.4v6H4.5a1 1 0 0 1-1-1Z" />,
    solid: <path fillRule="evenodd" d="M11 2.7a1.6 1.6 0 0 1 2 0l8.3 6.8c.4.3.7.8.7 1.3V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9.2c0-.5.3-1 .7-1.3L11 2.7ZM11 13a1 1 0 0 0-1 1v5h4v-5a1 1 0 0 0-1-1h-2Z" />,
  },
  trades: {
    outline: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="m6.5 15 3.4-4 3.2 2.5 4.4-5" />
      </>
    ),
    solid: <path fillRule="evenodd" d="M7 2.5a4.5 4.5 0 0 0-4.5 4.5v10A4.5 4.5 0 0 0 7 21.5h10a4.5 4.5 0 0 0 4.5-4.5V7A4.5 4.5 0 0 0 17 2.5H7Zm.2 13.1 2.9-3.4 2.4 1.9a1 1 0 0 0 1.4-.1l4.3-4.9a.9.9 0 0 0-1.4-1.2l-3.7 4.2-2.5-2a.9.9 0 0 0-1.3.1l-3.5 4.2a.9.9 0 0 0 1.4 1.2Z" />,
  },
  analysis: {
    outline: (
      <>
        <path d="M20.5 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h12.5a2 2 0 0 0 2-2v-2M3 7h15.5a3.5 3.5 0 1 1 0 7h-3a2 2 0 0 1 0-4h5" />
        <path d="M16 12h.01" />
      </>
    ),
    solid: <path fillRule="evenodd" d="M5.5 3A3.5 3.5 0 0 0 2 6.5v11A3.5 3.5 0 0 0 5.5 21H19a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-1V4a1 1 0 0 0-1-1H5.5ZM16 10a3 3 0 0 0 0 6h6v-6h-6Zm.2 1.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />,
  },
  review: {
    outline: (
      <>
        <path d="M20.5 11.2a8.5 8.5 0 0 1-8.5 8.3 9 9 0 0 1-3.2-.6l-4.3 1.2.9-4a8 8 0 0 1-1.9-4.9 8.5 8.5 0 0 1 17 0Z" />
        <path d="M8 11.3h8" />
      </>
    ),
    solid: <path fillRule="evenodd" d="M12 2.5a9.6 9.6 0 0 0-7.8 15.1l-1 4.1 4.6-1.3a9.6 9.6 0 1 0 4.2-17.9ZM8 10.5a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2H8Z" />,
  },
  settings: {
    outline: (
      <>
        <path d="m10 3-.5 2.2-2 .9-2-.9-2 3.5L5 10.4v3.2l-1.5 1.7 2 3.5 2-.9 2 .9.5 2.2h4l.5-2.2 2-.9 2 .9 2-3.5-1.5-1.7v-3.2l1.5-1.7-2-3.5-2 .9-2-.9L14 3Z" />
        <circle cx="12" cy="12" r="2.8" />
      </>
    ),
    solid: <path fillRule="evenodd" d="M10 2.2h4a1 1 0 0 1 1 .8l.5 1.7 1.4.8 1.7-.5a1 1 0 0 1 1.2.4l1.9 3.2a1 1 0 0 1-.2 1.2L20.2 11v2l1.3 1.3a1 1 0 0 1 .2 1.2l-1.9 3.2a1 1 0 0 1-1.2.4l-1.7-.5-1.4.8-.5 1.7a1 1 0 0 1-1 .8h-4a1 1 0 0 1-1-.8l-.5-1.7-1.4-.8-1.7.5a1 1 0 0 1-1.2-.4l-1.9-3.2a1 1 0 0 1 .2-1.2L3.8 13v-2L2.5 9.8a1 1 0 0 1-.2-1.2l1.9-3.2A1 1 0 0 1 5.4 5l1.7.5 1.4-.8L9 3a1 1 0 0 1 1-.8ZM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />,
  },
};

export default function ReportBottomNavIcon({ tabId, active }) {
  const icon = TAB_ICONS[tabId];

  return (
    <svg
      className="report-bottom-nav-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke={active ? 'none' : 'currentColor'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {active ? icon.solid : icon.outline}
    </svg>
  );
}
