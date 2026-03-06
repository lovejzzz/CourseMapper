import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import ProgressCard from './ProgressCard';
import ProposalCard from './ProposalCard';
import ResearchCard from './ResearchCard';
import ValidationCard from './ValidationCard';
import ChangeSummaryCard from './ChangeSummaryCard';
import SyncSuggestionCard from './SyncSuggestionCard';
import DiagramCard from './DiagramCard';
import ChartCard from './ChartCard';
import ImageSearchCard from './ImageSearchCard';
import { getChatOpener } from './constants';

// ── Starter icon components ─────────────────────────────────────────────────
function StarterIcon({ type }) {
  if (type === 'plus') return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
  if (type === 'search') return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
  if (type === 'edit') return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
  // default: chat bubble
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

/**
 * MessageList — scrollable message area with auto-scroll.
 * Renders user/assistant bubbles, progress cards, proposals, and empty state.
 */
export default function MessageList({ messages, isStreaming, courseMap, isAgentMode, activeTab, deliverables, onSuggestionClick, onSelectProposal, onUndo, canUndo, onApproveSyncSuggestion, onSkipSyncSuggestion }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Empty state — context-aware opener
  if (messages.length === 0) {
    const opener = getChatOpener(courseMap, isAgentMode, activeTab, deliverables);

    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col" style={{ minHeight: 0 }}>
        {/* Push content to bottom for a native chat feel */}
        <div className="flex-1" />

        {/* Greeting */}
        <div className="flex items-start gap-2.5 mb-3">
          <div className="w-6 h-6 mt-0.5 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="bg-white/60 border border-slate-200/30 rounded-xl rounded-tl-md px-3.5 py-2.5 shadow-glass max-w-[88%]">
            <p className="text-[13px] text-slate-600 leading-snug">
              {opener.greeting}
            </p>
          </div>
        </div>

        {/* Starter prompts — compact clickable pills */}
        <div className="ml-8 flex flex-wrap gap-1.5">
          {opener.starters.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s.text)}
              className="tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 bg-white/50 border border-slate-200/40 rounded-full shadow-sm hover:bg-indigo-50/70 hover:border-indigo-200/50 hover:text-indigo-700 transition-all duration-200"
            >
              <span className="text-slate-400">
                <StarterIcon type={s.icon} />
              </span>
              {s.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Messages list
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
      {messages.map((msg, i) => {
        if (msg.role === 'progress') {
          return <ProgressCard key={i} data={msg.data || msg} onSuggestionClick={onSuggestionClick} />;
        }
        if (msg.role === 'research') {
          return <ResearchCard key={i} research={msg.research} status={msg.status} />;
        }
        if (msg.role === 'validation') {
          return (
            <ValidationCard
              key={i}
              report={msg.report}
              onFixClick={(prompt) => onSuggestionClick(prompt)}
            />
          );
        }
        if (msg.role === 'proposal') {
          return (
            <ProposalCard
              key={i}
              proposal={msg.proposal}
              status={msg.status}
              selectedLabel={msg.selectedLabel}
              failedLabel={msg.failedLabel}
              failedMessage={msg.failedMessage}
              onSelect={(label) => onSelectProposal?.(i, label)}
            />
          );
        }
        if (msg.role === 'changeSummary') {
          return <ChangeSummaryCard key={i} summary={msg.summary} onUndo={onUndo} canUndo={canUndo} />;
        }
        if (msg.role === 'syncSuggestion') {
          return (
            <SyncSuggestionCard
              key={msg.id || i}
              suggestion={msg}
              onApprove={onApproveSyncSuggestion}
              onSkip={onSkipSyncSuggestion}
            />
          );
        }
        if (msg.role === 'diagram') {
          return (
            <DiagramCard
              key={msg.id || i}
              diagram={msg.diagram}
              status={msg.status}
            />
          );
        }
        if (msg.role === 'chart') {
          return (
            <ChartCard
              key={msg.id || i}
              chart={msg.chart}
              status={msg.status}
            />
          );
        }
        if (msg.role === 'imageSearch') {
          return (
            <ImageSearchCard
              key={msg.id || i}
              imageSearch={msg.imageSearch}
              status={msg.status}
            />
          );
        }
        return (
          <MessageBubble
            key={i}
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
