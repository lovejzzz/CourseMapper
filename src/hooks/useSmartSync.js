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

    // Determine excludeFeatureId: only exclude if ALL edits in this batch
    // came from the same deliverable (mixed course-map + deliverable edits
    // should not exclude anything)
    const excludeIds = new Set(edits.map(e => e.excludeFeatureId).filter(Boolean));
    const excludeFeatureId = excludeIds.size === 1 && edits.every(e => e.excludeFeatureId)
      ? [...excludeIds][0]
      : null;

    const plan = buildSyncPlan(edits, currentFeatures, currentDeliv.deliverables, excludeFeatureId);
    if (plan.length === 0) return;

    // Build a human-readable summary of what fields changed (for log specificity)
    const FIELD_LABELS = {
      title: 'lesson title', learningObjectives: 'learning objectives',
      weeklyAssessments: 'weekly assessments', topicSection: 'topic/section',
      asyncActivities: 'async activities', syncActivities: 'sync activities',
      supportingResources: 'supporting resources', presentationFormat: 'presentation format',
      learningGoals: 'learning goals', technologyNeeded: 'technology needed',
      evaluateDesign: 'evaluate design', _structural: 'lesson structure',
      _deliverableEdit: excludeFeatureId
        ? `${excludeFeatureId.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} edited`
        : 'deliverable edited',
      sections: 'sections', courseName: 'course name',
      semester: 'semester', courseDescription: 'course description',
    };
    const uniqueFields = [...new Set(edits.map(e => FIELD_LABELS[e.key] || e.key))];
    const changedFieldsSummary = uniqueFields.slice(0, 3).join(', ') + (uniqueFields.length > 3 ? '…' : '');

    isSyncingRef.current = true;
    setIsSyncing(true);
    setPendingSyncCount(plan.length);

    const completedFeatureIds = [];

    for (let i = 0; i < plan.length; i++) {
      const { featureId, lessonIndices } = plan[i];
      setPendingSyncCount(plan.length - i);

      appendSyncLog('start', featureId, lessonIndices
        ? `Lesson${lessonIndices.length > 1 ? 's' : ''} ${lessonIndices.map(n => n + 1).join(', ')} — ${changedFieldsSummary} changed`
        : `Full update — ${changedFieldsSummary} changed`
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
          ? `Lesson${lessonIndices.length > 1 ? 's' : ''} ${lessonIndices.map(n => n + 1).join(', ')} synced ✓`
          : 'All lessons synced ✓'
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
   * notifyEdit — called by useCourseMapEditor (course map edits) or
   * App.jsx onDataChange (deliverable body edits) for every edit.
   * Accumulates the edit and (re)starts the 2-second debounce timer.
   *
   * @param {number|null} lessonIdx - Lesson index (null for structural changes)
   * @param {string} key - Field key that changed (e.g. 'learningObjectives', '_structural', '_deliverableEdit')
   * @param {string|null} excludeFeatureId - When the edit originated from within a deliverable,
   *   pass that featureId so we don't re-generate the source deliverable itself.
   */
  const notifyEdit = useCallback((lessonIdx, key, excludeFeatureId = null) => {
    pendingEditsRef.current.push({ lessonIdx, key, excludeFeatureId });

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
