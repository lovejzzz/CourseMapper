import React, { useState, useRef, useEffect } from 'react';
import { parseFiles } from '../lib/fileParser';
import { generateSuggestions } from '../lib/revisionSuggestions';
import { getProfile } from '../lib/professorProfile';

export default function RevisionChat({ onRevision, isRevising, savedMessages, onMessagesChange, placeholder, courseMap, isStopped, onResume }) {
  // Feature 8.3: load assistant persona for placeholder
  const assistantProfile = getProfile();
  const [messages, setMessages] = useState(savedMessages || []);
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [suggestions, setSuggestions] = useState([]); // Feature 6.2: suggestion chips
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync messages to parent for persistence — only when messages actually change,
  // not when the callback reference changes (avoids infinite-loop if parent isn't memoized)
  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; });
  useEffect(() => {
    if (onMessagesChangeRef.current) onMessagesChangeRef.current(messages);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // When generation/revision was stopped, ANY message sent via chat triggers resume.
    // The resume handlers already carry the partial output and original prompt —
    // they know how to continue from where they left off.
    if (isStopped && onResume && attachedFiles.length === 0) {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: 'Resuming…' }]);
      onResume();
      return;
    }

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

    setSuggestions([]); // clear old suggestions when new message sent
    try {
      const result = await onRevision(fullMessage, chatHistory);
      let assistantReply;
      if (result && result.chatReply) {
        assistantReply = result.chatReply;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: result.chatReply },
        ]);
      } else {
        assistantReply = 'Updated! Review the changes below.';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: assistantReply },
        ]);
      }
      // ── Feature 6.2: Generate suggestion chips after revision ──
      if (courseMap) {
        const chips = generateSuggestions(courseMap, assistantReply);
        setSuggestions(chips);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: `Failed: ${err.message}` },
      ]);
    }
  }

  // Handle suggestion chip click
  function handleSuggestionClick(text) {
    setInput(text);
    setSuggestions([]);
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
        <div className="max-h-48 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50/30">
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

      {/* ── Feature 6.2: Suggestion chips ── */}
      {suggestions.length > 0 && !isRevising && (
        <div className="px-4 pt-2 pb-1 flex flex-col gap-1.5">
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Try next:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(sug)}
                className="tactile text-[10px] font-medium text-indigo-600 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200/60 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition-all duration-150 text-left leading-snug"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
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
        <div className="px-4 pt-2 flex items-center gap-2 text-xs text-indigo-500">
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Parsing files...
        </div>
      )}

      {/* ── Compose area: textarea + action row ── */}
      <div className="px-4 py-3 space-y-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept=".doc,.docx,.pdf,.txt,.md,.csv,.rtf,.html,.htm,.xlsx,.xls,.ods,.ppt,.pptx,.odp,.odt,.epub,.key,.pages,.zip"
          onChange={(e) => { processFiles(e.target.files); e.target.value = ''; }}
        />
        {/* Rectangular textarea */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDragOver ? 'Drop files here...' : (placeholder || `Ask for revisions or drop files…`)}
          rows={3}
          className="input-glass w-full rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none resize-none leading-relaxed"
          disabled={isRevising}
        />
        {/* Bottom action row: attach on left, Send on right */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isRevising}
            className="tactile p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-200"
            title="Attach files"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachedFiles.length === 0) || isRevising}
            className={`tactile px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all duration-200 ${
              (input.trim() || attachedFiles.length > 0) && !isRevising
                ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-btn hover:brightness-110'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {isRevising ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending…
              </span>
            ) : 'Send'}
          </button>
        </div>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-400/50 rounded-squircle flex flex-col items-center justify-center pointer-events-none z-10 gap-1">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-sm font-semibold text-indigo-500">Drop files to attach</span>
          <span className="text-[10px] text-indigo-400/70">PDF, Word, Excel, PowerPoint, CSV, and more</span>
        </div>
      )}
    </div>
  );
}
