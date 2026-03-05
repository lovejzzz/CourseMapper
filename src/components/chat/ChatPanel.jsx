import React, { useEffect, useRef, useCallback } from 'react';
import ProgressHeader from './ProgressHeader';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import useChatRouter from './useChatRouter';
import ExamReview from '../ExamReview';
import { executeAction } from '../../lib/agentActions';
import { getChatOpener } from './constants';

/**
 * ChatPanel — Unified chat interface replacing ProgressPanel + RevisionChat + HelpDrawer.
 * Handles: generation progress (header), help questions (Ask mode), agent actions (Revise mode),
 * file uploads, and inline progress cards.
 */
export default function ChatPanel({
  // Generation state
  currentStep, modelName, error,
  streamDetail, streamProgress, completenessInfo,
  isStopped, retryInfo, generationLog,
  // Generation controls
  onStop, onResume, onClearAll, onRetryExamine,
  // Deliverable state
  deliverables, delivProgress, currentDelivFeatures, isDelivGenerating, delivTimings,
  onStopDeliverables,
  // Sync state
  isSyncing, pendingSyncCount, syncingFeatures,
  // Revision
  onRevision, onDeliverableRevision, isRevising,
  activeTab, courseMap,
  // Chat state
  chatHistory, onChatHistoryChange,
  // Help AI config
  apiKey, provider, modelId,
  // Exam review
  pendingExamPatches, examChanges, onAcceptPatches, onRejectPatch,
  // Agent: course map editor + deliverable update
  editor, optimisticUpdate, regenerateLesson,
  // Agent phase 2: undo + highlight
  delivUndoSnapshot, onAgentHighlight,
}) {
  // Detect agent mode: deliverables with done status exist
  const isAgentMode = !!(deliverables && Object.keys(deliverables).some(
    k => k !== 'courseMap' && deliverables[k]?.status === 'done'
  ));

  // Build the action executor that agent mode uses
  const execAction = useCallback((action) => {
    const result = executeAction(action, {
      editor,
      deliverables,
      optimisticUpdate,
      courseMap,
      regenerateLesson,
      snapshot: delivUndoSnapshot,
    });
    // Trigger visual highlight on success
    if (result.success && onAgentHighlight && action.featureId) {
      onAgentHighlight(action.featureId, action.lessonIndex ?? null);
    }
    return result;
  }, [editor, deliverables, optimisticUpdate, courseMap, regenerateLesson, delivUndoSnapshot, onAgentHighlight]);

  const chat = useChatRouter({
    apiKey, provider, modelId,
    courseMap, activeTab,
    onRevision, onDeliverableRevision,
    isStopped, onResume,
    savedMessages: chatHistory,
    onMessagesChange: onChatHistoryChange,
    // Agent params
    deliverables,
    executeAction: execAction,
  });

  // ── Auto-insert progress cards on state transitions ─────────────────────
  const prevStepRef = useRef(currentStep);  // init to current so mount doesn't trigger
  // Init to current done count so remounts don't re-fire
  const initDone = deliverables
    ? Object.entries(deliverables).filter(([id]) => id !== 'courseMap').filter(([, s]) => s?.status === 'done').length
    : 0;
  const prevDelivDoneRef = useRef(initDone);

  useEffect(() => {
    // Course map ready card — include opener starters so user sees actionable prompts
    if (currentStep === 'done' && prevStepRef.current && prevStepRef.current !== 'done') {
      const lessonCount = completenessInfo?.actual || courseMap?.lessons?.length || 0;
      const opener = getChatOpener(courseMap, false, null); // Tier 2: course map exists
      chat.addProgressMessage({
        data: { phase: 'courseMapReady', lessonCount, greeting: opener.greeting, starters: opener.starters },
      });
    }
    prevStepRef.current = currentStep;
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // All deliverables done card
    const delivRows = deliverables
      ? Object.entries(deliverables).filter(([id]) => id !== 'courseMap')
      : [];
    const doneCount = delivRows.filter(([, s]) => s?.status === 'done').length;
    const errorCount = delivRows.filter(([, s]) => s?.status === 'error').length;
    const allDone = delivRows.length > 0 && !isDelivGenerating &&
      delivRows.every(([, s]) => s?.status === 'done' || s?.status === 'error');

    if (allDone && doneCount > 0 && doneCount !== prevDelivDoneRef.current) {
      // Calculate total time
      const timings = delivTimings ? Object.values(delivTimings) : [];
      const totalTime = timings.reduce((sum, t) => sum + (t.durationMs || 0), 0);

      const agentOpener = getChatOpener(courseMap, true, activeTab); // Tier 3: agent mode
      chat.addProgressMessage({
        data: {
          phase: 'complete',
          lessonCount: completenessInfo?.actual || courseMap?.lessons?.length || 0,
          totalTime,
          deliverables: delivRows.map(([id, s]) => ({ id, status: s?.status })),
          greeting: agentOpener.greeting,
          starters: agentOpener.starters,
        },
      });
    }
    prevDelivDoneRef.current = doneCount;
  }, [deliverables, isDelivGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

  const showProgressHeader = !!(currentStep || error);

  return (
    <div className="flex flex-col h-full bg-white/72 backdrop-blur-xl rounded-squircle shadow-glass overflow-hidden" data-print="hide">
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/40 flex-shrink-0">
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-800">Your Teaching Assistant</h2>
        </div>
      </div>

      {/* ── Progress Header (collapsible) ── */}
      {showProgressHeader && (
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
          onStop={onStop}
          onResume={onResume}
          onClearAll={onClearAll}
          onStopDeliverables={onStopDeliverables}
          isSyncing={isSyncing}
          pendingSyncCount={pendingSyncCount}
          syncingFeatures={syncingFeatures}
        />
      )}

      {/* ── Exam Review (if pending) ── */}
      {(pendingExamPatches || (examChanges && examChanges.length > 0)) && (
        <div className="flex-shrink-0 border-b border-slate-200/40 px-4 py-2">
          <ExamReview
            pendingExamPatches={pendingExamPatches}
            examChanges={examChanges}
            onAcceptPatches={onAcceptPatches}
            onRejectPatch={onRejectPatch}
          />
        </div>
      )}

      {/* ── Message List (scrollable) ── */}
      <MessageList
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        courseMap={courseMap}
        isAgentMode={isAgentMode}
        activeTab={activeTab}
        onSuggestionClick={(q) => chat.send(q)}
        onSelectProposal={chat.handleSelectProposal}
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
        hasPendingProposal={chat.messages.some(m => m.role === 'proposal' && m.status === 'pending')}
        isAgentMode={isAgentMode}
      />
    </div>
  );
}
