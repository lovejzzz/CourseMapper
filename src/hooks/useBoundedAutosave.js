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
  useEffect(() => {
    // A normal refresh/tab hide may occur before the three-second deadline.
    // Flush pending work, but never revive a cancelled or unchanged project.
    // Large IndexedDB writes remain asynchronous; callers report completion.
    const flush = () => {
      if (timer.current === null) return;
      cancel();
      latest.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return cancel;
}
