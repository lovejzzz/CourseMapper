import React, { useRef, useEffect, useState, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import ProposalCard from './ProposalCard';
import DiffReviewCard from './DiffReviewCard';
import ResearchCard from './ResearchCard';
import ValidationCard from './ValidationCard';
import ChangeSummaryCard from './ChangeSummaryCard';
import PackageSummaryCard from './PackageSummaryCard';
import AgentProgressCard from './AgentProgressCard';
import AgentHelpCard from './AgentHelpCard';
import AgentReceiptCard from './AgentReceiptCard';
import SyncSuggestionCard from './SyncSuggestionCard';
import WorkspacePlanCard, {
  buildWorkspacePlanActionDisplayText,
  buildWorkspacePlanActionSendOptions,
} from './WorkspacePlanCard';
import SourceContextCard from './SourceContextCard';
import LandingContextCard from './LandingContextCard';
import DiagramCard from './DiagramCard';
import ChartCard from './ChartCard';
import ImageSearchCard from './ImageSearchCard';
import { getChatOpener } from './constants';
import {
  isLandingAgentContextText,
  LANDING_AGENT_CONTEXT_SOURCE,
  summarizeLandingAgentContext,
} from '../../lib/landingAgentContext';

// Stable key generator: assigns a unique ID to each message object (by identity).
// Uses WeakMap so keys are GC'd when messages are removed.
let _nextId = 0;
const _keyMap = new WeakMap();
function stableKey(msg, fallback) {
  if (msg.id) return msg.id;
  if (_keyMap.has(msg)) return _keyMap.get(msg);
  const key = `msg-${++_nextId}`;
  _keyMap.set(msg, key);
  return key;
}

/**
 * MessageList — scrollable message area with auto-scroll.
 * Renders user/assistant bubbles, proposals, diff reviews, and content cards.
 * Progress cards render inline so long-running work stays anchored to the turn
 * that started it.
 */
export default function MessageList({
  messages,
  isStreaming,
  onSuggestionClick,
  onStarterAction,
  onRecoveryAction,
  onConfigureAI,
  onSelectProposal,
  onAcceptDiff,
  onRejectDiff,
  onUndo,
  canUndo,
  onApproveSyncSuggestion,
  onSkipSyncSuggestion,
  onRegenerate,
  onFeedback,
  onEditAndResend,
  onRetryFailedEdits,
  onKeepAppliedChanges,
  onWorkspacePlanAction,
  onWorkspacePlanActionStateChange,
  onReceiptActionStateChange,
  workspacePlanActionCapabilities = {},
  courseMap,
  activeTab,
  deliverables,
  isAgentMode,
  isGenerating,
  isDelivGenerating,
  isAgentProviderReady = true,
}) {
  const endRef = useRef(null);
  const prevCountRef = useRef(messages.length);
  const containerRef = useRef(null);
  // Tracks whether the user is pinned to the bottom of the chat. When they
  // scroll up to reread context, we stop auto-scrolling and surface a "Jump to
  // latest" pill instead of silently scrolling new messages past them.
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);

  const landingContext = summarizeLandingAgentContext(messages);
  const opener = getChatOpener(
    courseMap,
    isAgentMode,
    activeTab,
    deliverables,
    isGenerating,
    isDelivGenerating,
    isAgentProviderReady,
    landingContext,
  );
  const { greeting, starters = [] } = opener || {};

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior });
    setPendingNewCount(0);
  }, []);

  // Watch scroll position — 120px of slack so tiny rubber-band scrolls don't
  // flip the state. Same threshold the original auto-scroll used.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      const atBottom = dist < 120;
      setIsAtBottom(atBottom);
      if (atBottom) setPendingNewCount(0);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    // Only react to count changes — mutations of existing messages (status
    // updates, streaming text) shouldn't trigger scroll or pill updates.
    const prev = prevCountRef.current;
    const countChanged = messages.length !== prev;
    prevCountRef.current = messages.length;
    if (!countChanged) return;

    const addedMessages = messages.slice(Math.max(0, prev));
    const shouldFollowWorkspacePlan = addedMessages.some((message) => message?.role === 'workspacePlan');
    const shouldFollowAgentAction =
      shouldFollowWorkspacePlan ||
      addedMessages.some((message) => ['syncSuggestion', 'packageSummary'].includes(message?.role));

    if (shouldFollowWorkspacePlan) {
      const planCards = containerRef.current?.querySelectorAll('[data-testid="workspace-plan-card"]');
      const latestPlanCard = planCards?.[planCards.length - 1];
      if (latestPlanCard && containerRef.current) {
        const nextTop = Math.max(0, latestPlanCard.offsetTop - containerRef.current.clientHeight * 0.25);
        containerRef.current.scrollTo({ top: nextTop, behavior: 'auto' });
      } else {
        endRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      setPendingNewCount(0);
    } else if (isAtBottom || shouldFollowAgentAction) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setPendingNewCount(0);
    } else {
      // User is scrolled up — accumulate how many arrived while they're away.
      const delta = messages.length - prev;
      if (delta > 0) setPendingNewCount((c) => c + delta);
    }
  }, [messages, isAtBottom]);

  // Messages list — greeting + starters always shown as first item in the stream
  return (
    <div data-testid="message-list-root" className="relative flex min-h-[120px] flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        data-testid="message-scroll-container"
        className="flex-1 overflow-y-auto px-4 pt-3 pb-24 space-y-3"
        style={{ minHeight: 0 }}
      >
        {/* Greeting + suggestion starters — inline at the top of the chat stream */}
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
              <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed pt-0.5">
              {greeting || 'How can I help with your course?'}
            </p>
          </div>
          {starters.length > 0 && (
            <div className="ml-8 flex flex-wrap gap-2">
              {starters.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (s.action === 'configure-ai') {
                      onConfigureAI?.();
                      return;
                    }
                    if (s.action) {
                      const handled = onStarterAction?.(s);
                      if (handled) return;
                    }
                    onSuggestionClick?.(s.text);
                  }}
                  data-testid={
                    s.action === 'configure-ai'
                      ? 'configure-agent-ai-button'
                      : s.action
                        ? `agent-starter-${s.action}`
                        : undefined
                  }
                  className="tactile text-[12px] px-3 py-1.5 rounded-full bg-white/60 border border-slate-200/40 text-slate-600 hover:bg-indigo-50/60 hover:border-indigo-300/40 hover:text-indigo-600 transition-all shadow-sm"
                >
                  {s.text}
                </button>
              ))}
            </div>
          )}
        </div>

        {messages.map((msg, i) => {
          const key = stableKey(msg);
          if (msg.role === 'agentProgress' || msg.role === 'progress') {
            return (
              <AgentProgressCard
                key={key}
                steps={msg.steps || []}
                status={msg.status || 'running'}
                thinkingText={msg.thinkingText || ''}
                startedAt={msg.startedAt}
                endedAt={msg.endedAt}
                runMeta={msg.runMeta}
                onRecoveryAction={
                  onSuggestionClick
                    ? async (action) => {
                        const handled = await onRecoveryAction?.(action);
                        if (handled) return;
                        onSuggestionClick(action.displayText, {
                          displayText: action.displayText,
                          agentPromptOverride: action.prompt,
                        });
                      }
                    : undefined
                }
              />
            );
          }
          if (msg.role === 'agentHelp') {
            return <AgentHelpCard key={key} help={msg.help} />;
          }
          if (msg.role === 'agentReceipt') {
            return (
              <AgentReceiptCard
                key={key}
                receipt={msg.receipt}
                actionStates={msg.actionStates || msg.receipt?.actionStates || {}}
                onActionStateChange={(actionStates, change) => onReceiptActionStateChange?.(i, actionStates, change)}
                onAction={
                  onSuggestionClick
                    ? async (action) => {
                        const handled = await onRecoveryAction?.(action);
                        if (handled) return typeof handled === 'object' ? handled : { status: 'done' };
                        onSuggestionClick(action.displayText, {
                          displayText: action.displayText,
                          agentPromptOverride: action.prompt,
                        });
                        return { status: 'sent' };
                      }
                    : undefined
                }
              />
            );
          }
          if (msg.role === 'research') {
            return <ResearchCard key={key} research={msg.research} status={msg.status} />;
          }
          if (msg.role === 'validation') {
            return (
              <ValidationCard key={key} report={msg.report} onFixClick={(prompt) => onSuggestionClick?.(prompt)} />
            );
          }
          if (msg.role === 'proposal') {
            return (
              <ProposalCard
                key={key}
                proposal={msg.proposal}
                status={msg.status}
                selectedLabel={msg.selectedLabel}
                failedLabel={msg.failedLabel}
                failedMessage={msg.failedMessage}
                onSelect={(label) => onSelectProposal?.(i, label)}
              />
            );
          }
          if (msg.role === 'diffReview') {
            return (
              <DiffReviewCard
                key={key}
                diff={msg.diff}
                status={msg.status}
                onAccept={() => onAcceptDiff?.(i)}
                onReject={() => onRejectDiff?.(i)}
              />
            );
          }
          if (msg.role === 'changeSummary') {
            return (
              <ChangeSummaryCard
                key={key}
                summary={msg.summary}
                status={msg.status}
                onUndo={onUndo}
                canUndo={canUndo}
                onRetryFailed={
                  onRetryFailedEdits
                    ? (failedItems, toolName) => onRetryFailedEdits(i, failedItems, toolName)
                    : undefined
                }
                onKeep={onKeepAppliedChanges ? () => onKeepAppliedChanges(i) : undefined}
              />
            );
          }
          if (msg.role === 'packageSummary') {
            return <PackageSummaryCard key={key} summary={msg.summary} />;
          }
          if (msg.role === 'workspacePlan') {
            return (
              <WorkspacePlanCard
                key={key}
                plan={msg.plan}
                actionStates={msg.actionStates || msg.plan?.actionStates || {}}
                actionCapabilities={workspacePlanActionCapabilities}
                onActionStateChange={(actionStates, change) =>
                  onWorkspacePlanActionStateChange?.(i, actionStates, change)
                }
                onAction={async (action) => {
                  const displayText = buildWorkspacePlanActionDisplayText(action, workspacePlanActionCapabilities);
                  const sendOptions = buildWorkspacePlanActionSendOptions(action, workspacePlanActionCapabilities);
                  const handled = await onWorkspacePlanAction?.(action, { displayText, sendOptions });
                  if (handled) return typeof handled === 'object' ? handled : { status: 'done' };
                  onSuggestionClick?.(displayText, sendOptions);
                  return { status: 'sent' };
                }}
              />
            );
          }
          if (msg.role === 'sourceContext') {
            return <SourceContextCard key={key} message={msg} />;
          }
          if (
            msg.role === 'user' &&
            (msg.source === LANDING_AGENT_CONTEXT_SOURCE ||
              msg.meta?.source === LANDING_AGENT_CONTEXT_SOURCE ||
              isLandingAgentContextText(msg.text || msg.content || ''))
          ) {
            return <LandingContextCard key={key} message={msg} />;
          }
          if (msg.role === 'syncSuggestion') {
            return (
              <SyncSuggestionCard
                key={key}
                suggestion={msg}
                onApprove={onApproveSyncSuggestion}
                onSkip={onSkipSyncSuggestion}
              />
            );
          }
          if (msg.role === 'diagram') {
            return <DiagramCard key={key} diagram={msg.diagram} status={msg.status} />;
          }
          if (msg.role === 'chart') {
            return <ChartCard key={key} chart={msg.chart} status={msg.status} />;
          }
          if (msg.role === 'imageSearch') {
            return (
              <ImageSearchCard key={key} imageSearch={msg.imageSearch} status={msg.status} provider={msg.provider} />
            );
          }
          return (
            <MessageBubble
              key={key}
              role={msg.role}
              text={msg.text || msg.content || ''}
              isLast={i === messages.length - 1}
              isStreaming={isStreaming}
              feedback={msg.feedback}
              onRegenerate={msg.role === 'assistant' && !isStreaming ? () => onRegenerate?.(i) : undefined}
              onFeedback={msg.role === 'assistant' && !isStreaming ? (vote) => onFeedback?.(i, vote) : undefined}
              onEditAndResend={
                msg.role === 'user' && !isStreaming ? (newText) => onEditAndResend?.(i, newText) : undefined
              }
            />
          );
        })}
        <div ref={endRef} />
      </div>
      {/* Sticky "Jump to latest" — only when user is scrolled up AND new content arrived */}
      {!isAtBottom && pendingNewCount > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500 text-white text-[11px] font-semibold shadow-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          aria-label={`Jump to ${pendingNewCount} new message${pendingNewCount === 1 ? '' : 's'}`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {pendingNewCount} new message{pendingNewCount === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
