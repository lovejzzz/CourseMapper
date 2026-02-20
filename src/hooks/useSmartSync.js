import { useState, useRef, useCallback, useEffect } from 'react';
import { buildSyncPlan } from '../lib/syncDependencies';

/**
 * useSmartSync — Cascade Sync Engine (V1.5.3)
 *
 * Watches for course map edits (via notifyEdit), debounces for 2 seconds,
 * then surgically regenerates only the affected lesson(s) in each affected deliverable.
 *
 * Usage:
 *   const smartSync = useSmartSync({ deliv, gen, courseMap, selectedFeatures, onSyncComplete });
 *   // Wire: editor.handleCellEdit calls smartSync.notifyEdit(lessonIdx, key)
 *
 * Exposes:
 *   { syncLog, isSyncing, pendingSyncCount, notifyEdit }
 */
export default function useSmartSync({
  deliv,          // return value of useDeliverables
  gen,            // return value of useGeneration (for gen.isStreaming guard)
  courseMapRef,   // ref to current courseMap (always fresh)
  selectedFeatures,
  onSyncComplete, // callback(affectedFeatureIds[]) — called when sync batch done
}) {
  const [syncLog, setSyncLog] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Accumulate edits between debounce fires
  const pendingEditsRef = useRef([]);
  const debounceTimerRef = useRef(null);
  const isSyncingRef = useRef(false);

  // Keep fresh references so the debounce callback always has current values
  const delivRef = useRef(deliv);
  delivRef.current = deliv;
  const genRef = useRef(gen);
  genRef.current = gen;
  const selectedFeaturesRef = useRef(selectedFeatures);
  selectedFeaturesRef.current = selectedFeatures;
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const appendSyncLog = useCallback((type, featureId, message) => {
    setSyncLog(prev => [...prev, { type, featureId, message, at: Date.now() }]);
  }, []);

  /**
   * The main sync executor — called after debounce expires.
   * Runs synchronously through the plan, one feature at a time.
   */
  const runSync = useCallback(async () => {
    const currentDeliv = delivRef.current;
    const currentGen = genRef.current;
    const currentFeatures = selectedFeaturesRef.current;
    const currentCourseMap = courseMapRef?.current;

    // Guard: don't start if something is already generating
    if (currentGen?.isStreaming || currentDeliv?.isGenerating) {
      // Re-schedule after a short wait — poll until idle
      debounceTimerRef.current = setTimeout(() => {
        if (pendingEditsRef.current.length > 0) runSync();
      }, 1500);
      return;
    }

    if (!currentCourseMap) return;

    const edits = [...pendingEditsRef.current];
    pendingEditsRef.current = [];

    if (edits.length === 0) return;

    const plan = buildSyncPlan(edits, currentFeatures, currentDeliv.deliverables);
    if (plan.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    setPendingSyncCount(plan.length);

    const completedFeatureIds = [];

    for (let i = 0; i < plan.length; i++) {
      const { featureId, lessonIndices } = plan[i];
      setPendingSyncCount(plan.length - i);

      appendSyncLog('start', featureId, lessonIndices
        ? `Updating lesson${lessonIndices.length > 1 ? 's' : ''} ${lessonIndices.map(n => n + 1).join(', ')}…`
        : 'Full update…'
      );

      try {
        if (lessonIndices === null) {
          // Structural change — full regen for this feature
          await delivRef.current.generateAll(currentCourseMap, [featureId], null);
        } else {
          // Surgical: regenerate each affected lesson index sequentially
          for (const lessonIdx of lessonIndices) {
            await delivRef.current.regenerateLesson(featureId, currentCourseMap, lessonIdx);
          }
        }
        appendSyncLog('done', featureId, lessonIndices
          ? `Lesson${lessonIndices.length > 1 ? 's' : ''} ${lessonIndices.map(n => n + 1).join(', ')} updated`
          : 'Updated'
        );
        completedFeatureIds.push(featureId);
      } catch (err) {
        appendSyncLog('error', featureId, err.message || 'Sync failed');
      }
    }

    isSyncingRef.current = false;
    setIsSyncing(false);
    setPendingSyncCount(0);

    if (completedFeatureIds.length > 0 && onSyncCompleteRef.current) {
      onSyncCompleteRef.current(completedFeatureIds);
    }

    // If new edits arrived while we were syncing, fire another round
    if (pendingEditsRef.current.length > 0) {
      debounceTimerRef.current = setTimeout(runSync, 2000);
    }
  }, [appendSyncLog, courseMapRef]);

  /**
   * notifyEdit — called by useCourseMapEditor for every edit.
   * Accumulates the edit and (re)starts the 2-second debounce timer.
   *
   * @param {number|null} lessonIdx - Lesson index (null for structural changes)
   * @param {string} key - Field key that changed (e.g. 'learningObjectives', '_structural')
   */
  const notifyEdit = useCallback((lessonIdx, key) => {
    pendingEditsRef.current.push({ lessonIdx, key });

    // Reset debounce timer
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    // If currently syncing, queue for after completion (handled in runSync)
    if (isSyncingRef.current) return;

    debounceTimerRef.current = setTimeout(runSync, 2000);
  }, [runSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { syncLog, isSyncing, pendingSyncCount, notifyEdit };
}
