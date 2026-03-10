import React, { useState, useRef } from 'react';
import { resolveLabel } from './constants';

/**
 * ChatInput — clean textarea with file drop and send button.
 * No mode toggle — routing is automatic based on context.
 */
export default function ChatInput({
  onSend, isStreaming, isRevising, onStop,
  attachedFiles, onProcessFiles, onRemoveAttached, isParsing,
  activeTab, courseMap,
  isStopped,
  hasPendingProposal,
  isAgentMode,
  onUndo, canUndo,
}) {
  const [input, setInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const isDeliverableTab = activeTab && activeTab !== 'courseMap';
  const delivLabel = isDeliverableTab ? resolveLabel(activeTab) : null;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Escape clears input
    if (e.key === 'Escape' && input) {
      e.preventDefault();
      setInput('');
    }
  }

  function handleSend() {
    if ((!input.trim() && (!attachedFiles || attachedFiles.length === 0)) || isStreaming || isRevising) return;
    onSend(input);
    setInput('');
  }

  // Context-aware placeholder
  const placeholder = isDragOver
    ? 'Drop files here...'
    : hasPendingProposal
    ? 'Pick an option above, or type something else...'
    : !courseMap
    ? 'Ask a question...'
    : isAgentMode
    ? (delivLabel ? `Ask about ${delivLabel}, or request changes...` : 'Ask me to add, edit, or review items...')
    : 'Ask a question or request changes...';

  const busy = isStreaming || isRevising;

  return (
    <div
      className={`border-t transition-colors duration-200 relative ${isDragOver ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200/40'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onProcessFiles(e.dataTransfer.files); }}
    >
      {/* Attached files */}
      {attachedFiles && attachedFiles.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50/80 text-indigo-700 text-[11px] font-semibold rounded-full border border-indigo-200/40">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {f.name}
              <button onClick={() => onRemoveAttached(i)} className="ml-0.5 hover:text-red-500 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {isParsing && (
        <div className="px-4 pt-2 flex items-center gap-2 text-[12px] text-indigo-500">
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Parsing files...
        </div>
      )}

      {/* Compose area */}
      <div className="px-4 py-3 space-y-2.5">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept=".doc,.docx,.pdf,.txt,.md,.csv,.rtf,.html,.htm,.xlsx,.xls,.ods,.ppt,.pptx,.odp,.odt,.epub,.key,.pages,.zip"
          onChange={(e) => { onProcessFiles(e.target.files); e.target.value = ''; }}
        />

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="input-glass w-full rounded-xl px-3 pt-2.5 pb-8 text-[13px] text-slate-700 focus:outline-none resize-none leading-relaxed"
            disabled={busy}
          />
          {/* Bottom bar inside textarea area */}
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {/* Attach button */}
              {courseMap && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="tactile p-1 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all"
                  title="Attach files"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
              )}

              {/* Agent mode indicator + input length */}
              {isAgentMode && (
                <span className="text-[10px] font-semibold text-violet-500/70 flex items-center gap-1 select-none">
                  <span className="text-[8px]">✦</span>
                  Agent
                  {input.length > 100 && (
                    <span className="text-slate-400 font-normal ml-1">{input.length} chars</span>
                  )}
                </span>
              )}

              {/* Review Course button — AI scans content and suggests improvements */}
              {isAgentMode && !busy && (
                <button
                  onClick={() => {
                    onSend('Review my course. Run validate_course, then scan all generated deliverables for: (1) weak learning objectives that use lower Bloom\'s verbs like "understand" or "know" — suggest upgrades, (2) misalignment between assessments and stated objectives, (3) missing or vague content in any deliverable, (4) readability issues. For each issue found, explain what\'s wrong and propose a specific fix using edit_deliverables or edit_course_map.');
                    setInput('');
                  }}
                  className="tactile flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-emerald-600 hover:bg-emerald-50/60 hover:text-emerald-700 transition-all duration-200"
                  title="AI reviews your course for alignment, readability, and completeness"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Review
                </button>
              )}

              {/* Undo button */}
              {canUndo && onUndo && (
                <button
                  onClick={onUndo}
                  className="tactile flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all duration-200"
                  title="Undo last change"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                  </svg>
                  Undo
                </button>
              )}
            </div>

            {/* Send / Stop */}
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-red-500 hover:bg-red-50 transition-all"
              >
                {isRevising ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Working...
                  </span>
                ) : 'Stop'}
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && (!attachedFiles || attachedFiles.length === 0)}
                className="tactile p-1.5 rounded-lg text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-sm hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-400/50 rounded-xl flex flex-col items-center justify-center pointer-events-none z-10 gap-1">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-sm font-semibold text-indigo-500">Drop files to attach</span>
        </div>
      )}
    </div>
  );
}
