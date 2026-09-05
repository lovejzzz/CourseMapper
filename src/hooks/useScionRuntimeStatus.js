import { useEffect, useState } from 'react';
import { getScionBrowserWllamaStatus, subscribeScionBrowserWllamaStatus } from '../lib/scionBrowserWllama';

export default function useScionRuntimeStatus(enabled = true) {
  const [status, setStatus] = useState(() => getScionBrowserWllamaStatus());

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeScionBrowserWllamaStatus(setStatus);
  }, [enabled]);

  return status;
}
