import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import ProposalCard from './ProposalCard';
import DiffReviewCard from './DiffReviewCard';
import ResearchCard from './ResearchCard';
import ValidationCard from './ValidationCard';
import ChangeSummaryCard from './ChangeSummaryCard';
import SyncSuggestionCard from './SyncSuggestionCard';
import DiagramCard from './DiagramCard';
import ChartCard from './ChartCard';
import ImageSearchCard from './ImageSearchCard';
import { getChatOpener } from './constants';

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
 * Status cards (progress, agent steps) are shown in the fixed top area instead.
 */
export default function MessageList({ messages, isStreaming, onSuggestionClick, onSelectProposal, onAcceptDiff, onRejectDiff, onUndo, canUndo, onApproveSyncSuggestion, onSkipSyncSuggestion, courseMap, activeTab, deliverables, isAgentMode }) {
  const endRef = useRef(null);
  const prevCountRef = useRef(messages.length);
  const containerRef = useRef(null);

  const opener = getChatOpener(courseMap, isAgentMode, activeTab, deliverables);
  const { greeting, starters = [] } = opener || {};

  useEffect(() => {
    // Only auto-scroll when new messages are added (count increases),
    // not when existing messages are mutated (e.g., status changes).
    // Also scroll if user is already near the bottom.
    const countChanged = messages.length !== prevCountRef.current;
    prevCountRef.current = messages.length;

    if (countChanged) {
      const container = containerRef.current;
      const isNearBottom = !container || (container.scrollHeight - container.scrollTop - container.clientHeight < 120);
      if (isNearBottom) {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Empty state — clean, minimal (also when only status messages exist)
  const hasVisibleMessages = messages.some(m => m.role !== 'agentProgress' && m.role !== 'progress');
  if (!hasVisibleMessages) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col justify-end" style={{ minHeight: 0 }}>
        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
              <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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
                  onClick={() => onSuggestionClick?.(s.text)}
                  className="tactile text-[12px] px-3 py-1.5 rounded-full bg-white/60 border border-slate-200/40 text-slate-600 hover:bg-indigo-50/60 hover:border-indigo-300/40 hover:text-indigo-600 transition-all shadow-sm"
                >
                  {s.text}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Messages list
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
      {messages.map((msg, i) => {
        const key = stableKey(msg);
        // Status messages are shown in the fixed top area, not in chat
        if (msg.role === 'agentProgress' || msg.role === 'progress') return null;
        if (msg.role === 'research') {
          return <ResearchCard key={key} research={msg.research} status={msg.status} />;
        }
        if (msg.role === 'validation') {
          return (
            <ValidationCard
              key={key}
              report={msg.report}
              onFixClick={(prompt) => onSuggestionClick?.(prompt)}
            />
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
          return <ChangeSummaryCard key={key} summary={msg.summary} onUndo={onUndo} canUndo={canUndo} />;
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
          return (
            <DiagramCard
              key={key}
              diagram={msg.diagram}
              status={msg.status}
            />
          );
        }
        if (msg.role === 'chart') {
          return (
            <ChartCard
              key={key}
              chart={msg.chart}
              status={msg.status}
            />
          );
        }
        if (msg.role === 'imageSearch') {
          return (
            <ImageSearchCard
              key={key}
              imageSearch={msg.imageSearch}
              status={msg.status}
              provider={msg.provider}
              apiKey={msg.apiKey}
            />
          );
        }
        return (
          <MessageBubble
            key={key}
            role={msg.role}
            text={msg.text || msg.content || ''}
            isLast={i === messages.length - 1}
            isStreaming={isStreaming}
          />
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
