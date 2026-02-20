import React, { useState, useRef, useEffect } from 'react';
import GenerationLogPanel from './GenerationLogPanel';
import ExamReview from './ExamReview';
import RevisionChat from './RevisionChat';

// ── Animated "..." for repeating log lines ────────────────────────────────────
function AnimatedDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-5 text-left">{'.'.repeat(frame)}</span>;
}

// ── Collapse consecutive repeat log entries into one row ─────────────────────
// "Still generating X…" messages repeat every 3s — keep only the last one,
// animate it with dots, and show a ×N count if there were multiple.
// Key: group by the base deliverable name (strip token counts, lesson numbers,
// and parenthetical suffixes) so all "Still generating Lesson Plans…" entries
// — even as token counts change — collapse into a single updating row.
function collapseRepeatLog(entries) {
  const result = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isStill = entry.message?.startsWith('Still generating');
    if (isStill) {
      // Strip parenthetical suffixes like "(~1234 tokens received, gpt-5.2)"
      // and also lesson-specific suffixes like "Lesson 3 of 8" to get a stable key
      const baseMsg = entry.message
        .replace(/\s*\(~[^)]+\)/g, '')   // (~123 tokens received, model)
        .replace(/\s*\([^)]*\)/g, '')     // any other parenthetical
        .trim();
      if (result.length > 0) {
        const prev = result[result.length - 1];
        // Group with any previous "Still generating" entry with same base message
        if (prev.baseMessage === baseMsg) {
          result[result.length - 1] = {
            ...entry,
            baseMessage: baseMsg,
            isRepeating: true,
            repeatCount: (prev.repeatCount || 1) + 1,
          };
          continue;
        }
      }
      result.push({ ...entry, baseMessage: baseMsg, isRepeating: true, repeatCount: 1 });
    } else {
      result.push(entry);
    }
  }
  // Mark only the very last entry in the full list as "actively animating"
  // (earlier collapsed entries should show ×N but not animate)
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].isRepeating) result[i] = { ...result[i], isRepeating: false };
  }
  return result;
}

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
  start:    { text: 'text-slate-400', dot: 'bg-slate-300' },
  progress: { text: 'text-indigo-500', dot: 'bg-indigo-400' },
  done:     { text: 'text-emerald-600', dot: 'bg-emerald-400' },
  error:    { text: 'text-red-500', dot: 'bg-red-400' },
  warn:     { text: 'text-amber-600', dot: 'bg-amber-400' },
  info:     { text: 'text-slate-500', dot: 'bg-slate-300' },
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
  deliverables, delivProgress, currentDelivFeature, isDelivGenerating,
  delivGenerationLog, delivTimings,
  // Item 6: cascade sync log
  syncLog, isSyncing, pendingSyncCount,
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

  // Auto-expand generation log when actively generating deliverables
  useEffect(() => {
    if (isDelivGenerating) setDelivLogExpanded(true);
  }, [isDelivGenerating]);
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
        .map(([id, state]) => ({ id, label: FEATURE_LABELS[id] || id, status: state?.status, error: state?.error }))
    : [];

  const allDelivDone = delivRows.length === 0 || (delivRows.length > 0 && !isDelivGenerating && delivRows.every(r => r.status === 'done' || r.status === 'error'));
  const everythingDone = isDone && allDelivDone;

  // Auto-collapse when fully done (with a short delay for the user to see the final state)
  useEffect(() => {
    if (everythingDone && !prevAllDoneRef.current) {
      prevAllDoneRef.current = true;
      const t = setTimeout(() => setSummaryCollapsed(true), 2200);
      return () => clearTimeout(t);
    }
    if (!everythingDone) {
      prevAllDoneRef.current = false;
      setSummaryCollapsed(false);
    }
  }, [everythingDone]);

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
      ? `Updating ${FEATURE_LABELS[latestSyncEntry.featureId] || latestSyncEntry.featureId}…`
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
          const delivLabel = FEATURE_LABELS[activeTab] || activeTab;
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
                  Auto-syncing {pendingSyncCount > 1 ? `${pendingSyncCount} deliverables` : 'deliverable'}…
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
                  {isDelivGenerating ? (
                    <span className="text-[10px] text-indigo-500 font-semibold">
                      {delivRows.filter(r => r.status === 'done').length}/{delivRows.length} done
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      ({delivRows.filter(r => r.status === 'done').length}/{delivRows.length})
                    </span>
                  )}
                  {isDelivGenerating && (
                    <svg className="animate-spin w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ml-auto ${delivExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {delivExpanded && (
                  <div className="space-y-1">
                    {delivRows.map(row => {
                      const timing = delivTimings?.[row.id];
                      const doneMs = timing?.durationMs;
                      const isActive = row.id === currentDelivFeature && isDelivGenerating;
                      // Compute avg duration of completed deliverables for ETA
                      const completedDurations = delivTimings ? Object.values(delivTimings).filter(t => t.durationMs).map(t => t.durationMs) : [];
                      const avgMs = completedDurations.length > 0 ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length : null;
                      // Latest log entry for the active deliverable — show inline
                      const latestLogEntry = isActive && delivGenerationLog && delivGenerationLog.length > 0
                        ? delivGenerationLog[delivGenerationLog.length - 1]
                        : null;
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
                            {/* Time spent for completed deliverables */}
                            {doneMs && row.status === 'done' && (
                              <span className="text-[9px] text-emerald-500 font-medium">
                                {doneMs < 60000 ? `${(doneMs / 1000).toFixed(1)}s` : `${(doneMs / 60000).toFixed(1)}m`}
                              </span>
                            )}
                            {/* Elapsed + ETA for currently generating */}
                            {isActive && timing?.startedAt && (
                              <ElapsedTimer startedAt={timing.startedAt} avgMs={avgMs} />
                            )}
                            {/* Pending ETA based on average */}
                            {!isActive && !doneMs && row.status !== 'error' && avgMs && isDelivGenerating && (
                              <span className="text-[9px] text-slate-400">
                                ~{avgMs < 60000 ? `${(avgMs / 1000).toFixed(0)}s` : `${(avgMs / 60000).toFixed(1)}m`}
                              </span>
                            )}
                            {row.error && (
                              <span className="text-[9px] text-red-400 truncate max-w-[80px]" title={row.error}>
                                {row.error}
                              </span>
                            )}
                          </span>
                          </div>
                          {/* Inline current activity subtitle for active deliverable */}
                          {latestLogEntry && (
                            <p className="text-[10px] text-slate-400 italic mt-0.5 ml-6 truncate overflow-hidden">
                              {latestLogEntry.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Deliverable generation log — richer detail */}
                {delivGenerationLog && delivGenerationLog.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setDelivLogExpanded(v => !v)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-500 transition-colors"
                    >
                      <svg className={`w-2.5 h-2.5 transition-transform ${delivLogExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Activity Log
                      {isDelivGenerating && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse ml-1" />}
                    </button>
                    {delivLogExpanded && (
                      <div className="mt-1.5 space-y-0.5 max-h-56 overflow-y-auto">
                        {collapseRepeatLog(delivGenerationLog).map((entry, i) => {
                          const style = DELIV_LOG_STYLES[entry.type] || DELIV_LOG_STYLES.info;
                          return (
                            <div key={i} className="flex items-start gap-2 px-2 py-1 rounded-md hover:bg-slate-50/60">
                              <span className={`w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                              <span className={`text-[10px] leading-relaxed ${style.text} flex items-center gap-1`}>
                                {entry.baseMessage || entry.message}
                                {entry.isRepeating && (
                                  <AnimatedDots />
                                )}
                                {entry.repeatCount > 1 && !entry.isRepeating && (
                                  <span className="text-[9px] text-slate-300 ml-1">×{entry.repeatCount}</span>
                                )}
                              </span>
                              {entry.at && (
                                <span className="ml-auto text-[9px] text-slate-300 flex-shrink-0">
                                  {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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

            {/* Cascade sync activity */}
            {recentSync.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setSyncExpanded(v => !v)}
                  className="flex items-center gap-2 w-full text-left mb-1.5"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auto-sync Activity</span>
                  {syncLog?.some(e => e.type === 'start') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                  )}
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${syncExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {syncExpanded && (
                  <div className="space-y-1">
                    {recentSync.map((entry, i) => {
                      const style = SYNC_TYPE_STYLES[entry.type] || SYNC_TYPE_STYLES.pending;
                      const featLabel = FEATURE_LABELS[entry.featureId] || entry.featureId || '–';
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
                      {row.id === currentDelivFeature && isDelivGenerating && delivProgress && (
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
                <span className="text-xs font-semibold text-amber-600 bg-amber-50/80 px-2.5 py-1 rounded-full flex-shrink-0">
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
                  Resume
                </button>
                <button
                  onClick={onClearAll}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear All
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
                      className="tactile flex items-center gap-1.5 px-3.5 py-1.5 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200 flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                      Stop
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
                      const featLabel = FEATURE_LABELS[entry.featureId] || entry.featureId || '–';
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
        const delivLabel = FEATURE_LABELS[activeTab] || activeTab;
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
