import React, { useState, useMemo } from 'react';

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

// ── Code block with language label + per-block copy ─────────────────────────
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const displayLang = language || 'code';

  return (
    <div className="my-2 rounded-lg bg-slate-900 border border-slate-700/50 overflow-hidden">
      {/* Header bar: language label + copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50">
        <span className="text-[11px] font-mono text-slate-400">{displayLang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <pre className="px-3 py-2.5 overflow-x-auto">
        <code className="text-[12px] font-mono text-slate-200 leading-relaxed whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

// ── Block-level markdown formatter ───────────────────────────────────────────
function FormattedContent({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks (triple backtick) with language detection
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || '';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      elements.push(
        <CodeBlock key={elements.length} code={codeLines.join('\n')} language={lang} />
      );
      continue;
    }

    // Markdown tables
    if (line.match(/^\|.*\|$/) && i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s\-:|]+\|$/)) {
      const tableLines = [];
      while (i < lines.length && lines[i].match(/^\|.*\|$/)) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter(l => !/^\|[\s\-:|]+\|$/.test(l)) // skip separator line
        .map(l => l.split('|').slice(1, -1).map(c => c.trim()));
      if (rows.length > 0) {
        const [header, ...body] = rows;
        elements.push(
          <div key={elements.length} className="my-2 overflow-x-auto rounded-lg border border-slate-200/40">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50/80">
                  {header.map((h, j) => (
                    <th key={j} className="px-3 py-1.5 text-left font-semibold text-slate-700 border-b border-slate-200/40">
                      {formatInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100/40 last:border-0 hover:bg-indigo-50/30 transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-slate-600">{formatInline(cell)}</td>
                    ))}
                    {/* Pad if row has fewer cells than header */}
                    {row.length < header.length && Array.from({ length: header.length - row.length }, (_, ci) => (
                      <td key={`pad-${ci}`} className="px-3 py-1.5" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
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
export default function MessageBubble({ role, text, isLast, isStreaming, feedback, onRegenerate, onFeedback }) {
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
  const showActions = text && !isStreaming;

  return (
    <div className="flex justify-start animate-spring-in group/msg">
      <div className="flex gap-2.5 max-w-[90%]">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="relative">
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
              <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-blink rounded-sm align-text-bottom" />
            )}
          </div>

          {/* Action bar — appears on hover below the message */}
          {showActions && (
            <div className="flex items-center gap-0.5 mt-1 ml-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
              {/* Copy */}
              <button
                onClick={handleCopy}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                title="Copy to clipboard"
                aria-label={copied ? 'Copied' : 'Copy to clipboard'}
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>

              {/* Regenerate */}
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                  title="Regenerate response"
                  aria-label="Regenerate response"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}

              {/* Divider */}
              {onFeedback && <div className="w-px h-3 bg-slate-200/60 mx-0.5" />}

              {/* Thumbs up */}
              {onFeedback && (
                <button
                  onClick={() => onFeedback(feedback === 'up' ? null : 'up')}
                  className={`p-1 rounded-md transition-colors ${
                    feedback === 'up'
                      ? 'text-emerald-500 bg-emerald-50'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'
                  }`}
                  title="Good response"
                  aria-label="Good response"
                >
                  <svg className="w-3.5 h-3.5" fill={feedback === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z M4 15h0a2 2 0 01-2-2V9a2 2 0 012-2h0" />
                  </svg>
                </button>
              )}

              {/* Thumbs down */}
              {onFeedback && (
                <button
                  onClick={() => onFeedback(feedback === 'down' ? null : 'down')}
                  className={`p-1 rounded-md transition-colors ${
                    feedback === 'down'
                      ? 'text-red-500 bg-red-50'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'
                  }`}
                  title="Poor response"
                  aria-label="Poor response"
                >
                  <svg className="w-3.5 h-3.5" fill={feedback === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z M20 2h0a2 2 0 012 2v6a2 2 0 01-2 2h0" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
