import { useState, useCallback, useRef } from 'react';

/**
 * useDeliverableUndo — Batched undo/redo for deliverable data edits.
 *
 * Maintains a single stack (across all features) capped at `maxSize` entries.
 * Each entry is a snapshot of a single feature's data taken BEFORE an edit.
 *
 * Usage:
 *   const delivUndo = useDeliverableUndo();
 *   // Before writing an edit:
 *   delivUndo.snapshot(featureId, oldData);
 *   // To undo:
 *   delivUndo.undo(setDeliverables);
 *   // To redo:
 *   delivUndo.redo(setDeliverables);
 */
export default function useDeliverableUndo(maxSize = 30) {
  const stackRef = useRef([]); // Array<{ featureId, data, timestamp }>
  const indexRef = useRef(-1); // Points to current position in stack
  const [revision, setRevision] = useState(0); // Force re-render on undo/redo

  /**
   * Save a snapshot BEFORE an edit is applied.
   * Truncates any redo entries (they become invalid after a new edit).
   */
  const snapshot = useCallback(
    (featureId, data) => {
      if (!featureId || data === undefined) return;

      // Truncate redo history
      stackRef.current = stackRef.current.slice(0, indexRef.current + 1);

      // Push the pre-edit snapshot
      stackRef.current.push({
        featureId,
        data: structuredClone(data),
        timestamp: Date.now(),
      });

      // Enforce max size (drop oldest entries)
      if (stackRef.current.length > maxSize) {
        stackRef.current = stackRef.current.slice(stackRef.current.length - maxSize);
      }

      indexRef.current = stackRef.current.length - 1;
      setRevision((r) => r + 1);
    },
    [maxSize],
  );

  /**
   * Undo: restore the snapshot at the current index, then step back.
   * @param {function} setDeliverables — the setDeliverables setter from useDeliverables
   */
  const undo = useCallback((setDeliverables) => {
    if (indexRef.current < 0) return;
    const entry = stackRef.current[indexRef.current];
    if (!entry) return;

    setDeliverables((prev) => ({
      ...prev,
      [entry.featureId]: {
        ...prev[entry.featureId],
        data: entry.data,
        status: 'done',
      },
    }));

    indexRef.current -= 1;
    setRevision((r) => r + 1);
  }, []);

  /**
   * Redo: step forward and apply the snapshot at the new index.
   * @param {function} setDeliverables — the setDeliverables setter from useDeliverables
   */
  const redo = useCallback((setDeliverables) => {
    if (indexRef.current >= stackRef.current.length - 1) return;
    indexRef.current += 1;
    const entry = stackRef.current[indexRef.current];
    if (!entry) return;

    setDeliverables((prev) => ({
      ...prev,
      [entry.featureId]: {
        ...prev[entry.featureId],
        data: entry.data,
        status: 'done',
      },
    }));

    setRevision((r) => r + 1);
  }, []);

  const canUndo = indexRef.current >= 0;
  const canRedo = indexRef.current < stackRef.current.length - 1;

  return { snapshot, undo, redo, canUndo, canRedo, revision };
}
