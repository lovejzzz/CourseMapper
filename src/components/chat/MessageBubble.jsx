import React from 'react';

// ── Markdown-lite formatter ─────────────────────────────────────────────────
function formatInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
    }
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={`${i}-${j}`} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">{cp.slice(1, -1)}</code>;
      }
      return <span key={`${i}-${j}`}>{cp}</span>;
    });
  });
}

function FormattedContent({ text }) {
  const lines = text.split('\n');
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^#{1,3}\s/)) {
      const cleaned = line.replace(/^#{1,3}\s*/, '');
      elements.push(<div key={i} className="font-bold text-slate-800 mt-2 mb-1">{formatInline(cleaned)}</div>);
      continue;
    }
    if (line.match(/^[-*]\s/)) {
      const cleaned = line.replace(/^[-*]\s*/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
          <span>{formatInline(cleaned)}</span>
        </div>
      );
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1];
      const cleaned = line.replace(/^\d+\.\s*/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-indigo-400 font-semibold flex-shrink-0">{num}.</span>
          <span>{formatInline(cleaned)}</span>
        </div>
      );
      continue;
    }
    if (!line.trim()) { elements.push(<div key={i} className="h-2" />); continue; }
    elements.push(<div key={i}>{formatInline(line)}</div>);
  }

  return <>{elements}</>;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function MessageBubble({ role, text, isLast, isStreaming }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end animate-spring-in">
        <div className="max-w-[85%] px-3.5 py-2.5 text-[13px] rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-500 to-violet-500 text-white leading-relaxed shadow-lg shadow-indigo-500/10">
          {text}
        </div>
      </div>
    );
  }

  if (role === 'error') {
    return (
      <div className="flex justify-start animate-spring-in">
        <div className="max-w-[85%] px-3.5 py-2.5 text-[13px] rounded-2xl rounded-bl-md bg-red-50/80 text-red-600 border border-red-200/40 leading-relaxed">
          {text}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start animate-spring-in">
      <div className="flex gap-2.5 max-w-[90%]">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="px-3.5 py-2.5 text-[13px] rounded-2xl rounded-bl-md bg-white/70 border border-slate-200/40 shadow-glass text-slate-700 leading-relaxed">
          {text ? (
            <FormattedContent text={text} />
          ) : isLast && isStreaming ? (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : null}
          {isLast && isStreaming && text && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}
