import { useCallback, useEffect, useState } from 'react';
import { getHostedScionAvailability } from '../lib/scionHostedAvailability';

export default function useScionHostedAvailability(enabled) {
  const [availability, setAvailability] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setAvailability(null);
    getHostedScionAvailability(revision > 0).then((result) => {
      if (active) setAvailability(result);
    });
    globalThis.addEventListener?.('focus', refresh);
    return () => {
      active = false;
      globalThis.removeEventListener?.('focus', refresh);
    };
  }, [enabled, revision, refresh]);
  return { availability: enabled ? availability : null, refresh };
}
