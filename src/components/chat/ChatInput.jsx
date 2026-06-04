import React, { useState, useRef, useMemo } from 'react';
import { resolveLabel } from './constants';
import {
  buildAgentCommandItems,
  CommandIcon,
  filterAgentCommandItems,
  findAgentCommandByText,
  normalizeAgentCommandQuery,
} from './AgentCommandStrip';

function getCourseLessonCount(courseMap) {
  return Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
}

export function buildLessonScopeCommandFromText(text = '', courseMap = null) {
  const normalized = normalizeAgentCommandQuery(text).replace(/[.!?]+$/g, '');
  if (!normalized) return null;

  const allMatch = normalized.match(
    /^(?:(?:change|set|switch|update|adjust)\s+)?(?:the\s+)?(?:course\s+|package\s+|lesson\s+)?scope\s+(?:to\s+|for\s+)?all(?:\s+lessons?)?$/,
  );
  const countMatch =
    normalized.match(
      /^(?:change|set|switch|update|adjust)\s+(?:the\s+)?(?:course\s+|package\s+|lesson\s+)?scope\s+(?:to\s+|for\s+)?(\d{1,2})\s*(?:lessons?|weeks?)?$/,
    ) ||
    normalized.match(/^scope\s+(?:to\s+|for\s+)?(\d{1,2})\s*(?:lessons?|weeks?)?$/) ||
    normalized.match(
      /^(?:change|set|make|expand|extend)\s+(?:the\s+)?(?:course|course\s+map|map)\s+(?:to\s+|into\s+)?(\d{1,2})\s*(?:lessons?|weeks?)$/,
    );

  const currentLessonCount = getCourseLessonCount(courseMap);
  if (allMatch) {
    return {
      id: 'set-lesson-scope',
      icon: 'list',
      label: 'Scope',
      displayText: 'Use all lessons',
      title: currentLessonCount > 0 ? `Use all ${currentLessonCount} lessons` : 'Use the full course scope',
      targetLessonCount: currentLessonCount || null,
      requestedScope: 'all',
      currentLessonCount,
      prompt: '',
    };
  }

  const targetLessonCount = Number(countMatch?.[1]);
  if (!Number.isInteger(targetLessonCount) || targetLessonCount < 1) return null;
  const expandsCourse = currentLessonCount > 0 && targetLessonCount > currentLessonCount;
  return {
    id: 'set-lesson-scope',
    icon: 'list',
    label: 'Scope',
    displayText: `Change scope to ${targetLessonCount} lesson${targetLessonCount === 1 ? '' : 's'}`,
    title: expandsCourse
      ? `Expand course from ${currentLessonCount} to ${targetLessonCount} lessons`
      : currentLessonCount > 0
        ? `Use first ${targetLessonCount} of ${currentLessonCount} lessons`
        : `Set course scope to ${targetLessonCount} lessons`,
    targetLessonCount,
    requestedScope: 'count',
    currentLessonCount,
    prompt: '',
  };
}

/**
 * ChatInput — clean textarea with file drop and send button.
 * Routing is automatic based on context; confirmations happen in conversation.
 */
export default function ChatInput({
  onSend,
  isStreaming,
  isRevising,
  onStop,
  attachedFiles,
  onProcessFiles,
  onRemoveAttached,
  isParsing,
  activeTab,
  courseMap,
  isStopped,
  hasPendingProposal,
  isAgentMode,
  isAgentProviderReady = true,
  agentDryRun = false,
  onConfigureAI,
  onAgentCommand,
  syncFeatureCount = 0,
  onUndo,
  canUndo,
}) {
  const [input, setInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const fileInputRef = useRef(null);
  const lastSendTimeRef = useRef(0);
  const cooldownTimerRef = useRef(null);

  // Cooldown in ms between chat sends to prevent rapid-fire API calls
  const SEND_COOLDOWN_MS = 1500;

  const isDeliverableTab = activeTab && activeTab !== 'courseMap';
  const delivLabel = isDeliverableTab ? resolveLabel(activeTab) : null;
  const targetLabel = isAgentMode ? delivLabel || 'Deliverables' : 'Course map';
  const agentUnavailable = isAgentMode && !isAgentProviderReady;
  const busy = isStreaming || isRevising;
  const agentCommandItems = useMemo(
    () =>
      isAgentMode
        ? buildAgentCommandItems({
            activeTab,
            agentDryRun,
            syncFeatureCount,
            localOnly: !isAgentProviderReady,
            canUndo,
          })
        : [],
    [activeTab, agentDryRun, isAgentMode, isAgentProviderReady, syncFeatureCount, canUndo],
  );
  const slashInput = input.trimStart();
  const slashQuery = slashInput.startsWith('/') ? slashInput.slice(1).trim().toLowerCase() : '';
  const filteredAgentCommandItems = slashInput.startsWith('/')
    ? filterAgentCommandItems(agentCommandItems, slashQuery)
    : [];
  const suggestedAgentCommands = agentCommandItems.filter((item) =>
    ['agent-help', 'finish-package', 'audit-quality', 'plan-next'].includes(item.id),
  );
  const showSlashCommands = isAgentMode && !busy && slashInput.startsWith('/');
  const canRunSlashCommand = showSlashCommands && filteredAgentCommandItems.length > 0;
  const hasUnknownSlashCommand = showSlashCommands && filteredAgentCommandItems.length === 0;
  const selectedSlashCommand = canRunSlashCommand
    ? filteredAgentCommandItems[Math.min(slashSelectedIndex, filteredAgentCommandItems.length - 1)]
    : null;
  const typedScopeCommand =
    isAgentMode && !showSlashCommands && !busy ? buildLessonScopeCommandFromText(input, courseMap) : null;
  const typedAgentCommand =
    typedScopeCommand ||
    (isAgentMode && !showSlashCommands && !busy ? findAgentCommandByText(agentCommandItems, input) : null);
  const previewAgentCommand = typedAgentCommand && !showSlashCommands ? typedAgentCommand : null;
  const stateLabel = agentUnavailable ? 'Configure AI' : isAgentMode ? 'Conversation' : 'Ask';

  function handleAgentCommandSelect(item) {
    if (!item || isStreaming || isRevising) return;
    if (item.id === 'configure-agent') {
      onConfigureAI?.();
    } else {
      onAgentCommand?.(item);
    }
    setInput('');
  }

  function handleKeyDown(e) {
    if (showSlashCommands && filteredAgentCommandItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex((value) => (value + 1) % filteredAgentCommandItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(
          (value) => (value - 1 + filteredAgentCommandItems.length) % filteredAgentCommandItems.length,
        );
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setSlashSelectedIndex(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setSlashSelectedIndex(filteredAgentCommandItems.length - 1);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (selectedSlashCommand) {
        handleAgentCommandSelect(selectedSlashCommand);
        return;
      }
      handleSend();
    }
    // Escape clears input
    if (e.key === 'Escape' && input) {
      e.preventDefault();
      setInput('');
    }
  }

  function startCooldown() {
    // Visible "just a moment" window instead of silently dropping the send.
    setIsCoolingDown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => setIsCoolingDown(false), SEND_COOLDOWN_MS);
  }

  function handleSend() {
    if (canRunSlashCommand) {
      handleAgentCommandSelect(filteredAgentCommandItems[0]);
      return;
    }
    if (hasUnknownSlashCommand) return;
    if (typedAgentCommand) {
      handleAgentCommandSelect(typedAgentCommand);
      return;
    }
    if (agentUnavailable) return;
    if ((!input.trim() && (!attachedFiles || attachedFiles.length === 0)) || isStreaming || isRevising) return;
    // Rate-limit: enforce cooldown between sends. If we're still inside the
    // window, surface that visually (button goes dim + "Sending…" hint) rather
    // than silently discarding the send.
    const now = Date.now();
    if (now - lastSendTimeRef.current < SEND_COOLDOWN_MS) {
      startCooldown();
      return;
    }
    lastSendTimeRef.current = now;
    startCooldown();
    onSend(input);
    setInput('');
  }

  function handlePackageAction() {
    const now = Date.now();
    if (now - lastSendTimeRef.current < SEND_COOLDOWN_MS) {
      startCooldown();
      return;
    }
    lastSendTimeRef.current = now;
    startCooldown();

    const packageCommand = agentCommandItems.find((item) => item.id === 'finish-package');
    if (packageCommand && onAgentCommand) {
      handleAgentCommandSelect(packageCommand);
      return;
    }

    onSend(reviewPrompt);
    setInput('');
  }

  React.useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    },
    [],
  );

  React.useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashQuery, showSlashCommands, filteredAgentCommandItems.length]);

  // Context-aware placeholder — keeps tone consistent: short, direct,
  // second-person, no "ask me to…" chatbot-speak.
  const placeholder = isDragOver
    ? 'Drop files here…'
    : hasPendingProposal
      ? 'Pick an option above, or type something else…'
      : !courseMap
        ? 'Ask a question about your course…'
        : agentUnavailable
          ? 'Configure AI to chat with the agent…'
          : isAgentMode
            ? delivLabel
              ? `Tell the agent what to change in ${delivLabel}…`
              : 'Tell the agent what to change in your deliverables…'
            : 'Ask a question or request changes…';

  const reviewPrompt = [
    'Finish this course package until it is ready to download.',
    'Run finalize_package first.',
    'If localized weak sections remain, call retry_package_weak_spots, then finalize_package again.',
    'Apply safe deterministic and concrete content fixes directly.',
    'Do not present the package as ready unless readiness, classroom readiness, validation, and export verification are clean.',
    'Only ask the user for decisions that require instructor judgment.',
    'Finish with a concise package handoff that says either Ready to download or lists the remaining instructor decisions.',
  ].join(' ');
  const sendDisabled =
    (!canRunSlashCommand &&
      (hasUnknownSlashCommand ||
        (!typedAgentCommand && agentUnavailable) ||
        (!input.trim() && (!attachedFiles || attachedFiles.length === 0)))) ||
    isCoolingDown;
  const sendAriaLabel = isCoolingDown
    ? 'Sending — please wait'
    : hasUnknownSlashCommand
      ? 'Choose a valid command'
      : canRunSlashCommand || typedAgentCommand
        ? 'Run command'
        : 'Send message';
  const sendTitle = isCoolingDown
    ? 'Sending — give it a moment'
    : hasUnknownSlashCommand
      ? 'No matching slash command'
      : canRunSlashCommand || typedAgentCommand
        ? 'Run command (Enter)'
        : 'Send (Enter)';

  return (
    <div
      className={`relative flex-shrink-0 border-t transition-colors duration-200 ${isDragOver ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200/40'}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        onProcessFiles(e.dataTransfer.files);
      }}
    >
      {/* Attached files */}
      {attachedFiles && attachedFiles.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50/80 text-indigo-700 text-[11px] font-semibold rounded-full border border-indigo-200/40"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              {f.name}
              <button
                onClick={() => onRemoveAttached(i)}
                className="ml-0.5 hover:text-red-500 transition-colors"
                aria-label={`Remove ${f.name}`}
              >
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
      <div className="px-4 pt-3 pb-4 space-y-2.5">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept=".doc,.docx,.pdf,.txt,.md,.csv,.rtf,.html,.htm,.xlsx,.xls,.ods,.ppt,.pptx,.odp,.odt,.epub,.key,.pages,.zip"
          onChange={(e) => {
            onProcessFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
          <span className="truncate rounded-full border border-slate-200/70 bg-white/60 px-2 py-0.5 font-semibold text-slate-500">
            {targetLabel}
          </span>
          <span className="shrink-0 rounded-full border border-slate-200/70 bg-white/60 px-2 py-0.5 font-semibold text-slate-500">
            {stateLabel}
          </span>
        </div>

        <div className="relative">
          {agentUnavailable && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2">
              <span className="text-[11px] font-medium leading-snug text-amber-700">
                Local Audit and Plan are available above. Connect AI for chat and model-based edits.
              </span>
              {onConfigureAI && (
                <button
                  type="button"
                  onClick={onConfigureAI}
                  className="tactile shrink-0 rounded-lg border border-amber-200/80 bg-white/80 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100"
                >
                  Configure
                </button>
              )}
            </div>
          )}
          {previewAgentCommand && (
            <button
              type="button"
              data-testid="agent-command-preview"
              onClick={() => handleAgentCommandSelect(previewAgentCommand)}
              className="mb-2 flex w-full min-w-0 items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-2.5 py-2 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-100/80 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-indigo-100 bg-white/70 text-indigo-600">
                <CommandIcon icon={previewAgentCommand.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold text-indigo-700">
                  {previewAgentCommand.displayText}
                </span>
                <span className="block truncate text-[10px] font-medium text-indigo-500">
                  {previewAgentCommand.title}
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-indigo-200/70 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                Run
              </span>
            </button>
          )}
          {showSlashCommands && (
            <div
              data-testid="agent-slash-command-palette"
              id="agent-slash-command-palette"
              role="listbox"
              className="mb-2 max-h-40 overflow-y-auto rounded-lg border border-indigo-100 bg-white/95 p-1.5 shadow-lg shadow-indigo-950/10"
            >
              {filteredAgentCommandItems.length > 0 ? (
                filteredAgentCommandItems.map((item, index) => {
                  const isSelected = index === slashSelectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`agent-slash-command-option-${item.id}`}
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`agent-slash-command-${item.id}`}
                      onClick={() => handleAgentCommandSelect(item)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors focus:outline-none ${
                        isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-indigo-50 focus:bg-indigo-50'
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-indigo-100 bg-indigo-50 text-indigo-600">
                        <CommandIcon icon={item.icon} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-bold text-slate-700">{item.displayText}</span>
                        <span className="block truncate text-[10px] font-medium text-slate-500">{item.title}</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div
                  data-testid="agent-slash-command-empty"
                  className="rounded-md px-2.5 py-2 text-[11px] font-semibold text-slate-400"
                >
                  <p>No matching command</p>
                  {suggestedAgentCommands.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {suggestedAgentCommands.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`agent-slash-command-suggestion-${item.id}`}
                          onClick={() => handleAgentCommandSelect(item)}
                          className="rounded-full border border-slate-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          /{item.aliases?.[0] || item.label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-controls={showSlashCommands ? 'agent-slash-command-palette' : undefined}
              aria-activedescendant={
                selectedSlashCommand ? `agent-slash-command-option-${selectedSlashCommand.id}` : undefined
              }
              placeholder={placeholder}
              rows={2}
              className="input-glass min-h-[74px] w-full resize-none rounded-xl px-3 pb-8 pr-11 pt-2.5 text-[13px] leading-relaxed text-slate-700 focus:outline-none"
              disabled={busy}
            />
            <div className="absolute bottom-2 right-2">
              {busy ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="tactile rounded-lg px-2.5 py-1 text-[11px] font-semibold text-red-500 transition-all hover:bg-red-50"
                  aria-label="Stop generation"
                >
                  {isRevising ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Working...
                    </span>
                  ) : (
                    'Stop'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={sendDisabled}
                  className={`tactile rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 p-1.5 text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed ${
                    isCoolingDown ? 'opacity-60' : 'disabled:opacity-30'
                  }`}
                  aria-label={sendAriaLabel}
                  title={sendTitle}
                >
                  {isCoolingDown ? (
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                      />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
          {/* Compose actions */}
          <div className="mt-1.5 flex min-h-7 items-center gap-2 px-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {/* Attach button */}
              {courseMap && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="tactile p-1 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all"
                  title="Attach files"
                  aria-label="Attach files"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                </button>
              )}

              {input.length > 100 && (
                <span className="text-[10px] font-medium text-slate-400 select-none">{input.length} chars</span>
              )}

              {/* Package action button. */}
              {isAgentMode && !agentUnavailable && !busy && (
                <button
                  onClick={handlePackageAction}
                  disabled={isCoolingDown}
                  className="tactile flex items-center gap-1 rounded-lg border border-emerald-200/70 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-sm transition-all duration-200 hover:bg-emerald-100/80 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Finish, repair, and verify the course package before export"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                  Finish package
                </button>
              )}

              {agentUnavailable && onConfigureAI && (
                <button
                  type="button"
                  onClick={onConfigureAI}
                  className="tactile flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-amber-700 hover:bg-amber-50/80 transition-all duration-200"
                  title="Configure AI to use the agent"
                >
                  Configure AI
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"
                    />
                  </svg>
                  Undo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-400/50 rounded-xl flex flex-col items-center justify-center pointer-events-none z-10 gap-1">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
          <span className="text-sm font-semibold text-indigo-500">Drop files to attach</span>
        </div>
      )}
    </div>
  );
}
