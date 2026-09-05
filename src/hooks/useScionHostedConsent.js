import { useEffect, useState } from 'react';
import { readScionHostedConsent, SCION_HOSTED_CONSENT_EVENT } from '../lib/scionHostedPolicy';

export default function useScionHostedConsent() {
  const [allowed, setAllowed] = useState(readScionHostedConsent);
  useEffect(() => {
    const refresh = () => setAllowed(readScionHostedConsent());
    globalThis.addEventListener?.(SCION_HOSTED_CONSENT_EVENT, refresh);
    globalThis.addEventListener?.('storage', refresh);
    return () => {
      globalThis.removeEventListener?.(SCION_HOSTED_CONSENT_EVENT, refresh);
      globalThis.removeEventListener?.('storage', refresh);
    };
  }, []);
  return allowed;
}
