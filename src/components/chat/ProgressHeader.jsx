import React, { useState, useEffect } from 'react';
import { resolveLabel, STEPS } from './constants';

/**
 * ProgressHeader — Compact collapsible progress bar at the top of the chat panel.
 * Shows overall generation progress + optional expanded deliverable list.
 */
export function getDeliverableDoneCount({ delivRows = [], delivProgress = null, isDelivGenerating = false }) {
  const progressTerminalCount = delivProgress?.perFeature
    ? Object.values(delivProgress.perFeature).filter(
        (feature) => feature?.status === 'done' || feature?.status === 'error',
      ).length
    : 0;
  const progressDoneCount = delivProgress?.total
    ? Math.min(Math.max(delivProgress.done || 0, progressTerminalCount), delivProgress.total)
    : null;
  const stateDoneCount = delivRows.filter((r) => r.status === 'done' || r.status === 'error').length;
  return isDelivGenerating && progressDoneCount !== null ? progressDoneCount : stateDoneCount;
}

export function getProgressDisplayStatus(rowStatus, progressStatus) {
  return progressStatus === 'done' ? 'done' : rowStatus;
}

export default function ProgressHeader({
  currentStep,
  modelName,
  streamProgress,
  streamDetail,
  completenessInfo,
  error,
  isStopped,
  retryInfo,
  deliverables,
  delivProgress,
  currentDelivFeatures,
  isDelivGenerating,
  delivTimings,
  packageQualityPass,
  onStop,
  onResume,
  onClearAll,
  onStopDeliverables,
  isSyncing,
  pendingSyncCount,
  syncingFeatures,
}) {
  const [expanded, setExpanded] = useState(false);

  const isDone = currentStep === 'done';
  const showContinuing =
    completenessInfo &&
    (currentStep === 'continuing' || completenessInfo.status === 'continuing' || completenessInfo.continuationUsed);
  const visibleSteps = showContinuing ? STEPS : STEPS.filter((s) => s.key !== 'continuing');
  const currentIdx = visibleSteps.findIndex((s) => s.key === currentStep);

  // Deliverable rows
  const delivRows = deliverables
    ? Object.entries(deliverables)
        .filter(([id]) => id !== 'courseMap')
        .map(([id, state]) => ({
          id,
          label: resolveLabel(id),
          status: state?.status,
          error: state?.error,
        }))
    : [];

  const delivDoneCount = getDeliverableDoneCount({ delivRows, delivProgress, isDelivGenerating });
  const allDelivDone =
    delivRows.length > 0 && !isDelivGenerating && delivRows.every((r) => r.status === 'done' || r.status === 'error');
  const isPackageQualityRunning = packageQualityPass?.status === 'running';
  const hasPackageQualityIssues =
    packageQualityPass?.status === 'blocked' || packageQualityPass?.blockers > 0 || packageQualityPass?.warnings > 0;
  const everythingDone = isDone && (delivRows.length === 0 || allDelivDone) && !isPackageQualityRunning;
  const totalLessons = completenessInfo?.actual || 0;

  // Compute overall progress %
  const totalUnits = 1 + delivRows.length; // 1 for course map + N deliverables
  let progressFill = 0;
  if (isDone) {
    progressFill = (1 + delivDoneCount) / totalUnits;
  } else {
    const stepFraction = currentIdx >= 0 ? currentIdx / visibleSteps.length : 0;
    const cmProgress =
      streamProgress > 0 ? stepFraction + (streamProgress / 100) * (1 / visibleSteps.length) : stepFraction;
    progressFill = cmProgress / totalUnits;
  }
  const progressPct = Math.min(Math.round(progressFill * 100), 100);

  // Phase label
  let phaseLabel = 'Generating...';
  if (error) phaseLabel = 'Error';
  else if (isStopped) phaseLabel = 'Paused';
  else if (isSyncing) phaseLabel = 'Syncing...';
  else if (isPackageQualityRunning) phaseLabel = 'Final quality pass...';
  else if (hasPackageQualityIssues) phaseLabel = 'Ready with warnings';
  else if (everythingDone) phaseLabel = 'Complete';
  else if (isDone && isDelivGenerating) phaseLabel = `Deliverables ${delivDoneCount}/${delivRows.length}`;
  else if (isDone) phaseLabel = 'Course map ready';
  else if (currentStep === 'parsing') phaseLabel = 'Parsing files...';
  else if (currentStep === 'sending') phaseLabel = 'Sending to AI...';
  else if (currentStep === 'generating') phaseLabel = modelName ? `${modelName} generating...` : 'Generating...';
  else if (currentStep === 'examining') phaseLabel = 'Examining completeness...';
  else if (currentStep === 'continuing') phaseLabel = 'Completing missing lessons...';

  // Color scheme
  const barColor = error
    ? 'from-red-400 to-red-500'
    : isStopped
      ? 'from-amber-400 to-orange-500'
      : hasPackageQualityIssues
        ? 'from-amber-400 to-orange-500'
        : everythingDone
          ? 'from-emerald-400 to-emerald-500'
          : 'from-indigo-500 to-violet-500';

  const textColor = error
    ? 'text-red-600'
    : isStopped
      ? 'text-amber-600'
      : isPackageQualityRunning
        ? 'text-indigo-600'
        : hasPackageQualityIssues
          ? 'text-amber-600'
          : everythingDone
            ? 'text-emerald-700'
            : 'text-indigo-600';

  // Don't render if generation hasn't started
  if (!currentStep && !error) return null;

  return (
    <div className="flex-shrink-0 border-b border-slate-200/40">
      {/* Compact bar — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors text-left"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse generation progress' : 'Expand generation progress'}
      >
        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-0">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
            style={{ width: `${everythingDone ? 100 : progressPct}%` }}
          />
        </div>
        {/* Phase label + count */}
        <span
          data-testid="progress-phase-label"
          className={`text-[12px] font-semibold ${textColor} flex-shrink-0 whitespace-nowrap`}
        >
          {phaseLabel}
        </span>
        {/* Expand chevron */}
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded: detailed status */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 animate-spring-in">
          {/* Stream detail text */}
          {!isDone && streamDetail && <p className="text-[12px] text-indigo-400 truncate">{streamDetail}</p>}

          {/* Stopped controls */}
          {isStopped && (
            <div className="flex items-center gap-2">
              <button
                onClick={onResume}
                className="tactile flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-btn hover:brightness-110 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Continue
              </button>
              <button
                onClick={onClearAll}
                className="tactile flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all"
              >
                Stop
              </button>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50/80 border border-red-200/40 text-[12px] text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Retry banner */}
          {retryInfo && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50/80 border border-amber-200/50">
              <svg className="animate-spin w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-[12px] font-medium text-amber-700">
                Retrying ({retryInfo.attempt}/{retryInfo.max})...
              </span>
            </div>
          )}

          {/* Pause button during generation */}
          {!isDone && !isStopped && !error && onStop && (
            <div className="flex justify-end">
              <button
                onClick={onStop}
                className="tactile flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-semibold text-amber-600 bg-amber-50/80 border border-amber-200/40 hover:bg-amber-100/80 transition-all"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="4" width="5" height="16" rx="1" />
                  <rect x="14" y="4" width="5" height="16" rx="1" />
                </svg>
                Pause
              </button>
            </div>
          )}

          {/* Course map status */}
          {isDone && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[12px] font-medium text-emerald-700">Course map ready</span>
              {completenessInfo && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    completenessInfo.status === 'complete'
                      ? 'text-emerald-600 bg-emerald-50/60'
                      : 'text-amber-600 bg-amber-50/60'
                  }`}
                >
                  {completenessInfo.actual} lessons
                </span>
              )}
            </div>
          )}

          {/* Sync banner */}
          {isSyncing && (
            <div className="px-2.5 py-2 rounded-lg bg-amber-50/80 border border-amber-100/60">
              <div className="flex items-center gap-2">
                <svg className="animate-spin w-3 h-3 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-[12px] font-semibold text-amber-600">
                  Syncing {pendingSyncCount > 1 ? `${pendingSyncCount} deliverables` : 'deliverable'}
                </span>
              </div>
              {syncingFeatures && syncingFeatures.size > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[...syncingFeatures].map((fId) => (
                    <span
                      key={fId}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100/60 text-[11px] font-medium text-amber-700"
                    >
                      <svg className="animate-spin w-2.5 h-2.5 text-amber-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      {resolveLabel(fId)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {packageQualityPass?.message && (
            <div
              className={`px-2.5 py-2 rounded-lg border ${
                isPackageQualityRunning
                  ? 'bg-indigo-50/80 border-indigo-100/70 text-indigo-700'
                  : hasPackageQualityIssues
                    ? 'bg-amber-50/80 border-amber-100/70 text-amber-700'
                    : 'bg-emerald-50/80 border-emerald-100/70 text-emerald-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {isPackageQualityRunning && (
                  <svg className="animate-spin w-3 h-3 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span className="text-[12px] font-semibold">{packageQualityPass.message}</span>
              </div>
            </div>
          )}

          {/* Deliverable rows */}
          {delivRows.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deliverables</span>
                {isDelivGenerating && onStopDeliverables && (
                  <button
                    onClick={onStopDeliverables}
                    className="text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors"
                  >
                    Stop
                  </button>
                )}
              </div>
              {delivRows.map((row) => {
                const isActive = currentDelivFeatures?.has(row.id) && isDelivGenerating;
                const timing = delivTimings?.[row.id];
                const pf = delivProgress?.perFeature?.[row.id];
                const progressStatus = pf?.status;
                const displayStatus = getProgressDisplayStatus(row.status, progressStatus);
                const doneMs = timing?.durationMs;
                return (
                  <div key={row.id} className="flex items-center gap-2 py-0.5">
                    {/* Status icon */}
                    {displayStatus === 'done' ? (
                      <svg
                        className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isActive || (isDelivGenerating && progressStatus === 'merging') ? (
                      <svg
                        className="animate-spin w-3.5 h-3.5 text-indigo-500 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : row.status === 'error' ? (
                      <svg
                        className="w-3.5 h-3.5 text-red-500 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      </div>
                    )}
                    {/* Label */}
                    <span
                      className={`text-[12px] font-medium truncate flex-1 ${
                        displayStatus === 'done'
                          ? 'text-emerald-700'
                          : row.status === 'error'
                            ? 'text-red-500'
                            : isActive
                              ? 'text-indigo-600'
                              : 'text-slate-400'
                      }`}
                    >
                      {row.label}
                    </span>
                    {/* Lesson progress (derived from chunk progress) */}
                    {pf && pf.chunksTotal > 1 && pf.status !== 'done' && isDelivGenerating && totalLessons > 0 && (
                      <span className="text-[11px] text-indigo-400 tabular-nums font-medium">
                        {Math.min(Math.round((pf.chunksDone / pf.chunksTotal) * totalLessons), totalLessons)}/
                        {totalLessons}
                      </span>
                    )}
                    {/* Done timing */}
                    {doneMs && row.status === 'done' && (
                      <span className="text-[11px] text-emerald-500 font-medium">
                        {doneMs < 60000 ? `${(doneMs / 1000).toFixed(1)}s` : `${(doneMs / 60000).toFixed(1)}m`}
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
  );
}
