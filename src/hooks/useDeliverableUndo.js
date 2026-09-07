import { useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import {
  appendEditTransaction,
  applyEditTransaction,
  createEditTransaction,
  editTransactionStates,
  emptyEditHistory,
  restoreEditHistory,
  serializeEditHistory,
} from '../lib/deliverableEditHistory.js';

/** Capture before the state write, then seal after that React commit. The
 * pending capture never survives an unchanged commit, so a no-op cannot
 * accidentally claim a later regeneration. Only reversible differences are
 * retained; course structure and linked materials share one history entry. */
export default function useDeliverableUndo(maxSize = 30, workspace) {
  const historyRef = useRef(emptyEditHistory());
  const pendingRef = useRef(null);
  const liveRef = useRef(workspace);
  liveRef.current = workspace;
  const [revision, setRevision] = useState(0);
  const [, setCaptureRevision] = useState(0);
  const [message, setMessage] = useState('');

  const snapshotTransaction = useCallback((features, context) => {
    if (!features || !Object.keys(features).length) return;
    const pending = pendingRef.current || { features: {} };
    // Multiple repairs in one commit retain the earliest value of each field.
    for (const [id, fields] of Object.entries(features))
      pending.features[id] = { ...structuredClone(fields), ...pending.features[id] };
    if (context !== undefined && pending.context === undefined) pending.context = structuredClone(context);
    pendingRef.current = pending;
    setCaptureRevision((value) => value + 1);
  }, []);

  const snapshot = useCallback(
    (featureId, data) => {
      if (featureId && data !== undefined) snapshotTransaction({ [featureId]: { data } });
    },
    [snapshotTransaction],
  );

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    try {
      const { before, after } = editTransactionStates(pending.features, pending.context, liveRef.current);
      const entry = createEditTransaction(before, after);
      if (!entry) return;
      const result = appendEditTransaction(historyRef.current, entry, maxSize);
      historyRef.current = result.history;
      setMessage(result.message || '');
      setRevision((value) => value + 1);
    } catch {
      // A missing step must establish a boundary, not leave an older edit
      // apparently able to undo through it.
      historyRef.current = emptyEditHistory();
      setMessage('This edit could not be added to undo history. Your current materials are preserved.');
      setRevision((value) => value + 1);
    }
  });

  const exchange = useCallback((direction, setDeliverables, contextOwner) => {
    const history = historyRef.current;
    const index = direction === 'undo' ? history.cursor - 1 : history.cursor;
    const entry = history.entries[index];
    if (!entry) return false;
    const current = { ...liveRef.current, ...contextOwner?.read?.() };
    const result = applyEditTransaction(current, entry, direction);
    if (result.status !== 'applied') {
      setMessage(result.message);
      return false;
    }
    const contextChanged = entry.changes.some(({ path }) => path[0] !== 'deliverables');
    if (contextChanged && !contextOwner?.restore) {
      setMessage('This edit also changes the course structure. Open the course workspace to restore it.');
      return false;
    }
    liveRef.current = result.workspace;
    pendingRef.current = null;
    historyRef.current = { ...history, cursor: history.cursor + (direction === 'undo' ? -1 : 1) };
    setDeliverables(result.workspace.deliverables);
    if (contextChanged)
      contextOwner.restore({ courseMap: result.workspace.courseMap, courseGraph: result.workspace.courseGraph });
    setMessage('');
    setRevision((value) => value + 1);
    return true;
  }, []);
  const undo = useCallback(
    (setDeliverables, contextOwner) => exchange('undo', setDeliverables, contextOwner),
    [exchange],
  );
  const redo = useCallback(
    (setDeliverables, contextOwner) => exchange('redo', setDeliverables, contextOwner),
    [exchange],
  );
  const restore = useCallback(
    (saved, current) => {
      const result = restoreEditHistory(saved, current, maxSize);
      pendingRef.current = null;
      liveRef.current = current;
      historyRef.current = result.history;
      setMessage(result.message || '');
      setRevision((value) => value + 1);
      return result.status;
    },
    [maxSize],
  );
  const reset = useCallback(() => {
    pendingRef.current = null;
    historyRef.current = emptyEditHistory();
    setMessage('');
    setRevision((value) => value + 1);
  }, []);
  const dismissMessage = useCallback(() => setMessage(''), []);
  const history = useMemo(() => serializeEditHistory(historyRef.current), [revision]);

  return {
    snapshot,
    snapshotTransaction,
    undo,
    redo,
    restore,
    reset,
    history,
    message,
    dismissMessage,
    canUndo: history.cursor > 0,
    canRedo: history.cursor < history.entries.length,
    revision,
  };
}
