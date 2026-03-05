import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import ProgressCard from './ProgressCard';
import { getSuggestedQuestions } from './constants';

/**
 * MessageList — scrollable message area with auto-scroll.
 * Renders user/assistant bubbles, progress cards, and empty state.
 */
export default function MessageList({ messages, isStreaming, courseMap, onSuggestionClick }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestedQuestions = getSuggestedQuestions(courseMap);

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: 0 }}>
        <div className="w-10 h-10 mb-3 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-bold text-slate-700 mb-1.5">How can I help?</h2>
        <p className="text-[12px] text-slate-400 text-center max-w-xs mb-5">
          Ask about features, get pedagogical advice, or request revisions.
        </p>
        <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs">
          {suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(q)}
              className="tactile text-left px-3 py-2 rounded-lg text-[12px] font-medium text-slate-500 bg-white/50 border border-slate-200/30 hover:bg-indigo-50/60 hover:border-indigo-200/40 hover:text-indigo-600 shadow-glass transition-all duration-200"
            >
              {q}
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
          return <ProgressCard key={i} data={msg.data || msg} />;
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
