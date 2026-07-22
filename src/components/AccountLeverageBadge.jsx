import React from 'react';
import { t } from '../lib/i18n.js';

const TIER_COPY = Object.freeze({
  none: ['home.leverageTier.none', '无杠杆'],
  low: ['home.leverageTier.low', '低杠杆'],
  moderate: ['home.leverageTier.moderate', '适中'],
  elevated: ['home.leverageTier.elevated', '偏高'],
  high: ['home.leverageTier.high', '高杠杆'],
  critical: ['home.leverageTier.critical', '高风险'],
  insufficient: ['home.leverageTier.insufficient', '净资产不足'],
});

const TIER_CLASS = Object.freeze({
  none: 'border-white/[0.12] bg-white/[0.045] text-white/[0.55]',
  low: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300/[0.85]',
  moderate: 'border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-300/90',
  elevated: 'border-[#f6b54b]/30 bg-[#f6b54b]/[0.09] text-[#ffd18a]/90',
  high: 'border-[#ff7358]/30 bg-[#ff7358]/[0.09] text-[#ff8b74]/90',
  critical: 'border-[#ff5a3c]/35 bg-[#ff5a3c]/[0.10] text-[#ff7358]',
  insufficient: 'border-[#ff5a3c]/35 bg-[#ff5a3c]/[0.10] text-[#ff7358]',
});

function accountLeverageTierLabel(language, tierId) {
  const [key, fallback] = TIER_COPY[tierId] || ['', ''];
  return key ? t(language, key, fallback) : '';
}

export default function AccountLeverageBadge({ className = '', language = 'zh', tierId }) {
  const label = accountLeverageTierLabel(language, tierId);
  if (!label) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border leading-none ${TIER_CLASS[tierId] || TIER_CLASS.none} ${className}`}
      data-account-leverage-tier={tierId}
    >
      {label}
    </span>
  );
}
