import { useCallback, useEffect, useRef } from 'react';

/** Save the latest snapshot within one interval, even while edits keep arriving. */
export default function useBoundedAutosave(save, enabled, onPending, delayMs = 3000) {
  const latest = useRef(save);
  const timer = useRef(null);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    latest.current = save;
    if (!enabled) {
      cancel();
      return;
    }
    onPending?.();
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current();
    }, delayMs);
  }, [save, enabled, onPending, delayMs, cancel]);
  useEffect(() => cancel, [cancel]);
  return cancel;
}
