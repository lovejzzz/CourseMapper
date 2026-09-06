import { useState, useCallback, useRef } from 'react';

/** One history entry can cover a single edit or an entire linked task update.
 * Entries swap with live state on undo/redo, so redo restores the actual edited
 * values rather than replaying the pre-edit snapshot. Context is optional and
 * lets the owner restore the canonical course map in the same transaction. */
export default function useDeliverableUndo(maxSize = 30) {
  const stackRef = useRef([]);
  const indexRef = useRef(-1);
  const [revision, setRevision] = useState(0);

  const snapshotTransaction = useCallback(
    (features, context) => {
      if (!features || !Object.keys(features).length) return;
      stackRef.current = stackRef.current.slice(0, indexRef.current + 1);
      stackRef.current.push({ features: structuredClone(features), context: structuredClone(context) });
      if (stackRef.current.length > maxSize) stackRef.current = stackRef.current.slice(-maxSize);
      indexRef.current = stackRef.current.length - 1;
      setRevision((r) => r + 1);
    },
    [maxSize],
  );

  const snapshot = useCallback(
    (featureId, data) => {
      if (featureId && data !== undefined) snapshotTransaction({ [featureId]: { data } });
    },
    [snapshotTransaction],
  );

  const exchange = useCallback((index, setDeliverables, contextOwner) => {
    const entry = stackRef.current[index];
    if (!entry) return;
    const targetContext = entry.context;
    const currentContext = targetContext === undefined ? undefined : structuredClone(contextOwner?.read?.());
    const targetFeatures = entry.features;
    setDeliverables((prev) => {
      const next = { ...prev };
      const reverse = {};
      for (const [id, fields] of Object.entries(targetFeatures)) {
        reverse[id] = Object.fromEntries(Object.keys(fields).map((key) => [key, structuredClone(prev[id]?.[key])]));
        next[id] = { ...prev[id], ...fields };
      }
      entry.features = reverse;
      return next;
    });
    if (targetContext !== undefined) {
      entry.context = currentContext;
      contextOwner?.restore?.(targetContext);
    }
  }, []);

  const undo = useCallback(
    (setDeliverables, contextOwner) => {
      if (indexRef.current < 0) return;
      exchange(indexRef.current, setDeliverables, contextOwner);
      indexRef.current -= 1;
      setRevision((r) => r + 1);
    },
    [exchange],
  );
  const redo = useCallback(
    (setDeliverables, contextOwner) => {
      if (indexRef.current >= stackRef.current.length - 1) return;
      indexRef.current += 1;
      exchange(indexRef.current, setDeliverables, contextOwner);
      setRevision((r) => r + 1);
    },
    [exchange],
  );

  return {
    snapshot,
    snapshotTransaction,
    undo,
    redo,
    canUndo: indexRef.current >= 0,
    canRedo: indexRef.current < stackRef.current.length - 1,
    revision,
  };
}
