import { useState, useRef, useCallback, useEffect } from 'react';

// ── Change #1: Inline concurrency limiter (no npm dep) ──
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  }
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
import { buildSyncPlan, DELIVERABLE_OUTBOUND_MAP, computeStaleConfidence } from '../lib/syncDependencies';

/**
 * useSmartSync — Cascade Sync Engine (V1.7.0)
 *
 * Handles two distinct edit sources:
 *
 * 1. COURSE MAP EDITS (learningObjectives, title, etc.)
 *    → Surgically regenerates only affected lessons in affected deliverables (unchanged).
 *
 * 2. DELIVERABLE BODY EDITS (_deliverableEdit key)
 *    → Source tab: fires onRequestProposal callback so an AI suggestion panel
 *      appears for the user to accept/reject (never auto-overwrites).
 *    → Downstream tabs: marked stale immediately (⚠ badge), NOT auto-regenerated.
 *
 * Usage:
 *   const smartSync = useSmartSync({ deliv, gen, courseMapRef, selectedFeatures,
 *     onSyncComplete, onRequestProposal });
 *   // Wire: editor.handleCellEdit → smartSync.notifyEdit(lessonIdx, key)
 *   // Wire: App.jsx onDataChange → smartSync.notifyEdit(lessonIdx, '_deliverableEdit', activeTab, editContext)
 *
 * Exposes:
 *   { syncLog, isSyncing, pendingSyncCount, notifyEdit }
 */
export default function useSmartSync({
  deliv,             // return value of useDeliverables
  gen,               // return value of useGeneration (for gen.isStreaming guard)
  courseMapRef,      // ref to current courseMap (always fresh)
  selectedFeatures,
  onSyncComplete,    // callback(affectedFeatureIds[]) — called when sync batch done
  onRequestProposal, // callback({ featureId, lessonIndex, editContext, courseMap })
                     // — called when a deliverable body edit should show a proposal panel
}) {
  const [syncLog, setSyncLog] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  // ── Change #1: Track which features are actively syncing in parallel ──
  const [syncingFeatures, setSyncingFeatures] = useState(new Set());

  // Accumulate edits between debounce fires
  const pendingEditsRef = useRef([]);
  const debounceTimerRef = useRef(null);
  const isSyncingRef = useRef(false);
  // ── Change #6: Generation ID for race condition guard ──
  // Each runSync cycle gets a unique ID. Passed through to regenerateLesson so
  // stale results from superseded sync cycles can be discarded before writing state.
  const syncGenIdRef = useRef(0);

  // Keep fresh references so the debounce callback always has current values
  const delivRef = useRef(deliv);
  delivRef.current = deliv;
  const genRef = useRef(gen);
  genRef.current = gen;
  const selectedFeaturesRef = useRef(selectedFeatures);
  selectedFeaturesRef.current = selectedFeatures;
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;
  const onRequestProposalRef = useRef(onRequestProposal);
  onRequestProposalRef.current = onRequestProposal;

  const appendSyncLog = useCallback((type, featureId, message) => {
    setSyncLog(prev => [...prev, { type, featureId, message, at: Date.now() }]);
  }, []);

  /**
   * The main sync executor — called after debounce expires.
   * Runs sequentially through the plan, one feature at a time.
   *
   * For _deliverableEdit edits:
   *   - Source tab → fires onRequestProposal (no auto-regen)
   *   - Downstream tabs → marks stale (no auto-regen)
   *
   * For all other edits (course map fields):
   *   - Normal surgical regeneration as before.
   */
  const runSync = useCallback(async () => {
    const currentDeliv = delivRef.current;
    const currentGen = genRef.current;
    const currentFeatures = selectedFeaturesRef.current;
    const currentCourseMap = courseMapRef?.current;

    // Guard: don't start if something is already generating.
    // The reactive useEffect below will re-fire when idle.
    if (currentGen?.isStreaming || currentDeliv?.isGenerating) {
      return;
    }

    if (!currentCourseMap) return;

    const edits = [...pendingEditsRef.current];
    pendingEditsRef.current = [];

    if (edits.length === 0) return;

    // ── Deliverable body edits — proposal + stale path ───────────────────────
    // Separate out _deliverableEdit edits and handle them independently
    // (no entry in the sync plan — they bypass buildSyncPlan entirely).
    const deliverableEdits = edits.filter(e => e.key === '_deliverableEdit' && e.excludeFeatureId);
    const courseMapEdits   = edits.filter(e => !(e.key === '_deliverableEdit' && e.excludeFeatureId));

    if (deliverableEdits.length > 0) {
      // Only the features that have 'done' status qualify for stale marking
      const doneFeatureIds = new Set(
        (currentFeatures || []).filter(f =>
          f !== 'courseMap' && currentDeliv?.deliverables?.[f]?.status === 'done'
        )
      );

      // Group by source featureId — deduplicate (last edit wins for editContext)
      const delivEditBySource = new Map();
      for (const edit of deliverableEdits) {
        const existing = delivEditBySource.get(edit.excludeFeatureId);
        // Keep the one with a real editContext, or the last one
        if (!existing || edit.editContext) {
          delivEditBySource.set(edit.excludeFeatureId, edit);
        }
      }

      for (const [sourceFeatureId, edit] of delivEditBySource.entries()) {
        if (!doneFeatureIds.has(sourceFeatureId)) continue;

        // 1. Fire proposal for source tab (no auto-regen)
        if (onRequestProposalRef.current && edit.lessonIdx != null) {
          onRequestProposalRef.current({
            featureId: sourceFeatureId,
            lessonIndex: edit.lessonIdx,
            editContext: edit.editContext || null,
            courseMap: currentCourseMap,
          });
          appendSyncLog('start', sourceFeatureId,
            `Lesson ${edit.lessonIdx + 1} — AI suggestion requested`
          );
        }

        // 2. Mark outbound tabs stale (no auto-regen)
        // ── Change #3: Compute staleness confidence from the edit type ──
        const delivConfidence = computeStaleConfidence(['_deliverableEdit']);
        const outbound = DELIVERABLE_OUTBOUND_MAP[sourceFeatureId] ?? [];
        for (const fId of outbound) {
          if (doneFeatureIds.has(fId)) {
            currentDeliv.markFeatureStale(fId, delivConfidence);
            appendSyncLog('pending', fId,
              `Lesson ${edit.lessonIdx != null ? edit.lessonIdx + 1 : '?'} — marked out of sync`
            );
          }
        }
      }
    }

    // ── Course map edits — normal surgical regeneration path ─────────────────
    if (courseMapEdits.length === 0) return;

    const priorityIds = new Set(courseMapEdits.map(e => e.excludeFeatureId).filter(Boolean));
    const priorityFeatureId = priorityIds.size === 1 && courseMapEdits.every(e => e.excludeFeatureId)
      ? [...priorityIds][0]
      : null;

    const plan = buildSyncPlan(courseMapEdits, currentFeatures, currentDeliv.deliverables, priorityFeatureId);
    if (plan.length === 0) return;

    // Build human-readable summary of changed fields (for log specificity)
    const FIELD_LABELS = {
      title: 'lesson title', learningObjectives: 'learning objectives',
      weeklyAssessments: 'weekly assessments', topicSection: 'topic/section',
      asyncActivities: 'async activities', syncActivities: 'sync activities',
      supportingResources: 'supporting resources', presentationFormat: 'presentation format',
      learningGoals: 'learning goals', technologyNeeded: 'technology needed',
      evaluateDesign: 'evaluate design', _structural: 'lesson structure',
      sections: 'sections', courseName: 'course name',
      semester: 'semester', courseDescription: 'course description',
    };
    const uniqueFields = [...new Set(courseMapEdits.map(e => FIELD_LABELS[e.key] || e.key))];
    const changedFieldsSummary = uniqueFields.slice(0, 3).join(', ') + (uniqueFields.length > 3 ? '…' : '');

    // ── Change #6: Increment generation ID for this sync cycle ──
    syncGenIdRef.current += 1;
    const currentGenId = syncGenIdRef.current;

    isSyncingRef.current = true;
    setIsSyncing(true);
    setPendingSyncCount(plan.length);

    const completedFeatureIds = [];

    // ── Change #1: Parallel sync across features (sequential within each) ──
    // Max 3 concurrent API calls to avoid rate-limiting.
    // Lessons within a single feature are still sequential (snapshot merge safety).
    const limit = pLimit(3);

    const tasks = plan.map((entry) => limit(async () => {
      const { featureId, lessonIndices } = entry;

      setSyncingFeatures(prev => new Set([...prev, featureId]));

      appendSyncLog('start', featureId, lessonIndices
        ? `Lesson${lessonIndices.length > 1 ? 's' : ''} ${lessonIndices.map(n => n + 1).join(', ')} — ${changedFieldsSummary} changed`
        : `Full update — ${changedFieldsSummary} changed`
      );

      try {
        if (lessonIndices === null) {
          // Structural change — full regen for this feature
          await delivRef.current.generateAll(currentCourseMap, [featureId], null, currentGenId);
        } else {
          // Surgical: regenerate each affected lesson index sequentially within this feature
          for (const lessonIdx of lessonIndices) {
            await delivRef.current.regenerateLesson(featureId, currentCourseMap, lessonIdx, currentGenId);
          }
        }
        appendSyncLog('done', featureId, lessonIndices
          ? `Lesson${lessonIndices.length > 1 ? 's' : ''} ${lessonIndices.map(n => n + 1).join(', ')} synced ✓`
          : 'All lessons synced ✓'
        );
        completedFeatureIds.push(featureId);
      } catch (err) {
        appendSyncLog('error', featureId, err.message || 'Sync failed');
      } finally {
        setSyncingFeatures(prev => {
          const next = new Set(prev);
          next.delete(featureId);
          return next;
        });
      }
    }));

    await Promise.all(tasks);

    isSyncingRef.current = false;
    setIsSyncing(false);
    setPendingSyncCount(0);

    if (completedFeatureIds.length > 0 && onSyncCompleteRef.current) {
      onSyncCompleteRef.current(completedFeatureIds);
    }

    // If new edits arrived while we were syncing, fire another round
    // (only if this is still the latest sync cycle — a newer cycle would have its own re-check)
    if (pendingEditsRef.current.length > 0 && syncGenIdRef.current === currentGenId) {
      debounceTimerRef.current = setTimeout(runSync, 2000);
    }
  }, [appendSyncLog, courseMapRef]);

  /**
   * notifyEdit — called by useCourseMapEditor (course map edits) or
   * App.jsx onDataChange (deliverable body edits) for every edit.
   * Accumulates the edit and (re)starts the 2-second debounce timer.
   *
   * @param {number|null} lessonIdx       — Lesson index (null for structural changes)
   * @param {string}      key             — Field key ('learningObjectives', '_deliverableEdit', etc.)
   * @param {string|null} excludeFeatureId — Source featureId when editing a deliverable body
   * @param {string|null} editContext      — Human-readable change summary ('homework: "3" → "4"')
   */
  const notifyEdit = useCallback((lessonIdx, key, excludeFeatureId = null, editContext = null) => {
    pendingEditsRef.current.push({ lessonIdx, key, excludeFeatureId, editContext });

    // Reset debounce timer
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    // If currently syncing, queue for after completion (handled in runSync)
    if (isSyncingRef.current) return;

    debounceTimerRef.current = setTimeout(runSync, 2000);
  }, [runSync]);

  // ── Reactive idle-watcher (replaces 1.5s polling) ───────────────────────────
  // When generation finishes (isGenerating or isStreaming flips to false) and
  // there are pending edits queued, fire runSync after a short grace delay.
  useEffect(() => {
    const isIdle = !deliv?.isGenerating && !gen?.isStreaming;
    if (isIdle && !isSyncingRef.current && pendingEditsRef.current.length > 0) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(runSync, 300);
    }
  }, [deliv?.isGenerating, gen?.isStreaming, runSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { syncLog, isSyncing, pendingSyncCount, notifyEdit, syncingFeatures };
}
