import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import ProgressHeader from './ProgressHeader';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import AgentProgressCard from './AgentProgressCard';
import useChatRouter from './useChatRouter';
import ExamReview from '../ExamReview';
import { executeAction } from '../../lib/agentActions';

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
  // Exam review
  pendingExamPatches, examChanges, onAcceptPatches, onRejectPatch,
  // Agent: course map editor + deliverable update
  editor, optimisticUpdate, regenerateLesson,
  // Agent phase 2: undo + highlight
  delivUndoSnapshot, delivUndoFn, delivCanUndo, onAgentHighlight,
  // Agent-mediated sync
  pendingSyncSuggestion, clearPendingSyncSuggestion, executeSyncPlan, notifyEdit,
  // External ref for sending messages from outside (e.g., context menu)
  chatSendRef,
  // User ID for cloud sync
  uid,
}) {
  // Detect agent mode: deliverables with done status exist
  const isAgentMode = !!(deliverables && Object.keys(deliverables).some(
    k => k !== 'courseMap' && deliverables[k]?.status === 'done'
  ));

  // Keep refs for values that can change between parallel tool calls in the same agent turn
  const delivRef = useRef(deliverables);
  delivRef.current = deliverables;
  const courseMapRef = useRef(courseMap);
  courseMapRef.current = courseMap;

  // Build the action executor that agent mode uses
  const execAction = useCallback((action, opts = {}) => {
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
  }, [editor, optimisticUpdate, regenerateLesson, delivUndoSnapshot, onAgentHighlight]);

  const chat = useChatRouter({
    courseMap, activeTab,
    onRevision, onDeliverableRevision,
    isStopped, onResume,
    savedMessages: chatHistory,
    onMessagesChange: onChatHistoryChange,
    // Agent params
    deliverables,
    executeAction: execAction,
    delivUndoSnapshot,
    delivUndoFn,
    executeSyncPlan,
    notifyEdit,
    uid,
  });

  // ── Expose chat.send to parent via ref (for context menu inline AI) ──
  useEffect(() => {
    if (chatSendRef) chatSendRef.current = chat.send;
  }, [chat.send, chatSendRef]);

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

  // Auto health-fix removed — users can trigger validation manually via "Review Course" button

  const showProgressHeader = !!(currentStep || error);

  // Extract latest agent progress for the fixed status area (not in chat scroll)
  const latestAgentProgress = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'agentProgress') return chat.messages[i];
    }
    return null;
  }, [chat.messages]);

  return (
    <div className="flex flex-col h-full bg-white/72 backdrop-blur-xl rounded-squircle shadow-glass overflow-hidden" data-print="hide">
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-200/40 flex-shrink-0">
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
          isAgentMode
            ? 'bg-gradient-to-br from-violet-500/15 to-indigo-500/15'
            : 'bg-gradient-to-br from-indigo-500/10 to-violet-500/10'
        }`}>
          {isAgentMode ? (
            <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-800">
            {isAgentMode ? 'Teaching Agent' : 'Teaching Assistant'}
          </h2>
          {isAgentMode && activeTab && activeTab !== 'courseMap' && (
            <p className="text-[10px] text-slate-500 -mt-0.5 truncate">
              Viewing {activeTab === 'quizBank' ? 'Quiz Bank' : activeTab === 'lessonPlans' ? 'Lesson Plans' : activeTab === 'slideDecks' ? 'Slide Decks' : activeTab === 'studyGuides' ? 'Study Guides' : activeTab === 'courseFaq' ? 'Course FAQ' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </p>
          )}
        </div>
        {chat.isStreaming && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[10px] text-violet-500 font-medium">Working</span>
          </div>
        )}
      </div>

      {/* ── Progress Header (collapsible) — generation + deliverable status ── */}
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

      {/* ── Agent Progress (fixed top, collapsible) — tool execution status ── */}
      {latestAgentProgress && (
        <div className="flex-shrink-0 border-b border-slate-200/40">
          <AgentProgressCard steps={latestAgentProgress.steps} status={latestAgentProgress.status} thinkingText={latestAgentProgress.thinkingText} />
        </div>
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

      {/* ── Message List (scrollable) — clean chat only ── */}
      <MessageList
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        onSuggestionClick={(q) => chat.send(q)}
        onSelectProposal={chat.handleSelectProposal}
        onAcceptDiff={chat.handleAcceptDiff}
        onRejectDiff={chat.handleRejectDiff}
        onUndo={delivUndoFn}
        canUndo={delivCanUndo}
        onApproveSyncSuggestion={chat.handleApproveSyncSuggestion}
        onSkipSyncSuggestion={chat.handleSkipSyncSuggestion}
        courseMap={courseMap}
        activeTab={activeTab}
        deliverables={deliverables}
        isAgentMode={isAgentMode}
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
        hasPendingProposal={chat.messages.some(m => m.role === 'proposal' && m.status === 'pending')}
        isAgentMode={isAgentMode}
        onUndo={delivUndoFn}
        canUndo={delivCanUndo}
      />
    </div>
  );
}
