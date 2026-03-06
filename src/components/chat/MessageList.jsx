import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import ProposalCard from './ProposalCard';
import ResearchCard from './ResearchCard';
import ValidationCard from './ValidationCard';
import ChangeSummaryCard from './ChangeSummaryCard';
import SyncSuggestionCard from './SyncSuggestionCard';
import DiagramCard from './DiagramCard';
import ChartCard from './ChartCard';
import ImageSearchCard from './ImageSearchCard';

/**
 * MessageList — scrollable message area with auto-scroll.
 * Renders user/assistant bubbles, proposals, and content cards.
 * Status cards (progress, agent steps) are shown in the fixed top area instead.
 */
export default function MessageList({ messages, isStreaming, onSuggestionClick, onSelectProposal, onUndo, canUndo, onApproveSyncSuggestion, onSkipSyncSuggestion }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Empty state — clean, minimal (also when only status messages exist)
  const hasVisibleMessages = messages.some(m => m.role !== 'agentProgress' && m.role !== 'progress');
  if (!hasVisibleMessages) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col" style={{ minHeight: 0 }}>
        <div className="flex-1" />
      </div>
    );
  }

  // Messages list
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
      {messages.map((msg, i) => {
        // Status messages are shown in the fixed top area, not in chat
        if (msg.role === 'agentProgress' || msg.role === 'progress') return null;
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
              provider={msg.provider}
              apiKey={msg.apiKey}
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
