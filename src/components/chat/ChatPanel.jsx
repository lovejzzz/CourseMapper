import React, { lazy, Suspense, useEffect, useRef, useCallback, useMemo } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import CustomToolsMenu from './CustomToolsMenu';
import useChatRouter from './useChatRouter';
import ExamReview from '../ExamReview';
import { executeAction } from '../../lib/agentActions';
import { resolveLabel } from './constants';
import { evaluateWorkspaceReadiness } from '../../lib/deliverableReadiness';

const ProgressHeader = lazy(() => import('./ProgressHeader'));

function activeTabLabel(activeTab) {
  if (!activeTab) return 'Course Map';
  return resolveLabel(activeTab);
}

function latestRunningStep(steps = []) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.status === 'running') return steps[i];
  }
  return null;
}

function deriveAgentStatus(progress, isStreaming, isAgentMode, agentDryRun = false) {
  if (!isAgentMode) return { label: 'Ask', tone: 'slate', detail: 'Ready to help' };
  if (agentDryRun && !progress && !isStreaming) return { label: 'Review only', tone: 'slate', detail: 'No edits' };
  if (!progress && !isStreaming) return { label: 'Ready', tone: 'emerald', detail: 'Auto-fix on' };
  if (progress?.status === 'error') return { label: 'Needs review', tone: 'red', detail: 'Check the latest turn' };
  if (progress?.status === 'complete') {
    const hasIssues = progress.steps?.some((step) => step.status === 'error' || step.status === 'partial');
    return hasIssues
      ? { label: 'Review', tone: 'amber', detail: 'Finished with issues' }
      : { label: 'Done', tone: 'emerald', detail: 'Last turn complete' };
  }
  const running = latestRunningStep(progress?.steps);
  return {
    label: running?.label || running?.tool || 'Working',
    tone: 'indigo',
    detail: progress?.steps?.length ? 'Live progress in chat' : 'Thinking',
  };
}

function summarizePackageQuality(readiness, repairsApplied = 0) {
  const repairText =
    repairsApplied > 0 ? `Auto-fixed ${repairsApplied} safe issue${repairsApplied === 1 ? '' : 's'}. ` : '';
  if (!readiness) return `${repairText}Final quality pass complete.`;
  if (readiness.blockers?.length > 0) {
    return `${repairText}${readiness.blockers.length} critical issue${readiness.blockers.length === 1 ? '' : 's'} still need review.`;
  }
  if (readiness.warnings?.length > 0) {
    return `${repairText}${readiness.warnings.length} note${readiness.warnings.length === 1 ? '' : 's'} need review.`;
  }
  return `${repairText}Workspace is ready to export.`;
}

const STATUS_TONES = {
  slate: 'bg-slate-100 text-slate-500 border-slate-200/70',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/70',
  red: 'bg-red-50 text-red-700 border-red-200/70',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
};

/**
 * ChatPanel — Unified chat interface replacing ProgressPanel + RevisionChat + HelpDrawer.
 * Handles: generation progress (header), help questions (Ask mode), agent actions (Revise mode),
 * file uploads, and inline progress cards.
 */
export default function ChatPanel({
  // Generation state
  currentStep,
  modelName,
  error,
  streamDetail,
  streamProgress,
  completenessInfo,
  isStopped,
  retryInfo,
  generationLog,
  // Generation controls
  onStop,
  onResume,
  onClearAll,
  onRetryExamine,
  // Deliverable state
  deliverables,
  selectedFeatures,
  columns,
  deliverableConfig,
  lessonScope,
  delivProgress,
  currentDelivFeatures,
  isDelivGenerating,
  delivTimings,
  packageQualityPass,
  onStopDeliverables,
  onPackageQualityPassUpdate,
  onAutoRepairReadiness,
  onFinalizePackage,
  // Sync state
  isSyncing,
  pendingSyncCount,
  syncingFeatures,
  // Revision
  onRevision,
  onDeliverableRevision,
  isRevising,
  activeTab,
  courseMap,
  slideTheme,
  // Chat state
  chatHistory,
  onChatHistoryChange,
  // Exam review
  pendingExamPatches,
  examChanges,
  onAcceptPatches,
  onRejectPatch,
  onFocusExamPatch,
  // Agent: course map editor + deliverable update
  editor,
  optimisticUpdate,
  regenerateLesson,
  // Agent phase 2: undo + highlight
  delivUndoSnapshot,
  delivUndoFn,
  delivCanUndo,
  onAgentHighlight,
  // Agent-mediated sync
  pendingSyncSuggestion,
  clearPendingSyncSuggestion,
  executeSyncPlan,
  notifyEdit,
  // External ref for sending messages from outside (e.g., context menu)
  chatSendRef,
  // User ID for cloud sync
  uid,
  onConfigureAI,
}) {
  // Detect agent mode: deliverables with done status exist
  const isAgentMode = !!(
    deliverables && Object.keys(deliverables).some((k) => k !== 'courseMap' && deliverables[k]?.status === 'done')
  );

  // Keep refs for values that can change between parallel tool calls in the same agent turn
  const delivRef = useRef(deliverables);
  delivRef.current = deliverables;
  const courseMapRef = useRef(courseMap);
  courseMapRef.current = courseMap;
  const autoRepairReadinessRef = useRef(onAutoRepairReadiness);
  autoRepairReadinessRef.current = onAutoRepairReadiness;
  const finalizePackageRef = useRef(onFinalizePackage);
  finalizePackageRef.current = onFinalizePackage;
  const packageQualityPassUpdateRef = useRef(onPackageQualityPassUpdate);
  packageQualityPassUpdateRef.current = onPackageQualityPassUpdate;

  // Build the action executor that agent mode uses
  const execAction = useCallback(
    (action, opts = {}) => {
      const result = executeAction(action, {
        editor,
        deliverables: delivRef.current,
        optimisticUpdate,
        courseMap: courseMapRef.current,
        regenerateLesson,
        snapshot: delivUndoSnapshot,
        skipSnapshot: opts.skipSnapshot || false,
      });
      // Trigger visual highlight on success
      if (result.success && onAgentHighlight && action.featureId) {
        onAgentHighlight(action.featureId, action.lessonIndex ?? null);
      }
      return result;
    },
    [editor, optimisticUpdate, regenerateLesson, delivUndoSnapshot, onAgentHighlight],
  );

  const chat = useChatRouter({
    courseMap,
    activeTab,
    onRevision,
    onDeliverableRevision,
    isStopped,
    onResume,
    savedMessages: chatHistory,
    onMessagesChange: onChatHistoryChange,
    // Agent params
    deliverables,
    selectedFeatures,
    columns,
    deliverableConfig,
    lessonScope,
    executeAction: execAction,
    optimisticUpdate,
    delivUndoSnapshot,
    delivUndoFn,
    executeSyncPlan,
    notifyEdit,
    slideTheme,
    uid,
  });

  // ── Expose chat.send to parent via ref (for context menu inline AI) ──
  useEffect(() => {
    if (!chatSendRef) return;
    chatSendRef.current = (prompt, options = {}) => {
      if (options.forceApplyMode) {
        chat.setAgentDryRun(false);
      }
      return chat.send(prompt, options);
    };
  }, [chat, chatSendRef]);

  // ── Bridge sync suggestion from useSmartSync into chat messages ──
  useEffect(() => {
    if (pendingSyncSuggestion) {
      chat.pushSyncSuggestion(pendingSyncSuggestion);
      clearPendingSyncSuggestion?.();
    }
    // Intentionally depends only on pendingSyncSuggestion: chat.pushSyncSuggestion and
    // clearPendingSyncSuggestion are stable refs/callbacks. Including them would trigger
    // spurious re-fires when the chat object identity changes during re-renders.
  }, [pendingSyncSuggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proactive agent: auto-review after deliverable generation completes ──
  const prevDelivGeneratingRef = useRef(isDelivGenerating);
  const proactiveReviewDoneRef = useRef(false);
  const autoReviewTimerRef = useRef(null);
  const applyDeterministicReadinessRepairs = useCallback(() => {
    if (typeof autoRepairReadinessRef.current !== 'function') {
      return {
        changed: false,
        applied: 0,
        repairs: [],
        courseMap: courseMapRef.current,
        deliverables: delivRef.current,
      };
    }
    return autoRepairReadinessRef.current({
      selectedFeatureIds: selectedFeatures,
      lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
    });
  }, [selectedFeatures, lessonScope]);
  // If the user types and sends during the 2s delay, we cancel the auto-review
  // so we don't double-post a message on top of their own. Also keeps the
  // proactiveReviewDoneRef flipped so we don't re-schedule later.
  useEffect(() => {
    if (chat.isStreaming && autoReviewTimerRef.current) {
      clearTimeout(autoReviewTimerRef.current);
      autoReviewTimerRef.current = null;
      packageQualityPassUpdateRef.current?.({
        status: 'idle',
        message: 'Manual agent work started before the automatic final pass.',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
    }
  }, [chat.isStreaming]);
  useEffect(() => {
    const wasGenerating = prevDelivGeneratingRef.current;
    prevDelivGeneratingRef.current = isDelivGenerating;
    if (!wasGenerating && isDelivGenerating) {
      proactiveReviewDoneRef.current = false;
    }

    // Detect transition: generating → done (only trigger once per session)
    if (wasGenerating && !isDelivGenerating && isAgentMode && !chat.isStreaming && !proactiveReviewDoneRef.current) {
      const doneCount = deliverables ? Object.values(deliverables).filter((d) => d?.status === 'done').length : 0;
      if (doneCount >= 2) {
        proactiveReviewDoneRef.current = true;
        packageQualityPassUpdateRef.current?.({
          status: 'running',
          message: 'Final quality pass is checking and repairing materials...',
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });
        // Brief delay to let UI settle, then run the finalizer — but cancel if the
        // user beats us to the punch by sending their own message.
        autoReviewTimerRef.current = setTimeout(async () => {
          autoReviewTimerRef.current = null;
          if (chat.isStreaming) {
            const repairResult = applyDeterministicReadinessRepairs();
            const lessonFilter = lessonScope?.type === 'specific' ? lessonScope.indices : null;
            const readiness = evaluateWorkspaceReadiness({
              courseMap: repairResult?.courseMap || courseMapRef.current,
              deliverables: repairResult?.deliverables || delivRef.current,
              selectedFeatures,
              columns,
              lessonFilter,
            });
            packageQualityPassUpdateRef.current?.({
              status: readiness.status,
              message: summarizePackageQuality(readiness, repairResult?.applied || 0),
              repairsApplied: repairResult?.applied || 0,
              warnings: readiness.warnings.length,
              blockers: readiness.blockers.length,
            });
            return;
          }
          if (typeof finalizePackageRef.current !== 'function') {
            const repairResult = applyDeterministicReadinessRepairs();
            const lessonFilter = lessonScope?.type === 'specific' ? lessonScope.indices : null;
            const readiness = evaluateWorkspaceReadiness({
              courseMap: repairResult?.courseMap || courseMapRef.current,
              deliverables: repairResult?.deliverables || delivRef.current,
              selectedFeatures,
              columns,
              lessonFilter,
            });
            packageQualityPassUpdateRef.current?.({
              status: readiness.status,
              message: summarizePackageQuality(readiness, repairResult?.applied || 0),
              repairsApplied: repairResult?.applied || 0,
              warnings: readiness.warnings.length,
              blockers: readiness.blockers.length,
            });
            return;
          }
          try {
            await finalizePackageRef.current({
              selectedFeatures,
              selectedFeatureIds: selectedFeatures,
              lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
              retry: true,
            });
          } catch (err) {
            packageQualityPassUpdateRef.current?.({
              status: 'blocked',
              message: err?.message || 'Final quality pass could not complete.',
              repairsApplied: 0,
              warnings: 0,
              blockers: 1,
            });
          }
        }, 2000);
      }
    }
  }, [isDelivGenerating]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (autoReviewTimerRef.current) clearTimeout(autoReviewTimerRef.current);
    },
    [],
  );

  const showProgressHeader = !!(currentStep || error);

  // Extract latest agent progress for the fixed status area (not in chat scroll)
  const latestAgentProgress = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'agentProgress') return chat.messages[i];
    }
    return null;
  }, [chat.messages]);
  const agentStatus =
    isAgentMode && !chat.isAgentProviderReady
      ? { label: 'Configure', tone: 'amber', detail: 'Provider/key required' }
      : deriveAgentStatus(latestAgentProgress, chat.isStreaming, isAgentMode, chat.agentDryRun);

  return (
    <div
      className="flex flex-col h-full bg-white/72 backdrop-blur-xl rounded-squircle shadow-glass overflow-hidden"
      data-print="hide"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-200/40 flex-shrink-0">
        <div
          className={`w-7 h-7 rounded-xl flex items-center justify-center ${
            isAgentMode ? 'bg-indigo-50' : 'bg-slate-100'
          }`}
        >
          {isAgentMode ? (
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 truncate">{isAgentMode ? 'Agent' : 'Assistant'}</h2>
            <span
              className={`max-w-[150px] truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONES[agentStatus.tone]}`}
            >
              {agentStatus.label}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 -mt-0.5 truncate">
            {isAgentMode ? `${activeTabLabel(activeTab)} · ${agentStatus.detail}` : agentStatus.detail}
          </p>
        </div>
        {chat.isStreaming && (
          <button
            type="button"
            onClick={chat.handleStop}
            className="group flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-violet-600 hover:text-red-600 hover:bg-red-50/80 border border-transparent hover:border-red-200/60 transition-all duration-150"
            title="Stop generation"
            aria-label="Stop generation"
          >
            <span className="relative w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-violet-400 group-hover:hidden animate-pulse" />
              <span className="absolute inset-0 rounded-sm bg-red-500 hidden group-hover:block" />
            </span>
            <span className="group-hover:hidden">Working</span>
            <span className="hidden group-hover:inline">Stop</span>
          </button>
        )}
        {isAgentMode && (
          <CustomToolsMenu
            tools={chat.customTools}
            onDelete={chat.deleteCustomTool}
            onImport={chat.importCustomTool}
            syncError={chat.customToolSyncError}
          />
        )}
      </div>

      {/* ── Progress Header (collapsible) — generation + deliverable status ── */}
      {showProgressHeader && (
        <Suspense fallback={null}>
          <ProgressHeader
            currentStep={currentStep}
            modelName={modelName}
            streamProgress={streamProgress}
            streamDetail={streamDetail}
            completenessInfo={completenessInfo}
            error={error}
            isStopped={isStopped}
            retryInfo={retryInfo}
            deliverables={deliverables}
            delivProgress={delivProgress}
            currentDelivFeatures={currentDelivFeatures}
            isDelivGenerating={isDelivGenerating}
            delivTimings={delivTimings}
            packageQualityPass={packageQualityPass}
            onStop={onStop}
            onResume={onResume}
            onClearAll={onClearAll}
            onStopDeliverables={onStopDeliverables}
            isSyncing={isSyncing}
            pendingSyncCount={pendingSyncCount}
            syncingFeatures={syncingFeatures}
          />
        </Suspense>
      )}

      {/* ── Stale deliverables banner (persistent, above messages) ── */}
      {(() => {
        const staleCount = deliverables ? Object.values(deliverables).filter((d) => d?.stale === true).length : 0;
        if (staleCount === 0 || isSyncing) return null;
        return (
          <div className="flex-shrink-0 px-3.5 py-1.5 bg-amber-50/80 border-b border-amber-200/40 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-medium text-amber-700">
              {staleCount} deliverable{staleCount !== 1 ? 's' : ''} out of sync
            </span>
            <span className="text-[11px] text-amber-500">— check sync suggestions below</span>
          </div>
        );
      })()}

      {/* ── Exam Review (if pending) ── */}
      {(pendingExamPatches || (examChanges && examChanges.length > 0)) && (
        <div className="flex-shrink-0 border-b border-slate-200/40 px-4 py-2">
          <ExamReview
            pendingExamPatches={pendingExamPatches}
            examChanges={examChanges}
            onAcceptPatches={onAcceptPatches}
            onRejectPatch={onRejectPatch}
            onFocusPatch={onFocusExamPatch}
          />
        </div>
      )}

      {/* ── Message List (scrollable) — clean chat only ── */}
      <MessageList
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        onSuggestionClick={(q) => chat.send(q)}
        onConfigureAI={onConfigureAI}
        onSelectProposal={chat.handleSelectProposal}
        onAcceptDiff={chat.handleAcceptDiff}
        onRejectDiff={chat.handleRejectDiff}
        onUndo={delivUndoFn}
        canUndo={delivCanUndo}
        onApproveSyncSuggestion={chat.handleApproveSyncSuggestion}
        onSkipSyncSuggestion={chat.handleSkipSyncSuggestion}
        onRegenerate={chat.regenerate}
        onFeedback={chat.feedback}
        onEditAndResend={chat.editAndResend}
        onRetryFailedEdits={chat.retryFailedEdits}
        onKeepAppliedChanges={chat.keepAppliedChanges}
        courseMap={courseMap}
        activeTab={activeTab}
        deliverables={deliverables}
        isAgentMode={isAgentMode}
        isAgentProviderReady={chat.isAgentProviderReady}
        isGenerating={!!(currentStep && currentStep !== 'done')}
        isDelivGenerating={!!isDelivGenerating}
      />

      {/* ── Chat Input ── */}
      <ChatInput
        onSend={chat.send}
        isStreaming={chat.isStreaming}
        isRevising={isRevising}
        onStop={chat.handleStop}
        attachedFiles={chat.attachedFiles}
        onProcessFiles={chat.processFiles}
        onRemoveAttached={chat.removeAttached}
        isParsing={chat.isParsing}
        activeTab={activeTab}
        courseMap={courseMap}
        isStopped={isStopped}
        hasPendingProposal={chat.messages.some((m) => m.role === 'proposal' && m.status === 'pending')}
        isAgentMode={isAgentMode}
        isAgentProviderReady={chat.isAgentProviderReady}
        agentDryRun={chat.agentDryRun}
        onAgentDryRunChange={chat.setAgentDryRun}
        onConfigureAI={onConfigureAI}
        onUndo={delivUndoFn}
        canUndo={delivCanUndo}
      />
    </div>
  );
}
