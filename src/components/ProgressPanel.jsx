import React, { useState, useRef, useEffect } from 'react';
import { parseFiles } from '../lib/fileParser';

const STEPS = [
  { key: 'parsing', label: 'Parsing uploaded files' },
  { key: 'sending', label: 'Sending to AI model' },
  { key: 'generating', label: 'AI is generating course map' },
  { key: 'examining', label: 'Examining course map for completeness' },
  { key: 'done', label: 'Course map ready' },
];

export default function ProgressPanel({
  currentStep, modelName, error,
  courseMap, onRevision, isRevising,
  streamDetail, streamProgress, onStop,
  isStopped, onResume, onClearAll,
  examChanges, retryInfo, onExport, onImport, onRetryExamine,
}) {
  if (!currentStep && !error) return null;

  const isDone = currentStep === 'done' && !isRevising;
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="glass rounded-squircle shadow-glass overflow-hidden animate-spring-scale">
      <div className="p-7 pb-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          Generation Progress
        </h2>

        {isDone ? (
          <div>
            <div className="flex items-center gap-3 py-1">
              <div className="w-7 h-7 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-medium text-emerald-700">Course map ready</span>
              <div className="ml-2 flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full w-full" />
              </div>
            </div>
            {examChanges && examChanges.length > 0 && (
              <ExamSummary changes={examChanges} onRetry={onRetryExamine} />
            )}
            {onExport && (
              <ExportBar onExport={onExport} onImport={onImport} />
            )}
          </div>
        ) : (
          <>
            <div className="space-y-0.5">
              {STEPS.map((step, idx) => {
                let state = 'pending';
                if (error && idx === currentIdx) state = 'error';
                else if (idx < currentIdx) state = 'done';
                else if (idx === currentIdx) state = 'active';

                return (
                  <div key={step.key} className="flex items-center gap-3 py-1.5">
                    <StepIcon state={state} />
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${
                        state === 'done' ? 'text-emerald-600'
                          : state === 'active' ? 'text-indigo-600'
                          : state === 'error' ? 'text-red-500'
                          : 'text-slate-300'
                      }`}>
                        {step.key === 'generating' && modelName
                          ? `${modelName} is generating course map`
                          : step.key === 'examining' && modelName
                          ? `${modelName} is examining course map`
                          : step.label}
                      </span>
                      {state === 'active' && (step.key === 'generating' || step.key === 'examining') && streamDetail && (
                        <span className="text-xs text-indigo-400 mt-0.5 truncate max-w-[320px]">
                          {streamDetail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isStopped && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${streamProgress || 50}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-amber-600 bg-amber-50/80 px-2.5 py-1 rounded-full flex-shrink-0">
                  Paused
                </span>
              </div>
            )}

            {isStopped && (
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  onClick={onResume}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-btn hover:brightness-110 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Resume
                </button>
                <button
                  onClick={onClearAll}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear All
                </button>
              </div>
            )}

            {retryInfo && (
              <div className="mt-3 flex items-center gap-2.5 px-3.5 py-2.5 rounded-squircle-xs bg-amber-50/80 border border-amber-200/50 animate-spring-in">
                <svg className="animate-spin w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs font-medium text-amber-700">
                  Connection lost — retrying ({retryInfo.attempt}/{retryInfo.max})...
                </span>
              </div>
            )}

            {!isStopped && currentStep && !error && currentStep !== 'done' && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${currentStep === 'generating' && streamProgress > 0 ? streamProgress : Math.min(((currentIdx + 1) / STEPS.length) * 100, 20)}%` }}
                  />
                </div>
                {onStop && (
                  <button
                    onClick={onStop}
                    className="tactile flex items-center gap-1.5 px-3.5 py-1.5 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200 flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isDone && courseMap && (
        <RevisionChat onRevision={onRevision} isRevising={isRevising} />
      )}
    </div>
  );
}

function ExamSummary({ changes, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  if (!changes || changes.length === 0) return null;

  // Detect failure marker
  const isFailed = changes.length === 1 && changes[0].startsWith('__EXAM_FAILED__:');
  const failReason = isFailed ? changes[0].replace('__EXAM_FAILED__:', '') : null;

  if (isFailed) {
    return (
      <div className="mt-3 ml-10 animate-spring-in flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50/80 px-3 py-1.5 rounded-squircle-xs border border-amber-200/50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Examination skipped{failReason ? `: ${failReason}` : ''}
        </span>
        {onRetry && (
          <button
            onClick={async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }}
            disabled={retrying}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50/80 px-3 py-1.5 rounded-squircle-xs border border-indigo-200/50 hover:bg-indigo-100/80 transition-colors duration-150 disabled:opacity-50"
          >
            {retrying ? (
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 ml-10 animate-spring-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50/80 px-3 py-1.5 rounded-squircle-xs border border-emerald-200/50 hover:bg-emerald-100/80 transition-colors duration-150"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Examination completed. All {changes.length} fixed
        <svg className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-2 text-[11px] text-emerald-800 bg-emerald-50/50 rounded-squircle-xs p-3 border border-emerald-100/50 max-h-60 overflow-y-auto">
          {changes.map((c, i) => {
            const colonIdx = c.indexOf(': ');
            const hasReason = colonIdx > 0 && colonIdx < 60;
            const location = hasReason ? c.slice(0, colonIdx) : c;
            const reason = hasReason ? c.slice(colonIdx + 2) : null;
            return (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
                <span>
                  <span className="font-semibold">{location}</span>
                  {reason && <span className="text-emerald-600 block mt-0.5">{reason}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExportBar({ onExport, onImport }) {
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState(null);
  const importRef = useRef(null);

  async function handleExport(format) {
    setExporting(format);
    try {
      await onExport(format);
    } finally {
      setTimeout(() => setExporting(null), 500);
    }
  }

  function handleImportChange(e) {
    const file = e.target.files?.[0];
    if (file && onImport) onImport(file);
    e.target.value = '';
  }

  return (
    <div className="mt-4 ml-10 flex items-center gap-3 animate-spring-in">
      <button
        onClick={() => handleExport('xlsx')}
        disabled={!!exporting}
        className="tactile flex items-center gap-2 px-5 py-2.5 rounded-squircle-xs font-semibold text-white text-sm bg-gradient-to-r from-emerald-500 to-green-600 shadow-btn-green hover:brightness-110 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {exporting === 'xlsx' ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        {exporting === 'xlsx' ? 'Exporting...' : 'Export .xlsx'}
      </button>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          disabled={!!exporting}
          className="tactile flex items-center gap-1 px-3 py-2.5 rounded-squircle-xs text-xs font-semibold text-slate-500 bg-white/60 border border-slate-200/50 hover:bg-white/80 shadow-glass transition-all duration-200"
          title="More export formats"
        >
          Other formats
          <svg className={`w-3 h-3 transition-transform duration-200 ${showMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
            <div className="absolute top-full left-0 mt-1.5 z-30 glass rounded-squircle-xs shadow-glass-lg border border-white/30 py-1 min-w-[160px] animate-spring-in">
              <button onClick={() => { handleExport('pdf'); setShowMenu(false); }} className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-indigo-50/50 flex items-center gap-2.5 transition-colors">
                <span className="w-6 h-6 rounded-md bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-red-600">PDF</span>
                </span>
                <span className="font-medium">{exporting === 'pdf' ? 'Exporting...' : 'PDF (.pdf)'}</span>
              </button>
              <button onClick={() => { handleExport('csv'); setShowMenu(false); }} className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-indigo-50/50 flex items-center gap-2.5 transition-colors">
                <span className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-blue-600">CSV</span>
                </span>
                <span className="font-medium">{exporting === 'csv' ? 'Exporting...' : 'CSV (.csv)'}</span>
              </button>
            </div>
          </>
        )}
      </div>
      {onImport && (
        <>
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportChange}
            className="hidden"
          />
          <button
            onClick={() => importRef.current?.click()}
            className="tactile flex items-center gap-1.5 px-3 py-2.5 rounded-squircle-xs text-xs font-semibold text-slate-500 bg-white/60 border border-slate-200/50 hover:bg-white/80 shadow-glass transition-all duration-200"
            title="Import course map from .xlsx or .csv"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>
        </>
      )}
    </div>
  );
}

function RevisionChat({ onRevision, isRevising }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function processFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setIsParsing(true);
    try {
      const parsed = await parseFiles(files);
      const successful = parsed.filter(f => f.text);
      if (successful.length > 0) {
        setAttachedFiles(prev => [...prev, ...successful]);
      }
      const failed = parsed.filter(f => f.error);
      if (failed.length > 0) {
        setMessages(prev => [...prev, {
          role: 'error',
          text: `Could not parse: ${failed.map(f => f.name).join(', ')}`,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', text: `File parse error: ${err.message}` }]);
    }
    setIsParsing(false);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(e.dataTransfer.files);
  }

  function removeAttached(idx) {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isRevising) return;

    let fullMessage = text;
    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map(f => `=== Attached File: ${f.name} ===\n${f.text}`)
        .join('\n\n');
      fullMessage = text
        ? `${text}\n\nThe user also attached these additional reference files:\n\n${fileContents}`
        : `Please incorporate the following additional reference files into the course map:\n\n${fileContents}`;
    }

    const displayText = text + (attachedFiles.length > 0
      ? ` [+${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}]`
      : '');

    setInput('');
    setAttachedFiles([]);
    const updatedMessages = [...messages, { role: 'user', text: displayText }];
    setMessages(updatedMessages);

    // Pass chat history (last 10 user/assistant messages) so AI remembers context
    const chatHistory = updatedMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10);

    try {
      const result = await onRevision(fullMessage, chatHistory);
      if (result && result.chatReply) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: result.chatReply },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Updated! Review the changes below.' },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: `Failed: ${err.message}` },
      ]);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className={`border-t transition-colors duration-200 ${isDragOver ? 'border-indigo-400 bg-indigo-50/20' : 'border-white/20'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {messages.length > 0 && (
        <div className="max-h-48 overflow-y-auto px-5 py-3 space-y-2 bg-slate-50/30">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-spring-in`}>
              <div className={`px-3.5 py-2 rounded-squircle-xs text-xs max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-btn'
                  : msg.role === 'error'
                  ? 'bg-red-50/80 text-red-600 border border-red-200/40'
                  : 'bg-emerald-50/80 text-emerald-700 border border-emerald-200/40'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isRevising && (
            <div className="flex items-center gap-2 text-xs text-indigo-500 px-1">
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Revising...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="px-5 pt-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50/80 text-indigo-700 text-[10px] font-semibold rounded-full border border-indigo-200/40">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {f.name}
              <button onClick={() => removeAttached(i)} className="ml-0.5 hover:text-red-500 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {isParsing && (
        <div className="px-5 pt-2 flex items-center gap-2 text-xs text-indigo-500">
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Parsing files...
        </div>
      )}

      <div className="px-5 py-3.5 flex gap-2.5">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          onChange={(e) => { processFiles(e.target.files); e.target.value = ''; }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isRevising}
          className="tactile p-2.5 rounded-squircle-xs text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-200 flex-shrink-0"
          title="Attach files"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDragOver ? 'Drop files here...' : 'Ask for revisions or drop files...'}
          className="input-glass flex-1 rounded-squircle-xs px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none"
          disabled={isRevising}
        />
        <button
          onClick={handleSend}
          disabled={(!input.trim() && attachedFiles.length === 0) || isRevising}
          className={`tactile px-5 py-2.5 rounded-squircle-xs text-sm font-semibold text-white transition-all duration-200 flex-shrink-0 ${
            (input.trim() || attachedFiles.length > 0) && !isRevising
              ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-btn hover:shadow-btn-hover hover:brightness-110'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          Send
        </button>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-400/50 rounded-squircle flex items-center justify-center pointer-events-none z-10">
          <span className="text-sm font-semibold text-indigo-500">Drop files to attach</span>
        </div>
      )}
    </div>
  );
}

function StepIcon({ state }) {
  if (state === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === 'active') {
    return (
      <div className="w-6 h-6 rounded-full bg-indigo-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="animate-spin w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-slate-100/60 flex items-center justify-center flex-shrink-0">
      <div className="w-2 h-2 rounded-full bg-slate-200" />
    </div>
  );
}
