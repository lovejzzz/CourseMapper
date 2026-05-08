import React, { useState, useEffect, useRef, useMemo } from 'react';
import { loadKatexRuntime } from '../../lib/katexRuntime.js';

// ── Lazy KaTeX loader ────────────────────────────────────────────────────────
let _katex = null;
let _katexReady = false;

async function ensureKatex() {
  if (_katex) return _katex;
  try {
    _katex = await loadKatexRuntime();
    _katexReady = true;
    return _katex;
  } catch {
    return null;
  }
}

/** Render a LaTeX string to HTML. Returns null if KaTeX isn't loaded. */
function renderMath(expr, displayMode = false) {
  if (!_katex) return null;
  try {
    return _katex.renderToString(expr, { displayMode, throwOnError: false, output: 'html' });
  } catch {
    return null;
  }
}

function textContainsMath(text) {
  return /\$\$[^$]+\$\$|\$[^$\n]+\$/.test(text || '');
}

// ── Single-pass inline markdown tokenizer (with math support) ────────────────
// Order: display math → inline math → bold → italic → underscore italic → code → citation → link
const INLINE_RE =
  /(\$\$[^$]+\$\$)|(\$[^$\n]+\$)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(`[^`]+`)|(\[(\d+)\])|(\[([^\]]+)\]\(([^)]+)\))/g;
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function sanitizeMarkdownHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return null;

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://coursemapper.local';
    const parsed = new URL(href, base);
    if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

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
      // $$display math$$
      const expr = match[1].slice(2, -2).trim();
      const html = renderMath(expr, true);
      if (html) {
        result.push(
          <span key={key++} className="block my-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />,
        );
      } else {
        result.push(
          <code key={key++} className="px-1.5 py-0.5 rounded bg-violet-50 text-[12px] font-mono text-violet-700">
            {match[1]}
          </code>,
        );
      }
    } else if (match[2]) {
      // $inline math$
      const expr = match[2].slice(1, -1).trim();
      const html = renderMath(expr, false);
      if (html) {
        result.push(
          <span key={key++} className="inline-block align-middle" dangerouslySetInnerHTML={{ __html: html }} />,
        );
      } else {
        result.push(
          <code key={key++} className="px-1 py-0.5 rounded bg-violet-50 text-[12px] font-mono text-violet-700">
            {match[2]}
          </code>,
        );
      }
    } else if (match[3]) {
      // **bold**
      result.push(
        <strong key={key++} className="font-semibold text-slate-800">
          {match[3].slice(2, -2)}
        </strong>,
      );
    } else if (match[4]) {
      // *italic*
      result.push(
        <em key={key++} className="italic text-slate-600">
          {match[4].slice(1, -1)}
        </em>,
      );
    } else if (match[5]) {
      // _italic_
      result.push(
        <em key={key++} className="italic text-slate-600">
          {match[5].slice(1, -1)}
        </em>,
      );
    } else if (match[6]) {
      // `code`
      result.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">
          {match[6].slice(1, -1)}
        </code>,
      );
    } else if (match[7]) {
      // [N] citation badge
      result.push(
        <span
          key={key++}
          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold mx-0.5 px-1 align-text-bottom"
        >
          {match[8]}
        </span>,
      );
    } else if (match[9]) {
      // [text](url) link
      const href = sanitizeMarkdownHref(match[11]);
      result.push(
        href ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 hover:decoration-indigo-500 transition-colors"
          >
            {match[10]}
          </a>
        ) : (
          <span key={key++}>{match[10]}</span>
        ),
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
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  const displayLang = language || 'code';

  return (
    <div className="my-2 rounded-lg bg-slate-900 border border-slate-700/50 overflow-hidden">
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="px-3 py-2.5 overflow-x-auto">
        <code className="text-[12px] font-mono text-slate-200 leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

// ── Block-level markdown formatter ───────────────────────────────────────────
function FormattedContent({ text }) {
  const [, rerenderForMath] = useState(0);

  useEffect(() => {
    if (_katexReady || !textContainsMath(text)) return undefined;
    let active = true;
    ensureKatex().then(() => {
      if (active) rerenderForMath((version) => version + 1);
    });
    return () => {
      active = false;
    };
  }, [text]);

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Display math block: $$ on its own line
    if (line.trim().startsWith('$$') && !line.trim().endsWith('$$')) {
      const mathLines = [line.trim().slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        mathLines.push(lines[i].trim().replace(/\$\$$/, ''));
        i++;
      }
      const expr = mathLines.join('\n').trim();
      const html = renderMath(expr, true);
      if (html) {
        elements.push(
          <div
            key={elements.length}
            className="my-2 overflow-x-auto text-center"
            dangerouslySetInnerHTML={{ __html: html }}
          />,
        );
      } else {
        elements.push(
          <pre
            key={elements.length}
            className="my-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200/30 text-[12px] font-mono text-violet-700 overflow-x-auto"
          >
            {expr}
          </pre>,
        );
      }
      continue;
    }

    // Code blocks (triple backtick) with language detection
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || '';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      elements.push(<CodeBlock key={elements.length} code={codeLines.join('\n')} language={lang} />);
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
        .filter((l) => !/^\|[\s\-:|]+\|$/.test(l))
        .map((l) =>
          l
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim()),
        );
      if (rows.length > 0) {
        const [header, ...body] = rows;
        elements.push(
          <div key={elements.length} className="my-2 overflow-x-auto rounded-lg border border-slate-200/40">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50/80">
                  {header.map((h, j) => (
                    <th
                      key={j}
                      className="px-3 py-1.5 text-left font-semibold text-slate-700 border-b border-slate-200/40"
                    >
                      {formatInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-slate-100/40 last:border-0 hover:bg-indigo-50/30 transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-slate-600">
                        {formatInline(cell)}
                      </td>
                    ))}
                    {row.length < header.length &&
                      Array.from({ length: header.length - row.length }, (_, ci) => (
                        <td key={`pad-${ci}`} className="px-3 py-1.5" />
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
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
        </div>,
      );
      i++;
      continue;
    }

    // Headers
    if (line.match(/^#{1,3}\s/)) {
      const cleaned = line.replace(/^#{1,3}\s*/, '');
      elements.push(
        <div key={elements.length} className="font-bold text-slate-800 mt-2 mb-1">
          {formatInline(cleaned)}
        </div>,
      );
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
        </div>,
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
        </div>,
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

// ── Editable user message ────────────────────────────────────────────────────
function EditableUserMessage({ text, onEditSubmit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  function handleSubmit() {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setIsEditing(false);
    onEditSubmit(trimmed);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditText(text);
    }
  }

  if (isEditing) {
    return (
      <div className="flex justify-end animate-spring-in">
        <div className="max-w-[85%] w-full">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={Math.min(editText.split('\n').length + 1, 8)}
            className="w-full px-3.5 py-2.5 text-[13px] rounded-2xl rounded-br-md bg-white border-2 border-indigo-400 text-slate-800 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="flex justify-end gap-2 mt-1.5">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditText(text);
              }}
              className="px-3 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-3 py-1 text-[11px] font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-sm transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="chat-message-user" className="flex justify-end animate-spring-in group/usermsg">
      <div className="relative max-w-[85%]">
        <div className="px-3.5 py-2.5 text-[13px] rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-500 to-violet-500 text-white leading-relaxed shadow-lg shadow-indigo-500/10">
          {text}
        </div>
        {/* Edit button — appears on hover */}
        {onEditSubmit && (
          <button
            onClick={() => setIsEditing(true)}
            className="absolute -bottom-1 -right-1 opacity-0 group-hover/usermsg:opacity-100 transition-opacity p-1 rounded-md bg-white border border-slate-200/60 shadow-sm hover:bg-slate-50 text-slate-400 hover:text-slate-600"
            title="Edit message"
            aria-label="Edit message"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function MessageBubble({
  role,
  text,
  isLast,
  isStreaming,
  feedback,
  onRegenerate,
  onFeedback,
  onEditAndResend,
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  if (role === 'user') {
    return <EditableUserMessage text={text} onEditSubmit={onEditAndResend} />;
  }

  if (role === 'error') {
    // aria-live="assertive" + role="alert" so screen readers announce the
    // failure as soon as it arrives. Icon gives a visual cue for sighted users
    // that this is an error, not just a red-styled message.
    return (
      <div className="flex justify-start animate-spring-in" role="alert" aria-live="assertive">
        <div
          data-testid="chat-message-error"
          className="flex items-start gap-2 max-w-[85%] px-3.5 py-2.5 text-[13px] rounded-2xl rounded-bl-md bg-red-50/80 text-red-700 border border-red-200/40 leading-relaxed"
        >
          <svg
            className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
          <div className="min-w-0">{text}</div>
        </div>
      </div>
    );
  }

  // Assistant message
  const showActions = text && !isStreaming;

  return (
    <div data-testid="chat-message-assistant" className="flex justify-start animate-spring-in group/msg">
      <div className="flex gap-2.5 max-w-[90%]">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <div className="relative">
          <div className="px-3.5 py-2.5 text-[13px] rounded-2xl rounded-bl-md bg-white/70 border border-slate-200/40 shadow-glass text-slate-700 leading-relaxed">
            {text ? (
              <FormattedContent text={text} />
            ) : isLast && isStreaming ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            ) : null}
            {isLast && isStreaming && text && (
              <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-blink rounded-sm align-text-bottom" />
            )}
          </div>

          {/* Action bar — appears on hover below the message */}
          {showActions && (
            <div className="flex items-center gap-0.5 mt-1 ml-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                  title="Regenerate response"
                  aria-label="Regenerate response"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
              {onFeedback && <div className="w-px h-3 bg-slate-200/60 mx-0.5" />}
              {onFeedback && (
                <button
                  onClick={() => onFeedback(feedback === 'up' ? null : 'up')}
                  className={`p-1 rounded-md transition-colors ${feedback === 'up' ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'}`}
                  title="Good response"
                  aria-label="Good response"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill={feedback === 'up' ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z M4 15h0a2 2 0 01-2-2V9a2 2 0 012-2h0"
                    />
                  </svg>
                </button>
              )}
              {onFeedback && (
                <button
                  onClick={() => onFeedback(feedback === 'down' ? null : 'down')}
                  className={`p-1 rounded-md transition-colors ${feedback === 'down' ? 'text-red-500 bg-red-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'}`}
                  title="Poor response"
                  aria-label="Poor response"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill={feedback === 'down' ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z M20 2h0a2 2 0 012 2v6a2 2 0 01-2 2h0"
                    />
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
