import React, { useState } from 'react';

// ── Single-pass inline markdown tokenizer ────────────────────────────────────
const INLINE_RE = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(`[^`]+`)|(\[(\d+)\])|(\[([^\]]+)\]\(([^)]+)\))/g;

function formatInline(text) {
  const result = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // **bold**
      result.push(<strong key={key++} className="font-semibold text-slate-800">{match[1].slice(2, -2)}</strong>);
    } else if (match[2]) {
      // *italic*
      result.push(<em key={key++} className="italic text-slate-600">{match[2].slice(1, -1)}</em>);
    } else if (match[3]) {
      // _italic_
      result.push(<em key={key++} className="italic text-slate-600">{match[3].slice(1, -1)}</em>);
    } else if (match[4]) {
      // `code`
      result.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">{match[4].slice(1, -1)}</code>);
    } else if (match[5]) {
      // [N] citation badge
      result.push(
        <span key={key++} className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold mx-0.5 px-1 align-text-bottom">
          {match[6]}
        </span>
      );
    } else if (match[7]) {
      // [text](url) link
      result.push(
        <a key={key++} href={match[9]} target="_blank" rel="noopener noreferrer"
           className="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 hover:decoration-indigo-500 transition-colors">
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return result.length > 0 ? result : [<span key={0}>{text}</span>];
}

// ── Block-level markdown formatter ───────────────────────────────────────────
function FormattedContent({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks (triple backtick)
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      elements.push(
        <pre key={elements.length} className="my-2 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200/30 overflow-x-auto">
          <code className="text-[12px] font-mono text-slate-700 leading-relaxed whitespace-pre">
            {codeLines.join('\n')}
          </code>
        </pre>
      );
      continue;
    }

    // Horizontal rules
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      elements.push(<hr key={elements.length} className="my-2 border-slate-200/50" />);
      i++;
      continue;
    }

    // Blockquotes
    if (line.match(/^>\s?/)) {
      const cleaned = line.replace(/^>\s?/, '');
      elements.push(
        <div key={elements.length} className="border-l-2 border-indigo-300 pl-3 my-1 text-slate-600 italic">
          {formatInline(cleaned)}
        </div>
      );
      i++;
      continue;
    }

    // Headers
    if (line.match(/^#{1,3}\s/)) {
      const cleaned = line.replace(/^#{1,3}\s*/, '');
      elements.push(<div key={elements.length} className="font-bold text-slate-800 mt-2 mb-1">{formatInline(cleaned)}</div>);
      i++;
      continue;
    }

    // Unordered lists
    if (line.match(/^[-*]\s/)) {
      const cleaned = line.replace(/^[-*]\s*/, '');
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-1">
          <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
          <span>{formatInline(cleaned)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Ordered lists
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1];
      const cleaned = line.replace(/^\d+\.\s*/, '');
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-1">
          <span className="text-indigo-400 font-semibold flex-shrink-0">{num}.</span>
          <span>{formatInline(cleaned)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Blank lines
    if (!line.trim()) {
      elements.push(<div key={elements.length} className="h-2" />);
      i++;
      continue;
    }

    // Default: paragraph with inline formatting
    elements.push(<div key={elements.length}>{formatInline(line)}</div>);
    i++;
  }

  return <>{elements}</>;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function MessageBubble({ role, text, isLast, isStreaming }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

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
    <div className="flex justify-start animate-spring-in group/msg">
      <div className="flex gap-2.5 max-w-[90%]">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="relative px-3.5 py-2.5 text-[13px] rounded-2xl rounded-bl-md bg-white/70 border border-slate-200/40 shadow-glass text-slate-700 leading-relaxed">
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
          {/* Copy button — appears on hover */}
          {text && !isStreaming && (
            <button
              onClick={handleCopy}
              className="absolute -top-2 -right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md bg-white border border-slate-200/60 shadow-sm hover:bg-slate-50 text-slate-400 hover:text-slate-600"
              title="Copy to clipboard"
              aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
            >
              {copied ? (
                <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
