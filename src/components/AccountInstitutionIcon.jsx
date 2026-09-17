import React from 'react';
import { resolveAccountInstitution } from '../lib/accountInstitution.js';
import alipay from '../assets/account-institutions/alipay-favicon.ico';
import cmb from '../assets/account-institutions/cmb-favicon.ico';
import ibkr from '../assets/account-institutions/ibkr-logo-icon.png';
import winglung from '../assets/account-institutions/winglung-logo-original.png';
import longbridge from '../assets/account-institutions/longbridge-icon-152.png';
import boci from '../assets/account-institutions/boci-logo-original.png';
import './AccountInstitutionIcon.css';

const SOURCES = { alipay, cmb, ibkr, winglung, longbridge, boci };

export default function AccountInstitutionIcon({ account, fallback = null }) {
  const institution = resolveAccountInstitution(account);
  const src = SOURCES[institution];
  const [failedSource, setFailedSource] = React.useState(null);

  if (!src || failedSource === src) return fallback;

  return (
    <span className="account-institution-logo" data-institution={institution} aria-hidden="true">
      <span className="account-institution-logo-window">
        <img src={src} alt="" draggable={false} onError={() => setFailedSource(src)} />
      </span>
    </span>
  );
}
