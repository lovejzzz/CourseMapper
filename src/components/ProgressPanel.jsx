import React, { useState, useRef, useEffect } from 'react';
import GenerationLogPanel from './GenerationLogPanel';
import ExamReview from './ExamReview';
import RevisionChat from './RevisionChat';
import { getCustomDeliverable } from '../lib/customDeliverableLibrary';

// ── SVG icons for activity log entry types ────────────────────────────────────
const LOG_ICONS = {
  start: (
    <svg className="w-3 h-3 text-indigo-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  progress: (
    <svg className="w-3 h-3 text-indigo-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  done: (
    <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  warn: (
    <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  error: (
    <svg className="w-3 h-3 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
    </svg>
  ),
};

const STEPS = [
  { key: 'parsing', label: 'Parsing uploaded files' },
  { key: 'sending', label: 'Sending to AI model' },
  { key: 'generating', label: 'AI is generating course map' },
  { key: 'continuing', label: 'Auto-completing missing lessons' },
  { key: 'examining', label: 'Examining course map for completeness' },
  { key: 'done', label: 'Course map ready' },
];

// Maps featureId → display label
const FEATURE_LABELS = {
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
};

/** Resolve any featureId (built-in or custom) to a human-readable label */
function resolveLabel(id) {
  if (FEATURE_LABELS[id]) return FEATURE_LABELS[id];
  if (id?.startsWith('custom_')) {
    const custom = getCustomDeliverable(id);
    return custom?.name || 'Custom Deliverable';
  }
  return id;
}

// Live elapsed timer for currently generating deliverable
function ElapsedTimer({ startedAt, avgMs }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = now - startedAt;
  const elStr = elapsed < 60000 ? `${(elapsed / 1000).toFixed(0)}s` : `${(elapsed / 60000).toFixed(1)}m`;
  const etaStr = avgMs ? (avgMs < 60000 ? `~${(avgMs / 1000).toFixed(0)}s` : `~${(avgMs / 60000).toFixed(1)}m`) : null;
  return (
    <span className="text-[9px] font-semibold text-indigo-400 animate-pulse tabular-nums">
      {elStr}{etaStr && <span className="text-slate-400 font-normal"> / {etaStr}</span>}
    </span>
  );
}

// Status icon for each deliverable row
function DelivStatusIcon({ status }) {
  if (status === 'done') {
    return (
      <div className="w-5 h-5 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === 'streaming' || status === 'generating') {
    return (
      <div className="w-5 h-5 rounded-full bg-indigo-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="animate-spin w-3 h-3 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="w-5 h-5 rounded-full bg-red-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded-full bg-slate-100/60 flex items-center justify-center flex-shrink-0">
      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
    </div>
  );
}

// Sync cascade log item type → styles
const SYNC_TYPE_STYLES = {
  start:   { bg: 'bg-indigo-50', text: 'text-indigo-600', dot: 'bg-indigo-400', label: 'Updating' },
  done:    { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400', label: 'Updated' },
  error:   { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400', label: 'Failed' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400', label: 'Queued' },
};

// Deliverable log entry type → styles
const DELIV_LOG_STYLES = {
  start:    { text: 'text-indigo-600', bg: 'bg-indigo-50/40' },
  progress: { text: 'text-indigo-500', bg: 'bg-indigo-50/40' },
  done:     { text: 'text-emerald-700', bg: 'bg-emerald-50/40' },
  error:    { text: 'text-red-600', bg: 'bg-red-50/40' },
  warn:     { text: 'text-amber-700', bg: 'bg-amber-50/40' },
  info:     { text: 'text-slate-600', bg: '' },
};

export default function ProgressPanel({
  currentStep, modelName, error,
  courseMap, activeTab, onRevision, onDeliverableRevision, isRevising,
  streamDetail, streamProgress, onStop,
  isStopped, onResume, onClearAll,
  examChanges, pendingExamPatches, onAcceptPatches, onRejectPatch,
  retryInfo, completenessInfo, generationLog, onRetryExamine,
  chatHistory, onChatHistoryChange,
  // Item 3: deliverable generation state
  deliverables, delivProgress, currentDelivFeatures, isDelivGenerating,
  delivGenerationLog, delivTimings,
  // Item 6: cascade sync log
  syncLog, isSyncing, pendingSyncCount, syncingFeatures,
  // Cloud save status (silent — shown inline, not as a separate banner)
  cloudSaveStatus,
  // Stop deliverable generation
  onStopDeliverables,
  // Version history (moved from ExportSidePanel)
  versionHistory, activeVersion, onJumpVersion,
  // Named snapshots (1.4)
  namedSnapshots, onSaveSnapshot, onDeleteSnapshot, onLoadSnapshot,
}) {
  // Track start time for ETA calculation
  const startTimeRef = useRef(null);
  const [eta, setEta] = useState('');
  const [syncExpanded, setSyncExpanded] = useState(false);
  const [delivExpanded, setDelivExpanded] = useState(true);
  const [delivLogExpanded, setDelivLogExpanded] = useState(false);

  // Auto-expand activity log when actively generating deliverables OR cascade syncing
  useEffect(() => {
    if (isDelivGenerating || isSyncing) setDelivLogExpanded(true);
  }, [isDelivGenerating, isSyncing]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [showSnapshotInput, setShowSnapshotInput] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  // Collapsed summary state — auto-collapses when fully done
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const prevAllDoneRef = useRef(false);

  const isDeliverableTab = activeTab && activeTab !== 'courseMap';

  useEffect(() => {
    if ((currentStep === 'generating' || currentStep === 'continuing' || currentStep === 'examining') && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (currentStep === 'done' || !currentStep) {
      startTimeRef.current = null;
      setEta('');
    }
  }, [currentStep]);

  useEffect(() => {
    if (!startTimeRef.current || streamProgress <= 5 || streamProgress >= 100) {
      setEta('');
      return;
    }
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const totalEstimate = elapsed / (streamProgress / 100);
    const remaining = Math.max(Math.round(totalEstimate - elapsed), 0);
    if (remaining < 5) setEta('almost done');
    else if (remaining < 60) setEta(`~${remaining}s left`);
    else setEta(`~${Math.ceil(remaining / 60)}min left`);
  }, [streamProgress]);

  // Auto-expand sync log when cascade events arrive (Item 6)
  const prevSyncLenRef = useRef(0);
  useEffect(() => {
    if (syncLog && syncLog.length > prevSyncLenRef.current) {
      prevSyncLenRef.current = syncLog.length;
      if (!syncExpanded) setSyncExpanded(true);
    }
  }, [syncLog?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentStep && !error) return null;

  // isDone = course map generation finished. isRevising (deliverables/revision) is shown BELOW,
  // but should NOT revert the progress panel back to the "generating steps" view.
  const isDone = currentStep === 'done';

  // Only show the 'continuing' step if auto-continuation is active or was used
  const showContinuing = completenessInfo && (
    currentStep === 'continuing' ||
    completenessInfo.status === 'continuing' ||
    completenessInfo.continuationUsed
  );
  const visibleSteps = showContinuing ? STEPS : STEPS.filter(s => s.key !== 'continuing');
  const currentIdx = visibleSteps.findIndex((s) => s.key === currentStep);

  // Deliverable rows to show (only non-courseMap)
  const delivRows = deliverables
    ? Object.entries(deliverables)
        .filter(([id]) => id !== 'courseMap')
        .map(([id, state]) => ({ id, label: resolveLabel(id), status: state?.status, error: state?.error }))
    : [];

  const allDelivDone = delivRows.length === 0 || (delivRows.length > 0 && !isDelivGenerating && delivRows.every(r => r.status === 'done' || r.status === 'error'));
  const everythingDone = isDone && allDelivDone;

  // Auto-collapse when fully done (with a short delay for the user to see the final state)
  // BUT stay expanded if there are pending exam suggestions awaiting user decision
  const hasPendingSuggestions = pendingExamPatches && pendingExamPatches.patches?.length > 0;
  useEffect(() => {
    if (everythingDone && !prevAllDoneRef.current && !hasPendingSuggestions) {
      prevAllDoneRef.current = true;
      const t = setTimeout(() => setSummaryCollapsed(true), 2200);
      return () => clearTimeout(t);
    }
    if (!everythingDone) {
      prevAllDoneRef.current = false;
      setSummaryCollapsed(false);
    }
  }, [everythingDone, hasPendingSuggestions]);

  // Auto-expand when cascade sync starts (so user can see what's updating)
  const prevIsSyncingRef = useRef(false);
  useEffect(() => {
    if (isSyncing && !prevIsSyncingRef.current) {
      setSummaryCollapsed(false);
    }
    prevIsSyncingRef.current = !!isSyncing;
  }, [isSyncing]);

  // Recent sync entries (last 5)
  const recentSync = syncLog ? [...syncLog].reverse().slice(0, 5) : [];

  // Build summary line for collapsed state
  const lessonCount = completenessInfo?.actual || courseMap?.lessons?.length || 0;
  const delivDoneCount = delivRows.filter(r => r.status === 'done').length;
  const delivErrorCount = delivRows.filter(r => r.status === 'error').length;
  let summaryText = `${lessonCount} lessons generated`;
  if (delivRows.length > 0) {
    if (delivErrorCount > 0) {
      summaryText += ` · ${delivDoneCount}/${delivRows.length} deliverables (${delivErrorCount} failed)`;
    } else {
      summaryText += ` · ${delivDoneCount} deliverable${delivDoneCount !== 1 ? 's' : ''} ready`;
    }
  }

  // Collapsed summary view
  if (isDone && summaryCollapsed) {
    // Determine the most informative sync status line
    const latestSyncEntry = syncLog && syncLog.length > 0 ? syncLog[syncLog.length - 1] : null;
    const syncStatusLabel = isSyncing && latestSyncEntry
      ? `Updating ${resolveLabel(latestSyncEntry.featureId)}…`
      : null;

    return (
      <div className="glass rounded-squircle shadow-glass animate-spring-scale">
        <button
          onClick={() => setSummaryCollapsed(false)}
          className="w-full p-4 flex items-center gap-3 hover:bg-white/20 transition-colors text-left"
        >
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isSyncing ? 'bg-amber-100/80' : 'bg-emerald-100/80'}`}>
            {isSyncing ? (
              <svg className="animate-spin w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${isSyncing ? 'text-amber-600' : 'text-emerald-700'}`}>
              {isSyncing ? (syncStatusLabel || 'Syncing changes…') : isDelivGenerating ? 'Generating deliverables…' : 'Generation complete'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{summaryText}</p>
          </div>
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Revision chat still accessible when collapsed */}
        {(isDone || isStopped) && courseMap && (() => {
          const delivLabel = resolveLabel(activeTab);
          const revHandler = isDeliverableTab && onDeliverableRevision ? onDeliverableRevision : onRevision;
          const placeholder = isDeliverableTab ? `Ask for revisions to ${delivLabel}…` : 'Ask for revisions or drop files…';
          const tabBadge = isDeliverableTab ? delivLabel : 'Course Map';
          return (
            <div>
              <div className="px-4 pt-1 pb-1 flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Revising:</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 truncate max-w-[120px]">{tabBadge}</span>
              </div>
              <RevisionChat onRevision={revHandler} isRevising={isRevising} savedMessages={chatHistory} onMessagesChange={onChatHistoryChange} placeholder={placeholder} courseMap={courseMap} isStopped={isStopped} onResume={onResume} />
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="glass rounded-squircle shadow-glass animate-spring-scale overflow-hidden">
      <div className="p-5 pb-4 min-w-0">
        {/* Header — collapsible when done */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.6}/>
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-slate-800 flex-1">Generation Progress</h2>
          {isDone && (
            <button
              onClick={() => setSummaryCollapsed(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-all"
              title="Collapse"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>

        {isDone ? (
          <div>
            {/* Course map done row — same visual weight as deliverable rows */}
            <div className="flex items-center gap-2 py-1 min-w-0">
              <div className="w-5 h-5 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-emerald-700">Course map ready</span>
              {completenessInfo && (
                <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-pill ${
                  completenessInfo.status === 'complete'
                    ? 'text-emerald-600 bg-emerald-50/60 border border-emerald-100/50'
                    : completenessInfo.status === 'incomplete'
                    ? 'text-amber-600 bg-amber-50/60 border border-amber-100/50'
                    : 'text-slate-500 bg-slate-50/60 border border-slate-200/50'
                }`}>
                  {completenessInfo.status === 'complete' || completenessInfo.actual >= (completenessInfo.expected || 0)
                    ? `${completenessInfo.actual} lessons ✓`
                    : `${completenessInfo.actual}/${completenessInfo.expected || '?'} ⚠`}
                </span>
              )}
              <div className="flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden min-w-0">
                <div className="h-full bg-emerald-500 rounded-full w-full" />
              </div>
            </div>

            {/* Cascade sync active banner */}
            {isSyncing && (
              <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50/80 border border-amber-100/60">
                <svg className="animate-spin w-3 h-3 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-[10px] font-semibold text-amber-600">
                  Auto-syncing {pendingSyncCount > 1 ? `${pendingSyncCount} deliverables` : 'deliverable'}
                  {syncingFeatures?.size > 1 ? ` (${syncingFeatures.size} in parallel)` : ''}…
                </span>
                <span className="text-[9px] text-amber-500 ml-auto">edit detected</span>
              </div>
            )}

            {/* Deliverable generation status */}
            {delivRows.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setDelivExpanded(v => !v)}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Deliverables
                  </span>
                  {isSyncing ? (
                    /* Cascade sync in progress — show amber syncing indicator, not done count */
                    <>
                      <span className="text-[10px] text-amber-500 font-semibold">syncing…</span>
                      <svg className="animate-spin w-3 h-3 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </>
                  ) : isDelivGenerating ? (
                    /* Initial generation — show indigo spinner + count + stop button */
                    <>
                      <span className="text-[10px] text-indigo-500 font-semibold">
                        {delivRows.filter(r => r.status === 'done').length}/{delivRows.length} done
                      </span>
                      <svg className="animate-spin w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </>
                  ) : (
                    /* All done — plain count */
                    <span className="text-[10px] text-slate-400">
                      ({delivRows.filter(r => r.status === 'done').length}/{delivRows.length})
                    </span>
                  )}
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ml-auto ${delivExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Stop deliverable generation button */}
                {isDelivGenerating && onStopDeliverables && (
                  <div className="mb-2">
                    <button
                      onClick={onStopDeliverables}
                      className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-squircle-xs text-[10px] font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                      Stop Deliverables
                    </button>
                  </div>
                )}
                {delivExpanded && (
                  <div className="space-y-1">
                    {delivRows.map(row => {
                      const timing = delivTimings?.[row.id];
                      const doneMs = timing?.durationMs;
                      const isActive = currentDelivFeatures?.has(row.id) && isDelivGenerating;
                      const pf = delivProgress?.perFeature?.[row.id];
                      const chunkPct = pf && pf.chunksTotal > 0 ? Math.round((pf.chunksDone / pf.chunksTotal) * 100) : 0;
                      // Compute avg duration of completed deliverables for ETA
                      const completedDurations = delivTimings ? Object.values(delivTimings).filter(t => t.durationMs).map(t => t.durationMs) : [];
                      const avgMs = completedDurations.length > 0 ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length : null;
                      return (
                        <div key={row.id} className="px-2 py-1 rounded-lg min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                          <DelivStatusIcon status={row.status} />
                          <span className={`text-[11px] font-medium truncate flex-1 min-w-0 ${
                            row.status === 'done' ? 'text-emerald-700'
                            : row.status === 'error' ? 'text-red-500'
                            : row.status === 'streaming' || row.status === 'generating' ? 'text-indigo-600'
                            : 'text-slate-400'
                          }`}>
                            {row.label}
                          </span>
                          <span className="flex-shrink-0 flex items-center gap-1.5">
                            {/* Chunk progress badge */}
                            {pf && pf.chunksTotal > 1 && pf.status !== 'done' && isDelivGenerating && (
                              <span className="text-[9px] text-indigo-400 tabular-nums font-medium">
                                {pf.chunksDone}/{pf.chunksTotal}
                              </span>
                            )}
                            {/* Mini progress bar for active multi-chunk features */}
                            {isActive && pf && pf.chunksTotal > 1 && (
                              <div className="w-12 h-1 bg-indigo-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${chunkPct}%` }} />
                              </div>
                            )}
                            {/* Time spent for completed deliverables */}
                            {doneMs && row.status === 'done' && (
                              <span className="text-[9px] text-emerald-500 font-medium">
                                {doneMs < 60000 ? `${(doneMs / 1000).toFixed(1)}s` : `${(doneMs / 60000).toFixed(1)}m`}
                              </span>
                            )}
                            {/* Elapsed timer for currently generating */}
                            {isActive && timing?.startedAt && (
                              <ElapsedTimer startedAt={timing.startedAt} avgMs={avgMs} />
                            )}
                            {row.error && (
                              <span className="text-[9px] text-red-400 truncate max-w-[80px]" title={row.error}>
                                {row.error}
                              </span>
                            )}
                          </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Cloud save status — subtle inline indicator */}
                {cloudSaveStatus && cloudSaveStatus !== 'idle' && (
                  <div className={`mt-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium ${
                    cloudSaveStatus === 'saving' ? 'text-slate-400' :
                    cloudSaveStatus === 'saved' ? 'text-emerald-500' :
                    cloudSaveStatus === 'error' ? 'text-red-400' : ''
                  }`}>
                    {cloudSaveStatus === 'saving' && (
                      <svg className="animate-spin w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {cloudSaveStatus === 'saved' && (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {cloudSaveStatus === 'error' && (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                      </svg>
                    )}
                    {cloudSaveStatus === 'saving' ? 'Saving project…' :
                     cloudSaveStatus === 'saved' ? 'Project saved' :
                     'Save failed'}
                  </div>
                )}

                {/* Activity Log — merges deliverable generation log + auto-sync entries */}
                {(() => {
                  // Build a unified log: delivGenerationLog entries + syncLog entries (tagged _sync)
                  const delivEntries = (delivGenerationLog || []).map(e => ({ ...e, _origin: 'deliv' }));
                  const syncEntries = (syncLog || []).map(e => ({
                    // Map sync log shape → activity log shape
                    type: e.type === 'done' ? 'done' : e.type === 'error' ? 'error' : 'progress',
                    message: `[Auto-sync] ${resolveLabel(e.featureId)}: ${e.message}`,
                    at: e.at,
                    _origin: 'sync',
                    _syncType: e.type,
                  }));
                  // Merge and sort by timestamp
                  const combined = [...delivEntries, ...syncEntries].sort((a, b) => (a.at || 0) - (b.at || 0));
                  if (combined.length === 0) return null;
                  return (
                    <div className="mt-2">
                      <button
                        onClick={() => setDelivLogExpanded(v => !v)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-500 transition-colors"
                      >
                        <svg className={`w-2.5 h-2.5 transition-transform ${delivLogExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Activity Log
                        {(isDelivGenerating || isSyncing) && (
                          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ml-1 ${isSyncing ? 'bg-amber-400' : 'bg-indigo-400'}`} />
                        )}
                        <span className="text-[9px] font-normal text-slate-300 ml-1">({combined.length})</span>
                      </button>
                      {delivLogExpanded && (
                        <div className="mt-1.5 space-y-px max-h-64 overflow-y-auto">
                          {combined.map((entry, i) => {
                            const isSyncEntry = entry._origin === 'sync';
                            const syncIcon = entry._syncType === 'done' ? 'done' : entry._syncType === 'error' ? 'error' : 'progress';
                            let entryType = isSyncEntry ? syncIcon : (entry.type || 'info');
                            // When all generation is done, stop spinning icons for start/progress entries
                            if (allDelivDone && !isDelivGenerating && !isSyncing && (entryType === 'start' || entryType === 'progress')) {
                              entryType = 'done';
                            }
                            const style = isSyncEntry
                              ? (entry._syncType === 'done' ? { text: 'text-amber-600', bg: 'bg-amber-50/40' }
                                : entry._syncType === 'error' ? { text: 'text-red-500', bg: 'bg-red-50/40' }
                                : { text: 'text-amber-500', bg: 'bg-amber-50/30' })
                              : (DELIV_LOG_STYLES[entry.type] || DELIV_LOG_STYLES.info);
                            const icon = isSyncEntry
                              ? LOG_ICONS[syncIcon]
                              : (LOG_ICONS[entryType] || LOG_ICONS.info);
                            return (
                              <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md ${style.bg}`}>
                                <div className="mt-0.5">{icon}</div>
                                <span className={`text-[11px] leading-relaxed ${style.text} flex-1 min-w-0`}>
                                  {entry.message}
                                </span>
                                {entry.at && (
                                  <span className="text-[9px] text-slate-300 flex-shrink-0 mt-0.5">
                                    {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {generationLog && generationLog.length > 0 && (
              <GenerationLogPanel entries={generationLog} defaultCollapsed={true} />
            )}
            {(pendingExamPatches || (examChanges && examChanges.length > 0)) && (
              <ExamReview
                pendingExamPatches={pendingExamPatches}
                examChanges={examChanges}
                onAcceptPatches={onAcceptPatches}
                onRejectPatch={onRejectPatch}
                onRetryExamine={onRetryExamine}
              />
            )}

            {/* Cascade sync activity — only shown when deliverables section is hidden (no delivGenerationLog yet) */}
            {recentSync.length > 0 && (!delivGenerationLog || delivGenerationLog.length === 0) && (
              <div className="mt-3">
                <button
                  onClick={() => setSyncExpanded(v => !v)}
                  className="flex items-center gap-2 w-full text-left mb-1.5"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auto-sync Activity</span>
                  {syncLog?.some(e => e.type === 'start') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                  )}
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${syncExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {syncExpanded && (
                  <div className="space-y-1">
                    {recentSync.map((entry, i) => {
                      const style = SYNC_TYPE_STYLES[entry.type] || SYNC_TYPE_STYLES.pending;
                      const featLabel = resolveLabel(entry.featureId) || '–';
                      return (
                        <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg ${style.bg}`}>
                          <span className={`w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                          <div className="min-w-0">
                            <span className={`text-[10px] font-semibold ${style.text}`}>{style.label}:</span>
                            <span className="text-[10px] text-slate-600 ml-1">{featLabel}</span>
                            {entry.message && (
                              <p className="text-[9px] text-slate-400 mt-0.5 truncate">{entry.message}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Named Snapshots (1.4) */}
            {onSaveSnapshot && (
              <div className="mt-3 pt-3 border-t border-slate-100/60">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📌</span> Saved Versions
                    {namedSnapshots?.length > 0 && <span className="text-slate-300">({namedSnapshots.length})</span>}
                  </span>
                  <button
                    onClick={() => { setShowSnapshotInput(v => !v); setSnapshotLabel(''); }}
                    className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
                  >
                    {showSnapshotInput ? 'Cancel' : '+ Name'}
                  </button>
                </div>
                {showSnapshotInput && (
                  <div className="flex gap-1.5 mb-2">
                    <input
                      autoFocus
                      type="text"
                      value={snapshotLabel}
                      onChange={e => setSnapshotLabel(e.target.value)}
                      placeholder={'e.g. Fall 2026'}
                      className="flex-1 text-[10px] border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          onSaveSnapshot(snapshotLabel);
                          setShowSnapshotInput(false);
                          setSnapshotLabel('');
                        }
                      }}
                    />
                    <button
                      onClick={() => { onSaveSnapshot(snapshotLabel); setShowSnapshotInput(false); setSnapshotLabel(''); }}
                      className="text-[10px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 px-2 py-1 rounded-md transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}
                {namedSnapshots?.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {namedSnapshots.map(snap => (
                      <div key={snap.id} className="flex items-center gap-1.5 group">
                        <button
                          onClick={() => onLoadSnapshot && onLoadSnapshot(snap)}
                          className="flex-1 text-left px-2 py-1 rounded-md text-[10px] text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate"
                          title={`Restore: ${snap.label}`}
                        >
                          <span className="font-semibold">{snap.label}</span>
                          <span className="ml-1.5 text-slate-400 font-normal">{new Date(snap.savedAt).toLocaleDateString()}</span>
                        </button>
                        <button
                          onClick={() => onDeleteSnapshot && onDeleteSnapshot(snap.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-400 transition-all"
                          title="Delete snapshot"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-400 italic">No saved versions yet. Click "+ Name" to pin the current state.</p>
                )}
              </div>
            )}

            {/* Version History */}
            {versionHistory && versionHistory.length > 1 && (
              <div className="mt-3 pt-3 border-t border-slate-100/60">
                <button
                  onClick={() => setHistoryExpanded(v => !v)}
                  className="flex items-center gap-2 w-full text-left mb-1.5"
                >
                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Version History ({versionHistory.length})
                  </span>
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ml-auto ${historyExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {historyExpanded && (
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {versionHistory.slice().reverse().map((v, ri) => {
                      const idx = versionHistory.length - 1 - ri;
                      const isActive = idx === activeVersion;
                      return (
                        <button
                          key={idx}
                          onClick={() => onJumpVersion && onJumpVersion(idx)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] transition-colors flex items-center gap-2 ${isActive ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                          <span className="truncate flex-1">{v.label || `v${idx + 1}`}</span>
                          <span className="text-[9px] text-slate-400 flex-shrink-0">{new Date(v.savedAt || v.at || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Course map generation steps */}
            <div className="space-y-0.5">
              {visibleSteps.map((step, idx) => {
                let state = 'pending';
                if (error && idx === currentIdx) state = 'error';
                else if (idx < currentIdx) state = 'done';
                else if (idx === currentIdx) state = 'active';

                return (
                  <div key={step.key} className="flex items-center gap-3 py-1.5">
                    <StepIcon state={state} />
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${
                        state === 'done' ? 'text-emerald-600'
                          : state === 'active' ? 'text-indigo-600'
                          : state === 'error' ? 'text-red-500'
                          : 'text-slate-300'
                      }`}>
                        {step.key === 'generating' && modelName
                          ? `${modelName} is generating course map`
                          : step.key === 'continuing' && modelName
                          ? `${modelName} is completing missing lessons`
                          : step.key === 'examining' && modelName
                          ? `${modelName} is examining course map`
                          : step.label}
                      </span>
                      {state === 'active' && (step.key === 'generating' || step.key === 'examining' || step.key === 'continuing') && streamDetail && (
                        <span className="text-xs text-indigo-400 mt-0.5 truncate max-w-[320px]">
                          {streamDetail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Deliverable generation progress while course map generates */}
            {delivRows.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100/60">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Deliverables — generating after course map
                </p>
                <div className="space-y-1">
                  {delivRows.map(row => (
                    <div key={row.id} className="flex items-center gap-2.5 px-2 py-1">
                      <DelivStatusIcon status={row.status} />
                      <span className={`text-[11px] font-medium ${
                        row.status === 'done' ? 'text-emerald-700'
                        : row.status === 'streaming' || row.status === 'generating' ? 'text-indigo-600'
                        : row.status === 'error' ? 'text-red-500'
                        : 'text-slate-300'
                      }`}>
                        {row.label}
                      </span>
                      {currentDelivFeatures?.has(row.id) && isDelivGenerating && delivProgress && (
                        <span className="ml-auto text-[9px] font-semibold text-indigo-400 animate-pulse">
                          Generating…
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generationLog && generationLog.length > 0 && (
              <GenerationLogPanel entries={generationLog} />
            )}

            {isStopped && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${streamProgress || 50}%` }}
                  />
                </div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50/80 px-2.5 py-1 rounded-full flex-shrink-0">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="5" y="4" width="5" height="16" rx="1" />
                    <rect x="14" y="4" width="5" height="16" rx="1" />
                  </svg>
                  Paused
                </span>
              </div>
            )}

            {isStopped && error && (
              <div className="mt-3 px-3.5 py-2.5 rounded-squircle-xs bg-red-50/80 border border-red-200/40 text-xs text-red-600 font-medium animate-spring-in">
                {error}
              </div>
            )}

            {isStopped && (
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  onClick={onResume}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-btn hover:brightness-110 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Continue
                </button>
                <button
                  onClick={onClearAll}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Stop
                </button>
              </div>
            )}

            {retryInfo && (
              <div className="mt-3 flex items-center gap-2.5 px-3.5 py-2.5 rounded-squircle-xs bg-amber-50/80 border border-amber-200/50 animate-spring-in">
                <svg className="animate-spin w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs font-medium text-amber-700">
                  Connection lost — retrying ({retryInfo.attempt}/{retryInfo.max})...
                </span>
              </div>
            )}

            {!isStopped && currentStep && !error && currentStep !== 'done' && (
              <div className="mt-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${(currentStep === 'generating' || currentStep === 'continuing') && streamProgress > 0 ? streamProgress : Math.min(((currentIdx + 1) / visibleSteps.length) * 100, 20)}%` }}
                    />
                  </div>
                  {onStop && (
                    <button
                      onClick={onStop}
                      className="tactile flex items-center gap-1.5 px-3.5 py-1.5 rounded-squircle-xs text-xs font-semibold text-amber-600 bg-amber-50/80 border border-amber-200/40 hover:bg-amber-100/80 transition-all duration-200 flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="5" y="4" width="5" height="16" rx="1" />
                        <rect x="14" y="4" width="5" height="16" rx="1" />
                      </svg>
                      Pause
                    </button>
                  )}
                </div>
                {eta && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                      <path strokeLinecap="round" strokeWidth={1.5} d="M12 6v6l4 2" />
                    </svg>
                    <span className="text-[11px] font-medium text-slate-400">{eta}</span>
                  </div>
                )}
              </div>
            )}

            {/* Live cascade sync log during generation */}
            {recentSync.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100/60">
                <button
                  onClick={() => setSyncExpanded(v => !v)}
                  className="flex items-center gap-2 w-full text-left mb-1.5"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auto-sync Activity</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${syncExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {syncExpanded && (
                  <div className="space-y-1">
                    {recentSync.map((entry, i) => {
                      const style = SYNC_TYPE_STYLES[entry.type] || SYNC_TYPE_STYLES.pending;
                      const featLabel = resolveLabel(entry.featureId) || '–';
                      return (
                        <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg ${style.bg}`}>
                          <span className={`w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                          <div className="min-w-0">
                            <span className={`text-[10px] font-semibold ${style.text}`}>{style.label}:</span>
                            <span className="text-[10px] text-slate-600 ml-1">{featLabel}</span>
                            {entry.message && (
                              <p className="text-[9px] text-slate-400 mt-0.5 truncate">{entry.message}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {(isDone || isStopped) && courseMap && (() => {
        // Determine which revision handler and label to use based on active tab
        const delivLabel = resolveLabel(activeTab);
        const revHandler = isDeliverableTab && onDeliverableRevision
          ? onDeliverableRevision
          : onRevision;
        const placeholder = isDeliverableTab
          ? `Ask for revisions to ${delivLabel}…`
          : 'Ask for revisions or drop files…';
        const tabBadge = isDeliverableTab ? delivLabel : 'Course Map';
        return (
          <div>
            {/* Context label */}
            <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Revising:</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 truncate max-w-[120px]">
                {tabBadge}
              </span>
            </div>
            <RevisionChat
              onRevision={revHandler}
              isRevising={isRevising}
              savedMessages={chatHistory}
              onMessagesChange={onChatHistoryChange}
              placeholder={placeholder}
              courseMap={courseMap}
              isStopped={isStopped}
              onResume={onResume}
            />
          </div>
        );
      })()}
    </div>
  );
}


function StepIcon({ state }) {
  if (state === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === 'active') {
    return (
      <div className="w-6 h-6 rounded-full bg-indigo-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="animate-spin w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-slate-100/60 flex items-center justify-center flex-shrink-0">
      <div className="w-2 h-2 rounded-full bg-slate-200" />
    </div>
  );
}
