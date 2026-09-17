import React from 'react';
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Coins,
  Home,
  Landmark,
  MessageCircle,
  WalletCards,
} from 'lucide-react';

const PRESET_ICONS = {
  银行定期: (
    <>
      <path d="m3 8 7-4 7 4H3Zm2.5 3v7m4.5-7v7M3 21h8" />
      <circle cx="17.5" cy="17.5" r="4" />
      <path d="M17.5 15.5v2l1.5 1" />
    </>
  ),
  大额存单: (
    <>
      <path d="M11 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M8 7h8m-8 4h5" />
      <circle cx="16.5" cy="16" r="3" />
      <path d="m14.5 18.5-.5 3 2.5-1 2.5 1-.5-3" />
    </>
  ),
  货币基金: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M9 7v4m-1.5-2h3M15.5 8l5 2.5-8.5 4.5m-8.5 1L12 20.5l8.5-4.5M6 13.8l6 3.2 8.5-4.5" />
    </>
  ),
  现金: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 11v2m11-2v2" />
    </>
  ),
  住房公积金: (
    <>
      <path d="m3 10 8-6.5 8 6.5M5 9v11h6m-2 0v-6h4" />
      <ellipse cx="17.5" cy="14.5" rx="3.5" ry="1.5" />
      <path d="M14 14.5v5c0 .8 1.6 1.5 3.5 1.5s3.5-.7 3.5-1.5v-5m-7 2.5c0 .8 1.6 1.5 3.5 1.5s3.5-.7 3.5-1.5" />
    </>
  ),
  企业年金: (
    <>
      <path d="M10 21H4V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5M8 7h5m-5 4h2m-2 4h2" />
      <circle cx="17" cy="17" r="4.5" />
      <path d="M17 14.5V17l1.5 1" />
    </>
  ),
  房产: (
    <>
      <path d="m3 10 9-7 9 7M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M9.5 21v-7h5v7" />
    </>
  ),
  车: (
    <>
      <path d="m5 10 1.7-4.3A1.8 1.8 0 0 1 8.4 4.5h7.2a1.8 1.8 0 0 1 1.7 1.2L19 10M5 10h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2Zm0 7v2m14-2v2M6.5 13.5H8m8 0h1.5" />
    </>
  ),
  黄金: (
    <>
      <path d="m3 18 3.5-8h11l3.5 8H3Zm3.5-8L9 6h6l2.5 4M3 18v2h18v-2" />
    </>
  ),
  保险: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.1 2.7 7.4 7.5 9.5 4.8-2.1 7.5-5.4 7.5-9.5V6L12 3Z" />
      <path d="m8.5 11.5 2.5 2.5 4.5-4.5" />
    </>
  ),
};

const TYPE_ICONS = new Map([
  ['银行', Landmark],
  ['证券', BarChart3],
  ['支付宝', WalletCards],
  ['微信', MessageCircle],
  ['定期', CalendarDays],
  ['现金', Coins],
  ['公积金', Home],
  ['其他', CircleDollarSign],
]);

export default function AccountCategoryIcon({ account, className = 'h-[18px] w-[18px]' }) {
  const name = String(account?.name || '').trim();
  const icon = Object.hasOwn(PRESET_ICONS, name) ? PRESET_ICONS[name] : null;

  if (!icon) {
    const Icon = TYPE_ICONS.get(account?.type) || CircleDollarSign;
    return <Icon className={className} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
  }

  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  );
}
